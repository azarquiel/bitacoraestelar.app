#!/usr/bin/env node
/* `lib_parche_publicado.js` con `--dir` a un banco viejo (#567).

   El manifiesto del árbol fija la versión de cada objeto. Un directorio que
   trae su propio `manifiesto.js` tiene que leerse con el suyo: si no, el
   arnés no encuentra la versión vieja, cae en la fixture del árbol y la cifra
   se atribuye al banco equivocado (pasó con el «v2» de NGC 6888).

   Sin red:  node scripts/test_parche_publicado.js */
'use strict';

var fs = require('fs'), path = require('path'), os = require('os');
var RAIZ = path.join(__dirname, '..');

global.window = global.window || {};
require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-ps1.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-png16.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'nebulosas-datos.js'));
var PS1 = window.BitacoraPS1, P16 = window.BitacoraPNG16;

var fallos = 0;
function ok(cond, et) {
  if (cond) console.log('  ok   ' + et);
  else { fallos++; console.log('  FALLA ' + et); }
}

/* La fixture de NGC 6888 con una versión que el árbol no conoce. */
var FIX = path.join(RAIZ, 'scripts', 'fixtures', 'dso');
var origen = fs.readdirSync(FIX).filter(function (f) { return /^NGC6888\.[0-9a-f]+\.json$/.test(f); })[0];
var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parche-' + process.pid + '-'));
try {
  fs.copyFileSync(path.join(FIX, origen), path.join(dir, 'NGC6888.deadbeef.json'));
  fs.copyFileSync(path.join(FIX, origen.replace(/\.json$/, '.png')), path.join(dir, 'NGC6888.deadbeef.png'));

  var PUB = require('./lib_parche_publicado.js')(RAIZ, PS1, P16, [dir]);
  var p = PUB.parche('NGC6888');
  ok(p && path.dirname(p.png) !== dir, 'sin manifiesto.js en el dir manda el del árbol');

  fs.writeFileSync(path.join(dir, 'manifiesto.js'),
    'window.BITACORA_DSO_TEXTURAS = [["NGC6888", "imagen", "deadbeef"]];\n');
  PUB = require('./lib_parche_publicado.js')(RAIZ, PS1, P16, [dir]);
  p = PUB.parche('NGC6888');
  ok(p && p.png === path.join(dir, 'NGC6888.deadbeef.png'), 'con manifiesto.js en el dir, su versión');
  p = PUB.parche('NGC 5194');
  ok(!p || path.dirname(p.png) !== dir, 'los demás directorios siguen con el manifiesto del árbol');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(fallos ? '\n' + fallos + ' FALLOS' : '\ntodo ok');
process.exit(fallos ? 1 : 0);
