# La ausencia manda cuando la máscara pisa un borde real

Al abrir el catálogo de planetarias a los objetos Abell (PR #138), el primer
caso real —PN A66 12, una cáscara de 37″ a 47″ de μ Orionis (G 4,7)— salió
**negro**: la máscara de la estrella, topada en `mascaraMaxAs` (60″ = 683 px de
un parche de 90″), borraba la nebulosa entera. Costó cuatro iteraciones llegar
al render honesto, y cada una falsó un supuesto que parecía firme. Este ADR
fija las reglas que quedaron.

## Lo que se midió

1. **El relleno «al cielo» del disco ancho es un 0 MEDIDO, no ausencia.** El
   comentario de `ps1QuitarEstrellas` prometía «el anclaje lo apaga, w cae a 0
   dentro y lo rellena (1−w)·perfil». La promesa tenía dos agujeros: (a)
   `ps1HaloActivo` estaba cerrado —interruptor maestro apagado y μProm de una
   compacta siempre más brillante que `haloMuFijo`—, así que no había perfil
   que rellenara nada; (b) aunque lo hubiera, la caja de `ps1PesoImagen` a
   caballo del borde de la máscara mantiene w alto (0,65 medido con datos=0 a
   +5,6″ del centro de A12): la mezcla hace `w·0 + (1−w)·perfil` y pierde el
   flujo justo en la franja — un anillo oscuro partiendo el objeto.

2. **Coser imagen y modelo de un objeto mayormente enmascarado pinta un
   remiendo.** Con NaN solo en lo enmascarado, el resultado era perfil redondo
   + creciente de imagen más brillante (contaminado por el ala de la estrella)
   + muescas de cielo entre ambos: un objeto partido en tres.

3. **El tope de máscara corta una extrapolación, no el ala.** La ley
   `ps1RadioMascaraAs` sin tope da 226″ para G 4,7: más que el parche entero.
   Todo lo «medido» que sobrevive alrededor del objeto es ala de la estrella,
   y con el objeto en NaN el anclaje le reparte **el presupuesto de luz del
   catálogo del objeto**: motitas brillantes con la luz de la nebulosa.

## Decidido

1. **Mordida = los datos exigen el perfil, por encima del interruptor.**
   `ps1MascaraMuerdeEscena`: máscara ancha (`rAs > rellenoPlanoMaxAs`) de
   fuente no conservada que pisa un componente de escena con **borde real**
   (`compacta`) fuerza `ps1HaloActivo` incluso con `haloExtrapolado: false`.
   El interruptor gobierna el halo VOLUNTARIO (extender el objeto más allá de
   la imagen); esto es relleno de ausencia: la imagen no cubre el objeto.

2. **Compacta pisada → su elipse entera es ausencia (NaN), tras todos los
   rellenos.** Ni cielo (0 medido que bloquea el relleno, regla que
   `ps1AnclarACatalogo` ya enunciaba) ni costura parcial (remiendo). El
   perfil pinta el objeto de una pieza con la fotometría de su fila:
   ADR 0013 llevado a su consecuencia — cuando la imagen no puede decir la
   morfología, la fila ES el modelo.

3. **Escena entera pisada → imagen entera del parche a ausencia.** Sin esto,
   el anclaje da la luz del objeto al ala de la estrella (motitas). La
   estrella la representa la capa de estrellas (glow y spikes); en el parche
   no queda medida legítima que conservar. Con componentes no pisados (una
   galaxia vecina) solo caen las elipses pisadas.

4. **Todo acotado a `compacta` (borde real: PN, SNR).** La mordida general
   cambiaba los difusos golden de M101/M104/M81: las reglas de fusión
   imagen/modelo de las galaxias están medidas y cerradas y no se reabren
   desde aquí. Si otra clase compacta sale negra o anillada junto a una
   estrella brillante, los sospechosos son su marca `compacta` en la escena y
   el relleno cielo-vs-NaN, no la rampa de opacidad.

## Consecuencias

- Junto a una estrella muy brillante, una compacta se ve como su modelo de
  catálogo (más compacta que en una placa profunda: las alas caen bajo el
  umbral H2c — ley de visión, no recorte). Es el render honesto disponible:
  la alternativa medida era negro, anillo o remiendo.
- La tubería tolera el NaN masivo por diseño: PSF restaura la máscara exacta,
  `ps1PesoImagen`/`ps1SoporteLocal` lo cuentan como 0, `ps1EscalaMezcla` lo
  salta y el pintado lo rellena vecino a vecino con `wv=0`.

Guardianes: `scripts/test_mascara_muerde_escena.js` (mordida, puerta del halo,
NaN por elipse / escena entera / caso mixto / galaxia intacta, y el relleno de
`ps1PintarParche` con y sin mordida) y `scripts/test_golden_difusas.js` (las
galaxias, bit a bit, no cambian).
