#!/usr/bin/env node
/* ¿A qué escala espacial se juzga el grano? Barrido de la escala de integración
   como VARIABLE DE MEDIDA. Producción no se toca.

   Corrige un error de la medida anterior (velo_granularidad.md, punto 5): allí
   la amplitud se tomó en el beam y el umbral en θ_R/M. Son dos escalas
   distintas y la razón entre ellas no significa nada. Aquí ambas se evalúan
   SIEMPRE a la misma θ.

     A(θ)      amplitud RMS de δI tras promediar sobre un parche de lado θ,
               MEDIDA sobre el campo, no predicha.
     C(θ)      A(θ) / fondo local (cielo + velo).
     Cmin(θ)   umbral de la ley H2c a esa escala: ctxFotometrico(cielo, θ/60).
     razón     C(θ)/Cmin(θ). > 1 = el grano se vería.

   θ recorre múltiplos de la imagen estelar (1,22") y termina en θ* = θ_R/M, que
   es la que usa producción. Si la razón tiene un máximo en una escala
   INTERMEDIA, ahí está la variable física que falta; si el máximo está en θ*,
   no hay escala que rescatar y el problema es otro.

   Píxel a 0,25", muy por debajo de la imagen estelar, para que el muestreo no
   aplane nada antes de promediar. Promediado por tabla de sumas acumuladas:
   una caja de cualquier tamaño cuesta lo mismo.

   node scripts/harness_escala_grano.js */
'use strict';
var path = require('path');
var W = path.join(__dirname, '..') + path.sep;
global.window = {}; global.document = undefined;
require(W + 'resources/js/bitacora-gaia-render.js');
require(W + 'resources/js/lf-globulares-datos.js');
require(W + 'simulador_ocular/resources/js/globulares-datos.js');
require(W + 'resources/js/bitacora-cumulos.js');
var R = window.BitacoraGaiaRender;

var e = window.BITACORA_GLOBULARES.filter(function (f) { return f[0] === 'NGC 6205'; })[0];
var M13 = { id: e[0], ra: e[2], dec: e[3], rc: e[4], rh: e[5], c: e[6], muV0: e[7],
            Vt: e[8], dkpc: e[9], ebv: e[10], feh: e[11], elip: e[12], pa: null };
var D = 200, SQM = 21.0, SIZE = 1440, ARCMIN = 6;   // 6' / 1440 px = 0,25 "/px
var AUMENTOS = [61, 120, 173, 250];
var rhAs = M13.rh * 60;
/* Radio de la región medida, en r_h. Es CONTROL, no parámetro: si el máximo de
   la razón se mueve con él, el máximo es de borde y no físico. */
var FRAC_RH = Number(process.argv[2]) || 0.25;
var R_MEDIDA = FRAC_RH * rhAs;
var MULTIPLOS = [0.5, 1, 2, 4, 8, 16, 32, 64];

function interp(t, v, rAs) {
  if (!(rAs >= 0) || rAs >= t.r[t.r.length - 1]) return 0;
  var u = rAs / t.paso, i = Math.floor(u), f = u - i;
  return v[i] * (1 - f) + v[i + 1] * f;
}

