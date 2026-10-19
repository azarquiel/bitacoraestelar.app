/* Test de que las copias JS de «nombre de objeto → slug» dan lo mismo que
   bitacora_slug_objeto() de PHP (tabla en scripts/fixtures/slug_objeto.json,
   la misma que lee test_slug_objeto.php). Las copias de grupo-local.js y
   bitacora-listado.js viven dentro de un cierre: se extraen del código fuente.
   Sin framework:  node scripts/test_slug_objeto.js */

'use strict';

var fs = require('fs');
var path = require('path');
var raiz = path.join(__dirname, '..');
function leer(rel) { return fs.readFileSync(path.join(raiz, rel), 'utf8'); }

var casos = JSON.parse(leer('scripts/fixtures/slug_objeto.json'));

var fallos = 0;
function eq(a, b, et) {
  if (a === b) { console.log('  ok   ' + et); }
  else { fallos++; console.log('  FALLA ' + et + '\n         esperado ' + JSON.stringify(b) + '\n         obtenido ' + JSON.stringify(a)); }
}

var copias = {};
copias['via-lactea-buscador-indice'] = require('../mapa/js/via-lactea-buscador-indice.js').normalizar;

var m = leer('mapa/js/grupo-local.js').match(/function normalizar\(s\) \{[\s\S]*?\n  \}/);
if (!m) { fallos++; console.log('  FALLA no se encuentra normalizar() en grupo-local.js'); }
else copias['grupo-local'] = new Function(m[0] + '; return normalizar;')();

m = leer('registro/resources/js/bitacora-listado.js').match(/var slug = String\(obs\.objeto \|\| 'ficha'\)([^;]*);/);
if (!m) { fallos++; console.log('  FALLA no se encuentra el slug de nombreDescarga() en bitacora-listado.js'); }
else copias['bitacora-listado'] = new Function('x', 'return String(x)' + m[1] + ';');

Object.keys(copias).forEach(function (nombre) {
  console.log(nombre + ':');
  casos.forEach(function (c) { eq(copias[nombre](c[0]), c[1], '"' + c[0] + '" -> "' + c[1] + '"'); });
});

if (fallos) { console.log('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nTodo bien.');
