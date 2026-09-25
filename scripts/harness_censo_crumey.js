#!/usr/bin/env node
/* Consecuencia contable del corte de Crumey (#340, épica #337).

   #339 midió DÓNDE aplana magLimite (316× con 200 mm, cielo 21,5) frente a
   Crumey (141×). Esto mide CUÁNTO importa: cuántas estrellas de M13 entran y
   salen, y cómo se mueven la frontera resuelta/no-resuelta y el corte de la
   niebla, si el techo de SB0T fuera el fondo nulo de Crumey (25,08, ADR-0030)
   en vez del suelo del ojo de Torres Lapasió (27).

   La variante NO toca producción (criterio 5): se carga el render en un
   contexto aislado con el literal del techo sustituido en el código fuente, así
   que pintarCumulo, el punto fijo del velo y la niebla la recorren enteras sin
   reimplementar ninguna ley (ADR 0008).

   node scripts/harness_censo_crumey.js */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var RAIZ = path.join(__dirname, '..');

var TECHO_PROD = 'SB0T = Math.min(27, Math.max(sqm, SB0T));';
var FUENTES = ['resources/js/bitacora-gaia-render.js', 'resources/js/lf-globulares-datos.js',
               'simulador_ocular/resources/js/globulares-datos.js', 'resources/js/bitacora-cumulos.js'];

/* Render + cúmulos en un contexto propio, con el techo de SB0T en `techo`.
   Aborta si el literal no aparece exactamente una vez: si alguien lo mueve, la
   variante dejaría de ser la que dice ser sin avisar. */
function cargarRender(techo) {
  var ctx = { window: {}, document: undefined, console: console };
  vm.createContext(ctx);
  FUENTES.forEach(function (f) {
    var src = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    if (f === FUENTES[0]) {
      var partes = src.split(TECHO_PROD);
      if (partes.length !== 2) throw new Error('el techo de SB0T aparece ' + (partes.length - 1) + ' veces en ' + f);
      src = partes.join('SB0T = Math.min(' + techo + ', Math.max(sqm, SB0T));');
    }
    vm.runInContext(src, ctx, { filename: f });
  });
  // #342 activó el corte por la Ec. 70; este harness mide el del techo de SB0T.
  ctx.window.BitacoraGaiaRender.fot.SB_FONDO_NULO = null;
  return { techo: techo, R: ctx.window.BitacoraGaiaRender, C: ctx.window.BitacoraCumulos,
           GLOBULARES: ctx.window.BITACORA_GLOBULARES };
}

/* Criterio 1: magLimite de 20× a 600× de uno en uno. `baja` dice si la curva
   tiene un máximo interior (algún aumento rinde menos que uno anterior);
   `plano`, el primer aumento desde el que ya no sube nada. */
var T = 0.9, OJO = 7;
function barrido(R, D, sqm) {
  var puntos = [];
  for (var M = 20; M <= 600; M++) {
    puntos.push({ aumentos: M, m: R.magLimite({ apertura: D, aumentos: M, transmision: T, sqm: sqm, pupilaOjo: OJO }) });
  }
  var max = puntos[0], baja = false;
  puntos.forEach(function (p) {
    if (p.m > max.m) max = p;
    else if (p.m < max.m) baja = true;
  });
  var ult = puntos[puntos.length - 1];
  var plano = null;
  for (var i = puntos.length - 1; i > 0 && puntos[i - 1].m === ult.m; i--) plano = puntos[i - 1].aumentos;
  return { D: D, sqm: sqm, puntos: puntos, aumentoMax: max.aumentos, mMax: max.m, baja: baja, plano: plano };
}

/* Criterio 2: la escena de M13 del embudo de maglimite_vs_schaefer.md (fixture
   Gaia, campo 28′, lienzo 720 px). Cuenta lo mismo que harness_halo_estrellas:
   `censoLimpio` = Gaia con G ≤ mlim del cielo limpio; `dibujadas` = lo que
   devuelve pintarCumulo y sobrevive al corte mlim de capaEstrellas (casilla 4,
   la magnitud de detección). */
