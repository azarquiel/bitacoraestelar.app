# ADRs del simulador óptico

Decisiones propias de `simulador_ocular/`. Las que cruzan contextos viven en `docs/adr/` raíz.

**Cita por ruta, no solo por número.** Hay tres números repetidos (0015, 0018 y 0030):
cada par son dos decisiones distintas. Las subcarpetas `NNNN-tema/` guardan el prerregistro,
los informes y el veredicto del ADR con ese número.

Estado: `aceptada` si no se indica otra cosa. Tipo: **decisión** (fija cómo es el código) o
**prerregistro** (fija los listones de un experimento antes de medir).

## Método: cómo se investiga una discrepancia

| ADR | Tipo | Estado |
|---|---|---|
| [0003 · La conservación fotométrica es un test, no una imposición](0003-conservacion-fotometrica-como-test.md) | decisión | |
| [0004 · Nada de parámetros estéticos para tapar fotometría](0004-nada-de-parametros-esteticos-para-tapar-fotometria.md) | decisión | |
| [0005 · Un test vacuo no es evidencia positiva](0005-un-test-vacuo-no-es-evidencia-positiva.md) | decisión | |
| [0006 · Métricas fotométricas y perceptuales van separadas](0006-metricas-fotometricas-y-perceptuales-separadas.md) | decisión | |
| [0007 · Una sola capa física por investigación](0007-una-sola-capa-fisica-por-investigacion.md) | decisión | |
| [0008 · El arnés no reimplementa la ley que mide](0008-el-arnes-no-reimplementa-la-ley-que-mide.md) | decisión | |
| [0021 · La mordida se mide, no se toca](0021-la-mordida-se-mide-no-se-toca.md) | decisión | |

## Cadena fotométrica y cielo

| ADR | Tipo | Estado |
|---|---|---|
| [0009 · El fondo de cielo se pinta como luminancia codificada en sRGB](0009-fondo-cielo-luminancia.md) | decisión | |
| [0010 · El suelo de detección del ojo (27 mag/arcsec²)](0010-suelo-27-deteccion-ojo.md) | decisión | enmendada por 0030-el-27 |
| [0030 · El 27 de ADR-0010 eran dos cantidades físicas y una guarda](0030-el-27-de-adr-0010-eran-dos-cantidades.md) | decisión | |
| [0018 · El brillo de una estrella es umbral, no contraste](0018-el-brillo-de-una-estrella-es-umbral-no-contraste.md) | decisión | |
| [0019 · La pendiente del alpha de estrella va separada del rango de la cadena](0019-la-pendiente-del-alpha-de-estrella-va-separada-del-rango-de-la-cadena.md) | decisión | |

## Modelo de cúmulos y globulares

| ADR | Tipo | Estado |
|---|---|---|
| [0001 · H2c es la capa perceptual del modelo de cúmulos](0001-h2c-es-la-capa-perceptual-del-modelo-de-cumulos.md) | decisión | |
| [0002 · Frontera entre `bitacora-cumulos.js` y `bitacora-gaia-render.js`](0002-frontera-cumulos-render.md) | decisión | |
| [0011 · El `(1−a)` de la banda de transición es campo](0011-la-banda-de-transicion-es-parte-del-campo.md) | decisión | **derogada** por 0012 |
| [0012 · El crowding es una probabilidad por estrella](0012-el-crowding-es-una-probabilidad-por-estrella.md) · [apoyo](0012-crowding/) | decisión | |
| [0015 · El grano SBF de los globulares tiene ley de umbral propia](0015-umbral-de-textura-para-el-grano-sbf.md) · [apoyo](0015-textura/) | decisión | |
| [0016 · La rotura del núcleo se mide con Φ](0016-phi-metrica-de-veredicto-de-la-rotura-del-nucleo.md) · [apoyo](0016-rotura-nucleo/) | decisión | |
| [0017 · La ausencia manda cuando la máscara pisa un borde real](0017-la-ausencia-manda-cuando-la-mascara-pisa-un-borde-real.md) | decisión | |
| [0035 · La forma radial de los globulares sale del perfil de Trager 1995](0035-perfil-medido-de-trager-para-el-halo-de-los-globulares.md) | decisión | |

