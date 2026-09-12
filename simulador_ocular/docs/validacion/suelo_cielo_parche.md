# ¿De dónde salen el cielo y la σ de un parche? (#274)

2026-09-12. Listones y patrón comprometidos antes de medir en el ADR 0027
(prerregistro), con su enmienda del mismo día. Reproducir con:

```
node scripts/harness_suelo_cielo.js --marco     # el marco del 6 % dentro del objeto
node scripts/harness_suelo_cielo.js --patron    # cielo lejano y campo vecino (red)
node scripts/harness_suelo_cielo.js --escala    # el confundido de escala
node scripts/harness_suelo_cielo.js --e3nativo  # POST HOC: E3 al paso nativo
node scripts/harness_suelo_cielo.js --opciones  # E1-E4 contra el patrón
node scripts/harness_suelo_cielo.js --hash      # el coste contra version()
```

Los PNG del banco no entran en git: `--dir` apunta a la copia local de
`simulador_ocular/dso/`.

## 1. La medida que faltaba: a cuántos les pasa

`ps1Cielo` y `ps1SigmaCielo` leen el marco exterior del 6 % del parche. La
pregunta del ticket es qué fracción de ese marco cae dentro del objeto, y hay
que contestarla con DOS metros, porque dan números distintos y los dos importan:

- **escena** — lo que producción protege: borde real donde la clase lo tiene, y
  si no la isofota μ25 (`ps1EscenaEnParche`). En una galaxia ese radio *es* el
  semieje de catálogo, porque `gen_galaxias.py` resuelve `r_e` para que la
  isofota de 25 caiga en D25/2.
- **catálogo** — el tamaño que trae el catálogo. En las clases **difusas** (HII,
  RfN, Cl+N) es `r_e / 0,30` (`RE_SOBRE_SEMIEJE` de `gen_nebulosas.py`), y de ahí
  sale que un parche de 6·`r_e` mida 0,9 ejes mayores. En las **compactas** (PN,
  SNR) el generador usa 0,60 y no 0,30, así que ahí el tamaño de catálogo es el
  borde real y los dos metros coinciden: `ps1RadioBordeAs` ya lo calcula.

Con `r_e` a secas —la extensión que usa el veredicto de ausencia— el marco no
cae dentro de nadie: el parche llega a 3,00 `r_e` y el marco empieza en 2,64.
Por eso la contaminación no se ve mirando `r_e`, y es lo que hacía falta medir.

**Resultado sobre las 68 texturas de imagen del manifiesto:** 43 tienen el marco
contaminado en algo, y **35 pasan del 20 %** (la regla de afectado del
prerregistro): **25 RfN, 5 HII y 5 galaxias**. Ninguna PN y ninguna SNR: en esas
clases el parche sí contiene al objeto, porque su `r_e` sale de 0,60·semieje y no
de 0,30. En casi todas las difusas la cifra es la misma —62,6 %— porque la
geometría es la misma: lado = 6·`r_e` = 1,8·semieje para todas.

| objeto | clase | lado | escena″ | catálogo″ | marco en escena | marco en catálogo |
|---|---|---|---|---|---|---|
| NGC 3310 | gal | 1,6′ | 67,7 | 67,7 | 85,5 % | 85,5 % |
| NGC 5457 | gal | 20,0′ | 719,9 | 719,9 | 71,3 % | 71,3 % |
| NGC 1788 | RfN | 1,8′ | 67,4 | 60,0 | 87,2 % | 62,7 % |
| NGC 6888 | HII | 12,7′ | 451,6 | 424,3 | 76,0 % | 62,6 % |
| NGC 7635 | HII | 9,9′ | 187,2 | 328,6 | 0,0 % | 62,6 % |
| NGC 5194 | gal | 18,0′ | 493,5 | 493,5 | 0,2 % | 0,2 % |
| NGC 7293 | PN | 20,0′ | 489,9 | 489,9 | 0,0 % | 0,0 % |
| NGC 4486 | gal | 10,6′ | 215,8 | 215,8 | 0,0 % | 0,0 % |

