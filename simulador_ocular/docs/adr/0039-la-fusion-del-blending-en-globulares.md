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
`--banda V`. Desde #574 el arnés corre en V por defecto (la conversión es la de
producción, `magVGaia`) y la columna prerregistrada sale con `--banda G`.

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
listón no se mueve. Además, ni sus PASA ni sus NO PASA dicen nada del doble
conteo, por dos motivos:

- **La ausencia de doble conteo es álgebra, no medida.** `c + (1 − c) = 1`: el
  velo lleva exactamente la parte que el catálogo no trae. Lo que R2 compara
  es la realización del catálogo contra la LF, o sea el diagnóstico del ADR
  0003 en el segundo momento.
- **El estadístico no tiene potencia.** `1 + 2σ` llega a 2,26, así que un
  doble conteo completo (R2 ≈ 2) pasaría. Los anillos ≤0,25 y ≤0,5 «pasan»
  con R2 ≈ 2. Prerregistrarlo así fue un error del prerregistro, y se
  registra (ADR 0005).

Lo que sí informa es la causa del exceso, medida en un diagnóstico **añadido
después de ver el fallo** y marcado como tal:

1. **La banda.** El S2 lo dominan las gigantes rojas (BP−RP ≈ 1-1,5), y ahí
   G − V ≈ −0,2 a −0,45 mag. Tratar G como V infla F² por 1,7-2,3. Con la
   conversión G→V de Gaia EDR3 (doc. CU5, tabla 5.7, σ = 0,03 mag), R2 queda
   entre 0,75 y 1,13 en los cinco anillos interiores. Producción también trata
   G como V (`estrellasCumulo`). Es una deuda previa que la partición destapa.
2. **El anillo exterior son estrellas de campo.** También en V sigue sin
   pasar (R2 = 29,8). El diagnóstico ADR 0003 da `(ΣF_cat + ∫V1)/∫Σ·S1 = 3,2`
   en 4-8 r_h, y la estrella más brillante del anillo (V = 10,6) no es del
   cúmulo. El fixture no separa miembros: es el mismo riesgo de #570.

**Cuánto grano contaría dos veces el velo de producción.** Restringido a lo
que no se resuelve (`m > m_res(r)`), la parte catalogada de S2 es del 95 % al
98 % según el anillo. Si la luz catalogada sub-`m_res` se queda en su sitio y
el velo sigue con el `S2campo` de producción, esa fracción se cuenta dos veces.
El velo **tiene** que llevar `(1 − c)`.

### Micro-casos (preguntas 1 a 3)

El número de picos depende de la profundidad de valle que se exija para
contar dos. Se corre con las dos referencias. La primera es 0, Sparrow: basta
un mínimo. La segunda es 0,265, Rayleigh: es el valle del par igual de Airy, y
la gaussiana da 26,6 % a 1 θ, así que reproduce el ancla de `θ_sep`.

```
caso                               (a) FoF    (b) Sparrow   (b) Rayleigh   pico − centroide
par igual, 0,50 θ                  1          1             1               0,000 θ
par igual, 0,75 θ                  1          2             1 alargada
par igual, 0,95 θ                  1          2             1 alargada
par Δm=2, 0,95 θ                   1          1             1              −0,126 θ
par Δm=2, 1,50 θ                   2          2             2
par Δm=0,75, 0,95 θ                1          2             1 alargada
cadena A–B–C igual, paso 0,60 θ    1          1             1               0,000 θ
cadena A–B–C igual, paso 0,90 θ    1          3             1 alargada
```

**Con el umbral de Rayleigh, (a) y (b) dan el mismo número de puntos en todos
los micro-casos.** La ventaja de (b) en las cadenas y en los pares desiguales
solo existía con Sparrow. A eso se suma el criterio de la casa para el OJO
(`resolucionDoble`, `bitacora-ocular.js`): hace falta `aum·sep ≥ 300″` para
empezar a partir un par. A 173× eso son 1,73″ = 1,66 θ_sep. A este aumento el
ojo funde más de lo que funde `θ_sep`.

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
posición **no** es el centroide pesado por flujo. Si el pico es uno de verdad,
es el máximo de la imagen sumada, que se va hacia la componente brillante
(−0,13 θ en un par Δm = 2 a 0,95 θ). Si el umbral de valle funde dos picos,
no es un punto: es una mancha alargada, y dibujarla en el centroide le
inventa una forma. Visibilidad: la misma
ley de umbral que una estrella sola, aplicada al flujo del pico. Argumento
óptico: un pico sin estructura interna es, para el ojo, indistinguible de una
estrella de ese flujo. El umbral puntual integra en el área de Riccò
(`θ_R/M = 31 θ_sep` aquí), así que no ve la estructura por debajo de `θ_sep`.
Dos estrellas a `m_res + 0,6` a 0,5 θ dan un pico a `m_res − 0,15`, que se ve.
Hoy no aparecen.

