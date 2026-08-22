# ¿A qué escala espacial se juzga el grano? Barrido de la escala de integración

**Pregunta.** Hay dos escalas en juego —la PSF (1,22″) y θ_R/M (85″ a 61×)—.
¿Existe una escala INTERMEDIA en la que la señal granular se conserve de forma
físicamente razonable y reproduzca el comportamiento observacional de M13?

**Cómo se mide.** `node scripts/harness_escala_grano.js [frac_rh]`. Producción no
se toca: la escala es variable de medida. Píxel a 0,25″, muy por debajo de la
imagen estelar, para que el muestreo no aplane nada antes de promediar.

- `A(θ)` — RMS de δI = crudo − I_medio(r) tras promediar sobre una caja de lado
  θ. **Medida sobre el campo, no predicha.** El perfil se resta ANTES de
  promediar: si no, una caja grande mide la pendiente del cúmulo, no el grano.
- `C(θ) = A(θ)/fondo`, fondo = cielo + velo local.
- `Cmin(θ) = ctxFotometrico(cielo, θ/60).Cmin`, la ley H2c a esa escala.
- `razón = C(θ)/Cmin(θ)`. Mayor que 1 = el grano se vería.

## Corrección de la medida anterior

`velo_granularidad.md`, punto 5, decía que a 61× el grano superaba el umbral «en
crudo» por 2,63×. **Estaba mal**: tomaba la amplitud en el beam y el umbral en
θ_R/M. Dos escalas distintas, y su cociente no significa nada. Evaluadas ambas a
la misma θ, la razón en el beam es 0,0059 — no 2,63. La conclusión de aquel
documento que sigue en pie es la otra: el velo no es suave (N_ef = 0,41
estrellas por beam). La que se retira es la de que el grano «pasaba el umbral y
lo apagaba Ricco».

## Resultado, núcleo r < 0,25 r_h

Contrastes en % del fondo local. θ_beam = 2,43″, imagen estelar 1,22″.

### 61×  ·  θ_R = 86,6′ aparentes  ·  θ* = θ_R/M = 85,2″

| escala | θ (″) | C(θ) medido | C(θ) predicho √n | Cmin(θ) | razón |
|---|---:|---:|---:|---:|---:|
| 0,5× PSF | 0,61 | 137 | 170 | 23 700 | 0,0058 |
| 1× PSF | 1,22 | 113 | 170 | 19 000 | 0,0059 |
| 2× PSF | 2,43 | 76,6 | 170 | 10 700 | 0,0072 |
| 4× PSF | 4,86 | 44,0 | 84,9 | 4 030 | 0,0109 |
| 8× PSF | 9,73 | 22,4 | 42,4 | 1 250 | 0,0179 |
| 16× PSF | 19,46 | 12,4 | 21,2 | 390 | 0,0318 |
| **32× PSF** | **38,91** | **5,79** | 10,6 | 138 | **0,0419** |
| 64× PSF | 77,83 | 1,04 | 5,30 | 59,7 | 0,0174 |
| θ* [producción] | 85,21 | 0,613 | 4,84 | 54,4 | 0,0113 |

### 120×  ·  θ* = 57,0″

| escala | θ (″) | C medido | Cmin | razón |
|---|---:|---:|---:|---:|
| 1× PSF | 1,22 | 91,5 | 14 000 | 0,0065 |
| 8× PSF | 9,73 | 18,2 | 991 | 0,0183 |
| 16× PSF | 19,46 | 10,2 | 334 | 0,0305 |
| **32× PSF** | **38,91** | **4,68** | 132 | **0,0354** |
| θ* [producción] | 56,97 | 2,11 | 87,3 | 0,0242 |
| 64× PSF | 77,83 | 0,891 | 65,5 | 0,0136 |

### 173×  ·  θ* = 45,8″

| escala | θ (″) | C medido | Cmin | razón |
|---|---:|---:|---:|---:|
| 1× PSF | 1,22 | 79,8 | 12 000 | 0,0067 |
| 16× PSF | 19,46 | 9,03 | 315 | 0,0286 |
| **32× PSF** | **38,91** | **4,17** | 134 | **0,0312** |
| θ* [producción] | 45,83 | 3,07 | 113 | 0,0272 |
| 64× PSF | 77,83 | 0,811 | 71,2 | 0,0114 |

### 250×  ·  θ* = 36,8″

