# Auditoría de identidad y conservación por canal — resultado

Fecha: 2026-09-19. Paso 1 del plan de mejora de brillos de fondo sub-`mlim`.
Ámbito verificado: `resources/js/bitacora-gaia-render.js`,
`resources/js/bitacora-cumulos.js`, `simulador_ocular/gaia_proxy.php`.
Arnés de medida: `scripts/harness_auditoria_canales.js` (importa leyes de
producción, ADR 0008). Datos: fixtures cacheadas `scripts/fixtures/gaia/canales_*.json`.

---

## 1. Resumen ejecutivo

**Son una ley con cuatro implementaciones, no cuatro fenómenos.** El fenómeno es
único —una población discreta de fotones con dos momentos, ⟨I⟩ y σ², regida por
la SBF de Tonry & Schneider (1988)— y el código lo implementa cuatro veces con
Φ, ley perceptual y presupuesto de cielo distintos.

- **Cuatro Φ**: glow y niebla usan el catálogo Gaia discreto; el velo, los
  momentos de la banda truncada del TAP; el halo, la LF analítica de
  King/Harris.
- **σ² solo existe en el halo** (`S2campo`, calculada pero con `sGrano = 0`). El
  glow y la niebla no acumulan Σf² en absoluto. **Hallazgo**: el TAP sí devuelve
  Σf² en la clave `m2` (`gaia_proxy.php:138-142`), pero `veloSB()` la ignora —
  el velo *podría* tener varianza y hoy no la lee.
- **Solo el velo realimenta `cieloEfectivo`** (Q5 positivo). Glow y niebla no
  (H2 confirmado). El halo solo realimenta su `m_lim,sky` local.
- **El halo es el único canal internamente coherente** (Q1=Q2=Q3=sí) y el modelo
  a seguir. La niebla es el más incoherente (Q4 roto por el parche ×1,5; Q5
  roto por H2).

**Un REFUTADO de primer orden**: la hipótesis de §2 «el velo probablemente
tampoco tiene σ² (verificar TAP)» es incorrecta. El TAP agrega `Σf` **y** `Σf²`;
es el render el que descarta la segunda. No es «no se calcula» (niebla) ni «se
calcula y se apaga» (halo): es **«se calcula en el proxy y se ignora en el
render»**, una tercera categoría.

**Fase B (cuantificado)**: `N_eff` por beam es ≫1 en los campos ricos (lisos) y
≈1 solo en los campos donde ⟨I⟩ cae muy por debajo del umbral (M45, NGC 2266):
añadir σ² no revelaría grano en ningún objeto del banco. El `Δmlim` de
realimentar glow+niebla (escalar de disco) va de −0,01 a −0,27 mag, consistente
con el #186 (−0,23/−0,25) y con §5.6 de
`niebla-campo-pupila-y-aumentos.md` (−0,07 a −0,32).

---

## 2. Tabla de auditoría verificada (Fase A)

Convención: `fichero:línea` sobre el estado de `main` a 2026-09-19. Todas las
líneas citadas en la especificación se verificaron contra el código real y
**coinciden**; no hubo que corregir ninguna referencia.

| Canal | `Φ` | `⟨I⟩` | `σ²` | Misma `Φ` | Ley perceptual | `cieloEfectivo` | Conservación | Estado |
|---|---|---|---|---|---|---|---|---|
| **Glow** | catálogo Gaia, discreto | no (sprites, alfa implícito) | **no** | N/A | por sprite (`'lighter'`) | **no** | sí (pintado aditivo) | **CONFIRMADO** |
| **Niebla** | catálogo Gaia, discreto | sí (`Σf`, `:1057`) | **no** (solo momento espacial `Σf·r²`) | N/A | `visibilidadDifusa` 5º arg + parche ×1,5 | **no** (H2) | contador sí, pintado no | **CONFIRMADO** |
| **Velo** | banda truncada del TAP | sí (`flujo/π·rad²`) | **no** (el TAP da `m2`=Σf², `veloSB` la ignora) | N/A | uniforme (sin capa pintada) | **sí** (`sumaSB`) | sí | **REFUTADO** (Q2) |
| **Halo** | King/Harris, analítica | sí (`S1campo`, `:2089`) | sí (`S2campo`, `:2090`) **apagada** (`sGrano=0`) | **sí** | `visibilidadDifusa` con `difusoMask` propia | parcial (`m_lim,sky` local) | sí | **CONFIRMADO** |

