# Especificación técnica — Modelo físico de observación de cúmulos globulares

**Versión:** 2.0 (revisada contra el código real del repo; v1.0 se escribió sin conocerlo)
**Ámbito:** Sustituye el halo de King continuo (`haloGlobular`, `pintarHaloGlobular`, `gammaHalo`,
`restaMaxFrac`) por un pipeline de observación en cinco capas con fotometría cerrada.
**Arquitectura:** híbrida — estrellas individuales solo donde la individualidad es perceptible;
campo estadístico analítico para el resto. Coste O(N_brillantes + píxeles).

**Qué cambia respecto de v1.0.** Tres capas de v1.0 ya existían en el repo, medidas y calibradas,
y se reusan en vez de reimplantarse:

| v1.0 proponía | v2.0 decide | Dónde |
|---|---|---|
| Capa 4 = tabla Blackwell/Crumey 2D | **Capa 4 = H2c**, calibrada con 12 observaciones reales. Ni tabla Crumey, ni apagada | ADR 0001 |
| Capa 5 = `asinh` | **Capa 5 = `nivelCielo(SBe)` + incremento en magnitudes**, la vigente | ADR 0001 |
| PSF nueva con términos de ojo y ocular | **`FWHM_total = 2·radioImagenEstelar(D)`**, la que ya dibuja las estrellas | ADR 0002 |
| `m_res(r)` compuesto en la Capa 2 | Compuesto **en el render**, que es el punto de integración física↔percepción | ADR 0002 |
| Desaturación escotópica en primera versión | **Fuera de este trabajo**: afecta a todo el simulador y no hay medida que la fije | ADR 0001 |

---

## 0. Principios de diseño

1. **Conservación fotométrica.** `F_total = F_resolved + F_transition + F_unresolved`, sin suelos
   ni techos artificiales. Se verifica como test (ADR 0003), no se impone.
2. **Parámetros físicos, no estéticos.** Toda constante tiene unidades e interpretación
   observacional. Lo estético vive solo en la Capa 5.
3. **Separación estricta de capas.** Ninguna capa lee parámetros de una posterior.
4. **Determinismo reproducible.** `seed = hash(clusterId, populationModelVersion, realization)`.
   Cambiar telescopio, ocular, cielo o campo NO cambia la realización.
5. **Presupuesto de rendimiento.** Recomputar tras cambio de ocular en < 100 ms sin WebGL.

## 0a. Contexto

El halo actual pinta el perfil de King como un continuo suave (alpha-blending): un disco difuso
con borde visible que no se parece a la vista al ocular. Aquí el perfil de King se usa como
**función de densidad de probabilidad** para la población que Gaia no resuelve, y el halo emerge
como granulado (fluctuaciones de brillo superficial à la Tonry & Schneider 1988), nunca como
degradado.

## 0b. Invariantes — fallos que no se deben repetir

Heredados de `worktree-halo-estocastico` (v1–v6). Vinculantes en TODAS las fases; los tests de
cada fase los cubren.

1. **Ninguna transformación tonal global sobre la cadena fotométrica calibrada.** Capas 1–4 en
   unidades físicas lineales, Float32 hasta el volcado final; la cuantización a 8 bits es el
   último paso y nada aguas arriba la conoce.
2. **Orden fijo: muestrear → emparejar → anclar → atenuar.** No se re-ancla tras una atenuación.
   La conservación (§3.4) se verifica ANTES de la Capa 4, y la atenuación perceptual nunca
   retroalimenta la normalización de flujo.
3. **No contar luz dos veces.** La misma `m_res(r)` decide la clasificación de estrellas y el
   corte del campo estadístico (`m_lim = m_res(r) + Δ`). El test §3.4 es el guardián; nunca un
   descuento manual paralelo.
4. **Una sola perilla libre por efecto.** Semi-libres solo `k` (crowding) y `Δ`; si una
   calibración necesita mover ambos, se fija `Δ = 1.0` y solo se toca `k`.
5. **Ante conflicto entre la letra de un enunciado y su criterio de aceptación, gana el criterio**,
   documentando la desviación en el test/commit.
6. **Tests estrictos por elemento.** Donde hay ley exacta (conservación por estrella, S1/S2 contra
   la LF tabulada, clasificación por `m_res(r)`), el test la comprueba elemento a elemento con
   tolerancia ≤ 1e-9 relativo. Los umbrales agregados (±10 % en Var(I)) son informativos.
7. **Prohibidas las discontinuidades espaciales en r** en cualquier magnitud que module flujo. Un
   escalón en r dibuja anillos. De ahí la sigmoide de 0,3 dex y la banda Δ.
8. **Una sola ley por fenómeno.** Una sola ley de detección (H2c), una sola PSF, una sola
   `m_res(r)`. Ni siquiera como alternativa dormida.

## 0c. Pre-requisito (Fase 0)

Eliminar todo uso del perfil de King como **información de iluminación**, conservándolo como
geometría (área/encuadre del cúmulo). Criterio de aceptación: la visualización de un globular es
**EXACTAMENTE la misma** con `globular = true` que con `false`, píxel a píxel, en M13, M92,
ω Centauri y M5. El código antiguo se elimina, no coexiste.

Se borra: `haloGlobular`, `pintarHaloGlobular`, `fobjGlobular`, `muGlobular`, `gammaHalo`,
`CFG.globular` (`magResta`, `restaMaxFrac`, `gammaA/gammaRef/gammaExp/gammaMax`) y **la
amortiguación puntual de estrellas dentro del halo** (`bitacora-gaia-render.js:3159-3169`): sin
halo no tiene fondo contra el que comparar, y su papel lo hace la banda de transición (§2.4).

Se conserva: `perfilKing`, `areaKing` (PDF radial de la Capa 1), `r_t` para encuadre y ficha, y la
**consulta a Gaia de radio y profundidad fijos del cúmulo** (`bitacora-ocular.js:597-599`) —
cambia de cliente, no de motivo: cuánta luz ya está catalogada es propiedad del cúmulo, no del
telescopio de esta noche.

