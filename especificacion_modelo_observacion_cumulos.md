# Especificación técnica — Modelo físico de observación de cúmulos globulares

**Versión:** 1.0 (borrador para revisión)
**Ámbito:** Sustituye el algoritmo actual de halo granular (`ps1PintarParche`, `ps1Opacidad`, `remanenteMinFrac`, `magMin`, `ajustesEstéticosLF`, H2c) por un pipeline de observación en cinco capas con fotometría cerrada.
**Arquitectura elegida:** híbrida — estrellas individuales solo donde la individualidad es perceptible; campo estadístico analítico para el resto. Coste O(N_brillantes + píxeles), no O(N_estrellas).

---

## 0. Principios de diseño

1. **Conservación fotométrica.** En todo punto del pipeline: `F_total = F_resolved + F_transition + F_unresolved`, sin suelos ni techos artificiales.
2. **Parámetros físicos, no estéticos.** Toda constante del modelo debe tener unidades e interpretación observacional. Los parámetros estéticos solo existen en la Capa 5 (display).
3. **Separación estricta de capas.** Ninguna capa lee parámetros de una capa posterior. En particular: nada del modelo físico conoce el mapeo de pantalla.
4. **Determinismo reproducible.** `seed = hash(clusterId, populationModelVersion, realization)`. Cambiar telescopio/ocular/cielo NO cambia la realización de la población: las mismas estrellas se ven mejor o peor.
5. **Presupuesto de rendimiento.** Objetivo: recomputar la imagen tras cambio de ocular en < 100 ms en un portátil medio, sin WebGL obligatorio. Esto condiciona qué se precomputa y qué se evalúa por frame (ver §7).

---

## 0a. Contexto

La implementación actual del halo de los cúmulos globulares pinta el perfil de King como un continuo suave (alpha-blending), lo que produce un "disco difuso" con borde visible que no se parece a la vista real al ocular. Quiero sustituirla por una aproximación físicamente motivada donde el perfil de King se usa como función de densidad de probabilidad para generar las estrellas débiles que Gaia no resuelve. El halo debe emerger como granulado/moteado (fluctuaciones de brillo superficial à la Tonry & Schneider 1988), nunca como degradado.

---

## 0b. Invariantes — fallos que no se deben repetir

Heredados de la experiencia de la rama `worktree-halo-estocastico` (v1–v6). Son restricciones de implementación vinculantes en TODAS las fases; los tests de cada fase deben cubrirlos.

1. **Ninguna transformación tonal global sobre la cadena fotométrica calibrada.** Toda compresión de rango dinámico vive exclusivamente en la Capa 5 y, si alguna vez se necesita compresión por componente, se aplica solo al campo difuso, nunca sobre cielo + estrellas conjuntamente. (En esta arquitectura esto es estructural: las Capas 1–4 trabajan en unidades físicas lineales.)
2. **Orden fijo del pipeline de población: muestrear → emparejar → anclar → atenuar.** No se re-ancla después de una atenuación: la conservación fotométrica (§3.4) se verifica ANTES de la capa perceptual (Capa 4), y la atenuación perceptual nunca retroalimenta la normalización de flujo.
3. **No contar luz dos veces.** El flujo de las estrellas resueltas y de la banda de transición se descuenta del campo estadístico vía `m_lim = m_res(r) + Δ` en S1/S2 (§3.2): la frontera es la misma para ambos componentes por construcción. El test de conservación §3.4 es el guardián; nunca un descuento manual paralelo.
4. **Una sola perilla libre por efecto.** Nunca dos parámetros acoplados libres a la vez en una calibración visual: se fija uno por convención documentada y se ajusta solo el otro. En esta especificación los únicos semi-libres son `k` (crowding) y `Δ` (banda de transición); si alguna calibración necesita mover ambos, se fija `Δ = 1.0` por convención y solo se toca `k`.
5. **Ante conflicto entre la letra de un enunciado y su criterio de aceptación, gana el criterio** y se documenta la desviación en el propio test/commit.
6. **Tests estrictos por elemento, no umbrales agregados arbitrarios.** Donde exista una ley exacta (conservación de flujo por estrella, S1/S2 contra la LF tabulada, clasificación por `m_res(r)`), el test comprueba la ley elemento a elemento con tolerancia numérica (≤ 1e-9 relativo); los umbrales agregados (±10% en Var(I), ±0.8 mag en μ) quedan como tests informativos de integración, documentando su origen.
7. **Prohibidas las discontinuidades espaciales en r** en cualquier magnitud que module flujo: `m_res(r)`, la atenuación perceptual y la transición resuelta↔no-resuelta usan siempre funciones suaves (la sigmoide de anchura 0.3 dex de §4.2 y la banda Δ de §2.4 existen precisamente para esto). Un escalón en r dibuja anillos.

