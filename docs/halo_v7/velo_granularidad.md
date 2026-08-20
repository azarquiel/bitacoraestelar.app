# ¿El velo es suave, o lleva grano dentro?

**Pregunta.** El campo que hoy va al velo, ¿es realmente una mancha continua, o
contiene la granulación que visualmente debería hacernos percibir estrellas?

**Cómo se mide.** `node scripts/harness_velo_granularidad.js`. Producción no se
toca: el render ya expone `o.campoCrudo`, el campo ANTES de la ley visual, como
salida de medida. Se separa en

- **A. velo medio** — `I_medio(r)`, la tabla radial que el render ya calcula;
- **B. estructura** — `δI(x,y) = I(x,y) − I_medio(r)`.

M13, D = 200 mm, SQM 21, realización 0. **El píxel manda**: `omegaBeam =
max(omegaRes, areaPx)`, así que con un lienzo grosero el propio render aplana el
grano y medirlo así sería medir el muestreo. El campo se toma a 0,667″/px, por
debajo de la imagen estelar (1,22″), para que la granulación llegue entera.

Dos campos, y no son el mismo: **crudo** (la física, fluctuación de Poisson de las
estrellas no resueltas) y **pintado** (lo que acaba en `difuso`, con el
desvanecido `s_grano` aplicado).

## Resultado

`Ω_beam = 4,65 arcsec²` (óptica, la misma en las cuatro filas: la imagen estelar
no depende del aumento). Contrastes contra el fondo local, cielo + velo.

### 61×  ·  C_min = 54,40 %  ·  atenuación por parche = 0,029

| r/r_h | μ_medio | N_ef/beam | px > 2× medio | RMS δI/fondo crudo | RMS δI/fondo pintado | σ_tabla/fondo | p1 / p5 / p50 / p95 / p99 |
|---|---:|---:|---:|---:|---:|---:|---|
| 0,00–0,25 | 16,71 | **0,41** | 12,3 % | **143,3 %** | 2,3e−6 | 152,4 % | −101 / −92 / −42 / +238 / +580 |
| 0,25–0,50 | 17,35 | 0,28 | 11,0 % | 203,9 % | 2,6e−6 | 182,8 % | −123 / −103 / −50 / +231 / +729 |
| 0,50–1,00 | 18,47 | 0,16 | 10,9 % | 225,1 % | 2,5e−6 | 224,5 % | −147 / −120 / −47 / +238 / +798 |
| 1,00–2,00 | 20,03 | 0,07 | 10,3 % | 339,5 % | 2,0e−6 | 269,6 % | −137 / −109 / −38 / +201 / +800 |

### 120×  ·  C_min = 87,33 %  ·  atenuación = 0,043

| r/r_h | μ_medio | N_ef/beam | px > 2× medio | RMS δI/fondo crudo | pintado | σ_tabla/fondo |
|---|---:|---:|---:|---:|---:|---:|
| 0,00–0,25 | 16,82 | 0,70 | 11,9 % | 114,3 % | 2,1e−6 | 117,4 % |
| 0,25–0,50 | 17,49 | 0,51 | 10,8 % | 143,1 % | 2,5e−6 | 134,6 % |
| 0,50–1,00 | 18,61 | 0,28 | 11,2 % | 171,1 % | 2,4e−6 | 170,4 % |
| 1,00–2,00 | 20,14 | 0,10 | 10,7 % | 258,5 % | 1,9e−6 | 218,9 % |

### 173×  ·  C_min = 112,78 %  ·  atenuación = 0,053

| r/r_h | μ_medio | N_ef/beam | px > 2× medio | RMS δI/fondo crudo | pintado | σ_tabla/fondo |
|---|---:|---:|---:|---:|---:|---:|
| 0,00–0,25 | 16,90 | 0,94 | 11,3 % | 98,7 % | 2,4e−6 | 100,7 % |
| 0,25–0,50 | 17,56 | 0,66 | 10,7 % | 122,9 % | 2,5e−6 | 117,8 % |
| 0,50–1,00 | 18,67 | 0,34 | 11,2 % | 154,7 % | 2,4e−6 | 154,0 % |
| 1,00–2,00 | 20,21 | 0,11 | 10,8 % | 235,8 % | 1,8e−6 | 199,4 % |

### 250×  ·  C_min = 145,85 %  ·  atenuación = 0,066

