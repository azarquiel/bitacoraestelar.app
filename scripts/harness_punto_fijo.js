#!/usr/bin/env node
/* ADR 0012, paso 3 (B): el esquema del punto fijo.

   Hoy `tablaCumulo` corta la circularidad m_lim,sky <-> <I> con UNA iteración,
   y puede hacerlo porque arranca en `m_crowd`, la única cota que no depende del
   cielo. Con `a(m,r)` esa semilla desaparece.

   Conviene ser exacto sobre qué depende de qué, porque la mitad del problema se
   evapora al mirarlo:

     · `a(m, r)` NO depende del cielo. `aCrowd(m, rAs, radioImagenAs)` se
       alimenta de `sigma(r)` y de la LF —población TOTAL del cúmulo, vía
       Ntot— y de la imagen estelar, que es apertura y seeing. Medido en (A):
       0 cambios entre 61x y 250x.
     · Pero el VELO no es solo el crowding. Una estrella que sobrevive a la
       mezcla puede seguir siendo demasiado débil para el cielo, y entonces
       también va al velo. Ese término sí depende de m_res.

   Partición por estrella de magnitud m a radio r, sin banda ni listón:

       fracción (1-a)                 -> velo   (se mezcla)
       fracción a  y  m <= m_res      -> se dibuja
       fracción a  y  m >  m_res      -> velo   (la mezcla la salva, el cielo no)

   O sea, con el complemento exacto del ADR 0011:

       dibujado(m_res, r) = Σ_bins w(m_res) · num · f · a(m, r)
       velo(m_res, r)     = Ftotal - dibujado(m_res, r)
       m_res(r)           = m_lim,sky( Fcielo + sigma(r)·velo )

   Eso es un punto fijo de verdad: velo <- m_res <- velo. Lo que se mide aquí:

     1. Si converge, y con qué factor de contracción.
     2. Si el punto fijo es ÚNICO: tres semillas opuestas —todo resuelto, nada
        resuelto, y la de hoy (m_crowd)— tienen que caer en el mismo sitio. Si
        no lo hacen, el resultado dependería del arranque y no habría nada que
        elegir.
     3. El N mínimo que estabiliza por debajo de 0,01 mag desde la semilla que
        el ADR propone (densidad total, independiente del cielo).
     4. Cuánto se mueve m_res respecto a producción, que es lo que el paso 4
        va a cambiar.

   La ley es `pob.aCrowd` de producción (ADR 0008). Lo único que el arnés
   construye es el VELO nuevo, porque todavía no existe en ningún sitio: es
   justamente el esquema que (B) tiene que decidir. Se comprueba contra
   producción que la reconstrucción de la LF suma el mismo flujo total.

   node scripts/harness_punto_fijo.js [--sqm N] [--D mm] [--mag N] [--iter N] */
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
var SQM = arg('sqm', 21), D = arg('D', 467), MAG = arg('mag', 173), ITER = arg('iter', 12);
var PROC = 720, ARCMIN = 0.47 * 60;
var RADIOS_RH = [0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8];   // dónde se informa
var TRAMOS = 512;                                      // dónde se busca el peor caso

var e = global.window.BITACORA_GLOBULARES.filter(function (f) { return f[0] === 'NGC 6205'; })[0];
var M13 = { id: e[0], ra: e[2], dec: e[3], rc: e[4], rh: e[5], c: e[6], muV0: e[7],
            Vt: e[8], dkpc: e[9], ebv: e[10], feh: e[11], elip: e[12], pa: null };
var rhAs = M13.rh * 60;

var gaia = fs.readFileSync(path.join(__dirname, '../simulador_ocular/docs/validacion/m13_gaia_dr3.csv'), 'utf8')
  .trim().split('\n').slice(1).map(function (l) {
    var c = l.split(',');
    return [+c[0], +c[1], +c[2], c[3] === '' ? null : +c[3]];
  });
var mlimGaia = R.magLimite({ apertura: D, aumentos: MAG, transmision: 0.9, sqm: SQM, pupilaOjo: 7 });
var base = R.pintarCumulo(new Float32Array(PROC * PROC), M13, {
  ra0: M13.ra, dec0: M13.dec, arcmin: ARCMIN, size: PROC,
  cielo: { pupilaSalida: D / MAG, pupilaOjo: 7, sqm: SQM, transmision: 0.9,
           aumentos: MAG, perceptual: true },
  apertura: D, estrellas: gaia.filter(function (s) { return s[2] <= mlimGaia; })
});
var pob = base.poblacion, rImg = base.radioImagenAs, Fcielo = base.cHalo.Fcielo;

