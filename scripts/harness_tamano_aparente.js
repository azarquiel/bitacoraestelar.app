#!/usr/bin/env node
/* HARNESS: ley A (tamaño = aumentos) contra ley B (tamaño = D25 × aumentos).

   NO toca producción. Las dos leyes se construyen aquí encima del tronco común
   que sí es de producción: ctxFotometrico llamado SIN `aumentos` devuelve Cmin
   con el cielo y la luminancia retinal y sin término de tamaño ninguno. Sobre
   ese tronco se multiplica el término de cada ley.

       A:  Cmin ∝ clamp( (C_MAG_REF   / MAG)^C_MAG_EXP )
       B:  Cmin ∝ clamp( (C_MAG_REF_B / (D25 · MAG))^C_MAG_EXP )

   Idénticos entre las dos: cielo, apertura, transmisión, magnitud, perfil,
   C_MAG_EXP, deltaPlena, rampa de opacidad, PS1/E, presupuesto fotométrico.
   Lo único que cambia es qué se mete en el término de tamaño.

   Esta fase mide DETECCIÓN de brillo superficial. No modela percepción de
   estructura, y el máximo de la métrica NO es «el aumento óptimo para observar
   la galaxia»: es el máximo de la métrica de detección, y nada más.

   Sin dependencias:  node scripts/harness_tamano_aparente.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/bitacora-ps1.js');
var R = global.window.BitacoraGaiaRender;
var FOT = R.fot;
var G = require('./lib_galaxias_sinteticas.js')(R);   // los MISMOS siete objetos

var SQM = 21.3, T = 0.82, POJO = 7, D = 457;          // 18″
var OBJETOS = G.objetos, MUS = [22, 23, 24];
var FCIELO = Math.pow(10, -0.4 * SQM);

/* C_MAG_REF de la ley B: PROVISIONAL. No sale de ninguna preferencia visual.
   Sale de exigir que el clamp C_MAG_MIN —que es donde el beneficio de tamaño
   satura— caiga en 60′ de tamaño aparente, el plateau de los datos de
   Blackwell. Con C_MAG_EXP = 1: C_MAG_REF_B = 60′ · C_MAG_MIN. Se recalibra
   en otra fase, con datos de DETECCIÓN, no de «se ve mejor». */
var PLATEAU_PROV = 60;
var C_MAG_REF_B = PLATEAU_PROV * Math.pow(FOT.C_MAG_MIN, 1 / FOT.C_MAG_EXP);

function f(v, d) { return (v == null || !isFinite(v)) ? '-' : v.toFixed(d == null ? 3 : d); }
function fila(c) { console.log(c.join(' | ')); }
function clampT(x) { return Math.max(FOT.C_MAG_MIN, Math.min(FOT.C_MAG_MAX, x)); }

/* Tronco común, de producción. Sin `aumentos` no se aplica término de tamaño. */
function cminBase(apertura, MAG) {
  return R.ctxFotometrico({ sqm: SQM, transmision: T, pupilaOjo: POJO,
    pupilaSalida: apertura / MAG }).Cmin;
}
function terminoA(MAG) { return clampT(Math.pow(FOT.C_MAG_REF / MAG, FOT.C_MAG_EXP)); }
function terminoB(d25, MAG) {
  return clampT(Math.pow(C_MAG_REF_B / (d25 * MAG), FOT.C_MAG_EXP));
}
function enClampA(MAG) { return Math.pow(FOT.C_MAG_REF / MAG, FOT.C_MAG_EXP) !== terminoA(MAG); }
function enClampB(d25, MAG) {
  return Math.pow(C_MAG_REF_B / (d25 * MAG), FOT.C_MAG_EXP) !== terminoB(d25, MAG);
}
function umbralDe(cmin) { return -2.5 * Math.log10(FCIELO * cmin); }

/* Por debajo de D/pupilaOjo la pupila de salida se sale del ojo: dim se clava
   en 1 y la curva se aplana. Un barrido que empiece más abajo elige ese extremo
   como si fuera un óptimo. */
