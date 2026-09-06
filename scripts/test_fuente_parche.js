#!/usr/bin/env node
/* De dónde sale el parche de un objeto difuso (ps1FuenteParche, ps1LeerTextura,
   resources/js/bitacora-ps1.js).

   El contrato de la frontera, que es lo único que este test vigila:

     manifiesto «imagen» → la textura de dso/, y ni una petición al proxy
     manifiesto «fila»   → null con su motivo, y NINGUNA petición de red
     sin fila            → el proxy, y solo si cfg.proxyRespaldo sigue encendido
     textura ilegible    → null, y el campo se pinta igual (por la fila)

   Y que lo que sale de la textura es INDISTINGUIBLE EN FORMA de lo que sale de
   parseFITS: mismas claves, mismos tipos. Si dejaran de serlo, todo lo que hay
   aguas abajo —ps1AnclarACatalogo, la mezcla, ps1PsfParche, H2c— tendría que
   enterarse de dónde vino el parche, que es justo lo que la frontera evita.

   Sin red: el fetch es de mentira y sirve los ficheros de scripts/fixtures/dso/,
   con cfg.texturasUrl apuntando ahí. Lo que se mide no es solo el resultado,
   son las URL que se pidieron.

   Uso:  node scripts/test_fuente_parche.js */
'use strict';

var fs = require('fs'), path = require('path');
var RAIZ = path.join(__dirname, '..');
var FIXT = path.join(RAIZ, 'scripts', 'fixtures', 'dso');
var BASE = 'https://textura-de-mentira/dso/';

var fallos = 0, comprobaciones = 0;
function ok(c, t) {
  comprobaciones++;
  console.log('  ' + (c ? 'ok  ' : 'FALLO') + '  ' + t);
  if (!c) fallos++;
}

/* Cada caso arranca con el módulo recién cargado: cachePS1 vive dentro y es de
   sesión, así que sin esto el segundo caso vería el parche del primero y no
   pediría nada. */
var MODULOS = ['resources/js/bitacora-gaia-render.js', 'resources/js/bitacora-ps1.js',
               'resources/js/bitacora-png16.js',
               'simulador_ocular/resources/js/galaxias-datos.js',
               'simulador_ocular/resources/js/nebulosas-datos.js',
               'simulador_ocular/resources/js/dso-texturas-datos.js'];
function fresco() {
  MODULOS.forEach(function (m) { delete require.cache[require.resolve(path.join(RAIZ, m))]; });
  global.window = {};
  MODULOS.forEach(function (m) { require(path.join(RAIZ, m)); });
  window.BitacoraPS1.texturasUrl = BASE;
  window.BitacoraPS1.proxyUrl = 'https://proxy-de-mentira/ps1-proxy.php';
  return window.BitacoraPS1;
}

var pedidos = [];
global.fetch = function (url) {
  url = String(url);
  pedidos.push(url);
  if (url.indexOf(BASE) !== 0) return Promise.resolve({ ok: false, status: 599 });
  var ruta = path.join(FIXT, url.slice(BASE.length));
  if (!fs.existsSync(ruta)) return Promise.resolve({ ok: false, status: 404 });
  var b = fs.readFileSync(ruta);
  return Promise.resolve({
    ok: true, status: 200,
    arrayBuffer: function () { return Promise.resolve(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); },
    json: function () { return Promise.resolve(JSON.parse(b.toString('utf8'))); }
  });
};
function fueraDeDso() {
  return pedidos.filter(function (u) { return u.indexOf(BASE) !== 0; });
}

/* Un FITS de 2×2 escrito a mano: el patrón contra el que se compara la FORMA.
   No hay otra manera de comparar contra parseFITS sin pedirle un parche a
   STScI, y lo que se compara son las claves, no los píxeles. */
function fitsMinimo() {
  function tarjeta(k, v) {
    var relleno = new Array(72).join(' ');
    return (k + relleno).slice(0, 8) + '=' + (relleno + v).slice(-71);
  }
  var cab = [
    tarjeta('SIMPLE', 'T'), tarjeta('BITPIX', '-32'), tarjeta('NAXIS', '2'),
    tarjeta('NAXIS1', '2'), tarjeta('NAXIS2', '2'),
    tarjeta('CRVAL1', '202.5'), tarjeta('CRVAL2', '47.2'),
    tarjeta('CRPIX1', '1.5'), tarjeta('CRPIX2', '1.5'),
    tarjeta('CDELT1', '-2.9351E-4'), tarjeta('CDELT2', '2.9351E-4'),
    ('END' + '                                                                                ').slice(0, 80)
  ].join('');
  var buf = new ArrayBuffer(2880 + 16), b = new Uint8Array(buf);
  for (var i = 0; i < cab.length; i++) b[i] = cab.charCodeAt(i);
  for (i = cab.length; i < 2880; i++) b[i] = 32;
  var dv = new DataView(buf);
  [1.5, 2.5, 3.5, 4.5].forEach(function (v, k) { dv.setFloat32(2880 + k * 4, v, false); });
  return buf;
}

