#!/usr/bin/env node
/* Valida que el cuerpo de una PR trae completada la sección «Conocimiento» de
   .github/pull_request_template.md: las casillas ADR y Lección marcadas, y con
   una respuesta escrita detrás (una ruta o «no aplica: motivo»).

   Comprueba que se contestó, no que la respuesta sea cierta: eso sigue siendo
   cosa de quien revisa.

   Uso:  PR_BODY="$(cat cuerpo.md)" node scripts/plantilla_pr.js
         node scripts/plantilla_pr.js cuerpo.md
   Sale con 1 y dice qué falta si no pasa. */
'use strict';

var CASILLAS = ['ADR', 'Lección'];

function validar(cuerpo) {
  var texto = String(cuerpo || '').replace(/<!--[\s\S]*?-->/g, '');
  return CASILLAS.map(function (nombre) {
    var re = new RegExp('^\\s*[-*] \\[([ xX])\\] \\*\\*' + nombre + ':\\*\\*(.*)$', 'm');
    var m = texto.match(re);
    if (!m) return 'falta la casilla «' + nombre + '» de la plantilla';
    if (m[1] === ' ') return 'la casilla «' + nombre + '» está sin marcar';
    if (!m[2].trim()) return 'la casilla «' + nombre + '» no dice nada: pon una ruta o «no aplica: motivo»';
    return null;
  }).filter(Boolean);
}

if (require.main === module) {
  var cuerpo = process.argv[2]
    ? require('fs').readFileSync(process.argv[2], 'utf8')
    : process.env.PR_BODY;
  var errores = validar(cuerpo);
  if (errores.length) {
    errores.forEach(function (e) { console.error('::error::Plantilla de PR: ' + e); });
    process.exit(1);
  }
  console.log('Plantilla de PR completa.');
}

module.exports = { validar: validar };
