# 30. El 27 de ADR-0010 eran dos cantidades físicas y una guarda

- Estado: aceptada
- Fecha: 2026-09-22
- Enmienda a: [ADR-0010](0010-suelo-27-deteccion-ojo.md)
- Relacionada: `simulador_ocular/docs/referencias/crumey-2014-umbral-de-contraste.md` §3.2b, P2
- Épica: #337 (US #338). La decisión de valor es de #342.

## Contexto

ADR-0010 puso el mismo número, 27 mag/arcsec², en dos sitios de
`resources/js/bitacora-gaia-render.js` y les dio un solo nombre: «el suelo de
detección del ojo humano». Esos dos sitios son el techo de `SB0T` dentro de
`magLimite` y la constante `FOT.SB_SUELO_PINTADO`. Crumey (2014, MNRAS 442,
2600) da 25,08 mag/arcsec² para algo que suena igual y no lo es. Este ADR
separa las cantidades y dice qué sitio usa cada una. No cambia ningún valor.

## Las dos cantidades físicas

### Q1 · Suelo de detección del ojo

- **Pregunta que responde:** ¿qué brillo de fondo corresponde al umbral
  absoluto del ojo adaptado a la oscuridad? Es decir, ¿cuál es el cielo más
  oscuro que el ojo todavía registra como distinto del negro?
- **Valor y unidades:** 27 mag/arcsec².
- **Fuente primaria:** J. R. Torres Lapasió, «On the Prediction of Visibility
  for Deep-Sky Objects», *SKYCAD Pléiades* 1 (2000), p. 2, comentario a la
  Ec. 2 (relación LM ↔ SB0): «The upper limit (8.5 LM) corresponds to a
  27 mag×arcsec² background surface brightness: the eye detection threshold».
  Es el extremo del dominio de su Ec. 2, que convierte la magnitud límite a ojo
  desnudo (LM) en brillo de cielo. No es una medida directa del fondo.

### Q2 · Fondo efectivamente nulo

- **Pregunta que responde:** ¿por debajo de qué fondo el umbral de detección
  deja de depender del fondo, de modo que oscurecer más el cielo ya no mejora
  lo que se ve?
- **Valor y unidades:** B ≲ 10⁻⁵ cd/m², que equivale a 25,08 mag/arcsec².
- **Fuente primaria:** Crumey 2014, §2.1 y Fig. 3, sobre los datos de
  Blackwell (1946), corroborados por Crawford (1937). Por debajo de ese fondo
  el umbral toma una forma sin dependencia de B (Ecs. 50–52). Sobre ese mismo
  punto construye el corte telescópico: pupila de salida de corte y magnitud
  de corte `mcut` (Ecs. 70–73).

### Por qué el repo las confundía

Torres Lapasió identifica Q2 con Q1 por afirmación, no por medida (p. 4):
«Since maximal TLM happens when the sky background presents a 27 mag×arcsec²
surface brightness, one can derive […] Equation 7». Es decir, supone que donde
el ojo deja de distinguir el fondo del negro, oscurecer más deja de pagar.
Crumey mide Q2 directamente sobre los datos de umbral y sale 1,92 mag antes.

