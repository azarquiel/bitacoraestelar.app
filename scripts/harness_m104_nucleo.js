#!/usr/bin/env node
/* HARNESS DE DIAGNÓSTICO: M104 (NGC 4594) a 400x con 200/9, 350/5 y 450/4.

   NO toca producción. Dos preguntas:
     1. ¿El detalle que separaría 200/350/450 mm está en los datos de PS1 o lo
        borra el seeing/muestreo del stack?
     2. ¿El «anillo oscuro» alrededor del núcleo nace en PS1, en la PSF, en la
        restauración de máscara, en la mezcla imagen/modelo o en la
        transformación de visualización?

   Etapas medidas:
     A  parche PS1 crudo (DN del stack, NaN incluidos)
     A' parche tras quitar estrellas + anclar (lo que producción llama parche.datos)
     B  A' + PSF SIN restaurar máscara (convolución local idéntica al kernel de producción)
     C  A' + PSF CON restauración (ps1PsfParche de producción)
     D  difuso tras ps1PintarParche (flujo/arcsec², lienzo 720 px, 400x)
     E  niveles de pantalla tras realce perceptual + curva de tono + adaptación
        local (la adaptación se emula con gaussiana σ=SIZE/60; el canvas de
        producción usa blur nativo, mismo σ)

   REFERENCIA FIJA: ningún array se normaliza por su MAD ni por su contraste.
   Cada etapa se mide en sus unidades nativas y las comparaciones entre
   aperturas/variantes comparten unidades y escala de recorte.

   Sin red: usa los parches de simulador_ocular/cache-ps1 (lib_parches_ps1).
   Limitación declarada: sin muestra de Gaia aquí, ps1QuitarEstrellas no quita
   nada; los huecos del stack (estrellas saturadas) siguen en A tal cual.

   Uso:  node scripts/harness_m104_nucleo.js */
'use strict';

var fs = require('fs'), path = require('path');
global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;
var FOT = R.fot, PS1 = R.ps1;
var PAR = require('./lib_parches_ps1.js')(R);

var OUT_DIR = path.join(__dirname, '..', '.scratch', 'm104-nucleo');
fs.mkdirSync(OUT_DIR, { recursive: true });

function f(v, d) { return (v == null || !isFinite(v)) ? '—' : v.toFixed(d == null ? 3 : d); }
// Para flujos: los anclados van en ~1e-8 y toFixed(4) los aplasta a 0.0000.
function g(v) {
  if (v == null || !isFinite(v)) return '—';
  var a = Math.abs(v);
  return (a !== 0 && (a < 1e-2 || a >= 1e6)) ? v.toExponential(3) : v.toFixed(4);
}
function fila(c) { console.log(c.join(' | ')); }

/* ── M104 del catálogo y su parche cacheado ──────────────────────────────── */
var CAT = global.window.BITACORA_GALAXIAS;
var filaCat = null;
for (var i = 0; i < CAT.length; i++) if (CAT[i][0] === 'NGC 4594') filaCat = CAT[i];
if (!filaCat) { console.error('NGC 4594 no está en el catálogo'); process.exit(1); }
var gal = {
  nombre: filaCat[0], ra: filaCat[2], dec: filaCat[3], reArcsec: filaCat[4],
  ba: filaCat[5], pa: filaCat[6], magV: filaCat[7], n: filaCat[8], bt: filaCat[9],
  nMedido: filaCat[11] || 0, ladoArcmin: R.ps1LadoArcmin(filaCat[4])
};
var p = PAR.buscar('NGC 4594');
var B = require('./lib_bajar_parche.js')(R);
console.log('═══ M104 = NGC 4594 ═══');
console.log('  catálogo: re=' + gal.reArcsec + '″  b/a=' + gal.ba + '  PA=' + gal.pa +
  '  magV=' + gal.magV + '  n=' + gal.n + '  ladoArcmin(prod)=' + f(gal.ladoArcmin, 2));

/* El parche que producción pide HOY: salida=1024 (PS1.salida). El de cache-ps1
   es de 512 px, anterior al cambio de resolución: se usa solo como control de
   escala. Sin red, se cae al de 512 avisando. */
var F = null, nuc = null, ladoUsado = gal.ladoArcmin;
B.bajar(gal.ra, gal.dec, gal.ladoArcmin, PS1.salida).then(function (f1024) {
  F = f1024;
  nuc = [(F.ancho - 1) / 2, (F.alto - 1) / 2];   // bajar() recorta centrado en (ra,dec)
  console.log('  parche: ' + F.ancho + '×' + F.alto + ' px (salida=' + PS1.salida +
    '), lado=' + f(ladoUsado, 2) + '′, escalaAs=' + f(F.escalaAs, 3) + '″/px · sin WCS ⇒ afin norte-arriba');
  cuerpo();
}).catch(function (e) {
  if (!p) { console.error('sin red y sin parche en cache-ps1: ' + e.message); process.exit(1); }
  F = p.fits; ladoUsado = p.ladoArcmin;
  nuc = F.wcs ? R.ps1CieloAPixel(F.wcs, gal.ra, gal.dec) : [(F.ancho - 1) / 2, (F.alto - 1) / 2];
  console.log('  ⚠ sin red (' + e.message + '): parche de CACHÉ 512 px, escalaAs=' + f(F.escalaAs, 3) + '″/px');
  cuerpo();
});

