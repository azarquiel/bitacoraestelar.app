#!/usr/bin/env node
/* L2.3 / AC3 de #322: ¿coincide el flujo del objeto montado a la resolución de
   la fase 2 con el de la fase 1 (1024 px fijos) dentro de ±2e-3?

   Tres medidas, y la segunda es la que da sentido a la primera:

     1 · la razón de flujos, que es el listón tal cual está escrito. fitscut
         remuestrea conservando brillo superficial (flujo por ″²), así que el
         flujo total es media_de_los_finitos × Npx × escalaAs².
     2 · el CONTROL NULO: la misma razón entre 1024 y 1000 px, dos resoluciones
         que se diferencian un 2,4 %. Si el listón también se rompe ahí, no lo
         rompe la fase 2: lo rompe el remuestreo, y ninguna resolución nueva
         podría pasarlo. Sin este nulo la medida 1 no significa nada.
     3 · el mismo desplazamiento en unidades de ruido —σ del cielo por píxel y
         σ de la media— que es lo que dice si la diferencia se ve o vive por
         debajo del grano.

   Ninguna ley se reimplementa (ADR 0008): los parches salen de lib_bajar_parche
   y el cielo y su σ de ps1Cielo/ps1SigmaCielo, las de producción.

   Uso:  node scripts/harness_l23_flujo_resolucion.js
         node scripts/harness_l23_flujo_resolucion.js --nulo     (solo el nulo)
         node scripts/harness_l23_flujo_resolucion.js --n 6      (primeros N) */
'use strict';

var path = require('path');
var RAIZ = path.join(__dirname, '..');
global.window = global.window || {};
require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-ps1.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'nebulosas-datos.js'));

var PS1 = window.BitacoraPS1, CFG = PS1.cfg;
var B = require('./lib_bajar_parche.js')(window.BitacoraGaiaRender);
var BANCO = require('./lib_banco_dso.js')(window.BitacoraGaiaRender);

var LISTON = 2e-3, NULO_PX = 1000;
function arg(n, d) { var i = process.argv.indexOf(n); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; }
var SOLO_NULO = process.argv.indexOf('--nulo') > 0;
var N = parseInt(arg('--n', '0'), 10);

function medir(F) {
  var d = F.datos, n = 0, s = 0, i;
  for (i = 0; i < d.length; i++) { var v = d[i]; if (v === v) { n++; s += v; } }
  var cielo = PS1.ps1Cielo(d, F.ancho, F.alto);
  return { media: s / n, n: n, escala: F.escalaAs,
           cielo: cielo, sigma: PS1.ps1SigmaCielo(d, F.ancho, F.alto, cielo) };
}
function flujo(m) { return m.media * m.n * m.escala * m.escala; }

var objs = BANCO.banco().objetos.filter(function (o) { return o.gal; });
if (N) objs = objs.slice(0, N);
var filas = [];

objs.reduce(function (cadena, o, i) {
  return cadena.then(function () {
    var g = o.gal, px2 = SOLO_NULO ? NULO_PX : PS1.ps1SalidaParche(g.ladoArcmin);
    return B.bajar(g.ra, g.dec, g.ladoArcmin, CFG.salida).then(function (A) {
      return B.bajar(g.ra, g.dec, g.ladoArcmin, px2).then(function (Z) {
        var a = medir(A), z = medir(Z), r = flujo(z) / flujo(a);
        var dSigma = Math.abs(z.media - a.media) / a.sigma;
        filas.push({ n: o.nombre, px: px2, r: r, s: dSigma,
                     sm: Math.abs(z.media - a.media) / (a.sigma / Math.sqrt(a.n)) });
        console.log((Math.abs(r - 1) > LISTON ? 'MAL ' : 'ok  ') + '[' + (i + 1) + '/' + objs.length + '] ' +
          o.nombre + '  ' + CFG.salida + '→' + px2 + ' px  flujo ' + r.toFixed(5) +
          '  ·  ' + dSigma.toExponential(2) + ' σ/px');
      });
    }).catch(function (e) { console.log('FALLO ' + o.nombre + ': ' + (e && e.message || e)); });
  });
}, Promise.resolve()).then(function () {
  var rs = filas.map(function (f) { return Math.abs(f.r - 1); }).sort(function (a, b) { return a - b; });
  var ss = filas.map(function (f) { return f.s; }).sort(function (a, b) { return a - b; });
  var sms = filas.map(function (f) { return f.sm; }).sort(function (a, b) { return a - b; });
  var fuera = filas.filter(function (f) { return Math.abs(f.r - 1) > LISTON; }).length;
  console.log('\n' + (SOLO_NULO ? 'CONTROL NULO (' + CFG.salida + ' vs ' + NULO_PX + ' px)' : 'L2.3 / AC3') +
    ' sobre ' + filas.length + ' objetos, listón ±' + LISTON);
  console.log('  |Δflujo|      mediana ' + rs[rs.length >> 1].toExponential(2) + '  ·  peor ' + rs[rs.length - 1].toExponential(2));
  console.log('  en σ/px       mediana ' + ss[ss.length >> 1].toExponential(2) + '  ·  peor ' + ss[ss.length - 1].toExponential(2));
  console.log('  en σ de la media  mediana ' + sms[sms.length >> 1].toFixed(1) + '  ·  peor ' + sms[sms.length - 1].toFixed(1));
  console.log('  fuera del listón: ' + fuera + ' de ' + filas.length);
});
