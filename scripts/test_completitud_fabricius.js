#!/usr/bin/env node
/* #595 · La completitud de Gaia en el núcleo sale de una medida externa.

   Medida: Fabricius et al. 2021 (A&A 649, A5), Tabla A.1. Completitud de
   Gaia EDR3 contra HST/ACS (Sarajedini et al. 2007) en 26 globulares, por
   bin de G de 2 mag, en el núcleo (r < 0,5′) y fuera (0,5′-2,2′). Copia en
   simulador_ocular/docs/validacion/fabricius2021_tabla_a1.csv.

   Por la interfaz pública (pob.completitud):
     A  SESGO del conjunto SIN M13 (c_modelo − c_Fabricius, puntos %) dentro
        de ±3. M13 fuera: es el cúmulo del fixture que mide el arnés (#595 AC1).
        A es DENTRO de muestra (k se eligió sobre estas celdas): guarda que
        nadie mueva k sin volver a la tabla, no valida. Valida B.
        Caso malo de referencia (AGENTS.md, prerregistros): el k = 30 de antes
        da +10,2 y el listón lo rechaza.
     B  M13, que no entra en el ajuste: rms ≤ 10 puntos contra su fila de la
        tabla. k = 30 da 19,8 y el listón lo rechaza.

   El modelo se promedia como mide la tabla: campo ACS de 202″ centrado,
   pesos Σ(r)·num(m), G del color sintético del bin (el de `completitud`).

   node scripts/test_completitud_fabricius.js */
'use strict';

global.window = {};
global.document = undefined;
var fs = require('fs'), path = require('path');
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/lf-globulares-datos.js');
require('../simulador_ocular/resources/js/globulares-datos.js');
require('../resources/js/bitacora-cumulos.js');
var R = global.window.BitacoraGaiaRender, C = global.window.BitacoraCumulos;

var fallos = 0;
function ok(cond, msg) {
  if (cond) console.log('  ok   ' + msg);
  else { fallos++; console.error('  FALLA ' + msg); }
}

var tabla = {};
fs.readFileSync(path.join(__dirname, '../simulador_ocular/docs/validacion/fabricius2021_tabla_a1.csv'), 'utf8')
  .trim().split('\n').slice(1).forEach(function (l) {
    var c = l.split(',');
    (tabla[c[0]] = tabla[c[0]] || {})[c[1]] = c.slice(2).map(function (x) { return x === '' ? null : +x; });
  });
function nombre(n) {
  var m = n.match(/^NGC0*(\d+)$/);
  return m ? 'NGC ' + m[1] : n.replace(/^PAL0*/, 'Pal ');
}
var LADO = 202, H = 4, REGIONES = { core: [0, 30], out: [30, 132] }, G0 = 11, NB = 10;

function bprp(Mv) { return Mv < 0 ? C.config.bprpGigante : Mv < 3.5 ? C.config.bprpSubgigante : C.config.bprpSecuencia; }
/* La copia de `bprp` no puede derivar de la de producción: con G_c = G del
   test, `completitud(m, r, G_c)` vale la mitad de `completitud(m, r)` en cada
   bin (#594). Si producción mueve un tramo, esto falla. */
(function () {
  var pob = C.poblacion(C.fichaDeFila(global.window.BITACORA_GLOBULARES.filter(function (x) { return x[0] === 'NGC 6205'; })[0]));
  var malos = 0;
  Array.prototype.forEach.call(pob.magnitudes, function (m) {
    var c = pob.completitud(m, 600);
    if (c > 1e-6 && Math.abs(pob.completitud(m, 600, m + R.gMenosV(bprp(m - pob.dm))) / c - 0.5) > 1e-9) malos++;
  });
  ok(malos === 0, 'el G por bin del test es el de producción (' + malos + ' bins distintos)');
})();

// Diferencias modelo − tabla (puntos %) de un cúmulo, con el CFG del momento.
function diferencias(t) {
  var fila = t.fila;
  var pob = C.poblacion(C.fichaDeFila(fila));
  var mAp = pob.magnitudes, nb = pob.estrellasPorBin, dm = pob.dm, d = [];
  var bin = Array.prototype.map.call(mAp, function (m) {
    return Math.floor(m + R.gMenosV(bprp(m - dm)) - G0);   // bin de 2 mag empieza en G0 + b
  });
  Object.keys(REGIONES).forEach(function (reg) {
    var lim = REGIONES[reg], sn = new Float64Array(NB), sc = new Float64Array(NB);
    for (var x = -LADO / 2 + H / 2; x < LADO / 2; x += H) for (var y = -LADO / 2 + H / 2; y < LADO / 2; y += H) {
      var r = Math.hypot(x, y);
      if (r < lim[0] || r >= lim[1]) continue;
      var s = pob.sigma(r);
      for (var i = 0; i < mAp.length; i++) {
        var c = null;
        for (var b = Math.max(0, bin[i] - 1); b <= bin[i] && b < NB; b++) {   // los bins se solapan
          if (c === null) c = pob.completitud(mAp[i], r);
          sn[b] += s * nb[i]; sc[b] += s * nb[i] * c;
        }
      }
    }
    tabla[t.n][reg].forEach(function (o, b) {
      if (o != null && sn[b] > 0) d.push(100 * sc[b] / sn[b] - o);
    });
  });
  return d;
}
var filas = Object.keys(tabla).map(function (n) {
  var f = global.window.BITACORA_GLOBULARES.filter(function (x) { return x[0] === nombre(n); })[0];
  return f && { fila: f, n: n };
}).filter(Boolean);
function media(d) { return d.reduce(function (a, x) { return a + x; }, 0) / d.length; }
function rms(d) { return Math.sqrt(media(d.map(function (x) { return x * x; }))); }
function mide(k) {
  var guardado = C.config.gaiaCrowdingK;
  C.config.gaiaCrowdingK = k;
  try {
    var resto = [], m13 = null;
    filas.forEach(function (f) {
      var d = diferencias(f);
      if (f.n === 'NGC6205') m13 = d; else resto = resto.concat(d);
    });
    return { sesgo: media(resto), m13: rms(m13), n: resto.length };
  } finally { C.config.gaiaCrowdingK = guardado; }
}

ok(filas.length === 25, 'filas de la tabla con cúmulo en el catálogo: ' + filas.length + ' (Lynga 7 no está)');
var hoy = mide(C.config.gaiaCrowdingK), malo = mide(30);
console.log('A  sesgo del conjunto sin M13 (' + hoy.n + ' celdas)');
ok(Math.abs(hoy.sesgo) <= 3, 'k = ' + C.config.gaiaCrowdingK + ': sesgo ' + hoy.sesgo.toFixed(2) + ' puntos (|·| ≤ 3)');
ok(Math.abs(malo.sesgo) > 3, 'caso malo k = 30: sesgo ' + malo.sesgo.toFixed(2) + ', el listón lo rechaza');
console.log('B  M13, fuera del ajuste');
ok(hoy.m13 <= 10, 'k = ' + C.config.gaiaCrowdingK + ': rms ' + hoy.m13.toFixed(1) + ' puntos (≤ 10)');
ok(malo.m13 > 10, 'caso malo k = 30: rms ' + malo.m13.toFixed(1) + ', el listón lo rechaza');

if (fallos) { console.error('\n' + fallos + ' fallo(s)'); process.exit(1); }
console.log('\ntodo ok');
