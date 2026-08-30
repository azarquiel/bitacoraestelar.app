#!/usr/bin/env node
/* FASE 1 — Diagnóstico de depresiones negras interbrazos (M51; controles M104/M81).
   Contraste de hipótesis:
     H-A geometría de escena (negro fuera de la elipse μ=25, rampa normal)
     H-B sobresustracción residual (v válido en cielo−2σ..cielo propagado)
     H-C curva de tono (el mapeo a 8 bits aplasta señal lineal positiva)

   SOLO diagnóstico: no toca producción. Réplica instrumentada del bucle de
   ps1PintarParche VIGENTE (soporte local, c99b72c) con paridad bit a bit
   comprobada contra window.BitacoraPS1.ps1PintarParche en cada ejecución.

   NOTA DE PREMISA: PS1.opacidadInternaEscena está APAGADA en producción, así
   que NO existe la excepción «dentro de escena → op = 1». La clase (b) del mapa
   (op<1 dentro de escena) no es un bug con la bandera apagada: es el
   comportamiento vigente. El harness la mide y la reporta igualmente.

   Uso (un comando por experimento; determinista, parche cacheado en disco):
     node scripts/harness_interbrazos.js --obj M51          # Tarea 0+1+2+3 completas
     node scripts/harness_interbrazos.js --obj M104         # control cruzado
     node scripts/harness_interbrazos.js --obj M81          # control cruzado
   Opciones: --D mm --M aumentos --sqm v --delta niveles (defecto 457.2/190/21.2/2)
             --rois fichero.json (defecto scripts/rois_M51.json solo para M51)
   Salidas: .scratch/interbrazos/<obj>/  (PNGs, CSVs, baseline JSON, resumen) */
'use strict';

var fs = require('fs'), path = require('path'), zlib = require('zlib');
var RAIZ = path.join(__dirname, '..');

global.window = {};
require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-ps1.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js'));
var R = global.window.BitacoraGaiaRender;
var CAT = global.window.BITACORA_GALAXIAS;
var FOT = R.fot, PS1 = window.BitacoraPS1.cfg;
var B = require('./lib_bajar_parche.js')(R);

/* ── configuración (fija y volcada en el baseline) ── */
function arg(nombre, defecto) {
  var i = process.argv.indexOf('--' + nombre);
  return (i >= 0 && process.argv[i + 1] != null) ? process.argv[i + 1] : defecto;
}
var OBJ = String(arg('obj', 'M51'));
var CFG = {
  D: parseFloat(arg('D', '457.2')),      // mm (misma config que diagnostico-oscuros)
  M: parseFloat(arg('M', '190')),        // aumentos
  sqm: parseFloat(arg('sqm', '21.2')),
  delta: parseInt(arg('delta', '2'), 10), // δ: niveles de pantalla sobre el fondo
  SIZE: 720, AFOV: 70
};
var OBJS = {
  M51:  { cat: 'NGC 5194', csv: 'gaia_ngc5194.csv' },
  M81:  { cat: 'NGC 3031', csv: 'gaia_ngc3031.csv' },
  M104: { cat: 'NGC 4594', csv: 'gaia_ngc4594.csv' }
};
if (!OBJS[OBJ]) { console.error('objeto desconocido: ' + OBJ); process.exit(2); }
var OUT = path.join(RAIZ, '.scratch', 'interbrazos', OBJ);
fs.mkdirSync(OUT, { recursive: true });
var IN_GAIA = path.join(RAIZ, '.scratch', 'quitar-general');
var ROIS_FICH = arg('rois', OBJ === 'M51' ? path.join(RAIZ, 'scripts', 'rois_M51.json') : null);

var fallos = 0;
function exige(c, t) { if (c) console.log('  ok   ' + t); else { fallos++; console.error('  FALLA: ' + t); } }

