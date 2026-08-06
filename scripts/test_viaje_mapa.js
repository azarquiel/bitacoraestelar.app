/* Test de la ruta de un viaje interestelar en el mapa
   (mapa/js/via-lactea-viaje.js). Fija el contrato: el orden del recorrido, el
   reparto por capa (vecindario / galaxia / grupo local), el descarte de los
   objetos sin marcador y la lista de "otras observaciones".
   Sin framework:  node scripts/test_viaje_mapa.js */

'use strict';

// El módulo lee los datos del visor como globales en tiempo de llamada.
global.CONFIG = { vecindario: { distMaxAl: 500 } };

global.OBSERVADORES = {
  israel: { nombre: 'Israel Pérez de Tudela' },
  ana:    { nombre: 'Ana' }
};

global.OBJECTS = [
  { id: 'proxima', label: 'Próxima', dist: 4.2 },       // vecindario (y galaxia)
  { id: 'm13',     label: 'M13',     dist: 22000 },     // galaxia
  { id: 'm92',     label: 'M92',     dist: 26700 },     // galaxia
  { id: 'm57',     label: 'M57' },                      // galaxia (sin distancia)
  { id: 'm31',     label: 'M31',     dist: 2500000 }    // grupo local
];

global.VIAJES = {
  // Ruta ya ordenada por el servidor (hora; sin hora, al final por id).
  '7': { nombre: 'Perseidas desde la sierra', noche: '2026-08-05', observador: 'israel',
         objetos: ['proxima', 'm13', 'm92', 'm31', 'fantasma'] },
  '8': { nombre: '', noche: '2026-08-12', observador: 'israel', objetos: ['m57'] },
  '9': { nombre: 'Noche de Ana', noche: '2026-07-01', observador: 'ana', objetos: ['m13'] }
};

global.OBSERVACIONES = {
  m13: [
    { observador: 'israel', viaje: 7 },
    { observador: 'ana',    viaje: 9 },
    { observador: 'israel', viaje: 8 },   // el MISMO observador, otra salida
    { observador: 'israel' }              // histórica, sin viaje
  ]
};

var VLV = require('../mapa/js/via-lactea-viaje.js');

var fallos = 0;
function eq(a, b, et) {
  var ok = JSON.stringify(a) === JSON.stringify(b);
  if (ok) { console.log('  ok   ' + et); }
  else { fallos++; console.log('  FALLA ' + et + '\n         esperado ' + JSON.stringify(b) + '\n         obtenido ' + JSON.stringify(a)); }
}
function ids(lista) { return lista.map(function (o) { return o.id; }); }

console.log('viajesDe (los viajes de un observador, del más reciente al más antiguo):');
eq(VLV.viajesDe('israel').map(function (v) { return v.id; }), ['8', '7'], 'solo los suyos, la noche más nueva primero');
eq(VLV.viajesDe('ana').map(function (v) { return v.id; }), ['9'], 'los de otro observador no se mezclan');
eq(VLV.viajesDe(''), [], 'sin observador no hay viajes que ofrecer');
eq(VLV.viajesDe('nadie'), [], 'observador desconocido -> lista vacía');

console.log('etiquetaViaje (rótulo del combo):');
eq(VLV.etiquetaViaje('7'), '2026-08-05 · Perseidas desde la sierra · 4 objetos', 'noche · nombre · recuento');
eq(VLV.etiquetaViaje('8'), '2026-08-12 · 1 objeto', 'sin nombre, solo la noche; singular en el recuento');
eq(VLV.etiquetaViaje('404'), '', 'viaje inexistente -> sin rótulo');

console.log('nombreViaje (acompaña al observador en "← Descubrir"):');
eq(VLV.nombreViaje('7'), 'Perseidas desde la sierra', 'el nombre que le puso el observador');
eq(VLV.nombreViaje('8'), 'Viaje del 2026-08-12', 'sin nombre -> "Viaje del <noche>"');

