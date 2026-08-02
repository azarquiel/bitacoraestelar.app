#!/usr/bin/env node
/* Test de dobles en resources/js/bitacora-gaia-render.js: ¿los spikes de
   difracción salen más grandes en una componente de una doble que en una
   estrella suelta de la misma magnitud? ¿mantiene cada componente su propio
   color, sin mezclarse con el de su pareja?

   dibujarSpikes(ctx, x, y, g, escala, rgb) es puramente función de (g, escala,
   apertura vía CFG.spikes -constante-, rgb): no recibe ni sep ni nada de la
   otra componente. La hipótesis a confirmar es que NINGUNA otra pieza de
   dibujar() perturba eso -sería fácil que alguien, en un futuro cambio,
   metiera un "boost" para dobles sin darse cuenta de que ya se ve grande por
   el solape aditivo de dos cruces cercanas-.

   Sin dependencias:  node scripts/test_dobles_spikes.js */
'use strict';

var gradientes, spikes;
function fakeCtx(el) {
  var estado = { globalAlpha: 1 };
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
      if (prop === 'drawImage') return function (img, dx, dy, dw, dh) {
        // Los spikes se dibujan tras translate/rotate con dx=0, dy=-H/2: eso
        // los distingue del glow (drawImage con dx/dy absolutos, dw=dh=2*Rg).
        if (dx === 0 && dw > dh) spikes.push({ L: dw, H: dh, alpha: estado.globalAlpha });
      };
      if (prop in t) return t[prop];
      return function () {};
    },
    set: function (t, prop, val) { estado[prop] = val; t[prop] = val; return true; }
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

console.log('1. Spikes de una componente de doble == spikes de una suelta de la misma mag');
// dec0=0 (cos0=1), arcmin=30 -> escv=64/(30/60)=128 px/grado = 0.035556 px/arcsec.
// Doble apretada: A a -2.5" del centro, B a +2.5" (sep total 5"). Referencia
// suelta: misma mag/color que A, pero lejos (180") para que no solape con nada.
var base = { ra: 0, dec: 0, arcmin: 30, afov: 100, apertura: 457, conGlow: true, arana: true, mlim: 17 };
var estrellas = [
  [-2.5 / 3600, 0, 3.1, 1.0],   // A: dorada, mag 3.1
  [2.5 / 3600, 0, 5.1, -0.2],   // B: azulada, mag 5.1
  [50 / 3600, 0, 3.1, 1.0]      // suelta, lejos, mismo mag/color que A
];

gradientes = []; spikes = [];
R.dibujar(fakeCtx({ width: 64, height: 64 }), [], base);   // precalienta sprites

gradientes = []; spikes = [];
R.dibujar(fakeCtx({ width: 64, height: 64 }), estrellas, base);
// 4 brazos por estrella (CFG.spikes.brazos), 3 estrellas con mag<magMax(10).
ok(spikes.length === 12, 'una cruz de 4 brazos por estrella con mag<magMax (' + spikes.length + ' de 12 esperados)');

var spikeA = spikes[0], spikeSuelta = spikes[8];   // primer brazo de A (i=0) y de la suelta (i=2)
ok(Math.abs(spikeA.L - spikeSuelta.L) < 1e-6 && Math.abs(spikeA.alpha - spikeSuelta.alpha) < 1e-6,
  'componente A de la doble (L=' + spikeA.L.toFixed(2) + ', alfa=' + spikeA.alpha.toFixed(3) +
  ') igual que la suelta de la misma mag (L=' + spikeSuelta.L.toFixed(2) + ', alfa=' + spikeSuelta.alpha.toFixed(3) + ')');

console.log('\n2. Cada componente conserva su propio color (no se mezclan)');
// Núcleo (dibujarEstrellaColor) tiene 5 stops; aureola (dibujarAureola) tiene 4:
// filtra solo los núcleos, en el mismo orden que las estrellas (A, B, suelta).
var nucleos = gradientes.filter(function (g) { return g.stops.length === 5; });
var colA = nucleos[0].stops[1][1], colB = nucleos[1].stops[1][1];
var esperA = R.colorEstrella(1.0, false, 3.1, 457), esperB = R.colorEstrella(-0.2, false, 5.1, 457);
ok(colA.indexOf(esperA.join(',')) !== -1,
  'A sale con SU color (dorado, ' + colA + '), esperado rgb ' + esperA.join(','));
ok(colB.indexOf(esperB.join(',')) !== -1,
  'B sale con SU color (azulada, ' + colB + '), esperado rgb ' + esperB.join(','));
ok(colA !== colB, 'A y B no comparten el mismo color (no hay mezcla entre componentes)');

console.log('\n' + (fallos === 0 ? '✓ Todo correcto.' : '✗ ' + fallos + ' fallo(s).'));
process.exit(fallos === 0 ? 0 : 1);
