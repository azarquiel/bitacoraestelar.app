/* Remuestreo propio del parche nativo de PS1 a la resolución de la regla C (#370).

   Por qué existe: `fitscut` con `output_size` NO conserva el flujo —#366 midió
   un 10,1 % perdido en NGC 7293 de 1024 a 2048 px, 0,32–0,36 σ/px de peor
   caso (ADR 0024, «Corrección de la redacción de L2.3»)—. Pidiendo solo `size`
   el servicio devuelve el píxel nativo de 0,25″ sin tocar, y el paso a la
   regla C se hace aquí.

   Promedio por ÁREA: cada píxel grueso es la media de los nativos que cubre,
   cada uno pesado por la fracción de su área que cae dentro (los bordes de un
   factor no entero, 4800/2048 ≈ 2,34, entran a trozos). Eso conserva el brillo
   superficial y, multiplicado por el área del píxel, el flujo: la suma de pesos
   de cada nativo sobre toda la salida es exactamente 1.

   NaN (lo que ninguna skycell cubre, y los núcleos saturados): se promedian
   solo los finitos, con sus pesos, y el píxel grueso lleva dato solo si al
   menos LA MITAD de su área lo tiene; si no, sale NaN, la misma marca de
   «aquí no hay dato» que el resto de la cadena ya entiende. Principio: un
   píxel representa su área, y una astilla minoritaria no la representa. Junto
   a un núcleo saturado esa astilla es lo más brillante del parche: con «NaN
   solo si todo es NaN» NGC 6543 subía un 12 % de flujo (corrida 1 de #370).
   `fitscut` no tiene regla única que copiar —a factor 2 exacto marca NaN solo
   el bloque entero, a 2,34 queda entre medias— (ps1_nativo_370.md).

   Solo vive en scripts/: el camino en caliente del navegador (ps1-proxy.php,
   bitacora-ps1.js) sigue pidiendo `output_size` como siempre (AC4 de #370). */
'use strict';

/* Pesos de un eje: para cada píxel de salida, los nativos que toca y cuánto de
   cada uno. Separable: el peso 2D es el producto de los de x e y. */
function pesosEje(n, m) {
  var f = n / m, ejes = new Array(m);
  for (var j = 0; j < m; j++) {
    var a = j * f, b = (j + 1) * f, idx = [], w = [];
    for (var i = Math.floor(a); i < Math.min(n, Math.ceil(b)); i++) {
      var p = Math.min(b, i + 1) - Math.max(a, i);
      if (p > 1e-12) { idx.push(i); w.push(p); }
    }
    ejes[j] = { idx: idx, w: w };
  }
  return ejes;
}

/* datos: Float32Array ancho×alto (fila mayor). salida: px de lado del parche
   cuadrado de salida, ≤ ancho. Devuelve Float32Array salida×salida. */
function remuestrearArea(datos, ancho, alto, salida) {
  if (ancho !== alto) throw new Error('remuestrearArea: el parche tiene que ser cuadrado');
  if (!(salida > 0) || salida > ancho) throw new Error('remuestrearArea: solo baja resolución (' + ancho + ' → ' + salida + ')');
  var ejes = pesosEje(ancho, salida), out = new Float32Array(salida * salida);
  for (var y = 0; y < salida; y++) {
    var ey = ejes[y];
    for (var x = 0; x < salida; x++) {
      var ex = ejes[x], s = 0, sw = 0, total = 0;
      for (var a = 0; a < ey.idx.length; a++) {
        var fila = ey.idx[a] * ancho, wy = ey.w[a];
        for (var b = 0; b < ex.idx.length; b++) {
          var w = wy * ex.w[b], v = datos[fila + ex.idx[b]];
          total += w;
          if (v === v) { s += v * w; sw += w; }
        }
      }
      out[y * salida + x] = sw > 0 && sw >= 0.5 * total - 1e-9 ? s / sw : NaN;
    }
  }
  return out;
}

/* La WCS de parseFITS (0-based) llevada a la rejilla gruesa. El centro del
   píxel nativo i cae en (i + 0,5)/f − 0,5 de la salida; la escala crece por f. */
function wcsRemuestreada(wcs, ancho, salida) {
  if (!wcs) return null;
  var f = ancho / salida;
  return { ra0: wcs.ra0, dec0: wcs.dec0,
           x0: (wcs.x0 + 0.5) / f - 0.5, y0: (wcs.y0 + 0.5) / f - 0.5,
           gx: wcs.gx * f, gy: wcs.gy * f };
}

module.exports = { remuestrearArea: remuestrearArea, wcsRemuestreada: wcsRemuestreada };