/* ── La LF, reconstruida por bins ────────────────────────────────────────────
   `magnitudes` y `estrellasPorBin` son de producción; el flujo por estrella es
   la definición de magnitud, no una ley. Se comprueba contra `pob.S1`. */
var mAp = pob.magnitudes, num = pob.estrellasPorBin, nBin = mAp.length;
var paso = mAp.length > 1 ? mAp[1] - mAp[0] : 1;
var fBin = new Float64Array(nBin), fTotBins = 0;
for (var i = 0; i < nBin; i++) {
  fBin[i] = Math.pow(10, -0.4 * mAp[i]);
  fTotBins += num[i] * fBin[i];
}
var fTotProd = pob.S1(-99);          // toda la cola: el flujo entero del cúmulo
var errRec = Math.abs(fTotBins - fTotProd) / fTotProd;
if (errRec > 1e-9) throw new Error('la LF reconstruida no cuadra con producción: ' + errRec);

/* Fracción del bin i más brillante que m: misma partición lineal que `cola`
   usa dentro del bin, para que m_res sea continua en r (invariante 7). */
function pesoBrillante(i, m) {
  var x = (m - mAp[0]) / paso + 0.5 - i;      // posición de m dentro del bin i
  return x <= 0 ? 0 : (x >= 1 ? 1 : x);
}

function dibujado(mRes, rAs) {
  if (!isFinite(mRes)) return mRes > 0 ? dibujadoTodo(rAs) : 0;
  var acc = 0;
  for (var i = 0; i < nBin; i++) {
    var w = pesoBrillante(i, mRes);
    if (w <= 0) continue;
    acc += w * num[i] * fBin[i] * pob.aCrowd(mAp[i], rAs, rImg);
  }
  return acc;
}
function dibujadoTodo(rAs) {
  var acc = 0;
  for (var i = 0; i < nBin; i++) acc += num[i] * fBin[i] * pob.aCrowd(mAp[i], rAs, rImg);
  return acc;
}

/* Un paso del punto fijo: de m_res sale el velo, del velo sale m_res. */
function paso1(mRes, rAs) {
  var velo = pob.sigma(rAs) * (fTotBins - dibujado(mRes, rAs));
  var m = R.magLimite({
    apertura: D, aumentos: MAG, transmision: 0.9,
    sqm: -2.5 * Math.log10(Fcielo + velo), pupilaOjo: 7
  });
  return m == null ? -Infinity : m;
}

function iterar(rAs, semilla, nIter) {
  var m = semilla, hist = [];
  for (var k = 0; k < nIter; k++) {
    var m2 = paso1(m, rAs);
    hist.push({ m: m2, d: Math.abs(m2 - m) });
    m = m2;
  }
  return hist;
}

var SEMILLAS = [
  ['densidad total (ADR)', function (rAs) { return Infinity; }],   // todo resuelto
  ['nada resuelto', function (rAs) { return -Infinity; }],
  ['m_crowd (la de hoy)', function (rAs) { return pob.mCrowd(rAs, Math.PI * rImg * rImg); }]
];

console.log('M13 · D=' + D + 'mm  M=' + MAG + 'x  SQM=' + SQM.toFixed(1) +
            '  r_img=' + rImg.toFixed(2) + '"  F_cielo=' + Fcielo.toExponential(3));
console.log('LF reconstruida contra pob.S1: error relativo ' + errRec.toExponential(1) +
            '  (' + nBin + ' bins, paso ' + paso.toFixed(2) + ' mag)\n');

