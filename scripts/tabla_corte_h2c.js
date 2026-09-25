#!/usr/bin/env node
/* Las 12 observaciones de campo de H2c frente al corte de fondo cero de Crumey
   (#341). Tabula por fila la pupila de salida, el SB0T que calcula magLimite
   hoy, el d0 de la Ec. 70 y si la fila cae bajo el corte (d < d0). Imprime
   además el margen de H2c con seis decimales: es la foto que el prerregistro
   congela para que #342 compruebe que el corte no lo mueve.

   Sin ley propia (ADR 0008): SBe y margen salen de campo_h2c.js
   (ctxFotometrico de producción), SB0T de fondoMagLimite, y d0 y el fondo
   nulo de harness_crumey.js.

   Autocomprobación: con p = 7 mm y Ft = 1/T, d < d0 equivale a que el cielo en
   el ojo (SBe) pase del fondo nulo. Si alguna fila lo contradice, o no hay 12
   filas con transmisión, el script sale con código 1.

   node scripts/tabla_corte_h2c.js */
'use strict';
var campo = require('./campo_h2c.js');
var crumey = require('./harness_crumey.js');
var R = global.window.BitacoraGaiaRender;

function coma(x, n) { return x.toFixed(n).replace('.', ','); }
function c2(x) { return coma(x, 2); }

var filas = campo.leerFilas();
var fallos = 0;
console.log('| # | objeto | D (mm) | M | d (mm) | sqm | T | SBe | SB0T | d0 (mm) | ¿bajo el corte? | resultado | margen (dex) |');
console.log('|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---:|');
filas.forEach(function (c, i) {
  var D = c[1], M = c[2], sqm = c[3], T = c[5];
  if (!(T > 0)) { fallos++; console.error('fila ' + (i + 1) + ': sin transmisión'); return; }
  var m = campo.margenDe(campo.galDe(c[0]), D, M, sqm, c[4], T);
  var sb0t = R.fondoMagLimite({ apertura: D, aumentos: M, sqm: sqm, transmision: T });
  var d0 = crumey.crumeyD0(7, crumey.luminanciaDeMu(sqm) * T);
  var bajo = m.pupila < d0;
  if (bajo !== (crumey.luminanciaDeMu(m.SBe) < crumey.B_NULO)) {
    fallos++;
    console.error('fila ' + (i + 1) + ': d < d0 = ' + bajo + ' pero SBe = ' + m.SBe.toFixed(4));
  }
  console.log('| ' + [i + 1, c[0], D, M, c2(m.pupila), c2(sqm), c2(T), c2(m.SBe),
    c2(sb0t), c2(d0), bajo ? '**sí**' : 'no', c[6],
    (m.margen >= 0 ? '+' : '−') + coma(Math.abs(m.margen), 6)].join(' | ') + ' |');
});
if (filas.length !== 12) { fallos++; console.error('se esperaban 12 filas, hay ' + filas.length); }
if (fallos) process.exit(1);
console.log('\nautocomprobación: d < d0 ⇔ SBe más oscuro que el fondo nulo en las ' + filas.length + ' filas');
