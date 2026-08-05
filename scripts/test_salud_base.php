<?php
declare(strict_types=1);
/* Test de la SALUD DE LA BASE: fusionar las mediciones de cielo que vienen de
   las observaciones con las que vienen de los viajes
   (resources/plugins/bitacora-registro/bitacora-viaje.php).

   El viaje HEREDA de su primera observación el SQM, el IR y el seeing que no
   tuviera, así que leer las dos tablas y juntarlas sin más cuenta el mismo
   valor dos veces: la gráfica del sitio mostraría el doble de mediciones y una
   media falsa. La regla es la de heredar, en espejo: mandan las observaciones,
   y el viaje solo aporta lo que NINGUNA observación suya dijo.

   Sin framework:  php scripts/test_salud_base.php  */

require __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-viaje.php';

$fallos = 0;
function eq($a, $b, string $et): void {
    global $fallos;
    if ($a === $b) { echo "  ok   $et\n"; }
    else { $fallos++; echo "  FALLA $et\n         esperado " . var_export($b, true) . "\n         obtenido " . var_export($a, true) . "\n"; }
}

function obs(string $fecha, string $hora, $sqm = null, $ir = null, $seeing = null, int $usuario = 1): array {
    return array('fecha_observacion' => $fecha, 'hora_observacion' => $hora,
                 'cielo_sqm' => $sqm, 'cielo_ir' => $ir, 'seeing' => $seeing,
                 'usuario_id' => $usuario, 'observador' => 'Isra');
}
function viaje(string $noche, $sqm = null, $ir = null, $seeing = null, int $usuario = 1): array {
    return array('noche' => $noche, 'cielo_sqm' => $sqm, 'cielo_ir' => $ir,
                 'seeing' => $seeing, 'usuario_id' => $usuario, 'nombre' => 'Salida');
}
/** Los valores de una medida concreta, en orden, para comprobar una serie. */
function serie(array $puntos, string $campo): array {
    $v = array();
    foreach ($puntos as $p) { if (null !== $p[$campo]) { $v[] = $p[$campo]; } }
    return $v;
}

echo "las observaciones aportan sus mediciones, en orden:\n";
$puntos = bitacora_salud_mediciones(
    array(obs('2026-08-04', '23:40', 21.2), obs('2026-08-04', '22:05', 21.4)),
    array()
);
eq(count($puntos), 2, 'dos observaciones, dos puntos');
eq(serie($puntos, 'sqm'), array(21.4, 21.2), 'ordenados por hora, no por llegada');

echo "una observación sin ninguna medida no es un punto:\n";
// La salud es un histórico de MEDICIONES: una observación que no midió nada no
// dice nada del sitio, y colarla dejaría huecos en la gráfica.
eq(bitacora_salud_mediciones(array(obs('2026-08-04', '22:00')), array()), array(),
   'sin sqm, ir ni seeing no hay punto');

echo "el viaje NO repite lo que ya dijo una observación suya:\n";
// El viaje heredó ese 21.4 de la observación. Contarlo otra vez duplicaría la
// medición y torcería la media del sitio.
$puntos = bitacora_salud_mediciones(
    array(obs('2026-08-04', '22:05', 21.4)),
    array(viaje('2026-08-04', 21.4))
);
eq(serie($puntos, 'sqm'), array(21.4), 'el SQM heredado no se cuenta dos veces');
// Y tampoco si el observador luego lo corrigió en la ficha del viaje: la
// observación es el hogar del dato, y es la que manda.
$puntos = bitacora_salud_mediciones(
    array(obs('2026-08-04', '22:05', 21.4)),
    array(viaje('2026-08-04', 20.8))
);
eq(serie($puntos, 'sqm'), array(21.4), 'con dos versiones del SQM, manda la observación');

