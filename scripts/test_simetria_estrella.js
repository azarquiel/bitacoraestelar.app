#!/usr/bin/env node
/* ¿Es redonda una estrella, y salen sus espigas del centro?

   El observador ve el halo "más grande por un lado" y sospecha de la cruz de
   difracción. Aquí se mide, no se opina: un contexto de Canvas falso que
   ACUMULA la matriz de transformación (save/restore/translate/rotate) y anota
   dónde cae de verdad cada capa —núcleo, aureola, glow y cada uno de los
   brazos— en coordenadas del lienzo.

   Lo que se comprueba:
     1. Núcleo y aureola son círculos concéntricos con la estrella (nada de
        centros desplazados entre capas).
     2. Cada brazo de la araña ARRANCA en el centro exacto de la estrella.
     3. Los brazos son iguales entre sí y están equiespaciados: el conjunto es
        invariante al girarlo un paso, así que no puede alargar el halo por un
        lado.
     4. El sprite del brazo es simétrico respecto a su propio eje: si el perfil
        transversal no lo fuera, los cuatro brazos saldrían descentrados en el
        mismo sentido de giro y la cruz quedaría en molinete.

   Sin dependencias:  node scripts/test_simetria_estrella.js */
'use strict';

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function casi(a, b, tol, etiqueta) {
  ok(Math.abs(a - b) <= tol, etiqueta + ' (' + a.toFixed(4) + ' vs ' + b.toFixed(4) + ')');
}

