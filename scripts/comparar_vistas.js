#!/usr/bin/env node
/* Resta imagen a imagen dos etiquetas de harness_vistas_np.js.

   El paso 4 del procedimiento (notas/validacion-visual-difusas.md) pide comparar
   los dos directorios imagen a imagen. Mirar es imprescindible pero no basta: un
   píxel movido un nivel no se ve, y es justo el que dice si el cambio tocó los
   datos. Esto pone el número que el ojo no da, y sale de aquí para que la tabla
   del informe sea reproducible y no un recuento a mano.

   Lo que imprime por vista: píxeles distintos, |Δ| máximo en niveles, la
   DISTANCIA MÍNIMA entre dos píxeles que difieren —que es lo que separa el
   redondeo suelto de un borde, una malla o una mancha— y los píxeles negros
   nuevos, que son el síntoma de la ausencia mal decidida. Una vista que está en
   una etiqueta y no en la otra se lista aparte: eso lo explica el motivo que dio
   el arnés, no una resta.

   No es un test: no hay veredicto ni código de salida por umbral. El veredicto
   lo escribe una persona en el informe de la fase.

   Uso:  node scripts/comparar_vistas.js antes despues
         node scripts/comparar_vistas.js .scratch/vistas-np-antes .scratch/vistas-np-despues */
'use strict';

var fs = require('fs'), path = require('path');
var png = require('./lib_png.js');
var RAIZ = path.join(__dirname, '..');

function dir(a) {
  return fs.existsSync(a) ? a : path.join(RAIZ, '.scratch', 'vistas-np-' + a);
}
var A = dir(process.argv[2] || 'antes'), B = dir(process.argv[3] || 'despues');
if (!fs.existsSync(A) || !fs.existsSync(B)) {
  console.error('uso: node scripts/comparar_vistas.js <etiqueta|dir> <etiqueta|dir>');
  process.exit(2);
}

/* Gris: el arnés escribe los tres canales iguales, así que basta el rojo. */
function gris(ruta) {
  var im = png.leer(ruta), g = new Uint8Array(im.W * im.H);
  for (var i = 0; i < g.length; i++) g[i] = im.rgb[i * 3];
  return { W: im.W, H: im.H, g: g };
}

function comparar(n) {
  var a = gris(path.join(A, n)), b = gris(path.join(B, n));
  if (a.W !== b.W || a.H !== b.H) throw new Error(n + ': tamaños distintos');
  /* El fondo es el nivel más repetido: la rampa lo pinta en casi todo el lienzo.
     Sirve para saber qué píxel tenía objeto, que es donde un negro nuevo duele. */
  var cuenta = new Uint32Array(256), i;
  for (i = 0; i < a.g.length; i++) cuenta[a.g[i]]++;
  var fondo = 0;
  for (i = 1; i < 256; i++) if (cuenta[i] > cuenta[fondo]) fondo = i;

  var dif = [], maxD = 0, negros = 0;
  for (i = 0; i < a.g.length; i++) {
    var d = b.g[i] - a.g[i];
    if (d) { dif.push(i); if (Math.abs(d) > maxD) maxD = Math.abs(d); }
    if (b.g[i] === 0 && a.g[i] > fondo) negros++;
  }
  /* Distancia mínima entre dos píxeles que difieren, en la métrica de la
     cuadrícula. Con pocos píxeles el cuadrático sobra; si algún día son miles,
     esta cuenta es la que hay que cambiar.
     ponytail: O(n²) sobre los píxeles DISTINTOS, no sobre el lienzo. */
  var dmin = Infinity;
  for (i = 0; i < dif.length; i++) {
    for (var j = i + 1; j < dif.length; j++) {
      var xa = dif[i] % a.W, ya = (dif[i] / a.W) | 0, xb = dif[j] % a.W, yb = (dif[j] / a.W) | 0;
      dmin = Math.min(dmin, Math.abs(xa - xb) + Math.abs(ya - yb));
    }
  }
  return { dif: dif.length, maxD: maxD, negros: negros, dmin: dmin, px: a.g.length };
}

var enA = fs.readdirSync(A).filter(function (n) { return /\.png$/.test(n); }).sort();
var soloA = [], peor = 0, total = 0;
console.log('vista'.padEnd(34) + 'px≠   max|Δ|  dmin  negros nuevos');
enA.forEach(function (n) {
  if (!fs.existsSync(path.join(B, n))) { soloA.push(n); return; }
  var r = comparar(n);
  total += r.dif;
  if (r.maxD > peor) peor = r.maxD;
  console.log(n.replace(/\.png$/, '').padEnd(34) +
    String(r.dif).padEnd(6) + String(r.maxD).padEnd(8) +
    (r.dif > 1 ? String(r.dmin) : '—').padEnd(6) + r.negros);
});
var soloB = fs.readdirSync(B).filter(function (n) {
  return /\.png$/.test(n) && !fs.existsSync(path.join(A, n));
});
console.log('\n' + (enA.length - soloA.length) + ' parejas · ' + total +
  ' px distintos en total · |Δ| máximo ' + peor + ' nivel(es)');
if (soloA.length) console.log('solo en ' + path.basename(A) + ': ' + soloA.join(' '));
if (soloB.length) console.log('solo en ' + path.basename(B) + ': ' + soloB.join(' '));
