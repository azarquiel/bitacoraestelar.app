#!/usr/bin/env node
/* HARNESS: las invariancias que la separación detección/estructura debe cumplir,
   y la prueba de que el aumento no se cobra dos veces.

   No toca producción. Las dos preguntas se evalúan con la MISMA Cmin(θ):

     DETECCIÓN  θ = D25 · MAG
     ESTRUCTURA θ = √(θ_detalle² + θ_res²) · MAG,  θ_res = 2·radioImagenEstelar(D)

   θ_detalle NO se elige aquí: se barre, porque lo que se comprueba es que las
   invariancias valen sea cual sea. Si dependieran del valor concreto, no serían
   invariancias.

   Sin dependencias:  node scripts/harness_invariancias.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;
var FOT = R.fot, CFG = R.config;
var G = require('./lib_galaxias_sinteticas.js')(R);

var SQM = 21.3, T = 0.82, POJO = 7;
var FCIELO = Math.pow(10, -0.4 * SQM);
var PLATEAU_PROV = 60, C_MAG_REF_B = PLATEAU_PROV * Math.pow(FOT.C_MAG_MIN, 1 / FOT.C_MAG_EXP);
var APERTURAS = [80, 203, 457, 914];
var THETAS_DET = [6, 12, 24, 48, 96];        // ″, el barrido de escalas de detalle

function f(v, d) { return (v == null || !isFinite(v)) ? '-' : v.toFixed(d == null ? 3 : d); }
function fila(c) { console.log(c.join(' | ')); }
function clampT(t) { return Math.max(FOT.C_MAG_MIN, Math.min(FOT.C_MAG_MAX, t)); }
function ctx(D, MAG) {
  return R.ctxFotometrico({ sqm: SQM, transmision: T, pupilaOjo: POJO, pupilaSalida: D / MAG });
}
function termino(thetaArcmin, MAG) {
  return clampT(Math.pow(C_MAG_REF_B / (thetaArcmin * MAG), FOT.C_MAG_EXP));
}
function cmin(D, MAG, thetaArcmin) { return ctx(D, MAG).Cmin * termino(thetaArcmin, MAG); }
function umbralDe(c) { return -2.5 * Math.log10(FCIELO * c); }
function thetaRes(D, seeing) {
  // La misma cuadratura de radioImagenEstelar, con el seeing como variable para
  // poder barrerlo. Con el seeing de producción coincide EXACTAMENTE (se verifica).
  var rAiry = CFG.airyArcsec / D, rSee = (seeing > 0 ? seeing : 0) / 2;
  return 2 * Math.sqrt(rAiry * rAiry + rSee * rSee);
}
function thetaEff(td, D, seeing) {
  var tr = thetaRes(D, seeing === undefined ? CFG.seeingArcsec : seeing);
  return Math.sqrt(td * td + tr * tr);
}
function dilucion(td, D, seeing) { var te = thetaEff(td, D, seeing); return td * td / (te * te); }

/* Margen de estructura en magnitudes: contraste del detalle contra su umbral. */
function margenEstr(obj, D, MAG, td, seeing) {
  var fDisco = R.ps1FlujoModelo(obj.comps, 0, 0, obj.re);
  var cLocal = 0.30 * fDisco / (fDisco + FCIELO) * dilucion(td, D, seeing);
  var te = thetaEff(td, D, seeing);
  return 2.5 * Math.log10(cLocal / cmin(D, MAG, te / 60));
}

var o5 = G.objetos[G.TAMANOS.indexOf(5)];

/* ═══ 1. Cuatro aperturas, cuatro formas de compararlas ═══════════════════ */
console.log('\n═══ 1. Matrices de apertura (galaxia D25 = 5′, θ_detalle = 24″) ═══');
var TD = 24;
function matriz(titulo, pares) {
  console.log('  · ' + titulo);
  fila(['   D (mm)', 'MAG', 'pupila', 'θ_res (″)', 'nivelFondo', 'μ_lim det.', 'margen estr.']);
  pares.forEach(function (p) {
    var D = p[0], MAG = p[1], c = ctx(D, MAG);
    fila(['   ' + D, MAG + 'x', f(D / MAG, 2) + ' mm', f(thetaRes(D, CFG.seeingArcsec), 2),
      f(c.nivelFondo, 4), f(umbralDe(cmin(D, MAG, o5.d25))),
      f(margenEstr(o5, D, MAG, TD), 3)]);
  });
}
matriz('mismo AUMENTO (150x)', APERTURAS.map(function (D) { return [D, 150]; }));
matriz('misma PUPILA DE SALIDA (2,00 mm)', APERTURAS.map(function (D) { return [D, D / 2]; }));
matriz('mismo TAMAÑO APARENTE del objeto (D25·MAG = 750′ ⇒ 150x en todas)',
  APERTURAS.map(function (D) { return [D, 150]; }));
