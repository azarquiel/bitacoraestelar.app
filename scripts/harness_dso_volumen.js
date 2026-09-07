#!/usr/bin/env node
/* Volumen de las dos codificaciones que el ADR 0024 pone sobre la mesa, sobre
   el banco: el PNG-16 `asinh16` que está escrito y el float32 crudo con gzip
   que es la última vía de escape de la fase 1.

   El ADR lo pide con estas palabras: «la codificación pasa a float32 crudo con
   Content-Encoding: gzip y se vuelve a medir el volumen». Esto es esa medida, y
   nada más: no decide nada y no escribe ninguna textura.

   El PNG sale de su tamaño en disco (lo que ya está generado). El float32 sale
   de comprimir con `zlib.gzipSync` el MISMO `Float32Array` que devuelve
   parseFITS, con el nivel por defecto, que es lo que serviría un
   `Content-Encoding: gzip` de servidor.

   Uso:  node scripts/harness_dso_volumen.js [--dir simulador_ocular/dso] */
'use strict';

var fs = require('fs'), path = require('path'), zlib = require('zlib');
var RAIZ = path.join(__dirname, '..');
global.window = {};
require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-ps1.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'nebulosas-datos.js'));

var PS1 = window.BitacoraPS1, CFG = PS1.cfg;
var B = require('./lib_bajar_parche.js')(window.BitacoraGaiaRender);
var BANCO = require('./lib_banco_dso.js')(window.BitacoraGaiaRender);
var FIXTURES = path.join(__dirname, 'fixtures', 'dso');

function arg(n, d) { var i = process.argv.indexOf(n); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; }
var DIRS = [path.resolve(RAIZ, arg('--dir', path.join('simulador_ocular', 'dso'))), FIXTURES];

function png(nombre) {
  var id = PS1.ps1IdTextura(nombre), n = 0;
  DIRS.forEach(function (d) {
    if (n || !fs.existsSync(d)) return;
    var f = fs.readdirSync(d).filter(function (x) { return x.indexOf(id + '.') === 0 && /\.png$/.test(x); })[0];
    if (f) n = fs.statSync(path.join(d, f)).size;
  });
  return n;
}

var b = BANCO.banco(), filas = [], tp = 0, tg = 0;
b.objetos.filter(function (o) { return o.gal; }).reduce(function (cadena, o, i) {
  return cadena.then(function () {
    var p = png(o.nombre);
    if (!p) { console.log('[' + (i + 1) + '] ' + o.nombre + ': sin PNG en disco'); return; }
    return B.bajar(o.gal.ra, o.gal.dec, o.gal.ladoArcmin, CFG.salida).then(function (F) {
      var g = zlib.gzipSync(Buffer.from(F.datos.buffer, F.datos.byteOffset, F.datos.byteLength)).length;
      tp += p; tg += g;
      filas.push({ nombre: o.nombre, px: F.datos.length, png: p, gz: g });
      console.log('[' + (i + 1) + '] ' + o.nombre + '  PNG ' + (p / 1048576).toFixed(2) +
        ' MB  ·  float32+gzip ' + (g / 1048576).toFixed(2) + ' MB  ·  ×' + (g / p).toFixed(2));
    });
  });
}, Promise.resolve()).then(function () {
  var razones = filas.map(function (f) { return f.gz / f.png; }).sort(function (a, c) { return a - c; });
  console.log('\nbanco: ' + filas.length + ' objetos a ' + CFG.salida + ' px');
  console.log('PNG-16 asinh16 : ' + (tp / 1048576).toFixed(1) + ' MB  (' +
    (tp / filas.reduce(function (s, f) { return s + f.px; }, 0)).toFixed(2) + ' bytes/px)');
  console.log('float32 + gzip : ' + (tg / 1048576).toFixed(1) + ' MB  (' +
    (tg / filas.reduce(function (s, f) { return s + f.px; }, 0)).toFixed(2) + ' bytes/px)');
  console.log('razón float32/PNG: ×' + (tg / tp).toFixed(2) +
    '  (por objeto: mín ×' + razones[0].toFixed(2) + ', mediana ×' +
    razones[razones.length >> 1].toFixed(2) + ', máx ×' + razones[razones.length - 1].toFixed(2) + ')');
  /* Extrapolación a las filas aptas del catálogo, que es la cifra con la que
     L2.4 se juzgará: regla de tres sobre la media por objeto del banco. */
  var aptas = b.catalogo.filter(function (f) { return BANCO.apta(f); }).length;
  console.log('extrapolado a las ' + aptas + ' filas aptas: PNG ' +
    (tp / filas.length * aptas / 1073741824).toFixed(2) + ' GB  ·  float32+gzip ' +
    (tg / filas.length * aptas / 1073741824).toFixed(2) + ' GB');
}).catch(function (e) { console.error('FALLO: ' + (e && e.stack || e)); process.exit(2); });
