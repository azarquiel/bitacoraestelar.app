#!/usr/bin/env node
/* Conservación de flujo del grano — renormalización por anillo (issue #98,
   ADR 0015). El recorte a cero de `pintarCumulo` («el campo no puede quitar
   luz») descarta solo la cola negativa del campo lognormal y regala flujo:
   medido en exp_sgrano con s_grano forzado a 0,25/0,50, 50-70 % del campo
   recortado y +2-7 % de luz que crece con el aumento. La renormalización por
   anillo (ver pintarCumulo) lo descuenta; este test comprueba que flujo con
   grano forzado = flujo sin grano, dentro de la tolerancia ±1 % de ADR 0003
   Fase 2, y que el mecanismo no es vacuo: apagado, el defecto reaparece.

   No depende de la ley de umbral del grano (ADR 0015, no decidida): fuerza
   P(ver) = 1 con el hook `FOT.GRANO_FORZAR`, que entra por el mismo punto que
   producción (ADR 0008), no por una copia de la ley.

     node scripts/test_grano_conservacion.js */
'use strict';

global.window = global.window || {};
global.document = undefined;
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/lf-globulares-datos.js');
require('../simulador_ocular/resources/js/globulares-datos.js');
require('../resources/js/bitacora-cumulos.js');
var R = global.window.BitacoraGaiaRender;
var H = require('./harness_halo_v7.js');

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) console.log('  ok   ' + etiqueta);
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

var M13 = H.cumulo('NGC 6205');
var D = 200, SQM = 21.0, SIZE = 640, ARCMIN = 16;   // equipo de exp_sgrano

function pintar(mag, renorm) {
  var guardado = R.fot.RENORM_ANILLO_GRANO;
  R.fot.RENORM_ANILLO_GRANO = renorm;
  try {
    var difuso = new Float32Array(SIZE * SIZE);
    var cielo = { pupilaSalida: D / mag, pupilaOjo: 7, sqm: SQM,
      transmision: 0.9, aumentos: mag, perceptual: true };
    return R.pintarCumulo(difuso, M13, {
      ra0: M13.ra, dec0: M13.dec, arcmin: ARCMIN, size: SIZE, cielo: cielo,
      apertura: D, estrellas: [], realization: 0
    });
  } finally { R.fot.RENORM_ANILLO_GRANO = guardado; }
}

/* Fuerza P(ver) del grano a 1 SOLO durante `fn`, por el hook que expone
   producción (ver pintarCumulo/visibilidadGrano) — no una ley reimplementada. */
function conGranoForzado(fn) {
  var guardado = R.fot.GRANO_FORZAR;
  R.fot.GRANO_FORZAR = function () { return 1; };
  try { return fn(); } finally { R.fot.GRANO_FORZAR = guardado; }
}

console.log('\nConservación de flujo del grano (renormalización por anillo):');
[61, 120, 173, 250].forEach(function (mag) {
  var conRenorm = conGranoForzado(function () { return pintar(mag, true); });
  var sinRenorm = conGranoForzado(function () { return pintar(mag, false); });

  var dConRenorm = Math.abs(conRenorm.FpintadoGrano - conRenorm.Fsingrano) / conRenorm.Fsingrano;
  ok(dConRenorm <= 0.01,
    mag + '×: flujo con grano forzado = flujo sin grano, renormalizado (' +
    (100 * dConRenorm).toFixed(2) + ' %)');

  var dSinRenorm = Math.abs(sinRenorm.FpintadoGrano - sinRenorm.Fsingrano) / sinRenorm.Fsingrano;
  ok(dSinRenorm > 0.01,
    mag + '×: ANTI-VACUIDAD, sin renormalizar el defecto reaparece (' +
    (100 * dSinRenorm).toFixed(2) + ' %, crece con el aumento)');
});

