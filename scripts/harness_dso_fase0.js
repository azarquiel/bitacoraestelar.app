#!/usr/bin/env node
/* FASE 0 del catálogo de texturas DSO: MEDIR. Sin código de producción.

   El objetivo (catalogo_dso_texturas_objetivo.md §5, fase 0) deja cuatro cifras
   como estimación y este arnés las sustituye por medidas sobre el banco del
   ADR 0024:

     A · errCuantMaxSigma de asinh16 con a = σ, y —lo que de verdad decide— si la
         codificación mueve la decisión de ausencia (v < cielo − kσ). Si la mueve,
         la fase 1 no existe tal como está escrita.
     B · bytes/px reales del PNG de 16 bits, que sustituyen el ×0,6 de la tabla 4.2.
     C · fracción de ausencia total y dentro de la escena, que abre o cierra la
         fase 4.
     D · tiempo por objeto contra STScI y comportamiento ante peticiones seguidas.

   No hay listones: esta fase solo mide. Los listones son los del ADR 0024 y se
   juzgan en la fase 1.

   Reanudable: la descarga se cachea en $PS1_HARNESS_DIR y los resultados se
   acumulan en fase0_resultados.json, así que una ejecución interrumpida continúa.

     node scripts/harness_dso_fase0.js               # el banco entero
     node scripts/harness_dso_fase0.js --solo "NGC 5194"
     node scripts/harness_dso_fase0.js --n 4         # los 4 primeros
     node scripts/harness_dso_fase0.js --muestra 50  # muestra aleatoria (semilla fija) */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/bitacora-ps1.js');
var R = global.window.BitacoraGaiaRender;
var PS1 = window.BitacoraPS1;
var B = require('./lib_banco_dso.js')(R);
var BAJAR = require('./lib_bajar_parche.js')(R);
var COD = require('./lib_asinh16.js');
var PNG = require('./lib_png.js');
var fs = require('fs'), path = require('path');

var SALIDA = 1024;                       // fase 1: el mismo recorte que hoy
var arg = {};
process.argv.slice(2).forEach(function (a, i, v) { if (a.slice(0, 2) === '--') arg[a.slice(2)] = v[i + 1]; });

/* Regla C del objetivo (§4.2): 0,5″/px, tope 2048. Aquí solo para MEDIR el
   volumen que tendría la fase 2, que es lo que la tabla 4.2 estima con un ×0,6
   sin haberlo pesado nunca. */
function salidaRegla(lado) {
  return Math.max(128, Math.min(2048, Math.ceil(lado * 60 / 0.5)));
}
function salidaDe(lado) { return arg.reglac != null ? salidaRegla(lado) : SALIDA; }

var RES = path.join(BAJAR.dir, 'fase0_resultados' +
  (arg.muestra ? '_muestra' : '') + (arg.reglac != null ? '_reglac' : '') + '.json');

function f(v, d) { return (v == null || !isFinite(v)) ? '-' : v.toFixed(d == null ? 3 : d); }

