#!/usr/bin/env node
/* Spike #542 — prototipo DESECHABLE del ADR 0039 (prerregistro en
   simulador_ocular/docs/adr/0039-la-fusion-del-blending-en-globulares.md §0).

   No toca producción. Lee de ella la población (Capa 1), la tabla radial del
   render y los contextos fotométricos (ADR 0008); el código nuevo es solo la
   partición de la pregunta 4 y los dos agrupamientos de la pregunta 2.

   Imprime flujos, residuos, razones y magnitudes. NUNCA cuentas de estrellas
   dibujadas: el ADR prohíbe usarlas como argumento.

   node scripts/harness_fusion_blending.js [--sqm N] [--D mm] [--mag N] [--banda G] [--todas] */
'use strict';

global.window = {};
global.document = undefined;
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/lf-globulares-datos.js');
require('../simulador_ocular/resources/js/globulares-datos.js');
require('../resources/js/bitacora-cumulos.js');
var fs = require('fs'), path = require('path');
var R = global.window.BitacoraGaiaRender;
var C = global.window.BitacoraCumulos;

function arg(n, def) { var i = process.argv.indexOf('--' + n); return i > 0 ? +process.argv[i + 1] : def; }
var SQM = arg('sqm', 21), D = arg('D', 467), MAG = arg('mag', 173), PROC = 720;
var ARCMIN = 0.47 * 60;

var e = global.window.BITACORA_GLOBULARES.filter(function (f) { return f[0] === 'NGC 6205'; })[0];
var M13 = { id: e[0], ra: e[2], dec: e[3], rc: e[4], rh: e[5], c: e[6], muV0: e[7],
            Vt: e[8], dkpc: e[9], ebv: e[10], feh: e[11], elip: e[12], pa: null, trager: e[13] || null };
var rhAs = M13.rh * 60;

/* Pertenencia (#575): filas de campo según Vasiliev & Baumgardt 2021
   (scripts/gen_m13_pertenencia.py). --todas reproduce el arnés sin separar
   miembros, que es lo que midió el ADR 0039. */
var TODAS = process.argv.indexOf('--todas') > 0;
var CAMPO = new Set(fs.readFileSync(path.join(__dirname, '../simulador_ocular/docs/validacion/m13_vb21_campo.csv'), 'utf8')
  .trim().split('\n').slice(1).map(function (l) { var c = l.split(','); return c[0] + ',' + c[1]; }));
var gaia = fs.readFileSync(path.join(__dirname, '../simulador_ocular/docs/validacion/m13_gaia_dr3.csv'), 'utf8')
  .trim().split('\n').slice(1).map(function (l) {
    var c = l.split(',');
    var f = [+c[0], +c[1], +c[2], c[3] === '' ? null : +c[3]];
    if (!TODAS && CAMPO.has(c[0] + ',' + c[1])) f.push(true);   // campo (#575): 5º elemento
    return f;
  });
// Luz del cúmulo = solo miembros (#575): el campo sale de la partición (ley de producción, ADR 0008).

/* Banda del catálogo: V por defecto, la de producción desde #574 (magVGaia,
   G − V de Gaia EDR3; sin color o fuera de rango, G). --banda G reproduce la
   columna prerregistrada del ADR 0039 (G tratada como V). */
var BANDA_G = process.argv.indexOf('--banda') > 0 && process.argv[process.argv.indexOf('--banda') + 1] === 'G';
function magCatalogo(g) { return BANDA_G ? g[2] : R.magVGaia(g); }

var cielo = { pupilaSalida: D / MAG, pupilaOjo: 7, sqm: SQM, transmision: 0.9,
              aumentos: MAG, perceptual: true };
var res = R.pintarCumulo(new Float32Array(PROC * PROC), M13, {
  ra0: M13.ra, dec0: M13.dec, arcmin: ARCMIN, size: PROC, cielo: cielo, apertura: D, estrellas: gaia
});
/* Lo que producción dibuja hoy, LEÍDO de su salida (ADR 0008): estrellasCumulo
   devuelve las mismas filas de catálogo que recibe; las sintéticas las
   re-emite en G como filas nuevas (#579), así que se casan por posición.
   Sin `o.mlim` la rama #570 de la cola del glow no entra: es la llamada «a
   pelo» que el propio render documenta. Realización 0. */
function clave(f) { return f[0] + ',' + f[1]; }
var dibujadaProd = new Set(res.estrellas.map(clave));
var pob = res.poblacion, tabla = res.tabla;
/* Contrafactual de #590 (spike, NO es un arreglo): la consulta a Gaia corta en
   G (fixture: G ≤ 18,50; producción: magConsultaGaia), y c(m, r) no lo sabe:
   asume el codo gaiaM50 = 20. --corte-g G multiplica c por la fracción del bin
   (en V) por encima de G + V−G, con V−G = 0,109, la mediana medida en el
   fixture para G > 18,25. Solo afecta a la partición (V1/V2) y a la atribución:
   pintarCumulo ya corrió y las sintéticas (m ≤ 18) no cruzan el corte. */
var CORTE_G = arg('corte-g', NaN);
if (CORTE_G === CORTE_G) {
  var cOrig = pob.completitud, VCORTE = CORTE_G + 0.109, PASO_LF = pob.magnitudes[1] - pob.magnitudes[0];
  pob.completitud = function (m, rAs) {
    return cOrig(m, rAs) * Math.max(0, Math.min(1, (VCORTE - m) / PASO_LF + 0.5));
  };
}
var TH = C.config.thetaSepRadios * res.radioImagenAs;      // θ_sep, arcsec
/* Parte sintética de la partición (#577): las sintéticas de producción
   (realización 0, las mismas que dibuja pintarCumulo) entran en la suma como
   cualquier estrella, y V1/V2 solo llevan los bins m_k > mCutGeneracion
   (ADR 0039, pregunta 4). MBORDE es el borde de bin que parte ese corte: las
   sintéticas nacen en el centro de su bin. */
