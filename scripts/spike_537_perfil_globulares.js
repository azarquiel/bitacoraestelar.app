#!/usr/bin/env node
/* Spike #537: ¿el King 1962 con los parámetros de Harris sobrestima el halo
   exterior de los globulares frente a Trager, King & Djorgovski 1995?

   Mide sobre los 13 globulares del seed (observaciones-seed.json):
     P1  residuo modelo − Trager por tramos de r/r_h y punto cero (V integrada de muVf).
     P2  los mismos tramos para King 1966 y Wilson con los ajustes de
         McLaughlin & van der Marel 2005, y la curva muVf de Trager.
     P3  el pipeline real (pintarCumulo, halo lineal de #535) con el perfil de
         producción y con el de Trager, en cuatro equipos.
   No toca producción: el perfil alternativo entra sustituyendo R.perfilKing y
   R.areaKing en memoria, y se restaura al acabar cada corrida.

   Uso: node scripts/spike_537_perfil_globulares.js
   Nota con los resultados: simulador_ocular/docs/notas/perfil-king-contra-trager-globulares.md */
'use strict';
var fs = require('fs'), path = require('path');
var REPO = path.join(__dirname, '..');
global.window = {}; global.document = undefined;
require(REPO + '/resources/js/bitacora-gaia-render.js');
require(REPO + '/resources/js/lf-globulares-datos.js');
require(REPO + '/simulador_ocular/resources/js/globulares-datos.js');
require(REPO + '/resources/js/bitacora-cumulos.js');
var R = window.BitacoraGaiaRender, C = window.BitacoraCumulos, CAT = window.BITACORA_GLOBULARES;
var VAL = REPO + '/simulador_ocular/docs/validacion/';

var SEED = [['NGC 7089', 'M2'], ['NGC 6121', 'M4'], ['NGC 5904', 'M5'], ['NGC 6333', 'M9'], ['NGC 6254', 'M10'],
  ['NGC 6218', 'M12'], ['NGC 6205', 'M13'], ['NGC 6402', 'M14'], ['NGC 7078', 'M15'], ['NGC 6656', 'M22'],
  ['NGC 7099', 'M30'], ['NGC 6809', 'M55'], ['NGC 6266', 'M62']];

function ficha(id) {
  var e = CAT.filter(function (f) { return f[0] === id; })[0];
  return { id: e[0], ra: e[2], dec: e[3], rc: e[4], rh: e[5], c: e[6], muV0: e[7], Vt: e[8], dkpc: e[9],
    ebv: e[10], feh: e[11], elip: e[12], pa: null };
}
var mag = function (F) { return F > 0 ? -2.5 * Math.log10(F) : Infinity; };
var mediana = function (v) { if (!v.length) return NaN; v = v.slice().sort(function (a, b) { return a - b; }); return v[Math.floor(v.length / 2)]; };
var f = function (x, d) { return isFinite(x) ? x.toFixed(d == null ? 2 : d) : '—'; };

/* ── Datos ─────────────────────────────────────────────────────────────── */
var TRAGER = {};
fs.readFileSync(VAL + 'trager1995_seed.tsv', 'utf8').split('\n').forEach(function (l) {
  if (!l || l.charAt(0) === '#') return;
  var c = l.split('\t');
  (TRAGER[c[0].trim()] = TRAGER[c[0].trim()] || []).push({ rAs: Math.pow(10, +c[1]), mu: +c[2], muf: +c[3], w: +c[4] });
});
var MVDM = {};
fs.readFileSync(VAL + 'mclaughlin2005_modelos_seed.tsv', 'utf8').split('\n').forEach(function (l) {
  if (!l || l.charAt(0) === '#') return;
  var c = l.split('\t');
  var id = c[0].trim().replace('MW-NGC', 'NGC ');
  (MVDM[id] = MVDM[id] || {})[c[3].trim()] = { chi2: +c[4], W0: +c[5], conc: +c[6], r0As: +c[7] };
});

/* ── King 1966 y Wilson 1975: integración de Poisson ──────────────────────
   Densidad en función del potencial adimensional W (Binney & Tremaine §4.3):
     King   ρ ∝ e^W erf(√W) − √(4W/π)(1 + 2W/3)
     Wilson ρ ∝ e^W erf(√W) − √(4W/π)(1 + 2W/3 + 4W²/15)
   W'' + 2W'/r = −9 ρ(W)/ρ(W0), r en unidades del radio de King r0. */