**2. Cómo se agrupa: gana (b), pero no por el número de puntos.** Argumento
óptico: el telescopio no agrupa estrellas, suma sus PSF. (a) es una
aproximación de (b). Con un umbral de valle de Rayleigh, las dos coinciden en
cuántos puntos hay en todos los micro-casos. Lo que separa a (b) no depende
del umbral:
- **Conservación local:** (a) dibuja el blob en el centroide y saca de su
  celda el 1,47 % del flujo catalogado de M13. (b) no mueve luz (criterio 2).
- **Forma y posición:** (b) dibuja lo que hay, un pico desplazado hacia la
  brillante o una mancha alargada. (a) dibuja un punto en el centroide. El
  56 % de los grupos múltiples de M13 son más anchos que `θ_sep`, y el más
  ancho mide 3,3 θ: FoF los convierte en puntos.
- **Sin agrupamiento a mano:** las cadenas no necesitan regla. La imagen las
  resuelve con el mismo umbral que un par.

**Lo que (b) no resuelve sin decidir antes:** el umbral de resolución, que es
un parámetro (ver «Parámetros»). Hay dos anclas en la casa y no coinciden.
Rayleigh sobre la PSF es el ancla de `θ_sep` del ADR 0012. El ojo pide
`aum·sep ≥ 300″` (`resolucionDoble`), que a 173× es 1,66 θ_sep y depende del
aumento, cosa que `θ_sep` no hace.

**3. `Δmag` sobra.** La razón de brillos entra por el perfil de la imagen, sin
parámetro propio. Con Rayleigh, un par Δm = 2 a 0,95 θ da un pico desplazado y
un par Δm = 0,75 da una mancha alargada. Con Sparrow, el primero da un pico y
el segundo dos. En los dos casos lo decide el perfil y no un `Δmag`. FoF
tampoco lo usa: funde a cualquier Δm. `Δmag = 0,75` solo existía porque
`aCrowd` es un conteo sin perfil.

**4. La partición.**

```
imagen   = Σ_{catálogo} F_j·PSF(x − x_j)  +  Σ_{sintéticas} F_s·PSF(x − x_s)  +  V1(r)
V1(r)    = Σ(r) · Σ_k num_k·f_k  ·(1 − c(m_k, r))   [solo m_k > mCutGeneracion]
V2(r)    = Σ(r) · Σ_k num_k·f_k² ·(1 − c(m_k, r))   [ídem]
```

- Conserva por anillo y por celda (criterio 2). No cuenta dos veces el grano,
  por álgebra (`c + (1 − c) = 1`); el criterio 3 no lo podía medir (ver arriba).
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
- **Supuesto de geometría, no medida:** tres bandas de 1′ × 0,1′ a 7,1 kpc,
  que ocupan 1,2e37 cm².
- Con `N_H/A_V = 1,87e21 cm⁻² mag⁻¹` (Bohlin, Savage & Drake 1978, ApJ 224, 132:
  `N_H/E(B−V) = 5,8e21`, con R_V = 3,1; **original no abierto**, valor
  comprobado en citas secundarias)
  y polvo/gas 0,01, una banda de `A_V = 0,02` (un 2 % de oscurecimiento, del
  orden del contraste umbral) pide unos 5e-3 M☉ de polvo.
- Son unas 35 veces el límite total de Barmby.

Por eliminación, los ríos son distribución de estrellas, y la ley candidata
los tiene que reproducir sin parámetro nuevo.

**Qué componente los dibuja: los puntos resueltos.** Leído de producción
(ADR 0008): la ley del grano del ADR 0015 (`tabla.sGrano`, P(ver)) da **0 en
todos los anillos** para el `S2campo` de producción. Esa es la varianza
esperada de toda la luz sub-`m_res`. La partición la reparte entre `V2` y la
fluctuación real del catálogo no resuelto, con el mismo valor esperado. Por
eso la luz no resuelta no puede dibujar ríos con la ley de la casa.
- Límite: es el valor esperado; una realización concreta puede fluctuar por
  encima.
- El contraste RMS contra `Cmin` que también imprime el arnés (0,03-0,17) es
  el estadístico que el ADR 0015 (punto 2) descarta para esta luz. Queda como
  indicio y no se usa como argumento.

