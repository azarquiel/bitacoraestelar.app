#!/usr/bin/env node
/* EXPERIMENTO H2 + SEEING sobre el umbral de contraste C(θ).
   NO toca producción; lee bitacora-gaia-render.js solo para constantes.

   Contrasta contra Blackwell (1946) tabla VIII vía Clark/ODM Bartels:
     H0  producción: C∞·clamp((100/M)^0.5, 0.45, 2.0)   (forma θ^-0.5 acotada)
     H1  Ricco puro: C ∝ 1/θ²
     H2a plateau+Ricco sin seeing:  C = C∞(fondo)·(1+θR(fondo)/θ_int_ap)²
     H2b guardia max():             θ_eff = max(θ_int, θ_seeing)
     H2c convolución (cuadratura):  θ_eff = sqrt(θ_int² + θ_seeing²)
         (misma forma que ya usa producción en radioImagenEstelar para Airy+seeing)

   Separación: A (ley fotométrica pura) y B (seeing) aquí; C (remuestreo/bilineal/
   PSF de PS1) EXCLUIDO: nada se rasteriza. La tabla de Blackwell es de
   laboratorio: sobre ella H2a≡H2b≡H2c (θ_seeing=0); el seeing solo entra en la
   batería sintética de la parte 3.

   Aborta (exit 1) si el baseline no reproduce el experimento anterior
   (simulador_ocular/docs/experimentos/ricco) o si falla una invariancia.  Salidas: simulador_ocular/docs/experimentos/ricco/seeing/. */
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const SALIDA = path.join(RAIZ, 'simulador_ocular', 'docs', 'experimentos', 'ricco', 'seeing');
fs.mkdirSync(SALIDA, { recursive: true });

global.window = {};
require(path.join(RAIZ, 'resources/js/bitacora-gaia-render.js'));
const R = global.window.BitacoraGaiaRender;
const FOT = R.fot;

let fallos = 0;
function exige(cond, etiqueta, detalle) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta + (detalle ? '  [' + detalle + ']' : '')); }
}
const f2 = v => (v >= 0 ? ' ' : '') + v.toFixed(2);
const f3 = v => (v >= 0 ? ' ' : '') + v.toFixed(3);

/* ── Datos Blackwell/Clark (idénticos al experimento anterior) ─────────────── */
const LOG_ANGLE = [-0.2255, 0.5563, 0.9859, 1.260, 1.742, 2.083, 2.556];
const BKGND_FIRST = 4;
const LTC = [
  [-0.3769, -1.8064, -2.3368, -2.4601, -2.5469, -2.5610, -2.5660],
  [-0.3315, -1.7747, -2.3337, -2.4608, -2.5465, -2.5607, -2.5658],
  [-0.2682, -1.7345, -2.3310, -2.4605, -2.5467, -2.5608, -2.5658],
  [-0.1982, -1.6851, -2.3140, -2.4572, -2.5481, -2.5615, -2.5665],
  [-0.1238, -1.6252, -2.2791, -2.4462, -2.5463, -2.5597, -2.5646],
  [-0.0424, -1.5529, -2.2297, -2.4214, -2.5343, -2.5501, -2.5552],
  [ 0.0498, -1.4655, -2.1659, -2.3763, -2.5047, -2.5269, -2.5333],
  [ 0.1596, -1.3581, -2.0810, -2.3036, -2.4499, -2.4823, -2.4937],
  [ 0.2934, -1.2256, -1.9674, -2.1965, -2.3631, -2.4092, -2.4318],
  [ 0.4557, -1.0673, -1.8186, -2.0531, -2.2445, -2.3083, -2.3491],
  [ 0.6500, -0.8841, -1.6292, -1.8741, -2.0989, -2.1848, -2.2505],
  [ 0.8808, -0.6687, -1.3967, -1.6611, -1.9284, -2.0411, -2.1375],
  [ 1.1558, -0.3952, -1.1264, -1.4176, -1.7300, -1.8727, -2.0034],
  [ 1.4822, -0.0419, -0.8243, -1.1475, -1.5021, -1.6768, -1.8420],
  [ 1.8559,  0.3458, -0.4924, -0.8561, -1.2661, -1.4721, -1.6624],
  [ 2.2669,  0.6960, -0.1315, -0.5510, -1.0562, -1.2892, -1.4827],
  [ 2.6760,  1.0880,  0.2060, -0.3210, -0.8800, -1.1370, -1.3620],
  [ 2.7766,  1.2065,  0.3467, -0.1377, -0.7361, -0.9964, -1.2439],
  [ 2.9304,  1.3821,  0.5353,  0.0328, -0.5605, -0.8606, -1.1187],
  [ 3.1634,  1.6107,  0.7708,  0.2531, -0.3895, -0.7030, -0.9681],
  [ 3.4643,  1.9034,  1.0338,  0.4943, -0.2033, -0.5259, -0.8288],
  [ 3.8211,  2.2564,  1.3265,  0.7605,  0.0172, -0.2992, -0.6394],
  [ 4.2210,  2.6320,  1.6990,  1.1320,  0.2860, -0.0510, -0.4080],
  [ 4.6100,  3.0660,  2.1320,  1.5850,  0.6520,  0.2410, -0.1210]
];
const filaFondo = m => LTC[Math.round(m) - BKGND_FIRST];
const FONDOS = [13, 17, 19, 21, 23];

