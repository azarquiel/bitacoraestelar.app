#!/usr/bin/env node
/* FASE 4 — Auditoría del déficit de señal débil extensa en la cadena
   anclaje → PSF → bilineal → mezcla → nivel (hipótesis H-F1..H-F4).

   SOLO diagnóstico: no toca producción. Réplica instrumentada del bucle
   VIGENTE de ps1PintarParche (bilineal + soporte local, opacidadInternaEscena
   y confianzaLocalNaN apagadas), con paridad bit a bit contra
   window.BitacoraPS1.ps1PintarParche y SHA-1 de fotometría contra el baseline de Fase 3.

   LOCALIZACIONES (Tarea 0.2, verificadas en resources/js/bitacora-gaia-render.js):
     · cielo del anclaje: ps1Cielo (mediana del MARCO del parche, grosor 6 % del
       lado menor, DN del stack) + ps1SigmaCielo (MAD·1,4826 del mismo marco).
       GLOBAL por parche, no local. El anclaje NO resta ese cielo: resta
       suelo = cielo + PS1.kRuido·σ (kRuido = 1,5) y recorta a 0
       (ps1AnclarACatalogo, línea 2287/2300). Corte a NaN en cielo − kAusencia·σ.
     · s = parche.escalaMezcla = ps1EscalaMezcla(anc, peso, perfil): ESCALAR por
       parche, calibrado sobre TODOS los píxeles finitos del parche
       (s = (Σv − Σ(1−w)·perfil) / Σ(w·v)); se aplica en ps1PintarParche como
       wv·s·fv + (1−wv)·fm por vecino bilineal (línea 2650).
     · cero del mapeo: pintarFot pinta nivelFondo + valorDeFlujo(F, Fcielo, rango)
       con F = flujo NETO sobre cielo (por arcsec²). El cero del mapeo es el
       cielo del SQM (Fcielo); el cero del parche anclado es suelo = cielo+1,5σ.
       El δ de la rampa (deltaPlena) se mide contra sbUmbralContraste(c) =
       −2,5·log10(Fcielo·Cmin), misma referencia Fcielo. No hay resta doble;
       hay un OFFSET de cero parche↔mapeo de 1,5σ·kanc (se cuantifica aquí).

   UMBRALES A PRIORI (nada exploratorio entra en el veredicto):
     · cierre aritmético por píxel: |Δtotal − Σetapas| ≤ 1e−3 mag (etapas Float32);
     · firma ADITIVA: |pendiente| < 0,1 y intercepto > 0;
       MULTIPLICATIVA: pendiente ∈ (0,1) y |intercepto| < 20 % del déficit mediano;
       si no, MIXTA (se reporta descomposición);
     · test de ceros: |nivel pipeline − nivel modelo| ≤ 0,01 niveles de pantalla;
     · H-F4: frontera huecos a 3·FWHM_add del NaN más próximo (px de parche).

   Uso (un comando por (objeto, experimento); determinista, parche cacheado):
     node scripts/harness_deficit_mezcla.js --obj M51            # auditoría (Tarea 1)
     node scripts/harness_deficit_mezcla.js --ceros              # test de ceros (T1.4)
     node scripts/harness_deficit_mezcla.js --obj M51 --cf s1    # contrafactuales (T2)
       --cf: s1 | sdebil | cielo | suelo | psf   (apagados por defecto)
   Salidas: .scratch/deficit/<obj>/ */
'use strict';

var fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
var RAIZ = path.join(__dirname, '..');

global.window = {};
require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-ps1.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js'));
var R = global.window.BitacoraGaiaRender;
var CAT = global.window.BITACORA_GALAXIAS;
var FOT = R.fot, PS1 = window.BitacoraPS1.cfg;
var B = require('./lib_bajar_parche.js')(R);

function arg(nombre, defecto) {
  var i = process.argv.indexOf('--' + nombre);
  return (i >= 0 && process.argv[i + 1] != null) ? process.argv[i + 1] : defecto;
}
var OBJ = String(arg('obj', 'M51'));
var CF = arg('cf', null);                    // null | s1 | sdebil | cielo | suelo | psf
var MODO_CEROS = process.argv.indexOf('--ceros') >= 0;
var CFG = {
  D: parseFloat(arg('D', '457.2')), M: parseFloat(arg('M', '190')),
  sqm: parseFloat(arg('sqm', '21.2')), delta: parseInt(arg('delta', '2'), 10),
  SIZE: 720, AFOV: 70
};
var OBJS = {
  M51:  { cat: 'NGC 5194', csv: 'gaia_ngc5194.csv' },
  M81:  { cat: 'NGC 3031', csv: 'gaia_ngc3031.csv' },
  M104: { cat: 'NGC 4594', csv: 'gaia_ngc4594.csv' },
  M101: { cat: 'NGC 5457', csv: 'gaia_ngc5457.csv' },
  NGC205: { cat: 'NGC 205', csv: 'gaia_ngc205.csv' }
};
/* SHA-1 de la fotometría pre-mapeo (fPre) del baseline de Fase 3, rama de
   partida fase3-pertenencia-estructura (simulador_ocular/docs/experimentos/ricco/pertenencia/datos/*_s25). */
var SHA_FASE3 = {
  M51: '7bdeab598616e1f7d70986ec3cb5b34bc5aa9183',
  M81: '86b664ffc38eae265b9f6e5316e9b61415f0c60a',
  M104: 'f3c0e80d6921a34e6edfba99fe7291d2474575d8',
  M101: 'da559812c70b756d20b035af26eeef964a954dd9',
  NGC205: 'b2d2539816c43fa885a5beea5130313948b10928'
};
var ROIS_DEF = { M51: 'rois_M51.json', M101: 'rois_M101.json', M81: 'rois_M81.json' };
if (!MODO_CEROS && !OBJS[OBJ]) { console.error('objeto desconocido: ' + OBJ); process.exit(2); }
var OUT = path.join(RAIZ, '.scratch', 'deficit', MODO_CEROS ? 'ceros' : OBJ);
fs.mkdirSync(OUT, { recursive: true });
var IN_GAIA = path.join(RAIZ, '.scratch', 'quitar-general');

var fallos = 0;
function exige(c, t) { if (c) console.log('  ok   ' + t); else { fallos++; console.error('  FALLA: ' + t); } }
function sha1(arr) {
  return crypto.createHash('sha1')
    .update(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength)).digest('hex');
}

/* ── PNG mínimo (idéntico a harness_interbrazos) ── */
function crc32(buf) {
  var t = crc32.t;
  if (!t) {
    t = crc32.t = new Int32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
  }
  var c2 = -1;
  for (var i = 0; i < buf.length; i++) c2 = t[(c2 ^ buf[i]) & 255] ^ (c2 >>> 8);
  return (c2 ^ -1) >>> 0;
}
function chunk(tipo, datos) {
  var b = Buffer.alloc(8 + datos.length + 4);
  b.writeUInt32BE(datos.length, 0); b.write(tipo, 4);
  datos.copy(b, 8);
  b.writeUInt32BE(crc32(b.slice(4, 8 + datos.length)), 8 + datos.length);
  return b;
}
function png(nombre, rgb, W, H) {
  var raw = Buffer.alloc((W * 3 + 1) * H);
  for (var y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1);
  }
  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(path.join(OUT, nombre + '.png'), Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))
  ]));
}
function grisA(v) { return Math.max(0, Math.min(255, Math.round(v))); }
function pngGris(nombre, datos, W, H) {
  var rgb = new Uint8Array(W * H * 3);
  for (var i = 0; i < W * H; i++) { var g = grisA(datos[i]); rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = g; }
  png(nombre, rgb, W, H);
}

