'use strict';
// Bucle de diagnóstico: ¿las estrellas de CAMPO desaparecen dentro de r_t de M62?
// #570. Uso: node scripts/harness_hueco_rt.js [sqm]
var RAIZ = require('path').join(__dirname, '..') + '/';
global.window = {}; global.document = undefined;
require(RAIZ + 'resources/js/bitacora-gaia-render.js');
require(RAIZ + 'resources/js/lf-globulares-datos.js');
require(RAIZ + 'simulador_ocular/resources/js/globulares-datos.js');
require(RAIZ + 'resources/js/bitacora-cumulos.js');
var R = window.BitacoraGaiaRender;
var e = window.BITACORA_GLOBULARES.filter(function (f) { return f[1] === 'M 62'; })[0];
var M62 = { id: e[0], ra: e[2], dec: e[3], rc: e[4], rh: e[5], c: e[6], muV0: e[7], Vt: e[8], dkpc: e[9],
  ebv: e[10], feh: e[11], elip: e[12], pa: null, trager: e[13] || null };
var D = 457, MAG = 61, sqm = +(process.argv[2] || 21.5), ARC = 80, SIZE = 720;
var cielo = { pupilaSalida: D / MAG, pupilaOjo: 7, sqm: sqm, transmision: 0.9, aumentos: MAG, perceptual: true };
var mlim = R.magLimite({ apertura: D, aumentos: MAG, transmision: 0.9, sqm: sqm, pupilaOjo: 7 });
// Campo uniforme: N(<m) ∝ 10^(0.3 m), hasta mlim. Determinista.
var campo = [], semilla = 1;
function rnd() { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; }
var cos0 = Math.cos(M62.dec * Math.PI / 180);
for (var i = 0; i < 40000; i++) {
  var m = (mlim + 2) + Math.log10(rnd()) / 0.3; if (m < 8) continue;
  var dx = (rnd() - 0.5) * ARC / 60, dy = (rnd() - 0.5) * ARC / 60;
  campo.push([M62.ra + dx / cos0, M62.dec + dy, m]);
}
var dif = new Float32Array(SIZE * SIZE);
var cum = R.pintarCumulo(dif, M62, { ra0: M62.ra, dec0: M62.dec, arcmin: ARC, size: SIZE, cielo: cielo,
  apertura: D, estrellas: campo, mlim: mlim });
var quedan = new Set(cum.estrellas);
var rt = M62.rc * Math.pow(10, M62.c);
console.log('mlim campo', mlim.toFixed(2), ' r_t', rt.toFixed(1) + "'");
var bordes = [0, 2, 4, 6, 8, 10, 11, 12, 14, 18, 25];
for (var b = 0; b < bordes.length - 1; b++) {
  var n = 0, s = 0;
  campo.forEach(function (x) {
    var r = Math.hypot((x[0] - M62.ra) * cos0, x[1] - M62.dec) * 60;
    if (r >= bordes[b] && r < bordes[b + 1] && x[2] > mlim) { n++; if (quedan.has(x)) s++; }
  });
  var rm = (bordes[b] + bordes[b + 1]) / 2 * 60;
  var mr = cum.tabla && rm < cum.poblacion.rtAs ? (function () {
    var t = cum.tabla, u = rm / t.paso, k = Math.floor(u); return t.mRes[k]; })() : Infinity;
  console.log(('r ' + bordes[b] + '-' + bordes[b + 1] + "'").padEnd(10), 'sobreviven', (s / n * 100).toFixed(1) + '%',
    ' n', n, ' mRes', isFinite(mr) ? mr.toFixed(2) : '∞');
}
