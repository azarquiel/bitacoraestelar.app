<?php
declare(strict_types=1);

// Servimos gzip con Content-Encoding + Content-Length manuales; evita que el SAPI
// (zlib.output_compression) recomprima la salida y la corrompa.
@ini_set('zlib.output_compression', 'Off');

/* ════════════════════════════════════════════════════════════════════════════
   PROXY DE GAIA CON CACHÉ LRU EN DISCO  (respaldo servidor del simulador)
   ────────────────────────────────────────────────────────────────────────────
   Recibe ra/dec/rad/mag, consulta Gaia DR3 (CDS/VizieR con failover a GAVO) y
   cachea la respuesta en disco. Sirve para esquivar CORS (p. ej. el archivo ESA)
   y para descargar a los TAP públicos: una vez cacheada una región, se sirve del
   disco sin volver a preguntar.

   Características:
     · Caché LRU en disco con tope de tamaño (500 MB). Las respuestas son
       inmutables (Gaia DR3 es un catálogo fijo), así que no caducan: el LRU por
       tamaño acota el disco.
     · Cuantización de ra/dec/rad/mag → más aciertos de caché (regiones cercanas
       comparten entrada).
     · Compresión gzip en disco; negociación por Accept-Encoding (sirve gzip si el
       cliente lo acepta, si no descomprime).
     · Cabeceras ETag + Cache-Control; responde 304 ante If-None-Match.
     · Timeouts de conexión y de petición separados.
     · Bloqueo de concurrencia (flock) para evitar estampidas y escrituras a medias.
     · Limpieza LRU incremental (no en cada petición; acotada por pasada).
     · Creación automática del directorio de caché.

   Endpoints:
     GET ?ra=..&dec=..&rad=..&mag=..   → datos Gaia (JSON)
   ════════════════════════════════════════════════════════════════════════════ */

// ───────────────────────────── CONFIGURACIÓN ─────────────────────────────────
const GAIA_CACHE_DIR       = __DIR__ . '/cache_gaia';
const GAIA_CACHE_MAX_BYTES = 500 * 1024 * 1024;   // objetivo de tamaño de la caché (500 MB, best-effort: se aplica en la limpieza incremental)
const GAIA_CACHE_LOWWATER  = 0.90;                // tras evict, bajar hasta el 90% del tope
const GAIA_CONNECT_TIMEOUT = 8;                   // s: timeout de CONEXIÓN a los TAP
/* Timeout TOTAL de la petición al TAP. Era 25 s, y en campos hacia el bulbo
   (M6, M7) una consulta legítima tarda ~23 s: se abortaba a un pelo del final,
   se TIRABA el trabajo ya hecho, se probaba el segundo proveedor -que tarda lo
   mismo y responde "Query timed out"- y el usuario recibía un 502. Cortar ahí
   es el peor negocio posible: la respuesta es INMUTABLE y queda cacheada para
   siempre, así que pagar el minuto una vez vale infinitamente más que fallar en
   25 s y volver a empezar. El cliente reintenta una vez, así que con 25 s el
   observador ya esperaba ~56 s para acabar SIN datos. */
const GAIA_REQUEST_TIMEOUT = 55;                  // s: timeout TOTAL de la petición
const GAIA_QUANT_RADEC     = 0.001;               // ° : cuantización del centro (~3,6")
const GAIA_QUANT_RAD       = 0.01;                // ° : cuantización del radio (se redondea ↑)
const GAIA_QUANT_MAG       = 0.5;                 // mag: cuantización del límite (se redondea ↑)
const GAIA_MAX_ROWS        = 40000;              // TOP N de la consulta SEGURA (campos densos)
/* Techo COMPUTACIONAL de la sonda sin ORDER BY. No es un parámetro físico: el
   límite físico es el `mag` que manda el cliente (magConsultaGaia). Referencia
   medida (2026-08): ~199 000 filas sin ORDER BY llegan en ~2 s del TAP de CDS. */
