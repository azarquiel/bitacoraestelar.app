# ADR 0012 · paso 3 (A): atenuación contra Bernoulli, medido

Arnés: `scripts/harness_atenuacion_bernoulli.js`. M13, D=467 mm, 173×, SQM 21,
`θ_sep = 1,00 r_img = 1,04″`, `Δmag = 0,75`, 200 semillas. La ley es
`pob.aCrowd` de producción, no una copia (ADR 0008).

**Resultado en una línea:** las dos lecturas empatan en TODO lo que el ADR
proponía para decidir —cuenta, flujo y estabilidad temporal—, y el desempate que
el ADR reservaba para el empate (estabilidad) resulta ser también un empate,
medido. Lo único que las separa contra la verdad del banco es **qué estrellas se
pierden**, y ahí gana Bernoulli con holgura: la atenuación borra el cuartil más
débil al 100 %, la verdad borra un conjunto con el 50 % de débiles, Bernoulli un
38 %.

---

## 1. La cuenta no puede discriminar, y es álgebra

`E[Bernoulli] = Σa` exactamente. No es que empaten por suerte: empatan por
construcción. MEDIDO, para que el empate sea un hecho y no una deducción:

```
                     <=0,25    <=0,5      <=1      <=2      <=4      <=8    total
Gaia visibles           154      282      441      438      280      203     1798
verdad geométrica       141      256      433      434      278      200     1742
ATENUACIÓN Σa         127,6    251,0    420,5    431,8    279,1    202,9   1712,9
BERNOULLI media       127,4    251,0    420,5    431,9    279,0    202,9   1712,8
BERNOULLI sd            4,3      5,2      4,5      2,4      0,9      0,3     17,6
|Σa − Bernoulli|       0,13     0,02     0,03     0,10     0,11     0,00     0,39
```

Diferencia total entre esquemas: 0,39 estrellas sobre 1713, y son ruido de las
200 semillas. **La primera mitad del criterio del ADR no decide nada**, y no
podía hacerlo.

## 2. El hueco contra la verdad es sesgo, no varianza

Los dos esquemas quedan 29 estrellas por debajo de la geometría. La pregunta que
importa para (A) es si ese hueco cabe en la dispersión del sorteo —si cabe,
Bernoulli lo explicaría y la atenuación no—. MEDIDO, desvío de la verdad en
unidades de σ del sorteo:

```
                     <=0,25    <=0,5      <=1      <=2      <=4      <=8    total
desvío geom. en σ       3,1      0,9      2,8      0,9     -1,1    -10,8     -4,1
¿dentro de ±2σ?          no       sí       no       sí       sí       no    3 de 6
```

A 3,1σ y 2,8σ en los anillos que importan, el hueco **no es ruido de
realización**: es el sesgo de la ley que ya midió el paso 2 (el modelo mezcla de
más dentro de r_h). Ninguna realización lo cierra. **La varianza que Bernoulli
aporta no compra nada contra esta verdad**, que es el argumento con el que el ADR
lo defendía («cuenta y varianza correctas»).

El −10,8σ del anillo exterior es el otro lado: ahí `a ≈ 1`, la sd cae a 0,3 y
sobran 3 estrellas por incompletitud del fixture. Con σ tan pequeña, cualquier
diferencia sale enorme en σ; no informa.

## 3. Brier por estrella: gana la atenuación, pero casi no significa nada

El Brier `(p − y)²` contra la etiqueta geométrica por estrella:

```
                     <=0,25    <=0,5      <=1      <=2      <=4      <=8    total
Brier ATENUACIÓN      0,082    0,081    0,020    0,009    0,007    0,015   0,0295
Brier BERNOULLI       0,217    0,176    0,063    0,023    0,010    0,015   0,0706
Brier p constante     0,085    0,084    0,019    0,009    0,007    0,015   0,0300
```

Dos lecturas, y la segunda desactiva a la primera:

1. La atenuación gana al sorteo por 58 %. **Esto está garantizado por álgebra**:
   el Brier es una regla de puntuación propia y el sorteo es su randomización, así
   que randomizar nunca puede mejorarla. El arnés lo comprueba con un `throw` en
   vez de afirmarlo, pero como criterio sería vacuo (ADR 0005).
2. La línea base —predecir la MISMA probabilidad para todas las estrellas del
   anillo— da 0,0300 contra los 0,0295 de la ley. **`a` bate a una constante por
   un 1,7 %.** La ley solo sabe de `m` y `r`; qué estrella concreta tiene vecina
   depende de posiciones que la ley no puede conocer. No hay información por
   estrella que preservar.

**Este eje no decide.** Se documenta porque, sin la línea base, el 58 % parecería
un argumento.

## 4. Dónde SÍ difieren: quién se pierde

Atenuar es restar `2,5·log10(a)` magnitudes. Una estrella con `a = 0,5` pierde
0,75 mag, y si con eso cruza `mlim` el render no la dibuja en absoluto. El sorteo
no mueve ninguna magnitud. MEDIDO:

```
ATEN. borradas por mlim     32       26       18        4        0        0       80
BERN. no dibujadas (media) 127,4 ... (= 1798 − 1712,8 = 85 estrellas)
```

Los dos pierden prácticamente el mismo número (80 contra 85). Lo que cambia es el
conjunto, y la verdad geométrica dice cuál debería ser, porque no dice solo
cuántas estrellas se mezclan: dice **cuáles**.

Cuartil más débil de las visibles: G ≥ 15,73. Referencia: las visibles enteras
tienen G medio 14,96 y, por definición, un 25,0 % de cuartil débil.

