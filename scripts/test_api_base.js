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

/* fetch de mentira: apunta la petición y responde lo que diga PROXIMA. Con
   colgada: true no responde nunca y solo sale por el abort, como un servidor
   que se queda pensando. */
var pedido = null;
var PROXIMA = { ok: true, status: 200, json: '{"hola":1}' };
global.fetch = function (url, opts) {
  pedido = { url: url, opts: opts };
  var r = PROXIMA;
  if (r.colgada) {
    return new Promise(function (_, rechaza) {
      opts.signal.addEventListener('abort', function () {
        var e = new Error('aborted'); e.name = 'AbortError'; rechaza(e);
      });
    });
  }
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
    ok(res.sinJson === true && !res.timeout, 'sinJson marca que el cuerpo no era JSON');
    PROXIMA = { ok: true, status: 200, json: '{}' };
    return B.api('https://x/api');
  }).then(function (res) {
    ok(!res.sinJson, 'con JSON válido no hay sinJson');
  });
});

/* 3b ─ api(): timeout por petición, distinto de un error HTTP (#463) */
casos.push(function () {
  console.log('3b. api(): timeout');
  PROXIMA = { colgada: true };
  var t0 = Date.now();
  return B.api('https://x/api', { timeout: 20 }).then(function (res) {
    ok(res.timeout === true, 'resuelve con timeout: true');
    ok(res.ok === false && res.status === 0, 'ok false y status 0: no hubo respuesta HTTP');
    ok(Date.now() - t0 < 1000, 'aborta a su hora, no espera al servidor');
    PROXIMA = { ok: true, status: 200, json: '{}' };
    return B.api('https://x/api', { timeout: 20 });
  }).then(function (res) {
    ok(res.ok === true && !res.timeout, 'si responde a tiempo, sin timeout');
  });
});

/* 3c ─ api(): un fallo de red sigue rechazando (no es un timeout) */
casos.push(function () {
  console.log('3c. api(): fallo de red');
  var fetchBueno = global.fetch;
  global.fetch = function () { return Promise.reject(new TypeError('Failed to fetch')); };
  return B.api('https://x/api').then(function () {
    ok(false, 'debía rechazar');
  }, function (e) {
    ok(e instanceof TypeError, 'rechaza con el error de red tal cual');
  }).then(function () { global.fetch = fetchBueno; });
});

/* 3d ─ api(): un Blob (subida de medios) va tal cual, con su Content-Type */
casos.push(function () {
  console.log('3d. api(): body Blob');
  var b = new Blob(['xx'], { type: 'image/png' });
  return B.api('https://x/media', { method: 'POST', body: b, headers: { 'Content-Type': 'image/png' } }).then(function () {
    ok(pedido.opts.body === b, 'el Blob no se serializa');
    ok(pedido.opts.headers['Content-Type'] === 'image/png', 'conserva su Content-Type');
    ok(pedido.opts.headers['X-WP-Nonce'] === 'n0nc3', 'y lleva el nonce');
  });
});

/* 3e ─ AC3: 504 en HTML al guardar → «no se sabe si se guardó» (#463) */
casos.push(function () {
  console.log('3e. guardar con 504 en HTML');
  var TEXTOS = { mIncierto: 'No se sabe si la observación se guardó. Revisa el listado antes de volver a enviarla.' };
  PROXIMA = { ok: false, status: 504, json: '<html>Gateway Time-out</html>' };
  return B.api('https://x/api', { method: 'POST', body: {} }).then(function (res) {
    var m = B.errorDe(res, 'No se pudo guardar', TEXTOS);
    ok(/no se sabe si/i.test(m) && /listado/.test(m), 'dice que no se sabe y manda al listado: ' + m);
    ok(!/contactar/.test(m), 'no dice «no se pudo contactar»');
    ok(B.errorDe({ ok: false, status: 0, timeout: true, data: {} }, 'x', TEXTOS).indexOf(TEXTOS.mIncierto) === 0,
       'el timeout también es incierto');
    ok(B.errorDe({ ok: false, status: 0, timeout: true, data: {} }, 'x') === 'El servidor no respondió a tiempo.',
       'timeout sin texto propio');
    ok(B.errorDe({ status: 500, data: { code: 'internal_server_error', message: '<p>Error crítico</p>' } }, 'x', TEXTOS)
       .indexOf(TEXTOS.mIncierto) === 0, 'el fatal de PHP en JSON de WordPress también es incierto');
    ok(B.errorDe({ status: 500, data: { code: 'bitacora_x', message: 'Falta el objeto.' } }, 'x', TEXTOS)
       === 'Falta el objeto.', 'un 500 con mensaje propio del plugin se enseña tal cual');
    ok(B.errorDe({ status: 504, sinJson: true, data: {} }, 'No se pudo') === 'No se pudo (error 504)',
       'sin mIncierto, el 5xx sigue con el respaldo de siempre');
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
