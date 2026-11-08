#!/usr/bin/env node
/* Costura de parches: ningún parche PS1 puede dejar un CANTO RECTO en pantalla.

   El síntoma (M78): junto a la nebulosa aparece un corte vertical recto y, al
   otro lado, luz más brillante que la propia M78. No es Gaia ni la textura de
   M78: son los recortes de NGC 2064, NGC 2067 y M78 (NGC2068), pintados cada
   uno dentro de su cuadrado y cada uno con su propia ganancia de anclaje.
   Medido en el diagnóstico (.scratch/diag-m78):
     · los cuadrados casi no se solapan —solo 2067∩M78, una esquina de
       0,7′×1,1′; 2064 no toca a ninguno—, así que los escalones son CANTOS
       LIBRES que cortan nebulosa, no luz contada dos veces;
     · las tres filas acaban en el mismo μ medio (~21,4, suelo MU_MIN de
       gen_nebulosas.py), así que la misma luz del complejo sale con ganancias
       que difieren ×11 (2067) y ×17 (2064) respecto de M78;
     · M57 y M1, cuyo recorte llega a cielo oscuro, no tienen escalón.

   Qué se mide: lo que llega a PANTALLA —la imagen que `pintarFot` pone con
   putImageData al final de `ps1CapaGalaxias`—, por la composición de
   producción y sin réplica (ADR 0008). El detector no sabe dónde están los
   parches: busca en cada fila y cada columna un tramo de ≥ RUN píxeles
   seguidos en los que el salto entre x−2 y x+2 supera T niveles con el MISMO
   signo. Eso es un canto recto; la estructura de una nebulosa no aguanta
   recta y del mismo signo tanto trecho. Al no ir atado a los bordes del
   cuadrado, un arreglo que solo MUEVA el corte (p. ej. a la mediatriz entre
   dos objetos) sigue en rojo.

   No vacuo (ADR 0005): M57 y M1 tienen que salir sin canto con el mismo
   detector, y M78 tiene que seguir pintada —un «arreglo» que apague la capa
   también quitaría el canto—.

   Lo arregla el lado medido (ADR 0034): el parche de M78 crece por la
   escalera hasta que su marco llega al cielo (20′), y NGC 2064 y NGC 2067,
   cuyo centro cae dentro, salen `cubierta` en el manifiesto y no pintan. Se
   mide con el manifiesto COMMITEADO: si alguien vuelve a publicar los tres
   parches sueltos, esto vuelve a rojo.

   Fixtures: la textura golden de M78 (scripts/fixtures/dso) y su Gaia
   (gaia_ngc2068.csv, radio 0,75·20′ desde ADR 0034: cubre el campo entero).

   Uso:  node scripts/test_costura_parches.js */
'use strict';
var fs = require('fs'), path = require('path');
var RAIZ = path.join(__dirname, '..');
var DIRS_DSO = [path.join(__dirname, 'fixtures', 'dso')];
var DIR_GAIA = path.join(__dirname, 'fixtures', 'gaia');
var BASE = 'https://textura-de-mentira/dso/';

var T = 6;      // niveles (0-255) de salto entre x−2 y x+2
/* Calibrado el 2026-11-08 sobre el estado de main en 6afc287:
     canto más largo  M78 190× 61 px · M78 100× 31 px  |  M57 16 px · M1 16 px
   (nitidez media del canto de M78 ≈ 1,0; borde del óvalo de M57 ≈ 0,76).
   RUN queda en medio, con 7–8 px de margen a cada lado. */
var RUN = 24;        // píxeles seguidos, rectos, nítidos y del mismo signo
var NITIDEZ = 0.8;   // salto de 1 px / salto de 4 px, por línea
var SIZE = 720, AFOV = 70;

var fallos = 0;
function ok(c, t) { console.log('  ' + (c ? 'ok  ' : 'FALLO') + '  ' + t); if (!c) fallos++; }

/* Canvas de mentira para `desenfocar` (adaptación local de pintarFot): el
   `filter: blur(r)` de CSS es un gaussiano de σ = r, aquí separable y en JS.
   Sin esto pintarFot lanza, el catch de ps1CapaGalaxias se lo traga y no se
   pinta nada (lo cazan las guardas de abajo). */
