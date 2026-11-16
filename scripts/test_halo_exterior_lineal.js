#!/usr/bin/env node
/* #536 · El halo de los globulares no se pinta por encima de su nivel lineal.

   Ancla física, no la ley vieja: el nivel lineal de un píxel es el velo del
   cúmulo a ese radio, Im(r) = Σ(r)·S1campo(m_res, r), pasado por la curva de
   tono sin desvanecido ni realce:

     DN_lin(r) = nivelFondo + valorDeFlujo(Im(r), FcieloPintado, rango)

   El desvanecido por umbral (s_halo ≤ 1) solo puede QUITAR luz. Así que, donde
   0 < s_halo < 1 (el halo que roza el umbral de contraste), ningún píxel puede
   salir de pintarFot por encima de DN_lin. Eso es lo que rompía la gamma con
   t = s_halo antes de #535: 15,7 DN a 6′ en M13 con 200 mm a 100× frente a
   7,8 lineales (simulador_ocular/docs/notas/brillo-halo-globulares-justificacion.md §2).

   Qué se mide: la salida de pintarFot, el código real (realce con la t que
   escribió pintarCumulo en difusoMask, curva de tono y clamp), con un
   ImageData de Float64 para no redondear a 8 bits. Radio, Im y s_halo de cada
   píxel salen de la misma geometría y la misma tabla que usa pintarCumulo.

   Fuera de la medida: adaptacionLocal. Desenfoca con el filtro nativo del
   canvas, que node no tiene; el `document` falso de abajo hace del desenfoque
   la identidad y la deja en no-op. Es una capa del ojo (realce de detalle
   sobre el entorno), no del halo, y la nota tampoco la mide (§1.4).

   Margen: MARGEN_DN (abajo), para el redondeo Float32 del campo. Medido: 0,000. 0,05 es
   una veinteava de nivel de pantalla de 8 bits: invisible.

   Los radios 5′, 6′, 8′, 12′ y 17′ (criterio del ticket) son COBERTURA, no
   filtro: se aserta sobre todos los píxeles con s_halo < 1 y se imprime cada
   radio para ver dónde cae el halo de cada caso.

   node scripts/test_halo_exterior_lineal.js */
'use strict';

global.window = {};
// Lienzo mínimo para `desenfocar`: drawImage copia sin filtro, así que el
// desenfoque es la identidad y adaptacionLocal no cambia nada (ver cabecera).
global.document = { createElement: function () {
  var el = { px: null };
  el.getContext = function () {
    return {
      createImageData: function (w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
      putImageData: function (d) { el.px = d.data; },
      drawImage: function (src) { el.px = src.px; },
      getImageData: function () { return { data: el.px }; }
    };
  };
  return el;
} };
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/lf-globulares-datos.js');
require('../simulador_ocular/resources/js/globulares-datos.js');
require('../resources/js/bitacora-cumulos.js');
var R = global.window.BitacoraGaiaRender;
var CATALOGO = global.window.BITACORA_GLOBULARES;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) console.log('  ok   ' + etiqueta);
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

function delCatalogo(id) {
  var e = CATALOGO.filter(function (f) { return f[0] === id; })[0];
  if (!e) throw new Error('no está en el catálogo: ' + id);
  return { id: e[0], ra: e[2], dec: e[3], rc: e[4], rh: e[5], c: e[6], muV0: e[7],
           Vt: e[8], dkpc: e[9], ebv: e[10], feh: e[11], elip: e[12], pa: null, trager: e[13] || null };
}

var MARGEN_DN = 0.05;
var RADIOS = [5, 6, 8, 12, 17];          // arcmin
var CAMPO = 40;                          // arcmin: cubre 17′ de radio con margen
var SIZE = 480;                          // 5″/px; el invariante no depende de la resolución

// Misma interpolación que interpTabla en el render (no exportada).
function interp(tabla, v, rAs) {
  if (!(rAs >= 0) || rAs >= tabla.r[tabla.r.length - 1]) return 0;
  var u = rAs / tabla.paso, i = Math.floor(u), t = u - i;
  return v[i] * (1 - t) + v[i + 1] * t;
}

