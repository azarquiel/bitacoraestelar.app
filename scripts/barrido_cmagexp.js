#!/usr/bin/env node
/* FASE 1 — BARRIDO DE C_MAG_EXP (medida, no test).

   Aísla la LEY ÓPTICA: nada de PS1, nada de morfología, nada de M81/M101. La
   fuente es una galaxia sintética de brillo superficial UNIFORME μ, que es el
   único caso donde el umbral se lee sin que la forma opine.

   Lo que se mide es μ_lim = sbUmbralContraste(ctx) = −2,5·log10(Fcielo·Cmin):
   el brillo superficial más débil que aún se separa del fondo. Más grande =
   llega más hondo.

   Álgebra de la que salen las tablas (ctxFotometrico, líneas 195-221):

     Fcielo·Cmin ∝ Fcielo^(1−C_EXP) · dim^(−C_EXP) · (C_MAG_REF/MAG)^C_MAG_EXP

   · a APERTURA FIJA, dim ∝ MAG^(−2), así que
       μ_lim ∝ 2,5·(C_MAG_EXP − 2·C_EXP)·log10(MAG)     [signo: 0,70 lo cambia]
   · a PUPILA FIJA, dim es constante, así que
       μ_lim ∝ 2,5·C_MAG_EXP·log10(MAG)                  [siempre a favor]

   El clamp C_MAG_MIN corta el término de tamaño a partir de
       MAG_sat = C_MAG_REF · C_MAG_MIN^(−1/C_MAG_EXP)
   y desde ahí solo queda el término de pupila: la curva DA LA VUELTA. Ese pico
   es el aumento óptimo del modelo, y es lo que impide que la mejora crezca sin
   control.

   Sin dependencias:  node scripts/barrido_cmagexp.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;
var FOT = R.fot;

var SQM = 21.3, T = 0.82, POJO = 7;
var EXPS = [0.60, 0.70, 0.80, 0.90, 1.00, 1.10];
var MAGS = [50, 100, 150, 200, 300, 400];
var MUS = [21, 22, 23, 24, 25];
var EQUIPOS = [{ id: '8″', D: 203 }, { id: '18″', D: 457 }];
var BASE = FOT.C_MAG_EXP;

function ctx(D, MAG) {
  return R.ctxFotometrico({ sqm: SQM, transmision: T, pupilaOjo: POJO,
    aumentos: MAG, pupilaSalida: D / MAG });
}
function mulim(D, MAG) { return R.sbUmbralContraste(ctx(D, MAG)); }

function conExp(e, fn) {
  FOT.C_MAG_EXP = e;
  try { return fn(); } finally { FOT.C_MAG_EXP = BASE; }
}
function f(v, d) { return (v == null || isNaN(v)) ? '  -  ' : v.toFixed(d == null ? 3 : d); }
function fila(cols) { console.log(cols.join(' | ')); }

/* ── 1. Mapa de μ_lim: C_MAG_EXP × aumentos, por apertura ─────────────────── */
EQUIPOS.forEach(function (eq) {
  console.log('\n═══ μ_lim (mag/arcsec²) — ' + eq.id + ' · sqm ' + SQM + ' · T ' + T + ' ═══');
  fila(['C_MAG_EXP'].concat(MAGS.map(function (m) { return m + 'x'; }))
    .concat(['Δ 50→300', 'pupila 300x']));
  EXPS.forEach(function (e) {
    conExp(e, function () {
      var v = MAGS.map(function (m) { return mulim(eq.D, m); });
      fila([f(e, 2)].concat(v.map(function (x) { return f(x); }))
        .concat([f(mulim(eq.D, 300) - mulim(eq.D, 50)),
                 f(eq.D / 300, 2) + ' mm']));
    });
  });
});

/* ── 2. Dónde cambia el signo y dónde satura ──────────────────────────────── */
console.log('\n═══ Signo de la dependencia con los aumentos (apertura fija) ═══');
console.log('pendiente teórica dμ_lim/dlog10(MAG) = 2,5·(C_MAG_EXP − 2·C_EXP),' +
  '  con C_EXP = ' + FOT.C_EXP + '  ⇒  cambio de signo en ' + (2 * FOT.C_EXP).toFixed(2));
fila(['C_MAG_EXP', 'pendiente (mag/dex)', 'MAG_sat (clamp C_MAG_MIN)',
  'pupila sat 8″', 'pupila sat 18″', 'μ_lim máx 8″', 'aumento del máx 8″']);
