#!/usr/bin/env node
/* Experimento rc (independiente de V2-A/V2-B, ver CFG.globular.experimentoRcV2):
   la amortiguación de una estrella resuelta dentro de un halo globular
   (tPinGlobular) tenía un corte DURO en r=rc -dentro, siempre puntual;
   fuera, la transición continua de siempre-. Verifica que ese corte es una
   discontinuidad real (no solo sospecha) y que experimentoRcV2=true la
   quita sin romper el caso típico (estrella cerca del centro sigue
   saliendo ~puntual, sin necesidad del caso especial).

   Sin dependencias: node scripts/test_globulares_rc_v2.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

var M13 = { rc: 0.62, rt: 0.62 * Math.pow(10, 1.53), muV0: 16.59 };
var halo = R.haloGlobular(M13, [], 250, 36, 100);
var rc = halo.rcAs;
var eps = 0.01;   // arcsec: paso ínfimo a ambos lados de rc

console.log('Producción (experimentoRcV2=false): el corte en rc es una discontinuidad real:');
R.config.globular.experimentoRcV2 = false;
[6, 10, 14, 16, 18].forEach(function (g) {
  var dentro = R.tPinGlobular(halo, rc - eps, g);
  var fuera = R.tPinGlobular(halo, rc + eps, g);
  var salto = Math.abs(fuera - dentro);
  console.log('  g=' + g + ': tPin(rc-ε)=' + dentro.toFixed(3) + '  tPin(rc+ε)=' + fuera.toFixed(3) +
    '  salto=' + salto.toFixed(3));
  ok(dentro === 0, 'g=' + g + ': dentro de rc siempre puntual (tPin=0), como en producción');
});
// Con una estrella brillante, mu(rc) suele ganarle -el fondo del halo pesa
// menos que su propio brillo justo ahí-, así que tPin(rc+ε) sale alto: el
// salto es GRANDE, no un artefacto de redondeo de eps.
var saltoBrillante = Math.abs(R.tPinGlobular(halo, rc + eps, 10) - R.tPinGlobular(halo, rc - eps, 10));
ok(saltoBrillante > 0.5, 'estrella brillante (g=10): el salto al cruzar rc es grande (>0,5 en tPin), no ruido numérico');

console.log('\nExperimentoRcV2=true: misma fórmula dentro y fuera de rc, sin salto:');
R.config.globular.experimentoRcV2 = true;
[6, 10, 14, 16, 18].forEach(function (g) {
  var dentro = R.tPinGlobular(halo, rc - eps, g);
  var fuera = R.tPinGlobular(halo, rc + eps, g);
  var salto = Math.abs(fuera - dentro);
  console.log('  g=' + g + ': tPin(rc-ε)=' + dentro.toFixed(4) + '  tPin(rc+ε)=' + fuera.toFixed(4) +
    '  salto=' + salto.toFixed(4));
  ok(salto < 0.01, 'g=' + g + ': sin experimentoRcV2, salto ínfimo (<0,01) al cruzar rc, ya no discontinuo');
});

console.log('\nExperimentoRcV2=true: HALLAZGO -en el centro, la fórmula continua NO amortigua la mayoría de estrellas:');
// Hipótesis inicial (descartada por la medida): que mu(r) fuera tan brillante
// cerca de r=0 que la fórmula continua siguiera dando tPin≈0 igual que el
// corte duro, sin necesidad de él. FALSO: mu(0) de un cúmulo típico (King(0)=1,
// pero Fcentral ya viene diluido por muV0/areaKing) sale ALREDEDOR de la propia
// muV0 del catálogo -16,59 en M13, ni remotamente "brillante" frente a una
// estrella resuelta de g=12-16-, así que dm=mu(0)-g sale POSITIVO (la estrella
// gana) para casi cualquier estrella con brillo típico de campo. El corte duro
// en rc NO era una simplificación de un límite que la fórmula ya alcanzaba
// sola: era una decisión perceptual aparte ("el ojo no resuelve halo
// individual junto al núcleo denso", ver comentario original 2026-08-01), sin
// respaldo en la comparación de flujos. Quitarlo cambia el aspecto de CASI
// TODAS las estrellas dentro de rc, no solo un caso excepcional.
[12, 14, 16, 18].forEach(function (g) {
  var t0 = R.tPinGlobular(halo, 0, g);
  console.log('  g=' + g + ' en r=0: tPin=' + t0.toFixed(4));
});
ok(R.tPinGlobular(halo, 0, 14) > 0.9,
  'g=14 en el centro: con experimentoRcV2, sale prácticamente SIN amortiguar (tPin>0,9) -el caso típico, no el excepcional-');

// Continuidad general de tPin en r (a magnitud fija), con y sin el experimento:
// mismo criterio de paso infinitesimal que perfilKing en test_globulares.js.
console.log('\nContinuidad de tPinGlobular en todo el rango (paso infinitesimal), ambos modos:');
[false, true].forEach(function (flag) {
  R.config.globular.experimentoRcV2 = flag;
  var continuo = true;
  [0, rc / 4, rc / 2, rc * 0.99, rc, rc * 1.01, rc * 2, halo.rtAs * 0.5, halo.rtAs * 0.9].forEach(function (r) {
    var d = Math.abs(R.tPinGlobular(halo, r + eps, 14) - R.tPinGlobular(halo, r, 14));
    if (d > eps * 50 && flag) continuo = false;   // margen generoso, mismo criterio que perfilKing
  });
  if (flag) ok(continuo, 'experimentoRcV2=true: tPinGlobular es continuo en todo el rango, incluido rc');
});

R.config.globular.experimentoRcV2 = false;   // deja el módulo como lo encontró

console.log(fallos === 0 ? '\nTodo OK' : '\n' + fallos + ' fallo(s)');
process.exit(fallos === 0 ? 0 : 1);
