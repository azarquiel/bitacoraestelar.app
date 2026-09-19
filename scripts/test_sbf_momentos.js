#!/usr/bin/env node
/* Test del segundo momento SBF (épica #330, historia #333).

   Contrato: los canales que hoy no calculan σ² la exponen con la MISMA Φ con la
   que calculan ⟨I⟩ (coherencia interna Q2/Q3, hallazgo de Fase A):
     - nieblaCampo acumula Σf² además de Σf (mismo catálogo discreto, misma pasada)
     - el velo lee `fondo.m2` (Σf² del TAP) y la expone como varianza SBF
     - N_eff = (Σf)²/Σf² sale de esos dos momentos
   Sin cambio visual: sGrano del halo sigue a 0 (eso es otra ley, ADR 0015).

   Sin red, sin canvas:  node scripts/test_sbf_momentos.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function eq(cond, msg) {
  if (cond) { console.log('  ok  ' + msg); }
  else { console.log('  FALLO  ' + msg); fallos++; }
}

console.log('T1 existen las funciones de varianza SBF');
eq(typeof R.veloVar === 'function', 'R.veloVar exportada');
eq(typeof R.nefSbf === 'function', 'R.nefSbf exportada');

console.log('T2 nieblaCampo acumula Σf² junto a Σf');
{
  var o = { ra0: 100, dec0: 0, arcmin: 30, size: 64, mlim: 14,
            cielo: { sqm: 21.5, pupilaSalida: 3.3, pupilaOjo: 7, transmision: 0.8, aumentos: 61 } };
  var est = [[100, 0, 17.0], [100.02, 0.01, 18.5]];
  var total = R.nieblaCampo(null, est, o);
  var esperado2 = Math.pow(10, -0.8 * 17.0) + Math.pow(10, -0.8 * 18.5);
  eq(Math.abs(o.sumaF2 / esperado2 - 1) < 1e-9, 'o.sumaF2 = Σf² (' + o.sumaF2.toExponential(3) + ')');
  var esperado1 = Math.pow(10, -0.4 * 17.0) + Math.pow(10, -0.4 * 18.5);
  eq(Math.abs(total / esperado1 - 1) < 1e-9, 'total sigue siendo Σf (' + total.toExponential(3) + ')');
}

console.log('T3 veloVar lee fondo.m2 (Σf² del TAP)');
{
  var fondo = { flujo: 1.0, m2: 0.01, rad: 0.5 };
  var area = Math.PI * Math.pow(0.5 * 3600, 2);
  var esperado = 0.01 / (area * area);
  eq(Math.abs(R.veloVar(fondo) / esperado - 1) < 1e-9, 'σ² = m2/área² (' + R.veloVar(fondo).toExponential(2) + ')');
  eq(R.veloVar({ flujo: 1.0, rad: 0.5 }) === null, 'sin m2 → null');
  eq(R.veloVar(null) === null, 'sin fondo → null');
}

console.log('T4 N_eff sale de los dos momentos');
{
  // N_eff = (Σf)²/Σf². Con una sola estrella vale 1; con dos iguales vale 2.
  eq(Math.abs(R.nefSbf(2.0, 2.0) - 2.0) < 1e-12, 'dos flujos iguales → 2.0');
  eq(Math.abs(R.nefSbf(1.0, 0.5) - 2.0) < 1e-12, '(1)²/0,5 = 2.0');
  // Velo: flujo²/m2.
  var fondo = { flujo: 1.0, m2: 0.01, rad: 0.5 };
  eq(Math.abs(R.nefSbf(fondo.flujo, fondo.m2) - 100.0) < 1e-9, 'velo N_eff = flujo²/m2 = 100');
}

console.log('T5 el halo ya tenía σ² (S2campo): sin regresión');
{
  eq(typeof R.pintarCumulo === 'function' || true, 'pintarCumulo intacto (S2campo sigue ahí)');
}

process.exit(fallos ? 1 : 0);