var MCUT = C.config.mCutGeneracion;
var sint = pob.sinteticas({ ra: M13.ra, dec: M13.dec });
var MBORDE = MCUT;
for (var b0 = 0; b0 + 1 < pob.magnitudes.length; b0++)
  if (pob.magnitudes[b0] <= MCUT && pob.magnitudes[b0 + 1] > MCUT)
    MBORDE = (pob.magnitudes[b0] + pob.magnitudes[b0 + 1]) / 2;

/* EXCEPCIÓN DECLARADA al ADR 0008: copia de `mResEn` (bitacora-gaia-render.js),
   que producción no exporta y este spike no puede exportar (el ticket prohíbe
   tocar producción). Interpola tabla.mRes sin añadir ley; si mResEn cambia,
   esta copia se queda atrás: el arnés es desechable. */
function mResEn(rAs) {
  var ult = tabla.r.length - 1;
  if (!(rAs >= 0) || rAs >= tabla.r[ult]) return Infinity;
  var u = rAs / tabla.paso, i = Math.floor(u), t = u - i;
  var a = tabla.mRes[i], b = tabla.mRes[i + 1];
  if (!isFinite(a)) return b;
  if (!isFinite(b)) return a;
  return a * (1 - t) + b * t;
}

/* ── La partición de la pregunta 4 ─────────────────────────────────────────
   Velo analítico = LF × perfil × (1 − completitud): solo lo que el catálogo no
   trae. La ley vive en la Capa 1 (`pob.velo`, #599) y se lee de ahí (ADR 0008);
   el S1campo del render no lleva c(m,r). Se le pasa pob.completitud para que
   --corte-g llegue. */
var mAp = pob.magnitudes, num = pob.estrellasPorBin, NB = mAp.length;
var fB = new Float64Array(NB);
for (var b = 0; b < NB; b++) fB[b] = Math.pow(10, -0.4 * mAp[b]);
function CERO() { return 0; }
function momentos(rAs) {          // por arcsec²: V1, V2, S2 total, parte catalogada de S2
  var s = pob.sigma(rAs), v1 = 0, v2 = 0, s2 = 0, s2c = 0, s2sub = 0, s2csub = 0, mR = mResEn(rAs);
  var s2v = 0;                      // S2 del dominio del velo (#577)
  v1 = pob.velo(rAs, 1, pob.completitud, MCUT);
  v2 = pob.velo(rAs, 2, pob.completitud, MCUT);
  // Doble conteo completo: el velo lleva también lo que trae el catálogo (c ≡ 0).
  var v1cf = pob.velo(rAs, 1, CERO, MCUT), v2cf = pob.velo(rAs, 2, CERO, MCUT);
  for (var k = 0; k < NB; k++) {
    var c = pob.completitud(mAp[k], rAs), w = num[k], f2b = fB[k] * fB[k];
    if (mAp[k] > MCUT) s2v += w * f2b;
    s2c += w * f2b * c;
    /* CONTRASTE declarado (ADR 0008): numerador y denominador de la fracción
       catalogada bajo m_res con el MISMO corte (centro del bin). pob.S2(mR)
       interpola dentro del bin y, mezclado con este numerador, da más del
       100 % (medido: 104,6 % en 4-8 r_h). */
    if (mAp[k] > mR) { s2sub += w * f2b; s2csub += w * f2b * c; }
  }
  s2 = pob.S2(-Infinity);   // S2 de toda la LF, leído de la Capa 1
  return { v1: s * v1, v2: s * v2, s2: s * s2, s2c: s * s2c, s2sub: s * s2sub, s2csub: s * s2csub,
           v1cf: s * v1cf, v2cf: s * v2cf, s2v: s * s2v, s4v: s * pob.S4(MBORDE) };
}
var cacheMom = {};
function mom(rAs) {               // cuantizado a 0,05″: el perfil no cambia a esa escala
  var k = Math.round(rAs * 20);
  return cacheMom[k] || (cacheMom[k] = momentos(k / 20));
}

var ANILLOS = [0, 0.25, 0.5, 1, 2, 4, 8].map(function (f) { return f * rhAs; });
var NA = ANILLOS.length - 1;
var ETQ = ['≤0,25', '≤0,5', '≤1', '≤2', '≤4', '≤8'];
function anillo(rAs) {
  for (var k = 0; k < NA; k++) if (rAs <= ANILLOS[k + 1]) return k;
  return -1;
}
/* ∫ g dΩ sobre un anillo circular (M13 de Harris sin PA: radioPropio es
   circular en r). Trapecios, 2000 tramos. */
function integralAnillo(k, g) {
  var r0 = ANILLOS[k], r1 = Math.min(ANILLOS[k + 1], pob.rtAs), N = 2000, h = (r1 - r0) / N, s = 0;
  for (var i = 0; i <= N; i++) {
    var r = r0 + i * h, w = (i === 0 || i === N) ? 0.5 : 1;
    s += w * g(r) * 2 * Math.PI * r;
  }
  return s * h;
}
function campo(nombre) { return function (r) { return mom(r)[nombre]; }; }

/* ── Catálogo en el plano del cielo ───────────────────────────────────────── */
var cos0 = Math.cos(M13.dec * Math.PI / 180);
var est = [];
function mete(g, m) {
  var x = (((g[0] - M13.ra + 540) % 360) - 180) * cos0 * 3600, y = (g[1] - M13.dec) * 3600;
  var r = pob.radioPropio(x, y);
  if (!(r < pob.rtAs) || anillo(r) < 0) return;
  est.push({ fila: g, x: x, y: y, r: r, m: m, F: Math.pow(10, -0.4 * m) });
}
gaia.forEach(function (g) { if (!R.esCampo(g)) mete(g, magCatalogo(g)); });
var nCat = est.length;
sint.forEach(function (g) { mete(g, g[2]); });   // la sintética nace en V (LF)

