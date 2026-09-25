#!/usr/bin/env node
/* La medida del prerregistro de #341 (simulador_ocular/docs/experimentos/
   prerregistro_corte_crumey.md) contra la variante que implementa #342: los
   cinco listones L1–L5 y el censo informativo de M13. Mide, no decide: el
   veredicto lo da la tabla del prerregistro con las cifras que salen aquí.

   Sin ley propia (ADR 0008): magLimite, ctxFotometrico y fot salen del render
   de producción; el detector de tramos y el muestreo, de harness_crumey.js
   tal cual; las 12 filas, de campo_h2c.js; la escena de M13, de
   harness_censo_crumey.js. La ley histórica se alcanza con las banderas de FOT
   (SB_FONDO_NULO = null, SB_SUELO_PINTADO = 27), no con una copia.
   Contraste declarado: d0 sale de crumeyD0 de harness_crumey.js, una Ec. 70
   independiente de la de producción; L1 es justo esa comparación.

   Ejecución vacua (criterio de parada): si el autotest del harness no pasa,
   el prerregistro no tiene tabla o el script lanza una excepción, sale con
   código 2 sin cifras.

   node scripts/medida_corte_crumey.js */
'use strict';
var fs = require('fs'), path = require('path'), execFileSync = require('child_process').execFileSync;
var crumey = require('./harness_crumey.js');
var campo = require('./campo_h2c.js');           // carga el render en global.window
var censo = require('./harness_censo_crumey.js');
var R = global.window.BitacoraGaiaRender, FOT = R.fot;

function vacua(motivo) { console.error('EJECUCIÓN VACUA: ' + motivo); process.exit(2); }
try { crumey.autotest(); } catch (e) { vacua('autotest del harness: ' + e.message); }

var VARIANTE = { SB_FONDO_NULO: FOT.SB_FONDO_NULO, SB_SUELO_PINTADO: FOT.SB_SUELO_PINTADO };
var HISTORICO = { SB_FONDO_NULO: null, SB_SUELO_PINTADO: 27 };
if (VARIANTE.SB_FONDO_NULO == null) vacua('FOT.SB_FONDO_NULO está apagado: no hay variante que medir');
function con(fot, ley, fn) {
  var antes = {};
  Object.keys(ley).forEach(function (k) { antes[k] = fot[k]; fot[k] = ley[k]; });
  try { return fn(); } finally { Object.keys(antes).forEach(function (k) { fot[k] = antes[k]; }); }
}

var T = 0.9, P = 7;
function dCero(sqm) { return crumey.crumeyD0(P, crumey.luminanciaDeMu(sqm) * T); } // mm, Ec. 70
function mlim(D, M, sqm) {
  return R.magLimite({ apertura: D, aumentos: M, transmision: T, sqm: sqm, pupilaOjo: P });
}
var veredictos = {};
function veredicto(L, v, cifra) { veredictos[L] = v; console.log('  ' + L + ': ' + v + ' · ' + cifra); }

console.log('Medida del corte de fondo cero (#342) · ' + new Date().toISOString().slice(0, 10));
console.log('FOT.SB_FONDO_NULO = ' + VARIANTE.SB_FONDO_NULO + ', FOT.SB_SUELO_PINTADO = ' + VARIANTE.SB_SUELO_PINTADO + '\n');

