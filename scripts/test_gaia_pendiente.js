#!/usr/bin/env node
/* Contrato 202 del proxy de Gaia (#505, ADR 0014): un campo denso responde
   `202 {pendiente, reintentar_en}` mientras su job asíncrono corre. El 202 es
   `r.ok`, así que sin manejarlo llegaba como datos: una lista de estrellas
   vacía, cacheada para el resto de la sesión. Aquí: se vuelve a preguntar
   hasta el 200, esperar no gasta el reintento de los fallos y cancelar corta
   la espera.

   Sin dependencias:  node scripts/test_gaia_pendiente.js  */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function ok(cond, msg) {
  console.log('  ' + (cond ? 'ok  ' : 'FALLO') + '  ' + msg);
  if (!cond) fallos++;
}

// Respuestas en orden; reintentar_en diminuto para no esperar 10 s de verdad.
var PEND = { status: 202, cuerpo: { pendiente: true, reintentar_en: 0.01 } };
var DATOS = { status: 200, cuerpo: { data: [[1, 2, 10.5, 0.6], [3, 4, 11.0, 0.7]] } };
var E502 = { status: 502, cuerpo: { error: 'No hay respuesta de Gaia (CDS/GAVO)' } };
function guion(respuestas) {
  var n = { llamadas: 0 };
  global.fetch = function () {
    var r = respuestas[Math.min(n.llamadas++, respuestas.length - 1)];
    return Promise.resolve({ ok: r.status >= 200 && r.status < 300, status: r.status,
      json: function () { return Promise.resolve(r.cuerpo); } });
  };
  return n;
}

var ra = 100;   // cada caso en una RA distinta: consultar() cachea por coordenadas
function caso(nombre, fn) { return function () { console.log(nombre); return fn(ra++); }; }

[
  caso('202, 202 y 200 → las estrellas, no una lista vacía:', function (ra) {
    var n = guion([PEND, PEND, DATOS]);
    return R.consultar(ra, 20, 60, 18).then(function (e) {
      ok(e.length === 2, 'resuelve con las 2 estrellas del 200 (' + e.length + ')');
      ok(n.llamadas === 3, 'pregunta tres veces (' + n.llamadas + ')');
    });
  }),
  caso('el aviso de campo denso llega a quien pide, también si se une tarde:', function (ra) {
    var P2 = { status: 202, cuerpo: { pendiente: true, reintentar_en: 0.01, paso: 2, pasos: 3 } };
    guion([P2, P2, P2, DATOS]);
    var vistos = [], tardio = [];
    var p = R.consultar(ra, 20, 60, 18, { alPendiente: function (info) { vistos.push(info.paso); } });
    // Una segunda vista (o el precalentado ya en vuelo) se une con la entrada pendiente.
    setTimeout(function () {
      R.consultar(ra, 20, 60, 18, { alPendiente: function (info) { tardio.push(info.paso); } });
    }, 15);
    return p.then(function (e) {
      ok(vistos.length >= 1 && vistos[0] === 2, 'quien pidió recibe el aviso con el paso (' + vistos.join(',') + ')');
      ok(tardio.length >= 1, 'quien se une tarde lo recibe en cuanto se une (' + tardio.length + ')');
      ok(e.length === 2, 'y al final las estrellas');
      var viejo = 0;
      return R.consultar(ra, 20, 60, 18, { alPendiente: function () { viejo++; } }).then(function () {
        ok(viejo === 0, 'una vista posterior sobre la entrada ya resuelta no recibe el aviso viejo');
      });
    }).then(function () {
      var t = R.textoPendiente({ paso: 2, pasos: 3 });
      ok(/2 de 3/.test(t) && /abierta/.test(t), 'el texto dice el paso y que hay que dejar la página abierta («' + t + '»)');
    });
  }),
  caso('esperar no gasta el único reintento de los fallos:', function (ra) {
    var n = guion([PEND, E502, PEND, DATOS]);
    return R.consultar(ra, 20, 60, 18).then(function (e) {
      ok(e.length === 2 && n.llamadas === 4, '202, 502, 202, 200 → resuelve (' + n.llamadas + ' llamadas)');
    });
  }),
  caso('dos fallos siguen siendo un fallo de red:', function (ra) {
    guion([PEND, E502, E502]);
    return R.consultar(ra, 20, 60, 18).then(function () { ok(false, 'no debía resolver'); }, function (err) {
      ok(R.esFalloRed(err) && !R.esCancelada(err), 'rechaza como fallo de red');
    });
  }),
  caso('cancelar durante la espera corta el sondeo:', function (ra) {
    var n = guion([{ status: 202, cuerpo: { pendiente: true, reintentar_en: 30 } }]);
    var ctrl = new AbortController();
    var p = R.consultar(ra, 20, 60, 18, { signal: ctrl.signal });
    setTimeout(function () { ctrl.abort(); }, 20);
    var t0 = Date.now();
    return p.then(function () { ok(false, 'no debía resolver'); }, function (err) {
      ok(R.esCancelada(err), 'rechaza como cancelada');
      ok(Date.now() - t0 < 1000, 'sin esperar los 30 s del reintentar_en');
      ok(n.llamadas === 1, 'y no vuelve a preguntar (' + n.llamadas + ')');
    });
  })
].reduce(function (p, f) { return p.then(f); }, Promise.resolve()).then(function () {
  console.log(fallos === 0 ? '\n✓ Todo correcto.' : '\n✗ ' + fallos + ' fallo(s).');
  process.exit(fallos === 0 ? 0 : 1);
}, function (err) { console.error(err); process.exit(1); });
