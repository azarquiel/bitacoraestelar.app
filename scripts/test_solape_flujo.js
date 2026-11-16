#!/usr/bin/env node
/* Las estrellas que se solapan se suman en FLUJO, no en DN (#541).

   La capa de estrellas está en dominio logarítmico: pintarFot la decodifica con
   flujoDeValor. Sumar DN con 'lighter' entre dos estrellas es multiplicar sus
   flujos; la suma física es valorDeFlujo(Σ flujoDeValor(v_i)).

   Node no tiene canvas, así que se usa uno falso con un buffer de píxeles de
   verdad: cada arco o sprite suma round(255·globalAlpha) en el píxel de su
   centro y recorta a 255, como 'lighter' en 8 bits. Es una estrella de un píxel,
   pero la aritmética entre estrellas es la de capaEstrellas sin trampas.

   Lo que se comprueba:
     1. Una estrella sola sale con el mismo valor que pinta su sprite.
     2. Dos estrellas iguales en el mismo punto: el centro vale
        valorDeFlujo(2·flujoDeValor(v)), no 2v (criterio 2 de #541).
     3. Dos estrellas lejos: cada una con su v, sin cruzarse.
     4. Conservación: Σ flujo de la capa = Σ flujo de cada estrella por separado.
     5. Seis estrellas en el mismo punto, que en DN pasarían de 255, suman en
        flujo sin recorte por solape.

   Sin dependencias:  node scripts/test_solape_flujo.js */
'use strict';

function lienzoFalso(el) {
  var W = el.width, H = el.height;
  if (!el._px || el._px.length !== W * H * 4) el._px = new Uint8ClampedArray(W * H * 4);
  var px = el._px, arco = null, st = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '#000' };
  function sumar(x, y) {
    var ix = Math.floor(x), iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
    var a = Math.round(255 * st.globalAlpha), k = (iy * W + ix) * 4;
    px[k] = Math.min(255, px[k] + a); px[k + 1] = Math.min(255, px[k + 1] + a); px[k + 2] = Math.min(255, px[k + 2] + a);
  }
  var api = {
    canvas: el,
    createRadialGradient: function () { return { addColorStop: function () {} }; },
    createImageData: function (w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    fillRect: function (x, y, w, h) {
      // Solo el fondo negro opaco; el resto de rellenos rectangulares no se usan aquí.
      for (var yy = Math.max(0, y); yy < Math.min(H, y + h); yy++)
        for (var xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) {
          var k = (yy * W + xx) * 4; px[k] = px[k + 1] = px[k + 2] = 0; px[k + 3] = 255;
        }
    },
    getImageData: function (x, y, w, h) {
      var d = new Uint8ClampedArray(w * h * 4);
      for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) {
        var s = ((y + yy) * W + (x + xx)) * 4, t = (yy * w + xx) * 4;
        d[t] = px[s]; d[t + 1] = px[s + 1]; d[t + 2] = px[s + 2]; d[t + 3] = px[s + 3];
      }
      return { width: w, height: h, data: d };
    },
    arc: function (x, y) { arco = [x, y]; },
    fill: function () { if (arco) sumar(arco[0], arco[1]); arco = null; },
    drawImage: function (img, dx, dy, dw, dh) { if (dw != null) sumar(dx + dw / 2, dy + dh / 2); }
  };
  return new Proxy(api, {
    get: function (t, p) { if (p in t) return t[p]; if (p in st) return st[p]; return function () {}; },
    set: function (t, p, v) { st[p] = v; return true; }
  });
}
global.window = {};
global.document = {
  createElement: function () {
    var el = { width: 32, height: 32 };
    el.getContext = function () { return lienzoFalso(el); };
    return el;
  }
};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;
var rango = R.config.rangoBrillo;   // el mismo rango con que pintarFot relee la capa
function fdv(v) { return R.flujoDeValor(v, 1, rango); }
function vdf(F) { return R.valorDeFlujo(F, 1, rango); }

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

var SIZE = 64, c = (SIZE / 2) * SIZE + SIZE / 2;   // píxel central
var o = { ra: 100, dec: 20, arcmin: 30, mlim: 16, afov: 100, apertura: 200, conGlow: true, arana: false };
function capa(estrellas) { return R.capaEstrellas(estrellas, o, SIZE); }
function sumaFlujo(cp) { var s = 0; for (var i = 0; i < cp.length; i++) if (cp[i] > 0) s += fdv(cp[i]); return s; }

var una = [100, 20, 14, null];
var v = capa([una])[c * 3];
ok(v > 0 && v < 128, 'una estrella G=14 pinta su centro con v=' + v + ' (entre 0 y 128, para que 2v no recorte)');

var dos = capa([una, una.slice()])[c * 3];
var esperado = vdf(2 * fdv(v));
ok(Math.abs(dos - esperado) <= 0.5, 'dos iguales en el mismo punto: centro ' + dos.toFixed(2) + ' = valorDeFlujo(2·flujoDeValor(v)) = ' + esperado.toFixed(2) + ' (no 2v = ' + 2 * v + ')');

var lejos = capa([una, [100, 20 + 10 / 60, 14, null]]);
var c2 = Math.floor(SIZE / 2 - 10 / 30 * SIZE) * SIZE + SIZE / 2;   // 10′ al norte en un campo de 30′
ok(lejos[c * 3] === v && lejos[c2 * 3] === v, 'dos lejos: cada una con su v (' + lejos[c * 3] + ', ' + lejos[c2 * 3] + ')');

var muchas = [una, una, una, una, una, una, [100, 20 + 10 / 60, 14, null]];   // seis en el centro: 6v > 255
var cm = capa(muchas), porSeparado = 0;
for (var k = 0; k < muchas.length; k++) porSeparado += sumaFlujo(capa([muchas[k]]));
var err = Math.abs(sumaFlujo(cm) - porSeparado) / porSeparado;
ok(err <= 0.005, 'conservación: Σ flujo de la capa = Σ por separado (error ' + (100 * err).toFixed(3) + ' %)');
var seis = vdf(6 * fdv(v));
ok(6 * v > 255 && Math.abs(cm[c * 3] - seis) <= 0.5, 'seis en el mismo punto no recortan a 255 por solape (centro ' + cm[c * 3].toFixed(1) + ', esperado ' + seis.toFixed(1) + ')');

console.log('\n' + (fallos === 0 ? '✓ Todo correcto.' : '✗ ' + fallos + ' fallo(s).'));
process.exit(fallos === 0 ? 0 : 1);
