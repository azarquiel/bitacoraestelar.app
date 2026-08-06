#!/usr/bin/env node
/* Test de "Añadir otra" (encadenar objetos de la misma noche).

   Al guardar una observación aparece un botón que deja el formulario listo para
   el siguiente objeto: mismo viaje, misma fecha, mismo telescopio, y la hora 20
   minutos más tarde. Lo único con cuentas es ese salto de hora, y tiene una
   trampa: una noche cruza la medianoche, así que 23:50 + 20 min NO es el mismo
   día. Si la fecha se quedase quieta, la observación se guardaría con la del día
   anterior (y el viaje se elige por fecha+hora).

   Se comprueba también el cableado del botón, porque el fragmento HTML se pega
   en WordPress y el .js va por FTP: son dos archivos que nadie obliga a viajar
   juntos.

   Sin dependencias:  node scripts/test_otra_observacion.js */
'use strict';

var fs = require('fs');
var path = require('path');

global.window = {};
require('../resources/js/bitacora-base.js');
var B = global.window.BitacoraBase;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function seccion(t) { console.log('\n' + t); }

seccion('La hora avanza 20 minutos');
var a = B.sumarMinutos('2026-08-05', '22:10', 20);
ok(a.fecha === '2026-08-05' && a.hora === '22:30', '22:10 -> 22:30, misma fecha');

var b = B.sumarMinutos('2026-08-05', '22:50', 20);
ok(b.fecha === '2026-08-05' && b.hora === '23:10', 'cambia de hora sin cambiar de día');

seccion('La medianoche se lleva la fecha con ella');
var c = B.sumarMinutos('2026-08-05', '23:50', 20);
ok(c.fecha === '2026-08-06' && c.hora === '00:10', '23:50 -> 00:10 del día siguiente');

var d = B.sumarMinutos('2026-12-31', '23:55', 20);
ok(d.fecha === '2027-01-01' && d.hora === '00:15', 'fin de año: cambia también el año');

seccion('Sin hora no se inventa ninguna');
var e = B.sumarMinutos('2026-08-05', '', 20);
ok(e.fecha === '2026-08-05' && e.hora === '', 'la hora es opcional: se queda vacía');
var f = B.sumarMinutos('', '', 20);
ok(f.fecha === '' && f.hora === '', 'sin fecha ni hora, nada que sumar');

seccion('El botón existe y está cableado');
var RAIZ = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(RAIZ, 'registro/registrar-observacion-wordpress.html'), 'utf8');
var js = fs.readFileSync(path.join(RAIZ, 'registro/resources/js/bitacora-formulario.js'), 'utf8');

ok(/id="otraBtn"[^>]*hidden/.test(html), 'el fragmento trae el botón, oculto de salida');
ok(/\$\('otraBtn'\)/.test(js), 'el formulario lo busca por su id');
ok(/otraBtn\.hidden = false/.test(js), 'se enseña al guardar');
ok(/sumarMinutos\(.*, 20\)/.test(js), 'salta 20 minutos con el helper compartido');

console.log('');
if (fallos) { console.error(fallos + ' comprobación(es) fallan.'); process.exit(1); }
console.log('Todo correcto.');
