#!/usr/bin/env node
/* Tests de PS1.opacidadInternaEscena: la rampa de detección no vuelve a decidir
   dentro de la escena difusa que se está reproduciendo.

   Lo que fijan, sobre un parche sintético de brillo uniforme elegido para que
   la rampa esté a media altura (op = 0,4) en TODO el parche:

   · dentro de la escena, op = 1 — el píxel llega al lienzo con su flujo entero,
     bit a bit el mismo que se pinta sin óptica que simular;
   · fuera de la escena, la rampa de siempre — bit a bit lo que sale con la
     bandera apagada;
   · escena multicomponente: las DOS elipses quedan protegidas (la compañera no
     depende de quién apunta el parche);
   · el borde de la elipse es el de ps1FuenteEnEscena, el mismo que decide qué
     estrellas conserva el parche: dentro protege, fuera no;
   · sin escena (parche sin el campo, tests viejos) el render no cambia;
   · con la bandera apagada, el render es exactamente el de antes.

   Sin dependencias ni red:  node scripts/test_opacidad_escena.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;
var PS1 = R.ps1;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

/* ── Escena de prueba ────────────────────────────────────────────────────────
   Parche de 121 px y 2′ de lado (1″/px), afín sin giro y con centro entero: a
   1 px de lienzo por ″ la rejilla del lienzo cae exacta sobre la del parche y
   todo se puede exigir bit a bit. La afín lleva las dos direcciones, como la de
   ps1AfinParche: xe/xn/ye/yn (cielo→px) y ex/ey/nx/ny (px→cielo, la que usa
   ps1FuenteEnEscena). Sin `comps`: sin mezcla ni halo, el flujo del lienzo es
   el del parche y lo único que se mide aquí es la opacidad. */
var AN = 121;
var AFIN = { cx: 60, cy: 60, xe: -1, xn: 0, ye: 0, yn: 1,
             ex: -1, ey: 0, nx: 0, ny: 1 };
var CIELO = { pupilaSalida: 350 / 400, aumentos: 400, sqm: 21, pupilaOjo: 7,
              realceMax: PS1.realceMax };
var SIZE = 240;
function oNuevo(conCielo) {
  return { ra0: 180, dec0: 30, arcmin: SIZE / 60, size: SIZE,
           cielo: conCielo ? Object.assign({}, CIELO) : null, apertura: 0 };
}

/* Brillo uniforme a Δ = 1 mag sobre el umbral de contraste: la rampa deja
   op = (1/2.5)^1 = 0,4 en todo el parche. Ni apagado del todo (el test no
   mediría nada) ni saturado (op = 1 sin necesidad de escena). */
var cRef = R.ctxFotometrico(Object.assign({}, CIELO));
var UMBRAL = R.sbUmbralContraste(cRef);
var F0 = Math.pow(10, -(UMBRAL - 1) / 2.5);
ok(Math.abs(R.ps1Opacidad(-2.5 * Math.log10(F0), UMBRAL) - 0.4) < 1e-9,
   'el brillo de prueba deja la rampa a media altura (op = 0,4)');

/* Dos componentes difusos, como el parche de M51 (galaxia + compañera): sendas
   elipses de 8″ y 6″ de radio, separadas y lejos del borde. Coordenadas en px
   del parche, igual que las de ps1EscenaEnParche. */
var ESCENA = [
  { cx: 30, cy: 30, cos: 1, sin: 0, ba: 1, r25As: 8 },
  { cx: 90, cy: 92, cos: 1, sin: 0, ba: 1, r25As: 6 }
];

function parcheNuevo(escena) {
  var datos = new Float32Array(AN * AN).fill(F0);
  return { ra: 180, dec: 30, ladoArcmin: 2, ancho: AN, alto: AN, afin: AFIN,
           comps: [], pa: 0, escena: escena || null, datos: datos };
}
function pintar(escena, bandera, conCielo) {
  var previo = PS1.opacidadInternaEscena;
  PS1.opacidadInternaEscena = bandera;
  var difuso = new Float32Array(SIZE * SIZE);
  R.ps1PintarParche(difuso, parcheNuevo(escena), oNuevo(conCielo !== false));
  PS1.opacidadInternaEscena = previo;
  return difuso;
}
/* Del píxel del parche al del lienzo, invirtiendo la afín del bucle de
   ps1PintarParche: con 1″/px en las dos rejillas, fx = x − 60 y fy = 180 − y. */
function enLienzo(px, py) {
  return (180 - py) * SIZE + (px + 60);
}