### 2.1 Glow — `dibujar()`, corte en `:2468-2472`

```
bitacora-gaia-render.js:2455   ctx.globalCompositeOperation = 'lighter';
bitacora-gaia-render.js:2468   if (gDet > mlim) {
bitacora-gaia-render.js:2471     var aGlow = CFG.alfaMin * Math.pow(10, -0.4 * (g - mlim));
bitacora-gaia-render.js:2472     if (aGlow < CFG.glowCorte) continue;
bitacora-gaia-render.js:2473     ctx.globalAlpha = Math.min(1, aGlow) * ganActual;
bitacora-gaia-render.js:2474     ctx.drawImage(glow, x - Rg, y - Rg, Rg * 2, Rg * 2);
```

- Q1 **no**: no hay `Σf` ni `Σf²` agregados; es un canal puramente per-sprite.
  El ancla `alfaMin = 0.05` (`:821`) y el corte `glowCorte = 0.006` (`:892`)
  fijan la cola en `colaGlowMag() = 2,30` mag (`:961`).
- Q2 **no**: ningún `f*f`/`f**2`.
- Q5 **no**: los sprites se dibujan con `'lighter'` (`:2455`), luego su luz
  **existe de facto** sumada a la capa de estrellas, pero no se contabiliza en
  ningún contador global ni en `cieloEfectivo`. Confirmado: no hay ningún
  `F.glow` ni `cielo.*` que acumule la banda glow.

### 2.2 Niebla — `nieblaCampo()`, `:1030-1079`

```
bitacora-gaia-render.js:1037   var corte = o.mlim + colaGlowMag();
bitacora-gaia-render.js:1056   var f = Math.pow(10, -0.4 * g);
bitacora-gaia-render.js:1057   total += f;                           // flujo REAL devuelto
bitacora-gaia-render.js:1058   mx += f * x; my += f * y; mr2 += f * (x * x + y * y);
bitacora-gaia-render.js:1059   f *= gananciaNiebla();                // parche estético
bitacora-gaia-render.js:1077   o.thetaJuicioArcmin = thetaJuicioNiebla(thSkyArcmin, total, mx, my, mr2, asPorPx);
bitacora-gaia-render.js:1078   return total;
```

- Q1 **sí**: `total` (`:1057`) es `Σf` real, devuelto **sin** el parche.
- Q2 **no**: la única acumulación de segundo orden es `mr2 = Σ f·(x²+y²)`
  (`:1058`), el **momento espacial** para `R50`/`thetaJuicio` (`:1088-1095`), no
  la varianza de flujo Σf². No hay `f*f` en ninguna línea de la función.
- Q3 N/A (sin σ², no puede haber incoherencia interna de Φ).
- Q4 **parcial**: usa `visibilidadDifusa` vía el 5º argumento `thNiebla`
  (`vistaGaia:2680` → `pintarFot:616,639`), pero el parche `gananciaNiebla()`
  (`:1059`, `NIEBLA_GANANCIA_ESTETICA=1.5` en `:250`) escala el flujo **antes**
  de `visibilidadDifusa`, rompiendo la ley compartida con el halo. El parche baja
  el umbral efectivo `2,5·log₁₀(1,5) = 0,44` mag **solo** para la niebla.
- Q5 **no**: el `total` devuelto se **descarta** en `vistaGaia:2664` (llamada sin
  asignación). No entra en `sumaSB`/`veloSB` ni degrada `mlim`. H2 confirmado.
