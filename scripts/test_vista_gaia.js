#!/usr/bin/env node
/* Test de CONTRATO de vistaGaia(ctx, o) — la entrada honda de la vista de Gaia
   (resources/js/bitacora-gaia-render.js).

   Entra POR LA INTERFAZ, no por dentro: fetch de mentira (respuesta TAP
   enlatada, el patrón de test_resolutor.js), ctx falso que apunta llamadas, y
   ninguna dependencia de red ni de DOM real. Todo lo que se afirma aquí debe
   sobrevivir a cualquier refactor interno del pipeline (la máscara difusa, el
   orden de las capas…): si este test necesita tocarse por un cambio que no
   cambia el contrato, el test está mal.

   Contrato vigilado:
     1. Forma del resultado: { estrellas, estrellasDibujo, mlim, fondo,
        avisoCampo, galaxias } y `galaxias` es una promesa que resuelve {aviso}.
     2. El velo del campo denso (ADR 0014) recalcula la magnitud límite.
     3. El aviso de catálogo agotado lo redacta el módulo (fuente única).
     4. Cúmulo como dato: las sintéticas del núcleo entran en el dibujo.
     5. Cancelación: con vivo() falso resuelve {cancelada:true} SIN pintar.
     6. render() del formulario es un envoltorio: espera la capa de galaxias y
        conserva su resultado histórico {estrellas, mlim, fondo, aviso}.

   Sin dependencias:  node scripts/test_vista_gaia.js */
'use strict';

/* ── Lienzo de mentira (el patrón de test_dobles_spikes.js) ── */
function fakeCtx(el, registro) {
  var estado = { globalAlpha: 1 };
  return new Proxy({}, {
    get: function (t, prop) {
      if (prop === 'canvas') return el;
      if (prop === 'fillRect') return function () { if (registro) registro.fillRect++; };
      if (prop === 'putImageData') return function () { if (registro) registro.putImageData++; };
      if (prop === 'createImageData') return function (w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; };
      if (prop === 'getImageData') return function (x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; };
      if (prop === 'createRadialGradient') return function () { return { addColorStop: function () {} }; };
      if (prop === 'createLinearGradient') return function () { return { addColorStop: function () {} }; };
      if (prop in t) return t[prop];
      return function () {};
    },
    set: function (t, prop, val) { estado[prop] = val; t[prop] = val; return true; }
  });
}
function lienzo(size, registro) {
  var el = { width: size, height: size };
  el.getContext = function () { return fakeCtx(el, registro); };
  return el;
}

global.window = {};
global.document = {
  createElement: function () { return lienzo(64, null); }
};

/* ── fetch de mentira: cada caso deja aquí su respuesta TAP ── */
var RESPUESTA = { data: [], fondo: null };
global.fetch = function () {
  return Promise.resolve({ ok: true, json: function () { return Promise.resolve(RESPUESTA); } });
};

require('../resources/js/bitacora-gaia-color.js');
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/lf-globulares-datos.js');
require('../simulador_ocular/resources/js/globulares-datos.js');
require('../resources/js/bitacora-cumulos.js');
var R = global.window.BitacoraGaiaRender;
var CATALOGO = global.window.BITACORA_GLOBULARES;

/* La capa PS1 se apaga: sin red no hay parche que descargar, y su contrato
   («resuelve {aviso} y nunca rechaza») se afirma igual con la capa apagada. */
R.galaxiasImagen = false;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

/* Equipo de referencia: 200 mm a 100x, cielo 21,5. */
function opts(extra) {
  var o = {
    ra: 10, dec: 5, arcmin: 30, size: 64,
    apertura: 200, aumentos: 100, transmision: 0.9, arana: true,
    sqm: 21.5, pupilaSalida: 2, pupilaOjo: 7, afov: 68, conGlow: true
  };
  for (var k in extra) o[k] = extra[k];
  return o;
}
// Cada caso usa una RA distinta: consultar() cachea por coordenadas y un caso
// no debe heredar el catálogo del anterior.
var RA = 10;
function estrella(g) { return [RA / 3600, 0, g, 0.5]; }

