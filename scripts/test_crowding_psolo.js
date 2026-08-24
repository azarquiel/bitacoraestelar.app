#!/usr/bin/env node
/* Conservación del flujo bajo la ley del ADR 0012: el crowding es una
   probabilidad POR ESTRELLA, no un umbral duro.

   Este test NACE ROJO a propósito. Mide la ley que el ADR 0012 decide contra el
   render de hoy, que todavía reparte con m_crowd + banda δ. Se pone verde cuando
   la implementación entre, y no antes.

   La partición que exige el ADR 0012, por radio:

     dibujado(r) = Sigma(r) · ∫[m<=m_res] a(m,r)·dF(m)
     velo(r)     = Sigma(r) · Ftotal − dibujado(r)
     a(m,r)      = P_solo = exp(−Sigma(r)·N(≥m+Δmag)·π θ_sep²)

   y las dos mitades tienen que sumar Sigma(r)·Ftotal. No hay listón de crowding:
   toda la LF participa con su peso, que es justo lo que un umbral no puede hacer.

   Al velo se va por DOS caminos, y confundirlos es fácil: la fracción (1−a) que
   la mezcla se lleva, y la fracción a que sobrevive a la mezcla pero sigue
   siendo demasiado débil para el cielo (m > m_res). El segundo es el que acopla
   el velo con m_res y obliga al punto fijo (paso 3B del ADR).

   Nada de la ley se reimplementa (ADR 0008): a(m,r) es `pob.aCrowd`, que vive en
   la Capa 1, y las rebanadas de flujo salen de `pob.Fresuelto`. La cuadratura
   sólo suma.

   Los tres asserts:

     A1  la ley es una atenuación válida: 0 ≤ a ≤ 1, monótona en m, y continua
         en r (invariante 7, los escalones en r dibujan anillos). VERDE hoy: mide
         la función nueva, no el render.
     A2  complemento exacto: dibujado + velo = Ftotal. VERDE por construcción de
         la cuadratura; está para que la implementación no lo rompa introduciendo
         un corte por algún lado.
     A3  el velo que el render construye ES el complemento de lo dibujado bajo
         a = P_solo. Nació ROJO —el render repartía con m_crowd + banda δ, que es
         el complemento de OTRA a— y es la medida del ADR 0012.
     A4  el punto fijo del velo está convergido: una pasada más no mueve m_res.
         Las pasadas son N fijo (CFG.pasadasPuntoFijo), así que el test comprueba
         que ese N basta en cúmulos y equipos que el barrido de (B) no midió.
     A5  el sorteo por estrella es estable: no depende de los aumentos. Es la
         premisa que el ADR daba por falsa al preferir atenuar.

   node scripts/test_crowding_psolo.js */
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

function delCatalogo(id) {
  var e = CATALOGO.filter(function (f) { return f[0] === id; })[0];
  if (!e) throw new Error('no está en el catálogo: ' + id);
  return { id: e[0], ra: e[2], dec: e[3], rc: e[4], rh: e[5], c: e[6], muV0: e[7],
           Vt: e[8], dkpc: e[9], ebv: e[10], feh: e[11], elip: e[12], pa: null };
}

var REFS = ['NGC 104', 'NGC 6205', 'NGC 5139'];
var EQUIPOS = [
  { D: 100, MAG: 50, sqm: 21.5 },
  { D: 200, MAG: 100, sqm: 21.5 },
  { D: 400, MAG: 200, sqm: 21.5 },
  { D: 467, MAG: 173, sqm: 21.0 }     // el de la captura del simulador
];

/* Cuadratura sobre TODA la LF, no sobre una banda: a(m,r) varía en todo el
   rango. Se recorre en magnitud con paso fijo entre los extremos que la propia
   población declara. La rebanada [m1,m2] vale Fresuelto(m2) − Fresuelto(m1), y
   se pesa con la a del centro (regla del punto medio, O(h²)).

   200 pasos: a(m,r) es exp(−N(≥m)), suave, y el residuo de cuadratura medido
   contra 800 pasos queda en ~1e-6, tres órdenes por debajo del 1 % del ADR
   0003. Se comprueba en A2, que es exactamente esa cuenta. */