console.log('rutaDe (orden del recorrido y reparto por capa):');
var r = VLV.rutaDe('7');
eq(ids(r.galaxia), ['proxima', 'm13', 'm92'], 'tramo de la galaxia, en el orden del servidor');
eq(ids(r.grupoLocal), ['m31'], 'lo extragaláctico va al atlas y NO al tramo de la galaxia');
eq(ids(r.vecindario), ['proxima'], 'la estrella cercana entra además en el vecindario');
eq(ids(VLV.rutaDe('8').galaxia), ['m57'], 'un objeto sin distancia se queda en la galaxia');
eq(VLV.rutaDe('404'), { vecindario: [], galaxia: [], grupoLocal: [] }, 'viaje inexistente -> ruta vacía');

console.log('  (el objeto "fantasma" del viaje 7 no está en OBJECTS y se descarta en silencio)');
eq(r.galaxia.length + r.grupoLocal.length, 4, 'lo visitado sin marcador no se dibuja');

console.log('enViaje (el filtro del mapa):');
eq(VLV.enViaje('7', 'm13'), true, 'un objeto de la ruta');
eq(VLV.enViaje('7', 'm57'), false, 'un objeto de OTRA salida del mismo observador queda fuera');
eq(VLV.enViaje('404', 'm13'), false, 'sin viaje no hay nada dentro');

console.log('capaInicial (dónde aterriza el mapa al elegir el viaje):');
eq(VLV.capaInicial('7').capa, 'vecindario', 'el primer objeto manda: una estrella cercana');
eq(VLV.capaInicial('8').capa, 'galaxia', 'un Messier abre la vista de la galaxia');
eq(VLV.capaInicial('8').objeto.id, 'm57', 'devuelve también el objeto que hay que encuadrar');
eq(VLV.capaInicial('404'), null, 'viaje inexistente -> sin capa');

console.log('otrasObservaciones (pantalla "← Descubrir"):');
var otras = VLV.otrasObservaciones('m13', 0);
eq(otras.length, 3, 'todas menos la que se está viendo');
eq(otras.map(function (o) { return o.indice; }), [1, 2, 3], 'se identifican por ÍNDICE, no por observador');
eq(otras[0].etiqueta, 'Ana · Noche de Ana', 'observador · nombre del viaje');
eq(otras[1].etiqueta, 'Israel Pérez de Tudela · Viaje del 2026-08-12', 'el MISMO observador en otra salida sí aparece');
eq(otras[2].etiqueta, 'Israel Pérez de Tudela', 'observación histórica sin viaje -> solo el nombre');
eq(VLV.otrasObservaciones('m13', null).length, 4, 'sin excluir ninguna salen las cuatro');
eq(VLV.otrasObservaciones('m42', null), [], 'objeto sin observaciones -> lista vacía');

console.log('fase (el punteado en movimiento):');
var ciclo = VLV.PATRON[0] + VLV.PATRON[1];
var f0 = VLV.fase(0), f1 = VLV.fase(1000);
eq(f0, 0, 'en t=0 el punteado está en su origen');
eq(f1 < 0 && f1 > -ciclo, true, 'avanza hacia el destino (offset negativo) y se envuelve en un ciclo');
eq(VLV.fase(ciclo / 26 * 1000).toFixed(6), (-0).toFixed(6), 'un ciclo completo vuelve al punto de partida');

console.log('trazarCanvas (no dibuja lo que no es una ruta):');
var trazos = 0;
var ctxFalso = {
  save: function () {}, restore: function () {}, beginPath: function () {},
  moveTo: function () {}, lineTo: function () {}, setLineDash: function () {},
  stroke: function () { trazos++; }
};
VLV.trazarCanvas(ctxFalso, [{ sx: 0, sy: 0 }], 0);
eq(trazos, 0, 'un solo punto no es un viaje: no se traza nada');
VLV.trazarCanvas(ctxFalso, [{ sx: 0, sy: 0 }, { sx: 10, sy: 10 }], 0);
eq(trazos, 3, 'dos puntos -> estela, línea base y punteado');

if (fallos) { console.log('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nTodo verde.');
