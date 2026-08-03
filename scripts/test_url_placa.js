#!/usr/bin/env node
/* Test de la URL de la placa del DSS (urlPlaca en bitacora-gaia-render.js).

   Es la puerta por la que el simulador Y el formulario de registro piden una
   placa a dss-proxy.php. Lo que se fija aquí es lo que el proxy exige al otro
   lado: coordenadas que pasen su validador (solo dígitos, espacios, signos,
   puntos y dos puntos: ni "h" ni "°"), el campo acotado a los 2° que el DSS
   sirve, y los parámetros con los nombres que lee.

   Sin dependencias: node scripts/test_url_placa.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok  ' + etiqueta); }
  else { fallos++; console.error('  FALLA  ' + etiqueta); }
}
// Valor de un parámetro de la query, ya decodificado.
function param(url, clave) {
  var m = String(url).split('?')[1].split('&');
  for (var i = 0; i < m.length; i++) {
    var p = m[i].split('=');
    if (decodeURIComponent(p[0]) === clave) return decodeURIComponent((p[1] || '').replace(/\+/g, ' '));
  }
  return null;
}

/* ── 1. Grados → sexagesimal ────────────────────────────────────────────────
   M42 en el ejemplo de la cabecera de dss-proxy.php: ra=05 35 17, dec=-05 23 28
   (83,822083° / -5,391111°). */
console.log('Coordenadas:');
var u = R.urlPlaca({ ra: 83.822083, dec: -5.391111, arcmin: 84 });
ok(param(u, 'ra') === '05 35 17', 'la AR en grados sale en horas sexagesimales = ' + param(u, 'ra'));
ok(param(u, 'dec') === '-05 23 28', 'la Dec en grados sale en sexagesimal con signo = ' + param(u, 'dec'));

var norte = R.urlPlaca({ ra: 0, dec: 41.269, arcmin: 60 });
ok(param(norte, 'dec') === '+41 16 08', 'una Dec positiva lleva el signo + = ' + param(norte, 'dec'));

// El validador del proxy (dss_validar_coord) rechaza cualquier otro carácter.
var VALIDA = /^[0-9+\-.: ]{1,24}$/;
ok(VALIDA.test(param(u, 'ra')) && VALIDA.test(param(u, 'dec')),
   'las coordenadas pasan el validador del proxy');

// Una coordenada ya sexagesimal (la del catálogo del simulador) va tal cual.
var texto = R.urlPlaca({ ra: '06 08 54', dec: '+24 20 00', arcmin: 30 });
ok(param(texto, 'ra') === '06 08 54' && param(texto, 'dec') === '+24 20 00',
   'una coordenada ya en texto no se toca');

/* ── 2. Campo acotado al que sirve el DSS ──────────────────────────────────── */
console.log('Campo:');
var ancho = R.urlPlaca({ ra: 0, dec: 0, arcmin: 400 });
ok(parseFloat(param(ancho, 'x')) === 120 && parseFloat(param(ancho, 'y')) === 120,
   'un campo mayor de 2° se recorta a 120′');
var mini = R.urlPlaca({ ra: 0, dec: 0, arcmin: 0.2 });
ok(parseFloat(param(mini, 'x')) >= 1, 'un campo diminuto sube al mínimo de 1′');
ok(parseFloat(param(u, 'x')) === 84 && parseFloat(param(u, 'y')) === 84,
   'el campo normal pasa igual en x y en y (la placa es cuadrada)');

/* ── 3. Parámetros que lee el proxy ────────────────────────────────────────── */
console.log('Parámetros del proxy:');
ok(param(u, 'Sky-Survey') === 'DSS2-red', 'por defecto pide la placa profunda DSS2-red');
ok(param(R.urlPlaca({ ra: 0, dec: 0, arcmin: 30, survey: 'DSS1' }), 'Sky-Survey') === 'DSS1',
   'el reconocimiento se puede elegir');
ok(param(u, 'fuente') === 'skyview', 'por defecto la sirve SkyView (norte arriba)');
ok(param(R.urlPlaca({ ra: 0, dec: 0, arcmin: 30, fuente: 'eso' }), 'fuente') === 'eso',
   'la fuente de respaldo (ESO) se puede pedir');
ok(param(u, 'mime-type') === 'download-gif' && param(u, 'equinox') === 'J2000',
   'lleva el equinoccio y el formato que espera el proxy');
ok(u.split('?')[0] === R.dssProxyUrl, 'la base es la URL del proxy del DSS');
ok(R.urlPlaca({ ra: 0, dec: 0, arcmin: 30, base: '/otro/dss.php' }).split('?')[0] === '/otro/dss.php',
   'la base se puede sobrescribir');

console.log(fallos === 0 ? '\nTodo correcto.' : '\n' + fallos + ' fallo(s).');
process.exit(fallos === 0 ? 0 : 1);