---

## 0c. Pre-requisito
Sin perder la funcionalidad ofrecida por el perfil de King para determinar el "área" de un cúmulo globular, elimina toda funcionalidad que conlleve el uso de este perfil para añadir información de iluminación en el render de Gaia. Es decir, antes de comenzar con ninguna implementación indicada en este documento debemos asegurarnos que la visualización de un cúmulo globular (toma como ejemplo M13, M92, Omega Centauri y M5) es EXACTAMENTE la misma cuando la variable esglobular vale true que cuando vale false. Por tanto el código antiguo del halo continuo King debe quedar eliminado, no coexistir visualmente con el nuevo. Esta funcionalidad solamente se aplica a aquellos objetos que está marcados como globular = true

Usa los skills de:
/caveman:caveman ultra
/ponytail ultra
/mattpocock-skills:implement
/mattpocock-skills:tdd solamente cuando corresponda

---

## Capa 1 — Población estelar

**Responde a:** ¿qué estrellas existen y dónde?

### 1.1 Entradas

| Símbolo | Descripción | Fuente |
|---|---|---|
| `V_int` | Magnitud V integrada del cúmulo | Harris (2010) |
| `d` | Distancia (kpc) | Harris |
| `E(B−V)` | Enrojecimiento | Harris |
| `r_c, r_h, c` | Radio de núcleo, de media luz, concentración | Harris |
| `Φ(M_V)` | Función de luminosidad (LF) normalizada | ver 1.3 |
| catálogo Gaia | Estrellas observadas (posición, G, BP−RP) | Gaia DR3 |
| `f_compl(m, r)` | Función de completitud de Gaia | ver 1.5 |

### 1.2 Perfil radial

Perfil de King como **PDF por defecto**, no como mapa de iluminación:

```
Σ(r) ∝ [ (1 + (r/r_c)²)^(-1/2) − (1 + (r_t/r_c)²)^(-1/2) ]²ᵗᵉˣᵗ,  r_t = r_c · 10^c
```

Interfaz `RadialProfile` con implementaciones: `KingProfile` (defecto), `EFF`, `TabulatedProfile` (para cúmulos core-collapse tipo M15, cargar perfil observado). La elección es un atributo del cúmulo, no del renderizador.

### 1.3 Función de luminosidad

No inventar la LF. Usar una LF empírica de cúmulo globular viejo (p. ej. forma tipo la LF de M13/47 Tuc de la literatura, o una LF derivada de isócrona de 12 Gyr, [Fe/H] del cúmulo según Harris), tabulada como `Φ(M_V)` en pasos de 0.25 mag desde la punta de la rama gigante hasta M_V ≈ +9 (más débil no aporta flujo visual apreciable; documentar el corte y su fracción de flujo perdida, que debe ser < 1%).

**Normalización por flujo, no por número:**

```
∫ f(M_V) · Φ(M_V) dM_V · N_tot = F_total(V_int, d, E(B−V))
```

donde `f(M_V)` es el flujo lineal de una estrella de esa magnitud absoluta. Esto ancla el modelo a la fotometría integrada de Harris y hace que `N_tot` sea un valor derivado, no un parámetro libre.

### 1.4 Momentos de la LF (clave para la Capa 3)

Precomputar, una sola vez por cúmulo, las integrales acumuladas de la LF en flujo:

