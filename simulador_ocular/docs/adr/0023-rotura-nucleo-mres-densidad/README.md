# ADR 0023 · Iteración (b) sobre el render — respuesta de m_res a la densidad

Abre la vía autorizada por ADR 0022 §4 (`Φ″ falsea → SOLO ENTONCES se abre la
iteración (b) sobre el render, con UNA variable`). Grilling del 2026-08-30
(#113) fija el alcance; la formulación técnica queda pendiente — la propone
el observador, no se redacta aquí (misma disciplina que ADR 0016-0018:
"formulación propuesta por el observador").

## Alcance acordado (grilling)

- **Variable**: forma de m_res — su respuesta a la densidad local, dentro
  del punto fijo velo↔m_lim,sky (`bitacora-gaia-render.js:tablaCumulo`,
  `bitacora-cumulos.js:momentosCampo/S1campo/S2campo`). NO la partición Δ
  (`dmagCrowd`).
- **Fuera de alcance**: M2 y M15 — no monotónicos en el held-out de ADR 0022,
  atribuidos por el propio observador a foco/seeing, no al objeto.
- **Set de calibración**: los 17 cúmulos globulares menos M2 y M15 → 15 casos
  (incluye M22/M30/M55/M62 del banco 18″ ya consumidos en ADR 0016-0018, más
  los 11 held-out restantes de ADR 0022).
- **U″**: se recalibra — se relee en el mismo ancla (M13, 200 mm, SQM 21,
  120×, anillo nuclear) con el m_res nuevo. No se congela el valor de
  ADR 0022 (1.977118e-1): describe el m_res viejo.
- **Candado**: al tocar código de producción (no solo el arnés), el cambio
  va acompañado de test de regresión en el MISMO commit.
- **Precondición de validez**: sustituye la comprobación "el render no
  cambió" de ADR 0016-0018 (aquí cambia a propósito) por la batería de
  invariantes existente verde tras el cambio: `test_conservacion_sorteo.js`,
  `test_cumulo_render.js`, `test_halo_v7_e1/e2/e4/e5.js`.

## Pendiente

Formulación cerrada de la hipótesis (qué en la respuesta de m_res a la
densidad está mal, y por qué) — sin ella no hay prerregistro que escribir.
Siguiente paso: sesión dedicada con el observador para fijarla ANTES de
tocar el arnés o el render.
