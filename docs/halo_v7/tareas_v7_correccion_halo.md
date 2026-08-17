# Tareas: corrección del halo de globulares — iteración v7

Rama: la de implementación del modelo de observación (Capas 1–3 + integración
H2c). Estado de partida: campo estadístico S1/S2 implementado; detectados tres
defectos visuales en producción.

**Herramientas obligatorias:**
- Cada etapa se implementa con el skill `/mattpocock-skills:implement`.
- Toda etapa que defina tests (todas salvo E0, y en E0 el arnés mismo) usa
  `/mattpocock-skills:tdd`: los tests se escriben ANTES que el código que los
  hace pasar. La filosofía TDD es el defecto de esta iteración, no la
  excepción.
- Al completar E5, ejecutar `/mattpocock-skills:code-review` sobre el conjunto
  de cambios de la iteración antes de considerar la puerta de merge.

**Puerta de merge:** E0–E2 son bloqueantes (sin cadena fotométrica honesta no
hay nada validable). E3–E5 completan la iteración; no fusionar con E5 sin
ejecutar.

**Orden NO negociable:** E0 → E1 → E2 → E3 → E4 → E5. Retocar perfil (E3) o
interpolación (E4) con la cadena fotométrica rota (E1/E2 pendientes) obligaría
a recalibrar todo de nuevo. Prohibido reordenar aunque un fix parezca "más
fácil".

---

## Defectos observados (referencia)

- **D1** — Halo exterior demasiado extenso y demasiado brillante (M13, 146×).
- **D2** — Al subir aumentos (146× → 514×), el fondo de cielo se atenúa
  correctamente (23.7 → 26.5 mag/arcsec²) pero el halo del cúmulo NO se
  atenúa: su contraste aparente crece con M, lo contrario de la física. El
  halo parece inmune a la pupila de salida.
- **D3** — En cúmulos brillantes y concentrados (47 Tuc) aparecen anillos
  concéntricos brillantes irreales.

Hipótesis de trabajo (a confirmar en E0, no asumir): D1 y D2 pueden compartir
causa raíz (el difuso del cúmulo no pasa por la misma cadena fotométrica que
el cielo, y/o re-anclaje tras atenuación). D3 tiene dos causas candidatas
excluyentes que E0 discrimina: escalones en el muestreo radial vs. banding de
cuantización a 8 bits.

---

## E0 · Arnés de diagnóstico — P0 [TDD sobre el propio arnés]

Convertir tres impresiones visuales en números ANTES de tocar el render.
Ningún cambio en código de producción en esta etapa.

**Implementación**
1. Extender el script de calibración para volcar, con semilla fija:
   a. μ(r) del difuso pintado, por anillos, en mag/arcsec², medido sobre el
      buffer Float32 ANTES del volcado a 8 bits.
   b. El factor de atenuación efectivo aplicado al difuso del cúmulo y el
      aplicado al fondo de cielo, POR SEPARADO, con su origen en el código
      (qué función lo produjo).
   c. Todo ello para M13 y 47 Tuc, a 146× y 514×, mismos parámetros de las
      capturas que documentan D1–D3.
2. **Punto de medida (tap) explícito y doble.** El arnés vuelca μ(r) en DOS
   taps de la cadena, etiquetados:
   - **Tap físico:** tras la atenuación de pupila de salida/transmisión
     (`dim`), ANTES de toda atenuación perceptual (`visibilidadDifusa`,
     sigmoides de Cmin). Aquí se verifican las leyes físicas (E1, escalado
     del grano).
   - **Tap perceptual:** tras las atenuaciones de Cmin, antes del display.
     Aquí se verifica solo fenomenología (E5), nunca igualdades numéricas.
   Confundir los taps invalida los tests de E1: la comparación
   Δμ_halo == Δμ_cielo solo es exigible en el tap físico.
3. Además de μ(r), volcar σ(r) del campo de grano (amplitud de la
   fluctuación) por anillos, en el tap físico, para el test de escalado de
   E1.
4. El volcado es determinista (semillas fijas) y se archiva como referencia
   de la iteración.

**Tests (escribir primero)**
1. El arnés produce salida idéntica en dos ejecuciones con la misma semilla.
2. El arnés mide correctamente un caso sintético conocido (inyectar un perfil
   analítico de prueba y recuperar su μ(r) con error < 0.01 mag).

**Aceptación**
- Los números reproducen los defectos: se espera Δμ_cielo ≈ 2.8 mag entre
  146× y 514×, y Δμ_halo ≈ 0 (D2 cuantificado).
