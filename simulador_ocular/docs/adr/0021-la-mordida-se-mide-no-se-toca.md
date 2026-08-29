# La mordida se mide, no se toca

Enmienda el ADR 0017, que fijó qué hacer cuando una máscara ancha pisa un borde
real. Lo que 0017 no fijó es **cuándo** se considera pisado un objeto: dejó un
test binario de contacto —radios elípticos sumados— que basta para el caso que
lo motivó (Abell 12 bajo μ Orionis) y dispara de más en cuanto la estrella se
aleja un poco.

El síntoma llegó por NGC 7008: se pintaba como una mancha exponencial redonda
teniendo parche de Pan-STARRS bueno. La causa medida está en
`docs/notas/ngc7008-render-planetarias.md`: una estrella de G 9,21 a 54,5″ del
centro genera una máscara de 55,9″ que toca la elipse de 42,9″, y el contacto
mandaba el parche entero —el 100 % de sus píxeles— a ausencia.

## Lo que se midió

1. **El radio de máscara está anclado al fondo del stack, no al objeto.**
   `ps1RadioMascaraAs` usa `mascaraMagRef = 22`, o sea «dónde deja el ala de
   verse sobre cielo vacío». Sobre cielo vacío 56″ es correcto y está medido
   (19 031 estrellas apiladas, α = 2,98). Encima de una nebulosa brillante no:
   el ala deja de mandar mucho antes. En el parche de NGC 7008, los píxeles bajo
   esa máscara dan 1967 DN sobre cielo contra 2258 DN fuera de ella —un −13 %,
   del orden de la asimetría propia del objeto—. Son nebulosa, no ala.

2. **El contacto no distingue tapar de rozar.** Sobre las 100 filas `PN` con
   Dec > −30° del catálogo, el contacto marca ocho objetos. La fracción de la
   elipse realmente cubierta los parte en dos grupos sin zona gris: NGC 7026 y
   IC 5117 al 100 %, Abell 12 al 79,8 %, contra NGC 7008 al 43,6 %, NGC 7048 al
   34,0 % y NGC 6578, Abell 33 y Abell 72 por debajo del 9 %.

3. **Los tres remedios de 0017 son remedios de un objeto TAPADO.** El anillo
   oscuro del 0 medido, el remiendo de tres piezas y las motitas del anclaje
   aparecen porque queda poca imagen legítima. Con el objeto cubierto en un
   40 % no hay tal cosa: hay imagen de sobra y lo que sobra es la máscara.

## Decidido

1. **La mordida es una fracción, no un contacto.** `ps1CoberturaMordida` mide
   qué parte de la elipse de cada componente compacto tapan los discos anchos de
   fuentes no conservadas, y el veredicto es `>= PS1.mordidaCobMin` (0,6, entre
   los dos grupos medidos y con margen a ambos lados). Una sola ley para sus dos
   consumidores: la puerta del halo (`ps1MascaraMuerdeEscena`) y el NaN por
   elipse de `ps1QuitarEstrellas`. Se muestrea en rejilla de 64×64 en vez de
   resolver la lente exacta: el umbral está lejos de los extremos y hay discos
   que pueden solaparse entre sí; la rejilla acierta al 1 % contra el área
   analítica, y eso lo guarda un test.

2. **Por encima del umbral, el ADR 0017 entero sigue en pie.** Elipse a NaN,
   escena entera a NaN si todos sus componentes están pisados, halo obligatorio
   por encima del interruptor. Abell 12, NGC 7026 e IC 5117 se pintan hoy
   exactamente como antes de esta enmienda.

3. **Por debajo del umbral la respuesta ya no es el perfil: es conservar la
   imagen.** La máscara ancha se recorta en el borde real del componente. Una
   máscara que nace FUERA de la escena no borra píxeles que están DENTRO de
   ella: es el mismo principio que ya conservaba entera a la fuente de dentro
   (`ps1FuenteEnEscena`), aplicado al disco en vez de al centro. Fuera del
   objeto el disco sigue yendo al cielo, que es la arquitectura medida de las
   galaxias.

4. **El recorte es solo para discos ANCHOS.** Una máscara estrecha dentro del
   objeto se sigue quitando y rellenando por isofotas: eso no borra el objeto,
   lo cose, y es como se quitan las estrellas de campo desde siempre.

5. **Nada de esto toca las galaxias.** Sigue acotado a `compacta` (borde real:
   PN, SNR), como en 0017: las reglas de fusión imagen/modelo de las galaxias
   están medidas y cerradas y no se reabren desde aquí.

## Consecuencias

- NGC 7008 y otras cuatro planetarias (NGC 7048, NGC 6578, Abell 33, Abell 72)
  pasan de pintarse con su fila de catálogo a pintarse con su imagen: el 100 %
  del interior del borde real, sin costura y sin halo extrapolado.
- Queda una discrepancia conocida y **no** resuelta aquí: la fila de NGC 7008
  dice `b/a = 1`, `PA = 0` porque OpenNGC no trae `MinAx` ni `PosAng`, y sobre
  la imagen sale b/a ≈ 0,63 y PA ≈ 17°. Mientras haya parche, manda la imagen y
  la fila solo fija el presupuesto de luz; sin parche, el objeto sale redondo.
  Corregirlo es cambiar la fuente de `gen_nebulosas.py`, no editar el generado.
- Sigue en pie la otra discrepancia: un exponencial no puede representar una
  cáscara (medido en NGC 7008: centro 2,8× de más, borde 6,4× de más). Eso solo
  importa donde no hay imagen, y por el ADR 0013 arreglarlo es una conversación
  sobre el esquema del catálogo —una cáscara necesita un radio interior que la
  fila no guarda—, no sobre añadir ramas al render.

Guardianes: `scripts/test_mascara_muerde_escena.js` (la cobertura contra el área
de la lente circular exacta, el umbral, el recorte del disco ancho, y todo lo
que ya guardaba del ADR 0017) y `scripts/test_golden_difusas.js` (las galaxias,
bit a bit, no cambian).
