#!/usr/bin/env node
/* Test de la ESCALA APARENTE del dibujo de estrellas
   (`escalaEstrellas` en resources/js/bitacora-gaia-render.js).

   El fallo que fija: con el mismo aumento, dos oculares de campo aparente
   distinto dibujaban la misma estrella a tamaños distintos en pantalla, porque la
   escala se calculaba con el campo REAL en arcmin. Como la separación del par de
   una doble sí caía donde debía, el par se fundía en una mancha con el ocular de
   campo ancho y se separaba con el estrecho: la separación PARECÍA depender del
   campo aparente.

   Se comprueba la composición completa —escala del lienzo × diámetro de la
   ventana— con el caso que lo destapó: un Ethos de 6 mm (100°) y un AstroPhysics
   de 6 mm (46°) en el mismo telescopio. Misma focal = mismo aumento = misma
   imagen, con más cielo alrededor en el Ethos.

   Sin dependencias:  node scripts/test_escala.js  */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function casi(a, b, tol, etiqueta) {
  if (Math.abs(a - b) <= tol) { console.log('  ok   ' + etiqueta + ' = ' + a.toFixed(4)); }
  else { fallos++; console.error('  FALLA ' + etiqueta + '\n         esperado ' + b + ' ±' + tol + '\n         obtenido ' + a); }
}

/* ── Cómo se muestra el lienzo ──────────────────────────────────────────────
   El lienzo es cuadrado (SIZE px) y cubre el campo REAL; se muestra a un
   diámetro proporcional al campo APARENTE del ocular. Las dos constantes son de
   bitacora-ocular.js (AFOV_REF, ventanaBase) y del generador del registro, que
   usa la misma ley. */
var SIZE = 720, AFOV_REF = 110, VENTANA = 560;
function diametroVentana(afov) { return VENTANA * Math.min(1, afov / AFOV_REF); }

// Un ocular: campo real (arcmin) y diámetro en pantalla, para un telescopio dado.
function vista(focalTele, focalOcular, afov) {
  var aumentos = focalTele / focalOcular;
  return {
    afov: afov, aumentos: aumentos,
    arcmin: (afov / aumentos) * 60,
    diam: diametroVentana(afov)
  };
}
// Radio de la estrella EN PANTALLA: el nominal en píxeles del lienzo, por la
// escala aparente, por el achique del lienzo a la ventana.
function radioEnPantalla(v, radioNominal) {
  return radioNominal * R.escalaEstrellas(v.afov) * v.diam / SIZE;
}
// Separación de un par EN PANTALLA, en píxeles.
function separacionEnPantalla(v, sepArcsec) {
  var pxPorGrado = SIZE / (v.arcmin / 60);
  return (sepArcsec / 3600) * pxPorGrado * v.diam / SIZE;
}

/* ── 1. El caso del informe: Ethos 6 mm vs AstroPhysics 6 mm ───────────────── */
console.log('Ethos 6 mm (100°) y AstroPhysics 6 mm (46°) en un 200/1200:');
var ethos = vista(1200, 6, 100);
var ap    = vista(1200, 6, 46);

ok(ethos.aumentos === ap.aumentos, 'mismo aumento: ' + ethos.aumentos + '×');
ok(ethos.arcmin > ap.arcmin, 'el Ethos enseña más cielo (' + ethos.arcmin.toFixed(1) + '′ vs ' + ap.arcmin.toFixed(1) + '′)');
ok(ethos.diam > ap.diam, 'y lo enseña en una ventana mayor (' + ethos.diam.toFixed(0) + ' px vs ' + ap.diam.toFixed(0) + ' px)');

var NOMINAL = 5.3;   // radio nominal de una estrella de mag 5 (radioNucleo × halo)
casi(radioEnPantalla(ethos, NOMINAL), radioEnPantalla(ap, NOMINAL), 1e-9,
  'la MISMA estrella sale del mismo tamaño en pantalla con los dos oculares');
casi(separacionEnPantalla(ethos, 3), separacionEnPantalla(ap, 3), 1e-9,
  'y un par de 3″ sale con la MISMA separación en pantalla');

/* La regresión concreta: con la ley vieja (sqrt del campo real, acotada a 2×) el
   Ethos dibujaba la estrella casi al doble de tamaño que el AstroPhysics. */