/* ── Ajustes (mismos algoritmos que el experimento anterior) ───────────────── */
function ajusteLineal(xs, ys) {
  const n = xs.length, sx = xs.reduce((s, v) => s + v, 0), sy = ys.reduce((s, v) => s + v, 0);
  const sxx = xs.reduce((s, v) => s + v * v, 0), sxy = xs.reduce((s, v, i) => s + v * ys[i], 0);
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n;
  const res = ys.map((y, i) => y - (a + b * xs[i]));
  return { a, b, rms: Math.sqrt(res.reduce((s, r) => s + r * r, 0) / n), res };
}
function ajustePendienteFija(xs, ys, b) {
  const a = ys.reduce((s, y, i) => s + (y - b * xs[i]), 0) / ys.length;
  const res = ys.map((y, i) => y - (a + b * xs[i]));
  return { a, b, rms: Math.sqrt(res.reduce((s, r) => s + r * r, 0) / ys.length), res };
}
const h2log = (lC8, lTR, lt) => lC8 + 2 * Math.log10(1 + Math.pow(10, lTR - lt));
function ajusteH2(logT, logC) {
  let mejor = null;
  const errar = (lC8, lTR) => {
    let s = 0;
    for (let i = 0; i < logT.length; i++) { const d = logC[i] - h2log(lC8, lTR, logT[i]); s += d * d; }
    return Math.sqrt(s / logT.length);
  };
  for (let paso = 0.1, cl = -3.5, cu = 1, tl = -1, tu = 3.2, k = 0; k < 4; k++, paso /= 8) {
    for (let lC8 = cl; lC8 <= cu; lC8 += paso)
      for (let lTR = tl; lTR <= tu; lTR += paso) {
        const e = errar(lC8, lTR);
        if (!mejor || e < mejor.rms) mejor = { lC8, lTR, rms: e };
      }
    cl = mejor.lC8 - paso; cu = mejor.lC8 + paso; tl = mejor.lTR - paso; tu = mejor.lTR + paso;
  }
  return mejor;
}

