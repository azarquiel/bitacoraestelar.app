Fecha: 2026-11-16
Estado: propuesto
Enmienda a: 0012 (ver «Qué sustituye»)

# La fusión del blending en globulares

Spike #542. Pregunta: ¿la fusión geométrica (friends-of-friends sobre el
catálogo) es la ley física correcta del blending en los globulares, en lugar del
sorteo Bernoulli del ADR 0012 (A)?

## 0. Prerregistro (escrito ANTES de correr el prototipo)

Prototipo: `scripts/harness_fusion_blending.js`, sobre
`simulador_ocular/docs/validacion/m13_gaia_dr3.csv`, con el equipo de los
arneses del ADR 0012 (D = 467 mm, 173×, SQM 21). Lee de producción `pob`
(`sigma`, `magnitudes`, `estrellasPorBin`, `completitud`, `radioPropio`),
`tabla.mRes`, `radioImagenAs`, `cHalo`, `cGrano` y `thGranoAs` (ADR 0008). Solo
la partición y el agrupamiento son código nuevo. Nada de esto toca producción.

**Convención de flujo.** La de producción: `F = 10^(−0,4·m)`, con la G de Gaia
tratada como la `m` de la LF (V). `estrellasCumulo` ya compara G contra `m_res`
así. La diferencia de banda no se arregla aquí; se declara.

**La partición (pregunta 4).** Cada estrella del catálogo lleva su flujo `F_j`
en su posición. El velo analítico lleva solo lo que el catálogo no trae:

```
V1(r) = Σ(r) · Σ_k num_k · f_k   · (1 − c(m_k, r))
V2(r) = Σ(r) · Σ_k num_k · f_k²  · (1 − c(m_k, r))
```

con `c = pob.completitud`. Nunca `F_total − ΣF_Gaia` (ADR 0003 lo prohíbe por
nombre).

**Flujo total de una región** (anillo o celda): `T = Σ_{j∈región} F_j + ∫ V1 dΩ`,
con `F_j` contado en la posición de la estrella. La partición produce
`P = D + U + ∫ V1 dΩ`: `D` es el flujo dibujado como punto, contado en la
posición donde se dibuja, y `U` es la luz catalogada no resuelta, contada donde
la deja cada ley. `∫ V1 dΩ` es el mismo término en los dos lados. Por eso el
criterio 2 es, por definición, una prueba de contabilidad del catálogo: dónde
acaba la luz de cada estrella.

- Celdas: rejilla cuadrada de lado `θ_sep = CFG.thetaSepRadios · radioImagenAs`
  sobre los offsets de cielo respecto al centro. Solo cuentan las celdas con
  `T > 0`. `∫ V1` en una celda se toma como `V1(r_centro)·θ_sep²`.
- Anillos: los seis de `harness_crowding_k.js` (≤ 0,25 / 0,5 / 1 / 2 / 4 / 8
  r_h).
- Residuo: `|P − T| / T`. Listón: **< 1e-6 en cada anillo y en cada celda**.

**Grano (criterio 3).** Por anillo:

```
R2 = ( ∫ V2 dΩ  +  Σ_{j∈anillo} F_j² ) / ∫ Σ(r)·S2_total dΩ
S2_total = Σ_k num_k · f_k²   (toda la LF)
σ_R2 = sqrt(Σ_{j∈anillo} F_j⁴) / ∫ Σ·S2_total dΩ
```

`σ_R2` es la dispersión de muestreo de la suma real. Listón: **R2 ≤ 1 + 2·σ_R2
en cada anillo**. Si falla, se mira la causa: catálogo, banda o estrellas de
campo. El listón no se mueve. Se imprime al lado el término que la partición
quita, `∫ Σ·Σ num f² c dΩ`, que es la parte que el `S2campo` de producción
contaría dos veces si la luz catalogada se quedara en su sitio.

**Las candidatas de la pregunta 2, tal cual:**

- (a) FoF con longitud de enlace `θ_sep` sobre todo el fixture. Flujo del blob
  `ΣF` y posición en el centroide pesado por flujo. Se dibuja si
  `m_blob ≤ m_res(r_centroide)`; si no, cada miembro queda en su posición. El
  flujo `D` del blob se cuenta en la celda del centroide. **No** se cuenta en
  las de sus miembros: eso haría pasar el criterio sin medirlo (ADR 0005).
