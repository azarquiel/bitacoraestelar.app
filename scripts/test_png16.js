#!/usr/bin/env node
/* Test del CÓDEC asinh16 Y DEL PNG DE 16 BITS (resources/js/bitacora-png16.js).

   Por qué existe: la textura DSO cruza dos mundos —la escribe Node y la lee el
   navegador— y lo hace en un formato que nada más del árbol sabe leer. Un error
   aquí no da error: da una galaxia con los niveles cambiados, o media imagen. Se
   comprueba contra el zlib de Node, que es una implementación independiente del
   inflado, y contra los cinco filtros del formato, que el escritor propio no usa
   (solo emite el 0) y que un escritor ajeno sí puede emitir.

   Reimplementación a propósito, declarada como manda el ADR 0008: `pngFiltrado`
   ARMA ficheros PNG con filtros 1-4 y con el IDAT partido. No es una copia de la
   ley que se mide —el decodificador— sino su contraparte: contrastar el lector
   contra un escritor independiente es justamente lo que se quiere. Por lo mismo
   el CRC-32 propio se compara con `zlib.crc32`: escritor y lector comparten la
   tabla, así que solo un tercero puede decir que la tabla es la correcta.

   Sin dependencias:  node scripts/test_png16.js  */
'use strict';

var zlib = require('zlib');
global.window = {};                       // el navegador, para ver qué publica el módulo
var P = require('../resources/js/bitacora-png16.js');
var LP = require('./lib_png.js');

var fallos = 0, asserts = 0;
function ok(cond, etiqueta) {
  asserts++;
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function casi(a, b, tol, etiqueta) {
  asserts++;
  if (Math.abs(a - b) <= tol) { console.log('  ok   ' + etiqueta + ' = ' + a); }
  else { fallos++; console.error('  FALLA ' + etiqueta + '\n         esperado ' + b + ' ±' + tol + '\n         obtenido ' + a); }
}

/* ── Escritor de contraste ────────────────────────────────────────────────────
   PNG gris de 16 bits con el filtro `f` en TODAS las filas y el IDAT partido en
   `trozos` pedazos. El empaquetado en chunks lo pone `lib_png`, que es el
   escritor de verdad; lo que este fichero aporta —y que ningún escritor del
   árbol emite— son los filtros 1-4 y el IDAT troceado. */
var chunk = LP.chunk;
function paeth(a, b, c) {
  var p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
}
function pngFiltrado(u16, W, H, f, trozos) {
  var tira = W * 2, raw = Buffer.alloc((tira + 1) * H);
  var sin = Buffer.alloc(tira), prev = Buffer.alloc(tira);
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) sin.writeUInt16BE(u16[y * W + x], x * 2);
    var o = y * (tira + 1);
    raw[o] = f;
    for (var i = 0; i < tira; i++) {
      var a = i >= 2 ? sin[i - 2] : 0, b = prev[i], c = i >= 2 ? prev[i - 2] : 0, v = sin[i];
      if (f === 1) v -= a;
      else if (f === 2) v -= b;
      else if (f === 3) v -= (a + b) >> 1;
      else if (f === 4) v -= paeth(a, b, c);
      raw[o + 1 + i] = v & 255;
    }
    sin.copy(prev);
  }
  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 16; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  var z = zlib.deflateSync(raw, { level: 9 }), partes = [], n = Math.ceil(z.length / trozos);
  for (var p = 0; p < z.length; p += n) partes.push(chunk('IDAT', z.slice(p, p + n)));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr)]
    .concat(partes, [chunk('IEND', Buffer.alloc(0))]));
}

/* Datos de prueba: un gradiente con estructura (para que Sub/Up/Average/Paeth no
   se confundan entre sí ni con el filtro 0) y con ausencia declarada. */
var W = 37, H = 11, N = W * H;
var datos = new Float32Array(N);
for (var i = 0; i < N; i++) {
  var x = i % W, y = (i / W) | 0;
  datos[i] = (x - 18) * 3.1 + y * y * 0.7 + Math.sin(x * 0.7 + y) * 40;
}
datos[0] = NaN; datos[N - 1] = NaN; datos[5 * W + 9] = NaN;   // ausencia del stack
var sigma = 12.5;

/* ── Una sola implementación para los dos extremos ────────────────────────────
   El motivo entero del módulo: que la ley que codifica en Node sea la MISMA que
   decodifica en el navegador. No basta con que las dos APIs existan; se compara
   por identidad de función, que es lo que una copia no puede fingir. */
console.log('El códec que ve Node y el que ve el navegador son el mismo:');
var W3 = global.window.BitacoraPNG16;
ok(!!W3, 'el módulo publica window.BitacoraPNG16');
ok(W3.codificar === P.codificar && W3.decodificar === P.decodificar && W3.leer === P.leer,
   'las tres funciones son las mismas, no dos copias');

