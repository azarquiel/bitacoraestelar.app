#!/usr/bin/env node
/* #411, criterio 4: una galaxia NUEVA del corte 13,5 vista con 80 mm.

   (a) H2c la deja bajo el umbral. Mismo margen que scripts/campo_h2c.js:
       margen = log10(C_obj / Cmin), Cmin de ctxFotometrico con FOT.H2C activa
       y θint = ps1ThetaIntArcmin. >0 ⇒ «se empieza a pintar». Se barre lo que
       un 80 mm puede hacer: aumentos de 13x (pupila 6,2 mm) a 160x (2×D) y
       cielos de sqm 21,0 a 22,0; por galaxia se queda el MEJOR caso.
   (b) Ningún aviso nuevo. Se apunta ps1CapaGalaxias a cada galaxia nueva con
       el catálogo viejo y con el nuevo, sin red (manifiesto vacío, proxy que
       devuelve un FITS sintético), y se comparan los avisos.

   Uso:  node scripts/harness_411_h2c_80mm.js <galaxias-datos.js de main> */
'use strict';

var path = require('path');
var RAIZ = path.join(__dirname, '..');
var VIEJO = path.resolve(process.argv[2]);
var NUEVO = path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js');

function cargar(datos) {
  [path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'),
   path.join(RAIZ, 'resources', 'js', 'bitacora-ps1.js'), datos,
   path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'nebulosas-datos.js')
  ].forEach(function (m) { delete require.cache[require.resolve(m)]; });
  global.window = {};
  require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
  require(path.join(RAIZ, 'resources', 'js', 'bitacora-ps1.js'));
  require(datos);
  require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'nebulosas-datos.js'));
  window.BITACORA_DSO_TEXTURAS = [];
  window.BitacoraPS1.proxyUrl = 'https://proxy-de-mentira/ps1-proxy.php';
  return window.BITACORA_GALAXIAS;
}

var viejas = {};
cargar(VIEJO).forEach(function (g) { viejas[g[0] + '|' + g[2]] = true; });
var nuevas = cargar(NUEVO).filter(function (g) { return !viejas[g[0] + '|' + g[2]]; });

/* ── (a) margen H2c ─────────────────────────────────────────────────────── */
var R = window.BitacoraGaiaRender, P = window.BitacoraPS1, D = 80;
function margen(g, M, sqm) {
  var gal = { reArcsec: g[4], ba: g[5], pa: g[6], magV: g[7], n: g[8], bt: g[9] };
  var comps = P.ps1ComponentesSersic(gal);
  var med = P.ps1MedidasHalo(gal, comps);
  var th = P.ps1ThetaIntArcmin(comps, gal.ba);
  if (!(th > 0) || !isFinite(med.muProm)) return null;
  var ctx = R.ctxFotometrico({ pupilaSalida: D / M, pupilaOjo: 7, sqm: sqm, aumentos: M }, th);
  return Math.log10(Math.pow(10, -0.4 * (med.muProm - sqm)) / ctx.Cmin);
}
var AUMENTOS = [13, 20, 30, 40, 60, 80, 100, 120, 160], CIELOS = [21.0, 21.5, 22.0];
var mejores = [], sinModelo = 0;
nuevas.forEach(function (g) {
  var best = null;
  AUMENTOS.forEach(function (M) { CIELOS.forEach(function (s) {
    var m = margen(g, M, s);
    if (m != null && (!best || m > best.m)) best = { m: m, M: M, sqm: s };
  }); });
  if (!best) { sinModelo++; return; }
  mejores.push({ nombre: g[0], magV: g[7], re: g[4], m: best.m, M: best.M, sqm: best.sqm });
});
mejores.sort(function (a, b) { return b.m - a.m; });
var sobre = mejores.filter(function (x) { return x.m > 0; });
console.log('(a) H2c con 80 mm, mejor caso de ' + AUMENTOS.length + ' aumentos × ' + CIELOS.length + ' cielos');
console.log('    galaxias nuevas: ' + nuevas.length + ' · sin modelo: ' + sinModelo);
console.log('    sobre el umbral (margen > 0): ' + sobre.length);
console.log('    las 8 de mayor margen:');
mejores.slice(0, 8).forEach(function (x) {
  console.log('      ' + x.nombre + '  V ' + x.magV + '  r_e ' + x.re + '″  margen ' +
              (x.m >= 0 ? '+' : '') + x.m.toFixed(2) + ' dex  (' + x.M + 'x, sqm ' + x.sqm + ')');
});

/* ── (b) avisos con el corte viejo y con el nuevo ───────────────────────── */
global.fetch = function (url) {
  var q = {};
  String(url).split('?')[1].split('&').forEach(function (kv) { kv = kv.split('='); q[kv[0]] = kv[1]; });
  var n = Math.min(+q.salida, 64), esc = (+q.lado) / 60 / n;
  function t(k, v) { var r = new Array(72).join(' '); return (k + r).slice(0, 8) + '=' + (r + v).slice(-71); }
  var cab = [t('SIMPLE', 'T'), t('BITPIX', '-32'), t('NAXIS', '2'), t('NAXIS1', String(n)), t('NAXIS2', String(n)),
    t('CRVAL1', q.ra), t('CRVAL2', q.dec), t('CRPIX1', String((n + 1) / 2)), t('CRPIX2', String((n + 1) / 2)),
    t('CDELT1', String(-esc)), t('CDELT2', String(esc)), ('END' + new Array(80).join(' ')).slice(0, 80)].join('');
  var buf = new ArrayBuffer(2880 + n * n * 4), b = new Uint8Array(buf);
  for (var i = 0; i < 2880; i++) b[i] = i < cab.length ? cab.charCodeAt(i) : 32;
  var dv = new DataView(buf);
  for (i = 0; i < n * n; i++) dv.setFloat32(2880 + i * 4, 1e-9, false);
  return Promise.resolve({ ok: true, status: 200, arrayBuffer: function () { return Promise.resolve(buf); } });
};
function aviso(datos, g) {
  cargar(datos);
  var ctx = { canvas: { width: 16, height: 16 },
              createImageData: function (w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
              putImageData: function () {} };
  return window.BitacoraPS1.ps1CapaGalaxias(new Float32Array(256), ctx,
    { sqm: 21.5, pupilaSalida: 2, pupilaOjo: 7, transmision: 0.9, aumentos: 40 }, null,
    { ra0: g[2], dec0: g[3], arcmin: 20, size: 16, estrellas: [], apertura: D })
    .then(function (r) { return r.aviso; });
}
var cambios = {};
nuevas.reduce(function (p, g) {
  return p.then(function () { return aviso(VIEJO, g); }).then(function (av) {
    return aviso(NUEVO, g).then(function (an) {
      if (av !== an) {
        var k = JSON.stringify([av, an]);
        (cambios[k] = cambios[k] || []).push(g[0] + ' (Dec ' + g[3].toFixed(1) + ')');
      }
    });
  });
}, Promise.resolve()).then(function () {
  console.log('\n(b) avisos al apuntar a cada galaxia nueva, corte viejo → corte nuevo');
  var ks = Object.keys(cambios);
  if (!ks.length) console.log('    ninguno cambia');
  ks.forEach(function (k) {
    var par = JSON.parse(k);
    console.log('    «' + (par[0] || '(sin aviso)') + '» → «' + (par[1] || '(sin aviso)') + '»: ' +
                cambios[k].length + ' galaxias, p. ej. ' + cambios[k].slice(0, 3).join(', '));
  });
});
