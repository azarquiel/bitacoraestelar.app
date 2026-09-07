# L1.1 — la equivalencia entre la textura y el FITS, medida sobre el banco

Fecha: 2026-09-07. Listón: L1.1 del ADR 0024 (fase 1), con la redacción
corregida el 2026-09-04. Máquina: la del desarrollo (Darwin 25.6.0), `node
v26.3.1` — la misma que fijó la línea base de R1.

**Veredicto: L1.1 NO cierra.** Cuatro de las cinco condiciones pasan con margen
en los 69 objetos del banco; la quinta —la posición de los píxeles que la regla
de ausencia manda a NaN— falla en 4 objetos por un factor de 1,07 a 1,92. La
vía de escape del ADR (`a = σ/4`, una sola vez) se ha probado y **empeora** las
dos cifras. Siguiendo la nota de recaptura, **el golden no se ha recapturado**:
R2 sigue sin hacer.

## Cómo se reproduce

```
node scripts/harness_l1_equivalencia.js                 # el banco, a = σ (lo escrito)
node scripts/harness_l1_equivalencia.js --md            # lo mismo, en tabla
node scripts/harness_l1_equivalencia.js --sonda 0.25    # la vía de escape, a = σ/4
node scripts/harness_dso_volumen.js                     # PNG-16 frente a float32 + gzip
```

El comparador monta el mismo objeto por los dos caminos **en el mismo proceso**
y los resta píxel a píxel, que es lo que el golden no puede hacer: guarda
hashes y agregados, no píxeles (nota de recaptura, paso 4).

- Camino FITS: `lib_bajar_parche.js` + `lib_parche_produccion.js`, el mismo que
  usa el golden.
- Camino textura: `ps1LeerTextura`, **la función del navegador**, con un `fetch`
  de mentira que sirve los ficheros de `scripts/fixtures/dso/` y de
  `simulador_ocular/dso/`, igual que `test_fuente_parche.js`.
- Ninguna ley reimplementada (ADR 0008). El corte de la regla de ausencia se
  recalcula llamando a `ps1Cielo` y `ps1SigmaCielo` sobre el mismo `limpio` que
  ve `ps1AnclarACatalogo`, y el factor del anclaje sale de llamar a
  `ps1AnclarACatalogo` con `magV = 0`, que es su propia rama sin escalar.
- Estrellas: el CSV de Gaia pineado del objeto cuando lo hay (los 11 golden), y
  ninguna cuando no. Es la **misma** entrada en los dos caminos, así que la
  equivalencia se mide igual; los objetos sin CSV van marcados con `·` en la
  tabla.

**La σ del listón** es la del comparador de R1 (`harness_r1_wcs.js`: «σ es la de
la capa antes»): desviación típica de los finitos del `parche.datos` del camino
FITS. No se elige aquí — es la escala contra la que el procedimiento de
recaptura fija el 0,05·σ. La tabla trae además `max|Δ|` contra el **ruido del
cielo** en unidades ancladas, que es la lectura estricta y la que dice dónde
vive la discrepancia.

## Qué pasa y qué no

| # | Condición de L1.1 | Umbral | Peor del banco | |
|---|---|---|---|---|
| 1 | `max\|Δ\|` en `parche.datos` | ≤ 0,05·σ | **4,08e-2 σ** | ✅ |
| 2 | Presupuesto de luz | `\|ΣΔ\|/Σ` ≤ 1e-4 | **6,27e-9** | ✅ |
| 3 | NaN heredados del stack | 0 píxeles | **0**, en 69 de 69 | ✅ |
| 4a | NaN de la regla de ausencia, cuántos | ≤ 1e-4 del parche | **4,58e-5** | ✅ |
| 4b | NaN de la regla de ausencia, dónde | `\|v − corte\|` ≤ 1 paso | **1,92 pasos** | ❌ |
| 5 | Los 5 controles de exclusión | «fila» con motivo, sin red | 5 de 5, 0 peticiones | ✅ |

