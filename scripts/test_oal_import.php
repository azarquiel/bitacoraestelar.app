<?php
declare(strict_types=1);
/* Test del IMPORTADOR de Open Astronomy Log: la mitad PURA de
   resources/plugins/bitacora-registro/bitacora-oal.php.

   Lo que se comprueba aquí es lo que decide qué entra en la bitácora y con qué
   forma: la noche a la que pertenece cada observación, qué lugar del XML es una
   base que ya existe, qué observaciones hermanas son en realidad UNA con dos
   aumentos, y qué filas están mal y hay que avisar en vez de tragárselas.

   Dos de los ficheros de registro/ejemplos-oal/ los escribe la propia plantilla
   (node scripts/generar_ejemplos_oal.js), así que si plantilla e importador
   dejan de entenderse, este test se entera. El tercero, con-erratas.xml, está
   escrito a mano a propósito: la plantilla se niega a descargar un estado con
   esas faltas, y aun así hay que saber leerlo.

   Sin framework:  php scripts/test_oal_import.php  */

require __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-viaje.php';
require __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-oal.php';

$fallos = 0;
function eq($a, $b, string $et): void {
    global $fallos;
    if ($a === $b) { echo "  ok   $et\n"; }
    else { $fallos++; echo "  FALLA $et\n         esperado " . var_export($b, true) . "\n         obtenido " . var_export($a, true) . "\n"; }
}
function ok($a, string $et): void { eq((bool) $a, true, $et); }

function ejemplo(string $nombre): string {
    return (string) file_get_contents(__DIR__ . '/../registro/ejemplos-oal/' . $nombre . '.xml');
}
/** ¿Hay un problema apuntado que hable de esto? */
function hay_problema(array $problemas, string $trozo): bool {
    foreach ($problemas as $p) {
        if (false !== strpos($p['donde'] . ' ' . $p['que'], $trozo)) { return true; }
    }
    return false;
}

echo "una noche sencilla se lee entera:\n";
$d = bitacora_oal_leer(ejemplo('noche-simple'));
ok(!isset($d['error']), 'el XML de la plantilla se lee sin error');
eq($d['plantilla'], '1.1', 'la versión de la plantilla viene en la raíz');
eq($d['observador']['nombre'] . ' ' . $d['observador']['apellidos'], 'Ángel L. Huelmo', 'el primer observer es el autor');
eq(count($d['lugares']), 1, 'un lugar');
eq(count($d['observaciones']), 3, 'tres observaciones');
eq($d['lugares']['lu1']['nombre'], 'El Culebrín II', 'el nombre del sitio, con acentos');
eq($d['lugares']['lu1']['lat'], 38.06416667, 'la latitud, en grados decimales');
eq($d['telescopios']['te1']['modelo'], 'Skywatcher 12"', 'las comillas escapadas vuelven a ser comillas');

echo "el cielo llega en cada observación, no en la noche (ADR 0001):\n";
// El SQM es direccional: se mide hacia donde está el objeto. Las dos primeras
// miraban alto, la tercera al este bajo sobre las luces del pueblo, y esa
// diferencia es un dato, no una anomalía que haya que promediar.
eq($d['observaciones'][0]['sqm'], 21.42, 'el SQM de la primera, del elemento estándar sky-quality');
eq($d['observaciones'][0]['seeing'], 3.0, 'su seeing, del elemento estándar');
eq($d['observaciones'][0]['ir'], -18.0, 'y el IR, de bit:, que OAL no lo tiene');
eq($d['observaciones'][0]['bortle'], 4.0, 'igual que el Bortle');
eq($d['observaciones'][2]['sqm'], 20.85, 'la tercera trae SU cielo, distinto');
eq($d['observaciones'][2]['bortle'], 5.0, 'y su Bortle');
eq($d['observaciones'][2]['ir'], -18.0, 'lo que no midió lo hereda de la noche');

echo "y la noche se queda con un resumen, que es lo que guarda el viaje:\n";
$n = $d['noches']['no1'];
eq($n['sqm'], 21.42, 'el SQM del primer objeto registrado');
eq($n['ir'], -18.0, 'el IR');
eq($n['seeing'], 3.0, 'el seeing');
eq($n['bortle'], 4.0, 'el Bortle');
eq($n['meteo'], 'Despejado, algo de humedad al final', 'la meteorología');
ok(false !== strpos($n['cronica'], 'Primera salida'), 'la crónica de la noche');
eq($n['tripulacion'], array('Israel Pérez de Tudela'), 'el coObserver, con su nombre y no su id');