const GAIA_TECHO_FILAS     = 200000;
const GAIA_MAX_RAD         = 4.5;                // ° : radio máximo aceptado (6° de lado + margen)
const GAIA_MAX_MAG         = 20.0;               // mag: límite máximo aceptado (= GAIA_MAG_TOPE en bitacora-gaia-render.js)
const GAIA_CLEANUP_EVERY   = 300;                // s: limpieza como mucho cada 5 min
const GAIA_CLEANUP_MAX_DEL = 300;                // nº máx. de entradas a borrar por pasada (incremental)
const GAIA_CLIENT_MAXAGE   = 86400;              // s: Cache-Control max-age que se anuncia al navegador
const GAIA_ORPHAN_TTL      = 3600;               // s: edad mínima de un .lock/.tmp huérfano para retirarlo

// ───────────────────────── FUNCIONES PURAS (testables) ───────────────────────

/**
 * Cuantiza los parámetros para agrupar consultas cercanas en la misma entrada de
 * caché. El CENTRO se redondea (desplazamiento ≤ medio cuanto, despreciable frente
 * al radio). El RADIO y la MAGNITUD se redondean HACIA ARRIBA, para que la región
 * cacheada sea siempre un SUPERCONJUNTO de la pedida (el cliente recorta de más).
 * Devuelve [ra, dec, rad, mag] cuantizados.
 */
function gaia_cuantizar(float $ra, float $dec, float $rad, float $mag): array {
    $q_centro = static fn(float $x): float => round($x / GAIA_QUANT_RADEC) * GAIA_QUANT_RADEC;
    // El epsilon evita que un valor ya múltiplo del cuanto (p. ej. 0.36) salte al
    // siguiente por el error de coma flotante de ceil() → mantiene la idempotencia.
    $q_arriba = static fn(float $x, float $q): float => ceil($x / $q - 1e-9) * $q;
    return [
        round($q_centro($ra), 3),
        round($q_centro($dec), 3),
        round($q_arriba($rad, GAIA_QUANT_RAD), 2),
        round($q_arriba($mag, GAIA_QUANT_MAG), 2),
    ];
}

/* La política de caché LRU (qué se evicta y cuándo se limpia) es la misma que la
   del proxy del DSS y vive en el módulo compartido. */
require_once __DIR__ . '/bitacora-cache-lru.php';

/** Clave de caché determinista a partir de los parámetros ya cuantizados. */
function gaia_clave(float $ra, float $dec, float $rad, float $mag): string {
    return sha1(sprintf('%.3f_%.3f_%.2f_%.2f', $ra, $dec, $rad, $mag));
}

/** Ruta del fichero de caché (gzip) de una clave. */
function gaia_ruta(string $clave): string {
    return GAIA_CACHE_DIR . '/' . $clave . '.json.gz';
}

/**
 * Pareja de consultas ADQL [CDS, GAVO] para una región. Dos modos con el MISMO
 * WHERE (mismo conjunto físico, acotado por el `mag` del cliente):
 *   · sonda  ($segura=false): sin ORDER BY —el coste medido del TAP es la
 *     ordenación— y TOP en el techo computacional. Si la respuesta no lo toca,
 *     es el conjunto COMPLETO y no hay truncamiento.
 *   · segura ($segura=true): la histórica ORDER BY + TOP 40000. Si hay que
 *     truncar, que caiga lo más débil.
 */
function gaia_consultas(float $ra, float $dec, float $rad, float $mag, bool $segura): array {
    $top   = $segura ? GAIA_MAX_ROWS : GAIA_TECHO_FILAS;
    $orden = $segura ? ' ORDER BY ' : '';
    $cds = 'SELECT TOP ' . $top . ' RA_ICRS, DE_ICRS, Gmag, "BP-RP" FROM "I/355/gaiadr3"'
        . ' WHERE Gmag<=' . $mag . ' AND 1=CONTAINS(POINT(\'ICRS\',RA_ICRS,DE_ICRS),'
        . ' CIRCLE(\'ICRS\',' . $ra . ',' . $dec . ',' . $rad . '))' . ($orden ? $orden . 'Gmag' : '');
    $gavo = 'SELECT TOP ' . $top . ' ra,dec,phot_g_mean_mag,phot_bp_mean_mag-phot_rp_mean_mag AS bprp'
        . ' FROM gaia.dr3lite WHERE phot_g_mean_mag<=' . $mag . ' AND 1=CONTAINS(POINT(\'ICRS\',ra,dec),'
        . ' CIRCLE(\'ICRS\',' . $ra . ',' . $dec . ',' . $rad . '))' . ($orden ? $orden . 'phot_g_mean_mag' : '');
    return [$cds, $gavo];
}

