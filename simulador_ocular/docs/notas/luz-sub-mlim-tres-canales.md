# La luz de las estrellas que el ojo no separa: los tres canales del render

Fecha: 2026-09-19. Estado: descripción del código en `main` a día de hoy, más
dos medidas propias: el reparto entre canales (§4 bis) y el halo de M13 a 514×
(§4 ter). No propone cambios: es el
mapa previo a tocar esta capa.

Responde a la pregunta «¿cómo representamos hoy el halo de fondo de las
estrellas más débiles que la magnitud límite, la funcionalidad que nació para
los cúmulos abiertos y que también aparece en globulares y en campos ricos de
la Vía Láctea?».

La respuesta corta: **no es una funcionalidad, son tres**, y cada una vive en un
sitio distinto del pipeline. Comparten el mismo invariante de conservación (la
luz catalogada no puede desaparecer porque el equipo no la resuelva), pero
tienen leyes, unidades y consumidores diferentes. Tocar una no toca las otras, y
cambiar el reparto entre ellas es lo que sí rompe cosas.

Convención de citas: `fichero:línea` sobre el estado actual del repo; las líneas
se han verificado al escribir esta nota.

---

## 1. El invariante: dónde va la luz de cada estrella

Toda la fotometría del Canvas-2D sale del mismo catálogo (Gaia DR3 vía proxy) y
cada estrella acaba en **uno** de cuatro canales, según su magnitud `g` frente a
la magnitud límite del equipo `mlim` y frente a la profundidad de consulta:

| Banda | Destino | Dónde se decide |
|---|---|---|
| `g ≤ mlim` | estrella dibujada (sprite con su alfa) | `dibujar()`, `bitacora-gaia-render.js:2400` |
| `mlim < g ≤ mlim + 2,30` | *glow*: sprite muy tenue, alfa decreciente | `dibujar()`, corte en `:2469-2472` |
| `mlim + 2,30 < g ≤ magConsulta` | **niebla difusa** (ADR 0022) | `nieblaCampo()`, `:1030` |
| `g > magConsulta` (banda truncada por el TAP) | **velo uniforme** = cielo extra (ADR 0014) | `veloSB()`, `:717` |

La cola de glow vale 2,30 mag y no es una constante suelta: sale de
`colaGlowMag()` (`:961`) como `−2,5·log₁₀(glowCorte/alfaMin)` con
`alfaMin = 0,05` (`:821`) y `glowCorte = 0,006` (`:892`). Cambiar cualquiera de
los dos mueve la frontera glow/niebla.

Los cortes son disjuntos por construcción, y eso es deliberado: la misma luz
contada dos veces es el fallo clásico de esta capa.

**Caso aparte: los cúmulos globulares.** Cuando el objeto es un globular con
ficha de Harris, la niebla **no** se ejecuta. La población sub-resolución la
conserva el modelo de cúmulo (`S1campo`/`S2campo`, `bitacora-cumulos.js:270`),
que ya incluye toda la función de luminosidad por debajo de `m_res`; sumarle el
catálogo encima sería doble conteo. La guarda es literal: `if (!cum)` en
`vistaGaia`, `bitacora-gaia-render.js:2660`.

---

## 2. Canal A — la niebla de campo ordinario (`nieblaCampo`)

Es la funcionalidad por la que pregunta el encargo. Nació para el fondo nebuloso
de los cúmulos abiertos ricos (M11, NGC 7789) y se ejecuta en **todo campo
ordinario**: un abierto, un campo de Vía Láctea, o un campo vacío (donde
simplemente no deposita casi nada).

### Qué hace

`resources/js/bitacora-gaia-render.js:1030-1079`.

```
corte   = o.mlim + colaGlowMag()                       (:1037)
thSky   = thetaRiccoArcmin(ctx.SBe) / aumentos         (:1018)  arcmin de CIELO
hPx     = (thSky/60) · px_por_grado                    (:1036)  semiancho del núcleo
para cada estrella con g > corte y dentro del lienzo:
    f      = 10^(−0,4·g)
    total += f                                         (:1057)  flujo REAL devuelto
    f     *= FOT.NIEBLA_GANANCIA_ESTETICA              (:1059)  parche estético
    reparto en núcleo TIENDA separable de semiancho hPx,
    pesos normalizados por eje → flujo por arcsec²     (:1064-1075)
o.thetaJuicioArcmin = max(thSky, R50 del flujo)        (:1077, :1088)
```

Tres decisiones de diseño que no son obvias:

