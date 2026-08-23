#!/usr/bin/env node
/* Test dorado de la LEY DE ATENUACIÓN DE MARCADORES (spec #102),
   mapa/js/via-lactea-marcador-estilo.js. Única fuente de la ley
   estado → {escala, opacidad} que comparten las tres vistas del mapa
   (galáctica, Grupo Local y vecindario solar): si alguien la toca aquí
   se caza antes de que las vistas diverjan.
   Sin dependencias:  node scripts/test_marcador_estilo.js */
'use strict';
var E = require('../mapa/js/via-lactea-marcador-estilo.js');

var fallos = 0;
function eq(actual, esperado, etiqueta) {
  var a = JSON.stringify(actual), e = JSON.stringify(esperado);
  if (a === e) { console.log('  ok   ' + etiqueta + ' = ' + a); }
  else { fallos++; console.error('  FALLA ' + etiqueta + '\n         esperado ' + e + '\n         obtenido ' + a); }
}

var cfg = { atenuacionEscala: 0.82, atenuacionOpacidad: 0.55 };

console.log('estado base — atenuado según CONFIG.marcadores:');
eq(E.de({}, cfg), { escala: 0.82, opacidad: 0.55 }, 'sin realce ni viaje');
eq(E.de({ realzado: false, viajeActivo: false }, cfg), { escala: 0.82, opacidad: 0.55 }, 'flags explícitos a false');

console.log('realce — hover o búsqueda devuelven el estilo completo:');
eq(E.de({ realzado: true }, cfg), { escala: 1, opacidad: 1 }, 'realzado');

console.log('viaje interestelar — la atenuación se desactiva:');
eq(E.de({ viajeActivo: true }, cfg), { escala: 1, opacidad: 1 }, 'viaje sin hover');
eq(E.de({ viajeActivo: true, realzado: true }, cfg), { escala: 1, opacidad: 1 }, 'viaje con hover');

console.log('robustez — sin estado o sin CONFIG hay valores por defecto sensatos:');
eq(E.de(undefined, cfg), { escala: 0.82, opacidad: 0.55 }, 'estado undefined');
var def = E.de({}, undefined);
if (def.escala > 0 && def.escala < 1 && def.opacidad > 0 && def.opacidad < 1) {
  console.log('  ok   sin CONFIG: atenuado (' + def.escala + ', ' + def.opacidad + ')');
} else { fallos++; console.error('  FALLA sin CONFIG: esperado atenuado en (0,1), obtenido ' + JSON.stringify(def)); }

console.log('otros ajustes de CONFIG se respetan:');
eq(E.de({}, { atenuacionEscala: 0.7, atenuacionOpacidad: 0.4 }), { escala: 0.7, opacidad: 0.4 }, 'cfg alternativo');

if (fallos) { console.error('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nTodo ok.');
