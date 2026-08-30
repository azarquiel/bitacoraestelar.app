#!/usr/bin/env node
/* Arnés de la métrica Φ′ (densidad) de rotura del núcleo (ADR 0017).

     Φ′(r) = f_res(r) · (N_res(r) / A(r) · A_ref)^(1/4)

   Igual que Φ (ADR 0016, scripts/veredicto_rotura_nucleo.js) salvo la
   normalización: N_res deja de ser conteo absoluto y pasa a densidad
   superficial en radio propio, con A(r) = π·(r1² − r0²) en arcsec² y
   A_ref = área del anillo del ancla (constante inerte en toda comparación:
   Φ′ = Φ en el ancla por construcción). N_res, f_res, franjas, Δ y la
   lectura de producción son EXACTAMENTE los del arnés del 0016, que se
   importa — nada se duplica. No toca el render.

     node scripts/veredicto_rotura_nucleo_densidad.js */
'use strict';

var V = require('./veredicto_rotura_nucleo.js');
var H = require('./harness_halo_v7.js');

/* Área del anillo q (bordes r/r_h × r_h del cúmulo) en radio propio. */
function areaFranja(rhAs, q) {
  var r0 = V.BORDES_RH[q] * rhAs, r1 = V.BORDES_RH[q + 1] * rhAs;
  return Math.PI * (r1 * r1 - r0 * r0);
}

var A_REF = areaFranja(H.cumulo(V.ANCLA.id).rh * 60, V.FRANJA_NUCLEO);

/* Φ′ por franja: la medida del 0016 con la normalización de densidad. */
function medirPhiPrima(id, D, sqm, MAG) {
  var m = V.medirPhi(id, D, sqm, MAG);
  var rhAs = H.cumulo(id).rh * 60;
  m.franjas.forEach(function (f, q) {
    f.area = areaFranja(rhAs, q);
    f.phiPrima = f.fRes * Math.pow(f.Nres / f.area * A_REF, V.EXPONENTE);
  });
  return m;
}

function calibrarU() {
  var m = medirPhiPrima(V.ANCLA.id, V.ANCLA.D, V.ANCLA.sqm, V.ANCLA.MAG);
  return { U: m.franjas[V.FRANJA_NUCLEO].phiPrima, ancla: m };
}

function evaluar() {
  var anc = calibrarU(), U = anc.U;
  var listones = [];

  var p1 = medirPhiPrima('NGC 6205', 200, 21, 61).franjas.map(function (f) { return f.phiPrima; });
  listones.push({
    id: 'P1', descripcion: 'M13 61×, los 4 anillos: Φ′ < U′',
    pasa: p1.every(function (phi) { return phi < U; }), valores: p1
  });

  var p2 = [anc.ancla].concat([173, 250].map(function (mag) {
    return medirPhiPrima('NGC 6205', 200, 21, mag);
  })).map(function (m) { return m.franjas[V.FRANJA_NUCLEO].phiPrima; });
  listones.push({
    id: 'P2', descripcion: 'anillo nuclear (el del ancla): Φ′@120× < Φ′@173× < Φ′@250× estricto',
    pasa: p2[0] < p2[1] && p2[1] < p2[2], valores: p2
  });

  var p3 = medirPhiPrima('NGC 6205', 200, 21, 250).franjas[V.FRANJA_HALO].phiPrima;
  listones.push({
    id: 'P3', descripcion: 'halo (r/r_h 1,00–2,00) a 250×: Φ′ < U′',
    pasa: p3 < U, valores: [p3]
  });

  var banco = V.BANCO18.map(function (caso) {
    var phi = medirPhiPrima(caso.id, V.D18, V.SQM18, caso.mag).franjas[V.FRANJA_NUCLEO].phiPrima;
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
    { descripcion: 'Φ′(M55 480×) > Φ′(M55 70×)',
      pasa: phiBanco('M55', 480) > phiBanco('M55', 70),
      valores: [phiBanco('M55', 480), phiBanco('M55', 70)] },
    { descripcion: 'Φ′(M30 98×) < Φ′(M22 98×)',
      pasa: phiBanco('M30', 98) < phiBanco('M22', 98),
      valores: [phiBanco('M30', 98), phiBanco('M22', 98)] }
  ];
  listones.push({
    id: 'ORDINALES', descripcion: 'ordinales sin constantes nuevas',
    pasa: ordinales.every(function (o) { return o.pasa; }), valores: ordinales
  });

  return { U: U, A_REF: A_REF, ancla: anc.ancla, listones: listones,
           pasa: listones.every(function (l) { return l.pasa; }) };
}

module.exports = { medirPhiPrima: medirPhiPrima, calibrarU: calibrarU,
                   evaluar: evaluar, areaFranja: areaFranja, A_REF: A_REF };

if (require.main === module) {
  var r = evaluar();
  console.log('Ancla: M13, 200 mm, SQM 21, 120×, anillo r/r_h [0, 0,25) — mismo anillo que P2');
  console.log('A_ref = ' + r.A_REF.toExponential(6) + ' arcsec² (área del anillo del ancla)');
  console.log('U′ = ' + r.U.toExponential(6));
  console.log('\nΦ′ por franja del ancla (r/r_h · N_res · área · f_res · Φ′):');
  r.ancla.franjas.forEach(function (f) {
    console.log('  [' + f.rh0.toFixed(2) + ', ' + f.rh1.toFixed(2) + ')  N_res ' +
      f.Nres.toFixed(2).padStart(9) + '  A ' + f.area.toExponential(3) +
      '  f_res ' + f.fRes.toFixed(4) + '  Φ′ ' + f.phiPrima.toExponential(4));
  });
  console.log('\nListones:\n');
  r.listones.forEach(function (l) {
    console.log((l.pasa ? 'ok    ' : 'FALLA ') + l.id + ' — ' + l.descripcion);
    if (l.id === 'BANCO18') {
      l.valores.forEach(function (c) {
        console.log('      ' + (c.pasa ? 'ok    ' : 'FALLA ') + c.cum + ' ' + c.mag +
          '×  Φ′ = ' + c.phi.toExponential(4) + (c.rompe ? '  (≥ U′)' : '  (< U′)'));
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
    ? 'PASA — Φ′ es la métrica definitiva; el ciclo se cierra sin tocar producción'
    : 'FALSA — el problema está en el render: la iteración (b) (#113) se abre con prerregistro de UNA variable'));
}
