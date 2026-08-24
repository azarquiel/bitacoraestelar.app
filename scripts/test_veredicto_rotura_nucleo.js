#!/usr/bin/env node
/* Candado del veredicto de la métrica Φ (ADR 0016, #109).
   simulador_ocular/docs/adr/0016-rotura-nucleo/veredicto.md.

   PRECONDICIÓN DE VALIDEZ (antes del veredicto): la fila P_solo de
   `simulador_ocular/docs/experimentos/tres_modelos_mres.md` debe reproducirse
   ±5 % con el harness existente. Si no, la cadena fotométrica del render ha
   cambiado, la calibración de Φ no es válida y el veredicto NO se emite
   (lección de informe_autocritica_v7.md §1.2: un test que no puede fallar no
   es un test).

   Después, el candado fija como invariantes: U (leído en el ancla, mismo
   commit que la calibración), Δ = 0,75, la discretización radial y que el
   anillo del ancla es el de P2 — y fija el veredicto medido (negativo, con el
   patrón exacto de listones que pasan y fallan), para que un cambio futuro
   tenga que romper este test con medida, no en silencio.

     node scripts/test_veredicto_rotura_nucleo.js */
'use strict';

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) console.log('  ok   ' + etiqueta);
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function cerca(x, ref, tol) { return Math.abs(x - ref) <= tol * Math.abs(ref); }

/* ── 1. Precondición de validez (ANTES del veredicto) ───────────────────── */

console.log('\nPrecondición: la fila P_solo del núcleo de M13 reproduce tres_modelos_mres.md ±5 %:');

// Las filas P_solo se leen del harness exportado, no de su texto impreso. El
// flujo se redondea a un decimal en %, la misma precisión con la que el
// documento compromete la cifra.
var T = require('./harness_tres_modelos_mres.js');
var psolo = [61, 250].map(function (MAG) {
  var fila = T.medir(MAG).filas.filter(function (f) { return f.modelo === 'psolo'; })[0];
  return { nNuc: fila.nNuc, fNuc: +(100 * fila.fNuc).toFixed(1) };
});

// Referencia documentada (tres_modelos_mres.md): 61× → 1 estrella, 0,7 % del
// flujo del núcleo en puntos; 250× → 36 estrellas, 22,5 %.
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
    'la calibración de Φ no es válida; reabrir prerregistro ' +
    '(simulador_ocular/docs/adr/0016-rotura-nucleo/prerregistro.md). ' +
    'El veredicto NO se emite.');
  process.exit(1);
}

/* ── 2. Invariantes de la calibración (fijados en el mismo commit que U) ── */

var V = require('./veredicto_rotura_nucleo.js');
var C = global.window.BitacoraCumulos;

console.log('\nInvariantes de la calibración:');

ok(V.DELTA === 0.75 && V.DELTA === C.config.dmagCrowd,
  'Δ = 0,75 y es dmagCrowd del render (invariante, no parámetro)');
ok(JSON.stringify(V.BORDES_RH) === JSON.stringify([0, 0.25, 0.50, 1.00, 2.00]),
  'discretización radial congelada: r/r_h [0, 0,25, 0,50, 1,00, 2,00]');
ok(V.EXPONENTE === 0.25, 'exponente 1/4 fijo (Robson & Graham 1981)');
ok(V.FRANJA_NUCLEO === 0, 'el anillo del ancla es el primer anillo de la tabla, y es el MISMO de P2');
ok(V.ANCLA.id === 'NGC 6205' && V.ANCLA.D === 200 && V.ANCLA.sqm === 21 && V.ANCLA.MAG === 120,
  'ancla: M13, 200 mm, SQM 21, 120×');

/* ── 3. U y veredicto, fijados con medida ───────────────────────────────── */

console.log('\nVeredicto (calibración + listones; tarda unos minutos):');

var r = V.evaluar();
ok(cerca(r.U, 1.817095e-1, 1e-4), 'U reproduce el valor calibrado (' + r.U.toExponential(6) + ')');
ok(r.pasa === false, 'el veredicto sigue siendo NEGATIVO (veredicto.md)');

var por = {};
r.listones.forEach(function (l) { por[l.id] = l; });
ok(por.P1 && !por.P1.pasa, 'P1 sigue falsando (anillos exteriores de M13 a 61× superan U)');
ok(por.P2 && por.P2.pasa, 'P2 sigue pasando (Φ del núcleo crece estrictamente con el aumento)');
ok(por.P3 && !por.P3.pasa, 'P3 sigue falsando (halo a 250× supera U)');
ok(por.ORDINALES && por.ORDINALES.pasa, 'los ordinales siguen pasando');

var banco = por.BANCO18 ? por.BANCO18.valores : [];
var fallanBanco = banco.filter(function (c) { return !c.pasa; })
  .map(function (c) { return c.cum + ' ' + c.mag + '×'; });
ok(JSON.stringify(fallanBanco) === JSON.stringify(['M30 98×']),
  'en el banco del 18″ falla exactamente M30 98× (M55, M22 y M62 pasan)');

console.log('\n' + (fallos ? fallos + ' FALLO(S)' : 'todo ok'));
process.exit(fallos ? 1 : 0);
