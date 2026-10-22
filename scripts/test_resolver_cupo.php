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

require __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-registro.php';

$cache = [];
function get_transient($k) { global $cache; return isset($cache[$k]) ? $cache[$k] : false; }
function set_transient($k, $v, $ttl) { global $cache; $cache[$k] = $v; return true; }

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

eq(bitacora_resolver_q_valida('M104'), true, 'q normal');
eq(bitacora_resolver_q_valida('   '), false, 'q vacía');
eq(bitacora_resolver_q_valida(str_repeat('a', 101)), false, 'q de 101 caracteres');
eq(bitacora_resolver_q_valida(str_repeat('a', 100)), true, 'q de 100 caracteres');

echo $fallos ? "\n$fallos FALLOS\n" : "\nTodo ok\n";
exit($fallos ? 1 : 0);
