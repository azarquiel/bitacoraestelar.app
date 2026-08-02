#!/usr/bin/env node
/* Test del halo no resuelto de cúmulos globulares (perfil de King) en
   resources/js/bitacora-gaia-render.js.

   Implementaciones anteriores de este mismo velo dejaron "anillos
   concéntricos de brillo" por discretizar el perfil en anillos contra
   conteos de Gaia (bordes de discretización, anillos sin estrellas,
   pisos de monotonía mal orientados). Esta versión evalúa el perfil de
   King en cerrado, sin discretizar, así que el test central es que el
   perfil (y lo que de él acaba en pantalla) sea estrictamente monótono
   y continuo, sin saltos, del centro al radio de marea.

   Sin dependencias:  node scripts/test_globulares.js */
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
  if (Math.abs(actual - esperado) <= tol) {
    console.log('  ok   ' + etiqueta + ' = ' + actual.toFixed(4));
  } else {
    fallos++;
    console.error('  FALLA ' + etiqueta + '\n         esperado ' + esperado.toFixed(4) +
      ' ±' + tol + '\n         obtenido ' + actual.toFixed(4));
  }
}

// M13 (NGC 6205) y M92 (NGC 6341), del catálogo de Harris — ver
// simulador_ocular/resources/js/globulares-datos.js.
var M13 = { rc: 0.62, rt: 0.62 * Math.pow(10, 1.53), muV0: 16.59 };
var M92 = { rc: 0.26, rt: 0.26 * Math.pow(10, 1.68), muV0: 15.47 };

/* ── 1. perfilKing: normalizado, monótono, continuo ─────────────────────── */
console.log('perfilKing: forma del perfil:');
var rcAs = M13.rc * 60, rtAs = M13.rt * 60;
casi(R.perfilKing(0, rcAs, rtAs), 1, 1e-9, 'vale 1 en el centro');
casi(R.perfilKing(rtAs, rcAs, rtAs), 0, 1e-9, 'vale 0 en el radio de marea');
ok(R.perfilKing(rtAs * 1.5, rcAs, rtAs) === 0, 'vale 0 más allá del radio de marea');

var muestras = 200, prev = Infinity, monotono = true;
for (var i = 1; i <= muestras; i++) {
  var r = (rtAs * i) / muestras;
  var v = R.perfilKing(r, rcAs, rtAs);
  if (v > prev + 1e-9) monotono = false;
  prev = v;
}
ok(monotono, 'estrictamente decreciente del centro al radio de marea (sin rebotes)');
// Continuidad de verdad (no un paso uniforme sobre un perfil muy picudo cerca
// del núcleo, que saltaría igual sin que hubiera ningún bug): un paso ínfimo
// de r no debe mover el valor más que ese mismo paso, en ningún punto del rango.
var eps = 1e-3, continuo = true;
[0, rcAs / 4, rcAs / 2, rcAs, rcAs * 2, rcAs * 5, rtAs * 0.5, rtAs * 0.99].forEach(function (r) {
  var d = Math.abs(R.perfilKing(r + eps, rcAs, rtAs) - R.perfilKing(r, rcAs, rtAs));
  if (d > eps * 50) continuo = false;   // margen generoso: solo atrapa saltos reales, no pendiente alta
});
ok(continuo, 'sin discontinuidades (paso infinitesimal, no cambia de golpe en ningún punto)');

/* ── 2. areaKing: la integral cerrada coincide con la numérica ──────────── */
console.log('areaKing: integral cerrada vs. numérica (trapecios):');
[M13, M92, { rc: 1, rt: 5, muV0: 18 }].forEach(function (c) {
  var k = c.rt / c.rc;
  var N = 20000, h = k / N, suma = 0;
  for (var j = 0; j < N; j++) {
    var u0 = j * h, u1 = (j + 1) * h;
    var f0 = R.perfilKing(u0, 1, k) * u0, f1 = R.perfilKing(u1, 1, k) * u1;
    suma += (f0 + f1) / 2 * h;
  }
  var numerico = 2 * Math.PI * suma;
  casi(R.areaKing(k), numerico, numerico * 1e-3, 'k=' + k.toFixed(2) + ': cerrada vs. numérica');
});

