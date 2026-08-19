#!/usr/bin/env node
/* ADR 0012, paso 3 (A): atenuación CONTRA Bernoulli, medido.

   `a(m,r) = P_solo` es una PROBABILIDAD de no tener vecina comparable en el
   beam. El ADR deja abierto qué hace el render con ella, con dos lecturas que
   conservan el flujo igual de bien:

     ATENUACIÓN  cada estrella se dibuja con flujo a·F  (y (1−a)·F al velo)
     BERNOULLI   sorteo por estrella: con prob. a se dibuja entera, si no va
                 entera al velo

   Criterio del ADR: «gana la que reproduzca las dos verdades del banco por
   anillo. Si empatan en cuenta, gana la atenuación por estabilidad temporal.»

   Este arnés lo ejecuta literalmente, y de paso mide las dos premisas del
   desempate en vez de darlas por buenas.

   La verdad utilizable es UNA, la geométrica: para cada estrella real de Gaia,
   ¿tiene vecina comparable dentro de θ_sep? Son distancias, no lleva ley
   dentro. La segunda verdad del banco (Poisson invirtiendo mCrowd) quedó
   degradada a comprobación de identidad en el paso 2 —es la misma fórmula que
   `aCrowd`—, así que aquí ni se invoca: usarla sería vacuo (ADR 0005).

   Esa verdad es más rica de lo que el paso 2 usaba. No da solo un CONTEO por
   anillo: da una etiqueta binaria POR ESTRELLA. Y ahí es donde los dos
   esquemas dejan de ser el mismo objeto, porque tienen la misma media por
   construcción (E[Bernoulli] = Σa = atenuación) y por tanto la cuenta NO puede
   discriminarlos: empatan por álgebra, no por suerte. Se mide igualmente, para
   que el empate sea un hecho medido.

   Lo que se mide, por anillo:

     1. Cuenta: Σa contra el sorteo (media y dispersión sobre REPS semillas)
        contra la verdad geométrica.
     2. Si la verdad cae dentro de la dispersión del sorteo.
     3. Brier por estrella contra la etiqueta geométrica. Es una regla de
        puntuación propia: mide si el esquema acierta QUÉ estrella se mezcla,
        no solo cuántas.
     4. El corte contra mlim, que es donde el ADR sospecha que está la
        diferencia real: atenuar es restar 2,5·log10(a) magnitudes, así que una
        estrella atenuada puede caer por debajo del límite del cielo y
        desaparecer del todo. El sorteo no mueve ninguna magnitud.
     5. Conservación del flujo en los dos esquemas.
     6. Estabilidad temporal: cuántas decisiones cambian al mover el ocular.

   node scripts/harness_atenuacion_bernoulli.js [--sqm N] [--D mm] [--mag N]
                                               [--reps N] */
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
var SQM = arg('sqm', 21), D = arg('D', 467), MAG = arg('mag', 173);
var REPS = arg('reps', 200), PROC = 720, ARCMIN = 0.47 * 60;
var ANILLOS = [0.25, 0.5, 1, 2, 4, 8];
var MAGS_ESTABILIDAD = [61, 120, 173, 250];

var e = global.window.BITACORA_GLOBULARES.filter(function (f) { return f[0] === 'NGC 6205'; })[0];
var M13 = { id: e[0], ra: e[2], dec: e[3], rc: e[4], rh: e[5], c: e[6], muV0: e[7],
            Vt: e[8], dkpc: e[9], ebv: e[10], feh: e[11], elip: e[12], pa: null };
var rhAs = M13.rh * 60;

var gaia = fs.readFileSync(path.join(__dirname, '../docs/halo_v7/m13_gaia_dr3.csv'), 'utf8')
  .trim().split('\n').slice(1).map(function (l) {
    var c = l.split(',');
    return [+c[0], +c[1], +c[2], c[3] === '' ? null : +c[3]];
  });

function escena(mag) {
  var mlim = R.magLimite({ apertura: D, aumentos: mag, transmision: 0.9, sqm: SQM, pupilaOjo: 7 });
  var vis = gaia.filter(function (s) { return s[2] <= mlim; });
  var res = R.pintarCumulo(new Float32Array(PROC * PROC), M13, {
    ra0: M13.ra, dec0: M13.dec, arcmin: ARCMIN, size: PROC,
    cielo: { pupilaSalida: D / mag, pupilaOjo: 7, sqm: SQM, transmision: 0.9,
             aumentos: mag, perceptual: true },
    apertura: D, estrellas: vis
  });
  return { mlim: mlim, visibles: vis, pob: res.poblacion, rImg: res.radioImagenAs, res: res };
}

