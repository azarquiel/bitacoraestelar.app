#!/usr/bin/env node
/* EXPERIMENTO CONTROLADO: M104 a 400x con 200/9, 350/5 y 450/4.

   Pregunta: ¿por qué 200/350/450 mm se parecen tanto a 400x? Separa CUATRO
   efectos sin mezclarlos:
     A) resolución/escala de PS1 (512/1024/2048 px de adquisición)
     B) PSF del telescopio (ps1PsfParche, sin tocar)
     C) remuestreo parche→lienzo (vecino más próximo de producción)
     D) bilineal (experimento)

   Cadenas construidas (todas con el MISMO parche, centro, recorte, tope tonal,
   realce y tamaño; nada se autoexpone por telescopio):
     A  = PS1 → PSF(D) → lienzo por vecino más próximo   (= producción actual)
     B  = PS1 → PSF(D) → lienzo bilineal                 (experimento)
     C  = PS1 → PSF(D) → lienzo supermuestreado 4×4      (control «ideal»)
     D  = PS1 sin PSF  → lienzo                          (techo de detalle de PS1)

   C no existe en producción: producción lee UN píxel del parche por píxel de
   lienzo (Math.round). El control C lee 16 subposiciones por píxel de lienzo y
   promedia el MISMO camino (mezcla+opacidad incluidas): es la reconstrucción de
   área a la misma escala final. La única diferencia con producción es ese
   promedio; todo lo demás (afín, umbral, mezcla) es idéntico.

   Fotometría CONTROLADA: el mismo objeto `cielo` (pupila de 350 mm) para las
   tres aperturas; la PSF entra por o.apertura, que ps1PintarParche usa aparte.
   Así la única variable entre 200/350/450 es la PSF. (La fotometría real SÍ
   cambia con D; aquí se congela a propósito para aislar el efecto B.)

   REFERENCIA FIJA: ningún array se normaliza por su MAD ni por sí mismo. Todas
   las métricas normalizadas dividen por UNA constante común por dominio
   (media del cuerpo del parche sin PSF / media del lienzo A-350).

   Producción NO se toca: solo se llama a funciones exportadas; la variante de
   datos se inyecta por la caché psfD/psfDatos del objeto parche local, igual
   que harness_m104_nucleo.js.

   Necesita red la primera vez (parches de 512/1024/2048 vía lib_bajar_parche,
   que replica el proxy). Gaia: .scratch/m104-nucleo/gaia_m104.csv (ya bajado).

   Uso:  node scripts/harness_m104_experimento_400x.js */
'use strict';

var fs = require('fs'), path = require('path');
global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;
var PS1 = R.ps1, CFG = R.config, FOT = R.fot;
var P = require('./lib_psf_parche.js')(R);
var B = require('./lib_bajar_parche.js')(R);
require('../simulador_ocular/resources/js/galaxias-datos.js');

var OUT_DIR = path.join(__dirname, '..', '.scratch', 'm104-experimento-400x');
fs.mkdirSync(OUT_DIR, { recursive: true });

function f(v, d) { return (v == null || !isFinite(v)) ? '—' : v.toFixed(d == null ? 3 : d); }
function g(v) {
  if (v == null || !isFinite(v)) return '—';
  var a = Math.abs(v);
  return (a !== 0 && (a < 1e-2 || a >= 1e6)) ? v.toExponential(3) : v.toFixed(4);
}
function fila(c) { console.log(c.join(' | ')); }

/* ── M104 del catálogo ───────────────────────────────────────────────────── */
var CAT = global.window.BITACORA_GALAXIAS, filaCat = null;
for (var i = 0; i < CAT.length; i++) if (CAT[i][0] === 'NGC 4594') filaCat = CAT[i];
if (!filaCat) { console.error('NGC 4594 no está en el catálogo'); process.exit(1); }
var gal = {
  nombre: filaCat[0], ra: filaCat[2], dec: filaCat[3], reArcsec: filaCat[4],
  ba: filaCat[5], pa: filaCat[6], magV: filaCat[7], n: filaCat[8], bt: filaCat[9],
  nMedido: filaCat[11] || 0, ladoArcmin: R.ps1LadoArcmin(filaCat[4])
};

var CSV = path.join(__dirname, '..', '.scratch', 'm104-nucleo', 'gaia_m104.csv');
var estrellas = [];
if (fs.existsSync(CSV)) {
  estrellas = fs.readFileSync(CSV, 'utf8').trim().split('\n').slice(1).map(function (l) {
    var t = l.split(','); return [parseFloat(t[0]), parseFloat(t[1]), parseFloat(t[2])];
  }).filter(function (e) { return isFinite(e[2]); });
}

/* ── Equipos y lienzo ────────────────────────────────────────────────────── */
var MAG = 400, SIZE = 720, AFOV = 70;
var ARCMIN = AFOV * 60 / MAG;                       // 10,5′ de campo real
var ESC_L = ARCMIN * 60 / SIZE;                     // ″/px del lienzo
var EQUIPOS = [{ D: 200, foc: 'f/9' }, { D: 350, foc: 'f/5' }, { D: 450, foc: 'f/4' }];
var FWHM_A_SIGMA = P.FWHM_A_SIGMA;

/* Cielo CONGELADO: uno solo para todas las aperturas (ver cabecera). */
function cieloFijo() {
  return { pupilaSalida: 350 / MAG, aumentos: MAG, sqm: 21, pupilaOjo: 7,
           realceMax: PS1.realceMax };
}

/* ── Utilidades de medida (referencia fija, sin normalización por variante) ── */

