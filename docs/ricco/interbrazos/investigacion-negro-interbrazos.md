# Investigación: negro interbrazos en el render PS1 (Fases 1–4)

**Estado final: cerrada sin causa corregible.** El render actual es, dentro del modelo vigente, aproximadamente correcto. No repetir estas pruebas sin nueva evidencia (ver «Qué invalidaría este cierre» al final).

**Alcance:** este documento resume por qué el interbrazo de M51 (y estructuras equivalentes en M81/M101) aparece oscuro en el render frente a una referencia fotográfica, qué se probó, qué se descartó y por qué, y cuál es la única vía abierta que queda. Sustituye la necesidad de releer los cuatro informes de fase para futuras decisiones; los informes originales quedan como evidencia detallada, no como lectura obligatoria.

**Rama de origen:** `fase1-diagnostico-interbrazos` → `fase2-soporte-rampa` → `fase3-pertenencia-estructura` → `fase4-deficit-mezcla` (commit final `f9ac901`). Documentación detallada en `docs/ricco/{interbrazos,soporte,pertenencia,deficit}/`.

**Configuración de referencia usada en todo el estudio:** 457,2 mm · 190× · SQM 21,2 · δ=2. Objetos de control: M51 (caso principal), M81, M104, M101, NGC 205.

---

## 0. Origen de la pregunta

Comparación visual entre dos renders de M51 (uno con lagos negros marcados entre brazos, otro fotográfico de referencia con interbrazos tenues pero continuos). Se planteó como defecto: *"los interbrazos no deberían quedar negro absoluto"*. Cuatro fases de investigación después, la conclusión invierte parcialmente la premisa: **el render puede estar reflejando correctamente que, a esa apertura/aumento/cielo, el interbrazo real está por debajo del umbral de detección perceptual** — no una fotografía de referencia, sino la visión real en el ocular, es el patrón contra el que había que comparar desde el principio.

---

## 1. Fase 1 — Diagnóstico de causa (3 hipótesis descartadas)

**Método:** instrumentación no invasiva del pipeline (`harness_interbrazos.js`), ROIs congeladas en M51 (4 interbrazo, 1 brazo, 1 cielo, 1 puente de marea), mapa de clasificación del negro por etapa causante.

**Hipótesis contrastadas y veredicto:**

| Hipótesis | Contenido | Métrica | Veredicto |
|---|---|---|---|
| H-A | Geometría: interbrazos caen fuera de la elipse μ=25 | 27,7 % del negro fuera de escena (umbral: <30 %) | Descartada |
| H-B | Sobresustracción en el anclaje | Interbrazo crudo a **+2,06σ sobre cielo** (no negativo) | Descartada |
| H-C | Curva de tono / mapeo a 8 bits | Solo 12,1 % del negro llega al mapeo con flujo (umbral: <20 %) | Descartada |

**Hallazgo real:** 99,98 % del negro pasa por `op < 1`. En ROIs interbrazo, 74–88 % es clase (b): **flujo real, `w=1` (manda la imagen), pero la mezcla queda 0,55 mag bajo el umbral de Blackwell** (soporte local ~25″), y la rampa de opacidad lo apaga a `op` mediana 0.

**Premisa que se dio por buena en ese momento (luego caducó):** se asumió una excepción `PS1.opacidadInternaEscena` (dentro de escena μ=25 → op=1). Estaba revertida (`c99b72c`) antes de esta fase; el hallazgo se reportó pero no invalidó el resto del diagnóstico.

**No repetir:** cualquier hipótesis de geometría de escena, sobresustracción de anclaje, o problema de curva de tono como causa del negro interbrazo. Ya está descartado con datos reproducibles.

---

## 2. Fase 2 — Escala del soporte de la rampa (H-D, descartada con cota matemática)

**Método:** réplica de la rampa de opacidad en harness con paridad bit a bit contra producción, barrido de la escala del soporte local (media de caja).

**Parrilla:** 25″(baseline)–150″ fijo, más serie física `α·θR(fondo)/MAG`, α∈{1,2,4}.

**Resultado:** ninguna escala, única ni combinada, alcanza el criterio de ≥80 % de reducción del negro interbrazo. Mejor caso (150″): 12,5 %. Una corrida exploratoria con el **máximo** de 5 escalas simultáneas (cota superior teórica para cualquier combinación, por monotonía de `ps1Opacidad` en el flujo) alcanza techo 20,4 %.

**Por qué falla, en dos direcciones:**
- La media del soporte queda **dominada por el propio interbrazo** — el flujo de los brazos vecinos se diluye antes de sostener nada; respuesta no monótona con la escala (132″ peor que 100″).
- La escala grande **borra** señal exterior real: op>0 exterior de M81 cae de 0,050 a 0,005; anillos exteriores de M51 se atenúan +0,064 mag en todas las escalas ≥33″.
- El guardián de cielo nunca se violó (op>0 = 0,0000 en todo el barrido) — el riesgo previsto (encender cielo) no era el riesgo real.