var SIZE = 720, ARCMIN = 0.47 * 60;
var GAIA = fs.readFileSync(path.join(RAIZ, 'simulador_ocular/docs/validacion/m13_gaia_dr3.csv'), 'utf8')
  .trim().split('\n').slice(1).map(function (l) {
    var c = l.split(',');
    return [+c[0], +c[1], +c[2], c[3] === '' ? null : +c[3]];
  });

function cumuloM13(V) {
  var e = V.GLOBULARES.filter(function (f) { return f[0] === 'NGC 6205'; })[0];
  return { id: e[0], ra: e[2], dec: e[3], rc: e[4], rh: e[5], c: e[6], muV0: e[7],
           Vt: e[8], dkpc: e[9], ebv: e[10], feh: e[11], elip: e[12], pa: null };
}
function m13(V) { return V.C.poblacionCacheada(cumuloM13(V), 0); }

// `campo` = { size, arcmin } opcional; por defecto el del embudo.
function escenaM13(V, D, MAG, sqm, realization, campo) {
  var M13 = cumuloM13(V);
  var size = (campo && campo.size) || SIZE, arcmin = (campo && campo.arcmin) || ARCMIN;
  var cielo = { pupilaSalida: D / MAG, pupilaOjo: OJO, sqm: sqm, transmision: T, aumentos: MAG, perceptual: true };
  var mlim = V.R.magLimite({ apertura: D, aumentos: MAG, transmision: T, sqm: sqm, pupilaOjo: OJO });
  var limpias = GAIA.filter(function (s) { return s[2] <= mlim; });
  var res = V.R.pintarCumulo(new Float32Array(size * size), M13, {
    ra0: M13.ra, dec0: M13.dec, arcmin: arcmin, size: size, cielo: cielo, apertura: D,
    estrellas: limpias, realization: realization || 0
  });
  var dibujadas = res.estrellas.filter(function (s) { return (s[4] != null ? s[4] : s[2]) <= mlim; }).length;
  return { techo: V.techo, D: D, MAG: MAG, sqm: sqm, mlim: mlim, censoLimpio: limpias.length, dibujadas: dibujadas,
           res: res, M13: M13, cielo: cielo };
}

/* Criterio 3a: frontera resuelta/no-resuelta, con las definiciones de
   matriz_m13.js. f_res(r) = fracción del flujo del anillo que va en estrellas
   dibujadas; `fResNucleo` su media en r < r_c; `r50` el primer radio donde
   cruza 0,5 hacia arriba, en r_h (Infinity si no cruza). */
function frontera(esc) {
  var pob = esc.res.poblacion, t = esc.res.tabla, rImg = esc.res.radioImagenAs;
  var Ftot = pob.S1(-Infinity), n = t.mRes.length, f = new Float64Array(n);
  for (var i = 0; i < n; i++) f[i] = (t.mRes[i] === -Infinity) ? 0 : pob.Fdibujado(t.mRes[i], t.r[i], rImg) / Ftot;
  var s = 0, k = 0;
  for (i = 0; i <= Math.floor(pob.rcAs / t.paso); i++) { s += f[i]; k++; }
  var r50 = f[0] >= 0.5 ? 0 : Infinity;
  for (i = 1; i < n; i++) {
    if (f[i] >= 0.5 && f[i - 1] < 0.5) { r50 = (i - 1 + (0.5 - f[i - 1]) / (f[i] - f[i - 1])) * t.paso; break; }
  }
  return { fResNucleo: k ? s / k : 0, r50: r50 / (esc.M13.rh * 60), mResCentro: t.mRes[0] };
}

/* Criterio 3b: la niebla del campo. La pinta nieblaCampo con las estrellas del
   fixture más débiles que corte = mlim + cola de glow, y mlimNiebla cierra el
   lazo H2 niebla → velo → mlim. Se mide sin pintar (difuso null), con la misma
   ley de producción. */
