#!/usr/bin/env node
/* Test de Almaak (doble mag 2.3 + 5.1, sep 9.6", pa/spect desconocidos) en
   resources/js/bitacora-gaia-render.js:

   1. La primaria (satura, no está en DR3) la trae el catálogo de estrellas
      que Gaia DR3 no trae (estrellas-brillantes-datos.js), con su posición
      medida por Hipparcos y propagada a 2016.0 — no se sintetiza en tiempo
      de dibujo (issue #134).

   2. dibujar() efectivamente pinta las DOS componentes (dos núcleos), no
      una. La separación en píxeles a 99x (Nagler T4 22mm, AFOV 82°, canvas
      720px) sale ~2px: las dos cruces de difracción se funden visualmente
      en una sola, pero eso es solape por resolución angular, no que falte
      una componente -confirmado con datos reales de Gaia DR3, 2026-08-02-.

   Sin dependencias:  node scripts/test_almaak_doble.js */
'use strict';

var gradientes;
function fakeCtx(el) {
  return new Proxy({}, {
    get: function (t, prop) {
      if (prop === 'canvas') return el;
      if (prop === 'createRadialGradient') return function (x0, y0, r0, x1, y1, r1) {
        var g = { x: x1, y: y1, stops: [] };
        g.addColorStop = function (pos, color) { g.stops.push([pos, color]); };
        gradientes.push(g);
        return g;
      };
      if (prop === 'createImageData') return function (w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; };
      if (prop === 'getImageData') return function (x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; };
      if (prop in t) return t[prop];
      return function () {};
    },
    set: function (t, prop, val) { t[prop] = val; return true; }
  });
}
global.window = {};
global.document = {
  createElement: function () {
    var el = { width: 720, height: 720 };
    el.getContext = function () { return fakeCtx(el); };
    return el;
  }
};
require('../resources/js/bitacora-gaia-color.js');
require('../simulador_ocular/resources/js/estrellas-brillantes-datos.js');
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

console.log('1. la primaria que Gaia no trae la pone el catálogo');
// Datos reales del proxy Gaia en producción para el campo de Almaak: Gaia
// solo devuelve la secundaria (mag~4.86), como documenta el comentario "la de
// Almaak no está en DR3". La primaria sale del catálogo, que dibujar()
// concatena solo.
var ra0 = 30.975, dec0 = 42.328333;
var soloSecundaria = [[30.978258522125305, 42.330699217961474, 4.8627677, -0.040904045]];

function haversineArcsec(ra1, dec1, ra2, dec2) {
  var rad = Math.PI / 180, cosd = Math.cos(dec1 * rad);
  var dra = (ra2 - ra1) * cosd, ddec = dec2 - dec1;
  return Math.sqrt(dra * dra + ddec * ddec) * 3600;
}
var enElPar = (global.window.BITACORA_ESTRELLAS_BRILLANTES || []).filter(function (f) {
  return haversineArcsec(ra0, dec0, f[0], f[1]) < 25;
});
ok(enElPar.length === 1, 'el catálogo trae UNA fila en el par, no dos (' + enElPar.length + ')');
var primaria = enElPar[0];
ok(primaria[5] === 'medida', 'y su posición es medida, no derivada de un ángulo (' + primaria[5] + ')');
ok(primaria[2] < 2.5, 'es la primaria brillante, no la compañera (G ' + primaria[2].toFixed(2) + ')');

var sepReal = haversineArcsec(soloSecundaria[0][0], soloSecundaria[0][1], primaria[0], primaria[1]);
ok(Math.abs(sepReal - 9.6) < 0.5, 'a la separación del catálogo de dobles, 9,6" (' + sepReal.toFixed(2) + '")');

console.log('\n2. dibujar() pinta las 2 componentes (aunque se vean fundidas a 99x)');
// Nagler T4 22mm, AFOV 82°, 99x -> campo real = 82/99° = 49.7'. Canvas 720px.
var arcmin = (82 / 99) * 60;
var base = { ra: ra0, dec: dec0, arcmin: arcmin, afov: 82, apertura: 457, conGlow: true, arana: true, mlim: 17 };

gradientes = [];
R.dibujar(fakeCtx({ width: 720, height: 720 }), [], base);   // precalienta sprites
gradientes = [];
R.dibujar(fakeCtx({ width: 720, height: 720 }), soloSecundaria, base);

var nucleos = gradientes.filter(function (g) { return g.stops.length === 5; });
ok(nucleos.length === 2, 'se dibujan 2 núcleos de estrella, uno por componente (' + nucleos.length + ')');

var dx = nucleos[0].x - nucleos[1].x, dy = nucleos[0].y - nucleos[1].y;
var sepPx = Math.sqrt(dx * dx + dy * dy);
ok(sepPx > 0 && sepPx < 5,
  'a 99x los centros caen a ~2px de distancia (' + sepPx.toFixed(2) + 'px): las dos cruces de ' +
  'difracción se funden visualmente por resolución angular, no porque falte una componente');

console.log('\n' + (fallos === 0 ? '✓ Todo correcto.' : '✗ ' + fallos + ' fallo(s).'));
process.exit(fallos === 0 ? 0 : 1);
