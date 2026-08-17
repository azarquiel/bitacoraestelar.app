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
   puede anclar contra las dos verdades independientes y contra la resolución
   real del instrumento, cosa que `k` no permite. La sensibilidad es fuerte y hay
   que calibrarla, no elegirla: en el núcleo de M13, 128 / 77 / 41 estrellas para
   `θ_sep` = 0,5 / 1,0 / 1,5 FWHM.

## Las dos sub-decisiones que se cierran MIDIENDO, no aquí

Este ADR fija la dirección y los invariantes. Dos puntos quedan abiertos a
propósito, con su criterio de aceptación, porque decidirlos por intuición es
precisamente el error que el ADR 0004 prohíbe.

### (A) Qué significa `a` para la estrella dibujada

`P_solo` es una PROBABILIDAD de no tener vecina en el beam. Atenuar el flujo por
`a` acierta la media y falla la varianza: el blending no apaga una estrella,
funde dos en un blob más brillante. En el núcleo con `a ≈ 0,5` las dos lecturas
pintan cosas distintas y ambas conservan el flujo:

- **Atenuación** — 154 estrellas al 50 % de brillo. Continua, no parpadea al
  mover el zoom. El corte contra `mlim` lo acaba decidiendo la magnitud, no la
  vecindad.
- **Bernoulli** — sorteo por estrella con semilla del `source_id` de Gaia
  (determinista y reproducible, sin RNG global): ~77 a brillo íntegro, ~77 al
  velo con su flujo entero. Cuenta y varianza correctas; se lleva por igual a
  brillantes y débiles, que es lo que hace la física.

**Criterio:** gana la que reproduzca las dos verdades del banco por anillo, no la
que quede mejor. Si empatan en cuenta, gana la atenuación por estabilidad
temporal. Se mide antes de tocar producción.

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

1. Test rojo primero, como en el ADR 0011: conservación
   `Ftotal = Fdibujado + Sigma·S1campo` con `a = P_solo`, sobre las 12 filas de
   cúmulo × equipo. Debe ir rojo con la ley de hoy.
2. Barrido de `θ_sep` contra las dos verdades, por anillo. Calibración.
3. (A) y (B), medidas.
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

No va a hacer que el render se parezca más a una foto de M13. Dirección medida
del cambio: el núcleo GANA estrellas (70 → 77–89) y la corona PIERDE más
(403 → 366 dentro de 1 r_h); el cúmulo entero baja de 1575 a ~1517. La foto
resuelve mejor que el beam de 2,09″ a 173× y enseña pares que el simulador no
debe separar. Se hace porque la ley actual es incorrecta en la forma, no para
subir la cuenta.