| escala | θ (″) | C medido | Cmin | razón |
|---|---:|---:|---:|---:|
| 1× PSF | 1,22 | 71,7 | 10 200 | 0,0070 |
| 16× PSF | 19,46 | 8,22 | 303 | 0,0271 |
| **θ\* [producción]** | **36,81** | **4,17** | 146 | **0,0286** |
| 32× PSF | 38,91 | 3,81 | 138 | 0,0276 |
| 64× PSF | 77,83 | 0,754 | 79,2 | 0,0095 |

### El máximo, con rejilla logarítmica densa entre 2″ y 100″

| aum | θ óptimo | razón máx | θ* = θ_R/M | razón en θ* | ganancia sobre producción |
|---:|---:|---:|---:|---:|---:|
| 61 | 37,6″ | 0,0424 | 85,2″ | 0,0113 | ×3,76 |
| 120 | 35,2″ | 0,0364 | 57,0″ | 0,0242 | ×1,50 |
| 173 | 33,0″ | 0,0325 | 45,8″ | 0,0272 | ×1,19 |
| 250 | 29,0″ | 0,0296 | 36,8″ | 0,0286 | ×1,04 |

**Control de borde.** El máximo no se mueve al cambiar la región medida: con
r < 0,25 / 0,5 / 1,0 r_h el argmáx se queda en 38,9″ y solo sube el nivel
(0,042 → 0,061 → 0,075). No es un artefacto del tamaño de la ventana.

## Respuesta

**No. No hay transición, y no hay escala que rescate el grano.**

**1. La razón tiene máximo, pero es plano y bajísimo.** Entre 2″ y 100″ la curva
sube, hace cima en 29-38″ y baja. La cima vale **0,030 a 0,042**: al grano le
faltan **×24 a ×34** para verse. Ninguna escala del barrido pasa de 0,08. No hay
codo, no hay salto, no hay régimen nuevo: es una loma suave.

**2. El óptimo no es θ_R/M, pero tampoco es otra cosa limpia.** Va de 37,6″ a
29,0″ mientras el aumento va de 61× a 250× — se mueve ×1,30 cuando θ_R/M se mueve
×2,32. Ni fijo en la escena ni proporcional a 1/M: queda a medio camino, que es lo
que pasa cuando el óptimo lo fija la CURVATURA de dos leyes que se cruzan y no una
escala física propia. No es la variable que falta.

**3. Lo que sí queda acotado: producción integra de más a bajo aumento.** A 61×
usa θ* = 85,2″ cuando el óptimo está en 37,6″, y eso le cuesta ×3,76 de razón. A
250× θ* = 36,8″ y el óptimo 29,0″: ×1,04, prácticamente nada. Es un hallazgo real
y pequeño —y no cambia el resultado, porque ×3,76 sobre 0,0113 sigue siendo
0,042—.

**4. La atenuación √n de producción es GENEROSA, no severa.** El C predicho
(σ_beam · θ_beam/θ) va por encima del medido en todo el barrido: ×1,8 a 39″ y ×5,1
a 78″. El campo real se promedia más deprisa que celdas independientes, porque
δI tiene media nula a cada radio por construcción —la parte de gran escala ya
está en el velo medio, que es la componente A—. Producción, si acaso, deja
sobrevivir más amplitud de la que hay.

**5. Y tampoco reproduciría la observación.** La razón máxima va de 0,042 a 61× a
0,030 a 250×: **baja** con el aumento, cuando el observador ve M13 cada vez más
resuelto. La dependencia del aumento que reporta el observador no puede salir del
grano bajo ninguna escala: sale de estrellas cruzando m_res, que es lo que ya
hace el modelo (`mres_vs_schaefer.md`).

## Consecuencia

La escala de integración queda descartada como la variable que falta, con
medida. Lo que queda en pie es la sospecha de fondo, y ahora está aislada: el
umbral `Cmin` es una ley de **detección de una mancha uniforme** contra el fondo,
y se le está preguntando por **textura**. Un campo con N_ef = 0,41 estrellas por
beam y contraste RMS del 88-340 % no es una mancha tenue: es un campo de puntos
al borde de resolverse, y la tarea visual correspondiente —«¿esto está moteado o
es liso?»— no es la que Cmin modela, a ninguna escala.

Si se decide seguir, la vía no es retocar el halo ni la escala: es un tratamiento
propio de granularidad/SBF con su propio umbral. Esta medida no lo propone ni lo
justifica todavía; solo cierra la puerta a la alternativa barata.
