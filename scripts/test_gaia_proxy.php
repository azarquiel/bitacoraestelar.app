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
$l = cache_lru_log_linea(1758412345.6789, 'abc123', 'hit', null, 8192, 3.14159);
ok(substr($l, -1) === "\n", 'la línea acaba en salto (append de una línea por petición)');
$d = json_decode(trim($l), true);
eq($d['estado'], 'hit', 'estado en la línea');
eq($d['clave'], 'abc123', 'clave en la línea');
eq($d['bytes'], 8192, 'bytes servidos');
eq($d['ms'], 3.1, 'ms redondeados a una décima');
eq($d['etapa'], null, 'sin etapa en un acierto');
eq($d['t'], 1758412345.679, 't redondeado a ms');
// Un 304 no sirve cuerpo.
$d304 = json_decode(trim(cache_lru_log_linea(1.0, 'k', '304', null, 0, 0.4)), true);
eq($d304['estado'], '304', 'estado 304');
eq($d304['bytes'], 0, '304 → bytes 0');
// Un fallo lleva la etapa de adquisición.
eq(json_decode(trim(cache_lru_log_linea(1.0, 'k', 'miss', 'sonda', 10, 900.0)), true)['etapa'], 'sonda', 'fallo resuelto por la sonda');
eq(json_decode(trim(cache_lru_log_linea(1.0, 'k', 'miss', 'async', 10, 900.0)), true)['etapa'], 'async', 'fallo que tuvo que ir al job asíncrono');
// #429: la traza dice qué proveedor respondió y cuánto costó cada intento.
eq($d['traza'], null, 'sin traza en un acierto (no fue al TAP)');
$traza = [['sonda', 'cds', 0, 55012.3], ['sonda', 'gavo', 200, 702.1]];
eq(json_decode(trim(cache_lru_log_linea(1.0, 'k', 'miss', 'sonda', 10, 55800.0, $traza)), true)['traza'], $traza,
    'traza de un fallo: CDS agota el plazo, GAVO responde');

echo "gaia_proveedor (por host):\n";
foreach (gaia_proveedores(10.0, 20.0, 0.5, 16.0, false) as $u) { $provs[] = gaia_proveedor($u); }
eq($provs, ['cds', 'gavo'], 'las URLs de la sonda son CDS y GAVO, en ese orden');
eq(gaia_proveedor('https://otro.example.org/tap/sync'), 'otro.example.org', 'host desconocido → el host tal cual');

// #429: la sonda va GAVO primero, CDS de failover; no se quita ninguno.
$provs = [];
foreach (gaia_proveedores_gavo_primero(10.0, 20.0, 0.5, 16.0, false) as $u) { $provs[] = gaia_proveedor($u); }
eq($provs, ['gavo', 'cds'], 'sonda: GAVO primero, CDS de failover');
// El cliente lee por posición: las dos consultas devuelven ra, dec, G, BP-RP en ese orden.
[$cds_q, $gavo_q] = gaia_consultas(10.0, 20.0, 0.5, 16.0, false);
ok(preg_match('/^SELECT TOP \d+ RA_ICRS, DE_ICRS, Gmag, "BP-RP" FROM/', $cds_q) === 1, 'columnas CDS: ra, dec, G, BP-RP');
ok(preg_match('/^SELECT TOP \d+ ra,dec,phot_g_mean_mag,phot_bp_mean_mag-phot_rp_mean_mag AS bprp FROM/', $gavo_q) === 1, 'columnas GAVO: ra, dec, G, BP-RP');

echo "campos densos por TAP asíncrono (#505):\n";
// El job lo crea dc.zah… pero vive en dc.g-vo.org: también es GAVO en la traza.
eq(gaia_proveedor('https://dc.g-vo.org/__system__/tap/run/async/pji8zt1g/phase'), 'gavo', 'host del job UWS → gavo');
// El 500 de GAVO por su límite síncrono corta el failover: CDS tampoco termina.
$plazo = '<INFO name="QUERY_STATUS" value="ERROR">Query timed out (took too long). Use TAP\'s async mode</INFO>';
ok(gaia_es_plazo_sync(500, $plazo), '500 «Query timed out» → límite síncrono');
ok(!gaia_es_plazo_sync(500, 'Internal error'), '500 de otra cosa → no corta el failover');
ok(!gaia_es_plazo_sync(200, $plazo), 'un 2xx nunca es plazo agotado');
ok(!gaia_es_plazo_sync(0, ''), 'sin respuesta (red) → no corta el failover');
// La segura síncrona va GAVO primero: la única densa que terminó en producción
// la sirvió GAVO en 16 s, y CDS colgado costaría 55 s antes del 202.
$provs = [];
foreach (gaia_proveedores_gavo_primero(10.0, 20.0, 0.5, 16.0, true) as $u) { $provs[] = gaia_proveedor($u); }
eq($provs, ['gavo', 'cds'], 'segura síncrona: GAVO primero, CDS de failover');

