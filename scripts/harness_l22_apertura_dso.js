#!/usr/bin/env node
/* L2.2 del ADR 0024 (fase 2) / US-7 (#323): ¿se nota la apertura en el objeto
   difuso?

   Mide sobre las TEXTURAS de fase 2 —resolución por objeto, regla C—, no sobre
   un FITS re-descargado: 457 mm contra 914 mm, D_PSF = RMS(im457 − im914) / σ del
   cielo, con el signo correcto (914 conserva MÁS estructura que 457). Y la misma
   medida sobre el parche de fase 1 (1024 px fijos) para AC3, para dejar escritas
   las cifras de la separación de cada fase.

   Ninguna ley se reimplementa (ADR 0008): la textura sale del camino de
   producción (`ps1FuenteParche`), la PSF de `ps1PsfParche` (producción) y θ_add
   de `ps1ThetaAdd` (producción). El suavizado a 12″ para la métrica de estructura
   es el mismo utility del harness de decisión (`lib_psf_parche.js` con
   `fwhmAs = 12`): no es la ley, es la regla de medida.

   Offline: las texturas de fase 2 se leen de `scripts/fixtures/dso/` y
   `simulador_ocular/dso/` (el `fetch` de mentira de `test_sin_red_dso.js`); el
   parche de fase 1 (1024) sale de la caché de `lib_bajar_parche.js` (la deja
   `harness_decision_psf_resolucion.js` la primera vez, con red). La textura de
   fase 1 a 1024 px ya no está en disco —la recaptura R3 la reemplazó por la de
   regla C—, y su equivalente medido es ese parche de 1024 px, que L1.1 verificó
   indistinguible de la textura publicada.

   Uso:  node scripts/harness_l22_apertura_dso.js */
'use strict';

var fs = require('fs'), path = require('path');
var RAIZ = path.join(__dirname, '..');
var DIRS = [path.join(RAIZ, 'scripts', 'fixtures', 'dso'),
            path.join(RAIZ, 'simulador_ocular', 'dso')];
var BASE = 'https://textura-de-mentira/dso/';

/* fetch de mentira: sirve las texturas desde disco, nada sale a la red. */
global.fetch = function (url) {
  url = String(url);
  if (url.indexOf(BASE) !== 0) return Promise.resolve({ ok: false, status: 599 });
  var rel = url.slice(BASE.length), ruta = null;
  DIRS.forEach(function (d) {
    if (!ruta && fs.existsSync(path.join(d, rel))) ruta = path.join(d, rel);
  });
  if (!ruta) return Promise.resolve({ ok: false, status: 404 });
  var b = fs.readFileSync(ruta);
  return Promise.resolve({
    ok: true, status: 200,
    arrayBuffer: function () { return Promise.resolve(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); },
    json: function () { return Promise.resolve(JSON.parse(b.toString('utf8'))); }
  });
};

global.window = global.window || {};
require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-ps1.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-png16.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'nebulosas-datos.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'dso-texturas-datos.js'));

var R = window.BitacoraGaiaRender;
var PS1 = window.BitacoraPS1;
var CFG = PS1.cfg;
PS1.texturasUrl = BASE;                 // ps1FuenteParche arma la URL desde aquí
var P = require('./lib_psf_parche.js')(R);   // utility: solo el suavizado de 12″
var B = require('./lib_bajar_parche.js')(R);
var BANCO = require('./lib_banco_dso.js')(R);

var FWHM_A_SIGMA = 2 * Math.sqrt(2 * Math.LN2);   // 2,3548: FWHM → σ
var SUAVE_REF = 12;                               // ″, escala del suavizado del residuo
var GOLDEN = ['NGC 5194', 'NGC 3031', 'NGC 5457', 'NGC 205'];
var CUANTIL = ['NGC 3310', 'NGC 404', 'NGC 3377', 'NGC 4125', 'NGC 7331', 'NGC 205'];
var APERTURAS = [80, 203, 457, 914];

function f(v, d) { return (v == null || !isFinite(v)) ? '-' : v.toFixed(d == null ? 3 : d); }
function fila(c) { console.log('  ' + c.join(' | ')); }
function tit(t) { console.log('\n═══ ' + t + ' ═══'); }

/* σ robusta del fondo (la mediana de la imagen es cielo, no galaxia): la misma
   cuenta que usa el harness de decisión, para que los números sean comparables. */
function stats(v) {
  var s = 0, n = 0, val = [];
  for (var i = 0; i < v.length; i++) if (isFinite(v[i])) { s += v[i]; n++; val.push(v[i]); }
  val.sort(function (a, b) { return a - b; });
  var med = val.length ? val[val.length >> 1] : 0, des = [];
  for (i = 0; i < val.length; i++) des.push(Math.abs(val[i] - med));
  des.sort(function (a, b) { return a - b; });
  var mad = des.length ? des[des.length >> 1] * 1.4826 : 0;
  return { media: n ? s / n : 0, n: n, fondo: med, mad: mad };
}

