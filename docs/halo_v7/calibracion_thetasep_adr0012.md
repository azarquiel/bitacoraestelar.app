# ADR 0012 · paso 2: calibración de θ_sep

Arnés: `scripts/harness_thetasep.js`. Barre `θ_sep ∈ [0,5 … 2,0]·FWHM` y
`Δmag ∈ {0,50 · 0,75 · 1,00}` llamando a `pob.aCrowd` de producción (ADR 0008),
y lo enfrenta a la verdad geométrica —estrellas del fixture de Gaia sin vecino
comparable dentro de θ_sep, solo distancias, sin ley dentro—.

**Resultado en una línea:** la FORMA de la ley pasa; el VALOR de `θ_sep` no se
puede fijar con esta verdad, porque la verdad usa el mismo θ_sep y se mueve con
él. Hay que anclarlo en la resolución real del instrumento y del ojo, no
ajustarlo al fixture. Queda un residuo sistemático del 15-20 % en el anillo
0,5-1 r_h que no se va con ningún θ_sep.

---

## 1. La segunda verdad no vale aquí, y el arnés lo mide

`harness_crowding_k.js` usaba dos verdades que concordaban al 0,4 %: geometría
sobre posiciones reales, y Poisson con la `n` de la LF invirtiendo `mCrowd`.

Frente a `mCrowd` —umbral duro en `k`— la Poisson era independiente. Frente a
`aCrowd` **no lo es**: es la misma fórmula, `exp(−n·πθ_sep²)`, leída por otro
camino. MEDIDO: coinciden con discrepancia máxima 9,8e-5 estrellas por anillo,
que es la tolerancia de la bisección. Tomarla por cota habría dado un criterio
vacuo (ADR 0005) — de hecho la primera versión del arnés lo dio: «5/5 anillos
dentro de las dos cotas» para las 18 combinaciones del barrido, porque una de
las cotas *era* la predicción.

Se conserva en el arnés como comprobación de identidad: valida la bisección y
que lo implementado en `bitacora-cumulos.js:307-313` es la ley que el ADR
escribió. No como evidencia.

## 2. Lo que discrimina es el déficit, no la cuenta

Fuera de r_h la mezcla apenas muerde: modelo y geometría coinciden con cualquier
θ_sep. La señal vive en el DÉFICIT por anillo —Gaia menos resueltas, las
estrellas que la mezcla se lleva—. MEDIDO, M13, D=467 mm, M=173×, SQM 21,
FWHM 2,09″, Δmag = 0,75 (Gaia visible: 154 · 282 · 441 · 438 · 280 · 203):

| θ/FWHM | déficit | ≤0,25 | ≤0,5 | ≤1 | ≤2 | razón peor |
|---|---|---|---|---|---|---|
| 0,75 | modelo / geom. | 52/42 | 64/50 | 44/39 | 14/12 | 1,28 |
| 1,00 | modelo / geom. | 77/65 | 101/89 | 75/89 | 24/25 | 1,19 |
| 1,25 | modelo / geom. | 98/95 | 138/142 | 109/134 | 37/39 | 1,23 |
| 1,50 | modelo / geom. | 113/110 | 170/181 | 145/179 | 51/49 | 1,23 |
| 2,00 | modelo / geom. | 131/133 | 216/222 | 215/248 | 86/96 | 1,25 |

## 3. Veredicto sobre la forma: pasa

Un solo `θ_sep` reproduce el déficit dentro de un factor ~1,2 en cuatro anillos
que cubren dos órdenes de magnitud en densidad. La comparación es con lo que el
ADR 0012 documentó para el umbral duro: el `k` que cada anillo necesitaba iba de
18,8 a 1576,4. Eso era el fallo de forma, y ya no está.

MEDIDO además: `FWHM` no depende del aumento (2,09″ tanto a 61× como a 173×;
2,43″ con D=200 mm). `θ_sep` en unidades de FWHM es por tanto independiente del
ocular por construcción, y el eje de equipo que importa es apertura + seeing. A
D=200 mm el patrón de razones se repite (0,92-1,47), con menos estadística
porque `mlim` baja a 14,60 y el déficit total cae a ~75 estrellas.

## 4. Veredicto sobre el valor: NO se puede fijar así

La verdad geométrica se construye con el MISMO θ_sep que la ley. Al crecer θ
crecen los dos déficits a la vez, así que la razón entre ellos apenas se mueve:
peor razón 1,11-1,38 en todo el barrido de 18 combinaciones —salvo Δmag=1,00 con
θ=0,50, que da 2,12—. No hay mínimo agudo. INFERIDO de eso: este banco valida la
forma radial, no el valor.

Y el valor importa: el ADR ya midió que en el núcleo de M13 salen 128 / 77 / 41
estrellas para θ_sep = 0,5 / 1,0 / 1,5 FWHM. Un factor 3 en la cuenta dentro de
un rango que la verdad no distingue.

Consecuencia para el paso 4: `θ_sep` entra como constante anclada en la
resolución del instrumento y del ojo —el mismo criterio con el que el simulador
decide una doble—, no como parámetro ajustado a esta tabla. Elegirlo por cómo
queda la imagen sigue prohibido (ADR 0004); elegirlo por esta tabla sería
elegirlo por nada.

**Sin fuente primaria todavía** para el ancla: falta el criterio cuantitativo de
separación visual con el que el simulador ya juzga las dobles. Es lo que hay que
leer antes de fijar el número, y no está resuelto en este documento.

## 5. El residuo que no se va

En el anillo 0,5-1 r_h el modelo se queda corto de mezcla en todos los θ y en
todos los equipos probados: razón 0,84 / 0,81 / 0,81 / 0,87 para θ = 1,00 / 1,25
/ 1,50 / 2,00 a 173×, y 0,86-0,93 con D=200 mm. En los dos anillos interiores
pasa lo contrario (1,03-1,18). Es un sesgo de forma, pequeño y sistemático.

Dos lecturas, sin decidir aquí: la incompletitud de Gaia en el núcleo hunde por
igual predicción y verdad y podría estar inflando las razones interiores; o la
`n(≥m, r)` de la LF no cae con el radio exactamente como caen las estrellas
reales. La segunda se mide comparando `n` con el conteo directo del fixture por
anillo. No bloquea el paso 3.

## 6. Qué queda

Pasos 3 y 4 del ADR 0012, en ese orden: (A) atenuación contra Bernoulli, (B)
esquema del punto fijo, y solo después llamar a `aCrowd` desde el render. Nada de
esto se ha tocado: `bitacora-cumulos.js:413` sigue exponiendo la ley sin llamador,
y `scripts/test_crowding_psolo.js` sigue con A3 en rojo, que es su resultado
esperado.
