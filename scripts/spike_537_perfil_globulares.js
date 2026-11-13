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
var mediana = function (v) {
  if (!v.length) return NaN;
  v = v.slice().sort(function (a, b) { return a - b; });
  var h = v.length >> 1;
  return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2;
};
var f = function (x, d) { return x === Infinity ? '+∞' : isFinite(x) ? x.toFixed(d == null ? 2 : d) : '—'; };

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

/* Curva muVf de Trager interpolada en log r, solo con nodos de peso > 0 y un
   nodo por radio (media si se repite). Devuelve también el último radio
   medido: más allá no hay datos y no se extrapola aquí (ver formaTrager). */
function curvaTrager(pts) {
  var por = {};
  pts.filter(function (q) { return q.w > 0; }).forEach(function (q) { (por[q.rAs] = por[q.rAs] || []).push(q.muf); });
  var rs = Object.keys(por).map(Number).sort(function (a, b) { return a - b; });
  var lr = rs.map(Math.log10), mf = rs.map(function (r) { return por[r].reduce(function (a, x) { return a + x; }, 0) / por[r].length; });
  function muf(rAs) {
    var x = Math.log10(Math.min(Math.max(rAs, rs[0]), rs[rs.length - 1])), n = lr.length;
    var j = 1; while (j < n - 1 && lr[j] < x) j++;
    var u = (x - lr[j - 1]) / (lr[j] - lr[j - 1]);
    return mf[j - 1] + u * (mf[j] - mf[j - 1]);
  }
  return { muf: muf, rUlt: rs[rs.length - 1] };
}
/* Forma de Trager hasta r_t de Harris, en mag/arcsec² relativas. Más allá del
   último nodo medido se empalma con la caída del K62 de producción: sin datos,
   no se inventa pendiente propia, y el exceso solo se juzga dentro de lo medido. */