/** URLs de proveedores TAP (failover), en orden de preferencia. */
function gaia_proveedores(float $ra, float $dec, float $rad, float $mag, bool $segura): array {
    [$cds, $gavo] = gaia_consultas($ra, $dec, $rad, $mag, $segura);
    // MAXREC en la sonda: si el servidor recorta por su cuenta, que recorte
    // exactamente en el techo y el recorte sea detectable (filas == techo).
    $maxrec = $segura ? '' : '&MAXREC=' . GAIA_TECHO_FILAS;
    return [
        'https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync?request=doQuery&lang=adql&format=json' . $maxrec . '&query=' . rawurlencode($cds),
        'https://dc.zah.uni-heidelberg.de/tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=json' . $maxrec . '&QUERY=' . rawurlencode($gavo),
    ];
}

/**
 * Momentos de la BANDA TRUNCADA (corte, mag] de un campo denso: número de
 * fuentes, flujo G total (en unidades de una estrella G=0) y segundo momento
 * (para SBF). Sin ORDER BY: agrega el servidor, no viaja una fila por estrella.
 */
function gaia_fondo_consultas(float $ra, float $dec, float $rad, float $mag, float $corte): array {
    $cds = 'SELECT COUNT(*) AS n, SUM(POWER(10,-0.4*Gmag)) AS flujo, SUM(POWER(10,-0.8*Gmag)) AS m2'
        . ' FROM "I/355/gaiadr3" WHERE Gmag>' . $corte . ' AND Gmag<=' . $mag
        . ' AND 1=CONTAINS(POINT(\'ICRS\',RA_ICRS,DE_ICRS), CIRCLE(\'ICRS\',' . $ra . ',' . $dec . ',' . $rad . '))';
    $gavo = 'SELECT COUNT(*) AS n, SUM(POWER(10,-0.4*phot_g_mean_mag)) AS flujo, SUM(POWER(10,-0.8*phot_g_mean_mag)) AS m2'
        . ' FROM gaia.dr3lite WHERE phot_g_mean_mag>' . $corte . ' AND phot_g_mean_mag<=' . $mag
        . ' AND 1=CONTAINS(POINT(\'ICRS\',ra,dec), CIRCLE(\'ICRS\',' . $ra . ',' . $dec . ',' . $rad . '))';
    return [$cds, $gavo];
}

/** URLs de proveedores del agregado (failover), en orden de preferencia. */
function gaia_fondo_urls(float $ra, float $dec, float $rad, float $mag, float $corte): array {
    [$cds, $gavo] = gaia_fondo_consultas($ra, $dec, $rad, $mag, $corte);
    return [
        'https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync?request=doQuery&lang=adql&format=json&query=' . rawurlencode($cds),
        'https://dc.zah.uni-heidelberg.de/tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY=' . rawurlencode($gavo),
    ];
}

/** Gmag de la estrella más débil servida (máximo de la columna 2), o null. */
function gaia_corte(string $json): ?float {
    $j = json_decode($json, true);
    if (!is_array($j) || empty($j['data']) || !is_array($j['data'])) {
        return null;
    }
    $max = null;
    foreach ($j['data'] as $f) {
        if (isset($f[2]) && ($max === null || $f[2] > $max)) {
            $max = $f[2];
        }
    }
    return $max;
}

