#!/usr/bin/env node
/* Test dorado del MODELO DE COLOR GAIA (resources/js/bitacora-gaia-color.js).
   Bloquea el contrato de color que comparten el simulador de oculares y el mapa:
   si alguien toca la tabla, la gamma o la saturación, este test lo caza antes de
   que las dos vistas diverjan. Sin dependencias:  node scripts/test_gaia_color.js
   Valores dorados = salida validada del módulo (M39 azul-blanco, no demasiado azul;
   carbono rojo ember). */
'use strict';
var G = require('../resources/js/bitacora-gaia-color.js');

var fallos = 0;
function eq(actual, esperado, etiqueta) {
  var a = JSON.stringify(actual), e = JSON.stringify(esperado);
  if (a === e) { console.log('  ok   ' + etiqueta + ' = ' + a); }
  else { fallos++; console.error('  FALLA ' + etiqueta + '\n         esperado ' + e + '\n         obtenido ' + a); }
}
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

console.log('colorPorBpRp — valores dorados (RGB):');
eq(G.colorPorBpRp(-0.40), [186, 203, 255], 'BP-RP -0.40 (caliente O)');
eq(G.colorPorBpRp(0.00),  [186, 203, 255], 'BP-RP  0.00 (M39, azul-blanco)');
eq(G.colorPorBpRp(0.33),  [219, 226, 255], 'BP-RP  0.33');
eq(G.colorPorBpRp(0.60),  [245, 247, 255], 'BP-RP  0.60');
eq(G.colorPorBpRp(1.00),  [255, 237, 220], 'BP-RP  1.00');
eq(G.colorPorBpRp(1.60),  [255, 174, 113], 'BP-RP  1.60');
eq(G.colorPorBpRp(2.00),  [255, 162,  90], 'BP-RP  2.00');
eq(G.colorPorBpRp(2.59),  [255, 163,  77], 'BP-RP  2.59 (Y CVn, carbono)');
eq(G.colorPorBpRp(3.55),  [255, 108,  19], 'BP-RP  3.55 (V Hya, rojo ember)');
eq(G.colorPorBpRp(4.20),  [255,  93,   8], 'BP-RP  4.20 (frío extremo)');
eq(G.colorPorBpRp(null),  [255, 195, 145], 'BP-RP null (sin dato → neutro)');

console.log('colorPorBpRp — invariantes estructurales:');
var caliente = G.colorPorBpRp(-0.40), frio = G.colorPorBpRp(4.20);
ok(caliente[2] > caliente[0], 'estrella caliente es azulada (B > R)');
ok(frio[0] > frio[2],         'estrella fría es rojiza (R > B)');

console.log('claseEspectral:');
eq(G.claseEspectral(-0.40), 'O', 'BP-RP -0.40 → O');
eq(G.claseEspectral(2.60),  'M', 'BP-RP  2.60 → M');
eq(G.claseEspectral(null),  '',  'BP-RP null → ""');

console.log('config expuesta (palanca compartida):');
ok(G.config && G.config.gammaGlobal === false && G.config.saturacion === 1.0, 'config por defecto {gammaGlobal:false, saturacion:1.0}');

if (fallos) { console.error('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nTodo verde.');
