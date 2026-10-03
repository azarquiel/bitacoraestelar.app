/* Test del resolvedor de nombre de observador del mapa
   (mapa/js/via-lactea-observadores.js). Cubre nombreObservador y blogDe: clave
   conocida, desconocida y vacía.
   Sin framework:  node scripts/test_observadores.js */

'use strict';

// El módulo lee OBSERVADORES como global en tiempo de llamada; lo inyectamos.
global.OBSERVADORES = {
  israel: { nombre: 'Israel Pérez de Tudela', blog: 'https://elcielodeisra.example' },
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

console.log('blogDe (el "planeta de origen": el blog propio del observador):');
eq(VLO.blogDe('israel'), 'https://elcielodeisra.example', 'observador con blog -> su URL');
eq(VLO.blogDe('ana'), '', 'observador sin blog -> "" (el planeta se pinta apagado)');
eq(VLO.blogDe('desconocido'), '', 'clave desconocida -> ""');
eq(VLO.blogDe(''), '', 'clave vacía -> "" (en "Todas" no hay a quién apuntar)');
eq(VLO.blogDe(null), '', 'clave nula -> ""');

console.log('observadoresDe (usa nombreObservador para el nombre):');
global.OBSERVACIONES = { m13: [{ observador: 'israel' }, { observador: 'ana' }] };
var lista = VLO.observadoresDe('m13', null);
eq(lista.length, 2, 'dos observadores');
eq(lista[0].nombre, 'Israel Pérez de Tudela', 'nombre resuelto en la lista');

console.log('atenuadoPorObservador (regla única de "no visitado" de las 3 vistas, estado "todo"):');
global.window = global;   // el módulo lee CONFIG a través de window
VLO.setEstado('todo');    // la regla de siempre; el defecto ('visitados') se prueba más abajo
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

console.log('eje estado (conjunto x estado, #233):');
// m13: propia+ajena · m57: solo ajena · m42: sin observaciones (de nadie)
VLO.setActivo('israel');
VLO.setConjunto(null);
VLO.setEstado('visitados');   // el valor por defecto del control (#233)
eq(VLO.visiblePorObservador('m13'), true, 'visitados: la propia se ve');
eq(VLO.visiblePorObservador('m57'), false, 'visitados: la ajena se oculta');
eq(VLO.visiblePorObservador('m42'), false, 'visitados: la de nadie se oculta');
eq(VLO.atenuadoPorObservador('m57'), false, 'visitados: nada lleva el anillo');
VLO.setEstado('porvisitar');
eq(VLO.visiblePorObservador('m13'), false, 'por visitar: la propia se oculta');
eq(VLO.visiblePorObservador('m57'), true, 'por visitar: la ajena se ve');
eq(VLO.visiblePorObservador('m42'), true, 'por visitar: la de nadie se ve');
eq(VLO.atenuadoPorObservador('m57'), true, 'por visitar: la ajena lleva el anillo');
eq(VLO.atenuadoPorObservador('m42'), true, 'por visitar: la de nadie lleva el anillo');
global.CONFIG.observacionesAjenas.activo = false;
eq(VLO.visiblePorObservador('m57'), true, 'por visitar ignora CONFIG.observacionesAjenas');
global.CONFIG.observacionesAjenas.activo = true;
VLO.setEstado('todo');
eq(VLO.visiblePorObservador('m13'), true, 'todo: la propia se ve');
eq(VLO.visiblePorObservador('m57'), true, 'todo: la ajena se ve');
eq(VLO.atenuadoPorObservador('m57'), true, 'todo: la ajena lleva el anillo');
eq(VLO.visiblePorObservador('m42'), false, 'todo: la de nadie se oculta (regla de hoy)');
global.CONFIG.observacionesAjenas.activo = false;
eq(VLO.visiblePorObservador('m57'), false, 'todo: sujeto a CONFIG.observacionesAjenas');
global.CONFIG.observacionesAjenas.activo = true;
VLO.setEstado('cualquier cosa');
eq(VLO.getEstado(), 'visitados', 'estado desconocido -> visitados');

// Sin observador ("Todas las observaciones", el caso del visitante anónimo) el
// eje ESTADO sigue mandando, leyendo "explorado" como "lo ha explorado
// alguien": es lo único que puede significar cuando no hay observador propio.
VLO.setActivo('');
VLO.setEstado('todo');
eq(VLO.visiblePorObservador('m42'), true, 'sin observador, todo: hasta lo que nadie observó');
eq(VLO.atenuadoPorObservador('m57'), false, 'sin observador, todo: nada lleva el anillo');
VLO.setEstado('visitados');
eq(VLO.visiblePorObservador('m13'), true, 'sin observador, explorados: observado por alguien');
eq(VLO.visiblePorObservador('m57'), true, 'sin observador, explorados: da igual quién lo observó');
eq(VLO.visiblePorObservador('m42'), false, 'sin observador, explorados: lo de nadie se oculta');
eq(VLO.atenuadoPorObservador('m57'), false, 'sin observador, explorados: nada lleva el anillo');
VLO.setEstado('porvisitar');
eq(VLO.visiblePorObservador('m13'), false, 'sin observador, por explorar: lo observado se oculta');
eq(VLO.visiblePorObservador('m42'), true, 'sin observador, por explorar: lo que nadie observó');
eq(VLO.atenuadoPorObservador('m42'), true, 'sin observador, por explorar: con el anillo');
eq(VLO.recuento(['m13', 'm42', 'm57']), 1, 'sin observador, recuento de por explorar: solo m42');

console.log('eje conjunto (lista de ids o null):');
VLO.setActivo('israel');
VLO.setEstado('todo');
VLO.setConjunto(['m57']);
eq(VLO.visiblePorObservador('m13'), false, 'fuera del conjunto: oculto aunque sea propia');
eq(VLO.visiblePorObservador('m57'), true, 'dentro del conjunto y ajena: visible');
VLO.setConjunto([]);
eq(VLO.visiblePorObservador('m13'), false, 'conjunto vacío: nada visible');
VLO.setConjunto(null);
eq(VLO.visiblePorObservador('m13'), true, 'conjunto null: todos los objetos');
VLO.setEstado('porvisitar');
VLO.setConjunto(['m13', 'm42']);
eq(VLO.recuento(['m13', 'm42', 'm57']), 1, 'recuento: solo m42 (m57 fuera del conjunto, m13 propia)');
VLO.setConjunto(null);
eq(VLO.recuento(['m13', 'm42', 'm57']), 2, 'recuento sin conjunto: m42 y m57');
VLO.setEstado('visitados');
VLO.setActivo('');

console.log('grisNoVisitado (mismo gris clarito en las 3 vistas):');
var gris = VLO.grisNoVisitado(255, 0, 0);
eq(gris.join(','), '218,53,53', 'rojo mezclado al 35% con el gris 150');
eq(VLO.grisNoVisitado(150, 150, 150).join(','), '150,150,150', 'el propio gris no cambia');

console.log('resultadoDe (tres estados, #397):');
var F = 'no_visto';
global.OBSERVACIONES = {
  a: [{ observador: 'israel', resultado: F }, { observador: 'ana', resultado: 'visto' }],   // fallo propio + éxito ajeno
  b: [{ observador: 'israel', resultado: F, motivo: 'nubes' }, { observador: 'israel', resultado: 'visto' }], // fallo propio + éxito propio posterior
  c: [{ observador: 'israel', resultado: F }, { observador: 'ana', resultado: 'detectado_no_visto' }],       // solo fallos de varios
  d: [{ observador: 'israel' }],                                                              // sin campo resultado (caché vieja)
  e: []
};
VLO.setConjunto(null);
VLO.setActivo('israel');
eq(VLO.resultadoDe('a'), 'explorado', 'fallo propio + éxito ajeno: explorado para el propio');
eq(VLO.resultadoDe('a', 'ana'), 'visto', 'resultadoDe con observador explícito');
eq(VLO.resultadoDe('b'), 'visto', 'fallo propio + éxito propio posterior: visto');
eq(VLO.resultadoDe('c'), 'explorado', 'solo fallos: explorado');
eq(VLO.resultadoDe('d'), 'visto', 'sin campo resultado: visto');
eq(VLO.resultadoDe('e'), 'no_visitado', 'sin filas: no_visitado');
eq(VLO.resultadoDe('c', 'otro'), 'no_visitado', 'observador sin filas: no_visitado');
VLO.setActivo('');
eq(VLO.resultadoDe('a'), 'visto', 'todas: alguien lo vio');
eq(VLO.resultadoDe('c'), 'explorado', 'todas, solo fallos de varios observadores: explorado');
eq(VLO.resultadoDe('d'), 'visto', 'todas, sin campo resultado: visto');
eq(VLO.getFicha('c').resultado, F, 'getFicha sigue devolviendo la fila fallida');

console.log('estado noconfirmados y recuentos (suman Todo):');
var ids = ['a', 'b', 'c', 'd', 'e'];
['israel', ''].forEach(function (quien) {
  VLO.setActivo(quien);
  var r = VLO.recuentos(ids);
  eq(r.visitados + r.noconfirmados + r.porvisitar, r.todo, 'suman todo (' + (quien || 'todas') + ')');
});
VLO.setActivo('israel');
VLO.setEstado('noconfirmados');
eq(VLO.visiblePorObservador('a'), true, 'noconfirmados: fallo propio visible');
eq(VLO.visiblePorObservador('b'), false, 'noconfirmados: lo visto, no');
eq(VLO.visiblePorObservador('e'), false, 'noconfirmados: lo no visitado, no');
eq(VLO.atenuadoPorObservador('a'), false, 'noconfirmados: sin anillo');
eq(VLO.recuento(ids), 2, 'recuento noconfirmados: a y c');
VLO.setEstado('todo');
global.CONFIG.observacionesAjenas.activo = false;
eq(VLO.recuento(ids), 4, 'todo (descubrir apagado): ve confirmados + no confirmados');
global.CONFIG.observacionesAjenas.activo = true;
VLO.setEstado('visitados');
eq(VLO.recuento(ids), 2, 'recuento confirmados: b y d');
VLO.setEstado('porvisitar');
eq(VLO.visiblePorObservador('a'), false, 'porvisitar: un fallo propio ya no es por visitar');
eq(VLO.recuento(ids), 1, 'recuento por explorar: e');
VLO.setEstado('todo');
VLO.setActivo('');

console.log('simboloDe (punto / anillo / triángulo hueco, #397):');
VLO.setActivo('israel');
VLO.setConjunto(null);
VLO.setEstado('todo');
eq(VLO.simboloDe('b'), 'punto', 'visto: punto lleno');
eq(VLO.simboloDe('a'), 'triangulo', 'fallo propio + éxito ajeno: triángulo');
eq(VLO.simboloDe('c'), 'triangulo', 'solo fallos: triángulo');
VLO.setEstado('porvisitar');
eq(VLO.simboloDe('e'), 'anillo', 'por explorar: anillo hueco');
VLO.setActivo('');
VLO.setEstado('todo');
eq(VLO.simboloDe('c'), 'triangulo', 'todas, solo fallos: triángulo');
eq(VLO.simboloDe('a'), 'punto', 'todas, alguien lo vio: punto');
var trazos = [];
var ctxFalso = { beginPath: function () { trazos.push('b'); }, moveTo: function () { trazos.push('m'); },
  lineTo: function () { trazos.push('l'); }, closePath: function () { trazos.push('c'); }, arc: function () { trazos.push('a'); } };
VLO.trazarSimbolo(ctxFalso, 0, 0, 4, 'triangulo');
eq(trazos.join(''), 'bmllc', 'trazarSimbolo triángulo: tres vértices cerrados');
trazos = [];
VLO.trazarSimbolo(ctxFalso, 0, 0, 4, 'anillo');
eq(trazos.join(''), 'ba', 'trazarSimbolo anillo: un arco');
VLO.setActivo('');
VLO.setEstado('visitados');

console.log('triángulo y atenuado nunca coinciden (#397):');
['israel', 'ana', ''].forEach(function (quien) {
  ['todo', 'visitados', 'noconfirmados', 'porvisitar'].forEach(function (est) {
    VLO.setActivo(quien);
    VLO.setEstado(est);
    ['a', 'b', 'c', 'd', 'e'].forEach(function (id) {
      if (VLO.simboloDe(id) === 'triangulo') {
        eq(VLO.atenuadoPorObservador(id), false, 'triángulo sin atenuar (' + id + ', ' + (quien || 'todas') + ', ' + est + ')');
      }
    });
  });
});
VLO.setActivo('');
VLO.setEstado('visitados');

if (fallos) { console.log('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nTodo verde.');