function cuerpo() {
if (p && p.fits !== F) {
  console.log('  control de escala: caché 512 px tiene escalaAs=' + f(p.fits.escalaAs, 3) +
    '″/px; producción usa ' + f(F.escalaAs, 3) + '″/px');
}

/* ── Métricas radiales, unidades nativas, referencia fija ────────────────── */
/* Anillos de ANCHO_AS de ancho hasta RMAX_AS alrededor de (cx,cy). Devuelve por
   anillo: n, min, max, mediana, media y flujo acumulado (suma de medias·área
   para que los NaN no muerdan el acumulado). */
var ANCHO_AS = 2, RMAX_AS = 120;
function perfil(datos, ancho, alto, escalaAs, cx, cy) {
  var nA = Math.ceil(RMAX_AS / ANCHO_AS), anillos = [];
  for (var a = 0; a < nA; a++) anillos.push([]);
  var nan = 0, posNan = [], rNan = [];
  var rMaxPx = RMAX_AS / escalaAs;
  var x0 = Math.max(0, Math.floor(cx - rMaxPx)), x1 = Math.min(ancho - 1, Math.ceil(cx + rMaxPx));
  var y0 = Math.max(0, Math.floor(cy - rMaxPx)), y1 = Math.min(alto - 1, Math.ceil(cy + rMaxPx));
  for (var y = y0; y <= y1; y++) {
    for (var x = x0; x <= x1; x++) {
      var rAs = Math.hypot(x - cx, y - cy) * escalaAs;
      if (rAs >= RMAX_AS) continue;
      var v = datos[y * ancho + x];
      if (!isFinite(v)) {
        nan++; rNan.push(rAs);
        if (posNan.length < 12) posNan.push('(' + x + ',' + y + ') r=' + f(rAs, 1) + '″');
        continue;
      }
      anillos[Math.floor(rAs / ANCHO_AS)].push(v);
    }
  }
  var out = [], acum = 0;
  for (a = 0; a < nA; a++) {
    var m = anillos[a].sort(function (u, w) { return u - w; });
    var s = 0; for (i = 0; i < m.length; i++) s += m[i];
    var media = m.length ? s / m.length : NaN;
    // Área geométrica del anillo × media: el acumulado no depende de cuántos
    // NaN cayeran dentro (flujo por unidad de área × área).
    var areaAs2 = Math.PI * (Math.pow((a + 1) * ANCHO_AS, 2) - Math.pow(a * ANCHO_AS, 2));
    if (isFinite(media)) acum += media * areaAs2 / (escalaAs * escalaAs);
    out.push({
      r0: a * ANCHO_AS, r1: (a + 1) * ANCHO_AS, n: m.length,
      min: m.length ? m[0] : NaN, max: m.length ? m[m.length - 1] : NaN,
      med: m.length ? m[m.length >> 1] : NaN, media: media, acum: acum
    });
  }
  return { anillos: out, nan: nan, posNan: posNan, rNan: rNan };
}

/* Mínimo radial local («anillo oscuro»): mediana del anillo por debajo de la
   del anterior Y de la del siguiente. Devuelve el más profundo en r<40″. */
function anilloOscuro(anillos) {
  var peor = null;
  for (var a = 1; a < anillos.length - 1 && anillos[a].r0 < 40; a++) {
    var v = anillos[a].med, ant = anillos[a - 1].med, sig = anillos[a + 1].med;
    if (!(isFinite(v) && isFinite(ant) && isFinite(sig))) continue;
    if (v < ant && v < sig) {
      var prof = Math.min(ant, sig) - v;
      if (!peor || prof > peor.prof) peor = { r: (anillos[a].r0 + anillos[a].r1) / 2, med: v, prof: prof };
    }
  }
  return peor;
}

function resumen(nombre, datos, ancho, alto, escalaAs, cx, cy, unidad) {
  var P = perfil(datos, ancho, alto, escalaAs, cx, cy);
  var A = P.anillos;
  console.log('\n── ' + nombre + ' ──  [' + unidad + ']  escalaAs=' + f(escalaAs, 3) +
    '″/px · parche=' + f(ancho * escalaAs / 60, 2) + '′ de lado');
  console.log('  NaN/Inf en r<' + RMAX_AS + '″: ' + P.nan +
    (P.nan ? '  primeras: ' + P.posNan.join(' ') : ''));
  if (P.nan) {
    var rs = P.rNan.sort(function (u, w) { return u - w; });
    console.log('  radios de los NaN: min=' + f(rs[0], 1) + '″ mediana=' +
      f(rs[rs.length >> 1], 1) + '″ max=' + f(rs[rs.length - 1], 1) + '″');
  }
  fila(['  r (″)', 'n', 'min', 'mediana', 'max', 'acumulado']);
  for (var a = 0; a < A.length; a++) {
    if (A[a].r0 < 20 || A[a].r0 % 10 === 0) {
      fila(['  ' + f(A[a].r0, 0) + '–' + f(A[a].r1, 0), '' + A[a].n,
        g(A[a].min), g(A[a].med), g(A[a].max), g(A[a].acum)]);
    }
  }
  var centro = A[0].med;
  console.log('  centro (0–2″) − anillos: 2–4″: ' + g(centro - A[1].med) +
    '  4–6″: ' + g(centro - A[2].med) + '  6–8″: ' + g(centro - A[3].med));
  var osc = anilloOscuro(A);
  console.log('  mínimo radial local en r<40″: ' + (osc
    ? 'SÍ, en r≈' + f(osc.r, 0) + '″ (mediana ' + g(osc.med) + ', profundidad ' + g(osc.prof) + ')'
    : 'no'));
  return P;
}

/* ── Recorte del núcleo: PGM con escala FIJA por grupo ───────────────────── */
var CORTE_PX = 65;   // lado del recorte, en px del array que toque
function recorte(datos, ancho, alto, cx, cy) {
  var h = CORTE_PX >> 1, out = new Float32Array(CORTE_PX * CORTE_PX);
  for (var y = 0; y < CORTE_PX; y++) {
    for (var x = 0; x < CORTE_PX; x++) {
      var px = Math.round(cx) - h + x, py = Math.round(cy) - h + y;
      out[y * CORTE_PX + x] = (px >= 0 && px < ancho && py >= 0 && py < alto)
        ? datos[py * ancho + px] : NaN;
    }
  }
  return out;
}
/* topeFijo: el MISMO para todos los recortes del grupo (referencia fija). Los
   NaN se pintan a 0 para que se vean como agujeros. log1p para que el núcleo no
   se coma la escala, pero el TOPE sigue siendo común. */
function guardarPGM(nombre, rec, topeFijo) {
  var lin = ['P2', CORTE_PX + ' ' + CORTE_PX, '255'];
  var esc = topeFijo > 0 ? 255 / Math.log1p(topeFijo) : 0;
  for (var y = 0; y < CORTE_PX; y++) {
    var l = [];
    for (var x = 0; x < CORTE_PX; x++) {
      var v = rec[y * CORTE_PX + x];
      l.push(isFinite(v) && v > 0 ? Math.min(255, Math.round(Math.log1p(v) * esc)) : 0);
    }
    lin.push(l.join(' '));
  }
  fs.writeFileSync(path.join(OUT_DIR, nombre + '.pgm'), lin.join('\n') + '\n');
}
function maxFinito(rec) {
  var m = 0; for (var i = 0; i < rec.length; i++) if (isFinite(rec[i]) && rec[i] > m) m = rec[i];
  return m;
}

/* ── Convolución local: el MISMO kernel que producción, SIN restaurar ────── */
/* Copia de ps1PsfParche menos el bucle final de restauración. Diagnóstico:
   permite separar «PSF» de «PSF+máscara restaurada». */
function convSinRestaurar(datos, ancho, alto, sigmaPx) {
  if (!(sigmaPx > 0.01)) return datos;
  var n = datos.length, i, j, x, y, acc, w, q, val;
  var rad = Math.max(1, Math.ceil(3 * sigmaPx)), m = 2 * rad + 1;
  var k = new Float64Array(m), s = 0;
  for (i = 0; i < m; i++) { k[i] = Math.exp(-((i - rad) * (i - rad)) / (2 * sigmaPx * sigmaPx)); s += k[i]; }
  for (i = 0; i < m; i++) k[i] /= s;
  var tmp = new Float32Array(n), out = new Float32Array(n);
  for (y = 0; y < alto; y++) for (x = 0; x < ancho; x++) {
    acc = 0; w = 0;
    for (j = 0; j < m; j++) {
      q = x + j - rad; if (q < 0) q = 0; else if (q >= ancho) q = ancho - 1;
      val = datos[y * ancho + q];
      if (isFinite(val)) { acc += k[j] * val; w += k[j]; }
    }
    tmp[y * ancho + x] = w > 0 ? acc / w : NaN;
  }
  for (y = 0; y < alto; y++) for (x = 0; x < ancho; x++) {
    acc = 0; w = 0;
    for (j = 0; j < m; j++) {
      q = y + j - rad; if (q < 0) q = 0; else if (q >= alto) q = alto - 1;
      val = tmp[q * ancho + x];
      if (isFinite(val)) { acc += k[j] * val; w += k[j]; }
    }
    out[y * ancho + x] = w > 0 ? acc / w : NaN;
  }
  return out;
}
var FWHM_A_SIGMA = 2 * Math.sqrt(2 * Math.LN2);
function sigmaPxDe(D, escalaAs) { return R.ps1ThetaAdd(D, escalaAs) / FWHM_A_SIGMA / escalaAs; }

/* ── Equipos ─────────────────────────────────────────────────────────────── */
var MAG = 400, SIZE = 720, AFOV = 70;
var ARCMIN = AFOV * 60 / MAG;   // campo real a 400x con 70° aparentes
var EQUIPOS = [
  { D: 200, foc: 'f/9' },
  { D: 350, foc: 'f/5' },
  { D: 450, foc: 'f/4' }
];
function cieloDe(D) {
  return { pupilaSalida: D / MAG, aumentos: MAG, sqm: 21, pupilaOjo: 7,
           realceMax: PS1.realceMax };
}

/* ═══ 0. ¿Hay detalle que separar? Resolución y estructura ════════════════ */
console.log('\n═══ 0. Pregunta 1: ¿el detalle 200/350/450 está en los datos? ═══');
console.log('  El parche trae: seeing del stack (' + PS1.seeingAs + '″) ⊕ caja del píxel (' +
  f(F.escalaAs * 0.6796, 2) + '″) = ' +
  f(Math.hypot(PS1.seeingAs, F.escalaAs * 0.6796), 2) + '″ de FWHM efectiva.');
fila(['  equipo', 'FWHM telescopio (″)', 'θ_add (″)', 'σ kernel (px parche)', 'ojo a 400x (″)']);
EQUIPOS.forEach(function (e) {
  fila(['  ' + e.D + ' mm ' + e.foc,
    f(2 * R.radioImagenEstelar(e.D), 2),
    f(R.ps1ThetaAdd(e.D, F.escalaAs), 2),
    f(sigmaPxDe(e.D, F.escalaAs), 2),
    f(120 / MAG, 2)]);
});
console.log('  (la FWHM del telescopio la fija radioImagenEstelar: Airy ⊕ seeing de la escena;');
console.log('   θ_add = √(FWHM_tel² − FWHM_parche²), lo ÚNICO que la PSF añade al parche)');

/* Estructura fina: RMS del residuo tras suavizar a 12″, dentro del cuerpo,
   normalizado por el brillo medio del MISMO recinto (adimensional; no es la
   normalización por imagen que está prohibida arriba: compara la misma zona
   consigo misma y la referencia es común a todas las variantes). */
var REF_AS = 12;
function estructura(datos, an, al, esc, cx, cy, rMaxAs) {
  var sm = convSinRestaurar(datos, an, al, REF_AS / FWHM_A_SIGMA / esc);
  var rMax = rMaxAs / esc, s2 = 0, s1 = 0, n = 0;
  var cielo = R.ps1Cielo(datos, an, al);
  for (var y = 0; y < al; y++) for (var x = 0; x < an; x++) {
    var dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy > rMax * rMax) continue;
    var i = y * an + x, v = datos[i] - cielo;
    if (!(v > 0) || !isFinite(sm[i]) || !isFinite(datos[i])) continue;
    var d = datos[i] - sm[i];
    s2 += d * d; s1 += v; n++;
  }
  return n ? Math.sqrt(s2 / n) / (s1 / n) : 0;
}

