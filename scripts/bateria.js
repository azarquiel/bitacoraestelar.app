#!/usr/bin/env node
/* La batería entera, con filtros y un resumen de fallos al final.

   Cada test de `scripts/test_*.js` es un proceso node independiente que no
   comparte estado con los demás -los tres que escriben a disco
   (test_disciplina_v7, test_golden_difusas, test_ps1_nan_ausencia) escriben
   cada uno SU fichero-, así que se pueden correr a la vez.

   Pero DOS a la vez por defecto, no ocho. Hay 8 núcleos y solo 8 GB, y la
   máquina ya trabaja con el swap lleno: medido, con cuatro a la vez el mismo
   test pasaba de 403 s a más de 48 minutos. Los tests de render mueven campos
   de 720² en Float32 y lo que falta no son núcleos, es memoria; pasado ese
   punto los procesos no calculan, esperan páginas de disco. Sube -j solo si la
   máquina tiene RAM de sobra, y compruébalo con el reloj antes de creértelo.

   Los más lentos se lanzan primero: con duraciones tan desiguales, largo-a-
   corto es lo que evita acabar esperando a que arranque el más gordo.

     node scripts/bateria.js              toda la batería
     node scripts/bateria.js --rapida     salta los lentos (los de LENTOS)
     node scripts/bateria.js --solo grano corre los que casen con el texto
     node scripts/bateria.js -j 4         otra concurrencia */
'use strict';

var fs = require('fs'), path = require('path');
var spawn = require('child_process').spawn;

var DIR = __dirname;
var CONCURRENCIA_DEFECTO = 2;

/* Los que cuestan más de 30 s medidos en solitario. --rapida los salta: sirve
   para el ciclo corto mientras se trabaja, NO para dar una rama por verde. */
var LENTOS = [
  'test_calibracion_k_veredicto.js',   // 403 s — calibra K dos veces (energía y Minkowski)
  'test_umbral_textura.js',            // 251 s — eran 2122 antes de que el arnés recordase
  'test_halo_v7_e2.js',                // 240 s
  'test_grano_sbf.js',                 // 128 s
  'test_cumulo_render.js',             //  90 s
  'test_crowding_psolo.js',            //  77 s
  'test_halo_v7_e4.js',                //  75 s
  'test_grano_conservacion.js',        //  61 s
  'test_halo_v7_e1.js',                //  55 s
  'test_conservacion_sorteo.js',       //  41 s
  'test_harness_halo_v7.js',           //  33 s
  'test_grano_malla.js'                //  31 s
];
var args = process.argv.slice(2);
function opcion(nombre) {
  var i = args.indexOf(nombre);
  return i >= 0 ? args[i + 1] : null;
}
var rapida = args.indexOf('--rapida') >= 0;
var solo = opcion('--solo');
var trabajos = Number(opcion('-j')) || CONCURRENCIA_DEFECTO;

var ficheros = fs.readdirSync(DIR)
  .filter(function (f) { return /^test_.*\.js$/.test(f); })
  .filter(function (f) { return !(rapida && LENTOS.indexOf(f) >= 0); })
  .filter(function (f) { return !solo || f.indexOf(solo) >= 0; })
  // Los lentos primero, y entre ellos por el orden en que están medidos.
  .sort(function (a, b) {
    var ia = LENTOS.indexOf(a), ib = LENTOS.indexOf(b);
    if (ia < 0) ia = Infinity;
    if (ib < 0) ib = Infinity;
    return ia - ib || a.localeCompare(b);
  });

if (!ficheros.length) { console.error('Ningún test casa con el filtro.'); process.exit(1); }

console.log(ficheros.length + ' tests, ' + trabajos + ' a la vez'
  + (rapida ? ' (--rapida: sin los ' + LENTOS.length + ' lentos)' : '')
  + (solo ? ' (--solo ' + solo + ')' : ''));

var siguiente = 0, vivos = 0, hechos = 0;
var fallos = [], salidas = {}, arranque = Date.now();

function lanzar() {
  while (vivos < trabajos && siguiente < ficheros.length) {
    correr(ficheros[siguiente++]);
  }
  if (!vivos && siguiente >= ficheros.length) resumen();
}

function correr(f) {
  vivos++;
  var t0 = Date.now(), trozos = [];
  var p = spawn(process.execPath, [path.join(DIR, f)], { cwd: path.dirname(DIR) });
  p.stdout.on('data', function (c) { trozos.push(c); });
  p.stderr.on('data', function (c) { trozos.push(c); });
  p.on('close', function (codigo) {
    vivos--; hechos++;
    var s = Math.round((Date.now() - t0) / 1000);
    if (codigo !== 0) { fallos.push(f); salidas[f] = Buffer.concat(trozos).toString(); }
    console.log((codigo === 0 ? '  ok    ' : '  FALLA ')
      + f + (s >= 5 ? '  (' + s + ' s)' : '')
      + '   [' + hechos + '/' + ficheros.length + ']');
    lanzar();
  });
}

function resumen() {
  var total = Math.round((Date.now() - arranque) / 1000);
  console.log('\n' + ficheros.length + ' tests en ' + Math.floor(total / 60)
    + ' min ' + (total % 60) + ' s');
  if (!fallos.length) { console.log('Todo OK'); process.exit(0); }
  console.log('\n' + fallos.length + ' FALLOS:');
  fallos.forEach(function (f) {
    console.log('\n───── ' + f + ' ─────');
    // Solo la cola: lo que interesa de un test propio es el veredicto final.
    console.log(salidas[f].trim().split('\n').slice(-15).join('\n'));
  });
  process.exit(1);
}

lanzar();
