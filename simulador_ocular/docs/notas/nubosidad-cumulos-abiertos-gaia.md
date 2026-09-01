# La «nubosidad» de los cúmulos abiertos: ¿niebla de estrellas sub-umbral con datos de Gaia?

Fecha: 2026-09-01. Estado: investigación, sin código.

## La pregunta

Representar la nubosidad que a veces se ve en los cúmulos abiertos como una
«nieblina» de fondo hecha con las estrellas de Gaia que quedan por debajo del
umbral de detección del ojo. La premisa del usuario: en los globulares esto fue
imposible porque Gaia no tiene todos los datos; en los abiertos Gaia sí los
tiene, y la niebla «solo ocurre cuando hay varias estrellas muy cercanas».

Veredicto corto: **la premisa de completitud es correcta, la física es real en
los cúmulos abiertos ricos (M11, NGC 7789) y marginal o falsa en los pobres y
cercanos (Pléyades, donde la nebulosidad es reflexión, no estrellas), y el
proyecto ya tiene el 90 % de la maquinaria — lo que falta no es una ley nueva
sino cerrar un agujero de conservación de flujo: hoy la luz de las estrellas
catalogadas con `g > mlim` de un campo ordinario no va a ninguna parte.**

---

## 1. Lo que el proyecto ya sabe (verificado en los docs, con rutas)

- **El halo difuso de un globular ya es la luz no resuelta.** La capa de
  cúmulos reparte cada estrella entre dibujada y velo con conservación exacta
  (`Fdibujado = Ftotal − S1campo`), ADR
  `simulador_ocular/docs/adr/0012-el-crowding-es-una-probabilidad-por-estrella.md`
  (Bernoulli por estrella, `aCrowd`).
- **El crowding resultó inerte en globulares: manda el velo del cielo.**
  `P_solo = m_lim,sky` salvo 6 de 554 casos, y `m_crowd` es ciego al aumento
  (`simulador_ocular/docs/adr/0015-textura/analisis_recuperable.md` §5,
  `simulador_ocular/docs/experimentos/tres_modelos_mres.md`).
- **El velo no es suave: es grano.** N_ef = 0,41 estrellas por beam en el
  núcleo de M13 a 61×, RMS del 88–340 % del fondo
  (`simulador_ocular/docs/experimentos/velo_granularidad.md`); ninguna escala
  de integración entre 0,6″ y 100″ pasa de razón 0,042 contra `Cmin` — al
  grano le faltan ×24 (`simulador_ocular/docs/experimentos/escala_grano.md`).
- **La ley de textura (Rovamo a frecuencia única, ADR 0015) quedó FALSADA con
  medida**: P1, P2 y el banco del 18″ fallan, y P(ver) sale decreciente con el
  aumento cuando la observación pide creciente
  (`simulador_ocular/docs/adr/0015-textura/veredicto.md`). Su punto 8 dejó
  dicho: «los abiertos, si algún día la necesitan, la generalizarán con su
  propio banco».
- **La transición nebuloso→moteado→resuelto vive en el canal de estrellas
  resueltas**, no en un canal de textura: Φ (ADR 0016) la mide sobre las
  estrellas dibujadas.
- **Fondo agregado por debajo de un corte ya existe como mecanismo.** En
  campos densos el proxy suma los momentos de la población truncada
  (`COUNT`, `SUM(10^-0,4G)`, segundo momento) y el cliente lo incorpora como
  cielo extra `veloSB` — en M7 dio 21,0 mag/arcsec², clavando la estimación
  previa (`simulador_ocular/docs/adr/0014-adquisicion-gaia-por-regimen-de-densidad.md`,
  `veloSB()` en `resources/js/bitacora-gaia-render.js:677`).
- **En abiertos, el brillo de una estrella es umbral, no contraste** (ADR
  `0018-el-brillo-de-una-estrella-es-umbral-no-contraste.md`, medido sobre
  NGC 1245 / NGC 1664 / NGC 2266 con Gaia DR3 real): el alpha del disco es
  `(mlim − g)/rangoBrillo`, anclado a `mlim`.
