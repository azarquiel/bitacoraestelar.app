# Nada de parámetros estéticos para tapar discrepancias fotométricas

## Contexto

Cuando el render no se parece a lo que el observador recuerda, la salida barata es un mando: un
factor que apaga el halo, un suelo que impide que se apague del todo, una gamma que sube el
contraste. El repo ya pagó esa factura con `restaMaxFrac` y `remanenteMinFrac`, prótesis
numéricas que nacieron para cerrar un desajuste de flujo y acabaron decidiendo la fotometría.
En v7 la tentación reapareció en tres formas: D1 («el halo se ve demasiado grande»), D2 («el halo
no se atenúa») y D3 (los anillos de 47 Tuc). Dos de las tres no tenían la causa que se les
atribuía —D2 era un error de medida y D1 sigue sin causa—, y la tercera se arregló corrigiendo la
ley (la cola de la LF devolvía el bin entero), no compensándola.

## Decisión

Una discrepancia fotométrica se corrige en la ley que la produce. **No se introduce ningún
parámetro cuyo único criterio de ajuste sea el aspecto de la imagen.** Si no se encuentra la
causa, la discrepancia queda abierta y escrita —como D1— antes que tapada.

## Motivo

Un mando estético convierte un residuo medible en un residuo invisible: la imagen mejora, la
evidencia desaparece y el bug se hereda. Además destruye la única propiedad que hace útil al
modelo, que es que cada número tenga procedencia física; en cuanto un factor se ajusta «hasta que
se vea bien», el resto de la cadena deja de poder validarse contra nada.

## Consecuencias

- Iteraciones que se cierran sin tocar producción. En v7, tres de cinco etapas.
- Defectos que quedan abiertos con nombre (D1, el grano que nunca se pinta) en lugar de
  compensados.
- `test_disciplina_v7.js` §3 rechaza en la capa fotométrica no solo `restaMaxFrac` y
  `remanenteMinFrac` sino la **forma** del nombre: `fudge*`, `ajusteVisual`, `factorEstetico`,
  `boost*`, `realce*`, `gamma{Halo,Visual,Render}`. Una prótesis que vuelve con otra etiqueta
  también da rojo.

## Regla

Antes de añadir una constante al modelo hay que poder decir de dónde sale físicamente y con qué
medida se calibra. Si la respuesta es «se ajusta hasta que la imagen convence», no entra. La
capa perceptual (H2c, ADR-0001) es el único sitio donde el aspecto es criterio, y ahí se mide
contra observación de campo, no contra el gusto.
