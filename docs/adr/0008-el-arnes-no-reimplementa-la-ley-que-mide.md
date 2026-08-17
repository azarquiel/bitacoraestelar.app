# El arnés no reimplementa la ley que mide

## Contexto

Ha pasado dos veces con el mismo modelo y con dos síntomas distintos.

En v7, `harness_halo_v7.js` volvía a llamar a `ctxFotometrico()` por su cuenta para anotar el
`Cmin` del halo. Como no le pasaba `theta`, la llamada salía por la rama `C_MAG` y el volcado
archivaba el `Cmin` de una ley que producción ya no usaba: 2,02e-1 donde el render veía 4,91e-1.
Durante toda una iteración se creyó estar mirando el umbral del halo.

En v8, `matriz_m13.js` calculaba «cuánto le falta al grano para verse» con su propia copia de la
razón σ/umbral. Cuando la ley del grano pasó a juzgarse en la escala de integración, la matriz
leyó del render el umbral **nuevo** y siguió usando la amplitud **vieja**: imprimía
`grano/umbral = 1,0` y `s_grano = 0,000` en la misma fila —dos leyes distintas dentro de la misma
cuenta— y su assert de estado saltó con un número inventado (174,5 %) que no medía nada.

## Decisión

Un arnés, una matriz o un test **leen** del resultado de producción las magnitudes derivadas de
una ley; no las vuelven a calcular. Si una magnitud hace falta fuera y producción no la devuelve,
se **expone desde producción** (como `res.cGrano`, `res.thGranoAs`, `res.atenGrano`) antes que
copiarla.

La excepción es explícita y se marca: una reimplementación **a propósito** para contrastar la ley
contra una forma cerrada independiente —`test_grano_sbf.js` G4 recalcula `Σ·S1` y `√(Σ·S2/Ω)`
desde `pob` justo para comprobar que la tabla es esas dos cosas—. Eso es un contraste, no una
lectura, y se escribe en el comentario que lo es.

## Motivo

Una copia de la ley no envejece a la vez que la ley. Mientras las dos coinciden, la copia no
aporta nada; en cuanto dejan de coincidir, el arnés informa de un modelo que no existe, y lo hace
con la autoridad de un número medido. Los dos casos anteriores costaron una iteración cada uno:
uno archivó un volcado falso, el otro puso rojo un guardián sano.

## Consecuencias

- Producción devuelve algo más de lo que necesita para dibujar. Es barato: son campos en el
  objeto que ya se devuelve, no una API nueva.
- Quien cambia una ley no tiene que ir a buscar sus copias por los `scripts/`. Si hay una copia,
  se ve porque el test la declara como contraste.
- Quien toca el arnés regenera sus volcados en el mismo commit (ADR-0007), y ahora además
  comprueba que no ha dejado una copia detrás.

## Regla

Si un script bajo `scripts/` calcula un número que producción ya sabe calcular, o lo lee del
resultado, o declara por escrito que lo está contrastando a propósito. No hay tercera opción.