/* ── L1 y L2 · 200 mm, cielo 21,5, t 0,9, ojo 7 mm ───────────────────────── */
var D1 = 200, SQM1 = 21.5, d0 = dCero(SQM1);
var curva = crumey.curvaPorPupila(function (d) { return mlim(D1, D1 / (d * 1e3), SQM1); }, 20e-3, 0.2e-3, 200);
var ts = crumey.tramos(curva);
console.log('L1/L2 · tramos de magLimite (d0 = ' + d0.toFixed(4) + ' mm, ' + (D1 / d0).toFixed(1) + '×)');
ts.forEach(function (t) {
  console.log('    pendiente ' + t.clase.padEnd(6) + ' (medida ' + t.pendiente.toFixed(3) + ')  d ' +
    t.dIniMm.toFixed(4) + ' → ' + t.dFinMm.toFixed(4) + ' mm  m ' + t.mIni.toFixed(4) + ' → ' + t.mFin.toFixed(4));
});
var plano = ts.filter(function (t) { return t.clase === '0'; })[0];
if (!plano) veredicto('L1', 'FALLA', 'no hay tramo de pendiente 0');
else {
  var err = Math.abs(plano.dIniMm - d0);
  veredicto('L1', err <= 0.05 ? 'PASA' : (err > 0.07 ? 'FALLA' : 'NO CONCLUYENTE'),
    'd_plano = ' + plano.dIniMm.toFixed(4) + ' mm, |d_plano − d0| = ' + err.toFixed(4) + ' mm');
}
var enPlano = curva.filter(function (p) { return p.d * 1e3 <= d0; }).map(function (p) { return p.m; });
enPlano.push(mlim(D1, D1 / d0, SQM1));
var varPlano = Math.max.apply(null, enPlano) - Math.min.apply(null, enPlano);
veredicto('L2', varPlano <= 0.01 ? 'PASA' : 'FALLA',
  'variación de magLimite entre d0 y 0,2 mm = ' + varPlano.toExponential(3) + ' mag en ' + enPlano.length + ' puntos');

/* ── L3 · fuera de su dominio, el cambio es nulo ─────────────────────────── */
var n3 = 0, nSobre = 0, nBajo = 0, fallos3 = [], maxDifSobre = 0;
[200, 450].forEach(function (D) {
  [21.0, 21.5, 22.0].forEach(function (sqm) {
    var d0s = dCero(sqm);
    for (var M = 20; M <= 600; M++) {
      var v = mlim(D, M, sqm), h = con(FOT, HISTORICO, function () { return mlim(D, M, sqm); });
      n3++;
      if (D / M >= d0s) {
        nSobre++; maxDifSobre = Math.max(maxDifSobre, Math.abs(v - h));
        if (!(Math.abs(v - h) <= 1e-9)) fallos3.push(D + ' mm ' + M + '× sqm ' + sqm + ': Δ ' + (v - h));
      } else {
        nBajo++;
        if (!(v <= h)) fallos3.push(D + ' mm ' + M + '× sqm ' + sqm + ': variante ' + v + ' > actual ' + h);
      }
    }
  });
});
console.log('\nL3 · ' + n3 + ' puntos (' + nSobre + ' con d ≥ d0, ' + nBajo + ' con d < d0)');
fallos3.slice(0, 10).forEach(function (f) { console.log('    ' + f); });
veredicto('L3', fallos3.length ? 'FALLA' : 'PASA',
  fallos3.length + ' puntos fuera; |Δ| máximo con d ≥ d0 = ' + maxDifSobre.toExponential(3));

/* ── L4 · H2c intacta: tabla_corte_h2c.js con la bandera reproduce el margen ─ */
function margenes(texto) {
  return texto.split('\n').filter(function (l) { return /^\| \d+ \|/.test(l); }).map(function (l) {
    var c = l.split('|').map(function (s) { return s.trim(); });
    return { fila: +c[1], margen: c[c.length - 2] };
  });
}
var PRE = path.join(__dirname, '..', 'simulador_ocular', 'docs', 'experimentos', 'prerregistro_corte_crumey.md');
var congelados = margenes(fs.readFileSync(PRE, 'utf8'));
if (congelados.length !== 12) vacua('el prerregistro no trae las 12 filas congeladas (' + congelados.length + ')');
var ahora = margenes(execFileSync(process.execPath, [path.join(__dirname, 'tabla_corte_h2c.js'), '--corte'], { encoding: 'utf8' }));
var difs4 = congelados.filter(function (c, i) { return !ahora[i] || ahora[i].margen !== c.margen; });
console.log('\nL4 · margen de H2c, prerregistro frente a tabla_corte_h2c.js --corte');
congelados.forEach(function (c, i) {
  console.log('    fila ' + String(c.fila).padStart(2) + '  ' + c.margen.padStart(10) + '  ' + (ahora[i] ? ahora[i].margen : '—').padStart(10));
});
veredicto('L4', ahora.length === 12 && !difs4.length ? 'PASA' : 'FALLA', difs4.length + ' diferencias en ' + ahora.length + ' filas');

