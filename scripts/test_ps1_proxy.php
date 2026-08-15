<?php
declare(strict_types=1);
/* Test de las funciones PURAS del proxy de ps1cutouts (simulador_ocular/ps1-proxy.php).
   Cubre lo que falla EN SILENCIO y sale plausible: una URL sin wcs=1 (el servicio
   contesta 200 OK con un recorte de otro sitio), un `size` que no va en píxeles
   nativos, una clave de caché que mezcla parches, y la costura por NaN de dos
   skycells complementarias.
   Sin framework:  php scripts/test_ps1_proxy.php
   (El manejo de la petición web no se ejecuta bajo CLI: el proxy hace `return`
   temprano cuando PHP_SAPI === 'cli'.) */

require __DIR__ . '/../simulador_ocular/ps1-proxy.php';

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

/** FITS mínimo de prueba: cabecera de tarjetas de 80 en bloques de 2880 y datos float32 BIG-endian. */
function fits_de_prueba(array $valores): string {
    $cards = ['SIMPLE  =                    T', 'BITPIX  =                  -32',
              'NAXIS   =                    2', 'NAXIS1  =                    2',
              'NAXIS2  =                    2', 'END'];
    $cab = '';
    foreach ($cards as $c) { $cab .= str_pad($c, 80); }
    $cab = str_pad($cab, (int) (ceil(strlen($cab) / 2880) * 2880));
    $datos = '';
    foreach ($valores as $v) {
        // NAN se empaqueta tal cual: es la marca de "fuera de la skycell".
        $datos .= strrev(pack('f', $v));   // 'f' es del orden de la máquina; el FITS va big-endian
    }
    return $cab . $datos;
}

echo "ps1_coord_valida (rango, anti proxy abierto):\n";
ok(ps1_coord_valida('202.4696', '47.1952'), 'grados decimales válidos');
ok(ps1_coord_valida(0, -90),                'los extremos valen');
ok(!ps1_coord_valida('202.4696', '95'),     'dec fuera de rango no vale');
ok(!ps1_coord_valida('361', '0'),           'ra fuera de rango no vale');
ok(!ps1_coord_valida('202; rm -rf', '47'),  'lo que no es número no vale');
ok(!ps1_coord_valida(null, null),           'sin coordenadas no vale');

echo "ps1_banda_valida (whitelist, por defecto g):\n";
eq(ps1_banda_valida('r'), 'r', 'banda válida pasa tal cual');
eq(ps1_banda_valida('x'), 'g', 'desconocida → g');
eq(ps1_banda_valida(''),  'g', 'vacía → g');

echo "ps1_acotar_lado / ps1_acotar_salida (mismos topes que la capa del render):\n";
eq(ps1_acotar_lado(8.5),   8.5,  'dentro de rango sin cambios');
eq(ps1_acotar_lado(999.0), 20.0, 'por encima → 20′ (el parche se saldría de la skycell)');
eq(ps1_acotar_lado(0.1),   1.5,  'por debajo → 1,5′');
eq(ps1_acotar_salida(512),   512,  'salida normal sin cambios');
eq(ps1_acotar_salida(99999), 1024, 'salida enorme acotada');
eq(ps1_acotar_salida(1),     64,   'salida ridícula acotada');

echo "ps1_clave (determinista, y sin ocular ni aumento):\n";
eq(ps1_clave(202.4696, 47.1952, 8.5, 512, 'g'),
   ps1_clave(202.4696, 47.1952, 8.5, 512, 'g'), 'misma entrada → misma clave');
eq(ps1_clave(202.46960001, 47.1952, 8.5, 512, 'g'),
   ps1_clave(202.4696, 47.1952, 8.5, 512, 'g'), 'coordenada normalizada a 5 decimales: no multiplica entradas');
ok(ps1_clave(202.4696, 47.1952, 8.5, 512, 'g') !== ps1_clave(202.4696, 47.1952, 8.5, 512, 'r'),
   'banda distinta → clave distinta (no se mezclan)');
ok(ps1_clave(202.4696, 47.1952, 8.5, 512, 'g') !== ps1_clave(202.4696, 47.1952, 12.0, 512, 'g'),
   'lado distinto → clave distinta');

echo "ps1_url_recorte (lo que falla en silencio si falta):\n";
$u = ps1_url_recorte('/rings.v3.skycell/1234/056/x.fits', 10.6847, 41.269, 3.0, 512);
ok(strpos($u, 'wcs=1') !== false,         'lleva wcs=1 (sin él, 200 OK con un recorte de otro sitio)');
ok(strpos($u, 'size=720') !== false,      'size en píxeles nativos (3′ = 720 px de 0,25″)');
ok(strpos($u, 'format=fits') !== false,   'FITS, no JPEG: el nivel tiene que llegar lineal');
ok(strpos($u, 'output_size=512') !== false, 'output_size el pedido');
ok(strpos($u, 'ps1images.stsci.edu') !== false, 'apunta a STScI');