- **La incompletitud de Gaia por arriba** (saturación, acantilado en G≈3) ya
  tiene su catálogo hermano de 108 filas (ADR
  `0018-las-estrellas-que-gaia-dr3-no-trae-son-un-catalogo-aparte.md`). No
  afecta a esta investigación: la niebla vive en el extremo débil.
- La ley perceptual es **H2c** (Ricco: `θ_R = 10^(0,094 + 0,081·SBe)` arcmin
  aparentes, seeing en cuadratura, K = 2,0, calibrada con 12 observaciones de
  campo), única ley de detección del modelo (ADR
  `0001-h2c-es-la-capa-perceptual-del-modelo-de-cumulos.md`,
  `FOT.H2C` en `resources/js/bitacora-gaia-render.js:169`).

---

## 2. Eje 1 — Completitud de Gaia: abiertos vs globulares

La premisa del usuario es correcta y está en las fuentes primarias:

- **Límite del catálogo.** Gaia (E)DR3 llega nominalmente a G ≈ 20,7; el
  percentil 99 de la distribución de G varía entre G ≈ 20 en latitudes
  galácticas bajas y alrededor de las Nubes de Magallanes y G ≈ 22 en
  latitudes altas (Fabricius et al. 2021, A&A 649, A5, arXiv:2012.06242,
  validación de EDR3; el catálogo DR3 reutiliza la misma fuente astrométrica).
- **Dónde se rompe.** El resumen oficial de EDR3 (Gaia Collaboration 2021,
  A&A 649, A1, arXiv:2012.01533) lo cuantifica: en regiones con densidades
  por encima de **unos pocos cientos de miles de estrellas por grado
  cuadrado** el límite efectivo puede ser sustancialmente más brillante que
  G = 20. Eso son ~50–100 estrellas/arcmin². Fabricius et al. 2021 midieron la
  completitud precisamente en globulares, contra la fotometría HST de
  Sarajedini et al. 2007: el catálogo «es completo en 3 < G < 15 salvo
  secundarias de pares cerrados (ρ ≲ 1,5″, caída rápida bajo 0,7″) y las
  partes centrales aglomeradas de los cúmulos globulares».
- **Densidades comparadas** (aritmética propia, órdenes de magnitud). El
  núcleo de un globular como M13 (~3×10⁵ estrellas, r_h ≈ 1,7′) supera las
  10³–10⁴ estrellas/arcmin² — equivalente a 10⁶–10⁷/deg², uno o dos órdenes
  por encima del umbral de crowding de Gaia. El cúmulo abierto más denso del
  catálogo Messier, M11 (NGC 6705, el arquetipo de la «nubosidad»), tiene una
  masa de 3700–11000 M⊙ (Cantat-Gaudin et al. 2014, A&A 569, A17, Gaia-ESO)
  repartida en un radio de ~16′ (Sung et al. 1999, MNRAS 310, 982): incluso
  concentrando la mitad en los 5′ centrales salen ~10–30 estrellas/arcmin²,
  por **debajo** del umbral donde Gaia empieza a perder. Las Pléyades (~2100
  miembros en varios grados; Bouy et al. 2015, A&A 577, A148, DANCe) están a
  ≪1 estrella/arcmin².
- **Membresía no es completitud.** El corte en G = 18 de Cantat-Gaudin &
  Anders 2020 (A&A 633, A99) es metodológico (astrometría fiable para
  UPMASK), no de Gaia; Hunt & Reffert 2023 (A&A 673, A114) llegan a G ≈ 20
  con DR3. Para esta capa da igual: el render no necesita membresía — pinta el
  campo entero, miembros y no miembros, que es lo que el ojo ve.

**Conclusión del eje 1: en el rango de densidades de cualquier cúmulo abierto,
Gaia DR3 es esencialmente completo hasta G ≈ 19–20.** La razón por la que en
los globulares «Gaia no tiene todos los datos» (crowding de detección del
propio Gaia, decisión 14 de `docs/notas/render-difuso-gaia.md`) no aplica a
los abiertos. Las estrellas de la niebla están en el catálogo, una a una.

---

## 3. Eje 2 — ¿Es real la nubosidad? La física de la luz sub-umbral en un abierto

Aquí es donde la idea necesita crítica, porque «cúmulo abierto» cubre dos
regímenes opuestos.