/* ── L5 · la guarda del pintado se mueve con el corte ────────────────────── */
var filas = campo.leerFilas(), cambian = [];
filas.forEach(function (c, i) {
  var o = { pupilaSalida: c[1] / c[2], pupilaOjo: P, sqm: c[3], transmision: c[5], aumentos: c[2] };
  var v = R.ctxFotometrico(o).FcieloPintado, h = con(FOT, HISTORICO, function () { return R.ctxFotometrico(o).FcieloPintado; });
  if (v !== h) cambian.push(i + 1);
});
var guarda = Math.abs(VARIANTE.SB_SUELO_PINTADO - 25.08);
var conjunto = cambian.join(',') === '3,5,6,11,12';
console.log('\nL5 · |SB_SUELO_PINTADO − 25,08| = ' + guarda.toFixed(4) + '; FcieloPintado cambia en las filas ' + cambian.join(', '));
veredicto('L5', guarda <= 0.005 && conjunto ? 'PASA' : 'FALLA',
  'guarda a ' + guarda.toFixed(4) + ' de 25,08; filas que cambian = {' + cambian.join(', ') + '}');

/* ── Informativo · censo de M13 por escena, estrella a estrella ──────────── */
console.log('\nCenso de M13 (SQM 21, campo 28′, 720 px, realización 0): estrellas dibujadas, ganadas y perdidas');
console.log('  equipo          d (mm)  d0 (mm)  mlim actual  mlim corte  dibujadas actual  corte  ganadas  perdidas');
var V = censo.cargarRender(27);
function clave(s) { return s[0] + ',' + s[1] + ',' + s[2]; }
function dibujadas(esc) {
  return esc.res.estrellas.filter(function (s) { return (s[4] != null ? s[4] : s[2]) <= esc.mlim; }).map(clave);
}
[200, 450].forEach(function (D) {
  [250, 350].forEach(function (M) {
    var h = con(V.R.fot, HISTORICO, function () { return censo.escenaM13(V, D, M, 21); });
    var v = con(V.R.fot, VARIANTE, function () { return censo.escenaM13(V, D, M, 21); });
    var sh = dibujadas(h), sv = dibujadas(v), H = {}, W = {};
    sh.forEach(function (k) { H[k] = 1; }); sv.forEach(function (k) { W[k] = 1; });
    var gan = sv.filter(function (k) { return !H[k]; }).length, per = sh.filter(function (k) { return !W[k]; }).length;
    console.log('  ' + (D + ' mm ' + M + '×').padEnd(14) + (D / M).toFixed(2).padStart(8) + dCero(21).toFixed(2).padStart(9) +
      h.mlim.toFixed(2).padStart(13) + v.mlim.toFixed(2).padStart(12) + String(sh.length).padStart(18) +
      String(sv.length).padStart(7) + String(gan).padStart(9) + String(per).padStart(10));
  });
});

/* ── Veredicto, con la tabla del prerregistro ────────────────────────────── */
var ls = ['L1', 'L2', 'L3', 'L4', 'L5'];
var falla = ls.some(function (L) { return veredictos[L] === 'FALLA'; });
var todas = ls.every(function (L) { return veredictos[L] === 'PASA'; });
console.log('\n── Veredicto: ' + (todas ? 'ADELANTE' : (falla ? 'NO ADELANTE' : 'NO CONCLUYENTE')) + ' ──');
