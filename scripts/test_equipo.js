/* Test de los helpers puros del equipo del observador
   (resources/js/bitacora-equipo.js). Cubre la focal efectiva con óptica auxiliar,
   el rótulo del telescopio y el orden "Mi flota primero" del selector.
   Sin framework:  node scripts/test_equipo.js */

'use strict';

var E = require('../resources/js/bitacora-equipo.js');

var fallos = 0;
function eq(a, b, et) {
  if (a === b) { console.log('  ok   ' + et); }
  else { fallos++; console.log('  FALLA ' + et + '\n         esperado ' + JSON.stringify(b) + '\n         obtenido ' + JSON.stringify(a)); }
}
function cerca(a, b, et) {
  if (Math.abs(a - b) <= 1e-9) { console.log('  ok   ' + et); }
  else { fallos++; console.log('  FALLA ' + et + '\n         esperado ≈' + b + '\n         obtenido ' + a); }
}

console.log('focalEfectiva (auxiliar sobre la focal del telescopio):');
// Sin auxiliar (factor/extensión ausentes o vacíos) -> focal sin cambio.
eq(E.focalEfectiva(1200, null, null), 1200, 'sin auxiliar -> focal sin cambio');
eq(E.focalEfectiva(1200, '', ''), 1200, 'factor/extensión vacíos = neutro');
// Barlow 2x -> focal x2 (más aumento, campo estrecho).
eq(E.focalEfectiva(1200, 2, null), 2400, 'Barlow 2x -> x2');
// Reductor 0,6 -> focal x0,6 (menos aumento, campo amplio).
cerca(E.focalEfectiva(1200, 0.6, null), 720, 'reductor 0,6 -> x0,6');
// Coma decimal europea en el factor.
cerca(E.focalEfectiva(1000, '1,5', null), 1500, 'factor con coma decimal "1,5"');
// Extensión fija sumada (tuning ring).
eq(E.focalEfectiva(1000, null, 14), 1014, 'extensión fija sumada');
// Factor y extensión combinados: (focal * factor) + extensión.
eq(E.focalEfectiva(1000, 2, 14), 2014, 'factor y extensión combinados');
// Focal ausente -> null (no hay nada que calcular).
eq(E.focalEfectiva(null, 2, 0), null, 'focal ausente -> null');
// El aumento resultante cambia en el sentido esperado (focalEfectiva / focal_ocular).
(function () {
  var ocular = 10;
  var sinAux = E.focalEfectiva(1200, null, null) / ocular;   // 120x
  var conBarlow = E.focalEfectiva(1200, 2, null) / ocular;    // 240x
  var conReductor = E.focalEfectiva(1200, 0.6, null) / ocular; // 72x
  eq(conBarlow > sinAux, true, 'Barlow sube el aumento');
  eq(conReductor < sinAux, true, 'reductor baja el aumento');
})();

console.log('focalConAuxiliares (varias auxiliares encadenadas):');
(function () {
  var paracorr = { factor: 1.15, extension_mm: null };
  var barlow2x = { factor: 2, extension_mm: null };
  var anillo14 = { factor: null, extension_mm: 14 };

  // Sin ninguna auxiliar (lista vacía, nula o con huecos) -> focal del tubo.
  eq(E.focalConAuxiliares(1200, []), 1200, 'lista vacía -> focal sin cambio');
  eq(E.focalConAuxiliares(1200, null), 1200, 'lista nula -> focal sin cambio');
  eq(E.focalConAuxiliares(1200, [null, null]), 1200, 'los dos huecos vacíos -> focal sin cambio');
  // Un hueco suelto da lo mismo esté en el primero o en el segundo: así el
  // formulario no tiene que recolocar lo que el observador eligió.
  eq(E.focalConAuxiliares(1200, [barlow2x, null]), 2400, 'solo el primer hueco');
  eq(E.focalConAuxiliares(1200, [null, barlow2x]), 2400, 'solo el segundo hueco (mismo resultado)');
  // Encadenado real: Paracorr 1,15x y detrás una Barlow 2x.
  cerca(E.focalConAuxiliares(1200, [paracorr, barlow2x]), 2760, 'Paracorr 1,15x + Barlow 2x -> x2,3');
  // Factores puros conmutan: el orden no cambia el número.
  cerca(E.focalConAuxiliares(1200, [barlow2x, paracorr]),
        E.focalConAuxiliares(1200, [paracorr, barlow2x]), 'factores puros: el orden da igual');
  // Con extensión fija el orden SÍ importa, y es el de la lista: primero el hueco
  // 1 (el montado más cerca del telescopio). Este es el caso que fija la regla.
  eq(E.focalConAuxiliares(1000, [anillo14, barlow2x]), 2028, 'anillo +14 y luego Barlow 2x -> (1000+14)x2');
  eq(E.focalConAuxiliares(1000, [barlow2x, anillo14]), 2014, 'Barlow 2x y luego anillo +14 -> 1000x2+14');
  // Coma decimal europea, como en los CSV.
  cerca(E.focalConAuxiliares(1000, [{ factor: '1,5' }, { factor: '2' }]), 3000, 'factores con coma decimal');
  // Una sola auxiliar = el helper de siempre (no hay dos caminos para lo mismo).
  eq(E.focalConAuxiliares(1200, [barlow2x]), E.focalEfectiva(1200, 2, null), 'una sola = focalEfectiva');
  // Focal ausente -> null, igual que focalEfectiva.
  eq(E.focalConAuxiliares(null, [barlow2x]), null, 'focal ausente -> null');
})();

