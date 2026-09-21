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

echo "estrategia por régimen de densidad (sonda sin ORDER BY + repliegue seguro):\n";
// La SONDA no ordena (el coste medido del TAP es el ORDER BY) y usa el techo
// computacional, no el TOP físico-histórico de 40000.
[$cds_sonda, $gavo_sonda] = gaia_consultas(56.75, 24.115, 0.36, 16.5, false);
ok(stripos($cds_sonda, 'ORDER BY') === false, 'sonda CDS sin ORDER BY');
ok(stripos($gavo_sonda, 'ORDER BY') === false, 'sonda GAVO sin ORDER BY');
ok(strpos($cds_sonda, 'TOP ' . GAIA_TECHO_FILAS) !== false, 'sonda CDS con TOP = techo computacional');
// La consulta SEGURA es la histórica: ORDER BY + TOP 40000 (campos densos).
[$cds_segura, $gavo_segura] = gaia_consultas(56.75, 24.115, 0.36, 16.5, true);
ok(stripos($cds_segura, 'ORDER BY Gmag') !== false, 'segura CDS conserva ORDER BY Gmag');
ok(strpos($cds_segura, 'TOP ' . GAIA_MAX_ROWS) !== false, 'segura CDS conserva TOP 40000');
ok(stripos($gavo_segura, 'ORDER BY phot_g_mean_mag') !== false, 'segura GAVO conserva ORDER BY');
// Equivalencia del conjunto cuando no hay truncamiento: mismo WHERE exacto.
$where = static fn(string $q): string => preg_replace('/\s*ORDER BY.*$/i', '', substr($q, stripos($q, 'WHERE')));
eq($where($cds_sonda), $where($cds_segura), 'sonda y segura CDS comparten WHERE (mismo conjunto físico)');
eq($where($gavo_sonda), $where($gavo_segura), 'sonda y segura GAVO comparten WHERE');
// La URL de la sonda fija MAXREC: si el servidor recorta, que sea detectable.
[$url_sonda] = gaia_proveedores(56.75, 24.115, 0.36, 16.5, false);
ok(stripos($url_sonda, 'MAXREC=' . GAIA_TECHO_FILAS) !== false, 'URL de sonda lleva MAXREC = techo');

echo "gaia_truncada (tocar el techo = truncamiento posible):\n";
ok(gaia_truncada(GAIA_TECHO_FILAS), 'filas == techo → truncada');
ok(gaia_truncada(GAIA_TECHO_FILAS + 1), 'filas > techo → truncada');
ok(!gaia_truncada(GAIA_TECHO_FILAS - 1), 'filas < techo → completa');

echo "gaia_num_filas (conteo del JSON del TAP):\n";
eq(gaia_num_filas('{"metadata":[],"data":[[1,2],[3,4],[5,6]]}'), 3, 'cuenta filas de data');
eq(gaia_num_filas('{"metadata":[],"data":[]}'), 0, 'campo vacío → 0');
eq(gaia_num_filas('esto no es json'), null, 'JSON inválido → null');
eq(gaia_num_filas('{"otro":1}'), null, 'sin data → null');

echo "fondo agregado de la banda truncada (campos densos, ADR 0014 fase 2):\n";
// Consulta de momentos: sin ORDER BY, sobre la banda (corte, mag] exacta.
[$agg_cds, $agg_gavo] = gaia_fondo_consultas(268.447, -34.841, 0.89, 19.5, 15.175478);
ok(stripos($agg_cds, 'ORDER BY') === false, 'agregado CDS sin ORDER BY');
ok(strpos($agg_cds, 'Gmag>15.175478') !== false && strpos($agg_cds, 'Gmag<=19.5') !== false,
    'agregado CDS acota la banda (corte, mag] — sin solape con las filas servidas');
ok(stripos($agg_cds, 'SUM(POWER(10,-0.4*Gmag))') !== false, 'agregado CDS suma el flujo G');
ok(stripos($agg_gavo, 'phot_g_mean_mag>15.175478') !== false, 'agregado GAVO acota la banda');

echo "gaia_corte (magnitud de la última estrella servida):\n";
eq(gaia_corte('{"data":[[1,2,10.5],[1,2,15.2],[1,2,12.0]]}'), 15.2, 'corte = Gmag máxima de data');
eq(gaia_corte('{"data":[]}'), null, 'sin filas → null');
eq(gaia_corte('no json'), null, 'JSON inválido → null');

