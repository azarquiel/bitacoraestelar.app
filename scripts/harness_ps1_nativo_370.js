#!/usr/bin/env node
/* #370 · ¿Compensa pedir el píxel nativo de PS1 y remuestrear nosotros?
   Listones prerregistrados en simulador_ocular/docs/validacion/ps1_nativo_370.md.

   Tres modos, uno por pregunta:

   --ram NOMBRE --camino fitscut|nativo      (AC1)
       Baja UN objeto por UN camino y sale. Pensado para correr en un proceso
       nuevo con PS1_HARNESS_DIR vacío y bajo `/usr/bin/time -l`, que da el pico
       de RSS: con caché el «pico» sería un JSON.parse, no descarga + decodifica.
       Lo lanza scripts/harness_ps1_nativo_370_ram.sh.

   --bytes [--n N]                            (AC2)
       La muestra de 50 de L2.4 (lib_muestra_dso.js, semilla 20260904): por cada
       celda de cada objeto pide el recorte de hoy (`output_size` = regla C) y el
       nativo (solo `size`), cuenta los bytes del cable y el tiempo, y extrapola a
       las filas aptas por bytes/píxel pedido y celdas medias. Reanudable.
       Solo los recortes del parche: la escalera de lados (ADR 0034) y el campo
       vecino del generador son peticiones aparte que multiplican los DOS caminos.

   --flujo [--n N]                            (AC3 + AC5)
       El banco: contra el mosaico nativo (la verdad, sin remuestrear), el sesgo
       de la media del parche de `fitscut` a la regla C y el del remuestreo propio,
       en σ/px con el MISMO denominador para los dos —σ del cielo del parche de
       `fitscut`, que es la de #366—. `fitscut` es el control positivo: tiene que
       salir ≠ 0 o el arnés no mide nada (ADR 0005). Y los bytes del PNG-16 de
       los dos caminos, codificados como los codifica el generador.

   Ninguna ley se reimplementa (ADR 0008): cielo, σ, parseFITS y la regla C son
   las de producción; el remuestreo es lib_remuestreo_ps1.js, lo que se mide. */
'use strict';

var path = require('path'), fs = require('fs');
var RAIZ = path.join(__dirname, '..');
global.window = global.window || {};
require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-ps1.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'nebulosas-datos.js'));

var PS1 = window.BitacoraPS1;
var BJ = require('./lib_bajar_parche.js')(window.BitacoraGaiaRender);
var B = require('./lib_banco_dso.js')(window.BitacoraGaiaRender);
var MUESTRA = require('./lib_muestra_dso.js');
var COD = require('../resources/js/bitacora-png16.js');
var PNG = require('./lib_png.js');

function arg(n, d) { var i = process.argv.indexOf(n); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; }
function hay(n) { return process.argv.indexOf(n) > 0; }
var N = parseInt(arg('--n', '0'), 10);

var b = B.banco();
function objetoPorNombre(nombre) {
  var o = b.objetos.filter(function (x) { return x.gal && B.clave(x.nombre) === B.clave(nombre); })[0];
  if (!o) throw new Error('no está en el banco: ' + nombre);
  return o;
}
function enSerie(lista, fn) {
  return lista.reduce(function (c, x, i) { return c.then(function () { return fn(x, i); }); }, Promise.resolve());
}

/* ── AC1 ─────────────────────────────────────────────────────────────── */
function modoRam(nombre, camino) {
  var g = objetoPorNombre(nombre).gal, sal = PS1.ps1SalidaParche(g.ladoArcmin), t0 = Date.now();
  var p = camino === 'nativo' ? BJ.bajarNativo(g.ra, g.dec, g.ladoArcmin, sal)
                              : BJ.bajar(g.ra, g.dec, g.ladoArcmin, sal);
  return p.then(function (r) {
    console.log(JSON.stringify({ nombre: nombre, camino: camino, salida: sal, ancho: r.ancho,
      celdas: r.celdasCosidas + '/' + r.celdasPedidas, ms: Date.now() - t0,
      maxRssNodeKB: process.resourceUsage().maxRSS }));
  });
}

