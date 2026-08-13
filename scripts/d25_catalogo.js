#!/usr/bin/env node
/* ¿Qué tamaños tienen DE VERDAD las galaxias del catálogo?

   La ley B del harness (scripts/harness_tamano_aparente.js) mete el diámetro de
   la isofota 25 en el término de tamaño de Cmin. El catálogo NO trae D25: trae
   r_e, n y b/a, así que D25 hay que derivarlo del perfil —el mismo perfil que
   usa el render—. Esto mide la distribución resultante para saber si las
   galaxias reales caen dentro de la ventana donde el término no está clavado en
   un clamp, o si se salen todas y el dato entonces no entra nunca en la ley.

   Sin dependencias:  node scripts/d25_catalogo.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = window.BitacoraGaiaRender, FOT = R.fot;
require('../simulador_ocular/resources/js/galaxias-datos.js');
var CAT = window.BITACORA_GALAXIAS;

var POJO = 7, D = 457, MAG_MIN = Math.ceil(D / POJO);   // 18″, aumento mínimo usable
var PLATEAU_PROV = 60, C_MAG_REF_B = PLATEAU_PROV * Math.pow(FOT.C_MAG_MIN, 1 / FOT.C_MAG_EXP);

function mu(comps, r) { return -2.5 * Math.log10(R.ps1FlujoModelo(comps, 0, 0, r)); }
function radioIsofota(comps, muObj) {          // bisección geométrica, perfil monótono
  var lo = 1e-4, hi = 1e6;
  if (mu(comps, lo) > muObj) return 0;
  for (var i = 0; i < 60; i++) {
    var m = Math.sqrt(lo * hi);
    if (mu(comps, m) <= muObj) lo = m; else hi = m;
  }
  return lo;
}

var d25 = CAT.map(function (g) {
  var comps = R.ps1ComponentesSersic({ magV: g[7], reArcsec: g[4], n: g[8], ba: g[5], bt: g[9] });
  return { nombre: g[0], magV: g[7], re: g[4], d25: 2 * radioIsofota(comps, 25) / 60 };
}).filter(function (x) { return x.d25 > 0; }).sort(function (a, b) { return a.d25 - b.d25; });

function f(v, d) { return v.toFixed(d === undefined ? 2 : d); }
function pct(p) { return d25[Math.floor(p * (d25.length - 1))].d25; }

console.log('D25 derivado del perfil del render, ' + d25.length + ' de ' + CAT.length + ' galaxias\n');
[0, 0.05, 0.25, 0.5, 0.75, 0.95, 1].forEach(function (p) {
  console.log('  p' + String(Math.round(p * 100)).padStart(3) + '   D25 = ' + f(pct(p)) + '′');
});
console.log('\n  las 5 menores: ' + d25.slice(0, 5).map(function (x) { return x.nombre + ' ' + f(x.d25); }).join(' · '));
console.log('  las 5 mayores: ' + d25.slice(-5).map(function (x) { return x.nombre + ' ' + f(x.d25, 1); }).join(' · '));

/* La ventana útil de la ley B: fuera de ella el término está clavado en un clamp
   y el D25 no entra en la ley para nada. */
var apMax = C_MAG_REF_B / FOT.C_MAG_MIN, apMin = C_MAG_REF_B / FOT.C_MAG_MAX;
console.log('\nVentana de tamaño APARENTE donde el término B no está clavado, con');
console.log('plateau provisional ' + PLATEAU_PROV + '′:  [' + f(apMin, 1) + '′, ' + f(apMax, 1) + '′]');
console.log('A ' + MAG_MIN + 'x (mínimo usable en un 18″) eso son D25 ∈ [' +
  f(apMin / MAG_MIN, 2) + '′, ' + f(apMax / MAG_MIN, 2) + '′]\n');

[MAG_MIN, 100, 200, 400].forEach(function (MAG) {
  var lo = apMin / MAG, hi = apMax / MAG;
  var dentro = d25.filter(function (x) { return x.d25 >= lo && x.d25 <= hi; }).length;
  var arriba = d25.filter(function (x) { return x.d25 > hi; }).length;
  console.log('  ' + String(MAG + 'x').padStart(5) + ': D25 útil [' + f(lo, 3) + '′, ' + f(hi, 2) +
    '′] → dentro ' + dentro + ', clavadas en C_MAG_MIN ' + arriba +
    ' (' + f(100 * arriba / d25.length, 1) + '%)');
});
console.log('\n  «clavadas en C_MAG_MIN» = el término vale ' + FOT.C_MAG_MIN +
  ' pase lo que pase con D25:\n  la ley B se comporta como una constante para ellas, y su máximo de detección\n  cae en el aumento mínimo usable.');
