#!/usr/bin/env node
/* Test de dos correcciones en resources/js/bitacora-gaia-render.js:

   1. blurEstrella(g, apertura): el halo del sprite (blur) ahora depende del
      brillo ABSOLUTO de la estrella (vía alfaAureola), no de un valor fijo
      igual para todas. Antes hasta la más tenue del límite salía con el mismo
      borde difuso que Sirio.

   2. magColorEfectivo = mlim - margenColorMag: el umbral de color ahora es
      relativo al límite de detección de CADA equipo (que ya integra apertura,
      aumentos, transmisión y cielo), no una magnitud fija. Antes un 24" y un
      4" mostraban color exactamente hasta la misma magnitud catalogada.

   Sin dependencias:  node scripts/test_blur_color_absoluto.js */
'use strict';

var gradientes;
function fakeCtx(el) {
  return new Proxy({}, {
    get: function (t, prop) {
      if (prop === 'canvas') return el;
      if (prop === 'createRadialGradient') return function () {
        var g = { stops: [] };
        g.addColorStop = function (pos, color) { g.stops.push([pos, color]); };
        gradientes.push(g);
        return g;
      };
      if (prop === 'createImageData') return function (w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; };
      if (prop === 'getImageData') return function (x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; };
      if (prop in t) return t[prop];
      return function () {};   // no-op: fillRect/drawImage/beginPath/arc/fill/save/restore/rotate/translate...
    },
    set: function (t, prop, val) { t[prop] = val; return true; }
  });
}
global.window = {};
global.document = {
  createElement: function () {
    var el = { width: 64, height: 64 };
    el.getContext = function () { return fakeCtx(el); };
    return el;
  }
};
require('../resources/js/bitacora-gaia-color.js');
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender, C = R.config;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

console.log('1. blurEstrella: absoluto, no relativo al límite del equipo');
var bFaint = R.blurEstrella(20, 200);   // muy tenue, aureola ≈ 0
var bMedio = R.blurEstrella(3.1, 200);  // tipo Albireo A
var bBright = R.blurEstrella(0, 200);   // aureola ya al techo
ok(Math.abs(bFaint - C.blurMin) < 0.01, 'tenue → blurMin (' + bFaint.toFixed(3) + ')');
ok(Math.abs(bBright - C.blur) < 1e-6, 'muy brillante → blur máximo (' + bBright.toFixed(3) + ')');
ok(bBright > bMedio && bMedio > bFaint, 'monótono: brillante > medio > tenue');
// La misma magnitud da el mismo blur da igual el mlim del equipo (no recibe mlim).
ok(R.blurEstrella.length === 2, 'blurEstrella no acepta mlim, solo g y apertura');

console.log('\n2. magColorEfectivo: el umbral de color escala con la profundidad del equipo');
var estrellas = [[10, 40, 10, 0.5]];   // una estrella mag 10, BP-RP 0.5 (no null)
var base = { ra: 10, dec: 40, arcmin: 30, afov: 60, apertura: 200, conGlow: true, arana: false };

// stops[1] lleva el color 'col' sin mezclar con blanco (stops[0] es el
// núcleo, que SIEMPRE se tiñe hacia blanco por CFG.tinteNucleo aunque haya
// color: no sirve para distinguir estrella blanca de estrella con color).
// Precalienta spriteGlow() (cachea su propio gradiente en otro canvas) para
// que no cuele como gradientes[0] en la primera llamada real de abajo.
gradientes = [];
R.dibujar(fakeCtx({ width: 64, height: 64 }), [], Object.assign({ mlim: 17 }, base));

gradientes = [];
R.dibujar(fakeCtx({ width: 64, height: 64 }), estrellas, Object.assign({ mlim: 17 }, base));
var bordeProfundo = gradientes[0].stops[1][1];
ok(bordeProfundo.indexOf('255,255,255') === -1,
  'equipo profundo (mlim=17, umbral=' + (17 - C.margenColorMag) + '): mag 10 SÍ sale con color (' + bordeProfundo + ')');

gradientes = [];
R.dibujar(fakeCtx({ width: 64, height: 64 }), estrellas, Object.assign({ mlim: 11 }, base));
var bordeSomero = gradientes[0].stops[1][1];
ok(bordeSomero.indexOf('255,255,255') !== -1,
  'equipo somero (mlim=11, umbral=' + (11 - C.margenColorMag) + '): la MISMA mag 10 sale blanca (' + bordeSomero + ')');

console.log('\n3. colorEstrella: la saturación escala con el flujo absoluto (tipo Purkinje)');
var GColor = require('../resources/js/bitacora-gaia-color.js');
function sat(rgb) {
  var gris = 0.30 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2];
  return Math.max(Math.abs(rgb[0] - gris), Math.abs(rgb[1] - gris), Math.abs(rgb[2] - gris));
}
var bprpAzul = 0.0;
var colBrillante = R.colorEstrella(bprpAzul, false, 0, 457);     // aureola al techo → f=1
var colMedio = R.colorEstrella(bprpAzul, false, 6.57, 457);      // M39, la más brillante del campo
var colTenue = R.colorEstrella(bprpAzul, false, 20, 457);        // al límite → f≈0
ok(sat(colBrillante) > sat(colMedio) && sat(colMedio) > sat(colTenue),
  'monótono: brillante (' + sat(colBrillante).toFixed(1) + ') > medio (' + sat(colMedio).toFixed(1) +
  ') > tenue (' + sat(colTenue).toFixed(1) + ')');
ok(Math.abs(sat(colTenue) - sat(GColor.colorPorBpRp(bprpAzul, 1))) < 1e-6,
  'al límite (f≈0), saturación cae a 1 (neutro, sin empuje)');
ok(Math.abs(sat(colBrillante) - sat(GColor.colorPorBpRp(bprpAzul, C.saturacion))) < 1e-6,
  'al techo de la aureola (f=1), saturación completa (config.saturacion)');

console.log('\n' + (fallos === 0 ? '✓ Todo correcto.' : '✗ ' + fallos + ' fallo(s).'));
process.exit(fallos === 0 ? 0 : 1);
