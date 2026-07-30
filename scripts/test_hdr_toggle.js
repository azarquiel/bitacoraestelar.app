#!/usr/bin/env node
/* Test del toggle CFG.hdrRescate en capaEstrellas() (resources/js/bitacora-gaia-render.js).

   Por defecto (hdrRescate=false) capaEstrellas() debe hacer UNA sola pasada del
   lienzo -una llamada a getImageData-, no dos; con hdrRescate=true, dos (el
   truco de rescate de núcleos saturados). Node no tiene canvas real, así que
   se sustituye `document` por un stub mínimo (un Proxy que no hace nada salvo
   contar getImageData) -basta para comprobar que la segunda pasada de verdad
   no se dispara, sin necesitar comparar píxeles.

   Sin dependencias:  node scripts/test_hdr_toggle.js */
'use strict';

var counters = { getImageData: 0 };

function fakeCtx(el) {
  return new Proxy({}, {
    get: function (t, prop) {
      if (prop === 'canvas') return el;
      if (prop === 'createRadialGradient') return function () { return { addColorStop: function () {} }; };
      if (prop === 'createImageData') return function (w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; };
      if (prop === 'getImageData') return function (x, y, w, h) {
        counters.getImageData++;
        return { data: new Uint8ClampedArray(w * h * 4) };
      };
      if (prop in t) return t[prop];
      return function () {};   // no-op: fillRect/drawImage/beginPath/arc/fill/save/restore/rotate/translate...
    },
    set: function (t, prop, val) { t[prop] = val; return true; }
  });
}
global.window = {};
global.document = {
  createElement: function () {
    var el = { width: 0, height: 0 };
    el.getContext = function () { return fakeCtx(el); };
    return el;
  }
};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender, C = R.config;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

var SIZE = 64;
// Estrellas normales (sin color, sin doble): basta para ejercitar la rama
// resuelta de dibujar() sin arrastrar el camino de color/spikes.
var estrellas = [[10, 40, 8, null], [10.01, 40.01, 12, null]];
var o = { ra: 10, dec: 40, arcmin: 30, mlim: 14, afov: 60, apertura: 150, conGlow: true, arana: false };

ok(C.hdrRescate === false, 'CFG.hdrRescate por defecto está OFF');

counters.getImageData = 0;
R.capaEstrellas(estrellas, o, SIZE);
ok(counters.getImageData === 1, 'con hdrRescate OFF, capaEstrellas hace 1 sola pasada (getImageData x' + counters.getImageData + ')');

C.hdrRescate = true;
counters.getImageData = 0;
R.capaEstrellas(estrellas, o, SIZE);
ok(counters.getImageData === 2, 'con hdrRescate ON, capaEstrellas hace 2 pasadas -idéntico al comportamiento de antes de este toggle- (getImageData x' + counters.getImageData + ')');
C.hdrRescate = false;   // deja CFG como estaba, por si algo más se ejecuta después

console.log('\n' + (fallos === 0 ? '✓ Todo correcto.' : '✗ ' + fallos + ' fallo(s).'));
process.exit(fallos === 0 ? 0 : 1);