/* ════ PARTE 1 · BASELINE: reproducir el experimento anterior ═══════════════ */
console.log('PARTE 1 · baseline (debe reproducir simulador_ocular/docs/experimentos/ricco):');
const ESPERADO = { // del experimento anterior (simulador_ocular/docs/experimentos/ricco/ajustes.csv)
  thetaR: { 13: 14.0, 17: 26.1, 19: 46.0, 21: 67.0, 23: 81.4 },
  Cinf:   { 13: 3.56e-3, 17: 1.32e-2, 19: 2.56e-2, 21: 3.93e-2, 23: 6.92e-2 },
  rmsH2:  { 13: 0.088, 17: 0.046, 19: 0.042, 21: 0.046, 23: 0.033 }
};
const indep = {};
for (const f of FONDOS) {
  const lC = filaFondo(f);
  const h2 = ajusteH2(LOG_ANGLE, lC);
  const tR = Math.pow(10, h2.lTR), C8 = Math.pow(10, h2.lC8);
  indep[f] = { h2, tR, C8,
    H0: ajustePendienteFija(LOG_ANGLE, lC, -1),
    H1: ajustePendienteFija(LOG_ANGLE, lC, -2),
    libre: ajusteLineal(LOG_ANGLE, lC),
    tramoPeq: ajusteLineal(LOG_ANGLE.slice(0, 3), lC.slice(0, 3)) };
  exige(Math.abs(tR / ESPERADO.thetaR[f] - 1) < 0.05, 'fondo ' + f + ': θR=' + tR.toFixed(1) + '′ (esperado ' + ESPERADO.thetaR[f] + '′)');
  exige(Math.abs(C8 / ESPERADO.Cinf[f] - 1) < 0.10, 'fondo ' + f + ': C∞=' + C8.toExponential(2));
  exige(Math.abs(h2.rms - ESPERADO.rmsH2[f]) < 0.01, 'fondo ' + f + ': rms H2=' + h2.rms.toFixed(3));
  exige(Math.abs(indep[f].tramoPeq.b + 2) < 0.15, 'fondo ' + f + ': pendiente θ≤10′ = ' + f3(indep[f].tramoPeq.b) + ' (Ricco)');
}
const metaC = ajusteLineal(FONDOS, FONDOS.map(f => indep[f].h2.lC8));
const metaT = ajusteLineal(FONDOS, FONDOS.map(f => indep[f].h2.lTR));
exige(Math.abs(metaC.b - 0.128) < 0.01, 'meta: log C∞ pendiente ' + f3(metaC.b) + '/mag (≈0.128)');
exige(Math.abs(metaT.b - 0.081) < 0.01, 'meta: log θR pendiente ' + f3(metaT.b) + '/mag (≈0.081)');
if (fallos) { console.error('\nBaseline NO reproducido: aborto.'); process.exit(1); }

/* ════ PARTE 2 · AJUSTE CONJUNTO C∞(fondo), θR(fondo) ═══════════════════════ */
console.log('\nPARTE 2 · ajuste conjunto (4 parámetros, 35 puntos):');
// modelo: logC = (a0 + a1·fondo) + 2·log10(1 + 10^(b0 + b1·fondo)/θ)
function rmsConjunto(p, fondos) {
  let s = 0, n = 0, resPorTheta = new Array(7).fill(0), resPorFondo = {}, maxRes = 0;
  for (const f of fondos) {
    const lC = filaFondo(f); let sf = 0;
    for (let i = 0; i < 7; i++) {
      const m = h2log(p[0] + p[1] * f, p[2] + p[3] * f, LOG_ANGLE[i]);
      const r = lC[i] - m;
      s += r * r; sf += r * r; n++;
      resPorTheta[i] += r / fondos.length;
      if (Math.abs(r) > Math.abs(maxRes)) maxRes = r;
    }
    resPorFondo[f] = Math.sqrt(sf / 7);
  }
  return { rms: Math.sqrt(s / n), resPorTheta, resPorFondo, maxRes };
}
// descenso por coordenadas desde el meta-ajuste de la parte 1
let P = [metaC.a, metaC.b, metaT.a, metaT.b];
let mejorRms = rmsConjunto(P, FONDOS).rms;
for (let paso = 0.04; paso > 1e-4; paso /= 2)
  for (let k = 0; k < 20; k++) {
    let movio = false;
    for (let j = 0; j < 4; j++) for (const d of [paso, -paso]) {
      const Q = P.slice(); Q[j] += d;
      const r = rmsConjunto(Q, FONDOS).rms;
      if (r < mejorRms) { P = Q; mejorRms = r; movio = true; }
    }
    if (!movio) break;
  }
const conj = rmsConjunto(P, FONDOS);
const rmsIndepGlobal = Math.sqrt(FONDOS.reduce((s, f) => s + indep[f].h2.rms ** 2, 0) / FONDOS.length);
console.log('  log C∞ = ' + f3(P[0]) + ' + ' + f3(P[1]) + '·fondo;  log θR = ' + f3(P[2]) + ' + ' + f3(P[3]) + '·fondo');
console.log('  rms global conjunto ' + conj.rms.toFixed(3) + ' dex  (independientes: ' + rmsIndepGlobal.toFixed(3) + ')');
console.log('  rms por fondo: ' + FONDOS.map(f => f + ':' + conj.resPorFondo[f].toFixed(3)).join('  '));
console.log('  residual máximo ' + f3(conj.maxRes) + ' dex');
console.log('  residual medio por θ (sistemático): ' + conj.resPorTheta.map(f3).join(' '));
const paramAnterior = rmsConjunto([metaC.a, metaC.b, 0.094, 0.081], FONDOS);
console.log('  con la parametrización anterior (0.094+0.081·fondo): rms ' + paramAnterior.rms.toFixed(3));
exige(conj.rms < 1.6 * rmsIndepGlobal, 'conjunto no degrada gravemente frente a independientes (' +
  conj.rms.toFixed(3) + ' vs ' + rmsIndepGlobal.toFixed(3) + ')');
