#!/usr/bin/env node
/* ADR 0012, paso 2: calibrar θ_sep (y comprobar la sensibilidad a Δmag) contra
   la verdad geométrica del banco, anillo por anillo.

   La ley que se calibra es `pob.aCrowd` de producción, no una copia (ADR 0008):

     a(m, r) = exp(−n(>= m+Δmag, r) · π θ_sep²),   θ_sep = thetaSepRadios · radioImagenAs

   La predicción del modelo en un anillo es Σ a(m_i, r_i) sobre las estrellas
   reales de Gaia visibles en él: cuántas espera ver solas en su beam. Enfrente,
   UNA verdad independiente, la geométrica: cuenta las estrellas del fixture SIN
   vecino comparable dentro de θ_sep, sobre las posiciones reales de Gaia. No
   lleva ley dentro, solo distancias.

   La segunda verdad de `harness_crowding_k.js` —Poisson con la n de la LF,
   invirtiendo `mCrowd` por bisección— NO sirve aquí, y el arnés lo comprueba en
   vez de confiarse: frente a `mCrowd` (umbral duro en k) era independiente, pero
   frente a `aCrowd` es la MISMA fórmula, exp(−n·πθ_sep²), leída por otro camino.
   Coincide dígito a dígito. Se conserva como comprobación de identidad —valida
   la bisección y que lo implementado es la ley del ADR— y no como cota; usarla
   de cota haría el barrido vacuo (ADR 0005).

   Lo que discrimina no son las cuentas: fuera de r_h la mezcla casi no muerde y
   modelo y geometría coinciden trivialmente, con cualquier θ_sep. Lo que
   discrimina es el DÉFICIT por anillo —Gaia menos resueltas, las estrellas que
   la mezcla se lleva—, que es donde vive toda la señal.

   Dos asimetrías del fixture, que no se corrigen y se imprimen:

     · Gaia mide con FWHM 0,6": los pares más cerrados ya le faltan, así que la
       geométrica es COTA SUPERIOR de lo separable, y su déficit una cota INFERIOR.
     · Gaia es incompleta en el núcleo, así que allí ni la geometría ni el propio
       Σ a(m_i,r_i) —que suma sobre catalogadas— ven todas las estrellas que hay.

   En el núcleo las dos empujan en el mismo sentido: <=0,25 r_h informa, no decide.

   node scripts/harness_thetasep.js [--sqm N] [--D mm] [--mag N] */
'use strict';

global.window = {};
global.document = undefined;
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/lf-globulares-datos.js');
require('../simulador_ocular/resources/js/globulares-datos.js');
require('../resources/js/bitacora-cumulos.js');
var fs = require('fs'), path = require('path');
var R = global.window.BitacoraGaiaRender;
var C = global.window.BitacoraCumulos;

function arg(n, def) { var i = process.argv.indexOf('--' + n); return i > 0 ? +process.argv[i + 1] : def; }
var SQM = arg('sqm', 21), D = arg('D', 467), MAG = arg('mag', 173), PROC = 720;
var ARCMIN = 0.47 * 60;
var THETAS = [1.0, 1.5, 2.0, 2.5, 3.0, 4.0];     // en radios de imagen estelar
// (la mitad de estos números eran el θ/FWHM del informe del paso 2: misma rejilla)
var DMAGS = [0.5, 0.75, 1.0];                    // «comparable»: cuánto más débil mezcla
var ANILLOS = [0.25, 0.5, 1, 2, 4, 8];

var e = global.window.BITACORA_GLOBULARES.filter(function (f) { return f[0] === 'NGC 6205'; })[0];
var M13 = { id: e[0], ra: e[2], dec: e[3], rc: e[4], rh: e[5], c: e[6], muV0: e[7],
            Vt: e[8], dkpc: e[9], ebv: e[10], feh: e[11], elip: e[12], pa: null };
var rhAs = M13.rh * 60;

var gaia = fs.readFileSync(path.join(__dirname, '../docs/halo_v7/m13_gaia_dr3.csv'), 'utf8')
  .trim().split('\n').slice(1).map(function (l) {
    var c = l.split(',');
    return [+c[0], +c[1], +c[2], c[3] === '' ? null : +c[3]];
  });

var mlim = R.magLimite({ apertura: D, aumentos: MAG, transmision: 0.9, sqm: SQM, pupilaOjo: 7 });
var cielo = { pupilaSalida: D / MAG, pupilaOjo: 7, sqm: SQM, transmision: 0.9,
              aumentos: MAG, perceptual: true };
var visibles = gaia.filter(function (s) { return s[2] <= mlim; });

var base = R.pintarCumulo(new Float32Array(PROC * PROC), M13, {
  ra0: M13.ra, dec0: M13.dec, arcmin: ARCMIN, size: PROC,
  cielo: cielo, apertura: D, estrellas: visibles
});
var pob = base.poblacion, rImg = base.radioImagenAs, omegaRes = Math.PI * rImg * rImg;

