#!/usr/bin/env node
/* L1.2 del ADR 0024: sin red. Con el manifiesto completo y `proxyRespaldo`
   apagado, un render del campo de M51 y otro del de NGC 7008 no emiten NINGUNA
   petición fuera de `dso/`. Lo que falsea el listón es que quede una dependencia
   externa escondida en la capa: un `fetch` que no pase por `ps1FuenteParche`,
   una fila del campo que se cuele al proxy, un sidecar pedido a otro sitio.

   Lo que se mide no es el resultado, son las URL: el `fetch` es de mentira y
   registra todas. Sirve los ficheros de `scripts/fixtures/dso/` y, cuando el
   banco está generado, los de `simulador_ocular/dso/` (ignorado en git); lo
   que llegue a cualquier otra dirección cuenta como salida del dominio. Y no
   solo `fetch`: `new Image()` —el canal por el que bajan las placas DSS— está
   igual de vigilado, porque una dependencia externa por ahí no aparecería en
   la lista de peticiones.

   «Manifiesto completo» es el estado que tendrá el banco desplegado: TODO
   objeto del campo con su fila. Desde #258 el commiteado ya declara el banco
   entero, pero el test sigue completándolo para estos dos campos con lo que
   haya en disco —`imagen` si la textura del objeto está, `fila` si no— porque
   el listón tiene que valer también en un árbol donde el banco no esté
   generado. La comprobación de que se pidió cada textura va objeto a objeto:
   por la cuenta total, la segunda podría no pedirse nunca y daría verde igual.

   Y el régimen mixto, que ya no es el de hoy pero sigue siendo posible —el
   catálogo puede volver a ir por delante del manifiesto—: mientras el banco no cubra el catálogo
   habrá objetos del campo sin fila (NGC 5195). Apagar el respaldo tiene que
   valer también para ellos, o no estaría apagando nada.

   El otro lado del listón: el respaldo sigue vivo. Con `proxyRespaldo = true`
   y una fila ausente del manifiesto —el catálogo más nuevo que él— la petición
   al proxy sí sale. Sin esta mitad, apagar la capa entera daría verde.

   Uso:  node scripts/test_sin_red_dso.js */
'use strict';

var fs = require('fs'), path = require('path');
var RAIZ = path.join(__dirname, '..');
var DIRS = [path.join(RAIZ, 'scripts', 'fixtures', 'dso'),
            path.join(RAIZ, 'simulador_ocular', 'dso')];
var BASE = 'https://textura-de-mentira/dso/';

var fallos = 0, comprobaciones = 0;
function ok(c, t) {
  comprobaciones++;
  console.log('  ' + (c ? 'ok  ' : 'FALLO') + '  ' + t);
  if (!c) fallos++;
}

/* Módulo recién cargado por caso: `cachePS1` vive dentro y es de sesión, así
   que sin esto el segundo campo vería el parche del primero y no pediría nada,
   que es justo lo que este test cree estar midiendo. */
var MODULOS = ['resources/js/bitacora-gaia-render.js', 'resources/js/bitacora-ps1.js',
               'resources/js/bitacora-png16.js',
               'simulador_ocular/resources/js/galaxias-datos.js',
               'simulador_ocular/resources/js/nebulosas-datos.js',
               'simulador_ocular/resources/js/dso-texturas-datos.js'];
function fresco() {
  MODULOS.forEach(function (m) { delete require.cache[require.resolve(path.join(RAIZ, m))]; });
  global.window = {};
  MODULOS.forEach(function (m) { require(path.join(RAIZ, m)); });
  window.BitacoraPS1.texturasUrl = BASE;
  window.BitacoraPS1.proxyUrl = 'https://proxy-de-mentira/ps1-proxy.php';
  return window.BitacoraPS1;
}