function rmsDif(a, b, ref) {
  var den = ref, s2 = 0, n = 0;
  for (var i = 0; i < a.length; i++) {
    if (!isFinite(a[i]) || !isFinite(b[i])) continue;
    var d = a[i] - b[i]; s2 += d * d; n++;
  }
  return n ? Math.sqrt(s2 / n) / (den || 1) : 0;
}

/* RMS cruda de la diferencia (en flujo), sin normalizar: la magnitud física de
   la separación, que es lo que hay que comparar con la σ para ver qué mueve D. */
function rmsCruda(a, b) {
  var s2 = 0, n = 0;
  for (var i = 0; i < a.length; i++) {
    if (!isFinite(a[i]) || !isFinite(b[i])) continue;
    var d = a[i] - b[i]; s2 += d * d; n++;
  }
  return n ? Math.sqrt(s2 / n) : 0;
}

/* Estructura = RMS del residuo tras quitar la versión suavizada a 12″, en σ del
   fondo. La PSF la aplica ps1PsfParche (producción); el suavizado de referencia
   es el utility del harness, no una ley. */
function estructura(v, ancho, alto, esc, ref) {
  var sm = P.convolucionar(v, ancho, alto, esc, null, null, SUAVE_REF);
  var s2 = 0, n = 0;
  for (var i = 0; i < v.length; i++) {
    if (!isFinite(v[i]) || !isFinite(sm[i])) continue;
    var r = v[i] - sm[i]; s2 += r * r; n++;
  }
  return n ? Math.sqrt(s2 / n) / (ref || 1) : 0;
}

/* La medida clave del L2.2 sobre un parche (datos + geometría), con la PSF de
   producción a 457, 914 y el control 920 (el suelo de sensibilidad del método). */
function medir(datos, ancho, alto, escalaAs, sigmaVecino) {
  var ref = stats(datos).mad;
  var im457 = PS1.ps1PsfParche(datos, ancho, alto, escalaAs, 457);
  var im914 = PS1.ps1PsfParche(datos, ancho, alto, escalaAs, 914);
  var im920 = PS1.ps1PsfParche(datos, ancho, alto, escalaAs, 920);
  var cruda = rmsCruda(im457, im914);
  var d = rmsDif(im457, im914, ref);
  var suelo = rmsDif(im914, im920, ref);
  var e4 = estructura(im457, ancho, alto, escalaAs, ref);
  var e9 = estructura(im914, ancho, alto, escalaAs, ref);
  return {
    ref: ref, cruda: cruda, d: d, suelo: suelo, e457: e4, e914: e9,
    dVecino: (sigmaVecino > 0) ? cruda / sigmaVecino : null,
    signo: e9 > e4 ? 'sí (914 > 457)' : (e9 === e4 ? 'iguales' : 'NO'),
    sigPx457: PS1.ps1ThetaAdd(457, escalaAs) / FWHM_A_SIGMA / escalaAs,
    sigPx914: PS1.ps1ThetaAdd(914, escalaAs) / FWHM_A_SIGMA / escalaAs
  };
}

/* El `gal` de un objeto del banco, con la forma que consume ps1FuenteParche. */
var porNombre = {};
BANCO.banco().objetos.forEach(function (o) { porNombre[o.nombre] = o.gal; });

function texturaFase2(nombre) {
  var gal = porNombre[nombre];
  return gal ? PS1.ps1FuenteParche(gal, {}) : Promise.resolve(null);
}
function parcheFase1(gal) {
  return B.bajar(gal.ra, gal.dec, gal.ladoArcmin, CFG.salida);
}

/* ── El experimento ─────────────────────────────────────────────────────────── */
var cadena = Promise.resolve();
var fase2 = {};   // nombre → parche de fase 2 (para reusar en secciones 2, 4, 5)

/* ═══ 1. Las texturas de fase 2, tal cual se leen ═══ */
tit('1. Las texturas de fase 2 (regla C), tal cual las lee producción');
fila(['objeto', 'salida', 'ancho', 'escalaAs', 'σ_cielo (MAD)', 'sigmaVecino', 'cieloMotivo']);
GOLDEN.concat(CUANTIL.filter(function (n) { return GOLDEN.indexOf(n) < 0; })).forEach(function (nombre) {
  cadena = cadena.then(function () {
    return texturaFase2(nombre).then(function (p) {
      if (!p) { fila([nombre, '-', '-', '-', '-', '-', 'SIN TEXTURA']); return; }
      fase2[nombre] = p;
      var s = stats(p.datos);
      fila([nombre, p.ancho + ' px', p.ancho, f(p.escalaAs, 4) + '″/px',
            f(s.mad, 4), f(p.sigmaVecino, 4), p.cieloMotivo || '']);
    });
  });
});