- (b) La imagen es `Σ_j F_j·PSF(x − x_j)` y no se agrupa a mano. La detección
  actúa sobre los picos de esa imagen. Ningún flujo se mueve. En (b) el
  criterio 2 es una **identidad**, no evidencia: se corre como comprobación de
  que el prototipo no reubica luz. El argumento a favor o en contra de (b) es
  óptico.

**Micro-casos** para las preguntas 1 a 3, sin cuentas de estrellas. Son pares y
cadenas sintéticos con una PSF gaussiana de FWHM `0,84·θ_sep`, que es la FWHM
de Airy contra el radio del primer anillo oscuro (`1,03/1,22`). Atajo
declarado: la PSF de producción es un sprite, no una función.

**Pregunta 5.** Hay que decidir si `m_res` tiene que pasar a ser local. Se
calcula `m_res` con el fondo local: `cHalo.Fcielo` más la luz no resuelta en
celdas de lado `thGranoAs`, que es la escala a la que el ojo integra el fondo de
un punto. Se compara con el `m_res(r)` radial. Listón: **si el p95 de
|Δm_res| < 0,1 mag en todos los anillos, el radial vale como aproximación**;
si no, `m_res(x, y)`.

**Pregunta 6.** Contraste RMS de la luz no resuelta a la escala `thGranoAs`,
`δI / (Fcielo + ⟨I⟩)`, contra `cGrano.Cmin`. Si queda bajo `Cmin` en todos los
anillos, la luz no resuelta no puede dibujar los ríos y los dibujan los puntos
resueltos.

**Prohibido como argumento:** cualquier cifra de estrellas dibujadas. El
prototipo imprime flujos, residuos, razones y magnitudes, no cuentas de
dibujadas.

## Resultados (2026-11-16)

Salida completa: `node scripts/harness_fusion_blending.js` (M13, 467 mm, 173×,
SQM 21, `θ_sep = 1,043″`, 11 912 filas dentro de 8 r_h). Diagnóstico de banda:
`--banda V`.

### Criterio 2: conservación por anillo y por celda (listón < 1e-6)

```
ley             ≤0,25    ≤0,5     ≤1      ≤2      ≤4      ≤8    peor celda  celdas ≥1e-6
(b) imagen      0       0       0       0       0       0       0             0/11739  PASA
(a) FoF         0     8e-16   3e-16   3e-16    0     1e-16    5,0e+2        144/11746  NO PASA
prod. 0012 A  2e-16   1e-15    0      3e-15    0     1e-15    1,0e+0      11735/11739  NO PASA
```

- **(b) pasa, y es una identidad** (prerregistrado así): la luz no se mueve.
  Lo que prueba es que la partición cierra. A favor de (b) no prueba nada.
- **(a) no pasa.** Pasa por anillo, pero el blob en el centroide saca de la
  celda de su estrella el 1,47 % del flujo catalogado. El peor caso lleva a
  una celda 500 veces su flujo. Es la objeción del criterio, medida.
- **Producción no pasa en ninguna celda.** Conserva por anillo: lo que el
  sorteo quita se reparte por el anillo, y por eso solo conserva en media. Es el
  «límite que NO arregla» del ADR 0012, ahora con número.

### Criterio 3: el grano no cuenta dos veces (listón R2 ≤ 1 + 2σ)

```
              G tratada como V (prerregistrado)        G→V EDR3 (diagnóstico)
anillo        R2      1+2σ    veredicto              R2      1+2σ    veredicto
≤0,25       2,099    2,194    PASA                 1,132    1,570    PASA
≤0,5        2,010    2,260    PASA                 0,938    1,476    PASA
≤1          2,006    1,872    NO PASA              0,957    1,352    PASA
≤2          2,189    1,922    NO PASA              1,019    1,373    PASA
≤4          1,592    2,131    PASA                 0,748    1,433    PASA
≤8         55,52    45,38     NO PASA             29,77    23,26     NO PASA
```

**Tal como se prerregistró, el criterio 3 NO PASA** (3 de 6 anillos). El
listón no se mueve. Causa, medida y no supuesta:

