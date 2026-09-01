#!/usr/bin/env node
/* Test dorado del MODELO DE COLOR GAIA (resources/js/bitacora-gaia-color.js).
   Bloquea el contrato de color que comparten el simulador de oculares y el mapa:
   si alguien toca la tabla, la gamma o la saturación, este test lo caza antes de
   que las dos vistas diverjan. Sin dependencias:  node scripts/test_gaia_color.js
   Valores dorados = salida validada del módulo con saturacion:1.4 (M39 azul
   visible, no pastel; carbono rojo ember más marcado). */
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
function casi(actual, esperado, tol, etiqueta) {
  if (actual != null && Math.abs(actual - esperado) <= tol) { console.log('  ok   ' + etiqueta + ' = ' + actual.toFixed(3)); }
  else { fallos++; console.error('  FALLA ' + etiqueta + '\n         esperado ' + esperado + ' ±' + tol + '\n         obtenido ' + actual); }
}

console.log('colorPorBpRp — valores dorados (RGB):');
eq(G.colorPorBpRp(-0.40), [154, 187, 255], 'BP-RP -0.40 (caliente O/B0, azul franco)');
eq(G.colorPorBpRp(-0.16), [169, 197, 255], 'BP-RP -0.16 (Régulo B8)');
eq(G.colorPorBpRp(0.00),  [179, 203, 255], 'BP-RP  0.00 (M39, azul-blanco)');
eq(G.colorPorBpRp(0.33),  [216, 226, 255], 'BP-RP  0.33');
eq(G.colorPorBpRp(0.60),  [244, 247, 255], 'BP-RP  0.60');
eq(G.colorPorBpRp(1.00),  [255, 236, 212], 'BP-RP  1.00');
eq(G.colorPorBpRp(1.60),  [255, 167,  82], 'BP-RP  1.60');
eq(G.colorPorBpRp(2.00),  [255, 154,  53], 'BP-RP  2.00');
eq(G.colorPorBpRp(2.59),  [255, 155,  36], 'BP-RP  2.59 (Y CVn, carbono)');
eq(G.colorPorBpRp(3.55),  [255,  94,   0], 'BP-RP  3.55 (V Hya, rojo ember)');
eq(G.colorPorBpRp(4.20),  [255,  77,   0], 'BP-RP  4.20 (frío extremo)');
eq(G.colorPorBpRp(null),  [255, 189, 121], 'BP-RP null (sin dato → neutro)');

console.log('colorPorBpRp — invariantes estructurales:');
var caliente = G.colorPorBpRp(-0.40), frio = G.colorPorBpRp(4.20);
ok(caliente[2] > caliente[0], 'estrella caliente es azulada (B > R)');
ok(frio[0] > frio[2],         'estrella fría es rojiza (R > B)');
/* El extremo caliente NO puede colapsar en un solo color: con los dos nodos
   iguales, Vega y Mimosa salían idénticas y el simulador no distinguía una B0
   de una A0. Ver notas/tonalidad-azul-estrellas.md, C.2. */
ok(caliente[0] < G.colorPorBpRp(0.00)[0], 'una B temprana es más azul que una A0V');

console.log('claseEspectral:');
eq(G.claseEspectral(-0.40), 'O', 'BP-RP -0.40 → O');
eq(G.claseEspectral(2.60),  'M', 'BP-RP  2.60 → M');
eq(G.claseEspectral(null),  '',  'BP-RP null → ""');

/* ── bpRpPorTipo: el camino inverso, para las estrellas que Gaia no trae ──────
   Lo usan las componentes de las dobles del catálogo del WDS. Aquí NO se fijan
   valores exactos (es una aproximación para pintar, no fotometría) sino los
   anclajes de libro y los invariantes: la secuencia va de azul a rojo sin
   retrocesos, las gigantes son más rojas que las enanas de su misma subclase, y
   lo que no es un tipo espectral no cuela. */
console.log('bpRpPorTipo — anclajes de la secuencia espectral:');
casi(G.bpRpPorTipo('A0V'), 0.00, 0.02, 'A0V ≈ 0,00 (el cero de la escala)');
casi(G.bpRpPorTipo('G2V'), 0.82, 0.02, 'G2V ≈ 0,82 (el Sol)');
casi(G.bpRpPorTipo('K5V'), 1.45, 0.05, 'K5V ≈ 1,45');
casi(G.bpRpPorTipo('M0V'), 1.87, 0.05, 'M0V ≈ 1,87');
ok(G.bpRpPorTipo('B0V') < 0, 'una B0V es más azul que el cero de A0');
ok(G.bpRpPorTipo('O5V') < G.bpRpPorTipo('B0V'), 'y una O5V, más aún');

console.log('bpRpPorTipo — invariantes:');
var secuencia = ['O5V','B0V','B5V','A0V','A5V','F0V','F5V','G0V','G5V','K0V','K5V','M0V','M5V'];
var monotona = true;
for (var s = 1; s < secuencia.length; s++) {
  if (!(G.bpRpPorTipo(secuencia[s]) > G.bpRpPorTipo(secuencia[s - 1]))) monotona = false;
}
ok(monotona, 'la secuencia O→M enrojece sin retrocesos');
ok(G.bpRpPorTipo('K0III') > G.bpRpPorTipo('K0V'), 'una gigante K0III es más roja que una enana K0V');
ok(G.bpRpPorTipo('K2Ib')  > G.bpRpPorTipo('K2III'), 'y una supergigante, más que la gigante');
casi(G.bpRpPorTipo('gM0'), G.bpRpPorTipo('M0III'), 1e-9, 'el prefijo g del catálogo es una gigante');
casi(G.bpRpPorTipo('dF0'), G.bpRpPorTipo('F0V'),   1e-9, 'y el prefijo d, una enana');
casi(G.bpRpPorTipo('B9.5V'), G.bpRpPorTipo('B9.5'), 1e-9, 'sin clase de luminosidad se asume enana');

console.log('bpRpPorTipo — lo que trae el catálogo de dobles de verdad:');
[['K3II', 'Albireo A'], ['B9.5', 'Albireo B'], ['A1VpSrSi', 'Mizar A'],
 ['K2Vvar', ''], ['G8II-III', ''], ['A1spe...', ''], ['F7-G3Ib', ''], ['A', '']].forEach(function (t) {
  ok(G.bpRpPorTipo(t[0]) != null, 'reconoce «' + t[0] + '»' + (t[1] ? '  (' + t[1] + ')' : ''));
});
// El par de Albireo: la A dorada y la B azul, con el modelo de color de siempre.
var albA = G.colorPorBpRp(G.bpRpPorTipo('K3II')), albB = G.colorPorBpRp(G.bpRpPorTipo('B9.5'));
ok(albA[0] > albA[2], 'Albireo A (K3II) sale cálida (R > B)');
ok(albB[2] > albB[0], 'Albireo B (B9.5) sale azulada (B > R)');

console.log('bpRpPorTipo — lo que NO es un tipo espectral:');
[null, '', '   ', 'basura', 'Nebulosa', 'X9V', '9'].forEach(function (t) {
  ok(G.bpRpPorTipo(t) === null, JSON.stringify(t) + ' → null');
});

console.log('config expuesta (palanca compartida):');
ok(G.config && G.config.gammaGlobal === false && G.config.saturacion === 1.4, 'config por defecto {gammaGlobal:false, saturacion:1.4}');

if (fallos) { console.error('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nTodo verde.');
