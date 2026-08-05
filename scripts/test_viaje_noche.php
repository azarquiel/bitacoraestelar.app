<?php
declare(strict_types=1);
/* Test del reparto de observaciones en VIAJES
   (resources/plugins/bitacora-registro/bitacora-viaje.php).

   Es la única lógica de la funcionalidad que, mal implementada, corrompe datos
   en silencio: una observación de las 02:00 metida en el viaje del día
   siguiente no da error, no se ve, y no se nota hasta tener cientos. Por eso la
   regla del mediodía se prueba por los dos lados del corte, en los bordes de
   mes y de año, y en un cambio de horario de verano.

   Sin framework:  php scripts/test_viaje_noche.php  */

require __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-viaje.php';

$fallos = 0;
function eq($a, $b, string $et): void {
    global $fallos;
    if ($a === $b) { echo "  ok   $et\n"; }
    else { $fallos++; echo "  FALLA $et\n         esperado " . var_export($b, true) . "\n         obtenido " . var_export($a, true) . "\n"; }
}

echo "bitacora_viaje_noche · la misma salida bajo una sola noche:\n";
eq(bitacora_viaje_noche('2026-08-04', '22:40'), '2026-08-04', 'la tarde es su propia noche');
eq(bitacora_viaje_noche('2026-08-05', '02:15'), '2026-08-04', 'la madrugada cae en la noche anterior');
eq(bitacora_viaje_noche('2026-08-04', '23:59'), '2026-08-04', 'justo antes de medianoche');
eq(bitacora_viaje_noche('2026-08-05', '00:00'), '2026-08-04', 'justo después de medianoche');
// El objeto visto a las 22:40 y el visto a las 02:15 son LA MISMA salida: es la
// razón de ser de todo esto.
eq(bitacora_viaje_noche('2026-08-04', '22:40') === bitacora_viaje_noche('2026-08-05', '02:15'), true,
   'tarde y madrugada siguiente comparten viaje');

echo "el corte está en el mediodía, no en la medianoche:\n";
eq(bitacora_viaje_noche('2026-08-05', '11:59'), '2026-08-04', 'las 11:59 aún son de la noche anterior');
eq(bitacora_viaje_noche('2026-08-05', '12:00'), '2026-08-05', 'las 12:00 ya abren noche nueva');

echo "bordes de calendario:\n";
eq(bitacora_viaje_noche('2026-01-01', '03:00'), '2025-12-31', 'año nuevo de madrugada');
eq(bitacora_viaje_noche('2026-03-01', '01:00'), '2026-02-28', 'primero de marzo (año común)');
eq(bitacora_viaje_noche('2024-03-01', '01:00'), '2024-02-29', 'primero de marzo (bisiesto)');

echo "horario de verano (la noche NO se desplaza):\n";
// En España el reloj salta de 02:00 a 03:00 la última madrugada de marzo, y
// retrocede de 03:00 a 02:00 la última de octubre. Como la cuenta es sobre el
// reloj de pared, la noche se decide igual que cualquier otra: la hora repetida
// o inexistente no cambia a qué salida pertenece la observación.
eq(bitacora_viaje_noche('2026-03-29', '01:30'), '2026-03-28', 'madrugada del salto de primavera');
eq(bitacora_viaje_noche('2026-03-29', '03:30'), '2026-03-28', 'después del salto, misma noche');
eq(bitacora_viaje_noche('2026-10-25', '02:30'), '2026-10-24', 'madrugada de la hora repetida de otoño');

echo "sin hora, la fecha no se desplaza:\n";
eq(bitacora_viaje_noche('2026-08-04', ''), '2026-08-04', 'sin hora, la noche es la fecha tal cual');
eq(bitacora_viaje_noche('2026-08-04'), '2026-08-04', 'hora omitida por completo');
eq(bitacora_viaje_noche('2026-08-04', 'ayer'), '2026-08-04', 'una hora ilegible no desplaza');
eq(bitacora_viaje_noche('2026-08-04', '25:00'), '2026-08-04', 'una hora imposible no desplaza');