/**
 * Inyecta los momentos de la banda truncada como clave `fondo` hermana de
 * `data` (el cliente actual solo lee `data`: no se rompe). Pura. Devuelve la
 * respuesta INTACTA si no hay banda (corte ≥ mag) o los momentos no valen:
 * servir sin fondo es la degradación correcta, nunca bloquea los datos.
 */
function gaia_mezclar_fondo(string $json, ?array $fila, float $corte, float $rad, float $mag): string {
    if ($corte >= $mag || !is_array($fila) || !isset($fila[1]) || !($fila[1] > 0)) {
        return $json;
    }
    $j = json_decode($json, true);
    if (!is_array($j)) {
        return $json;
    }
    $j['fondo'] = [
        'corte' => $corte, 'n' => (int) $fila[0],
        'flujo' => (float) $fila[1], 'm2' => (float) ($fila[2] ?? 0), 'rad' => $rad,
    ];
    return json_encode($j);
}

/** ¿La sonda pudo quedar truncada? Tocar el techo = no hay garantía de conjunto completo. */
function gaia_truncada(int $filas): bool {
    return $filas >= GAIA_TECHO_FILAS;
}

/** Nº de filas del JSON del TAP, o null si no es un JSON con `data`. */
function gaia_num_filas(string $json): ?int {
    $j = json_decode($json, true);
    return (is_array($j) && isset($j['data']) && is_array($j['data'])) ? count($j['data']) : null;
}

// ───────────────────────── EFECTOS (disco / red) ─────────────────────────────

/** Cabeceras comunes de una respuesta JSON del proxy (incl. CORS). */
function gaia_json_headers(): void {
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
}

/**
 * Adquisición por régimen de densidad:
 *   1ª pasada, SONDA (sin ORDER BY): si la respuesta no toca el techo, es el
 *      conjunto completo hasta el `mag` físico — sin truncamiento y sin pagar
 *      la ordenación (que es el coste dominante medido del TAP).
 *   2ª pasada, SEGURA (ORDER BY + TOP 40000): solo si la sonda tocó techo
 *      (campo denso) o devolvió algo ilegible. En denso, la sonda barata
 *      (~2 s medidos por 200k filas) es un sobrecoste pequeño frente a la
 *      consulta ordenada que igualmente había que pagar.
 * Devuelve null si todos los proveedores fallan.
 */
function gaia_fetch(float $ra, float $dec, float $rad, float $mag): ?string {
    $json = gaia_fetch_urls(gaia_proveedores($ra, $dec, $rad, $mag, false));
    if ($json !== null) {
        $filas = gaia_num_filas($json);
        if ($filas !== null && !gaia_truncada($filas)) {
            return $json;
        }
        unset($json);   // libera el cuerpo de la sonda (~14 MB) antes de la 2ª pasada
    }
    $json = gaia_fetch_urls(gaia_proveedores($ra, $dec, $rad, $mag, true));
    if ($json === null) {
        return null;
    }
    /* Campo denso: el TOP recortó una banda cuya luz es físicamente relevante
       (en M7, SB ~21 mag/arcsec², más brillante que un cielo oscuro). Se piden
       sus momentos agregados (medidos: ~39 s en M7, una vez por región, caché
       inmutable). Si el agregado falla se sirve sin fondo: degradación, no error. */
    $corte = gaia_corte($json);
    if ($corte === null || $corte >= $mag) {
        return $json;
    }
    $agg = gaia_fetch_urls(gaia_fondo_urls($ra, $dec, $rad, $mag, $corte));
    $fila = ($agg !== null) ? (json_decode($agg, true)['data'][0] ?? null) : null;
    return gaia_mezclar_fondo($json, is_array($fila) ? $fila : null, $corte, $rad, $mag);
}

/**
 * Recorre URLs de TAP en orden (failover) con timeouts de conexión y de petición
 * separados. Devuelve el primer cuerpo de una respuesta 2xx no vacía, o null.
 */
