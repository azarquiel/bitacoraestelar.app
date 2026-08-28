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

console.log('proyectarInclinado / planoDesdePantalla (vista cenital inclinada):');
var VISTA = { ancho: 800, alto: 600, escala: 2, grados: 75, perspectiva: 1400 };
var PLANA = { ancho: 800, alto: 600, escala: 2, grados: 0, perspectiva: 1400 };
// Sin inclinar, la proyección es la escala de siempre alrededor del centro.
cerca(G.proyectarInclinado(500, 400, 0, PLANA).x, 400 + 2 * 100, 'sin inclinar -> escala pura en x');
cerca(G.proyectarInclinado(500, 400, 0, PLANA).y, 300 + 2 * 100, 'sin inclinar -> escala pura en y');
// El centro no se mueve nunca: es a la vez origen de transform y de perspectiva.
cerca(G.proyectarInclinado(400, 300, 0, VISTA).x, 400, 'el centro se queda en el centro (x)');
cerca(G.proyectarInclinado(400, 300, 0, VISTA).y, 300, 'el centro se queda en el centro (y)');
// Ida y vuelta sobre el plano: la inversa devuelve el punto de partida.
(function () {
  var p = G.proyectarInclinado(520, 460, 0, VISTA);
  var q = G.planoDesdePantalla(p.x, p.y, VISTA);
  cerca(q.x, 520, 'ida y vuelta en x', 1e-9);
  cerca(q.y, 460, 'ida y vuelta en y', 1e-9);
})();
// Inclinado, el borde de abajo queda más cerca del observador y se agranda; el
// de arriba se aleja y se encoge. Ambos por debajo del alto sin inclinar.
(function () {
  var abajo = G.proyectarInclinado(400, 600, 0, VISTA).y - 300;
  var arriba = 300 - G.proyectarInclinado(400, 0, 0, VISTA).y;
  if (abajo > arriba && abajo < 2 * 300) { console.log('  ok   el borde cercano se agranda y el lejano se encoge'); }
  else { fallos++; console.log('  FALLA el borde cercano se agranda y el lejano se encoge: ' + abajo + ' / ' + arriba); }
})();
// La altura sobre el plano acerca el punto al observador y lo sube en pantalla.
(function () {
  var suelo = G.proyectarInclinado(400, 400, 0, VISTA).y;
  var alto = G.proyectarInclinado(400, 400, 50, VISTA).y;
  if (alto < suelo) { console.log('  ok   un objeto sobre el plano se pinta más arriba'); }
  else { fallos++; console.log('  FALLA un objeto sobre el plano se pinta más arriba: ' + alto + ' >= ' + suelo); }
})();

