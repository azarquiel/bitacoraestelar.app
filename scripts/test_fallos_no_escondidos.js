#!/usr/bin/env node
/* Un fallo de PS1 o un error de código no se quedan escondidos en el simulador
   (historia #462).

   Lo que fija, ejecutando el código de verdad (fetch falso, DOM falso):

     1. Un parche de PS1 que no llegó por la red no se queda en la caché: al
        volver a pedir la misma galaxia se vuelve a pedir a la red.
     2. Un error de código en la vista de Gaia (un TypeError) sale en
        console.error y no se disfraza de «Gaia no responde»: la placa DSS de
        respaldo es solo para fallos de red o de proxy.
     3. El fallo de la superposición de Gaia de un objeto que ya no está
        elegido no toca sim-aviso.
     4. Tras un fallo de CORS, elegir otro objeto u otro origen lo vuelve a
        intentar.

   El simulador (simulador_ocular/resources/js/bitacora-ocular.js) se carga
   entero sobre un DOM de mentira; de los módulos compartidos se cambian solo
   las tres llamadas que salen a la red (vistaGaia, consultar, cargarPlaca),
   que el simulador lee en el momento de cada llamada.

   Sin dependencias:  node scripts/test_fallos_no_escondidos.js  */
'use strict';

var fs = require('fs'), path = require('path');
var RAIZ = path.join(__dirname, '..');

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.log('  FALLA ' + etiqueta); }
}
// Deja correr las promesas pendientes (varias vueltas: las cadenas son largas).
function vaciar() {
  var p = Promise.resolve();
  for (var i = 0; i < 20; i++) p = p.then(function () { return new Promise(function (r) { setImmediate(r); }); });
  return p;
}
function cargar(rel) {
  var ruta = path.join(RAIZ, rel);
  delete require.cache[require.resolve(ruta)];
  require(ruta);
}

// Los contadores de segundos y el antirrebote no tienen que correr aquí.
global.setTimeout = function () { return 0; };
global.clearTimeout = function () {};

/* ── 1. PS1: la caché no guarda el null de un fallo de red ─────────────────── */
function casoPS1() {
  console.log('\n1. Un parche de PS1 que falló por la red se vuelve a pedir:');
  var BASE = 'https://textura-de-mentira/dso/';
  var FIXT = path.join(RAIZ, 'scripts', 'fixtures', 'dso');
  global.window = {};
  ['resources/js/bitacora-gaia-render.js', 'resources/js/bitacora-ps1.js',
   'resources/js/bitacora-png16.js', 'simulador_ocular/resources/js/galaxias-datos.js',
   'simulador_ocular/resources/js/nebulosas-datos.js',
   'simulador_ocular/resources/js/dso-texturas-datos.js'].forEach(cargar);
  var P = window.BitacoraPS1;
  P.texturasUrl = BASE;
  P.proxyUrl = 'https://proxy-de-mentira/ps1-proxy.php';

  var caida = true, pedidos = [];
  global.fetch = function (url) {
    url = String(url); pedidos.push(url);
    if (caida) return Promise.reject(new TypeError('Failed to fetch'));
    var ruta = path.join(FIXT, url.slice(BASE.length));
    if (url.indexOf(BASE) !== 0 || !fs.existsSync(ruta)) return Promise.resolve({ ok: false, status: 404 });
    var b = fs.readFileSync(ruta);
    return Promise.resolve({
      ok: true, status: 200,
      arrayBuffer: function () { return Promise.resolve(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); },
      json: function () { return Promise.resolve(JSON.parse(b.toString('utf8'))); }
    });
  };
  var cat = P.ps1CatalogoDifuso(window.BITACORA_GALAXIAS, window.BITACORA_NEBULOSAS);
  var f = cat.filter(function (r) { return r[0] === 'NGC 5194'; })[0];
  var gal = P.ps1GalaxiasDelCampo([f], f[2], f[3], P.ps1LadoArcmin(f[4]))[0];

  var notas1 = {};
  return P.ps1FuenteParche(gal, notas1).then(function (p1) {
    ok(p1 === null && notas1.motivo === 'red', 'con la red caída: null con motivo «red»');
    var antes = pedidos.length;
    caida = false;
    return P.ps1FuenteParche(gal, {}).then(function (p2) {
      ok(pedidos.length > antes, 'al volver a pedir M51 se pide otra vez la textura (' + (pedidos.length - antes) + ' peticiones)');
      ok(!!p2 && p2.datos instanceof Float32Array, 'y esta vez llega el parche');
      var tras = pedidos.length;
      return P.ps1FuenteParche(gal, {}).then(function (p3) {
        ok(pedidos.length === tras && p3 === p2, 'un parche bueno sí se queda en la caché: sin peticiones nuevas');
      });
    });
  }).then(function () {
    // El respaldo por el proxy: un objeto sin fila en el manifiesto.
    var g = { nombre: 'Objeto sin fila', ra: 10.5, dec: 20.25, ladoArcmin: 4 };
    P.proxyRespaldo = true;
    caida = true; pedidos = [];
    return P.ps1FuenteParche(g, {}).then(function () {
      return P.ps1FuenteParche(g, {});
    }).then(function () {
      var alProxy = pedidos.filter(function (u) { return u.indexOf('proxy-de-mentira') >= 0; }).length;
      ok(alProxy === 2, 'por el proxy, también: dos peticiones tras un fallo (' + alProxy + ')');
    });
  });
}

