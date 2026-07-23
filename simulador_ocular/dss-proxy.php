<?php
declare(strict_types=1);

/* ════════════════════════════════════════════════════════════════════════════
   PROXY DEL DSS CON CACHÉ LRU EN DISCO  (respaldo servidor del simulador)
   ────────────────────────────────────────────────────────────────────────────
   Recibe ra/dec/x/y/Sky-Survey, descarga la placa del DSS (archive.eso.org) y
   la cachea en disco: una vez cacheada, se sirve del disco sin volver a pedirla.

   Caché LRU en disco con tope de tamaño (150 MB), limpieza incremental (no en
   cada petición), y bloqueo flock para evitar estampidas y escrituras a medias
   (temp + rename). ETag/Cache-Control para el navegador.

   Ejemplo:  dss-proxy.php?ra=05+35+17&dec=-05+23+28&x=84&y=84
   ════════════════════════════════════════════════════════════════════════════ */

// ───────────────────────────── CONFIGURACIÓN ─────────────────────────────────
const DSS_CACHE_DIR       = __DIR__ . '/cache-dss';
const DSS_CACHE_MAX_BYTES = 150 * 1024 * 1024;   // objetivo de tamaño de la caché (150 MB, best-effort: se aplica en la limpieza incremental)
const DSS_CACHE_LOWWATER  = 0.80;                // tras evict, bajar hasta el 80% del tope
const DSS_CONNECT_TIMEOUT = 8;                   // s: timeout de CONEXIÓN al archivo del ESO
const DSS_REQUEST_TIMEOUT = 40;                  // s: timeout TOTAL de la petición
const DSS_MAX_ARCMIN      = 120;                 // ' : campo máximo que admite el DSS
const DSS_MIN_BYTES       = 200;                 // bytes: por debajo se considera respuesta inválida
const DSS_CLEANUP_EVERY   = 300;                 // s: limpieza como mucho cada 5 min
const DSS_CLEANUP_MAX_DEL = 300;                 // nº máx. de entradas a borrar por pasada (incremental)
const DSS_CLIENT_MAXAGE   = 31536000;            // s: Cache-Control max-age que se anuncia al navegador (1 año)
const DSS_ORPHAN_TTL      = 3600;                // s: edad mínima de un .lock/.tmp huérfano para retirarlo
const DSS_CLEANUP_STAMP   = DSS_CACHE_DIR . '/.cleanup';
const DSS_SURVEYS         = ['DSS1', 'DSS2-red', 'DSS2-blue', 'DSS2-infrared'];

// ───────────────────────── FUNCIONES PURAS (testables) ───────────────────────

/**
 * Valida una coordenada (ra o dec): solo dígitos, espacios, signos, puntos y dos
 * puntos, de 1 a 24 caracteres. Evita que el script se use como proxy abierto.
 */
function dss_validar_coord(string $c): bool {
    return (bool) preg_match('/^[0-9+\-.: ]{1,24}$/', $c);
}

/** Normaliza el reconocimiento al de la lista blanca; por defecto DSS1. */
function dss_survey_valido(string $sv): string {
    return in_array($sv, DSS_SURVEYS, true) ? $sv : 'DSS1';
}

/** Acota el campo (x o y) al rango admitido por el DSS: [1, DSS_MAX_ARCMIN]. */
function dss_acotar_campo(float $v): float {
    return min((float) DSS_MAX_ARCMIN, max(1.0, $v));
}

/** Clave de caché determinista a partir de los parámetros (ya normalizados). */
function dss_clave(string $ra, string $dec, float $x, float $y, string $sv): string {
    return md5($ra . '|' . $dec . '|' . $x . '|' . $y . '|' . $sv);
}

/** Ruta del fichero de caché (GIF) de una clave. */
function dss_ruta(string $clave): string {
    return DSS_CACHE_DIR . '/' . $clave . '.gif';
}

/** URL del archivo del ESO para descargar la placa. */
function dss_url(string $ra, string $dec, float $x, float $y, string $sv): string {
    return 'https://archive.eso.org/dss/dss/image'
        . '?ra=' . rawurlencode($ra)
        . '&dec=' . rawurlencode($dec)
        . '&equinox=J2000&name='
        . '&x=' . $x . '&y=' . $y
        . '&Sky-Survey=' . rawurlencode($sv) . '&mime-type=download-gif';
}

