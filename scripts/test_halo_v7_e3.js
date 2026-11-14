#!/usr/bin/env node
/* E3 · Perfil de King: truncamiento y normalización.

   Tres preguntas, las del documento de tareas v7:

     1. ¿El perfil implementado integra al flujo total declarado? Sigma(r) sale
        de perfilKing/(areaKing·r_c²) y debe cerrar a 1 sobre el cielo con la
        integral NUMÉRICA del propio perfil, no con la fórmula cerrada que lo
        normaliza: si areaKing no fuese la primitiva del perfil truncado que se
        pinta, este test es el único sitio donde se nota.
     2. ¿El brillo superficial que sale del perfil es el del cúmulo real?
        mu_V(r) = V_t − 2,5·log10(Sigma(r)) contra los perfiles observados de
        Trager, King & Djorgovski 1995 (simulador_ocular/docs/validacion/trager1995.tsv), en la
        región donde King de un solo parámetro tiene sentido: 0,5·r_c a 3·r_c.
        Residuo medio exigido < 0,5 mag.
     3. ¿Las alas se apagan? A r > 4·r_h el contraste del cúmulo sobre el cielo
        debe quedar por debajo de Cmin en la configuración de la captura de D1
        (M13, 200 mm, 146x, SQM 21,5) y, por tanto, el tap perceptual no debe
        pintar nada ahí.

   Los datos de Trager son mu_V OBSERVADO y el V_t de Harris también lo es: los
   dos llevan la misma extinción, así que la comparación no la mete ni la quita.

   node scripts/test_halo_v7_e3.js */
'use strict';

global.window = {};
global.document = undefined;
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/lf-globulares-datos.js');
require('../simulador_ocular/resources/js/globulares-datos.js');
require('../resources/js/bitacora-cumulos.js');
var fs = require('fs');
var path = require('path');
var H = require('./harness_halo_v7.js');
var R = global.window.BitacoraGaiaRender;
var C = global.window.BitacoraCumulos;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

/* ── E3.1 · La integral numérica del perfil == el flujo total declarado ────── */

console.log('\nE3.1 · integral numérica de Sigma(r)·2·pi·r dr sobre el cielo == 1');

var REFS = ['NGC 6205', 'NGC 7078', 'NGC 6121', 'NGC 104', 'NGC 5139'];
/* Los 13 del seed (#537) llevan la curva de Trager (ADR 0035): su área sale de
   cuadratura en producción, no de la fórmula cerrada de King, y es la que hay
   que cerrar aquí con una malla diez veces más fina. */
var SEED = [['NGC 7089', 'M2'], ['NGC 6121', 'M4'], ['NGC 5904', 'M5'], ['NGC 6333', 'M9'], ['NGC 6254', 'M10'],
  ['NGC 6218', 'M12'], ['NGC 6205', 'M13'], ['NGC 6402', 'M14'], ['NGC 7078', 'M15'], ['NGC 6656', 'M22'],
  ['NGC 7099', 'M30'], ['NGC 6809', 'M55'], ['NGC 6266', 'M62']];
var SEED_IDS = SEED.map(function (p) { return p[0]; });

REFS.concat(SEED_IDS.filter(function (id) { return REFS.indexOf(id) < 0; })).forEach(function (id) {
  var cum = H.cumulo(id);
  var pob = C.poblacionCacheada(cum, 0);
  /* Simpson sobre [0, r_t] con paso fino: el perfil es liso salvo en r_t, donde
     el truncamiento lo lleva a 0 con tangente no nula. 200 000 nodos dejan el
     error de cuadratura tres órdenes por debajo de la tolerancia pedida. */
  var N = 200000, h = pob.rtAs / N, acu = 0;
  for (var i = 0; i < N; i++) {
    var a = i * h, b = a + h, m = (a + b) / 2;
    acu += (pob.sigma(a) * a + 4 * pob.sigma(m) * m + pob.sigma(b) * b) * (h / 6);
  }
  acu *= 2 * Math.PI;
  // Y más allá de r_t no puede quedar nada: el perfil truncado vale 0.
  var fuera = pob.sigma(pob.rtAs * 1.000001) + pob.sigma(pob.rtAs * 2);
  ok(Math.abs(acu - 1) <= 0.001 && fuera === 0,
    id + ': integral = ' + acu.toFixed(6) + ' (desvío ' +
    (Math.abs(acu - 1) * 100).toFixed(4) + ' %), y Sigma(r > r_t) = ' + fuera);
});