- Conservación: contador sí (`total` real), pintado no (parche ×1,5). El parche
  se usa **solo** aquí — `NIEBLA_GANANCIA_ESTETICA` no aparece en ningún otro
  sitio del código (verificado por grep).

### 2.3 Velo — `veloSB()`, `:717-720`; TAP en `gaia_proxy.php:137-142`

```
bitacora-gaia-render.js:717   function veloSB(fondo) {
bitacora-gaia-render.js:718     if (!fondo || !(fondo.flujo > 0) || !(fondo.rad > 0)) return null;
bitacora-gaia-render.js:719     return -2.5 * Math.log10(fondo.flujo / (Math.PI * Math.pow(fondo.rad * 3600, 2)));
bitacora-gaia-render.js:720   }
```

La clave `fondo` la produce el TAP (`simulador_ocular/gaia_proxy.php`):

```sql
-- gaia_proxy.php:138 (CDS) / :141 (GAVO)
SELECT COUNT(*) AS n, SUM(POWER(10,-0.4*Gmag)) AS flujo, SUM(POWER(10,-0.8*Gmag)) AS m2
FROM ... WHERE Gmag > corte AND Gmag <= mag
```

- **Hallazgo (Q2 REFUTADO)**: el TAP devuelve **ambos** momentos: `flujo` = Σf y
  `m2` = Σf² (`10^(-0,8·G) = f²`). La especificación preguntaba «¿devuelve Σf
  solo, o Σf y Σf²?». Respuesta: **ambos**. `veloSB()` lee solo `flujo` y `rad`;
  `m2` queda sin usar en todo el render. El velo *podría* calcular σ² hoy y no lo
  hace.
- Q1 **sí**: `veloSB = -2,5·log10(flujo/π·rad²)` — la media SB de la banda
  truncada, uniforme sobre el campo (sin estructura espacial, aproximación
  declarada en `:705-714`).
- Q5 **sí**: `cielo.veloSB` entra por `sumaSB` en `ctxFotometrico:323` y en
  `magLimite:735`; `vistaGaia:2622-2625` rehace `mlim` con el velo.
- `Φ` sesgada hacia lo brillante: la banda es `(corte, mag]`, donde `corte` es
  el truncado por el `TOP 40000` (M11 a 100×: G=17,09; M7 a 100×: G=16,30). Su
  ⟨I⟩ subestima la media de la población completa.

### 2.4 Halo globular — `pintarCumulo()`, `:2160`; `tablaCumulo()`, `:2059`

```
bitacora-gaia-render.js:2089   Im[i] = s * pob.S1campo(m, rAs, radioImagenAs);
bitacora-gaia-render.js:2090   sg[i] = Math.sqrt(s * pob.S2campo(m, rAs, radioImagenAs) / omegaBeam);
bitacora-gaia-render.js:2091   sHalo[i] = visibilidadDifusa(Im[i], cHalo.Fcielo * cHalo.Cmin, perceptual);
```

`S1campo`/`S2campo` (`bitacora-cumulos.js:251-252`, función `momentosCampo:270`):

```
S1campo = Σ num_i · f_i  · q_i
S2campo = Σ num_i · f_i² · q_i
```

- Q1/Q2/Q3 **sí**: `S1` y `S2` usan la **misma** Φ (mismos `num`, `f`, `mAp` de
  la LF King/Harris) y el mismo `q_i = 1 − w_i·a(m,r)` (ADR 0012). Es el único
  canal con ambos momentos y Φ única.
- σ² **apagada**: `sGrano` sale de `TEXTURA.ACTIVO` (`:1956`, `false`) →
  `visibilidadGrano(sg·atenGrano, …)` (`:2113-2121`), que en la práctica da 0 en
  los 513 anillos (medido en `luz-sub-mlim-tres-canales.md` §4 ter). Es una
  decisión perceptual (ADR 0015), **no** una carencia de cálculo — distinto de la
  niebla (sin σ²) y del velo (con dato, ignorado).