echo "la regla de la noche manda sobre la fecha del reloj:\n";
// La sesión empieza el 5 a las 22:30 y la tercera observación es del 6 a la
// 01:20: son la MISMA noche, la del 5. Sin esto la madrugada se iría sola a un
// viaje aparte y partiría la salida en dos.
eq($n['noche'], '2026-08-05', 'la noche es la del día en que se abrió el tubo');
eq($n['comienzo'], '22:30', 'la hora de comienzo es de reloj, no en UTC');
eq($n['fin'], '02:00', 'la de fin también, aunque sea del día siguiente');
eq($d['observaciones'][2]['fecha'], '2026-08-06', 'la madrugada conserva SU fecha de reloj');
eq(bitacora_viaje_noche($d['observaciones'][2]['fecha'], $d['observaciones'][2]['hora']),
   '2026-08-05', 'pero cae en la noche del 5');

echo "el desfase horario no mueve la hora local:\n";
// Lo que se guarda es el reloj de pared de la base, que es con lo que trabaja
// bitacora-astro.js. Convertir a UTC aquí desplazaría todas las observaciones.
eq(bitacora_oal_instante('2026-08-06T02:15:00+02:00'), array('fecha' => '2026-08-06', 'hora' => '02:15', 'desfase' => '+02:00'), 'con +02:00');
eq(bitacora_oal_instante('2026-08-06T02:15:00-04:00'), array('fecha' => '2026-08-06', 'hora' => '02:15', 'desfase' => '-04:00'), 'con -04:00');
eq(bitacora_oal_instante('2026-08-06T02:15:00+05:30'), array('fecha' => '2026-08-06', 'hora' => '02:15', 'desfase' => '+05:30'), 'con +05:30');
eq(bitacora_oal_instante('2026-08-06T02:15:00Z'), array('fecha' => '2026-08-06', 'hora' => '02:15', 'desfase' => '+00:00'), 'y la Z es +00:00');
eq(bitacora_oal_instante('mañana por la noche'), null, 'y lo que no es un instante, no lo es');

// El desfase se guarda aparte para poder rellenar fecha_hora_utc en la ficha,
// que es lo que hace comparables noches de husos distintos.
eq(bitacora_oal_utc('2026-08-06', '02:15', '+02:00'), '2026-08-06 00:15:00', 'la hora UTC sale del desfase');
eq(bitacora_oal_utc('2026-08-06', '02:15', '-04:00'), '2026-08-06 06:15:00', 'también hacia el otro lado');
eq(bitacora_oal_utc('2026-08-06', '02:15', ''), null, 'sin desfase no se inventa una hora UTC');

echo "en la forma nueva el cielo de una observación no se cuela en las otras:\n";
// El SQM es direccional (ADR 0001): copiar el de la vecina inventaría una
// medida que nadie hizo, y acabaría escrita en cielo_sqm de esa ficha.
$sin = str_replace('<sky-quality unit="mags-per-squarearcsec">21.42</sky-quality>', '', ejemplo('noche-simple'));
$dsin = bitacora_oal_leer($sin);
eq($dsin['observaciones'][0]['sqm'], null, 'la que se quedó sin SQM no hereda el de al lado');
eq($dsin['noches']['no1']['sqm'], 20.85, 'pero el resumen de la noche sí sale del primero que quede');

echo "una sesión con id numérico también resume su cielo:\n";
// PHP convierte a int las claves de array que son números, así que el id "1"
// de <session> no casa con el "1" de <session> de la observación si se comparan
// en estricto. Sin esto el viaje se quedaría sin cielo ninguno.
$dnum = bitacora_oal_leer(str_replace('no1', '1', ejemplo('noche-simple')));
eq($dnum['noches']['1']['sqm'], 21.42, 'el resumen llega aunque el id sea un número');
eq($dnum['noches']['1']['bortle'], 4.0, 'y el Bortle también');

echo "un SQM en mag/arcmin² se convierte al entrar:\n";
// OAL admite las dos unidades; la bitácora guarda solo mag/arcsec².
$darcmin = bitacora_oal_leer(str_replace(
    '<sky-quality unit="mags-per-squarearcsec">21.42</sky-quality>',
    '<sky-quality unit="mags-per-squarearcmin">12.53</sky-quality>',
    ejemplo('noche-simple')));