---

## Capa 1 — Población estelar · `bitacora-cumulos.js`

**Responde a:** ¿qué estrellas existen y dónde?

### 1.1 Entradas

| Símbolo | Descripción | Fuente |
|---|---|---|
| `V_t` | Magnitud V integrada | Harris (2010), Parte I |
| `d` | Distancia (kpc) | Harris |
| `E(B−V)` | Enrojecimiento | Harris |
| `[Fe/H]` | Metalicidad (elige LF) | Harris |
| `r_c, r_h, c` | Radios y concentración | Harris |
| `e, pa` | Elipticidad y ángulo de posición | White & Shawl |
| `Φ(M_V)` | LF normalizada | §1.3, embebida |
| catálogo Gaia | Estrellas observadas | Gaia DR3, consulta fija del cúmulo |

**Reparto offline/runtime:**

- **Offline (`gen_globulares.py`):** ampliar el catálogo generado a
  `[id, nombre, RA, Dec, r_c, r_h, c, μV0, V_t, d_kpc, E(B−V), [Fe/H], e, pa]`. Sigue siendo puro
  catálogo observacional citable. (`e`/`pa` es la tarea T3 de la rama antigua, que la lección 3
  exige para evaluar en el radio elíptico propio.)
- **Embebido en JS:** las tablas de LF, como arrays literales en el módulo (lección 5: sin fetch).
- **Runtime, una vez por cúmulo:** `N_tot`, `S1`, `S2`. **No se precomputan offline**: serían 144
  tablas que son la misma tabla desplazada y escalada — bloat y verdad duplicada.

### 1.2 Perfil radial

King como PDF por defecto:

```
Σ(r) ∝ [ (1 + (r/r_c)²)^(−1/2) − (1 + (r_t/r_c)²)^(−1/2) ]²,   r_t = r_c · 10^c
```

evaluado en el **radio elíptico propio** (`e`, `pa`). Interfaz `RadialProfile` con `KingProfile`
(defecto), y hueco para `EFF` y `TabulatedProfile` (core-collapse tipo M15). La elección es
atributo del cúmulo, no del renderizador.

### 1.3 Función de luminosidad — tres tablas, no una

`Φ(M_V)` en pasos de 0,25 mag, desde la punta de la rama gigante hasta `M_V ≈ +9` (documentar el
corte y su fracción de flujo perdida, < 1 %). **Tres tablas** por metalicidad —pobre `[Fe/H] ≈ −2`,
intermedia `≈ −1,5`, rica `≈ −0,7`—, interpoladas por el `[Fe/H]` del cúmulo, de isócronas de
12 Gyr (PARSEC/Dartmouth), con la cita en cabecera.

Tres y no una porque 47 Tuc (−0,72) y M92 (−2,31) están en los extremos del catálogo y tienen
ramas gigantes distintas — y la LF es exactamente lo que fija `S2`, o sea el contraste del grano.

**Normalización por flujo, no por número:**

```
∫ f(M_V) · Φ(M_V) dM_V · N_tot = F_total(V_t, d, E(B−V))
```

`N_tot` es derivado, no un parámetro libre.

### 1.4 Momentos de la LF

```
S1(m_lim) = Σ_{m > m_lim} f(m) · n(m)      → flujo no resuelto
S2(m_lim) = Σ_{m > m_lim} f(m)² · n(m)     → varianza SBF
```

tabulados en pasos de 0,1 mag. **Toda la textura sale de aquí**; no existe ningún parámetro de
«contraste de grano». (T1 de la rama antigua, `fraccionNoResueltaLF`, es la versión embrionaria de
`S1` con `m_lim` global: sus 4 tests portan casi directos generalizando `m_lim → m_lim(r)`.)

### 1.5 Fusión Gaia + población sintética

```
n_sintética(m, r) = n_modelo(m, r) · [1 − f_compl(m, r)]
```

- `f_compl(m, r)`: **sigmoide de dos constantes** (codo en G≈20, endurecimiento con la densidad
  local), sin calibración fina. Refinar solo si el Nivel 4 lo exige (lección 6 como advertencia de
  alcance).
- Estrellas Gaia: tal cual, con posición y magnitud reales.
- Sintéticas de la banda brillante (las que Gaia perdió por crowding en el núcleo): individuales,
  con posiciones muestreadas del perfil.
- **Color por estrella sintética:** `bprp` condicionado al tramo de la LF (gigantes ≈ 1,2, MS
  ≈ 0,7), pintado con el [[modelo de color Gaia]] existente. Sin él, el núcleo se vuelve monocromo
  justo donde Gaia deja de aportar. (Lección 7 transformada.)

### 1.6 Determinismo y caché

`seed = hash(clusterId, LFversion, realization)`. Caché en `window`, clave
`clusterId|LFversion|realization`, guardando estrellas sintéticas, S1/S2 y ruido base.
**La única invalidación es cambiar de cúmulo o de versión de LF.** `realization = 0`, no expuesta
en la UI (solo por consola, para A/B de desarrollo).

**Requisito de implementación: la realización cacheada es completamente independiente de la
observación actual.** Es la propiedad más importante de esta sección. Tres trampas concretas:

1. **El zoom.** El campo de ruido se ancla en **coordenadas de cielo** (offset en arcsec desde el
   centro del cúmulo) y el canvas muestrea de él. Si se generase sobre la malla del canvas, al
   hacer zoom cambiaría la textura en vez de su escala: el grano «hierve». Igual las posiciones
   sintéticas, en `(Δα·cos δ, Δδ)`.
2. **`m_cut` dependiente del equipo.** Se genera **una vez** con la `m_cut` del mejor instrumento
   soportado (constante documentada: **D = 500 mm, seeing 1″**) y se **reclasifica** por
   configuración: una comparación por estrella. Sin tope arbitrario de estrellas — si
   `capaEstrellas` no aguanta, se baja `m_cut` con criterio físico documentado, nunca un
   `slice(0, N)` que rompería la conservación en silencio.
