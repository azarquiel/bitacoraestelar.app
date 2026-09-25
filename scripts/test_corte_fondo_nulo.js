#!/usr/bin/env node
/* El corte de fondo cero de Crumey en magLimite (#342, ADR-0030). Los valores
   esperados salen de fuera del render: la Ec. 70 de Crumey (2014) y la Ec. 6 de
   Torres Lapasió, a mano.

   node scripts/test_corte_fondo_nulo.js */
'use strict';
var path = require('path');
global.window = {};
require(path.join(__dirname, '..', 'resources', 'js', 'bitacora-gaia-render.js'));
var R = global.window.BitacoraGaiaRender, FOT = R.fot;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) console.log('  ok   ' + etiqueta);
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function cerca(v, esperado, tol, etiqueta) {
  ok(Math.abs(v - esperado) <= tol, etiqueta + ' (' + v + ' frente a ' + esperado + ')');
}
function historico(fn) {
  var a = FOT.SB_FONDO_NULO, b = FOT.SB_SUELO_PINTADO;
  FOT.SB_FONDO_NULO = null; FOT.SB_SUELO_PINTADO = 27;
  try { return fn(); } finally { FOT.SB_FONDO_NULO = a; FOT.SB_SUELO_PINTADO = b; }
}
function ec6(SB0T, D, t) { return -22.81 + 1.792 * SB0T - 0.02949 * SB0T * SB0T + 2.5 * Math.log10(D * D * t); }
function mlim(D, M, sqm, extra) {
  var o = { apertura: D, aumentos: M, transmision: 0.9, sqm: sqm, pupilaOjo: 7 };
  for (var k in extra || {}) o[k] = extra[k];
  return R.magLimite(o);
}

console.log('Valores de producción:');
ok(FOT.SB_FONDO_NULO === 25.08, 'el fondo nulo es el 10⁻⁵ cd/m² de Crumey, 25,08 mag/arcsec²');
ok(FOT.SB_SUELO_PINTADO === FOT.SB_FONDO_NULO, 'la guarda del pintado comparte valor con el corte (ADR-0030, Decisión 3)');

/* Ec. 70: d0 = p·√(10⁻⁵·F_t / B). Con B y 10⁻⁵ en mag/arcsec² el punto cero
   se cancela: d0 = p·10^(−0,2·(25,08 − sqm)) / √t. 200 mm, cielo 21,5, t 0,9:
   1,419 mm, 141×. */
console.log('El plano empieza en d0 (Ec. 70):');
var d0 = 7 * Math.pow(10, -0.2 * (25.08 - 21.5)) / Math.sqrt(0.9);
cerca(d0, 1.419, 0.001, 'd0 a mano');
var dentro = 200 / (d0 * 0.999), fuera = 200 / (d0 * 1.001);
ok(mlim(200, dentro, 21.5) === mlim(200, 300, 21.5) && mlim(200, 300, 21.5) === mlim(200, 600, 21.5),
  'pasado d0 (d < d0) subir aumentos ya no sube el límite');
ok(mlim(200, fuera, 21.5) < mlim(200, dentro, 21.5) - 1e-4, 'antes de d0 todavía sube');

/* En el plano el fondo del ocular es el nulo, visto por la Ec. 5 con su pupila
   de 7,5 mm: SB0T = 25,08 + 5·log10(7,5/p). No depende del cielo, igual que
   el m_cut de la Ec. 73. */
console.log('El plano no depende del cielo:');
var SB0Tplano = 25.08 + 5 * Math.log10(7.5 / 7);
[21, 21.5, 22].forEach(function (sqm) {
  cerca(mlim(200, 1000, sqm), ec6(SB0Tplano, 200, 0.9), 1e-9, 'sqm ' + sqm + ': plano de 200 mm por la Ec. 6');
});
cerca(mlim(200, 1000, 21.5, { veloSB: 21.5 }), ec6(SB0Tplano, 200, 0.9), 1e-9, 'con velo: el velo mueve d0, no el plano');
/* El velo suma su flujo al cielo (21,5 ⊕ 21,5 = 20,75) y d0 baja a 1,00 mm:
   a 170× (d = 1,18 mm) sin velo ya está en el plano y con velo todavía no. */
ok(mlim(200, 170, 21.5) === mlim(200, 1000, 21.5) &&
   mlim(200, 170, 21.5, { veloSB: 21.5 }) < mlim(200, 1000, 21.5, { veloSB: 21.5 }) - 1e-4,
  'el d0 sale del cielo con el velo sumado');

console.log('Fuera del corte, la ley de siempre:');
[20, 50, 100, 140].forEach(function (M) {
  ok(mlim(200, M, 21.5) === historico(function () { return mlim(200, M, 21.5); }), '200 mm ' + M + '× (d ≥ d0): idéntica');
});
cerca(historico(function () { return mlim(200, 1000, 21.5); }), 15.467, 0.001, 'ley histórica alcanzable: plano de 27 a 15,47');

/* Con cielos más oscuros que ~24,97 a ojo desnudo d0 pasa de la pupila del
   ojo. Congelar ahí también la apertura efectiva haría que un cielo más oscuro
   enseñase menos estrellas: el corte congela solo el fondo. */
console.log('Un cielo más oscuro nunca enseña menos estrellas:');
[[457, 61], [200, 300], [100, 20]].forEach(function (eq) {
  var previo = -Infinity, cae = null;
  for (var s = 16; s <= 40; s += 0.25) {
    var v = mlim(eq[0], eq[1], s);
    if (v < previo - 1e-9 && cae == null) cae = s;
    previo = v;
  }
  ok(cae == null, eq[0] + ' mm ' + eq[1] + '×: monótona en el cielo' + (cae == null ? '' : ' — cae en sqm ' + cae));
});

console.log(fallos ? '\n' + fallos + ' fallo(s)' : '\nTodo correcto');
process.exit(fallos ? 1 : 0);
