#!/usr/bin/env node
/* El catálogo por defecto de la capa difusa incluye las nebulosas.

   Quien llama a ps1CapaGalaxias sin `catalogo` —el generador de imagen del
   formulario, vía render()— veía solo BITACORA_GALAXIAS, y por eso una
   planetaria como NGC 6905 no aparecía en la imagen que sí pinta el simulador
   de oculares. Esta prueba falla si el defecto vuelve a ser solo galaxias.

   Uso:  node scripts/test_capa_difusa_defecto.js */
'use strict';

var path = require('path');
var RAIZ = path.join(__dirname, '..');
global.window = {};
require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'nebulosas-datos.js'));
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function ok(c, t) { console.log('  ' + (c ? 'ok  ' : 'FALLO') + '  ' + t); if (!c) fallos++; }

// Sin red: cada parche falla y la capa resuelve igual. Lo que se mide es QUÉ
// objetos pidió, que es donde vive el catálogo por defecto.
var pedidos = [];
global.fetch = function (url) { pedidos.push(String(url)); return Promise.reject(new Error('sin red')); };

var np = { ra: 305.59579, dec: 20.10453 };   // NGC 6905, clase PN
R.ps1CapaGalaxias(new Float32Array(4), null, { sqm: 21.4 }, null, {
  ra0: np.ra, dec0: np.dec, arcmin: 30, size: 2
}).then(function () {
  ok(pedidos.length > 0, 'la capa pidió algún parche sin pasarle catálogo (' + pedidos.length + ')');
  var suyo = pedidos.some(function (u) { return u.indexOf('305.59') >= 0; });
  ok(suyo, 'entre ellos el de NGC 6905, que es una PN y no una galaxia');
  console.log(fallos ? '\n' + fallos + ' fallo(s).' : '\ntodo en orden.');
  process.exit(fallos ? 1 : 0);
});
