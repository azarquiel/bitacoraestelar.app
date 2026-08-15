#!/usr/bin/env node
/* Experimento V2-B (ver prompt_tareas.md): resta ESPACIAL (PSF) del flujo de
   las estrellas Gaia ya resueltas, en vez de restarlo como cantidad global
   uniforme sobre toda el área del halo.

   Verifica: conservación aproximada de flujo, ausencia de flujo negativo,
   comportamiento con muchas estrellas y con una estrella muy brillante.

   Sin dependencias: node scripts/test_globulares_v2b.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

var M13 = { rc: 0.62, rt: 0.62 * Math.pow(10, 1.53), muV0: 16.59 };
var RA0 = 250.42183, DEC0 = 36.45986;
var rcAsM13 = M13.rc * 60, rtAsM13 = M13.rt * 60, k13 = rtAsM13 / rcAsM13;
var areaAs2 = R.areaKing(k13) * rcAsM13 * rcAsM13;
var Ftotal = Math.pow(10, -0.4 * M13.muV0) * areaAs2;

function integralDifuso(difuso, SIZE, arcmin) {
  var pxPorAs = (SIZE / (arcmin / 60)) / 3600;
  var pxAreaAs2 = 1 / (pxPorAs * pxPorAs);
  var suma = 0;
  for (var p = 0; p < difuso.length; p++) suma += difuso[p];
  return suma * pxAreaAs2;
}

var SIZE = 400, arcmin = 60, apertura = 200;   // 200 mm: PSF ni minúscula ni gigante

console.log('V2-B: ausencia de flujo negativo y orden de magnitud del flujo pintado:');
R.config.globular.experimentoHaloV2 = 'B';

// -- Sin estrellas: debe coincidir con V2-A (restaMap nulo, sin estrellas que restar) --
var haloSinEstrellas = R.haloGlobular(M13, [], RA0, DEC0, 100, apertura);
var difusoSin = new Float32Array(SIZE * SIZE);
R.pintarHaloGlobular(difusoSin, haloSinEstrellas, { arcmin: arcmin, size: SIZE });
var intSin = integralDifuso(difusoSin, SIZE, arcmin);
ok(Math.abs(intSin - Ftotal) / Ftotal < 0.02, 'sin estrellas: el flujo pintado ≈ Ftotal del catálogo (±2%, resolución del grid)');

// -- Pocas estrellas (3), lejos entre sí: la resta debe acercarse al total resuelto --
var pocas = [
  [RA0 + 30 / 3600, DEC0, 12, 1.0],
  [RA0 - 60 / 3600, DEC0 + 40 / 3600, 13, 1.0],
  [RA0, DEC0 - 90 / 3600, 11, 1.0]
];
var Fresueltas = pocas.reduce(function (s, e) { return s + Math.pow(10, -0.4 * e[2]); }, 0);
var haloPocas = R.haloGlobular(M13, pocas, RA0, DEC0, 100, apertura);
var difusoPocas = new Float32Array(SIZE * SIZE);
R.pintarHaloGlobular(difusoPocas, haloPocas, { arcmin: arcmin, size: SIZE });
var negativos = false;
for (var q = 0; q < difusoPocas.length; q++) if (difusoPocas[q] < 0) negativos = true;
ok(!negativos, 'pocas estrellas: nunca hay flujo negativo en el difuso (max(...,0) por píxel)');
var intPocas = integralDifuso(difusoPocas, SIZE, arcmin);
console.log('  Ftotal=' + Ftotal.toExponential(3) + '  Fresueltas=' + Fresueltas.toExponential(3) +
  '  integral pintada=' + intPocas.toExponential(3) + '  esperado≈' + (Ftotal - Fresueltas).toExponential(3));
ok(intPocas < intSin, 'pocas estrellas: el flujo pintado baja respecto de "sin estrellas" (algo se restó)');
ok(Math.abs(intPocas - (Ftotal - Fresueltas)) / Ftotal < 0.05,
  'pocas estrellas, bien separadas: la resta espacial recupera aprox. el mismo total que restaría la global (±5% de Ftotal)');

// -- Estrella muy brillante en el núcleo: no debe volverse negativo ni "cavar" fuera de su PSF --
var brillante = [[RA0, DEC0, 6, 1.0]];   // g=6: mucho más flujo que el halo local
var haloBrillante = R.haloGlobular(M13, brillante, RA0, DEC0, 100, apertura);
var difusoBrillante = new Float32Array(SIZE * SIZE);
R.pintarHaloGlobular(difusoBrillante, haloBrillante, { arcmin: arcmin, size: SIZE });
var negB = false;
for (var b = 0; b < difusoBrillante.length; b++) if (difusoBrillante[b] < 0) negB = true;
ok(!negB, 'estrella muy brillante en el núcleo: sin flujo negativo (clamp local, no global)');
// Lejos de la estrella brillante (borde del halo), el flujo no debe haberse
// visto afectado por su resta (PSF de cola corta, no "cava" en el borde).
var cx = SIZE / 2, cy = SIZE / 2;
var pxPorAs = (SIZE / (arcmin / 60)) / 3600;
var xBorde = Math.round(cx + (haloBrillante.rtAs * 0.9) * pxPorAs);
if (xBorde < SIZE) {
  var fBordeSin = difusoSin[cy * SIZE + xBorde];
  var fBordeBrillante = difusoBrillante[cy * SIZE + xBorde];
  ok(Math.abs(fBordeBrillante - fBordeSin) < fBordeSin * 0.01,
    'estrella brillante en el núcleo: el borde del halo (90% de rt) no se ve afectado (PSF local, no global)');
}

// -- Muchas estrellas (500) apiladas en un punto: el clamp a 0 evita flujo negativo,
//    y el déficit de conservación ahí es el coste esperado de "muchas estrellas
//    en un punto que no es físico" (todas en la misma coordenada). --
var muchas = [];
for (var m = 0; m < 500; m++) muchas.push([RA0, DEC0, 14, 1.0]);
var haloMuchas = R.haloGlobular(M13, muchas, RA0, DEC0, 100, apertura);
var difusoMuchas = new Float32Array(SIZE * SIZE);
R.pintarHaloGlobular(difusoMuchas, haloMuchas, { arcmin: arcmin, size: SIZE });
var negM = false;
for (var mm = 0; mm < difusoMuchas.length; mm++) if (difusoMuchas[mm] < 0) negM = true;
ok(!negM, 'muchas estrellas apiladas: sin flujo negativo pese a que su suma supera con mucho el King local');

console.log(fallos === 0 ? '\nTodo OK' : '\n' + fallos + ' fallo(s)');
process.exit(fallos === 0 ? 0 : 1);