/* ── AC2 ─────────────────────────────────────────────────────────────── */
function modoBytes() {
  var I = BJ._interno, f = path.join(BJ.dir, 'ac2_370.json');
  var hecho = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
  var lista = MUESTRA(B, b, 50);
  if (N) lista = lista.slice(0, N);
  console.log('muestra de ' + lista.length + ' filas aptas, semilla ' + MUESTRA.SEMILLA);
  return enSerie(lista, function (o, i) {
    if (hecho[o.nombre]) return;
    var g = o.gal, sal = PS1.ps1SalidaParche(g.ladoArcmin), nat = Math.round(g.ladoArcmin * 60 / BJ.ESCALA_NATIVA);
    return I.celdas(g.ra, g.dec, g.ladoArcmin, PS1.cfg.banda).then(function (c) {
      var fila = { lado: g.ladoArcmin, salida: sal, nativo: nat, celdas: c.lista.length,
                   hoy: { bytes: 0, ms: 0 }, nat: { bytes: 0, ms: 0 }, fallos: 0 };
      return enSerie(c.lista, function (celda) {
        function una(url, dst) {
          var cuenta = { bytes: 0 }, t0 = Date.now();
          return I.bajarContando(url, cuenta).then(function () {
            dst.bytes += cuenta.bytes; dst.ms += Date.now() - t0;
          }).catch(function () { fila.fallos++; });
        }
        return una(I.urlRecorte(celda, g.ra, g.dec, g.ladoArcmin, sal), fila.hoy)
          .then(function () { return una(I.urlRecorteNativo(celda, g.ra, g.dec, g.ladoArcmin), fila.nat); });
      }).then(function () {
        hecho[o.nombre] = fila;
        fs.writeFileSync(f, JSON.stringify(hecho));
        console.log('[' + (i + 1) + '/' + lista.length + '] ' + o.nombre + '  ' + g.ladoArcmin.toFixed(2) + '′  ' +
          fila.celdas + ' celdas  hoy ' + (fila.hoy.bytes / 1e6).toFixed(1) + ' MB  nativo ' +
          (fila.nat.bytes / 1e6).toFixed(1) + ' MB  ' + (fila.nat.ms / 1000).toFixed(1) + ' s' +
          (fila.fallos ? '  FALLOS ' + fila.fallos : ''));
      });
    }).catch(function (e) { console.log('FALLO ' + o.nombre + ': ' + e.message); });
  }).then(function () {
    var filas = lista.map(function (o) { return hecho[o.nombre]; }).filter(function (x) { return x && !x.fallos; });
    var s = { pxHoy: 0, pxNat: 0, bHoy: 0, bNat: 0, msHoy: 0, msNat: 0, celdas: 0 };
    filas.forEach(function (x) {
      s.pxHoy += x.celdas * x.salida * x.salida; s.pxNat += x.celdas * x.nativo * x.nativo;
      s.bHoy += x.hoy.bytes; s.bNat += x.nat.bytes; s.msHoy += x.hoy.ms; s.msNat += x.nat.ms; s.celdas += x.celdas;
    });
    var bppHoy = s.bHoy / s.pxHoy, bppNat = s.bNat / s.pxNat, celdasMedias = s.celdas / filas.length;
    var aptas = b.catalogo.filter(B.apta), tHoy = 0, tNat = 0;
    aptas.forEach(function (fila) {
      var l = PS1.ps1LadoArcmin(fila[4]), sal = PS1.ps1SalidaParche(l), nat = Math.round(l * 60 / BJ.ESCALA_NATIVA);
      tHoy += celdasMedias * sal * sal * bppHoy; tNat += celdasMedias * nat * nat * bppNat;
    });
    var horasNat = tNat / (s.bNat / s.msNat) / 3.6e6, horasHoy = tHoy / (s.bHoy / s.msHoy) / 3.6e6;
    console.log('\nAC2 sobre ' + filas.length + ' objetos medidos (' + s.celdas + ' celdas, media ' + celdasMedias.toFixed(2) + ')');
    console.log('  muestra   hoy ' + (s.bHoy / 1e9).toFixed(3) + ' GB  ·  nativo ' + (s.bNat / 1e9).toFixed(3) +
      ' GB  ·  factor medido ×' + (s.bNat / s.bHoy).toFixed(2));
    console.log('  bytes/px pedido   hoy ' + bppHoy.toFixed(3) + '  ·  nativo ' + bppNat.toFixed(3));
    console.log('  caudal   hoy ' + (s.bHoy / s.msHoy / 1e3).toFixed(2) + ' MB/s  ·  nativo ' + (s.bNat / s.msNat / 1e3).toFixed(2) + ' MB/s');
    console.log('  extrapolado a ' + aptas.length + ' aptas   hoy ' + (tHoy / 1e9).toFixed(1) + ' GB / ' + horasHoy.toFixed(1) +
      ' h  ·  nativo ' + (tNat / 1e9).toFixed(1) + ' GB / ' + horasNat.toFixed(1) + ' h  ·  factor ×' + (tNat / tHoy).toFixed(2));
    console.log('  listón AC6: ≤ 100 GB y ≤ 24 h  →  ' + (tNat / 1e9 <= 100 && horasNat <= 24 ? 'CABE' : 'NO CABE'));
  });
}