- **Núcleo tienda, no rejilla de celdas.** Una rejilla pinta cuadrados de borde
  duro y fase arbitraria, y ese escalón sí es estructura visible (comentario en
  `:1001`). El núcleo es separable y sus pesos se normalizan por eje, así que el
  flujo se conserva exacto incluso cuando la tienda se sale del lienzo: lo que
  sobresale se reparte hacia dentro (`:1060-1063`).
- **La escala de suavizado es física, no un parámetro de aspecto**: θ_R(SBe)/M,
  el área de Riccò proyectada al cielo. Por debajo de ella el ojo no resuelve
  estructura, así que suavizar ahí no borra nada real.
- **La escala de JUICIO no es la misma que la de suavizado** (ADR 0023 v2):
  `max(θ_R/M, R50)`, con R50 estimado del momento de segundo orden del flujo
  acumulado en la misma pasada (`thetaJuicioNiebla`, `:1088-1095`). El 0,832 es
  exacto para una gaussiana 2D y está declarado como hipótesis de forma.

El valor que devuelve `nieblaCampo()` es el flujo **real**, sin el parche
estético: el contador sigue siendo fotometría y lo que se desvía de ella es solo
lo pintado.

### El parche estético

`FOT.NIEBLA_GANANCIA_ESTETICA = 1,5` (`:250`). Está declarado como lo que es —un
mando de gusto, sin medida detrás— y contradice de frente el ADR 0004. Importa
entender que **no es solo brillo**: multiplica antes de `visibilidadDifusa`, así
que también baja el umbral efectivo de detección en 0,44 mag
(`2,5·log₁₀ 1,5`). Es ajustable en caliente desde la consola:

```js
BitacoraGaiaRender.fot.NIEBLA_GANANCIA_ESTETICA = 1;   // fotometría limpia
```

Con 1 la conservación del ADR 0003 vuelve a ser exacta.

### Cómo se juzga: el umbral

La niebla es **la única capa difusa sin máscara propia** (`difusoMask`). Las
otras —el halo del cúmulo y la galaxia de PS1— traen su desvanecido ya hecho y
calculan su `ctxFotometrico` con su propia θ. La niebla, no: su θ viaja como
quinto argumento explícito hasta `pintarFot`:

```
vistaGaia:  thNiebla = opNiebla.thetaJuicioArcmin      (:2670)
            pintarFot(difuso, ctx, cielo, capaEst, thNiebla)   (:2680)
pintarFot:  c = ctxFotometrico(o, thetaDifusaArcmin)   (:616)
            s = visibilidadDifusa(Fobj[i], c.Fcielo·c.Cmin, perceptual)  (:639)
```

Ese argumento es el arreglo del **bug H1** (ADR 0023): sin él,
`ctxFotometrico` no ve tamaño, la guarda `FOT.H2C && thetaIntArcmin > 0` no se
cumple y la niebla caía en la rama heredada **C_MAG**, hasta 2,4× más permisiva
justo donde la física pide que se apague. Es un argumento y no un campo de `o`
precisamente para que no pueda quedarse rancio entre renders.

### Qué se sabe medido de esta capa

Recogido en `notas/niebla-campo-pupila-y-aumentos.md` (medidas de 2026-09-02) y
en los ADR 0022/0023. Lo relevante antes de tocar nada:

- **La pupila de salida entra una sola vez, en el umbral.** El contraste
  `F/Fcielo` es invariante a la pupila dentro del ±1,7 % en un rango de 17×,
  porque `nieblaCampo` deposita flujo de catálogo y `Fcielo` está en las mismas
  unidades «antes de la pupila»: `dim` se cancela en el cociente. No hay doble
  contabilidad, y no la hay por construcción.
- **La niebla se apaga al subir aumento**, y por el mecanismo correcto: `mlim`
  se hace más profundo, el corte sube y las estrellas se van de la niebla al
  canal de estrellas. Medido en M11: 200 mm de 40× a 300× → 20,5 a 14,9 DN.
- **A censo de estrellas congelado, el contraste medio es invariante con el
  aumento** (1,6 % entre 40× y 600×), que es lo que exige la física de fuentes
  extensas — reproducido por una cadena que no lo tiene escrito en ningún sitio.
  Lo que sí crece es el **grumo**: la transición niebla→estrellas emerge sola.
