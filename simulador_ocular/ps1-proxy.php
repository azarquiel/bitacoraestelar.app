<?php
declare(strict_types=1);

/* ════════════════════════════════════════════════════════════════════════════
   PROXY DE ps1cutouts (STScI) CON CACHÉ LRU EN DISCO  —  parche por galaxia
   ────────────────────────────────────────────────────────────────────────────
   Recibe una galaxia (ra, dec en grados, lado en minutos de arco) y devuelve UN
   parche FITS ya cosido: resuelve las skycells que toca, pide el MISMO recorte a
   cada una y se queda con el primer píxel válido (fuera de su skycell, fitscut
   devuelve NaN).

   Sin él, el navegador hace hasta ocho peticiones por galaxia —cuatro de nombres
   y una de imagen por skycell, ~2,6 s cada recorte— y `fitscut.cgi` anuncia
   `Cache-Control: max-age=3600`, así que al día siguiente vuelve a pedirlo todo.
   Con él: una petición por galaxia, y disco a partir de la segunda vez.

   NO cambia un solo píxel: es latencia, nada más.

   Dos cosas que se pagan caras si se olvidan:
     · **`wcs=1` es obligatorio.** Sin él, `x`/`y` se leen como coordenadas de
       PÍXEL y el servicio responde 200 OK con un recorte de otro sitio, sin
       error y sin aviso.
     · **El nombre de skycell lo resuelve el servidor**, nunca el cliente: si se
       aceptara del parámetro, esto sería un proxy abierto hacia STScI.

   Ejemplo:  ps1-proxy.php?ra=202.4696&dec=47.1952&lado=8.5
   Test:     scripts/test_ps1_proxy.php
   ════════════════════════════════════════════════════════════════════════════ */

// ───────────────────────────── CONFIGURACIÓN ─────────────────────────────────
const PS1_BASE            = 'https://ps1images.stsci.edu/cgi-bin/';
const PS1_CACHE_DIR       = __DIR__ . '/cache-ps1';
const PS1_CACHE_MAX_BYTES = 150 * 1024 * 1024;   // objetivo de tamaño de la caché (best-effort, como el DSS)
const PS1_CACHE_LOWWATER  = 0.80;
const PS1_CONNECT_TIMEOUT = 8;                   // s: timeout de CONEXIÓN a STScI
const PS1_REQUEST_TIMEOUT = 30;                  // s: timeout TOTAL de CADA petición a STScI
const PS1_MIN_BYTES       = 2880;                // bytes: un FITS válido trae al menos un bloque de cabecera
const PS1_CLEANUP_EVERY   = 300;                 // s
const PS1_CLEANUP_MAX_DEL = 300;
const PS1_CLIENT_MAXAGE   = 31536000;            // s: 1 año (el parche es inmutable)
const PS1_ORPHAN_TTL      = 3600;
const PS1_ESCALA_NATIVA   = 0.25;                // ″/px del stack: el `size` de fitscut va en estos píxeles
const PS1_LADO_MIN        = 1.5;                 // ′  (mismos topes que la capa del render)
const PS1_LADO_MAX        = 20.0;                // ′
const PS1_SALIDA_MIN      = 64;                  // px
const PS1_SALIDA_MAX      = 1024;                // px
const PS1_BANDAS          = ['g', 'r', 'i', 'z', 'y'];
const PS1_MAX_CELDAS      = 4;                   // un parche de ≤20′ no puede tocar más de cuatro skycells

require_once __DIR__ . '/bitacora-cache-lru.php';

// ───────────────────────── FUNCIONES PURAS (testables) ───────────────────────

/** Banda a la lista blanca; por defecto `g`, la que usa la capa de galaxias. */
function ps1_banda_valida(string $b): string {
    return in_array($b, PS1_BANDAS, true) ? $b : 'g';
}

/** Lado del parche acotado a [1,5′, 20′], los mismos topes que el render. */
function ps1_acotar_lado(float $v): float {
    return round(min(PS1_LADO_MAX, max(PS1_LADO_MIN, $v)), 2);
}

/** Lado de salida en píxeles, acotado a [64, 1024]. */
function ps1_acotar_salida(int $v): int {
    return (int) min(PS1_SALIDA_MAX, max(PS1_SALIDA_MIN, $v));
}

