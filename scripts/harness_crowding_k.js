#!/usr/bin/env node
/* Hipótesis 4 del diagnóstico de M13: `crowdingCriterion` k = 30 en el núcleo.
   ¿Es el número que hay que usar, o es el criterio de otro problema?

   El modelo declara resuelta una estrella si en su beam hay menos de 1/k
   estrellas MÁS BRILLANTES que ella (`mCrowd`, bitacora-cumulos.js). Con k = 30
   eso es «menos de 0,033 estrellas por beam»: el límite de confusión de un
   SURVEY —una fuente cada 30 beams, el listón con el que un catálogo garantiza
   fotometría fiable—, no la pregunta de si el ojo separa dos puntos.

   La verdad independiente que se usa aquí NO tiene k: son las POSICIONES reales
   de Gaia. Una estrella no es separable si otra de brillo comparable o mayor le
   cae dentro del elemento de resolución. Se cuenta por anillo radial:

     · Gaia          estrellas del fixture con G <= mlim del equipo
     · separables    las que no tienen vecino comparable dentro de θ_sep
     · render k=…    las que pintarCumulo entrega y pasan el corte mlim

   y se barre k para ver cuál reproduce la geometría. Dos avisos que el número
   lleva puestos, no notas al pie:

     · Gaia mide con FWHM 0,6": los pares más cerrados que eso ya le faltan al
       fixture, así que «separables» es una COTA SUPERIOR de lo separable, y la
       aglomeración real es algo peor que la medida.
     · Gaia es incompleta en el núcleo por la misma razón, así que «Gaia» es una
       cota inferior del número de estrellas que hay. Las dos cotas empujan en
       sentidos contrarios y por eso se imprimen las dos.

   El contraste teórico, sin catálogo: con densidad n(>=m, r) la probabilidad de
   que un beam de área Ω tenga al menos un vecino más brillante es 1 − e^(−nΩ).
   El criterio de k pone el listón en nΩ = 1/k, o sea una probabilidad de mezcla
   de 1 − e^(−1/k): con k = 30 es el 3,3 %. Todo lo que pasa de ahí se declara
   NO resuelto de golpe, aunque el 90 % de esas estrellas siga estando sola en
   su beam.

   node scripts/harness_crowding_k.js [--sqm N] [--D mm] [--mag N] [--sep f] */
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
var SEP = arg('sep', 2.0);        // θ_sep en radios de imagen estelar (Airy ⊕ seeing)
var DMAG = 0.75;                  // «comparable»: hasta 0,75 mag más débil (factor 2 en flujo)
var ARCMIN = 0.47 * 60;

var e = global.window.BITACORA_GLOBULARES.filter(function (f) { return f[0] === 'NGC 6205'; })[0];
var M13 = { id: e[0], ra: e[2], dec: e[3], rc: e[4], rh: e[5], c: e[6], muV0: e[7],
            Vt: e[8], dkpc: e[9], ebv: e[10], feh: e[11], elip: e[12], pa: null };
var rhAs = M13.rh * 60;

var gaia = fs.readFileSync(path.join(__dirname, '../simulador_ocular/docs/validacion/m13_gaia_dr3.csv'), 'utf8')
  .trim().split('\n').slice(1).map(function (l) {
    var c = l.split(',');
    return [+c[0], +c[1], +c[2], c[3] === '' ? null : +c[3]];
  });

var mlim = R.magLimite({ apertura: D, aumentos: MAG, transmision: 0.9, sqm: SQM, pupilaOjo: 7 });
var cielo = { pupilaSalida: D / MAG, pupilaOjo: 7, sqm: SQM, transmision: 0.9,
              aumentos: MAG, perceptual: true };
var visibles = gaia.filter(function (s) { return s[2] <= mlim; });

/* Una corrida del render con el k puesto. `mCrowd` lee CFG en cada llamada, así
   que basta cambiar la config: el barrido entra por el MISMO camino que el
   modelo real (ADR 0008, nada se reimplementa aquí). */
