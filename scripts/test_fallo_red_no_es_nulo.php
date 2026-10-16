<?php
declare(strict_types=1);
/* Test de la caché de las consultas a catálogos (issue #460).

   Un fallo de red (WP_Error, 429 o 5xx) no es «el objeto no existe»: no puede
   dejar 'nulo' 24 h en caché, solo un marcador corto 'fallo' de minutos. Un
   200 que dice «no está» sí sigue guardando 'nulo' 24 h. Y un marcador 'fallo'
   leído de la caché da null, nunca 0 (floatval('fallo') sería distancia 0).

   Sin WordPress real: postizos de wp_remote_* y de los transients sobre un
   array en memoria, con el patrón de test_observador_episodios.php.

   Sin framework:  php scripts/test_fallo_red_no_es_nulo.php  */

define('ABSPATH', sys_get_temp_dir() . '/bitacora_test_stub/wp-includes/../');
if (!is_dir(ABSPATH . 'wp-includes')) { mkdir(ABSPATH . 'wp-includes', 0777, true); }
define('WPINC', 'wp-includes');
file_put_contents(ABSPATH . WPINC . '/feed.php', '<?php // stub de test');
define('MINUTE_IN_SECONDS', 60);
define('HOUR_IN_SECONDS', 3600);
define('DAY_IN_SECONDS', 86400);

function add_action(...$a) {}
function register_activation_hook(...$a) {}

require __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-registro.php';

class WP_Error {}
function is_wp_error($x) { return $x instanceof WP_Error; }

// ── Red y caché de mentira ──────────────────────────────────────────────────
$respuestas = [];   // cola: lo que devuelve cada wp_remote_* en orden
$peticiones = 0;
$cache = [];        // clave => [valor, ttl]
function wp_remote_post($url, $args = []) { global $respuestas, $peticiones; $peticiones++; return array_shift($respuestas); }
function wp_remote_get($url, $args = [])  { global $respuestas, $peticiones; $peticiones++; return array_shift($respuestas); }
function wp_remote_retrieve_response_code($r) { return is_array($r) ? $r['code'] : ''; }
function wp_remote_retrieve_body($r) { return is_array($r) ? $r['body'] : ''; }
function add_query_arg($k, $v, $url) { return $url . '?' . $k . '=' . $v; }
function get_transient($k) { global $cache; return isset($cache[$k]) ? $cache[$k][0] : false; }
function set_transient($k, $v, $ttl) { global $cache; $cache[$k] = [$v, $ttl]; return true; }

function http($code, $body = '') { return ['code' => $code, 'body' => $body]; }
function preparar(array $cola): void { global $respuestas, $cache, $peticiones; $respuestas = $cola; $cache = []; $peticiones = 0; }
/** El único [valor, ttl] que quedó en caché. */
function cacheado(): ?array { global $cache; return count($cache) === 1 ? array_values($cache)[0] : null; }

$fallos = 0;
function eq($a, $b, string $et): void {
    global $fallos;
    if ($a === $b) { echo "  ok  $et\n"; }
    else { $fallos++; echo "  FALLA  $et\n    esperado " . var_export($b, true) . "\n    obtenido " . var_export($a, true) . "\n"; }
}
function es_fallo_corto(?array $c): bool { return $c !== null && $c[0] === 'fallo' && $c[1] <= HOUR_IN_SECONDS; }
function es_nulo_un_dia(?array $c): bool { return $c !== null && $c[0] === 'nulo' && $c[1] === DAY_IN_SECONDS; }

// Cada consulta con caché propia: [nombre, llamada, cuerpo 200 que dice «no está»].
$consultas = [
    ['bitacora_simbad',         fn() => bitacora_simbad('M 999'),            "ra,dec\n"],
    ['bitacora_vizier_dist_al', fn() => bitacora_vizier_dist_al('NGC 2024'), "Dist\n"],
    ['bitacora_oac_dist_al',    fn() => bitacora_oac_dist_al('M 999'),       '{}'],
    ['bitacora_ned_dist_al',    fn() => bitacora_ned_dist_al('M 999'),       '{}'],
    ['bitacora_gaia_bprp',      fn() => bitacora_gaia_bprp('123'),           "bprp\n"],
];

foreach ($consultas as [$nombre, $llamar, $no_esta]) {
    echo "$nombre:\n";
    // bitacora_gaia_bprp tiene dos proveedores: el fallo tiene que ser de los dos.
    $n = $nombre === 'bitacora_gaia_bprp' ? 2 : 1;

    preparar(array_fill(0, $n, new WP_Error()));
    eq($llamar(), null, 'WP_Error: devuelve null');
    eq(es_fallo_corto(cacheado()), true, "WP_Error: marcador 'fallo' de minutos, no 'nulo'");

    preparar(array_fill(0, $n, http(503)));
    $llamar();
    eq(es_fallo_corto(cacheado()), true, "503: marcador 'fallo' de minutos");

    preparar(array_fill(0, $n, http(429)));
    $llamar();
    eq(es_fallo_corto(cacheado()), true, "429: marcador 'fallo' de minutos");

    preparar(array_fill(0, $n, http(200, $no_esta)));
    eq($llamar(), null, '200 «no está»: devuelve null');
    eq(es_nulo_un_dia(cacheado()), true, "200 «no está»: 'nulo' 24 h, como siempre");

    preparar(array_fill(0, $n, new WP_Error()));
    $llamar();
    $c = cacheado();
    eq($c !== null && $c[0] === 'fallo' && $c[1] === BITACORA_TTL_FALLO_RED, true, "TTL del 'fallo': BITACORA_TTL_FALLO_RED");

    preparar(array_fill(0, $n, http(408)));
    $llamar();
    eq(es_fallo_corto(cacheado()), true, "408: marcador 'fallo' de minutos");

    // El marcador leído de la caché da null sin pedir nada (y nunca 0.0).
    preparar([]);
    $llamar();
    $clave = array_key_first($cache);
    preparar([]);
    $cache[$clave] = ['fallo', 5 * MINUTE_IN_SECONDS];
    eq($llamar(), null, "'fallo' en caché: null, no 0");
    eq($peticiones, 0, "'fallo' en caché: no repite la petición mientras dura");
}

echo "bitacora_gaia_bprp · un proveedor que contesta «no está» manda:\n";
preparar([new WP_Error(), http(200, "bprp\n")]);
bitacora_gaia_bprp('123');
eq(es_nulo_un_dia(cacheado()), true, "CDS caído y GAVO «no está»: 'nulo' 24 h");

echo "bitacora_simbad · la subconsulta del id de Gaia:\n";
$encontrado = "ra,dec,morph,otype,sp,dist,unit,plx,plx_err\n10.5,41.2,,Star,K3III,,,,\n";
preparar([http(200, $encontrado), new WP_Error()]);
$sim = bitacora_simbad('Gamma And');
eq($sim['ra'], 10.5, 'el objeto se resuelve aunque falle la subconsulta');
eq($sim['gaia_dr3_id'], null, 'gaia_dr3_id null, nunca false');
$c = cacheado();
eq($c !== null && $c[0]['gaia_dr3_id'] === null && $c[1] <= HOUR_IN_SECONDS, true,
    'subconsulta caída: el resultado se cachea minutos, no 30 días');

preparar([http(200, $encontrado), http(200, "id\n")]);
bitacora_simbad('Gamma And');
eq(cacheado()[1], 30 * DAY_IN_SECONDS, 'subconsulta «no tiene id de Gaia»: 30 días, como siempre');

echo $fallos ? "\n$fallos FALLOS\n" : "\nTodo bien.\n";
exit($fallos ? 1 : 0);
