# Especificación técnica — Diagnóstico y mejora de la representación cromática estelar

**Proyecto:** Simulador de oculares / Bitácora Gaia
**Módulos afectados:** `bitacora-gaia-color.js`, `bitacora-gaia-render.js`, `vecindario-solar.js`, `via-lactea-vecindario-catalogo.js`
**Estado:** Borrador para aprobación
**Versión:** 1.0

---

## 1. Objetivo

Localizar, con evidencia cuantitativa, la primera etapa del pipeline en la que una estrella de BP–RP inequívocamente azul deja de producir un píxel inequívocamente azul, y corregir únicamente esa etapa. Queda fuera del alcance rehacer la tabla `GAIA_COLOR`, introducir `L_ret` o modificar el modelo escotópico.

**Síntoma observado:** en NGC 4755 las estrellas presumiblemente azules se renderizan con saturación RGB ≈ 0,10 (blanco frío), mientras la estrella de carbono conserva saturación ≈ 0,69.

## 2. Decisión previa obligatoria — Semántica del BP–RP

Antes de cualquier cambio de código debe fijarse por escrito qué representa el color en el simulador:

| Opción | Significado | Consecuencia |
|---|---|---|
| **A. Color observado** | El BP–RP de Gaia incluye enrojecimiento interestelar; es la señal que llega al telescopio | No se corrige extinción. Un Joyero parcialmente neutro puede ser el resultado correcto |
| **B. Color intrínseco** | El simulador representa el color de la fotosfera | Se requiere corrección BP–RP_obs → BP–RP_0 con E(BP−RP) por objeto |

Esta decisión es de modelo de observación, no de implementación, y condiciona la interpretación de todos los resultados posteriores. NGC 4755 tiene E(B−V) ≈ 0,4; la elección A vs B cambia sustancialmente el color esperado de sus componentes B.

**Entregable:** una línea en el informe de principios (§2) declarando la semántica elegida.

## 3. Protocolo de diagnóstico

### Fase 0 — Verificación de la fuente (coste ≈ minutos, sin código nuevo)

Ejecutar `BitacoraGaiaColor.colorPorBpRp(bprp, 1)` para:

```
BP–RP ∈ { −0.5, −0.3, −0.1, 0.0, 0.3, 0.8, 1.5, 2.5, 3.5 }
```

Registrar RGB exacto y cromaticidad (métrica en §4). Contrastar con los valores dorados de `scripts/test_gaia_color.js`.

**Criterio de bifurcación:**
- Si el azul de tabla (BP–RP ≤ −0.3) ya presenta cromaticidad baja → investigar `GAIA_COLOR` y su procedencia (Harre & Heller 2021) antes que el render.
- Si la tabla entrega azul cromático → continuar a Fase 1.

### Fase 1 — Verificación de la entrada (datos reales)

Volcar el BP–RP de catálogo de las 10 estrellas más brillantes del campo de NGC 4755 y su RGB de tabla (T0), sin render.

**Criterio de bifurcación:**
- Si los BP–RP observados ya son ≥ 0 (enrojecidos hasta el neutro) → el render puede ser correcto; el problema es la decisión de §2 (semántica A vs B), no un defecto de código.
- Si existen BP–RP claramente negativos que producen T0 azul → el defecto está en el render; continuar a Fase 2.

### Fase 2 — Instrumentación del pipeline (estrella sintética)

Con una estrella sintética de BP–RP = −0.3 y flujo controlado, registrar el color tras cada etapa. El orden real de etapas debe extraerse del código, no asumirse; la secuencia siguiente es la hipótesis a verificar:

| Punto | Etapa | Función |
|---|---|---|
| T0 | Salida de tabla | `colorPorBpRp()` |
| T1 | Saturación por flujo | `saturar()` / `fraccionFlujo()` |
| T2 | Tinte de núcleo | `CFG.tinteNucleo` |
| T3 | PSF / aureola / spikes | `dibujarEstrellaColor()` etc. |
| T4 | Codificación gamma | `aplicarGamma()` / `sRGBenc()` |
| T5 | Píxel final en canvas | lectura directa |

En cada punto registrar: RGB lineal, luminancia relativa, tono (h) y croma (C) en OKLCh.

**Nota crítica:** verificar en el código si alguna operación de mezcla, saturación o composición ocurre *después* de `aplicarGamma()`. Cualquier operación de color en espacio sRGB codificado es defecto per se y se corrige con independencia del diagnóstico principal.

### Fase 3 — Matriz diagnóstica (harness sintético)

Clases × flujos × enrojecimiento:

- **Clases:** B, A, F, G, K, M (BP–RP representativos de `CLASE_BPRP`), más **B enrojecida** (BP–RP desplazado según la extinción típica del campo problema).
- **Flujos:** 0.25×, 1×, 4×, 16× respecto a un flujo de referencia.
- **Salida por celda:** T0…T5 con las métricas de §4.

Este harness es el banco de regresión permanente: debe integrarse junto a los tests dorados existentes.

