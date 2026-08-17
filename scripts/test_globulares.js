#!/usr/bin/env node
/* Test de la geometría del cúmulo globular (perfil de King) en
   resources/js/bitacora-gaia-render.js.

   El halo continuo que se pintaba con este perfil se retiró (Fase 0 del
   modelo de observación de cúmulos): perfilKing/areaKing quedan como
   geometría, que es lo que consumirá el campo estadístico. Lo que se
   comprueba aquí es la forma del perfil (normalizado, monótono, continuo)
   y que su integral cerrada coincide con la numérica.

   Sin dependencias:  node scripts/test_globulares.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function casi(actual, esperado, tol, etiqueta) {
  if (Math.abs(actual - esperado) <= tol) {
    console.log('  ok   ' + etiqueta + ' = ' + actual.toFixed(4));
  } else {
    fallos++;
    console.error('  FALLA ' + etiqueta + '\n         esperado ' + esperado.toFixed(4) +
      ' ±' + tol + '\n         obtenido ' + actual.toFixed(4));
  }
}

// M13 (NGC 6205) y M92 (NGC 6341), del catálogo de Harris — ver
// simulador_ocular/resources/js/globulares-datos.js.
var M13 = { rc: 0.62, rt: 0.62 * Math.pow(10, 1.53), muV0: 16.59 };
var M92 = { rc: 0.26, rt: 0.26 * Math.pow(10, 1.68), muV0: 15.47 };

/* ── 1. perfilKing: normalizado, monótono, continuo ─────────────────────── */
console.log('perfilKing: forma del perfil:');
var rcAs = M13.rc * 60, rtAs = M13.rt * 60;
casi(R.perfilKing(0, rcAs, rtAs), 1, 1e-9, 'vale 1 en el centro');
casi(R.perfilKing(rtAs, rcAs, rtAs), 0, 1e-9, 'vale 0 en el radio de marea');
ok(R.perfilKing(rtAs * 1.5, rcAs, rtAs) === 0, 'vale 0 más allá del radio de marea');

var muestras = 200, prev = Infinity, monotono = true;
for (var i = 1; i <= muestras; i++) {
  var r = (rtAs * i) / muestras;
  var v = R.perfilKing(r, rcAs, rtAs);
  if (v > prev + 1e-9) monotono = false;
  prev = v;
}
ok(monotono, 'estrictamente decreciente del centro al radio de marea (sin rebotes)');
// Continuidad de verdad (no un paso uniforme sobre un perfil muy picudo cerca
// del núcleo, que saltaría igual sin que hubiera ningún bug): un paso ínfimo
// de r no debe mover el valor más que ese mismo paso, en ningún punto del rango.
var eps = 1e-3, continuo = true;
[0, rcAs / 4, rcAs / 2, rcAs, rcAs * 2, rcAs * 5, rtAs * 0.5, rtAs * 0.99].forEach(function (r) {
  var d = Math.abs(R.perfilKing(r + eps, rcAs, rtAs) - R.perfilKing(r, rcAs, rtAs));
  if (d > eps * 50) continuo = false;   // margen generoso: solo atrapa saltos reales, no pendiente alta
});
ok(continuo, 'sin discontinuidades (paso infinitesimal, no cambia de golpe en ningún punto)');

/* ── 2. areaKing: la integral cerrada coincide con la numérica ──────────── */
console.log('areaKing: integral cerrada vs. numérica (trapecios):');
[M13, M92, { rc: 1, rt: 5, muV0: 18 }].forEach(function (c) {
  var k = c.rt / c.rc;
  var N = 20000, h = k / N, suma = 0;
  for (var j = 0; j < N; j++) {
    var u0 = j * h, u1 = (j + 1) * h;
    var f0 = R.perfilKing(u0, 1, k) * u0, f1 = R.perfilKing(u1, 1, k) * u1;
    suma += (f0 + f1) / 2 * h;
  }
  var numerico = 2 * Math.PI * suma;
  casi(R.areaKing(k), numerico, numerico * 1e-3, 'k=' + k.toFixed(2) + ': cerrada vs. numérica');
});

/* ── 3. El halo continuo no vuelve ───────────────────────────────────────────
   La paridad píxel a píxel entre `globular: true` y `false` no se puede medir
   en node (capaEstrellas necesita un <canvas> real), pero es exacta por
   construcción mientras el render no lea el flag ni exporte las funciones del
   halo. Eso sí se comprueba, y es lo que fallaría si alguien las resucita. */
console.log('El halo continuo de King no se pinta ni se exporta:');
['haloGlobular', 'gammaHalo', 'fobjGlobular', 'muGlobular', 'pintarHaloGlobular'].forEach(function (f) {
  ok(R[f] === undefined, f + ' no está en la API del render');
});
ok(R.config.globular === undefined, 'config.globular (rangoMag, magResta, restaMaxFrac, gamma*) no existe');

var fs = require('fs'), path = require('path');
var raiz = path.join(__dirname, '..');
[['resources/js/bitacora-gaia-render.js', /o\.globular|opciones\.globular/],
 ['simulador_ocular/resources/js/bitacora-ocular.js', /pintarHaloGlobular|haloGlobular\(/]].forEach(function (par) {
  var src = fs.readFileSync(path.join(raiz, par[0]), 'utf8');
  ok(!par[1].test(src), par[0] + ': ninguna rama de dibujo depende del halo');
});

console.log(fallos === 0 ? '\nTodo OK' : '\n' + fallos + ' fallo(s)');
process.exit(fallos === 0 ? 0 : 1);