console.log('\nIda y vuelta Float32Array → PNG-16 → Float32Array:');
var cod = P.codificar(datos, sigma);
var png = LP.bufferGris16(cod.u16, W, H);

/* ── La rama del sidecar: uMin y uMax vienen dados ────────────────────────────
   El generador escribe `{a, uMin, uMax}` en el sidecar y quien recodifique un
   parche (una recaptura, un test de regresión) los pasa de vuelta. Es la rama
   que produce los bits que se publican, así que se prueba igual que la otra. */
console.log('\nCodificación con uMin y uMax dados (los del sidecar):');
var dados = P.codificar(datos, sigma, cod.uMin, cod.uMax);
var identicos = 0;
for (var t = 0; t < N; t++) if (dados.u16[t] === cod.u16[t]) identicos++;
ok(identicos === N, 'reproduce bit a bit lo que calculó la rama automática (' + identicos + '/' + N + ')');
ok(dados.uMin === cod.uMin && dados.uMax === cod.uMax, 'y devuelve los mismos extremos que se le pasaron');

/* Extremos más estrechos que los datos: se satura en los dos topes, nunca se
   sale del rango de 16 bits ni pisa el 0, que es la ausencia. */
var estrecho = P.codificar(datos, sigma, cod.uMin + 0.3, cod.uMax - 0.3);
var abajo = 0, arriba = 0, ceros = 0;
for (var s = 0; s < N; s++) {
  if (estrecho.u16[s] === 0) ceros++;
  else if (estrecho.u16[s] === 1) abajo++;
  else if (estrecho.u16[s] === 65535) arriba++;
}
ok(abajo > 0 && arriba > 0, 'satura en 1 y en 65535 (' + abajo + ' abajo, ' + arriba + ' arriba)');
ok(ceros === 3, 'y la saturación no inventa ausencias: siguen siendo 3 ceros (' + ceros + ')');

function lanza(fn) { try { fn(); return false; } catch (e) { return true; } }
ok(lanza(function () { return P.codificar(datos, sigma, cod.uMin); }),
   'pasar uMin sin uMax es un error, no un recálculo silencioso');
ok(lanza(function () { return P.codificar(datos, sigma, null, cod.uMax); }),
   'pasar uMax sin uMin también');
ok(lanza(function () { return P.codificar(datos, sigma, 2, 2); }), 'uMax = uMin es un error');
ok(lanza(function () { return P.codificar(datos, 0); }), 'a = 0 sigue siendo un error');

