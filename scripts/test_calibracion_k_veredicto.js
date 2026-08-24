#!/usr/bin/env node
/* Veredicto de la calibración de K (ADR 0015, #99): canal apagado, con
   medida. simulador_ocular/docs/adr/0015-textura/veredicto.md.

   Este test NO vuelve a decidir el veredicto: fija que, con el ancla
   prerregistrada y sin tocar ningún listón, tanto el estadístico de energía
   como la vía de escape Minkowski siguen falsando la ley — y que producción
   sigue apagada. Si algún cambio futuro reabre este canal, tiene que romper
   este test con medida, no en silencio.

     node scripts/test_calibracion_k_veredicto.js */
'use strict';

var C = require('./calibrar_k_textura.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) console.log('  ok   ' + etiqueta);
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

console.log('\nVeredicto de calibración de K — ambos estadísticos falsan los listones:');

var energia = C.correr('energia');
ok(Math.abs(energia.K - 8.245813e-2) / 8.245813e-2 < 1e-4,
  'K (energía) reproduce el valor documentado (' + energia.K.toExponential(6) + ')');
ok(!energia.resultado.pasa, 'estadístico de energía sigue falsando los listones');

var minkowski = C.correr('minkowski');
ok(Math.abs(minkowski.K - 2.547573e-1) / 2.547573e-1 < 1e-4,
  'K (Minkowski) reproduce el valor documentado (' + minkowski.K.toExponential(6) + ')');
ok(!minkowski.resultado.pasa, 'vía de escape Minkowski sigue falsando los listones (anti-vacuidad)');

ok(R.textura.ACTIVO === false, 'producción sigue apagada tras la calibración');
ok(R.textura.ESTADISTICO === 'energia', 'el estadístico de producción vuelve a "energia" al salir');

console.log('\n' + (fallos ? fallos + ' FALLO(S)' : 'todo ok'));
process.exit(fallos ? 1 : 0);
