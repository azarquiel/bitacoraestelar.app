#!/usr/bin/env node
/* #614 · Cruce de las filas mezcladas del núcleo de M13 con HST/ACS
   (Sarajedini et al. 2007). Aplica el prerregistro de ADR 0039, «Mezclas o
   completitud baja (#614)», sin mover R ni el listón.

   node scripts/spike_614_cruce.js ruta/hlsp_acsggct_hst_acs-wfc_ngc6205_r.rdviq.cal.adj.zpt
   (el .zpt no está en el repo: 26 MB, MAST /pub/hlsp/acsggct/ngc6205/) */
'use strict';
var fs = require('fs'), path = require('path');
var F = require('./flujo_hst.js');
global.window = {};
require('../simulador_ocular/resources/js/globulares-datos.js');

var e = global.window.BITACORA_GLOBULARES.filter(function (f) { return f[0] === 'NGC 6205'; })[0];
var RA0 = e[2], DEC0 = e[3], RH_AS = e[5] * 60, COS0 = Math.cos(DEC0 * Math.PI / 180);
function plano(ra, dec) { return { x: (ra - RA0) * COS0 * 3600, y: (dec - DEC0) * 3600 }; }

// HST: columnas por nombre de la cabecera del .zpt.
var lineas = fs.readFileSync(process.argv[2], 'utf8').split('\n');
var cab = lineas[0].trim().split(/\s+/);
var iV = cab.indexOf('Vvega'), iVI = cab.indexOf('VIvega'), iI = cab.indexOf('Ivega'), iRA = cab.indexOf('RA'), iDE = cab.indexOf('Dec');
var hst = [];
lineas.slice(1).forEach(function (l) {
  var c = l.trim().split(/\s+/);
  if (c.length < cab.length) return;
  var p = plano(+c[iRA], +c[iDE]);
  p.v = +c[iV]; p.i = +c[iI];
  hst.push(p);
});
if (iV < 0 || iI < 0 || iRA < 0 || iDE < 0 || iVI < 0) throw new Error('cabecera inesperada: ' + cab.join(' '));

// Gaia: fixture + criterio de #611.
var VAL = path.join(__dirname, '../simulador_ocular/docs/validacion');
var esMezcla = require('./mezcla_gaia.js').leer(path.join(VAL, 'm13_gaia_dr3_mezcla.csv'));
var gaia = fs.readFileSync(path.join(VAL, 'm13_gaia_dr3.csv'), 'utf8').trim().split('\n').slice(1).map(function (l) {
  var c = l.split(','), p = plano(+c[0], +c[1]);
  p.g = +c[2]; p.mezcla = esMezcla.get(c[0] + ',' + c[1]); p.r = Math.hypot(p.x, p.y);
  return p;
});

// Campo ACS: caja de las estrellas HST (rotada, pero basta exigir HST a ≤ R).
var tramo = gaia.filter(function (p) { return p.g >= 16.5 && p.g <= 18.5; });
var control = tramo.filter(function (p) { return !p.mezcla; });
// «≤1» del arnés es el ANILLO 0,5-1 r_h (ANILLOS de harness_fusion_blending.js).
function anilloMarcadas(r0, r1) { return tramo.filter(function (p) { return p.mezcla && p.r > r0 * RH_AS && p.r <= r1 * RH_AS; }); }
var marcadas = anilloMarcadas(0.5, 1);

// 1. Alineado sobre el control, con las HST de V < 20 (el tramo G 16,5-18,5
//    cae en V ≈ 17-19; las débiles harían ambigua toda pareja a ≤ 1″).
var d = F.alinear(control, hst.filter(function (s) { return s.v < 20; }));
hst.forEach(function (s) { s.x += d.dx; s.y += d.dy; });

// 2. G de HST ajustada sobre el control con su HST más cercana a ≤ 0,1″.
var idx01 = F.indice(hst, 0.1);
function masCercana(p, idx, r) {
  var best = null, dm = r;
  var cx = Math.floor(p.x / idx.lado), cy = Math.floor(p.y / idx.lado);
  for (var i = -1; i <= 1; i++) for (var j = -1; j <= 1; j++)
    (idx.m.get((cx + i) + ',' + (cy + j)) || []).forEach(function (s) {
      var dd = Math.hypot(s.x - p.x, s.y - p.y);
      if (dd <= dm) { dm = dd; best = s; }
    });
  return best;
}
var pares = [];
control.forEach(function (p) { var s = masCercana(p, idx01, 0.1); if (s) pares.push({ g: p.g, v: s.v, i: s.i }); });
var t = F.ajustarG(pares);
hst.forEach(function (s) { s.g = t.g(s.v, s.i); });

// 3. Q1 y Qs.
function medir(filas, r) {
  var idx = F.indice(hst, r), q1 = [], qs = [], nulas = 0;
  filas.forEach(function (p) {
    var q = F.cocientes(p, idx, r);
    if (!q) { nulas++; return; }
    q1.push(q.q1); qs.push(q.qs);
  });
  return { q1: q1, qs: qs, nulas: nulas };
}
function f3(x) { return x.toFixed(3).replace('.', ','); }

console.log('#614 · cruce Gaia–HST en M13 (prerregistro ADR 0039)');
console.log('HST: ' + hst.length + ' estrellas; centro Harris ' + RA0 + ', ' + DEC0 + '; r_h = ' + RH_AS.toFixed(1) + '″');
console.log('alineado HST → Gaia: dx = ' + d.dx.toFixed(3) + '″, dy = ' + d.dy.toFixed(3) + '″');
console.log('G − V = ' + t.a.toFixed(4) + ' + ' + t.b.toFixed(4) + '(V−I) + ' + t.c.toFixed(4) + '(V−I)²  sobre ' + pares.length + ' de ' + control.length + ' filas de control');

[F.R_AS, 0.6].forEach(function (r) {
  var m = medir(marcadas, r), c = medir(control, r), v = F.veredicto(m.q1);
  console.log('\nR = ' + String(r).replace('.', ',') + '″' + (r === F.R_AS ? ' (veredicto)' : ' (sensibilidad, sin voto)'));
  console.log('  marcadas en ≤1 (0,5-1 r_h), G 16,5-18,5: ' + marcadas.length + ' filas, ' + m.q1.length + ' con HST a ≤ R, ' + m.nulas + ' sin');
  console.log('  mediana Q1 = ' + f3(v.mediana) + '  [95 %: ' + f3(v.lo) + '-' + f3(v.hi) + ']  listón ' + String(F.T).replace('.', ','));
  console.log('  mediana Qs = ' + f3(F.mediana(m.qs)) + '  (informativo)');
  console.log('  control: mediana Q1 = ' + f3(F.mediana(c.q1)) + ' en ' + c.q1.length + ' filas (≈ 1 si el ajuste vale)');
  console.log('  lectura: ' + ({ a: '(a) mezclas', b: '(b) c baja', inconcluso: 'inconcluso' })[v.lectura]);
});

console.log('\nAnillos interiores (informativo, sin voto; R = 0,4″)');
[[0, 0.25, '≤0,25'], [0.25, 0.5, '≤0,5']].forEach(function (a) {
  var m = medir(anilloMarcadas(a[0], a[1]), F.R_AS);
  console.log('  ' + a[2] + ': ' + m.q1.length + ' filas, mediana Q1 = ' + f3(F.mediana(m.q1)) + ', Qs = ' + f3(F.mediana(m.qs)));
});