var cos0 = Math.cos(M13.dec * Math.PI / 180);
function dx(a, b) { return (((a - b + 540) % 360) - 180) * cos0 * 3600; }
function radio(s) { return pob.radioPropio(dx(s[0], M13.ra), (s[1] - M13.dec) * 3600); }

function anillo(rAs) {
  var r = rAs / rhAs;
  for (var k = 0; k < ANILLOS.length; k++) if (r <= ANILLOS[k]) return k;
  return -1;
}
var rI = visibles.map(radio), aI = visibles.map(function (s, i) { return anillo(rI[i]); });

/* ── Verdad geométrica ──────────────────────────────────────────────────────
   Una sola pasada por Δmag: para cada estrella visible, la distancia al vecino
   comparable MÁS CERCANO. Con eso, separable(θ) es una comparación, y el barrido
   de θ sale gratis. El vecino puede ser cualquier estrella del fixture, no solo
   las visibles: una un poco más débil que mlim mezcla igual de bien. */
var RMAX = Math.max.apply(null, THETAS) * rImg;
function distanciasMinimas(dmag) {
  var d = new Float64Array(visibles.length);
  for (var i = 0; i < visibles.length; i++) {
    var a = visibles[i], mejor = Infinity;
    var xa = dx(a[0], M13.ra), ya = (a[1] - M13.dec) * 3600;
    for (var j = 0; j < gaia.length; j++) {
      var b = gaia[j];
      if (b === a) continue;
      if (!(b[2] <= a[2] + dmag)) continue;                  // no comparable: no mezcla
      var ex = dx(b[0], M13.ra) - xa;
      if (ex > RMAX || ex < -RMAX) continue;
      var ey = (b[1] - M13.dec) * 3600 - ya;
      var d2 = ex * ex + ey * ey;
      if (d2 < mejor) mejor = d2;
    }
    d[i] = Math.sqrt(mejor);
  }
  return d;
}

/* ── Verdad de Poisson ──────────────────────────────────────────────────────
   n(>=m, r) invirtiendo `mCrowd` por bisección: la ley de producción, leída al
   revés, sin reimplementarla (ADR 0008). */
function densidadPorOmega(rAs, m) {           // n(>=m, r)·Ω_res, adimensional
  var lo = 1e-4, hi = 1e6;
  if (pob.mCrowd(rAs, omegaRes, hi) > m) return 1 / hi;
  if (pob.mCrowd(rAs, omegaRes, lo) < m) return 1 / lo;
  for (var it = 0; it < 60; it++) {           // mCrowd DECRECE en k
    var mid = Math.sqrt(lo * hi);
    if (pob.mCrowd(rAs, omegaRes, mid) > m) lo = mid; else hi = mid;
  }
  return 1 / Math.sqrt(lo * hi);
}

/* Predicción del modelo con la CFG puesta: se toca la config y se llama a la ley
   de producción, mismo camino que usaría el render. */
function modelo(theta, dmag) {
  var gT = C.config.thetaSepRadios, gD = C.config.dmagCrowd;
  C.config.thetaSepRadios = theta; C.config.dmagCrowd = dmag;
  try {
    var n = ANILLOS.map(function () { return 0; });
    for (var i = 0; i < visibles.length; i++) {
      if (aI[i] < 0) continue;
      n[aI[i]] += pob.aCrowd(visibles[i][2], rI[i], rImg);
    }
    return n;
  } finally { C.config.thetaSepRadios = gT; C.config.dmagCrowd = gD; }
}

var nGaia = ANILLOS.map(function () { return 0; });
for (var i = 0; i < visibles.length; i++) if (aI[i] >= 0) nGaia[aI[i]]++;

console.log('M13 · D=' + D + 'mm  M=' + MAG + 'x  SQM=' + SQM.toFixed(1) +
            '  mlim=' + mlim.toFixed(2) + '  r_img=' + rImg.toFixed(2) +
            '"  Ω_res=' + omegaRes.toFixed(2) + ' as²');
console.log('Gaia con G<=mlim: ' + visibles.length + ' (fixture ' + gaia.length + ')');
console.log('Referencia: el render viejo con k=' + 30 +
            ' entrega ' + base.estrellas.filter(function (s) {
              return (s[4] != null ? s[4] : s[2]) <= mlim && anillo(radio(s)) >= 0;
            }).length + ' estrellas dentro de 8 r_h\n');

console.log(' Gaia por anillo:' + nGaia.map(function (n) { return String(n).padStart(9); }).join('') +
            String(nGaia.reduce(function (s, x) { return s + x; }, 0)).padStart(10) + '\n');

/* Solo los anillos con déficit medible discriminan. Con menos de este número de
   estrellas perdidas, el cociente es ruido de conteo y no dice nada. */
var DEFICIT_MIN = 10;