- Q5 **parcial**: no toca `cieloEfectivo` global; solo el `m_lim,sky` local vía
  el punto fijo de `:2079-2088` (`magLimite` contra `cHalo.Fcielo + s·S1campo`).
- Guarda de no doble conteo: `if (!cum)` en `vistaGaia:2660` — con cúmulo, la
  niebla no se ejecuta, y `estrellasCumulo` descarta `m > mRes` (`:2372`).

**Conclusión de Fase A**: la tabla de §2 queda confirmada salvo una celda —la
Q2 del velo— que se **refuta** por exceso (el dato de σ² existe y se ignora). El
mapa del documento fuente refleja el código actual; el hallazgo es un matiz de
tercera categoría, no una corrección de línea.

---

## 3. Brechas cuantificadas (Fase B)

Arnés: `scripts/harness_auditoria_canales.js` (457 mm/18″, sqm 21,5, T 0,8,
ocular 68°; región = disco del objeto recortado al campo). `N_eff(disco) =
(Σf)²/Σf²`; `N_eff(beam) = N_eff(disco) · Ω_beam/Ω_disco` con `Ω_beam` el
círculo de diámetro `θ_R(SBe)/M`.

### 3.1 Momentos y N_eff por objeto

| Objeto | Aum | `mlim` | μ_glow | μ_niebla | μ_velo | N_beam (sub-mlim) | Régimen |
|---|---|---|---|---|---|---|---|
| M45 | 100× | 15,78 | 26,56 | 28,01 | — | **0,32** | SBF puro, ⟨I⟩ invisible |
| M45 | 229× | 16,49 | 26,94 | 28,67 | — | 0,15 | SBF puro, ⟨I⟩ invisible |
| M11 | 100× | 15,61 | 22,36 | — | 22,44 | 19,6 | liso |
| M11 | 229× | 16,49 | 22,34 | 23,57 | — | 12,5 | liso |
| NGC 7789 | 100× | 15,78 | 23,58 | 25,34 | — | 4,2 | liso |
| NGC 7789 | 229× | 16,49 | 24,09 | 26,15 | — | 1,8 | liso |
| NGC 2266 | 100× | 15,78 | 23,89 | 25,94 | — | 2,7 | liso |
| NGC 2266 | 229× | 16,49 | 24,71 | 26,98 | — | **0,98** | transición, ⟨I⟩ invisible |
| M7 | 100× | 15,36 | 22,43 | — | 21,25 | 31,5 | liso |
| M7 | 229× | 16,49 | 21,93 | 22,76 | — | 19,7 | liso |
| M24 | 100× | 15,78 | 22,60 | 23,81 | — | 13,7 | liso |
| M24 | 229× | 16,49 | 22,93 | 24,67 | — | 5,7 | liso |

Lectura: los únicos objetos en régimen SBF o de transición (`N_beam ≲ 1`) son
los de ⟨I⟩ más tenue (M45, NGC 2266) — justo donde la capa cae por debajo del
umbral de detección. Los campos ricos (M11, M7, M24) están siempre lisos
(`N_beam ≫ 1`). **Añadir σ² a la niebla/glow no revelaría grano en ningún objeto
del banco.** Confirma ADR 0015 y ADR 0022 («se pinta la mancha, no el grano»).

### 3.2 Flujo depositado vs esperado (unidades de estrella G=0, sobre el disco)

| Objeto | Aum | glow Σf | niebla Σf | velo Σf | Σf sub-mlim | ¿contado en `cieloEfectivo`? |
|---|---|---|---|---|---|---|
| M11 | 100× | 6,29e-4 | 0 | 5,88e-4 | 1,22e-3 | solo velo |
| M11 | 229× | 6,44e-4 | 2,07e-4 | 0 | 8,51e-4 | ninguno |
| M7 | 100× | 5,01e-3 | 0 | 1,50e-2 | 2,00e-2 | solo velo |
| M7 | 229× | 1,52e-3 | 7,03e-4 | 0 | 2,22e-3 | ninguno |
| M24 | 100× | 4,29e-3 | 1,41e-3 | 0 | 5,70e-3 | ninguno |

