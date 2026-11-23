#!/usr/bin/env node
/* #594 · La completitud del catálogo conoce el corte de la consulta a Gaia.

   Por la interfaz pública (pob.completitud, pob.velo, pob.sinteticas,
   pintarCumulo, magConsultaGaia):
     AC1  c(m, r, G_c) = c(m, r)·[G(m) ≤ G_c], con G del color sintético del
          bin (no la mediana del spike), interpolado dentro del bin.
     AC3  con el corte por debajo de mCutGeneracion (80 mm a 40×…) el hueco
          entre magQ y 18 que las sintéticas no cubren queda bajo m_res.
     AC4  la realización no depende del equipo: misma población y mismas
          sintéticas con cualquier telescopio (ADR 0039 «Parámetros»).
     AC5  la banda (fondo.corte, magQ] de un banco por encima del techo no
          añade flujo al velo con G_c = magQ; con G_c = fondo.corte sí (caso
          malo de referencia). El G_c = magQ que llega en `estrellas.corte`
          lo fija test_banco_globular.js.

   node scripts/test_completitud_corte.js */
'use strict';

global.window = {};
global.document = undefined;
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/lf-globulares-datos.js');
require('../simulador_ocular/resources/js/globulares-datos.js');
require('../resources/js/bitacora-cumulos.js');
var R = global.window.BitacoraGaiaRender, C = global.window.BitacoraCumulos;

var fallos = 0;
function ok(cond, msg) {
  if (cond) console.log('  ok   ' + msg);
  else { fallos++; console.error('  FALLA ' + msg); }
}

var M13 = C.fichaDeFila(global.window.BITACORA_GLOBULARES.filter(function (f) { return f[0] === 'NGC 6205'; })[0]);
var pob = C.poblacion(M13);
var mAp = pob.magnitudes, PASO = mAp[1] - mAp[0];

console.log('AC1 c(m, r, G_c) = c(m, r)·[G(m) ≤ G_c]');
// G − V de los colores sintéticos (Riello et al. 2021): todos azulean G respecto a V.
var gv = [C.config.bprpGigante, C.config.bprpSubgigante, C.config.bprpSecuencia].map(R.gMenosV);
ok(gv.every(function (d) { return d < 0; }), 'los tres colores sintéticos tienen G < V (' + gv.map(function (d) { return d.toFixed(3); }).join(', ') + ')');
// Lejos del corte: igual que sin corte por arriba, 0 por abajo.
ok(pob.completitud(15, 300, 18.5) === pob.completitud(15, 300), 'V = 15 con G_c = 18,5: la c de siempre');
ok(pob.completitud(20, 300, 18.5) === 0, 'V = 20 con G_c = 18,5: 0 (la consulta no la pidió)');
ok(pob.completitud(15, 300, undefined) === pob.completitud(15, 300), 'sin corte: la c de siempre');
// En el corte: el bin cuyo G cae justo en G_c vale la mitad (interpolado dentro del bin).
var kSec = 0;
while (mAp[kSec] - pob.dm < 3.5) kSec++;
var kCorte = kSec + 40, gBin = mAp[kCorte] + R.gMenosV(C.config.bprpSecuencia);
var media = pob.completitud(mAp[kCorte], 300, gBin) / pob.completitud(mAp[kCorte], 300);
ok(Math.abs(media - 0.5) < 1e-9, 'bin con G = G_c: fracción 0,5 (' + media.toFixed(4) + ')');
/* No la mediana del spike (V − G = 0,109): en la rama gigante G − V = −0,366 y
   con la mediana el bin cuyo G está en G_c caería fuera entero (fracción 0). */
var kGig = 0;
while (mAp[kGig] - pob.dm < -1) kGig++;
var gGig = mAp[kGig] + R.gMenosV(C.config.bprpGigante);
var fGig = pob.completitud(mAp[kGig], 300, gGig) / pob.completitud(mAp[kGig], 300);
var fMediana = Math.max(0, Math.min(1, (gGig + 0.109 - mAp[kGig]) / PASO + 0.5));
ok(Math.abs(fGig - 0.5) < 1e-9 && fMediana === 0,
   'gigante con G = G_c: 0,5 con su color (' + fGig.toFixed(3) + '), la mediana daría ' + fMediana.toFixed(3));
var monotona = true, prev = 1;
for (var m = 17; m < 21; m += 0.01) {
  var c = pob.completitud(m, 300, 18.5);
  if (c > prev + 1e-12) monotona = false;
  prev = c;
}
ok(monotona, 'c(m, r, G_c) decrece con m (sin escalones hacia arriba)');

console.log('AC3 con el corte por debajo de 18, el hueco queda bajo m_res');
/* Las sintéticas usan c sin corte: las estrellas con G entre magQ y 18 se dan
   por traídas y no se generan. Ese hueco es invisible si ninguna de ellas pasa
   m ≤ m_res en ningún radio. La más brillante del hueco es la de G = magQ con
   el color que más azulea G: V = magQ − min(G − V). Peor caso de m_res: el
   cielo más oscuro que admite la UI (el mismo con que se calcula magConsultaGaia). */
