#!/usr/bin/env node
/* SONDA: qué hace de verdad `output_size` de fitscut. Pide el MISMO campo a
   varias resoluciones y compara.

   Hace red (a ps1images.stsci.edu). Por eso vive aparte de los tests: estos no
   pueden depender de que haya línea. Los números que deja se citan en el informe
   y están clavados como constantes en test_resolucion_ps1.js, así que si el
   servicio cambia de comportamiento, el test lo delata sin necesidad de red.

   Uso:  node scripts/sonda_resolucion_ps1.js [ra] [dec] [ladoArcmin] */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/bitacora-ps1.js');
var R = global.window.BitacoraGaiaRender;
var PS1 = window.BitacoraPS1.cfg;
var https = require('https');

var RA = Number(process.argv[2] || 202.46957);      // M51
var DEC = Number(process.argv[3] || 47.19526);
var LADO = Number(process.argv[4] || 8);            // ′
var NATIVA = 0.25;                                   // ″/px del stack
var SIZE = Math.round(LADO * 60 / NATIVA);           // px nativos que abarca el campo
var SALIDAS = [512, 1024, SIZE, Math.round(SIZE * 1.07)];   // la última pasa de nativo A PROPÓSITO

function f(v, d) { return (v == null || !isFinite(v)) ? '-' : v.toFixed(d == null ? 3 : d); }

function bajar(url) {
  return new Promise(function (res, rej) {
    var t0 = Date.now();
    https.get(url, { headers: { 'User-Agent': 'simulador-ocular/1.0' } }, function (r) {
      if (r.statusCode !== 200) { r.resume(); return rej(new Error('HTTP ' + r.statusCode)); }
      var trozos = [];
      r.on('data', function (c) { trozos.push(c); });
      r.on('end', function () { res({ buf: Buffer.concat(trozos), ms: Date.now() - t0 }); });
    }).on('error', rej);
  });
}

function nombres() {
  return bajar('https://ps1images.stsci.edu/cgi-bin/ps1filenames.py?ra=' + RA +
    '&dec=' + DEC + '&filters=' + PS1.banda).then(function (r) {
      var l = r.buf.toString().trim().split(/\r?\n/).slice(1);
      for (var i = 0; i < l.length; i++) {
        var c = l[i].trim().split(/\s+/);
        if (c.length >= 8 && c[7][0] === '/') return c[7];
      }
      throw new Error('sin skycell para esa posición');
    });
}

/* Lo que interesa de cada recorte: escala, flujo por ″² (que es lo que consume
   el render, ver areaPx en ps1PintarParche), flujo total, pico y no finitos. */
function medir(f2) {
  var d = f2.datos, s = 0, n = 0, nan = 0, mx = -Infinity;
  for (var i = 0; i < d.length; i++) {
    if (isFinite(d[i])) { s += d[i]; n++; if (d[i] > mx) mx = d[i]; } else nan++;
  }
  var area = f2.escalaAs * f2.escalaAs;
  return { esc: f2.escalaAs, ancho: f2.ancho, media: s / n, total: s * area,
           pico: mx, nan: nan, fracNan: nan / d.length };
}

nombres().then(function (celda) {
  console.log('\n═══ Sonda de output_size · campo de ' + LADO + '′ = ' + SIZE + ' px nativos ═══');
  console.log('  skycell: ' + celda);
  var prev = null, cadena = Promise.resolve();
  SALIDAS.forEach(function (os) {
    cadena = cadena.then(function () {
      var url = 'https://ps1images.stsci.edu/cgi-bin/fitscut.cgi?red=' + encodeURIComponent(celda) +
        '&x=' + RA + '&y=' + DEC + '&size=' + SIZE + '&output_size=' + os + '&format=fits&wcs=1';
      return bajar(url).then(function (r) {
        var ab = r.buf.buffer.slice(r.buf.byteOffset, r.buf.byteOffset + r.buf.byteLength);
        var m = medir(window.BitacoraPS1.parseFITS(ab));
        var nota = os > SIZE ? '  ← PASA DE NATIVO: interpola' : (os === SIZE ? '  ← nativo' : '');
        console.log('\n  output_size = ' + os + nota);
        console.log('    NAXIS1 ' + m.ancho + ' · escalaAs ' + f(m.esc, 4) + '″/px · ' +
          f(r.buf.length / 1048576, 2) + ' MB · ' + f(r.ms / 1000, 1) + ' s');
        console.log('    flujo/px (brillo superficial) ' + f(m.media, 4) +
          ' · flujo TOTAL ' + f(m.total, 0));
        console.log('    pico ' + f(m.pico, 0) + ' · no finitos ' + f(100 * m.fracNan, 1) + ' %');
        if (prev) {
          console.log('    vs anterior: flujo total ' + f(100 * (m.total / prev.total - 1), 3) +
            ' % · pico ×' + f(m.pico / prev.pico, 3));
        }
        prev = m;
      });
    });
  });
  return cadena;
}).then(function () {
  console.log('\n  Qué mirar:');
  console.log('   · el flujo TOTAL no debe moverse: fitscut remuestrea conservando brillo');
  console.log('     superficial, y eso es justo lo que consume el render (areaPx = escalaAs²).');
  console.log('   · el PICO sí sube al afinar: es resolución real que se recupera…');
  console.log('   · …pero deja de subir al llegar a nativo. Si el último escalón no mueve el');
  console.log('     pico, está confirmado que pasar de `size` solo interpola, y no se pide.');
}).catch(function (e) {
  console.error('  sonda no concluida: ' + e.message);
  process.exit(1);
});