Las dos afirmaciones pueden coincidir, pero nada obliga a que coincidan. Por
eso decidir el valor de Q2 (#342) no exige tocar Q1.

Nota aritmética: la Ec. 6 evaluada en SB0T = 27 da TLM = 4,076 +
2,5·log10(D²t). La Ec. 7 del mismo autor dice 4,12. Son 0,04 mag de redondeo
del autor, no un error del repo.

## Decisión

**1. El techo de `SB0T` en `magLimite` implementa Q2 con el valor de Q1.**
La pregunta que responde el clamp es la de Q2: pasado ese fondo, un cielo más
oscuro no sube la magnitud límite. El valor 27 viene de Q1, a través de la
identificación de Torres Lapasió. En el código, esta cantidad se llama
**corte de fondo cero de `magLimite`**. Si #342 lo baja a 25,08, lo que cambia
es el valor de Q2. Q1 y su fuente quedan intactos.

**2. `FOT.SB_SUELO_PINTADO` no es ninguna de las dos: es una guarda.**
`valorDeFlujo(F, Fcielo, rango)` divide por `Fcielo`. Con un cielo irreal ese
divisor tiende a cero y el píxel pintado se dispara a blanco. La constante solo
evita eso; no tiene fuente física propia. En el código se llama **guarda de
saturación del pintado**.

**3. La guarda comparte valor con el corte de fondo cero, y es una regla
manual.** El argumento de ADR-0010 sigue en pie: la UI enseña juntos «fondo en
ocular» y «magnitud límite». Si el pintado se saturase en un fondo distinto del
que aplana `magLimite`, los dos números volverían a contar historias distintas
en la franja entre ambos valores. Por eso las dos cifras deben ir juntas.

Pero hoy son **dos literales independientes**: el `27` del clamp en
`magLimite` y `SB_SUELO_PINTADO: 27` en `FOT`. Nada en el código obliga a que
se muevan juntos. Quien cambie uno tiene que cambiar el otro a mano, y #342
debe hacerlo explícitamente. Derivar los dos de una sola constante sería un
cambio de código ejecutable, que queda fuera de #338. Se deja propuesto para
#342.

## Consumidores del valor 27 (búsqueda exhaustiva)

La búsqueda cubre `resources/`, `simulador_ocular/`, `mapa/`, `registro/` y
`scripts/`, en `.js`, `.php`, `.py`, `.html` y `.md`. Se filtró por el literal
`27` en contexto de fondo, cielo, suelo, techo, `SB0T`, `Fcielo` o
mag/arcsec². Además se buscaron los identificadores `SB_SUELO_PINTADO` y
`FcieloPintado`. Las apariciones de 27 en catálogos (coordenadas,
magnitudes, ángulos de posición) y en porcentajes o tamaños angulares no
tienen relación con el fondo y no se listan.

### Código de producción

| Sitio | Clasificación |
|---|---|
| `bitacora-gaia-render.js`, `fondoMagLimite` (el `SB0T` de `magLimite`): `SB0T = Math.min(27, Math.max(sqm, SB0T))` | **Q2**, corte de fondo cero, con valor de Q1 |
| `bitacora-gaia-render.js`, `FOT.SB_SUELO_PINTADO: 27`, consumido en `ctxFotometrico` para construir `FcieloPintado` y leído en `pintarFot` a través de `valorDeFlujo` | **Guarda** de saturación del pintado, sin física propia |

### Documentación en comentarios de código

| Sitio | Clasificación |
|---|---|
| `simulador_ocular/resources/js/bitacora-ocular.js`, bloque sobre `magLimite` (Ecs. 5–7 de Torres Lapasió) | Describe el corte de fondo cero (Q2 con valor de Q1) |

### Tests y harnesses

| Sitio | Clasificación |
|---|---|
| `scripts/test_difuso.js` §9 (`Math.min(27, …)` en la cuenta de referencia), §9b (techo en `magLimite`) | Verifican el **corte de fondo cero** |
| `scripts/test_difuso.js` §9c (`nivelPintado(…, 27)`, `ctxSuelo(…, 27)`) | Verifican la **guarda** del pintado |
| `scripts/test_alfa_magblanco.js`, `scripts/harness_alfa_estrellas.js` | Leen `FcieloPintado` y por tanto heredan la **guarda**. No tienen literal 27 propio. |
| `scripts/harness_ricco_seeing.js`, `for (const f of [25, 27])` | **Ninguna.** Son puntos de muestra de una extrapolación informativa del ajuste de Riccò fuera de su rango (`FONDOS = [13 … 23]`, en pasos de 2). No leen ninguna de las cantidades. |
| `simulador_ocular/docs/experimentos/ricco/harness_ricco.js`, `filaFondo`: `Math.min(27, mag)` | **Tercera cosa:** tope del índice de la tabla `LTC` al rango tabulado. Límite de dominio de datos, no del render. |

### Documentación

| Sitio | Clasificación |
|---|---|
| `simulador_ocular/docs/adr/0010-suelo-27-deteccion-ojo.md` | Origen de la confusión. Enmendado por este ADR. |
| `simulador_ocular/README.md`, «Magnitud límite», `acotado a [SQM, 27]` | Corte de fondo cero |
| `simulador_ocular/docs/notas/pupila-salida-fondo-cielo.md` §3, `acotado a [SQM, 27]` | Corte de fondo cero |
| `simulador_ocular/docs/experimentos/maglimite_vs_schaefer.md`, «topa con el suelo de 27» | Corte de fondo cero. Lo llama «suelo»: nombre heredado de ADR-0010. |
| `simulador_ocular/docs/referencias/crumey-2014-umbral-de-contraste.md` §2.3 («`:205` es el mismo suelo»), §3.2b y P2 | Cita los dos sitios **por número de línea** anterior a #338. Su diagnóstico (dos cantidades usadas como una) es el que resuelve este ADR. |

No se encontró ningún consumidor en `mapa/`, `registro/` ni en el plugin PHP.

## Consecuencias

- Los comentarios de `magLimite` y de `FOT.SB_SUELO_PINTADO` nombran cada uno
  su cantidad y citan al otro por nombre, no por número de línea.
- El comentario de `bitacora-ocular.js` distingue Q1, Q2 y la identificación
  de Torres Lapasió.
- ADR-0010 lleva una nota que remite aquí.
- #342 decide el valor de Q2 y, por la regla manual de la Decisión 3, arrastra
  la guarda. También puede proponer que las dos lean una sola constante.
- Sin cambios numéricos ni de código ejecutable.

## Verificación

- `git diff main` no toca ninguna línea ejecutable.
- `node scripts/test_difuso.js` pasa sin regresiones nuevas.

## Enmienda de #342 (2026-09-26): el valor de Q2 es 25,08

- **Decisión.** El corte de fondo cero de `magLimite` deja de ser el techo de
  27 de la Ec. 5. Ahora lo fija la Ec. 70 de Crumey,
  `d0 = p·√(10⁻⁵·F_t / B)`, con `FOT.SB_FONDO_NULO = 25.08`. Con d < d0,
  el fondo de `magLimite` se congela en el que hay en d0.
- **La guarda del pintado.** `FOT.SB_SUELO_PINTADO` baja a 25,08 con el
  corte, por la regla de la Decisión 3. Siguen siendo dos claves separadas. La
  ley histórica vuelve con `SB_FONDO_NULO = null` y `SB_SUELO_PINTADO = 27`.
- **Q1 no cambia.** El 27 de Torres Lapasió sigue en `fondoMagLimite` como
  techo. Con el corte activo solo actúa con cielos de sqm > 27.
- **Medida.** El prerregistro `simulador_ocular/docs/experimentos/prerregistro_corte_crumey.md`
  dio ADELANTE: L1–L5 PASAN (`medida_corte_crumey.md`, commit `ed19ff7`).
  H2c no se toca: Cmin, SBe y los 12 márgenes de campo quedan idénticos
  (ADR 0001).
- **Consecuencia aceptada.** Las estrellas dejan de mejorar por debajo de
  25,08 en el ojo y los extensos no. La asimetría entre `magLimite` y `Cmin`
  es la que el prerregistro dejó escrita.