function niebla(V, esc) {
  var o = { ra0: esc.M13.ra, dec0: esc.M13.dec, arcmin: ARCMIN, size: SIZE, mlim: esc.mlim,
            cielo: Object.assign({}, esc.cielo), apertura: esc.D };
  // colaGlowMag() del render, que no se exporta: −2,5·log10(glowCorte/alfaMin).
  var corte = esc.mlim - 2.5 * Math.log10(V.R.config.glowCorte / V.R.config.alfaMin);
  var total = V.R.nieblaCampo(null, GAIA, o);
  var nBanda = GAIA.filter(function (s) { return s[2] > corte; }).length;
  var mlimH2 = V.R.mlimNiebla(GAIA, o);
  return { mlim: esc.mlim, corte: corte, nBanda: nBanda, total: total, sb: V.R.sbNiebla(total, ARCMIN), mlimH2: mlimH2 };
}

/* Criterio 4: el ruido de la escena es el del sorteo del ADR 0012, igual que
   en test_conservacion_sorteo.js. Candidatas = estrellas de Gaia dentro del
   cúmulo con m ≤ m_res(r), m_res interpolada de la tabla del render; cada una
   entra con probabilidad a(m,r). Poisson-binomial: E = Σa, σ² = Σa(1−a). */
function sorteo(esc) {
  var pob = esc.res.poblacion, t = esc.res.tabla, rImg = esc.res.radioImagenAs;
  var cos0 = Math.cos(esc.M13.dec * Math.PI / 180), ult = t.r.length - 1;
  var n = 0, E = 0, V = 0;
  GAIA.forEach(function (s) {
    var rAs = pob.radioPropio((((s[0] - esc.M13.ra + 540) % 360) - 180) * cos0 * 3600, (s[1] - esc.M13.dec) * 3600);
    if (!(rAs >= 0) || rAs >= t.r[ult]) return;
    var u = rAs / t.paso, i = Math.floor(u), f = u - i, a = t.mRes[i], b = t.mRes[i + 1];
    var mRes = !isFinite(a) ? b : (!isFinite(b) ? a : a * (1 - f) + b * f);
    if (!isFinite(mRes) || s[2] > mRes) return;
    var p = pob.aCrowd(s[2], rAs, rImg);
    n++; E += p; V += p * (1 - p);
  });
  return { candidatas: n, esperanza: E, sigma: Math.sqrt(V) };
}

module.exports = { cargarRender: cargarRender, barrido: barrido, m13: m13, escenaM13: escenaM13,
                   frontera: frontera, niebla: niebla, sorteo: sorteo };
if (require.main !== module) return;

var PROD = cargarRender(27), CRUMEY = cargarRender(25.08);
var FECHA = new Date().toISOString().slice(0, 10);
function f2(x) { return (x >= 0 ? '+' : '') + x.toFixed(2); }
console.log('Consecuencia contable del corte de Crumey · ' + FECHA);
console.log('Ley actual: techo de SB0T = 27. Variante: 25,08 (fondo nulo de Crumey, ADR-0030). t = ' + T + ', ojo ' + OJO + ' mm.\n');

/* ── 1. Barrido de magLimite, 20× a 600× ─────────────────────────────────── */
console.log('1 · magLimite de 20× a 600× (cielo 21,5)');
[200, 450].forEach(function (D) {
  [PROD, CRUMEY].forEach(function (V) {
    var b = barrido(V.R, D, 21.5);
    var muestra = [20, 50, 100, 141, 200, 250, 319, 350, 450, 600].map(function (M) {
      return M + '×:' + b.puntos[M - 20].m.toFixed(2);
    }).join('  ');
    console.log('  ' + FECHA + ' · ' + D + ' mm · techo ' + V.techo + ' · ' +
      (b.baja ? 'MÁXIMO INTERIOR en ' + b.aumentoMax + '×' : 'sin máximo: no baja nunca') +
      ' · ' + (b.plano ? 'plano desde ' + b.plano + '× en ' + b.mMax.toFixed(2) : 'sin plano; en 600× vale ' + b.mMax.toFixed(2)));
    console.log('      ' + muestra);
  });
});

