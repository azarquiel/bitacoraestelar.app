/* Codificación asinh16 del objetivo del catálogo de texturas DSO (§4.1).

   Es una CODIFICACIÓN, no una ley de display: se deshace entera antes de que
   ningún píxel entre en ps1Cielo. Nada de estirado, gamma ni realce (ADR 0004,
   0019). El único valor con significado propio es el 0: ausencia (NaN del
   stack). Los píxeles por debajo de cielo − kσ se guardan como números; quien
   decide que son ausencia sigue siendo ps1AnclarACatalogo en runtime.

     u = asinh(v / a)                        a = σ del cielo del parche
     q = 1 + round((u − uMin)/(uMax − uMin) · 65534)   ∈ [1, 65535];  0 = NaN
     v'= a · sinh(uMin + (q − 1)·(uMax − uMin)/65534)

   Uso:  var C = require('./lib_asinh16.js');
         var e = C.codificar(datos, sigma);   // {u16, a, uMin, uMax}
         var v = C.decodificar(e.u16, e);     // Float32Array con NaN */
'use strict';

var PASOS = 65534;

function codificar(datos, a, uMin, uMax) {
  if (!(a > 0)) throw new Error('asinh16: a debe ser > 0 (es σ del cielo)');
  var n = datos.length, i, u;
  if (uMin == null || uMax == null) {
    uMin = Infinity; uMax = -Infinity;
    for (i = 0; i < n; i++) {
      var v = datos[i];
      if (v !== v) continue;
      u = Math.asinh(v / a);
      if (u < uMin) uMin = u;
      if (u > uMax) uMax = u;
    }
    if (!isFinite(uMin) || !isFinite(uMax)) { uMin = 0; uMax = 1; }
    if (uMax - uMin < 1e-12) uMax = uMin + 1e-12;
  }
  var u16 = new Uint16Array(n), k = PASOS / (uMax - uMin);
  for (i = 0; i < n; i++) {
    var w = datos[i];
    if (w !== w) { u16[i] = 0; continue; }
    var q = 1 + Math.round((Math.asinh(w / a) - uMin) * k);
    u16[i] = q < 1 ? 1 : (q > 65535 ? 65535 : q);
  }
  return { u16: u16, a: a, uMin: uMin, uMax: uMax };
}

function decodificar(u16, cod) {
  var n = u16.length, out = new Float32Array(n), paso = (cod.uMax - cod.uMin) / PASOS;
  for (var i = 0; i < n; i++) {
    out[i] = u16[i] === 0 ? NaN : cod.a * Math.sinh(cod.uMin + (u16[i] - 1) * paso);
  }
  return out;
}

module.exports = { codificar: codificar, decodificar: decodificar, PASOS: PASOS };
