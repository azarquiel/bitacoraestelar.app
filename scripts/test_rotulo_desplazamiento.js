#!/usr/bin/env node
/* Test del RÓTULO del desplazamiento del campo
   (`rotuloDesplazamiento` en resources/js/bitacora-gaia-render.js).

   La cruceta del simulador mueve el campo en pasos del 10 %; el observador
   necesita leer CUÁNTO y HACIA DÓNDE en grados, no en pasos (épica #265,
   historia #267). Vive en el módulo compartido porque el modal del registro
   (#268) enseña el mismo rótulo.

   Sin dependencias:  node scripts/test_rotulo_desplazamiento.js  */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function eq(a, b, etiqueta) {
  if (a === b) { console.log('  ok   ' + etiqueta + ' → "' + a + '"'); }
  else { fallos++; console.error('  FALLA ' + etiqueta + '\n         esperado "' + b + '"\n         obtenido "' + a + '"'); }
}
function rot(pasoX, pasoY, arcmin) {
  return R.rotuloDesplazamiento({ pasoX: pasoX, pasoY: pasoY, arcmin: arcmin || 60 });
}

console.log('1) Sin desplazamiento no hay rótulo');
eq(rot(0, 0), '', 'centrado en el objeto');

console.log('2) Un eje: grados y punto cardinal');
// Campo de 1°: un paso = 0,1°; tres pasos = 0,3°.
eq(rot(3, 0), 'desplazado 0,3° E', 'pasoX positivo va al Este');
eq(rot(-3, 0), 'desplazado 0,3° O', 'pasoX negativo va al Oeste');
eq(rot(0, 1), 'desplazado 0,1° N', 'pasoY positivo va al Norte');
eq(rot(0, -2), 'desplazado 0,2° S', 'pasoY negativo va al Sur');

console.log('3) Los dos ejes, en el orden del enunciado (E/O primero)');
eq(rot(3, 1), 'desplazado 0,3° E, 0,1° N', 'diagonal noreste');
eq(rot(-1, -1), 'desplazado 0,1° O, 0,1° S', 'diagonal suroeste');

console.log('4) El grado sale del campo DIBUJADO, no de los pasos');
eq(rot(1, 0, 120), 'desplazado 0,2° E', 'campo de 2°: el paso vale 0,2°');
eq(rot(20, 0, 60), 'desplazado 2,0° E', 'el tope (±2 campos) de un campo de 1°');

console.log('5) Coma decimal, que es como se escribe en español');
eq(rot(15, 0, 60), 'desplazado 1,5° E', 'coma, no punto');

if (fallos) { console.error('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nTodo verde.');
