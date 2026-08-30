#!/usr/bin/env node
/* Invariancias de la ley H2c (FOT.H2C, activa por defecto) y su reversibilidad.

   La ley: Cmin *= (1 + θR(SBe)/θapp)², θapp = θeff·M, θeff = √(θint²+θseeing²).
   Medida en scripts/harness_ricco_seeing.js (Blackwell 1946); el A/B de render
   en scripts/harness_h2c_anclaje_render.js. Aquí solo se vigila que la
   implementación de producción conserve las propiedades que la validaron:

   0) REVERSIBILIDAD: con FOT.H2C = null (regresión histórica), θint se ignora y la
      cadena es la de siempre, bit a bit.
   A) A θint y fondo fijos, el factor DECRECE con los aumentos hacia el plateau.
   B) A igual tamaño APARENTE (θint·M), el factor es el mismo: 10′×100x ≡
      20′×50x ≡ 5′×200x. (La ley C_MAG antigua daba 1.00 vs 2.00 aquí.)
   C) Objeto grande (θint = 60′): factor ≈ 1 (plateau).
   D) θapp ≪ θR: pendiente log-log próxima a −2 (Ricco). La pendiente teórica
      local es −2/(1+θapp/θR): la sonda va BIEN DENTRO del área de Ricco
      (θapp ~ θR/20), no en θapp ≈ θR, donde vale −1 por definición.
   E) θeff tiene suelo en el seeing: encoger θint bajo el seeing apenas mueve
      el umbral (no se regala resolución).
   F) La ley no recibe PSF: ni la firma ni la configuración tienen por dónde. */
'use strict';
global.window = {};
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/bitacora-ps1.js');
var R = global.window.BitacoraGaiaRender;
var FOT = R.fot;

var fallos = 0;
function ok(cond, txt) {
  console.log((cond ? '  ok   ' : '  FALLA ') + txt);
  if (!cond) fallos++;
}
function casi(a, b, tol, txt) { ok(Math.abs(a - b) <= tol, txt + ' = ' + a); }

var OPT = { sqm: 21.2, transmision: 0.82, pupilaOjo: 7, pupilaSalida: 2.89 };
function cmin(aumentos, thInt) {
  var o = { sqm: OPT.sqm, transmision: OPT.transmision, pupilaOjo: OPT.pupilaOjo,
            pupilaSalida: OPT.pupilaSalida, aumentos: aumentos };
  return R.ctxFotometrico(o, thInt).Cmin;
}
// Factor de tamaño aislado: pupila FIJA (la de OPT), así dim no se mueve y el
// cociente contra aumentos=0 es solo el término de tamaño.
function factor(aumentos, thInt) { return cmin(aumentos, thInt) / cmin(0, null); }

console.log('— 0. Defecto: H2c ACTIVA; con H2C = null la vía histórica sigue bit a bit —');
ok(FOT.H2C === FOT.H2C_DEFECTO, 'FOT.H2C viene ACTIVA por defecto (H2C_DEFECTO)');
FOT.H2C = null;
[[66, 8], [158, 8], [158, 0.3], [400, 60]].forEach(function (t) {
  casi(cmin(t[0], t[1]), cmin(t[0], null), 0,
    'a ' + t[0] + 'x con θint=' + t[1] + '′ y H2C=null, Cmin idéntico al histórico (C_MAG)');
});

FOT.H2C = FOT.H2C_DEFECTO;
console.log('\n— A. El factor decrece con los aumentos hacia el plateau —');
var prev = Infinity;
[50, 100, 200, 400].forEach(function (M) {
  var fA = factor(M, 8);
  ok(fA < prev && fA > 1, '8′ a ' + M + 'x: factor ' + fA.toFixed(3) + ' (decrece, > 1)');
  prev = fA;
});

console.log('\n— B. Mismo tamaño aparente, mismo factor —');
var fB = [factor(100, 10), factor(50, 20), factor(200, 5)];
ok(Math.abs(fB[1] / fB[0] - 1) < 1e-3 && Math.abs(fB[2] / fB[0] - 1) < 1e-3,
  '10′×100x / 20′×50x / 5′×200x: ' + fB.map(function (v) { return v.toFixed(4); }).join(' / '));