/* ── PNG mínimo (zlib propio de Node; sin dependencias) ── */
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
function png(nombre, rgb, W, H) {          // rgb: Uint8Array W*H*3
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

/* ── utilidades varias ── */
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
function sigmaRobusta(m, med) {
  var d = m.map(function (v) { return Math.abs(v - med); });
  return 1.4826 * mediana(d);
}
/* Mann-Whitney U (aprox. normal con corrección de empates; muestras grandes). */
function mannWhitney(a, b) {
  var todos = [], i;
  for (i = 0; i < a.length; i++) todos.push([a[i], 0]);
  for (i = 0; i < b.length; i++) todos.push([b[i], 1]);
  todos.sort(function (p, q) { return p[0] - q[0]; });
  var n = todos.length, rangos = new Float64Array(n), empatesT = 0;
  i = 0;
  while (i < n) {
    var j = i;
    while (j + 1 < n && todos[j + 1][0] === todos[i][0]) j++;
    var r = (i + j) / 2 + 1, t = j - i + 1;
    if (t > 1) empatesT += t * t * t - t;
    for (var k = i; k <= j; k++) rangos[k] = r;
    i = j + 1;
  }
  var Ra = 0;
  for (i = 0; i < n; i++) if (todos[i][1] === 0) Ra += rangos[i];
  var na = a.length, nb = b.length;
  var U = Ra - na * (na + 1) / 2;
  var mu = na * nb / 2;
  var sig = Math.sqrt(na * nb / 12 * ((n + 1) - empatesT / (n * (n - 1))));
  var z = sig > 0 ? (U - mu) / sig : 0;
  return { U: U, z: z };
}
// Mismo radio elíptico que ps1FuenteEnEscena (ps1RadioEje no está exportado).
function radioEje(cs, sn, norte, este, q) {
  var eje = norte * cs + este * sn, tra = -norte * sn + este * cs;
  return Math.sqrt(eje * eje + (tra / q) * (tra / q));
}
// d/d_μ25 mínima sobre los componentes de la escena, en coordenadas de PARCHE.
function distEscena(escena, a, x, y) {
  var d = Infinity;
  for (var i = 0; i < escena.length; i++) {
    var c = escena[i], dx = x - c.cx, dy = y - c.cy;
    var este = a.ex * dx + a.ey * dy, norte = a.nx * dx + a.ny * dy;
    var r = radioEje(c.cos, c.sin, norte, este, c.ba) / c.r25As;
    if (r < d) d = r;
  }
  return d;
}

/* ── blur y adaptación local sin canvas (copiados de harness_diagnostico_oscuros) ── */
function blurJS(v, radio, W) {
  var sigma = radio / 2, rad = Math.max(1, Math.ceil(2.5 * sigma)), m = 2 * rad + 1;
  var k = new Float64Array(m), s = 0, i;
  for (i = 0; i < m; i++) { k[i] = Math.exp(-((i - rad) * (i - rad)) / (2 * sigma * sigma)); s += k[i]; }
  for (i = 0; i < m; i++) k[i] /= s;
  var H = v.length / W, tmp = new Float32Array(v.length), out = new Float32Array(v.length);
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
    var acc = 0;
    for (var j = 0; j < m; j++) acc += k[j] * v[y * W + Math.max(0, Math.min(W - 1, x + j - rad))];
    tmp[y * W + x] = acc;
  }
  for (var y2 = 0; y2 < H; y2++) for (var x2 = 0; x2 < W; x2++) {
    var acc2 = 0;
    for (var j2 = 0; j2 < m; j2++) acc2 += k[j2] * tmp[Math.max(0, Math.min(H - 1, y2 + j2 - rad)) * W + x2];
    out[y2 * W + x2] = acc2;
  }
  return out;
}
function adaptacionJS(v, W) {
  var borroso = blurJS(v, Math.round(W / 60), W);
  var out = new Float32Array(v.length);
  for (var j = 0; j < v.length; j++) {
    var dif = v[j] - borroso[j];
    out[j] = v[j] + R.realceDetalle(dif, dif >= 0 ? 0.5 : 0.5 * FOT.REALCE_OSCURO);
  }
  return out;
}

/* ── réplica instrumentada del bucle VIGENTE de ps1PintarParche ──
   (bilineal + soporte local + opacidadInternaEscena apagada). Paridad bit a
   bit contra producción comprobada abajo. Vuelca por píxel de lienzo todas
   las etapas y las coordenadas de parche (fx, fy). */
function pintarInstr(parche, o) {
  var SIZE = CFG.SIZE;
  var escv = SIZE / (o.arcmin / 60);
  var cos0 = Math.cos(o.dec0 * Math.PI / 180);
  var dra = (((parche.ra - o.ra0 + 540) % 360) - 180) * cos0;
  var cx = SIZE / 2 - dra * escv, cy = SIZE / 2 - (parche.dec - o.dec0) * escv;
  var ladoPx = (parche.ladoArcmin / 60) * escv;
  var n = SIZE * SIZE;
  var res = {
    fPre: new Float32Array(n), fPost: new Float32Array(n),
    wMap: new Float32Array(n), fmMap: new Float32Array(n),
    opMap: new Float32Array(n).fill(NaN), sopMap: new Float32Array(n),
    fx: new Float32Array(n).fill(NaN), fy: new Float32Array(n).fill(NaN),
    pintado: new Uint8Array(n), ctx: null,
    x0: 0, x1: -1, y0: 0, y1: -1, cx: cx, cy: cy, escv: escv
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
  var haloPx = window.BitacoraPS1.ps1RadioHaloAs(comps) * pxPorAs;
  var alcance = Math.max(ladoPx / 2, haloPx);
  var escParche = (parche.ladoArcmin * 60) / parche.ancho;
  var D = o.apertura;
  var datos = c ? window.BitacoraPS1.ps1DatosConPsf(parche, escParche, D) : parche.datos;
  res.datosPsf = datos;
  var soporte = c ? window.BitacoraPS1.ps1SoporteLocal(datos, parche.ancho, parche.alto, escParche) : null;
  res.soporte = soporte;
  var x0 = Math.max(0, Math.floor(cx - alcance)), x1 = Math.min(SIZE - 1, Math.ceil(cx + alcance));
  var y0 = Math.max(0, Math.floor(cy - alcance)), y1 = Math.min(SIZE - 1, Math.ceil(cy + alcance));
  res.x0 = x0; res.x1 = x1; res.y0 = y0; res.y1 = y1;
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
      var acc = 0, cubierto = 0, accW = 0;
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
          accW += pe * wv;
          cubierto += pe;
        }
      }
      if (!(cubierto > 0)) continue;
      var f = acc / cubierto;
      res.wMap[i] = accW / cubierto;
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

