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
  '9': { nombre: 'Noche de Ana', noche: '2026-07-01', observador: 'ana', objetos: ['m13'] },
  // Una sola estrella cercana: está en el tramo del vecindario y en el de la
  // galaxia, pero es UNA escala; el mapa no debe avisar de ningún cruce.
  '12': { nombre: 'Solo Próxima', noche: '2026-05-01', observador: 'carmen', objetos: ['proxima'] }
};

global.OBSERVACIONES = {
  m13: [
    { observador: 'israel', viaje: 7,
      audio: { url: 'https://ejemplo.test/ep.mp3', inicio: 10, fin: 20 } },   // con tramo de audio
    { observador: 'ana',    viaje: 9 },
    { observador: 'israel', viaje: 8,
      nave: { nombre: 'Excalibur', apertura_mm: 457, f_ratio: 4.5 } },  // el MISMO observador, otra salida
    { observador: 'israel', fecha: '2011-06-02',   // histórica, sin viaje
      instrumento: 'prismáticos 10x50' },          // a mano, sin telescopio de la flota
    { observador: 'ana' }                 // sin viaje y sin fecha
  ],
  m57: [ { observador: 'israel', viaje: 8 } ]   // una sola observación
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

console.log('observadorDe (a quién selecciona el enlace ?viaje=<id>):');
eq(VLV.observadorDe('9'), 'ana', 'el dueño del viaje');
eq(VLV.observadorDe('404'), '', 'viaje inexistente -> nadie a quien seleccionar');

console.log('rutaDe (orden del recorrido y reparto por capa):');
var r = VLV.rutaDe('7');
eq(ids(r.galaxia), ['proxima', 'm13', 'm92'], 'tramo de la galaxia, en el orden del servidor');
eq(ids(r.grupoLocal), ['m31'], 'lo extragaláctico va al atlas y NO al tramo de la galaxia');
eq(ids(r.vecindario), ['proxima'], 'la estrella cercana entra además en el vecindario');
eq(ids(VLV.rutaDe('8').galaxia), ['m57'], 'un objeto sin distancia se queda en la galaxia');
eq(VLV.rutaDe('404'), { vecindario: [], galaxia: [], grupoLocal: [] }, 'viaje inexistente -> ruta vacía');

console.log('escalasDe (de qué avisa el mapa cuando el viaje continúa en otra escala):');
eq(VLV.escalasDe('7'), ['vecindario', 'galaxia', 'grupoLocal'], 'del Sol al Grupo Local, de cerca a lejos');
eq(VLV.escalasDe('12'), ['vecindario'], 'una estrella cercana es UNA escala, no dos');
eq(VLV.escalasDe('8'), ['galaxia'], 'un objeto de la galaxia, sin cruce');
eq(VLV.escalasDe('404'), [], 'viaje inexistente -> ninguna escala');

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
eq(otras.length, 4, 'todas menos la que se está viendo');
eq(otras.map(function (o) { return o.indice; }), [2, 1, 3, 4], 'de la más reciente a la más antigua, y sin fecha al final');
eq(otras[0].etiqueta, 'Israel Pérez de Tudela', 'la etiqueta es el observador, sin el nombre del viaje');
eq(otras[0].fecha, '2026-08-12', 'sin fecha propia, la noche de su viaje');
eq(otras[1].fecha, '2026-07-01', 'el MISMO observador en otra salida sí aparece');
eq(otras[2].fecha, '2011-06-02', 'la fecha de la observación manda sobre la del viaje');
eq(otras[3].fecha, '', 'sin viaje ni fecha -> sin fecha que enseñar');
// Con qué se miró: la lista lo lleva para poder rotular «fecha · Nave …» sin
// volver a OBSERVACIONES. El rótulo lo compone BitacoraEquipo, igual que la ficha.
eq(otras[0].nave, { nombre: 'Excalibur', apertura_mm: 457, f_ratio: 4.5 }, 'la nave de esa observación');
eq(otras[2].instrumento, 'prismáticos 10x50', 'sin nave de la flota, el instrumento escrito a mano');
eq(otras[1].nave, null, 'observación sin telescopio -> sin nave');
eq(VLV.otrasObservaciones('m13', null).length, 5, 'sin excluir ninguna salen las cinco');
eq(VLV.otrasObservaciones('m42', null), [], 'objeto sin observaciones -> lista vacía');
// Cada ítem de la lista dice la fecha y CON QUÉ se miró («12 ago 2026 · Nave
// Excalibur · 18" f/4.5»), con el mismo rótulo de telescopio que la ficha.
var app = require('fs').readFileSync(__dirname + '/../mapa/js/via-lactea-app.js', 'utf8');
var itemLista = app.slice(app.indexOf('function abrirFichaDescubrimiento'),
                          app.indexOf('function abrirObservacionPorIndice'));
eq(/rotuloNave\(/.test(itemLista), true, 'el ítem compone la nave con el rótulo de la ficha');
eq(/Nave /.test(itemLista), true, 'y la rotula como tal');
// El tramo de audio (ADR 0005) es de UNA observación: la lista lo señala en el
// ítem que lo tiene y NO enseña el faldón (que se quedaba puesto de la ficha
// anterior al volver con «← Descubrir»).
eq(VLV.otrasObservaciones('m13', null).filter(function (o) { return o.indice === 0; })[0].audio, true,
   'la observación con tramo de audio lo dice');
eq(otras[0].audio, false, 'y la que no lo tiene, no');
eq(/o\.audio \? [^:]*🎧/.test(itemLista), true, 'el ítem con audio lleva el 🎧');
eq(/renderFichaAudio\(\{\}\)/.test(itemLista), true, 'la lista apaga el faldón del audio');
eq(/Explorado en la fecha estelar/.test(app), false, 'la fecha va sola, sin la perífrasis');
// Y el clic en el marcador la usa para ELEGIR cuando hay más de una: sin esto,
// el mapa abre una observación cualquiera por el usuario.
eq(/VLViaje\.hayQueElegir\(/.test(app), true, 'el clic en el objeto consulta si hay que elegir');

console.log('hayQueElegir (con varias observaciones se elige, no se abre una):');
eq(VLV.hayQueElegir('m13'), true, 'cinco observaciones -> el mapa enseña la lista');
eq(VLV.hayQueElegir('m57'), false, 'una sola observación -> se abre directamente');
eq(VLV.hayQueElegir('m92'), false, 'objeto sin observaciones -> nada que elegir');

console.log('fase (el punteado en movimiento):');
var ciclo = VLV.PATRON[0] + VLV.PATRON[1];
var f0 = VLV.fase(0), f1 = VLV.fase(1000);
eq(f0, 0, 'en t=0 el punteado está en su origen');
eq(f1 < 0 && f1 > -ciclo, true, 'avanza hacia el destino (offset negativo) y se envuelve en un ciclo');
eq(VLV.fase(ciclo / 26 * 1000).toFixed(6), (-0).toFixed(6), 'un ciclo completo vuelve al punto de partida');

console.log('tramoEncendido (la luz recorre UN tramo cada vez, a velocidad constante):');
VLV.reiniciar(0);
// La luz va a PX_POR_SEGUNDO_LUZ píxeles por segundo, así que un tramo de esa
// longitud dura justo un segundo: la ruta de prueba va en tramos de 1 s.
var MS = 1000;
function ruta(nTramos, largoPx) {
  var paso = (largoPx == null) ? VLV.PX_POR_SEGUNDO_LUZ : largoPx, pts = [];
  for (var i = 0; i <= nTramos; i++) pts.push({ sx: i * paso, sy: 0 });
  return pts;
}
var tres = ruta(3), uno = ruta(1);
eq(VLV.tramoEncendido(0, tres), { tramo: 0, u: 0 }, 'arranca en el primer tramo, saliendo del origen');
eq(VLV.tramoEncendido(MS / 2, tres), { tramo: 0, u: 0.5 }, 'a media travesía la luz va por la mitad del tramo');
eq(VLV.tramoEncendido(MS, tres), { tramo: 1, u: 0 }, 'al llegar al destino se enciende el siguiente tramo');
eq(VLV.tramoEncendido(2 * MS, tres), { tramo: 2, u: 0 }, 'y así hasta el último');
eq(VLV.tramoEncendido(3 * MS + 10, tres), { tramo: 2, u: 1 }, 'el último tramo se queda encendido durante la pausa');
eq(VLV.tramoEncendido(3 * MS + VLV.MS_PAUSA, tres), { tramo: 0, u: 0 }, 'y el ciclo reinicia desde el origen');
eq(VLV.tramoEncendido(0, uno), { tramo: 0, u: 0 }, 'un viaje de un solo objeto es UN tramo, y no se rompe');
eq(VLV.tramoEncendido(MS + 10, uno), { tramo: 0, u: 1 }, 'ese único tramo también espera en la pausa');
eq(VLV.tramoEncendido(0, ruta(0)), null, 'menos de dos puntos no es un recorrido');
eq(VLV.tramoEncendido(0, []), null, 'sin puntos tampoco');
eq(VLV.tramoEncendido(0, null), null, 'sin ruta tampoco');

// La luz NO acelera en los saltos largos: el tramo dura lo que mide, así que a
// doble longitud, doble tiempo, y a la mitad del reloj va por la mitad de los dos.
var largo = ruta(1, 2 * VLV.PX_POR_SEGUNDO_LUZ);
eq(VLV.tramoEncendido(MS, largo), { tramo: 0, u: 0.5 }, 'el tramo del doble de largo tarda el doble');
eq(VLV.tramoEncendido(MS, ruta(1)).u, VLV.tramoEncendido(2 * MS, largo).u,
   'los dos acaban su tramo, cada uno a su tiempo: la velocidad es la misma');
// Los topes protegen las dos puntas: ni parpadeo ni travesía eterna.
eq(VLV.tramoEncendido(VLV.MS_MIN_TRAMO - 1, ruta(1, 1)).tramo, 0, 'un tramo cortísimo dura al menos el mínimo');
eq(VLV.tramoEncendido(VLV.MS_MAX_TRAMO + 10, ruta(1, 100000)), { tramo: 0, u: 1 },
   'y un saltazo no dura más que el máximo');

// El mismo instante da el mismo tramo: el origen del reloj es UNO.
eq(VLV.tramoEncendido(MS + 300, tres), VLV.tramoEncendido(MS + 300, tres), 'el estado solo depende del instante');
VLV.reiniciar(5000);
eq(VLV.tramoEncendido(5000, tres), { tramo: 0, u: 0 }, 'reiniciar() devuelve la luz al origen (cambio de vista)');
VLV.reiniciar(0);

console.log('trazarCanvas (no dibuja lo que no es una ruta):');
var trazos = 0, cabezas = 0;
var ctxFalso = {
  save: function () {}, restore: function () {}, beginPath: function () {},
  moveTo: function () {}, lineTo: function () {}, setLineDash: function () {},
  arc: function () {}, fill: function () { cabezas++; },
  stroke: function () { trazos++; }
};
VLV.trazarCanvas(ctxFalso, [{ sx: 0, sy: 0 }], 0);
eq(trazos, 0, 'un solo punto no es un viaje: no se traza nada');
trazos = 0; cabezas = 0;
var tres = [{ sx: 0, sy: 0 }, { sx: 10, sy: 10 }, { sx: 20, sy: 0 }];
VLV.trazarCanvas(ctxFalso, tres, 0, 1, { tramo: 1, u: 0.5 });
eq(trazos, 4, 'a mitad del viaje: estela, pasado, base del activo y su punteado (ya no queda futuro)');
eq(cabezas, 1, 'y la luz que lo recorre, en la cabeza del tramo');
trazos = 0; cabezas = 0;
VLV.trazarCanvas(ctxFalso, tres, 0, 1, { tramo: 0, u: 0.5 });
eq(trazos, 4, 'en el primer tramo no hay pasado, pero sí futuro');
trazos = 0; cabezas = 0;
VLV.trazarCanvas(ctxFalso, [{ sx: 0, sy: 0 }, { sx: 10, sy: 10 }, { sx: 20, sy: 0 }], 0, 1, null);
eq(trazos, 3, 'sin tramo encendido (movimiento reducido) la ruta va entera, quieta y con su brillo de siempre');
eq(cabezas, 0, 'y sin luz que la recorra');

if (fallos) { console.log('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nTodo verde.');
