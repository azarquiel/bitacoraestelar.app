#!/usr/bin/env node
/* Harness experimental C(θ): decidir si la ley de tamaño del umbral de contraste
   (C_MAG_* en ctxFotometrico) debe seguir siendo ∝ aumentos^-0.5 acotada, o si
   procede Ricco (C ∝ 1/θ², C·A = cte), o una transición física (H2).

   NO toca producción. Solo LEE resources/js/bitacora-gaia-render.js.

   Separación de efectos:
   A) modelo C_MAG: se mide llamando a ctxFotometrico() directamente (fórmula pura).
   B) PSF/seeing, C) remuestreo/bilineal, E) fotometría: EXCLUIDOS por construcción,
      aquí no se rasteriza nada. Solo se marca el régimen limitado por óptica
      (θ_intrínseco < seeing) para no confundirlo con Ricco.
   D) percepción por magnificación: es la variable medida (θ_aparente = θ_int·M).

   Verdad experimental: Blackwell (1946) tabla VIII vía Clark (1990) Ap. E,
   digitalizada en el ODM de Mel Bartels (calcLib.js, visualDetectCalcData):
   log10(C umbral) para 7 tamaños angulares APARENTES (arcmin) × 24 brillos de
   fondo (mag/arcsec², 4..27). Ningún número inventado: todo sale de esa tabla
   o de ajustes por mínimos cuadrados sobre ella. */
'use strict';

global.window = {};
require('/Users/isra/Documents/Código/bitacoraestelar/resources/js/bitacora-gaia-render.js');
const R = global.window.BitacoraGaiaRender;
const FOT = R.fot;

// ── Datos Blackwell/Clark (ODM de Bartels, sin modificar) ────────────────────
const LOG_ANGLE = [-0.2255, 0.5563, 0.9859, 1.260, 1.742, 2.083, 2.556]; // log10 arcmin
const ANGLE = LOG_ANGLE.map(a => Math.pow(10, a)); // 0.595,3.6,9.68,18.2,55.2,121,360
const BKGND_FIRST = 4; // mag/arcsec² de la primera fila
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
function filaFondo(mag) { // interpola entre filas enteras de fondo
  const x = Math.max(BKGND_FIRST, Math.min(27, mag)) - BKGND_FIRST;
  const i = Math.min(LTC.length - 2, Math.floor(x)), t = x - i;
  return LTC[i].map((v, k) => v * (1 - t) + LTC[i + 1][k] * t);
}

// ── Utilidades de ajuste ─────────────────────────────────────────────────────
function ajusteLineal(xs, ys) { // y = a + b·x, mínimos cuadrados
  const n = xs.length;
  const sx = xs.reduce((s, v) => s + v, 0), sy = ys.reduce((s, v) => s + v, 0);
  const sxx = xs.reduce((s, v) => s + v * v, 0);
  const sxy = xs.reduce((s, v, i) => s + v * ys[i], 0);
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const a = (sy - b * sx) / n;
  const res = ys.map((y, i) => y - (a + b * xs[i]));
  const rms = Math.sqrt(res.reduce((s, r) => s + r * r, 0) / n);
  return { a, b, rms, res };
}
function ajustePendienteFija(xs, ys, b) { // y = a + b·x con b impuesta
  const n = xs.length;
  const a = ys.reduce((s, y, i) => s + (y - b * xs[i]), 0) / n;
  const res = ys.map((y, i) => y - (a + b * xs[i]));
  const rms = Math.sqrt(res.reduce((s, r) => s + r * r, 0) / n);
  return { a, b, rms, res };
}
/* H2: C(θ) = C∞ · (1 + θR/θ)²  →  plateau en θ≫θR, pendiente −2 en θ≪θR.
   Forma estándar de sumación espacial parcial (misma familia que usa Crumey
   2014 para los datos de Blackwell); θR es el ÚNICO parámetro de escala y se
   AJUSTA, no se asume. Barrido en rejilla logC∞ × logθR, refinado. */