/* ── utilidades ── */
function filaCat(nombre) {
  for (var i = 0; i < CAT.length; i++) if (CAT[i][0] === nombre) return CAT[i];
  return null;
}
function galDeFila(g) {
  return { nombre: g[0], ra: g[2], dec: g[3], reArcsec: g[4], ba: g[5], pa: g[6],
           magV: g[7], n: g[8], bt: g[9], nMedido: g[11] || 0,
           ladoArcmin: window.BitacoraPS1.ps1LadoArcmin(g[4]) };
}
function leerGaia(fich) {
  return fs.readFileSync(path.join(IN_GAIA, fich), 'utf8').trim().split('\n').slice(1)
    .map(function (l) { var t = l.split(','); return [parseFloat(t[0]), parseFloat(t[1]), parseFloat(t[2])]; });
}
function mediana(m) { var s = m.slice().sort(function (a, b) { return a - b; }); return s.length ? s[s.length >> 1] : NaN; }
function pctl(m, p) {
  var s = m.slice().sort(function (a, b) { return a - b; });
  if (!s.length) return NaN;
  return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
}
function estad(m) {
  return { n: m.length, mediana: mediana(m), p10: pctl(m, 0.10), p90: pctl(m, 0.90) };
}
function regresion(xs, ys) {   // OLS y = a + b·x
  var n = xs.length, sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0, i;
  for (i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; syy += ys[i] * ys[i]; }
  var b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  var a = (sy - b * sx) / n;
  var r = (n * sxy - sx * sy) / Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
  return { n: n, pendiente: b, intercepto: a, r2: r * r };
}
/* distancia chamfer (3-4)/3 al NaN más próximo, en px de parche */
function distANaN(datos, W, H) {
  var INF = 1e9, d = new Float32Array(datos.length), i, x, y;
  for (i = 0; i < datos.length; i++) d[i] = isFinite(datos[i]) ? INF : 0;
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    i = y * W + x;
    if (x > 0 && d[i - 1] + 1 < d[i]) d[i] = d[i - 1] + 1;
    if (y > 0 && d[i - W] + 1 < d[i]) d[i] = d[i - W] + 1;
    if (x > 0 && y > 0 && d[i - W - 1] + 1.3333 < d[i]) d[i] = d[i - W - 1] + 1.3333;
    if (x < W - 1 && y > 0 && d[i - W + 1] + 1.3333 < d[i]) d[i] = d[i - W + 1] + 1.3333;
  }
  for (y = H - 1; y >= 0; y--) for (x = W - 1; x >= 0; x--) {
    i = y * W + x;
    if (x < W - 1 && d[i + 1] + 1 < d[i]) d[i] = d[i + 1] + 1;
    if (y < H - 1 && d[i + W] + 1 < d[i]) d[i] = d[i + W] + 1;
    if (x < W - 1 && y < H - 1 && d[i + W + 1] + 1.3333 < d[i]) d[i] = d[i + W + 1] + 1.3333;
    if (x > 0 && y < H - 1 && d[i + W - 1] + 1.3333 < d[i]) d[i] = d[i + W - 1] + 1.3333;
  }
  return d;
}

/* ── réplica instrumentada con VOLCADO AMPLIADO ──
   Además de las etapas de Fase 1: s efectiva, cielo usado (escalar, va en el
   JSON), pe agregado (cubierto), término imagen wk·s·vk y término (1−wk)·fm por
   separado, wMin (peso mínimo entre vecinos cubiertos) y etapa bilineal pura
   (imagen sola, sin s ni perfil). Paridad bit a bit contra producción. */
function pintarInstr(parche, o, ov) {
  ov = ov || {};
  var SIZE = CFG.SIZE, escv = SIZE / (o.arcmin / 60);
  var cos0 = Math.cos(o.dec0 * Math.PI / 180);
  var dra = (((parche.ra - o.ra0 + 540) % 360) - 180) * cos0;
  var cx = SIZE / 2 - dra * escv, cy = SIZE / 2 - (parche.dec - o.dec0) * escv;
  var ladoPx = (parche.ladoArcmin / 60) * escv;
  var n = SIZE * SIZE;
  var res = {
    stAnc: new Float32Array(n).fill(NaN), stPsf: new Float32Array(n).fill(NaN),
    stBil: new Float32Array(n).fill(NaN),
    fPre: new Float32Array(n), fPost: new Float32Array(n),
    wMap: new Float32Array(n), wMin: new Float32Array(n).fill(NaN),
    fmMap: new Float32Array(n),
    tImg1: new Float32Array(n), tSub: new Float32Array(n), tPerf: new Float32Array(n),
    cubierto: new Float32Array(n),
    opMap: new Float32Array(n).fill(NaN), sopMap: new Float32Array(n),
    fx: new Float32Array(n).fill(NaN), fy: new Float32Array(n).fill(NaN),
    pintado: new Uint8Array(n), ctx: null, sMezcla: 1,
    cx: cx, cy: cy, escv: escv
  };
  if (!(ladoPx > 0.5)) return res;
  var q = parche.ancho / (parche.ladoArcmin * 60);
  var a = parche.afin || { cx: (parche.ancho - 1) / 2, cy: (parche.alto - 1) / 2,
                           xe: -q, xn: 0, ye: 0, yn: q };
  var c = o.cielo ? R.ctxFotometrico(o.cielo, parche.thetaIntArcmin) : null;
  res.ctx = c;
  var umbral = c ? R.sbUmbralContraste(c) : 0;
  var pxPorAs = escv / 3600;
  var halo = !!c && window.BitacoraPS1.ps1HaloActivo(parche.halo);
  var comps = halo ? (parche.comps || []) : [], pa = parche.pa || 0;
  var peso = halo ? (parche.peso || null) : null;
  var sMezcla = peso ? parche.escalaMezcla : 1;
  if (ov.s != null && peso) sMezcla = ov.s;
  res.sMezcla = sMezcla;
  var haloPx = window.BitacoraPS1.ps1RadioHaloAs(comps) * pxPorAs;
  var alcance = Math.max(ladoPx / 2, haloPx);
  var escParche = (parche.ladoArcmin * 60) / parche.ancho;
  var D = o.apertura;
  var datos = c ? (ov.datosPsf || window.BitacoraPS1.ps1DatosConPsf(parche, escParche, D)) : parche.datos;
  res.datosPsf = datos;
  var soporte = c ? window.BitacoraPS1.ps1SoporteLocal(datos, parche.ancho, parche.alto, escParche) : null;
  res.soporte = soporte;
  var x0 = Math.max(0, Math.floor(cx - alcance)), x1 = Math.min(SIZE - 1, Math.ceil(cx + alcance));
  var y0 = Math.max(0, Math.floor(cy - alcance)), y1 = Math.min(SIZE - 1, Math.ceil(cy + alcance));
  for (var y = y0; y <= y1; y++) {
    var norte = -(y - cy) / pxPorAs;
    for (var x = x0; x <= x1; x++) {
      var este = -(x - cx) / pxPorAs;
      var fx = a.cx + a.xe * este + a.xn * norte;
      var fy = a.cy + a.ye * este + a.yn * norte;
      var i = y * SIZE + x;
      res.fx[i] = fx; res.fy[i] = fy;
      var px0 = Math.floor(fx), py0 = Math.floor(fy);
      var tx = fx - px0, ty = fy - py0;
      var fm = comps.length ? window.BitacoraPS1.ps1FlujoModelo(comps, pa, norte, este) : 0;
      res.fmMap[i] = fm;
      /* etapas 1 y 2 en el vecino más próximo (rejilla del parche) */
      var kN = Math.round(fy) * parche.ancho + Math.round(fx);
      if (Math.round(fx) >= 0 && Math.round(fx) < parche.ancho &&
          Math.round(fy) >= 0 && Math.round(fy) < parche.alto) {
        res.stAnc[i] = parche.datos[kN];
        res.stPsf[i] = datos[kN];
      }
      var acc = 0, cubierto = 0, accW = 0, accBil = 0;
      var accT1 = 0, accSub = 0, accPerf = 0, wmin = Infinity;
      for (var vj = 0; vj < 2; vj++) {
        var cvj = vj ? ty : 1 - ty;
        if (!(cvj > 0)) continue;
        var py = py0 + vj;
        for (var vi = 0; vi < 2; vi++) {
          var pe = cvj * (vi ? tx : 1 - tx);
          if (!(pe > 0)) continue;
          var px = px0 + vi, fv = 0, wv = 0;
          if (py >= 0 && py < parche.alto && px >= 0 && px < parche.ancho) {
            var k = py * parche.ancho + px;
            var v = datos[k];
            if (isFinite(v)) { fv = v; wv = peso ? peso[k] : 0; }
          }
          acc += pe * (comps.length ? wv * sMezcla * fv + (1 - wv) * fm : fv);
          accBil += pe * fv;
          accT1 += pe * wv * fv;
          accSub += pe * (1 - wv) * fv;
          accPerf += pe * (1 - wv) * fm;
          accW += pe * wv;
          if (wv < wmin) wmin = wv;
          cubierto += pe;
        }
      }
      if (!(cubierto > 0)) continue;
      var f = acc / cubierto;
      res.wMap[i] = accW / cubierto;
      res.wMin[i] = wmin === Infinity ? NaN : wmin;
      res.stBil[i] = accBil / cubierto;
      res.tImg1[i] = accT1 / cubierto;
      res.tSub[i] = accSub / cubierto;
      res.tPerf[i] = accPerf / cubierto;
      res.cubierto[i] = cubierto;
      if (!(f > 0)) continue;
      res.fPre[i] = f;
      if (c) {
        var sop = 0;
        if (soporte) {
          var sx = Math.round(fx), sy = Math.round(fy);
          if (sx >= 0 && sx < parche.ancho && sy >= 0 && sy < parche.alto) {
            sop = soporte[sy * parche.ancho + sx];
          }
        }
        res.sopMap[i] = sop;
        var op = window.BitacoraPS1.ps1Opacidad(-2.5 * Math.log10(sop > f ? sop : f), umbral);
        res.opMap[i] = op;
        f = window.BitacoraPS1.ps1FlujoConOpacidad(f, op, c);
      }
      if (!(f > 0)) continue;
      res.fPost[i] = f;
      res.pintado[i] = 1;
    }
  }
  return res;
}