eq(round($darcmin['observaciones'][0]['sqm'], 2), 21.42, '12,53 mag/arcmin² son 21,42 mag/arcsec²');

echo "cada objeto de la noche sencilla es una observación:\n";
$g = bitacora_oal_agrupar($d);
eq($g[0]['sqm'], 21.42, 'que se lleva su cielo a la bitácora');
eq($g[2]['sqm'], 20.85, 'cada una el suyo, no el de la noche');
eq($g[2]['bortle'], 5.0, 'con su Bortle');
eq(count($g), 3, 'tres objetos, tres observaciones');
eq($g[0]['objeto'], 'M13', 'M13');
eq($g[0]['tipo'], 'messier', 'reconocida como Messier');
eq($g[0]['num'], 13, 'con su número');
eq($g[2]['objeto'], 'NGC 7000', 'lo que no es Messier entra tal cual');
eq($g[2]['tipo'], 'otro', 'y sin tipo de catálogo');
eq($g[0]['ra'], 250.4235, 'con las coordenadas que resolvió Sesame');
eq(count($g[0]['entradas']), 1, 'una entrada por objeto');
eq(bitacora_oal_problemas($d), array(), 'y ningún problema que avisar');

echo "dos aumentos del mismo objeto son UNA observación con dos entradas:\n";
// En OAL una observación es objeto + ocular; en la bitácora una observación es
// el objeto de la noche, y cada ocular es una entrada suya. Almaak a 68x y a
// 427x es una ficha con dos pestañas, no dos fichas.
$d2 = bitacora_oal_leer(ejemplo('dos-oculares'));
$g2 = bitacora_oal_agrupar($d2);
eq(count($d2['observaciones']), 3, 'tres observaciones en el XML');
eq(count($g2), 2, 'pero dos observaciones en la bitácora');
eq($g2[0]['objeto'], 'Almaak', 'la primera es Almaak');
eq(count($g2[0]['entradas']), 2, 'con sus dos aumentos');
eq($g2[0]['entradas'][0]['aumento'], 67.9, 'el pequeño primero');
eq($g2[0]['entradas'][1]['aumento'], 427.0, 'y el grande después');
eq($g2[0]['entradas'][1]['auxiliar'], 'au1', 'el segundo lleva la Barlow');
eq($d2['auxiliares']['au1']['factor'], 2.0, 'que multiplica por 2');
eq($g2[0]['hora'], '23:30', 'la observación se fecha en su entrada más temprana');
eq($d2['noches']['no1']['tripulacion'], array('Isra', 'Víctor'), 'los dos compañeros de esa noche');

echo "la clave de fusión no depende del orden de las hermanas:\n";
// Es también el identificador con el que se reconoce la observación en una
// segunda importación: si dependiera del id de la primera hermana, reordenar
// los aumentos en la plantilla crearía una observación duplicada.
eq($g2[0]['oal_id'], bitacora_oal_id($d2['noches']['no1']['noche'], 'Almaak'), 'la clave es la FECHA de la noche + objeto');
eq(bitacora_oal_id('2026-08-05', 'M 13'), bitacora_oal_id('2026-08-05', 'm13'), 'y no la parte cómo se escriba el nombre');
ok($g2[0]['oal_id'] !== $g2[1]['oal_id'], 'dos objetos distintos, dos claves');
ok(strlen(bitacora_oal_id('2026-08-05', str_repeat('x', 200))) <= 64, 'y cabe en la columna');
// La noche del grupo es la que se usó para la clave, no la fecha de la entrada
// más temprana: quien busque candidatas a adopción por fecha tiene que preguntar
// por la misma noche que nombra el oal_id, o no encontrará nada y duplicará.
eq($g2[0]['noche'], $d2['noches']['no1']['noche'], 'el grupo se lleva la FECHA de su noche');
eq($g2[0]['oal_id'], bitacora_oal_id($g2[0]['noche'], $g2[0]['objeto']), 'que es con la que se construyó la clave');

