#!/usr/bin/env node
/* Genera los CSV de Gaia PINEADOS del golden de difusas
   (scripts/fixtures/gaia/*.csv). Misma consulta que gaia_proxy.php (CDS,
   I/355/gaiadr3, ORDER BY Gmag) con G ≤ PS1.mascaraProf, radio 0,75·lado del
   parche (cubre las esquinas del recorte cuadrado con margen).

   Se versionan porque el golden exige entrada estable: una consulta TAP viva
   puede cambiar de orden o de contenido entre corridas.

   Uso:  node scripts/gen_fixtures_gaia.js          (solo los que falten)
         node scripts/gen_fixtures_gaia.js --forzar */
'use strict';

var fs = require('fs'), path = require('path'), https = require('https');
var RAIZ = path.join(__dirname, '..');
global.window = {};
require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'nebulosas-datos.js'));
var R = global.window.BitacoraGaiaRender, PS1 = R.ps1;

var OUT = path.join(__dirname, 'fixtures', 'gaia');
fs.mkdirSync(OUT, { recursive: true });
var FORZAR = process.argv.indexOf('--forzar') >= 0;

var OBJS = [
  { cat: 'NGC 5194', csv: 'gaia_ngc5194.csv', fuente: global.window.BITACORA_GALAXIAS },
  { cat: 'NGC 5457', csv: 'gaia_ngc5457.csv', fuente: global.window.BITACORA_GALAXIAS },
  { cat: 'NGC 4594', csv: 'gaia_ngc4594.csv', fuente: global.window.BITACORA_GALAXIAS },
  { cat: 'NGC 3031', csv: 'gaia_ngc3031.csv', fuente: global.window.BITACORA_GALAXIAS },
  { cat: 'NGC6720',  csv: 'gaia_ngc6720.csv', fuente: global.window.BITACORA_NEBULOSAS },
  // Validación de emisión/reflexión (rama nebulosas-emision-reflexion):
  { cat: 'NGC2068',  csv: 'gaia_ngc2068.csv', fuente: global.window.BITACORA_NEBULOSAS },
  { cat: 'NGC7635',  csv: 'gaia_ngc7635.csv', fuente: global.window.BITACORA_NEBULOSAS },
  { cat: 'NGC6888',  csv: 'gaia_ngc6888.csv', fuente: global.window.BITACORA_NEBULOSAS },
  // Resto de supernova (M1):
  { cat: 'NGC1952',  csv: 'gaia_ngc1952.csv', fuente: global.window.BITACORA_NEBULOSAS }
];

function fila(fuente, nombre) {
  for (var i = 0; i < fuente.length; i++) if (fuente[i][0] === nombre) return fuente[i];
  throw new Error('no está en el catálogo: ' + nombre);
}

function bajar(o) {
  var f = fila(o.fuente, o.cat);
  var lado = R.ps1LadoArcmin(f[4]);
  var radDeg = (lado * 0.75) / 60;
  var adql = 'SELECT TOP 200000 RA_ICRS, DE_ICRS, Gmag FROM "I/355/gaiadr3"' +
    ' WHERE Gmag <= ' + PS1.mascaraProf +
    ' AND 1=CONTAINS(POINT(\'ICRS\', RA_ICRS, DE_ICRS),' +
    ' CIRCLE(\'ICRS\',' + f[2] + ',' + f[3] + ',' + radDeg + ')) ORDER BY Gmag';
  var url = 'https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync?request=doQuery&lang=adql&format=json&query=' +
    encodeURIComponent(adql);
  return new Promise(function (res, rej) {
    https.get(url, function (r) {
      var trozos = [];
      if (r.statusCode !== 200) { rej(new Error('HTTP ' + r.statusCode + ' para ' + o.cat)); return; }
      r.on('data', function (d) { trozos.push(d); });
      r.on('end', function () {
        try {
          var j = JSON.parse(Buffer.concat(trozos).toString('utf8'));
          var lineas = ['ra,dec,g'];
          for (var i = 0; i < j.data.length; i++) {
            var d = j.data[i];
            if (d[2] == null) continue;
            lineas.push(d[0] + ',' + d[1] + ',' + d[2]);
          }
          fs.writeFileSync(path.join(OUT, o.csv), lineas.join('\n') + '\n');
          console.log(o.cat + ': ' + (lineas.length - 1) + ' fuentes (radio ' +
            (radDeg * 60).toFixed(1) + '′) → ' + o.csv);
          res();
        } catch (e) { rej(e); }
      });
    }).on('error', rej);
  });
}

var cola = Promise.resolve();
OBJS.forEach(function (o) {
  cola = cola.then(function () {
    if (!FORZAR && fs.existsSync(path.join(OUT, o.csv))) {
      console.log(o.cat + ': ya existe, no se toca'); return;
    }
    return bajar(o);
  });
});
cola.catch(function (e) { console.error('FALLO: ' + e.message); process.exit(1); });
