#!/usr/bin/env node
/* Arnés del generador de grano sin malla — issue #96 (ADR 0015).

   `oldGranoEn` es una copia CONGELADA del generador bilineal que pintaba antes
   de este ticket (malla cuadrada, altura interpolada en los nodos). Vive solo
   aquí, para poder comparar contra el nuevo `R.granoEn` (simplex + rango
   gaussianizado, ver bitacora-gaia-render.js): el módulo de producción ya no
   sabe pintar la malla vieja, así que sin esta copia el test de #96 no tendría
   con qué demostrar que el artefacto desaparece.

     node scripts/harness_grano_malla.js --dump   vuelca dos PPM ×6 (viejo/nuevo) */
'use strict';

global.window = global.window || {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

/* ── Generador viejo, congelado tal cual estaba antes de #96 ──────────────── */
var OLD_TABLA = null;
function oldTabla() {
  if (OLD_TABLA) return OLD_TABLA;
  var n = 4096, v = new Float64Array(n), suma = 0, suma2 = 0, k;
  for (k = 0; k < n; k++) {
    var u1 = (k + 0.5) / n, u2 = ((Math.imul(k, 2654435761) >>> 0) % n + 0.5) / n;
    v[k] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    suma += v[k];
  }
  var media = suma / n, suma2b = 0;
  for (k = 0; k < n; k++) { v[k] -= media; suma2b += v[k] * v[k]; }
  var esc = 1 / Math.sqrt(suma2b / n);
  for (k = 0; k < n; k++) v[k] *= esc;
  OLD_TABLA = v;
  return v;
}
function oldNodo(semilla, i, j) {
  var h = semilla ^ Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return OLD_TABLA[h & 4095];
}
function oldGranoEn(semilla, xAs, yAs, pasoAs) {
  if (!OLD_TABLA) oldTabla();
  var u = xAs / pasoAs, v = yAs / pasoAs;
  var i0 = Math.floor(u), j0 = Math.floor(v);
  var tx = u - i0, ty = v - j0;
  var w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty);
  var w01 = (1 - tx) * ty, w11 = tx * ty;
  var g = oldNodo(semilla, i0, j0) * w00 + oldNodo(semilla, i0 + 1, j0) * w10 +
    oldNodo(semilla, i0, j0 + 1) * w01 + oldNodo(semilla, i0 + 1, j0 + 1) * w11;
  return g / Math.sqrt(w00 * w00 + w10 * w10 + w01 * w01 + w11 * w11);
}

/* ── Campo muestreado en una rejilla cuadrada (para el espectro) ──────────── */
function muestrear(fn, semilla, N, ds, pasoAs) {
  var campo = new Float64Array(N * N);
  for (var j = 0; j < N; j++) {
    var y = (j - N / 2) * ds;
    for (var i = 0; i < N; i++) {
      var x = (i - N / 2) * ds;
      campo[j * N + i] = fn(semilla, x, y, pasoAs);
    }
  }
  return campo;
}

/* Asimetría eje/diagonal de la autocorrelación espacial, barrida en el lag:
   una malla cuadrada repite valores por NODO, así que dos puntos separados un
   lag alineado con un eje comparten más estructura de nodos que dos puntos
   separados el mismo lag en diagonal — es la firma direccional de la rejilla,
   medida directamente en el dominio real en vez de por el pico de un anillo de
   Fourier (que con un núcleo suave se cae a un piso de ruido de muestreo antes
   de terminar el barrido y da falsos positivos/negativos). Común-aleatorio: el
   punto base x,y es el MISMO para el lag de eje y el de diagonal, así que su
   ruido de muestreo se cancela en la resta en vez de sumarse.
   Se descartan los lags donde la autocorrelación ya es ~0 (no queda estructura
   que medir, solo ruido de la media muestral) y se barre el resto tomando el
   peor caso, igual que `barridoEscalas` en harness_grano_sbf.js explora la
   escala en vez de asumirla. */
function autocorrPar(fn, semilla, pasoAs, lagAxis, lagDiag, N) {
  var sumAxis = 0, sumDiag = 0;
  for (var k = 0; k < N; k++) {
    var x = k * 0.7548776662 * pasoAs * 5, y = k * 0.5698402910 * pasoAs * 5;
    var a = fn(semilla, x, y, pasoAs);
    sumAxis += a * fn(semilla, x + lagAxis[0], y + lagAxis[1], pasoAs);
    sumDiag += a * fn(semilla, x + lagDiag[0], y + lagDiag[1], pasoAs);
  }
  return { axis: sumAxis / N, diag: sumDiag / N };
}

function razonAnisotropia(fn, semilla, pasoAs) {
  var N = 45000, peor = 0, detalle = null;
  for (var m = 1.25; m <= 1.75; m += 0.25) {
    var r = m * pasoAs;
    var c = autocorrPar(fn, semilla, pasoAs, [r, 0], [r / Math.SQRT2, r / Math.SQRT2], N);
    var base = Math.abs(c.axis) + Math.abs(c.diag);
    if (base < 0.03) continue;
    var a = Math.abs(c.axis - c.diag) / base;
    if (a > peor) { peor = a; detalle = { m: m, axis: c.axis, diag: c.diag }; }
  }
  return { razon: peor, detalle: detalle };
}

