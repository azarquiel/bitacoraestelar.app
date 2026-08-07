# 02 — Cómo se quitan las estrellas de una imagen de campo

**Type:** research
**Status:** open
**Blocked by:** —

## Question

La imagen del cartografiado trae **todo**: la galaxia, la nebulosa y las
estrellas. Pero las estrellas ya las pinta la capa de Gaia, con su fotometría y
su magnitud límite. Si la imagen entra tal cual, cada estrella se pinta dos
veces y con dos aspectos distintos.

La spec original manda **StarNet++**, que es una red neuronal offline: no cabe
en una tubería de navegador ni en un campo pedido en vivo.

Averiguar qué alternativas hay, y cuáles son viables en JS sobre un lienzo de
PROC² píxeles en tiempo de fotograma:

1. **Resta informada por catálogo** — la posición y el flujo de cada estrella ya
   los da Gaia DR3, exactamente, para este mismo campo. ¿Qué exige restar una
   PSF ajustada en esas posiciones? ¿Cómo se estima la PSF de la placa (FWHM,
   alas)? ¿Qué pasa con las estrellas que la placa satura y con las que Gaia no
   trae (el catálogo está incompleto en núcleos densos por aglomeración)?
2. **Filtro morfológico / de mediana** — apertura morfológica, mediana de radio
   grande, o `min` seguido de `max`. Cuánto se lleva por delante del objeto
   difuso, sobre todo del núcleo de una galaxia, que en tamaño se parece a una
   estrella gorda.
3. **In-painting del hueco** — una vez marcada la estrella, con qué se rellena.
   Ojo: `rellenarNucleo` / `repararNucleos` ya hacen algo parecido en este mismo
   módulo (`resources/js/bitacora-gaia-render.js:311`), para el núcleo hundido
   de los mosaicos de PanSTARRS. Mirar si sirve de base.
4. **Prior art** — cómo lo resuelven otros simuladores de cielo o pipelines de
   fotometría de galaxias sobre imágenes con estrellas superpuestas.

Devolver una comparación honesta de coste, calidad y complejidad, no una
recomendación de una línea.

## Answer

_(pendiente)_