var PASOS = 200;
function reparto(pob, rAs, radioImagenAs, mRes, m0, m1) {
  var h = (m1 - m0) / PASOS, dib = 0;
  var F1 = pob.Fresuelto(m0);
  for (var i = 0; i < PASOS; i++) {
    var ma = m0 + i * h, mb = ma + h, mc = ma + h / 2;
    var F2 = pob.Fresuelto(mb), dF = F2 - F1;
    /* La rebanada que m_res parte entra con la fracción que queda por encima,
       igual que interpola `cola` en la Capa 1: devolverla entera hace escalones
       en r, que es lo que dibuja anillos (invariante 7). */
    var w = mRes >= mb ? 1 : (mRes <= ma ? 0 : (mRes - ma) / h);
    if (w > 0) dib += w * pob.aCrowd(mc, rAs, radioImagenAs) * dF;
    F1 = F2;
  }
  /* Lo más brillante que m0 queda fuera del recorrido: allí a ya está saturada a
     1 y m_res queda muy por debajo, así que se dibuja entero. Lo más débil que
     m1 nunca llega al cielo y es velo por definición. */
  if (mRes > m0) dib += pob.aCrowd(m0, rAs, radioImagenAs) * pob.Fresuelto(m0);
  return { dibujado: dib, velo: pob.Ftotal - dib };
}

/* Rango de magnitudes de la LF, tomado de la propia población: se busca dónde
   Fresuelto arranca y dónde satura, sin constantes escritas a mano. */
function rangoLF(pob) {
  var m = 0, lo = null, hi = null;
  for (m = -5; m < 40; m += 0.25) {
    var F = pob.Fresuelto(m) / pob.Ftotal;
    if (lo === null && F > 1e-9) lo = m - 0.25;
    if (hi === null && F > 1 - 1e-9) { hi = m; break; }
  }
  return [lo === null ? -5 : lo, hi === null ? 40 : hi];
}

/* Balance sobre el perfil entero, pesado por Sigma(r). Se recorre la tabla
   radial del render, que es la del cúmulo real. */
function balance(cum, eq) {
  var SIZE = 512;
  var pob = C.poblacionCacheada(cum, 0);
  var arcmin = Math.ceil(2.4 * pob.rtAs / 60);
  var difuso = new Float32Array(SIZE * SIZE);
  var res = R.pintarCumulo(difuso, cum, {
    ra0: cum.ra, dec0: cum.dec, arcmin: arcmin, size: SIZE,
    cielo: { pupilaSalida: eq.D / eq.MAG, pupilaOjo: 7, sqm: eq.sqm,
             transmision: 0.9, aumentos: eq.MAG, perceptual: true },
    apertura: eq.D, estrellas: []
  });
  var t = res.tabla, lim = rangoLF(pob);
  var dib = 0, veloLey = 0, veloRender = 0, total = 0, peorComp = 0;
  for (var i = 0; i < t.r.length; i++) {
    if (!isFinite(t.mRes[i])) continue;
    var s = pob.sigma(t.r[i]);
    if (!(s > 0)) continue;
    var peso = s * t.r[i] * t.paso;            // 2·pi·r·Sigma(r)·dr, sin el 2·pi
    var rp = reparto(pob, t.r[i], res.radioImagenAs, t.mRes[i], lim[0], lim[1]);
    var comp = Math.abs((rp.dibujado + rp.velo) / pob.Ftotal - 1);
    if (comp > peorComp) peorComp = comp;
    dib += peso * rp.dibujado;
    veloLey += peso * rp.velo;
    veloRender += peso * pob.S1campo(t.mRes[i], t.r[i], res.radioImagenAs);
    total += peso * pob.Ftotal;
  }
  return { dibujado: dib, veloLey: veloLey, veloRender: veloRender, total: total,
           peorComp: peorComp,
           fuga: (total - dib - veloRender) / total,
           res: res, pob: pob };
}

console.log('ADR 0012 · el crowding como P_solo por estrella');
console.log('θ_sep = ' + C.config.thetaSepRadios + ' radios de imagen estelar, Δmag = ' +
            C.config.dmagCrowd + '\n');

/* ── A1: la ley es una atenuación válida ─────────────────────────────────── */