Las cinco galaxias afectadas (NGC 3310, NGC 5457, NGC 1068, NGC 3031, NGC 253)
lo están por el tope de 20′ o por un `r_e` grande, no por la ley de `r_e`.

## 2. El coste, comprobado contra el hash

Recalculando `version()` de `gen_dso_texturas.js` con los parámetros de cada
opción (ADR 0026), objeto a objeto, no por lectura del código:

| opción | ¿mueve el hash? | qué republica |
|---|---|---|
| **E1** agrandar el parche | **sí, en 41 de 68** | el banco entero: nombres nuevos y descarga nueva |
| E2 fuera de la escena | no | nada |
| E3 σ ciega a la estructura | no | nada |
| E4 cielo y σ al sidecar | no | el sidecar de cada objeto, bajo el MISMO nombre |

Y E1 tiene un techo propio que no se arregla pagando: para dejar el marco fuera
del objeto hace falta un lado de `2·r_obj/0,88`, y **5 de los 68 piden más de
`ladoMax` = 20′** (NGC 253 pide 41,4′, NGC 3031 32,6′, NGC 5457 27,3′ e
IC 2177 25,5′). A esos E1 no les arregla el marco ni republicando el banco
entero.

Lo de E4 no es gratis aunque el hash no se mueva: el sidecar lleva la versión en
el nombre y se sirve como inmutable, así que reescribirlo con cielo y σ nuevos
es contenido distinto bajo un nombre declarado inmutable, justo lo que el punto 3
del ADR 0026 no admite. Y exige una tirada del banco con red.

## 3. El patrón, y el confundido que casi lo estropea

El patrón se mide en dos piezas (ADR 0027 + enmienda): el **cielo** en un anillo
lejano de un parche grande —la mediana no depende del tamaño del píxel— y la
**σ** en un **campo vecino** con el mismo lado y la misma resolución que el
parche de producción, o sea al mismo ″/px.

La enmienda no es cosmética. Con la σ del anillo del parche grande, la ley de
hoy salía errando ×3,4 en IC 0059; con la σ del campo vecino, a la misma escala,
yerra ×1,09. Lo que sobraba era el tamaño del píxel, no la ley. Las cifras del
confundido están en el ADR 0027.

| objeto | clase | cielo patrón | σ patrón (vecino) | campo vecino |
|---|---|---|---|---|
| IC 0059 | RfN | −3,4 | 79,0 | 9,5′ O, difusa más cerca a 27,8′ |
| IC 0063 | HII | −6,1 | 82,6 | 7,4′ E, difusa más cerca a 26,0′ |
| IC 0359A | RfN | +1,4 | 45,9 | 16,5′ S |
| NGC 1788 | RfN | −1,5 | 144,7 | 2,7′ E |
| NGC 2064 | RfN | +0,9 | 38,5 | 13,5′ S |
| IC 0444 | RfN | −1,5 | 70,2 | 7,6′ N |
| NGC 5457 | gal | +1,1 | 20,6 | 30,0′ O |
| NGC 6888 | HII | −11,9 | 57,9 | 19,1′ N |
| NGC 7293 | PN | +1,6 | 41,1 | 32,7′ N |
| NGC 5194 | gal | +1,6 | 24,8 | 27,1′ O |

El cielo lejano de NGC 6888 sale a −11,9 DN, contra los −13 DN que midió #263 con
otro recorrido: la medida se replica.

## 4. Las opciones contra el patrón

`log₂(σ_opción/σ_patrón)`: 0 es clavado, ±0,32 es el listón (×1,25), ±1 es el
doble. Y el cielo en unidades de σ_patrón.