function claves(o) { return Object.keys(o).sort().join(','); }

var PS1 = fresco();
var MANIFIESTO = window.BITACORA_DSO_TEXTURAS;
var FILA = MANIFIESTO.filter(function (f) { return f[0] === 'NGC 5194'; })[0];

function galDe(PS1, nombre) {
  var todas = PS1.ps1CatalogoDifuso(window.BITACORA_GALAXIAS, window.BITACORA_NEBULOSAS);
  var f = todas.filter(function (r) { return r[0] === nombre; })[0];
  return PS1.ps1GalaxiasDelCampo([f], f[2], f[3], PS1.ps1LadoArcmin(f[4]))[0];
}

Promise.resolve().then(function () {
  console.log('\nEl manifiesto y su fixture:');
  ok(!!FILA, 'NGC 5194 está en el manifiesto generado');
  ok(FILA && FILA[1] === 'imagen', 'y declara modelo «imagen»');
  var id = PS1.ps1IdTextura('NGC 5194');
  ok(id === 'NGC5194', 'el nombre de fichero pierde el espacio (' + id + ')');
  ok(PS1.ps1IdTextura('PN A66 12') === 'PNA6612', 'todos los espacios, no solo el primero');
  ok(PS1.ps1IdTextura('LDN 1622/B') === 'LDN1622_B', 'y la barra, que no puede ir en un nombre de fichero');
  ok(fs.existsSync(path.join(FIXT, id + '.' + FILA[2] + '.png')) &&
     fs.existsSync(path.join(FIXT, id + '.' + FILA[2] + '.json')),
     'la textura y el sidecar de esa versión están en scripts/fixtures/dso/');

  /* ── Textura: misma forma que parseFITS ──────────────────────────────────── */
  console.log('\nLa textura de M51 en vez del FITS del proxy:');
  var P = fresco();
  pedidos = [];
  var gal = galDe(P, 'NGC 5194');
  return P.ps1FuenteParche(gal).then(function (f) {
    var patron = P.parseFITS(fitsMinimo());
    ok(!!f, 'ps1FuenteParche devuelve parche');
    if (!f) return;
    ok(fueraDeDso().length === 0, 'sin una sola petición fuera de dso/ (' + pedidos.length + ' peticiones, todas a dso/)');
    ok(pedidos.some(function (u) { return /\.png$/.test(u); }) &&
       pedidos.some(function (u) { return /\.json$/.test(u); }), 'pidió la textura y su sidecar');
    /* ps1FuenteParche añade ra/dec/ladoArcmin a los dos caminos por igual; lo
       que tiene que coincidir es lo que produce el lector. */
    var suyas = {}; ['ra', 'dec', 'ladoArcmin'].forEach(function (k) { suyas[k] = 1; });
    var soloLector = {};
    Object.keys(f).forEach(function (k) { if (!suyas[k]) soloLector[k] = f[k]; });
    ok(claves(soloLector) === claves(patron),
       'mismas claves que parseFITS (' + claves(soloLector) + ')');
    ok(f.datos instanceof Float32Array && f.datos.length === f.ancho * f.alto,
       'datos es un Float32Array de ancho·alto (' + f.ancho + '×' + f.alto + ')');
    ok(typeof f.escalaAs === 'number' && f.escalaAs > 0, 'escalaAs en ″/px (' + f.escalaAs.toFixed(4) + ')');
    ok(!!f.wcs && claves(f.wcs) === claves(patron.wcs),
       'la WCS trae las mismas claves que la de parseFITS (' + (f.wcs ? claves(f.wcs) : 'null') + ')');

    var sc = JSON.parse(fs.readFileSync(path.join(FIXT, 'NGC5194.' + FILA[2] + '.json'), 'utf8'));
    ok(f.ancho === sc.ancho && f.alto === sc.alto && f.escalaAs === sc.escalaAs,
       'tamaño y escala son los que declara el sidecar');
    var nan = 0, i;
    for (i = 0; i < f.datos.length; i++) if (f.datos[i] !== f.datos[i]) nan++;
    ok(Math.abs(nan / f.datos.length - sc.auditoria.fracAusencia) < 1e-9,
       'los NaN decodificados son exactamente la ausencia auditada (' + nan + ' px)');
    /* El nivel absoluto lo pone el catálogo, pero si la codificación se
       descabalase el cielo del parche dejaría de parecerse al auditado, y
       ps1AnclarACatalogo decidiría otra ausencia. */
    var cielo = P.ps1Cielo(f.datos, f.ancho, f.alto);
    var sigma = P.ps1SigmaCielo(f.datos, f.ancho, f.alto, cielo);
    ok(Math.abs(cielo - sc.auditoria.cielo) < 0.05 * sc.auditoria.sigma,
       'el cielo recalculado sobre lo decodificado coincide con el auditado (' +
       cielo.toFixed(4) + ' vs ' + sc.auditoria.cielo.toFixed(4) + ')');
    ok(Math.abs(sigma / sc.auditoria.sigma - 1) < 1e-3,
       'y σ también (' + sigma.toFixed(4) + ' vs ' + sc.auditoria.sigma.toFixed(4) + ')');
    /* Esto NO es el listón L1.1: L1.1 compara `parche.datos` por textura contra
       por FITS y necesita el FITS, que aquí no está (es una medida de la fase 1,
       no un test). Lo que se comprueba es que la textura PUBLICADA declara un
       error de cuantización bajo el listón; si una regeneración futura publicara
       una que no lo cumple, esto se pone rojo. */
    ok(sc.auditoria.errCuantMaxSigma < 0.05,
       'la textura publicada declara un error de cuantización bajo los 0,05 σ del listón L1.1 (' +
       sc.auditoria.errCuantMaxSigma.toExponential(2) + ')');
  });

}).then(function () {
  /* ── El parche completo, y el campo entero ───────────────────────────────── */
  console.log('\nEl campo de M51 se pinta desde la textura:');
  var P = fresco();
  /* El campo de M51 trae también a NGC 5195, que no tiene textura todavía: con
     el respaldo apagado se pinta por su fila y el campo no sale del dominio,
     que es lo que el listón L1.2 mide. */
  P.cfg.proxyRespaldo = false;
  pedidos = [];
  var catalogo = P.ps1CatalogoDifuso(window.BITACORA_GALAXIAS, window.BITACORA_NEBULOSAS);
  var gal = galDe(P, 'NGC 5194');
  var difuso = new Float32Array(64 * 64);
  var ctx = { canvas: { width: 64, height: 64 },
              createImageData: function (w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
              putImageData: function () {} };
  var cielo = { sqm: 21.4, pupilaSalida: 3.3, pupilaOjo: 7, transmision: 0.8 };
  return P.ps1CapaGalaxias(difuso, ctx, cielo, null, {
    ra0: gal.ra, dec0: gal.dec, arcmin: 40, size: 64, estrellas: [],
    catalogo: catalogo, apertura: 200
  }).then(function (r) {
    ok(fueraDeDso().length === 0,
       'la capa no pidió nada fuera de dso/ (' + pedidos.length + ' peticiones; fuera: ' +
       (fueraDeDso()[0] || 'ninguna') + ')');
    ok(r.aviso === '', 'y no hay aviso de que falte la imagen ("' + r.aviso + '")');
    var pintado = 0;
    for (var i = 0; i < difuso.length; i++) if (difuso[i] > 0) pintado++;
    ok(pintado > 0, 'el difuso lleva luz de la galaxia (' + pintado + ' px)');
  });

}).then(function () {
  /* ── Manifiesto con «fila»: ni una petición ──────────────────────────────── */
  console.log('\nUn objeto que el manifiesto declara «fila»:');
  var P = fresco();
  window.BITACORA_DSO_TEXTURAS = [['NGC 5194', 'fila', '', 0, 0, 0, 'no-cabe']];
  pedidos = [];
  var notas = {};
  return P.ps1FuenteParche(galDe(P, 'NGC 5194'), notas).then(function (f) {
    ok(f === null, 'no hay parche');
    ok(pedidos.length === 0, 'y NINGUNA petición de red (' + pedidos.length + ')');
    ok(notas.motivo === 'no-cabe', 'el motivo sale del manifiesto (' + notas.motivo + ')');
  });

}).then(function () {
  /* ── Sin fila: el proxy, y solo con respaldo ─────────────────────────────── */
  console.log('\nUn objeto que el manifiesto no menciona:');
  var P = fresco();
  window.BITACORA_DSO_TEXTURAS = [];
  pedidos = [];
  return P.ps1FuenteParche(galDe(P, 'NGC 5194')).then(function (f) {
    ok(pedidos.length === 1 && pedidos[0].indexOf('ps1-proxy.php') > 0,
       'con proxyRespaldo encendido se cae al proxy (' + (pedidos[0] || 'nada') + ')');
    ok(f === null, 'y sin servicio no hay parche, como siempre');

    var Q = fresco();
    window.BITACORA_DSO_TEXTURAS = [];
    Q.cfg.proxyRespaldo = false;
    pedidos = [];
    var notas = {};
    return Q.ps1FuenteParche(galDe(Q, 'NGC 5194'), notas).then(function (g) {
      ok(g === null && pedidos.length === 0,
         'con proxyRespaldo apagado no sale ninguna petición (' + pedidos.length + ')');
      ok(notas.motivo === 'sin-textura', 'y el motivo lo dice (' + notas.motivo + ')');
    });
  });

}).then(function () {
  /* ── Textura ilegible: null, y el campo se pinta igual ───────────────────── */
  console.log('\nUna textura que no se puede decodificar:');
  var P = fresco();
  window.BITACORA_DSO_TEXTURAS = [['NGC 5194', 'imagen', 'noexiste', 1024, 1, 0, '']];
  pedidos = [];
  var notas = {};
  return P.ps1FuenteParche(galDe(P, 'NGC 5194'), notas).then(function (f) {
    ok(f === null, 'devuelve null y no un parche a medias');
    ok(notas.motivo === 'red', 'con su motivo (' + notas.motivo + ')');

    /* Y el sidecar que no cuadra con el PNG: fichero legible, textura falsa. */
    var Q = fresco();
    var buenoPng = fs.readFileSync(path.join(FIXT, 'NGC5194.' + FILA[2] + '.png'));
    var sc = JSON.parse(fs.readFileSync(path.join(FIXT, 'NGC5194.' + FILA[2] + '.json'), 'utf8'));
    sc.ancho = sc.ancho / 2;
    var previo = global.fetch;
    global.fetch = function (u) {
      u = String(u);
      pedidos.push(u);
      return Promise.resolve({
        ok: true, status: 200,
        arrayBuffer: function () { return Promise.resolve(buenoPng.buffer.slice(buenoPng.byteOffset, buenoPng.byteOffset + buenoPng.byteLength)); },
        json: function () { return Promise.resolve(sc); }
      });
    };
    window.BITACORA_DSO_TEXTURAS = MANIFIESTO;
    var n2 = {};
    return Q.ps1FuenteParche(galDe(Q, 'NGC 5194'), n2).then(function (g) {
      global.fetch = previo;
      ok(g === null, 'un sidecar que no describe ese PNG tampoco pasa');
      ok(n2.motivo === 'sidecar', 'y se distingue del fallo de red (' + n2.motivo + ')');
    }, function (e) { global.fetch = previo; ok(false, 'lanzó en vez de devolver null: ' + e.message); });
  });

}).then(function () {
  /* ── Las URL son configurables ───────────────────────────────────────────── */
  console.log('\nLas dos direcciones tienen setter:');
  var P = fresco();
  P.texturasUrl = '/otro/sitio/';
  P.proxyUrl = '/otro/proxy.php';
  ok(P.texturasUrl === '/otro/sitio/', 'BitacoraPS1.texturasUrl se puede redirigir');
  ok(P.ps1UrlParche({ ra: 1, dec: 2, ladoArcmin: 3 }).indexOf('/otro/proxy.php?') === 0,
     'y la URL del proxy sale de proxyUrl (' + P.ps1UrlParche({ ra: 1, dec: 2, ladoArcmin: 3 }).slice(0, 20) + '…)');

}).then(function () {
  /* ADR 0005: cardinalidad mínima. Sin ella, una promesa perdida por el camino
     deja el proceso en verde con la mitad de los casos sin correr.
     Mutación documentada, comprobada: en ps1FuenteParche, cambiar
     `} else if (!PS1.proxyRespaldo) {` por `} else if (false) {` deja 3 rojos
     —el campo de M51 vuelve a salir al proxy por NGC 5195, y el respaldo
     apagado deja de apagar nada—. */
  console.log('');
  ok(comprobaciones >= 30, 'se ejecutaron todas las comprobaciones (' + comprobaciones + ' ≥ 30)');
  console.log(fallos ? '\n' + fallos + ' fallo(s).' : '\ntodo en orden.');
  process.exit(fallos ? 1 : 0);
}).catch(function (e) {
  console.error('EXCEPCIÓN: ' + e.stack);
  process.exit(1);
});