La condición 1 pasa, pero **no con los dos órdenes de magnitud de margen que
predecía el ADR**: 4,08e-2 contra 5e-2 es un factor 1,23, no 250. La predicción
(«el paso de cuantización cerca del cielo es ≈ 2e-4 σ»)
vale para el cielo; en el núcleo el códec es de error **relativo**, y contra el
ruido de cielo el mismo píxel se va a 2,94 σ_cielo. Con la σ del listón el
margen existe, pero es estrecho y conviene saberlo antes de la fase 2.

## El único listón que no cierra, y por qué

Los píxeles que un camino manda a NaN y el otro no son 9, 1, 48 y 10 en los
cuatro objetos que fallan —siempre por debajo del tope de cantidad—, pero se
alejan del corte más de un paso de cuantización.

La aritmética cierra sola, y separa al códec de lo que no lo es:

```
distancia al corte  ≤  desplazamiento del corte  +  salto del valor
```

| Objeto | píxeles | distancia al corte | salto del **valor** | desplazamiento del **corte** |
|---|---|---|---|---|
| NGC6857 | 9 | 1,14 pasos | 0,48 | 1,01 |
| IC0435 | 1 | 1,07 pasos | 0,27 | 1,41 |
| NGC2064 | 48 | 1,13 pasos | 0,49 | 0,65 |
| NGC2247 | 10 | 1,92 pasos | 0,32 | 2,35 |

**El códec cumple**: mueve el valor 0,50 pasos como mucho en todo el banco, que
es lo que tiene que hacer una codificación de paso finito (medio paso, más lo
que el relleno de `ps1QuitarEstrellas` propague). Lo que se sale es el **corte**, hasta 2,35
pasos. Y el corte no es una propiedad del códec: `ps1AnclarACatalogo` lo
recalcula como `cielo − k·σ` sobre los datos **ya decodificados**, con `cielo`
una mediana y `σ` una MAD del borde del parche. Dos estadísticos de orden: uno
de los dos píxeles centrales cambia de valor por cuantización y el corte entero
salta un paso.

Esto es estructural, no un defecto de esta codificación. **Ninguna codificación
con paso finito lo lleva a cero**, porque el umbral contra el que se compara
nace de los mismos datos cuantizados. Es el mismo argumento que la corrección
del 2026-09-04 aplicó al *recuento* de píxeles, aplicado al *corte*; y es un
efecto que la fase 0 nombró de antemano sin poder medirlo, porque allí el corte
se calculaba «con el cielo y la σ del parche original para las dos versiones»
(`dso_texturas_fase0.md`, §A, salvedad de método). Con un corte común, un flip
solo puede venir de que el píxel cruce, así que la condición se cumple por
construcción y no prueba nada. En producción cada camino tiene el suyo.

## La vía de escape: `a = σ/4`, probada una vez

| Medida | `a = σ` | `a = σ/4` |
|---|---|---|
| peor `max\|Δ\|`/σ | 4,08e-2 | **4,93e-2** |
| peor `max\|Δ\|`/σ_cielo | 2,94 | **3,47** |
| peor `\|ΣΔ\|/Σ` | 6,27e-9 | 6,16e-9 |
| NaN del stack movidos | 0 | 0 |
| peor fracción de NaN de ausencia | 4,58e-5 | 5,63e-5 |
| peor distancia al corte | 1,92 pasos | **4,91 pasos** |
| peor desplazamiento del corte | 2,35 pasos | **5,92 pasos** |
| objetos que fallan | 4 de 69 | 3 de 69 |

**Empeora**, y era predecible: afinar `a` mete más rango dinámico en los mismos
16 bits (`uMax − uMin` crece como `2·ln(1/a)`), así que el paso cerca del cielo
baja pero el error relativo en el núcleo sube. La propia fase 0 ya lo enseñaba
en su tabla de NGC 7331: a `σ` la distancia máxima al corte era 1,59e-4 σ con
un paso de 2,15e-4 σ (0,74 pasos) y a `σ/4` era 8,28e-5 σ con un paso de 6,44e-5
(1,29 pasos). La razón, que es lo que mide el listón, ya se salía allí.