3. **La consulta a Gaia.** La principal varía con el campo y con `mlim`; la fusión de §1.5 usa la
   **consulta fija del cúmulo** (§0c).

**Salida:** lista `S_bright` `(x, y, m, color)`; tablas `S1`, `S2`; perfil `Σ(r)`.

---

## Capa 2 — Resolución · repartida

**Responde a:** ¿qué estrellas se distinguen como puntos individuales con ESTE instrumento, ESTE
cielo y ESTE ojo?

### 2.1 PSF efectiva — la que ya existe

```
FWHM_total = 2 · radioImagenEstelar(D) = 2 · √(radioAiry(D)² + (seeing/2)²)
```

El render la calcula y **se la pasa al módulo como número**. No se añaden `FWHM_ojo(p_exit)` ni
`FWHM_ocular`: no están calibrados y el comportamiento angular del ojo ya está medido dentro de
H2c; meterlos sería una segunda ley del ojo compitiendo con la que tiene 12 observaciones detrás.
Como `FWHM_total` es parámetro de entrada, añadirlos mañana no cambia ninguna interfaz.

La PSF que resuelve, la que dibuja y la que fija `θ_grano` son **la misma**.

> **Deuda anotada, no arreglada:** `CFG.seeingArcsec` (ensancha estrellas) y `FOT.H2C.SEEING_AS`
> (ley de detección) son dos constantes de seeing distintas. No se tocan aquí.

### 2.2 Límite de detección puntual — en el render

`m_lim,sky(r)` con el `Cmin` de `ctxFotometrico()` contra el **fondo local** `Fcielo + ⟨I⟩(r)`
—el fondo incluye el propio velo no resuelto del cúmulo—. Concepto de Capa 2, evaluación del
render (ADR 0002).

Consecuencia física gratis: en el núcleo las estrellas débiles se apagan antes que en el halo
exterior a igual magnitud.

### 2.3 Límite por crowding — en el módulo

```
N(≥ m, r) · Ω_beam ≥ Ω_ring / k    →    m_crowd(r)
Ω_beam = π (FWHM_total/2)²
```

`k = 30` (`crowdingCriterion`, semi-libre, rango 10–50 en la literatura). Geometría y conteos: no
necesita ojo ninguno, por eso vive en `bitacora-cumulos.js`.

### 2.4 Frontera de resolución y clasificación

```
m_res(r) = min( m_crowd(r), m_lim,sky(r) )        ← compuesto en el render
```

**Circularidad:** `m_lim,sky(r)` depende de `⟨I⟩(r)` y `⟨I⟩(r)` de `m_lim(r)`. Se resuelve con
**una sola iteración**: `⟨I⟩₀` con `m_lim = m_crowd(r)` (cota superior) → `m_lim,sky(r)` → `⟨I⟩`
definitivo. No un punto fijo: su criterio de parada acabaría dentro de la imagen.

| Clase | Condición | Tratamiento |
|---|---|---|
| Resuelta | `m < m_res(r) − Δ` | punto individual con PSF |
| Transición | `m_res(r) − Δ ≤ m ≤ m_res(r) + Δ` | individual, atenuada (§4.2) |
| No resuelta | `m > m_res(r) + Δ` | campo estadístico |

`Δ = 1.0 mag`. La clasificación se evalúa **por estrella con su r propio**: la misma m=16 puede ser
resuelta a 8′ y no resuelta a 0,5′.

---

## Capa 3 — Imagen óptica · `bitacora-gaia-render.js`

### 3.1 Componente resuelta y de transición

```
I(x,y) += f(m_i) · PSF(x − x_i, y − y_i)
```

por el camino que ya existe: `capaEstrellas`. Las sintéticas se inyectan en el array de dibujo
—precedente exacto: `parDoble`, que completa lo que Gaia no trae **solo para el dibujo**, sin
tocar la muestra de la que sale la LF—.

### 3.2 Componente no resuelta — campo estadístico SBF

Con `m_lim = m_res(r) + Δ`:

```
⟨I⟩(r)      = Σ(r) · S1(m_lim(r)) / normalización
σ²_celda(r) = Σ(r) · S2(m_lim(r)) / Ω_beam
```

Ruido gaussiano blanco en malla de paso `FWHM_total/2` **anclada al cielo**, escalado por
`σ_celda(r)`, interpolado bilinealmente y sumado a `⟨I⟩(r)`. Recorte a `I ≥ 0`.

**Propiedades emergentes, sin parámetros:** más apertura → `m_res` más profunda → S1 y S2 caen →
menos halo, menos grano, más estrellas. Núcleo → `m_res` más brillante por crowding → núcleo
lechoso. El contraste del grano `S2/(S1²·N_beam)` refleja la LF real.

### 3.3 Fondo de cielo

`I_sky` uniforme, antes de la capa perceptual (fija la adaptación). Ya lo hace `ctxFotometrico`.

### 3.4 Verificación de conservación

```
∫ I dΩ  ==  F(V_t)          (sin cielo, resueltas + campo)
```

Test, no imposición. Tolerancia ±10 % en Fase 1 (con residuo registrado por cúmulo), ±1 %
obligatorio en Fase 2. **`remanenteMinFrac` y `restaMaxFrac` no vuelven, ni con otro nombre.**
Detalle y regla anti-degeneración en ADR 0003.

---

## Capa 4 — Sistema visual · H2c (ya existente)

**Responde a:** ¿qué partes de `I(θ)` superan el umbral de un observador adaptado?

### 4.1 Luminancia retinal

Ya la calcula `ctxFotometrico()`: `p_exit = D/M`, `dim = (p_ef/p_ojo)²`, transmisión `T`, y
`SBe = sqm − 2.5·log10(dim) − 2.5·log10(T)`. **Ningún motor vuelve a aplicar el término de
pupila**, o lo cuenta dos veces.

