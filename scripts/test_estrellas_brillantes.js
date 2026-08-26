#!/usr/bin/env node
/* Test del catálogo de estrellas que Gaia DR3 no trae (ticket #130) en
   resources/js/bitacora-gaia-render.js:

   1. Un campo centrado en Vega -brillante, sin doble, saturada en DR3- gana
      esa estrella al dibujar, aunque la consulta a Gaia no la traiga.
   2. Un campo cualquiera (sin ninguna estrella brillante cerca) no gana
      estrellas de más: el catálogo solo aporta lo que cae dentro del campo.
   3. Sin el catálogo cargado (window.BITACORA_ESTRELLAS_BRILLANTES ausente),
      el campo se dibuja igual que antes -nunca en blanco-.

   Sin dependencias:  node scripts/test_estrellas_brillantes.js */
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
function lienzo() {
  var el = { width: 720, height: 720 };
  el.getContext = function () { return fakeCtx(el); };
  return el;
}

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

function nucleos(g) { return g.filter(function (x) { return x.stops.length === 5; }).length; }

// Vega: HIP 91262, RA 279.23588°, Dec 38.78497°, Hp 0.0868 -no está en DR3-.
var VEGA_RA = 279.23588121299167, VEGA_DEC = 38.7849693975;
var arcmin = 30; // campo estrecho, centrado en la propia estrella
var base = { arcmin: arcmin, afov: 60, apertura: 200, conGlow: true, arana: false, mlim: 17 };

console.log('1. Campo centrado en Vega gana la estrella aunque Gaia no la traiga');
global.window = {
  BITACORA_ESTRELLAS_BRILLANTES: [[VEGA_RA, VEGA_DEC, 0.0868]]
};
global.document = { createElement: lienzo };
require('../resources/js/bitacora-gaia-color.js');
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

gradientes = [];
R.dibujar(fakeCtx(lienzo()), [], base);   // precalienta sprites
gradientes = [];
// Gaia no devuelve nada para este campo -es justo el agujero del ticket-.
R.dibujar(fakeCtx(lienzo()), [], Object.assign({ ra: VEGA_RA, dec: VEGA_DEC }, base));
ok(nucleos(gradientes) === 1, 'se dibuja 1 núcleo -Vega, aportada por el catálogo- (' + nucleos(gradientes) + ')');

var otroRa = 200, otroDec = -10, otraGaia = [[otroRa, otroDec, 8, 0.6]];

console.log('\n2. Campo cualquiera, sin estrella brillante cerca, no gana estrellas de más');
gradientes = [];
R.dibujar(fakeCtx(lienzo()), otraGaia, Object.assign({ ra: otroRa, dec: otroDec }, base));
ok(nucleos(gradientes) === 1, 'solo se dibuja la estrella de Gaia del campo, ninguna de más (' + nucleos(gradientes) + ')');

console.log('\n3. Sin el catálogo cargado, el campo se dibuja igual -nunca en blanco-');
delete global.window.BITACORA_ESTRELLAS_BRILLANTES;
gradientes = [];
R.dibujar(fakeCtx(lienzo()), otraGaia, Object.assign({ ra: otroRa, dec: otroDec }, base));
ok(nucleos(gradientes) === 1, 'el campo mantiene su única estrella de Gaia (' + nucleos(gradientes) + ')');
gradientes = [];
R.dibujar(fakeCtx(lienzo()), [], Object.assign({ ra: VEGA_RA, dec: VEGA_DEC }, base));
ok(nucleos(gradientes) === 0, 'sin catálogo, el campo de Vega no revienta -queda vacío, no en blanco de error- (' + nucleos(gradientes) + ')');

console.log('\n' + (fallos === 0 ? '✓ Todo correcto.' : '✗ ' + fallos + ' fallo(s).'));
process.exit(fallos === 0 ? 0 : 1);