var PERFIL_KING = R.perfilKing;  // el original: corrida() sustituye R.perfilKing por esta forma
function formaTrager(tr, rcAs, rtAs) {
  var mK = function (r) { return mag(PERFIL_KING(r, rcAs, rtAs)); };
  return function (r) {
    if (r >= rtAs) return Infinity;
    return r <= tr.rUlt ? tr.muf(r) : tr.muf(tr.rUlt) + mK(r) - mK(tr.rUlt);
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
if (mediana([1, 2, 3, 4]) !== 2.5 || mediana([3, 1, 2]) !== 2) { console.error('FALLA mediana'); process.exit(1); }

/* ── P1 y P2: residuos por tramos de r/r_h ─────────────────────────────── */
var TRAMOS = [[0, 1], [1, 2], [2, 4], [4, 8], [8, 1e9]];
var RES = {};
console.log('\n## P1/P2 · mediana de (modelo − Trager) en mag/arcsec², puntos con peso > 0 y r < r_t(Harris)');
console.log('negativo = modelo más brillante que Trager; +∞ = el modelo ya se truncó. Tramos en r/r_h: ' + TRAMOS.map(function (t) { return t[0] + '-' + (t[1] > 1e8 ? '∞' : t[1]); }).join(' | '));
console.log('Filas «X−T»: solo forma, mediana punto a punto de (X − TrgN) sobre los mismos puntos.');
SEED.forEach(function (par) {
  var K = ficha(par[0]), clave = par[0].replace('NGC ', 'ngc'), pts = TRAGER[clave];
  var pob = C.poblacionCacheada(K, 0), Ft = Math.pow(10, -0.4 * K.Vt), rtAs = pob.rtAs, rhAs = K.rh * 60;
  var tr = curvaTrager(pts), muf = tr.muf;
  // Punto cero: V de integrar muVf hasta el último nodo de Trager.
  var N = 4000, Fint = Math.pow(10, -0.4 * muf(0.5)) * Math.PI * 0.25, lr0 = Math.log10(0.5), lr1 = Math.log10(tr.rUlt);
  for (var i = 0; i < N; i++) { var ra = Math.pow(10, lr0 + (lr1 - lr0) * i / N), rb = Math.pow(10, lr0 + (lr1 - lr0) * (i + 1) / N);
    Fint += 0.5 * (Math.pow(10, -0.4 * muf(ra)) * ra + Math.pow(10, -0.4 * muf(rb)) * rb) * (rb - ra) * 2 * Math.PI; }
  var w = pts.filter(function (q) { return q.w > 0 && q.rAs < rtAs; });
  var cand = { K62: function (r) { return mag(Ft * pob.sigma(r)); } };
  var mv = MVDM[par[0]] || {};
  ['K', 'W'].forEach(function (m) {
    if (!mv[m]) return;
    var mod = modeloDinamico(mv[m].W0, m === 'W'), r0 = mv[m].r0As, rtM = mod.rt * r0;
    var sN = normalizar(function (r) { return mod.sigma(r / r0); }, rtM);
    cand[m === 'K' ? 'K66' : 'Wil'] = function (r) { return mag(Ft * sN(r)); };
  });
  var fT = formaTrager(tr, K.rc * 60, rtAs);
  var sT = normalizar(function (r) { return Math.pow(10, -0.4 * fT(r)); }, rtAs);
  cand.TrgN = function (r) { return mag(Ft * sT(r)); };
  var fila = { rt: rtAs / 60, rUlt: tr.rUlt / 60, rUltRh: tr.rUlt / rhAs, Vtr: mag(Fint), tramos: {}, forma: {} };
  TRAMOS.forEach(function (t, j) {
    var q = w.filter(function (q) { return q.rAs >= t[0] * rhAs && q.rAs < t[1] * rhAs; });
    Object.keys(cand).forEach(function (k) {
      (fila.tramos[k] = fila.tramos[k] || [])[j] = { n: q.length, m: mediana(q.map(function (x) { return cand[k](x.rAs) - x.mu; })) };
      if (k !== 'TrgN') (fila.forma[k] = fila.forma[k] || [])[j] = { n: q.length, m: mediana(q.map(function (x) { return cand[k](x.rAs) - cand.TrgN(x.rAs); })) };
    });
  });
  RES[par[0]] = fila;
  console.log('\n' + par[1] + ' (' + par[0] + ')  c=' + K.c + '  r_t=' + f(fila.rt, 1) + "'  r_h=" + K.rh + "'  último nodo de Trager con peso: " + f(fila.rUlt, 1) + "' (" + f(fila.rUltRh, 1) + ' r_h)');
  console.log('  V integrando muVf = ' + f(fila.Vtr) + '  frente V_t Harris = ' + K.Vt + '  (Δ ' + f(fila.Vtr - K.Vt) + ')');
  if (mv.K) console.log('  χ² MvdM05: K66 ' + mv.K.chi2 + '  Wilson ' + (mv.W ? mv.W.chi2 : '—'));
  Object.keys(fila.tramos).forEach(function (k) {
    console.log('  ' + k.padEnd(7) + fila.tramos[k].map(function (t) { return (t.n ? f(t.m) : '—').padStart(6) + ' (' + t.n + ')'; }).join(' '));
  });
  Object.keys(fila.forma).forEach(function (k) {
    console.log('  ' + (k + '−T').padEnd(7) + fila.forma[k].map(function (t) { return (t.n ? f(t.m) : '—').padStart(6) + ' (' + t.n + ')'; }).join(' '));
  });
});

/* Resumen de P2: por candidato, mediana entre globulares de |modelo − TrgN| en
   los tramos exteriores (2-4 y 4-8 r_h) con n ≥ 3. Solo globulares con ajuste de MvdM05. */
console.log('\n## P2 · resumen: mediana entre globulares de |modelo − TrgN| (solo forma), tramos 2-4 y 4-8 r_h con n ≥ 3');
['K62', 'K66', 'Wil'].forEach(function (k) {
  var por = [2, 3].map(function (j) {
    var v = Object.keys(RES).filter(function (id) { return RES[id].forma.Wil; }).map(function (id) {
      var t = RES[id].forma[k][j]; return t.n >= 3 ? Math.abs(t.m) : NaN; }).filter(function (x) { return !isNaN(x); });
    return mediana(v) + ' (' + v.length + ' GC)';
  });
  console.log('  ' + k.padEnd(4) + ' 2-4 r_h: ' + por[0].replace(/(\d\.\d\d)\d*/, '$1') + '   4-8 r_h: ' + por[1].replace(/(\d\.\d\d)\d*/, '$1'));
});

/* ── P3: pipeline real con el perfil de producción y con el de Trager ───── */
var CASOS = [[200, 100, 21.5], [406, 50, 21.5], [457, 70, 21.5], [457, 154, 21.5]];
var SIZE = 200;
/* El perfil alternativo entra sustituyendo R.perfilKing/R.areaKing. La población
   se cachea por id: la alternativa va con un id propio para no pisar la de
   producción. Ojo: esa entrada de caché queda con la normalización de Trager y
   la forma King una vez restaurado perfilKing; no se reutiliza fuera de corrida(). */
function corrida(K, D, MAG, sqm, perfilAlt) {
  var pk = R.perfilKing, ak = R.areaKing;
  if (perfilAlt) { R.perfilKing = perfilAlt.perfil; R.areaKing = perfilAlt.area; }
  try {
    var pob = C.poblacionCacheada(K, 0);
    var cielo = { pupilaSalida: D / MAG, pupilaOjo: 7, sqm: sqm, transmision: 0.9, aumentos: MAG, perceptual: true };
    var res = R.pintarCumulo(new Float32Array(SIZE * SIZE), K, { ra0: K.ra, dec0: K.dec, arcmin: Math.ceil(2.4 * pob.rtAs / 60),
      size: SIZE, cielo: cielo, apertura: D, estrellas: [], realization: 0 });
    var t = res.tabla, cH = res.cHalo, cp = R.ctxFotometrico(cielo, 2 * K.rh), Fu = cH.Fcielo * cH.Cmin;
    // Halo lineal (#535): t = 1, sin realce perceptual, así que el nivel es valorDeFlujo a secas.
    var rU = 0, r1 = 0, DN = [];
    for (var i = 0; i < t.r.length; i++) {
      DN.push(R.valorDeFlujo(t.I[i] * t.sHalo[i], cp.FcieloPintado, cp.rango));
      if (t.I[i] >= Fu) rU = t.r[i];
      if (DN[i] >= 1) r1 = t.r[i];
    }
    return { r: t.r, DN: DN, rU: rU, r1: r1 };
  } finally { R.perfilKing = pk; R.areaKing = ak; }
}
/* Perfil alternativo con la firma de perfilKing a partir de una Σ relativa
   cualquiera, truncado en el r_t de Harris (la tabla de pintarCumulo acaba ahí)
   y con el área cerrada numéricamente. */
function perfilDesde(sig, rcAs, rtAs) {
  var forma = function (r) { return r >= rtAs ? 0 : sig(r); };
  var Nn = 20000, h = rtAs / Nn, area = 0;
  for (var i = 0; i < Nn; i++) { var a = i * h, b = a + h, m = a + h / 2; area += (forma(a) * a + 4 * forma(m) * m + forma(b) * b) * h / 6; }
  area *= 2 * Math.PI;
  return { perfil: forma, area: function () { return area / (rcAs * rcAs); }, sigma: function (r) { return forma(r) / area; } };
}

console.log('\n## P3 · pipeline real (halo lineal), producción (K62 Harris) frente a perfil de Trager normalizado a V_t');
console.log("r_exceso: primer radio ≥ 2 r_h, dentro de lo medido por Trager, desde el que K62 − TrgN < −0,3 mag en TODO un tramo de 0,1 dex; r_umbral: velo ≥ F_u; r_1DN: nivel ≥ 1 DN");
console.log('ΔDN≥rEx: mayor exceso de K62 sobre Trager desde r_exceso; franja: r_1DN(K62) − r_exceso, en pasos de la tabla radial');
var P3B = [];
SEED.forEach(function (par) {
  var K = ficha(par[0]), clave = par[0].replace('NGC ', 'ngc'), tr = curvaTrager(TRAGER[clave]);
  var pob = C.poblacionCacheada(K, 0), rtAs = pob.rtAs, Ft = Math.pow(10, -0.4 * K.Vt), rhAs = K.rh * 60, rcAs = K.rc * 60;
  var fT = formaTrager(tr, rcAs, rtAs);
  var alts = { Trg: perfilDesde(function (r) { return Math.pow(10, -0.4 * (fT(r) - fT(0.5))); }, rcAs, rtAs) };
  var mv = MVDM[par[0]] || {};
  ['K', 'W'].forEach(function (m) {
    if (!mv[m]) return;
    var mod = modeloDinamico(mv[m].W0, m === 'W'), r0 = mv[m].r0As;
    alts[m === 'K' ? 'K66' : 'Wil'] = perfilDesde(function (r) { return mod.sigma(r / r0); }, rcAs, rtAs);
  });
  var resid = function (r) { return mag(pob.sigma(r)) - mag(alts.Trg.sigma(r)); };
  var rEx = null, hasta = Math.min(rtAs, tr.rUlt);
  for (var rr = 2 * rhAs; rr * 1.259 <= hasta && rEx == null; rr *= 1.01) {
    var sostenido = true;
    for (var x = rr; x <= rr * 1.259; x *= 1.01) if (!(resid(x) < -0.3)) { sostenido = false; break; }
    if (sostenido) rEx = rr;
  }
  console.log('\n' + par[1] + '  r_exceso = ' + (rEx ? f(rEx / 60) + "'" : 'no hay'));
  var err = {};  // por modelo: máximo entre equipos de |DN(modelo) − DN(Trager)|
  CASOS.forEach(function (cs) {
    var A = corrida(K, cs[0], cs[1], cs[2], null), R_ = {};
    Object.keys(alts).forEach(function (k) { R_[k] = corrida(Object.assign({}, K, { id: K.id + '·' + k }), cs[0], cs[1], cs[2], alts[k]); });
    var B = R_.Trg, paso = A.r[1] - A.r[0];
    var maxExt = 0, maxEx = 0, maxInt = 0, rInt = 0;
    for (var j = 0; j < A.DN.length; j++) {
      var d = A.DN[j] - B.DN[j];
      if (A.r[j] >= 2 * rhAs) maxExt = Math.max(maxExt, d);
      else if (Math.abs(d) > Math.abs(maxInt)) { maxInt = d; rInt = A.r[j]; }
      if (rEx != null && A.r[j] >= rEx) maxEx = Math.max(maxEx, d);
    }
    var mods = { K62: A }; Object.keys(R_).forEach(function (k) { if (k !== 'Trg') mods[k] = R_[k]; });
    Object.keys(mods).forEach(function (k) {
      var e = 0; for (var j = 0; j < B.DN.length; j++) e = Math.max(e, Math.abs(mods[k].DN[j] - B.DN[j]));
      err[k] = Math.max(err[k] || 0, e);
      (err[k + '_r1'] = err[k + '_r1'] || []).push(mods[k].r1 / 60);
    });
    var pinta = rEx != null && A.r1 > rEx;
    console.log('  ' + (cs[0] + '/' + cs[1] + '×').padEnd(9) + " K62: r_umbral " + f(A.rU / 60) + "' r_1DN " + f(A.r1 / 60) +
      "'  |  Trager: r_umbral " + f(B.rU / 60) + "' r_1DN " + f(B.r1 / 60) + "'  |  ΔDN exterior máx " + f(maxExt, 1) +
      '  |  ΔDN≥rEx ' + (rEx != null ? f(maxEx, 1) : '—') + '  |  franja ' + (rEx != null ? f((A.r1 - rEx) / paso, 1) : '—') +
      '  |  ΔDN interior (< 2 r_h) ' + f(maxInt, 1) + ' a ' + f(rInt / 60) + "'  |  pinta dentro del exceso: " + (pinta ? 'SÍ' : 'no'));
  });
  var fila = { gc: par[1], chiMejor: mv.K && mv.W ? (mv.K.chi2 <= mv.W.chi2 ? 'K66' : 'Wil') : null };
  ['K62', 'K66', 'Wil'].forEach(function (k) { if (err[k] != null) fila[k] = err[k]; });
  P3B.push(fila);
  console.log('  máx |DN − DN(Trager)| entre equipos: ' + ['K62', 'K66', 'Wil'].filter(function (k) { return err[k] != null; })
    .map(function (k) { return k + ' ' + f(err[k], 1) + " (r_1DN " + err[k + '_r1'].map(function (x) { return f(x); }).join('/') + "')"; }).join('  ') +
    "  · Trager r_1DN " + CASOS.map(function () { return ''; }).join('') + (fila.chiMejor ? '  · χ² MvdM05 elige ' + fila.chiMejor : ''));
});

console.log('\n## P3b · qué perfil se acerca más a Trager en el pipeline: máx |DN − DN(Trager)| entre los cuatro equipos');
console.log('GC    K62    K66    Wil   χ²→  mejor');
P3B.forEach(function (x) {
  var c = ['K62', 'K66', 'Wil'].filter(function (k) { return x[k] != null; });
  var mejor = c.reduce(function (a, b) { return x[b] < x[a] ? b : a; });
  console.log(x.gc.padEnd(5) + ['K62', 'K66', 'Wil'].map(function (k) { return (x[k] != null ? f(x[k], 1) : '—').padStart(6); }).join(' ') +
    '   ' + (x.chiMejor || '—').padEnd(4) + ' ' + mejor + (x.chiMejor ? '  (χ² da ' + f(x[x.chiMejor], 1) + ')' : ''));
});
