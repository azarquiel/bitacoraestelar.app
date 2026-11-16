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

## Resultados

(pendiente: se rellena tras correr el prototipo; el prerregistro de arriba no
se toca)