/** ¿Es una coordenada utilizable? Rango, no formato: aquí llegan grados decimales. */
function ps1_coord_valida($ra, $dec): bool {
    if (!is_numeric($ra) || !is_numeric($dec)) {
        return false;
    }
    $r = (float) $ra;
    $d = (float) $dec;
    return $r >= 0.0 && $r <= 360.0 && $d >= -90.0 && $d <= 90.0;
}

/** Coordenada normalizada a 5 decimales (~0,04″): la misma que va a la clave y a la URL. */
function ps1_norm(float $g): string {
    return number_format($g, 5, '.', '');
}

/** Clave de caché determinista. Ni el ocular ni el aumento entran: el parche no depende de ellos. */
function ps1_clave(float $ra, float $dec, float $lado, int $salida, string $banda): string {
    return md5(ps1_norm($ra) . '|' . ps1_norm($dec) . '|' . number_format($lado, 2, '.', '')
        . '|' . $salida . '|' . $banda);
}

/** Ruta del parche cacheado de una clave. */
function ps1_ruta(string $clave): string {
    return PS1_CACHE_DIR . '/' . $clave . '.fits';
}

/** URL de la consulta de nombres de skycell de una posición. */
function ps1_url_nombres(float $ra, float $dec, string $banda): string {
    return PS1_BASE . 'ps1filenames.py?ra=' . ps1_norm($ra) . '&dec=' . ps1_norm($dec)
        . '&filters=' . rawurlencode($banda);
}

/**
 * URL de un recorte. `size` va en píxeles NATIVOS de 0,25″ y `output_size`
 * remuestrea (y corrige la WCS); `wcs=1` es lo que hace que x/y sean RA/Dec.
 */
function ps1_url_recorte(string $fichero, float $ra, float $dec, float $lado, int $salida): string {
    $size = (int) round($lado * 60 / PS1_ESCALA_NATIVA);
    return PS1_BASE . 'fitscut.cgi?red=' . rawurlencode($fichero)
        . '&x=' . ps1_norm($ra) . '&y=' . ps1_norm($dec)
        . '&size=' . $size . '&output_size=' . $salida
        . '&format=fits&wcs=1';
}

/**
 * Las cuatro esquinas del parche, por donde se averigua qué skycells toca. El
 * paso en RA se abre con 1/cos(dec) porque el parche es cuadrado EN EL CIELO.
 */
function ps1_esquinas(float $ra, float $dec, float $lado): array {
    $mitad = $lado / 120;                                  // grados
    $dra = $mitad / max(0.02, abs(cos(deg2rad($dec))));
    return [
        [$ra - $dra, $dec - $mitad], [$ra + $dra, $dec - $mitad],
        [$ra - $dra, $dec + $mitad], [$ra + $dra, $dec + $mitad],
    ];
}

/** Nombres de skycell de la respuesta de ps1filenames.py (la columna `filename` es la octava). */
function ps1_parse_nombres(string $texto): array {
    $out = [];
    $lineas = preg_split('/\r?\n/', trim($texto));
    foreach (array_slice($lineas ?: [], 1) as $linea) {
        $col = preg_split('/\s+/', trim($linea));
        if ($col !== false && count($col) >= 8 && substr($col[7], 0, 1) === '/') {
            $out[] = $col[7];
        }
    }
    return $out;
}

/** Une las listas de las cuatro esquinas: deduplicada y acotada. */
function ps1_celdas(array $listas): array {
    $celdas = [];
    foreach ($listas as $lista) {
        foreach ($lista as $f) {
            if (!in_array($f, $celdas, true)) {
                $celdas[] = $f;
            }
        }
    }
    return array_slice($celdas, 0, PS1_MAX_CELDAS);
}

/** Desplazamiento de los datos en un FITS: fin de la tarjeta END, redondeado al bloque de 2880. */
function ps1_offset_datos(string $fits): int {
    $n = strlen($fits);
    for ($i = 0; $i + 80 <= $n; $i += 80) {
        if (rtrim(substr($fits, $i, 8)) === 'END') {
            return (int) (ceil(($i + 80) / 2880) * 2880);
        }
    }
    return -1;
}

/** ¿Es NaN esta palabra de 32 bits (float32 big-endian)? Exponente a unos y mantisa no nula. */
function ps1_es_nan(int $w): bool {
    return ($w & 0x7F800000) === 0x7F800000 && ($w & 0x007FFFFF) !== 0;
}