function lienzoDeMentira() {
  var W = 0, H = 0, datos = null, filtro = '';
  var c = { getContext: function () { return ctx; } };
  Object.defineProperty(c, 'width', { get: function () { return W; }, set: function (v) { W = v; } });
  Object.defineProperty(c, 'height', { get: function () { return H; }, set: function (v) { H = v; } });
  var ctx = {
    set filter(v) { filtro = v; }, get filter() { return filtro; },
    createImageData: function (w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
    putImageData: function (im) { datos = new Uint8ClampedArray(im.data); },
    getImageData: function () { return { data: datos || new Uint8ClampedArray(W * H * 4) }; },
    drawImage: function (otro) {
      var src = otro._datos(), m = /blur\(([\d.]+)px\)/.exec(filtro), s = m ? +m[1] : 0;
      datos = s > 0 ? desenfoqueGauss(src, W, H, s) : new Uint8ClampedArray(src);
    }
  };
  c._datos = function () { return datos; };
  return c;
}
function desenfoqueGauss(rgba, W, H, s) {
  var r = Math.ceil(3 * s), k = [], suma = 0, i, x, y, t;
  for (i = -r; i <= r; i++) { k.push(Math.exp(-i * i / (2 * s * s))); suma += k[k.length - 1]; }
  for (i = 0; i < k.length; i++) k[i] /= suma;
  var a = new Float32Array(W * H), b = new Float32Array(W * H);
  for (i = 0; i < W * H; i++) a[i] = rgba[i * 4];
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    var acc = 0;
    for (t = -r; t <= r; t++) { var xx = Math.min(W - 1, Math.max(0, x + t)); acc += k[t + r] * a[y * W + xx]; }
    b[y * W + x] = acc;
  }
  var out = new Uint8ClampedArray(W * H * 4);
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    var acc2 = 0;
    for (t = -r; t <= r; t++) { var yy = Math.min(H - 1, Math.max(0, y + t)); acc2 += k[t + r] * b[yy * W + x]; }
    var j = (y * W + x) * 4;
    out[j] = out[j + 1] = out[j + 2] = Math.round(acc2); out[j + 3] = 255;
  }
  return out;
}
global.document = { createElement: function () { return lienzoDeMentira(); } };

/* Módulos frescos por caso: cachePS1 es de sesión y un campo vería los
   parches del anterior. */
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
global.fetch = function (url) {
  url = String(url);
  var ruta = null;
  if (url.indexOf(BASE) === 0) DIRS_DSO.forEach(function (d) {
    var p = path.join(d, url.slice(BASE.length));
    if (!ruta && fs.existsSync(p)) ruta = p;
  });
  if (!ruta) return Promise.resolve({ ok: false, status: 404 });
  var b = fs.readFileSync(ruta);
  return Promise.resolve({ ok: true, status: 200,
    arrayBuffer: function () { return Promise.resolve(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); },
    json: function () { return Promise.resolve(JSON.parse(b.toString('utf8'))); } });
};

function leerGaia(f) {
  return fs.readFileSync(path.join(DIR_GAIA, f), 'utf8').trim().split('\n').slice(1)
    .map(function (l) { var t = l.split(','); return [+t[0], +t[1], +t[2]]; });
}

