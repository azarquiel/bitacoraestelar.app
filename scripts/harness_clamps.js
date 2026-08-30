#!/usr/bin/env node
/* HARNESS: ¿qué parte de lo observado la pone la física y qué parte el clamp?

   No toca producción. Se calcula la MISMA ley dos veces, con clamps y sin ellos,
   y se atribuye cada resultado a uno de los dos.

   Nada de esto elige valores nuevos. La pregunta es sólo: en el rango de tamaño
   aparente que DE VERDAD ocurre —el que producen las galaxias del catálogo y los
   aumentos usables—, ¿le hace falta a la función más de 1,62 mag, y dónde?

   Sin dependencias:  node scripts/harness_clamps.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/bitacora-ps1.js');
var R = global.window.BitacoraGaiaRender;
var FOT = R.fot, CFG = R.config;
var G = require('./lib_galaxias_sinteticas.js')(R);

var SQM = 21.3, T = 0.82, POJO = 7, D18 = 457;
var FCIELO = Math.pow(10, -0.4 * SQM);
var PLATEAU_PROV = 60, C_MAG_REF_B = PLATEAU_PROV * Math.pow(FOT.C_MAG_MIN, 1 / FOT.C_MAG_EXP);
var MAG_MIN = Math.ceil(D18 / POJO), MAG_MAX_USABLE = 400;   // 400x ≈ 2·D en pulgadas

function f(v, d) { return (v == null || !isFinite(v)) ? '-' : v.toFixed(d == null ? 3 : d); }
function fila(c) { console.log(c.join(' | ')); }
function libre(thetaAp) { return Math.pow(C_MAG_REF_B / thetaAp, FOT.C_MAG_EXP); }
function clampT(t) { return Math.max(FOT.C_MAG_MIN, Math.min(FOT.C_MAG_MAX, t)); }
function cminBase(D, MAG) {
  return R.ctxFotometrico({ sqm: SQM, transmision: T, pupilaOjo: POJO, pupilaSalida: D / MAG }).Cmin;
}
function umbralDe(c) { return -2.5 * Math.log10(FCIELO * c); }
function muLim(D, MAG, thetaArcmin, conClamp) {
  var t = libre(thetaArcmin * MAG);
  return umbralDe(cminBase(D, MAG) * (conClamp ? clampT(t) : t));
}
function optimo(D, valor) {
  var mejor = MAG_MIN, v = -Infinity;
  for (var m = MAG_MIN; m <= 2000; m++) {
    var x = valor(m);
    if (x > v + 1e-12) { v = x; mejor = m; }
  }
  return { mag: mejor, valor: v, borde: mejor === MAG_MIN || mejor === 2000 };
}
function txt(o) { return o.mag + 'x' + (o.borde ? '↓' : '') + ' · pupila ' + f(D18 / o.mag, 2) + ' mm'; }
function thetaRes(D) { return 2 * R.radioImagenEstelar(D); }   // ″

/* ═══ A/B. La curva con clamps y sin ellos ════════════════════════════════ */
console.log('\n═══ A+B. μ_lim de DETECCIÓN con y sin clamps (18″) ═══');
fila(['D25 (′)', 'MAG', 'θ ap. (′)', 'término libre', 'término clamp', 'μ_lim libre', 'μ_lim clamp', 'Δ']);
[0.5, 2, 10].forEach(function (d) {
  [66, 100, 200, 400, 800].forEach(function (MAG) {
    var t = libre(d * MAG), a = muLim(D18, MAG, d, false), b = muLim(D18, MAG, d, true);
    fila([f(d, 1), MAG + 'x', f(d * MAG, 1), f(t, 4), f(clampT(t), 4), f(a), f(b), f(b - a, 3)]);
  });
});

console.log('\n═══ C. Atribución: quién pone el máximo ═══');
fila(['D25 (′)', 'óptimo CON clamps', 'óptimo SIN clamps', 'diagnóstico']);
G.objetos.forEach(function (o) {
  var con = optimo(D18, function (m) { return muLim(D18, m, o.d25, true); });
  var sin = optimo(D18, function (m) { return muLim(D18, m, o.d25, false); });
  var diag = sin.mag >= 2000 ? 'sin clamp NO hay máximo: lo fabrica el clamp'
                             : 'máximo real, no lo pone el clamp';
  fila([f(o.d25, 1), txt(con), txt(sin), diag]);
});
console.log('  Sin clamps, 2·C_EXP − C_MAG_EXP = ' + f(2 * FOT.C_EXP - FOT.C_MAG_EXP, 2) +
  ' < 0: μ_lim crece con los aumentos SIN FIN.');
console.log('  Eso es lo que el clamp corta, y por eso todo óptimo que salga del término');
console.log('  de tamaño es, hoy, un artefacto del clamp y no una predicción física.');

