#!/usr/bin/env node
/* #579 · El pintor decide la visibilidad de las estrellas de Gaia en V, no en G.

   mlim es una magnitud VISUAL (Torres Lapasió). #545 midió que el 95,8 % del
   catálogo tiene |G − V| > 0,1 (simulador_ocular/docs/notas/sesgo-g-contra-v.md).
   Lo que se comprueba:
     1. Una roja con G < mlim < V va al glow, no resuelta (CA 1).
     2. Una fila con color se pinta igual que una sin color con G = su V:
        alfa, tamaño, blur, aureola y espigas salen de magVGaia (CA 1).
     3. Sin color o fuera de rango, la fila se queda en G (CA 2).
     4. Glow y niebla siguen siendo disjuntos y sin hueco en V: cada fila la
        pinta el pintor o la recoge nieblaCampo, nunca las dos ni ninguna, y la
        niebla cuenta el flujo en V.
     5. Las filas no se tocan: la caché y la frontera del Avance (G = 15)
        siguen en G (CA 3).
     6. Las sintéticas de un cúmulo (generadas en V) no se convierten dos veces.

   node scripts/test_pintor_banda_v.js */
'use strict';

global.window = {};
global.document = undefined;
require('../resources/js/bitacora-gaia-color.js');
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/lf-globulares-datos.js');
require('../simulador_ocular/resources/js/globulares-datos.js');
require('../resources/js/bitacora-cumulos.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) console.log('  ok   ' + etiqueta);
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function cerca(a, b, tol) { return Math.abs(a - b) <= tol; }

var SIZE = 400, MLIM = 12;
var o = { ra: 0, dec: 0, arcmin: 30, afov: 60, apertura: 200, mlim: MLIM, conGlow: true };
function plan(filas) { return R.planEstrellas(filas, o, SIZE); }
var ROJA = 1.5;                                  // G − V = −0,443
var dRoja = R.magVGaia([0, 0, 0, ROJA]);         // V − G

console.log('1. Roja con G < mlim < V');
var roja = plan([[0, 0, MLIM - 0.2, ROJA]]);
var gris = plan([[0, 0, MLIM - 0.2, null]]);
ok(roja.length === 1 && roja[0].aGlow != null, 'G = mlim − 0,2, V = mlim + 0,24: glow, no resuelta');
ok(gris.length === 1 && gris[0].aGlow == null, 'control sin color, misma G: resuelta');

console.log('2. Alfa, tamaño, blur, aureola y espigas salen de V');
[4, 8, 10.5].forEach(function (g) {
  var a = plan([[0, 0, g, ROJA]])[0], b = plan([[0, 0, g + dRoja, null]])[0];
  ok(['alfa', 'Rtot', 'blur', 'aAur', 'L'].every(function (k) { return cerca(a[k], b[k], 1e-9); }),
    'G ' + g + ', BP−RP 1,5 se pinta como V ' + (g + dRoja).toFixed(3) + ' sin color');
});
var glowRoja = plan([[0, 0, MLIM + 0.5, ROJA]])[0], glowGris = plan([[0, 0, MLIM + 0.5 + dRoja, null]])[0];
ok(glowRoja && glowGris && cerca(glowRoja.aGlow, glowGris.aGlow, 1e-12), 'el alfa del glow también sale de V');

console.log('3. Sin color o fuera de rango: se queda en G');
[null, 5.2, -0.7].forEach(function (c) {
  var a = plan([[0, 0, 10.5, c]])[0], b = plan([[0, 0, 10.5, null]])[0];
  ok(cerca(a.alfa, b.alfa, 1e-12) && cerca(a.Rtot, b.Rtot, 1e-12), 'BP−RP ' + c + ': mismo alfa y tamaño que G sin convertir');
});

console.log('4. Glow y niebla, disjuntos y sin hueco en V');
var cielo = { pupilaSalida: 4, pupilaOjo: 7, sqm: 21.5, transmision: 0.9, aumentos: 50, perceptual: true };
var oN = { ra0: 0, dec0: 0, arcmin: 30, size: SIZE, mlim: MLIM, cielo: cielo };
var huecos = 0, dobles = 0, malFlujo = 0, nNiebla = 0;
for (var k = 0; k < 400; k++) {
  var fila = [0, 0, MLIM - 1 + 5 * k / 400, [null, 0.3, 1.0, ROJA, 3.0][k % 5]];
  var pintada = plan([fila]).some(function (p) { return p.aGlow == null || p.aGlow >= R.config.glowCorte; });
  var flujo = R.nieblaCampo(null, [fila], oN);
  if (flujo > 0) {
    nNiebla++;
    if (!cerca(flujo, Math.pow(10, -0.4 * R.magVGaia(fila)), 1e-15)) malFlujo++;
  }
  if (pintada && flujo > 0) dobles++;
  if (!pintada && !(flujo > 0)) huecos++;
}
ok(nNiebla > 0, 'no vacuo: la niebla recoge filas (' + nNiebla + ' de 400)');
ok(dobles === 0, 'ninguna fila en el pintor y en la niebla a la vez (' + dobles + ')');
ok(huecos === 0, 'ninguna fila perdida entre los dos (' + huecos + ')');
ok(malFlujo === 0, 'la niebla suma 10^(−0,4·V), no 10^(−0,4·G) (' + malFlujo + ' mal)');

console.log('5. Las filas siguen en G');
var filas = [[0, 0, 11.8, ROJA], [0, 0, 14.9, 2.0], [0, 0, 9, null]];
var copia = JSON.stringify(filas);
plan(filas); R.nieblaCampo(null, filas, oN);
ok(JSON.stringify(filas) === copia, 'el pintor y la niebla no reescriben [2]: caché y frontera del Avance en G');

console.log('6. Sintéticas de un cúmulo: una sola conversión');
// 47 Tuc con 1000 mm a 300×: de los pocos montajes que dibujan sintéticas.
var e = global.window.BITACORA_GLOBULARES.filter(function (f) { return f[0] === 'NGC 104'; })[0];
var TUC = { id: e[0], ra: e[2], dec: e[3], rc: e[4], rh: e[5], c: e[6], muV0: e[7], Vt: e[8], dkpc: e[9],
  ebv: e[10], feh: e[11], elip: e[12], pa: null, trager: e[13] || null };
var D = 1000, MAG = 300, SZ = 240;
var cieloC = { pupilaSalida: D / MAG, pupilaOjo: 7, sqm: 21.5, transmision: 0.9, aumentos: MAG, perceptual: true };
var mlimC = R.magLimite({ apertura: D, aumentos: MAG, transmision: 0.9, sqm: 21.5, pupilaOjo: 7 });
var cum = R.pintarCumulo(new Float32Array(SZ * SZ), TUC, {
  ra0: TUC.ra, dec0: TUC.dec, arcmin: 20, size: SZ, cielo: cieloC, apertura: D, estrellas: [], mlim: mlimC
});
var vSet = new Set(cum.poblacion.sinteticas({ ra: TUC.ra, dec: TUC.dec })
  .map(function (f) { return f[2].toFixed(6); }));
ok(cum.estrellas.length > 0, 'no vacuo: el cúmulo dibuja sintéticas (' + cum.estrellas.length + ')');
ok(cum.estrellas.every(function (f) { return vSet.has(R.magVGaia(f).toFixed(6)); }),
  'magVGaia de cada sintética dibujada devuelve la V con la que se generó');

console.log(fallos ? '\n' + fallos + ' fallo(s)' : '\nTodo ok');
process.exit(fallos ? 1 : 0);