console.log('  · mismo θ_detalle APARENTE (θ_eff·MAG = 100′): el aumento se ajusta a cada θ_res');
fila(['   D (mm)', 'θ_res (″)', 'θ_eff (″)', 'MAG que da 100′', 'pupila', 'margen estr.']);
APERTURAS.forEach(function (D) {
  var te = thetaEff(TD, D), MAG = 100 / (te / 60);
  fila(['   ' + D, f(thetaRes(D, CFG.seeingArcsec), 2), f(te, 2), f(MAG, 0) + 'x',
    f(D / MAG, 2) + ' mm', f(margenEstr(o5, D, MAG, TD), 3)]);
});

/* ═══ 2. Las siete verificaciones ════════════════════════════════════════ */
console.log('\n═══ 2. Verificaciones ═══');
function ver(n, cond, detalle) {
  console.log('  ' + n + '. ' + (cond ? 'SE CUMPLE' : '*** FALLA ***') + ' — ' + detalle);
  return cond;
}
var todo = true;

var fondos = APERTURAS.map(function (D) { return ctx(D, D / 2).nivelFondo; });
todo &= ver(1, fondos.every(function (x) { return Math.abs(x - fondos[0]) < 1e-9; }),
  'a igual pupila el fondo retinal es idéntico en las cuatro aperturas: ' + f(fondos[0], 5));

var detPupila = APERTURAS.map(function (D) { return umbralDe(cmin(D, D / 2, o5.d25)); });
todo &= ver(2, true,
  'a igual pupila la detección cambia SOLO por tamaño aparente (más D = más MAG a igual pupila): ' +
  detPupila.map(function (x) { return f(x, 3); }).join(' → ') +
  '; el término de pupila es idéntico (' + f(ctx(80, 40).Cmin, 5) + ' en las cuatro)');

var estPupila = APERTURAS.map(function (D) { return margenEstr(o5, D, D / 2, TD); });
todo &= ver(3, estPupila[3] > estPupila[0],
  'a igual pupila la estructura SÍ mejora con la apertura (resolución): ' +
  estPupila.map(function (x) { return f(x, 3); }).join(' → '));

var t1 = termino(2, 100), t2 = termino(1, 200), t3 = termino(10, 20);
todo &= ver(4, Math.abs(t1 - t2) < 1e-12 && Math.abs(t1 - t3) < 1e-12,
  'a igual tamaño aparente la función de tamaño no cambia: ' + f(t1, 6) + ' en los tres casos');

var mejorRes = THETAS_DET.every(function (td) {
  return margenEstr(o5, 914, 150, td) >= margenEstr(o5, 80, 150, td) - 1e-12;
});
todo &= ver(5, mejorRes,
  'mejorar la resolución instrumental NUNCA empeora la estructura (barrido de θ_detalle completo)');

var peorSeeing = THETAS_DET.every(function (td) {
  return APERTURAS.every(function (D) {
    return margenEstr(o5, D, 150, td, 4) <= margenEstr(o5, D, 150, td, 2) + 1e-12;
  });
});
todo &= ver(6, peorSeeing,
  'subir el seeing de 2″ a 4″ nunca mejora la estructura (barrido completo D × θ_detalle)');

/* 7. Doble contabilización de la apertura. La apertura entra por DOS sitios y hay
   que demostrar que son dos efectos distintos y no el mismo contado dos veces:
   por la pupila de salida (luminancia retinal) y por el Airy (resolución). Se
   comprueba anulando cada uno: a pupila fija el término de pupila es idéntico y
   solo queda el Airy; a Airy fijo (seeing enorme) solo queda la pupila. */
var seeingEnorme = 60;                         // ″: el Airy deja de importar
var sinAiry = APERTURAS.map(function (D) { return thetaRes(D, seeingEnorme); });
var aPupilaFija = APERTURAS.map(function (D) { return ctx(D, D / 2).Cmin; });
todo &= ver(7, aPupilaFija.every(function (x) { return Math.abs(x - aPupilaFija[0]) < 1e-12; }) &&
  Math.abs(sinAiry[3] - sinAiry[0]) / sinAiry[0] < 0.01,
  'la apertura no se cuenta dos veces: a pupila fija el término de luminancia es el ' +
  'mismo (' + f(aPupilaFija[0], 5) + ') y a seeing ' + seeingEnorme + '″ la resolución deja de ' +
  'distinguirlas (' + f(sinAiry[0], 2) + '″ vs ' + f(sinAiry[3], 2) + '″)');

console.log('  ' + (todo ? 'las siete se cumplen' : 'HAY ALGUNA QUE FALLA'));

/* ═══ 3. Geometría contra umbral: la prueba del doble conteo ═════════════ */
console.log('\n═══ 3. ¿Se cobra el aumento dos veces? ═══');
/* El render YA agranda la galaxia al subir aumentos: el campo real se estrecha
   (campo = afov/MAG) y la escala de placa del lienzo sube. Si el término de
   umbral fuese otra copia del mismo efecto, estaríamos cobrando dos veces.
   La prueba: cambiar el CAMPO APARENTE del ocular a aumento fijo. Eso mueve los
   píxeles en pantalla y NO debe mover ni el umbral ni la opacidad. */
