#!/usr/bin/env node
/* Matriz M13 — Niveles 3 y 4 de la validación (§9). Cierra la Fase 3.

   No añade modelo: interroga al que ya hay. Traduce las cuatro filas de la
   matriz de la especificación —frases de observador— a magnitudes que el modelo
   sí sabe decir, y comprueba que salen en el orden que dice el observador:

     f_res(r)  fracción del FLUJO del anillo que va en estrellas dibujadas.
               «núcleo resuelto» = f_res alta en r < r_c; «núcleo continuo» = baja.
     r_50      radio donde f_res cruza 0,5 hacia arriba, en unidades de r_h: la
               frontera entre el velo del centro y el cúmulo hecho puntos. Inf si
               el equipo no llega a cruzarla en ningún radio.
     r_vis     radio hasta donde el velo pasa el umbral (s_halo >= 0,5), en r_h.
               «el halo exterior desaparece» = r_vis se encoge.
     s_grano   desvanecido de la textura. «granular» pide s_grano > 0.

   Nivel 3 va aparte y es de una sola variable: duplicar D con el cielo y el
   campo fijos, y duplicar M con D fijo.

   node scripts/matriz_m13.js            informe + comprobaciones
   node scripts/matriz_m13.js --perfil   añade el perfil radial de cada fila */
'use strict';

global.window = {};
global.document = undefined;
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/lf-globulares-datos.js');
require('../simulador_ocular/resources/js/globulares-datos.js');
require('../resources/js/bitacora-cumulos.js');
var R = global.window.BitacoraGaiaRender;
var C = global.window.BitacoraCumulos;
var CATALOGO = global.window.BITACORA_GLOBULARES;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

var e = CATALOGO.filter(function (f) { return f[0] === 'NGC 6205'; })[0];
var M13 = { id: e[0], ra: e[2], dec: e[3], rc: e[4], rh: e[5], c: e[6], muV0: e[7],
            Vt: e[8], dkpc: e[9], ebv: e[10], feh: e[11], elip: e[12], pa: null };

var SIZE = 720;
var pobM13 = C.poblacionCacheada(M13, 0);
var rhAs = M13.rh * 60, rcAs = pobM13.rcAs;
// Campo que cubre el cúmulo entero, para que r_vis no lo corte el lienzo.
var ARCMIN = Math.ceil(2.4 * pobM13.rtAs / 60);

/* Una fila de la matriz. Todo sale de la tabla radial que el render ya calcula:
   son las mismas cifras que pintan el píxel, no una reimplementación. */
function fila(D, MAG, sqm) {
  var difuso = new Float32Array(SIZE * SIZE);
  var res = R.pintarCumulo(difuso, M13, {
    ra0: M13.ra, dec0: M13.dec, arcmin: ARCMIN, size: SIZE,
    cielo: { pupilaSalida: D / MAG, pupilaOjo: 7, sqm: sqm, transmision: 0.9,
             aumentos: MAG, perceptual: true },
    apertura: D, estrellas: []
  });
  var pob = res.poblacion, t = res.tabla, delta = C.config.delta;
  var Ftot = pob.S1(-Infinity);              // primer momento entero de la LF
  var n = t.mRes.length;
  var fRes = new Float64Array(n);
  for (var i = 0; i < n; i++) {
    fRes[i] = (t.mRes[i] === -Infinity) ? 0 : pob.Fresuelto(t.mRes[i] + delta) / Ftot;
  }
  return {
    D: D, MAG: MAG, sqm: sqm, res: res, tabla: t, fRes: fRes,
    fResNucleo: media(fRes, t, 0, rcAs),
    r50: cruce(fRes, t, 0.5) / rhAs,
    rVis: ultimo(t.sHalo, t, 0.5) / rhAs,
    sHalo0: t.sHalo[0],
    sGranoMax: maximo(t.sGrano),
    // Cuánto le falta al grano para verse: contraste que tiene entre el que
    // H2c le pide. 1 = justo en el umbral; 0,1 = necesita diez veces más.
    granoSobreUmbral: maximo(razonGrano(t, res.cGrano, res.atenGrano)),
    estrellas: res.estrellas.length,
    fwhm: res.fwhmAs
  };
}

