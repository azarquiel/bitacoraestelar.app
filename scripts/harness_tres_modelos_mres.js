#!/usr/bin/env node
/* Tres leyes de m_res sobre la MISMA escena de M13. No se elige ninguna: se
   miden las tres. Cada una lleva SU velo, porque el velo es el complemento
   exacto de lo que dibuja (por eso el flujo total es fijo y sirve de control).

     m_crowd    umbral duro de aglomeración, k = 30, Ω óptica. El modelo viejo.
     P_solo     producción (ADR 0012 paso 4): m <= m_res(cielo) Y Bernoulli a(m,r).
     m_lim,sky  solo el cielo local, sin aglomeración ninguna.

   Ninguna ley se reimplementa aqui (ADR 0008): m_crowd, a(m,r), S1, Fresuelto y
   Fdibujado salen de `pob`, y magLimite del render. Lo unico que cambia entre
   filas es QUE se combina con QUE.

   node scripts/harness_tres_modelos_mres.js */
'use strict';
var path = require('path');
var W = path.join(__dirname, '..') + path.sep;
global.window = {}; global.document = undefined;
require(W + 'resources/js/bitacora-gaia-render.js');
require(W + 'resources/js/lf-globulares-datos.js');
require(W + 'simulador_ocular/resources/js/globulares-datos.js');
require(W + 'resources/js/bitacora-cumulos.js');
var fs = require('fs');
var R = window.BitacoraGaiaRender, C = window.BitacoraCumulos;
var e = window.BITACORA_GLOBULARES.filter(function (f) { return f[0] === 'NGC 6205'; })[0];
var M13 = { id: e[0], ra: e[2], dec: e[3], rc: e[4], rh: e[5], c: e[6], muV0: e[7],
            Vt: e[8], dkpc: e[9], ebv: e[10], feh: e[11], elip: e[12], pa: null };
var D = 200, SQM = 21.0, SIZE = 720;
var pob0 = C.poblacionCacheada(M13, 0);
var ARCMIN = Math.ceil(2.4 * pob0.rtAs / 60);

var gaia = fs.readFileSync(W + 'docs/halo_v7/m13_gaia_dr3.csv', 'utf8').trim().split('\n').slice(1)
  .map(function (l) { var c = l.split(','); return [+c[0], +c[1], +c[2]]; });

function escena(MAG) {
  var difuso = new Float32Array(SIZE * SIZE);
  return R.pintarCumulo(difuso, M13, {
    ra0: M13.ra, dec0: M13.dec, arcmin: ARCMIN, size: SIZE,
    cielo: { pupilaSalida: D / MAG, pupilaOjo: 7, sqm: SQM, transmision: 0.9,
             aumentos: MAG, perceptual: true },
    apertura: D, estrellas: gaia, realization: 0
  });
}

/* m_res(r) de cada modelo, tabulado en la misma malla que la de producción. */
function mResModelo(modelo, res, MAG) {
  var pob = res.poblacion, t = res.tabla;
  var Fcielo = res.cHalo.Fcielo, n = t.r.length, out = new Float64Array(n);
  var pasadas = C.config.pasadasPuntoFijo;
  for (var i = 0; i < n; i++) {
    var rAs = t.r[i], s = pob.sigma(rAs);
    if (!(s > 0)) { out[i] = -Infinity; continue; }
    if (modelo === 'mcrowd') { out[i] = pob.mCrowd(rAs, res.omegaRes, 30); continue; }
    if (modelo === 'psolo') { out[i] = t.mRes[i]; continue; }
    if (modelo === 'viejo') {
      /* Lo que había ANTES del ADR 0012: cota de crowding y una sola pasada del
         cielo local sembrada en ella. Fila de referencia, no candidata. */
      var mc = pob.mCrowd(rAs, res.omegaRes, 30);
      var ms = R.magLimite({ apertura: D, aumentos: MAG, transmision: 0.9,
        sqm: -2.5 * Math.log10(Fcielo + s * pob.S1(mc)), pupilaOjo: 7 });
      out[i] = (ms == null) ? mc : Math.min(mc, ms);
      continue;
    }
    /* m_lim,sky puro: el mismo punto fijo, pero el velo es el corte duro S1(m)
       —sin adelgazar por a(m,r)—, que es el complemento de lo que dibuja. */
    var m = Infinity;
    for (var it = 0; it < pasadas; it++) {
      var mSky = R.magLimite({ apertura: D, aumentos: MAG, transmision: 0.9,
        sqm: -2.5 * Math.log10(Fcielo + s * pob.S1(m)), pupilaOjo: 7 });
      m = (mSky == null) ? -Infinity : mSky;
    }
    out[i] = m;
  }
  return out;
}

