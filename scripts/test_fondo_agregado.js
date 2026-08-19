#!/usr/bin/env node
/* Test del FONDO AGREGADO de campos densos (ADR 0014 fase 2).

   En un campo denso el proxy trunca a las 40 000 más brillantes y manda los
   momentos de la banda truncada en la clave `fondo` ({corte, n, flujo, m2,
   rad}). El cliente convierte ese flujo en un VELO de brillo superficial que
   entra en la física como cielo extra (veloSB en el objeto cielo): SBe, Cmin,
   nivel de fondo y magnitud límite lo heredan sin ley nueva.

   Números reales medidos (M7, 2026-08-19, TAP de CDS):
     banda (15.175478, 19.5]: n=1 702 342, flujo=0.12997900447180316 (G=0=1)
     círculo rad 0,89° → SB media ≈ 21,0 mag/arcsec² (cielo oscuro ≈ 21,9)

   Sin dependencias:  node scripts/test_fondo_agregado.js  */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function ok(cond, msg) {
  console.log('  ' + (cond ? 'ok  ' : 'FALLO') + '  ' + msg);
  if (!cond) fallos++;
}

var FONDO_M7 = { corte: 15.175478, n: 1702342, flujo: 0.12997900447180316, m2: 3.2324682316893466e-8, rad: 0.89 };

console.log('veloSB: del flujo agregado al brillo superficial del velo:');
ok(R.veloSB(null) == null, 'sin fondo → null (población truncada vacía)');
ok(R.veloSB({ flujo: 0, rad: 0.89 }) == null, 'flujo nulo → null');
ok(R.veloSB({ flujo: 0.13 }) == null, 'sin radio → null (no hay área)');
var sbM7 = R.veloSB(FONDO_M7);
ok(Math.abs(sbM7 - 21.0) < 0.05, 'M7 medido → SB ≈ 21,0 mag/arcsec² (' + sbM7.toFixed(2) + ')');

console.log('conservación de flujo: el velo entra como cielo extra, exacto:');
// SB compuesta cielo+velo: los flujos se SUMAN (nada se pierde ni se inventa).
var sqm = 21.9;
var fCielo = Math.pow(10, -0.4 * sqm);
var areaArcsec2 = Math.PI * Math.pow(FONDO_M7.rad * 3600, 2);
var fVelo = FONDO_M7.flujo / areaArcsec2;
var sqmEf = R.sumaSB(sqm, sbM7);
ok(Math.abs(Math.pow(10, -0.4 * sqmEf) - (fCielo + fVelo)) < 1e-15,
  'flujo(sumaSB) = flujo(cielo) + flujo(velo) exacto (' + sqmEf.toFixed(2) + ' mag/arcsec²)');
ok(R.sumaSB(sqm, null) === sqm, 'sin velo → sqm intacto');

console.log('la física existente hereda el velo (sin ley nueva):');
var base = { pupilaSalida: 5, pupilaOjo: 7, sqm: 21.9, transmision: 0.9, aumentos: 66 };
var conVelo = Object.assign({}, base, { veloSB: sbM7 });
var nSin = R.nivelFondo(base), nCon = R.nivelFondo(conVelo);
ok(nCon > nSin, 'fondo de pantalla más claro con velo (' + nSin + ' → ' + nCon + ')');
var eq = { apertura: 200, aumentos: 66, transmision: 0.9, sqm: 21.9, pupilaOjo: 7 };
var mSin = R.magLimite(eq), mCon = R.magLimite(Object.assign({}, eq, { veloSB: sbM7 }));
ok(mCon < mSin, 'magnitud límite baja con el fondo más brillante (' + mSin.toFixed(2) + ' → ' + mCon.toFixed(2) + ')');
ok(R.magLimite(Object.assign({}, eq, { veloSB: null })) === mSin, 'veloSB null → magLimite intacta');
var cSin = R.ctxFotometrico(base), cCon = R.ctxFotometrico(conVelo);
ok(cCon.SBe < cSin.SBe, 'SBe más brillante con velo');
// Cmin es umbral RELATIVO (Weber): con más luminancia de fondo baja, aunque
// el umbral absoluto (Cmin·Fcielo) sube. Misma ley que ya rige con el sqm.
ok(cCon.Cmin < cSin.Cmin, 'umbral de contraste relativo baja (Weber)');
ok(cCon.Cmin * cCon.Fcielo > cSin.Cmin * cSin.Fcielo, 'umbral ABSOLUTO de flujo sube con el velo');

console.log('consultar propaga el fondo del proxy a las estrellas:');
var RESPUESTA = { metadata: [], data: [[10, 20, 12.5, 0.5], [11, 21, null, 0.1]], fondo: FONDO_M7 };
global.fetch = function () {
  return Promise.resolve({ ok: true, json: function () { return Promise.resolve(RESPUESTA); } });
};
global.AbortController = global.AbortController || function () { this.signal = null; this.abort = function () {}; };
R.consultar(100.001, 10.001, 60, 18).then(function (estrellas) {
  ok(estrellas.length === 1, 'filtra filas sin Gmag como siempre');
  ok(estrellas.fondo === FONDO_M7, 'el array lleva el fondo colgado');
  return R.consultar(200.001, 20.001, 60, 18).then(function (e2) {
    // Segunda respuesta sin fondo: población truncada vacía.
    delete RESPUESTA.fondo;
    return R.consultar(300.001, 30.001, 60, 18).then(function (e3) {
      ok(e3.fondo == null, 'respuesta sin clave fondo → fondo null (no denso)');
      fin();
    });
  });
}).catch(function (e) { ok(false, 'consultar falló: ' + e); fin(); });

function fin() {
  if (fallos) { console.log('\n' + fallos + ' FALLO(S)'); process.exit(1); }
  console.log('\nTodo verde.');
}
