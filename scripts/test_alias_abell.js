#!/usr/bin/env node
/* Canonicalización «Abell N» → «PN A66 N» antes de Sesame: sin ella, SIMBAD
   resuelve «Abell 12» como el cúmulo de galaxias ACO 12 (catálogo de 1958/89)
   y el observador se lleva las coordenadas del objeto equivocado. Solo N ≤ 86
   (los Abell de planetarias, 1966); el cúmulo homónimo se pide como «ACO N».

   Sin dependencias:  node scripts/test_alias_abell.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-base.js');
var B = global.window.BitacoraBase;

var fallos = 0;
function ok(c, t) { console.log('  ' + (c ? 'ok  ' : 'FALLO') + '  ' + t); if (!c) fallos++; }

console.log('BitacoraBase.aliasAbell — nombre coloquial → designación inequívoca:');
ok(typeof B.aliasAbell === 'function', 'existe la función');
var f = B.aliasAbell || function () { return ''; };
ok(f('Abell 12') === 'PN A66 12', 'Abell 12 → PN A66 12 (la planetaria, no ACO 12)');
ok(f('abell12') === 'PN A66 12', 'sin espacio y en minúsculas también');
ok(f('A 21') === 'PN A66 21', 'la forma corta «A 21» (Medusa)');
ok(f('Abell 086') === 'PN A66 86', 'ceros a la izquierda y el último del catálogo (86)');
ok(f('Abell 85') === 'PN A66 85', 'Abell 85 es la PN: el cúmulo homónimo se pide como ACO 85');
ok(f('Abell 87') === '', 'Abell 87 no existe como planetaria: pasa tal cual a Sesame');
ok(f('Abell 2151') === '', 'un cúmulo fuera de rango (Hércules) no se toca');
ok(f('ACO 12') === '', 'ACO 12 pide el cúmulo explícitamente: no se toca');
ok(f('PN A66 12') === '', 'la forma ya canónica no se reescribe');
ok(f('M57') === '' && f('Albireo') === '', 'nombres ajenos no se tocan');
ok(f('') === '' && f(null) === '', 'entrada vacía no revienta');

if (fallos) { console.error(fallos + ' fallo(s).'); process.exit(1); }
console.log('todo en orden.');