function erf(x) { // Numerical Recipes erfc (Chebyshev), error relativo < 1,2e-7
  var t = 1 / (1 + 0.5 * Math.abs(x));
  var y = 1 - t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
    t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? y : -y;
}
function rhoW(W, wilson) {
  if (W <= 0) return 0;
  /* Con W pequeño la resta cancela y el error de erf domina. e^W·erf(√W) =
     (2/√π)·Σ 2^n W^(n+½)/(2n+1)!!, y la resta quita los primeros términos:
     King deja n ≥ 2 y Wilson n ≥ 3. */
  if (W < 2) {
    var term = Math.sqrt(W), suma = 0;
    for (var n = 0; n < 40; n++) { if (n >= (wilson ? 3 : 2)) suma += term; term *= 2 * W / (2 * n + 3); }
    return 2 / Math.sqrt(Math.PI) * suma;
  }
  var s = Math.sqrt(W), p = 1 + 2 * W / 3 + (wilson ? 4 * W * W / 15 : 0);
  return Math.exp(W) * erf(s) - Math.sqrt(4 * W / Math.PI) * p;
}
function modeloDinamico(W0, wilson) {
  var rho0 = rhoW(W0, wilson), h = 1e-3, r = 1e-6, W = W0, dW = 0, rs = [0], Ws = [W0];
  function d2(rr, w, dw) { return -9 * rhoW(w, wilson) / rho0 - 2 * dw / rr; }
  while (W > 0 && r < 1e5) {
    var k1w = dW, k1d = d2(r, W, dW);
    var k2w = dW + h / 2 * k1d, k2d = d2(r + h / 2, W + h / 2 * k1w, dW + h / 2 * k1d);
    var k3w = dW + h / 2 * k2d, k3d = d2(r + h / 2, W + h / 2 * k2w, dW + h / 2 * k2d);
    var k4w = dW + h * k3d, k4d = d2(r + h, W + h * k3w, dW + h * k3d);
    var Wn = W + h / 6 * (k1w + 2 * k2w + 2 * k3w + k4w), dWn = dW + h / 6 * (k1d + 2 * k2d + 2 * k3d + k4d);
    if (Wn <= 0) { r += h * W / (W - Wn); W = 0; rs.push(r); Ws.push(0); break; }
    r += h; W = Wn; dW = dWn; rs.push(r); Ws.push(W);
    if (r > 1) h = Math.min(0.02 * r, 0.5);
  }
  var rt = r;
  function rho(rr) { // interpolación lineal en la malla
    if (rr >= rt) return 0;
    var lo = 0, hi = rs.length - 1;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (rs[m] <= rr) lo = m; else hi = m; }
    var u = (rr - rs[lo]) / (rs[hi] - rs[lo]);
    return rhoW(Ws[lo] + u * (Ws[hi] - Ws[lo]), wilson) / rho0;
  }
  // Proyección Σ(R) = 2∫0^√(rt²−R²) ρ(√(R²+z²)) dz, tabulada en log R.
  var NR = 400, Rt = [], St = [];
  for (var i = 0; i <= NR; i++) {
    var R_ = i === 0 ? 0 : rt * Math.pow(10, -4 + 4 * i / NR);
    var zmax = Math.sqrt(Math.max(0, rt * rt - R_ * R_)), n = 400, hz = zmax / n, s = 0;
    for (var k = 0; k < n; k++) { var z0 = k * hz; s += (rho(Math.sqrt(R_ * R_ + z0 * z0)) + 4 * rho(Math.sqrt(R_ * R_ + (z0 + hz / 2) * (z0 + hz / 2))) + rho(Math.sqrt(R_ * R_ + (z0 + hz) * (z0 + hz)))) * hz / 6; }
    Rt.push(R_); St.push(2 * s);
  }
  function sigmaProj(R_) {
    if (R_ >= rt) return 0;
    var lo = 0, hi = Rt.length - 1;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (Rt[m] <= R_) lo = m; else hi = m; }
    var u = (R_ - Rt[lo]) / (Rt[hi] - Rt[lo]);
    return St[lo] + u * (St[hi] - St[lo]);
  }
  return { rt: rt, conc: Math.log10(rt), sigma: sigmaProj };
}

/* Normaliza una Σ(r) (r en arcsec, valor relativo) a fracción de flujo/arcsec²: ∫Σ·2πr dr = 1. */
function normalizar(sig, rtAs) {
  var N = 20000, h = rtAs / N, acu = 0;
  for (var i = 0; i < N; i++) { var a = i * h, b = a + h, m = a + h / 2; acu += (sig(a) * a + 4 * sig(m) * m + sig(b) * b) * h / 6; }
  acu *= 2 * Math.PI;
  return function (r) { return sig(r) / acu; };
}

