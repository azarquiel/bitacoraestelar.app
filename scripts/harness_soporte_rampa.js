#!/usr/bin/env node
/* FASE 2 — Barrido de escala del soporte de la rampa de opacidad (H-D / H-D-multi).
   SOLO diagnóstico: no toca producción. Réplica del bucle VIGENTE de
   ps1PintarParche (bilineal + soporte local c99b72c, opacidadInternaEscena
   apagada) con el soporte recalculado a la escala pedida. Con --escala 25 la
   réplica DEBE ser bit a bit idéntica a producción (dmax=0) y reproducir el
   baseline de la Fase 1: si no, aborta y ningún resultado del barrido vale.

   Soporte de producción (línea base conceptual, ps1SoporteLocal):
     media en caja de (2·rad+1)² px de parche, rad = round(PS1.mezclaCajaAs /
     escParche / 2) con mezclaCajaAs = 25″ INTRÍNSECOS y escParche = ″/px del
     parche; NaN y negativos entran como 0; la rampa evalúa
     op = ps1Opacidad(−2,5·log10(max(f_píxel, soporte)), umbral).
   Aquí solo cambia el 25: --escala S usa rad = round(S/escParche/2).
   Multiescala (--multi "25+75"): sop_eff = máx de los mapas de soporte — como
   ps1Opacidad es monótona en el flujo, el máximo del contraste soportado es la
   opacidad del soporte máximo.

   Uso (un comando por objeto y escala; determinista, parche cacheado):
     node scripts/harness_soporte_rampa.js --obj M51 --escala 25    # baseline (primero)
     node scripts/harness_soporte_rampa.js --obj M51 --escala 75
     node scripts/harness_soporte_rampa.js --obj M51 --multi 25+75
   Objetos: M51 M81 M104 M101 NGC205.
   Opciones: --D mm --M x --sqm v --delta niveles (defecto 457.2/190/21.2/2)
   Salidas: .scratch/soporte/<obj>/  (JSON por escala, PNGs, E_s25.bin) */
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
/* escalas del soporte, en arcsec INTRÍNSECOS (como PS1.mezclaCajaAs) */
var MULTI = arg('multi', null);
var ESCALAS = MULTI ? MULTI.split('+').map(Number) : [parseFloat(arg('escala', '25'))];
var ETIQ = MULTI ? 'm' + MULTI : 's' + ESCALAS[0];
var ES_BASE = !MULTI && ESCALAS.length === 1 && ESCALAS[0] === PS1.mezclaCajaAs;

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
var ROIS_FICH = OBJ === 'M51' ? path.join(RAIZ, 'scripts', 'rois_M51.json') : null;
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

/* ── réplica del bucle VIGENTE de ps1PintarParche, con soporte inyectado ──
   (idéntica a pintarInstr de harness_interbrazos.js salvo `soportes`). */