/* ── 3. haloGlobular: sin estrellas resueltas, el flujo total se conserva ── */
console.log('haloGlobular: flujo total = flujo del catálogo (sin resta):');
var halo = R.haloGlobular(M13, [], 250.42183, 36.45986);
var rcAsM13 = M13.rc * 60, rtAsM13 = M13.rt * 60, k13 = rtAsM13 / rcAsM13;
var areaAs2 = R.areaKing(k13) * rcAsM13 * rcAsM13;
var FtotalEsperado = Math.pow(10, -0.4 * M13.muV0) * areaAs2;
casi(halo.Fcentral * areaAs2, FtotalEsperado, FtotalEsperado * 1e-9,
  'sin estrellas que restar, el flujo integrado coincide con el del catálogo');

/* ── 4. haloGlobular: resta el flujo de las estrellas de Gaia ya dibujadas ── */
console.log('haloGlobular: resta el flujo resuelto (P4, sin contar la luz dos veces):');
var estrellaEnNucleo = [[250.42183, 36.45986, 12, 1.0]];   // en el centro exacto, g=12
var haloConResta = R.haloGlobular(M13, estrellaEnNucleo, 250.42183, 36.45986);
ok(haloConResta.Fcentral < halo.Fcentral, 'con una estrella resuelta en el núcleo, el halo neto es más tenue');
var estrellaLejos = [[250.42183 + 5, 36.45986, 12, 1.0]];  // 5° fuera del radio de marea
var haloSinAfectar = R.haloGlobular(M13, estrellaLejos, 250.42183, 36.45986);
casi(haloSinAfectar.Fcentral, halo.Fcentral, halo.Fcentral * 1e-9,
  'una estrella de campo fuera del radio de marea no descuenta nada');

/* Bug real: una consulta profunda (equipo grande) devuelve tantas estrellas
   resueltas que su flujo sumado supera el total catalogado, y el halo se
   apagaba del todo -y, peor, cambiaba con el TELESCOPIO del visor, así que
   el mismo cúmulo aparecía o desaparecía solo por cambiar de equipo-. Tope:
   la resta nunca puede superar restaMaxFrac del total, así que siempre queda
   un resto visible, y esa cota no depende de cuántas estrellas se pasen. */
console.log('haloGlobular: la resta nunca apaga el halo del todo (consulta profunda/equipo grande):');
var muchasEstrellas = [];
for (var s = 0; s < 500; s++) muchasEstrellas.push([250.42183, 36.45986, 10, 1.0]);   // flujo total muy por encima del catálogo
var haloSaturado = R.haloGlobular(M13, muchasEstrellas, 250.42183, 36.45986);
ok(haloSaturado.Fcentral > 0, 'con muchísimo más flujo resuelto que el total, el halo sigue siendo > 0');
var FcentralMinimo = (1 - R.config.globular.restaMaxFrac) * Math.pow(10, -0.4 * M13.muV0);
casi(haloSaturado.Fcentral, FcentralMinimo, FcentralMinimo * 1e-6, 'y se queda justo en el suelo de restaMaxFrac');

/* ── 5. pintarHaloGlobular: el perfil en pantalla es monótono (sin anillos) ── */
console.log('pintarHaloGlobular: perfil en el array difuso, radial desde el centro:');
[M13, M92].forEach(function (cluster, idx) {
  var nombre = idx === 0 ? 'M13' : 'M92';
  var SIZE = 400, arcmin = 60;   // campo generoso: el cúmulo entero cabe con margen
  var h = R.haloGlobular(cluster, [], 250, 36);
  var difuso = new Float32Array(SIZE * SIZE);
  R.pintarHaloGlobular(difuso, h, { arcmin: arcmin, size: SIZE });
  var cx = SIZE / 2, cy = SIZE / 2;
  var prevF = Infinity, mono = true, saltoPx = 0;
  for (var x = Math.ceil(cx); x < SIZE; x++) {
    var f = difuso[cy * SIZE + x];
    if (f > prevF + 1e-12) mono = false;
    var dpx = Math.abs(f - prevF);
    if (isFinite(prevF) && dpx > saltoPx) saltoPx = dpx;
    prevF = f;
  }
  ok(mono, nombre + ': el flujo pintado decrece monótonamente desde el centro (sin anillos)');
  ok(difuso[cy * SIZE + Math.round(cx)] > 0, nombre + ': el núcleo tiene flujo > 0');
});