function nivelPantalla(fPost, c) {
  var out = new Float32Array(fPost.length);
  for (var i = 0; i < fPost.length; i++) {
    var F = fPost[i];
    if (F > 0 && FOT.GAMMA_PERCEPTUAL !== 1) F = R.realzarPerceptual(F, c.Fcielo, c.rango, 0, PS1.realceMax);
    out[i] = c.nivelFondo + R.valorDeFlujo(F, c.Fcielo, c.rango);
  }
  return out;
}

/* ── construcción del pipeline de producción para un objeto ── */
function cargarPipeline(O, cb) {
  var gal = galDeFila(filaCat(O.cat));
  B.bajar(gal.ra, gal.dec, gal.ladoArcmin, PS1.salida).then(function (F) {
    var W = F.ancho, H = F.alto;
    var fSim = { ancho: W, alto: H, escalaAs: F.escalaAs, wcs: F.wcs || null };
    fSim.afin = window.BitacoraPS1.ps1AfinParche(fSim, gal);
    var estrellas = leerGaia(O.csv);
    var enPx = window.BitacoraPS1.ps1EstrellasEnPixeles(fSim, gal, estrellas);
    var vecinos = window.BitacoraPS1.ps1GalaxiasDelCampo(CAT, gal.ra, gal.dec, gal.ladoArcmin);
    var escena = window.BitacoraPS1.ps1EscenaEnParche(fSim, gal, vecinos);
    var limpio = window.BitacoraPS1.ps1QuitarEstrellas(F.datos, W, H, enPx,
      { afin: fSim.afin, ba: gal.ba, pa: gal.pa, escena: escena });
    var cieloP = window.BitacoraPS1.ps1Cielo(limpio, W, H);
    var sigmaP = window.BitacoraPS1.ps1SigmaCielo(limpio, W, H, cieloP);
    var anc = window.BitacoraPS1.ps1AnclarACatalogo(limpio, W, H, {
      magV: gal.magV, n: gal.n, reArcsec: gal.reArcsec,
      ladoArcmin: gal.ladoArcmin, escalaAs: F.escalaAs });
    var comps = window.BitacoraPS1.ps1ComponentesSersic(gal);
    var peso = window.BitacoraPS1.ps1PesoImagen(anc, W, H, F.escalaAs);
    var perfil = window.BitacoraPS1.ps1PerfilEnParche(comps, gal.pa, W, H, fSim.afin);
    var parche = { ra: gal.ra, dec: gal.dec, ladoArcmin: gal.ladoArcmin,
                   ancho: W, alto: H, afin: fSim.afin,
                   comps: comps, pa: gal.pa, halo: window.BitacoraPS1.ps1MedidasHalo(gal, comps),
                   thetaIntArcmin: window.BitacoraPS1.ps1ThetaIntArcmin(comps, gal.ba),
                   peso: peso, escalaMezcla: window.BitacoraPS1.ps1EscalaMezcla(anc, peso, perfil),
                   datos: anc, escena: escena };
    var cielo = { pupilaSalida: CFG.D / CFG.M, pupilaOjo: 7, sqm: CFG.sqm,
                  aumentos: CFG.M, realceMax: PS1.realceMax, perceptual: true };
    var o = { ra0: gal.ra, dec0: gal.dec, arcmin: CFG.AFOV / CFG.M * 60,
              size: CFG.SIZE, cielo: cielo, apertura: CFG.D };
    /* kanc: DN → flujo/arcsec² del anclaje, medido en el píxel más brillante */
    var suelo = cieloP + PS1.kRuido * sigmaP, kanc = NaN, mejor = 0;
    for (var i = 0; i < anc.length; i++) {
      if (anc[i] > mejor && limpio[i] > suelo) { mejor = anc[i]; kanc = anc[i] / (limpio[i] - suelo); }
    }
    cb({ gal: gal, F: F, W: W, H: H, fSim: fSim, escena: escena, limpio: limpio,
         cieloP: cieloP, sigmaP: sigmaP, suelo: suelo, kanc: kanc,
         anc: anc, comps: comps, peso: peso, perfil: perfil, parche: parche,
         cielo: cielo, o: o });
  }).catch(function (e) { console.error(e); process.exit(2); });
}

/* píxeles de lienzo cuya proyección cae en una ROI (caja o círculo de parche) */
function idxRoi(I, rr, n) {
  var out = [];
  for (var i = 0; i < n; i++) {
    var fx = I.fx[i], fy = I.fy[i];
    if (!(fx === fx)) continue;
    if (rr.radioPx != null) {
      var dx = fx - rr.cx, dy = fy - rr.cy;
      if (dx * dx + dy * dy <= rr.radioPx * rr.radioPx) out.push(i);
    } else if (fx >= rr.x0 && fx <= rr.x1 && fy >= rr.y0 && fy <= rr.y1) out.push(i);
  }
  return out;
}

/* métricas fotométricas de primera línea de una corrida */
function medir(I, P, rois) {
  var c = I.ctx, n = CFG.SIZE * CFG.SIZE;
  var E = nivelPantalla(I.fPost, c);
  var fondoNivel = Math.round(c.nivelFondo);
  var pxPorAs = I.escv / 3600, r20 = 20 * pxPorAs;
  var f20pre = 0, f20post = 0, fCampoPre = 0, fCampoPost = 0;
  for (var i = 0; i < n; i++) {
    fCampoPre += I.fPre[i]; fCampoPost += I.fPost[i];
    var x = i % CFG.SIZE, y = (i / CFG.SIZE) | 0;
    var dx = x - I.cx, dy = y - I.cy;
    if (dx * dx + dy * dy <= r20 * r20) { f20pre += I.fPre[i]; f20post += I.fPost[i]; }
  }
  var porRoi = {};
  (rois || []).forEach(function (rr) {
    var idx = idxRoi(I, rr, n), negros = 0, mags = [], niv = [];
    idx.forEach(function (i2) {
      if (grisA(E[i2]) <= fondoNivel + CFG.delta) negros++;
      if (I.fPre[i2] > 0) mags.push(-2.5 * Math.log10(I.fPre[i2]));
      niv.push(E[i2]);
    });
    porRoi[rr.nombre] = { px: idx.length, negros: negros,
      fracNegros: idx.length ? negros / idx.length : 0,
      magPreMediana: mediana(mags), nivelMediana: mediana(niv) };
  });
  return { Cmin: c.Cmin, nivelFondo: c.nivelFondo, rango: c.rango,
           umbralSB: R.sbUmbralContraste(c),
           flujo020_pre: f20pre, flujo020_post: f20post,
           flujoCampo_pre: fCampoPre, flujoCampo_post: fCampoPost,
           rois: porRoi, E: E };
}

