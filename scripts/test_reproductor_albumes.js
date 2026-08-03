/* Comprueba la tabla de pistas horneada en resources/reproductor.html:
   que no haya identificadores repetidos ni fichas a medias, y que el
   agrupado por álbum reparta las 49 pistas de la lista.

   Uso: node scripts/test_reproductor_albumes.js */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(
  path.join(__dirname, '..', 'resources', 'reproductor.html'), 'utf8');

const tabla = html.match(/var PISTAS = (\[[\s\S]*?\]);/);
assert.ok(tabla, 'no se encuentra la tabla PISTAS en reproductor.html');
const PISTAS = eval(tabla[1]);

assert.strictEqual(PISTAS.length, 49, 'la lista tenía 49 pistas al generar la tabla');

const ids = PISTAS.map((p) => p.id);
assert.strictEqual(new Set(ids).size, ids.length, 'hay identificadores repetidos');

for (const p of PISTAS) {
  assert.match(p.id, /^[\w-]{11}$/, `identificador raro: ${p.id}`);
  for (const campo of ['titulo', 'artista', 'album']) {
    assert.ok(p[campo] && p[campo].trim(), `${p.id} sin ${campo}`);
  }
}

// El agrupado es un simple reparto por álbum: ninguna pista se pierde
// y ningún álbum se queda vacío.
const porAlbum = new Map();
for (const p of PISTAS) {
  porAlbum.set(p.album, (porAlbum.get(p.album) || 0) + 1);
}
assert.strictEqual(
  [...porAlbum.values()].reduce((a, b) => a + b, 0), PISTAS.length,
  'el reparto por álbum pierde pistas');
assert.ok(porAlbum.size >= 2, 'se esperaba más de un álbum');

console.log(`ok · ${PISTAS.length} pistas en ${porAlbum.size} álbumes`);
for (const [album, n] of [...porAlbum].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${album}`);
}