### 4.2 Umbral de contraste — dos escalas angulares, una sola ley

El campo se parte en media y fluctuación **antes** del desvanecido:

```
θ_cúmulo = 2·r_h circularizado (√(a·b))
θ_grano  = FWHM_total (arcmin)

s_halo(r)  = visibilidadDifusa( ⟨I⟩(r),  Fcielo · Cmin(θ_cúmulo) )
s_grano(r) = visibilidadDifusa( σ(r),   (Fcielo + ⟨I⟩(r)) · Cmin(θ_grano) )

I(r) = ⟨I⟩(r) · s_halo(r) + δI · s_grano(r)
```

Cuatro decisiones dentro, todas con consecuencia física comprobable:

- **`s_grano` se evalúa sobre `σ(r)`, no sobre `|δI|` por píxel.** Por píxel, el desvanecido
  dependería de la excursión concreta de cada uno: las fluctuaciones grandes sobrevivirían
  proporcionalmente más, comprimiendo la distribución hacia los extremos y **distorsionando el
  mismísimo `⟨F²⟩/⟨F⟩²` que las Capas 1–3 derivan de la LF**. Y perceptualmente lo que se detecta
  es la textura como tal, cuya amplitud característica es `σ(r)`. Evaluado por anillo: más barato,
  respeta el invariante 7, y el ruido conserva su forma gaussiana — solo cambia su amplitud.
- **El umbral del grano se mide contra el fondo local `Fcielo + ⟨I⟩(r)`.** En el núcleo el grano
  compite contra el propio velo y se aplana solo: núcleo lechoso sin ninguna perilla.
- **`Cmin(θ_grano) > Cmin(θ_cúmulo)`** (Ricco penaliza el elemento pequeño), así que **el grano
  muere antes que la mancha** cuando el cielo empeora. Es lo que se ve: en cielo urbano el cúmulo
  queda como mancha, no como mancha granulada.
- **`Cmin` satura solo para θ grande.** `raz = 1 + θ_R/(θ_eff·M) → 1`: ω Cen con θ ≈ 10′ no queda
  artificialmente favorecido, simplemente deja de tener bonus de tamaño. Sin cota artificial.

**Estrellas de la banda de transición — magnitud efectiva:**

```
a     = atenuacionTransicion(m, m_res(r), Δ)        ← sobre m, NUNCA sobre m_eff
m_eff = m + 2.5 · log10(1/a)                        ← solo para dibujo
```

Cadena `m → m_res(r) → a → m_eff → capaEstrellas()`, sin bucle. Cuando `a → 0`, `m_eff` supera
`mlim` y la estrella se apaga por el camino que ya existe; además encoge, porque `radioEstrella` va
con la magnitud — que es lo que se ve en el ocular.

**Guardarraíles (invariantes 2 y 3):**

```
m     → S1/S2, m_res, conservación          ✔
m_eff → S1/S2, m_res, conservación          ✘ nunca
```

y la misma `m_res(r)` decide **tanto la clasificación como cuánto flujo queda en cada componente**.

### 4.3 Fuera de alcance

Desaturación escotópica y visión avertida: candidatas independientes, no se abren hasta que la
validación aporte evidencia de que faltan (ADR 0001).

---

## Capa 5 — Display

`nivelCielo(SBe)` + incremento de contraste en magnitudes, Float32 hasta el volcado final. Sin
`asinh`. Parámetros libres y estéticos, documentados como tales; no retroalimentan nada.

### 5.1 Máscara difusa

`difusoMask`: `Float32Array`, centinela `-1`.

```
mask[i] < 0   → flujo no evaluado por un modelo difuso específico
mask[i] >= 0  → flujo ya evaluado; el valor ES la t de realzarPerceptual
```

```js
var t = mask ? mask[i] : -1;
var marcado = (t >= 0);
var s = marcado ? 1 : visibilidadDifusa(Fobj[i], c.Fcielo * c.Cmin, perceptual);
if (perceptual && difuso > 0) {
  difuso = realzarPerceptual(difuso, c.Fcielo, c.rango, marcado ? t : s, o.realceMax);
}
```

PS1 escribe `0` (gamma completa: **bit a bit igual que hoy**). El cúmulo escribe `s_halo`, para que
el realce decaiga donde el velo ya se ve bien — un núcleo resuelto no debe quemarse a blanco.

**`t` no es `s_halo`.** Coinciden hoy por diseño; son conceptos distintos (`s_halo` = detectabilidad
calculada para el halo; `t` = parámetro que consume `realzarPerceptual`) y la API no debe
fusionarlas. Se exporta `difusoMarcado(mask, i)` para que los harness no repitan la convención:
hoy está copiada a mano en seis sitios (`matriz_apertura_galaxias.js:96`, `test_difuso.js:984,
1065, 1092`, `harness_m104_nucleo.js`, `harness_m104_experimento_400x.js`,
`test_ps1_nan_ausencia.js:123`), y se migran todos en el mismo commit. Sin compatibilidad temporal
con la `Uint8Array`: prolongaría la ambigüedad.

---

## 6. Parámetros: antes y después

**Eliminados:** `remanenteMinFrac`, `restaMaxFrac`, `magMin` global, `ventanaNucleo`, `kUmbral`,
`CFG.globular.gamma*`, `magResta`, ajustes estéticos de LF.

| Parámetro nuevo | Unidades | Defecto |
|---|---|---|
| D, f, M, seeing, sqm, T, p_ojo | — | los del equipo, ya existentes |
| `crowdingCriterion k` | — | 30 |
| `Δ` (banda de transición) | mag | 1.0 |
| `m_cut` de generación | mag | la de D=500 mm, seeing 1″ |
| LF (×3), perfil radial | tablas | por cúmulo |

Semi-libres solo `k` y `Δ`, con efecto verificable en el Nivel 3.

