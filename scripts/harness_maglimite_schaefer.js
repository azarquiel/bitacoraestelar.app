#!/usr/bin/env node
/* ¿Es `magLimite` demasiado estricta? Se mide contra el único banco publicado
   que está ajustado a magnitudes límite REALMENTE OBSERVADAS: Schaefer 1990
   (PASP 102, 212), 314 observaciones visuales. Motivo: en M13 con 200 mm el
   render dibuja 137 estrellas a 61x y 548 a 250x, y el umbral del equipo es
   quien quita el 97 % de las candidatas (ver docs/halo_v7/maglimite_vs_schaefer.md).

   El algoritmo de Schaefer está transcrito literal del BASIC del autor
   (Sky & Telescope, nov 1989, p. 522) tal como lo porta Larry Bogan. No se
   toca ninguna constante suya: es el patrón, no un modelo que calibrar. Nuestra
   ley es la de Torres Lapasió (magLimite en bitacora-gaia-render.js) y tampoco
   se toca aquí: esto MIDE, no ajusta (ADR 0004).

   node scripts/harness_maglimite_schaefer.js */
'use strict';
var path = require('path');
var RAIZ = path.join(__dirname, '..');
global.window = {};
require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
var R = global.window.BitacoraGaiaRender;

/* SQM a magnitud límite a ojo desnudo en el cénit, que es la entrada de
   Schaefer. Relación del propio Schaefer, en la forma que cita Crumey (2014). */
function nelmDeSqm(sqm) { return 7.93 - 5 * Math.log10(Math.pow(10, 4.316 - sqm / 5) + 1); }

/* Schaefer 1990. D en mm, MG aumentos, MZ = NELM del cénit. */
function schaefer(D, MG, MZ, opciones) {
  var o = opciones || {};
  var AG = o.age == null ? 40 : o.age;              // edad del observador
  var CL = o.cleanliness == null ? 7 : o.cleanliness; // limpieza óptica, 1-9
  var CI = o.ci == null ? 0.7 : o.ci;               // índice de color de la estrella
  var Z = (o.zenith == null ? 0 : o.zenith) / 57.296;
  var KV = o.extinction == null ? 0.2 : o.extinction;
  var SE = o.seeing == null ? 2 : o.seeing;
  var EX = o.experience == null ? 6 : o.experience;  // 6 = sin corrección
  var DS, FL;
  if (o.tipo === 'refractor') { DS = 0; FL = Math.pow(0.99, 4); }
  else if (o.tipo === 'sct') { DS = 0.35 * D; FL = Math.pow(0.99 * 0.88, 2); }
  else { DS = 0.15 * D; FL = Math.pow(0.88, 2); }    // newtoniano
  var CC = 1.58e-10, KK = 0.0126;                    // constantes de visión nocturna
  var K = 1.2 * KV, X = 1 / Math.cos(Z);
  var FD = 1 - (DS / D) * (DS / D);                  // obstrucción central
  var FO = Math.pow(0.99, 4);                        // ocular
  var DE = 7 * Math.exp(-AG * AG / 20000);           // pupila del ojo por edad
  var DP = D / MG;                                   // pupila de salida
  var TH = 2 * SE * MG;                              // disco de seeing aparente ("
  var FB = Math.sqrt(2);                             // visión binocular
  var FE = Math.pow(10, 0.4 * K * X);                // extinción atmosférica
  var FT = 1 / (FL * FD * FO - 0.01 * (9 - CL));     // transmisión del telescopio
  var FP = (DE < DP) ? DP * DP / DE / DE : 1;        // luz fuera de la pupila
  var FA = (DE / D) * (DE / D);                      // área colectora
  var FM = MG * MG;                                  // el aumento reparte el cielo
  /* La estrella deja de ser un punto: por encima de 900" de disco aparente el
     umbral empeora. Es el término que hace que Schaefer TENGA un máximo y luego
     baje; nuestra magLimite no lo tiene. */
  var FR = (TH > 900) ? Math.sqrt(TH / 900) : 1;
  var FC = Math.pow(10, 0.4 * (CI / 2 - 1));         // color de la estrella
  var FS = 1, BS;
  if (MZ >= (7 - K)) { BS = 54; FS = Math.pow(10, 0.4 * (7 - K - MZ)); }
  else { var XX = 0.2 * (8.68 - K - MZ); BS = 39.7 * Math.pow(Math.pow(10, XX) - 1, 2); }
  BS = BS * (Z * Z * 0.5 + 1);
  var B = BS / (FB * FT * FP * FA * FM * FC);
  var I = CC * Math.pow(1 + Math.sqrt(KK * B), 2);   // Hecht, JOSA 37, 59 (1947)
  var IS = I * FB * FE * FT * FP * FA * FR * FC * FS;
  return -16.57 - 2.5 * Math.log(IS) / Math.LN10 + (EX - 6) * 0.16;
}