echo "fechas que no son fechas:\n";
eq(bitacora_viaje_noche('', '22:00'), null, 'sin fecha no hay noche');
eq(bitacora_viaje_noche('cuando sea', '22:00'), null, 'texto libre');
eq(bitacora_viaje_noche('2026-02-30', '22:00'), null, '30 de febrero no existe');
eq(bitacora_viaje_noche('2026-13-01', '22:00'), null, 'mes 13 no existe');
// El formulario manda a veces la fecha con hora pegada; la parte de fecha manda.
eq(bitacora_viaje_noche('2026-08-04T22:40', '22:40'), '2026-08-04', 'fecha con sufijo de hora');

echo "bitacora_viaje_clave:\n";
eq(bitacora_viaje_clave(7, 3, '2026-08-05', '02:15'),
   array('usuario_id' => 7, 'base_id' => 3, 'noche' => '2026-08-04'), 'clave completa');
// El lugar es del VIAJE, y es opcional: se puede salir a observar sin registrar
// desde dónde. La sesión, en cambio, existe siempre, así que un viaje sin base es
// legítimo y se identifica con base 0 ("sin lugar"): con NULL, la clave única de
// MySQL admitiría duplicados (permite varios NULL) y cada noche sin lugar se
// partiría en tantos viajes como veces se guardara.
eq(bitacora_viaje_clave(7, 0, '2026-08-05', '02:15'),
   array('usuario_id' => 7, 'base_id' => 0, 'noche' => '2026-08-04'), 'sin base sigue habiendo viaje');
eq(bitacora_viaje_clave(7, null, '2026-08-05', '02:15'),
   array('usuario_id' => 7, 'base_id' => 0, 'noche' => '2026-08-04'), 'base nula es lo mismo que sin base');
eq(bitacora_viaje_clave(7, -3, '2026-08-05', '02:15'),
   array('usuario_id' => 7, 'base_id' => 0, 'noche' => '2026-08-04'), 'una base imposible no inventa lugar');
// Dos noches sin lugar del mismo observador NO son el mismo viaje.
eq(bitacora_viaje_clave(7, 0, '2026-08-04', '22:00') === bitacora_viaje_clave(7, 0, '2026-08-05', '22:00'), false,
   'sin lugar, cada noche es su viaje');
// Y la misma noche sin lugar es SIEMPRE el mismo viaje, por muchas veces que se
// guarde: es lo que impide que se dupliquen.
eq(bitacora_viaje_clave(7, 0, '2026-08-04', '22:00') === bitacora_viaje_clave(7, 0, '2026-08-05', '02:00'), true,
   'sin lugar, la noche sigue siendo una sola');
eq(bitacora_viaje_clave(0, 3, '2026-08-05', '02:15'), null, 'sin observador no hay viaje');
eq(bitacora_viaje_clave(7, 3, 'sin fecha', '02:15'), null, 'sin fecha válida no hay viaje');
eq(bitacora_viaje_clave('7', '3', '2026-08-05', '02:15'),
   array('usuario_id' => 7, 'base_id' => 3, 'noche' => '2026-08-04'), 'ids como texto se normalizan a entero');

