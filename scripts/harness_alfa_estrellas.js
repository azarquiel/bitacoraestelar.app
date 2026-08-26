#!/usr/bin/env node
/* Desglose de "estrellas apagadas": de dónde sale el alpha del disco de cada
   estrella de un cúmulo real, y qué cambia entre las dos ramas de alfaEstrella
   (A: rampa anclada a mlim; B: flujo absoluto, CFG.alfaPorFlujo).

   Diagnóstico que lo motivó (NGC 1245, NGC 1664, NGC 2266): el campo salía
   apagado respecto a las notas de observación y solo se animaba subiendo el SQM
   -es decir, falseando la contaminación lumínica-. Lo que ese SQM compra es
   CANTIDAD de estrellas, no brillo: ver el bloque de sensibilidad al final.

   Fixtures: scripts/fixtures/gaia/gaia_mags_<objeto>.csv (columnas g,bp_rp;
   cono de 0,25° en Gaia DR3, TAP de ESA). Solo se usan las magnitudes.

   node scripts/harness_alfa_estrellas.js [objeto] [apertura_mm] [aumentos] [afov] [sqm]
   node scripts/harness_alfa_estrellas.js ngc1664 203 100 68 20 */
'use strict';

var fs = require('fs'), path = require('path');
global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;
var CFG = R.config;

var OBJ = process.argv[2] || 'ngc1664';
var D = +(process.argv[3] || 203);
var MAG = +(process.argv[4] || 100);
var AFOV = +(process.argv[5] || 68);
var SQM = +(process.argv[6] || 20);
var T = 0.85, SIZE = 720, POJO = 7;
var arcmin = AFOV / MAG * 60;
var asPorPx = arcmin * 60 / SIZE;

var csv = path.join(__dirname, 'fixtures', 'gaia', 'gaia_mags_' + OBJ + '.csv');
var gs = fs.readFileSync(csv, 'utf8').trim().split('\n').slice(1)
  .map(function (l) { return parseFloat(l.split(',')[0]); })
  .filter(function (g) { return isFinite(g); })
  .sort(function (a, b) { return a - b; });

function mlimDe(sqm) {
  return R.magLimite({ apertura: D, aumentos: MAG, transmision: T, sqm: sqm, pupilaOjo: POJO });
}
function desglose(g, mlim) {
  var blurG = R.blurEstrella(g, D);
  var o = { afov: AFOV, apertura: D, arcmin: arcmin, size: SIZE, g: g, blur: blurG, mlim: mlim };
  var suelo = R.sueloEstrella(o), Rtot = R.radioEstrella(o);
  var dil = R.factorDilucion(suelo, Rtot);
  var rArcsec = Rtot * asPorPx;
  var sb = g + 2.5 * Math.log10(Math.PI * rArcsec * rArcsec);
  var antes = CFG.alfaPorFlujo;
  CFG.alfaPorFlujo = false; var a = R.alfaEstrella(g, mlim, rArcsec, dil);
  CFG.alfaPorFlujo = true; var b = R.alfaEstrella(g, mlim, rArcsec, dil);
  CFG.alfaPorFlujo = antes;
  return { g: g, Rtot: Rtot, rArcsec: rArcsec, sb: sb, dil: dil, A: a, B: b,
           aur: R.alfaAureola(g, D) };
}
function f(x, n) { var s = x.toFixed(n == null ? 3 : n); return ('        ' + s).slice(-8); }

var mlim = mlimDe(SQM);
var fondo = R.nivelFondo({ pupilaSalida: D / MAG, pupilaOjo: POJO, sqm: SQM, transmision: T });
var cola = -2.5 * Math.log10(CFG.glowCorte / CFG.alfaMin);

console.log(OBJ.toUpperCase() + '  D=' + D + 'mm  ' + MAG + 'x  afov=' + AFOV + '  sqm=' + SQM);
console.log('campo real ' + arcmin.toFixed(1) + "'  " + asPorPx.toFixed(3) + '"/px'
  + '   mlim=' + mlim.toFixed(2) + '   nivelFondo=' + fondo + '/255');
console.log('estrellas: ' + gs.filter(function (g) { return g <= mlim; }).length + ' resueltas, '
  + gs.filter(function (g) { return g > mlim && g <= mlim + cola; }).length + ' en glow'
  + '  (de ' + gs.length + ' en el cono)');
console.log('');
console.log('       g    R(px)   R(")   SB disco   dilucion   alfa A   alfa B    B/A   aureola');
[0, 1, 2, 4, 9, 19, 49].concat([mlim - 2, mlim - 0.5]).forEach(function (k, i) {
  var g = (i < 7) ? gs[k] : k;
  if (g == null) return;
  var d = desglose(g, mlim);
  console.log(f(d.g, 2) + f(d.Rtot, 2) + f(d.rArcsec, 2) + f(d.sb, 2) + '   '
    + f(d.dil) + f(d.A) + f(d.B) + f(d.B / d.A, 2) + f(d.aur, 4));
});