/**
 * Cose los recortes de varias skycells: el mismo campo pedido a cada una, cada
 * una con NaN donde no llega. Se queda con el PRIMER píxel válido; el solape
 * entre dos skycells discrepa un 15 % (mediana), dominado por el ruido de cielo,
 * y promediar queda para si algún día se nota. Devuelve la cabecera de la
 * primera capa con los datos cosidos detrás, o null si no había ninguna válida.
 *
 * ponytail: parchea píxel a píxel sobre la cadena (unpack de las dos capas en
 * memoria, ~20 MB por capa a 512²). Si algún día molesta, ext/FFI o un buffer
 * binario por bloques; a cuatro capas y una vez por galaxia, no molesta.
 */
function ps1_fusionar(array $trozos): ?string {
    $capas = [];
    foreach ($trozos as $t) {
        if (!is_string($t) || strlen($t) < PS1_MIN_BYTES) {
            continue;
        }
        $off = ps1_offset_datos($t);
        if ($off < 0 || $off >= strlen($t)) {
            continue;
        }
        $capas[] = [substr($t, 0, $off), substr($t, $off)];
    }
    if (!$capas) {
        return null;
    }
    [$cabecera, $datos] = array_shift($capas);
    $n = strlen($datos);
    foreach ($capas as [, $otros]) {
        if (strlen($otros) !== $n) {
            continue;                       // otras dimensiones: no se puede coser píxel a píxel
        }
        $a = unpack('N*', $datos);
        $b = unpack('N*', $otros);
        if ($a === false || $b === false) {
            continue;
        }
        foreach ($a as $k => $v) {
            if (!ps1_es_nan($v) || ps1_es_nan($b[$k])) {
                continue;
            }
            $bin = pack('N', $b[$k]);
            $p = ($k - 1) * 4;
            $datos[$p] = $bin[0];
            $datos[$p + 1] = $bin[1];
            $datos[$p + 2] = $bin[2];
            $datos[$p + 3] = $bin[3];
        }
        unset($a, $b);
    }
    return $cabecera . $datos;
}

// ───────────────────────── EFECTOS (disco / red) ─────────────────────────────

/**
 * Descarga una URL de STScI con timeouts de conexión y de petición separados.
 * Devuelve el cuerpo de una respuesta 2xx, o null si falla.
 */
function ps1_fetch(string $url, int $min_bytes): ?string {
    $body = false;
    $http = 0;
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_CONNECTTIMEOUT => PS1_CONNECT_TIMEOUT,
            CURLOPT_TIMEOUT        => PS1_REQUEST_TIMEOUT,
            CURLOPT_USERAGENT      => 'simulador-ocular/1.0',
        ]);
        $body = curl_exec($ch);
        $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        // Sin curl_close(): no-op desde PHP 8, y en PHP 8.5 emite un deprecation
        // notice que se cuela DENTRO del cuerpo si display_errors está On.
    } else {
        $ctx = stream_context_create(['http' => [
            'timeout' => PS1_REQUEST_TIMEOUT,
            'user_agent' => 'simulador-ocular/1.0',
        ]]);
        $body = @file_get_contents($url, false, $ctx);
        $http = ($body !== false && $body !== '') ? 200 : 0;
    }
    if ($body !== false && strlen($body) >= $min_bytes && ($http === 0 || ($http >= 200 && $http < 300))) {
        return $body;
    }
    return null;
}

/**
 * Arma el parche pidiéndolo a STScI: nombres de skycell de las cuatro esquinas,
 * un recorte por skycell y la costura. Null si PS1 no cubre el campo o si el
 * servicio no responde (la capa se apaga sola y el aviso lo da el cliente).
 *
 * ponytail: peticiones en serie (≈8 s en el peor caso, una vez por galaxia y
 * luego disco). curl_multi si alguna vez hay que llenar la caché en caliente.
 */
function ps1_armar_parche(float $ra, float $dec, float $lado, int $salida, string $banda): ?string {
    $listas = [];
    foreach (ps1_esquinas($ra, $dec, $lado) as [$era, $edec]) {
        $t = ps1_fetch(ps1_url_nombres($era, $edec, $banda), 1);
        $listas[] = $t === null ? [] : ps1_parse_nombres($t);
    }
    $celdas = ps1_celdas($listas);
    if (!$celdas) {
        return null;                        // sin cobertura (δ < −30°, huecos del 3π)
    }
    $trozos = [];
    foreach ($celdas as $c) {
        $trozos[] = ps1_fetch(ps1_url_recorte($c, $ra, $dec, $lado, $salida), PS1_MIN_BYTES);
    }
    return ps1_fusionar($trozos);
}

