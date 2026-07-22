/* Test de la geometría pura del motor del mapa
   (mapa/js/via-lactea-geometria.js). Cubre el letterbox de object-fit:contain,
   la huella de un rectángulo rotado, el clamp del desplazamiento, el anclaje
   del zoom a un punto y la reproyección azimutal de la vista de canto.
   Sin framework:  node scripts/test_geometria.js */

'use strict';

var G = require('../mapa/js/via-lactea-geometria.js');

var fallos = 0;
function eq(a, b, et) {
  if (a === b) { console.log('  ok   ' + et); }
  else { fallos++; console.log('  FALLA ' + et + '\n         esperado ' + JSON.stringify(b) + '\n         obtenido ' + JSON.stringify(a)); }
}
function cerca(a, b, et, tol) {
  tol = tol || 1e-9;
  if (Math.abs(a - b) <= tol) { console.log('  ok   ' + et); }
  else { fallos++; console.log('  FALLA ' + et + '\n         esperado ≈' + b + '\n         obtenido ' + a); }
}
function eqRect(a, b, et) {
  var ok = a && Math.abs(a.left - b.left) < 1e-9 && Math.abs(a.top - b.top) < 1e-9 &&
    Math.abs(a.width - b.width) < 1e-9 && Math.abs(a.height - b.height) < 1e-9;
  if (ok) { console.log('  ok   ' + et); }
  else { fallos++; console.log('  FALLA ' + et + '\n         esperado ' + JSON.stringify(b) + '\n         obtenido ' + JSON.stringify(a)); }
}

console.log('rectContain (letterbox object-fit:contain):');
// Contenedor más ancho que la imagen -> bandas a los lados.
eqRect(G.rectContain(200, 100, 100, 100), { left: 50, top: 0, width: 100, height: 100 }, 'contenedor ancho -> bandas laterales');
// Contenedor más alto que la imagen -> bandas arriba/abajo.
eqRect(G.rectContain(100, 200, 100, 100), { left: 0, top: 50, width: 100, height: 100 }, 'contenedor alto -> bandas arriba/abajo');
// Misma relación de aspecto -> llena el contenedor, sin bandas.
eqRect(G.rectContain(300, 150, 200, 100), { left: 0, top: 0, width: 300, height: 150 }, 'misma relación -> sin bandas');
// natW/natH ausentes -> usa las del contenedor (no revienta con NaN).
eqRect(G.rectContain(200, 100, 0, 0), { left: 0, top: 0, width: 200, height: 100 }, 'sin dimensiones naturales -> usa el contenedor');

console.log('huellaRotada (caja envolvente de un rectángulo rotado):');
eqRect_wh(G.huellaRotada(100, 50, 0), 100, 50, '0° -> sin cambio');
eqRect_wh(G.huellaRotada(100, 50, 90), 50, 100, '90° -> intercambia ejes');
eqRect_wh(G.huellaRotada(100, 50, 180), 100, 50, '180° -> vuelve al original');
(function () {
  var d = 150 * Math.SQRT1_2; // (100+50)*cos45
  var h = G.huellaRotada(100, 50, 45);
  cerca(h.w, d, '45° -> ancho envolvente'); cerca(h.h, d, '45° -> alto envolvente');
})();
function eqRect_wh(o, w, h, et) { cerca(o.w, w, et + ' (w)'); cerca(o.h, h, et + ' (h)'); }

console.log('clampDesplazamiento (el contenido no se despega del visor):');
eq(G.clampDesplazamiento(150, 0, 300, 100, 100, 100).x, 100, 'x recorta al límite +');
eq(G.clampDesplazamiento(-150, 0, 300, 100, 100, 100).x, -100, 'x recorta al límite -');
eq(G.clampDesplazamiento(50, 0, 300, 100, 100, 100).x, 50, 'x dentro del límite pasa igual');
eq(G.clampDesplazamiento(50, 0, 80, 100, 100, 100).x, 0, 'contenido menor que el visor -> centrado (0)');

console.log('zoomAlrededor (mantiene fijo el punto bajo el cursor):');
eq(G.zoomAlrededor(0, 0, 0, 0, 1, 2).x, 0, 'centro y punto en el centro -> sin desplazamiento');
eq(G.zoomAlrededor(10, 0, 0, 0, 1, 2).x, 20, 'al duplicar la escala, el desplazamiento se duplica hacia el centro');
(function () {
  // El punto de pantalla px = cx bajo (cx,cy) debe seguir cayendo sobre el
  // mismo punto de contenido: (cx - pos)/escala invariante.
  var antesX = 30, cx = 5, sA = 2, sD = 3.5;
  var r = G.zoomAlrededor(antesX, 0, cx, 0, sA, sD);
  cerca((cx - antesX) / sA, (cx - r.x) / sD, 'punto de contenido bajo el cursor invariante');
})();

console.log('xCantoSol / xCantoObjeto (reproyección azimutal, % de imagen):');
var ANCHO = 200000, R0 = 27000; // al (valores de ejemplo)
cerca(G.xCantoSol(0, ANCHO, R0), 50 - 100 * R0 / ANCHO, 'Sol en phi=0');
// Objeto en la dirección del núcleo a distancia R0 -> cae en el núcleo (x=50).
cerca(G.xCantoObjeto({ l: 0, b: 0, d: R0 }, 0, ANCHO, R0), 50, 'objeto en el núcleo -> x=50');
// Objeto situado en el Sol (d=0) -> cae donde el Sol.
cerca(G.xCantoObjeto({ l: 0, b: 0, d: 0 }, 0, ANCHO, R0), G.xCantoSol(0, ANCHO, R0), 'objeto en el Sol -> x del Sol');

if (fallos) { console.log('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nTodo verde.');
