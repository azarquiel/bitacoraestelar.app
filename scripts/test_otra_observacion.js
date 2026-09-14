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

/* El salto de 20 minutos ya no lo hace el manejador: lo hace siguienteObjeto(),
   que es donde vive la regla entera de qué se conserva al encadenar (#300). El
   manejador solo le pasa lo que hay en pantalla y pinta lo que devuelve. */
seccion('El manejador delega la regla en siguienteObjeto()');
ok(/BitacoraBase\.siguienteObjeto\(/.test(js), 'encadena con la fuente única de la regla');
ok(/mismoCampo\s*:\s*false/.test(js), 'por la vía «más tarde»: otro objeto, otro rato');
ok(!/sumarMinutos\([^)]*20\)/.test(js), 'y no se copia el salto de hora por su cuenta');

/* El ocular no se toca de un objeto al siguiente, así que la entrada nueva tiene
   que nacer con la óptica ya declarada. Sin esto hay que reelegir ocular y
   recalcular el campo real objeto tras objeto (#297). */
seccion('La óptica se hereda: la entrada nueva nace con el ocular puesto');
ok(/entradas\s*:\s*(entradasBox \?\s*)?recogerEntradas\(\)/.test(js),
   'le da las entradas que hay en pantalla, no una lista vacía');
ok(/crearEntrada\(datos\)/.test(js), 'y repinta cada una con lo que devuelve');

/* Lo que sí se vacía, por las dos vías: el objeto y sus coordenadas. Heredarlos
   guardaría M42 en la ficha de M43. */
var sig = B.siguienteObjeto({
  fecha: '2026-08-05', hora: '23:50', objeto: 'M42', ra: '05 35 17', dec: '-05 23 28',
  entradas: [{ aumento: 48, campoReal: 1.2, pupilaSalida: 6.6, ocularId: 3,
               titulo: 'Nagler 31mm', descripcion: '<p>Lo visto en M42.</p>', imagenes: [] }]
}, { mismoCampo: false });
ok(sig.entradas[0].ocular_id === 3 && sig.entradas[0].aumento === 48 && sig.entradas[0].campo_real === 1.2,
   'conserva ocular, aumento y campo real');
ok(sig.objeto === '' && sig.ra === '' && sig.dec === '', 'y vacía objeto y coordenadas');
ok(sig.entradas[0].descripcion === '', 'la descripción se vacía: es otro objeto');

console.log('');
if (fallos) { console.error(fallos + ' comprobación(es) fallan.'); process.exit(1); }
console.log('Todo correcto.');
