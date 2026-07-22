/* Test del resolvedor de nombre de observador del mapa
   (mapa/js/via-lactea-observadores.js). Cubre nombreObservador: clave conocida,
   desconocida y vacía.
   Sin framework:  node scripts/test_observadores.js */

'use strict';

// El módulo lee OBSERVADORES como global en tiempo de llamada; lo inyectamos.
global.OBSERVADORES = {
  israel: { nombre: 'Israel Pérez de Tudela' },
  ana:    { nombre: 'Ana' },
  sinnombre: {}
};

var VLO = require('../mapa/js/via-lactea-observadores.js');

var fallos = 0;
function eq(a, b, et) {
  if (a === b) { console.log('  ok   ' + et); }
  else { fallos++; console.log('  FALLA ' + et + '\n         esperado ' + JSON.stringify(b) + '\n         obtenido ' + JSON.stringify(a)); }
}

console.log('nombreObservador (clave -> nombre legible):');
eq(VLO.nombreObservador('israel'), 'Israel Pérez de Tudela', 'clave conocida -> nombre del catálogo');
eq(VLO.nombreObservador('ana'), 'Ana', 'otra clave conocida');
eq(VLO.nombreObservador('desconocido'), 'desconocido', 'clave desconocida -> la propia clave');
eq(VLO.nombreObservador('sinnombre'), 'sinnombre', 'catalogado sin nombre -> la propia clave');
eq(VLO.nombreObservador(''), '', 'clave vacía -> "" (sin etiqueta)');
eq(VLO.nombreObservador(null), '', 'clave nula -> ""');

console.log('observadoresDe (usa nombreObservador para el nombre):');
global.OBSERVACIONES = { m13: [{ observador: 'israel' }, { observador: 'ana' }] };
var lista = VLO.observadoresDe('m13', null);
eq(lista.length, 2, 'dos observadores');
eq(lista[0].nombre, 'Israel Pérez de Tudela', 'nombre resuelto en la lista');

if (fallos) { console.log('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nTodo verde.');
