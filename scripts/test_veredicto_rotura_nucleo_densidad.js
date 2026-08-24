#!/usr/bin/env node
/* Candado del veredicto de la métrica Φ′ (ADR 0017).
   simulador_ocular/docs/adr/0017-rotura-nucleo-densidad/veredicto.md.

   Precondición de validez idéntica a la del ADR 0016 (cada candado congela la
   suya): la fila P_solo de tres_modelos_mres.md ±5 % ANTES del veredicto.
   Después fija U′, A_ref (área del anillo del ancla), Φ′ = Φ en el ancla, y
   el patrón exacto del veredicto negativo — romper esto exige medida.

     node scripts/test_veredicto_rotura_nucleo_densidad.js */
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
    'la calibración de Φ′ no es válida; reabrir prerregistro ' +
    '(simulador_ocular/docs/adr/0017-rotura-nucleo-densidad/prerregistro.md). ' +
    'El veredicto NO se emite.');
  process.exit(1);
}

/* ── 2. Invariantes de la calibración ───────────────────────────────────── */

var D = require('./veredicto_rotura_nucleo_densidad.js');
var V = require('./veredicto_rotura_nucleo.js');
var H = require('./harness_halo_v7.js');

console.log('\nInvariantes de la calibración:');

ok(D.A_REF === D.areaFranja(H.cumulo(V.ANCLA.id).rh * 60, V.FRANJA_NUCLEO),
  'A_ref es el área del anillo del ancla, no un número suelto (' + D.A_REF.toExponential(6) + ' arcsec²)');
ok(cerca(D.A_REF, 2.018858e3, 1e-4), 'A_ref reproduce el valor documentado');
ok(V.DELTA === 0.75 && V.EXPONENTE === 0.25 &&
   JSON.stringify(V.BORDES_RH) === JSON.stringify([0, 0.25, 0.50, 1.00, 2.00]),
  'Δ, exponente y franjas heredados intactos del ADR 0016');

/* ── 3. U′ y veredicto, fijados con medida ──────────────────────────────── */

console.log('\nVeredicto (calibración + listones; tarda unos minutos):');

var r = D.evaluar();
ok(cerca(r.U, 1.817095e-1, 1e-4), 'U′ reproduce el valor calibrado (' + r.U.toExponential(6) + ')');
var f0 = r.ancla.franjas[V.FRANJA_NUCLEO];
ok(cerca(f0.phiPrima, f0.phi, 1e-9), 'Φ′ = Φ en el ancla por construcción (A_ref inerte)');
ok(r.pasa === false, 'el veredicto sigue siendo NEGATIVO (veredicto.md)');

var por = {};
r.listones.forEach(function (l) { por[l.id] = l; });
ok(por.P1 && !por.P1.pasa && por.P1.valores[3] >= r.U && por.P1.valores[2] < r.U,
  'P1 sigue falsando solo en el anillo exterior (la densidad ya salva el tercero)');
ok(por.P2 && por.P2.pasa, 'P2 sigue pasando (crecimiento estricto con el aumento)');
ok(por.P3 && !por.P3.pasa, 'P3 sigue falsando (halo a 250× supera U′)');
ok(por.ORDINALES && por.ORDINALES.pasa, 'los ordinales siguen pasando');

var fallanBanco = (por.BANCO18 ? por.BANCO18.valores : [])
  .filter(function (c) { return !c.pasa; })
  .map(function (c) { return c.cum + ' ' + c.mag + '×'; });
ok(JSON.stringify(fallanBanco) === JSON.stringify(['M30 98×']),
  'en el banco del 18″ falla exactamente M30 98× (M55, M22 y M62 pasan)');

console.log('\n' + (fallos ? fallos + ' FALLO(S)' : 'todo ok'));
process.exit(fallos ? 1 : 0);
