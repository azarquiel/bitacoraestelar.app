#!/usr/bin/env node
/* Las 12 observaciones de campo de H2c frente al corte de fondo cero de Crumey
   (#341). Tabula por fila la pupila de salida, el SB0T que calcula magLimite
   hoy, el d0 de la Ec. 70 y si la fila cae bajo el corte (d < d0). Imprime
   además el margen de H2c con seis decimales: es la foto que el prerregistro
   congela para que #342 compruebe que el corte no lo mueve.

   Sin ley nueva: SBe y margen salen de campo_h2c.js (ctxFotometrico de
   producción); d0 de harness_crumey.js. Solo SB0T se escribe aquí, porque
   magLimite no lo expone: es la Ec. 5 de bitacora-gaia-render.js con su clamp.

   Autocomprobación: con p = 7 mm y Ft = 1/T, d < d0 equivale a que el cielo en
   el ojo (SBe) pase de 25,08, el fondo nulo. Si alguna fila lo contradice, el
   script sale con código 1.

   node scripts/tabla_corte_h2c.js */
'use strict';
var fs = require('fs');
var campo = require('./campo_h2c.js');
var crumey = require('./harness_crumey.js');

var SB_NULO = 12.58 - 2.5 * Math.log10(1e-5); // 25,08 mag/arcsec² (ADR-0030, Q2)

function sb0tActual(D, M, sqm, T) {
  return Math.min(27, Math.max(sqm, sqm + 5 * Math.log10(7.5 * M / (D * Math.sqrt(T)))));
}
function coma(x, n) { return x.toFixed(n).replace('.', ','); }
function c2(x) { return coma(x, 2); }

var filas = fs.readFileSync(campo.CSV, 'utf8').trim().split('\n').slice(1)
  .filter(function (l) { return l.trim(); });
var fallos = 0;
console.log('| # | objeto | D (mm) | M | d (mm) | sqm | T | SBe | SB0T | d0 (mm) | ¿bajo el corte? | resultado | margen (dex) |');
console.log('|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---:|');
filas.forEach(function (l, i) {
  var c = l.split(/[;,]/);
  var D = +c[1], M = +c[2], sqm = +c[3], seeing = +c[4], T = +c[5], res = c[6].trim();
  var m = campo.margenDe(campo.galDe(c[0]), D, M, sqm, seeing, T);
  var d0 = crumey.crumeyD0(7, crumey.luminanciaDeMu(sqm) * T);
  var bajo = m.pupila < d0;
  if (bajo !== (m.SBe > SB_NULO)) {
    fallos++;
    console.error('fila ' + (i + 1) + ': d < d0 = ' + bajo + ' pero SBe = ' + m.SBe.toFixed(4));
  }
  console.log('| ' + [i + 1, c[0], D, M, c2(m.pupila), c2(sqm), c2(T), c2(m.SBe),
    c2(sb0tActual(D, M, sqm, T)), c2(d0), bajo ? '**sí**' : 'no', res,
    (m.margen >= 0 ? '+' : '−') + coma(Math.abs(m.margen), 6)].join(' | ') + ' |');
});
if (filas.length !== 12) { fallos++; console.error('se esperaban 12 filas, hay ' + filas.length); }
if (fallos) process.exit(1);
console.log('\nautocomprobación: d < d0 ⇔ SBe > ' + SB_NULO.toFixed(2) + ' en las ' + filas.length + ' filas');
