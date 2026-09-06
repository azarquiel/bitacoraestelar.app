#!/usr/bin/env node
/* Dos preguntas sobre la codificación, que la fase 0 tiene que pesar antes de
   que la fase 1 se comprometa: con qué filtro se escribe el PNG, y con qué `a`
   se codifica el asinh.

   1 · ¿Cuánto comprime de verdad un PNG de 16 bits, y con qué filtro?

   La tabla 4.2 del objetivo estima ×0,6 y la medida del banco da ×0,95 en
   cuanto el parche llega a la escala nativa del stack: a partir de ahí el
   píxel es ruido y el ruido no comprime. Antes de dar por buena esa cifra —de
   la que cuelga medio giga— hay que probar los filtros que el propio PNG trae:
   sobre muestras de 16 bits el desplazamiento del filtro es de 2 bytes, así
   que Sub predice el byte alto con el byte alto y el bajo con el bajo, que es
   justo la separación que el ruido pide.

   2 · ¿Y cuánto de ese peso es información? Con a = σ el paso de cuantización
   cerca del cielo vale ~2e-4 σ: se están guardando cuatro dígitos por debajo
   del ruido, y el ruido es incompresible por definición. Subir `a` engorda el
   paso cerca del cielo sin tocar la ley —sigue siendo invertible y declarada—,
   así que la pregunta es hasta dónde puede subir antes de que el error se
   acerque al 0,05·σ de L1.1 o de que los flips crezcan.

   Sin red: usa los parches que la fase 0 ya dejó en $PS1_HARNESS_DIR.

     node scripts/harness_dso_fase0_codificacion.js [n objetos] */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/bitacora-ps1.js');
var R = global.window.BitacoraGaiaRender;
var PS1 = window.BitacoraPS1;
var B = require('./lib_banco_dso.js')(R);
var BAJAR = require('./lib_bajar_parche.js')(R);
var COD = require('../resources/js/bitacora-png16.js');
var zlib = require('zlib');

var NOMBRES = ['Abell 12', 'NGC 7008', 'NGC 3377', 'NGC 3587', 'NGC 4486',
               'NGC 5194', 'NGC 5457', 'NGC 1952'];
var FILTROS = ['0 None', '1 Sub', '2 Up', '3 Average', '4 Paeth'];

/* Los cinco filtros del PNG, con bpp = 2 (gris de 16 bits). Es la definición
   del formato, no una variante: se implementan aquí solo para pesarlos. */
function filtrar(u16, W, H, tipo) {
  var raw = Buffer.alloc((W * 2 + 1) * H), bpp = 2, ancho = W * 2;
  var linea = Buffer.alloc(ancho), previa = Buffer.alloc(ancho);
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) linea.writeUInt16BE(u16[y * W + x], x * 2);
    var o = y * (ancho + 1);
    raw[o] = tipo;
    for (var i = 0; i < ancho; i++) {
      var a = i >= bpp ? linea[i - bpp] : 0, b = previa[i], c = i >= bpp ? previa[i - bpp] : 0, v;
      switch (tipo) {
        case 0: v = linea[i]; break;
        case 1: v = linea[i] - a; break;
        case 2: v = linea[i] - b; break;
        case 3: v = linea[i] - ((a + b) >> 1); break;
        default:
          var p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = linea[i] - (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c));
      }
      raw[o + 1 + i] = v & 255;
    }
    linea.copy(previa);
  }
  return raw;
}

var b = B.banco();
var lista = NOMBRES.map(function (n) {
  return b.objetos.filter(function (o) { return B.clave(o.nombre) === B.clave(n); })[0];
}).filter(Boolean).slice(0, +(process.argv[2] || 99));

var FACTORES = [0.25, 1, 4, 16, 64, 256];   // a = factor · σ
var barrido = FACTORES.map(function () { return { bytes: 0, err: 0, rel: 0, flips: 0, paso: 0 }; });