/* Todas las filas con curva se publican, no solo las 13 que se miden contra
   Trager: cada una tiene que dar una PDF sana (Sigma finita y ≥ 0, cierre a 1). */
var conCurva = global.window.BITACORA_GLOBULARES.filter(function (e) { return e[13] && e[8] != null && e[9] != null; });
var malas = conCurva.filter(function (e) {
  var pob = C.poblacionCacheada(C.fichaDeFila(e), 0);
  var N = 20000, h = pob.rtAs / N, acu = 0, sano = true;
  for (var i = 0; i < N; i++) {
    var a = i * h, b = a + h, m = (a + b) / 2, sa = pob.sigma(a), sm = pob.sigma(m), sb = pob.sigma(b);
    if (!(sa >= 0 && sm >= 0 && sb >= 0 && isFinite(sa + sm + sb))) sano = false;
    acu += (sa * a + 4 * sm * m + sb * b) * (h / 6);
  }
  return !sano || Math.abs(2 * Math.PI * acu - 1) > 0.001;
});
ok(conCurva.length >= 120 && malas.length === 0, conCurva.length + ' globulares con curva de Trager: Sigma finita, ≥ 0 y ' +
  'cierre a 1 ± 0,001 en todos' + (malas.length ? ' (fallan: ' + malas.map(function (e) { return e[0]; }).join(', ') + ')' : ''));

/* ── E3.2 · mu_V(r) contra Trager, King & Djorgovski 1995 ─────────────────── */

console.log('\nE3.2 · mu_V(r) del perfil implementado contra Trager+1995 (0,5·r_c a 3·r_c)');

var TSV = path.join(__dirname, '..', 'simulador_ocular', 'docs', 'validacion', 'trager1995.tsv');
var lineas = fs.readFileSync(TSV, 'utf8').split('\n');
var trager = {};
lineas.forEach(function (l) {
  if (!l || l.charAt(0) === '#') return;
  var c = l.split('\t');
  var nombre = c[0].trim(), lr = parseFloat(c[1]), mu = parseFloat(c[2]), w = parseFloat(c[4]);
  if (!isFinite(lr) || !isFinite(mu)) return;
  // Solo los puntos con peso en el ajuste de los propios autores: los de peso 0
  // son los que ellos mismos descartaron (saturación, contaminación, escalas mal
  // casadas). Usarlos sería juzgar el modelo contra datos que nadie defiende.
  if (!(w > 0)) return;
  (trager[nombre] = trager[nombre] || []).push({ rAs: Math.pow(10, lr), muV: mu });
});

var PARES = [['NGC 6205', 'ngc6205'], ['NGC 7078', 'ngc7078'],
             ['NGC 6121', 'ngc6121'], ['NGC 104', 'ngc104']];

ok(PARES.every(function (p) { return (trager[p[1]] || []).length >= 20; }),
  'los cuatro cúmulos de referencia están en el TSV con puntos de peso 1: ' +
  PARES.map(function (p) { return p[1] + '=' + (trager[p[1]] || []).length; }).join(' '));