/* ═══ Etapas A, A', B, C sobre el parche ══════════════════════════════════ */
console.log('\n═══ Etapas sobre el parche (unidades nativas, referencia fija) ═══');

// A: crudo
var A = F.datos;
resumen('A · parche PS1 crudo', A, F.ancho, F.alto, F.escalaAs, nuc[0], nuc[1], 'DN del stack');

// A': quitar estrellas (aquí no-op, sin Gaia) + anclar (lo que producción guarda)
var limpio = R.ps1QuitarEstrellas(A, F.ancho, F.alto, []);
var Ap = R.ps1AnclarACatalogo(limpio, F.ancho, F.alto, {
  magV: gal.magV, n: gal.n, reArcsec: gal.reArcsec,
  ladoArcmin: ladoUsado, escalaAs: F.escalaAs
});
resumen("A' · quitado+anclado (= parche.datos de producción)", Ap, F.ancho, F.alto,
  F.escalaAs, nuc[0], nuc[1], 'flujo/arcsec²');

// B y C por apertura
var porAper = {};
EQUIPOS.forEach(function (e) {
  var sig = sigmaPxDe(e.D, F.escalaAs);
  var B = convSinRestaurar(Ap, F.ancho, F.alto, sig);
  var C = R.ps1PsfParche(Ap, F.ancho, F.alto, F.escalaAs, e.D);
  porAper[e.D] = { B: B, C: C };
  resumen('B · A′+PSF sin restaurar máscara · ' + e.D + ' mm (σ=' + f(sig, 2) + ' px)',
    B, F.ancho, F.alto, F.escalaAs, nuc[0], nuc[1], 'flujo/arcsec²');
  resumen('C · A′+PSF producción (restaura máscara) · ' + e.D + ' mm',
    C, F.ancho, F.alto, F.escalaAs, nuc[0], nuc[1], 'flujo/arcsec²');
  var dMax = 0, nDif = 0;
  for (var i = 0; i < B.length; i++) {
    var db = B[i], dc = C[i];
    if (isFinite(db) !== isFinite(dc)) { nDif++; continue; }
    if (isFinite(db) && Math.abs(db - dc) > dMax) dMax = Math.abs(db - dc);
  }
  console.log('  B vs C: ' + nDif + ' px con finitud distinta, Δmax=' + g(dMax) +
    '  (si 0 y 0: la restauración es un no-op aquí porque el anclaje ya quitó los NaN)');
});