- Para 47 Tuc, μ(r) del Float32 muestra escalones (→ causa de D3 es muestreo
  radial) o es suave (→ causa de D3 es cuantización en display). La causa
  queda identificada y anotada antes de pasar a E4.
- Cero diffs en código de producción.

---

## E1 · El difuso del cúmulo entra por la misma cadena fotométrica que el cielo — P0 [TDD]

Un solo cambio: el camino fotométrico del halo aplica el mismo factor de
pupila de salida y transmisión (`dim` de `ctxFotometrico()`) que el fondo de
cielo. No tocar perfil, ni muestreo radial, ni display en esta etapa.

**Implementación**
1. Localizar el punto donde el difuso del cúmulo recibe (o deja de recibir)
   la atenuación de pupila de salida; unificar con el camino del cielo.
2. Si el difuso del cúmulo cae hoy al else histórico (C_MAG) por falta de
   θ intrínseco, darle θ = 2·r_h circularizado (media geométrica de semiejes
   si hay elipticidad) y entrar por la rama H2c que usan las galaxias PS1.
   El else histórico queda intacto para quien ya lo usa.

**Tests (escribir primero)**
1. Invariancia del contraste físico de la MEDIA del difuso: al duplicar M
   (D fija), Δμ_halo == Δμ_cielo con tolerancia numérica estricta
   (≤ 0.01 mag), medido en el **tap físico** del arnés de E0 (tras `dim`,
   antes de toda atenuación perceptual). Parametrizar para 146×/514× y al
   menos otra pareja. NOTA: esta igualdad NO se exige en el tap perceptual
   ni tras `visibilidadDifusa` — ahí el halo debe apagarse más que el cielo
   al subir M (Cmin depende de la adaptación), y eso es comportamiento
   correcto, no bug.
