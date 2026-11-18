#!/usr/bin/env node
/* Test del VOLCADO del lienzo de trabajo al modal «Imagen del simulador» (#587).

   En Firefox 160 + GPU AMD, drawImage de canvas a canvas no pinta nada y el
   modal subía una imagen negra. volcarCirculo copia por píxeles
   (getImageData/putImageData) con la máscara circular hecha a mano, que en ese
   navegador sí funciona. El canvas falso de aquí NO tiene drawImage: si el
   volcado lo usara, el test revienta.

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

// Canvas 2D mínimo con píxeles de verdad: fillRect, getImageData, putImageData.
function lienzo(w, h) {
  var px = new Uint8ClampedArray(w * h * 4);
  var ctx = {
    fillStyle: '#000',
    fillRect: function (x, y, rw, rh) {
      var c = this.fillStyle === '#000' ? [0, 0, 0] : [255, 0, 0];
      for (var j = y; j < y + rh; j++) for (var i = x; i < x + rw; i++) {
        var k = (j * w + i) * 4; px[k] = c[0]; px[k + 1] = c[1]; px[k + 2] = c[2]; px[k + 3] = 255;
      }
    },
    getImageData: function (x, y, rw, rh) {
      var d = new Uint8ClampedArray(rw * rh * 4);
      for (var j = 0; j < rh; j++) for (var i = 0; i < rw; i++) {
        var s = ((y + j) * w + x + i) * 4, t = (j * rw + i) * 4;
        for (var c = 0; c < 4; c++) d[t + c] = px[s + c];
      }
      return { width: rw, height: rh, data: d };
    },
    putImageData: function (im, x, y) {
      for (var j = 0; j < im.height; j++) for (var i = 0; i < im.width; i++) {
        var s = (j * im.width + i) * 4, t = ((y + j) * w + x + i) * 4;
        for (var c = 0; c < 4; c++) px[t + c] = im.data[s + c];
      }
    }
  };
  return { width: w, height: h, ctx: ctx, getContext: function () { return ctx; },
           pixel: function (x, y) { var k = (y * w + x) * 4; return [px[k], px[k + 1], px[k + 2], px[k + 3]].join(); } };
}

console.log('Volcado sin drawImage (#587):');
var D = 100;
var off = lienzo(D, D); off.ctx.fillStyle = 'red'; off.ctx.fillRect(0, 0, D, D);
var modal = lienzo(900, 900);
modal.ctx.fillStyle = 'red'; modal.ctx.fillRect(0, 0, 900, 900);   // restos de la vista anterior
ok(typeof R.volcarCirculo === 'function', 'BitacoraGaiaRender.volcarCirculo existe');
if (typeof R.volcarCirculo === 'function') {
  R.volcarCirculo(modal.ctx, off, D);
  ok(modal.pixel(450, 450) === '255,0,0,255', 'el centro del modal lleva la señal de off (' + modal.pixel(450, 450) + ')');
  ok(modal.pixel(450, 405) === '255,0,0,255', 'y dentro del círculo, cerca del borde (' + modal.pixel(450, 405) + ')');
  ok(modal.pixel(401, 401) === '0,0,0,255', 'la esquina del cuadrado, fuera del círculo, queda negra (' + modal.pixel(401, 401) + ')');
  ok(modal.pixel(10, 10) === '0,0,0,255', 'el resto del modal queda negro (' + modal.pixel(10, 10) + ')');
  var b = modal.pixel(450, 400).split(',').map(Number);
  ok(b[0] > 0 && b[0] < 255 && b[3] === 255, 'el borde se suaviza, opaco (' + b.join() + ')');
}

console.log('El modal del registro vuelca con volcarCirculo:');
var JS = require('fs').readFileSync(require('path').join(__dirname, '../registro/resources/js/bitacora-formulario.js'), 'utf8');
var volcar = (JS.match(/function volcar\(\)\{[\s\S]*?\n    \}/) || [''])[0];
ok(/BitacoraGaiaRender\.volcarCirculo\(ctx, off, D\)/.test(volcar), 'volcar() llama a volcarCirculo');
ok(volcar.length > 0 && !/\.drawImage\(/.test(volcar), 'y no usa drawImage');

console.log(fallos === 0 ? '\nTodo verde.' : '\n' + fallos + ' fallo(s).');
process.exit(fallos === 0 ? 0 : 1);
