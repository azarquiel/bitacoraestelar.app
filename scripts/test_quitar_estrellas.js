#!/usr/bin/env node
/* Test de regresión de la protección nuclear de ps1QuitarEstrellas
   (resources/js/bitacora-gaia-render.js).

   La regla, validada sobre M104, M51, M81, M101 y NGC 205 en
   scripts/harness_quitar_estrellas_general.js: con la geometría de la galaxia
   (`geo` = {afin, ba, pa}), una fuente de Gaia es NUCLEAR si su máscara cubre
   el centro (dist < rAs, todo en ″) y entonces NO se enmascara; el resto se
   elimina y se rellena por isofotas elípticas. Sin `geo`, el trato de siempre
   (sin protección, relleno plano). nucleoPx murió: aquí se vigila que no
   vuelva.

   Sin dependencias:  node scripts/test_quitar_estrellas.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function casi(actual, esperado, tol, etiqueta) {
  ok(Math.abs(actual - esperado) <= tol, etiqueta +
    ' (esperado ' + esperado + ' ±' + tol + ', obtenido ' + actual + ')');
}

/* Galaxia sintética: elipse suave (b/a=0,6, PA=30°) sobre cielo de 10 DN, con
   el brillo cayendo con el radio elíptico. El parche va norte-arriba (sin WCS),
   1″/px, con el núcleo en el centro. */
var N = 201, ESC = 1, CX = (N - 1) / 2, CY = (N - 1) / 2;
var BA = 0.6, PA = 30, paR = PA * Math.PI / 180;
function rElip(x, y) {
  var este = -(x - CX) * ESC, norte = (y - CY) * ESC;   // el afín por defecto: +norte = +y
  var u = este * Math.sin(paR) + norte * Math.cos(paR);
  var v = -este * Math.cos(paR) + norte * Math.sin(paR);
  return Math.hypot(u, v / BA);
}
var GAL = new Float32Array(N * N);
for (var y = 0; y < N; y++) for (var x = 0; x < N; x++)
  GAL[y * N + x] = 10 + 4000 * Math.exp(-rElip(x, y) / 15);

var gal = { ra: 10, dec: 0, ladoArcmin: N * ESC / 60, ba: BA, pa: PA };
var f = { ancho: N, alto: N, escalaAs: ESC };
var geo = { afin: R.ps1AfinParche(f, gal), ba: BA, pa: PA };

// Fuentes en píxeles, como las trae ps1EstrellasEnPixeles: la nuclear a 2″ del
// centro con máscara de 6″ (2 < 6: la máscara cubre el centro), una superpuesta
// a 10″ con máscara de 3″ (10 > 3: se elimina aunque esté cerca), y una tercera
// a 5″ con máscara de 3″ (5 > 3: NO nuclear, y su disco pisa el disco nuclear).
var NUC = { x: CX + 2, y: CY, rPx: 6, rAs: 6, g: 16 };
var SUP = { x: CX + 10, y: CY, rPx: 3, rAs: 3, g: 19 };
var CRUZA = { x: CX, y: CY + 5, rPx: 3, rAs: 3, g: 18.5 };

console.log('a) la fuente nuclear se protege POR FUENTE');
var soloNuc = R.ps1QuitarEstrellas(GAL, N, N, [NUC], geo);
var iguales = true;
for (var i = 0; i < GAL.length; i++) if (soloNuc[i] !== GAL[i]) { iguales = false; break; }
ok(iguales, 'con solo la fuente nuclear el parche sale intacto (disco entero conservado)');

console.log('b) la no nuclear se elimina aunque esté cerca del núcleo');
var out = R.ps1QuitarEstrellas(GAL, N, N, [NUC, SUP, CRUZA], geo);
var jSup = Math.round(SUP.y) * N + Math.round(SUP.x);
var jCruza = Math.round(CRUZA.y) * N + Math.round(CRUZA.x);
var jNuc = Math.round(NUC.y) * N + Math.round(NUC.x);
ok(out[jSup] !== GAL[jSup], 'la superpuesta a 10″ se enmascara y rellena');
ok(out[jCruza] !== GAL[jCruza],
  'la que atraviesa el disco nuclear también: la máscara de la estrella manda');
ok(out[jNuc] === GAL[jNuc], 'y el píxel de la fuente nuclear no se toca');
// El relleno es la isofota local: el valor repuesto queda al nivel de su radio
// elíptico, no al del anillo circular de fuera (eso era el hoyo del plano).
var esperado = 10 + 4000 * Math.exp(-rElip(SUP.x, SUP.y) / 15);
casi(out[jSup], esperado, esperado * 0.05, 'el relleno sigue la isofota elíptica local');

console.log('c) nucleoPx murió');
ok(R.ps1.nucleoPx === undefined, 'PS1.nucleoPx ya no existe');
// Sin `geo` no hay zona ciega: una estrella clavada en el centro se enmascara.
var sinGeo = R.ps1QuitarEstrellas(GAL, N, N, [{ x: CX, y: CY, rPx: 4, rAs: 4 }]);
var jC = Math.round(CY) * N + Math.round(CX);
ok(sinGeo[jC] !== GAL[jC], 'sin geo no hay protección: el centro se enmascara como todo lo demás');

console.log('d) los NaN originales de PS1 se conservan');
var CON_NAN = Float32Array.from(GAL);
var jLejos = 20 * N + 20, jBorde = 30 * N + 30;
CON_NAN[jLejos] = NaN; CON_NAN[jBorde] = NaN;
var outNaN = R.ps1QuitarEstrellas(CON_NAN, N, N, [NUC, SUP], geo);
ok(outNaN[jLejos] !== outNaN[jLejos] && outNaN[jBorde] !== outNaN[jBorde],
  'un NaN fuera de las máscaras sigue siendo NaN');
var cambiadosFuera = 0;
for (i = 0; i < GAL.length; i++) {
  var dSup = Math.hypot((i % N) - SUP.x, Math.floor(i / N) - SUP.y);
  if (dSup > SUP.rPx + 1 && i !== jLejos && i !== jBorde && outNaN[i] !== CON_NAN[i]) cambiadosFuera++;
}
ok(cambiadosFuera === 0, 'fuera de las máscaras eliminadas no cambia ni un píxel (' +
  cambiadosFuera + ')');

console.log(fallos ? '\n' + fallos + ' FALLOS' : '\ntodo ok');
process.exit(fallos ? 1 : 0);