/* ── Canvas falso con matriz de transformación ─────────────────────────────── */
var SPRITES = [];          // ImageData de cada putImageData (el brazo, entre otros)
function ctxConMatriz(el) {
  var m = [1, 0, 0, 1, 0, 0], pila = [];
  var reg = { arcos: [], imagenes: [], gradientes: [] };
  var estado = { globalAlpha: 1 };
  function punto(x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
  var api = {
    canvas: el,
    save: function () { pila.push(m.slice()); },
    restore: function () { if (pila.length) m = pila.pop(); },
    translate: function (tx, ty) { m[4] += m[0] * tx + m[2] * ty; m[5] += m[1] * tx + m[3] * ty; },
    rotate: function (t) {
      var c = Math.cos(t), s = Math.sin(t);
      var a = m[0] * c + m[2] * s, b = m[1] * c + m[3] * s;
      var cc = -m[0] * s + m[2] * c, d = -m[1] * s + m[3] * c;
      m[0] = a; m[1] = b; m[2] = cc; m[3] = d;
    },
    createRadialGradient: function (x0, y0, r0, x1, y1, r1) {
      var g = { x0: x0, y0: y0, r0: r0, x1: x1, y1: y1, r1: r1, stops: [] };
      g.addColorStop = function (p, c) { g.stops.push([p, c]); };
      api._ultimoGradiente = g;
      reg.gradientes.push(g);
      return g;
    },
    createImageData: function (w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    getImageData: function (x, y, w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    putImageData: function (im) { SPRITES.push(im); },
    beginPath: function () {},
    fill: function () {},
    fillRect: function () {},
    arc: function (x, y, r) {
      reg.arcos.push({ centro: punto(x, y), r: r, alpha: estado.globalAlpha, grad: api._ultimoGradiente });
    },
    drawImage: function (img, dx, dy, dw, dh) {
      if (dw == null) return;
      reg.imagenes.push({
        // Los dos extremos del EJE del sprite: mitad del borde de arranque y
        // mitad del borde final. Es lo que hay que mirar para saber de dónde
        // sale un brazo y hacia dónde va.
        arranque: punto(dx, dy + dh / 2), final: punto(dx + dw, dy + dh / 2),
        w: dw, h: dh, alpha: estado.globalAlpha
      });
    },
    _reg: reg
  };
  return new Proxy(api, {
    get: function (t, p) { return (p in t) ? t[p] : function () {}; },
    set: function (t, p, v) { estado[p] = v; t[p] = v; return true; }
  });
}

global.window = {};
var CTXS = [];             // un contexto por canvas de sprite creado
global.document = {
  createElement: function () {
    var el = { width: 64, height: 64 };
    el.getContext = function () {
      if (!el._ctx) { el._ctx = ctxConMatriz(el); CTXS.push(el._ctx); }
      return el._ctx;
    };
    return el;
  }
};
require('../resources/js/bitacora-gaia-color.js');
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;
var CFG = R.config;

/* ── Una sola estrella brillante, centrada, con araña ──────────────────────── */
var SIZE = 720;
var lienzo = { width: SIZE, height: SIZE };
var ctx = ctxConMatriz(lienzo);
lienzo.getContext = function () { return ctx; };
var RA0 = 100, DEC0 = 20;
R.dibujar(ctx, [[RA0, DEC0, 2.0, 0.5]], {
  ra: RA0, dec: DEC0, arcmin: 45, mlim: 13, apertura: 200, afov: 100,
  arana: true, conGlow: true
});
var reg = ctx._reg;
var CX = SIZE / 2, CY = SIZE / 2;

console.log('1. Núcleo y aureola: círculos concéntricos con la estrella');
ok(reg.arcos.length >= 2, 'se dibujan al menos dos capas circulares (' + reg.arcos.length + ')');
reg.arcos.forEach(function (a, i) {
  casi(a.centro[0], CX, 1e-9, 'capa ' + i + ': centro X en la estrella');
  casi(a.centro[1], CY, 1e-9, 'capa ' + i + ': centro Y en la estrella');
  ok(a.grad && a.grad.x0 === a.grad.x1 && a.grad.y0 === a.grad.y1,
    'capa ' + i + ': el gradiente es radial concéntrico, no desplazado');
});

console.log('\n2. Cada brazo de la araña arranca en el centro de la estrella');
var brazos = reg.imagenes.filter(function (im) { return im.w > im.h; });
ok(brazos.length === CFG.spikes.brazos,
  'se dibujan los ' + CFG.spikes.brazos + ' brazos configurados (' + brazos.length + ')');
brazos.forEach(function (b, i) {
  casi(b.arranque[0], CX, 1e-9, 'brazo ' + i + ': arranque X en el centro');
  casi(b.arranque[1], CY, 1e-9, 'brazo ' + i + ': arranque Y en el centro');
});

console.log('\n3. Los brazos son iguales y equiespaciados (el conjunto no alarga un lado)');
var largos = brazos.map(function (b) { return b.w; });
var grosores = brazos.map(function (b) { return b.h; });
ok(Math.max.apply(null, largos) - Math.min.apply(null, largos) < 1e-9,
  'todos los brazos miden lo mismo (' + largos[0].toFixed(2) + ' px)');
ok(Math.max.apply(null, grosores) - Math.min.apply(null, grosores) < 1e-9,
  'todos los brazos tienen el mismo grosor (' + grosores[0].toFixed(2) + ' px)');
var angulos = brazos.map(function (b) {
  return Math.atan2(b.final[1] - CY, b.final[0] - CX) * 180 / Math.PI;
}).map(function (a) { return (a + 360) % 360; }).sort(function (a, b) { return a - b; });
var paso = 360 / CFG.spikes.brazos;
for (var k = 1; k < angulos.length; k++) {
  casi(angulos[k] - angulos[k - 1], paso, 1e-6,
    'separación entre brazos consecutivos = ' + paso + '°');
}
// Suma vectorial de las puntas: si un lado se alargara, no daría cero.
var sx = 0, sy = 0;
brazos.forEach(function (b) { sx += b.final[0] - CX; sy += b.final[1] - CY; });
casi(Math.sqrt(sx * sx + sy * sy), 0, 1e-6,
  'las puntas se cancelan entre sí: el conjunto no tira hacia ningún lado');

console.log('\n4. El sprite del brazo es simétrico respecto a su propio eje');
/* El perfil transversal se hornea en el sprite (gaussiana en el grosor). Si la
   fila y y su reflejo no valen lo mismo, el brazo va descentrado respecto al
   eje sobre el que se estampa: los cuatro salen desviados en el mismo sentido
   de giro y la cruz queda en molinete. */
var sprite = SPRITES.filter(function (im) { return im.width > im.height; }).pop();
ok(!!sprite, 'se capturó el sprite del brazo (' + (sprite ? sprite.width + '×' + sprite.height : '—') + ')');
if (sprite) {
  var W = sprite.width, H = sprite.height, peorFila = 0, peorY = -1;
  var col = Math.round(W * 0.3);            // dentro del lóbulo central
  for (var y = 0; y < H; y++) {
    var a1 = sprite.data[(y * W + col) * 4 + 3];
    var a2 = sprite.data[((H - 1 - y) * W + col) * 4 + 3];
    if (Math.abs(a1 - a2) > peorFila) { peorFila = Math.abs(a1 - a2); peorY = y; }
  }
  ok(peorFila === 0,
    'perfil transversal simétrico: mayor diferencia entre la fila y su reflejo = ' +
    peorFila + '/255' + (peorY >= 0 ? ' (fila ' + peorY + ')' : ''));
  // Y el centro de masa transversal cae en el eje geométrico del sprite.
  var suma = 0, momento = 0;
  for (var y2 = 0; y2 < H; y2++) {
    var a = sprite.data[(y2 * W + col) * 4 + 3];
    suma += a; momento += a * (y2 + 0.5);
  }
  casi(momento / suma, H / 2, 1e-6, 'el centro de masa del brazo cae en el eje del sprite');
}

console.log('\n5. El glow de las que no llegan al límite también es redondo y centrado');
/* Es la capa que se ve como "halo" alrededor de las tenues: un sprite cuadrado
   con gradiente radial, estampado por su esquina. Si el gradiente no cayera en
   el centro geométrico del sprite, o el radio no llegara igual a los cuatro
   lados, el halo saldría más largo por un sitio -que es justo la sospecha-. */
var ctxTenue = ctxConMatriz(lienzo);
R.dibujar(ctxTenue, [[RA0, DEC0, 15.0, 0.5]], {
  ra: RA0, dec: DEC0, arcmin: 45, mlim: 13, apertura: 200, afov: 100,
  arana: true, conGlow: true
});
var glows = ctxTenue._reg.imagenes.filter(function (im) { return im.w === im.h; });
ok(glows.length === 1, 'la tenue dibuja una sola capa de glow (' + glows.length + ')');
glows.forEach(function (gl) {
  // arranque y final son los dos extremos del eje horizontal del sprite: su
  // punto medio es el centro del cuadrado estampado.
  casi((gl.arranque[0] + gl.final[0]) / 2, CX, 1e-9, 'glow: centro X en la estrella');
  casi(gl.arranque[1], CY, 1e-9, 'glow: centro Y en la estrella');
});
var ctxGlow = CTXS.filter(function (c) {
  return c.canvas.width === c.canvas.height && c._reg.gradientes.length === 1;
})[0];
ok(!!ctxGlow, 'se capturó el sprite del glow');
if (ctxGlow) {
  var S = ctxGlow.canvas.width, gr = ctxGlow._reg.gradientes[0];
  casi(gr.x0, S / 2, 1e-9, 'glow: el gradiente arranca en el centro geométrico del sprite (X)');
  casi(gr.y0, S / 2, 1e-9, 'glow: el gradiente arranca en el centro geométrico del sprite (Y)');
  ok(gr.x0 === gr.x1 && gr.y0 === gr.y1, 'glow: gradiente concéntrico, no desplazado');
  casi(gr.r1, S / 2, 1e-9, 'glow: el radio llega igual a los cuatro lados del sprite');
}

console.log('\n' + (fallos === 0 ? '✓ Todo correcto.' : '✗ ' + fallos + ' fallo(s).'));
process.exit(fallos === 0 ? 0 : 1);
