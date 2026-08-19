# El crowding es una probabilidad por estrella, no un umbral duro

La Capa 1 decide qué estrella se resuelve con un umbral en densidad:
`N(≥m, r)·Ω_beam ≥ 1/k` con `k = crowdingCriterion = 30`. Todo lo más débil que
`m_crowd(r)` pasa al velo de golpe, suavizado solo por la banda `δ` alrededor de
la frontera.

`scripts/harness_crowding_k.js` midió esa ley contra dos verdades independientes
y sin parámetros del modelo —geometría sobre las posiciones reales de Gaia, y
`P_solo` de Poisson invirtiendo el propio `mCrowd`—, que concuerdan al 0,4 %.
Veredicto completo en `docs/halo_v7/diagnostico_estrellas_perdidas.md`.

El valor de `k` no es el problema. La forma funcional sí. El `k` que cada anillo
de M13 necesitaría para dar la cuenta correcta:

```
r/r_h    0,25   0,50   1,00   2,00   4,00   8,00
k        18,8   31,6   45,0   82,0  249,6 1576,4
```

Dos órdenes de magnitud. No existe `k` global porque un umbral en densidad no
puede representar una probabilidad por estrella: fuera de `r_h` la mezcla es un
efecto de PARES, y allí `m_crowd` ni siquiera muerde. Ajustar `k` es perder el
tiempo, y elegirlo por cómo queda la imagen violaría el ADR 0004.

**Decidido:**

1. El crowding pasa a ser una atenuación continua por estrella, la misma que las
   verdades del banco ya miden:

   ```
   a(m, r) = P_solo = exp(−n(≥ m+Δmag, r) · π θ_sep²)
   ```

   `n` es la densidad superficial de estrellas más brillantes que `m+Δmag` a
   radio `r` —la que la propia LF de la Capa 1 ya da—, y `θ_sep` la separación
   mínima resoluble del beam.

2. El reparto conserva el flujo, exactamente como el ADR 0011:

   ```
   estrella de flujo F  →  a·F   dibujada
                        →  (1−a)·F   al velo (S1campo / S2campo)
   ```

   El complemento es exacto, no aproximado. `Fdibujado = Ftotal − S1campo` sigue
   siendo la definición, no una medida.

3. `P_solo` SUSTITUYE a `m_crowd` y a la banda `δ`, no se suma a ellas. Son dos
   atenuaciones del mismo fenómeno; mantener ambas sería contarlo dos veces.
   `crowdingCriterion` y `delta` desaparecen de `CFG`.

4. Cambio honesto de parámetros: se va `k` (semi-libre, rango 10–50 en la
   literatura) y `δ`; entran `θ_sep` y `Δmag`. **No es una ley sin parámetros
   libres.** Lo que se gana es que la forma radial sale sola, y que `θ_sep` se
   puede anclar contra la resolución real del instrumento, cosa que `k` no
   permite. La sensibilidad es fuerte y hay que anclarla, no elegirla: en el
   núcleo de M13, 128 / 77 / 41 estrellas para `θ_sep` = 1 / 2 / 3 radios de
   imagen estelar.

   **ANCLADO (2026-08-19).** `θ_sep = 1 radio de imagen estelar`
   (`radioImagenEstelar` = Airy ⊕ seeing): el criterio de Rayleigh literal sobre
   la imagen que el render dibuja de verdad, que es el mismo eje óptico con el
   que `resolucionDoble` juzga una doble. No sale de ajustar nada; el barrido no
   lo podía fijar (ver el paso 2 del orden de trabajo). De paso se corrige una
   unidad falsa: el antiguo `fwhmAs` valía DOS radios y no era una FWHM
   —`radioAiry` es el radio del primer anillo oscuro—, así que el `thetaSepFwhm:
   1,0` de antes equivalía a 2× Rayleigh. Hoy la constante es
   `CFG.thetaSepRadios = 1,0` y el render expone `radioImagenAs`. Informe:
   `docs/halo_v7/ancla_thetasep_criterio_dobles.md`.

   `Δmag = 0,75` se queda **SIN ANCLA PROPIA**, y así se declara: el barrido no
   lo distingue y la literatura de dobles solo ofrece penalizaciones heurísticas
   por Δm. Es el parámetro débil de la ley.

## Las dos sub-decisiones que se cierran MIDIENDO, no aquí

Este ADR fija la dirección y los invariantes. Dos puntos quedan abiertos a
propósito, con su criterio de aceptación, porque decidirlos por intuición es
precisamente el error que el ADR 0004 prohíbe.

### (A) Qué significa `a` para la estrella dibujada

