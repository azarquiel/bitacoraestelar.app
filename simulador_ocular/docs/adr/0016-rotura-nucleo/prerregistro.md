# Prerregistro de listones — métrica Φ de rotura del núcleo (ADR 0016)

Fecha: 2026-08-24. Formulación cerrada en sesión de grilling (2026-08-24, #108).

Comprometido ANTES de escribir una línea de código del arnés. Ningún listón de
este documento se retoca tras leer la salida: si un listón falla, la métrica —o
el canal del render que la alimenta— se declara falsada en ese punto y se
documenta, nunca se ajusta el listón a posteriori. Misma disciplina que el
prerregistro de #95 (`simulador_ocular/docs/adr/0015-textura/prerregistro.md`).

Fuente: `simulador_ocular/docs/adr/0016-phi-metrica-de-veredicto-de-la-rotura-del-nucleo.md`,
`simulador_ocular/docs/adr/0015-textura/analisis_recuperable.md`,
`simulador_ocular/docs/experimentos/tres_modelos_mres.md`.

## 1. Formulación (cerrada; sin retoques tras ver la salida)

- `Φ(r) = f_res(r) · N_res(r)^(1/4)` — exponente 1/4 **fijo** por literatura
  (Robson & Graham 1981, sumación espacial).
- `N_res(r)` = nº de estrellas del anillo con `m < m_res(r) + 0,75` (banda de
  transición incluida). Δ = 0,75 es `dmagCrowd` (ADR 0012): **invariante, no
  parámetro**.
- `f_res(r)` = fracción del flujo total del anillo en esas mismas estrellas
  (`F_dibujado/F_total`).
- **Un único parámetro libre: U**, **leído** (no elegido) en el ancla: Φ del
  anillo nuclear (r < 0,25 r_h, primer anillo de la tabla) de M13, 200 mm,
  SQM 21, 120× («primera rotura del núcleo», mismo ancla del ADR 0015). El
  anillo del ancla es el MISMO anillo de P2.
- M entra **exclusivamente** por `m_lim,sky` (ya existente; `m_crowd` sigue
  ciego a M). Soporte de N_res: los anillos del render (#98), congelados —
  las cuatro franjas de r/r_h ya usadas por el ADR 0015:
  [0, 0,25) · [0,25, 0,50) · [0,50, 1,00) · [1,00, 2,00).
- **Prohibido** usar σ/RMS del campo SBF: la métrica solo mira el catálogo de
  estrellas dibujadas.

## 2. Listones (re-expresión de los de #95 §2–§3: mismos casos, misma estructura de falsación)

Todas sobre M13, 200 mm, SQM 21, salvo el banco del 18″.

| # | Comprobación | Umbral |
|---|---|---|
| P1 | M13 61×, los 4 anillos | `Φ < U` en todos |
| P2 | anillo nuclear (el del ancla) | `Φ@120× < Φ@173× < Φ@250×` estricto |
| P3 | halo (r/r_h 1,00–2,00) a 250× | `Φ < U` |

P1 falsea si cualquier anillo a 61× alcanza U. P2 falsea si la secuencia no es
estrictamente creciente. P3 falsea si el halo alcanza U al aumento más
favorable del barrido.

## 3. Banco del 18″ (binario) y ordinales

Mismos casos del prerregistro de #95 §3 (bitácora propia, `Stargate 18”`,
D = 457 mm), veredicto sobre el **núcleo** (anillo r/r_h 0,00–0,25):

| Cúmulo | Aumento | Listón |
|---|---|---|
| M55 (NGC 6809) | 70× | `Φ ≥ U` |
| M55 (NGC 6809) | 480× | `Φ ≥ U` |
| M22 (NGC 6656) | 98× | `Φ ≥ U` |
| M30 (NGC 7099) | 98× | `Φ ≥ U` |
| **M62 (NGC 6266)** | **70×, 98×, 270×** | **`Φ < U` en TODOS los aumentos** |

M62 es el caso que la métrica tiene que saber decir que no: si Φ alcanza U en
el núcleo de M62 a cualquiera de estos aumentos, el listón falsea tanto como si
M55/M22/M30 no rompieran.

Ordinales, sin constantes nuevas:

- `Φ(M55 480×) > Φ(M55 70×)`
- `Φ(M30 98×) < Φ(M22 98×)`

## 4. Precondición de validez (se ejecuta ANTES del veredicto)

N_res y f_res en el ancla deben ser consistentes con
`simulador_ocular/docs/experimentos/tres_modelos_mres.md` ±5 % (fila P_solo:
núcleo de M13, 1 estrella y 0,7 % del flujo a 61×; 36 estrellas y 22,5 % a
250×). Si falla: el veredicto NO se emite y el test cae en rojo con «la cadena
fotométrica del render ha cambiado; la calibración de Φ no es válida; reabrir
prerregistro». (Lección de `informe_autocritica_v7.md` §1.2: un test que no
puede fallar no es un test.)

## 5. Restricción de alcance

El veredicto se emitirá **sin tocar el render**. Esta iteración es un
instrumento de diagnóstico: si pasa, producción ya hace la transición y lo que
faltaba era la métrica. Si falla, el informe señala el canal culpable (p. ej.
respuesta de `m_lim,sky` a M) y una iteración (b) se abre con su propio
prerregistro específico. No se salta (a). U y la rejilla radial quedan fijados
como invariantes de test **en el mismo commit** que la calibración.

## Estado

Ni una línea de código del arnés escrita antes de este commit. Documento
cerrado: formulación, listones, banco del 18″ (con caso que no rompe),
ordinales y precondición de validez, todos prerregistrados. Siguiente paso:
#109 (arnés, candado y veredicto).