1. **La banda.** El S2 lo dominan las gigantes rojas (BP−RP ≈ 1), y ahí
   G − V ≈ −0,2 a −0,5 mag. Tratar G como V infla F² por un factor ~2. Con la
   conversión G→V de Gaia EDR3 (doc. CU5, tabla 5.7, σ = 0,03 mag) pasan los
   cinco anillos interiores. Producción también trata G como V
   (`estrellasCumulo`): no es un defecto de la partición, es una deuda que la
   partición destapa.
2. **El anillo exterior son estrellas de campo.** En 4-8 r_h el diagnóstico
   ADR 0003 da `(ΣF_cat + ∫V1)/∫Σ·S1 = 3,2` en V. El fixture no separa
   miembros, y su estrella más brillante (V = 10,6) no es del cúmulo. Es el
   mismo riesgo de #570.

**El doble conteo que la partición quita es casi todo el grano.** La parte
catalogada de S2 (`∫Σ·S2·c / ∫Σ·S2`) es del 99,5 % al 100 % en todos los
anillos. Si la luz catalogada se queda en su sitio y el velo sigue usando el
`S2campo` de producción, el grano se cuenta dos veces casi entero. El velo
**tiene** que llevar `(1 − c)`.

### Micro-casos (preguntas 1 a 3)

```
caso                               (a) FoF     (b) imagen   pico − centroide
par igual, 0,50 θ                  1 punto     1 pico        0,000 θ
par igual, 0,75 θ                  1 punto     2 picos
par igual, 0,95 θ                  1 punto     2 picos
par Δm=2, 0,95 θ                   1 punto     1 pico       −0,126 θ
par Δm=2, 1,50 θ                   2 puntos    2 picos
par Δm=0,75, 0,95 θ                1 punto     2 picos
cadena A–B–C igual, paso 0,60 θ    1 punto     1 pico        0,000 θ
cadena A–B–C igual, paso 0,90 θ    1 punto     3 picos
```

### Preguntas 5 y 6 (escala `θ_R/M = 32,5″`)

```
anillo   p95|Δm_res|  máx|Δm_res|  pregunta 5     RMS δI/(Fcielo+I)  RMS/Cmin
≤0,25       0,015        0,039     radial vale        3,1e-2          0,050
≤0,5        (ninguna celda de 32,5″ tiene su centro en el anillo)
≤1          0,111        0,138     LOCAL              1,1e-1          0,170
≤2          0,090        0,110     radial vale        9,6e-2          0,155
≤4          0,046        0,085     radial vale        5,0e-2          0,080
≤8          0,019        0,056     radial vale        1,9e-2          0,031
```

## Respuestas

**1. La ley del blob.** Flujo `ΣF`, sí: todo el que cae en el pico. La
posición **no** es el centroide pesado por flujo: es el máximo de la imagen
sumada, que se va hacia la componente brillante (−0,13 θ en un par Δm = 2 a
0,95 θ). Coinciden solo en configuraciones simétricas. Visibilidad: la misma
ley de umbral que una estrella sola, aplicada al flujo del pico. Argumento
óptico: un pico sin estructura interna es, para el ojo, indistinguible de una
estrella de ese flujo. El umbral puntual integra en el área de Riccò
(`θ_R/M = 31 θ_sep` aquí), así que no ve la estructura por debajo de `θ_sep`.
Dos estrellas a `m_res + 0,6` a 0,5 θ dan un pico a `m_res − 0,15`, que se ve.
Hoy no aparecen.

**2. Cómo se agrupa: gana (b), (a) se descarta.** Argumento óptico: el
telescopio no agrupa estrellas, suma sus PSF. Lo que el ojo separa lo decide el
perfil de la suma: el criterio de Sparrow (hay mínimo entre picos o no lo hay),
que es el límite de resolución de dos fuentes incoherentes. (a) es una
aproximación de (b) que falla justo donde el ticket preguntaba:
- **Cadenas:** FoF funde A–B–C con paso 0,9 θ en un punto de 1,8 θ de
  ancho. La imagen da tres picos. El 56 % de los grupos múltiples de M13 son
  más anchos que `θ_sep`, y el más ancho mide 3,3 θ.