var cadena = Promise.resolve(), suma = FILTROS.map(function () { return 0; }), px = 0;
console.log('objeto           ″/px   ' + FILTROS.map(function (f) { return f.slice(2).padStart(8); }).join(''));
lista.forEach(function (o) {
  cadena = cadena.then(function () {
    return BAJAR.bajar(o.gal.ra, o.gal.dec, o.gal.ladoArcmin, 1024, 'g', true).then(function (F) {
      var cielo = PS1.ps1Cielo(F.datos, F.ancho, F.alto);
      var sigma = PS1.ps1SigmaCielo(F.datos, F.ancho, F.alto, cielo);
      var cod = COD.codificar(F.datos, sigma);
      var n = F.ancho * F.alto;
      var bs = FILTROS.map(function (_, t) {
        return zlib.deflateSync(filtrar(cod.u16, F.ancho, F.alto, t), { level: 9 }).length;
      });
      bs.forEach(function (v, i) { suma[i] += v; });
      px += n;

      /* 2 · barrido de `a`, con el mejor filtro de la tabla de arriba (Sub). */
      var corte = cielo - PS1.cfg.kAusencia * sigma;
      FACTORES.forEach(function (fa, i) {
        var c2 = COD.codificar(F.datos, fa * sigma);
        var dd = COD.decodificar(c2.u16, c2);
        var err = 0, rel = 0, flips = 0;
        for (var j = 0; j < n; j++) {
          var v0 = F.datos[j], w0 = dd[j];
          if (v0 !== v0 || w0 !== w0) continue;
          if (Math.abs(v0) < 5 * sigma) { var e = Math.abs(w0 - v0) / sigma; if (e > err) err = e; }
          else { var r = Math.abs(w0 / v0 - 1); if (r > rel) rel = r; }
          if ((v0 < corte) !== (w0 < corte)) flips++;
        }
        var s2 = barrido[i];
        s2.bytes += zlib.deflateSync(filtrar(c2.u16, F.ancho, F.alto, 1), { level: 9 }).length;
        s2.err = Math.max(s2.err, err); s2.rel = Math.max(s2.rel, rel); s2.flips += flips;
        s2.paso = Math.max(s2.paso, c2.a * (c2.uMax - c2.uMin) / COD.PASOS / sigma);
      });
      console.log(o.nombre.padEnd(15) + F.escalaAs.toFixed(3) + '  ' +
        bs.map(function (v) { return (v / n).toFixed(2).padStart(8); }).join(''));
    });
  });
});

cadena.then(function () {
  console.log('\ntotal, bytes/px: ' + suma.map(function (v) { return (v / px).toFixed(3); }).join('  '));
  var mejor = suma.indexOf(Math.min.apply(null, suma));
  console.log('mejor filtro: ' + FILTROS[mejor] + '  →  ' + (suma[mejor] / px).toFixed(3) +
    ' B/px = ×' + (suma[mejor] / (px * 2)).toFixed(3) + ' del crudo de 16 bits');

  console.log('\n═══ 2 · barrido de a (filtro Sub) ═══');
  console.log('   a        paso cerca del cielo (σ)   err máx (σ)   err rel máx   flips   B/px   ×crudo');
  FACTORES.forEach(function (fa, i) {
    var s2 = barrido[i];
    console.log('   ' + (fa + 'σ').padEnd(8) + s2.paso.toExponential(2).padStart(18) +
      s2.err.toExponential(2).padStart(17) + s2.rel.toExponential(2).padStart(14) +
      String(s2.flips).padStart(8) + (s2.bytes / px).toFixed(3).padStart(8) +
      ('×' + (s2.bytes / (px * 2)).toFixed(3)).padStart(9));
  });
  console.log('\n   L1.1 pide err ≤ 0,05 σ. El listón NO se mueve: la tabla dice hasta dónde');
  console.log('   puede subir `a` sin acercarse a él, y qué volumen se ahorra a cambio.');
}).catch(function (e) { console.error(e); process.exit(1); });
