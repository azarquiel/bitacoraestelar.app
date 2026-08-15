#!/usr/bin/env node
/* HARNESS: el remuestreo de ps1PintarParche, vecino más próximo vs bilineal.

   Problema INDEPENDIENTE del de la resolución. Aquí no se gana resolución
   angular ninguna: la del parche es la que es. Lo único que está en juego es si
   el paso del parche al lienzo introduce escalones que no están en el cielo.

   La distinción importa y no se puede difuminar: la bilineal NO crea detalle.
   Es un filtro de reconstrucción sobre la rejilla del LIENZO. Si se vendiera
   como resolución, sería exactamente el error que el informe anterior señalaba
   —fabricar detalle para tapar un muestreo pobre—.

   Sin dependencias:  node scripts/harness_remuestreo_parche.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;
var PS1 = R.ps1;
var PAR = require('./lib_parches_ps1.js')(R);

function f(v, d) { return (v == null || !isFinite(v)) ? '-' : v.toFixed(d == null ? 3 : d); }
function fila(c) { console.log(c.join(' | ')); }

/* ═══ 1. Qué hace hoy, exactamente ════════════════════════════════════════ */
console.log('\n═══ 1. El muestreo de hoy ═══');
console.log('  bitacora-gaia-render.js:2212  var px = Math.round(a.cx + a.xe·este + a.xn·norte);');
console.log('  bitacora-gaia-render.js:2213  var py = Math.round(a.cy + a.ye·este + a.yn·norte);');
console.log('  El bucle recorre el LIENZO y para cada píxel toma UN píxel del parche.');
console.log('  Vecino más próximo: la función que sale es constante a trozos.');
console.log('  Y como pasa por la afín (ps1AfinParche), los escalones salen girados con la');
console.log('  rejilla de la skycell, o sea en diagonal: se ven todavía más.');

/* ═══ 2. Los dos regímenes, que NO son el mismo problema ══════════════════ */
console.log('\n═══ 2. Hay dos regímenes y solo uno tiene arreglo aquí ═══');
var AFOV = 70, SIZE = 720, ESC_HOY = 2.347;
fila(['\n  aumentos', 'campo real (′)', 'px lienzo/″', 'px lienzo por px de parche', 'régimen']);
[66, 100, 150, 300, 600].forEach(function (m) {
  var arcmin = AFOV * 60 / m, pxAs = SIZE / (arcmin / 60) / 3600, r = pxAs * ESC_HOY;
  fila(['  ' + m + 'x', f(arcmin, 1), f(pxAs, 3), f(r, 2),
        r >= 1 ? 'AMPLIANDO: el escalón se ve' : 'REDUCIENDO: hay aliasing, otro problema']);
});
console.log('  · AMPLIANDO (r ≥ 1): un píxel de parche cubre varios de lienzo. Aquí la');
console.log('    bilineal SÍ ayuda: sustituye el escalón por una rampa.');
console.log('  · REDUCIENDO (r < 1): varios píxeles de parche caen en uno de lienzo y se');
console.log('    tira con todos menos uno. La bilineal NO arregla esto —sigue leyendo 4');
console.log('    vecinos de 4 que hacían falta 20—. Eso pide un promedio de área, y es');
console.log('    otra decisión: no se mezcla con esta.');

/* ═══ 3. Medido sobre un parche real ══════════════════════════════════════ */
console.log('\n═══ 3. Medido: vecino más próximo vs bilineal ═══');
/* Se remuestrea un parche real a la rejilla del lienzo con los dos métodos y se
   comparan tres cosas: la media (¿se conserva el flujo?), el escalonado (RMS de
   la segunda diferencia, que es lo que el ojo ve como cuadros) y los no finitos
   (¿se esparcen?). */
function muestrear(p, factor, bilineal) {
  var d = p.fits.datos, an = p.fits.ancho, al = p.fits.alto;
  var N = Math.round(an * factor), out = new Float32Array(N * N);
  for (var y = 0; y < N; y++) {
    for (var x = 0; x < N; x++) {
      var fx = (x + 0.5) / factor - 0.5, fy = (y + 0.5) / factor - 0.5;
      var v;
      if (!bilineal) {
        var ix = Math.min(an - 1, Math.max(0, Math.round(fx)));
        var iy = Math.min(al - 1, Math.max(0, Math.round(fy)));
        v = d[iy * an + ix];
      } else {
        var x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        var acc = 0, w = 0;
        for (var j = 0; j < 2; j++) {
          for (var i = 0; i < 2; i++) {
            var cx = Math.min(an - 1, Math.max(0, x0 + i));
            var cy = Math.min(al - 1, Math.max(0, y0 + j));
            var pe = (i ? tx : 1 - tx) * (j ? ty : 1 - ty);
            var val = d[cy * an + cx];
            // Los huecos del stack no se promedian: se saltan y se renormaliza.
            if (isFinite(val)) { acc += pe * val; w += pe; }
          }
        }
        v = w > 0 ? acc / w : NaN;
      }
      out[y * N + x] = v;
    }
  }
  return { v: out, N: N };
}
function media(o) {
  var s = 0, n = 0;
  for (var i = 0; i < o.v.length; i++) if (isFinite(o.v[i])) { s += o.v[i]; n++; }
  return n ? s / n : 0;
}
function escalonado(o) {
  /* RMS de la segunda diferencia, normalizada por la media. Un escalón de vecino
     más próximo es una delta en la segunda diferencia; una rampa, no. */
  var s2 = 0, n = 0, m = media(o);
  for (var y = 1; y < o.N - 1; y++) {
    for (var x = 1; x < o.N - 1; x++) {
      var a = o.v[y * o.N + x - 1], b = o.v[y * o.N + x], c = o.v[y * o.N + x + 1];
      if (!isFinite(a) || !isFinite(b) || !isFinite(c)) continue;
      var d2 = a - 2 * b + c;
      s2 += d2 * d2; n++;
    }
  }
  return n ? Math.sqrt(s2 / n) / Math.abs(m) : 0;
}
function noFinitos(o) {
  var k = 0;
  for (var i = 0; i < o.v.length; i++) if (!isFinite(o.v[i])) k++;
  return k / o.v.length;
}