// PSF también sobre el CRUDO (con sus NaN): aquí la restauración sí actúa
console.log('\n── Control: PSF sobre el parche CRUDO (NaN vivos) · 450 mm ──');
var sig450 = sigmaPxDe(450, F.escalaAs);
var Bcrudo = convSinRestaurar(A, F.ancho, F.alto, sig450);
var Ccrudo = R.ps1PsfParche(A, F.ancho, F.alto, F.escalaAs, 450);
resumen('crudo+PSF sin restaurar', Bcrudo, F.ancho, F.alto, F.escalaAs, nuc[0], nuc[1], 'DN');
resumen('crudo+PSF restaurando', Ccrudo, F.ancho, F.alto, F.escalaAs, nuc[0], nuc[1], 'DN');

/* Estructura por variante y apertura */
console.log('\n── Estructura fina (RMS residuo a 12″ / brillo medio, r<' + f(gal.reArcsec, 0) + '″) ──');
var rCuerpo = gal.reArcsec;
fila(['  variante', '200 mm', '350 mm', '450 mm']);
fila(["  A' sin PSF", f(estructura(Ap, F.ancho, F.alto, F.escalaAs, nuc[0], nuc[1], rCuerpo), 4), '=', '=']);
fila(['  C con PSF'].concat(EQUIPOS.map(function (e) {
  return f(estructura(porAper[e.D].C, F.ancho, F.alto, F.escalaAs, nuc[0], nuc[1], rCuerpo), 4);
})));

