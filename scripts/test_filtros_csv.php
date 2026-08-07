<?php
declare(strict_types=1);
/* Test del lector de CSV del catálogo de equipo
   (resources/plugins/bitacora-registro/bitacora-registro.php, bitacora_leer_csv).

   filtros.csv es el primer catálogo TABULADO: se separó así porque 15 de sus
   filas llevan ';' dentro del texto de la descripción. Si el separador se
   eligiera mal, el fallo NO sería un error: sería un catálogo de filtros con los
   nombres partidos por la mitad y un bandpass metido en la columna equivocada,
   que solo se ve mirando el desplegable una por una. De ahí este test.

   Sin framework:  php scripts/test_filtros_csv.php  */

// ── Stubs mínimos de WordPress: el plugin solo llama a estas al cargarse. ──
define('ABSPATH', __DIR__);
function add_action(...$a) {}
function register_activation_hook(...$a) {}

require __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-registro.php';

$fallos = 0;
function eq($a, $b, string $et): void {
    global $fallos;
    if ($a === $b) { echo "  ok   $et\n"; }
    else { $fallos++; echo "  FALLA $et\n         esperado " . var_export($b, true) . "\n         obtenido " . var_export($a, true) . "\n"; }
}

// El lector busca en la carpeta datos/ del plugin, así que los casos se escriben
// ahí y se retiran al terminar. Filas reales del catálogo, no inventadas.
$dir = __DIR__ . '/../resources/plugins/bitacora-registro/datos';
$tmp_tab = $dir . '/test-filtros-tmp.csv';
$tmp_pyc = $dir . '/test-auxiliares-tmp.csv';
register_shutdown_function(function () use ($tmp_tab, $tmp_pyc) {
    foreach ([$tmp_tab, $tmp_pyc] as $f) { if (file_exists($f)) { unlink($f); } }
});

// Tabulado, con CRLF como el fichero de verdad. La fila de Lumicon lleva ';'
// dentro de la descripción: es la que reventaría con el separador antiguo.
file_put_contents($tmp_tab, implode("\r\n", [
    "Vendor\tName\tType\tBandpass (nm)\tMin.Exit Pupil\tDescription",
    "Baader\tO-III\tOxygen III\t502-502\t\t",
    "Lumicon\tLF3025 UHC\tUHC\t496-501, 486-486\t\tBloquea mercurio; sodio y neón",
    "Kodak\tWratten #21\tOrange\t\t\tBlue and blue-green absorption.",
    "Orion\tSkyGlow\tBroadband\t450-540, 650-800\t\t",
]) . "\r\n");

echo "bitacora_leer_csv con separador TAB (filtros.csv):\n";
$filas = bitacora_leer_csv('test-filtros-tmp.csv', "\t");
eq(count($filas), 4, 'lee las 4 filas y descarta la cabecera');
eq($filas[0]['Vendor'], 'Baader', 'primera columna');
eq($filas[0]['Name'], 'O-III', 'nombre del modelo');
eq($filas[0]['Type'], 'Oxygen III', 'tipo con espacio dentro');
eq($filas[0]['Bandpass (nm)'], '502-502', 'bandpass de una sola línea');
// El bandpass en tramos lleva coma: por eso el catálogo NO puede ser un CSV
// separado por comas, y por eso se guarda como texto sin parsear.
eq($filas[1]['Bandpass (nm)'], '496-501, 486-486', 'bandpass en dos tramos, con su coma');
// La prueba de fuego: el ';' del texto NO parte la fila.
eq($filas[1]['Name'], 'LF3025 UHC', 'el ";" del texto no desplaza las columnas');
eq($filas[1]['Description'], 'Bloquea mercurio; sodio y neón', 'la descripción conserva su ";"');
// Última columna de la última fila: sin recortar el \r, arrastraría un retorno.
eq($filas[3]['Bandpass (nm)'], '450-540, 650-800', 'CRLF recortado en la última columna');
// Columna vacía en medio: los Wratten no traen bandpass.
eq($filas[2]['Bandpass (nm)'], '', 'columna vacía -> cadena vacía');
eq($filas[2]['Min.Exit Pupil'], '', 'la columna vacía del catálogo entero');

echo "el separador por defecto sigue siendo ';' (catálogos de siempre):\n";
file_put_contents($tmp_pyc, "Vendor;Name;Magnification;Focal Length extension (mm)\r\nTelevue;Paracorr;1,15;\r\n");
$aux = bitacora_leer_csv('test-auxiliares-tmp.csv');
eq(count($aux), 1, 'lee la fila');
eq($aux[0]['Name'], 'Paracorr', 'sin pasar separador se sigue partiendo por ";"');
eq($aux[0]['Magnification'], '1,15', 'la coma decimal llega intacta al conversor');

echo "fichero que no existe:\n";
eq(bitacora_leer_csv('no-existe-jamas.csv'), null, 'devuelve null, no revienta');

echo $fallos ? "\n$fallos FALLO(S).\n" : "\nTodo verde.\n";
exit($fallos ? 1 : 0);
