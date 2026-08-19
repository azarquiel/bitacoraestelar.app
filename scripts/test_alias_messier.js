#!/usr/bin/env node
/* Alias Messier del buscador local del simulador: «M57» tiene que encontrar
   NGC6720 sin pasar por SIMBAD. La tabla vive en BitacoraBase.aliasMessier
   (Messier → NGC/IC, cerrada desde 1966) y tolera los tres formatos de nombre
   que conviven en los catálogos: «NGC 5194» (galaxias, con espacio),
   «NGC6720» (nebulosas, sin espacio) y «NGC0650» (con ceros).

   Sin dependencias:  node scripts/test_alias_messier.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-base.js');
require('../simulador_ocular/resources/js/galaxias-datos.js');
require('../simulador_ocular/resources/js/nebulosas-datos.js');
var B = global.window.BitacoraBase;

var fallos = 0;
function ok(c, t) { console.log('  ' + (c ? 'ok  ' : 'FALLO') + '  ' + t); if (!c) fallos++; }

console.log('BitacoraBase.aliasMessier — nombre de catálogo → alias Messier:');
ok(typeof B.aliasMessier === 'function', 'existe la función');
var f = B.aliasMessier || function () { return ''; };
ok(f('NGC6720') === 'M57', 'NGC6720 (nebulosas, sin espacio) → M57: ' + f('NGC6720'));
ok(f('NGC 5194') === 'M51', 'NGC 5194 (galaxias, con espacio) → M51');
ok(f('NGC0650') === 'M76', 'NGC0650 (con ceros) → M76');
ok(f('NGC 4594') === 'M104', 'NGC 4594 → M104');
ok(f('IC4725') === 'M25', 'los dos Messier de IC también (IC4725 → M25)');
ok(f('NGC 5195') === '', 'NGC 5195 (compañera de M51) NO es Messier');
ok(f('NGC 205') === 'M110', 'NGC 205 → M110');
ok(f('') === '' && f(null) === '', 'entrada vacía no revienta');

console.log('Cobertura sobre los catálogos cargados:');
function cuenta(arr) {
  var n = 0;
  for (var i = 0; i < arr.length; i++) if (f(arr[i][0])) n++;
  return n;
}
var gal = cuenta(global.window.BITACORA_GALAXIAS);
var neb = cuenta(global.window.BITACORA_NEBULOSAS);
ok(gal >= 30, 'decenas de galaxias Messier reciben alias (' + gal + ')');
ok(neb >= 5, 'las planetarias Messier reciben alias (' + neb + ')');

console.log('\n' + (fallos ? 'FALLOS: ' + fallos : 'todo en orden.'));
process.exit(fallos ? 1 : 0);
