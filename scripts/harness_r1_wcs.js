#!/usr/bin/env node
/* Comparador de la recaptura R1: monta los cuatro objetos del golden con la WCS
   del recorte apagada y encendida, en el mismo proceso, y resta. Es el paso 4
   del procedimiento (simulador_ocular/docs/notas/recaptura-golden-difusas.md):
   el fichero de línea base guarda hashes y agregados, no píxeles, así que
   max|Δ|/σ no sale de ahí.

   Uso: node scripts/harness_r1_wcs.js
   Salida: la tabla de deltas por objeto (parche.datos y los dos difuso). */
'use strict';

var fs = require('fs'), path = require('path'), crypto = require('crypto');
var RAIZ = path.join(__dirname, '..');
global.window = {};
require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-ps1.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js'));
var R = global.window.BitacoraGaiaRender, PS1 = window.BitacoraPS1.cfg;
var CAT = global.window.BITACORA_GALAXIAS;
var B = require('./lib_bajar_parche.js')(R);
var P = require('./lib_parche_produccion.js')(R);

var GAIA = path.join(__dirname, 'fixtures', 'gaia');
var OBJS = [
  { cat: 'NGC 5194', alias: 'M51',  csv: 'gaia_ngc5194.csv' },
  { cat: 'NGC 5457', alias: 'M101', csv: 'gaia_ngc5457.csv' },
  { cat: 'NGC 4594', alias: 'M104', csv: 'gaia_ngc4594.csv' },
  { cat: 'NGC 3031', alias: 'M81',  csv: 'gaia_ngc3031.csv' }
];
var CONFIGS = [
  { D: 457.2, M: 190, sqm: 21.2 },
  { D: 203.0, M: 100, sqm: 20.5 }
];
var SIZE = 720, AFOV = 70;

function filaCat(n) { for (var i = 0; i < CAT.length; i++) if (CAT[i][0] === n) return CAT[i]; throw new Error('sin fila: ' + n); }
function leerGaia(f) {
  return fs.readFileSync(path.join(GAIA, f), 'utf8').trim().split('\n').slice(1)
    .map(function (l) { var t = l.split(','); return [parseFloat(t[0]), parseFloat(t[1]), parseFloat(t[2])]; });
}
function sha(f32) { return crypto.createHash('sha256').update(Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength)).digest('hex'); }

/* Δ entre dos capas del mismo tamaño. σ es la de la capa «antes» (finitos):
   es la escala contra la que el procedimiento fija el umbral 0,05·σ. */
function delta(antes, desp) {
  var s0 = 0, s2 = 0, n = 0, nanA = 0, nanD = 0, sD = 0, max = 0, soloUno = 0;
  for (var i = 0; i < antes.length; i++) {
    var a = antes[i], d = desp[i];
    var fa = a === a, fd = d === d;
    if (!fa) nanA++;
    if (!fd) nanD++;
    if (fa) { s0 += a; s2 += a * a; n++; }
    if (fd) sD += d;
    if (fa && fd) { var m = Math.abs(d - a); if (m > max) max = m; }
    else if (fa !== fd) soloUno++;
  }
  var media = n ? s0 / n : 0;
  var sigma = n ? Math.sqrt(Math.max(0, s2 / n - media * media)) : 0;
  return { sumaA: s0, sumaD: sD, dSumaRel: s0 ? (sD - s0) / s0 : 0,
           nanA: nanA, nanD: nanD, soloUno: soloUno, max: max,
           sigma: sigma, maxSigma: sigma ? max / sigma : Infinity };
}

function fila(etiq, sA, sD, dl) {
  console.log('  ' + etiq +
    '\n    sha256   ' + sA.slice(0, 12) + '… → ' + sD.slice(0, 12) + '…' +
    '\n    suma     ' + dl.sumaA.toExponential(6) + ' → ' + dl.sumaD.toExponential(6) +
    '  (Δ/suma ' + (dl.dSumaRel * 100).toFixed(3) + ' %)' +
    '\n    NaN      ' + dl.nanA + ' → ' + dl.nanD + '  (solo en uno de los dos: ' + dl.soloUno + ')' +
    '\n    max|Δ|   ' + dl.max.toExponential(3) + '  = ' + dl.maxSigma.toFixed(3) + ' σ  (σ = ' + dl.sigma.toExponential(3) + ')');
}

function montar(O, conWcs) {
  var gal = P.galDeFila(filaCat(O.cat));
  return B.bajar(gal.ra, gal.dec, gal.ladoArcmin, PS1.salida, null, conWcs).then(function (F) {
    var parche = P.montar(F, gal, leerGaia(O.csv), CAT);
    var difusos = CONFIGS.map(function (C) {
      var cielo = { pupilaSalida: C.D / C.M, pupilaOjo: 7, sqm: C.sqm,
                    aumentos: C.M, realceMax: PS1.realceMax, perceptual: true };
      var o = { ra0: gal.ra, dec0: gal.dec, arcmin: AFOV / C.M * 60,
                size: SIZE, cielo: cielo, apertura: C.D };
      var difuso = new Float32Array(SIZE * SIZE);
      window.BitacoraPS1.ps1PintarParche(difuso, parche, o);
      return difuso;
    });
    return { wcs: F.wcs || null, parche: parche, difusos: difusos };
  });
}

var cola = Promise.resolve();
OBJS.forEach(function (O) {
  cola = cola.then(function () {
    return montar(O, false).then(function (a) {
      return montar(O, true).then(function (d) {
        console.log('\n' + O.alias + ':');
        console.log('  afin sin wcs  ' + JSON.stringify(a.parche.afin));
        console.log('  afin con wcs  ' + JSON.stringify(d.parche.afin));
        console.log('  wcs del recorte ' + (d.wcs ? 'presente' : 'AUSENTE'));
        console.log('  thetaIntArcmin ' + a.parche.thetaIntArcmin + ' → ' + d.parche.thetaIntArcmin +
          (a.parche.thetaIntArcmin === d.parche.thetaIntArcmin ? '  (no se mueve)' : '  ¡SE MUEVE!'));
        fila('parche.datos', sha(a.parche.datos), sha(d.parche.datos), delta(a.parche.datos, d.parche.datos));
        CONFIGS.forEach(function (C, j) {
          fila('difuso ' + C.D + 'mm/' + C.M + 'x/sqm' + C.sqm,
            sha(a.difusos[j]), sha(d.difusos[j]), delta(a.difusos[j], d.difusos[j]));
        });
      });
    });
  });
});

cola.then(function () {
  console.log('\nnode ' + process.version);
}).catch(function (e) { console.error('ERROR: ' + (e && e.stack || e)); process.exit(2); });