var E = escena(MAG);
var pob = E.pob, rImg = E.rImg, mlim = E.mlim, visibles = E.visibles;
var thSep = C.config.thetaSepRadios * rImg, dmag = C.config.dmagCrowd;

var cos0 = Math.cos(M13.dec * Math.PI / 180);
function dx(a, b) { return (((a - b + 540) % 360) - 180) * cos0 * 3600; }
function radio(s) { return pob.radioPropio(dx(s[0], M13.ra), (s[1] - M13.dec) * 3600); }
function anillo(rAs) {
  var r = rAs / rhAs;
  for (var k = 0; k < ANILLOS.length; k++) if (r <= ANILLOS[k]) return k;
  return -1;
}

var rI = visibles.map(radio);
var aI = visibles.map(function (s, i) { return anillo(rI[i]); });
var pI = visibles.map(function (s, i) { return pob.aCrowd(s[2], rI[i], rImg); });

/* ── Verdad geométrica, etiqueta por estrella ────────────────────────────────
   y = 1 si NO tiene vecina comparable (más brillante que m+Δmag) dentro de
   θ_sep: la estrella se ve sola, que es justo lo que `a` predice. El vecino
   puede ser cualquiera del fixture, no solo de las visibles. */
function etiquetas() {
  var y = new Uint8Array(visibles.length);
  for (var i = 0; i < visibles.length; i++) {
    var a = visibles[i], sola = 1;
    var xa = dx(a[0], M13.ra), ya = (a[1] - M13.dec) * 3600;
    for (var j = 0; j < gaia.length; j++) {
      var b = gaia[j];
      if (b === a) continue;
      if (!(b[2] <= a[2] + dmag)) continue;
      var ex = dx(b[0], M13.ra) - xa;
      if (ex > thSep || ex < -thSep) continue;
      var ey = (b[1] - M13.dec) * 3600 - ya;
      if (ex * ex + ey * ey <= thSep * thSep) { sola = 0; break; }
    }
    y[i] = sola;
  }
  return y;
}
var yGeo = etiquetas();

/* ── Sorteo determinista ─────────────────────────────────────────────────────
   El ADR pide semilla del `source_id` de Gaia. El fixture no lo trae (solo
   ra, dec, G, BP−RP), así que la semilla sale de las coordenadas, que
   identifican la estrella igual de bien y son igual de estables: no hay RNG
   global y el mismo cielo da el mismo dibujo. Mezclador entero de 32 bits
   (variante de splitmix), suficiente para un uniforme por estrella. */
function u01(ra, dec, semilla) {
  var h = (semilla | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (ra * 1e7 | 0), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (dec * 1e7 | 0), 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h >>> 0) % 16777216) / 16777216;
}
var uI = visibles.map(function (s) { return u01(s[0], s[1], 0); });

function porAnillo(f) {
  var v = ANILLOS.map(function () { return 0; });
  for (var i = 0; i < visibles.length; i++) if (aI[i] >= 0) v[aI[i]] += f(i);
  return v;
}
function suma(v) { return v.reduce(function (s, x) { return s + x; }, 0); }
function fila(et, v, dec) {
  return et.padStart(22) + v.map(function (x) { return x.toFixed(dec || 0).padStart(9); }).join('') +
         suma(v).toFixed(dec || 0).padStart(10);
}
var cab = '                      ' + ANILLOS.map(function (a) { return ('<=' + a).padStart(9); }).join('') +
          '     total';

console.log('M13 · D=' + D + 'mm  M=' + MAG + 'x  SQM=' + SQM.toFixed(1) +
            '  mlim=' + mlim.toFixed(2) + '  r_img=' + rImg.toFixed(2) + '"');
console.log('θ_sep = ' + C.config.thetaSepRadios.toFixed(2) + ' r_img = ' + thSep.toFixed(2) +
            '"   Δmag = ' + dmag.toFixed(2) + '   sorteos = ' + REPS);
console.log('Gaia con G<=mlim: ' + visibles.length + ' (fixture ' + gaia.length + ')\n');

var nGaia = porAnillo(function () { return 1; });
console.log(cab);
console.log(fila('Gaia visibles', nGaia));

/* ── 1 y 2 · La cuenta ──────────────────────────────────────────────────────── */
var geo = porAnillo(function (i) { return yGeo[i]; });
var aten = porAnillo(function (i) { return pI[i]; });

