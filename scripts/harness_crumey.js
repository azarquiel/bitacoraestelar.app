#!/usr/bin/env node
/* Banco externo Crumey 2014 (MNRAS 442, 2600; arXiv:1405.4209) junto al de
   Schaefer. Crumey refuta la curvatura de Hecht en que se apoya Schaefer, así
   que este banco mide `magLimite` contra un patrón primario distinto. Esto
   MIDE, no ajusta: no toca ninguna ley de producción (ADR 0004).

   Solo se comparan invariantes libres del factor de campo F: sup y pen de la
   Tabla 1 y las pendientes 5 / 2,131 / 0 de m0 frente a −log d (§3.2).

   node scripts/harness_crumey.js */
'use strict';

// Constantes del modelo escotópico (Ecs. 48–49) y fotometría (§1.3, Z de Cox 1999).
var R1 = 6.505e-4, R2 = -8.461e-4, K1 = 7.633e-3, K2 = -7.174e-3;
var Z = 2.54e-6; // lx

function luminanciaDeMu(mu) { return Math.pow(10, -0.4 * (mu - 12.58)); } // cd m⁻²
function magDeIluminancia(I) { return -2.5 * Math.log10(I / Z); }

// Ec. 53: umbral puntual a ojo desnudo, ΔI = F·(r1·B^¼ + r2·B^½)² [lx].
function crumeyM0(muSky, F) {
  var B = luminanciaDeMu(muSky);
  var raiz = R1 * Math.pow(B, 0.25) + R2 * Math.sqrt(B);
  return magDeIluminancia(F * raiz * raiz);
}

// Ec. 56: brillo superficial límite de un objeto infinito, ΔB∞ = F·(k1·B^¾ + k2·B).
function crumeyMuInf(muSky, F) {
  var B = luminanciaDeMu(muSky);
  return -2.5 * Math.log10(F * (K1 * Math.pow(B, 0.75) + K2 * B)) + 12.58;
}

/* Magnitud límite puntual en el ocular (Ecs. 66, 68, 70, 71). Longitudes en
   metros: D apertura, d pupila de salida, p pupila del ojo. BsobreFt = B/Ft,
   cielo del cénit por la transmitancia; phi = Ft·FM·FT·F. Por debajo de
   Ba = 10⁻⁵ cd m⁻² (fondo efectivamente nulo) el umbral queda constante. */
var B_NULO = 1e-5;
var ZETA = Math.pow(Math.pow(10, -5 / 4) * R1 + Math.pow(10, -5 / 2) * R2, 2); // Ec. 71, 1,150×10⁻⁹ lx
function crumeyM0Telescopio(D, d, p, BsobreFt, phi) {
  var dMin = Math.min(d, p), dMax = Math.max(d, p);
  var Ba = Math.pow(dMin / p, 2) * BsobreFt;
  var dI;
  if (Ba <= B_NULO) {
    dI = ZETA * Math.pow(p / D, 2) * phi;
  } else {
    var raiz = R1 * Math.pow(Ba, 0.25) + R2 * Math.sqrt(Ba);
    dI = Math.pow(dMax / D, 2) * phi * raiz * raiz;
  }
  return magDeIluminancia(dI);
}

// Ec. 70: pupila de salida en la que el fondo del ocular llega al nulo.
function crumeyD0(p, BsobreFt) { return p * Math.sqrt(B_NULO / BsobreFt); }

// Muestrea m0(d) en n+1 pupilas log-espaciadas, de dMax a dMin (x = −log d creciente).
function curvaPorPupila(m0DePupila, dMax, dMin, n) {
  var puntos = [];
  for (var i = 0; i <= n; i++) {
    var d = dMax * Math.pow(dMin / dMax, i / n);
    puntos.push({ d: d, x: -Math.log10(d), m: m0DePupila(d) });
  }
  return puntos;
}

/* Parte la curva m0 frente a −log d en tramos según la pendiente local, que se
   clasifica en la de Crumey más cercana (5, 2,131 o 0) si cae a menos de
   TOL_PENDIENTE, u «otra». Un tramo de menos de MIN_INTERVALOS intervalos es
   el intervalo que cruza un codo y se descarta. */