/** Sirve un parche ya en memoria (sin caché ni ETag), último recurso. Termina. */
function ps1_servir_directo(string $datos): void {
    header('Access-Control-Allow-Origin: *');
    header('Content-Type: application/fits');
    header('Content-Length: ' . strlen($datos));
    echo $datos;
    exit;
}

/**
 * Sirve el parche de una entrada de caché con ETag/Cache-Control. 304 si el ETag
 * del cliente coincide. Termina la ejecución.
 */
function ps1_servir(string $fichero, string $clave): void {
    // ETag = la clave, como en el DSS: el acierto hace touch() (LRU) y cambia
    // mtime, así que el ETag no puede depender de él. El parche es inmutable:
    // PS1 DR2 es un archivo fijo y la petición es determinista.
    $etag = '"' . $clave . '"';

    header('Access-Control-Allow-Origin: *');
    header('Cache-Control: public, max-age=' . PS1_CLIENT_MAXAGE . ', immutable');
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
    header('Content-Type: application/fits');
    header('Content-Length: ' . strlen($datos));
    echo $datos;
    exit;
}

// ───────────────────────────────── FLUJO ─────────────────────────────────────
// En CLI (tests) solo se cargan las funciones puras, como en los otros dos proxies.
if (PHP_SAPI === 'cli') {
    return;
}

if (!is_dir(PS1_CACHE_DIR)) {
    @mkdir(PS1_CACHE_DIR, 0755, true);
}

if (!ps1_coord_valida($_GET['ra'] ?? null, $_GET['dec'] ?? null)) {
    http_response_code(400);
    exit('Coordenadas no válidas');
}
$ra     = (float) $_GET['ra'];
$dec    = (float) $_GET['dec'];
$lado   = ps1_acotar_lado((float) ($_GET['lado'] ?? PS1_LADO_MIN));
$salida = ps1_acotar_salida((int) ($_GET['salida'] ?? 512));
$banda  = ps1_banda_valida((string) ($_GET['banda'] ?? 'g'));

$clave   = ps1_clave($ra, $dec, $lado, $salida, $banda);
$fichero = ps1_ruta($clave);

// ── ACIERTO de caché ── (los parches son inmutables; no caducan)
if (is_file($fichero)) {
    @touch($fichero);                    // LRU: renueva su antigüedad
    ps1_servir($fichero, $clave);        // termina
}

// ── FALLO: armar el parche bajo bloqueo (evita estampida) ──
$lock = @fopen($fichero . '.lock', 'c');
if ($lock && flock($lock, LOCK_EX)) {
    // Otra petición pudo llenar la caché mientras esperábamos el lock.
    if (is_file($fichero)) {
        flock($lock, LOCK_UN);
        fclose($lock);
        ps1_servir($fichero, $clave);    // termina
    }

    $datos = ps1_armar_parche($ra, $dec, $lado, $salida, $banda);

    if ($datos === null) {
        flock($lock, LOCK_UN);
        fclose($lock);
        http_response_code(502);
        exit('ps1cutouts no respondió o no cubre ese campo');
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
    // El .lock no se borra: unlink mientras otro proceso lo tiene en flock es una
    // carrera. Es vacío, hay uno por parche, y la limpieza los retira si envejecen.

    cache_lru_limpieza([
        'dir' => PS1_CACHE_DIR, 'patron' => '*.fits',
        'max_bytes' => PS1_CACHE_MAX_BYTES, 'lowwater' => PS1_CACHE_LOWWATER,
        'max_del' => PS1_CLEANUP_MAX_DEL, 'cada' => PS1_CLEANUP_EVERY,
        'huerfano_ttl' => PS1_ORPHAN_TTL,
    ]);

    if (is_file($fichero)) {
        ps1_servir($fichero, $clave);    // termina
    }
    ps1_servir_directo($datos);          // termina
}

// No se pudo bloquear (caso raro): servir sin cachear.
if ($lock) {
    fclose($lock);
}
$datos = ps1_armar_parche($ra, $dec, $lado, $salida, $banda);
if ($datos !== null) {
    ps1_servir_directo($datos);          // termina
}
http_response_code(502);
exit('ps1cutouts no respondió o no cubre ese campo');