/* ═══ 2. AC1: 457 vs 914 en las texturas de fase 2 ═══ */
tit('2. L2.2 (AC1) — 457 mm frente a 914 mm, en texturas de fase 2');
var ac1 = [];
cadena = cadena.then(function () {
  fila(['objeto', 'escalaAs', 'σ_px 457', 'σ_px 914', 'D_PSF(457,914)', 'D/σ_vecino',
        'suelo(914,920)', 'D/suelo', 'estr.457', 'estr.914', '¿signo ok?', '≥1σ?']);
  return GOLDEN.reduce(function (c, nombre) {
    return c.then(function () {
      var p = fase2[nombre];
      if (!p) { fila([nombre, '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-']); return; }
      var m = medir(p.datos, p.ancho, p.alto, p.escalaAs, p.sigmaVecino);
      var pasa = m.d >= 1 && m.signo === 'sí (914 > 457)';
      ac1.push({ nombre: nombre, d: m.d, dVecino: m.dVecino, signo: m.signo, pasa: pasa });
      fila([nombre, f(p.escalaAs, 4) + '″/px', f(m.sigPx457, 3), f(m.sigPx914, 3),
            f(m.d, 4), f(m.dVecino, 4), f(m.suelo, 5), m.suelo > 0 ? f(m.d / m.suelo, 0) + '×' : '∞',
            f(m.e457, 4), f(m.e914, 4), m.signo, pasa ? 'SÍ' : 'no']);
    });
  }, Promise.resolve());
});

/* ═══ 3. AC2: θ_add decrece con la apertura en los 6 cuantiles ═══ */
tit('3. AC2 — θ_add por apertura, en los seis representantes de cuantil');
var ac2ok = true;
cadena = cadena.then(function () {
  fila(['objeto', 'escalaAs'].concat(APERTURAS.map(function (D) { return 'θ_add(' + D + ')'; })).concat(['¿decrece?']));
  return CUANTIL.reduce(function (c, nombre) {
    return c.then(function () {
      var p = fase2[nombre];
      if (!p) { fila([nombre, '-']); return; }
      var vals = APERTURAS.map(function (D) { return PS1.ps1ThetaAdd(D, p.escalaAs); });
      var decrece = true;
      for (var i = 1; i < vals.length; i++) if (vals[i] > vals[i - 1] + 1e-9) decrece = false;
      if (!decrece) ac2ok = false;
      fila([nombre, f(p.escalaAs, 4) + '″/px'].concat(vals.map(function (v) { return f(v, 3) + '″'; }))
        .concat([decrece ? 'sí' : 'NO']));
    });
  }, Promise.resolve());
});

/* ═══ 4. AC3: la misma medida sobre fase 1 (1024) y fase 2 ═══ */
tit('4. AC3 — la misma medida, fase 1 (1024 fijo) frente a fase 2 (regla C)');
var fase1 = {};   // nombre → parche de fase 1 (1024)
cadena = cadena.then(function () {
  fila(['objeto', 'fase', 'salida', 'escalaAs', 'D_PSF(457,914)', 'suelo', 'D/suelo', '¿signo ok?']);
  return GOLDEN.reduce(function (c, nombre) {
    return c.then(function () {
      var gal = porNombre[nombre];
      return parcheFase1(gal).then(function (p1) {
        fase1[nombre] = p1;
        var p2 = fase2[nombre];
        var m1 = p1 ? medir(p1.datos, p1.ancho, p1.alto, p1.escalaAs, null) : null;
        var m2 = p2 ? medir(p2.datos, p2.ancho, p2.alto, p2.escalaAs, p2.sigmaVecino) : null;
        fila([nombre, 'fase 1', p1 ? p1.salida + ' px' : '-',
              p1 ? f(p1.escalaAs, 4) + '″/px' : '-',
              m1 ? f(m1.d, 4) : '-', m1 ? f(m1.suelo, 5) : '-',
              m1 && m1.suelo > 0 ? f(m1.d / m1.suelo, 0) + '×' : '∞',
              m1 ? m1.signo : '-']);
        fila(['', 'fase 2', p2 ? p2.ancho + ' px' : '-',
              p2 ? f(p2.escalaAs, 4) + '″/px' : '-',
              m2 ? f(m2.d, 4) : '-', m2 ? f(m2.suelo, 5) : '-',
              m2 && m2.suelo > 0 ? f(m2.d / m2.suelo, 0) + '×' : '∞',
              m2 ? m2.signo : '-']);
      }).catch(function (e) { fila([nombre, 'fase 1', 'FALLO', e.message || e]); });
    });
  }, Promise.resolve());
});