```
S1(m_lim) = Σ_{m > m_lim} f(m) · n(m)        (flujo total no resuelto por estrella "media")
S2(m_lim) = Σ_{m > m_lim} f(m)² · n(m)       (segundo momento → varianza SBF)
```

tabuladas sobre `m_lim` en pasos de 0.1 mag. Toda la textura del halo saldrá de `S1` y `S2`; no existe ningún parámetro de "contraste de grano".

### 1.5 Fusión Gaia + población sintética

Gaia es una **observación parcial** del cúmulo, no el cúmulo. Para evitar la discontinuidad en el límite de completitud:

```
n_sintética(m, r) = n_modelo(m, r) · [1 − f_compl(m, r)]
```

- `f_compl(m, r)`: sigmoide en magnitud con punto medio dependiente de la densidad local (crowding de Gaia, no del telescopio simulado). Calibrable comparando conteos Gaia vs. LF modelo en anillos.
- Las estrellas Gaia se usan tal cual (posición y magnitud reales).
- Las sintéticas de la banda brillante (las que Gaia perdió por crowding en el núcleo) se generan individualmente con posiciones muestreadas del perfil radial.

> **Nota de alcance (lección 6 de la rama anterior):** en la rama del halo estocástico se descartó por coste/beneficio modelar la completitud de Gaia por crowding. Esa decisión era correcta PARA aquella arquitectura, donde el núcleo lo gobernaba `ventanaNucleoMag`. En esta arquitectura la perilla instrumental desaparece y la fusión Gaia+sintéticas pasa a ser necesaria para que el núcleo no quede vacío de resueltas cuando `m_res(r_núcleo)` lo permita. Implementación mínima aceptable en Fase 1: `f_compl(m, r)` como sigmoide con dos constantes fijas (magnitud de codo G≈20 y endurecimiento con densidad local), sin calibración fina; refinar solo si la validación de Nivel 4 lo exige.

**Salida de la Capa 1:**
- Lista `S_bright`: estrellas individuales (Gaia + sintéticas de completado) hasta una magnitud de corte `m_cut` (ver Capa 2), con `(x, y, m, color)`.
- Tablas `S1(m_lim)`, `S2(m_lim)` y perfil `Σ(r)` para la población estadística.

---

## Capa 2 — Resolución

**Responde a:** ¿qué estrellas se distinguen como puntos individuales con ESTE instrumento, ESTE cielo y ESTE ojo?

### 2.1 PSF efectiva del sistema

```
FWHM_total² ≈ FWHM_Airy² + FWHM_seeing² + FWHM_ojo²(p_exit) + FWHM_ocular²
```

- `FWHM_Airy = 1.02 λ / D` (λ = 550 nm; escotópico: 507 nm — usar 530 nm como compromiso y documentarlo).
- `FWHM_seeing`: entrada del usuario (1″–4″).
- `FWHM_ojo(p_exit)`: aberraciones del ojo crecen con pupila de salida grande; aproximar con tabla (≈1′ de agudeza angular en retina, convertida a ángulo en cielo dividiendo por M; empeorar suavemente para p_exit > 4 mm).
- `FWHM_ocular`: término pequeño constante o por modelo de ocular; mantener el término en la arquitectura aunque inicialmente valga ~0.

En primera versión basta con una PSF gaussiana de esa FWHM. La convolución explícita Airy⊗Moffat queda como mejora futura sin cambio de interfaz.

### 2.2 Límite de detección puntual (cielo)

Magnitud límite estelar `m_lim,sky` calculada con el criterio de contraste de Crumey/Blackwell para fuente puntual sobre fondo `B_sky + B_halo(r)` (¡el fondo incluye el propio halo no resuelto del cúmulo!). Ver Capa 4 para el umbral; la Capa 2 lo consume como función.

### 2.3 Límite por crowding — `m_res(r)`

Criterio de confusión clásico: una estrella deja de ser separable cuando hay más de ~1 fuente de brillo comparable o mayor por cada `k` haces de resolución (usar `k = 30`, parámetro `crowdingCriterion`, el único semi-libre de esta capa; valores 10–50 en la literatura):

