/* Test de la selección pura de estrellas del vecindario solar
   (mapa/js/via-lactea-vecindario-catalogo.js). Cubre el filtro por distancia y
   coordenadas, la resolución del BP–RP y clase, y la proyección a XYZ (Sol en el
   origen).
   Sin framework:  node scripts/test_vecindario_catalogo.js */

'use strict';

// La selección usa el modelo de color Gaia como global (igual que en el mapa).
global.BitacoraGaiaColor = require('../resources/js/bitacora-gaia-color.js');

var V = require('../mapa/js/via-lactea-vecindario-catalogo.js');

var fallos = 0;
function eq(a, b, et) {
  if (a === b) { console.log('  ok   ' + et); }
  else { fallos++; console.log('  FALLA ' + et + '\n         esperado ' + JSON.stringify(b) + '\n         obtenido ' + JSON.stringify(a)); }
}
function cerca(a, b, et) {
  if (Math.abs(a - b) <= 1e-9) { console.log('  ok   ' + et); }
  else { fallos++; console.log('  FALLA ' + et + '\n         esperado ≈' + b + '\n         obtenido ' + a); }
}

console.log('galToXYZ (Sol en el origen):');
(function () {
  var c = V.galToXYZ(0, 0, 10);   // hacia el centro galáctico
  cerca(c.x, 10, 'l=0,b=0 -> x=d'); cerca(c.y, 0, 'l=0 -> y=0'); cerca(c.z, 0, 'b=0 -> z=0');
  var y = V.galToXYZ(90, 0, 10);  // l=90
  cerca(y.y, 10, 'l=90 -> y=d'); cerca(y.x, 0, 'l=90 -> x≈0');
  var z = V.galToXYZ(0, 90, 10);  // polo galáctico norte
  cerca(z.z, 10, 'b=90 -> z=d');
})();

console.log('estrellasVecindario (filtro por distancia y coordenadas):');
var objs = [
  { id: 'sirio',  label: 'Sirio',  name: 'Alfa Canis Majoris', l: 227.2, b: -8.9, dist: 8.6,  bp_rp: 0.0, tipo: 'estrella' },
  { id: 'vega',   label: 'Vega',   name: 'Alfa Lyrae',         l: 67.4,  b: 19.2, dist: 25.0, bprp: 0.15, tipo: 'estrella' }, // reserva 'bprp'
  { id: 'lejana', label: 'M31',    name: 'Andrómeda',          l: 121.2, b: -21.6, dist: 2500000, bp_rp: 1.0, tipo: 'S' },
  { id: 'sincoord', label: 'X',    name: 'sin coords',         dist: 10, tipo: 'estrella' },
  { id: 'distcero', label: 'Y',    name: 'dist 0',             l: 10, b: 0, dist: 0, tipo: 'estrella' },
  { id: 'sinbprp', label: 'Barnard', name: 'Estrella de Barnard', l: 31.0, b: 14.1, dist: 5.96, tipo: 'estrella' } // sin BP–RP
];
var vec = V.estrellasVecindario(objs, 500);
var ids = vec.map(function (o) { return o.id; });
eq(ids.indexOf('sirio') >= 0, true, 'estrella cercana (8,6 al) entra');
eq(ids.indexOf('vega') >= 0, true, 'estrella a 25 al entra');
eq(ids.indexOf('sinbprp') >= 0, true, 'estrella cercana sin BP–RP entra igual');
eq(ids.indexOf('lejana'), -1, 'objeto lejano (> 500 al) fuera');
eq(ids.indexOf('sincoord'), -1, 'sin coordenadas galácticas fuera');
eq(ids.indexOf('distcero'), -1, 'distancia 0 fuera');
eq(vec.length, 3, 'solo entran las 3 válidas');

console.log('BP–RP, clase y campos:');
var sirio = vec.filter(function (o) { return o.id === 'sirio'; })[0];
eq(sirio.bprp, 0.0, 'bp_rp tomado del campo bp_rp');
eq(sirio.name, 'Sirio', 'name = label');
eq(sirio.desc, 'Alfa Canis Majoris', 'desc = name del objeto');
eq(sirio.title, 'Alfa Canis Majoris', 'title = name del objeto');
eq(sirio.ficha, 'sirio', 'ficha cae al id si no hay ficha');
eq(typeof sirio.clase === 'string', true, 'con BP–RP hay clase espectral');
var vega = vec.filter(function (o) { return o.id === 'vega'; })[0];
eq(vega.bprp, 0.15, 'bprp (reserva) tomado cuando no hay bp_rp');
var barnard = vec.filter(function (o) { return o.id === 'sinbprp'; })[0];
eq(barnard.bprp, null, 'sin BP–RP -> bprp null');
eq(barnard.clase, null, 'sin BP–RP -> clase null (color neutro en el render)');