/* `aten` es la atenuación de v8 (θ_beam/θ_grano): σ de la tabla es la amplitud
   POR BEAM y el umbral se pide en la escala de integración, así que hay que
   promediar antes de dividir. Mezclar el umbral nuevo con la amplitud vieja daba
   grano/umbral ≈ 1 con `s_grano` = 0 en la misma fila — dos leyes distintas en la
   misma cuenta. Los dos números salen de `res`, nunca recalculados aquí. */
function razonGrano(t, cGrano, aten) {
  var v = new Float64Array(t.sigma.length);
  for (var i = 0; i < v.length; i++) {
    var fondo = cGrano.Fcielo + t.I[i];
    v[i] = fondo > 0 ? (t.sigma[i] * aten / fondo) / cGrano.Cmin : 0;
  }
  return v;
}

function media(v, t, r0As, r1As) {
  var s = 0, n = 0;
  for (var i = Math.floor(r0As / t.paso); i <= Math.floor(r1As / t.paso); i++) { s += v[i]; n++; }
  return n ? s / n : 0;
}
/* Primer radio donde v sube por encima de u. La frontera es ASCENDENTE: el
   centro está aglomerado y es hacia fuera donde el cúmulo se deshace en puntos.
   Infinity si no llega a cruzar en todo el cúmulo (frontera no alcanzada). */
function cruce(v, t, u) {
  for (var i = 1; i < v.length; i++) {
    if (v[i] >= u && v[i - 1] < u) {
      var f = (u - v[i - 1]) / (v[i] - v[i - 1]);
      return (i - 1 + f) * t.paso;
    }
  }
  return v[0] >= u ? 0 : Infinity;
}
// Último radio con v >= u: hasta dónde llega lo que se ve.
function ultimo(v, t, u) {
  for (var i = v.length - 1; i >= 0; i--) if (v[i] >= u) return i * t.paso;
  return 0;
}
function maximo(v) { var m = 0; for (var i = 0; i < v.length; i++) if (v[i] > m) m = v[i]; return m; }

function informe(titulo, filas) {
  console.log('\n' + titulo);
  console.log('  equipo          FWHM   f_res(nucleo)  r_50/r_h  r_vis/r_h  s_halo(0)  s_grano_max  grano/umbral');
  filas.forEach(function (f) {
    console.log('  ' + (f.D + ' mm ' + f.MAG + 'x ' + f.sqm.toFixed(1)).padEnd(16) +
      f.fwhm.toFixed(2).padStart(5) + '"' +
      (f.fResNucleo * 100).toFixed(1).padStart(12) + ' %' +
      f.r50.toFixed(2).padStart(10) +
      f.rVis.toFixed(2).padStart(11) +
      f.sHalo0.toFixed(3).padStart(11) +
      f.sGranoMax.toFixed(3).padStart(13) +
      f.granoSobreUmbral.toExponential(1).padStart(14));
  });
}

function perfil(f) {
  console.log('\n  perfil ' + f.D + ' mm ' + f.MAG + 'x sqm ' + f.sqm);
  console.log('    r/r_h    m_res   f_res    <I>       s_halo  s_grano');
  for (var q = 0; q <= 20; q++) {
    var rAs = q * 0.25 * rhAs;
    var i = Math.round(rAs / f.tabla.paso);
    if (i >= f.tabla.mRes.length || f.tabla.mRes[i] === -Infinity) break;
    console.log('   ' + (q * 0.25).toFixed(2).padStart(6) +
      f.tabla.mRes[i].toFixed(2).padStart(9) +
      (f.fRes[i] * 100).toFixed(1).padStart(8) +
      f.tabla.I[i].toExponential(2).padStart(11) +
      f.tabla.sHalo[i].toFixed(3).padStart(9) +
      f.tabla.sGrano[i].toFixed(3).padStart(9));
  }
}

