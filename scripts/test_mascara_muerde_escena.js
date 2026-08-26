#!/usr/bin/env node
/* Máscara ancha que muerde la escena => el perfil rellena (caso Abell 12 bajo
   μ Orionis): ps1MascaraMuerdeEscena, la cláusula `mordida` de ps1HaloActivo y
   el relleno (1−w)·perfil de ps1PintarParche cuando la imagen quedó al cielo.

   Sin la mordida, una PN compacta (muProm brillante: puerta del halo cerrada)
   cuyo parche borró una máscara de 60″ pintaba flujo 0: disco negro. */
'use strict';

var path = require('path');
global.window = {};
require(path.join(__dirname, '..', 'resources', 'js', 'bitacora-gaia-render.js'));
var R = global.window.BitacoraGaiaRender, PS1 = R.ps1;

var fallos = 0;
function ok(c, msg) { if (!c) { fallos++; console.error('FALLO: ' + msg); } }

/* Afín sintética 1″/px, este hacia −x (como el fallback de producción). */
var A = { cx: 50, cy: 50, xe: -1, xn: 0, ye: 0, yn: 1, ex: -1, ey: 0, nx: 0, ny: 1 };
var ESC = [{ cx: 50, cy: 50, cos: 1, sin: 0, ba: 1, r25As: 19, compacta: true }];
var GALAXIA = [{ cx: 50, cy: 50, cos: 1, sin: 0, ba: 1, r25As: 19, compacta: false }];
var ancha = PS1.rellenoPlanoMaxAs + 20, estrecha = PS1.rellenoPlanoMaxAs - 10;

ok(R.ps1MascaraMuerdeEscena([{ x: 97, y: 50, rAs: ancha, rPx: ancha }], A, ESC) === true,
  'máscara ancha a 47″ de una escena de 19″ la muerde (47 ≤ 19 + ' + ancha + ')');
ok(R.ps1MascaraMuerdeEscena([{ x: 50, y: 250, rAs: ancha, rPx: ancha }], A, ESC) === false,
  'la misma máscara a 200″ no la toca');
ok(R.ps1MascaraMuerdeEscena([{ x: 97, y: 50, rAs: estrecha, rPx: estrecha }], A, ESC) === false,
  'una máscara estrecha no cuenta: su relleno por isofotas no borra la escena');
ok(R.ps1MascaraMuerdeEscena([{ x: 55, y: 50, rAs: ancha, rPx: ancha }], A, ESC) === false,
  'una fuente DENTRO de la escena se conserva entera: no muerde nada');
ok(R.ps1MascaraMuerdeEscena([], A, ESC) === false && R.ps1MascaraMuerdeEscena([{ x: 97, y: 50, rAs: ancha, rPx: ancha }], A, []) === false,
  'sin estrellas o sin escena, false');
ok(R.ps1MascaraMuerdeEscena([{ x: 97, y: 50, rAs: ancha, rPx: ancha }], A, GALAXIA) === false,
  'una isofota de GALAXIA no cuenta: sus reglas de fusión están cerradas (solo borde real)');

/* La puerta del halo: las medidas de Abell 12 (compacta, muProm 21,7) la tienen
   cerrada; la mordida la abre, y respeta el interruptor maestro. */
var medidas = { aArcmin: 1.3, bArcmin: 1.3, n: 0, muProm: 21.7 };
ok(R.ps1HaloActivo(medidas) === false, 'sin mordida, una compacta brillante no abre el halo');
medidas.mordida = true;
ok(R.ps1HaloActivo(medidas) === true, 'con mordida, el halo es obligatorio');
var interruptor = PS1.haloExtrapolado;
PS1.haloExtrapolado = false;
ok(R.ps1HaloActivo(medidas) === true,
  'la mordida manda incluso con el halo voluntario apagado: es relleno de ausencia, no extensión');
delete medidas.mordida;
ok(R.ps1HaloActivo(medidas) === false, 'sin mordida el interruptor maestro sigue mandando');
medidas.mordida = true;
PS1.haloExtrapolado = interruptor;

