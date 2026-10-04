/* #399: la pantalla de un objeto enseña éxitos y fracasos de todos.
   Contrato de VLViaje.otrasObservaciones (campos de comparación, nota cortada
   por palabra) y comprobaciones de fuente sobre via-lactea-app.js.
   Sin framework:  node scripts/test_ficha_explorado.js */
'use strict';
var fs = require('fs'), path = require('path');
// Node no trae DOMParser: un doble mínimo que quita etiquetas.
global.DOMParser = function () {
  this.parseFromString = function (h) { return { body: { textContent: h.replace(/<[^>]*>/g, '') } }; };
};
global.OBSERVADORES = { ana: { nombre: 'Ana' }, luis: { nombre: 'Luis' } };
var nota = '<p>' + 'cielo con mucha bruma y poca transparencia '.repeat(6) + '</p>';
global.OBSERVACIONES = { m1: [
  { observador: 'ana', fecha: '2026-03-01', resultado: 'no_visto', motivo: 'luna', bortle: 5,
    aumentos: [120, 250], entries: [{ boton: 'Exploración', html: nota }] },
  { observador: 'luis', fecha: '2026-05-10', sqm: 20.8, entries: [] }
] };
var VLV = require('../mapa/js/via-lactea-viaje.js');
var fallos = 0;
function ok(c, et) { if (c) console.log('  ok   ' + et); else { fallos++; console.log('  FALLA ' + et); } }

var o = VLV.otrasObservaciones('m1', null);
ok(o[0].clave === 'luis' && o[1].clave === 'ana', 'más reciente primero: un éxito de mayo antes que un fallo de marzo');
ok(o[0].visto === true && o[1].visto === false, 'visto / no visto');
ok(o[1].resultado === 'no_visto' && o[1].motivo === 'luna', 'resultado y motivo');
ok(o[1].bortle === 5 && o[0].sqm === 20.8, 'cielo: Bortle o SQM');
ok(o[1].aumentos[0] === 120 && o[1].aumentos[1] === 250, 'aumentos probados');
ok(o[1].nota.length <= 121 && /[a-z]…$/.test(o[1].nota), 'nota ≤120 caracteres, cortada y con «…»');
ok(o[1].nota.slice(0, -1).split(' ').every(function (p) { return /^(cielo|con|mucha|bruma|y|poca|transparencia)$/.test(p); }), 'el corte cae en palabra entera');
ok(o[0].nota === '', 'sin nota de Exploración, vacía');

var src = fs.readFileSync(path.join(__dirname, '../mapa/js/via-lactea-app.js'), 'utf8');
ok(/EXPLORADO – NO CONFIRMADO/.test(src), 'rótulo de la pantalla');
ok(/Nadie lo ha confirmado todavía/.test(src), 'aliciente cuando nadie lo vio');
ok(/ lo confirmó/.test(src) && /no lo confirmaron/.test(src), 'balance «N lo confirmaron · M no lo confirmaron»');
ok(/'Tú'/.test(src), 'las filas propias dicen «Tú»');
ok(/dashed/.test(src), 'borde discontinuo en las no confirmadas');
ok(/\?derivar=/.test(src) && /Reintentar/.test(src), '«Reintentar» abre ?derivar=N');
ok(/position:sticky/.test(src) && /otras\.length > 8/.test(src), 'cabecera fija con más de 8 filas');
ok((src.match(/resultadoDe\((fichaId|id)\) === 'explorado'/g) || []).length === 2, 'las dos puertas de entrada abren la pantalla de explorado');

if (fallos) { console.log('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nTodo verde.');
