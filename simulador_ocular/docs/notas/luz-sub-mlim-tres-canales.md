# Dos medidas sobre los canales de luz sub-`mlim`

Fecha: 2026-09-19; cifras refrescadas contra `main` el 2026-09-20, después de la
épica #330. Estado: medida, sin cambios en producción.

**El mapa de los canales no está aquí.** Quién es cada uno (glow, niebla, velo,
halo del globular), qué ley aplica y dónde vive está en
[`auditoria-identidad-conservacion-canales.md`](auditoria-identidad-conservacion-canales.md),
que es la nota de partida de la épica #330. Esta nota solo aporta dos medidas
que aquella no cubre:

1. **§1** — qué canal se lleva la luz en cada tipo de objeto, con un 18″.
2. **§2** — de dónde sale el halo de M13 a 514×, el del issue #329.

Convención de la carpeta: `fichero:línea` verificado contra el código actual
(`resources/js/bitacora-gaia-render.js` salvo que se diga otra cosa), y lo
**MEDIDO** separado de lo **RAZONADO**.

---

## 1. Qué canal se lleva la luz en cada objeto (18″)

Arnés: `scripts/harness_canales_g.js`. Pide al proxy de **producción** lo mismo
que pide `vistaGaia` (`ra`, `dec`, `radioConsulta(campo)`, profundidad de
`profundidadConsulta` —con la capa de galaxias activa sale siempre el tope
G = 20,0) y reparte el flujo devuelto en los cuatro destinos, con `magLimite`,
`colaGlowMag`, `veloSB`, `mlimNiebla` y `ctxFotometrico` importados del módulo
(ADR 0008). Equipo: **457 mm (18″)**, ocular de 68°, dos aumentos; sqm 21,5;
T 0,8; pupila de ojo 7 mm. La región de medida es el disco del objeto recortado
al campo del ocular. La única ley copiada y no importada es `radioConsulta()`,
que no está exportada.

Las cifras de abajo llevan ya la realimentación H2 de la épica #330
(`mlimNiebla`, `:1135`): en campo ordinario la niebla entra en el cielo y rehace
`mlim` antes de repartir, igual que hace `vistaGaia` (`:2777`).

### MEDIDO — reparto del flujo sub-`mlim`

| Objeto | Aumentos | `mlim` | glow | niebla | velo | μ niebla | μ velo |
|---|---|---|---|---|---|---|---|
| M45 (Pléyades) | 100× | 15,78 | **79,2 %** | 20,8 % | — | 28,01 | — |
| M45 | 229× | 16,49 | **83,1 %** | 16,9 % | — | 28,67 | — |
| M11 | 100× | 15,61 | 51,7 % | 0,0 % | **48,3 %** | — | **22,44** |
| M11 | 229× | 16,43 | 75,1 % | **24,9 %** | — | **23,51** | — |
| NGC 7789 | 100× | 15,77 | **83,4 %** | 16,6 % | — | 25,33 | — |
| NGC 7789 | 229× | 16,49 | **87,0 %** | 13,0 % | — | 26,14 | — |
| NGC 2266 (control) | 100× | 15,78 | **86,8 %** | 13,2 % | — | 25,94 | — |
| NGC 2266 | 229× | 16,49 | **89,1 %** | 10,9 % | — | 26,98 | — |
| M7 | 100× | 15,36 | 25,1 % | 0,0 % | **74,9 %** | — | **21,25** |
| M7 | 229× | 16,37 | 67,8 % | **32,2 %** | — | **22,69** | — |
| M24 (nube de Sgr) | 100× | 15,73 | 74,9 % | **25,1 %** | — | **23,76** | — |
| M24 | 229× | 16,47 | **82,9 %** | 17,1 % | — | 24,64 | — |

μ en mag/arcsec² sobre el disco medido. «—» = canal vacío.

Conteos de estrellas por canal, que cuentan otra historia:

| Objeto / aumentos | estrellas | glow | niebla | velo |
|---|---:|---:|---:|---:|
| M45 100× | 305 | 666 | 1 153 | — |
| M11 100× | 1 492 | 2 206 | 0 | **18 305** |
| M11 229× | 2 472 | 7 581 | **12 371** | — |
| M7 100× | 7 031 | 11 430 | 0 | **385 233** |
| M7 229× | 3 010 | 15 395 | **46 147** | — |
| M24 100× | 6 703 | 25 464 | **58 864** | — |
| NGC 2266 229× | 116 | 102 | 59 | — |