function gaia_fetch_urls(array $urls): ?string {
    foreach ($urls as $url) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => GAIA_CONNECT_TIMEOUT,
            CURLOPT_TIMEOUT        => GAIA_REQUEST_TIMEOUT,
            CURLOPT_ENCODING       => '',   // acepta gzip del TAP y lo descomprime
        ]);
        $body = curl_exec($ch);
        $http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        // Sin curl_close(): no-op desde PHP 8, y en PHP 8.5 emite un deprecation
        // notice que se cuela en la respuesta JSON si display_errors está On.
        if ($http >= 200 && $http < 300 && $body !== false && $body !== '') {
            return $body;
        }
    }
    return null;
}

/** ¿El cliente acepta gzip? */
function gaia_cliente_acepta_gzip(): bool {
    return stripos($_SERVER['HTTP_ACCEPT_ENCODING'] ?? '', 'gzip') !== false;
}

/**
 * Sirve el contenido gzip de una entrada de caché con ETag/Cache-Control y
 * negociación de Accept-Encoding. Responde 304 si el ETag del cliente coincide.
 * Termina la ejecución.
 */
function gaia_servir(string $ruta_gz, string $clave): void {
    // ETag = la clave. El acierto de caché hace touch() (para el LRU), que cambia
    // mtime; por eso el ETag NO puede depender de mtime o nunca habría 304. El
    // contenido de una región es inmutable (Gaia DR3 es un catálogo fijo y la
    // consulta es determinista), así que la clave identifica el contenido de forma
    // estable entre touches y reescrituras.
    $etag = '"' . $clave . '"';

    gaia_json_headers();
    header('Vary: Accept-Encoding');
    header('Cache-Control: public, max-age=' . GAIA_CLIENT_MAXAGE);
    header('ETag: ' . $etag);

    if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) {
        http_response_code(304);
        exit;
    }

    $gz = file_get_contents($ruta_gz);
    if ($gz === false) {
        http_response_code(500);
        exit(json_encode(['error' => 'No se pudo leer la caché']));
    }
    if (gaia_cliente_acepta_gzip()) {
        header('Content-Encoding: gzip');
        header('Content-Length: ' . strlen($gz));
        echo $gz;
    } else {
        $plano = gzdecode($gz);
        if ($plano === false) {
            http_response_code(500);
            exit(json_encode(['error' => 'Caché corrupta']));
        }
        header('Content-Length: ' . strlen($plano));
        echo $plano;
    }
    exit;
}

// ───────────────────────────────── FLUJO ─────────────────────────────────────
// En CLI (tests) solo se cargan las funciones puras; el manejo de la petición web
// no se ejecuta. El proxy real corre bajo SAPI web (fpm/apache).
if (PHP_SAPI === 'cli') {
    return;
}

/* Una consulta a un campo denso (hacia el bulbo) tarda más que el
   max_execution_time por defecto (30 s) y el proceso moría a mitad. Con margen
   sobre GAIA_REQUEST_TIMEOUT manda el timeout de curl, no el de PHP. Ahora hay
   hasta dos pasadas (sonda + segura) × dos proveedores. */
@set_time_limit(GAIA_REQUEST_TIMEOUT * 4 + 60);
/* Si el navegador se cansa y corta, el trabajo NO se tira: PHP termina la
   consulta y la ESCRIBE en la caché, así el reintento del cliente -o el
   siguiente observador que mire el mismo objeto- la encuentra ya hecha en
   disco. Sin esto un campo lento no se cacheaba NUNCA: cada intento moría antes
   del rename() y el objeto quedaba roto para siempre, por caro que fuera. */
@ignore_user_abort(true);

if (!is_dir(GAIA_CACHE_DIR)) {
    @mkdir(GAIA_CACHE_DIR, 0775, true);
}

$ra  = $_GET['ra']  ?? null;
$dec = $_GET['dec'] ?? null;
$rad = $_GET['rad'] ?? null;
$mag = $_GET['mag'] ?? 16;