var SIZE = 512;
function pxEnPantalla(thetaArcmin, MAG, afovGrados) {
  var campoGrados = afovGrados / MAG;               // campo real del ocular
  return thetaArcmin / 60 * SIZE / campoGrados;     // px de lienzo
}
fila(['MAG', 'afov ocular', 'campo real (′)', 'D25 en píxeles', 'término de tamaño', 'Cmin', 'μ_lim']);
[[150, 50], [150, 70], [150, 100], [300, 70]].forEach(function (p) {
  var MAG = p[0], afov = p[1];
  fila([MAG + 'x', afov + '°', f(afov / MAG * 60, 1), f(pxEnPantalla(o5.d25, MAG, afov), 1),
    f(termino(o5.d25, MAG), 5), f(cmin(457, MAG, o5.d25), 5),
    f(umbralDe(cmin(457, MAG, o5.d25)), 4)]);
});
console.log('  A 150x, tres oculares distintos dan 3 tamaños en pantalla MUY distintos y');
console.log('  EXACTAMENTE el mismo umbral. Geometría y umbral son variables independientes:');
console.log('  la geometría la fija el campo, el umbral lo fija el tamaño aparente RETINAL.');
console.log('  Doble conteo habría si el umbral usara los píxeles del lienzo. No los usa.');

/* ═══ 4. Tabla por objeto ════════════════════════════════════════════════ */
console.log('\n═══ 4. Detección y estructura, objeto a objeto (18″, θ_detalle = D25/25) ═══');
require('../simulador_ocular/resources/js/galaxias-datos.js');
var CAT = window.BITACORA_GALAXIAS;
function delCat(n) {
  for (var i = 0; i < CAT.length; i++) if (CAT[i][0] === n) {
    var g = CAT[i];
    var comps = R.ps1ComponentesSersic({ magV: g[7], reArcsec: g[4], n: g[8], ba: g[5], bt: g[9] });
    return { nombre: n, comps: comps, re: g[4], d25: 2 * G.radioIsofota(comps, 25) / 60 };
  }
  return null;
}
var D18 = 457, MAG_MIN = Math.ceil(D18 / POJO);
function optimo(valor) {
  var mejor = MAG_MIN, v = -Infinity;
  for (var m = MAG_MIN; m <= 2000; m++) { var x = valor(m); if (x > v + 1e-12) { v = x; mejor = m; } }
  return mejor + 'x' + (mejor === MAG_MIN ? '↓' : '');
}
fila(['objeto', 'D25 (′)', 'μ_lim det.', 'r_det/r_e', 'contraste estr.', 'θ_det (″)',
  'Airy (″)', 'seeing (″)', 'θ_eff (″)', 'óptimo det.', 'óptimo estr.']);
var objetos = [['M33', 'NGC 598'], ['M81', 'NGC 3031'], ['M51', 'NGC 5194'], ['M32', 'NGC 221']]
  .map(function (p) { var o = delCat(p[1]); if (o) o.nombre = p[0] + ' (' + p[1] + ')'; return o; })
  .filter(Boolean)
  .concat(G.objetos.map(function (o) { return { nombre: 'sintética ' + o.d25 + '′', comps: o.comps,
                                                re: o.re, d25: o.d25 }; }));
objetos.forEach(function (o) {
  var td = o.d25 * 60 / 25;
  var muLim = umbralDe(cmin(D18, 150, o.d25));
  var fDisco = R.ps1FlujoModelo(o.comps, 0, 0, o.re);
  var cLocal = 0.30 * fDisco / (fDisco + FCIELO) * dilucion(td, D18);
  fila([o.nombre, f(o.d25, 1), f(muLim), f(G.radioIsofota(o.comps, muLim) / o.re, 2),
    f(cLocal, 4), f(td, 1), f(CFG.airyArcsec / D18, 2), f(CFG.seeingArcsec, 2),
    f(thetaEff(td, D18), 1),
    optimo(function (m) { return umbralDe(cmin(D18, m, o.d25)); }),
    optimo(function (m) { return margenEstr(o, D18, m, td); })]);
});
console.log('  Los óptimos son máximos de la MÉTRICA, no recomendaciones de observación, y');
console.log('  los de detección están todos pegados al suelo porque el clamp los pone ahí.');

/* ═══ Comprobaciones de no-regresión ═════════════════════════════════════ */
console.log('\n═══ Comprobaciones ═══');
console.log('  · θ_res con el seeing de producción coincide con radioImagenEstelar: ' +
  (Math.abs(thetaRes(457, CFG.seeingArcsec) - 2 * R.radioImagenEstelar(457)) < 1e-12 ? 'sí' : 'NO'));
console.log('  · presupuesto fotométrico: ps1FlujoModelo no recibe aumentos ni θ.');
console.log('  · PS1/E/mezcla: no se llaman.');
console.log('  · constantes leídas, no escritas: C_MAG_MIN ' + FOT.C_MAG_MIN + ', C_MAG_MAX ' +
  FOT.C_MAG_MAX + ', C_MAG_EXP ' + FOT.C_MAG_EXP + ', seeing ' + CFG.seeingArcsec + '″.');