console.log('giro en el plano (girar el disco antes de abatirlo):');
var GIRADA = { ancho: 800, alto: 600, escala: 2, grados: 75, perspectiva: 1400, giro: 30 };
// El centro es el eje del giro: no se mueve.
cerca(G.proyectarInclinado(400, 300, 0, GIRADA).x, 400, 'el eje del giro se queda quieto (x)');
cerca(G.proyectarInclinado(400, 300, 0, GIRADA).y, 300, 'el eje del giro se queda quieto (y)');
// Ida y vuelta con giro: la inversa tiene que deshacerlo también.
(function () {
  var p = G.proyectarInclinado(520, 460, 0, GIRADA);
  var q = G.planoDesdePantalla(p.x, p.y, GIRADA);
  cerca(q.x, 520, 'ida y vuelta con giro en x', 1e-9);
  cerca(q.y, 460, 'ida y vuelta con giro en y', 1e-9);
})();
// giro 0 y sin giro son la misma vista.
(function () {
  var sinGiro = G.proyectarInclinado(520, 460, 0, VISTA);
  var conGiro = G.proyectarInclinado(520, 460, 0,
    { ancho: 800, alto: 600, escala: 2, grados: 75, perspectiva: 1400, giro: 0 });
  cerca(conGiro.x, sinGiro.x, 'giro 0 no cambia nada (x)');
  cerca(conGiro.y, sinGiro.y, 'giro 0 no cambia nada (y)');
})();
// Un cuarto de vuelta lleva el eje X del mapa al eje Y del mapa: lo que estaba
// a la derecha del núcleo pasa a estar delante, y se proyecta más abajo.
(function () {
  var v = { ancho: 800, alto: 600, escala: 2, grados: 75, perspectiva: 1400, giro: 90 };
  var p = G.proyectarInclinado(500, 300, 0, v);     // 100 px a la derecha del eje
  var q = G.proyectarInclinado(400, 400, 0, VISTA); // 100 px por delante, sin giro
  cerca(p.x, q.x, 'un cuarto de vuelta lleva la derecha al frente (x)');
  cerca(p.y, q.y, 'un cuarto de vuelta lleva la derecha al frente (y)');
})();
// El giro NO cambia la altura de un objeto sobre el plano.
(function () {
  var alto = G.proyectarInclinado(400, 300, 60, GIRADA).y;
  var suelo = G.proyectarInclinado(400, 300, 0, GIRADA).y;
  if (alto < suelo) { console.log('  ok   la altura sigue levantando con el disco girado'); }
  else { console.log('  FALLA la altura sigue levantando con el disco girado'); fallos++; }
})();

console.log('huellaInclinada (caja envolvente de la imagen abatida):');
eqRect_wh(G.huellaInclinada({ left: 200, top: 150, width: 400, height: 300 }, PLANA), 800, 600, 'sin inclinar -> rectángulo por la escala');
(function () {
  var h = G.huellaInclinada({ left: 200, top: 150, width: 400, height: 300 }, VISTA);
  if (h.h < 600 && h.w > 800) { console.log('  ok   inclinada: se achata en alto y se ensancha en ancho'); }
  else { fallos++; console.log('  FALLA inclinada: se achata en alto y se ensancha: ' + JSON.stringify(h)); }
})();

console.log('tapadoPorDisco (objeto por debajo del plano: ¿lo come la foto?):');
(function () {
  // Visor de 800x600, disco de radio 200 px centrado en (400, 300).
  var V = { ancho: 800, alto: 600, escala: 1, grados: 45, perspectiva: 1400 };
  var R = 200;
  function bool(a, b, et) { eq(a, b, et); }
  bool(G.tapadoPorDisco(400, 300, -10, R, V), true, 'justo bajo el núcleo: tapado');
  // A 45° el punto de cruce sube |z|·tan(45) = |z| px hacia el fondo. Un objeto
  // en el borde de arriba que se hunde 400 px cruza el plano fuera del disco.
  bool(G.tapadoPorDisco(400, 150, -400, R, V), false, 'muy hundido: asoma por detrás del borde');
  bool(G.tapadoPorDisco(400, 150, -20, R, V), true, 'poco hundido: sigue detrás de la foto');
  bool(G.tapadoPorDisco(400, 300, 400, R, V), false, 'por encima del plano: nunca tapado');
  bool(G.tapadoPorDisco(400, 300, -400, R, { ancho: 800, alto: 600, escala: 1, grados: 0 }),
    false, 'sin abatir no hay nada detrás de la foto');
  bool(G.tapadoPorDisco(700, 300, -10, R, V), false, 'fuera del disco: no hay foto que lo tape');
  // El disco es un círculo: girarlo en su plano no cambia a quién tapa.
  var VG = { ancho: 800, alto: 600, escala: 1, grados: 45, perspectiva: 1400, giro: 90 };
  bool(G.tapadoPorDisco(400, 300, -10, R, VG), true, 'con giro en plano, el núcleo sigue tapado');
  bool(G.tapadoPorDisco(250, 300, -400, R, VG), false, 'con giro 90° el hundimiento sale por el lado');
})();

if (fallos) { console.log('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nTodo verde.');
