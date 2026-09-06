#!/usr/bin/env node
/* Genera los CSV de Gaia PINEADOS del golden de difusas
   (scripts/fixtures/gaia/*.csv). Misma consulta que gaia_proxy.php (CDS,
   I/355/gaiadr3, ORDER BY Gmag) con G ≤ PS1.mascaraProf, radio 0,75·lado del
   parche (cubre las esquinas del recorte cuadrado con margen).

   Se versionan porque el golden exige entrada estable: una consulta TAP viva
   puede cambiar de orden o de contenido entre corridas.

   Uso:  node scripts/gen_fixtures_gaia.js          (solo los que falten)
         node scripts/gen_fixtures_gaia.js --forzar
         node scripts/gen_fixtures_gaia.js --vistas  (los de solo mirar, a la caché) */
'use strict';

var fs = require('fs'), path = require('path'), https = require('https');
var RAIZ = path.join(__dirname, '..');
global.window = {};
require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-ps1.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'nebulosas-datos.js'));
var R = global.window.BitacoraGaiaRender, PS1 = window.BitacoraPS1.cfg;

var FORZAR = process.argv.indexOf('--forzar') >= 0;
var VISTAS = process.argv.indexOf('--vistas') >= 0;
var OUT = VISTAS
  ? (process.env.BITACORA_GAIA_DIR || path.join(require('os').tmpdir(), 'bitacora-gaia-vistas'))
  : path.join(__dirname, 'fixtures', 'gaia');
fs.mkdirSync(OUT, { recursive: true });

var OBJS = [
  { cat: 'NGC 5194', csv: 'gaia_ngc5194.csv', fuente: global.window.BITACORA_GALAXIAS },
  { cat: 'NGC 5457', csv: 'gaia_ngc5457.csv', fuente: global.window.BITACORA_GALAXIAS },
  { cat: 'NGC 4594', csv: 'gaia_ngc4594.csv', fuente: global.window.BITACORA_GALAXIAS },
  { cat: 'NGC 3031', csv: 'gaia_ngc3031.csv', fuente: global.window.BITACORA_GALAXIAS },
  { cat: 'NGC6720',  csv: 'gaia_ngc6720.csv', fuente: global.window.BITACORA_NEBULOSAS },
  // Validación de emisión/reflexión (rama nebulosas-emision-reflexion):
  { cat: 'NGC2068',  csv: 'gaia_ngc2068.csv', fuente: global.window.BITACORA_NEBULOSAS },
  // NGC 2023: reflexión con mag DERIVADA de la mu asumida (ADR 0024), y con su
  // estrella iluminadora dentro del campo (HD 37903, G 7,76, cuya máscara toca
  // el tope de 60 arcsec).
  { cat: 'NGC2023',  csv: 'gaia_ngc2023.csv', fuente: global.window.BITACORA_NEBULOSAS },
  { cat: 'NGC7635',  csv: 'gaia_ngc7635.csv', fuente: global.window.BITACORA_NEBULOSAS },
  { cat: 'NGC6888',  csv: 'gaia_ngc6888.csv', fuente: global.window.BITACORA_NEBULOSAS },
  // Resto de supernova (M1):
  { cat: 'NGC1952',  csv: 'gaia_ngc1952.csv', fuente: global.window.BITACORA_NEBULOSAS },
  /* Los dos que le faltan al banco golden del catálogo de texturas (ADR 0024):
     controles de la regla de ausencia por mordida de máscara. */
  { cat: 'NGC7008',  csv: 'gaia_ngc7008.csv', fuente: global.window.BITACORA_NEBULOSAS },
  { cat: 'Abell 12', csv: 'gaia_abell12.csv', fuente: global.window.BITACORA_NEBULOSAS },
  /* NGC 205 estaba entre los de solo mirar, pero lo consume un GUARDIÁN
     (test_ps1_nan_ausencia, caso E: los huecos de estrellas saturadas). La
     razón de la decisión 9.1 para no versionar es que «una vista no exige
     entrada estable»; un guardián sí, y sin el CSV en el repo el test revienta
     en un clon nuevo. */
  { cat: 'NGC 205',  csv: 'gaia_ngc205.csv',  fuente: global.window.BITACORA_GALAXIAS }
];

/* Objetos que SOLO se miran (harness_vistas_np.js), nunca bit a bit. NO se
   versionan: una vista no exige entrada estable, y pinear estos costaría ~12 MB
   por una propiedad que no se usa (decisión 9.1 del ADR 0024). Van a
   $BITACORA_GAIA_DIR o al temporal, como los FITS.
   Uso:  node scripts/gen_fixtures_gaia.js --vistas */