### 3a. Las Pléyades: la nebulosidad es reflexión, no estrellas

La nebulosidad visual de las Pléyades es una **nebulosa de reflexión real**
(NGC 1435, descubierta por Tempel en 1859 con un refractor de 10,5 cm; la
parte más brillante ronda mag 13 y la mayoría queda por debajo de 16;
Herbig & Simon 2001, AJ 121, 3138, la estudian como fragmento de la nube de
Tauro-Auriga que el cúmulo atraviesa). La luz estelar sub-umbral, en cambio,
es despreciable: la luz integrada del cúmulo (V ≈ 1,6) la ponen 9 estrellas;
los ~1500 miembros con V > 14 suman del orden de V ≈ 7,5 repartidos en más de
un grado, es decir **μ ≈ 24–25 mag/arcsec²** (estimación propia con la LF de
DANCe, cuyo pico está en M_G = 11–12): 2–3 mag por debajo de un cielo SQM 21,9,
contraste ≲6 %, y además difuso a escala de grados donde no hay borde que
detectar. **Una capa de niebla estelar que pintara las Pléyades nebulosas
estaría pintando el fenómeno equivocado** — y es un caso de control perfecto:
la capa correcta debe dar «invisible» ahí.

### 3b. M11 / NGC 7789: la niebla estelar es real y fuerte

El régimen opuesto: cúmulos ricos, lejanos y evolucionados.

- M11: módulo de distancia aparente V₀−M_V+A ≈ 12,5 (Sung et al. 1999), V
  total ≈ 5,8, turnoff a V ≈ 13–13,5, y una LF que a V ≥ 15 lleva ~2,5 veces
  más estrellas de lo que se estimaba (Sung et al. 1999, citando el exceso
  de Brocato et al. 1993). Con un 200 mm el `magLimite` del simulador ronda
  14,5–15: **el grueso de las estrellas del cúmulo — todo lo que está por
  debajo del turnoff — queda a caballo o por debajo del umbral del ojo.**
- Estimación propia del flujo sub-umbral: si un 20–40 % de la luz total de
  M11 está en estrellas con V > 15 (LF empinada bajo el turnoff), eso es
  V ≈ 6,8–7,6 sobre los ~78 arcmin² del núcleo visible: **μ ≈ 21–22
  mag/arcsec²**, comparable al propio cielo oscuro. Contraste del 40–100 %
  sobre SQM 21,5 — muy por encima del `Cmin` de una fuente de minutos de
  arco. Es el mismo orden que el velo medido de la población truncada de M7
  (21,0–21,1 mag/arcsec², ADR 0014), que el modelo ya trató como físicamente
  irrenunciable.
- NGC 7789 (1,6 Gyr, ~2,3 kpc, turnoff V ≈ 13) está en el mismo régimen. Los
  reportes visuales clásicos de «fondo nebuloso» en ambos son coherentes con
  esto.

**Conclusión del eje 2: la nubosidad de los abiertos ricos es exactamente lo
que el usuario dice — luz estelar catalogada por debajo del umbral del ojo —
pero es un fenómeno de un subconjunto de cúmulos** (ricos + lejanos: el
turnoff cerca de `mlim`), no una propiedad de la clase. La capa tiene que
salir sola en M11 y NO salir en las Pléyades ni en NGC 1664; ese es el listón
natural de un prerregistro.

---

## 4. Eje 3 — Percepción: cuándo el ojo suma estrellas en niebla

La condición «varias estrellas muy cercanas» traducida a números del propio
modelo:

1. **Fusión de puntos.** Dos estrellas dejan de separarse cuando su distancia
   en cielo baja de ~θ_res/M, con θ_res ≈ 2′ aparentes de agudeza en visión
   mesópica (el modelo de dobles del repo, ancla 0,50 sobre `fwhmAs`, memoria
   «fwhmAs no es una FWHM»). A 60× eso son ~2″ en cielo; a 250×, ~0,5″. En un
   abierto las separaciones típicas entre miembros débiles son de 10″–60″:
   **casi nunca se funden en pares** — no es el blending de un globular.
