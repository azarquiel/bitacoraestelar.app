#!/usr/bin/env node
/* Test de las ESCALAS DEL CIELO de la sesión
   (`transparenciaPorIr` y `claseBortlePorSqm` en resources/js/bitacora-base.js).

   El fallo que fija: el IR del cielo es NEGATIVO y baja cuanto más transparente
   está (un −30 es mejor cielo que un −3), pero la búsqueda de banda comparaba con
   «mayor o igual» recorriendo la tabla al revés —lo correcto para el SQM del
   Bortle, que es positivo y sube con la oscuridad—. Con eso un cielo de −3 salía
   como «Algo transparente» cuando es Pobre.

   Las dos funciones tienen la misma forma y escalas opuestas, así que se prueban
   juntas: es el contraste lo que explica por qué las comparaciones difieren.

   Sin dependencias:  node scripts/test_cielo.js  */
'use strict';

global.window = {};
require('../resources/js/bitacora-base.js');
var B = global.window.BitacoraBase;

var fallos = 0;
function eq(ir, esperada, etiqueta) {
  var t = B.transparenciaPorIr(ir);
  var obtenida = t ? t.etiqueta : String(t);
  if (obtenida === esperada) { console.log('  ok   IR ' + ir + ' → ' + obtenida + (etiqueta ? '   (' + etiqueta + ')' : '')); }
  else { fallos++; console.error('  FALLA IR ' + ir + '\n         esperado ' + esperada + '\n         obtenido ' + obtenida); }
}
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

/* ── 1. Las bandas del IR, tal como las midió el observador ─────────────────── */
console.log('Transparencia por IR (más negativo = más transparente):');
eq(-3,  'Pobre', 'el caso del informe');
eq(-1,  'Pobre');
eq(0,   'Pobre');
eq(4,   'Pobre', 'IR positivo: cielo malo, no se sale de la escala');
eq(-5,  'Algo transparente', 'el borde es de la banda MÁS transparente');
eq(-10, 'Algo transparente');
eq(-15, 'Mayoritariamente transparente');
eq(-18, 'Mayoritariamente transparente');
eq(-20, 'Transparente');
eq(-25, 'Transparente');
eq(-30, 'Extremadamente transparente');
eq(-45, 'Extremadamente transparente', 'por debajo de −30 no hay banda mejor');

ok(B.transparenciaPorIr(NaN) === null, 'sin medida no hay etiqueta (null)');

/* ── 2. Cada opción del desplegable cae en su propia banda ──────────────────── */
/* Es lo que mantiene sincronizados el <select> y el <input>: si elegir
   «Transparente · IR −20» devolviera otra etiqueta, el desplegable saltaría solo. */
console.log('\nIda y vuelta del desplegable:');
B.TRANSPARENCIA.forEach(function (t) {
  var vuelta = B.transparenciaPorIr(t.ir);
  ok(vuelta === t, 'la opción «' + t.etiqueta + ' · IR ' + t.ir + '» vuelve a su banda');
});

/* Monotonía: bajar el IR nunca puede empeorar la etiqueta. Barre la escala entera
   en pasos de 0,5 y comprueba que el índice de banda no retrocede. */
console.log('\nMonotonía en toda la escala:');
var idx = function (ir) { return B.TRANSPARENCIA.indexOf(B.transparenciaPorIr(ir)); };
var monotona = true, anterior = idx(-50);
for (var ir = -50; ir <= 10; ir += 0.5) {
  var i = idx(ir);
  if (i < anterior) { monotona = false; }
  anterior = i;
}
ok(monotona, 'de −50 a +10, la transparencia solo puede ir a peor');

/* ── 3. El Bortle, la escala hermana: positiva y al contrario ───────────────── */
/* Aquí el sqm de cada clase es el MÍNIMO del rango y sube con la oscuridad, así
   que la comparación correcta sí es «mayor o igual». Se prueba para que quede
   claro que la diferencia es intencionada y no la otra mitad del mismo fallo. */
console.log('\nClase Bortle por SQM (más alto = más oscuro):');
function eqB(sqm, clase) {
  var b = B.claseBortlePorSqm(sqm);
  if (b && b.clase === clase) { console.log('  ok   SQM ' + sqm + ' → clase ' + b.clase + ' (' + b.etiqueta + ')'); }
  else { fallos++; console.error('  FALLA SQM ' + sqm + '\n         esperado clase ' + clase + '\n         obtenido ' + (b ? b.clase : b)); }
}
eqB(22.0, 1);
eqB(21.9, 1);
eqB(21.7, 2);
eqB(21.4, 3);
eqB(20.0, 5);
eqB(14.0, 9);
eqB(10.0, 9);
ok(B.claseBortlePorSqm(NaN) === null, 'sin medida no hay clase (null)');

B.BORTLE.forEach(function (b) {
  ok(B.claseBortlePorSqm(b.sqm) === b, 'la opción «clase ' + b.clase + ' · SQM ' + b.sqm + '» vuelve a su clase');
});

console.log('\n' + (fallos === 0 ? '✓ Todo correcto.' : '✗ ' + fallos + ' fallo(s).'));
process.exit(fallos === 0 ? 0 : 1);
