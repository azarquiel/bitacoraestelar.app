#!/usr/bin/env node
/* Spike #542 — prototipo DESECHABLE del ADR 0039 (prerregistro en
   simulador_ocular/docs/adr/0039-la-fusion-del-blending-en-globulares.md §0).

   No toca producción. Lee de ella la población (Capa 1), la tabla radial del
   render y los contextos fotométricos (ADR 0008); el código nuevo es solo la
   partición de la pregunta 4 y los dos agrupamientos de la pregunta 2.

   Imprime flujos, residuos, razones y magnitudes. NUNCA cuentas de estrellas
   dibujadas: el ADR prohíbe usarlas como argumento.

   node scripts/harness_fusion_blending.js [--sqm N] [--D mm] [--mag N] */
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
var SQM = arg('sqm', 21), D = arg('D', 467), MAG = arg('mag', 173), PROC = 720;
var ARCMIN = 0.47 * 60;

var e = global.window.BITACORA_GLOBULARES.filter(function (f) { return f[0] === 'NGC 6205'; })[0];
var M13 = { id: e[0], ra: e[2], dec: e[3], rc: e[4], rh: e[5], c: e[6], muV0: e[7],
            Vt: e[8], dkpc: e[9], ebv: e[10], feh: e[11], elip: e[12], pa: null, trager: e[13] || null };
var rhAs = M13.rh * 60;

var gaia = fs.readFileSync(path.join(__dirname, '../simulador_ocular/docs/validacion/m13_gaia_dr3.csv'), 'utf8')
  .trim().split('\n').slice(1).map(function (l) {
    var c = l.split(',');
    return [+c[0], +c[1], +c[2], c[3] === '' ? null : +c[3]];
  });

/* --banda V: DIAGNÓSTICO del criterio 3, no cambia el listón ni la convención
   prerregistrada (G tratada como V, la de producción). Convierte G a V con el
   polinomio de Gaia EDR3 (doc. CU5, tabla 5.7, Riello et al. 2021; σ = 0,030
   mag, válido −0,5 < BP−RP < 5). Sin color, la fila se queda en G. */
var BANDA_V = process.argv.indexOf('--banda') > 0 && process.argv[process.argv.indexOf('--banda') + 1] === 'V';
function magV(g) {
  var x = g[3];
  if (!BANDA_V || x == null || !(x > -0.5 && x < 5)) return g[2];
  return g[2] - (-0.02704 + 0.01424 * x - 0.2156 * x * x + 0.01426 * x * x * x);
}

var cielo = { pupilaSalida: D / MAG, pupilaOjo: 7, sqm: SQM, transmision: 0.9,
              aumentos: MAG, perceptual: true };
var res = R.pintarCumulo(new Float32Array(PROC * PROC), M13, {
  ra0: M13.ra, dec0: M13.dec, arcmin: ARCMIN, size: PROC, cielo: cielo, apertura: D, estrellas: []
});
var pob = res.poblacion, tabla = res.tabla;
var TH = C.config.thetaSepRadios * res.radioImagenAs;      // θ_sep, arcsec

/* Lectura de la tabla radial del render: la misma interpolación que mResEn
   (no exportada). Es leer una tabla, no reimplementar la ley del cielo. */
function mResEn(rAs) {
  var ult = tabla.r.length - 1;
  if (!(rAs >= 0) || rAs >= tabla.r[ult]) return Infinity;
  var u = rAs / tabla.paso, i = Math.floor(u), t = u - i;
  var a = tabla.mRes[i], b = tabla.mRes[i + 1];
  if (!isFinite(a)) return b;
  if (!isFinite(b)) return a;
  return a * (1 - t) + b * t;
}

/* ── La partición de la pregunta 4 ─────────────────────────────────────────
   Velo analítico = LF × perfil × (1 − completitud): solo lo que el catálogo no
   trae. Código NUEVO del prototipo: el S1campo de producción no lleva c(m,r). */
