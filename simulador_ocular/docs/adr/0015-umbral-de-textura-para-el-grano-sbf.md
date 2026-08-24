# El grano SBF de los globulares tiene ley de umbral propia, no Cmin

El velo de un cúmulo globular no es una mancha tenue: en el núcleo de M13 con
200 mm hay 0,41 estrellas efectivas por elemento de resolución (N_ef = ⟨I⟩²/σ²,
régimen SBF de Tonry & Schneider 1988) y el contraste RMS de la granulación vale
entre el 88 % y el 340 % del fondo local (`simulador_ocular/docs/experimentos/velo_granularidad.md`).
La tarea visual «¿esto está moteado o es liso?» no es la que modela `Cmin`, que
es una ley de detección de mancha uniforme: aplicada a la textura la deja 24–34
veces bajo umbral y ninguna escala de integración entre 0,6″ y 100″ pasa de
0,042 (`simulador_ocular/docs/experimentos/escala_grano.md`). El experimento visual
(`simulador_ocular/docs/experimentos/experimento_sgrano.md`) confirmó que la señal granular existe y que el
detector actual la suprime entera, pero también que encenderla con una perilla
(`sGrano`) no reproduce la observación: la textura salía invariante con el
aumento y relativamente más fuerte fuera que dentro.

La búsqueda bibliográfica (`simulador_ocular/docs/referencias/deteccion_textura_bibliografia.md`)
cerró la pregunta de fondo: **no existe en literatura primaria una ley cerrada o
tabulada de detección de textura a luminancias escotópicas**. Lo más cercano y
utilizable es el marco de Rovamo–Mustonen–Näsänen (Vision Research 1992–94):
CSF como banco de canales más detector de filtro adaptado, validado hasta baja
iluminancia retiniana, con todas las entradas mapeables a las que el render ya
tiene. Ese marco predice además dependencia del aumento: el grano de ~1″ cae a
≈30 c/deg retinianos a 61× (fuera de la CSF escotópica, cuyo corte está en pocos
c/deg según Van Nes & Bouman 1967) y a ≈7 c/deg a 250× — entra en banda al subir
el aumento, que es la transición que reportan los observadores.

**Decidido:**

1. **Criterio de éxito: la transición observacional.** La ley se construye para
   reproducir nebuloso→moteado→resuelto con el aumento; que el núcleo a 61×
   deje de ser una mancha lisa es consecuencia, no objetivo. Un tratamiento que
   mejore el aspecto sin la transición es el parámetro estético que la ADR 0004
   prohíbe.

2. **Forma: ley escalar a frecuencia única, marco Rovamo, K calibrado.** El
   estímulo es de banda estrecha (una escala de grano en el cielo → una
   frecuencia retiniana por aumento), así que no hay banco de canales: se evalúa
   d′ con la CSF escotópica/mesópica en f = f(θ_grano, M) y la iluminancia
   retiniana vía pupila de salida, contra un criterio K anclado en campo. Mismo
   precedente que H2c: forma de literatura, una constante propia. RMS contra
   Cmin queda descartado también como estadístico (Burgess 1999): el detector es
   energía filtrada, no contraste por píxel.

3. **El aumento entra SOLO por la ley de umbral.** La señal física no se toca:
   ni `dI` ni la escala del grano dependen del ocular. Las condiciones 1 y 2 del
   pliego de `exp_sgrano.md` (decaimiento hacia fuera, respuesta al aumento)
   pasan de requisitos de diseño a **tests de aceptación**: si la ley no las
   produce sola —el halo con N_ef = 0,07 debe caer bajo umbral por sí mismo—,
   la ley queda falsada; no se parchea con decaimientos a mano.

4. **Salida psicométrica, no puerta binaria.** El render recibe
   P(ver) = 1 − exp(−(d′/K)^β) (Quick 1974, β ≈ 3,5 de literatura), evaluada por
   anillo radial. Una puerta binaria fabricaría un anillo visible en el radio de
   cruce, un artefacto del tipo que el punto 6 prohíbe.

5. **Conservación de flujo como invariante duro.** El recorte a cero (50–70 %
   de píxeles, +2–7 % de luz inventada, medido en `exp_sgrano.md`) se descuenta
   con renormalización por anillo: flujo con grano = flujo sin grano, con test
   en la suite bajo la disciplina de la ADR 0003. Nada de tolerancias
   declaradas: el exceso crece con el aumento y sesgaría las comparaciones.

6. **El artefacto de malla es bloqueante y se resuelve en el generador.** Las
   cadenas y anillos del interpolado de `granoEn` impiden encender el grano en
   producción hasta que el generador produzca textura sin estructura de malla.
   Test de aceptación: la comparación a ×6 que destapó el artefacto.

7. **Calibración prerregistrada.** Un solo parámetro libre (K; β fijo). Ancla:
   M13 a 200 mm, primera rotura del núcleo a 120× (observación propia). Listones
   escritos antes de implementar: 61× liso en todo el perfil, progresión a
   173×/250×, halo sin moteado, y los casos del banco del 18″ (registros propios
   detallados) más la literatura de observador amateur —no revisada por pares,
   marcada como tal— como contraste. Si los listones no pasan, la ley se
   descarta con medida; la única vía de escape prevista es cambiar el
   estadístico a suma Minkowski sobre la distribución (los picos al +800 % del
   fondo podrían dominar sobre la energía), nunca añadir términos ni retocar β.

8. **Alcance: solo globulares.** La ley vive en la capa de cúmulos. El grano SBF
   de galaxias ya tiene veredicto propio (invisible por ley) y los abiertos, si
   algún día la necesitan, la generalizarán con su propio banco.

Lo que esto NO es: una perilla `sGrano` que calibrar —eso ya se probó y falló—
ni una promesa de que la textura se verá: si la calibración prerregistrada
falsea la ley, el resultado es apagarla con medida y documentarlo, como pasó
con los dos ejes de Gaia (ADR 0012 de listones).
