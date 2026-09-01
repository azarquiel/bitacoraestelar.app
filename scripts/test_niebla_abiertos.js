#!/usr/bin/env node
/* Test de conservación de la niebla sub-mlim (ADR 0022, disciplina ADR 0003).

   Contrato de nieblaCampo(): el flujo de la banda perdida (g > mlim + cola de
   glow) reaparece ÍNTEGRO en el campo difuso; la banda de glow y las resueltas
   no entran (doble conteo); sin H2c no hay niebla.

   Sin red, sin canvas:  node scripts/test_niebla_abiertos.js */
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
var o = {
  ra0: 100, dec0: 0, arcmin: 30, size: SIZE, mlim: 14,
  cielo: { sqm: 21.5, pupilaSalida: 3.3, pupilaOjo: 7, transmision: 0.8, aumentos: 61 }
};
var cola = -2.5 * Math.log10(R.config.glowCorte / R.config.alfaMin); // 2,30
var asPorPx = (o.arcmin * 60) / SIZE;

function sumaFlujo(difuso) {
  var s = 0;
  for (var i = 0; i < difuso.length; i++) s += difuso[i];
  return s * asPorPx * asPorPx; // flujo/arcsec² · área del píxel
}

console.log('T1 la banda perdida se conserva entera');
{
  // Dos estrellas perdidas (g > mlim+cola=16,30) cerca del centro, una en la
  // banda de glow (no entra) y una resuelta (no entra).
  var estrellas = [
    [100, 0, 17.0], [100.02, 0.01, 18.5],   // perdidas
    [100.01, 0, 15.0],                       // glow: la pinta dibujar()
    [100, 0.01, 12.0]                        // resuelta
  ];
  var difuso = new Float32Array(SIZE * SIZE);
  var tot = R.nieblaCampo(difuso, estrellas, o);
  var esperado = Math.pow(10, -0.4 * 17.0) + Math.pow(10, -0.4 * 18.5);
  eq(Math.abs(tot / esperado - 1) < 1e-6, 'total enrutado = suma de las perdidas');
  // El parche estético (FOT.NIEBLA_GANANCIA_ESTETICA, ADR 0022 §parche) rompe
  // la conservación A PROPÓSITO: lo pintado va multiplicado, lo devuelto no.
  var k = R.fot.NIEBLA_GANANCIA_ESTETICA;
  eq(Math.abs(sumaFlujo(difuso) / (tot * k) - 1) < 1e-3,
    'conservación salvo el parche: flujo en difuso = total x ' + k);
}

console.log('T1b con la ganancia a 1 la conservación es EXACTA');
{
  var guardadoK = R.fot.NIEBLA_GANANCIA_ESTETICA;
  R.fot.NIEBLA_GANANCIA_ESTETICA = 1;
  var difuso1b = new Float32Array(SIZE * SIZE);
  var tot1b = R.nieblaCampo(difuso1b, [[100, 0, 17.0], [100.02, 0.01, 18.5]], o);
  eq(Math.abs(sumaFlujo(difuso1b) / tot1b - 1) < 1e-3,
    'sin parche: flujo en difuso = total enrutado');
  R.fot.NIEBLA_GANANCIA_ESTETICA = 2;
  var difuso2b = new Float32Array(SIZE * SIZE);
  R.nieblaCampo(difuso2b, [[100, 0, 17.0], [100.02, 0.01, 18.5]], o);
  eq(Math.abs(sumaFlujo(difuso2b) / (2 * tot1b) - 1) < 1e-3,
    'la ganancia escala el flujo pintado, y el total devuelto no cambia');
  R.fot.NIEBLA_GANANCIA_ESTETICA = guardadoK;
}

console.log('T2 la banda de glow y las resueltas no entran');
{
  var difuso2 = new Float32Array(SIZE * SIZE);
  var tot2 = R.nieblaCampo(difuso2, [[100, 0, 15.0], [100, 0, 12.0]], o);
  eq(tot2 === 0, 'solo glow/resueltas: total 0');
  var vacio = true;
  for (var i = 0; i < difuso2.length; i++) if (difuso2[i] !== 0) { vacio = false; break; }
  eq(vacio, 'difuso queda intacto');
}

console.log('T3 estrella fuera del encuadre no entra');
{
  var difuso3 = new Float32Array(SIZE * SIZE);
  var tot3 = R.nieblaCampo(difuso3, [[101.5, 0, 17.0]], o);
  eq(tot3 === 0, 'fuera del campo: total 0');
}

console.log('T4 sin H2c no hay niebla (la vía C_MAG no tiene ley de tamaño)');
{
  var guardado = R.fot.H2C;
  R.fot.H2C = null;
  var difuso4 = new Float32Array(SIZE * SIZE);
  var tot4 = R.nieblaCampo(difuso4, [[100, 0, 17.0]], o);
  R.fot.H2C = guardado;
  eq(tot4 === 0, 'H2C=null: total 0');
}

console.log('T5 el reparto es suave: sin rejilla de cuadrados');
{
  // Una sola estrella perdida en el centro. Si el reparto vuelve a ser un bin
  // en rejilla, el perfil sale plano y luego cae a pico (escalón); con el
  // núcleo tienda cae monótono desde el centro.
  var difuso5 = new Float32Array(SIZE * SIZE);
  R.nieblaCampo(difuso5, [[100, 0, 17.0]], o);
  var cy = SIZE / 2, fila5 = Math.floor(cy) * SIZE;
  var perfil = [], px5;
  for (px5 = Math.floor(SIZE / 2); px5 < SIZE; px5++) {
    var v5 = difuso5[fila5 + px5];
    if (v5 <= 0) break;
    perfil.push(v5);
  }
  eq(perfil.length >= 3, 'la estrella se reparte sobre varios píxeles (' + perfil.length + ')');
  var monotono = true, meseta = 0, maxMeseta = 0;
  for (var j = 1; j < perfil.length; j++) {
    if (perfil[j] > perfil[j - 1] * 1.001) monotono = false;
    if (Math.abs(perfil[j] / perfil[j - 1] - 1) < 1e-6) { meseta++; maxMeseta = Math.max(maxMeseta, meseta); }
    else meseta = 0;
  }
  eq(monotono, 'perfil monótono decreciente desde el centro');
  eq(maxMeseta < perfil.length / 2, 'sin meseta plana de celda (mayor meseta ' + maxMeseta + ')');
}

console.log(fallos ? '\n' + fallos + ' fallo(s)' : '\nTodo bien');
process.exit(fallos ? 1 : 0);