/* ── La medida de un objeto ─────────────────────────────────────────────── */
function medir(o, F) {
  var d = F.datos, n = d.length, i, v;
  var cielo = PS1.ps1Cielo(d, F.ancho, F.alto);
  var sigma = PS1.ps1SigmaCielo(d, F.ancho, F.alto, cielo);
  if (!(sigma > 0)) return { error: 'σ del cielo no positiva (' + sigma + ')' };

  var cod = COD.codificar(d, sigma);
  var dd = COD.decodificar(cod.u16, cod);

  /* A · error de cuantización, en las dos zonas que el objetivo distingue. */
  var errSigma = 0, errRel = 0, nanIda = 0, nanVuelta = 0, nanDistintos = 0;
  var corte = cielo - PS1.cfg.kAusencia * sigma, flips = 0, ausIda = 0;
  for (i = 0; i < n; i++) {
    v = d[i];
    var w = dd[i];
    if (v !== v) nanIda++;
    if (w !== w) nanVuelta++;
    if ((v !== v) !== (w !== w)) { nanDistintos++; continue; }
    if (v !== v) continue;
    if (Math.abs(v) < 5 * sigma) { var e = Math.abs(w - v) / sigma; if (e > errSigma) errSigma = e; }
    else { var r = Math.abs(w / v - 1); if (r > errRel) errRel = r; }
    var a1 = v < corte, a2 = w < corte;
    if (a1) ausIda++;
    if (a1 !== a2) flips++;
  }

  /* B · bytes reales del PNG de 16 bits. */
  var bytes = PNG.bufferGris16(cod.u16, F.ancho, F.alto).length;

  /* C · ausencia total y dentro de la escena (la elipse μ25 o el borde real del
     objeto y sus vecinas, con la misma función que monta producción). */
  var fp = { ancho: F.ancho, alto: F.alto, escalaAs: F.escalaAs, wcs: F.wcs || null, datos: d };
  fp.afin = PS1.ps1AfinParche(fp, o.gal);
  var vecinos = PS1.ps1GalaxiasDelCampo(B.banco.catalogo || [], o.gal.ra, o.gal.dec, o.gal.ladoArcmin);
  var escena = PS1.ps1EscenaEnParche(fp, o.gal, vecinos.length ? vecinos : [o.gal]);
  var enEscena = 0, nanEscena = 0;
  for (var y = 0; y < F.alto; y++) {
    for (var x = 0; x < F.ancho; x++) {
      if (!PS1.ps1FuenteEnEscena(escena, fp.afin, x, y)) continue;
      enEscena++;
      if (d[y * F.ancho + x] !== d[y * F.ancho + x]) nanEscena++;
    }
  }

  return {
    nombre: o.nombre, motivo: o.motivo, clase: o.gal.clase || 'GAL',
    ladoArcmin: o.gal.ladoArcmin, ancho: F.ancho, escalaAs: F.escalaAs,
    cielo: cielo, sigma: sigma, a: cod.a, uMin: cod.uMin, uMax: cod.uMax,
    pasoCercaCieloSigma: cod.a * (cod.uMax - cod.uMin) / COD.PASOS / sigma,
    errCuantMaxSigma: errSigma, errCuantMaxRel: errRel,
    nanDistintos: nanDistintos, flipsAusencia: flips,
    fracAusenciaIda: nanIda / n, fracAusenciaVuelta: nanVuelta / n,
    fracBajoCorte: ausIda / n,
    pxEscena: enEscena, fracAusenciaEscena: enEscena ? nanEscena / enEscena : 0,
    bytes: bytes, bytesPorPx: bytes / n,
    factorFrenteA32: bytes / (n * 4), factorFrenteA16: bytes / (n * 2)
  };
}

/* ── Volumen del catálogo entero, con los bytes/px ya medidos ───────────── */
/* La tabla 4.2 del objetivo estima el peso con un ×0,6 sobre el crudo de 16
   bits. Aquí se sustituye por la medida: para cada fila apta se calcula su
   escala según la regla y se le aplica el bytes/px de los objetos medidos a
   escala parecida (interpolación sobre las medidas ordenadas por escalaAs, sin
   ajuste ni modelo: la relación satura y un polinomio solo la disfrazaría). */
