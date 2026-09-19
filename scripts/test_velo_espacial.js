#!/usr/bin/env node
/* Test del mapeo celda→lienzo del velo espacial (épica #330, ADR 0029, L5).

   Contrato: veloEspacial pinta el EXCESO POSITIVO de cada celda sobre la media
   escalar (veloSB), con un núcleo tienda de semiancho = celda, y CONSERVA el
   flujo del exceso (listón L5). La media queda en el cielo (no se toca aquí);
   lo negativo se queda en la media (aproximación uniforme del ADR 0014).

   Sin red, sin canvas:  node scripts/test_velo_espacial.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function eq(cond, msg) {
  if (cond) { console.log('  ok  ' + msg); }
  else { console.log('  FALLO  ' + msg); fallos++; }
}

var SIZE = 64;
var N = 8, cellDeg = 1 / N;
var o = { ra0: 100, dec0: 0, arcmin: 30, size: SIZE, veloSB: 20 };
var meanAs2 = Math.pow(10, -0.4 * 20);            // 1e-8 flujo/arcsec²
var asPorPx = (o.arcmin * 60) / SIZE;
function sumaFlujo(difuso) {
  var s = 0;
  for (var i = 0; i < difuso.length; i++) s += difuso[i];
  return s * asPorPx * asPorPx;
}

console.log('T1 existe veloEspacial');
eq(typeof R.veloEspacial === 'function', 'R.veloEspacial exportada');

console.log('T2 sin celdas / sin veloSB → null');
{
  eq(R.veloEspacial(new Float32Array(SIZE * SIZE), null, o) === null, 'sin espacial → null');
  eq(R.veloEspacial(new Float32Array(SIZE * SIZE), { N: 8, celdas: [] }, o) === null, 'sin celdas → null');
  eq(R.veloEspacial(new Float32Array(SIZE * SIZE), { N: 8, celdas: [[800, 0, 1, 1e-3, 0]] }, { ra0: 100, dec0: 0, arcmin: 30, size: SIZE }) === null, 'sin veloSB → null');
}

console.log('T3 L5: el exceso positivo se conserva exacto');
{
  // Una celda brillante centrada en el campo: rx=800 (ra=100,0625), dy=0.
  var cellAreaAs2 = Math.pow(cellDeg * 3600, 2);  // cos(dec≈0) ≈ 1
  var cellSB = 2e-8;                              // el doble de la media
  var flujo = cellSB * cellAreaAs2;
  var espacial = { N: N, celdas: [[800, 0, 100, flujo, 0]] };
  var difuso = new Float32Array(SIZE * SIZE);
  var r = R.veloEspacial(difuso, espacial, o);
  var excesoEsperado = flujo - meanAs2 * cellAreaAs2;   // exceso de la celda (G=0)
  eq(Math.abs(r.depositado / excesoEsperado - 1) < 1e-6,
    'depositado == exceso (' + r.depositado.toExponential(3) + ')');
  // Lo pintado en el lienzo coincide con lo declarado (mismo flujo).
  var pintado = sumaFlujo(difuso);
  eq(Math.abs(pintado / r.depositado - 1) < 1e-6, 'flujo en difuso == depositado');
}

console.log('T4 la celda por debajo de la media no pinta (queda en el cielo)');
{
  var cellAreaAs2 = Math.pow(cellDeg * 3600, 2);
  var flujoTenue = 0.5e-8 * cellAreaAs2;          // la mitad de la media
  var espacial = { N: N, celdas: [[800, 0, 100, flujoTenue, 0]] };
  var difuso = new Float32Array(SIZE * SIZE);
  var r = R.veloEspacial(difuso, espacial, o);
  eq(r.depositado === 0, 'exceso ≤ 0 → nada depositado');
  eq(sumaFlujo(difuso) === 0, 'difuso vacío');
}

console.log('T5 la theta de juicio es el tamaño de celda');
{
  var cellAreaAs2 = Math.pow(cellDeg * 3600, 2);
  var espacial = { N: N, celdas: [[800, 0, 100, 2e-8 * cellAreaAs2, 0]] };
  var r = R.veloEspacial(new Float32Array(SIZE * SIZE), espacial, o);
  eq(Math.abs(r.thetaArcmin - cellDeg * 60) < 1e-9, 'theta = celda (' + r.thetaArcmin + ' arcmin)');
}

process.exit(fallos ? 1 : 0);