PARES.forEach(function (par) {
  var cum = H.cumulo(par[0]);
  var pob = C.poblacionCacheada(cum, 0);
  var Ftot = Math.pow(10, -0.4 * cum.Vt);
  var puntos = trager[par[1]].filter(function (p) {
    return p.rAs >= 0.5 * pob.rcAs && p.rAs <= 3 * pob.rcAs;
  });
  var suma = 0, sesgo = 0;
  puntos.forEach(function (p) {
    var mu = -2.5 * Math.log10(pob.sigma(p.rAs) * Ftot);
    suma += Math.abs(mu - p.muV);
    sesgo += mu - p.muV;
  });
  var medio = suma / puntos.length;
  ok(puntos.length >= 5 && medio < 0.5,
    par[0] + ' (r_c = ' + pob.rcAs.toFixed(1) + '"): residuo medio ' +
    medio.toFixed(3) + ' mag en ' + puntos.length + ' puntos (sesgo ' +
    (sesgo / puntos.length >= 0 ? '+' : '') + (sesgo / puntos.length).toFixed(3) + ')');
});

/* ── E3.2b · El halo, de 2·r_h a r_t, contra Trager en los 13 del seed ────── */

/* ADR 0035 (#556). La ventana de E3.2 (0,5–3 r_c) no ve el halo, que es donde
   el King 1962 de Harris pintaba de más. Aquí se mide el halo con el criterio
   del spike #537 (simulador_ocular/docs/notas/perfil-king-contra-trager-globulares.md):

   - Tramos de r/r_h 2–4, 4–8 y 8–∞, cortados en r_t de Harris (más allá el
     render ya no pinta). Son los tramos exteriores del spike.
   - Mediana de (mu_render − mu_Trager) por tramo, solo puntos de peso > 0, y
     solo los tramos con al menos 3: con 1 o 2 la mediana es un punto suelto.
   - Falla si algún tramo queda ≤ −0,3 mag. Es el umbral con el que el spike
     definió «exceso de forma» (nota, §1 y tabla de P1), no un valor de la ley
     vieja: −0,3 mag es un 32 % más de flujo que lo medido.

   El residuo se juzga SOLO EN FORMA. Se le suma ΔV = V(muVf integrada hasta el
   último nodo de Trager) − V_t(Harris), la diferencia de punto cero entre las
   dos fuentes. Esa diferencia (~0,45 mag en M12, M30 y M55) es normalización,
   no forma, y queda fuera del ADR 0035; sin restarla, ninguna forma pasaría en
   esos tres. ΔV se calcula aquí, desde el TSV crudo, igual que en el spike
   (disco central de 0,5" a muVf(0,5") + trapecios en log r, 4000 tramos). */

console.log('\nE3.2b · halo (2·r_h a r_t) contra Trager+1995, solo forma, 13 del seed');

var TRAGER_TODO = path.join(__dirname, '..', 'mapa', 'datos', 'trager1995.tsv');
var crudo = {};
fs.readFileSync(TRAGER_TODO, 'utf8').split('\n').forEach(function (l) {
  if (!l || l.charAt(0) === '#') return;
  var c = l.split('\t');
  if (!(parseFloat(c[4]) > 0)) return;
  (crudo[c[0].trim()] = crudo[c[0].trim()] || []).push({ lr: parseFloat(c[1]), mu: parseFloat(c[2]), muf: parseFloat(c[3]) });
});
/* muVf de Trager en log r, un nodo por radio (media si se repite), plana fuera
   del rango medido: la misma interpolación que el spike, desde el dato crudo. */
function mufCrudo(pts) {
  var por = {};
  pts.forEach(function (q) { (por[q.lr] = por[q.lr] || []).push(q.muf); });
  var lr = Object.keys(por).map(Number).sort(function (a, b) { return a - b; });
  var mf = lr.map(function (x) { return por[x].reduce(function (a, v) { return a + v; }, 0) / por[x].length; });
  return { lrUlt: lr[lr.length - 1], muf: function (rAs) {
    var x = Math.log10(Math.min(Math.max(rAs, Math.pow(10, lr[0])), Math.pow(10, lr[lr.length - 1])));
    var j = 1; while (j < lr.length - 1 && lr[j] < x) j++;
    return mf[j - 1] + (x - lr[j - 1]) / (lr[j] - lr[j - 1]) * (mf[j] - mf[j - 1]);
  } };
}
function mediana(v) {
  v = v.slice().sort(function (a, b) { return a - b; });
  var h = v.length >> 1;
  return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2;
}
ok(mediana([1, 2, 3, 4]) === 2.5 && mediana([3, 1, 2]) === 2, 'mediana: par e impar');

