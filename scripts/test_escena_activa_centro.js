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

// AC3: #mw-centro solo se escribe en via-lactea-centro.js.
var esc = fs.readFileSync(__dirname + '/../mapa/js/via-lactea-escena3d.js', 'utf8');
var gl = fs.readFileSync(__dirname + '/../mapa/js/grupo-local.js', 'utf8');
var vs = fs.readFileSync(__dirname + '/../mapa/js/vecindario-solar.js', 'utf8');
var escribe = /(data-escala'|mw-centro-visible'|mw-centro-volver-txt'\)\.textContent|setAttribute\('aria-label')/;
[['app', app], ['escena3d', esc], ['grupo-local', gl], ['vecindario-solar', vs]].forEach(function (f) {
  ok(!/classList\.(toggle|add|remove)\('mw-centro-visible'/.test(f[1]) &&
     !/setAttribute\('data-escala'/.test(f[1]) && !/mw-centro-volver-txt'\)\.textContent/.test(f[1]),
     'AC3: ' + f[0] + ' no escribe la pastilla a mano');
});
var C0 = require('../mapa/js/via-lactea-centro.js');
var el = { attrs: {}, cls: {}, textContent: '', setAttribute: function (k, v) { this.attrs[k] = v; },
           classList: { toggle: function (c, on) { el.cls[c] = on; } } };
var doc = { getElementById: function () { return el; } };
C0.rotularPastilla(doc, { escala: 'galaxia', aria: 'a', texto: 't' });
C0.mostrarPastilla(doc, 1);
ok(el.attrs['data-escala'] === 'galaxia' && el.attrs['aria-label'] === 'a' && el.textContent === 't' && el.cls['mw-centro-visible'] === true,
   'AC3: rotularPastilla/mostrarPastilla escriben la pastilla');

// La curva compartida es la que la galaxia escribía a mano.
var C = require('../mapa/js/via-lactea-centro.js');
var p = C.vuelo({ x: 0, y: 0, z: 0 }, { x: 10, y: -20, z: 0 }, 0.5);
ok(Math.abs(p.x - 8.75) < 1e-9 && Math.abs(p.y + 17.5) < 1e-9, 'VLCentro.vuelo = ease-out cubic');
process.exit(fallos ? 1 : 0);
