# El brillo de una estrella es umbral, no contraste

El campo de un cúmulo abierto salía apagado respecto a las notas de observación,
y la única palanca que lo animaba era subir el SQM —falsear la contaminación
lumínica—. Medido sobre NGC 1245 / NGC 1664 / NGC 2266 (Gaia DR3 real), el
diagnóstico apuntó al alpha del disco: `(mlim − g)/rangoBrillo` es un margen de
DETECTABILIDAD, no un brillo, y el blanco puro cae en `g = mlim − 11,5`, una
magnitud que no existe en un cúmulo. Parecía obvio arreglarlo pintando el disco
por la cadena fotométrica común, igual que todo lo demás:
`valorDeFlujo(F_estrella, Fref, rango)`.

Se implementó tras `CFG.alfaPorFlujo` (rama B) y **es incorrecta**. Este ADR fija
por qué, para no volver a intentarlo.

## Lo que se midió

NGC 1664, Ethos 13 mm (100°), sqm 21,5:

| | VISAC 200L (200 mm, 138x) | Stargate 18" (458 mm, 158x) |
|---|---|---|
| luz recogida | 1,00 | 5,24× (+1,80 mag) |
| mlim | 14,96 | 16,24 |
| radio del disco (g 7,46) | 9,43″ | 13,50″ |
| alpha rama A (rampa) | 0,653 | **0,763** |
| alpha rama B (flujo) | 0,646 | **0,578** |

Con la ley de flujo el 18" pinta la estrella **más apagada** que el 8".

## Las tres reglas que salen de ahí

1. **A igualdad de aumentos, el contraste estrella/cielo NO depende de la
   apertura.** Más apertura = pupila de salida mayor = estrella y fondo suben
   los dos igual. La ganancia real del tubo grande es de ILUMINANCIA RETINAL
   ABSOLUTA: un efecto de UMBRAL y adaptación, no de contraste. En este código
   el umbral es `mlim` (y para lo extenso, `Cmin`). Cualquier ley del alpha de
   estrella que no mire un umbral es ciega a la apertura por construcción.

2. **La apertura entra en el render por DOS canales, y el segundo es el
   tamaño.** `sueloEstrella` lleva `factorApertura = (D/Dref)²`: el tubo grande
   dibuja un disco mayor (9,43″ → 13,50″). Una ley que reparta el flujo sobre el
   disco DIBUJADO divide justo por el D² que ese disco ya representa, y lo
   cancela. Antes de meter un área en una ley, comprobar qué lleva ya dentro.

3. **La rampa anclada a mlim ya era la ley de flujo sobre umbral.** En régimen
   brillante `valorDeFlujo(F_estrella) − valorDeFlujo(F_límite) ∝ (mlim − g)`:
   la rama A es exactamente «flujo por encima del umbral» con la pendiente de la
   cadena. El anclaje a mlim nunca fue el error. Lo que sí queda por revisar es
   la PENDIENTE (`rangoBrillo` = 11,5 mag, compartido con `flujoDeValor`) y la
   falta de saturación: por eso ninguna estrella de cúmulo llega al blanco.

## Estado

`CFG.alfaPorFlujo` queda en `false` (rama A en producción). La rama B se
conserva como banco de comparación, no como candidata.

Guardián: `scripts/test_alfa_apertura.js` — invariante I1, más apertura pinta la
estrella más brillante. Falla con la rama B
(`BITACORA_ALFA_FLUJO=1 node scripts/test_alfa_apertura.js`), que es la prueba de
que el test discrimina. I2 vigila el canal del tamaño; I3, que un cielo mejor no
apague la estrella.

Harness de medida: `scripts/harness_alfa_estrellas.js` (A vs B por estrella,
sensibilidad al SQM, y `--saturacion` para el núcleo de un globular con
`lighter`).
