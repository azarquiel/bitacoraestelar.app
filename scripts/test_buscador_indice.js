/* Test del resolvedor de texto del buscador del mapa
   (mapa/js/via-lactea-buscador-indice.js). Cubre normalización, detección de
   designaciones de catálogo y coincidencia exacta/parcial sobre un índice.
   Sin framework:  node scripts/test_buscador_indice.js */

'use strict';

var VLB = require('../mapa/js/via-lactea-buscador-indice.js');

var fallos = 0;
function eq(a, b, et) {
  if (a === b) { console.log('  ok   ' + et); }
  else { fallos++; console.log('  FALLA ' + et + '\n         esperado ' + JSON.stringify(b) + '\n         obtenido ' + JSON.stringify(a)); }
}

console.log('normalizar (minúsculas, sin acentos ni signos):');
eq(VLB.normalizar('M 13'), 'm13', '"M 13" -> "m13"');
eq(VLB.normalizar('m13'), 'm13', '"m13" -> "m13"');
eq(VLB.normalizar('M13'), 'm13', '"M13" -> "m13"');
eq(VLB.normalizar('NGC 6826'), 'ngc6826', 'quita el espacio');
eq(VLB.normalizar('Régulo'), 'regulo', 'quita el acento');
eq(VLB.normalizar(''), '', 'cadena vacía');
eq(VLB.normalizar(null), '', 'null -> ""');

console.log('esDesignacionCatalogo (solo casan exacto):');
eq(VLB.esDesignacionCatalogo('M1'), true, 'M1');
eq(VLB.esDesignacionCatalogo('Messier 30'), true, 'Messier 30');
eq(VLB.esDesignacionCatalogo('NGC 6826'), true, 'NGC 6826');
eq(VLB.esDesignacionCatalogo('IC 1396'), true, 'IC 1396');
eq(VLB.esDesignacionCatalogo('cangrejo'), false, 'nombre descriptivo');
eq(VLB.esDesignacionCatalogo('M'), false, 'sin número');
eq(VLB.esDesignacionCatalogo(''), false, 'vacío');

console.log('construir(...).exacto / .parcial:');
var objetos = [
  { id: 'm1',   label: 'M1',   name: 'Nebulosa del Cangrejo' },
  { id: 'm101', label: 'M101', name: 'Galaxia del Molinete' },
  { id: 'm13',  label: 'M13',  name: 'Gran Cúmulo de Hércules' }
];
var idx = VLB.construir(objetos);

// exacto: por id / etiqueta / nombre, normalizados; y sin falsos positivos.
eq(idx.exacto('M1').id, 'm1', 'exacto por etiqueta "M1"');
eq(idx.exacto('m 1').id, 'm1', 'exacto tolera espacios/caja');
eq(idx.exacto('Nebulosa del Cangrejo').id, 'm1', 'exacto por nombre completo');
eq(idx.exacto('M101').id, 'm101', 'exacto "M101" no colisiona con "M1"');
eq(idx.exacto('cangrejo'), null, 'exacto NO hace parcial');
eq(idx.exacto(''), null, 'exacto vacío -> null');

// parcial: subcadena dentro del nombre descriptivo.
eq(idx.parcial('cangrejo').id, 'm1', 'parcial "cangrejo" -> M1');
eq(idx.parcial('molinete').id, 'm101', 'parcial "molinete" -> M101');
eq(idx.parcial('hercules').id, 'm13', 'parcial sin acento -> M13');
eq(idx.parcial('inexistente'), null, 'parcial sin coincidencia -> null');

// construir sobre lista vacía o ausente no revienta.
eq(VLB.construir([]).exacto('m1'), null, 'índice vacío -> null');
eq(VLB.construir().exacto('m1'), null, 'construir() sin argumento -> null');

if (fallos) { console.log('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nTodo verde.');