echo "el viaje SÍ aporta lo que ninguna observación midió:\n";
// Lo normal con el seeing: se anota una vez en la ficha de la salida y ninguna
// observación lo lleva. Sin esto, la serie del seeing saldría vacía.
$puntos = bitacora_salud_mediciones(
    array(obs('2026-08-04', '22:05', 21.4)),
    array(viaje('2026-08-04', 21.4, null, 2))
);
eq(serie($puntos, 'seeing'), array(2), 'el seeing del viaje entra');
eq(serie($puntos, 'sqm'), array(21.4), 'y el SQM sigue sin duplicarse');

echo "cada medida se decide por separado:\n";
// La observación midió el SQM pero no el IR; el viaje tiene los dos. Solo debe
// entrar el IR: mezclar por punto entero perdería la mitad del histórico.
$puntos = bitacora_salud_mediciones(
    array(obs('2026-08-04', '22:05', 21.4)),
    array(viaje('2026-08-04', 21.4, -25))
);
eq(serie($puntos, 'ir'), array(-25.0), 'el IR del viaje entra aunque el SQM no');

echo "la madrugada pertenece a la noche que la engendró:\n";
// Convenio de mediodía. Si la observación de las 02:00 se contase como del día
// 5, el viaje del día 4 parecería no tener observaciones y volvería a aportar
// su SQM heredado: una medición fantasma.
$puntos = bitacora_salud_mediciones(
    array(obs('2026-08-05', '02:15', 21.1)),
    array(viaje('2026-08-04', 21.1))
);
eq(serie($puntos, 'sqm'), array(21.1), 'la observación de madrugada tapa al viaje de la víspera');

echo "un viaje sin observaciones vale por sí mismo:\n";
// Una salida anotada de la que aún no se ha registrado ningún objeto sigue
// diciendo cómo estaba el cielo aquella noche.
$puntos = bitacora_salud_mediciones(array(), array(viaje('2026-08-04', 20.9, -15, 3)));
eq(count($puntos), 1, 'un punto');
eq(array(serie($puntos, 'sqm'), serie($puntos, 'ir'), serie($puntos, 'seeing')),
   array(array(20.9), array(-15.0), array(3)), 'con sus tres medidas');
eq($puntos[0]['noche'], '2026-08-04', 'fechado en su noche');

echo "cada observador tapa solo su propio viaje:\n";
// Dos compañeros salen la misma noche al mismo sitio: cada uno tiene su viaje.
// El SQM que anotó Ana en su ficha no lo heredó de la observación de Juan, así
// que no es un duplicado y no puede desaparecer por compartir noche.
$puntos = bitacora_salud_mediciones(
    array(obs('2026-08-04', '22:05', 21.4, null, null, 7)),
    array(viaje('2026-08-04', 21.4, null, null, 7), viaje('2026-08-04', 20.6, null, null, 9))
);
eq(serie($puntos, 'sqm'), array(21.4, 20.6), 'el viaje del otro observador sigue contando');

echo "los puntos salen ordenados aunque las dos fuentes lleguen revueltas:\n";
$puntos = bitacora_salud_mediciones(
    array(obs('2026-08-06', '23:00', 21.0), obs('2026-08-04', '22:00', 21.4)),
    array(viaje('2026-08-05', 20.5))
);
eq(serie($puntos, 'sqm'), array(21.4, 20.5, 21.0), 'una sola línea de tiempo');

echo "los vacíos no se cuelan como ceros:\n";
// $wpdb devuelve texto: un '' o un '0' mal tratados pintarían un SQM de 0
// mag/arcsec², que en la gráfica es un desplome que nunca ocurrió.
$puntos = bitacora_salud_mediciones(array(obs('2026-08-04', '22:00', '', '', ''), obs('2026-08-04', '23:00', '21.4')), array());
eq(count($puntos), 1, 'la observación con cadenas vacías no cuenta');
eq(serie($puntos, 'sqm'), array(21.4), 'y el número que viene como texto se normaliza');

echo $fallos ? "\n$fallos FALLO(S)\n" : "\nok · la salud no cuenta dos veces lo que el viaje heredó\n";
exit($fallos ? 1 : 0);