El glow es dominante en flujo donde no hay velo (79-89 % del sub-mlim en M45 y
NGC 2266, §4 bis del documento fuente) y **no** se contabiliza en ningún
presupuesto: la luz que más pesa es la que menos audita el render.

### 3.3 Δmlim de H2 (escalar de disco, realimentar a `cieloEfectivo`)

| Objeto | Aum | Δm glow | Δm niebla | Δm glow+niebla |
|---|---|---|---|---|
| M11 | 100× | −0,14 | 0,00 | −0,14 |
| M11 | 229× | −0,15 | −0,05 | −0,18 |
| NGC 7789 | 100× | −0,07 | −0,01 | −0,08 |
| M7 | 100× | −0,09 | 0,00 | −0,09 |
| M7 | 229× | −0,20 | −0,10 | **−0,27** |
| M24 | 100× | −0,15 | −0,05 | −0,20 |

Comparación con la literatura del repo: el #186 midió −0,23 (escalar) / −0,25
(techo espacial) para la **niebla nuclear**; §5.6 de
`niebla-campo-pupila-y-aumentos.md` da −0,07 a −0,32 para M11 nuclear. Mi
escalar de **disco** con glow+niebla da −0,01 a −0,27. Mismo orden y signo; las
diferencias son la región (disco vs núcleo) y la inclusión del glow. H2 es de
segundo orden en todos los casos.

### 3.4 Efecto del parche sobre N_eff

`N_eff = (Σf)²/Σf²` es **invariante** a un escalar global: el parche ×1,5 no
cambia N_eff (ni el régimen liso/grumoso) — solo escala ⟨I⟩ y σ² por igual. Su
efecto real es de **umbral** (0,44 mag), no de régimen.

### 3.5 JSON (formato §5.3 de la especificación)

`scripts/fixtures/gaia/auditoria_canales_faseB.json` (12 filas, una por
objeto/aumento). Estructura por fila:

```json
{
  "objeto": "M11",
  "equipo": "100×",
  "mlim": 15.61,
  "dmlimGlow": -0.14, "dmlimNiebla": 0.0, "dmlimAmbos": -0.14,
  "glow":  {"flujo": 6.286e-4, "mu": 22.36, "sigma2": 6.82e-22, "N_eff": 1886},
  "niebla":{"flujo": 0.0,     "mu": Infinity, "sigma2": 0.0,      "N_eff": 0},
  "velo":  {"flujo": 5.880e-4, "mu": 22.44, "sigma2": 1.07e-22, "N_eff": 10542},
  "total": {"flujo": 1.22e-3, "mu": 21.65, "N_eff": 6109},
  "neffBeam": 19.6
}
```

(`halo` es `null` en todo el banco: ningún globular, por construcción — la
niebla no se ejecuta en globulares, §2 del documento fuente.)

---

## 4. Escenarios (Fase C)

### U1 — Unificar Φ

Recalcular glow/niebla/velo con una sola Φ. Para campos ordinarios la Φ natural
es la del catálogo observado (la que ya usan glow y niebla); para globulares, la
King/Harris (donde el catálogo es incompleto por aglomeración). Unificar hoy
significaría **una** de dos cosas: (a) usar la LF analítica también en campos
abiertos — mala idea, el catálogo es la observación y ya está; (b) que el velo
deje de ser una banda truncada agregada por el TAP y pase a repartirse sobre la
misma Φ del catálogo — es decir, bajar el `TOP 40000` no debería cambiar la ley.
El reparto de flujo actual (§3.2) muestra que el velo y la niebla son **el mismo
flujo con dos leyes** según toque o no el techo de filas (M11/M7 a 100× van por
velo, a 229× por niebla). Unificar Φ es, sobre todo, eliminar esa bifurcación
por umbral computacional.

### U2 — Añadir σ²

