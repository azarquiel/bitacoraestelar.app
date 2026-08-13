#!/usr/bin/env node
/* EXPERIMENTO: ¿qué debe significar el término «tamaño» de Cmin?
   MEDIDA PURA. No toca producción: instrumenta la ley desde fuera.

   ctxFotometrico multiplica Cmin por clamp((C_MAG_REF/MAG)^C_MAG_EXP), o sea
   usa los AUMENTOS como medida del tamaño aparente. Los aumentos no son un
   tamaño: son un factor. El tamaño aparente es tamaño_angular × aumentos, y el
   objeto no aparece por ningún lado.

   Aquí se construyen siete objetos con la MISMA distribución de brillo
   superficial —mismo n, mismo b/a, mismo μ_e, mismo μ(r/r_e) punto por punto— y
   distinto tamaño angular, y se mide dónde cae el aumento óptimo de cada uno
   bajo la ley de hoy y bajo cinco candidatos de tamaño.

   Nada se cambia. La salida es una propuesta, no un parche.

   Sin dependencias:  node scripts/experimento_tamano_angular.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;
var FOT = R.fot;

var SQM = 21.3, T = 0.82, POJO = 7, D = 457;   // 18", fijo: la apertura no es la variable
var G = require('./lib_galaxias_sinteticas.js')(R);   // los siete objetos, compartidos
var MU_E = G.MU_E, N_SERSIC = G.N_SERSIC, BA = G.BA, TAMANOS = G.TAMANOS;
var MUS = [21, 22, 23, 24];

/* Blackwell: el umbral de contraste deja de bajar cuando el objeto llena ~1° de
   retina. Esa es la única constante física que entra aquí, y NO es una perilla
   nueva: es el valor que debería tener C_MAG_REF si midiera un tamaño en vez de
   un aumento. Con el clamp de hoy el beneficio satura en
   θ_ap = θ_REF·C_MAG_MIN^(−1/C_MAG_EXP), así que θ_REF sale de exigir que eso
   caiga en 60′. */
var PLATEAU_ARCMIN = 60;
var THETA_REF = PLATEAU_ARCMIN * Math.pow(FOT.C_MAG_MIN, 1 / FOT.C_MAG_EXP);

function f(v, d) { return (v == null || !isFinite(v)) ? '-' : v.toFixed(d == null ? 3 : d); }
function fila(c) { console.log(c.join(' | ')); }

// Los objetos y sus utilidades salen de lib_galaxias_sinteticas.js.
var mu = G.mu, radioIsofota = G.radioIsofota, OBJETOS = G.objetos;

console.log('Objetos sintéticos: n=' + N_SERSIC + ', b/a=' + BA + ', μ(r_e)=' + MU_E +
  ' · cielo sqm ' + SQM + ', T ' + T + ' · apertura ' + D + ' mm (18") fija');
console.log('C_EXP ' + FOT.C_EXP + ' · C_MAG_EXP ' + FOT.C_MAG_EXP + ' · C_MAG_REF ' +
  FOT.C_MAG_REF + ' · clamps [' + FOT.C_MAG_MIN + ', ' + FOT.C_MAG_MAX + ']');

fila(['\nD25 (′)', 'r_e (″)', 'magV', 'D_halo μ28,5 (′)', 'μ(0,5 r_e)', 'μ(1 r_e)', 'μ(2 r_e)']);
OBJETOS.forEach(function (o) {
  fila([f(o.d25, 2), f(o.re, 1), f(o.magV, 2), f(o.dHalo, 2),
    f(mu(o.comps, 0.5 * o.re)), f(mu(o.comps, o.re)), f(mu(o.comps, 2 * o.re))]);
});
console.log('  ↑ las tres columnas de μ son IDÉNTICAS: mismo perfil, solo escalado. ' +
  'Lo único que cambia entre los siete objetos es el tamaño angular.');

/* ── La ley, instrumentada ────────────────────────────────────────────────
   ctxFotometrico SIN `aumentos` devuelve Cmin sin el término de tamaño: ese es
   el tronco común (cielo + luminancia retinal). Encima se prueban las variantes.
   No se modifica nada del módulo. */
