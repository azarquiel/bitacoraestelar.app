# Investigación · ¿el halo de un globular está desacoplado del aumento?

Encargo: comprobar si el velo difuso de M13 le roba protagonismo al núcleo, y si
hay que sustituir su flujo por `F_halo = F_difusa · (1 − f_resuelto)` con
`f_resuelto` derivado del modelo de crowding del ADR 0012.

**Resultado en una línea:** la ley propuesta **ya es la ley de producción**, y no
por analogía sino por identidad algebraica; medida en M13 con el mismo
telescopio a 61×/120×/250×, la fracción del flujo del cúmulo que vive en el velo
cae **0,7455 → 0,5984 → 0,5336**. La hipótesis (b) —«el halo está desacoplado
del aumento»— queda **refutada con medida**. La hipótesis (a) —«el velo del
núcleo apenas se apaga»— es **cierta como observación y correcta como física**:
tiene una causa medida y localizada (`m_crowd`, que no depende del aumento), y
no es un exceso de brillo que corregir.

Todo lo que sigue distingue MEDIDO (corrido aquí, con el número) de INFERIDO
(deducción sobre código o fuente leída).

---

## 1. Qué hace hoy el código

### 1.1 La cadena, con sus líneas

La Capa 1 no sabe nada de aumentos (frontera del ADR 0002, cabecera de
`resources/js/bitacora-cumulos.js:20-25`). Lo que da es una partición exacta del
flujo integrado en dos mitades complementarias:

- `resources/js/bitacora-cumulos.js:396` — `S1(mlim)`: flujo de las estrellas más
  débiles que `mlim`.
- `resources/js/bitacora-cumulos.js:402` — `Fresuelto(mlim) = cola1[0] − cola(cola1, mlim)`,
  el complemento **exacto** de `S1`.
- `resources/js/bitacora-cumulos.js:406` — `S1campo(m_res, δ)`, que es `S1` más el
  `(1−a)` de la banda de transición.
- `resources/js/bitacora-cumulos.js:410` — `Fdibujado(m_res, δ) = cola1[0] − S1campo(...)`.

El render compone `m_res` y pinta (`resources/js/bitacora-gaia-render.js`):

```
1498   var I0   = s * pob.S1campo(mc, delta);        // semilla: el velo del crowding
1499   var mSky = magLimite({ ..., sqm: -2.5*log10(cHalo.Fcielo + I0), ... });
1503   var m    = (mSky == null) ? mc : Math.min(mc, mSky);     // m_res(r)
1505   Im[i]    = s * pob.S1campo(m, delta);                    // <I>(r), flujo/arcsec²
1662   difuso[idx] += I;
```

y las estrellas que se dibujan se deciden con la **misma** `m_res(r)`, estrella a
estrella y con su radio, en `resources/js/bitacora-gaia-render.js:1696-1710`.

### 1.2 La fórmula propuesta ya está, y es una identidad

Con `Σ(r)` el perfil de King normalizado a 1 sobre el cielo
(`bitacora-cumulos.js:264-266`) y `F_tot` el flujo integrado que fija Harris
(`bitacora-cumulos.js:178-190`), lo que se pinta en cada radio es

```
<I>(r) = Σ(r) · S1campo(m_res(r))
       = Σ(r) · F_tot · (1 − Fdibujado(m_res(r))/F_tot)
       = F_difusa(r) · (1 − f_resuelto(r))
```

porque `Fdibujado ≡ F_tot − S1campo` por construcción, no por aproximación
(`bitacora-cumulos.js:399-410`; el comentario lo dice literalmente: «complemento
exacto de S1campo»). **INFERIDO** de leer el código; **MEDIDO** en §3.

`f_resuelto` ya tiene nombre en el repo y ya se calcula: es `f_res(r)` de
`scripts/matriz_m13.js:63-68`, definido allí como *«fracción del FLUJO del anillo
que va en estrellas dibujadas»* —flujo, no número—, exactamente la variante que
el encargo pedía.

### 1.3 ¿Depende del aumento? Sí, por una sola puerta

`m_res = min(m_crowd, m_lim,sky)`:

- `m_crowd` (`bitacora-cumulos.js:272-286`) se evalúa con `omegaRes`, la Ω ÓPTICA
  (`bitacora-gaia-render.js:1604`), que solo lleva apertura y seeing vía
  `radioImagenEstelar(o.apertura)`. **No depende del aumento**, y eso es
  deliberado: `bitacora-gaia-render.js:1596-1603` documenta que dejar entrar el
  píxel del lienzo hacía que el tamaño de la ventana decidiera cuántas estrellas
  tiene el cúmulo (86 de 1071 perdidas, medido en su día con
  `scripts/harness_halo_estrellas.js`).
