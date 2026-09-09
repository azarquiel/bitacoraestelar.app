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
         B.bajar(ra, dec, ladoArcmin, salida).then(fits => …)   // con WCS
         B.bajar(ra, dec, ladoArcmin, salida, banda, false)     // sin ella, ver abajo */
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

  /* Un reintento y nada más. `fitscut` corta la conexión en recortes grandes con
     facilidad —un `socket hang up` que la segunda petición no repite (#259)— y
     la fase 0 midió 147 descargas seguidas sin estrangulamiento
     (docs/validacion/dso_texturas_fase0.md §D): ni pausa ni espera creciente. */
  function bajarReintentando(url) {
    return bajar1(url).catch(function () { return bajar1(url); });
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

  /* Devuelve también las esquinas cuyo nombre NO se pudo preguntar. No es lo
     mismo que una esquina sin celdas: eso es cielo que PS1 no cubre, y esto es
     una consulta que falló, así que el mosaico puede salir corto sin que la
     cuenta de celdas se entere (#259). */
  function celdas(ra, dec, lado, banda) {
    var fallidas = 0;
    return Promise.all(esquinas(ra, dec, lado).map(function (e) {
      return bajarReintentando(BASE + 'ps1filenames.py?ra=' + e[0] + '&dec=' + e[1] +
        '&filters=' + banda).then(function (b) { return parseNombres(b.toString()); })
        .catch(function () { fallidas++; return []; });
    })).then(function (listas) {
      var vistas = [];
      listas.forEach(function (l) {
        l.forEach(function (f) { if (vistas.indexOf(f) < 0) vistas.push(f); });
      });
      return { lista: vistas.slice(0, MAX_CELDAS), esquinasFallidas: fallidas };
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

  /* `conWcs`: devolver también la WCS del recorte. ES el defecto, porque el
     navegador la lee del FITS del proxy y sin ella `ps1AfinParche` monta el
     afín alineado al norte, sin el giro de la skycell: el camino de Node medía
     una geometría que producción no usa. Apagarla (`false`) solo tiene sentido
     para comparar contra la geometría vieja, como hace
     `scripts/harness_r1_wcs.js`. Encenderla cambió `parche.datos` de los cuatro
     objetos del golden: recaptura R1, con su tabla en
     `simulador_ocular/docs/validacion/recaptura_r1_wcs.md`. */
  function bajar(ra, dec, lado, salida, banda, conWcs) {
    conWcs = conWcs !== false;
    banda = banda || window.BitacoraPS1.cfg.banda;
    var clave = crypto.createHash('md5')
      .update([ra, dec, lado, salida, banda].join('|')).digest('hex');
    var f = path.join(DIR, clave + '.json');
    if (fs.existsSync(f)) {
      var g = JSON.parse(fs.readFileSync(f, 'utf8'));
      /* Una entrada anterior a la WCS no la trae: solo hay que volver a pedirla
         si quien llama la ha pedido. Una anterior a #259 tampoco trae la cuenta
         de celdas: se sirve igual, y la ausencia de `celdasPedidas` es lo que
         dice que ese parche no se puede auditar —para esos queda el barrido de
         bloques, `scripts/harness_bloques_ausencia.js`—. */
      if (!conWcs || 'wcs' in g) {
        g.datos = new Float32Array(Buffer.from(g.datos, 'base64').buffer.slice(0));
        if (!conWcs) delete g.wcs;
        return Promise.resolve(g);
      }
    }
    return celdas(ra, dec, lado, banda).then(function (c) {
      var cs = c.lista;
      if (!cs.length) {
        if (c.esquinasFallidas) throw new Error('no se pudo preguntar por las celdas');
        throw new Error('sin cobertura de PS1');
      }
      var capas = [], cadena = Promise.resolve();
      cs.forEach(function (celda) {
        cadena = cadena.then(function () {
          return bajarReintentando(urlRecorte(celda, ra, dec, lado, salida)).then(function (b) {
            var ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
            var p = window.BitacoraPS1.parseFITS(ab);
            if (p && p.datos) capas.push(p);
          }).catch(function () { /* una celda que falla no tumba el parche, pero se cuenta */ });
        });
      });
      return cadena.then(function () {
        if (!capas.length) throw new Error('ninguna celda devolvió imagen');
        var p = coser(capas);
        var g = { ancho: p.ancho, alto: p.alto, escalaAs: p.escalaAs,
                  datos: p.datos, ladoArcmin: lado, salida: salida,
                  /* Una esquina que no se pudo preguntar cuenta como celda que
                     falta: el mosaico está corto y no se sabe de cuánto. */
                  celdasPedidas: cs.length + c.esquinasFallidas,
                  celdasCosidas: capas.length };
        if (conWcs) g.wcs = p.wcs || null;
        if (!(g.escalaAs > 0)) g.escalaAs = lado * 60 / p.ancho;
        var guardar = {
          ancho: g.ancho, alto: g.alto, escalaAs: g.escalaAs,
          ladoArcmin: lado, salida: salida,
          celdasPedidas: g.celdasPedidas, celdasCosidas: g.celdasCosidas,
          datos: Buffer.from(new Float32Array(g.datos).buffer).toString('base64')
        };
        /* Solo se guarda la clave `wcs` si se pidió: su ausencia es lo que
           distingue una entrada que no la tiene de una que la tiene a null. */
        if (conWcs) guardar.wcs = g.wcs;
        /* Un mosaico al que le falta una celda NO se cachea: si se guardara, el
           agujero se serviría igual en cada corrida y la única forma de
           enterarse sería mirarlo a ojo (#259). Se devuelve —quien llama decide
           qué hacer con él— pero la siguiente ejecución vuelve a pedirlo. */
        if (g.celdasCosidas >= g.celdasPedidas) fs.writeFileSync(f, JSON.stringify(guardar));
        return g;
      });
    });
  }

  return { bajar: bajar, dir: DIR, ESCALA_NATIVA: ESCALA_NATIVA };
};
