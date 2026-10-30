#!/usr/bin/env node
/* Test de «Compartir mi flota» (#497): ejecuta el módulo con una api falsa.

   Cubre los criterios con comportamiento: las dos listas y sus estados vacíos,
   el alta (éxito, ya-compartido, no-existe con un único mensaje, texto
   conservado), la revocación con confirmación y el foco que devuelve, y que un
   429 o un fallo de red nunca queden en silencio.

   Sin dependencias:  node scripts/test_compartir_flota.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-base.js');
var CF = require('../registro/resources/js/bitacora-compartir-flota.js');

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function seccion(t) { console.log('\n' + t); }

// api falsa: cola de respuestas; una función en la cola rechaza (fallo de red).
function apiFalsa(respuestas) {
  var llamadas = [];
  var f = function (url, opts) {
    llamadas.push({ url: url, opts: opts || {} });
    var r = respuestas.shift();
    return r === 'red' ? Promise.reject(new Error('red')) : Promise.resolve(r);
  };
  f.llamadas = llamadas;
  return f;
}
var URL = 'https://x/wp-json/bitacora/v1/equipo/compartir';
var lista = function (comparto, conmigo) { return { ok: true, status: 200, data: { comparto: comparto, conmigo: conmigo } }; };
var NO_EXISTE = { ok: false, status: 404, data: { codigo: 'no-encontrado-o-no-permitido', message: 'x' } };

(async function () {
  seccion('Criterio 1 · dos listas, con estados vacíos que orientan');
  var a = apiFalsa([lista(['Ana', 'Beto'], ['Carla'])]);
  var c = CF.crear({ api: a, url: URL });
  await c.cargar();
  var h = CF.pintar(c.estado);
  ok(h.comparto.indexOf('Ana') > 0 && h.comparto.indexOf('Beto') > 0, 'veo a quién comparto');
  ok(h.conmigo.indexOf('Carla') > 0, 'veo quién comparte conmigo');
  ok(h.conmigo.indexOf('<button') < 0, '«Comparten conmigo» es solo informativa: sin botones');
  ok(h.comparto.indexOf('aria-label="Dejar de compartir con Ana"') > 0, 'el aria-label de cada botón lleva el nombre');
  var v = CF.pintar({ comparto: [], conmigo: [], confirmando: null });
  ok(v.comparto.indexOf('Aún no compartes tu flota con nadie.') > 0 && v.conmigo.indexOf('cf-vacio') > 0, 'estados vacíos con texto');
  ok(CF.pintar({ comparto: ['<b>'], conmigo: [], confirmando: null }).comparto.indexOf('<b>') < 0, 'el nombre se escapa');

  seccion('Criterio 2 · alta');
  a = apiFalsa([lista(['Ana'], []), { ok: true, status: 201, data: { ok: true, nombre: 'Beto' } }]);
  c = CF.crear({ api: a, url: URL });
  await c.cargar();
  var r = await c.anadir('  Beto ');
  ok(r.vaciar === true && c.estado.comparto.join() === 'Ana,Beto', 'aparece en la lista (ordenado) y el campo se vacía');
  ok(JSON.parse(JSON.stringify(a.llamadas[1].opts.body)).usuario === 'Beto' && a.llamadas[1].opts.method === 'POST', 'POST con el nombre recortado');
  ok(c.estado.mensaje.tipo === 'ok', 'el resultado se anuncia');

  a = apiFalsa([lista(['Ana'], []), { ok: true, status: 200, data: { ok: true, codigo: 'ya-compartido', nombre: 'Ana' } }]);
  c = CF.crear({ api: a, url: URL }); await c.cargar();
  r = await c.anadir('Ana');
  ok(c.estado.mensaje.texto === 'Ya compartes con Ana.' && c.estado.mensaje.tipo === 'ok' && c.estado.comparto.length === 1, 'ya-compartido: aviso neutro, sin duplicar');

  a = apiFalsa([lista([], []), NO_EXISTE]);
  c = CF.crear({ api: a, url: URL }); await c.cargar();
  r = await c.anadir('nadie');
  ok(r.error && !r.vaciar, 'si falla, el campo conserva el texto');
  ok(c.estado.mensaje.texto.indexOf('No encontramos a nadie con ese nombre de usuario o no se puede compartir con esa persona.') === 0 &&
     c.estado.mensaje.texto.indexOf('Comprueba que está escrito igual que en su perfil.') > 0, 'mensaje único de no existe / no se puede');
  r = await c.anadir('   ');
  ok(r.error && a.llamadas.length === 2, 'campo vacío: se avisa y no se llama a la API');

  a = apiFalsa(['red', { ok: true, status: 201, data: { ok: true, nombre: 'Beto' } }, lista(['Beto'], [])]);
  c = CF.crear({ api: a, url: URL }); await c.cargar();
  r = await c.anadir('Beto');
  ok(r.vaciar && c.estado.comparto.join() === 'Beto' && c.estado.mensaje.tipo === 'ok', 'carga inicial fallida: el alta recarga y la persona aparece');

  seccion('Criterio 3 · revocar con confirmación');
  a = apiFalsa([lista(['Ana', 'Beto', 'Dani'], []), { ok: true, status: 200, data: { ok: true, nombre: 'Ana' } },
                { ok: true, status: 200, data: { ok: true } }, { ok: true, status: 200, data: { ok: true } }]);
  c = CF.crear({ api: a, url: URL }); await c.cargar();
  c.pedirRevocar('Ana');
  h = CF.pintar(c.estado);
  ok(h.comparto.indexOf('Ana dejará de poder elegir tu equipo. Sus observaciones ya guardadas no cambian.') > 0, 'la fila muestra la consecuencia');
  ok(h.comparto.indexOf('data-a="confirmar"') > 0 && h.comparto.indexOf('data-a="cancelar"') > 0 && h.comparto.indexOf('<dialog') < 0, 'confirmar y cancelar en la propia fila, sin modal');
  ok(c.cancelar() === 'Ana' && c.estado.confirmando === null && a.llamadas.length === 1, 'cancelar no llama a la API');
  r = await c.revocar('Ana');
  ok(c.estado.comparto.join() === 'Beto,Dani' && a.llamadas[1].opts.method === 'DELETE' && a.llamadas[1].url === URL + '?usuario=Ana', 'desaparece de la lista tras confirmar');
  ok(r.foco === 'Beto', 'el foco pasa a la fila siguiente');
  r = await c.revocar('Dani');
  ok(r.foco === null, 'si era la última, el foco va al encabezado');

  seccion('Criterio 4 · 429 y red, nunca en silencio');
  a = apiFalsa([lista([], []), { ok: false, status: 429, data: { codigo: 'limite-de-ritmo', espera: 42 } }, 'red']);
  c = CF.crear({ api: a, url: URL }); await c.cargar();
  await c.anadir('x');
  ok(/Espera 42 segundos/.test(c.estado.mensaje.texto) && c.estado.mensaje.tipo === 'error', '429: dice el tiempo de espera real');
  ok(c.estado.ocupado === false, 'el botón se libera tras el error');
  await c.anadir('x');
  ok(/No hemos podido conectar/.test(c.estado.mensaje.texto) && c.estado.mensaje.tipo === 'error', 'fallo de red: mensaje claro');
  ok(/1 segundo\b/.test(CF.mensajeError({ status: 429, data: { espera: 1 } })), 'singular');

  a = apiFalsa(['red']);
  c = CF.crear({ api: a, url: URL });
  await c.cargar();
  ok(c.estado.mensaje.tipo === 'error' && CF.pintar(c.estado).comparto.indexOf('No se pudo cargar') > 0, 'la lista que no carga se dice, no se deja en blanco');

  a = apiFalsa([lista(['Ana'], []), NO_EXISTE, lista([], [])]);
  c = CF.crear({ api: a, url: URL }); await c.cargar();
  await c.revocar('Ana');
  ok(c.estado.comparto.length === 0 && c.estado.mensaje.tipo === 'error', 'revocar algo que ya no estaba: avisa y recarga la lista');

  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTodo en orden');
  process.exit(fallos ? 1 : 0);
})();
