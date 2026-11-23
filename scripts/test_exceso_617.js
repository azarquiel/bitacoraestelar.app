#!/usr/bin/env node
/* #617 · Huella del campo ACS y regla del prerregistro (ADR 0039, «El exceso de
   filas en 0,5-1 r_h: `num` o `c`»). node scripts/test_exceso_617.js */
'use strict';
var X = require('./exceso_617.js');

var fallos = 0;
function ok(cond, msg) {
  if (cond) console.log('  ok   ' + msg);
  else { fallos++; console.error('  FALLA ' + msg); }
}

// Huella: cuadrado de 40″ con 4 estrellas por celda de 4″ → 10×10 celdas, el
// borde erosionado deja 8×8; una celda suelta lejos no entra.
var hst = [];
for (var x = 0; x < 40; x += 2) for (var y = 0; y < 40; y += 2) hst.push({ x: x + 0.5, y: y + 0.5 });
hst.push({ x: 100.5, y: 100.5 }, { x: 101, y: 101 }, { x: 101.5, y: 101.5 });
var h = X.huella(hst, 4, 3);
ok(h.celdas.length === 64, 'huella erosionada: ' + h.celdas.length + ' celdas (64)');
ok(h.dentro({ x: 20, y: 20 }) && !h.dentro({ x: 1, y: 1 }) && !h.dentro({ x: 101, y: 101 }), 'dentro(): centro sí, borde y celda suelta no');

// Regla: el caso malo (todo el exceso en un término) falla ese término y no el otro.
var v = X.veredicto({ nHst: 1300, nMod: 466, nGaia: 1300, cMod: 0.98 });
ok(v.num.falla && !v.k.falla, 'todo en num (R_num 2,79): falla num, no k');
v = X.veredicto({ nHst: 1300, nMod: 1300, nGaia: 1300, cMod: 0.358 });
ok(!v.num.falla && v.k.falla, 'todo en k (c_emp/c_mod 2,79): falla k, no num');
v = X.veredicto({ nHst: 1300, nMod: 1250, nGaia: 640, cMod: 0.5 });
ok(!v.num.falla && !v.k.falla && v.noCuadra, 'ninguno falla: el método no cuadra');
// Fuera de la banda pero dentro de 2σ: no falla (N pequeño).
v = X.veredicto({ nHst: 10, nMod: 7, nGaia: 5, cMod: 0.5 });
ok(!v.num.falla, 'R_num 1,43 con N = 10 (σ 0,45): no falla');

ok(v.cuadra === false, 'producto 1,43 no cuadra con 2,79');
ok(X.veredicto({ nHst: 1300, nMod: 466, nGaia: 1300, cMod: 0.98 }).cuadra, 'producto 2,85 cuadra');

// Control: 47 ± 10 puntos; el 95,6 % de «todas las filas» no pasa.
ok(X.control(47, 100) && X.control(57, 100) && !X.control(58, 100) && !X.control(2527, 2643), 'control 47 ± 10: 57 sí, 58 y 95,6 no');

// #619: criterio de recuento (5/6 parámetros = ruwe no nulo, y BP−RP).
ok(X.recuperada({ ruwe: 1.0, color: true }) && !X.recuperada({ ruwe: null, color: true }) &&
   !X.recuperada({ ruwe: 1.0, color: false }) && !X.recuperada({ ruwe: 5, color: false }), 'recuperada: ruwe no nulo y BP−RP; ruwe alto no excluye');

// #619: lectura con el criterio y con todas las filas.
var M = { nHst: 1187, nMod: 1281 }, CM = 0.362;
function lee(nCrit, nTodas) {
  return X.lectura619(X.veredicto({ nHst: M.nHst, nMod: M.nMod, nGaia: nCrit, cMod: CM }),
                      X.veredicto({ nHst: M.nHst, nMod: M.nMod, nGaia: nTodas, cMod: CM }));
}
ok(lee(430, 1296) === 'c-cuenta', 'criterio cuadra con c_mod y todas las filas no: falla lo que cuenta c');
ok(lee(1000, 1296) === 'k', 'criterio también lejos de c_mod: falla k');
ok(lee(430, 430) === 'ninguno', 'criterio y todas cuadran: ninguno');
ok(X.lectura619(X.veredicto({ nHst: 1187, nMod: 400, nGaia: 430, cMod: CM }), X.veredicto({ nHst: 1187, nMod: 400, nGaia: 1296, cMod: CM })) === 'num',
   'R_num 2,97: falla num (manda sobre el resto)');

if (fallos) { console.error('\n' + fallos + ' fallo(s)'); process.exit(1); }
console.log('\ntodo ok');
