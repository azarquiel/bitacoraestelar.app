#!/usr/bin/env node
/* GOLDEN bit-exacto de la capa difusa PS1 (guardián de la rama nebulosa
   planetaria; entregable 5.1 aprobado el 18-ago-2026).

   Para cada galaxia de control monta el parche con la MISMA composición que
   ps1ParcheDeGalaxia (lib_parche_produccion.js, funciones de producción) y
   pinta con window.BitacoraPS1.ps1PintarParche en configuraciones fijas. Se comparan SHA-256
   de los bytes crudos de `parche.datos` (post quitar-estrellas + anclaje) y
   del buffer `difuso` final: cualquier bit distinto = FALLO.

   Entradas clavadas: CSV de Gaia versionados (scripts/fixtures/gaia/, ver
   gen_fixtures_gaia.js) y parches PS1 de la caché de lib_bajar_parche
   ($PS1_HARNESS_DIR o tmpdir; primera corrida descarga de STScI — los stacks
   PS1 son inmutables).

   Nota: los hashes dependen de libm de la máquina (Math.exp/pow). El golden
   garantiza no-regresión en una misma máquina y versión de Node; no es un
   contrato entre máquinas.

   Uso:  node scripts/test_golden_difusas.js             (compara)
         node scripts/test_golden_difusas.js --capturar  (fija la línea base) */
'use strict';

var fs = require('fs'), path = require('path'), crypto = require('crypto');
var RAIZ = path.join(__dirname, '..');
global.window = {};
require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-ps1.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js'));
var R = global.window.BitacoraGaiaRender, PS1 = window.BitacoraPS1.cfg;
var CAT = global.window.BITACORA_GALAXIAS;
var B = require('./lib_bajar_parche.js')(R);
var P = require('./lib_parche_produccion.js')(R);

var FICH = path.join(__dirname, 'fixtures', 'golden_difusas.json');
var GAIA = path.join(__dirname, 'fixtures', 'gaia');
var CAPTURAR = process.argv.indexOf('--capturar') >= 0;

var OBJS = [
  { cat: 'NGC 5194', alias: 'M51',  csv: 'gaia_ngc5194.csv' },
  { cat: 'NGC 5457', alias: 'M101', csv: 'gaia_ngc5457.csv' },
  { cat: 'NGC 4594', alias: 'M104', csv: 'gaia_ngc4594.csv' },
  { cat: 'NGC 3031', alias: 'M81',  csv: 'gaia_ngc3031.csv' }
];
var CONFIGS = [
  { D: 457.2, M: 190, sqm: 21.2 },
  { D: 203.0, M: 100, sqm: 20.5 }
];
var SIZE = 720, AFOV = 70;

function filaCat(n) { for (var i = 0; i < CAT.length; i++) if (CAT[i][0] === n) return CAT[i]; throw new Error('sin fila: ' + n); }
function leerGaia(f) {
  return fs.readFileSync(path.join(GAIA, f), 'utf8').trim().split('\n').slice(1)
    .map(function (l) { var t = l.split(','); return [parseFloat(t[0]), parseFloat(t[1]), parseFloat(t[2])]; });
}
function sha(f32) { return crypto.createHash('sha256').update(Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength)).digest('hex'); }
function stats(f32) {
  var s = 0, nan = 0;
  for (var i = 0; i < f32.length; i++) { var v = f32[i]; if (v === v) s += v; else nan++; }
  return { suma: s, nan: nan, n: f32.length };
}

function medir(O) {
  var fila = filaCat(O.cat);
  var gal = P.galDeFila(fila);
  return B.bajar(gal.ra, gal.dec, gal.ladoArcmin, PS1.salida).then(function (F) {
    var parche = P.montar(F, gal, leerGaia(O.csv), CAT);
    var m = { alias: O.alias, ancho: parche.ancho, alto: parche.alto,
              thetaIntArcmin: parche.thetaIntArcmin,
              datos: { sha256: sha(parche.datos), stats: stats(parche.datos) },
              difusos: [] };
    CONFIGS.forEach(function (C) {
      var cielo = { pupilaSalida: C.D / C.M, pupilaOjo: 7, sqm: C.sqm,
                    aumentos: C.M, realceMax: PS1.realceMax, perceptual: true };
      var o = { ra0: gal.ra, dec0: gal.dec, arcmin: AFOV / C.M * 60,
                size: SIZE, cielo: cielo, apertura: C.D };
      var difuso = new Float32Array(SIZE * SIZE);
      window.BitacoraPS1.ps1PintarParche(difuso, parche, o);
      m.difusos.push({ config: C, sha256: sha(difuso), stats: stats(difuso) });
    });
    return m;
  });
}

var cola = Promise.resolve(), medidas = [];
OBJS.forEach(function (O) { cola = cola.then(function () { return medir(O); }).then(function (m) { medidas.push(m); }); });

cola.then(function () {
  if (CAPTURAR) {
    fs.writeFileSync(FICH, JSON.stringify({ node: process.version, fecha: new Date().toISOString(), medidas: medidas }, null, 1));
    console.log('línea base capturada → ' + path.relative(RAIZ, FICH));
    medidas.forEach(function (m) { console.log('  ' + m.alias + '  datos ' + m.datos.sha256.slice(0, 12) + '…'); });
    return;
  }
  var base = JSON.parse(fs.readFileSync(FICH, 'utf8')).medidas;
  var fallos = 0;
  function exige(c, t) { if (c) console.log('  ok   ' + t); else { fallos++; console.error('  FALLA ' + t); } }
  medidas.forEach(function (m, i) {
    var b = base[i];
    console.log(m.alias + ':');
    exige(b && b.alias === m.alias, 'misma lista de objetos (' + m.alias + ')');
    if (!b) return;
    exige(b.datos.sha256 === m.datos.sha256, 'parche.datos bit a bit (suma ' +
      m.datos.stats.suma.toExponential(6) + ', NaN ' + m.datos.stats.nan + ')');
    exige(b.thetaIntArcmin === m.thetaIntArcmin, 'thetaIntArcmin = ' + m.thetaIntArcmin);
    m.difusos.forEach(function (d, j) {
      exige(b.difusos[j].sha256 === d.sha256, 'difuso ' + d.config.D + 'mm/' + d.config.M +
        'x/sqm' + d.config.sqm + ' bit a bit (suma ' + d.stats.suma.toExponential(6) + ')');
    });
  });
  console.log(fallos ? ('\nGOLDEN: ' + fallos + ' FALLOS') : '\nGOLDEN: todo bit a bit.');
  process.exit(fallos ? 1 : 0);
}).catch(function (e) { console.error('ERROR: ' + (e && e.stack || e)); process.exit(2); });