## 7. Arquitectura de módulos

```
bitacora-cumulos.js            población · LF · S1/S2 · perfil · m_crowd · sintéticas ·
(window.BitacoraCumulos)       clasificación dado un m_res externo
        ↓
bitacora-gaia-render.js        m_lim,sky · m_res = min(...) · iteración única · campo definitivo ·
                               PSF · s_halo/s_grano · percepción (H2c) · display
```

**Regla verificable por grep:** si `bitacora-cumulos.js` menciona `Cmin`, canvas,
`ctxFotometrico`, `visibilidadDifusa`, `realzarPerceptual` o cualquier parámetro de display, está
en el módulo equivocado.

**Despliegue:** `<script src=".../bitacora-cumulos.js">` **solo** en
`simulador_ocular/ocular-wordpress.html`, antes de `bitacora-gaia-render.js` (el formulario no
renderiza cúmulos). `pintarCumulo` comprueba `window.BitacoraCumulos` como **protección de
integración**, no como camino alternativo que produzca un cúmulo parcialmente distinto. Deuda
independiente, no se toca: `registro/registrar-observacion-wordpress.html:171` carga
`globulares-datos.js` sin usarlo.

## 8. Presupuesto de rendimiento

| Cómputo | Cuándo | Coste |
|---|---|---|
| LF, S1/S2, perfil, `S_bright` | 1 vez por cúmulo | ~10² ms |
| `m_res(r)`, clasificación | por cambio de instrumento/cielo | ~10⁰ ms |
| Splat de resueltas | por cambio de instrumento | ~10¹ ms |
| Campo estadístico | por cambio de instrumento | ~10⁰–10¹ ms |
| Capas 4–5 | por frame | O(píxeles) |

## 9. Validación

1. **Nivel 1 — Fotometría:** §3.4 sobre una rejilla de configuraciones.
2. **Nivel 2 — Estadística:** por anillos, `⟨I⟩` reproduce `Σ(r)·S1` y `Var(I)` reproduce
   `Σ(r)·S2/Ω_beam` dentro de ±10 %. Referencia externa: perfiles μ_V(r) de Trager, King &
   Djorgovski (1995) para M13, M15 y M4 (activo rescatado de T5 de la rama antigua).
3. **Nivel 3 — Resolución:** duplicar D desplaza `m_res` ~1,5 mag en régimen de difracción y mueve
   la frontera hacia el núcleo. Duplicar M con D fijo reduce la luminancia retinal ×4 y cambia la
   visibilidad del halo, no su estructura.
4. **Nivel 4 — Percepción (matriz M13):**

| Apertura | Aumento | Cielo | Resultado esperado |
|---|---|---|---|
| 100 mm | 50× | 21.5 | halo granular, borde resuelto, núcleo continuo |
| 200 mm | 100× | 21.5 | resolución hasta media distancia radial |
| 400 mm | 200× | 21.5 | núcleo mayormente resuelto |
| 200 mm | 200× | 18.5 | halo exterior desaparece, núcleo persiste |

Contrastar con reportes visuales reales, no con astrofotos. **La matriz es también test de
no-regresión de H2c:** si falla, el sospechoso son las Capas 1–3. Las constantes de H2c no se
tocan.

## 10. Plan de implementación

Rama `worktree-modelo-observacion` desde `main`. El commit inicial registra el conteo de fallos
preexistentes de `test_difuso.js` y no se vuelve a mencionar salvo que el número cambie
(lección 8).

| Fase | Contenido | Test que la cierra |
|---|---|---|
| 0 | Borrado del halo King continuo y de la amortiguación puntual (§0c) | Paridad píxel a píxel `globular` true/false en M13, M92, ω Cen, M5 |
| 1 | `gen_globulares.py` ampliado + `bitacora-cumulos.js` (LF×3, `N_tot`, S1/S2, sintéticas, `m_crowd`) | Conservación ±10 % con residuo por cúmulo; S1/S2 elemento a elemento (≤1e-9) |
| 2 | Máscara `Float32Array` + 6 sitios + `pintarCumulo` (campo, dos θ, iteración única) + `m_eff` | Nivel 2; conservación ±1 %; PS1 bit a bit igual |
| 3 | Matriz M13 | Niveles 3 y 4 |
| 4 (opcional) | Perfiles no-King, visión avertida, PSF Airy⊗Moffat, segregación de masas | solo si el Nivel 4 muestra discrepancias atribuibles |

**Fusión a `main` solo al terminar la Fase 2**: es la primera que devuelve un cúmulo con halo.

**Estado y desviaciones registradas** (lección 9):

- **Fase 0 — hecha.** La paridad píxel a píxel no se puede medir en node (`capaEstrellas` necesita un `<canvas>` real); en su lugar el test comprueba que el render no exporta el halo ni lee el flag `globular`, con lo que la paridad es exacta por construcción.
- **Fase 1 — hecha.** Cuatro desviaciones:
  1. Las LF viven en `resources/js/lf-globulares-datos.js` (fichero generado, cargado por `<script>`), no como literal dentro del módulo: mismo efecto —sin `fetch`— y la misma convención que el resto de catálogos del repo.
  2. La LF llega hasta el final de la isócrona (`M_V ≈ +16`) en vez de cortar en `+9`: cortar tiraría el 1,6-1,9 % del flujo, que es justo lo que la conservación echaría de menos.
  3. Harris trae la elipticidad (White & Shawl) pero **no** el ángulo de posición: `radioPropio` lo admite, y sin él evalúa en radio circular. No se inventa una orientación.
  4. La puerta de conservación tiene dos mitades. La **interna** (`resuelto + campo = F(V_t)` para todo `m_lim`) cierra a 1e-16, muy por debajo del ±10 % pedido. La **externa** contrasta el `μ_V(0)` que predice el modelo con el medido por Harris: mediana **−0,137 mag** en los 113 cúmulos con `c < 2`, y −1,52 mag en los 30 con `c ≥ 2`, que son los de núcleo colapsado —King no los describe, y son la extensión opcional de la Fase 4—. El residuo se registra por cúmulo y no se corrige tocando el flujo (ADR 0003).