var mAp = pob.magnitudes, num = pob.estrellasPorBin, NB = mAp.length;
var fB = new Float64Array(NB);
for (var b = 0; b < NB; b++) fB[b] = Math.pow(10, -0.4 * mAp[b]);
function momentos(rAs) {          // por arcsec²: V1, V2, S2 total, parte catalogada de S2
  var s = pob.sigma(rAs), v1 = 0, v2 = 0, s2 = 0, s2c = 0;
  for (var k = 0; k < NB; k++) {
    var c = pob.completitud(mAp[k], rAs), w = num[k];
    v1 += w * fB[k] * (1 - c);
    v2 += w * fB[k] * fB[k] * (1 - c);
    s2 += w * fB[k] * fB[k];
    s2c += w * fB[k] * fB[k] * c;
  }
  return { v1: s * v1, v2: s * v2, s2: s * s2, s2c: s * s2c };
}
var cacheMom = {};
function mom(rAs) {               // cuantizado a 0,05″: el perfil no cambia a esa escala
  var k = Math.round(rAs * 20);
  return cacheMom[k] || (cacheMom[k] = momentos(k / 20));
}

var ANILLOS = [0, 0.25, 0.5, 1, 2, 4, 8].map(function (f) { return f * rhAs; });
var NA = ANILLOS.length - 1;
var ETQ = ['≤0,25', '≤0,5', '≤1', '≤2', '≤4', '≤8'];
function anillo(rAs) {
  for (var k = 0; k < NA; k++) if (rAs <= ANILLOS[k + 1]) return k;
  return -1;
}
/* ∫ g dΩ sobre un anillo circular (M13 de Harris sin PA: radioPropio es
   circular en r). Trapecios, 2000 tramos. */
function integralAnillo(k, g) {
  var r0 = ANILLOS[k], r1 = Math.min(ANILLOS[k + 1], pob.rtAs), N = 2000, h = (r1 - r0) / N, s = 0;
  for (var i = 0; i <= N; i++) {
    var r = r0 + i * h, w = (i === 0 || i === N) ? 0.5 : 1;
    s += w * g(r) * 2 * Math.PI * r;
  }
  return s * h;
}
function campo(nombre) { return function (r) { return mom(r)[nombre]; }; }

/* ── Catálogo en el plano del cielo ───────────────────────────────────────── */
var cos0 = Math.cos(M13.dec * Math.PI / 180);
var est = [];
gaia.forEach(function (g) {
  var x = (((g[0] - M13.ra + 540) % 360) - 180) * cos0 * 3600, y = (g[1] - M13.dec) * 3600;
  var r = pob.radioPropio(x, y);
  if (!(r < pob.rtAs) || anillo(r) < 0) return;
  var m = magV(g);
  est.push({ ra: g[0], dec: g[1], x: x, y: y, r: r, m: m, F: Math.pow(10, -0.4 * m) });
});

function celda(x, y, lado) { return Math.floor(x / lado) + ',' + Math.floor(y / lado); }
function centroCelda(key, lado) {
  var p = key.split(',');
  return { x: (+p[0] + 0.5) * lado, y: (+p[1] + 0.5) * lado };
}

/* ── (a) friends-of-friends con enlace θ_sep ──────────────────────────────── */
function fof(lista, enlace) {
  var padre = lista.map(function (_, i) { return i; });
  function raiz(i) { while (padre[i] !== i) { padre[i] = padre[padre[i]]; i = padre[i]; } return i; }
  var rejilla = {};
  lista.forEach(function (s, i) {
    var k = celda(s.x, s.y, enlace);
    (rejilla[k] = rejilla[k] || []).push(i);
  });
  lista.forEach(function (s, i) {
    var cx = Math.floor(s.x / enlace), cy = Math.floor(s.y / enlace);
    for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
      var v = rejilla[(cx + dx) + ',' + (cy + dy)];
      if (!v) continue;
      for (var q = 0; q < v.length; q++) {
        var j = v[q];
        if (j <= i) continue;
        var ddx = lista[j].x - s.x, ddy = lista[j].y - s.y;
        if (ddx * ddx + ddy * ddy < enlace * enlace) {
          var a = raiz(i), b2 = raiz(j);
          if (a !== b2) padre[a] = b2;
        }
      }
    }
  });
  var grupos = {};
  lista.forEach(function (_, i) { var r0 = raiz(i); (grupos[r0] = grupos[r0] || []).push(i); });
  return Object.keys(grupos).map(function (k) { return grupos[k]; });
}