echo "cadena asíncrona de un campo denso (#505): histograma → espacial → datos:\n";
/* Ningún paso lleva ORDER BY: la segura ordenada no terminó ni en 2 h de job
   (M7, 2026-10-24). El corte sale del histograma, y los tres pasos usan la
   MISMA expresión de celda, FLOOR(G·100), así que la partición es exacta. */
$h = gaia_cadena_consulta('hist', 268.463, -34.793, 0.89, 19.5, null);
ok(stripos($h, 'ORDER BY') === false && stripos($h, 'GROUP BY g100') !== false, 'histograma: agrupa por centésima de G, sin ORDER BY');
ok(strpos($h, 'FLOOR(phot_g_mean_mag*100) AS g100') !== false, 'histograma: celda FLOOR(G·100)');
ok(strpos($h, 'SUM(POWER(10,-0.4*phot_g_mean_mag))') !== false && strpos($h, 'SUM(POWER(10,-0.8*phot_g_mean_mag))') !== false,
    'histograma: trae los momentos del fondo (flujo y m2) por celda');
ok(strpos($h, 'phot_g_mean_mag<=19.5') !== false, 'histograma: acotado por el mag del cliente');
$d = gaia_cadena_consulta('datos', 268.463, -34.793, 0.89, 19.5, 1520);
ok(stripos($d, 'ORDER BY') === false, 'datos: sin ORDER BY');
ok(strpos($d, 'FLOOR(phot_g_mean_mag*100)<1520') !== false, 'datos: G por debajo de la celda de corte');
ok(preg_match('/^SELECT TOP \d+ ra,dec,phot_g_mean_mag,phot_bp_mean_mag-phot_rp_mean_mag AS bprp FROM/', $d) === 1,
    'datos: mismas 4 columnas, mismo orden que la segura de hoy');
ok(strpos(gaia_cadena_consulta('datos', 10.0, 20.0, 0.5, 16.0, null), 'FLOOR') === false, 'datos sin corte: todo hasta mag');
$e = gaia_cadena_consulta('espacial', 268.463, -34.793, 0.89, 19.5, 1520);
ok(strpos($e, 'FLOOR(phot_g_mean_mag*100)>=1520') !== false && strpos($e, 'GROUP BY rx, dy') !== false,
    'espacial: la banda desde la celda de corte, por celdas del cielo');
ok(strpos($e, 'FLOOR(ra*' . GAIA_ESPACIAL_N . ')') !== false, 'espacial: granularidad GAIA_ESPACIAL_N');
$p = gaia_job_parametros('datos', 268.463, -34.793, 0.89, 19.5, 1520);
eq([$p['REQUEST'], $p['LANG'], $p['FORMAT'], $p['MAXREC']], ['doQuery', 'ADQL', 'json', GAIA_MAX_ROWS], 'job de datos: MAXREC = TOP (el del servidor va vacío)');
eq($p['QUERY'], $d, 'job de datos: su consulta');

// El corte: la celda más alta tal que lo de debajo cabe en el TOP.
$hist = [[1530, 30000, 3.0e-7, 1e-14], [1510, 25000, 3.5e-7, 2e-14], [1520, 10000, 1.5e-7, 1e-14], [1600, 5000, 0.4e-7, 1e-15]];
$c = gaia_cadena_corte($hist, 40000);
eq($c['b'], 1530, 'corte: 1510+1520 = 35 000 caben, con 1530 ya no');
eq($c['n'], 35000, 'corte: filas que traerá el paso de datos');
eq($c['fondo'][0], 35000, 'fondo: n = las celdas ≥ corte (1530 y 1600)');
ok(abs($c['fondo'][1] - 3.4e-7) < 1e-18 && abs($c['fondo'][2] - 1.1e-14) < 1e-26, 'fondo: flujo y m2 exactos, sumados por celda');
$c = gaia_cadena_corte([[1500, 100, 1.0, 1.0], [1700, 200, 1.0, 1.0]], 40000);
eq([$c['b'], $c['n'], $c['fondo']], [null, 300, null], 'todo cabe en el TOP → sin corte ni fondo');

