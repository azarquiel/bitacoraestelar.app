#!/usr/bin/env node
/* Apertura de la clase SNR en la capa difusa PS1 (ADR 0013). Banco: M1
   (NGC 1952, el Cangrejo), único resto viable al norte de −30° que cabe.

   Qué fija:
   - SNR es COMPACTA como la planetaria (gen_nebulosas.py: r_e = 0,60·semieje,
     suelo de μ propio): su borde es real —la cáscara del resto— y escena y
     θint lo usan, no la isofota del ala;
   - pero compacta NO exime de la puerta de tamaño: los segmentos del Velo
     (NGC 6960/6992/6995) llegan recortados (6·r_e de 22′ a 330′ contra el
     tope de 20′) y anclarían su mag 6,7 a un recorte que no contiene el
     objeto — la enfermedad de NGC 7000. Fuera los cuatro, igual que IC 443;
   - M1 recorre el mismo pipeline con la fotometría anclada.

   Necesita fixtures de scripts/fixtures/gaia y la caché de lib_bajar_parche.
   Uso:  node scripts/test_resto_supernova.js */
'use strict';

var fs = require('fs'), path = require('path');
var RAIZ = path.join(__dirname, '..');
global.window = {};
require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-ps1.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'nebulosas-datos.js'));
var R = global.window.BitacoraGaiaRender, PS1 = window.BitacoraPS1.cfg;
var GAL = global.window.BITACORA_GALAXIAS, NEB = global.window.BITACORA_NEBULOSAS;
var B = require('./lib_bajar_parche.js')(R);
var P = require('./lib_parche_produccion.js')(R);

var fallos = 0;
function ok(c, t) { console.log('  ' + (c ? 'ok  ' : 'FALLO') + '  ' + t); if (!c) fallos++; }
function fila(arr, n) { for (var i = 0; i < arr.length; i++) if (arr[i][0] === n) return arr[i]; return null; }

console.log('La clase SNR entra por la puerta del catálogo:');
var cat = window.BitacoraPS1.ps1CatalogoDifuso(GAL, NEB);
ok(!!fila(cat, 'NGC1952'), 'M1 (el Cangrejo) entra');

console.log('Compacta no exime de la puerta de tamaño (lección del Velo):');
['NGC6960', 'NGC6992', 'NGC6995', 'IC0443'].forEach(function (n) {
  ok(window.BitacoraPS1.ps1CabeEnParche(fila(NEB, n)) === false, n + ' (recortado) queda fuera');
});
ok(window.BitacoraPS1.ps1CabeEnParche(fila(NEB, 'NGC1952')) === true, 'M1 (10,2′ sin recorte) cabe');
ok(window.BitacoraPS1.ps1CabeEnParche(fila(NEB, 'NGC6720')) === true, 'las planetarias siguen intactas');

console.log('El borde del resto es real, como el de la planetaria:');
var f1 = fila(NEB, 'NGC1952');
var campo = window.BitacoraPS1.ps1GalaxiasDelCampo(cat, f1[2], f1[3], 20);
var m1 = null;
for (var i = 0; i < campo.length; i++) if (campo[i].nombre === 'NGC1952') m1 = campo[i];
ok(!!m1 && m1.clase === 'SNR', 'la fila mapeada lleva su clase (SNR)');
var bordeAs = f1[4] / 0.60;
ok(m1 && Math.abs(window.BitacoraPS1.ps1RadioBordeAs(m1) - bordeAs) < 0.01,
  'ps1RadioBordeAs = semieje de catálogo (' + (m1 && window.BitacoraPS1.ps1RadioBordeAs(m1).toFixed(1)) + '″ ≈ ' +
  bordeAs.toFixed(1) + '″)');

if (!m1) { console.log('\nsin fila no hay parche: ' + fallos + ' fallos'); process.exit(1); }

console.log('M1 recorre el mismo pipeline (parche real):');
var estrellas = fs.readFileSync(path.join(__dirname, 'fixtures', 'gaia', 'gaia_ngc1952.csv'), 'utf8')
  .trim().split('\n').slice(1)
  .map(function (l) { var t = l.split(','); return [parseFloat(t[0]), parseFloat(t[1]), parseFloat(t[2])]; });

B.bajar(m1.ra, m1.dec, m1.ladoArcmin, PS1.salida).then(function (F) {
  var parche = P.montar(F, m1, estrellas, cat);
  ok(parche.escena.length === 1 && Math.abs(parche.escena[0].r25As - bordeAs) < 0.5,
    'la escena es el borde real (' + parche.escena[0].r25As.toFixed(1) + '″), no la isofota del ala');
  ok(Math.abs(parche.thetaIntArcmin - (2 * bordeAs / 60) * Math.sqrt(m1.ba > 0 && m1.ba <= 1 ? m1.ba : 1)) < 0.02,
    'θ intrínseco del borde: ' + parche.thetaIntArcmin.toFixed(2) + '′');
  var suma = 0;
  for (var k = 0; k < parche.datos.length; k++) { var v = parche.datos[k]; if (v === v) suma += v; }
  var areaPx = (m1.ladoArcmin * 60 / parche.ancho); areaPx *= areaPx;
  var frac = Math.max(window.BitacoraPS1.ps1FraccionLuz(m1.n, (m1.ladoArcmin * 60 / 2) / m1.reArcsec), 0.02);
  var magEsperada = m1.magV - 2.5 * Math.log10(frac);
  var magInt = -2.5 * Math.log10(suma * areaPx);
  ok(suma > 0 && Math.abs(magInt - magEsperada) < 0.3,
    'la luz integrada devuelve la mag V con su fracción (' + magInt.toFixed(2) + ' vs ' + magEsperada.toFixed(2) + ')');
  var cielo = { pupilaSalida: 457.2 / 190, pupilaOjo: 7, sqm: 21.2,
                aumentos: 190, realceMax: PS1.realceMax, perceptual: true };
  var o = { ra0: m1.ra, dec0: m1.dec, arcmin: 70 / 190 * 60, size: 720, cielo: cielo, apertura: 457.2 };
  var difuso = new Float32Array(720 * 720);
  window.BitacoraPS1.ps1PintarParche(difuso, parche, o);
  var enc = 0, nanD = 0;
  for (var p = 0; p < difuso.length; p++) { if (difuso[p] > 0) enc++; if (difuso[p] !== difuso[p]) nanD++; }
  ok(enc > 500, 'hay resto en el lienzo (' + enc + ' px)');
  ok(nanD === 0, 'ningún NaN llega al lienzo');

  console.log('\n' + (fallos ? 'FALLOS: ' + fallos : 'todo en orden.'));
  process.exit(fallos ? 1 : 0);
}).catch(function (e) { console.error('ERROR: ' + (e && e.stack || e)); process.exit(2); });