- `m_lim,sky` sí lo lleva: `magLimite` mete `MAG` en el fondo aparente
  (`bitacora-gaia-render.js:664`, `SB0T = sqm + 5·log10(7.5·MAG/(D·√t))`).

De modo que el acoplamiento aumento → halo existe y va por `m_lim,sky`. Esto ya
estaba escrito y medido: `docs/halo_v7/especificacion_modelo_observacion_cumulos.md:550`
registra que entre 146× y 514× el halo se mueve 0,27-0,41 mag en μ y que
**`m_res` lo explica entero** (residuo 0,002-0,006 mag).

### 1.4 Conservación

`scripts/test_cumulo_render.js` ya guarda la conservación (§3.4 de la
especificación: campo pintado + resueltas = flujo total, dentro del 1 %), y
`docs/halo_v7/especificacion_modelo_observacion_cumulos.md:520` registra que la
mitad interna cierra a 1e-16. El ADR 0003 prohíbe forzarla anclando contra Gaia,
y el ADR 0004 prohíbe la perilla que apague el halo.

### 1.5 Lo que sí está pendiente (y es lo que el encargo intuía)

`aCrowd(m, r, fwhm) = exp(−Σ(r)·N(≥m+Δmag)·π·θ_sep²)` existe ya en
`bitacora-cumulos.js:307-313`, se exporta en `:413` con el comentario «ADR 0012,
todavía sin usar en el render», y `scripts/test_crowding_psolo.js` la mide en
rojo a propósito. **Ese** es el trabajo abierto: sustituir el umbral
`m_crowd` + banda `δ` por la probabilidad por estrella. No es un cambio de la ley
del halo; es un cambio del `m_res` que la alimenta, con el reparto conservativo
`a·F` dibujado / `(1−a)·F` al velo que el propio ADR 0012 fija.

---

## 2. Fuentes externas

Cada afirmación con la fuente que la posee.