La sonda no lee ficheros: codifica y decodifica el mismo parche en memoria. No
se salta nada por el camino —el ida y vuelta por el PNG es bit a bit
(`test_dso_texturas.js`) y `uMin`/`uMax` salen de la misma llamada a
`codificar`—, y con `--sonda 1` reproduce **exactamente** los números de leer la
textura del disco, que es como se ha comprobado.

## El volumen de la otra vía de escape (float32 + gzip)

El ADR pide medirlo antes de tomarla. `node scripts/harness_dso_volumen.js`,
sobre el banco a 1024 px:

| Codificación | banco (69) | bytes/px | extrapolado a las 1066 filas aptas |
|---|---|---|---|
| PNG-16 `asinh16` | 92,9 MB | 1,35 | 1,40 GB |
| float32 + gzip | 159,0 MB | 2,30 | **2,40 GB** |

×1,71 en total (por objeto: mín ×1,14, mediana ×1,57, máx ×1,96). float32 haría
pasar L1.1 entera y por definición —es exacto, así que Δ = 0 y el corte no se
mueve—, pero **a 1024 px ya extrapola a 2,40 GB**, por encima del tope de 1,5 GB
que L2.4 pondrá en la fase 2. La regla C de la fase 2 con PNG ya estaba en 1,51
GB, un pelo por encima de ese tope, y por eso el ADR deja la decisión 9.2 (tope
2048 frente a 1794) para cuando se entre. Con float32 la conversación es otra:
la vía de escape de la fase 1 cierra la fase 2 antes de empezarla.

## Lo que no se ha hecho, a propósito

**R2 no se ha recapturado.** El procedimiento lo dice en su paso 5: «Si algo se
sale, no se captura: se documenta el fallo y se decide». El golden sigue
midiendo el camino del FITS y sigue verde. Cambiar su fuente a la textura es el
gesto que la recaptura R2 formaliza, y no se da mientras L1.1 no cierre.

Lo que sí queda hecho, porque no depende del veredicto:

- las texturas de los **11 objetos golden** están versionadas en
  `scripts/fixtures/dso/` (17,5 MB medidos, contra los 18,33 MB que estimó la
  decisión 9.1), y solo esas: `test_dso_texturas.js` falla si aparece una de más
  o falta una, con la lista en `lib_banco_dso.js`;
- el comparador queda en el árbol, así que la medida se repite en un comando.

## La decisión que queda abierta

El ADR 0024 deja tres salidas y **ninguna se toma aquí**:

1. **float32 crudo + gzip**, la vía de escape escrita. Cierra L1.1 por
   construcción y cuesta 2,40 GB extrapolados, que se lleva por delante el
   listón de volumen de la fase 2.
2. **Tope duro**: «dos codificaciones que no cierran L1.1 son un no, y la fase
   se cierra sin código de producción».
3. **Enmendar la condición 4b**, como ya se enmendó su hermana el 2026-09-04 y
   con las mismas tres condiciones escritas allí. Medir contra «su propio»
   corte tampoco vale —sale el mismo 1,92 en NGC 2247—: lo que la medida
   soporta es acotar el **salto del valor** (≤ 1 paso: se queda en 0,50 en todo
   el banco), que es lo único que el códec controla, y llevar el desplazamiento
   del corte a su propia condición, con su propio número.

La tercera es tocar un listón prerregistrado después de ver una medida, que es
justo lo que la cabecera del ADR prohíbe. Se deja escrita, no aplicada.

## El banco, objeto a objeto

Los marcados con `·` van sin CSV de Gaia pineado (la misma entrada vacía en los
dos caminos). `a = σ`, la codificación que está escrita en disco.

