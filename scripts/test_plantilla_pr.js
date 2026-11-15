#!/usr/bin/env node
/* Test del validador de la plantilla de PR (scripts/plantilla_pr.js).

   El fallo que fija: una PR creada con `gh pr create --fill` o con la plantilla
   sin tocar pasaba sin decir si dejó un ADR o una lección. El validador solo
   acepta las dos casillas marcadas y contestadas.

   Sin dependencias:  node scripts/test_plantilla_pr.js  */
'use strict';

var fs = require('fs'), path = require('path');
var validar = require('./plantilla_pr.js').validar;
var plantilla = fs.readFileSync(path.join(__dirname, '..', '.github', 'pull_request_template.md'), 'utf8');

var fallos = 0;
function eq(a, b, etiqueta) {
  if (a === b) { console.log('  ok   ' + etiqueta + ' = ' + a); }
  else { fallos++; console.error('  FALLA ' + etiqueta + ': ' + a + ' != ' + b); }
}

console.log('1. Lo que no debe pasar');
eq(validar('').length, 2, 'cuerpo vacío: faltan las dos');
eq(validar(plantilla).length, 2, 'plantilla sin tocar: las dos sin marcar');
eq(validar('docs(adr): fase 1\n\n- Borra duplicados.').length, 2, 'salida de --fill: sin casillas');
eq(validar(plantilla.replace(/- \[ \] \*\*ADR:\*\*/, '- [x] **ADR:**')).length, 2,
   'ADR marcada pero solo con el comentario: sigue sin respuesta');

console.log('2. Lo que sí');
var completa = plantilla
  .replace(/- \[ \] \*\*ADR:\*\* <!--.*-->/, '- [x] **ADR:** simulador_ocular/docs/adr/0038-algo.md')
  .replace(/- \[ \] \*\*Lección:\*\* <!--.*-->/, '- [X] **Lección:** no aplica: solo documentación');
eq(validar(completa).length, 0, 'las dos marcadas y contestadas');

if (fallos) { console.log('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nTodo verde.');
