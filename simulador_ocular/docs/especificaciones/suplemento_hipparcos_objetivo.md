# D3 — Suplemento de Hipparcos para las dobles brillantes

**Estado:** pendiente. No empezado.
**Contexto que lo genera:** la limpieza D2 (quitar la pestaña «Estrellas dobles», mover el catálogo a «Cualquier objeto», ensanchar el radio de búsqueda de `parDoble` a 25″). D2 arregla los **falsos positivos** —estrellas de más—. Este documento es el otro lado: las estrellas **de menos**.

---

## 1. El problema, en una frase

Gaia DR3 satura por arriba. En 18 de las 46 dobles del catálogo con `mag1 < 4`, DR3 no trae una de las dos componentes —o ninguna—, así que el simulador la sustituye por una estrella **inventada**: posición asumida a PA 55° cuando el WDS no publica ángulo, magnitud visual usada como si fuera G, y color blanco si no hay tipo espectral (140 de 289 entradas no lo traen).

No es un problema de dobles. Es un problema de **todo campo que contenga una estrella brillante**: el cruce Hipparcos × DR3 deja sin contrapartida el 65,5 % de las Hp<3, el 45,6 % de las Hp<4 y el 31,4 % de las Hp<5. (Ojo: a Hp<9 el mismo cruce ya deja fuera un 16 %, que es la incompletitud de la propia tabla de cruce; lo atribuible a la saturación de Gaia es el **exceso** sobre ese suelo — unos 50 puntos a Hp<3, unos 30 a Hp<4.)

**No dar por hecho que Gaia DR4 lo cierre.** El agujero es instrumental —saturación y *gating* del detector—, no una cuestión de tiempo de integración.

## 2. Las 18 dobles brillantes que DR3 no completa

Medido contra `gaiadr3.gaia_source` con radio `máx(90″, 2·sep)` y límite `máx(mag1,mag2)+1,5`:

| Doble | mag1 / mag2 | sep (″) | Qué falta |
|---|---|---|---|
| β Ori (Rigel) | 0,1 / 6,6 | 9,5 | primaria |
| Régulo | 1,4 / 8,2 | 177,6 | primaria |
| ε CMa | 1,5 / 7,9 | 7,5 | primaria |
| Polaris | 2,0 / 8,8 | 18,4 | primaria |
| **ζ Ori** | 2,0 / 4,2 | 2,4 | **las dos** |
| Dubhe | 2,0 / 7,2 | 384,5 | primaria |
| Almaak | 2,3 / 5,1 | 9,6 | primaria |
| BD+09 04890 | 2,4 / 8,5 | 142,5 | primaria |
| θ Aur | 2,6 / 7,1 | 3,5 | primaria |
| **γ Leo** | 2,6 / 3,8 | 4,5 | **las dos** |
| Zubenelgenubi | 2,8 / 3,2 | 230,8 | secundaria |
| α Gem (Cástor) | 2,9 / 3,8 | 2,0 | secundaria |
| Dabih | 3,1 / 3,4 | 205,2 | secundaria |
| γ Cet | 3,5 / 6,2 | 2,8 | secundaria |
| δ Gem | 3,5 / 5,5 | 0,2 | secundaria |
| Rasalgethi | 3,5 / 5,7 | 4,9 | primaria |
| σ Ori | 3,8 / 4,6 | 0,2 | secundaria |
| Mekbuda | 3,8 / 3,8 | 0,1 | secundaria |

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

Es un cambio en la **fuente de datos** del render, y toca la regla que hoy documenta `simulador_ocular/CONTEXT.md` («Par de una doble»). Por eso necesita **ADR** en `simulador_ocular/docs/adr/`.

### T3 — Replegar `parDoble`

Con T2 dentro, `parDoble` debería quedar reducido a los pares que **ni Gaia ni Hipparcos** traen, o desaparecer. Medir cuántos quedan antes de decidir si se borra. Los tests `scripts/test_par_doble.js` y `scripts/test_almaak_doble.js` marcan el comportamiento que hay que conservar o derogar explícitamente.

### T4 — Cierre

Actualizar `simulador_ocular/CONTEXT.md` (sección «Par de una doble» y el límite conocido que apunta a este documento), y el ADR de T2 con el resultado medido.

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
- Cruce Hipparcos × DR3 por magnitud: Hp<3 65,5 % sin contrapartida; Hp<4 45,6 %; Hp<5 31,4 %; Hp<6 21,9 %; Hp<7 18,9 %; Hp<9 16,0 % (suelo del propio cruce).

**Sin medir:** el tamaño del suplemento (T0). Es la primera tarea por eso.