function celda(x, y, lado) { return Math.floor(x / lado) + ',' + Math.floor(y / lado); }
function centroCelda(key, lado) {
  var p = key.split(',');
  return { x: (+p[0] + 0.5) * lado, y: (+p[1] + 0.5) * lado };
}

/* ── (a) friends-of-friends con enlace θ_sep ──────────────────────────────── */
function fof(lista, enlace) {
  var padre = lista.map(function (_, i) { return i; });
  function raiz(i) { while (padre[i] !== i) { padre[i] = padre[padre[i]]; i = padre[i]; } return i; }
  var rejilla = {};
  lista.forEach(function (s, i) {
    var k = celda(s.x, s.y, enlace);
    (rejilla[k] = rejilla[k] || []).push(i);
  });
  lista.forEach(function (s, i) {
    var cx = Math.floor(s.x / enlace), cy = Math.floor(s.y / enlace);
    for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
      var v = rejilla[(cx + dx) + ',' + (cy + dy)];
      if (!v) continue;
      for (var q = 0; q < v.length; q++) {
        var j = v[q];
        if (j <= i) continue;
        var ddx = lista[j].x - s.x, ddy = lista[j].y - s.y;
        if (ddx * ddx + ddy * ddy < enlace * enlace) {
          var a = raiz(i), b2 = raiz(j);
          if (a !== b2) padre[a] = b2;
        }
      }
    }
  });
  var grupos = {};
  lista.forEach(function (_, i) { var r0 = raiz(i); (grupos[r0] = grupos[r0] || []).push(i); });
  return Object.keys(grupos).map(function (k) { return grupos[k]; });
}

/* Libro de flujos de una ley: dónde acaba la luz catalogada (D + U). El velo
   analítico es el mismo término a los dos lados de T y P, así que el residuo
   mide la contabilidad del catálogo (prerregistro §0). */
function libro() { return { celda: {}, anillo: new Float64Array(NA) }; }
function apunta(L, x, y, F) {
  var k = celda(x, y, TH);
  L.celda[k] = (L.celda[k] || 0) + F;
  var a = anillo(pob.radioPropio(x, y));
  if (a >= 0) L.anillo[a] += F;
}

// Verdad T (parte catalogada): cada estrella en su posición.
var T = libro();
est.forEach(function (s) { apunta(T, s.x, s.y, s.F); });

// (a) FoF: el blob dibujado se apunta en su centroide.
var grupos = fof(est, TH);
var A = libro(), flujoDibujadoA = 0, flujoMovidoA = 0, extensionMax = 0, cadenas = 0, multiples = 0;
grupos.forEach(function (g) {
  var F = 0, sx = 0, sy = 0;
  g.forEach(function (i) { F += est[i].F; sx += est[i].F * est[i].x; sy += est[i].F * est[i].y; });
  var xc = sx / F, yc = sy / F, mB = -2.5 * Math.log10(F);
  if (g.length > 1) {
    multiples++;
    var ext = 0;
    g.forEach(function (i) { ext = Math.max(ext, Math.hypot(est[i].x - xc, est[i].y - yc)); });
    extensionMax = Math.max(extensionMax, ext);
    if (2 * ext > TH) cadenas++;     // el grupo es más ancho que un elemento de resolución
  }
  if (mB <= mResEn(pob.radioPropio(xc, yc))) {
    apunta(A, xc, yc, F);
    flujoDibujadoA += F;
    var kc = celda(xc, yc, TH);
    g.forEach(function (i) { if (celda(est[i].x, est[i].y, TH) !== kc) flujoMovidoA += est[i].F; });
  } else {
    g.forEach(function (i) { apunta(A, est[i].x, est[i].y, est[i].F); });
  }
});

// (b) imagen sumada: ninguna luz se mueve. Identidad, no evidencia (§0).
var Bl = libro();
est.forEach(function (s) { apunta(Bl, s.x, s.y, s.F); });

// Producción hoy (ADR 0012 A): lo que no se dibuja va repartido por el anillo.
// Se mide con el MISMO criterio, no se usa como verdad.
var P0 = libro(), perdidoAnillo = new Float64Array(NA);
est.forEach(function (s) {
  if (dibujadaProd.has(clave(s.fila))) apunta(P0, s.x, s.y, s.F); else perdidoAnillo[anillo(s.r)] += s.F;
});
var areaAnillo = [];
for (var k = 0; k < NA; k++) {
  var r1 = Math.min(ANILLOS[k + 1], pob.rtAs);
  areaAnillo[k] = Math.PI * (r1 * r1 - ANILLOS[k] * ANILLOS[k]);
  P0.anillo[k] += perdidoAnillo[k];
}

/* ── Criterio 2: residuos por anillo y por celda ──────────────────────────── */
var V1an = [];
for (k = 0; k < NA; k++) V1an[k] = integralAnillo(k, campo('v1'));
function residuos(L, repartoAnillo) {
  var porAnillo = [];
  for (var q = 0; q < NA; q++) {
    var t = T.anillo[q] + V1an[q], p = L.anillo[q] + V1an[q];
    porAnillo.push(Math.abs(p - t) / t);
  }
  var max = 0, malas = 0, total = 0, claves = {};
  Object.keys(T.celda).forEach(function (c) { claves[c] = 1; });
  Object.keys(L.celda).forEach(function (c) { claves[c] = 1; });
  Object.keys(claves).forEach(function (key) {
    var cc = centroCelda(key, TH), rc = pob.radioPropio(cc.x, cc.y), a = anillo(rc);
    var v = (rc < pob.rtAs) ? mom(rc).v1 * TH * TH : 0;
    var extra = (repartoAnillo && a >= 0) ? repartoAnillo[a] * TH * TH / areaAnillo[a] : 0;
    var t = (T.celda[key] || 0) + v, p = (L.celda[key] || 0) + extra + v;
    if (!(t > 0)) return;
    var r = Math.abs(p - t) / t;
    total++;
    if (r >= 1e-6) malas++;
    if (r > max) max = r;
  });
  return { anillo: porAnillo, max: max, malas: malas, total: total };
}

