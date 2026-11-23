#!/usr/bin/env node
/* #614 · ¿Mezclas o completitud baja? Núcleo del cruce Gaia–HST (scripts/flujo_hst.js).

   Prerregistro en ADR 0039, «Mezclas o completitud baja (#614)». Aquí solo
   casos sintéticos: el listón tiene que rechazar el caso malo de cada lectura
   (AGENTS.md, «Prerregistros»).

     A  Q1 y Qs de una fila: estrella sola, mezcla de dos iguales, vecina fuera de R.
     B  Alineado: un desplazamiento fijo HST−Gaia se recupera.
     C  Transformación F606W/F814W → G: se recupera la que generó los datos.
     D  Veredicto: (b) pura sale (b); (a) con mezclas sale (a); 1,10 justo, inconcluso.

   node scripts/test_flujo_hst.js */
'use strict';
var F = require('./flujo_hst.js');

var fallos = 0;
function ok(cond, msg) {
  if (cond) console.log('  ok   ' + msg);
  else { fallos++; console.error('  FALLA ' + msg); }
}
function cerca(a, b, tol) { return Math.abs(a - b) <= tol; }
var flujo = function (g) { return Math.pow(10, -0.4 * g); };
var mag = function (f) { return -2.5 * Math.log10(f); };

// Pseudoaleatorio fijo: el test no puede cambiar de una corrida a otra.
var semilla = 614;
function azar() { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648; }

console.log('A · Q1 y Qs de una fila (R = 0,4″)');
var hst = [{ x: 0, y: 0, g: 17 }, { x: 0.2, y: 0, g: 17 }, { x: 0.7, y: 0, g: 16 }];
var idx = F.indice(hst, F.R_AS);
var sola = F.cocientes({ x: 0.7, y: 0, g: 16 }, idx, F.R_AS);
ok(cerca(sola.q1, 1, 1e-9) && cerca(sola.qs, 1, 1e-9), 'estrella sola a 0,5″ de las demás: Q1 = Qs = 1');
var mez = F.cocientes({ x: 0.1, y: 0, g: mag(2 * flujo(17)) }, idx, F.R_AS);
ok(cerca(mez.q1, 2, 1e-9) && cerca(mez.qs, 1, 1e-9), 'mezcla de dos iguales: Q1 = 2, Qs = 1');
ok(F.cocientes({ x: 5, y: 5, g: 17 }, idx, F.R_AS) === null, 'sin estrella HST a ≤ R: null (no cuenta)');

console.log('B · alineado HST → Gaia');
var gaiaB = [], hstB = [];
for (var i = 0; i < 200; i++) {
  var x = azar() * 100, y = azar() * 100;
  gaiaB.push({ x: x, y: y, g: 15 + azar() });
  hstB.push({ x: x + 0.3, y: y - 0.2, v: 15, i: 14 });
}
var d = F.alinear(gaiaB, hstB);
ok(cerca(d.dx, -0.3, 1e-6) && cerca(d.dy, 0.2, 1e-6), 'desplazamiento (0,3″, −0,2″) recuperado: ' + d.dx.toFixed(3) + ', ' + d.dy.toFixed(3));

console.log('C · transformación F606W/F814W → G');
var pares = [];
for (i = 0; i < 300; i++) {
  var v = 15 + 3 * azar(), vi = 0.4 + 0.8 * azar();
  pares.push({ g: v - 0.05 - 0.3 * vi - 0.1 * vi * vi, v: v, i: v - vi });
}
var t = F.ajustarG(pares);
ok(cerca(t.a, -0.05, 1e-6) && cerca(t.b, -0.3, 1e-6) && cerca(t.c, -0.1, 1e-6),
  'G − V = a + b(V−I) + c(V−I)²: ' + [t.a, t.b, t.c].map(function (z) { return z.toFixed(4); }).join(', '));

console.log('D · veredicto con el listón prerregistrado (T = ' + F.T + ')');
function muestra(n, centro, ruido) {
  var q = [];
  for (var k = 0; k < n; k++) q.push(centro * Math.exp(ruido * (azar() - 0.5) * 2));
  return q;
}
var vb = F.veredicto(muestra(2600, 1.0, 0.15));
ok(vb.lectura === 'b', '(b) pura, Q1 ≈ 1: sale (b), no (a) [mediana ' + vb.mediana.toFixed(3) + ', ' + vb.lo.toFixed(3) + '-' + vb.hi.toFixed(3) + ']');
var va = F.veredicto(muestra(2600, 1.27, 0.15));
ok(va.lectura === 'a', '(a) que explica el 1,267 de #595: sale (a), no (b) [mediana ' + va.mediana.toFixed(3) + ']');
var vi2 = F.veredicto(muestra(300, 1.10, 0.15));
ok(vi2.lectura === 'inconcluso', 'Q1 en el listón: inconcluso [' + vi2.lo.toFixed(3) + '-' + vi2.hi.toFixed(3) + ']');

if (fallos) { console.error('\n' + fallos + ' fallo(s)'); process.exit(1); }
console.log('\nverde');