function corrida(k) {
  var guardado = C.config.gaiaCrowdingK;
  C.config.gaiaCrowdingK = k;
  try {
    var difuso = new Float32Array(PROC * PROC);
    return R.pintarCumulo(difuso, M13, {
      ra0: M13.ra, dec0: M13.dec, arcmin: ARCMIN, size: PROC,
      cielo: cielo, apertura: D, estrellas: visibles
    });
  } finally { C.config.gaiaCrowdingK = guardado; }
}

/* El k = 30 del modelo VIEJO. Ya no está en CFG —el ADR 0012 se llevó el listón
   de crowding por delante— y este arnés mide justamente aquel modelo, así que la
   constante vive aquí, donde no puede confundirse con la ley de producción. */
var K_VIEJO = 30;
var base = corrida(K_VIEJO);
var pob = base.poblacion, rImg = base.radioImagenAs, omegaRes = Math.PI * rImg * rImg;
var thSep = SEP * rImg;

var cos0 = Math.cos(M13.dec * Math.PI / 180);
function radio(s) {
  return pob.radioPropio((((s[0] - M13.ra + 540) % 360) - 180) * cos0 * 3600, (s[1] - M13.dec) * 3600);
}

/* ── Verdad geométrica: ¿tiene vecino comparable dentro de θ_sep? ───────────
   Fuerza bruta sobre el fixture entero (11972 × 1808 pares, décimas de segundo).
   El vecino puede ser cualquier estrella del fixture, no solo las visibles: una
   estrella un poco más débil que mlim mezcla igual de bien. */
var sep = new Uint8Array(visibles.length);
for (var i = 0; i < visibles.length; i++) {
  var a = visibles[i], solo = 1;
  var xa = (((a[0] - M13.ra + 540) % 360) - 180) * cos0 * 3600, ya = (a[1] - M13.dec) * 3600;
  for (var j = 0; j < gaia.length; j++) {
    var b = gaia[j];
    if (b === a) continue;
    if (!(b[2] <= a[2] + DMAG)) continue;                  // no comparable: no mezcla
    var dx = (((b[0] - M13.ra + 540) % 360) - 180) * cos0 * 3600 - xa;
    if (dx > thSep || dx < -thSep) continue;
    var dy = (b[1] - M13.dec) * 3600 - ya;
    if (dx * dx + dy * dy < thSep * thSep) { solo = 0; break; }
  }
  sep[i] = solo;
}

/* ── La misma pregunta, pero contando también lo que Gaia no ve ─────────────
   El fixture es incompleto justo donde importa, así que la geometría de arriba
   se queda corta: las estrellas que faltan también mezclan. La densidad que sí
   conoce el modelo entra por `mCrowd`, que es su inversa: mCrowd(r, Ω, k) es la
   m con n(>=m,r)·Ω = 1/k. Invertirla por bisección da n para una m cualquiera
   SIN reimplementar la ley (ADR 0008): se llama a la de producción.

   Con n en la mano, la probabilidad de que una estrella esté sola en su disco de
   radio θ_sep es Poisson pura, e^(−n·π·θ_sep²), y no tiene ningún parámetro
   libre. Es la respuesta a «cuántas de estas estrellas puede el ojo separar»
   contando el cúmulo entero, no solo el trozo catalogado. */
function densidadPorOmega(rAs, m) {           // n(>=m, r)·Ω, adimensional
  var lo = 1e-4, hi = 1e6;                    // k grande = listón brillante
  if (pob.mCrowd(rAs, omegaRes, hi) > m) return 1 / hi;
  if (pob.mCrowd(rAs, omegaRes, lo) < m) return 1 / lo;
  // mCrowd DECRECE en k (objetivo = 1/(k·s·Ω)): más k, listón más brillante.
  for (var it = 0; it < 60; it++) {
    var mid = Math.sqrt(lo * hi);
    if (pob.mCrowd(rAs, omegaRes, mid) > m) lo = mid; else hi = mid;
  }
  return 1 / Math.sqrt(lo * hi);
}
var areaSep = Math.PI * thSep * thSep;
function pSolo(rAs, m) {
  return Math.exp(-densidadPorOmega(rAs, m + DMAG) * areaSep / omegaRes);
}