echo "gaia_mezclar_fondo (inyección pura de los momentos):\n";
$json_seguro = '{"metadata":[],"data":[[1,2,15.2]]}';
$fila = [1702342, 0.1300, 3.23e-8];
$con = gaia_mezclar_fondo($json_seguro, $fila, 15.2, 0.89, 19.5);
$dec = json_decode($con, true);
ok(isset($dec['fondo']), 'añade la clave fondo');
eq($dec['fondo']['n'], 1702342, 'n de la banda');
eq($dec['fondo']['corte'], 15.2, 'corte de la banda');
eq($dec['fondo']['rad'], 0.89, 'radio del círculo agregado');
ok(abs($dec['fondo']['flujo'] - 0.1300) < 1e-9, 'flujo G de la banda');
eq($dec['data'], [[1, 2, 15.2]], 'data intacta (no duplica ni pierde filas)');
// Guardas: sin banda (corte ≥ mag) o momentos inválidos → respuesta intacta.
eq(gaia_mezclar_fondo($json_seguro, $fila, 19.5, 0.89, 19.5), $json_seguro, 'corte ≥ mag → sin fondo');
eq(gaia_mezclar_fondo($json_seguro, null, 15.2, 0.89, 19.5), $json_seguro, 'agregado fallido → respuesta intacta');
eq(gaia_mezclar_fondo($json_seguro, [0, 0.0, 0.0], 15.2, 0.89, 19.5), $json_seguro, 'banda vacía → sin fondo');

echo "velo espacial por celdas (ADR 0029):\n";
// La consulta agrupa por celda, sin ORDER BY, misma banda que el escalar.
[$esp_cds, $esp_gavo] = gaia_espacial_consultas(268.447, -34.841, 0.89, 19.5, 15.175478, 8);
ok(stripos($esp_cds, 'ORDER BY') === false, 'espacial CDS sin ORDER BY');
ok(stripos($esp_cds, 'GROUP BY rx, dy') !== false, 'espacial CDS agrupa por celda');
ok(strpos($esp_cds, 'FLOOR(RA_ICRS*8)') !== false, 'espacial CDS granularidad N=8');
ok(strpos($esp_cds, 'Gmag>15.175478') !== false && strpos($esp_cds, 'Gmag<=19.5') !== false,
    'espacial CDS acota la banda (corte, mag] — misma que el escalar');
ok(strpos($esp_gavo, 'FLOOR(ra*8)') !== false, 'espacial GAVO granularidad N=8');

// gaia_mezclar_espacial: inyección pura + listón L1 con datos sintéticos.
// Celdas que suman exactamente el flujo escalar de `$con` (0,1300).
$esp_json = '{"metadata":[],"data":[[2142,-280,2,0.08,0.004],[2143,-280,3,0.05,0.002]]}';
$con_esp = gaia_mezclar_espacial($con, $esp_json, 8);
$dec_esp = json_decode($con_esp, true);
ok(isset($dec_esp['fondo']['espacial']), 'añade fondo.espacial');
eq($dec_esp['fondo']['espacial']['N'], 8, 'granularidad N=8');
eq(count($dec_esp['fondo']['espacial']['celdas']), 2, 'celdas inyectadas');
eq($dec_esp['fondo']['espacial']['celdas'][0], [2142, -280, 2, 0.08, 0.004], 'celda intacta (rx,dy,n,flujo,m2)');
$suma = 0.0;
foreach ($dec_esp['fondo']['espacial']['celdas'] as $c) { $suma += $c[3]; }
ok(abs($suma - $dec_esp['fondo']['flujo']) < 1e-12, 'L1: Σ flujo(celdas) == flujo escalar (' . $suma . ')');
// Guardas: sin espacial / sin celdas / sin fondo → intacta.
eq(gaia_mezclar_espacial($json_seguro, null, 8), $json_seguro, 'sin espacial → intacta');
eq(gaia_mezclar_espacial($json_seguro, '{"data":[]}', 8), $json_seguro, 'sin celdas → intacta');
eq(gaia_mezclar_espacial('{"data":[[1,2,15.2]]}', $esp_json, 8), '{"data":[[1,2,15.2]]}', 'sin fondo → intacta');