**Arqueología de `c99b72c` (por qué se revirtió la excepción de escena):** doble causa — la elipse μ=25 como fuente de artefacto geométrico (380 160 px de envolvente visible en M101) y porque una condición binaria por geometría no distingue protección de luminancia (posterizaba M81).

**No repetir:** ningún barrido de escala de la media local, por grande que sea, puede alcanzar el criterio. La cota de monotonía lo demuestra matemáticamente, no hace falta rehacer el barrido con más puntos.

---

## 3. Fase 3 — Estadístico del soporte (H-E1/H-E2, descartadas; cierra la capa de opacidad)

**Método:** dos formulaciones no destructivas, ambas bajo el patrón `op_final = max(op_producción, componente_nueva)` (invariante: nunca se puede bajar `op` de producción).

- **H-E1 — estadístico de orden:** percentil alto (p75/p90) del soporte en vez de la media.
- **H-E2 — propagación de opacidad detectada:** dilatación en escala de grises de la `op` ya detectada, con decaimiento por distancia (implementada finalmente con EDT euclídea exacta de Felzenszwalb tras fallar el chamfer previsto por error de verificación).

**Resultado:**

| Variante | Mejor punto | Reducción interbrazo (≥80%) | Efecto secundario |
|---|---|---|---|
| H-E1 (p90/100″) | inofensiva en los 5 objetos | 51 % | M81 solo 5,9 % (criterio ≥60%) — corta, no daña |
| H-E2 (mejor config) | — | 54 % | viola cielo estructuralmente: op>0 en 0,44–0,94 del campo, incluso en M104/NGC205; halo −0,28 mag en estrella residual |

**Cota que cierra la línea entera:** corrida exploratoria p99/150″ (`op` mediana ≈1,000, el máximo posible) — el puente de marea aún conserva 9,2 % de negros (criterio ≤5 %) y los interbrazos 23–35 %. **Ese residuo ya no es la rampa: es el nivel de la mezcla por debajo de `fondo+δ`.** Ninguna variante de opacidad, incluida una H-E3 nunca implementada, puede tocarlo.

**No repetir:** cualquier reformulación de la rampa de opacidad (percentiles, propagación, combinaciones, u otros estadísticos del soporte) como vía para resolver el negro interbrazo. La capa de opacidad está agotada como palanca; el problema vive en la etapa anterior (mezcla/nivel).

---

## 4. Fase 4 — Déficit de la mezcla (H-F1–H-F4; conclusión: no hay defecto, hay umbral)

**Método:** auditoría aritmética por etapa (anclaje→PSF→bilineal→mezcla) con balance verificado, distinción de firma aditiva vs multiplicativa del déficit, test sintético de coherencia de ceros, y contrafactuales acotados por invariantes fotométricos (flujo 0–20″ ±0,5%, `Cmin`, `nivelFondo`, `rango`).

**Veredictos:**

| Hipótesis | Contenido | Resultado |
|---|---|---|
| H-F3 | Doble referencia de cero (bug aritmético) | Descartada — test sintético: Δ≤3×10⁻⁶, resta única y correcta |
| H-F4 | Redistribución PSF sobre señal débil | Descartada — recuperación sin PSF: solo 8,9 % |
| H-F2 | Anclaje de cielo sesgado alto | Descartada — recuperación con cielo por anillos: solo 3,6 % |
| H-F1 | Compresión por escala de mezcla `s` | **Identificada, pero es la ley de presupuesto de flujo, no un bug** |

**H-F1 en detalle:** `s` comprime exactamente `−2,5·log₁₀(s)` mag de forma uniforme (M51 +0,153, M81 +0,240, M101 +0,461 mag). Es aritméticamente correcta y necesaria: forzar `s=1` infla el flujo central +15/+25 % — rechazado contra el criterio de invariante fotométrico.

**Hallazgo central (reformula la pregunta original):** el interbrazo crudo de M51 (+2σ ≈ magnitud 24,07) **ya está 1,1 mag por debajo del umbral H2c** a 190×/SQM 21,2. El suelo de detección (cielo+1,5σ) lo borra correctamente; la mezcla lo reconstruye parcialmente vía perfil de Sérsic hasta 23,4–24,1. **La cadena no pierde 0,5 mag por un defecto: está devolviendo, con fidelidad razonable, una señal que nace por debajo del umbral de detección.** Quitar el suelo abrillanta el interbrazo pero cuesta −5 % de flujo central — rechazado por el mismo tipo de criterio.

Los 7 contrafactuales ensayados fueron rechazados contra los criterios fijados a priori (recuperación ≥60 % + fotometría ±0,5 % + invariantes intactos).

**Implicación para el anclaje absoluto H2 (sección 37 del informe técnico):** el sesgo heredable de calibrar `C∞` sobre los renders actuales es ≤0,06 mag — no los ~0,5 mag que se temía al abrir esta fase. **H2c, tal como está formulada, sigue siendo válida**; no hace falta revisarla por esta causa.

**No repetir:** cualquier intento de "arreglar" el nivel de la mezcla, la escala `s`, el anclaje de cielo o el suelo de detección como causa del negro interbrazo. Los siete contrafactuales razonables ya se probaron y rechazaron con criterios explícitos.