var MAG_MIN = Math.ceil(D / POJO), MAG_MAX = 2000;

function optimo(umbralEn) {
  var mejor = -Infinity, m, lo = 0, hi = 0;
  for (m = MAG_MIN; m <= MAG_MAX; m++) { var u = umbralEn(m); if (u > mejor) mejor = u; }
  for (m = MAG_MIN; m <= MAG_MAX; m++) {
    if (umbralEn(m) >= mejor - 1e-9) { if (!lo) lo = m; hi = m; }
  }
  return { mag: lo, hi: hi, valor: mejor, pupila: D / lo,
           meseta: hi > lo * 1.02, borde: lo === MAG_MIN };
}
function textoOpt(o) {
  return (o.meseta ? o.mag + '–' + o.hi + 'x' : o.mag + 'x') + (o.borde ? '↓' : '');
}

console.log('Ley A: C_MAG_REF ' + FOT.C_MAG_REF + ' (aumentos)   ·   ' +
  'Ley B: C_MAG_REF_B ' + f(C_MAG_REF_B, 2) + '′ PROVISIONAL (plateau ' + PLATEAU_PROV + '′)');
console.log('C_MAG_EXP ' + FOT.C_MAG_EXP + ' · C_EXP ' + FOT.C_EXP + ' · clamps [' +
  FOT.C_MAG_MIN + ', ' + FOT.C_MAG_MAX + '] · deltaPlena ' + window.BitacoraPS1.cfg.deltaPlena +
  ' · 18″ · sqm ' + SQM + ' · T ' + T);
console.log('Aumento mínimo usable: ' + MAG_MIN + 'x (pupila ' + POJO + ' mm). «↓» = óptimo en ese suelo.');

/* ── 0. Los objetos, verificados ──────────────────────────────────────────── */
console.log('\n═══ 0. Los siete objetos (mismo perfil, distinto tamaño) ═══');
fila(['D25 (′)', 'r_e (″)', 'magV', 'μ(0,5 r_e)', 'μ(r_e)', 'μ(2 r_e)']);
OBJETOS.forEach(function (o) {
  fila([f(o.d25, 2), f(o.re, 1), f(o.magV, 2), f(G.mu(o.comps, 0.5 * o.re)),
    f(G.mu(o.comps, o.re)), f(G.mu(o.comps, 2 * o.re))]);
});

/* ── 1. La matriz pedida, ley por ley ─────────────────────────────────────── */
var MAGS = [66, 100, 150, 222, 300, 400, 600, 900];
function medir(o, MAG, ley) {
  var term = (ley === 'A') ? terminoA(MAG) : terminoB(o.d25, MAG);
  var cmin = cminBase(D, MAG) * term, u = umbralDe(cmin);
  var rDet = G.radioIsofota(o.comps, u);
  return { term: term, cmin: cmin, umbral: u,
    delta: u - G.MU_E,                       // Δ frente a μ(r_e) = 22,5
    rEnRe: rDet / o.re, rEnD25: 2 * rDet / (o.d25 * 60),
    thetaUmbral: 2 * rDet / 60 * MAG,        // tamaño aparente del disco detectable (′)
    ops: MUS.map(function (m) { return window.BitacoraPS1.ps1Opacidad(m, u); }),
    clamp: (ley === 'A') ? enClampA(MAG) : enClampB(o.d25, MAG) };
}
['A', 'B'].forEach(function (ley) {
  console.log('\n═══ 1' + (ley === 'A' ? '' : 'b') + '. LEY ' + ley +
    (ley === 'A' ? ' (actual: solo aumentos)' : ' (propuesta: D25 × aumentos)') +
    ' — 18″, barrido de aumentos ═══');
  OBJETOS.forEach(function (o) {
    console.log('— D25 = ' + f(o.d25, 2) + '′ (r_e ' + f(o.re, 1) + '″) —');
    fila(['MAG', 'pupila', 'término', '¿clamp?', 'Cmin', 'μ_lim', 'Δ(μ_e)',
      'op22', 'op23', 'op24', 'r_det/r_e', 'r_det/D25', 'θ umbral (′)']);
    MAGS.forEach(function (MAG) {
      var m = medir(o, MAG, ley);
      fila([MAG + 'x', f(D / MAG, 2) + ' mm', f(m.term, 4), m.clamp ? 'SÍ' : 'no',
        f(m.cmin, 4), f(m.umbral, 3), f(m.delta, 3)]
        .concat(m.ops.map(function (x) { return f(x, 3); }))
        .concat([f(m.rEnRe, 3), f(m.rEnD25, 3), f(m.thetaUmbral, 1)]));
    });
    var op = optimo(function (MAG) { return medir(o, MAG, ley).umbral; });
    console.log('  máximo de la métrica de detección: ' + textoOpt(op) +
      ' · pupila ' + f(op.pupila, 2) + ' mm · μ_lim ' + f(op.valor, 3) +
      ' · ' + (op.borde ? 'EN EL SUELO del rango usable' :
        (medir(o, op.mag, ley).clamp ? 'en el clamp' : 'dentro del rango, pico real')));
  });
});