// Reimportar el MISMO fichero tiene que dar las mismas claves: es lo único que
// separa «corregir una errata y volver a subirlo» de «duplicar la noche entera».
$otra_vez = bitacora_oal_agrupar(bitacora_oal_leer(ejemplo('dos-oculares')));
eq(array_map(function ($x) { return $x['oal_id']; }, $otra_vez),
   array_map(function ($x) { return $x['oal_id']; }, $g2), 'el mismo XML dos veces, las mismas claves');
// La plantilla le pone un sufijo aleatorio al id de la sesión, así que la clave
// no puede mirarlo: la noche del 5 de agosto es la misma en cualquier fichero.
$con_otro_id = bitacora_oal_agrupar(array(
    'targets' => $d2['targets'],
    'noches'  => array('no1-9zq4k' => $d2['noches']['no1']),
    'observaciones' => array_map(function ($o) { $o['noche'] = 'no1-9zq4k'; return $o; }, $d2['observaciones']),
));
eq($con_otro_id[0]['oal_id'], $g2[0]['oal_id'], 'y no dependen del id de sesión, que la plantilla sortea');

echo "una observación del formulario se adopta en vez de duplicarse (ADR 0002):\n";
/* El importador desduplica con oal_id, y lo nacido en el formulario no tiene
   ninguno: sin esto, exportar la bitácora, corregir una descripción y volver a
   subir el fichero entra TODO otra vez como filas nuevas. La regla no es nueva
   —«mismo usuario + misma noche + mismo objeto = la misma observación» es lo
   que oal_id ya impone—: adoptar solo la aplica también hacia atrás. */
$suelta = function (int $id, string $fecha, string $hora, string $objeto): array {
    return array('id' => $id, 'fecha' => $fecha, 'hora' => $hora, 'objeto' => $objeto);
};
$grupos_m13 = array(array('oal_id' => bitacora_oal_id('2026-08-05', 'M13'), 'objeto' => 'M13'));

$ad = bitacora_oal_adopciones($grupos_m13, array(), array($suelta(5, '2026-08-05', '23:10', 'M 13')));
eq($ad['adoptadas'], array(bitacora_oal_id('2026-08-05', 'M13') => 5), 'la del formulario de esa noche se adopta');
eq($ad['ambiguas'], array(), 'sin ambigüedad ninguna');

// La madrugada pertenece a la noche que la engendró, aquí igual que en el resto
// del proyecto: si se mirara la fecha de reloj, la 01:20 no casaría con su noche.
$ad = bitacora_oal_adopciones($grupos_m13, array(), array($suelta(5, '2026-08-06', '01:20', 'M13')));
eq($ad['adoptadas'], array(bitacora_oal_id('2026-08-05', 'M13') => 5), 'la de madrugada cae en su noche y se adopta');

// Reimportar: la primera vez la adoptó y le puso la clave, así que la segunda ya
// casa por oal_id y no hay nada que adoptar. Ni fila nueva ni doble aviso.
$ad = bitacora_oal_adopciones($grupos_m13, array(bitacora_oal_id('2026-08-05', 'M13') => 5), array());
eq($ad['adoptadas'], array(), 'reimportar el mismo fichero no adopta nada');

// Dos salidas de la misma noche desde dos bases, el mismo objeto en las dos:
// oal_id cuelga de la noche y no del viaje, así que no las distingue. Elegir una
// sería inventarse cuál.
$ad = bitacora_oal_adopciones($grupos_m13, array(), array(
    $suelta(5, '2026-08-05', '23:10', 'M13'),
    $suelta(8, '2026-08-06', '02:40', 'M 13'),
));
eq($ad['adoptadas'], array(), 'con dos candidatas no se adopta ninguna');
eq($ad['ambiguas'], array(bitacora_oal_id('2026-08-05', 'M13') => 2), 'y se cuentan para avisar');

$ad = bitacora_oal_adopciones($grupos_m13, array(), array($suelta(5, '2026-08-04', '23:10', 'M13')));
eq($ad['adoptadas'], array(), 'la misma M13 de otra noche no es la misma observación');
$ad = bitacora_oal_adopciones($grupos_m13, array(), array($suelta(5, '2026-08-05', '23:10', 'M92')));
eq($ad['adoptadas'], array(), 'ni otro objeto de la misma noche');

