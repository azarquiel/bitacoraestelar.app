# 03 — Formato de la imagen y anclaje fotométrico

**Type:** grilling
**Status:** open
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

_(pendiente)_