var pedidos = [];
function fueraDeDso() {
  return pedidos.filter(function (u) { return u.indexOf(BASE) !== 0; });
}
global.fetch = function (url) {
  url = String(url);
  pedidos.push(url);
  if (url.indexOf(BASE) !== 0) return Promise.resolve({ ok: false, status: 599 });
  var rel = url.slice(BASE.length), ruta = null;
  DIRS.forEach(function (d) {
    if (!ruta && fs.existsSync(path.join(d, rel))) ruta = path.join(d, rel);
  });
  if (!ruta) return Promise.resolve({ ok: false, status: 404 });
  var b = fs.readFileSync(ruta);
  return Promise.resolve({
    ok: true, status: 200,
    arrayBuffer: function () { return Promise.resolve(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); },
    json: function () { return Promise.resolve(JSON.parse(b.toString('utf8'))); }
  });
};

/* `fetch` no es el único canal de salida del navegador: `cargarPlaca`
   (bitacora-gaia-render.js) baja las placas DSS con `new Image()`, y una capa
   que volviera a pedir su imagen por ahí no aparecería en `pedidos`. El stub
   registra el `src` y no carga nada, así que esa vía cuenta como salida del
   dominio igual que una URL de `fetch`. */
global.Image = function () {
  var im = { crossOrigin: '', onload: null, onerror: null };
  Object.defineProperty(im, 'src', {
    set: function (u) { pedidos.push(String(u)); },
    get: function () { return ''; }
  });
  return im;
};

/* La textura publicada de este objeto, si alguno de los dos directorios la
   tiene: `<id>.<version>.png` con su sidecar. Devuelve la versión, que es lo
   único que la fila del manifiesto necesita para pedirla.

   El nombre de fichero se lee al revés (del disco a la versión), que es lo
   contrario de lo que hace la producción (`ps1IdTextura` + la versión de la
   fila): la ley de nombrado la sigue poniendo `ps1IdTextura`, y lo único que
   aquí se deduce es el trozo que el manifiesto commiteado no trae. La ida
   —montar la URL— la sigue haciendo `ps1FuenteParche` (ADR 0008). */
function versionEnDisco(P, nombre) {
  var id = P.ps1IdTextura(nombre), ver = null;
  DIRS.forEach(function (d) {
    if (ver || !fs.existsSync(d)) return;
    fs.readdirSync(d).forEach(function (f) {
      var m = new RegExp('^' + id + '\\.([0-9a-f]+)\\.png$').exec(f);
      if (m && !ver && fs.existsSync(path.join(d, id + '.' + m[1] + '.json'))) ver = m[1];
    });
  });
  return ver;
}

function catalogoDe(P) {
  return P.ps1CatalogoDifuso(window.BITACORA_GALAXIAS, window.BITACORA_NEBULOSAS);
}
function filaDe(P, nombre) {
  var f = catalogoDe(P).filter(function (r) { return r[0] === nombre; })[0];
  if (!f) throw new Error('el catálogo no tiene a ' + nombre);
  return f;
}

/* El manifiesto completo sobre este campo: el commiteado más una fila por cada
   objeto del campo que no esté en él. */
function completar(P, nombre, arcmin) {
  var f = filaDe(P, nombre);
  var campo = P.ps1GalaxiasDelCampo(catalogoDe(P), f[2], f[3], arcmin);
  var manifiesto = window.BITACORA_DSO_TEXTURAS.slice();
  var anadidas = [];
  campo.forEach(function (g) {
    if (P.ps1FilaTextura(g.nombre)) return;
    var ver = versionEnDisco(P, g.nombre);
    manifiesto.push(ver ? [g.nombre, 'imagen', ver, 0, 0, 0, '']
                        : [g.nombre, 'fila', '', 0, 0, 0, 'sin-cobertura']);
    anadidas.push(g.nombre + '→' + (ver ? 'imagen' : 'fila'));
  });
  window.BITACORA_DSO_TEXTURAS = manifiesto;
  return { fila: f, campo: campo, anadidas: anadidas };
}

/* Un render de la capa difusa sobre el campo de este objeto. El lienzo es
   pequeño a propósito: lo que se mide son las URL, no los píxeles, y de estos
   solo que haya luz (si no la hubiera, la ausencia de peticiones no probaría
   nada porque no se habría pintado nada). */
