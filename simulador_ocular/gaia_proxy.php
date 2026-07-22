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
     · Caché LRU en disco con tope de tamaño (500 MB) y TTL.
     · Cuantización de ra/dec/rad/mag → más aciertos de caché (regiones cercanas
       comparten entrada).
     · Compresión gzip en disco; negociación por Accept-Encoding (sirve gzip si el
       cliente lo acepta, si no descomprime).
     · Cabeceras ETag + Cache-Control; responde 304 ante If-None-Match.
     · Timeouts de conexión y de petición separados.
     · Bloqueo de concurrencia (flock) para evitar estampidas y escrituras a medias.
     · Limpieza LRU incremental (no en cada petición; acotada por pasada).
     · Estadísticas (aciertos/fallos/evicciones/bytes) en stats.json; ?stats=1 las
       devuelve.
     · Logs opcionales.
     · Creación automática del directorio de caché.

   Endpoints:
     GET ?ra=..&dec=..&rad=..&mag=..   → datos Gaia (JSON)
     GET ?stats=1                      → estadísticas de la caché (JSON)
   ════════════════════════════════════════════════════════════════════════════ */

// ───────────────────────────── CONFIGURACIÓN ─────────────────────────────────
const GAIA_CACHE_DIR       = __DIR__ . '/cache_gaia';
const GAIA_CACHE_MAX_BYTES = 500 * 1024 * 1024;   // objetivo de tamaño de la caché (500 MB, best-effort: se aplica en la limpieza incremental)
const GAIA_CACHE_LOWWATER  = 0.90;                // tras evict, bajar hasta el 90% del tope
const GAIA_CACHE_TTL       = 30 * 24 * 3600;      // caducidad de una entrada (30 días)
const GAIA_CONNECT_TIMEOUT = 8;                   // s: timeout de CONEXIÓN a los TAP
const GAIA_REQUEST_TIMEOUT = 25;                  // s: timeout TOTAL de la petición
const GAIA_QUANT_RADEC     = 0.001;               // ° : cuantización del centro (~3,6")
const GAIA_QUANT_RAD       = 0.01;                // ° : cuantización del radio (se redondea ↑)
const GAIA_QUANT_MAG       = 0.5;                 // mag: cuantización del límite (se redondea ↑)
const GAIA_MAX_ROWS        = 40000;              // TOP N de la consulta
const GAIA_CLEANUP_EVERY   = 300;                // s: limpieza como mucho cada 5 min
const GAIA_CLEANUP_MAX_DEL = 300;                // nº máx. de entradas a borrar por pasada (incremental)
const GAIA_CLIENT_MAXAGE   = 86400;              // s: Cache-Control max-age que se anuncia al navegador
const GAIA_LOG_ENABLED     = false;             // logs opcionales
const GAIA_LOG_FILE        = GAIA_CACHE_DIR . '/proxy.log';
const GAIA_STATS_FILE      = GAIA_CACHE_DIR . '/stats.json';
const GAIA_CLEANUP_STAMP   = GAIA_CACHE_DIR . '/.cleanup';

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

/** Clave de caché determinista a partir de los parámetros ya cuantizados. */
function gaia_clave(float $ra, float $dec, float $rad, float $mag): string {
    return sha1(sprintf('%.3f_%.3f_%.2f_%.2f', $ra, $dec, $rad, $mag));
}

/** Ruta del fichero de caché (gzip) de una clave. */
function gaia_ruta(string $clave): string {
    return GAIA_CACHE_DIR . '/' . $clave . '.json.gz';
}

/**
 * Selecciona qué entradas evictar (LRU) para bajar el tamaño total por debajo del
 * nivel bajo. PURA: recibe la lista [ [ruta, tamaño, mtime], ... ], no toca disco.
 * Ordena por mtime ascendente (más viejas primero) y acumula hasta bajar del
 * objetivo o alcanzar el máximo de borrados por pasada (limpieza incremental).
 * Devuelve [ 'rutas' => string[], 'liberado' => int ].
 */
