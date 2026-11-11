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
      if (prop === 'putImageData') return function (im) {
        if (registro) { registro.putImageData++; registro.ultima = im && im.data ? Array.from(im.data) : null; }
      };
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

/* ── fetch de mentira: cada caso deja aquí su respuesta TAP ──
   Con MUNDO puesto (casos del Avance, 7-13) responde como el servidor de
   verdad: manifiesto, celdas del Avance y proxy con y sin `desde`. */
var RESPUESTA = { data: [], fondo: null };
var MUNDO = null;
global.fetch = function (url, init) {
  if (MUNDO) return servidor(url, init || {});
  return Promise.resolve({ ok: true, json: function () { return Promise.resolve(RESPUESTA); } });
};

require('../resources/js/bitacora-gaia-color.js');
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/bitacora-ps1.js');
require('../resources/js/lf-globulares-datos.js');
require('../simulador_ocular/resources/js/globulares-datos.js');
require('../resources/js/bitacora-cumulos.js');
var R = global.window.BitacoraGaiaRender;
var CATALOGO = global.window.BITACORA_GLOBULARES;

/* La capa PS1 se apaga: sin red no hay parche que descargar, y su contrato
   («resuelve {aviso} y nunca rechaza») se afirma igual con la capa apagada. */
window.BitacoraPS1.galaxiasImagen = false;

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

/* ══ Avance de Gaia y complemento débil (ADR 0033, #519) ══════════════════════
   El servidor de mentira tiene un cielo pequeño: brillantes (G < 15) que viven
   en las celdas del Avance y débiles que solo sirve el proxy, unas dentro del
   cono y otras fuera. Las coordenadas son float32 y las G y BP−RP caben exactas
   en el formato de la celda, así que una estrella del Avance y la misma servida
   por el proxy son el MISMO array. */
var MANIFIESTO = { version: 1, catalogo: 'Gaia DR3', nivel: 6, esquema: 'HEALPix nested',
                   celdas: 49152, frontera: 15, filas: 0, ruta: 'n6/{ipix}.bin', fecha: '2026-11-08' };
