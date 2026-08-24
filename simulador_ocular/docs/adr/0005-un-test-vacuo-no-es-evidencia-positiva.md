# Un test vacuo no es evidencia positiva

## Contexto

En v7 dos versiones seguidas del test de E1 pasaron sin comprobar nada. La primera comparaba
«anillos con la misma `m_res`» a distintos aumentos: no existe ninguno, así que el bucle iteraba
sobre un conjunto vacío y la etapa se dio por cerrada en verde. La segunda medía el artefacto del
promediado radial en vez de la ley. El mismo patrón apareció en E2 (un pin que no ataba nada
porque el corte lo ponía otro término) y en el eje del seeing de la matriz, muerto porque el
píxel tapaba el beam. En los tres casos el verde era indistinguible de un verde legítimo.

## Decisión

Una corrida que termina sin ejecutar ninguna comprobación se clasifica **vacua**, nunca superada,
y tiñe la suite de rojo igual que un fallo. `scripts/suite_halo_v7.js` implementa las tres
salidas —superado, fallido, vacuo— contando los asserts que la corrida imprimió de verdad, no los
que hay escritos en el fichero.

## Motivo

El coste de un test vacuo es peor que el de no tener test: consume el presupuesto de confianza de
uno real. Y no se detecta leyendo el código, porque el código parece correcto; solo se ve
contando lo que llegó a ejecutarse. Contar la salida, y no el fuente, es lo que distingue un
bucle que corrió 40 veces de uno que corrió cero.

## Consecuencias

- Todo assert deja rastro en la salida (`ok <etiqueta>`); un test que no imprime no cuenta.
- Los bucles sobre conjuntos filtrados llevan su propio guardián de cardinalidad
  (`usados > 5`, `nodos >= 10`, `vistos >= 4`), que es la forma barata de no ser vacuo.
- Un criterio de aceptación que se cumple sobre el conjunto vacío —como «el grano desaparece
  antes que la mancha» en E5, donde el grano no se pinta nunca— **no está verificado**, y se dice
  así en el informe.
- Un test que nace verde demuestra menos que uno que se pone verde; cuando una etapa cierra sin
  cambio en producción, se declara.

## Regla

Antes de dar una etapa por cerrada, romper a propósito el código que el test dice vigilar y
comprobar que el test se entera. Si no se entera, el test no es evidencia de nada y no se cita
como tal.
