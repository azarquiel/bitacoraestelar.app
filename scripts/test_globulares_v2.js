#!/usr/bin/env node
/* Experimento V2-A (ver prompt_tareas.md): King(r)^gammaHalo vs King(r) puro.

   Hipótesis: Fcentral se calibra contra areaKing, que integra el perfil de
   King SIN exponente. Al pintar King(r)^gamma con gamma>1, la integral
   efectiva deja de ser areaKing, así que el flujo total mostrado en pantalla
   deja de coincidir con Ftotal-Fresuelto, y ese error crece con gamma (y por
   tanto con los aumentos, ver gammaHalo). V2-A (CFG.globular.experimentoHaloV2
   = 'A') fuerza gamma=1 y debe conservar el flujo con error ~0 a cualquier
   aumento.

   Sin dependencias: node scripts/test_globulares_v2.js */
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
var AUMENTOS = [50, 100, 150, 200, 300, 450];

/* Integral numérica (trapecios) de Fcentral·King(r)^gamma·2πr dr, 0..rt: el
   mismo método de contraste que ya usa test_globulares.js para areaKing,
   aplicado aquí al perfil YA elevado a gamma. */
function integralHalo(halo) {
  var N = 20000, h = halo.rtAs / N, suma = 0;
  for (var j = 0; j < N; j++) {
    var r0 = j * h, r1 = (j + 1) * h;
    var f0 = R.fobjGlobular(halo, r0) * r0, f1 = R.fobjGlobular(halo, r1) * r1;
    suma += (f0 + f1) / 2 * h;
  }
  return 2 * Math.PI * suma;
}

console.log('V2-A: conservación de flujo del halo pintado, King(r) vs King(r)^gamma, por aumentos:');

var halo0 = R.haloGlobular(M13, [], 250.42183, 36.45986, 1);
var rcAsM13 = M13.rc * 60, rtAsM13 = M13.rt * 60, k13 = rtAsM13 / rcAsM13;
var areaAs2 = R.areaKing(k13) * rcAsM13 * rcAsM13;
var Ftotal = Math.pow(10, -0.4 * M13.muV0) * areaAs2;
var Fneto = halo0.Fcentral * areaAs2;   // = Ftotal (sin estrellas resueltas en esta prueba)

console.log('\n  -- BASE (producción, King^gammaHalo): el error crece con los aumentos --');
R.config.globular.experimentoHaloV2 = null;
var erroresBase = [];
AUMENTOS.forEach(function (aum) {
  var halo = R.haloGlobular(M13, [], 250.42183, 36.45986, aum);
  var integral = integralHalo(halo);
  var errRel = Math.abs(integral - Fneto) / Fneto;
  erroresBase.push(errRel);
  console.log('  ' + aum + 'x: gamma=' + halo.gamma.toFixed(3) + '  integral/Ftotal=' +
    (integral / Fneto).toFixed(4) + '  error=' + (errRel * 100).toFixed(2) + '%');
});
ok(erroresBase[erroresBase.length - 1] > erroresBase[0],
  'BASE: el error de conservación crece al subir los aumentos (confirma la hipótesis)');
ok(erroresBase[erroresBase.length - 1] > 0.05,
  'BASE: a 450x el error ya no es despreciable (>5%)');

console.log('\n  -- V2-A (experimentoHaloV2="A", King puro): el flujo se conserva a cualquier aumento --');
R.config.globular.experimentoHaloV2 = 'A';
AUMENTOS.forEach(function (aum) {
  var halo = R.haloGlobular(M13, [], 250.42183, 36.45986, aum);
  var integral = integralHalo(halo);
  var errRel = Math.abs(integral - Fneto) / Fneto;
  console.log('  ' + aum + 'x: integral/Ftotal=' + (integral / Fneto).toFixed(6) +
    '  error=' + (errRel * 100).toFixed(4) + '%');
  ok(errRel < 1e-3, aum + 'x: V2-A conserva el flujo (error<0,1%)');
});
R.config.globular.experimentoHaloV2 = null;   // deja el módulo como lo encontró

console.log('\nV2-A: pintarHaloGlobular (grid discreto) también conserva, no solo el cerrado analítico:');
[100, 300].forEach(function (aum) {
  R.config.globular.experimentoHaloV2 = 'A';
  var SIZE = 400, arcmin = 60;
  var halo = R.haloGlobular(M13, [], 250.42183, 36.45986, aum);
  var difuso = new Float32Array(SIZE * SIZE);
  R.pintarHaloGlobular(difuso, halo, { arcmin: arcmin, size: SIZE });
  var pxPorAs = (SIZE / (arcmin / 60)) / 3600;
  var pxAreaAs2 = 1 / (pxPorAs * pxPorAs);
  var sumaPx = 0;
  for (var p = 0; p < difuso.length; p++) sumaPx += difuso[p];
  var integralPintada = sumaPx * pxAreaAs2;
  var errRel = Math.abs(integralPintada - Fneto) / Fneto;
  console.log('  ' + aum + 'x: integral pintada/Ftotal=' + (integralPintada / Fneto).toFixed(4) +
    '  error=' + (errRel * 100).toFixed(2) + '%');
  ok(errRel < 0.02, aum + 'x: grid discreto (400px) conserva el flujo dentro de la resolución del muestreo (<2%)');
  R.config.globular.experimentoHaloV2 = null;
});

console.log(fallos === 0 ? '\nTodo OK' : '\n' + fallos + ' fallo(s)');
process.exit(fallos === 0 ? 0 : 1);
