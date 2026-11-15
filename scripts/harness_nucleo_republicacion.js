#!/usr/bin/env node
/* ¿Cuánto brilla el núcleo de cada objeto del banco DSO, antes y después de una
   republicación? (#560)

   Los tests miden geometría, cielo y bytes; ninguno mira cuánto brilla el objeto
   en pantalla. La tirada v3 de #320 los pasó todos y apagó 13 difusas (+0,5 a
   +3,3 mag/″²; NGC 1788 dejó de verse) porque el parche creció y el anclaje
   repartía la luz del catálogo entre más píxeles. Este arnés es lo que lo habría
   detectado: **se ejecuta antes de cualquier tirada que cambie lados.**

   Núcleo = media del flujo anclado (ps1AnclarACatalogo, la función de
   producción con el cielo y la σ del sidecar y la apertura de su `marco`) en el
   cuadrado de 30″ del centro del parche, en mag/″². Sin quitar estrellas: eso
   pide Gaia y esto no toca la red; el sesgo es el mismo antes y después.

   Uso:
     node scripts/harness_nucleo_republicacion.js --antes <dir> --despues <dir>
       Cada <dir> tiene los PNG, los sidecars y un `manifiesto.js` (el
       dso-texturas-datos.js de esa tirada). Sin `manifiesto.js`, el del árbol.
     --ley-antes vieja   ancla el «antes» repartiendo en el parche entero (la ley
                         previa al ADR 0037), para comparar contra lo publicado.
     --solo NGC1788      un objeto.

   Sale con código 1 si algún objeto que cambia de lado se aleja más de 0,3
   mag/″², o uno que no cambia más de 0,05 (los listones de #560). */
'use strict';

var fs = require('fs'), path = require('path'), vm = require('vm');
var RAIZ = path.join(__dirname, '..');

global.window = global.window || {};
require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-ps1.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-png16.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'nebulosas-datos.js'));
var PS1 = window.BitacoraPS1, P16 = window.BitacoraPNG16;

var LISTON_CRECE = 0.3, LISTON_IGUAL = 0.05, NUCLEO_AS = 30;

function arg(n, d) {
  var i = process.argv.indexOf(n);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
}

/* El manifiesto de una tirada, en un contexto aparte: en `window` cambiaría el
   lado de los demás objetos (ps1LadoDeFila). */
function manifiesto(dir) {
  var f = path.join(dir, 'manifiesto.js');
  if (!fs.existsSync(f)) f = path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'dso-texturas-datos.js');
  var w = {};
  vm.runInNewContext(fs.readFileSync(f, 'utf8'), { window: w });
  var porNombre = {};
  (w.BITACORA_DSO_TEXTURAS || []).forEach(function (t) { if (t[1] === 'imagen') porNombre[t[0]] = t; });
  return porNombre;
}

var catalogo = PS1.ps1CatalogoDifuso(window.BITACORA_GALAXIAS, window.BITACORA_NEBULOSAS);
function filaCatalogo(nombre) {
  for (var i = 0; i < catalogo.length; i++) if (catalogo[i][0] === nombre) return catalogo[i];
  return null;
}