Los ríos, si se ven, los dibujan los puntos resueltos, que ya están en sus
posiciones de Gaia. `capaEstrellas` ya suma en flujo los sprites solapados
(#541), así que un par muy cerrado no se ve hoy como dos puntos. Lo que (b)
cambia de verdad es otra cosa:
- se va el sorteo, que borra estrellas al azar según la densidad media del
  anillo y no según sus vecinas reales;
- el umbral se juzga sobre el pico, de modo que dos estrellas sub-`m_res`
  juntas se ven;
- la luz sub-`m_res` se queda en su sitio.

Que los ríos de M13 se vean es una predicción de (b) que se comprueba
después, no un argumento a favor.

## Veredicto

**«No se puede todavía»**, por la regla fijada en el ticket: el criterio 3
prerregistrado no pasa. Lo que sí queda decidido:

- **Pregunta 2: gana (b), la imagen sumada; (a) se descarta.** Es por
  conservación local, forma y posición, no por el número de puntos.
- **La partición con `(1 − c)`** cierra por anillo y por celda.

**Qué falta para el «sí»:**

1. El flujo del catálogo en la banda de la LF (G→V con BP−RP). Con eso, R2
   queda entre 0,75 y 1,13 en los cinco anillos interiores.
   **Hecho en #574**: `estrellasCumulo` juzga el catálogo en V; sin color
   válido la fila se queda en G (3 174 de 11 972 filas del fixture de M13).
2. Separar miembros de campo en el halo exterior (#570).
3. Fijar el umbral de resolución de (b): Rayleigh sobre la PSF (ancla de
   `θ_sep`) o la resolución del ojo `aum·sep ≥ 300″` (`resolucionDoble`).
   Las dos anclas de la casa no coinciden.
4. Un criterio 3 con potencia. El de este prerregistro dejaba pasar un doble
   conteo completo.
5. La conservación contra el flujo del MODELO, que no es el criterio 2. El
   criterio 2 solo prueba que la contabilidad cierra. El diagnóstico ADR 0003
   `(ΣF_cat + ∫V1)/∫Σ·S1` da 1,29 / 1,13 / 1,11 / 1,02 / 0,95 / 4,08 por
   anillo en G. El anillo del núcleo y el exterior quedan fuera del ±10 % de
   la fase 1. Es la misma causa que el criterio 3 (banda y campo), y en V da
   1,12 / 0,99 / 0,95 / 0,84 / 0,79 / 3,20.

Abrir el ticket de implementación es decisión del dueño del spike, con estos
cinco puntos como prerrequisitos.

## Qué sustituye del ADR 0012

Si se implementa (b):

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
| `thetaSepRadios = 1` como ley de mezcla | sale | tenía ancla (Rayleigh); lo sustituye el umbral de valle sobre la PSF |
| sorteo Bernoulli `C.sorteo` | sale | sin parámetro |
| umbral de resolución de la imagen sumada (profundidad de valle, o `aum·sep` del ojo) | entra | **sin decidir**: Sparrow 1916 (valle 0; original no abierto, ApJ 44, 76, comprobado en citas secundarias), Rayleigh (valle 0,265, el ancla de `θ_sep`) o `resolucionDoble` (`aum·sep ≥ 300″`, de `notas-resolucion-dobles.md`, ancla no revisada) |
| forma de la PSF del pico | entra | `radioImagenEstelar` (Airy ⊕ seeing), ya anclado |
| escala del fondo local `θ_R/M` | entra | Riccò, la de H2c (ya calibrada) |
| `completitud` en el velo (`gaiaM50`, `gaiaAncho`, `gaiaFwhmAs`, `gaiaCrowdingK`) | entra en el velo | los existentes de `CFG`; su ancla no se revisa aquí |
| G→V con BP−RP | entra (prerrequisito) | Gaia EDR3, doc. CU5, tabla 5.7 (σ = 0,03 mag) |
| `mCutGeneracion = 18` como corte de `V1`/`V2` | entra en el velo | el existente de `CFG` (profundidad de la realización sintética); ancla no revisada aquí |
| `pasadasPuntoFijo = 5` | se queda | ADR 0012 (B), medido en `punto_fijo.md`; con dominio local está sin volver a medir |
| listón de la pregunta 5 (p95 < 0,1 mag) | solo del spike | sin ancla: prerregistrado como umbral de decisión, no entra en el modelo |
| PSF gaussiana FWHM 0,84 θ (micro-casos) | solo del spike | razón FWHM/radio del primer anillo de Airy (1,03/1,22); atajo declarado |

Ninguna cifra de estrellas dibujadas se usa en este ADR a favor ni en contra.

## Límites declarados

- El fixture no trae los pares más cerrados que 0,6″ (FWHM de Gaia). Lo
  fundido sobre el catálogo se queda corto en el núcleo.
- La PSF de los micro-casos es gaussiana (FWHM 0,84 θ). Su valle a 1 θ (26,6 %)
  reproduce Rayleigh. Con Airy ⊕ seeing se moverán las separaciones umbral; la
  conclusión del criterio 2 no depende de la PSF.
- La pregunta 5 usa el `m_res` de producción para clasificar «no resuelta».
  Con el velo `V1` el `m_res` cambia algo.
- Un solo cúmulo y un solo equipo. Generalizar es trabajo de la implementación.
- **La parte sintética de la partición no se ha prototipado.** El arnés solo
  carga Gaia y aplica `(1 − c)` a todos los bins. El corte
  `[m_k > mCutGeneracion]` de la pregunta 4 es diseño, sin medida.
- La decisión de la pregunta 5 («local») descansa en un solo anillo (0,111
  contra 0,1). El anillo 0,25-0,5 r_h no tiene celdas a esa escala.
- La pregunta 6 se cierra por eliminación del polvo, no con una fuente
  positiva.
- El FoF es código nuevo. El bucle de `harness_crowding_k.js:99` pregunta, para
  cada estrella, si tiene vecina, pero no construye grupos transitivos, así que
  no servía para agrupar. Las definiciones de anillo sí se reutilizan.
- Los micro-casos cuentan picos de configuraciones sintéticas, no estrellas
  dibujadas del catálogo. La conclusión de la pregunta 2 no se apoya en ese
  número, sino en la conservación, la forma y la posición.

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
