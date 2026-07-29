#!/usr/bin/env node
/* Test del RESOLVEDOR DE OBJETO POR NOMBRE
   (`BitacoraBase.resolutorNombre`, resources/js/bitacora-base.js).

   El parseo de la respuesta ya lo fija test_sesame.js. Lo que se comprueba aquí
   es el ciclo que rodea a la consulta, que es donde estaban las diferencias
   entre las dos copias que había (el simulador y el formulario de registro):
   la espera tras la última tecla, no repetir la misma consulta y no pisar las
   coordenadas que el observador haya escrito a mano.

   Sin dependencias ni red: se sustituye fetch por uno de mentira.
   node scripts/test_resolutor.js  */
'use strict';

global.window = {};
require('../resources/js/bitacora-base.js');
var B = global.window.BitacoraBase;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

/* Respuesta real del CDS para M42, recortada a lo que lee leerSesame. */
var M42 = '%C.0 HII\n%J 83.82010000 -5.38760000 = 05 35 16.8    -05 23 15\n';
var SIN_RESULTADO = '#!Sesame: nothing found\n';

var consultas = [];      // cada URL pedida
var respuesta = M42;
global.fetch = function (url) {
  consultas.push(url);
  return Promise.resolve({ text: function () { return Promise.resolve(respuesta); } });
};

// Espera corta para no alargar el test; en producción son 700 ms.
var ESPERA = 20;
function tras(ms, fn) { return new Promise(function (res) { setTimeout(function () { fn(); res(); }, ms); }); }

function nuevo(opts) {
  opts = opts || {};
  var visto = { resueltos: [], estados: [] };
  visto.resolutor = B.resolutorNombre({
    espera: ESPERA,
    puedeEscribir: opts.puedeEscribir,
    onResuelto: function (d) { visto.resueltos.push(d); },
    onEstado: function (estado, q) { visto.estados.push(estado + ':' + q); }
  });
  return visto;
}

function seccion(t) { console.log('\n' + t); }

Promise.resolve()

  /* ── 1. Se espera a que deje de teclear ────────────────────────────────────
     Escribir «M42» letra a letra debe producir UNA consulta, no tres. */
  .then(function () {
    seccion('Una sola consulta por ráfaga de tecleo:');
    consultas = []; respuesta = M42;
    var v = nuevo();
    'M42'.split('').reduce(function (acc, _c, i) {
      v.resolutor.programar('M42'.slice(0, i + 1));
      return acc;
    }, null);
    ok(consultas.length === 0, 'no se consulta mientras se teclea');
    return tras(ESPERA * 3, function () {
      ok(consultas.length === 1, 'una consulta tras la espera (' + consultas.length + ')');
      ok(/M42/.test(consultas[0]), 'se consulta el texto completo, no un prefijo');
      ok(v.resueltos.length === 1, 'un resultado');
      ok(Math.abs(v.resueltos[0].ra - 83.8201) < 1e-6 && Math.abs(v.resueltos[0].dec + 5.3876) < 1e-6,
        'RA/Dec en grados desde la respuesta del CDS');
      ok(v.resueltos[0].q === 'M42', 'devuelve el nombre consultado');
      ok(v.resueltos[0].otype === 'HII', 'devuelve el tipo de objeto');
    });
  })

  /* ── 2. Menos de dos letras no es un nombre ────────────────────────────────*/
  .then(function () {
    seccion('Nombres demasiado cortos:');
    consultas = [];
    var v = nuevo();
    v.resolutor.programar('M');
    v.resolutor.programar(' ');
    v.resolutor.programar('');
    return tras(ESPERA * 3, function () {
      ok(consultas.length === 0, 'ni se consulta');
      ok(v.estados.length === 0, 'ni se avisa de nada');
    });
  })

  /* ── 3. La misma consulta no se repite ─────────────────────────────────────
     Volver al mismo nombre (borrar una letra y reescribirla) no debe disparar
     otra consulta al CDS. */
  .then(function () {
    seccion('Deduplicado de la última consulta:');
    consultas = [];
    var v = nuevo();
    v.resolutor.programar('NGC 6826');
    return tras(ESPERA * 3, function () {}).then(function () {
      v.resolutor.programar('NGC 6826');
      return tras(ESPERA * 3, function () {
        ok(consultas.length === 1, 'el mismo nombre no se vuelve a consultar (' + consultas.length + ')');
      });
    });
  })

  /* ── 4. No se pisa lo que el observador escribió a mano ────────────────────
     Es la guarda que solo tenía el formulario de registro; ahora la tienen los
     dos. Dos momentos distintos: antes de programar y al volver la respuesta. */
  .then(function () {
    seccion('Coordenadas escritas a mano:');
    consultas = [];
    var libre = false;
    var v = nuevo({ puedeEscribir: function () { return libre; } });
    v.resolutor.programar('M13');
    return tras(ESPERA * 3, function () {
      ok(consultas.length === 0, 'con las cajetillas ocupadas ni se consulta');
    });
  })
  .then(function () {
    // Ahora la carrera de verdad: las cajetillas están libres al programar y el
    // observador escribe sus coordenadas MIENTRAS el CDS responde.
    consultas = []; respuesta = M42;
    var libre = true;
    var v = nuevo({ puedeEscribir: function () { return libre; } });
    var fetchNormal = global.fetch;
    global.fetch = function (url) { libre = false; return fetchNormal(url); };
    v.resolutor.programar('M13');
    return tras(ESPERA * 3, function () {
      global.fetch = fetchNormal;
      ok(consultas.length === 1, 'la consulta ya iba en camino');
      ok(v.resueltos.length === 0, 'pero el resultado se descarta: manda lo tecleado');
    });
  })

  /* ── 5. Estados: buscando → nada / error ───────────────────────────────────*/
  .then(function () {
    seccion('Avisos de estado:');
    respuesta = SIN_RESULTADO;
    var v = nuevo();
    v.resolutor.programar('Objeto Inexistente 42');
    return tras(ESPERA * 3, function () {
      ok(v.estados[0] === 'buscando:Objeto Inexistente 42', 'primero avisa de que busca');
      ok(v.estados[1] === 'nada:Objeto Inexistente 42', 'y luego de que no está en SIMBAD');
      ok(v.resueltos.length === 0, 'sin resultado no se escribe nada');
    });
  })
  .then(function () {
    var v = nuevo();
    global.fetch = function () { return Promise.reject(new Error('sin red')); };
    v.resolutor.programar('M42');
    return tras(ESPERA * 3, function () {
      ok(v.estados[v.estados.length - 1] === 'error:M42', 'la red caída avisa como error');
      ok(v.resueltos.length === 0, 'y no escribe coordenadas');
    });
  })

  .then(function () {
    console.log('\n' + (fallos === 0 ? '✓ Todo correcto.' : '✗ ' + fallos + ' fallo(s).'));
    process.exit(fallos === 0 ? 0 : 1);
  })
  .catch(function (e) {
    console.error('Error inesperado en el test:', e);
    process.exit(1);
  });