```
N(≥ m, r) · Ω_beam ≥ Ω_ring / k   →   despejar m = m_crowd(r)
Ω_beam = π (FWHM_total/2)²
```

### 2.4 Frontera de resolución

```
m_res(r) = min( m_lim,sky , m_crowd(r) )
```

y la clasificación por estrella, **dependiente de r**:

| Clase | Condición | Tratamiento en Capa 3 |
|---|---|---|
| Resuelta | `m < m_res(r) − Δ` | punto individual con PSF |
| Transición | `m_res(r) − Δ ≤ m ≤ m_res(r) + Δ` | individual, atenuada perceptualmente (Capa 4) |
| No resuelta | `m > m_res(r) + Δ` | campo estadístico |

con `Δ = 1.0 mag` (ancho de banda de transición; físicamente: zona donde la detección es probabilística). La misma estrella de m=16 puede ser "resuelta" a r=8′ y "no resuelta" a r=0.5′: la clasificación se evalúa por estrella con su r propio.

`m_cut` de la Capa 1 se fija como `max_r[m_res(r)] + Δ + margen(0.5)`: solo se generan individualmente estrellas que en ALGUNA configuración plausible podrían resolverse. Para no regenerar `S_bright` al cambiar de ocular, generar una única vez con el `m_cut` del mejor instrumento soportado (p. ej. D=500 mm, seeing 1″) y reclasificar por configuración (barato: una comparación por estrella).

**Salida de la Capa 2:** `m_res(r)` tabulado en ~50 anillos logarítmicos + clasificación de `S_bright`.

---

## Capa 3 — Imagen óptica

**Responde a:** ¿qué distribución de intensidad angular I(θx, θy) sale del ocular?

### 3.1 Componente resuelta (y de transición)

Para cada estrella clasificada resuelta/transición:

```
I(x,y) += f(m_i) · PSF(x − x_i, y − y_i)
```

Splatting de un stamp precomputado de la PSF (tamaño ~4·FWHM). Coste: N_bright × área_stamp. Para M13 con m_cut ≈ 17–18, N_bright ~ 3·10³–10⁴ → asumible en canvas 2D; trivial en WebGL.

### 3.2 Componente no resuelta — campo estadístico SBF

Para cada píxel (o celda de una malla más gruesa que luego se interpola), con `r` su radio y `m_lim = m_res(r) + Δ`:

**Media:**
```
⟨I⟩(r) = Σ(r) · S1(m_lim(r)) / normalización de flujo
```

**Varianza por celda de correlación** (la textura está correlacionada a la escala de la PSF, no por píxel):
```
σ²_celda(r) = Σ(r) · S2(m_lim(r)) / Ω_beam
```

Implementación: generar un campo de ruido gaussiano blanco en una malla de paso `FWHM_total/2`, escalar cada nodo por `σ_celda(r)`, interpolar bilinealmente al canvas y sumar a `⟨I⟩(r)`. Recortar a I ≥ 0. El campo de ruido usa la seed determinista: la textura es estable entre frames y entre cambios de ocular (solo cambia su amplitud y escala de correlación).

**Propiedades emergentes (sin parámetros):**
- Más apertura → m_res más profunda → S1 y S2 caen → menos halo y menos grano, más estrellas individuales. ✓
- Núcleo → m_res(r) más brillante por crowding → más flujo en el campo estadístico → núcleo lechoso. ✓
- El contraste de grano `⟨F²⟩/⟨F⟩² = S2/(S1²·N_beam)` refleja la LF real, no un parámetro. ✓

### 3.3 Fondo de cielo

Añadir `I_sky` uniforme (convertido de mag/arcsec² a las mismas unidades de flujo). El cielo entra ANTES de la capa perceptual porque fija la adaptación.

### 3.4 Verificación de conservación (test automático)

```
∫ I dΩ  ==  F(V_int)  ± 1%      (sin cielo, integrando resueltas + campo)
```
para toda combinación (D, M, seeing). Este test sustituye a `remanenteMinFrac`: si falla, hay un bug, no un parámetro que retocar.

