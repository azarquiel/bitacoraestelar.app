#!/usr/bin/env node
/* ¿El velo es suave, o lleva grano dentro? Separación del campo que hoy va al
   velo en sus dos componentes, sin tocar producción.

     A. velo medio       I_medio(r), la tabla radial que ya calcula el render
     B. estructura       dI(x,y) = I(x,y) - I_medio(r)

   M13 · D = 200 mm · SQM 21 · 61x / 120x / 173x / 250x.

   DOS CAMPOS, y no son el mismo:

     crudo    lo que sale de campoLognormal ANTES de la ley visual. Es la
              física: la fluctuación de Poisson de las estrellas no resueltas.
              El render ya lo expone en `o.campoCrudo` como salida de medida.
     pintado  lo que acaba en `difuso`, con el desvanecido s_grano aplicado.
              Es lo que el observador vería.

   La diferencia entre los dos es la respuesta a la pregunta: si el crudo tiene
   grano y el pintado no, el grano existe y la ley visual lo apaga.

   EL PÍXEL MANDA. `omegaBeam = max(omegaRes, areaPx)`: con un lienzo grosero el
   propio render aplana el grano, y medirlo así sería medir el muestreo. Aquí el
   campo se toma a ~0,6"/px, por debajo de la imagen estelar (1,22"), para que la
   granulación llegue entera a la medida. Ver la nota de las dos Omega en
   pintarCumulo.

   node scripts/harness_velo_granularidad.js */
'use strict';
var path = require('path');
var W = path.join(__dirname, '..') + path.sep;
global.window = {}; global.document = undefined;
require(W + 'resources/js/bitacora-gaia-render.js');
require(W + 'resources/js/lf-globulares-datos.js');
require(W + 'simulador_ocular/resources/js/globulares-datos.js');
require(W + 'resources/js/bitacora-cumulos.js');
var R = window.BitacoraGaiaRender, C = window.BitacoraCumulos;

var e = window.BITACORA_GLOBULARES.filter(function (f) { return f[0] === 'NGC 6205'; })[0];
var M13 = { id: e[0], ra: e[2], dec: e[3], rc: e[4], rh: e[5], c: e[6], muV0: e[7],
            Vt: e[8], dkpc: e[9], ebv: e[10], feh: e[11], elip: e[12], pa: null };
var D = 200, SQM = 21.0, SIZE = 720, ARCMIN = 8;   // 8' / 720 px = 0,667 "/px
var AUMENTOS = [61, 120, 173, 250];
var rhAs = M13.rh * 60;

/* Interpolación lineal de una columna de la tabla radial. Misma cuenta que
   `interpTabla` del render, que no está exportada; son DATOS ya calculados, no
   una ley reimplementada. */
function interp(t, v, rAs) {
  if (!(rAs >= 0) || rAs >= t.r[t.r.length - 1]) return 0;
  var u = rAs / t.paso, i = Math.floor(u), f = u - i;
  return v[i] * (1 - f) + v[i + 1] * f;
}

function percentiles(a, ps) {
  var b = Float64Array.from(a); b.sort();
  return ps.map(function (p) {
    var x = (b.length - 1) * p / 100, i = Math.floor(x), f = x - i;
    return i + 1 < b.length ? b[i] * (1 - f) + b[i + 1] * f : b[i];
  });
}

/* Escala espacial: autocorrelación de dI por filas dentro de la caja, promediada
   sobre las filas, y el desfase donde baja de 1/e. Por filas y no en 2D porque
   el campo es isótropo por construcción y una dirección basta. */
function escalaAs(campo, medio, x0, x1, y0, y1, asPorPx) {
  var maxLag = Math.min(40, Math.floor((x1 - x0) / 3));
  var acu = new Float64Array(maxLag + 1), n = 0;
  for (var y = y0; y <= y1; y++) {
    var fila = [], suma = 0;
    for (var x = x0; x <= x1; x++) {
      var d = campo[y * SIZE + x] - medio[y * SIZE + x];
      fila.push(d); suma += d;
    }
    var mu = suma / fila.length, v0 = 0;
    for (var i = 0; i < fila.length; i++) { fila[i] -= mu; v0 += fila[i] * fila[i]; }
    if (!(v0 > 0)) continue;
    for (var L = 0; L <= maxLag; L++) {
      var s = 0;
      for (var j = 0; j + L < fila.length; j++) s += fila[j] * fila[j + L];
      acu[L] += s / v0;
    }
    n++;
  }
  if (!n) return NaN;
  var UNO_E = 1 / Math.E;
  for (var L2 = 1; L2 <= maxLag; L2++) {
    var a = acu[L2 - 1] / acu[0], b = acu[L2] / acu[0];
    if (b < UNO_E && a >= UNO_E) return (L2 - 1 + (a - UNO_E) / (a - b)) * asPorPx;
  }
  return NaN;
}

var ANILLOS = [[0, 0.25], [0.25, 0.5], [0.5, 1.0], [1.0, 2.0]];

