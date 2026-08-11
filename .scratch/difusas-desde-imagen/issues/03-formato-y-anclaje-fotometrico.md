# 03 — Formato de la imagen y anclaje fotométrico

**Type:** grilling
**Status:** closed (11-ago-2026)
**Blocked by:** 01

## Question

Decidir **qué se pide y cómo se convierte a flujo**. Es la decisión central: de
ella cuelgan 04, 06, 07 y 08.

Las dos vías:

- **A — JPG estirado, banda `g` o color, por la vía que ya existe.** Cero código
  nuevo de descarga. Pero la luma 0–255 no es flujo: `flujoDePlaca` la mapea a
  brillo superficial con una interpolación entre `FOT.SB_OBJ_MIN` y
  `FOT.SB_OBJ_MAX` más una gamma (`GAMMA_HIPS = 2.0`) para PanSTARRS. Es una
  heurística calibrada a ojo, no fotometría. La atenuación por pupila sí sale
  bien porque la aplica `ctxFotometrico` después, pero el brillo superficial
  absoluto del objeto queda al arbitrio de esas tres constantes.
- **B — FITS lineal con punto cero.** Da μ en mag/arcsec² de verdad, y con ello
  la coherencia fotométrica que pide la §7 de la spec. Cuesta un parser de FITS
  en JS: se escribió uno (`parseFITS`) para el intento de DESI Legacy y se
  decidió **no rescatarlo**. Habría que traerlo de vuelta o escribirlo otra vez.

**Lo que la ficha 01 cambió de esta ficha, y es mucho.** La vía B se planteó
suponiendo que el punto cero venía en la cabecera. **No viene**: el FITS de
`hips2fits` trae WCS TAN completa pero **ni `BUNIT` ni `MAGZP`**. La vía B no es
«parsear FITS y leer el punto cero», es: parser de FITS **+ 2,0 MB por recorte de
720²** (float32 sin comprimir) **+ una segunda petición de red al catálogo PS1 en
MAST + fotometría de apertura en JS para ajustar el punto cero campo a campo**.
Ha engordado tres veces respecto a como estaba escrita arriba.

Y la ficha 02 empujó al otro lado: sobre imagen **estirada** una apertura 7×7
deja el 98 % del flujo de la galaxia y mata la estrella, mientras que sobre
imagen **lineal** el mismo filtro se lleva la mitad del objeto. El estirado del
JPG no es solo lo barato: es lo que hace fácil la supresión de estrellas.

Con eso, la vía A ya no es «la chapucera»: la carga de la prueba se ha dado la
vuelta y ahora es B quien tiene que justificarse.

Preguntas que hay que cerrar:

- ¿Se acepta que el brillo superficial del difuso sea heurístico (A), o el
  objetivo exige μ calibrado (B)?
- Si A: ¿`SB_OBJ_MIN`/`SB_OBJ_MAX`/`GAMMA_HIPS` valen tal cual para una imagen
  usada como *capa difusa* y no como *placa entera*, o hay que recalibrarlas?
  ¿Contra qué ancla — el núcleo de M42 a ~17 mag/arcsec², M31 a ~22?
- ¿Banda única o color? El Canvas-2D pinta las estrellas con color de B−P; un
  difuso monocromo junto a estrellas de colores puede chirriar, o puede ser lo
  correcto (visión escotópica: el difuso por el ocular **es** gris).
- ¿La imagen entra como `Fobj` **antes** o **después** de `realzarPerceptual`?
  Esa gamma se calibró contra difuso sintético.

## Answer

**FITS lineal en banda `g`, con el nivel absoluto anclado al catálogo.** Y la
pregunta la desempató un cambio de fuente: el usuario eligió **ps1cutouts de
STScI** en vez de `hips2fits` (ficha 10), y ps1cutouts **sí trae punto cero en la
cabecera**.

### 1. El formato: FITS, no JPG

Lo que había engordado la vía B era la ausencia de `MAGZP` en `hips2fits`:
obligaba a catálogo PS1 + fotometría de apertura por campo. Con ps1cutouts eso
desaparece —`ZPT_0000…` ≈ 24,46 está en la cabecera— y de la vía B solo queda el
parser de float32, que son unas decenas de líneas.

Contra el JPG pesa además algo que solo aparece con **parche por objeto**
(ficha 10): `autoscale` normaliza **contra el propio recorte**, así que dos
galaxias del mismo campo se estirarían con escalas distintas y su brillo
relativo mentiría. Con μ absoluto eso no ocurre.

Peso: 375 KB por parche de 300² float32, ~1,1 MB a 512².

### 2. El nivel: lo pone el catálogo, no la cabecera

El `ZPT` fija la escala, pero el stack tiene su propio residuo de cielo, y a
μ ≈ 24 los DN por píxel son tan pocos que un pedestal mal restado desplaza el
brillo superficial más que cualquier error de punto cero. Así que:

1. Restar el cielo local, medido como **mediana del borde del parche**.
2. Quitar las estrellas que el render pinta (ficha 04).
3. Integrar el flujo restante y **reescalarlo a la mag V del RC3**, que ya está
   en `BITACORA_GALAXIAS`, corrigiendo por la fracción de luz que se sale del
   parche (el catálogo trae `n` y `B/T`: la corrección es analítica).

El orden importa: anclar antes de quitar estrellas mete su luz en el total y
apaga la galaxia.

Efecto secundario deseable: el sistema cierra con lo que la app ya enseña. Si la
ficha del objeto dice V = 8,02, la capa pinta esa luz, ni más ni menos. Y hace
usable cualquier fuente sin fotometría, si algún día hace falta un respaldo.

### 3. La banda: `g`, sola

Es la más cercana al pico escotópico (507 nm), la que más marca brazos y
regiones de formación estelar, y la más profunda del stack 3π (~23,3
mag/arcsec² a 5σ). `r` daría bulbo liso; `g`+`r` costaría el doble de bytes y
una petición más para afinar una constante de color que el anclaje al catálogo
vuelve irrelevante.

### 4. Dónde entra en la cadena, y el color

Como flujo sumado al `Float32Array` `difuso`, igual que ya hace
`pintarHaloGlobular` (`bitacora-ocular.js:628`); `pintarFot` lo pinta debajo de
las estrellas sin tocar nada más. **Con la gamma perceptual tal cual** (0,45):
se calibró contra difuso sintético y sobre imagen real también realza el ruido
del stack, pero cuál gana no se sabe sin mirarlo (fase 1 de la ficha 10).

**Gris.** Una sola banda, y por el ocular a esos brillos la visión es escotópica
y no hay color: teñir sería *menos* fiel, no más.

### Lo que esto acepta

El brillo superficial deja de ser heurístico, pero pasa a depender de la
fotometría del RC3, que es de 1991 y de apertura total. Y para las galaxias que
topan el parche a 20′ (M31, M33) la corrección por luz fuera del parche llega al
40–60 %: ahí el nivel es una extrapolación, no una medida.
