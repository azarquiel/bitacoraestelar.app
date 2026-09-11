# Nebulosas de emisión recortadas: ¿la banda o la ley visual? (#263)

2026-09-12, sobre lo observado a ojo el 2026-09-11. Reproducir con:

```
node scripts/harness_emision_banda.js                       # parches publicados, sin red
node scripts/harness_emision_banda.js --solo NGC6888 --bandas g,r,i
node scripts/harness_emision_banda.js --solo NGC6888 --cielo 40
```

El ticket abre dos causas cuyos arreglos son opuestos —bajar otra banda y
republicar, o tocar el render— y pide decidir objeto a objeto con la medida
delante. **Las dos nebulosas dan causas distintas.** Y ninguna de las dos es la
banda.

## Qué se mide y con qué

Sobre el PNG de 16 bits publicado y su sidecar, decodificado a DN. Cielo, σ,
extensión del objeto, pertenencia, máscara de estrellas y anclaje son las
funciones de producción de `resources/js/bitacora-ps1.js`; aquí no se define
ninguna ley (ADR 0008). Las estrellas se quitan antes de contar, con los
fixtures de Gaia que ya existían: en Cygnus, NGC 6888 tiene 10 087 estrellas
dentro del parche y sin quitarlas lo que se cuenta es el campo estelar.

El brillo superficial va con la ley de producción —anclado a la magnitud del
catálogo, no al ZPT de la cabecera—, porque es la que decide lo que se ve.

## NGC 6888 (Creciente, HII): la estructura NO está en los datos

`r_e` = 127,3″; el semieje del catálogo es `r_e`/0,30 = 424″ = 3,33 `r_e`, o sea
que la cáscara vive entre 1,5 y 3,3 `r_e`. El parche llega a 3,00.

| r/r_e | 0–0,5 | 0,5–1 | 1–1,5 | 1,5–2 | 2–3 | 3–4 |
|---|---|---|---|---|---|---|
| % píxeles >3σ | 43 | 13 | 12 | 18 | 13 | 10 |
| mediana (DN, σ=98) | +229 | −0,6 | +0,1 | +2,4 | +2,9 | +14,4 |

Dos cosas a la vez:

- **La mediana del cuerpo de la nebulosa es cero**: −0,6 a +2,9 DN con σ = 98 DN,
  o sea 0,00–0,03σ. No hay meseta difusa que recortar. El +229 de dentro de
  0,5 `r_e` es la estrella Wolf-Rayet central, no la nebulosa.
- **La fracción por encima de 3σ no decae con el radio.** 13 %, 12 %, 18 %, 13 %,
  10 %: es el suelo del campo de Cygnus, el mismo dentro y fuera del objeto.
  Compárese con NGC 7635, de la misma clase y que sí se ve: 68, 59, 16, 5, 4, 7 %.
  Ahí el objeto se despega del campo; aquí no se despega.

**Y no es la banda.** El mismo campo, misma geometría y mismo pipeline, en las
tres bandas:

| banda | % >1,5σ en `r_e` | mediana del cuerpo | σ (DN) |
|---|---|---|---|
| g (publicada) | 31,1 | −0,6 DN = 0,01σ | 98 |
| r (lleva Hα 656 nm) | 30,0 | +12,4 DN = 0,05σ | 265 |
| i | 26,0 | — | 311 |

r contiene el Hα y da **lo mismo que g**, 30,0 contra 31,1 %. La hipótesis de la
banda queda falsada con medida: republicar la Creciente en r no traería nada.

Lo que sí explica el resultado es el propio cartografiado: el stack 3π resta un
fondo por warp, y eso se lleva la emisión extendida de baja frecuencia espacial.
Lo que sobrevive son los filamentos compactos, y en este campo no se distinguen
del suelo de estrellas no resueltas.

**Veredicto: la estructura no está en los datos y no hay banda de PS1 que la
traiga.** Por el criterio 5 del ticket, eso es un resultado y el objeto se queda
como está. Traerla exigiría una fuente que no sea PS1 broadband —una placa Hα—,
que es #230, no este ticket.

## NGC 7293 (Hélice, PN): la estructura SÍ está, y el suelo se la come

Borde real 489,9″; el disco brillante cabe dentro de 0,5 `r_obj`. El parche llega
a 1,22.

- Mediana dentro de 0–0,5 `r_obj`: **+38,85 DN con σ = 25,4 DN = 1,53σ.**
- El suelo de `ps1AnclarACatalogo` está en cielo + **1,5σ**.

La señal del objeto cae exactamente encima del umbral. No es que falte: es que
la mitad de sus píxeles queda a un lado de la raya y la otra mitad al otro. El
resultado es el 47,4 % de la extensión apagada, y en el cuerpo el 50 %, repartido
píxel a píxel —sal y pimienta— que es justo la forma de perder estructura sin
perder brillo medio.

Que es un umbral y no una ausencia lo confirma agrupar píxeles, que baja el ruido
y deja la señal: en el cuerpo, 50 % → 55 % → 57 % → **59 %** a 1,17″, 2,34″, 4,69″
y 9,37″. La señal está; el problema es a qué escala se la juzga. Los controles
no se mueven porque ya están saturados de señal (NGC 6720 y NGC 7008 al 100 %
desde el primer paso).

**Veredicto: es la ley visual**, y en concreto que el suelo de ruido se aplica
**por píxel** sobre datos sin convolucionar, cuando el render los va a mostrar
convolucionados por la óptica.

## Dos cosas más que aparecieron midiendo

