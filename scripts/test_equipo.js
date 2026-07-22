/* Test de los helpers puros del equipo del observador
   (resources/js/bitacora-equipo.js). Cubre la focal efectiva con óptica auxiliar
   y el rótulo del telescopio.
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

if (fallos) { console.log('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nTodo verde.');
