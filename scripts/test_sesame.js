#!/usr/bin/env node
/* Test del lector de respuestas del resolvedor Sesame del CDS
   (`BitacoraBase.leerSesame`, resources/js/bitacora-base.js).

   Por qué existe: la búsqueda por nombre del simulador dejó de pasar por el
   endpoint /coordenadas de WordPress —que exige sesión, y el simulador vive en
   una página pública— y ahora lee texto plano de un servicio externo con tres
   expresiones regulares. Si el CDS cambia el formato, o si alguien toca la
   regex, el fallo es «no está en SIMBAD» para objetos que sí están: un mensaje
   plausible que no parece un error.

   Las respuestas van CONGELADAS aquí para que el test no dependa de la red.
   Con  --vivo  consulta además el servicio de verdad, que es lo único que
   detecta un cambio de formato aguas arriba.

   Sin dependencias:  node scripts/test_sesame.js  [--vivo]  */
'use strict';

global.window = {};
require('../resources/js/bitacora-base.js');
var B = global.window.BitacoraBase;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function casi(a, b, tol, etiqueta) {
  if (Math.abs(a - b) <= tol) { console.log('  ok   ' + etiqueta + ' = ' + a); }
  else { fallos++; console.error('  FALLA ' + etiqueta + '\n         esperado ' + b + ' ±' + tol + '\n         obtenido ' + a); }
}

/* Respuestas reales de https://cds.unistra.fr/cgi-bin/nph-sesame/-oI/S? */
var M42 = [
  '# M42\t#Q1711310',
  '#=Sc=Simbad (CDS, via client/server):    1     0ms (from cache)',
  '%@ @810146',
  '%C.0 HII',
  '%J 83.82010000 -5.38760000 = 05 35 16.8    -05 23 15    ',
  '%J.E [5000 5000 90] D 2022A&A...661A..38P',
  '%I NGC 1976',
  '#B 4468'
].join('\n');

var M31 = ['# M31', '%C.0 AGN', '%J 10.68470833 +41.26875000 = 00 42 44.330  +41 16 07.50'].join('\n');

var NADA = ['# zzqx99\t#Q1711316', '#! *** NNNothing found *** ', ''].join('\n');

console.log('Lectura de la respuesta de Sesame:');
var m42 = B.leerSesame(M42);
ok(m42 !== null, 'M42 resuelve');
casi(m42.ra, 83.8201, 1e-6, 'RA de M42 en grados');
// El signo de la declinación es lo que más fácil se pierde en una regex, y una
// nebulosa dibujada 10° al norte de donde está sigue pareciendo una nebulosa.
casi(m42.dec, -5.3876, 1e-6, 'Dec SUR de M42, con su signo');
ok(m42.otype === 'HII', 'tipo de objeto');

var m31 = B.leerSesame(M31);
casi(m31.dec, 41.26875, 1e-6, 'Dec norte con «+» explícito');

console.log('Sin resultado:');
ok(B.leerSesame(NADA) === null, 'un nombre inexistente devuelve null');
ok(B.leerSesame('') === null, 'respuesta vacía devuelve null');
ok(B.leerSesame(null) === null, 'null no revienta');
// Una página de error HTML no puede colarse como coordenadas.
ok(B.leerSesame('<html><body>502 Bad Gateway</body></html>') === null, 'HTML de error devuelve null');

if (process.argv.indexOf('--vivo') >= 0) {
  console.log('Consulta viva al CDS:');
  var url = 'https://cds.unistra.fr/cgi-bin/nph-sesame/-oI/S?' + encodeURIComponent('M 42');
  fetch(url).then(function (r) { return r.text(); }).then(function (txt) {
    var d = B.leerSesame(txt);
    ok(d !== null, 'el servicio sigue devolviendo un formato legible');
    if (d) casi(d.ra, 83.8201, 0.01, 'RA de M42 desde el servicio');
    fin();
  }).catch(function (e) {
    fallos++; console.error('  FALLA no se pudo consultar el CDS: ' + e.message); fin();
  });
} else {
  fin();
}

function fin() {
  console.log(fallos === 0 ? '\nTodo OK' : '\n' + fallos + ' fallo(s)');
  process.exit(fallos === 0 ? 0 : 1);
}