`P_solo` es una PROBABILIDAD de no tener vecina en el beam. Atenuar el flujo por
`a` acierta la media y falla la varianza: el blending no apaga una estrella,
funde dos en un blob más brillante. En el núcleo con `a ≈ 0,5` las dos lecturas
pintan cosas distintas y ambas conservan el flujo:

- **Atenuación** — cada estrella al `a` que le toque. Continua. El corte contra
  `mlim` lo acaba decidiendo la magnitud, no la vecindad.
- **Bernoulli** — sorteo por estrella con semilla del `source_id` de Gaia
  (determinista y reproducible, sin RNG global): se dibuja entera o va entera al
  velo. Se lleva por igual a brillantes y débiles, que es lo que hace la física.

**Criterio:** gana la que reproduzca las dos verdades del banco por anillo, no la
que quede mejor. Si empatan en cuenta, gana la atenuación por estabilidad
temporal. Se mide antes de tocar producción.

### RESUELTO (2026-08-19): gana BERNOULLI

`scripts/harness_atenuacion_bernoulli.js`, informe en
`docs/halo_v7/atenuacion_vs_bernoulli_adr0012.md`. **El criterio de arriba, tal
como estaba escrito, no selecciona nada**, y eso es parte del resultado:

- **La cuenta empata por álgebra, no por suerte.** `E[Bernoulli] = Σa`
  exactamente; medido, 0,39 estrellas de diferencia sobre 1713. Un criterio
  basado en la cuenta no podía discriminar (ADR 0005).
- **El desempate tampoco desempata.** «Gana la atenuación por estabilidad
  temporal» asumía que el sorteo parpadea al mover el ocular. La premisa es
  falsa: `aCrowd(m, r, radioImagenAs)` no lleva aumentos dentro, así que `a` no
  se mueve y la decisión sembrada por estrella tampoco. MEDIDO a 61×/120×/173×/
  250×: **0 parpadeos de 1971 comparaciones, máx |Δa| = 0**.
- El flujo empata (los dos conservan; el sorteo con −0,012 % sobre 200 semillas).
- La varianza NO es el argumento a favor de Bernoulli: el hueco de 29 estrellas
  contra la geometría está a 2,8-3,1σ del sorteo, o sea es SESGO de la ley (el
  del paso 2), y ninguna realización lo cierra.

**Lo único que las separa contra la verdad del banco es QUÉ estrellas se
pierden**, y la geometría lo dice estrella a estrella. Atenuar resta
`2,5·log10(a)` magnitudes, así que la estrella atenuada puede cruzar `mlim` y
desaparecer. Cuartil más débil de las visibles, G ≥ 15,73 (referencia: 25 %):

```
conjunto que se pierde        n   G medio   % del cuartil débil
verdad geométrica            56     15,41          50,0 %
ATENUACIÓN (borradas mlim)   80     16,08         100,0 %
BERNOULLI (no dibujadas)     81     15,39          38,3 %
```

Pierden el mismo número; la atenuación pierde **exclusivamente** el cuartil
débil. Convierte un efecto de vecindad en un corte por magnitud, que es justo lo
que esta ley venía a quitar. Bernoulli reproduce el reparto de la verdad.

**Decidido: Bernoulli.** No por la cuenta ni por la varianza —ahí empata o no
aplica— sino por el reparto de magnitudes de lo perdido.

**Límite que NO arregla ninguno de los dos:** el blending funde dos estrellas en
un blob más brillante, y los dos esquemas mandan la luz perdida al velo. Esa luz
reaparece como fondo, no como punto. Elegir entre (A) no lo toca.

### (B) Cómo se rompe el punto fijo

Hoy `tablaCumulo` arranca el velo en el listón del crowding
(`I0 = Sigma·S1campo(m_crowd)`) y cierra con el `m_lim,sky` que ese velo produce:
UNA iteración, y funciona porque `m_crowd` es la única cota que no depende del
cielo. Con `a(m,r)` esa semilla desaparece —`a` depende de la densidad de
estrellas dibujadas, que depende del cielo, que depende del velo—, y el
acoplamiento pasa a ser un punto fijo de verdad.

Que el crowding mueva `m_lim,sky` NO es un defecto a corregir: el velo *es* el
fondo local. Medido a 0,1 r_h, con `k ≤ 5` manda el cielo con holgura (m_res
14,45 contra m_crowd 17,96) y aun así `m_res` cae media magnitud al subir `k`.
Eso es física, no fuga de abstracción. Lo que hay que decidir es el esquema
numérico.

**Criterio:** sembrar `a` con la densidad TOTAL (independiente del cielo) y cerrar
con una pasada, o iterar N veces. Se mide cuánto se mueve `m_res` entre
iteraciones y se elige el mínimo N que estabilice por debajo de 0,01 mag. El
criterio de parada no puede vivir dentro de la imagen (misma razón que la nota
actual de `tablaCumulo`).

