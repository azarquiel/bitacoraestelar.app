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

// La nave vive en la ruta, que va en píxeles de PANTALLA, así que sin pedirlo se
// quedaría del mismo tamaño mientras el mapa se aleja. Encoge con la misma ley
// que los marcadores, y esa ley está en un solo sitio.
eq(/rutaNave\.setAttribute\('transform',[\s\S]{0,260}escalaAparenteMarcador\(scale\)/.test(app), true,
   'la nave encoge con la escena, con la ley de los marcadores');
eq((app.match(/function escalaAparenteMarcador/g) || []).length, 1,
   'y esa ley se escribe una sola vez');

console.log('hayQueElegir (con varias observaciones se elige, no se abre una):');
eq(VLV.hayQueElegir('m13'), true, 'cinco observaciones -> el mapa enseña la lista');
eq(VLV.hayQueElegir('m57'), false, 'una sola observación -> se abre directamente');
eq(VLV.hayQueElegir('m92'), false, 'objeto sin observaciones -> nada que elegir');

console.log('tramoEncendido (la nave avanza a velocidad constante):');
// La nave hace PX_POR_SEGUNDO_LUZ píxeles por segundo, así que un tramo de dos
// veces esa longitud dura dos segundos. La ruta de prueba va en tramos de 2 s,
// por encima del mínimo (MS_MIN_TRAMO), que si no mandaría él y no la velocidad.
var PXS = VLV.PX_POR_SEGUNDO_LUZ, LARGO = 2 * PXS, MS = 2000;
function ruta(nTramos, largoPx) {
  var paso = (largoPx == null) ? LARGO : largoPx, pts = [];
  for (var i = 0; i <= nTramos; i++) pts.push({ sx: i * paso, sy: 0 });
  return pts;
}
// La MISMA ruta con el zoom puesto: todos los tramos por el mismo factor.
function conZoom(pts, k) {
  return pts.map(function (p) { return { sx: p.sx * k, sy: p.sy * k }; });
}
// La nave avanza con el reloj, así que el test la lleva paso a paso, y en
// fotogramas de 20 ms como en el mapa: de una tacada no valdría, porque un salto
// grande lo recorta el tope de la pestaña dormida (MS_SALTO_MAX).
// Sumar fotograma a fotograma acumula el error del float (0,5 sale
// 0,5000000000000002), así que la posición de la nave se compara con tolerancia:
// lo que se fija es dónde va, no el último bit.
function eqCasi(a, b, et) {
  var ok = (a === null && b === null) ||
           (a && b && a.tramo === b.tramo && Math.abs(a.u - b.u) < 1e-9);
  if (ok) { console.log('  ok   ' + et); }
  else { fallos++; console.log('  FALLA ' + et + '\n         esperado ' + JSON.stringify(b) + '\n         obtenido ' + JSON.stringify(a)); }
}

var reloj = 0, FOTOGRAMA = 20;
function anda(ms, pts) {
  var fin = reloj + ms, ultimo = VLV.tramoEncendido(reloj, pts);
  while (reloj < fin) {
    reloj = Math.min(fin, reloj + FOTOGRAMA);
    ultimo = VLV.tramoEncendido(reloj, pts);
  }
  return ultimo;
}

var tres = ruta(3), uno = ruta(1);
// En cada objeto la nave hace escala antes de salir, así que el test la deja
// salir primero. 'sale' se come esa espera.
function sale(pts) { return anda(VLV.MS_ESPERA, pts); }

VLV.reiniciar(reloj);
eqCasi(anda(0, tres), { tramo: 0, u: 0 }, 'arranca parada en el origen');
eqCasi(anda(VLV.MS_ESPERA / 2, tres), { tramo: 0, u: 0 }, 'y sigue parada mientras dura la escala');
anda(VLV.MS_ESPERA / 2, tres);   // lo que le quedaba de escala
eqCasi(anda(MS / 2, tres), { tramo: 0, u: 0.5 }, 'a media travesía la nave va por la mitad del tramo');
eqCasi(anda(MS / 2, tres), { tramo: 1, u: 0 }, 'al llegar al destino se enciende el siguiente tramo');
eqCasi(sale(tres), { tramo: 1, u: 0 }, 'que empieza con su propia escala');
eqCasi(anda(MS, tres), { tramo: 2, u: 0 }, 'y así hasta el último');
eqCasi(anda(VLV.MS_ESPERA + MS, tres), { tramo: 2, u: 1 }, 'el último tramo se queda encendido durante la pausa');
eqCasi(anda(VLV.MS_PAUSA, tres), { tramo: 0, u: 0 }, 'y el ciclo reinicia desde el origen');

VLV.reiniciar(reloj);
eqCasi(anda(0, uno), { tramo: 0, u: 0 }, 'un viaje de un solo objeto es UN tramo, y no se rompe');
sale(uno);
eqCasi(anda(MS, uno), { tramo: 0, u: 1 }, 'ese único tramo también espera en la pausa');
eq(VLV.tramoEncendido(reloj, ruta(0)), null, 'menos de dos puntos no es un recorrido');
eq(VLV.tramoEncendido(reloj, []), null, 'sin puntos tampoco');
eq(VLV.tramoEncendido(reloj, null), null, 'sin ruta tampoco');

// ARRANQUE Y FRENADA: sale despacio, cruza rápido y llega frenando, pero la
// travesía dura lo mismo que si fuera plana y el centro cae donde caía.
eq(VLV.suavizar(0), 0, 'el tramo empieza donde empezaba');
eq(VLV.suavizar(1), 1, 'y acaba donde acababa');
eq(VLV.suavizar(0.5), 0.5, 'y a mitad de reloj va por la mitad del tramo');
var dp = 1e-4;
var vSalida = (VLV.suavizar(dp) - VLV.suavizar(0)) / dp;
var vCentro = (VLV.suavizar(0.5 + dp) - VLV.suavizar(0.5)) / dp;
var vLlegada = (VLV.suavizar(1) - VLV.suavizar(1 - dp)) / dp;
eq(Math.abs(vSalida - (1 - VLV.VAIVEN)) < 0.01, true, 'sale a un 20% por debajo del crucero');
eq(Math.abs(vLlegada - (1 - VLV.VAIVEN)) < 0.01, true, 'y llega igual de despacio');
eq(Math.abs(vCentro - (1 + VLV.VAIVEN)) < 0.01, true, 'y en el centro va un 20% por encima');

// LA VELOCIDAD DE CRUCERO ES LA MISMA SEA CUAL SEA EL VIAJE: el tramo del doble
// de largo tarda el doble en cruzarse, no lo mismo repartido de otra forma.
VLV.reiniciar(reloj);
var doble = ruta(1, 2 * LARGO);
sale(doble);
eqCasi(anda(2 * MS, doble), { tramo: 0, u: 1 }, 'el tramo del doble de largo tarda el doble');
VLV.reiniciar(reloj);
sale(doble);
eqCasi(anda(MS, doble), { tramo: 0, u: 0.5 }, 'y a la mitad del tiempo va por la mitad');
// Y por eso cambiar de viaje no acelera la nave: en una ruta más extensa avanza
// los mismos píxeles en el mismo tiempo.
VLV.reiniciar(reloj);
var extensa = ruta(2, 2 * LARGO);
sale(extensa);
eq(Math.abs(anda(MS, extensa).u * (2 * LARGO) - PXS * MS / 1000) < 1e-6, true,
   'en un viaje más extenso recorre los mismos píxeles por segundo');

// EL ZOOM NO TELETRANSPORTA LA NAVE: el avance es estado, no una fase que se
// recalcula. Acercarse cambia lo que queda por delante, no dónde está.
VLV.reiniciar(reloj);
sale(tres);
anda(MS / 2, tres);
eqCasi(VLV.tramoEncendido(reloj, conZoom(tres, 7)), { tramo: 0, u: 0.5 }, 'acercarse no la mueve de sitio');
eqCasi(VLV.tramoEncendido(reloj, conZoom(tres, 0.2)), { tramo: 0, u: 0.5 }, 'alejarse tampoco');

// Preguntar dos veces en el mismo fotograma no avanza el doble: es lo que deja
// que las tres escalas compartan una sola nave.
VLV.reiniciar(reloj);
sale(tres);
anda(MS / 2, tres);
eqCasi(VLV.tramoEncendido(reloj, tres), { tramo: 0, u: 0.5 }, 'dos vistas preguntando a la vez no la adelantan');

// Los topes protegen las dos puntas: ni parpadeo ni travesía eterna.
VLV.reiniciar(reloj);
sale(ruta(1, 1));
eq(anda(VLV.MS_MIN_TRAMO - 1, ruta(1, 1)).u < 1, true, 'un tramo cortísimo dura al menos el mínimo');
VLV.reiniciar(reloj);
var saltazo = ruta(1, 1000000);
sale(saltazo);
eqCasi(anda(VLV.MS_MAX_TRAMO, saltazo), { tramo: 0, u: 1 }, 'y un saltazo no dura más que el máximo');

// Un parón (pestaña dormida) no adelanta el viaje.
VLV.reiniciar(reloj);
reloj += 60000;
eq(VLV.tramoEncendido(reloj, tres).tramo, 0, 'un minuto sin pintar no manda la nave al final');

// La ruta puede encoger bajo los pies de la nave (otra escala, otro viaje).
VLV.reiniciar(reloj);
sale(tres);
anda(2.5 * MS, tres);
eq(VLV.tramoEncendido(reloj, uno).tramo, 0, 'si la ruta encoge, la nave no se queda fuera de ella');
VLV.reiniciar(reloj);

console.log('trazarCanvas (no dibuja lo que no es una ruta):');
var trazos = 0, naves = 0, giro = null;
var ctxFalso = {
  save: function () {}, restore: function () {}, beginPath: function () {},
  moveTo: function () {}, lineTo: function () {}, closePath: function () {},
  setLineDash: function () {}, translate: function () {},
  rotate: function (r) { giro = r; }, fill: function () { naves++; },
  createLinearGradient: function () { return { addColorStop: function () {} }; },
  stroke: function () { trazos++; }
};
VLV.trazarCanvas(ctxFalso, [{ sx: 0, sy: 0 }], 1);
eq(trazos, 0, 'un solo punto no es un viaje: no se traza nada');
trazos = 0; naves = 0;
var tres = [{ sx: 0, sy: 0 }, { sx: 10, sy: 10 }, { sx: 20, sy: 0 }];
VLV.trazarCanvas(ctxFalso, tres, 1, { tramo: 1, u: 0.5 });
eq(trazos, 3, 'a mitad del viaje: pasado, estela y tramo encendido (ya no queda futuro)');
eq(naves, 1, 'y la nave que lo recorre');
trazos = 0; naves = 0;
VLV.trazarCanvas(ctxFalso, tres, 1, { tramo: 0, u: 0.5 });
eq(trazos, 3, 'en el primer tramo no hay pasado, pero sí futuro');
// La nave mira al destino, no al norte: el tramo 0 sube en diagonal (45°) y el
// tramo 1 baja (-45°).
VLV.trazarCanvas(ctxFalso, tres, 1, { tramo: 0, u: 0.5 });
eq(Math.round(giro * 180 / Math.PI), 45, 'la nave apunta al destino del tramo');
VLV.trazarCanvas(ctxFalso, tres, 1, { tramo: 1, u: 0.5 });
eq(Math.round(giro * 180 / Math.PI), -45, 'y gira con él');
trazos = 0; naves = 0;
VLV.trazarCanvas(ctxFalso, tres, 1, null);
eq(trazos, 2, 'sin tramo encendido (movimiento reducido) la ruta va entera, quieta y con su brillo');
eq(naves, 0, 'y sin nave que la recorra');

console.log('la nave y el brillo del tramo que recorre:');
// El delta de la solapa no es simétrico: un ala barrida más larga que la otra.
var alas = VLV.NAVE.filter(function (p) { return p[0] < 0 && p[1] !== 0; });
eq(alas.length, 2, 'la nave tiene dos alas hacia atrás');
eq(Math.abs(alas[0][1]) !== Math.abs(alas[1][1]), true, 'y una es más larga que la otra');
eq(VLV.NAVE[0][0] > 0 && VLV.NAVE[0][1] === 0, true, 'la punta va delante y centrada');
// El tramo se ilumina DESDE la nave: máximo en ella, y siempre por debajo de
// ella para que la nave sea lo que se mira.
function brilloEn(paradas, x) {
  for (var i = 0; i < paradas.length; i++) if (Math.abs(paradas[i][0] - x) < 1e-9) return paradas[i][1];
  return null;
}
var pm = VLV.paradasDeBrillo(0.5);
eq(brilloEn(pm, 0.5) > brilloEn(pm, 0), true, 'bajo la nave brilla más que en el extremo');
eq(brilloEn(pm, 0.5) < 0.98, true, 'pero menos que la nave misma');
eq(pm.map(function (p) { return p[0]; }), [0, 0.5 - VLV.CAIDA, 0.5, 0.5 + VLV.CAIDA, 1],
   'las paradas van en orden, con la caída a los dos lados');
// En las puntas del tramo no hay medio degradado que se salga: se recorta.
var p0 = VLV.paradasDeBrillo(0);
eq(p0[0][0] === 0 && p0[0][1] > p0[p0.length - 1][1], true,
   'saliendo del origen, el brillo arranca en la nave y cae hacia adelante');
eq(VLV.paradasDeBrillo(1)[0][0], 0, 'y al llegar, al revés, sin paradas fuera del tramo');

if (fallos) { console.log('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nTodo verde.');