/* ── El simulador sobre un DOM de mentira ──────────────────────────────────── */
function ctxFalso() {
  return new Proxy({}, {
    get: function (o, k) {
      if (k in o) return o[k];
      if (k === 'canvas') return { width: 64, height: 64 };
      if (k === 'createImageData' || k === 'getImageData') return function (w, h) { return { data: new Uint8ClampedArray((w || 1) * (h || 1) * 4), width: w, height: h }; };
      if (k === 'measureText') return function () { return { width: 1 }; };
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return function () { return { addColorStop: function () {} }; };
      return function () {};
    },
    set: function (o, k, v) { o[k] = v; return true; }
  });
}
function elemento(id) {
  var oyentes = {}, at = {}, clases = {}, hijos = {};
  var el = {
    id: id, value: '', textContent: '', innerHTML: '', hidden: false, checked: true,
    style: {}, width: 64, height: 64, clientWidth: 560, options: [], selectedIndex: 0,
    dataset: {}, children: [], parentElement: null,
    classList: {
      toggle: function (c, f) { clases[c] = (f === undefined) ? !clases[c] : !!f; },
      add: function (c) { clases[c] = true; }, remove: function (c) { delete clases[c]; },
      contains: function (c) { return !!clases[c]; }
    },
    addEventListener: function (t, fn) { (oyentes[t] = oyentes[t] || []).push(fn); },
    removeEventListener: function () {},
    disparar: function (t) { (oyentes[t] || []).forEach(function (fn) { fn({ type: t, target: el, preventDefault: function () {} }); }); },
    setAttribute: function (k, v) { at[k] = String(v); }, getAttribute: function (k) { return k in at ? at[k] : null; },
    removeAttribute: function (k) { delete at[k]; }, hasAttribute: function (k) { return k in at; },
    querySelector: function (sel) { return hijos[sel] || (hijos[sel] = elemento(sel)); },
    querySelectorAll: function () { return []; },
    closest: function () { return null; }, contains: function () { return false; },
    appendChild: function (c) { return c; }, removeChild: function () {}, focus: function () {},
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 560, height: 560 }; },
    getContext: function () { return ctxFalso(); }
  };
  return el;
}

