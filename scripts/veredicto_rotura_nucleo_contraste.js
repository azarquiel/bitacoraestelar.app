#!/usr/bin/env node
/* Arnés de la métrica Φ″ (contraste local) de rotura del núcleo (ADR 0018).

     Φ″(r) = f_res_contraste(r) · (ρ(r) · A_ref)^(1/4)
     f_res_contraste = F_dibujado / (F_velo_local + F_cielo)   por franja

   Igual que Φ′ (ADR 0017) salvo f_res: deja de ser fracción del flujo total
   y pasa a contraste de las estrellas dibujadas contra el fondo local del
   anillo — el velo no resuelto (S1campo, producción, complemento exacto de
   Fdibujado bajo el ADR 0012) más el cielo del marco fotométrico del render
   (Fcielo, el mismo de la cadena de m_lim,sky). Nada se reimplementa
   (ADR 0008); ninguna franja de N_res, Δ, exponente ni ancla cambia; el
   render no se toca.

     node scripts/veredicto_rotura_nucleo_contraste.js */
'use strict';

var V = require('./veredicto_rotura_nucleo.js');            // constantes + nBrillantes
var D17 = require('./veredicto_rotura_nucleo_densidad.js'); // areaFranja + A_REF
var H = require('./harness_halo_v7.js');
var C = global.window.BitacoraCumulos;

/* Φ″ por franja. La franja integra los TRES términos sobre la misma malla del
   render (t.r, t.paso) y el mismo peso 2π·r·Σ(r); el cielo entra por área. */
function medirPhiSegunda(id, D, sqm, MAG) {
  var cum = H.cumulo(id);
  var pob = C.poblacionCacheada(cum, 0);
  var m = H.medir(cum, { D: D, MAG: MAG, sqm: sqm, realization: 0 });
  var t = m.tabla, rImg = m.radioImagenAs, rh = m.rhAs, Fcielo = m.Fcielo;
  var franjas = [];
  for (var q = 0; q < V.BORDES_RH.length - 1; q++) {
    var r0 = V.BORDES_RH[q] * rh, r1 = V.BORDES_RH[q + 1] * rh;
    var A = D17.areaFranja(rh, q);
    var Nres = 0, Fdib = 0, Fvelo = 0;
    for (var i = 0; i < t.r.length; i++) {
      var rAs = t.r[i];
      if (rAs < r0 || rAs >= r1) continue;
      var s = pob.sigma(rAs), w = 2 * Math.PI * s * rAs * t.paso;
      if (!(w > 0)) continue;
      var mRes = t.mRes[i];
      Nres += w * V.nBrillantes(pob, mRes, rAs, rImg);
      Fdib += w * pob.Fdibujado(mRes, rAs, rImg);
      Fvelo += w * pob.S1campo(mRes, rAs, rImg);
    }
    var fC = Fdib / (Fvelo + Fcielo * A);
    franjas.push({ rh0: V.BORDES_RH[q], rh1: V.BORDES_RH[q + 1], Nres: Nres,
                   area: A, Fdib: Fdib, Fvelo: Fvelo, Fcielo: Fcielo * A,
                   fContraste: fC,
                   phi: fC * Math.pow(Nres / A * D17.A_REF, V.EXPONENTE) });
  }
  return { id: id, D: D, sqm: sqm, MAG: MAG, franjas: franjas };
}

function calibrarU() {
  var m = medirPhiSegunda(V.ANCLA.id, V.ANCLA.D, V.ANCLA.sqm, V.ANCLA.MAG);
  return { U: m.franjas[V.FRANJA_NUCLEO].phi, ancla: m };
}