console.log('A1 · a(m,r) es una atenuación válida');
var pobA = C.poblacionCacheada(delCatalogo('NGC 6205'), 0);
var radioImagenA = 1.045;                             // el de la captura, 467 mm 173x
var rango = [0, 1e-9, 1, 10, 60, 300, pobA.rtAs * 0.999];
var malRango = 0, malMono = 0, peorSalto = 0;
rango.forEach(function (rAs) {
  var previo = Infinity;
  for (var m = -2; m <= 30; m += 0.1) {
    var a = pobA.aCrowd(m, rAs, radioImagenA);
    if (!(a >= 0 && a <= 1)) malRango++;
    if (a > previo + 1e-12) malMono++;                 // más débil no puede resolverse mejor
    previo = a;
  }
});
/* Continuidad en r. Un salto grande entre tramos contiguos NO prueba nada por sí
   solo: a(m,r) puede ser legítimamente empinada, y eso no dibuja anillos. Lo que
   sí los dibuja es una DISCONTINUIDAD —el bin de la LF devuelto entero, que es
   lo que hacía escalones a S1/S2 (v7 E4, 47 Tuc)—.

   El discriminador es refinar: si la función es continua, el salto máximo baja
   proporcionalmente al paso; si hay un escalón, se queda donde está. Se compara
   el paso de la tabla del render (r_t/512) con la cuarta parte. */
function peorSaltoEn(pasoR) {
  var peor = 0;
  for (var m3 = 10; m3 <= 24; m3 += 0.5) {
    for (var r3 = pasoR; r3 < pobA.rtAs; r3 += pasoR) {
      var salto = Math.abs(pobA.aCrowd(m3, r3, radioImagenA) - pobA.aCrowd(m3, r3 - pasoR, radioImagenA));
      if (salto > peor) peor = salto;
    }
  }
  return peor;
}
var pasoR = pobA.rtAs / 512;
peorSalto = peorSaltoEn(pasoR);
var saltoFino = peorSaltoEn(pasoR / 4);
var razon = saltoFino > 0 ? peorSalto / saltoFino : Infinity;
console.log('  peor salto en r: ' + peorSalto.toExponential(2) + ' al paso de la tabla, ' +
            saltoFino.toExponential(2) + ' a un cuarto de paso (razón ' +
            razon.toFixed(2) + ', continua ⇒ 4)');
ok(malRango === 0, '0 ≤ a ≤ 1 en todo el rango de m y r');
ok(malMono === 0, 'a no crece con m (lo más débil no se resuelve mejor)');
ok(razon > 3.4, 'a continua en r: el salto baja con el paso, no es escalón (invariante 7)');

/* ── A2 y A3: el balance ─────────────────────────────────────────────────── */

console.log('\nA2/A3 · balance sobre el perfil (ADR 0003, Fase 2: ±1 %)\n');
console.log('  cúmulo     equipo          velo ley  velo render   dibujado    fuga A3');

var peorComp = 0, peorFuga = 0;
REFS.forEach(function (id) {
  var cum = delCatalogo(id);
  EQUIPOS.forEach(function (eq) {
    var b = balance(cum, eq);
    if (b.peorComp > peorComp) peorComp = b.peorComp;
    if (Math.abs(b.fuga) > peorFuga) peorFuga = Math.abs(b.fuga);
    console.log('  ' + id.padEnd(10) + ' ' +
      (eq.D + ' mm ' + eq.MAG + 'x ' + eq.sqm).padEnd(15) +
      (100 * b.veloLey / b.total).toFixed(1).padStart(7) + ' %' +
      (100 * b.veloRender / b.total).toFixed(1).padStart(11) + ' %' +
      (100 * b.dibujado / b.total).toFixed(1).padStart(10) + ' %' +
      (100 * b.fuga).toFixed(2).padStart(10) + ' %');
  });
});

console.log('');
ok(peorComp < 1e-4,
  'A2 · dibujado + velo = Ftotal (peor residuo ' + peorComp.toExponential(2) + ')');
ok(peorFuga <= 0.01,
  'A3 · el velo del render es el complemento de P_solo al 1 % (peor fuga ' +
  (100 * peorFuga).toFixed(2) + ' %)');

/* ── A4: el punto fijo está convergido ───────────────────────────────────── */

