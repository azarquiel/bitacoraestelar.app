#!/usr/bin/env node
/* E4 · Los anillos concéntricos de 47 Tuc (D3).

   La causa que señaló E0: `S1(m_lim)` y `S2(m_lim)` son sumas de cola sobre los
   bins de la LF y devuelven el bin ENTERO, así que son funciones escalón de
   m_lim. `m_res(r)` sí varía de forma continua con el radio —`m_crowd` interpola
   dentro del bin justo por esto (invariante 7)—, pero al entrar en S1 el
   resultado salta de bin en bin: ⟨I⟩(r) = Σ(r)·S1(m_res(r)+δ) hereda un escalón
   de un bin de LF (0,25 mag) cada vez que m_res cruza un borde, y cada escalón
   es un anillo concéntrico. Σ(r) es lisa por construcción, así que todo codo
   que aparezca en ⟨I⟩ y no en Σ lo mete la fotometría.

   Los tests miden la parte fotométrica AISLADA, μ_I − μ_Σ = −2,5·log10(S1),
   para no confundir el escalón con la pendiente del perfil:

     1. S1 y S2 continuas en m_lim: barrido fino de magnitud.
     2. Sin escalones radiales en la tabla del render, en los tres cúmulos.
     3. La corrección no mueve la fotometría: el flujo total de S1 sobre todo
        el rango de la LF y S1 en los bordes de bin siguen valiendo lo mismo.

   node scripts/test_halo_v7_e4.js */
'use strict';

global.window = {};
global.document = undefined;
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/lf-globulares-datos.js');
require('../simulador_ocular/resources/js/globulares-datos.js');
require('../resources/js/bitacora-cumulos.js');
var H = require('./harness_halo_v7.js');
var C = global.window.BitacoraCumulos;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

var REFS = ['NGC 104', 'NGC 6205', 'NGC 5139'];

/* ── E4.1 · S1 y S2 continuas en m_lim ────────────────────────────────────── */

console.log('\nE4.1 · S1(m) y S2(m) continuas en los bordes de bin de la LF');

/* Un escalón no es una pendiente. Lo que hay que cazar es el salto que la cola
   da SIN que el límite se haya movido lo suficiente para justificarlo, así que
   el listón es el cociente |Δ(−2,5·log10 S)| / Δm: cuánto flujo de cola aporta
   cada magnitud de límite. La LF no da más de ~1 mag por mag (medido: 0,84 en
   el peor nodo de los tres cúmulos), y un escalón de bin lo dispara a 40 con
   este paso de barrido. 1,5 es holgado por arriba y sobra por abajo.

   Aquí la continuidad se mide DONDE ESTABA EL ESCALÓN: a los dos lados de cada
   borde de bin, con un epsilon minúsculo. Un salto relativo del tamaño del bin
   (0,10-0,20 en flujo, medido) es un anillo; la cola interpolada tiene que dar
   el epsilon y nada más. Es exacto y no depende del régimen: en el extremo
   débil la derivada logarítmica se dispara sola porque la cola se va a cero, y
   un barrido en magnitudes confundiría eso con una discontinuidad.

   El cociente se toma sobre la cola misma —no en magnitudes— para que valga
   igual en la parte brillante que en la cola fina, y se exige que quede por
   debajo de 1e-4: seis órdenes por encima del epsilon y tres por debajo del
   escalón que se venía a arreglar. */
var EPS = 1e-6, TOL_SALTO = 1e-4, MIN_COLA = 1e-6;