function ajusteH2(logT, logC) {
  let mejor = null;
  const errar = (lC8, lTR) => {
    const C8 = Math.pow(10, lC8), TR = Math.pow(10, lTR);
    let s = 0;
    for (let i = 0; i < logT.length; i++) {
      const m = Math.log10(C8) + 2 * Math.log10(1 + TR / Math.pow(10, logT[i]));
      s += (logC[i] - m) * (logC[i] - m);
    }
    return Math.sqrt(s / logT.length);
  };
  for (let paso = 0.1, cl = -3.5, cu = 1, tl = -1, tu = 3.2, k = 0; k < 4; k++, paso /= 8) {
    for (let lC8 = cl; lC8 <= cu; lC8 += paso)
      for (let lTR = tl; lTR <= tu; lTR += paso) {
        const e = errar(lC8, lTR);
        if (!mejor || e < mejor.rms) mejor = { lC8, lTR, rms: e };
      }
    cl = mejor.lC8 - paso; cu = mejor.lC8 + paso;
    tl = mejor.lTR - paso; tu = mejor.lTR + paso;
  }
  mejor.pred = logT.map(lt =>
    mejor.lC8 + 2 * Math.log10(1 + Math.pow(10, mejor.lTR) / Math.pow(10, lt)));
  mejor.res = logC.map((c, i) => c - mejor.pred[i]);
  return mejor;
}

// ── Parte 1: comportamiento del MODELO actual (efecto A aislado) ─────────────
// Factor C_MAG en función de aumentos; θ_aparente = θ_int · M.
function factorModelo(M) {
  const base = R.ctxFotometrico({ pupilaSalida: 7, pupilaOjo: 7, sqm: 21, transmision: 1 });
  const con = R.ctxFotometrico({ pupilaSalida: 7, pupilaOjo: 7, sqm: 21, transmision: 1, aumentos: M });
  return con.Cmin / base.Cmin;
}

// ── Parte 2: análisis de la verdad experimental ──────────────────────────────
function analizaFondo(fondo) {
  const logC = filaFondo(fondo);
  const filas = ANGLE.map((th, i) => {
    const C = Math.pow(10, logC[i]);
    const A = Math.PI / 4 * th * th; // arcmin², disco
    // pendiente local centrada (extremos: lateral)
    const i0 = Math.max(0, i - 1), i1 = Math.min(6, i + 1);
    const pend = (logC[i1] - logC[i0]) / (LOG_ANGLE[i1] - LOG_ANGLE[i0]);
    return { th, logTh: LOG_ANGLE[i], A, logA: Math.log10(A), C, logC: logC[i],
             CA: C * A, pend };
  });
  // ajustes H0/H1 sobre TODA la fila y sobre el tramo pequeño (θ ≤ 10′)
  const lT = LOG_ANGLE, lC = logC;
  const peq = [0, 1, 2];
  return {
    fondo, filas,
    libre:  ajusteLineal(lT, lC),
    H0:     ajustePendienteFija(lT, lC, -1),
    H1:     ajustePendienteFija(lT, lC, -2),
    H2:     ajusteH2(lT, lC),
    librePeq: ajusteLineal(peq.map(i => lT[i]), peq.map(i => lC[i])),
    H0peq:  ajustePendienteFija(peq.map(i => lT[i]), peq.map(i => lC[i]), -1),
    H1peq:  ajustePendienteFija(peq.map(i => lT[i]), peq.map(i => lC[i]), -2),
    // banda operativa del simulador: θ_app ≈ 18–360′ (objetos reales × aumentos)
    libreBanda: ajusteLineal(lT.slice(3), lC.slice(3))
  };
}

// ── Salida ───────────────────────────────────────────────────────────────────
const f2 = v => (v >= 0 ? ' ' : '') + v.toFixed(2);
const f3 = v => (v >= 0 ? ' ' : '') + v.toFixed(3);

console.log('LEY ACTUAL (ctxFotometrico, efecto A aislado; sqm 21, pupila 7):');
console.log('  M     factor C_MAG   nota');
[10, 25, 50, 100, 200, 400, 494, 800].forEach(M => {
  const f = factorModelo(M);
  const teor = Math.pow(FOT.C_MAG_REF / M, FOT.C_MAG_EXP);
  const nota = teor > FOT.C_MAG_MAX ? 'RECORTADO por C_MAG_MAX' :
               teor < FOT.C_MAG_MIN ? 'RECORTADO por C_MAG_MIN' : 'ley (100/M)^0.5';
  console.log('  ' + String(M).padEnd(5) + f.toFixed(3).padStart(8) + '       ' + nota);
});
console.log('  Banda activa de la ley: M ∈ [' +
  (FOT.C_MAG_REF / Math.pow(1 / FOT.C_MAG_MAX, 1 / FOT.C_MAG_EXP)).toFixed(0) + ', ' +
  (FOT.C_MAG_REF / Math.pow(1 / FOT.C_MAG_MIN, 1 / FOT.C_MAG_EXP)).toFixed(0) + '];' +
  ' exponente en θ_aparente (a objeto fijo): -' + FOT.C_MAG_EXP);