/* ── Matriz de percepción (§9.4) ─────────────────────────────────────────── */
var F1 = fila(100, 50, 21.5);      // halo granular, borde resuelto, núcleo continuo
var F2 = fila(200, 100, 21.5);     // resolución hasta media distancia radial
var F3 = fila(400, 200, 21.5);     // núcleo mayormente resuelto
var F4 = fila(200, 200, 18.5);     // halo exterior desaparece, núcleo persiste
informe('Matriz M13 (§9.4):', [F1, F2, F3, F4]);
if (process.argv.indexOf('--perfil') >= 0) [F1, F2, F3, F4].forEach(perfil);

console.log('\nLo que dice el observador:');
ok(F1.fResNucleo < 0.10,
  '100 mm/50x: el núcleo queda continuo (' + (F1.fResNucleo * 100).toFixed(1) +
  ' % del flujo en puntos)');
ok(F1.fResNucleo < F2.fResNucleo && F2.fResNucleo <= F3.fResNucleo,
  'abrir la apertura resuelve núcleo adentro (' + [F1, F2, F3].map(function (f) {
    return (f.fResNucleo * 100).toFixed(1) + ' %';
  }).join(' → ') + ')');
ok(F1.r50 === Infinity,
  '100 mm/50x: ningún radio llega a ser mayoría de puntos, el cúmulo es velo con estrellas encima');
ok(F2.r50 > rcAs / rhAs && F2.r50 < F2.rVis,
  '200 mm/100x: la frontera cae dentro del halo visible y fuera del núcleo (' +
  F2.r50.toFixed(2) + ' r_h, con el halo hasta ' + F2.rVis.toFixed(2) + ')');
ok(F3.r50 < F2.r50,
  '400 mm/200x: y con el doble de apertura entra hasta ' + F3.r50.toFixed(2) +
  ' r_h (desde ' + F2.r50.toFixed(2) + ')');
ok(F4.rVis < 0.5 * F2.rVis,
  'con el cielo de ciudad el halo exterior se pierde (' + F2.rVis.toFixed(2) +
  ' r_h → ' + F4.rVis.toFixed(2) + ' r_h)');
ok(F4.sHalo0 > 0.5,
  'pero el núcleo persiste (s_halo(0) = ' + F4.sHalo0.toFixed(3) + ')');
/* No es una meta, es el estado registrado: si alguien toca la ley del grano o la
   LF y esto se mueve de orden de magnitud, que salte aquí y no en la pantalla.
   Y ha saltado una vez: v7 medía el 3,1 % con el beam como escala perceptual, y
   v8 mide el 12,1 % al juzgar la textura en la escala de integración. El listón
   sube del 10 % al 25 % —sigue a un orden de magnitud del techo de v7— porque lo
   que vigila es que el grano no se encienda por sorpresa, no un número concreto. */
ok([F1, F2, F3, F4].every(function (f) { return f.granoSobreUmbral < 0.25; }),
  'la textura SBF no llega al umbral con ningún equipo de la matriz (mejor caso, ' +
  (100 * Math.max(F1.granoSobreUmbral, F2.granoSobreUmbral,
    F3.granoSobreUmbral, F4.granoSobreUmbral)).toFixed(1) + ' % de lo que pide H2c)');

/* ── Nivel 3: resolución, una variable cada vez (§9.3) ───────────────────── */
console.log('\nNivel 3 — resolución (§9.3):');
var D1 = fila(100, 100, 21.5), D2 = fila(200, 100, 21.5), D4 = fila(400, 100, 21.5);
var i1rh = Math.round(rhAs / D1.tabla.paso);
var salto = (D4.tabla.mRes[i1rh] - D1.tabla.mRes[i1rh]) / 2;   // por duplicación de D
informe('  duplicar la apertura con el aumento fijo:', [D1, D2, D4]);
ok(salto > 0.5,
  'duplicar D hunde m_res en r_h ' + salto.toFixed(2) + ' mag por duplicación');
ok(D4.r50 < D2.r50 && D2.r50 < D1.r50,
  'y la frontera se mueve hacia el núcleo (' + D1.r50.toFixed(2) + ' → ' +
  D2.r50.toFixed(2) + ' → ' + D4.r50.toFixed(2) + ' r_h)');

