/* Spike #624 (ADR 0039, «La cola de c en el borde del corte»): el exceso de
   ≤1 r_h, V 18,07-19,07, separado en corte G → V, sub-bin y rejilla r × V.
   Solo mide; no toca producción. node scripts/spike_624_borde.js */
'use strict';
global.window = {}; global.document = undefined;
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/lf-globulares-datos.js');
require('../simulador_ocular/resources/js/globulares-datos.js');
require('../resources/js/bitacora-cumulos.js');
var fs = require('fs'), path = require('path');
var R = window.BitacoraGaiaRender, C = window.BitacoraCumulos;
var e = window.BITACORA_GLOBULARES.filter(function (f) { return f[0] === 'NGC 6205'; })[0];
var M13 = { id: e[0], ra: e[2], dec: e[3], rc: e[4], rh: e[5], c: e[6], muV0: e[7], Vt: e[8], dkpc: e[9], ebv: e[10], feh: e[11], elip: e[12], pa: null, trager: e[13] || null };
var V = path.join(__dirname, '../simulador_ocular/docs/validacion/');
var CAMPO = new Set(fs.readFileSync(V + 'm13_vb21_campo.csv', 'utf8').trim().split('\n').slice(1).map(function (l) { var c = l.split(','); return c[0] + ',' + c[1]; }));
var RUWE = new Set(fs.readFileSync(V + 'm13_gaia_dr3_mezcla.csv', 'utf8').trim().split('\n').slice(1).filter(function (l) { return l.split(',')[2] !== ''; }).map(function (l) { var c = l.split(','); return c[0] + ',' + c[1]; }));
var gaia = fs.readFileSync(V + 'm13_gaia_dr3.csv', 'utf8').trim().split('\n').slice(1).map(function (l) { var c = l.split(','); return [+c[0], +c[1], +c[2], c[3] === '' ? null : +c[3]]; });
var cielo = { pupilaSalida: 467 / 173, pupilaOjo: 7, sqm: 21, transmision: 0.9, aumentos: 173, perceptual: true };
var res = R.pintarCumulo(new Float32Array(720 * 720), M13, { ra0: M13.ra, dec0: M13.dec, arcmin: 0.47 * 60, size: 720, cielo: cielo, apertura: 467, estrellas: gaia });
var pob = res.poblacion, mAp = pob.magnitudes, num = pob.estrellasPorBin, paso = mAp[1] - mAp[0];
var rhAs = M13.rh * 60, cos0 = Math.cos(M13.dec * Math.PI / 180);
var BINS = []; for (var k = 0; k < mAp.length; k++) if (mAp[k] > 18.07 && mAp[k] < 19.07) BINS.push(k);
var LO = 18.068, HI = 19.068;
console.log('paso', paso, 'bins', BINS.map(function(k){return mAp[k].toFixed(3)+':'+num[k].toFixed(0);}).join(' '));
// filas observadas en ≤1 r_h, V del bin
var filas = [];
gaia.forEach(function (g) {
  if (CAMPO.has(g[0] + ',' + g[1]) || !RUWE.has(g[0] + ',' + g[1]) || g[3] == null) return;
  var x = (((g[0] - M13.ra + 540) % 360) - 180) * cos0 * 3600, y = (g[1] - M13.dec) * 3600, r = pob.radioPropio(x, y);
  var v = R.magVGaia(g);
  if (r <= rhAs && v > LO && v <= HI) filas.push({ r: r, v: v, G: g[2], bprp: g[3] });
});
console.log('N obs', filas.length);
var hv = {}, hg = {}; filas.forEach(function (f) { var b = (Math.floor(f.v * 10) / 10).toFixed(1); hv[b] = (hv[b] || 0) + 1; var bg = (Math.floor(f.G * 10) / 10).toFixed(1); hg[bg] = (hg[bg] || 0) + 1; });
console.log('hist V', JSON.stringify(hv)); console.log('hist G', JSON.stringify(hg));
var gv = filas.map(function (f) { return f.G - f.v; }).sort(function (a, b) { return a - b; });
console.log('G−V filas: mediana', gv[gv.length >> 1].toFixed(3), 'p10', gv[Math.floor(.1 * gv.length)].toFixed(3), 'p90', gv[Math.floor(.9 * gv.length)].toFixed(3));
var bp = filas.map(function (f) { return f.bprp; }).sort(function (a, b) { return a - b; });
console.log('BP−RP filas: mediana', bp[bp.length >> 1], ' modelo bin G−V', R.gMenosV(0.75).toFixed(3), R.gMenosV(1.0).toFixed(3));
var rr = filas.map(function (f) { return f.r / rhAs; }).sort(function (a, b) { return a - b; });
console.log('r/rh filas: p10', rr[Math.floor(.1 * rr.length)].toFixed(2), 'mediana', rr[rr.length >> 1].toFixed(2));
// modelo: integral radial en ≤1 con distintas variantes de c
function integra(cfun) {
  var N = 400, h = rhAs / N, s = 0;
  for (var i = 0; i <= N; i++) { var r = i * h, w = (i === 0 || i === N) ? .5 : 1; s += w * pob.sigma(r) * 2 * Math.PI * r * h * cfun(r); }
  return s;
}
var Gc = 18.5, NS = 200;
function porBins(cf, sub) { return function (r) { var t = 0; BINS.forEach(function (kb) { if (!sub) { t += num[kb] * cf(mAp[kb], r); return; } var s = 0; for (var j = 0; j < NS; j++) { var m = mAp[kb] - paso / 2 + (j + .5) * paso / NS; s += cf(m, r); } t += num[kb] * s / NS; }); return t; }; }
var conC = function (m, r) { return pob.completitud(m, r, Gc); }, sinC = function (m, r) { return pob.completitud(m, r); };
var centro = integra(porBins(conC)), subbin = integra(porBins(conC, 1)), sinCorteC = integra(porBins(sinC)), sinCorteSub = integra(porBins(sinC, 1));
var total = integra(porBins(function () { return 1; }));
// (c) num: c=1 sin corte, solo hasta V del corte via G real? cat/∫Σ·num = fracción observada