/* Integración: parche cuyo único dato quedó al cielo (datos 0, peso 0). Con
   mordida el perfil rellena y el objeto existe; sin ella, negro. */
function parcheSintetico(mordida) {
  var N = 64;
  return {
    ra: 90, dec: 9, ladoArcmin: N / 60,          // 1″/px
    ancho: N, alto: N, afin: null,
    comps: [{ Ie: 1e-2, re: 10, n: 1, b: 1.6783460709386637, q: 1, rMax: 60 }],
    pa: 0, halo: { aArcmin: 1.3, bArcmin: 1.3, n: 0, muProm: 21.7, mordida: mordida },
    thetaIntArcmin: 0.62,
    peso: new Float32Array(N * N), escalaMezcla: 1, perfil: null,
    enEscena: [], escena: [], datos: new Float32Array(N * N)
  };
}
function pintar(mordida) {
  var SIZE = 64;
  var difuso = new Float32Array(SIZE * SIZE);
  var cielo = { pupilaSalida: 3.4, pupilaOjo: 7, sqm: 21.4, aumentos: 150,
                realceMax: PS1.realceMax, perceptual: true };
  R.ps1PintarParche(difuso, parcheSintetico(mordida), {
    ra0: 90, dec0: 9, arcmin: 4, size: SIZE, cielo: cielo, apertura: 500
  });
  var s = 0;
  for (var i = 0; i < difuso.length; i++) s += difuso[i];
  return s;
}
ok(pintar(true) > 0, 'con mordida, (1−w)·perfil rellena lo borrado: hay flujo');
ok(pintar(false) === 0, 'sin mordida (estado antiguo), el mismo parche pinta 0: el disco negro');

/* Disco ANCHO que pisa una compacta: sus píxeles quedan en NaN (ausencia), no
   al cielo — el cielo es un 0 falso que mantiene w alto en el borde y deja el
   anillo oscuro (w·0 + (1−w)·perfil). Fuera de la compacta, cielo como siempre;
   sobre una isofota de galaxia, también cielo (arquitectura medida, cerrada). */
function quitar(escena) {
  var W = 120, datos = new Float32Array(W * W).fill(100);
  var e = [{ x: 97, y: 50, rPx: 60, rAs: ancha }];
  return { W: W, out: R.ps1QuitarEstrellas(datos, W, W, e, { afin: A, ba: 1, pa: 0, escena: escena }) };
}
var q = quitar(ESC);
ok(q.out[50 * q.W + 50] !== q.out[50 * q.W + 50],
  'píxel de la compacta bajo el disco ancho: NaN (ausencia)');
ok(q.out[110 * q.W + 97] !== q.out[110 * q.W + 97] && q.out[10 * q.W + 10] !== q.out[10 * q.W + 10],
  'toda la escena pisada: la imagen ENTERA es ausencia — el anclaje no puede dar la luz del objeto al ala de la estrella');
/* Con un componente NO pisado (galaxia vecina), la imagen se conserva y solo
   cae la elipse de la compacta pisada. */
var MIXTA = ESC.concat([{ cx: 20, cy: 100, cos: 1, sin: 0, ba: 1, r25As: 15, compacta: false }]);
var qm = quitar(MIXTA);
ok(qm.out[50 * qm.W + 50] !== qm.out[50 * qm.W + 50],
  'mixta: la elipse de la compacta pisada es NaN');
ok(qm.out[50 * qm.W + 35] !== qm.out[50 * qm.W + 35],
  'mixta: también fuera de la máscara, dentro de la elipse — sin remiendos');
ok(isFinite(qm.out[110 * qm.W + 97]),
  'mixta: el disco ancho fuera de la compacta, al cielo como siempre');
ok(isFinite(qm.out[10 * qm.W + 10]) && qm.out[10 * qm.W + 10] === 100,
  'mixta: píxel sin enmascarar, intacto');
var qg = quitar(GALAXIA);
ok(isFinite(qg.out[50 * qg.W + 50]),
  'sobre una isofota de GALAXIA el disco ancho sigue al cielo: sin NaN nuevos');

if (fallos) { console.error(fallos + ' fallo(s).'); process.exit(1); }
console.log('todo en orden.');
