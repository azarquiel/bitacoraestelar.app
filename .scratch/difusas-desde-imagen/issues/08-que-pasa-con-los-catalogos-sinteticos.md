# 08 — Qué pasa con los catálogos sintéticos que quedaron sueltos

**Type:** grilling
**Status:** closed para galaxias (11-ago-2026); abierta para `nebulosas-datos.js`
**Blocked by:** 03

## Question

`d0a3641` borró el código que los usaba, pero **no** los datos. Hoy siguen en el
repo y, peor, siguen cargándose en las dos páginas sin que nadie los lea:

- `simulador_ocular/resources/js/galaxias-datos.js` — 1304 líneas, RC3 vía
  VizieR, con `r_e`, `b/a`, PA, mag V, índice de Sérsic, B/T y marca de polvo.
- `simulador_ocular/resources/js/nebulosas-datos.js` — 248 líneas, NGC/IC.
- Sus generadores: `scripts/gen_galaxias.py`, `scripts/gen_nebulosas.py`.
- Dos `<script src>` vivos: `ocular-wordpress.html:236-237` y
  `registro/registrar-observacion-wordpress.html:162-163`.

Es peso muerto descargado en cada carga de las dos páginas. Pero antes de
borrarlo hay que decidir si **algo** de ahí sigue sirviendo:

- Si la imagen del cartografiado trae el campo entero, no hace falta ningún
  catálogo para saber qué hay ni qué recorte pedir: se pide el campo y ya.
  Entonces sobran los cuatro ficheros y los dos `<script>`.
- Pero puede que el catálogo siga valiendo para otra cosa: saber que hay un
  objeto extenso en el campo (para decidir si merece la pena pedir el recorte),
  para etiquetarlo, o para el buscador por nombre.

Cerrar: se borran, se conservan por una razón dicha, o se conservan recortados a
lo que de verdad se use. Si se borran, la ficha lista exactamente qué ficheros y
qué líneas de HTML.

## Answer

**`galaxias-datos.js` se queda, y pasa de peso muerto a pieza central.** La
premisa de la pregunta —«si la imagen trae el campo entero, no hace falta
catálogo»— cayó con el parche por objeto (ficha 10): no se pide el campo, se
pide **cada galaxia**, y para eso hace falta saber cuáles hay y de qué tamaño.

Cada columna tiene ahora un uso, y ninguna sobra:

| Columna | Para qué |
|---|---|
| RA, Dec | qué galaxias caen en el campo, y dónde se pega el parche |
| `r_e` | lado del parche: `min(6·r_e, 20′)` (ficha 10) |
| `n`, `B/T` | fracción de luz que se sale del parche, corrección del anclaje |
| mag V | **el nivel de brillo de la capa** (ficha 03) |
| `b/a`, PA | por ahora nada: la forma la da la imagen. Se conservan |
| polvo | nada: la banda de polvo la da la imagen. Se conserva |

`scripts/gen_galaxias.py` no se toca, y su `<script src>` en las dos páginas se
queda donde está.

Las dos últimas filas son la contrapartida honesta: `b/a`, PA y la marca de
polvo eran del dibujo sintético y ya no dibujan nada. Se conservan porque el
generador las trae gratis y porque son el respaldo natural si algún día hay que
pintar una galaxia sin imagen (el sur de la ficha 05). Si en un año siguen sin
usarse, se recortan de `gen_galaxias.py`.

### Lo que queda abierto: `nebulosas-datos.js`

Las nebulosas quedaron **fuera de alcance** (mapa, 11-ago-2026), así que sus 248
líneas y `gen_nebulosas.py` siguen siendo exactamente lo que denunciaba esta
ficha: peso descargado en cada carga de las dos páginas sin que nadie lo lea. Se
borran o se justifican, pero eso es una decisión suya y no la arrastra este
esfuerzo. Los `<script src>` afectados: `ocular-wordpress.html:236-237` y
`registro/registrar-observacion-wordpress.html:162-163`.