echo "log de aciertos — línea (pura):\n";
$l = gaia_log_linea(1758412345.6789, 'abc123', 'hit', null, 8192, 3.14159);
ok(substr($l, -1) === "\n", 'la línea acaba en salto (append de una línea por petición)');
$d = json_decode(trim($l), true);
eq($d['estado'], 'hit', 'estado en la línea');
eq($d['clave'], 'abc123', 'clave en la línea');
eq($d['bytes'], 8192, 'bytes servidos');
eq($d['ms'], 3.1, 'ms redondeados a una décima');
eq($d['etapa'], null, 'sin etapa en un acierto');
eq($d['t'], 1758412345.679, 't redondeado a ms');
// Un 304 no sirve cuerpo.
$d304 = json_decode(trim(gaia_log_linea(1.0, 'k', '304', null, 0, 0.4)), true);
eq($d304['estado'], '304', 'estado 304');
eq($d304['bytes'], 0, '304 → bytes 0');
// Un fallo lleva la etapa de adquisición.
eq(json_decode(trim(gaia_log_linea(1.0, 'k', 'miss', 'sonda', 10, 900.0)), true)['etapa'], 'sonda', 'fallo resuelto por la sonda');
eq(json_decode(trim(gaia_log_linea(1.0, 'k', 'miss', 'densa', 10, 900.0)), true)['etapa'], 'densa', 'fallo que tuvo que ir a la segura');

echo "gaia_mediana:\n";
eq(gaia_mediana([]), 0.0, 'lista vacía → 0');
eq(gaia_mediana([5.0]), 5.0, 'un elemento');
eq(gaia_mediana([3.0, 1.0, 2.0]), 2.0, 'impar (y ordena por su cuenta)');
eq(gaia_mediana([1.0, 2.0, 3.0, 10.0]), 2.5, 'par → media de los centrales');
eq(gaia_mediana([1.0, 2.0, 3.0, 1.55]), 1.775, 'no redondea: el redondeo es del que presenta');

echo "gaia_log_agregado (puro sobre el texto del log):\n";
$texto = gaia_log_linea(1.0, 'a', 'hit', null, 100, 5.0)
       . gaia_log_linea(2.0, 'b', 'hit', null, 200, 7.0)
       . gaia_log_linea(3.0, 'c', 'hit', null, 300, 9.0)
       . gaia_log_linea(4.0, 'd', 'miss', 'sonda', 1000, 2000.0)
       . gaia_log_linea(5.0, 'e', 'miss', 'densa', 2000, 40000.0)
       . gaia_log_linea(6.0, 'f', '304', null, 0, 1.0);
$ag = gaia_log_agregado($texto);
eq($ag['peticiones'], 6, 'cuenta todas las peticiones');
eq($ag['hit'], 3, 'aciertos');
eq($ag['miss'], 2, 'fallos');
eq($ag['304'], 1, '304');
eq($ag['ratio'], 0.6, 'ratio = hit / (hit+miss), el 304 no cuenta');
eq($ag['bytes'], 3600, 'bytes servidos');
eq($ag['ms_mediano']['hit'], 7.0, 'ms mediano de los aciertos');
eq($ag['ms_mediano']['sonda'], 2000.0, 'ms mediano de la sonda');
eq($ag['ms_mediano']['densa'], 40000.0, 'ms mediano de la consulta densa');
// Robustez: el log se rota por tamaño, así que puede haber basura o líneas a medias.
$roto = gaia_log_agregado("no es json\n" . $texto . '{"estado":"hit","bytes":1');
eq($roto['peticiones'], 6, 'ignora líneas ilegibles (rotación a mitad de línea)');
eq(gaia_log_agregado('')['peticiones'], 0, 'log vacío → 0 peticiones');
eq(gaia_log_agregado('')['ratio'], null, 'sin peticiones no hay ratio (no divide por cero)');
eq(gaia_log_agregado(gaia_log_linea(1.0, 'x', 'inventado', null, 9, 1.0))['peticiones'], 0, 'estado desconocido → no cuenta');
// Una línea corrupta cuyo estado coincide con el nombre de un acumulador no
// debe sumar en él (por eso la lista blanca es explícita, no las claves de $r).
$veneno = gaia_log_agregado('{"estado":"bytes","bytes":6}' . "\n");
eq($veneno['peticiones'], 0, 'estado que se llama como un acumulador → no cuenta');
eq($veneno['bytes'], 0, '...y no corrompe los bytes');

