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
        var g = { x: x1, y: y1, r: r1, stops: [] };
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

// Vega: HIP 91262, RA 279.23588°, Dec 38.78497° -no está en DR3-. Fila del
// catálogo (issue #131): G 0.0143 y BP−RP −0.0456 derivados de V/V−I con las
// relaciones publicadas de Gaia EDR3, ya no la Hp de Hipparcos a pelo.
var VEGA_RA = 279.23588121299167, VEGA_DEC = 38.7849693975;
var VEGA_G = 0.014286, VEGA_BPRP = -0.045583;
var arcmin = 30; // campo estrecho, centrado en la propia estrella
var base = { arcmin: arcmin, afov: 60, apertura: 200, conGlow: true, arana: false, mlim: 17 };

console.log('1. Campo centrado en Vega gana la estrella aunque Gaia no la traiga');
global.window = {
  BITACORA_ESTRELLAS_BRILLANTES: [[VEGA_RA, VEGA_DEC, VEGA_G, VEGA_BPRP]]
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

function nucleoStops(g) { return g.filter(function (x) { return x.stops.length === 5; }); }

console.log('\n4. El color de la fila llega al modelo de color del campo (issue #131)');
// Dos estrellas del catálogo, una roja (BP−RP 3) y una azul (BP−RP 0): sus
// núcleos tienen que pintarse con colores distintos. Si el render ignorase la
// 4ª casilla, ambas caerían al tinte por defecto y saldrían iguales.
global.window.BITACORA_ESTRELLAS_BRILLANTES = [
  [otroRa - 0.05, otroDec, 2, 3.0],
  [otroRa + 0.05, otroDec, 2, 0.0]
];
gradientes = [];
R.dibujar(fakeCtx(lienzo()), [], Object.assign({ ra: otroRa, dec: otroDec }, base));
var nn = nucleoStops(gradientes);
ok(nn.length === 2, 'se pintan los dos núcleos (' + nn.length + ')');
ok(nn.length === 2 && nn[0].stops[2][1] !== nn[1].stops[2][1],
  'roja y azul salen con colores distintos: el BP−RP de la fila manda');
// Fila sin color (sin V−I en Hipparcos, 3 casillas): se dibuja igual, con el
// tinte por defecto del modelo -el generador no inventó color y el render no
// revienta-.
global.window.BITACORA_ESTRELLAS_BRILLANTES = [[otroRa, otroDec, 2]];
gradientes = [];
R.dibujar(fakeCtx(lienzo()), [], Object.assign({ ra: otroRa, dec: otroDec }, base));
ok(nucleos(gradientes) === 1, 'la fila sin color también se dibuja (' + nucleos(gradientes) + ')');

console.log('\n5. Brillo relativo correcto frente a las vecinas de Gaia (issue #131)');
// Misma G y mismo color que una vecina de Gaia: el núcleo dibujado tiene que
// salir con el mismo radio. Es lo que compra convertir a banda G: comparar
// magnitudes en la misma escala que el resto del campo.
global.window.BITACORA_ESTRELLAS_BRILLANTES = [[otroRa - 0.05, otroDec, 5, 0.6]];
gradientes = [];
R.dibujar(fakeCtx(lienzo()), [[otroRa + 0.05, otroDec, 5, 0.6]],
  Object.assign({ ra: otroRa, dec: otroDec }, base));
var np2 = nucleoStops(gradientes);
ok(np2.length === 2, 'núcleo de catálogo + núcleo de Gaia (' + np2.length + ')');
ok(np2.length === 2 && Math.abs(np2[0].r - np2[1].r) < 1e-9,
  'a igual G, igual radio que la vecina de Gaia (' + (np2.length === 2 ? np2[0].r + ' vs ' + np2[1].r : '-') + ')');

console.log('\n' + (fallos === 0 ? '✓ Todo correcto.' : '✗ ' + fallos + ' fallo(s).'));
process.exit(fallos === 0 ? 0 : 1);
