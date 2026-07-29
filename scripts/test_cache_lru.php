<?php
declare(strict_types=1);
/* Test de la CACHÉ LRU compartida por los dos proxies del simulador
   (simulador_ocular/bitacora-cache-lru.php).

   Antes la política estaba escrita dos veces y cada test de proxy comprobaba su
   copia de la selección de evicción; la limpieza en sí —la que toca el disco— no
   la comprobaba ninguno, y es donde duele equivocarse: un patrón mal puesto
   borra lo que no debe, y un stamp mal escrito hace que cada petición escanee el
   directorio entero.

   Sin framework:  php scripts/test_cache_lru.php  */

require __DIR__ . '/../simulador_ocular/bitacora-cache-lru.php';

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

echo "cache_lru_seleccionar_evict (LRU, incremental):\n";
$max = 1000; $low = 0.9;   // objetivo tras evict: 900
// total 1500 > 1000: borra las más viejas hasta bajar de 900. Orden por mtime asc.
$lista = [
    ['/z.gz', 400, 300],   // más nueva
    ['/a.gz', 300, 100],   // más vieja
    ['/b.gz', 500, 200],
    ['/c.gz', 300, 250],
];
$plan = cache_lru_seleccionar_evict($lista, 1500, $max, $low, 100);
// viejas primero: a(100,300) -> 1200; b(200,500) -> 700 <= 900 => para. Borra a,b.
eq($plan['rutas'], ['/a.gz', '/b.gz'], 'evicta las más antiguas hasta bajar del objetivo');
eq($plan['liberado'], 800, 'bytes liberados correctos');
eq(cache_lru_seleccionar_evict($lista, 800, $max, $low, 100)['rutas'], [], 'por debajo del tope no evicta');
// El lowwater fija cuánto se corta: 0,90 baja a 900 (para en b), 0,40 baja a 400
// (sigue hasta c). Los dos proxies usan valores distintos con el mismo código.
eq(cache_lru_seleccionar_evict($lista, 1500, $max, 0.4, 100)['rutas'], ['/a.gz', '/b.gz', '/c.gz'],
   'un lowwater más bajo corta más hondo');
// límite incremental: como mucho N borrados por pasada
$muchos = [];
for ($i = 0; $i < 50; $i++) { $muchos[] = ["/f$i.gz", 100, $i]; }   // 5000 bytes
ok(count(cache_lru_seleccionar_evict($muchos, 5000, 1000, 0.9, 10)['rutas']) <= 10,
   'respeta el máximo de borrados por pasada (incremental)');

/* ── La limpieza, sobre un directorio temporal de verdad ────────────────────── */
$dir = sys_get_temp_dir() . '/bitacora_cache_lru_test_' . getmypid();
@mkdir($dir, 0775, true);
function entrada(string $dir, string $nombre, int $bytes, int $edad_s): string {
    $f = $dir . '/' . $nombre;
    file_put_contents($f, str_repeat('x', $bytes));
    touch($f, time() - $edad_s);
    return $f;
}
function limpiar_dir(string $dir): void {
    foreach (glob($dir . '/*') ?: [] as $f) { @unlink($f); }
    @unlink($dir . '/.cleanup');
}
$cfg = static fn(string $dir, string $patron): array => [
    'dir' => $dir, 'patron' => $patron,
    'max_bytes' => 1000, 'lowwater' => 0.9, 'max_del' => 100,
    'cada' => 300, 'huerfano_ttl' => 3600,
];

echo "cache_lru_limpieza (sobre disco):\n";
$vieja  = entrada($dir, 'vieja.gif',  600, 5000);
$nueva  = entrada($dir, 'nueva.gif',  600, 10);
cache_lru_limpieza($cfg($dir, '*.gif'));
ok(!is_file($vieja), 'borra la entrada más antigua para bajar del tope');
ok(is_file($nueva),  'conserva la más reciente');
ok(is_file($dir . '/.cleanup'), 'deja el stamp de la última limpieza');

// El stamp corta la siguiente pasada: nada se borra aunque siga por encima del tope.
$vieja2 = entrada($dir, 'vieja2.gif', 600, 5000);
cache_lru_limpieza($cfg($dir, '*.gif'));
ok(is_file($vieja2), 'no vuelve a limpiar antes de tiempo (el stamp manda)');
// Con el stamp envejecido sí limpia.
touch($dir . '/.cleanup', time() - 400);
cache_lru_limpieza($cfg($dir, '*.gif'));
ok(!is_file($vieja2), 'pasado el intervalo, vuelve a limpiar');

limpiar_dir($dir);

// El patrón acota lo que se borra: un .gif no cuenta ni cae en una caché de .json.gz.
// El .json.gz solo pasa del tope si el .gif NO cuenta; el .gif es más viejo, así
// que si el patrón no acotara, sería el primero en caer.
$json = entrada($dir, 'a.json.gz', 1200, 5000);
$gif  = entrada($dir, 'b.gif',      900, 9000);
cache_lru_limpieza($cfg($dir, '*.json.gz'));
ok(is_file($gif), 'el patrón acota: otra extensión no se toca aunque sea más vieja');
ok(!is_file($json), 'y sí evicta lo que sí encaja con el patrón');

limpiar_dir($dir);

echo "cache_lru_limpieza (huérfanos .lock/.tmp):\n";
$lockViejo = entrada($dir, 'x.lock',   0, 7200);
$lockNuevo = entrada($dir, 'y.lock',   0, 60);
$tmpViejo  = entrada($dir, 'z.tmp123', 5, 7200);
cache_lru_limpieza($cfg($dir, '*.gif'));
ok(!is_file($lockViejo), 'retira los .lock huérfanos ya envejecidos');
ok(!is_file($tmpViejo),  'retira los .tmp huérfanos ya envejecidos');
ok(is_file($lockNuevo),  'no toca un .lock reciente: puede haber un flock en curso');

limpiar_dir($dir);
@rmdir($dir);

if ($fallos) { echo "\n$fallos fallo(s).\n"; exit(1); }
echo "\nTodo verde.\n";