echo "gaia_log_escribir (append, rotación y fallo de disco):\n";
$dir = sys_get_temp_dir() . '/test_gaia_log_' . getmypid();
@mkdir($dir, 0775, true);
$log = $dir . '/.hits.log';
gaia_log_escribir($log, gaia_log_linea(1.0, 'a', 'hit', null, 10, 1.0), 1024);
gaia_log_escribir($log, gaia_log_linea(2.0, 'b', 'hit', null, 20, 2.0), 1024);
eq(count(file($log)), 2, 'dos peticiones → dos líneas (append, no sobrescribe)');
eq(gaia_log_agregado(file_get_contents($log))['hit'], 2, 'el fichero se relee agregado');
ok(!is_file($log . '.1'), 'bajo el tope no rota');
// Rotación: con el tope por debajo del tamaño actual, la siguiente petición rota.
gaia_log_escribir($log, gaia_log_linea(3.0, 'c', 'miss', 'sonda', 30, 3.0), 10);
ok(is_file($log . '.1'), 'superado el tope → rota a .hits.log.1');
eq(count(file($log)), 1, 'el log activo empieza de cero...');
eq(gaia_log_agregado(file_get_contents($log))['miss'], 1, '...sin perder la petición en curso');
eq(gaia_log_agregado(file_get_contents($log . '.1'))['hit'], 2, 'la rotación conserva lo anterior');
// Disco que falla: escribir en una ruta imposible no puede lanzar, ni emitir
// warning, ni crear nada. Medir nunca puede tumbar el servicio (AC6).
$imposible = $dir . '/no/existe/.hits.log';
$lanzo = false;
ob_start();
try { gaia_log_escribir($imposible, "x\n", 1024); } catch (Throwable $e) { $lanzo = true; }
$ruido = ob_get_clean();
ok(!$lanzo, 'ruta inescribible → no lanza');
eq($ruido, '', 'ruta inescribible → ni un warning que se cuele en la respuesta JSON');
ok(!is_file($imposible), 'ruta inescribible → no crea nada');
array_map('unlink', glob($dir . '/.hits.log*') ?: []);
@rmdir($dir);

echo "el log sobrevive al barrido LRU real y no entra en git:\n";
/* Se ejecuta la política COMPARTIDA de verdad (no se reimplementa su patrón:
   si mañana cambia en bitacora-cache-lru.php, este test tiene que enterarse),
   con un tope de 0 bytes: barre todo lo que considere suyo. */
$dl = sys_get_temp_dir() . '/test_gaia_lru_' . getmypid();
@mkdir($dl, 0775, true);
file_put_contents($dl . '/aaa.json.gz', 'entrada');
file_put_contents($dl . '/aaa.json.gz.lock', '');
gaia_log_escribir($dl . '/.hits.log', gaia_log_linea(1.0, 'a', 'hit', null, 10, 1.0), 1024);
@rename($dl . '/.hits.log', $dl . '/.hits.log.1');
gaia_log_escribir($dl . '/.hits.log', gaia_log_linea(2.0, 'b', 'hit', null, 10, 1.0), 1024);
cache_lru_limpieza([
    'dir' => $dl, 'patron' => '*.json.gz', 'max_bytes' => 0, 'lowwater' => 0.9,
    'max_del' => 100, 'cada' => 0, 'huerfano_ttl' => 0,
]);
ok(!is_file($dl . '/aaa.json.gz'), 'el LRU sí barre las entradas de caché (el test no es vacuo)');
ok(!is_file($dl . '/aaa.json.gz.lock'), 'el LRU sí retira los huérfanos .lock');
ok(is_file($dl . '/.hits.log'), 'el log activo sobrevive al barrido');
ok(is_file($dl . '/.hits.log.1'), 'la rotación sobrevive al barrido');
array_map('unlink', array_merge(glob($dl . '/*') ?: [], glob($dl . '/.*[a-z]*') ?: []));
@rmdir($dl);
ok(in_array('simulador_ocular/cache_gaia/', array_map('trim', file(dirname(__DIR__) . '/.gitignore')), true),
    'cache_gaia/ (y con él el log) está en .gitignore');

echo "coste de medir (AC7: despreciable frente al servicio):\n";
$db = sys_get_temp_dir() . '/test_gaia_coste_' . getmypid();
@mkdir($db, 0775, true);
$fb = $db . '/.hits.log';
$n = 500;
$t0 = microtime(true);
for ($i = 0; $i < $n; $i++) {
    gaia_log_escribir($fb, gaia_log_linea(microtime(true), str_repeat('a', 40), 'hit', null, 120000, 1.5), 5 * 1024 * 1024);
}
$coste = (microtime(true) - $t0) * 1000 / $n;
/* Listón contra el SERVICIO, no contra la medida anterior: el acierto de caché
   más barato medido en este proxy está en el milisegundo largo, así que 1 ms de
   coste de log ya sería la mitad de la petición. Medido aquí: ~0,03 ms. */
ok($coste < 1.0, sprintf('append + rotación cuesta %.4f ms por petición (listón: < 1 ms)', $coste));
array_map('unlink', glob($db . '/.hits.log*') ?: []);
@rmdir($db);

// La expulsión LRU y la limpieza ya no son de este proxy: son la política
// compartida con el del DSS. Su test es scripts/test_cache_lru.php.

if ($fallos) { echo "\n$fallos fallo(s).\n"; exit(1); }
echo "\nTodo verde.\n";