`N_beam` (§3.1) no cruza 1 hacia arriba en ningún objeto con ⟨I⟩ visible: los
campos ricos están lisos y los que tocan N_eff ≈ 1 (M45, NGC 2266) tienen ⟨I⟩
invisible. **Añadir σ² no cambia ningún veredicto de visibilidad.** Su valor es
de coherencia interna (que los cuatro canales calculen los dos momentos con la
misma Φ), no de resultado visual. Es el escenario de menor impacto observable.

### U3 — Realimentar (H2)

Simulado en §3.3: Δmlim −0,01 a −0,27 mag (escalar de disco, glow+niebla). El
punto fijo es necesario (más niebla → peor mlim → más niebla), no una suma
directa; la vía barata ya la apunta el documento fuente: un `cielo.veloSB` más
en `vistaGaia` con punto fijo. Cambia ~2 veredictos de anillo sobre 168 (#186):
es coherencia, no espectáculo.

### U4 — Quitar el parche (`NIEBLA_GANANCIA_ESTETICA = 1`)

Baja el flujo pintado ×1/1,5 = 0,667 → `2,5·log10(1,5) = 0,44` mag de subida
del umbral efectivo. Sobre el **disco medio**, la razón C/Cmin ya no llega a 1
en ninguna fila (máximo 0,35 en M7/229× → 0,23 sin parche): ningún objeto pasa
de «niebla media visible» a «invisible» por el disco, porque ninguno era visible
en esa métrica. El efecto real es **local** (los listones del ADR 0023, sobre el
exceso local): el documento fuente ya anota que el parche se come 0,44 mag del
margen fino de 1,29 mag frente a estrellas aisladas, y que `GAMMA_PERCEPTUAL` es
el sospechoso señalado por el propio ADR 0022 como sustituto correcto del parche.

---

## 5. Recomendación priorizada (Fase D)

| # | Qué | Coste | Beneficio | Riesgo |
|---|---|---|---|---|
| 1 | **Realimentar la niebla (H2)** — cerrar la asimetría velo/niebla | bajo (un `sumaSB` + punto fijo) | alto: coherencia global de Q5 | requiere prerregistro |
| 2 | **Unificar Φ** — una sola Φ por régimen (catálogo en abiertos, LF en globulares) | medio | alto: mata la bifurcación velo↔niebla por techo de filas | tocar `radioConsulta`/TOP |
| 3 | **Calcular σ² en los tres canales que no la tienen** (incl. leer `m2` en `veloSB`) | bajo-medio | bajo (medido: sin cambio visual) — coherencia Q2/Q3 | ninguno si se mantiene `sGrano=0` |
| 4 | **Quitar el parche** y mover su trabajo a `GAMMA_PERCEPTUAL` | bajo | medio: devuelve Q4 a una ley única | regresión visual en M11/NGC 7789 |

Orden recomendado: **1 → 2 → 4 → 3**. El H2 primero porque es el de mejor
coste/beneficio y porque la asimetría (el velo sí realimenta, la niebla no) es
la raíz del artefacto velo↔niebla de §4 bis. La σ² última porque está medido
que no cambia nada visible; se hace por identidad, no por efecto.

Respuesta explícita a la pregunta de cierre: **son una ley (SBF, dos momentos)
con cuatro implementaciones**, tres de ellas incoherentes entre sí o por dentro
(glow: sin momentos ni presupuesto; niebla: sin σ², ley rota por parche, sin
presupuesto; velo: σ² disponible e ignorada). El halo es la implementación de
referencia.

---

## 6. Tests propuestos

1. **Conservación de flujo por canal (ADR 0003)**: `Σ(glow + niebla + velo +
   halo) == Σf` del catálogo, por objeto/aumento. Hoy no existe un test que
   compare los cuatro a la vez; `harness_canales_g.js` mide el reparto pero no
   asevera el cierre contra la Φ.
2. **`veloSB` lee `m2`**: si se añade σ² al velo, un test que afirme que
   `veloSB`/`veloVar` consume `fondo.m2` y devuelve `Σf²` escalado (guardián
   contra volver a ignorarlo).
3. **`nieblaCampo` acumula Σf²**: test de que la pasada suma `f*f` junto a `f`
   (si se adopta U2), distinguiéndolo del `mr2` espacial ya existente.
4. **`N_eff` por beam no cruza el umbral de grano en el banco**: test de
   regresión que fija que ningún objeto del banco pase `N_beam > ~10` con
   `⟨I⟩` sobre el cielo (guardián contra reabrir #329).
5. **Parche neutro**: `test_niebla_abiertos.js` ya cubre conservación y efecto
   del parche; añadir una aserción de que `NIEBLA_GANANCIA_ESTETICA = 1` hace
   exacta la conservación del ADR 0003 (Q4 limpio).
6. **No doble conteo halo+niebla**: test de que la guarda `if (!cum)` se cumple
   y de que `estrellasCumulo` descarta `m > mRes` (`:2372`) — el glow queda
   vacío por construcción dentro del cúmulo.

---

## 7. Preguntas abiertas (resueltas y pendientes)

**Resueltas por esta auditoría:**

1. **TAP `fondo`**: devuelve `Σf` **y** `Σf²` (`m2`). El velo ignora la segunda.
   *(REFUTADO respecto a la hipótesis «solo Σf».)*
2. **Sprites glow**: sí, `'lighter'` (`:2455`); no, no se acumulan en ningún
   contador. Q5 negativo por omisión.
3. **`thetaJuicioNiebla`**: sí depende de `R50` del propio flujo (`mr2`, `:1058`,
   `:1077`); cambia con el núcleo de suavizado solo indirectamente (a través del
   `max(θ_R/M, R50)`), no directamente.
4. **`NIEBLA_GANANCIA_ESTETICA`**: solo en `nieblaCampo` (`gananciaNiebla()`,
   `:1059`). No se usa en ningún otro sitio.
5. **`TEXTURA.ACTIVO`**: controla **solo** `sGrano` del halo (`:2113`). No toca
   la niebla.
6. **`difusoMask`**: la niebla no la tiene porque su θ viaja como 5º argumento
   (`:2659-2670`, `:607-613`). Tendría máscara si pasara a marcar su desvanecido
   como hacen el halo y PS1.

**Pendientes (no resueltas aquí):**

7. **Galaxias PS1 y el umbral de la niebla**: `ps1CapaGalaxias` marca su propia
   `difusoMask` (`bitacora-ps1.js:1448`) y mide con `ps1Opacidad` contra el
   cielo efectivo, con su propia θ (`ps1ThetaIntArcmin`); no compite con la θ de
   la niebla. Queda por decidir si comparte *presupuesto* de cielo con ella (la
   capa de galaxias no se trató en el documento fuente y no es uno de los cuatro
   canales).
8. **Realimentación espacial (techo) vs escalar**: esta auditoría solo simuló el
   escalar de disco. El techo espacial del #186 (−0,25) no se re-midió aquí.
9. **Punto fijo de H2**: no se cerró el lazo niebla→mlim→niebla; solo se midió
   el Δ directo. La iteración puede ampliar el efecto unos centésimos.

---

## Referencias

- Tonry & Schneider (1988), AJ 96, 807 — ley SBF.
- ADR 0003 (conservación como test), ADR 0004 (sin parámetros estéticos),
  ADR 0008 (el arnés importa la ley), ADR 0012 (crowding por estrella),
  ADR 0014 (adquisición Gaia por densidad → velo), ADR 0015 (umbral de textura),
  ADR 0022 (niebla sub-mlim), ADR 0023 (H2c a escala de Riccò) —
  `simulador_ocular/docs/adr/`.
- `simulador_ocular/docs/notas/luz-sub-mlim-tres-canales.md` (documento fuente).
- `simulador_ocular/docs/notas/niebla-campo-pupila-y-aumentos.md` §5.6 (H2).
- Issue #186 (H2), Issue #329 (grano M13, abierto).
