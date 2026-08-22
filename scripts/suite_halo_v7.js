#!/usr/bin/env node
/* Suite del modelo de observación de cúmulos, con las tres salidas de ADR-0005:
   superado, fallido y VACUO. Una batería que termina en 0 sin haber comprobado
   nada no es evidencia positiva; aquí sale como vacua y tiñe la suite de rojo.

   El recuento no depende de que el test colabore: se cuentan las líneas «ok»
   que la corrida imprimió de verdad, que es la única prueba de que un assert
   llegó a ejecutarse (en v7 dos versiones de un test pasaron sin medir nada
   porque iteraban sobre un conjunto vacío).

     node scripts/suite_halo_v7.js                # la suite por defecto
     node scripts/suite_halo_v7.js scripts/x.js   # baterías sueltas
*/
'use strict';

var path = require('path');
var cp = require('child_process');

var POR_DEFECTO = [
  'test_cumulos.js', 'test_cumulo_render.js', 'test_globulares.js',
  'test_halo_v7_e1.js', 'test_halo_v7_e2.js', 'test_halo_v7_e3.js',
  'test_halo_v7_e4.js', 'test_halo_v7_e5.js', 'test_disciplina_v7.js',
  'test_grano_sbf.js', 'test_grano_conservacion.js',
  'test_umbral_textura.js'
].map(function (n) { return path.join(__dirname, n); });

function contarAsserts(salida) {
  var m = salida.match(/^[ \t]*ok /gm);
  return m ? m.length : 0;
}

function clasificar(codigo, salida) {
  if (codigo !== 0) return 'fallido';
  return contarAsserts(salida) === 0 ? 'vacuo' : 'superado';
}

function correr(fichero) {
  var r = cp.spawnSync(process.execPath, [fichero], { encoding: 'utf8', maxBuffer: 32e6 });
  var salida = (r.stdout || '') + (r.stderr || '');
  return {
    fichero: fichero,
    asserts: contarAsserts(salida),
    clase: clasificar(r.status, salida),
    salida: salida
  };
}

module.exports = { clasificar: clasificar, correr: correr, contarAsserts: contarAsserts };

if (require.main === module) {
  var ficheros = process.argv.length > 2 ? process.argv.slice(2) : POR_DEFECTO;
  var cuenta = { superado: 0, fallido: 0, vacuo: 0 };
  var total = 0;
  ficheros.forEach(function (f) {
    var r = correr(f);
    cuenta[r.clase]++;
    total += r.asserts;
    console.log(r.clase.toUpperCase().padEnd(9) + path.basename(f) +
      '  (' + r.asserts + ' asserts)');
    if (r.clase !== 'superado') console.log(r.salida.replace(/^/gm, '    '));
  });
  console.log('\nsuperados ' + cuenta.superado + ' · fallidos ' + cuenta.fallido +
    ' · vacuos ' + cuenta.vacuo + ' · ' + total + ' asserts ejecutados');
  if (cuenta.vacuo) console.log('Un resultado vacuo NO es evidencia positiva (ADR-0005).');
  process.exit(cuenta.fallido + cuenta.vacuo === 0 ? 0 : 1);
}