/* ── 1 y 2 · Convergencia y unicidad ─────────────────────────────────────── */
console.log('Convergencia por radio, ' + ITER + ' iteraciones desde tres semillas opuestas:');
console.log('  r/r_h    m_res converge a   |Δ| iter 1   iter 2   iter 3   iter 4   contracción   máx dif. entre semillas');
var peorDifSemillas = 0, peorContrac = 0, nParaCentiMag = 0;
RADIOS_RH.forEach(function (rr) {
  var rAs = rr * rhAs;
  var finales = [], h0 = null;
  SEMILLAS.forEach(function (sem, si) {
    var h = iterar(rAs, sem[1](rAs), ITER);
    finales.push(h[h.length - 1].m);
    if (si === 0) h0 = h;
  });
  var dif = Math.max.apply(null, finales.map(function (m) {
    return Math.abs(m - finales[0]);
  }));
  peorDifSemillas = Math.max(peorDifSemillas, dif);
  /* La semilla del ADR arranca en m_res = ∞, así que el primer |Δ| es infinito
     y no sirve para medir contracción. Se lee entre los dos primeros pasos
     finitos. */
  var c = (h0[1].d > 0 && isFinite(h0[1].d) && h0[2].d >= 0) ? h0[2].d / h0[1].d : NaN;
  peorContrac = Math.max(peorContrac, c);
  var nN = 1;
  while (nN < ITER && h0[nN - 1].d >= 0.01) nN++;
  nParaCentiMag = Math.max(nParaCentiMag, nN);
  console.log('  ' + rr.toFixed(2).padStart(5) + finales[0].toFixed(4).padStart(18) +
              h0.slice(0, 4).map(function (x) {
                return (isFinite(x.d) ? x.d.toFixed(4) : 'inf').padStart(9);
              }).join('') + c.toExponential(1).padStart(14) +
              dif.toExponential(1).padStart(26));
});

/* Peor caso sobre toda la rejilla radial, no solo en los radios de informe. */
var peorD1 = 0, peorD2 = 0, peorDifTodo = 0, rPeor = 0, nGlobal = 0, rNGlobal = 0;
for (var t = 1; t <= TRAMOS; t++) {
  var rAs = (t / TRAMOS) * pob.rtAs;
  if (!(pob.sigma(rAs) > 0)) continue;
  var hA = iterar(rAs, Infinity, ITER);
  var hB = iterar(rAs, -Infinity, ITER);
  if (hA[1].d > peorD1) { peorD1 = hA[1].d; rPeor = rAs / rhAs; }
  peorD2 = Math.max(peorD2, hA[2].d);
  /* Unicidad tras la convergencia, no a mitad de camino: con factor ~0,1 por
     paso, comparar a 4 pasadas mide el transitorio, no el punto fijo. */
  peorDifTodo = Math.max(peorDifTodo, Math.abs(hA[ITER - 1].m - hB[ITER - 1].m));
  /* N mínimo sobre TODA la rejilla, no solo en los radios de informe: la
     convergencia más lenta no cae necesariamente en uno redondo. */
  var nN = 1;
  while (nN < ITER && hA[nN - 1].d >= 0.01) nN++;
  if (nN > nGlobal) { nGlobal = nN; rNGlobal = rAs / rhAs; }
}

console.log('\nSobre los ' + TRAMOS + ' tramos radiales completos:');
console.log('  peor |Δ| de la iteración 2  ' + peorD1.toFixed(6) + ' mag  (en r/r_h = ' + rPeor.toFixed(2) + ')');
console.log('  peor |Δ| de la iteración 3  ' + peorD2.toFixed(6) + ' mag');
console.log('  peor dif. entre semillas opuestas tras ' + ITER + ' pasadas  ' +
            peorDifTodo.toExponential(1) + ' mag');

/* ── 4 · Contra producción ───────────────────────────────────────────────── */
console.log('\nContra el m_res del modelo viejo (m_crowd + banda δ, k=30):');
console.log('  r/r_h    producción    punto fijo     Δ');
RADIOS_RH.forEach(function (rr) {
  var rAs = rr * rhAs;
  var h = iterar(rAs, Infinity, ITER);
  var nuevo = h[h.length - 1].m;
  var j = Math.min(base.tabla.mRes.length - 1, Math.round(rAs / base.tabla.paso));
  var viejo = base.tabla.mRes[j];        // valor tabulado por producción
  console.log('  ' + rr.toFixed(2).padStart(5) + viejo.toFixed(3).padStart(14) +
              nuevo.toFixed(3).padStart(14) + (nuevo - viejo).toFixed(3).padStart(8));
});

console.log('  N mínimo para |Δ| < 0,01 mag desde la semilla del ADR  ' + nGlobal +
            ' pasadas  (peor radio r/r_h = ' + rNGlobal.toFixed(2) + ')');

