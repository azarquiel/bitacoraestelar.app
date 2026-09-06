# La costura del parche en nebulosas que lo llenan (#210)

Medida del 2026-09-06 sobre NGC 6888 a {457 mm · 100× · SQM 21,2}, con el
montaje de producción (`lib_parche_produccion` + `ps1PintarParche`) y la Gaia
pineada `gaia_ngc6888.csv` (g ≤ 20). Harness: `scripts/harness_costura_parche.js`.

## Qué se mide

Densidad de estrellas **visibles**, en estrellas/arcmin²:

- **dentro**: fuentes Gaia dentro del recorte cuyo píxel del lienzo difuso
  destaca sobre su anillo local (pico ≥ 1,5 × mediana del anillo de 2–4 px,
  flujo > 0), menos el **nulo**: el mismo detector desplazado 25″ de cada
  fuente, que cuenta lo que destaca sin estrella (filamento, grano del anclaje).
- **fuera**: fuentes Gaia del anillo de igual área pegado al recorte con
  g < magLimite, que es lo que `dibujar()` pinta como sprite.
- **control**: fuentes Gaia con g < magLimite dentro del recorte: lo que se
  vería dentro si dentro y fuera obedecieran la misma ley.

**Listón, fijado antes de medir:** no hay costura si 0,67 ≤ dentro/fuera ≤ 1,5.
Poisson con ~100 cuentas es ±10 %; el resto del margen es para el gradiente
real de densidad estelar en el Cisne.

## Medida previa contra main

| | dentro (est/arcmin²) | fuera | dentro/fuera | veredicto |
|---|---|---|---|---|
| main | 6,55 | 1,14 | **5,8** | costura |

La escena μ=25 cubre el 94,2 % del parche, así que la protección de escena
conserva dentro **todas** las fuentes de la imagen (hasta g≈23) mientras fuera
los sprites se cortan en la magnitud límite del equipo (15,65). El trabajo de
escena μ=25 no la tapó: la costura sigue. El nulo del detector es alto (3846
sobre 4907) porque a 35 estrellas/arcmin² el desplazamiento de 25″ cae muchas
veces junto a otra estrella; el 5,8 es por tanto una cota **inferior** de la
costura en main.

control/fuera = 1,65: la densidad de las brillantes ya es mayor dentro que en
el anillo. Es el suelo del campo, no del render, y ningún cambio del pintado
lo baja.

## Las dos vías

**A · Igualar la profundidad del grano a la magnitud límite del equipo dentro
de la escena.** Una fuente Gaia de dentro de la escena con g > mlim se
enmascara y se rellena con su anillo inmediato (`ps1FondoAlrededor`), no con la
isofota del objeto entero, que en una nebulosa filamentosa no dice nada del
filamento local. Las de g ≤ mlim se conservan como antes y la capa de estrellas
las sigue excluyendo; las quitadas vuelven a la capa de estrellas, donde ya son
niebla sub-mlim (ADR 0022). Sin `mlim` (golden, tests sintéticos) nada cambia.

| | dentro | fuera | dentro/fuera | veredicto |
|---|---|---|---|---|
| vía A | 1,17 | 1,14 | **1,03** | sin costura |

El residuo de las débiles tras la máscara, en la rejilla del parche, es de
~2σ del cielo (130 de 5270 quedan por encima de 3σ). El grano no catalogado
(picos sin Gaia a ≤ 2 px, g > 20) queda en 0,28/arcmin² con o sin la vía A: es
el techo que la profundidad de la consulta (`mascaraProf` = 20) pone, y está por
debajo del listón.

**B · Desvanecer la conservación cerca del borde del recorte.** Descartada con
la medida de main: actúa solo en una franja, así que el interior del recorte
se queda en los 6,55/arcmin² medidos (ratio 5,8) y la costura pasa de escalón a
rampa sin dejar de estar. El criterio de la historia es la densidad de todo el
recorte contra el anillo, y una franja no la mueve.

**Elegida: A**, por la medida y porque es la ley que ya rige fuera: la
visibilidad de una estrella la fija la magnitud límite, no el contraste
difuso de su píxel.

## Fotometría y golden

- `test_nebulosas_emision_reflexion.js` (la luz integrada devuelve la mag V con
  su fracción) y `test_ps1_nan_ausencia.js` (flujo total por objeto) siguen en
  verde. Lo que se quita son estrellas de campo, que el anclaje al catálogo
  nunca contó como luz del objeto.
- `test_golden_difusas.js` sigue **bit a bit**: `montar` recibe `mlim` como
  argumento opcional y el golden no lo pasa, así que su línea base no cambia y
  no se recaptura. Cuando se quiera que el golden vigile también esta ley, será
  una recaptura propia (una causa, un commit) con el procedimiento de
  `recaptura-golden-difusas.md`.

## Reproducir

```
node scripts/harness_costura_parche.js            # main (sin mlim en el montaje)
node scripts/harness_costura_parche.js --viaA     # producción
node scripts/harness_costura_parche.js --viaA --png   # vuelca .scratch/costura/
```