/* Apagada en producción: forzar op = 1 en toda la elipse μ=25 pintaba el fondo
   sub-umbral de dentro como una envolvente alrededor de la galaxia (380 160 px
   en M101 a 190×). Lo de abajo sigue midiendo la regla con la bandera puesta a
   mano, porque la protección contra el oscurecimiento sigue haciendo falta y
   este es el banco donde se probará su sustituta. */
ok(PS1.opacidadInternaEscena === false, 'la bandera está apagada por defecto');

var conOp = pintar(ESCENA, true);
var sinEscena = pintar(ESCENA, false);          // rampa en todo el parche
var sinOpacidad = pintar(ESCENA, true, false);  // sin óptica: flujo tal cual

/* ── Dentro de la escena: op = 1 ────────────────────────────────────────────*/
var centros = [[30, 30], [90, 92]];
for (var i = 0; i < centros.length; i++) {
  var k = enLienzo(centros[i][0], centros[i][1]);
  ok(conOp[k] === sinOpacidad[k],
     'componente ' + (i + 1) + ': dentro de la escena el flujo llega entero (op = 1)');
  ok(sinEscena[k] < conOp[k],
     'componente ' + (i + 1) + ': sin la regla la rampa lo apagaba (' +
     sinEscena[k].toExponential(3) + ' < ' + conOp[k].toExponential(3) + ')');
}
/* Y lo que quitaba era exactamente la rampa, no otra cosa: op = 0,4 aplicado
   como lo aplica producción (mezcla sobre el NIVEL, no sobre el flujo). */
ok(sinEscena[enLienzo(30, 30)] === Math.fround(R.ps1FlujoConOpacidad(F0, 0.4, cRef)),
   'lo que la rampa quitaba dentro de la escena era justo su op = 0,4');

/* ── Fuera de la escena: rampa normal ──────────────────────────────────────*/
var fuera = [[10, 10], [60, 60], [110, 20], [30, 45], [90, 78]];
var todosIguales = true, todosApagados = true;
for (var j = 0; j < fuera.length; j++) {
  var kf = enLienzo(fuera[j][0], fuera[j][1]);
  if (conOp[kf] !== sinEscena[kf]) todosIguales = false;
  if (!(conOp[kf] < sinOpacidad[kf])) todosApagados = false;
}
ok(todosIguales, 'fuera de la escena el resultado es bit a bit el de la rampa de siempre');
ok(todosApagados, 'fuera de la escena la rampa sigue desvaneciendo');

/* El borde manda: 1 px dentro del radio protege, 1 px fuera no. Se compara con
   el veredicto de ps1FuenteEnEscena, que es quien decide también las estrellas. */
ok(R.ps1FuenteEnEscena(ESCENA, AFIN, 37, 30) === true, 'a 7″ del centro: dentro de la escena');
ok(R.ps1FuenteEnEscena(ESCENA, AFIN, 39, 30) === false, 'a 9″ del centro: fuera de la escena');
ok(conOp[enLienzo(37, 30)] === sinOpacidad[enLienzo(37, 30)], 'el borde protege por dentro');
ok(conOp[enLienzo(39, 30)] === sinEscena[enLienzo(39, 30)], 'el borde no protege por fuera');

/* Ninguna de las dos elipses cubre a la otra: la protección es por componente,
   no un radio único alrededor del objeto apuntado. */
ok(R.ps1FuenteEnEscena([ESCENA[0]], AFIN, 90, 92) === false,
   'la elipse del primer componente no alcanza al segundo');
ok(R.ps1FuenteEnEscena([ESCENA[1]], AFIN, 30, 30) === false,
   'la elipse del segundo componente no alcanza al primero');

/* ── Un parche sin escena no cambia de comportamiento ──────────────────────*/
var sinCampo = pintar(null, true), sinCampoOff = pintar(null, false);
var iguales = 0;
for (var m = 0; m < sinCampo.length; m++) if (sinCampo[m] === sinCampoOff[m]) iguales++;
ok(iguales === sinCampo.length, 'sin escena en el parche, la bandera no cambia nada');

/* ── Bandera apagada: el render de antes, píxel a píxel ───────────────────*/
var reversible = 0;
for (var q = 0; q < sinEscena.length; q++) if (sinEscena[q] === sinCampoOff[q]) reversible++;
ok(reversible === sinEscena.length, 'apagada, la escena no interviene: el render es el de antes');

console.log(fallos ? '\n' + fallos + ' FALLOS' : '\nsin fallos');
process.exit(fallos ? 1 : 0);