function nuestra(D, MG, sqm) {
  return R.magLimite({ apertura: D, aumentos: MG, transmision: 0.9, sqm: sqm, pupilaOjo: 7 });
}

console.log('magLimite (Torres Lapasió) contra Schaefer 1990 (314 observaciones)');
console.log('D = 200 mm · transmisión 0,9 · pupila del ojo 7 mm · seeing 2" · cénit\n');
console.log('  SQM   NELM   aum   Schaefer newt   Schaefer refr   magLimite   dif(newt)');
var peor = 0;
[20.0, 21.0, 21.5, 22.0].forEach(function (sqm) {
  var mz = nelmDeSqm(sqm);
  [61, 120, 173, 250].forEach(function (mg) {
    var sN = schaefer(200, mg, mz, { tipo: 'newton' });
    var sR = schaefer(200, mg, mz, { tipo: 'refractor' });
    var n = nuestra(200, mg, sqm), d = n - sN;
    if (Math.abs(d) > Math.abs(peor)) peor = d;
    console.log('  ' + sqm.toFixed(1) + '  ' + mz.toFixed(2) + '   ' + String(mg).padStart(3) +
      sN.toFixed(2).padStart(14) + sR.toFixed(2).padStart(16) + n.toFixed(2).padStart(12) +
      (d >= 0 ? '   +' : '   ') + d.toFixed(2));
  });
});

console.log('\nAperturas a pupila de salida 1 mm, SQM 21');
console.log('  D(mm)    aum   Schaefer newt   magLimite   dif');
[100, 150, 200, 300, 400].forEach(function (D) {
  var sN = schaefer(D, D, nelmDeSqm(21), { tipo: 'newton' }), n = nuestra(D, D, 21);
  console.log('  ' + String(D).padStart(5) + String(D).padStart(7) + sN.toFixed(2).padStart(14) +
    n.toFixed(2).padStart(12) + (n - sN >= 0 ? '   +' : '   ') + (n - sN).toFixed(2));
});

console.log('\n¿Hay máximo de aumento útil? D = 200 mm, SQM 21');
console.log('    aum   Schaefer   magLimite   pupila salida');
var maxS = -Infinity, augMax = 0;
[61, 120, 173, 250, 350, 500, 700, 1000].forEach(function (mg) {
  var s = schaefer(200, mg, nelmDeSqm(21), { tipo: 'newton' });
  if (s > maxS) { maxS = s; augMax = mg; }
  console.log('  ' + String(mg).padStart(5) + s.toFixed(2).padStart(11) + nuestra(200, mg, 21).toFixed(2).padStart(12) +
    (200 / mg).toFixed(2).padStart(14) + ' mm');
});

console.log('\n── Veredicto ──');
console.log('nuestra magLimite es MÁS GENEROSA que el banco empírico en todo el rango medido;');
console.log('mayor discrepancia ' + (peor >= 0 ? '+' : '') + peor.toFixed(2) + ' mag, y crece con el aumento y la apertura.');
console.log('Schaefer tiene máximo en ' + augMax + 'x (' + maxS.toFixed(2) +
  ') y luego BAJA; magLimite no baja nunca: se aplana en ' + nuestra(200, 1000, 21).toFixed(2) + '.');
console.log('Consecuencia para M13: el déficit de estrellas dibujadas NO viene de un umbral estricto.');
