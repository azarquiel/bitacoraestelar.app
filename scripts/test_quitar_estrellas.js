#!/usr/bin/env node
/* Test de regresión de la protección de escena de ps1QuitarEstrellas
   (resources/js/bitacora-gaia-render.js).

   La regla: solo se elimina lo que queda FUERA de la escena difusa que se está
   reproduciendo. `geo.escena` es la unión de elipses isofotales (μ=muEscena)
   de los componentes catalogados del parche (ps1EscenaEnParche), y una fuente
   de Gaia proyectada dentro de cualquiera de ellas se conserva entera; el
   resto se elimina y se rellena por isofotas elípticas, como siempre.

   La protección nuclear por fuente (dist < rAs) de la versión anterior murió
   como regla aparte: era el caso trivial de «el núcleo está dentro de su
   propia elipse», y como excepción independiente dejaba el núcleo de una
   compañera catalogada (NGC 5195 sobre el parche de M51) convertido en un
   punto negro. Aquí se vigila que la compañera quede protegida por SU elipse,
   sin condiciones por nombre de objeto. Sin `geo`, el trato de siempre
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
var afin = R.ps1AfinParche(f, gal);

/* Escena de un componente: la elipse de la propia galaxia, r25 = 40″. La misma
   convención que ps1EscenaEnParche: cos/sin del PA, b/a, radio isofotal en ″. */
var R25 = 40;
var COMP = { cx: CX, cy: CY, cos: Math.cos(paR), sin: Math.sin(paR), ba: BA, r25As: R25 };
var geo = { afin: afin, ba: BA, pa: PA, escena: [COMP] };

// Punto del parche a radio elíptico `d` (″) sobre el EJE MAYOR de la elipse:
// ahí el radio elíptico es exactamente la distancia recorrida.
function sobreEjeMayor(d) {
  var este = d * Math.sin(paR), norte = d * Math.cos(paR);
  return { x: CX - este / ESC, y: CY + norte / ESC };
}

console.log('A) fuente fuera de la escena: se elimina y se rellena');
// Por el lado SUR del eje mayor: el norte lo ocupará la compañera del caso C,
// y este punto tiene que quedar fuera de las DOS elipses.
var pFuera = sobreEjeMayor(-60);
var FUERA = { x: pFuera.x, y: pFuera.y, rPx: 3, rAs: 3, g: 19 };
var outA = R.ps1QuitarEstrellas(GAL, N, N, [FUERA], geo);
var jFuera = Math.round(FUERA.y) * N + Math.round(FUERA.x);
ok(outA[jFuera] !== GAL[jFuera], 'a 60″ (r25=40″) la fuente se enmascara y rellena');

console.log('B) fuente dentro de la escena: se conserva entera');
var pDentro = sobreEjeMayor(20);
var DENTRO = { x: pDentro.x, y: pDentro.y, rPx: 3, rAs: 3, g: 18 };
var outB = R.ps1QuitarEstrellas(GAL, N, N, [DENTRO], geo);
var iguales = true;
for (var i = 0; i < GAL.length; i++) if (outB[i] !== GAL[i]) { iguales = false; break; }
ok(iguales, 'a 20″ el parche sale intacto: la estrella proyectada dentro no se toca');
// El núcleo es el caso trivial de la misma regla: radio elíptico ~0.
var NUC = { x: CX + 2, y: CY, rPx: 6, rAs: 6, g: 16 };
var outNuc = R.ps1QuitarEstrellas(GAL, N, N, [NUC], geo);
var jNuc = Math.round(NUC.y) * N + Math.round(NUC.x);
ok(outNuc[jNuc] === GAL[jNuc], 'el núcleo se conserva por estar dentro, no por regla nuclear aparte');

console.log('C) núcleo de un componente secundario: lo protege SU elipse');
/* Compañera catalogada a 40″ al norte del centro, como NGC 5195 sobre el
   parche de M51: la escena sale de ps1EscenaEnParche con las DOS filas, sin
   ninguna condición por nombre. */