echo "el lugar SUBE al viaje, y no vuelve a bajar:\n";
// El lugar es de la salida. Si el viaje no lo registró, el formulario lo pide al
// guardar el objeto, y esa respuesta es del VIAJE entero: los siguientes objetos
// de esa misma noche ya no tienen por qué contestarla otra vez.
eq(bitacora_viaje_base_efectiva(0, 5), 5, 'viaje sin lugar: lo adopta del primer objeto que lo diga');
// Una vez el viaje tiene lugar, manda él: cambiarlo se hace en su ficha, no
// registrando un objeto. Si no, el último objeto de la noche mudaría la salida.
eq(bitacora_viaje_base_efectiva(3, 5), 3, 'viaje con lugar: no lo cambia un objeto');
eq(bitacora_viaje_base_efectiva(3, 0), 3, 'ni lo borra un objeto sin lugar');
eq(bitacora_viaje_base_efectiva(3, 3), 3, 'repetir el mismo lugar no es un cambio');
// Sin lugar en ninguna parte, la salida sigue sin lugar: es legítimo.
eq(bitacora_viaje_base_efectiva(0, 0), 0, 'nadie dice el lugar: la salida se queda sin él');
eq(bitacora_viaje_base_efectiva(0, null), 0, 'una observación sin base no inventa lugar');
eq(bitacora_viaje_base_efectiva(null, 5), 5, 'un viaje con base nula es un viaje sin lugar');
eq(bitacora_viaje_base_efectiva(0, -2), 0, 'una base imposible no sube a la salida');

echo "el reparto agrupa lo que debe agrupar:\n";
// Una salida real: cinco objetos entre las 22:00 y las 03:00, misma base.
$salida = array(
    array('2026-08-04', '22:05'), array('2026-08-04', '23:40'),
    array('2026-08-05', '00:30'), array('2026-08-05', '01:55'), array('2026-08-05', '03:10'),
);
$claves = array();
foreach ($salida as $o) { $claves[] = bitacora_viaje_clave(7, 3, $o[0], $o[1]); }
eq(count(array_unique(array_map('json_encode', $claves))), 1, 'los cinco objetos caen en UN solo viaje');
// Dos observadores, misma noche y base: un viaje cada uno.
eq(bitacora_viaje_clave(7, 3, '2026-08-04', '22:05') === bitacora_viaje_clave(9, 3, '2026-08-04', '22:05'), false,
   'dos observadores no comparten viaje');
// La misma noche desde bases distintas son viajes distintos.
eq(bitacora_viaje_clave(7, 3, '2026-08-04', '22:05') === bitacora_viaje_clave(7, 4, '2026-08-04', '22:05'), false,
   'dos bases no comparten viaje');
// Estable: es lo que hace idempotente al backfill.
eq(bitacora_viaje_clave(7, 3, '2026-08-05', '02:15') === bitacora_viaje_clave(7, 3, '2026-08-05', '02:15'), true,
   'la clave es estable entre llamadas');

echo "la salida que estaba EN CURSO se reconoce por sus horas:\n";
// El formulario de registro tiene que decir a qué salida se suma la observación
// SIN preguntar. La noche sola no basta: la ficha del viaje guarda la fecha en la
// que la salida empezó, y una que arranca de madrugada (los cometas del alba) o
// una que el observador fechó por el día en que volvió caen en una noche de
// mediodía distinta de la de sus propios objetos. Las horas de la ficha
// (comienzo–fin) son lo que sí sitúa el instante.
$v = function ($noche, $comienzo = '', $fin = '', $id = 0) {
    return (object) array('id' => $id, 'noche' => $noche, 'comienzo' => $comienzo, 'fin' => $fin);
};
$ids = function ($viajes) { return array_map(function ($x) { return $x->id; }, $viajes); };

eq(bitacora_viajes_candidatos(array(), '2026-08-05', '23:25'), array(), 'sin viajes no hay candidatos');
// Lo de siempre: la salida de esa noche sale aunque no diga sus horas.
eq($ids(bitacora_viajes_candidatos(array($v('2026-08-05', '', '', 1)), '2026-08-06', '01:00')),
   array(1), 'la salida de esa noche sale aunque no tenga horas');
// La ventana cruza la medianoche: la fecha de la observación ya no es la del viaje.
eq($ids(bitacora_viajes_candidatos(array($v('2026-08-05', '22:00', '03:00', 1)), '2026-08-06', '01:30')),
   array(1), 'la madrugada cae dentro de la salida que empezó anoche');