2. Escalado físico del grano (ni invariante ni libre): σ²(r) medido en el
   tap físico escala con 1/Ω_beam(M) según la ley σ² = Σ(r)·S2/Ω_beam, con
   Ω_beam recalculado para cada M (la FWHM del ojo entra dividida por M).
   Tolerancia relativa ≤ 5% por anillo en 0.5·r_c ≤ r ≤ 3·r_c. Más aumentos
   ⇒ más varianza por elemento: es la física ("subir aumentos saca el
   grano"), y el test verifica la ley, no un aspecto.
3. El factor aplicado al difuso y al cielo proviene de la MISMA llamada a
   `ctxFotometrico()` (test de unidad sobre el origen, no solo sobre el
   valor: previene regresión por duplicación de la ley).

**Aceptación**
- A 514×, el halo se hunde con el cielo; sobrevive solo lo que Cmin permite.
- D2 desaparece en el volcado del arnés: Δμ_halo ≈ Δμ_cielo **en el tap
  físico**. La visibilidad del halo y del grano en el tap perceptual SÍ
  cambia con M — eso no es D2, es lo esperado.
- Ningún cambio en perfil, anillos ni display en el diff.

---

## E2 · Auditoría del orden muestrear → emparejar → anclar → atenuar — P0 [TDD]

Confirmar que ninguna normalización o anclaje se ejecuta DESPUÉS de una
atenuación. Si E0 mostró Δμ_halo ≈ 0 pese a que el código aplica `dim`, el
re-anclaje posterior es el culpable y este es el fix.

**Implementación**
1. Rastrear todos los puntos donde se calcula o recalcula el ancla
   fotométrica del difuso; verificar contra el orden canónico.
2. Si existe re-anclaje post-atenuación, moverlo antes de la atenuación (o
   eliminar el recálculo), sin introducir factores compensatorios.

**Tests (escribir primero)**
1. Test guardián del re-anclaje: con una atenuación forzada de factor 0.5
   inyectada en el pipeline, el flujo integrado pintado baja exactamente
   ×0.5 (tolerancia relativa ≤ 1e-9; comprobación estricta, no umbral
   agregado). Este test permanece en la batería de forma permanente.
2. El test de conservación fotométrica (∫I dΩ == F(V_int) ± 1%, sin cielo,
   ANTES de la capa perceptual) pasa en una rejilla de (D, M, seeing).

**Aceptación**
- El orden canónico es verificable por test, no por lectura de código.
- Si no había re-anclaje: la auditoría queda documentada con el test guardián
  igualmente en verde (la etapa no es opcional aunque el bug no exista).

---

## E3 · Perfil de King: truncamiento y normalización — P1 [TDD]

Con la cadena ya honesta, corregir las alas del perfil (D1).

**Implementación**
1. Verificar que el perfil de King incluye el término de truncamiento en r_t
   (la constante que resta el valor del perfil en r_t) y que la normalización
   del flujo total se hace sobre el perfil TRUNCADO, no sobre el infinito.
2. Añadir 47 Tuc a la tabla de perfiles de referencia (Trager, King &
   Djorgovski 1995) junto a M13, M15 y M4: es el caso extremo de
   concentración y el que exhibe D3.

**Tests (escribir primero)**
1. Integral numérica del perfil implementado == flujo total declarado
   (tolerancia ≤ 0.1%).
2. μ(r) del render contra Trager: residuo medio < 0.5 mag en
   0.5·r_c ≤ r ≤ 3·r_c para los cuatro cúmulos de referencia.
3. Las alas a r > 4·r_h quedan por debajo de cielo + Cmin en la
   configuración de la captura de D1 (test de visibilidad, con el arnés).

**Aceptación**
- D1 resuelto: el halo exterior termina donde la detectabilidad manda, no
  donde el perfil sin truncar quiera.
- Si E1–E2 ya habían resuelto D1 visualmente, esta etapa lo confirma con los
  tests igualmente (confirmación barata; no saltarla).

---

## E4 · Anillos de 47 Tuc: el fix que E0 señaló — P1 [TDD]

Implementar SOLO la rama que E0 identificó como causa. No implementar ambas
"por si acaso".

**Rama A — escalones en el muestreo radial (μ(r) del Float32 con codos):**
1. Interpolar en espacio μ (logarítmico en brillo), nunca lineal en flujo
   sobre malla logarítmica en r; usar interpolación monótona (PCHIP o lineal
   en μ).
2. Malla radial adaptativa al gradiente: paso ∝ 1/|dμ/dr|, densificando
   donde el perfil cae rápido (núcleos concentrados).

**Rama B — banding de cuantización (μ(r) del Float32 suave):**
1. Dithering de ±0.5 LSB (ruido azul u ordenado) en el volcado final a
   8 bits. Es Capa 5: estético, documentado como tal, y NO toca la cadena
   fotométrica (invariante 1).

**Tests (escribir primero)**
1. Test de suavidad: segunda diferencia de μ(r) acotada (sin escalones) en
   47 Tuc para 3 configuraciones; el test debe FALLAR con el código previo
   al fix (verificar en rojo antes de implementar).
2. Determinismo del dithering con semilla fija (solo rama B).
3. Los tests de E1–E3 siguen en verde (el fix no puede tocar fotometría).

**Aceptación**
- 47 Tuc sin anillos a inspección visual en 146×, 514× y una configuración
  intermedia.
- La causa descartada queda documentada en el commit (por qué no era la otra
  rama), para que ninguna iteración futura la "arregle" de nuevo.

---

## E5 · Matriz de regresión y cierre — P1

**Implementación**
1. Correr la matriz completa: M13, 47 Tuc y ω Cen × (3 aumentos) ×
   (2 cielos: 21.5 y 18.5 mag/arcsec²), con los volcados del arnés E0
   archivados como referencia de la iteración.
2. Ejecutar `/mattpocock-skills:code-review` sobre el diff completo de la
   iteración.

**Tests**
1. Toda la batería previa en verde (incluidos los guardianes nuevos de E2 y
   E4).
2. Verificación fenomenológica sobre los volcados (orden correcto de
   desaparición): a más aumentos, el halo se apaga antes que el núcleo; el
   grano desaparece antes que la mancha al empeorar el cielo; ningún cúmulo
   de la matriz muestra estructura anular.

**Aceptación**
- Matriz archivada y reproducible (semillas fijas).
- Code review sin hallazgos bloqueantes, o con sus fixes aplicados y
  re-revisados.

---

## Autocrítica post-implementación (obligatoria)

Tras completar E5 y el code review, la IA implementadora debe generar un
segundo documento (`informe_autocritica_v7.md`) siendo crítica con su propio
trabajo, que contenga como mínimo:

1. **Incongruencias detectadas** durante la implementación: entre este
   documento y el código real, entre etapas, o entre tests y criterios de
   aceptación. Incluir las resueltas sobre la marcha (y cómo) y las que
   quedan abiertas.
2. **Opciones de mejora encontradas** y NO implementadas (por estar fuera del
   alcance de la etapa), con estimación de coste/beneficio, para alimentar la
   siguiente iteración.
3. **Desviaciones conscientes** respecto a la letra de este documento, con su
   justificación (regla vigente: ante conflicto entre letra y criterio de
   aceptación, gana el criterio y se documenta).
4. **Sección de lecciones aprendidas** (ver plantilla abajo) con las lecciones
   NUEVAS de esta iteración, listas para incorporar a la memoria del
   proyecto.

Este informe no es opcional ni un trámite: es la entrada de la iteración v8.
Un informe vacío ("todo correcto, sin hallazgos") se considera sospechoso y
motivo de revisión manual.

---

## Lecciones aprendidas de esta conversación (incorporar a la memoria del proyecto)

Detectadas durante el diagnóstico de v7; añadir a la memoria junto a las de
iteraciones anteriores:

1. **La cadena fotométrica previa a percepción conserva el contraste
   superficial físico con los aumentos; las capas perceptuales lo modulan de
   forma monótona y con leyes conocidas.** Un componente que GANA contraste
   al subir M tiene un bug seguro (ninguna capa legítima produce eso); un
   componente cuya variación no siga la ley de su capa (dim físico igual
   para todos; σ² del grano ∝ 1/Ω_beam(M); atenuación Cmin dependiente de
   adaptación) también. El test de humo es comparar cada variación con la
   ley de su capa EN SU TAP, no exigir invariancia genérica: la invariancia
   solo aplica al contraste de la media en el tap físico.
1b. **Distinguir "físicamente invariante" de "perceptualmente variable" es
   parte de la especificación del test, no un detalle.** La primera versión
   del test de E1 no fijaba el punto de medida; medido tras la atenuación
   perceptual habría fallado legítimamente y el fix natural habría sido
   romper el test o la física. Todo test sobre la cadena debe declarar su
   tap. (Lección surgida de revisión crítica ANTES de implementar: el coste
   de la imprecisión fue cero. Ese es el momento barato de cazarlas.)
2. **Un panel de datos honesto vale más que la imagen.** D2 era invisible
   mirando una sola captura y evidente comparando "fondo en ocular" entre
   dos: 2.8 mag de atenuación en el cielo y 0 en el halo. Mantener los
   indicadores numéricos del panel sincronizados con la cadena real es parte
   del sistema de diagnóstico, no cosmética de UI.
3. **Instrumentar antes de corregir.** Tres síntomas visuales podían ser
   entre uno y cuatro bugs; sin el arnés (E0) cualquier fix era a ciegas y
   podía enmascarar la causa real compensándola. Regla: ningún fix visual
   sin número que lo cuantifique antes y después.
4. **Los cúmulos extremos son los tests, no las excepciones.** 47 Tuc
   (concentración extrema) y ω Cen (tamaño extremo) revelan defectos que M13
   perdona (gradientes suaves, tamaño medio). Toda matriz de validación debe
   incluir los extremos del catálogo, no solo el caso canónico.
5. **Un defecto "estético" puede tener dos causas de capas distintas** (D3:
   muestreo radial en Capa 3 vs. cuantización en Capa 5), y el fix es
   diferente en cada caso. Discriminar la capa ANTES de implementar: mirar el
   Float32 separa las hipótesis en un minuto.

## Salvaguardas contra la repetición de errores

Mecanismos concretos (no solo advertencias) que esta iteración deja
instalados:

- **Test guardián de re-anclaje** (E2, permanente): atenuación ×0.5 ⇒ flujo
  ×0.5, estricto. Hace imposible reintroducir silenciosamente el fallo nº 2
  histórico ("recompensar atenuación re-anclando").
- **Test de invariancia de contraste con M en el tap físico** (E1,
  permanente): la media del difuso y el cielo se atenúan igual antes de
  percepción. Captura cualquier futura bifurcación de la cadena fotométrica
  entre componentes, sin falsos positivos por la modulación perceptual
  legítima (que se mide en otro tap).
- **Test de escalado del grano** (E1, permanente): σ² ∝ 1/Ω_beam(M) por ley,
  no por aspecto. Impide tanto un grano "congelado" con M (bug de cadena)
  como un grano libre recalibrado a ojo (perilla encubierta).
- **Test de origen único de la ley** (E1): el factor del difuso y el del
  cielo deben salir de la misma llamada; previene la deriva hacia "dos leyes
  de detección", raíz de bugs ya registrada en la memoria.
- **Test de suavidad de μ(r)** (E4, permanente): segunda diferencia acotada;
  hace verificable el invariante 7 (sin discontinuidades espaciales) en vez
  de confiarlo a la disciplina.
- **Regla de proceso**: prohibido añadir factores compensatorios a un
  componente sin haber cuantificado antes (arnés) si el desajuste está en ese
  componente o en su referencia. Un factor así sería `remanenteMinFrac`
  renacido con otro nombre.
- **Regla de proceso**: los defectos se cierran con la causa identificada y
  la alternativa descartada documentada en el commit (E4), para no reabrir
  hipótesis ya falsadas en iteraciones futuras — no caer en bucles exige
  registrar también lo que NO era.
