/* ============================================================================
   bitacora-png16.js — TEXTURA DSO: CODIFICACIÓN asinh16 Y PNG DE 16 BITS
   Proyecto: Bitácora Estelar

   Fuente única de la ley que convierte un Float32Array de fotometría en los
   16 bits que viajan por la red, y de vuelta. La usan los dos extremos: el
   generador offline (`scripts/gen_dso_texturas.js`, los arneses de fase 0) y
   el navegador que lee la textura. Antes vivía solo en `scripts/lib_asinh16.js`,
   donde el navegador no llega; copiarla al runtime era la deriva que prohíbe el
   ADR 0008, así que sube aquí y el `scripts/` la importa desde su sitio.

   Misma forma que bitacora-astro.js: global de navegador (window.BitacoraPNG16)
   + module.exports para los tests de node (scripts/test_png16.js).

   ── Codificación asinh16 (objetivo del catálogo de texturas DSO, §4.1) ───────
   Es una CODIFICACIÓN, no una ley de display: se deshace entera antes de que
   ningún píxel entre en ps1Cielo. Nada de estirado, gamma ni realce (ADR 0004,
   0019). El único valor con significado propio es el 0: ausencia (NaN del
   stack). Los píxeles por debajo de cielo − kσ se guardan como números; quien
   decide que son ausencia sigue siendo ps1AnclarACatalogo en runtime.

     u = asinh(v / a)                        a = σ del cielo del parche
     q = 1 + round((u − uMin)/(uMax − uMin) · 65534)   ∈ [1, 65535];  0 = NaN
     v'= a · sinh(uMin + (q − 1)·(uMax − uMin)/65534)

   ── Contenedor PNG de 16 bits en gris ────────────────────────────────────────
   Un PNG de 16 bits NO puede leerse con <img> + canvas: el canvas entrega 8
   bits y perdería la mitad de la escala en silencio. Se decodifica a mano:
   firma, IHDR, IDAT concatenado (el escritor puede partirlo), inflado con
   DecompressionStream('deflate'), filtros 0-4 y muestras big-endian.

   Sin DecompressionStream (navegadores anteriores a 2023) `leer` devuelve null
   —nunca una imagen a medias—: el llamador pinta el objeto por su fila del
   catálogo, el mismo respaldo que cuando el proxy no responde.

   Interfaz:
     codificar(datos Float32Array, a, [uMin], [uMax]) -> {u16, a, uMin, uMax}
     decodificar(u16, cod) -> Float32Array (NaN donde q = 0)
     leer(bytes) -> Promise<{ancho, alto, u16} | null>
   ============================================================================ */
'use strict';
(function () {

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

  /* Inflado del IDAT. Nada de esperar a que termine la escritura antes de leer:
     con un parche de 1024² el búfer interno del stream se llena y las dos
     promesas se bloquearían la una a la otra. */
  function inflar(datos) {
    if (typeof DecompressionStream !== 'function') return Promise.resolve(null);
    var ds;
    try { ds = new DecompressionStream('deflate'); } catch (e) { return Promise.resolve(null); }
    var w = ds.writable.getWriter();
    w.write(datos).then(function () { return w.close(); }).catch(function () {});
    var lector = ds.readable.getReader(), trozos = [], total = 0;
    return (function siguiente() {
      return lector.read().then(function (r) {
        if (r.done) {
          var out = new Uint8Array(total), o = 0;
          for (var i = 0; i < trozos.length; i++) { out.set(trozos[i], o); o += trozos[i].length; }
          return out;
        }
        trozos.push(r.value); total += r.value.length;
        return siguiente();
      });
    })().catch(function () { return null; });
  }

  function paeth(a, b, c) {
    var p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
  }

  /* Deshace los filtros por fila (PNG §9.2) y saca las muestras big-endian.
     bpp = 2: gris de 16 bits es un canal de dos bytes. */
  function desfiltrar(raw, ancho, alto) {
    var bpp = 2, tira = ancho * bpp, u16 = new Uint16Array(ancho * alto), y, x, o, prev = null;
    if (raw.length < (tira + 1) * alto) return null;
    var fila = new Uint8Array(tira);
    for (y = 0; y < alto; y++) {
      o = y * (tira + 1);
      var f = raw[o];
      if (f > 4) return null;
      for (x = 0; x < tira; x++) {
        var v = raw[o + 1 + x],
            a = x >= bpp ? fila[x - bpp] : 0,
            b = prev ? prev[x] : 0,
            c = (prev && x >= bpp) ? prev[x - bpp] : 0;
        if (f === 1) v += a;
        else if (f === 2) v += b;
        else if (f === 3) v += (a + b) >> 1;
        else if (f === 4) v += paeth(a, b, c);
        fila[x] = v & 255;
      }
      for (x = 0; x < ancho; x++) u16[y * ancho + x] = (fila[x * 2] << 8) | fila[x * 2 + 1];
      prev = fila;
      fila = new Uint8Array(tira);
    }
    return u16;
  }

  var FIRMA = [137, 80, 78, 71, 13, 10, 26, 10];

  function leer(bytes) {
    var b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), i;
    if (b.length < 8 + 25) return Promise.resolve(null);
    for (i = 0; i < 8; i++) if (b[i] !== FIRMA[i]) return Promise.resolve(null);
    var dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    var p = 8, ancho = 0, alto = 0, cabecera = false, idat = [], total = 0;
    while (p + 8 <= b.length) {
      var len = dv.getUint32(p), tipo = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
      if (p + 12 + len > b.length) return Promise.resolve(null);
      var d = p + 8;
      if (tipo === 'IHDR') {
        ancho = dv.getUint32(d); alto = dv.getUint32(d + 4);
        /* Solo el formato que escribe lib_png.escribirGris16: gris, 16 bits, sin
           entrelazar. Cualquier otro es un fichero que no es nuestra textura. */
        if (b[d + 8] !== 16 || b[d + 9] !== 0 || b[d + 10] !== 0 || b[d + 11] !== 0 || b[d + 12] !== 0) return Promise.resolve(null);
        if (!(ancho > 0) || !(alto > 0)) return Promise.resolve(null);
        cabecera = true;
      } else if (tipo === 'IDAT') {
        idat.push(b.subarray(d, d + len)); total += len;
      } else if (tipo === 'IEND') break;
      p = d + len + 4;
    }
    if (!cabecera || !total) return Promise.resolve(null);
    var flujo = new Uint8Array(total), o = 0;
    for (i = 0; i < idat.length; i++) { flujo.set(idat[i], o); o += idat[i].length; }
    return inflar(flujo).then(function (raw) {
      if (!raw) return null;
      var u16 = desfiltrar(raw, ancho, alto);
      return u16 ? { ancho: ancho, alto: alto, u16: u16 } : null;
    });
  }

  var API = { codificar: codificar, decodificar: decodificar, leer: leer, PASOS: PASOS };

  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
  if (typeof window !== 'undefined') { window.BitacoraPNG16 = API; }
})();
