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
  { id: 'sirio',  label: 'Sirio',  name: 'Alfa Canis Majoris', l: 227.2, b: -8.9, dist: 8.6,  bp_rp: 0.0 },
  { id: 'vega',   label: 'Vega',   name: 'Alfa Lyrae',         l: 67.4,  b: 19.2, dist: 25.0, bprp: 0.15 }, // reserva 'bprp'
  { id: 'lejana', label: 'M31',    name: 'Andrómeda',          l: 121.2, b: -21.6, dist: 2500000, bp_rp: 1.0 },
  { id: 'sincoord', label: 'X',    name: 'sin coords',         dist: 10 },
  { id: 'distcero', label: 'Y',    name: 'dist 0',             l: 10, b: 0, dist: 0 },
  { id: 'sinbprp', label: 'Barnard', name: 'Estrella de Barnard', l: 31.0, b: 14.1, dist: 5.96 } // sin BP–RP
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

console.log('robustez:');
eq(V.estrellasVecindario([], 500).length, 0, 'lista vacía -> []');
eq(V.estrellasVecindario(null, 500).length, 0, 'null -> []');
eq(V.estrellasVecindario(objs, 0).length, 0, 'distMax 0 -> nada entra');

if (fallos) { console.log('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nTodo verde.');