var TRAMOS_HALO = [[2, 4], [4, 8], [8, Infinity]];
var UMBRAL_EXCESO = -0.3;

SEED.forEach(function (par) {
  var cum = H.cumulo(par[0]), pts = crudo[par[0].replace('NGC ', 'ngc')];
  var pob = C.poblacionCacheada(cum, 0), rhAs = cum.rh * 60, Ftot = Math.pow(10, -0.4 * cum.Vt);
  var tr = mufCrudo(pts), rUlt = Math.pow(10, tr.lrUlt);
  var N = 4000, l0 = Math.log10(0.5), F = Math.pow(10, -0.4 * tr.muf(0.5)) * Math.PI * 0.25;
  for (var i = 0; i < N; i++) {
    var ra = Math.pow(10, l0 + (tr.lrUlt - l0) * i / N), rb = Math.pow(10, l0 + (tr.lrUlt - l0) * (i + 1) / N);
    F += (Math.pow(10, -0.4 * tr.muf(ra)) * ra + Math.pow(10, -0.4 * tr.muf(rb)) * rb) * (rb - ra) * Math.PI;
  }
  var dV = -2.5 * Math.log10(F) - cum.Vt;
  var peor = Infinity, texto = [];
  TRAMOS_HALO.forEach(function (t) {
    var q = pts.filter(function (p) {
      var r = Math.pow(10, p.lr);
      return r >= t[0] * rhAs && r < t[1] * rhAs && r < pob.rtAs;
    });
    if (q.length < 3) { texto.push('—(' + q.length + ')'); return; }
    var m = mediana(q.map(function (p) {
      return -2.5 * Math.log10(pob.sigma(Math.pow(10, p.lr)) * Ftot) - p.mu + dV;
    }));
    peor = Math.min(peor, m);
    texto.push(m.toFixed(2) + '(' + q.length + ')');
  });
  ok(!(peor <= UMBRAL_EXCESO), par[1] + ' (' + par[0] + '): tramos 2-4/4-8/8-∞ r_h ' + texto.join(' ') +
    ', ΔV ' + dV.toFixed(2) + ', último nodo ' + (rUlt / 60).toFixed(1) + "' (r_t " + (pob.rtAs / 60).toFixed(1) + "')");
});

/* ── E3.4 · Hasta dónde se pinta el halo de M13 (ADR 0035) ─────────────────── */

/* Las cifras de la §3 de la nota del spike #537: el último radio con ≥ 1 DN en
   la tabla radial de pintarCumulo, halo lineal (#535), lienzo de 200 px y
   2,4·r_t de lado, SQM 21,5. Con el King de Harris era 6,24' a 200 mm/100× y
   7,51' a 406 mm/50×; con la forma de Trager el spike midió 5,33' y 6,24'. La
   tolerancia de ±0,05' es la del ticket #556: algo más de un paso de la tabla
   radial (r_t/512 = 0,04' en M13), así que solo admite un paso de bailoteo. */

console.log("\nE3.4 · M13: último radio con ≥ 1 DN (cifras de la §3 del spike #537)");