console.log('\nLa renormalización escala por anillo, no deforma la textura dentro de él:');
(function () {
  var mag = 173;
  var SIZE2 = SIZE;
  var campoOn = new Float32Array(SIZE2 * SIZE2), campoOff = new Float32Array(SIZE2 * SIZE2);
  var tabla = conGranoForzado(function () {
    var guardado = R.fot.RENORM_ANILLO_GRANO;
    var cielo = { pupilaSalida: D / mag, pupilaOjo: 7, sqm: SQM,
      transmision: 0.9, aumentos: mag, perceptual: true };
    R.fot.RENORM_ANILLO_GRANO = true;
    var resOn = R.pintarCumulo(new Float32Array(SIZE2 * SIZE2), M13, {
      ra0: M13.ra, dec0: M13.dec, arcmin: ARCMIN, size: SIZE2, cielo: cielo,
      apertura: D, estrellas: [], realization: 0, campoGranoI: campoOn
    });
    R.fot.RENORM_ANILLO_GRANO = false;
    R.pintarCumulo(new Float32Array(SIZE2 * SIZE2), M13, {
      ra0: M13.ra, dec0: M13.dec, arcmin: ARCMIN, size: SIZE2, cielo: cielo,
      apertura: D, estrellas: [], realization: 0, campoGranoI: campoOff
    });
    R.fot.RENORM_ANILLO_GRANO = guardado;
    return resOn.tabla;
  });
  var pob = window.BitacoraCumulos.poblacionCacheada(M13, 0);
  var asPorPx = ARCMIN * 60 / SIZE2, cen = SIZE2 / 2;
  // Mismo anillo EXACTO que usa la renormalización (ver pintarCumulo): el
  // índice, no una ventana en arcsec, que cruzaría varios anillos y mediría
  // el gradiente de <I>(r), no el factor.
  var rBuscado = M13.rh * 60;
  var kBuscado = Math.min(tabla.r.length - 1, Math.floor(rBuscado / tabla.paso));
  var idxs = [];
  for (var y = 0; y < SIZE2 && idxs.length < 40; y++) {
    for (var x = 0; x < SIZE2 && idxs.length < 40; x++) {
      var idx = y * SIZE2 + x;
      if (!(campoOn[idx] > 0) || !(campoOff[idx] > 0)) continue;
      var rAs = pob.radioPropio((x - cen) * asPorPx, (y - cen) * asPorPx);
      if (Math.min(tabla.r.length - 1, Math.floor(rAs / tabla.paso)) === kBuscado) idxs.push(idx);
    }
  }
  ok(idxs.length >= 2, 'hay píxeles pintados con y sin renormalizar en el mismo anillo (' + idxs.length + ')');
  if (idxs.length >= 2) {
    var r0 = campoOff[idxs[0]] > 0 ? campoOn[idxs[0]] / campoOff[idxs[0]] : NaN;
    var peor = 0;
    for (var i = 1; i < idxs.length; i++) {
      var r = campoOn[idxs[i]] / campoOff[idxs[i]];
      peor = Math.max(peor, Math.abs(r - r0) / r0);
    }
    ok(peor < 1e-5,   // float32 en campoGranoI, no doble: ~1e-7 por valor, se acumula en el cociente
      'el factor de renormalización es el MISMO para todos los píxeles del anillo (peor ' +
      peor.toExponential(1) + ')');
    ok(Math.abs(r0 - 1) > 1e-6,
      'y ese factor no es 1: la renormalización sí actúa (×' + r0.toFixed(3) + ')');
  }
})();

console.log('\nCon S2 real (sin forzar) la renormalización es inerte, producción sigue apagada:');
[61, 173].forEach(function (mag) {
  var res = pintar(mag, true);
  var d = res.Fsingrano > 0 ? Math.abs(res.FpintadoGrano - res.Fsingrano) / res.Fsingrano : 0;
  ok(d < 1e-9, mag + '×: sin P(ver) forzado, flujo pintado = flujo sin grano exacto (' +
    d.toExponential(1) + ')');
});

console.log(fallos === 0 ? '\nConservación de flujo del grano verde' : '\n' + fallos + ' fallo(s)');
process.exit(fallos === 0 ? 0 : 1);