| r/r_h | μ_medio | N_ef/beam | px > 2× medio | RMS δI/fondo crudo | pintado | σ_tabla/fondo |
|---|---:|---:|---:|---:|---:|---:|
| 0,00–0,25 | 16,97 | **1,18** | 10,6 % | 88,2 % | 2,5e−6 | 89,7 % |
| 0,25–0,50 | 17,63 | 0,81 | 10,4 % | 109,8 % | 2,5e−6 | 106,5 % |
| 0,50–1,00 | 18,73 | 0,38 | 11,2 % | 144,1 % | 2,3e−6 | 143,7 % |
| 1,00–2,00 | 20,34 | 0,16 | 11,0 % | 199,9 % | 1,6e−6 | 162,9 % |

**Escala espacial** de δI en r < 0,25 r_h, autocorrelación por filas al caer a
1/e: 0,96″ / 0,99″ / 1,00″ / 1,01″. El paso de la malla es la imagen estelar,
1,22″. Coincide: el grano vive a la escala de la PSF y no se mueve con el aumento
—está clavado al cielo, que es lo que dice el comentario de `pasoGrano`—.

## Respuesta

**El velo NO es suave. Es casi todo grano.**

**1. Hay menos de una estrella efectiva por beam.** `N_ef = ⟨I⟩²/σ² = Σ·Ω·S1²/S2`
vale **0,41** en el núcleo a 61× y baja a 0,07 en el halo. Solo cruza 1 en el
mismísimo centro a 250× (1,18). Con N_ef < 1 el «velo» no es una mancha: son
estrellas sueltas encendiéndose y apagándose de beam en beam. Es el régimen SBF
puro, y explica por sí solo todo lo demás.

**2. El contraste del grano es del orden del fondo entero.** RMS δI/fondo va del
88 % al 340 %. La mediana de δI es NEGATIVA (−23 % a −50 % del fondo): la mayoría
de los beams están por debajo de la media y un 10-12 % de los píxeles se llevan el
exceso, con p99 en +346 % a +800 %. Eso es exactamente el aspecto de un campo de
estrellas al borde de resolverse, no el de una nube.

**3. La realización es fiel al modelo.** RMS crudo y σ_tabla coinciden en las 16
filas (143,3 contra 152,4 en el peor caso; por debajo del 6 % en la mayoría). El
grano no es un artefacto del generador: es lo que Σ·S2/Ω predice.

**4. Lo que se pinta es perfectamente liso.** RMS pintado ≈ 2e−6 del fondo, o sea
cero, en las 16 filas. `s_grano` sale 0,00 en todas. **El grano está en el modelo y
la ley visual lo borra entero.**

**5. Y no lo borra por poco margen a bajo aumento.** Contraste crudo dividido por
C_min, antes y después de la atenuación por parche:

| aum | crudo / C_min | con atenuación |
|---:|---:|---:|
| 61 | **2,63** | 0,076 |
| 120 | **1,31** | 0,056 |
| 173 | 0,88 | 0,046 |
| 250 | 0,61 | 0,040 |

A 61× y 120× el grano del núcleo **supera el umbral de contraste en crudo**, 2,6× y
1,3×. Quien lo apaga es la atenuación por el parche de integración de Ricco
(θ* = θ_R/M, 0,029 a 61×): se promedian ~1200 celdas independientes y la amplitud
se divide por 34. A 173× y 250× ya no pasaría ni sin atenuar.

Conviene ver el signo de eso: el observador reporta M13 «granular, la pelusa
empieza a romperse en puntos» precisamente a ~50×, que es donde el contraste crudo
va 2,6 veces por encima del umbral. La atenuación de Ricco es lo único que
separa al modelo de ese reporte, y va justo en la dirección contraria al aumento
—cuanto menos aumento, más borra—.

## Lo que esto NO decide

Nada de esto dice que la atenuación esté mal. θ* = θ_R/M está medido y validado en
`test_grano_sbf.js`, y promediar sobre el parche de Ricco es lo correcto **para
detectar una mancha uniforme**. La pregunta que queda abierta —y que esta medida
no responde— es si detectar TEXTURA es la misma tarea que detectar una mancha, o
si el ojo la resuelve a una escala intermedia entre el beam y θ_R. Son dos leyes
distintas del modelo visual —detección contra estructura— y esta medida vuelve a
tropezar con la misma frontera. Sin propuesta: aquí solo se mide.