function gaia_seleccionar_evict(array $lista, int $total, int $max_bytes, float $lowwater, int $max_del): array {
    $objetivo = (int) ($max_bytes * $lowwater);
    if ($total <= $max_bytes) {
        return ['rutas' => [], 'liberado' => 0];
    }
    usort($lista, static fn($a, $b) => $a[2] <=> $b[2]);   // más antiguas primero
    $rutas = [];
    $liberado = 0;
    foreach ($lista as [$ruta, $size, $mtime]) {
        if ($total - $liberado <= $objetivo || count($rutas) >= $max_del) {
            break;
        }
        $rutas[] = $ruta;
        $liberado += $size;
    }
    return ['rutas' => $rutas, 'liberado' => $liberado];
}

/** URLs de proveedores TAP (failover), en orden de preferencia. */
function gaia_proveedores(float $ra, float $dec, float $rad, float $mag): array {
    $cds = 'SELECT TOP ' . GAIA_MAX_ROWS . ' RA_ICRS, DE_ICRS, Gmag, "BP-RP" FROM "I/355/gaiadr3"'
        . ' WHERE Gmag<=' . $mag . ' AND 1=CONTAINS(POINT(\'ICRS\',RA_ICRS,DE_ICRS),'
        . ' CIRCLE(\'ICRS\',' . $ra . ',' . $dec . ',' . $rad . ')) ORDER BY Gmag';
    $gavo = 'SELECT TOP ' . GAIA_MAX_ROWS . ' ra,dec,phot_g_mean_mag,phot_bp_mean_mag-phot_rp_mean_mag AS bprp'
        . ' FROM gaia.dr3lite WHERE phot_g_mean_mag<=' . $mag . ' AND 1=CONTAINS(POINT(\'ICRS\',ra,dec),'
        . ' CIRCLE(\'ICRS\',' . $ra . ',' . $dec . ',' . $rad . ')) ORDER BY phot_g_mean_mag';
    return [
        'https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync?request=doQuery&lang=adql&format=json&query=' . rawurlencode($cds),
        'https://dc.zah.uni-heidelberg.de/tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY=' . rawurlencode($gavo),
    ];
}

// ───────────────────────── EFECTOS (disco / red / stats) ─────────────────────

/** Cabeceras comunes de una respuesta JSON del proxy (incl. CORS). */
function gaia_json_headers(): void {
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
}

/**
 * Consulta los proveedores TAP en orden (failover) con timeouts de conexión y de
 * petición separados. Devuelve el primer cuerpo de una respuesta 2xx no vacía, o
 * null si todos fallan.
 */
function gaia_fetch(float $ra, float $dec, float $rad, float $mag): ?string {
    foreach (gaia_proveedores($ra, $dec, $rad, $mag) as $url) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => GAIA_CONNECT_TIMEOUT,
            CURLOPT_TIMEOUT        => GAIA_REQUEST_TIMEOUT,
            CURLOPT_ENCODING       => '',   // acepta gzip del TAP y lo descomprime
        ]);
        $body = curl_exec($ch);
        $http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($http >= 200 && $http < 300 && $body !== false && $body !== '') {
            return $body;
        }
    }
    return null;
}

function gaia_log(string $evento, array $ctx = []): void {
    if (!GAIA_LOG_ENABLED) {
        return;
    }
    $linea = gmdate('c') . ' ' . $evento . ' ' . json_encode($ctx, JSON_UNESCAPED_SLASHES) . "\n";
    @file_put_contents(GAIA_LOG_FILE, $linea, FILE_APPEND | LOCK_EX);
}

/** Actualiza stats.json de forma atómica (read-modify-write bajo flock). */
function gaia_stats(array $delta): void {
    $fh = @fopen(GAIA_STATS_FILE, 'c+');
    if (!$fh) {
        return;
    }
    if (flock($fh, LOCK_EX)) {
        $raw = stream_get_contents($fh);
        $s = json_decode($raw ?: '{}', true) ?: [];
        foreach ($delta as $k => $v) {
            $s[$k] = ($s[$k] ?? 0) + $v;
        }
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, json_encode($s));
        fflush($fh);
        flock($fh, LOCK_UN);
    }
    fclose($fh);
}

