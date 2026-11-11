/* Muestra aleatoria del catálogo apto, para las cifras de volumen (L2.4 del
   ADR 0024, y #370 que la reutiliza). El banco está elegido por modo de fallo y
   sus lados no representan la distribución. Semilla fija y escrita (LCG de
   Numerical Recipes) para que la muestra sea la misma en cualquier ejecución;
   el ADR 0012 bis pide que la selección no dependa de haber visto los
   resultados. Sacada de harness_dso_fase0.js tal cual, para que todo el que la
   use saque provablemente los mismos nombres.

   Uso:  require('./lib_muestra_dso.js')(B, b, 50)
         B = lib_banco_dso.js ya instanciado, b = B.banco()
         → [{ nombre, fila, motivo, gal }] (solo las que tienen `gal`) */
'use strict';

var SEMILLA = 20260904;

function muestra(B, b, n) {
  var enBanco = {};
  b.objetos.filter(function (o) { return o.gal; })
    .forEach(function (o) { enBanco[B.clave(o.nombre)] = 1; });
  var pool = b.catalogo.filter(function (fila) { return B.apta(fila) && !enBanco[B.clave(fila[0])]; });
  var s = SEMILLA, sacadas = [];
  for (var t = 0; t < n && pool.length; t++) {
    s = (1664525 * s + 1013904223) % 4294967296;
    var fila = pool.splice(s % pool.length, 1)[0];
    sacadas.push({ nombre: fila[0], fila: fila, motivo: 'muestra aleatoria (semilla ' + SEMILLA + ')', gal: B.gal(fila) });
  }
  return sacadas.filter(function (o) { return o.gal; });
}

module.exports = muestra;
module.exports.SEMILLA = SEMILLA;