/* ── 2. ¿Se rompe la degeneración? ────────────────────────────────────────── */
console.log('\n═══ 2. Degeneración: término de tamaño a 150x, los siete objetos ═══');
fila(['D25 (′)', 'término A', 'término B', 'Cmin A', 'Cmin B', 'μ_lim A', 'μ_lim B']);
OBJETOS.forEach(function (o) {
  var a = medir(o, 150, 'A'), b = medir(o, 150, 'B');
  fila([f(o.d25, 2), f(a.term, 4), f(b.term, 4), f(a.cmin, 4), f(b.cmin, 4),
    f(a.umbral, 3), f(b.umbral, 3)]);
});
function distintos(vals) {
  return vals.some(function (v) { return Math.abs(v - vals[0]) > 1e-12; });
}
console.log('  A distingue los tamaños: ' +
  (distintos(OBJETOS.map(function (o) { return medir(o, 150, 'A').umbral; })) ? 'SÍ' : 'NO'));
console.log('  B distingue los tamaños: ' +
  (distintos(OBJETOS.map(function (o) { return medir(o, 150, 'B').umbral; })) ? 'SÍ' : 'NO'));

/* ── 3. ¿La variable es de verdad el tamaño aparente? ─────────────────────── */
console.log('\n═══ 3. Equivalencia por tamaño aparente: mismo D25×MAG ═══');
var TRIOS = [{ d25: 1, MAG: 200 }, { d25: 2, MAG: 100 }, { d25: 10, MAG: 20 },
             { d25: 0.5, MAG: 400 }, { d25: 20, MAG: 10 }];
fila(['D25 (′)', 'MAG', 'D25×MAG (′)', 'término A', 'término B', 'pupila (mm)', 'Cmin B']);
TRIOS.forEach(function (t) {
  fila([f(t.d25, 2), t.MAG + 'x', f(t.d25 * t.MAG, 1), f(terminoA(t.MAG), 4),
    f(terminoB(t.d25, t.MAG), 6), f(D / t.MAG, 2),
    f(cminBase(D, t.MAG) * terminoB(t.d25, t.MAG), 5)]);
});
console.log('  término B idéntico en los cinco: ' +
  (distintos(TRIOS.map(function (t) { return terminoB(t.d25, t.MAG); })) ? 'NO' : 'SÍ') +
  '   ·   término A idéntico: ' +
  (distintos(TRIOS.map(function (t) { return terminoA(t.MAG); })) ? 'NO' : 'SÍ'));
console.log('  Cmin NO es idéntico, y debe no serlo: la pupila de salida es otra variable.');