var PENDIENTES = [['5', 5], ['2,131', 2.131], ['0', 0]];
var TOL_PENDIENTE = 0.5, MIN_INTERVALOS = 3;
function claseDePendiente(s) {
  var mejor = 'otra', dist = TOL_PENDIENTE;
  PENDIENTES.forEach(function (p) {
    if (Math.abs(s - p[1]) < dist) { dist = Math.abs(s - p[1]); mejor = p[0]; }
  });
  return mejor;
}
function tramos(curva) {
  var runs = [];
  for (var i = 1; i < curva.length; i++) {
    var a = curva[i - 1], b = curva[i];
    var s = (b.m - a.m) / (b.x - a.x), clase = claseDePendiente(s);
    var ult = runs[runs.length - 1];
    if (ult && ult.clase === clase) { ult.fin = b; ult.suma += s; ult.n++; }
    else runs.push({ clase: clase, ini: a, fin: b, suma: s, n: 1 });
  }
  var limpios = runs.filter(function (r) { return r.n >= MIN_INTERVALOS; });
  var fusion = [];
  limpios.forEach(function (r) {
    var ult = fusion[fusion.length - 1];
    if (ult && ult.clase === r.clase) { ult.fin = r.fin; ult.suma += r.suma; ult.n += r.n; }
    else fusion.push(r);
  });
  return fusion.map(function (r) {
    return {
      clase: r.clase, pendiente: (r.fin.m - r.ini.m) / (r.fin.x - r.ini.x),
      dIniMm: r.ini.d * 1e3, dFinMm: r.fin.d * 1e3, mIni: r.ini.m, mFin: r.fin.m
    };
  });
}

// Tabla 1 del paper, literal: [µsky, pen = m22 − m0, sup = µ∞ − m0].
var TABLA1 = [
  [22.00, 0.00, 18.06], [21.75, 0.10, 17.98], [21.50, 0.20, 17.90], [21.25, 0.30, 17.82],
  [21.00, 0.40, 17.74], [20.75, 0.49, 17.66], [20.50, 0.59, 17.58], [20.25, 0.68, 17.49],
  [20.00, 0.77, 17.40], [19.75, 0.85, 17.32], [19.50, 0.93, 17.22], [19.25, 1.01, 17.13]
];

// Invariantes libres de F (§3.4): cualquier F vale, se cancela.
function crumeySup(muSky) { return crumeyMuInf(muSky, 1) - crumeyM0(muSky, 1); }
function crumeyPen(muSky) { return crumeyM0(22, 1) - crumeyM0(muSky, 1); }

/* Autotest contra cifras que publica el propio paper. Aborta si alguna se
   desvía más que la precisión con que el paper la da. */