var M100 = fila(200, 100, 21.5), M200 = fila(200, 200, 21.5);
informe('  duplicar el aumento con la apertura fija:', [M100, M200]);
var relI = 0, difI = 0;
for (var i = 0; i < M100.tabla.I.length; i++) {
  difI = Math.max(difI, Math.abs(M100.tabla.I[i] - M200.tabla.I[i]));
  relI = Math.max(relI, Math.abs(M100.tabla.I[i]));
}
/* Aquí se comprobaba que <I>(r) apenas se movía al duplicar M (< 5 % del pico).
   Eso era verdad sólo mientras m_crowd leía el PÍXEL del lienzo: con una Ω
   inflada, la aglomeración era la restricción que mandaba en casi todo el perfil
   y m_res no sabía del aumento. Con las dos Ω separadas manda m_lim,sky, que sí
   depende de M —más aumento oscurece el fondo—, y el velo se adelgaza un 11,5 %
   del pico al duplicar el aumento. No es un defecto: es la misma física que hace
   que abrir apertura deshaga el halo en estrellas.
   Lo que sí es invariante, y es lo que se comprueba ahora, es que el velo no
   tenga NINGUNA otra vía de entrada: <I> = Sigma·S1(m_res+delta) y nada más, así
   que el cociente entre las dos filas tiene que ser exactamente el de S1 en sus
   dos m_res. Cero constantes que ajustar. */
var peorVia = 0;
for (i = 0; i < M100.tabla.I.length; i++) {
  if (!(M100.tabla.I[i] > 0) || !(M200.tabla.I[i] > 0)) continue;
  var dl = C.config.delta;
  var esperado = pobM13.S1(M200.tabla.mRes[i] + dl) / pobM13.S1(M100.tabla.mRes[i] + dl);
  var d = Math.abs((M200.tabla.I[i] / M100.tabla.I[i]) / esperado - 1);
  if (d > peorVia) peorVia = d;
}
ok(peorVia < 1e-9,
  'duplicar M mueve el velo SOLO por m_res: <I> sigue siendo Sigma·S1(m_res+delta) ' +
  '(peor desvío ' + peorVia.toExponential(1) + '; el velo se adelgaza ' +
  (100 * difI / relI).toFixed(2) + ' % del pico)');
ok(M200.rVis !== M100.rVis,
  'lo que cambia es la visibilidad, no la estructura (r_vis ' + M100.rVis.toFixed(2) +
  ' → ' + M200.rVis.toFixed(2) + ' r_h)');

/* ── Lo que la matriz deja registrado, no comprobado ─────────────────────── */
console.log('\nHallazgos (§10, Fase 3):');
console.log('  · El núcleo satura en ' + (F3.fResNucleo * 100).toFixed(0) +
  ' % de flujo resuelto y no pasa de ahí: dentro manda m_crowd, que solo mejora');
console.log('    por la FWHM, y la FWHM la fija el seeing (' + F2.fwhm.toFixed(2) +
  '" a 200 mm, ' + F3.fwhm.toFixed(2) + '" a 400 mm). Abrir apertura mueve la');
console.log('    frontera hacia dentro, no vacía el centro.');
console.log('  · s_grano = 0 en las cuatro filas, y no por poco: el contraste de la textura se');
console.log('    queda entre el ' + (100 * F1.granoSobreUmbral).toFixed(1) + ' % y el ' +
  (100 * F4.granoSobreUmbral).toFixed(1) + ' % del umbral, ya juzgado en la escala de');
console.log('    integración de v8 (con el beam de v7 era entre el 0,5 % y el 3,1 %). El granulado que');
console.log('    reporta el observador son las estrellas resueltas (f_res sube del ' +
  (F1.fRes[0] * 100).toFixed(0) + ' % en el centro al ' + (maximo(F1.fRes) * 100).toFixed(0) +
  ' % en el borde con 100 mm), no la SBF.');
console.log('  · m_res gana ' + salto.toFixed(2) + ' mag por duplicación de D, no las ~1,5 de §9.3:' +
  ' el régimen no es de');
console.log('    difracción sino de aglomeración y cielo.');

console.log(fallos ? '\n' + fallos + ' fallo(s)' : '\nTodo correcto');
process.exit(fallos ? 1 : 0);
