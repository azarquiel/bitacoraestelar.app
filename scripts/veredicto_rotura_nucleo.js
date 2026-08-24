#!/usr/bin/env node
/* Arnés de la métrica Φ de rotura del núcleo (ADR 0016, #109).

   Φ(r) = f_res(r) · N_res(r)^(1/4) sobre el canal de estrellas resueltas de
   producción, por franja radial. No toca el render: es un instrumento de
   veredicto (simulador_ocular/docs/adr/0016-rotura-nucleo/prerregistro.md).

     N_res  nº esperado de estrellas de la franja con m < m_res(r) + Δ,
            Δ = dmagCrowd = 0,75 (banda de transición incluida; ADR 0012).
            El conteo N(≥ m+Δ) se LEE de producción invirtiendo pob.aCrowd
            (ADR 0008: a = exp(−Σ·N·π·θ_sep²), así que N = −ln a/(Σ·π·θ_sep²);
            dentro va la misma `cola` interpolada del render, no una copia), y
            el perfil Σ(r) es el de producción: es el mismo censo esperado
            para M13 y para el banco del 18″, sin depender de qué fixture de
            Gaia exista.
     f_res  F_dibujado/F_total de la franja: la fracción del flujo que el
            render dibuja EN MEDIA, con las funciones de producción
            (pob.Fdibujado, ADR 0008 — nada se reimplementa).

   m_res(r) es la tabla del render (t.mRes, P_solo del ADR 0012 + punto fijo
   del velo): M entra exclusivamente por m_lim,sky. Prohibido σ/RMS del campo
   SBF: aquí no se mira ningún campo pintado, solo el catálogo/censo de
   estrellas dibujadas.

   Un único parámetro libre, U: Φ del anillo nuclear del ancla (M13, 200 mm,
   SQM 21, 120×), leído, no elegido. Mismo anillo para el ancla y para P2.

     node scripts/veredicto_rotura_nucleo.js */
'use strict';

var H = require('./harness_halo_v7.js');
var C = global.window.BitacoraCumulos;

/* Soporte radial de N_res: los anillos del render (#98), congelados — las
   cuatro franjas de r/r_h del ADR 0015. Invariante de candado. */
var BORDES_RH = [0, 0.25, 0.50, 1.00, 2.00];
var FRANJA_NUCLEO = 0;             // ancla y P2: el MISMO anillo
var FRANJA_HALO = 3;
var DELTA = C.config.dmagCrowd;    // 0,75 — invariante, no parámetro
var EXPONENTE = 0.25;              // Robson & Graham 1981, fijo

var ANCLA = { id: 'NGC 6205', D: 200, sqm: 21, MAG: 120 };
var D18 = 457, SQM18 = 21;
var BANCO18 = [
  { id: 'NGC 6809', nombre: 'M55', mag: 70, rompe: true },
  { id: 'NGC 6809', nombre: 'M55', mag: 480, rompe: true },
  { id: 'NGC 6656', nombre: 'M22', mag: 98, rompe: true },
  { id: 'NGC 7099', nombre: 'M30', mag: 98, rompe: true },
  { id: 'NGC 6266', nombre: 'M62', mag: 70, rompe: false },
  { id: 'NGC 6266', nombre: 'M62', mag: 98, rompe: false },
  { id: 'NGC 6266', nombre: 'M62', mag: 270, rompe: false }
];

/* N(≥ m + Δ) LEÍDO de producción, no recalculado (ADR 0008): aCrowd es
   exactamente exp(−Σ(r)·N(≥ m+Δ)·π·θ_sep²) con la `cola` interpolada del
   render dentro (bitacora-cumulos.js), así que el conteo sale de invertirla.
   El suelo Number.MIN_VALUE solo protege el logaritmo si a subdesbordase a 0
   (no ocurre en ninguna configuración medida). */
function nBrillantes(pob, m, rAs, radioImagenAs) {
  var s = pob.sigma(rAs);
  if (!(s > 0) || !(radioImagenAs > 0)) return 0;
  var thSep = C.config.thetaSepRadios * radioImagenAs;
  var a = pob.aCrowd(m, rAs, radioImagenAs);
  if (a >= 1) return 0;
  return -Math.log(Math.max(a, Number.MIN_VALUE)) / (s * Math.PI * thSep * thSep);
}

/* Φ de las cuatro franjas para una medida (cúmulo + equipo) ya hecha. */
function phiFranjas(m, pob) {
  var t = m.tabla, rImg = m.radioImagenAs, rh = m.rhAs;
  var Ftot = pob.S1(-Infinity);
  var franjas = [];
  for (var q = 0; q < BORDES_RH.length - 1; q++) {
    var r0 = BORDES_RH[q] * rh, r1 = BORDES_RH[q + 1] * rh;
    var Nres = 0, fNum = 0, fDen = 0;
    for (var i = 0; i < t.r.length; i++) {
      var rAs = t.r[i];
      if (rAs < r0 || rAs >= r1) continue;
      var s = pob.sigma(rAs), w = s * rAs * t.paso;
      if (!(w > 0)) continue;
      var mRes = t.mRes[i];
      // aCrowd ya suma Δ = dmagCrowd por dentro: pasarle mRes cuenta ≥ mRes+Δ.
      Nres += 2 * Math.PI * w * nBrillantes(pob, mRes, rAs, rImg);
      fNum += w * pob.Fdibujado(mRes, rAs, rImg);
      fDen += w * Ftot;
    }
    var fRes = fDen > 0 ? fNum / fDen : 0;
    franjas.push({ rh0: BORDES_RH[q], rh1: BORDES_RH[q + 1], Nres: Nres,
                   fRes: fRes, phi: fRes * Math.pow(Nres, EXPONENTE) });
  }
  return franjas;
}

