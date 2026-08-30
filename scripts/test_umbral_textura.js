#!/usr/bin/env node
/* Ley de umbral de textura del grano SBF (ADR 0015, ticket #97).

   Este test NO decide si la ley pasa los listones del prerregistro —eso es el
   ticket #99, con K calibrado. Aquí solo se comprueban las PROPIEDADES que la
   forma de la ley debe tener sea cual sea K (monotonía, corte escotópico,
   halo bajo umbral) y que la costura con la tabla radial es la que dice el
   ticket: sGrano = P(ver) cuando la ley está activa, y el render de hoy
   —canal a cero— cuando no lo está.

     node scripts/test_umbral_textura.js */
'use strict';

var H = require('./harness_halo_v7.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) console.log('  ok   ' + etiqueta);
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

var M13 = H.cumulo('NGC 6205');

/* ── T1 · frecuencia retiniana: los números de la bibliografía §1.3 ─────────
   Grano de 1″: f ≈ 1800/M c/deg. 61× → ~30 c/deg, 250× → ~7 c/deg. */
console.log('\nT1 · f(θ_grano, M) reproduce los anclajes de la bibliografía:');
ok(Math.abs(R.frecuenciaGranoCdeg(1, 61) - 29.5) < 0.5,
  'f(1″, 61×) ≈ 30 c/deg (' + R.frecuenciaGranoCdeg(1, 61).toFixed(1) + ')');
ok(Math.abs(R.frecuenciaGranoCdeg(1, 250) - 7.2) < 0.2,
  'f(1″, 250×) ≈ 7 c/deg (' + R.frecuenciaGranoCdeg(1, 250).toFixed(2) + ')');
ok(R.frecuenciaGranoCdeg(0, 61) === 0 && R.frecuenciaGranoCdeg(1, 0) === 0,
  'sin escala o sin aumentos, f = 0 (no divide por cero)');

/* ── T2 · corte escotópico a pocos c/deg ─────────────────────────────────────
   A la iluminancia de referencia I0 el corte de la CSF es TEXTURA.FC0, que por
   diseño vive en pocos c/deg (bibliografía §2: Van Nes & Bouman 1967). */
console.log('\nT2 · corte escotópico:');
var T = R.textura;
ok(T.FC0 > 0 && T.FC0 < 10, 'FC0 = ' + T.FC0 + ' c/deg cae en "pocos c/deg"');
ok(R.csfTextura(T.FC0 * 0.1, T.I0) > R.csfTextura(T.FC0 * 10, T.I0),
  'la ganancia cae al alejarse del corte hacia frecuencias altas');

/* ── T3 · monotonía de d′ con el aumento (CSF paso-bajo: sin techo hasta el
   pico) ──────────────────────────────────────────────────────────────────── */
console.log('\nT3 · d′ crece con el aumento (grano ~1″ sale de sub-umbral):');
var AUMENTOS = [61, 120, 173, 250];
var dPrev = -1, subeConAumento = true;
AUMENTOS.forEach(function (m) {
  var d = R.dPrimeTextura(1, 1, m, 1e-8, 7);
  if (d < dPrev) subeConAumento = false;
  dPrev = d;
});
ok(subeConAumento, 'd′(61×) ≤ d′(120×) ≤ d′(173×) ≤ d′(250×)');

/* ── T4 · caída con la iluminancia ───────────────────────────────────────────
   Menos fondo local (o pupila de salida más pequeña) es menos iluminancia
   retiniana, y d′ tiene que bajar con ella (De Vries–Rose). */
console.log('\nT4 · d′ cae con la iluminancia retiniana:');
var dBrillante = R.dPrimeTextura(1, 1, 120, 1e-6, 7);
var dOscuro = R.dPrimeTextura(1, 1, 120, 1e-10, 7);
ok(dOscuro < dBrillante, 'd′ con fondo tenue (' + dOscuro.toExponential(2) +
  ') < d′ con fondo brillante (' + dBrillante.toExponential(2) + ')');
var dPupilaChica = R.dPrimeTextura(1, 1, 120, 1e-6, 2);
ok(dPupilaChica < dBrillante,
  'y también cae con una pupila de salida menor, a igual fondo');

/* ── T5 · el halo (N_ef ≈ 0,07) queda por debajo del núcleo en d′ ────────────
   La separación EXACTA (bajo umbral con cualquier K razonable, listón P3 del
   prerregistro) es el veredicto del ticket #99 con K calibrado; aquí solo se
   comprueba la ESTRUCTURA que lo hace posible: el halo, con su fondo local
   mucho más tenue, tiene que quedar por debajo del núcleo en d′ pese a su RMS
   relativo mayor (N_ef más bajo), en M13/200 mm real. */
console.log('\nT5 · el halo sale por debajo del núcleo en d′ (estructura, no K):');
T.ACTIVO = true;
try {
  AUMENTOS.forEach(function (mag) {
    var m = H.medirMemo(M13, { D: 200, MAG: mag, sqm: 21, realization: 0 });
    var tabla = m.tabla, rhAs = m.rhAs;
    var iNuc = indiceEn(tabla.r, 0.10 * rhAs);
    var iHalo = indiceEn(tabla.r, 1.50 * rhAs);
    var dNuc = dPrimeDeAnillo(m, tabla, iNuc);
    var dHalo = dPrimeDeAnillo(m, tabla, iHalo);
    ok(dHalo < dNuc,
      mag + '×: d′(halo) = ' + dHalo.toExponential(2) + ' < d′(núcleo) = ' +
      dNuc.toExponential(2));
  });

  /* ── T6 · sGrano de la tabla radial ES P(ver) cuando la ley está activa ──── */
  console.log('\nT6 · sGrano de la tabla = P(ver) de la ley nueva (61/120/173/250×, M13):');
  AUMENTOS.forEach(function (mag) {
    var m = H.medirMemo(M13, { D: 200, MAG: mag, sqm: 21, realization: 0 });
    var tabla = m.tabla, i = indiceEn(tabla.r, 0.10 * m.rhAs);
    var rms = tabla.I[i] > 0 ? (tabla.sigma[i] * m.atenGrano) / tabla.I[i] : 0;
    var esperado = R.pVerTextura(rms, m.thGranoAs, mag,
      m.ctxGrano.Fcielo + tabla.I[i], m.D / mag);
    ok(Math.abs(tabla.sGrano[i] - esperado) < 1e-12,
      mag + '×: sGrano[núcleo] = P(ver) (' + tabla.sGrano[i].toExponential(4) + ')');
  });
} finally {
  T.ACTIVO = false;   // producción: el canal vuelve a cero pase lo que pase arriba
}

/* ── T7 · producción apagada: canal a cero, render de hoy sin tocar ──────────
   Por defecto TEXTURA.ACTIVO es false, y con eso tablaCumulo no ha cambiado
   una coma: sGrano sigue saliendo exactamente de visibilidadDifusa·Cmin. */
console.log('\nT7 · producción apagada (canal a cero):');
ok(R.textura.ACTIVO === false, 'TEXTURA.ACTIVO por defecto es false');
var mApagado = H.medirMemo(M13, { D: 200, MAG: 120, sqm: 21, realization: 0 });
var iN = indiceEn(mApagado.tabla.r, 0.10 * mApagado.rhAs);
var sgViejo = R.visibilidadDifusa(
  mApagado.tabla.sigma[iN] * mApagado.atenGrano,
  (mApagado.ctxGrano.Fcielo + mApagado.tabla.I[iN]) * mApagado.ctxGrano.Cmin,
  true);
ok(Math.abs(mApagado.tabla.sGrano[iN] - sgViejo) < 1e-12,
  'con la ley apagada, sGrano sigue siendo visibilidadDifusa·Cmin, bit a bit');

/* ── T8 · listones del prerregistro: escritos, parametrizados por K ─────────
   El veredicto (¿pasan con el K calibrado?) es el ticket #99: aquí solo se
   comprueba que el arnés de listones está escrito, corre sin caerse contra la
   ley de producción y devuelve los cuatro (P1, P2, P3, banco del 18″) con su
   propio K de prueba, sin tocar el K de producción. */
console.log('\nT8 · listones del prerregistro escritos y parametrizados por K:');
var L = require('./listones_umbral_textura.js');
var kProduccion = R.textura.K, activoProduccion = R.textura.ACTIVO;
var r1 = L.evaluar(0.01), r2 = L.evaluar(1);
ok(R.textura.K === kProduccion && R.textura.ACTIVO === activoProduccion,
  'evaluar(K) restaura K y ACTIVO de producción al salir');
ok(r1.K === 0.01 && r2.K === 1, 'cada corrida usa el K que se le pasó, no el de producción');
['P1', 'P2', 'P3', 'BANCO18'].forEach(function (id) {
  var l = r2.listones.filter(function (x) { return x.id === id; })[0];
  ok(l && typeof l.pasa === 'boolean' && l.valores.length > 0,
    'listón ' + id + ' escrito, con valores medidos');
});
ok(JSON.stringify(r1.listones.map(function (l) { return l.valores; })) !==
   JSON.stringify(r2.listones.map(function (l) { return l.valores; })),
  'los valores cambian con K (no están hardcodeados a un veredicto)');

function indiceEn(r, rAs) {
  var mejor = 0, dMin = Infinity;
  for (var i = 0; i < r.length; i++) {
    var d = Math.abs(r[i] - rAs);
    if (d < dMin) { dMin = d; mejor = i; }
  }
  return mejor;
}
function dPrimeDeAnillo(m, tabla, i) {
  var rms = tabla.I[i] > 0 ? (tabla.sigma[i] * m.atenGrano) / tabla.I[i] : 0;
  return R.dPrimeTextura(rms, m.thGranoAs, m.MAG, m.ctxGrano.Fcielo + tabla.I[i],
    m.D / m.MAG);
}

console.log('\n' + (fallos ? fallos + ' FALLO(S)' : 'todo ok'));
process.exit(fallos ? 1 : 0);