// extrapolación fuera del rango ajustado (informativo, sin exigencia)
for (const f of [25, 27]) {
  const e = rmsConjunto(P, [f]);
  console.log('  extrapolación fondo ' + f + ': rms ' + e.rms.toFixed(3) + ' dex (fuera del ajuste)');
}

/* ════ PARTE 3 · SEEING: batería sintética ══════════════════════════════════ */
console.log('\nPARTE 3 · batería de seeing (A+B, sin remuestreo):');
/* Objeto de prueba: contraste intrínseco C_int = 10·C∞ (constante: mismo brillo
   superficial en toda la batería), fondo 21, M=150, seeing de producción (2″).
   FÍSICA DE PAREJAS (clave del experimento): la convolución CONSERVA el flujo,
   así que el contraste OBSERVADO se diluye: C_obs = C_int·θ_int²/θ_eff².
   Cada variante solo es coherente con SU contraste:
     H2a: umbral sobre C_int con θ_int      (sin seeing en ninguna de las dos)
     H2b: umbral sobre C_obs con max()      (seeing en las dos)
     H2c: umbral sobre C_obs con cuadratura (seeing en las dos)
   La "sensibilidad absurda" aparece al MEZCLAR: umbral con guardia de seeing
   aplicado al contraste intrínseco sin diluir. Se mide también esa mezcla. */
const seeingFWHM = 2.0;                       // ″, = CFG.seeingArcsec de producción
const M = 150;
const lC8_21 = indep[21].h2.lC8, lTR_21 = indep[21].h2.lTR;
const C8_21 = Math.pow(10, lC8_21);
const Cint = 10 * C8_21;
const ratios = [0.1, 0.2, 0.5, 1, 2, 5, 10];
const filasBat = [];
console.log('  θi/θs   θint(″)  θapp(′)  resuelto  margen H2a  H2b(par)  H2c(par)  MEZCLA b×Cint');
for (const q of ratios) {
  const thInt = q * seeingFWHM;                       // ″ en cielo
  const appInt = thInt * M / 60;                      // ′ aparentes
  const appSee = seeingFWHM * M / 60;
  const effMax = Math.max(appInt, appSee);
  const effCua = Math.sqrt(appInt * appInt + appSee * appSee);
  const T = eff => C8_21 * Math.pow(1 + Math.pow(10, lTR_21) / eff, 2);
  const Cobs = eff => Cint * (appInt * appInt) / (eff * eff);
  const mA = Math.log10(Cint / T(appInt));            // pareja coherente sin seeing
  const mB = Math.log10(Cobs(effMax) / T(effMax));    // pareja coherente max()
  const mC = Math.log10(Cobs(effCua) / T(effCua));    // pareja coherente cuadratura
  const mMezcla = Math.log10(Cint / T(effMax));       // MEZCLA incoherente
  filasBat.push({ q, thInt, appInt, mA, mB, mC, mMezcla, resuelto: q > 1 });
  console.log('  ' + String(q).padEnd(6) + thInt.toFixed(1).padStart(6) + appInt.toFixed(1).padStart(9) +
    (q > 1 ? '      sí ' : '      no ') + '   ' + f3(mA) + '    ' + f3(mB) + '    ' + f3(mC) +
    '     ' + f3(mMezcla));
}
/* diagnóstico: en régimen Ricco profundo las tres parejas coherentes deben dar
   el MISMO criterio de flujo (sumación espacial: el seeing no puede cambiar la
   detectabilidad de un objeto muy por debajo del área de Ricco). */
const b0 = filasBat[0];
/* tolerancia 0.1 dex: en Ricco profundo el criterio exacto es (θ+θR)²·C = cte,
   y el término de segundo orden (θeff frente a θi, ambos ≪ θR) deja ~0.06 dex
   entre variantes: mismo criterio de flujo, no una discrepancia real. */