function cminBase(MAG) {
  return R.ctxFotometrico({ sqm: SQM, transmision: T, pupilaOjo: POJO,
    pupilaSalida: D / MAG }).Cmin;
}
var FCIELO = Math.pow(10, -0.4 * SQM);
function clampT(x) { return Math.max(FOT.C_MAG_MIN, Math.min(FOT.C_MAG_MAX, x)); }
// HOY: el tamaño aparente se sustituye por los aumentos a secas.
function terminoHoy(MAG) { return clampT(Math.pow(FOT.C_MAG_REF / MAG, FOT.C_MAG_EXP)); }
// CANDIDATO: tamaño aparente de verdad = tamaño angular × aumentos.
function terminoTam(thetaArcmin, MAG) {
  return clampT(Math.pow(THETA_REF / (thetaArcmin * MAG), FOT.C_MAG_EXP));
}
function umbralDe(cmin) { return -2.5 * Math.log10(FCIELO * cmin); }

/* Rango de aumentos FÍSICAMENTE usable. Por debajo de D/pupilaOjo la pupila de
   salida se sale del ojo: `dim` se clava en 1 y la luz sobrante se tira. Ahí la
   curva se aplana y un barrido ingenuo elige el extremo inferior como si fuera
   un óptimo, que no lo es. Por eso el barrido empieza en MAG_MIN. */
var MAG_MIN = Math.ceil(D / POJO), MAG_MAX = 2000;

/* Óptimo con detección de MESETA: si el máximo se alcanza en un tramo plano
   (los clamps aplanan la ley en los extremos), decirlo en vez de fingir un
   pico. Devuelve {mag, pupila, valor, meseta, borde}. */
function optimo(umbralEn) {
  var mejor = -Infinity, m;
  for (m = MAG_MIN; m <= MAG_MAX; m++) {
    var u = umbralEn(m);
    if (u > mejor) mejor = u;
  }
  var lo = 0, hi = 0;
  for (m = MAG_MIN; m <= MAG_MAX; m++) {
    if (umbralEn(m) >= mejor - 1e-9) { if (!lo) lo = m; hi = m; }
  }
  return { mag: lo, hi: hi, valor: mejor, pupila: D / lo,
           meseta: hi > lo * 1.02, borde: lo === MAG_MIN };
}
function textoOpt(o) {
  if (o.meseta) return o.mag + '–' + o.hi + 'x' + (o.borde ? '↓' : '');
  return o.mag + 'x' + (o.borde ? '↓' : '');
}

/* ── 1. La ley de HOY, sobre los siete objetos ────────────────────────────── */
var MAGS = [25, 50, 75, 100, 150, 222, 300, 400, 600];
console.log('\n═══ 1. LEY DE HOY — μ_lim (mag/arcsec²) contra aumentos ═══');
fila(['D25 (′)'].concat(MAGS.map(function (m) { return m + 'x'; })).concat(['óptimo', 'pupila óptimo']));
OBJETOS.forEach(function (o) {
  var op = optimo(function (m) { return umbralDe(cminBase(m) * terminoHoy(m)); });
  fila([f(o.d25, 2)].concat(MAGS.map(function (m) {
    return f(umbralDe(cminBase(m) * terminoHoy(m)), 2);
  })).concat([textoOpt(op), f(op.pupila, 2) + ' mm']));
});
console.log('  ↑ las siete filas son la MISMA fila. El objeto no entra en la ley.');

console.log('\n═══ 1b. Resto de las magnitudes pedidas, ley de hoy (18″, 150x) ═══');
fila(['D25 (′)', 'Cmin', 'término tamaño', 'μ_lim', 'r_det (″)', 'r_det / r_e',
  'r_det / D25'].concat(MUS.map(function (u) { return 'op μ=' + u; })));
OBJETOS.forEach(function (o) {
  var cmin = cminBase(150) * terminoHoy(150), u = umbralDe(cmin);
  var rDet = radioIsofota(o.comps, u);
  fila([f(o.d25, 2), f(cmin, 4), f(terminoHoy(150), 4), f(u), f(rDet, 1),
    f(rDet / o.re, 3), f(2 * rDet / (o.d25 * 60), 3)]
    .concat(MUS.map(function (x) { return f(R.ps1Opacidad(x, u), 3); })));
});
console.log('  ↑ μ_lim, Cmin y opacidad: iguales para los siete. El radio detectable en ″\n' +
  '    escala con el objeto, pero RELATIVO al objeto es constante: la ley no distingue.');