// La máquina de pasos, pura.
$e0 = ['paso' => 'hist'];
// Más un tramo débil que lleva el cono por encima del techo: solo entonces se corta (#517).
$hjson = json_encode(['data' => array_merge($hist, [[1900, GAIA_TECHO_FILAS, 1.0, 1.0]])]);
$a = gaia_cadena_avance($e0, $hjson, 0.89, 19.5);
eq([$a['lanzar'] ?? null, $a['estado']['b'] ?? null, $a['estado']['n'] ?? null], ['espacial', 1530, 35000], 'hist listo → lanza espacial con el corte');
ok(isset(gaia_cadena_avance($e0, null, 0.89, 19.5)['error']), 'hist en ERROR → 502');
$a2 = gaia_cadena_avance($e0, json_encode(['data' => [[1500, 100, 1.0, 1.0]]]), 0.5, 16.0);
eq([$a2['lanzar'] ?? null, array_key_exists('b', $a2['estado'] ?? []) ? $a2['estado']['b'] : 'x'], ['datos', null], 'campo que cabe → salta el espacial');
$e1 = $a['estado'];
$e1['paso'] = 'espacial';
$a = gaia_cadena_avance($e1, '{"data":[[2147,-279,9,0.1,0.001]]}', 0.89, 19.5);
eq([$a['lanzar'] ?? null, $a['estado']['esp'] ?? null], ['datos', [[2147, -279, 9, 0.1, 0.001]]], 'espacial listo → lanza datos y guarda las celdas');
$a = gaia_cadena_avance($e1, null, 0.89, 19.5);
eq([$a['lanzar'] ?? null, array_key_exists('esp', $a['estado'] ?? []) ? $a['estado']['esp'] : 'x'], ['datos', null], 'espacial en ERROR → sigue sin velo espacial (degradación)');
$e2 = ['paso' => 'datos', 'b' => 1530, 'n' => 2, 'fondo' => [35000, 3.4e-7, 1.1e-14], 'esp' => [[2147, -279, 9, 0.1, 0.001]]];
$fin = gaia_cadena_avance($e2, '{"metadata":[],"data":[[1,2,15.1,0.5],[3,4,15.2,0.6]]}', 0.89, 19.5);
$j = json_decode($fin['listo'] ?? 'null', true);
eq($j['data'] ?? null, [[1, 2, 15.1, 0.5], [3, 4, 15.2, 0.6]], 'datos listos → 200 con las filas tal cual');
eq([$j['fondo']['corte'] ?? null, $j['fondo']['n'] ?? null, $j['fondo']['rad'] ?? null], [15.3, 35000, 0.89], 'fondo con corte = celda/100');
eq($j['fondo']['espacial']['celdas'] ?? null, [[2147, -279, 9, 0.1, 0.001]], 'fondo.espacial con las celdas guardadas');
ok(isset(gaia_cadena_avance($e2, '{"data":[[1,2,15.1,0.5]]}', 0.89, 19.5)['error']), 'filas ≠ las del histograma → error, no truncado silencioso');
ok(isset(gaia_cadena_avance($e2, null, 0.89, 19.5)['error']), 'datos en ERROR → 502');
eq(json_decode(gaia_cadena_avance(['paso' => 'datos', 'b' => null, 'n' => 1], '{"data":[[1,2,15.1,0.5]]}', 0.5, 16.0)['listo'], true),
    ['data' => [[1, 2, 15.1, 0.5]]], 'sin corte → sin fondo');
eq(array_map('gaia_cadena_paso_num', ['hist', 'espacial', 'datos']), [1, 2, 3], 'paso N de 3 para el aviso');

/* Salvaguarda de la pista (#517): la pista puede equivocarse (×0,86-1,04 medido
   con la ponderación por área, más en conos pequeños) y puede mandar a la cadena un campo que la sonda traía entero. Si el
   histograma del cono cabe bajo el techo de la sonda, la cadena lo trae entero,
   sin corte ni velo: una pista errónea solo cuesta tiempo, nunca estrellas. */
echo "cadena: un campo que la sonda traería entero no se corta (salvaguarda de la pista):\n";
$hbajo = [];
for ($g = 600; $g < 2000; $g++) { $hbajo[] = [$g, 76, 1e-7, 1e-14]; }   // 106 400 filas
$a = gaia_cadena_avance(['paso' => 'hist'], json_encode(['data' => $hbajo]), 0.89, 20.0);
$clave_o = static fn(array $x, string $k) => array_key_exists($k, $x) ? $x[$k] : 'x';
eq([$a['lanzar'] ?? null, $clave_o($a['estado'] ?? [], 'b'), $a['estado']['n'] ?? null, $clave_o($a['estado'] ?? [], 'fondo')],
    ['datos', null, 106400, null], '106 400 filas (< techo) → datos sin corte, sin espacial ni fondo');
$hjusto = [[1500, GAIA_TECHO_FILAS - 1, 1.0, 1.0]];
eq($clave_o(gaia_cadena_avance(['paso' => 'hist'], json_encode(['data' => $hjusto]), 0.89, 20.0)['estado'] ?? [], 'b'), null,
    'techo − 1 → entero (lo mismo que la sonda: solo tocar el techo es truncado)');