/* nivel de pantalla de un píxel de galaxia (réplica de pintarFot con
   difusoMask: rampa ya aplicada, s=1, gamma completa, techo realceMax). */
function nivelPantalla(fPost, c) {
  var out = new Float32Array(fPost.length);
  for (var i = 0; i < fPost.length; i++) {
    var F = fPost[i];
    if (F > 0 && FOT.GAMMA_PERCEPTUAL !== 1) F = R.realzarPerceptual(F, c.Fcielo, c.rango, 0, PS1.realceMax);
    out[i] = c.nivelFondo + R.valorDeFlujo(F, c.Fcielo, c.rango);
  }
  return out;
}
/* Mapeo diagnóstico H-C: asinh sobre el flujo lineal, más resolución en
   sombras que la curva log de producción. Solo visualización del harness. */
function nivelAsinh(fPost, c) {
  var out = new Float32Array(fPost.length), beta = 0.02;   // suaviza el codo
  var tope = Math.asinh(1 / beta);
  for (var i = 0; i < fPost.length; i++) {
    var r = fPost[i] / c.Fcielo;
    out[i] = c.nivelFondo + (255 - c.nivelFondo) * Math.asinh(Math.min(1, r) / beta) / tope;
  }
  return out;
}
/* Falso color de magnitud sobre cielo: azul (débil, +5 mag bajo umbral) → rojo. */
function falsoColorMag(fPre, c, umbral, W, H) {
  var rgb = new Uint8Array(W * H * 3);
  for (var i = 0; i < W * H; i++) {
    var f = fPre[i];
    if (!(f > 0)) continue;
    var sb = -2.5 * Math.log10(f);
    var t = Math.max(0, Math.min(1, (umbral + 3 - sb) / 6));   // umbral+3 .. umbral−3
    rgb[i * 3] = Math.round(255 * t);
    rgb[i * 3 + 1] = Math.round(80 * (1 - Math.abs(2 * t - 1)));
    rgb[i * 3 + 2] = Math.round(255 * (1 - t));
  }
  return rgb;
}

/* ═════════════════════════ ejecución ═════════════════════════ */
var O = OBJS[OBJ];
var gal = galDeFila(filaCat(O.cat));
console.log('═══ ' + OBJ + ' (' + gal.nombre + ')  D=' + CFG.D + 'mm M=' + CFG.M +
  'x sqm=' + CFG.sqm + ' δ=' + CFG.delta + ' niveles ═══');
console.log('  opacidadInternaEscena=' + PS1.opacidadInternaEscena +
  ' confianzaLocalNaN=' + PS1.confianzaLocalNaN + ' deltaExp=' + PS1.deltaExp);