var casos = [];

/* 1 ─ forma del resultado, y galaxias como promesa interna */
casos.push(function () {
  RA += 10;
  RESPUESTA = { data: [estrella(6), estrella(14.5)], fondo: null };
  var reg = { fillRect: 0, putImageData: 0 };
  return R.vistaGaia(lienzo(64, reg).getContext('2d'), opts({ ra: RA })).then(function (r) {
    console.log('1. Forma del resultado');
    ok(Array.isArray(r.estrellas) && r.estrellas.length === 2, 'estrellas: el catálogo consultado (' + r.estrellas.length + ')');
    ok(r.estrellasDibujo === r.estrellas, 'sin cúmulo, estrellasDibujo ES la muestra');
    ok(typeof r.mlim === 'number' && isFinite(r.mlim), 'mlim numérica (' + r.mlim.toFixed(2) + ')');
    ok(typeof r.fondo === 'number', 'fondo numérico (' + r.fondo + ')');
    ok(typeof r.avisoCampo === 'string', 'avisoCampo es texto');
    ok(r.galaxias && typeof r.galaxias.then === 'function', 'galaxias es una promesa');
    ok(reg.putImageData > 0, 'el campo se ha pintado (putImageData ' + reg.putImageData + ')');
    return r.galaxias.then(function (capa) {
      ok(typeof capa.aviso === 'string', 'galaxias resuelve {aviso} (capa apagada => vacío)');
    });
  });
});

/* 2 ─ el velo del campo denso recalcula la magnitud límite (ADR 0014) */
casos.push(function () {
  RA += 10;
  // Momentos de la banda truncada: flujo en unidades de una estrella G=0
  // sobre un círculo de 0,25°. veloSB debe salir no nulo y EMPEORAR mlim.
  var fondo = { corte: 15, n: 40000, flujo: 2e-4, m2: 0, rad: 0.25 };
  var velo = R.veloSB(fondo);
  console.log('2. Velo del campo denso');
  ok(velo != null && isFinite(velo), 'el fixture produce un velo válido (SB ' + (velo != null ? velo.toFixed(2) : '—') + ')');
  RESPUESTA = { data: [estrella(6)], fondo: null };
  var sinVelo;
  return R.vistaGaia(lienzo(64, null).getContext('2d'), opts({ ra: RA })).then(function (r) {
    sinVelo = r.mlim;
    RA += 10;
    RESPUESTA = { data: [estrella(6)], fondo: fondo };
    return R.vistaGaia(lienzo(64, null).getContext('2d'), opts({ ra: RA }));
  }).then(function (r) {
    ok(r.mlim < sinVelo, 'el velo baja la magnitud límite (' + r.mlim.toFixed(2) + ' < ' + sinVelo.toFixed(2) + ')');
  });
});

/* 3 ─ el aviso del catálogo agotado lo redacta el módulo */
casos.push(function () {
  RA += 10;
  RESPUESTA = { data: [estrella(6), estrella(8)], fondo: null };   // se agota en G=8, muy por encima del límite
  console.log('3. Aviso de catálogo agotado');
  return R.vistaGaia(lienzo(64, null).getContext('2d'), opts({ ra: RA })).then(function (r) {
    ok(r.avisoCampo.indexOf('se agotó en magnitud 8.0') !== -1, 'texto redactado con el corte (' + JSON.stringify(r.avisoCampo.slice(0, 60)) + '…)');
    ok(r.avisoCampo.indexOf(r.mlim.toFixed(1)) !== -1, 'y con la magnitud límite del equipo');
    RA += 10;
    RESPUESTA = { data: [estrella(6), estrella(r.mlim + 1)], fondo: null };   // catálogo más hondo que el equipo
    return R.vistaGaia(lienzo(64, null).getContext('2d'), opts({ ra: RA }));
  }).then(function (r) {
    ok(r.avisoCampo === '', 'catálogo más hondo que el equipo: sin aviso');
  });
});

