#!/usr/bin/env node
/* FASES 2 y 3 — Barridos del soporte de la rampa de opacidad. SOLO diagnóstico:
   no toca producción. Réplica del bucle VIGENTE de ps1PintarParche (bilineal +
   soporte local c99b72c, opacidadInternaEscena apagada), verificada bit a bit.

   FASE 2 (--escala S | --multi A+B): el soporte de media de caja recalculado a
   otra escala. Veredicto: H-D descartada (docs/ricco/soporte/).

   FASE 3 (--variante E1|E2): patrón NO DESTRUCTIVO
       op_final(x) = max( op_produccion_25(x), componente_variante(x) )
   con la rampa de producción intacta dentro del max. La misma pasada pinta los
   DOS renders (producción y variante): todas las diferencias (anillos, cielo,
   ROIs, RMS) se miden contra la producción de la propia corrida, que con la
   variante apagada es bit a bit la de ps1PintarParche.
     E1 (estadístico de orden): --variante E1 --percentil 90 --escala 100
        componente = Opacidad(percentil de la caja) sobre la rejilla del parche.
        Percentil por histograma deslizante de 256 niveles sobre magnitud en
        [umbral−8, umbral+4] (ancho de bin 0,047 mag; tolerancia ±0,024 mag).
        NaN y negativos entran como «sin señal» (bin 0), igual que producción.
     E2 (propagación de opacidad): --variante E2 --decaimiento exp --alcance 100
        componente(x) = max_y op_rampa25(y)·k(dist), k exp(−3d/L) o max(0,1−d/L),
        por chamfer de dos pasadas ×2 (métrica chamfer ≈ euclídea; verificación
        contra la definición directa en una ROI, tolerancia reportada). Los NaN
        no aportan ni reciben opacidad (la distancia es euclídea, sin caminos).
     --calientes N (solo sensibilidad E1, exploratoria): inyecta N píxeles
        sintéticos a nivel p99,9 en una COPIA del parche (mezcla y componente
        los ven, como un caliente real); desactiva el asserto de SHA-1.

   Uso (un comando por objeto/variante/parámetros; determinista, parche cacheado):
     node scripts/harness_soporte_rampa.js --obj M51 --escala 25          # paridad
     node scripts/harness_soporte_rampa.js --obj M51 --variante E1 --percentil 90 --escala 100
     node scripts/harness_soporte_rampa.js --obj M101 --variante E2 --decaimiento exp --alcance 100
   Objetos: M51 M81 M104 M101 NGC205.
   Opciones: --D mm --M x --sqm v --delta niveles (defecto 457.2/190/21.2/2)
   Salidas: .scratch/soporte/<obj>/  (JSON por corrida, PNGs, E_s25.bin) */
'use strict';

var fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
var RAIZ = path.join(__dirname, '..');

global.window = {};
require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js'));
var R = global.window.BitacoraGaiaRender;
var CAT = global.window.BITACORA_GALAXIAS;
var FOT = R.fot, PS1 = R.ps1;
var B = require('./lib_bajar_parche.js')(R);

function arg(nombre, defecto) {
  var i = process.argv.indexOf('--' + nombre);
  return (i >= 0 && process.argv[i + 1] != null) ? process.argv[i + 1] : defecto;
}
var OBJ = String(arg('obj', 'M51'));
var CFG = {
  D: parseFloat(arg('D', '457.2')), M: parseFloat(arg('M', '190')),
  sqm: parseFloat(arg('sqm', '21.2')), delta: parseInt(arg('delta', '2'), 10),
  SIZE: 720, AFOV: 70
};
var VARIANTE = arg('variante', null);            // null | E1 | E2
var PCT = parseFloat(arg('percentil', '90'));
var DECAI = String(arg('decaimiento', 'exp'));   // exp | lin
var ALCANCE = parseFloat(arg('alcance', '100')); // arcsec intrínsecos (E2)
var CALIENTES = parseInt(arg('calientes', '0'), 10);
/* escalas del soporte, en arcsec INTRÍNSECOS (como PS1.mezclaCajaAs) */
var MULTI = arg('multi', null);
var ESCALAS = MULTI ? MULTI.split('+').map(Number) : [parseFloat(arg('escala', '25'))];
var ETIQ = VARIANTE === 'E1' ? 'E1p' + PCT + 's' + ESCALAS[0]
         : VARIANTE === 'E2' ? 'E2' + DECAI + 'a' + ALCANCE
         : MULTI ? 'm' + MULTI : 's' + ESCALAS[0];
if (CALIENTES) ETIQ += 'cal' + CALIENTES;
var ES_BASE = !VARIANTE && !MULTI && ESCALAS.length === 1 &&
              ESCALAS[0] === PS1.mezclaCajaAs && !CALIENTES;

var OBJS = {
  M51:    { cat: 'NGC 5194', csv: 'gaia_ngc5194.csv' },
  M81:    { cat: 'NGC 3031', csv: 'gaia_ngc3031.csv' },
  M104:   { cat: 'NGC 4594', csv: 'gaia_ngc4594.csv' },
  M101:   { cat: 'NGC 5457', csv: 'gaia_ngc5457.csv' },
  NGC205: { cat: 'NGC 205',  csv: 'gaia_ngc205.csv' }
};
if (!OBJS[OBJ]) { console.error('objeto desconocido: ' + OBJ); process.exit(2); }
var OUT = path.join(RAIZ, '.scratch', 'soporte', OBJ);
fs.mkdirSync(OUT, { recursive: true });
var IN_GAIA = path.join(RAIZ, '.scratch', 'quitar-general');
var ROIS_FICH = OBJ === 'M51' ? path.join(RAIZ, 'scripts', 'rois_M51.json')
              : OBJ === 'M101' ? path.join(RAIZ, 'scripts', 'rois_M101.json') : null;
var BASE_F1 = path.join(RAIZ, 'docs', 'ricco', 'interbrazos', 'baseline_interbrazos_' + OBJ + '.json');

var fallos = 0;
function exige(c, t) { if (c) console.log('  ok   ' + t); else { fallos++; console.error('  FALLA: ' + t); } }

