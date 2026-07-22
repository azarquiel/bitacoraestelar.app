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

echo "gaia_seleccionar_evict (LRU, incremental):\n";
$max = 1000; $low = 0.9;   // objetivo tras evict: 900
// total 1500 > 1000: borra las más viejas hasta bajar de 900. Orden por mtime asc.
$lista = [
    ['/z.gz', 400, 300],   // más nueva
    ['/a.gz', 300, 100],   // más vieja
    ['/b.gz', 500, 200],
    ['/c.gz', 300, 250],
];
$total = 1500;
$plan = gaia_seleccionar_evict($lista, $total, $max, $low, 100);
// viejas primero: a(100,300) -> 1200; b(200,500) -> 700 <= 900 => para. Borra a,b.
eq($plan['rutas'], ['/a.gz', '/b.gz'], 'evicta las más antiguas hasta bajar del objetivo');
eq($plan['liberado'], 800, 'bytes liberados correctos');
// bajo el tope: no evicta nada
eq(gaia_seleccionar_evict($lista, 800, $max, $low, 100)['rutas'], [], 'por debajo del tope no evicta');
// límite incremental: como mucho N borrados por pasada
$muchos = [];
for ($i = 0; $i < 50; $i++) { $muchos[] = ["/f$i.gz", 100, $i]; }   // 5000 bytes
$plan2 = gaia_seleccionar_evict($muchos, 5000, 1000, 0.9, 10);
ok(count($plan2['rutas']) <= 10, 'respeta el máximo de borrados por pasada (incremental)');

if ($fallos) { echo "\n$fallos fallo(s).\n"; exit(1); }
echo "\nTodo verde.\n";