### Las cuatro lecturas

**1. El glow se lleva el FLUJO; la niebla se lleva las ESTRELLAS.** En casi todo
el banco el glow es el 75-89 % del flujo sub-`mlim`, porque su banda son las
2,30 magnitudes más brillantes de las que quedan. Pero en número de estrellas la
niebla gana con holgura donde hay población débil: M7 a 229× lleva 46 147
estrellas en la niebla contra 15 395 en el glow. Son dos preguntas distintas y
conviene no mezclarlas al decidir dónde tocar.

**2. El velo no es un canal de magnitud: es un canal de densidad — y cuando
aparece, se traga la niebla entera.** El velo solo existe si la sonda del proxy
pasa de 200 000 filas (ADR 0014). Cuando eso pasa, el censo individual se corta
en el `TOP 40000`: en M11 a 100× el corte cae en G = 17,09 y en M7 a 100× en
G = 16,30, **por debajo del corte de glow** (17,91 y 17,67). La banda de niebla
queda vacía por construcción y toda esa luz sale por el velo. No se pierde nada
—es el mismo flujo— pero se pinta con otra ley.

**3. El mismo objeto cambia de canal al cambiar de ocular, y no por física del
ojo.** M11 y M7 van por **velo** a 100× y por **niebla** a 229×. La causa es el
radio de consulta, que encoge con el campo (0,490° contra 0,214°): con el cono
más pequeño la sonda deja de tocar techo y el catálogo llega entero. Es un
efecto del **tamaño del campo**, no del aumento. Es el punto más frágil de todo
esto: el reparto entre canales depende de un umbral computacional.

**4. Dónde manda cada canal, con 18″:**

- **Glow**: M45 y NGC 2266. Objetos cercanos o pobres, sin población débil que
  enterrar; ahí la niebla sale a μ = 27-28,7, es decir, nada.
- **Niebla**: M7 (μ 22,69), M11 (23,51) y M24 (23,76) — campos ricos de la Vía
  Láctea, con o sin cúmulo. NGC 7789, que es el otro arquetipo del ADR 0022,
  queda con 18″ en μ 25,3-26,1: la apertura ya le ha resuelto la mancha.
- **Velo**: M7 a 100× (μ 21,25, tres cuartas partes del flujo sub-`mlim`) y M11
  a 100× (22,44, casi la mitad). Es el canal más brillante de los tres cuando se
  enciende.

Y un resultado en negativo que sirve de aviso: **M24 no se trunca nunca** en
este banco (186 820 filas a 100×, a un 7 % del techo). La frontera del velo es
un número de filas, no la fama del campo.

### Caveats

- La tabla reparte **flujo depositado**, no visibilidad. El veredicto de si la
  niebla se ve lo da producción píxel a píxel, después del núcleo tienda y la
  gamma perceptual, y sobre el **exceso local** frente al campo, no sobre la
  media del disco — eso es lo que miden los listones del ADR 0023, no esta
  tabla. Como orientación, la razón `C/Cmin` promediada sobre el disco no llega
  a 1 en ninguna fila del banco (máximo 0,41 en M7/229×), lo que va en la
  dirección del listón P4 (más apertura, menos niebla) pero no es un veredicto.
- Las respuestas cacheadas del proxy son anteriores al `fondo.espacial` del
  ADR 0029, así que no llevan momentos por celda. Eso no afecta al reparto, que
  solo usa `fondo.flujo`; sí afectaría a cualquier medida del velo espacial.
- No hay aquí ningún cúmulo globular: en ellos la niebla no se ejecuta y la
  comparación no tendría sentido.

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

## 2. El caso M13 a 514×: de qué canal es ese halo

Fecha de la medida: 2026-09-19 (sondas en `/tmp`, no van al repo; llaman a
`pintarCumulo`, `realzarPerceptual`, `valorDeFlujo` y `ctxFotometrico` de
producción). Equipo de la captura: 458 mm f/1900 con Ethos-SX 3,7 mm → **514×**,
campo real 12,8′, campo aparente 110°, pupila de salida 0,89 mm; sqm 21,5.

Sigue vigente tras la épica #330: la épica no tocó `realzarPerceptual`,
`GAMMA_PERCEPTUAL`, `adaptacionLocal`, `sHalo`, `tablaCumulo` ni `pintarCumulo`.

