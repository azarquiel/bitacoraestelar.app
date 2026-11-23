/* #614 · Flujo G de Gaia contra la suma de vecinas en HST (ADR 0039, «Mezclas o
   completitud baja (#614)»). Coordenadas en segundos de arco en el plano
   tangente; magnitudes G. Solo lo usa el spike: producción no lo toca.

   Q1 = flujo Gaia / flujo de la estrella HST más brillante a ≤ R
   Qs = flujo Gaia / suma del flujo HST a ≤ R
   (b) pura: una estrella por fila, Q1 ≈ 1. (a) mezclas: Q1 > 1, Qs ≈ 1. */
'use strict';

// Fabricius et al. 2021 §2.3: por debajo de 0,4″ el 74 % de los pares son
// soluciones 2p (Gaia no los separa). Fijado antes de medir; no se ajusta.
var R_AS = 0.4;
// Listón entre (b) pura (1,00) y la (a) que explica el R2v 1,267 de #595 en ≤1.
var T = 1.10;

function flujo(g) { return Math.pow(10, -0.4 * g); }

function indice(hst, lado) {
  var m = new Map();
  hst.forEach(function (s) {
    var k = Math.floor(s.x / lado) + ',' + Math.floor(s.y / lado);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(s);
  });
  return { m: m, lado: lado };
}

function vecinas(p, idx, r) {
  var out = [], cx = Math.floor(p.x / idx.lado), cy = Math.floor(p.y / idx.lado);
  var n = Math.ceil(r / idx.lado);
  for (var i = -n; i <= n; i++) for (var j = -n; j <= n; j++) {
    (idx.m.get((cx + i) + ',' + (cy + j)) || []).forEach(function (s) {
      if (Math.hypot(s.x - p.x, s.y - p.y) <= r) out.push(s);
    });
  }
  return out;
}

// p = {x, y, g} de Gaia; estrellas HST con g ya transformada.
function cocientes(p, idx, r) {
  var v = vecinas(p, idx, r);
  if (!v.length) return null;
  var fmax = 0, fsum = 0;
  v.forEach(function (s) { var f = flujo(s.g); fsum += f; if (f > fmax) fmax = f; });
  var fg = flujo(p.g);
  return { q1: fg / fmax, qs: fg / fsum, n: v.length };
}

function mediana(a) {
  var s = a.slice().sort(function (x, y) { return x - y; }), n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

/* Desplazamiento HST → Gaia: mediana de (Gaia − HST) entre parejas a ≤ 1″,
   dos pasadas (la segunda a ≤ 0,1″ ya corregida). Basta para M13: la rotación
   de ACS la resuelve el WCS del catálogo, el resto es punto cero.
   shortcut: solo traslación, pasar a ajuste afín si el residuo crece con el radio. */
function alinear(gaia, hst) {
  var dx = 0, dy = 0;
  [1.0, 0.1].forEach(function (r) {
    var idx = indice(hst.map(function (s) { return { x: s.x + dx, y: s.y + dy, s: s }; }), r);
    var ex = [], ey = [];
    gaia.forEach(function (p) {
      var v = vecinas(p, idx, r);
      if (v.length !== 1) return;   // solo parejas sin ambigüedad
      ex.push(p.x - v[0].s.x); ey.push(p.y - v[0].s.y);
    });
    if (ex.length < 10) throw new Error('alinear: ' + ex.length + ' parejas a ≤ ' + r + '″');
    dx = mediana(ex); dy = mediana(ey);
  });
  return { dx: dx, dy: dy };
}

/* G − V = a + b(V−I) + c(V−I)², mínimos cuadrados sobre parejas de control.
   Arenou et al. 2018 §3.2: transformación ajustada por cúmulo con estrellas
   del propio campo (evita metalicidad y extinción). */
function ajustarG(pares) {
  var S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], B = [0, 0, 0];
  pares.forEach(function (p) {
    var c = p.v - p.i, f = [1, c, c * c], y = p.g - p.v;
    for (var i = 0; i < 3; i++) { B[i] += f[i] * y; for (var j = 0; j < 3; j++) S[i][j] += f[i] * f[j]; }
  });
  // Gauss sin pivoteo: 3×3 bien condicionada para colores 0-2.
  for (var k = 0; k < 3; k++) for (var i = k + 1; i < 3; i++) {
    var m = S[i][k] / S[k][k];
    for (var j = k; j < 3; j++) S[i][j] -= m * S[k][j];
    B[i] -= m * B[k];
  }
  var x = [0, 0, 0];
  for (i = 2; i >= 0; i--) {
    var s = B[i];
    for (j = i + 1; j < 3; j++) s -= S[i][j] * x[j];
    x[i] = s / S[i][i];
  }
  return { a: x[0], b: x[1], c: x[2], g: function (v, i) { var c = v - i; return v + x[0] + x[1] * c + x[2] * c * c; } };
}

/* Mediana de Q1 con intervalo bootstrap del 95 % (2σ). (a) si todo el
   intervalo queda sobre T; (b) si queda debajo; si no, inconcluso. */
function veredicto(q1, nboot) {
  nboot = nboot || 1000;
  var s = 1, n = q1.length, meds = [];
  function azar() { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }
  for (var b = 0; b < nboot; b++) {
    var m = new Array(n);
    for (var k = 0; k < n; k++) m[k] = q1[Math.floor(azar() * n)];
    meds.push(mediana(m));
  }
  meds.sort(function (x, y) { return x - y; });
  var lo = meds[Math.floor(0.025 * nboot)], hi = meds[Math.ceil(0.975 * nboot) - 1];
  return { mediana: mediana(q1), lo: lo, hi: hi, lectura: lo > T ? 'a' : hi < T ? 'b' : 'inconcluso' };
}

module.exports = { R_AS: R_AS, T: T, indice: indice, cocientes: cocientes, alinear: alinear,
  ajustarG: ajustarG, veredicto: veredicto, mediana: mediana };
