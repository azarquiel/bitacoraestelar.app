#!/usr/bin/env node
/* Hojas de validación VISUAL de la rama nebulosa planetaria.

   Pinta el buffer difuso de producción (montaje lib_parche_produccion +
   R.ps1PintarParche) y lo vuelca a PNG con el mapeo de nivel de pintarFot
   (nivelFondo + valorDeFlujo), sin la capa de estrellas-sprite ni el realce
   local: lo que se valida aquí es morfología, tamaño angular y respuesta de
   la rampa al fondo — los bits los vigila test_golden_difusas.js.

   Salidas: .scratch/vistas-np/*.png + resumen por consola.
   Uso:  node scripts/harness_vistas_np.js */
'use strict';

var fs = require('fs'), path = require('path');
var RAIZ = path.join(__dirname, '..');
global.window = {};
require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'nebulosas-datos.js'));
var R = global.window.BitacoraGaiaRender, PS1 = R.ps1;
var B = require('./lib_bajar_parche.js')(R);
var P = require('./lib_parche_produccion.js')(R);
var png = require('./lib_png.js');

var CAT = R.ps1CatalogoDifuso(global.window.BITACORA_GALAXIAS, global.window.BITACORA_NEBULOSAS);
var OUT = path.join(RAIZ, '.scratch', 'vistas-np');
fs.mkdirSync(OUT, { recursive: true });
var GAIA = path.join(__dirname, 'fixtures', 'gaia');
var SIZE = 720, AFOV = 70;

function fila(n) { for (var i = 0; i < CAT.length; i++) if (CAT[i][0] === n) return CAT[i]; throw new Error('sin fila: ' + n); }
function leerGaia(f) {
  return fs.readFileSync(path.join(GAIA, f), 'utf8').trim().split('\n').slice(1)
    .map(function (l) { var t = l.split(','); return [parseFloat(t[0]), parseFloat(t[1]), parseFloat(t[2])]; });
}

var VISTAS = [
  // control: las galaxias del golden, una config de referencia
  { obj: 'NGC 5194', csv: 'gaia_ngc5194.csv', D: 457.2, M: 190, sqm: 21.2 },
  { obj: 'NGC 5457', csv: 'gaia_ngc5457.csv', D: 457.2, M: 190, sqm: 21.2 },
  { obj: 'NGC 4594', csv: 'gaia_ngc4594.csv', D: 457.2, M: 190, sqm: 21.2 },
  { obj: 'NGC 3031', csv: 'gaia_ngc3031.csv', D: 457.2, M: 190, sqm: 21.2 },
  // M57: tamaño angular con el aumento, apertura, y rampa contra el fondo
  { obj: 'NGC6720', csv: 'gaia_ngc6720.csv', D: 457.2, M: 100, sqm: 21.2 },
  { obj: 'NGC6720', csv: 'gaia_ngc6720.csv', D: 457.2, M: 190, sqm: 21.2 },
  { obj: 'NGC6720', csv: 'gaia_ngc6720.csv', D: 457.2, M: 300, sqm: 21.2 },
  { obj: 'NGC6720', csv: 'gaia_ngc6720.csv', D: 203.0, M: 190, sqm: 21.2 },
  { obj: 'NGC6720', csv: 'gaia_ngc6720.csv', D: 457.2, M: 190, sqm: 18.5 },
  // emisión/reflexión (rama nebulosas-emision-reflexion)
  { obj: 'NGC2068', csv: 'gaia_ngc2068.csv', D: 457.2, M: 100, sqm: 21.2 },
  { obj: 'NGC2068', csv: 'gaia_ngc2068.csv', D: 457.2, M: 190, sqm: 21.2 },
  { obj: 'NGC7635', csv: 'gaia_ngc7635.csv', D: 457.2, M: 190, sqm: 21.2 },
  { obj: 'NGC6888', csv: 'gaia_ngc6888.csv', D: 457.2, M: 100, sqm: 21.2 },
  // resto de supernova
  { obj: 'NGC1952', csv: 'gaia_ngc1952.csv', D: 457.2, M: 190, sqm: 21.2 }
];

var parches = {};   // un montaje por objeto, como producción
function parcheDe(v) {
  if (parches[v.obj]) return Promise.resolve(parches[v.obj]);
  var gal = P.galDeFila(fila(v.obj));
  return B.bajar(gal.ra, gal.dec, gal.ladoArcmin, PS1.salida).then(function (F) {
    parches[v.obj] = { gal: gal, parche: P.montar(F, gal, leerGaia(v.csv), CAT) };
    return parches[v.obj];
  });
}

function vista(v) {
  return parcheDe(v).then(function (m) {
    var gal = m.gal, parche = m.parche;
    var cielo = { pupilaSalida: v.D / v.M, pupilaOjo: 7, sqm: v.sqm,
                  aumentos: v.M, realceMax: PS1.realceMax, perceptual: true };
    var o = { ra0: gal.ra, dec0: gal.dec, arcmin: AFOV / v.M * 60,
              size: SIZE, cielo: cielo, apertura: v.D };
    var difuso = new Float32Array(SIZE * SIZE);
    R.ps1PintarParche(difuso, parche, o);
    var c = R.ctxFotometrico(cielo, parche.thetaIntArcmin);
    var rgb = new Uint8Array(SIZE * SIZE * 3);
    var enc = 0, negros = 0, maxN = 0;
    for (var i = 0; i < difuso.length; i++) {
      var F = difuso[i], n = c.nivelFondo;
      if (F > 0) { n += R.valorDeFlujo(F, c.Fcielo, c.rango); enc++; }
      if (F < 0 || F !== F) negros++;                 // no debe ocurrir
      var g = Math.max(0, Math.min(255, Math.round(n)));
      if (g > maxN) maxN = g;
      rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = g;
    }
    var nombre = v.obj.replace(/\s+/g, '') + '_D' + Math.round(v.D) + '_M' + v.M + '_sqm' + v.sqm;
    png.escribir(path.join(OUT, nombre + '.png'), rgb, SIZE, SIZE);
    console.log(nombre + '.png  θint ' + parche.thetaIntArcmin.toFixed(2) + '′ · campo ' +
      o.arcmin.toFixed(1) + '′ · fondo nivel ' + Math.round(c.nivelFondo) + ' · px con objeto ' +
      enc + ' · nivel máx ' + maxN + (negros ? ' · ¡' + negros + ' px inválidos!' : ''));
  });
}

var cola = Promise.resolve();
VISTAS.forEach(function (v) { cola = cola.then(function () { return vista(v); }); });
cola.then(function () { console.log('→ ' + path.relative(RAIZ, OUT)); })
  .catch(function (e) { console.error('ERROR: ' + (e && e.stack || e)); process.exit(1); });
