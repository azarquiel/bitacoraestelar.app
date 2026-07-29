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
eq(dss_clave('05 35 17', '-05 23 28', 84.0, 84.0, 'DSS1'),
   dss_clave('05 35 17', '-05 23 28', 84.0, 84.0, 'DSS1'), 'misma entrada → misma clave');
ok(dss_clave('05 35 17', '-05 23 28', 84.0, 84.0, 'DSS1') !== dss_clave('05 35 18', '-05 23 28', 84.0, 84.0, 'DSS1'),
   'ra distinta → clave distinta');
ok(dss_clave('05 35 17', '-05 23 28', 84.0, 84.0, 'DSS1') !== dss_clave('05 35 17', '-05 23 28', 84.0, 84.0, 'DSS2-red'),
   'reconocimiento distinto → clave distinta');

// La expulsión LRU y la limpieza ya no son de este proxy: son la política
// compartida con el de Gaia. Su test es scripts/test_cache_lru.php.

echo "dss_url (URL del archivo del ESO):\n";
$u = dss_url('05 35 17', '-05 23 28', 84.0, 84.0, 'DSS1');
ok(strpos($u, 'archive.eso.org') !== false, 'apunta al archivo del ESO');
ok(strpos($u, 'ra=05%2035%2017') !== false, 'ra codificada (espacios → %20)');
ok(strpos($u, 'Sky-Survey=DSS1') !== false, 'incluye el reconocimiento');

if ($fallos) { echo "\n$fallos fallo(s).\n"; exit(1); }
echo "\nTodo verde.\n";
