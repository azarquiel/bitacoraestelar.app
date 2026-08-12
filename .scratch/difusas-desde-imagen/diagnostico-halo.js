/* Loop de diagnóstico del halo: M101 vs M81, sin red ni canvas. */
'use strict';
global.window = {};
require('/Users/isra/Documents/Código/bitacoraestelar/.claude/worktrees/difusas-desde-imagen/resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;
var PS1 = R.ps1;

var FILAS = {
  'M101 (NGC 5457)': ["NGC 5457","UGC 8981",210.80208,54.34861,379.23,0.933,0,7.76,1,0.08,0,1.31],
  'M81 (NGC 3031)': ["NGC 3031","UGC 5318",148.88958,69.06667,336.33,0.525,157,7.14,1,0.3,0,3.42]
};

function galDe(g) {
  return { nombre: g[0], ra: g[2], dec: g[3], reArcsec: g[4], ba: g[5], pa: g[6],
           magV: g[7], n: g[8], bt: g[9], nMedido: g[11] || 0,
           ladoArcmin: R.ps1LadoArcmin ? R.ps1LadoArcmin(g[4]) : Math.max(1.5, Math.min(20, 6 * g[4] / 60)) };
}

function sbe(pupila, sqm) {
  return R.ctxFotometrico({ pupilaSalida: pupila, sqm: sqm, aumentos: 100 }).SBe;
}

Object.keys(FILAS).forEach(function (nombre) {
  var g = FILAS[nombre], gal = galDe(g);
  var comps = R.ps1ComponentesSersic(gal);
  var med = R.ps1MedidasHalo(gal, comps);
  var rHalo = R.ps1RadioHaloAs(comps);
  var frac = R.ps1FraccionLuz(gal.n, (gal.ladoArcmin * 60 / 2) / gal.reArcsec);
  console.log('\n=== ' + nombre + ' ===');
  console.log('  r_e=' + gal.reArcsec + '"  lado parche=' + gal.ladoArcmin.toFixed(2) +
    "'  frac luz en parche=" + frac.toFixed(3) + (frac < PS1.fracMin ? '  <<< FUERA DEL CAMPO (fracMin)' : ''));
  console.log('  ejes isofota25: a=' + med.aArcmin.toFixed(2) + "' b=" + med.bArcmin.toFixed(2) +
    "'  mu_medio=" + med.muProm.toFixed(2) + '  puerta halo=' + R.ps1HaloActivo(med));
  console.log('  r(mu=28.5)=' + rHalo.toFixed(1) + '" = ' + (rHalo / gal.reArcsec).toFixed(2) +
    ' r_e = ' + (rHalo / 60).toFixed(2) + "'   radio del parche=" + (gal.ladoArcmin / 2).toFixed(2) + "'");

  // Perfil a lo largo del semieje mayor: mu del modelo y opacidad a varias pupilas
  var pupilas = [1, 2, 3, 4, 5, 7];
  console.log('  r[re]   r["]     mu_pix   ' + pupilas.map(function (p) { return 'op' + p + 'mm'; }).join('  '));
  [0.1, 0.25, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].forEach(function (k) {
    var r = k * gal.reArcsec;
    var F = R.ps1FlujoModelo(comps, gal.pa, r, 0);
    if (!(F > 0)) { console.log('    ' + k + '   ' + r.toFixed(0) + '   (sin flujo, fuera de rMax)'); return; }
    var mu = -2.5 * Math.log10(F);
    var ops = pupilas.map(function (p) { return R.ps1Opacidad(mu, sbe(p, 21)).toFixed(3); });
    console.log('   ' + k.toFixed(2) + '   ' + r.toFixed(0).padStart(5) + '    ' +
      mu.toFixed(2) + '    ' + ops.join('  '));
  });
});

console.log('\nSBe (SQM 21, T por defecto, 100x):');
[1, 2, 3, 4, 5, 7].forEach(function (p) { console.log('  pupila ' + p + 'mm -> SBe=' + sbe(p, 21).toFixed(2)); });
console.log('  opacidad plena exige mu_pix <= SBe - ' + PS1.deltaPlena + '; halo empieza en mu_pix < SBe');

/* Segundo síntoma: "se ven más oscuras". El techo realceMax=2 solo actúa
   cuando hay parche de imagen; sin capa, el mismo flujo va con boost libre. */
console.log('\n=== techo del realce perceptual (realceMax=' + PS1.realceMax + ') ===');
var c2 = R.ctxFotometrico({ pupilaSalida: 2, sqm: 21, aumentos: 100 });
[20, 21, 22, 23, 24].forEach(function (mu) {
  var F = Math.pow(10, -0.4 * mu);
  var s = R.visibilidadDifusa ? R.visibilidadDifusa(F, c2.Fcielo * c2.Cmin, true) : 1;
  var libre = R.realzarPerceptual(F * s, c2.Fcielo, c2.rango, s);
  var capado = R.realzarPerceptual(F * s, c2.Fcielo, c2.rango, s, PS1.realceMax);
  console.log('  mu=' + mu + '  s=' + s.toFixed(2) + '  boost libre x' + (libre / (F * s)).toFixed(2) +
    '  con techo x' + (capado / (F * s)).toFixed(2) +
    '  perdida ' + (100 * (1 - capado / libre)).toFixed(0) + '%');
});

/* Cadena COMPLETA sobre el nivel en pantalla (0-255): opacidad -> visibilidadDifusa
   -> realce con techo. Lo que el ojo ve es la diferencia con el nivel del cielo. */
console.log('\n=== M101, cadena completa, nivel en pantalla sobre el cielo ===');
var gM101 = galDe(FILAS['M101 (NGC 5457)']);
var compsM = R.ps1ComponentesSersic(gM101);
[1, 2, 3].forEach(function (p) {
  var c = R.ctxFotometrico({ pupilaSalida: p, sqm: 21, aumentos: 100 });
  var linea = [];
  [0.25, 0.5, 1, 1.5, 2, 2.5].forEach(function (k) {
    var F = R.ps1FlujoModelo(compsM, gM101.pa, k * gM101.reArcsec, 0);
    var mu = -2.5 * Math.log10(F);
    var op = R.ps1Opacidad(mu, c.SBe);
    var F2 = R.ps1FlujoConOpacidad(F, op, c);
    var s = R.visibilidadDifusa(F2, c.Fcielo * c.Cmin, true);
    var F3 = s > 0 ? R.realzarPerceptual(F2 * s, c.Fcielo, c.rango, s, PS1.realceMax) : 0;
    var dn = R.valorDeFlujo(F3, c.Fcielo, c.rango);
    linea.push(k + 're:' + dn.toFixed(1));
  });
  console.log('  pupila ' + p + 'mm (SBe ' + c.SBe.toFixed(2) + ', nivel cielo ' +
    c.nivelFondo.toFixed(1) + ') delta-DN -> ' + linea.join('  '));
});

/* Contrafactuales: (A) rampa actual, (B) deltaPlena=2.0, (C) deltaMin=-0.5,
   (D) sin rampa (solo visibilidadDifusa, el umbral que ya existe). */
console.log('\n=== M101, delta-DN a 2 y 3 mm segun variante ===');
function cadena(F, c, usaRampa) {
  if (!(F > 0)) return 0;
  var F2 = usaRampa ? R.ps1FlujoConOpacidad(F, R.ps1Opacidad(-2.5 * Math.log10(F), c.SBe), c) : F;
  var s = R.visibilidadDifusa(F2, c.Fcielo * c.Cmin, true);
  if (!(s > 0)) return 0;
  return R.valorDeFlujo(R.realzarPerceptual(F2 * s, c.Fcielo, c.rango, s, PS1.realceMax), c.Fcielo, c.rango);
}
var variantes = [
  ['A actual (0 / 3.25)', function () { PS1.deltaMin = 0.0; PS1.deltaPlena = 3.25; }, true],
  ['B plena 2.0', function () { PS1.deltaMin = 0.0; PS1.deltaPlena = 2.0; }, true],
  ['C min -0.5 / plena 3.25', function () { PS1.deltaMin = -0.5; PS1.deltaPlena = 3.25; }, true],
  ['D sin rampa', function () {}, false]
];
variantes.forEach(function (v) {
  v[1]();
  [2, 3].forEach(function (p) {
    var c = R.ctxFotometrico({ pupilaSalida: p, sqm: 21, aumentos: 100 });
    var out = [0.5, 1, 1.5, 2, 2.5, 3].map(function (k) {
      return k + 're:' + cadena(R.ps1FlujoModelo(compsM, gM101.pa, k * gM101.reArcsec, 0), c, v[2]).toFixed(1);
    });
    console.log('  ' + v[0].padEnd(24) + ' ' + p + 'mm  ' + out.join('  '));
  });
});
PS1.deltaMin = 0.0; PS1.deltaPlena = 3.25;

/* Variante E: quien manda es el techo del realce, no la rampa. */
console.log('\n=== M101, variantes con y sin techo del realce ===');
function cadena2(F, c, rampa, techo) {
  if (!(F > 0)) return 0;
  var F2 = rampa ? R.ps1FlujoConOpacidad(F, R.ps1Opacidad(-2.5 * Math.log10(F), c.SBe), c) : F;
  var s = R.visibilidadDifusa(F2, c.Fcielo * c.Cmin, true);
  if (!(s > 0)) return 0;
  return R.valorDeFlujo(R.realzarPerceptual(F2 * s, c.Fcielo, c.rango, s, techo), c.Fcielo, c.rango);
}
[['rampa 3.25 + techo 2', true, 2, 3.25], ['rampa 3.25 SIN techo', true, 0, 3.25],
 ['rampa 2.0 SIN techo', true, 0, 2.0], ['sin rampa SIN techo', false, 0, 3.25]].forEach(function (v) {
  PS1.deltaPlena = v[3];
  [2, 3, 4].forEach(function (p) {
    var c = R.ctxFotometrico({ pupilaSalida: p, sqm: 21, aumentos: 100 });
    var out = [0.5, 1, 1.5, 2, 2.5].map(function (k) {
      return k + 're:' + cadena2(R.ps1FlujoModelo(compsM, gM101.pa, k * gM101.reArcsec, 0), c, v[1], v[2]).toFixed(1);
    });
    console.log('  ' + v[0].padEnd(22) + ' ' + p + 'mm  ' + out.join('  '));
  });
});
PS1.deltaPlena = 3.25;
