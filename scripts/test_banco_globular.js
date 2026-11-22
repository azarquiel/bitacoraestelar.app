#!/usr/bin/env node
/* Test de CONTRATO del banco del globular en el cliente (#583, ADR 0041):
   consultar() de resources/js/bitacora-gaia-render.js con un servidor de
   mentira que sirve el manifiesto del banco, los .bin (con Range) y el proxy
   con `excl`. Entra por la interfaz pública (consultar), no por dentro.

   Criterios de #583 que fija:
     AC1  una fila de campo llega con la marca (5º elemento true).
     AC3  la marca no cambia al cambiar de ocular (otro campo, otra mag).
     AC4  dentro del círculo del banco no se pide nada a Gaia; fuera, solo la
          franja (excl en la URL) y sus filas no repiten las del banco.
     AC5  sin manifiesto, sin fichero (404) o fichero ilegible: el camino de
          siempre, y nada falla.
   Además: el banco se pide por Range solo hasta la magnitud de la vista; un
   banco que en el cono pasa del techo se sirve como la segura del proxy
   (TOP 40 000 + fondo con los momentos del resto); y el proxy recibe la
   consulta ya cuantizada (caché del navegador = caché del disco).

   Sin dependencias:  node scripts/test_banco_globular.js */
'use strict';

global.window = {};
var PETICIONES = [];
var MUNDO = null;
global.fetch = function (url, init) { return servidor(url, init || {}); };

require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) console.log('  ok   ' + etiqueta);
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

/* ── Banco BGLO de mentira (formato de scripts/gen_banco_globulares.py) ── */
var CAB = 212;
function bancoBin(g, filas) {
  filas = filas.slice().sort(function (a, b) { return a[2] - b[2]; });
  var buf = new ArrayBuffer(CAB + 12 * filas.length), v = new DataView(buf);
  'BGLO'.split('').forEach(function (ch, i) { v.setUint8(i, ch.charCodeAt(0)); });
  v.setUint16(4, 1, true); v.setUint16(6, 1, true);
  v.setFloat64(8, g.ra, true); v.setFloat64(16, g.dec, true);
  v.setFloat32(24, 1.08, true); v.setFloat32(28, 0.4, true);
  v.setUint32(32, filas.length, true);
  v.setUint32(36, filas.filter(function (f) { return f[4]; }).length, true);
  v.setUint16(40, 42, true); v.setUint16(42, 500, true);
  var hist = new Array(42).fill(0);
  filas.forEach(function (f) { hist[Math.floor(Math.floor(f[2] * 1000 + 1e-6) / 500)]++; });
  hist.forEach(function (n, k) { v.setUint32(44 + 4 * k, n, true); });
  filas.forEach(function (f, k) {
    var o = CAB + 12 * k;
    v.setFloat32(o, f[0], true); v.setFloat32(o + 4, f[1], true);
    v.setUint16(o + 8, Math.floor(f[2] * 1000 + 1e-6) | (f[4] ? 0x8000 : 0), true);
    v.setInt16(o + 10, f[3] == null ? -32768 : Math.round(f[3] * 1000), true);
  });
  return buf;
}
function distancia(ra1, de1, ra2, de2) {
  var r = Math.PI / 180;
  var s = Math.pow(Math.sin((de2 - de1) * r / 2), 2) +
          Math.cos(de1 * r) * Math.cos(de2 * r) * Math.pow(Math.sin((ra2 - ra1) * r / 2), 2);
  return 2 * Math.asin(Math.sqrt(s)) / r;
}
function respuesta(status, cuerpo, extra) {
  return { ok: status >= 200 && status < 300, status: status,
           json: function () { return Promise.resolve(cuerpo); },
           arrayBuffer: function () { return Promise.resolve(cuerpo); } };
}

/* Un globular en (ra, dec) con el cielo entero hasta 2°: el banco son las de
   ≤ 1,08°, la franja el resto. */