REFS.forEach(function (id) {
  var pob = C.poblacionCacheada(H.cumulo(id), 0);
  var mags = pob.magnitudes, paso = mags[1] - mags[0];
  var total = pob.S1(mags[0] - 1), total2 = pob.S2(mags[0] - 1);
  var peor1 = 0, peor2 = 0, donde = 0, bordes = 0;
  for (var i = 0; i < mags.length; i++) {
    [mags[i] - paso / 2, mags[i], mags[i] + paso / 2].forEach(function (b) {
      var a1 = pob.S1(b - EPS), b1 = pob.S1(b + EPS);
      var a2 = pob.S2(b - EPS), b2 = pob.S2(b + EPS);
      bordes++;
      if (a1 > MIN_COLA * total) {
        var d1 = Math.abs(b1 - a1) / a1;
        if (d1 > peor1) { peor1 = d1; donde = b; }
      }
      if (a2 > MIN_COLA * total2) {
        var d2 = Math.abs(b2 - a2) / a2;
        if (d2 > peor2) peor2 = d2;
      }
    });
  }
  ok(peor1 < TOL_SALTO && peor2 < TOL_SALTO,
    id + ': en ' + bordes + ' bordes y centros de bin, mayor salto relativo — S1 ' +
    peor1.toExponential(2) + ' (en m = ' + donde.toFixed(3) + '), S2 ' +
    peor2.toExponential(2));
});

/* ── E4.2 · Sin escalones radiales en ⟨I⟩(r) ──────────────────────────────── */

console.log('\nE4.2 · la parte fotométrica de μ(r), −2,5·log10(S1(m_res+δ)), sin escalones radiales');

/* Mismo listón que en E4.1, ahora radio a radio sobre la tabla que usa el
   render: lo que se mide es cuánto salta S1 por cada magnitud que se mueve
   m_res entre dos nodos vecinos. Un anillo es un salto sin causa; una pendiente
   es la LF haciendo su trabajo. La LF no da más de ~1 mag de cola por mag de
   límite (medido: 0,84 en el peor nodo de los tres cúmulos); con la cola
   escalonada el mismo cociente se iba a 4,3. 1,5 separa los dos casos. */
var TOL_Q = 1.5;

REFS.forEach(function (id) {
  // 300× es la intermedia: entre los dos extremos, m_res(r) barre los bordes de
  // bin de la LF a un paso distinto, que es justo donde nacían los anillos.
  [146, 300, 514].forEach(function (MAG) {
    var m = H.medir(H.cumulo(id), { D: 200, MAG: MAG, sqm: 21.5, realization: 0 });
    var t = m.tabla, peor = 0, peorR = 0, peorD = 0, nodos = 0;
    for (var i = 1; i < t.r.length; i++) {
      // Los últimos nodos rozan r_t, donde el truncamiento de King lleva Σ a
      // cero: ahí el cociente I/Σ es 0/0 numérico y no dice nada de S1.
      if (t.r[i] > 0.98 * m.rtAs) break;
      var s0 = m.sigmaEn(t.r[i - 1]), s1 = m.sigmaEn(t.r[i]);
      if (!(t.I[i] > 0) || !(t.I[i - 1] > 0) || !(s0 > 0) || !(s1 > 0)) continue;
      nodos++;
      var d = Math.abs(-2.5 * Math.log10((t.I[i] / s1) / (t.I[i - 1] / s0)));
      var dm = Math.abs(t.mRes[i] - t.mRes[i - 1]);
      var q = d / Math.max(dm, 1e-6);
      if (q > peor) { peor = q; peorR = t.r[i]; peorD = d; }
    }
    ok(nodos > 100 && peor < TOL_Q,
      id + ' ' + MAG + 'x: mayor cociente entre nodos ' + peor.toFixed(3) +
      ' (salto de ' + peorD.toFixed(4) + ' mag en r = ' + peorR.toFixed(1) +
      '", ' + nodos + ' nodos de ' + t.paso.toFixed(2) + '")');
  });
});

/* Y la comparación directa contra lo que había: el test reconstruye la cola
   ESCALONADA —la de antes, que devolvía el bin entero— y mide las dos con la
   misma m_res(r). El cociente de los peores saltos es la mejora, y así el
   guardián no depende de acordarse de cómo era el código viejo. */