- **Deuda abierta (H2): la luz de la niebla no se realimenta al cielo.** En M11
  nuclear sale a μ ≈ 21,5, tan brillante como el propio cielo, y sin embargo no
  entra por `sumaSB`/`veloSB` ni degrada `mlim`, cosa que el ADR 0014 sí hace
  con su velo. Medido en el issue #186: Δ`mlim` máximo −0,23 mag con el escalar
  de campo y −0,25 mag con el techo espacial; las dos variantes empatan dentro
  de 0,02 mag, y solo cambian 2 veredictos de anillo sobre 168. El ticket se
  cerró con la pregunta respondida, no con el cambio hecho. Si se retoma, la vía
  barata (un `cielo.veloSB` más en `vistaGaia` con punto fijo) es la buena.
- **Margen fino frente a estrellas aisladas.** La niebla no llega hoy a pintar
  una estrella sub-`mlim` aislada como mancha visible, pero el peor caso medido
  deja 1,29 mag de margen, del que el desvanecido se come 1,0 y el parche
  estético 0,44. Subir la ganancia a 2,5-3 o bajar `UMBRAL_MARGEN` mete a la
  capa en contradicción con `dibujar()`, que descarta esa misma estrella.

---

## 3. Canal B — el velo de campo denso (`veloSB`)

`resources/js/bitacora-gaia-render.js:717-726`. En un campo muy rico el proxy
trunca a las 40 000 estrellas más brillantes y devuelve en la clave `fondo` los
momentos de la banda truncada, agregados por el propio TAP. Esa luz es
físicamente relevante (en M7, μ ≈ 21) y no puede desaparecer por un límite
computacional.

Entra como **cielo extra**, no como capa pintada:

```
cielo.veloSB = veloSB(estrellas.fondo)        vistaGaia :2622-2627
sqm_efectivo = sumaSB(sqm, veloSB)            ctxFotometrico :323, magLimite :735
```

Y desde ahí lo hereda **todo** lo derivado sin ley nueva: `SBe`, `Cmin`, el
nivel de fondo pintado, el suelo de pintado y la propia magnitud límite. Un
fondo más brillante también quita estrellas del límite.

Aproximaciones asumidas y declaradas: uniforme sobre el campo (velo estadístico,
sin estructura) y `G ≈ V` frente a la escala del SQM.

Este canal **sí** convive con los otros dos: un globular en un campo rico lleva
velo y halo de cúmulo a la vez, y un campo de Vía Láctea lleva velo y niebla.
Lo que nunca convive es niebla + halo de cúmulo.

Efecto de interfaz: cuando hay velo, el aviso del campo cambia de texto
(«su luz entra como resplandor de fondo» en vez de «el catálogo se agotó»,
`:2636-2639`).

---

## 4. Canal C — el halo del cúmulo globular (`pintarCumulo`)

La versión más elaborada de la misma idea, y la que NO usa el catálogo para
esto. Población en `resources/js/bitacora-cumulos.js` (Capa 1: qué estrellas hay
y dónde, sin ojo ni telescopio dentro, frontera del ADR 0002); ley visual en
`bitacora-gaia-render.js:2059` (`tablaCumulo`) y `:2160` (`pintarCumulo`).

Cadena, sin ningún parámetro de «contraste de grano» que tocar:

```
a(m,r)    ← P_solo: probabilidad de que una estrella no la funda una vecina
⟨I⟩(r)    = Σ(r) · S1campo(m_res, r)        flujo por arcsec²   (:2089)
σ(r)²     = Σ(r) · S2campo(m_res, r) / Ω    varianza del grano  (:2090)
m_lim,sky(r) ← magLimite contra el fondo LOCAL (cielo + velo del propio cúmulo)
m_res(r)  = punto fijo de las dos anteriores, 5 pasadas FIJAS   (:2079-2088)
sHalo(r)  = visibilidadDifusa(⟨I⟩, Fcielo·Cmin)                 (:2091)
```

Dos cosas que conviene saber antes de tocar cualquier cosa del halo:

- **El punto fijo es la ley que manda, no el crowding.** Medido: el sorteo
  Bernoulli del ADR 0012 mata 0 estrellas de 137 a 61× y 6 de 554 a 250× en M13.
  Quien limita el núcleo es el velo del propio cúmulo realimentado a `m_lim,sky`
  — el mismo mecanismo que la niebla NO tiene (§2, H2).
- **El grano está apagado y eso es un resultado, no un olvido.** `TEXTURA.ACTIVO`
  en false; la ley de textura para el grano SBF se falsó con medida (ADR 0015).
  El velo de M13 tiene 0,41 estrellas efectivas por beam —es SBF puro— pero
  ninguna escala de integración lo hace visible: le faltan ×24. Esta capa pinta
  la mancha, no el grano, y esa fue también la decisión explícita del ADR 0022
  para la niebla.