/* ── 2-4. M13 a 250× y 350×, las dos leyes, misma escena ─────────────────── */
console.log('\n2-4 · M13, SQM 21, campo 28′, 720 px, realización 0');
console.log('  fecha       equipo         techo  mlim   censo  dibujadas  σ sorteo  f_res(núc)  r_50/r_h  corte niebla  n banda  mlim H2');
var filas = [];
[200, 450].forEach(function (D) {
  [250, 350].forEach(function (M) {
    var par = [PROD, CRUMEY].map(function (V) {
      var esc = escenaM13(V, D, M, 21);
      var r = { esc: esc, fr: frontera(esc), ni: niebla(V, esc), so: sorteo(esc) };
      console.log('  ' + FECHA + '  ' + (D + ' mm ' + M + '×').padEnd(13) + String(V.techo).padStart(6) +
        esc.mlim.toFixed(2).padStart(7) + String(esc.censoLimpio).padStart(8) + String(esc.dibujadas).padStart(11) +
        r.so.sigma.toFixed(1).padStart(10) + ((100 * r.fr.fResNucleo).toFixed(1) + ' %').padStart(12) +
        r.fr.r50.toFixed(2).padStart(10) + r.ni.corte.toFixed(2).padStart(14) + String(r.ni.nBanda).padStart(9) +
        r.ni.mlimH2.toFixed(2).padStart(9));
      return r;
    });
    filas.push({ D: D, M: M, prod: par[0], crumey: par[1] });
  });
});

/* Criterio 4: el cambio se mide contra dos varas de ruido de la escena ACTUAL.
   La del sorteo del ADR 0012 (la única aleatoria del render con el fixture
   fijo) y, más generosa, la de conteo √N de las dibujadas. El veredicto pide
   superar las dos. */
console.log('\n  Diferencia Crumey − actual (σ = sorteo; √N = conteo, de la escena actual):');
var algunaFuera = false;
filas.forEach(function (f) {
  var dN = f.crumey.esc.dibujadas - f.prod.esc.dibujadas, sig = f.prod.so.sigma;
  var z = sig > 0 ? Math.abs(dN) / sig : (dN ? Infinity : 0);
  var zN = Math.abs(dN) / Math.sqrt(f.prod.esc.dibujadas);
  if (z >= 1 && zN >= 1) algunaFuera = true;
  console.log('  ' + (f.D + ' mm ' + f.M + '×').padEnd(13) +
    ' Δmlim ' + f2(f.crumey.esc.mlim - f.prod.esc.mlim) +
    ' · Δcenso ' + (f.crumey.esc.censoLimpio - f.prod.esc.censoLimpio) +
    ' · Δdibujadas ' + dN + ' (' + (isFinite(z) ? z.toFixed(1) : '∞') + ' σ, ' + zN.toFixed(1) + ' √N)' +
    ' · Δf_res(núc) ' + f2(100 * (f.crumey.fr.fResNucleo - f.prod.fr.fResNucleo)) + ' pt' +
    ' · r_50 ' + f.prod.fr.r50.toFixed(2) + ' → ' + f.crumey.fr.r50.toFixed(2) +
    ' · corte niebla ' + f2(f.crumey.ni.corte - f.prod.ni.corte) +
    ' · banda ' + (f.crumey.ni.nBanda - f.prod.ni.nBanda));
});

console.log('\n── Veredicto ──');
console.log(algunaFuera
  ? '  El cambio de censo SUPERA las dos varas de ruido en al menos una escena: la constante tiene consecuencia contable.'
  : '  El cambio de censo queda dentro del ruido de la escena en todas las filas: cerrar la épica sin tocar producción.');
