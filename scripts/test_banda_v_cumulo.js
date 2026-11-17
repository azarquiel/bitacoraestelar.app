#!/usr/bin/env node
/* #574 · El flujo de las filas de Gaia entra en el modelo del cúmulo en banda
   V, la de la función de luminosidad, no en G.

   Lo que se comprueba:
     · magVGaia aplica G − V de Gaia EDR3 (doc. CU5, tabla 5.7, Riello et al.
       2021) con BP−RP en (−0,5, 5) y deja la G sin color o fuera de rango.
     · estrellasCumulo juzga contra m_res con esa V: una gigante roja con
       G < m_res < V se dibujaba (G tratada como V) y ya no.
     · pintarCumulo registra cuántas filas del catálogo se quedan en G.

   node scripts/test_banda_v_cumulo.js */
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
function cerca(a, b, tol) { return Math.abs(a - b) <= tol; }

console.log('magVGaia (G − V de EDR3):');
ok(cerca(R.magVGaia([0, 0, 15, 1.0]) - 15, 0.2141, 1e-4), 'BP−RP 1,0: V = G + 0,214');
ok(cerca(R.magVGaia([0, 0, 15, 1.5]) - 15, 0.4433, 1e-3), 'BP−RP 1,5: V = G + 0,443');
ok(R.magVGaia([0, 0, 15, null]) === 15, 'sin color: se queda en G');
ok(cerca(R.magVGaia([0, 0, 15, 0]) - 15, 0.02704, 1e-9), 'BP−RP 0 no es «sin color»');
ok(R.magVGaia([0, 0, 15, 5]) === 15 && R.magVGaia([0, 0, 15, -0.5]) === 15,
  'fuera de (−0,5, 5): se queda en G');

var e = global.window.BITACORA_GLOBULARES.filter(function (f) { return f[0] === 'NGC 6205'; })[0];
var M13 = { id: e[0], ra: e[2], dec: e[3], rc: e[4], rh: e[5], c: e[6], muV0: e[7],
            Vt: e[8], dkpc: e[9], ebv: e[10], feh: e[11], elip: e[12], pa: null, trager: e[13] || null };
var SIZE = 200;
function pinta(estrellas) {
  return R.pintarCumulo(new Float32Array(SIZE * SIZE), M13, {
    ra0: M13.ra, dec0: M13.dec, arcmin: 20, size: SIZE, apertura: 100, estrellas: estrellas,
    cielo: { pupilaSalida: 1, pupilaOjo: 7, sqm: 21.5, transmision: 0.9, aumentos: 100, perceptual: true }
  });
}
/* A 200″ con 100 mm el sorteo no decide (a ≈ 1): lo que cambie es el corte. */
var rAs = 200, base = pinta([]);
var mRes = base.tabla.mRes[Math.floor(rAs / base.tabla.paso)];
function fila(bprp) {
  return [M13.ra + rAs / 3600 / Math.cos(M13.dec * Math.PI / 180), M13.dec, mRes - 0.2, bprp];
}
console.log('\nestrellasCumulo juzga en V (m_res a 200″ = ' + mRes.toFixed(2) + '):');
var gris = fila(null), roja = fila(1.5);
ok(pinta([gris]).estrellas.indexOf(gris) >= 0, 'sin color, G = m_res − 0,2 se dibuja');
ok(pinta([roja]).estrellas.indexOf(roja) < 0, 'roja con V = m_res + 0,24 ya no se dibuja');

console.log('\nfilas que se quedan en G:');
var res = pinta([fila(null), fila(5.2), fila(-0.7), fila(1.0)]);
ok(res.filasEnG === 3, 'sin color o fuera de rango: ' + res.filasEnG + ' de 4');

console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