/* ═══ Etapas D y E en el lienzo, con las 4 comparaciones controladas ══════ */
console.log('\n═══ Etapas D y E · lienzo ' + SIZE + ' px · campo ' + f(ARCMIN, 1) + '′ (400x, AFOV 70°) ═══');
var escLienzoAs = ARCMIN * 60 / SIZE;   // ″ por píxel del lienzo
console.log('  escala del lienzo: ' + f(escLienzoAs, 3) + '″/px  (parche: ' + f(F.escalaAs, 3) +
  '″/px ⇒ ' + f(F.escalaAs / escLienzoAs, 2) + ' px de lienzo por px de parche)');

function parcheNuevo() {
  // Parche COMPLETO de producción, reconstruido con las mismas funciones.
  var comps = R.ps1ComponentesSersic(gal);
  var peso = R.ps1PesoImagen(Ap, F.ancho, F.alto, F.escalaAs);
  var perfilP = R.ps1PerfilEnParche(comps, gal.pa, F.ancho, F.alto, F.afin || R.ps1AfinParche(F, gal));
  return {
    ra: gal.ra, dec: gal.dec, ladoArcmin: ladoUsado,
    ancho: F.ancho, alto: F.alto, afin: F.afin || R.ps1AfinParche(F, gal),
    comps: comps, pa: gal.pa, halo: R.ps1MedidasHalo(gal, comps),
    peso: peso, escalaMezcla: R.ps1EscalaMezcla(Ap, peso, perfilP),
    datos: Ap
  };
}

/* Etapa E sin canvas: la MISMA aritmética de pintarFot (canal único, sin capa
   de estrellas), con la adaptación local emulada por gaussiana σ=SIZE/60. */
