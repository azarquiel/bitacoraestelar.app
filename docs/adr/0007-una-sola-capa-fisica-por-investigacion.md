# Una sola capa física por investigación de una discrepancia visual

## Contexto

El modelo de observación de cúmulos tiene cinco capas (población → resolución → muestreo →
fotometría → percepción) y una discrepancia visual puede nacer en cualquiera. En v7 se atacaron
tres defectos con una etapa por hipótesis y un solo cambio en producción: 26 líneas en `cola()`.
Eso permitió afirmar de D2 que era un error de medida y de D1 que no tiene la causa que se le
atribuía. Si E1 a E4 hubieran tocado a la vez la cadena fotométrica, el orden de anclaje, el
truncamiento de King y la cola de la LF, la imagen habría cambiado y no se sabría por qué.

## Decisión

Al investigar una discrepancia visual se modifica **una capa cada vez**. Se mide antes, se cambia
una sola ley, se vuelve a medir con el resto congelado y se cierra la etapa —confirmando el
cambio o refutando la hipótesis— antes de tocar la siguiente. Las hipótesis refutadas se
archivan por escrito para no volver a pagarlas.

## Motivo

Dos cambios simultáneos que juntos mejoran la imagen no dicen cuál de los dos era el defecto, y
uno de ellos puede estar compensando al otro: dos errores que se cancelan sobreviven a la
iteración y reaparecen en la siguiente configuración. Con una capa por etapa, cada resultado es
atribuible; sin ella, solo queda el aspecto de la imagen como criterio, y ese es el camino a
ADR-0004.

## Consecuencias

- Iteraciones más lentas y con más etapas que cierran sin tocar producción. Es un resultado, no
  un fracaso: lo que dejan es una batería que impide que el código deje de estar bien.
- Cada etapa necesita su medida previa (arnés) y su volcado. Quien arregla el arnés regenera sus
  volcados en el mismo commit, o el archivo pasa de evidencia a folclore.
- Un barrido debe incluir un assert de que el parámetro barrido **mueve algo**; si no, se está
  midiendo varias veces lo mismo (el eje del seeing, muerto por `Ω = max(beam, píxel)`).
- Los datos de referencia se archivan en el árbol con su procedencia al lado: un activo que solo
  vive en una rama borrada no existe.

## Regla

Un commit que investiga una discrepancia visual toca una sola capa. Si hace falta cambiar dos,
son dos etapas con su medida en medio, y la segunda no empieza hasta que la primera está cerrada
por escrito.