- **Fase 2 — hecha** (`pintarCumulo` en `bitacora-gaia-render.js`, `scripts/test_cumulo_render.js`, 37 comprobaciones). PS1 sale bit a bit igual: la salida entera de `test_difuso.js` es idéntica a la de `HEAD`, con sus 12 fallos preexistentes intactos. Siete desviaciones:
  1. **El campo es lognormal, no gaussiano.** Donde hay menos de una estrella no resuelta por beam, σ llega a 10·⟨I⟩; una gaussiana recortada a I ≥ 0 dejaba de tener la media pedida e **inventaba el 65 % del flujo** de M13. La lognormal de la misma media y varianza es positiva por construcción, coincide con la gaussiana cuando σ ≪ ⟨I⟩ y se sesga cuando σ ≫ ⟨I⟩, que es lo que hace un campo de puntos casi vacío. Conservación medida: **0,84 %**, dentro del ±1 % y a 0,85 σ de la fluctuación esperada.
  2. **Ω = max(Ω_beam, área de píxel).** Con el zoom alejado el píxel es mayor que el beam y ya promedia el grano: muestrear más fino dibujaría aliasing con la varianza del beam. El **paso** de la malla no cambia (sigue siendo FWHM/2, anclado al cielo); solo cambia la amplitud.
  3. **La bilineal se normaliza con el peso exacto de cada punto**, no con una constante: el peso cuadrático vale 1 sobre un nodo y 1/4 en el centro de la celda, y una constante dejaba una rejilla visible con la varianza un 30-50 % alta.
  4. **El Nivel 2 se mide en varianza logarítmica** sobre el campo crudo (`o.campoCrudo`), no en varianza lineal: el estimador lineal de una lognormal sesgada tiene ~100 % de error con 5.000 píxeles. Con `E[(ln X − ln⟨I⟩)²] = s² + s⁴/4` los anillos cierran a **0,10-2,04 %**, muy por debajo del ±10 %.
  5. **Con los equipos habituales `s_grano` = 0 en todos los anillos.** El grano es un elemento de ~2,4″ y H2c le pide un contraste **327 veces** mayor que a la mancha entera: sale de la ley, no de un fallo. Lo juzga la matriz del Nivel 4 (Fase 3).
  6. **Las sintéticas no se dibujan.** M13 genera 735, todas entre mag 16,4 y 17,9 dentro de 77″, y quedan bajo `m_res` a 100/50×, 200/100× y 400/200×: su luz ya está contada en el campo, así que dibujarlas sería duplicarla.
  7. **La gaussiana de cada nodo sale de una tabla de 4.096 valores** indexada por el hash, no de un Box-Muller: el log, la raíz y el coseno costaban el 60 % del pintado. La tabla se normaliza a media 0 y varianza 1 exactas. Coste medido: **145 → 57 ms** por pintado (720², campo 20′), aún por encima del ~10¹ ms de §8, con el resto repartido entre `radioPropio`, cuatro interpolaciones y la exponencial.

- **Fase 3 — hecha** (`scripts/matriz_m13.js`, 12 comprobaciones + informe). No añade modelo: interroga al que hay. Las frases de la matriz se traducen a cuatro magnitudes medibles —`f_res(r)` (fracción del **flujo** del anillo que va en estrellas dibujadas), `r_50` (radio donde `f_res` cruza 0,5 **hacia arriba**: el centro está aglomerado y es hacia fuera donde el cúmulo se deshace en puntos), `r_vis` (último radio con `s_halo ≥ 0,5`) y el contraste del grano medido en unidades de su propio umbral—. Resultado:

| Equipo | FWHM | `f_res` núcleo | `r_50`/r_h | `r_vis`/r_h | grano/umbral |
|---|---|---|---|---|---|
| 100 mm 50× 21.5 | 3,41″ | 3,1 % | no alcanzado | 2,26 | 0,5 % |
| 200 mm 100× 21.5 | 2,43″ | 21,9 % | 1,86 | 2,33 | 0,7 % |
| 400 mm 200× 21.5 | 2,12″ | 23,0 % | 0,99 | 2,45 | 1,8 % |
| 200 mm 200× 18.5 | 2,43″ | 23,0 % | no alcanzado | 0,97 | 3,1 % |

Tres filas salen como las escribió el observador: el núcleo continuo a 100 mm, la frontera entrando hacia el centro al abrir apertura y el halo exterior perdido en cielo urbano con el núcleo intacto. **Tres desviaciones, todas hacia la misma conclusión —el régimen no es de difracción sino de aglomeración y seeing—:**
  1. **El núcleo no llega a «mayormente resuelto» ni con 400 mm:** `f_res` satura en el 23 %. Dentro manda `m_crowd`, que solo mejora por la FWHM, y la FWHM la fija el seeing (2,43″ a 200 mm, 2,12″ a 400 mm). Abrir apertura mueve la **frontera** hacia dentro (1,86 → 0,99 r_h), no vacía el centro. Es lo que se ve en el ocular con seeing mediano; la fila de §9.4 estaba escrita a priori.
  2. **`m_res` gana 0,69 mag por duplicación de D**, no las ~1,5 de §9.3, por la misma razón: el corte lo pone la aglomeración y el cielo, no la difracción.
  3. **La textura SBF no se ve con ningún equipo, y no por poco:** su contraste se queda entre el 0,5 % y el 3,1 % de lo que pide H2c. El «halo granular» que reportan los observadores son las **estrellas resueltas** —`f_res` sube del 0 % en el centro al 28 % en el borde ya con 100 mm—, no la fluctuación del campo. Las constantes de H2c no se tocan (§9.4); si algún día se toca la ley del grano, el harness salta.