function etapaE(difuso, mask, c) {
  var n = difuso.length, niveles = new Float32Array(n);
  for (var i = 0; i < n; i++) {
    var esGal = R.difusoMarcado(mask, i);
    var s = esGal ? 1 : (function (Fv) {
      if (!(Fv > 0)) return 0;
      var x = (Math.log10(Fv / (c.Fcielo * c.Cmin)) + FOT.UMBRAL_MARGEN) / FOT.UMBRAL_ANCHURA;
      x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x);
    })(difuso[i]);
    var d = difuso[i] * s;
    if (d > 0) d = R.realzarPerceptual(d, c.Fcielo, c.rango, esGal ? 0 : s, PS1.realceMax);
    niveles[i] = c.nivelFondo + R.valorDeFlujo(d, c.Fcielo, c.rango);
  }
  // adaptación local (emulada): v + realceDetalle(v − blur(v)); constantes de producción
  var borroso = convSinRestaurar(niveles, SIZE, SIZE, Math.round(SIZE / 60));
  var out = new Float32Array(n);
  var REALCE = 0.5, UMBRAL = 12;
  for (i = 0; i < n; i++) {
    var dif = niveles[i] - borroso[i];
    var abs = Math.abs(dif), sobre = abs - UMBRAL, g = 0;
    if (sobre > 0) {
      var t = Math.max(0, Math.min(1, sobre / UMBRAL));
      g = (dif >= 0 ? REALCE : REALCE * FOT.REALCE_OSCURO) * Math.sign(dif) * sobre * t * t * (3 - 2 * t);
    }
    out[i] = Math.max(0, Math.min(255, niveles[i] + g));
  }
  return out;
}

/* Variante bilineal de ps1PintarParche: SOLO cambia el muestreo del parche
   (bilineal en vez de Math.round); mezcla, opacidad y máscara, idénticas.
   EXPERIMENTO diagnóstico, no producción. El peso de mezcla sigue por vecino
   más próximo para aislar el efecto del muestreo de la imagen. */
function pintarParcheBilineal(difuso, parche, o, datos) {
  var esc = SIZE / (o.arcmin / 60);
  var cos0 = Math.cos(o.dec0 * Math.PI / 180);
  var dra = (((parche.ra - o.ra0 + 540) % 360) - 180) * cos0;
  var cx = SIZE / 2 - dra * esc, cy = SIZE / 2 - (parche.dec - o.dec0) * esc;
  var ladoPx = (parche.ladoArcmin / 60) * esc;
  if (!(ladoPx > 0.5)) return difuso;
  var a = parche.afin;
  var c = R.ctxFotometrico(o.cielo);
  var umbral = R.sbUmbralContraste(c);
  var pxPorAs = esc / 3600;
  var halo = R.ps1HaloActivo(parche.halo);
  var comps = halo ? (parche.comps || []) : [], pa = parche.pa || 0;
  var peso = halo ? (parche.peso || null) : null;
  var sMezcla = peso ? parche.escalaMezcla : 1;
  var haloPx = R.ps1RadioHaloAs(comps) * pxPorAs;
  var alcance = Math.max(ladoPx / 2, haloPx);
  var mask = R.difusoMaskDe(o.cielo, difuso.length);
  var x0 = Math.max(0, Math.floor(cx - alcance)), x1 = Math.min(SIZE - 1, Math.ceil(cx + alcance));
  var y0 = Math.max(0, Math.floor(cy - alcance)), y1 = Math.min(SIZE - 1, Math.ceil(cy + alcance));
  for (var y = y0; y <= y1; y++) {
    var norte = -(y - cy) / pxPorAs;
    for (var x = x0; x <= x1; x++) {
      var este = -(x - cx) / pxPorAs;
      var fx = a.cx + a.xe * este + a.xn * norte;
      var fy = a.cy + a.ye * este + a.yn * norte;
      var f = 0, k = -1;
      var ix = Math.floor(fx), iy = Math.floor(fy);
      if (iy >= 0 && iy < parche.alto - 1 && ix >= 0 && ix < parche.ancho - 1) {
        var tx = fx - ix, ty = fy - iy;
        var v00 = datos[iy * parche.ancho + ix], v10 = datos[iy * parche.ancho + ix + 1];
        var v01 = datos[(iy + 1) * parche.ancho + ix], v11 = datos[(iy + 1) * parche.ancho + ix + 1];
        if (isFinite(v00) && isFinite(v10) && isFinite(v01) && isFinite(v11)) {
          f = v00 * (1 - tx) * (1 - ty) + v10 * tx * (1 - ty) + v01 * (1 - tx) * ty + v11 * tx * ty;
        }
        k = Math.round(fy) * parche.ancho + Math.round(fx);
      }
      if (comps.length) {
        var fm = R.ps1FlujoModelo(comps, pa, norte, este);
        var w = (peso && k >= 0) ? peso[k] : 0;
        f = w * sMezcla * f + (1 - w) * fm;
      }
      if (!(f > 0)) continue;
      f = R.ps1FlujoConOpacidad(f, R.ps1Opacidad(-2.5 * Math.log10(f), umbral), c);
      if (!(f > 0)) continue;
      difuso[y * SIZE + x] += f;
      mask[y * SIZE + x] = 0;
    }
  }
  return difuso;
}

/* Núcleo en píxeles del LIENZO: M104 centrada ⇒ SIZE/2. */
var cxL = SIZE / 2, cyL = SIZE / 2;
var topesD = {}, topesE = {};   // referencia fija de los PGM: máximo COMÚN por etapa
var resultados = [];