### Fase 4 — Experimentos de ablación (solo tras Fase 2)

Una palanca por experimento, nunca combinadas:

1. `tinteNucleo = 0` (resto intacto).
2. `saturación = 1` forzada (resto intacto).
3. Gamma global vs parcial (`gammaGlobal` on/off).

Cada experimento se evalúa con el indicador de conservación cromática (§4), no por inspección visual.

## 4. Métricas

- **Espacio de medida:** OKLCh (alternativa: CIELCh si se requiere compatibilidad de herramientas). No usar HSV/HSL como métrica principal: su saturación no es perceptualmente uniforme y sobrevalora la asimetría azul/rojo.
- **Indicador principal — conservación cromática:**
  ```
  ρ_i = C(T_i) / C(T0)
  ```
  La etapa con mayor caída de ρ es la responsable primaria.
- **Indicador secundario:** ΔE (OKLab) respecto al blanco de referencia D65 en cada T_i.
- **Umbrales:** no se fijan a priori. Primero se mide el sistema actual (Fases 0–3); el criterio de aceptación se deriva de esas medidas (§6).

## 5. Correcciones candidatas (condicionadas al diagnóstico)

Ordenadas por probabilidad de aplicación; ninguna se implementa sin que la Fase 2 la señale:

| Diagnóstico | Corrección | Restricción |
|---|---|---|
| Caída de ρ en T2 | Reducir `tinteNucleo` o hacerlo dependiente del croma de la fuente | Mantener `tinteNucleoCarbono` intacto; actualizar tests dorados en el mismo commit |
| Caída de ρ en T1 con estrellas brillantes | Revisar `fraccionFlujo()`: si no alcanza 1 en brillantes, corregir la curva, no la saturación máxima | El principio 8 del informe queda invariante |
| Operaciones post-gamma detectadas | Reordenar: toda mezcla/saturación en RGB lineal; sRGB como última etapa | Alinear con la separación Capa física / Capa visual / Capa display del modelo de cúmulos |
| Caída de ρ en T5 (clipping) | Tone mapping con preservación de croma (compresión de L en OKLCh manteniendo h, C) | Solo si T0–T4 conservan croma y T5 lo pierde. No introducir antes |
| BP–RP de entrada ya neutro (Fase 1) | Ninguna corrección de render. Decisión §2: si se elige B (intrínseco), implementar desenrojecimiento como capa del simulador, análoga al realce de carbono | Documentar como decisión de modelo, no como fix |

**Explícitamente prohibido:** ganancia azul artificial, offsets por clase espectral para compensar la cadena, modificación de nodos de `GAIA_COLOR` sin evidencia de Fase 0, cambios simultáneos de varias palancas.

## 6. Criterios de aceptación

1. El informe de diagnóstico identifica la(s) etapa(s) responsable(s) con dato: «la etapa X concentra el N % de la pérdida de croma».
2. Tras la corrección, en el harness de Fase 3: ρ_T5 ≥ valor objetivo derivado de las medidas de línea base (a fijar tras Fase 3), para B a flujo 1× y 4×.
3. La secuencia B→azul, A→blanco azulado, F→blanco, G→amarillo, K→naranja, M→rojo es monótona en tono y verificable en el harness.
4. Los tests dorados existentes se actualizan en el mismo cambio que cualquier constante modificada; ningún test queda desactivado.
5. La validación no se limita a NGC 4755: se comprueba al menos un campo de bajo enrojecimiento para descartar sobresaturación inducida por calibrar contra un cúmulo enrojecido.
6. La arquitectura resultante mantiene la separación: `BitacoraGaiaColor` = color intrínseco/fuente única; `bitacora-gaia-render` = cuánto de ese color resulta observable; display = última etapa.

## 7. Trabajo diferido (fuera de alcance)

- Sustitución de `S = f(magnitud)` por `S = f(L_ret / L_adaptación)`: evolución arquitectónica válida, desproporcionada para este defecto. Se documenta como deuda.
- Modelo cromático escotópico/mesópico completo.
- Revisión de `bpRpPorTipo()` (dobles WDS): fuera del camino crítico salvo que Fase 0 revele defecto de tabla.

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| Corregir render cuando el problema es de entrada (extinción) | Fases 0–1 obligatorias antes de tocar render |
| Romper el rojo del carbono al ajustar la cadena azul | Harness incluye M y carbono; tests dorados como guardia |
| Confundir defecto con decisión estética | `tinteNucleo` se documenta como parámetro estético si se conserva; no se justifica como Purkinje |
| Sobreajuste a NGC 4755 | Criterio de aceptación 5 |

## 9. Entregables

1. Decisión documentada de semántica BP–RP (§2).
2. Script de instrumentación T0–T5 con salida OKLCh (reutilizable como test).
3. Harness 7 clases × 4 flujos integrado en `scripts/`.
4. Informe de diagnóstico con reparto porcentual de pérdida de croma por etapa.
5. Corrección mínima con tests dorados actualizados.
6. Nota de arquitectura si se detectan operaciones post-gamma.