B.bajar(gal.ra, gal.dec, gal.ladoArcmin, PS1.salida).then(function (F) {
  var W = F.ancho, H = F.alto;
  var fSim = { ancho: W, alto: H, escalaAs: F.escalaAs, wcs: F.wcs || null };
  fSim.afin = window.BitacoraPS1.ps1AfinParche(fSim, gal);
  var estrellas = leerGaia(O.csv);
  var enPx = window.BitacoraPS1.ps1EstrellasEnPixeles(fSim, gal, estrellas);
  var vecinos = window.BitacoraPS1.ps1GalaxiasDelCampo(CAT, gal.ra, gal.dec, gal.ladoArcmin);
  var escena = window.BitacoraPS1.ps1EscenaEnParche(fSim, gal, vecinos);

  /* etapa 3: quitar estrellas (producción) */
  var limpio = window.BitacoraPS1.ps1QuitarEstrellas(F.datos, W, H, enPx,
    { afin: fSim.afin, ba: gal.ba, pa: gal.pa, escena: escena });

  /* cielo y σ del parche limpio: los mismos que usa ps1AnclarACatalogo */
  var cieloP = window.BitacoraPS1.ps1Cielo(limpio, W, H);
  var sigmaP = window.BitacoraPS1.ps1SigmaCielo(limpio, W, H, cieloP);

  /* etapa 2: anclaje (corte NaN en cielo − kAusencia·σ) */
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

  /* paridad bit a bit con producción */
  var prod = new Float32Array(CFG.SIZE * CFG.SIZE);
  window.BitacoraPS1.ps1PintarParche(prod, parche, o);
  var I = pintarInstr(parche, o);
  var dmax = 0;
  for (var i = 0; i < prod.length; i++) dmax = Math.max(dmax, Math.abs(prod[i] - I.fPost[i]));
  exige(dmax === 0, 'réplica instrumentada = producción bit a bit (dmax=' + dmax + ')');
  var c = I.ctx, umbral = R.sbUmbralContraste(c);
  var SIZE = CFG.SIZE, n = SIZE * SIZE;

  /* invariante pedido por el protocolo: op<1 dentro de escena. Con la bandera
     apagada NO es invariante de producción; se mide y reporta igualmente. */
  var dEsc = new Float32Array(n).fill(NaN);
  for (i = 0; i < n; i++) {
    if (I.fx[i] === I.fx[i]) dEsc[i] = distEscena(escena, fSim.afin, I.fx[i], I.fy[i]);
  }
  var opBajaDentro = 0, pintadosDentro = 0;
  for (i = 0; i < n; i++) {
    if (!(dEsc[i] <= 1)) continue;
    if (!I.pintado[i] && !(I.fPre[i] > 0)) continue;
    pintadosDentro++;
    if (I.opMap[i] === I.opMap[i] && I.opMap[i] < 1) opBajaDentro++;
  }
  console.log('  [invariante protocolo] píxeles con flujo dentro de escena: ' + pintadosDentro +
    '; con op<1: ' + opBajaDentro + ' (' + (100 * opBajaDentro / Math.max(1, pintadosDentro)).toFixed(1) +
    ' %) — esperado >0 con opacidadInternaEscena=false');

  /* niveles de pantalla */
  var E = nivelPantalla(I.fPost, c);
  var Fad = adaptacionJS(E, SIZE);
  var Easinh = nivelAsinh(I.fPre, c);        // pre-opacidad: enseña la señal lineal
  var EasinhPost = nivelAsinh(I.fPost, c);   // post-opacidad: lo que llega al mapeo
  var fondoNivel = Math.round(c.nivelFondo);

  /* rectángulo envolvente de la GALAXIA en el lienzo: el de la elipse μ=25
     (dEsc ≤ 1). Con el rectángulo del parche entero la mitad del cielo del
     campo contaba como «negro» y ahogaba la estadística. */
  var bx0 = SIZE, bx1 = -1, by0 = SIZE, by1 = -1;
  for (i = 0; i < n; i++) {
    if (!(dEsc[i] <= 1)) continue;
    var xR = i % SIZE, yR = (i / SIZE) | 0;
    if (xR < bx0) bx0 = xR; if (xR > bx1) bx1 = xR;
    if (yR < by0) by0 = yR; if (yR > by1) by1 = yR;
  }
  if (bx1 < 0) { bx0 = I.x0; bx1 = I.x1; by0 = I.y0; by1 = I.y1; }

  /* ── mapa de clasificación del negro ──
     negro: nivel final E redondeado ≤ fondo + δ, dentro del rectángulo del
     parche y con coordenadas de parche válidas (0..W−1). Causa dominante por
     orden de etapa: (c) anclaje → (d) mezcla → (a)/(b) opacidad → (e) mapeo. */
  var clase = new Uint8Array(n);        // 0 no-negro, 1..5 = c,d,a,b,e
  var maskCond = new Uint8Array(n);     // bits: 1=c 2=d 4=a 8=b 16=e
  var cuenta = { negros: 0, a: 0, b: 0, c: 0, d: 0, e: 0 };
  var histD = new Float64Array(24);     // histograma d/d_μ25 de negros, paso 0.125, 0..3
  var negrosFuera = 0, negrosDentro = 0;
  for (var y = by0; y <= by1; y++) for (var x = bx0; x <= bx1; x++) {
    i = y * SIZE + x;
    var fx = I.fx[i], fy = I.fy[i];
    if (!(fx >= 0 && fx < W && fy >= 0 && fy < H)) continue;   // fuera del parche
    if (grisA(E[i]) > fondoNivel + CFG.delta) continue;
    cuenta.negros++;
    var kP = Math.round(fy) * W + Math.round(fx);
    var vRaw = limpio[kP];
    var esNaNanc = !(anc[kP] === anc[kP]);
    var condC = (vRaw === vRaw) && !esNaNanc && vRaw < cieloP;
    var nivelFm = c.nivelFondo + R.valorDeFlujo(
      FOT.GAMMA_PERCEPTUAL !== 1 && I.fmMap[i] > 0
        ? R.realzarPerceptual(I.fmMap[i], c.Fcielo, c.rango, 0, PS1.realceMax) : I.fmMap[i],
      c.Fcielo, c.rango);
    var condD = I.wMap[i] < 0.5 && grisA(nivelFm) <= fondoNivel + CFG.delta;
    var dentro = dEsc[i] <= 1;
    var opBaja = I.opMap[i] === I.opMap[i] && I.opMap[i] < 1;
    var condA = opBaja && !dentro, condB = opBaja && dentro;
    var m = (condC ? 1 : 0) | (condD ? 2 : 0) | (condA ? 4 : 0) | (condB ? 8 : 0);
    var cl;
    if (condC) { cl = 1; cuenta.c++; }
    else if (condD) { cl = 2; cuenta.d++; }
    else if (condA) { cl = 3; cuenta.a++; }
    else if (condB) { cl = 4; cuenta.b++; }
    else { cl = 5; cuenta.e++; m |= 16; }
    clase[i] = cl; maskCond[i] = m;
    if (dEsc[i] === dEsc[i]) {
      if (dentro) negrosDentro++; else negrosFuera++;
      var hb = Math.min(23, Math.floor(dEsc[i] / 0.125));
      histD[hb]++;
    }
  }

  /* ── PNGs diagnósticos ── */
  pngGris('render_E', E, SIZE, SIZE);
  pngGris('render_F_adaptada', Fad, SIZE, SIZE);
  pngGris('render_asinh_pre', Easinh, SIZE, SIZE);
  pngGris('render_asinh_post', EasinhPost, SIZE, SIZE);
  png('falso_color_mag', falsoColorMag(I.fPre, c, umbral, SIZE, SIZE), SIZE, SIZE);

  var COLORES = { 1: [255, 0, 255], 2: [255, 160, 0], 3: [60, 100, 255], 4: [255, 40, 40], 5: [0, 220, 220] };
  var rgb = new Uint8Array(n * 3);
  for (i = 0; i < n; i++) {
    var g = grisA(E[i]);
    var col = clase[i] ? COLORES[clase[i]] : [g, g, g];
    rgb[i * 3] = col[0]; rgb[i * 3 + 1] = col[1]; rgb[i * 3 + 2] = col[2];
  }
  // contornos μ25 ×1 (verde), ×1.1/×1.25/×1.5 (verdes apagados); solo visual
  var ESCALAS = [1, 1.1, 1.25, 1.5];
  for (i = 0; i < n; i++) {
    if (!(dEsc[i] === dEsc[i])) continue;
    for (var e2 = 0; e2 < ESCALAS.length; e2++) {
      if (Math.abs(dEsc[i] - ESCALAS[e2]) < 0.01) {
        var vI = e2 === 0 ? 255 : 140 - e2 * 25;
        rgb[i * 3] = 0; rgb[i * 3 + 1] = vI; rgb[i * 3 + 2] = 0;
      }
    }
  }
  png('mapa_clasificacion', rgb, SIZE, SIZE);

  var rgbE = new Uint8Array(n * 3);
  for (i = 0; i < n; i++) {
    var g3 = grisA(E[i]);
    rgbE[i * 3] = rgbE[i * 3 + 1] = rgbE[i * 3 + 2] = g3;
    if (dEsc[i] === dEsc[i]) {
      for (var e3 = 0; e3 < ESCALAS.length; e3++) {
        if (Math.abs(dEsc[i] - ESCALAS[e3]) < 0.01) {
          rgbE[i * 3] = 0; rgbE[i * 3 + 1] = e3 === 0 ? 255 : 140 - e3 * 25; rgbE[i * 3 + 2] = 0;
        }
      }
    }
  }
  png('render_contornos', rgbE, SIZE, SIZE);

  /* parche en su propia rejilla con los negros del lienzo marcados (para elegir
     y verificar ROIs en coordenadas de parche) */
  var topeV = (function () {
    var m = [];
    for (i = 0; i < anc.length; i += 7) if (anc[i] > 0) m.push(anc[i]);
    m.sort(function (a, b) { return a - b; });
    return m.length ? m[Math.floor(m.length * 0.98)] : 1;
  })();
  var rgbP = new Uint8Array(W * H * 3);
  for (i = 0; i < W * H; i++) {
    var vv = anc[i];
    var g2 = vv === vv ? grisA(255 * Math.log1p(Math.max(0, vv) / topeV * 20) / Math.log1p(20)) : 0;
    rgbP[i * 3] = rgbP[i * 3 + 1] = rgbP[i * 3 + 2] = g2;
    if (!(vv === vv)) { rgbP[i * 3] = 40; rgbP[i * 3 + 1] = 0; rgbP[i * 3 + 2] = 60; } // NaN violeta oscuro
  }
  for (i = 0; i < n; i++) {
    if (!clase[i]) continue;
    var pxP = Math.round(I.fx[i]), pyP = Math.round(I.fy[i]);
    if (pxP >= 0 && pxP < W && pyP >= 0 && pyP < H) {
      var col2 = COLORES[clase[i]], j2 = (pyP * W + pxP) * 3;
      rgbP[j2] = col2[0]; rgbP[j2 + 1] = col2[1]; rgbP[j2 + 2] = col2[2];
    }
  }

  /* ── ROIs (coordenadas de PARCHE) ── */
  var rois = null;
  if (ROIS_FICH && fs.existsSync(ROIS_FICH)) {
    rois = JSON.parse(fs.readFileSync(ROIS_FICH, 'utf8'));
    rois.cajas.forEach(function (rr) {
      for (var yy = rr.y0; yy <= rr.y1; yy++) for (var xx = rr.x0; xx <= rr.x1; xx++) {
        if (yy < 0 || yy >= H || xx < 0 || xx >= W) continue;
        if (yy === rr.y0 || yy === rr.y1 || xx === rr.x0 || xx === rr.x1) {
          var j3 = (yy * W + xx) * 3;
          rgbP[j3] = 0; rgbP[j3 + 1] = 255; rgbP[j3 + 2] = 0;
        }
      }
    });
  }
  png('parche_clasificacion', rgbP, W, H);

  var resumenRois = [];
  if (rois) {
    var csv = ['roi,tipo,x,y,fx,fy,v_crudo,v_crudo_sig,esNaN,v_anclado,v_psf,w,fm,f_mezcla,soporte,op,dentroEscena,dEsc,f_post,nivel_E,nivel_F,mag_mezcla,mag_post,clase,maskCond'];
    var NOMCLASE = ['', 'c', 'd', 'a', 'b', 'e'];
    rois.cajas.forEach(function (rr) {
      /* estadística cruda H-B en la rejilla del parche */
      var vs = [], enBanda = 0, prof = 0, validos = 0, nans = 0;
      for (var yy = rr.y0; yy <= rr.y1; yy++) for (var xx = rr.x0; xx <= rr.x1; xx++) {
        var v4 = limpio[yy * W + xx];
        if (!(v4 === v4)) { nans++; continue; }
        validos++;
        vs.push(v4 - cieloP);
        if (v4 < cieloP && v4 >= cieloP - PS1.kAusencia * sigmaP) {
          enBanda++; prof += (cieloP - v4) / sigmaP;
        }
      }
      var med = mediana(vs);
      /* píxeles de lienzo cuya proyección cae en la caja */
      var enLienzo = [], negrosRoi = 0, fueraEscRoi = 0;
      var clasesRoi = { c: 0, d: 0, a: 0, b: 0, e: 0 };
      for (var i5 = 0; i5 < n; i5++) {
        var fx5 = I.fx[i5], fy5 = I.fy[i5];
        if (!(fx5 >= rr.x0 && fx5 <= rr.x1 && fy5 >= rr.y0 && fy5 <= rr.y1)) continue;
        enLienzo.push(i5);
        if (clase[i5]) { negrosRoi++; clasesRoi[NOMCLASE[clase[i5]]]++; }
        if (!(dEsc[i5] <= 1)) fueraEscRoi++;
        var kP5 = Math.round(fy5) * W + Math.round(fx5);
        var vr = limpio[kP5];
        var y5 = (i5 / SIZE) | 0, x5 = i5 % SIZE;
        csv.push([rr.nombre, rr.tipo, x5, y5, fx5.toFixed(2), fy5.toFixed(2),
          vr === vr ? vr.toFixed(3) : 'NaN',
          vr === vr ? ((vr - cieloP) / sigmaP).toFixed(3) : 'NaN',
          anc[kP5] === anc[kP5] ? 0 : 1,
          anc[kP5] === anc[kP5] ? anc[kP5].toExponential(4) : 'NaN',
          I.datosPsf[kP5] === I.datosPsf[kP5] ? I.datosPsf[kP5].toExponential(4) : 'NaN',
          I.wMap[i5].toFixed(4), I.fmMap[i5].toExponential(4),
          I.fPre[i5].toExponential(4), I.sopMap[i5].toExponential(4),
          I.opMap[i5] === I.opMap[i5] ? I.opMap[i5].toFixed(4) : 'NaN',
          dEsc[i5] <= 1 ? 1 : 0, dEsc[i5] === dEsc[i5] ? dEsc[i5].toFixed(3) : 'NaN',
          I.fPost[i5].toExponential(4), E[i5].toFixed(2), Fad[i5].toFixed(2),
          I.fPre[i5] > 0 ? (-2.5 * Math.log10(I.fPre[i5])).toFixed(3) : '',
          I.fPost[i5] > 0 ? (-2.5 * Math.log10(I.fPost[i5])).toFixed(3) : '',
          NOMCLASE[clase[i5]], maskCond[i5]
        ].join(','));
      }
      resumenRois.push({
        nombre: rr.nombre, tipo: rr.tipo, caja: [rr.x0, rr.y0, rr.x1, rr.y1],
        pxParche: { validos: validos, nans: nans },
        crudo: { mediana: med, medianaSig: med / sigmaP, sigmaRob: sigmaRobusta(vs, med),
                 enBandaSobresustraccion: enBanda, fracBanda: validos ? enBanda / validos : 0,
                 profMediaSig: enBanda ? prof / enBanda : 0 },
        lienzo: { px: enLienzo.length, negros: negrosRoi, clases: clasesRoi,
                  fracNegros: enLienzo.length ? negrosRoi / enLienzo.length : 0,
                  fracFueraEscena: enLienzo.length ? fueraEscRoi / enLienzo.length : 0 },
        _vs: vs, _idx: enLienzo
      });
    });
    fs.writeFileSync(path.join(OUT, 'rois_pixeles.csv'), csv.join('\n') + '\n');
  }

  /* ── Tarea 2 (H-B): interbrazo contra cielo puro ── */
  var hb = null;
  if (rois) {
    var cieloRoi = resumenRois.filter(function (r5) { return r5.tipo === 'cielo'; })[0];
    var inter = resumenRois.filter(function (r5) { return r5.tipo === 'interbrazo'; });
    if (cieloRoi && inter.length) {
      var todosInter = [];
      inter.forEach(function (r6) { todosInter = todosInter.concat(r6._vs); });
      var mw = mannWhitney(todosInter, cieloRoi._vs);
      var medI = mediana(todosInter);
      /* propagación: déficit crudo → mezcla → opacidad, en los px de lienzo
         de las ROIs interbrazo cuyo píxel de parche crudo está bajo el cielo */
      var nBanda = 0, sumW = 0, sumOp = 0, sumFrac = 0;
      inter.forEach(function (r7) {
        r7._idx.forEach(function (i7) {
          var kP7 = Math.round(I.fy[i7]) * W + Math.round(I.fx[i7]);
          var v7 = limpio[kP7];
          if (!(v7 === v7) || !(v7 < cieloP) || !(anc[kP7] === anc[kP7])) return;
          nBanda++;
          sumW += I.wMap[i7];
          if (I.opMap[i7] === I.opMap[i7]) sumOp += I.opMap[i7];
          sumFrac += I.fPre[i7] > 0 && I.fmMap[i7] > 0 ? I.fPre[i7] / I.fmMap[i7] : 0;
        });
      });
      hb = {
        medianaInterbrazoSig: medI / sigmaP, medianaCieloSig: mediana(cieloRoi._vs) / sigmaP,
        mannWhitneyZ: mw.z, nInter: todosInter.length, nCielo: cieloRoi._vs.length,
        fracBandaInter: inter.reduce(function (s7, r8) { return s7 + r8.crudo.enBandaSobresustraccion; }, 0) /
                        inter.reduce(function (s8, r9) { return s8 + r9.pxParche.validos; }, 0),
        profMediaSig: inter.reduce(function (s9, rA) { return s9 + rA.crudo.profMediaSig * rA.crudo.enBandaSobresustraccion; }, 0) /
                      Math.max(1, inter.reduce(function (sA, rB) { return sA + rB.crudo.enBandaSobresustraccion; }, 0)),
        propagacion: { pxBanda: nBanda, wMedio: nBanda ? sumW / nBanda : 0,
                       opMedio: nBanda ? sumOp / nBanda : 0 }
      };
    }
  }

  /* ── Tarea 3 (H-C): ¿el mapeo aplasta señal lineal positiva? ── */
  var hc = { negros: cuenta.negros, conSenalLineal: 0, sinSenal: 0, aplastadosPorMapeo: 0 };
  for (i = 0; i < n; i++) {
    if (!clase[i]) continue;
    if (I.fPost[i] > 0) {
      hc.conSenalLineal++;
      // llega al mapeo con flujo y aún así ≤ fondo+δ: aplastado por la curva
      hc.aplastadosPorMapeo++;
    } else hc.sinSenal++;
  }
  hc.fracAplastados = cuenta.negros ? hc.aplastadosPorMapeo / cuenta.negros : 0;
  /* la misma cuenta ANTES de la opacidad: cuánta señal lineal existía en la
     mezcla (separa «la opacidad lo vació» de «nunca hubo señal») */
  hc.negrosConMezclaPositiva = 0;
  for (i = 0; i < n; i++) if (clase[i] && I.fPre[i] > 0) hc.negrosConMezclaPositiva++;

  /* ── Tarea 1 (H-A): geometría ── */
  var ha = {
    negros: cuenta.negros, fuera: negrosFuera, dentro: negrosDentro,
    fracFuera: (negrosFuera + negrosDentro) ? negrosFuera / (negrosFuera + negrosDentro) : 0,
    histDEsc: Array.prototype.slice.call(histD),
    histPaso: 0.125,
    fracBorde: 0
  };
  var enBorde = 0;
  for (i = 0; i < n; i++) if (clase[i] && dEsc[i] > 1 && dEsc[i] <= 1.5) enBorde++;
  ha.fracBorde = cuenta.negros ? enBorde / cuenta.negros : 0;
  if (rois) {
    ha.fracInterbrazoFueraEscena = (function () {
      var it = resumenRois.filter(function (rC) { return rC.tipo === 'interbrazo'; });
      var t = 0, f2 = 0;
      it.forEach(function (rD) { t += rD.lienzo.px; f2 += rD.lienzo.fracFueraEscena * rD.lienzo.px; });
      return t ? f2 / t : 0;
    })();
  }

  /* ── veredictos según los criterios del protocolo ── */
  function veredictoHA() {
    if (ha.fracFuera >= 0.7 && ha.fracBorde >= 0.5) return 'CONFIRMADA';
    if (ha.fracFuera >= 0.3) return 'PARCIAL';
    return 'DESCARTADA';
  }
  function veredictoHB() {
    if (!hb) return 'SIN ROIS';
    if (hb.medianaInterbrazoSig <= -1 && Math.abs(hb.mannWhitneyZ) > 3) return 'CONFIRMADA';
    if (hb.medianaInterbrazoSig >= 0) return 'DESCARTADA';
    return 'PARCIAL';
  }
  function veredictoHC() {
    if (hc.fracAplastados >= 0.5) return 'CONFIRMADA';
    if (hc.fracAplastados >= 0.2) return 'PARCIAL';
    return 'DESCARTADA';
  }

  var baseline = {
    obj: OBJ, gal: gal, cfg: CFG, fecha: '2026-08-15',
    flags: { opacidadInternaEscena: PS1.opacidadInternaEscena,
             confianzaLocalNaN: PS1.confianzaLocalNaN,
             deltaMin: PS1.deltaMin, deltaPlena: PS1.deltaPlena, deltaExp: PS1.deltaExp,
             kRuido: PS1.kRuido, kAusencia: PS1.kAusencia, H2C: !!FOT.H2C },
    parche: { ancho: W, alto: H, escalaAs: F.escalaAs, ladoArcmin: gal.ladoArcmin,
              cielo: cieloP, sigma: sigmaP, estrellas: enPx.length,
              escalaMezcla: parche.escalaMezcla, thetaIntArcmin: parche.thetaIntArcmin },
    ctx: { Fcielo: c.Fcielo, Cmin: c.Cmin, umbralSB: umbral, nivelFondo: c.nivelFondo,
           rango: c.rango, SBe: c.SBe },
    invarianteProtocolo: { pintadosDentroEscena: pintadosDentro, conOpMenor1: opBajaDentro,
      nota: 'con opacidadInternaEscena=false NO es invariante: es el comportamiento vigente' },
    clasificacion: cuenta,
    solape: (function () {   // co-ocurrencia de condiciones en los negros del rectángulo
      var s = { cYop: 0, dYop: 0, soloOp: 0, cSolo: 0, dSolo: 0 };
      for (var i9 = 0; i9 < n; i9++) {
        if (!clase[i9]) continue;
        var m9 = maskCond[i9], op9 = (m9 & 4) || (m9 & 8);
        if ((m9 & 1) && op9) s.cYop++;
        else if (m9 & 1) s.cSolo++;
        if ((m9 & 2) && op9) s.dYop++;
        else if (m9 & 2) s.dSolo++;
        if (op9 && !(m9 & 3)) s.soloOp++;
      }
      return s;
    })(),
    clasificacionPct: (function () {
      var t = Math.max(1, cuenta.negros), o2 = {};
      ['a', 'b', 'c', 'd', 'e'].forEach(function (k5) { o2[k5] = 100 * cuenta[k5] / t; });
      return o2;
    })(),
    HA: ha, HB: hb, HC: hc,
    veredictos: { HA: veredictoHA(), HB: veredictoHB(), HC: veredictoHC() },
    rois: resumenRois.map(function (rE) {
      return { nombre: rE.nombre, tipo: rE.tipo, caja: rE.caja, pxParche: rE.pxParche,
               crudo: rE.crudo, lienzo: rE.lienzo };
    })
  };
  fs.writeFileSync(path.join(OUT, 'baseline_interbrazos_' + OBJ + '.json'),
    JSON.stringify(baseline, null, 1));

  console.log('\n  negros (E ≤ fondo+' + CFG.delta + '): ' + cuenta.negros);
  console.log('  clasificación: c(anclaje)=' + cuenta.c + '  d(mezcla)=' + cuenta.d +
    '  a(op fuera)=' + cuenta.a + '  b(op dentro)=' + cuenta.b + '  e(mapeo)=' + cuenta.e);
  console.log('  H-A: fracción fuera de escena = ' + (100 * ha.fracFuera).toFixed(1) +
    ' % (borde 1.0–1.5: ' + (100 * ha.fracBorde).toFixed(1) + ' %) → ' + baseline.veredictos.HA);
  if (hb) {
    console.log('  H-B: mediana interbrazo = ' + hb.medianaInterbrazoSig.toFixed(2) +
      'σ (cielo ' + hb.medianaCieloSig.toFixed(2) + 'σ), MW z=' + hb.mannWhitneyZ.toFixed(1) +
      ', banda −2σ..0: ' + (100 * hb.fracBandaInter).toFixed(1) + ' % → ' + baseline.veredictos.HB);
  }
  console.log('  H-C: aplastados por el mapeo = ' + (100 * hc.fracAplastados).toFixed(1) +
    ' % (con mezcla positiva pre-op: ' + hc.negrosConMezclaPositiva + ') → ' + baseline.veredictos.HC);
  console.log('\n  salidas en ' + OUT);
  process.exit(fallos ? 1 : 0);
}).catch(function (e) { console.error(e); process.exit(2); });