/* ═════════ modo CEROS: test de coherencia de ceros (Tarea 1.4, H-F3) ═════════ */
if (MODO_CEROS) {
  console.log('═══ Test de ceros (H-F3): parche sintético, cadena real vs modelo ═══');
  /* parche sintético determinista: LCG + Box-Muller, cielo 100 DN, σ 8 DN,
     3″/px (θ_add = 0 con D=457,2: la PSF es la identidad y no entra en el
     modelo), sin componentes Sérsic (la mezcla es la identidad: el test aísla
     anclaje → bilineal → opacidad → nivel, que es donde viviría una doble
     resta de cielo o un δ con otra referencia). */
  var N = 64, ESC = 3, CIELO0 = 100, SIG0 = 8;
  var semilla = 123456789;
  function lcg() { semilla = (1103515245 * semilla + 12345) % 2147483648; return semilla / 2147483648; }
  function gauss() {
    var u = Math.max(1e-12, lcg()), v = lcg();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  var datosS = new Float32Array(N * N);
  for (var iS = 0; iS < N * N; iS++) datosS[iS] = CIELO0 + SIG0 * gauss();
  /* inyecciones: cielo exacto, +1σ, +3σ (valores VERDADEROS, el modelo usa los
     estimados del marco como producción) */
  var INY = [{ x: 20, y: 32, v: CIELO0 }, { x: 32, y: 32, v: CIELO0 + SIG0 },
             { x: 44, y: 32, v: CIELO0 + 3 * SIG0 }];
  INY.forEach(function (p) { datosS[p.y * N + p.x] = p.v; });

  var galS = { magV: 10, n: 1, reArcsec: 30, ladoArcmin: N * ESC / 60, escalaAs: ESC };
  var thAdd = window.BitacoraPS1.ps1ThetaAdd(CFG.D, ESC);
  exige(thAdd === 0, 'θ_add = 0 en el sintético (PSF identidad): ' + thAdd);

  var cieloS = window.BitacoraPS1.ps1Cielo(datosS, N, N);
  var sigmaS = window.BitacoraPS1.ps1SigmaCielo(datosS, N, N, cieloS);
  var ancS = window.BitacoraPS1.ps1AnclarACatalogo(datosS, N, N, galS);

  /* MODELO INDEPENDIENTE (aritmética propia, solo documentación):
     E2 (documentado): anc = max(v − (cielo + kRuido·σ), 0) · k, NaN si v < cielo − kAusencia·σ
     E1 (cielo pelado): anc = max(v − cielo, 0) · k1 */
  function modeloAnclaje(kRuidoEf) {
    var sueloM = cieloS + kRuidoEf * sigmaS, corteM = cieloS - PS1.kAusencia * sigmaS;
    var neto = new Float64Array(N * N), suma = 0;
    for (var i = 0; i < N * N; i++) {
      var v = datosS[i];
      if (v !== v || v < corteM) { neto[i] = NaN; continue; }
      var d = v - sueloM;
      neto[i] = d > 0 ? d : 0;
      suma += neto[i];
    }
    var radioEnRe = (galS.ladoArcmin * 60 / 2) / galS.reArcsec;
    var frac = window.BitacoraPS1.ps1FraccionLuz(galS.n, radioEnRe);
    var Ftotal = Math.pow(10, -0.4 * galS.magV) * (frac > 0.02 ? frac : 0.02);
    var k = Ftotal / (suma * ESC * ESC);
    for (var j = 0; j < N * N; j++) neto[j] *= k;
    return { neto: neto, k: k, suelo: sueloM };
  }
  var mE2 = modeloAnclaje(PS1.kRuido);
  var mE1 = modeloAnclaje(0);

  /* anclaje real vs modelo E2, píxel a píxel */
  var dAncMax = 0;
  for (var iA = 0; iA < N * N; iA++) {
    var a2 = ancS[iA], b2 = mE2.neto[iA];
    if ((a2 === a2) !== (b2 === b2)) { dAncMax = Infinity; break; }
    if (a2 === a2) dAncMax = Math.max(dAncMax, Math.abs(a2 - b2) / Math.max(1e-30, Math.abs(b2) || 1e-30));
  }
  exige(dAncMax < 1e-5, 'anclaje real = modelo E2 (resta ÚNICA de suelo; desvío rel máx ' + dAncMax.toExponential(2) + ')');

  /* cadena completa hasta nivel: parche sin comps → mezcla identidad */
  var parcheS = { ra: 200, dec: 45, ladoArcmin: galS.ladoArcmin, ancho: N, alto: N,
                  comps: [], pa: 0, halo: null, datos: ancS };
  var cieloCfg = { pupilaSalida: CFG.D / CFG.M, pupilaOjo: 7, sqm: CFG.sqm,
                   aumentos: CFG.M, realceMax: PS1.realceMax, perceptual: true };
  var oS = { ra0: 200, dec0: 45, arcmin: CFG.AFOV / CFG.M * 60, size: CFG.SIZE,
             cielo: cieloCfg, apertura: CFG.D };
  var prodS = new Float32Array(CFG.SIZE * CFG.SIZE);
  window.BitacoraPS1.ps1PintarParche(prodS, parcheS, oS);
  var IS = pintarInstr(parcheS, oS);
  var dmaxS = 0;
  for (var iP2 = 0; iP2 < prodS.length; iP2++) dmaxS = Math.max(dmaxS, Math.abs(prodS[iP2] - IS.fPost[iP2]));
  exige(dmaxS === 0, 'réplica sintética = producción bit a bit (dmax=' + dmaxS + ')');

  /* nivel final esperado en el lienzo, aritmética propia de principio a fin:
     bilineal propio sobre el modelo E2 + rampa propia + mapeo propio */
  var cS = R.ctxFotometrico(cieloCfg);
  var umbralS = -2.5 * Math.log10(cS.Fcielo * cS.Cmin);
  var escvS = CFG.SIZE / (oS.arcmin / 60), pxAsS = escvS / 3600;
  var qS = N / (parcheS.ladoArcmin * 60);
  var aS = { cx: (N - 1) / 2, cy: (N - 1) / 2, xe: -qS, xn: 0, ye: 0, yn: qS };
  var cxS = CFG.SIZE / 2, cyS = CFG.SIZE / 2;
  /* soporte propio: media de caja (2·rad+1)² con rad = round(mezclaCajaAs/ESC/2) */
  var radS = Math.max(1, Math.round(PS1.mezclaCajaAs / ESC / 2));
  function soportePropio(neto) {
    var f = new Float64Array(N * N), out = new Float64Array(N * N);
    for (var i = 0; i < N * N; i++) f[i] = neto[i] > 0 ? neto[i] : 0;
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      var s2 = 0, m2 = 0;
      for (var dy = -radS; dy <= radS; dy++) for (var dx = -radS; dx <= radS; dx++) {
        var yy = Math.min(N - 1, Math.max(0, y + dy)), xx = Math.min(N - 1, Math.max(0, x + dx));
        s2 += f[yy * N + xx]; m2++;
      }
      out[y * N + x] = s2 / m2;
    }
    return out;
  }
  var sopS = soportePropio(mE2.neto);
  var resultados = [];
  INY.forEach(function (p, j) {
    /* lienzo px más próximo a la proyección inversa del píxel de parche */
    var este = (p.x - aS.cx) / aS.xe, norte = (p.y - aS.cy) / aS.yn;
    var lx = Math.round(cxS - este * pxAsS), ly = Math.round(cyS - norte * pxAsS);
    var i = ly * CFG.SIZE + lx;
    /* modelo: bilineal propio en (fx,fy) del lienzo elegido */
    var esteL = -(lx - cxS) / pxAsS, norteL = -(ly - cyS) / pxAsS;
    var fx = aS.cx + aS.xe * esteL, fy = aS.cy + aS.yn * norteL;
    var px0 = Math.floor(fx), py0 = Math.floor(fy), tx = fx - px0, ty = fy - py0;
    var acc = 0, cub = 0;
    [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]]
      .forEach(function (vv) {
        var pe = vv[2];
        if (!(pe > 0)) return;
        var xx = px0 + vv[0], yy = py0 + vv[1], fv = 0;
        if (xx >= 0 && xx < N && yy >= 0 && yy < N) {
          var v2 = mE2.neto[yy * N + xx];
          if (isFinite(v2)) fv = v2;
        }
        acc += pe * fv; cub += pe;
      });
    var fEsp = cub > 0 ? acc / cub : 0;
    var nivelEsp = cS.nivelFondo;
    if (fEsp > 0) {
      var sxp = Math.round(fx), syp = Math.round(fy);
      var sop = (sxp >= 0 && sxp < N && syp >= 0 && syp < N) ? sopS[syp * N + sxp] : 0;
      var sb = -2.5 * Math.log10(sop > fEsp ? sop : fEsp);
      var d = umbralS - sb, op;
      if (!(d > PS1.deltaMin)) op = 0;
      else if (d >= PS1.deltaPlena) op = 1;
      else op = Math.pow((d - PS1.deltaMin) / (PS1.deltaPlena - PS1.deltaMin), PS1.deltaExp);
      var val = 255 * 2.5 * Math.log10(1 + fEsp / cS.Fcielo) / cS.rango;
      var fOp = op >= 1 ? fEsp : (op > 0 ? cS.Fcielo * (Math.pow(10, op * val * cS.rango / (255 * 2.5)) - 1) : 0);
      var fFin = fOp;
      if (fFin > 0 && FOT.GAMMA_PERCEPTUAL !== 1) fFin = R.realzarPerceptual(fFin, cS.Fcielo, cS.rango, 0, PS1.realceMax);
      nivelEsp = cS.nivelFondo + 255 * 2.5 * Math.log10(1 + fFin / cS.Fcielo) / cS.rango;
    }
    var Ereal = nivelPantalla(IS.fPost, cS);
    var dNivel = Math.abs(Ereal[i] - nivelEsp);
    /* qué habría salido con resta de cielo pelado (E1), mismo camino */
    var vE1 = mE1.neto[p.y * N + p.x], vE2 = mE2.neto[p.y * N + p.x];
    resultados.push({
      inyeccion: ['cielo exacto', 'cielo+1σ', 'cielo+3σ'][j],
      dnCrudo: p.v, lienzo: [lx, ly],
      ancE2: vE2, ancE1_cieloPelado: vE1,
      nivelPipeline: Ereal[i], nivelModelo: nivelEsp, dNivel: dNivel
    });
    exige(dNivel <= 0.01, 'nivel pipeline = modelo en ' + resultados[j].inyeccion +
      ' (Δ=' + dNivel.toExponential(2) + ' niveles)');
  });
  var salida = {
    fecha: '2026-08-15', cfg: CFG, sintetico: { N: N, escalaAs: ESC, cielo: CIELO0, sigma: SIG0 },
    estimados: { cielo: cieloS, sigma: sigmaS, kE2: mE2.k, kE1: mE1.k,
                 suelo: mE2.suelo, kRuido: PS1.kRuido, kAusencia: PS1.kAusencia },
    thetaAdd: thAdd, resultados: resultados,
    conclusion: 'ver informe: si todos los ok pasan, no hay doble resta de cielo ni ' +
      'δ con referencia distinta (H-F3 descartada); el offset E2−E1 es el suelo ' +
      'kRuido·σ del anclaje, deliberado y documentado en ps1AnclarACatalogo.'
  };
  fs.writeFileSync(path.join(OUT, 'test_ceros.json'), JSON.stringify(salida, null, 1));
  console.log('\n  cielo estimado=' + cieloS.toFixed(3) + ' (verdad 100)  σ=' + sigmaS.toFixed(3) +
    ' (verdad 8)  suelo=' + mE2.suelo.toFixed(3));
  resultados.forEach(function (r2) {
    console.log('  ' + r2.inyeccion + ': anc(E2)=' + r2.ancE2.toExponential(3) +
      '  anc(E1 cielo pelado)=' + r2.ancE1_cieloPelado.toExponential(3) +
      '  nivel pipeline=' + r2.nivelPipeline.toFixed(3) + ' modelo=' + r2.nivelModelo.toFixed(3));
  });
  console.log('\n  salidas en ' + OUT);
  process.exit(fallos ? 1 : 0);
}