var VARIANTES = [
  { id: 'sinPSF',    desc: 'PSF desactivada' },
  { id: 'psfSinMask', desc: 'PSF sin restaurar máscara' },
  { id: 'psfProd',   desc: 'PSF producción (restaura máscara)' },
  { id: 'psfBilineal', desc: 'PSF + bilineal (EXPERIMENTO)' }
];

EQUIPOS.forEach(function (e) {
  VARIANTES.forEach(function (v) {
    var parche = parcheNuevo();
    var cielo = cieloDe(e.D);
    var o = { ra0: gal.ra, dec0: gal.dec, arcmin: ARCMIN, size: SIZE,
              cielo: cielo, apertura: e.D };
    var difuso = new Float32Array(SIZE * SIZE);
    if (v.id === 'psfBilineal') {
      var datosPsf = R.ps1DatosConPsf(parche, F.escalaAs, e.D);
      pintarParcheBilineal(difuso, parche, o, datosPsf);
    } else {
      /* Inyección por la caché de ps1DatosConPsf: si parche.psfD === D devuelve
         parche.psfDatos tal cual. Así se elige la variante SIN tocar producción. */
      if (v.id === 'sinPSF') { parche.psfD = e.D; parche.psfDatos = parche.datos; }
      if (v.id === 'psfSinMask') { parche.psfD = e.D; parche.psfDatos = porAper[e.D].B; }
      R.ps1PintarParche(difuso, parche, o);
    }
    var mask = cielo.difusoMask;
    var c = R.ctxFotometrico(cielo);
    var E = etapaE(difuso, mask, c);
    resultados.push({ D: e.D, variante: v, difuso: difuso, E: E, c: c });
    var recD = recorte(difuso, SIZE, SIZE, cxL, cyL);
    topesD[e.D + v.id] = maxFinito(recD);
  });
});
// tope común de los PGM de la etapa D (referencia fija entre variantes y aperturas)
var topeD = 0; Object.keys(topesD).forEach(function (k) { if (topesD[k] > topeD) topeD = topesD[k]; });

console.log('\n── Etapa D (difuso, flujo/arcsec²·px de lienzo) y E (nivel de pantalla 0–255) ──');
resultados.forEach(function (r) {
  var nom = r.D + 'mm · ' + r.variante.desc;
  var PD = resumen('D · ' + nom, r.difuso, SIZE, SIZE, escLienzoAs, cxL, cyL, 'flujo sumado');
  resumen('E · ' + nom, r.E, SIZE, SIZE, escLienzoAs, cxL, cyL, 'nivel 0–255' +
    ' · fondo=' + f(r.c.nivelFondo, 1));
  guardarPGM('D_' + r.D + '_' + r.variante.id, recorte(r.difuso, SIZE, SIZE, cxL, cyL), topeD);
  guardarPGM('E_' + r.D + '_' + r.variante.id, recorte(r.E, SIZE, SIZE, cxL, cyL), 255);
  if (r.variante.id === 'psfProd' || r.variante.id === 'psfBilineal') {
    // campo completo: el recorte de 65 px se queda corto para ver el anillo entero
    var lin = ['P2', SIZE + ' ' + SIZE, '255'];
    for (var yy = 0; yy < SIZE; yy++) {
      var l = [];
      for (var xx = 0; xx < SIZE; xx++) l.push(Math.round(Math.max(0, Math.min(255, r.E[yy * SIZE + xx]))));
      lin.push(l.join(' '));
    }
    fs.writeFileSync(path.join(OUT_DIR, 'E_campo_' + r.D + '_' + r.variante.id + '.pgm'), lin.join('\n') + '\n');
  }
  void PD;
});

// PGM de las etapas del parche, tope común entre ellas (A va aparte: otra unidad)
guardarPGM('A_crudo', recorte(A, F.ancho, F.alto, nuc[0], nuc[1]), maxFinito(recorte(A, F.ancho, F.alto, nuc[0], nuc[1])));
var recAp = recorte(Ap, F.ancho, F.alto, nuc[0], nuc[1]);
var topeP = maxFinito(recAp);
guardarPGM('Aprima_anclado', recAp, topeP);
EQUIPOS.forEach(function (e) {
  guardarPGM('C_psf_' + e.D, recorte(porAper[e.D].C, F.ancho, F.alto, nuc[0], nuc[1]), topeP);
});
console.log('\nRecortes del núcleo (' + CORTE_PX + '×' + CORTE_PX + ' px, log1p, tope FIJO por grupo): ' + OUT_DIR);

/* ═══ Experimento F: la máscara de estrellas de Gaia sobre el NÚCLEO ═══════
   Gaia DR3 trae una fuente G≈16.2 a ~1,1″ del núcleo de M104 (es el propio
   núcleo). ps1QuitarEstrellas la enmascara con radio ps1RadioMascaraAs(G) y
   solo protege PS1.nucleoPx alrededor del centro del parche: todo lo demás se
   rellena PLANO con la mediana del anillo exterior. Aquí se mide qué le hace
   eso al perfil radial, con la lista REAL de Gaia (gaia_m104.csv, G≤20). */