function medir(MAG) {
  var difuso = new Float32Array(SIZE * SIZE);
  var crudo = new Float32Array(SIZE * SIZE);
  var res = R.pintarCumulo(difuso, M13, {
    ra0: M13.ra, dec0: M13.dec, arcmin: ARCMIN, size: SIZE,
    cielo: { pupilaSalida: D / MAG, pupilaOjo: 7, sqm: SQM, transmision: 0.9,
             aumentos: MAG, perceptual: true },
    apertura: D, estrellas: [], realization: 0, campoCrudo: crudo
  });
  var pob = res.poblacion, t = res.tabla, asPorPx = (ARCMIN * 60) / SIZE;
  var cx = SIZE / 2, cy = SIZE / 2, Fcielo = res.cHalo.Fcielo;

  // Mapa del medio radial y del propio radio, una vez.
  var medio = new Float64Array(SIZE * SIZE), rad = new Float64Array(SIZE * SIZE);
  for (var y = 0; y < SIZE; y++) {
    for (var x = 0; x < SIZE; x++) {
      var norte = -(y - cy) * asPorPx, este = -(x - cx) * asPorPx;
      var rAs = pob.radioPropio(este, norte);
      rad[y * SIZE + x] = rAs;
      medio[y * SIZE + x] = interp(t, t.I, rAs);
    }
  }

  var filas = ANILLOS.map(function (an) {
    var r0 = an[0] * rhAs, r1 = an[1] * rhAs;
    var dC = [], dP = [], sumaMedio = 0, n = 0, sumaSig = 0;
    for (var i = 0; i < SIZE * SIZE; i++) {
      var rr = rad[i];
      if (!(rr >= r0 && rr < r1) || !(medio[i] > 0)) continue;
      dC.push(crudo[i] - medio[i]);
      dP.push(difuso[i] - medio[i] * interp(t, t.sHalo, rr));
      sumaMedio += medio[i]; sumaSig += interp(t, t.sigma, rr); n++;
    }
    if (!n) return null;
    var Imed = sumaMedio / n, sigTeo = sumaSig / n;
    /* Estrellas EFECTIVAS por beam: media²/varianza del flujo del beam. Es el
       número que decide si el velo puede ser suave. Con N_ef >> 1 el beam
       promedia mucha estrella y sale liso; con N_ef ~ 1 el "velo" son estrellas
       sueltas encendiéndose y apagándose de beam en beam (régimen SBF). */
    var nEf = (sigTeo > 0) ? (Imed / sigTeo) * (Imed / sigTeo) : Infinity;
    var sobre2 = 0;
    for (var k2 = 0; k2 < dC.length; k2++) if (dC[k2] > Imed) sobre2++;
    function rms(a) { var s = 0; for (var k = 0; k < a.length; k++) s += a[k] * a[k]; return Math.sqrt(s / a.length); }
    var fondo = Fcielo + Imed;
    var pC = percentiles(dC, [1, 5, 50, 95, 99]);
    return {
      an: an, n: n, Imed: Imed, muMedio: -2.5 * Math.log10(Imed), fondo: fondo,
      rmsC: rms(dC), rmsP: rms(dP), sigTeo: sigTeo, nEf: nEf, sobre2: sobre2 / dC.length,
      cC: rms(dC) / fondo, cP: rms(dP) / fondo,
      pct: pC.map(function (v) { return v / fondo; })
    };
  }).filter(Boolean);

  // Escala espacial en el núcleo (caja de 0,25 r_h alrededor del centro).
  var lado = Math.floor(0.25 * rhAs / asPorPx);
  var esc = escalaAs(crudo, medio, cx - lado, cx + lado, cy - lado, cy + lado, asPorPx);
  return { res: res, filas: filas, asPorPx: asPorPx, esc: esc, Cmin: res.cGrano.Cmin,
           aten: res.atenGrano, sGranoMax: Math.max.apply(null, Array.from(t.sGrano)) };
}

console.log('M13 · D = 200 mm · SQM 21 · realización 0 · campo ' + ARCMIN + "' / " + SIZE + ' px');
console.log('r_h = ' + rhAs.toFixed(1) + '"  ·  0,25 r_h = ' + (0.25 * rhAs).toFixed(1) + '"\n');

AUMENTOS.forEach(function (MAG) {
  var q = medir(MAG), r = q.res;
  console.log('══ ' + MAG + 'x · imagen estelar ' + r.radioImagenAs.toFixed(2) +
    '" · píxel ' + q.asPorPx.toFixed(3) + '" · Ω_beam ' + r.omegaBeam.toFixed(2) +
    ' arcsec² (óptica ' + r.omegaRes.toFixed(2) + ')');
  console.log('   anillo r/r_h   μ_medio   N_ef/beam   px>2x medio   RMS dI/fondo crudo   RMS dI/fondo pintado   σ_tabla/fondo   p1..p99 (crudo/fondo)');
  q.filas.forEach(function (f) {
    console.log('   ' + (f.an[0].toFixed(2) + '-' + f.an[1].toFixed(2)).padStart(12) +
      f.muMedio.toFixed(2).padStart(10) + f.nEf.toFixed(2).padStart(12) +
      (100 * f.sobre2).toFixed(1).padStart(13) + ' %' +
      (100 * f.cC).toFixed(2).padStart(21) + ' %' +
      (100 * f.cP).toExponential(1).padStart(22) +
      (100 * f.sigTeo / f.fondo).toFixed(2).padStart(16) + ' %' +
      '   ' + f.pct.map(function (v) { return (100 * v).toFixed(1); }).join(' / '));
  });
  console.log('   escala del grano en r < 0,25 r_h: ' + q.esc.toFixed(2) +
    '" (1/e)  ·  paso de la malla = imagen estelar = ' + r.radioImagenAs.toFixed(2) + '"');
  console.log('   umbral de contraste del grano C_min = ' + (100 * q.Cmin).toFixed(2) +
    ' %  ·  atenuación por parche = ' + q.aten.toFixed(3) +
    '  ·  s_grano máx = ' + q.sGranoMax.toExponential(2) + '\n');
});

console.log('σ_tabla es la amplitud POR BEAM que el modelo predice (√(Σ·S2/Ω)); RMS crudo');
console.log('es la que de verdad tiene el campo pintado píxel a píxel. Que coincidan valida');
console.log('la realización; el contraste contra C_min dice si se ve.');
