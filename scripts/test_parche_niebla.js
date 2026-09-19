#!/usr/bin/env node
/* Test del parche estético de la niebla (épica #330, historia #334).

   Contrato: la niebla conserva el flujo EXACTO por defecto (ADR 0003) y no
   introduce ningún parámetro cuyo único criterio sea el aspecto (ADR 0004).
   El parche NIEBLA_GANANCIA_ESTETICA multiplica el flujo antes de
   visibilidadDifusa; fijado a 1 devuelve la cadena fotométrica limpia. La
   compensación perceptual, si hace falta, no es por flujo: es GAMMA_PERCEPTUAL
   (follow-up con prerregistro, no esta historia).

   Sin red, sin canvas:  node scripts/test_parche_niebla.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function eq(cond, msg) {
  if (cond) { console.log('  ok  ' + msg); }
  else { console.log('  FALLO  ' + msg); fallos++; }
}

var SIZE = 64;
var o = { ra0: 100, dec0: 0, arcmin: 30, size: SIZE, mlim: 14,
          cielo: { sqm: 21.5, pupilaSalida: 3.3, pupilaOjo: 7, transmision: 0.8, aumentos: 61 } };
var asPorPx = (o.arcmin * 60) / SIZE;
function sumaFlujo(difuso) {
  var s = 0;
  for (var i = 0; i < difuso.length; i++) s += difuso[i];
  return s * asPorPx * asPorPx;
}

console.log('T1 el parche por defecto es neutro (ADR 0004)');
eq(R.fot.NIEBLA_GANANCIA_ESTETICA === 1, 'NIEBLA_GANANCIA_ESTETICA === 1 (hoy ' + R.fot.NIEBLA_GANANCIA_ESTETICA + ')');

console.log('T2 conservación exacta con la configuración por defecto (ADR 0003)');
{
  var est = [[100, 0, 17.0], [100.02, 0.01, 18.5]];
  var difuso = new Float32Array(SIZE * SIZE);
  var tot = R.nieblaCampo(difuso, est, o);
  var pintado = sumaFlujo(difuso);
  // Exacto a precisión float32 (~1e-7): el núcleo tienda normaliza por eje.
  eq(Math.abs(pintado / tot - 1) < 1e-6, 'flujo pintado == flujo devuelto (' + tot.toExponential(3) + ')');
}

console.log('T3 el parche ya no toca el umbral (ley perceptual única, Q4)');
{
  // El factor entra antes de visibilidadDifusa: con 1, el flujo que se juzga es
  // el real, el mismo que el halo. La asimetría Q4 desaparece por construcción.
  eq(R.fot.NIEBLA_GANANCIA_ESTETICA === 1, 'ningún escalado previo a visibilidadDifusa');
}

process.exit(fallos ? 1 : 0);