console.log('nombreTelescopio (rótulo a mostrar):');
eq(E.nombreTelescopio({ nombre: 'Mi Dobson', vendor: 'SkyWatcher', modelo: 'Flextube 250' }), 'Mi Dobson', 'nombre propio manda');
eq(E.nombreTelescopio({ nombre: '', vendor: 'SkyWatcher', modelo: 'Flextube 250' }), 'SkyWatcher Flextube 250', 'sin nombre -> vendor modelo');
eq(E.nombreTelescopio({ vendor: 'Celestron', modelo: 'C8' }), 'Celestron C8', 'nombre ausente -> vendor modelo');
eq(E.nombreTelescopio({ nombre: '   ', vendor: 'Meade', modelo: 'LX90' }), 'Meade LX90', 'nombre solo espacios -> vendor modelo');
eq(E.nombreTelescopio({ nombre: '  El de viaje  ' }), 'El de viaje', 'nombre con espacios recortado');
eq(E.nombreTelescopio({ vendor: '', modelo: 'Newton 200/1200' }), 'Newton 200/1200', 'sin vendor -> solo modelo');
eq(E.nombreTelescopio(null), '', 'item nulo -> cadena vacía');

console.log('flotaPrimero (Mi flota delante del catálogo global):');
(function () {
  var flota = [{ id: 91, nombre: 'El de viaje', vendor: 'SkyWatcher', modelo: 'Heritage 130', apertura_mm: 130 }];
  var catalogo = [
    { id: 3, vendor: 'Celestron', modelo: 'C8', apertura_mm: 203 },
    { id: 7, vendor: 'Takahashi', modelo: 'FC-100', apertura_mm: 100 }
  ];
  var lista = E.flotaPrimero(flota, catalogo);
  eq(lista.length, 3, 'flota + catálogo en una sola lista');
  eq(lista[0].id, 91, 'la pieza de la flota va la primera');
  eq(lista[0].esFlota, true, 'la pieza de la flota queda marcada esFlota');
  eq(lista[1].id, 3, 'detrás, el catálogo en su orden');
  eq(!!lista[1].esFlota, false, 'el catálogo NO se marca como flota');
  // La respuesta de la API no se toca: otros la leen (Mi flota, precarga…).
  eq('esFlota' in flota[0], false, 'no muta el objeto de entrada');
  // El rótulo sigue siendo el mismo helper: nombre propio delante.
  eq(E.nombreTelescopio(lista[0]), 'El de viaje', 'el rótulo de la flota es su nombre propio');

  // Sin sesión no hay flota: la lista es el catálogo tal cual.
  eq(E.flotaPrimero(null, catalogo).length, 2, 'sin flota -> solo catálogo');
  eq(E.flotaPrimero(null, catalogo)[0].id, 3, 'sin flota -> el catálogo abre la lista');
  eq(E.flotaPrimero(flota, null).length, 1, 'sin catálogo -> solo la flota');
  eq(E.flotaPrimero(null, null).length, 0, 'sin nada -> lista vacía');
})();

