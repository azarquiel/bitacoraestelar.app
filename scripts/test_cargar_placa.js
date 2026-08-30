#!/usr/bin/env node
/* Test de cargarPlaca (bitacora-gaia-render.js): la carga de una placa como
   fuente única del render Y el simulador (antes vivía copiada byte a byte en
   bitacora-ocular.js).

   El contrato es su política de fallo: NUNCA rechaza. Resuelve la imagen si
   carga y null si no, para que el llamador decida el respaldo (DSS del ESO,
   aviso…) en vez de dejar el lienzo negro.

   Sin dependencias: node scripts/test_cargar_placa.js */
'use strict';

global.window = {};
// Image postiza: guarda la última instancia para disparar onload/onerror.
var ultima = null;
global.Image = function () { ultima = this; this.crossOrigin = null; };
Object.defineProperty(global.Image.prototype, 'src', {
  set: function (u) { this.url = u; }
});
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok  ' + etiqueta); }
  else { fallos++; console.error('  FALLA  ' + etiqueta); }
}

console.log('cargarPlaca:');
ok(typeof R.cargarPlaca === 'function', 'está exportada (el simulador la usa por window)');

var p1 = R.cargarPlaca('http://placa/buena');
ok(ultima && ultima.url === 'http://placa/buena', 'pide la URL que le dan');
ok(ultima && ultima.crossOrigin === 'anonymous', 'pide CORS anónimo (sin él, getImageData muere)');
var im1 = ultima;
im1.onload();

var p2 = R.cargarPlaca('http://placa/caida');
var im2 = ultima;
im2.onerror();

Promise.all([p1, p2]).then(function (res) {
  ok(res[0] === im1, 'si carga, resuelve la imagen');
  ok(res[1] === null, 'si falla, resuelve null (NUNCA rechaza: el respaldo decide)');
  console.log(fallos === 0 ? '\nTodo correcto.' : '\n' + fallos + ' fallo(s).');
  process.exit(fallos === 0 ? 0 : 1);
});
