#!/usr/bin/env node
/* Test de H2 — realimentar la niebla al cielo (épica #330, historia #331).

   Contrato de la realimentación: la luz de la banda perdida (g > mlim + cola de
   glow) que nieblaCampo() enruta al campo difuso debe degradar la magnitud
   límite igual que lo hace el velo de un campo denso (ADR 0014), cerrando la
   asimetría H2. La ley se importa de producción (ADR 0008), no se reimplementa.

   Punto fijo: mlim → niebla → cielo.veloSB → mlim, iterado hasta contracción.
   La medida la hace nieblaCampo(null, …) — misma función de producción, solo
   que sin pintar — para no duplicar el corte ni la transformación de coordenadas.

   Sin red, sin canvas:  node scripts/test_h2_realimentacion.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function eq(cond, msg) {
  if (cond) { console.log('  ok  ' + msg); }
  else { console.log('  FALLO  ' + msg); fallos++; }
}

var COLA = -2.5 * Math.log10(R.config.glowCorte / R.config.alfaMin); // 2,30 mag

// Equipo de referencia: 457 mm, 100×, sqm 21,5, T 0,8 (el del banco §4 bis).
var cielo = { sqm: 21.5, pupilaSalida: 457 / 100, pupilaOjo: 7, transmision: 0.8, aumentos: 100 };
var o = { ra0: 100, dec0: 0, arcmin: 5, size: 64, apertura: 457, cielo: cielo };

function mlimSinNiebla() {
  return R.magLimite({ apertura: 457, aumentos: 100, transmision: 0.8, sqm: 21.5, pupilaOjo: 7 });
}

// Campo denso sintético: estrellas en la banda de niebla, apretadas al centro.
function campoNiebla(n, g0, paso) {
  var e = [];
  for (var i = 0; i < n; i++) {
    e.push([100 + (i % 20) * 0.001, (Math.floor(i / 20)) * 0.001, g0 + i * paso]);
  }
  return e;
}

console.log('T1 existen las funciones de realimentación');
eq(typeof R.sbNiebla === 'function', 'R.sbNiebla exportada');
eq(typeof R.mlimNiebla === 'function', 'R.mlimNiebla exportada');

console.log('T2 nieblaCampo(null) mide sin pintar: mismo total que pintando');
{
  var o2 = { ra0: 100, dec0: 0, arcmin: 30, size: 64, mlim: 14,
             cielo: { sqm: 21.5, pupilaSalida: 3.3, pupilaOjo: 7, transmision: 0.8, aumentos: 61 } };
  var est = [[100, 0, 17.0], [100.02, 0.01, 18.5]];
  var medido = R.nieblaCampo(null, est, o2);
  var pintado = R.nieblaCampo(new Float32Array(64 * 64), est, o2);
  eq(Math.abs(medido - pintado) < 1e-12, 'total medido == total pintado (' + medido.toExponential(3) + ')');
}

console.log('T3 sin niebla, el límite no cambia');
{
  var m0 = mlimSinNiebla();
  var m = R.mlimNiebla([], { ra0: 100, dec0: 0, arcmin: 5, size: 64, mlim: m0, cielo: cielo, apertura: 457 });
  eq(Math.abs(m - m0) < 1e-6, 'mlim ' + m0.toFixed(2) + ' → ' + m.toFixed(2));
}

console.log('T4 la niebla degrada el límite (H2 cerrado)');
{
  var m0 = mlimSinNiebla();
  var corte = m0 + COLA;
  var estrellas = campoNiebla(2000, corte + 0.25, 0.001);
  var c4 = { sqm: 21.5, pupilaSalida: 457 / 100, pupilaOjo: 7, transmision: 0.8, aumentos: 100 };
  var m = R.mlimNiebla(estrellas, { ra0: 100, dec0: 0, arcmin: 5, size: 64, mlim: m0, cielo: c4, apertura: 457 });
  eq(m < m0, 'mlim baja: ' + m0.toFixed(2) + ' → ' + m.toFixed(2));
}

console.log('T5 el punto fijo converge y devuelve mlim finito');
{
  var m0 = mlimSinNiebla();
  var corte = m0 + COLA;
  var estrellas = campoNiebla(2000, corte + 0.25, 0.001);
  var c5 = { sqm: 21.5, pupilaSalida: 457 / 100, pupilaOjo: 7, transmision: 0.8, aumentos: 100 };
  var m = R.mlimNiebla(estrellas, { ra0: 100, dec0: 0, arcmin: 5, size: 64, mlim: m0, cielo: c5, apertura: 457 }, 0.001, 20);
  eq(isFinite(m), 'mlim finito (' + m.toFixed(2) + ')');
}

console.log('T6 el cielo realimentado queda más brillante (veloSB incluido)');
{
  var m0 = mlimSinNiebla();
  var corte = m0 + COLA;
  var estrellas = campoNiebla(2000, corte + 0.25, 0.001);
  var c2 = { sqm: 21.5, pupilaSalida: 457 / 100, pupilaOjo: 7, transmision: 0.8, aumentos: 100 };
  R.mlimNiebla(estrellas, { ra0: 100, dec0: 0, arcmin: 5, size: 64, mlim: m0, cielo: c2, apertura: 457 });
  eq(c2.veloSB != null, 'cielo.veloSB fijado a ' + (c2.veloSB != null ? c2.veloSB.toFixed(2) : '—'));
}

process.exit(fallos ? 1 : 0);
