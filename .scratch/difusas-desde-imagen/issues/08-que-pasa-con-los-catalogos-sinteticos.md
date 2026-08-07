# 08 — Qué pasa con los catálogos sintéticos que quedaron sueltos

**Type:** grilling
**Status:** open
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

_(pendiente)_