var VISUALES = [
  { cat: 'NGC 4486', csv: 'gaia_ngc4486.csv', fuente: global.window.BITACORA_GALAXIAS },
  { cat: 'NGC 4826', csv: 'gaia_ngc4826.csv', fuente: global.window.BITACORA_GALAXIAS },
  { cat: 'NGC 253',  csv: 'gaia_ngc253.csv',  fuente: global.window.BITACORA_GALAXIAS },
  { cat: 'NGC 3310', csv: 'gaia_ngc3310.csv', fuente: global.window.BITACORA_GALAXIAS },
  { cat: 'NGC1982',  csv: 'gaia_ngc1982.csv', fuente: global.window.BITACORA_NEBULOSAS }
];

function fila(fuente, nombre) {
  for (var i = 0; i < fuente.length; i++) if (fuente[i][0] === nombre) return fuente[i];
  throw new Error('no está en el catálogo: ' + nombre);
}

/* Dos servidores, el MISMO failover que gaia_proxy.php en producción: CDS
   (VizieR I/355/gaiadr3) y, si falla, GAVO (gaia.dr3lite). VizieR responde 403 a
   ráfagas según la IP que consulte, y sin la alternativa un fixture nuevo no se
   puede generar desde según qué máquina. Es el mismo DR3 con otros nombres de
   columna. */
function consultas(ra, dec, radDeg) {
  return [
    { nombre: 'CDS',
      url: 'https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync?request=doQuery&lang=adql&format=json&query=',
      adql: 'SELECT TOP 200000 RA_ICRS, DE_ICRS, Gmag FROM "I/355/gaiadr3"' +
        ' WHERE Gmag <= ' + PS1.mascaraProf +
        ' AND 1=CONTAINS(POINT(\'ICRS\', RA_ICRS, DE_ICRS),' +
        ' CIRCLE(\'ICRS\',' + ra + ',' + dec + ',' + radDeg + ')) ORDER BY Gmag' },
    { nombre: 'GAVO',
      url: 'https://dc.zah.uni-heidelberg.de/tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY=',
      adql: 'SELECT TOP 200000 ra, dec, phot_g_mean_mag FROM gaia.dr3lite' +
        ' WHERE phot_g_mean_mag <= ' + PS1.mascaraProf +
        ' AND 1=CONTAINS(POINT(\'ICRS\', ra, dec),' +
        ' CIRCLE(\'ICRS\',' + ra + ',' + dec + ',' + radDeg + ')) ORDER BY phot_g_mean_mag' }
  ];
}

function pedir(c) {
  return new Promise(function (res, rej) {
    https.get(c.url + encodeURIComponent(c.adql),
      { headers: { 'User-Agent': 'simulador-ocular/1.0' } }, function (r) {
        var trozos = [];
        if (r.statusCode !== 200) { r.resume(); rej(new Error('HTTP ' + r.statusCode + ' en ' + c.nombre)); return; }
        r.on('data', function (d) { trozos.push(d); });
        r.on('end', function () {
          try { res(JSON.parse(Buffer.concat(trozos).toString('utf8'))); } catch (e) { rej(e); }
        });
      }).on('error', rej);
  });
}

function bajar(o) {
  var f = fila(o.fuente, o.cat);
  var lado = window.BitacoraPS1.ps1LadoArcmin(f[4]);
  var radDeg = (lado * 0.75) / 60;
  var cs = consultas(f[2], f[3], radDeg);
  return pedir(cs[0])
    .catch(function (e) {
      console.log('  ' + o.cat + ': ' + e.message + ', se prueba ' + cs[1].nombre);
      return pedir(cs[1]);
    })
    .then(function (j) {
      var lineas = ['ra,dec,g'];
      for (var i = 0; i < j.data.length; i++) {
        var d = j.data[i];
        if (d[2] == null) continue;
        lineas.push(d[0] + ',' + d[1] + ',' + d[2]);
      }
      fs.writeFileSync(path.join(OUT, o.csv), lineas.join('\n') + '\n');
      console.log(o.cat + ': ' + (lineas.length - 1) + ' fuentes (radio ' +
        (radDeg * 60).toFixed(1) + '′) → ' + o.csv);
    });
}

var cola = Promise.resolve();
(VISTAS ? VISUALES : OBJS).forEach(function (o) {
  cola = cola.then(function () {
    if (!FORZAR && fs.existsSync(path.join(OUT, o.csv))) {
      console.log(o.cat + ': ya existe, no se toca'); return;
    }
    return bajar(o);
  });
});
cola.catch(function (e) { console.error('FALLO: ' + e.message); process.exit(1); });