echo "dos noches distintas del mismo objeto NO se fusionan:\n";
// Cada noche es una observación propia: fusionarlas perdería una de las dos.
$obs_suelta = function (string $noche_id, string $fecha, string $hora, string $desc): array {
    return array('id' => $fecha . $hora, 'noche' => $noche_id, 'target' => 't', 'fecha' => $fecha,
                 'hora' => $hora, 'desfase' => '+02:00', 'telescopio' => '', 'ocular' => '',
                 'auxiliar' => '', 'aumento' => null, 'descripcion' => $desc);
};
$dos = bitacora_oal_agrupar(array(
    'targets'  => array('t' => array('nombre' => 'M27', 'ra' => null, 'dec' => null)),
    'noches'   => array('n1' => array('noche' => '2026-07-11'), 'n2' => array('noche' => '2026-07-12')),
    'observaciones' => array(
        $obs_suelta('n1', '2026-07-11', '23:00', 'una'),
        $obs_suelta('n2', '2026-07-12', '23:00', 'otra'),
    ),
));
eq(count($dos), 2, 'el mismo objeto dos noches son dos observaciones');

echo "al fusionar, la fecha viaja con la hora:\n";
// Una misma noche cruza la medianoche. Si se ordenara solo por hora, la 00:30
// iría antes que la 23:00 y la observación se fecharía en la madrugada: noche
// equivocada, en silencio, y el viaje partido en dos.
$cruce = bitacora_oal_agrupar(array(
    'targets'  => array('t' => array('nombre' => 'M27', 'ra' => null, 'dec' => null)),
    'noches'   => array('n1' => array('noche' => '2026-07-11')),
    'observaciones' => array(
        $obs_suelta('n1', '2026-07-12', '00:30', 'la madrugada'),
        $obs_suelta('n1', '2026-07-11', '23:00', 'la primera'),
    ),
));
eq(count($cruce), 1, 'las dos son la misma observación');
eq($cruce[0]['fecha'], '2026-07-11', 'que se fecha en la del anochecer');
eq($cruce[0]['hora'], '23:00', 'con su hora');
eq($cruce[0]['entradas'][1]['hora'], '00:30', 'y la madrugada queda la segunda');

echo "lo que está mal se avisa, y lo demás entra igual:\n";
$d3 = bitacora_oal_leer(ejemplo('con-erratas'));
$p3 = bitacora_oal_problemas($d3);
ok(hay_problema($p3, 'sin objeto'), 'la observación sin target se avisa');
ok(hay_problema($p3, 'noche que no está'), 'la que cuelga de una noche borrada, también');
ok(hay_problema($p3, 'sin fecha utilizable'), 'la noche sin fecha, también');
ok(hay_problema($p3, 'sin descripción'), 'y la descripción vacía se avisa aunque entre');
$g3 = bitacora_oal_agrupar($d3);
eq(count($g3), 2, 'las dos observaciones sanas entran');
eq($g3[0]['objeto'], 'M51', 'M51');
eq($g3[1]['objeto'], 'M101', 'y M101, la de la descripción vacía');
eq($g3[1]['entradas'][0]['descripcion'], '', 'que entra vacía, no se pierde');

echo "los XML de la forma vieja siguen entrando enteros:\n";
// Los compañeros ya rellenaron ficheros con el cielo en la sesión —bit:sqm y
// compañía, un valor por noche—. Se leen igual y se reparten a las
// observaciones de esa noche: lee viejo, escribe nuevo, sin migración.
eq($d3['noches']['no1']['sqm'], 20.9, 'el bit:sqm de la sesión se sigue leyendo');
foreach ($d3['observaciones'] as $o) {
    if ('no1' === $o['noche']) { eq($o['sqm'], 20.9, 'y baja a la observación ' . $o['id']); }
}
eq($g3[0]['sqm'], 20.9, 'la observación de la bitácora se lo lleva puesto');
// La forma nueva no vuelve a subir un cielo inventado a la noche: si nadie lo
// midió, no hay resumen que dar.
eq($d3['noches']['no2']['sqm'], null, 'la noche sin cielo ni observaciones se queda sin él');

echo "un XML que no lo es se rechaza en vez de romperse:\n";
ok(isset(bitacora_oal_leer('')['error']), 'el fichero vacío');
ok(isset(bitacora_oal_leer('<a><b></a>')['error']), 'el XML mal cerrado');
ok(isset(bitacora_oal_leer('<?xml version="1.0"?><lista><x/></lista>')['error']), 'el XML que no es una bitácora OAL');

