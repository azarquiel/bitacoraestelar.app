#!/usr/bin/env node
/* #411: ¿cuánto más tarda la capa difusa en Virgo con el corte BT_MAX nuevo?

   Listón, fijado ANTES de medir: la mediana de 5 tiradas con el catálogo nuevo
   no pasa de 1,25× la de 5 tiradas con el de main. Las tiradas se alternan
   (main, rama, main…) porque esta máquina da el mismo test en 251 s o en 444 s
   según cómo vaya la memoria: alternar reparte ese ruido entre los dos lados.

   Campo: el de L2.4 (`scripts/harness_l1_coste.html`), punto medio de
   NGC 4374 y NGC 4406, 120′. Quién cae dentro lo decide `ps1GalaxiasDelCampo`.

   Qué se mide: `ps1CapaGalaxias` entera, de la llamada a la promesa resuelta,
   sin red. Toda galaxia va por el camino del proxy (manifiesto vacío) y el
   fetch le devuelve un FITS sintético del tamaño que pidió, con la WCS
   centrada en ella. Así cada parche cuesta lo que cuesta uno real en CPU
   —parseFITS, quitar estrellas, PSF, mezcla, pintado— y la única diferencia
   entre los dos lados es cuántas galaxias entran. La latencia de red no se
   mide: los parches viajan en paralelo y no es lo que añade el catálogo.

   Uso:  node scripts/harness_411_virgo_tiempo.js [galaxias-datos.js]
         (sin argumento, el del repo; imprime una línea JSON) */
'use strict';

var path = require('path');
var RAIZ = path.join(__dirname, '..');
var DATOS = path.resolve(process.argv[2] ||
  path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js'));

global.window = {};
require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-ps1.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-png16.js'));
require(DATOS);
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'nebulosas-datos.js'));
window.BITACORA_DSO_TEXTURAS = [];
var P = window.BitacoraPS1;
P.proxyUrl = 'https://proxy-de-mentira/ps1-proxy.php';

function tarjeta(k, v) {
  var relleno = new Array(72).join(' ');
  return (k + relleno).slice(0, 8) + '=' + (relleno + v).slice(-71);
}
/* Cielo plano con ruido y un núcleo gaussiano en el centro: la forma da igual,
   lo que pesa es el número de píxeles. */
function fitsSintetico(ra, dec, lado, salida) {
  var esc = lado / 60 / salida;
  var cab = [
    tarjeta('SIMPLE', 'T'), tarjeta('BITPIX', '-32'), tarjeta('NAXIS', '2'),
    tarjeta('NAXIS1', String(salida)), tarjeta('NAXIS2', String(salida)),
    tarjeta('CRVAL1', String(ra)), tarjeta('CRVAL2', String(dec)),
    tarjeta('CRPIX1', String((salida + 1) / 2)), tarjeta('CRPIX2', String((salida + 1) / 2)),
    tarjeta('CDELT1', String(-esc)), tarjeta('CDELT2', String(esc)),
    ('END' + new Array(80).join(' ')).slice(0, 80)
  ].join('');
  var buf = new ArrayBuffer(2880 + salida * salida * 4), b = new Uint8Array(buf);
  for (var i = 0; i < 2880; i++) b[i] = i < cab.length ? cab.charCodeAt(i) : 32;
  var dv = new DataView(buf), c = salida / 2, s2 = 2 * Math.pow(salida / 20, 2), sem = 1;
  for (var y = 0; y < salida; y++) for (var x = 0; x < salida; x++) {
    sem = (sem * 16807) % 2147483647;
    var r2 = (x - c) * (x - c) + (y - c) * (y - c);
    dv.setFloat32(2880 + (y * salida + x) * 4, 1e-9 * (sem / 2147483647 - 0.5) + 5e-7 * Math.exp(-r2 / s2), false);
  }
  return buf;
}

var pedidos = 0;
global.fetch = function (url) {
  var q = {};
  String(url).split('?')[1].split('&').forEach(function (kv) { kv = kv.split('='); q[kv[0]] = kv[1]; });
  pedidos++;
  var buf = fitsSintetico(+q.ra, +q.dec, +q.lado, +q.salida);
  return Promise.resolve({ ok: true, status: 200, arrayBuffer: function () { return Promise.resolve(buf); } });
};

var catalogo = P.ps1CatalogoDifuso(window.BITACORA_GALAXIAS, window.BITACORA_NEBULOSAS);
function fila(n) { return catalogo.filter(function (r) { return r[0] === n; })[0]; }
var a = fila('NGC 4374'), b = fila('NGC 4406');
var ra0 = (a[2] + b[2]) / 2, dec0 = (a[3] + b[3]) / 2, ARCMIN = 120, SIZE = 800;
var campo = P.ps1GalaxiasDelCampo(catalogo, ra0, dec0, ARCMIN).length;

var ctx = { canvas: { width: SIZE, height: SIZE },
            createImageData: function (w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
            putImageData: function () {} };
var t0 = process.hrtime.bigint();
P.ps1CapaGalaxias(new Float32Array(SIZE * SIZE), ctx,
  { sqm: 21.4, pupilaSalida: 3.3, pupilaOjo: 7, transmision: 0.8, aumentos: 60 }, null,
  { ra0: ra0, dec0: dec0, arcmin: ARCMIN, size: SIZE, estrellas: [], catalogo: catalogo, apertura: 200 }
).then(function () {
  console.log(JSON.stringify({ datos: path.basename(path.dirname(DATOS)) + '/' + path.basename(DATOS),
    filas: window.BITACORA_GALAXIAS.length, campo: campo, pedidos: pedidos,
    ms: Number(process.hrtime.bigint() - t0) / 1e6 }));
});