## Niebla y velo de los cúmulos abiertos

| ADR | Tipo | Estado |
|---|---|---|
| [0022 · Niebla sub-`mlim` en cúmulos abiertos](0022-preregistro-niebla-sub-mlim-en-cumulos-abiertos.md) | prerregistro | |
| [0023 · La niebla se juzga con H2c, a la escala de Riccò](0023-la-niebla-se-juzga-con-h2c-a-la-escala-de-ricco.md) | prerregistro | |
| [0029 · Velo espacial por celdas](0029-preregistro-velo-espacial-por-celdas.md) | prerregistro | |

## Adquisición de Gaia

| ADR | Tipo | Estado |
|---|---|---|
| [0014 · Adquisición de Gaia por régimen de densidad](0014-adquisicion-gaia-por-regimen-de-densidad.md) | decisión | derogada en parte por 0033 |
| [0015 · El color de una estrella se resuelve por identidad de Gaia](0015-color-de-estrella-por-identidad-no-por-posicion.md) | decisión | |
| [0018 · Las estrellas que Gaia DR3 no trae son un catálogo aparte](0018-las-estrellas-que-gaia-dr3-no-trae-son-un-catalogo-aparte.md) | decisión | |
| [0030 · Dos ejes ortogonales para Gaia](0030-dos-ejes-gaia-preregistro-de-listones.md) · [informes](0030-dos-ejes-gaia/) | prerregistro | cerrado: NO PASA |
| [0033 · Avance de Gaia y complemento débil](0033-avance-de-gaia-y-complemento-debil.md) | decisión | |

## Objetos difusos: fila de catálogo, textura DSO y parche

| ADR | Tipo | Estado |
|---|---|---|
| [0013 · El modelo intrínseco vive en la fila de catálogo](0013-el-modelo-intrinseco-vive-en-la-fila-de-catalogo.md) | decisión | |
| [0020 · La frontera PS1–fotometría se dibuja por dueño](0020-la-frontera-ps1-fotometria-se-dibuja-por-dueno.md) | decisión | |
| [0024 · Catálogo propio de texturas DSO (fases 1-3)](0024-preregistro-catalogo-de-texturas-dso.md) | prerregistro | |
| [0025 · El tinte de las planetarias se prerregistra](0025-preregistro-tinte-de-las-planetarias-brillantes.md) · [apoyo](0025-tinte-planetarias/) | prerregistro | |
| [0026 · El nombre de una textura sale de sus parámetros](0026-el-nombre-de-una-textura-sale-de-sus-parametros.md) | decisión | |

Parche, cielo y anclaje:

| ADR | Tipo | Estado |
|---|---|---|
| [0027 · De dónde salen el cielo y la σ de un parche](0027-preregistro-de-donde-sale-el-cielo-y-la-sigma-de-un-parche.md) | prerregistro | |
| [0028 · El cielo de un parche se mide fuera del objeto](0028-el-cielo-de-un-parche-se-mide-fuera-del-objeto.md) | decisión | |
| [0031 · μ asumida en nebulosas de reflexión](0031-preregistro-mu-asumida-en-nebulosas-de-reflexion.md) | prerregistro | |
| [0034 · El lado de una difusa sin borde se mide](0034-el-lado-de-una-difusa-sin-borde-se-mide.md) | decisión | |
| [0036 · El campo vecino se aleja del lado medido](0036-el-campo-vecino-se-aleja-del-lado-medido.md) | decisión | |
| [0037 · El anclaje a catálogo se mide en la apertura del objeto](0037-el-anclaje-se-mide-en-la-apertura-del-objeto.md) | decisión | |

## Un ADR nuevo

1. Número: el siguiente libre mirando también `docs/adr/` raíz (hoy, 0038).
2. Primeras líneas: `Fecha:` y `Estado:`, y `Deroga:`/`Enmienda a:` si toca.
3. Si deroga o enmienda otro, añade la marca inversa en ese otro y actualiza esta tabla.
