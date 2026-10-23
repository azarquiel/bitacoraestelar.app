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

echo "cache_lru_flujo (con un fetch falso):\n";
/* Arma un flujo sobre $dir con callbacks que NO terminan, y devuelve lo que
   pasó. $datos = lo que devuelve el fetch (null = el origen falla). */
$flujo = function (string $dir, string|false|null $datos, array $extra = []): array {
    $r = ['fetch' => 0, 'servido' => [], 'directo' => null, 'fallo' => 0, 'pendiente' => 0];
    $cfg = $extra + ['ruta' => "$dir/k.bin", 'clave' => 'k', 'dir' => $dir, 'patron' => '*.bin',
            'max_bytes' => 1 << 20, 'lowwater' => 0.8, 'log' => "$dir/.hits.log",
            'pendiente' => function () use (&$r) { $r['pendiente']++; }];
    cache_lru_flujo(
        $cfg,
        function (?string &$etapa) use (&$r, $datos) { $r['fetch']++; $etapa = ($datos === false) ? 'async' : 'sonda'; return $datos; },
        function (string $estado, ?string $etapa) use (&$r) { $r['servido'][] = [$estado, $etapa]; },
        function (string $d) use (&$r) { $r['directo'] = $d; },
        function () use (&$r) { $r['fallo']++; }
    );
    return $r;
};
$log = fn(string $dir): array => array_map(fn($l) => json_decode($l, true),
    array_filter(explode("\n", (string) @file_get_contents("$dir/.hits.log"))));

// FALLO + escritura: pide al origen una vez, escribe atómicamente y sirve la entrada.
$r = $flujo($dir, 'CONTENIDO');
eq($r['fetch'], 1, 'fallo de caché: un solo fetch');
eq($r['servido'], [['miss', 'sonda']], 'sirve la entrada recién escrita como miss, con su etapa');
eq(file_get_contents("$dir/k.bin"), 'CONTENIDO', 'el fichero queda escrito');
eq(glob("$dir/*.tmp*") ?: [], [], 'escritura atómica: no queda ningún .tmp');

// ACIERTO: no toca el origen.
$r = $flujo($dir, 'OTRO');
eq($r['fetch'], 0, 'acierto: el fetch ni se llama');
eq($r['servido'], [['hit', null]], 'acierto: sirve como hit');
eq(file_get_contents("$dir/k.bin"), 'CONTENIDO', 'acierto: no reescribe la entrada');
limpiar_dir($dir);

// 502: el origen falla → fallo(), nada en disco, y queda en el log como error.
$r = $flujo($dir, null);
eq($r['fallo'], 1, '502: llama a fallo()');
eq([$r['servido'], $r['directo']], [[], null], '502: no sirve nada');
ok(!is_file("$dir/k.bin"), '502: no escribe la caché');
$l = $log($dir);
eq([$l[0]['estado'] ?? null, $l[0]['etapa'] ?? null], ['error', 'sonda'], '502: queda en el log como error con su etapa');
limpiar_dir($dir);
@unlink("$dir/.hits.log");   // limpiar_dir no ve los ficheros ocultos

// Codificación solo en disco: el directo recibe el crudo.
$r = $flujo($dir, 'abc', ['codificar' => fn(string $d) => strrev($d)]);
eq(file_get_contents("$dir/k.bin"), 'cba', 'codificar: lo que se escribe es lo codificado');
limpiar_dir($dir);
$r = $flujo($dir, 'abc', ['codificar' => fn(string $d) => false]);
eq([$r['directo'], $r['servido']], ['abc', []], 'si no se puede escribir, sirve el crudo directo');
eq(glob("$dir/*.tmp*") ?: [], [], 'y no deja un .tmp');
eq($log($dir)[0]['estado'] ?? null, 'miss', 'el directo también queda en el log');
limpiar_dir($dir);

// Sin flock (el .lock no se puede crear): descarga directa, sin cachear.
mkdir("$dir/k.bin.lock");
$r = $flujo($dir, 'XYZ');
eq([$r['directo'], $r['servido']], ['XYZ', []], 'sin lock: sirve directo');
ok(!is_file("$dir/k.bin"), 'sin lock: no cachea');
$r = $flujo($dir, null);
eq($r['fallo'], 1, 'sin lock y el origen falla: 502');
rmdir("$dir/k.bin.lock");
limpiar_dir($dir);

echo "cache_lru_flujo con job asíncrono (#505):\n";
@unlink("$dir/.hits.log");
// El origen dice «sigue en marcha» (false): pendiente(), nada en disco, ni 502.
$r = $flujo($dir, false);
eq([$r['pendiente'], $r['fallo'], $r['servido'], $r['directo']], [1, 0, [], null], 'fetch pendiente → pendiente(), ni 502 ni datos');
ok(!is_file("$dir/k.bin"), 'pendiente: no escribe la caché');
$l = $log($dir);
eq([$l[0]['estado'] ?? null, $l[0]['etapa'] ?? null], ['pendiente', 'async'], 'pendiente: queda en el log con su etapa');
// Con un job vivo y el lock tomado por otra petición (la que recoge el
// resultado), no se espera al flock: pendiente al instante y sin fetch, así
// que no puede lanzar un segundo job (AC2) ni retener un hit (AC6).
file_put_contents("$dir/k.job", 'https://ejemplo/job/1');
$otro = fopen("$dir/k.bin.lock", 'c');
flock($otro, LOCK_EX);
$t0 = microtime(true);
$r = $flujo($dir, 'NO-DEBE-PEDIRSE', ['job' => "$dir/k.job"]);
eq([$r['fetch'], $r['pendiente']], [0, 1], 'lock ocupado con job vivo → pendiente sin fetch');
ok(microtime(true) - $t0 < 0.5, 'lock ocupado con job vivo → no espera al flock');
flock($otro, LOCK_UN);
fclose($otro);
// Lock libre con job vivo: sí entra y deja que el fetch consulte el job.
$r = $flujo($dir, 'RESULTADO', ['job' => "$dir/k.job"]);
eq([$r['fetch'], $r['servido']], [1, [['miss', 'sonda']]], 'lock libre con job vivo → fetch y miss');
// Sin cfg pendiente (DSS, PS1) un false no puede colarse como datos: es un 502.
limpiar_dir($dir);
$r = $flujo($dir, false, ['pendiente' => null]);
eq([$r['fallo'], $r['servido']], [1, []], 'sin pendiente en cfg → false es un fallo');
limpiar_dir($dir);
@unlink("$dir/.hits.log");

echo "cache_lru_log_linea (formato único):\n";
eq(array_keys(json_decode(cache_lru_log_linea(1.0, 'k', 'hit', null, 1, 1.0), true)),
    ['t', 'clave', 'estado', 'etapa', 'bytes', 'ms', 'traza'], 'las claves del log, en orden');

limpiar_dir($dir);
@rmdir($dir);

if ($fallos) { echo "\n$fallos fallo(s).\n"; exit(1); }
echo "\nTodo verde.\n";