exige(Math.abs(b0.mA - b0.mB) < 0.1 && Math.abs(b0.mA - b0.mC) < 0.1,
  'Ricco profundo (θi/θs=0.1): H2a, H2b y H2c con pareja coherente coinciden ±0.1 dex (' +
  f3(b0.mA) + ', ' + f3(b0.mB) + ', ' + f3(b0.mC) + ')');
exige(b0.mMezcla - b0.mA > 1.5,
  'la MEZCLA (max() sobre contraste sin diluir) regala ' + f2(b0.mMezcla - b0.mA) +
  ' dex a θi/θs=0.1: esa es la sensibilidad absurda, y no viene de H2a');
const b6 = filasBat[6];
exige(Math.abs(b6.mA - b6.mC) < 0.02, 'objetos grandes (θi/θs=10): H2c converge a H2a (' +
  f3(b6.mA) + ' vs ' + f3(b6.mC) + ')');

/* ════ PARTE 4 · DETECCIÓN ≠ RESOLUCIÓN ═════════════════════════════════════ */
console.log('\nPARTE 4 · detección frente a resolución:');
/* Con C_int = 10·C∞ (difuso débil) casi nada baja del umbral: correcto, un
   difuso débil y diminuto NO se ve. El caso "detectable sin resolver" exige un
   objeto COMPACTO y brillante (tipo planetaria pequeña): C_int = 10⁴·C∞. */
let huboDetSinRes = false;
for (const esc of [{ nom: 'difuso débil (C_int=10·C∞)', c: 10 },
                   { nom: 'compacto brillante (C_int=10⁴·C∞)', c: 1e4 }]) {
  console.log('  ' + esc.nom + ':');
  for (const b of filasBat) {
    const effCua = Math.sqrt(b.appInt * b.appInt + (seeingFWHM * M / 60) ** 2);
    const m = Math.log10(esc.c * C8_21 * (b.appInt ** 2 / effCua ** 2) /
      (C8_21 * Math.pow(1 + Math.pow(10, lTR_21) / effCua, 2)));
    const det = m > 0;
    if (det && !b.resuelto) huboDetSinRes = true;
    console.log('    θi/θs=' + String(b.q).padEnd(4) + ' detectable=' + (det ? 'sí' : 'no ') +
      '  resuelto=' + (b.resuelto ? 'sí' : 'no ') +
      (det && !b.resuelto ? '  ← detección por integración espacial, SIN estructura' : ''));
  }
}
exige(huboDetSinRes, 'existe el régimen detectable-sin-resolver: la fórmula mejora ' +
  'DETECCIÓN (sumación) sin implicar detalle estructural (eso lo fija la óptica)');

/* ════ PARTE 5 · COMPARACIÓN DE MODELOS SOBRE BLACKWELL ═════════════════════ */
console.log('\nPARTE 5 · modelos sobre los datos (amplitud libre por fondo; rms en dex):');
/* Sobre la tabla (laboratorio, θ_seeing=0) H2a≡H2b≡H2c: se evalúa una sola H2
   (la conjunta de la parte 2). Producción se evalúa como su FORMA en θ:
   θ^-0.5 con recorte 4.44x (banda de clamps), amplitud ajustada por fondo. */