console.log('  Rango dinámico total del factor: ' + (FOT.C_MAG_MAX / FOT.C_MAG_MIN).toFixed(2) + 'x');

const FONDOS = [13, 17, 19, 21, 23]; // mag/arcsec² EN EL OJO (tras pupila+T)
const analisis = FONDOS.map(analizaFondo);

for (const an of analisis) {
  console.log('\n════ FONDO ' + an.fondo + ' mag/arcsec² (Blackwell/Clark) ════');
  console.log('  θ(arcmin)  logθ    área(am²)  logA    logC     C·A      pend.local');
  for (const r of an.filas) {
    console.log('  ' + r.th.toFixed(2).padEnd(9) + f2(r.logTh) + '  ' +
      r.A.toFixed(1).padStart(9) + '  ' + f2(r.logA) + '  ' + f3(r.logC) + '  ' +
      r.CA.toExponential(2).padStart(8) + '  ' + f2(r.pend));
  }
  console.log('  Ajustes (rms en dex de logC):');
  console.log('    libre  toda la fila: pendiente ' + f3(an.libre.b) + '  rms ' + an.libre.rms.toFixed(3));
  console.log('    H0 (−1)             rms ' + an.H0.rms.toFixed(3) +
              '   |  tramo θ≤10′: rms ' + an.H0peq.rms.toFixed(3));
  console.log('    H1 (−2)             rms ' + an.H1.rms.toFixed(3) +
              '   |  tramo θ≤10′: rms ' + an.H1peq.rms.toFixed(3) +
              '  (pendiente libre del tramo: ' + f3(an.librePeq.b) + ')');
  console.log('    H2 plateau+Ricco    rms ' + an.H2.rms.toFixed(3) +
              '   θR = ' + Math.pow(10, an.H2.lTR).toFixed(1) + '′' +
              '   área Ricco ≈ ' + (Math.PI / 4 * Math.pow(Math.pow(10, an.H2.lTR), 2)).toFixed(0) + ' arcmin²' +
              '   C∞ = ' + Math.pow(10, an.H2.lC8).toExponential(2));
  console.log('    residuales H2 por θ: ' + an.H2.res.map(r => f3(r)).join(' '));
  console.log('    pendiente libre banda operativa (18–360′): ' + f3(an.libreBanda.b) +
              '  rms ' + an.libreBanda.rms.toFixed(3));
}

// ── Meta-ajustes: ¿los parámetros H2 siguen leyes ya presentes en el modelo? ─
const lF = analisis.map(a => a.fondo);
const lC8s = analisis.map(a => a.H2.lC8);
const lTRs = analisis.map(a => a.H2.lTR);
const mC8 = ajusteLineal(lF, lC8s);
const mTR = ajusteLineal(lF, lTRs);
console.log('\nMETA-AJUSTES sobre parámetros H2 (5 fondos):');
console.log('  log10 C∞  = ' + f3(mC8.a) + ' + ' + f3(mC8.b) + '·fondo(mag)  rms ' +
  mC8.rms.toFixed(3) + '  →  C∞ ∝ Fcielo^' + f3(-mC8.b / 0.4) +
  '   (ley C_MIN actual: exponente ' + FOT.C_EXP + ')');
console.log('  log10 θR  = ' + f3(mTR.a) + ' + ' + f3(mTR.b) + '·fondo(mag)  rms ' +
  mTR.rms.toFixed(3) + '  →  θR ∝ Fcielo^' + f3(-mTR.b / 0.4) +
  '   (área de Ricco NO constante: crece con fondo oscuro)');

