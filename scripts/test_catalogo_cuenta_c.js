#!/usr/bin/env node
/* #623 · Producción dibuja como catálogo de un globular solo las filas de Gaia
   que la completitud `c` cuenta: astrometría 5/6p y BP−RP (ADR 0039, #619,
   #621). Las demás no entran como catálogo: su luz ya la ponen las sintéticas
   y el velo por (1 − c), y dibujarlas la contaba dos veces.

   La marca 5/6p viaja en el 6º elemento de la fila, f[5] (true, false, o
   ausente = se desconoce: banco del formato 1, Avance, caché vieja del proxy).

   Lo que se comprueba:
     AC5  El fixture de M13 con su sidecar (ruwe nulo = 2p) pasa por el filtro
          del cliente: entran 8 071 de 11 972 filas (la cuenta de #619). Caso
          malo: las 11 972. Sin marca no se quita ninguna (AC3).
     AC4  Por la salida pública pintarCumulo(...).estrellas: dentro de r_t,
          una fila miembro 2p o sin BP−RP no sale; la misma fila 5/6p sale
          igual que sin marca. Las de campo y las de fuera de r_t no son del
          cúmulo: salen aunque sean 2p (fuera de alcance de #623).

   node scripts/test_catalogo_cuenta_c.js */
'use strict';

var fs = require('fs');
var path = require('path');
global.window = {};
global.document = undefined;
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/lf-globulares-datos.js');
require('../simulador_ocular/resources/js/globulares-datos.js');
require('../resources/js/bitacora-cumulos.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function ok(c, et) {
  if (c) console.log('  ok   ' + et);
  else { fallos++; console.error('  FALLA ' + et); }
}

console.log('AC5 · fixture de M13 por el filtro del cliente:');
var VAL = path.join(__dirname, '../simulador_ocular/docs/validacion');
var ruwe = new Map();
fs.readFileSync(path.join(VAL, 'm13_gaia_dr3_mezcla.csv'), 'utf8').trim().split('\n').slice(1).forEach(function (l) {
  var c = l.split(',');
  ruwe.set(c[0] + ',' + c[1], c[2] !== '');
});
var filas = fs.readFileSync(path.join(VAL, 'm13_gaia_dr3.csv'), 'utf8').trim().split('\n').slice(1).map(function (l) {
  var c = l.split(',');
  if (!ruwe.has(c[0] + ',' + c[1])) throw new Error('fila sin sidecar: ' + c[0] + ',' + c[1]);
  return [+c[0], +c[1], +c[2], c[3] === '' ? null : +c[3], false, ruwe.get(c[0] + ',' + c[1])];
});
var entran = filas.filter(function (f) { return R.cuentaEnC(f) !== false; }).length;
ok(filas.length === 11972, 'el fixture tiene 11 972 filas');
ok(entran === 8071, 'entran como catálogo 8 071 (' + entran + ')');
ok(entran !== filas.length, 'caso malo descartado: no entran las 11 972');
var sinMarca = filas.map(function (f) { return f.slice(0, 4); });
ok(sinMarca.every(function (f) { return R.cuentaEnC(f) === null; }), 'sin marca (banco viejo): se desconoce, ninguna se quita');

console.log('AC4 · pintarCumulo solo dibuja como catálogo del cúmulo las que c cuenta:');
var e = global.window.BITACORA_GLOBULARES.filter(function (f) { return f[0] === 'NGC 6205'; })[0];
var M13 = { id: e[0], ra: e[2], dec: e[3], rc: e[4], rh: e[5], c: e[6], muV0: e[7], Vt: e[8], dkpc: e[9],
  ebv: e[10], feh: e[11], elip: e[12], pa: null, trager: e[13] || null };
var D = 457, MAG = 173, SQM = 21.5, SIZE = 240;
var cos0 = Math.cos(M13.dec * Math.PI / 180);
var mlim = R.magLimite({ apertura: D, aumentos: MAG, transmision: 0.9, sqm: SQM, pupilaOjo: 7 });

/* 300 filas brillantes (G 12-14, con color) entre rMin y rMax minutos. */
function anillo(rMin, rMax, cola) {
  var out = [];
  for (var k = 0; k < 300; k++) {
    var r = rMin + (rMax - rMin) * ((k * 0.618034) % 1), ang = k * 2.39996;
    out.push([M13.ra + r / 60 * Math.cos(ang) / cos0, M13.dec + r / 60 * Math.sin(ang),
      12 + 2 * ((k * 0.414214) % 1), 0.8].concat(cola));
  }
  return out;
}
function salen(lista) {
  var cielo = { pupilaSalida: D / MAG, pupilaOjo: 7, sqm: SQM, transmision: 0.9, aumentos: MAG, perceptual: true };
  var cum = R.pintarCumulo(new Float32Array(SIZE * SIZE), M13, {
    ra0: M13.ra, dec0: M13.dec, arcmin: 30, size: SIZE, cielo: cielo, apertura: D, estrellas: lista, mlim: mlim
  });
  var s = new Set(cum.estrellas);
  return lista.filter(function (f) { return s.has(f); }).length;
}
var nSin = salen(anillo(2, 8, [])), n5p = salen(anillo(2, 8, [false, true]));
ok(nSin > 0, 'no vacuo: sin marca salen ' + nSin + '/300');
ok(n5p === nSin, '5/6p con color: sale lo mismo que sin marca (' + n5p + ')');
ok(salen(anillo(2, 8, [false, false])) === 0, 'miembro 2p dentro de r_t: no sale ninguna');
var sinColor = anillo(2, 8, [false, true]).map(function (f) { f[3] = null; return f; });
ok(salen(sinColor) === 0, 'miembro 5/6p sin BP−RP dentro de r_t: no sale ninguna');
ok(salen(anillo(2, 8, [true, false])) === 300, 'fila de campo 2p: sale entera, no es del cúmulo');
var lejos = anillo(90, 100, [false, false]);
ok(salen(lejos) === lejos.length, 'fila 2p fuera de r_t (90-100′): sale entera');

if (fallos) { console.error('\n✗ ' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\n✓ Todo correcto.');
