#!/usr/bin/env node
/* Test de Almaak (doble mag 2.3 + 5.1, sep 9.6", pa/spect desconocidos) en
   resources/js/bitacora-gaia-render.js:

   1. parDoble() sintetiza la primaria (satura, no está en DR3 -comentario en
      bitacora-ocular.js-) a partir de solo la secundaria devuelta por Gaia,
      infiriendo correctamente cuál falta por magnitud y desplazándola sep"
      al pa por defecto (55°, porque el catálogo trae pa:null).

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
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

console.log('1. parDoble() sintetiza la primaria que Gaia no trae');
// Datos reales del proxy Gaia en producción para el campo de Almaak: Gaia
// solo devuelve la secundaria (mag~4.86, cerca de mag2=5.1), como documenta
// el comentario "la de Almaak no está en DR3".
var ra0 = 30.975, dec0 = 42.328333;
var soloSecundaria = [[30.978258522125305, 42.330699217961474, 4.8627677, -0.040904045]];
var pareja = R.parDoble(soloSecundaria, {
  ra: ra0, dec: dec0, sep: 9.6, mag1: 2.3, mag2: 5.1, pa: null, spect1: null, spect2: null
});
ok(pareja.length === 2, 'parDoble devuelve 2 estrellas (' + pareja.length + ')');
ok(pareja[0][2] === 4.8627677, 'mantiene la secundaria de Gaia sin tocar (mag ' + pareja[0][2] + ')');
ok(pareja[1][2] === 2.3, 'sintetiza la primaria que faltaba, con la mag correcta del catálogo (' + pareja[1][2] + ')');

function haversineArcsec(ra1, dec1, ra2, dec2) {
  var rad = Math.PI / 180, cosd = Math.cos(dec1 * rad);
  var dra = (ra2 - ra1) * cosd, ddec = dec2 - dec1;
  return Math.sqrt(dra * dra + ddec * ddec) * 3600;
}
var sepReal = haversineArcsec(pareja[0][0], pareja[0][1], pareja[1][0], pareja[1][1]);
ok(Math.abs(sepReal - 9.6) < 0.05, 'la separación sintetizada respeta sep=9.6" del catálogo (' + sepReal.toFixed(2) + '")');

console.log('\n2. dibujar() pinta las 2 componentes (aunque se vean fundidas a 99x)');
// Nagler T4 22mm, AFOV 82°, 99x -> campo real = 82/99° = 49.7'. Canvas 720px.
var arcmin = (82 / 99) * 60;
var base = { ra: ra0, dec: dec0, arcmin: arcmin, afov: 82, apertura: 457, conGlow: true, arana: true, mlim: 17 };

gradientes = [];
R.dibujar(fakeCtx({ width: 720, height: 720 }), [], base);   // precalienta sprites
gradientes = [];
R.dibujar(fakeCtx({ width: 720, height: 720 }), pareja, base);

var nucleos = gradientes.filter(function (g) { return g.stops.length === 5; });
ok(nucleos.length === 2, 'se dibujan 2 núcleos de estrella, uno por componente (' + nucleos.length + ')');

var dx = nucleos[0].x - nucleos[1].x, dy = nucleos[0].y - nucleos[1].y;
var sepPx = Math.sqrt(dx * dx + dy * dy);
ok(sepPx > 0 && sepPx < 5,
  'a 99x los centros caen a ~2px de distancia (' + sepPx.toFixed(2) + 'px): las dos cruces de ' +
  'difracción se funden visualmente por resolución angular, no porque falte una componente');

console.log('\n' + (fallos === 0 ? '✓ Todo correcto.' : '✗ ' + fallos + ' fallo(s).'));
process.exit(fallos === 0 ? 0 : 1);