2. **Sumación de Ricco (H2c).** Lo que sí hace el ojo es integrar el flujo
   de todo lo que cae dentro del área de Ricco: θ* = θ_R/M en cielo, con
   θ_R = 10^(0,094+0,081·SBe) arcmin aparentes. A 61× con SBe ≈ 21, θ* ≈ 85″
   (medido en `escala_grano.md`): un parche de Ricco en M11 contiene decenas
   de estrellas sub-umbral. **La «niebla» es la detección de esa suma como
   fuente extensa contra `Cmin`** — que es literalmente la ley H2c que ya
   está en producción, aplicada a un flujo que hoy no se le presenta.
3. **La lección de los globulares aplica al revés de como se teme.** En
   abiertos la densidad es aún menor que en el halo de M13 (N por beam ≪
   0,07): el «velo» de un abierto es todavía más grano que el de un globular,
   y la ley de textura para verlo como grano ya quedó falsada (ADR 0015).
   Pero eso no mata la niebla: mata la *textura*. La media ⟨I⟩ — la mancha
   lisa — se juzga con `Cmin(θ_cúmulo)` y en M11 el número (contraste
   40–100 % contra Cmin de decenas de %) sale del lado visible, cosa que en
   el velo de los globulares no ocurría porque allí lo que faltaba era la
   *estructura*, no la mancha: el halo liso de un globular ya se pinta y se
   ve. Detección ≠ estructura (memoria del proyecto): esta capa es
   **detección de mancha**, la tarea para la que `Cmin` sí es la ley.
4. **La parte «viva» de la niebla no es esta capa.** El titileo con visión
   desviada de un fondo «a punto de resolverse» es el canal de estrellas
   resueltas cerca de `mlim` (banda de transición, Bernoulli, Φ del ADR
   0016), que ya existe y ya depende del aumento vía `m_lim,sky`. No hay que
   duplicarlo: la niebla es solo el término medio, estático.

---

## 5. Crítica a la idea, en limpio

1. **«Gaia no tenía todos los datos en globulares» es cierto pero no era el
   único problema.** Aunque Gaia hubiera sido completo, el velo de un globular
   ya estaba modelado (S1campo) y lo que se quiso añadir encima —grano,
   textura— resultó invisible por ley. La moraleja para los abiertos: pedir
   la *mancha*, no la *textura*. Si la petición muta a «que se vea granulada»,
   se estará repitiendo el ADR 0015 con peores números (menos estrellas por
   beam).
2. **«Esto ocurre cuando hay varias estrellas muy cercanas» es cierto pero la
   escala relevante no es la de fusión de pares** (θ_res/M, casi nunca se da
   en un abierto) **sino la de Ricco** (θ_R/M, siempre se da). La condición
   correcta es: flujo sumado de las sub-`mlim` dentro del área de Ricco por
   encima de `Cmin`. No hace falta ningún detector de «cercanía»: la suma por
   área ya lo es.
3. **No es una niebla de la clase «cúmulo abierto».** Es una función del
   cociente entre el turnoff y `mlim` del equipo. El mismo M11 con un 18″
   (mlim ≈ 16,2) tiene *menos* niebla y más estrellas — y eso el modelo lo
   dará gratis si la capa se alimenta de `mlim`, que ya depende de apertura,
   aumentos y cielo. Una capa que pintara «niebla porque es un abierto
   famoso por nebuloso» violaría el ADR 0004.
4. **El riesgo real es el doble conteo.** Tres fuentes de la misma luz
   acechan: (a) la estrella en la banda de transición que se dibuja con alpha
   pequeño Y se suma a la niebla; (b) el `veloSB` del fondo agregado (ADR
   0014) si el campo es denso y el corte de consulta muerde dentro del
   cúmulo; (c) la placa DSS/PS1, que ya contiene ese resplandor (el ADR 0014
   ya prohibió sumar velo sobre placa). El reparto tiene que ser
   complementario y exacto, como en los ADR 0011/0012.

---

## 6. El agujero concreto que esta idea destapa

Y esto es lo aprovechable de verdad. Siguiendo el flujo en
`resources/js/bitacora-gaia-render.js`:

- En un campo **denso**, la población por debajo del corte de consulta entra
  como `veloSB` (cielo extra, uniforme) — ADR 0014.