function escalaVieja(arcmin) { return Math.min(2, Math.max(1, Math.sqrt(90 / arcmin))); }
function radioViejoEnPantalla(v) {
  return Math.min(14, NOMINAL * escalaVieja(v.arcmin)) * v.diam / SIZE;
}
var razonVieja = radioViejoEnPantalla(ethos) / radioViejoEnPantalla(ap);
ok(razonVieja > 1.5, 'la ley vieja las hacía ' + razonVieja.toFixed(2) + '× distintas (por eso el par se fundía)');

/* ── 2. La escala no mira al campo real ────────────────────────────────────── */
console.log('\nEl tamaño aparente solo depende del ocular, no del cielo que entra:');
// Mismo ocular, dos telescopios: cambia el aumento y el campo real, no el tamaño.
var corto = vista(600, 6, 100), largo = vista(2400, 6, 100);
ok(corto.arcmin !== largo.arcmin, 'campos reales distintos (' + corto.arcmin.toFixed(1) + '′ vs ' + largo.arcmin.toFixed(1) + '′)');
casi(radioEnPantalla(corto, NOMINAL), radioEnPantalla(largo, NOMINAL), 1e-9,
  'la estrella sale igual: el aumento no cambia su tamaño aparente');
ok(separacionEnPantalla(largo, 3) > separacionEnPantalla(corto, 3),
  'lo que sí cambia con el aumento es la separación del par (para eso se sube)');

/* Con 4× más aumento, 4× más separación en pantalla: es la única variable que
   debe mover el desdoble. */
casi(separacionEnPantalla(largo, 3) / separacionEnPantalla(corto, 3), 4, 1e-9,
  '4× de aumento = 4× de separación');

/* ── 3. La ley y su calibración ────────────────────────────────────────────── */
console.log('\nLa ley: escala ∝ 1/afov, anclada al ocular de referencia:');
var REF = R.config.escalaMagAfov;
casi(R.escalaEstrellas(REF), 1, 1e-12, 'al campo de referencia (' + REF + '°) la escala es 1');
casi(R.escalaEstrellas(REF * 2), 0.5, 1e-12, 'al doble de campo aparente, la mitad de tamaño en el lienzo');
casi(R.escalaEstrellas(100) * 100, R.escalaEstrellas(46) * 46, 1e-9, 'escala × afov es constante');
ok(R.escalaEstrellas(0) === 1 && R.escalaEstrellas(undefined) === 1,
  'sin campo aparente conocido, escala 1 (no rompe a quien no lo pase)');

/* ── 4. El criterio que calibra el tamaño ──────────────────────────────────────
   `escalaMagAfov` no está puesta a ojo: un disco dibujado no puede comerse un
   hueco que el equipo SÍ resuelve. El caso que lo fijó es Almaak (9,6″, mag 2,3 y
   5,1) con el equipo del informe: un 114/1000 con Barlow 1,5× y un Delos de
   4,5 mm (72°), o sea 333×. Si alguien sube la constante y las estrellas vuelven
   a tragarse el par, esto se cae. */
console.log('\nCriterio de calibración (Almaak a 333× tiene que verse partida):');
var C = R.config;
function radioNominal(g) {
  var r = C.radioMag * Math.pow(Math.max(0, C.magTamMin - g), C.radioExp);
  r = Math.min(C.radioMax, Math.max(C.radioMin, r));
  return Math.min(C.radioTotalMax, r * (1 + C.blur));
}
var delos = vista(1000 * 1.5, 4.5, 72);
var sumaRadios = radioEnPantalla(delos, radioNominal(2.3)) + radioEnPantalla(delos, radioNominal(5.1));
var hueco = separacionEnPantalla(delos, 9.6);
ok(delos.aumentos > 332 && delos.aumentos < 334, 'el equipo del informe da ' + delos.aumentos.toFixed(0) + '×');
ok(sumaRadios < hueco,
  'los discos (' + sumaRadios.toFixed(2) + ' px) caben en el hueco (' + hueco.toFixed(2) + ' px)');

console.log('\n' + (fallos === 0 ? '✓ Todo correcto.' : '✗ ' + fallos + ' fallo(s).'));
process.exit(fallos === 0 ? 0 : 1);