- **Longitud de enlace:** un par igual se separa desde 0,75 θ (Sparrow con
  esta PSF), no desde θ (Rayleigh). FoF con enlace θ funde pares que la
  imagen separa.
- **Conservación local:** (a) mueve luz entre celdas y (b) no (criterio 2).

**3. `Δmag` sobra.** En (b) la razón de brillos entra por el perfil, sin
parámetro. A 0,95 θ, un par Δm = 2 da un pico (la débil queda en el ala de la
brillante) y un par Δm = 0,75 da dos. `Δmag = 0,75` era un sustituto sin ancla
de lo que el perfil ya dice.

**4. La partición.**

```
imagen   = Σ_{catálogo} F_j·PSF(x − x_j)  +  Σ_{sintéticas} F_s·PSF(x − x_s)  +  V1(r)
V1(r)    = Σ(r) · Σ_k num_k·f_k  ·(1 − c(m_k, r))   [solo m_k > mCutGeneracion]
V2(r)    = Σ(r) · Σ_k num_k·f_k² ·(1 − c(m_k, r))   [ídem]
```

- Conserva por anillo y por celda (criterio 2) y no cuenta dos veces el grano
  si la banda es la misma (criterio 3 en V).
- La fluctuación de la luz catalogada es real y la trae el catálogo. El grano
  sintético (ADR 0015) solo lleva `V2`, la parte no catalogada.
- **Sintéticas:** entran en la suma como cualquier estrella. Son una
  realización de `(1 − c)·LF` para `m ≤ mCutGeneracion`, así que su parte sale
  de `V1`/`V2` (de ahí el corchete). Sus posiciones son aleatorias, y por eso
  sus fusiones son una realización de Poisson, no estructura. Es la misma
  estadística que el ADR 0012 sorteaba, ahora sin sorteo. Excluirlas de la suma
  obligaría a tratar su luz aparte, y eso es un doble camino.
- **Prerrequisitos** (destapados por el criterio 3, no son de la partición):
  flujo del catálogo en la banda de la LF (G→V con BP−RP) y separar miembros de
  campo en el halo exterior.

**5. El fondo local deja de ser radial: `m_res(x, y)`.** Por el listón
prerregistrado: p95 |Δm_res| = 0,111 > 0,1 en 0,5-1 r_h. Es un margen
estrecho, y se declara así. La escala correcta del fondo de un punto es la de
integración del ojo, `θ_R/M` (Riccò, ya calibrada en H2c), no `θ_sep`. El
punto fijo del ADR 0012 (B) (N = 5 desde `m_res = +∞`) se conserva como
esquema numérico; lo que cambia es su dominio, que pasa de anillos a celdas de
`θ_R/M`. Límite: el anillo 0,25-0,5 r_h no tiene celdas a esta escala.

**6. Los ríos oscuros.** No hay fuente primaria que diga positivamente que son
fluctuación de la distribución de estrellas. Lo que se encontró es divulgación
(APOD 2025-08-14, Sky & Telescope) y no se cita como evidencia. Lo que sí hay
es la fuente primaria que **descarta el polvo**: Barmby et al. 2009 (AJ 137,
207; Spitzer/MIPS, M13 entre los ocho cúmulos). Da para M13 una masa de polvo
< 1,5e-4 M☉ en total y < 2,3e-5 M☉ en el núcleo (3σ). Argumento de orden de
magnitud:
- Tres bandas de 1′ × 0,1′ a 7,1 kpc ocupan 1,2e37 cm².
- Con `N_H/A_V = 1,87e21 cm⁻² mag⁻¹` (Bohlin, Savage & Drake 1978, R_V = 3,1)
  y polvo/gas 0,01, una banda de `A_V = 0,02` (un 2 % de oscurecimiento, del
  orden del contraste umbral) pide unos 5e-3 M☉ de polvo.
- Son unas 35 veces el límite total de Barmby.

Por eliminación, los ríos son distribución de estrellas, y la ley candidata
los tiene que reproducir sin parámetro nuevo.

