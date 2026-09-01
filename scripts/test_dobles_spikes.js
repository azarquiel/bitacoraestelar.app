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
function casi(a, b, tolRel, etiqueta) {
  ok(Math.abs(a - b) <= b * tolRel,
    etiqueta + ': ' + a.toFixed(3) + ' (esperado ' + b.toFixed(3) + ' ±' + (tolRel * 100) + '%)');
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


/* ── 3. La espiga tiene que LEERSE como espiga, no como un pincho corto ──────
   La ley (sección 4) dice cómo CRECE la espiga con el brillo, pero no a qué
   tamaño arranca: eso lo pone longRef, y lo que lo ancla es la proporción con
   el disco de la propia estrella. En un reflector, la cruz de una brillante se
   ve como una aguja larga y fina saliendo de un punto, no como cuatro tocones:
   con la rampa lineal anterior el brazo de una mag 3,1 medía 5,5 radios de
   disco; aquí se exige que pase de 9. */
console.log('\n3. La espiga de una brillante es larga frente a su propio disco');
var ANCLA_LARGO = 9;
var oDisco = {
  afov: base.afov, apertura: base.apertura, arcmin: base.arcmin, size: 64,
  g: 3.1, blur: R.blurEstrella(3.1, base.apertura), mlim: base.mlim
};
var Rdisco = R.radioEstrella(oDisco);
ok(spikeA.L / Rdisco >= ANCLA_LARGO,
  'mag 3,1: brazo de ' + spikeA.L.toFixed(2) + ' px sobre un disco de ' + Rdisco.toFixed(2) +
  ' px de radio = ' + (spikeA.L / Rdisco).toFixed(1) + '× ≥ ' + ANCLA_LARGO + '×');
// El tope (longMax) no puede estar mordiendo a una estrella corriente: si
// mordiera, todas las brillantes saldrían con la MISMA espiga y la ley por
// magnitud dejaría de significar nada.
var cf = R.config.spikes;
function largoNominal(g) { return cf.longRef * Math.pow(10, 0.2 * (cf.magMax - g)); }
ok(largoNominal(3.1) < cf.longMax,
  'el tope longMax (' + cf.longMax + ') no recorta a una mag 3,1 (' +
  largoNominal(3.1).toFixed(0) + '): la ley por magnitud sigue viva');

/* ── 4. La longitud sigue la ley física: L ∝ √flujo ─────────────────────────
   Cada brazo de la araña difracta como una rendija (Babinet), así que a lo
   largo del brazo la intensidad va como sinc², cuya envolvente cae como 1/u².
   La espiga se ve hasta donde esa cola supera el umbral del ojo, de modo que
   duplicar el flujo NO alarga el doble: alarga √2. En magnitudes,

       L ∝ 10^(0,2·(magMax − g))     [= √flujo]

   Una rampa lineal en magnitud (la de antes) no tiene esa firma: reparte plano
   y deja a las dos o tres estrellas de verdad brillantes del campo con una
   cruz apenas mayor que la de una mediana. La prueba es la razón de longitudes
   entre dos estrellas separadas 2,5 mag —un factor 10 de flujo—: la ley exige
   √10 = 3,162, y solo lo cumple la potencia. */
console.log('\n4. L ∝ √flujo: 2,5 magnitudes de más alargan la espiga √10 veces');
var RAIZ10 = Math.sqrt(10);
function largoDe(g) {
  gradientes = []; spikes = [];
  R.dibujar(fakeCtx({ width: 64, height: 64 }), [[0, 0, g, 0.5]], base);
  return spikes.length ? spikes[0].L : 0;
}
var L75 = largoDe(7.5), L50 = largoDe(5.0), L25 = largoDe(2.5);
ok(L25 > 0 && L50 > 0 && L75 > 0, 'las tres magnitudes de prueba dibujan espiga');
ok(cf.longRef * Math.pow(10, 0.2 * (cf.magMax - 2.5)) < cf.longMax,
  'el tope longMax (' + cf.longMax + ') no recorta a una mag 2,5: la ley se mide sin truncar');
casi(L50 / L75, RAIZ10, 0.02, 'mag 5,0 frente a mag 7,5');
casi(L25 / L50, RAIZ10, 0.02, 'mag 2,5 frente a mag 5,0');
console.log('\n' + (fallos === 0 ? '✓ Todo correcto.' : '✗ ' + fallos + ' fallo(s).'));
process.exit(fallos === 0 ? 0 : 1);
