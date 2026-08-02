#!/usr/bin/env node
/* Test del color de las estrellas de carbono en resources/js/bitacora-gaia-render.js:

   1. colorEstrella(bprp, carbono=true, ...): el color forzado debe salir
      rojo/naranja saturado, nunca blanco/gris (Purkinje solo aplica al color
      NATURAL, el forzado de carbono ignora bprp real vía bprpMin/bprpOffset).

   2. dibujar(): con dos candidatas casi equidistantes al RA/Dec catalogado
      (redondeo de segundo de arco, ver comentario junto a idxCarbono), la
      estrella pintada de rojo debe ser la real (mag ≈ carbonoMag), no la
      vecina más tenue que gana por unos décimos de arcsec en pura distancia
      -el bug "corazón blanco" reportado con SZ Sgr-.

   Sin dependencias:  node scripts/test_carbono_color.js */
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
      return function () {};
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
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

console.log('1. colorEstrella: forzado de carbono sale rojo/naranja, no blanco');
var rgbCarbono = R.colorEstrella(null, true, 8.6, 457);   // sin bprp catalogado, mag tipo SZ Sgr
ok(rgbCarbono[0] > rgbCarbono[1] && rgbCarbono[1] >= rgbCarbono[2],
  'R > G >= B (' + rgbCarbono.join(',') + ')');
ok(!(rgbCarbono[0] > 240 && rgbCarbono[1] > 240 && rgbCarbono[2] > 240),
  'no sale blanco/gris (' + rgbCarbono.join(',') + ')');

console.log('\n2. dibujar(): con dos candidatas casi equidistantes, gana la de magnitud correcta');
// Campo: dec0=0 (cos0=1), arcmin=30 → escv=64/(30/60)=128 px/grado.
// Real (tipo SZ Sgr): 1,8" del centro catalogado, mag 8,6 (coincide con carbonoMag).
// Decoy: 1,764" del centro (MÁS CERCA en píxeles, gana la vieja regla "más cercana"),
// mag 10 (mucho más tenue, no coincide con carbonoMag), bprp azul.
var raDecoy = -0.00049, raReal = -0.0005;
var estrellas = [
  [raDecoy, 0, 10, 0.1],   // índice 0: decoy, más cerca en píxeles
  [raReal, 0, 8.6, 2.0]    // índice 1: la estrella de carbono real
];
var base = { ra: 0, dec: 0, arcmin: 30, afov: 60, apertura: 457, conGlow: true, arana: false, mlim: 17 };

// Precalienta spriteGlow() para que no cuele como gradientes[0].
gradientes = [];
R.dibujar(fakeCtx({ width: 64, height: 64 }), [], base);

gradientes = [];
R.dibujar(fakeCtx({ width: 64, height: 64 }), estrellas,
  Object.assign({ carbono: true, carbonoMag: 8.6 }, base));
var colDecoy = gradientes[0].stops[1][1], colReal = gradientes[1].stops[1][1];
ok(colReal.indexOf('255,255,255') === -1 && colDecoy !== colReal,
  'la real (idx 1) sale con color de carbono forzado, distinto de la decoy (real=' + colReal + ', decoy=' + colDecoy + ')');
ok(colDecoy.indexOf('196,211,255') !== -1,
  'la decoy (idx 0, no elegida) mantiene su color natural azul sin forzar (' + colDecoy + ')');

// Sin carbonoMag (llamadas antiguas): cae a la más cercana en píxeles -> la decoy
// gana por el redondeo, reproduciendo el bug histórico si se quita carbonoMag.
gradientes = [];
R.dibujar(fakeCtx({ width: 64, height: 64 }), estrellas, Object.assign({ carbono: true }, base));
var colDecoySinMag = gradientes[0].stops[1][1];
ok(colDecoySinMag.indexOf('255,255,255') === -1,
  'sin carbonoMag, cae al criterio antiguo (más cercana = decoy, ' + colDecoySinMag + ') -documenta el bug que carbonoMag arregla');

console.log('\n3. núcleo de carbono: tinteNucleoCarbono evita el blanqueamiento del centro');
// Campo de una sola estrella (sin decoy): el núcleo (stops[0]) se compara contra
// lo que habría salido con el tinteNucleo NORMAL (0.8) sobre el MISMO rgb forzado
// -fuente de verdad independiente: la fórmula del blend aplicada a mano, no el
// código-, para comprobar que el nuevo tinteNucleoCarbono deja el centro
// notablemente más saturado (color dominando) en vez de mayormente blanco.
function parseRGBA(str) { var m = str.match(/rgba\((\d+),(\d+),(\d+)/); return [+m[1], +m[2], +m[3]]; }
function sat3(rgb) {
  var gris = 0.30 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2];
  return Math.max(Math.abs(rgb[0] - gris), Math.abs(rgb[1] - gris), Math.abs(rgb[2] - gris));
}
function blend(rgb, tn) {
  return [Math.round(255 + tn * (rgb[0] - 255)), Math.round(255 + tn * (rgb[1] - 255)), Math.round(255 + tn * (rgb[2] - 255))];
}
var soloReal = [[raReal, 0, 8.6, 2.0]];
gradientes = [];
R.dibujar(fakeCtx({ width: 64, height: 64 }), [], base);
gradientes = [];
R.dibujar(fakeCtx({ width: 64, height: 64 }), soloReal, Object.assign({ carbono: true, carbonoMag: 8.6 }, base));
var nucleoReal = parseRGBA(gradientes[0].stops[0][1]);
var satNucleoViejo = sat3(blend(rgbCarbono, 0.8));
var satNucleoNuevo = sat3(nucleoReal);
var satFull = sat3(rgbCarbono);
ok(satNucleoNuevo > satNucleoViejo * 1.1 && satNucleoNuevo / satFull > 0.9,
  'núcleo de carbono mucho más saturado que con tinteNucleo normal, cerca del color pleno (viejo=' +
  satNucleoViejo.toFixed(1) + ', actual=' + satNucleoNuevo.toFixed(1) + '/' + satFull.toFixed(1) +
  ', núcleo=' + nucleoReal.join(',') + ')');

console.log('\n' + (fallos === 0 ? '✓ Todo correcto.' : '✗ ' + fallos + ' fallo(s).'));
process.exit(fallos === 0 ? 0 : 1);