var acumB = ANILLOS.map(function () { return 0; }), acumB2 = ANILLOS.map(function () { return 0; });
for (var rep = 0; rep < REPS; rep++) {
  var v = porAnillo(function (i) { return u01(visibles[i][0], visibles[i][1], rep) < pI[i] ? 1 : 0; });
  for (var q = 0; q < ANILLOS.length; q++) { acumB[q] += v[q]; acumB2[q] += v[q] * v[q]; }
}
var bernMedia = acumB.map(function (s) { return s / REPS; });
var bernSd = acumB2.map(function (s, q) {
  return Math.sqrt(Math.max(0, s / REPS - bernMedia[q] * bernMedia[q]));
});

console.log(fila('verdad geométrica', geo));
console.log(fila('ATENUACIÓN Σa', aten, 1));
console.log(fila('BERNOULLI media', bernMedia, 1));
console.log(fila('BERNOULLI sd', bernSd, 1));
console.log(fila('|Σa − Bern.media|', bernMedia.map(function (b, q) { return Math.abs(b - aten[q]); }), 2));
console.log(fila('error ATEN vs geom.', aten.map(function (a, q) { return a - geo[q]; }), 1));
console.log(fila('¿geom. en ±2σ Bern.?', bernMedia.map(function (b, q) {
  return Math.abs(geo[q] - b) <= 2 * bernSd[q] ? 1 : 0;
})));
/* La pregunta que decide si el sorteo aporta algo: ¿el hueco entre modelo y
   verdad cabe en la dispersión del sorteo? Si la verdad cae a muchas σ, el
   hueco es SESGO de la ley y ninguna realización lo cierra. */
console.log(fila('desvío geom. en σ', bernMedia.map(function (b, q) {
  return bernSd[q] > 0 ? (geo[q] - b) / bernSd[q] : NaN;
}), 1));

/* ── 3 · Brier por estrella ──────────────────────────────────────────────────
   (p − y)² para la atenuación; (z − y)² para el sorteo, promediado sobre las
   REPS semillas. Menor es mejor. La regla es propia, así que randomizar una
   probabilidad no puede mejorarla: si sale al revés, hay un bug. */
var brierA = ANILLOS.map(function () { return 0; }), brierB = ANILLOS.map(function () { return 0; });
for (var i = 0; i < visibles.length; i++) {
  if (aI[i] < 0) continue;
  var d = pI[i] - yGeo[i];
  brierA[aI[i]] += d * d;
  /* E_z[(z−y)²] con z~Bernoulli(p): vale p si y=0, y (1−p) si y=1. Se acumula
     la esperanza exacta en vez de promediar sorteos: mismo número, sin ruido. */
  brierB[aI[i]] += yGeo[i] ? (1 - pI[i]) : pI[i];
}
var nA = porAnillo(function () { return 1; });
console.log('\n' + cab);
console.log(fila('Brier ATENUACIÓN', brierA.map(function (s, q) { return s / nA[q]; }), 3));
console.log(fila('Brier BERNOULLI', brierB.map(function (s, q) { return s / nA[q]; }), 3));
console.log(fila('ventaja ATEN (%)', brierA.map(function (s, q) {
  return 100 * (1 - (s / nA[q]) / (brierB[q] / nA[q]));
}), 1));

/* Que la atenuación gane el Brier está garantizado por álgebra: es una regla de
   puntuación PROPIA y el sorteo es su randomización. Solo dice algo si `a`
   distingue estrellas de verdad, así que se mide contra la línea base de
   predecir la MISMA probabilidad para todas las del anillo. Sin esta fila, el
   Brier sería un criterio vacuo (ADR 0005). */
var mediaP = aten.map(function (s, q) { return nA[q] ? s / nA[q] : 0; });
var brierC = ANILLOS.map(function () { return 0; });
for (i = 0; i < visibles.length; i++) {
  if (aI[i] < 0) continue;
  var dc = mediaP[aI[i]] - yGeo[i];
  brierC[aI[i]] += dc * dc;
}
console.log(fila('Brier p constante', brierC.map(function (s, q) { return s / nA[q]; }), 3));

var totA = suma(brierA) / suma(nA), totB = suma(brierB) / suma(nA), totC = suma(brierC) / suma(nA);
if (!(totA <= totB + 1e-12)) throw new Error('Brier: randomizar mejoró una regla propia — bug');