/* Perfil radial: anillos de 1″ hasta 40″ (mediana, media, acumulado). */
function perfil(datos, ancho, alto, escalaAs, cx, cy, rMaxAs) {
  var nA = Math.ceil(rMaxAs), anillos = [];
  for (var a = 0; a < nA; a++) anillos.push([]);
  var rMaxPx = rMaxAs / escalaAs;
  var x0 = Math.max(0, Math.floor(cx - rMaxPx)), x1 = Math.min(ancho - 1, Math.ceil(cx + rMaxPx));
  var y0 = Math.max(0, Math.floor(cy - rMaxPx)), y1 = Math.min(alto - 1, Math.ceil(cy + rMaxPx));
  for (var y = y0; y <= y1; y++) {
    for (var x = x0; x <= x1; x++) {
      var rAs = Math.hypot(x - cx, y - cy) * escalaAs;
      if (rAs >= rMaxAs) continue;
      var v = datos[y * ancho + x];
      if (isFinite(v)) anillos[Math.floor(rAs)].push(v);
    }
  }
  var out = [], acum = 0;
  for (a = 0; a < nA; a++) {
    var m = anillos[a].sort(function (u, w) { return u - w; });
    var s = 0; for (var k = 0; k < m.length; k++) s += m[k];
    var media = m.length ? s / m.length : NaN;
    var areaAs2 = Math.PI * (2 * a + 1);
    if (isFinite(media)) acum += media * areaAs2;
    out.push({ r: a + 0.5, n: m.length, med: m.length ? m[m.length >> 1] : NaN,
               media: media, acum: acum });
  }
  return out;
}

/* Mínimo radial local (el «anillo oscuro»). */
function minimoLocal(anillos, rMax) {
  var peor = null;
  for (var a = 1; a < anillos.length - 1 && anillos[a].r < rMax; a++) {
    var v = anillos[a].med, ant = anillos[a - 1].med, sig = anillos[a + 1].med;
    if (!(isFinite(v) && isFinite(ant) && isFinite(sig))) continue;
    if (v < ant && v < sig) {
      var prof = Math.min(ant, sig) - v;
      if (!peor || prof > peor.prof) peor = { r: anillos[a].r, med: v, prof: prof };
    }
  }
  return peor;
}

/* Convolución gaussiana sin restaurar máscara (el kernel de producción; copia
   de harness_m104_nucleo.js). Se usa para las bandas de frecuencia. */
function conv(datos, ancho, alto, sigmaPx) {
  if (!(sigmaPx > 0.01)) { var c0 = new Float32Array(datos.length); c0.set(datos); return c0; }
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

/* Banda de estructura entre dos escalas angulares (diferencia de gaussianas):
   blur(FWHM=a″) − blur(FWHM=b″) conserva lo que vive entre a y b. Es la
   métrica de contenido por escala: no depende de ninguna normalización por
   imagen, solo del denominador común que se le pase. */
function banda(datos, ancho, alto, escalaAs, aAs, bAs) {
  var lo = conv(datos, ancho, alto, aAs / FWHM_A_SIGMA / escalaAs);
  var hi = conv(datos, ancho, alto, bAs / FWHM_A_SIGMA / escalaAs);
  var out = new Float32Array(datos.length);
  for (var i = 0; i < datos.length; i++) out[i] = lo[i] - hi[i];
  return out;
}

/* Estadísticos de una zona circular. `norm` es LA MISMA constante para todas
   las variantes que se comparen entre sí. */
function zona(datos, ancho, alto, escalaAs, cx, cy, rAs) {
  var r = rAs / escalaAs, out = [];
  var x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(ancho - 1, Math.ceil(cx + r));
  var y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(alto - 1, Math.ceil(cy + r));
  for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
    var dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy > r * r) continue;
    out.push(y * ancho + x);
  }
  return out;
}
function rmsEn(datos, idx) {
  var s = 0, n = 0;
  for (var k = 0; k < idx.length; k++) {
    var v = datos[idx[k]];
    if (isFinite(v)) { s += v * v; n++; }
  }
  return n ? Math.sqrt(s / n) : NaN;
}
function mediaEn(datos, idx) {
  var s = 0, n = 0;
  for (var k = 0; k < idx.length; k++) {
    var v = datos[idx[k]];
    if (isFinite(v)) { s += v; n++; }
  }
  return n ? s / n : NaN;
}

/* Métricas por pares dentro de una zona: RMS, |Δ| media, correlación de
   Pearson. Sin normalizar aquí: el llamador divide por su constante común. */
function pares(a, b, idx) {
  var n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, s2 = 0, s1 = 0;
  for (var k = 0; k < idx.length; k++) {
    var va = a[idx[k]], vb = b[idx[k]];
    if (!isFinite(va) || !isFinite(vb)) continue;
    var d = va - vb;
    s2 += d * d; s1 += Math.abs(d);
    sa += va; sb += vb; saa += va * va; sbb += vb * vb; sab += va * vb; n++;
  }
  if (!n) return { rms: NaN, abs: NaN, r: NaN, n: 0 };
  var cov = sab / n - (sa / n) * (sb / n);
  var va2 = saa / n - (sa / n) * (sa / n), vb2 = sbb / n - (sb / n) * (sb / n);
  return { rms: Math.sqrt(s2 / n), abs: s1 / n,
           r: (va2 > 0 && vb2 > 0) ? cov / Math.sqrt(va2 * vb2) : NaN, n: n };
}

/* ── Recortes y PGM (tope tonal FIJO por lámina, log1p común) ────────────── */
function recorte(datos, ancho, alto, cx, cy, ladoPx) {
  var h = ladoPx >> 1, out = new Float32Array(ladoPx * ladoPx);
  for (var y = 0; y < ladoPx; y++) for (var x = 0; x < ladoPx; x++) {
    var px = Math.round(cx) - h + x, py = Math.round(cy) - h + y;
    out[y * ladoPx + x] = (px >= 0 && px < ancho && py >= 0 && py < alto)
      ? datos[py * ancho + px] : NaN;
  }
  return out;
}
function maxFinito(a) {
  var m = 0; for (var i = 0; i < a.length; i++) if (isFinite(a[i]) && a[i] > m) m = a[i];
  return m;
}
/* Lámina: rejilla de recortes IGUALES (mismo lado px, mismo tope, mismo log1p),
   separados por 2 px blancos. filas = [[rec,rec,…],…]. */
