#!/usr/bin/env node
/* Una galaxia sin BT en el RC3 entra igual en el catálogo.

   gen_galaxias.py tiraba toda fila del RC3 sin BT, y con ella las Antennae
   (NGC 4038/4039, Bmag 10,91/11,0): el render de Gaia no las pintaba aunque el
   parche de PanSTARRS sí las traía. Esta prueba falla si la capa difusa vuelve
   a no ver su campo.

   Uso:  node scripts/test_galaxias_sin_bt.js */
'use strict';

var path = require('path');
var RAIZ = path.join(__dirname, '..');
global.window = {};
require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-ps1.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'nebulosas-datos.js'));
var P = global.window.BitacoraPS1;

var fallos = 0;
function ok(c, t) { console.log('  ' + (c ? 'ok  ' : 'FALLO') + '  ' + t); if (!c) fallos++; }

var catalogo = P.ps1CatalogoDifuso(window.BITACORA_GALAXIAS, window.BITACORA_NEBULOSAS);
var nombres = P.ps1GalaxiasDelCampo(catalogo, 180.47, -18.87, 30).map(function (g) { return g.nombre; });
ok(nombres.indexOf('NGC 4038') >= 0, 'NGC 4038 entra en el campo de las Antennae (' + nombres.join(', ') + ')');
ok(nombres.indexOf('NGC 4039') >= 0, 'NGC 4039 también');

// Las compañeras de NGC 7331 (mB 14,4–15,2) entran sin tope desde rc3_incluidas.tsv.
var grupo = P.ps1GalaxiasDelCampo(catalogo, 339.267, 34.4156, 30).map(function (g) { return g.nombre; });
['NGC 7335', 'NGC 7337', 'NGC 7340'].forEach(function (n) {
  ok(grupo.indexOf(n) >= 0, n + ' entra en el campo de NGC 7331 (' + grupo.join(', ') + ')');
});
ok(grupo.filter(function (n) { return n === 'NGC 7331'; }).length === 1, 'y NGC 7331 no sale repetida');
console.log(fallos ? '\n' + fallos + ' fallo(s).' : '\ntodo en orden.');
process.exit(fallos ? 1 : 0);