**Qué componente los dibuja: los puntos resueltos.** La luz no resuelta, ya
en su sitio, tiene un contraste RMS de 0,03 a 0,17 veces el umbral `Cmin` a la
escala de integración del ojo, en todos los anillos. No puede dibujar ríos.
Con (b) se dibujan solos o no se dibujan: las estrellas resueltas ya están en
sus posiciones de Gaia. Lo que (b) añade es que los pares fundidos dejan de
desaparecer (sorteo) o de duplicarse (dos sprites). Que los ríos de M13 se vean
es una predicción de (b) que se comprueba después, no un argumento a favor.

## Veredicto

**Sí: la ley físicamente correcta es (b), la imagen sumada**, y la fusión
geométrica (a) se descarta. El criterio 3 prerregistrado no pasa, pero su causa
medida es la banda del catálogo y las estrellas de campo, no la partición. Los
dos son prerrequisitos del ticket de implementación.

## Qué sustituye del ADR 0012

- **(A), entera.** Fuera el sorteo Bernoulli de las catalogadas: el blending
  sale de las posiciones, de forma determinista.
- **`Δmag`** (`CFG.dmagCrowd`) sale.
- **`aCrowd` y `θ_sep` como ley** salen para el catálogo. `θ_sep` sobrevive
  solo como tamaño de celda de los tests.
- **(B)** se conserva como esquema numérico (N = 5), con dominio local `θ_R/M`.
- **El reparto `(1−a)·F` al velo** sale. El velo lleva `(1 − c)`, no `(1 − a)`.

## Parámetros

| parámetro | entra/sale | ancla |
|---|---|---|
| `Δmag = 0,75` | sale | sin ancla (ADR 0012 ya lo declaraba) |
| `thetaSepRadios = 1` como ley de mezcla | sale | tenía ancla (Rayleigh); la sustituye la PSF |
| sorteo Bernoulli `C.sorteo` | sale | sin parámetro |
| criterio de resolución: máximo local de la imagen sumada | entra | Sparrow 1916; sin parámetro libre |
| forma de la PSF del pico | entra | `radioImagenEstelar` (Airy ⊕ seeing), ya anclado |
| escala del fondo local `θ_R/M` | entra | Riccò, la de H2c (ya calibrada) |
| `completitud` en el velo (`gaiaM50`, `gaiaAncho`, `gaiaFwhmAs`, `gaiaCrowdingK`) | entra en el velo | los existentes de `CFG`; su ancla no se revisa aquí |
| G→V con BP−RP | entra (prerrequisito) | Gaia EDR3, doc. CU5, tabla 5.7 (σ = 0,03 mag) |

Ninguna cifra de estrellas dibujadas se usa en este ADR a favor ni en contra.

## Límites declarados

- El fixture no trae los pares más cerrados que 0,6″ (FWHM de Gaia). Lo
  fundido sobre el catálogo se queda corto en el núcleo.
- La PSF de los micro-casos es gaussiana (FWHM 0,84 θ). El umbral de Sparrow
  exacto con Airy ⊕ seeing moverá el 0,75 θ, no la conclusión.
- Preguntas 5 y 6 usan el `m_res` de producción para clasificar «no resuelta» y
  `Cmin` contra el cielo, no contra el fondo local. El margen de la 6 es de
  ≥ 5,9×.
- Un solo cúmulo y un solo equipo. Generalizar es trabajo de la implementación.

## Guardianes que la implementación tendrá que reescribir

`grep -lE "aCrowd|sorteo\(|S1campo|S2campo|Fdibujado|dmagCrowd|estrellasCumulo|pasadasPuntoFijo" scripts/*.js`:

- Tests: `test_crowding_psolo`, `test_conservacion_sorteo` (pasa a conservación
  por celda), `test_cumulo_render`, `test_cumulos`, `test_grano_sbf`,
  `test_sbf_momentos`, `test_halo_v7_e1`/`e2`/`e4`, `test_cola_glow_rt`,
  `test_halo_exterior_lineal`, `test_censo_crumey`,
  `test_veredicto_rotura_nucleo`.
- Matrices y arneses: `matriz_m13`, `veredicto_rotura_nucleo`,
  `harness_atenuacion_bernoulli`, `harness_thetasep`, `harness_punto_fijo`,
  `harness_crowding_k`, `harness_doble_conteo_cola`, `harness_halo_v7`,
  `harness_grano_sbf`, `harness_mres_vs_schaefer`,
  `harness_tres_modelos_mres`, `harness_censo_crumey`.