/* ── 4 · El corte contra mlim ────────────────────────────────────────────────
   Atenuar por a es restar brillo: m' = m − 2,5·log10(a). Una estrella con
   a = 0,5 pierde 0,75 mag. Si m' pasa de mlim, el render no la dibuja: la
   atenuación se convierte en un borrado, y ahí la cuenta deja de ser Σa. El
   sorteo no toca ninguna magnitud, así que su cuenta no cambia por esto. */
var atenVivas = porAnillo(function (i) {
  return (visibles[i][2] - 2.5 * Math.log10(Math.max(pI[i], 1e-300))) <= mlim ? 1 : 0;
});
var atenFlujoVivas = porAnillo(function (i) {
  return (visibles[i][2] - 2.5 * Math.log10(Math.max(pI[i], 1e-300))) <= mlim ? pI[i] : 0;
});
console.log('\n' + cab);
console.log(fila('ATEN. dibujadas>mlim', atenVivas));
console.log(fila('ATEN. Σa que sobrevive', atenFlujoVivas, 1));
console.log(fila('ATEN. borradas por mlim', nA.map(function (n, q) { return n - atenVivas[q]; })));
console.log(fila('BERN. dibujadas>mlim', bernMedia, 1));

/* ── 4b · QUIÉN se pierde, no cuántos ────────────────────────────────────────
   Aquí los dos esquemas dejan de empatar, y contra la verdad del banco. La
   geometría no dice solo cuántas estrellas se mezclan: dice CUÁLES, y con ello
   su reparto de magnitudes. La mezcla se lleva por igual a brillantes y
   débiles —depende de la vecindad, no del brillo—. Atenuar y luego cortar
   contra mlim, en cambio, borra siempre a las más débiles. */
function resumenMag(sel) {
  var ms = [];
  for (var i = 0; i < visibles.length; i++) if (aI[i] >= 0 && sel(i)) ms.push(visibles[i][2]);
  if (!ms.length) return { n: 0, media: NaN, debiles: NaN };
  ms.sort(function (a, b) { return a - b; });
  var media = ms.reduce(function (s, x) { return s + x; }, 0) / ms.length;
  return { n: ms.length, media: media, mediana: ms[ms.length >> 1] };
}
/* Corte del cuartil más débil de las visibles, para medir el sesgo en brillo. */
var todasM = [];
for (i = 0; i < visibles.length; i++) if (aI[i] >= 0) todasM.push(visibles[i][2]);
todasM.sort(function (a, b) { return a - b; });
var q75 = todasM[Math.floor(todasM.length * 0.75)];
function fracDebiles(sel) {
  var n = 0, d = 0;
  for (var i = 0; i < visibles.length; i++) {
    if (aI[i] < 0 || !sel(i)) continue;
    n++; if (visibles[i][2] >= q75) d++;
  }
  return n ? 100 * d / n : NaN;
}
var conjuntos = [
  ['verdad geom. (mezcladas)', function (i) { return !yGeo[i]; }],
  ['ATEN. borradas por mlim', function (i) {
    return (visibles[i][2] - 2.5 * Math.log10(Math.max(pI[i], 1e-300))) > mlim; }],
  ['BERN. no dibujadas', function (i) { return !(uI[i] < pI[i]); }]
];
console.log('\nReparto de magnitudes del conjunto que se pierde (cuartil débil: G>=' +
            q75.toFixed(2) + '):');
console.log('   conjunto                    n   G medio  G mediana  % del cuartil débil');
conjuntos.forEach(function (c) {
  var s = resumenMag(c[1]);
  console.log('  ' + c[0].padEnd(26) + String(s.n).padStart(4) +
              s.media.toFixed(2).padStart(10) + s.mediana.toFixed(2).padStart(11) +
              fracDebiles(c[1]).toFixed(1).padStart(18) + ' %');
});
console.log('  (referencia: las visibles enteras tienen G medio ' +
            (todasM.reduce(function (s, x) { return s + x; }, 0) / todasM.length).toFixed(2) +
            ' y 25,0 % del cuartil débil)');

/* ── 5 · Conservación del flujo ──────────────────────────────────────────────
   Los dos esquemas parten el flujo de cada estrella en dibujado + velo. El de
   la atenuación es exacto por construcción; el del sorteo lo es en media. */