/* Pantalla de la capa difusa: el gris del último putImageData. */
function render(caso) {
  var P = fresco();
  var pantalla = null, difuso = new Float32Array(SIZE * SIZE);
  var ctx = { canvas: { width: SIZE, height: SIZE },
              createImageData: function (w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
              putImageData: function (im) { pantalla = im.data; } };
  var cielo = { pupilaSalida: caso.D / caso.M, pupilaOjo: 7, sqm: caso.sqm, aumentos: caso.M, perceptual: true };
  var arcmin = AFOV / caso.M * 60;
  return P.ps1CapaGalaxias(difuso, ctx, cielo, null, {
    ra0: caso.ra, dec0: caso.dec, arcmin: arcmin, size: SIZE,
    estrellas: leerGaia(caso.gaia), apertura: caso.D
  }).then(function (res) {
    var nivel = new Float32Array(SIZE * SIZE);
    if (pantalla) for (var i = 0; i < nivel.length; i++) nivel[i] = pantalla[i * 4];
    var campo = P.ps1GalaxiasDelCampo(P.ps1CatalogoDifuso(window.BITACORA_GALAXIAS, window.BITACORA_NEBULOSAS),
                                      caso.ra, caso.dec, arcmin).map(function (g) { return g.nombre; });
    return { nivel: nivel, pintado: !!pantalla, campo: campo, arcmin: arcmin, aviso: (res && res.aviso) || '' };
  });
}

/* Canto recto más largo. Vertical: columna x fija, salto horizontal
   L(x−2,y) − L(x+2,y). Horizontal: fila y fija, salto vertical. */
function cantoMasLargo(L) {
  var mejor = { run: 0 };
  function px(vertical, a, b) { return vertical ? L[b * SIZE + a] : L[a * SIZE + b]; }
  /* Dónde está el borde en la línea b: la posición (a−3…a+3) del mayor salto
     de 1 px. En un canto recto es la MISMA a lo largo de todo el tramo; en el
     borde curvo de un objeto (el anillo de M57) se desplaza. */
  function bordeEn(vertical, a, b) {
    var arg = a, max = -1;
    for (var x = Math.max(0, a - 3); x <= Math.min(SIZE - 2, a + 3); x++) {
      var s = Math.abs(px(vertical, x, b) - px(vertical, x + 1, b));
      if (s > max) { max = s; arg = x; }
    }
    return { en: arg, salto1: max };
  }
  /* Tramo recto Y nítido más largo dentro de [ini, fin): líneas seguidas cuyo
     borde cae en la posición más repetida (±1) y en las que el salto de 1 px
     es al menos NITIDEZ del salto entre a−2 y a+2. Un corte de parche pasa de
     imagen a nada en un píxel; el borde físico de un objeto (el óvalo de M57)
     viene suavizado por la PSF y reparte el salto en varios. */
  function rectoMasLargo(vertical, a, ini, fin) {
    var cuenta = {}, pos = [], b, moda = a, mc = 0;
    for (b = ini; b < fin; b++) {
      var e = bordeEn(vertical, a, b), d4 = Math.abs(px(vertical, a - 2, b) - px(vertical, a + 2, b));
      pos.push({ en: e.en, nit: d4 > 0 ? e.salto1 / d4 : 0 });
      cuenta[e.en] = (cuenta[e.en] || 0) + 1;
      if (cuenta[e.en] > mc) { mc = cuenta[e.en]; moda = e.en; }
    }
    var run = 0, top = 0, nit = 0, nitTop = 0;
    for (b = 0; b < pos.length; b++) {
      if (Math.abs(pos[b].en - moda) <= 1 && pos[b].nit >= NITIDEZ) { run++; nit += pos[b].nit; }
      else { run = 0; nit = 0; }
      if (run > top) { top = run; nitTop = nit / run; }
    }
    return { run: top, nit: nitTop };
  }
  function barrer(vertical) {
    for (var a = 3; a < SIZE - 3; a++) {
      var run = 0, signo = 0, ini = 0, suma = 0;
      for (var b = 0; b <= SIZE; b++) {
        var d = b < SIZE ? px(vertical, a - 2, b) - px(vertical, a + 2, b) : 0;
        var s = d >= T ? 1 : d <= -T ? -1 : 0;
        if (s !== 0 && s === signo) { run++; suma += Math.abs(d); continue; }
        if (run >= RUN / 2) {
          var recto = rectoMasLargo(vertical, a, ini, ini + run);
          if (recto.run > mejor.run) {
            mejor = { run: recto.run, nit: recto.nit, vertical: vertical, en: a, desde: ini, salto: suma / run };
          }
        }
        run = s ? 1 : 0; signo = s; ini = b; suma = s ? Math.abs(d) : 0;
      }
    }
  }
  barrer(true); barrer(false);
  return mejor;
}
function describe(c) {
  if (!c.run) return 'sin canto';
  return (c.vertical ? 'columna x=' : 'fila y=') + c.en + ' desde ' + c.desde + ', ' + c.run +
    ' px, salto medio ' + c.salto.toFixed(1) + ' niveles, nitidez ' + c.nit.toFixed(2);
}

/* Señal del objeto apuntado: px a más de T niveles sobre el fondo del lienzo,
   dentro de r < 1′ del centro (M57, el más pequeño, mide ~1,2′ de radio). */
function senalCentral(L, arcmin) {
  var fondo = [], n = 0, r = SIZE / arcmin, c = SIZE / 2;
  for (var i = 0; i < SIZE; i += 7) fondo.push(L[i], L[(SIZE - 1) * SIZE + i]);
  fondo.sort(function (a, b) { return a - b; });
  var f0 = fondo[fondo.length >> 1];
  for (var y = 0; y < SIZE; y++) for (var x = 0; x < SIZE; x++) {
    if ((x - c) * (x - c) + (y - c) * (y - c) < r * r && L[y * SIZE + x] > f0 + T) n++;
  }
  return n / (Math.PI * r * r);
}

function volcar(L, canto, nombre) {
  var rgb = new Uint8Array(SIZE * SIZE * 3), i;
  for (i = 0; i < L.length; i++) rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = L[i];
  for (i = 0; canto.run && i < canto.run + 20; i++) {
    var b = canto.desde + i - 10;
    if (b < 0 || b >= SIZE) continue;
    var k = canto.vertical ? b * SIZE + canto.en + 4 : (canto.en + 4) * SIZE + b;
    rgb[k * 3] = 255; rgb[k * 3 + 1] = rgb[k * 3 + 2] = 0;
  }
  fs.mkdirSync(process.env.COSTURA_PNG, { recursive: true });
  require('./lib_png.js').escribir(path.join(process.env.COSTURA_PNG,
    nombre.replace(/[^A-Za-z0-9]+/g, '_') + '.png'), rgb, SIZE, SIZE);
}

var M78 = { ra: 86.69092, dec: 0.07931, gaia: 'gaia_ngc2068.csv' };
var CASOS = [
  { nombre: 'M78 · 457 mm 190× SQM 21,2', obj: M78, D: 457.2, M: 190, sqm: 21.2, canto: false },
  { nombre: 'M78 · 203 mm 100× SQM 20,5', obj: M78, D: 203, M: 100, sqm: 20.5, canto: false },
  /* Centrado en las cubiertas (ADR 0034): el borde de 20′ del parche de M78
     queda a ~3′ de NGC 2064, dentro del campo. Sin canto también aquí. */
  { nombre: 'NGC 2064 · 457 mm 190× SQM 21,2', obj: { ra: 86.5766, dec: 0.0059, gaia: 'gaia_ngc2068.csv' },
    D: 457.2, M: 190, sqm: 21.2, cubierta: true },
  { nombre: 'NGC 2064 · 203 mm 100× SQM 20,5', obj: { ra: 86.5766, dec: 0.0059, gaia: 'gaia_ngc2068.csv' },
    D: 203, M: 100, sqm: 20.5, cubierta: true },
  { nombre: 'NGC 2067 · 457 mm 190× SQM 21,2', obj: { ra: 86.6328, dec: 0.1313, gaia: 'gaia_ngc2068.csv' },
    D: 457.2, M: 190, sqm: 21.2, cubierta: true },
  { nombre: 'NGC 2067 · 203 mm 100× SQM 20,5', obj: { ra: 86.6328, dec: 0.1313, gaia: 'gaia_ngc2068.csv' },
    D: 203, M: 100, sqm: 20.5, cubierta: true },
  // Controles: recorte que llega a cielo oscuro. Si el detector los marcara,
  // estaría midiendo estructura y no costura.
  { nombre: 'control M57 · 457 mm 190× SQM 21,2', obj: { ra: 283.39587, dec: 33.02858, gaia: 'gaia_ngc6720.csv' },
    D: 457.2, M: 190, sqm: 21.2, control: true },
  { nombre: 'control M1 · 457 mm 190× SQM 21,2', obj: { ra: 83.63321, dec: 22.01447, gaia: 'gaia_ngc1952.csv' },
    D: 457.2, M: 190, sqm: 21.2, control: true }
];

CASOS.reduce(function (cadena, caso) {
  return cadena.then(function () {
    var c = { D: caso.D, M: caso.M, sqm: caso.sqm, ra: caso.obj.ra, dec: caso.obj.dec, gaia: caso.obj.gaia };
    return render(c).then(function (r) {
      console.log(caso.nombre + '  (campo ' + r.arcmin.toFixed(1) + '′: ' + r.campo.join(', ') + ')');
      var canto = cantoMasLargo(r.nivel), senal = senalCentral(r.nivel, r.arcmin);
      /* COSTURA_PNG=<dir>: vuelca la pantalla con el canto marcado en rojo, para
         mirar qué ha encontrado el detector. */
      if (process.env.COSTURA_PNG) volcar(r.nivel, canto, caso.nombre);
      ok(r.pintado, 'la capa pinta');
      if (caso.cubierta) {
        /* Su luz va en el parche de M78, con el brillo de M78, y hoy no llega
           al umbral (0 % medido): no se exige verla, se exige que se DIGA. */
        console.log('  ·     visibilidad del apuntado: ' + (100 * senal).toFixed(0) + ' % de r<1′');
        ok(/vecina que la contiene/.test(r.aviso) && !/servici/i.test(r.aviso),
           'la cubierta avisa de dónde se pinta («' + r.aviso + '»)');
      } else {
        ok(senal > 0.2, 'el objeto apuntado sigue visible (' + (100 * senal).toFixed(0) + ' % de r<1′ sobre el fondo)');
      }
      ok(canto.run < RUN, 'sin canto recto ≥ ' + RUN + ' px y ≥ ' + T + ' niveles — el más largo: ' + describe(canto));
    });
  });
}, Promise.resolve()).then(function () {
  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTODO OK');
  process.exitCode = fallos ? 1 : 0;
});