function lamina(nombre, filas, ladoPx, tope, lineal) {
  var SEP = 2, nc = filas[0].length, nf = filas.length;
  var W = nc * ladoPx + (nc - 1) * SEP, H = nf * ladoPx + (nf - 1) * SEP;
  var img = new Uint8Array(W * H); img.fill(255);
  var esc = tope > 0 ? 255 / (lineal ? tope : Math.log1p(tope)) : 0;
  for (var fy = 0; fy < nf; fy++) for (var fx = 0; fx < nc; fx++) {
    var rec = filas[fy][fx];
    for (var y = 0; y < ladoPx; y++) for (var x = 0; x < ladoPx; x++) {
      var v = rec[y * ladoPx + x];
      var t = (isFinite(v) && v > 0)
        ? Math.min(255, Math.round((lineal ? v : Math.log1p(v)) * esc)) : 0;
      img[(fy * (ladoPx + SEP) + y) * W + fx * (ladoPx + SEP) + x] = t;
    }
  }
  var lin = ['P2', W + ' ' + H, '255'];
  for (y = 0; y < H; y++) {
    var l = [];
    for (x = 0; x < W; x++) l.push(img[y * W + x]);
    lin.push(l.join(' '));
  }
  fs.writeFileSync(path.join(OUT_DIR, nombre + '.pgm'), lin.join('\n') + '\n');
  console.log('  lámina ' + nombre + '.pgm  (' + nc + '×' + nf + ' recortes de ' +
    ladoPx + ' px, tope común ' + g(tope) + (lineal ? ', lineal' : ', log1p') + ')');
}

/* ── Parche de producción a partir de un FITS bajado ─────────────────────── */
/* El MISMO camino que el simulador: quitar estrellas (Gaia + geo del catálogo,
   con la protección nuclear y las isofotas nuevas), anclar al catálogo, y el
   resto de piezas de la mezcla. */
function construir(F, quitar) {
  var fSim = { ancho: F.ancho, alto: F.alto, escalaAs: F.escalaAs, wcs: F.wcs || null };
  fSim.afin = R.ps1AfinParche(fSim, gal);
  var enPx = R.ps1EstrellasEnPixeles(fSim, gal, estrellas);
  var limpio;
  if (quitar === 'no') limpio = F.datos;
  else if (quitar === 'sinGeo') limpio = R.ps1QuitarEstrellas(F.datos, F.ancho, F.alto, enPx);
  else limpio = R.ps1QuitarEstrellas(F.datos, F.ancho, F.alto, enPx,
    { afin: fSim.afin, ba: gal.ba, pa: gal.pa });
  var Ap = R.ps1AnclarACatalogo(limpio, F.ancho, F.alto, {
    magV: gal.magV, n: gal.n, reArcsec: gal.reArcsec,
    ladoArcmin: F.ladoArcmin, escalaAs: F.escalaAs
  });
  return { Ap: Ap, afin: fSim.afin, enPx: enPx };
}
function parcheDe(F, C) {
  var comps = R.ps1ComponentesSersic(gal);
  var peso = R.ps1PesoImagen(C.Ap, F.ancho, F.alto, F.escalaAs);
  var perfilP = R.ps1PerfilEnParche(comps, gal.pa, F.ancho, F.alto, C.afin);
  return {
    ra: gal.ra, dec: gal.dec, ladoArcmin: F.ladoArcmin,
    ancho: F.ancho, alto: F.alto, afin: C.afin,
    comps: comps, pa: gal.pa, halo: R.ps1MedidasHalo(gal, comps),
    peso: peso, escalaMezcla: R.ps1EscalaMezcla(C.Ap, peso, perfilP),
    datos: C.Ap
  };
}

/* ── Pintado: producción / bilineal / supermuestreo 4×4 ──────────────────── */
/* 'prox' llama a ps1PintarParche DE PRODUCCIÓN (con la variante de datos
   inyectada por la caché psfD/psfDatos). 'bilineal' y 'super4' duplican aquí el
   mismo bucle cambiando SOLO la lectura del parche (copia del de
   harness_m104_nucleo.js, marcada EXPERIMENTO). */
