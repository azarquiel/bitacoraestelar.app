/* Render de M51 con la capa de galaxias ENCENDIDA, fuera del navegador: pide el
   parche al ps1-proxy.php que corre en localhost, lo ancla, lo pinta y saca un
   PNG en escala de grises con la misma cadena de DN que pintarFot.
   Uso: node render-m51.js [urlProxy] */
'use strict';
var zlib = require('zlib'), fs = require('fs'), path = require('path');
global.window = {};
require(path.join(__dirname, '../../resources/js/bitacora-gaia-render.js'));
var R = global.window.BitacoraGaiaRender;
var PROXY = process.argv[2] || 'http://127.0.0.1:8765/ps1-proxy.php';

// NGC 5194 (M51), fila tal cual de galaxias-datos.js.
var FILA = ["NGC 5194", "UGC 8493", 202.47208, 47.19667, 180.35, 0.617, 163, 8.21, 1, 0.15, 0, 3.87];
var gal = {
  nombre: FILA[0], ra: FILA[2], dec: FILA[3], reArcsec: FILA[4], ba: FILA[5],
  pa: FILA[6], magV: FILA[7], n: FILA[8], bt: FILA[9], nMedido: FILA[11],
  ladoArcmin: R.ps1LadoArcmin(FILA[4])
};

var SIZE = 600, CAMPO = 40;            // px del lienzo y campo en ′
var CIELO = { sqm: 21, pupilaSalida: Number(process.env.PUPILA || 2), pupilaOjo: 7,
              transmision: 0.9, perceptual: true, realceMax: R.ps1.realceMax, aumentos: 100 };
var SUFIJO = process.env.SUFIJO || '';
if (process.env.AJUSTE) R.ps1.haloAjustes['NGC 5194'] = JSON.parse(process.env.AJUSTE);

function png(gris, ancho, alto) {
  var filas = Buffer.alloc((ancho + 1) * alto);
  for (var y = 0; y < alto; y++) {
    filas[y * (ancho + 1)] = 0;
    for (var x = 0; x < ancho; x++) filas[y * (ancho + 1) + 1 + x] = gris[y * ancho + x];
  }
  function trozo(tipo, datos) {
    var largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length);
    var cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
    var crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(cuerpo) : crc32(cuerpo));
    return Buffer.concat([largo, cuerpo, crc]);
  }
  function crc32(buf) {                              // node < 22.7 no trae zlib.crc32
    var c, t = [], n, k;
    for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    c = 0xffffffff;
    for (n = 0; n < buf.length; n++) c = t[(c ^ buf[n]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0); ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8; ihdr[9] = 0;                          // 8 bits, gris
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    trozo('IHDR', ihdr), trozo('IDAT', zlib.deflateSync(filas)), trozo('IEND', Buffer.alloc(0))]);
}

/* La misma cadena que pintarFot para el canal difuso: visibilidadDifusa salvo en
   la máscara del halo, realce perceptual y valorDeFlujo. */
function aDN(difuso, mask) {
  var c = R.ctxFotometrico(CIELO), out = new Uint8Array(difuso.length), pintados = 0, suma = 0;
  for (var i = 0; i < difuso.length; i++) {
    var esHalo = !!(mask && mask[i]);
    var s = esHalo ? 1 : R.visibilidadDifusa(difuso[i], c.Fcielo * c.Cmin, true);
    var F = difuso[i] * s;
    if (F > 0) F = R.realzarPerceptual(F, c.Fcielo, c.rango, esHalo ? 0 : s, CIELO.realceMax);
    var dn = F > 0 ? R.valorDeFlujo(F, c.Fcielo, c.rango) : 0;
    if (dn > 0.5) { pintados++; suma += dn; }
    out[i] = Math.max(0, Math.min(255, Math.round(dn)));
  }
  return { gris: out, pintados: pintados, dnMedia: pintados ? suma / pintados : 0 };
}

function pintar(parche, conHalo) {
  var difuso = new Float32Array(SIZE * SIZE);
  var cielo = Object.assign({}, CIELO);
  var p = Object.assign({}, parche);
  if (!conHalo) p.halo = Object.assign({}, parche.halo, { halo: null });
  R.ps1PintarParche(difuso, p, { ra0: gal.ra, dec0: gal.dec, arcmin: CAMPO, size: SIZE, cielo: cielo });
  return { difuso: difuso, mask: cielo.haloMask };
}