/**
 * Selecciona qué entradas evictar (LRU) para bajar el tamaño total por debajo del
 * nivel bajo. PURA: recibe la lista [ [ruta, tamaño, mtime], ... ], no toca disco.
 * Ordena por mtime ascendente (más viejas primero) y acumula hasta bajar del
 * objetivo o alcanzar el máximo de borrados por pasada (limpieza incremental).
 * Devuelve [ 'rutas' => string[], 'liberado' => int ].
 */
function dss_seleccionar_evict(array $lista, int $total, int $max_bytes, float $lowwater, int $max_del): array {
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

// ───────────────────────── EFECTOS (disco / red) ─────────────────────────────

/**
 * Descarga la placa del archivo del ESO con timeouts de conexión y de petición
 * separados. Devuelve el cuerpo de una respuesta 2xx suficientemente grande, o
 * null si falla o es demasiado pequeña para ser una imagen válida.
 */
function dss_fetch(string $url): ?string {
    $body = false;
    $http = 0;
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_CONNECTTIMEOUT => DSS_CONNECT_TIMEOUT,
            CURLOPT_TIMEOUT        => DSS_REQUEST_TIMEOUT,
            CURLOPT_USERAGENT      => 'simulador-ocular/1.0',
        ]);
        $body = curl_exec($ch);
        $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
    } else {
        $ctx = stream_context_create(['http' => [
            'timeout' => DSS_REQUEST_TIMEOUT,
            'user_agent' => 'simulador-ocular/1.0',
        ]]);
        $body = @file_get_contents($url, false, $ctx);
        // Sin cURL no hay código HTTP fiable; un cuerpo no vacío se da por bueno.
        $http = ($body !== false && $body !== '') ? 200 : 0;
    }
    if ($body !== false && strlen($body) >= DSS_MIN_BYTES && ($http === 0 || ($http >= 200 && $http < 300))) {
        return $body;
    }
    return null;
}

/** Limpieza LRU incremental: como mucho una vez cada DSS_CLEANUP_EVERY segundos. */
function dss_limpieza_incremental(): void {
    // El "stamp" evita que cada petición escanee el directorio. Se actualiza ANTES
    // de escanear para que peticiones concurrentes no disparen la limpieza a la vez.
    $ultima = @filemtime(DSS_CLEANUP_STAMP) ?: 0;
    if (time() - $ultima < DSS_CLEANUP_EVERY) {
        return;
    }
    @touch(DSS_CLEANUP_STAMP);

    $ahora = time();
    $lista = [];
    $total = 0;
    foreach (glob(DSS_CACHE_DIR . '/*.gif') ?: [] as $f) {
        $mtime = @filemtime($f);
        $size = @filesize($f);
        if ($mtime === false || $size === false) {
            continue;
        }
        $lista[] = [$f, $size, $mtime];
        $total += $size;
    }

    $plan = dss_seleccionar_evict($lista, $total, DSS_CACHE_MAX_BYTES, DSS_CACHE_LOWWATER, DSS_CLEANUP_MAX_DEL);
    foreach ($plan['rutas'] as $f) {
        @unlink($f);
    }

    // Barrido de .lock y .tmp huérfanos: solo los más viejos que DSS_ORPHAN_TTL (ningún
    // fetch activo los usa a esas alturas), así el unlink no compite con un flock en curso.
    foreach (array_merge(glob(DSS_CACHE_DIR . '/*.lock') ?: [], glob(DSS_CACHE_DIR . '/*.tmp*') ?: []) as $f) {
        if (($mt = @filemtime($f)) !== false && $ahora - $mt >= DSS_ORPHAN_TTL) {
            @unlink($f);
        }
    }
}

/**
 * Sirve unos datos GIF ya en memoria (sin caché ni ETag), como último recurso
 * cuando no se pudo escribir/leer la entrada de disco. Termina la ejecución.
 */
function dss_servir_directo(string $datos): void {
    header('Access-Control-Allow-Origin: *');
    header('Content-Type: image/gif');
    header('Content-Length: ' . strlen($datos));
    echo $datos;
    exit;
}