**El brillo superficial de una fuente extensa no crece con el aumento.** Es
conservación de radiancia / invariancia de étendue: un sistema óptico pasivo no
puede aumentar la radiancia, y el brillo superficial de un extenso en el ojo no
puede superar el que tiene en el cielo; con la pupila de salida por debajo de la
del ojo el brillo superficial cae como `1/M²`.
[RP Photonics, *Radiance*](https://www.rp-photonics.com/radiance.html);
[Telescope Equations, *Surface Brightness*](https://www.rocketmime.com/astronomy/Telescope/SurfaceBrightness.html).
**No he encontrado fuente primaria abierta y citable** (Born & Wolf está tras
muro); lo declaro como física de manual, no como cita.

Lo que importa para este encargo es el corolario: **el fondo de cielo cae con
`1/M²` exactamente igual que el halo**, así que el CONTRASTE halo/cielo es
invariante con el aumento salvo por `m_res`. Eso es justo lo que ya está escrito
en el repo (`docs/halo_v7/informe_autocritica_v7.md:25-34`, el falso positivo D2:
partir la pupila del ojo mueve el contraste **0,00000 mag**) y lo que el ADR 0006
convierte en regla de contabilidad.

**Umbral de contraste con luminancia y tamaño angular.** Crumey (2014), *Human
contrast threshold and astronomical visibility*, MNRAS 442, 2600, DOI
[10.1093/mnras/stu992](https://doi.org/10.1093/mnras/stu992), preprint
[arXiv:1405.4209](https://arxiv.org/abs/1405.4209): modelo de visibilidad para
blancos acromáticos uniformes **de cualquier tamaño** contra fondos de luminancia
cero a diurna, derivado sistemáticamente de un conjunto de datos como el de
Blackwell (1946), *Contrast Thresholds of the Human Eye*, JOSA 36, 624, DOI
[10.1364/JOSA.36.000624](https://doi.org/10.1364/JOSA.36.000624). El repo NO usa
esta tabla: el ADR 0001 decide que la Capa 4 es H2c, calibrada con 12
observaciones reales, y que Crumey no entra «ni siquiera como modo apagado». La
cita sirve aquí solo para lo que el encargo preguntaba: el umbral depende de
**las dos** variables, luminancia de adaptación y tamaño angular.

**Parámetros del cúmulo.** Harris, W. E. 1996, AJ 112, 1487, edición de diciembre
de 2010, [arXiv:1012.3224](https://arxiv.org/abs/1012.3224) — `V_t`, `d`,
`E(B−V)`, `[Fe/H]`, `r_c`, `r_h`, `c`. Es la fuente que `gen_globulares.py`
consume y de donde salen `Ftotal` y la geometría de §3.

**Perfiles superficiales.** Trager, King & Djorgovski 1995, AJ 109, 218, DOI
[10.1086/117268](https://doi.org/10.1086/117268) (errata 1995AJ....109.1912T):
125 globulares, ajuste de Chebyshev sobre datos heterogéneos. Está archivado en
`docs/halo_v7/trager1995.tsv` (1061 puntos, cuatro cúmulos; rescatado de VizieR
J/AJ/109/218, ver `informe_autocritica_v7.md:61-67`).

**Ley de King.** King 1962, AJ 67, 471, DOI
[10.1086/108756](https://doi.org/10.1086/108756) — la forma empírica
`n(r) ∝ [(1+(r/r_c)²)^(−1/2) − (1+(r_t/r_c)²)^(−1/2)]²` que el repo usa como PDF.
King 1966, AJ 71, 64, DOI [10.1086/109857](https://doi.org/10.1086/109857) — los
modelos dinámicos, que el repo NO usa. Ambos advierten que la forma de 1962 no
describe los núcleos colapsados, que es exactamente el residuo de −1,52 mag que
la especificación registra para los 30 cúmulos con `c ≥ 2`
(`especificacion_modelo_observacion_cumulos.md:520`).

**Función de luminosidad.** La del repo no viene de HST sino de isócronas PARSEC
v1.2S + COLIBRI vía CMD 3.9 (Bressan et al. 2012, MNRAS 427, 127), IMF de Kroupa
(2001, 2002), 12 Gyr, `[M/H] = [Fe/H] + 0,29` de Salaris et al. 1993 — cabecera
de `scripts/gen_lf_globulares.py:1-30` y de `resources/js/lf-globulares-datos.js:1-8`.
**No he buscado una LF de HST de M13 para contrastarla**: no hacía falta para
juzgar la hipótesis, y meterla sería abrir otra capa (ADR 0007).

**Crowding y completitud en catálogos.** Fabricius et al. 2021, *Gaia EDR3
catalogue validation*, A&A 649, A5,
[arXiv:2012.06242](https://arxiv.org/abs/2012.06242): la completitud de Gaia se
derrumba con la densidad —el límite del 90 % va de G≈16 a G≈20 según densidad
estelar, y en los núcleos más densos la completitud a G=18 es casi cero—, y
Lindegren et al. 2021 mide el suelo de resolución en ~0,6″. Eso valida la forma
de `completitud()` en `bitacora-cumulos.js:319-322` (codo en 20,0 adelantado por
`m_crowd` con el beam de Gaia) y el `gaiaFwhmAs: 0.6` de `:57`.

**«Resolución» visual de globulares.** La clasificación clásica es Shapley &
Sawyer 1927, Harvard College Observatory Bulletin 849, 11 (bibcode
1927BHarO.849...11S), y clasifica **concentración**, no resolubilidad; M13 es
clase V. **No he encontrado ninguna fuente primaria revisada que dé un criterio
cuantitativo de a qué aumentos se «resuelve» un globular visualmente.** Lo digo
en vez de rellenarlo: el criterio del repo (`m_res` compuesto) no tiene contra
qué contrastarse en la literatura, y por eso la validación del repo es
fenomenológica (matriz de `matriz_m13.js`), no bibliográfica.

---

## 3. La prueba diagnóstica, ya corrida

**MEDIDO.** M13 (NGC 6205), D = 467 mm, SQM 21,0, transmisión 0,9, pupila de ojo
7 mm, δ y todo lo demás en sus valores de producción. Sin tocar producción: los
números salen de `pintarCumulo` y de su tabla radial, que es lo que pinta el
píxel (ADR 0008: no se reimplementa la ley que se mide). `r_c = 37,2″`,
`r_h = 101,4″`, `r_t = 1261″`, `N_tot = 1.272.403`, `F_tot = 4,8753e−3`.

### 3.1 Global

| M | mlim puntual | m_res(0) | m_res(r_h) | **F_halo/F_tot** | F_dib/F_tot | ⟨I⟩(0) | μ_halo(0) | s_halo(0) | f_res(0) | f_res(r_h) |
|---|---|---|---|---|---|---|---|---|---|---|
| 61×  | 14,89 | 12,04 | 13,99 | **0,7455** | 0,2545 | 2,45e−7 | 16,53 | 1,000 | 0,140 | 0,441 |
| 120× | 15,83 | 13,34 | 15,06 | **0,5984** | 0,4016 | 2,09e−7 | 16,70 | 1,000 | 0,285 | 0,530 |
| 250× | 16,49 | 13,86 | 15,86 | **0,5336** | 0,4664 | 1,93e−7 | 16,78 | 1,000 | 0,387 | 0,568 |

FWHM = 2,09″ en las tres (no depende del aumento, por diseño).

### 3.2 Estrellas dibujadas por anillo

`node scripts/harness_halo_estrellas.js --mag {61,120,250} --D 467 --sqm 21`,
sobre el fixture `docs/halo_v7/m13_gaia_dr3.csv`:

| r/r_h | 61× | 120× | 250× |
|---|---|---|---|
| ≤0,25 | 13 | 48 | 74 |
| ≤0,50 | 30 | 108 | 190 |
| ≤1,00 | 117 | 305 | 448 |
| ≤2,00 | 159 | 340 | 538 |
| **total** | **489** | **1191** | **1818** |

El invariante del arnés («fuera de r_h el halo no quita ninguna estrella») pasa
en las tres corridas.

### 3.3 Dentro del núcleo (r < r_c)

| M | F_halo(r<r_c)/F_tot | F_estrellas(r<r_c)/F_tot | razón halo/estrellas | μ_halo medio | ⟨I⟩(0)/F_cielo |
|---|---|---|---|---|---|
| 61×  | 0,1562 | 0,0115 | 13,6 | 16,89 | 61,6 |
| 120× | 0,1313 | 0,0365 | 3,6  | 17,08 | 52,4 |
| 250× | 0,1181 | 0,0496 | 2,4  | 17,19 | 48,6 |

### 3.4 Lectura

1. **El halo NO está desacoplado.** Su fracción del flujo cae un 28 % de 61× a
   250× mientras las estrellas dibujadas se multiplican por 3,7. El criterio de
   falsación del encargo («si el halo aporta casi la misma luz mientras crecen las
   estrellas resolubles, está desacoplado») **no se cumple**.
2. **En el núcleo sí se estanca, y se sabe por qué.** `m_crowd(0) = 13,85`
   (medido llamando a `pob.mCrowd` con la Ω óptica). A 61× y 120× manda
   `m_lim,sky` (12,04 y 13,34); a 250× `m_res(0) = 13,86` **ya es `m_crowd`**.
   Por encima de ~250× el velo del núcleo deja de apagarse, porque lo que lo
   limita es apertura + seeing, no el aumento. Eso es física correcta, no un bug:
   es literalmente lo que el encargo pedía —la fracción no resuelta— llevada a su
   techo.
3. **El fondo local del núcleo es el propio cúmulo,** no el cielo:
   `⟨I⟩(0)/F_cielo ≈ 50-60`, es decir 4,3-4,4 mag por encima. De ahí que la
   iteración única de `bitacora-gaia-render.js:1494-1503` sea un punto delicado y
   no un detalle (§5).
4. **`s_halo(0) = 1,000` en las tres.** El velo del núcleo está muy por encima del
   umbral H2c, y ahí el realce perceptual se retira solo
   (`realzarPerceptual`, `bitacora-gaia-render.js:528-540`, `gamma_efectiva → 1`
   cuando `s → 1`). El núcleo no se quema.

### 3.5 Por qué `f_resuelto` tiene que ser de FLUJO

**MEDIDO** sobre la LF de M13 (`dm = 14,318`):

| m_lim | fracción de FLUJO con m < m_lim | fracción de NÚMERO |
|---|---|---|
| 13 | 0,1358 | 5,8e−5 |
| 14 | 0,2564 | 1,8e−4 |
| 15 | 0,4466 | 8,3e−4 |
| 16 | 0,5268 | 1,2e−3 |

A m = 16 se ha resuelto el **52,7 % de la luz** con el **0,12 % de las estrellas**:
440× de diferencia. Una `f_resuelto` de conteo daría un halo prácticamente igual
al total a cualquier aumento. El repo ya usa la de flujo
(`bitacora-cumulos.js:402`, `matriz_m13.js:63-68`).

---

## 4. Veredicto

| Punto del encargo | Veredicto |
|---|---|
| (a) el halo del núcleo apenas se apaga con M | **Cierto y correcto.** Causa medida: `m_crowd(0) = 13,85` es el techo; a 250× `m_res(0)` ya está en él. No es exceso de brillo. |
| (b) el halo está desacoplado del modelo de resolución | **Refutado.** 0,7455 → 0,5336 de 61× a 250×. |
| `F_halo = F_difusa·(1−f_resuelto)` | **Ya implementado, como identidad exacta.** No hay nada que añadir. |
| `f_resuelto` de flujo, no de número | **Correcto, y es lo que hay.** Diferencia medida: 440× a m=16. |
| Derivarlo del crowding del ADR 0012 | **Es el trabajo pendiente real**, pero afecta a `m_res`, no a la ley del halo. `aCrowd` existe (`bitacora-cumulos.js:307-313`) y no la llama nadie. |
| Rechazar `halo *= 1/aumento` | **De acuerdo, y además ya está prohibido** por el ADR 0004, y sería físicamente falso: el cielo cae con `1/M²` igual que el halo, así que el contraste no cambia (D2 refutado, `informe_autocritica_v7.md:25-34`). |

**Nada que cambiar en producción a partir de esta investigación.** Lo que queda
del malestar original es D1 —«el halo se ve grande y brillante»—, que
`informe_autocritica_v7.md:127-132` dejó abierto con la fotometría y la morfología
ya exoneradas: si el defecto existe, la causa está en la ley de visibilidad o en
el realce, y **falta una captura reproducible del defecto**. Sin ella, cualquier
cambio aquí es un parámetro estético (ADR 0004).

---

## 5. Riesgos si alguien decide tocarlo igual

1. **Doble conteo, garantizado.** Multiplicar `<I>` por otro `(1−f_resuelto)`
   sobre `S1campo` cuenta el mismo factor dos veces y rompe la conservación del
   1 % que guarda `test_cumulo_render.js`. El ADR 0012 §3 ya avisa del mismo error
   con `P_solo` frente a `m_crowd`.
2. **La rueda del velo.** `m_lim,sky` se calcula contra `F_cielo + I0`, donde `I0`
   es el propio velo (`bitacora-gaia-render.js:1494-1503`). Más velo ⇒ `m_res` más
   somera ⇒ más velo. Hoy no se dispara porque se hace **una** iteración sembrada
   por `m_crowd`, la única cota independiente del cielo. Con `⟨I⟩(0)/F_cielo ≈ 50`
   medido, cualquier retoque del velo entra directamente en ese lazo. El ADR 0012
   (B) lo tiene abierto con criterio: iterar hasta que `m_res` se mueva menos de
   0,01 mag.
3. **`m_eff` no puede volver a la fotometría.** `bitacora-gaia-render.js:1709`
   escribe la magnitud atenuada de la banda y guarda la original en la 5ª casilla;
   el invariante 8 de la especificación y el arnés lo vigilan (482 estrellas de
   1467 perdidas la vez que se rompió).
4. **No mezclar marcos.** Flujo/magnitud/μ por un lado, contraste frente a `Cmin`
   por otro (ADR 0006). El falso D2 nació justo de comparar `SBe` con flujo crudo.
5. **Ω óptica ≠ Ω del píxel.** `omegaRes` manda en `m_crowd` y `omegaBeam` solo en
   σ del grano (`bitacora-gaia-render.js:1604-1605`). Fusionarlas hace que el
   tamaño de la ventana decida cuántas estrellas tiene el cúmulo.

**Qué NO tocar:** `S1campo`/`S2campo`/`Fdibujado` y la partición complementaria;
`magLimite`; la separación `omegaRes`/`omegaBeam`; `realzarPerceptual` y su `t`;
y no introducir ningún factor de halo cuyo criterio de ajuste sea el aspecto.

---

## 6. Si se quiere reejecutar la prueba

Todo lo de §3 sale sin tocar producción:

- `node scripts/harness_halo_estrellas.js --mag 61 --D 467 --sqm 21` (y 120, 250)
  → estrellas dibujadas por anillo, `m_res(r)`, invariante del halo despreciable.
- `node scripts/matriz_m13.js --perfil` → `f_res(r)`, `r_50/r_h`, `r_vis/r_h`,
  `s_halo(0)`, `s_grano`. Es el arnés canónico de `f_resuelto`.
- Los números de §3.1, §3.3 y §3.5 se sacaron llamando a `R.pintarCumulo` y a
  `pob.S1campo`/`Fresuelto`/`mCrowd` desde `node -e`, sin escribir ningún script
  nuevo. Si se van a repetir a menudo, el sitio natural es una fila más en
  `matriz_m13.js` (barrido en M con D fijo), no un arnés nuevo.

**Criterio de falsación, para la próxima vez:** la hipótesis «el halo está
desacoplado» se aceptaría si `F_halo/F_tot` variase menos del 5 % entre 61× y
250× mientras el número de estrellas dibujadas se multiplica por más de 2. Lo
medido es 28 % y ×3,7: **falsada**.