/* ── PNG mínimo (copiado de harness_interbrazos.js) ── */
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
  ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(path.join(OUT, nombre + '.png'), Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))
  ]));
}
function grisA(v) { return Math.max(0, Math.min(255, Math.round(v))); }

function filaCat(nombre) {
  for (var i = 0; i < CAT.length; i++) if (CAT[i][0] === nombre) return CAT[i];
  return null;
}
function galDeFila(g) {
  return { nombre: g[0], ra: g[2], dec: g[3], reArcsec: g[4], ba: g[5], pa: g[6],
           magV: g[7], n: g[8], bt: g[9], nMedido: g[11] || 0,
           ladoArcmin: R.ps1LadoArcmin(g[4]) };
}
function leerGaia(fich) {
  return fs.readFileSync(path.join(IN_GAIA, fich), 'utf8').trim().split('\n').slice(1)
    .map(function (l) { var t = l.split(','); return [parseFloat(t[0]), parseFloat(t[1]), parseFloat(t[2])]; });
}
function mediana(m) {
  var s = m.slice().sort(function (a, b) { return a - b; });
  return s.length ? s[(s.length - 1) >> 1] : NaN;
}
function percentil(m, p) {
  var s = m.slice().sort(function (a, b) { return a - b; });
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN;
}
// Mismo radio elíptico que ps1FuenteEnEscena (copiado de harness_interbrazos.js).
function radioEje(cs, sn, norte, este, q) {
  var eje = norte * cs + este * sn, tra = -norte * sn + este * cs;
  return Math.sqrt(eje * eje + (tra / q) * (tra / q));
}
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

/* Media en caja (2·rad+1)²: copia literal de ps1CajaSeparable (no exportada). */
function cajaSeparable(datos, ancho, alto, rad) {
  var tmp = new Float32Array(datos.length), out = new Float32Array(datos.length), x, y, i;
  for (y = 0; y < alto; y++) {
    var acc = 0, n = 0;
    for (x = -rad; x <= rad; x++) { i = Math.min(ancho - 1, Math.max(0, x)); acc += datos[y * ancho + i]; n++; }
    for (x = 0; x < ancho; x++) {
      tmp[y * ancho + x] = acc / n;
      var sale = Math.min(ancho - 1, Math.max(0, x - rad));
      var entra = Math.min(ancho - 1, Math.max(0, x + rad + 1));
      acc += datos[y * ancho + entra] - datos[y * ancho + sale];
    }
  }
  for (x = 0; x < ancho; x++) {
    var acc2 = 0, n2 = 0;
    for (y = -rad; y <= rad; y++) { i = Math.min(alto - 1, Math.max(0, y)); acc2 += tmp[i * ancho + x]; n2++; }
    for (y = 0; y < alto; y++) {
      out[y * ancho + x] = acc2 / n2;
      var sale2 = Math.min(alto - 1, Math.max(0, y - rad));
      var entra2 = Math.min(alto - 1, Math.max(0, y + rad + 1));
      acc2 += tmp[entra2 * ancho + x] - tmp[sale2 * ancho + x];
    }
  }
  return out;
}
/* ps1SoporteLocal con la escala S en vez de PS1.mezclaCajaAs. Con S=25 el rad
   es el de producción y el resultado debe ser idéntico elemento a elemento. */
function soporteEscala(datos, ancho, alto, escalaAs, S) {
  var rad = Math.max(1, Math.round(S / (escalaAs > 0 ? escalaAs : 1) / 2));
  var f = new Float32Array(datos.length);
  for (var i = 0; i < datos.length; i++) f[i] = datos[i] > 0 ? datos[i] : 0;
  return { mapa: cajaSeparable(f, ancho, alto, rad), rad: rad };
}

/* ── E1: percentil deslizante por histogramas de columna (Huang/Perreault) ──
   Cuantización: bin 0 = sin señal (NaN, ≤0, o más débil que magMax); bins
   1..255 lineales en magnitud sobre [magMin, magMax] = [umbral−8, umbral+4]
   (más brillante → bin más alto). El percentil P de la caja (contando los
   bin 0, como cuenta producción los ceros en la media) se devuelve como flujo
   del centro del bin. Bordes por replicación, como ps1CajaSeparable. */
function percentilCaja(datos, ancho, alto, rad, P, umbral) {
  var NB = 256, magMin = umbral - 8, magMax = umbral + 4;
  var esc = (NB - 2) / (magMax - magMin);      // bins 1..255
  var q = new Uint8Array(datos.length);
  for (var i = 0; i < datos.length; i++) {
    var v = datos[i];
    if (!(v > 0)) continue;                    // NaN/≤0 → bin 0 (sin señal)
    var mg = -2.5 * Math.log10(v);
    var b = 1 + Math.round((magMax - mg) * esc);
    q[i] = b < 1 ? 0 : b > 255 ? 255 : b;
  }
  var flujoBin = new Float64Array(NB);
  for (var b2 = 1; b2 < NB; b2++) flujoBin[b2] = Math.pow(10, -0.4 * (magMax - (b2 - 1) / esc));
  var out = new Float32Array(datos.length);
  var colH = new Uint16Array(ancho * NB);      // histograma por columna
  var ker = new Int32Array(NB);
  var idxCol = function (x) { return Math.min(ancho - 1, Math.max(0, x)); };
  // primas: filas −rad..rad con replicación
  for (var x0 = 0; x0 < ancho; x0++) {
    for (var y0 = -rad; y0 <= rad; y0++) {
      var yy = Math.min(alto - 1, Math.max(0, y0));
      colH[x0 * NB + q[yy * ancho + x0]]++;
    }
  }
  var ladoN = 2 * rad + 1, total = ladoN * ladoN;
  for (var y = 0; y < alto; y++) {
    if (y > 0) {  // desliza las columnas una fila
      var ySale = Math.min(alto - 1, Math.max(0, y - 1 - rad));
      var yEntra = Math.min(alto - 1, Math.max(0, y + rad));
      for (var xc = 0; xc < ancho; xc++) {
        colH[xc * NB + q[ySale * ancho + xc]]--;
        colH[xc * NB + q[yEntra * ancho + xc]]++;
      }
    }
    ker.fill(0);
    for (var xk = -rad; xk <= rad; xk++) {
      var c0 = idxCol(xk) * NB;
      for (var bb = 0; bb < NB; bb++) ker[bb] += colH[c0 + bb];
    }
    var objetivo = Math.max(1, Math.ceil(P / 100 * total));
    for (var x = 0; x < ancho; x++) {
      var acc = 0, binP = 0;
      for (var b3 = 0; b3 < NB; b3++) { acc += ker[b3]; if (acc >= objetivo) { binP = b3; break; } }
      out[y * ancho + x] = flujoBin[binP];
      var cSale = idxCol(x - rad) * NB, cEntra = idxCol(x + rad + 1) * NB;
      for (var b4 = 0; b4 < NB; b4++) ker[b4] += colH[cEntra + b4] - colH[cSale + b4];
    }
  }
  return out;
}

