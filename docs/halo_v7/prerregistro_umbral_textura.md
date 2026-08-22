# Prerregistro de listones — ley de umbral de textura (ADR 0015)

Fecha: 2026-08-21.

Comprometido ANTES de escribir la ley de umbral de textura del grano SBF de
globulares. Ningún listón de este documento se retoca tras leer la salida de
la ley: si un listón falla, la ley se declara falsada en ese punto y se aplica
la vía de escape única (§5) o se descarta con medida, nunca se ajusta el
listón a posteriori.

Fuente: `docs/adr/0015-umbral-de-textura-para-el-grano-sbf.md`,
`docs/halo_v7/velo_granularidad.md`, `docs/halo_v7/escala_grano.md`,
`docs/halo_v7/bibliografia_textura_deteccion.md`.

## 1. Ancla de K

**M13, apertura 200 mm, SQM 21, aumento 120×: primera rotura del núcleo**
(observación propia, registro del usuario). Es el único dato que se usa para
ajustar el parámetro libre K de `P(ver) = 1 − exp(−(d′/K)^β)`, con β ≈ 3,5
fijo (Quick 1974). Ningún otro caso de este documento se usa para tocar K:
todos los demás son predicción o contraste.

Comprobación ejecutable: con K ajustado a este punto, `P(ver)` evaluada en el
anillo nuclear (r/r_h 0,00–0,25) de M13/200 mm a 120× debe caer en la banda de
transición — ni ≈0 ni ≈1 — por construcción (es el punto de ajuste, no una
predicción; sirve para detectar un ajuste degenerado si K sale en un extremo
del rango físico).

## 2. Predicciones que pasan o falsean (no se retocan después)

Todas sobre M13, 200 mm, tabla radial ya existente
(`docs/halo_v7/velo_granularidad.md`), anillo nuclear r/r_h 0,00–0,25 salvo
donde se indique.

| # | Comprobación | Umbral |
|---|---|---|
| P1 | 61×, todo el perfil radial (los 4 anillos de la tabla) | `P(ver) < 0,05` en cada anillo |
| P2 | Progresión monótona del anillo nuclear con el aumento | `P(ver)@120× < P(ver)@173× < P(ver)@250×` |
| P3 | Halo (r/r_h 1,00–2,00, N_ef ≈ 0,07), a 250× (el aumento más favorable del barrido) | `P(ver) < 0,10` |

P1 falsea si cualquier anillo a 61× supera 0,05. P2 falsea si la secuencia no
es estrictamente creciente en los tres aumentos. P3 falsea si el halo supera
0,10 al aumento donde más fácil lo tiene la ley.

## 3. Casos del banco del 18″

Extraídos de la bitácora propia (`resources/plugins/bitacora-registro/datos/observaciones-seed.json`), instrumento `Stargate 18”`. Veredicto sobre el **núcleo** de cada cúmulo (es la región donde N_ef es más alta y donde la ley debe romper antes). Conversión: `P(ver) < 0,3` → nebuloso; `0,3–0,7` → moteado; `> 0,7` → resuelto/rompe.

| Cúmulo | Aumento | Veredicto observado (núcleo) | Cita | Umbral P(ver) esperado |
|---|---|---|---|---|
| M55 | 70× | moteado (halo ya resuelto, núcleo aún no) | «se resuelven todas las estrellas, más complicado en el núcleo» | `0,3 ≤ P(ver) < 0,7` |
| M55 | 480× | resuelto | «veo el núcleo perfectamente... con muchísimo detalle» | `P(ver) > 0,7` |
| M22 | 98× | resuelto | «las estrellas además se resuelven perfectamente» | `P(ver) > 0,7` |
| M30 | 98× | moteado (núcleo visible pero solo «se resuelven varias estrellas en su interior», sin llegar a resuelto pleno) | «se resuelven varias estrellas en su interior» | `0,3 ≤ P(ver) < 0,7` |
| **M62** | 70×–270× | **NO rompe: el núcleo se describe como dividido/estructurado (dos zonas, luego «forma de cangrejo») pero nunca como resuelto en estrellas individuales, a ningún aumento observado** | «ahora veo el núcleo dividido en dos partes» (98×); «el cuerpo... no sería uniforme» (270×), sin mención de resolución estelar del núcleo en ninguna entrada | `P(ver) < 0,3` en todos los aumentos listados |

M62 es el caso que la ley tiene que saber decir que no: si `P(ver)` supera 0,3
en el núcleo de M62 a cualquiera de estos aumentos, el listón falsea la ley
tanto como si M55/M22/M30 no rompieran.

## 4. Contraste de literatura amateur

**No revisada por pares.** Se usa solo como contraste cualitativo de la
dirección de la transición (nebuloso→moteado→resuelto con el aumento), nunca
para ajustar K ni β. Reportes de observadores visuales de cúmulos globulares
con aperturas comparables (8″–20″) coinciden en la misma dirección
cualitativa que las entradas de la bitácora propia (§3): a igual apertura, el
núcleo se resuelve progresivamente al subir el aumento, y los cúmulos más
concentrados (clase de concentración de Shapley-Sawyer alta, p. ej. M62,
clase IV) tardan más en romper que los más laxos (M55, clase XI) — la misma
asimetría que produce el listón M62-no-rompe/M55-sí-rompe de §3. No añade
ningún caso nuevo de aceptación: es contraste de dirección, no dato de
calibración.

## 5. Vía de escape única

Si los picos del grano (hasta +800 % del fondo, ver
`docs/halo_v7/velo_granularidad.md`) dominan sobre la energía filtrada y eso
explica un fallo de listón, la ÚNICA corrección permitida es cambiar el
estadístico de entrada a d′ de **suma Minkowski** sobre la distribución de
δI, en vez de la energía filtrada estándar.

**Prohibido:** añadir términos nuevos al modelo, retocar β (fijo en 3,5 por
Quick 1974), introducir un segundo parámetro libre, o ajustar cualquier
listón de §2/§3 después de ver el resultado. Si el escape de Minkowski
tampoco pasa los listones, la ley se descarta con medida y se documenta,
igual que el precedente de los dos ejes de Gaia (ADR 0012).

## 6. Alcance

Solo cúmulos globulares. Esta calibración y sus listones no dicen nada sobre
el grano SBF de galaxias (ya tiene veredicto propio: invisible por ley,
`docs/halo_v7/informe_bugfix_v8_grano_sbf.md`) ni sobre abiertos.

## Estado

Ni una línea de código de la ley de umbral escrita antes de este commit.
Documento cerrado: ancla, predicciones, banco del 18″ (con caso que no
rompe), contraste de literatura y vía de escape, todos prerregistrados.
Siguiente paso: ticket #96 (generador sin malla).
