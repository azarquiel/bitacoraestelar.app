#!/usr/bin/env node
/* La petición de vista del simulador (simulador_ocular/resources/js/
   bitacora-peticion-vista.js) y lo que cuelga de ella: el orden de las
   peticiones, la cancelación de lo superado y la clasificación de errores.

   Sin red: `fetch` e `Image` son de mentira, y los tests miran las llamadas
   que salen, no el DOM. Esto sustituye a las regex que contaban cosas sobre
   bitacora-ocular.js; el cableado del simulador sigue en
   test_fallos_no_escondidos.js, que sí lo ejecuta.

   Uso: node scripts/test_peticion_vista.js */
'use strict';

var fs = require('fs'), path = require('path');
var RAIZ = path.join(__dirname, '..');
var fallos = 0;
function ok(c, t) { console.log('  ' + (c ? 'ok  ' : 'FALLA') + '  ' + t); if (!c) fallos++; }

var MODULOS = ['resources/js/bitacora-gaia-render.js', 'resources/js/bitacora-ps1.js',
               'resources/js/bitacora-png16.js',
               'simulador_ocular/resources/js/galaxias-datos.js',
               'simulador_ocular/resources/js/nebulosas-datos.js',
               'simulador_ocular/resources/js/dso-texturas-datos.js',
               'simulador_ocular/resources/js/bitacora-peticion-vista.js'];
/* Módulos recién cargados: las cachés de Gaia y de PS1 viven dentro y son de
   sesión, así que cada caso empieza de cero. */
function fresco() {
  MODULOS.forEach(function (m) { delete require.cache[require.resolve(path.join(RAIZ, m))]; });
  global.window = {};
  MODULOS.forEach(function (m) { require(path.join(RAIZ, m)); });
  return window;
}

/* fetch de mentira que se queda esperando y rechaza (AbortError) cuando se
   aborta su signal, como el de verdad. Guarda cada llamada. */
var llamadas, orden = [];
function fetchColgado(respuesta) {
  llamadas = [];
  global.fetch = function (url, o) {
    var signal = o && o.signal;
    var llamada = { url: String(url), signal: signal };
    llamadas.push(llamada); orden.push('gaia');
    return new Promise(function (res, rej) {
      llamada.responder = function () { res(respuesta); };
      llamada.fallar = function (e) { rej(e); };
      if (signal) signal.addEventListener('abort', function () {
        var e = new Error('The operation was aborted'); e.name = 'AbortError'; rej(e);
      });
    });
  };
}
var GAIA_OK = { ok: true, json: function () { return Promise.resolve({ data: [[10, 20, 8.5]] }); } };
// Image de mentira: guarda las instancias y lo que se le puso en src.
var imagenes;
global.Image = function () { imagenes.push(this); orden.push('placa'); this.crossOrigin = null; };
Object.defineProperty(global.Image.prototype, 'src', { set: function (u) { this.url = u; }, get: function () { return this.url; } });
function turno() { return new Promise(function (r) { setTimeout(r, 5); }); }

