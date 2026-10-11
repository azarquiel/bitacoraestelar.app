#!/usr/bin/env node
/* Test de la fusión de estrellas duplicadas del mapa
   (mapa/js/via-lactea-duplicados.js). Casos reales de producción: Sheliak /
   HR 7106 y HR 7139 / SAO 67559 (misma posición, filas distintas).
   Sin framework:  node scripts/test_duplicados.js */
'use strict';
var D = require('../mapa/js/via-lactea-duplicados.js');

var fallos = 0;
function eq(a, b, et) {
  var x = JSON.stringify(a), y = JSON.stringify(b);
  if (x === y) console.log('  ok   ' + et);
  else { fallos++; console.error('  FALLA ' + et + '\n         esperado ' + y + '\n         obtenido ' + x); }
}

console.log('prioridad del nombre:');
['Sheliak', 'Bet Lyr', '10 Lyr', 'HR 7106', 'HD 174638', 'SAO 67559', 'HIP 92420'].forEach(function (n, i) {
  eq(D.rangoNombre(n), [0, 1, 1, 2, 3, 4, 5][i], n);
});

function datos() {
  var star = function (id, label, l, b, d, tipo) { return { id: id, label: label, l: l, b: b, dist: d, tipo: tipo || 'estrella' }; };
  return {
    objects: [
      star('hr7106', 'HR 7106', 63.188, 14.783, 906), star('sheliak', 'Sheliak', 63.188, 14.783, 906),
      star('hr7139', 'HR 7139', 66.925, 15.323, 770), star('sao67559', 'SAO 67559', 66.925, 15.323, 770),
      star('ic1396', 'IC 1396', 99.3, 3.8, 2951, 'emision'), star('tr37', 'Tr 37', 99.3, 3.8, 2951, 'abierto'),
      star('vega', 'Vega', 67.4, 19.2, 25)
    ],
    obs: { hr7106: [{ observador: 'a' }], sheliak: [{ observador: 'b' }], hr7139: [{ observador: 'a' }, { observador: 'b' }] },
    viajes: { 1: { objetos: ['hr7106', 'm1'] }, 2: { objetos: ['sheliak', 'hr7106'] }, 3: { objetos: ['sao67559'] } }
  };
}

console.log('unificar:');
var d = datos(), f = D.unificar(d.objects, d.obs, d.viajes);
eq(d.objects.map(function (o) { return o.id; }), ['sheliak', 'hr7139', 'ic1396', 'tr37', 'vega'], 'una fila por estrella; no estrellas intactas');
eq(f, { hr7106: 'sheliak', sao67559: 'hr7139' }, 'mapa alias -> canónica');
eq(d.objects[0].alias, ['HR 7106'], 'el nombre descartado queda como alias');
eq(d.obs.sheliak.map(function (o) { return o.observador; }), ['b', 'a'], 'sesiones propias primero, las del alias detrás');
eq(d.obs.hr7106, undefined, 'la fila alias no conserva sesiones');
eq(d.viajes[1].objetos, ['sheliak', 'm1'], 'viaje redirigido al canónico');
eq(d.viajes[2].objetos, ['sheliak'], 'sin repetir si el viaje ya pasaba por los dos');
eq(d.viajes[3].objetos, ['hr7139'], 'viaje por un alias sin sesiones');
eq(D.unificar(d.objects, d.obs, d.viajes), {}, 'idempotente');

if (fallos) { console.error('\n' + fallos + ' fallo(s)'); process.exit(1); }
console.log('\nTodo ok.');