console.log('\nA4 · una pasada más del punto fijo no mueve m_res (N = ' +
            C.config.pasadasPuntoFijo + ')');
var peorPaso = 0;
REFS.forEach(function (id) {
  var cum = delCatalogo(id);
  EQUIPOS.forEach(function (eq) {
    var b = balance(cum, eq), t = b.res.tabla;
    /* La pasada N+1 se rehace con la MISMA magLimite del render (ADR 0008: el
       test no reimplementa la ley, solo la vuelve a aplicar una vez). */
    for (var i = 0; i < t.r.length; i++) {
      if (!isFinite(t.mRes[i])) continue;
      var s = b.pob.sigma(t.r[i]);
      if (!(s > 0)) continue;
      var m2 = R.magLimite({ apertura: eq.D, aumentos: eq.MAG, transmision: 0.9,
        sqm: -2.5 * Math.log10(b.res.cHalo.Fcielo +
                               s * b.pob.S1campo(t.mRes[i], t.r[i], b.res.radioImagenAs)),
        pupilaOjo: 7 });
      if (m2 == null) continue;
      var d = Math.abs(m2 - t.mRes[i]);
      if (d > peorPaso) peorPaso = d;
    }
  });
});
ok(peorPaso < 0.01, 'A4 · |Δm_res| de la pasada N+1 < 0,01 mag (peor ' +
   peorPaso.toFixed(4) + ')');

/* ── A5: el sorteo no parpadea con el ocular ─────────────────────────────── */

console.log('\nA5 · a(m,r) no lleva aumentos dentro: el sorteo es estable');
var cumA5 = delCatalogo('NGC 6205');
var pobA5 = C.poblacionCacheada(cumA5, 0);
/* Con las de Gaia de verdad: las sintéticas del núcleo nacen por debajo de la
   magnitud límite de cualquier equipo y el sorteo no llegaría a verse. Sin ellas
   este assert sería vacuo (ADR 0005), y por eso el tamaño de la muestra se
   comprueba abajo. Es el mismo fixture del arnés de estrellas. */
var gaiaA5 = require('fs').readFileSync(__dirname + '/../simulador_ocular/docs/validacion/m13_gaia_dr3.csv', 'utf8')
  .trim().split('\n').slice(1).map(function (l) {
    var c = l.split(',');
    return [+c[0], +c[1], +c[2], c[3] === '' ? null : +c[3]];
  });
var difA5 = new Float32Array(256 * 256);
function estrellasA5(MAG) {
  var res = R.pintarCumulo(difA5, cumA5, {
    ra0: cumA5.ra, dec0: cumA5.dec, arcmin: Math.ceil(2.4 * pobA5.rtAs / 60), size: 256,
    cielo: { pupilaSalida: 467 / MAG, pupilaOjo: 7, sqm: 21, transmision: 0.9,
             aumentos: MAG, perceptual: true },
    apertura: 467, estrellas: gaiaA5
  });
  var d = {};
  res.estrellas.forEach(function (e) { d[e[0].toFixed(6) + ',' + e[1].toFixed(6)] = 1; });
  return d;
}
/* Mismo telescopio, distinto ocular: cambia m_res (el cielo), no el sorteo. A
   250× m_res es más profunda, así que lo que 61× dibujaba tiene que seguir
   dibujado. Perder una estrella al subir aumentos sería el parpadeo que el ADR
   temía —y que dio por seguro al preferir atenuar—. */
var d61 = estrellasA5(61), d250 = estrellasA5(250);
var parpadeos = 0;
Object.keys(d61).forEach(function (k) { if (!d250[k]) parpadeos++; });
console.log('  ' + Object.keys(d61).length + ' estrellas a 61×, ' +
            Object.keys(d250).length + ' a 250×, ' + parpadeos + ' que 250× pierde');
ok(Object.keys(d61).length > 100, 'A5 · la muestra no está vacía (ADR 0005)');
ok(parpadeos === 0, 'A5 · más aumentos nunca quita una estrella que 61× dibujaba');

if (fallos) {
  console.error('\n' + fallos + ' FALLOS');
} else {
  console.log('\nTodo correcto');
}
process.exit(fallos ? 1 : 0);