$htecho = [[1500, 30000, 1.0, 1.0], [1600, GAIA_TECHO_FILAS - 30000, 1.0, 1.0]];
$a = gaia_cadena_avance(['paso' => 'hist'], json_encode(['data' => $htecho]), 0.89, 20.0);
eq([$a['lanzar'] ?? null, $a['estado']['b'] ?? null, $a['estado']['n'] ?? null], ['espacial', 1600, 30000],
    'en el techo → corte en el TOP de 40 000, como antes');
$dsin = gaia_cadena_consulta('datos', 268.463, -34.793, 0.89, 20.0, null);
ok(strpos($dsin, 'SELECT TOP ' . GAIA_TECHO_FILAS . ' ') === 0, 'datos sin corte: TOP = techo de la sonda');
eq(gaia_job_parametros('datos', 268.463, -34.793, 0.89, 20.0, null)['MAXREC'], GAIA_TECHO_FILAS, 'datos sin corte: MAXREC = techo');
ok(strpos($d, 'SELECT TOP ' . GAIA_MAX_ROWS . ' ') === 0, 'datos con corte: sigue el TOP de 40 000');
// Qué hacer con la fase del job.
eq(gaia_job_decision(200, "COMPLETED\n"), 'listo', 'COMPLETED → recoger');
eq(gaia_job_decision(200, 'EXECUTING'), 'pendiente', 'EXECUTING → 202');
eq(gaia_job_decision(200, 'QUEUED'), 'pendiente', 'QUEUED → 202');
eq(gaia_job_decision(200, 'PENDING'), 'arrancar', 'PENDING (RUN perdido) → reenviar RUN');
eq(gaia_job_decision(200, 'ERROR'), 'error', 'ERROR → 502 y borrar el .job');
eq(gaia_job_decision(200, 'ABORTED'), 'error', 'ABORTED (plazo del job) → error');
eq(gaia_job_decision(200, 'ARCHIVED'), 'error', 'ARCHIVED (resultado ya borrado) → error');
eq(gaia_job_decision(404, ''), 'error', '404 (job destruido, caducado) → error');
eq(gaia_job_decision(503, ''), 'pendiente', '5xx al preguntar la fase → no se borra el job, se vuelve a preguntar');
eq(gaia_job_decision(0, ''), 'pendiente', 'sin respuesta al preguntar la fase → se vuelve a preguntar');
// Solo se pregunta a jobs de GAVO; un .job vacío o roto no deja la clave en 202 para siempre.
ok(gaia_job_valido('https://dc.g-vo.org/__system__/tap/run/async/pji8zt1g'), 'job de GAVO → válido');
ok(!gaia_job_valido(''), '.job vacío → no válido');
ok(!gaia_job_valido('https://otro.example.org/job/1'), 'job fuera de GAVO → no válido (no se pide a otro host)');
ok(!gaia_job_caducado(60) && gaia_job_caducado(GAIA_ASYNC_TTL + 1), 'un paso sin acabar caduca pasado el plazo del job');
// Fondo y espacial van GAVO primero: los recoge la petición que tiene el lock.
eq(gaia_proveedor(gaia_fondo_urls(268.463, -34.793, 0.89, 19.5, 15.2)[0]), 'gavo', 'fondo: GAVO primero');
eq(gaia_proveedor(gaia_espacial_urls(268.463, -34.793, 0.89, 19.5, 15.2, 8)[0]), 'gavo', 'espacial: GAVO primero');
// Un pendiente entra en el agregado de ?stats=1 (AC4 del alcance).
$agp = gaia_log_agregado(cache_lru_log_linea(1.0, 'p', 'pendiente', 'async', 0, 21000.0)
    . cache_lru_log_linea(2.0, 'p', 'miss', 'async', 900, 5000.0));
eq([$agp['peticiones'], $agp['pendiente'], $agp['miss']], [2, 1, 1], 'stats cuenta los pendientes');
eq($agp['ms_mediano']['async'], 5000.0, 'stats: ms de la recogida del job bajo la etapa async');

echo "gaia_mediana:\n";
eq(gaia_mediana([]), 0.0, 'lista vacía → 0');
eq(gaia_mediana([5.0]), 5.0, 'un elemento');
eq(gaia_mediana([3.0, 1.0, 2.0]), 2.0, 'impar (y ordena por su cuenta)');
eq(gaia_mediana([1.0, 2.0, 3.0, 10.0]), 2.5, 'par → media de los centrales');
eq(gaia_mediana([1.0, 2.0, 3.0, 1.55]), 1.775, 'no redondea: el redondeo es del que presenta');