function volumen(b) {
  var med = [];
  ['fase0_resultados.json', 'fase0_resultados_muestra.json', 'fase0_resultados_muestra_reglac.json']
    .forEach(function (n) {
      var r = path.join(BAJAR.dir, n);
      if (!fs.existsSync(r)) return;
      var j = JSON.parse(fs.readFileSync(r, 'utf8'));
      Object.keys(j).forEach(function (k) {
        if (!j[k].error && j[k].escalaAs > 0) med.push([j[k].escalaAs, j[k].bytesPorPx]);
      });
    });
  if (med.length < 10) { console.log('\nvolumen: hacen falta más medidas'); return; }
  med.sort(function (a, c) { return a[0] - c[0]; });
  function bpp(esc) {
    if (esc <= med[0][0]) return med[0][1];
    if (esc >= med[med.length - 1][0]) return med[med.length - 1][1];
    for (var i = 1; i < med.length; i++) {
      if (med[i][0] < esc) continue;
      var t = (esc - med[i - 1][0]) / (med[i][0] - med[i - 1][0]);
      return med[i - 1][1] + t * (med[i][1] - med[i - 1][1]);
    }
    return med[med.length - 1][1];
  }
  var aptas = b.catalogo.filter(function (fila) { return B.apta(fila); });
  var REGLAS = [
    ['A · 1024 fijo (hoy, fase 1)', function () { return 1024; }],
    ['C · 0,5″/px, tope 2048', function (l) { return Math.max(128, Math.min(2048, Math.ceil(l * 60 / 0.5))); }],
    ['D · 0,67″/px, tope 2048', function (l) { return Math.max(128, Math.min(2048, Math.ceil(l * 60 / 0.67))); }],
    ['E · 0,5″/px, tope 1024', function (l) { return Math.max(128, Math.min(1024, Math.ceil(l * 60 / 0.5))); }],
    ['F · 0,5″/px, tope 1794', function (l) { return Math.max(128, Math.min(1794, Math.ceil(l * 60 / 0.5))); }]
  ];
  console.log('\n═══ Volumen de las ' + aptas.length + ' filas aptas, con bytes/px MEDIDOS ═══');
  console.log('  regla                          Mpx    GB (medido)   GB (×0,6 del objetivo)');
  REGLAS.forEach(function (r) {
    var px = 0, bytes = 0, est = 0;
    aptas.forEach(function (fila) {
      var l = PS1.ps1LadoArcmin(fila[4]), sal = r[1](l), n = sal * sal;
      px += n; bytes += n * bpp(l * 60 / sal); est += n * 2 * 0.6;
    });
    console.log('  ' + r[0].padEnd(30) + (px / 1e6).toFixed(0).padStart(5) +
      (bytes / 1e9).toFixed(2).padStart(14) + (est / 1e9).toFixed(2).padStart(24));
  });
}

/* ── Recorrido ──────────────────────────────────────────────────────────── */
var b = B.banco();
B.banco.catalogo = b.catalogo;
b.avisos.forEach(function (a) { console.log('AVISO · ' + a); });
console.log('banco: ' + b.objetos.length + ' objetos, ' + b.controles.length + ' controles de exclusión');
b.controles.forEach(function (c) {
  console.log('  control ' + c.nombre + ': esperado ' + c.esperado + ', real ' + c.real +
              (c.esperado === c.real ? '' : '   ← DISCREPA'));
});

if (arg.volumen != null) { volumen(b); process.exit(0); }

var lista = b.objetos.filter(function (o) { return o.gal; });

/* Muestra aleatoria del catálogo apto, para las cifras de volumen: el banco está
   elegido por modo de fallo y sus lados no representan la distribución. Semilla
   fija y escrita (LCG de Numerical Recipes) para que la muestra sea la misma en
   cualquier ejecución; el ADR 0012 bis pide que la selección no dependa de haber
   visto los resultados. */
var SEMILLA = 20260904;
if (arg.muestra) {
  var enBanco = {};
  lista.forEach(function (o) { enBanco[B.clave(o.nombre)] = 1; });
  var pool = b.catalogo.filter(function (fila) { return B.apta(fila) && !enBanco[B.clave(fila[0])]; });
  var s = SEMILLA, sacadas = [];
  for (var t = 0; t < +arg.muestra && pool.length; t++) {
    s = (1664525 * s + 1013904223) % 4294967296;
    var fila = pool.splice(s % pool.length, 1)[0];
    sacadas.push({ nombre: fila[0], fila: fila, motivo: 'muestra aleatoria (semilla ' + SEMILLA + ')', gal: B.gal(fila) });
  }
  lista = sacadas.filter(function (o) { return o.gal; });
  console.log('muestra aleatoria de ' + lista.length + ' filas aptas, semilla ' + SEMILLA);
}
if (arg.solo) lista = lista.filter(function (o) { return B.clave(o.nombre) === B.clave(arg.solo); });
if (arg.n) lista = lista.slice(0, +arg.n);