console.log('rotuloNave (la nave que hizo el viaje, en la ficha del mapa):');
eq(E.rotuloNave({ nombre: 'Excalibur', apertura_mm: 457, focal_mm: 2057 }), 'Excalibur · 18" f/4.5',
   'las medidas van SIEMPRE; el nombre propio delante si lo tiene');
eq(E.rotuloNave({ nombre: 'Excalibur' }), 'Excalibur',
   'con nombre y sin medidas, queda el nombre');
eq(E.rotuloNave({ vendor: 'Obsession', modelo: 'UC18', apertura_mm: 457, f_ratio: 4.5 }),
   '18" f/4.5', 'sin nombre, solo las medidas: pulgadas y relación focal');
eq(E.rotuloNave({ apertura_mm: 457, focal_mm: 2057 }), '18" f/4.5',
   'sin f_ratio se calcula con focal/apertura');
eq(E.rotuloNave({ apertura_mm: 305, focal_mm: 1525 }), '12" f/5',
   'redondo se queda redondo (12", f/5), sin decimales de adorno');
eq(E.rotuloNave({ apertura_mm: 114, focal_mm: 900 }), '4.5" f/7.9',
   'apertura pequeña con decimal (notación f/ de siempre, con punto)');
eq(E.rotuloNave({ vendor: 'Celestron', modelo: 'C8' }), 'Celestron C8',
   'sin medidas, el rótulo de siempre');
eq(E.rotuloNave(null), '', 'sin telescopio, sin rótulo');

// El listado de observaciones pinta el telescopio con jerarquía: el nombre
// propio manda (es como el observador reconoce su equipo) y el modelo va de
// detalle. Sin nombre propio, el modelo sube y no hay detalle que pintar.
console.log('rotuloFlota (el telescopio en el listado de observaciones):');
var r1 = E.rotuloFlota({ nombre: 'Excalibur', vendor: 'Obsession', modelo: 'UC18' });
eq(r1.principal, 'Excalibur', 'el nombre propio va delante');
eq(r1.detalle, 'Obsession UC18', 'y el modelo queda de detalle');
var r2 = E.rotuloFlota({ vendor: 'Celestron', modelo: 'C8' });
eq(r2.principal, 'Celestron C8', 'sin nombre propio, manda el modelo');
eq(r2.detalle, '', 'y entonces no hay detalle que repetir');
var r3 = E.rotuloFlota({ nombre: 'Excalibur' });
eq(r3.principal, 'Excalibur', 'nombre propio a secas: sigue siendo el rótulo');
eq(r3.detalle, '', 'sin datos de catálogo, sin detalle');
eq(E.rotuloFlota(null).principal, '', 'sin telescopio, sin rótulo');

var listado = require('fs').readFileSync(__dirname + '/../registro/resources/js/bitacora-listado.js', 'utf8');
var listadoHtml = require('fs').readFileSync(__dirname + '/../registro/listado-observaciones-wordpress.html', 'utf8');
eq(/BitacoraEquipo\.rotuloFlota/.test(listado), true, 'el listado compone el rótulo con BitacoraEquipo');
eq(/obs\.telescopio \|\| ''/.test(listado), true, 'y cae al texto guardado si no hay tubo de flota');
eq(/bitacora-equipo\.js/.test(listadoHtml), true, 'la página del listado carga bitacora-equipo.js');

// La ficha del mapa enseña la nave junto a la fecha estelar. El rótulo sale de
// aquí (fuente única); si la observación no trae telescopio de la flota, cae al
// texto libre que se escribió a mano. Sin el <script>, rotuloNave no existiría
// en el visor y la nave no saldría nunca.
console.log('cableado de la nave en la ficha del mapa:');
var fs = require('fs');
var app = fs.readFileSync(__dirname + '/../mapa/js/via-lactea-app.js', 'utf8');
var html = fs.readFileSync(__dirname + '/../mapa/mapa.html', 'utf8');
eq(/BitacoraEquipo\.rotuloNave\(f\.nave\)/.test(app), true, 'la ficha compone el rótulo con BitacoraEquipo');
eq(/f\.instrumento/.test(app), true, 'y cae al texto libre si no hay telescopio de la flota');
eq(/barraEstelar\(f\)\s*\+\s*entry\.html/.test(app), true, 'la nave va en la misma barra que la fecha estelar');
eq(/bitacora-equipo\.js/.test(html), true, 'mapa.html carga bitacora-equipo.js');

if (fallos) { console.log('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nTodo verde.');
