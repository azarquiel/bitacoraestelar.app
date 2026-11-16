'use strict';
/* Cuánto crece el halo de un globular si la cola del glow (mlim, mlim+colaGlow]
   deja de cortarse dentro de r_t: los MIEMBROS del cúmulo de esa cola ya están
   en S1campo y se contarían dos veces. Cota en flujo físico.
   Uso: node scripts/harness_doble_conteo_cola.js (#570) */
var RAIZ = require('path').join(__dirname, '..') + '/';
global.window = {}; global.document = undefined;
require(RAIZ + 'resources/js/bitacora-gaia-render.js');
require(RAIZ + 'resources/js/lf-globulares-datos.js');
require(RAIZ + 'simulador_ocular/resources/js/globulares-datos.js');
require(RAIZ + 'resources/js/bitacora-cumulos.js');
var R = window.BitacoraGaiaRender, C = window.BitacoraCumulos;
var COLA = -2.5 * Math.log10(0.006 / 0.05);   // colaGlowMag (CFG.glowCorte / CFG.alfaMin)
var M_CUT = 18.0;                             // CFG.mCutGeneracion

var IDS = ['omega Cen', '47 Tuc', 'M 22', 'M 4', 'M 13', 'M 5', 'M 3', 'M 62', 'M 15', 'M 30', 'M 80', 'M 53', 'M 71', 'M 56'];
var EQUIPOS = [
  { nombre: '457mm 61x', D: 457, MAG: 61 },
  { nombre: '200mm 100x', D: 200, MAG: 100 }
];
var SQM = 21.5;

function ficha(e) {
  return { id: e[0], ra: e[2], dec: e[3], rc: e[4], rh: e[5], c: e[6], muV0: e[7], Vt: e[8], dkpc: e[9],
    ebv: e[10], feh: e[11], elip: e[12], pa: null, trager: e[13] || null };
}

function medir(cum, eq) {
  var cielo = { pupilaSalida: eq.D / eq.MAG, pupilaOjo: 7, sqm: SQM, transmision: 0.9, aumentos: eq.MAG, perceptual: true };
  var mlim = R.magLimite({ apertura: eq.D, aumentos: eq.MAG, transmision: 0.9, sqm: SQM, pupilaOjo: 7 });
  var rtArc = cum.rc * Math.pow(10, cum.c);
  var arc = Math.max(10, 2.2 * rtArc), SIZE = 240;
  var res = R.pintarCumulo(new Float32Array(SIZE * SIZE), cum, { ra0: cum.ra, dec0: cum.dec, arcmin: arc, size: SIZE,
    cielo: cielo, apertura: eq.D, estrellas: [] });
  var pob = res.poblacion, t = res.tabla, rImg = res.radioImagenAs;
  var umbral = res.cHalo.Fcielo * res.cHalo.Cmin;
  var mags = pob.magnitudes, paso = mags[1] - mags[0];
  var dExtra = 0, dHalo = 0, picoUmbral = 0, rPico = 0, picoHalo = 0;
  for (var i = 0; i < t.r.length - 1; i++) {
    var rAs = (t.r[i] + t.r[i + 1]) / 2, s = pob.sigma(rAs);
    if (!(s > 0)) continue;
    var mDesde = Math.max(t.mRes[i], mlim), mHasta = mlim + COLA, F = 0;
    for (var k = 0; k < mags.length; k++) {
      var m = mags[k];
      if (m <= mDesde || m > mHasta) continue;
      var f = pob.S1(m - paso / 2) - pob.S1(m + paso / 2);     // flujo del bin (por unidad de perfil)
      // Solo las filas de CATÁLOGO pasan: las sintéticas son miembros por
      // construcción y siguen cortándose. Gaia trae la fracción `completitud`.
      F += f * pob.completitud(m, rAs) * pob.aCrowd(m, rAs, rImg);
    }
    var dF = s * F, I = t.I[i];
    var area = 2 * Math.PI * rAs * t.paso;
    dExtra += dF * area; dHalo += I * area;
    var frac = I > 0 ? dF / I : 0;                                  // fracción contada dos veces
    var dmu = 2.5 * Math.log10(1 + dF / (res.cHalo.Fcielo + I));    // aclarado, mag/arcsec²
    if (frac > picoHalo) picoHalo = frac;
    if (dmu > picoUmbral) { picoUmbral = dmu; rPico = rAs / 60; }
  }
  return { mlim: mlim, rt: rtArc, int: dHalo > 0 ? dExtra / dHalo : 0, picoHalo: picoHalo,
    picoUmbral: picoUmbral, rPico: rPico };
}

console.log('cola del glow', COLA.toFixed(2), 'mag · sqm', SQM);
console.log('cúmulo'.padEnd(10), 'Vt'.padStart(5), 'r_t′'.padStart(6), '| equipo'.padEnd(13), 'mlim'.padStart(6),
  'dF/I ∫'.padStart(8), 'dF/I máx'.padStart(11), 'Δμ máx'.padStart(12), 'en r′'.padStart(6));
IDS.forEach(function (id) {
  var e = window.BITACORA_GLOBULARES.filter(function (f) { return f[1] === id; })[0];
  if (!e) { console.log(id, 'no está'); return; }
  var cum = ficha(e);
  EQUIPOS.forEach(function (eq) {
    var r = medir(cum, eq);
    console.log(id.padEnd(10), cum.Vt.toFixed(2).padStart(5), r.rt.toFixed(1).padStart(6), '| ' + eq.nombre.padEnd(11),
      r.mlim.toFixed(2).padStart(6), ((r.int * 100).toFixed(2) + '%').padStart(8),
      ((r.picoHalo * 100).toFixed(2) + '%').padStart(11), r.picoUmbral.toFixed(4).padStart(12), r.rPico.toFixed(1).padStart(6));
  });
});