console.log('\n— C. Objeto grande: plateau —');
var fC = factor(158, 60);
ok(fC > 1 && fC < 1.05, '60′ a 158x: factor ' + fC.toFixed(4) + ' ≈ 1');

console.log('\n— D. θapp ≪ θR: pendiente de Ricco —');
// A sqm 21.2 y esta pupila, SBe ~ 23.4 → θR ~ 100′. θapp de la sonda: 20–40′…
// no: con M=66 y θint 0.3′/0.15′ (9″, aún ≫ seeing 2″), θapp = 20′/10′ ≈ θR/8.
var f1 = factor(66, 0.3), f2 = factor(66, 0.15);
var thE1 = Math.sqrt(0.3 * 0.3 + Math.pow(2 / 60, 2)), thE2 = Math.sqrt(0.15 * 0.15 + Math.pow(2 / 60, 2));
var pend = Math.log(f1 / f2) / Math.log(thE1 / thE2);
ok(pend < -1.4 && pend > -2.01, 'pendiente log-log ' + pend.toFixed(2) + ' (en (−2, −1.4])');

console.log('\n— E. El seeing pone el suelo: sin resolución regalada —');
var dexE = Math.abs(Math.log(factor(158, 1 / 60) / factor(158, 0.1 / 60)) / Math.LN10);
ok(dexE < 0.1, 'θint 1″ → 0.1″ mueve el umbral solo ' + dexE.toFixed(3) + ' dex (< 0.1)');
ok(factor(158, 1e-6) <= factor(158, 0) || isFinite(factor(158, 1e-6)),
  'θint → 0 no diverge: θeff ≥ θseeing por construcción');

console.log('\n— F. Sin PSF en la ley —');
ok(R.ctxFotometrico.length === 2, 'ctxFotometrico(o, thetaIntArcmin): sin argumento de PSF');
ok(Object.keys(FOT.H2C_DEFECTO).sort().join(',') === 'SEEING_AS,THETA_R_A,THETA_R_B',
  'FOT.H2C solo lleva θR(SBe) y el seeing: ninguna clave de PSF ni de apertura');

console.log('\n— θint de producción: ps1ThetaIntArcmin —');
// Un disco puro: la analítica por componente ES la isofota exacta de la suma.
var gal1 = { reArcsec: 120, ba: 0.5, magV: 9, n: 1, bt: 0 };
var c1 = window.BitacoraPS1.ps1ComponentesSersic(gal1);
var esp = 2 * (function () { var r = 0; c1.forEach(function (c) {
  var I = Math.pow(10, -0.4 * 25);
  if (c.Ie > I) r = Math.max(r, c.re * Math.pow(1 + Math.log(c.Ie / I) / c.b, c.n));
}); return r; })() / 60 * Math.sqrt(0.5);
casi(window.BitacoraPS1.ps1ThetaIntArcmin(c1, 0.5), esp, 1e-12, 'disco puro: 2·r(μ25)/60·√(b/a)');
ok(window.BitacoraPS1.ps1ThetaIntArcmin([], 1) === 0, 'sin componentes, θint = 0 (la ley cae al bloque C_MAG)');
// Con FOT.H2C activa pero θint = 0 (o ausente), el bloque C_MAG sigue vivo.
casi(cmin(158, 0), cmin(158, null), 0, 'θint=0 con H2C activa: cae al bloque C_MAG');

FOT.H2C = null;
console.log('\n— 0b. Apagada a mano: la regresión histórica sigue disponible —');
casi(cmin(158, 8), cmin(158, null), 0, 'con H2C=null la vía C_MAG sigue intacta');
FOT.H2C = FOT.H2C_DEFECTO;

console.log(fallos ? '\n' + fallos + ' FALLOS' : '\nTodo ok');
process.exit(fallos ? 1 : 0);