/**
 * Sirve la placa GIF de una entrada de caché con ETag/Cache-Control. Responde 304
 * si el ETag del cliente coincide. Termina la ejecución.
 */
function dss_servir(string $fichero, string $clave): void {
    // ETag = la clave. El acierto de caché hace touch() (para el LRU), que cambia
    // mtime; por eso el ETag NO puede depender de mtime o nunca habría 304. La placa
    // de una región es inmutable (el DSS es un archivo fijo y la petición es
    // determinista), así que la clave identifica el contenido de forma estable.
    $etag = '"' . $clave . '"';

    header('Access-Control-Allow-Origin: *');
    header('Cache-Control: public, max-age=' . DSS_CLIENT_MAXAGE . ', immutable');
    header('ETag: ' . $etag);

    if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) {
        http_response_code(304);
        exit;
    }

    $datos = file_get_contents($fichero);
    if ($datos === false) {
        http_response_code(500);
        exit('No se pudo leer la caché');
    }
    header('Content-Type: image/gif');
    header('Content-Length: ' . strlen($datos));
    echo $datos;
    exit;
}

// ───────────────────────────────── FLUJO ─────────────────────────────────────
// En CLI (tests) solo se cargan las funciones puras; el manejo de la petición web
// no se ejecuta. El proxy real corre bajo SAPI web (fpm/apache).
if (PHP_SAPI === 'cli') {
    return;
}

if (!is_dir(DSS_CACHE_DIR)) {
    @mkdir(DSS_CACHE_DIR, 0755, true);
}

$ra  = $_GET['ra']  ?? '';
$dec = $_GET['dec'] ?? '';
$x   = dss_acotar_campo(floatval($_GET['x'] ?? 30));
$y   = dss_acotar_campo(floatval($_GET['y'] ?? 30));
$sv  = dss_survey_valido($_GET['Sky-Survey'] ?? 'DSS1');

if (!dss_validar_coord($ra) || !dss_validar_coord($dec)) {
    http_response_code(400);
    exit('Coordenadas no válidas');
}

$clave   = dss_clave($ra, $dec, $x, $y, $sv);
$fichero = dss_ruta($clave);

// ── ACIERTO de caché ── (las placas son inmutables; no caducan)
if (is_file($fichero)) {
    @touch($fichero);                    // LRU: renueva su antigüedad
    dss_servir($fichero, $clave);        // termina
}

// ── FALLO: descargar la placa bajo bloqueo (evita estampida) ──
$lock = @fopen($fichero . '.lock', 'c');
if ($lock && flock($lock, LOCK_EX)) {
    // Otra petición pudo llenar la caché mientras esperábamos el lock.
    if (is_file($fichero)) {
        flock($lock, LOCK_UN);
        fclose($lock);
        dss_servir($fichero, $clave);    // termina
    }

    $datos = dss_fetch(dss_url($ra, $dec, $x, $y, $sv));

    if ($datos === null) {
        flock($lock, LOCK_UN);
        fclose($lock);
        http_response_code(502);
        exit('El servidor del DSS no respondió');
    }

    // Escritura ATÓMICA (temp + rename) para no dejar ficheros a medias.
    $tmp = $fichero . '.tmp' . getmypid();
    if (file_put_contents($tmp, $datos) !== false) {
        @rename($tmp, $fichero);
    } else {
        @unlink($tmp);
    }
    flock($lock, LOCK_UN);
    fclose($lock);
    // El fichero .lock NO se borra: unlink mientras otro proceso lo tiene abierto en
    // flock es una condición de carrera. Es vacío y hay uno por placa; la limpieza
    // incremental los retira si envejecen.

    dss_limpieza_incremental();

    if (is_file($fichero)) {
        dss_servir($fichero, $clave);    // termina
    }
    // Si por lo que sea no se escribió la caché, servimos la placa directa.
    dss_servir_directo($datos);          // termina
}

// No se pudo bloquear (caso raro): servir sin cachear con una descarga directa.
if ($lock) {
    fclose($lock);
}
$datos = dss_fetch(dss_url($ra, $dec, $x, $y, $sv));
if ($datos !== null) {
    dss_servir_directo($datos);          // termina
}
http_response_code(502);
exit('El servidor del DSS no respondió');
