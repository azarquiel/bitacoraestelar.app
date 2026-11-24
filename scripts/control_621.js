#!/usr/bin/env node
/* #621 · ¿El criterio de recuento de #619 (5/6p + BP−RP) reproduce la Tabla
   A.1 de Fabricius fuera de M13? Prerregistro: ADR 0039, «`c` y el catálogo
   cuentan lo mismo (#621)», AC4. Mismo método que spike_617_exceso.js --619.

   node scripts/control_621.js <dir con los .zpt de MAST>
   (hlsp_acsggct_hst_acs-wfc_<ngc>_r.rdviq.cal.adj.zpt, MAST /pub/hlsp/acsggct/<ngc>/;
   Gaia de scripts/gen_gaia_a1_621.py) */
'use strict';
var fs = require('fs'), path = require('path');
var F = require('./flujo_hst.js'), X = require('./exceso_617.js'), M = require('./mezcla_gaia.js');
global.window = {};
require('../simulador_ocular/resources/js/globulares-datos.js');

var VAL = path.join(__dirname, '../simulador_ocular/docs/validacion');
var A1 = {};
fs.readFileSync(path.join(VAL, 'fabricius2021_tabla_a1.csv'), 'utf8').trim().split('\n').slice(1).forEach(function (l) {
  var c = l.split(','); A1[c[0] + ',' + c[1]] = c[7] === '' ? null : +c[7];   // columna G16_18
});
var CUMULOS = [['ngc6752', 'NGC 6752', 'NGC6752'], ['ngc7099', 'NGC 7099', 'NGC7099']];
function f(x, d) { return x.toFixed(d === undefined ? 1 : d).replace('.', ','); }

console.log('#621 · control del criterio 5/6p + BP−RP fuera de M13 (prerregistro ADR 0039, AC4)');
console.log('Región 0,5-2,2′ ∩ ACS, G 16-18, contra la fila «out» de la Tabla A.1 (±10 puntos)');
var filas = CUMULOS.map(function (k) {
  var e = global.window.BITACORA_GLOBULARES.filter(function (g) { return g[0] === k[1]; })[0];
  var RA0 = e[2], DE0 = e[3], COS0 = Math.cos(DE0 * Math.PI / 180);
  function plano(ra, dec) { return { x: (ra - RA0) * COS0 * 3600, y: (dec - DE0) * 3600 }; }

  var lineas = fs.readFileSync(path.join(process.argv[2], 'hlsp_acsggct_hst_acs-wfc_' + k[0] + '_r.rdviq.cal.adj.zpt'), 'utf8').split('\n');
  var cab = lineas[0].trim().split(/\s+/);
  var iV = cab.indexOf('Vvega'), iI = cab.indexOf('Ivega'), iRA = cab.indexOf('RA'), iDE = cab.indexOf('Dec');
  if ([iV, iI, iRA, iDE].some(function (i) { return i < 0; })) throw new Error('cabecera inesperada: ' + cab.join(' '));
  var hst = [];
  lineas.slice(1).forEach(function (l) {
    var c = l.trim().split(/\s+/);
    if (c.length < cab.length) return;
    var p = plano(+c[iRA], +c[iDE]); p.v = +c[iV]; p.i = +c[iI];
    hst.push(p);
  });

  var gaia = fs.readFileSync(path.join(VAL, k[0] + '_gaia_dr3_621.csv'), 'utf8').trim().split('\n').slice(1).map(function (l) {
    var c = l.split(','), p = plano(+c[0], +c[1]);
    p.g = +c[2]; p.color = c[3] !== ''; p.ruwe = c[4] === '' ? null : +c[4];
    p.mezcla = M.esMezcla(p.ruwe, +c[5], +c[6]);
    return p;
  });

  // Alineado y G de HST como #614: control = filas que pasan el filtro de §3.3.
  var control = gaia.filter(function (p) { return p.g >= 16.5 && p.g <= 18.5 && !p.mezcla; });
  var d = F.alinear(control, hst.filter(function (s) { return s.v < 20; }));
  hst.forEach(function (s) { s.x += d.dx; s.y += d.dy; });
  var idx = F.indice(hst, 0.1), pares = [];
  control.forEach(function (p) { var s = F.masCercana(p, idx, 0.1); if (s) pares.push({ g: p.g, v: s.v, i: s.i }); });
  var t = F.ajustarG(pares);
  hst.forEach(function (s) { s.g = t.g(s.v, s.i); });
  // Control del ajuste (informativo, #614): mediana de G_Gaia − G_HST de los pares, ≈ 0.
  var dg = []; control.forEach(function (p) { var s = F.masCercana(p, idx, 0.1); if (s) dg.push(p.g - s.g); });

  var H = X.huella(hst, 4, 3);
  function cuenta(r0, r1) {
    var en = function (p) { var r = Math.hypot(p.x, p.y); return r > r0 && r <= r1 && p.g >= 16 && p.g < 18 && H.dentro(p); };
    var g = gaia.filter(en);
    return { nHst: hst.filter(en).length, nTodas: g.length, nCrit: g.filter(X.recuperada).length };
  }
  var out = cuenta(30, 132), core = cuenta(0, 30);
  console.log('\n' + k[1] + ': HST ' + hst.length + ' estrellas, Gaia ' + gaia.length + ' filas; alineado dx = ' + f(d.dx, 3) +
              '″, dy = ' + f(d.dy, 3) + '″; G − V sobre ' + pares.length + ' pares, mediana G_Gaia − G_HST = ' + f(F.mediana(dg), 3));
  console.log('  out (Tabla A.1 ' + A1[k[2] + ',out'] + ' %): N_HST ' + out.nHst + '  todas ' + out.nTodas + ' = ' + f(100 * out.nTodas / out.nHst) +
              ' %  criterio ' + out.nCrit + ' = ' + f(100 * out.nCrit / out.nHst) + ' %');
  console.log('  core, sin voto (Tabla A.1 ' + A1[k[2] + ',core'] + ' %): N_HST ' + core.nHst + '  todas ' + f(100 * core.nTodas / core.nHst) +
              ' %  criterio ' + f(100 * core.nCrit / core.nHst) + ' %');
  out.a1 = A1[k[2] + ',out']; out.nombre = k[1];
  return out;
});

var v = X.controlFuera(filas);
console.log('');
v.votos.forEach(function (vt, i) {
  console.log(filas[i].nombre + ': ' + (!vt.potencia ? 'sin potencia (todas las filas dentro de ±10), no vota' : vt.vale ? 'con potencia, el criterio VALE' : 'con potencia, el criterio NO VALE'));
});
console.log('Veredicto AC4: el criterio ' + ({ vale: 'VALE fuera de M13', 'no vale': 'NO VALE fuera de M13: no pasa a producción',
  'sin veredicto': 'queda sin veredicto (ningún cúmulo con potencia): no pasa a producción' })[v.lectura]);