/* Curva muVf de Trager interpolada en log r; fuera de su último radio sigue la
   pendiente de los dos últimos nodos. shortcut: extrapolación lineal en log r,
   solo pesa en globulares cuyo r_t de Harris supera la cobertura de Trager. */
function curvaTrager(pts) {
  var p = pts.slice().sort(function (a, b) { return a.rAs - b.rAs; });
  var lr = p.map(function (q) { return Math.log10(q.rAs); }), mf = p.map(function (q) { return q.muf; });
  return function (rAs) {
    var x = Math.log10(Math.max(rAs, p[0].rAs)), n = lr.length;
    var j = 1; while (j < n - 1 && lr[j] < x) j++;
    var u = (x - lr[j - 1]) / ((lr[j] - lr[j - 1]) || 1e-9);
    return mf[j - 1] + u * (mf[j] - mf[j - 1]);
  };
}

/* ── Autocomprobación del integrador contra la columna Conc de MvdM05 ───── */
var malas = 0;
Object.keys(MVDM).forEach(function (id) {
  ['K', 'W'].forEach(function (m) {
    var e = MVDM[id][m]; if (!e) return;
    var mod = modeloDinamico(e.W0, m === 'W');
    if (Math.abs(mod.conc - e.conc) > 0.03) { malas++; console.error('FALLA integrador ' + id + ' ' + m + ': c=' + mod.conc.toFixed(3) + ' frente ' + e.conc); }
  });
});
console.log('Integrador King66/Wilson contra Conc de MvdM05: ' + (malas ? malas + ' fallos' : 'ok (|Δc| ≤ 0,03 en todos)'));
if (malas) process.exit(1);

/* ── P1 y P2: residuos por tramos de r/r_h ─────────────────────────────── */
var TRAMOS = [[0, 1], [1, 2], [2, 4], [4, 8], [8, 1e9]];
var RES = {};
console.log('\n## P1/P2 · mediana de (modelo − Trager) en mag/arcsec², puntos con peso > 0 y r < r_t(Harris)');
console.log('negativo = modelo más brillante que Trager. Tramos en r/r_h: ' + TRAMOS.map(function (t) { return t[0] + '-' + (t[1] > 1e8 ? '∞' : t[1]); }).join(' | '));
SEED.forEach(function (par) {
  var K = ficha(par[0]), clave = par[0].replace('NGC ', 'ngc'), pts = TRAGER[clave];
  var pob = C.poblacionCacheada(K, 0), Ft = Math.pow(10, -0.4 * K.Vt), rtAs = pob.rtAs, rhAs = K.rh * 60, rcAs = K.rc * 60;
  var muf = curvaTrager(pts);
  // Punto cero: V de integrar muVf hasta el último nodo de Trager.
  var rMax = Math.max.apply(null, pts.map(function (q) { return q.rAs; }));
  var N = 4000, Fint = 0, lr0 = Math.log10(0.5), lr1 = Math.log10(rMax);
  Fint += Math.pow(10, -0.4 * muf(0.5)) * Math.PI * 0.25;
  for (var i = 0; i < N; i++) { var ra = Math.pow(10, lr0 + (lr1 - lr0) * i / N), rb = Math.pow(10, lr0 + (lr1 - lr0) * (i + 1) / N);
    Fint += 0.5 * (Math.pow(10, -0.4 * muf(ra)) * ra + Math.pow(10, -0.4 * muf(rb)) * rb) * (rb - ra) * 2 * Math.PI; }
  var w = pts.filter(function (q) { return q.w > 0; });
  var rUlt = Math.max.apply(null, w.map(function (q) { return q.rAs; }));
  var cand = { K62: function (r) { return mag(Ft * pob.sigma(r)); } };
  var mv = MVDM[par[0]] || {};
  ['K', 'W'].forEach(function (m) {
    if (!mv[m]) return;
    var mod = modeloDinamico(mv[m].W0, m === 'W'), r0 = mv[m].r0As, rtM = mod.rt * r0;
    var sN = normalizar(function (r) { return mod.sigma(r / r0); }, rtM);
    cand[m === 'K' ? 'K66' : 'Wil'] = function (r) { return mag(Ft * sN(r)); };
  });
  var sT = normalizar(function (r) { return Math.pow(10, -0.4 * muf(r)); }, rtAs);
  cand.TrgN = function (r) { return mag(Ft * sT(r)); };
  // Desplazamiento de punto cero del K62 en el núcleo (0,5-3 r_c): separa forma de normalización.
  var zp = mediana(w.filter(function (q) { return q.rAs >= 0.5 * rcAs && q.rAs <= 3 * rcAs; }).map(function (q) { return cand.K62(q.rAs) - q.mu; }));
  var fila = { c: K.c, rt: rtAs / 60, rUltRh: rUlt / rhAs, rUlt: rUlt / 60, Vtr: mag(Fint), Vt: K.Vt, zp: zp, tramos: {} , chi: mv };
  Object.keys(cand).forEach(function (k) {
    fila.tramos[k] = TRAMOS.map(function (t) {
      var v = w.filter(function (q) { return q.rAs < rtAs && q.rAs >= t[0] * rhAs && q.rAs < t[1] * rhAs; })
        .map(function (q) { return cand[k](q.rAs) - q.mu; }).filter(isFinite);
      return { n: v.length, m: mediana(v) };
    });
  });
  RES[par[0]] = fila;
  console.log('\n' + par[1] + ' (' + par[0] + ')  c=' + K.c + '  r_t=' + f(fila.rt, 1) + "'  r_h=" + K.rh + "'  último punto Trager con peso: " + f(fila.rUlt, 1) + "' (" + f(fila.rUltRh, 1) + ' r_h)');
  console.log('  V integrando muVf = ' + f(fila.Vtr) + '  frente V_t Harris = ' + K.Vt + '  (Δ ' + f(fila.Vtr - K.Vt) + ')   K62 − Trager en 0,5-3 r_c: ' + f(zp));
  if (mv.K) console.log('  χ² MvdM05: K66 ' + mv.K.chi2 + '  Wilson ' + (mv.W ? mv.W.chi2 : '—'));
  Object.keys(fila.tramos).forEach(function (k) {
    console.log('  ' + k.padEnd(5) + fila.tramos[k].map(function (t) { return (t.n ? f(t.m) : '—').padStart(6) + ' (' + t.n + ')'; }).join(' '));
  });
  /* Solo forma: modelo − TrgN. Los dos van normalizados a V_t, así que el punto
     cero (V_t de Harris frente a la luz que mide Trager) se cancela. */
  ['K62', 'K66', 'Wil'].forEach(function (k) {
    if (!fila.tramos[k]) return;
    console.log('  ' + (k + '−T').padEnd(7) + fila.tramos[k].map(function (t, i) { var d = t.m - fila.tramos.TrgN[i].m; return (t.n ? f(d) : '—').padStart(6); }).join('       '));
  });
});