/* ── E2: propagación de opacidad con decaimiento, por chamfer ──
   comp(x) = max_y op(y)·k(d(x,y)); dos pasadas raster ×2 iteraciones. Los NaN
   (mascara=1) no aportan (op=0), no reciben (comp=0) y bloquean el paso.
   exp: k multiplica por paso (exacto sobre la métrica chamfer).
   lin: se arrastra (op0, d) del mejor candidato (aprox. codiciosa).
   La verificación contra la definición directa (euclídea) se hace fuera. */
function propagarOp(op, nan, ancho, alto, escalaAs, alcance, tipo) {
  var n = op.length;
  var comp = new Float32Array(n), op0 = new Float32Array(n), dist = new Float32Array(n);
  /* NaN: no siembran (op 0) ni reciben (comp final 0), pero NO bloquean el
     paso — la definición directa es euclídea, sin noción de camino */
  for (var i = 0; i < n; i++) {
    if (nan[i]) { comp[i] = 0; op0[i] = 0; dist[i] = 0; continue; }
    comp[i] = op[i]; op0[i] = op[i]; dist[i] = 0;
  }
  /* vecindad 5×5 (con saltos de caballo): error métrico ≤ ~2 % frente al 7,6 %
     del 3×3, necesario para que |chamfer−directo| quede bajo la tolerancia */
  var pasoA = escalaAs, pasoD = escalaAs * Math.SQRT2, pasoC = escalaAs * Math.sqrt(5);
  var kA = Math.exp(-3 * pasoA / alcance), kD = Math.exp(-3 * pasoD / alcance),
      kC = Math.exp(-3 * pasoC / alcance);
  function candidato(i, j, paso, kMul) {
    var v;
    if (tipo === 'exp') {
      v = comp[j] * kMul;
      if (v > comp[i]) { comp[i] = v; }
    } else {
      var d2 = dist[j] + paso;
      v = op0[j] * Math.max(0, 1 - d2 / alcance);
      if (v > comp[i]) { comp[i] = v; op0[i] = op0[j]; dist[i] = d2; }
    }
  }
  for (var it = 0; it < 2; it++) {
    for (var y = 0; y < alto; y++) for (var x = 0; x < ancho; x++) {
      var i2 = y * ancho + x;
      if (x > 0) candidato(i2, i2 - 1, pasoA, kA);
      if (y > 0) candidato(i2, i2 - ancho, pasoA, kA);
      if (x > 0 && y > 0) candidato(i2, i2 - ancho - 1, pasoD, kD);
      if (x < ancho - 1 && y > 0) candidato(i2, i2 - ancho + 1, pasoD, kD);
      if (y > 1) {
        if (x > 0) candidato(i2, i2 - 2 * ancho - 1, pasoC, kC);
        if (x < ancho - 1) candidato(i2, i2 - 2 * ancho + 1, pasoC, kC);
      }
      if (y > 0) {
        if (x > 1) candidato(i2, i2 - ancho - 2, pasoC, kC);
        if (x < ancho - 2) candidato(i2, i2 - ancho + 2, pasoC, kC);
      }
    }
    for (var y2 = alto - 1; y2 >= 0; y2--) for (var x2 = ancho - 1; x2 >= 0; x2--) {
      var i3 = y2 * ancho + x2;
      if (x2 < ancho - 1) candidato(i3, i3 + 1, pasoA, kA);
      if (y2 < alto - 1) candidato(i3, i3 + ancho, pasoA, kA);
      if (x2 < ancho - 1 && y2 < alto - 1) candidato(i3, i3 + ancho + 1, pasoD, kD);
      if (x2 > 0 && y2 < alto - 1) candidato(i3, i3 + ancho - 1, pasoD, kD);
      if (y2 < alto - 2) {
        if (x2 < ancho - 1) candidato(i3, i3 + 2 * ancho + 1, pasoC, kC);
        if (x2 > 0) candidato(i3, i3 + 2 * ancho - 1, pasoC, kC);
      }
      if (y2 < alto - 1) {
        if (x2 < ancho - 2) candidato(i3, i3 + ancho + 2, pasoC, kC);
        if (x2 > 1) candidato(i3, i3 + ancho - 2, pasoC, kC);
      }
    }
  }
  for (i = 0; i < n; i++) if (nan[i]) comp[i] = 0;
  return comp;
}
/* definición directa (euclídea) en una caja, para verificar el chamfer */
function propagarDirecto(op, nan, ancho, alto, escalaAs, alcance, tipo, x0, y0, x1, y1) {
  /* exp no se anula en d=alcance: extender hasta que la cola quede < 0,002 */
  var radAs = tipo === 'exp' ? alcance * (-Math.log(0.002) / 3) : alcance;
  var radPx = Math.ceil(radAs / escalaAs), out = new Float32Array((x1 - x0 + 1) * (y1 - y0 + 1));
  var k = 0;
  for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++, k++) {
    if (nan[y * ancho + x]) { out[k] = 0; continue; }
    var mejor = 0;
    for (var dy = -radPx; dy <= radPx; dy++) {
      var yy = y + dy; if (yy < 0 || yy >= alto) continue;
      for (var dx = -radPx; dx <= radPx; dx++) {
        var xx = x + dx; if (xx < 0 || xx >= ancho) continue;
        var j = yy * ancho + xx;
        if (nan[j] || !(op[j] > 0)) continue;
        var d = Math.sqrt(dx * dx + dy * dy) * escalaAs;
        var v = tipo === 'exp' ? op[j] * Math.exp(-3 * d / alcance)
                               : op[j] * Math.max(0, 1 - d / alcance);
        if (v > mejor) mejor = v;
      }
    }
    out[k] = mejor;
  }
  return out;
}

