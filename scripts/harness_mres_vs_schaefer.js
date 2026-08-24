#!/usr/bin/env node
/* m_res actual contra el límite visual de Schaefer, en la misma escena.

   M13 · D = 200 mm · SQM 21 · seeing 2" · 61x / 120x / 173x / 250x.

   Cuatro umbrales que conviene no confundir, de más generoso a menos:

     magLimite_simulador   nuestra ley, CIELO LIMPIO (sin el velo del cúmulo)
     magLimite_Schaefer    Schaefer 1990, cielo limpio. El banco empírico.
     m_res punto fijo      nuestra ley contra el fondo LOCAL (cielo + velo),
                           5 pasadas: lo que hay en producción.
     m_res Schaefer        el MISMO punto fijo, pero con Schaefer de umbral.

   La última fila es el diagnóstico: si sustituir nuestra ley por el banco
   empírico dentro del punto fijo mueve poco el núcleo, el umbral no es quien
   decide cuántas estrellas hay.

   `m_res final` = el convergido a 30 pasadas, para ver qué residuo dejan las 5
   de producción; y `m_res <r_c>` = el promedio sobre el núcleo, que es el que
   de verdad decide las estrellas (m_res(0) es solo el centro).

   Ninguna ley se reimplementa (ADR 0008): Schaefer viene de
   harness_maglimite_schaefer.js, magLimite del render, y a(m,r)/S1campo de pob.

   node scripts/harness_mres_vs_schaefer.js */
'use strict';
var path = require('path');
var W = path.join(__dirname, '..') + path.sep;
/* Schaefer PRIMERO, y sobre SU `window`: su arnés se monta uno al cargar y ya
   engancha ahí el render. Reponer `global.window` después dejaría el módulo del
   render en la caché de node, sin volver a ejecutarse, y BitacoraCumulos no
   encontraría el perfil de King. */
var SCH = require(path.join(__dirname, 'harness_maglimite_schaefer.js'));
global.document = undefined;
require(W + 'resources/js/bitacora-gaia-render.js');
require(W + 'resources/js/lf-globulares-datos.js');
require(W + 'simulador_ocular/resources/js/globulares-datos.js');
require(W + 'resources/js/bitacora-cumulos.js');
var fs = require('fs');
var R = window.BitacoraGaiaRender, C = window.BitacoraCumulos;

var e = window.BITACORA_GLOBULARES.filter(function (f) { return f[0] === 'NGC 6205'; })[0];
var M13 = { id: e[0], ra: e[2], dec: e[3], rc: e[4], rh: e[5], c: e[6], muV0: e[7],
            Vt: e[8], dkpc: e[9], ebv: e[10], feh: e[11], elip: e[12], pa: null };
var D = 200, SQM = 21.0, SEEING = 2, SIZE = 720;
var AUMENTOS = [61, 120, 173, 250];
var pob0 = C.poblacionCacheada(M13, 0);
var ARCMIN = Math.ceil(2.4 * pob0.rtAs / 60);
var gaia = fs.readFileSync(W + 'simulador_ocular/docs/validacion/m13_gaia_dr3.csv', 'utf8').trim().split('\n').slice(1)
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

/* Umbral contra un fondo dado (SQM local), con una ley u otra. */
function umbral(ley, MAG, sqmLocal) {
  if (ley === 'schaefer') {
    return SCH.schaefer(D, MAG, SCH.nelmDeSqm(sqmLocal), { tipo: 'newton', seeing: SEEING });
  }
  var m = R.magLimite({ apertura: D, aumentos: MAG, transmision: 0.9,
                        sqm: sqmLocal, pupilaOjo: 7 });
  return (m == null) ? -Infinity : m;
}

/* El punto fijo velo <-> umbral, con la ley que se le pase y N pasadas. */
function puntoFijo(ley, MAG, pob, rAs, rImg, Fcielo, pasadas) {
  var s = pob.sigma(rAs);
  if (!(s > 0)) return -Infinity;
  var m = Infinity;
  for (var it = 0; it < pasadas; it++) {
    m = umbral(ley, MAG, -2.5 * Math.log10(Fcielo + s * pob.S1campo(m, rAs, rImg)));
  }
  return m;
}

