# Tonalidad azul de las estrellas — por qué Vega y Sirio no salen azules

Investigación del 2026-09-02. Sin cambios en código de producción.

Pregunta de partida: «¿por qué las estrellas del simulador no tienen tonalidades
azules? Sorprende no ver ese tono en Vega o Sirio».

Complementa a `color_estrellas.md`, que fija los principios; esta nota mide lo
que hace cada etapa y contrasta la tabla de color con la fuente de la que salió.

Respuesta corta: hay **tres cosas distintas solapadas**, y solo una es un
defecto real —y no es la que parecía—.

1. El modelo de color **sí** pinta azul: Vega sale `[179, 203, 255]`, croma
   0,298 — más azul, incluso, de lo que le corresponde por física.
2. En las estrellas brillantes ese azul se pierde **solo en el núcleo**: la
   tabla normaliza el canal azul a 255 y el render suma en un lienzo de 8 bits,
   así que el azul no tiene espacio de cabecera por construcción y el centro se
   recorta a blanco (croma 0,253 → 0,018). Medido después: eso **no tiene
   arreglo y no debe tenerlo** — el rescate HDR cuesta 1,8-2,6× y no cambia un
   solo píxel en pantalla, porque `pintarFot` vuelve a recortar a 8 bits
   (Parte D). El color de una estrella brillante vive en su aureola, y ahí ya
   está.
3. La tabla `GAIA_COLOR` tiene un **tramo plano** entre BP−RP −0,40 y 0,00: 34
   de las 108 estrellas del catálogo de brillantes comparten el mismo RGB byte a
   byte. Vega, Sirio, Espiga, Mimosa, Bellatrix y Régulo se pintan idénticas.
   Ese sí es un defecto de fidelidad, y tiene arreglo con cifras publicadas.

---

# Parte A — Diagnóstico en el código

## A.1 Qué BP−RP tienen Vega y Sirio, y qué RGB devuelve el módulo

Ambas viven en `simulador_ocular/resources/js/estrellas-brillantes-datos.js`
(Gaia satura por arriba y no las trae); ese fichero se concatena en `dibujar()`,
`resources/js/bitacora-gaia-render.js:2185`. Las filas son
`[RA°, Dec°, G, BP−RP, …]`.

Ejecutando el módulo real bajo Node (`resources/js/bitacora-gaia-color.js` ya
exporta por `module.exports`), con `sat = 1,4`:

| Estrella | SpT | G | BP−RP | `colorPorBpRp` | croma |
|---|---|---|---|---|---|
| Sirio | A1V | −1,456 | −0,0582 | `[179, 203, 255]` | 0,298 |
| Vega | A0V | +0,014 | −0,0456 | `[179, 203, 255]` | 0,298 |
| Régulo | B8 | +1,344 | −0,1602 | `[179, 203, 255]` | 0,298 |
| Bellatrix | B2 | +1,618 | −0,3163 | `[179, 203, 255]` | 0,298 |
| Espiga | B1V | +0,955 | −0,3560 | `[179, 203, 255]` | 0,298 |
| Mimosa | B0.5 | +1,223 | −0,3826 | `[179, 203, 255]` | 0,298 |
| Deneb | A2Ia | +1,223 | +0,1653 | `[198, 215, 255]` | 0,224 |
| Altair | A7V | +0,719 | +0,2979 | `[213, 224, 255]` | 0,165 |
| Arturo | K1.5III | −0,410 | +1,3422 | `[255, 195, 131]` | 0,486 |
| Betelgeuse | M1I | −0,596 | +2,4032 | `[255, 154, 41]` | 0,839 |

(croma = (max − min)/max, la saturación HSV; 0 = gris, 1 = color puro.)

Dos hechos, ambos reproducibles: **el módulo no devuelve blanco para Vega ni
para Sirio** —devuelve un azul pálido con el rojo 76 niveles por debajo del
azul—, y **las seis estrellas calientes reciben exactamente el mismo RGB**.

## A.2 Etapa por etapa: cuánto lava cada una

### (a) La tabla `GAIA_COLOR` y su tramo plano

`resources/js/bitacora-gaia-color.js:36`:

```js
[-0.40, 125, 153, 255], [0.00, 125, 153, 255], [0.33, 181, 194, 255],
```

Los dos primeros nodos son idénticos, y `colorPorBpRp`
(`bitacora-gaia-color.js:75-91`) interpola linealmente por tramos: todo
BP−RP ≤ 0,00 devuelve el mismo `[125, 153, 255]` lineal.

Ese valor no es arbitrario, y conviene decirlo: es **exactamente** el código de
una A0V de Harre & Heller (véase B.2), (0,49, 0,601, 1,0) × 255 = (125, 153,
255). El nodo de 0,00 es correcto. **El que falta es el otro**: el de −0,40
debería llevar el código de una B temprana, no el de una A0V. Ver C.2.

### (b) `aplicarGamma` / `sRGBenc` — la etapa que más croma quita, y es correcta

