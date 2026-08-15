#!/usr/bin/env node
/* FASE 2 — BARRIDO DE deltaPlena (medida, no test).

   Se corre DESPUÉS de fijar C_MAG_EXP (fase 1, scripts/barrido_cmagexp.js) y
   con él quieto. deltaExp no se toca.

   Qué NO mueve deltaPlena: el umbral. μ_lim = sbUmbralContraste sale de Cmin y
   deltaMin, y deltaMin es 0. O sea, dónde el objeto DESAPARECE no es asunto de
   esta perilla y no cambia en todo el barrido. Lo que decide deltaPlena es a
   cuántas magnitudes por encima del umbral el objeto llega a opacidad plena:

     μ_plena = μ_lim − deltaPlena

   Con deltaPlena grande el objeto sale translúcido en casi todo su cuerpo; con
   deltaPlena pequeño satura enseguida y se aplana el detalle interno.

   Se mide sobre las dos galaxias de la matriz, en los cuatro casos A/B/C/D, y
   además contra los aumentos.

   Sin dependencias:  node scripts/barrido_deltaplena.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;
var PS1 = R.ps1;

var SQM = 21.3, T = 0.82, POJO = 7, SIZE = 200, PARCHE_PX = 96;
var DELTAS = [1.0, 1.5, 2.0, 2.5, 3.25];
var BASE = PS1.deltaPlena;

var GALAXIAS = [
  { nombre: 'M81  (brillo alto)', magV: 6.94, reArcsec: 200, n: 3, ba: 0.52, pa: 157, bt: 0.35 },
  { nombre: 'M101 (brillo bajo)', magV: 7.86, reArcsec: 330, n: 1, ba: 0.98, pa: 30,  bt: 0.05 }
];
var CASOS = [
  { id: 'A', etiqueta: '8″ 150x',  D: 203, MAG: 150 },
  { id: 'B', etiqueta: '18″ 150x', D: 457, MAG: 150 },
  { id: 'C', etiqueta: '8″ 81x',   D: 203, MAG: 203 / 2.5 },
  { id: 'D', etiqueta: '18″ 183x', D: 457, MAG: 457 / 2.5 }
];

function cieloDe(caso) {
  return { sqm: SQM, transmision: T, pupilaOjo: POJO, aumentos: caso.MAG,
           pupilaSalida: caso.D / caso.MAG, perceptual: true, realceMax: PS1.realceMax };
}
function conDelta(d, fn) {
  PS1.deltaPlena = d;
  try { return fn(); } finally { PS1.deltaPlena = BASE; }
}

/* Perfil por el eje mayor: para cada radio, el flujo máximo sobre 36 azimutes.
   Sale de ps1FlujoModelo, o sea del MISMO perfil que pinta el render. */
function perfil(gal, r) {
  var comps = R.ps1ComponentesSersic(gal), max = 0;
  for (var k = 0; k < 36; k++) {
    var a = k * Math.PI / 18;
    var f = R.ps1FlujoModelo(comps, gal.pa, r * Math.cos(a), r * Math.sin(a));
    if (f > max) max = f;
  }
  return max;
}

/* Radio (en r_e) donde la opacidad cruza `nivel`. Búsqueda por bisección sobre
   un perfil monótono decreciente. */
function radioCruce(gal, umbral, nivel) {
  var lo = 1e-3, hi = 12 * gal.reArcsec;
  function op(r) { return R.ps1Opacidad(-2.5 * Math.log10(perfil(gal, r)), umbral); }
  if (op(lo) < nivel) return 0;
  for (var i = 0; i < 40; i++) {
    var m = 0.5 * (lo + hi);
    if (op(m) >= nivel) lo = m; else hi = m;
  }
  return lo / gal.reArcsec;
}

/* Render real por la cadena de producción, para contar píxeles y flujo.
   Campo fijo en los cuatro casos: si no, C y D ven campos distintos y el
   recuento mezcla tamaño en pantalla con umbral. */
var CAMPO_FIJO = 30;
function parcheSintetico(gal, ladoArcmin) {
  var comps = R.ps1ComponentesSersic(gal);
  var escalaAs = ladoArcmin * 60 / PARCHE_PX;
  var datos = new Float32Array(PARCHE_PX * PARCHE_PX);
  for (var y = 0; y < PARCHE_PX; y++) {
    var norte = ((PARCHE_PX - 1) / 2 - y) * escalaAs;
    for (var x = 0; x < PARCHE_PX; x++) {
      var este = ((PARCHE_PX - 1) / 2 - x) * escalaAs;
      datos[y * PARCHE_PX + x] = R.ps1FlujoModelo(comps, gal.pa, norte, este);
    }
  }
  return datos;
}
function render(gal, caso) {
  var comps = R.ps1ComponentesSersic(gal);
  var lado = Math.min(20, gal.reArcsec * 6 / 60);
  var lienzo = new Float32Array(SIZE * SIZE);
  R.ps1PintarParche(lienzo, {
    datos: parcheSintetico(gal, lado), ancho: PARCHE_PX, alto: PARCHE_PX,
    ladoArcmin: lado, ra: 10, dec: 41, comps: comps, pa: gal.pa,
    halo: R.ps1MedidasHalo(gal, comps)
  }, { ra0: 10, dec0: 41, arcmin: CAMPO_FIJO, size: SIZE, cielo: cieloDe(caso) });
  var sobre = 0, flujo = 0;
  for (var i = 0; i < lienzo.length; i++) if (lienzo[i] > 0) { sobre++; flujo += lienzo[i]; }
  return { sobre: sobre, flujo: flujo };
}