var ANILLOS = [0.25, 0.5, 1, 2, 4, 8];
function anillo(rAs) {
  var r = rAs / rhAs;
  for (var k = 0; k < ANILLOS.length; k++) if (r <= ANILLOS[k]) return k;
  return -1;
}
function porAnillo(lista, col) {
  var n = ANILLOS.map(function () { return 0; });
  for (var i = 0; i < lista.length; i++) {
    var g = lista[i][col] != null ? lista[i][col] : lista[i][2];
    if (!(g <= mlim)) continue;
    var k = anillo(radio(lista[i]));
    if (k >= 0) n[k]++;
  }
  return n;
}

var nGaia = ANILLOS.map(function () { return 0; });
var nSep = ANILLOS.map(function () { return 0; });
var nPoi = ANILLOS.map(function () { return 0; });
for (i = 0; i < visibles.length; i++) {
  var rI = radio(visibles[i]), k2 = anillo(rI);
  if (k2 < 0) continue;
  nGaia[k2]++;
  if (sep[i]) nSep[k2]++;
  nPoi[k2] += pSolo(rI, visibles[i][2]);
}

var KS = [1, 2, 3, 5, 10, 30, 100];
var cuentas = {}, mResK = {};
KS.forEach(function (k) {
  var c = corrida(k);
  cuentas[k] = porAnillo(c.estrellas, 4);
  mResK[k] = c.tabla.mRes[Math.round(0.1 * rhAs / c.tabla.paso)];
});

console.log('M13 · D=' + D + 'mm  M=' + MAG + 'x  SQM=' + SQM.toFixed(1) +
            '  mlim=' + mlim.toFixed(2) + '  r_img=' + rImg.toFixed(2) +
            '"  Ω=' + omegaRes.toFixed(2) + ' as²');
console.log('θ_sep = ' + SEP.toFixed(1) + '·r_img = ' + thSep.toFixed(2) +
            '", vecino comparable hasta Δm = ' + DMAG.toFixed(2));
console.log('Gaia con G<=mlim: ' + visibles.length + ' (fixture ' + gaia.length + ')\n');

var cab = ' r/r_h      Gaia  separables   Poisson';
KS.forEach(function (k) { cab += ('  k=' + k).padStart(8); });
console.log(cab);
var tot = { g: 0, s: 0, p: 0 }; KS.forEach(function (k) { tot[k] = 0; });
for (var q = 0; q < ANILLOS.length; q++) {
  var fila = ' <=' + ANILLOS[q].toFixed(2) + String(nGaia[q]).padStart(10) +
             String(nSep[q]).padStart(12) + nPoi[q].toFixed(0).padStart(10);
  tot.g += nGaia[q]; tot.s += nSep[q]; tot.p += nPoi[q];
  KS.forEach(function (k) { fila += String(cuentas[k][q]).padStart(8); tot[k] += cuentas[k][q]; });
  console.log(fila);
}
var fin = ' total  ' + String(tot.g).padStart(10) + String(tot.s).padStart(12) +
          tot.p.toFixed(0).padStart(10);
KS.forEach(function (k) { fin += String(tot[k]).padStart(8); });
console.log(fin);

/* ¿Manda k en cada anillo, o manda el cielo? m_res = min(m_crowd, m_lim,sky), y
   donde el mínimo lo pone el cielo, mover k no cambia NADA: el desajuste de ese
   radio no es de aglomeración. Se imprime el que gana y la k EQUIVALENTE, la que
   haría falta para que el render diese la cuenta de Poisson en ese anillo. */