`bitacora-gaia-color.js:52-69`. Para BP−RP ≤ `config.gammaHasta` (0,9) se aplica
gamma sRGB completa:

```
tabla     [125,0  153,0  255,0]   croma 0,510
+gamma    [185,9  203,4  255,0]   croma 0,271   (−47 %)
+sat 1,4  [179,0  203,0  255,0]   croma 0,298   (+10 %)
```

Quita el 47 % del croma nominal y aun así **no es un bug: es obligatoria**. El
paper publica «digital *linear* RGB color code» (B.2), y un monitor sRGB espera
valores codificados. Quitar la gamma para «recuperar» azul sería un error de
colorimetría. De hecho el módulo ya pinta a Vega *más* azul que la física: 0,298
frente a 0,184 de una conversión cuerpo negro de 9600 K a sRGB con D65.

### (c) `saturar()` y el efecto Purkinje — exonerada en las brillantes

`bitacora-gaia-color.js:45-49`, con `colorEstrella()` / `fraccionFlujo()` en
`bitacora-gaia-render.js:1457-1483`: `sat = 1 + (1,4 − 1)·f`, con
`f = (alfaAureola/aureolaAlfaMax)^0,35`.

Vega y Sirio topan en `aureolaAlfaMax` = 0,35 con cualquier apertura razonable,
luego **f = 1,000 y sat = 1,40: saturación completa**. Esta etapa no les quita
nada; les añade un 10 % de croma. Sí muerde en el campo ordinario (una B9 de
magnitud 7 con 200 mm: f = 0,193, sat = 1,08), y ahí es deliberado
(`color_estrellas.md`, principio 8) y físicamente defendible (B.4).

### (d) `margenColorMag` — no toca a las brillantes

`bitacora-gaia-render.js:756` y `:2189`: `magColorEfectivo = mlim − 4,5`, y el
color se aplica solo si `g < magColorEfectivo` (`:2266-2267`); si no, blanco.

La condición es `g <` —magnitud menor, estrella más brillante—, así que **el
umbral blanquea las débiles, nunca las brillantes**. Vega (G = 0,01) lo pasa con
cualquier mlim. Exonerada para la pregunta.

Efecto secundario que sí conviene anotar: toda estrella en la franja
`mlim − 4,5 < g < mlim` se pinta **blanco puro**, no un color desaturado. Es un
corte duro dentro de un modelo por lo demás continuo —la saturación de (c) ya
desvanece sola hacia el neutro—; es la razón de que el grueso de un campo pobre
salga acromático.

### (e) `CFG.tinteNucleo` — estética, y secundaria

`bitacora-gaia-render.js:756` (`tinteNucleo: 0.8`) y `dibujarEstrellaColor()`
(`:1485-1487`): el stop central del gradiente es `255 + 0,8·(color − 255)`, o
sea 80 % color + 20 % blanco.

```
color   [179, 203, 255]  croma 0,298
centro  [194, 213, 255]  croma 0,239   (−20 %)
```

Moderado, y —importante— **no es la causa del blanco**: con `tinteNucleo = 1,0`,
sin blanqueo alguno, el píxel central se queda en croma 0,077. Sigue siendo
blanco a ojo.

### (f) El blending aditivo y el recorte a 8 bits — el culpable dominante

`dibujar()` pinta con `ctx.globalCompositeOperation = 'lighter'`
(`bitacora-gaia-render.js:2228`) sobre un lienzo que se lee con `getImageData`
(`:2306-2315`): **8 bits por canal, recorte duro a 255**. Y `CFG.hdrRescate` es
`false` (`:919`), así que la segunda pasada atenuada de `capaEstrellas()`
(`:2317-2342`), diseñada exactamente para rescatar núcleos recortados, no corre.

Para Vega con 200 mm y mlim 13,5 el píxel central acumula la aureola
(`globalAlpha` = 0,350, stop 0 con α = 0,9) y encima el núcleo
(`globalAlpha` = 1,0, stop 0 con α = 1):

```
suma aditiva   [250,4  276,9  335,3]   croma 0,253
RECORTE 8 bits [250,4  255,0  255,0]   croma 0,018   ← −93 %
```

Ahí está el blanco. Verde y azul topan en 255; el rojo no llega.

Y la causa es estructural. **La tabla normaliza a canal máximo = 255** —así se
publica el código de color: el canal dominante vale 1,0 (B.2)— de modo que el
azul vale 255 para toda estrella con BP−RP < 0,82. En un compositor aditivo eso
significa que el canal azul **no tiene espacio de cabecera por construcción**:
cualquier luz que se sume sobre el núcleo solo puede subir rojo y verde, es
decir, solo puede empujar hacia el blanco:

| `tinteNucleo` | píxel central tras recorte | croma |
|---|---|---|
| 0,80 (producción) | `[250,4, 255, 255]` | 0,018 |
| 0,90 | `[243,4, 255, 255]` | 0,046 |
| 0,95 (el del carbono) | `[239,4, 255, 255]` | 0,061 |
| 1,00 (sin blanqueo) | `[235,4, 255, 255]` | 0,077 |

