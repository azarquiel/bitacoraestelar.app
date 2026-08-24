#!/usr/bin/env node
/* Matriz de regresión de v7: M13, 47 Tuc y ω Cen × 3 aumentos × 2 cielos.

   Escribe simulador_ocular/docs/validacion/matriz_v7.json, que es la referencia archivada de la
   iteración y la entrada del test fenomenológico (test_halo_v7_e5.js). Todo con
   realization 0: las semillas son fijas y la matriz se reproduce corriendo esto
   otra vez.

   Solo NÚMEROS, ningún buffer: lo que se archiva tiene que poder leerse y
   compararse dentro de un año.

   node scripts/matriz_halo_v7.js */
'use strict';

global.window = {};
global.document = undefined;
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/lf-globulares-datos.js');
require('../simulador_ocular/resources/js/globulares-datos.js');
require('../resources/js/bitacora-cumulos.js');
var fs = require('fs');
var path = require('path');
var H = require('./harness_halo_v7.js');
var C = global.window.BitacoraCumulos;

var CUMULOS = [['NGC 6205', 'M13'], ['NGC 104', '47 Tuc'], ['NGC 5139', 'ω Cen']];
var AUMENTOS = [50, 146, 514];        // 200 mm: pupilas de 4,0 · 1,37 · 0,39 mm
var CIELOS = [21.5, 18.5];            // rural bueno y suburbano malo
var D = 200;

/* Resumen de una corrida: dónde se ve el halo, cuánto grano queda y si el
   perfil tiene codos. Las tres preguntas de la aceptación fenomenológica. */
function resumen(m) {
  var pob = C.poblacionCacheada(H.cumulo(m.id), 0);
  var rBorde = Math.min(m.rtAs, m.arcmin * 60 / 2);

  /* Hasta dónde llega cada cosa, leído de la propia ley y no estimado del campo
     pintado: `s_halo` es la visibilidad de la MANCHA y `s_grano` la de la
     TEXTURA, y las dos salen de visibilidadDifusa contra su umbral. Medir esto
     sobre el buffer sería medir de paso el sorteo de la lognormal —los píxeles
     que se apagan del todo suben la dispersión relativa y la textura parecería
     crecer justo cuando desaparece—. */
  var UMBRAL_VIS = 0.01;
  var t0 = m.tabla, rHalo = 0, rGrano = 0, sHaloNucleo = 0, sGranoNucleo = 0;
  for (var k = 0; k < t0.r.length; k++) {
    if (t0.sHalo[k] > UMBRAL_VIS) rHalo = t0.r[k];
    if (t0.sGrano[k] > UMBRAL_VIS) rGrano = t0.r[k];
    if (t0.r[k] <= m.rcAs) {
      sHaloNucleo = Math.max(sHaloNucleo, t0.sHalo[k]);
      sGranoNucleo = Math.max(sGranoNucleo, t0.sGrano[k]);
    }
  }
  var rVisible = rHalo, rNucleo = sHaloNucleo > UMBRAL_VIS ? m.rcAs : 0;

  /* Grano PINTADO, para tener también la medida sobre el buffer: dispersión
     relativa del tap perceptual dentro de la mitad interior del cúmulo. No
     decide nada por sí sola (ver arriba), pero deja constancia de lo que se ve
     en el lienzo. */
  var anillosGrano = m.perfilEn('difuso', 0, Math.min(m.rhAs, rBorde), 12);
  var granoSuma = 0, granoN = 0;
  anillosGrano.forEach(function (a) {
    if (a.n > 20 && a.I > 0) { granoSuma += a.sigma / a.I; granoN++; }
  });

  // Estructura anular: cuánto salta S1(m_res) por cada magnitud que se mueve
  // m_res entre nodos vecinos (el criterio de E4.2).
  var t = m.tabla, peorQ = 0, peorQr = 0;
  for (var i = 1; i < t.r.length; i++) {
    if (t.r[i] > 0.98 * m.rtAs) break;
    var s0 = pob.sigma(t.r[i - 1]), s1 = pob.sigma(t.r[i]);
    if (!(t.I[i] > 0) || !(t.I[i - 1] > 0) || !(s0 > 0) || !(s1 > 0)) continue;
    var d = Math.abs(-2.5 * Math.log10((t.I[i] / s1) / (t.I[i - 1] / s0)));
    var q = d / Math.max(Math.abs(t.mRes[i] - t.mRes[i - 1]), 1e-6);
    if (q > peorQ) { peorQ = q; peorQr = t.r[i]; }
  }

  return {
    id: m.id, D: m.D, MAG: m.MAG, sqm: m.sqm,
    dim: m.dim, SBe: m.SBe, Cmin: m.Cmin, radioImagenAs: m.radioImagenAs,
    rcAs: m.rcAs, rhAs: m.rhAs, rtAs: m.rtAs,
    rVisibleAs: rVisible, rVisibleEnRh: rVisible / m.rhAs,
    rGranoAs: rGrano, rGranoEnRh: rGrano / m.rhAs,
    sHaloNucleo: sHaloNucleo, sGranoNucleo: sGranoNucleo,
    nucleoVisible: rNucleo > 0,
    granoRel: granoN ? granoSuma / granoN : 0, granoAnillos: granoN,
    anularQ: peorQ, anularEnAs: peorQr,
    factorHalo: m.factores.halo.valor, factorCielo: m.factores.cielo.valor
  };
}

var filas = [];
CUMULOS.forEach(function (cu) {
  AUMENTOS.forEach(function (MAG) {
    CIELOS.forEach(function (sqm) {
      var m = H.medir(H.cumulo(cu[0]), { D: D, MAG: MAG, sqm: sqm, realization: 0 });
      var r = resumen(m);
      r.nombre = cu[1];
      filas.push(r);
      console.log(cu[1].padEnd(7), (MAG + 'x').padStart(5), 'SQM ' + sqm.toFixed(1),
        '| mancha hasta ' + r.rVisibleAs.toFixed(0).padStart(5) + '" (' +
        r.rVisibleEnRh.toFixed(2) + ' r_h)',
        '| grano hasta ' + r.rGranoAs.toFixed(0).padStart(5) + '"',
        '| núcleo ' + (r.nucleoVisible ? 'sí' : 'NO'),
        '| anular ' + r.anularQ.toFixed(3));
    });
  });
});

var salida = {
  version: 'v7', generado: new Date().toISOString().slice(0, 10),
  apertura: D, aumentos: AUMENTOS, cielos: CIELOS, realization: 0,
  filas: filas
};
var destino = path.join(__dirname, '..', 'simulador_ocular', 'docs', 'validacion', 'matriz_v7.json');
fs.writeFileSync(destino, JSON.stringify(salida, null, 1) + '\n');
console.log('\narchivada en simulador_ocular/docs/validacion/matriz_v7.json (' + filas.length + ' corridas)');
