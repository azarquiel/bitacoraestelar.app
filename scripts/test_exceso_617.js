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

if (fallos) { console.error('\n' + fallos + ' fallo(s)'); process.exit(1); }
console.log('\ntodo ok');
