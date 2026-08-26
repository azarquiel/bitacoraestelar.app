# La pendiente del alpha de estrella va separada del rango de la cadena

Continuación del ADR 0018 («El brillo de una estrella es umbral, no
contraste»), que dejó abierto el motivo real de que un cúmulo abierto salga
apagado: no el ANCLAJE a `mlim` (correcto), sino la PENDIENTE.
`CFG.rangoBrillo = FOT.SB_NEGRO − FOT.SB_BLANCO = 11,5` reparte el alpha de 0 a
1 sobre 11,5 magnitudes, así que el blanco cae en `g = mlim − 11,5`, magnitud
que no existe en un cúmulo.

## Lo primero que hubo que entender: el alpha no es el nivel en pantalla

La capa de estrellas se escribe como valor 0-255 y `pintarFot` la vuelve a leer
como FLUJO —`flujoDeValor(v, c.Fref, c.rango)`—, lo suma a las capas difusas y
mapea el total con `valorDeFlujo(F, c.FcieloPintado, c.rango)`. El alpha es una
CODIFICACIÓN intermedia, no el gris final.

De ahí sale la trampa, y es una trampa cara: **si la lectura usara la misma
pendiente con la que se pintó, las dos conversiones serían inversas exactas y la
pendiente se cancelaría**. Con `alpha = Δmag/k` y lectura con la misma `k`, el
flujo codificado queda `Fref·(10^(0,4·Δmag) − 1)` para cualquier `k`: mismo
flujo, mismo píxel. Cambiar la pendiente y «arreglar» la lectura para que
cuadre no aclara ni un nivel — solo adelanta el recorte de las brillantes, que
es empeorar. Medido en `test_alfa_magblanco.js` T2 (178,7 = 178,7).

Esa era justo la corrección que parecía obligatoria al leer el comentario de
`rangoBrillo`, donde 12 contra 11,5 está documentado como bug por descuadre.
Aquí el descuadre es el mecanismo, no el fallo.

## La decisión

`CFG.magBlanco` — cuántas magnitudes por debajo de `mlim` pintan blanco — con
nombre propio y separado de `CFG.rangoBrillo`, que sigue siendo el rango de la
CADENA. `pintarFot` **no cambia**: sigue leyendo con `c.rango` fijo.

Con la lectura anclada, el flujo codificado pasa a ser
`Fref·(10^(0,4·Δmag·c.rango/magBlanco) − 1)` y el nivel sobre el fondo va
~como `255·Δmag/magBlanco`. Bajar `magBlanco` aclara todo el campo de estrellas.

Es un estirado deliberado de contraste sobre la capa de estrellas, y se sostiene
en que una FUENTE PUNTUAL no es brillo superficial: las 11,5 magnitudes de
`c.rango` son el rango dinámico de la pantalla para lo extenso, y no hay razón
para que una estrella tenga que estar 11,5 mag sobre el cielo para verse blanca.

## Lo que cuesta, medido

1. **Disco y aureola dejan de estar en la misma escala de flujo.**
   `alfaAureola` usa `10^(-0,4g)` directo, sin rampa. Con
   `magBlanco < rangoBrillo` el disco estira y la aureola no. En cúmulos
   abiertos no muerde (la aureola queda bajo el corte 0,004, ADR 0018); en
   estrellas brillantes tipo Albireo sí.
2. **Saturación.** Por debajo del margen `mlim − g` de la más brillante, esa
   estrella recorta a 1 y deja de responder a la apertura: ahí falla el guardián
   `test_alfa_apertura.js` (I1), y con razón.

## El barrido

`node scripts/harness_alfa_estrellas.js <objeto> <D> <aumentos> <afov> <sqm> --blanco`
imprime el NIVEL EN PANTALLA por estrella (no el alpha) y cuántas saturan.
NGC 1664, Ethos 13 mm, sqm 21,5, estrella más brillante (g 7,46):

| `magBlanco` | VISAC 200L (138x) | Stargate 18" (158x) | saturadas (18") |
|---|---|---|---|
| 11,5 (defecto) | 178,7 | 210,6 | 0 |
| 10 | 203,7 | 239,8 | 0 |
| 9 | 224,9 | 255 (recorte de pantalla) | 0 |
| 8 | 251,5 | 255 | 1 |
| 6 | 255 | 255 | 9 |

**10 es el máximo aclarado que no recorta la más brillante ni con el 18".**
Por debajo de 9 el 18" empieza a quemar el pico, y bajo 8 se quema el orden de
brillos del cúmulo entero. Igual en NGC 1245.

## Estado

`magBlanco` **nace valiendo `rangoBrillo` (11,5): producción no se mueve ni un
bit** y los golden siguen idénticos. El valor definitivo es una calibración
perceptual contra notas de observación reales, no una constante física, y esa
comparación la hace el observador delante de la pantalla: el barrido de arriba
es la entrada para esa decisión, no su sustituto.

Guardianes: `scripts/test_alfa_magblanco.js` (T2 fija la trampa de la
cancelación; T4, el suelo por saturación) y `scripts/test_alfa_apertura.js`
(sin cambios: cualquier `magBlanco` que se adopte tiene que seguir pasándolo).
