# Veredicto: calibración de U y listones de la métrica Φ (ADR 0016, #109)

Fecha: 2026-08-24. Prerregistro: `simulador_ocular/docs/adr/0016-rotura-nucleo/prerregistro.md`.
Arnés: `scripts/veredicto_rotura_nucleo.js`. Candado: `scripts/test_veredicto_rotura_nucleo.js`.
Cero cambios en `resources/js/*`.

## Veredicto

**La métrica Φ, tal como quedó prerregistrada, queda FALSADA** (P1, P3 y un
caso del banco del 18″). El render **no cambia ni un bit** — y el diagnóstico
(§4) es el contrario del que la falsación sugiere a primera vista: los canales
del render quedan exonerados por los propios listones que pasan (P2, los dos
ordinales, M55/M22/M62, y N_res de M30 coincidente con la cita de la
bitácora). Lo que no sobrevive a la medida es la **comparabilidad de Φ entre
anillos y entre cúmulos con un único umbral U**. La iteración (b) se abre con
su propio prerregistro; no se retoca ningún listón a posteriori.

## 1. Precondición de validez

`node scripts/harness_tres_modelos_mres.js` reproduce hoy la fila P_solo de
`tres_modelos_mres.md` exactamente (núcleo de M13: 1 estrella y 0,7 % a 61×;
36 estrellas y 22,5 % a 250×; tolerancia ±5 %). La cadena fotométrica del
render no ha cambiado: la calibración de Φ es válida y el veredicto se emite.

## 2. Anclaje de U

Único dato de anclaje: M13, 200 mm, SQM 21, 120×, «primera rotura del núcleo»,
anillo r/r_h [0, 0,25) — el primer anillo de la tabla, el mismo de P2.

**U = 1,817095 × 10⁻¹**, con N_res = 11,08 y f_res = 0,0996 en el ancla.
Δ = 0,75 (`dmagCrowd`, ADR 0012) y la rejilla r/r_h [0 · 0,25 · 0,50 · 1,00 ·
2,00] quedan fijados como invariantes en el mismo commit que esta calibración
(candado).

## 3. Listones — medidas exactas

| Listón | Predicción | Medida | Resultado |
|---|---|---|---|
| P1 — M13 61×, 4 anillos: Φ < U | < 0,1817 en cada uno | [0,00118; 0,0472; **0,2444; 0,5442**] | **FALLA** (anillos exteriores) |
| P2 — núcleo: Φ@120× < Φ@173× < Φ@250× | creciente estricto | [0,1817; 0,3394; 0,4941] | ok |
| P3 — halo (r/r_h 1,00–2,00) a 250×: Φ < U | < 0,1817 | 1,648 | **FALLA** |

Banco del 18″ (D = 457 mm, SQM 21, núcleo r/r_h [0, 0,25)):

| Cúmulo | Aumento | Listón | Φ medido | Resultado |
|---|---|---|---|---|
| M55 | 70× | ≥ U | 0,7411 | ok |
| M55 | 480× | ≥ U | 1,7927 | ok |
| M22 | 98× | ≥ U | 0,9952 | ok |
| M30 | 98× | ≥ U | **0,0400** | **FALLA** |
| M62 | 70× | < U | 0,0000 | ok |
| M62 | 98× | < U | 0,0000 | ok |
| M62 | 270× | < U | 0,0683 | ok |

Ordinales: Φ(M55 480×) = 1,7927 > Φ(M55 70×) = 0,7411 ok;
Φ(M30 98×) = 0,0400 < Φ(M22 98×) = 0,9952 ok.

## 4. Diagnóstico: qué falla y qué queda exonerado

**El canal del aumento (`m_lim,sky`) queda exonerado.** P2 sale creciente
estricto en el anillo del ancla, y el ordinal M55 70×→480× también: la
respuesta del canal de estrellas resueltas al aumento tiene la dirección y la
progresión que exigía el prerregistro. Este era el canal señalado como
sospechoso ex ante (issue #109) y la medida lo absuelve.

**El censo del render también queda exonerado, incluso donde el listón cae.**
En M30 a 98× el render pone N_res = 4,0 estrellas en el núcleo — exactamente
la observación de la bitácora («se resuelven varias estrellas en su
interior»). El listón falla porque f_res = 0,0282 hunde el producto
f_res · N_res^(1/4) = 0,040 muy por debajo de un U = 0,182 anclado en M13,
cuyo núcleo rompe con f_res = 0,0996 y N_res = 11. El desacuerdo no está entre
el render y la observación: está entre la escala absoluta de Φ en dos cúmulos
distintos.

**Lo falsado es la comparabilidad de Φ, con dos mecanismos medidos:**

- **N_res lleva el área del anillo.** Es un conteo absoluto, y las franjas
  exteriores son mecánicamente mayores: en el ancla, N_res = 11 → 27 → 74 →
  198 del núcleo al halo. Φ crece monótonamente con el radio en TODAS las
  configuraciones medidas (M13 a 61×, 120×, 250×; M22, M30, M62 — sin
  excepción).
- **f_res crece hacia fuera de verdad** (menos crowding, menos velo), y eso es
  física correcta del render, no un artefacto: la propia bitácora dice que el
  halo rompe antes que el núcleo (M55 70×: «se resuelven todas las estrellas,
  más complicado en el núcleo»).

P1 y P3 exigían `Φ(anillo exterior) < U(núcleo)`: heredaron de 0015 una
estructura pensada para P(ver), una probabilidad acotada y comparable entre
anillos. Φ no lo es, y un único U no puede decir a la vez «el núcleo rompe a
120×» y «el halo no ha roto a 61×» cuando el halo lleva siempre el Φ más alto.
La falsación de P1/P3 mide esa no-comparabilidad, no un canal del render; y la
de M30 mide lo mismo entre cúmulos (niveles absolutos de f_res muy distintos
con censos correctos).

**Iteración (b):** se abre con prerregistro propio (no se salta (a), no se
retoca nada aquí). Lo que este veredicto deja medido para ella: la dirección
en aumento es correcta (P2, ordinales), el censo es correcto (M30 = cita), y
cualquier métrica sucesora tiene que ser comparable entre anillos de área
distinta y entre cúmulos con f_res de nivel distinto — o renunciar a listones
que crucen anillos/cúmulos con un umbral único.

## 5. Alcance de lo prohibido, respetado

No se ha usado σ/RMS del campo SBF en ninguna parte de la métrica (solo el
censo de estrellas dibujadas y las funciones de producción `Fdibujado`, `S1`,
`sigma`, y la tabla `mRes` del render — ADR 0008). El exponente 1/4 no se ha
tocado, Δ = 0,75 no se ha tocado, ningún listón se ha retocado tras ver la
salida, y U se ha leído en el ancla, no elegido. Cero cambios en
`resources/js/*`.

## 6. Qué queda fijado y qué no

- El render de producción: intacto, ni un bit.
- `scripts/veredicto_rotura_nucleo.js`: la métrica y los listones,
  reproducibles.
- `scripts/test_veredicto_rotura_nucleo.js`: precondición de validez (la fila
  P_solo de `tres_modelos_mres.md` ±5 %, ANTES del veredicto) + candado de
  U, Δ, rejilla, anillo del ancla = anillo de P2, y del patrón exacto del
  veredicto (P2/ordinales/M55/M22/M62 pasan; P1/P3/M30 falsean). Reabrir esta
  vía exigirá romper el test con medida, no en silencio.
- El ciclo #94→#99 NO se cierra con esta iteración: queda a la espera de la
  iteración (b) con su prerregistro.