---

## 4 bis. Medida: qué canal se lleva la luz en cada objeto (18″)

Fecha de la medida: 2026-09-19. Arnés: `scripts/harness_canales_g.js`.

### Qué había ya en el repo, y qué faltaba

- El ADR 0022 mide el reparto **glow / banda perdida** por anillo en siete
  cúmulos abiertos, con 200 y 457 mm. Es el antecedente directo, pero solo
  cubre dos de los tres canales y solo en abiertos.
- El ADR 0014 da **un** número de velo: M7 a μ = 21,0 mag/arcsec².
- **No existía ninguna comparación de los tres canales sobre el mismo banco.**
  Eso es lo que mide esta sección.

### Método

Se pide al proxy de **producción** exactamente lo que pide `vistaGaia`
(`ra`, `dec`, `radioConsulta(campo)`, profundidad de `profundidadConsulta` —con
la capa de galaxias activa sale siempre el tope G = 20,0) y se reparte el flujo
devuelto en los cuatro destinos, con `magLimite`, `colaGlow`, `veloSB` y
`ctxFotometrico` importados del módulo (ADR 0008). Equipo: **457 mm (18″)**,
ocular de 68°, dos aumentos; sqm 21,5; T 0,8; pupila de ojo 7 mm. La región de
medida es el disco del objeto recortado al campo del ocular.

La única ley copiada y no importada es `radioConsulta()`, que no está exportada.

### Resultado

Reparto del flujo **sub-`mlim`** (el que no se dibuja como estrella resuelta):

| Objeto | Aumentos | `mlim` | glow | niebla | velo | μ niebla | μ velo |
|---|---|---|---|---|---|---|---|
| M45 (Pléyades) | 100× | 15,78 | **79,2 %** | 20,8 % | — | 28,01 | — |
| M45 | 229× | 16,49 | **83,1 %** | 16,9 % | — | 28,67 | — |
| M11 | 100× | 15,61 | 51,7 % | 0,0 % | **48,3 %** | — | **22,44** |
| M11 | 229× | 16,49 | 75,7 % | **24,3 %** | — | **23,57** | — |
| NGC 7789 | 100× | 15,78 | **83,5 %** | 16,5 % | — | 25,34 | — |
| NGC 7789 | 229× | 16,49 | **87,0 %** | 13,0 % | — | 26,15 | — |
| NGC 2266 (control) | 100× | 15,78 | **86,8 %** | 13,2 % | — | 25,94 | — |
| NGC 2266 | 229× | 16,49 | **89,1 %** | 10,9 % | — | 26,98 | — |
| M7 | 100× | 15,36 | 25,1 % | 0,0 % | **74,9 %** | — | **21,25** |
| M7 | 229× | 16,49 | 68,4 % | **31,6 %** | — | **22,76** | — |
| M24 (nube de Sgr) | 100× | 15,78 | 75,3 % | **24,7 %** | — | **23,81** | — |
| M24 | 229× | 16,49 | **83,1 %** | 16,9 % | — | 24,67 | — |

μ en mag/arcsec² sobre el disco medido; el cielo de referencia en el ocular
(SBe) es 22,67 a 100× y 24,47 a 229×. «—» = canal vacío.

Conteos de estrellas por canal, que cuentan otra historia (misma corrida):

| Objeto / aumentos | estrellas | glow | niebla | velo |
|---|---:|---:|---:|---:|
| M45 100× | 305 | 666 | 1 153 | — |
| M11 100× | 1 492 | 2 206 | 0 | **18 305** |
| M11 229× | 2 567 | 7 846 | **12 011** | — |
| M7 100× | 7 031 | 11 430 | 0 | **385 233** |
| M7 229× | 3 415 | 16 480 | **44 657** | — |
| M24 100× | 7 039 | 26 184 | **57 808** | — |
| NGC 2266 229× | 116 | 102 | 59 | — |

### Las cuatro lecturas

**1. El glow se lleva el FLUJO; la niebla se lleva las ESTRELLAS.** En casi todo
el banco el glow es el 75-89 % del flujo sub-`mlim`, sencillamente porque su
banda son las 2,30 magnitudes más brillantes de las que quedan. Pero en número
de estrellas la niebla gana con holgura donde hay población débil: M7 a 229×
lleva 44 657 estrellas en la niebla contra 16 480 en el glow. Son dos preguntas
distintas y conviene no mezclarlas al decidir dónde tocar.

