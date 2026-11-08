#!/usr/bin/env node
/* Test del pegado en la descripción del ocular (texto copiado de un PDF).

   Un PDF corta cada renglón con un salto de línea aunque la frase siga. Al
   pegar, el salto se quita salvo que la línea acabe la frase (. ! ? …) o venga
   una línea en blanco: esos son los párrafos de verdad.

   Sin dependencias:  node scripts/test_pegar_descripcion.js */
'use strict';
var fs = require('fs');
var path = require('path');

global.window = {};
require('../resources/js/bitacora-base.js');
var f = global.window.BitacoraBase.htmlDeTextoPegado;

var fallos = 0;
function ok(cond, et) {
  if (cond) { console.log('  ok   ' + et); }
  else { fallos++; console.error('  FALLA ' + et); }
}
function igual(got, exp, et) { ok(got === exp, et + (got === exp ? '' : '\n        got: ' + JSON.stringify(got))); }

igual(f('una sola línea'), null, 'sin saltos: null (pegado normal del navegador)');
igual(f('Núcleo brillante y\nhalo difuso.'), '<p>Núcleo brillante y halo difuso.</p>', 'salto a mitad de frase: se une con espacio');
igual(f('Núcleo brillante.\nHalo difuso.'), '<p>Núcleo brillante.</p><p>Halo difuso.</p>', 'línea que acaba en punto: párrafo nuevo');
igual(f('¿Se ve?\n¡Sí!\nApenas…\nSigue'), '<p>¿Se ve?</p><p>¡Sí!</p><p>Apenas…</p><p>Sigue</p>', '? ! … también cierran frase');
igual(f('Dijo «es tenue.»\nLuego'), '<p>Dijo «es tenue.»</p><p>Luego</p>', 'punto seguido de comilla/paréntesis de cierre');
igual(f('Primero\n\nSegundo'), '<p>Primero</p><p>Segundo</p>', 'línea en blanco: párrafo aunque no haya punto');
igual(f('a\r\nb.\r\nc'), '<p>a b.</p><p>c</p>', 'saltos Windows (CRLF)');
igual(f('a\rb'), '<p>a b</p>', 'saltos Mac antiguo (CR)');
igual(f('la obser-\nvación'), '<p>la observación</p>', 'palabra partida con guion: se recompone');
igual(f('NGC-\n253'), '<p>NGC- 253</p>', 'guion seguido de algo que no es minúscula: se deja');
igual(f('  a   b  \n  c  '), '<p>a b c</p>', 'espacios sobrantes fuera');
igual(f('x < y & z\nw'), '<p>x &lt; y &amp; z w</p>', 'escapa HTML');
igual(f('\n\n'), '', 'solo saltos: nada que insertar');

console.log('\nCableado en bitacora-formulario.js');
var js = fs.readFileSync(path.join(__dirname, '../registro/resources/js/bitacora-formulario.js'), 'utf8');
ok(/htmlDeTextoPegado/.test(js) && /addEventListener\('paste'/.test(js), 'el formulario escucha el pegado y usa la función');

console.log(fallos ? '\n' + fallos + ' FALLOS' : '\nTodo OK');
process.exit(fallos ? 1 : 0);
