#!/usr/bin/env node
/* Test del GIRO DE PARTIDA de la vista cenital del mapa.

   El fallo que fija (medido en /mapa.html): el navegador pintaba el mapa a los
   350 ms sin girar y, ~1,4 s después, el primer applyTransform() de
   via-lactea-app.js le metía el azimut de partida (90°) de golpe. El mapa daba
   un salto de un cuarto de vuelta delante del usuario.

   El arreglo pone ese mismo giro en el estilo en línea de #mw-content, para que
   el primer pintado ya salga girado y la app no cambie nada al arrancar. Eso
   duplica el número: aquí se atan los dos, porque si alguien toca
   CONFIG.inclinacion.azimutBase y no el HTML, vuelve el salto (y al revés, el
   mapa arrancaría torcido y se enderezaría solo).

   El giro de la app es exacto sobre el del HTML solo porque el centro de giro
   coincide: applyTransform gira alrededor del núcleo cenital y ese núcleo está
   en el 50%,50% de la imagen, que con la imagen centrada es el mismo punto que
   el transform-origin: center center del HTML. Si el núcleo se moviera, el
   estilo en línea dejaría de valer: por eso también se comprueba.

   Sin dependencias:  node scripts/test_giro_inicial_mapa.js  */
'use strict';

var fs = require('fs');
var path = require('path');

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

var raiz = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(raiz, 'mapa/mapa.html'), 'utf8');

// via-lactea-config.js es un script de navegador que declara `var CONFIG` suelto
// (no exporta nada), así que se evalúa y se le pide el objeto.
var CONFIG = new Function(
  fs.readFileSync(path.join(raiz, 'mapa/js/via-lactea-config.js'), 'utf8') + '\n;return CONFIG;')();

var azimut = CONFIG.inclinacion.azimutBase;
var nucleo = CONFIG.nucleo.cenital;

// Estilo en línea de #mw-content, el contenedor que gira.
var bloque = (html.match(/id="mw-content"\s+style="([^"]*)"/) || [])[1] || '';

console.log('El HTML arranca con el mismo giro que aplica la app:');
var grados = (bloque.match(/rotate\((-?[\d.]+)deg\)/) || [])[1];
ok(grados !== undefined, '#mw-content lleva un rotate() en su estilo en línea');
ok(parseFloat(grados) === azimut,
  'el giro del HTML (' + grados + '°) es CONFIG.inclinacion.azimutBase (' + azimut + '°)');
ok(/scale\(1\)/.test(bloque),
  'y sigue arrancando a escala 1, como espera applyTransform');

console.log('El centro de giro del HTML es el que usa la app:');
ok(/transform-origin:\s*center center/.test(bloque),
  '#mw-content gira alrededor de su centro');
ok(nucleo.x === 50 && nucleo.y === 50,
  'el núcleo cenital sigue en el centro de la imagen (' + nucleo.x + '%, ' + nucleo.y + '%)');

console.log(fallos === 0 ? '\nTodo verde.' : '\n' + fallos + ' fallo(s).');
process.exit(fallos === 0 ? 0 : 1);
