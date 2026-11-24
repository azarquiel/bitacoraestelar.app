#!/usr/bin/env node
/* #621 · El arnés cuenta como catálogo solo las filas con el criterio de #619
   (astrometría 5/6p y BP−RP), sin el peso de #611. Prerregistro: ADR 0039,
   «`c` y el catálogo cuentan lo mismo (#621)», AC2.

   Atribución, anillo ≤1 (0,5-1 r_h), V 17,07-18,07: |cat/num·c − 1| ≤ 2σ.
   Caso malo (AGENTS.md, prerregistros): --criterio 0, todas las filas sin
   peso, el 2,79 de #595; el listón tiene que rechazarlo. Corre el arnés dos
   veces (~20 s).

   node scripts/test_criterio_recuento.js */
'use strict';
var path = require('path');
var spawn = require('child_process').spawnSync;

var fallos = 0;
function ok(cond, msg) {
  if (cond) console.log('  ok   ' + msg);
  else { fallos++; console.error('  FALLA ' + msg); }
}

function atribucion(extra) {
  var r = spawn(process.execPath, [path.join(__dirname, 'harness_fusion_blending.js'), '--atribucion'].concat(extra),
                { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error('el arnés falla (' + extra.join(' ') + '): ' + r.stderr);
  var bloque = r.stdout.slice(r.stdout.indexOf('\n≤1 r_h'));
  var linea = bloque.split('\n').filter(function (l) { return /^17\.07–18\.07 /.test(l); })[0];
  if (!linea) throw new Error('el arnés ya no imprime ≤1, 17.07–18.07 en la atribución (' + extra.join(' ') + ')');
  var f = linea.trim().split(/\s+/);
  return { q: +f[3], sd: +f[4] };
}

console.log('Atribución ≤1, V 17,07-18,07: cat/num·c contra 1 ± 2σ');
var con = atribucion([]), sin = atribucion(['--criterio', '0']);
console.log('       con el criterio: ' + con.q + ' ± ' + con.sd + '   todas las filas (#595): ' + sin.q + ' ± ' + sin.sd);
ok(Math.abs(con.q - 1) <= 2 * con.sd, 'con el criterio pasa el listón');
ok(Math.abs(sin.q - 1) > 2 * sin.sd, 'caso malo (--criterio 0): el listón lo rechaza');
ok(Math.abs(sin.q - 2.79) < 0.01, '--criterio 0 reproduce el 2,79 de #595');

if (fallos) { console.error('\n' + fallos + ' fallo(s)'); process.exit(1); }
console.log('\nTodo verde.');
