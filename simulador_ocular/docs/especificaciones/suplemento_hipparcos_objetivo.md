# D3 — Suplemento de Hipparcos para las dobles brillantes

**Estado:** cerrado (2026-08-26). El trabajo está hecho y en `main`: issues #130
(catálogo), #131 (magnitud G y color), #132 (segunda componente), #133 (insignia
de fidelidad) y #134 (borrado de `parDoble`). Las decisiones viven en
`../adr/0018-las-estrellas-que-gaia-dr3-no-trae-son-un-catalogo-aparte.md`.

**El concepto no se llama así.** El título de este documento decía «suplemento de
Hipparcos» antes de medirlo. El nombre del proyecto es **«estrellas que Gaia DR3
no trae»**: 20 de las 108 filas del catálogo no son estrellas de Hipparcos, sino
compañeras colocadas con un ángulo que sale del WDS o del anexo de dobles —y en
2 filas, del valor asumido de 55°—. El fichero conserva su nombre porque
lo citan el ADR, `CONTEXT.md` y los tickets.

**Lo derogado, en dos líneas** (detalle en §1 y §2): el suelo del 16 % de
incompletitud del cruce no existe —la ausencia real a Hp<9 es del **0,2 %**—, y
la tabla de §2 confundía a quién le falta la primaria con a quién le falta la
secundaria.

**Contexto que lo genera:** la limpieza D2 (quitar la pestaña «Estrellas dobles», mover el catálogo a «Cualquier objeto», ensanchar el radio de búsqueda de `parDoble` a 25″). D2 arregla los **falsos positivos** —estrellas de más—. Este documento es el otro lado: las estrellas **de menos**.

---

## 1. El problema, en una frase

Gaia DR3 satura por arriba. En 18 de las 46 dobles del catálogo con `mag1 < 4`, DR3 no trae una de las dos componentes —o ninguna—, así que el simulador la sustituye por una estrella **inventada**: posición asumida a PA 55° cuando el WDS no publica ángulo, magnitud visual usada como si fuera G, y color blanco si no hay tipo espectral (140 de 289 entradas no lo traen).

No es un problema de dobles. Es un problema de **todo campo que contenga una estrella brillante**. Pero el tamaño del problema no es el que decía este documento.

> **Corregido (2026-08-26).** El párrafo original daba el 65,5 % de las Hp<3, el 45,6 % de las Hp<4 y el 31,4 % de las Hp<5 sin contrapartida, y avisaba de que «a Hp<9 el mismo cruce ya deja fuera un 16 %, que es la incompletitud de la propia tabla de cruce», del que había que contar solo el **exceso**. Ese 16 % **no es un suelo que restar: es casi toda la señal**. Se medía a través de `gaiadr3.hipparcos2_best_neighbour`, y lo que falta ahí no son las estrellas en Gaia, es su fila en la tabla de vecinos precalculada. Gaia DR3 **sí** trae a las estrellas de Hipparcos.
>
> Cruzando en local por posición —Hipparcos propagado de J1991.25 a 2016.0 con su movimiento propio, `cKDTree` sobre coordenadas cartesianas de la esfera unidad, radio 2″, sin umbral de magnitud— sobre las 78 348 filas de `public.hipparcos` con Hp<9 y astrometría, contra las 779 012 fuentes de `gaiadr3.gaia_source` con G<10,5:
>
> | tramo | estrellas | ausentes | ausencia |
> |---|---|---|---|
> | Hp<3 | 165 | 72 | 43,6 % |
> | Hp<4 | 480 | 72 | 15,0 % |
> | Hp<5 | 1 471 | 73 | 5,0 % |
> | Hp<7 | 13 940 | 78 | 0,6 % |
> | Hp<9 | 78 348 | **89** | **0,1 %** |
>
> La ausencia real a Hp<9 es del **0,1 %** —89 estrellas— y no del 16 %. (El ADR 0018 la redondeó a 0,2 %; la cifra medida es 89/78 348 = 0,11 %.) La saturación tiene un **acantilado en G≈3**: 72 de los 89 vacíos están a Hp<3, y entre Hp 3 y Hp 4 no aparece ninguno nuevo. No es una pendiente por magnitud, es un borde.
>
> Consecuencia práctica: no hay suelo que restar y **no hay umbral de magnitud que elegir**, porque el catálogo entero cabe en ~10 KB. Es la razón de que `gen_hipparcos.py` cruce en local y no por la tabla de vecinos.