function autotest() {
  var fallos = [];
  function cerca(v, esperado, tol, que) {
    if (!(Math.abs(v - esperado) <= tol)) fallos.push(que + ': ' + v + ' frente a ' + esperado);
  }
  // §2.3, tras la Ec. 55: «B = 2×10⁻⁴ cd m⁻² (21.83 mag arcsec⁻²) … m0 = 6.93 − 2.5 log F»
  // y «F = 2 (limit 6.18 mag)».
  var mu2e4 = -2.5 * Math.log10(2e-4) + 12.58;
  cerca(crumeyM0(mu2e4, 1), 6.93, 0.005, 'Ec. 53, m0 con F=1');
  cerca(crumeyM0(mu2e4, 2), 6.18, 0.005, 'Ec. 53, m0 con F=2');
  // §2.3, tras la Ec. 56: «with µsky = 21.83 … µ∞ = 24.94 − 2.5 log F».
  cerca(crumeyMuInf(21.83, 1), 24.94, 0.005, 'Ec. 56, µ∞ con F=1');
  /* Tabla 1, dos decimales. Las dos columnas que cita el paper en el texto
     (sup 18,06 a µsky 22 y 17,90 a 21,5) van a la precisión publicada, 0,005.
     El resto lleva una unidad del último dígito: con las Ecs. 53/56 exactas el
     residuo llega a 0,008 (µsky 19,75) con signo alterno y sin tendencia, o
     sea el redondeo del autor. Las aproximaciones lineales (Ecs. 54, 57)
     derivan hasta 0,075 con tendencia: la tabla sale de las exactas. */
  TABLA1.forEach(function (fila) {
    var tolSup = (fila[0] === 22 || fila[0] === 21.5) ? 0.005 : 0.01;
    cerca(crumeySup(fila[0]), fila[2], tolSup, 'Tabla 1, sup a µsky ' + fila[0]);
    cerca(crumeyPen(fila[0]), fila[1], 0.01, 'Tabla 1, pen a µsky ' + fila[0]);
  });
  /* Ley telescópica. Ec. 73: con FM=1, FT=√2, p=7 mm y Ft=1,33,
     mcut = 5 log D[cm] + 8,45 − 2,5 log F. */
  var phi73 = 1.33 * Math.SQRT2 * 2;
  var mcut10 = crumeyM0Telescopio(0.1, 1e-5, 7e-3, luminanciaDeMu(21) / 1.33, phi73);
  cerca(mcut10 - 5 * Math.log10(10) + 2.5 * Math.log10(2), 8.45, 0.005, 'Ec. 73, constante del corte');
  // Fig. 13: D = 100 mm, FtFMFTF = 3,77 → «The cut-off mcut = 12.7 mag».
  cerca(crumeyM0Telescopio(0.1, 1e-5, 7e-3, luminanciaDeMu(21) / 1.33, 3.77), 12.7, 0.05, 'Fig. 13, corte a D=100 mm');
  /* Bowen 6 pulgadas (§3.2): p = 5,2 mm, B/Ft = 2,70×10⁻⁴, FtFMFTF = 4,78, y
     sus tres rectas ajustadas (Ec. 74). 0,1 mag: rectas de ajuste a datos, y
     el paper da 0,09 de r.m.s. a su modelo sobre Bowen. */
  function bowen(d) { return crumeyM0Telescopio(0.152, d, 5.2e-3, 2.70e-4, 4.78); }
  cerca(bowen(8e-3), -5 * Math.log10(8e-3) + 1.02, 0.1, 'Ec. 74, Bowen tramo d≥p (8 mm)');
  cerca(bowen(2.5e-3), -2.131 * Math.log10(2.5e-3) + 7.57, 0.1, 'Ec. 74, Bowen tramo intermedio (2,5 mm)');
  cerca(bowen(0.5e-3), 13.96, 0.1, 'Ec. 74, Bowen corte (0,5 mm)');
  // §3.2: la intersección de sus dos últimas rectas «fixes d0 = 1.0 mm».
  cerca(crumeyD0(5.2e-3, 2.70e-4) * 1e3, 1.0, 0.05, 'Ec. 70, d0 de Bowen en mm');
  /* §3.2: «the graph of m0 versus −log d consists of three straight sections
     with gradients 5 (d≥p), 2.131 (p≥d≥d0) and 0 (d≤d0)». Oráculo del
     detector: la curva de Bowen debe dar esos tres tramos y esos dos codos. */
  var tb = tramos(curvaPorPupila(bowen, 20e-3, 0.2e-3, 200));
  if (tb.length !== 3) fallos.push('§3.2, tramos de Bowen: ' + tb.length + ' en vez de 3 (' +
    tb.map(function (t) { return t.clase; }).join(', ') + ')');
  else {
    ['5', '2,131', '0'].forEach(function (c, i) {
      if (tb[i].clase !== c) fallos.push('§3.2, tramo ' + (i + 1) + ' de Bowen es ' + tb[i].clase + ', no ' + c);
    });
    cerca(tb[0].dFinMm, 5.2, 0.2, '§3.2, codo d = p de Bowen en mm');
    cerca(tb[1].dFinMm, 1.0, 0.1, '§3.2, codo d = d0 de Bowen en mm');
  }
  if (fallos.length) {
    console.error('AUTOTEST FALLA — la implementación no reproduce el paper:\n  ' + fallos.join('\n  '));
    process.exit(1);
  }
}

module.exports = {
  crumeyM0: crumeyM0, crumeyMuInf: crumeyMuInf, crumeySup: crumeySup, crumeyPen: crumeyPen,
  crumeyM0Telescopio: crumeyM0Telescopio, crumeyD0: crumeyD0,
  curvaPorPupila: curvaPorPupila, tramos: tramos, autotest: autotest
};
if (require.main !== module) return;

autotest();
console.log('autotest Crumey: OK (m0, µ∞, Tabla 1, Ecs. 70–74 y los tres tramos de Bowen)\n');

var path = require('path');
global.window = {};
require(path.join(__dirname, '..', 'resources', 'js', 'bitacora-gaia-render.js'));
var R = global.window.BitacoraGaiaRender;
function f2(x) { return (x >= 0 ? '+' : '') + x.toFixed(2); }

/* ── 1. sup y pen de la Tabla 1 ──────────────────────────────────────────────
   Repo a ojo desnudo: m0 = magLimite con D = pupila = 7 mm y M = 1; µ∞ = la
   meseta de ctxFotometrico (sin aumentos no entra el término de tamaño de H2c,
   que es exactamente la asíntota A → ∞). magLimite se evalúa aquí fuera de su
   dominio de calibración telescópica: pen mide ley + extrapolación, sup es más
   limpio porque µ∞ sale de la ley de producción. */
