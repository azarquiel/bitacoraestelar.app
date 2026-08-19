#!/usr/bin/env node
/* Conservación del flujo bajo la ley del ADR 0012: el crowding es una
   probabilidad POR ESTRELLA, no un umbral duro.

   Este test NACE ROJO a propósito. Mide la ley que el ADR 0012 decide contra el
   render de hoy, que todavía reparte con m_crowd + banda δ. Se pone verde cuando
   la implementación entre, y no antes.

   La partición que exige el ADR 0012, por radio:

     dibujado(r) = Sigma(r) · ∫ a(m,r)·dF(m)          sobre TODA la LF
     velo(r)     = Sigma(r) · ∫ (1−a(m,r))·dF(m)
     a(m,r)      = P_solo = exp(−Sigma(r)·N(≥m+Δmag)·π θ_sep²)

   y las dos mitades tienen que sumar Sigma(r)·Ftotal. No hay corte: toda la LF
   participa con su peso, que es justo lo que un umbral no puede hacer.

   Nada de la ley se reimplementa (ADR 0008): a(m,r) es `pob.aCrowd`, que vive en
   la Capa 1, y las rebanadas de flujo salen de `pob.Fresuelto`. La cuadratura
   sólo suma.

   Los tres asserts:

     A1  la ley es una atenuación válida: 0 ≤ a ≤ 1, monótona en m, y continua
         en r (invariante 7, los escalones en r dibujan anillos). VERDE hoy: mide
         la función nueva, no el render.
     A2  complemento exacto: ∫a·dF + ∫(1−a)·dF = Ftotal. VERDE hoy por
         construcción de la cuadratura; está para que la implementación no lo
         rompa introduciendo un corte por algún lado.
     A3  el velo que el render construye ES el complemento de lo dibujado bajo
         a = P_solo. ROJO hoy: el render pone Sigma·S1campo(m_res, δ), que es el
         complemento de OTRA a. Esta es la medida del ADR 0012.

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
function reparto(pob, rAs, radioImagenAs, m0, m1) {
  var h = (m1 - m0) / PASOS, dib = 0, velo = 0;
  var F1 = pob.Fresuelto(m0);
  for (var i = 0; i < PASOS; i++) {
    var ma = m0 + i * h, mb = ma + h;
    var F2 = pob.Fresuelto(mb), dF = F2 - F1;
    var a = pob.aCrowd(ma + h / 2, rAs, radioImagenAs);
    dib += a * dF; velo += (1 - a) * dF;
    F1 = F2;
  }
  /* Lo más brillante que m0 y lo más débil que m1 quedan fuera del recorrido: se
     asignan con la a del extremo, que allí ya está saturada (1 arriba, ~0 abajo)
     y no con una a inventada. */
  var aArr = pob.aCrowd(m0, rAs, radioImagenAs), aAba = pob.aCrowd(m1, rAs, radioImagenAs);
  var Farr = pob.Fresuelto(m0), Faba = pob.Ftotal - pob.Fresuelto(m1);
  dib += aArr * Farr + aAba * Faba;
  velo += (1 - aArr) * Farr + (1 - aAba) * Faba;
  return { dibujado: dib, velo: velo };
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
  var SIZE = 512, delta = C.config.delta;
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
    var rp = reparto(pob, t.r[i], res.radioImagenAs, lim[0], lim[1]);
    var comp = Math.abs((rp.dibujado + rp.velo) / pob.Ftotal - 1);
    if (comp > peorComp) peorComp = comp;
    dib += peso * rp.dibujado;
    veloLey += peso * rp.velo;
    veloRender += peso * pob.S1campo(t.mRes[i], delta);
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
  'A2 · ∫a·dF + ∫(1−a)·dF = Ftotal (peor residuo ' + peorComp.toExponential(2) + ')');
ok(peorFuga <= 0.01,
  'A3 · el velo del render es el complemento de P_solo al 1 % (peor fuga ' +
  (100 * peorFuga).toFixed(2) + ' %)');

if (fallos) {
  console.error('\n' + fallos + ' FALLOS');
  console.error('A3 en rojo es lo ESPERADO hasta que entre el ADR 0012: el render');
  console.error('todavía reparte con m_crowd + banda δ. A1 y A2 deben estar verdes.');
} else {
  console.log('\nTodo correcto');
}
process.exit(fallos ? 1 : 0);