function montarSimulador() {
  global.window = global;
  global.innerWidth = 1200; global.innerHeight = 900; global.devicePixelRatio = 1;
  global.location = { origin: 'https://bitacora-de-mentira' };
  var nodos = {};
  // Cada lienzo auxiliar lee píxeles con getImageData: el test decide si el
  // navegador lo deja (CORS) y cuenta las lecturas.
  var lecturas = { n: 0, cors: false };
  global.document = {
    readyState: 'complete',
    getElementById: function (id) { return nodos[id] || (nodos[id] = elemento(id)); },
    createElement: function () {
      var c = elemento('');
      c.getContext = function () {
        var ctx = ctxFalso();
        ctx.getImageData = function (x, y, w, h) {
          lecturas.n++;
          if (lecturas.cors) throw new Error('SecurityError: tainted canvas');
          return { data: new Uint8ClampedArray(w * h * 4) };
        };
        return ctx;
      };
      return c;
    },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    addEventListener: function () {}, body: elemento('body'), documentElement: elemento('html')
  };
  global.fetch = function () { return Promise.reject(new TypeError('Failed to fetch')); };
  ['resources/js/bitacora-base.js', 'resources/js/bitacora-equipo.js',
   'resources/js/bitacora-gaia-render.js', 'resources/js/bitacora-ps1.js'].forEach(cargar);

  // Dos estrellas de carbono: la primera es la elegida al arrancar.
  global.BITACORA_CARBONO = [
    { id: 'C1', nombre: 'Primera', constelacion: '', ra: '04 45 42', dec: '+28 31 00', mag: 6, tipo: 'carbono' },
    { id: 'C2', nombre: 'Segunda', constelacion: '', ra: '12 45 07', dec: '+60 19 00', mag: 5, tipo: 'carbono' }
  ];
  // Los buscadores de catálogo se capturan para poder «elegir» a mano.
  var buscadores = [];
  BitacoraBase.montarBuscadorCatalogo = function (cfg) { buscadores.push(cfg); };
  BitacoraBase.montarCielo = function () {};

  // Las tres salidas a la red del simulador, controladas por el test.
  var R = BitacoraGaiaRender;
  // La consulta real se guarda: contra el fetch caído rechaza como en la
  // página, que es el fallo de red de verdad.
  var red = { placas: 0, vista: null, consulta: null, consultarReal: R.consultar };
  R.cargarPlaca = function () { red.placas++; return Promise.resolve({ width: 64, height: 64 }); };
  R.pintarFot = function () { return true; };
  R.flujoDePlaca = function (v) { return v; };
  R.fusionarPlacas = function (a) { return a; };
  R.dibujar = function () {};
  R.vistaGaia = function () { return red.vista ? red.vista() : new Promise(function () {}); };
  R.consultar = function () { return red.consulta ? red.consulta() : new Promise(function () {}); };

  var errores = [];
  var consolaError = console.error;
  console.error = function () { errores.push([].slice.call(arguments)); };

  cargar('simulador_ocular/resources/js/bitacora-ocular.js');
  return vaciar().then(function () {
    console.error = consolaError;
    var $ = document.getElementById;
    return {
      $: $, red: red, lecturas: lecturas, errores: errores,
      espiarErrores: function () { errores.length = 0; console.error = function () { errores.push([].slice.call(arguments)); }; },
      soltarErrores: function () { console.error = consolaError; },
      // El buscador del selector de objeto es el de `max: 40`.
      elegir: function (i) {
        var b = buscadores.filter(function (c) { return c.max === 40; })[0];
        b.onElegir(BITACORA_CARBONO[i]);
      },
      origen: function (v) { $('sim-origen').value = v; $('sim-origen').disparar('change'); }
    };
  });
}