**2. El velo no es un canal de magnitud: es un canal de densidad — y cuando
aparece, se traga la niebla entera.** El velo solo existe si la sonda del proxy
pasa de 200 000 filas (ADR 0014). Cuando eso pasa, el censo individual se corta
en el `TOP 40000`: en M11 a 100× el corte cae en G = 17,09 y en M7 a 100× en
G = 16,30, **por debajo del corte de glow** (17,91 y 17,67). La banda de niebla
queda vacía por construcción y toda esa luz sale por el velo. No se pierde nada
—es el mismo flujo— pero se pinta con otra ley: uniforme, sin estructura
espacial, y realimentado a `mlim` (se ve en la tabla: el `mlim` de M11 a 100×
baja a 15,61 frente a los 15,78 del resto).

**3. El mismo objeto cambia de canal al cambiar de ocular, y no por física del
ojo.** M11 y M7 van por **velo** a 100× y por **niebla** a 229×. La causa es el
radio de consulta, que encoge con el campo (0,490° contra 0,214°): con el cono
más pequeño la sonda deja de tocar techo y el catálogo llega entero. Es un
efecto del **tamaño del campo**, no del aumento. Es el punto más frágil de todo
esto y el que más conviene tener presente antes de tocar nada: el reparto entre
canales depende de un umbral computacional.

**4. Dónde manda cada canal, con 18″:**

- **Glow**: M45 y NGC 2266. Objetos cercanos o pobres, sin población débil que
  enterrar; ahí la niebla sale a μ = 27-28,7, es decir, nada.
- **Niebla**: M7 (μ 22,76), M11 (23,57) y M24 (23,81) — campos ricos de la Vía
  Láctea, con o sin cúmulo. NGC 7789, que es el otro arquetipo del ADR 0022,
  queda con 18″ en μ 25,3-26,2: la apertura ya le ha resuelto la mancha.
- **Velo**: M7 a 100× (μ 21,25, tres cuartas partes del flujo sub-`mlim`) y M11
  a 100× (22,44, casi la mitad). Es el canal más brillante de los tres cuando
  se enciende, y el único que altera `mlim`.

Y un resultado en negativo que sirve de aviso: **M24 no se trunca nunca** en
este banco (186 820 filas a 100×, a un 7 % del techo). La frontera del velo es
un número de filas, no la fama del campo.

### Caveat de esta medida

La tabla reparte **flujo depositado**, no visibilidad. El veredicto de si la
niebla se ve lo da producción píxel a píxel, después del núcleo tienda, la gamma
perceptual y el parche estético, y sobre el **exceso local** frente al campo, no
sobre la media del disco — eso es lo que miden los listones del ADR 0023, no
esta tabla. Como orientación: la razón `C/Cmin` promediada sobre el disco no
llega a 1 en ninguna fila del banco (máximo 0,35 en M7/229×), lo que va en la
dirección del listón P4 —más apertura, menos niebla— pero no es un veredicto de
visibilidad.

Tampoco hay aquí ningún cúmulo globular: en ellos la niebla no se ejecuta (§1) y
la comparación no tendría sentido.

### Reproducir

```
node scripts/harness_canales_g.js              # sqm 21,5 por defecto
node scripts/harness_canales_g.js --sqm 20 --json /tmp/canales.json
```

Las respuestas del proxy se cachean en `scripts/fixtures/gaia/canales_*.json`
(30 MB con este banco, ignoradas por git: se vuelven a bajar solas). La primera
vuelta tarda unos 45 s en total; los campos densos son los caros (M7 a 100×:
26 s, porque el proxy paga la consulta segura más el agregado).

---

## 4 ter. El caso M13 a 514×: de qué canal es ese halo

Fecha de la medida: 2026-09-19. Sondas en `/tmp` (no van al repo); llaman a
`pintarCumulo`, `realzarPerceptual`, `valorDeFlujo` y `ctxFotometrico` de
producción. Equipo de la captura: 458 mm f/1900 con Ethos-SX 3,7 mm → **514×**,
campo real 12,8′, campo aparente 110°, pupila de salida 0,89 mm; sqm 21,5.

Observación de partida: en M13 a mucho aumento aparece un halo gris amplio,
grumoso, que parece arrancar a cierta distancia del núcleo. A poco aumento no
se ve así.

### Los tres canales quedan descartados, con números