El recorte del azul ocurre en `α_stop ≥ 0,685` **independientemente de
`tinteNucleo`**, porque el azul del color vale ya 255.

Tiene extensión acotada. Perfil radial del disco de Vega
(`dCore = 1/(1+blur)² = 0,227`, blur = 1,10):

| r / Rtot | píxel de lienzo | croma |
|---|---|---|
| 0,000 | `[250,4, 255,0, 255,0]` | **0,018** |
| 0,125 | `[217,5, 246,6, 255,0]` | 0,147 |
| 0,227 (`dCore`) | `[163,8, 185,7, 233,3]` | **0,298** |
| 1,000 | `[56,4, 63,9, 80,3]` | 0,298 |

**El color sobrevive intacto en todo el disco salvo en el 4 % central de su
área — que es justo el 100 % de lo que el ojo mira.** Una Vega bien
representada es un punto blanco dentro de un halo azul pálido; lo que se lee es
el punto. Los spikes (`dibujarSpikes`, `:1218-1235`) lo agravan en telescopios
con araña: van teñidos del color de la estrella (correcto, principio 11) pero se
suman encima, ensanchando la zona recortada.

### (g) `pintarFot` y la adaptación local — casi neutros

`pintarFot` (`:595-682`) y `valorDeFlujo` (`:513-518`) son inversas exactas
cuando `FcieloPintado == Fref`; fuera de ahí el efecto es un desplazamiento
igual en los tres canales. Medido sobre el mismo perfil (200 mm, pupila 2 mm):
sqm 21,0 → croma 0,293 en `dCore`; sqm 21,5 → 0,282; sqm 19,5 → 0,324. ±0,03,
ruido frente al −0,28 del recorte. `adaptacionLocal` suma su delta por igual a
los tres canales (`:669-676`), deliberadamente.

### Resumen de culpables

| etapa | Δcroma en Vega | ¿física o estética? |
|---|---|---|
| tabla → gamma sRGB | 0,510 → 0,271 | **física, obligatoria** |
| `saturar(1,4)` | 0,271 → 0,298 | estética, a favor del azul |
| `fraccionFlujo` (Purkinje) | sin efecto (f = 1) | física, exonerada aquí |
| `margenColorMag` | sin efecto | ley, exonerada aquí |
| `tinteNucleo` 0,8 | 0,298 → 0,239 | estética, secundaria |
| **recorte aditivo 8 bits** | **0,253 → 0,018** | **artefacto del render** |
| `pintarFot` + adaptación | ±0,03 | neutro |

## A.3 La hipótesis «no hay bug: Vega es el cero de BP−RP»

Contrastada, y es **medio cierta**.

Cierto: el sistema fotométrico de Gaia está anclado a Vega (B.1), una A0V queda
en BP−RP ≈ 0 y una A0V es blanco-azulada, no azul.

Pero no explica lo que se ve, por dos motivos medidos:

1. El modelo no pinta blanco a Vega: pinta croma 0,298, *más* azul que la
   conversión física de 9600 K. El azul se pierde **después** del módulo de
   color, no dentro.
2. Las estrellas donde el azul sí es real —las B tempranas— se pintan
   **idénticas a Vega**. El simulador no puede enseñar «azul de verdad» porque
   no distingue una B0 de una A0.

Corolario: la pregunta tiene dos respuestas ciertas a la vez — «Vega es
blanco-azulada por física, no esperes azul» **y** «el render la pinta más blanca
de lo que el propio modelo pide, y además no diferencia una B0 de una A0».

---

# Parte B — La física, contra fuentes primarias

## B.1 BP−RP está anclado a Vega por construcción

La documentación de Gaia DR3, §5.4.1 (*Photometric processing → Calibration*),
describe «the steps followed to compute zero points in the VEGAMAG and AB
systems». El espectro de referencia es `alpha_lyr_mod_002.fits` de la base
CALSPEC, reescalado para que en λ = 550,0 nm el flujo sea
3,62286 × 10⁻¹¹ W m⁻² nm⁻¹, adoptando V = 0,023 para Vega (Bohlin 2007), con la
banda V de Bessell & Murphy (2012). Puntos cero VEGAMAG: G = 25,6874,
G_BP = 25,3385, G_RP = 24,7479 (± 0,0028).

- <https://gea.esac.esa.int/archive/documentation/GDR3/Data_processing/chap_cu5pho/cu5pho_sec_photProc/cu5pho_ssec_photCal.html>
- Riello et al. (2021), *Gaia EDR3: Photometric content and validation*, A&A 649, A3, §7 — <https://doi.org/10.1051/0004-6361/202039587>