**Salida de la Capa 3:** mapa `I(θ)` en unidades físicas (flujo por estereorradián) + lista de fuentes puntuales con su flujo.

---

## Capa 4 — Sistema visual

**Responde a:** ¿qué partes de I(θ) supera el umbral de detección de un observador adaptado?

### 4.1 Luminancia retinal

```
p_exit = D / M
L_ret = L_cielo_aparente · min(1, (p_exit / p_ojo)²) · T_óptica
```

- `p_ojo`: pupila del observador (entrada, defecto 6.5 mm; adaptación oscura).
- `T_óptica`: transmisión total (defecto 0.85).
- Aplicar el mismo factor a todo I(θ): la magnificación reparte el flujo en más área angular aparente (la superficie extensa pierde luminancia como M⁻² compensado por el área; implementar vía p_exit, que ya lo captura).

### 4.2 Umbral de contraste

Función `C_thr(L_fondo, θ_tamaño)` tabulada de Blackwell (1946) con la extensión de Crumey (2014) para uso telescópico. Implementación: tabla 2D interpolada (log L × log θ), ~20×20 valores. Sin fórmulas ad hoc.

- **Fuentes extensas** (halo): contraste local `C = (I − I_fondo_local)/I_fondo_local` evaluado a la escala angular del elemento; visible si `C > C_thr`. Aplicar como atenuación suave (sigmoide en C/C_thr con anchura 0.3 dex), no como recorte duro — la visión no es binaria.
- **Fuentes puntuales**: umbral de magnitud límite; las estrellas de la banda de transición se atenúan con la misma sigmoide (esto implementa la "estrella parcialmente confundida" sin código especial).

### 4.3 Régimen escotópico/mesópico y color

- `L_ret < ~0.01 cd/m²` → escotópico: **desaturar completamente** el color de estrellas débiles y halo. Solo las estrellas por encima del umbral mesópico (aprox. m < 6–7 aparente en el ocular, dependiente de L) conservan tinte.
- Coste: una función de saturación(L). Impacto en realismo: alto. Prioridad: primera versión.
- Visión avertida: modo opcional que desplaza la tabla `C_thr` ~1 mag (mejora bastones); botón "visión desviada" en la UI. Fase 2.

**Salida de la Capa 4:** mapa de luminancia percibida `L_perc(θ)` + saturación por punto.

---

## Capa 5 — Display

**Responde a:** ¿cómo se pinta L_perc en un monitor de 8 bits?

- Aquí, y SOLO aquí: `asinh`, gamma, nivel de negro, HDR si el navegador lo soporta.
- Mapeo por defecto: `pixel = asinh(L_perc / L_ref) / asinh(L_max / L_ref)` con `L_ref` ligado a la luminancia del cielo (el cielo debe pintarse gris muy oscuro, no negro puro, cuando hay contaminación lumínica).
- Parámetros de esta capa: libres, estéticos, documentados como tales. No retroalimentan nada.

---

## 6. Parámetros: antes y después

**Eliminados:** `remanenteMinFrac`, `magMin` (global), `ventanaNucleo`, `kUmbral`, `ajustesEstéticosLF`, opacidades de parche.

**Nuevos (todos físicos):**

| Parámetro | Unidades | Defecto |
|---|---|---|
| D, f, M | mm, mm, × | según equipo |
| seeing | arcsec FWHM | 2.0 |
| skyBrightness | mag/arcsec² | 21.3 |
| T_óptica | — | 0.85 |
| p_ojo | mm | 6.5 |
| crowdingCriterion k | — | 30 |
| Δ (banda transición) | mag | 1.0 |
| LF, perfil radial | tablas | por cúmulo |

Semi-libres solo `k` y `Δ`; ambos con rango estrecho justificado en la literatura y efecto verificable en la validación de Nivel 3.

---

## 7. Presupuesto de rendimiento y caché