function pintarVariante(parche, datos, o, modo) {
  var difuso = new Float32Array(SIZE * SIZE);
  if (modo === 'prox') {
    parche.psfD = o.apertura; parche.psfDatos = datos;
    R.ps1PintarParche(difuso, parche, o);
    return difuso;
  }
  var escv = SIZE / (o.arcmin / 60);
  var cos0 = Math.cos(o.dec0 * Math.PI / 180);
  var dra = (((parche.ra - o.ra0 + 540) % 360) - 180) * cos0;
  var cx = SIZE / 2 - dra * escv, cy = SIZE / 2 - (parche.dec - o.dec0) * escv;
  var a = parche.afin;
  var c = R.ctxFotometrico(o.cielo);
  var umbral = R.sbUmbralContraste(c);
  var pxPorAs = escv / 3600;
  var halo = R.ps1HaloActivo(parche.halo);
  var comps = halo ? (parche.comps || []) : [], pa = parche.pa || 0;
  var peso = halo ? (parche.peso || null) : null;
  var sMezcla = peso ? parche.escalaMezcla : 1;
  var ladoPx = (parche.ladoArcmin / 60) * escv;
  var alcance = Math.max(ladoPx / 2, R.ps1RadioHaloAs(comps) * pxPorAs);
  if (!(o.cielo.galaxiaMask && o.cielo.galaxiaMask.length === difuso.length)) {
    o.cielo.galaxiaMask = new Uint8Array(difuso.length);
  }
  var mask = o.cielo.galaxiaMask;
  var SUB = (modo === 'super4') ? 4 : 1;
  var x0 = Math.max(0, Math.floor(cx - alcance)), x1 = Math.min(SIZE - 1, Math.ceil(cx + alcance));
  var y0 = Math.max(0, Math.floor(cy - alcance)), y1 = Math.min(SIZE - 1, Math.ceil(cy + alcance));
  for (var y = y0; y <= y1; y++) {
    for (var x = x0; x <= x1; x++) {
      var acc = 0, nsub = 0, pintado = false;
      for (var sy = 0; sy < SUB; sy++) for (var sx = 0; sx < SUB; sx++) {
        var yy = y + (SUB > 1 ? (sy + 0.5) / SUB - 0.5 : 0);
        var xx = x + (SUB > 1 ? (sx + 0.5) / SUB - 0.5 : 0);
        var norte = -(yy - cy) / pxPorAs, este = -(xx - cx) / pxPorAs;
        var fx = a.cx + a.xe * este + a.xn * norte;
        var fy = a.cy + a.ye * este + a.yn * norte;
        var fv = 0, k = -1;
        if (modo === 'bilineal') {
          var ix = Math.floor(fx), iy = Math.floor(fy);
          if (iy >= 0 && iy < parche.alto - 1 && ix >= 0 && ix < parche.ancho - 1) {
            var tx = fx - ix, ty = fy - iy, accb = 0, wb = 0;
            for (var j = 0; j < 2; j++) for (var i2 = 0; i2 < 2; i2++) {
              var vv = datos[(iy + j) * parche.ancho + ix + i2];
              var pe = (i2 ? tx : 1 - tx) * (j ? ty : 1 - ty);
              if (isFinite(vv)) { accb += pe * vv; wb += pe; }
            }
            fv = wb > 0 ? accb / wb : 0;
            k = Math.round(fy) * parche.ancho + Math.round(fx);
          }
        } else {                                     // super4: vecino más próximo
          var px = Math.round(fx), py = Math.round(fy);
          if (py >= 0 && py < parche.alto && px >= 0 && px < parche.ancho) {
            k = py * parche.ancho + px;
            fv = datos[k];
          }
        }
        if (comps.length) {
          var fm = R.ps1FlujoModelo(comps, pa, norte, este);
          var w = (peso && k >= 0) ? peso[k] : 0;
          fv = w * sMezcla * fv + (1 - w) * fm;
        }
        if (!(fv > 0)) { nsub++; continue; }
        fv = R.ps1FlujoConOpacidad(fv, R.ps1Opacidad(-2.5 * Math.log10(fv), umbral), c);
        if (fv > 0) { acc += fv; pintado = true; }
        nsub++;
      }
      if (!pintado || !nsub) continue;
      difuso[y * SIZE + x] += acc / nsub;
      mask[y * SIZE + x] = 1;
    }
  }
  return difuso;
}

/* Etapa de pantalla (0–255): la aritmética de pintarFot sin canvas, copiada de
   harness_m104_nucleo.js (adaptación local emulada con gaussiana σ=SIZE/60). */
function etapaE(difuso, mask, c) {
  var n = difuso.length, niveles = new Float32Array(n);
  for (var i = 0; i < n; i++) {
    var esGal = !!(mask && mask[i]);
    var s = esGal ? 1 : (function (Fv) {
      if (!(Fv > 0)) return 0;
      var x = (Math.log10(Fv / (c.Fcielo * c.Cmin)) + FOT.UMBRAL_MARGEN) / FOT.UMBRAL_ANCHURA;
      x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x);
    })(difuso[i]);
    var d = difuso[i] * s;
    if (d > 0) d = R.realzarPerceptual(d, c.Fcielo, c.rango, esGal ? 0 : s, PS1.realceMax);
    niveles[i] = c.nivelFondo + R.valorDeFlujo(d, c.Fcielo, c.rango);
  }
  var borroso = conv(niveles, SIZE, SIZE, Math.round(SIZE / 60));
  var out = new Float32Array(n);
  var REALCE = 0.5, UMBRAL = 12;
  for (i = 0; i < n; i++) {
    var dif = niveles[i] - borroso[i];
    var abs = Math.abs(dif), sobre = abs - UMBRAL, gg = 0;
    if (sobre > 0) {
      var t = Math.max(0, Math.min(1, sobre / UMBRAL));
      gg = (dif >= 0 ? REALCE : REALCE * FOT.REALCE_OSCURO) * Math.sign(dif) * sobre * t * t * (3 - 2 * t);
    }
    out[i] = Math.max(0, Math.min(255, niveles[i] + gg));
  }
  return out;
}

/* ═════════════════════════ CUERPO DEL EXPERIMENTO ════════════════════════ */
var SALIDAS = [512, 1024, 2048];                    // adquisición; 1024 = producción
var parchesRes = {};

var cadena = Promise.resolve();
SALIDAS.forEach(function (s) {
  cadena = cadena.then(function () {
    return B.bajar(gal.ra, gal.dec, gal.ladoArcmin, s).then(function (F) {
      parchesRes[s] = F;
      console.log('  parche ' + s + ' px: ' + F.ancho + '×' + F.alto + ', ' +
        f(F.escalaAs, 3) + '″/px, lado ' + f(F.ladoArcmin, 2) + '′');
    }).catch(function (e) { console.log('  ⚠ parche ' + s + ' px no disponible: ' + e.message); });
  });
});
cadena.then(function () {
  if (!parchesRes[1024]) { console.error('sin parche de producción (1024): aborto'); process.exit(1); }
  cuerpo();
});