| objeto | L0 (hoy) | E2 | E3 | Δcielo L0 | Δcielo E2 |
|---|---|---|---|---|---|
| IC 0059 | +0,12 | −0,10 | −0,18 | −0,02 | −0,12 |
| IC 0063 | +0,29 | +0,40 | −0,26 | +0,16 | +0,36 |
| IC 0359A | −0,20 | −0,17 | −0,28 | +0,01 | +0,03 |
| **NGC 1788** | **+2,46** | **+2,61** | sin σ | **+5,22** | **+3,25** |
| NGC 2064 | +0,42 | +0,47 | +0,14 | +0,16 | +0,14 |
| IC 0444 | −0,25 | −0,29 | −0,41 | −0,04 | −0,08 |
| NGC 5457 | +0,60 | +0,56 | +0,61 | −0,23 | −0,09 |
| NGC 6888 | +0,76 | −0,26 | +0,12 | +0,40 | +0,32 |
| NGC 7293 | −0,69 | −0,62 | −0,68 | −0,05 | −0,12 |

**Veredicto de los listones 1 y 2, sobre los nueve afectados:**

| opción | mediana \|log₂\| (≤0,32) | máx (≤1,00) | máx \|Δcielo\|/σ (≤0,50) | |
|---|---|---|---|---|
| L0 (la ley de hoy) | 0,42 | 2,46 | 5,22 | **NO PASA** |
| E2 | 0,40 | 2,61 | 3,25 | **NO PASA** |
| E3 | 0,28 | 0,68 | 0,36 | **NO PASA** (sin σ en 1) |
| E4 | 0,00 | 0,00 | 0,00 | PASA, pero por construcción: E4 *es* el patrón |

Tres cosas que la tabla enseña y que no estaban en la hipótesis del ticket:

**1. Fuera de NGC 1788, la ley de hoy no está rota: está torcida.** Con el metro
a la escala correcta, L0 yerra ×1,09 en IC 0059, ×1,22 en IC 0063 y ×0,87 en
IC 0359A. Los desvíos grandes son NGC 7293 (×0,62, o sea σ demasiado BAJA),
NGC 5457 (×1,5) y NGC 6888 (×1,7). El 9,65 mag de dispersión del suelo efectivo
que midió #263 no es, en su mayor parte, error de la σ: es que el suelo se divide
por `escala²`, y la escala del banco va de 0,088 a 1,172 ″/px, o sea 13 veces
—5,6 mag solo por ahí—.

**2. En NGC 1788 no hay cielo dentro del parche, y eso ninguna opción interna lo
arregla.** Su cielo de producción está en 754 DN y el de verdad en −1,5: son
5,2 σ de pedestal. E2 —medir fuera de la escena, dentro del mismo parche— baja a
468 DN, que sigue siendo 3,25 σ. No es que el estimador sea malo: es que ahí
dentro no hay ni un píxel de cielo.

**3. El parche de los objetos pequeños está sobremuestreado, y por eso E3 no da
σ.** NGC 1788 se publica a 0,105″/px cuando el stack de PS1 es de 0,25″: el
**58 % de sus píxeles vecinos son idénticos**, así que la MAD de las diferencias
entre vecinos vale 0. Es también la razón de que agrupar no le bajara la σ en la
prueba de escala: no hay ruido independiente que promediar, hay píxeles
repetidos.

## 4 bis. E1 medida, no argumentada

E1 no se puede juzgar sobre el parche publicado: hay que bajar el parche con el
lado que E1 pediría y aplicarle la ley de hoy encima (`--e1`). Se juzga el
**cielo**, que es la mitad del patrón que no depende del tamaño del píxel, y se
acompaña de la geometría: qué fracción del marco nuevo sigue cayendo dentro del
objeto.