echo "gaia_log_agregado (puro sobre el texto del log):\n";
$texto = cache_lru_log_linea(1.0, 'a', 'hit', null, 100, 5.0)
       . cache_lru_log_linea(2.0, 'b', 'hit', null, 200, 7.0)
       . cache_lru_log_linea(3.0, 'c', 'hit', null, 300, 9.0)
       . cache_lru_log_linea(4.0, 'd', 'miss', 'sonda', 1000, 2000.0)
       . cache_lru_log_linea(5.0, 'e', 'miss', 'densa', 2000, 40000.0)
       . cache_lru_log_linea(6.0, 'f', '304', null, 0, 1.0)
       . cache_lru_log_linea(7.0, 'g', 'error', 'densa', 0, 110000.0);
$ag = gaia_log_agregado($texto);
eq($ag['peticiones'], 7, 'cuenta todas las peticiones');
eq($ag['error'], 1, '502 contados (#429)');
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
eq($roto['peticiones'], 7, 'ignora líneas ilegibles (rotación a mitad de línea)');
eq(gaia_log_agregado('')['peticiones'], 0, 'log vacío → 0 peticiones');
eq(gaia_log_agregado('')['ratio'], null, 'sin peticiones no hay ratio (no divide por cero)');
eq(gaia_log_agregado(cache_lru_log_linea(1.0, 'x', 'inventado', null, 9, 1.0))['peticiones'], 0, 'estado desconocido → no cuenta');
// Una línea corrupta cuyo estado coincide con el nombre de un acumulador no
// debe sumar en él (por eso la lista blanca es explícita, no las claves de $r).
$veneno = gaia_log_agregado('{"estado":"bytes","bytes":6}' . "\n");
eq($veneno['peticiones'], 0, 'estado que se llama como un acumulador → no cuenta');
eq($veneno['bytes'], 0, '...y no corrompe los bytes');

echo "cache_lru_log_escribir (append, rotación y fallo de disco):\n";
$dir = sys_get_temp_dir() . '/test_gaia_log_' . getmypid();
@mkdir($dir, 0775, true);
$log = $dir . '/.hits.log';
cache_lru_log_escribir($log, cache_lru_log_linea(1.0, 'a', 'hit', null, 10, 1.0), 1024);
cache_lru_log_escribir($log, cache_lru_log_linea(2.0, 'b', 'hit', null, 20, 2.0), 1024);
eq(count(file($log)), 2, 'dos peticiones → dos líneas (append, no sobrescribe)');
eq(gaia_log_agregado(file_get_contents($log))['hit'], 2, 'el fichero se relee agregado');
ok(!is_file($log . '.1'), 'bajo el tope no rota');
// Rotación: con el tope por debajo del tamaño actual, la siguiente petición rota.
cache_lru_log_escribir($log, cache_lru_log_linea(3.0, 'c', 'miss', 'sonda', 30, 3.0), 10);
ok(is_file($log . '.1'), 'superado el tope → rota a .hits.log.1');
eq(count(file($log)), 1, 'el log activo empieza de cero...');
eq(gaia_log_agregado(file_get_contents($log))['miss'], 1, '...sin perder la petición en curso');
eq(gaia_log_agregado(file_get_contents($log . '.1'))['hit'], 2, 'la rotación conserva lo anterior');
// Disco que falla: escribir en una ruta imposible no puede lanzar, ni emitir
// warning, ni crear nada. Medir nunca puede tumbar el servicio (AC6).
$imposible = $dir . '/no/existe/.hits.log';
$lanzo = false;
ob_start();
try { cache_lru_log_escribir($imposible, "x\n", 1024); } catch (Throwable $e) { $lanzo = true; }
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
cache_lru_log_escribir($dl . '/.hits.log', cache_lru_log_linea(1.0, 'a', 'hit', null, 10, 1.0), 1024);
@rename($dl . '/.hits.log', $dl . '/.hits.log.1');
cache_lru_log_escribir($dl . '/.hits.log', cache_lru_log_linea(2.0, 'b', 'hit', null, 10, 1.0), 1024);
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
ok(in_array('simulador_ocular/cache_gaia/*', array_map('trim', file(dirname(__DIR__) . '/.gitignore')), true),
    'cache_gaia/* (y con él el log) está en .gitignore');

echo "coste de medir (AC7: despreciable frente al servicio):\n";
$db = sys_get_temp_dir() . '/test_gaia_coste_' . getmypid();
@mkdir($db, 0775, true);
$fb = $db . '/.hits.log';
$n = 500;
$t0 = microtime(true);
for ($i = 0; $i < $n; $i++) {
    cache_lru_log_escribir($fb, cache_lru_log_linea(microtime(true), str_repeat('a', 40), 'hit', null, 120000, 1.5), 5 * 1024 * 1024);
}
$coste = (microtime(true) - $t0) * 1000 / $n;
/* Listón contra el SERVICIO, no contra la medida anterior: el acierto de caché
   más barato medido en este proxy está en el milisegundo largo, así que 1 ms de
   coste de log ya sería la mitad de la petición. Medido aquí: ~0,03 ms. */
