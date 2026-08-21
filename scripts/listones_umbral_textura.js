#!/usr/bin/env node
/* Listones prerregistrados de la ley de umbral de textura
   (docs/halo_v7/prerregistro_umbral_textura.md, ADR 0015).

   Este módulo NO decide el veredicto: evalúa los listones para un K dado y
   devuelve pasa/falla por listón, importando la ley de producción (ADR 0008).
   El veredicto final —con K calibrado contra el ancla de M13/200 mm/120×— es
   el ticket #99; aquí solo queda fijado, de una vez y antes de tener K, QUÉ se
   mide y CON QUÉ umbral (disciplina de listones, ADR 0012).

     node scripts/listones_umbral_textura.js <K>   volcado con un K de prueba
*/
'use strict';

var H = require('./harness_halo_v7.js');
var R = global.window.BitacoraGaiaRender;

var M13 = H.cumulo('NGC 6205');

// Centros de las 4 franjas de r/r_h del prerregistro (§2, mismas que
// docs/halo_v7/velo_granularidad.md): [0,0.25) [0.25,0.50) [0.50,1.00) [1.00,2.00).
var ANILLOS_RH = [0.125, 0.375, 0.75, 1.5];
var NUCLEO_RH = ANILLOS_RH[0];
var HALO_RH = ANILLOS_RH[3];

function indiceEn(r, rAs) {
  var mejor = 0, dMin = Infinity;
  for (var i = 0; i < r.length; i++) {
    var d = Math.abs(r[i] - rAs);
    if (d < dMin) { dMin = d; mejor = i; }
  }
  return mejor;
}

// P(ver) de la tabla radial en la franja r/r_h dada, con la ley de producción
// (R.pVerTextura vía tablaCumulo, no una copia local — ADR 0008).
function pVerEnRh(cum, D, MAG, rh) {
  var m = H.medir(cum, { D: D, MAG: MAG, sqm: 21, realization: 0 });
  return m.tabla.sGrano[indiceEn(m.tabla.r, rh * m.rhAs)];
}

// Núcleo de cada cúmulo del banco del 18″ (§3 del prerregistro), con veredicto
// observado convertido a banda de P(ver): nebuloso <0,3, moteado 0,3–0,7,
// resuelto >0,7. M62 no rompe a ningún aumento observado: banda <0,3 en todos.
var D18 = 457;
var BANCO18 = [
  { id: 'NGC 6809', nombre: 'M55', mag: 70, min: 0.3, max: 0.7 },
  { id: 'NGC 6809', nombre: 'M55', mag: 480, min: 0.7, max: Infinity },
  { id: 'NGC 6656', nombre: 'M22', mag: 98, min: 0.7, max: Infinity },
  { id: 'NGC 7099', nombre: 'M30', mag: 98, min: 0.3, max: 0.7 },
  { id: 'NGC 6266', nombre: 'M62', mag: 70, min: 0, max: 0.3 },
  { id: 'NGC 6266', nombre: 'M62', mag: 98, min: 0, max: 0.3 },
  { id: 'NGC 6266', nombre: 'M62', mag: 270, min: 0, max: 0.3 }
];

function evaluarListones() {
  var listones = [];

  var p1 = ANILLOS_RH.map(function (rh) { return pVerEnRh(M13, 200, 61, rh); });
  listones.push({
    id: 'P1', descripcion: '61×, todo el perfil: P(ver) < 0,05 en cada anillo',
    pasa: p1.every(function (p) { return p < 0.05; }), valores: p1
  });

  var p2 = [120, 173, 250].map(function (mag) { return pVerEnRh(M13, 200, mag, NUCLEO_RH); });
  listones.push({
    id: 'P2', descripcion: 'núcleo: P(ver)@120× < P(ver)@173× < P(ver)@250×',
    pasa: p2[0] < p2[1] && p2[1] < p2[2], valores: p2
  });

  var p3 = pVerEnRh(M13, 200, 250, HALO_RH);
  listones.push({
    id: 'P3', descripcion: 'halo (r/r_h 1,00–2,00) a 250×: P(ver) < 0,10',
    pasa: p3 < 0.10, valores: [p3]
  });

  var banco = BANCO18.map(function (caso) {
    var p = pVerEnRh(H.cumulo(caso.id), D18, caso.mag, NUCLEO_RH);
    return { cum: caso.nombre, mag: caso.mag, p: p, pasa: p >= caso.min && p < caso.max };
  });
  listones.push({
    id: 'BANCO18', descripcion: 'banco del 18″ (núcleo, incluye M62-no-rompe)',
    pasa: banco.every(function (c) { return c.pasa; }), valores: banco
  });

  return listones;
}

// Evalúa los listones a un K dado, con la ley activada solo durante la
// evaluación: restaura K y ACTIVO al salir, pase lo que pase.
function evaluar(K) {
  var Kprev = R.textura.K, activoPrev = R.textura.ACTIVO;
  R.textura.K = K;
  R.textura.ACTIVO = true;
  try {
    var listones = evaluarListones();
    return { K: K, pasa: listones.every(function (l) { return l.pasa; }), listones: listones };
  } finally {
    R.textura.K = Kprev;
    R.textura.ACTIVO = activoPrev;
  }
}

module.exports = { evaluar: evaluar, ANILLOS_RH: ANILLOS_RH, BANCO18: BANCO18 };

if (require.main === module) {
  var K = process.argv[2] ? Number(process.argv[2]) : R.textura.K;
  var r = evaluar(K);
  console.log('K = ' + K + '  →  ' + (r.pasa ? 'PASA' : 'FALSA') + '\n');
  r.listones.forEach(function (l) {
    console.log((l.pasa ? 'ok    ' : 'FALLA ') + l.id + ' — ' + l.descripcion);
    console.log('      ' + JSON.stringify(l.valores));
  });
}
