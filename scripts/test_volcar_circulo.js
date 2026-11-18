#!/usr/bin/env node
/* Test del VOLCADO del lienzo de trabajo al modal «Imagen del simulador» (#587).

   En Firefox 160 + GPU AMD, drawImage de canvas a canvas no pinta nada y el
   modal subía una imagen negra. volcarCirculo prueba UNA vez por lienzo si
   drawImage copia (cuadrado rojo de 50 px, la reproducción del issue): si
   copia, usa drawImage (rápido, < 1 ms); si no, copia por píxeles
   (getImageData/putImageData) con la máscara circular hecha a mano.

   Sin dependencias:  node scripts/test_volcar_circulo.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function ok(cond, et) {
  if (cond) { console.log('  ok   ' + et); }
  else { fallos++; console.log('  FALLA ' + et); }
}

/* Canvas 2D mínimo con píxeles de verdad. `sana` decide si su drawImage copia
   (navegador normal) o no hace nada (Firefox 160 + AMD). El clip no se
   simula: el recorte circular de drawImage es cosa del navegador. */
var SANA = true;   // la de los lienzos que crea document.createElement
function lienzo(w, h, sana) {
  var cv = { width: w, height: h, lecturas: 0, copias: 0 }, px = null;
  function datos() { if (!px) px = new Uint8ClampedArray(cv.width * cv.height * 4); return px; }
  var ctx = {
    fillStyle: '#000',
    fillRect: function (x, y, rw, rh) {
      var p = datos(), c = this.fillStyle === '#000' ? [0, 0, 0] : [255, 0, 0];
      for (var j = y; j < y + rh; j++) for (var i = x; i < x + rw; i++) {
        var k = (j * cv.width + i) * 4; p[k] = c[0]; p[k + 1] = c[1]; p[k + 2] = c[2]; p[k + 3] = 255;
      }
    },
    getImageData: function (x, y, rw, rh) {
      cv.lecturas++;
      var p = datos(), d = new Uint8ClampedArray(rw * rh * 4);
      for (var j = 0; j < rh; j++) for (var i = 0; i < rw; i++) {
        var s = ((y + j) * cv.width + x + i) * 4, t = (j * rw + i) * 4;
        for (var c = 0; c < 4; c++) d[t + c] = p[s + c];
      }
      return { width: rw, height: rh, data: d };
    },
    putImageData: function (im, x, y) {
      var p = datos();
      for (var j = 0; j < im.height; j++) for (var i = 0; i < im.width; i++) {
        var s = (j * im.width + i) * 4, t = ((y + j) * cv.width + x + i) * 4;
        for (var c = 0; c < 4; c++) p[t + c] = im.data[s + c];
      }
    },
    drawImage: function (src, x, y) {
      cv.copias++;
      if (!sana) return;
      var l = src.lecturas;
      this.putImageData(src.getContext('2d').getImageData(0, 0, src.width, src.height), Math.round(x), Math.round(y));
      src.lecturas = l;   // la copia de la GPU no es una lectura de la página
    },
    save: function () {}, restore: function () {}, beginPath: function () {}, arc: function () {}, clip: function () {}
  };
  cv.getContext = function () { return ctx; };
  cv.ctx = ctx;
  cv.pixel = function (x, y) { var p = datos(), k = (y * cv.width + x) * 4; return [p[k], p[k + 1], p[k + 2], p[k + 3]].join(); };
  return cv;
}
global.document = { createElement: function () { return lienzo(0, 0, SANA); } };

// Lienzo de trabajo rojo liso de D px y modal con restos de la vista anterior.
var D = 100;
function escena(sana) {
  SANA = sana;
  var off = lienzo(D, D, sana); off.ctx.fillStyle = 'red'; off.ctx.fillRect(0, 0, D, D);
  var modal = lienzo(900, 900, sana); modal.ctx.fillStyle = 'red'; modal.ctx.fillRect(0, 0, 900, 900);
  return { off: off, modal: modal };
}

ok(typeof R.volcarCirculo === 'function', 'BitacoraGaiaRender.volcarCirculo existe');

console.log('drawImage roto: copia por píxeles (#587):');
var e = escena(false), modal = e.modal;
R.volcarCirculo(modal.ctx, e.off, D);
ok(modal.pixel(450, 450) === '255,0,0,255', 'el centro del modal lleva la señal de off (' + modal.pixel(450, 450) + ')');
ok(modal.pixel(450, 405) === '255,0,0,255', 'y dentro del círculo, cerca del borde (' + modal.pixel(450, 405) + ')');
ok(modal.pixel(401, 401) === '0,0,0,255', 'la esquina del cuadrado, fuera del círculo, queda negra (' + modal.pixel(401, 401) + ')');
ok(modal.pixel(10, 10) === '0,0,0,255', 'el resto del modal queda negro, sin el rojo de la prueba (' + modal.pixel(10, 10) + ')');
var b = modal.pixel(450, 400).split(',').map(Number);
ok(b[0] > 0 && b[0] < 255 && b[3] === 255, 'el borde se suaviza, opaco (' + b.join() + ')');
R.volcarCirculo(modal.ctx, e.off, D);
ok(modal.copias === 1, 'la prueba de drawImage se hace una sola vez por lienzo (' + modal.copias + ' drawImage en 2 volcados)');

console.log('drawImage sano: se usa drawImage, sin coste extra:');
e = escena(true); modal = e.modal;
R.volcarCirculo(modal.ctx, e.off, D);
ok(modal.pixel(450, 450) === '255,0,0,255', 'el centro del modal lleva la señal de off (' + modal.pixel(450, 450) + ')');
ok(e.off.lecturas === 0, 'el lienzo de trabajo no se lee por píxeles (' + e.off.lecturas + ' getImageData)');
ok(modal.pixel(10, 10) === '0,0,0,255', 'la prueba no deja rojo en el modal (' + modal.pixel(10, 10) + ')');
R.volcarCirculo(modal.ctx, e.off, D);
ok(modal.lecturas === 1, 'el modal se lee una sola vez, en la prueba (' + modal.lecturas + ' getImageData en 2 volcados)');

console.log('El modal del registro vuelca con volcarCirculo:');
var JS = require('fs').readFileSync(require('path').join(__dirname, '../registro/resources/js/bitacora-formulario.js'), 'utf8');
var volcar = (JS.match(/function volcar\(\)\{[\s\S]*?\n    \}/) || [''])[0];
ok(/BitacoraGaiaRender\.volcarCirculo\(ctx, off, D\)/.test(volcar), 'volcar() llama a volcarCirculo');
ok(volcar.length > 0 && !/\.drawImage\(/.test(volcar), 'y no copia por su cuenta con drawImage');

console.log(fallos === 0 ? '\nTodo verde.' : '\n' + fallos + ' fallo(s).');
process.exit(fallos === 0 ? 0 : 1);
