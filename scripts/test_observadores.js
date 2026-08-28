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

console.log('atenuadoPorObservador (regla única de "no visitado" de las 3 vistas):');
global.window = global;   // el módulo lee CONFIG a través de window
global.CONFIG = { observacionesAjenas: { activo: true } };
global.OBSERVACIONES = {
  m13: [{ observador: 'israel' }, { observador: 'ana' }],
  m57: [{ observador: 'ana' }],
  m42: []
};
VLO.setActivo('');
eq(VLO.atenuadoPorObservador('m57'), false, 'modo "todas": nada se atenúa');
VLO.setActivo('israel');
eq(VLO.atenuadoPorObservador('m13'), false, 'observado por el activo: a todo color');
eq(VLO.atenuadoPorObservador('m57'), true, 'observado solo por otros: atenuado');
eq(VLO.atenuadoPorObservador('m42'), false, 'sin observaciones: se oculta, no se atenúa');
global.CONFIG.observacionesAjenas.activo = false;
eq(VLO.atenuadoPorObservador('m57'), false, 'funcionalidad apagada: se oculta, no se atenúa');
global.CONFIG.observacionesAjenas.activo = true;
VLO.setActivo('');

console.log('visiblePorObservador (regla única de ocultar de las 3 vistas):');
VLO.setActivo('');
eq(VLO.visiblePorObservador('m42'), true, 'modo "todas": todo visible');
VLO.setActivo('israel');
eq(VLO.visiblePorObservador('m13'), true, 'observado por el activo: visible');
eq(VLO.visiblePorObservador('m57'), true, 'observado solo por otros: visible (atenuado)');
eq(VLO.visiblePorObservador('m42'), false, 'sin observaciones: oculto');
global.CONFIG.observacionesAjenas.activo = false;
eq(VLO.visiblePorObservador('m57'), false, 'funcionalidad apagada: los ajenos se ocultan');
global.CONFIG.observacionesAjenas.activo = true;
VLO.setActivo('');

console.log('grisNoVisitado (mismo gris clarito en las 3 vistas):');
var gris = VLO.grisNoVisitado(255, 0, 0);
eq(gris.join(','), '218,53,53', 'rojo mezclado al 35% con el gris 150');
eq(VLO.grisNoVisitado(150, 150, 150).join(','), '150,150,150', 'el propio gris no cambia');

if (fallos) { console.log('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nTodo verde.');
