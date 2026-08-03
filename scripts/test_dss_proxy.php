<?php
declare(strict_types=1);
/* Test de las funciones PURAS del proxy del DSS (simulador_ocular/dss-proxy.php).
   Cubre validación de coordenadas, whitelist de reconocimiento, acotado de campo,
   determinismo de la clave y selección de evicción LRU.
   Sin framework:  php scripts/test_dss_proxy.php
   (El manejo de la petición web no se ejecuta bajo CLI: el proxy hace `return`
   temprano cuando PHP_SAPI === 'cli'.) */

require __DIR__ . '/../simulador_ocular/dss-proxy.php';

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

echo "dss_validar_coord (whitelist estricta, anti proxy abierto):\n";
ok(dss_validar_coord('05 35 17'),      'sexagesimal con espacios');
ok(dss_validar_coord('-05:23:28.1'),   'signo, dos puntos y decimales');
ok(dss_validar_coord('83.822'),        'grados decimales');
ok(!dss_validar_coord(''),             'vacío no vale');
ok(!dss_validar_coord('05 35 17; rm'), 'caracteres extra no válidos');
ok(!dss_validar_coord(str_repeat('1', 25)), 'longitud > 24 no vale');

echo "dss_survey_valido (whitelist, por defecto DSS1):\n";
eq(dss_survey_valido('DSS2-red'), 'DSS2-red', 'reconocimiento válido pasa tal cual');
eq(dss_survey_valido('DSS1'),     'DSS1',     'DSS1 válido');
eq(dss_survey_valido('malicioso'), 'DSS1',    'desconocido → DSS1');
eq(dss_survey_valido(''),          'DSS1',    'vacío → DSS1');

echo "dss_acotar_campo (rango [1, 120]):\n";
eq(dss_acotar_campo(84.0),  84.0,  'dentro de rango sin cambios');
eq(dss_acotar_campo(999.0), 120.0, 'por encima → 120');
eq(dss_acotar_campo(0.0),   1.0,   'por debajo → 1');

echo "dss_clave (determinista y sensible):\n";
eq(dss_clave('05 35 17', '-05 23 28', 84.0, 84.0, 'DSS1', 'eso'),
   dss_clave('05 35 17', '-05 23 28', 84.0, 84.0, 'DSS1', 'eso'), 'misma entrada → misma clave');
ok(dss_clave('05 35 17', '-05 23 28', 84.0, 84.0, 'DSS1', 'eso') !== dss_clave('05 35 18', '-05 23 28', 84.0, 84.0, 'DSS1', 'eso'),
   'ra distinta → clave distinta');
ok(dss_clave('05 35 17', '-05 23 28', 84.0, 84.0, 'DSS1', 'eso') !== dss_clave('05 35 17', '-05 23 28', 84.0, 84.0, 'DSS2-red', 'eso'),
   'reconocimiento distinto → clave distinta');

// La expulsión LRU y la limpieza ya no son de este proxy: son la política
// compartida con el de Gaia. Su test es scripts/test_cache_lru.php.

echo "dss_fuente_valida (whitelist, por defecto el ESO):\n";
eq(dss_fuente_valida('skyview'), 'skyview', 'skyview válida');
eq(dss_fuente_valida('eso'),     'eso',     'eso válida');
eq(dss_fuente_valida('otra'),    'eso',     'desconocida → eso');
eq(dss_fuente_valida(''),        'eso',     'vacía → eso');

echo "dss_url, fuente eso (archivo del ESO, la placa tal cual):\n";
$u = dss_url('05 35 17', '-05 23 28', 84.0, 84.0, 'DSS1', 'eso');
ok(strpos($u, 'archive.eso.org') !== false, 'apunta al archivo del ESO');
ok(strpos($u, 'ra=05%2035%2017') !== false, 'ra codificada (espacios → %20)');
ok(strpos($u, 'Sky-Survey=DSS1') !== false, 'incluye el reconocimiento');

echo "dss_url, fuente skyview (misma placa, remuestreada norte arriba):\n";
$s = dss_url('16 41 41', '+36 27 36', 30.0, 30.0, 'DSS2-red', 'skyview');
ok(strpos($s, 'skyview.gsfc.nasa.gov') !== false, 'apunta a SkyView');
ok(strpos($s, 'survey=dss2r') !== false,          'traduce el reconocimiento al nombre de SkyView');
ok(strpos($s, 'position=16%2041%2041%2C%2B36%2027%2036') !== false, 'posición "ra,dec" codificada');
// SkyView pide el tamaño en GRADOS, no en minutos como el ESO.
ok(strpos($s, 'size=0.5,0.5') !== false,          'tamaño en grados');
ok(strpos($s, 'projection=Tan') !== false,        'proyección TAN (norte arriba, este a la izquierda)');
ok(strpos($s, 'coordinates=J2000') !== false,     'equinoccio J2000, como el resto del simulador');
ok(strpos($s, 'scaling=Linear') !== false,        'estirado lineal fijado (la fotometría depende del nivel)');
ok(strpos($s, 'return=GIF') !== false,            'GIF, el mismo formato que ya cachea el proxy');
eq(dss_url('16 41 41', '+36 27 36', 30.0, 30.0, 'DSS1', 'skyview') !== $s, true,
   'reconocimiento distinto → URL distinta');

echo "dss_pixels (lado en píxeles que se le pide a SkyView):\n";
// La escala de la placa del DSS ronda 1,7"/px: se pide ese detalle, sin pasarse.
eq(dss_pixels(30.0),  1059, '30\' a 1,7"/px');
eq(dss_pixels(1.0),   300,  'campo diminuto → suelo de 300 px');
eq(dss_pixels(120.0), 1200, 'campo máximo → techo de 1200 px');

echo "dss_clave (la fuente forma parte de la clave):\n";
ok(dss_clave('05 35 17', '-05 23 28', 84.0, 84.0, 'DSS1', 'eso')
   !== dss_clave('05 35 17', '-05 23 28', 84.0, 84.0, 'DSS1', 'skyview'),
   'fuente distinta → clave distinta (no se mezclan en la caché)');

if ($fallos) { echo "\n$fallos fallo(s).\n"; exit(1); }
echo "\nTodo verde.\n";