function renderCampo(P, f, arcmin, size) {
  var difuso = new Float32Array(size * size);
  var ctx = { canvas: { width: size, height: size },
              createImageData: function (w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
              putImageData: function () {} };
  return P.ps1CapaGalaxias(difuso, ctx,
    { sqm: 21.4, pupilaSalida: 3.3, pupilaOjo: 7, transmision: 0.8 }, null,
    { ra0: f[2], dec0: f[3], arcmin: arcmin, size: size, estrellas: [],
      catalogo: catalogoDe(P), apertura: 200 }).then(function (r) {
    var pintado = 0;
    for (var i = 0; i < difuso.length; i++) if (difuso[i] > 0) pintado++;
    return { aviso: r.aviso, pintado: pintado };
  });
}

/* Los dos campos del listón. NGC 7008 mide 2,6′ de lado: 10′ de campo ya lo
   trae entero y no hace falta más para saber a quién se le pidió el parche.
   Los nombres van como los escribe SU catálogo —las galaxias con espacio
   ('NGC 5194'), las nebulosas sin él ('NGC7008')—, que es la clave del
   manifiesto (ADR 0015): no es una errata. */
var CAMPOS = [['NGC 5194', 40, 64], ['NGC7008', 10, 64]];

CAMPOS.reduce(function (cadena, c) {
  return cadena.then(function () {
    console.log('\nEl campo de ' + c[0] + ' (' + c[1] + '′), sin respaldo:');
    var P = fresco();
    P.cfg.proxyRespaldo = false;
    var comp = completar(P, c[0], c[1]);
    ok(P.ps1FilaTextura(c[0])[1] === 'imagen', 'el apuntado tiene textura en el manifiesto');
    var faltan = comp.campo.filter(function (g) { return !P.ps1FilaTextura(g.nombre); });
    ok(faltan.length === 0,
       'el manifiesto está completo sobre el campo (' + comp.campo.length + ' objetos' +
       (comp.anadidas.length ? '; completadas: ' + comp.anadidas.join(', ') : '') + ')');
    pedidos = [];
    return renderCampo(P, comp.fila, c[1], c[2]).then(function (r) {
      ok(fueraDeDso().length === 0,
         'ninguna petición fuera de dso/ (' + pedidos.length + ' en total; fuera: ' +
         (fueraDeDso()[0] || 'ninguna') + ')');
      /* Objeto a objeto, no por la cuenta total: en modo banco el campo de M51
         lee DOS texturas, y un `pedidos.length >= 2` daría verde aunque la
         segunda no se hubiera pedido nunca. */
      var conImagen = comp.campo.filter(function (g) { return P.ps1FilaTextura(g.nombre)[1] === 'imagen'; });
      var sinPedir = conImagen.filter(function (g) {
        var fila = P.ps1FilaTextura(g.nombre);
        var base = BASE + P.ps1IdTextura(g.nombre) + '.' + fila[2];
        return pedidos.indexOf(base + '.png') < 0 || pedidos.indexOf(base + '.json') < 0;
      });
      ok(conImagen.length > 0 && sinPedir.length === 0,
         'cada objeto con textura pidió la suya y su sidecar (' + conImagen.length +
         ' de ' + comp.campo.length + '; sin pedir: ' +
         (sinPedir.map(function (g) { return g.nombre; }).join(', ') || 'ninguno') + ')');
      ok(r.pintado > 0, 'el campo lleva luz del objeto (' + r.pintado + ' px)');
      ok(r.aviso === '', 'y no hay aviso de que falte la imagen ("' + r.aviso + '")');
    });
  });
}, Promise.resolve()).then(function () {
  /* ── El régimen mixto, que es el de hoy ──────────────────────────────────── */
  console.log('\nEl campo de M51 con el manifiesto INCOMPLETO y sin respaldo:');
  /* Mientras el banco no cubra el catálogo entero habrá objetos sin fila en el
     campo (NGC 5195, hoy). El apagado del respaldo tiene que valer también para
     ellos: si no, apagarlo no apagaría nada y quedaría la dependencia externa
     que L1.2 busca. */
  var P = fresco();
  P.cfg.proxyRespaldo = false;
  var f5194 = filaDe(P, 'NGC 5194');
  /* Desde que el manifiesto declara el banco entero (#258), el campo de M51 lo
     tiene todo cubierto y el régimen mixto hay que PROVOCARLO: se le quita la
     fila al acompañante. Antes salía solo, porque NGC 5195 no tenía textura. El
     listón no cambia —apagar el respaldo tiene que valer también para el objeto
     sin fila—; lo que cambia es que ya no se puede contar con que el catálogo
     vaya por delante del manifiesto para montar el caso. */
  window.BITACORA_DSO_TEXTURAS = window.BITACORA_DSO_TEXTURAS.filter(function (t) {
    return t[0] !== 'NGC 5195';
  });
  var sinFila = P.ps1GalaxiasDelCampo(catalogoDe(P), f5194[2], f5194[3], 40)
    .filter(function (g) { return !P.ps1FilaTextura(g.nombre); });
  ok(sinFila.length > 0, 'el campo trae algún objeto que el manifiesto no menciona (' +
     (sinFila.map(function (g) { return g.nombre; }).join(', ') || 'ninguno') + ')');
  pedidos = [];
  return renderCampo(P, f5194, 40, 64).then(function (r) {
    ok(fueraDeDso().length === 0,
       'tampoco por ellos sale nada fuera de dso/ (' + pedidos.length + ' en total; fuera: ' +
       (fueraDeDso()[0] || 'ninguna') + ')');
    ok(r.pintado > 0, 'y el apuntado se sigue pintando desde su textura (' + r.pintado + ' px)');
  });

}).then(function () {
  /* ── El respaldo sigue vivo ──────────────────────────────────────────────── */
  console.log('\nCon respaldo y una fila ausente (catálogo más nuevo que el manifiesto):');
  var P = fresco();
  var f = filaDe(P, 'NGC 5194');
  window.BITACORA_DSO_TEXTURAS = window.BITACORA_DSO_TEXTURAS.filter(function (t) {
    return t[0] !== 'NGC 5194';
  });
  ok(P.cfg.proxyRespaldo === true, 'proxyRespaldo viene encendido de fábrica');
  pedidos = [];
  return renderCampo(P, f, 40, 32).then(function (r) {
    var alProxy = pedidos.filter(function (u) { return u.indexOf('ps1-proxy.php') > 0; });
    ok(alProxy.length > 0, 'la petición al proxy SÍ sale (' + (alProxy[0] || 'ninguna') + ')');
    ok(/servicio de imágenes no responde/.test(r.aviso || ''),
       'y el aviso es el del servicio, que es el único camino que lo emite («' + (r.aviso || '') + '»)');
  });

}).then(function () {
  /* ADR 0005: cardinalidad mínima. Sin ella, una promesa perdida por el camino
     deja el proceso en verde con la mitad de los casos sin correr.
     Mutaciones documentadas, medidas: en `ps1FuenteParche`, cambiar
     `} else if (!PS1.proxyRespaldo) {` por `} else if (false) {` deja 1 rojo
     —el del régimen mixto, que es el único caso donde esa rama se pisa: con el
     manifiesto completo nadie llega a ella, y por eso ese caso está aquí—; en
     la misma función, cambiar `if (fila && fila[1] === 'imagen') {` por
     `if (false) {` (la textura deja de leerse y el objeto cae a su fila) deja 7
     rojos; y apagar la capa entera (`GALAXIAS_IMAGEN = false`), que es la
     manera barata de no pedir nada, deja otros 7: sin luz pintada, sin texturas
     pedidas y sin respaldo vivo no hay listón que valga. Vaciar
     `ps1FilaTextura` (que nunca encuentre fila) no deja rojos sino excepción:
     el manifiesto del apuntado se comprueba antes de renderizar. */
  console.log('');
  ok(comprobaciones >= 18, 'se ejecutaron todas las comprobaciones (' + comprobaciones + ' ≥ 18)');
  console.log(fallos ? '\n' + fallos + ' fallo(s).' : '\ntodo en orden.');
  process.exit(fallos ? 1 : 0);
}).catch(function (e) {
  console.error('EXCEPCIÓN: ' + e.stack);
  process.exit(1);
});