EXPS.forEach(function (e) {
  conExp(e, function () {
    var sat = FOT.C_MAG_REF * Math.pow(FOT.C_MAG_MIN, -1 / e);
    // Máximo real, barriendo fino: el clamp hace que la curva tenga pico.
    var mejor = 0, mMejor = 0;
    for (var m = 20; m <= 800; m += 1) {
      var u = mulim(203, m);
      if (u > mejor) { mejor = u; mMejor = m; }
    }
    fila([f(e, 2), f(2.5 * (e - 2 * FOT.C_EXP)), f(sat, 0) + 'x',
      f(203 / sat, 2) + ' mm', f(457 / sat, 2) + ' mm', f(mejor), f(mMejor, 0) + 'x']);
  });
});

/* ── 3. Criterios que no pueden romperse ──────────────────────────────────── */
console.log('\n═══ Criterios ═══');
fila(['C_MAG_EXP', 'apertura a igual aumento (18″−8″, 150x)',
  'igual pupila 2,5 mm (18″ 183x − 8″ 81x)', 'fondo igual pupila (nivel 8″ vs 18″)']);
EXPS.forEach(function (e) {
  conExp(e, function () {
    var a = mulim(457, 150) - mulim(203, 150);
    var b = mulim(457, 457 / 2.5) - mulim(203, 203 / 2.5);
    var fc = ctx(203, 203 / 2.5).nivelFondo, fd = ctx(457, 457 / 2.5).nivelFondo;
    fila([f(e, 2), f(a) + ' mag', f(b) + ' mag',
      f(fc) + ' vs ' + f(fd) + (Math.abs(fc - fd) < 1e-12 ? '  (idéntico)' : '  ¡DISTINTO!')]);
  });
});

/* ── 4. Opacidad de la galaxia uniforme (deltaPlena SIN tocar) ────────────── */
console.log('\n═══ Opacidad de una galaxia uniforme, 8″ (deltaPlena ' + R.ps1.deltaPlena +
  ', deltaExp ' + R.ps1.deltaExp + ' — sin recalibrar) ═══');
EXPS.forEach(function (e) {
  conExp(e, function () {
    console.log('— C_MAG_EXP ' + f(e, 2) + ' —');
    fila(['μ'].concat(MAGS.map(function (m) { return m + 'x'; })));
    MUS.forEach(function (mu) {
      fila([f(mu, 1)].concat(MAGS.map(function (m) {
        return f(R.ps1Opacidad(mu, mulim(203, m)));
      })));
    });
  });
});

/* ── 5. Ventana útil: dónde la ley de tamaño está VIVA ────────────────────
   Fuera de ella el exponente no pinta nada. Por arriba manda C_MAG_MIN, por
   abajo C_MAG_MAX, y por debajo de MAG = D/7 la pupila de salida se sale del
   ojo y dim se clava en 1 (luz tirada, no ganada). */
console.log('\n═══ Ventana útil de la ley de tamaño ═══');
console.log('recorrido TOTAL del término de tamaño = 2,5·log10(C_MAG_MAX/C_MAG_MIN) = ' +
  f(2.5 * Math.log10(FOT.C_MAG_MAX / FOT.C_MAG_MIN)) + ' mag  (no depende del exponente)');
fila(['C_MAG_EXP', 'MAG con clamp MAX', 'MAG con clamp MIN', 'ventana (dex)',
  'suelo pupila 8″ (29x)', 'suelo pupila 18″ (65x)']);
EXPS.forEach(function (e) {
  conExp(e, function () {
    var lo = FOT.C_MAG_REF * Math.pow(FOT.C_MAG_MAX, -1 / e);
    var hi = FOT.C_MAG_REF * Math.pow(FOT.C_MAG_MIN, -1 / e);
    fila([f(e, 2), '≤' + f(lo, 0) + 'x', '≥' + f(hi, 0) + 'x', f(Math.log10(hi / lo), 2),
      f(203 / 7, 0) + 'x', f(457 / 7, 0) + 'x']);
  });
});

/* ── 6. Forma del pico (barrido fino, apertura fija) ──────────────────────── */
console.log('\n═══ Forma de μ_lim con los aumentos (8″, barrido fino) ═══');
var FINO = [30, 50, 75, 100, 150, 200, 250, 300, 350, 400, 500, 600];
fila(['C_MAG_EXP'].concat(FINO.map(function (m) { return m + 'x'; })));
EXPS.forEach(function (e) {
  conExp(e, function () {
    fila([f(e, 2)].concat(FINO.map(function (m) { return f(mulim(203, m), 2); })));
  });
});

/* ── 7. μ_lim con la constante de hoy, para referencia ────────────────────── */
console.log('\n═══ Referencia: valores de HOY (C_MAG_EXP ' + BASE + ') ═══');
fila(['equipo'].concat(MAGS.map(function (m) { return m + 'x'; })));
EQUIPOS.forEach(function (eq) {
  fila([eq.id].concat(MAGS.map(function (m) { return f(mulim(eq.D, m)); })));
});