/* ── 5 · Coste ───────────────────────────────────────────────────────────────
   5 pasadas suenan a 5x. `a(m_i, r)` no depende de m_res, así que parecía que
   precalcularlo por radio y dejar que las iteraciones solo re-pesen la tabla
   sería mucho más barato. MEDIDO: empatan (1,1x), porque el bucle ingenuo ya
   se salta los bins más débiles que m_res y el precalculado los paga todos.
   Se deja la medida para que el paso 4 no meta una optimización que no compra
   nada; con 4-5 ms de tabla radial completa, ninguna de las dos formas es un
   problema para el render. */
function tablaIngenua(nIter) {
  var acc = 0;
  for (var t = 1; t <= TRAMOS; t++) {
    var rAs = (t / TRAMOS) * pob.rtAs;
    if (!(pob.sigma(rAs) > 0)) continue;
    acc += iterar(rAs, Infinity, nIter)[nIter - 1].m;
  }
  return acc;
}
function tablaPrecalculada(nIter) {
  var acc = 0, g = new Float64Array(nBin);
  for (var t = 1; t <= TRAMOS; t++) {
    var rAs = (t / TRAMOS) * pob.rtAs;
    var s = pob.sigma(rAs);
    if (!(s > 0)) continue;
    for (var i = 0; i < nBin; i++) g[i] = num[i] * fBin[i] * pob.aCrowd(mAp[i], rAs, rImg);
    var m = Infinity;
    for (var k = 0; k < nIter; k++) {
      var dib = 0;
      if (isFinite(m)) {
        for (i = 0; i < nBin; i++) {
          var w = pesoBrillante(i, m);
          if (w > 0) dib += w * g[i];
        }
      } else if (m > 0) { for (i = 0; i < nBin; i++) dib += g[i]; }
      var mm = R.magLimite({ apertura: D, aumentos: MAG, transmision: 0.9,
        sqm: -2.5 * Math.log10(Fcielo + s * (fTotBins - dib)), pupilaOjo: 7 });
      m = mm == null ? -Infinity : mm;
    }
    acc += m;
  }
  return acc;
}
tablaIngenua(5); tablaPrecalculada(5);        // calentar el JIT antes de medir
var t0 = process.hrtime.bigint(); var vA = tablaIngenua(5);
var t1 = process.hrtime.bigint(); var vB = tablaPrecalculada(5);
var t2 = process.hrtime.bigint();
var ms = function (a, b) { return Number(b - a) / 1e6; };
console.log('\nCoste de construir la tabla radial (' + TRAMOS + ' tramos, 5 pasadas):');
console.log('  aCrowd dentro del bucle   ' + ms(t0, t1).toFixed(1) + ' ms');
console.log('  aCrowd precalculado       ' + ms(t1, t2).toFixed(1) + ' ms   (' +
            (ms(t0, t1) / ms(t1, t2)).toFixed(1) + 'x más barato)');
if (Math.abs(vA - vB) > 1e-9) throw new Error('el precalculado cambia el resultado: ' + (vA - vB));
console.log('  mismo resultado: diferencia ' + Math.abs(vA - vB).toExponential(1) + ' mag acumulada');

console.log('\n── Veredicto ──');
/* El residuo entre semillas opuestas NO es dependencia del arranque: es lo que
   falta por converger tras ITER pasadas, y encoge con ellas (7,4e-6 a 12
   pasadas, 3,1e-9 a 20, 2,0e-13 a 30). El umbral es holgado respecto al 0,01
   mag que el ADR pide. */
console.log('unicidad   : ' + (peorDifTodo < 1e-3
  ? 'el punto fijo es ÚNICO: ' + peorDifTodo.toExponential(1) +
    ' mag entre arranques opuestos tras ' + ITER + ' pasadas, y encoge al iterar'
  : 'DEPENDE DE LA SEMILLA: ' + peorDifTodo.toExponential(1) + ' mag entre arranques opuestos'));
console.log('contracción: peor factor |Δ3|/|Δ2| = ' + peorContrac.toExponential(1) +
            (peorContrac < 1 ? '  (contrae)' : '  (NO contrae)'));
console.log('N mínimo   : ' + nGlobal + ' pasadas para bajar de 0,01 mag desde la semilla ' +
            'del ADR (UNA no basta: la primera deja ' + peorD1.toFixed(3) + ' mag)');
if (!(peorDifTodo < 1e-3)) throw new Error('el punto fijo depende del arranque: el esquema no está definido');