ok($coste < 1.0, sprintf('append + rotación cuesta %.4f ms por petición (listón: < 1 ms)', $coste));
array_map('unlink', glob($db . '/.hits.log*') ?: []);
@rmdir($db);

echo "\ncache_gaia/.htaccess (el log no se sirve por HTTP):\n";
$ht = (string) @file_get_contents(GAIA_CACHE_DIR . '/.htaccess');
ok(strpos($ht, 'Require all denied') !== false && strpos($ht, 'Deny from all') !== false,
    '.htaccess deniega en Apache 2.4 y 2.2');
ok(!fnmatch('*.json.gz', '.htaccess') && !fnmatch('*.lock', '.htaccess') && !fnmatch('*.tmp*', '.htaccess'),
    'la limpieza LRU no puede borrar el .htaccess');
/* Lo que de verdad importa es el servidor; tras subirlo:
   curl -s -o /dev/null -w '%{http_code}' -A Mozilla/5.0 \
     https://bitacoraestelar.app/wp-content/uploads/bitacora/cache_gaia/.hits.log   → 403 */

// La expulsión LRU y la limpieza ya no son de este proxy: son la política
// compartida con el del DSS. Su test es scripts/test_cache_lru.php.

echo "\npista de densidad (#517, ADR 0033 punto 2):\n";
/* ipix de nivel 6 calculados con ang2pix_nest de scripts/gen_avance_gaia.py
   (contrastado con ivo_healpix_index de GAVO): RA 0/360, polos, la frontera
   za = 2/3 (|dec| ≈ 41,81°) y bordes de cara. */
foreach ([[0, 0, 18090], [359.999, 0, 18773], [0.0, 89.9, 4095], [123.4, -89.9, 36864],
          [45, 41.81, 1023], [45, 41.82, 3072], [200, -41.81, 43606], [200, -41.82, 43606],
          [90, 0, 22186], [268.447, -34.841, 28711], [250.423, 36.46, 9436],
          [192.86, 27.13, 28149], [135, -60, 37680], [315.5, 10.2, 12480]] as [$pra, $pdec, $pix]) {
    eq(gaia_ang2pix_nest(6, (float) $pra, (float) $pdec), $pix, "ang2pix_nest(6, $pra, $pdec)");
}
/* Fracción de cada celda dentro del cono (opción B de #517): la pista pondera
   cada histograma por área(celda ∩ cono) / área(celda). */
$area_celda = GAIA_CIELO_DEG2 / (12 * 4 ** 6);
$area_cono = static fn(float $r): float => 2 * M_PI * (1 - cos(deg2rad($r))) * (180 / M_PI) ** 2;
$fm7 = gaia_fracciones_cono(268.447, -34.841, 0.89);
ok(abs(array_sum($fm7) * $area_celda / $area_cono(0.89) - 1) < 1e-9, 'Σ fracción × área de celda = área del cono');
ok(min($fm7) > 0 && max($fm7) <= 1.0 + 0.05, 'fracciones en (0, 1] (± muestreo)');
eq(array_values(array_diff([28709, 28710, 28711, 28716, 28717, 28722], array_keys($fm7))), [],
    'M7 0,89°: están las celdas que el cono cubre de verdad (generador)');
$fpeq = gaia_fracciones_cono(268.447, -34.841, 0.05);
eq(array_keys($fpeq), [28711], 'cono pequeño dentro de una celda → solo esa');
ok(abs($fpeq[28711] - $area_cono(0.05) / $area_celda) < 1e-9, '... con fracción = área del cono / área de la celda');
$fgr = gaia_fracciones_cono(268.447, -34.841, 3.0);
ok(max($fgr) > 0.95 && max($fgr) < 1.05, 'cono grande: las celdas interiores valen ≈ 1');
$fpolo = gaia_fracciones_cono(10.0, 89.95, 0.5);
ok(count($fpolo) >= 4 && abs(array_sum($fpolo) * $area_celda / $area_cono(0.5) - 1) < 1e-9, 'cono sobre el polo: varias celdas y el área cuadra');
$t0 = microtime(true);
gaia_fracciones_cono(268.447, -34.841, GAIA_MAX_RAD);
$ms = (microtime(true) - $t0) * 1000;
ok($ms < 50, sprintf('fracciones a %.1f° en %.1f ms (listón: < 50 ms)', GAIA_MAX_RAD, $ms));
$cm7 = array_keys($fm7);