/* ── réplica del bucle VIGENTE de ps1PintarParche; pinta a la vez producción
   (soporte 25″) y, si hay variante, op_final = max(op_prod, componente) ── */
function pintar(parche, o, soportes, compPatch) {
  var SIZE = CFG.SIZE;
  var escv = SIZE / (o.arcmin / 60);
  var cos0 = Math.cos(o.dec0 * Math.PI / 180);
  var dra = (((parche.ra - o.ra0 + 540) % 360) - 180) * cos0;
  var cx = SIZE / 2 - dra * escv, cy = SIZE / 2 - (parche.dec - o.dec0) * escv;
  var ladoPx = (parche.ladoArcmin / 60) * escv;
  var n = SIZE * SIZE;
  var res = {
    fPre: new Float32Array(n), fPost: new Float32Array(n), fPostProd: new Float32Array(n),
    wMap: new Float32Array(n), fmMap: new Float32Array(n),
    opMap: new Float32Array(n).fill(NaN), opProdMap: new Float32Array(n).fill(NaN),
    compMap: new Float32Array(n),
    fx: new Float32Array(n).fill(NaN), fy: new Float32Array(n).fill(NaN),
    pintado: new Uint8Array(n), ctx: null, x0: 0, x1: -1, y0: 0, y1: -1,
    borrados: 0
  };
  if (!(ladoPx > 0.5)) return res;
  var q = parche.ancho / (parche.ladoArcmin * 60);
  var a = parche.afin || { cx: (parche.ancho - 1) / 2, cy: (parche.alto - 1) / 2,
                           xe: -q, xn: 0, ye: 0, yn: q };
  var c = o.cielo ? R.ctxFotometrico(o.cielo, parche.thetaIntArcmin) : null;
  res.ctx = c;
  var umbral = c ? R.sbUmbralContraste(c) : 0;
  var pxPorAs = escv / 3600;
  var halo = !!c && R.ps1HaloActivo(parche.halo);
  var comps = halo ? (parche.comps || []) : [], pa = parche.pa || 0;
  var peso = halo ? (parche.peso || null) : null;
  var sMezcla = peso ? parche.escalaMezcla : 1;
  var haloPx = R.ps1RadioHaloAs(comps) * pxPorAs;
  var alcance = Math.max(ladoPx / 2, haloPx);
  var datos = parche.datosPsf;   // ya calculado fuera (con calientes si tocan)
  res.datosPsf = datos;
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
      var fm = comps.length ? R.ps1FlujoModelo(comps, pa, norte, este) : 0;
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
      var fPr = f, fVar = f;
      if (c) {
        var sop = 0, comp = 0;
        var sx = Math.round(fx), sy = Math.round(fy);
        if (sx >= 0 && sx < parche.ancho && sy >= 0 && sy < parche.alto) {
          var kS = sy * parche.ancho + sx;
          for (var s2 = 0; s2 < soportes.length; s2++) {
            var v2 = soportes[s2][kS];
            if (v2 > sop) sop = v2;
          }
          if (compPatch) comp = compPatch[kS];
        }
        var opProd = R.ps1Opacidad(-2.5 * Math.log10(sop > f ? sop : f), umbral);
        res.opProdMap[i] = opProd;
        res.compMap[i] = comp;
        var opFin = compPatch ? Math.max(opProd, comp) : opProd;
        res.opMap[i] = opFin;
        if (opFin < opProd) res.borrados++;
        fPr = R.ps1FlujoConOpacidad(f, opProd, c);
        fVar = compPatch ? R.ps1FlujoConOpacidad(f, opFin, c) : fPr;
      }
      if (fPr > 0) res.fPostProd[i] = fPr;
      if (!(fVar > 0)) continue;
      res.fPost[i] = fVar;
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

/* ═════════════════════════ ejecución ═════════════════════════ */
var O = OBJS[OBJ];
var gal = galDeFila(filaCat(O.cat));
console.log('═══ ' + OBJ + ' (' + gal.nombre + ')  ' + ETIQ + '  D=' + CFG.D +
  'mm M=' + CFG.M + 'x sqm=' + CFG.sqm + ' δ=' + CFG.delta + ' ═══');

B.bajar(gal.ra, gal.dec, gal.ladoArcmin, PS1.salida).then(function (F) {
  var W = F.ancho, H = F.alto;
  var fSim = { ancho: W, alto: H, escalaAs: F.escalaAs, wcs: F.wcs || null };
  fSim.afin = R.ps1AfinParche(fSim, gal);
  var enPx = R.ps1EstrellasEnPixeles(fSim, gal, leerGaia(O.csv));
  var vecinos = R.ps1GalaxiasDelCampo(CAT, gal.ra, gal.dec, gal.ladoArcmin);
  var escena = R.ps1EscenaEnParche(fSim, gal, vecinos);
  var limpio = R.ps1QuitarEstrellas(F.datos, W, H, enPx,
    { afin: fSim.afin, ba: gal.ba, pa: gal.pa, escena: escena });
  var cieloP = R.ps1Cielo(limpio, W, H);
  var sigmaP = R.ps1SigmaCielo(limpio, W, H, cieloP);
  var anc = R.ps1AnclarACatalogo(limpio, W, H, {
    magV: gal.magV, n: gal.n, reArcsec: gal.reArcsec,
    ladoArcmin: gal.ladoArcmin, escalaAs: F.escalaAs });
  var comps = R.ps1ComponentesSersic(gal);
  var peso = R.ps1PesoImagen(anc, W, H, F.escalaAs);
  var perfil = R.ps1PerfilEnParche(comps, gal.pa, W, H, fSim.afin);
  var parche = { ra: gal.ra, dec: gal.dec, ladoArcmin: gal.ladoArcmin,
                 ancho: W, alto: H, afin: fSim.afin,
                 comps: comps, pa: gal.pa, halo: R.ps1MedidasHalo(gal, comps),
                 thetaIntArcmin: R.ps1ThetaIntArcmin(comps, gal.ba),
                 peso: peso, escalaMezcla: R.ps1EscalaMezcla(anc, peso, perfil),
                 datos: anc, escena: escena };
  var cielo = { pupilaSalida: CFG.D / CFG.M, pupilaOjo: 7, sqm: CFG.sqm,
                aumentos: CFG.M, realceMax: PS1.realceMax, perceptual: true };
  var o = { ra0: gal.ra, dec0: gal.dec, arcmin: CFG.AFOV / CFG.M * 60,
            size: CFG.SIZE, cielo: cielo, apertura: CFG.D };
  var escParche = (gal.ladoArcmin * 60) / W;
  var ctx0 = R.ctxFotometrico(cielo, parche.thetaIntArcmin);
  var umbral0 = R.sbUmbralContraste(ctx0);

  var datosPsf = R.ps1DatosConPsf(parche, escParche, CFG.D);
  /* píxeles calientes sintéticos (solo sensibilidad, exploratoria): a p99,9 del
     parche, en posiciones fijas (centros de ROI + rejilla), sobre una COPIA. */
  var posCalientes = [];
  if (CALIENTES) {
    var pos = [], m9 = [];
    for (var i9 = 0; i9 < datosPsf.length; i9 += 13) if (datosPsf[i9] > 0) m9.push(datosPsf[i9]);
    m9.sort(function (a, b) { return a - b; });
    var v999 = m9[Math.floor(m9.length * 0.999)];
    if (ROIS_FICH && fs.existsSync(ROIS_FICH)) {
      JSON.parse(fs.readFileSync(ROIS_FICH, 'utf8')).cajas.forEach(function (rr) {
        if (rr.x0 != null) pos.push([(rr.x0 + rr.x1) >> 1, (rr.y0 + rr.y1) >> 1]);
      });
    }
    for (var g9 = 0; pos.length < CALIENTES; g9++) pos.push([100 + g9 * 190, 150 + g9 * 160]);
    pos = pos.slice(0, CALIENTES);
    var copia = new Float32Array(datosPsf);
    pos.forEach(function (p9) { copia[p9[1] * W + p9[0]] = v999; });
    datosPsf = copia; posCalientes = pos;
    console.log('  calientes: ' + pos.length + ' px a v=' + v999.toExponential(3));
  }
  parche.datosPsf = datosPsf;

  /* soporte de producción (o el barrido de Fase 2) */
  var soportes = [], rads = [], msSoporte = 0;
  var escalasSoporte = VARIANTE ? [PS1.mezclaCajaAs] : ESCALAS;
  escalasSoporte.forEach(function (S) {
    var t0 = process.hrtime.bigint();
    var s = soporteEscala(datosPsf, W, H, escParche, S);
    msSoporte += Number(process.hrtime.bigint() - t0) / 1e6;
    soportes.push(s.mapa); rads.push(s.rad);
  });

  /* componente de la variante, sobre la rejilla del parche */
  var compPatch = null, msComp = 0, verifChamfer = null;
  if (VARIANTE === 'E1') {
    var radE1 = Math.max(1, Math.round(ESCALAS[0] / escParche / 2));
    var tE1 = process.hrtime.bigint();
    var sopP = percentilCaja(datosPsf, W, H, radE1, PCT, umbral0);
    compPatch = new Float32Array(sopP.length);
    for (var iC = 0; iC < sopP.length; iC++) {
      compPatch[iC] = sopP[iC] > 0 ? R.ps1Opacidad(-2.5 * Math.log10(sopP[iC]), umbral0) : 0;
    }
    msComp = Number(process.hrtime.bigint() - tE1) / 1e6;
    console.log('  E1: p' + PCT + ' caja ' + ESCALAS[0] + '″ (rad=' + radE1 + ' px), ' + msComp.toFixed(0) + ' ms');
  } else if (VARIANTE === 'E2') {
    var tE2 = process.hrtime.bigint();
    var nanM = new Uint8Array(datosPsf.length);
    var opPatch = new Float32Array(datosPsf.length);
    for (var iN = 0; iN < datosPsf.length; iN++) {
      var vN = datosPsf[iN];
      if (!isFinite(vN)) { nanM[iN] = 1; continue; }
      var sN = soportes[0][iN];
      var mx = vN > sN ? vN : sN;
      if (mx > 0) opPatch[iN] = R.ps1Opacidad(-2.5 * Math.log10(mx), umbral0);
    }
    compPatch = propagarOp(opPatch, nanM, W, H, escParche, ALCANCE, DECAI);
    msComp = Number(process.hrtime.bigint() - tE2) / 1e6;
    /* verificación chamfer vs definición directa en la primera ROI (o caja fija) */
    var vx0 = 400, vy0 = 400, vx1 = 439, vy1 = 439;
    if (ROIS_FICH && fs.existsSync(ROIS_FICH)) {
      var r0 = JSON.parse(fs.readFileSync(ROIS_FICH, 'utf8')).cajas[0];
      if (r0.x0 != null) { vx0 = r0.x0; vy0 = r0.y0; vx1 = Math.min(r0.x1, r0.x0 + 39); vy1 = Math.min(r0.y1, r0.y0 + 39); }
    }
    var directo = propagarDirecto(opPatch, nanM, W, H, escParche, ALCANCE, DECAI, vx0, vy0, vx1, vy1);
    var dver = 0, kv = 0;
    for (var yv = vy0; yv <= vy1; yv++) for (var xv = vx0; xv <= vx1; xv++, kv++) {
      dver = Math.max(dver, Math.abs(compPatch[yv * W + xv] - directo[kv]));
    }
    verifChamfer = dver;
    console.log('  E2: ' + DECAI + ' alcance ' + ALCANCE + '″, ' + msComp.toFixed(0) +
      ' ms; |chamfer−directo|max en ROI = ' + dver.toFixed(4));
    exige(dver <= 0.02, 'chamfer ≈ definición directa (tolerancia 0,02 de op)');
  }

  var I = pintar(parche, o, soportes, compPatch);

  /* PARIDAD (variante apagada, escala 25): réplica ≡ producción bit a bit */
  if (ES_BASE) {
    var sopProd = R.ps1SoporteLocal(datosPsf, W, H, escParche);
    var dSop = 0;
    for (var iS = 0; iS < sopProd.length; iS++) if (sopProd[iS] !== soportes[0][iS]) dSop++;
    exige(dSop === 0, 'soporte(25″) ≡ ps1SoporteLocal (' + dSop + ' px distintos)');
    var prod = new Float32Array(CFG.SIZE * CFG.SIZE);
    R.ps1PintarParche(prod, parche, o);
    var dmax = 0;
    for (var iP = 0; iP < prod.length; iP++) dmax = Math.max(dmax, Math.abs(prod[iP] - I.fPost[iP]));
    exige(dmax === 0, 'réplica = producción bit a bit (dmax=' + dmax + ')');
    if (dmax !== 0) { process.exit(1); }
  }
  /* invariante de no-borrado, en toda corrida con variante */
  if (VARIANTE) exige(I.borrados === 0, 'no-borrado: 0 px con op_final < op_prod (' + I.borrados + ')');

  var c = I.ctx, umbral = R.sbUmbralContraste(c);
  var SIZE = CFG.SIZE, n = SIZE * SIZE;
  var E = nivelPantalla(I.fPost, c);
  var Eprod = VARIANTE ? nivelPantalla(I.fPostProd, c) : E;
  var fondoNivel = Math.round(c.nivelFondo);

  var shaPre = crypto.createHash('sha1')
    .update(Buffer.from(I.fPre.buffer, I.fPre.byteOffset, I.fPre.byteLength)).digest('hex');

  var thetaRmin = Math.pow(10, FOT.H2C.THETA_R_A + FOT.H2C.THETA_R_B * c.SBe);

  var dEsc = new Float32Array(n).fill(NaN);
  for (var i = 0; i < n; i++) {
    if (I.fx[i] === I.fx[i]) dEsc[i] = distEscena(escena, fSim.afin, I.fx[i], I.fy[i]);
  }

  var bx0 = SIZE, bx1 = -1, by0 = SIZE, by1 = -1;
  for (i = 0; i < n; i++) {
    if (!(dEsc[i] <= 1)) continue;
    var xR = i % SIZE, yR = (i / SIZE) | 0;
    if (xR < bx0) bx0 = xR; if (xR > bx1) bx1 = xR;
    if (yR < by0) by0 = yR; if (yR > by1) by1 = yR;
  }
  if (bx1 < 0) { bx0 = I.x0; bx1 = I.x1; by0 = I.y0; by1 = I.y1; }

  /* clasificación del negro (reglas de Fase 1) sobre el render de la VARIANTE */
  var clase = new Uint8Array(n), claseProd = new Uint8Array(n);
  var cuenta = { negros: 0, a: 0, b: 0, c: 0, d: 0, e: 0 }, soloRampa = 0;
  /* y sobre el de producción (referencia interna de la corrida) */
  var cuentaProd = { negros: 0, b: 0, soloRampa: 0 };
  function clasifica(Emapa, opMapa, apunta) {
    for (var y = by0; y <= by1; y++) for (var x = bx0; x <= bx1; x++) {
      var i6 = y * SIZE + x;
      var fx6 = I.fx[i6], fy6 = I.fy[i6];
      if (!(fx6 >= 0 && fx6 < W && fy6 >= 0 && fy6 < H)) continue;
      if (grisA(Emapa[i6]) > fondoNivel + CFG.delta) continue;
      apunta.negros++;
      var kP = Math.round(fy6) * W + Math.round(fx6);
      var vRaw = limpio[kP];
      var esNaNanc = !(anc[kP] === anc[kP]);
      var condC = (vRaw === vRaw) && !esNaNanc && vRaw < cieloP;
      var nivelFm = c.nivelFondo + R.valorDeFlujo(
        FOT.GAMMA_PERCEPTUAL !== 1 && I.fmMap[i6] > 0
          ? R.realzarPerceptual(I.fmMap[i6], c.Fcielo, c.rango, 0, PS1.realceMax) : I.fmMap[i6],
        c.Fcielo, c.rango);
      var condD = I.wMap[i6] < 0.5 && grisA(nivelFm) <= fondoNivel + CFG.delta;
      var dentro = dEsc[i6] <= 1;
      var opBaja = opMapa[i6] === opMapa[i6] && opMapa[i6] < 1;
      var condA = opBaja && !dentro, condB = opBaja && dentro;
      var m = (condC ? 1 : 0) | (condD ? 2 : 0) | (condA ? 4 : 0) | (condB ? 8 : 0);
      var cl;
      if (condC) { cl = 1; if (apunta.c != null) apunta.c++; }
      else if (condD) { cl = 2; if (apunta.d != null) apunta.d++; }
      else if (condA) { cl = 3; if (apunta.a != null) apunta.a++; }
      else if (condB) { cl = 4; apunta.b++; }
      else { cl = 5; if (apunta.e != null) apunta.e++; m |= 16; }
      if ((m & 12) && !(m & 3)) apunta.soloRampa = (apunta.soloRampa || 0) + 1;
      if (apunta === cuenta) clase[i6] = cl;
      else claseProd[i6] = cl;
    }
  }
  clasifica(E, I.opMap, cuenta);
  soloRampa = cuenta.soloRampa || 0;
  if (VARIANTE) clasifica(Eprod, I.opProdMap, cuentaProd);
  else cuentaProd = { negros: cuenta.negros, b: cuenta.b, soloRampa: soloRampa };

  /* ── ROIs ── */
  var rois = ROIS_FICH && fs.existsSync(ROIS_FICH)
    ? JSON.parse(fs.readFileSync(ROIS_FICH, 'utf8')) : null;
  var resumenRois = [];
  if (rois) {
    rois.cajas.forEach(function (rr) {
      if (rr.tipo === 'fuente') {  // círculo: anillo 1,5–3× radio en px de parche
        var rIn = 1.5 * rr.radioPx, rOut = 3 * rr.radioPx;
        var sF = 0, sFb = 0, sOp = 0, sOpB = 0, cnt = 0;
        for (var i7 = 0; i7 < n; i7++) {
          var dx7 = I.fx[i7] - rr.cx, dy7 = I.fy[i7] - rr.cy;
          if (!(dx7 === dx7)) continue;
          var d7 = Math.sqrt(dx7 * dx7 + dy7 * dy7);
          if (d7 < rIn || d7 > rOut) continue;
          cnt++;
          sF += I.fPost[i7]; sFb += I.fPostProd[i7];
          if (I.opMap[i7] === I.opMap[i7]) sOp += I.opMap[i7];
          if (I.opProdMap[i7] === I.opProdMap[i7]) sOpB += I.opProdMap[i7];
        }
        resumenRois.push({ nombre: rr.nombre, tipo: rr.tipo, px: cnt,
          deltaMagAnillo: (sF > 0 && sFb > 0) ? -2.5 * Math.log10(sF / sFb) : (sF === sFb ? 0 : null),
          deltaOpMedio: cnt ? (sOp - sOpB) / cnt : 0,
          fMedio: cnt ? sF / cnt : 0, fMedioProd: cnt ? sFb / cnt : 0 });
        return;
      }
      var idx = [], negros = 0, negrosB = 0, ops = [];
      var negrosProd = 0, negrosBProd = 0;
      for (var i5 = 0; i5 < n; i5++) {
        var fx5 = I.fx[i5], fy5 = I.fy[i5];
        if (!(fx5 >= rr.x0 && fx5 <= rr.x1 && fy5 >= rr.y0 && fy5 <= rr.y1)) continue;
        idx.push(i5);
        if (clase[i5]) { negros++; if (clase[i5] === 4) negrosB++; }
        if (VARIANTE && claseProd[i5]) { negrosProd++; if (claseProd[i5] === 4) negrosBProd++; }
        if (I.opMap[i5] === I.opMap[i5]) ops.push(I.opMap[i5]);
      }
      resumenRois.push({
        nombre: rr.nombre, tipo: rr.tipo, px: idx.length,
        negros: negros, negrosB: negrosB,
        negrosProd: VARIANTE ? negrosProd : negros, negrosBProd: VARIANTE ? negrosBProd : negrosB,
        fracNegros: idx.length ? negros / idx.length : 0,
        fracNegrosB: idx.length ? negrosB / idx.length : 0,
        op: { mediana: mediana(ops), p10: percentil(ops, 0.10), p90: percentil(ops, 0.90) }
      });
    });
  }

  /* ── cielo del campo: dEsc > 1.5 dentro del parche ── */
  var cieloCampo = { px: 0, opPos: 0, opPosProd: 0, sumaE: 0, sumaEProd: 0 };
  for (i = 0; i < n; i++) {
    if (!(dEsc[i] > 1.5)) continue;
    if (!(I.fx[i] >= 0 && I.fx[i] < W && I.fy[i] >= 0 && I.fy[i] < H)) continue;
    cieloCampo.px++;
    cieloCampo.sumaE += E[i]; cieloCampo.sumaEProd += Eprod[i];
    if (I.opMap[i] > 0) cieloCampo.opPos++;
    if (I.opProdMap[i] > 0) cieloCampo.opPosProd++;
  }
  var cieloRes = { px: cieloCampo.px,
    fracOpPos: cieloCampo.px ? cieloCampo.opPos / cieloCampo.px : 0,
    fracOpPosProd: cieloCampo.px ? cieloCampo.opPosProd / cieloCampo.px : 0,
    nivelMedio: cieloCampo.px ? cieloCampo.sumaE / cieloCampo.px : 0,
    nivelMedioProd: cieloCampo.px ? cieloCampo.sumaEProd / cieloCampo.px : 0 };

  /* ── anillos elípticos 1,0–2,0, Δmag interno variante vs producción ── */
  var anillos = [];
  for (var rA = 0; rA < 10; rA++) {
    var lo = 1 + rA * 0.1, hi = lo + 0.1, suma = 0, sumaB = 0, cnt2 = 0;
    for (i = 0; i < n; i++) {
      if (!(dEsc[i] >= lo && dEsc[i] < hi)) continue;
      if (!(I.fx[i] >= 0 && I.fx[i] < W && I.fy[i] >= 0 && I.fy[i] < H)) continue;
      suma += I.fPost[i]; sumaB += I.fPostProd[i]; cnt2++;
    }
    anillos.push({ dLo: +lo.toFixed(1), dHi: +hi.toFixed(1), px: cnt2,
      fMedio: cnt2 ? suma / cnt2 : 0, fMedioProd: cnt2 ? sumaB / cnt2 : 0,
      deltaMag: (suma > 0 && sumaB > 0) ? -2.5 * Math.log10(suma / sumaB) : (suma === sumaB ? 0 : null) });
  }

  /* RMS del nivel contra la producción interna */
  var rms = 0;
  for (i = 0; i < n; i++) { var dR = E[i] - Eprod[i]; rms += dR * dR; }
  rms = Math.sqrt(rms / n);

  var res = {
    obj: OBJ, etiqueta: ETIQ, variante: VARIANTE, escalas: ESCALAS, rads: rads,
    percentil: VARIANTE === 'E1' ? PCT : null,
    decaimiento: VARIANTE === 'E2' ? DECAI : null,
    alcance: VARIANTE === 'E2' ? ALCANCE : null,
    calientes: posCalientes, cfg: CFG, fecha: '2026-08-15',
    flags: { opacidadInternaEscena: PS1.opacidadInternaEscena,
             confianzaLocalNaN: PS1.confianzaLocalNaN, mezclaCajaAs: PS1.mezclaCajaAs,
             deltaMin: PS1.deltaMin, deltaPlena: PS1.deltaPlena, deltaExp: PS1.deltaExp },
    parche: { ancho: W, alto: H, escalaAs: F.escalaAs, escParche: escParche,
              cielo: cieloP, sigma: sigmaP },
    ctx: { SBe: c.SBe, umbralSB: umbral, nivelFondo: c.nivelFondo, Cmin: c.Cmin },
    thetaR: { aparenteArcmin: thetaRmin, intrinsecoArcsec: thetaRmin * 60 / CFG.M },
    shaFotometriaPre: shaPre,
    msSoporte: +msSoporte.toFixed(1), msComponente: +msComp.toFixed(1),
    verifChamfer: verifChamfer,
    borrados: I.borrados,
    clasificacion: cuenta, soloRampa: soloRampa,
    clasificacionProd: cuentaProd,
    rois: resumenRois, cieloCampo: cieloRes, anillos: anillos,
    rmsNivelVsProd: +rms.toFixed(4)
  };

  var BASE_JSON = path.join(OUT, 'barrido_' + OBJ + '_s' + PS1.mezclaCajaAs + '.json');
  var E_BIN = path.join(OUT, 'E_s' + PS1.mezclaCajaAs + '.bin');
  if (ES_BASE) {
    fs.writeFileSync(E_BIN, Buffer.from(E.buffer, E.byteOffset, E.byteLength));
    if (fs.existsSync(BASE_F1)) {
      var f1 = JSON.parse(fs.readFileSync(BASE_F1, 'utf8'));
      exige(f1.clasificacion.negros === cuenta.negros &&
            f1.clasificacion.b === cuenta.b && f1.clasificacion.c === cuenta.c,
        'reproduce el baseline de Fase 1 (negros=' + cuenta.negros + ' vs ' +
        f1.clasificacion.negros + ', b=' + cuenta.b + ' vs ' + f1.clasificacion.b + ')');
    }
  } else if (fs.existsSync(BASE_JSON) && !CALIENTES) {
    var b0 = JSON.parse(fs.readFileSync(BASE_JSON, 'utf8'));
    exige(b0.shaFotometriaPre === shaPre,
      'fotometría pre-opacidad bit a bit idéntica al baseline');
    exige(b0.clasificacion.negros === cuentaProd.negros,
      'producción interna = baseline s25 (negros ' + cuentaProd.negros + ' vs ' + b0.clasificacion.negros + ')');
  }

  fs.writeFileSync(path.join(OUT, 'barrido_' + OBJ + '_' + ETIQ + '.json'),
    JSON.stringify(res, null, 1));

  /* PNGs */
  var rgbE = new Uint8Array(n * 3);
  for (i = 0; i < n; i++) { var g1 = grisA(E[i]); rgbE[i * 3] = rgbE[i * 3 + 1] = rgbE[i * 3 + 2] = g1; }
  png('render_E_' + ETIQ, rgbE, SIZE, SIZE);
  var COLORES = { 1: [255, 0, 255], 2: [255, 160, 0], 3: [60, 100, 255], 4: [255, 40, 40], 5: [0, 220, 220] };
  var rgbC = new Uint8Array(n * 3);
  for (i = 0; i < n; i++) {
    var g4 = grisA(E[i]);
    var col = clase[i] ? COLORES[clase[i]] : [g4, g4, g4];
    rgbC[i * 3] = col[0]; rgbC[i * 3 + 1] = col[1]; rgbC[i * 3 + 2] = col[2];
  }
  png('clases_' + ETIQ, rgbC, SIZE, SIZE);
  if (VARIANTE) {
    var rgbD = new Uint8Array(n * 3);
    for (i = 0; i < n; i++) {
      var dd = E[i] - Eprod[i], g0 = grisA(Eprod[i] * 0.35);
      rgbD[i * 3] = grisA(g0 + Math.max(0, dd) * 8);
      rgbD[i * 3 + 1] = g0;
      rgbD[i * 3 + 2] = grisA(g0 + Math.max(0, -dd) * 8);
    }
    png('diff_' + ETIQ, rgbD, SIZE, SIZE);
    var rgbK = new Uint8Array(n * 3);   // componente aislada (sin el max)
    for (i = 0; i < n; i++) {
      var vK = I.compMap[i];
      rgbK[i * 3] = grisA(vK * 255); rgbK[i * 3 + 1] = grisA(vK * 255); rgbK[i * 3 + 2] = grisA(vK * 128);
    }
    png('comp_' + ETIQ, rgbK, SIZE, SIZE);
  }

  console.log('  negros=' + cuenta.negros + ' (prod ' + cuentaProd.negros + ')  b=' + cuenta.b +
    ' (prod ' + cuentaProd.b + ')  soloRampa=' + soloRampa + '  borrados=' + I.borrados);
  resumenRois.forEach(function (r5) {
    if (r5.tipo === 'fuente') {
      console.log('  ' + r5.nombre + ' (fuente): Δmag anillo=' +
        (r5.deltaMagAnillo == null ? 'null' : r5.deltaMagAnillo.toFixed(4)) +
        '  Δop medio=' + r5.deltaOpMedio.toFixed(4) + '  px=' + r5.px);
    } else {
      console.log('  ' + r5.nombre + ' (' + r5.tipo + '): negros=' + r5.negros +
        ' (b=' + r5.negrosB + ', frac=' + r5.fracNegros.toFixed(3) + '; prod b=' + r5.negrosBProd +
        ')  op med=' + r5.op.mediana.toFixed(3));
    }
  });
  console.log('  cieloCampo: fracOp>0=' + cieloRes.fracOpPos.toFixed(4) +
    ' (prod ' + cieloRes.fracOpPosProd.toFixed(4) + ')  nivel=' + cieloRes.nivelMedio.toFixed(3) +
    ' (prod ' + cieloRes.nivelMedioProd.toFixed(3) + ')');
  var dmMax = Math.max.apply(null, anillos.filter(function (an) { return an.dLo >= 1.2; })
    .map(function (an) { return an.deltaMag == null ? 99 : Math.abs(an.deltaMag); }));
  console.log('  anillos 1,2–2,0 |Δmag|max=' + (dmMax === 99 ? 'null' : dmMax.toFixed(4)) +
    '  RMS vs prod=' + rms.toFixed(3));
  console.log('  JSON: barrido_' + OBJ + '_' + ETIQ + '.json');
  process.exit(fallos ? 1 : 0);
}).catch(function (e) { console.error(e); process.exit(2); });