/* ── 2. Candidatos de tamaño angular ──────────────────────────────────────
   Todos con el MISMO θ_REF, fijado por el plateau de Blackwell. Así lo que se
   compara es la variable, no una recalibración escondida. */
var CANDIDATOS = [
  { id: 'D25 (isofota 25)',   theta: function (o) { return o.d25; } },
  { id: 'r_e (reArcsec)',     theta: function (o) { return o.re / 60; } },
  { id: '2·r_e (semiluz)',    theta: function (o) { return 2 * o.re / 60; } },
  { id: 'D_halo (μ28,5)',     theta: function (o) { return o.dHalo; } }
];

console.log('\n═══ 2. AUMENTO ÓPTIMO contra tamaño angular, por candidato ═══');
console.log('θ_REF = ' + f(THETA_REF, 2) + '′ (satura en θ aparente = ' + PLATEAU_ARCMIN +
  '′ = 1°, plateau de Blackwell) · mismo θ_REF en todos');
fila(['D25 (′)', 'HOY'].concat(CANDIDATOS.map(function (c) { return c.id; })));
console.log('  ↓ marca «x↓» = el óptimo cae en el aumento mínimo usable (' + MAG_MIN +
  'x, pupila ' + f(POJO, 1) + ' mm): la ley pide «lo más bajo posible».');
function optHoy() { return optimo(function (m) { return umbralDe(cminBase(m) * terminoHoy(m)); }); }
function optCand(c, o) {
  return optimo(function (m) { return umbralDe(cminBase(m) * terminoTam(c.theta(o), m)); });
}
OBJETOS.forEach(function (o) {
  fila([f(o.d25, 2), textoOpt(optHoy())]
    .concat(CANDIDATOS.map(function (c) { return textoOpt(optCand(c, o)); })));
});

console.log('\n═══ 2b. Pupila de salida en el óptimo (18″) ═══');
fila(['D25 (′)', 'HOY'].concat(CANDIDATOS.map(function (c) { return c.id; })));
OBJETOS.forEach(function (o) {
  fila([f(o.d25, 2), f(optHoy().pupila, 2) + ' mm']
    .concat(CANDIDATOS.map(function (c) { return f(optCand(c, o).pupila, 2) + ' mm'; })));
});

/* ── 3. Candidato LOCAL: el tamaño de la estructura que se está detectando ──
   Los cuatro de arriba miden el objeto ENTERO. Pero el ojo no detecta «una
   galaxia»: detecta una isofota. Para probar si el brillo μ se separa del cielo,
   la mancha relevante es la que está AL MENOS tan brillante como μ, o sea la
   isofota μ, de diámetro 2·r(μ). Eso hace Cmin dependiente del píxel, no del
   fotograma, y se resuelve por punto fijo: μ_lim es el μ que se detecta a sí
   mismo. El código ya sabe invertir el perfil (ps1RadioIsofota). */
function umbralLocal(o, MAG) {
  var u = 23;                                   // semilla
  for (var i = 0; i < 80; i++) {
    var theta = 2 * radioIsofota(o.comps, u) / 60;
    if (!(theta > 0)) return -Infinity;
    var nuevo = umbralDe(cminBase(MAG) * terminoTam(theta, MAG));
    if (Math.abs(nuevo - u) < 1e-9) return nuevo;
    u = u + 0.5 * (nuevo - u);                  // relajación: el punto fijo es contractivo
  }
  return u;
}
console.log('\n═══ 3. Candidato LOCAL (isofota que se está detectando) ═══');
fila(['D25 (′)'].concat(MAGS.map(function (m) { return m + 'x'; }))
  .concat(['óptimo', 'pupila', 'μ_lim óptimo', 'θ ap. en el óptimo (′)']));