/* ═════════ modo AUDITORÍA / CONTRAFACTUAL sobre un objeto real ═════════ */
var O = OBJS[OBJ];
console.log('═══ FASE 4 ' + (CF ? 'CF-' + CF : 'auditoría') + ' — ' + OBJ +
  '  D=' + CFG.D + ' M=' + CFG.M + ' sqm=' + CFG.sqm + ' δ=' + CFG.delta + ' ═══');
console.log('  opacidadInternaEscena=' + PS1.opacidadInternaEscena +
  ' confianzaLocalNaN=' + PS1.confianzaLocalNaN + ' kRuido=' + PS1.kRuido);

cargarPipeline(O, function (P) {
  var W = P.W, H = P.H, n = CFG.SIZE * CFG.SIZE;
  /* ── paridad bit a bit + SHA contra Fase 3 ── */
  var prod = new Float32Array(n);
  window.BitacoraPS1.ps1PintarParche(prod, P.parche, P.o);
  var I = pintarInstr(P.parche, P.o);
  var dmax = 0;
  for (var i = 0; i < n; i++) dmax = Math.max(dmax, Math.abs(prod[i] - I.fPost[i]));
  exige(dmax === 0, 'réplica instrumentada = producción bit a bit (dmax=' + dmax + ')');
  var shaPre = sha1(I.fPre);
  exige(shaPre === SHA_FASE3[OBJ], 'SHA-1 fotometría pre-mapeo = baseline Fase 3 (' + shaPre.slice(0, 12) + '…)');
  if (fallos) { console.error('  paridad rota: me detengo (protocolo Tarea 0.4)'); process.exit(1); }

  var c = I.ctx;
  var escParche = (P.parche.ladoArcmin * 60) / W;
  var thAdd = window.BitacoraPS1.ps1ThetaAdd(CFG.D, escParche);
  var fwhmPx = thAdd / escParche;
  var dNaN = distANaN(P.anc, W, H);

  /* ROIs */
  var roisF = ROIS_DEF[OBJ] ? path.join(RAIZ, 'scripts', ROIS_DEF[OBJ]) : null;
  var rois = (roisF && fs.existsSync(roisF)) ? JSON.parse(fs.readFileSync(roisF, 'utf8')).cajas : [];

  if (!CF) {
    auditoria(P, I, rois, { thAdd: thAdd, fwhmPx: fwhmPx, dNaN: dNaN, shaPre: shaPre });
  } else {
    contrafactual(P, I, rois, CF);
  }
});