- **Velo: no.** El proxy devuelve `fondo: null` para el campo de M13 incluso
  pidiendo un radio de 1,5° (62 903 filas, muy por debajo del techo de 200 000).
  Sin truncamiento no hay velo.
- **Niebla: no.** M13 es globular y `vistaGaia` salta `nieblaCampo()` con la
  guarda `if (!cum)` (`:2660`).
- **Glow: no, y es estructural.** Dentro del radio de marea de un globular el
  canal de glow está **vacío por construcción**: `estrellasCumulo` descarta
  entera la estrella con `m > m_res` (`:2372`), porque su luz ya está contada en
  `S1campo`. Medido: 0 estrellas de glow dentro del campo a 250× y a 514×. El
  glow solo reaparece fuera del cúmulo (a 61×, con un campo de 108′, salen
  247-613 por anillo más allá de los 20′).

### Lo que sí es: el campo no resuelto del propio cúmulo (canal C)

El halo es `⟨I⟩(r) = Σ(r)·S1campo(m_res, r)`, tabulado por `tablaCumulo`
(`:2059`), desvanecido por `sHalo = visibilidadDifusa(⟨I⟩, Fcielo·Cmin)`
(`:2091`) y depositado en `difuso` por `pintarCumulo` (`:2160`). Es el canal C
de §4, no la niebla del ADR 0022.

**El grano no interviene**: `sGrano` sale 0 en los 513 anillos, a 61×, 150×,
250× y 514×. La capa difusa es, por tanto, **radial y lisa**: no puede producir
grumos por sí misma.

### Por qué solo se nota a mucho aumento

El halo no cambia con el aumento; cambia cuánto del campo ocupa. DN del halo
(incremento sobre el fondo) a **radio de cielo fijo**:

| r | 61× | 150× | 250× | 400× | 514× |
|---|---|---|---|---|---|
| 0,25′ | 107,5 | 101,9 | 99,6 | 94,1 | 93,6 |
| 1,00′ | 77,0 | 71,8 | 65,6 | 64,5 | 64,0 |
| 2,00′ | 45,6 | 38,0 | 36,9 | 36,3 | 36,4 |
| 4,00′ | 18,6 | 17,7 | 19,1 | 20,6 | 21,3 |
| 6,00′ | 12,1 | 13,0 | 12,6 | 9,9 | 7,1 |
| campo | 108,2′ | 44,0′ | 26,4′ | 16,5′ | 12,8′ |

A radio fijo el halo es prácticamente el mismo (es la invariancia del contraste
con el aumento). Lo que cambia es el encuadre: a 61× ese halo de ~6′ ocupa el
11 % del diámetro del campo —una manchita bajo la bola de estrellas— y a 514×
**llena el ocular entero**.

### Por qué parece arrancar a cierta distancia del núcleo

El perfil pintado es monótono decreciente, así que el anillo no está en los
datos: lo pone la **gamma perceptual con `t = s_halo`**. `realzarPerceptual`
(`:593`) usa `gamma_ef = 1 + (0,45 − 1)·(1 − s_halo)`, de modo que el realce se
**retira** donde el halo ya se ve bien (el centro, `s_halo = 1`) y entra
**completo** donde roza el umbral (el exterior). Medido a 514×:

| r | μ⟨I⟩ | s_halo | DN sin realce | DN con realce | factor |
|---|---|---|---|---|---|
| 1,0′ | 18,69 | 1,000 | 64,0 | 64,0 | ×1,00 |
| 2,0′ | 20,17 | 0,968 | 35,1 | 36,4 | ×1,04 |
| 3,0′ | 21,12 | 0,676 | 16,1 | 26,4 | ×1,64 |
| 4,0′ | 21,86 | 0,366 | 5,6 | 21,3 | **×3,78** |
| 5,0′ | 22,49 | 0,134 | 1,3 | 15,8 | **×12,5** |
| 6,0′ | 23,01 | 0,018 | 0,1 | 7,1 | **×66,8** |

Sin el realce el halo caería de 94 a 0,1 DN en 6′: un núcleo brillante y nada
más. Con él cae de 94 a 7 DN, o sea una **meseta ancha de gris** desde los 2-3′
hasta el borde del campo. Eso, más el núcleo tapado por centenares de sprites de
estrellas resueltas solapados, es lo que se lee como «halo que empieza lejos del
centro».

Y el mecanismo depende del aumento por la puerta de atrás: `s_halo` a 6′ pasa de
0,47 a 61× a 0,02 a 514×, así que la zona realzada **se mete hacia dentro** al
subir aumento y cubre una fracción mayor de un campo que además es más pequeño.

