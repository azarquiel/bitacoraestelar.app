# Veredicto: calibración de U′ y listones de la métrica Φ′ (ADR 0017)

Fecha: 2026-08-24. Prerregistro: `simulador_ocular/docs/adr/0017-rotura-nucleo-densidad/prerregistro.md`.
Arnés: `scripts/veredicto_rotura_nucleo_densidad.js`. Candado:
`scripts/test_veredicto_rotura_nucleo_densidad.js`. Cero cambios en `resources/js/*`.

## Veredicto

**Φ′ queda FALSADA, en los MISMOS tres puntos que Φ** (P1 en el anillo
exterior, P3 y M30 98×) y con los mismos listones a favor (P2, ordinales,
M55/M22/M62). Conforme a la salida comprometida en el prerregistro §4: **la
normalización no era el problema de fondo — el problema está en el render**, y
la iteración (b) (#113) se abre con prerregistro propio de UNA variable
(candidatas medidas en §4: la definición/gradiente de f_res, la partición de
la banda de transición o la forma de m_res). No se prueba una tercera
normalización sin prerregistro.

## 1. Precondición de validez

Fila P_solo del núcleo de M13 reproducida contra `tres_modelos_mres.md`
(1 estrella y 0,7 % a 61×; 36 y 22,5 % a 250×; ±5 %): la cadena fotométrica
no ha cambiado, el veredicto se emite.

## 2. Anclaje de U′

Mismo ancla que el ADR 0016. A_ref = 2,018858 × 10³ arcsec² (área del anillo
del ancla, constante inerte). **U′ = 1,817095 × 10⁻¹** — igual a U por
construcción (Φ′ = Φ en el ancla, comprobado por el candado).

## 3. Listones — medidas exactas

| Listón | Predicción | Medida | Resultado |
|---|---|---|---|
| P1 — M13 61×, 4 anillos: Φ′ < U′ | < 0,1817 | [0,00118; 0,0358; 0,1313; **0,2067**] | **FALLA** (solo el anillo exterior) |
| P2 — núcleo: creciente estricto | 120× < 173× < 250× | [0,1817; 0,3394; 0,4941] | ok |
| P3 — halo a 250×: Φ′ < U′ | < 0,1817 | 0,6262 | **FALLA** |

Banco del 18″ (D = 457 mm, SQM 21, núcleo):

| Cúmulo | Aumento | Listón | Φ′ | Resultado |
|---|---|---|---|---|
| M55 | 70× | ≥ U′ | 0,5727 | ok |
| M55 | 480× | ≥ U′ | 1,3853 | ok |
| M22 | 98× | ≥ U′ | 0,7058 | ok |
| M30 | 98× | ≥ U′ | **0,0513** | **FALLA** |
| M62 | 70× / 98× | < U′ | 0,0000 | ok |
| M62 | 270× | < U′ | 0,0926 | ok |

Ordinales: 1,3853 > 0,5727 ok; 0,0513 < 0,7058 ok.

## 4. Diagnóstico: la normalización funcionó; lo que queda es del render

**El mecanismo del área queda corregido y medido.** En el ancla, Φ crecía
0,182 → 0,334 → 0,623 → 1,029 del núcleo al halo; Φ′ crece 0,182 → 0,254 →
0,335 → 0,391. Los tres fallos se acercan mucho al listón: P1 exterior
0,544 → 0,207 (a un 14 % de pasar), P3 1,648 → 0,626, M30 0,040 → 0,051. La
densidad hace exactamente lo que se le pidió — y no basta.

**El residuo que queda NO es de normalización:**

- **El gradiente radial de f_res.** En toda configuración, f_res crece hacia
  fuera (ancla: 0,0996 → 0,1469 → 0,2127 → 0,2743) porque el velo y el
  crowding caen con el radio. Con la densidad^(1/4) ya casi plana, ese
  gradiente es lo único que mantiene Φ′(halo) > Φ′(núcleo) y rompe P1/P3.
- **El nivel absoluto de f_res en M30.** N_res = 4,0 coincide con la cita de
  la bitácora, y la densidad apenas mueve el caso (0,040 → 0,051): lo que lo
  hunde es f_res = 0,0282 contra el 0,0996 del ancla. Un núcleo puede
  percibirse «moteado» con una fracción de flujo en puntos mucho menor que la
  de M13 — la definición actual de f_res (fracción de flujo) no captura esa
  percepción.

Ambos residuos apuntan a las variables del render/definición listadas en el
prerregistro §4: f_res (su definición o un exponente propio), la partición de
la banda de transición, o la forma de m_res. Elegir UNA y por qué es la
iteración (b) (#113), con su propio prerregistro; este veredicto solo deja la
medida.

## 5. Alcance de lo prohibido, respetado

Ningún listón retocado tras ver la salida; U′ leído, no elegido; A_ref inerte
(fijada antes de medir); σ/RMS del campo SBF sin usar; exponente 1/4 y Δ
intactos; cero cambios en `resources/js/*`; el candado del ADR 0016 sigue en
verde e intacto (los dos veredictos coexisten, cada uno con su candado).

## 6. Qué queda fijado

- `scripts/veredicto_rotura_nucleo_densidad.js`: Φ′ reproducible (importa el
  arnés del 0016; nada duplicado).
- `scripts/test_veredicto_rotura_nucleo_densidad.js`: precondición + candado
  de U′, A_ref = área del anillo del ancla, Φ′ = Φ en el ancla, y el patrón
  exacto del veredicto (P2/ordinales/M55/M22/M62 pasan; P1/P3/M30 falsean).
- El ciclo #94→#99 sigue abierto: pasa a #113 (iteración (b) sobre el render).