echo "ps1_url_nombres:\n";
$n = ps1_url_nombres(202.4696, 47.1952, 'g');
ok(strpos($n, 'ps1filenames.py') !== false, 'consulta el resolutor de nombres');
ok(strpos($n, 'filters=g') !== false,       'pide la banda');

echo "ps1_esquinas (el parche es cuadrado EN EL CIELO):\n";
$e = ps1_esquinas(100.0, 60.0, 12.0);
eq(count($e), 4, 'cuatro esquinas');
// A dec 60°, cos = 0,5: el paso en RA es el doble que en dec.
ok(abs(($e[1][0] - $e[0][0]) - 2 * ($e[2][1] - $e[0][1])) < 1e-9,
   'el paso en RA se abre con 1/cos(dec)');
$p = ps1_esquinas(100.0, 89.999, 12.0);
ok(is_finite($p[0][0]), 'cerca del polo no se va a infinito');

echo "ps1_celdas (deduplica y acota):\n";
eq(ps1_celdas([['/a'], ['/a'], ['/b'], ['/a', '/b']]), ['/a', '/b'], 'la misma skycell no se pide dos veces');
eq(count(ps1_celdas([['/a', '/b', '/c', '/d', '/e', '/f']])), PS1_MAX_CELDAS, 'nunca más de cuatro recortes por parche');
eq(ps1_celdas([[], []]), [], 'sin cobertura → sin celdas');

echo "ps1_parse_nombres (la columna filename es la octava):\n";
$txt = "obsid projcell subcell ra dec filter mjd filename shortname\n"
     . "1 1234 056 202.4 47.1 g 55000 /rings.v3.skycell/1234/056/x.fits corto\n"
     . "cabecera repetida sin ruta\n";
eq(ps1_parse_nombres($txt), ['/rings.v3.skycell/1234/056/x.fits'], 'saca la ruta y se salta lo que no lo es');
eq(ps1_parse_nombres(''), [], 'respuesta vacía → sin nombres');

echo "ps1_fusionar (costura por NaN de dos skycells complementarias):\n";
$a = fits_de_prueba([7.0, 7.0, NAN, NAN]);
$b = fits_de_prueba([NAN, NAN, 11.0, 11.0]);
$fus = ps1_fusionar([$a, $b]);
ok($fus !== null, 'dos capas complementarias se cosen');
$off = ps1_offset_datos($fus);
$vals = array_values(unpack('N*', substr($fus, $off)));
$flt = array_map(static fn(int $w): float => unpack('f', strrev(pack('N', $w)))[1], $vals);
eq(count(array_filter($flt, static fn($v) => is_nan($v))), 0, 'no queda ningún hueco');
ok(abs($flt[0] - 7.0) < 1e-6 && abs($flt[3] - 11.0) < 1e-6, 'cada píxel se queda con el valor de la capa que lo cubre');
eq(strlen($fus), strlen($a), 'el parche cosido mide lo mismo que un recorte');

// El primer píxel válido gana: el solape entre dos skycells discrepa un 15 %, y
// promediar queda para si algún día se nota.
$c = fits_de_prueba([5.0, 5.0, 5.0, 5.0]);
$sol = ps1_fusionar([$a, $c]);
$fl2 = array_map(static fn(int $w): float => unpack('f', strrev(pack('N', $w)))[1],
                 array_values(unpack('N*', substr($sol, ps1_offset_datos($sol)))));
ok(abs($fl2[0] - 7.0) < 1e-6, 'en el solape manda la primera capa');
ok(abs($fl2[2] - 5.0) < 1e-6, 'y donde la primera no llega, la segunda');

eq(ps1_fusionar([null, 'basura']), null, 'sin ninguna capa válida, la fusión devuelve null');
eq(ps1_fusionar([$a]), $a, 'una sola capa se devuelve tal cual');
// Dimensiones distintas: no se puede coser píxel a píxel, y no se mezcla nada.
eq(ps1_fusionar([$a, fits_de_prueba([1.0, 2.0])]), $a, 'una capa de otro tamaño se descarta');

echo "ps1_es_nan (sobre el bit patrón de float32 big-endian):\n";
ok(ps1_es_nan(0x7FC00000),  'NaN silencioso');
ok(!ps1_es_nan(0x7F800000), 'infinito no es NaN');
ok(!ps1_es_nan(0),          'cero no es NaN');
ok(!ps1_es_nan(0x40E00000), 'un valor normal (7.0) no es NaN');

if ($fallos) { echo "\n$fallos fallo(s).\n"; exit(1); }
echo "\nTodo verde.\n";