function radio1DN(cum, D, MAG, sqm) {
  var pob = C.poblacionCacheada(cum, 0), SIZE = 200;
  var cielo = { pupilaSalida: D / MAG, pupilaOjo: 7, sqm: sqm, transmision: 0.9, aumentos: MAG, perceptual: true };
  var res = R.pintarCumulo(new Float32Array(SIZE * SIZE), cum, { ra0: cum.ra, dec0: cum.dec,
    arcmin: Math.ceil(2.4 * pob.rtAs / 60), size: SIZE, cielo: cielo, apertura: D, estrellas: [], realization: 0 });
  var t = res.tabla, cp = R.ctxFotometrico(cielo, 2 * cum.rh), r1 = 0;
  for (var i = 0; i < t.r.length; i++) {
    if (R.valorDeFlujo(t.I[i] * t.sHalo[i], cp.FcieloPintado, cp.rango) >= 1) r1 = t.r[i];
  }
  return r1 / 60;
}
[[200, 100, 5.33], [406, 50, 6.24]].forEach(function (cs) {
  var r1 = radio1DN(H.cumulo('NGC 6205'), cs[0], cs[1], 21.5);
  ok(Math.abs(r1 - cs[2]) <= 0.05, cs[0] + ' mm / ' + cs[1] + "×: r(≥ 1 DN) = " + r1.toFixed(2) +
    "' (spike: " + cs[2].toFixed(2) + "' ± 0,05')");
});

/* ── E3.5 · Las sintéticas siguen la misma forma que el velo ───────────────── */

/* sigma() y construirCDF() son dos sitios: si solo cambiase uno, la luz no
   resuelta y las estrellas sintéticas seguirían formas distintas (ADR 0035).
   La fracción de estrellas más allá de 2·r_h tiene que casar con la integral de
   Sigma(r) ahí, dentro de un 2 % relativo (#556).

   `sinteticas` descarta por completitud de Gaia, que depende del radio (el
   núcleo aglomerado pierde más), así que su salida NO sigue Sigma. Se mide el
   sorteo sin ese aclarado: gaiaM50 = −∞ hace la completitud 0 en todo radio, y
   se restaura al acabar. Muestra fija: realizaciones 0 a 9 (~70 000 estrellas,
   error de Poisson ~0,8 % relativo en la fracción). */

console.log('\nE3.5 · M13: estrellas sintéticas más allá de 2·r_h contra la integral de Sigma(r)');

(function () {
  var cum = H.cumulo('NGC 6205'), pob = C.poblacionCacheada(cum, 0), r2 = 2 * cum.rh * 60;
  var N = 200000, h = (pob.rtAs - r2) / N, integral = 0;
  for (var i = 0; i < N; i++) {
    var a = r2 + i * h, b = a + h, m = a + h / 2;
    integral += (pob.sigma(a) * a + 4 * pob.sigma(m) * m + pob.sigma(b) * b) * h / 6;
  }
  integral *= 2 * Math.PI;
  var m50 = C.config.gaiaM50, est = [];
  C.config.gaiaM50 = -Infinity;
  try {
    for (var k = 0; k < 10; k++) est = est.concat(pob.sinteticas({ ra: cum.ra, dec: cum.dec, realization: k }));
  } finally { C.config.gaiaM50 = m50; }
  var cosd = Math.cos(cum.dec * Math.PI / 180), fuera = est.filter(function (s) {
    return Math.hypot((s[0] - cum.ra) * 3600 * cosd, (s[1] - cum.dec) * 3600) > r2;
  }).length / est.length;
  ok(est.length > 50000 && Math.abs(fuera / integral - 1) <= 0.02, est.length + ' estrellas: fracción más allá de 2·r_h ' +
    fuera.toFixed(4) + ' contra la integral de Sigma ' + integral.toFixed(4) +
    ' (desvío ' + (100 * (fuera / integral - 1)).toFixed(1) + ' %)');
})();

/* ── E3.3 · Las alas a r > 4·r_h no se ven ────────────────────────────────── */

console.log('\nE3.3 · alas a r > 4·r_h por debajo de cielo + Cmin (captura de D1: M13, 200 mm, 146x, SQM 21,5)');

var m = H.medir(H.cumulo('NGC 6205'), { D: 200, MAG: 146, sqm: 21.5, realization: 0 });
var rAla = 4 * m.rhAs;
var rBorde = Math.min(m.rtAs, m.arcmin * 60 / 2);
ok(rAla < rBorde, '4·r_h = ' + rAla.toFixed(0) + '" cae dentro del lienzo (borde ' +
  rBorde.toFixed(0) + '", r_t = ' + m.rtAs.toFixed(0) + '")');

