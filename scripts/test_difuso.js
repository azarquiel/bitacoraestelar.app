#!/usr/bin/env node
/* Test de la CADENA FOTOMÉTRICA COMPARTIDA y de las capas difusas del render de
   Gaia (resources/js/bitacora-gaia-render.js).

   Vigila los tres sitios donde un error es silencioso y visualmente plausible:
   la pupila de salida aplicada dos veces, el anclaje del brillo superficial y el
   ajuste de perfiles sobre conteos sesgados.

   Sin dependencias:  node scripts/test_difuso.js

   Crece con las fases: hoy cubre la cadena fotométrica (F1). Los asserts de
   Rayleigh→μ, King y telón entran con sus fases. */
'use strict';

// El módulo es un IIFE de navegador: se cuelga de window y no exporta nada.
global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;
var FOT = R.fot;

var fallos = 0;
function casi(actual, esperado, tol, etiqueta) {
  if (Math.abs(actual - esperado) <= tol) {
    console.log('  ok   ' + etiqueta + ' = ' + actual.toFixed(4));
  } else {
    fallos++;
    console.error('  FALLA ' + etiqueta + '\n         esperado ' + esperado.toFixed(4) +
      ' ±' + tol + '\n         obtenido ' + actual.toFixed(4));
  }
}
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

/* Invierte la curva del fondo: del gris 0–255 al brillo superficial en el ocular
   (mag/arcsec²). Así se comprueba la FÍSICA, no el tono en pantalla. */
function sbDelFondo(nivel) {
  return FOT.SB_CIELO_NEGRO - (nivel / 255) * (FOT.SB_CIELO_NEGRO - FOT.SB_CIELO_BLANCO);
}
function sbEnOcular(pupilaSalida, transmision) {
  // sqm 19: deja el gris en mitad de la curva, lejos de los recortes a 0 y 255.
  return sbDelFondo(R.ctxFotometrico({
    pupilaSalida: pupilaSalida, pupilaOjo: 7, sqm: 19,
    transmision: (transmision != null) ? transmision : 1
  }).nivelFondo);
}

/* ── 1. La pupila de salida se aplica UNA sola vez ─────────────────────────────
   Es el fallo más probable de toda la cadena y el más difícil de ver a ojo: si
   un motor vuelve a atenuar su Fobj, la imagen sale plausible pero mal.
   Entre dos pupilas el fondo debe separarse exactamente −2,5·log10((p1/p2)²). */
console.log('Pupila de salida aplicada una sola vez:');
var p1 = 7, p2 = 3.5;
var esperadoDelta = -2.5 * Math.log10(Math.pow(p2 / p1, 2));
casi(sbEnOcular(p2) - sbEnOcular(p1), esperadoDelta, 1e-9,
  'Δ(mag/arcsec²) entre pupila ' + p1 + ' y ' + p2 + ' mm');

var p3 = 1.75;
casi(sbEnOcular(p3) - sbEnOcular(p2), -2.5 * Math.log10(Math.pow(p3 / p2, 2)), 1e-9,
  'Δ entre ' + p2 + ' y ' + p3 + ' mm (misma razón, mismo salto)');

/* ── 2. Tope al brillo de ojo desnudo ────────────────────────────────────────
   Con d_ep > d_eye el ojo recorta el haz: el fondo NO sigue aclarándose. */
console.log('Tope de la pupila del ojo:');
casi(sbEnOcular(12), sbEnOcular(7), 1e-9, 'pupila 12 mm = pupila 7 mm (recortado)');
ok(sbEnOcular(3.5) > sbEnOcular(7), 'más aumento → fondo más oscuro (SBe mayor)');

/* ── 3. La transmisión entra en el fondo, no solo en la magnitud límite ────── */
console.log('Transmisión del tubo en el fondo:');
casi(sbEnOcular(7, 0.7) - sbEnOcular(7, 1), -2.5 * Math.log10(0.7), 1e-9,
  'Δ por T = 0,7');

/* ── 4. Magnitud límite: recorte de apertura efectiva ────────────────────────
   Con pupila de salida > pupila del ojo se desperdicia apertura: D_eff = MAG·d_eye.
   Sin este recorte el simulador es optimista a poca potencia. */
console.log('Magnitud límite, apertura efectiva:');
var comun = { apertura: 200, transmision: 0.8, sqm: 21, pupilaOjo: 7 };
function mlim(aumentos) {
  var o = { aumentos: aumentos };
  for (var k in comun) o[k] = comun[k];
  return R.magLimite(o);
}
// A 10x la pupila de salida es 20 mm (≫ 7): D_eff = 70 mm, no 200.
var conRecorte = mlim(10);
var sinRecorte = -22.81 + 1.792 * 21 - 0.02949 * 21 * 21 + 2.5 * Math.log10(200 * 200 * 0.8);
ok(conRecorte < sinRecorte - 1, 'a 10x (pupila 20 mm) el recorte penaliza más de 1 mag');
casi(mlim(10), mlim(10), 0, 'determinista');
// A 100x la pupila es 2 mm (< 7): sin recorte, D_eff = D.
var SB0T = Math.max(21, Math.min(27, 21 + 5 * Math.log10(7.5 * 100 / (200 * Math.sqrt(0.8)))));
casi(mlim(100), -22.81 + 1.792 * SB0T - 0.02949 * SB0T * SB0T + 2.5 * Math.log10(200 * 200 * 0.8),
  1e-9, 'a 100x (pupila 2 mm) usa la apertura completa');

console.log(fallos === 0 ? '\nTodo OK' : '\n' + fallos + ' fallo(s)');
process.exit(fallos === 0 ? 0 : 1);