### Lo que esta medida NO explica: el grumo

Abierto como **issue #329** (`bug`), con el A/B pendiente y los criterios de
cierre. No se toca por ahora.

El grumo (nubes irregulares con calles oscuras) **no puede venir de la capa
difusa**, que es lisa y radial con `sGrano = 0`. Quedan dos candidatos, ninguno
medido aquí —no hay canvas en node y el sprite de estrella y el desenfoque son
del canvas—:

1. **La propia capa de estrellas**: centenares de sprites solapados con
   `'lighter'`, cuya densidad fluctúa.
2. **`adaptacionLocal`** (`:427`): unsharp con radio `SIZE/60` px, ganancia
   `REALCE = 0,5` y `UMBRAL_DETALLE = 12` DN (`:419`). En la meseta exterior el
   halo vale 7-36 DN, o sea del orden del umbral de detalle: ahí el unsharp
   empieza a morder. Y con `FOT.REALCE_OSCURO = 1,0` (`:208`) el lado oscuro va
   con la misma ganancia que el claro — el comentario del propio parámetro
   avisa: «1 = simétrico → las siluetas oscuras recortan contra el fondo».

A/B barato para decidirlo, desde la consola del navegador sobre la misma vista:

```js
BitacoraGaiaRender.fot.REALCE_OSCURO = 0;   // mata solo el lado oscuro del unsharp
BitacoraGaiaRender.fot.GAMMA_PERCEPTUAL = 1; // quita el realce del difuso
```

y volver a generar. Si las calles oscuras desaparecen con lo primero, el grumo
es de `adaptacionLocal`; si la meseta gris se derrumba con lo segundo, la
extensión del halo es de la gamma (que es lo que predice la tabla de arriba).

---

## 5. Desde dónde se ejecuta

Un solo camino de ley, dos entradas de producto. El orden de la cadena vive
entero en `vistaGaia()` (`bitacora-gaia-render.js:2596`), que es el módulo hondo
dueño de la secuencia: **fondo → consulta → velo → magnitud límite → cúmulo →
niebla → capa de estrellas → pintado fotométrico → capa de galaxias**. Los dos
llamadores no conocen la secuencia: pasan datos y reciben resultado.

| Entrada | Fichero | Qué añade |
|---|---|---|
| Simulador ocular (vista en vivo) | `simulador_ocular/resources/js/bitacora-ocular.js:694` | indicadores de carga, dónde van los avisos, respaldo DSS si Gaia no responde |
| Formulario de registro (imagen que se sube) | `registro/resources/js/bitacora-formulario.js:1444-1445` | espera además la capa de galaxias antes de resolver |

El formulario entra por `render()` (`:2698`), un envoltorio de `vistaGaia` que
espera la promesa de PS1. La vista DSS entra por `renderPlaca()`, que **no**
ejecuta `nieblaCampo`: una placa ya trae la luz de esas estrellas revelada en la
emulsión, y pintarla otra vez sería contarla dos veces.

El cúmulo globular entra como **dato** (la ficha física del catálogo de Harris,
`o.cumulo`): `vistaGaia` no lee nada de `bitacora-cumulos.js`. El simulador solo
lo pasa cuando el objeto seleccionado es globular
(`bitacora-ocular.js:702`), y por eso los cúmulos **abiertos** del catálogo
—que entran por el catálogo libre, sin ficha de King— caen en el camino de campo
ordinario y son exactamente el caso de uso de la niebla.

Dónde NO aparece nada de esto: `mapa/` no usa el render fotométrico.

---

## 6. Qué implica modificar esta capa

Por orden de lo que más cuesta recuperar si se rompe.

**El reparto entre canales es el invariante.** Cualquier cambio en `mlim`, en
`colaGlowMag()` (o sea en `alfaMin`/`glowCorte`) o en la profundidad de consulta
mueve estrellas de un canal a otro. Mover la frontera glow↔niebla sin más
convierte sprites en mancha y viceversa; mover el techo de consulta cambia qué
parte va al velo agregado. Los tests de conservación (ADR 0003) son los que
detectan esto.

**Hay disciplina de prerregistro y no es opcional.** Esta capa tiene tres ADR
encadenados (0022 el prerregistro original, 0023 la corrección de la ley de
umbral, y 0012/0015 para el lado del cúmulo) y la regla del repo es que los
listones se comprometen **antes** de ejecutar el arnés y no se retocan después.
El ADR 0023 incluso registra un listón fallado (Q5) sin reinterpretarlo. Un
cambio de ley aquí pide su propio prerregistro antes de tocar código.

