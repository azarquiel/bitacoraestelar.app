#!/usr/bin/env node
/* Generador de grano sin malla — issue #96 (ADR 0015, condición bloqueante).

   El generador anterior interpolaba ALTURAS en los nodos de una malla cuadrada
   (paso `radioImagenAs`) y a ×6 se veían las cadenas curvas y los anillos de
   nudos brillantes de esa rejilla — medido en exp_sgrano, es la razón de este
   ticket. Se sustituye por ruido simplex (gradientes, no alturas, sobre malla
   triangular) con la marginal gaussianizada por rango, para que el campo
   lognormal que lo consume (`campoLognormal`, bitacora-gaia-render.js) siga
   viendo exactamente lo que pedía: media ~0, varianza 1, sin recorte.

   Disciplina ADR 0005: cada `ok` imprime el número medido, no solo el veredicto
   — un test que solo repitiese "pasa/no pasa" sin la cifra sería vacuo.

     node scripts/test_grano_malla.js */
'use strict';

var A = require('./harness_grano_malla.js');

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) console.log('  ok   ' + etiqueta);
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

var PASO = 10;               // arcsec, escala de malla arbitraria para el estadístico
var SEMILLAS = [1234567, 987654321, 42, 555555, 8675309];

/* ── G1 · el estadístico de estructura: separa viejo de nuevo ───────────────
   Asimetría eje/diagonal de la autocorrelación espacial, peor caso barriendo
   el lag en [1,25 , 1,75]·paso: una malla cuadrada REPITE valores por nodo, así
   que dos puntos separados un lag alineado con un eje comparten más estructura
   que los mismos dos puntos separados el mismo lag en diagonal — la firma
   direccional de la rejilla, medida en el dominio real (ver harness, por qué
   no en el pico de un anillo de Fourier: con un núcleo suave la potencia se
   cae a ruido de muestreo antes de terminar el barrido). Medido en 5 semillas
   antes de fijar el umbral: el viejo nunca baja de 0,19, el nuevo nunca sube
   de 0,10. */
console.log('\nG1 · asimetría eje/diagonal de la autocorrelación (peor lag), malla vs sin malla:');
var UMBRAL_MALLA = 0.15, UMBRAL_SIN_MALLA = 0.12;
SEMILLAS.forEach(function (s) {
  var v = A.razonAnisotropia(A.oldGranoEn, s, PASO);
  var n = A.razonAnisotropia(A.newGranoEn, s, PASO);
  ok(v.razon > UMBRAL_MALLA,
    'semilla ' + s + ': el generador CON malla supera ' + UMBRAL_MALLA + ' (' + v.razon.toFixed(1) + ')');
  ok(n.razon < UMBRAL_SIN_MALLA,
    'semilla ' + s + ': el generador SIN malla queda bajo ' + UMBRAL_SIN_MALLA + ' (' + n.razon.toFixed(1) + ')');
  ok(n.razon < v.razon,
    'y en la misma semilla la razón baja al quitar la malla (×' + (v.razon / n.razon).toFixed(1) + ')');
});

/* ── G2 · determinismo ────────────────────────────────────────────────────
   Ancla al CIELO, no al lienzo (ver comentario de granoEn): el mismo punto,
   la misma semilla, tiene que devolver EXACTAMENTE el mismo valor sin importar
   cuántas veces ni en qué orden se pinte. */
console.log('\nG2 · el campo es determinista (mismo punto, misma semilla):');
var rep1 = A.newGranoEn(42, 13.7, -8.2, PASO);
var rep2 = A.newGranoEn(42, 13.7, -8.2, PASO);
ok(rep1 === rep2, 'dos llamadas al mismo punto coinciden bit a bit (' + rep1 + ')');
var otroOrden = A.newGranoEn(99, 1, 1, PASO);
var rep3 = A.newGranoEn(42, 13.7, -8.2, PASO);
ok(rep3 === rep1, 'y no depende de qué se haya pintado antes en medio');