console.log('modelo ∫Σ·num·c  centro+corte', centro.toFixed(1), ' subbin+corte', subbin.toFixed(1), ' centro sin corte', sinCorteC.toFixed(1), ' subbin sin corte', sinCorteSub.toFixed(1), ' ∫Σ·num', total.toFixed(1));
// m50 efectivo por radio
[0.1, 0.25, 0.5, 0.75, 1].forEach(function (f) { var r = f * rhAs, om = Math.PI * 0.09; console.log('r/rh', f, 'mCrowd', pob.mCrowd(r, om, 75).toFixed(2), 'c(18.1)', pob.completitud(18.1, r).toExponential(2), 'c(18.57)', pob.completitud(18.57, r).toExponential(2)); });
// rejilla r × V: obs / modelo (sub-bin + corte)
function integraR(r0, r1, cfun) { var N = 200, h = (r1 - r0) / N, s = 0; for (var i = 0; i <= N; i++) { var r = r0 + i * h, w = (i === 0 || i === N) ? .5 : 1; s += w * pob.sigma(r) * 2 * Math.PI * r * h * cfun(r); } return s; }
function modeloRV(r0, r1, v0, v1, cf) {
  return integraR(r0, r1, function (r) { var t = 0; for (var k = 0; k < mAp.length; k++) { for (var j = 0; j < 20; j++) { var m = mAp[k] - paso / 2 + (j + .5) * paso / 20; if (m > v0 && m <= v1) t += num[k] / 20 * cf(m, r); } } return t; });
}
var RS = [0.5, 0.7, 0.85, 1.0], VS = [18.068, 18.3, 18.5, 19.068];
console.log('\nr/rh × V  obs  mod  obs/mod  c medio');
for (var a = 0; a < 3; a++) for (var b = 0; b < 3; b++) {
  var o = filas.filter(function (f) { return f.r / rhAs > RS[a] && f.r / rhAs <= RS[a + 1] && f.v > VS[b] && f.v <= VS[b + 1]; }).length;
  var md = modeloRV(RS[a] * rhAs, RS[a + 1] * rhAs, VS[b], VS[b + 1], conC), tot = modeloRV(RS[a] * rhAs, RS[a + 1] * rhAs, VS[b], VS[b + 1], function () { return 1; });
  console.log(RS[a] + '-' + RS[a + 1], VS[b] + '-' + VS[b + 1], o, md.toFixed(1), (o / md).toFixed(2), (md / tot).toExponential(2));
}