**No comparar la ley nueva contra la vieja para juzgar valores.** Regla general
que dejó el ADR 0023: un listón que compara contra la ley que se está
sustituyendo solo puede vigilar **veredictos** (regresión), nunca **valores**
(corrección). Si la ley vieja fuese autoridad sobre los valores, no habría nada
que corregir.

**El umbral y el brillo no son la misma perilla.** El parche estético entra
antes de `visibilidadDifusa`, así que sube el brillo y baja el umbral a la vez.
Si lo que se quiere es más brillo sin más falsos positivos, la perilla no es esa
—y `GAMMA_PERCEPTUAL` es el eslabón que el propio ADR 0022 señala como
sospechoso detrás del parche.

**Los controles negativos son parte de la capa.** M45 (cuya nebulosidad real es
reflexión, NGC 1435), NGC 1664 y NGC 2266 están en el banco para que la capa no
pinte niebla donde nadie la reporta. Q3 es el guardián real contra falsos
positivos, no los listones de parecido con la ley anterior.

**La niebla es la única capa difusa sin `difusoMask`.** Si se añade otra capa
difusa sin máscara propia, comparte el umbral genérico de `pintarFot` y la θ que
hoy viaja como quinto argumento pasaría a tener dos dueños. Ese es el punto de
diseño más frágil de todo el canal A.

---

## 7. Qué leer y qué ejecutar

Código, por orden de lectura:

- `resources/js/bitacora-gaia-render.js` — `thetaRiccoArcmin` (`:315`),
  `ctxFotometrico` (`:319`, ramas H2c/C_MAG en `:338-351`), `visibilidadDifusa`
  (`:535`), `realzarPerceptual` (`:593`), `pintarFot` (`:614`), `veloSB`/`sumaSB`
  (`:717`/`:723`), `magLimite` (`:729`), `colaGlowMag` (`:961`),
  `thetaNieblaArcmin` (`:1018`), `nieblaCampo` (`:1030`), `thetaJuicioNiebla`
  (`:1088`), `tablaCumulo` (`:2059`), `pintarCumulo` (`:2160`), corte de glow en
  `dibujar` (`:2469-2472`), `vistaGaia` (`:2596`).
- `resources/js/bitacora-cumulos.js` — `momentosCampo` (`:270`), `aCrowd`
  (`:332`), y la frontera declarada en la cabecera del fichero.

Decisiones:

- `simulador_ocular/docs/adr/0022-preregistro-niebla-sub-mlim-en-cumulos-abiertos.md`
- `simulador_ocular/docs/adr/0023-la-niebla-se-juzga-con-h2c-a-la-escala-de-ricco.md`
- `simulador_ocular/docs/adr/0014-adquisicion-gaia-por-regimen-de-densidad.md` (velo)
- `simulador_ocular/docs/adr/0012-el-crowding-es-una-probabilidad-por-estrella.md`
  y `0015-umbral-de-textura-para-el-grano-sbf.md` (halo del globular)
- `simulador_ocular/docs/adr/0001-h2c-es-la-capa-perceptual-del-modelo-de-cumulos.md`
  (la ley de umbral por tamaño)

Notas de investigación:

- `notas/nubosidad-cumulos-abiertos-gaia.md` — la investigación que originó la capa
- `notas/niebla-campo-pupila-y-aumentos.md` — pupila, aumentos, H1 y H2 con medidas
- `notas/pupila-salida-fondo-cielo.md` — el clamp `min(1,(d_ep/d_ojo)²)`

Pruebas:

- `node scripts/test_niebla_abiertos.js` — contrato de `nieblaCampo()`:
  conservación del flujo, efecto del parche, descarte fuera de lienzo.
- `node scripts/harness_niebla_abiertos.js` — el arnés prerregistrado de los
  ADR 0022/0023 sobre las fixtures de Gaia (`scripts/fixtures/gaia/niebla_*.csv`).
- `node scripts/test_vista_gaia.js` — contrato de `vistaGaia` (el orden de la cadena).
- `node scripts/harness_canales_g.js` — el reparto de la luz entre los cuatro
  canales sobre el banco de §4 bis (pide al proxy de producción, cachea en local).
- `node scripts/bateria.js --solo niebla` — los dos anteriores de golpe.

Los arneses **importan** la función de producción, no la reimplementan
(ADR 0008): si se cambia la ley, el arnés mide la ley nueva sin tocarlo.
