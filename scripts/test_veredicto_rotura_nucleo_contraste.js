#!/usr/bin/env node
/* Candado del veredicto de la métrica Φ″ (contraste local, ADR 0018).
   simulador_ocular/docs/adr/0018-rotura-nucleo-contraste/veredicto.md.

   Precondición de validez idéntica a la de los ADR 0016/0017 (cada candado
   congela la suya), ANTES del veredicto. Después fija U″, la definición de
   f_res_contraste (denominador = velo local + cielo) y el patrón exacto del
   veredicto: P1 pasa POR PRIMERA VEZ, P3 y M30 98× falsean. Romper esto
   exige medida.

     node scripts/test_veredicto_rotura_nucleo_contraste.js */
'use strict';

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) console.log('  ok   ' + etiqueta);
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function cerca(x, ref, tol) { return Math.abs(x - ref) <= tol * Math.abs(ref); }

/* ── 1. Precondición de validez (ANTES del veredicto) ───────────────────── */

console.log('\nPrecondición: la fila P_solo del núcleo de M13 reproduce tres_modelos_mres.md ±5 %:');

var T = require('./harness_tres_modelos_mres.js');
var psolo = [61, 250].map(function (MAG) {
  var fila = T.medir(MAG).filas.filter(function (f) { return f.modelo === 'psolo'; })[0];
  return { nNuc: fila.nNuc, fNuc: +(100 * fila.fNuc).toFixed(1) };
});
var REF = [{ nNuc: 1, fNuc: 0.7 }, { nNuc: 36, fNuc: 22.5 }];
var precondicion = psolo.every(function (p, i) {
  return cerca(p.nNuc, REF[i].nNuc, 0.05) && cerca(p.fNuc, REF[i].fNuc, 0.05);
});
psolo.forEach(function (p, i) {
  ok(cerca(p.nNuc, REF[i].nNuc, 0.05),
    'N_res núcleo (' + (i ? '250×' : '61×') + ') = ' + p.nNuc + ' ≈ ' + REF[i].nNuc + ' ±5 %');
  ok(cerca(p.fNuc, REF[i].fNuc, 0.05),
    'f_res núcleo (' + (i ? '250×' : '61×') + ') = ' + p.fNuc + ' % ≈ ' + REF[i].fNuc + ' % ±5 %');
});

if (!precondicion) {
  console.error('\nFALLA la precondición: la cadena fotométrica del render ha cambiado; ' +
    'la calibración de Φ″ no es válida; reabrir prerregistro ' +
    '(simulador_ocular/docs/adr/0018-rotura-nucleo-contraste/prerregistro.md). ' +
    'El veredicto NO se emite.');
  process.exit(1);
}

/* ── 2. Invariantes de la calibración ───────────────────────────────────── */

var K = require('./veredicto_rotura_nucleo_contraste.js');
var V = require('./veredicto_rotura_nucleo.js');
var D17 = require('./veredicto_rotura_nucleo_densidad.js');

console.log('\nInvariantes de la calibración:');

ok(V.DELTA === 0.75 && V.EXPONENTE === 0.25 &&
   JSON.stringify(V.BORDES_RH) === JSON.stringify([0, 0.25, 0.50, 1.00, 2.00]) &&
   cerca(D17.A_REF, 2.018858e3, 1e-4),
  'Δ, exponente, franjas y A_ref heredados intactos de los ADR 0016/0017');

/* ── 3. U″ y veredicto, fijados con medida ──────────────────────────────── */

console.log('\nVeredicto (calibración + listones; tarda unos minutos):');

var r = K.evaluar();
ok(cerca(r.U, 1.977118e-1, 1e-4), 'U″ reproduce el valor calibrado (' + r.U.toExponential(6) + ')');

// La definición de f_res_contraste queda fijada por sus tres términos en el
// ancla: dibujado / (velo local + cielo). Si alguien cambia el denominador,
// esta identidad se rompe con medida.
var f0 = r.ancla.franjas[V.FRANJA_NUCLEO];
ok(cerca(f0.fContraste, f0.Fdib / (f0.Fvelo + f0.Fcielo), 1e-12),
  'f_res_contraste = F_dibujado / (F_velo_local + F_cielo) en el ancla');
ok(f0.Fvelo > 0 && f0.Fcielo > 0,
  'el denominador lleva los DOS términos (velo local y cielo), ninguno nulo');

ok(r.pasa === false, 'el veredicto sigue siendo NEGATIVO (veredicto.md)');

var por = {};
r.listones.forEach(function (l) { por[l.id] = l; });
ok(por.P1 && por.P1.pasa, 'P1 PASA por primera vez (el contraste local resuelve M13 61×)');
ok(por.P2 && por.P2.pasa, 'P2 sigue pasando (crecimiento estricto con el aumento)');
ok(por.P3 && !por.P3.pasa, 'P3 sigue falsando (halo a 250× supera U″)');
ok(por.ORDINALES && por.ORDINALES.pasa, 'los ordinales siguen pasando');

var fallanBanco = (por.BANCO18 ? por.BANCO18.valores : [])
  .filter(function (c) { return !c.pasa; })
  .map(function (c) { return c.cum + ' ' + c.mag + '×'; });
ok(JSON.stringify(fallanBanco) === JSON.stringify(['M30 98×']),
  'en el banco del 18″ falla exactamente M30 98× (M55, M22 y M62 pasan)');

console.log('\n' + (fallos ? fallos + ' FALLO(S)' : 'todo ok'));
process.exit(fallos ? 1 : 0);