/* Libro de flujos de una ley: dónde acaba la luz catalogada (D + U). El velo
   analítico es el mismo término a los dos lados de T y P, así que el residuo
   mide la contabilidad del catálogo (prerregistro §0). */
function libro() { return { celda: {}, anillo: new Float64Array(NA) }; }
function apunta(L, x, y, F) {
  var k = celda(x, y, TH);
  L.celda[k] = (L.celda[k] || 0) + F;
  var a = anillo(pob.radioPropio(x, y));
  if (a >= 0) L.anillo[a] += F;
}

// Verdad T (parte catalogada): cada estrella en su posición.
var T = libro();
est.forEach(function (s) { apunta(T, s.x, s.y, s.F); });

// (a) FoF: el blob dibujado se apunta en su centroide.
var grupos = fof(est, TH);
var A = libro(), flujoDibujadoA = 0, flujoMovidoA = 0, extensionMax = 0, cadenas = 0, multiples = 0;
grupos.forEach(function (g) {
  var F = 0, sx = 0, sy = 0;
  g.forEach(function (i) { F += est[i].F; sx += est[i].F * est[i].x; sy += est[i].F * est[i].y; });
  var xc = sx / F, yc = sy / F, mB = -2.5 * Math.log10(F);
  if (g.length > 1) {
    multiples++;
    var ext = 0;
    g.forEach(function (i) { ext = Math.max(ext, Math.hypot(est[i].x - xc, est[i].y - yc)); });
    extensionMax = Math.max(extensionMax, ext);
    if (2 * ext > TH) cadenas++;     // el grupo es más ancho que un elemento de resolución
  }
  if (mB <= mResEn(pob.radioPropio(xc, yc))) {
    apunta(A, xc, yc, F);
    flujoDibujadoA += F;
    var kc = celda(xc, yc, TH);
    g.forEach(function (i) { if (celda(est[i].x, est[i].y, TH) !== kc) flujoMovidoA += est[i].F; });
  } else {
    g.forEach(function (i) { apunta(A, est[i].x, est[i].y, est[i].F); });
  }
});

// (b) imagen sumada: ninguna luz se mueve. Identidad, no evidencia (§0).
var Bl = libro();
est.forEach(function (s) { apunta(Bl, s.x, s.y, s.F); });

// Producción hoy (ADR 0012 A): lo que no se dibuja va repartido por el anillo.
// Se mide con el MISMO criterio, no se usa como verdad.
var P0 = libro(), perdidoAnillo = new Float64Array(NA);
est.forEach(function (s) {
  var dibuja = s.m <= mResEn(s.r) &&
    C.sorteo(s.ra, s.dec, 0) < pob.aCrowd(s.m, s.r, res.radioImagenAs);
  if (dibuja) apunta(P0, s.x, s.y, s.F); else perdidoAnillo[anillo(s.r)] += s.F;
});
var areaAnillo = [];
for (var k = 0; k < NA; k++) {
  var r1 = Math.min(ANILLOS[k + 1], pob.rtAs);
  areaAnillo[k] = Math.PI * (r1 * r1 - ANILLOS[k] * ANILLOS[k]);
  P0.anillo[k] += perdidoAnillo[k];
}