| objeto | lado hoy → E1 | marco dentro | cielo E1 | cielo patrón | Δ/σ_patrón | |
|---|---|---|---|---|---|---|
| IC 0059 | 6,4′→9,0′ | 0,0 % | −2,4 | −3,4 | +0,01 | ok |
| IC 0063 | 4,9′→6,2′ | 0,0 % | +1,8 | −6,1 | +0,10 | ok |
| IC 0359A | 11,0′→15,6′ | 0,0 % | +2,2 | +1,4 | +0,02 | ok |
| **NGC 1788** | 1,8′→2,6′ | **0,0 %** | **326,3** | −1,5 | **+2,27** | **FUERA** |
| NGC 2064 | 9,0′→12,8′ | 0,0 % | +7,2 | +0,9 | +0,16 | ok |
| NGC 6888 | 12,7′→17,1′ | 0,0 % | −4,7 | −11,9 | +0,12 | ok |
| NGC 5457 | 20,0′→20,0′ | 71,3 % | −3,7 | +1,1 | −0,23 | ok |
| NGC 7293 | 20,0′→20,0′ | 0,0 % | −0,5 | +1,6 | −0,05 | ok |

(IC 0444 no entra: la descarga de su parche agrandado no devolvió ninguna celda.)

**E1 funciona en 7 de 8, y eso hay que decirlo**: agrandar el parche sí arregla
el cielo donde el objeto acaba dentro del campo nuevo. Dos cosas la hunden:

1. **NGC 1788, con el marco geométricamente limpio, sigue dando 326 DN de cielo
   contra −1,5.** El marco ya no toca la extensión de catálogo —0,0 %— y aun así
   el pedestal es de 2,27 σ. La talla del catálogo se queda corta frente a la
   nebulosa real, así que «agrandar hasta que el marco salga del objeto» no
   garantiza cielo: agranda hasta donde dice una fila que ya sabemos que miente
   en esta clase (ADR 0024).
2. **Cuatro objetos piden más de `ladoMax` y no lo pueden pedir.** NGC 5457 es el
   caso curioso: se queda con su 71,3 % de marco dentro y aun así acierta el
   cielo (−0,23 σ), porque a 10′ del centro lo que hay de M101 ya es más débil
   que el ruido. O sea que el marco contaminado no siempre estropea el cielo —y
   por eso el criterio 1 mide exposición, no daño—.

## 5. Listones 3 y 4

**Listón 3 (no regresión).** Los controles de parche holgado no se mueven con
ninguna opción: en los cuatro, Δ del suelo efectivo ≤ 0,12 mag y Δ de apagados
≤ 1,2 puntos, contra los márgenes de 0,20 mag y 5 puntos.

| control | suelo L0 | apagados L0 | E2 | E3 |
|---|---|---|---|---|
| NGC 5194 | 37 DN/as² | 25,0 % | Δ0,02 mag / 0,0 pt | Δ0,01 / 0,1 |
| NGC 3031 | 29 | 23,5 % | Δ0,12 / 1,2 | Δ0,08 / 0,9 |
| NGC 4594 | 97 | 0,8 % | Δ0,03 / 0,0 | Δ0,03 / 0,0 |
| NGC 4486 | 178 | 0,1 % | Δ0,02 / 0,0 | Δ0,04 / 0,0 |

**Listón 4 (control negativo) estaba mal escrito, y se dice con la medida
delante.** Pedía que la razón entre el máximo de los anillos interiores
(0–3 `r_e`) y el exterior (3–4) se quedara en ≤ 2,0. Falla para TODAS las
opciones… incluida la ley de hoy, que da 4,44. Un listón que suspende la ley de
referencia no discrimina nada (ADR 0005): el culpable es el anillo 0–0,5 `r_e`,
que en NGC 6888 contiene la estrella Wolf-Rayet central, cosa que #263 ya había
dicho por escrito.

Excluyendo ese anillo —el control negativo tal como #263 lo formuló— ninguna
opción saca estructura donde no la hay:

| opción | anillos 0,5–1 / 1–1,5 / 1,5–2 / 2–3 / 3–4 | razón interior/exterior |
|---|---|---|
| L0 | 13 / 12 / 18 / 13 / 10 % | 1,80 |
| E2 | 23 / 21 / 26 / 21 / 19 % | 1,37 |
| E3 | 19 / 18 / 23 / 18 / 15 % | 1,53 |
| E4 | 21 / 20 / 25 / 21 / 18 % | 1,39 |