/* Núcleo en mag/″² del objeto `nombre` según la fila `t` del manifiesto. */
function nucleo(dir, t, leyVieja) {
  var base = path.join(dir, PS1.ps1IdTextura(t[0]) + '.' + t[2]);
  if (!fs.existsSync(base + '.png') || !fs.existsSync(base + '.json')) return Promise.resolve(null);
  var sc = JSON.parse(fs.readFileSync(base + '.json', 'utf8'));
  return P16.leer(fs.readFileSync(base + '.png')).then(function (img) {
    var f = filaCatalogo(t[0]);
    if (!img || !f) return null;
    var datos = P16.decodificar(img.u16, sc.codificacion);
    var gal = PS1.ps1GalaxiasDelCampo([f], f[2], f[3], PS1.ps1LadoArcmin(f[4]))[0];
    var lado = t[7] > 0 ? t[7] : gal.ladoArcmin;
    var vec = PS1.ps1CieloDeSidecar(sc) || {};
    var o = {
      magV: gal.magV, n: gal.n, reArcsec: gal.reArcsec, ladoArcmin: lado,
      escalaAs: sc.escalaAs, cielo: vec.cielo, sigma: vec.sigma
    };
    var ap = leyVieja ? null : PS1.ps1LadoApertura(sc);
    if (ap) o.ladoApertura = ap;
    var a = PS1.ps1AnclarACatalogo(datos, img.ancho, img.alto, o);
    var r = NUCLEO_AS / 2 / sc.escalaAs, cx = (img.ancho - 1) / 2, cy = (img.alto - 1) / 2;
    var s = 0, n = 0;
    for (var y = Math.ceil(cy - r); y <= cy + r; y++) {
      for (var x = Math.ceil(cx - r); x <= cx + r; x++) {
        var v = a[y * img.ancho + x];
        if (v === v) { s += v; n++; }
      }
    }
    return { lado: lado, ap: ap, mu: s > 0 ? -2.5 * Math.log10(s / n) : Infinity };
  });
}

function main() {
  var dirA = arg('--antes'), dirD = arg('--despues'), solo = arg('--solo');
  if (!dirA || !dirD) { console.error('Uso: --antes <dir> --despues <dir> [--ley-antes vieja] [--solo X]'); process.exit(2); }
  var mA = manifiesto(dirA), mD = manifiesto(dirD), viejaA = arg('--ley-antes') === 'vieja';
  var nombres = Object.keys(mD).filter(function (n) { return !solo || n === solo; });
  Object.keys(mA).forEach(function (n) {
    if (!mD[n] && (!solo || n === solo)) console.log(n + ': está antes y no después (¿sale del banco?)');
  });
  var fuera = 0, filas = [];
  return nombres.reduce(function (p, n) {
    return p.then(function () {
      return Promise.all([mA[n] ? nucleo(dirA, mA[n], viejaA) : null, nucleo(dirD, mD[n], false)]).then(function (r) {
        // Sin medir es fallo: en un clon sin PNG todo saldría verde.
        if (!r[0] || !r[1]) { fuera++; return filas.push([n, 'SIN MEDIR (falta PNG o fila de catálogo)']); }
        var crece = Math.abs(r[1].lado - r[0].lado) > 1e-6;
        var d = r[1].mu - r[0].mu, liston = crece ? LISTON_CRECE : LISTON_IGUAL;
        var ok = Math.abs(d) <= liston || (!isFinite(r[0].mu) && !isFinite(r[1].mu));
        if (!ok) fuera++;
        function ap(x) { return x.ap ? ' [ap ' + x.ap.toFixed(2) + '′]' : ''; }
        filas.push([n, r[0].lado.toFixed(2) + '′' + ap(r[0]) + ' → ' + r[1].lado.toFixed(2) + '′' + ap(r[1]),
          r[0].mu.toFixed(2) + ' → ' + r[1].mu.toFixed(2),
          (d >= 0 ? '+' : '') + d.toFixed(2), (crece ? 'crece ' : 'igual ') + (ok ? 'ok' : 'FUERA (±' + liston + ')')]);
      });
    });
  }, Promise.resolve()).then(function () {
    console.log('núcleo de ' + NUCLEO_AS + '″ (mag/″²) · antes ' + dirA + (viejaA ? ' [ley vieja]' : '') + ' · después ' + dirD);
    filas.sort(function (a, b) { return Math.abs(parseFloat(b[3]) || 0) - Math.abs(parseFloat(a[3]) || 0); });
    filas.forEach(function (f) { console.log(f.join('  ·  ')); });
    console.log('\n' + filas.length + ' objetos · ' + fuera + ' fuera de listón');
    process.exit(fuera ? 1 : 0);
  });
}

main();