- En la **capa de cúmulos (globulares)**, la población sub-`m_res` entra como
  ⟨I⟩(r) = Σ·S1campo — ADR 0012, conservación exacta.
- En un **campo ordinario** (donde viven hoy los cúmulos abiertos, ADR 0018
  de brillo): cada estrella catalogada con `g > mlim` se procesa individual,
  su alpha `(mlim − g)/rangoBrillo` sale ≤ 0, no se pinta, **y su flujo no va
  a ningún velo: desaparece**. La consulta la trajo (el `magConsultaGaia`
  pide más hondo que `mlim` a propósito, línea 924), pero la cadena la tira.

La «nieblina» pedida es, en términos del repo, **cerrar esa fuga de flujo**:
la luz catalogada entre `mlim` y el fondo de la consulta debe reaparecer como
campo difuso local, igual que en los otros dos regímenes. No es capa nueva:
es el tercer caso del mismo invariante de conservación.

---

## 7. Veredicto

**Procede, condicionado y acotado:**

- Sí a una **mancha difusa** construida sumando el flujo Gaia de las
  estrellas con `g > mlim` (menos lo ya pintado en la banda de transición),
  con estructura espacial (por anillos o por celdas), atenuada por la ley
  H2c/`Cmin` existente como cualquier fuente extensa. Cero leyes nuevas,
  cero parámetros estéticos.
- No a una ley de textura/grano para abiertos (ADR 0015 punto 8 + veredicto:
  falsada en el régimen más favorable; los abiertos son peores).
- No a una niebla «por tipo de objeto»: debe emerger del catálogo y de
  `mlim`, y apagarse sola en Pléyades/NGC 1664.
- La nebulosidad de reflexión (Pléyades) es otro fenómeno y otra capa
  (catálogo sintético NGC/IC, decisión 21 de `render-difuso-gaia.md`); no
  mezclarlas.

## 8. Camino de implementación (condicionado al veredicto, con lo que ya existe)

Disciplina del repo: primero harness con prerregistro, luego código (ADR
0004, 0005, 0007).

1. **Harness de medida, sin tocar producción.** Para M11, NGC 7789, M37,
   M46 (positivos esperados) y Pléyades, NGC 1664, NGC 2266 (controles
   negativos): sumar el flujo Gaia con `g > mlim` en anillos alrededor del
   centro, convertir a μ (mag/arcsec²), y comparar contra
   `ctxFotometrico(...).Cmin` a θ del cúmulo y del anillo, con 2–3 equipos
   (200 mm / 457 mm, 60×–250×). Listones prerregistrados antes de mirar:
   positivos por encima de umbral a bajo aumento, controles por debajo, y
   monotonía correcta con la apertura (más apertura → menos niebla y más
   puntos, porque `mlim` baja el corte).
2. **Si pasa: el canal es el difuso existente.** `pintarFot(Fobj, …)` ya
   acepta un campo de flujo sintético (ese fue su diseño,
   `docs/notas/render-difuso-gaia.md`, «Estado del código»); la tabla radial
   ⟨I⟩(r) de la capa de cúmulos ya sabe convertir una suma de flujos en
   mancha atenuada por H2c. Para un abierto ni siquiera hace falta LF
   paramétrica ni King: las estrellas están todas en el catálogo — se suman
   tal cual. La pieza nueva es solo el enrutado: en `dibujar()`, el flujo de
   las filas con alpha ≤ 0 se acumula en el campo difuso en vez de perderse,
   y las de la banda de transición se reparten complementarias (a·F pintada,
   (1−a)·F a la niebla), calcando el punto 2 del ADR 0012.
3. **Guardas contra doble conteo:** con placa DSS/PS1 la capa no se pinta
   (misma regla que el velo del ADR 0014); si el campo trae `fondo`
   (`veloSB`), el corte de la niebla es `[mlim, magConsulta]` y el de
   `veloSB` `(magConsulta, ∞)` — disjuntos por construcción.
4. **Test de conservación** en la suite (`scripts/test_difuso.js`): flujo
   total del campo = pintado + niebla + veloSB, disciplina del ADR 0003.