function medir(MAG, fino) {
  var cielo = { pupilaSalida: D / MAG, pupilaOjo: 7, sqm: SQM, transmision: 0.9,
                aumentos: MAG, perceptual: true };
  var difuso = new Float32Array(SIZE * SIZE), crudo = new Float32Array(SIZE * SIZE);
  var res = R.pintarCumulo(difuso, M13, {
    ra0: M13.ra, dec0: M13.dec, arcmin: ARCMIN, size: SIZE,
    cielo: cielo, apertura: D, estrellas: [], realization: 0, campoCrudo: crudo
  });
  var pob = res.poblacion, t = res.tabla, asPorPx = (ARCMIN * 60) / SIZE;
  var cx = SIZE / 2, cy = SIZE / 2, Fcielo = res.cHalo.Fcielo;

  /* δ = crudo − medio(r). Se quita el perfil ANTES de promediar: si no, una caja
     grande mediría la pendiente del cúmulo en vez del grano. */
  var d = new Float64Array(SIZE * SIZE);
  var sumaMedio = 0, nNuc = 0;
  for (var y = 0; y < SIZE; y++) {
    for (var x = 0; x < SIZE; x++) {
      var i = y * SIZE + x;
      var rAs = pob.radioPropio(-(x - cx) * asPorPx, -(y - cy) * asPorPx);
      var Im = interp(t, t.I, rAs);
      d[i] = (Im > 0) ? crudo[i] - Im : 0;
      if (rAs < R_MEDIDA && Im > 0) { sumaMedio += Im; nNuc++; }
    }
  }
  var Imed = sumaMedio / nNuc, fondo = Fcielo + Imed;

  // Tabla de sumas acumuladas: media de cualquier caja en O(1).
  var S = new Float64Array((SIZE + 1) * (SIZE + 1));
  for (var y2 = 0; y2 < SIZE; y2++) {
    var acu = 0;
    for (var x2 = 0; x2 < SIZE; x2++) {
      acu += d[y2 * SIZE + x2];
      S[(y2 + 1) * (SIZE + 1) + (x2 + 1)] = S[y2 * (SIZE + 1) + (x2 + 1)] + acu;
    }
  }
  function cajaMedia(x0, y0, lado) {
    var x1 = x0 + lado, y1 = y0 + lado;
    var s = S[y1 * (SIZE + 1) + x1] - S[y0 * (SIZE + 1) + x1]
          - S[y1 * (SIZE + 1) + x0] + S[y0 * (SIZE + 1) + x0];
    return s / (lado * lado);
  }

  /* Amplitud RMS a la escala θ: se promedia δ sobre cajas de lado θ centradas en
     píxeles del núcleo. Las cajas SE SOLAPAN —es un filtro, no una teselación—
     porque lo que se pregunta es qué amplitud ve el ojo mire donde mire. */
  function amplitud(thetaAs) {
    var lado = Math.max(1, Math.round(thetaAs / asPorPx));
    var s = 0, n = 0, r2 = R_MEDIDA / asPorPx;
    for (var y = 0; y < SIZE; y++) {
      var dy = y - cy;
      if (Math.abs(dy) > r2) continue;
      for (var x = 0; x < SIZE; x++) {
        var dx = x - cx;
        if (dx * dx + dy * dy > r2 * r2) continue;
        var x0 = Math.round(x - lado / 2), y0 = Math.round(y - lado / 2);
        if (x0 < 0 || y0 < 0 || x0 + lado > SIZE || y0 + lado > SIZE) continue;
        var v = cajaMedia(x0, y0, lado);
        s += v * v; n++;
      }
    }
    return n ? { rms: Math.sqrt(s / n), n: n, lado: lado } : null;
  }

  var thBeamAs = 2 * Math.sqrt(res.omegaBeam / Math.PI);
  var thEstrellaAs = res.radioImagenAs;
  var thR = R.thetaRiccoArcmin(res.cHalo.SBe);          // minutos de arco APARENTES
  var thEstrella = 60 * thR / MAG;                      // θ* de producción, en "
  var sigBeam = interp(t, t.sigma, 0);                  // amplitud por beam, modelo

  var escalas = MULTIPLOS.map(function (k) {
    return { etiq: k + '× PSF', th: k * thEstrellaAs };
  });
  escalas.push({ etiq: 'θ* = θ_R/M', th: thEstrella, prod: true });
  escalas.sort(function (a, b) { return a.th - b.th; });

  var filas = escalas.map(function (es) {
    var A = amplitud(es.th);
    if (!A) return null;
    var Cmin = R.ctxFotometrico(cielo, es.th / 60).Cmin;
    var C = A.rms / fondo;
    // Predicción de producción: amplitud del beam dividida por θ/θ_beam (√n de
    // celdas independientes). Se compara con la MEDIDA.
    var pred = sigBeam * Math.min(1, thBeamAs / es.th) / fondo;
    return { etiq: es.etiq, th: es.th, prod: !!es.prod, C: C, Cmin: Cmin,
             raz: C / Cmin, pred: pred };
  }).filter(Boolean);

  /* Máximo de la razón sobre una rejilla logarítmica densa, y la razón en la θ
     que usa producción, para poder decir cuánto se ganaría como mucho. */
  var opt = null, razProd = 0;
  if (fino) {
    for (var g = 0; g <= 60; g++) {
      var th = 2 * Math.pow(100 / 2, g / 60);          // 2" .. 100", log
      var Ag = amplitud(th);
      if (!Ag) continue;
      var rz = (Ag.rms / fondo) / R.ctxFotometrico(cielo, th / 60).Cmin;
      if (!opt || rz > opt.raz) opt = { th: th, raz: rz };
    }
    var Ap = amplitud(thEstrella);
    razProd = (Ap.rms / fondo) / R.ctxFotometrico(cielo, thEstrella / 60).Cmin;
  }
  return { opt: opt, razProd: razProd, res: res, filas: filas, fondo: fondo, Imed: Imed, thBeamAs: thBeamAs,
           thEstrella: thEstrella, thR: thR, asPorPx: asPorPx };
}