// Cabecera de celda de mentira, mismo formato que bytes_celda del generador.
$cab = static fn(int $ipix, array $hist, string $firma = 'BAVG', int $ver = 1, int $nivel = 6, int $n = 0): string =>
    pack('a4vCCVVvv', $firma, $ver, $nivel, 0, $ipix, $n, 42, 500)
    . pack('V*', ...array_pad($hist, 42, 0));
eq(strlen($cab(1, [])), GAIA_AVANCE_CABECERA, 'cabecera de 188 B');
$h = array_fill(0, 42, 1);
eq(gaia_avance_hist($cab(7, $h), 7), $h, 'cabecera válida → histograma');
eq(gaia_avance_hist($cab(7, $h), 8), null, 'ipix distinto → ilegible');
eq(gaia_avance_hist($cab(7, $h, 'XXXX'), 7), null, 'firma rota → ilegible');
eq(gaia_avance_hist($cab(7, $h, 'BAVG', 2), 7), null, 'versión desconocida → ilegible');
eq(gaia_avance_hist($cab(7, $h, 'BAVG', 1, 5), 7), null, 'nivel distinto → ilegible');
eq(gaia_avance_hist(substr($cab(7, $h), 0, 100), 7), null, 'truncada → ilegible');
eq(gaia_avance_hist('', 7), null, 'vacía → ilegible');

// Tramos [k/2, (k+1)/2): con `mag` cuantizada a 0,5 casan sin interpolar.
$h = range(1, 42);   // tramo k vale k+1
eq(gaia_pista_tramos($h, 0.0, 20.0), array_sum(range(1, 40)), 'G ≤ 20 → tramos 0-39 (40 y 41 fuera)');
eq(gaia_pista_tramos($h, 0.0, 16.5), array_sum(range(1, 33)), 'G ≤ 16,5 → tramos 0-32');
eq(gaia_pista_tramos($h, 15.0, 20.0), array_sum(range(31, 40)), 'con desde = 15 (#518) → tramos 30-39');
eq(gaia_pista_tramos($h, 0.0, 25.0), array_sum($h), 'mag por encima del histograma → todos');

eq(GAIA_PISTA_UMBRAL, 180000, 'umbral = techo 200 000 / 1,1 (redondeado; ponderada medida ×0,86-1,04)');
ok(!gaia_pista_densa(180000), '180 000 → flujo de hoy (sonda)');
ok(gaia_pista_densa(180001), '180 001 → directo a la cadena asíncrona');
ok(!gaia_pista_densa(null), 'sin previsión → flujo de hoy');

// Suma ponderada, pura.
$hu = array_fill(0, 42, 0);
$hu[39] = 1000;
eq(gaia_pista_suma([1 => $hu, 2 => $hu], [1 => 1.0, 2 => 0.25], 0.0, 20.0), 1250, 'Σ tramos × fracción');
eq(gaia_pista_suma([1 => $hu], [1 => 0.5], 0.0, 19.5), 0, 'fuera de [desde, mag] no cuenta');
eq(gaia_pista_suma([], [], 0.0, 20.0), 0, 'sin celdas → 0');

// Avance de mentira en disco con las celdas del cono de M7.
$av = sys_get_temp_dir() . '/test_gaia_avance_' . getmypid();
@mkdir($av . '/n6', 0775, true);
$manif = static fn(string $ruta = 'n6/{ipix}.bin') =>
    file_put_contents($av . '/manifiesto.json', json_encode(['version' => 1, 'nivel' => 6, 'frontera' => 15.0, 'ruta' => $ruta]));