/* ── 4. Pupila independiente del tamaño aparente ──────────────────────────── */
console.log('\n═══ 4. Mismo tamaño aparente, distinta pupila (D25×MAG = 200′ fijo) ═══');
fila(['apertura', 'D25 (′)', 'MAG', 'pupila (mm)', 'término B', 'Cmin base', 'Cmin B', 'μ_lim B']);
[{ Dmm: 203, d25: 2, MAG: 100 }, { Dmm: 457, d25: 2, MAG: 100 },
 { Dmm: 457, d25: 1, MAG: 200 }, { Dmm: 914, d25: 1, MAG: 200 },
 { Dmm: 457, d25: 4, MAG: 50 }].forEach(function (c) {
  var term = terminoB(c.d25, c.MAG), base = cminBase(c.Dmm, c.MAG);
  fila([c.Dmm + ' mm', f(c.d25, 2), c.MAG + 'x', f(c.Dmm / c.MAG, 2), f(term, 6),
    f(base, 5), f(base * term, 5), f(umbralDe(base * term), 3)]);
});
console.log('  El término B se repite (mismo tamaño aparente) y Cmin cambia: la dependencia');
console.log('  física de la pupila sobrevive intacta. El término de tamaño no se la come.');

/* ── 5. ¿Sigue siendo universal el óptimo? ────────────────────────────────── */
console.log('\n═══ 5. Máximo de la métrica de detección contra tamaño ═══');
fila(['D25 (′)', 'A: máximo', 'A: pupila', 'B: máximo', 'B: pupila', 'B: dónde cae']);
OBJETOS.forEach(function (o) {
  var a = optimo(function (m) { return medir(o, m, 'A').umbral; });
  var b = optimo(function (m) { return medir(o, m, 'B').umbral; });
  fila([f(o.d25, 2), textoOpt(a), f(a.pupila, 2) + ' mm', textoOpt(b), f(b.pupila, 2) + ' mm',
    b.borde ? 'suelo del rango usable' : (medir(o, b.mag, 'B').clamp ? 'clamp' : 'pico real')]);
});
console.log('  Predicción de la ley B: MAG_máx = plateau/D25 = ' + PLATEAU_PROV + '′/D25, ' +
  'acotado abajo por ' + MAG_MIN + 'x.');
fila(['D25 (′)', 'plateau/D25', 'medido']);
OBJETOS.forEach(function (o) {
  var b = optimo(function (m) { return medir(o, m, 'B').umbral; });
  fila([f(o.d25, 2), f(PLATEAU_PROV / o.d25, 0) + 'x', textoOpt(b)]);
});

/* ── 6. Estrellas y objetos sin D25 ───────────────────────────────────────── */
console.log('\n═══ 6. Quién consume Cmin, y qué le pasa a quien no tiene D25 ═══');
/* pintarFot (bitacora-gaia-render.js:438) llama a ctxFotometrico UNA vez con el
   objeto de CIELO y usa de él cuatro cosas. Cmin entra solo en visibilidadDifusa
   (línea 457), y solo sobre Fobj, la capa difusa. Las estrellas llegan en el
   array `estrellas` como valores de PANTALLA ya resueltos contra la magnitud
   límite, y su rama consume Fcielo y rango, no Cmin.
   Comprobación numérica: dos equipos con la MISMA pupila y distintos aumentos
   tienen distinto término de tamaño —o sea distinto Cmin— y todo lo demás
   igual. Si Fcielo, rango y nivelFondo no se mueven, nada que las estrellas
   consuman puede moverse con el término de tamaño, sea A o sea B. */
var e1 = R.ctxFotometrico({ sqm: SQM, transmision: T, pupilaOjo: POJO,
  pupilaSalida: 2.5, aumentos: 100 });
var e2 = R.ctxFotometrico({ sqm: SQM, transmision: T, pupilaOjo: POJO,
  pupilaSalida: 2.5, aumentos: 400 });
