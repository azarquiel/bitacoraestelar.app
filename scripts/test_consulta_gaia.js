#!/usr/bin/env node
/* Test de la PROFUNDIDAD de consulta a Gaia (`magConsultaGaia` en
   resources/js/bitacora-gaia-render.js).

   Antes la consulta pedía siempre GAIA_MAG_MAX=17 fijo, sin relación con la
   apertura del equipo. Con un tope fijo y una cola de glow ancha, un 8" y un
   18" acababan "viendo" casi el mismo catálogo entero -la apertura dejaba de
   notarse en el número de estrellas. Ahora la profundidad sale de magLimite()
   (el mismo mlim del render) al cielo más oscuro que admite la UI y aumentos
   altos, más el margen de la cola de glow: cada equipo pide solo lo que puede
   llegar a usar.

   Sin dependencias:  node scripts/test_consulta_gaia.js  */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function ok(cond, msg) {
  console.log('  ' + (cond ? 'ok  ' : 'FALLO') + '  ' + msg);
  if (!cond) fallos++;
}

console.log('magConsultaGaia crece con la apertura, no es un tope fijo:');
var m8 = R.magConsultaGaia(200, 0.9);   // ~8"
var m18 = R.magConsultaGaia(457, 0.9);  // ~18"
ok(m18 > m8 + 1, 'un 18" pide un catálogo notablemente más profundo que un 8" (' +
  m8.toFixed(2) + ' → ' + m18.toFixed(2) + ')');

console.log('Se mantiene dentro de límites sanos:');
ok(R.magConsultaGaia(1000, 0.9) <= 20, 'un equipo enorme no supera el tope de seguridad (20)');
ok(R.magConsultaGaia(40, 0.6) >= 12, 'un equipo minúsculo no baja del suelo de seguridad (12)');

console.log('Sin apertura, cae a un valor de respaldo razonable:');
ok(R.magConsultaGaia(0, 0.9) > 0, 'apertura 0 no revienta, devuelve el valor por defecto');

console.log('El margen de la cola de glow sale de las MISMAS constantes que dibujar():');
var colaEsperada = -2.5 * Math.log10(R.config.glowCorte / R.config.alfaMin);
var techo = R.magLimite({ apertura: 200, aumentos: 1e6, transmision: 0.9, sqm: 22 });
var esperado = Math.max(12, Math.min(20, techo + colaEsperada + 0.3));
ok(Math.abs(m8 - esperado) < 1e-6,
  'magConsultaGaia(200) coincide con techo+cola(alfaMin,glowCorte)+margen = ' + esperado.toFixed(3));

console.log(fallos === 0 ? '\n✓ Todo correcto.' : '\n✗ ' + fallos + ' fallo(s).');
process.exit(fallos === 0 ? 0 : 1);