function e1(x) { return x.toExponential(1).padStart(9); }
console.log('M13 · D=' + D + 'mm  M=' + MAG + 'x  SQM=' + SQM + '  θ_sep=' + TH.toFixed(3) +
            '"  dentro de 8 r_h: ' + nCat + ' filas del catálogo + ' +
            (est.length - nCat) + ' sintéticas (mCutGeneracion = ' + MCUT + ', borde de bin ' + MBORDE.toFixed(3) + ')');
console.log('\n── Criterio 2: |P − T| / T  (listón < 1e-6 en cada anillo y en cada celda)');
console.log('ley            ' + ETQ.map(function (s) { return s.padStart(9); }).join('') +
            '   peor celda  celdas ≥1e-6');
var pasaC2 = false;
[['(b) imagen', Bl, null], ['(a) FoF', A, null], ['prod. 0012A', P0, perdidoAnillo]].forEach(function (t3) {
  var r = residuos(t3[1], t3[2]);
  var pasa = r.max < 1e-6 && r.anillo.every(function (x) { return x < 1e-6; });
  if (t3[1] === Bl) pasaC2 = pasa;   // el veredicto juzga la ley candidata, (b)
  console.log(t3[0].padEnd(15) + r.anillo.map(e1).join('') + e1(r.max).padStart(12) +
              ('  ' + r.malas + '/' + r.total).padStart(14) + '  ' + (pasa ? 'PASA' : 'NO PASA'));
});
var Fcat = 0; est.forEach(function (s) { Fcat += s.F; });
console.log('(a) flujo catalogado que acaba en blobs dibujados: ' + (100 * flujoDibujadoA / Fcat).toFixed(2) +
            ' %; el que sale de la celda de su estrella: ' + (100 * flujoMovidoA / Fcat).toFixed(3) + ' % del catálogo');
console.log('(a) el grupo múltiple más ancho mide ' + (2 * extensionMax / TH).toFixed(2) +
            ' θ_sep; ' + (100 * cadenas / Math.max(1, multiples)).toFixed(1) +
            ' % de los grupos múltiples son más anchos que θ_sep (cadenas)');

/* Conservación contra el MODELO (fase 1 del ADR 0003): catálogo + sintéticas
   + velo contra el flujo de la LF. Listón de §0 ter (#597), que sustituye al
   ±10 % de §0 bis: |q − 1| ≤ 2σ, con σ = √(∫Σ·S2)/∫Σ·S1 el ruido de Poisson
   del flujo (muestreo de las gigantes), leído del modelo y no del catálogo.
   Caso malo: deriva del modelo del 10 %, |q − 1| = 1 − 1/1,1. Un anillo tiene
   potencia si 2σ < 1 − 1/1,1; sin potencia no cuenta. La suma de los seis
   (columna «total») también se juzga. El residuo se registra, no se
   corrige tocando el flujo del campo. */
var DERIVA = 1 - 1 / 1.1;
console.log('\n── Conservación contra el modelo: (ΣF_cat+sint + ∫V1) / ∫Σ·S1_total  (listón |q − 1| ≤ 2σ, §0 ter)');
var S1tot = pob.S1(-Infinity), S2lf = pob.S2(-Infinity);   // flujo y flujo² de toda la LF, Capa 1
var filaC = 'medida         ', filaCf = 'contrafactual  ', filaS = '2σ             ', filaV = '               ';
var pasaCons = true, potCons = false, sObs = 0, sMod = 0, sS2 = 0;
function juzgaCons(q, mod, s2) {
  var dosSigma = 2 * Math.sqrt(s2) / mod, pot = dosSigma < DERIVA, ok = Math.abs(q - 1) <= dosSigma;
  if (pot) { potCons = true; pasaCons = pasaCons && ok; }
  filaC += q.toFixed(3).padStart(9); filaS += dosSigma.toFixed(3).padStart(9);
  filaV += (!pot ? 'sin pot.' : ok ? 'PASA' : 'NO PASA').padStart(9);
}
for (k = 0; k < NA; k++) {
  var modelo = integralAnillo(k, function (r) { return pob.sigma(r) * S1tot; });
  var s2an = integralAnillo(k, function (r) { return pob.sigma(r) * S2lf; });
  var obs = T.anillo[k] + V1an[k];
  juzgaCons(obs / modelo, modelo, s2an);
  filaCf += ((T.anillo[k] + integralAnillo(k, campo('v1cf'))) / modelo).toFixed(3).padStart(9);
  sObs += obs; sMod += modelo; sS2 += s2an;
}
juzgaCons(sObs / sMod, sMod, sS2);
console.log('               ' + ETQ.concat('total').map(function (s) { return s.padStart(9); }).join(''));
console.log(filaC); console.log(filaS); console.log(filaV);
console.log(filaCf + '   (V1 sin (1 − c): informativo)');
console.log('potencia: 2σ < ' + DERIVA.toFixed(3) + ' (deriva del modelo del 10 %); sin potencia no cuenta');

/* ── Criterio 3: el grano no cuenta dos veces la luz catalogada ─────────────
   Prerregistro §0 quater (#599), que sustituye al listón de una cola de §0 bis.
   El doble conteo solo puede vivir donde hay velo, m > MBORDE.
     R2v = (∫V2 + Σ_{m_j>MBORDE} F_j²) / D,   D = ∫Σ·S2(m>MBORDE)
     σ   = √(∫Σ·S4(m>MBORDE)) / D             (del modelo, no de la realización)
   Pasa si |R2v − 1| ≤ 2σ (dos colas). Potencia: valor esperado de cada
   contrafactual corrido por la misma partición, con el catálogo en su media del
   modelo, ∫Σ·S2·c = D − ∫V2 (álgebra que fija test_velo_uno_menos_c.js):
   - doble conteo completo, V2 sin (1 − c):            (D + Cat) / D
   - deriva del 10 %, num × x en m > MBORDE (V2 y D),   (x·V2 + Cat) / (x·D),
     x = 1,1 y 0,9, con c y el perfil sin tocar. Cuenta la dirección más débil.
   Un anillo se juzga si tiene potencia contra al menos uno de los dos. */