| Cómputo | Cuándo | Coste |
|---|---|---|
| LF, S1/S2, perfil, S_bright | 1 vez por cúmulo (o precompilado offline) | ~10² ms |
| m_res(r), clasificación | por cambio de instrumento/cielo | ~10⁰ ms |
| Splat de resueltas | por cambio de instrumento | N_bright × stamp, ~10¹ ms |
| Campo estadístico | por cambio de instrumento | O(nodos malla) ~10⁰–10¹ ms |
| Capas 4–5 | por frame/por cambio | O(píxeles), shader o loop simple |

Total tras cambio de ocular: bien dentro de 100 ms sin WebGL. WebGL opcional para D grandes con N_bright > 3·10⁴.

---

## 8. Validación (criterios de aceptación)

1. **Nivel 1 — Fotometría:** test automático §3.4 en una rejilla de configuraciones.
2. **Nivel 2 — Estadística:** en anillos radiales, `⟨I⟩` reproduce Σ(r)·S1 y `Var(I)` reproduce Σ(r)·S2/Ω_beam dentro de ±10%.
3. **Nivel 3 — Resolución:** duplicar D debe desplazar m_res ~1.5 mag en el régimen limitado por difracción y desplazar la frontera resolved↔unresolved hacia el núcleo. Duplicar M con D fijo debe reducir L_ret ×4 y cambiar visibilidad del halo, no su estructura.
4. **Nivel 4 — Percepción (matriz M13):**

| Apertura | Aumento | Cielo | Resultado esperado |
|---|---|---|---|
| 100 mm | 50× | 21.5 | halo granular, borde resuelto, núcleo continuo |
| 200 mm | 100× | 21.5 | resolución hasta media distancia radial |
| 400 mm | 200× | 21.5 | núcleo mayormente resuelto |
| 200 mm | 200× | 18.5 | halo exterior desaparece, núcleo persiste |

Contrastar con reportes visuales reales (observadores, no astrofotos).

---

## 9. Plan de implementación incremental

**Fase 0 (preparación, sin cambio visual):** extraer del código actual la fotometría a unidades físicas; test de conservación §3.4 sobre el sistema viejo (fallará: eso documenta el problema).

**Fase 1 (el salto cualitativo):** Capa 1 (LF tabulada + S1/S2 + fusión Gaia) y Capa 3.2 (campo estadístico). Sustituye paquetes+`remanenteMinFrac`. Mantener temporalmente el display actual. Validar Niveles 1–2.

**Fase 2:** Capa 2 completa (`m_res(r)` con crowding, banda de transición). Eliminar `magMin`. Validar Nivel 3.

**Fase 3:** Capa 4 mínima (p_exit, contraste vs. cielo con tabla Crumey, desaturación escotópica). Mover asinh a Capa 5. Validar Nivel 4 con la matriz M13.

**Fase 4 (opcional):** perfiles no-King, visión avertida, PSF Airy+Moffat real, segregación de masas (solo si Nivel 4 muestra discrepancias atribuibles a ella).

Cada fase deja el simulador funcional y estrictamente mejor validado que la anterior.

---

## 10. Lecciones aprendidas de `worktree-halo-estocastico`: disposición en esta especificación

Análisis lección a lección. Tres categorías: **se importa** (sigue vigente aquí), **obsoleta** (era una decisión del mecanismo antiguo que esta arquitectura elimina; no debe re-abrirse, pero tampoco restringe el diseño nuevo), **conflicto resuelto** (la decisión antigua contradice esta especificación y se documenta por qué prevalece la nueva).

