#!/usr/bin/env node
/* Test del TAMAÑO DE RENDER del lienzo (`tamLienzo` en
   resources/js/bitacora-gaia-render.js).

   El fallo que fija: el lienzo se dibujaba siempre a 720 px, así que a pantalla
   completa el navegador lo ampliaba —en un portátil Retina, 88vh son 792 px CSS
   × 2 de densidad = 1584 px de dispositivo mostrando 720— y la imagen salía
   borrosa (queja del observador, 2026-08-03).

   `tamLienzo` devuelve los píxeles a los que conviene dibujar para que el
   lienzo tenga los que de verdad se enseñan: ancho en px CSS × densidad de la
   pantalla, con SUELO (no bajar de la calidad de siempre) y TECHO (el coste de
   dibujar va con el cuadrado del lado, y el de PanSTARRS/DSS con los bytes que
   sirve el servidor).

   Sin dependencias:  node scripts/test_tam_lienzo.js  */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function eq(a, b, etiqueta) {
  if (a === b) { console.log('  ok   ' + etiqueta + ' = ' + a); }
  else { fallos++; console.error('  FALLA ' + etiqueta + ': ' + a + ' != ' + b); }
}

console.log('1. Píxeles de dispositivo, que es lo que se enseña');
// Pantalla normal: el lienzo mide lo que ocupa.
eq(R.tamLienzo(1000, 1, 1440), 1000, 'ancho 1000 px CSS sin densidad extra');
// Retina: cada px CSS son dos de dispositivo, o el navegador amplía.
eq(R.tamLienzo(640, 2, 1440), 1280, 'ancho 640 px CSS en pantalla Retina');
eq(R.tamLienzo(700, 1.5, 1440), 1050, 'densidad fraccionaria (1,5) se redondea');

console.log('2. Suelo: nunca por debajo de la calidad de siempre');
// El ocular pequeño en una ventana estrecha no tiene por qué salir PEOR que
// antes del cambio: 720 es el tamaño con el que se ajustó todo el render.
eq(R.tamLienzo(300, 1, 1440), 720, 'lienzo chico: se queda en el 720 de siempre');
eq(R.tamLienzo(0, 2, 1440), 720, 'ancho 0 (aún sin maquetar) cae al suelo');
eq(R.tamLienzo(undefined, undefined, 1440), 720, 'sin datos, el de siempre');

console.log('3. Techo: el que pida quien llama');
// Gaia solo cuesta CPU (el catálogo ya está descargado), así que aguanta más
// techo que las placas, cuyo tamaño se le pide a un servidor ajeno.
eq(R.tamLienzo(792, 2, 1440), 1440, 'Retina a pantalla completa: 1584 -> techo 1440');
eq(R.tamLienzo(792, 2, 1200), 1200, 'mismo caso con el techo de las placas');
eq(R.tamLienzo(2000, 3, 1440), 1440, 'monitor 4K: sigue en el techo');

if (fallos) { console.log('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nTodo verde.');