function repoM0(sqm) { return R.magLimite({ apertura: 7, aumentos: 1, transmision: 1, sqm: sqm, pupilaOjo: 7 }); }
function repoMuInf(sqm) {
  return R.sbUmbralContraste(R.ctxFotometrico({ sqm: sqm, pupilaSalida: 7, pupilaOjo: 7, transmision: 1 }));
}
console.log('1 · Invariantes de la Tabla 1 (libres de F), ojo desnudo');
console.log('  µsky   sup Crumey  sup repo    Δsup   pen Crumey  pen repo    Δpen');
var dSup = [], dPen = [];
TABLA1.forEach(function (f) {
  var mu = f[0], supR = repoMuInf(mu) - repoM0(mu), penR = repoM0(22) - repoM0(mu);
  dSup.push(supR - f[2]); dPen.push(penR - f[1]);
  console.log('  ' + mu.toFixed(2) + f[2].toFixed(2).padStart(11) + supR.toFixed(2).padStart(10) +
    f2(supR - f[2]).padStart(8) + f[1].toFixed(2).padStart(12) + penR.toFixed(2).padStart(10) + f2(penR - f[1]).padStart(8));
});
var varSupC = TABLA1[8][2] - TABLA1[0][2], varSupR = (repoMuInf(20) - repoM0(20)) - (repoMuInf(22) - repoM0(22));
console.log('  Δsup en [' + f2(Math.min.apply(null, dSup)) + ', ' + f2(Math.max.apply(null, dSup)) +
  ']; Δpen en [' + f2(Math.min.apply(null, dPen)) + ', ' + f2(Math.max.apply(null, dPen)) + ']');
console.log('  sup(20) − sup(22): Crumey ' + f2(varSupC) + ', repo ' + f2(varSupR) +
  ' (la pendiente con el cielo, no el nivel)\n');

/* ── 2. m0 frente a −log d: ¿tiene magLimite los tres tramos? ───────────────
   Mismo equipo en las dos leyes. En Crumey, Ft = 1/t, FT = √2, FM = 1, F = 2:
   F solo desplaza la curva en vertical, así que el veredicto sale de las
   PENDIENTES y de dónde están los codos, no del nivel. */
var EQ = { D: 200, sqm: 21.5, t: 0.9, p: 7 };
var BsFt = luminanciaDeMu(EQ.sqm) * EQ.t, phiEq = (1 / EQ.t) * Math.SQRT2 * 2;
function mRepo(d) { return R.magLimite({ apertura: EQ.D, aumentos: EQ.D / (d * 1e3), transmision: EQ.t, sqm: EQ.sqm, pupilaOjo: EQ.p }); }
function mCrumey(d) { return crumeyM0Telescopio(EQ.D / 1e3, d, EQ.p / 1e3, BsFt, phiEq); }
var tR = tramos(curvaPorPupila(mRepo, 20e-3, 0.2e-3, 200));
var tC = tramos(curvaPorPupila(mCrumey, 20e-3, 0.2e-3, 200));
function pinta(nombre, ts) {
  console.log('  ' + nombre);
  ts.forEach(function (t) {
    console.log('    pendiente ' + t.clase.padEnd(6) + ' (medida ' + t.pendiente.toFixed(2) + ')  d ' +
      t.dIniMm.toFixed(2) + ' → ' + t.dFinMm.toFixed(2) + ' mm  (' + Math.round(EQ.D / t.dIniMm) + '× → ' +
      Math.round(EQ.D / t.dFinMm) + '×)  m0 ' + t.mIni.toFixed(2) + ' → ' + t.mFin.toFixed(2));
  });
}
console.log('2 · m0 frente a pupila de salida · D = ' + EQ.D + ' mm, cielo ' + EQ.sqm + ', t = ' + EQ.t + ', ojo ' + EQ.p + ' mm');
pinta('Crumey (Ecs. 66–71, F = 2):', tC);
pinta('magLimite (repo):', tR);
var d0 = crumeyD0(EQ.p / 1e3, BsFt) * 1e3;
console.log('  Corte de fondo cero de Crumey (Ec. 70): d0 = ' + d0.toFixed(2) + ' mm → ' + Math.round(EQ.D / d0) + '×');

console.log('\n── Veredicto de tramos ──');
var clasesRepo = tR.map(function (t) { return t.clase; });
['5', '2,131', '0'].forEach(function (c) {
  var t = tR.filter(function (x) { return x.clase === c; })[0];
  if (t) console.log('  tramo de pendiente ' + c + ': EXISTE en magLimite, d ' + t.dIniMm.toFixed(2) + ' → ' + t.dFinMm.toFixed(2) + ' mm');
  else console.log('  tramo de pendiente ' + c + ': FALTA en magLimite');
});
var plano = tR.filter(function (x) { return x.clase === '0'; })[0];
if (plano) console.log('  el tramo plano del repo empieza en ' + plano.dIniMm.toFixed(2) + ' mm (' + Math.round(EQ.D / plano.dIniMm) +
  '×); Crumey lo pone en ' + d0.toFixed(2) + ' mm (' + Math.round(EQ.D / d0) + '×), razón ' + (d0 / plano.dIniMm).toFixed(2));
else console.log('  el tramo plano debería empezar en d0 = ' + d0.toFixed(2) + ' mm (' + Math.round(EQ.D / d0) + '×)');
console.log('  secuencia del repo: ' + clasesRepo.join(' → ') + '   (Crumey: 5 → 2,131 → 0)');