console.log('');
P.leer(png).then(function (img) {
  ok(!!img, 'el PNG que escribe lib_png se lee');
  ok(img.ancho === W && img.alto === H, 'dimensiones del IHDR (' + img.ancho + '×' + img.alto + ')');
  var iguales = 0;
  for (var j = 0; j < N; j++) if (img.u16[j] === cod.u16[j]) iguales++;
  ok(iguales === N, 'las ' + N + ' muestras de 16 bits vuelven idénticas (' + iguales + ')');

  var v = P.decodificar(img.u16, cod), nan = 0, peor = 0;
  for (var k = 0; k < N; k++) {
    if (datos[k] !== datos[k]) { if (v[k] !== v[k]) nan++; continue; }
    var e = Math.abs(v[k] - datos[k]) / sigma;
    if (e > peor) peor = e;
  }
  ok(nan === 3, 'el centinela 0 va y vuelve como NaN en los 3 píxeles ausentes (' + nan + ')');
  var vivos = 0;
  for (var m = 0; m < N; m++) if (v[m] === v[m]) vivos++;
  ok(vivos === N - 3, 'y no aparece ningún NaN de más (' + vivos + ' vivos de ' + (N - 3) + ')');
  casi(peor, 0, 1e-3, 'error de cuantización máximo en unidades de σ');

  /* ── Los cinco filtros, contra el zlib de Node ───────────────────────────── */
  console.log('\nFiltros PNG 0-4 y IDAT partido:');
  var pendientes = [];
  [0, 1, 2, 3, 4].forEach(function (f) {
    pendientes.push(P.leer(pngFiltrado(cod.u16, W, H, f, 1)).then(function (r) {
      var bien = !!r && r.ancho === W && r.alto === H;
      if (bien) for (var q = 0; q < N; q++) if (r.u16[q] !== cod.u16[q]) { bien = false; break; }
      ok(bien, 'filtro ' + f + ' decodificado exacto');
    }));
  });
  pendientes.push(P.leer(pngFiltrado(cod.u16, W, H, 4, 7)).then(function (r) {
    var bien = !!r;
    if (bien) for (var q = 0; q < N; q++) if (r.u16[q] !== cod.u16[q]) { bien = false; break; }
    ok(bien, 'IDAT partido en 7 trozos, concatenado antes de inflar');
  }));

  /* Basura declarada: un fichero que no es nuestra textura no se lee «a medias». */
  pendientes.push(P.leer(Buffer.from([137, 80, 78, 71, 0, 0, 0, 0])).then(function (r) {
    ok(r === null, 'sin firma válida devuelve null');
  }));
  pendientes.push(P.leer(png.slice(0, png.length - 40)).then(function (r) {
    ok(r === null, 'PNG truncado devuelve null, no una imagen a medias');
  }));
  /* Profundidad 8: con el CRC del IHDR rehecho, para que lo que rechace sea la
     profundidad y no la corrupción. */
  var otro = LP.bufferGris16(cod.u16, W, H);
  otro[24] = 8;
  otro.writeUInt32BE(P.crc32(otro, 12, 29), 29);
  pendientes.push(P.leer(otro).then(function (r) {
    ok(r === null, 'profundidad distinta de 16 devuelve null (con el CRC bueno)');
  }));

  /* ── Integridad: el CRC del formato ──────────────────────────────────────────
     Los dos casos de abajo tocan SOLO los cuatro bytes del CRC y dejan los datos
     intactos: el fichero se decodificaría entero y sin un error, así que el
     único que puede rechazarlo es el CRC. Es la forma de que estos asserts no
     pasen por otra causa (ADR 0005) —el ancho falseado, por ejemplo, ya lo caza
     el guardián de filtro, y un bit volteado dentro del IDAT lo caza el
     Adler-32 de zlib—. */
  var ihdrMal = LP.bufferGris16(cod.u16, W, H);
  ihdrMal.writeUInt32BE((ihdrMal.readUInt32BE(29) ^ 1) >>> 0, 29);   // CRC del IHDR
  pendientes.push(P.leer(ihdrMal).then(function (r) {
    ok(r === null, 'CRC del IHDR corrupto: null, y sin él la imagen saldría entera y mal');
  }));
  var idatMal = LP.bufferGris16(cod.u16, W, H);
  var finIdat = idatMal.length - 12 - 4;                     // antes del IEND
  idatMal.writeUInt32BE((idatMal.readUInt32BE(finIdat) ^ 1) >>> 0, finIdat);
  pendientes.push(P.leer(idatMal).then(function (r) {
    ok(r === null, 'CRC del IDAT corrupto: null');
  }));

  /* Y el ancho falseado, que es el fallo que se teme: da igual quién lo cace,
     el contrato es que no salga imagen. */
  var anchoMal = LP.bufferGris16(cod.u16, W, H);
  anchoMal.writeUInt32BE(18, 16);
  pendientes.push(P.leer(anchoMal).then(function (r) {
    ok(r === null, 'IHDR con el ancho falseado no devuelve una imagen equivocada');
  }));

  /* El CRC propio, contra el del zlib de Node: implementación independiente,
     que es lo único que descarta que escritor y lector compartan un error. */
  ok(P.crc32(Buffer.from('IHDR')) === zlib.crc32(Buffer.from('IHDR')) &&
     P.crc32(png) === zlib.crc32(png) &&
     P.crc32(png, 12, 29) === zlib.crc32(png.slice(12, 29)),
     'crc32 coincide con zlib.crc32 (entero y por tramo)');

  return Promise.all(pendientes);
}).then(function () {
  /* ── Sin DecompressionStream ──────────────────────────────────────────────── */
  console.log('\nNavegador sin DecompressionStream:');
  var guardado = globalThis.DecompressionStream;
  delete globalThis.DecompressionStream;
  return P.leer(png).then(function (r) {
    globalThis.DecompressionStream = guardado;
    ok(r === null, 'devuelve null y no una imagen a medias');
  }, function (e) {
    globalThis.DecompressionStream = guardado;
    ok(false, 'devuelve null en vez de lanzar (' + e.message + ')');
  });
}).then(function () {
  /* ADR 0005: cardinalidad mínima. Si una promesa se pierde por el camino, el
     proceso terminaría en verde con la mitad de las comprobaciones sin correr.
     Mutaciones documentadas que ponen rojo este test, las tres comprobadas: en
     bitacora-png16.js, cambiar `if (f === 3) v += (a + b) >> 1;` por `v += a;`;
     quitar el `+ 1` de `q = 1 + Math.round(...)` en `codificar`; o quitar la
     línea que compara el CRC del chunk. */
  console.log('');
  ok(asserts >= 30, 'cardinalidad: ' + asserts + ' comprobaciones ejecutadas (mínimo 30)');
  console.log(fallos ? '\nFALLOS: ' + fallos : '\nTodo correcto (' + asserts + ' comprobaciones)');
  process.exit(fallos ? 1 : 0);
}).catch(function (e) {
  console.error('EXCEPCIÓN: ' + (e && e.stack || e));
  process.exit(1);
});