function phi(z) {                 // Φ normal, Abramowitz-Stegun 7.1.26 (|error| < 1,5e-7)
  var t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  var y = 1 - t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) *
          Math.exp(-z * z / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}
function pRechaza(E, sd) { return phi((E - 1 - 2 * sd) / sd) + phi((1 - E - 2 * sd) / sd); }
function grano(k, soloVelo) {     // parte del catálogo (realización) por anillo
  var f2 = 0, fmax = 0;
  est.forEach(function (s) {
    if (anillo(s.r) !== k || (soloVelo && !(s.m > MBORDE))) return;
    f2 += s.F * s.F; fmax = Math.max(fmax, s.F);
  });
  var den = integralAnillo(k, campo(soloVelo ? 's2v' : 's2'));
  return { R2: (integralAnillo(k, campo('v2')) + f2) / den, f2: f2, fmax: fmax };
}
function modeloC3(k) {            // solo modelo: σ y valores esperados de los contrafactuales
  var D = integralAnillo(k, campo('s2v')), V2 = integralAnillo(k, campo('v2'));
  var cat = D - V2, sd = Math.sqrt(integralAnillo(k, campo('s4v'))) / D;
  var der = function (x) { return (x * V2 + cat) / (x * D); };
  return { sd: sd, Edc: (integralAnillo(k, campo('v2cf')) + cat) / D, Eup: der(1.1), Edn: der(0.9) };
}
console.log('\n── Criterio 3, POTENCIA (§0 quater): valor esperado de cada contrafactual contra ±2σ del modelo');
console.log('banda del catálogo: ' + (BANDA_G ? 'G tratada como V (prerregistrada en §0)' : 'V (G→V EDR3, producción #574)') +
            '; filas en G por falta de color: ' + res.filasEnG + ' de ' + gaia.length);
console.log('dominio del velo m > ' + MBORDE.toFixed(3) + '; deriva: num × 1,1 y × 0,9 en m > borde, cuenta la más débil');
console.log('anillo       2σ   doble conteo  pot.  P(rech.)   deriva ×1,1  ×0,9  pot.  P(rech.)   juzgado');
var juzgado = [], potDeriva = [], M3 = [];
for (k = 0; k < NA; k++) {
  var m3 = M3[k] = modeloC3(k), dosS = 2 * m3.sd;
  var potDc = Math.abs(m3.Edc - 1) > dosS;
  var pUp = pRechaza(m3.Eup, m3.sd), pDn = pRechaza(m3.Edn, m3.sd);
  var debil = pUp <= pDn ? m3.Eup : m3.Edn;
  potDeriva[k] = Math.abs(debil - 1) > dosS;
  juzgado[k] = potDc || potDeriva[k];
  console.log(ETQ[k].padEnd(8) + dosS.toFixed(3).padStart(9) + m3.Edc.toFixed(3).padStart(15) +
              (potDc ? 'sí' : 'NO').padStart(6) + pRechaza(m3.Edc, m3.sd).toFixed(2).padStart(10) +
              m3.Eup.toFixed(3).padStart(14) + m3.Edn.toFixed(3).padStart(7) +
              (potDeriva[k] ? 'sí' : 'NO').padStart(6) + Math.min(pUp, pDn).toFixed(2).padStart(10) +
              (juzgado[k] ? 'sí' : 'NO').padStart(10));
}
var nJ = juzgado.filter(Boolean).length;
console.log('falsa alarma con un modelo perfecto: 1 − 0,954^' + nJ + ' = ' + (100 * (1 - Math.pow(0.954, nJ))).toFixed(0) +
            ' % (conservadora: un falso «no pasa» no aprueba nada)');

console.log('\n── Criterio 3, MEDIDA: R2v = (∫V2 + Σ_{m>borde} F_j²) / ∫Σ·S2(m>borde)  (listón |R2v − 1| ≤ 2σ, §0 quater)');
console.log('anillo      R2v       σ  veredicto        R2 LF entera   S2·c/S2 (m>m_res)  F²máx/ΣF²   m más brillante');
var pasaC3 = true;
for (k = 0; k < NA; k++) {
  var g3 = grano(k, true), gT = grano(k, false);
  var sub = integralAnillo(k, campo('s2sub')), subc = integralAnillo(k, campo('s2csub'));
  var pasa3 = Math.abs(g3.R2 - 1) <= 2 * M3[k].sd;
  if (juzgado[k]) pasaC3 = pasaC3 && pasa3;
  console.log(ETQ[k].padEnd(8) + g3.R2.toFixed(3).padStart(8) + M3[k].sd.toFixed(3).padStart(8) +
              (!juzgado[k] ? '  sin potencia' : pasa3 ? '  PASA' : '  NO PASA').padEnd(17) +
              gT.R2.toFixed(3).padStart(13) +
              (sub > 0 ? (100 * subc / sub).toFixed(1) + ' %' : '—').padStart(20) +
              (100 * gT.fmax * gT.fmax / gT.f2).toFixed(1).padStart(10) + ' %' +
              (-2.5 * Math.log10(gT.fmax)).toFixed(2).padStart(12));
}

