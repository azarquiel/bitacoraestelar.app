#!/usr/bin/env node
/* Tests del remuestreo propio de #370 (lib_remuestreo_ps1.js): bajar el parche
   nativo de PS1 (0,25″/px) a la resolución de la regla C promediando por ÁREA,
   que conserva el brillo superficial —y por tanto el flujo— por construcción.

   Sin red ni dependencias:  node scripts/test_remuestreo_ps1.js */
'use strict';

var RM = require('./lib_remuestreo_ps1.js');

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function casi(a, b, tol, etiqueta) {
  ok(Math.abs(a - b) <= tol, etiqueta + ' (' + a + ' vs ' + b + ' ±' + tol + ')');
}
function flujo(datos, escala) {
  var s = 0, n = 0;
  for (var i = 0; i < datos.length; i++) if (datos[i] === datos[i]) { s += datos[i]; n++; }
  return { flujo: s * escala * escala, n: n };
}
/* Imagen pseudoaleatoria determinista: un remuestreo que solo funcione sobre
   constantes no prueba nada (ADR 0005). */
function ruido(n, semilla) {
  var s = semilla, v = new Float32Array(n);
  for (var i = 0; i < n; i++) { s = (1664525 * s + 1013904223) % 4294967296; v[i] = (s / 4294967296) * 100 - 20; }
  return v;
}

console.log('factor entero (4×4 → 2×2): cada píxel es la media de su bloque');
var a = new Float32Array([1, 2, 3, 4,
                          5, 6, 7, 8,
                          9, 10, 11, 12,
                          13, 14, 15, 16]);
var r = RM.remuestrearArea(a, 4, 4, 2);
ok(r.length === 4, 'salida de 2×2');
casi(r[0], 3.5, 1e-6, 'bloque superior izquierdo');
casi(r[3], 13.5, 1e-6, 'bloque inferior derecho');

console.log('identidad: salida = entrada devuelve los mismos valores');
var id = RM.remuestrearArea(a, 4, 4, 4);
ok(Array.prototype.every.call(id, function (v, i) { return Math.abs(v - a[i]) < 1e-6; }), 'píxel a píxel');

console.log('factor NO entero (4800 → 2048, el tope): conserva el flujo');
var N = 480, M = 205, img = ruido(N * N, 7);   // misma razón 4800/2048 ≈ 2,34, a escala 1/10
var out = RM.remuestrearArea(img, N, N, M);
var fIn = flujo(img, 0.25), fOut = flujo(out, 0.25 * N / M);
casi(fOut.flujo / fIn.flujo, 1, 1e-5, 'razón de flujos');
ok(fOut.n === M * M, 'sin NaN en una entrada sin NaN');

console.log('NaN: se promedian solo los finitos; un píxel sin ningún finito sale NaN');
var b = new Float32Array([NaN, NaN, 2, 4,
                          NaN, NaN, 6, 8,
                          1, 1, 1, 1,
                          1, 1, NaN, 3]);
var rb = RM.remuestrearArea(b, 4, 4, 2);
ok(rb[0] !== rb[0], 'bloque todo NaN → NaN');
casi(rb[1], 5, 1e-6, 'bloque sin NaN');
casi(rb[3], 5 / 3, 1e-6, 'bloque con un NaN: media de los tres finitos');

console.log('regla de mayoría: un píxel con menos de la mitad de su área con dato sale NaN');
var d = new Float32Array([NaN, NaN, 1, 1,
                          NaN, 9, 1, 1,
                          5, 5, 7, NaN,
                          NaN, NaN, 7, NaN]);
var rd = RM.remuestrearArea(d, 4, 4, 2);
ok(rd[0] !== rd[0], '1 de 4 con dato → NaN (no el 9 de la astilla)');
casi(rd[2], 5, 1e-6, '2 de 4 con dato (justo la mitad) → media de los dos');
casi(rd[3], 7, 1e-6, '2 de 4 con dato en diagonal → media de los dos');
/* Factor no entero, 3 → 2: el píxel grueso 0 cubre 1,5 × 1,5 nativos. Con la
   fila 0 y la columna 0 en NaN solo queda con dato el cuarto del nativo (1,1)
   que cae dentro: 0,25 / 2,25 del área → NaN. El grueso 3 queda entero con dato. */
var e = new Float32Array([NaN, NaN, NaN, NaN, 4, 4, NaN, 4, 4]);
var re = RM.remuestrearArea(e, 3, 3, 2);
ok(re[0] !== re[0], 'factor 1,5: un noveno del área con dato → NaN');
casi(re[3], 4, 1e-6, 'factor 1,5: el píxel entero con dato conserva su valor');

console.log('factor no entero con NaN en una mitad: el brillo superficial de la mitad válida se conserva');
var c = new Float32Array(N * N);
for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) c[y * N + x] = x < N / 2 ? NaN : 42;
var rc = RM.remuestrearArea(c, N, N, M), todos42 = true;
for (var k = 0; k < rc.length; k++) if (rc[k] === rc[k] && Math.abs(rc[k] - 42) > 1e-4) todos42 = false;
ok(todos42, 'todo píxel finito vale 42');

console.log('WCS: la rejilla gruesa apunta al mismo cielo que la nativa');
var w = { ra0: 337.4, dec0: -20.8, x0: 2399.5, y0: 2399.5, gx: -0.25 / 3600, gy: 0.25 / 3600 };
var w2 = RM.wcsRemuestreada(w, 4800, 2048);
var f = 4800 / 2048;
casi(w2.gx, w.gx * f, 1e-15, 'gx escala por el factor');
casi(w2.gy, w.gy * f, 1e-15, 'gy escala por el factor');
/* El centro del píxel nativo i cae en (i + 0,5)/f − 0,5 de la rejilla gruesa. */
casi(w2.x0, (w.x0 + 0.5) / f - 0.5, 1e-9, 'x0 en coordenadas de la rejilla gruesa');
casi(w2.y0, (w.y0 + 0.5) / f - 0.5, 1e-9, 'y0 en coordenadas de la rejilla gruesa');
ok(w2.ra0 === w.ra0 && w2.dec0 === w.dec0, 'el punto de tangencia no se mueve');
ok(RM.wcsRemuestreada(null, 4800, 2048) === null, 'sin WCS sigue sin WCS');

console.log('entrada no cuadrada o salida mayor que la entrada: error, no un parche falso');
var lanzo = false;
try { RM.remuestrearArea(a, 4, 4, 8); } catch (e) { lanzo = true; }
ok(lanzo, 'subir resolución lanza');

if (fallos) { console.error('\n' + fallos + ' fallo(s)'); process.exit(1); }
console.log('\nTodo en verde');
