#!/usr/bin/env node
/* Calibración de K y veredicto — ley de umbral de textura (ADR 0015, #99).

   K es el único parámetro libre y se ancla con el único punto prerregistrado
   (docs/halo_v7/prerregistro_umbral_textura.md §1): M13, 200 mm, SQM 21, 120×,
   "primera rotura del núcleo". Quick 1974 define K como el propio criterio en
   el umbral: P(ver) = 1 − exp(−(exponente)), y el ancla fija ese exponente a 1
   en el punto declarado — la única forma de usar el dato sin introducir una
   segunda elección (qué P(ver) exacto cuenta como "rotura") que el
   prerregistro no comprometió. Con exponente = 1 sale P(ver) = 1 − e^{−1} ≈
   0,632 por construcción, dentro de la banda de transición que exige §1
   (comprobación de que el ajuste no es degenerado).

   El mismo procedimiento de anclaje sirve para el estadístico de energía
   (§2/§3) y para la vía de escape Minkowski (§5): con K = 1 se mide el
   exponente que sale en el ancla y se reescala K para que ese exponente valga
   1, sin tocar la forma de la ley en ninguno de los dos casos.

   Con ese K, corre los listones ya escritos y parametrizados (#97,
   scripts/listones_umbral_textura.js) sin tocar ninguno, e imprime el
   veredicto. Si el estadístico de energía falsea, prueba automáticamente la
   vía de escape Minkowski (única permitida, §5) con el mismo procedimiento.

     node scripts/calibrar_k_textura.js */
'use strict';

var H = require('./harness_halo_v7.js');
var L = require('./listones_umbral_textura.js');
var R = global.window.BitacoraGaiaRender;

var M13 = H.cumulo('NGC 6205');
var NUCLEO_RH = L.ANILLOS_RH[0];   // 0,125 — mismo centro de franja que #97/#99

function indiceEn(r, rAs) {
  var mejor = 0, dMin = Infinity;
  for (var i = 0; i < r.length; i++) {
    var d = Math.abs(r[i] - rAs);
    if (d < dMin) { dMin = d; mejor = i; }
  }
  return mejor;
}

// Ancla K para el estadístico dado: mide el exponente de Quick en el ancla con
// K = 1 y reescala para que valga exactamente 1 ahí (ver cabecera).
function calibrar(estadistico) {
  var Kprev = R.textura.K, activoPrev = R.textura.ACTIVO, estPrev = R.textura.ESTADISTICO;
  R.textura.K = 1;
  R.textura.ACTIVO = true;
  R.textura.ESTADISTICO = estadistico;
  var K, pAncla;
  try {
    var m = H.medir(M13, { D: 200, MAG: 120, sqm: 21, realization: 0 });
    var i = indiceEn(m.tabla.r, NUCLEO_RH * m.rhAs);
    var pConK1 = m.tabla.sGrano[i];
    var exponenteConK1 = -Math.log(1 - pConK1);
    K = Math.pow(exponenteConK1, 1 / R.textura.BETA);
  } finally {
    R.textura.K = Kprev; R.textura.ACTIVO = activoPrev; R.textura.ESTADISTICO = estPrev;
  }
  // Verificación de banda de transición con el K ya calibrado.
  R.textura.K = K; R.textura.ACTIVO = true; R.textura.ESTADISTICO = estadistico;
  try {
    var m2 = H.medir(M13, { D: 200, MAG: 120, sqm: 21, realization: 0 });
    pAncla = m2.tabla.sGrano[indiceEn(m2.tabla.r, NUCLEO_RH * m2.rhAs)];
  } finally {
    R.textura.K = Kprev; R.textura.ACTIVO = activoPrev; R.textura.ESTADISTICO = estPrev;
  }
  return { K: K, pAncla: pAncla };
}

function correr(estadistico) {
  var anc = calibrar(estadistico);
  console.log('\n══ estadístico: ' + estadistico + ' ══');
  console.log('Ancla: M13, 200 mm, SQM 21, 120×, núcleo r/r_h = ' + NUCLEO_RH);
  console.log('K = ' + anc.K.toExponential(6));
  console.log('P(ver) en el ancla con ese K = ' + anc.pAncla.toFixed(3) +
    (anc.pAncla > 0.05 && anc.pAncla < 0.95 ? '  (banda de transición, ok)' :
      '  (extremo — ajuste degenerado)'));

  var resultado = L.evaluar(anc.K, estadistico);
  console.log('\nListones:\n');
  resultado.listones.forEach(function (l) {
    console.log((l.pasa ? 'ok    ' : 'FALLA ') + l.id + ' — ' + l.descripcion);
    console.log('      ' + JSON.stringify(l.valores));
  });
  return { estadistico: estadistico, K: anc.K, pAncla: anc.pAncla, resultado: resultado };
}

if (require.main === module) {
  var energia = correr('energia');
  var salida = energia;
  if (!energia.resultado.pasa) {
    console.log('\nEnergía FALSA los listones — probando la vía de escape ' +
      'única del prerregistro (§5): estadístico Minkowski.');
    salida = correr('minkowski');
  }
  console.log('\nVEREDICTO FINAL (' + salida.estadistico + '): ' +
    (salida.resultado.pasa ? 'PASA — encender producción' :
      'FALSA — canal queda apagado' +
      (salida.estadistico === 'minkowski' ? ', vía de escape también falsada' : '')));
} else {
  module.exports = { calibrar: calibrar, correr: correr, NUCLEO_RH: NUCLEO_RH };
}