// Una vista no repite lo que enseña la de al lado: el vecindario es SOLO para
// estrellas, así que el espacio profundo cercano (Barnard 33 está a 1.500 al)
// se queda en la vista de la galaxia.
// Lo decide ENTERO el clasificador: aquí no se adivina por el nombre. Antes esta
// capa partía el cajón 'otro' con un regex de prefijos de catálogo, que colaba
// como estrella cualquier nebulosa de un catálogo fuera de su lista (Gum, RCW).
console.log('esEstrella (estrella vs. espacio profundo):');
eq(V.esEstrella({ id: 'sirius', tipo: 'estrella' }), true, 'estrella es estrella');
eq(V.esEstrella({ id: 'ycvn', tipo: 'carbono' }), true, 'estrella de carbono es estrella');
eq(V.esEstrella({ id: 'ngc2024', tipo: 'abierto' }), false, 'cúmulo abierto no es estrella');
eq(V.esEstrella({ id: 'm13', tipo: 'globular' }), false, 'globular no es estrella');
eq(V.esEstrella({ id: 'ngc40', tipo: 'planetaria' }), false, 'planetaria no es estrella');
eq(V.esEstrella({ id: 'm8', tipo: 'emision' }), false, 'nebulosa de emisión no es estrella');
eq(V.esEstrella({ id: 'm1', tipo: 'snr' }), false, 'resto de supernova no es estrella');
eq(V.esEstrella({ id: 'm31', tipo: 'S' }), false, 'galaxia (clase de Hubble) no es estrella');
eq(V.esEstrella({ id: 'barnard33', label: 'Barnard 33', tipo: 'desconocido' }), false,
  'sin clasificar (Barnard 33) no es estrella: no se adivina');
eq(V.esEstrella({ id: 'abell12', label: 'Abell 12', tipo: 'desconocido' }), false,
  'sin clasificar (Abell 12, una planetaria que SIMBAD no resolvió) no es estrella');
eq(V.esEstrella({ id: 'gum1', label: 'Gum 1', tipo: 'desconocido' }), false,
  'nebulosa de un catálogo raro no se cuela: antes el regex de prefijos no la listaba');
eq(V.esEstrella({ id: 'viejo', label: 'Sirius', tipo: 'otro' }), false,
  'el tipo viejo «otro» no es estrella hasta que el backfill lo reclasifique');
eq(V.esEstrella({ id: 'sintipo', label: 'X' }), false, 'sin tipo no es estrella');

console.log('estrellasVecindario (solo estrellas):');
var mezcla = V.estrellasVecindario([
  { id: 'sirius', label: 'Sirius', l: 227.2, b: -8.9, dist: 9, tipo: 'estrella' },
  { id: 'barnard33', label: 'Barnard 33', l: 207.0, b: -16.8, dist: 1500, tipo: 'desconocido' },
  { id: 'ngc2024', label: 'NGC 2024', l: 206.5, b: -16.4, dist: 1350, tipo: 'abierto' }
], 1500).map(function (o) { return o.id; });
eq(mezcla.join(','), 'sirius', 'el espacio profundo cercano no entra en el vecindario');

console.log('enVecindario (lo que la vista de la galaxia ya no repite):');
eq(V.enVecindario({ id: 'sirius', l: 227.2, b: -8.9, dist: 9, tipo: 'estrella' }, 1500), true,
  'estrella cercana: la enseña el vecindario');
eq(V.enVecindario({ id: 'barnard33', label: 'Barnard 33', l: 207.0, b: -16.8, dist: 1500, tipo: 'desconocido' }, 1500), false,
  'espacio profundo cercano: sigue en la galaxia');
eq(V.enVecindario({ id: 'ssvir', l: 300, b: 10, dist: 2037, tipo: 'carbono' }, 1500), false,
  'estrella lejana: sigue en la galaxia');