**1. El parche de una clase difusa no contiene el objeto.** Para HII, RfN y Cl+N,
`r_e` = 0,30·semieje y el lado del parche es 6·`r_e`: eso es 1,8·semieje =
**0,9·eje mayor**. El parche siempre es más pequeño que el objeto, y el borde del
que `ps1Cielo` saca la mediana cae dentro de él. Medido en NGC 6888 con un parche
de 40′: el cielo lejano (4–6 `r_e`) está en −13 DN y el que usa producción, en
+18 DN. Son 31 DN = 0,27σ de sobresustracción. Pequeño al lado del suelo de
1,5σ, pero va en la misma dirección y es gratis de arreglar.

**2. El modelo tapa la medida.** Lo que el suelo apaga no se pinta negro: lo
rellena el perfil Sérsic del catálogo. En NGC 6888 ese perfil está a μ = 20,36 en
`r_e` y la mediana de los píxeles medidos que sobreviven, a μ = 22,56. El relleno
sintético es **2,2 mag más brillante** que la medida que lo rodea, así que lo que
domina la vista es el modelo liso. Es coherente con lo que se ve a ojo —«aparece,
pero con mucha menos estructura»— y no depende de cuál de las dos causas tenga
cada objeto.

## Lo que este ticket NO cambia

Nada de producción. El suelo `kRuido = 1,5` se calibró sobre M51 y gobierna las
67 texturas del banco; moverlo, o juzgarlo a la escala de la PSF en vez de por
píxel, es una ley nueva con su propio listón y su prerregistro, no un ajuste que
se cuele detrás de un informe. Tampoco se toca `cfg.banda`: la medida dice que
no hay nada que ganar cambiándola, así que no hay ADR que escribir (criterio 3
del ticket, por la vía de que la banda queda descartada).

## Cifras de control

| objeto | clase | % >1,5σ (`r_e`/cuerpo) | apagados | μ p50 medido | μ perfil en `r_e` |
|---|---|---|---|---|---|
| NGC 6888 | HII | 31 / 59 | 66,1 % | 22,56 | 20,36 |
| NGC 7293 | PN | 34 / 50 | 47,4 % | 22,74 | 22,33 |
| NGC 6720 | PN | 100 / 100 | 0,0 % | 18,13 | 18,29 |
| NGC 7008 | PN | 100 / 100 | 1,3 % | 20,91 | 20,45 |
| NGC 7635 | HII | 87 / 95 | 20,1 % | 24,86 | 23,36 |
| NGC 1952 | SNR | 83 / 99 | 17,1 % | 21,60 | 21,13 |
| NGC 5194 | galaxia | 75 / 78 | 6,4 % | 21,66 | 22,85 |

El 59 % del «cuerpo» de NGC 6888 es la estrella central y su entorno, no la
nebulosa: en esa fila la columna que cuenta es la de anillos de arriba.
NGC 7293 va sin máscara de estrellas —no hay fixture de Gaia para ella—, pero
está a b = −57° y su cola de alta señal (p99 = 20σ contra 151σ en NGC 6888) dice
que ahí las estrellas no mandan.

## Línea base del banco entero (2026-09-12, para #273)

`node scripts/harness_emision_banda.js --todos` mide los 68 objetos con textura
de imagen del manifiesto, una línea por objeto: escala, σ, el suelo de
producción traducido a brillo superficial (`kRuido·σ / escala²`), la mediana del
cuerpo en unidades de σ y qué fracción del objeto apaga el suelo.

| | |
|---|---|
| objetos medidos | 68 |
| con la mediana del cuerpo por debajo de 3σ | 10 |
| en el filo (1,0–2,5σ, donde está NGC 7293) | 5 |
| con más del 40 % del área medida apagada | **9** |
| dispersión del suelo efectivo | 23 a 166 187 DN/arcsec² = **9,65 mag** |

Los nueve que pierden más del 40 %: IC 0059 (85,2 %), IC 0063 (89,7 %),
IC 0359A (78,4 %), **NGC 1788 (100 %)**, NGC 2064 (68,5 %), IC 0444 (61,9 %),
NGC 5457 (41,7 %), NGC 6888 (66,1 %), NGC 7293 (47,4 %).

Cinco de los nueve son RfN, lo que enlaza con algo ya sabido: en esa clase la
magnitud del OpenNGC es la de la estrella que ilumina, no la de la nebulosa, y
12 de 13 acaban con μ asumida de 20,0. El perfil sale brillante y la imagen
tenue, y el suelo se lleva la imagen.

**NGC 1788 enseña el mecanismo en su forma extrema.** Su `r_e` de catálogo es
18″, así que el parche mide 6·`r_e` = 1,8′ y el marco del 6 % del que `ps1Cielo`
y `ps1SigmaCielo` sacan cielo y ruido **cae dentro de la nebulosa**. σ sale a
796,9 DN y el suelo efectivo a 107 467 DN/arcsec²: el objeto se sube a sí mismo
el umbral hasta que no pasa ninguno de sus píxeles, y en pantalla lo que se ve
es el perfil sintético entero pese a haber imagen medida publicada. Es un lazo
de realimentación con el signo equivocado —cuanto más brillante y extenso, más
alto su propio listón— y es la misma raíz que el «el parche mide 0,9 ejes
mayores» de arriba, llevada al extremo.

**Aviso de sesgo, y va a favor:** esta corrida solo quita estrellas en los seis
objetos que tienen fixture de Gaia; en el resto las estrellas siguen dentro y
empujan la mediana del cuerpo hacia ARRIBA. O sea que 9 de 68 es un suelo, no un
techo: quitando estrellas en todos, la lista puede crecer, no encoger.