**No dar por hecho que Gaia DR4 lo cierre.** El agujero es instrumental —saturación y *gating* del detector—, no una cuestión de tiempo de integración.

## 2. Las 18 dobles brillantes que DR3 no completa

> **Rehecha (2026-08-26).** La tabla anterior contaba fuentes de Gaia dentro de un círculo, por debajo de `máx(mag1,mag2)+1,5`, y llamaba «primaria» a lo que faltaba sin comprobar *cuál* de las dos era la ausente. Mezclaba así dos fallos distintos —no tener la primaria y no tener la secundaria— y además heredaba los errores del `Mag 2` del catálogo de dobles: Zubenelgenubi se publica como 3,2 y Gaia mide su compañera en **G 5,03**, de modo que caía fuera del límite de magnitud y el par parecía incompleto. Zubenelgenubi y Dabih salen de esta tabla por eso: Gaia trae sus dos componentes.

Medición actual, sin límite de magnitud y componente a componente. La primaria es la fila de Hipparcos anclada al par (≤40″, ya propagada a 2016.0) y se da por presente si hay fuente Gaia a <2″; la secundaria se busca en la posición prevista (`sep` y `pa` del catálogo) con tolerancia `máx(2″, 10 %·sep)` en distancia y 10° en ángulo —la tolerancia crece con la separación porque el `pa` viene redondeado a grados, y 1° a 700″ son 12″—.

| Doble | mag1 / mag2 | sep (″) | Qué NO trae Gaia | Qué pone el catálogo | ¿Par completo? |
|---|---|---|---|---|---|
| β Ori (Rigel) | 0,1 / 6,6 | 9,5 | primaria | G 0,2 `medida` | sí |
| Régulo | 1,4 / 8,2 | 177,6 | primaria | G 1,3 `medida` | sí |
| ε CMa | 1,5 / 7,9 | 7,5 | primaria | G 1,5 `medida` | sí |
| Polaris | 2,0 / 8,8 | 18,4 | primaria | G 1,8 `medida` | sí |
| **ζ Ori** | 2,0 / 4,2 | 2,4 | **las dos** | G 1,7 `medida` + G 3,9 `derivada` | sí |
| Dubhe | 2,0 / 7,2 | 384,5 | primaria | G 1,5 `medida` | sí |
| Almaak | 2,3 / 5,1 | 9,6 | primaria | G 1,7 `medida` | sí |
| ε Peg (Enif) | 2,4 / 8,5 | 142,5 | primaria | G 1,9 `medida` | sí |
| Zosma (δ Leo) | 2,5 / 10,9 | 207,8 | secundaria | — | no |
| θ Aur | 2,6 / 7,1 | 3,5 | primaria | G 2,6 `medida` | sí |
| **γ Leo** | 2,6 / 3,8 | 4,5 | **las dos** | G 1,7 `medida` + G 2,8 `derivada` | sí |
| α Gem (Cástor) | 2,9 / 3,8 | 2,0 | **las dos** | G 1,6 `medida` | no |
| δ Her | 3,1 / 8,7 | 8,5 | secundaria | — | no |
| γ Cet | 3,5 / 6,2 | 2,8 | secundaria | G 6,6 `derivada` | sí |
| δ Gem | 3,5 / 5,5 | 0,2 | secundaria | — | no |
| Rasalgethi | 3,5 / 5,7 | 4,9 | primaria | G 2,5 `medida` | sí |
| σ Ori | 3,8 / 4,6 | 0,2 | secundaria | — | no |
| Mekbuda | 3,8 / 3,8 | 0,1 | secundaria | — | no |

