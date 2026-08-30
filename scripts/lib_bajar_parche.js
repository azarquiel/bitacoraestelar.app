/* Baja un parche de PS1 al MISMO campo a la resolución que se le pida.

   Por qué existe: la caché del proxy solo tiene parches de 512 px, así que no
   hay forma de comparar 512 contra 1024 con datos reales sin pedirlos. Esto
   replica lo que hace `ps1-proxy.php` —nombres de skycell por las cuatro
   esquinas, el mismo recorte a cada celda, y costura quedándose con el primer
   píxel válido— porque un campo de 20′ no cabe en una sola skycell y pedir solo
   la central deja casi la mitad del parche en NaN.

   Réplica, no reimplementación libre: las cuatro funciones de abajo son las de
   ps1-proxy.php:105 (ps1_url_recorte), :117 (ps1_esquinas), :127
   (ps1_parse_nombres) y :179 (ps1_fusionar), con los mismos límites
   (PS1_MAX_CELDAS = 4, escala nativa 0,25″). Si producción cambia, esto deja de
   valer y hay que traerlo otra vez.

   La caché va al temporal del sistema, NO al repo ni a cache-ps1/: estos parches
   son de un experimento, no del simulador.

   Uso:  var B = require('./lib_bajar_parche.js')(R);
         B.bajar(ra, dec, ladoArcmin, salida).then(fits => …) */
'use strict';

var https = require('https');
var fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');

var BASE = 'https://ps1images.stsci.edu/cgi-bin/';
var ESCALA_NATIVA = 0.25;      // ″/px del stack; el `size` de fitscut va en estos
var MAX_CELDAS = 4;            // ps1-proxy.php:48
var DIR = process.env.PS1_HARNESS_DIR || path.join(os.tmpdir(), 'bitacora-ps1-harness');

module.exports = function (R) {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

  function bajar1(url) {
    return new Promise(function (res, rej) {
      https.get(url, { headers: { 'User-Agent': 'simulador-ocular/1.0' } }, function (r) {
        if (r.statusCode !== 200) { r.resume(); return rej(new Error('HTTP ' + r.statusCode)); }
        var t = [];
        r.on('data', function (c) { t.push(c); });
        r.on('end', function () { res(Buffer.concat(t)); });
      }).on('error', rej);
    });
  }

  function esquinas(ra, dec, lado) {
    var mitad = lado / 120;                                   // grados
    var dra = mitad / Math.max(0.02, Math.abs(Math.cos(dec * Math.PI / 180)));
    return [[ra - dra, dec - mitad], [ra + dra, dec - mitad],
            [ra - dra, dec + mitad], [ra + dra, dec + mitad]];
  }

  function parseNombres(txt) {
    var out = [];
    txt.trim().split(/\r?\n/).slice(1).forEach(function (l) {
      var c = l.trim().split(/\s+/);
      if (c.length >= 8 && c[7][0] === '/') out.push(c[7]);
    });
    return out;
  }

  function celdas(ra, dec, lado, banda) {
    return Promise.all(esquinas(ra, dec, lado).map(function (e) {
      return bajar1(BASE + 'ps1filenames.py?ra=' + e[0] + '&dec=' + e[1] +
        '&filters=' + banda).then(function (b) { return parseNombres(b.toString()); })
        .catch(function () { return []; });
    })).then(function (listas) {
      var vistas = [];
      listas.forEach(function (l) {
        l.forEach(function (f) { if (vistas.indexOf(f) < 0) vistas.push(f); });
      });
      return vistas.slice(0, MAX_CELDAS);
    });
  }

  function urlRecorte(fichero, ra, dec, lado, salida) {
    var size = Math.round(lado * 60 / ESCALA_NATIVA);
    return BASE + 'fitscut.cgi?red=' + encodeURIComponent(fichero) +
      '&x=' + ra + '&y=' + dec + '&size=' + size + '&output_size=' + salida +
      '&format=fits&wcs=1';
  }

  /* La costura del proxy, pero sobre los datos ya parseados: es lo mismo, y
     aquí no hace falta pelearse con el offset de la cabecera. Primer píxel
     válido gana; el solape discrepa ~15 % y promediar queda pendiente allí
     también. */
  function coser(capas) {
    var base = capas[0];
    for (var c = 1; c < capas.length; c++) {
      var o = capas[c];
      if (!o || o.datos.length !== base.datos.length) continue;
      for (var i = 0; i < base.datos.length; i++) {
        if (!isFinite(base.datos[i]) && isFinite(o.datos[i])) base.datos[i] = o.datos[i];
      }
    }
    return base;
  }

  function bajar(ra, dec, lado, salida, banda) {
    banda = banda || window.BitacoraPS1.cfg.banda;
    var clave = crypto.createHash('md5')
      .update([ra, dec, lado, salida, banda].join('|')).digest('hex');
    var f = path.join(DIR, clave + '.json');
    if (fs.existsSync(f)) {
      var g = JSON.parse(fs.readFileSync(f, 'utf8'));
      g.datos = new Float32Array(Buffer.from(g.datos, 'base64').buffer.slice(0));
      return Promise.resolve(g);
    }
    return celdas(ra, dec, lado, banda).then(function (cs) {
      if (!cs.length) throw new Error('sin cobertura de PS1');
      var capas = [], cadena = Promise.resolve();
      cs.forEach(function (celda) {
        cadena = cadena.then(function () {
          return bajar1(urlRecorte(celda, ra, dec, lado, salida)).then(function (b) {
            var ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
            var p = window.BitacoraPS1.parseFITS(ab);
            if (p && p.datos) capas.push(p);
          }).catch(function () { /* una celda que falla no tumba el parche */ });
        });
      });
      return cadena.then(function () {
        if (!capas.length) throw new Error('ninguna celda devolvió imagen');
        var p = coser(capas);
        var g = { ancho: p.ancho, alto: p.alto, escalaAs: p.escalaAs,
                  datos: p.datos, ladoArcmin: lado, salida: salida };
        if (!(g.escalaAs > 0)) g.escalaAs = lado * 60 / p.ancho;
        fs.writeFileSync(f, JSON.stringify({
          ancho: g.ancho, alto: g.alto, escalaAs: g.escalaAs,
          ladoArcmin: lado, salida: salida,
          datos: Buffer.from(new Float32Array(g.datos).buffer).toString('base64')
        }));
        return g;
      });
    });
  }

  return { bajar: bajar, dir: DIR, ESCALA_NATIVA: ESCALA_NATIVA };
};
