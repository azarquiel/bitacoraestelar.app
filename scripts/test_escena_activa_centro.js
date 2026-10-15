'use strict';
/* Test de la ESCENA ACTIVA del centro (mapa/js/via-lactea-app.js, #445).
   La app pregunta por el centro a una lista de escenas con la misma interfaz
   (centroDesplazado, volver, alOrigen) y no comprueba cada escena por separado. */
var fs = require('fs');
var app = fs.readFileSync(__dirname + '/../mapa/js/via-lactea-app.js', 'utf8');
var fallos = 0;
function ok(c, e) { if (c) console.log('  ok   ' + e); else { fallos++; console.error('  FALLA ' + e); } }

// AC1: las tres escalas con la misma interfaz.
var ga = app.slice(app.indexOf('var escenaGalaxia'), app.indexOf('function escenas3D'));
['centroDesplazado', 'volver', 'alOrigen'].forEach(function (m) {
  ok(new RegExp(m + ': function').test(ga), 'la galaxia ofrece ' + m + '()');
});
ok(/function escenas\(\) \{ return escenas3D\(\)\.concat\(escenaGalaxia\)/.test(app), 'la lista: GL, vecindario, galaxia (orden de Inicio)');

// Inicio y viaje no recorren las escenas a mano.
var home = app.slice(app.indexOf("e.key === 'Home'"), app.indexOf("e.key === 'Home'") + 160);
ok(/volverCentro\(\)/.test(home), 'Inicio usa volverCentro()');
ok(/if \(viajeActivo\) centroAlOrigen\(\);/.test(app), 'el viaje usa centroAlOrigen()');
ok(!/(GrupoLocal|VecindarioSolar)\.(volver|alOrigen)/.test(app), 'la app no llama volver/alOrigen de una escena concreta');

// El zoom (#424) solo cuenta las escenas 3D: el Sol fuera no lo limita.
var cd = app.slice(app.indexOf('function centroDesplazado'), app.indexOf('function limitarZoom'));
ok(/escenas3D\(\)\.some/.test(cd), 'centroDesplazado() del zoom mira solo las escenas 3D');

// El vuelo de la galaxia reutiliza la curva y el movimiento reducido compartidos.
var sol = app.slice(app.indexOf('function volverAlSol'), app.indexOf('centroVolver.addEventListener'));
ok(/VLCentro\.vuelo\(/.test(sol) && !/Math\.pow\(1 - t, 3\)/.test(sol), 'volverAlSol usa VLCentro.vuelo, sin curva propia');
ok(/VLViaje\.movimientoReducido\(\)/.test(sol) && !/matchMedia/.test(sol), 'volverAlSol usa VLViaje.movimientoReducido()');

// La curva compartida es la que la galaxia escribía a mano.
var C = require('../mapa/js/via-lactea-centro.js');
var p = C.vuelo({ x: 0, y: 0, z: 0 }, { x: 10, y: -20, z: 0 }, 0.5);
ok(Math.abs(p.x - 8.75) < 1e-9 && Math.abs(p.y + 17.5) < 1e-9, 'VLCentro.vuelo = ease-out cubic');
process.exit(fallos ? 1 : 0);