var G = { id: 'NGC 9999', ra: 250.42, dec: 36.46, archivo: 'NGC_9999.bin' };
function estrellas() {
  var out = [], a = 7;
  function rnd() { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; }
  for (var k = 0; k < 1000; k++) {
    // 600 por todo el cielo hasta 2° y 400 en un núcleo de 0,3°.
    var r = (k < 600 ? 2 : 0.3) * Math.sqrt(rnd()), th = 2 * Math.PI * rnd();
    var dec = G.dec + r * Math.sin(th), ra = G.ra + r * Math.cos(th) / Math.cos(G.dec * Math.PI / 180);
    var g = Math.round((6 + 13.9 * rnd()) * 1000) / 1000;
    out.push([Math.fround(ra), Math.fround(dec), g, Math.round(rnd() * 2000) / 1000, rnd() < 0.2]);
  }
  return out;
}
var CIELO = estrellas();
// El catálogo Harris de la página: sin un globular cerca no se espera al manifiesto.
global.window.BITACORA_GLOBULARES = [[G.id, '', G.ra, G.dec]];
var MANIFIESTO = { version: 1, formato: 'BGLO', regla: 1, rmax: 1.08, gmax: 20, ruta: 'r1/{archivo}',
                   globulares: [{ id: G.id, ra: G.ra, dec: G.dec, archivo: G.archivo, filas: 0 }] };