El control negativo se mantiene: la Creciente sigue sin estructura con cualquiera
de las σ. Esta corrección es post hoc y se marca como tal; lo que la justifica no
es que convenga, sino que la versión escrita suspende a la ley que sirve de
referencia.

## 5 bis. Lo que estas medidas NO cierran

- **E4 pasa los listones 1 y 2 por construcción**: la opción y el patrón son el
  mismo número. Ninguna opción independiente los pasó. Lo que decide a favor de
  E4 son §4 (en NGC 1788 no hay cielo dentro del parche) y §4 bis (E1 acierta en
  7 de 8 y falla justo ahí).
- **El listón 3 le falta a E4 en tres controles**: solo hay columna en NGC 5194
  (Δ 0,12 mag / 0,1 pt). Los parches grandes de NGC 3031, NGC 4594 y NGC 4486 no
  se pudieron bajar —STScI devolvió «no se pudo preguntar por las celdas»—, y E1
  no tiene columna de no regresión en ninguno.
- **El conjunto evaluado son los 9 del banco del ADR 0027, no los 35 afectados**.
  Es el banco que se fijó antes de medir, pero cubre una cuarta parte.
- **«E3 no produce σ» se contó como fallo**, y el prerregistro no decía qué hacer
  con una opción que no devuelve valor: solo preveía «sin patrón». Sus otras tres
  cifras (0,28 / 0,68 / 0,36) están dentro de los listones.

## 6. Veredicto

**Gana E4: el cielo y la σ salen de una petición aparte, fuera del objeto, a la
misma escala del parche.** Es la única opción que puede acertar donde el parche
no contiene cielo, y ese es exactamente el caso que rompe el banco hoy.

Las otras tres se descartan con la medida delante:

- **E1 (agrandar el parche)** acierta el cielo en 7 de los 8 que se pudieron
  medir (§4 bis), así que no se descarta por inútil. Se descarta porque **falla
  justo donde el banco se rompe** —NGC 1788, 2,27 σ de pedestal con el marco ya
  fuera de la extensión de catálogo— y porque 4 objetos piden más de `ladoMax` y
  no lo pueden pedir. Encima cuesta lo mismo que E4: republica el banco. Se paga
  una republicación y queda el caso peor sin arreglar.
- **E2 (fuera de la escena, dentro del parche)** no arregla el caso que importa:
  3,25 σ de error en el cielo de NGC 1788, porque ahí dentro no hay cielo.
- **E3 (σ ciega a la estructura)** no da σ en los parches sobremuestreados y, sobre
  todo, **no produce cielo**, que es donde está el error grande.

**El precio de E4, medido:** el hash de `version()` no se mueve —ninguno de sus
parámetros entra en la semilla— pero el sidecar lleva la versión en el nombre y
se sirve como inmutable, así que reescribirlo con cielo y σ nuevos es contenido
distinto bajo un nombre inmutable, que el punto 3 del ADR 0026 no admite. La vía
legal es subir `GENERADOR`, y eso republica el banco entero. **E4 cuesta lo mismo
que E1 y, a diferencia de E1, no tiene techo.**

### Lo que queda para el ticket de implementación

- La σ de E4 hay que medirla **a la escala del parche de producción**: la del
  anillo de un parche grande está en otro píxel y no vale (§3).
- **E3 al paso nativo es un buen estimador de σ y no cuesta nada.** Agrupando
  hasta 0,25″/px antes de mirar vecinos, sobre los nueve afectados: mediana
  \|log₂\| 0,28 y máximo 0,68, NGC 1788 incluido (102,9 contra 144,7). Es una
  medida **post hoc y exploratoria**, fuera del prerregistro: si se quiere usar,
  necesita el suyo. No sustituye a E4, porque el cielo lo sigue poniendo otro.
- El sobremuestreo de los parches pequeños (0,105″/px contra 0,25″ nativos) es un
  hallazgo lateral con consecuencias propias: bytes de más y σ por píxel que no
  es ruido independiente. No es de este ticket.