fila(['magnitud', '2,5 mm a 100x', '2,5 mm a 400x', '¿igual?']);
[['Fcielo', 'Fcielo'], ['rango', 'rango'], ['nivelFondo', 'nivelFondo'],
 ['SBe', 'SBe'], ['Cmin', 'Cmin']].forEach(function (k) {
  var a = e1[k[1]], b = e2[k[1]];
  fila([k[0], (a < 1e-3 ? a.toExponential(4) : f(a, 5)),
    (b < 1e-3 ? b.toExponential(4) : f(b, 5)),
    (Math.abs(a - b) < 1e-12 ? 'SÍ' : 'no')]);
});
console.log('  Todo lo que consumen las estrellas es igual; solo Cmin se mueve.');
console.log('  ⇒ cambiar el término de tamaño NO puede afectar a las estrellas, ni en A ni en B.');

/* El fallback. C_MAG_REF cambia de unidades (aumentos → ′), así que la rama sin
   D25 no puede reutilizar el mismo número tal cual. Tres salidas, medidas: */
console.log('\n  Objetos difusos SIN D25 (nebulosas, globulares): tres fallbacks posibles');
var TAM_NEUTRO = C_MAG_REF_B / FOT.C_MAG_REF;
fila(['MAG', 'A (hoy)', 'fb neutro (término=1)', 'fb tamArcmin=' + f(TAM_NEUTRO, 3) + '′',
  'Δμ_lim del neutro']);
[66, 100, 150, 222, 400].forEach(function (MAG) {
  var a = terminoA(MAG), neutro = 1, derivado = terminoB(TAM_NEUTRO, MAG);
  fila([MAG + 'x', f(a, 5), f(neutro, 5), f(derivado, 5),
    f(umbralDe(cminBase(D, MAG) * neutro) - umbralDe(cminBase(D, MAG) * a), 3) + ' mag']);
});
var iguales = [66, 100, 150, 222, 400, 600, 900].every(function (MAG) {
  return Math.abs(terminoB(TAM_NEUTRO, MAG) - terminoA(MAG)) < 1e-12;
});
console.log('  tamArcmin = C_MAG_REF_B/' + FOT.C_MAG_REF + ' = ' + f(TAM_NEUTRO, 3) +
  '′ reproduce la ley A EXACTAMENTE: ' + (iguales ? 'SÍ' : 'NO') + ' (clamps incluidos)');
console.log('  ⇒ ese fallback no es una perilla nueva: es el mismo número con otras unidades,');
console.log('    y deja el cambio como no-op demostrable para todo lo que no sea una galaxia.');
console.log('  El fallback neutro (término=1) NO es inocuo: mueve μ_lim lo que dice la columna.');

/* ── 7. Calibración de C_MAG_REF_B: qué haría falta, sin aplicarlo ────────── */
console.log('\n═══ 7. C_MAG_REF_B: qué valor haría falta (SIN aplicar) ═══');
console.log('  Con C_MAG_EXP = 1 la ley B predice   MAG_máx = plateau / D25,');
console.log('  con plateau = C_MAG_REF_B / C_MAG_MIN = C_MAG_REF_B / ' + FOT.C_MAG_MIN + '.');
fila(['plateau (′)', 'C_MAG_REF_B (′)', 'D25 mín. con máximo DENTRO del rango (>' +
  MAG_MIN + 'x)', 'MAG_máx para D25=10′']);
[30, 60, 120, 300, 600, 1200].forEach(function (p) {
  fila([f(p, 0), f(p * FOT.C_MAG_MIN, 2), f(p / MAG_MIN, 2) + '′', f(p / 10, 0) + 'x']);
});
console.log('  Leído al derecho: con plateau P, toda galaxia con D25 > P/' + MAG_MIN +
  '′ tiene su máximo de');
console.log('  DETECCIÓN en el aumento mínimo usable, o sea «la pupila más grande que puedas».');
console.log('  Para detección pura de objetos grandes y débiles eso es lo correcto, y es lo que');
console.log('  se hace de verdad con M33 o el Velo. No es un fallo de la ley B: es su respuesta.');