/* Una configuración completa: cúmulo + equipo → Φ por franja. */
function medirPhi(id, D, sqm, MAG) {
  var cum = H.cumulo(id);
  var pob = C.poblacionCacheada(cum, 0);
  var m = H.medir(cum, { D: D, MAG: MAG, sqm: sqm, realization: 0 });
  return { id: id, D: D, sqm: sqm, MAG: MAG, franjas: phiFranjas(m, pob) };
}

/* U se LEE en el ancla, no se elige. */
function calibrarU() {
  var m = medirPhi(ANCLA.id, ANCLA.D, ANCLA.sqm, ANCLA.MAG);
  return { U: m.franjas[FRANJA_NUCLEO].phi, ancla: m };
}

function evaluar() {
  var anc = calibrarU(), U = anc.U;
  var listones = [];

  var p1 = medirPhi('NGC 6205', 200, 21, 61).franjas.map(function (f) { return f.phi; });
  listones.push({
    id: 'P1', descripcion: 'M13 61×, los 4 anillos: Φ < U',
    pasa: p1.every(function (phi) { return phi < U; }), valores: p1
  });

  var p2 = [anc.ancla].concat([173, 250].map(function (mag) {
    return medirPhi('NGC 6205', 200, 21, mag);
  })).map(function (m) { return m.franjas[FRANJA_NUCLEO].phi; });
  listones.push({
    id: 'P2', descripcion: 'anillo nuclear (el del ancla): Φ@120× < Φ@173× < Φ@250× estricto',
    pasa: p2[0] < p2[1] && p2[1] < p2[2], valores: p2
  });

  var p3 = medirPhi('NGC 6205', 200, 21, 250).franjas[FRANJA_HALO].phi;
  listones.push({
    id: 'P3', descripcion: 'halo (r/r_h 1,00–2,00) a 250×: Φ < U',
    pasa: p3 < U, valores: [p3]
  });

  var banco = BANCO18.map(function (caso) {
    var phi = medirPhi(caso.id, D18, SQM18, caso.mag).franjas[FRANJA_NUCLEO].phi;
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
    { descripcion: 'Φ(M55 480×) > Φ(M55 70×)',
      pasa: phiBanco('M55', 480) > phiBanco('M55', 70),
      valores: [phiBanco('M55', 480), phiBanco('M55', 70)] },
    { descripcion: 'Φ(M30 98×) < Φ(M22 98×)',
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

module.exports = { medirPhi: medirPhi, calibrarU: calibrarU, evaluar: evaluar,
                   nBrillantes: nBrillantes,
                   BORDES_RH: BORDES_RH, FRANJA_NUCLEO: FRANJA_NUCLEO,
                   FRANJA_HALO: FRANJA_HALO, DELTA: DELTA,
                   EXPONENTE: EXPONENTE, ANCLA: ANCLA, BANCO18: BANCO18,
                   D18: D18, SQM18: SQM18 };

if (require.main === module) {
  var r = evaluar();
  console.log('Ancla: M13, 200 mm, SQM 21, 120×, anillo r/r_h [0, 0,25) — mismo anillo que P2');
  console.log('U = ' + r.U.toExponential(6));
  console.log('\nΦ por franja del ancla (r/r_h · N_res · f_res · Φ):');
  r.ancla.franjas.forEach(function (f) {
    console.log('  [' + f.rh0.toFixed(2) + ', ' + f.rh1.toFixed(2) + ')  N_res ' +
      f.Nres.toFixed(2).padStart(9) + '  f_res ' + f.fRes.toFixed(4) +
      '  Φ ' + f.phi.toExponential(4));
  });
  console.log('\nListones:\n');
  r.listones.forEach(function (l) {
    console.log((l.pasa ? 'ok    ' : 'FALLA ') + l.id + ' — ' + l.descripcion);
    if (l.id === 'BANCO18') {
      l.valores.forEach(function (c) {
        console.log('      ' + (c.pasa ? 'ok    ' : 'FALLA ') + c.cum + ' ' + c.mag +
          '×  Φ = ' + c.phi.toExponential(4) + (c.rompe ? '  (≥ U)' : '  (< U)'));
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
    ? 'PASA — el canal de estrellas resueltas, medido con Φ, reproduce la transición; no se necesita ley de textura en el render'
    : 'FALSA — el informe debe señalar el canal del render culpable (iteración b con prerregistro propio)'));
}