if (!is_numeric($ra) || !is_numeric($dec) || !is_numeric($rad) || !is_numeric($mag)) {
    http_response_code(400);
    gaia_json_headers();
    exit(json_encode(['error' => 'Parámetros incorrectos (ra, dec, rad, mag numéricos)']));
}

/* Cotas del lado servidor. El endpoint es público y una consulta TAP de radio o
   magnitud arbitrarios es cara para el archivo de origen y para la caché: el
   cliente ya se acota, pero eso no es una defensa. */
if ($rad <= 0 || $rad > GAIA_MAX_RAD || $mag <= 0 || $mag > GAIA_MAX_MAG
    || $ra < 0 || $ra > 360 || $dec < -90 || $dec > 90) {
    http_response_code(400);
    gaia_json_headers();
    exit(json_encode(['error' => 'Parámetros fuera de rango (rad ≤ ' . GAIA_MAX_RAD
        . '°, mag ≤ ' . GAIA_MAX_MAG . ', ra 0-360, dec ±90)']));
}

[$qra, $qdec, $qrad, $qmag] = gaia_cuantizar((float) $ra, (float) $dec, (float) $rad, (float) $mag);
$clave = gaia_clave($qra, $qdec, $qrad, $qmag);
$ruta = gaia_ruta($clave);

// ── ACIERTO de caché ── (las respuestas son inmutables; no caducan)
if (is_file($ruta)) {
    @touch($ruta);                       // LRU: renueva su antigüedad
    gaia_servir($ruta, $clave);          // termina
}

// ── FALLO: consultar los TAP bajo bloqueo (evita estampida) ──
$lock = @fopen($ruta . '.lock', 'c');
if ($lock && flock($lock, LOCK_EX)) {
    // Otra petición pudo llenar la caché mientras esperábamos el lock.
    if (is_file($ruta)) {
        flock($lock, LOCK_UN);
        fclose($lock);
        gaia_servir($ruta, $clave);      // termina
    }

    $json = gaia_fetch($qra, $qdec, $qrad, $qmag);

    if ($json === null) {
        flock($lock, LOCK_UN);
        fclose($lock);
        http_response_code(502);
        gaia_json_headers();
        exit(json_encode(['error' => 'No hay respuesta de Gaia (CDS/GAVO)']));
    }

    // Escritura ATÓMICA del gzip (temp + rename) para no dejar ficheros a medias.
    $gz = gzencode($json, 6);
    $tmp = $ruta . '.tmp' . getmypid();
    if ($gz !== false && file_put_contents($tmp, $gz) !== false) {
        @rename($tmp, $ruta);
    } else {
        @unlink($tmp);
    }
    flock($lock, LOCK_UN);
    fclose($lock);
    // El fichero .lock NO se borra: unlink mientras otro proceso lo tiene abierto en
    // flock es una condición de carrera (operaría sobre un inodo fantasma). Es vacío
    // y hay uno por región; la limpieza incremental los retira si envejecen.

    cache_lru_limpieza([
        'dir' => GAIA_CACHE_DIR, 'patron' => '*.json.gz',
        'max_bytes' => GAIA_CACHE_MAX_BYTES, 'lowwater' => GAIA_CACHE_LOWWATER,
        'max_del' => GAIA_CLEANUP_MAX_DEL, 'cada' => GAIA_CLEANUP_EVERY,
        'huerfano_ttl' => GAIA_ORPHAN_TTL,
    ]);

    if (is_file($ruta)) {
        gaia_servir($ruta, $clave);      // termina
    }
    // Si por lo que sea no se escribió la caché, servimos el JSON directo.
    gaia_json_headers();
    echo $json;
    exit;
}

// No se pudo bloquear (caso raro): servir sin cachear con una consulta directa.
if ($lock) {
    fclose($lock);
}
$json = gaia_fetch($qra, $qdec, $qrad, $qmag);
if ($json !== null) {
    gaia_json_headers();
    echo $json;
    exit;
}
http_response_code(502);
gaia_json_headers();
exit(json_encode(['error' => 'No hay respuesta de Gaia (CDS/GAVO)']));