/* ── Criterio 2: residuos por anillo y por celda ──────────────────────────── */
var V1an = [];
for (k = 0; k < NA; k++) V1an[k] = integralAnillo(k, campo('v1'));
function residuos(L, repartoAnillo) {
  var porAnillo = [];
  for (var q = 0; q < NA; q++) {
    var t = T.anillo[q] + V1an[q], p = L.anillo[q] + V1an[q];
    porAnillo.push(Math.abs(p - t) / t);
  }
  var max = 0, malas = 0, total = 0, claves = {};
  Object.keys(T.celda).forEach(function (c) { claves[c] = 1; });
  Object.keys(L.celda).forEach(function (c) { claves[c] = 1; });
  Object.keys(claves).forEach(function (key) {
    var cc = centroCelda(key, TH), rc = pob.radioPropio(cc.x, cc.y), a = anillo(rc);
    var v = (rc < pob.rtAs) ? mom(rc).v1 * TH * TH : 0;
    var extra = (repartoAnillo && a >= 0) ? repartoAnillo[a] * TH * TH / areaAnillo[a] : 0;
    var t = (T.celda[key] || 0) + v, p = (L.celda[key] || 0) + extra + v;
    if (!(t > 0)) return;
    var r = Math.abs(p - t) / t;
    total++;
    if (r >= 1e-6) malas++;
    if (r > max) max = r;
  });
  return { anillo: porAnillo, max: max, malas: malas, total: total };
}

function e1(x) { return x.toExponential(1).padStart(9); }
console.log('M13 · D=' + D + 'mm  M=' + MAG + 'x  SQM=' + SQM + '  θ_sep=' + TH.toFixed(3) +
            '"  filas del catálogo dentro de 8 r_h: ' + est.length);
console.log('\n── Criterio 2: |P − T| / T  (listón < 1e-6 en cada anillo y en cada celda)');
console.log('ley            ' + ETQ.map(function (s) { return s.padStart(9); }).join('') +
            '   peor celda  celdas ≥1e-6');
[['(b) imagen', Bl, null], ['(a) FoF', A, null], ['prod. 0012A', P0, perdidoAnillo]].forEach(function (t3) {
  var r = residuos(t3[1], t3[2]);
  var pasa = r.max < 1e-6 && r.anillo.every(function (x) { return x < 1e-6; });
  console.log(t3[0].padEnd(15) + r.anillo.map(e1).join('') + e1(r.max).padStart(12) +
              ('  ' + r.malas + '/' + r.total).padStart(14) + '  ' + (pasa ? 'PASA' : 'NO PASA'));
});
var Fcat = 0; est.forEach(function (s) { Fcat += s.F; });
console.log('(a) flujo catalogado que acaba en blobs dibujados: ' + (100 * flujoDibujadoA / Fcat).toFixed(2) +
            ' %; el que sale de la celda de su estrella: ' + (100 * flujoMovidoA / Fcat).toFixed(3) + ' % del catálogo');
console.log('(a) el grupo múltiple más ancho mide ' + (2 * extensionMax / TH).toFixed(2) +
            ' θ_sep; ' + (100 * cadenas / Math.max(1, multiples)).toFixed(1) +
            ' % de los grupos múltiples son más anchos que θ_sep (cadenas)');

/* Diagnóstico ADR 0003, NO es el criterio 2: catálogo + velo contra el flujo
   del modelo. Puede fallar (banda G/V, estrellas de campo, realización); el
   residuo se registra, no se corrige. */
console.log('\n── Diagnóstico ADR 0003 (no es criterio): (ΣF_cat + ∫V1) / ∫Σ·S1_total por anillo');
var S1tot = 0; for (b = 0; b < NB; b++) S1tot += num[b] * fB[b];
var fila = '               ';
for (k = 0; k < NA; k++) {
  var modelo = integralAnillo(k, function (r) { return pob.sigma(r) * S1tot; });
  fila += ((T.anillo[k] + V1an[k]) / modelo).toFixed(3).padStart(9);
}
console.log(fila);