| # | Lección | Disposición |
|---|---|---|
| 1 | Semántica de paquete (magnitud efectiva > `magMin` sin duplicar) | **Obsoleta.** Los paquetes no existen en esta arquitectura; el campo S1/S2 no tiene magnitud efectiva por elemento. No re-abrir el debate en la rama antigua; en la nueva simplemente no aplica. |
| 2 | `estocastico: false` = campo abierto; la amortiguación antigua era un bug | **Se importa.** El modo determinista de esta arquitectura es el campo ⟨I⟩(r) sin ruido (σ=0), que es exactamente "campo abierto sin textura". Las capturas previas a la corrección no son referencia de regresión. |
| 3 | `radios` en el sistema propio del cúmulo con elipticidad (isolíneas = isofotas) | **Se importa tal cual.** El perfil `Σ(r)` de §1.2 y `m_res(r)` de §2.3 se evalúan en el radio elíptico propio (con `e`, `pa` del catálogo, cf. T3 de la rama anterior). Los tests miden en el sistema propio. |
| 4 | `valorPixel` sin recorte a 255; Float32 hasta el volcado final | **Se importa y se refuerza.** Es el invariante de la Capa 5: todo el pipeline en Float32 lineal; la cuantización a 8 bits es el último paso del display y nada aguas arriba la conoce. |
| 5 | Tablas CDF embebidas como arrays en el módulo (vanilla, sin fetch) | **Se importa.** Las tablas de esta especificación (LF por metalicidad, S1/S2, Blackwell/Crumey, perfiles Trager para validación) se embeben como arrays. Ninguna propuesta de JSON externo. |
| 6 | `magMin` fijo en 20 es inerte; no proponer completitud de Gaia por crowding | **Conflicto resuelto — parcialmente superada.** (a) `magMin` no existe en esta arquitectura: su papel lo hace `m_res(r)`, derivado, no fijado. (b) El descarte de la completitud de Gaia era coste/beneficio del diseño antiguo; aquí es pieza necesaria (§1.5, con la implementación mínima allí acotada). La lección se conserva como advertencia de alcance: no sobre-modelar `f_compl` más allá de la sigmoide de dos constantes salvo evidencia del Nivel 4. |
| 7 | `bprp` constante, resuelto con color por paquete (T7) | **Se importa transformada.** El equivalente aquí es color por estrella sintética condicionado al tramo de la LF (gigantes ~1.2, MS ~0.7), generado en Capa 1 desde el principio — mismo criterio de T7: preparar el color aunque el difuso aún se pinte sin él. La desaturación escotópica (§4.3) decide después cuánto color sobrevive. |
| 8 | 12 fallos heredados de `test_difuso.js` (capa PS1 galaxias) ajenos a la rama | **Se importa como higiene.** La rama `modelo-observacion` parte de `main`: registrar el conteo de fallos preexistentes en el commit inicial y no mencionarlos salvo que el número cambie. |
| 9 | Las tres desviaciones conscientes de v5 están absorbidas | **Obsoleta aquí** (eran del mecanismo antiguo), pero su meta-lección se importa: toda desviación consciente respecto a esta especificación se registra en `CHANGELOG.md` y se convierte en tarea o en lección, nunca queda "aceptada de palabra" (coherente con invariante 6). |
| 10 | Sin avisos de UI de sobresaturación: la física los hace innecesarios | **Se importa.** En esta arquitectura la causa desaparece por construcción (S1/S2 responden a `m_res`); el criterio general se adopta: ningún aviso de UI que parchee un síntoma que el modelo físico deba resolver. |

**Además, de las tareas v6 de la rama antigua, tres son convergentes y reutilizables por cherry-pick o port directo a esta rama:**

- **T1** (remanente por integración de la LF bajo `mlim`) es la versión embrionaria de S1 con `m_lim` global: el código de `fraccionNoResueltaLF` y sus 4 tests portan casi directos a §1.4, generalizando `mlim` → `m_lim(r)`.
- **T3** (`e`/`pa` de White & Shawl para todo el catálogo) es idéntica aquí; hacerla una sola vez en `main` para que ambas ramas la hereden.
- **T6** (LF tabulada por metalicidad) y **T7** (color correlacionado) son directamente la implementación de la Capa 1 (§1.3 y color); si la rama antigua las completa primero, se portan; si no, se implementan aquí y no allí.

Las tareas **T2, T4, T5 y T8** son específicas del mecanismo antiguo (`fraccionSegregada`, `kUmbral`, `ventanaNucleoMag`, `cacheSinteticas` con ancla): no se portan. T5 aporta sin embargo un activo valioso independiente del mecanismo: la tabla de perfiles μ_V(r) de Trager, King & Djorgovski (1995) para M13, M15 y M4, que aquí se reutiliza como referencia del test de Nivel 2 (§8).
