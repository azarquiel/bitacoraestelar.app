#!/usr/bin/env node
/* Comprobaciones del harness de #340 (harness_censo_crumey.js). Los valores
   esperados salen de fuera del harness: la Ec. 6 de Torres Lapasió a mano y
   las cifras publicadas en maglimite_vs_crumey.md / maglimite_vs_schaefer.md.

   node scripts/test_censo_crumey.js */
'use strict';
var H = require('./harness_censo_crumey.js');

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) console.log('  ok   ' + etiqueta);
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function cerca(v, esperado, tol, etiqueta) {
  ok(Math.abs(v - esperado) <= tol, etiqueta + ' (' + v + ' frente a ' + esperado + ')');
}

/* ── Cargador de la variante ─────────────────────────────────────────────── */
var PROD = H.cargarRender(27), CRUMEY = H.cargarRender(25.08);
var eq = { apertura: 200, aumentos: 1000, transmision: 0.9, sqm: 21.5, pupilaOjo: 7 };
/* Plano a 1000×: SB0T topa con el techo, m = −22,81 + 1,792·T − 0,02949·T²
   + 2,5·log10(200²·0,9). Con T = 27 da 15,467 y con T = 25,08 da 14,975. */
cerca(PROD.R.magLimite(eq), 15.467, 0.001, 'techo 27: plano de 200 mm a 15,47');
cerca(CRUMEY.R.magLimite(eq), 14.975, 0.001, 'techo 25,08: plano de 200 mm a 14,98');
// Donde SB0T no toca el techo, las dos leyes son la misma.
var bajo = { apertura: 200, aumentos: 50, transmision: 0.9, sqm: 21.5, pupilaOjo: 7 };
ok(PROD.R.magLimite(bajo) === CRUMEY.R.magLimite(bajo), 'a 50× las dos variantes coinciden');

/* ── Criterio 1: barrido de 20× a 600× ───────────────────────────────────────
   El plano empieza donde SB0T = 21,5 + 5·log10(7,5·M/(D·√0,9)) llega al techo:
   M = 318,5 con 200 mm y techo 27 (la cifra de la épica, M ≈ 318), 131,5 con
   25,08, y 716,6 con 450 mm, fuera del barrido. */
var b200 = H.barrido(PROD.R, 200, 21.5), b450 = H.barrido(PROD.R, 450, 21.5);
var b200c = H.barrido(CRUMEY.R, 200, 21.5);
ok(b200.puntos[0].aumentos === 20 && b200.puntos[b200.puntos.length - 1].aumentos === 600, 'el barrido va de 20× a 600×');
ok(!b200.baja && !b450.baja && !b200c.baja, 'magLimite nunca baja al subir aumentos (sin máximo interior)');
ok(b200.plano === 319, '200 mm, techo 27: el plano empieza en 319× (' + b200.plano + ')');
ok(b200c.plano === 132, '200 mm, techo 25,08: el plano empieza en 132× (' + b200c.plano + ')');
ok(b450.plano === null && b450.aumentoMax === 600, '450 mm: sin plano en el barrido, el máximo es el extremo');

/* ── Criterio 2: censo de M13 ────────────────────────────────────────────────
   Embudo publicado en maglimite_vs_schaefer.md (200 mm, SQM 21, campo 28′,
   250×): 891 estrellas pasan el mlim del cielo limpio y el render dibuja 548. */
var e250 = H.escenaM13(PROD, 200, 250, 21);
ok(e250.censoLimpio === 891, '250×: 891 estrellas pasan el mlim del cielo limpio (' + e250.censoLimpio + ')');
ok(e250.dibujadas === 548, '250×: el render dibuja 548 (' + e250.dibujadas + ')');
cerca(e250.mlim, 15.23, 0.005, '250×: mlim puntual del embudo');

/* ── Criterio 3: frontera resuelta/no-resuelta y corte de la niebla ─────────
   Frontera con las definiciones de matriz_m13.js, que publica para 400 mm,
   200× y cielo 21,5: f_res(núcleo) = 26,5 % y r_50 = 1,17 r_h. */
var f400 = H.frontera(H.escenaM13(PROD, 400, 200, 21.5));
cerca(f400.fResNucleo, 0.265, 0.0005, 'frontera: f_res(núcleo) de la matriz M13');
cerca(f400.r50, 1.17, 0.005, 'frontera: r_50/r_h de la matriz M13');
/* La variante solo mueve mlim: la cola de glow que separa el corte de la
   niebla del mlim es la misma con los dos techos. */
var n27 = H.niebla(PROD, e250), n25 = H.niebla(CRUMEY, H.escenaM13(CRUMEY, 200, 250, 21));
cerca(n25.corte - n25.mlim, n27.corte - n27.mlim, 1e-12, 'la cola de glow no depende del techo');
ok(n25.corte < n27.corte && n25.nBanda >= 0 && n27.total > 0, 'con el techo de Crumey el corte de la niebla baja');

/* ── Criterio 4: ruido de la propia escena ───────────────────────────────────
   El sorteo del ADR 0012 es Poisson-binomial: E = Σa, σ = √Σa(1−a).
   test_conservacion_sorteo.js publica, para 467 mm, 173×, SQM 21, lienzo de
   512 px y campo 2,4·r_t: 1097 candidatas, Σa = 1083,5 y σ = 3,6. */
var campo = { size: 512, arcmin: Math.ceil(2.4 * H.m13(PROD).rtAs / 60) };
var s467 = H.sorteo(H.escenaM13(PROD, 467, 173, 21, 0, campo));
ok(s467.candidatas === 1097, 'sorteo: 1097 candidatas (' + s467.candidatas + ')');
cerca(s467.esperanza, 1083.5, 0.05, 'sorteo: Σa');
cerca(s467.sigma, 3.6, 0.05, 'sorteo: σ Poisson-binomial');

console.log(fallos ? '\n' + fallos + ' fallo(s)' : '\nTodo correcto');
process.exit(fallos ? 1 : 0);