Observación de partida: en M13 a mucho aumento aparece un halo gris amplio,
grumoso, que parece arrancar a cierta distancia del núcleo. A poco aumento no se
ve así. Abierto como **issue #329** (`bug`), que cita esta sección como «§4 ter»
—su numeración anterior—.

### Los tres canales quedan descartados, con números

- **Velo: no.** El proxy devuelve `fondo: null` para el campo de M13 incluso
  pidiendo un radio de 1,5° (62 903 filas, muy por debajo del techo de 200 000).
  Sin truncamiento no hay velo.
- **Niebla: no.** M13 es globular y `vistaGaia` salta el bloque de niebla con la
  guarda `if (!cum)` (`:2769`).
- **Glow: no, y es estructural.** Dentro del radio de marea de un globular el
  canal de glow está **vacío por construcción**: `estrellasCumulo` descarta
  entera la estrella con `m > m_res` (`:2481`), porque su luz ya está contada en
  `S1campo`. Medido: 0 estrellas de glow dentro del campo a 250× y a 514×. El
  glow solo reaparece fuera del cúmulo (a 61×, con un campo de 108′, salen
  247-613 por anillo más allá de los 20′).

### Lo que sí es: el campo no resuelto del propio cúmulo

El halo es `⟨I⟩(r) = Σ(r)·S1campo(m_res, r)`, tabulado por `tablaCumulo`
(`:2168`), desvanecido por `sHalo = visibilidadDifusa(⟨I⟩, Fcielo·Cmin)` y
depositado en `difuso` por `pintarCumulo` (`:2269`).

**El grano no interviene**: `sGrano` sale 0 en los 513 anillos, a 61×, 150×,
250× y 514×. La capa difusa es, por tanto, **radial y lisa**: no puede producir
grumos por sí misma.

### MEDIDO — por qué solo se nota a mucho aumento

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

### MEDIDO — por qué parece arrancar a cierta distancia del núcleo

El perfil pintado es monótono decreciente, así que el anillo no está en los
datos: lo pone la **gamma perceptual con `t = s_halo`**. `realzarPerceptual`
(`:587`) usa `gamma_ef = 1 + (0,45 − 1)·(1 − s_halo)`, de modo que el realce se
**retira** donde el halo ya se ve bien (el centro, `s_halo = 1`) y entra
**completo** donde roza el umbral (el exterior). A 514×:

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

RAZONADO: el mecanismo depende del aumento por la puerta de atrás. `s_halo` a 6′
pasa de 0,47 a 61× a 0,02 a 514×, así que la zona realzada **se mete hacia
dentro** al subir aumento y cubre una fracción mayor de un campo que además es
más pequeño.

### Lo que esta medida NO explica: el grumo

El grumo (nubes irregulares con calles oscuras) **no puede venir de la capa
difusa**, que es lisa y radial con `sGrano = 0`. Quedan dos candidatos, ninguno
medido aquí —no hay canvas en node, y el sprite de estrella y el desenfoque son
del canvas—:

1. **La propia capa de estrellas**: centenares de sprites solapados con
   `'lighter'`, cuya densidad fluctúa.
2. **`adaptacionLocal`** (`:421`): unsharp con radio `SIZE/60` px, ganancia
   `REALCE = 0,5` y `UMBRAL_DETALLE = 12` DN (`:413`). En la meseta exterior el
   halo vale 7-36 DN, o sea del orden del umbral de detalle: ahí el unsharp
   empieza a morder. Y con `FOT.REALCE_OSCURO = 1,0` (`:208`) el lado oscuro va
   con la misma ganancia que el claro — el comentario del propio parámetro
   avisa: «1 = simétrico → las siluetas oscuras recortan contra el fondo».

A/B barato para decidirlo, desde la consola del navegador sobre la misma vista:

```js
BitacoraGaiaRender.fot.REALCE_OSCURO = 0;    // mata solo el lado oscuro del unsharp
BitacoraGaiaRender.fot.GAMMA_PERCEPTUAL = 1; // quita el realce del difuso
```

y volver a generar. Si las calles oscuras desaparecen con lo primero, el grumo
es de `adaptacionLocal`; si la meseta gris se derrumba con lo segundo, la
extensión del halo es de la gamma, como predice la tabla de arriba. Queda
pendiente en el issue #329; por ahora no se toca.