var campo = [
  { ra: gal.ra, dec: gal.dec, reArcsec: 12, ba: BA, pa: PA, magV: 9, n: 1, bt: 0.15 },
  { ra: gal.ra, dec: gal.dec + 40 / 3600, reArcsec: 6, ba: 0.8, pa: 79, magV: 10.5, n: 1, bt: 0.03 }
];
f.afin = afin;
var escena = R.ps1EscenaEnParche(f, gal, campo);
ok(escena.length === 2, 'la escena tiene los dos componentes (' + escena.length + ')');
casi(escena[1].cy, CY + 40, 0.5, 'la compañera cae donde le toca en el parche');
ok(escena[1].r25As > 0, 'la compañera trae su radio isofotal (' + escena[1].r25As.toFixed(1) + '″)');
var geoDoble = { afin: afin, ba: BA, pa: PA, escena: escena };
var NUC2 = { x: escena[1].cx, y: escena[1].cy, rPx: 5, rAs: 5, g: 15 };
var outC = R.ps1QuitarEstrellas(GAL, N, N, [NUC2], geoDoble);
var jNuc2 = Math.round(NUC2.y) * N + Math.round(NUC2.x);
ok(outC[jNuc2] === GAL[jNuc2], 'el núcleo de la compañera no se convierte en un punto negro');
// Y una fuente fuera de las dos elipses se sigue eliminando (la del catálogo
// de este caso llega a r25=66,6″: hay que salirse de ELLA, no de la de 40″).
var pFueraC = sobreEjeMayor(-80);
var FUERA_C = { x: pFueraC.x, y: pFueraC.y, rPx: 3, rAs: 3, g: 19 };
var outC2 = R.ps1QuitarEstrellas(GAL, N, N, [FUERA_C], geoDoble);
var jFueraC = Math.round(FUERA_C.y) * N + Math.round(FUERA_C.x);
ok(outC2[jFueraC] !== GAL[jFueraC], 'con dos componentes, lo de fuera de ambos se elimina igual');

console.log('D) borde de la escena: decisión determinista, sin franja ambigua');
/* El borde es un filo, no una franja: a una micra de arco a cada lado el
   veredicto ya es el suyo (el viaje por el afín mete ~1e-14, nada más), y el
   mismo punto devuelve siempre lo mismo. */
var justoDentro = sobreEjeMayor(R25 - 1e-6), enBorde = sobreEjeMayor(R25), justoFuera = sobreEjeMayor(R25 + 1e-6);
ok(R.ps1FuenteEnEscena([COMP], afin, justoDentro.x, justoDentro.y) === true, 'r25−1e−6″: dentro');
ok(R.ps1FuenteEnEscena([COMP], afin, justoFuera.x, justoFuera.y) === false, 'r25+1e−6″: fuera');
var v1 = R.ps1FuenteEnEscena([COMP], afin, enBorde.x, enBorde.y);
var v2 = R.ps1FuenteEnEscena([COMP], afin, enBorde.x, enBorde.y);
ok(v1 === v2, 'el mismo punto da siempre el mismo veredicto');

console.log('E) lo eliminado pasa por el mismo relleno de siempre');
// El relleno es la isofota local: el valor repuesto queda al nivel de su radio
// elíptico, no al del anillo circular de fuera (eso era el hoyo del plano).
var esperado = 10 + 4000 * Math.exp(-rElip(FUERA.x, FUERA.y) / 15);
casi(outA[jFuera], esperado, esperado * 0.05, 'el relleno sigue la isofota elíptica local');

console.log('F) regresión: llamadas viejas y NaN');
ok(R.ps1.nucleoPx === undefined, 'PS1.nucleoPx ya no existe');
// Sin `geo` no hay protección: una estrella clavada en el centro se enmascara.
var sinGeo = R.ps1QuitarEstrellas(GAL, N, N, [{ x: CX, y: CY, rPx: 4, rAs: 4 }]);
var jC = Math.round(CY) * N + Math.round(CX);
ok(sinGeo[jC] !== GAL[jC], 'sin geo no hay protección: el centro se enmascara como todo lo demás');
// Los NaN originales de PS1 se conservan y fuera de las máscaras no cambia nada.
var CON_NAN = Float32Array.from(GAL);
var jLejos = 20 * N + 20, jBorde = 30 * N + 30;
CON_NAN[jLejos] = NaN; CON_NAN[jBorde] = NaN;
var outNaN = R.ps1QuitarEstrellas(CON_NAN, N, N, [NUC, FUERA], geo);
ok(outNaN[jLejos] !== outNaN[jLejos] && outNaN[jBorde] !== outNaN[jBorde],
  'un NaN fuera de las máscaras sigue siendo NaN');
var cambiadosFuera = 0;
for (i = 0; i < GAL.length; i++) {
  var dF = Math.hypot((i % N) - FUERA.x, Math.floor(i / N) - FUERA.y);
  if (dF > FUERA.rPx + 1 && i !== jLejos && i !== jBorde && outNaN[i] !== CON_NAN[i]) cambiadosFuera++;
}
ok(cambiadosFuera === 0, 'fuera de las máscaras eliminadas no cambia ni un píxel (' +
  cambiadosFuera + ')');

console.log(fallos ? '\n' + fallos + ' FALLOS' : '\ntodo ok');
process.exit(fallos ? 1 : 0);
