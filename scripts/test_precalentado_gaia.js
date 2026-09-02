#!/usr/bin/env node
/* Test del PRECALENTADO de la consulta a Gaia del simulador
   (`precalentarGaia`/`arcminVista` en simulador_ocular/resources/js/bitacora-ocular.js,
   sobre el caché de `consultar` en resources/js/bitacora-gaia-render.js).

   El fallo que fija (medido en el arranque de /simulador/): el precalentado
   pedía SIEMPRE el radio por defecto (60') y la profundidad sin capa, mientras
   que la vista pedía el campo real del ocular. Con un ocular que abarcaba más
   de 60', el radio pedido no cabía en la entrada cacheada, el chequeo de
   cobertura fallaba y se pagaban DOS descargas por el mismo campo: 598 kB
   tirados y, acto seguido, 2,4 MB. Pidiendo lo MISMO que la vista, la segunda
   consulta es un acierto de caché y solo se descarga una vez.

   Ojo con el otro extremo: el caché es un superconjunto monotónico (ADR 0014),
   así que un precalentado MÁS HONDO del necesario no se descarta —se funde— y
   encarece el ORDER BY del TAP para esas coordenadas el resto de la sesión. Por
   eso el precalentado copia los parámetros de la vista y no pide de más.

   Sin dependencias:  node scripts/test_precalentado_gaia.js  */
'use strict';

var fs = require('fs');
var path = require('path');

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

/* ── Cuántas veces se baja el campo, según lo que pida el precalentado ── */
function descargas(precalentado, vista) {
  var llamadas = [];
  global.fetch = function (url) {
    llamadas.push(url);
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ data: [] }); } });
  };
  // Un punto distinto por escenario: el caché va por coordenada.
  var ra = 10 + llamadasId++, dec = 20;
  R.consultar(ra, dec, precalentado.arcmin, precalentado.mag);
  R.consultar(ra, dec, vista.arcmin, vista.mag);
  return llamadas.length;
}
var llamadasId = 0;

// Caso real del arranque: ocular de campo ancho sobre una placa (tope 120').
var VISTA = { arcmin: 120, mag: 16.5 };

console.log('El precalentado con los parámetros de la vista se descarga UNA vez:');
ok(descargas(VISTA, VISTA) === 1,
  'mismo campo y misma profundidad → la vista acierta en el caché');

console.log('El precalentado con el radio por defecto se descarga DOS veces:');
ok(descargas({ arcmin: 60, mag: VISTA.mag }, VISTA) === 2,
  'radio por defecto (60\') menor que el de la vista (120\') → segunda descarga');

console.log('Un precalentado más somero que la vista tampoco vale:');
ok(descargas({ arcmin: VISTA.arcmin, mag: 15 }, VISTA) === 2,
  'misma anchura pero menos profundidad → segunda descarga');

/* ── Cableado en el simulador: los dos precalentados pasan por el helper ── */
var ocular = fs.readFileSync(
  path.join(__dirname, '../simulador_ocular/resources/js/bitacora-ocular.js'), 'utf8');

console.log('El simulador precalienta con lo que va a pedir la vista:');
ok(/function precalentarGaia\(/.test(ocular),
  'existe precalentarGaia(), el precalentado del simulador');
ok((ocular.match(/precalentarGaia\(/g) || []).length >= 3,
  'los dos sitios que precalentaban (elegirObjeto y el arranque) lo llaman');
ok(!/consultarGaia\(sexToDeg\([^)]*\)\s*,\s*sexToDeg\([^)]*\)\)/.test(ocular),
  'ya no queda ninguna consulta de precalentado sin campo ni profundidad');
ok(/precalentarGaia[\s\S]{0,400}arcminVista\(\)/.test(ocular),
  'precalentarGaia pide el campo de la vista (arcminVista)');
ok(/precalentarGaia[\s\S]{0,400}'canvas-2d'/.test(ocular),
  'y la profundidad de la capa solo cuando la vista es la de Gaia (canvas-2d)');

console.log('arcminVista acota por el tope del origen, como actualizar():');
ok(/function arcminVista\(\)[\s\S]{0,400}GAIA_MAX_ARCMIN[\s\S]{0,120}DSS_MAX_ARCMIN/.test(ocular),
  'canvas-2d usa GAIA_MAX_ARCMIN y las placas DSS_MAX_ARCMIN');
ok(/function arcminVista\(\)[\s\S]{0,300}return undefined/.test(ocular),
  'sin equipo elegido devuelve undefined y la consulta usa su radio por defecto');

/* -- El otro disparador: el botón "Generar" del formulario de registro ------
   Misma ley (BitacoraGaiaRender.profundidadConsulta) y misma vara de medir: si
   el precalentado pide lo que va a pedir la vista, la vista no vuelve a
   descargar. Aquí se ejerce la entrada de verdad, precalentar(), no una copia
   del cálculo. */
global.window.BitacoraPS1 = { ps1MagConsulta: function (m) { return m + 1.5; } };
var EQUIPO = { ra: 200, dec: 30, arcmin: 90, apertura: 200, aumentos: 100, optica: 'newton' };

function descargasPrecalentar(o) {
  var llamadas = [];
  global.fetch = function (url) {
    llamadas.push(url);
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ data: [] }); } });
  };
  R.precalentar(o);
  // Lo que pedirá la vista de Gaia con ese mismo equipo (render -> vistaGaia).
  var t = R.transmisionOptica(o.optica) || 0.8;
  R.consultar(o.ra, o.dec, o.arcmin, R.profundidadConsulta(o.apertura, t, o.aumentos, true));
  return llamadas.length;
}

console.log('El formulario precalienta con lo que va a pedir el modal:');
ok(typeof R.precalentar === 'function',
  'existe BitacoraGaiaRender.precalentar(), el precalentado compartido');
ok(typeof R.profundidadConsulta === 'function',
  'y una sola dueña de la profundidad, profundidadConsulta()');
ok(descargasPrecalentar(EQUIPO) === 1,
  'apuntar al botón y generar después: una sola descarga');

var formulario = fs.readFileSync(
  path.join(__dirname, '../registro/resources/js/bitacora-formulario.js'), 'utf8');
ok(/entradasBox\.addEventListener\('pointerover', precalentarSim\)/.test(formulario),
  'el disparador va delegado en el contenedor, no un listener por entrada');

console.log(fallos === 0 ? '\nTodo verde.' : '\n' + fallos + ' fallo(s).');
process.exit(fallos === 0 ? 0 : 1);