/* Flujo dibujado por unidad de perfil, en media, bajo cada modelo. */
function fDib(modelo, pob, mRes, rAs, rImg) {
  if (mRes === -Infinity) return 0;
  if (modelo === 'psolo') return pob.Fdibujado(mRes, rAs, rImg);
  return pob.Fresuelto(mRes);            // corte duro: m_crowd y m_lim,sky
}

function medir(MAG) {
  var res = escena(MAG), pob = res.poblacion, t = res.tabla, rImg = res.radioImagenAs;
  var Ftot = pob.S1(-Infinity), rcAs = pob.rcAs;
  var lista = gaia.concat(pob.sinteticas({ ra: M13.ra, dec: M13.dec, realization: 0 }));
  var cos0 = Math.cos(M13.dec * Math.PI / 180);
  var filas = ['mcrowd', 'psolo', 'sky', 'viejo'].map(function (modelo) {
    var mR = mResModelo(modelo, res, MAG);
    // Flujo del núcleo (r < r_c) que va en puntos: pesado por Sigma(r)·r.
    var num = 0, den = 0, numT = 0, denT = 0;
    for (var i = 0; i < t.r.length; i++) {
      var rAs = t.r[i], s = pob.sigma(rAs), w = s * rAs * t.paso;
      if (!(w > 0)) continue;
      var fd = fDib(modelo, pob, mR[i], rAs, rImg);
      numT += w * fd; denT += w * Ftot;
      if (rAs < rcAs) { num += w * fd; den += w * Ftot; }
    }
    // Estrellas dibujadas, con la regla de cada modelo, sobre la MISMA lista.
    var nNuc = 0, nTot = 0;
    for (var j = 0; j < lista.length; j++) {
      var st = lista[j], m = st[2];
      var dx = (((st[0] - M13.ra + 540) % 360) - 180) * cos0 * 3600;
      var dy = (st[1] - M13.dec) * 3600;
      var r = pob.radioPropio(dx, dy);
      if (r >= pob.rtAs) continue;
      var u = r / t.paso, k = Math.min(t.r.length - 2, Math.floor(u)), fr = u - k;
      var a = mR[k], b = mR[k + 1];
      var mm = (a === -Infinity) ? b : ((b === -Infinity) ? a : a * (1 - fr) + b * fr);
      if (!(m <= mm)) continue;
      if (modelo === 'psolo' &&
          !(C.sorteo(st[0], st[1], 0) < pob.aCrowd(m, r, rImg))) continue;
      nTot++; if (r < rcAs) nNuc++;
    }
    // Velo en el centro, en mag/arcsec²: lo que NO se dibuja es lo que vela.
    var I0 = pob.sigma(0) * (Ftot - fDib(modelo, pob, mR[0], 0, rImg));
    return { modelo: modelo, mRes0: mR[0], nNuc: nNuc, nTot: nTot, mu0: -2.5 * Math.log10(I0),
             fNuc: den > 0 ? num / den : 0, fGlob: denT > 0 ? numT / denT : 0 };
  });
  return { MAG: MAG, res: res, rcAs: rcAs, filas: filas, Ftot: Ftot };
}

var NOMBRE = { mcrowd: 'm_crowd  ', psolo: 'P_solo   ', sky: 'm_lim,sky', viejo: 'min(ambos)' };
[61, 250].forEach(function (MAG) {
  var q = medir(MAG);
  console.log('\n== M13 · D = 200 mm · SQM 21 · ' + MAG + 'x · r_c = ' + q.rcAs.toFixed(1) +
    '" · imagen estelar ' + q.res.radioImagenAs.toFixed(2) + '"');
  console.log('  modelo      m_res(0)   estr nucleo   estr total   mu_velo(0)   flujo nucleo en puntos   flujo cumulo en puntos');
  q.filas.forEach(function (f) {
    console.log('  ' + NOMBRE[f.modelo] +
      (isFinite(f.mRes0) ? f.mRes0.toFixed(2) : String(f.mRes0)).padStart(10) +
      String(f.nNuc).padStart(14) + String(f.nTot).padStart(13) + f.mu0.toFixed(2).padStart(13) +
      (100 * f.fNuc).toFixed(1).padStart(21) + ' %' +
      (100 * f.fGlob).toFixed(1).padStart(22) + ' %');
  });
  console.log('  flujo total del cumulo (control, identico en los tres): ' + q.Ftot.toExponential(6));
});