function caso(id, D, MAG, sqm) {
  var cum = delCatalogo(id);
  // Un cielo nuevo por render: la máscara difusa vive en él y no se limpia.
  var cielo = { pupilaSalida: D / MAG, pupilaOjo: 7, sqm: sqm, transmision: 0.9,
                aumentos: MAG, perceptual: true };
  var difuso = new Float32Array(SIZE * SIZE);
  var res = R.pintarCumulo(difuso, cum, {
    ra0: cum.ra, dec0: cum.dec, arcmin: CAMPO, size: SIZE,
    cielo: cielo, apertura: D, estrellas: []
  });
  var im = null;
  var ctx = {
    canvas: { width: SIZE, height: SIZE },
    createImageData: function (w, h) { return { width: w, height: h, data: new Float64Array(w * h * 4) }; },
    putImageData: function (d) { im = d; }
  };
  R.pintarFot(difuso, ctx, cielo);

  var c = R.ctxFotometrico(cielo);
  var tabla = res.tabla, pob = res.poblacion;
  var asPorPx = CAMPO * 60 / SIZE, cx = SIZE / 2, cy = SIZE / 2;
  var peor = -Infinity, peorR = 0, nHalo = 0, sGranoMax = 0;
  var porRadio = RADIOS.map(function () { return { n: 0, lin: 0, pint: 0, s: 0 }; });
  for (var y = 0; y < SIZE; y++) {
    var norte = -(y - cy) * asPorPx;
    for (var x = 0; x < SIZE; x++) {
      var este = -(x - cx) * asPorPx;
      var rAs = pob.radioPropio(este, norte);
      if (rAs >= pob.rtAs) continue;
      var sH = interp(tabla, tabla.sHalo, rAs);
      if (!(sH < 1)) continue;
      var Im = interp(tabla, tabla.I, rAs);
      var lin = c.nivelFondo + R.valorDeFlujo(Im, c.FcieloPintado, c.rango);
      var pint = im.data[(y * SIZE + x) * 4];
      if (sH > 0 && difuso[y * SIZE + x] > 0) nHalo++;
      sGranoMax = Math.max(sGranoMax, interp(tabla, tabla.sGrano, rAs));
      if (pint - lin > peor) { peor = pint - lin; peorR = rAs / 60; }
      var rMin = Math.hypot(este, norte) / 60;
      RADIOS.forEach(function (R0, k) {
        if (Math.abs(rMin - R0) < asPorPx / 60) {
          var b = porRadio[k]; b.n++; b.lin += lin; b.pint += pint; b.s += sH;
        }
      });
    }
  }

  var nombre = id + ' ' + D + ' mm ' + MAG + '× SQM ' + sqm;
  console.log('\n' + nombre + ' (r_t ' + (pob.rtAs / 60).toFixed(1) + '′, fondo ' + c.nivelFondo.toFixed(1) + ' DN)');
  porRadio.forEach(function (b, k) {
    var n = b.n || 1;
    console.log('       ' + RADIOS[k] + '′: s_halo ' + (b.s / n).toFixed(2) + '  lineal ' + (b.lin / n).toFixed(2) +
      ' DN  pintado ' + (b.pint / n).toFixed(2) + ' DN  (' + b.n + ' px)');
  });
  ok(porRadio.every(function (b) { return b.n > 0; }) && 17 * 60 < pob.rtAs,
    'los radios ' + RADIOS.join(', ') + '′ caen dentro del lienzo y de r_t');
  ok(nHalo > 0, 'hay halo que roza el umbral: ' + nHalo + ' px pintados con 0 < s_halo < 1');
  ok(peor <= MARGEN_DN, 'ningún píxel con s_halo < 1 pasa de su nivel lineal: peor exceso ' +
    peor.toFixed(3) + ' DN a ' + peorR.toFixed(1) + '′ (margen ' + MARGEN_DN + '; s_grano máx ' + sGranoMax.toFixed(3) + ')');
}

console.log('#536 · el halo de los globulares entre 5′ y 17′ contra su nivel lineal');
caso('NGC 6205', 200, 100, 21.5);   // M13, el caso de la nota §2.1
caso('NGC 6205', 406, 50, 21.5);    // M13, nota §2.2
caso('NGC 7078', 200, 100, 21.5);   // M15
caso('NGC 5904', 406, 50, 21.5);    // M5

console.log(fallos ? '\n' + fallos + ' fallo(s)' : '\nTodo correcto');
process.exit(fallos ? 1 : 0);