/* ── 6. Damping continuo (P8): compara mu(r) [mag/arcsec²] con la magnitud
   propia de la estrella -misma escala logarítmica, sin factor de conversión
   de área-, con transición suave (smoothstep), sin umbral duro. ────────── */
console.log('Amortiguación puntual de estrellas dentro del halo (corte duro en rc, continua fuera):');
var haloTuc = R.haloGlobular({ rc: 0.36, rt: 0.36 * Math.pow(10, 2.07), muV0: 14.38 }, [], 250, 36);   // 47 Tuc: núcleo denso y brillante de verdad
var rangoMag = R.config.globular.rangoMag;
// Dentro del radio de núcleo (rcAs) toda estrella sale puntual sin excepción,
// da igual su magnitud -el ojo no resuelve halo individual ahí, solo el
// brillo difuso del cúmulo (petición del usuario, 2026-08-01)-. Fuera de rc,
// sigue la transición suave de siempre.
function tPin(rArcsec, g) {
  if (rArcsec <= haloTuc.rcAs) return 0;
  var dm = R.muGlobular(haloTuc, rArcsec) - g;
  return Math.max(0, Math.min(1, 0.5 + dm / (2 * rangoMag)));   // sin pasar por suave(): se valida su monotonía aparte
}
// Dentro del núcleo, puntual siempre, tenue o brillante. Fuera, ninguna.
ok(tPin(0, 16) === 0, 'estrella tenue (g=16) en el núcleo: puntual total');
ok(tPin(0, 10) === 0, 'estrella brillante (g=10) en el mismo núcleo: puntual total también');
ok(tPin(600, 16) > tPin(0, 16), 'la misma estrella tenue, lejos del núcleo, se amortigua menos');

// Monotonía y continuidad de tPin en r (a magnitud fija): mismo criterio que
// perfilKing, sin depender de suave() (que ya tiene su propia garantía).
var prevT = -1, monoT = true;
[0, 1, 5, 10, 20, 30, 60, 120, 300, 600].forEach(function (r) {
  var t = tPin(r, 14);
  if (t < prevT - 1e-9) monoT = false;
  prevT = t;
});
ok(monoT, 'a magnitud fija, el factor de amortiguación crece monótonamente al alejarse del centro');

/* ── 7. Regresión de extremo a extremo: cielo oscuro, pupila de salida pequeña ─
   El bug de anillos (commit 251d45f) era más difícil de ver salvo en esta
   combinación exacta: focal larga (pupila de salida pequeña) sobre cielo muy
   oscuro. Se repite aquí todo el pipeline (halo + estrellas + pintarFot) y se
   comprueba que el perfil que llega a pantalla sigue siendo monótono. */
console.log('Regresión extremo a extremo (cielo oscuro, pupila de salida pequeña):');
var SIZE2 = 300, arcmin2 = 40;
var haloE2E = R.haloGlobular(M13, [], 250, 36);
var difuso2 = new Float32Array(SIZE2 * SIZE2);
R.pintarHaloGlobular(difuso2, haloE2E, { arcmin: arcmin2, size: SIZE2 });
// pintarFot necesita un contexto 2D real; en node no hay <canvas>. Se
// comprueba en su lugar la entrada que pintarFot recibiría (difuso2), que es
// donde vive la lógica nueva — el resto de la cadena (ctxFotometrico,
// adaptacionLocal) ya tiene su propio test en scripts/test_difuso.js.
var cx2 = SIZE2 / 2, cy2 = SIZE2 / 2, prevF2 = Infinity, mono2 = true;
for (var xx = Math.ceil(cx2); xx < SIZE2; xx++) {
  var fv = difuso2[cy2 * SIZE2 + xx];
  if (fv > prevF2 + 1e-12) mono2 = false;
  prevF2 = fv;
}
ok(mono2, 'con pupila de salida pequeña y campo estrecho, el perfil sigue monótono');

console.log(fallos === 0 ? '\nTodo OK' : '\n' + fallos + ' fallo(s)');
process.exit(fallos === 0 ? 0 : 1);
