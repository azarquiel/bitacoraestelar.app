#!/usr/bin/env node
/* El alpha del disco de una estrella resuelta, en sus dos ramas:
     A (por defecto)      rampa histórica anclada a mlim — margen de detección.
     B (CFG.alfaPorFlujo) la misma cadena que el resto del render:
        valorDeFlujo(F_estrella, Fref, rango)/255, con Fref el cielo de
        referencia (sqm 21) contra el que pintarFot vuelve a leer esta capa.

   node scripts/test_alfa_estrella.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;
var CFG = R.config;

var fallos = 0;
function cerca(nombre, x, esperado, tol) {
  var ok = Math.abs(x - esperado) <= (tol || 1e-4);
  if (!ok) { fallos++; console.log('FALLO  ' + nombre + ': ' + x + ' != ' + esperado); }
  else console.log('ok     ' + nombre);
}

function conFlujo(v, fn) {
  var antes = CFG.alfaPorFlujo;
  CFG.alfaPorFlujo = v;
  try { fn(); } finally { CFG.alfaPorFlujo = antes; }
}

/* — Rama A: la rampa, tal como estaba — */
conFlujo(false, function () {
  // g=7,46 con mlim=14,17 (8" a 100x, sqm 20): (14,17-7,46)/11,5.
  cerca('A: rampa lineal en el margen', R.alfaEstrella(7.46, 14.17, 5, 1), 0.5834783);
  // Suelo: una estrella en el propio límite no baja de alfaMin.
  cerca('A: suelo alfaMin en g=mlim', R.alfaEstrella(14.17, 14.17, 5, 1), 0.05);
  // La dilución multiplica DESPUÉS del recorte.
  cerca('A: dilucion multiplica al final', R.alfaEstrella(14.17, 14.17, 5, 0.5), 0.025);
});

/* — Rama B: flujo absoluto — */
conFlujo(true, function () {
  /* Ejemplo trabajado: g=8 repartida en un disco de 5" de radio.
     SB = 8 + 2,5·log10(π·25) = 12,737726 mag/arcsec²
     F/Fref = 10^(-0,4·(12,737726 - 21)) = 2018,7
     alpha = 2,5·log10(1 + 2018,7)/11,5 = 0,71851 */
  cerca('B: valorDeFlujo sobre Fref', R.alfaEstrella(8, 14.17, 5, 1), 0.71851, 1e-3);
  // Absoluta: el cielo (vía mlim) ya no mueve el brillo de la misma estrella.
  cerca('B: independiente de mlim',
    R.alfaEstrella(8, 12, 5, 1) - R.alfaEstrella(8, 16, 5, 1), 0);
  // El suelo alfaMin sigue siendo el suelo.
  cerca('B: suelo alfaMin', R.alfaEstrella(20, 14.17, 5, 1), 0.05);
  // La dilución ya está en el área del disco: no se aplica dos veces.
  cerca('B: dilucion no se aplica aparte',
    R.alfaEstrella(8, 14.17, 5, 0.25), R.alfaEstrella(8, 14.17, 5, 1), 1e-3);
});

console.log(fallos ? '\n' + fallos + ' FALLOS' : '\nTodo OK');
process.exit(fallos ? 1 : 0);