---

## 5. Conclusión consolidada

```text
NEGRO INTERBRAZOS M51 (457mm·190×·SQM21,2)
│
├── ¿Geometría de escena?              ✗ Fase 1 (H-A)
├── ¿Sobresustracción de anclaje?      ✗ Fase 1 (H-B) — cielo a +2,06σ, no negativo
├── ¿Curva de tono / mapeo 8-bit?      ✗ Fase 1 (H-C)
├── ¿Escala del soporte de opacidad?   ✗ Fase 2 (H-D) — cota matemática, techo 20,4%
├── ¿Estadístico del soporte?          ✗ Fase 3 (H-E1/E2) — cota p99, techo real (puente 9,2%)
├── ¿Doble cero aritmético?            ✗ Fase 4 (H-F3) — test sintético limpio
├── ¿PSF redistribuye mal?             ✗ Fase 4 (H-F4) — recuperación 8,9%
├── ¿Cielo mal anclado?                ✗ Fase 4 (H-F2) — recuperación 3,6%
└── ¿Escala de mezcla `s` comprime?    ~ Fase 4 (H-F1) — correcta, es presupuesto de flujo

CAUSA REAL: el interbrazo crudo (mag≈24,07) nace ~1,1 mag por debajo
del umbral H2c a esta configuración. El pipeline reconstruye señal
sub-umbral con fidelidad razonable; no hay pérdida artificial que corregir.

ÚNICA VÍA ABIERTA: el anclaje absoluto de H2 (factor de amplitud
Blackwell vs simulador, sección 37, aún pendiente) es la única palanca
física legítima que puede mover ese 1,1 mag — y solo si la calibración
contra observación real lo justifica.
```

---

## 6. Qué NO volver a probar (lista de exclusión operativa)

- Geometría de escena (elipse μ=25, o cualquier condición binaria por región) como excepción de opacidad — descartada dos veces (premisa caduca en F1, arqueología de `c99b72c`).
- Barrido de escala de la media local del soporte de opacidad, en cualquier rango — cota matemática en F2.
- Estadísticos alternativos del soporte de opacidad (percentiles, propagación/dilatación, combinaciones) — cota en F3, capa de opacidad agotada como palanca.
- "Arreglar" la escala de mezcla `s`, el anclaje de cielo, el suelo de detección o la ponderación de NaN en PSF como causa del interbrazo — los 7 contrafactuales de F4 ya lo descartaron con criterios a priori.
- Usar el perfil de Sérsic como verdad del brillo interbrazo, en cualquier fase — prohibido desde el informe técnico original (destruye NGC 5195 y estructuras reales si se usa así).

## 7. Qué SÍ queda abierto

1. **Anclaje absoluto H2** (sección 37 del informe técnico, Prioridad 1): comparar contra observaciones reales (series 12″/18″, SQM 21,2–22) para fijar `C∞` absoluto. Ahora tiene un caso de contraste medido con precisión: M51 interbrazo a mag 24,07, déficit de 1,1 mag respecto al umbral vigente.
2. **Validación observacional directa**: contrastar el render actual contra sketches/reportes de observadores reales con apertura y cielo comparables, antes de asumir que "más brillante" es "más correcto". El render podría ya estar cerca de la percepción real; la referencia fotográfica original no es el patrón adecuado de comparación.
3. Ambas vías convergen: la validación observacional alimenta el anclaje absoluto como dato de entrada.

## 8. Qué invalidaría este cierre

Este documento deja de ser válido como "no repetir" si:
- Cambia la configuración de referencia de forma sustancial (otra apertura/aumento/cielo que mueva el interbrazo por encima o muy por debajo del umbral).
- Se modifica H2c, `C∞`, o el anclaje absoluto (cambiaría el umbral contra el que se midió el déficit de 1,1 mag).
- Se modifica la escala de mezcla `s`, el anclaje de cielo, o el suelo de detección por otra razón ajena a esta investigación (habría que repetir al menos el test sintético de ceros de la Fase 4).

## 9. Índice de evidencia detallada

| Fase | Rama | Commit(s) final | Documentación |
|---|---|---|---|
| 1 — Diagnóstico | `fase1-diagnostico-interbrazos` | `acbf335`, `538f8ef` | `docs/ricco/interbrazos/` |
| 2 — Escala soporte | `fase2-soporte-rampa` | `581f1c7`, `a6c4d79` | `docs/ricco/soporte/` |
| 3 — Estadístico soporte | `fase3-pertenencia-estructura` | `a89863b`, `6f707be`, `c4475ee`, `e5c0be5` | `docs/ricco/pertenencia/` |
| 4 — Déficit mezcla | `fase4-deficit-mezcla` | `f9ac901` | `docs/ricco/deficit/` |

Cada carpeta contiene: informe de fase, harness/scripts deterministas (un comando por experimento), ROIs congeladas en JSON, baselines de paridad bit a bit, tablas resumen CSV y PNGs diagnósticos. Producción quedó intacta en las cuatro fases (diff vacío fuera de `scripts/` y `docs/`); batería de tests verde al cierre de cada una.