var vMinHueco = function (magQ) { return magQ - Math.min.apply(null, gv); };
[[80, 40], [80, 20], [120, 60], [150, 75], [200, 100]].forEach(function (eq) {
  var D = eq[0], A = eq[1];
  var magQ = Math.ceil(R.magConsultaGaia(D, 0.9, A) / 0.5 - 1e-9) * 0.5;
  if (magQ >= C.config.mCutGeneracion) return;
  var cielo = { pupilaSalida: D / A, pupilaOjo: 7, sqm: 22, transmision: 0.9, aumentos: A, perceptual: true };
  var res = R.pintarCumulo(new Float32Array(120 * 120), M13, {
    ra0: M13.ra, dec0: M13.dec, arcmin: 40, size: 120, cielo: cielo, apertura: D, estrellas: []
  });
  var mResMax = Math.max.apply(null, Array.prototype.filter.call(res.tabla.mRes, isFinite));
  ok(mResMax < vMinHueco(magQ), D + ' mm a ' + A + '×: magQ ' + magQ.toFixed(1) + ', m_res máx ' + mResMax.toFixed(2) +
     ' < ' + vMinHueco(magQ).toFixed(2) + ' (V más brillante del hueco)');
});

console.log('AC4 la realización no depende del equipo (ADR 0039 «Parámetros», #594)');
function pinta(D, A) {
  var cielo = { pupilaSalida: D / A, pupilaOjo: 7, sqm: 21, transmision: 0.9, aumentos: A, perceptual: true };
  return R.pintarCumulo(new Float32Array(60 * 60), M13, {
    ra0: M13.ra, dec0: M13.dec, arcmin: 20, size: 60, cielo: cielo, apertura: D, estrellas: []
  });
}
var chico = pinta(80, 40), grande = pinta(467, 173);
ok(chico.poblacion === grande.poblacion, 'la misma población cacheada con 80 mm y con 467 mm');
var libres = C.poblacion(M13).sinteticas({ ra: M13.ra, dec: M13.dec });
ok(JSON.stringify(chico.poblacion.sinteticas({ ra: M13.ra, dec: M13.dec })) === JSON.stringify(libres),
   'y las mismas sintéticas que una población recién hecha: el corte no entra en la realización');
/* Lo que pintarCumulo pide a la realización: solo dónde y cuál, nada del
   equipo. (Contar las sintéticas dibujadas no sirve: en M13 ninguna pasa
   m_res y aCrowd.) Si el corte entrara en las sintéticas por las opciones del
   render, aparecería aquí una clave nueva. */
[[80, 40], [467, 173]].forEach(function (eq) {
  var pob0 = C.poblacionCacheada(M13), orig = pob0.sinteticas, claves = [];
  pob0.sinteticas = function (o) { claves.push(Object.keys(o).sort().join(',')); return orig(o); };
  try { pinta(eq[0], eq[1]); } finally { pob0.sinteticas = orig; }
  ok(claves.length > 0 && claves.every(function (k) { return k === 'dec,ra,realization'; }),
     eq[0] + ' mm: pintarCumulo pide sintéticas solo con {' + claves[0] + '}');
});

console.log('AC5 la banda (fondo.corte, magQ] no añade flujo al velo con G_c = magQ');
/* Banco por encima del techo: filas hasta fondo.corte, el resto en fondo →
   veloSB. La luz de la banda ya entra por veloSB: el velo (1 − c) no puede
   añadirla otra vez. Referencia: el velo sin corte de consulta. */
var MAGQ = 18.5, FCORTE = 16.4, R_AS = 300;   // un magQ por debajo del techo de 20 (200 mm a 100×: 18,0)
function enBanda(m) { var g = m + R.gMenosV(C.config.bprpSecuencia); return g > FCORTE + PASO && g < MAGQ - PASO; }
function veloBanda(gC) {
  var cBanda = function (m, r) { return enBanda(m) ? pob.completitud(m, r, gC) : 1; };
  return pob.velo(R_AS, 1, cBanda, -Infinity);
}
var ref = (function () {
  var c0 = function (m, r) { return enBanda(m) ? pob.completitud(m, r) : 1; };
  return pob.velo(R_AS, 1, c0, -Infinity);
})();
var bueno = veloBanda(MAGQ), malo = veloBanda(FCORTE);
ok(Math.abs(bueno / ref - 1) < 1e-9, 'G_c = magQ: el velo de la banda es el de siempre (razón ' + (bueno / ref).toFixed(6) + ')');
/* Prerregistro (AGENTS.md): el caso malo, G_c = fondo.corte, mete la banda
   entera en (1 − c) — doble conteo con veloSB. Tiene que salir del listón. */
ok(malo / ref > 1.5, 'caso malo G_c = fondo.corte: el velo de la banda crece ×' + (malo / ref).toFixed(1) + ' (el listón 1e-9 lo rechaza)');

console.log(fallos === 0 ? '\n✓ Todo correcto.' : '\n✗ ' + fallos + ' fallo(s).');
process.exit(fallos === 0 ? 0 : 1);
