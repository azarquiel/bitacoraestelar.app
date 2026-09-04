/* PNG mínimo con el zlib de Node, sin dependencias. Misma rutina que llevan
   copiada harness_interbrazos.js y harness_soporte_rampa.js; tercera
   necesidad = biblioteca (no se tocan aquellas dos copias).
   escribir(ruta, rgb Uint8Array W*H*3, W, H) */
'use strict';
var fs = require('fs'), zlib = require('zlib');

var tabla = null;
function crc32(buf) {
  if (!tabla) {
    tabla = new Int32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      tabla[n] = c;
    }
  }
  var c2 = -1;
  for (var i = 0; i < buf.length; i++) c2 = tabla[(c2 ^ buf[i]) & 255] ^ (c2 >>> 8);
  return (c2 ^ -1) >>> 0;
}
function chunk(tipo, datos) {
  var b = Buffer.alloc(8 + datos.length + 4);
  b.writeUInt32BE(datos.length, 0); b.write(tipo, 4);
  datos.copy(b, 8);
  b.writeUInt32BE(crc32(b.slice(4, 8 + datos.length)), 8 + datos.length);
  return b;
}
function escribir(ruta, rgb, W, H) {
  var raw = Buffer.alloc((W * 3 + 1) * H);
  for (var y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1);
  }
  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(ruta, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))
  ]));
}

/* Gris de 16 bits (tipo de color 0, profundidad 16), big-endian como manda el
   formato. Filtro 0 por fila: los datos son fotometría, no una foto, y los
   filtros predictivos de PNG se pensaron para gradientes de 8 bits.
   `bytes` devuelve solo el tamaño, para medir compresión sin escribir. */
function filas16(u16, W, H) {
  var raw = Buffer.alloc((W * 2 + 1) * H);
  for (var y = 0; y < H; y++) {
    var o = y * (W * 2 + 1);
    raw[o] = 0;
    for (var x = 0; x < W; x++) raw.writeUInt16BE(u16[y * W + x], o + 1 + x * 2);
  }
  return raw;
}
function bufferGris16(u16, W, H) {
  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 16; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(filas16(u16, W, H), { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
function escribirGris16(ruta, u16, W, H) {
  fs.writeFileSync(ruta, bufferGris16(u16, W, H));
}

module.exports = { escribir: escribir, escribirGris16: escribirGris16,
                   bufferGris16: bufferGris16 };