function evaluaForma(forma, idx) { // forma(logθ, amplitud) → logC modelo
  let s = 0, n = 0, mx = 0; const porFondo = {};
  for (const f of FONDOS) {
    const lC = idx ? filaFondo(f).slice(idx) : filaFondo(f);
    const lT = idx ? LOG_ANGLE.slice(idx) : LOG_ANGLE;
    // amplitud óptima: media del residual
    const a = lC.reduce((t, c, i) => t + c - forma(lT[i], 0), 0) / lC.length;
    let sf = 0;
    for (let i = 0; i < lC.length; i++) {
      const r = lC[i] - forma(lT[i], a); s += r * r; sf += r * r; n++;
      if (Math.abs(r) > Math.abs(mx)) mx = r;
    }
    porFondo[f] = Math.sqrt(sf / lC.length);
  }
  return { rms: Math.sqrt(s / n), porFondo, maxRes: mx };
}
const centro = Math.log10(100);
const formaProd = (lt, a) => { // θ^-0.5 acotada a banda 4.44x, centrada en 100′
  const v = -0.5 * (lt - centro);
  return a + Math.max(-0.5 * Math.log10(4.94), Math.min(Math.log10(2), v));
};
const formaRicco = (lt, a) => a - 2 * (lt - centro);
// H2 conjunta con su amplitud propia (sin amplitud libre): rms de la parte 2
function evaluaH2(idx) {
  let s = 0, n = 0, mx = 0; const porFondo = {};
  for (const f of FONDOS) {
    const lC = idx ? filaFondo(f).slice(idx) : filaFondo(f);
    const lT = idx ? LOG_ANGLE.slice(idx) : LOG_ANGLE;
    let sf = 0;
    for (let i = 0; i < lC.length; i++) {
      const r = lC[i] - h2log(P[0] + P[1] * f, P[2] + P[3] * f, lT[i]);
      s += r * r; sf += r * r; n++; if (Math.abs(r) > Math.abs(mx)) mx = r;
    }
    porFondo[f] = Math.sqrt(sf / lC.length);
  }
  return { rms: Math.sqrt(s / n), porFondo, maxRes: mx };
}
const RES = {
  'producción (θ^-0.5 acotada)': { full: evaluaForma(formaProd), banda: evaluaForma(formaProd, 3) },
  'Ricco puro (1/θ²)':           { full: evaluaForma(formaRicco), banda: evaluaForma(formaRicco, 3) },
  'H2 conjunta (=H2b=H2c en laboratorio)': { full: evaluaH2(), banda: evaluaH2(3) }
};
console.log('  modelo                                   rms    f21    f23    |máx|   rms banda 18–360′');
for (const [nom, r] of Object.entries(RES))
  console.log('  ' + nom.padEnd(40) + r.full.rms.toFixed(3) + '  ' + r.full.porFondo[21].toFixed(3) +
    '  ' + r.full.porFondo[23].toFixed(3) + '  ' + Math.abs(r.full.maxRes).toFixed(2) +
    '   ' + r.banda.rms.toFixed(3));
exige(RES['H2 conjunta (=H2b=H2c en laboratorio)'].full.rms < RES['producción (θ^-0.5 acotada)'].full.rms / 3,
  'H2 conjunta bate a la forma de producción por >3x en rms global');
exige(RES['H2 conjunta (=H2b=H2c en laboratorio)'].banda.rms < RES['producción (θ^-0.5 acotada)'].banda.rms,
  'H2 conjunta también gana en la banda del simulador (18–360′)');

/* ════ PARTE 7 · INVARIANCIAS de la formulación conceptual (H2c) ════════════ */
console.log('\nPARTE 7 · invariancias (H2c, pareja coherente):');
const umbralH2c = (thIntArcsec, Mx, fondo, seeing) => {
  const appInt = thIntArcsec * Mx / 60, appSee = (seeing || 0) * Mx / 60;
  const eff = Math.sqrt(appInt * appInt + appSee * appSee);
  const lC8 = P[0] + P[1] * fondo, lTR = P[2] + P[3] * fondo;
  // umbral expresado sobre el contraste INTRÍNSECO (incluye la dilución):
  return Math.pow(10, lC8) * Math.pow(1 + Math.pow(10, lTR) / eff, 2) * (eff * eff) / (appInt * appInt);
};
// 1: mismo θ_app por caminos distintos (θ_int×M) → mismo umbral (sin seeing)
const u1 = umbralH2c(60, 100, 21, 0), u2 = umbralH2c(30, 200, 21, 0);
exige(Math.abs(u1 / u2 - 1) < 1e-9, 'no depende de M a θ_app fijo (θ_int·M igual): ' +
  u1.toExponential(3) + ' = ' + u2.toExponential(3));
// 2: producción SÍ depende de M a θ_app fijo (el defecto que H2 elimina)
const cP1 = R.ctxFotometrico({ pupilaSalida: 4, pupilaOjo: 7, sqm: 21, transmision: 1, aumentos: 100 }).Cmin;
const cP2 = R.ctxFotometrico({ pupilaSalida: 2, pupilaOjo: 7, sqm: 21, transmision: 1, aumentos: 200 }).Cmin;
exige(cP1 !== cP2, 'la ley actual, en cambio, da umbrales distintos a mismo θ_app (defecto documentado)');
// 3: convergencia a C∞ para objetos enormes
const uG = umbralH2c(3600 * 100, 100, 21, 0);
exige(Math.abs(uG / Math.pow(10, P[0] + P[1] * 21) - 1) < 0.01, 'converge a C∞ con θ_app enorme');
// 4: pendiente −2 (Ricco) para pequeños POR ENCIMA del límite óptico (seeing=0)
const d = (Math.log10(umbralH2c(0.6, 100, 21, 0)) - Math.log10(umbralH2c(0.66, 100, 21, 0))) /
          (Math.log10(0.6) - Math.log10(0.66));
