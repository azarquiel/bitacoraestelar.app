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
require(path.join(__dirname, '..', 'resources', 'js', 'bitacora-ps1.js'));
var R = global.window.BitacoraGaiaRender, PS1 = window.BitacoraPS1.cfg;

var fallos = 0;
function ok(c, msg) { if (!c) { fallos++; console.error('FALLO: ' + msg); } }

/* Afín sintética 1″/px, este hacia −x (como el fallback de producción). */
var A = { cx: 50, cy: 50, xe: -1, xn: 0, ye: 0, yn: 1, ex: -1, ey: 0, nx: 0, ny: 1 };
var ESC = [{ cx: 50, cy: 50, cos: 1, sin: 0, ba: 1, r25As: 19, compacta: true }];
var GALAXIA = [{ cx: 50, cy: 50, cos: 1, sin: 0, ba: 1, r25As: 19, compacta: false }];
var ancha = PS1.rellenoPlanoMaxAs + 20, estrecha = PS1.rellenoPlanoMaxAs - 10;

ok(window.BitacoraPS1.ps1MascaraMuerdeEscena([{ x: 97, y: 50, rAs: ancha, rPx: ancha }], A, ESC) === true,
  'máscara ancha a 47″ de una escena de 19″ la muerde (47 ≤ 19 + ' + ancha + ')');
ok(window.BitacoraPS1.ps1MascaraMuerdeEscena([{ x: 50, y: 250, rAs: ancha, rPx: ancha }], A, ESC) === false,
  'la misma máscara a 200″ no la toca');
ok(window.BitacoraPS1.ps1MascaraMuerdeEscena([{ x: 97, y: 50, rAs: estrecha, rPx: estrecha }], A, ESC) === false,
  'una máscara estrecha no cuenta: su relleno por isofotas no borra la escena');
ok(window.BitacoraPS1.ps1MascaraMuerdeEscena([{ x: 55, y: 50, rAs: ancha, rPx: ancha }], A, ESC) === false,
  'una fuente DENTRO de la escena se conserva entera: no muerde nada');
ok(window.BitacoraPS1.ps1MascaraMuerdeEscena([], A, ESC) === false && window.BitacoraPS1.ps1MascaraMuerdeEscena([{ x: 97, y: 50, rAs: ancha, rPx: ancha }], A, []) === false,
  'sin estrellas o sin escena, false');
ok(window.BitacoraPS1.ps1MascaraMuerdeEscena([{ x: 97, y: 50, rAs: ancha, rPx: ancha }], A, GALAXIA) === false,
  'una isofota de GALAXIA no cuenta: sus reglas de fusión están cerradas (solo borde real)');

/* La puerta del halo: las medidas de Abell 12 (compacta, muProm 21,7) la tienen
   cerrada; la mordida la abre, y respeta el interruptor maestro. */
var medidas = { aArcmin: 1.3, bArcmin: 1.3, n: 0, muProm: 21.7 };
ok(window.BitacoraPS1.ps1HaloActivo(medidas) === false, 'sin mordida, una compacta brillante no abre el halo');
medidas.mordida = true;
ok(window.BitacoraPS1.ps1HaloActivo(medidas) === true, 'con mordida, el halo es obligatorio');
var interruptor = PS1.haloExtrapolado;
PS1.haloExtrapolado = false;
ok(window.BitacoraPS1.ps1HaloActivo(medidas) === true,
  'la mordida manda incluso con el halo voluntario apagado: es relleno de ausencia, no extensión');
