#!/usr/bin/env node
/* Test de la insignia de fidelidad (ticket #133) en
   resources/js/bitacora-gaia-render.js:

   La ficha del objeto avisa cuando la doble se dibuja con una compañera
   colocada a un ángulo ASUMIDO (55°) en vez de medido. El escalón que lo
   dispara es uno solo: una fila del catálogo de estrellas que Gaia DR3 no
   trae con origen "asumida". Ni "derivada" ni "medida" avisan: si avisara
   siempre, el aviso no significaría nada.

   1. Una doble con una fila "asumida" en su sitio da true.
   2. Las filas "medida" y "derivada" no disparan nada.
   3. Sin catálogo cargado (o sin coordenadas) no se avisa: nunca revienta.
   4. Contra el catálogo REAL, el censo de dobles que avisan es exactamente
      el de las filas "asumida" del fichero generado, y son las que el
      catálogo de dobles deja sin ángulo publicado (pa null) -que es el
      motivo por el que su origen es "asumida"-.

   Sin dependencias:  node scripts/test_insignia_asumida.js */
'use strict';

global.window = {};
global.document = {
  createElement: function () {
    var el = { width: 8, height: 8 };
    el.getContext = function () { return null; };
    return el;
  }
};
require('../resources/js/bitacora-gaia-color.js');
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

// Doble de prueba: 10″ de separación, la compañera cae al norte-este.
var RA = 100, DEC = 20;
var doble = { ra: RA, dec: DEC, sep: 10 };
function filaA(dRaArcsec, dDecArcsec, origen) {
  var cos0 = Math.cos(DEC * Math.PI / 180);
  return [RA + dRaArcsec / (3600 * cos0), DEC + dDecArcsec / 3600, 4.2, 0.5, null, origen];
}

console.log('1. Una fila "asumida" en el sitio de la doble dispara el aviso');
global.window.BITACORA_ESTRELLAS_BRILLANTES = [filaA(6, 8, 'asumida')];
ok(R.orientacionAsumida(doble) === true, 'compañera asumida a 10″ del centro: avisa');
global.window.BITACORA_ESTRELLAS_BRILLANTES = [filaA(20, 25, 'asumida')];
ok(R.orientacionAsumida(doble) === true, 'con el desajuste de época (32″) sigue avisando');
global.window.BITACORA_ESTRELLAS_BRILLANTES = [filaA(600, 0, 'asumida')];
ok(R.orientacionAsumida(doble) === false, 'una asumida de OTRO sistema (600″) no cuenta');

console.log('\n1b. La compañera se busca en un ANILLO, no en un disco');
/* La fila asumida es la compañera: cae a `sep` del centro, a un ángulo que es
   justo lo que no se sabe. Con un disco de radio sep, un par ancho barría
   grados de cielo y se tragaba filas asumidas de otros sistemas. */
var ancha = { ra: RA, dec: DEC, sep: 900 };
global.window.BITACORA_ESTRELLAS_BRILLANTES = [filaA(890, 0, 'asumida')];
ok(R.orientacionAsumida(ancha) === true, 'par de 900″: su compañera en el anillo avisa');
global.window.BITACORA_ESTRELLAS_BRILLANTES = [filaA(400, 0, 'asumida')];
ok(R.orientacionAsumida(ancha) === false, 'una fila a media distancia (400″) NO es su compañera');
global.window.BITACORA_ESTRELLAS_BRILLANTES = [filaA(12, 0, 'asumida')];
ok(R.orientacionAsumida(ancha) === true, 'la del centro sí: puede ser la primaria del par');

console.log('\n2. Los otros dos escalones del origen no avisan');
global.window.BITACORA_ESTRELLAS_BRILLANTES = [filaA(6, 8, 'medida')];
ok(R.orientacionAsumida(doble) === false, 'origen "medida": no avisa');
global.window.BITACORA_ESTRELLAS_BRILLANTES = [filaA(6, 8, 'derivada')];
ok(R.orientacionAsumida(doble) === false, 'origen "derivada": no avisa');
global.window.BITACORA_ESTRELLAS_BRILLANTES = [filaA(6, 8, 'derivada'), filaA(-6, -8, 'asumida')];
ok(R.orientacionAsumida(doble) === true, 'basta con que UNA de las filas del sitio sea asumida');

console.log('\n3. Sin datos no se avisa, y no revienta');
delete global.window.BITACORA_ESTRELLAS_BRILLANTES;
ok(R.orientacionAsumida(doble) === false, 'sin catálogo cargado: no avisa');
global.window.BITACORA_ESTRELLAS_BRILLANTES = [filaA(6, 8, 'asumida')];
ok(R.orientacionAsumida({ ra: null, dec: null, sep: 10 }) === false, 'sin coordenadas: no avisa');
ok(R.orientacionAsumida({ ra: RA, dec: DEC }) === true, 'sin separación se sigue mirando el sitio');
ok(R.orientacionAsumida(null) === false, 'sin objeto: no avisa');

console.log('\n4. Censo contra el catálogo real');
delete global.window.BITACORA_ESTRELLAS_BRILLANTES;
delete global.window.BITACORA_DOBLES;
require('../simulador_ocular/resources/js/estrellas-brillantes-datos.js');
require('../simulador_ocular/resources/js/estrellas-dobles-datos.js');
var filas = global.window.BITACORA_ESTRELLAS_BRILLANTES;
var dobles = global.window.BITACORA_DOBLES;
var nAsumidas = filas.filter(function (f) { return f[5] === 'asumida'; }).length;
function sexAGrados(s, esRA) {
  var sg = /^\s*-/.test(String(s)) ? -1 : 1;
  var p = String(s).trim().replace(/[+\-]/g, '').split(/\s+/).map(Number);
  return sg * ((p[0] || 0) + (p[1] || 0) / 60 + (p[2] || 0) / 3600) * (esRA ? 15 : 1);
}
var avisan = dobles.filter(function (e) {
  return R.orientacionAsumida({ ra: sexAGrados(e.ra, true), dec: sexAGrados(e.dec, false), sep: e.sep });
});
ok(nAsumidas > 0, 'el catálogo real trae filas "asumida" (' + nAsumidas + ')');
ok(avisan.length === nAsumidas,
   'avisan tantas dobles como filas asumidas hay (' + avisan.length + ' de ' + nAsumidas + ')');
ok(avisan.every(function (e) { return e.pa == null; }),
   'ninguna de las que avisan tiene ángulo publicado: ' + avisan.map(function (e) { return e.id; }).join(', '));
ok(avisan.length < dobles.length * 0.05,
   'el aviso es la excepción, no la norma (' + avisan.length + ' de ' + dobles.length + ' dobles)');

console.log(fallos ? '\n' + fallos + ' FALLOS' : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