function casosSimulador() {
  var S;
  return montarSimulador().then(function (s) {
    S = s;
    ok(S.errores.length === 0, 'el simulador arranca sobre el DOM falso sin errores (' +
      (S.errores[0] ? S.errores[0].join(' ') : '') + ')');

    console.log('\n2. Un error de código en la vista de Gaia no se disfraza de caída de Gaia:');
    var bug = new TypeError("Cannot read properties of undefined (reading 'rc')");
    S.red.vista = function () { return Promise.reject(bug); };
    S.espiarErrores();
    var placasAntes = S.red.placas;
    S.origen('canvas-2d');
    return vaciar().then(function () {
      S.soltarErrores();
      var visto = S.errores.some(function (a) { return a.indexOf(bug) >= 0; });
      ok(visto, 'el TypeError sale en console.error con el error entero (traza incluida)');
      var aviso = S.$('sim-aviso').textContent, cargando = S.$('sim-cargando').textContent;
      ok(!/no responde/.test(aviso) && !/no responde/.test(cargando),
        'ni el aviso ni el indicador dicen «no responde» («' + aviso + '» / «' + cargando + '»)');
      ok(aviso.length > 0, 'pero el aviso sí dice algo: el observador sabe que algo falló');
      ok(S.red.placas === placasAntes, 'y no se pide la placa DSS de respaldo');
      ok(S.$('sim-vista').getAttribute('aria-busy') === 'false', 'la vista deja de anunciarse ocupada');
    });
  }).then(function () {
    // El mismo camino con un fallo de red de verdad: la consulta real, contra un
    // fetch caído, rechaza; eso sí cae a la placa DSS.
    S.red.vista = function () { return S.red.consultarReal(10, 20, 30, 12); };
    S.espiarErrores();
    var placasAntes = S.red.placas;
    S.origen('');
    S.origen('canvas-2d');
    return vaciar().then(function () {
      S.soltarErrores();
      ok(S.red.placas > placasAntes, 'un fallo de red de Gaia sí cae a la placa DSS');
      ok(/Gaia DR3 no responde/.test(S.$('sim-cargando').textContent) || S.$('sim-cargando').style.display === 'none',
        'y ahí sí se dice que Gaia no responde');
      ok(S.errores.length === 0, 'sin console.error: un fallo de red no es un error de código');
    });
  }).then(function () {
    console.log('\n3. El fallo de la superposición de Gaia de otro objeto no toca sim-aviso:');
    var rechazar;
    S.red.consulta = function () { return new Promise(function (_, no) { rechazar = no; }); };
    S.origen('dss');
    return vaciar().then(function () {
      ok(typeof rechazar === 'function', 'la placa del primer objeto pide su superposición de Gaia');
      var primera = rechazar;
      S.red.consulta = null;   // la del segundo objeto queda en vuelo
      S.elegir(1);
      return vaciar().then(function () {
        S.$('sim-aviso').textContent = 'aviso del objeto nuevo';
        var e = new Error('gaia_proxy 502'); e.falloRed = true;
        primera(e);
        return vaciar();
      });
    }).then(function () {
      ok(S.$('sim-aviso').textContent === 'aviso del objeto nuevo',
        'el aviso del objeto nuevo sigue ahí («' + S.$('sim-aviso').textContent + '»)');
    });
  }).then(function () {
    console.log('   (y un error de código en la superposición tampoco se disfraza)');
    var bug = new TypeError('dibujar roto');
    S.red.consulta = function () { return Promise.reject(bug); };
    S.espiarErrores();
    S.elegir(0);
    return vaciar().then(function () {
      S.soltarErrores();
      ok(S.errores.some(function (a) { return a.indexOf(bug) >= 0; }), 'sale en console.error');
      ok(!/No se pudo consultar Gaia/.test(S.$('sim-aviso').textContent),
        'y el aviso no culpa a Gaia («' + S.$('sim-aviso').textContent + '»)');
      S.red.consulta = null;
    });
  }).then(function () {
    console.log('\n4. Tras un fallo de CORS se vuelve a intentar al cambiar de objeto u origen:');
    S.lecturas.cors = true;
    S.elegir(1);
    return vaciar().then(function () {
      ok(/CORS/.test(S.$('sim-aviso').textContent), 'el primer intento falla por CORS y lo avisa');
      S.lecturas.cors = false;
      var n = S.lecturas.n;
      S.elegir(0);
      return vaciar().then(function () {
        ok(S.lecturas.n > n, 'otro objeto: se vuelven a leer los píxeles (' + (S.lecturas.n - n) + ' lecturas)');
        ok(!/CORS/.test(S.$('sim-aviso').textContent), 'y el aviso de CORS se va');
      });
    }).then(function () {
      S.lecturas.cors = true;
      S.elegir(1);
      return vaciar();
    }).then(function () {
      S.lecturas.cors = false;
      var n = S.lecturas.n;
      S.origen('hips');
      return vaciar().then(function () {
        ok(S.lecturas.n > n, 'otro origen: se vuelven a leer los píxeles (' + (S.lecturas.n - n) + ' lecturas)');
      });
    });
  });
}

casoPS1().then(casosSimulador).then(function () {
  console.log(fallos === 0 ? '\nTodo verde.' : '\n' + fallos + ' fallo(s).');
  process.exit(fallos === 0 ? 0 : 1);
}).catch(function (e) {
  console.log('\nEl test se rompió: ' + (e && e.stack || e));
  process.exit(1);
});
