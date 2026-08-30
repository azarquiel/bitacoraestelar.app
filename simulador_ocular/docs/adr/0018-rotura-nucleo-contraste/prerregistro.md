# Prerregistro de listones — métrica Φ″ (contraste local) de rotura del núcleo (ADR 0018)

Fecha: 2026-08-24. Formulación propuesta por el observador tras el veredicto
negativo del ADR 0017, ANTES de escribir una línea de código del arnés de Φ″.
Ningún listón se retoca tras leer la salida. Misma disciplina que los
prerregistros de los ADR 0016 y 0017.

Fuente: `simulador_ocular/docs/adr/0018-fres-es-contraste-local-no-fraccion-de-flujo.md`,
`simulador_ocular/docs/adr/0017-rotura-nucleo-densidad/veredicto.md`.

## 1. Formulación (cerrada; sin retoques tras ver la salida)

- `Φ″(r) = f_res_contraste(r) · (ρ(r) · A_ref)^(1/4)`, con ρ = N_res/A(r).
- `f_res_contraste(r) = F_dibujado(r) / (F_velo_local(r) + F_cielo(r))`,
  integrado por franja en radio propio:
  - `F_dibujado` = ∫ 2π·r·Σ(r)·Fdibujado(m_res(r), r, θ_img) dr (producción).
  - `F_velo_local` = ∫ 2π·r·Σ(r)·S1campo(m_res(r), r, θ_img) dr — el flujo no
    resuelto del anillo, con la MISMA función de producción de la que
    F_dibujado es complemento exacto (ADR 0012; nada se reimplementa).
  - `F_cielo` = Fcielo · A(r) — el fondo de cielo del marco fotométrico del
    render (`res.cHalo.Fcielo`, el mismo que usa la cadena de m_lim,sky),
    sobre el área de la franja.
- `A(r)`, `A_ref`, `N_res` (inversión de `aCrowd`), Δ = 0,75, exponente 1/4,
  franjas r/r_h [0 · 0,25 · 0,50 · 1,00 · 2,00], M solo por `m_lim,sky`,
  σ/RMS del campo SBF prohibido: TODO idéntico a los ADR 0016/0017.
- **Un único parámetro libre: U″**, leído (no elegido) en el mismo ancla:
  M13, 200 mm, SQM 21, 120×, anillo r/r_h [0, 0,25) — el mismo anillo de P2.
- **Prohibido**: tocar Δ, la forma de a(m,r) o cualquier parámetro del
  render. La redefinición de f_res vive SOLO en el arnés.

## 2. Listones

Los MISMOS de los ADR 0016/0017, con Φ″ y U″:

| # | Comprobación | Umbral |
|---|---|---|
| P1 | M13 61×, los 4 anillos | `Φ″ < U″` en todos |
| P2 | anillo nuclear (el del ancla) | `Φ″@120× < Φ″@173× < Φ″@250×` estricto |
| P3 | halo (r/r_h 1,00–2,00) a 250× | `Φ″ < U″` |

Banco del 18″ (D = 457 mm, SQM 21, núcleo r/r_h [0, 0,25)): M55 70×,
M55 480×, M22 98×, M30 98× → `Φ″ ≥ U″`; M62 → `Φ″ < U″` en 70×, 98× y 270×.

Ordinales: `Φ″(M55 480×) > Φ″(M55 70×)`; `Φ″(M30 98×) < Φ″(M22 98×)`.

## 3. Precondición de validez

La misma de los ADR 0016/0017, ejecutada ANTES del veredicto: fila P_solo del
núcleo de M13 consistente con `tres_modelos_mres.md` ±5 %. Si falla, el
veredicto NO se emite («la cadena fotométrica del render ha cambiado; la
calibración de Φ″ no es válida; reabrir prerregistro»).

## 4. Salidas (comprometidas antes de medir)

- **Φ″ pasa todo** → la métrica correcta es contraste local, no fracción de
  flujo. Candado (`scripts/test_veredicto_rotura_nucleo_contraste.js`) que
  fija U″, la definición de f_res_contraste, Δ y la rejilla. El render no se
  toca; el ciclo #94→#99 se cierra.
- **Φ″ falsea** → el problema está en la partición de la banda de transición
  (Δ) o en la forma de m_res. SOLO entonces se abre la iteración (b) sobre el
  render (#113), con prerregistro que especifique UNA variable (p. ej.
  respuesta de m_res a la densidad, o la sigmoide de la banda) y por qué. Sin
  cuarta métrica: la vía de la métrica queda agotada con tres formas medidas.

## Estado

Ni una línea de código del arnés de Φ″ escrita antes de este commit.
Siguiente paso: `scripts/veredicto_rotura_nucleo_contraste.js` y su candado.
