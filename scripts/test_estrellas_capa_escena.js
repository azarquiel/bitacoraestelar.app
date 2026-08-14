#!/usr/bin/env node
/* Test del propietario visual único de cada fuente Gaia
   (resources/js/bitacora-gaia-render.js).

   El contrato:
     FUENTE FUERA DE ESCENA  → se elimina del parche  → puede pintarla la capa
     FUENTE DENTRO DE ESCENA → se conserva en el parche → la capa NO la repinta

   La decisión geométrica es UNA: ps1FuenteEnEscena, la misma que usa
   ps1QuitarEstrellas. ps1FuentesEnEscena solo la aplica a las mismas
   posiciones enPx para decir qué filas de Gaia excluye la capa de estrellas
   (ps1CapaGalaxias reconstruye la capa sin ellas antes de repintar).

   Sin dependencias:  node scripts/test_estrellas_capa_escena.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

/* La misma galaxia sintética del test de ps1QuitarEstrellas: elipse suave
   b/a=0,6 PA=30° sobre cielo de 10 DN, parche norte-arriba de 1″/px. */
var N = 201, ESC = 1, CX = (N - 1) / 2, CY = (N - 1) / 2;
var BA = 0.6, PA = 30, paR = PA * Math.PI / 180;
function rElip(x, y) {
  var este = -(x - CX) * ESC, norte = (y - CY) * ESC;
  var u = este * Math.sin(paR) + norte * Math.cos(paR);
  var v = -este * Math.cos(paR) + norte * Math.sin(paR);
  return Math.hypot(u, v / BA);
}
var GAL = new Float32Array(N * N);
for (var y = 0; y < N; y++) for (var x = 0; x < N; x++)
  GAL[y * N + x] = 10 + 4000 * Math.exp(-rElip(x, y) / 15);

var gal = { ra: 10, dec: 0, ladoArcmin: N * ESC / 60, ba: BA, pa: PA };
var f = { ancho: N, alto: N, escalaAs: ESC };
var afin = R.ps1AfinParche(f, gal);
f.afin = afin;

/* Escena con compañera catalogada a 40″ al norte (el caso M51 + NGC 5195),
   construida por la vía de producción, sin condiciones por nombre. */
var campo = [
  { ra: gal.ra, dec: gal.dec, reArcsec: 12, ba: BA, pa: PA, magV: 9, n: 1, bt: 0.15 },
  { ra: gal.ra, dec: gal.dec + 40 / 3600, reArcsec: 6, ba: 0.8, pa: 79, magV: 10.5, n: 1, bt: 0.03 }
];
var escena = R.ps1EscenaEnParche(f, gal, campo);

// Fila Gaia en un punto del eje mayor a radio elíptico `d` (″); dec0=0.
function filaEje(d, g) {
  return [gal.ra - d * Math.sin(paR) / 3600, gal.dec + d * Math.cos(paR) / 3600, g];
}
var BRILLANTE = filaEje(20, 12);            // interior, muy por encima de mlim
var EXTERIOR = filaEje(-80, 13);            // fuera de las dos elipses (r25 máx 66,6″)
var NUC_COMP = [gal.ra, gal.dec + 40 / 3600, 15];   // núcleo de la compañera
var estrellas = [BRILLANTE, EXTERIOR, NUC_COMP];

var enPx = R.ps1EstrellasEnPixeles(f, gal, estrellas);
ok(enPx.length === 3, 'las tres fuentes caen en el parche (' + enPx.length + ')');
var dentro = R.ps1FuentesEnEscena(estrellas, enPx, afin, escena);
var limpio = R.ps1QuitarEstrellas(GAL, N, N, enPx, { afin: afin, ba: BA, pa: PA, escena: escena });
function pixelDe(fila) {
  for (var i = 0; i < enPx.length; i++) if (estrellas[enPx[i].i] === fila)
    return Math.round(enPx[i].y) * N + Math.round(enPx[i].x);
  return -1;
}

console.log('A) fuente exterior: fuera del parche, disponible para la capa');
ok(limpio[pixelDe(EXTERIOR)] !== GAL[pixelDe(EXTERIOR)], 'el parche la elimina y rellena');
ok(dentro.indexOf(EXTERIOR) === -1, 'no se excluye de la capa: la pinta el sprite de siempre');

console.log('B) fuente interior: en el parche, excluida de la capa');
ok(limpio[pixelDe(BRILLANTE)] === GAL[pixelDe(BRILLANTE)], 'el parche la conserva entera');
ok(dentro.indexOf(BRILLANTE) !== -1, 'la capa de estrellas la excluye: un solo propietario visual');

console.log('C) brillante interior: sin doble cuenta fotométrica');
/* Flujo por fila ∝ 10^(−0,4·g). Antes del arreglo la capa pintaba TODAS las
   filas (interiores incluidas) y el parche además conservaba las interiores:
   la luz interior contaba dos veces. Después, capa filtrada + conservadas en
   parche = total, sin solape ni pérdida. */
function flujo(filas) {
  var s = 0;
  for (var i = 0; i < filas.length; i++) s += Math.pow(10, -0.4 * filas[i][2]);
  return s;
}
var filtradas = estrellas.filter(function (fila) { return dentro.indexOf(fila) === -1; });
var antes = flujo(estrellas) + flujo(dentro);          // capa completa + conservadas
var despues = flujo(filtradas) + flujo(dentro);        // capa filtrada + conservadas
ok(Math.abs(despues - flujo(estrellas)) < 1e-12, 'capa filtrada + parche = flujo total, exacto');
ok(Math.abs((antes - despues) - flujo(dentro)) < 1e-12, 'lo que desaparece es la doble cuenta interior, nada más');
filtradas.forEach(function (fila) {
  ok(dentro.indexOf(fila) === -1, 'ninguna fila queda a la vez en capa y en parche');
});

console.log('D) núcleo de la compañera: conservado en parche y sin segunda representación');
ok(limpio[pixelDe(NUC_COMP)] === GAL[pixelDe(NUC_COMP)], 'su elipse lo protege en el parche');
ok(dentro.indexOf(NUC_COMP) !== -1, 'y la capa no lo repinta encima');

console.log('E) regresión: mismo veredicto que ps1QuitarEstrellas, y sin escena no se excluye nada');
for (var k = 0; k < enPx.length; k++) {
  var e = enPx[k];
  var v = R.ps1FuenteEnEscena(escena, afin, e.x, e.y);
  ok((dentro.indexOf(estrellas[e.i]) !== -1) === v,
    'fila ' + e.i + ': la capa y el parche comparten veredicto (' + (v ? 'dentro' : 'fuera') + ')');
}
ok(R.ps1FuentesEnEscena(estrellas, enPx, afin, []).length === 0, 'sin escena, la capa pinta todo');
ok(R.ps1FuentesEnEscena(estrellas, enPx, afin, null).length === 0, 'con escena nula, igual');

console.log(fallos ? '\n' + fallos + ' FALLOS' : '\ntodo ok');
process.exit(fallos ? 1 : 0);