delete medidas.mordida;
ok(window.BitacoraPS1.ps1HaloActivo(medidas) === false, 'sin mordida el interruptor maestro sigue mandando');
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
  window.BitacoraPS1.ps1PintarParche(difuso, parcheSintetico(mordida), {
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
  return { W: W, out: window.BitacoraPS1.ps1QuitarEstrellas(datos, W, W, e, { afin: A, ba: 1, pa: 0, escena: escena }) };
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

/* La mordida se mide, no se toca: ps1CoberturaMordida contra el área de la lente
   circular exacta. El veredicto es un umbral lejos de los extremos, así que basta
   con que la rejilla acierte al 1 %. */
function lenteCircular(d, R, r) {
  if (d + r <= R) return 1;
  if (d >= R + r) return 0;
  var ca = Math.max(-1, Math.min(1, (d * d + r * r - R * R) / (2 * d * r)));
  var cb = Math.max(-1, Math.min(1, (d * d + R * R - r * r) / (2 * d * R)));
  var al = Math.acos(ca), be = Math.acos(cb);
  var area = r * r * (al - Math.sin(al) * Math.cos(al)) + R * R * (be - Math.sin(be) * Math.cos(be));
  return area / (Math.PI * r * r);
}
[47, 55, 62, 70, 79].forEach(function (d) {
  var medida = window.BitacoraPS1.ps1CoberturaMordida([{ x: 50 + d, y: 50, rAs: 60, rPx: 60 }], A, ESC)[0];
  ok(Math.abs(medida - lenteCircular(d, 60, 19)) < 0.01,
    'cobertura medida a ' + d + '″ (' + medida.toFixed(3) + ') = lente exacta (' + lenteCircular(d, 60, 19).toFixed(3) + ')');
});
ok(window.BitacoraPS1.ps1CoberturaMordida([{ x: 97, y: 50, rAs: estrecha, rPx: estrecha }], A, ESC)[0] === 0,
  'una máscara estrecha no cubre nada: su relleno por isofotas no borra el objeto');
ok(window.BitacoraPS1.ps1CoberturaMordida([{ x: 97, y: 50, rAs: ancha, rPx: ancha }], A, GALAXIA)[0] === 0,
  'una isofota de GALAXIA no se mide: sus reglas de fusión están cerradas');

/* Roce, no mordida (caso NGC 7008: 43,6 % de la elipse bajo el disco). El radio
   de máscara está anclado al fondo del stack, no al brillo del objeto, así que
   ahí la imagen sigue mandando: el disco ancho se recorta en el borde real y NO
   se pierde el parche. Nada de NaN, y ni un píxel del objeto tocado. */
var ROCE = [{ x: 112, y: 50, rPx: 60, rAs: ancha }];       // 62″ del centro → 0,40
ok(window.BitacoraPS1.ps1CoberturaMordida(ROCE, A, ESC)[0] < PS1.mordidaCobMin,
  'a 62″ el disco tapa el 40 % de la elipse: por debajo del umbral');
ok(window.BitacoraPS1.ps1MascaraMuerdeEscena(ROCE, A, ESC) === false,
  'un roce no fuerza el perfil: no hay ausencia que rellenar');
var W2 = 120, datos2 = new Float32Array(W2 * W2).fill(100);
var qr = window.BitacoraPS1.ps1QuitarEstrellas(datos2, W2, W2, ROCE, { afin: A, ba: 1, pa: 0, escena: ESC });
ok(qr[50 * W2 + 50] === 100 && qr[50 * W2 + 66] === 100,
  'el objeto conserva sus píxeles reales, también los que caían bajo el disco');
var hayNaN = false;
for (var iN = 0; iN < qr.length; iN++) if (qr[iN] !== qr[iN]) { hayNaN = true; break; }
ok(!hayNaN, 'roce: ni un NaN en el parche — la imagen entera se conserva');
ok(qr[50 * W2 + 112] === 100,
  'fuera del objeto el disco ancho sigue yendo al cielo (aquí el cielo es 100)');
/* Y el recorte es solo para discos ANCHOS: uno estrecho sobre el objeto se sigue
   quitando y rellenando por isofotas, que es como se cosen las estrellas de campo. */
var ESTRECHA = [{ x: 75, y: 50, rPx: 30, rAs: estrecha }];   // fuera de la elipse (25″), su disco sí entra en ella
var datos3 = new Float32Array(W2 * W2).fill(100);
datos3[50 * W2 + 66] = 9999;
var qe = window.BitacoraPS1.ps1QuitarEstrellas(datos3, W2, W2, ESTRECHA, { afin: A, ba: 1, pa: 0, escena: ESC });
ok(qe[50 * W2 + 66] === 100,
  'una máscara estrecha dentro del objeto se sigue quitando: el recorte es solo para discos anchos');

if (fallos) { console.error(fallos + ' fallo(s).'); process.exit(1); }
console.log('todo en orden.');