$manif();
$poner = static function (int $porCelda) use ($av, $cm7, $cab): void {
    foreach ($cm7 as $c) {
        $hh = array_fill(0, 42, 0);
        $hh[39] = $porCelda;                 // G 19,5-20: dentro a mag 20
        $hh[41] = 999999;                    // G 20,5-21: fuera a mag 20
        // Filas basura detrás: el proxy no las lee.
        file_put_contents("$av/n6/$c.bin", $cab($c, $hh, 'BAVG', 1, 6, 3) . str_repeat("\xff", 36));
    }
};
$esperada = static fn(int $porCelda): int => (int) round($porCelda * array_sum($fm7));
$poner(100000);
eq(gaia_pista_prevision(268.447, -34.841, 0.89, 20.0, 0.0, $av), $esperada(100000), 'previsión = Σ tramos × fracción del cono');
ok($esperada(100000) < 100000 * count($cm7), '... menor que la suma de celdas enteras');
eq(gaia_pista_prevision(268.447, -34.841, 0.89, 20.0, 15.0, $av), $esperada(100000), 'desde = 15: G 19,5-20 es complemento');
eq(gaia_pista_prevision(268.447, -34.841, 0.89, 19.5, 0.0, $av), 0, 'mag 19,5: G 19,5-20 queda fuera');
// Celda ausente: sin pista, nunca una suma parcial.
rename("$av/n6/{$cm7[3]}.bin", "$av/aparte.bin");
eq(gaia_pista_prevision(268.447, -34.841, 0.89, 20.0, 0.0, $av), null, 'celda ausente → sin pista');
rename("$av/aparte.bin", "$av/n6/{$cm7[3]}.bin");
// Cabecera corrupta.
file_put_contents("$av/n6/{$cm7[2]}.bin", 'BAVG basura');
eq(gaia_pista_prevision(268.447, -34.841, 0.89, 20.0, 0.0, $av), null, 'cabecera corrupta → sin pista');
$poner(100000);
// Fichero de otra celda copiado en el sitio equivocado.
copy("$av/n6/{$cm7[0]}.bin", "$av/n6/{$cm7[1]}.bin");
eq(gaia_pista_prevision(268.447, -34.841, 0.89, 20.0, 0.0, $av), null, 'celda con el ipix de otra → sin pista');
$poner(100000);
// Manifiesto: ausente, ilegible o con una ruta que no es la de una celda.
foreach (['n6/../../x/{ipix}.bin', '/etc/{ipix}.bin', 'n6/fijo.bin'] as $mala) {
    $manif($mala);
    eq(gaia_pista_prevision(268.447, -34.841, 0.89, 20.0, 0.0, $av), null, "ruta del manifiesto «{$mala}» → sin pista");
}
file_put_contents($av . '/manifiesto.json', '{roto');
eq(gaia_pista_prevision(268.447, -34.841, 0.89, 20.0, 0.0, $av), null, 'manifiesto ilegible → sin pista');
unlink($av . '/manifiesto.json');
eq(gaia_pista_prevision(268.447, -34.841, 0.89, 20.0, 0.0, $av), null, 'sin manifiesto → sin pista');
// Una versión nueva del Avance se anuncia cambiando la ruta (README: n6v2/).
@mkdir($av . '/n6v2', 0775, true);
foreach ($cm7 as $c) { rename("$av/n6/$c.bin", "$av/n6v2/$c.bin"); }
$manif('n6v2/{ipix}.bin');
eq(gaia_pista_prevision(268.447, -34.841, 0.89, 20.0, 0.0, $av), $esperada(100000), 'sigue la ruta del manifiesto (n6v2/)');
ok(gaia_pista_prevision(268.447, -34.841, 0.89, 20.0, 0.0, $av . '/no-existe') === null, 'sin directorio del Avance → sin pista');
array_map('unlink', array_merge(glob("$av/n6/*") ?: [], glob("$av/n6v2/*") ?: [], glob("$av/*.json") ?: []));
@rmdir("$av/n6"); @rmdir("$av/n6v2"); @rmdir($av);

echo "pista en el log (AC4):\n";
$sin = cache_lru_log_linea(1.0, 'k', 'hit', null, 1, 1.0);
eq(cache_lru_log_linea(1.0, 'k', 'hit', null, 1, 1.0, null, []), $sin, 'sin extra → línea idéntica a la de hoy');
$con = json_decode(cache_lru_log_linea(1.0, 'k', 'pendiente', 'async', 0, 900.0, [['async', 'gavo', 303, 400.0]],
    ['prevision' => 245000, 'pista' => true]), true);
eq([$con['prevision'], $con['pista']], [245000, true], 'la línea lleva previsión y si se usó la pista');
eq(gaia_pista_log(null, false), ['prevision' => null, 'pista' => false], 'sin Avance → previsión null');
eq(gaia_pista_log(245000, false, true), ['prevision' => 245000, 'pista' => false, 'pista_fallida' => true],
    'denso pero la cadena no se lanzó → marcado (no cuenta como fallo de la pista en el AC5)');
$mix = gaia_log_agregado(cache_lru_log_linea(1.0, 'v', 'miss', 'sonda', 10, 900.0)
    . cache_lru_log_linea(2.0, 'n', 'pendiente', 'async', 0, 800.0, null, gaia_pista_log(245000, true))
    . cache_lru_log_linea(3.0, 'n', 'miss', 'sonda', 10, 900.0, null, gaia_pista_log(4000, false)));
eq([$mix['peticiones'], $mix['pista']], [3, 1], 'stats mezcla líneas viejas y nuevas y cuenta las que usaron la pista');

if ($fallos) { echo "\n$fallos fallo(s).\n"; exit(1); }
echo "\nTodo verde.\n";