var CSV = path.join(OUT_DIR, 'gaia_m104.csv');
if (fs.existsSync(CSV)) {
  console.log('\n═══ Experimento F: máscara de Gaia sobre el núcleo (producción la aplica) ═══');
  var estrellas = fs.readFileSync(CSV, 'utf8').trim().split('\n').slice(1).map(function (l) {
    var t = l.split(','); return [parseFloat(t[0]), parseFloat(t[1]), parseFloat(t[2])];
  }).filter(function (e) { return isFinite(e[2]); });
  console.log('  estrellas de la muestra: ' + estrellas.length + ' (G≤20, radio 7,5′)');
  var fSim = { ancho: F.ancho, alto: F.alto, escalaAs: F.escalaAs, wcs: F.wcs || null,
               afin: R.ps1AfinParche(F, gal) };
  var enPx = R.ps1EstrellasEnPixeles(fSim, gal, estrellas);
  var cerca = enPx.filter(function (e) {
    return Math.hypot(e.x - nuc[0], e.y - nuc[1]) * F.escalaAs < 30;
  });
  cerca.forEach(function (e) {
    console.log('  estrella a ' + f(Math.hypot(e.x - nuc[0], e.y - nuc[1]) * F.escalaAs, 1) +
      '″ del núcleo: G=' + f(e.g, 2) + '  radio de máscara=' + f(e.rAs, 1) +
      '″ (' + f(e.rPx, 1) + ' px)  · núcleo protegido: ' + PS1.nucleoPx + ' px = ' +
      f(PS1.nucleoPx * F.escalaAs, 1) + '″');
  });
  var limpioF = R.ps1QuitarEstrellas(A, F.ancho, F.alto, enPx);
  var ApF = R.ps1AnclarACatalogo(limpioF, F.ancho, F.alto, {
    magV: gal.magV, n: gal.n, reArcsec: gal.reArcsec,
    ladoArcmin: ladoUsado, escalaAs: F.escalaAs
  });
  resumen("F1 · quitado CON Gaia + anclado", ApF, F.ancho, F.alto, F.escalaAs, nuc[0], nuc[1], 'flujo/arcsec²');
  guardarPGM('F1_gaia_anclado', recorte(ApF, F.ancho, F.alto, nuc[0], nuc[1]), topeP);
  // y el render completo (D y E) con ese parche, 450 mm producción
  var parcheF = parcheNuevo();
  parcheF.datos = ApF;
  parcheF.peso = R.ps1PesoImagen(ApF, F.ancho, F.alto, F.escalaAs);
  parcheF.escalaMezcla = R.ps1EscalaMezcla(ApF, parcheF.peso,
    R.ps1PerfilEnParche(parcheF.comps, gal.pa, F.ancho, F.alto, parcheF.afin));
  EQUIPOS.forEach(function (e) {
    var cieloF = cieloDe(e.D);
    var oF = { ra0: gal.ra, dec0: gal.dec, arcmin: ARCMIN, size: SIZE, cielo: cieloF, apertura: e.D };
    var difusoF = new Float32Array(SIZE * SIZE);
    R.ps1PintarParche(difusoF, parcheF, oF);
    var EF = etapaE(difusoF, cieloF.difusoMask, R.ctxFotometrico(cieloF));
    resumen('F2 · D con Gaia · ' + e.D + ' mm', difusoF, SIZE, SIZE, escLienzoAs, cxL, cyL, 'flujo sumado');
    resumen('F3 · E con Gaia · ' + e.D + ' mm', EF, SIZE, SIZE, escLienzoAs, cxL, cyL, 'nivel 0–255');
    guardarPGM('F_E_' + e.D, recorte(EF, SIZE, SIZE, cxL, cyL), 255);
    var lin = ['P2', SIZE + ' ' + SIZE, '255'];
    for (var yy = 0; yy < SIZE; yy++) {
      var l = [];
      for (var xx = 0; xx < SIZE; xx++) l.push(Math.round(Math.max(0, Math.min(255, EF[yy * SIZE + xx]))));
      lin.push(l.join(' '));
    }
    fs.writeFileSync(path.join(OUT_DIR, 'F_E_campo_' + e.D + '.pgm'), lin.join('\n') + '\n');
  });
} else {
  console.log('\n(sin gaia_m104.csv: experimento F omitido)');
}

console.log('\n═══ Comprobación: producción intacta ═══');
console.log('  · solo se LLAMÓ a funciones exportadas; la variante se eligió por la caché');
console.log('    psfD/psfDatos del objeto parche local, no tocando bitacora-gaia-render.js.');
console.log('  · bilineal: pintado duplicado AQUÍ, marcado EXPERIMENTO.');
}   // fin de cuerpo()