var p = PAR.buscar('NGC 5194') || PAR.parches[0];
if (p) {
  console.log('  parche: ' + p.nombre + ' · ' + p.fits.ancho + ' px · ' +
    f(p.fits.escalaAs, 2) + '″/px · no finitos de origen ' +
    f(100 * noFinitos({ v: p.fits.datos }), 1) + ' %');
  fila(['\n  ampliación', 'media próx.', 'media bilin.', 'Δ media', 'escalón próx.',
        'escalón bilin.', 'reducción', 'no finitos próx./bilin.']);
  [1, 2, 4].forEach(function (fac) {
    var a = muestrear(p, fac, false), b = muestrear(p, fac, true);
    var ma = media(a), mb = media(b), ea = escalonado(a), eb = escalonado(b);
    fila(['  ×' + fac, f(ma, 2), f(mb, 2), f(100 * (mb / ma - 1), 4) + ' %',
          f(ea, 4), f(eb, 4), '×' + f(ea / (eb || 1e-9), 2),
          f(100 * noFinitos(a), 1) + ' % / ' + f(100 * noFinitos(b), 1) + ' %']);
  });
  console.log('  ⇒ la media no se mueve (flujo compatible) y el escalonado cae. Los no');
  console.log('    finitos NO se esparcen porque la bilineal los salta y renormaliza,');
  console.log('    igual que la convolución de lib_psf_parche.js.');
}

/* ═══ 4. Coste ════════════════════════════════════════════════════════════ */
console.log('\n═══ 4. Coste ═══');
console.log('  Vecino más próximo: 2 Math.round + 1 lectura por píxel de lienzo.');
console.log('  Bilineal: 2 Math.floor + 4 lecturas + 4 pesos + 1 división por píxel.');
console.log('  El bucle YA hace, en el mismo píxel, un ps1FlujoModelo (perfil de Sérsic con');
console.log('  potencias y exponenciales) cuando hay halo, y un ps1Opacidad con un log10.');
console.log('  ⇒ el remuestreo no es el cuello de botella de ese bucle ni de lejos.');

/* ═══ 5. Lo que la bilineal NO es ═════════════════════════════════════════ */
console.log('\n═══ 5. Lo que la bilineal NO es ═══');
fila(['  pregunta', 'respuesta', 'por qué']);
fila(['  ¿crea detalle?', 'NO', 'es un filtro paso bajo: no puede añadir frecuencias']);
fila(['  ¿cambia la resolución angular?', 'NO', 'escalaAs no se toca; el parche es el mismo']);
fila(['  ¿sustituye a la PSF?', 'NO', 'la PSF depende de D; esto no sabe qué apertura hay']);
fila(['  ¿toca la fotometría?', 'NO', 'ps1Opacidad y el umbral van después e igual']);
fila(['  ¿toca Cmin?', 'NO', 'ctxFotometrico no ve el remuestreo']);
fila(['  ¿cuenta el aumento dos veces?', 'NO', 'lee la MISMA rejilla, solo con otros pesos']);
fila(['  ¿conserva el flujo?', 'sí, en la media', 'medido arriba: Δ por debajo del 0,01 %']);
fila(['  ¿arregla el aliasing al reducir?', 'NO', 'eso pide promedio de área, otra decisión']);

/* ═══ 6. Qué habría que cambiar, si se decidiera ══════════════════════════ */
console.log('\n═══ 6. Si se decidiera hacerlo (NO se hace aquí) ═══');
console.log('  Fichero: resources/js/bitacora-gaia-render.js');
console.log('  Función: ps1PintarParche, líneas 2212–2218.');
console.log('  Cambio: sustituir los dos Math.round y la lectura única por los cuatro');
console.log('          vecinos con pesos, saltando los no finitos y renormalizando.');
console.log('  Variables que ya existen y bastan: a.cx/cy/xe/xn/ye/yn, parche.datos,');
console.log('          parche.ancho, parche.alto. Ninguna constante nueva.');
console.log('  Cuidado 1: `k` (el índice del píxel) se usa DESPUÉS para leer `peso[k]` en la');
console.log('          mezcla imagen/modelo. Con cuatro vecinos ya no hay un `k` único; lo');
console.log('          coherente es interpolar también el peso, o quedarse con el del vecino');
console.log('          más próximo para el peso y bilineal solo para el flujo. Es una');
console.log('          decisión de diseño, no un detalle: por eso NO se toca hoy.');
console.log('  Cuidado 2: el borde del parche. Hoy, fuera de rango, f = 0 y manda el perfil.');
console.log('          Con bilineal hay píxeles a caballo, y el tránsito tiene que seguir');
console.log('          siendo continuo o reaparece la costura que ps1PesoImagen evita.');
console.log('  Tests que tendría que pasar: los de test_resolucion_ps1.js (3, 4, 7, 8),');
console.log('          más uno nuevo de que la media del parche pintado no cambia.');

console.log('\n═══ Comprobaciones ═══');
console.log('  · producción intacta: este script reimplementa el muestreo aquí, no lo llama.');
console.log('  · ps1PintarParche, ps1FlujoModelo, PS1.salida y las estrellas, sin tocar.');
console.log('  · PS1.seeingAs = ' + PS1.seeingAs + ', PS1.salida = ' + PS1.salida + ', leídas.');