/* Estrellas dibujadas y flujo en puntos bajo una tabla m_res(r) dada, con la
   regla de producción (umbral + sorteo Bernoulli de a(m,r)). */
function cosecha(pob, mR, t, rImg, rcAs) {
  var Ftot = pob.S1(-Infinity);
  var lista = gaia.concat(pob.sinteticas({ ra: M13.ra, dec: M13.dec, realization: 0 }));
  var cos0 = Math.cos(M13.dec * Math.PI / 180);
  var num = 0, den = 0, nNuc = 0, nTot = 0;
  for (var i = 0; i < t.r.length; i++) {
    var rr = t.r[i], s = pob.sigma(rr), w = s * rr * t.paso;
    if (!(w > 0) || rr >= rcAs) continue;
    den += w * Ftot;
    if (mR[i] !== -Infinity) num += w * pob.Fdibujado(mR[i], rr, rImg);
  }
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
    if (!(C.sorteo(st[0], st[1], 0) < pob.aCrowd(m, r, rImg))) continue;
    nTot++; if (r < rcAs) nNuc++;
  }
  return { nNuc: nNuc, nTot: nTot, fNuc: den > 0 ? num / den : 0 };
}

function tablaDe(ley, MAG, pob, t, rImg, Fcielo, pasadas) {
  var out = new Float64Array(t.r.length);
  for (var i = 0; i < t.r.length; i++) {
    out[i] = puntoFijo(ley, MAG, pob, t.r[i], rImg, Fcielo, pasadas);
  }
  return out;
}

function mediaNucleo(mR, t, rcAs) {
  var s = 0, n = 0;
  for (var i = 0; i < t.r.length && t.r[i] < rcAs; i++) {
    if (mR[i] === -Infinity) continue;
    s += mR[i]; n++;
  }
  return n ? s / n : NaN;
}

console.log('M13 · D = 200 mm · SQM 21 · seeing 2" · newtoniano · realización 0');
console.log('r_c = ' + pob0.rcAs.toFixed(1) + '"  ·  fixture Gaia + sintéticas\n');
console.log('  CIELO LIMPIO (sin el velo del cúmulo)          |  FONDO LOCAL (cielo + velo), punto fijo');
console.log('   aum   Schaefer   simulador   dif  |  ley        m_res(0) 5p   m_res(0) final   m_res <r_c>   N núcleo   N total   flujo núcleo');

AUMENTOS.forEach(function (MAG) {
  var res = escena(MAG), pob = res.poblacion, t = res.tabla, rImg = res.radioImagenAs;
  var Fcielo = res.cHalo.Fcielo, rcAs = pob.rcAs;
  var limpioSch = umbral('schaefer', MAG, SQM);
  var limpioSim = umbral('nuestra', MAG, SQM);
  var pasadas = C.config.pasadasPuntoFijo;
  [['simulador', 'nuestra'], ['Schaefer ', 'schaefer']].forEach(function (par, k) {
    var mR = (par[1] === 'nuestra')
      ? Float64Array.from(t.mRes)                       // la de producción, tal cual
      : tablaDe(par[1], MAG, pob, t, rImg, Fcielo, pasadas);
    var mFin = tablaDe(par[1], MAG, pob, t, rImg, Fcielo, 30);
    var c = cosecha(pob, mR, t, rImg, rcAs);
    var cab = k === 0
      ? '  ' + String(MAG).padStart(4) + limpioSch.toFixed(2).padStart(11) +
        limpioSim.toFixed(2).padStart(12) + (limpioSim - limpioSch >= 0 ? '  +' : '  ') +
        (limpioSim - limpioSch).toFixed(2)
      : '                                   ';
    console.log(cab + '  |  ' + par[0] +
      mR[0].toFixed(2).padStart(13) + mFin[0].toFixed(2).padStart(17) +
      mediaNucleo(mR, t, rcAs).toFixed(2).padStart(14) +
      String(c.nNuc).padStart(11) + String(c.nTot).padStart(10) +
      (100 * c.fNuc).toFixed(1).padStart(13) + ' %');
  });
});

console.log('\n5p = las 5 pasadas de producción; final = convergido a 30 pasadas.');
console.log('N y flujo llevan siempre la regla completa de producción: umbral + sorteo Bernoulli.');
