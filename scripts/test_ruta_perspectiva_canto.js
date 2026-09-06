/* Test de la ruta del viaje en la antesala del canto (88-89°)
   (mapa/js/via-lactea-app.js).

   El fallo que fija (medido en Chrome con el viaje 3 de producción): entre
   TILT_PREVIA (87°) y 90° applyTransform aleja la perspectiva de #mw-plano
   (1400 -> 2100 -> 4200 px, y 'none' a 90°) para montar la foto de canto, pero
   encararRuta deshacía la perspectiva con la nominal de CONFIG (1400). La ruta
   dorada se encogía y se iba de sus marcadores: hasta 660 px de desvío a 89°,
   y 0 px a 0/45/87°. Con perspectivaPlano() como única fuente, 0 px en todos.

   perspectivaPlano se extrae del fichero real (con sus constantes) y se prueba
   sola; que las dos partes la usen se comprueba por patrón, como hace
   test_ficha_audio_tramo.js.
   Sin framework:  node scripts/test_ruta_perspectiva_canto.js */

'use strict';

var fs = require('fs');
var app = fs.readFileSync(__dirname + '/../mapa/js/via-lactea-app.js', 'utf8');

var fallos = 0;
function eq(a, b, et) {
  if (a === b) { console.log('  ok   ' + et); }
  else { fallos++; console.log('  FALLA ' + et + '\n         esperado ' + JSON.stringify(b) + '\n         obtenido ' + JSON.stringify(a)); }
}

function cuerpo(nombre) {
  var m = app.match(new RegExp('function ' + nombre + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}'));
  if (!m) { console.log('FALLA no se encuentra ' + nombre + '() en via-lactea-app.js'); process.exit(1); }
  return m[0];
}
var perspectivaPlano = new Function(
  'var isEdgeView = false, TILT_PREVIA = 87, TILT_MAX = 90, INCL = { perspectiva: 1400 };' +
  cuerpo('mezclaCanto') + '\n' + cuerpo('perspectivaPlano') + '\nreturn perspectivaPlano;')();

console.log('perspectivaPlano (la perspectiva REAL de #mw-plano según el abatimiento):');
eq(perspectivaPlano(0), 1400, 'de plano, la nominal');
eq(perspectivaPlano(87), 1400, 'hasta TILT_PREVIA, la nominal');
eq(Math.round(perspectivaPlano(88)), 2100, 'a 88° se aleja (1400 / (1 - 1/3))');
eq(Math.round(perspectivaPlano(89)), 4200, 'a 89° se aleja más (1400 / (1 - 2/3))');
eq(perspectivaPlano(90), Infinity, 'a 90° no hay perspectiva');

console.log('una sola fuente para aplicarla y para deshacerla:');
var aplicar = app.slice(app.indexOf('function applyTransform'), app.indexOf('function pintarTilt'));
var encarar = app.slice(app.indexOf('function encararRuta'), app.indexOf('function dibujarRuta'));
eq(/perspectivaPlano\(tilt\)/.test(aplicar), true, 'applyTransform pone en #mw-plano la de perspectivaPlano');
eq(/perspectivaPlano\(tilt\)/.test(encarar), true, 'encararRuta deshace la MISMA (no la nominal de CONFIG)');
eq(/INCL\.perspectiva/.test(encarar), false, 'encararRuta ya no lee la nominal');
eq(/isFinite\(P\) \? 1 - dz \/ P : 1/.test(encarar), true, 'sin perspectiva (90°) no hay nada que deshacer: kz = 1');

// Los objetos BAJO el plano (b<0) se adelantan hacia la cámara para pasar por
// delante de la foto, y ese adelanto se deshace con la perspectiva. Con la
// nominal, en el viaje 41 (Néstor, 2008-09-06) NGC 281 saltaba de x=250 px a
// 87° a 516/1438/2756 px a 88/89/89,5° y su punto encogía de 6,4 a 1,9 px.
console.log('los marcadores hundidos deshacen también la real:');
var vista = app.slice(app.indexOf('function vistaProyeccion'), app.indexOf('function alturaObjetoPx'));
var hundido = app.slice(app.indexOf('var bajo = alturaPx < 0'), app.indexOf("a.classList.toggle('mw-hundido'"));
eq(/perspectiva: perspectivaPlano\(tiltActual\(\)\)/.test(vista), true, 'vistaProyeccion proyecta con perspectivaPlano');
eq(/var dPersp = vistaAlturas\.perspectiva/.test(hundido), true, 'el empuje del hundido deshace la de la vista');
eq(/isFinite\(dPersp\)/.test(hundido), true, 'y sin perspectiva no empuja');
eq((app.match(/INCL\.perspectiva/g) || []).length, 1, 'la nominal solo la lee perspectivaPlano');

if (fallos) { console.log('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nok · la ruta deshace la misma perspectiva que lleva el plano, también entre 87° y 90°');