var PETICIONES = [];
function tras(ms, signal, valor) {
  return new Promise(function (res, rej) {
    function corta() { clearTimeout(id); var e = new Error('abortada'); e.name = 'AbortError'; rej(e); }
    var id = setTimeout(function () {
      if (signal) signal.removeEventListener('abort', corta);
      try { res(typeof valor === 'function' ? valor() : valor); } catch (e) { rej(e); }
    }, ms);
    if (signal) { if (signal.aborted) corta(); else signal.addEventListener('abort', corta, { once: true }); }
  });
}
function celdaBin(ipix, filas) {
  var buf = new ArrayBuffer(188 + 12 * filas.length), v = new DataView(buf);
  'BAVG'.split('').forEach(function (ch, i) { v.setUint8(i, ch.charCodeAt(0)); });
  v.setUint16(4, 1, true); v.setUint8(6, 6); v.setUint32(8, ipix, true);
  v.setUint32(12, filas.length, true); v.setUint16(16, 42, true); v.setUint16(18, 500, true);
  filas.forEach(function (f, k) {
    var o = 188 + 12 * k;
    v.setFloat32(o, f[0], true); v.setFloat32(o + 4, f[1], true);
    v.setUint16(o + 8, Math.floor(f[2] * 1000 + 1e-6), true);
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
/* Un campo en (ra, dec) para arcmin 30 (radio de consulta 0,36°). */
function mundo(ra, dec, extra) {
  function f(dx, dy, g, bprp) { return [Math.fround(ra + dx / Math.cos(dec * Math.PI / 180)), Math.fround(dec + dy), g, bprp]; }
  var m = {
    brillantes: [f(0, 0, 6.25, 0.5), f(0.1, 0.05, 9.5, 1.25), f(-0.2, 0.1, 12, null), f(0.15, -0.25, 14.999, 0.75),
                 f(-0.05, -0.3, 13.5, -0.25), f(0.5, 0, 10, 0.5), f(0, -0.45, 11, 0.5)],     // las 2 últimas, fuera
    debiles: [f(0.02, 0.01, 15, 0.5), f(-0.1, 0.2, 15.5, 1), f(0.25, 0.1, 16.25, null), f(-0.3, -0.05, 16.75, 0.5),
              f(0.05, 0.3, 16.5, 1.5), f(0.6, 0.1, 16, 0.5)],                                  // la última, fuera
    manifiesto: MANIFIESTO, fallan: {}, sinRed: {}, retCelda: 0, retProxy: 0, pendientes: 0, fondo: null,
    eventos: [], invertir: false
  };
  for (var k in extra) m[k] = extra[k];
  return m;
}
function respuesta(status, cuerpo) {
  return { ok: status >= 200 && status < 300, status: status,
           json: function () { return Promise.resolve(cuerpo); },
           arrayBuffer: function () { return Promise.resolve(cuerpo); } };
}
function servidor(url, init) {
  var M = MUNDO;
  PETICIONES.push({ url: url, signal: init.signal });
  if (/avance\/manifiesto\.json$/.test(url)) {
    return Promise.resolve(M.manifiesto ? respuesta(200, M.manifiesto) : respuesta(404, null));
  }
  var celda = /avance\/n6\/(\d+)\.bin$/.exec(url);
  if (celda) {
    var ipix = +celda[1];
    if (M.sinRed[ipix]) return tras(M.retCelda, init.signal, function () { throw new TypeError('Failed to fetch'); });
    if (M.fallan[ipix]) return tras(M.retCelda, init.signal, respuesta(404, null));
    var filas = M.brillantes.filter(function (s) { return R.ang2pixNest(6, s[0], s[1]) === ipix; });
    return tras(M.retCelda, init.signal, respuesta(200, celdaBin(ipix, filas)));
  }
  // El proxy: el cono cuantizado como gaia_cuantizar, G ≤ mag y, con desde, G ≥ 15.
  var q = {};
  url.split('?')[1].split('&').forEach(function (kv) { var p = kv.split('='); q[p[0]] = decodeURIComponent(p[1]); });
  var cono = R.conoProxy(+q.ra, +q.dec, +q.rad), mag = Math.ceil(+q.mag / 0.5 - 1e-9) * 0.5;
  return tras(M.retProxy, init.signal, function () {
    if (M.pendientes > 0) {
      M.pendientes--;
      M.eventos.push('202');
      return respuesta(202, { pendiente: true, reintentar_en: 0.01, paso: 1, pasos: 3 });
    }
    M.eventos.push(q.desde ? 'proxy-desde' : 'proxy');
    var data = M.brillantes.concat(M.debiles).filter(function (s) {
      return distancia(cono.ra, cono.dec, s[0], s[1]) <= cono.rad && s[2] <= mag && (!q.desde || s[2] >= +q.desde);
    });
    if (M.invertir) data = data.slice().reverse();
    return respuesta(200, { data: data, fondo: M.fondo });
  });
}
function dentro(M, lista) {
  return lista.filter(function (s) { return distancia(M.c.ra, M.c.dec, s[0], s[1]) <= 0.36; });
}
function claves(lista) { return lista.map(function (s) { return s.join('|'); }).sort(); }
function mismoConjunto(a, b) { return JSON.stringify(claves(a)) === JSON.stringify(claves(b)); }
function proxyPedido(desde) {
  return PETICIONES.filter(function (p) {
    return p.url.indexOf('gaia_proxy.php') !== -1 && (p.url.indexOf('desde=15') !== -1) === desde;
  });
}
function celdasPedidas() { return PETICIONES.filter(function (p) { return /\.bin$/.test(p.url); }); }
function nuevoMundo(ra, dec, extra) {
  MUNDO = mundo(ra, dec, extra); MUNDO.c = { ra: ra, dec: dec };
  PETICIONES = [];
  return MUNDO;
}
var MLIM_EQUIPO = function () {
  return R.magLimite({ apertura: 200, aumentos: 100, transmision: 0.9, sqm: 21.5, pupilaOjo: 7 });
};

/* 7 ─ HEALPix y celdas del cono (puntos contrastados con gen_avance_gaia.py) */
casos.push(function () {
  console.log('7. Celdas del Avance');
  [[184.2557848920924, 34.90779307487211, 28628], [0, 89.9999, 4095], [359.9999, -89.9999, 45056],
   [360, 41.81, 20479], [180, -41.81, 24576], [177.4702010814736, 40.49498516692928, 5457]].forEach(function (p) {
    ok(R.ang2pixNest(6, p[0], p[1]) === p[2], 'ang2pixNest(' + p[0] + ', ' + p[1] + ') = ' + p[2] + ' como en Python');
  });
  // Propiedad: todo punto del cono cae en una celda listada (polo, RA 0/360, transición |dec| 41,8°).
  [[10, 20, 0.36], [0.05, 0, 0.36], [359.98, 41.8, 1.2], [200, 89.95, 0.8], [30, -89.9, 4.32], [120, -41.8, 2.5]].forEach(function (c) {
    var celdas = {};
    R.celdasDelCono(c[0], c[1], c[2]).forEach(function (ip) { celdas[ip] = true; });
    var fuera = 0, a = 12345;
    for (var k = 0; k < 4000; k++) {
      a = (a * 1103515245 + 12345) % 2147483648; var u = a / 2147483648;
      a = (a * 1103515245 + 12345) % 2147483648; var w = a / 2147483648;
      // Punto uniforme en el casquete: rumbo w, distancia por área.
      var rho = Math.acos(1 - u * (1 - Math.cos(c[2] * Math.PI / 180))), th = 2 * Math.PI * w;
      var d0 = c[1] * Math.PI / 180, a0 = c[0] * Math.PI / 180;
      var sd = Math.sin(d0) * Math.cos(rho) + Math.cos(d0) * Math.sin(rho) * Math.cos(th);
      var dec = Math.asin(sd);
      var ra = a0 + Math.atan2(Math.sin(th) * Math.sin(rho) * Math.cos(d0), Math.cos(rho) - Math.sin(d0) * sd);
      if (!celdas[R.ang2pixNest(6, ra * 180 / Math.PI, dec * 180 / Math.PI)]) fuera++;
    }
    ok(fuera === 0, 'cono (' + c.join(', ') + '): 4000 puntos, todos en celdas listadas (' + fuera + ' fuera)');
  });
  return Promise.resolve();
});

/* 8 ─ AC1 y AC3: la provisional llega antes que el proxy, con todas las G < 15
   del cono, solo estrellas y sin magLimite derivado; y nunca pasa por consultar() */
casos.push(function () {
  console.log('8. Vista provisional (AC1, AC3)');
  R.reiniciarAvance();            // el manifiesto se pide de verdad (primera vista de la sesión)
  var M = nuevoMundo(150, 20, { retProxy: 60, fondo: { corte: 15, n: 40000, flujo: 2e-4, m2: 0, rad: 0.25 } });
  var reg = { fillRect: 0, putImageData: 0 }, prov = [], pintadasAlAvance = -1, enCache = null;
  var o = opts({ ra: 150, dec: 20, alAvance: function (r) {
    prov.push(r); M.eventos.push('avance'); pintadasAlAvance = reg.putImageData;
    // Quien pregunte a consultar() mientras tanto recibe el conjunto completo.
    enCache = R.consultar(150, 20, 30, R.profundidadConsulta(200, 0.9, 100, true));
  } });
  return R.vistaGaia(lienzo(64, reg).getContext('2d'), o).then(function (r) {
    var brillantes = dentro(M, M.brillantes), todas = dentro(M, M.brillantes.concat(M.debiles));
    ok(prov.length === 1, 'alAvance llega una vez (' + prov.length + ')');
    ok(M.eventos.indexOf('avance') !== -1 && M.eventos.indexOf('avance') < M.eventos.indexOf('proxy-desde'),
       'y antes que la respuesta del proxy (' + M.eventos.join(' → ') + ')');
    var p = prov[0] || {};
    ok(p.provisional === true, 'la marca de provisional viaja en el resultado');
    ok(p.estrellas && mismoConjunto(p.estrellas, brillantes),
       'la provisional enseña TODAS las G < 15 del cono y ninguna de fuera (' + (p.estrellas || []).length + ' de ' + brillantes.length + ')');
    ok(pintadasAlAvance > 0, 'y ya está pintada cuando se avisa');
    ok(Math.abs(p.mlim - MLIM_EQUIPO()) < 1e-9, 'su magnitud límite es la del equipo, no sale del Avance (' + (p.mlim || 0).toFixed(2) + ')');
    ok(p.avisoCampo === '' && p.galaxias === undefined, 'sin aviso de campo ni capa de galaxias: solo estrellas');
    ok(r.mlim < p.mlim - 1e-6, 'el velo solo entra en la completa (' + r.mlim.toFixed(2) + ' < ' + p.mlim.toFixed(2) + ')');
    ok(mismoConjunto(r.estrellas, todas), 'la completa es Avance ∪ complemento (' + r.estrellas.length + ' de ' + todas.length + ')');
    ok(proxyPedido(true).length === 1 && proxyPedido(false).length === 0, 'al proxy solo se le pide el complemento (desde=15)');
    return enCache.then(function (lista) {
      ok(mismoConjunto(lista, todas), 'consultar() resuelve el conjunto completo, nunca el Avance solo (' + lista.length + ')');
      ok(lista.fondo && lista.fondo.n === 40000, 'y con los momentos del complemento (fondo)');
    });
  }).then(function () {
    // Con las celdas ya en la caché: otra vista del mismo cielo, a 3,6″.
    PETICIONES = []; M.eventos = []; M.retProxy = 1500;
    var t0 = Date.now(), tAvance = null;
    return R.vistaGaia(lienzo(64, null).getContext('2d'), opts({ ra: 150.002, dec: 20,
      alAvance: function () { tAvance = Date.now() - t0; } })).then(function () {
      ok(tAvance != null && tAvance < 1000, 'con las celdas en la caché, alAvance en < 1 s (' + tAvance + ' ms, proxy a 1,5 s)');
      ok(celdasPedidas().length === 0, 'sin volver a pedir celdas: la caché las comparte entre vistas');
    });
  });
});

/* 9 ─ AC2: la completa es la MISMA vista que la consulta sin desde */
casos.push(function () {
  console.log('9. Completa = consulta sin desde (AC2)');
  var M = nuevoMundo(80, -30, { invertir: true }), conAv = { fillRect: 0, putImageData: 0 }, sinAv = { fillRect: 0, putImageData: 0 };
  var clave = (80).toFixed(3) + ',' + (-30).toFixed(3);
  R.reiniciarAvance(null);
  return R.vistaGaia(lienzo(64, sinAv).getContext('2d'), opts({ ra: 80, dec: -30 })).then(function (a) {
    ok(proxyPedido(false).length === 1, 'sin Avance: una consulta sin desde');
    delete R.cacheGaia[clave];
    R.reiniciarAvance(MANIFIESTO);
    PETICIONES = [];
    return R.vistaGaia(lienzo(64, conAv).getContext('2d'), opts({ ra: 80, dec: -30, alAvance: function () {} })).then(function (b) {
      ok(proxyPedido(true).length === 1 && proxyPedido(false).length === 0, 'con Avance: solo el complemento');
      ok(mismoConjunto(a.estrellas, b.estrellas), 'mismo conjunto de estrellas (' + a.estrellas.length + ' / ' + b.estrellas.length + ')');
      var k = claves(b.estrellas);
      ok(k.every(function (x, i) { return i === 0 || x !== k[i - 1]; }), 'ninguna estrella dos veces');
      ok(a.mlim === b.mlim && a.fondo === b.fondo && a.avisoCampo === b.avisoCampo, 'misma mlim, fondo y aviso');
      ok(sinAv.ultima && conAv.ultima && sinAv.ultima.length === conAv.ultima.length &&
         sinAv.ultima.every(function (x, i) { return x === conAv.ultima[i]; }),
         'mismo render, píxel a píxel (el proxy sin desde las sirve en otro orden)');
    });
  });
});

/* 10 ─ AC4: una celda caída (404 o red) => sin desde, vista completa, sin error */
casos.push(function () {
  console.log('10. Respaldo sin Avance (AC4)');
  R.reiniciarAvance(MANIFIESTO);
  var M = nuevoMundo(220, 10), ipix = R.ang2pixNest(6, M.brillantes[0][0], M.brillantes[0][1]);
  M.fallan[ipix] = true; M.retProxy = 30;
  var prov = 0;
  return R.vistaGaia(lienzo(64, null).getContext('2d'), opts({ ra: 220, dec: 10, alAvance: function () { prov++; } })).then(function (r) {
    ok(proxyPedido(false).length === 1, 'celda 404: se pide sin desde');
    ok(proxyPedido(true).length === 1 && proxyPedido(true)[0].signal.aborted, 'y el complemento ya lanzado se aborta');
    ok(mismoConjunto(r.estrellas, dentro(M, M.brillantes.concat(M.debiles))), 'la vista completa sale bien (' + r.estrellas.length + ')');
    ok(prov === 0, 'sin provisional a medias');
    var M2 = nuevoMundo(230, 10);
    M2.sinRed[R.ang2pixNest(6, M2.brillantes[1][0], M2.brillantes[1][1])] = true;
    return R.vistaGaia(lienzo(64, null).getContext('2d'), opts({ ra: 230, dec: 10, alAvance: function () {} }));
  }).then(function (r) {
    ok(proxyPedido(false).length === 1 && mismoConjunto(r.estrellas, dentro(MUNDO, MUNDO.brillantes.concat(MUNDO.debiles))),
       'error de red en una celda: igual, sin desde y completa');
    R.reiniciarAvance();
    nuevoMundo(240, 10, { manifiesto: null });
    return R.vistaGaia(lienzo(64, null).getContext('2d'), opts({ ra: 240, dec: 10, alAvance: function () {} }));
  }).then(function (r) {
    ok(proxyPedido(false).length === 1 && proxyPedido(true).length === 0 && celdasPedidas().length === 0,
       'sin manifiesto: la consulta de siempre, sin celdas');
    ok(mismoConjunto(r.estrellas, dentro(MUNDO, MUNDO.brillantes.concat(MUNDO.debiles))), 'y la vista completa');
  });
});

/* 11 ─ AC5: campo denso (202). La provisional se queda durante todo el
   pendiente y la sustituye la completa. El 202 llega ANTES que las celdas. */
casos.push(function () {
  console.log('11. Campo denso (AC5)');
  R.reiniciarAvance(MANIFIESTO);
  var M = nuevoMundo(260, -25, { pendientes: 4, retCelda: 15 });
  var reg = { fillRect: 0, putImageData: 0 }, trasAvance = -1, enPendiente = [], despues = [];
  return R.vistaGaia(lienzo(64, reg).getContext('2d'), opts({ ra: 260, dec: -25,
    alAvance: function () { M.eventos.push('avance'); trasAvance = reg.putImageData; },
    alPendiente: function () { enPendiente.push(reg.putImageData); if (trasAvance >= 0) despues.push(reg.putImageData); } })).then(function (r) {
    ok(M.eventos[0] === '202' && M.eventos.indexOf('avance') > 0, 'el 202 llega primero y la provisional después (' + M.eventos.join(' → ') + ')');
    ok(enPendiente.length === 4, 'alPendiente avisa cada 202 (' + enPendiente.length + ')');
    ok(despues.length > 0 && despues.every(function (n) { return n === trasAvance; }),
       'nada repinta durante el pendiente: la provisional sigue a la vista (' + despues.length + ' avisos después)');
    ok(reg.putImageData > trasAvance, 'al completar la sustituye la completa');
    ok(mismoConjunto(r.estrellas, dentro(M, M.brillantes.concat(M.debiles))), 'que es el conjunto completo');
  });
});

/* 12 ─ AC6: la vista superada no pinta nada y no aborta las celdas compartidas */
casos.push(function () {
  console.log('12. Vista superada (AC6)');
  R.reiniciarAvance(MANIFIESTO);
  var M = nuevoMundo(300, 45, { retCelda: 30, retProxy: 80 });
  var regA = { fillRect: 0, putImageData: 0 }, regB = { fillRect: 0, putImageData: 0 };
  var vivaA = true, ctrlA = new AbortController(), ctrlB = new AbortController(), provA = 0, provB = 0;
  var a = R.vistaGaia(lienzo(64, regA).getContext('2d'), opts({ ra: 300, dec: 45, signal: ctrlA.signal,
    vivo: function () { return vivaA; }, alAvance: function () { provA++; } }))
    .then(function (r) { return r; }, function (err) { return { error: err }; });
  var celdasA = celdasPedidas().length;
  return tras(5).then(function () {
    // Como BitacoraPeticionVista: la nueva se une y la vieja aborta un turno después.
    vivaA = false;
    var b = R.vistaGaia(lienzo(64, regB).getContext('2d'), opts({ ra: 300.004, dec: 45, signal: ctrlB.signal,
      alAvance: function () { provB++; } }));
    setTimeout(function () { ctrlA.abort(); }, 0);
    return Promise.all([a, b]);
  }).then(function (res) {
    var ra = res[0], rb = res[1];
    ok(provA === 0 && regA.putImageData === 0, 'la superada no pinta ni su provisional ni su completa');
    ok(ra.cancelada === true || (ra.error && ra.error.cancelada), 'y acaba cancelada, no como fallo de Gaia');
    ok(proxyPedido(true)[0].signal.aborted, 'su complemento se aborta');
    var compartidas = celdasPedidas().slice(0, celdasA);
    ok(celdasA > 0 && compartidas.every(function (p) { return !p.signal.aborted; }),
       'las celdas que comparte con la nueva no se abortan (' + compartidas.length + ')');
    ok(celdasPedidas().length === celdasA, 'ni se vuelven a pedir');
    ok(provB === 1 && mismoConjunto(rb.estrellas, dentro({ c: { ra: 300.004, dec: 45 } }, M.brillantes.concat(M.debiles))),
       'la nueva pinta su provisional y su completa');
  });
});

/* 13 ─ AC7: sin alAvance (render del formulario) resuelve la completa, y el
   precalentado pide la MISMA clave, desde incluido */
casos.push(function () {
  console.log('13. Formulario: render() y precalentado (AC7)');
  R.reiniciarAvance(MANIFIESTO);
  var M = nuevoMundo(330, 5, { retProxy: 20 });
  var equipo = { ra: 330, dec: 5, arcmin: 30, apertura: 200, aumentos: 100, transmision: 0.9,
                 arana: true, sqm: 21.5, pupilaSalida: 2, pupilaOjo: 7, afov: 68, conGlow: true };
  R.precalentar(equipo);
  return R.render(lienzo(64, null), equipo).then(function (r) {
    ok(mismoConjunto(r.estrellas, dentro(M, M.brillantes.concat(M.debiles))), 'render() resuelve la vista completa');
    var pedidas = PETICIONES.filter(function (p) { return p.url.indexOf('gaia_proxy.php') !== -1; });
    ok(pedidas.length === 1 && pedidas[0].url.indexOf('desde=15') !== -1,
       'precalentado + render: UNA consulta al proxy, con desde=15 (' + pedidas.length + ')');
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