OBJETOS.forEach(function (o) {
  var op = optimo(function (m) { return umbralLocal(o, m); });
  fila([f(o.d25, 2)].concat(MAGS.map(function (m) { return f(umbralLocal(o, m), 2); }))
    .concat([textoOpt(op), f(op.pupila, 2) + ' mm', f(op.valor, 2),
      f(2 * radioIsofota(o.comps, op.valor) / 60 * op.mag, 1)]));
});

/* ── 4. Qué tamaño supone HOY la ley ──────────────────────────────────────
   La ley de hoy y la candidata coinciden exactamente cuando
   θ_REF/(θ·MAG) = C_MAG_REF/MAG, o sea θ = θ_REF/C_MAG_REF. */
console.log('\n═══ 4. El tamaño que la ley de hoy da por supuesto ═══');
console.log('  θ implícito = θ_REF / C_MAG_REF = ' + f(THETA_REF, 2) + '′ / ' + FOT.C_MAG_REF +
  ' = ' + f(THETA_REF / FOT.C_MAG_REF * 60, 1) + '″ = ' + f(THETA_REF / FOT.C_MAG_REF, 3) + '′');
console.log('  Es decir: la ley trata a TODA galaxia como si midiera ' +
  f(THETA_REF / FOT.C_MAG_REF * 60, 0) + '″, más pequeña que cualquier');
console.log('  galaxia del catálogo. Por eso el óptimo le sale siempre en aumentos altos.');

/* ── 5. Anclas reales ─────────────────────────────────────────────────────
   Galaxias de verdad, con lo que un observador usa de hecho. No decide nada por
   sí solo, pero descarta candidatos que den absurdos. */
console.log('\n═══ 5. Anclas: galaxias reales en un 18″ ═══');
var REALES = [
  { nombre: 'M31   (178′×63′)',  magV: 3.44, re: 1200, n: 2, ba: 0.35,
    a25: 178, b25: 63, magUso: 50,  uso: '≈40-60x',   campo: true },
  { nombre: 'M81   (27′×14′)',   magV: 6.94, re: 200,  n: 3, ba: 0.52,
    a25: 27,  b25: 14, magUso: 125, uso: '≈100-150x' },
  { nombre: 'M101  (29′×27′)',   magV: 7.86, re: 330,  n: 1, ba: 0.98,
    a25: 29,  b25: 27, magUso: 80,  uso: '≈60-100x' },
  { nombre: 'NGC 7331 (10′×4′)', magV: 9.48, re: 100,  n: 3, ba: 0.35,
    a25: 10,  b25: 4,  magUso: 200, uso: '≈150-250x' },
  { nombre: 'NGC 4565 (16′×2′)', magV: 9.60, re: 110,  n: 3, ba: 0.13,
    a25: 16,  b25: 2,  magUso: 200, uso: '≈150-250x' },
  { nombre: 'M32   (8′×6′)',     magV: 8.08, re: 50,   n: 4, ba: 0.73,
    a25: 8,   b25: 6,  magUso: 250, uso: '≈200-300x' }
];
console.log('  (M31 no cabe en el campo de un 18″ ni a 66x: su «uso real» lo manda el campo,\n' +
  '   no la detectabilidad. Va marcada y NO cuenta en el ajuste de abajo.)');
fila(['galaxia', 'uso real', 'HOY'].concat(CANDIDATOS.map(function (c) { return c.id; }))
  .concat(['LOCAL']));
REALES.forEach(function (g) {
  var comps = R.ps1ComponentesSersic({ magV: g.magV, reArcsec: g.re, n: g.n, ba: g.ba, bt: 0 });
  var o = { d25: 2 * radioIsofota(comps, 25) / 60, re: g.re, comps: comps,
            dHalo: 2 * radioIsofota(comps, R.ps1.muHalo) / 60 };
  fila([g.nombre, g.uso, textoOpt(optHoy())]
    .concat(CANDIDATOS.map(function (c) { return textoOpt(optCand(c, o)); }))
    .concat([textoOpt(optimo(function (m) { return umbralLocal(o, m); }))]));
});