/* ═══ 5. La causa: σ por píxel contra diferencia cruda ═══ */
tit('5. La causa — qué mueve D_PSF: la σ por píxel o la diferencia cruda');
cadena = cadena.then(function () {
  fila(['objeto', 'σ_cielo f1', 'σ_cielo f2', 'σ₂/σ₁', 'cruda f1', 'cruda f2', 'cruda₂/cruda₁',
        'D f1', 'D f2']);
  return GOLDEN.reduce(function (c, nombre) {
    return c.then(function () {
      var p1 = fase1[nombre], p2 = fase2[nombre];
      if (!p1 || !p2) { fila([nombre, '-']); return; }
      var m1 = medir(p1.datos, p1.ancho, p1.alto, p1.escalaAs, null);
      var m2 = medir(p2.datos, p2.ancho, p2.alto, p2.escalaAs, p2.sigmaVecino);
      fila([nombre, f(m1.ref, 2), f(m2.ref, 2), f(m2.ref / m1.ref, 2) + '×',
            f(m1.cruda, 2), f(m2.cruda, 2), f(m2.cruda / m1.cruda, 2) + '×',
            f(m1.d, 3), f(m2.d, 3)]);
    });
  }, Promise.resolve());
});

/* ═══ 6. Diagnóstico: la textura de fase 2 vista a la escala de fase 1 ═══ */
tit('6. Diagnóstico — la fase 2 remuestreada a 1024 px (escala de fase 1)');
cadena = cadena.then(function () {
  fila(['objeto', 'D_PSF fase 1 (1024)', 'D_PSF fase 2 a 1024 px (2×2)', 'D_PSF fase 2 nativo']);
  return GOLDEN.reduce(function (c, nombre) {
    return c.then(function () {
      var p1 = fase1[nombre], p2 = fase2[nombre];
      if (!p1 || !p2) { fila([nombre, '-']); return; }
      // 2×2 box average de la textura de fase 2 → su parche a la escala de fase 1.
      var w = p2.ancho >> 1, h = p2.alto >> 1, d = new Float32Array(w * h);
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var i0 = (2 * y) * p2.ancho + 2 * x, s = 0, n = 0;
        for (var dy = 0; dy < 2; dy++) for (var dx = 0; dx < 2; dx++) {
          var v = p2.datos[i0 + dy * p2.ancho + dx];
          if (isFinite(v)) { s += v; n++; }
        }
        d[y * w + x] = n ? s / n : NaN;
      }
      var m = medir(d, w, h, p2.escalaAs * 2, null);
      var m1 = medir(p1.datos, p1.ancho, p1.alto, p1.escalaAs, null);
      var m2 = medir(p2.datos, p2.ancho, p2.alto, p2.escalaAs, p2.sigmaVecino);
      fila([nombre, f(m1.d, 4), f(m.d, 4), f(m2.d, 4)]);
    });
  }, Promise.resolve());
});

/* ═══ 7. Veredicto ═══ */
cadena.then(function () {
  tit('7. Veredicto L2.2');
  var ac1Pasa = ac1.length > 0 && ac1.every(function (r) { return r.pasa; });
  console.log('  AC1 (457/914 ≥ 1σ con signo correcto en los 4, en la textura nativa): ' +
    (ac1Pasa ? 'SE CUMPLE' : 'NO se cumple en alguno'));
  ac1.forEach(function (r) {
    console.log('    ' + r.nombre + ': D_PSF = ' + f(r.d, 4) + ' σ (D/σ_vecino = ' + f(r.dVecino, 4) +
      ') · signo ' + r.signo + (r.pasa ? '' : '  ← por debajo del listón'));
  });
  console.log('  AC2 (θ_add decrece con la apertura en los 6 cuantiles): ' + (ac2ok ? 'SE CUMPLE' : 'FALLA'));
  console.log('  AC3 (fase 1 frente a fase 2): cifras en las secciones 4 y 5');
  console.log('  AC4 (si < 1σ en alguno): se nombra la causa y NO se ajusta el umbral (ver informe).');
  console.log('\n  Comprobación: PS1.salida (fase 1) = ' + CFG.salida + ', sin tocar;');
  console.log('  la regla C de producción es ps1SalidaParche(lado), sin reimplementar (ADR 0008).');
}).catch(function (e) {
  console.error('harness no concluido: ' + (e && e.stack || e));
  process.exit(1);
});
