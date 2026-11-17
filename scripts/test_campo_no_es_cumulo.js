#!/usr/bin/env node
/* #575 · Una estrella de CAMPO dentro de r_t no es luz del cúmulo.

   Una fila de catálogo marcada como campo (5º elemento `true`; la pertenencia
   sale de Vasiliev & Baumgardt 2021, ver
   simulador_ocular/docs/notas/pertenencia-vb21.md) sale de estrellasCumulo
   como si estuviera fuera de r_t: sin corte m > m_res y sin sorteo aCrowd.

   Lo que se comprueba, por la salida pública pintarCumulo(...).estrellas:
     1. En el núcleo (r < 1′), donde m_res y el sorteo se llevan miembros, toda
        fila de campo sale, brillante (m <= m_res) o tenue (m_res < m <= mlim).
     2. No vacuo (ADR 0005): las MISMAS filas sin marca no salen todas.
     3. El canal no depende del ocular: a 61, 173 y 250× salen las mismas
        filas de campo (todas).

   node scripts/test_campo_no_es_cumulo.js */
'use strict';

global.window = {};
global.document = undefined;
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

var e = global.window.BITACORA_GLOBULARES.filter(function (f) { return f[0] === 'NGC 6205'; })[0];
var M13 = { id: e[0], ra: e[2], dec: e[3], rc: e[4], rh: e[5], c: e[6], muV0: e[7], Vt: e[8], dkpc: e[9],
  ebv: e[10], feh: e[11], elip: e[12], pa: null, trager: e[13] || null };
var D = 457, SQM = 21.5, ARC = 30, SIZE = 240;
var cos0 = Math.cos(M13.dec * Math.PI / 180);

/* Filas en el núcleo (0,1′–1′), magnitudes repartidas en [12, mlim]. Sin color
   (bp_rp null): la fila se juzga en G y la V no depende de la conversión. */
function nucleo(n, mlim, campo) {
  var filas = [];
  for (var k = 0; k < n; k++) {
    var r = 0.1 + 0.9 * ((k * 0.618034) % 1), ang = k * 2.39996;
    var f = [M13.ra + r / 60 * Math.cos(ang) / cos0, M13.dec + r / 60 * Math.sin(ang),
      12 + (mlim - 12) * ((k * 0.414214) % 1), null];
    if (campo) f.push(true);
    filas.push(f);
  }
  return filas;
}

function salen(MAG, filas, mlim) {
  var cielo = { pupilaSalida: D / MAG, pupilaOjo: 7, sqm: SQM, transmision: 0.9, aumentos: MAG, perceptual: true };
  var cum = R.pintarCumulo(new Float32Array(SIZE * SIZE), M13, {
    ra0: M13.ra, dec0: M13.dec, arcmin: ARC, size: SIZE, cielo: cielo, apertura: D,
    estrellas: filas, mlim: mlim
  });
  var s = new Set(cum.estrellas);
  return filas.filter(function (f) { return s.has(f); }).length;
}

[61, 173, 250].forEach(function (MAG) {
  var mlim = R.magLimite({ apertura: D, aumentos: MAG, transmision: 0.9, sqm: SQM, pupilaOjo: 7 });
  var campo = nucleo(300, mlim, true), miembros = nucleo(300, mlim, false);
  var nC = salen(MAG, campo, mlim), nM = salen(MAG, miembros, mlim);
  console.log(MAG + '×  mlim ' + mlim.toFixed(2) + ': campo sale ' + nC + '/300, sin marca ' + nM + '/300');
  ok(nC === campo.length, MAG + '×: toda fila de campo del núcleo sale (sin m_res ni sorteo)');
  ok(nM < miembros.length, MAG + '×: sin marca, el núcleo sí corta (no vacuo)');
});

if (fallos) { console.error(fallos + ' fallos'); process.exit(1); }
console.log('test_campo_no_es_cumulo: todo ok');