/* ── AC3 + AC5 ───────────────────────────────────────────────────────── */
function mediaFinitos(d) {
  var s = 0, n = 0;
  for (var i = 0; i < d.length; i++) { var v = d[i]; if (v === v) { s += v; n++; } }
  return { media: s / n, n: n };
}
function bytesPng(F) {
  var c = PS1.ps1Cielo(F.datos, F.ancho, F.alto), s = PS1.ps1SigmaCielo(F.datos, F.ancho, F.alto, c);
  var cod = COD.codificar(F.datos, { a: s });
  return PNG.bufferGris16(cod.u16, F.ancho, F.alto).length;
}
/* La MISMA huella para las tres medias (cláusula de AC3 en el prerregistro;
   la corrida 1 la incumplía: cada parche promediaba sus propios finitos y la
   diferencia de huella NaN se colaba como «sesgo» en las dos columnas).
   Máscara: píxeles gruesos finitos en fitscut y en el propio, y cuyos nativos
   cubiertos son TODOS finitos. Referencia: la media por área del nativo sobre
   cada uno de esos píxeles, que con el bloque entero finito es justo lo que
   remuestrearArea calcula —por eso la columna del propio sale ~0 por
   construcción y la que informa es la de fitscut—. */
function sesgosMascaraComun(nativo, fit, pro, sal) {
  var ind = new Float32Array(nativo.datos.length);
  for (var i = 0; i < ind.length; i++) ind[i] = nativo.datos[i] === nativo.datos[i] ? 0 : 1;
  var fracNan = RM.remuestrearArea(ind, nativo.ancho, nativo.alto, sal);
  var ref = RM.remuestrearArea(nativo.datos, nativo.ancho, nativo.alto, sal);
  var sR = 0, sF = 0, sP = 0, n = 0;
  for (var k = 0; k < ref.length; k++) {
    var f = fit.datos[k], p = pro.datos[k];
    if (fracNan[k] !== 0 || f !== f || p !== p) continue;
    sR += ref[k]; sF += f; sP += p; n++;
  }
  return { ref: sR / n, fit: sF / n, pro: sP / n, frac: n / ref.length };
}
var RM = require('./lib_remuestreo_ps1.js');