var previos = fs.existsSync(RES) ? JSON.parse(fs.readFileSync(RES, 'utf8')) : {};
var cadena = Promise.resolve(), tiempos = [];

lista.forEach(function (o, k) {
  cadena = cadena.then(function () {
    if (previos[o.nombre] && !arg.rehacer) { console.log('· ' + o.nombre + ' ya medido'); return; }
    var t0 = Date.now();
    return BAJAR.bajar(o.gal.ra, o.gal.dec, o.gal.ladoArcmin, salidaDe(o.gal.ladoArcmin), 'g', true).then(function (F) {
      var tDesc = (Date.now() - t0) / 1000;
      tiempos.push(tDesc);
      var m = medir(o, F);
      m.segDescarga = tDesc;
      previos[o.nombre] = m;
      fs.writeFileSync(RES, JSON.stringify(previos, null, 1));
      console.log('[' + (k + 1) + '/' + lista.length + '] ' + o.nombre + ' (' + m.clase + ', ' +
        f(m.ladoArcmin, 2) + '′)  σ=' + f(m.sigma, 2) + '  errσ=' + f(m.errCuantMaxSigma, 4) +
        '  flips=' + m.flipsAusencia + '  NaN≠=' + m.nanDistintos +
        '  ausEscena=' + f(m.fracAusenciaEscena * 100, 2) + '%' +
        '  ' + f(m.bytesPorPx, 2) + ' B/px  ' + f(tDesc, 1) + ' s');
    }).catch(function (e) {
      previos[o.nombre] = { nombre: o.nombre, error: String(e.message || e) };
      fs.writeFileSync(RES, JSON.stringify(previos, null, 1));
      console.log('[' + (k + 1) + '/' + lista.length + '] ' + o.nombre + '  ERROR: ' + e.message);
    });
  });
});

cadena.then(function () {
  var ok = Object.keys(previos).map(function (k) { return previos[k]; }).filter(function (m) { return !m.error; });
  if (!ok.length) { console.log('\nsin medidas'); return; }
  function max(c) { return ok.reduce(function (a, m) { return Math.max(a, m[c] || 0); }, 0); }
  function med(c) { var v = ok.map(function (m) { return m[c] || 0; }).sort(function (a, b2) { return a - b2; }); return v[v.length >> 1]; }
  console.log('\n═══ Resumen (' + ok.length + ' objetos medidos) ═══');
  console.log('  A · errCuantMaxSigma   máx ' + f(max('errCuantMaxSigma'), 5) + '   mediana ' + f(med('errCuantMaxSigma'), 5));
  console.log('      err. relativo      máx ' + f(max('errCuantMaxRel'), 5));
  console.log('      flips de ausencia  máx ' + max('flipsAusencia') + '   NaN distintos máx ' + max('nanDistintos'));
  console.log('      paso cerca del cielo, en σ: mediana ' + f(med('pasoCercaCieloSigma'), 6));
  console.log('  B · bytes/px           mediana ' + f(med('bytesPorPx'), 2) + '   máx ' + f(max('bytesPorPx'), 2));
  console.log('      factor sobre 16 bits crudos: mediana ' + f(med('factorFrenteA16'), 3));
  console.log('  C · fracAusenciaEscena mediana ' + f(med('fracAusenciaEscena') * 100, 3) + ' %   máx ' + f(max('fracAusenciaEscena') * 100, 2) + ' %');
  console.log('      objetos con > 5 %: ' + ok.filter(function (m) { return m.fracAusenciaEscena > 0.05; }).length +
              ';  > 20 %: ' + ok.filter(function (m) { return m.fracAusenciaEscena > 0.2; }).length);
  if (tiempos.length) {
    tiempos.sort(function (a, b2) { return a - b2; });
    console.log('  D · descarga (solo las de esta ejecución, ' + tiempos.length + '): mediana ' +
      f(tiempos[tiempos.length >> 1], 1) + ' s, máx ' + f(tiempos[tiempos.length - 1], 1) + ' s');
  }
  console.log('\n  resultados: ' + RES);
});