// Brillo del modelo a lo largo de los dos ejes, en mag/arcsec².
function perfil(comps, hc, k) {
  var a = gal.pa * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a), r = k * gal.reArcsec;
  function mu(n, e) {
    var F = Math.max(R.ps1FlujoModelo(comps, gal.pa, n, e), hc ? R.ps1FlujoHalo(hc, n, e) : 0);
    return F > 0 ? -2.5 * Math.log10(F) : NaN;
  }
  return { mayor: mu(r * cs, r * sn), menor: mu(-r * sn, r * cs) };
}

fetch(PROXY + '?ra=' + gal.ra.toFixed(5) + '&dec=' + gal.dec.toFixed(5) +
      '&lado=' + gal.ladoArcmin.toFixed(2) + '&salida=' + R.ps1.salida + '&banda=' + R.ps1.banda)
  .then(function (r) { if (!r.ok) throw new Error('proxy ' + r.status); return r.arrayBuffer(); })
  .then(function (buf) {
    var f = R.parseFITS(buf);
    if (!f) throw new Error('el proxy no devolvió un FITS');
    if (!(f.escalaAs > 0)) f.escalaAs = gal.ladoArcmin * 60 / f.ancho;
    var comps = R.ps1ComponentesSersic(gal), med = R.ps1MedidasHalo(gal, comps);
    var parche = {
      ra: gal.ra, dec: gal.dec, ladoArcmin: gal.ladoArcmin, ancho: f.ancho, alto: f.alto,
      comps: comps, pa: gal.pa, halo: med,
      datos: R.ps1AnclarACatalogo(f.datos.slice(0), f.ancho, f.alto, {
        magV: gal.magV, n: gal.n, reArcsec: gal.reArcsec,
        ladoArcmin: gal.ladoArcmin, escalaAs: f.escalaAs
      })
    };
    var h = med.halo;
    console.log('M51: r_e=' + gal.reArcsec + '"  b/a=' + gal.ba + '  PA=' + gal.pa +
      '  parche=' + gal.ladoArcmin.toFixed(1) + "' (" + f.ancho + '×' + f.alto + ' px)');
    console.log('puerta halo=' + R.ps1HaloActivo(med) + '  μ_medio=' + med.muProm.toFixed(2));
    console.log('halo: r_e=' + (h.re / 60).toFixed(2) + "'  n=" + h.n + '  b/a=' + h.q.toFixed(3) +
      '  PA=' + gal.pa + '  alcance=' + (h.rMax / 60).toFixed(1) + "' (" +
      (h.rMax / gal.reArcsec).toFixed(1) + '·r_e)');
    console.log('disco solo: alcance=' + (R.ps1RadioHaloAs(comps) / 60).toFixed(1) + "' (" +
      (R.ps1RadioHaloAs(comps) / gal.reArcsec).toFixed(1) + '·r_e)');
    console.log('\nμ del modelo (mag/arcsec²), eje mayor / menor:');
    [0.5, 1, 1.5, 2, 3, 4].forEach(function (k) {
      var sin = perfil(comps, null, k), con = perfil(comps, h, k);
      console.log('  ' + k.toFixed(1) + '·r_e   sin halo ' +
        (isNaN(sin.mayor) ? ' —  ' : sin.mayor.toFixed(2)) + ' / ' +
        (isNaN(sin.menor) ? ' —  ' : sin.menor.toFixed(2)) + '   con halo ' +
        (isNaN(con.mayor) ? ' —  ' : con.mayor.toFixed(2)) + ' / ' +
        (isNaN(con.menor) ? ' —  ' : con.menor.toFixed(2)));
    });
    [['antes', false], ['despues', true]].forEach(function (par) {
      var r = pintar(parche, par[1]), dn = aDN(r.difuso, r.mask);
      var ruta = path.join(__dirname, 'm51-' + par[0] + SUFIJO + '.png');
      fs.writeFileSync(ruta, png(dn.gris, SIZE, SIZE));
      console.log('\n' + par[0] + ': ' + dn.pintados + ' px sobre el cielo, DN media ' +
        dn.dnMedia.toFixed(1) + '  → ' + path.basename(ruta));
    });
  })
  .catch(function (e) { console.error('FALLO: ' + e.message); process.exit(1); });
