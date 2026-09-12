/* El parche PUBLICADO de un objeto del banco: su PNG de 16 bits más su sidecar,
   decodificado a DN y sin tocar la red. Lo comparten los arneses que miden lo
   que hay publicado (#263, #274) para que la forma de encontrar el fichero
   —que lleva la versión dentro del nombre— sea una sola.

   Aquí no se define ninguna ley (ADR 0008): esto localiza ficheros y decodifica.

   Uso:  var PUB = require('./lib_parche_publicado.js')(RAIZ, PS1, P16);
         PUB.fila('NGC6888')        →  fila del catálogo difuso o null
         PUB.fuente(fila)           →  Promise<{datos, ancho, alto, escalaAs, wcs, side, etiqueta}>
         PUB.estrellas('NGC6888')   →  [[ra, dec, g], …] del fixture de Gaia, o null */
'use strict';

var fs = require('fs'), path = require('path');

module.exports = function (RAIZ, PS1, P16, dirs) {
  var BANCO = require('./lib_banco_dso.js')(window.BitacoraGaiaRender);

  /* Los PNG del banco pesan 2 MB y no entran en git, así que en un árbol recién
     clonado no están; entonces valen los de `scripts/fixtures/dso/`, que son los
     mismos bytes para los objetos que llevan fixture. */
  var DIRS = (dirs || []).concat([path.join(RAIZ, 'simulador_ocular', 'dso'),
                                  path.join(RAIZ, 'scripts', 'fixtures', 'dso')]);

  function fila(nombre) {
    var todas = PS1.ps1CatalogoDifuso(window.BITACORA_GALAXIAS, window.BITACORA_NEBULOSAS);
    var k = BANCO.clave(nombre);
    for (var i = 0; i < todas.length; i++) {
      if (BANCO.clave(todas[i][0]) === k || (todas[i][1] && BANCO.clave(todas[i][1]) === k)) return todas[i];
    }
    return null;
  }

  /* El par (sidecar, PNG), mirando los directorios en orden. El nombre de
     fichero lleva la versión y la versión sale del manifiesto: si el PNG de
     disco no es el que el manifiesto declara, esto no lo encuentra, que es lo
     que queremos —medir lo publicado, no lo que haya por ahí—. */
  function parche(nombre) {
    var id = PS1.ps1IdTextura(nombre);
    for (var i = 0; i < DIRS.length; i++) {
      var dir = DIRS[i];
      if (!fs.existsSync(dir)) continue;
      var cand = fs.readdirSync(dir).filter(function (f) {
        return f.indexOf(id + '.') === 0 && /\.json$/.test(f) && f.indexOf('.fila.') < 0;
      });
      for (var j = 0; j < cand.length; j++) {
        var png = path.join(dir, cand[j].replace(/\.json$/, '.png'));
        if (fs.existsSync(png)) return { json: path.join(dir, cand[j]), png: png, dir: dir };
      }
    }
    return null;
  }

  /* Solo el sidecar, para lo que es geometría —lado, escala, WCS— y no necesita
     abrir el PNG. Si el par completo está a mano se lee de ahí, para que sea el
     MISMO fichero que se mediría; y si no, vale el sidecar suelto, porque los
     sidecars sí entran en git y los PNG no. Así una medida de geometría cubre el
     banco entero en un árbol recién clonado. */
  function sidecar(nombre) {
    var p = parche(nombre);
    if (p) return JSON.parse(fs.readFileSync(p.json, 'utf8'));
    var id = PS1.ps1IdTextura(nombre);
    for (var i = 0; i < DIRS.length; i++) {
      if (!fs.existsSync(DIRS[i])) continue;
      var cand = fs.readdirSync(DIRS[i]).filter(function (f) {
        return f.indexOf(id + '.') === 0 && /\.json$/.test(f) && f.indexOf('.fila.') < 0;
      });
      if (cand.length) return JSON.parse(fs.readFileSync(path.join(DIRS[i], cand[0]), 'utf8'));
    }
    return null;
  }

  function fuente(f) {
    var p = parche(f[0]);
    if (!p) return Promise.resolve(null);
    var side = JSON.parse(fs.readFileSync(p.json, 'utf8'));
    return P16.leer(fs.readFileSync(p.png)).then(function (img) {
      if (!img) throw new Error(f[0] + ': el PNG no se deja leer');
      return { datos: P16.decodificar(img.u16, side.codificacion),
               ancho: img.ancho, alto: img.alto, escalaAs: side.escalaAs,
               wcs: side.wcs || null, side: side,
               etiqueta: 'banda ' + side.fuente.banda + ' · ' + path.basename(p.png) };
    });
  }

  /* Las estrellas de Gaia del campo, de los fixtures que ya existen: en Cygnus,
     NGC 6888 tiene tantas que «píxeles por encima del cielo» sin quitarlas mide
     sobre todo el campo estelar, no la nebulosa. Sin fixture no se inventa: se
     dice que la cuenta va con estrellas dentro. */
  var FIXTURES = {
    NGC6888: 'gaia_ngc6888.csv', NGC6720: 'gaia_ngc6720.csv', NGC7008: 'gaia_ngc7008.csv',
    NGC7635: 'gaia_ngc7635.csv', NGC1952: 'gaia_ngc1952.csv', 'NGC 5194': 'gaia_ngc5194.csv'
  };
  function estrellas(nombre) {
    var csv = FIXTURES[nombre];
    if (!csv) return null;
    var ruta = path.join(RAIZ, 'scripts', 'fixtures', 'gaia', csv);
    if (!fs.existsSync(ruta)) return null;
    return fs.readFileSync(ruta, 'utf8').trim().split('\n').slice(1).map(function (l) {
      var t = l.split(',');
      return [parseFloat(t[0]), parseFloat(t[1]), parseFloat(t[2])];
    });
  }

  return { fila: fila, parche: parche, sidecar: sidecar, fuente: fuente, estrellas: estrellas,
           clave: BANCO.clave, FIXTURES: FIXTURES, DIRS: DIRS };
};