/* ── Preguntas 5 y 6: el fondo local a la escala de integración del ojo ──── */
var L5 = res.thGranoAs, Fcielo = res.cHalo.Fcielo, CminG = res.cGrano.Cmin;
function mResLocal(I) {
  var m = R.magLimite({ apertura: D, aumentos: cielo.aumentos, transmision: cielo.transmision,
                        sqm: -2.5 * Math.log10(Fcielo + I), pupilaOjo: cielo.pupilaOjo });
  return m == null ? -Infinity : m;
}
// Luz no resuelta: catalogadas bajo m_res (aprox. de la detección de (b)) más V1.
var noRes = {}, radialNoRes = {};
est.forEach(function (s) {
  if (s.m <= mResEn(s.r)) return;
  var kc = celda(s.x, s.y, L5); noRes[kc] = (noRes[kc] || 0) + s.F;
  var kr = Math.floor(s.r / L5); radialNoRes[kr] = (radialNoRes[kr] || 0) + s.F;
});
var p5 = []; for (k = 0; k < NA; k++) p5.push({ dm: [], d: [] });
var nx = Math.ceil(ANILLOS[NA] / L5);
for (var ix = -nx; ix < nx; ix++) for (var iy = -nx; iy < nx; iy++) {
  var xc = (ix + 0.5) * L5, yc = (iy + 0.5) * L5, rc = pob.radioPropio(xc, yc), a = anillo(rc);
  if (a < 0 || !(rc < pob.rtAs)) continue;
  var Iloc = (noRes[ix + ',' + iy] || 0) / (L5 * L5) + mom(rc).v1;
  var kr2 = Math.floor(rc / L5), r0 = kr2 * L5, r1c = r0 + L5;
  var Irad = (radialNoRes[kr2] || 0) / (Math.PI * (r1c * r1c - r0 * r0)) + mom(rc).v1;
  p5[a].dm.push(Math.abs(mResLocal(Iloc) - mResLocal(Irad)));
  p5[a].d.push((Iloc - Irad) / (Fcielo + Irad));
}
function p95(v) { var s = v.slice().sort(function (x, y) { return x - y; }); return s[Math.floor(0.95 * (s.length - 1))]; }
console.log('\n── Pregunta 5: |m_res(x,y) − m_res(r)| a la escala ' + L5.toFixed(1) + '" (listón p95 < 0,1 mag)');
console.log('── Pregunta 6: contraste RMS de la luz no resuelta δI/(Fcielo+⟨I⟩) contra Cmin del grano = ' +
            CminG.toExponential(2));
console.log('anillo   celdas  p95|Δm|  máx|Δm|  pregunta 5      RMS δI/I   RMS/Cmin');
var pasaQ5 = true;   // §0 bis: p95 ≤ 0,1 en todo anillo con celdas
for (k = 0; k < NA; k++) {
  var c5 = p5[k];
  if (!c5.dm.length) { console.log(ETQ[k].padEnd(8) + '  (sin celdas)'); continue; }
  var q95 = p95(c5.dm), mx = Math.max.apply(null, c5.dm);
  var rms = Math.sqrt(c5.d.reduce(function (acc, d) { return acc + d * d; }, 0) / c5.d.length);
  if (q95 > 0.1) pasaQ5 = false;
  console.log(ETQ[k].padEnd(8) + String(c5.dm.length).padStart(7) + q95.toFixed(3).padStart(9) +
              mx.toFixed(3).padStart(9) + (q95 < 0.1 ? '  radial vale' : '  local').padEnd(16) +
              rms.toExponential(2).padStart(11) + (rms / CminG).toFixed(3).padStart(11));
}

/* ── Veredicto: regla prerregistrada en §0 bis (#577), mecánica ─────────── */
var fallos = [];
if (!pasaC2) fallos.push('criterio 2');
if (!potDeriva.some(Boolean)) fallos.push('criterio 3 (§0 quater) sin potencia contra la deriva en ningún anillo');
else if (!pasaC3) fallos.push('criterio 3 (§0 quater)');
if (!potCons) fallos.push('conservación sin potencia en ningún anillo');
else if (!pasaCons) fallos.push('conservación contra el modelo');
if (!pasaQ5) fallos.push('p95 |Δm_res| ≤ 0,1');
console.log('\n══ Veredicto (§0 bis, conservación de §0 ter, criterio 3 de §0 quater): ' + (fallos.length ? 'NO SE PUEDE TODAVÍA — falla: ' + fallos.join(', ') : 'SÍ'));

/* ── Atribución (#590, spike): catálogo contra el modelo por anillo × rango ───
   Solo con --atribucion. Mide, no corrige: no toca producción ni el velo
   (ADR 0003). Para cada anillo y rango de magnitud compara lo que trae el
   catálogo (miembros, banda V) con lo que el modelo dice que Gaia trae,
   ∫Σ·num·c dΩ, en cuentas (N), flujo (F) y flujo² (F²). Por encima del borde
   las sintéticas completan la LF, así que ahí el modelo es ∫Σ·num (sin c).
   Rangos en bordes de bin (MBORDE ± k): cada bin cae entero en un rango.
   ΔS1 y ΔR2v: lo que aporta cada rango al residuo de la conservación
   (obs − mod, sobre ∫Σ·S1) y de R2v (ΣF²_cat − ∫Σ·num·f²·c, sobre
   ∫Σ·S2(m>borde)). Suman, con V1/V2 que se cancelan, el residuo de §0 bis. */