console.log('\nE4.2b · la cola interpolada contra la escalonada, con la misma m_res(r)');

REFS.forEach(function (id) {
  var m = H.medir(H.cumulo(id), { D: 200, MAG: 146, sqm: 21.5, realization: 0 });
  var pob = C.poblacionCacheada(H.cumulo(id), 0);
  var mags = pob.magnitudes, paso = mags[1] - mags[0], n = mags.length;
  var colaBin = new Float64Array(n + 1);
  for (var i = n - 1; i >= 0; i--) {
    colaBin[i] = colaBin[i + 1] + pob.estrellasPorBin[i] * Math.pow(10, -0.4 * mags[i]);
  }
  function S1Escalon(mlim) {                     // primer bin con centro > mlim
    var j = Math.ceil((mlim - mags[0]) / paso);
    return colaBin[Math.max(0, Math.min(n, j))];
  }
  var peorInt = 0, peorEsc = 0;
  for (var k = 1; k < m.tabla.r.length; k++) {
    if (m.tabla.r[k] > 0.98 * m.rtAs) break;
    var a = m.tabla.mRes[k - 1] + m.delta, b = m.tabla.mRes[k] + m.delta;
    if (!isFinite(a) || !isFinite(b) || !(pob.S1(a) > 0) || !(pob.S1(b) > 0)) continue;
    var dInt = Math.abs(-2.5 * Math.log10(pob.S1(b) / pob.S1(a)));
    var dEsc = Math.abs(-2.5 * Math.log10(S1Escalon(b) / S1Escalon(a)));
    if (dInt > peorInt) peorInt = dInt;
    if (dEsc > peorEsc) peorEsc = dEsc;
  }
  ok(peorEsc > 0.15 && peorInt < peorEsc / 4,
    id + ': peor salto radial ' + peorInt.toFixed(4) + ' mag interpolada contra ' +
    peorEsc.toFixed(4) + ' escalonada (×' + (peorEsc / peorInt).toFixed(1) + ' mejor)');
});

/* ── E4.3 · La corrección no cambia la fotometría ─────────────────────────── */

console.log('\nE4.3 · la interpolación no mueve el flujo: sigue siendo la misma cola');

REFS.forEach(function (id) {
  var pob = C.poblacionCacheada(H.cumulo(id), 0);
  var mags = pob.magnitudes, paso = mags[1] - mags[0];
  /* En el borde DÉBIL de cada bin (m = centro + paso/2) la cola interpolada
     tiene que valer exactamente la suma de bins enteros: ahí no hay bin
     partido. Si la interpolación se hubiera comido o duplicado medio bin, este
     es el sitio donde se ve. */
  var suma1 = 0, suma2 = 0, peor = 0;
  for (var i = mags.length - 1; i >= 0; i--) {
    var f = Math.pow(10, -0.4 * mags[i]);
    suma1 += pob.estrellasPorBin[i] * f;
    suma2 += pob.estrellasPorBin[i] * f * f;
    var borde = mags[i] - paso / 2;   // más débil que este límite: bins i..n-1
    var e1 = Math.abs(pob.S1(borde) / suma1 - 1);
    var e2 = Math.abs(pob.S2(borde) / suma2 - 1);
    if (e1 > peor) peor = e1;
    if (e2 > peor) peor = e2;
  }
  // Y por debajo del bin más brillante, S1 tiene que ser el flujo total.
  var todo = Math.abs(pob.S1(mags[0] - paso) / suma1 - 1);
  ok(peor < 1e-9 && todo < 1e-9,
    id + ': en los ' + mags.length + ' bordes de bin la cola coincide con la suma ' +
    'exacta (peor desvío ' + peor.toExponential(1) + '), y S1 completa ' +
    todo.toExponential(1));
});

console.log(fallos ? '\n' + fallos + ' FALLOS' : '\nE4 verde');
process.exit(fallos ? 1 : 0);