// ── Parte 3: modelo vs datos en θ_aparente, normalizado al mismo punto ──────
// La ley del modelo es f(M); a objeto fijo θ_app = θ_int·M, así que su forma en
// θ_app es la misma potencia −0.5 con los mismos recortes. Se compara la FORMA:
// todo normalizado a θ_app = 100′ (dentro de la banda activa y de la tabla).
console.log('\n════ FORMA: datos (fondo 21) vs ley actual vs H0 vs H1, normalizado a 100′ ════');
const an21 = analizaFondo(21);
const logC21 = filaFondo(21);
const interp = (lt) => { // interpola logC de la fila 21 en logθ arbitrario
  if (lt <= LOG_ANGLE[0]) // extrapola con pendiente −2 medida en el extremo
    return logC21[0] - 2 * (lt - LOG_ANGLE[0]);
  for (let i = 0; i < 6; i++)
    if (lt <= LOG_ANGLE[i + 1]) {
      const t = (lt - LOG_ANGLE[i]) / (LOG_ANGLE[i + 1] - LOG_ANGLE[i]);
      return logC21[i] * (1 - t) + logC21[i + 1] * t;
    }
  // extrapola con la última pendiente local
  const p = (logC21[6] - logC21[5]) / (LOG_ANGLE[6] - LOG_ANGLE[5]);
  return logC21[6] + p * (lt - LOG_ANGLE[6]);
};
const ref = Math.log10(100);
const datosRef = interp(ref);
console.log('  θ_app     datos    ley actual (M-only, θ_int fijo)   1/θ      1/θ²');
[1, 3, 10, 30, 100, 300, 1000, 3000].forEach(th => {
  const lt = Math.log10(th);
  const datos = interp(lt) - datosRef;
  // ley actual: C ∝ M^-0.5 ∝ θ_app^-0.5 con recortes; banda M∈[25,494] se
  // traduce en factor dinámico 2/0.45 en torno al punto de normalización.
  const leySin = -0.5 * (lt - ref);
  const ley = Math.max(Math.log10(0.45 / 1), Math.min(Math.log10(2 / 1), leySin));
  console.log('  ' + String(th).padEnd(7) + f3(datos) + '   ' + f3(ley) +
    (ley !== leySin ? ' (recortado)' : '            ') +
    '            ' + f3(-1 * (lt - ref)) + '   ' + f3(-2 * (lt - ref)));
});
const notaOptica = '\nRégimen limitado por óptica: con seeing s (arcsec), un objeto con ' +
  'θ_int < s no es fuente extensa a NINGÚN aumento (θ_app crece pero la óptica ya ' +
  'fijó su perfil): registrar como óptica, no como Ricco. La tabla Blackwell es de ' +
  'laboratorio (ojo solo), no contiene ese efecto.';
console.log(notaOptica);

// CSV para las gráficas
const fs = require('fs');
let csv = 'fondo,theta_arcmin,log_theta,area_arcmin2,log_area,logC,C,CA,pend_local\n';
for (const an of analisis)
  for (const r of an.filas)
    csv += [an.fondo, r.th, r.logTh, r.A.toFixed(3), r.logA.toFixed(4),
            r.logC, r.C.toExponential(4), r.CA.toExponential(4), r.pend.toFixed(3)].join(',') + '\n';
fs.writeFileSync(__dirname + '/blackwell_analisis.csv', csv);
let csvFit = 'fondo,pend_libre,rms_libre,rms_H0,rms_H1,rms_H2,thetaR_arcmin,area_ricco_arcmin2,C_inf,pend_libre_peq,rms_H0_peq,rms_H1_peq\n';
for (const an of analisis)
  csvFit += [an.fondo, an.libre.b.toFixed(3), an.libre.rms.toFixed(4), an.H0.rms.toFixed(4),
             an.H1.rms.toFixed(4), an.H2.rms.toFixed(4), Math.pow(10, an.H2.lTR).toFixed(2),
             (Math.PI / 4 * Math.pow(Math.pow(10, an.H2.lTR), 2)).toFixed(1),
             Math.pow(10, an.H2.lC8).toExponential(3), an.librePeq.b.toFixed(3),
             an.H0peq.rms.toFixed(4), an.H1peq.rms.toFixed(4)].join(',') + '\n';
fs.writeFileSync(__dirname + '/ajustes.csv', csvFit);
console.log('\nCSV escritos: blackwell_analisis.csv, ajustes.csv');