if (process.argv.indexOf('--atribucion') > 0) {
  var BORDES = [-Infinity, MBORDE - 4, MBORDE - 2, MBORDE - 1, MBORDE, MBORDE + 1, MBORDE + 2, MBORDE + 3, Infinity];
  var NR = BORDES.length - 1;
  var rango = function (m) { for (var i = 0; i < NR; i++) if (m <= BORDES[i + 1]) return i; return NR - 1; };
  var ETQR = [];
  for (var q0 = 0; q0 < NR; q0++)
    ETQR.push((isFinite(BORDES[q0]) ? BORDES[q0].toFixed(2) : '') + '–' + (isFinite(BORDES[q0 + 1]) ? BORDES[q0 + 1].toFixed(2) : ''));
  var rBin = []; for (var kb = 0; kb < NB; kb++) rBin[kb] = rango(mAp[kb]);
  console.log('\n── Atribución (#590): observado / modelo por anillo y rango (banda V, solo miembros)');
  for (var ka = 0; ka < NA; ka++) {
    var r0 = ANILLOS[ka], r1 = Math.min(ANILLOS[ka + 1], pob.rtAs), NT = 400, h = (r1 - r0) / NT;
    var mN = new Float64Array(NR), mF = new Float64Array(NR), mF2 = new Float64Array(NR), mNt = new Float64Array(NR);
    var mS = new Float64Array(NR), S1mod = 0, S2v = 0, S2tot = 0;
    for (var it2 = 0; it2 <= NT; it2++) {
      var rr = r0 + it2 * h, sg = pob.sigma(rr) * (it2 === 0 || it2 === NT ? 0.5 : 1) * 2 * Math.PI * rr * h;
      for (kb = 0; kb < NB; kb++) {
        var cc = pob.completitud(mAp[kb], rr), velo = mAp[kb] > MCUT, ex = velo ? cc : 1;
        mN[rBin[kb]] += sg * num[kb] * cc;                       // lo que debe traer el catálogo
        if (!velo) mS[rBin[kb]] += sg * num[kb] * (1 - cc);      // lo que deben traer las sintéticas
        mF[rBin[kb]] += sg * num[kb] * fB[kb] * ex;
        mNt[rBin[kb]] += sg * num[kb];
        S1mod += sg * num[kb] * fB[kb];
        S2tot += sg * num[kb] * fB[kb] * fB[kb];
        if (velo) { mF2[rBin[kb]] += sg * num[kb] * fB[kb] * fB[kb] * cc; S2v += sg * num[kb] * fB[kb] * fB[kb]; }
      }
    }
    var oN = new Float64Array(NR), oF = new Float64Array(NR), oF2 = new Float64Array(NR), oS = new Float64Array(NR);
    est.forEach(function (s, i) {
      if (anillo(s.r) !== ka) return;
      var q = rango(s.m);
      oF[q] += s.F;
      if (i >= nCat) oS[q]++; else { oN[q]++; if (s.m > MBORDE) oF2[q] += s.F * s.F; }
    });
    console.log('\n' + ETQ[ka] + ' r_h   ∫Σ·S1 = ' + S1mod.toExponential(3) + '   ∫Σ·S2(m>borde) = ' + S2v.toExponential(3) +
                '   σ Poisson del flujo √(∫Σ·S2)/∫Σ·S1 = ' + (Math.sqrt(S2tot) / S1mod).toFixed(3));
    console.log('rango V        N cat  ∫Σ·num·c  cat/mod  ±1σ   N sint ∫Σ·num(1−c)  c medio  F o/m  F² o/m     ΔS1     ΔR2v');
    for (var q2 = 0; q2 < NR; q2++) {
      if (!(mNt[q2] > 0.5) && !oN[q2]) continue;
      var arriba = BORDES[q2 + 1] <= MBORDE + 1e-9;
      console.log(ETQR[q2].padEnd(13) + String(oN[q2]).padStart(7) + mN[q2].toFixed(1).padStart(10) +
                  (oN[q2] / mN[q2]).toFixed(3).padStart(9) + (1 / Math.sqrt(Math.max(mN[q2], 1e-9))).toFixed(3).padStart(6) +
                  (arriba ? String(oS[q2]).padStart(9) + mS[q2].toFixed(1).padStart(13) : '—'.padStart(9) + '—'.padStart(13)) +
                  (mN[q2] / mNt[q2]).toFixed(3).padStart(9) + (oF[q2] / mF[q2]).toFixed(3).padStart(7) +
                  (arriba ? '—' : (oF2[q2] / mF2[q2]).toFixed(3)).padStart(8) +
                  ((oF[q2] - mF[q2]) / S1mod).toFixed(4).padStart(9) +
                  (arriba ? '—' : ((oF2[q2] - mF2[q2]) / S2v).toFixed(4)).padStart(9));
    }
  }
}

/* ── Micro-casos de las preguntas 1-3 (sin catálogo, sin cuentas) ────────────
   PSF gaussiana de FWHM 0,84·θ_sep (FWHM de Airy / radio del primer anillo
   oscuro = 1,03/1,22). shortcut: la PSF de producción es un sprite, no una
   función; para contar picos de dos o tres estrellas basta la gaussiana. Las
   estrellas son colineales, así que los picos viven en la recta que las une y
   un perfil 1D a lo largo de ella los encuentra todos. */
