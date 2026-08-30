#!/usr/bin/env node
/* Validación held-out de Φ″ (ADR 0022, #113). Una única ejecución contra los
   13 casos congelados en simulador_ocular/docs/adr/0022-rotura-nucleo-heldout/
   prerregistro.md §3-4. Nada se reimplementa (ADR 0008): usa medirPhiSegunda
   y U″ del ADR 0018 tal cual.

     node scripts/veredicto_heldout_phi2.js */
'use strict';

var C18 = require('./veredicto_rotura_nucleo_contraste.js');

/* [id NGC, D mm, aumento, clasificación] — clasificación 'sin dato' fuera de
   la tabla: no entra en ningún listón. Fuente: prerregistro.md §3. */
var CASOS = [
  ['NGC 5272', 200, 58, 'nebuloso'], ['NGC 5272', 200, 225, 'intermedio'],
  ['NGC 6121', 458, 70, 'resuelto'], ['NGC 6121', 458, 99, 'resuelto'],
  ['NGC 6121', 458, 156, 'resuelto'], ['NGC 6121', 458, 219, 'resuelto'],
  ['NGC 6121', 458, 273, 'resuelto'], ['NGC 6121', 458, 486, 'resuelto'],
  ['NGC 6254', 458, 70, 'nebuloso'], ['NGC 6254', 458, 99, 'nebuloso'],
  ['NGC 6254', 458, 156, 'intermedio'], ['NGC 6254', 458, 273, 'resuelto'],
  ['NGC 6254', 458, 486, 'resuelto'],
  ['NGC 6218', 458, 70, 'intermedio'], ['NGC 6218', 458, 156, 'intermedio'],
  ['NGC 6218', 458, 273, 'resuelto'], ['NGC 6218', 458, 486, 'resuelto'],
  ['NGC 5904', 458, 70, 'resuelto'], ['NGC 5904', 458, 98, 'resuelto'],
  ['NGC 5904', 458, 154, 'resuelto'], ['NGC 5904', 458, 216, 'resuelto'],
  ['NGC 5904', 458, 270, 'resuelto'], ['NGC 5904', 458, 480, 'resuelto'],
  ['NGC 6333', 458, 70, 'nebuloso'], ['NGC 6333', 458, 99, 'resuelto'],
  ['NGC 6333', 458, 156, 'resuelto'], ['NGC 6333', 458, 219, 'resuelto'],
  ['NGC 6333', 458, 273, 'resuelto'], ['NGC 6333', 458, 486, 'resuelto'],
  ['NGC 6205', 458, 70, 'resuelto'], ['NGC 6205', 458, 99, 'resuelto'],
  ['NGC 6205', 458, 156, 'resuelto'], ['NGC 6205', 458, 219, 'resuelto'],
  ['NGC 6205', 458, 273, 'resuelto'], ['NGC 6205', 458, 486, 'resuelto'],
  ['NGC 6402', 458, 70, 'nebuloso'], ['NGC 6402', 458, 98, 'nebuloso'],
  ['NGC 6402', 458, 154, 'intermedio'], ['NGC 6402', 458, 216, 'resuelto'],
  ['NGC 6402', 458, 270, 'resuelto'], ['NGC 6402', 458, 480, 'resuelto'],
  ['NGC 6838', 458, 70, 'nebuloso'], ['NGC 6838', 458, 99, 'intermedio'],
  ['NGC 6838', 458, 156, 'resuelto'], ['NGC 6838', 458, 219, 'resuelto'],
  ['NGC 6838', 458, 273, 'resuelto'], ['NGC 6838', 458, 486, 'resuelto'],
  ['NGC 7078', 458, 70, 'nebuloso'], ['NGC 7078', 458, 98, 'resuelto'],
  ['NGC 7078', 458, 154, 'intermedio'], ['NGC 7078', 458, 216, 'resuelto'],
  ['NGC 7078', 458, 270, 'resuelto'], ['NGC 7078', 458, 480, 'intermedio'],
  ['NGC 7089', 458, 70, 'resuelto'], ['NGC 7089', 458, 99, 'resuelto'],
  ['NGC 7089', 458, 156, 'intermedio'], ['NGC 7089', 458, 219, 'nebuloso'],
  ['NGC 7089', 458, 273, 'nebuloso'], ['NGC 7089', 458, 486, 'intermedio'],
  ['NGC 6934', 200, 225, 'intermedio'],
  ['NGC 7006', 200, 180, 'nebuloso']
];

function evaluar() {
  var U = C18.calibrarU().U;
  var filas = CASOS.map(function (c) {
    var phi = C18.medirPhiSegunda(c[0], c[1], 21, c[2]).franjas[0].phi;
    var clase = c[3], pasa = null;
    if (clase === 'resuelto') pasa = phi >= U;
    else if (clase === 'nebuloso') pasa = phi < U;
    return { id: c[0], D: c[1], aumento: c[2], clase: clase, phi: phi, pasa: pasa };
  });
  var evaluados = filas.filter(function (f) { return f.pasa !== null; });
  var falla = evaluados.filter(function (f) { return !f.pasa; });
  return { U: U, filas: filas, evaluados: evaluados, falla: falla,
           pasa: falla.length === 0 };
}

module.exports = { evaluar: evaluar };

if (require.main === module) {
  var r = evaluar();
  console.log('U″ (heredado del ancla M13/200mm/120x, ADR 0018) = ' + r.U.toExponential(6));
  console.log('\n' + r.evaluados.length + ' casos con listón binario (' +
    (r.filas.length - r.evaluados.length) + ' "intermedio" sin umbral):\n');
  r.filas.forEach(function (f) {
    var marca = f.pasa === null ? '  --  ' : (f.pasa ? 'ok    ' : 'FALLA ');
    console.log(marca + f.id + ' ' + f.D + 'mm ' + f.aumento + 'x  [' + f.clase +
      ']  Φ″ = ' + f.phi.toExponential(4));
  });
  console.log('\nVEREDICTO: ' + (r.pasa
    ? 'PASA — Φ″ acierta los ' + r.evaluados.length + ' listones held-out; ' +
      'validación superada, ciclo #94→#113 cerrado sin tocar el render'
    : 'FALSA — ' + r.falla.length + '/' + r.evaluados.length + ' listones held-out fallan; ' +
      'se abre la iteración (b) sobre el render con la variable acotada en 0018 §4'));
}