/* ─────────────────────────── AUDITORÍA (Tarea 1) ─────────────────────────── */
function auditoria(P, I, rois, X) {
  var W = P.W, H = P.H, n = CFG.SIZE * CFG.SIZE, c = I.ctx;
  var M = medir(I, P, rois);

  /* offset de ceros del parche real (Tarea 1.4 sobre datos reales):
     cero del parche = suelo (cielo+1,5σ); cero del mapeo = Fcielo. El offset en
     flujo es kRuido·σ·kanc, que es lo que un píxel del parche pierde respecto a
     una resta de cielo pelado. Se expresa también en σ y contra el umbral. */
  var offsetFlujo = PS1.kRuido * P.sigmaP * P.kanc;
  var ceros = {
    cieloParcheDN: P.cieloP, sigmaDN: P.sigmaP, sueloDN: P.suelo, kanc: P.kanc,
    offsetFlujo: offsetFlujo, offsetSobreFcielo: offsetFlujo / c.Fcielo,
    magOffsetEnUmbral: -2.5 * Math.log10(offsetFlujo) - M.umbralSB,
    nota: 'offset deliberado (suelo=cielo+kRuido·σ, ps1AnclarACatalogo); el test ' +
      'sintético --ceros verifica que no hay ninguna resta adicional'
  };

  /* balance por etapa y por píxel, por ROI */
  var balance = {}, firmaXs = [], firmaYs = [], firmaRoi = {};
  var descomp = {}, hf4 = {};
  var cierresMalos = 0, cierresTotal = 0;
  rois.forEach(function (rr) {
    var idx = idxRoi(I, rr, n);
    var dS = [], crudoSig = [], dA = [], dP = [], dB = [], dM2 = [], dO = [], dT = [];
    var compPsf = [], compBil = [], compMezA = [], compMezB = [], compTot = [];
    var wkBajo = 0, conTodo = 0;
    var psfLejos = [], psfCerca = [];
    var xsRoi = [], ysRoi = [];
    /* balance INCONDICIONAL: mediana de flujo por etapa sobre TODOS los px de
       la ROI (ceros y ausencias incluidos como 0), sin sesgo de supervivencia */
    var uCrudo = [], uAnc = [], uPsf = [], uBil = [], uMez = [];
    idx.forEach(function (i2) {
      var sAnc = I.stAnc[i2], sPsf = I.stPsf[i2], sBil = I.stBil[i2],
          sMez = I.fPre[i2], sOp = I.fPost[i2];
      /* etapa 0 (fuera de la cadena de Fase 1): crudo neto de cielo pelado,
         en las MISMAS unidades del anclaje (·kanc). Mide lo que el suelo
         kRuido·σ recorta a la señal débil antes de que la cadena empiece. */
      var kN0 = Math.round(I.fy[i2]) * W + Math.round(I.fx[i2]);
      if (kN0 >= 0 && kN0 < P.limpio.length) {
        var vC = P.limpio[kN0];
        if (vC === vC) {
          crudoSig.push((vC - P.cieloP) / P.sigmaP);
          var fC = (vC - P.cieloP) * P.kanc;
          if (fC > 0 && sAnc > 0) dS.push(-2.5 * Math.log10(sAnc) + 2.5 * Math.log10(fC));
          uCrudo.push(Math.max(0, fC));
        } else uCrudo.push(0);
        uAnc.push(sAnc > 0 ? sAnc : 0);
        uPsf.push(sPsf > 0 ? sPsf : 0);
        uBil.push(sBil > 0 ? sBil : 0);
        uMez.push(sMez > 0 ? sMez : 0);
      }
      if (!(sAnc > 0)) return;
      /* déficit total en flujo contra la señal anclada (para la firma) */
      var defT = sAnc - sMez;
      if (rr.tipo === 'interbrazo' || rr.tipo === 'brazo') {
        firmaXs.push(sAnc); firmaYs.push(defT);
        xsRoi.push(sAnc); ysRoi.push(defT);
      }
      compTot.push(defT);
      compPsf.push(sAnc - (sPsf > 0 ? sPsf : 0));
      compBil.push((sPsf > 0 ? sPsf : 0) - (sBil > 0 ? sBil : 0));
      var dcA = (I.sMezcla - 1) * I.tImg1[i2];
      var dcB = I.tPerf[i2] - I.tSub[i2];
      compMezA.push(-dcA);            // déficit: cambio de signo (pérdida positiva)
      compMezB.push(-dcB);
      /* cierre de la descomposición de mezcla (exacto salvo Float32) */
      var resto = (sMez - (sBil > 0 ? sBil : 0)) - dcA - dcB;
      cierresTotal++;
      if (Math.abs(resto) > 1e-6 * Math.max(1e-30, sMez)) cierresMalos++;
      if (I.wMin[i2] === I.wMin[i2] && I.wMin[i2] < 0.999) wkBajo++;
      conTodo++;
      if (sPsf > 0 && sBil > 0 && sMez > 0 && sOp > 0) {
        var mA = -2.5 * Math.log10(sAnc), mP = -2.5 * Math.log10(sPsf),
            mB = -2.5 * Math.log10(sBil), mM = -2.5 * Math.log10(sMez),
            mO = -2.5 * Math.log10(sOp);
        dA.push(mP - mA); dP.push(mB - mP); dB.push(mM - mB); dM2.push(mO - mM);
        dT.push(mO - mA);
        /* H-F4: PSF cerca/lejos de NaN */
        var kN = Math.round(I.fy[i2]) * W + Math.round(I.fx[i2]);
        if (rr.tipo === 'interbrazo') {
          if (dNaNok(X.dNaN[kN], X.fwhmPx)) psfLejos.push(mP - mA);
          else psfCerca.push(mP - mA);
        }
      }
    });
    balance[rr.nombre] = {
      tipo: rr.tipo, px: idx.length, conSenalAnclada: conTodo,
      crudoSigma: estad(crudoSig), dmag_suelo_anclaje: estad(dS),
      dmag_anclaje_psf: estad(dA), dmag_psf_bilineal: estad(dP),
      dmag_bilineal_mezcla: estad(dB), dmag_mezcla_op: estad(dM2),
      dmag_total: estad(dT),
      deficitFlujo: estad(compTot),
      comp_psf: estad(compPsf), comp_bilineal: estad(compBil),
      comp_mezcla_s: estad(compMezA), comp_mezcla_perfil: estad(compMezB),
      wkMenorQue1: wkBajo, fracWkMenor: conTodo ? wkBajo / conTodo : 0,
      medianasFlujo: (function () {
        function mg(f) { return f > 0 ? -2.5 * Math.log10(f) : null; }
        var mc = mediana(uCrudo), ma = mediana(uAnc), mp = mediana(uPsf),
            mb2 = mediana(uBil), mm = mediana(uMez);
        return { crudoNeto: mc, anclado: ma, psf: mp, bilineal: mb2, mezcla: mm,
                 mag: { crudoNeto: mg(mc), anclado: mg(ma), psf: mg(mp),
                        bilineal: mg(mb2), mezcla: mg(mm) } };
      })()
    };
    if (rr.tipo === 'interbrazo') {
      hf4[rr.nombre] = { lejosNaN: estad(psfLejos), cercaNaN: estad(psfCerca) };
    }
    if (xsRoi.length >= 10) firmaRoi[rr.nombre] = regresion(xsRoi, ysRoi);
  });

  /* firma global aditiva vs multiplicativa */
  var firma = firmaXs.length >= 10 ? regresion(firmaXs, firmaYs) : null;
  var defMed = mediana(firmaYs);
  var veredictoFirma = 'SIN DATOS';
  if (firma) {
    if (Math.abs(firma.pendiente) < 0.1 && firma.intercepto > 0) veredictoFirma = 'ADITIVA';
    else if (firma.pendiente > 0 && firma.pendiente < 1 &&
             Math.abs(firma.intercepto) < 0.2 * Math.abs(defMed)) veredictoFirma = 'MULTIPLICATIVA';
    else veredictoFirma = 'MIXTA';
  }
  /* la firma en unidades físicas del parche: intercepto en σ·kanc */
  var interceptoSigma = firma ? firma.intercepto / (P.sigmaP * P.kanc) : NaN;

  /* atribución porcentual del déficit mediano (interbrazos) */
  var atrib = { psf: [], bilineal: [], mezcla_s: [], mezcla_perfil: [], total: [] };
  rois.filter(function (rr) { return rr.tipo === 'interbrazo'; }).forEach(function (rr) {
    var b = balance[rr.nombre];
    if (!b || !(b.deficitFlujo.n > 0)) return;
    atrib.psf.push(b.comp_psf.mediana); atrib.bilineal.push(b.comp_bilineal.mediana);
    atrib.mezcla_s.push(b.comp_mezcla_s.mediana); atrib.mezcla_perfil.push(b.comp_mezcla_perfil.mediana);
    atrib.total.push(b.deficitFlujo.mediana);
  });
  function pctDe(compArr) {
    var t = mediana(atrib.total);
    return t ? 100 * mediana(compArr) / t : NaN;
  }
  var atribPct = { psf: pctDe(atrib.psf), bilineal: pctDe(atrib.bilineal),
                   mezcla_s: pctDe(atrib.mezcla_s), mezcla_perfil: pctDe(atrib.mezcla_perfil) };

  var salida = {
    obj: OBJ, fecha: '2026-08-15', cfg: CFG, shaFotometriaPre: X.shaPre,
    flags: { opacidadInternaEscena: PS1.opacidadInternaEscena,
             confianzaLocalNaN: PS1.confianzaLocalNaN, kRuido: PS1.kRuido,
             kAusencia: PS1.kAusencia, mezclaCajaAs: PS1.mezclaCajaAs, mezclaW0: PS1.mezclaW0 },
    parche: { ancho: W, alto: H, escalaAs: P.F.escalaAs, cielo: P.cieloP,
              sigma: P.sigmaP, suelo: P.suelo, kanc: P.kanc,
              escalaMezcla: P.parche.escalaMezcla, thetaAddAs: X.thAdd, fwhmPx: X.fwhmPx },
    ctx: { Fcielo: c.Fcielo, Cmin: c.Cmin, umbralSB: M.umbralSB,
           nivelFondo: c.nivelFondo, rango: c.rango },
    ceros: ceros,
    balance: balance,
    cierreDescomposicion: { total: cierresTotal, malos: cierresMalos },
    firma: { global: firma, porRoi: firmaRoi, veredicto: veredictoFirma,
             deficitMediano: defMed, interceptoEnSigmaK: interceptoSigma },
    atribucionPct: atribPct,
    hf4: hf4,
    fotometria: { flujo020_pre: M.flujo020_pre, flujo020_post: M.flujo020_post,
                  flujoCampo_pre: M.flujoCampo_pre, flujoCampo_post: M.flujoCampo_post,
                  rois: M.rois },
    shaEtapas: { anc: sha1(I.stAnc), psf: sha1(I.stPsf), bil: sha1(I.stBil),
                 mez: sha1(I.fPre), post: sha1(I.fPost) }
  };
  fs.writeFileSync(path.join(OUT, 'auditoria_' + OBJ + '.json'), JSON.stringify(salida, null, 1));

  /* PNGs: render base + parche con NaN y ROIs (para fijar/verificar ROIs) */
  pngGris('render_base', M.E, CFG.SIZE, CFG.SIZE);
  var topeV = (function () {
    var m = [];
    for (var i = 0; i < P.anc.length; i += 7) if (P.anc[i] > 0) m.push(P.anc[i]);
    m.sort(function (a, b) { return a - b; });
    return m.length ? m[Math.floor(m.length * 0.98)] : 1;
  })();
  var rgbP = new Uint8Array(W * H * 3);
  for (var i2 = 0; i2 < W * H; i2++) {
    var vv = P.anc[i2];
    var g2 = vv === vv ? grisA(255 * Math.log1p(Math.max(0, vv) / topeV * 20) / Math.log1p(20)) : 0;
    rgbP[i2 * 3] = rgbP[i2 * 3 + 1] = rgbP[i2 * 3 + 2] = g2;
    if (!(vv === vv)) { rgbP[i2 * 3] = 40; rgbP[i2 * 3 + 1] = 0; rgbP[i2 * 3 + 2] = 60; }
  }
  rois.forEach(function (rr) {
    if (rr.radioPx != null) return;
    for (var yy = rr.y0; yy <= rr.y1; yy++) for (var xx = rr.x0; xx <= rr.x1; xx++) {
      if (yy < 0 || yy >= H || xx < 0 || xx >= W) continue;
      if (yy === rr.y0 || yy === rr.y1 || xx === rr.x0 || xx === rr.x1) {
        var j3 = (yy * W + xx) * 3;
        rgbP[j3] = 0; rgbP[j3 + 1] = 255; rgbP[j3 + 2] = 0;
      }
    }
  });
  png('parche_estado', rgbP, W, H);

  console.log('\n  s (escalaMezcla) = ' + P.parche.escalaMezcla.toFixed(6));
  console.log('  cielo=' + P.cieloP.toFixed(3) + ' DN  σ=' + P.sigmaP.toFixed(3) +
    '  suelo=' + P.suelo.toFixed(3) + '  kanc=' + P.kanc.toExponential(3));
  console.log('  offset de cero parche↔mapeo = ' + offsetFlujo.toExponential(3) +
    ' flujo/as² (= kRuido·σ·kanc), ' + (offsetFlujo / c.Fcielo * 100).toFixed(2) + ' % de Fcielo');
  if (firma) {
    console.log('  firma: pendiente=' + firma.pendiente.toFixed(4) + ' intercepto=' +
      firma.intercepto.toExponential(3) + ' (=' + interceptoSigma.toFixed(2) + ' σ·k) r²=' +
      firma.r2.toFixed(3) + ' → ' + veredictoFirma);
  }
  console.log('  atribución del déficit interbrazo (mediana): PSF ' + atribPct.psf.toFixed(1) +
    ' %, bilineal ' + atribPct.bilineal.toFixed(1) + ' %, mezcla·s ' + atribPct.mezcla_s.toFixed(1) +
    ' %, mezcla·perfil ' + atribPct.mezcla_perfil.toFixed(1) + ' %');
  Object.keys(balance).forEach(function (nom) {
    var b = balance[nom];
    if (!b.dmag_total.n) return;
    console.log('  [' + nom + ' ' + b.tipo + '] crudo ' + b.crudoSigma.mediana.toFixed(2) +
      'σ  Δmag suelo→anc ' + (b.dmag_suelo_anclaje.n ? b.dmag_suelo_anclaje.mediana.toFixed(3) : '—') +
      '  anc→psf ' + b.dmag_anclaje_psf.mediana.toFixed(3) +
      '  psf→bil ' + b.dmag_psf_bilineal.mediana.toFixed(3) +
      '  bil→mez ' + b.dmag_bilineal_mezcla.mediana.toFixed(3) +
      '  mez→op ' + b.dmag_mezcla_op.mediana.toFixed(3) +
      '  wk<1: ' + (100 * b.fracWkMenor).toFixed(0) + ' %');
    var mF = b.medianasFlujo.mag;
    console.log('      medianas incondicionales (mag): crudo ' +
      (mF.crudoNeto != null ? mF.crudoNeto.toFixed(2) : '∞') + ' → anc ' +
      (mF.anclado != null ? mF.anclado.toFixed(2) : '∞') + ' → psf ' +
      (mF.psf != null ? mF.psf.toFixed(2) : '∞') + ' → bil ' +
      (mF.bilineal != null ? mF.bilineal.toFixed(2) : '∞') + ' → mez ' +
      (mF.mezcla != null ? mF.mezcla.toFixed(2) : '∞') + '  (umbral ' + M.umbralSB.toFixed(2) + ')');
  });
  console.log('\n  salidas en ' + OUT);
  process.exit(fallos ? 1 : 0);
}
function dNaNok(d, fwhmPx) { return d > 3 * Math.max(1, fwhmPx); }