- **v7 E0 — hecha** (`scripts/harness_halo_v7.js`, `scripts/test_harness_halo_v7.js`, 11 comprobaciones; volcado en `docs/halo_v7/e0_referencia.txt`). Cero diffs en producción. Los tres defectos, medidos: **D1**, a 146× el difuso llega a 3,89 r_h en M13 y 4,50 r_h en 47 Tuc, unas 4,4 mag por debajo del cielo y aún encendido. **D3**, la segunda diferencia de μ(r) vale 0,003-0,04 mag sobre el King puro y 2,5-57× más sobre ⟨I⟩ = Σ·S1 en la misma malla: **el codo no lo mete ni el muestreo radial ni la cuantización a 8 bits, sino `S1(m_res)` saltando de bin en bin de la LF mientras `m_res(r)` los barre** —`mCrowd` interpola dentro del bin, `S1`/`S2` no—. Es la rama que implementa E4, y no es ninguna de las dos que el documento de tareas anticipaba.

- **v7 E1 — cerrada SIN cambio en producción** (`scripts/test_halo_v7_e1.js`, 19 comprobaciones). Los tres tests del documento se escribieron primero y salieron verdes contra el código tal cual estaba: **la cadena ya está unificada y D2 no existe como fallo fotométrico.** La causa que se descarta, y por qué:
  1. **El «Δμ_cielo = 2,73 mag frente a Δμ_halo = 0,03» de E0 comparaba dos marcos distintos.** El render no trabaja en el marco del ojo sino en el del cielo: `pintarFot` pinta el objeto como incremento de contraste sobre `Fcielo` **sin atenuar** y mete la pupila una sola vez, en el fondo (`SBe`) y en el umbral (`Cmin`). Medir el cielo por `SBe` (que lleva `dim`) y el halo por su flujo (que no) fabrica una diferencia que es exactamente `dim·T`. Aplicarle `dim` al flujo del halo habría sido contarlo dos veces —lo que el propio comentario de `pintarFot` prohíbe— y habría roto el contraste, que es lo único invariante de marco.
  2. **Medido:** partir la pupila del ojo (dim 0,0383 → 0,1532, ×4) no mueve el contraste físico del halo ni una milésima de magnitud (0,00000). El contexto del halo trae el mismo `dim`, `T` y `Fcielo` que el del fondo, y el flujo pintado no lleva ningún factor extra sobre ⟨I⟩ (razón 0,996-1,003). El paso 2 de la implementación —darle θ = 2·r_h circularizado para entrar por H2c en vez de por el `else` de C_MAG— ya estaba hecho en la Fase 2.
  3. **Lo que sí cambia con M, y debe:** el Δμ bruto del halo llega a 0,27-0,41 mag entre 146× y 514×, y lo explica entero `m_res` (al subir aumentos el fondo local se oscurece, `m_lim,sky` se hace más profunda y más estrellas salen del campo no resuelto para dibujarse una a una). Restado ese término, la deriva es de 0,002-0,006 mag. Y en el tap perceptual el halo **sí** se hunde: `s_halo` pasa de 0,58 a 0,26 en el borde de M13 y de 0,83 a 0,51 en el de 47 Tuc.
  4. **Dos desviaciones en los tests, ninguna en el modelo.** (a) La igualdad `Δμ_halo == Δμ_cielo` se mide sobre el campo **pintado** normalizado por ⟨I⟩ del modelo, no sobre la tabla: sobre la tabla es una identidad algebraica y el test no podría fallar nunca. (b) El grano se mide **en logaritmo** y normalizado píxel a píxel por la anchura que la tabla pidió allí; en lineal, la cola de la lognormal mete ±35 % de error de estimador con cientos de píxeles, y el 5 % por anillo del documento estaría midiendo el estimador. Por anillo se exige 3 σ con las **celdas** independientes (no los píxeles: a 514× caben seis en una celda de grano) y el 5 % se exige sobre la corona entera, donde sale 0,3-1,6 %.
  5. **Un fallo del arnés que este test destapó:** E0 recalculaba la cadena por su cuenta con `R.ctxFotometrico(cielo, res.thetaCumuloArcmin)`, campo que `pintarCumulo` no devuelve; salía por la rama C_MAG y el `Cmin` del volcado no era el del halo. Ahora lee `res.cHalo`, el mismo objeto que usó el render —que es justo lo que pide el test de origen único—.

- **v7 E2 — cerrada SIN cambio en producción** (`scripts/test_halo_v7_e2.js`, 25 comprobaciones). **No hay re-anclaje después de la atenuación**: inyectada una atenuación de ×0,5, el flujo pintado baja **×0.500000000000, desvío 0,0e+0**. El guardián se queda en la batería. Tres cosas que costó hacer bien y que valen como documentación del modelo:
  1. **La inyección escala Σ y S2 a la vez.** Escalando solo Σ, la anchura de la lognormal `s² = ln(1 + σ²/⟨I⟩²)` cambia, el campo se resortea y la igualdad solo valdría en promedio (~1 %), demasiado flojo para un guardián. Escalando las dos, cada píxel vale la mitad exacta que su gemelo, con el mismo grano.
  2. **El pin de `m_res` va 0,5 mag POR DEBAJO de la referencia, no encima.** A 200 mm/100× el corte lo pone `m_lim,sky` en **todos** los radios (`m_crowd` va 1,5 mag por encima), así que fijar `m_crowd` en el propio valor de referencia no fija nada. Medido: `m_crowd` manda en **0/511** nodos a 100 mm/50×, 48/511 a 200 mm/100×, 112/511 a 400 mm/200×, 120/511 en 47 Tuc y 187/511 en ω Cen —siempre el núcleo—.
  3. **La saturación tiene que ser exacta (`s_halo == 1`), no «> 0,999».** Con 0,999 los dos campos se atenúan de forma ligeramente distinta y queda un residuo de 1,4e-6 que no es un re-anclaje. Con `== 1` el disco útil llega a 1,8 r_h y el guardián cierra a cero.
  4. **Dos observaciones para la autocrítica, ninguna corregida aquí:** (a) `magLimite` no tiene término de seeing —una imagen estelar más gorda no degrada la magnitud límite puntual en el modelo—, así que el seeing solo entra por Ω; (b) con lienzo grueso y campo ancho (512 px sobre 51′, píxel de 6″) el píxel tapa el beam y el seeing **no entra en ningún sitio**: la rejilla de conservación se pasó a campo verdadero (68°/M) y 1024 px para que el eje no fuera decorativo. Aun así, a 100 mm/50× sigue siendo píxel-limitado en las tres pasadas, que es Ω = max(beam, píxel) diciendo lo suyo.