function casos() {
  var w, P, R;

  console.log('1. Gaia sale a la vez que la placa:');
  w = fresco(); R = w.BitacoraGaiaRender; imagenes = []; orden = []; fetchColgado(GAIA_OK);
  P = w.BitacoraPeticionVista.crear().nueva();
  var l = P.lanzar({
    gaia: function (p) { return p.gaia(10, 20, 60, 15); },
    placas: ['http://placa/profunda', 'http://placa/corta']
  });
  ok(llamadas.length === 1 && /gaia_proxy/.test(llamadas[0].url),
    'la consulta de Gaia ya está en vuelo sin que haya llegado ninguna placa');
  ok(imagenes.length === 2 && imagenes[0].url === 'http://placa/profunda',
    'y las dos placas se piden en el mismo turno');
  ok(orden.join() === 'gaia,placa,placa', 'y Gaia salió PRIMERO (orden real de las salidas: ' + orden.join(',') + ')');
  imagenes[0].onload(); imagenes[1].onload();
  llamadas[0].responder();
  return Promise.all([l.placas, l.gaia]).then(function (r) {
    ok(r[0].length === 2 && r[0][0] === imagenes[0], 'las placas llegan en el orden pedido');
    ok(r[1].length === 1, 'y Gaia devuelve sus estrellas');

    console.log('\n2. Una vista nueva deja superada a la anterior y aborta lo que ya no espera nadie:');
    w = fresco(); R = w.BitacoraGaiaRender; imagenes = []; fetchColgado(GAIA_OK);
    var vistas = w.BitacoraPeticionVista.crear();
    var vieja = vistas.nueva();
    var lv = vieja.lanzar({ gaia: function (p) { return p.gaia(10, 20, 60, 15); }, placas: ['http://placa/vieja'] });
    lv.gaia.catch(function () {});
    var nueva = vistas.nueva();
    ok(!vieja.vivo() && nueva.vivo(), 'la anterior deja de ser vivo() al instante');
    ok(!llamadas[0].signal.aborted, 'pero su descarga no se aborta todavía (la nueva aún puede unirse)');
    return turno().then(function () {
      ok(llamadas[0].signal.aborted, 'un turno después, el fetch de Gaia superado está abortado');
      ok(imagenes[0].url === '', 'y la placa pendiente se suelta (src vacío: el navegador corta la descarga)');
      return Promise.all([lv.placas, lv.gaia.then(function () { return 'ok'; }, function (e) { return e; })]);
    }).then(function (r) {
      ok(r[0][0] === null, 'la placa cancelada resuelve null, como una placa caída');
      ok(w.BitacoraPeticionVista.clasificar(r[1]) === 'cancelada', 'el error de Gaia se clasifica «cancelada»');
      ok(llamadas.length === 1, 'y no se reintenta: un solo fetch');
    });
  }).then(function () {
    console.log('\n3. Lo que otra vista comparte no se aborta:');
    w = fresco(); fetchColgado(GAIA_OK); imagenes = [];
    var vistas = w.BitacoraPeticionVista.crear();
    var a = vistas.nueva();
    a.gaia(10, 20, 60, 15).catch(function () {});
    var b = vistas.nueva();                          // pide LO MISMO: cambió la pupila, no el campo
    b.gaia(10, 20, 60, 15).catch(function () {});
    ok(llamadas.length === 1, 'la vista nueva se une a la consulta que ya vuela (un solo fetch)');
    return turno().then(function () {
      ok(!llamadas[0].signal.aborted, 'abortar la vieja no tumba la consulta que la nueva espera');
      vistas.nueva();                                // y ahora la nueva también queda superada
      return turno();
    }).then(function () {
      ok(llamadas[0].signal.aborted, 'cuando ya no la espera nadie, sí se aborta');

      // Precalentado del formulario: sin signal, inabortable.
      w = fresco(); fetchColgado(GAIA_OK);
      var vv = w.BitacoraPeticionVista.crear();
      w.BitacoraGaiaRender.consultar(10, 20, 60, 15).catch(function () {});
      vv.nueva().gaia(10, 20, 60, 15).catch(function () {});
      vv.nueva();
      return turno().then(function () {
        ok(!llamadas[0].signal.aborted, 'una consulta sin signal (el precalentado) no la cancela nadie');
      });
    });
  }).then(function () {
    console.log('\n4. Clasificación de errores:');
    w = fresco(); fetchColgado(GAIA_OK);
    var C = w.BitacoraPeticionVista.clasificar;
    var p = w.BitacoraPeticionVista.crear().nueva();
    var r = p.gaia(10, 20, 60, 15);
    llamadas[0].fallar(new TypeError('Failed to fetch'));
    return turno().then(function () {
      ok(llamadas.length === 2, 'un fallo de red se reintenta una vez');
      llamadas[1].fallar(new TypeError('Failed to fetch'));
      return r.then(function () { return null; }, function (e) { return e; });
    }).then(function (e) {
      ok(C(e) === 'red', 'tras el reintento es «red» (cae a la placa de respaldo)');
      ok(C(new TypeError("Cannot read properties of undefined")) === 'codigo', 'un error de código es «codigo»');
      var c = new Error('x'); c.cancelada = true;
      ok(C(c) === 'cancelada' && C(null) === 'codigo', '«cancelada» solo si lo marca la cancelación');
    });
  }).then(function () {
    console.log('\n5. La placa tiene timeout y su fallo es el de siempre (null):');
    w = fresco(); imagenes = [];
    var t0 = Date.now();
    var pl = w.BitacoraGaiaRender.cargarPlaca('http://placa/colgada', { timeout: 20 });
    return pl.then(function (im) {
      ok(im === null && Date.now() - t0 < 1000, 'sin respuesta, resuelve null al vencer el timeout');
      ok(w.BitacoraPeticionVista.PLACA_TIMEOUT_MS > 0, 'y la petición de vista le pasa un timeout por defecto');
      var pasado;
      w.BitacoraGaiaRender.cargarPlaca = function (u, o) { pasado = o; return Promise.resolve(null); };
      w.BitacoraPeticionVista.crear().nueva().placa('http://x');
      ok(pasado && pasado.timeout === w.BitacoraPeticionVista.PLACA_TIMEOUT_MS && pasado.signal,
        'con el signal de la vista');
    });
  }).then(function () {
    console.log('\n6. El parche PS1 de una vista superada: ni descarga ni CPU:');
    var BASE = 'https://textura-de-mentira/dso/', FIXT = path.join(RAIZ, 'scripts', 'fixtures', 'dso');
    function servir() {
      llamadas = [];
      global.fetch = function (url, o) {
        url = String(url);
        llamadas.push({ url: url, signal: o && o.signal });
        var ruta = path.join(FIXT, url.slice(BASE.length));
        if (url.indexOf(BASE) !== 0 || !fs.existsSync(ruta)) return Promise.resolve({ ok: false, status: 404 });
        var b = fs.readFileSync(ruta);
        return Promise.resolve({
          ok: true, status: 200,
          arrayBuffer: function () { return Promise.resolve(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); },
          json: function () { return Promise.resolve(JSON.parse(b.toString('utf8'))); }
        });
      };
    }
    function galDe(PS1) {
      var cat = PS1.ps1CatalogoDifuso(window.BITACORA_GALAXIAS, window.BITACORA_NEBULOSAS);
      var f = cat.filter(function (r) { return r[0] === 'NGC 5194'; })[0];
      return { cat: cat, gal: PS1.ps1GalaxiasDelCampo([f], f[2], f[3], PS1.ps1LadoArcmin(f[4]))[0] };
    }
    w = fresco(); w.BitacoraPS1.texturasUrl = BASE; servir();
    var g = galDe(w.BitacoraPS1);
    return w.BitacoraPS1.ps1ParcheDeGalaxia(g.gal, [], g.cat, 16, {}, { vivo: function () { return true; } })
      .then(function (viva) {
        ok(viva && viva.datos, 'con la vista viva el parche sale entero (el caso de control)');
        w = fresco(); w.BitacoraPS1.texturasUrl = BASE; servir();
        g = galDe(w.BitacoraPS1);
        return w.BitacoraPS1.ps1ParcheDeGalaxia(g.gal, [], g.cat, 16, {}, { vivo: function () { return false; } });
      }).then(function (muerta) {
        ok(muerta === null, 'con la vista superada resuelve null sin montar el parche (máscara, relleno, anclaje)');

        // Abort: nadie más espera la textura → se aborta; y no queda en caché.
        w = fresco(); w.BitacoraPS1.texturasUrl = BASE; fetchColgado(null);
        g = galDe(w.BitacoraPS1);
        var ctrl = new AbortController();
        var pa = w.BitacoraPS1.ps1FuenteParche(g.gal, {}, ctrl.signal);
        ok(llamadas.length === 2 && !llamadas[0].signal.aborted, 'la textura (png + json) está en vuelo');
        ctrl.abort();
        return pa.then(function (f) {
          ok(f === null && llamadas[0].signal.aborted && llamadas[1].signal.aborted,
            'superada y sin más usuarios: los dos fetch se abortan y resuelve null');
          w.BitacoraPS1.ps1FuenteParche(g.gal, {}, null);
          ok(llamadas.length === 4, 'lo abortado no se queda en caché: la vista siguiente la vuelve a pedir');

          // Compartida con quien no puede cancelar: no se aborta.
          w = fresco(); w.BitacoraPS1.texturasUrl = BASE; fetchColgado(null);
          g = galDe(w.BitacoraPS1);
          var c2 = new AbortController();
          w.BitacoraPS1.ps1FuenteParche(g.gal, {}, null);
          w.BitacoraPS1.ps1FuenteParche(g.gal, {}, c2.signal);
          c2.abort();
          ok(llamadas.length === 2 && !llamadas[0].signal.aborted, 'si otro la espera sin signal, abortar una vista no la tumba');
        });
      });
  });
}

casos().then(function () {
  console.log(fallos === 0 ? '\nTodo correcto.' : '\n' + fallos + ' fallo(s).');
  process.exit(fallos === 0 ? 0 : 1);
}, function (e) { console.error(e); process.exit(1); });
