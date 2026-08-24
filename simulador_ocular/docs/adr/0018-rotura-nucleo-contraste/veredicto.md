# Veredicto: calibración de U″ y listones de la métrica Φ″ (ADR 0018)

Fecha: 2026-08-24. Prerregistro: `simulador_ocular/docs/adr/0018-rotura-nucleo-contraste/prerregistro.md`.
Arnés: `scripts/veredicto_rotura_nucleo_contraste.js`. Candado:
`scripts/test_veredicto_rotura_nucleo_contraste.js`. Cero cambios en `resources/js/*`.

## Veredicto

**Φ″ queda FALSADA en dos puntos (P3 y M30 98×), pero resuelve P1 entero** —
el primer listón que ninguna de las dos métricas anteriores había salvado.
Conforme a la salida comprometida en el prerregistro §4: la vía de la métrica
queda **agotada con tres formas medidas** (conteo, densidad, contraste), y la
iteración (b) sobre el render (#113) se abre con prerregistro de UNA variable:
la partición de la banda de transición (Δ) o la forma de m_res. Sin cuarta
métrica.

## 1. Precondición de validez

Fila P_solo del núcleo de M13 contra `tres_modelos_mres.md` ±5 %: ok (misma
cadena; el candado la ejecuta antes de emitir).

## 2. Anclaje de U″

Mismo ancla; A_ref = 2,018858 × 10³ arcsec² heredada del 0017.
**U″ = 1,977118 × 10⁻¹** (f_contraste = 0,1084 y N_res = 11,08 en el ancla).

## 3. Listones — medidas exactas

| Listón | Predicción | Medida | Resultado |
|---|---|---|---|
| P1 — M13 61×, 4 anillos: Φ″ < U″ | < 0,1977 | [0,00116; 0,0356; 0,1338; 0,1815] | **ok — por primera vez** |
| P2 — núcleo: creciente estricto | 120× < 173× < 250× | [0,1977; 0,3965; 0,6139] | ok |
| P3 — halo a 250×: Φ″ < U″ | < 0,1977 | 0,6682 | **FALLA** |

Banco del 18″ (D = 457 mm, SQM 21, núcleo):

| Cúmulo | Aumento | Listón | Φ″ | Resultado |
|---|---|---|---|---|
| M55 | 70× | ≥ U″ | 0,7194 | ok |
| M55 | 480× | ≥ U″ | 2,5835 | ok |
| M22 | 98× | ≥ U″ | 0,9837 | ok |
| M30 | 98× | ≥ U″ | **0,0524** | **FALLA** |
| M62 | 70× / 98× | < U″ | 0,0000 | ok |
| M62 | 270× | < U″ | 0,0953 | ok |

Ordinales: 2,5835 > 0,7194 ok; 0,0524 < 0,9837 ok.

## 4. Diagnóstico: qué resolvió el contraste y qué es ya del render

**Lo que el contraste local arregló: P1.** El anillo exterior de M13 a 61×
cae de 0,544 (Φ) → 0,207 (Φ′) → 0,1815 < U″. A 61× el cielo domina el fondo
del halo y aplasta el contraste — exactamente la física que le faltaba a la
fracción de flujo. La progresión por métrica en los tres puntos:

| Punto | Φ (0016) | Φ′ (0017) | Φ″ (0018) | U de cada una |
|---|---|---|---|---|
| P1 exterior 61× | 0,5442 | 0,2067 | 0,1815 ✓ | 0,1817 / 0,1817 / 0,1977 |
| P3 halo 250× | 1,6481 | 0,6262 | 0,6682 | — |
| M30 98× | 0,0400 | 0,0513 | 0,0524 | — |

**Lo que ninguna forma de la métrica mueve, con causa medida:**

- **M30 98× es insensible a las tres formas** (0,040 / 0,051 / 0,052). Motivo
  medido: su F_dibujado es tan pequeño frente al velo (f_c = 0,0288 ≈ f_res =
  0,0282) que contraste y fracción coinciden — cuando casi todo el flujo está
  en el velo, redefinir el denominador no cambia nada. El censo es correcto
  (N_res = 4,0 = «se resuelven varias estrellas»); lo que la observación
  llama «moteado» con 4 estrellas y poquísimo flujo en puntos no lo captura
  NINGUNA función de (F_dibujado, fondo) del anillo agregado. La variable
  que queda es del render: dónde corta m_res y cómo reparte la banda de
  transición el flujo alrededor del corte.
- **P3 no mejora con el contraste** (0,626 → 0,668): a 250× el velo del halo
  es débil y m_res profundo, así que el contraste de lo dibujado es alto
  GENUINAMENTE en el canal. Nota para la iteración (b), sin retocar nada
  aquí: P3 se heredó de la ley de textura (ADR 0015), donde «ver grano en el
  halo» era el falso positivo a negar; en el canal de estrellas resueltas el
  halo de M13 a 250× puede estar resuelto de verdad (la bitácora resuelve
  antes el halo que el núcleo: M55 70×). Si P3 es trasladable tal cual al
  canal de estrellas es una pregunta legítima para el prerregistro de (b) —
  decidirla ahora, con la salida delante, sería retocar un listón a
  posteriori, y no se hace.

**Iteración (b) (#113), con lo que estas tres medidas dejan:** P2 y los
ordinales han pasado con las TRES métricas (la respuesta al aumento del canal
es robusta); M62 no rompe con ninguna (el caso negativo es robusto); P1 se
resuelve con contraste local; los residuos P3/M30 no son de la métrica. UNA
variable del render, con prerregistro: la partición de la banda de transición
(Δ) o la forma de m_res (p. ej. su respuesta a la densidad local).

## 5. Alcance de lo prohibido, respetado

Δ y a(m,r) intactos; ningún parámetro del render tocado; la redefinición de
f_res vive solo en el arnés; ningún listón retocado tras ver la salida; U″
leído, no elegido; σ/RMS del campo SBF sin usar; cero cambios en
`resources/js/*`. Los candados de 0016 y 0017 siguen en verde e intactos.

## 6. Qué queda fijado

- `scripts/veredicto_rotura_nucleo_contraste.js`: Φ″ reproducible (importa
  los arneses de 0016/0017; nada duplicado).
- `scripts/test_veredicto_rotura_nucleo_contraste.js`: precondición + candado
  de U″, la definición de f_res_contraste (velo por `S1campo` + cielo por
  `Fcielo`), y el patrón exacto (P1 pasa por primera vez; P3 y M30 falsean).
- La vía de la métrica queda CERRADA con tres formas medidas. El ciclo
  #94→#99 pasa a #113: iteración (b) sobre el render, una variable, con
  grilling y prerregistro propios.
