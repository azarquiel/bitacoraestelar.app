#!/usr/bin/env node
/* Diagnóstico: ¿por qué el render CON halo dibuja muchas menos estrellas que el
   observador ve en M13?

   Señal: estrellas DIBUJADAS por anillo radial.
     · sin halo  = las de Gaia con G <= mag límite puntual del equipo (lo que
                   pintaba el render antes de la Capa 2-4, y lo que pinta hoy
                   cualquier campo que no sea un globular del catálogo).
     · con halo  = las que devuelve pintarCumulo (clasificadas por m_res) y que
                   además sobreviven al corte mlim de capaEstrellas — el mismo
                   corte que aplica el simulador sobre la m_eff atenuada.

   Reproduce las lecturas de la captura: 173x, pupila de salida 2,7 mm, campo
   real 0,47°, lienzo 720 px (PROC del simulador).

   Fixture: docs/halo_v7/m13_gaia_dr3.csv (cono de 0,24° a G<18,5, TAP de ESA).

   node scripts/harness_halo_estrellas.js [--sqm N] [--D mm] [--mag N] [--size px] */
'use strict';

global.window = {};
global.document = undefined;
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/lf-globulares-datos.js');
require('../simulador_ocular/resources/js/globulares-datos.js');
require('../resources/js/bitacora-cumulos.js');
var fs = require('fs'), path = require('path');
var R = global.window.BitacoraGaiaRender;
var C = global.window.BitacoraCumulos;

function arg(n, def) { var i = process.argv.indexOf('--' + n); return i > 0 ? +process.argv[i + 1] : def; }

var SQM = arg('sqm', 21), D = arg('D', 467), MAG = arg('mag', 173), PROC = arg('size', 720);
var ARCMIN = 0.47 * 60;

var e = global.window.BITACORA_GLOBULARES.filter(function (f) { return f[0] === 'NGC 6205'; })[0];
var M13 = { id: e[0], ra: e[2], dec: e[3], rc: e[4], rh: e[5], c: e[6], muV0: e[7],
            Vt: e[8], dkpc: e[9], ebv: e[10], feh: e[11], elip: e[12], pa: null };
var rhAs = M13.rh * 60;

var gaia = fs.readFileSync(path.join(__dirname, '../docs/halo_v7/m13_gaia_dr3.csv'), 'utf8')
  .trim().split('\n').slice(1).map(function (l) {
    var c = l.split(',');
    return [+c[0], +c[1], +c[2], c[3] === '' ? null : +c[3]];
  });

var cielo = { pupilaSalida: D / MAG, pupilaOjo: 7, sqm: SQM, transmision: 0.9,
              aumentos: MAG, perceptual: true };
var mlim = R.magLimite({ apertura: D, aumentos: MAG, transmision: 0.9, sqm: SQM, pupilaOjo: 7 });

var difuso = new Float32Array(PROC * PROC);
var res = R.pintarCumulo(difuso, M13, {
  ra0: M13.ra, dec0: M13.dec, arcmin: ARCMIN, size: PROC,
  cielo: cielo, apertura: D, estrellas: gaia.filter(function (s) { return s[2] <= mlim; })
});
var pob = res.poblacion, tabla = res.tabla;

function mRes(rAs) {
  var ult = tabla.r.length - 1;
  if (!(rAs >= 0) || rAs >= tabla.r[ult]) return Infinity;
  var u = rAs / tabla.paso, i = Math.floor(u), t = u - i;
  var a = tabla.mRes[i], b = tabla.mRes[i + 1];
  if (!isFinite(a)) return b;
  if (!isFinite(b)) return a;
  return a * (1 - t) + b * t;
}

var cos0 = Math.cos(M13.dec * Math.PI / 180);
function radio(s) {
  return pob.radioPropio((((s[0] - M13.ra + 540) % 360) - 180) * cos0 * 3600, (s[1] - M13.dec) * 3600);
}

var ANILLOS = [0.25, 0.5, 1, 2, 4, 8];
function porAnillo(lista, filtroMlim) {
  var n = ANILLOS.map(function () { return 0; });
  for (var i = 0; i < lista.length; i++) {
    if (filtroMlim && !(lista[i][2] <= mlim)) continue;
    var r = radio(lista[i]) / rhAs;
    for (var k = 0; k < ANILLOS.length; k++) if (r <= ANILLOS[k]) { n[k]++; break; }
  }
  return n;
}

var sinHalo = porAnillo(gaia, true);
var conHalo = porAnillo(res.estrellas, true);              // como el simulador: corta por mlim
var conHaloSinCorte = porAnillo(res.estrellas, false);     // sin el corte de capaEstrellas

console.log('M13 · D=' + D + 'mm  M=' + MAG + 'x  SQM=' + SQM.toFixed(1) +
            '  SBe=' + res.cHalo.SBe.toFixed(2) + '  mlim puntual=' + mlim.toFixed(2));
console.log('beam: fwhm=' + res.fwhmAs.toFixed(2) + '"  Ω usada=' + res.omegaBeam.toFixed(2) +
            ' as²  (Ω óptica=' + (Math.PI * res.fwhmAs * res.fwhmAs / 4).toFixed(2) +
            ', Ω píxel=' + Math.pow(ARCMIN * 60 / PROC, 2).toFixed(2) + ')');
console.log('Gaia en el fixture: ' + gaia.length + ' · con G<=mlim: ' +
            gaia.filter(function (s) { return s[2] <= mlim; }).length);
console.log('');
console.log(' r/r_h    m_res   sin halo   con halo   con halo(sin corte mlim)');
var tot = [0, 0, 0];
for (var k = 0; k < ANILLOS.length; k++) {
  var m = mRes(ANILLOS[k] * rhAs);
  tot[0] += sinHalo[k]; tot[1] += conHalo[k]; tot[2] += conHaloSinCorte[k];
  console.log(' <=' + ANILLOS[k].toFixed(2) + '   ' + (isFinite(m) ? m.toFixed(2) : '  inf') +
    String(sinHalo[k]).padStart(11) + String(conHalo[k]).padStart(11) +
    String(conHaloSinCorte[k]).padStart(11));
}
console.log(' total          ' + String(tot[0]).padStart(11) + String(tot[1]).padStart(11) +
            String(tot[2]).padStart(11));