/* El contraste del cúmulo es <I>/Fcielo, los dos SIN atenuar: el render pinta el
   objeto como incremento sobre Fcielo y dim entra una sola vez, en SBe y en
   Cmin (E1.3). Compararlo contra Cmin es exactamente lo que hace el render. */
var modelo = m.perfilEn('modelo', rAla, rBorde, 12);
var difuso = m.perfilEn('difuso', rAla, rBorde, 12);
/* El listón del tap perceptual no es «cero exacto»: visibilidadDifusa es una
   sigmoide en log, así que por debajo del umbral deja una cola que tiende a
   cero sin llegar. Lo que se exige es que lo pintado sea invisible frente al
   cielo, y no que el float dé 0,0, que haría el test rehén del último decimal.

   El listón es un nivel de una pantalla de 8 bits, 1/255 del cielo. Antes era
   1e-6 y el ala lo cumplía con margen infinito porque caía FUERA del hombro de
   la sigmoide (tap exactamente 0). Con el (1−a) de la banda dentro del velo el
   ala tiene el flujo que le tocaba, entra en el hombro y el tap deja una cola:
   sigue siendo invisible —la sigmoide se come el 99,8 % de un ala que ya está
   a 0,38·Cmin—, pero ya no es un cero exacto, y fingir que lo es exigiendo 1e-6
   sería pedirle a la ley perceptual un corte duro que no tiene. Se mide lo que
   importa: qué fracción del ala sobrevive al tap, y contra qué la ve el ojo. */
var TOL_PINTA = 1 / 255;
var TOL_TAP = 0.01;
var peorC = 0, visibles = 0, anillosVal = 0, peorPinta = 0, peorTap = 0;
modelo.forEach(function (a, i) {
  if (!(a.n > 0)) return;
  anillosVal++;
  var c = a.I / m.Fcielo;
  if (c > peorC) peorC = c;
  var pinta = difuso[i].I / m.Fcielo;
  if (pinta > peorPinta) peorPinta = pinta;
  if (a.I > 0 && difuso[i].I / a.I > peorTap) peorTap = difuso[i].I / a.I;
  if (pinta > TOL_PINTA) visibles++;
});
ok(anillosVal >= 8 && peorC < m.Cmin,
  'el contraste máximo del ala es ' + peorC.toExponential(3) + ' < Cmin = ' +
  m.Cmin.toExponential(3) + ' (' + anillosVal + ' anillos medidos)');
ok(visibles === 0, 'y lo que el tap deja en el ala no llega a un nivel de 8 bits ' +
  'en ninguno de los ' + anillosVal + ' anillos (lo más, ' + peorPinta.toExponential(2) +
  ' del cielo, contra 1/255 = ' + TOL_PINTA.toExponential(2) + ')');
ok(peorTap <= TOL_TAP, 'y el tap se come el ' + (100 * (1 - peorTap)).toFixed(2) +
  ' % del flujo del ala (deja ' + peorTap.toExponential(2) + ')');

/* El mismo criterio, pero radio a radio sobre la tabla del render: dónde deja de
   verse el halo. Si el corte cayese más allá de 4·r_h el test de arriba sería
   verdad por poco y conviene verlo escrito. */
var rVis = 0;
for (var j = 1; j < m.tabla.r.length; j++) {
  if (m.tabla.I[j] / m.Fcielo >= m.Cmin) rVis = m.tabla.r[j];
}
ok(rVis < rAla, 'el último radio con contraste >= Cmin está en ' + rVis.toFixed(0) +
  '" = ' + (rVis / m.rhAs).toFixed(2) + '·r_h, dentro de 4·r_h');

console.log(fallos ? '\n' + fallos + ' FALLOS' : '\nE3 verde');
process.exit(fallos ? 1 : 0);