exige(Math.abs(d + 2) < 0.05, 'pendiente local ' + f2(d) + ' ≈ −2 en régimen pequeño' +
  ' (exacta: −2/(1+θ/θR), solo alcanza −2 en el límite)');
// 5: sin divergencia bajo el seeing: umbral sobre C_int sigue la ley de flujo
const uS1 = umbralH2c(0.2, 150, 21, 2.0), uS2 = umbralH2c(0.02, 150, 21, 2.0);
const pendFlujo = (Math.log10(uS2) - Math.log10(uS1)) / (Math.log10(0.02) - Math.log10(0.2));
exige(Math.abs(pendFlujo + 2) < 0.05, 'bajo el seeing el umbral sobre C_int va como θ_int^-2 (ley de flujo, ' +
  f2(pendFlujo) + '): finito, sin regalo ni divergencia artificial');
// 6: dependencia con el fondo = C∞ de la conjunta, compatible con C_EXP
const expFondo = -P[1] / 0.4;
exige(Math.abs(expFondo - (-FOT.C_EXP)) < 0.06, 'C∞ ∝ Fcielo^' + f3(expFondo) +
  ' compatible con C_EXP=' + FOT.C_EXP + ' de producción');

/* ── CSV ────────────────────────────────────────────────────────────────────── */
let csv = 'fondo,log_theta,logC_dato,logC_H2conj,residual\n';
for (const f of FONDOS) {
  const lC = filaFondo(f);
  for (let i = 0; i < 7; i++) {
    const m = h2log(P[0] + P[1] * f, P[2] + P[3] * f, LOG_ANGLE[i]);
    csv += [f, LOG_ANGLE[i], lC[i], m.toFixed(4), (lC[i] - m).toFixed(4)].join(',') + '\n';
  }
}
fs.writeFileSync(path.join(SALIDA, 'conjunto_residuales.csv'), csv);
let csvB = 'ratio_thInt_thSeeing,thInt_arcsec,thApp_arcmin,resuelto,margen_H2a,margen_H2b_par,margen_H2c_par,margen_mezcla_max_Cint\n';
for (const b of filasBat)
  csvB += [b.q, b.thInt.toFixed(2), b.appInt.toFixed(2), b.resuelto ? 1 : 0,
           b.mA.toFixed(3), b.mB.toFixed(3), b.mC.toFixed(3), b.mMezcla.toFixed(3)].join(',') + '\n';
fs.writeFileSync(path.join(SALIDA, 'bateria_seeing.csv'), csvB);
let csvM = 'modelo,rms_global,rms_f21,rms_f23,max_res,rms_banda_18_360\n';
for (const [nom, r] of Object.entries(RES))
  csvM += [JSON.stringify(nom), r.full.rms.toFixed(4), r.full.porFondo[21].toFixed(4),
           r.full.porFondo[23].toFixed(4), Math.abs(r.full.maxRes).toFixed(3), r.banda.rms.toFixed(4)].join(',') + '\n';
fs.writeFileSync(path.join(SALIDA, 'modelos.csv'), csvM);
fs.writeFileSync(path.join(SALIDA, 'parametros_conjuntos.json'), JSON.stringify({
  logCinf: { a0: P[0], a1: P[1] }, logThetaR: { b0: P[2], b1: P[3] },
  rmsGlobal: conj.rms, rmsPorFondo: conj.resPorFondo, maxRes: conj.maxRes,
  resSistematicoPorTheta: conj.resPorTheta
}, null, 2));
console.log('\nCSV/JSON escritos en simulador_ocular/docs/experimentos/ricco/seeing/');

if (fallos) { console.error('\n' + fallos + ' comprobaciones fallidas.'); process.exit(1); }
console.log('\nTodo consistente: exit 0.');
