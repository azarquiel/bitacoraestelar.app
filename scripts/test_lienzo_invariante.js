#!/usr/bin/env node
/* Test de INVARIANCIA FRENTE AL TAMAÑO DEL LIENZO
   (`sueloEstrella` / `radioEstrella` / `factorDilucion` en
   resources/js/bitacora-gaia-render.js).

   El fallo que fija: a pantalla completa el lienzo se dibuja con más píxeles
   (tamLienzo sube de 720 hasta 1200/1440) pero se enseña al mismo diámetro
   angular, así que el dibujo TIENE que salir igual. No salía: el suelo de
   visibilidad está en píxeles absolutos, calibrado a 720, mientras que el
   término físico (Airy + seeing) sí va en píxeles de lienzo. Al subir SIZE:
     · el suelo se quedaba quieto → las estrellas salían más pequeñas;
     · y como factorDilucion = (suelo/Rtot)², el alfa de pico se hundía →
       las estrellas se veían ATENUADAS a pantalla completa.

   La fuente de verdad no es el código: es que el lienzo es un muestreo de la
   MISMA imagen. Duplicar la resolución no cambia lo que ve el ojo.

   Sin dependencias:  node scripts/test_lienzo_invariante.js  */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function casi(a, b, tol, etiqueta) {
  if (Math.abs(a - b) <= tol) { console.log('  ok   ' + etiqueta + ' = ' + a.toFixed(6)); }
  else { fallos++; console.error('  FALLA ' + etiqueta + '\n         esperado ' + b + ' ±' + tol + '\n         obtenido ' + a); }
}

// 200/1200 con un Ethos de 6 mm: 200×, campo real 30′, campo aparente 100°.
var EQUIPO = { apertura: 200, arcmin: 30, afov: 100, g: 6, mlim: 13.5 };
function conTamano(size, extra) {
  var o = { size: size };
  for (var k in EQUIPO) o[k] = EQUIPO[k];
  for (var j in (extra || {})) o[j] = extra[j];
  return o;
}

/* ── 1. El radio APARENTE no depende de la resolución del lienzo ───────────── */
console.log('El mismo campo dibujado a 720 y a 1440 px (pantalla completa):');
var o720 = conTamano(720), o1440 = conTamano(1440);
casi(R.radioEstrella(o1440) / 1440, R.radioEstrella(o720) / 720, 1e-9,
  'radio de la estrella en fracción del lienzo');
casi(R.sueloEstrella(o1440) / 1440, R.sueloEstrella(o720) / 720, 1e-9,
  'suelo de visibilidad en fracción del lienzo');

/* ── 2. Y el BRILLO tampoco: es el bug del informe ─────────────────────────── */
console.log('\nEl brillo de pico (factorDilucion) a pantalla completa:');
var dil720 = R.factorDilucion(R.sueloEstrella(o720), R.radioEstrella(o720));
var dil1440 = R.factorDilucion(R.sueloEstrella(o1440), R.radioEstrella(o1440));
casi(dil1440, dil720, 1e-9, 'la dilución del alfa de pico no cambia con SIZE');

/* A mucho aumento el término físico manda y la dilución SÍ muerde: ahí es donde
   el fallo se ve, porque solo el físico crecía con SIZE. */
var ALTO = { apertura: 200, arcmin: 3, afov: 100, g: 11, mlim: 13.5 };
function alto(size) { var o = { size: size }; for (var k in ALTO) o[k] = ALTO[k]; return o; }
var dilAlto720 = R.factorDilucion(R.sueloEstrella(alto(720)), R.radioEstrella(alto(720)));
var dilAlto1440 = R.factorDilucion(R.sueloEstrella(alto(1440)), R.radioEstrella(alto(1440)));
ok(dilAlto720 < 1, 'a 2000× la dilución muerde a 720 px (' + dilAlto720.toFixed(4) + ')');
casi(dilAlto1440, dilAlto720, 1e-9, 'y vale lo mismo a 1440 px');

// Los dos techos del lienzo que usa el simulador (PROC_MAX_PLACA=1200 para las
// placas, PROC_MAX_GAIA=1440 para el Canvas-2D) y un caso de doble, donde el
// suelo lo recorta la separación (otra rama del cálculo).
console.log('\nMismo control en los dos techos y con el suelo recortado por una doble:');
[1200, 1440].forEach(function (s) {
  var o = conTamano(s);
  casi(R.factorDilucion(R.sueloEstrella(o), R.radioEstrella(o)), dil720, 1e-9,
    'dilución a ' + s + ' px');
});
var dobl720 = conTamano(720, { sep: 3 }), dobl1440 = conTamano(1440, { sep: 3 });
casi(R.sueloEstrella(dobl1440) / 1440, R.sueloEstrella(dobl720) / 720, 1e-9,
  'suelo de una doble de 3″, en fracción del lienzo');

/* ── 3. Sin `size` nada cambia: el resto del código sigue igual ────────────── */
console.log('\nQuien no pasa el tamaño del lienzo no ve diferencia:');
casi(R.escalaEstrellas(100), R.escalaEstrellas(100, 720), 1e-12,
  'escalaEstrellas sin size = escalaEstrellas a 720 px');
ok(R.escalaEstrellas(0) === 1, 'sin campo aparente ni tamaño, escala 1');

console.log('\n' + (fallos === 0 ? '✓ Todo correcto.' : '✗ ' + fallos + ' fallo(s).'));
process.exit(fallos === 0 ? 0 : 1);
