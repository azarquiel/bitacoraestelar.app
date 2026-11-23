#!/usr/bin/env node
/* #611 · El velo no cuenta el flujo de las filas mezcladas del núcleo.

   Criterio externo (AC1): fuente única según Fabricius et al. 2021 (A&A 649,
   A5, §3.3), la misma fuente que ancla gaiaCrowdingK (#595):
     ruwe < 1,4  y  ipd_frac_multi_peak ≤ 2  y  ipd_gof_harmonic_amplitude < 0,1.
   Lo que no lo cumple es mezcla. Sin ruwe (sin astrometría 5/6p) también.

     A  El predicado tiene los umbrales publicados, con sus bordes.
     B  El sidecar cubre el fixture fila a fila (mismo ra,dec en texto).
     C  Firma radial: las mezclas se concentran en el núcleo. Caso malo: un
        criterio que marcase todo (o nada) por igual no separa núcleo de halo.
     D  Arnés: R2v en ≤1 r_h pasa con el criterio y, sin él, el listón lo
        rechaza (corre el arnés dos veces, ~18 s).

   node scripts/test_filas_mezcladas.js */
'use strict';
var fs = require('fs'), path = require('path');
var M = require('./mezcla_gaia.js');

var fallos = 0;
function ok(cond, msg) {
  if (cond) console.log('  ok   ' + msg);
  else { fallos++; console.error('  FALLA ' + msg); }
}

console.log('A · umbrales de Fabricius et al. 2021, §3.3');
ok(!M.esMezcla(1.0, 0, 0.05), 'limpia: ruwe 1,0, ipd 0, amplitud 0,05');
ok(!M.esMezcla(1.39, 2, 0.099), 'bordes por dentro: ruwe 1,39, ipd 2, amplitud 0,099');
ok(M.esMezcla(1.4, 0, 0), 'ruwe 1,4 es mezcla (el filtro pide < 1,4)');
ok(M.esMezcla(1.0, 3, 0), 'ipd_frac_multi_peak 3 es mezcla (el filtro pide ≤ 2)');
ok(M.esMezcla(1.0, 0, 0.1), 'amplitud 0,1 es mezcla (el filtro pide < 0,1)');
ok(M.esMezcla(null, 0, 0), 'sin ruwe (solución 2p) es mezcla');

console.log('B · el sidecar cubre el fixture');
var VAL = path.join(__dirname, '../simulador_ocular/docs/validacion');
var fixture = fs.readFileSync(path.join(VAL, 'm13_gaia_dr3.csv'), 'utf8').trim().split('\n').slice(1)
  .map(function (l) { var c = l.split(','); return { clave: c[0] + ',' + c[1], ra: +c[0], dec: +c[1] }; });
var mezcla = M.leer(path.join(VAL, 'm13_gaia_dr3_mezcla.csv'));
ok(mezcla.size === fixture.length, 'mismo número de filas: ' + mezcla.size + ' de ' + fixture.length);
ok(fixture.every(function (f) { return mezcla.has(f.clave); }), 'cada fila del fixture tiene su indicador');

console.log('C · las mezclas se concentran en el núcleo');
/* Guardia del fixture, no validación: los listones 90 % / 15 % se leyeron de
   este mismo M13 (99,8 % / 6,2 %). Centro y r_h de producción, como el arnés. */
global.window = {};
require('../simulador_ocular/resources/js/globulares-datos.js');
var e = global.window.BITACORA_GLOBULARES.filter(function (f) { return f[0] === 'NGC 6205'; })[0];
var RA0 = e[2], DE0 = e[3], RH = e[5] * 60, cos0 = Math.cos(DE0 * Math.PI / 180);
var nucleo = [0, 0], halo = [0, 0];
fixture.forEach(function (f) {
  var r = Math.hypot((f.ra - RA0) * cos0, f.dec - DE0) * 3600 / RH;
  var t = r <= 0.5 ? nucleo : r > 4 && r <= 8 ? halo : null;
  if (!t) return;
  t[0]++; if (mezcla.get(f.clave)) t[1]++;
});
var fN = nucleo[1] / nucleo[0], fH = halo[1] / halo[0];
console.log('       ≤0,5 r_h: ' + (100 * fN).toFixed(1) + ' %   4-8 r_h: ' + (100 * fH).toFixed(1) + ' %');
ok(fN > 0.9, 'en ≤0,5 r_h más del 90 % son mezcla');
ok(fH < 0.15, 'en 4-8 r_h menos del 15 % son mezcla');

console.log('D · arnés de #577: R2v en ≤1 r_h con las mezclas pesadas (AC3, listón de §0 quater sin mover)');
/* Caso malo (AGENTS.md, prerregistros): --mezcla 0, el doble conteo de #595,
   da 1,267 con 2σ = 0,005 y el listón lo rechaza. Con el criterio: 1,002. */
var spawn = require('child_process').spawnSync;
function r2v(extra) {
  var out = spawn(process.execPath, [path.join(__dirname, 'harness_fusion_blending.js')].concat(extra),
                  { encoding: 'utf8', maxBuffer: 1 << 26 }).stdout;
  var tramo = out.slice(out.indexOf('Criterio 3, MEDIDA'));
  var linea = tramo.split('\n').filter(function (l) { return /^≤1 /.test(l); })[0];
  if (!linea) throw new Error('el arnés ya no imprime la fila ≤1 de «Criterio 3, MEDIDA» (' + extra.join(' ') + ')');
  var f = linea.trim().split(/\s+/);
  return { R2v: +f[1], sd: +f[2] };
}
var con = r2v([]), sin = r2v(['--mezcla', '0']);
console.log('       con mezclas pesadas: ' + con.R2v + ' ± ' + con.sd + '   sin (#595): ' + sin.R2v);
ok(Math.abs(con.R2v - 1) <= 2 * con.sd, 'con el criterio, |R2v − 1| ≤ 2σ en ≤1');
ok(Math.abs(sin.R2v - 1) > 2 * sin.sd, 'caso malo (--mezcla 0): el listón lo rechaza');

if (fallos) { console.error('\n' + fallos + ' fallo(s)'); process.exit(1); }
console.log('\nTodo verde.');
