/* #545 — Cuánto sesgo mete comparar la G de Gaia con una magnitud límite visual.

Recorre el Avance de Gaia (DR3, G < 15, cielo completo, 49 152 celdas; formato en
scripts/gen_avance_gaia.py) y aplica a cada fila la MISMA conversión que el
render (`magVGaia`, G − V de EDR3, tabla 5.7). No toca producción.

Listón prerregistrado (fijado antes de medir, AGENTS.md «Prerregistros»):
  «parte apreciable» = al menos el 10 % de las estrellas con color tiene |G − V| > 0,1.
  Caso malo que el listón tiene que rechazar: un catálogo sin sesgo (todas las
  estrellas en BP−RP ≈ 0,5, |G − V| = 0,04) da 0 % y sale «no hace falta». La
  autocomprobación de abajo lo verifica con filas sintéticas.

Uso: node scripts/harness_sesgo_g_v.js [DIR_AVANCE_N6]
  (por defecto simulador_ocular/avance/n6; el Avance no está en git, ver
  simulador_ocular/README.md). */
'use strict';
var fs = require('fs');
var path = require('path');
global.window = global;
require('../resources/js/bitacora-gaia-render.js');
var R = window.BitacoraGaiaRender;

var LISTON_DELTA = 0.1, LISTON_FRACCION = 0.10;
var CENTINELA = -32768, CABECERA = 188, FILA = 12;
var TRAMOS = [[-Infinity, 6], [6, 9], [9, 12], [12, 15]];

function nuevo() { return { n: 0, sinColor: 0, fueraRango: 0, conColor: 0, sobre: 0, suma: 0, hist: {} }; }

// Una fila [ra, dec, G, BP−RP|null] en el acumulador `a`.
function contar(a, G, bprp) {
  a.n++;
  if (bprp == null) { a.sinColor++; return; }
  var d = G - R.magVGaia([0, 0, G, bprp]); // G − V; 0 si la conversión no aplica
  if (!(bprp > -0.5 && bprp < 5)) { a.fueraRango++; return; }
  a.conColor++;
  a.suma += d;
  if (Math.abs(d) > LISTON_DELTA) a.sobre++;
  var k = (Math.floor(d * 20) / 20).toFixed(2); // tramos de 0,05 mag
  a.hist[k] = (a.hist[k] || 0) + 1;
}

function veredicto(a) { return a.sobre / a.conColor >= LISTON_FRACCION; }

// Autocomprobación: el listón distingue un catálogo sin sesgo de uno con sesgo.
(function () {
  var sano = nuevo(), malo = nuevo();
  for (var i = 0; i < 1000; i++) { contar(sano, 12, 0.5); contar(malo, 12, 1.5); }
  if (veredicto(sano) || !veredicto(malo)) throw new Error('el listón no discrimina');
})();

function leerCelda(buf, total, tramos) {
  if (buf.toString('latin1', 0, 4) !== 'BAVG') throw new Error('firma');
  var filas = buf.readUInt32LE(12);
  if (buf.length !== CABECERA + filas * FILA) throw new Error('tamaño');
  for (var i = 0; i < filas; i++) {
    var o = CABECERA + i * FILA;
    var G = buf.readUInt16LE(o + 8) / 1000;
    var c = buf.readInt16LE(o + 10);
    var bprp = c === CENTINELA ? null : c / 1000;
    contar(total, G, bprp);
    for (var t = 0; t < TRAMOS.length; t++) if (G >= TRAMOS[t][0] && G < TRAMOS[t][1]) contar(tramos[t], G, bprp);
  }
  return filas;
}

function pct(x, n) { return (100 * x / n).toFixed(1) + ' %'; }

function main() {
  var dir = process.argv[2] || path.join(__dirname, '..', 'simulador_ocular', 'avance', 'n6');
  var total = nuevo(), tramos = TRAMOS.map(nuevo), filas = 0, celdas = 0;
  for (var ipix = 0; ipix < 49152; ipix++) {
    filas += leerCelda(fs.readFileSync(path.join(dir, ipix + '.bin')), total, tramos);
    celdas++;
  }
  var man = JSON.parse(fs.readFileSync(path.join(dir, '..', 'manifiesto.json'), 'utf8'));
  if (filas !== man.filas) throw new Error('filas ' + filas + ' ≠ manifiesto ' + man.filas);

  console.log('G − V (EDR3, tabla 5.7) por BP−RP:');
  [-0.2, 0.5, 1.0, 2.0, 3.0].forEach(function (x) {
    console.log('  BP−RP ' + x.toFixed(1) + ': G − V = ' + (15 - R.magVGaia([0, 0, 15, x])).toFixed(3));
  });
  // Dónde cruza |G − V| = 0,1 (bisección; el polinomio es monótono en [0,2; 5)).
  var lo = 0.2, hi = 3;
  for (var it = 0; it < 50; it++) { var mid = (lo + hi) / 2; if (15 - R.magVGaia([0, 0, 15, mid]) > -LISTON_DELTA) lo = mid; else hi = mid; }
  console.log('  |G − V| > 0,1 para BP−RP > ' + lo.toFixed(3));

  console.log('\nAvance de Gaia: ' + celdas + ' celdas, ' + filas + ' filas (= manifiesto)');
  function linea(nombre, a) {
    console.log('  ' + nombre + ': n=' + a.n + ' · sin color ' + pct(a.sinColor, a.n) +
      ' · fuera de rango ' + pct(a.fueraRango, a.n) +
      ' · |G−V|>0,1: ' + pct(a.sobre, a.conColor) + ' de las con color' +
      ' · media G−V ' + (a.suma / a.conColor).toFixed(3) +
      ' · ' + (veredicto(a) ? 'APRECIABLE' : 'no apreciable'));
  }
  linea('todo G<15', total);
  TRAMOS.forEach(function (t, i) { linea('G ' + (t[0] === -Infinity ? '<' : t[0] + '–') + t[1], tramos[i]); });

  // Percentiles de G − V desde el histograma (resolución 0,05 mag: borde superior del tramo).
  var claves = Object.keys(total.hist).map(Number).sort(function (a, b) { return a - b; });
  var acum = 0, pedidos = [0.05, 0.25, 0.5, 0.75, 0.95], salida = [];
  claves.forEach(function (k) {
    acum += total.hist[k.toFixed(2)];
    while (pedidos.length && acum >= pedidos[0] * total.conColor) {
      salida.push('p' + Math.round(pedidos.shift() * 100) + ' ' + (k + 0.05).toFixed(2));
    }
  });
  console.log('\nPercentiles de G − V (todo G<15, con color, ±0,05): ' + salida.join(' · '));
  console.log('\nVEREDICTO: ' + (veredicto(total) ? 'hace falta corrección' : 'no hace falta corrección'));
}

main();
