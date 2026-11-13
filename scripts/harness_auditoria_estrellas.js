'use strict';
/* Arnés de la auditoría 20261112_auditoria_pintado_estrellas.md.
   node scripts/harness_auditoria_estrellas.js tabla   → flujo, pico, FWHM y fondo por ocular
   node scripts/harness_auditoria_estrellas.js dil     → barrido del salto de factorDilucion
   Limitación (ADR 0008): copia a mano los stops del sprite de dibujarEstrellaColor. */
global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;
var P = 7, sqm = 21, afov = 68, SIZE = 720, T = 0.8;
function perfil(u, blur) {
  var dC = 1 / Math.pow(1 + blur, 2);
  var st = [[0, 1], [dC * 0.55, 0.9], [dC, 0.6], [dC + (1 - dC) * 0.35, 0.18], [1, 0]];
  if (u >= 1) return 0;
  for (var k = 1; k < st.length; k++) if (u <= st[k][0]) { var a = st[k-1], b = st[k]; return a[1] + (b[1]-a[1])*(u-a[0])/(b[0]-a[0]); }
  return 0;
}
function uMedio(blur) { var lo = 0, hi = 1; for (var i = 0; i < 60; i++) { var m = (lo+hi)/2; if (perfil(m, blur) > 0.5) lo = m; else hi = m; } return lo; }
function caso(D, f, fe, g) {
  var M = f / fe, d = D / M, arcmin = afov * 60 / M;
  var eq = { apertura: D, aumentos: M, pupilaSalida: d, pupilaOjo: P, sqm: sqm, transmision: T, afov: afov };
  var mlim = R.magLimite(eq), cf = R.ctxFotometrico(eq);
  var blur = R.blurEstrella(g, D);
  var o = { afov: afov, apertura: D, arcmin: arcmin, size: SIZE, g: g, blur: blur, mlim: mlim };
  var Rt = R.radioEstrella(o), su = R.sueloEstrella(o), dil = R.factorDilucion(su, Rt);
  var a = R.alfaEstrella(g, mlim, Rt * arcmin * 60 / SIZE, dil);
  var n = Math.ceil(Rt) + 2, sumV = 0, sumOut = 0, sumFout = 0, pico = 0, picoOut = 0;
  for (var y = -n; y <= n; y++) for (var x = -n; x <= n; x++) {
    var acc = 0;
    for (var sy = 0; sy < 4; sy++) for (var sx = 0; sx < 4; sx++)
      acc += perfil(Math.hypot(x + (sx+0.5)/4 - 0.5, y + (sy+0.5)/4 - 0.5) / Rt, blur);
    var v = Math.min(255, 255 * a * acc / 16);
    var Fs = R.flujoDeValor(v, cf.Fref, cf.rango);
    var dOut = R.valorDeFlujo(Fs, cf.FcieloPintado, cf.rango);            // incremento final sobre nivelFondo
    var out = Math.min(255, cf.nivelFondo + dOut);
    sumV += v; sumOut += out - cf.nivelFondo; if (v > pico) pico = v; if (out - cf.nivelFondo > picoOut) picoOut = out - cf.nivelFondo;
    sumFout += R.flujoDeValor(out - cf.nivelFondo, cf.FcieloPintado, cf.rango);
  }
  var fwhmPx = 2 * uMedio(blur) * Rt, fwhmApArcmin = fwhmPx * afov * 60 / SIZE;
  return { M: M, d: d, mlim: mlim, SBe: cf.SBe, fondo: cf.nivelFondo, FcP: cf.FcieloPintado / cf.Fcielo,
    Rt: Rt, su: su, dil: dil, a: a, aAur: R.alfaAureola(g, D), sumV: sumV, pico: pico, picoOut: picoOut, sumOut: sumOut,
    Fout: sumFout * cf.FcieloPintado / cf.Fref, fwhmPx: fwhmPx, fwhmAp: fwhmApArcmin,
    fwhmFis: M * Math.sqrt(Math.pow(1.03*0.55e-3/D*206265,2) + 4) / 60 };
}
function t(x, n) { return (typeof x === 'number') ? x.toFixed(n == null ? 2 : n) : x; }
var modo = process.argv[2];
if (modo === 'tabla') {
  var D = 200, f = 1200, gs = [10, 11.5, 12.5];
  console.log('g fe M d mlim SBe fondoDN FcP/Fc R suelo dil alfa aAur picoV picoOut ΣV ΣOut Flin_out fwhmPx fwhmAp′ fwhmFis′');
  gs.forEach(function (g) { [55,40,32,25,17,12,9,6,4,2.5].forEach(function (fe) {
    var r = caso(D, f, fe, g);
    if (g > r.mlim) { console.log(g, fe, 'invisible mlim', t(r.mlim)); return; }
    console.log([g, fe, t(r.M,1), t(r.d), t(r.mlim), t(r.SBe), t(r.fondo,1), t(r.FcP,2), t(r.Rt), t(r.su), t(r.dil,3), t(r.a,3), t(r.aAur,4), t(r.pico,1), t(r.picoOut,1), t(r.sumV,0), t(r.sumOut,0), t(r.Fout,1), t(r.fwhmPx), t(r.fwhmAp,1), t(r.fwhmFis,2)].join(' '));
  }); });
} else {
  // dilución: D=70 f=700, barrido fino de M alrededor del umbral
  console.log('D=70 f=700 g=10: fe M R suelo R/suelo dil alfa ΣV');
  for (var fe = 3.0; fe >= 1.2; fe -= 0.05) {
    var r = caso(70, 700, fe, 10);
    console.log([t(fe), t(r.M,0), t(r.Rt), t(r.su), t(r.Rt/r.su,3), t(r.dil,3), t(r.a,3), t(r.sumV,0)].join(' '));
  }
}