console.log('\nSensibilidad al SQM (estrella más brillante del cúmulo, g=' + gs[0].toFixed(2) + '):');
console.log('   sqm     mlim   resueltas   alfa A   alfa B');
[18, 19, 20, 21, 21.5, 22].forEach(function (sqm) {
  var m = mlimDe(sqm), d = desglose(gs[0], m);
  console.log(f(sqm, 1) + f(m, 2) + ('          ' + gs.filter(function (g) { return g <= m; }).length).slice(-12)
    + f(d.A) + f(d.B));
});

/* --saturacion: riesgo de recorte en el núcleo de un globular con 'lighter'.
   Malla acumulada con el alpha de cada estrella extendido por todo su disco
   (techo: perfil plano; el sprite real reparte menos), M13 al equipo pedido.
   Sin canvas: sirve para comparar A contra B, no para juzgar el render. */
if (process.argv.indexOf('--saturacion') >= 0) {
  var m13 = fs.readFileSync(path.join(__dirname, '..', 'simulador_ocular', 'docs',
    'validacion', 'm13_gaia_dr3.csv'), 'utf8').trim().split('\n').slice(1)
    .map(function (l) { var c = l.split(','); return [+c[0], +c[1], +c[2]]; })
    .filter(function (e) { return isFinite(e[2]); });
  var RA0 = 250.4235, DEC0 = 36.4613, N = 240;   // M13; malla gruesa, basta para el pico
  var celda = arcmin * 60 / N, cos0 = Math.cos(DEC0 * Math.PI / 180);
  console.log('\nNucleo de M13 con lighter (malla ' + N + 'x' + N + ', ' + celda.toFixed(2) + '"/celda):');
  console.log('   rama   celdas>1   pico alfa');
  [false, true].forEach(function (flag) {
    var antes = CFG.alfaPorFlujo; CFG.alfaPorFlujo = flag;
    var suma = new Float64Array(N * N);
    m13.forEach(function (e) {
      if (e[2] > mlim) return;
      var d = desglose(e[2], mlim), a = flag ? d.B : d.A;
      var cx = N / 2 - (((e[0] - RA0 + 540) % 360) - 180) * cos0 * 3600 / celda;
      var cy = N / 2 - (e[1] - DEC0) * 3600 / celda;
      var rp = Math.max(0.5, d.rArcsec / celda);
      for (var yy = Math.floor(cy - rp); yy <= cy + rp; yy++) {
        for (var xx = Math.floor(cx - rp); xx <= cx + rp; xx++) {
          if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
          if ((xx - cx) * (xx - cx) + (yy - cy) * (yy - cy) > rp * rp) continue;
          suma[yy * N + xx] += a;
        }
      }
    });
    var rec = 0, pico = 0;
    for (var q = 0; q < suma.length; q++) { if (suma[q] > 1) rec++; if (suma[q] > pico) pico = suma[q]; }
    console.log('      ' + (flag ? 'B' : 'A') + ('        ' + rec).slice(-11) + f(pico, 2));
    CFG.alfaPorFlujo = antes;
  });
}

/* --blanco: barrido de CFG.magBlanco (rama C, ADR 0019). Imprime el NIVEL EN
   PANTALLA de cada estrella, no el alpha: el alpha es solo la codificación con
   la que pintarFot vuelve a leer la capa (flujoDeValor contra Fref, y de ahí
   valorDeFlujo contra el cielo de la escena). Es ese nivel el que hay que
   comparar contra las notas de observación.
   La columna `sat` cuenta las estrellas recortadas a blanco: en cuanto la más
   brillante entra ahí, deja de responder a la apertura y el guardián
   test_alfa_apertura.js falla. Ese es el suelo útil del barrido. */
if (process.argv.indexOf('--blanco') >= 0) {
  var c = R.ctxFotometrico({
    pupilaSalida: D / MAG, pupilaOjo: POJO, sqm: SQM, transmision: T, aumentos: MAG
  });
  var muestra = [0, 1, 4, 9, 49, 99].map(function (k) { return gs[k]; })
    .filter(function (g) { return g != null && g <= mlim; });
  var resueltas = gs.filter(function (g) { return g <= mlim; });
  var nivelDe = function (g) {
    var F = R.flujoDeValor(255 * desglose(g, mlim).A, c.Fref, c.rango);
    return c.nivelFondo + R.valorDeFlujo(F, c.FcieloPintado, c.rango);
  };
  console.log('\nBarrido de magBlanco (nivel 0-255 en pantalla, fondo='
    + c.nivelFondo.toFixed(1) + '):');
  console.log('magBlanco   sat' + muestra.map(function (g) {
    return ('        g' + g.toFixed(1)).slice(-8);
  }).join(''));
  var mbAntes = CFG.magBlanco;
  [11.5, 10, 9, 8, 7, 6, 5].forEach(function (mb) {
    CFG.magBlanco = mb;
    var sat = resueltas.filter(function (g) { return desglose(g, mlim).A >= 1 - 1e-9; }).length;
    console.log(f(mb, 1) + ('      ' + sat).slice(-6)
      + muestra.map(function (g) { return f(Math.min(255, nivelDe(g)), 1); }).join(''));
  });
  CFG.magBlanco = mbAntes;
}
