<?php
declare(strict_types=1);
/* Test del cupo anónimo de /resolver (issue #469).

   N consultas sin caché por ventana y por IP; la N+1 da los segundos que faltan;
   otra IP no se ve afectada; al acabar la ventana el contador vuelve a cero.
   `q` se valida: vacío o de más de 100 caracteres no pasa.

   Sin framework:  php scripts/test_resolver_cupo.php  */

define('ABSPATH', sys_get_temp_dir() . '/bitacora_test_stub/wp-includes/../');
if (!is_dir(ABSPATH . 'wp-includes')) { mkdir(ABSPATH . 'wp-includes', 0777, true); }
define('WPINC', 'wp-includes');
file_put_contents(ABSPATH . WPINC . '/feed.php', '<?php // stub de test');
define('MINUTE_IN_SECONDS', 60);
define('HOUR_IN_SECONDS', 3600);
define('DAY_IN_SECONDS', 86400);

function add_action(...$a) {}
function register_activation_hook(...$a) {}
// La versión sale de la cabecera del plugin, como en WordPress.
function get_file_data( $archivo, $cabeceras ) {
    preg_match( '/^[ \t\/*#@]*Version:(.*)$/mi', (string) file_get_contents( $archivo ), $m );
    return array( 'v' => trim( $m[1] ?? '' ) );
}

require __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-registro.php';

$cache = [];
$pasos = [];   // qué hace el cupo, en orden: bloqueo, lectura, escritura, suelta
function get_transient($k) { global $cache, $pasos; $pasos[] = 'leer'; return isset($cache[$k]) ? $cache[$k] : false; }
function set_transient($k, $v, $ttl) { global $cache, $pasos; $pasos[] = 'escribir'; $cache[$k] = $v; return true; }

/* $wpdb mínimo para el bloqueo con nombre (GET_LOCK / RELEASE_LOCK). `$concede`
   a false imita una BD que no lo da (tiempo agotado, o sin esa función). */
class WpdbBloqueo {
    public $concede = true;
    public function prepare($sql, ...$a) { return str_replace('%s', "'" . $a[0] . "'", $sql); }
    public function get_var($sql) { global $pasos; $pasos[] = 'bloquear'; return $this->concede ? '1' : null; }
    public function query($sql) { global $pasos; $pasos[] = 'soltar'; return 1; }
}
$wpdb = new WpdbBloqueo();

$fallos = 0;
function eq($a, $b, string $et): void {
    global $fallos;
    if ($a === $b) { echo "  ok  $et\n"; }
    else { $fallos++; echo "  FALLA  $et\n    esperado " . var_export($b, true) . "\n    obtenido " . var_export($a, true) . "\n"; }
}

$t = 1000;
$pasan = 0;
for ($i = 0; $i < BITACORA_RESOLVER_MAX; $i++) { $pasan += bitacora_resolver_cupo('1.2.3.4', $t + $i) === 0 ? 1 : 0; }
eq($pasan, BITACORA_RESOLVER_MAX, 'las primeras N pasan');
eq(bitacora_resolver_cupo('1.2.3.4', $t + 30), BITACORA_RESOLVER_VENTANA - 30, 'la N+1 devuelve los segundos que quedan');
eq(bitacora_resolver_cupo('1.2.3.4', $t + 59) > 0, true, 'sigue bloqueada dentro de la ventana');
eq(bitacora_resolver_cupo('5.6.7.8', $t + 30), 0, 'otra IP no se ve afectada');
eq(bitacora_resolver_cupo('1.2.3.4', $t + BITACORA_RESOLVER_VENTANA), 0, 'al acabar la ventana vuelve a pasar');

// Leer, sumar y guardar van bajo el bloqueo: sin él, N peticiones a la vez leen
// el mismo contador y pasan todas.
$pasos = [];
bitacora_cupo('atomico', $t, 5, 60);
eq($pasos, ['bloquear', 'leer', 'escribir', 'soltar'], 'el contador se lee y se escribe con el bloqueo tomado');
$cache = []; $pasos = [];
for ($i = 0; $i < 6; $i++) { $ultimo = bitacora_cupo('atomico', $t, 5, 60); }
eq([$ultimo > 0, end($pasos)], [true, 'soltar'], 'y se suelta también cuando la petición se rechaza');
// Sin bloqueo el cupo sigue contando (no deja de proteger ni de dejar pasar).
$wpdb->concede = false;
$cache = []; $pasos = [];
eq(bitacora_cupo('sin-bloqueo', $t, 1, 60), 0, 'sin bloqueo, la primera pasa');
eq(bitacora_cupo('sin-bloqueo', $t, 1, 60) > 0, true, 'y la segunda se frena igual');
eq(in_array('soltar', $pasos, true), false, 'un bloqueo que no se tomó no se suelta');
$wpdb->concede = true;

eq(bitacora_resolver_q_valida('M104'), true, 'q normal');
eq(bitacora_resolver_q_valida('   '), false, 'q vacía');
eq(bitacora_resolver_q_valida(str_repeat('a', 101)), false, 'q de 101 caracteres');
eq(bitacora_resolver_q_valida(str_repeat('a', 100)), true, 'q de 100 caracteres');

echo $fallos ? "\n$fallos FALLOS\n" : "\nTodo ok\n";
exit($fallos ? 1 : 0);