/* Resumen de P2: por candidato, mediana entre globulares de |modelo − TrgN| en
   los tramos exteriores (2-4 y 4-8 r_h). Solo globulares con ajuste de MvdM05. */
console.log('\n## P2 · resumen: mediana entre globulares de |modelo − TrgN| (solo forma), tramos 2-4 y 4-8 r_h');
['K62', 'K66', 'Wil'].forEach(function (k) {
  var por = [2, 3].map(function (j) {
    return mediana(Object.keys(RES).filter(function (id) { return RES[id].tramos.Wil; }).map(function (id) {
      var t = RES[id].tramos; return t[k][j].n ? Math.abs(t[k][j].m - t.TrgN[j].m) : NaN; }).filter(isFinite));
  });
  console.log('  ' + k.padEnd(4) + ' 2-4 r_h: ' + f(por[0]) + '   4-8 r_h: ' + f(por[1]));
});

/* ── P3: pipeline real con el perfil de producción y con el de Trager ───── */
var CASOS = [[200, 100, 21.5], [406, 50, 21.5], [457, 70, 21.5], [457, 154, 21.5]];
var SIZE = 200;
function corrida(K, D, MAG, sqm, perfilAlt, realization) {
  var pk = R.perfilKing, ak = R.areaKing;
  if (perfilAlt) { R.perfilKing = perfilAlt.perfil; R.areaKing = perfilAlt.area; }
  try {
    var pob = C.poblacionCacheada(K, realization);
    var cielo = { pupilaSalida: D / MAG, pupilaOjo: 7, sqm: sqm, transmision: 0.9, aumentos: MAG, perceptual: true };
    var res = R.pintarCumulo(new Float32Array(SIZE * SIZE), K, { ra0: K.ra, dec0: K.dec, arcmin: Math.ceil(2.4 * pob.rtAs / 60),
      size: SIZE, cielo: cielo, apertura: D, estrellas: [], realization: realization });
    var t = res.tabla, cH = res.cHalo, cp = R.ctxFotometrico(cielo, 2 * K.rh), Fu = cH.Fcielo * cH.Cmin;
    // Nivel en pantalla con t = 1 (halo lineal, #535): sin realce perceptual.
    var dn = function (i) { return R.valorDeFlujo(R.realzarPerceptual(t.I[i] * t.sHalo[i], cp.Fcielo, cp.rango, 1), cp.FcieloPintado, cp.rango); };
    var rU = 0, r1 = 0, DN = [];
    for (var i = 0; i < t.r.length; i++) { if (t.I[i] >= Fu) rU = t.r[i]; DN.push(dn(i)); if (DN[i] >= 1) r1 = t.r[i]; }
    return { t: t, DN: DN, rU: rU, r1: r1, Fu: Fu };
  } finally { R.perfilKing = pk; R.areaKing = ak; }
}
console.log('\n## P3 · pipeline real (halo lineal), producción (K62 Harris) frente a perfil de Trager normalizado a V_t');
console.log("r_exceso: primer radio ≥ 2 r_h donde K62 − Trager (los dos normalizados a V_t) < −0,3 mag; r_umbral: velo ≥ F_u; r_1DN: nivel ≥ 1 DN");
var P3 = {};
SEED.forEach(function (par) {
  var K = ficha(par[0]), clave = par[0].replace('NGC ', 'ngc'), muf = curvaTrager(TRAGER[clave]);
  var pob = C.poblacionCacheada(K, 0), rtAs = pob.rtAs, Ft = Math.pow(10, -0.4 * K.Vt);
  // Perfil alternativo con la firma de perfilKing: forma de Trager, área cerrada para que Σ = forma/área.
  var forma = function (r) { return r >= rtAs ? 0 : Math.pow(10, -0.4 * (muf(r) - muf(0.5))); };
  var Nn = 20000, h = rtAs / Nn, area = 0;
  for (var i = 0; i < Nn; i++) { var a = i * h, b = a + h, m = a + h / 2; area += (forma(a) * a + 4 * forma(m) * m + forma(b) * b) * h / 6; }
  area *= 2 * Math.PI;
  var alt = { perfil: function (r) { return forma(r); }, area: function () { return area / ((K.rc * 60) * (K.rc * 60)); } };
  /* r_exceso: halo exterior (≥ 2 r_h) donde producción va más de 0,3 mag por
     encima de Trager. Los dos con la misma normalización (V_t), como el pipeline.
     Primera versión del arnés buscaba desde r_t hacia dentro y se paraba en el
     truncamiento del King (μ = ∞): corregido, ver la nota. */
  var rEx = null;
  for (var rr = 2 * K.rh * 60; rr < rtAs; rr += 1) {
    if (mag(Ft * pob.sigma(rr)) - mag(Ft * forma(rr) / area) < -0.3) { rEx = rr; break; }
  }
  P3[par[0]] = { rEx: rEx, casos: [] };
  console.log('\n' + par[1] + '  r_exceso = ' + (rEx ? f(rEx / 60) + "'" : 'no hay'));
  CASOS.forEach(function (cs) {
    var A = corrida(K, cs[0], cs[1], cs[2], null, 0), B = corrida(K, cs[0], cs[1], cs[2], alt, 7);
    var maxD = 0, rMax = 0;
    for (var i = 0; i < A.DN.length; i++) { var dd = A.DN[i] - B.DN[i]; if (Math.abs(dd) > Math.abs(maxD)) { maxD = dd; rMax = A.t.r[i]; } }
    var pintaExceso = rEx != null && A.r1 > rEx;
    var maxExt = 0;  // mayor ΔDN (K62 − Trager) en el halo exterior, r ≥ 2 r_h
    for (var j = 0; j < A.DN.length; j++) if (A.t.r[j] >= 2 * K.rh * 60) maxExt = Math.max(maxExt, A.DN[j] - B.DN[j]);
    P3[par[0]].casos.push({ caso: cs, maxD: maxD, rMax: rMax, maxExt: maxExt, pintaExceso: pintaExceso });
    console.log('  ' + (cs[0] + '/' + cs[1] + '×').padEnd(9) + " K62: r_umbral " + f(A.rU / 60) + "' r_1DN " + f(A.r1 / 60) +
      "'  |  Trager: r_umbral " + f(B.rU / 60) + "' r_1DN " + f(B.r1 / 60) + "'  |  máx ΔDN (K62−Trager) " + f(maxD, 1) + ' a ' + f(rMax / 60) + "'" +
      '  |  ΔDN exterior máx ' + f(maxExt, 1) + '  |  pinta dentro del exceso: ' + (pintaExceso ? 'SÍ' : 'no'));
  });
});