/* ═══ D. ¿Qué θ aparente ocurre DE VERDAD? ════════════════════════════════ */
console.log('\n═══ D. Rango de tamaño aparente que ocurre de verdad ═══');
require('../simulador_ocular/resources/js/galaxias-datos.js');
var CAT = window.BITACORA_GALAXIAS;
function d25De(g) {
  var c = window.BitacoraPS1.ps1ComponentesSersic({ magV: g[7], reArcsec: g[4], n: g[8], ba: g[5], bt: g[9] });
  return 2 * G.radioIsofota(c, 25) / 60;
}
var d25s = CAT.map(d25De).filter(function (x) { return x > 0; }).sort(function (a, b) { return a - b; });
var dMin = d25s[0], dMax = d25s[d25s.length - 1], dMed = d25s[Math.floor(d25s.length / 2)];
console.log('  DETECCIÓN, θ_ap = D25 · MAG, con MAG ∈ [' + MAG_MIN + ', ' + MAG_MAX_USABLE + ']:');
fila(['   ', 'D25 (′)', 'θ_ap mín (′)', 'θ_ap máx (′)']);
[['menor', dMin], ['mediana', dMed], ['mayor', dMax]].forEach(function (p) {
  fila(['   ' + p[0], f(p[1], 2), f(p[1] * MAG_MIN, 1), f(p[1] * MAG_MAX_USABLE, 0)]);
});
console.log('  ⇒ la detección NUNCA baja de ' + f(dMin * MAG_MIN, 1) +
  '′ de tamaño aparente. Vive entera por encima');
console.log('    del plateau o muy cerca, que es donde la ley DEBE ser plana.');

console.log('\n  ESTRUCTURA, θ_ap = √(θ_detalle² + θ_res²) · MAG:');
fila(['   apertura', 'θ_res (″)', 'θ_ap mín. posible (′)', 'θ_ap de un brazo de 24″ a 400x (′)']);
[80, 203, 457, 914].forEach(function (D) {
  var tr = thetaRes(D);
  fila(['   ' + D + ' mm', f(tr, 2), f(tr / 60 * MAG_MIN, 2), f(Math.sqrt(24 * 24 + tr * tr) / 60 * 400, 1)]);
});
console.log('  ⇒ la estructura SÍ baja a pocos minutos aparentes: el detalle más fino que');
console.log('    la óptica entrega, al aumento mínimo, son ' + f(thetaRes(457) / 60 * MAG_MIN, 2) +
  '′ en un 18″.');

var thetaLo = thetaRes(914) / 60 * MAG_MIN, thetaHi = PLATEAU_PROV;
console.log('\n  Rango donde la ley NO debe ser plana: [' + f(thetaLo, 2) + '′, ' + thetaHi + '′].');
console.log('  Recorrido que pide, con C_MAG_EXP = ' + FOT.C_MAG_EXP + ': ' +
  f(2.5 * FOT.C_MAG_EXP * Math.log10(thetaHi / thetaLo), 2) + ' mag.');
console.log('  Recorrido disponible: ' + f(2.5 * Math.log10(FOT.C_MAG_MAX / FOT.C_MAG_MIN), 2) + ' mag.');

/* ═══ E. ¿Hay evidencia física para cada extremo? ═════════════════════════ */
console.log('\n═══ E. Los dos extremos no son la misma clase de cosa ═══');
console.log('  C_MAG_MIN (el suelo, objetos GRANDES en la retina):');
console.log('    · el comentario de f872dbe dice «satura cuando el objeto ya llena el campo».');
console.log('    · un ocular de 70° son 4200′ aparentes; el clamp de hoy satura en ' +
  f(C_MAG_REF_B / FOT.C_MAG_MIN, 0) + '′.');
console.log('    · pero SÍ hay un plateau perceptual real, el de Blackwell, en torno a 1° = 60′,');
console.log('      y da la casualidad de que es donde cae. El suelo tiene respaldo físico;');
console.log('      lo que no lo tiene es la justificación escrita.');
console.log('  C_MAG_MAX (el techo, objetos PEQUEÑOS en la retina):');
console.log('    · el comentario dice «por abajo no tiene sentido penalizar sin límite».');
console.log('    · no hay medida detrás: es una salvaguarda numérica.');
console.log('    · y va en el sentido CONTRARIO al fenómeno: por debajo de ~1′ aparente el');
console.log('      umbral no se aplana, se hace MÁS empinado (ley de Ricco, C·θ² ≈ cte).');
console.log('      Aplanar ahí no es conservador: es equivocarse en el signo de la curvatura.');

console.log('\n  ¿A quién tocaría subir el techo? Solo a quien hoy lo pisa.');
fila(['MAG', 'D25 por debajo de la cual el término ya está clavado en C_MAG_MAX', 'galaxias']);
[MAG_MIN, 100, 200, 400].forEach(function (MAG) {
  var dCorte = C_MAG_REF_B / (FOT.C_MAG_MAX * MAG);
  var n = d25s.filter(function (x) { return x < dCorte; }).length;
  fila([MAG + 'x', f(dCorte, 3) + '′', n + ' de ' + d25s.length + ' (' + f(100 * n / d25s.length, 1) + ' %)']);
});
console.log('  ⇒ ensanchar el techo NO mueve la detección de casi ninguna galaxia real.');
console.log('    Lo que desbloquea es la ESTRUCTURA, que es quien vive en θ_ap pequeño.');

/* ═══ Comprobaciones ══════════════════════════════════════════════════════ */
console.log('\n═══ Comprobaciones ═══');
console.log('  · producción intacta: este script solo LEE FOT/CFG y llama a ctxFotometrico.');
console.log('  · C_MAG_MIN = ' + FOT.C_MAG_MIN + ', C_MAG_MAX = ' + FOT.C_MAG_MAX +
  ', C_MAG_EXP = ' + FOT.C_MAG_EXP + ', sin tocar.');
console.log('  · seeing = ' + CFG.seeingArcsec + '″, airyArcsec = ' + CFG.airyArcsec + ', sin tocar.');
