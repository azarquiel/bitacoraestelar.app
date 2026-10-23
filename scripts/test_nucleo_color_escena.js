#!/usr/bin/env node
/* El núcleo del punto de la escena 3D puede llevar el color de cada objeto
   (colores.nucleo como función). Con un crema fijo, el color de la clase solo
   vivía en el halo y las estrellas del vecindario parecían todas iguales.
   Sin dependencias:  node scripts/test_nucleo_color_escena.js  */
'use strict';
var fallos = 0;
function ok(c, e) { if (c) console.log('  ok   ' + e); else { fallos++; console.error('  FALLA ' + e); } }

var G = require('../resources/js/bitacora-gaia-color.js');
global.VLCentro = require('../mapa/js/via-lactea-centro.js');
global.VLEscalas = require('../mapa/js/via-lactea-escalas.js');
global.VLViaje = { movimientoReducido: function () { return true; } };
global.VLMarcadorEstilo = require('../mapa/js/via-lactea-marcador-estilo.js');
global.VLObservadores = { visiblePorObservador: function () { return true; }, atenuadoPorObservador: function () { return false; },
  simboloDe: function () { return 'punto'; }, ANILLO_NO_VISITADO: { grosor: 1 }, trazarSimbolo: function () {} };
var E = require('../mapa/js/via-lactea-escena3d.js');

function rgba(bprp) { return 'rgba(' + G.colorPorBpRp(bprp).join(',') + ',1)'; }

// Pinta un fotograma con dos estrellas y devuelve el fillStyle de cada núcleo.
function nucleos(nucleo) {
  var fills = [];
  var ctx = new Proxy({}, {
    set: function (t, k, v) { t[k] = v; return true; },
    get: function (t, k) {
      if (k in t) return t[k];
      if (k === 'createRadialGradient') return function () { return { addColorStop: function () {} }; };
      if (k === 'fill') return function () { fills.push(t.fillStyle); };
      if (k === 'measureText') return function () { return { width: 0 }; };
      return function () {};
    } });
  var ventana = { innerWidth: 1000, innerHeight: 600, devicePixelRatio: 1, addEventListener: function () {},
    requestAnimationFrame: function (f) { ventana.f = f; } };
  var e = E.crear({ ventana: ventana, documento: { getElementById: function () { return null; } },
    canvas: { style: {}, addEventListener: function () {}, getContext: function () { return ctx; } },
    stage: { addEventListener: function () {}, style: {} }, tip: null, scaleTag: null,
    objetos: [{ id: 'o', name: 'O', x: 100, y: 0, z: 0, bprp: -0.35 }, { id: 'm', name: 'M', x: -100, y: 0, z: 0, bprp: 2.6 }],
    yaw: 0, pitch: 0, fovMin: 10, fovMax: 1000, autoGiro: 0,
    colores: { fondo: { y: .5, centro: '#000', medio: '#000', borde: '#000' }, estrellas: { n: 0, rgb: '0,0,0' },
      rejilla: { rgb: '0,0,0', alfa: 0, eje: 0, rotulo: '#000' }, nucleo: nucleo, alfaEtiqueta: 1 },
    rgba: function () { return 'rgba(0,0,0,0)'; }, volver: {}, pintarOrigen: function () {}, alClic: function () {} });
  e.sync(0, 1); ventana.f(0);
  return fills.filter(function (f) { return typeof f === 'string' && f !== '#000'; });
}

var f = nucleos(function (o) { return rgba(o.bprp); });
ok(f.indexOf(rgba(-0.35)) >= 0 && f.indexOf(rgba(2.6)) >= 0, 'cada núcleo lleva el color de su objeto (O azul, M naranja)');
f = nucleos('#fff9ef');
ok(f.indexOf(rgba(-0.35)) < 0 && f.filter(function (x) { return x === '#fff9ef'; }).length === 2, 'un color fijo sigue valiendo (Grupo Local)');

if (fallos) { console.error(fallos + ' fallo(s)'); process.exit(1); }
console.log('todo bien');
