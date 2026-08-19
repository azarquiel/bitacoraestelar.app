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

// La expulsión LRU y la limpieza ya no son de este proxy: son la política
// compartida con el del DSS. Su test es scripts/test_cache_lru.php.

if ($fallos) { echo "\n$fallos fallo(s).\n"; exit(1); }
echo "\nTodo verde.\n";
