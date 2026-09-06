/* ============================================================================
   bitacora-png16.js — TEXTURA DSO: CODIFICACIÓN asinh16 Y PNG DE 16 BITS
   Proyecto: Bitácora Estelar

   Fuente única de la ley que convierte fotometría en los 16 bits que viajan por
   la red, y de vuelta. La usan los dos extremos —el generador offline y el
   navegador—; antes vivía solo en `scripts/lib_asinh16.js`, donde el navegador
   no llega, y copiarla al runtime era la deriva que prohíbe el ADR 0008.
   Forma de bitacora-astro.js: window.BitacoraPNG16 + module.exports.

   asinh16 es una CODIFICACIÓN, no una ley de display: se deshace entera antes
   de que ningún píxel entre en ps1Cielo, sin estirado, gamma ni realce (ADR
   0004, 0019). El único valor con significado propio es el 0: ausencia (NaN del
   stack). Quien decide qué es ausencia sigue siendo ps1AnclarACatalogo.

     u = asinh(v / a)                        a = σ del cielo del parche
     q = 1 + round((u − uMin)/(uMax − uMin) · 65534)   ∈ [1, 65535];  0 = NaN
     v'= a · sinh(uMin + (q − 1)·(uMax − uMin)/65534)

   El PNG de 16 bits no se puede leer con <img> + canvas —el canvas entrega 8
   bits y perdería media escala en silencio—, así que se decodifica a mano.
   Cualquier tropiezo (incluido un navegador anterior a 2023, sin
   DecompressionStream) da null y nunca una imagen a medias: el llamador pinta
   el objeto por su fila del catálogo. El PORQUÉ va en `notas.motivo`, que es de
   donde saldrá el aviso al observador (§4.4 del objetivo, ticket del runtime).

   Interfaz:
     codificar(datos Float32Array, cod {a, [uMin], [uMax]}) -> {u16, a, uMin, uMax}
     decodificar(u16, cod {a, uMin, uMax}) -> Float32Array (NaN donde q = 0)
     leer(bytes, [notas]) -> Promise<{ancho, alto, u16} | null>;  notas.motivo ∈ MOTIVOS
   ============================================================================ */
