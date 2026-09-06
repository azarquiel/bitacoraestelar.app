#!/usr/bin/env node
/* ¿De dónde salen los flips de ausencia de la fase 0?

   La ida y vuelta por asinh16 deja algunos píxeles cambiando de lado en
   `v < cielo − kσ`. La pregunta no es cuántos, sino DÓNDE: si todos están
   pegados al corte, es la frontera —cualquier codificación que pierda el
   último bit los tendrá, y también los tendría float32 tras un gzip que no
   fuese exacto—; si hay alguno lejos, el códec está mal.

     node scripts/harness_dso_fase0_flips.js "NGC 7331" */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/bitacora-ps1.js');
var R = global.window.BitacoraGaiaRender;
var PS1 = window.BitacoraPS1;
var B = require('./lib_banco_dso.js')(R);
var BAJAR = require('./lib_bajar_parche.js')(R);
var COD = require('../resources/js/bitacora-png16.js');

var nombre = process.argv[2] || 'NGC 7331';
var b = B.banco();
var o = b.objetos.filter(function (x) { return B.clave(x.nombre) === B.clave(nombre); })[0];
if (!o) { console.error('no está en el banco: ' + nombre); process.exit(1); }

BAJAR.bajar(o.gal.ra, o.gal.dec, o.gal.ladoArcmin, 1024, 'g', true).then(function (F) {
  var d = F.datos;
  var cielo = PS1.ps1Cielo(d, F.ancho, F.alto);
  var sigma = PS1.ps1SigmaCielo(d, F.ancho, F.alto, cielo);
  var corte = cielo - PS1.cfg.kAusencia * sigma;

  [['a = σ', sigma], ['a = σ/4', sigma / 4]].forEach(function (par) {
    var cod = COD.codificar(d, par[1]);
    var dd = COD.decodificar(cod.u16, cod);
    var dist = [], peor = 0;
    for (var i = 0; i < d.length; i++) {
      var v = d[i], w = dd[i];
      if (v !== v || w !== w) continue;
      if ((v < corte) === (w < corte)) continue;
      var dc = Math.abs(v - corte) / sigma;
      dist.push(dc);
      if (dc > peor) peor = dc;
    }
    dist.sort(function (x, y) { return x - y; });
    console.log(nombre + '  ' + par[0] + ':  cielo=' + cielo.toFixed(2) + '  σ=' + sigma.toFixed(2) +
      '  corte=' + corte.toFixed(2));
    console.log('   flips: ' + dist.length + ' de ' + d.length +
      ' (' + (dist.length / d.length * 100).toFixed(5) + ' %)');
    console.log('   distancia al corte, en σ:  mediana ' +
      (dist.length ? dist[dist.length >> 1].toExponential(2) : '-') +
      '   máx ' + (dist.length ? peor.toExponential(2) : '-'));
    console.log('   paso de cuantización cerca del cielo, en σ: ' +
      (par[1] * (cod.uMax - cod.uMin) / COD.PASOS / sigma).toExponential(2));
  });
}).catch(function (e) { console.error(e); process.exit(1); });