/* ── Criterio 3: el grano no cuenta dos veces la luz catalogada ───────────── */
console.log('\n── Criterio 3: R2 = (∫V2 + ΣF_j²) / ∫Σ·S2_total  (listón R2 ≤ 1 + 2σ)');
console.log('banda del catálogo: ' + (BANDA_V ? 'V (diagnóstico, G→V EDR3)' : 'G tratada como V (prerregistrada)'));
console.log('anillo       R2       σ    1+2σ  veredicto     S2·c/S2   F²máx/ΣF²   m más brillante');
for (k = 0; k < NA; k++) {
  var v2 = integralAnillo(k, campo('v2')), s2 = integralAnillo(k, campo('s2')), s2c = integralAnillo(k, campo('s2c'));
  var f2 = 0, f4 = 0, fmax = 0;
  est.forEach(function (s) {
    if (anillo(s.r) !== k) return;
    f2 += s.F * s.F; f4 += Math.pow(s.F, 4); fmax = Math.max(fmax, s.F);
  });
  var R2 = (v2 + f2) / s2, sd = Math.sqrt(f4) / s2;
  console.log(ETQ[k].padEnd(8) + R2.toFixed(3).padStart(8) + sd.toFixed(3).padStart(8) +
              (1 + 2 * sd).toFixed(3).padStart(8) + (R2 <= 1 + 2 * sd ? '  PASA' : '  NO PASA').padEnd(14) +
              (100 * s2c / s2).toFixed(1).padStart(7) + ' %' + (100 * fmax * fmax / f2).toFixed(1).padStart(10) + ' %' +
              (-2.5 * Math.log10(fmax)).toFixed(2).padStart(12));
}

/* ── Preguntas 5 y 6: el fondo local a la escala de integración del ojo ──── */
var L5 = res.thGranoAs, Fcielo = res.cHalo.Fcielo, CminG = res.cGrano.Cmin;
function mResLocal(I) {
  var m = R.magLimite({ apertura: D, aumentos: MAG, transmision: 0.9,
                        sqm: -2.5 * Math.log10(Fcielo + I), pupilaOjo: 7 });
  return m == null ? -Infinity : m;
}
// Luz no resuelta: catalogadas bajo m_res (aprox. de la detección de (b)) más V1.
var noRes = {}, radialNoRes = {};
est.forEach(function (s) {
  if (s.m <= mResEn(s.r)) return;
  var kc = celda(s.x, s.y, L5); noRes[kc] = (noRes[kc] || 0) + s.F;
  var kr = Math.floor(s.r / L5); radialNoRes[kr] = (radialNoRes[kr] || 0) + s.F;
});
var p5 = []; for (k = 0; k < NA; k++) p5.push({ dm: [], d: [] });
var nx = Math.ceil(ANILLOS[NA] / L5);
for (var ix = -nx; ix < nx; ix++) for (var iy = -nx; iy < nx; iy++) {
  var xc = (ix + 0.5) * L5, yc = (iy + 0.5) * L5, rc = pob.radioPropio(xc, yc), a = anillo(rc);
  if (a < 0 || !(rc < pob.rtAs)) continue;
  var Iloc = (noRes[ix + ',' + iy] || 0) / (L5 * L5) + mom(rc).v1;
  var kr2 = Math.floor(rc / L5), r0 = kr2 * L5, r1c = r0 + L5;
  var Irad = (radialNoRes[kr2] || 0) / (Math.PI * (r1c * r1c - r0 * r0)) + mom(rc).v1;
  p5[a].dm.push(Math.abs(mResLocal(Iloc) - mResLocal(Irad)));
  p5[a].d.push((Iloc - Irad) / (Fcielo + Irad));
}
function p95(v) { var s = v.slice().sort(function (x, y) { return x - y; }); return s[Math.floor(0.95 * (s.length - 1))]; }
console.log('\n── Pregunta 5: |m_res(x,y) − m_res(r)| a la escala ' + L5.toFixed(1) + '" (listón p95 < 0,1 mag)');
console.log('── Pregunta 6: contraste RMS de la luz no resuelta δI/(Fcielo+⟨I⟩) contra Cmin del grano = ' +
            CminG.toExponential(2));
console.log('anillo   celdas  p95|Δm|  máx|Δm|  pregunta 5      RMS δI/I   RMS/Cmin');
for (k = 0; k < NA; k++) {
  var c5 = p5[k];
  if (!c5.dm.length) { console.log(ETQ[k].padEnd(8) + '  (sin celdas)'); continue; }
  var q95 = p95(c5.dm), mx = Math.max.apply(null, c5.dm);
  var rms = Math.sqrt(c5.d.reduce(function (acc, d) { return acc + d * d; }, 0) / c5.d.length);
  console.log(ETQ[k].padEnd(8) + String(c5.dm.length).padStart(7) + q95.toFixed(3).padStart(9) +
              mx.toFixed(3).padStart(9) + (q95 < 0.1 ? '  radial vale' : '  local').padEnd(16) +
              rms.toExponential(2).padStart(11) + (rms / CminG).toFixed(3).padStart(11));
}