| conjunto que se pierde | n | G medio | G mediana | % del cuartil débil |
|---|---|---|---|---|
| **verdad geométrica** | 56 | 15,41 | 15,74 | **50,0 %** |
| ATENUACIÓN, borradas por mlim | 80 | 16,08 | 16,10 | **100,0 %** |
| BERNOULLI, no dibujadas | 81 | 15,39 | 15,51 | **38,3 %** |

La verdad tiene sesgo hacia lo débil, y es físico: una estrella débil tiene más
vecinas que la superan por menos de Δmag. Pero es un sesgo de 50 contra 25, no un
filtro.

**La atenuación borra EXCLUSIVAMENTE el cuartil débil: 100,0 %, las 80.** Convierte
un efecto de vecindad en un corte por magnitud. Bernoulli, con 38,3 %, se queda
del lado correcto de la referencia y a 12 puntos de la verdad, contra 50 de la
atenuación.

Esto es exactamente lo que el ADR sospechaba —«el corte contra `mlim` lo acaba
decidiendo la magnitud, no la vecindad»— y aquí queda medido: no es un matiz, es
el 100 %.

## 5. Conservación del flujo: empate

```
ATENUACIÓN            0,979958   (exacto por construcción)
BERNOULLI 1 semilla   0,980940
BERNOULLI media 200   0,979837   desvío −0,012 % contra Σa
```

Los dos conservan. El sorteo lo hace en media, con −0,012 % de sesgo sobre 200
semillas, dos órdenes por debajo del ±1 % del ADR 0003.

## 6. La estabilidad temporal: el desempate del ADR no existe

El ADR reservaba el desempate a la atenuación «por estabilidad temporal»,
asumiendo que el sorteo parpadea al mover el ocular. **La premisa es falsa, y se
puede comprobar leyendo la firma:** `aCrowd(m, rAs, radioImagenAs)` no lleva
aumentos dentro —`sigma(r)` y la LF son física del cúmulo, `r_img` es apertura y
seeing—. Si `a` no se mueve con el ocular y la semilla sale de la estrella, la
decisión tampoco se mueve. MEDIDO sobre las 657 estrellas presentes en las cuatro
escenas de 61×, 120×, 173× y 250×:

```
máx |Δa| respecto a 61x                    0,0e+0
decisiones de Bernoulli que cambian        0 de 1971
cambio de brillo dibujado (atenuación)     0,0e+0 mag
```

Cero parpadeos, cero deriva. Lo único que cambia con el ocular es `mlim`, o sea
qué estrellas entran en la escena, y eso les pasa a los dos por igual.

**El desempate del ADR queda sin efecto.** No porque Bernoulli lo gane, sino
porque no hay nada que desempatar: en ese eje también empatan.

## 7. Lo que ninguno de los dos hace

El ADR dice bien que «el blending no apaga una estrella, funde dos en un blob más
brillante». **Ninguno de los dos esquemas hace eso.** Los dos mandan la luz
perdida al velo, así que los dos dejan de pintar el blob brillante que la física
produce, y esa luz reaparece como fondo difuso en vez de como punto. Elegir entre
atenuación y Bernoulli no arregla esto, y el arnés no lo mide porque ninguno de
los dos lo intenta. Queda anotado como límite conocido de la partición del ADR
0012, no como defecto de la opción elegida.

## 8. Veredicto

Por el criterio del ADR, aplicado literalmente:

| eje | resultado |
|---|---|
| cuenta por anillo | EMPATE por construcción (0,39 sobre 1713) |
| varianza contra la verdad | no aplica: el hueco es sesgo, 2,8-3,1σ |
| Brier por estrella | atenuación, por álgebra; y la ley solo bate a una constante por 1,7 % |
| flujo | EMPATE |
| estabilidad temporal | EMPATE, 0 parpadeos de 1971 |
| **quién se pierde** | **BERNOULLI**: 38,3 % de cuartil débil contra 100,0 % de la atenuación, verdad 50,0 % |

**Recomendación: Bernoulli**, por el apartado 4 y solo por él. El resto de ejes
empata, incluido el que el ADR reservaba como desempate.

Lo que hay que corregir en el ADR 0012 (A) antes de implementar:

1. «Si empatan en cuenta, gana la atenuación por estabilidad temporal» — el
   empate en cuenta es forzoso, y la estabilidad también empata. La regla no
   selecciona nada.
2. «~77 a brillo íntegro, ~77 al velo» para Bernoulli contra «154 al 50 %» para
   la atenuación: las cuentas del ejemplo eran las de `θ_sep = 2 radios`. Con el
   ancla, el núcleo tiene 154 visibles y `Σa = 127,6`.
3. El argumento de que Bernoulli aporta la varianza correcta no se sostiene
   contra este banco: el hueco es sesgo.

## 9. Qué queda

(B), el esquema del punto fijo, sin tocar. Y con Bernoulli elegido, (B) hereda
una pregunta que la atenuación no tenía: el sorteo entra en `m_lim,sky` por el
velo, así que la semilla no puede depender de la iteración o el punto fijo no
cierra. La semilla por estrella (coordenadas, aquí; `source_id` cuando el render
lo tenga) ya cumple eso por construcción.

Nota sobre la semilla: el fixture `m13_gaia_dr3.csv` no trae `source_id` —solo
`ra`, `dec`, `G`, `BP−RP`—, así que el arnés siembra con las coordenadas. Es
igual de determinista y de estable; cuando el render tenga el `source_id` a mano,
la conclusión no cambia.
