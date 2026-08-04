/* Comprueba la tabla de pistas horneada en resources/reproductor.html:
   que no haya identificadores repetidos ni fichas a medias, y que el
   reparto por álbum coloque las 49 pistas sin dejar álbumes de una sola
   canción (esas van a "Sueltas").

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

// El reparto de la página, tal cual: una función pura de la lista de
// identificadores que suena a la tabla de fichas.
const fuente = html.match(/function repartirAlbumes[\s\S]*?\n}/);
assert.ok(fuente, 'no se encuentra repartirAlbumes en reproductor.html');
const repartirAlbumes = eval('(' + fuente[0] + ')');

const fichas = Object.fromEntries(PISTAS.map((p) => [p.id, p]));
const SUELTAS = 'Sueltas';
const reparto = (lista) => repartirAlbumes(lista, fichas, SUELTAS);

// Un álbum con una sola pista en la lista no es un álbum: esa pista cae
// en "Sueltas".
{
  const uno = reparto(['dGnIFAbRa1k', '7GlsxNI4LVI', 'iSQcqtKY1cA']);
  assert.strictEqual(uno['dGnIFAbRa1k'], SUELTAS,
    'la única pista de "Snowflakes Are Dancing" debería caer en Sueltas');
  assert.strictEqual(uno['7GlsxNI4LVI'],
    'Interstellar (Original Motion Picture Soundtrack)',
    'un álbum con dos pistas se queda como está');
}

// Una pista sin ficha (añadida a la lista en YouTube) también es suelta.
assert.strictEqual(reparto(['xxxxxxxxxxx'])['xxxxxxxxxxx'], SUELTAS,
  'una pista sin ficha va a Sueltas');

// Ninguna pista se pierde por el camino.
const porAlbum = new Map();
for (const album of Object.values(reparto(PISTAS.map((p) => p.id)))) {
  porAlbum.set(album, (porAlbum.get(album) || 0) + 1);
}
assert.strictEqual(
  [...porAlbum.values()].reduce((a, b) => a + b, 0), PISTAS.length,
  'el reparto por álbum pierde pistas');
assert.ok(porAlbum.size >= 2, 'se esperaba más de un álbum');

// Con la lista entera, ningún álbum se queda con una sola pista.
for (const [album, n] of porAlbum) {
  if (album === SUELTAS) continue;
  assert.ok(n > 1, `"${album}" se queda con una sola pista`);
}

console.log(`ok · ${PISTAS.length} pistas en ${porAlbum.size} álbumes`);
for (const [album, n] of [...porAlbum].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${album}`);
}