// El caso que hoy se pierde: la salida fechada el día en que arrancó, 23:25, y la
// observación de ese mismo instante. Misma noche de mediodía, así que también
// salía antes; lo que cambia es que ahora se sabe que CONTIENE el instante.
eq($ids(bitacora_viajes_candidatos(array($v('2026-08-05', '23:25', '03:00', 1)), '2026-08-05', '23:25')),
   array(1), 'el comienzo exacto ya está dentro');
eq($ids(bitacora_viajes_candidatos(array($v('2026-08-05', '23:25', '03:00', 1)), '2026-08-06', '03:00')),
   array(1), 'el fin exacto todavía está dentro');
// La salida que se alarga PASADO EL MEDIODÍA: a las 12:00 se abre noche nueva,
// así que el objeto de las 12:30 pertenece por noche a la salida siguiente —que
// no existe— mientras que por horas sigue dentro de la que no se ha acostado.
// Es lo que la noche sola no puede saber.
eq($ids(bitacora_viajes_candidatos(array($v('2026-08-05', '22:00', '13:00', 1)), '2026-08-06', '12:30')),
   array(1), 'la salida que pasa del mediodía sigue conteniendo sus horas');
// Y no se cuela la de otra noche que no contiene el instante.
eq($ids(bitacora_viajes_candidatos(array($v('2026-08-04', '22:00', '02:00', 1)), '2026-08-06', '01:30')),
   array(), 'una salida de otra noche que no lo contiene no sale');
// Dos salidas la misma noche (se cambió de sitio): la que contiene la hora es LA
// respuesta, no la primera de dos. Nadie observa desde dos sitios a la vez, así
// que ofrecer también la otra sería preguntar algo que ya se sabe.
$dos = array($v('2026-08-05', '21:00', '23:00', 1), $v('2026-08-05', '00:30', '03:00', 2));
eq($ids(bitacora_viajes_candidatos($dos, '2026-08-06', '01:00')), array(2),
   'de dos salidas de la noche, solo la que contiene la hora');
eq($ids(bitacora_viajes_candidatos($dos, '2026-08-05', '22:00')), array(1),
   'y al revés con la hora de la primera');
// Entre las dos ventanas (se recogió a las 23:00 y se volvió a salir a las 00:30)
// no hay salida abierta: vuelven las de la noche, que es lo único sensato que
// ofrecer.
eq($ids(bitacora_viajes_candidatos($dos, '2026-08-05', '23:40')), array(1, 2),
   'en el hueco entre dos salidas se ofrecen las de la noche');
// Dos fichas que se pisan: el observador no pudo estar en las dos. Se devuelven
// las dos para que el formulario lo cante como el error que es.
$pisadas = array($v('2026-08-05', '21:00', '02:00', 1), $v('2026-08-05', '22:00', '03:00', 2));
eq($ids(bitacora_viajes_candidatos($pisadas, '2026-08-05', '23:00')), array(1, 2),
   'dos salidas solapadas se devuelven las dos');
// Sin hora no hay instante que contener: se vuelve a la noche de siempre.
eq($ids(bitacora_viajes_candidatos(array($v('2026-08-05', '22:00', '03:00', 1), $v('2026-08-06', '22:00', '03:00', 2)), '2026-08-05', '')),
   array(1), 'sin hora manda la noche');
// Una ficha a medias no inventa ventana: sigue valiendo por su noche, y solo por ella.
eq($ids(bitacora_viajes_candidatos(array($v('2026-08-04', '22:00', '', 1)), '2026-08-06', '01:30')),
   array(), 'sin hora de fin no hay ventana que alcance a otra noche');
eq($ids(bitacora_viajes_candidatos(array($v('2026-08-05', '22:00', '', 1)), '2026-08-06', '01:30')),
   array(1), 'sin fin, la salida de esa noche sigue saliendo por su noche');

echo $fallos ? "\n$fallos FALLO(S)\n" : "\nok · el reparto en viajes respeta el convenio de mediodía\n";
exit($fallos ? 1 : 0);