/* ── 6. LA PRUEBA DECISIVA: qué variable da un plateau CONSISTENTE ─────────
   Las secciones 2 y 5 salen todas pegadas al suelo de 66x, y eso no descarta a
   ningún candidato: solo dice que con θ_REF = 27′ el clamp se dispara antes de
   empezar. El clamp y la variable están confundidos.

   Se separan así. SIN clamp la ley no tiene óptimo ninguno: el exponente neto es
   constante (2·C_EXP − C_MAG_EXP = −0,30) y μ_lim sube con los aumentos para
   siempre. O sea, el máximo lo FABRICA el clamp, y cae justo donde el tamaño
   aparente alcanza el plateau:

       MAG_óptimo = θ_plateau / θ_objeto

   Así que la variable correcta es aquella para la que θ_plateau —despejado del
   aumento que un observador usa DE VERDAD— sale igual para todas las galaxias.
   Si una variable necesita un plateau distinto por objeto, no es la variable. */
/* Comprobación de que el óptimo lo fabrica el clamp y no la ley: sin clamp,
   μ_lim tiene que ser monótono creciente en los aumentos. */
(function () {
  var monotono = true, ant = -Infinity;
  for (var m = MAG_MIN; m <= MAG_MAX; m++) {
    var u = umbralDe(cminBase(m) * Math.pow(FOT.C_MAG_REF / m, FOT.C_MAG_EXP));
    if (u < ant - 1e-12) monotono = false;
    ant = u;
  }
  console.log('\n  comprobación · SIN clamp, μ_lim monótono creciente con los aumentos: ' +
    (monotono ? 'SÍ' : 'NO') + ' → el máximo no existe en la ley, lo crea el clamp.');
})();

console.log('\n═══ 6. PRUEBA DECISIVA: plateau implícito θ_plateau = θ × MAG_uso ═══');
var CAND6 = [
  { id: 'D25 mayor',    theta: function (g, o) { return g.a25; } },
  { id: 'D25 √(a·b)',   theta: function (g, o) { return Math.sqrt(g.a25 * g.b25); } },
  { id: 'D25 menor',    theta: function (g, o) { return g.b25; } },
  { id: 'r_e',          theta: function (g, o) { return g.re / 60; } },
  { id: '2·r_e',        theta: function (g, o) { return 2 * g.re / 60; } },
  { id: 'D_halo μ28,5', theta: function (g, o) { return o.dHalo; } },
  { id: 'LOCAL 2·r(μ_lim)', theta: function (g, o) { return o.thetaLocal; } }
];
var FILAS6 = REALES.map(function (g) {
  var comps = R.ps1ComponentesSersic({ magV: g.magV, reArcsec: g.re, n: g.n, ba: g.ba, bt: 0 });
  var o = { d25: 2 * radioIsofota(comps, 25) / 60, re: g.re, comps: comps,
            dHalo: 2 * radioIsofota(comps, R.ps1.muHalo) / 60 };
  o.thetaLocal = 2 * radioIsofota(comps, umbralLocal(o, g.magUso)) / 60;
  return { g: g, o: o };
});
function sinM31(c) {
  return FILAS6.filter(function (r) { return !r.g.campo; })
    .map(function (r) { return Math.log10(c.theta(r.g, r.o) * r.g.magUso); });
}
fila(['galaxia', 'MAG uso'].concat(CAND6.map(function (c) { return c.id; })));
FILAS6.forEach(function (r) {
  fila([r.g.nombre + (r.g.campo ? ' *' : ''), r.g.magUso + 'x']
    .concat(CAND6.map(function (c) { return f(c.theta(r.g, r.o) * r.g.magUso, 0) + '′'; })));
});
fila(['— dispersión (dex, sin M31) —', ''].concat(CAND6.map(function (c) {
  var v = sinM31(c), m = v.reduce(function (a, b) { return a + b; }, 0) / v.length;
  return f(Math.sqrt(v.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / v.length), 3);
})));
fila(['— plateau medio (′, sin M31) —', ''].concat(CAND6.map(function (c) {
  var v = sinM31(c);
  return f(Math.pow(10, v.reduce(function (a, b) { return a + b; }, 0) / v.length), 0) + '′';
})));
console.log('  Gana la dispersión MENOR: es la variable con la que UN SOLO plateau explica');
console.log('  todas las galaxias. * M31 excluida (limitada por campo, no por detección).');
