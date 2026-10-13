#!/usr/bin/env node
/* Test de la ESCENA 3D COMPARTIDA (mapa/js/via-lactea-escena3d.js, #443).
   Crea una escena con catálogo, lienzo, ventana y documento falsos y ejecuta
   su código: proyección, arrastre con sus topes, clic, sync y centro. Del bucle
   solo se ejecuta un fotograma, al final, para ver que pinta sin romperse.

   Sin dependencias:  node scripts/test_escena3d.js  */
'use strict';
var fallos = 0;
function ok(c, e) { if (c) console.log('  ok   ' + e); else { fallos++; console.error('  FALLA ' + e); } }
function casi(a, b) { return Math.abs(a - b) < 1e-9; }

global.VLCentro = require('../mapa/js/via-lactea-centro.js');
global.VLViaje = { movimientoReducido: function () { return true; } };
var E = require('../mapa/js/via-lactea-escena3d.js');

function oyente() {
  var h = {};
  return { h: h, style: {}, addEventListener: function (t, f) { (h[t] = h[t] || []).push(f); },
           disparar: function (t, e) { (h[t] || []).forEach(function (f) { f(e); }); } };
}
function nueva(extra) {
  var ctx = new Proxy({}, { get: function () { return function () { return { addColorStop: function () {}, width: 0 }; }; } });
  var ventana = oyente(), stage = oyente(), canvas = { style: {}, getContext: function () { return ctx; } };
  ventana.innerWidth = 1000; ventana.innerHeight = 600; ventana.devicePixelRatio = 1;
  ventana.rafs = 0; ventana.requestAnimationFrame = function (f) { ventana.rafs++; ventana.siguiente = f; };
  var op = {
    ventana: ventana, documento: { getElementById: function () { return null; } },
    canvas: canvas, stage: stage, tip: null, scaleTag: null,
    objetos: [{ id: 'a', name: 'A', x: 50, y: 0, z: 0 }],
    yaw: 0, pitch: 0, fovMin: 10, fovMax: 1000, autoGiro: 0.001,
    colores: { estrellas: { n: 0 } }, rgba: function () { return ''; }, volver: {},
    pintarOrigen: function () {}, alClic: function () {}
  };
  for (var k in extra) op[k] = extra[k];
  return { e: E.crear(op), ventana: ventana, stage: stage, canvas: canvas };
}

console.log('Proyección');
var t = nueva();
var R = 600 * 0.42;   // min(W, H) · 0,42
var o = t.e.project(E.ORIGEN);
ok(o.sx === 500 && o.sy === 300, 'el origen cae en el centro del lienzo (' + o.sx + ', ' + o.sy + ')');
var p = t.e.project({ x: 1000, y: 0, z: 0 });
ok(casi(p.sx, 500 + R) && casi(p.sy, 300), 'a giro 0, un punto a fov en +x cae a R a la derecha');
t.e.cam.yaw = Math.PI / 2;
p = t.e.project({ x: 1000, y: 0, z: 0 });
ok(casi(p.sx, 500) , 'girar 90° lo lleva al eje de profundidad');
ok(t.ventana.rafs === 1, 'el bucle se pide con requestAnimationFrame');

console.log('Arrastre');
t = nueva();
var abajo = { target: {}, clientX: 100, clientY: 100 };
t.stage.disparar('mousedown', abajo);
t.ventana.disparar('mousemove', { clientX: 150, clientY: 120 });
ok(t.e.cam.yaw === 0 && t.e.cam.pitch === 0, 'sin la capa a la vista no se arrastra');
t.ventana.disparar('mouseup', {});
t.e.sync(0, 1);
ok(t.e.interactivo(), 'con la capa a la vista es interactiva');
t.stage.disparar('mousedown', abajo);
t.ventana.disparar('mousemove', { clientX: 150, clientY: 120 });
ok(casi(t.e.cam.yaw, 50 * 0.006) && casi(t.e.cam.pitch, 20 * 0.006), 'yaw y pitch avanzan 0,006 rad por píxel');
t.ventana.disparar('mousemove', { clientX: 150, clientY: 5000 });
ok(casi(t.e.cam.pitch, Math.PI / 2 - 0.01), 'pitch topa en π/2 − 0,01');
t.ventana.disparar('mousemove', { clientX: 150, clientY: -9000 });
ok(casi(t.e.cam.pitch, -Math.PI / 2 + 0.01), 'y en −π/2 + 0,01');
t.ventana.disparar('mouseup', {});
var yaw = t.e.cam.yaw;
t.ventana.disparar('mousemove', { clientX: 900, clientY: 100 });
ok(t.e.cam.yaw === yaw, 'al soltar deja de girar');
t.stage.disparar('mousedown', { target: { closest: function () { return {}; } }, clientX: 0, clientY: 0 });
t.ventana.disparar('mousemove', { clientX: 300, clientY: 0 });
ok(t.e.cam.yaw === yaw, 'un arrastre que empieza en un control del visor no gira');
t.ventana.disparar('mouseup', {});