**Los dos fallos no son el mismo.** A **9** les falta solo la *primaria*, a **6** solo la *secundaria* y a **3** —ζ Ori, γ Leo y Cástor— les faltan las dos. La saturación de Gaia explica la columna de la primaria, y solo esa: las 9 se cierran con una fila `medida`, de astrometría propia de Hipparcos. Que falte la secundaria es otro problema, y ninguno de sus seis casos es de saturación.

De los 44 pares del catálogo con `mag1 < 4`, `sep` y `mag2`, **18 están incompletos en Gaia DR3 y 12 los cierra el catálogo de estrellas que Gaia no trae**. Los **6 que siguen abiertos** no lo están por el mismo motivo, y ninguno se arregla con más Hipparcos:

- **δ Gem, σ Ori y Mekbuda** (sep 0,2″, 0,2″ y 0,1″): Gaia no los resuelve en dos fuentes, y la posición prevista de la B ya tiene una fuente encima. Escribir la compañera pintaría una tercera estrella donde solo hay dos: lo prohíbe el invariante de «ninguna doble gana una componente de más».
- **α Gem (Cástor)**, sep 2,0″: el campo gana su estrella brillante (fila `medida`), pero el par sigue sin salir resuelto; la fila de Hipparcos es la del sistema cerrado.
- **Zosma**, `mag2` 10,9: la compañera queda por debajo de la muestra `G<10,5` y tampoco está en Hipparcos. Fuera de las dos fuentes.
- **δ Her**: Gaia trae la primaria y no la compañera en la posición prevista; el par es de órbita rápida y el `pa` publicado está caduco.

Estas 18 son solo el tramo `mag1 < 4`. El censo del catálogo entero (226 con `sep` y las dos magnitudes) deja **26 incompletas**, y esa cifra **no la mueve el radio de búsqueda**: con 1,5·sep y con 60″ salen las mismas 26. Son ausencias reales, no de encuadre.

## 3. Por qué Hipparcos y no Tycho-2 ni el WDS

- **Tycho-2 no vale.** También satura: falla en 7 de las 18 (Rigel, ε CMa, Régulo, Dubhe, ζ Ori, γ Leo, α Gem).
- **El WDS es lo que ya tenemos.** Da `sep`, `pa` y magnitudes visuales; no da posición absoluta ni movimiento propio ni color.
- **Hipparcos las tiene las 18**, verificado consultando `public.hipparcos` en el TAP de Gaia (`https://gea.esac.esa.int/tap-server/tap/sync`, ADQL con `CONTAINS(POINT(...), CIRCLE(...))`). Y da cuatro cosas que ahora se asumen:

| Columna | Qué arregla |
|---|---|
| `ra`, `de`, `pmra`, `pmde` | posición **con época**: se propaga a 2016.0 y deja de haber desajuste con Gaia (el que obligó al suelo de 25″ de D2) |
| `rho`, `theta` | separación y **PA medidos**, en vez del PA asumido de 55°. Contraste: Almaak ρ=9,576″ contra 9,6 del catálogo; γ Leo 4,581″ contra 4,5; ζ Ori 2,419″ contra 2,4 |
| `dhp` | Δmag medida entre componentes |
| `sptype`, `b_v` | **color real** en vez de blanco cuando el WDS no trae tipo espectral |

**Salvedad que hay que llevar en la cabeza desde el principio:** Hipparcos da **una fila por sistema cerrado**, no una por componente. Para los pares apretados la B sigue habiendo que sintetizarla — pero desde `rho`/`theta`/`dhp` medidos, no desde un ángulo inventado. Eso es una mejora de calidad, no la desaparición del problema.

## 4. Trabajo a realizar

