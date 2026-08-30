# Prerregistro de listones — métrica Φ′ (densidad) de rotura del núcleo (ADR 0017)

Fecha: 2026-08-24. Formulación propuesta por el observador tras el veredicto
negativo del ADR 0016, ANTES de escribir una línea de código del arnés de Φ′.
Ningún listón se retoca tras leer la salida. Misma disciplina que
`simulador_ocular/docs/adr/0016-rotura-nucleo/prerregistro.md`.

Fuente: `simulador_ocular/docs/adr/0017-phi-prima-normaliza-nres-por-area-del-anillo.md`,
`simulador_ocular/docs/adr/0016-rotura-nucleo/veredicto.md`.

## 1. Formulación (cerrada; sin retoques tras ver la salida)

- `Φ′(r) = f_res(r) · (N_res(r) / A(r) · A_ref)^(1/4)`.
- `A(r)` = área del anillo en radio PROPIO: `π·(r1² − r0²)` en arcsec², con
  r0, r1 los bordes de la franja en arcsec (bordes r/r_h × r_h del cúmulo).
- `A_ref` = área del anillo del ancla (M13, r/r_h [0, 0,25)): constante,
  inerte en todas las comparaciones (por eso Φ′ = Φ en el ancla por
  construcción y U′ se lee en la misma escala que U).
- `N_res`, `f_res`, Δ = 0,75, exponente 1/4, franjas r/r_h
  [0 · 0,25 · 0,50 · 1,00 · 2,00], lectura de producción (ADR 0008, inversión
  de `aCrowd`), M solo por `m_lim,sky`, σ/RMS del campo SBF prohibido: TODO
  idéntico al prerregistro del ADR 0016, sin excepciones.
- **Un único parámetro libre: U′**, leído (no elegido) en el mismo ancla:
  M13, 200 mm, SQM 21, 120×, anillo r/r_h [0, 0,25) — el mismo anillo de P2.

## 2. Listones

Los MISMOS del prerregistro del ADR 0016, con Φ′ y U′ en lugar de Φ y U:

| # | Comprobación | Umbral |
|---|---|---|
| P1 | M13 61×, los 4 anillos | `Φ′ < U′` en todos |
| P2 | anillo nuclear (el del ancla) | `Φ′@120× < Φ′@173× < Φ′@250×` estricto |
| P3 | halo (r/r_h 1,00–2,00) a 250× | `Φ′ < U′` |

Banco del 18″ (D = 457 mm, SQM 21, núcleo r/r_h [0, 0,25)): M55 70×,
M55 480×, M22 98×, M30 98× → `Φ′ ≥ U′`; M62 → `Φ′ < U′` en 70×, 98× y 270×.

Ordinales: `Φ′(M55 480×) > Φ′(M55 70×)`; `Φ′(M30 98×) < Φ′(M22 98×)`.

## 3. Precondición de validez

La misma del ADR 0016, ejecutada ANTES del veredicto: fila P_solo del núcleo
de M13 consistente con `tres_modelos_mres.md` ±5 % (1 estrella y 0,7 % a 61×;
36 y 22,5 % a 250×). Si falla, el veredicto NO se emite («la cadena
fotométrica del render ha cambiado; la calibración de Φ′ no es válida;
reabrir prerregistro»).

## 4. Salidas (comprometidas antes de medir)

- **Φ′ pasa todo** → es la métrica definitiva: candado que la fija (U′,
  A_ref, franjas, Δ) y cierre del ciclo #94→#99 sin tocar producción.
- **Φ′ falsea** → el problema está en el render, no en la normalización: la
  iteración (b) (#113) se abre con prerregistro propio que especifique UNA
  variable del render (p. ej. partición de la banda de transición, forma de
  m_res o definición de f_res) y por qué. No se retoca Φ′ a posteriori ni se
  prueba una tercera normalización sin prerregistro.

## Estado

Ni una línea de código del arnés de Φ′ escrita antes de este commit.
Siguiente paso: `scripts/veredicto_rotura_nucleo_densidad.js` y su candado.