function mundo(extra) {
  var m = { manifiesto: MANIFIESTO, banco: CIELO, binStatus: 200, sinRange: false, roto: false };
  for (var k in extra) m[k] = extra[k];
  return m;
}
function servidor(url, init) {
  var M = MUNDO;
  PETICIONES.push({ url: url, range: init.headers && init.headers.Range });
  if (/avance\/manifiesto\.json$/.test(url)) return Promise.resolve(respuesta(404, null));
  if (/banco_globular\/manifiesto\.json$/.test(url)) {
    return Promise.resolve(M.manifiesto ? respuesta(200, M.manifiesto) : respuesta(404, null));
  }
  if (/banco_globular\/r1\//.test(url)) {
    if (M.binStatus !== 200) return Promise.resolve(respuesta(M.binStatus, null));
    var bin = M.roto ? new ArrayBuffer(100) : bancoBin(G, M.banco.filter(function (s) {
      return distancia(G.ra, G.dec, s[0], s[1]) <= 1.08;
    }));
    var rg = init.headers && init.headers.Range;
    if (!rg || M.sinRange) return Promise.resolve(respuesta(200, bin));
    var m = /bytes=(\d+)-(\d+)/.exec(rg);
    return Promise.resolve(respuesta(206, bin.slice(+m[1], Math.min(+m[2] + 1, bin.byteLength))));
  }
  // El proxy: cono cuantizado, G ≤ mag y, con excl, fuera del círculo.
  var q = {};
  url.split('?')[1].split('&').forEach(function (kv) { var p = kv.split('='); q[p[0]] = decodeURIComponent(p[1]); });
  var cono = R.conoProxy(+q.ra, +q.dec, +q.rad), mag = Math.ceil(+q.mag / 0.5 - 1e-9) * 0.5;
  var ex = q.excl ? q.excl.split(',').map(Number) : null;
  var data = CIELO.filter(function (s) {
    return distancia(cono.ra, cono.dec, s[0], s[1]) <= cono.rad && s[2] <= mag &&
           (!ex || distancia(ex[0], ex[1], s[0], s[1]) > ex[2]);
  }).map(function (s) { return s.slice(0, 4); });          // Gaia no trae la marca
  return Promise.resolve(respuesta(200, { data: data, fondo: null }));
}
function nuevoMundo(extra) {
  MUNDO = mundo(extra); PETICIONES = [];
  for (var k in R.cacheGaia) delete R.cacheGaia[k];
  R.reiniciarBanco();
}
function alProxy() { return PETICIONES.filter(function (p) { return p.url.indexOf('gaia_proxy.php') >= 0; }); }
function alBanco() { return PETICIONES.filter(function (p) { return /banco_globular\/r1\//.test(p.url); }); }
function verdad(ra, dec, rad, mag) {
  var c = R.conoProxy(ra, dec, rad), m = Math.ceil(mag / 0.5 - 1e-9) * 0.5;
  return CIELO.filter(function (s) { return distancia(c.ra, c.dec, s[0], s[1]) <= c.rad && s[2] < m; });
}
function clave(s) { return [s[0], s[1], Math.floor(s[2] * 1000 + 1e-6), s[3] == null ? 'n' : Math.round(s[3] * 1000)].join('|'); }
function mismas(a, b) {
  var x = a.map(clave).sort(), y = b.map(clave).sort();
  return x.length === y.length && x.every(function (k, i) { return k === y[i]; });
}

var casos = [];

/* AC4 + AC1: un campo de 30′ sobre el núcleo cabe en el banco: nada a Gaia. */
casos.push(function () {
  console.log('Campo dentro del banco (AC1, AC4):');
  nuevoMundo();
  return R.consultar(G.ra, G.dec, 30, 16.2).then(function (lista) {
    var rad = R.radioConsulta(30), v = verdad(G.ra, G.dec, rad, 16.2);
    ok(alProxy().length === 0, 'ninguna petición al proxy (' + alProxy().length + ')');
    ok(mismas(lista, v), 'las filas son las del cono hasta la mag cuantizada (' + lista.length + ' de ' + v.length + ')');
    var campo = lista.filter(R.esCampo), esperadas = CIELO.filter(function (s) { return s[4]; }).map(clave);
    ok(campo.length > 0 && campo.every(function (f) { return esperadas.indexOf(clave(f)) >= 0; }),
       'las de campo llegan con la marca (' + campo.length + ')');
    ok(lista.every(function (f) { return f.length === 4 || f[4] === true; }), 'los miembros, sin 5º elemento');
    var rg = alBanco().map(function (p) { return p.range; });
    ok(rg.length === 2 && rg[0] === 'bytes=0-211', 'cabecera por Range (' + rg.join(' ; ') + ')');
    var hasta = +/-(\d+)$/.exec(rg[1] || '-0')[1], n16 = CIELO.filter(function (s) {
      return distancia(G.ra, G.dec, s[0], s[1]) <= 1.08 && s[2] < 16.5; }).length;
    ok(hasta === 211 + 12 * n16, 'y las filas solo hasta G < 16,5 (' + rg[1] + ', ' + n16 + ' filas)');
  });
});

/* AC3: otra vista (90′, más honda) del mismo globular: misma marca. */
casos.push(function () {
  console.log('La marca no cambia con el ocular (AC3):');
  var antes;
  nuevoMundo();
  return R.consultar(G.ra, G.dec, 30, 16.2).then(function (a) {
    antes = a.filter(R.esCampo).map(clave);
    return R.consultar(G.ra + 0.0004, G.dec, 60, 19.3);
  }).then(function (b) {
    var ahora = b.filter(R.esCampo).map(clave);
    ok(antes.length > 0 && antes.every(function (k) { return ahora.indexOf(k) >= 0; }),
       'toda estrella de campo a 30′/16,2 sigue de campo a 60′/19,3 (' + antes.length + ')');
    ok(alProxy().length === 0, 'el 60′ centrado también cabe: sin proxy');
  });
});

/* AC4: un 90′ desplazado se sale del banco: solo la franja va a Gaia. */
casos.push(function () {
  console.log('Campo desplazado: banco dentro, franja fuera (AC4):');
  nuevoMundo();
  var ra = G.ra, dec = G.dec + 0.5, rad = R.radioConsulta(90);
  return R.consultar(ra, dec, 90, 17).then(function (lista) {
    var p = alProxy();
    ok(p.length === 1 && /[?&]excl=250\.42,36\.46,1\.07(&|$)/.test(p[0].url),
       'una petición, con el círculo excluido (centro cuantizado, R_MAX − 0,01°): ' + (p[0] || {}).url);
    ok(p.length === 1 && !/desde=/.test(p[0].url), 'la franja va sin desde: el núcleo no se pide nunca');
    ok(mismas(lista, verdad(ra, dec, rad, 17)), 'banco ∪ franja = el cono entero (' + lista.length + ')');
    var k = lista.map(clave).sort();
    ok(k.every(function (x, i) { return i === 0 || x !== k[i - 1]; }), 'ninguna estrella dos veces');
  });
});

/* Caché alineada: lo que se pide al proxy ya va cuantizado como gaia_cuantizar. */
casos.push(function () {
  console.log('Petición ya cuantizada (caché del navegador = disco):');
  nuevoMundo({ manifiesto: null });
  return R.consultar(10.12345, -20.98765, 30, 16.2).then(function () {
    var u = (alProxy()[0] || {}).url || '';
    ok(/ra=10\.123&dec=-20\.988&rad=0\.36&mag=16\.50/.test(u), 'ra/dec al 0,001°, rad al 0,01° ↑, mag al 0,5 ↑ (' + u + ')');
  });
});

/* Sin manifiesto todavía y lejos de todo globular: sale en este mismo turno. */
casos.push(function () {
  console.log('Lejos de los globulares no se espera al manifiesto:');
  nuevoMundo();
  R.reiniciarBanco();                     // manifiesto sin saber
  var p = R.consultar(10, -20, 30, 16.2);
  ok(alProxy().length === 1, 'el proxy se pide en el mismo turno (' + alProxy().length + ')');
  return p.then(function () {
    nuevoMundo(); R.reiniciarBanco();
    var q = R.consultar(G.ra, G.dec, 30, 16.2);
    ok(alProxy().length === 0, 'junto a un globular sí espera al manifiesto');
    return q.then(function () { ok(alProxy().length === 0 && alBanco().length === 2, 'y sirve del banco'); });
  });
});

/* AC5: sin manifiesto, 404 o fichero roto → el camino de siempre. */
casos.push(function () {
  console.log('Sin banco, el camino de siempre (AC5):');
  var rad = R.radioConsulta(30);
  nuevoMundo({ manifiesto: null });
  return R.consultar(G.ra, G.dec, 30, 16.2).then(function (lista) {
    ok(alProxy().length === 1 && !/excl=/.test(alProxy()[0].url) && alBanco().length === 0, 'sin manifiesto: cono entero al proxy');
    ok(mismas(lista, verdad(G.ra, G.dec, rad, 16.2)) && lista.every(function (f) { return f.length === 4; }), 'mismas filas, sin marca');
    nuevoMundo({ binStatus: 404 });
    return R.consultar(G.ra, G.dec, 30, 16.2);
  }).then(function (lista) {
    ok(alProxy().length === 1 && !/excl=/.test(alProxy()[0].url), 'fichero 404: cono entero al proxy');
    ok(mismas(lista, verdad(G.ra, G.dec, rad, 16.2)), 'y la vista completa (' + lista.length + ')');
    nuevoMundo({ roto: true });
    return R.consultar(G.ra, G.dec, 30, 16.2);
  }).then(function (lista) {
    ok(alProxy().length === 1 && mismas(lista, verdad(G.ra, G.dec, rad, 16.2)), 'fichero ilegible: igual');
    nuevoMundo({ manifiesto: { version: 99 } });
    return R.consultar(G.ra, G.dec, 30, 16.2);
  }).then(function () {
    ok(alProxy().length === 1 && alBanco().length === 0, 'manifiesto de otra versión: se ignora');
    nuevoMundo({ sinRange: true });
    return R.consultar(G.ra, G.dec, 30, 16.2);
  }).then(function (lista) {
    ok(alProxy().length === 0 && mismas(lista, verdad(G.ra, G.dec, rad, 16.2)), 'servidor sin Range (200 entero): sirve igual');
  });
});

/* Banco que en el cono pasa del techo: como la segura del proxy. */
casos.push(function () {
  console.log('Banco por encima del techo (como la segura):');
  nuevoMundo();
  var techo = R.config.techoBanco, R0 = R.config;
  R0.techoBanco = 100; R0.topBanco = 40;
  return R.consultar(G.ra, G.dec, 30, 19.9).then(function (lista) {
    R0.techoBanco = techo; R0.topBanco = 40000;
    var todas = verdad(G.ra, G.dec, R.radioConsulta(30), 19.9).sort(function (a, b) { return a[2] - b[2]; });
    ok(todas.length > 100, 'el fixture pasa del techo (' + todas.length + ')');
    ok(lista.length === 40, 'se sirven las 40 más brillantes (' + lista.length + ')');
    var fo = lista.fondo || {}, resto = todas.slice(40);
    var flujo = resto.reduce(function (s, f) { return s + Math.pow(10, -0.4 * f[2]); }, 0);
    ok(fo.n === resto.length && Math.abs(fo.flujo / flujo - 1) < 1e-3, 'fondo con los momentos del resto (n ' + fo.n + ' de ' + resto.length + ')');
    ok(Math.abs(fo.rad - R.conoProxy(G.ra, G.dec, R.radioConsulta(30)).rad) < 1e-9, 'sobre el área del cono');
    ok(fo.espacial && fo.espacial.N === 8 && fo.espacial.celdas.reduce(function (s, c) { return s + c[2]; }, 0) === resto.length,
       'y el velo espacial por celdas suma lo mismo');
  });
});

(function siguiente(i) {
  if (i >= casos.length) {
    console.log(fallos === 0 ? '\n✓ Todo correcto.' : '\n✗ ' + fallos + ' fallo(s).');
    process.exit(fallos === 0 ? 0 : 1);
  }
  Promise.resolve().then(casos[i]).catch(function (e) { fallos++; console.error('  FALLA excepción: ' + (e && e.stack || e)); })
    .then(function () { siguiente(i + 1); });
})(0);
