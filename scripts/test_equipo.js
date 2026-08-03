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

if (fallos) { console.log('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nTodo verde.');
