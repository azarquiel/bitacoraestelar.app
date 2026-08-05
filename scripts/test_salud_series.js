#!/usr/bin/env node
/* Test de las SERIES DE LA SALUD de una base
   (`BitacoraBase.seriesSalud`, resources/js/bitacora-base.js).

   La salud del sitio son tres números con tres unidades y dos direcciones:
   el SQM en mag/arcsec² (mayor = mejor), el IR en ºC (menor = mejor) y el
   seeing en la escala de Antoniadi 1–5 (menor = mejor). Meterlos en un solo eje
   pintaría el 21.4 del SQM y el −20 del IR en extremos opuestos del papel y una
   noche buena parecería mala.

   Por eso cada serie se escala a SU propio rango y se orienta igual: arriba es
   siempre mejor cielo. Lo que se dibuja es la forma; el número de verdad viaja
   con cada punto para las etiquetas y el tooltip.

   Sin dependencias ni DOM: esto es aritmética.
   node scripts/test_salud_series.js  */
'use strict';

global.window = {};
require('../resources/js/bitacora-base.js');
var B = global.window.BitacoraBase;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function eq(a, b, etiqueta) {
  var iguales = JSON.stringify(a) === JSON.stringify(b);
  if (iguales) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta + '\n         esperado ' + JSON.stringify(b) + '\n         obtenido ' + JSON.stringify(a)); }
}
function seccion(t) { console.log('\n' + t); }
function med(fecha, hora, sqm, ir, seeing) {
  return { noche: fecha, fecha: fecha, hora: hora, sqm: sqm, ir: ir, seeing: seeing, observador: 'Isra' };
}
function serie(res, clave) {
  var s = res.series.filter(function (x) { return x.clave === clave; });
  return s.length ? s[0] : null;
}
/* La altura de cada punto, redondeada: es lo único que se dibuja. */
function alturas(s) { return s.puntos.map(function (p) { return Math.round(p.y * 1000) / 1000; }); }

seccion('sin mediciones no hay series:');
eq(B.seriesSalud([]).series, [], 'lista vacía');

seccion('solo salen las medidas que alguien midió:');
// Si nadie anotó el seeing, ofrecer su interruptor y su leyenda sería prometer
// una línea que no existe.
var res = B.seriesSalud([med('2026-08-04', '22:00', 21.4, -20, null), med('2026-08-05', '22:00', 20.6, -12, null)]);
eq(res.series.map(function (s) { return s.clave; }), ['sqm', 'ir'], 'sqm e ir, sin seeing');

seccion('el SQM sube cuando el cielo es más oscuro:');
var s = serie(B.seriesSalud([med('2026-08-04', '22:00', 20.4, null, null), med('2026-08-05', '22:00', 21.4, null, null)]), 'sqm');
eq(alturas(s), [0, 1], 'el 21.4 arriba y el 20.4 abajo');
eq([s.min, s.max], [20.4, 21.4], 'el rango real, para etiquetar el eje');

seccion('el IR y el seeing se dan la vuelta: arriba es siempre mejor cielo:');
// Un IR de −25 ºC es un cielo más transparente que uno de −10, y un seeing 1 es
// mejor que un 4. Sin invertirlos, la misma noche subiría en una línea y
// bajaría en otra, y la gráfica no se podría leer de un golpe.
s = serie(B.seriesSalud([med('2026-08-04', '22:00', null, -25, null), med('2026-08-05', '22:00', null, -10, null)]), 'ir');
eq(alturas(s), [1, 0], 'el −25 arriba');
s = serie(B.seriesSalud([med('2026-08-04', '22:00', null, null, 1), med('2026-08-05', '22:00', null, null, 4)]), 'seeing');
eq(alturas(s), [1, 0], 'el seeing 1 arriba');

seccion('cada serie se escala a su propio rango:');
// Tres unidades distintas en un solo eje. Escalar a un rango común aplastaría
// el seeing (1–5) contra el suelo frente al SQM (~21) o lanzaría el IR fuera.
res = B.seriesSalud([
  med('2026-08-04', '22:00', 20.4, -10, 4),
  med('2026-08-05', '22:00', 20.9, -25, 2),
  med('2026-08-06', '22:00', 21.4, -17.5, 3)
]);
eq(alturas(serie(res, 'sqm')), [0, 0.5, 1], 'el SQM ocupa todo el alto');
eq(alturas(serie(res, 'seeing')), [0, 1, 0.5], 'y el seeing también, con su escala de 1 a 5');
eq(alturas(serie(res, 'ir')), [0, 1, 0.5], 'y el IR con la suya');

seccion('una sola medición se queda en el centro:');
// Con un único valor no hay rango: repartirlo entre 0 y 1 sería inventarse un
// mínimo y un máximo. Se pinta a media altura y ya.
s = serie(B.seriesSalud([med('2026-08-04', '22:00', 21.4, null, null)]), 'sqm');
eq(alturas(s), [0.5], 'a media altura');
eq([s.min, s.max], [21.4, 21.4], 'y el rango es ese valor');
// Lo mismo si midió varias veces lo mismo: dividir por cero daría NaN y el SVG
// se quedaría en blanco sin decir por qué.
s = serie(B.seriesSalud([med('2026-08-04', '22:00', 21.4, null, null), med('2026-08-05', '22:00', 21.4, null, null)]), 'sqm');
eq(alturas(s), [0.5, 0.5], 'línea plana, no NaN');

seccion('el punto lleva su valor de verdad y de dónde viene:');
s = serie(B.seriesSalud([med('2026-08-04', '22:30', 21.4, null, null)]), 'sqm');
eq(s.puntos[0].valor, 21.4, 'el número medido, sin normalizar');
ok(s.puntos[0].fecha === '2026-08-04' && s.puntos[0].hora === '22:30' && s.puntos[0].observador === 'Isra',
   'la fecha, la hora y quién lo anotó');

seccion('el tiempo es el mismo eje para las tres:');
// Las líneas comparten el eje horizontal: si cada una se estirase a sus propias
// fechas, dos noches distintas caerían en el mismo sitio del papel.
res = B.seriesSalud([med('2026-08-04', '22:00', 21.4, null, null), med('2026-08-08', '22:00', null, null, 2)]);
ok(res.tMin < res.tMax, 'hay un rango de tiempo');
eq([serie(res, 'sqm').puntos[0].t, serie(res, 'seeing').puntos[0].t], [res.tMin, res.tMax],
   'la primera noche abre el eje y la última lo cierra');

seccion('un valor sin fecha utilizable no se dibuja:');
// Sin fecha no hay dónde ponerlo en el eje: colarlo lo pintaría en 1970.
res = B.seriesSalud([med('', '', 21.4, null, null), med('2026-08-04', '22:00', 20.9, null, null)]);
eq(alturas(serie(res, 'sqm')), [0.5], 'solo queda la medición fechada');

seccion('las medidas llegan como texto de la base de datos:');
res = B.seriesSalud([med('2026-08-04', '22:00', '20.4', '-10', '4'), med('2026-08-05', '22:00', '21.4', '', null)]);
eq(alturas(serie(res, 'sqm')), [0, 1], 'el texto se lee como número');
eq(serie(res, 'ir').puntos.length, 1, 'y la cadena vacía no es un cero');

console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nok · las tres series se leen en el mismo papel');
process.exit(fallos ? 1 : 0);