function pintar(parche, o, soportes) {
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
    opMap: new Float32Array(n).fill(NaN),
    fx: new Float32Array(n).fill(NaN), fy: new Float32Array(n).fill(NaN),
    pintado: new Uint8Array(n), ctx: null, x0: 0, x1: -1, y0: 0, y1: -1
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
  var escParche = (parche.ladoArcmin * 60) / parche.ancho;
  var datos = c ? R.ps1DatosConPsf(parche, escParche, o.apertura) : parche.datos;
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
      if (c) {
        var sop = 0;
        var sx = Math.round(fx), sy = Math.round(fy);
        if (sx >= 0 && sx < parche.ancho && sy >= 0 && sy < parche.alto) {
          var kS = sy * parche.ancho + sx;
          for (var s2 = 0; s2 < soportes.length; s2++) {
            var v2 = soportes[s2][kS];
            if (v2 > sop) sop = v2;
          }
        }
        var op = R.ps1Opacidad(-2.5 * Math.log10(sop > f ? sop : f), umbral);
        res.opMap[i] = op;
        f = R.ps1FlujoConOpacidad(f, op, c);
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

/* ═════════════════════════ ejecución ═════════════════════════ */
var O = OBJS[OBJ];
var gal = galDeFila(filaCat(O.cat));
console.log('═══ ' + OBJ + ' (' + gal.nombre + ')  escala=' + ETIQ + '  D=' + CFG.D +
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

  /* mapas de soporte a las escalas pedidas, cronometrados */
  var datosPsf = R.ps1DatosConPsf(parche, escParche, CFG.D);
  var soportes = [], rads = [], msSoporte = 0;
  ESCALAS.forEach(function (S) {
    var t0 = process.hrtime.bigint();
    var s = soporteEscala(datosPsf, W, H, escParche, S);
    msSoporte += Number(process.hrtime.bigint() - t0) / 1e6;
    soportes.push(s.mapa); rads.push(s.rad);
  });
  console.log('  soporte: rads=[' + rads.join(',') + '] px de parche (escParche=' +
    escParche.toFixed(3) + '″/px), coste=' + msSoporte.toFixed(1) + ' ms');

  /* PARIDAD: con la escala de producción, réplica ≡ producción bit a bit y
     mapa de soporte ≡ ps1SoporteLocal elemento a elemento. */
  if (ES_BASE) {
    var sopProd = R.ps1SoporteLocal(datosPsf, W, H, escParche);
    var dSop = 0;
    for (var iS = 0; iS < sopProd.length; iS++) if (sopProd[iS] !== soportes[0][iS]) dSop++;
    exige(dSop === 0, 'soporte(25″) ≡ ps1SoporteLocal (' + dSop + ' px distintos)');
  }
  var I = pintar(parche, o, soportes);
  if (ES_BASE) {
    var prod = new Float32Array(CFG.SIZE * CFG.SIZE);
    R.ps1PintarParche(prod, parche, o);
    var dmax = 0;
    for (var iP = 0; iP < prod.length; iP++) dmax = Math.max(dmax, Math.abs(prod[iP] - I.fPost[iP]));
    exige(dmax === 0, 'réplica = producción bit a bit (dmax=' + dmax + ')');
    if (dmax !== 0) { process.exit(1); }
  }

  var c = I.ctx, umbral = R.sbUmbralContraste(c);
  var SIZE = CFG.SIZE, n = SIZE * SIZE;
  var E = nivelPantalla(I.fPost, c);
  var fondoNivel = Math.round(c.nivelFondo);

  /* fotometría pre-opacidad: huella para exigir que el barrido no la toca */
  var shaPre = crypto.createHash('sha1')
    .update(Buffer.from(I.fPre.buffer, I.fPre.byteOffset, I.fPre.byteLength)).digest('hex');

  /* θR de la config (serie física del protocolo) */
  var thetaRmin = Math.pow(10, FOT.H2C.THETA_R_A + FOT.H2C.THETA_R_B * c.SBe);
  var sopFisico = thetaRmin * 60 / CFG.M;   // arcsec intrínsecos

  var dEsc = new Float32Array(n).fill(NaN);
  for (var i = 0; i < n; i++) {
    if (I.fx[i] === I.fx[i]) dEsc[i] = distEscena(escena, fSim.afin, I.fx[i], I.fy[i]);
  }

  /* rectángulo envolvente de la elipse μ25 (como en Fase 1) */
  var bx0 = SIZE, bx1 = -1, by0 = SIZE, by1 = -1;
  for (i = 0; i < n; i++) {
    if (!(dEsc[i] <= 1)) continue;
    var xR = i % SIZE, yR = (i / SIZE) | 0;
    if (xR < bx0) bx0 = xR; if (xR > bx1) bx1 = xR;
    if (yR < by0) by0 = yR; if (yR > by1) by1 = yR;
  }
  if (bx1 < 0) { bx0 = I.x0; bx1 = I.x1; by0 = I.y0; by1 = I.y1; }

  /* clasificación del negro: misma regla y orden que la Fase 1 */
  var clase = new Uint8Array(n), maskCond = new Uint8Array(n);
  var cuenta = { negros: 0, a: 0, b: 0, c: 0, d: 0, e: 0 }, soloRampa = 0;
  for (var y = by0; y <= by1; y++) for (var x = bx0; x <= bx1; x++) {
    i = y * SIZE + x;
    var fx = I.fx[i], fy = I.fy[i];
    if (!(fx >= 0 && fx < W && fy >= 0 && fy < H)) continue;
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
    if ((m & 12) && !(m & 3)) soloRampa++;
  }

  /* ── ROIs (solo M51) ── */
  var rois = ROIS_FICH && fs.existsSync(ROIS_FICH)
    ? JSON.parse(fs.readFileSync(ROIS_FICH, 'utf8')) : null;
  var resumenRois = [];
  if (rois) {
    rois.cajas.forEach(function (rr) {
      var idx = [], negros = 0, negrosB = 0, ops = [];
      for (var i5 = 0; i5 < n; i5++) {
        var fx5 = I.fx[i5], fy5 = I.fy[i5];
        if (!(fx5 >= rr.x0 && fx5 <= rr.x1 && fy5 >= rr.y0 && fy5 <= rr.y1)) continue;
        idx.push(i5);
        if (clase[i5]) { negros++; if (clase[i5] === 4) negrosB++; }
        if (I.opMap[i5] === I.opMap[i5]) ops.push(I.opMap[i5]);
      }
      resumenRois.push({
        nombre: rr.nombre, tipo: rr.tipo, px: idx.length,
        negros: negros, negrosB: negrosB,
        fracNegros: idx.length ? negros / idx.length : 0,
        fracNegrosB: idx.length ? negrosB / idx.length : 0,
        op: { mediana: mediana(ops), p10: percentil(ops, 0.10), p90: percentil(ops, 0.90) }
      });
    });
  }

  /* ── cielo del campo (todos los objetos): dEsc > 1.5 dentro del parche ── */
  var cieloCampo = { px: 0, opPos: 0, sumaE: 0 };
  for (i = 0; i < n; i++) {
    if (!(dEsc[i] > 1.5)) continue;
    if (!(I.fx[i] >= 0 && I.fx[i] < W && I.fy[i] >= 0 && I.fy[i] < H)) continue;
    cieloCampo.px++;
    cieloCampo.sumaE += E[i];
    if (I.opMap[i] > 0) cieloCampo.opPos++;
  }
  var cieloRes = { px: cieloCampo.px,
    fracOpPos: cieloCampo.px ? cieloCampo.opPos / cieloCampo.px : 0,
    nivelMedio: cieloCampo.px ? cieloCampo.sumaE / cieloCampo.px : 0 };

  /* ── perfil radial exterior: anillos elípticos dEsc 1,0–2,0 paso 0,1 ── */
  var anillos = [];
  for (var rA = 0; rA < 10; rA++) {
    var lo = 1 + rA * 0.1, hi = lo + 0.1, suma = 0, cnt = 0, sumaE2 = 0;
    for (i = 0; i < n; i++) {
      if (!(dEsc[i] >= lo && dEsc[i] < hi)) continue;
      if (!(I.fx[i] >= 0 && I.fx[i] < W && I.fy[i] >= 0 && I.fy[i] < H)) continue;
      suma += I.fPost[i]; sumaE2 += E[i]; cnt++;
    }
    anillos.push({ dLo: +lo.toFixed(1), dHi: +hi.toFixed(1), px: cnt,
      fMedio: cnt ? suma / cnt : 0, nivelMedio: cnt ? sumaE2 / cnt : 0 });
  }

  /* ── resultado y comparación con el baseline s25 ── */
  var res = {
    obj: OBJ, etiqueta: ETIQ, escalas: ESCALAS, rads: rads, multi: !!MULTI,
    cfg: CFG, fecha: '2026-08-15',
    flags: { opacidadInternaEscena: PS1.opacidadInternaEscena,
             confianzaLocalNaN: PS1.confianzaLocalNaN, mezclaCajaAs: PS1.mezclaCajaAs,
             deltaMin: PS1.deltaMin, deltaPlena: PS1.deltaPlena, deltaExp: PS1.deltaExp },
    parche: { ancho: W, alto: H, escalaAs: F.escalaAs, escParche: escParche,
              cielo: cieloP, sigma: sigmaP },
    ctx: { SBe: c.SBe, umbralSB: umbral, nivelFondo: c.nivelFondo, Cmin: c.Cmin },
    thetaR: { aparenteArcmin: thetaRmin, intrinsecoArcsec: sopFisico },
    shaFotometriaPre: shaPre,
    msSoporte: +msSoporte.toFixed(1),
    clasificacion: cuenta, soloRampa: soloRampa,
    rois: resumenRois, cieloCampo: cieloRes, anillos: anillos
  };

  var BASE_JSON = path.join(OUT, 'barrido_' + OBJ + '_s' + PS1.mezclaCajaAs + '.json');
  var E_BIN = path.join(OUT, 'E_s' + PS1.mezclaCajaAs + '.bin');
  if (ES_BASE) {
    fs.writeFileSync(E_BIN, Buffer.from(E.buffer, E.byteOffset, E.byteLength));
    /* debe reproducir la Fase 1 (mismo pipeline, mismas reglas) */
    if (fs.existsSync(BASE_F1)) {
      var f1 = JSON.parse(fs.readFileSync(BASE_F1, 'utf8'));
      exige(f1.clasificacion.negros === cuenta.negros &&
            f1.clasificacion.b === cuenta.b && f1.clasificacion.c === cuenta.c,
        'reproduce el baseline de Fase 1 (negros=' + cuenta.negros + ' vs ' +
        f1.clasificacion.negros + ', b=' + cuenta.b + ' vs ' + f1.clasificacion.b + ')');
    }
  } else if (fs.existsSync(BASE_JSON)) {
    var b0 = JSON.parse(fs.readFileSync(BASE_JSON, 'utf8'));
    exige(b0.shaFotometriaPre === shaPre,
      'fotometría pre-opacidad bit a bit idéntica al baseline');
    exige(b0.cfg.D === CFG.D && b0.cfg.M === CFG.M && b0.cfg.sqm === CFG.sqm,
      'misma configuración que el baseline');
    /* deltas contra baseline */
    var Eb = new Float32Array(fs.readFileSync(E_BIN).buffer.slice(0));
    var rms = 0, nium = 0;
    for (i = 0; i < n; i++) { var d2 = E[i] - Eb[i]; rms += d2 * d2; nium++; }
    res.rmsNivelVsBase = Math.sqrt(rms / nium);
    res.anillosDeltaMag = anillos.map(function (an, k2) {
      var fb = b0.anillos[k2].fMedio;
      return { dLo: an.dLo, dHi: an.dHi,
        deltaMag: an.fMedio > 0 && fb > 0 ? -2.5 * Math.log10(an.fMedio / fb)
                : (an.fMedio === fb ? 0 : null),
        fMedio: an.fMedio, fMedioBase: fb };
    });
    res.cieloDeltaFracOpPos = cieloRes.fracOpPos - b0.cieloCampo.fracOpPos;
    res.cieloDeltaNivel = cieloRes.nivelMedio - b0.cieloCampo.nivelMedio;
    /* PNG de diferencia: rojo = más brillante que el baseline, azul = más oscuro */
    var rgbD = new Uint8Array(n * 3);
    for (i = 0; i < n; i++) {
      var dd = E[i] - Eb[i], g0 = grisA(Eb[i] * 0.35);
      rgbD[i * 3] = grisA(g0 + Math.max(0, dd) * 8);
      rgbD[i * 3 + 1] = g0;
      rgbD[i * 3 + 2] = grisA(g0 + Math.max(0, -dd) * 8);
    }
    png('diff_' + ETIQ, rgbD, SIZE, SIZE);
  }

  fs.writeFileSync(path.join(OUT, 'barrido_' + OBJ + '_' + ETIQ + '.json'),
    JSON.stringify(res, null, 1));

  /* PNGs de la escala */
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

  /* resumen en consola */
  console.log('  θR(SBe=' + c.SBe.toFixed(2) + ') = ' + thetaRmin.toFixed(1) +
    '′ aparentes → ' + sopFisico.toFixed(1) + '″ intrínsecos (α=1)');
  console.log('  negros=' + cuenta.negros + '  b=' + cuenta.b + '  soloRampa=' + soloRampa);
  if (resumenRois.length) {
    resumenRois.forEach(function (r5) {
      console.log('  ' + r5.nombre + ' (' + r5.tipo + '): negros=' + r5.negros +
        ' (b=' + r5.negrosB + ', frac=' + r5.fracNegros.toFixed(3) + ')  op med=' +
        r5.op.mediana.toFixed(3) + ' p90=' + r5.op.p90.toFixed(3));
    });
  }
  console.log('  cieloCampo: fracOp>0=' + cieloRes.fracOpPos.toFixed(4) +
    '  nivel=' + cieloRes.nivelMedio.toFixed(3));
  if (res.rmsNivelVsBase != null) console.log('  RMS nivel vs s25: ' + res.rmsNivelVsBase.toFixed(3));
  console.log('  JSON: barrido_' + OBJ + '_' + ETIQ + '.json');
  process.exit(fallos ? 1 : 0);
}).catch(function (e) { console.error(e); process.exit(2); });