function f(v, d) { return (v == null || isNaN(v)) ? '-' : v.toFixed(d == null ? 3 : d); }
function fila(c) { console.log(c.join(' | ')); }

console.log('C_MAG_EXP fijo en ' + R.fot.C_MAG_EXP + ' · deltaExp fijo en ' + PS1.deltaExp +
  ' · deltaMin ' + PS1.deltaMin + ' · sqm ' + SQM + ' · T ' + T);

/* El umbral no depende de deltaPlena: se imprime una vez. */
console.log('\n═══ μ_lim por caso (INVARIANTE en todo el barrido) ═══');
fila(['caso', 'pupila (mm)', 'Cmin', 'μ_lim']);
CASOS.forEach(function (caso) {
  var c = R.ctxFotometrico(cieloDe(caso));
  fila([caso.id + ' ' + caso.etiqueta, f(caso.D / caso.MAG, 2), f(c.Cmin, 4),
    f(R.sbUmbralContraste(c))]);
});

GALAXIAS.forEach(function (gal) {
  console.log('\n═══ ' + gal.nombre + ' — r_e = ' + gal.reArcsec + '″ ═══');
  CASOS.forEach(function (caso) {
    var umbral = R.sbUmbralContraste(R.ctxFotometrico(cieloDe(caso)));
    console.log('— ' + caso.id + ' ' + caso.etiqueta + ' · μ_lim ' + f(umbral, 2) + ' —');
    fila(['deltaPlena', 'μ_plena', 'r(op≥0,05) r_e', 'r(op≥0,5) r_e', 'op centro',
      'op en r_e', 'px sobre cielo', 'flujo pintado']);
    DELTAS.forEach(function (d) {
      conDelta(d, function () {
        var r = render(gal, caso);
        fila([f(d, 2), f(umbral - d, 2),
          f(radioCruce(gal, umbral, 0.05), 2), f(radioCruce(gal, umbral, 0.5), 2),
          f(R.ps1Opacidad(-2.5 * Math.log10(perfil(gal, 0.5)), umbral)),
          f(R.ps1Opacidad(-2.5 * Math.log10(perfil(gal, gal.reArcsec)), umbral)),
          String(r.sobre), r.flujo.toExponential(3)]);
      });
    });
  });
});

/* Contra los aumentos: la ley tiene que mejorar en el régimen útil y luego
   estabilizarse, no dispararse. Se mira el radio detectable, que es lo que ve
   el observador, no un número interno. */
console.log('\n═══ Radio detectable (r_e, op≥0,05) contra los aumentos — M81 ═══');
var MAGS = [50, 100, 150, 222, 300, 400];
fila(['deltaPlena / equipo'].concat(MAGS.map(function (m) { return m + 'x'; })));
[{ id: '8″', D: 203 }, { id: '18″', D: 457 }].forEach(function (eq) {
  DELTAS.forEach(function (d) {
    conDelta(d, function () {
      fila([eq.id + '  dP ' + f(d, 2)].concat(MAGS.map(function (m) {
        var u = R.sbUmbralContraste(R.ctxFotometrico({ sqm: SQM, transmision: T,
          pupilaOjo: POJO, aumentos: m, pupilaSalida: eq.D / m }));
        return f(radioCruce(GALAXIAS[0], u, 0.05), 2);
      })));
    });
  });
});

/* Presupuesto fotométrico: deltaPlena es visibilidad, no fotometría. Si esto se
   mueve con la perilla, el cambio ha tocado donde no debía. */
console.log('\n═══ Presupuesto fotométrico contra deltaPlena ═══');
fila(['galaxia'].concat(DELTAS.map(function (d) { return 'dP ' + f(d, 2); })));
GALAXIAS.forEach(function (gal) {
  var lado = Math.min(20, gal.reArcsec * 6 / 60);
  var escalaAs = lado * 60 / PARCHE_PX;
  fila([gal.nombre].concat(DELTAS.map(function (d) {
    return conDelta(d, function () {
      var base = parcheSintetico(gal, lado), crudo = new Float32Array(base.length), i;
      for (i = 0; i < crudo.length; i++) crudo[i] = 1000 + base[i] * 1e9;
      var neto = R.ps1AnclarACatalogo(crudo, PARCHE_PX, PARCHE_PX, {
        magV: gal.magV, n: gal.n, reArcsec: gal.reArcsec, ladoArcmin: lado, escalaAs: escalaAs });
      var suma = 0;
      for (i = 0; i < neto.length; i++) suma += neto[i];
      var esperado = Math.pow(10, -0.4 * gal.magV) *
        Math.max(R.ps1FraccionLuz(gal.n, (lado * 60 / 2) / gal.reArcsec), 0.02);
      return f((suma * escalaAs * escalaAs / esperado - 1) * 100, 4) + ' %';
    });
  })));
});