console.log('Táctil');
t.stage.disparar('touchstart', { target: {}, touches: [{ clientX: 0, clientY: 0 }] });
t.stage.disparar('touchmove', { touches: [{ clientX: 10, clientY: 0 }] });
ok(casi(t.e.cam.yaw, yaw + 0.06), 'el dedo gira igual que el ratón');
t.stage.disparar('touchend', {});

console.log('Clic');
var clicado = null;
t = nueva({ alClic: function (o) { clicado = o; } });
t.e.sync(0, 1);
var a = t.e.project({ x: 50, y: 0, z: 0 });
t.stage.disparar('mousedown', { target: {}, clientX: a.sx, clientY: a.sy });
t.ventana.disparar('mouseup', { clientX: a.sx, clientY: a.sy });
ok(clicado && clicado.id === 'a', 'clic sin arrastre sobre un objeto lo abre');

console.log('sync (zoom)');
t = nueva();
t.e.sync(R / 100, 1);
ok(casi(t.e.cam.fov, 100), 'fov = R / pxPerLy');
t.e.sync(R / 1, 1);
ok(t.e.cam.fov === 10, 'topa en fovMin');
t.e.sync(R / 1e9, 1);
ok(t.e.cam.fov === 1000, 'topa en fovMax');
t.e.cam.fovMax = 5000;
t.e.sync(R / 1e9, 1);
ok(t.e.cam.fov === 5000, 'la escena puede ampliar fovMax (búsqueda del Grupo Local)');
t.e.sync(R / 100, 0.3);
ok(!t.e.interactivo() && t.canvas.style.display === 'block', 'a medio fundido se ve pero no es interactiva');
t.e.sync(R / 100, 0);
ok(t.canvas.style.display === 'none', 'sin opacidad se oculta');

console.log('Centro');
t = nueva();
t.e.sync(0, 1);
t.e.centrar({ name: 'A', x: 50, y: 0, z: 0 });
var c = t.e.project({ x: 50, y: 0, z: 0 });
ok(c.sx === 500 && c.sy === 300 && t.e.centroDesplazado(), 'centrar (sin vuelo) pone el objeto en el centro');
ok(t.e.volver() === true && !t.e.centroDesplazado() && t.e.volver() === false, 'volver devuelve el centro al origen una vez');
t.e.centrar({ name: 'A', x: 50, y: 0, z: 0 });
t.e.sync(0, 0.2);
ok(!t.e.centroDesplazado(), 'salir de la escena devuelve el centro al origen');

console.log('Un fotograma');
global.performance = global.performance || { now: Date.now };
global.VLObservadores = { visiblePorObservador: function () { return true; }, atenuadoPorObservador: function () { return false; },
  simboloDe: function () { return 'punto'; }, ANILLO_NO_VISITADO: { grosor: 1 }, trazarSimbolo: function () {},
  resumenDe: function () { return ''; } };
global.VLMarcadorEstilo = { de: function () { return { escala: 1 }; }, radioPunto: function () { return 3; },
  canvas: function () { return 1; }, etiquetaVisible: function () { return true; } };
var pintados = 0;
t = nueva({ colores: { fondo: {}, estrellas: { n: 3, rgb: '1,2,3' }, rejilla: { rgb: '1,2,3', alfa: 0.3, eje: 0.1 }, alfaEtiqueta: 1 },
            pintarOrigen: function () { pintados++; } });
t.ventana.CONFIG = {};
t.e.sync(R / 100, 1);
var yaw0 = t.e.cam.yaw;
t.ventana.siguiente();
ok(pintados === 1 && t.ventana.rafs === 2, 'pinta el origen y pide el siguiente fotograma');
ok(casi(t.e.cam.yaw, yaw0 + 0.001), 'el giro ambiental avanza autoGiro por fotograma');

if (fallos) { console.error('\n' + fallos + ' fallo(s)'); process.exit(1); }
console.log('\nTodo bien');