function modoFlujo(salidas) {
  var lista = b.objetos.filter(function (o) { return o.gal; });
  if (hay('--solo')) lista = lista.filter(function (o) { return B.clave(o.nombre) === B.clave(arg('--solo')); });
  if (N) lista = lista.slice(0, N);
  var filas = [];
  return enSerie(lista, function (o, i) {
    var g = o.gal, sal = salidas || PS1.ps1SalidaParche(g.ladoArcmin);
    return BJ.bajar(g.ra, g.dec, g.ladoArcmin, sal).then(function (fit) {
      return BJ.bajarNativo(g.ra, g.dec, g.ladoArcmin, sal, null, { conNativo: true, sinCache: true }).then(function (pro) {
        var cielo = PS1.ps1Cielo(fit.datos, fit.ancho, fit.alto);
        var sigma = PS1.ps1SigmaCielo(fit.datos, fit.ancho, fit.alto, cielo);
        var m = sesgosMascaraComun(pro.nativo, fit, pro, sal);
        var fila = { n: o.nombre, sal: sal, anchoFit: fit.ancho, anchoPro: pro.ancho, mascara: m.frac,
                     sFit: Math.abs(m.fit - m.ref) / sigma, sPro: Math.abs(m.pro - m.ref) / sigma,
                     rFit: m.fit / m.ref, pngFit: bytesPng(fit), pngPro: bytesPng(pro) };
        pro.nativo = null;
        filas.push(fila);
        console.log('[' + (i + 1) + '/' + lista.length + '] ' + o.nombre + '  ' + sal + ' px  ' +
          'fitscut ' + fila.sFit.toExponential(2) + ' σ/px  ·  propio ' + fila.sPro.toExponential(2) +
          ' σ/px  ·  media fitscut/ref ' + fila.rFit.toFixed(4) + '  ·  máscara ' + (100 * fila.mascara).toFixed(1) + ' %' +
          '  ·  PNG ' + (fila.pngPro / fila.pngFit).toFixed(3) + '×' +
          (fila.anchoFit !== sal || fila.anchoPro !== sal ? '  RESOLUCIÓN ≠ REGLA C' : ''));
      });
    }).catch(function (e) { console.log('FALLO ' + o.nombre + ': ' + (e && e.message || e)); });
  }).then(function () {
    function orden(k) { return filas.map(function (f) { return f[k]; }).sort(function (a, c) { return a - c; }); }
    var sf = orden('sFit'), sp = orden('sPro');
    var pf = filas.reduce(function (a, f) { return a + f.pngFit; }, 0), pp = filas.reduce(function (a, f) { return a + f.pngPro; }, 0);
    var malRes = filas.filter(function (f) { return f.anchoFit !== f.sal || f.anchoPro !== f.sal; }).length;
    console.log('\nAC3 sobre ' + filas.length + ' objetos (σ/px contra el mosaico nativo, σ del parche de fitscut)');
    console.log('  fitscut  mediana ' + sf[sf.length >> 1].toExponential(2) + '  ·  peor ' + sf[sf.length - 1].toExponential(2));
    console.log('  propio   mediana ' + sp[sp.length >> 1].toExponential(2) + '  ·  peor ' + sp[sp.length - 1].toExponential(2));
    console.log('  listón: peor propio < 0,32 y < peor fitscut  →  ' +
      (sp[sp.length - 1] < 0.32 && sp[sp.length - 1] < sf[sf.length - 1] ? 'PASA' : 'NO PASA'));
    console.log('AC5  PNG Σ propio / Σ fitscut = ' + (pp / pf).toFixed(4) + '  (' + (pp / 1e6).toFixed(2) + ' / ' +
      (pf / 1e6).toFixed(2) + ' MB)  ·  resolución distinta de la regla C: ' + malRes +
      '  →  ' + (pp / pf <= 1.01 && !malRes ? 'PASA' : 'NO PASA'));
  });
}

var p = hay('--ram') ? modoRam(arg('--ram'), arg('--camino', 'nativo'))
      : hay('--bytes') ? modoBytes()
      : hay('--flujo') ? modoFlujo(hay('--salida') ? +arg('--salida') : 0)
      : Promise.reject(new Error('uso: --ram NOMBRE --camino fitscut|nativo · --bytes · --flujo'));
p.catch(function (e) { console.error(e && e.stack || e); process.exit(1); });