'use strict';
(function () {

  var PASOS = 65534;

  /* `a`, `uMin` y `uMax` viajan juntos —el sidecar los escribe juntos y
     `decodificar` los pide juntos—: entran como el mismo objeto que sale. */
  function codificar(datos, cod) {
    cod = cod || {};
    var a = cod.a, uMin = cod.uMin, uMax = cod.uMax;
    if (!(a > 0)) throw new Error('asinh16: a debe ser > 0 (es σ del cielo)');
    var n = datos.length, i, u;
    /* Los dos extremos van juntos o no va ninguno: recodificar un parche con el
       `uMin`/`uMax` del sidecar y que uno de los dos se pierda por el camino
       daría otra escala con el mismo aspecto y sin aviso. */
    if ((uMin == null) !== (uMax == null)) throw new Error('asinh16: uMin y uMax se pasan juntos o ninguno');
    if (uMin != null && !(uMax > uMin)) throw new Error('asinh16: uMax debe ser > uMin');
    if (uMin == null) {
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

  /* Inflado del IDAT. Sin esperar a la escritura antes de leer: con un parche de
     1024² el búfer del stream se llena y las dos promesas se bloquean. */
  function inflar(datos, notas) {
    if (typeof DecompressionStream !== 'function') return Promise.resolve(fallo(notas, 'sin-descompresor'));
    var ds;
    try { ds = new DecompressionStream('deflate'); } catch (e) { return Promise.resolve(fallo(notas, 'sin-descompresor')); }
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
    })().catch(function () { return fallo(notas, 'inflado'); });
  }

  function paeth(a, b, c) {
    var p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
  }

  /* Deshace los filtros por fila (PNG §9.2) y saca las muestras big-endian.
     bpp = 2: gris de 16 bits es un canal de dos bytes. */
  function desfiltrar(raw, ancho, alto, notas) {
    var bpp = 2, tira = ancho * bpp, u16 = new Uint16Array(ancho * alto), y, x, o, prev = null;
    if (raw.length < (tira + 1) * alto) return fallo(notas, 'tamaño');
    var fila = new Uint8Array(tira);
    for (y = 0; y < alto; y++) {
      o = y * (tira + 1);
      var f = raw[o];
      if (f > 4) return fallo(notas, 'filtro');
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

  /* CRC-32 del formato (PNG §5.5); `scripts/lib_png.js` toma esta tabla para no
     tener otra. Lo que protege no es el IDAT —ya lo cubre el Adler-32 de zlib—
     sino el IHDR: un byte volteado en las dimensiones da un fichero coherente
     que se decodifica entero y sale mal. */
  var tabla = null;
  function crc32(buf, ini, fin) {
    if (!tabla) {
      tabla = new Int32Array(256);
      for (var n = 0; n < 256; n++) {
        var t = n;
        for (var k = 0; k < 8; k++) t = (t & 1) ? (0xedb88320 ^ (t >>> 1)) : (t >>> 1);
        tabla[n] = t;
      }
    }
    var c = -1;
    for (var i = ini == null ? 0 : ini, f = fin == null ? buf.length : fin; i < f; i++) {
      c = tabla[(c ^ buf[i]) & 255] ^ (c >>> 8);
    }
    return (c ^ -1) >>> 0;
  }

  var FIRMA = [137, 80, 78, 71, 13, 10, 26, 10];

  /* `leer` devuelve siempre null al fallar —quien llama solo puede pintar la
     fila del catálogo—, pero el porqué va en `notas`. `sin-descompresor` es el
     único que no habla del fichero sino del navegador: otro aviso. */
  var MOTIVOS = ['sin-firma', 'truncado', 'crc', 'formato', 'sin-cabecera',
                 'sin-datos', 'sin-descompresor', 'inflado', 'tamaño', 'filtro'];
  function fallo(notas, motivo) { if (notas) notas.motivo = motivo; return null; }

  function leer(bytes, notas) {
    var b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), i;
    if (notas) notas.motivo = '';
    if (b.length < 8 + 25) return Promise.resolve(fallo(notas, 'truncado'));
    for (i = 0; i < 8; i++) if (b[i] !== FIRMA[i]) return Promise.resolve(fallo(notas, 'sin-firma'));
    var dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    var p = 8, ancho = 0, alto = 0, cabecera = false, idat = [], total = 0;
    while (p + 8 <= b.length) {
      var len = dv.getUint32(p), tipo = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
      if (p + 12 + len > b.length) return Promise.resolve(fallo(notas, 'truncado'));
      var d = p + 8;
      if (crc32(b, p + 4, d + len) !== dv.getUint32(d + len)) return Promise.resolve(fallo(notas, 'crc'));
      if (tipo === 'IHDR') {
        ancho = dv.getUint32(d); alto = dv.getUint32(d + 4);
        /* Solo el formato que escribe lib_png.escribirGris16: gris, 16 bits, sin
           entrelazar. Cualquier otro es un fichero que no es nuestra textura. */
        if (b[d + 8] !== 16 || b[d + 9] !== 0 || b[d + 10] !== 0 || b[d + 11] !== 0 || b[d + 12] !== 0) return Promise.resolve(fallo(notas, 'formato'));
        if (!(ancho > 0) || !(alto > 0)) return Promise.resolve(fallo(notas, 'formato'));
        cabecera = true;
      } else if (tipo === 'IDAT') {
        idat.push(b.subarray(d, d + len)); total += len;
      } else if (tipo === 'IEND') break;
      p = d + len + 4;
    }
    if (!cabecera) return Promise.resolve(fallo(notas, 'sin-cabecera'));
    if (!total) return Promise.resolve(fallo(notas, 'sin-datos'));
    var flujo = new Uint8Array(total), o = 0;
    for (i = 0; i < idat.length; i++) { flujo.set(idat[i], o); o += idat[i].length; }
    return inflar(flujo, notas).then(function (raw) {
      if (!raw) return null;
      var u16 = desfiltrar(raw, ancho, alto, notas);
      return u16 ? { ancho: ancho, alto: alto, u16: u16 } : null;
    });
  }

  var API = { codificar: codificar, decodificar: decodificar, leer: leer,
              crc32: crc32, MOTIVOS: MOTIVOS, PASOS: PASOS };

  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
  if (typeof window !== 'undefined') { window.BitacoraPNG16 = API; }
})();