function evaluar() {
  var anc = calibrarU(), U = anc.U;
  var listones = [];

  var p1 = medirPhiSegunda('NGC 6205', 200, 21, 61).franjas.map(function (f) { return f.phi; });
  listones.push({
    id: 'P1', descripcion: 'M13 61×, los 4 anillos: Φ″ < U″',
    pasa: p1.every(function (phi) { return phi < U; }), valores: p1
  });

  var p2 = [anc.ancla].concat([173, 250].map(function (mag) {
    return medirPhiSegunda('NGC 6205', 200, 21, mag);
  })).map(function (m) { return m.franjas[V.FRANJA_NUCLEO].phi; });
  listones.push({
    id: 'P2', descripcion: 'anillo nuclear (el del ancla): Φ″@120× < Φ″@173× < Φ″@250× estricto',
    pasa: p2[0] < p2[1] && p2[1] < p2[2], valores: p2
  });

  var p3 = medirPhiSegunda('NGC 6205', 200, 21, 250).franjas[V.FRANJA_HALO].phi;
  listones.push({
    id: 'P3', descripcion: 'halo (r/r_h 1,00–2,00) a 250×: Φ″ < U″',
    pasa: p3 < U, valores: [p3]
  });

  var banco = V.BANCO18.map(function (caso) {
    var phi = medirPhiSegunda(caso.id, V.D18, V.SQM18, caso.mag).franjas[V.FRANJA_NUCLEO].phi;
    return { cum: caso.nombre, mag: caso.mag, phi: phi, rompe: caso.rompe,
             pasa: caso.rompe ? phi >= U : phi < U };
  });
  listones.push({
    id: 'BANCO18', descripcion: 'banco del 18″ binario (núcleo; M62 no rompe a ningún aumento)',
    pasa: banco.every(function (c) { return c.pasa; }), valores: banco
  });

  function phiBanco(nombre, mag) {
    return banco.filter(function (c) { return c.cum === nombre && c.mag === mag; })[0].phi;
  }
  var ordinales = [
    { descripcion: 'Φ″(M55 480×) > Φ″(M55 70×)',
      pasa: phiBanco('M55', 480) > phiBanco('M55', 70),
      valores: [phiBanco('M55', 480), phiBanco('M55', 70)] },
    { descripcion: 'Φ″(M30 98×) < Φ″(M22 98×)',
      pasa: phiBanco('M30', 98) < phiBanco('M22', 98),
      valores: [phiBanco('M30', 98), phiBanco('M22', 98)] }
  ];
  listones.push({
    id: 'ORDINALES', descripcion: 'ordinales sin constantes nuevas',
    pasa: ordinales.every(function (o) { return o.pasa; }), valores: ordinales
  });

  return { U: U, ancla: anc.ancla, listones: listones,
           pasa: listones.every(function (l) { return l.pasa; }) };
}

module.exports = { medirPhiSegunda: medirPhiSegunda, calibrarU: calibrarU,
                   evaluar: evaluar };

if (require.main === module) {
  var r = evaluar();
  console.log('Ancla: M13, 200 mm, SQM 21, 120×, anillo r/r_h [0, 0,25) — mismo anillo que P2');
  console.log('A_ref = ' + D17.A_REF.toExponential(6) + ' arcsec² (heredada del ADR 0017)');
  console.log('U″ = ' + r.U.toExponential(6));
  console.log('\nΦ″ por franja del ancla (r/r_h · N_res · f_contraste · Φ″):');
  r.ancla.franjas.forEach(function (f) {
    console.log('  [' + f.rh0.toFixed(2) + ', ' + f.rh1.toFixed(2) + ')  N_res ' +
      f.Nres.toFixed(2).padStart(9) + '  f_c ' + f.fContraste.toFixed(4) +
      '  (Fdib ' + f.Fdib.toExponential(2) + ' / velo ' + f.Fvelo.toExponential(2) +
      ' + cielo ' + f.Fcielo.toExponential(2) + ')  Φ″ ' + f.phi.toExponential(4));
  });
  console.log('\nListones:\n');
  r.listones.forEach(function (l) {
    console.log((l.pasa ? 'ok    ' : 'FALLA ') + l.id + ' — ' + l.descripcion);
    if (l.id === 'BANCO18') {
      l.valores.forEach(function (c) {
        console.log('      ' + (c.pasa ? 'ok    ' : 'FALLA ') + c.cum + ' ' + c.mag +
          '×  Φ″ = ' + c.phi.toExponential(4) + (c.rompe ? '  (≥ U″)' : '  (< U″)'));
      });
    } else if (l.id === 'ORDINALES') {
      l.valores.forEach(function (o) {
        console.log('      ' + (o.pasa ? 'ok    ' : 'FALLA ') + o.descripcion + '  ' +
          JSON.stringify(o.valores.map(function (v) { return +v.toExponential(4); })));
      });
    } else {
      console.log('      ' + JSON.stringify(l.valores.map(function (v) { return +v.toExponential(4); })));
    }
  });
  console.log('\nVEREDICTO: ' + (r.pasa
    ? 'PASA — la métrica correcta es contraste local; el ciclo se cierra sin tocar producción'
    : 'FALSA — el problema está en la banda de transición o en la forma de m_res: iteración (b) (#113) con prerregistro de UNA variable'));
}