/** Limpieza LRU incremental: como mucho una vez cada GAIA_CLEANUP_EVERY segundos. */
function gaia_limpieza_incremental(): void {
    // El "stamp" evita que cada petición escanee el directorio. Se actualiza ANTES
    // de escanear para que peticiones concurrentes no disparen la limpieza a la vez.
    $ultima = @filemtime(GAIA_CLEANUP_STAMP) ?: 0;
    if (time() - $ultima < GAIA_CLEANUP_EVERY) {
        return;
    }
    @touch(GAIA_CLEANUP_STAMP);

    $ahora = time();
    $lista = [];
    $total = 0;
    $borrados_ttl = 0;
    foreach (glob(GAIA_CACHE_DIR . '/*.json.gz') ?: [] as $f) {
        $mtime = @filemtime($f);
        $size = @filesize($f);
        if ($mtime === false || $size === false) {
            continue;
        }
        if ($ahora - $mtime >= GAIA_CACHE_TTL) {   // caducadas: fuera directamente
            @unlink($f);
            $borrados_ttl++;
            continue;
        }
        $lista[] = [$f, $size, $mtime];
        $total += $size;
    }

    $plan = gaia_seleccionar_evict($lista, $total, GAIA_CACHE_MAX_BYTES, GAIA_CACHE_LOWWATER, GAIA_CLEANUP_MAX_DEL);
    foreach ($plan['rutas'] as $f) {
        @unlink($f);
    }

    // Barrido de .lock y .tmp huérfanos: solo los MÁS VIEJOS que el TTL (ningún fetch
    // activo los usa a esas alturas), así el unlink no compite con un flock en curso.
    foreach (array_merge(glob(GAIA_CACHE_DIR . '/*.lock') ?: [], glob(GAIA_CACHE_DIR . '/*.tmp*') ?: []) as $f) {
        if (($mt = @filemtime($f)) !== false && $ahora - $mt >= GAIA_CACHE_TTL) {
            @unlink($f);
        }
    }
    if ($borrados_ttl || $plan['rutas']) {
        gaia_stats(['evictions' => $borrados_ttl + count($plan['rutas'])]);
        gaia_log('cleanup', ['ttl' => $borrados_ttl, 'lru' => count($plan['rutas']), 'liberado' => $plan['liberado']]);
    }
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

if (!is_dir(GAIA_CACHE_DIR)) {
    @mkdir(GAIA_CACHE_DIR, 0775, true);
}

// Endpoint de estadísticas.
if (isset($_GET['stats'])) {
    gaia_json_headers();
    $s = json_decode(@file_get_contents(GAIA_STATS_FILE) ?: '{}', true) ?: [];
    $entradas = glob(GAIA_CACHE_DIR . '/*.json.gz') ?: [];
    $bytes = 0;
    foreach ($entradas as $f) {
        $bytes += (int) @filesize($f);
    }
    $s['entries'] = count($entradas);
    $s['size_bytes'] = $bytes;
    $s['size_mb'] = round($bytes / 1048576, 1);
    echo json_encode($s);
    exit;
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

[$qra, $qdec, $qrad, $qmag] = gaia_cuantizar((float) $ra, (float) $dec, (float) $rad, (float) $mag);
$clave = gaia_clave($qra, $qdec, $qrad, $qmag);
$ruta = gaia_ruta($clave);

// ── ACIERTO de caché (entrada fresca) ──
if (is_file($ruta) && (time() - filemtime($ruta) < GAIA_CACHE_TTL)) {
    @touch($ruta);                       // LRU: renueva su antigüedad
    gaia_stats(['hits' => 1]);
    gaia_log('hit', ['clave' => $clave]);
    gaia_servir($ruta, $clave);          // termina
}

// ── FALLO: consultar los TAP bajo bloqueo (evita estampida) ──
$lock = @fopen($ruta . '.lock', 'c');
if ($lock && flock($lock, LOCK_EX)) {
    // Otra petición pudo llenar la caché mientras esperábamos el lock.
    if (is_file($ruta) && (time() - filemtime($ruta) < GAIA_CACHE_TTL)) {
        flock($lock, LOCK_UN);
        fclose($lock);
        gaia_stats(['hits' => 1]);
        gaia_servir($ruta, $clave);      // termina
    }

    $json = gaia_fetch($qra, $qdec, $qrad, $qmag);

    if ($json === null) {
        flock($lock, LOCK_UN);
        fclose($lock);
        gaia_stats(['misses' => 1, 'errors' => 1]);
        gaia_log('upstream_fail', ['clave' => $clave]);
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

    gaia_stats(['misses' => 1, 'bytes_upstream' => strlen($json)]);
    gaia_log('miss', ['clave' => $clave, 'bytes' => strlen($json)]);
    gaia_limpieza_incremental();

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
