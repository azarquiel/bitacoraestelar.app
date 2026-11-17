#!/usr/bin/env node
/* #575 · El corte de pertenencia de M13 (m13_vb21_campo.csv) separa campo de verdad.

   El campo es uniforme a la escala de r_t; la densidad de lo que el corte
   llama «campo» tiene que salir plana en r. Listón: en 0-2 r_h, como mucho el
   doble que en 4-8 r_h. El caso malo, memberprob < 0,5 sin exigir astrometría
   limpia, da ~60 veces (1 145 filas del fixture en 0-2 r_h, medido al escribir
   el generador): este listón lo rechaza (AGENTS.md, prerregistros).

   Además, la estrella más brillante del fixture en 4-8 r_h es de campo: es la
   que el ADR 0039 señaló (V = 10,6) como luz que no es del cúmulo.

   Regenerar: python3 scripts/gen_m13_pertenencia.py
   node scripts/test_pertenencia_m13.js */
'use strict';

global.window = {};
require('../simulador_ocular/resources/js/globulares-datos.js');
var fs = require('fs'), path = require('path');
var V = path.join(__dirname, '../simulador_ocular/docs/validacion/');

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) console.log('  ok   ' + etiqueta);
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function filas(f) {
  return fs.readFileSync(V + f, 'utf8').trim().split('\n').slice(1).map(function (l) { return l.split(','); });
}

var e = global.window.BITACORA_GLOBULARES.filter(function (f) { return f[0] === 'NGC 6205'; })[0];
var ra0 = e[2], dec0 = e[3], rh = e[5], cos0 = Math.cos(dec0 * Math.PI / 180);
function rRh(c) { return Math.hypot((+c[0] - ra0) * cos0, +c[1] - dec0) * 60 / rh; }

var campo = filas('m13_vb21_campo.csv');
var clave = new Set(campo.map(function (c) { return c[0] + ',' + c[1]; }));
function densidad(r0, r1) {
  var n = campo.filter(function (c) { var r = rRh(c); return r > r0 && r <= r1; }).length;
  return { n: n, d: n / (Math.PI * (r1 * r1 - r0 * r0) * rh * rh) };
}
var dentro = densidad(0, 2), halo = densidad(4, 8);
console.log('campo/arcmin²: 0-2 r_h ' + dentro.d.toFixed(2) + ' (' + dentro.n + '), 4-8 r_h ' +
  halo.d.toFixed(2) + ' (' + halo.n + ')');
ok(halo.n > 50, 'hay campo en el halo (no vacuo)');
ok(dentro.d <= 2 * halo.d, 'densidad de campo plana: 0-2 r_h <= 2 × 4-8 r_h');

var brillante = null;
filas('m13_gaia_dr3.csv').forEach(function (c) {
  var r = rRh(c);
  if (r > 4 && r <= 8 && (!brillante || +c[2] < +brillante[2])) brillante = c;
});
ok(clave.has(brillante[0] + ',' + brillante[1]), 'la más brillante de 4-8 r_h (G ' + brillante[2] + ') es de campo');

if (fallos) { console.error(fallos + ' fallos'); process.exit(1); }
console.log('test_pertenencia_m13: todo ok');