/* ── G3 · propiedades conservadas del campo ──────────────────────────────
   Media ~0 y RMS ~1 por anillos radiales (centrados en el anclaje del grano),
   viejo y nuevo dentro de la MISMA tolerancia declarada. El generador viejo NO
   es un cero perfecto aquí —tiene su propio sesgo local cerca de sus nodos,
   parte del mismo defecto que motiva #96—, así que la tolerancia se declara a
   partir de lo medido en los dos, no se inventa un 0,00 % que ninguno cumple.
   200000 muestras por anillo repartidas por ÁREA (no por radio), así que cada
   anillo pesa lo que le toca por su superficie. */
console.log('\nG3 · media ~0 y RMS ~1 por anillo, viejo y nuevo dentro de tolerancia declarada:');
var TOL_MEDIA = 0.5, TOL_RMS = 0.25;
var vAnillos = A.estadisticaPorAnillo(A.oldGranoEn, 1234567, PASO, 60, 6, 200000);
var nAnillos = A.estadisticaPorAnillo(A.newGranoEn, 1234567, PASO, 60, 6, 200000);
for (var i = 0; i < vAnillos.length; i++) {
  var etAnillo = 'anillo ' + vAnillos[i].r0.toFixed(0) + '-' + vAnillos[i].r1.toFixed(0) + '″';
  ok(Math.abs(vAnillos[i].media) < TOL_MEDIA && Math.abs(nAnillos[i].media) < TOL_MEDIA,
    etAnillo + ': media viejo=' + vAnillos[i].media.toFixed(3) +
    ' nuevo=' + nAnillos[i].media.toFixed(3) + ' (tol ' + TOL_MEDIA + ')');
  ok(Math.abs(vAnillos[i].rms - 1) < TOL_RMS && Math.abs(nAnillos[i].rms - 1) < TOL_RMS,
    etAnillo + ': RMS viejo=' + vAnillos[i].rms.toFixed(3) +
    ' nuevo=' + nAnillos[i].rms.toFixed(3) + ' (tol ' + TOL_RMS + ')');
}

/* La marginal, además, tiene que ser ESTRECHAMENTE gaussiana y no solo
   media/varianza correctas: `campoLognormal` usa mu = ln(<I>) − s²/2, que solo
   deja <I> exacto si E[e^{s·g}] = e^{s²/2} — la identidad de la MGF normal.
   Con g no gaussiano esa igualdad falla y <I> pintado se sesga justo donde s es
   grande (el halo). Se comprueba con s = 2 (régimen de halo, ver
   grano-sbf-invisible-por-ley) contra el valor exacto e^{s²/2} = e², no contra
   una aproximación de dos momentos. */
console.log('\n   y la marginal es bastante gaussiana para no sesgar el campo lognormal:');
var muestras = [];
for (var k = 0; k < 20000; k++) {
  muestras.push(A.newGranoEn(7, k * 0.7548776662, k * 0.5698402910, PASO));
}
var s = 2, sumaExp = 0;
for (var m = 0; m < muestras.length; m++) sumaExp += Math.exp(s * muestras[m]);
var mgfMedida = sumaExp / muestras.length, mgfTeorica = Math.exp(s * s / 2);
var TOL_MGF = 0.1;
ok(Math.abs(mgfMedida / mgfTeorica - 1) < TOL_MGF,
  'E[e^{2g}] = ' + mgfMedida.toFixed(3) + ' contra e² = ' + mgfTeorica.toFixed(3) +
  ' (' + (100 * Math.abs(mgfMedida / mgfTeorica - 1)).toFixed(1) + '% de ' + (100 * TOL_MGF) + '%)');

/* ── G4 · arnés visual reproducible (criterio de aceptación del ticket) ──── */
console.log('\nG4 · el arnés visual ×6 existe y es reproducible:');
ok(typeof A.ppmDump === 'function' && typeof A.muestrear === 'function',
  'harness_grano_malla.js expone volcado ×6 (node scripts/harness_grano_malla.js --dump [dir])');
var campoA = A.muestrear(A.newGranoEn, 55, 16, PASO / 6, PASO);
var campoB = A.muestrear(A.newGranoEn, 55, 16, PASO / 6, PASO);
ok(campoA.every(function (v, idx) { return v === campoB[idx]; }),
  'y el volcado es reproducible: dos muestreos del mismo campo coinciden bit a bit');

console.log(fallos === 0 ? '\nGrano sin malla verde' : '\n' + fallos + ' fallo(s)');
process.exit(fallos === 0 ? 0 : 1);
