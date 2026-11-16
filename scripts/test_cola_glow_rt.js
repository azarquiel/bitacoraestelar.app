#!/usr/bin/env node
/* #570 · La cola del glow del CAMPO no se corta dentro de r_t.

   Fuera de r_t, las filas de catálogo con mlim < m <= mlim + colaGlow se pintan
   como glow tenue (planEstrellas). Dentro, estrellasCumulo las cortaba con
   `m > mRes`, porque suponía que toda fila de catálogo era miembro y su luz ya
   estaba en S1campo. El resultado era un disco oscuro del tamaño de r_t (M62
   con 457 mm a 61×: 0 % de la cola dentro, 100 % fuera).

   Lo que se comprueba, por la salida pública pintarCumulo(...).estrellas:
     1. Filas de catálogo con m > mlim en el halo (6′–11′, sin aglomeración que
        valga): sobreviven como fuera de r_t, donde sobrevive el 100 %.
     2. En el núcleo (r < 1′) esas filas siguen pasando el sorteo aCrowd: menos
        supervivencia que en el halo. Son en parte MIEMBROS que S1campo ya
        cuenta: el doble conteo es el riesgo asumido en #570.
     3. Las sintéticas no ganan nada: ninguna sale con m > mlim.

   node scripts/test_cola_glow_rt.js */
'use strict';

global.window = {};
global.document = undefined;
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/lf-globulares-datos.js');
require('../simulador_ocular/resources/js/globulares-datos.js');
require('../resources/js/bitacora-cumulos.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) console.log('  ok   ' + etiqueta);
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

var e = global.window.BITACORA_GLOBULARES.filter(function (f) { return f[0] === 'NGC 6266'; })[0];
var M62 = { id: e[0], ra: e[2], dec: e[3], rc: e[4], rh: e[5], c: e[6], muV0: e[7], Vt: e[8], dkpc: e[9],
  ebv: e[10], feh: e[11], elip: e[12], pa: null, trager: e[13] || null };
var D = 457, MAG = 61, SQM = 21.5, ARC = 40, SIZE = 240;
var cielo = { pupilaSalida: D / MAG, pupilaOjo: 7, sqm: SQM, transmision: 0.9, aumentos: MAG, perceptual: true };
var mlim = R.magLimite({ apertura: D, aumentos: MAG, transmision: 0.9, sqm: SQM, pupilaOjo: 7 });
var rt = M62.rc * Math.pow(10, M62.c);   // 11,3′
var cos0 = Math.cos(M62.dec * Math.PI / 180);

/* Filas de catálogo en anillos de radio conocido, todas en la cola del glow
   (mlim, mlim + 2]. Deterministas: ángulo y magnitud por índice. */
function anillo(r0, r1, n) {
  var filas = [];
  for (var k = 0; k < n; k++) {
    var r = r0 + (r1 - r0) * ((k * 0.618034) % 1), ang = k * 2.39996;
    filas.push([M62.ra + r / 60 * Math.cos(ang) / cos0, M62.dec + r / 60 * Math.sin(ang),
      mlim + 0.05 + 1.9 * ((k * 0.414214) % 1), 0.8]);
  }
  return filas;
}
var nucleo = anillo(0.1, 1, 400), halo = anillo(6, 11, 400), fuera = anillo(12, 18, 400);
var catalogo = nucleo.concat(halo, fuera);

var cum = R.pintarCumulo(new Float32Array(SIZE * SIZE), M62, {
  ra0: M62.ra, dec0: M62.dec, arcmin: ARC, size: SIZE, cielo: cielo, apertura: D,
  estrellas: catalogo, mlim: mlim
});
var salen = new Set(cum.estrellas);
function fraccion(filas) {
  return filas.filter(function (f) { return salen.has(f); }).length / filas.length;
}
var fNucleo = fraccion(nucleo), fHalo = fraccion(halo), fFuera = fraccion(fuera);
console.log('M62 457 mm 61×: mlim ' + mlim.toFixed(2) + ', r_t ' + rt.toFixed(1) + '′');
console.log('  cola sobrevive: núcleo ' + (fNucleo * 100).toFixed(1) + ' %, halo ' +
  (fHalo * 100).toFixed(1) + ' %, fuera ' + (fFuera * 100).toFixed(1) + ' %');

ok(fFuera === 1, 'fuera de r_t sobrevive toda la cola (referencia)');
ok(fHalo >= 0.95, 'halo 6′–11′: la cola del campo sobrevive como fuera (sin disco oscuro)');
ok(fNucleo < fHalo, 'núcleo: la cola sigue pasando por el sorteo aCrowd');

var sinteticasDebiles = cum.estrellas.filter(function (f) {
  return catalogo.indexOf(f) < 0 && f[2] > mlim;
}).length;
ok(sinteticasDebiles === 0, 'ninguna sintética sale con m > mlim (' + sinteticasDebiles + ')');

if (fallos) { console.error(fallos + ' fallos'); process.exit(1); }
console.log('test_cola_glow_rt: todo ok');