console.log('M13 · D = 200 mm · SQM 21 · realización 0 · píxel 0,25" · región r < ' +
  R_MEDIDA.toFixed(1) + '" (' + FRAC_RH + ' r_h)');
console.log('Amplitud y umbral SIEMPRE a la misma escala θ. razón > 1 = el grano se vería.\n');

AUMENTOS.forEach(function (MAG) {
  var q = medir(MAG);
  console.log('══ ' + MAG + 'x · imagen estelar ' + q.res.radioImagenAs.toFixed(2) +
    '" · θ_beam ' + q.thBeamAs.toFixed(2) + '" · θ_R ' + q.thR.toFixed(1) +
    "' aparentes · θ* = θ_R/M = " + q.thEstrella.toFixed(1) + '"');
  console.log('     escala        θ (")   C(θ) medido   C(θ) predicho   Cmin(θ)     razón');
  var mejor = null;
  q.filas.forEach(function (f) {
    if (!mejor || f.raz > mejor.raz) mejor = f;
    console.log('   ' + (f.etiq + (f.prod ? '  [producción]' : '')).padEnd(26) +
      f.th.toFixed(2).padStart(7) +
      (100 * f.C).toExponential(2).padStart(14) +
      (100 * f.pred).toExponential(2).padStart(16) +
      (100 * f.Cmin).toExponential(2).padStart(12) +
      f.raz.toExponential(2).padStart(11));
  });
  console.log('   máximo de la razón en ' + mejor.etiq + ' (θ = ' + mejor.th.toFixed(2) +
    '"), razón = ' + mejor.raz.toFixed(4) + '  →  le faltan ×' + (1 / mejor.raz).toFixed(1) + '\n');
});

/* Barrido FINO para localizar el máximo de verdad: la rejilla en potencias de 2
   solo dice entre qué dos puntos cae. La pregunta que decide es si el óptimo se
   mueve con el aumento (sería del OJO, θ_R/M) o se queda quieto (sería de la
   ESCENA, y entonces la variable física que falta no es la del ojo). */
console.log('── Barrido fino: ¿dónde está el máximo y se mueve con el aumento? ──');
console.log('   aum   θ óptimo   razón máx   θ* = θ_R/M   razón en θ*   ganancia sobre producción');
AUMENTOS.forEach(function (MAG) {
  var q = medir(MAG, true);
  console.log('  ' + String(MAG).padStart(4) + (q.opt.th.toFixed(1) + '"').padStart(11) +
    q.opt.raz.toFixed(4).padStart(12) + (q.thEstrella.toFixed(1) + '"').padStart(13) +
    q.razProd.toFixed(4).padStart(14) + ('×' + (q.opt.raz / q.razProd).toFixed(2)).padStart(20));
});

console.log('\nC predicho = σ_beam · min(1, θ_beam/θ), que es la atenuación √n de producción.');
console.log('Compararlo con el medido dice si el campo se promedia como celdas independientes.');
