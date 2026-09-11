#!/usr/bin/env node
/* Test del CENTRO DESPLAZADO del campo
   (`centroDesplazado` en resources/js/bitacora-gaia-render.js).

   El campo del ocular se puede mover en pasos del 10 % del campo real dibujado.
   Un paso vale lo mismo EN CIELO en las dos direcciones, así que el paso en RA
   se divide por cos(dec): sin esa división el desplazamiento se encogería al
   acercarse al polo y el 10 % dejaría de ser un 10 %.

   Fuente única para el simulador y para el formulario de registro, que son las
   dos páginas que cargan este módulo (épica #265, historia #266).

   Sin dependencias:  node scripts/test_centro_desplazado.js  */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function casi(a, b, tol, etiqueta) {
  if (Math.abs(a - b) <= tol) { console.log('  ok   ' + etiqueta + ' = ' + a); }
  else { fallos++; console.error('  FALLA ' + etiqueta + '\n         esperado ' + b + ' ±' + tol + '\n         obtenido ' + a); }
}

var ARCMIN = 30;                  // campo de media hora de arco
var PASO = 0.10 * ARCMIN / 60;    // 0,05° por clic

console.log('1) El paso en dec y en RA');
var c = R.centroDesplazado({ ra: 100, dec: 20, arcmin: ARCMIN, pasoX: 1, pasoY: 1 });
casi(c.dec - 20, PASO, 1e-12, 'dec sube un paso entero');
casi(c.ra - 100, PASO / Math.cos(20 * Math.PI / 180), 1e-12, 'RA sube el paso dividido por cos(dec)');
var c2 = R.centroDesplazado({ ra: 100, dec: 20, arcmin: ARCMIN, pasoX: -3, pasoY: -2 });
casi(c2.dec - 20, -2 * PASO, 1e-12, 'los pasos negativos y múltiples escalan');
casi(c2.ra - 100, -3 * PASO / Math.cos(20 * Math.PI / 180), 1e-12, 'idem en RA');

console.log('2) Cerca del polo (dec 80°) el paso en cielo es el mismo');
var p = R.centroDesplazado({ ra: 50, dec: 80, arcmin: ARCMIN, pasoX: 1, pasoY: 0 });
var dRa = p.ra - 50;
casi(dRa / PASO, 1 / Math.cos(80 * Math.PI / 180), 1e-9, 'el paso en grados de RA vale ~5,8 veces el de dec');
casi(dRa * Math.cos(80 * Math.PI / 180), PASO, 1e-12, 'en CIELO, el mismo desplazamiento que en dec');

console.log('3) La RA vuelve normalizada a [0, 360)');
var cruce = R.centroDesplazado({ ra: 0.01, dec: 0, arcmin: ARCMIN, pasoX: -1, pasoY: 0 });
ok(cruce.ra >= 0 && cruce.ra < 360, 'cruzando 0h hacia abajo: ' + cruce.ra);
casi(cruce.ra, 360 + 0.01 - PASO, 1e-12, 'y cae justo un paso por debajo de 0h');
var vuelta = R.centroDesplazado({ ra: 359.99, dec: 0, arcmin: ARCMIN, pasoX: 1, pasoY: 0 });
ok(vuelta.ra >= 0 && vuelta.ra < 360, 'cruzando 0h hacia arriba: ' + vuelta.ra);
casi(vuelta.ra, 359.99 + PASO - 360, 1e-12, 'y cae justo un paso por encima de 0h');

console.log('4) La declinación queda acotada a ±90');
var norte = R.centroDesplazado({ ra: 10, dec: 89.99, arcmin: 600, pasoX: 0, pasoY: 5 });
ok(norte.dec <= 90, 'no se sale por el norte: ' + norte.dec);
var sur = R.centroDesplazado({ ra: 10, dec: -89.99, arcmin: 600, pasoX: 0, pasoY: -5 });
ok(sur.dec >= -90, 'no se sale por el sur: ' + sur.dec);

console.log('5) En el polo el paso en RA no se dispara');
// cos(90°) vale ~6e-17, así que sin suelo un paso al este mandaría el centro a
// miles de vueltas. El suelo es el coseno de 89,9°, donde un campo ya abarca
// todos los husos y da igual dónde caiga.
var polo = R.centroDesplazado({ ra: 120, dec: 90, arcmin: ARCMIN, pasoX: 1, pasoY: 0 });
ok(isFinite(polo.ra) && polo.ra >= 0 && polo.ra < 360, 'RA finita y en rango en el polo: ' + polo.ra);
casi(polo.ra - 120, PASO / Math.cos(89.9 * Math.PI / 180), 1e-9, 'el paso en RA se queda en el suelo de 89,9°');

console.log('6) El coseno es el de la declinación DE PARTIDA');
// El paso en RA de un clic diagonal vale lo mismo que el de un clic al este
// puro: no lo encoge la componente norte-sur del mismo clic.
var este = R.centroDesplazado({ ra: 40, dec: 60, arcmin: ARCMIN, pasoX: 1, pasoY: 0 });
var diagonal = R.centroDesplazado({ ra: 40, dec: 60, arcmin: ARCMIN, pasoX: 1, pasoY: 1 });
casi(diagonal.ra, este.ra, 1e-12, 'la diagonal mueve en RA lo mismo que el este puro');
casi(diagonal.ra - 40, PASO / Math.cos(60 * Math.PI / 180), 1e-12, 'y con cos(60°), no con cos(60°+paso)');
// Corolario para quien llame: encadenar clic a clic NO da el mismo centro que
// pedirlo con los pasos acumulados, porque el coseno cambia con la dec. El
// contrato es acumular los pasos y llamar una sola vez desde el centro original.
var encadenado = R.centroDesplazado({ ra: este.ra, dec: este.dec, arcmin: ARCMIN, pasoX: 0, pasoY: 1 });
ok(Math.abs(encadenado.ra - diagonal.ra) < 1e-12, 'este + norte encadenados = diagonal acumulada (aquí sí, el este fue primero)');
var alReves = R.centroDesplazado({ ra: 40, dec: 60, arcmin: ARCMIN, pasoX: 0, pasoY: 1 });
alReves = R.centroDesplazado({ ra: alReves.ra, dec: alReves.dec, arcmin: ARCMIN, pasoX: 1, pasoY: 0 });
ok(Math.abs(alReves.ra - diagonal.ra) > 1e-6, 'y norte + este encadenados se desvían: por eso se acumulan los pasos');

console.log('7) Paso cero devuelve el centro exacto');
var quieto = R.centroDesplazado({ ra: 83.822083, dec: -5.391111, arcmin: ARCMIN, pasoX: 0, pasoY: 0 });
ok(quieto.ra === 83.822083, 'RA sin arrastre numérico');
ok(quieto.dec === -5.391111, 'dec sin arrastre numérico');

console.log(fallos ? '\nFALLOS: ' + fallos : '\nTodo OK');
process.exit(fallos ? 1 : 0);