/* 4 ─ cúmulo como dato: la frontera de resolución gobierna el dibujo.
   Con el CSV real de Gaia de M13 (el fixture del arnés del ADR 0012): la
   muestra trae ~12k estrellas, pero el núcleo aglomerado no se resuelve y el
   sorteo del crowding deja fuera a la mayoría — su luz pasa al campo
   estadístico (velo + grano). Las sintéticas del núcleo NO son visibles con
   ningún equipo razonable (nacen bajo la magnitud límite, ver
   test_conservacion_sorteo.js): lo observable por la interfaz es que la lista
   de dibujo es OTRA, más corta, y no la muestra tal cual. */
casos.push(function () {
  var e = CATALOGO.filter(function (f) { return f[0] === 'NGC 6205'; })[0];   // M13
  var cum = { id: e[0], ra: e[2], dec: e[3], rc: e[4], rh: e[5], c: e[6], muV0: e[7],
              Vt: e[8], dkpc: e[9], ebv: e[10], feh: e[11], elip: e[12], pa: null };
  var gaia = require('fs').readFileSync(__dirname + '/../simulador_ocular/docs/validacion/m13_gaia_dr3.csv', 'utf8')
    .trim().split('\n').slice(1).map(function (l) {
      var c = l.split(',');
      return [+c[0], +c[1], +c[2], c[3] === '' ? null : +c[3]];
    });
  RESPUESTA = { data: gaia, fondo: null };
  console.log('4. Cúmulo globular como dato');
  return R.vistaGaia(lienzo(256, null).getContext('2d'),
                     opts({ ra: cum.ra, dec: cum.dec, arcmin: 25, size: 256, cumulo: cum,
                            apertura: 467, aumentos: 173, sqm: 21.0, pupilaSalida: 467 / 173 })).then(function (r) {
    ok(r.estrellasDibujo !== r.estrellas, 'el cúmulo produce su propia lista de dibujo');
    ok(r.estrellasDibujo.length > 0 && r.estrellasDibujo.length < r.estrellas.length,
       'el crowding deja fuera el núcleo no resuelto (' + r.estrellasDibujo.length + ' de ' + r.estrellas.length + ')');
  });
});

/* 5 ─ cancelación: resuelve {cancelada:true} sin pintar el campo */
casos.push(function () {
  RA += 10;
  RESPUESTA = { data: [estrella(6)], fondo: null };
  var reg = { fillRect: 0, putImageData: 0 };
  console.log('5. Cancelación');
  return R.vistaGaia(lienzo(64, reg).getContext('2d'),
                     opts({ ra: RA, vivo: function () { return false; } })).then(function (r) {
    ok(r.cancelada === true, 'resuelve {cancelada:true} — no rechaza (el rechazo significa «Gaia no responde»)');
    ok(reg.putImageData === 0, 'y el campo NO se ha pintado (putImageData 0)');
  });
});

/* 6 ─ render() del formulario: envoltorio que espera la capa */
casos.push(function () {
  RA += 10;
  RESPUESTA = { data: [estrella(6), estrella(14.5)], fondo: null };
  console.log('6. render() como envoltorio de vistaGaia');
  return R.render(lienzo(64, null), {
    ra: RA, dec: 5, arcmin: 30, apertura: 200, aumentos: 100, transmision: 0.9,
    arana: true, sqm: 21.5, pupilaSalida: 2, pupilaOjo: 7, afov: 68, conGlow: true
  }).then(function (r) {
    ok(Array.isArray(r.estrellas) && typeof r.mlim === 'number' && typeof r.fondo === 'number',
       'conserva {estrellas, mlim, fondo}');
    ok(typeof r.aviso === 'string', 'y el aviso de la capa de galaxias');
  });
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