> **Hecho, de T0 a T4** (2026-08-26). Se conserva como registro del plan, no como trabajo pendiente. T0 y T1 se cerraron midiendo (§1); T2 se decidió en el ADR 0018 y se implementó en los issues #130-#132; T3 borró `parDoble` en el #134; T4 es este cierre. El §6, que recomienda por dónde empezar, ya no aplica.

### T0 — Medir el tamaño real del suplemento (bloquea a todo lo demás)

**Sin esta medida el resto es especulación.** La pregunta: ¿cuántas estrellas de Hipparcos, en los campos que el simulador pinta, no tienen contrapartida en DR3?

Consulta: `public.hipparcos` menos `gaiadr3.gaia_source` (o vía `gaiadr3.hipparcos2_best_neighbour`, descontando el suelo de incompletitud del propio cruce, ver §1).

⚠️ **Aviso operativo, ya pagado:** esta consulta con un `NOT EXISTS` correlacionado **agota el endpoint `sync`** (`ETIMEDOUT`). Hay que lanzarla contra el endpoint **`async`** del TAP de Gaia y sondear el job. No repetir el intento en `sync`.

Salida esperada: número de filas y peso en disco del fichero de datos resultante. Es lo que decide entre las dos opciones de T1.

### T1 — Decidir la forma del suplemento

Dos opciones, y T0 escoge:

- **(a) Estático completo**, patrón `scripts/gen_*.py` → `hipparcos-datos.js`, cargado como los demás catálogos. Sirve para *cualquier* campo con estrella brillante, no solo dobles. Coste: peso del fichero.
- **(b) Recorte solo de dobles**, una fila por entrada del catálogo de dobles. Barato, pero deja sin arreglar el resto de campos brillantes, que es el problema de verdad.

Recomendación de partida: **(a)** si T0 da algo del orden de unos pocos miles de filas por debajo de un umbral de magnitud útil (p. ej. Hp < 7); **(b)** si no.

### T2 — Fusionar Hipparcos con la muestra de Gaia en el render

Dónde: `resources/js/bitacora-gaia-render.js`. Es la parte delicada — hay que decidir **la regla de precedencia y de no-duplicación**, y decidirla con medidas, no de oído:

- cuándo una fila de Hipparcos es la misma estrella que una de Gaia (radio de cruce, con las posiciones ya propagadas a 2016.0, y tolerancia en magnitud);
- quién manda cuando las dos están (recomendado: Gaia, salvo si Gaia la trae claramente saturada);
- cómo se convierte Hp/`b_v` a G/BP–RP para que entre en el mismo modelo de color que el resto — hay relaciones publicadas, hay que citarlas, no ajustarlas a ojo.

Es un cambio en la **fuente de datos** del render, y toca la regla que hoy documenta `simulador_ocular/CONTEXT.md` («Par de una doble», hoy reescrita como «Estrellas que Gaia DR3 no trae»). Por eso necesita **ADR** en `simulador_ocular/docs/adr/`.

### T3 — Replegar `parDoble`

Con T2 dentro, `parDoble` debería quedar reducido a los pares que **ni Gaia ni Hipparcos** traen, o desaparecer. Medir cuántos quedan antes de decidir si se borra. Los tests `scripts/test_par_doble.js` y `scripts/test_almaak_doble.js` marcan el comportamiento que hay que conservar o derogar explícitamente.

### T4 — Cierre

Actualizar `simulador_ocular/CONTEXT.md` (sección «Par de una doble», hoy «Estrellas que Gaia DR3 no trae», y el límite conocido que apunta a este documento), y el ADR de T2 con el resultado medido.

## 5. Criterio de aceptación

Medible, no de impresión:

1. Las 18 dobles de §2 se dibujan con **sus dos componentes**, ninguna sintética con PA asumido.
2. Ninguna doble del catálogo (226) gana una componente de más — el censo de duplicados no empeora respecto a los 6 que deja D2.
3. Un campo con una estrella muy brillante que **no** sea doble (p. ej. Vega, Arturo) deja de tener el agujero de DR3.
4. `node scripts/test_par_doble.js` y `node scripts/test_estrella_fisica.js` en verde, o sus casos derogados a propósito y por escrito.