/* ── Micro-casos de las preguntas 1-3 (sin catálogo, sin cuentas) ────────────
   PSF gaussiana de FWHM 0,84·θ_sep (FWHM de Airy / radio del primer anillo
   oscuro = 1,03/1,22). shortcut: la PSF de producción es un sprite, no una
   función; para contar picos de dos o tres estrellas basta la gaussiana. Las
   estrellas son colineales, así que los picos viven en la recta que las une y
   un perfil 1D a lo largo de ella los encuentra todos. */
var SIG = 0.84 * TH / 2.3548;
function picos(pos, F) {
  var lo = Math.min.apply(null, pos) - 4 * SIG, hi = Math.max.apply(null, pos) + 4 * SIG;
  var N = 4000, h = (hi - lo) / N, I = new Float64Array(N + 1);
  for (var i = 0; i <= N; i++) {
    var t = lo + i * h;
    for (var j = 0; j < pos.length; j++) I[i] += F[j] * Math.exp(-Math.pow(t - pos[j], 2) / (2 * SIG * SIG));
  }
  var p = [];
  for (i = 1; i < N; i++) if (I[i] > I[i - 1] && I[i] >= I[i + 1]) p.push(lo + i * h);
  return p;
}
function caso(nombre, pos, dm) {
  var F = dm.map(function (d) { return Math.pow(10, -0.4 * d); });
  var Ft = F.reduce(function (s, x) { return s + x; }, 0);
  var cen = pos.reduce(function (s, x, i) { return s + x * F[i]; }, 0) / Ft;
  var g = fof(pos.map(function (x) { return { x: x, y: 0 }; }), TH);
  var pk = picos(pos, F);
  console.log(nombre.padEnd(34) + ('(a) ' + g.length + ' punto' + (g.length > 1 ? 's' : '')).padEnd(14) +
              ('(b) ' + pk.length + ' pico' + (pk.length > 1 ? 's' : '')).padEnd(13) +
              (pk.length === 1 ? ('pico − centroide = ' + ((pk[0] - cen) / TH).toFixed(3) + ' θ') : ''));
}
console.log('\n── Micro-casos (separaciones en θ_sep; Δm respecto a la más brillante)');
caso('par igual, 0,50 θ', [0, 0.5 * TH], [0, 0]);
caso('par igual, 0,70 θ', [0, 0.7 * TH], [0, 0]);
caso('par igual, 0,75 θ', [0, 0.75 * TH], [0, 0]);
caso('par igual, 0,95 θ', [0, 0.95 * TH], [0, 0]);
caso('par Δm=2, 0,70 θ', [0, 0.7 * TH], [0, 2]);
caso('par Δm=2, 0,95 θ', [0, 0.95 * TH], [0, 2]);
caso('par Δm=2, 1,50 θ', [0, 1.5 * TH], [0, 2]);
caso('par Δm=0,75, 0,95 θ', [0, 0.95 * TH], [0, 0.75]);
caso('cadena A–B–C igual, paso 0,60 θ', [0, 0.6 * TH, 1.2 * TH], [0, 0, 0]);
caso('cadena A–B–C igual, paso 0,90 θ', [0, 0.9 * TH, 1.8 * TH], [0, 0, 0]);
/* Dos estrellas bajo m_res cuya suma lo supera: cada una 0,6 mag más débil que
   m_res; juntas, 2,5·log10(2) − 0,6 = 0,15 mag más brillantes. */
var dmSub = 0.6, mJuntas = -2.5 * Math.log10(2) + dmSub;
console.log('dos a m_res+' + dmSub.toFixed(2) + ' a 0,5 θ: el par suma m_res' + (mJuntas >= 0 ? '+' : '') +
            mJuntas.toFixed(2) + '; la escala a la que el ojo suma la luz de un punto (θ_R/M) es ' +
            (res.thGranoAs / TH).toFixed(1) + ' θ_sep');
