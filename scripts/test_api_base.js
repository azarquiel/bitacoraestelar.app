#!/usr/bin/env node
/* Test del ACCESO ÚNICO A LA API (BitacoraBase.api / ruta / errorDe / flash,
   resources/js/bitacora-base.js).

   Había cinco copias de api() en los módulos de registro y ya habían
   divergido: tres políticas de Content-Type, mensajes 401/403 dispares y once
   derivaciones por regex del endpoint (una con un regex distinto que rompía
   con barra final). Este test fija el contrato de la fuente única.

   Sin dependencias ni red: fetch de mentira.
   node scripts/test_api_base.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-base.js');
var B = global.window.BitacoraBase;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

global.window.BITACORA_WP = {
  endpoint: 'https://bitacoraestelar.app/wp-json/bitacora/v1/observaciones',
  nonce: 'n0nc3'
};

/* fetch de mentira: apunta la petición y responde lo que diga PROXIMA. */
var pedido = null;
var PROXIMA = { ok: true, status: 200, json: '{"hola":1}' };
global.fetch = function (url, opts) {
  pedido = { url: url, opts: opts };
  var r = PROXIMA;
  return Promise.resolve({
    ok: r.ok, status: r.status,
    json: function () {
      try { return Promise.resolve(JSON.parse(r.json)); }
      catch (e) { return Promise.reject(e); }
    }
  });
};

var casos = [];

/* 1 ─ api(): nonce, cookie y forma del resultado */
casos.push(function () {
  console.log('1. api(): cabeceras y forma del resultado');
  return B.api('https://x/api').then(function (res) {
    ok(pedido.opts.credentials === 'same-origin', 'cookie de sesión (same-origin)');
    ok(pedido.opts.headers['X-WP-Nonce'] === 'n0nc3', 'X-WP-Nonce puesto');
    ok(pedido.opts.headers['Content-Type'] === undefined, 'sin body no hay Content-Type');
    ok(res.ok === true && res.status === 200 && res.data.hola === 1, 'resultado {ok, status, data}');
  });
});

/* 2 ─ api(): el body objeto se serializa; el string va tal cual */
casos.push(function () {
  console.log('2. api(): política única de body');
  return B.api('https://x/api', { method: 'POST', body: { a: 1 } }).then(function () {
    ok(pedido.opts.headers['Content-Type'] === 'application/json', 'objeto: Content-Type JSON');
    ok(pedido.opts.body === '{"a":1}', 'objeto: serializado una sola vez');
    return B.api('https://x/api', { method: 'POST', body: '{"crudo":true}' });
  }).then(function () {
    ok(pedido.opts.headers['Content-Type'] === 'application/json', 'string: también lleva Content-Type');
    ok(pedido.opts.body === '{"crudo":true}', 'string: va tal cual, sin doble serializado');
  });
});

/* 3 ─ api(): una respuesta sin JSON válido no revienta */
casos.push(function () {
  console.log('3. api(): respuesta sin JSON');
  PROXIMA = { ok: false, status: 500, json: 'no soy json' };
  return B.api('https://x/api').then(function (res) {
    ok(res.ok === false && res.status === 500, 'el estado HTTP se conserva');
    ok(res.data && Object.keys(res.data).length === 0, 'data = {} (el parseo nunca rechaza)');
    PROXIMA = { ok: true, status: 200, json: '{}' };
  });
});

/* 4 ─ ruta(): la única derivación del endpoint, con y sin barra final */
casos.push(function () {
  console.log('4. ruta(): endpoints hermanos de observaciones');
  var raiz = 'https://bitacoraestelar.app/wp-json/bitacora/v1/';
  ok(B.ruta('bases') === raiz + 'bases', 'bases');
  ok(B.ruta('viajes/de-la-noche') === raiz + 'viajes/de-la-noche', 'camino compuesto');
  global.window.BITACORA_WP.endpoint = raiz + 'observaciones/';
  ok(B.ruta('equipo') === raiz + 'equipo', 'con barra final también (el regex de listado rompía aquí)');
  global.window.BITACORA_WP.endpoint = raiz + 'observaciones';
  return Promise.resolve();
});

/* 5 ─ errorDe(): mensajes por parámetro, no por reimplementación */
casos.push(function () {
  console.log('5. errorDe(): 401/403 y respaldos');
  ok(B.errorDe({ status: 401, data: {} }, 'No se pudo') === 'Debes iniciar sesión.', '401 por defecto');
  ok(B.errorDe({ status: 403, data: {} }, 'No se pudo', { m403: 'Solo puedes tocar tu propio equipo.' })
     === 'Solo puedes tocar tu propio equipo.', '403 con texto del dominio');
  ok(B.errorDe({ status: 403, data: { message: 'del servidor' } }, 'No se pudo') === 'del servidor',
     '403 sin texto propio: manda el mensaje del servidor');
  ok(B.errorDe({ status: 500, data: {} }, 'No se pudo') === 'No se pudo (error 500)', 'respaldo con el estado');
  return Promise.resolve();
});

/* 6 ─ flash(): aviso efímero sobre #flash */
casos.push(function () {
  console.log('6. flash(): el aviso efímero');
  var el = { textContent: '', className: '' };
  global.document = { getElementById: function (id) { return id === 'flash' ? el : null; } };
  B.flash('Guardado.');
  ok(el.textContent === 'Guardado.' && el.className === 'flash show', 'aviso normal');
  B.flash('Fallo.', true);
  ok(el.className === 'flash show err', 'aviso de error');
  clearTimeout(B.flash._t);   // que el test no se quede vivo por el temporizador
  return Promise.resolve();
});

(function corre(i) {
  if (i >= casos.length) {
    console.log(fallos ? ('\n' + fallos + ' fallo(s)') : '\nTodo en orden');
    process.exit(fallos ? 1 : 0);
  }
  casos[i]().then(function () { corre(i + 1); }, function (err) {
    fallos++; console.error('  FALLA (excepción) ' + (err && err.stack || err));
    corre(i + 1);
  });
})(0);