5. **ADRs afectados:** nuevo ADR propio con su prerregistro; el punto 8 del
   ADR 0015 se cita como precedente (esta capa es la generalización de la
   *media*, no de la textura, así que no lo contradice); el ADR 0018 de
   brillo no se toca (las estrellas con alpha > 0 siguen igual); el ADR 0014
   gana el hermano local de su fondo agregado. Si el harness del paso 1
   falla en los positivos, se documenta y se cierra sin código, como los dos
   ejes de Gaia (ADR 0012 de listones) y la textura (ADR 0015).

---

## Referencias

Fuentes primarias externas:

- Gaia Collaboration (Brown et al.) 2021, *Gaia EDR3: Summary of the contents
  and survey properties*, A&A 649, A1, arXiv:2012.01533 — límite del survey
  sustancialmente más brillante que G = 20 por encima de ~pocos ×10⁵
  estrellas/deg².
- Fabricius, C., et al. 2021, *Gaia EDR3: Catalogue validation*, A&A 649,
  A5, arXiv:2012.06242 — completitud contra HST (Sarajedini et al. 2007) en
  globulares; completo en 3 < G < 15 salvo pares ρ ≲ 1,5″ y núcleos de
  globulares; percentil 99 entre G ≈ 20 y G ≈ 22.
- Cantat-Gaudin, T. & Anders, F. 2020, A&A 633, A99 (membresías UPMASK,
  corte G = 18); Cantat-Gaudin, T., et al. 2020, A&A 640, A1,
  arXiv:2004.07274 (censo de 2017 cúmulos).
- Hunt, E. L. & Reffert, S. 2023, A&A 673, A114 — membresías DR3 hasta
  G ≈ 20.
- Bouy, H., et al. 2015, *The Seven Sisters DANCe I*, A&A 577, A148,
  arXiv:1502.03728 — 2109 miembros de las Pléyades, LF con pico en
  M_G ≈ 11–12.
- Sung, H., et al. 1999, *UBVI CCD photometry of M11 II*, MNRAS 310, 982,
  doi:10.1046/j.1365-8711.1999.02961.x — radio 16′, V₀−M_V = 11,55,
  E(B−V) = 0,43, exceso ×2,5 de estrellas V ≥ 15, segregación de masa.
- Cantat-Gaudin, T., et al. 2014, A&A 569, A17 (Gaia-ESO, NGC 6705) — masa
  3700–11000 M⊙, distancia ~1,74 kpc.
- Herbig, G. H. & Simon, T. 2001, AJ 121, 3138, doi:10.1086/321077 — la
  nebulosidad de las Pléyades como nube interpuesta (reflexión); NGC 1435
  descubierta por Tempel (1859) con 10,5 cm.
- Tonry, J. & Schneider, D. 1988, AJ 96, 807 — régimen SBF (N_ef), ya usado
  por el proyecto.
- Blackwell 1946, Ricco (vía Crumey 2014), Robson & Graham 1981, Rovamo et
  al. 1992–94, Quick 1974 — citadas a través de los ADR 0001, 0012, 0015 y
  0016 del repo, donde ya están contrastadas con medidas propias.

Fuentes internas (rutas absolutas desde la raíz del repo):

- `simulador_ocular/docs/adr/0012-el-crowding-es-una-probabilidad-por-estrella.md`
- `simulador_ocular/docs/adr/0014-adquisicion-gaia-por-regimen-de-densidad.md`
- `simulador_ocular/docs/adr/0015-umbral-de-textura-para-el-grano-sbf.md` y
  `0015-textura/veredicto.md`, `0015-textura/analisis_recuperable.md`
- `simulador_ocular/docs/adr/0016-phi-metrica-de-veredicto-de-la-rotura-del-nucleo.md`
- `simulador_ocular/docs/adr/0018-el-brillo-de-una-estrella-es-umbral-no-contraste.md`
- `simulador_ocular/docs/adr/0018-las-estrellas-que-gaia-dr3-no-trae-son-un-catalogo-aparte.md`
- `simulador_ocular/docs/experimentos/velo_granularidad.md`,
  `escala_grano.md`, `tres_modelos_mres.md`
- `simulador_ocular/docs/notas/render-difuso-gaia.md`
- `resources/js/bitacora-gaia-render.js` (`FOT.H2C`, `veloSB`, `aCrowd`,
  `magConsultaGaia`, `pintarFot`)