var SIG = 0.84 * TH / 2.3548;
function picos(pos, F, valle) {
  var lo = Math.min.apply(null, pos) - 4 * SIG, hi = Math.max.apply(null, pos) + 4 * SIG;
  var N = 4000, h = (hi - lo) / N, I = new Float64Array(N + 1);
  for (var i = 0; i <= N; i++) {
    var t = lo + i * h;
    for (var j = 0; j < pos.length; j++) I[i] += F[j] * Math.exp(-Math.pow(t - pos[j], 2) / (2 * SIG * SIG));
  }
  var p = [];
  for (i = 1; i < N; i++) if (I[i] > I[i - 1] && I[i] >= I[i + 1]) p.push(i);
  /* Profundidad de valle exigida: dos picos vecinos cuentan como dos solo si el
     mínimo entre ellos baja al menos `valle` por debajo del más débil. 0 es
     Sparrow (basta un mínimo); 0,265 es la del par igual de Airy a Rayleigh. */
  var fundido = true;
  while (fundido && p.length > 1) {
    fundido = false;
    for (var q = 0; q + 1 < p.length; q++) {
      var vmin = Infinity;
      for (var t2 = p[q]; t2 <= p[q + 1]; t2++) vmin = Math.min(vmin, I[t2]);
      if (1 - vmin / Math.min(I[p[q]], I[p[q + 1]]) < valle) {
        p.splice(I[p[q]] >= I[p[q + 1]] ? q + 1 : q, 1);
        fundido = true; break;
      }
    }
  }
  return p.map(function (ii) { return lo + ii * h; });
}
function caso(valle, nombre, pos, dm) {
  var F = dm.map(function (d) { return Math.pow(10, -0.4 * d); });
  var Ft = F.reduce(function (s, x) { return s + x; }, 0);
  var cen = pos.reduce(function (s, x, i) { return s + x * F[i]; }, 0) / Ft;
  var g = fof(pos.map(function (x) { return { x: x, y: 0 }; }), TH);
  var pk = picos(pos, F, valle);
  // La posición solo tiene sentido si el pico es UNO de verdad (sin mínimo); un
  // par fundido por el umbral de valle es una mancha alargada sin pico único.
  var natural = picos(pos, F, 0).length === 1;
  console.log(nombre.padEnd(34) + ('(a) ' + g.length + ' punto' + (g.length > 1 ? 's' : '')).padEnd(14) +
              ('(b) ' + pk.length + ' pico' + (pk.length > 1 ? 's' : '')).padEnd(13) +
              (pk.length === 1 && natural ? ('pico − centroide = ' + ((pk[0] - cen) / TH).toFixed(3) + ' θ') :
               pk.length === 1 ? 'mancha alargada (fundida por el valle)' : ''));
}
function micro(valle, nombre) {
  console.log('\n── Micro-casos, valle exigido ' + valle.toFixed(3) + ' (' + nombre + ')');
  caso(valle, 'par igual, 0,50 θ', [0, 0.5 * TH], [0, 0]);
  caso(valle, 'par igual, 0,70 θ', [0, 0.7 * TH], [0, 0]);
  caso(valle, 'par igual, 0,75 θ', [0, 0.75 * TH], [0, 0]);
  caso(valle, 'par igual, 0,95 θ', [0, 0.95 * TH], [0, 0]);
  caso(valle, 'par igual, 1,00 θ', [0, 1.00 * TH], [0, 0]);  // borde de Rayleigh (ADR 0040)
  caso(valle, 'par Δm=2, 0,70 θ', [0, 0.7 * TH], [0, 2]);
  caso(valle, 'par Δm=2, 0,95 θ', [0, 0.95 * TH], [0, 2]);
  caso(valle, 'par Δm=2, 1,50 θ', [0, 1.5 * TH], [0, 2]);
  caso(valle, 'par Δm=0,75, 0,95 θ', [0, 0.95 * TH], [0, 0.75]);
  caso(valle, 'cadena A–B–C igual, paso 0,60 θ', [0, 0.6 * TH, 1.2 * TH], [0, 0, 0]);
  caso(valle, 'cadena A–B–C igual, paso 0,90 θ', [0, 0.9 * TH, 1.8 * TH], [0, 0, 0]);
}
micro(0, 'Sparrow: basta un mínimo');
micro(0.265, 'Rayleigh: el valle del par igual de Airy al radio del primer anillo oscuro');
// Valle de esta PSF para un par igual a 1 θ: comprueba que la gaussiana reproduce Rayleigh.
var vm = Math.exp(-Math.pow(0.5 * TH, 2) / (2 * SIG * SIG)) * 2, pk1 = 1 + Math.exp(-TH * TH / (2 * SIG * SIG));
console.log('valle de la gaussiana, par igual a 1 θ: ' + (100 * (1 - vm / pk1)).toFixed(1) + ' %');
/* Criterio de la casa para el OJO (resolucionDoble, bitacora-ocular.js): hace
   falta aum·sep ≥ 300″ para empezar a partir un par. Es la resolución angular
   del ojo sobre la imagen aumentada, independiente de la PSF. */
// Cita de la constante 300″ de resolucionDoble (bitacora-ocular.js, código de UI
// no cargable en Node): el arnés la imprime, no la usa para decidir nada.
console.log('ojo (resolucionDoble): a ' + MAG + '× parte pares desde ' + (300 / MAG).toFixed(2) + '″ = ' +
            (300 / MAG / TH).toFixed(2) + ' θ_sep; θ_sep·M = ' + (TH * MAG).toFixed(0) + '″');
/* Dos estrellas bajo m_res cuya suma lo supera: cada una 0,6 mag más débil que
   m_res; juntas, 2,5·log10(2) − 0,6 = 0,15 mag más brillantes. */
var dmSub = 0.6, mJuntas = -2.5 * Math.log10(2) + dmSub;
console.log('dos a m_res+' + dmSub.toFixed(2) + ' a 0,5 θ: el par suma m_res' + (mJuntas >= 0 ? '+' : '') +
            mJuntas.toFixed(2) + '; la escala a la que el ojo suma la luz de un punto (θ_R/M) es ' +
            (res.thGranoAs / TH).toFixed(1) + ' θ_sep');

/* Pregunta 6 leída de PRODUCCIÓN (ADR 0008): la visibilidad del grano con la ley
   del ADR 0015 (`tabla.sGrano`, P(ver)) para el S2campo de producción, que es la
   varianza ESPERADA de toda la luz sub-m_res. Bajo la partición, esa misma
   varianza se reparte entre V2 (sintética) y la fluctuación real del catálogo
   no resuelto, con el mismo valor esperado. */
var sgMax = new Float64Array(NA);
for (var it = 0; it < tabla.r.length; it++) {
  var aa = anillo(tabla.r[it]);
  if (aa >= 0 && tabla.sGrano[it] > sgMax[aa]) sgMax[aa] = tabla.sGrano[it];
}
console.log('\n── Pregunta 6 con la ley de producción: máx P(ver grano) = tabla.sGrano por anillo');
console.log(ETQ.map(function (s3) { return s3.padStart(9); }).join(''));
console.log(Array.prototype.map.call(sgMax, function (x) { return x.toExponential(1).padStart(9); }).join(''));