/* ───────────────────── CONTRAFACTUALES (Tarea 2, solo harness) ───────────────────── */
function contrafactual(P, Ibase, rois, cf) {
  var W = P.W, H = P.H, n = CFG.SIZE * CFG.SIZE;
  var Mbase = medir(Ibase, P, rois);
  var shaBase = { anc: sha1(Ibase.stAnc), psf: sha1(Ibase.stPsf), bil: sha1(Ibase.stBil) };
  var I2 = null, detalles = {};

  if (cf === 's1' || cf === 'sdebil') {
    var s2 = 1;
    if (cf === 'sdebil') {
      /* s recalibrada SOLO sobre píxeles de señal débil (crudo en cielo+1σ..cielo+3σ) */
      var obj2 = 0, Iw2 = 0, Ip2 = 0;
      for (var i = 0; i < P.anc.length; i++) {
        var v = P.anc[i];
        if (v !== v) continue;
        var crudo = P.limpio[i];
        if (!(crudo >= P.cieloP + P.sigmaP && crudo <= P.cieloP + 3 * P.sigmaP)) continue;
        obj2 += v; Iw2 += P.peso[i] * v; Ip2 += (1 - P.peso[i]) * P.perfil[i];
      }
      s2 = Iw2 > 0 ? Math.max(0, (obj2 - Ip2) / Iw2) : 1;
    }
    detalles = { sProduccion: P.parche.escalaMezcla, sContrafactual: s2 };
    I2 = pintarInstr(P.parche, P.o, { s: s2 });
    /* contaminación: anc/psf/bil deben quedar idénticas */
    exige(sha1(I2.stAnc) === shaBase.anc && sha1(I2.stPsf) === shaBase.psf &&
          sha1(I2.stBil) === shaBase.bil, 'CF-s no contamina anclaje/PSF/bilineal (SHA idénticos)');
  } else if (cf === 'cielo' || cf === 'suelo') {
    var cielo2 = P.cieloP, sigma2 = P.sigmaP;
    if (cf === 'cielo') {
      /* cielo por anillos elípticos exteriores 2–3 × d_μ25, mediana robusta */
      var ejes = window.BitacoraPS1.ps1EjesArcmin(P.comps, P.gal.ba);
      var r25As = (ejes && ejes.a > 0 ? ejes.a : P.gal.ladoArcmin / 2) * 60 / 2; // semieje mayor ″
      var aAf = P.fSim.afin, esc = P.F.escalaAs;
      var cs = Math.cos(P.gal.pa * Math.PI / 180), sn = Math.sin(P.gal.pa * Math.PI / 180);
      var muestras = [];
      for (var y3 = 0; y3 < H; y3++) for (var x3 = 0; x3 < W; x3++) {
        var dx3 = x3 - aAf.cx, dy3 = y3 - aAf.cy;
        var este3 = aAf.ex * dx3 + aAf.ey * dy3, norte3 = aAf.nx * dx3 + aAf.ny * dy3;
        var eje3 = norte3 * cs + este3 * sn, tra3 = -norte3 * sn + este3 * cs;
        var rE = Math.sqrt(eje3 * eje3 + Math.pow(tra3 / P.gal.ba, 2)) / r25As;
        if (rE >= 2 && rE <= 3) {
          var v3 = P.limpio[y3 * W + x3];
          if (v3 === v3) muestras.push(v3);
        }
      }
      if (muestras.length > 500) {
        cielo2 = mediana(muestras);
        var dev = muestras.map(function (v4) { return Math.abs(v4 - cielo2); });
        sigma2 = 1.4826 * mediana(dev);
      }
      detalles = { cieloProduccion: P.cieloP, cieloAnillos: cielo2,
                   sigmaProduccion: P.sigmaP, sigmaAnillos: sigma2,
                   muestrasAnillo: muestras.length };
    }
    /* re-anclaje en el harness (réplica de ps1AnclarACatalogo con cielo/regla CF) */
    var suelo2 = cielo2 + PS1.kRuido * sigma2, corte2 = cielo2 - PS1.kAusencia * sigma2;
    if (cf === 'suelo') {
      /* CF-suelo (motivado por la auditoría): se clasifica con el suelo de
         producción pero se deja de RECORTAR el pedestal 1,5σ a la señal real:
         neto = v − cielo si v ≥ suelo; 0 si no. NaN con el corte de producción. */
      suelo2 = P.suelo; corte2 = P.cieloP - PS1.kAusencia * P.sigmaP;
      detalles = { regla: 'v>=suelo → v−cielo; corte NaN intacto', suelo: P.suelo, cielo: P.cieloP };
    }
    var anc2 = new Float32Array(P.limpio.length), suma2 = 0;
    var nanAntes = 0, nanDespues = 0;
    for (var i4 = 0; i4 < P.limpio.length; i4++) {
      if (!(P.anc[i4] === P.anc[i4])) nanAntes++;
      var v5 = P.limpio[i4];
      if (v5 !== v5 || v5 < corte2) { anc2[i4] = NaN; nanDespues++; continue; }
      var d5;
      if (cf === 'suelo') d5 = v5 >= suelo2 ? v5 - P.cieloP : 0;
      else d5 = Math.max(0, v5 - suelo2);
      anc2[i4] = d5; suma2 += d5;
    }
    var radioEnRe = (P.gal.reArcsec > 0) ? (P.gal.ladoArcmin * 60 / 2) / P.gal.reArcsec : Infinity;
    var frac2 = window.BitacoraPS1.ps1FraccionLuz(P.gal.n, radioEnRe);
    var Ftotal2 = Math.pow(10, -0.4 * P.gal.magV) * (frac2 > 0.02 ? frac2 : 0.02);
    var k2 = Ftotal2 / (suma2 * P.F.escalaAs * P.F.escalaAs);
    for (var i5 = 0; i5 < anc2.length; i5++) anc2[i5] *= k2;
    detalles.kanc2 = k2; detalles.nanAntes = nanAntes; detalles.nanDespues = nanDespues;
    var peso2 = window.BitacoraPS1.ps1PesoImagen(anc2, W, H, P.F.escalaAs);
    var parche2 = {};
    for (var kK in P.parche) if (Object.prototype.hasOwnProperty.call(P.parche, kK)) parche2[kK] = P.parche[kK];
    parche2.datos = anc2; parche2.peso = peso2;
    parche2.escalaMezcla = window.BitacoraPS1.ps1EscalaMezcla(anc2, peso2, P.perfil);
    parche2.psfD = null; parche2.psfDatos = null;
    detalles.sContrafactual = parche2.escalaMezcla;
    I2 = pintarInstr(parche2, P.o);
  } else if (cf === 'psf') {
    /* convolución sin ponderación de NaN: relleno previo por isofotas elípticas
       (mediana por corona de radio elíptico, bins de 2 px) SOLO para convolucionar;
       máscara NaN restaurada después, como producción. */
    var aAf2 = P.fSim.afin;
    var cs2 = Math.cos(P.gal.pa * Math.PI / 180), sn2 = Math.sin(P.gal.pa * Math.PI / 180);
    var rEl = new Float32Array(W * H);
    for (var y6 = 0; y6 < H; y6++) for (var x6 = 0; x6 < W; x6++) {
      var dx6 = x6 - aAf2.cx, dy6 = y6 - aAf2.cy;
      var este6 = aAf2.ex * dx6 + aAf2.ey * dy6, norte6 = aAf2.nx * dx6 + aAf2.ny * dy6;
      var eje6 = norte6 * cs2 + este6 * sn2, tra6 = -norte6 * sn2 + este6 * cs2;
      rEl[y6 * W + x6] = Math.sqrt(eje6 * eje6 + Math.pow(tra6 / P.gal.ba, 2));
    }
    var maxR = 0;
    for (var i6 = 0; i6 < rEl.length; i6++) if (rEl[i6] > maxR) maxR = rEl[i6];
    var BIN = 2 * P.F.escalaAs, nb = Math.ceil(maxR / BIN) + 1;
    var bins = new Array(nb);
    for (var b6 = 0; b6 < nb; b6++) bins[b6] = [];
    for (var i7 = 0; i7 < rEl.length; i7++) {
      if (P.anc[i7] === P.anc[i7]) bins[Math.floor(rEl[i7] / BIN)].push(P.anc[i7]);
    }
    var medBin = new Float32Array(nb);
    for (var b7 = 0; b7 < nb; b7++) medBin[b7] = bins[b7].length ? mediana(bins[b7]) : 0;
    var relleno = new Float32Array(P.anc.length);
    var rellenados = 0;
    for (var i8 = 0; i8 < P.anc.length; i8++) {
      if (P.anc[i8] === P.anc[i8]) relleno[i8] = P.anc[i8];
      else { relleno[i8] = medBin[Math.floor(rEl[i8] / BIN)]; rellenados++; }
    }
    var escP2 = (P.parche.ladoArcmin * 60) / W;
    var conv = window.BitacoraPS1.ps1PsfParche(relleno, W, H, escP2, CFG.D, true);
    var datos2 = new Float32Array(conv.length);
    for (var i9 = 0; i9 < conv.length; i9++) {
      datos2[i9] = (P.anc[i9] === P.anc[i9]) ? conv[i9] : NaN;   // máscara restaurada
    }
    detalles = { rellenados: rellenados, binAs: BIN };
    I2 = pintarInstr(P.parche, P.o, { datosPsf: datos2 });
    exige(sha1(I2.stAnc) === shaBase.anc, 'CF-psf no contamina el anclaje (SHA idéntico)');
  } else {
    console.error('cf desconocido: ' + cf); process.exit(2);
  }

  var M2 = medir(I2, P, rois);
  /* recuperación del déficit por ROI + invariantes fotométricos */
  var comp = { rois: {}, fotometria: {
    dFlujo020_pre: (M2.flujo020_pre - Mbase.flujo020_pre) / Mbase.flujo020_pre,
    dFlujo020_post: Mbase.flujo020_post > 0 ? (M2.flujo020_post - Mbase.flujo020_post) / Mbase.flujo020_post : 0,
    dFlujoCampo_pre: (M2.flujoCampo_pre - Mbase.flujoCampo_pre) / Mbase.flujoCampo_pre,
    CminIgual: M2.Cmin === Mbase.Cmin, nivelFondoIgual: M2.nivelFondo === Mbase.nivelFondo,
    rangoIgual: M2.rango === Mbase.rango
  } };
  rois.forEach(function (rr) {
    var b = Mbase.rois[rr.nombre], v = M2.rois[rr.nombre];
    if (!b) return;
    comp.rois[rr.nombre] = {
      tipo: rr.tipo,
      fracNegrosBase: b.fracNegros, fracNegrosCF: v.fracNegros,
      dMagPre: (v.magPreMediana === v.magPreMediana && b.magPreMediana === b.magPreMediana)
        ? v.magPreMediana - b.magPreMediana : NaN,
      dNivelMediana: v.nivelMediana - b.nivelMediana
    };
  });
  /* déficit recuperado en interbrazos: mediana de (anc − mez) antes vs después */
  var recArr = [];
  rois.filter(function (rr) { return rr.tipo === 'interbrazo' || rr.tipo === 'puente'; })
    .forEach(function (rr) {
      var idx = idxRoi(Ibase, rr, n), db = [], dc = [];
      idx.forEach(function (i3) {
        if (!(Ibase.stAnc[i3] > 0)) return;
        db.push(Ibase.stAnc[i3] - Ibase.fPre[i3]);
        dc.push(I2.stAnc[i3] > 0 ? I2.stAnc[i3] - I2.fPre[i3] : NaN);
      });
      var mb = mediana(db), mc = mediana(dc.filter(function (v6) { return v6 === v6; }));
      comp.rois[rr.nombre].deficitBase = mb;
      comp.rois[rr.nombre].deficitCF = mc;
      comp.rois[rr.nombre].recuperacion = mb > 0 ? (mb - mc) / mb : NaN;
      if (rr.tipo === 'interbrazo') recArr.push(mb > 0 ? (mb - mc) / mb : NaN);
    });
  comp.recuperacionInterbrazoMediana = mediana(recArr.filter(function (v7) { return v7 === v7; }));

  /* RMS de nivel contra base y PNGs antes/después/diferencia */
  var rms = 0, nn = 0;
  for (var i10 = 0; i10 < n; i10++) {
    var d10 = M2.E[i10] - Mbase.E[i10];
    rms += d10 * d10; nn++;
  }
  comp.rmsNivel = Math.sqrt(rms / nn);
  pngGris('cf_' + cf + '_antes', Mbase.E, CFG.SIZE, CFG.SIZE);
  pngGris('cf_' + cf + '_despues', M2.E, CFG.SIZE, CFG.SIZE);
  var dif = new Float32Array(n);
  for (var i11 = 0; i11 < n; i11++) dif[i11] = 128 + 4 * (M2.E[i11] - Mbase.E[i11]);
  pngGris('cf_' + cf + '_diferencia', dif, CFG.SIZE, CFG.SIZE);

  var salida = { obj: OBJ, cf: cf, fecha: '2026-08-15', cfg: CFG, detalles: detalles,
                 comparacion: comp };
  fs.writeFileSync(path.join(OUT, 'cf_' + cf + '.json'), JSON.stringify(salida, null, 1));
  console.log('\n  ' + JSON.stringify(detalles));
  console.log('  recuperación interbrazo (mediana): ' +
    (100 * comp.recuperacionInterbrazoMediana).toFixed(1) + ' %');
  console.log('  Δflujo 0–20″ pre: ' + (100 * comp.fotometria.dFlujo020_pre).toFixed(3) +
    ' %  Δcampo pre: ' + (100 * comp.fotometria.dFlujoCampo_pre).toFixed(3) + ' %  RMS nivel: ' +
    comp.rmsNivel.toFixed(3));
  Object.keys(comp.rois).forEach(function (nom) {
    var r3 = comp.rois[nom];
    console.log('  [' + nom + ' ' + r3.tipo + '] negros ' + (100 * r3.fracNegrosBase).toFixed(1) +
      ' % → ' + (100 * r3.fracNegrosCF).toFixed(1) + ' %  Δmag pre ' +
      (r3.dMagPre === r3.dMagPre ? r3.dMagPre.toFixed(3) : '—') +
      (r3.recuperacion != null && r3.recuperacion === r3.recuperacion
        ? '  recuperación ' + (100 * r3.recuperacion).toFixed(1) + ' %' : ''));
  });
  console.log('\n  salidas en ' + OUT);
  process.exit(fallos ? 1 : 0);
}