var resumen = [], maxIdentidad = 0;
DMAGS.forEach(function (dmag) {
  var dmin = distanciasMinimas(dmag);
  console.log('── Δmag = ' + dmag.toFixed(2) + ' ' + '─'.repeat(56));
  console.log(' θ/r_img  θ("]      fuente' +
              ANILLOS.map(function (a) { return ('<=' + a).padStart(9); }).join('') + '     total');
  THETAS.forEach(function (theta) {
    var th = theta * rImg;
    var geo = ANILLOS.map(function () { return 0; });
    var poi = ANILLOS.map(function () { return 0; });
    for (var i = 0; i < visibles.length; i++) {
      if (aI[i] < 0) continue;
      if (dmin[i] > th) geo[aI[i]]++;
      poi[aI[i]] += Math.exp(-densidadPorOmega(rI[i], visibles[i][2] + dmag) *
                             Math.PI * th * th / omegaRes);
    }
    var mod = modelo(theta, dmag);
    var dMod = mod.map(function (v, q) { return nGaia[q] - v; });
    var dGeo = geo.map(function (v, q) { return nGaia[q] - v; });

    function fila(etiqueta, v) {
      var t = v.reduce(function (s, x) { return s + x; }, 0);
      return etiqueta.padStart(12) + v.map(function (x) { return x.toFixed(0).padStart(9); }).join('') +
             t.toFixed(0).padStart(10);
    }
    console.log(' ' + theta.toFixed(2).padStart(5) + ' ' + th.toFixed(2).padStart(6) +
                fila('modelo', mod).slice(6));
    console.log(' '.repeat(13) + fila('geométrica', geo));
    console.log(' '.repeat(13) + fila('déf. modelo', dMod));
    console.log(' '.repeat(13) + fila('déf. geom.', dGeo));
    console.log(' '.repeat(13) + 'razón déf.' +
                dMod.map(function (v, q) {
                  return (dGeo[q] >= DEFICIT_MIN ? (v / dGeo[q]).toFixed(2) : '·').padStart(9);
                }).join(''));

    /* La Poisson tiene que salir idéntica al modelo: son la misma fórmula. Se
       mide la discrepancia en vez de afirmarla. */
    for (var q = 0; q < ANILLOS.length; q++) {
      maxIdentidad = Math.max(maxIdentidad, Math.abs(poi[q] - mod[q]));
    }

    /* Puntuación: la peor desviación de la razón de déficits sobre los anillos
       que discriminan, con el núcleo aparte por incompletitud de Gaia. */
    var peor = 0, peorAnillo = null, nUsados = 0;
    for (q = 1; q < ANILLOS.length; q++) {
      if (dGeo[q] < DEFICIT_MIN) continue;
      nUsados++;
      var desv = Math.abs(Math.log(dMod[q] / dGeo[q]));
      if (desv > peor) { peor = desv; peorAnillo = ANILLOS[q]; }
    }
    resumen.push({ dmag: dmag, theta: theta, peor: peor, peorAnillo: peorAnillo,
                   nUsados: nUsados, nucleo: dGeo[0] >= DEFICIT_MIN ? dMod[0] / dGeo[0] : NaN,
                   total: mod.reduce(function (s, x) { return s + x; }, 0) });
    console.log('');
  });
});

console.log('── Resumen: peor razón de déficit fuera del núcleo (1,00 = clavado) ──');
console.log(' Δmag θ/r_img   peor razón   en r/r_h   anillos usados   núcleo   total modelo');
resumen.sort(function (a, b) { return a.peor - b.peor; });
resumen.forEach(function (r) {
  console.log(' ' + r.dmag.toFixed(2).padStart(4) + r.theta.toFixed(2).padStart(8) +
              Math.exp(r.peor).toFixed(2).padStart(13) +
              String(r.peorAnillo == null ? '—' : r.peorAnillo).padStart(11) +
              String(r.nUsados).padStart(17) +
              (isNaN(r.nucleo) ? '—' : r.nucleo.toFixed(2)).padStart(9) +
              r.total.toFixed(0).padStart(15));
});
console.log('\nidentidad modelo≡Poisson: peor discrepancia ' + maxIdentidad.toExponential(1) +
            ' estrellas por anillo');
if (maxIdentidad > 1e-3) throw new Error('modelo y Poisson deberían ser la misma ley');

/* Auto-comprobación: la ley tiene que ser monótona decreciente en θ_sep y en
   Δmag —más beam o más vecinos comparables, menos estrellas solas—. Si esto
   falla, el barrido de arriba no significa nada. */
var previo = Infinity;
THETAS.forEach(function (theta) {
  var t = modelo(theta, 0.75).reduce(function (s, x) { return s + x; }, 0);
  if (!(t <= previo)) throw new Error('aCrowd no decrece en θ_sep: ' + theta + ' da ' + t);
  previo = t;
});
previo = Infinity;
DMAGS.forEach(function (dmag) {
  var t = modelo(1.0, dmag).reduce(function (s, x) { return s + x; }, 0);
  if (!(t <= previo)) throw new Error('aCrowd no decrece en Δmag: ' + dmag + ' da ' + t);
  previo = t;
});
console.log('\nok  la ley decrece en θ_sep y en Δmag');