- **v7 E3 — cerrada SIN cambio en producción** (`scripts/test_halo_v7_e3.js`, 13 comprobaciones). El truncamiento de King y su normalización **ya estaban** en el código desde la Fase 2: `perfilKing` lleva el término `((a − b)/v0)²` con `b = 1/√(1 + (r_t/r_c)²)`, y `areaKing` es su integral cerrada hasta `r_t`, que es con lo que `poblacionCacheada` normaliza Σ. Lo que faltaba era la prueba:
  1. **La integral numérica cierra a 1.** Simpson con 200 000 nodos sobre [0, r_t] da **1.000000 (desvío < 0,0001 %)** en M13, M15, M4, 47 Tuc y ω Cen, y `Σ(r > r_t) = 0` exacto. Es un test independiente de la fórmula cerrada: si `areaKing` dejase de ser la primitiva del perfil que se pinta, este es el único sitio donde se ve.
  2. **μ_V(r) contra Trager, King & Djorgovski 1995**, ahora activo local en `docs/halo_v7/trager1995.tsv` (VizieR J/AJ/109/218/tables, 1061 puntos de los cuatro cúmulos, **47 Tuc incluido**). Solo se usan los puntos de peso 1 —los de peso 0 los descartaron los propios autores—. Residuo medio en 0,5·r_c ≤ r ≤ 3·r_c: **M13 0,127 mag** (31 puntos), **M4 0,308** (84), **47 Tuc 0,400** (70), **M15 0,433** (129). Los cuatro por debajo del 0,5 exigido. μ_V observado contra V_t observado: los dos llevan la misma extinción y no hay que corregirla.
  3. **El sesgo es sistemático y del mismo signo en tres de los cuatro** (−0,43 M15, −0,40 47 Tuc, −0,31 M4; +0,03 M13): el King de un solo parámetro sale más brillante que el cúmulo real fuera del núcleo, y más cuanto más concentrado es (M15 y 47 Tuc son los de `c` alta; M15 es de núcleo colapsado, donde King ya no aplica). No se corrige: está dentro de tolerancia y arreglarlo pide un perfil de dos parámetros, que es otro encargo. Anotado para la autocrítica.
  4. **Las alas se apagan solas a 2,82·r_h**, muy dentro del 4·r_h exigido. En la captura de D1 (M13, 200 mm, 146×, SQM 21,5) el contraste máximo del ala más allá de 4·r_h es **0,150 frente a un Cmin de 0,491**, y el tap perceptual no pinta nada en ninguno de los 12 anillos medidos. El contraste se mide como ⟨I⟩/F_cielo, los dos SIN atenuar, que es el marco en el que trabaja el render (E1.3). **D1 no lo causa la extensión del perfil.**

**Tests:** de `scripts/test_globulares.js` sobreviven las secciones 1 y 2 (forma del perfil y
`areaKing` cerrada vs numérica: el perfil sigue siendo la PDF radial); el resto se borra con la
Fase 0. Lo nuevo va a `scripts/test_cumulos.js`.

## 11. Lecciones de `worktree-halo-estocastico`

| # | Lección | Disposición |
|---|---|---|
| 1 | Semántica de paquete | **Obsoleta.** Los paquetes no existen aquí |
| 2 | `estocastico: false` = campo abierto | **Se importa.** El modo determinista es `⟨I⟩(r)` con σ=0 |
| 3 | Radios en el sistema propio del cúmulo (elipticidad) | **Se importa tal cual.** `Σ(r)` y `m_res(r)` en radio elíptico propio; los tests miden ahí |
| 4 | Float32 hasta el volcado final | **Se importa y se refuerza** (invariante 1) |
| 5 | Tablas embebidas, sin fetch | **Se importa.** LF y catálogos como arrays |
| 6 | `magMin` inerte; no modelar completitud de Gaia | **Parcialmente superada.** `magMin` no existe (lo hace `m_res(r)`); `f_compl` sí es necesaria aquí, acotada a la sigmoide de dos constantes |
| 7 | `bprp` constante → color por paquete | **Se importa transformada:** color por estrella sintética desde el tramo de la LF |
| 8 | Fallos preexistentes de `test_difuso.js` | **Se importa como higiene** (§10) |
| 9 | Desviaciones conscientes | **Meta-lección:** toda desviación va a `CHANGELOG.md` y se convierte en tarea o lección |
| 10 | Sin avisos de UI que parcheen síntomas | **Se importa** como criterio general |

**Portables:** T1 (`fraccionNoResueltaLF` → S1), T3 (`e`/`pa`, hacerla en `main` para que la
hereden ambas ramas), T6/T7 (LF por metalicidad y color correlacionado → Capa 1). **No portables:**
T2, T4, T5, T8 (específicas del mecanismo antiguo); de T5 se rescata la tabla de Trager para el
Nivel 2.

---

## Decisiones registradas

- ADR 0001 — H2c es la capa perceptual; sin tabla Crumey ni apagada; sin `asinh`.
- ADR 0002 — Frontera `bitacora-cumulos.js` / render; `m_res` compuesto en el render.
- ADR 0003 — La conservación fotométrica es un test, no una imposición.