/* Media y RMS por anillos radiales (centrados en el origen del campo, que es
   el propio anclaje del grano al cielo): la propiedad que #96 exige conservar
   entre el generador viejo y el nuevo. Anillos de ÁREA IGUAL, no de ancho
   igual: con ancho igual el anillo interior cubre muchísima menos área —y por
   tanto muchas menos longitudes de correlación independientes del núcleo del
   grano— que el exterior, así que su media muestral fluctúa mucho más para la
   MISMA semilla sin que eso sea sesgo del generador (viejo o nuevo). Con área
   igual cada anillo tiene la misma potencia estadística. */
function estadisticaPorAnillo(fn, semilla, pasoAs, rMaxAs, nAnillos, nMuestras) {
  var sumaN = new Float64Array(nAnillos), suma = new Float64Array(nAnillos),
    suma2 = new Float64Array(nAnillos);
  var k, r, th, x, y, v, b;
  for (k = 0; k < nMuestras; k++) {
    var u = (k + 0.5) / nMuestras;    // área uniforme por muestra Y por anillo
    r = Math.sqrt(u) * rMaxAs;
    th = (k * 2654435761) % 1000003 / 1000003 * 2 * Math.PI;
    x = r * Math.cos(th); y = r * Math.sin(th);
    v = fn(semilla, x, y, pasoAs);
    b = Math.min(nAnillos - 1, Math.floor(u * nAnillos));
    sumaN[b]++; suma[b] += v; suma2[b] += v * v;
  }
  var salida = [];
  for (var i = 0; i < nAnillos; i++) {
    var n = sumaN[i], media = n ? suma[i] / n : 0;
    var rms = n ? Math.sqrt(suma2[i] / n) : 0;
    var r0 = Math.sqrt(i / nAnillos) * rMaxAs, r1 = Math.sqrt((i + 1) / nAnillos) * rMaxAs;
    salida.push({ r0: r0, r1: r1, n: n, media: media, rms: rms });
  }
  return salida;
}

function ppmDump(path, campo, N, escala) {
  var fs = require('fs');
  var lado = N * escala;
  var out = Buffer.alloc(lado * lado * 3);
  var mx = 0;
  for (var i = 0; i < campo.length; i++) mx = Math.max(mx, Math.abs(campo[i]));
  for (var j = 0; j < lado; j++) {
    for (var i = 0; i < lado; i++) {
      var v = campo[Math.floor(j / escala) * N + Math.floor(i / escala)];
      var g = Math.max(0, Math.min(255, Math.round(128 + 127 * v / (mx || 1))));
      var idx = (j * lado + i) * 3;
      out[idx] = g; out[idx + 1] = g; out[idx + 2] = g;
    }
  }
  fs.writeFileSync(path, Buffer.concat([Buffer.from('P6\n' + lado + ' ' + lado + '\n255\n'), out]));
}

module.exports = {
  oldGranoEn: oldGranoEn, newGranoEn: R.granoEn, muestrear: muestrear,
  razonAnisotropia: razonAnisotropia,
  estadisticaPorAnillo: estadisticaPorAnillo, ppmDump: ppmDump
};

if (require.main === module) {
  var pasoAs = 10, semilla = 1234567;
  console.log('\n== Asimetría eje/diagonal de la autocorrelación, peor caso en el lag ==\n');
  ['viejo (malla bilineal)', 'nuevo (convolución dispersa)'].forEach(function (nombre, idx) {
    var fn = idx === 0 ? oldGranoEn : R.granoEn;
    var r = razonAnisotropia(fn, semilla, pasoAs);
    console.log('  ' + nombre.padEnd(29) + ' razón = ' + r.razon.toFixed(3) +
      '  (peor lag = ' + r.detalle.m.toFixed(2) + '·paso)');
  });

  if (process.argv.indexOf('--dump') >= 0) {
    var dirIdx = process.argv.indexOf('--dump'), dir = process.argv[dirIdx + 1] || require('os').tmpdir();
    console.log('\n== Volcando PPM ×6 en ' + dir + ' ==\n');
    var pasoZoom = pasoAs, ds = pasoZoom / 6, N = 96;   // ×6: 6 muestras por celda de malla
    var cViejo = muestrear(oldGranoEn, semilla, N, ds, pasoZoom);
    var cNuevo = muestrear(R.granoEn, semilla, N, ds, pasoZoom);
    var pViejo = require('path').join(dir, 'grano_viejo_x6.ppm');
    var pNuevo = require('path').join(dir, 'grano_nuevo_x6.ppm');
    ppmDump(pViejo, cViejo, N, 6);
    ppmDump(pNuevo, cNuevo, N, 6);
    console.log('  ' + pViejo);
    console.log('  ' + pNuevo);
  }
}