| Objeto | motivo | max\|Δ\|/σ | max\|Δ\|/σ_cielo | \|ΣΔ\|/Σ | NaN stack | NaN ausencia | peor \|v−corte\| | contra su propio corte | valor movido | corte movido | Veredicto |
|---|---|---|---|---|---|---|---|---|---|---|---|
| NGC 3310 · | cuantil de lado (mín) | 1.43e-3 | 6.67e-2 | 1.39e-10 | 0 | 0 (0.0e+0) | — | — | — | 0.12 pasos | ✅ |
| NGC 404 · | cuantil de lado (p25) | 9.03e-3 | 3.79e-1 | 3.29e-10 | 0 | 8 (7.6e-6) | 0.61 pasos | 0.61 pasos | 0.11 pasos | 0.87 pasos | ✅ |
| NGC 3377 · | cuantil de lado (p50) | 1.06e-2 | 3.32e-1 | 1.79e-10 | 0 | 0 (0.0e+0) | — | — | — | 0.13 pasos | ✅ |
| NGC 4125 · | cuantil de lado (p75) | 1.28e-2 | 2.31e-1 | 3.55e-10 | 0 | 15 (1.4e-5) | 0.48 pasos | 0.48 pasos | 0.13 pasos | 0.50 pasos | ✅ |
| NGC 7331 · | cuantil de lado (p90) | 1.47e-2 | 1.21e+0 | 1.36e-9 | 0 | 22 (2.1e-5) | 0.56 pasos | 0.03 pasos | 0.40 pasos | 0.19 pasos | ✅ |
| NGC 205 | cuantil de lado (tope) | 4.08e-2 | 1.54e+0 | 1.30e-9 | 0 | 1 (9.5e-7) | 0.68 pasos | 0.03 pasos | 0.50 pasos | 0.21 pasos | ✅ |
| NGC 5194 | golden | 2.82e-2 | 1.40e+0 | 1.56e-11 | 0 | 13 (1.2e-5) | 0.41 pasos | 0.41 pasos | 0.50 pasos | 0.11 pasos | ✅ |
| NGC 5457 | golden | 2.52e-2 | 1.07e+0 | 1.55e-11 | 0 | 27 (2.6e-5) | 0.55 pasos | 0.02 pasos | 0.49 pasos | 0.08 pasos | ✅ |
| NGC 4594 | golden | 1.92e-2 | 2.49e+0 | 9.89e-10 | 0 | 7 (6.7e-6) | 0.16 pasos | 0.16 pasos | 0.49 pasos | 0.28 pasos | ✅ |
| NGC 3031 | golden | 9.13e-3 | 1.06e+0 | 1.08e-9 | 0 | 37 (3.5e-5) | 0.69 pasos | 0.54 pasos | 0.45 pasos | 0.78 pasos | ✅ |
| NGC 4486 · | núcleo saturado | 1.15e-2 | 3.24e-1 | 4.47e-10 | 0 | 6 (5.7e-6) | 0.31 pasos | 0.15 pasos | 0.49 pasos | 0.03 pasos | ✅ |
| NGC 1068 · | núcleo saturado | 2.14e-2 | 1.36e+0 | 1.14e-9 | 0 | 0 (0.0e+0) | — | — | — | 0.23 pasos | ✅ |
| NGC 4826 · | banda de polvo | 9.44e-3 | 2.49e-1 | 1.28e-10 | 0 | 27 (2.6e-5) | 0.68 pasos | 0.68 pasos | 0.46 pasos | 0.36 pasos | ✅ |
| NGC 4565 · | de canto | 3.32e-2 | 2.48e+0 | 4.40e-10 | 0 | 11 (1.0e-5) | 0.34 pasos | 0.34 pasos | 0.45 pasos | 0.06 pasos | ✅ |
| NGC 891 · | de canto | 1.66e-2 | 2.94e+0 | 1.14e-9 | 0 | 37 (3.5e-5) | 0.67 pasos | 0.19 pasos | 0.44 pasos | 0.42 pasos | ✅ |
| NGC 5195 · | vecina en la escena | 9.26e-3 | 1.19e-1 | 2.32e-11 | 0 | 0 (0.0e+0) | — | — | — | 0.07 pasos | ✅ |
| NGC 4374 · | campo denso (Virgo) | 4.75e-3 | 1.54e-1 | 1.23e-11 | 0 | 0 (0.0e+0) | — | — | — | 0.64 pasos | ✅ |
| NGC 4406 · | campo denso (Virgo) | 2.40e-2 | 1.46e+0 | 4.33e-10 | 0 | 4 (3.8e-6) | 0.62 pasos | 0.17 pasos | 0.49 pasos | 0.31 pasos | ✅ |
| NGC 3034 · | vecina en la escena | 2.31e-2 | 2.33e+0 | 4.14e-10 | 0 | 26 (2.5e-5) | 0.58 pasos | 0.33 pasos | 0.49 pasos | 0.42 pasos | ✅ |
| NGC 253 · | borde de cobertura | 2.20e-2 | 1.30e+0 | 1.08e-9 | 0 | 15 (1.4e-5) | 0.43 pasos | 0.41 pasos | 0.50 pasos | 0.34 pasos | ✅ |
| NGC6720 | golden (PN) | 8.74e-4 | 2.13e-1 | 3.99e-10 | 0 | 14 (1.3e-5) | 0.50 pasos | 0.50 pasos | 0.31 pasos | 0.68 pasos | ✅ |
| NGC7008 | mordida 43,6 % | 6.57e-3 | 1.24e+0 | 4.00e-10 | 0 | 48 (4.6e-5) | 0.75 pasos | 0.17 pasos | 0.13 pasos | 1.05 pasos | ✅ |
| Abell 12 | mordida 79,8 % | 0.00e+0 | 0.00e+0 | 0.00e+0 | 0 | 0 (0.0e+0) | — | — | — | 0.00 pasos | ✅ |
| NGC7026 · | mordida 100 % | 1.67e-3 | 2.76e-1 | 5.85e-10 | 0 | 0 (0.0e+0) | — | — | — | 0.80 pasos | ✅ |
| NGC7662 · | PN compacta brillante | 8.33e-4 | 7.47e-1 | 1.12e-10 | 0 | 0 (0.0e+0) | — | — | — | 0.29 pasos | ✅ |
| NGC6543 · | PN compacta brillante | 1.15e-3 | 1.25e+0 | 2.72e-10 | 0 | 0 (0.0e+0) | — | — | — | 0.78 pasos | ✅ |
| NGC3587 · | cuantil de lado entre PN | 2.89e-2 | 1.98e+0 | 1.13e-9 | 0 | 0 (0.0e+0) | — | — | — | 0.32 pasos | ✅ |
| NGC1360 · | cuantil de lado entre PN | 2.03e-2 | 3.81e-1 | 8.75e-10 | 0 | 8 (7.6e-6) | 0.32 pasos | 0.32 pasos | 0.48 pasos | 0.15 pasos | ✅ |
| NGC6853 · | cuantil de lado entre PN | 1.33e-2 | 1.30e+0 | 1.88e-10 | 0 | 10 (9.5e-6) | 0.66 pasos | 0.26 pasos | 0.50 pasos | 0.43 pasos | ✅ |
| NGC7293 · | cuantil de lado entre PN (tope) | 1.92e-2 | 2.85e+0 | 5.31e-9 | 0 | 8 (7.6e-6) | 0.35 pasos | 0.35 pasos | 0.49 pasos | 0.05 pasos | ✅ |
| IC0063 · | clase entera HII | 1.27e-2 | 3.05e-1 | 5.11e-10 | 0 | 0 (0.0e+0) | — | — | — | 0.81 pasos | ✅ |
| IC0131 · | clase entera HII | 4.03e-3 | 3.20e-2 | 6.61e-10 | 0 | 0 (0.0e+0) | — | — | — | 0.90 pasos | ✅ |
| IC0143 · | clase entera HII | 5.94e-3 | 1.68e-1 | 1.31e-9 | 0 | 0 (0.0e+0) | — | — | — | 0.31 pasos | ✅ |
| NGC1982 · | clase entera HII | 1.24e-2 | 5.10e-1 | 2.33e-9 | 0 | 5 (4.8e-6) | 0.35 pasos | 0.02 pasos | 0.49 pasos | 0.11 pasos | ✅ |
| NGC2282 · | clase entera HII | 7.03e-3 | 3.36e-1 | 1.00e-9 | 0 | 8 (7.6e-6) | 0.66 pasos | 0.66 pasos | 0.35 pasos | 1.38 pasos | ✅ |
| IC0466 · | clase entera HII | 4.82e-3 | 3.59e-1 | 2.22e-9 | 0 | 0 (0.0e+0) | — | — | — | 1.10 pasos | ✅ |
| NGC6857 · | clase entera HII | 3.70e-3 | 2.37e-1 | 1.84e-9 | 0 | 9 (8.6e-6) | 1.14 pasos | 1.14 pasos | 0.48 pasos | 1.01 pasos | ❌ |
| NGC6888 | clase entera HII | 6.81e-3 | 9.00e-1 | 4.76e-9 | 0 | 19 (1.8e-5) | 0.81 pasos | 0.36 pasos | 0.48 pasos | 0.69 pasos | ✅ |
| IC1470 · | clase entera HII | 4.54e-3 | 3.62e-1 | 5.79e-10 | 0 | 0 (0.0e+0) | — | — | — | 0.82 pasos | ✅ |
| NGC7635 | clase entera HII | 7.70e-3 | 1.72e+0 | 2.38e-9 | 0 | 25 (2.4e-5) | 0.79 pasos | 0.79 pasos | 0.49 pasos | 0.63 pasos | ✅ |
| IC0059 · | clase entera RfN | 1.77e-2 | 7.19e-1 | 1.96e-9 | 0 | 13 (1.2e-5) | 0.75 pasos | 0.75 pasos | 0.27 pasos | 1.15 pasos | ✅ |
| IC0359A · | clase entera RfN | 2.30e-2 | 6.19e-1 | 6.19e-9 | 0 | 2 (1.9e-6) | 0.57 pasos | 0.06 pasos | 0.48 pasos | 0.15 pasos | ✅ |
| NGC1555 · | clase entera RfN | 5.41e-3 | 4.07e-1 | 6.00e-10 | 0 | 0 (0.0e+0) | — | — | — | 0.54 pasos | ✅ |
| NGC1788 · | clase entera RfN | 3.15e-3 | 4.09e-2 | 1.08e-9 | 0 | 0 (0.0e+0) | — | — | — | 0.25 pasos | ✅ |
| NGC1999 · | clase entera RfN | 1.55e-3 | 6.80e-2 | 9.58e-11 | 0 | 0 (0.0e+0) | — | — | — | 1.23 pasos | ✅ |
| NGC1985 · | clase entera RfN | 6.34e-3 | 2.45e-1 | 5.64e-10 | 0 | 24 (2.3e-5) | 0.24 pasos | 0.24 pasos | 0.42 pasos | 0.08 pasos | ✅ |
| IC0431 · | clase entera RfN | 1.10e-2 | 7.73e-1 | 3.70e-11 | 0 | 0 (0.0e+0) | — | — | — | 0.52 pasos | ✅ |
| IC0432 · | clase entera RfN | 1.39e-2 | 8.69e-1 | 3.54e-10 | 0 | 2 (1.9e-6) | 0.05 pasos | 0.05 pasos | 0.48 pasos | 0.38 pasos | ✅ |
| NGC2023 | clase entera RfN | 1.07e-2 | 5.07e-1 | 6.27e-9 | 0 | 0 (0.0e+0) | — | — | — | 0.20 pasos | ✅ |
| IC0435 · | clase entera RfN | 8.40e-3 | 3.84e-1 | 7.32e-10 | 0 | 1 (9.5e-7) | 1.07 pasos | 1.07 pasos | 0.27 pasos | 1.41 pasos | ❌ |
| NGC2064 · | clase entera RfN | 1.56e-2 | 2.81e-1 | 1.66e-10 | 0 | 48 (4.6e-5) | 1.13 pasos | 1.13 pasos | 0.49 pasos | 0.65 pasos | ❌ |
| NGC2067 · | clase entera RfN | 2.04e-2 | 7.95e-1 | 5.73e-9 | 0 | 18 (1.7e-5) | 0.42 pasos | 0.08 pasos | 0.32 pasos | 0.18 pasos | ✅ |
| NGC2068 | clase entera RfN | 6.79e-3 | 2.31e-1 | 1.68e-9 | 0 | 0 (0.0e+0) | — | — | — | 1.22 pasos | ✅ |
| NGC2149 · | clase entera RfN | 8.22e-3 | 4.10e-1 | 9.78e-10 | 0 | 0 (0.0e+0) | — | — | — | 0.01 pasos | ✅ |
| NGC2170 · | clase entera RfN | 5.22e-3 | 2.00e-1 | 6.38e-10 | 0 | 0 (0.0e+0) | — | — | — | 0.56 pasos | ✅ |
| NGC2163 · | clase entera RfN | 5.05e-3 | 1.11e-1 | 1.00e-10 | 0 | 0 (0.0e+0) | — | — | — | 1.13 pasos | ✅ |
| NGC2182 · | clase entera RfN | 5.77e-3 | 3.99e-1 | 3.11e-10 | 0 | 8 (7.6e-6) | 0.17 pasos | 0.17 pasos | 0.05 pasos | 0.29 pasos | ✅ |
| IC0444 · | clase entera RfN | 1.54e-2 | 9.31e-1 | 8.46e-11 | 0 | 0 (0.0e+0) | — | — | — | 0.12 pasos | ✅ |
| NGC2245 · | clase entera RfN | 2.49e-3 | 3.62e-2 | 3.10e-10 | 0 | 0 (0.0e+0) | — | — | — | 0.84 pasos | ✅ |
| NGC2247 · | clase entera RfN | 1.96e-3 | 1.28e-1 | 3.79e-11 | 0 | 10 (9.5e-6) | 1.92 pasos | 1.92 pasos | 0.32 pasos | 2.35 pasos | ❌ |
| NGC2261 · | clase entera RfN | 4.91e-3 | 1.33e-1 | 2.92e-10 | 0 | 0 (0.0e+0) | — | — | — | 0.42 pasos | ✅ |
| NGC2327 · | clase entera RfN | 4.53e-3 | 2.41e-1 | 4.95e-10 | 0 | 0 (0.0e+0) | — | — | — | 0.51 pasos | ✅ |
| IC2177 · | clase entera RfN | 1.42e-2 | 1.98e+0 | 1.48e-10 | 0 | 2 (1.9e-6) | 0.51 pasos | 0.08 pasos | 0.44 pasos | 0.15 pasos | ✅ |
| IC4684 · | clase entera RfN | 4.70e-3 | 3.60e-1 | 2.15e-10 | 0 | 0 (0.0e+0) | — | — | — | 1.45 pasos | ✅ |
| NGC6590 · | clase entera RfN | 1.13e-2 | 6.10e-1 | 6.72e-10 | 0 | 0 (0.0e+0) | — | — | — | 0.61 pasos | ✅ |
| IC1287 · | clase entera RfN | 1.43e-2 | 1.64e+0 | 1.39e-9 | 0 | 9 (8.6e-6) | 0.40 pasos | 0.10 pasos | 0.48 pasos | 0.02 pasos | ✅ |
| NGC6914 · | clase entera RfN | 1.64e-2 | 3.77e-1 | 2.93e-10 | 0 | 0 (0.0e+0) | — | — | — | 0.58 pasos | ✅ |
| IC5076 · | clase entera RfN | 6.03e-3 | 4.80e-1 | 1.05e-9 | 0 | 0 (0.0e+0) | — | — | — | 0.52 pasos | ✅ |
| NGC1952 | clase entera SNR | 1.98e-2 | 8.38e-1 | 1.96e-10 | 0 | 16 (1.5e-5) | 0.32 pasos | 0.22 pasos | 0.47 pasos | 0.07 pasos | ✅ |