## Orden de trabajo

1. ~~Test rojo primero~~ **hecho**: `scripts/test_crowding_psolo.js`, sobre las
   12 filas de cúmulo × equipo. Tres asserts: A1 (la ley es una atenuación
   válida: `0 ≤ a ≤ 1`, monótona en `m`, continua en `r`) y A2 (complemento
   exacto, residuo 2,4e-15) están **verdes**; A3 —el velo del render es el
   complemento de `P_solo`— está **rojo**, con una fuga del 30,5 % al 60,1 %
   según cúmulo y equipo (medido con `θ_sep = 1 radio`; la fuga crece al bajar
   la apertura, porque el velo del render se dispara y el de la ley no). La ley vive en la Capa 1 (`pob.aCrowd`, con
   `CFG.thetaSepRadios` y `CFG.dmagCrowd`) y todavía no la llama nadie: el test
   mide producción, no se reimplementa la ley (ADR 0008).

   NO entra en `suite_halo_v7` hasta que A3 esté verde; hasta entonces se corre
   suelto y su exit code 1 es el resultado esperado.
2. ~~Barrido de `θ_sep` contra las dos verdades, por anillo~~ **hecho**:
   `scripts/harness_thetasep.js`, informe en
   `docs/halo_v7/calibracion_thetasep_adr0012.md`. Tres resultados. La FORMA
   pasa: un solo `θ_sep` reproduce el déficit por anillo dentro de un factor 1,2
   sobre dos órdenes de magnitud en densidad, frente al `k` que necesitaba
   18,8-1576,4. El VALOR no se puede fijar así: la verdad geométrica se construye
   con el mismo `θ_sep` y se mueve con él —peor razón 1,11-1,38 en todo el
   barrido, sin mínimo—, de ahí el ancla del punto 4. Y la segunda verdad del
   banco —Poisson invirtiendo `mCrowd`— resulta ser la MISMA fórmula que
   `aCrowd`: se degrada a comprobación de identidad para no dar un criterio vacuo
   (ADR 0005).
3. (A) ~~atenuación contra Bernoulli~~ **hecho**: gana Bernoulli.
   `scripts/harness_atenuacion_bernoulli.js`,
   `docs/halo_v7/atenuacion_vs_bernoulli_adr0012.md`. (B), el esquema del punto
   fijo, pendiente.
4. Implementación y reescritura de guardianes.

Blast radius conocido: `S1campo`/`S2campo` (ADR 0011), `CFG.delta`,
`CFG.crowdingCriterion`, `completitud`, `tablaCumulo`, y los guardianes
`test_banda_conservacion`, `test_cumulo_render`, `test_grano_sbf`,
`test_halo_v7_e1`/`e2`, `matriz_m13`.

## Sobre el ADR 0007

Una sola capa física por investigación. Esto toca crowding y banda de transición
a la vez, pero no son dos capas: son dos mitades de la MISMA frontera
resuelto/no-resuelto, y el punto 3 es justamente que hoy están duplicadas.
Separarlas en dos iteraciones dejaría un estado intermedio que cuenta la
atenuación dos veces.

## Lo que esta decisión NO arregla

No va a hacer que el render se parezca más a una foto de M13. Se hace porque la
ley actual es incorrecta en la FORMA, no para mover la cuenta.

**Previsión corregida (2026-08-19), con el ancla `θ_sep = 1 radio de imagen
estelar`.** La primera redacción de este ADR daba «el núcleo gana estrellas
(70 → 77–89), la corona pierde más (403 → 366), el cúmulo entero baja de 1575 a
~1517». Esos números eran los de `θ_sep = 2 radios`, o sea la unidad falsa que el
punto 4 corrige. Con el ancla, medido en `harness_thetasep.js` (M13, D=467 mm,
173×, SQM 21, Δmag 0,75) contra el render de hoy con `k = 30`
(`harness_halo_estrellas.js`):

```
                      hoy (k=30)   con el ancla
núcleo ≤0,25 r_h            70          128
corona 0,5–1 r_h           403          420
cúmulo entero (≤8 r_h)    1575         1713
```

**La dirección se invierte: el cúmulo GANA estrellas, no las pierde.** Eso no es
un argumento a favor ni en contra —elegir el parámetro por la cuenta o por cómo
queda la imagen sigue prohibido (ADR 0004)—, pero la frase «el núcleo gana y la
corona pierde más» ya no describe el resultado esperado y no debe citarse.

Sigue en pie lo demás: la foto resuelve mejor que el beam de 2,09″ a 173× y
enseña pares que el simulador no debe separar.