console.log('robustez:');
eq(V.estrellasVecindario([], 500).length, 0, 'lista vacía -> []');
eq(V.estrellasVecindario(null, 500).length, 0, 'null -> []');
eq(V.estrellasVecindario(objs, 0).length, 0, 'distMax 0 -> nada entra');

console.log('fundidoVecindario (histéresis del tránsito):');
var CFG = { fovInicioAl: 4000, fovFinalAl: 1500, fovSalidaAl: 2500 };
function fun(fov, cerca, dentro) { return V.fundidoVecindario(fov, cerca, dentro, CFG); }

eq(fun(5000, true, false).alpha, 0, 'lejos del vecindario -> capa apagada');
eq(fun(1200, false, false).alpha, 0, 'sin el Sol centrado no se entra');
eq(fun(1200, true, false).alpha, 1, 'Sol centrado y campo bajo fovFinalAl -> entra');
eq(fun(1200, true, false).dentro, true, 'al fundirse del todo queda "dentro"');
eq(fun(3000, true, false).dentro, false, 'a medio fundido aún no está "dentro"');

// El fallo que se arregla: dentro del vecindario, descentrar el Sol al hacer
// zoom apagaba la capa de golpe (galaxia gigante mezclada con la escena).
eq(fun(1200, false, true).alpha, 1, 'ya dentro, perder el centro NO apaga la capa');
eq(fun(2400, false, true).alpha, 1, 'ya dentro, opaco hasta fovSalidaAl');
eq(fun(2400, false, true).dentro, true, 'ya dentro, sigue dentro');
eq(fun(3250, true, true).alpha, 0.5, 'salir se funde entre fovSalidaAl y fovInicioAl');
eq(fun(4000, true, true).alpha, 0, 'por encima de fovInicioAl se sale');
eq(fun(4000, true, true).dentro, false, 'y deja de estar dentro');
eq(V.fundidoVecindario(2400, true, false, { fovInicioAl: 4000, fovFinalAl: 1500 }).alpha < 1,
  true, 'sin fovSalidaAl no hay histéresis (entrada de siempre)');

// La capa toma el control al entrar: en cuanto manda, la app remata el zoom con
// el Sol centrado (si no, se ve la galaxia gigante translúcida por detrás).
console.log('tomarControl (la capa remata la entrada):');
eq(fun(5000, true, false).tomarControl, false, 'lejos, nada que rematar');
eq(fun(3000, true, false).tomarControl, false, 'fundido por debajo de la mitad: aún manda la galaxia');
eq(fun(2000, true, false).tomarControl, true, 'en cuanto la capa manda, se remata la entrada');
eq(fun(1200, true, false).tomarControl, true, 'de un salto al fundido completo, también');
eq(fun(1200, false, false).tomarControl, false, 'sin el Sol centrado no se entra, luego no se remata');
eq(fun(2000, true, true).tomarControl, false, 'ya dentro no se remata (si no, no se podría salir)');
eq(fun(3250, true, true).tomarControl, false, 'saliendo, la capa deja marchar');

// La capa emite el clic por API.onObjectClick, pero el manejador lo pone el
// visor. Sin esa línea, pulsar una estrella del vecindario no abre nada (el
// visor además ignora sus propios clics mientras la escena es interactiva).
console.log('cableado del clic (via-lactea-app.js):');
var app = require('fs').readFileSync(__dirname + '/../mapa/js/via-lactea-app.js', 'utf8');
eq(/GrupoLocal\.onObjectClick\s*=/.test(app), true, 'el atlas tiene manejador de clic');
eq(/VecindarioSolar\.onObjectClick\s*=/.test(app), true, 'el vecindario tiene manejador de clic');

// Los marcadores nacen visibles y es refreshAnchors() quien esconde los que ya
// enseña el vecindario. Si solo se llama desde los manejadores (leyenda, cambio
// de vista, filtro, viaje), al ABRIR el mapa la galaxia repite las estrellas del
// vecindario —Sirius, Gamma Andromeda…— hasta que se toca algo. Hace falta una
// llamada al arrancar, a nivel del módulo (sangría de dos espacios).
console.log('estado inicial de los marcadores (via-lactea-app.js):');
eq(/^ {2}refreshAnchors\(\);/m.test(app), true, 'al abrir el mapa ya se aplica el filtro de escala');

if (fallos) { console.log('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nTodo verde.');
