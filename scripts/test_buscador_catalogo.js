#!/usr/bin/env node
/* Test del BUSCADOR DE CATÁLOGO (`BitacoraBase.montarBuscadorCatalogo`,
   resources/js/bitacora-base.js).

   Los catálogos escriben «M 13», con espacio, y el observador teclea «M13»:
   la lista del simulador decía «Sin coincidencias». La búsqueda ignora los
   espacios a los dos lados, y mira también `buscarPor` (alias) cuando el
   llamador lo pasa, que antes se ignoraba.

   Sin dependencias: DOM de mentira con lo justo.
   node scripts/test_buscador_catalogo.js  */
'use strict';

function elemento() {
  var oyentes = {};
  return {
    value: '', style: {}, innerHTML: '',
    addEventListener: function (t, f) { (oyentes[t] = oyentes[t] || []).push(f); },
    disparar: function (t) { (oyentes[t] || []).forEach(function (f) { f({ key: '' }); }); },
    querySelectorAll: function () { return []; },
    contains: function () { return true; }
  };
}
global.document = { addEventListener: function () {} };
global.window = {};
require('../resources/js/bitacora-base.js');
var B = global.window.BitacoraBase;

var fallos = 0;
function ok(c, et) {
  if (c) console.log('  ok   ' + et);
  else { fallos++; console.error('  FALLA ' + et); }
}

var CAT = [
  { id: 'NGC 6205', nombre: 'M 13 · Cúmulo globular (NGC 6205)' },
  { id: 'NGC 7078', nombre: 'M 15 · Cúmulo globular (NGC 7078)' },
  { id: 'NGC 104', nombre: '47 Tuc · Cúmulo globular (NGC 104)', alias: 'Caldwell 106' }
];
function busca(q, conAlias) {
  var input = elemento(), sugg = elemento();
  B.montarBuscadorCatalogo({
    input: input, suggest: sugg, contenedor: elemento(),
    fuente: function () { return CAT; },
    texto: function (o) { return o.nombre; },
    buscarPor: conAlias ? function (o) { return [o.nombre, o.alias].filter(Boolean).join(' '); } : undefined,
    onElegir: function () {}
  });
  input.value = q;
  input.disparar('input');
  return CAT.filter(function (o) { return sugg.innerHTML.indexOf('data-id="' + o.id + '"') >= 0; }).map(function (o) { return o.id; });
}

console.log('Espacios:');
ok(busca('M13').join() === 'NGC 6205', '«M13» encuentra «M 13» (' + busca('M13') + ')');
ok(busca('M 13').join() === 'NGC 6205', '«M 13» sigue encontrándolo');
ok(busca('m13').join() === 'NGC 6205', 'sin distinguir mayúsculas');
ok(busca('NGC6205').join() === 'NGC 6205', '«NGC6205» encuentra «NGC 6205»');
ok(busca('M1').length === 2, '«M1» sigue siendo un prefijo: M 13 y M 15');
ok(busca('M14').length === 0, 'caso malo: «M14» no encuentra nada');

console.log('Alias (buscarPor):');
ok(busca('Caldwell106', true).join() === 'NGC 104', 'con buscarPor, el alias encuentra el objeto');
ok(busca('Caldwell106', false).length === 0, 'sin buscarPor, solo el texto visible');

console.log('\n' + (fallos ? '✗ ' + fallos + ' fallo(s).' : '✓ Todo correcto.'));
process.exit(fallos ? 1 : 0);
