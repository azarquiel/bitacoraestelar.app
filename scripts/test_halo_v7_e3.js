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
        Trager, King & Djorgovski 1995 (docs/halo_v7/trager1995.tsv), en la
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

REFS.forEach(function (id) {
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

/* ── E3.2 · mu_V(r) contra Trager, King & Djorgovski 1995 ─────────────────── */

console.log('\nE3.2 · mu_V(r) del perfil implementado contra Trager+1995 (0,5·r_c a 3·r_c)');

var TSV = path.join(__dirname, '..', 'docs', 'halo_v7', 'trager1995.tsv');
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