## 6. Con qué skill ejecutarlo

**Empezar por `/grill-with-docs`.**

Motivo: esto no es una tarea de implementación con la decisión ya tomada. Las decisiones de T1 (forma del suplemento) y T2 (precedencia, cruce, conversión de color) están abiertas, dependen de la medida T0, y cambian una regla ya documentada en `CONTEXT.md` — que es exactamente lo que `/grill-with-docs` sabe hacer: entrevistar hasta cerrar cada rama y dejar el rastro en `CONTEXT.md` y en un ADR.

Ruta completa recomendada, en **una sola ventana de contexto** hasta `/to-tickets`:

1. **`/grill-with-docs`** — resolver T0 primero (es un hecho consultable, no una decisión: se mide, no se pregunta) y con él cerrar T1 y T2. Sale un ADR en `simulador_ocular/docs/adr/`.
2. **`/to-spec`** — convertir el hilo en especificación. Es trabajo de varias sesiones: catálogo generado + fusión en el render + repliegue de `parDoble`.
3. **`/to-tickets`** — partir en tickets tipo bala trazadora, con T0 bloqueando a T1 y T2, y T2 bloqueando a T3.
4. **`/implement`** por ticket, **limpiando el contexto entre uno y otro**.

Lo que **no** encaja: `/implement` directo (las decisiones no están tomadas), `/wayfinder` (esto ya está acotado, no es niebla) y `/triage` (el ticket no llega de fuera, lo genera este documento).

## 7. Material ya medido, no repetir

- Censo de las 46 dobles con `mag1 < 4` contra DR3: 21 limpias, 18 ausentes, 7 desplazadas por movimiento propio.
- Censo de las 226 con `sep` y ambas magnitudes: 26 incompletas, invariantes al radio de búsqueda.
- Barrido del radio de `parDoble` sobre las 226: `1,5·sep` → 28 duplicados; 15″ → 13; 20″ → 10; **25″ → 6**; 30″ → 5; 40″ → 4; 60″ → 3. Incompletas constantes en 26 en todos los casos.
- Tycho-2 comprobado contra las 18: falla en 7.
- `public.hipparcos` comprobado contra las 18: las tiene todas.
- ~~Cruce Hipparcos × DR3 por magnitud: Hp<3 65,5 % sin contrapartida; Hp<4 45,6 %; Hp<5 31,4 %; Hp<6 21,9 %; Hp<7 18,9 %; Hp<9 16,0 % (suelo del propio cruce).~~ **Derogado:** medido a través de `gaiadr3.hipparcos2_best_neighbour`, cuya incompletitud es casi toda esa señal. Las cifras buenas están en el recuadro del §1 (Hp<3 43,6 %, Hp<9 0,1 %).
- Cruce en local, posicional, a 2″: 89 ausentes de 78 348 Hipparcos con Hp<9 y astrometría. 72 de las 89 están a Hp<3.
- Censo por componente de los 44 pares con `mag1 < 4`, `sep` y `mag2` (tabla del §2): 18 incompletos en Gaia, 12 cerrados por el catálogo, 6 abiertos por motivos que no son la saturación.
- Catálogo generado: 108 filas, 88 `medida`, 18 `derivada`, 2 `asumida`. El prerregistro del ADR decía 140 (89/40/11); ver la anotación del ADR 0018.
- Pares que ganan su segunda componente: 24 (`scripts/test_hipparcos.py`), de ellos 15 entre los 232 que publican `sep`. Ninguna doble ya completa recibe una fila de más.

**Ya medido todo lo que este documento dejaba pendiente.** T0 se resolvió en el ADR 0018 y el resto se implementó en los issues #130-#134.