function flujo(m) { return Math.pow(10, -0.4 * m); }
var fTot = 0, fAten = 0, fBern = 0;
for (i = 0; i < visibles.length; i++) {
  if (aI[i] < 0) continue;
  var f = flujo(visibles[i][2]);
  fTot += f; fAten += pI[i] * f;
  fBern += (uI[i] < pI[i] ? 1 : 0) * f;
}
var fBernMedia = 0;
for (rep = 0; rep < REPS; rep++) {
  var acc = 0;
  for (i = 0; i < visibles.length; i++) {
    if (aI[i] < 0) continue;
    if (u01(visibles[i][0], visibles[i][1], rep) < pI[i]) acc += flujo(visibles[i][2]);
  }
  fBernMedia += acc;
}
fBernMedia /= REPS;
console.log('\nFlujo dibujado / total dentro de 8 r_h:');
console.log('  ATENUACIÓN            ' + (fAten / fTot).toFixed(6) + '  (exacto por construcción)');
console.log('  BERNOULLI 1 semilla   ' + (fBern / fTot).toFixed(6));
console.log('  BERNOULLI media ' + String(REPS).padStart(4) + '  ' + (fBernMedia / fTot).toFixed(6) +
            '   desvío ' + (100 * (fBernMedia - fAten) / fAten).toFixed(3) + ' %');

/* ── 6 · Estabilidad temporal ────────────────────────────────────────────────
   El desempate del ADR asume que el sorteo parpadea al mover el ocular. Se
   comprueba: `aCrowd(m, r, radioImagenAs)` no lleva aumentos dentro —sigma(r)
   y la LF son física del cúmulo, r_img es apertura y seeing—, así que si `a`
   no se mueve, el sorteo tampoco. Lo que sí cambia con el ocular es mlim, o
   sea QUÉ estrellas entran en la escena. Se mide sobre las que están en todas
   las escenas, que son las que podrían parpadear. */
var escenas = MAGS_ESTABILIDAD.map(escena);
var comunes = visibles.filter(function (s) {
  return escenas.every(function (x) { return s[2] <= x.mlim; });
});
console.log('\nEstabilidad al cambiar de ocular (' + MAGS_ESTABILIDAD.join('x, ') + 'x), sobre las ' +
            comunes.length + ' estrellas presentes en las cuatro escenas:');
var refA = null, maxDeltaA = 0, flips = 0, maxDeltaM = 0;
escenas.forEach(function (x, k) {
  var a = comunes.map(function (s) {
    return x.pob.aCrowd(s[2], x.pob.radioPropio(dx(s[0], M13.ra), (s[1] - M13.dec) * 3600), x.rImg);
  });
  if (refA === null) { refA = a; return; }
  a.forEach(function (v, i) {
    maxDeltaA = Math.max(maxDeltaA, Math.abs(v - refA[i]));
    maxDeltaM = Math.max(maxDeltaM, Math.abs(2.5 * Math.log10(Math.max(v, 1e-300) / Math.max(refA[i], 1e-300))));
    var u = u01(comunes[i][0], comunes[i][1], 0);
    if ((u < v) !== (u < refA[i])) flips++;
  });
  console.log('  ' + String(MAGS_ESTABILIDAD[k]) + 'x  mlim=' + x.mlim.toFixed(2) +
              '  r_img=' + x.rImg.toFixed(3) + '"  máx |Δa| vs ' + MAGS_ESTABILIDAD[0] + 'x = ' +
              maxDeltaA.toExponential(1) + '  decisiones cambiadas = ' + flips);
});
console.log('  ATENUACIÓN: máx cambio de brillo dibujado = ' + maxDeltaM.toExponential(1) + ' mag');
console.log('  BERNOULLI : ' + flips + ' parpadeos de ' + (comunes.length * (escenas.length - 1)) +
            ' comparaciones');

console.log('\n── Veredicto por el criterio del ADR ──');
console.log('cuenta   : ' + (Math.abs(suma(bernMedia) - suma(aten)) < 0.5 ? 'EMPATE' : 'DIFIEREN') +
            '  (Σa=' + suma(aten).toFixed(1) + ', Bernoulli=' + suma(bernMedia).toFixed(1) +
            ', geométrica=' + suma(geo) + ')');
console.log('por estrella (Brier, menor mejor): ATEN ' + totA.toFixed(4) + ' · BERN ' + totB.toFixed(4) +
            ' · p constante ' + totC.toFixed(4) + '  gana ' + (totA < totB ? 'ATENUACIÓN' : 'BERNOULLI') +
            (totA < totC ? '' : '  [AVISO: `a` no bate a una constante, la ventaja es vacua]'));
console.log('estabilidad: parpadeos del sorteo = ' + flips +
            (flips === 0 ? '  → el desempate del ADR no aplica: empatan también aquí' : ''));
