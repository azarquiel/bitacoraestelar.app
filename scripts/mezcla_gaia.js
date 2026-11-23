/* #611 · Filas mezcladas del catálogo de Gaia (ADR 0039, «Filas mezcladas del
   núcleo»). Criterio de fuente única de Fabricius et al. 2021 (A&A 649, A5,
   §3.3): ruwe < 1,4 y ipd_frac_multi_peak ≤ 2 y ipd_gof_harmonic_amplitude
   < 0,1. Lo que no lo cumple es mezcla; sin ruwe (solución 2p) también.
   Solo lo usa el arnés: producción no pide estas columnas a Gaia. */
'use strict';
var fs = require('fs');

function esMezcla(ruwe, ipdMultiPeak, ipdGofAmp) {
  return !(ruwe != null && ruwe < 1.4 && ipdMultiPeak <= 2 && ipdGofAmp < 0.1);
}

// Map 'ra,dec' (texto del fixture) → true si la fila es mezcla.
function leer(ruta) {
  var m = new Map();
  fs.readFileSync(ruta, 'utf8').trim().split('\n').slice(1).forEach(function (l) {
    var c = l.split(',');
    m.set(c[0] + ',' + c[1], esMezcla(c[2] === '' ? null : +c[2], +c[3], +c[4]));
  });
  return m;
}

module.exports = { esMezcla: esMezcla, leer: leer };