**Consecuencia directa para la pregunta:** una A0V sin enrojecer tiene BP−RP ≈ 0
porque el cero *es* una A0V. En la tabla empírica de secuencia principal de
Mamajek (versión en línea de Pecaut & Mamajek 2013) la A0V figura con
Bp−Rp = −0,037 y Teff = 9700 K; el repo trae Vega en −0,0456 y Sirio (A1V) en
−0,0582. Coherente.

- <https://www.pas.rochester.edu/~emamajek/EEM_dwarf_UBVIJHK_colors_Teff.txt>
- Pecaut & Mamajek (2013), ApJS 208, 9 — <https://doi.org/10.1088/0067-0049/208/1/9>

Detalle que importa para C.2: esa tabla **solo da Bp−Rp hasta B9V** (−0,120).
Para las B más tempranas no hay columna Gaia publicada ahí —Gaia satura en las
estrellas brillantes—, así que el anclaje de los nodos fríos-calientes hay que
hacerlo por tipo espectral → Teff → color, no por Bp−Rp tabulado.

## B.2 El camino correcto es espectro → CIE XYZ → sRGB, y los códigos son lineales

Harre & Heller (2021), *Digital color codes of stars*, Astron. Nachr. 342, 578
(DOI [10.1002/asna.202113868](https://doi.org/10.1002/asna.202113868); preprint
[arXiv:2101.06254](https://arxiv.org/abs/2101.06254)), es la fuente de los nodos
de `GAIA_COLOR` (`color_estrellas.md`, principio 3). Su §2.2 declara el método:
espectros sintéticos PHOENIX (y TLUSTY para las calientes) convolucionados con
las funciones de igualación de color (CMF) de 2°, transformadas de los
fundamentos de conos LMS CIE 2006 (Stockman & Sharpe 2008), entre 360 y 830 nm,
con el módulo `color_system.py` de Christian Hill.

Dos precisiones que gobiernan todo lo demás:

- Los códigos publicados son **RGB lineal**: el paper habla literalmente de
  «digital *linear* RGB color code» al citar sus propios resultados. Justifica
  la gamma de A.2(b).
- Están **normalizados a canal máximo = 1,0**: en toda la tabla el azul vale
  exactamente `1.0` de la F9.5 hacia arriba. Justifica —y condena— el recorte
  de A.2(f): el código de color no lleva información de brillo, solo de tono.

Valores del artículo (Tabla 5 y datos en Zenodo
[10.5281/zenodo.4090873](https://doi.org/10.5281/zenodo.4090873),
`results_Z-0.txt`, log g = 4,0, Z = 0):

| SpT | Teff | RGB lineal (0–1) | ×255 | hex |
|---|---|---|---|---|
| G2V | 5800 | 1,0 / 0,937 / 0,915 | (255, 239, 233) | `#ffeee9` |
| F0V | 7200 | 0,725 / 0,773 / 1,0 | (185, 197, 255) | `#b8c5ff` |
| **A0V** | **9600** | **0,49 / 0,601 / 1,0** | **(125, 153, 255)** | `#7d99ff` |
| B9V | 10600 | 0,463 / 0,578 / 1,0 | (118, 147, 255) | `#7693ff` |
| B8V | 12000 | 0,446 / 0,562 / 1,0 | (114, 143, 255) | `#718fff` |
| B2V | 20000 | 0,394 / 0,52 / 1,0 | (100, 133, 255) | `#6484ff` |
| B1V | 26000 | 0,376 / 0,505 / 1,0 | (96, 129, 255) | `#5f80ff` |
| B0.5V | 29000 | 0,368 / 0,498 / 1,0 | (94, 127, 255) | `#5d7fff` |
| O5V | 40000 | 0,358 / 0,486 / 1,0 | (91, 124, 255) | `#5b7bff` |
| O1V | 55000 | 0,361 / 0,489 / 1,0 | (92, 125, 255) | `#5c7cff` |

El nodo `[125, 153, 255]` del repo **es** la A0V del paper. Está bien puesto.

Dos leyes se leen de la propia tabla:

- **El azul satura.** De B2 hacia arriba el color apenas cambia: entre 20 000 K
  y 55 000 K el rojo solo baja de 0,394 a 0,358. Más allá de B2, subir Teff casi
  no aporta azul. Es física de la visión, no del render: el pico de Planck ya
  está en el ultravioleta y lo que varía dentro del visible es solo la pendiente
  del extremo de Rayleigh-Jeans.
- **No existe el azul saturado estelar.** El máximo azul posible de una estrella
  es (0,358, 0,486, 1,0) — un azul claro, con la mitad del canal verde
  encendido. El paper lo resume así: «there are no yellow, green, cyan, or
  purple stars», y las M «actually look orange to the human eye». Vega,
  a 9600 K, está lejos incluso de ese techo.

## B.3 El punto blanco: por qué «azul» es una afirmación relativa

`color_system.py` opera con las primarias sRGB y su blanco D65 (≈ 6500 K), y
lleva un `constrain_rgb` que, cuando el color queda fuera de gama, le añade
blanco hasta meterlo dentro. Dos consecuencias:

- El color publicado de Vega es azul **porque el blanco de referencia es D65**,
  más frío que Vega no lo es nadie: 9600 K contra 6500 K. Con blanco de
  referencia igual a la propia Vega —el criterio implícito del observador
  adaptado al ocular— Vega sería, por definición, blanca.
- El techo de B.2 no es solo del espectro: parte de él es la **gama sRGB**. El
  azul de una B0 real cae fuera del triángulo sRGB y se desatura hacia dentro.
  Ningún monitor sRGB puede enseñar el azul de una B0; el simulador no es la
  excepción.

Que la percepción del color de un estímulo depende del blanco al que el ojo está
adaptado es la definición misma de adaptación cromática (CIE, vocabulario
internacional de iluminación; el modelo estándar es CIECAM02/CIECAM16). Aplicado
a esto: **al ocular, con el ojo adaptado a la oscuridad y sin ningún blanco de
referencia en el campo, no hay un «color verdadero» absoluto que reclamar.**

- <https://cie.co.at/e-ilv> (ILV: adaptación cromática)
- Stockman & Sharpe (2008), fundamentos de conos CIE 2006 — <http://cvrl.ucl.ac.uk>

## B.4 Purkinje y el umbral de color: por qué desaturar con el brillo es correcto

CIE 191:2010, *Recommended System for Mesopic Photometry Based on Visual
Performance* (sistema MES2), define la región mesópica entre 0,005 y 5,0 cd/m²
mediante un coeficiente de adaptación `m`: `m = 1` (fotópico puro) a partir de
5 cd/m², `m = 0` (escotópico puro) por debajo de 0,005 cd/m². En esa región la
eficiencia luminosa espectral se desplaza hacia el azul conforme baja el nivel
—el desplazamiento de Purkinje— y los bastones, que no dan color, van tomando
el relevo de los conos.

- <https://cie.co.at/publications/recommended-system-mesopic-photometry-based-visual-performance>

Es exactamente lo que modela `fraccionFlujo` (A.2.c): las débiles pierden color
porque su iluminancia retiniana cae por debajo del umbral de los conos. La
consecuencia práctica es la contraria a la intuición del observador: **el color
de una estrella al ocular depende sobre todo de su brillo, no de su
temperatura**. Vega y Sirio son de las poquísimas que superan el umbral con
holgura; por eso son justo las que *deberían* enseñar tinte, y por eso duele que
sean las que el recorte de A.2(f) blanquea.

Matiz que el modelo actual no recoge y que el propio Purkinje sugiere: a igual
magnitud, una estrella azul conserva más señal escotópica que una roja, porque
el desplazamiento va hacia el azul. Hoy `fraccionFlujo` es acromática — misma
desaturación para una B9 y para una M5 de la misma magnitud. Es una
simplificación, no un error, y no afecta a la pregunta planteada.

---

# Parte C — Recomendación

## C.1 Qué es física y no se toca

- El azul **pálido** de una A0V es correcto (B.1, B.2). Vega es
  blanco-azulada; croma ~0,2-0,3 es el resultado esperado.
- La gamma sRGB de `aplicarGamma` es obligatoria: los códigos del paper son
  lineales (B.2).
- La desaturación con el brillo (`fraccionFlujo`) modela un fenómeno real
  (B.4).
- El techo de azul de B.2 es infranqueable: ni el espectro ni la gama sRGB dan
  más. Cualquier azul por encima de (91, 124, 255) lineal sería invención.

## C.2 El defecto de fidelidad real: un nodo mal puesto

**`resources/js/bitacora-gaia-color.js:36`** — los nodos `-0.40` y `0.00`
comparten valor, y con ello todo el extremo caliente colapsa a un color. El de
`0.00` es correcto (es la A0V del paper); el de `-0.40` no debería serlo.

Anclando por tipo espectral → Teff (Pecaut & Mamajek 2013) → RGB lineal
(Harre & Heller 2021, B.2), con los BP−RP que el propio catálogo de brillantes
trae para cada estrella:

| ancla | SpT | BP−RP (repo) | Teff (P&M) | RGB lineal (H&H) |
|---|---|---|---|---|
| Mimosa | B0.5V | −0,383 | 29 000 | (94, 127, 255) |
| Espiga | B1V | −0,356 | 26 000 | (96, 129, 255) |
| Bellatrix | B2V | −0,316 | 20 600 | (100, 133, 255) |
| Régulo | B8V | −0,160 | 12 300 | (113, 143, 255) |
| Vega | A0V | −0,046 | 9 700 | (125, 153, 255) |

Sale una curva monótona y suave, y no hacen falta nodos nuevos: basta con
corregir el valor del que ya existe en −0,40. La interpolación lineal entre
−0,40 y 0,00 reproduce las tres anclas intermedias con ≤1 nivel de error.

**APLICADO** (`resources/js/bitacora-gaia-color.js:36`):

```js
[-0.40,  94, 127, 255], [0.00, 125, 153, 255], [0.33, 181, 194, 255],
```

Colores resultantes, con la saturación de producción (1,4):

| estrella | BP−RP | antes | ahora | croma |
|---|---|---|---|---|
| Mimosa B0.5 | −0,383 | `[179, 203, 255]` | `[155, 188, 255]` | 0,298 → 0,392 |
| Espiga B1V | −0,356 | `[179, 203, 255]` | `[157, 189, 255]` | 0,298 → 0,384 |
| Bellatrix B2 | −0,316 | `[179, 203, 255]` | `[159, 191, 255]` | 0,298 → 0,376 |
| Régulo B8 | −0,160 | `[179, 203, 255]` | `[169, 197, 255]` | 0,298 → 0,337 |
| Sirio A1V | −0,058 | `[179, 203, 255]` | `[175, 201, 255]` | 0,298 → 0,314 |
| Vega A0V | −0,046 | `[179, 203, 255]` | `[176, 201, 255]` | 0,298 → 0,310 |

Vega y Sirio se mueven 3-4 niveles porque están a la izquierda del nodo de 0,00
y ahora interpolan hacia uno más azul. Es ruido frente al cambio de las B, y no
merece mover el nodo a −0,037 para evitarlo: sería ajustar la tabla a una
estrella.

Y llega a pantalla. Aureola pintada a 6 px del centro (200 mm, sqm 21, 40′),
donde antes las tres eran idénticas byte a byte:

| estrella | píxel | croma |
|---|---|---|
| Vega | `[27, 31, 38]` | 0,289 |
| Mimosa | `[43, 50, 61]` | 0,295 |
| Espiga | `[41, 48, 60]` | 0,317 |

Dorados rehechos en `scripts/test_gaia_color.js`: los dos valores de −0,40 y
0,00, más una fila nueva para −0,16 (Régulo) y un invariante estructural que
caza la regresión de raíz —«una B temprana es más azul que una A0V»—, que es lo
que ningún test comprobaba. `scripts/test_blur_color_absoluto.js` no necesitó
cambios: compara contra el propio módulo, no contra literales.

Efecto que conviene decir alto: **esto no hace a Vega más azul**. Lo que hace es
que Espiga, Mimosa y Bellatrix dejen de ser sus clones.

## C.3 Si lo que se quiere es *ver* el azul (esto es estética, no física)

El azul existe y está bien calculado; falla que el ojo lo busca en el núcleo y el
núcleo está recortado (A.2.f). Las palancas candidatas eran las que devuelven
espacio de cabecera al canal azul:

1. **Activar `CFG.hdrRescate`** (`bitacora-gaia-render.js:919`, hoy `false`).
   Parecía la única que ataca la causa. **Medida y descartada: coste 1,8-2,6×,
   beneficio nulo.** Ver la Parte D.
2. **Subir `CFG.tinteNucleo`** hacia 0,95 (como ya se hizo con
   `tinteNucleoCarbono`). Una línea y un dorado, pero el techo medido es croma
   0,061: alivio cosmético, no solución.
3. **Bajar el pico del núcleo** (`alfaEstrella` 1,0 → 0,8 lleva el centro de
   0,018 a 0,170). Funciona, pero apaga la estrella: es recalibrar el brillo del
   campo entero. Mal negocio.
4. **Bajar `CFG.aureolaAlfaMax`** (hoy 0,35). La menos recomendable:
   `aureolaAlfaK/Max` están calibradas contra Albireo y contra el aspecto de
   Sirio y Vega.

**Recomendación operativa, tras medir:** no tocar ninguna de las cuatro. El
núcleo blanco de una estrella brillante **no tiene arreglo por esta vía** y
probablemente no debe tenerlo (D.3). Queda C.2, que es independiente, es
fidelidad y sí merece la pena.

Lo que **no** hay que hacer: subir `config.saturacion` por encima de 1,4. Es
palanca global compartida con el mapa (principio 14), actúa *antes* del recorte
—así que no lo arregla— y enrojecería aún más las M, ya en croma 0,84-0,95.

## C.4 Guardián sugerido

Si se toca cualquiera de las palancas de C.3, el invariante a fijar no es un RGB
sino el **croma del píxel central** de una estrella brillante. Hoy vale 0,018. Un
test que lo mida sobre el perfil analítico —sin canvas: las fórmulas de
`dibujarAureola` y `dibujarEstrellaColor` son cerradas— cazaría cualquier
regresión sin depender del navegador.

---

# Parte D — Medición de `hdrRescate`: descartado

Medido el 2026-09-02 con el módulo real en Chrome headless (`--disable-gpu`,
lienzo por software), llamando a `capaEstrellas` y a `pintarFot` directamente.
Campo de 40′, mlim 13,5, apertura 200 mm, sqm 21,0, pupila de salida 2 mm.
Medidas intercaladas off/on, 15 repeticiones, mediana y mínimo.

## D.1 El coste: entre 1,8× y 2,6×

| lienzo | campo | off (mín) | on (mín) | Δ | factor | 1 pasada |
|---|---|---|---|---|---|---|
| 720 px | 300 estrellas | 12,3 ms | 28,5 ms | +16,2 ms | 2,32× | 4,5 ms |
| 720 px | 1500 estrellas | 12,3 ms | 32,3 ms | +20,0 ms | 2,63× | 9,0 ms |
| 720 px | 6000 estrellas | 34,0 ms | 62,0 ms | +28,0 ms | 1,82× | 30,5 ms |
| 1440 px | 300 estrellas | 24,0 ms | 50,4 ms | +26,4 ms | 2,10× | 10,0 ms |
| 1440 px | 1500 estrellas | 32,7 ms | 60,0 ms | +27,3 ms | 1,83× | 18,3 ms |
| 1440 px | 6000 estrellas | 64,6 ms | 145,9 ms | +81,3 ms | 2,26× | 51,0 ms |

Coincide con lo que dice el comentario del propio flag: un render completo más
un `getImageData` extra. El sobrecoste es **por llamada a `capaEstrellas`**, y en
un campo con galaxia hay dos —`vistaGaia` (`:2442`) y `ps1CapaGalaxias`
(`bitacora-ps1.js:1991`)—, así que ahí se paga dos veces. Es coste por
re-render, no por cuadro de animación.

## D.2 El beneficio: nulo

La capa intermedia sí mejora. En el núcleo de Vega, lo que devuelve
`capaEstrellas`:

| | píxel del núcleo | croma |
|---|---|---|
| off | `[232, 255, 255]` | 0,090 |
| on | `[240, 272, 304]` | **0,211** |

Pero eso **no llega a la pantalla**. Pasando la misma capa por `pintarFot` y
leyendo el píxel final del lienzo:

| r del núcleo | off | on |
|---|---|---|
| 0 px | `[255, 255, 255]` croma 0,000 | `[255, 255, 255]` croma **0,000** |
| 2 px | `[253, 255, 255]` croma 0,008 | `[254, 255, 255]` croma 0,004 |
| 4 px | `[136, 147, 173]` croma 0,214 | `[136, 147, 173]` croma 0,214 |

Idéntico. Barrido sobre campos completos, contando solo píxeles de estrella
(luminancia ≥ 40 DN):

| escena | píxeles | recortados | croma medio off | croma medio on | píxeles con +0,02 |
|---|---|---|---|---|---|
| mag 8-11 (1500) | 18 059 | 148 | 0,1105 | 0,1105 | 0 |
| mag 5-8 (400) | 18 795 | 2 727 | 0,2756 | 0,2754 | 1 |
| mag 1-4 (30) | 10 265 | 716 | 0,3407 | 0,3405 | 43 |
| mag 11-14 (6000) | 20 125 | 0 | 0,0000 | 0,0000 | 0 |

**El croma medio es idéntico a la cuarta cifra en todos los regímenes.** En el
mejor caso —treinta estrellas de magnitud 1-4— mejoran 43 píxeles de 10 265.

## D.3 Por qué: un techo compartido, y un realce que quema

Dos causas distintas, y conviene no confundirlas.

**Primera: el techo de la capa de estrellas y el de la pantalla son el mismo.**
La capa entra en `pintarFot` con `flujoDeValor(v, c.Fref, c.rango)` —contra el
cielo de REFERENCIA, sqm 21— y sale con
`valorDeFlujo(F, c.FcieloPintado, c.rango)` (`:657`). Cuando la escena es de sqm
21, `FcieloPintado == Fref` y las dos son inversas exactas: `DN = nivelFondo + v`.
El 255 de la capa de estrellas *es* el 255 de la pantalla, así que en el cielo de
referencia `hdrRescate` no puede notarse por construcción. No hay dos techos: hay
uno. (`rango = FOT.SB_NEGRO − FOT.SB_BLANCO = 11,5 mag`: los 0-255 de pantalla
son 11,5 magnitudes.)

**Segunda, y es la que manda con cualquier cielo: `adaptacionLocal`.** La curva
de tono, por sí sola, **no** blanquea el núcleo. Trazando el píxel central de
Vega paso a paso:

| escena | tras la curva de tono | croma | realce local | tras adaptación | pantalla |
|---|---|---|---|---|---|
| sqm 18,5 off | [210,6, 233,6, 233,6] | **0,098** | +86,0 DN | [296, 319, 319] | [255,255,255] |
| sqm 18,5 on | [218,6, 250,6, 282,6] | **0,143** | +98,3 DN | [317, 349, 381] | [255,255,255] |
| sqm 21,0 off | [237,0, 260,0, 260,0] | 0,071 | +108,2 DN | [345, 368, 368] | [255,255,255] |
| sqm 21,0 on | [245,0, 277,0, 309,0] | 0,039 | +120,5 DN | [366, 398, 430] | [255,255,255] |

La curva de tono deja el núcleo **con color** —croma 0,07 a 0,14—. Quien lo
blanquea es `adaptacionLocal` (`:420-427`), que le suma entre **+86 y +120 DN**,
hasta el 47 % de toda la escala, como
`realceDetalle(lum − desenfocar(lum, SIZE/60), 0,5)`.

Y desatura dos veces. El realce se calcula sobre la luminancia y se suma igual a
los tres canales (`:673-676`), a propósito, «para no desviar el color». Pero un
sumando igual δ baja el croma aunque no recorte —`(max−min)/(max+δ)`— y después
todo lo que pasa de 255 colapsa al mismo valor. La intención de no torcer el
tono se cumple; la de conservar la saturación, no.

Nótese además que a sqm 21 `hdrRescate` **empeora** el croma antes de recortar
(0,071 → 0,039): sube más el azul, que es justo el canal que ya rebasaba el techo.

## D.4 Qué de esto es inevitable

- **El destino de 8 bits, sí.** `pintarFot` acaba en `createImageData` →
  `Uint8ClampedArray` → `putImageData`; la pantalla es sRGB de 8 bits. Canvas
  admite `colorSpace: 'display-p3'`, pero eso ensancharía la gama, no el techo.
- **La curva logarítmica sobre 11,5 mag, también.** Es compresión de rango
  dinámico bien planteada, no un recorte ingenuo.
- **El realce local sobre un núcleo puntual, no.** `realceDetalle` se calibró
  para detalle EXTENSO —su comentario habla de anillos concéntricos en el halo de
  un cúmulo— y `UMBRAL_DETALLE = 12` está puesto para no amplificar ruido de
  fondo. En el pico de una estrella no hay detalle que realzar, y sí color que
  quemar.

Candidato mínimo, si algún día se ataca: **recortar proporcional en vez de por
canal** — escalar la terna para que el máximo caiga en 255, en lugar de tres
`Math.min(255, ·)` independientes. Con `[345, 368, 368]` daría `[239, 255, 255]`,
croma 0,063, en vez de blanco puro. Una línea en el bucle de salida, sin tocar
ninguna calibración. No evaluado ni contra los dorados ni contra el aspecto del
campo.

Con todo, la conclusión práctica de la pregunta de partida no cambia: **el color
de una estrella brillante vive en su aureola**, y ahí ya está —croma 0,214 a 4 px
del centro—. Y lo que el simulador puede mejorar de verdad sigue siendo C.2: que
Espiga y Mimosa dejen de ser clones de Vega.

## D.5 Hallazgo colateral

La fila de mag 11-14 sale con croma **0,0000 exacto**: ninguna de esas estrellas
recibe color. Es `margenColorMag` (A.2.d) actuando — con mlim 13,5 el umbral cae
en magnitud 9,0 y todo lo más débil se pinta blanco puro. En un campo típico,
donde el grueso de las estrellas está bastante por debajo del umbral, **esa es
la mayor pérdida de color del simulador, no el recorte del núcleo**. El corte es
duro (blanco puro, no desvanecido), aunque la saturación por flujo de A.2(c) ya
sabría desvanecerlo sola. Merece revisión propia; no se toca aquí.

---

## Reproducibilidad

Los números de la Parte A salen de ejecutar el módulo real bajo Node y de aplicar
las fórmulas leídas del render. Los de la Parte B, de `results_Z-0.txt` del
Zenodo del paper y de la tabla de Mamajek, ambos descargados y consultados
directamente. Guardianes existentes, verdes hoy:

```
node scripts/test_gaia_color.js           # dorados del módulo de color
node scripts/test_blur_color_absoluto.js  # blur, umbral de color y Purkinje
```

## Fuentes

- Gaia DR3 Documentation §5.4.1, *Calibration* — <https://gea.esac.esa.int/archive/documentation/GDR3/Data_processing/chap_cu5pho/cu5pho_sec_photProc/cu5pho_ssec_photCal.html>
- Riello et al. (2021), A&A 649, A3 — <https://doi.org/10.1051/0004-6361/202039587>
- Harre & Heller (2021), Astron. Nachr. 342, 578 — <https://doi.org/10.1002/asna.202113868> · datos: <https://doi.org/10.5281/zenodo.4090873> · código `spec2col`: <https://github.com/janvincentharre/spec2col>
- Pecaut & Mamajek (2013), ApJS 208, 9 — <https://doi.org/10.1088/0067-0049/208/1/9> · tabla viva: <https://www.pas.rochester.edu/~emamajek/EEM_dwarf_UBVIJHK_colors_Teff.txt>
- Stockman & Sharpe (2008), fundamentos de conos CIE 2006 — <http://cvrl.ucl.ac.uk>
- CIE 191:2010, *Recommended System for Mesopic Photometry* — <https://cie.co.at/publications/recommended-system-mesopic-photometry-based-visual-performance>
- CIE ILV, adaptación cromática — <https://cie.co.at/e-ilv>
