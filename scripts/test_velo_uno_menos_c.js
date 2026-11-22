#!/usr/bin/env node
/* El velo del catálogo no cuenta dos veces la luz catalogada (#599, ADR 0039 §0 quater).

   La ausencia de doble conteo es álgebra, c + (1 − c) = 1: con los datos no se
   distingue de un desajuste del modelo de unos pocos por ciento, así que se
   comprueba aquí. Para una LF y una c(m, r) de juguete, la ley de producción
   (`pob.velo`, Capa 1; no se reimplementa, ADR 0008) cumple en m > mCutGeneracion

     V1 + Σ num·f·c  = S1(borde)      V2 + Σ num·f²·c = S2(borde)

   a < 1e-6. Control positivo: el mismo velo sin (1 − c) tiene que fallar.

   node scripts/test_velo_uno_menos_c.js */
'use strict';

global.window = {};
global.document = undefined;
// LF de juguete: dos tablas (datosLF exige dos) con la misma rejilla.
var phi = [];
for (var i = 0; i < 53; i++) phi.push(Math.pow(10, 0.3 * i / 4));   // M_V −3 … +10, sube hacia lo débil
global.window.BITACORA_LF_GLOBULARES = { version: 'juguete-599', tablas: [
  { feh: -2, m0: -3, paso: 0.25, phi: phi },
  { feh: -1, m0: -3, paso: 0.25, phi: phi }
] };
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/bitacora-cumulos.js');
var C = global.window.BitacoraCumulos;

var fallos = 0;
function eq(cond, msg) {
  if (cond) console.log('  ok  ' + msg);
  else { console.log('  FALLO  ' + msg); fallos++; }
}

// dkpc 8: m = M_V + 14,5, la LF cruza el corte de 18 con bins a los dos lados.
var pob = C.poblacion({ id: 'juguete', rc: 0.5, rh: 1, c: 1.5, muV0: 16, Vt: 6, dkpc: 8,
                        ebv: 0, feh: -1.5, elip: 0, pa: null });
var mAp = pob.magnitudes, num = pob.estrellasPorBin, MCUT = C.config.mCutGeneracion;
var borde = MCUT;
for (var b = 0; b + 1 < mAp.length; b++)
  if (mAp[b] <= MCUT && mAp[b + 1] > MCUT) borde = (mAp[b] + mAp[b + 1]) / 2;
function cJuguete(m, rAs) { return 1 / (1 + Math.pow(10, (m - (19 + rAs / 100)) / 0.3)); }

/* Error relativo máximo de la identidad, en varios radios y en los dos momentos. */
function errorIdentidad(velo) {
  var peor = 0;
  [0, 10, 50, 200].forEach(function (r) {
    [1, 2].forEach(function (exp) {
      var cat = 0;
      for (var k = 0; k < mAp.length; k++)
        if (mAp[k] > MCUT) cat += num[k] * Math.pow(10, -0.4 * exp * mAp[k]) * cJuguete(mAp[k], r);
      var total = exp === 1 ? pob.S1(borde) : pob.S2(borde);
      peor = Math.max(peor, Math.abs(velo(r, exp, cJuguete) + cat - total) / total);
    });
  });
  return peor;
}

console.log('T1 la Capa 1 expone el velo del catálogo y S4');
eq(typeof pob.velo === 'function', 'pob.velo existe');
eq(typeof pob.S4 === 'function', 'pob.S4 existe');

console.log('T2 el velo de producción aplica (1 − c): V + Σ·S·c = Σ·S, en S1 y S2');
var e = errorIdentidad(pob.velo);
eq(e < 1e-6, 'error relativo ' + e.toExponential(1) + ' < 1e-6');

console.log('T3 control positivo: el velo sin (1 − c) (doble conteo completo) falla');
var eCf = errorIdentidad(function (r, exp) { return pob.velo(r, exp, function () { return 0; }); });
eq(eCf > 1e-6, 'error relativo ' + eCf.toExponential(1) + ' > 1e-6');

console.log('T4 S4(borde) es el momento cuarto de la LF en m > mCutGeneracion');
var s4 = 0;
for (var k = 0; k < mAp.length; k++) if (mAp[k] > MCUT) s4 += num[k] * Math.pow(10, -1.6 * mAp[k]);
eq(Math.abs(pob.S4(borde) - s4) / s4 < 1e-9, 'S4(borde) = Σ num·f⁴');

if (fallos) { console.log('\n' + fallos + ' fallo(s)'); process.exit(1); }
console.log('\nOK');