echo "las entidades externas no se cargan (XXE):\n";
// El XML llega de fuera: una entidad que apunte a /etc/passwd no puede acabar
// dentro de la descripción de una observación.
$ataque = '<?xml version="1.0"?><!DOCTYPE oal [<!ENTITY x SYSTEM "file:///etc/passwd">]>'
        . '<oal:observations xmlns:oal="https://groups.google.com/group/openastronomylog">'
        . '<targets><target id="t"><name>&x;</name></target></targets></oal:observations>';
$dx = bitacora_oal_leer($ataque);
$colado = isset($dx['targets']['t']) ? $dx['targets']['t']['nombre'] : '';
eq(false !== strpos($colado, 'root:'), false, 'el fichero del sistema no se cuela en el XML');

echo "un fichero descomunal no se llega a parsear:\n";
eq(isset(bitacora_oal_leer(str_repeat('x', BITACORA_OAL_MAX_BYTES + 1))['error']), true, 'pasa del tope y se rechaza');

echo "el lugar del XML casa con la base que ya existe:\n";
// Que esto falle no es inocuo: dos bases para el mismo cerro parten en dos la
// gráfica de salud del sitio, con la mitad de los puntos en cada una.
$bases = array(
    array('id' => 7, 'nombre' => 'El Culebrín II', 'lat' => 38.06416667, 'lon' => -6.20611111),
    array('id' => 9, 'nombre' => 'Observatorio Andaluz de Astronomía', 'lat' => 37.9, 'lon' => -6.5),
);
eq(bitacora_oal_base_casada(array('nombre' => 'el culebrin ii', 'lat' => null, 'lon' => null), $bases), 7, 'por nombre, sin acentos ni mayúsculas');
eq(bitacora_oal_base_casada(array('nombre' => 'Cerro sin nombre conocido', 'lat' => 38.06420, 'lon' => -6.20615), $bases), 7, 'y si el nombre no dice nada, por cercanía');
eq(bitacora_oal_base_casada(array('nombre' => 'Otro sitio', 'lat' => 38.10, 'lon' => -6.20), $bases), 0, 'a 4 km ya es otro sitio: se crea');
eq(bitacora_oal_base_casada(array('nombre' => 'Otro sitio', 'lat' => null, 'lon' => null), $bases), 0, 'sin nombre conocido ni coordenadas, se crea');
eq(round(bitacora_oal_distancia_m(38.06416667, -6.20611111, 38.06416667, -6.20611111)), 0.0, 'un punto consigo mismo dista cero');
ok(bitacora_oal_distancia_m(38.0, -6.0, 38.0, -6.001) < 100, 'una milésima de grado en longitud son decenas de metros');

echo "el equipo casa por modelo:\n";
$oculares = array(
    array('id' => 3, 'vendor' => 'TeleVue', 'modelo' => 'Nagler Type 4 22mm'),
    array('id' => 4, 'vendor' => 'TeleVue', 'modelo' => 'Nagler Type 6 7mm'),
);
eq(bitacora_oal_equipo_casado('Nagler Type 4 22mm', $oculares), 3, 'el mismo modelo');
eq(bitacora_oal_equipo_casado('TeleVue Nagler Type 6 7mm', $oculares), 4, 'aunque el XML traiga la marca delante');
eq(bitacora_oal_equipo_casado('Ethos 13mm', $oculares), 0, 'y el que no está, se crea');
eq(bitacora_oal_equipo_casado('', $oculares), 0, 'sin modelo no se casa con el primero que pase');

echo "los Messier se reconocen y el resto entra tal cual:\n";
eq(bitacora_oal_objeto('M13'), array('objeto' => 'M13', 'tipo' => 'messier', 'num' => 13), 'M13');
eq(bitacora_oal_objeto('m 27'), array('objeto' => 'M27', 'tipo' => 'messier', 'num' => 27), 'con espacio y en minúscula');
eq(bitacora_oal_objeto('M111'), array('objeto' => 'M111', 'tipo' => 'otro', 'num' => null), 'M111 no existe: no es Messier');
eq(bitacora_oal_objeto('  NGC   7000 '), array('objeto' => 'NGC 7000', 'tipo' => 'otro', 'num' => null), 'y los espacios de más se van');

echo $fallos ? "\n$fallos fallo(s)\n" : "\nok · el importador entiende lo que escribe la plantilla\n";
exit($fallos ? 1 : 0);
