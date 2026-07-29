<?php
declare(strict_types=1);
/* Test de las funciones PURAS del proxy de Gaia (simulador_ocular/gaia_proxy.php).
   Cubre cuantización, determinismo de la clave y selección de evicción LRU.
   Sin framework:  php scripts/test_gaia_proxy.php
   (El manejo de la petición web no se ejecuta bajo CLI: el proxy hace `return`
   temprano cuando PHP_SAPI === 'cli'.) */

require __DIR__ . '/../simulador_ocular/gaia_proxy.php';

$fallos = 0;
function eq($a, $b, string $et): void {
    global $fallos;
    if ($a === $b) { echo "  ok   $et\n"; }
    else { $fallos++; echo "  FALLA $et\n         esperado " . var_export($b, true) . "\n         obtenido " . var_export($a, true) . "\n"; }
}
function ok(bool $c, string $et): void {
    global $fallos;
    if ($c) { echo "  ok   $et\n"; } else { $fallos++; echo "  FALLA $et\n"; }
}

echo "gaia_cuantizar (centro redondea, radio/mag redondean ↑):\n";
// centro: 56.7503 -> 56.75 (paso 0.001);  radio 0.357 -> 0.36 (↑ 0.01);  mag 16.2 -> 16.5 (↑ 0.5)
eq(gaia_cuantizar(56.7503, 24.1149, 0.357, 16.2), [56.75, 24.115, 0.36, 16.5], 'redondeos básicos');
// idempotencia: cuantizar dos veces da lo mismo
$q1 = gaia_cuantizar(56.7503, 24.1149, 0.357, 16.2);
eq(gaia_cuantizar($q1[0], $q1[1], $q1[2], $q1[3]), $q1, 'idempotente');
// dos centros muy cercanos caen en la misma celda (mejora aciertos)
eq(gaia_cuantizar(56.7501, 24.1149, 0.36, 16.5), gaia_cuantizar(56.7504, 24.1151, 0.36, 16.5), 'centros vecinos → misma celda');
// radio se redondea HACIA ARRIBA (superconjunto), nunca hacia abajo
$q = gaia_cuantizar(10.0, 10.0, 0.351, 16.0);
ok($q[2] >= 0.351, 'radio cuantizado ≥ radio pedido (superconjunto)');
ok($q[3] >= 16.0,  'mag cuantizada ≥ mag pedida (superconjunto)');

echo "gaia_clave (determinista y sensible):\n";
eq(gaia_clave(56.75, 24.115, 0.36, 16.5), gaia_clave(56.75, 24.115, 0.36, 16.5), 'misma entrada → misma clave');
ok(gaia_clave(56.75, 24.115, 0.36, 16.5) !== gaia_clave(56.76, 24.115, 0.36, 16.5), 'entradas distintas → claves distintas');

// La expulsión LRU y la limpieza ya no son de este proxy: son la política
// compartida con el del DSS. Su test es scripts/test_cache_lru.php.

if ($fallos) { echo "\n$fallos fallo(s).\n"; exit(1); }
echo "\nTodo verde.\n";