function cuentaK(k, q) { return porAnillo(corrida(k).estrellas, 4)[q]; }
function kEquivalente(q) {
  var lo = 0.2, hi = 1e4;
  if (cuentaK(lo, q) < nPoi[q]) return null;      // ni con k mínimo se dibujan tantas
  if (cuentaK(hi, q) > nPoi[q]) return null;
  for (var it = 0; it < 18; it++) {
    var mid = Math.sqrt(lo * hi);
    if (cuentaK(mid, q) > nPoi[q]) lo = mid; else hi = mid;
  }
  return Math.sqrt(lo * hi);
}
console.log('\nQuién pone el mínimo en m_res (muestreo fino, el núcleo está DENTRO');
console.log('del primer anillo). m_res es la del render, m_crowd la de k = 30:');
console.log('     r/r_h   m_crowd(30)   m_res   manda');
[0.02, 0.05, 0.1, 0.15, 0.25, 0.5, 1, 2, 4].forEach(function (f) {
  var rAs = f * rhAs;
  if (rAs >= pob.rtAs) return;
  var iT = Math.round(rAs / base.tabla.paso);
  var mResR = base.tabla.mRes[iT];
  var mc = pob.mCrowd(rAs, omegaRes, 30);
  console.log('  ' + f.toFixed(2).padStart(8) + (isFinite(mc) ? mc.toFixed(2) : ' inf').padStart(12) +
    mResR.toFixed(2).padStart(10) + '   ' +
    ((isFinite(mc) && mc <= mResR + 1e-9) ? 'crowding' : 'cielo'));
});

console.log('\nQué k pediría cada anillo para dar la cuenta de Poisson:');
console.log('  r/r_h    k equivalente');
for (q = 0; q < ANILLOS.length; q++) {
  var kEq = kEquivalente(q);
  console.log('  <=' + ANILLOS[q].toFixed(2) + '   ' +
    (kEq == null ? '(fuera de rango)' : kEq.toFixed(1).padStart(10)));
}

/* La misma cuenta en el núcleo, que es donde se juega: fracción de las de Gaia
   que sobrevive, geometría contra cada k. */
console.log('\nDentro de 0,25 r_h (' + nGaia[0] + ' estrellas de Gaia):');
console.log('  geometría: ' + nSep[0] + ' separables (' +
  (100 * nSep[0] / nGaia[0]).toFixed(0) + ' %, cota superior: Gaia no ve los pares cerrados)');
console.log('  Poisson:   ' + nPoi[0].toFixed(0) + ' separables (' +
  (100 * nPoi[0] / nGaia[0]).toFixed(0) + ' %, con las estrellas que Gaia no lista)');
KS.forEach(function (k) {
  console.log('  k = ' + String(k).padStart(3) + ':    ' + String(cuentas[k][0]).padStart(3) +
    ' dibujadas (' + (100 * cuentas[k][0] / nGaia[0]).toFixed(0) + ' %)' +
    '   m_crowd(0,1 r_h) = ' + pob.mCrowd(0.1 * rhAs, omegaRes, k).toFixed(2) +
    '   m_res = ' + mResK[k].toFixed(2));
});

/* El acoplamiento: m_lim,sky NO es independiente de k. El render arranca el velo
   en el listón del crowding (I0 = Sigma·S1campo(m_crowd), render:1466), así que
   subir k mete más estrellas en el velo, sube el fondo local y hunde también el
   límite del cielo. Por eso «manda el cielo» y aun así k mueve el núcleo. */

/* Y el contraste con la ley de Poisson, que es lo que k está aproximando: a la
   m_crowd que cada k elige, qué fracción de estrellas tiene de verdad un vecino
   más brillante en su beam. Si el criterio fuese «la mitad se mezcla» saldría
   50 %; con k = 30 sale el 3 %, y aun así todo lo más débil se declara velo. */
console.log('\nProbabilidad de mezcla en el listón de cada k (1 − e^(−1/k)):');
KS.forEach(function (k) {
  console.log('  k = ' + String(k).padStart(3) + ':  ' +
    (100 * (1 - Math.exp(-1 / k))).toFixed(1) + ' %');
});