function cuerpo() {
var F = parchesRes[1024];
var nuc = [(F.ancho - 1) / 2, (F.alto - 1) / 2];    // bajar() recorta centrado
var C0 = construir(F, 'prod');                       // producción actual
var Ap = C0.Ap;
console.log('\n═══ M104 (NGC 4594) · re=' + gal.reArcsec + '″ · b/a=' + gal.ba +
  ' · PA=' + gal.pa + ' · magV=' + gal.magV + ' · Gaia: ' + estrellas.length + ' fuentes ═══');

/* ═══ 1. Telescopios: la PSF usa D y solo D ═══════════════════════════════ */
console.log('\n═══ 1. Telescopios a ' + MAG + 'x (lienzo ' + SIZE + ' px, campo ' +
  f(ARCMIN, 1) + '′, ' + f(ESC_L, 3) + '″/px de lienzo) ═══');
console.log('  θ_parche(1024) = √(seeing PS1² + caja²) = √(' + PS1.seeingAs + '² + ' +
  f(F.escalaAs * P.CAJA_A_FWHM, 3) + '²) = ' + f(P.thetaParche(F.escalaAs), 3) + '″ FWHM');
fila(['  equipo', 'θ_res (″)', 'θ_parche (″)', 'θ_add (″)', 'σ (px parche)', 'FWHM efectiva (″)']);
EQUIPOS.forEach(function (e) {
  var tr = P.thetaRes(e.D), tp = P.thetaParche(F.escalaAs), ta = R.ps1ThetaAdd(e.D, F.escalaAs);
  // FWHM efectiva de la imagen resultante: parche ⊕ añadido (= θ_res si ta>0)
  var fe = Math.sqrt(tp * tp + ta * ta);
  fila(['  ' + e.D + ' mm ' + e.foc, f(tr, 3), f(tp, 3), f(ta, 3),
        f(ta / FWHM_A_SIGMA / F.escalaAs, 3), f(fe, 3)]);
});
console.log('  · convenciones de test_psf_produccion.js: θ_res = 2·radioImagenEstelar,');
console.log('    θ_add = √(θ_res² − θ_parche²), σ = θ_add / 2,3548 / escalaAs.');
// La apertura es EXACTA y no depende de MAG (misma comprobación que el test 11).
var okD = true;
EQUIPOS.forEach(function (e) {
  [50, 150, 400].forEach(function (m) {
    var pup = e.D / m;
    if (Math.abs(pup * m - e.D) > 1e-9) okD = false;
    if (Math.abs(R.ps1ThetaAdd(pup * m, F.escalaAs) - R.ps1ThetaAdd(e.D, F.escalaAs)) > 1e-12) okD = false;
  });
});
console.log('  · apertura exacta 200,000/350,000/450,000 mm; θ_add invariante con MAG: ' +
  (okD ? 'OK' : '✗ FALLA'));

/* ═══ 4+5 primero: información espacial EN EL PARCHE (antes del lienzo) ═══ */
console.log('\n═══ 4. Información espacial en el parche (sin lienzo de por medio) ═══');
var cuerpoIdx = zona(Ap, F.ancho, F.alto, F.escalaAs, nuc[0], nuc[1], 40);
var NORM_P = mediaEn(Ap, cuerpoIdx);                 // constante común del dominio parche
console.log('  denominador común (media del cuerpo r<40″, parche sin PSF): ' + g(NORM_P));

var psfP = { 0: Ap };                                // 0 = sin PSF
EQUIPOS.forEach(function (e) { psfP[e.D] = R.ps1PsfParche(Ap, F.ancho, F.alto, F.escalaAs, e.D); });

var BANDAS = [[1, 5], [5, 10], [10, 30]];
console.log('\n  Energía por banda (RMS de la banda / denominador común), r<40″:');
fila(['  variante', '1–5″', '5–10″', '10–30″']);
var energia = {};
[0, 200, 350, 450].forEach(function (D) {
  var e = BANDAS.map(function (bd) {
    var im = banda(psfP[D], F.ancho, F.alto, F.escalaAs, bd[0], bd[1]);
    return rmsEn(im, cuerpoIdx) / NORM_P;
  });
  energia[D] = e;
  fila(['  ' + (D ? D + ' mm' : 'sin PSF'), f(e[0], 4), f(e[1], 4), f(e[2], 4)]);
});
console.log('  Supervivencia respecto a sin PSF (1 = intacta, 0 = borrada):');
fila(['  variante', '1–5″', '5–10″', '10–30″']);
[200, 350, 450].forEach(function (D) {
  fila(['  ' + D + ' mm'].concat(energia[D].map(function (v, i) {
    return f(v / energia[0][i], 3);
  })));
});
console.log('  MTF analítica de θ_add (amplitud que sobrevive a un periodo dado):');
fila(['  equipo', 'P=2″', 'P=5″', 'P=10″', 'P=30″']);
EQUIPOS.forEach(function (e) {
  var ta = R.ps1ThetaAdd(e.D, F.escalaAs);
  fila(['  ' + e.D + ' mm'].concat([2, 5, 10, 30].map(function (per) { return f(P.mtf(ta, per), 3); })));
});

console.log('\n  Diferencias por pares EN EL PARCHE (RMS/denominador común, r<40″):');
fila(['  par', 'total', 'banda 1–5″', 'banda 5–10″', 'banda 10–30″']);
var PARES = [[200, 350], [350, 450], [200, 450]];
PARES.forEach(function (pr) {
  var t = pares(psfP[pr[0]], psfP[pr[1]], cuerpoIdx);
  var bs = BANDAS.map(function (bd) {
    var ba = banda(psfP[pr[0]], F.ancho, F.alto, F.escalaAs, bd[0], bd[1]);
    var bb = banda(psfP[pr[1]], F.ancho, F.alto, F.escalaAs, bd[0], bd[1]);
    return pares(ba, bb, cuerpoIdx).rms / NORM_P;
  });
  fila(['  ' + pr[0] + '↔' + pr[1], f(t.rms / NORM_P, 4), f(bs[0], 4), f(bs[1], 4), f(bs[2], 4)]);
});

/* ═══ 5. Límite de PS1: 512 / 1024 / 2048 ═════════════════════════════════ */
console.log('\n═══ 5. ¿La adquisición limita? 512 vs 1024 vs 2048 ═══');
console.log('  (misma zona angular r<40″, mismo denominador físico: media del cuerpo');
console.log('   sin PSF de CADA rejilla — mismas unidades DN ancladas, comparable)');
fila(['  salida', '″/px', 'θ_parche (″)', 'θ_add 200 (″)', 'θ_add 450 (″)',
      'Δ(200↔450) total', 'Δ 1–5″', 'Δ 5–10″']);
var porRes = {};
SALIDAS.forEach(function (s) {
  var Fs = parchesRes[s];
  if (!Fs) return;
  var Cs = construir(Fs, 'prod');
  var nucS = [(Fs.ancho - 1) / 2, (Fs.alto - 1) / 2];
  var idxS = zona(Cs.Ap, Fs.ancho, Fs.alto, Fs.escalaAs, nucS[0], nucS[1], 40);
  var normS = mediaEn(Cs.Ap, idxS);
  var p200 = R.ps1PsfParche(Cs.Ap, Fs.ancho, Fs.alto, Fs.escalaAs, 200);
  var p450 = R.ps1PsfParche(Cs.Ap, Fs.ancho, Fs.alto, Fs.escalaAs, 450);
  var t = pares(p200, p450, idxS);
  var b15 = pares(banda(p200, Fs.ancho, Fs.alto, Fs.escalaAs, 1, 5),
                  banda(p450, Fs.ancho, Fs.alto, Fs.escalaAs, 1, 5), idxS);
  var b510 = pares(banda(p200, Fs.ancho, Fs.alto, Fs.escalaAs, 5, 10),
                   banda(p450, Fs.ancho, Fs.alto, Fs.escalaAs, 5, 10), idxS);
  porRes[s] = { F: Fs, C: Cs, nuc: nucS, idx: idxS, norm: normS, p200: p200, p450: p450 };
  fila(['  ' + s, f(Fs.escalaAs, 3), f(P.thetaParche(Fs.escalaAs), 3),
        f(R.ps1ThetaAdd(200, Fs.escalaAs), 3), f(R.ps1ThetaAdd(450, Fs.escalaAs), 3),
        f(t.rms / normS, 4), f(b15.rms / normS, 4), f(b510.rms / normS, 4)]);
});
if (porRes[2048]) {
  /* ¿2048 aporta información que 1024 no tiene, DESPUÉS de la PSF? Se baja 2048
     con PSF de 450 a la rejilla de 1024 (promedio 2×2, la reducción correcta) y
     se compara con el 1024+PSF de 450. Si son casi iguales, 1024 no limita. */
  var Q = porRes[2048], an2 = Q.F.ancho;
  function reducir2(datos) {
    var an = an2 >> 1, out = new Float32Array(an * an);
    for (var y = 0; y < an; y++) for (var x = 0; x < an; x++) {
      var s = 0, n = 0;
      for (var j = 0; j < 2; j++) for (var i2 = 0; i2 < 2; i2++) {
        var v = datos[(2 * y + j) * an2 + 2 * x + i2];
        if (isFinite(v)) { s += v; n++; }
      }
      out[y * an + x] = n ? s / n : NaN;
    }
    return out;
  }
  [200, 450].forEach(function (D) {
    var alta = reducir2(D === 200 ? Q.p200 : Q.p450);
    var baja = porRes[1024]['p' + D];
    var t = pares(alta, baja, cuerpoIdx);
    console.log('  2048+PSF ' + D + ' reducido a 1024 vs 1024+PSF ' + D + ': RMS/norm = ' +
      f(t.rms / NORM_P, 4) + ' · corr = ' + f(t.r, 5));
  });
  var tAlta = pares(reducir2(Q.p200), reducir2(Q.p450), cuerpoIdx);
  console.log('  Δ(200↔450) medida en la adquisición de 2048 (reducida a 1024): ' +
    f(tAlta.rms / NORM_P, 4) + '  — comparar con la fila de 1024 de arriba');
}

/* ═══ 2+3+6. Cadenas A/B/C/D en el lienzo, métricas por pares ═════════════ */
console.log('\n═══ 2–3. Cadenas al lienzo a ' + MAG + 'x (cielo CONGELADO: pupila 350/' + MAG + ') ═══');
var cadenas = {};                                    // cadenas[variante][D] = {difuso, E}
var MODOS = [
  { id: 'A', modo: 'prox',     desc: 'producción (vecino más próximo)' },
  { id: 'B', modo: 'bilineal', desc: 'bilineal (EXPERIMENTO)' },
  { id: 'C', modo: 'super4',   desc: 'supermuestreo 4×4 (control ideal)' }
];
MODOS.forEach(function (m) { cadenas[m.id] = {}; });
cadenas.D = {};
EQUIPOS.forEach(function (e) {
  MODOS.forEach(function (m) {
    var parche = parcheDe(F, C0);
    var cielo = cieloFijo();
    var o = { ra0: gal.ra, dec0: gal.dec, arcmin: ARCMIN, size: SIZE, cielo: cielo, apertura: e.D };
    var datosPsf = psfP[e.D];
    var difuso = pintarVariante(parche, datosPsf, o, m.modo);
    cadenas[m.id][e.D] = { difuso: difuso, E: etapaE(difuso, cielo.galaxiaMask, R.ctxFotometrico(cielo)) };
  });
});
// D: sin PSF de telescopio (techo de PS1), pintado como producción
(function () {
  var parche = parcheDe(F, C0);
  var cielo = cieloFijo();
  var o = { ra0: gal.ra, dec0: gal.dec, arcmin: ARCMIN, size: SIZE, cielo: cielo, apertura: 350 };
  var difuso = pintarVariante(parche, Ap, o, 'prox');   // datos SIN convolucionar
  cadenas.D[0] = { difuso: difuso, E: etapaE(difuso, cielo.galaxiaMask, R.ctxFotometrico(cielo)) };
})();

var cxL = SIZE / 2, cyL = SIZE / 2;
var idxL = zona(cadenas.A[350].difuso, SIZE, SIZE, ESC_L, cxL, cyL, 40);
var NORM_L = mediaEn(cadenas.A[350].difuso, idxL);   // constante común del dominio lienzo
console.log('  denominador común del lienzo (media r<40″ de A·350): ' + g(NORM_L));

console.log('\n  Métricas por pares de aperturas (difuso, r<40″, mismo cielo):');
fila(['  cadena', 'par', 'RMS/norm', '|Δ|/norm', 'corr', 'Δnúcleo 0–5″', 'Δbulbo 5–20″', 'Δ alta frec (1–5″)']);
['A', 'B'].forEach(function (vid) {
  PARES.forEach(function (pr) {
    var a = cadenas[vid][pr[0]].difuso, b = cadenas[vid][pr[1]].difuso;
    var t = pares(a, b, idxL);
    var pa5 = perfil(a, SIZE, SIZE, ESC_L, cxL, cyL, 20), pb5 = perfil(b, SIZE, SIZE, ESC_L, cxL, cyL, 20);
    var dn = 0, nb = 0, db = 0, nn = 0;
    for (var k = 0; k < 20; k++) {
      var d = Math.abs(pa5[k].med - pb5[k].med);
      if (!isFinite(d)) continue;
      if (k < 5) { dn += d; nn++; } else { db += d; nb++; }
    }
    var bA = banda(a, SIZE, SIZE, ESC_L, 1, 5), bB = banda(b, SIZE, SIZE, ESC_L, 1, 5);
    var hf = pares(bA, bB, idxL);
    fila(['  ' + vid, pr[0] + '↔' + pr[1], f(t.rms / NORM_L, 4), f(t.abs / NORM_L, 4),
          f(t.r, 5), f(dn / (nn || 1) / NORM_L, 4), f(db / (nb || 1) / NORM_L, 4),
          f(hf.rms / NORM_L, 4)]);
  });
});

console.log('\n  Contraste local (RMS del residuo a 3 px de lienzo / norm) y perfil del núcleo:');
fila(['  cadena·D', 'contraste local', 'mediana 0–1″', 'mediana 2–3″', 'mediana 5–6″']);
['A', 'B', 'C'].forEach(function (vid) {
  EQUIPOS.forEach(function (e) {
    var d = cadenas[vid][e.D].difuso;
    var res = new Float32Array(d.length), sm = conv(d, SIZE, SIZE, 3);
    for (var i = 0; i < d.length; i++) res[i] = d[i] - sm[i];
    var pf = perfil(d, SIZE, SIZE, ESC_L, cxL, cyL, 8);
    fila(['  ' + vid + '·' + e.D, f(rmsEn(res, idxL) / NORM_L, 4),
          g(pf[0].med / NORM_L), g(pf[2].med / NORM_L), g(pf[5].med / NORM_L)]);
  });
});
(function () {
  var d = cadenas.D[0].difuso;
  var res = new Float32Array(d.length), sm = conv(d, SIZE, SIZE, 3);
  for (var i = 0; i < d.length; i++) res[i] = d[i] - sm[i];
  var pf = perfil(d, SIZE, SIZE, ESC_L, cxL, cyL, 8);
  fila(['  D·sinPSF', f(rmsEn(res, idxL) / NORM_L, 4),
        g(pf[0].med / NORM_L), g(pf[2].med / NORM_L), g(pf[5].med / NORM_L)]);
})();

/* ═══ 6. Bilineal: qué cambia y qué no ════════════════════════════════════ */
console.log('\n═══ 6. Bilineal vs producción (misma apertura, mismo todo) ═══');
fila(['  D', 'RMS(A−B)/norm', 'escalón A', 'escalón B', 'alta frec A', 'alta frec B',
      'RMS(A−C)/norm', 'RMS(B−C)/norm']);
function escalon(d) {
  // RMS de la segunda diferencia (harness_remuestreo_parche.js): mide escalones.
  var s2 = 0, n = 0;
  for (var k = 0; k < idxL.length; k++) {
    var i = idxL[k], x = i % SIZE;
    if (x < 1 || x >= SIZE - 1) continue;
    var a = d[i - 1], b = d[i], c = d[i + 1];
    if (!isFinite(a) || !isFinite(b) || !isFinite(c)) continue;
    var d2 = a - 2 * b + c; s2 += d2 * d2; n++;
  }
  return n ? Math.sqrt(s2 / n) / NORM_L : NaN;
}
EQUIPOS.forEach(function (e) {
  var A = cadenas.A[e.D].difuso, Bv = cadenas.B[e.D].difuso, Cv = cadenas.C[e.D].difuso;
  var hfA = rmsEn(banda(A, SIZE, SIZE, ESC_L, 1, 5), idxL) / NORM_L;
  var hfB = rmsEn(banda(Bv, SIZE, SIZE, ESC_L, 1, 5), idxL) / NORM_L;
  fila(['  ' + e.D, f(pares(A, Bv, idxL).rms / NORM_L, 4), f(escalon(A), 4), f(escalon(Bv), 4),
        f(hfA, 4), f(hfB, 4),
        f(pares(A, Cv, idxL).rms / NORM_L, 4), f(pares(Bv, Cv, idxL).rms / NORM_L, 4)]);
});
console.log('  (escalón = RMS de la 2ª diferencia horizontal / norm; C = control ideal:');
console.log('   la cadena más cercana a C es la que mejor reconstruye la misma información)');

/* ═══ 7. Núcleo: ps1QuitarEstrellas no fabrica el anillo ══════════════════ */
console.log('\n═══ 7. Núcleo 0–20″: producción / sin quitar / sin protección nuclear ═══');
var variantesQ = [
  { id: 'prod',   desc: 'producción actual (Gaia + protección nuclear + isofotas)', C: C0 },
  { id: 'sinQ',   desc: 'sin quitar estrellas (referencia)', C: construir(F, 'no') },
  { id: 'sinGeo', desc: 'quitar SIN geometría (sin protección nuclear)', C: construir(F, 'sinGeo') }
];
var ref20 = null;
variantesQ.forEach(function (v) {
  var pf = perfil(v.C.Ap, F.ancho, F.alto, F.escalaAs, nuc[0], nuc[1], 20);
  var minL = minimoLocal(pf, 15);
  var salto = 0;
  for (var k = 2; k < 10; k++) {
    var d = Math.abs(pf[k].med - pf[k - 1].med);
    if (isFinite(d) && d > salto) salto = d;
  }
  var flujo20 = pf[19].acum;
  if (v.id === 'sinQ') ref20 = { pf: pf, flujo: flujo20 };
  console.log('\n  ' + v.desc + ':');
  fila(['    r (″)', '0–1', '1–2', '2–3', '4–5', '9–10', '19–20']);
  fila(['    mediana'].concat([0, 1, 2, 4, 9, 19].map(function (k) { return g(pf[k].med); })));
  console.log('    mínimo radial local r<15″: ' + (minL
    ? 'SÍ en r≈' + f(minL.r, 1) + '″ (prof ' + g(minL.prof) + ')' : 'no'));
  console.log('    mayor salto anillo a anillo en 2–10″: ' + g(salto));
  console.log('    flujo integrado 0–20″: ' + g(flujo20) +
    (ref20 && v.id !== 'sinQ' ? '  (' + f(100 * (flujo20 / ref20.flujo - 1), 2) + ' % vs sin quitar)' : ''));
  if (ref20 && v.id !== 'sinQ') {
    var d01 = ref20.pf[0].med - pf[0].med, d12 = ref20.pf[1].med - pf[1].med;
    console.log('    déficit 0–1″: ' + g(d01) + ' · 1–2″: ' + g(d12) + ' (vs sin quitar)');
  }
});
// ¿La diferencia entre telescopios depende de la variante de quitado?
console.log('\n  Δ(200↔450) en el parche según variante de quitado (RMS/norm r<40″):');
variantesQ.forEach(function (v) {
  var q200 = R.ps1PsfParche(v.C.Ap, F.ancho, F.alto, F.escalaAs, 200);
  var q450 = R.ps1PsfParche(v.C.Ap, F.ancho, F.alto, F.escalaAs, 450);
  var normV = mediaEn(v.C.Ap, cuerpoIdx);
  console.log('    ' + v.id + ': ' + f(pares(q200, q450, cuerpoIdx).rms / normV, 4));
});

/* ═══ 8. Láminas ══════════════════════════════════════════════════════════ */
console.log('\n═══ 8. Láminas (mismo recorte angular, mismo tope, misma log1p) ═══');
var LADO_AS = 140;                                   // recorte angular común
// Lámina 1: lienzo, filas = sin bilineal / bilineal, columnas = 200/350/450.
var ladoL = Math.round(LADO_AS / ESC_L);
var filas1 = [[], []];
EQUIPOS.forEach(function (e) {
  filas1[0].push(recorte(cadenas.A[e.D].difuso, SIZE, SIZE, cxL, cyL, ladoL));
  filas1[1].push(recorte(cadenas.B[e.D].difuso, SIZE, SIZE, cxL, cyL, ladoL));
});
var tope1 = 0;
filas1.forEach(function (fl) { fl.forEach(function (r) { tope1 = Math.max(tope1, maxFinito(r)); }); });
lamina('lamina1_bilineal_difuso', filas1, ladoL, tope1);
// La misma en niveles de pantalla (0–255, lineal, tope 255 común).
var filas1E = [[], []];
EQUIPOS.forEach(function (e) {
  filas1E[0].push(recorte(cadenas.A[e.D].E, SIZE, SIZE, cxL, cyL, ladoL));
  filas1E[1].push(recorte(cadenas.B[e.D].E, SIZE, SIZE, cxL, cyL, ladoL));
});
lamina('lamina1_bilineal_pantalla', filas1E, ladoL, 255, true);
// Lámina 2: parche 1024, columnas = sin PSF / 200 / 350 / 450.
var ladoP = Math.round(LADO_AS / F.escalaAs);
var filas2 = [[0, 200, 350, 450].map(function (D) {
  return recorte(psfP[D], F.ancho, F.alto, nuc[0], nuc[1], ladoP);
})];
var tope2 = 0;
filas2[0].forEach(function (r) { tope2 = Math.max(tope2, maxFinito(r)); });
lamina('lamina2_psf_parche', filas2, ladoP, tope2);
// Lámina 3: adquisición 512/1024/2048 con PSF 200 y 450 (reescalado por vecino
// a la rejilla de 1024, SOLO para verlas juntas; las métricas van arriba).
if (porRes[512] && porRes[2048]) {
  var filas3 = [[], []];
  SALIDAS.forEach(function (s) {
    var Rres = porRes[s];
    ['p200', 'p450'].forEach(function (cual, fi) {
      var Fs = Rres.F, lp = Math.round(LADO_AS / Fs.escalaAs);
      var rec = recorte(Rres[cual], Fs.ancho, Fs.alto, Rres.nuc[0], Rres.nuc[1], lp);
      var out = new Float32Array(ladoP * ladoP);     // reescala a la rejilla de 1024
      for (var y = 0; y < ladoP; y++) for (var x = 0; x < ladoP; x++) {
        out[y * ladoP + x] = rec[Math.min(lp - 1, Math.round(y * lp / ladoP)) * lp +
                                 Math.min(lp - 1, Math.round(x * lp / ladoP))];
      }
      filas3[fi].push(out);
    });
  });
  var tope3 = 0;
  filas3.forEach(function (fl) { fl.forEach(function (r) { tope3 = Math.max(tope3, maxFinito(r)); }); });
  lamina('lamina3_resolucion', filas3, ladoP, tope3);
}
// Lámina 4: núcleo 0–40″ de las tres variantes de quitado (parche, tope común).
var lado4 = Math.round(80 / F.escalaAs);
var filas4 = [variantesQ.map(function (v) {
  return recorte(v.C.Ap, F.ancho, F.alto, nuc[0], nuc[1], lado4);
})];
var tope4 = 0;
filas4[0].forEach(function (r) { tope4 = Math.max(tope4, maxFinito(r)); });
lamina('lamina4_nucleo_quitado', filas4, lado4, tope4);
console.log('  directorio: ' + OUT_DIR);

console.log('\n═══ Comprobación: producción intacta ═══');
console.log('  · solo funciones exportadas; variantes por la caché psfD/psfDatos local;');
console.log('  · bilineal y super4 duplicados AQUÍ, marcados EXPERIMENTO;');
console.log('  · PS1.salida=' + PS1.salida + ', seeingAs=' + PS1.seeingAs +
  ', airyArcsec=' + CFG.airyArcsec + ', seeingArcsec=' + CFG.seeingArcsec + ' — sin tocar.');
}
