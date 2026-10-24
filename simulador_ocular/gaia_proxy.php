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
     · Log de una línea JSON por petición (hit/miss/304/error) con rotación por
       tamaño, la traza de cada intento al TAP (etapa, proveedor, http, ms) y
       endpoint ?stats=1 de solo lectura para leerlo agregado.

   Endpoints:
     GET ?ra=..&dec=..&rad=..&mag=..   → datos Gaia (JSON); 202 {pendiente,
                                         reintentar_en} mientras un campo denso
                                         corre como job asíncrono (ADR 0014, #505)
     GET ?stats=1                      → estado de la caché y agregado del log
   ════════════════════════════════════════════════════════════════════════════ */

// ───────────────────────────── CONFIGURACIÓN ─────────────────────────────────
const GAIA_CACHE_DIR       = __DIR__ . '/cache_gaia';
const GAIA_CACHE_MAX_BYTES = 500 * 1024 * 1024;   // objetivo de tamaño de la caché (500 MB, best-effort: se aplica en la limpieza incremental)
const GAIA_CACHE_LOWWATER  = 0.90;                // tras evict, bajar hasta el 90% del tope
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
/* Granularidad del agregado ESPACIAL del velo (ADR 0029): celdas de 1/N grados.
   0,125° (N=8) fijada por el barrido previo — la más gruesa que conserva el
   perfil radial de la niebla (coincide con 0,0625°, con 3,4× menos celdas). */
const GAIA_ESPACIAL_N      = 8;
const GAIA_MAX_RAD         = 4.5;                // ° : radio máximo aceptado (6° de lado + margen)
const GAIA_MAX_MAG         = 20.0;               // mag: límite máximo aceptado (= GAIA_MAG_TOPE en bitacora-gaia-render.js)
const GAIA_CLIENT_MAXAGE   = 86400;              // s: Cache-Control max-age que se anuncia al navegador
const GAIA_LOG_FILE        = GAIA_CACHE_DIR . '/.hits.log';   // log de aciertos (US-1: medir antes de tocar)
/* Campos densos (#505): cuando ni la sonda ni la segura síncronas terminan
   (GAVO corta a ~20 s con «use TAP's async mode», CDS se cuelga hasta los
   55 s), el campo se pide como una cadena de jobs UWS en GAVO (ver
   gaia_cadena_consulta). Medido el 2026-10-24 sobre M7: el histograma del cono
   acabó en 280 s. El cliente vuelve a preguntar cada GAIA_ASYNC_REINTENTAR s, y
   cada pregunta cuesta un GET de la fase a GAVO. */
const GAIA_ASYNC_URL        = 'https://dc.zah.uni-heidelberg.de/tap/async';
const GAIA_ASYNC_REINTENTAR = 15;                 // s: `reintentar_en` del 202; los pasos duran minutos
const GAIA_UWS_TIMEOUT      = 8;                  // s: crear el job, arrancarlo y preguntar su fase (se hace con el lock tomado)
const GAIA_ASYNC_TTL        = 7200 + 600;         // s: el executionduration que anuncia GAVO, más margen; pasado, el .job caduca

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

/* Sonda (#429): GAVO primero. CDS se cuelga de forma errática hasta el timeout
   de 55 s con estas mismas consultas (4 de 6 campos el 2026-10-11) y GAVO
   responde en ≤3,4 s. CDS sigue de failover con su plazo íntegro. La segura
   también (#505): la única densa que terminó en producción la sirvió GAVO en
   16 s, y un CDS colgado retrasaría 55 s el 202 de la cadena asíncrona.
   Ambas consultas devuelven las mismas 4 columnas en el mismo orden. */
function gaia_proveedores_gavo_primero(float $ra, float $dec, float $rad, float $mag, bool $segura): array {
    return array_reverse(gaia_proveedores($ra, $dec, $rad, $mag, $segura));
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

/** URLs de proveedores del agregado (failover), en orden de preferencia. GAVO
    primero (#505): los pide la petición que recoge el job con el lock tomado, y
    en GAVO cuestan ~0,7 s; un CDS colgado costaría 55 s. */
function gaia_fondo_urls(float $ra, float $dec, float $rad, float $mag, float $corte): array {
    [$cds, $gavo] = gaia_fondo_consultas($ra, $dec, $rad, $mag, $corte);
    return [
        'https://dc.zah.uni-heidelberg.de/tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY=' . rawurlencode($gavo),
        'https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync?request=doQuery&lang=adql&format=json&query=' . rawurlencode($cds),
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

/* ═══════════ Velo espacial por celdas (ADR 0029) ═══════════
   El velo de campo denso (ADR 0014) es uniforme porque el fondo escalar no
   lleva estructura. Aquí se piden los MISMOS momentos (n, Σf, Σf²) agrupados
   por celda de la rejilla RA×Dec (1/N grados), sin ORDER BY: agrega el servidor
   por celda, no viaja una fila por estrella. El cliente mapea cada celda a
   flujo/arcsec² local y el velo deja de ser uniforme (bifurcación velo↔niebla). */

/**
 * Pareja de consultas ADQL [CDS, GAVO] del agregado espacial de la banda
 * truncada (corte, mag], agrupado por celda. Mismo WHERE que el fondo escalar:
 * el conjunto físico es idéntico, solo cambia el agrupamiento (Σ celdas ==
 * fondo.flujo, listón L1 del prerregistro).
 */
function gaia_espacial_consultas(float $ra, float $dec, float $rad, float $mag, float $corte, int $N): array {
    $cds = 'SELECT FLOOR(RA_ICRS*' . $N . ') AS rx, FLOOR(DE_ICRS*' . $N . ') AS dy,'
        . ' COUNT(*) AS n, SUM(POWER(10,-0.4*Gmag)) AS flujo, SUM(POWER(10,-0.8*Gmag)) AS m2'
        . ' FROM "I/355/gaiadr3" WHERE Gmag>' . $corte . ' AND Gmag<=' . $mag
        . ' AND 1=CONTAINS(POINT(\'ICRS\',RA_ICRS,DE_ICRS), CIRCLE(\'ICRS\',' . $ra . ',' . $dec . ',' . $rad . '))'
        . ' GROUP BY rx, dy';
    $gavo = 'SELECT FLOOR(ra*' . $N . ') AS rx, FLOOR(dec*' . $N . ') AS dy,'
        . ' COUNT(*) AS n, SUM(POWER(10,-0.4*phot_g_mean_mag)) AS flujo, SUM(POWER(10,-0.8*phot_g_mean_mag)) AS m2'
        . ' FROM gaia.dr3lite WHERE phot_g_mean_mag>' . $corte . ' AND phot_g_mean_mag<=' . $mag
        . ' AND 1=CONTAINS(POINT(\'ICRS\',ra,dec), CIRCLE(\'ICRS\',' . $ra . ',' . $dec . ',' . $rad . '))'
        . ' GROUP BY rx, dy';
    return [$cds, $gavo];
}

/** URLs de proveedores del agregado espacial (failover), GAVO primero como el fondo. */
function gaia_espacial_urls(float $ra, float $dec, float $rad, float $mag, float $corte, int $N): array {
    [$cds, $gavo] = gaia_espacial_consultas($ra, $dec, $rad, $mag, $corte, $N);
    return [
        'https://dc.zah.uni-heidelberg.de/tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY=' . rawurlencode($gavo),
        'https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync?request=doQuery&lang=adql&format=json&query=' . rawurlencode($cds),
    ];
}

/**
 * Inyecta las celdas del agregado espacial bajo `fondo.espacial` (hermana de
 * los momentos escalares). Pura: sin celdas o sin `fondo`, devuelve la
 * respuesta intacta — degradación, no bloqueo (misma regla que el fondo).
 */
function gaia_mezclar_espacial(string $json, ?string $esp_json, int $N): string {
    if ($esp_json === null) {
        return $json;
    }
    $e = json_decode($esp_json, true);
    if (!is_array($e) || empty($e['data']) || !is_array($e['data'])) {
        return $json;
    }
    $j = json_decode($json, true);
    if (!is_array($j) || !isset($j['fondo'])) {
        return $json;
    }
    $celdas = [];
    foreach ($e['data'] as $f) {
        $celdas[] = [(int) $f[0], (int) $f[1], (int) $f[2], (float) $f[3], (float) ($f[4] ?? 0)];
    }
    $j['fondo']['espacial'] = ['N' => $N, 'celdas' => $celdas];
    return json_encode($j);
}

/** Proveedor TAP de una URL, por su host: `cds`, `gavo` o el host tal cual. Puro. */
function gaia_proveedor(string $url): string {
    $host = (string) parse_url($url, PHP_URL_HOST);
    if (str_contains($host, 'cds.unistra.fr')) {
        return 'cds';
    }
    // El job UWS se crea en dc.zah.uni-heidelberg.de pero vive en dc.g-vo.org.
    return (str_contains($host, 'uni-heidelberg.de') || str_contains($host, 'g-vo.org')) ? 'gavo' : $host;
}

/* ═══════════ Job asíncrono de los campos densos (#505) ═══════════ */

/** Ruta del fichero con la URL del job UWS de una clave. */
function gaia_ruta_job(string $clave): string {
    return GAIA_CACHE_DIR . '/' . $clave . '.job';
}

/** ¿Es el 500 del límite síncrono del TAP («Query timed out… use TAP's async
    mode»)? Entonces el campo es denso y el otro proveedor síncrono tampoco
    termina: se corta el failover y se va al job. Pura. */
function gaia_es_plazo_sync(int $http, string $body): bool {
    return $http >= 500 && stripos($body, 'timed out') !== false;
}

/* La cadena (#505). La segura ordenada no terminó ni en 2 h de job sobre M7
   (2026-10-24), y un agregado del cono entero sí (280 s). Así que nada lleva
   ORDER BY: un histograma por centésima de G da el corte del TOP y los momentos
   del fondo; luego el velo espacial de la banda; al final las filas por debajo
   del corte. Los tres pasos usan la MISMA celda, FLOOR(G·100), en el mismo
   servidor: la partición filas/fondo es exacta. El resultado es el de la
   segura de siempre salvo que el corte cae en un borde de centésima en vez de
   en la estrella 40 000. */
const GAIA_CADENA_PASOS = ['hist' => 1, 'espacial' => 2, 'datos' => 3];

/** Consulta ADQL (GAVO) de un paso de la cadena. `$b` = celda de corte, o null
    si el campo cabe entero en el TOP. Pura. */
function gaia_cadena_consulta(string $paso, float $ra, float $dec, float $rad, float $mag, ?int $b): string {
    $donde = ' FROM gaia.dr3lite WHERE phot_g_mean_mag<=' . $mag
        . ' AND 1=CONTAINS(POINT(\'ICRS\',ra,dec), CIRCLE(\'ICRS\',' . $ra . ',' . $dec . ',' . $rad . '))';
    $celda = 'FLOOR(phot_g_mean_mag*100)';
    switch ($paso) {
        case 'hist':
            return 'SELECT ' . $celda . ' AS g100, COUNT(*) AS n, SUM(POWER(10,-0.4*phot_g_mean_mag)) AS flujo,'
                . ' SUM(POWER(10,-0.8*phot_g_mean_mag)) AS m2' . $donde . ' GROUP BY g100';
        case 'espacial':
            $N = GAIA_ESPACIAL_N;
            return 'SELECT FLOOR(ra*' . $N . ') AS rx, FLOOR(dec*' . $N . ') AS dy, COUNT(*) AS n,'
                . ' SUM(POWER(10,-0.4*phot_g_mean_mag)) AS flujo, SUM(POWER(10,-0.8*phot_g_mean_mag)) AS m2'
                . $donde . ' AND ' . $celda . '>=' . $b . ' GROUP BY rx, dy';
        default:
            return 'SELECT TOP ' . GAIA_MAX_ROWS . ' ra,dec,phot_g_mean_mag,phot_bp_mean_mag-phot_rp_mean_mag AS bprp'
                . $donde . ($b === null ? '' : ' AND ' . $celda . '<' . $b);
    }
}

/** Parámetros del POST que crea el job de un paso. MAXREC va explícito porque
    el del servidor queda vacío en el job. Pura. */
function gaia_job_parametros(string $paso, float $ra, float $dec, float $rad, float $mag, ?int $b): array {
    return [
        'REQUEST' => 'doQuery', 'LANG' => 'ADQL', 'FORMAT' => 'json',
        'MAXREC' => $paso === 'datos' ? GAIA_MAX_ROWS : 10000,
        'QUERY' => gaia_cadena_consulta($paso, $ra, $dec, $rad, $mag, $b),
    ];
}

/**
 * Corte del TOP a partir del histograma [[celda, n, flujo, m2], …]: la celda
 * más alta tal que lo de debajo cabe en `$max`. Devuelve ['b', 'n', 'fondo']:
 * `n` filas que traerá el paso de datos y `fondo` = [n, flujo, m2] de las
 * celdas ≥ b. Si todo cabe, b y fondo son null. Pura.
 */
function gaia_cadena_corte(array $hist, int $max): array {
    usort($hist, static fn($x, $y) => $x[0] <=> $y[0]);
    $n = 0;
    foreach ($hist as $i => $f) {
        if ($n + (int) $f[1] > $max) {
            $fondo = [0, 0.0, 0.0];
            foreach (array_slice($hist, $i) as $g) {
                $fondo = [$fondo[0] + (int) $g[1], $fondo[1] + (float) $g[2], $fondo[2] + (float) ($g[3] ?? 0)];
            }
            return ['b' => (int) $f[0], 'n' => $n, 'fondo' => $fondo];
        }
        $n += (int) $f[1];
    }
    return ['b' => null, 'n' => $n, 'fondo' => null];
}

/**
 * Un paso de la cadena terminado: con su resultado (`$res`, null si el job
 * acabó en ERROR) decide el siguiente. Pura. Devuelve uno de
 *   ['lanzar' => paso, 'estado' => …]  siguiente job
 *   ['listo' => json]                   la respuesta final, la de siempre
 *   ['error' => true]                   502
 * Un espacial fallido degrada a velo uniforme, como en la vía síncrona.
 */
function gaia_cadena_avance(array $e, ?string $res, float $rad, float $mag): array {
    $paso = $e['paso'] ?? '';
    if ($res === null && $paso !== 'espacial') {
        return ['error' => true];
    }
    $j = ($res === null) ? null : json_decode($res, true);
    if ($paso === 'hist') {
        if (!is_array($j) || !isset($j['data']) || !is_array($j['data'])) {
            return ['error' => true];
        }
        $c = gaia_cadena_corte($j['data'], GAIA_MAX_ROWS);
        $sig = ($c['b'] === null) ? 'datos' : 'espacial';
        return ['lanzar' => $sig, 'estado' => ['paso' => $sig] + $c];
    }
    if ($paso === 'espacial') {
        $esp = (is_array($j) && !empty($j['data']) && is_array($j['data'])) ? $j['data'] : null;
        return ['lanzar' => 'datos', 'estado' => ['paso' => 'datos', 'esp' => $esp] + $e];
    }
    // datos: lo que llega tiene que ser exactamente lo que contó el histograma.
    if (gaia_num_filas((string) $res) !== ($e['n'] ?? -1)) {
        return ['error' => true];
    }
    $b = $e['b'] ?? null;
    if ($b === null) {
        return ['listo' => $res];
    }
    $json = gaia_mezclar_fondo($res, $e['fondo'] ?? null, $b / 100, $rad, $mag);
    $esp = isset($e['esp']) ? json_encode(['data' => $e['esp']]) : null;
    return ['listo' => gaia_mezclar_espacial($json, $esp, GAIA_ESPACIAL_N)];
}

/** Nº de paso (1 a 3) para el aviso del cliente. Pura. */
function gaia_cadena_paso_num(string $paso): int {
    return GAIA_CADENA_PASOS[$paso] ?? 1;
}

/** Solo se pregunta a jobs de GAVO: un .job vacío, roto o de otro host no
    vale. Pura. */
function gaia_job_valido(string $job): bool {
    return $job !== '' && gaia_proveedor($job) === 'gavo';
}

/** Un paso que sigue sin acabar pasado el plazo de ejecución de GAVO caduca:
    sin esto, con GAVO fallando sin parar la clave daría 202 para siempre. Pura. */
function gaia_job_caducado(int $edad): bool {
    return $edad > GAIA_ASYNC_TTL;
}

/**
 * Qué hacer con la respuesta a la fase del job. Pura.
 *   listo     COMPLETED: recoger el resultado.
 *   arrancar  PENDING: el RUN no llegó (GAVO ignora PHASE=RUN al crear); reenviarlo.
 *   pendiente en cola o ejecutándose, o la pregunta falló por red/5xx: el job
 *             puede seguir vivo y se vuelve a preguntar. Borrarlo por un tropiezo
 *             de GAVO relanzaría la consulta entera.
 *   error     404 (destruido: caducado) o fase terminal sin resultado.
 */
function gaia_job_decision(int $http, string $fase): string {
    if ($http === 404) {
        return 'error';
    }
    if ($http < 200 || $http >= 300) {
        return 'pendiente';
    }
    return match (strtoupper(trim($fase))) {
        'COMPLETED' => 'listo',
        'PENDING' => 'arrancar',
        'QUEUED', 'EXECUTING', 'HELD', 'SUSPENDED' => 'pendiente',
        default => 'error',
    };
}

/** Mediana de una lista de números (0.0 si está vacía). */
function gaia_mediana(array $v): float {
    sort($v);
    $n = count($v);
    if ($n === 0) {
        return 0.0;
    }
    $m = ($n % 2) ? $v[intdiv($n, 2)] : ($v[intdiv($n, 2) - 1] + $v[intdiv($n, 2)]) / 2;
    return (float) $m;
}

/**
 * Agregado de un log de aciertos ya leído (una línea JSON por petición).
 * Puro. Las líneas ilegibles se IGNORAN: el fichero se rota por tamaño y un
 * corte a mitad de línea no puede tumbar `?stats=1`. El ratio se calcula sobre
 * las peticiones que sirvieron cuerpo (hit+miss): un 304 no es ni acierto ni
 * fallo de la caché de disco, solo del navegador.
 */
function gaia_log_agregado(string $texto): array {
    $estados = ['hit', 'miss', '304', 'error', 'pendiente'];
    $r  = ['peticiones' => 0, 'hit' => 0, 'miss' => 0, '304' => 0, 'error' => 0, 'pendiente' => 0, 'ratio' => null, 'bytes' => 0];
    $ms = [];
    foreach (explode("\n", $texto) as $linea) {
        if ($linea === '') {
            continue;
        }
        $e = json_decode($linea, true);
        /* Lista blanca EXPLÍCITA, no las claves de $r: si se valida contra el
           acumulador, una línea corrupta con estado "bytes" suma en el contador
           de bytes. El log se rota por tamaño, así que la basura no es teórica. */
        if (!is_array($e) || !isset($e['estado']) || !in_array((string) $e['estado'], $estados, true)) {
            continue;
        }
        $estado = (string) $e['estado'];
        $r['peticiones']++;
        $r[$estado]++;
        $r['bytes'] += (int) ($e['bytes'] ?? 0);
        $etapa = ($estado === 'miss') ? (string) ($e['etapa'] ?? 'desconocida') : $estado;
        $ms[$etapa][] = (float) ($e['ms'] ?? 0);
    }
    $servidas = $r['hit'] + $r['miss'];
    if ($servidas > 0) {
        $r['ratio'] = round($r['hit'] / $servidas, 4);
    }
    $r['ms_mediano'] = [];
    foreach ($ms as $etapa => $v) {
        $r['ms_mediano'][$etapa] = round(gaia_mediana($v), 1);
    }
    return $r;
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

/** Estado del directorio de caché: entradas, bytes y antigüedad. Solo lectura. */
function gaia_cache_estado(string $dir, string $patron): array {
    $n = 0; $bytes = 0; $min = null; $max = null;
    foreach (glob($dir . '/' . $patron) ?: [] as $f) {
        $n++;
        $bytes += (int) @filesize($f);
        $m = @filemtime($f);
        if ($m === false) {
            continue;
        }
        if ($min === null || $m < $min) { $min = $m; }
        if ($max === null || $m > $max) { $max = $m; }
    }
    return ['entradas' => $n, 'bytes' => $bytes, 'mtime_min' => $min, 'mtime_max' => $max];
}

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
 *   2ª pasada, SEGURA (ORDER BY + TOP 40000), síncrona y GAVO primero: solo si
 *      la sonda tocó techo (campo denso) o falló. Con el servidor sano es la
 *      vía rápida de siempre (~38 s la única densa que terminó en producción).
 *   3º, si la segura tampoco termina, CADENA ASÍNCRONA en GAVO (#505): se lanza
 *      su primer job, se apunta en `<clave>.job` y se devuelve false (el proxy
 *      responde 202). Las peticiones siguientes entran por el .job y la hacen
 *      avanzar paso a paso hasta servir el mismo JSON de siempre.
 * Devuelve el JSON, false si la cadena sigue en marcha, o null si falla.
 */
function gaia_fetch(float $ra, float $dec, float $rad, float $mag, string $ruta_job, ?string &$etapa = null): string|false|null {
    $etapa = 'async';
    if (is_file($ruta_job)) {
        return gaia_cadena_avanzar($ruta_job, $ra, $dec, $rad, $mag);
    }
    $etapa = 'densa';
    $json = gaia_fetch_urls(gaia_proveedores_gavo_primero($ra, $dec, $rad, $mag, false), 'sonda', true);
    if ($json !== null) {
        $filas = gaia_num_filas($json);
        if ($filas !== null && !gaia_truncada($filas)) {
            $etapa = 'sonda';
            return $json;
        }
        unset($json);   // libera el cuerpo de la sonda (~14 MB) antes de la 2ª pasada
    }
    $json = gaia_fetch_urls(gaia_proveedores_gavo_primero($ra, $dec, $rad, $mag, true), 'segura', true);
    if ($json !== null) {
        return gaia_completar_densa($json, $ra, $dec, $rad, $mag);
    }
    // Sin .job escrito nadie volvería a preguntar por la cadena: no se lanza.
    $etapa = 'async';
    if (!is_writable(dirname($ruta_job))) {
        return null;
    }
    return gaia_cadena_lanzar($ruta_job, ['paso' => 'hist'], $ra, $dec, $rad, $mag) ? false : null;
}

/**
 * Crea en GAVO el job del paso de `$e`, lo arranca y guarda el estado (con la
 * URL del job) en `$ruta_job`, de forma atómica: cada paso renueva el mtime,
 * que es el reloj de la caducidad. La URL es la del `Location` del 303 (el job
 * vive en otro host). GAVO ignora PHASE=RUN en la creación (probado el
 * 2026-10-24), así que el RUN va en un segundo POST; si se pierde, la fase
 * PENDING lo reenvía.
 */
function gaia_cadena_lanzar(string $ruta_job, array $e, float $ra, float $dec, float $rad, float $mag): bool {
    $param = gaia_job_parametros($e['paso'], $ra, $dec, $rad, $mag, $e['b'] ?? null);
    [$http, , $job] = gaia_uws(GAIA_ASYNC_URL, $param, GAIA_UWS_TIMEOUT);
    if ($http !== 303 || !gaia_job_valido($job)) {
        return false;
    }
    gaia_uws($job . '/phase', ['PHASE' => 'RUN'], GAIA_UWS_TIMEOUT);
    $tmp = $ruta_job . '.tmp' . getmypid();
    return @file_put_contents($tmp, json_encode(['job' => $job] + $e)) !== false && @rename($tmp, $ruta_job);
}

/** Estado de la cadena guardado en `$ruta_job`, o null si no se puede leer. */
function gaia_cadena_estado(string $ruta_job): ?array {
    $e = json_decode((string) @file_get_contents($ruta_job), true);
    return (is_array($e) && isset($e['paso'], GAIA_CADENA_PASOS[$e['paso']]) && gaia_job_valido((string) ($e['job'] ?? ''))) ? $e : null;
}

/**
 * Una pregunta a la cadena de `$ruta_job`: false si sigue en marcha (también
 * cuando un paso acaba y se lanza el siguiente), null si acabó mal (se borra el
 * .job y la siguiente petición podrá lanzar otra), o el JSON final. El .job de
 * una cadena terminada lo borra cache_lru_flujo DESPUÉS de escribir la entrada.
 */
function gaia_cadena_avanzar(string $ruta_job, float $ra, float $dec, float $rad, float $mag): string|false|null {
    $e = gaia_cadena_estado($ruta_job);
    if ($e === null) {
        @unlink($ruta_job);
        return null;
    }
    $job = $e['job'];
    [$http, $fase] = gaia_uws($job . '/phase', null, GAIA_UWS_TIMEOUT);
    $decision = gaia_job_decision($http, $fase);
    /* La caducidad solo cuenta mientras no hay respuesta definitiva: un paso
       COMPLETED se recoge aunque nadie preguntara en horas (GAVO guarda el
       resultado ~48 h). */
    if ($decision !== 'listo' && $decision !== 'error' && gaia_job_caducado(time() - (int) @filemtime($ruta_job))) {
        $decision = 'error';
    }
    if ($decision === 'arrancar') {
        gaia_uws($job . '/phase', ['PHASE' => 'RUN'], GAIA_UWS_TIMEOUT);
        return false;
    }
    if ($decision === 'pendiente') {
        return false;
    }
    $res = null;
    if ($decision === 'listo') {
        [$http, $res] = gaia_uws($job . '/results/result', null, GAIA_REQUEST_TIMEOUT);
        if ($http !== 404 && ($http < 200 || $http >= 300)) {
            return false;   // tropiezo al descargar: se reintenta en la siguiente pregunta
        }
        if ($http === 404) {
            $res = null;
        }
    }
    $a = gaia_cadena_avance($e, $res, $rad, $mag);
    if (isset($a['listo'])) {
        return $a['listo'];
    }
    if (isset($a['lanzar']) && gaia_cadena_lanzar($ruta_job, $a['estado'], $ra, $dec, $rad, $mag)) {
        return false;
    }
    @unlink($ruta_job);
    return null;
}

/** Petición de control UWS (crear, arrancar, fase, resultado) con su traza en
    la etapa `async`. Devuelve [http, cuerpo, Location]; sin seguir redirecciones. */
function gaia_uws(string $url, ?array $post, int $timeout): array {
    $t0 = microtime(true);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => CACHE_LRU_CONNECT_TIMEOUT,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_ENCODING       => '',
        CURLOPT_USERAGENT      => 'simulador-ocular/1.0',
    ]);
    if ($post !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($post));
    }
    $body = curl_exec($ch);
    $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $loc = (string) curl_getinfo($ch, CURLINFO_REDIRECT_URL);
    cache_lru_traza('async', gaia_proveedor($url), $http, $t0);
    return [$http, is_string($body) ? $body : '', $loc];
}

/** Añade a la respuesta segura de un campo denso el fondo y el velo espacial
    de la banda que el TOP dejó fuera. */
function gaia_completar_densa(string $json, float $ra, float $dec, float $rad, float $mag): string {
    /* Campo denso: el TOP recortó una banda cuya luz es físicamente relevante
       (en M7, SB ~21 mag/arcsec², más brillante que un cielo oscuro). Se piden
       sus momentos agregados (medidos: ~39 s en M7, una vez por región, caché
       inmutable). Si el agregado falla se sirve sin fondo: degradación, no error. */
    $corte = gaia_corte($json);
    if ($corte === null || $corte >= $mag) {
        return $json;
    }
    $agg = gaia_fetch_urls(gaia_fondo_urls($ra, $dec, $rad, $mag, $corte), 'fondo', true);
    $fila = ($agg !== null) ? (json_decode($agg, true)['data'][0] ?? null) : null;
    $json = gaia_mezclar_fondo($json, is_array($fila) ? $fila : null, $corte, $rad, $mag);
    /* ADR 0029: velo espacial por celdas. Un fallo aquí degrada a velo uniforme
       (el escalar ya está servido), nunca bloquea los datos. */
    $esp = gaia_fetch_urls(gaia_espacial_urls($ra, $dec, $rad, $mag, $corte, GAIA_ESPACIAL_N), 'espacial', true);
    return gaia_mezclar_espacial($json, $esp, GAIA_ESPACIAL_N);
}

/**
 * Recorre URLs de TAP en orden (failover) con timeouts de conexión y de petición
 * separados. Devuelve el primer cuerpo de una respuesta 2xx no vacía, o null.
 * Cada intento se anota en $GLOBALS['cache_lru_traza'] (#429): sin él, un CDS que
 * agota los 55 s y un GAVO que responde en 1 s se ven como una sonda de 56 s.
 * Con `$cortar_en_plazo`, un 500 por el límite síncrono del TAP corta el
 * failover (#505): el campo es denso y el siguiente tampoco terminaría.
 */
function gaia_fetch_urls(array $urls, string $etapa, bool $cortar_en_plazo = false): ?string {
    foreach ($urls as $url) {
        $t0 = microtime(true);
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => CACHE_LRU_CONNECT_TIMEOUT,
            CURLOPT_TIMEOUT        => GAIA_REQUEST_TIMEOUT,
            CURLOPT_ENCODING       => '',   // acepta gzip del TAP y lo descomprime
            CURLOPT_USERAGENT      => 'simulador-ocular/1.0',
        ]);
        $body = curl_exec($ch);
        $http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        cache_lru_traza($etapa, gaia_proveedor($url), (int) $http, $t0);
        // Sin curl_close(): no-op desde PHP 8, y en PHP 8.5 emite un deprecation
        // notice que se cuela en la respuesta JSON si display_errors está On.
        if ($http >= 200 && $http < 300 && $body !== false && $body !== '') {
            return $body;
        }
        if ($cortar_en_plazo && gaia_es_plazo_sync((int) $http, (string) $body)) {
            return null;
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
function gaia_servir(string $ruta_gz, string $clave, string $estado = 'hit', ?string $etapa = null): void {
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
        /* El estado es 304 (AC3) pero la etapa se CONSERVA: un fallo que acaba
           en 304 -entrada evictada y el cliente todavía con su ETag- es justo
           la adquisición cara que no se puede perder de vista. */
        cache_lru_log_registrar(GAIA_LOG_FILE, $clave, '304', $etapa, 0);
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
        $bytes = strlen($gz);
    } else {
        $plano = gzdecode($gz);
        if ($plano === false) {
            http_response_code(500);
            exit(json_encode(['error' => 'Caché corrupta']));
        }
        header('Content-Length: ' . strlen($plano));
        echo $plano;
        $bytes = strlen($plano);
    }
    cache_lru_log_registrar(GAIA_LOG_FILE, $clave, $estado, $etapa, $bytes);
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
   sobre GAIA_REQUEST_TIMEOUT manda el timeout de curl, no el de PHP. Lo más
   largo es la vía síncrona de un campo denso: sonda + segura + fondo +
   espacial, con failover a CDS si GAVO falla de otra forma que por su plazo. */
@set_time_limit(GAIA_REQUEST_TIMEOUT * 8 + 60);
/* Si el navegador se cansa y corta, el trabajo NO se tira: PHP termina la
   consulta y la ESCRIBE en la caché, así el reintento del cliente -o el
   siguiente observador que mire el mismo objeto- la encuentra ya hecha en
   disco. Sin esto un campo lento no se cacheaba NUNCA: cada intento moría antes
   del rename() y el objeto quedaba roto para siempre, por caro que fuera. */
@ignore_user_abort(true);

/* ── ?stats=1 ── Solo lectura: mira el directorio y agrega el log. No toca la
   política de caché, no escribe y NO consulta al TAP. Es la cifra sobre la que
   se decide si hay que partir la caché o colapsar `mag` (épica de la caché).
   Va ANTES del mkdir del directorio: pedir la cifra no puede crear nada. */
if (isset($_GET['stats'])) {
    $cache = gaia_cache_estado(GAIA_CACHE_DIR, '*.json.gz');
    $cache['max_bytes'] = GAIA_CACHE_MAX_BYTES;
    $cache['ocupacion'] = round($cache['bytes'] / GAIA_CACHE_MAX_BYTES, 4);
    // Se agregan el log activo y su rotación: si no, rotar borraría la historia.
    $log = gaia_log_agregado((string) @file_get_contents(GAIA_LOG_FILE . '.1')
        . (string) @file_get_contents(GAIA_LOG_FILE));
    $log['bytes_log'] = (int) @filesize(GAIA_LOG_FILE) + (int) @filesize(GAIA_LOG_FILE . '.1');
    $log['ms_mediano'] = (object) $log['ms_mediano'];   // objeto también cuando está vacío
    gaia_json_headers();
    exit(json_encode(['cache' => $cache, 'log' => $log], JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
}

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
$ruta_job = gaia_ruta_job($clave);

cache_lru_flujo(
    [
        'ruta' => $ruta, 'clave' => $clave, 'dir' => GAIA_CACHE_DIR, 'patron' => '*.json.gz',
        'max_bytes' => GAIA_CACHE_MAX_BYTES, 'lowwater' => GAIA_CACHE_LOWWATER, 'log' => GAIA_LOG_FILE,
        'codificar' => static fn(string $json) => gzencode($json, 6),
        'job' => $ruta_job,
        // Contrato 202 (ADR 0014): sin ETag y sin caché, que la respuesta cambia.
        'pendiente' => static function () use ($ruta_job): void {
            $e = gaia_cadena_estado($ruta_job);
            http_response_code(202);
            gaia_json_headers();
            header('Cache-Control: no-store');
            header('Retry-After: ' . GAIA_ASYNC_REINTENTAR);
            echo json_encode(['pendiente' => true, 'reintentar_en' => GAIA_ASYNC_REINTENTAR,
                'paso' => gaia_cadena_paso_num($e['paso'] ?? 'hist'), 'pasos' => count(GAIA_CADENA_PASOS)]);
            exit;
        },
    ],
    static function (?string &$etapa) use ($qra, $qdec, $qrad, $qmag, $ruta_job): string|false|null {
        return gaia_fetch($qra, $qdec, $qrad, $qmag, $ruta_job, $etapa);
    },
    static fn(string $estado, ?string $etapa) => gaia_servir($ruta, $clave, $estado, $etapa),
    static function (string $json): void {
        gaia_json_headers();
        echo $json;
        exit;
    },
    static function (): void {
        http_response_code(502);
        gaia_json_headers();
        echo json_encode(['error' => 'No hay respuesta de Gaia (CDS/GAVO)']);
        exit;
    }
);
