Fecha: 2026-11-16
Estado: propuesto
Enmienda a: 0012 (ver «Qué sustituye»)
Enmendado por: 0040 (fija el umbral de resolución)

# La fusión del blending en globulares

Spike #542. Pregunta: ¿la fusión geométrica (friends-of-friends sobre el
catálogo) es la ley física correcta del blending en los globulares, en lugar del
sorteo Bernoulli del ADR 0012 (A)?

## 0. Prerregistro (escrito ANTES de correr el prototipo)

Prototipo: `scripts/harness_fusion_blending.js`, sobre
`simulador_ocular/docs/validacion/m13_gaia_dr3.csv`, con el equipo de los
arneses del ADR 0012 (D = 467 mm, 173×, SQM 21). Lee de producción `pob`
(`sigma`, `magnitudes`, `estrellasPorBin`, `completitud`, `radioPropio`),
`tabla.mRes`, `radioImagenAs`, `cHalo`, `cGrano` y `thGranoAs` (ADR 0008). Solo
la partición y el agrupamiento son código nuevo. Nada de esto toca producción.

**Convención de flujo.** La de producción: `F = 10^(−0,4·m)`, con la G de Gaia
tratada como la `m` de la LF (V). `estrellasCumulo` ya compara G contra `m_res`
así. La diferencia de banda no se arregla aquí; se declara.

**La partición (pregunta 4).** Cada estrella del catálogo lleva su flujo `F_j`
en su posición. El velo analítico lleva solo lo que el catálogo no trae:

```
V1(r) = Σ(r) · Σ_k num_k · f_k   · (1 − c(m_k, r))
V2(r) = Σ(r) · Σ_k num_k · f_k²  · (1 − c(m_k, r))
```

con `c = pob.completitud`. Nunca `F_total − ΣF_Gaia` (ADR 0003 lo prohíbe por
nombre).

**Flujo total de una región** (anillo o celda): `T = Σ_{j∈región} F_j + ∫ V1 dΩ`,
con `F_j` contado en la posición de la estrella. La partición produce
`P = D + U + ∫ V1 dΩ`: `D` es el flujo dibujado como punto, contado en la
posición donde se dibuja, y `U` es la luz catalogada no resuelta, contada donde
la deja cada ley. `∫ V1 dΩ` es el mismo término en los dos lados. Por eso el
criterio 2 es, por definición, una prueba de contabilidad del catálogo: dónde
acaba la luz de cada estrella.

- Celdas: rejilla cuadrada de lado `θ_sep = CFG.thetaSepRadios · radioImagenAs`
  sobre los offsets de cielo respecto al centro. Solo cuentan las celdas con
  `T > 0`. `∫ V1` en una celda se toma como `V1(r_centro)·θ_sep²`.
- Anillos: los seis de `harness_crowding_k.js` (≤ 0,25 / 0,5 / 1 / 2 / 4 / 8
  r_h).
- Residuo: `|P − T| / T`. Listón: **< 1e-6 en cada anillo y en cada celda**.

**Grano (criterio 3).** Por anillo:

```
R2 = ( ∫ V2 dΩ  +  Σ_{j∈anillo} F_j² ) / ∫ Σ(r)·S2_total dΩ
S2_total = Σ_k num_k · f_k²   (toda la LF)
σ_R2 = sqrt(Σ_{j∈anillo} F_j⁴) / ∫ Σ·S2_total dΩ
```

`σ_R2` es la dispersión de muestreo de la suma real. Listón: **R2 ≤ 1 + 2·σ_R2
en cada anillo**. Si falla, se mira la causa: catálogo, banda o estrellas de
campo. El listón no se mueve. Se imprime al lado el término que la partición
quita, `∫ Σ·Σ num f² c dΩ`, que es la parte que el `S2campo` de producción
contaría dos veces si la luz catalogada se quedara en su sitio.

**Las candidatas de la pregunta 2, tal cual:**

- (a) FoF con longitud de enlace `θ_sep` sobre todo el fixture. Flujo del blob
  `ΣF` y posición en el centroide pesado por flujo. Se dibuja si
  `m_blob ≤ m_res(r_centroide)`; si no, cada miembro queda en su posición. El
  flujo `D` del blob se cuenta en la celda del centroide. **No** se cuenta en
  las de sus miembros: eso haría pasar el criterio sin medirlo (ADR 0005).
- (b) La imagen es `Σ_j F_j·PSF(x − x_j)` y no se agrupa a mano. La detección
  actúa sobre los picos de esa imagen. Ningún flujo se mueve. En (b) el
  criterio 2 es una **identidad**, no evidencia: se corre como comprobación de
  que el prototipo no reubica luz. El argumento a favor o en contra de (b) es
  óptico.

**Micro-casos** para las preguntas 1 a 3, sin cuentas de estrellas. Son pares y
cadenas sintéticos con una PSF gaussiana de FWHM `0,84·θ_sep`, que es la FWHM
de Airy contra el radio del primer anillo oscuro (`1,03/1,22`). Atajo
declarado: la PSF de producción es un sprite, no una función.

**Pregunta 5.** Hay que decidir si `m_res` tiene que pasar a ser local. Se
calcula `m_res` con el fondo local: `cHalo.Fcielo` más la luz no resuelta en
celdas de lado `thGranoAs`, que es la escala a la que el ojo integra el fondo de
un punto. Se compara con el `m_res(r)` radial. Listón: **si el p95 de
|Δm_res| < 0,1 mag en todos los anillos, el radial vale como aproximación**;
si no, `m_res(x, y)`.

**Pregunta 6.** Contraste RMS de la luz no resuelta a la escala `thGranoAs`,
`δI / (Fcielo + ⟨I⟩)`, contra `cGrano.Cmin`. Si queda bajo `Cmin` en todos los
anillos, la luz no resuelta no puede dibujar los ríos y los dibujan los puntos
resueltos.

**Prohibido como argumento:** cualquier cifra de estrellas dibujadas. El
prototipo imprime flujos, residuos, razones y magnitudes, no cuentas de
dibujadas.

## 0 bis. Segundo prerregistro (#577, 2026-11-19, escrito ANTES de medir)

Repite el veredicto con criterios que puedan fallar. Arnés:
`node scripts/harness_fusion_blending.js` (banda V por defecto, solo
miembros, mismo equipo que §0). El arnés imprime el veredicto aplicando esta
regla; nadie lo decide a mano.

**Lo que ya se había visto al escribir esto** (ADR 0005, se declara):

- La salida del arnés antes de las sintéticas (#575): R2 de §0 entre 0,47 y
  1,10, diagnóstico ADR 0003 1,108 / 0,988 / 0,953 / 0,836 / 0,758 / 0,985,
  p95 |Δm_res| = 0,107 en ≤1. Con las sintéticas esas cifras cambian.
- La tabla de potencia de abajo. Lleva la realización del catálogo dentro
  (`R2cf = R2 + Δcf`). En el dominio del velo `Δcf` no se imprime, así que
  R2v no se lee de ella. En las columnas «LF entera» `Δcf` es despreciable,
  así que sí dejan ver el R2 de §0 (ya visto arriba). Ese R2 no entra en el
  veredicto.
- Del arnés con sintéticas (AC1) solo se miró el criterio 2.

**Partición (AC1).** Las sintéticas de producción (`pob.sinteticas`,
realización 0, las que dibuja `pintarCumulo`) entran en la suma como cualquier
estrella. `V1`/`V2` llevan solo los bins `m_k > mCutGeneracion`
(`C.config.mCutGeneracion = 18`, leído de producción). Las LF van en bins de
0,25 mag; el borde que parte el corte es 18,068 («borde» en lo que sigue).

**Criterio 2.** Sin cambios: (b), `< 1e-6` en cada anillo y en cada celda.

**Criterio 3, nuevo.** El doble conteo solo puede vivir donde hay velo,
`m > borde`. Por encima no hay velo: la luz la traen catálogo y sintéticas.
Dividir por el S2 de toda la LF lo diluye bajo las gigantes, y por eso §0 no
tenía potencia. Por anillo:

```
R2v = ( ∫V2 dΩ + Σ_{j∈anillo, m_j>borde} F_j² ) / ∫ Σ·S2(m>borde) dΩ
σ   = sqrt( Σ_{j∈anillo, m_j>borde} F_j⁴ ) / ∫ Σ·S2(m>borde) dΩ
```

Listón: **R2v ≤ 1 + 2σ**. `j` recorre catálogo y sintéticas (las sintéticas
nacen ≤ 17,94 y no entran).

**Doble conteo completo = contrafactual que se corre:** la misma partición con
`V2` sin el factor `(1 − c)`, o sea, el velo vuelve a llevar la luz que el
catálogo ya trae. Un anillo tiene potencia si su `R2cf` **no** pasa el listón.
Un anillo sin potencia no cuenta ni a favor ni en contra. Tabla de potencia
(corrida antes de medir):

```
              dominio del velo m > 18,068        LF entera (estadístico de §0)
anillo     R2cf    1+2σ  potencia             R2cf    1+2σ  potencia
≤0,25      1,013   1,008  sí                  1,099   1,566  NO
≤0,5       1,051   1,010  sí                  0,938   1,476  NO
≤1         1,289   1,017  sí                  0,958   1,352  NO
≤2         1,421   1,020  sí                  0,996   1,370  NO
≤4         1,483   1,030  sí                  0,700   1,427  NO
≤8         1,603   1,061  sí                  0,476   1,198  NO
```

Los seis anillos tienen potencia con `R2v`. El de ≤0,25 la tiene por poco
(1,013 contra 1,008): en el núcleo Gaia es incompleta y `c` es pequeña, así
que el doble conteo allí es pequeño. El estadístico de §0 no tiene potencia
en ninguno: confirma la lección de `AGENTS.md`.

**Conservación contra el modelo (AC3).** `(ΣF_cat+sint + ∫V1) / ∫Σ·S1_total`
por anillo. Listón **0,9-1,1** en cada anillo (fase 1 del ADR 0003). **Sustituido por §0 ter (#597)** antes de medir con las
correcciones de #590. El arnés
imprime al lado el mismo cociente con `V1` sin `(1 − c)`. Es solo
informativo: el ±10 % busca deriva del modelo y no doble conteo, y no se
fija con él.

**Fondo local.** p95 |Δm_res| **≤ 0,1** en cada anillo con celdas (pregunta 5
de §0, escala `θ_R/M`). Con las sintéticas, la luz no resuelta las incluye.

**Regla del veredicto.** «Sí» exige las cuatro cosas: criterio 2, criterio 3
en todos los anillos con potencia (si no hubiera ninguno con potencia, el
criterio 3 cuenta como no pasado), conservación contra el modelo y p95 ≤ 0,1.
Cualquier fallo da **«no se puede todavía»**. Ningún listón se mueve después
de medir.

## Resultados del segundo prerregistro (#577, 2026-11-19)

Salida: `node scripts/harness_fusion_blending.js` (M13, 467 mm, 173×, SQM 21,
`θ_sep = 1,043″`, 11 634 filas de miembros + 845 sintéticas dentro de 8 r_h).
La salida completa, con (a) FoF, producción, la pregunta 6 y los micro-casos,
está en `simulador_ocular/docs/validacion/fusion_blending_577.txt`. Abajo va
solo lo que decide.

Interpretación de AC4 (#577): «p95 |Δm_res| ≤ 0,1» se aplica tal cual, con el
estadístico de la pregunta 5 (local contra radial). El arnés no prototipa
`m_res(x, y)`, así que esa condición mide si el radial basta (#591).

```
── Criterio 2 (listón < 1e-6)
(b) imagen   0 en los seis anillos, peor celda 0, 0/12099 celdas   PASA

── Conservación contra el modelo (listón 0,9-1,1)
                   ≤0,25     ≤0,5       ≤1       ≤2       ≤4       ≤8
medida             1,110    0,986    0,953    0,836    0,758    0,985
                 NO PASA     PASA     PASA  NO PASA  NO PASA     PASA
contrafactual      1,110    0,990    0,990    1,003    0,978    1,205   (informativo)

── Criterio 3 (listón R2v ≤ 1 + 2σ; los seis anillos con potencia)
anillo      R2v       σ    1+2σ  veredicto     R2 LF entera (§0, sin potencia)
≤0,25      1,010   0,004   1,008  NO PASA            1,099
≤0,5       1,028   0,005   1,010  NO PASA            0,938
≤1         1,048   0,009   1,017  NO PASA            0,957
≤2         0,634   0,010   1,020  PASA               0,994
≤4         0,564   0,015   1,030  PASA               0,697
≤8         0,684   0,031   1,061  PASA               0,473

── Fondo local, p95 |Δm_res| (listón ≤ 0,1)
≤0,25 0,025 · ≤0,5 sin celdas · ≤1 0,109 · ≤2 0,084 · ≤4 0,046 · ≤8 0,014

══ Veredicto (§0 bis): NO SE PUEDE TODAVÍA — falla: criterio 3,
   conservación contra el modelo, p95 |Δm_res| ≤ 0,1
```

**Qué dicen los fallos** (lectura después de medir; los listones no se
mueven):

- **El criterio 3 no detecta doble conteo, detecta el modelo.** En ≤0,25 el
  contrafactual solo suma 0,003 (1,013 contra 1,010). Lo que saca R2v de
  `1 ± 2σ` es la realización del catálogo débil contra `LF·c`: exceso del
  1-5 % dentro de 1 r_h y déficit del 32-44 % fuera. Con `σ` de solo muestreo,
  el listón tiene potencia contra el doble conteo y también rechaza cualquier
  desajuste del modelo de unos pocos por ciento. Los dos efectos no se
  separan hasta que el modelo cuadre.
- **La conservación falla igual que antes de las sintéticas** (1,108 / … /
  0,758 sin ellas). #575 solo arregló el anillo exterior, como avisaba el
  ticket. El contrafactual `V1` sin `(1 − c)` queda dentro del ±10 % en ≤2 y
  ≤4: ese listón no distinguiría doble conteo (por eso era informativo).
- **El fondo radial no vale en ≤1 r_h** (0,109). Ya lo decía el punto 5 con
  0,111; el arnés todavía clasifica con el `m_res` radial.

**Prerrequisitos nuevos:**

- #590: que el modelo del cúmulo (perfil, normalización de la LF y
  completitud `c(m, r)` para m > 18) cuadre con el catálogo de M13. Cubre el
  criterio 3 y la conservación.
- #591: que el arnés mida con `m_res(x, y)` y que la condición del fondo se
  vuelva a prerregistrar.

## Atribución de los fallos del modelo (#590, spike, 2026-11-20)

Solo mide (criterio 1 de #590). No toca producción, ni el velo, ni los
listones de §0 bis, y no cambia el veredicto. Arnés:
`node scripts/harness_fusion_blending.js --atribucion [--corte-g 18.5]`. Sin
flags la salida es idéntica a `fusion_blending_577.txt`. Salida completa en
`simulador_ocular/docs/validacion/atribucion_590.txt`.

**Medida.** Por anillo y por rango de V (bordes en `borde ± 1, 2, 4` mag, en
bordes de bin): catálogo contra `∫Σ·num·c dΩ`, sintéticas contra
`∫Σ·num·(1 − c) dΩ`, en cuentas, flujo y flujo². `ΔS1` y `ΔR2v` son lo que
aporta cada rango al residuo de la conservación y de R2v. Por construcción
suman el residuo de §0 bis (≤4: `ΣΔS1 = −0,241` ⇒ 0,759).

**1. Truncado de la consulta, que `c(m, r)` no conoce.** Es el fallo de
≤2 y ≤4. El fixture llega a G ≤ 18,50 (V ≲ 18,61; V−G mediana 0,109 en
G > 18,25), y `completitud` pone el codo en `gaiaM50 = 20`. Producción
también corta: `magConsultaGaia(467, 0,9, 173) = 19,17`, techo
`GAIA_MAG_TOPE = 20`.

| anillo | cat/`num·c` 18,07-19,07 | 19,07-20,07 | ΣΔS1 (m > borde) | ΣΔR2v |
|---|---|---|---|---|
| ≤2 | 0,429 (c 0,91) | 2 de 3 684 | −0,103 | −0,366 |
| ≤4 | 0,454 (c 1,00) | 2 de 3 838 | −0,147 | −0,436 |
| ≤8 | 0,576 (c 1,00) | 4 de 1 123 | −0,128 | −0,316 |

Contrafactual `c·[V ≤ 18,609]` (`--corte-g 18.5`, fracción del bin): la
conservación de ≤2/≤4 pasa de 0,836/0,758 a 0,932/0,906 y R2v de
0,634/0,564 a 0,954/1,007. Las cuatro pasan.

**2. Completitud del núcleo demasiado pesimista.** Es el fallo de R2v en
≤0,25 / ≤0,5 / ≤1. El catálogo trae más estrellas que `num·c` justo donde
`c < 1`. En los brillantes con `c = 1` (14,07-16,07) cuadra: 0,96 / 0,99 /
0,84. Así que no es ni el perfil ni la normalización.

| anillo | 17,07-18,07 cat/mod (c medio) | 18,07-19,07 cat/mod (c medio) | ΔR2v 18-19 | R2v − 1 |
|---|---|---|---|---|
| ≤0,25 | 3,23 (0,16) | 3,9 (0,002) | 0,010 | 0,010 |
| ≤0,5 | 1,70 (0,46) | 1,9 (0,02) | 0,028 | 0,028 |
| ≤1 | 1,15 (0,88) | 1,04 (0,23) | 0,050 | 0,048 |

El codo de crowding (`mCrowd` con `gaiaCrowdingK = 30` y
`gaiaFwhmAs = 0,6`, ancla sin revisar) adelanta la pérdida de Gaia en el
núcleo. Con el corte de 1, ≤1 sube a 1,30 y R2v a 1,073.

**3. Anillo ≤8: exceso a toda magnitud.** Con `c = 1`, el catálogo da 1,01 /
1,69 / 1,98 / 1,31 sobre el modelo en los rangos ≤18,07 (433 contra 295
estrellas, 1,47), y 1,28 en 18-19 con el corte. En ≤4 da 1,03 y en ≤2 1,00.
Es el perfil exterior o el campo residual tras VB21. El exceso crece hacia
los brillantes, lo que encaja mejor con campo (LF más plana), pero esta
medida no separa las dos causas. Con el corte, ≤8 se va al otro lado:
conservación 1,133 y R2v 1,128.

**4. Muestreo de las gigantes.** El σ de Poisson del flujo por anillo,
`√(∫Σ·S2)/∫Σ·S1`, vale 0,077 / 0,054 / 0,041 / 0,042 / 0,058 / 0,107.
- La conservación de ≤0,25 (1,110) está a 1,4σ. Aportan +0,076 las V < 14,07
  (26 gigantes contra 18,8) y +0,065 el punto 2.
- En ≤4, V < 14,07 aporta −0,102 (20 contra 33,7).
- El listón ±10 % no tiene término de muestreo: en ≤8 es más estrecho que
  1σ. No se mueve (#590, criterio 2). Se declara para quien prerregistre.

**5. Forma de la LF en 14-17 (no decide ningún fallo).** 16,07-17,07 sale
1,27-1,98 sobre el modelo en todos los anillos con `c ≈ 1` (≥ 3σ), y
14,07-16,07 sale 0,84-0,86 en ≤1 y ≤2. Puede ser la LF o el G→V de las
gigantes rojas (3 174 filas sin color se quedan en G). En flujo pesa poco:
`|ΔS1| ≤ 0,03` por rango.

**Veredicto.** Sin cambios: «no se puede todavía». Con el contrafactual
también, porque fallan el criterio 3 en ≤0,25/≤0,5/≤1/≤8, la conservación
en ≤0,25/≤8 y el p95. El criterio 3 de #590 (repetir el veredicto tras el
arreglo) no aplica a este spike.

**Lo que tendría que arreglar la implementación de #590** (criterio 2: cada
parámetro con ancla):

1. `c(m, r)` multiplicada por `[G ≤ G_consulta]`. El ancla es la propia
   consulta: `magConsultaGaia` en producción y el corte del fixture en el
   arnés. Mejor por fila (V−G de cada estrella) que con la mediana del
   contrafactual.
2. Completitud del núcleo: re-anclar `gaiaCrowdingK` y `gaiaFwhmAs` con una
   medida externa de la completitud de Gaia en globulares. No vale ajustarlas
   a este catálogo: sería calibrar con la misma realización que se mide.
3. ≤8: separar perfil de campo, por ejemplo con la LF del exceso o con otra
   pertenencia.
4. El listón de conservación sin término de muestreo: lo decide el dueño,
   con un prerregistro nuevo.

## 0 ter. Tercer prerregistro: listón de conservación (#597, 2026-11-20, escrito ANTES de medir con las correcciones)

Sustituye **solo** el listón de la conservación contra el modelo de §0 bis.
El resto de §0 bis (criterio 2, criterio 3, fondo local, regla del veredicto)
no cambia. Se fija antes de correr el arnés con #594, #595, #596 y #591.

**Lo que ya se había visto al escribir esto** (ADR 0005, se declara):

- Toda la salida de §0 bis y de la atribución de #590 (arriba), sin
  correcciones: conservación 1,110 / 0,986 / 0,953 / 0,836 / 0,758 / 0,985.
- El σ de Poisson del flujo por anillo, 0,077 / 0,054 / 0,041 / 0,042 /
  0,058 / 0,107 (punto 4 de la atribución), y la tabla de potencia de abajo.
- Con el arnés sin correcciones, la regla nueva da: ≤1 pasa, ≤2 no pasa,
  total 0,912 no pasa, el resto sin potencia. No cambia el veredicto.

**Por qué cambia.** El ±10 % de §0 bis no tiene término de muestreo. En ≤8 es
más estrecho que 1σ: con un modelo perfecto ese anillo falla en torno a un
tercio de las realizaciones. En ≤0,25 la conservación de 1,110 está a 1,4σ, y
+0,076 lo traen 26 gigantes contra 18,8 esperadas.

**Listón.** Por anillo, y para la suma de los seis anillos (columna «total»):

```
q = (ΣF_cat+sint + ∫V1) / ∫Σ·S1_total        (igual que §0 bis)
σ = sqrt( ∫Σ·S2_total dΩ ) / ∫Σ·S1_total dΩ    (Poisson del flujo, del modelo)
pasa si |q − 1| ≤ 2σ
```

`σ` sale del modelo (perfil y LF de producción, Capa 1), no del catálogo: no
se ajusta a la realización que se mide. Si #596 cambia el perfil, `σ` y la
potencia se recalculan solos con el modelo nuevo; el listón no se toca a mano.

**Caso malo: deriva del modelo del 10 %** (lo que busca la fase 1 del ADR
0003). Si el modelo sobra un 10 %, `q` esperado es 1/1,1 = 0,909; si falta,
1/0,9 = 1,111. La distancia menor a 1 es **0,091**. Un anillo tiene
**potencia** si `2σ < 0,091`; sin potencia no cuenta ni a favor ni en contra
(como en el criterio 3).

**El ±10 % cambia de papel, y es una decisión consciente.** En la fase 1 del
ADR 0003 (y en §0 bis) el ±10 % era la tolerancia: lo que se dejaba pasar.
Aquí es la deriva que hay que detectar. Por eso el listón es más estricto que
la fase 1: el total exige que el modelo cuadre al ~4,4 % (`2σ = 0,044`), y
los anillos con potencia al ~8 %. Una deriva del 10 % que antes pasaba por
definición ahora tiene que rechazarse.

Tabla de potencia (corrida antes de medir con las correcciones):

```
anillo     2σ     deriva 10 %   con potencia   P(rechaza | q = 0,909)
≤0,25    0,155      0,091        NO             —
≤0,5     0,108      0,091        NO             —
≤1       0,082      0,091        sí             ≈ 0,59
≤2       0,084      0,091        sí             ≈ 0,57
≤4       0,115      0,091        NO             —
≤8       0,213      0,091        NO             —
total    0,044      0,091        sí             ≈ 0,98
```

`P(rechaza | q = 0,909)` es la probabilidad de que una deriva del 10 % caiga
fuera de `±2σ` con ruido gaussiano de anchura σ. «Con potencia» significa
que el listón rechaza la deriva **media** (`0,091 > 2σ`), no que la rechace
siempre: ≤1 y ≤2 la cazan algo más de la mitad de las veces. **El que
sostiene el criterio es el total**, que la rechaza 98 de cada 100.

**Regla.** La conservación pasa si pasan todos los anillos con potencia y el
total. Si nada tuviera potencia, cuenta como no pasada. Con un modelo
perfecto, cada fila juzgada falla un 5 % de las veces; con tres juzgadas,
una falsa alarma en torno al 13 %. Va en la dirección conservadora: un falso
«no pasa» no aprueba nada, solo retrasa el «sí»; un «sí» de más no se
detectaría.

**Límites declarados.** Una deriva del 10 % confinada en ≤0,25, ≤0,5, ≤4 o
≤8 no la ve ningún anillo: solo entra en el total, diluida. El ruido de las
gigantes no deja hacerlo mejor con un solo cúmulo. El contrafactual `V1` sin
`(1 − c)` sigue siendo informativo.

**Arnés.** `node scripts/harness_fusion_blending.js` imprime `q`, `2σ` y
PASA / NO PASA / «sin pot.» por anillo y para el total, y aplica la regla en
el veredicto. Nadie lo decide a mano. Ningún listón se mueve después de medir.
Desde aquí, la salida sin flags difiere de `fusion_blending_577.txt` solo en
el bloque de conservación y en la etiqueta del veredicto.

## Resultados (2026-11-16)

Salida completa: `node scripts/harness_fusion_blending.js --banda G` (M13, 467 mm, 173×,
SQM 21, `θ_sep = 1,043″`, 11 912 filas dentro de 8 r_h). Diagnóstico de banda:
`--banda V`. Desde #574 el arnés corre en V por defecto (la conversión es la de
producción, `magVGaia`) y la columna prerregistrada sale con `--banda G`.
Desde #575 el arnés deja fuera las estrellas de campo. Las tablas de este ADR
salen con `--todas`.

### Criterio 2: conservación por anillo y por celda (listón < 1e-6)

```
ley             ≤0,25    ≤0,5     ≤1      ≤2      ≤4      ≤8    peor celda  celdas ≥1e-6
(b) imagen      0       0       0       0       0       0       0             0/11739  PASA
(a) FoF         0     8e-16   3e-16   3e-16    0     1e-16    5,0e+2        144/11746  NO PASA
prod. 0012 A  2e-16   1e-15    0      3e-15    0     1e-15    1,0e+0      11735/11739  NO PASA
```

- **(b) pasa, y es una identidad** (prerregistrado así): la luz no se mueve.
  Lo que prueba es que la partición cierra. A favor de (b) no prueba nada.
- **(a) no pasa.** Pasa por anillo, pero el blob en el centroide saca de la
  celda de su estrella el 1,47 % del flujo catalogado. El peor caso lleva a
  una celda 500 veces su flujo. Es la objeción del criterio, medida.
- **Producción no pasa en ninguna celda.** Conserva por anillo: lo que el
  sorteo quita se reparte por el anillo, y por eso solo conserva en media. Es el
  «límite que NO arregla» del ADR 0012, ahora con número.

### Criterio 3: el grano no cuenta dos veces (listón R2 ≤ 1 + 2σ)

```
              G tratada como V (prerregistrado)        G→V EDR3 (diagnóstico)
anillo        R2      1+2σ    veredicto              R2      1+2σ    veredicto
≤0,25       2,099    2,194    PASA                 1,132    1,570    PASA
≤0,5        2,010    2,260    PASA                 0,938    1,476    PASA
≤1          2,006    1,872    NO PASA              0,957    1,352    PASA
≤2          2,189    1,922    NO PASA              1,019    1,373    PASA
≤4          1,592    2,131    PASA                 0,748    1,433    PASA
≤8         55,52    45,38     NO PASA             29,77    23,26     NO PASA
```

**Tal como se prerregistró, el criterio 3 NO PASA** (3 de 6 anillos). El
listón no se mueve. Además, ni sus PASA ni sus NO PASA dicen nada del doble
conteo, por dos motivos:

- **La ausencia de doble conteo es álgebra, no medida.** `c + (1 − c) = 1`: el
  velo lleva exactamente la parte que el catálogo no trae. Lo que R2 compara
  es la realización del catálogo contra la LF, o sea el diagnóstico del ADR
  0003 en el segundo momento.
- **El estadístico no tiene potencia.** `1 + 2σ` llega a 2,26, así que un
  doble conteo completo (R2 ≈ 2) pasaría. Los anillos ≤0,25 y ≤0,5 «pasan»
  con R2 ≈ 2. Prerregistrarlo así fue un error del prerregistro, y se
  registra (ADR 0005).

Lo que sí informa es la causa del exceso, medida en un diagnóstico **añadido
después de ver el fallo** y marcado como tal:

1. **La banda.** El S2 lo dominan las gigantes rojas (BP−RP ≈ 1-1,5), y ahí
   G − V ≈ −0,2 a −0,45 mag. Tratar G como V infla F² por 1,7-2,3. Con la
   conversión G→V de Gaia EDR3 (doc. CU5, tabla 5.7, σ = 0,03 mag), R2 queda
   entre 0,75 y 1,13 en los cinco anillos interiores. Producción también trata
   G como V (`estrellasCumulo`). Es una deuda previa que la partición destapa.
2. **El anillo exterior son estrellas de campo.** También en V sigue sin
   pasar (R2 = 29,8). El diagnóstico ADR 0003 da `(ΣF_cat + ∫V1)/∫Σ·S1 = 3,2`
   en 4-8 r_h, y la estrella más brillante del anillo (V = 10,6) no es del
   cúmulo. El fixture no separa miembros: es el mismo riesgo de #570.

**Cuánto grano contaría dos veces el velo de producción.** Restringido a lo
que no se resuelve (`m > m_res(r)`), la parte catalogada de S2 es del 95 % al
98 % según el anillo. Si la luz catalogada sub-`m_res` se queda en su sitio y
el velo sigue con el `S2campo` de producción, esa fracción se cuenta dos veces.
El velo **tiene** que llevar `(1 − c)`.

### Micro-casos (preguntas 1 a 3)

El número de picos depende de la profundidad de valle que se exija para
contar dos. Se corre con las dos referencias. La primera es 0, Sparrow: basta
un mínimo. La segunda es 0,265, Rayleigh: es el valle del par igual de Airy, y
la gaussiana da 26,6 % a 1 θ, así que reproduce el ancla de `θ_sep`.

```
caso                               (a) FoF    (b) Sparrow   (b) Rayleigh   pico − centroide
par igual, 0,50 θ                  1          1             1               0,000 θ
par igual, 0,75 θ                  1          2             1 alargada
par igual, 0,95 θ                  1          2             1 alargada
par Δm=2, 0,95 θ                   1          1             1              −0,126 θ
par Δm=2, 1,50 θ                   2          2             2
par Δm=0,75, 0,95 θ                1          2             1 alargada
cadena A–B–C igual, paso 0,60 θ    1          1             1               0,000 θ
cadena A–B–C igual, paso 0,90 θ    1          3             1 alargada
```

**Con el umbral de Rayleigh, (a) y (b) dan el mismo número de puntos en todos
los micro-casos.** La ventaja de (b) en las cadenas y en los pares desiguales
solo existía con Sparrow. A eso se suma el criterio de la casa para el OJO
(`resolucionDoble`, `bitacora-ocular.js`): hace falta `aum·sep ≥ 300″` para
empezar a partir un par. A 173× eso son 1,73″ = 1,66 θ_sep. A este aumento el
ojo funde más de lo que funde `θ_sep`.

### Preguntas 5 y 6 (escala `θ_R/M = 32,5″`)

```
anillo   p95|Δm_res|  máx|Δm_res|  pregunta 5     RMS δI/(Fcielo+I)  RMS/Cmin
≤0,25       0,015        0,039     radial vale        3,1e-2          0,050
≤0,5        (ninguna celda de 32,5″ tiene su centro en el anillo)
≤1          0,111        0,138     LOCAL              1,1e-1          0,170
≤2          0,090        0,110     radial vale        9,6e-2          0,155
≤4          0,046        0,085     radial vale        5,0e-2          0,080
≤8          0,019        0,056     radial vale        1,9e-2          0,031
```

## Respuestas

**1. La ley del blob.** Flujo `ΣF`, sí: todo el que cae en el pico. La
posición **no** es el centroide pesado por flujo. Si el pico es uno de verdad,
es el máximo de la imagen sumada, que se va hacia la componente brillante
(−0,13 θ en un par Δm = 2 a 0,95 θ). Si el umbral de valle funde dos picos,
no es un punto: es una mancha alargada, y dibujarla en el centroide le
inventa una forma. Visibilidad: la misma
ley de umbral que una estrella sola, aplicada al flujo del pico. Argumento
óptico: un pico sin estructura interna es, para el ojo, indistinguible de una
estrella de ese flujo. El umbral puntual integra en el área de Riccò
(`θ_R/M = 31 θ_sep` aquí), así que no ve la estructura por debajo de `θ_sep`.
Dos estrellas a `m_res + 0,6` a 0,5 θ dan un pico a `m_res − 0,15`, que se ve.
Hoy no aparecen.

**2. Cómo se agrupa: gana (b), pero no por el número de puntos.** Argumento
óptico: el telescopio no agrupa estrellas, suma sus PSF. (a) es una
aproximación de (b). Con un umbral de valle de Rayleigh, las dos coinciden en
cuántos puntos hay en todos los micro-casos. Lo que separa a (b) no depende
del umbral:
- **Conservación local:** (a) dibuja el blob en el centroide y saca de su
  celda el 1,47 % del flujo catalogado de M13. (b) no mueve luz (criterio 2).
- **Forma y posición:** (b) dibuja lo que hay, un pico desplazado hacia la
  brillante o una mancha alargada. (a) dibuja un punto en el centroide. El
  56 % de los grupos múltiples de M13 son más anchos que `θ_sep`, y el más
  ancho mide 3,3 θ: FoF los convierte en puntos.
- **Sin agrupamiento a mano:** las cadenas no necesitan regla. La imagen las
  resuelve con el mismo umbral que un par.

**Lo que (b) no resuelve sin decidir antes:** el umbral de resolución, que es
un parámetro (ver «Parámetros»). Hay dos anclas en la casa y no coinciden.
Rayleigh sobre la PSF es el ancla de `θ_sep` del ADR 0012. El ojo pide
`aum·sep ≥ 300″` (`resolucionDoble`), que a 173× es 1,66 θ_sep y depende del
aumento, cosa que `θ_sep` no hace.

**3. `Δmag` sobra.** La razón de brillos entra por el perfil de la imagen, sin
parámetro propio. Con Rayleigh, un par Δm = 2 a 0,95 θ da un pico desplazado y
un par Δm = 0,75 da una mancha alargada. Con Sparrow, el primero da un pico y
el segundo dos. En los dos casos lo decide el perfil y no un `Δmag`. FoF
tampoco lo usa: funde a cualquier Δm. `Δmag = 0,75` solo existía porque
`aCrowd` es un conteo sin perfil.

**4. La partición.**

```
imagen   = Σ_{catálogo} F_j·PSF(x − x_j)  +  Σ_{sintéticas} F_s·PSF(x − x_s)  +  V1(r)
V1(r)    = Σ(r) · Σ_k num_k·f_k  ·(1 − c(m_k, r))   [solo m_k > mCutGeneracion]
V2(r)    = Σ(r) · Σ_k num_k·f_k² ·(1 − c(m_k, r))   [ídem]
```

- Conserva por anillo y por celda (criterio 2). No cuenta dos veces el grano,
  por álgebra (`c + (1 − c) = 1`); el criterio 3 no lo podía medir (ver arriba).
- La fluctuación de la luz catalogada es real y la trae el catálogo. El grano
  sintético (ADR 0015) solo lleva `V2`, la parte no catalogada.
- **Sintéticas:** entran en la suma como cualquier estrella. Son una
  realización de `(1 − c)·LF` para `m ≤ mCutGeneracion`, así que su parte sale
  de `V1`/`V2` (de ahí el corchete). Sus posiciones son aleatorias, y por eso
  sus fusiones son una realización de Poisson, no estructura. Es la misma
  estadística que el ADR 0012 sorteaba, ahora sin sorteo. Excluirlas de la suma
  obligaría a tratar su luz aparte, y eso es un doble camino.
- **Prerrequisitos** (destapados por el criterio 3, no son de la partición):
  flujo del catálogo en la banda de la LF (G→V con BP−RP) y separar miembros de
  campo en el halo exterior.

**5. El fondo local deja de ser radial: `m_res(x, y)`.** Por el listón
prerregistrado: p95 |Δm_res| = 0,111 > 0,1 en 0,5-1 r_h. Es un margen
estrecho, y se declara así. La escala correcta del fondo de un punto es la de
integración del ojo, `θ_R/M` (Riccò, ya calibrada en H2c), no `θ_sep`. El
punto fijo del ADR 0012 (B) (N = 5 desde `m_res = +∞`) se conserva como
esquema numérico; lo que cambia es su dominio, que pasa de anillos a celdas de
`θ_R/M`. Límite: el anillo 0,25-0,5 r_h no tiene celdas a esta escala.

**6. Los ríos oscuros.** No hay fuente primaria que diga positivamente que son
fluctuación de la distribución de estrellas. Lo que se encontró es divulgación
(APOD 2025-08-14, Sky & Telescope) y no se cita como evidencia. Lo que sí hay
es la fuente primaria que **descarta el polvo**: Barmby et al. 2009 (AJ 137,
207; Spitzer/MIPS, M13 entre los ocho cúmulos). Da para M13 una masa de polvo
< 1,5e-4 M☉ en total y < 2,3e-5 M☉ en el núcleo (3σ). Argumento de orden de
magnitud:
- **Supuesto de geometría, no medida:** tres bandas de 1′ × 0,1′ a 7,1 kpc,
  que ocupan 1,2e37 cm².
- Con `N_H/A_V = 1,87e21 cm⁻² mag⁻¹` (Bohlin, Savage & Drake 1978, ApJ 224, 132:
  `N_H/E(B−V) = 5,8e21`, con R_V = 3,1; **original no abierto**, valor
  comprobado en citas secundarias)
  y polvo/gas 0,01, una banda de `A_V = 0,02` (un 2 % de oscurecimiento, del
  orden del contraste umbral) pide unos 5e-3 M☉ de polvo.
- Son unas 35 veces el límite total de Barmby.

Por eliminación, los ríos son distribución de estrellas, y la ley candidata
los tiene que reproducir sin parámetro nuevo.

**Qué componente los dibuja: los puntos resueltos.** Leído de producción
(ADR 0008): la ley del grano del ADR 0015 (`tabla.sGrano`, P(ver)) da **0 en
todos los anillos** para el `S2campo` de producción. Esa es la varianza
esperada de toda la luz sub-`m_res`. La partición la reparte entre `V2` y la
fluctuación real del catálogo no resuelto, con el mismo valor esperado. Por
eso la luz no resuelta no puede dibujar ríos con la ley de la casa.
- Límite: es el valor esperado; una realización concreta puede fluctuar por
  encima.
- El contraste RMS contra `Cmin` que también imprime el arnés (0,03-0,17) es
  el estadístico que el ADR 0015 (punto 2) descarta para esta luz. Queda como
  indicio y no se usa como argumento.

Los ríos, si se ven, los dibujan los puntos resueltos, que ya están en sus
posiciones de Gaia. `capaEstrellas` ya suma en flujo los sprites solapados
(#541), así que un par muy cerrado no se ve hoy como dos puntos. Lo que (b)
cambia de verdad es otra cosa:
- se va el sorteo, que borra estrellas al azar según la densidad media del
  anillo y no según sus vecinas reales;
- el umbral se juzga sobre el pico, de modo que dos estrellas sub-`m_res`
  juntas se ven;
- la luz sub-`m_res` se queda en su sitio.

Que los ríos de M13 se vean es una predicción de (b) que se comprueba
después, no un argumento a favor.

## Veredicto

**«No se puede todavía»**, por la regla fijada en el ticket: el criterio 3
prerregistrado no pasa. Lo que sí queda decidido:

- **Pregunta 2: gana (b), la imagen sumada; (a) se descarta.** Es por
  conservación local, forma y posición, no por el número de puntos.
  Esta parte no depende de #590 ni de #591 (2026-11-20). La partición
  `(1 − c)` y la retirada de 0012 (A) siguen pendientes del criterio 3 de
  §0 bis: con `c` mal, `(1 − c)` es un doble conteo (atribución de #590).
- **La partición con `(1 − c)`** cierra por anillo y por celda.

**Qué falta para el «sí»:**

1. El flujo del catálogo en la banda de la LF (G→V con BP−RP). Con eso, R2
   queda entre 0,75 y 1,13 en los cinco anillos interiores.
   **Hecho en #574**: `estrellasCumulo` juzga el catálogo en V; sin color
   válido la fila se queda en G (3 174 de 11 972 filas del fixture de M13).
2. Separar miembros de campo en el halo exterior (#570).
   **Hecho en #575** para el arnés: pertenencia de Vasiliev & Baumgardt 2021
   (`memberprob < 0,5` y astrometría limpia o G < 13;
   `simulador_ocular/docs/notas/pertenencia-vb21.md`). Con solo miembros, el
   diagnóstico ADR 0003 de 4-8 r_h pasa de 3,20 a 0,985 en V, y R2 de 29,8 a
   0,47. `estrellasCumulo` saca como campo la fila marcada. Las filas de
   producción todavía no llevan la marca (#583).
3. Fijar el umbral de resolución de (b): Rayleigh sobre la PSF (ancla de
   `θ_sep`) o la resolución del ojo `aum·sep ≥ 300″` (`resolucionDoble`).
   Las dos anclas de la casa no coinciden.
   **Hecho en #576** (ADR 0040): valle 0,265 (Rayleigh) para el blending y
   para las dobles; el `aum·sep ≥ 300″` del ojo queda sin ancla y fuera.
4. Un criterio 3 con potencia. El de este prerregistro dejaba pasar un doble
   conteo completo.
   **Hecho en #577** (§0 bis): R2v en el dominio del velo, con contrafactual
   corrido; tiene potencia en los seis anillos.
5. La conservación contra el flujo del MODELO, que no es el criterio 2. El
   criterio 2 solo prueba que la contabilidad cierra. El diagnóstico ADR 0003
   `(ΣF_cat + ∫V1)/∫Σ·S1` da 1,29 / 1,13 / 1,11 / 1,02 / 0,95 / 4,08 por
   anillo en G. El anillo del núcleo y el exterior quedan fuera del ±10 % de
   la fase 1. Es la misma causa que el criterio 3 (banda y campo), y en V da
   1,12 / 0,99 / 0,95 / 0,84 / 0,79 / 3,20.
   **Medido en #577** como criterio (±10 %): con sintéticas y solo miembros,
   1,110 / 0,986 / 0,953 / 0,836 / 0,758 / 0,985. No pasa (#590).

**Veredicto repetido en #577 (§0 bis): sigue «no se puede todavía».** Fallan
el criterio 3, la conservación contra el modelo y el fondo radial. Los
prerrequisitos nuevos son #590 (el modelo cuadra con el catálogo) y #591
(`m_res(x, y)` en el arnés). No se abre ticket de implementación y #542 sigue
abierto.

## Qué sustituye del ADR 0012

Si se implementa (b):

- **(A), entera.** Fuera el sorteo Bernoulli de las catalogadas: el blending
  sale de las posiciones, de forma determinista.
- **`Δmag`** (`CFG.dmagCrowd`) sale.
- **`aCrowd` y `θ_sep` como ley** salen para el catálogo. `θ_sep` sobrevive
  solo como tamaño de celda de los tests.
- **(B)** se conserva como esquema numérico (N = 5), con dominio local `θ_R/M`.
- **El reparto `(1−a)·F` al velo** sale. El velo lleva `(1 − c)`, no `(1 − a)`.

## Parámetros

| parámetro | entra/sale | ancla |
|---|---|---|
| `Δmag = 0,75` | sale | sin ancla (ADR 0012 ya lo declaraba) |
| `thetaSepRadios = 1` como ley de mezcla | sale | tenía ancla (Rayleigh); lo sustituye el umbral de valle sobre la PSF |
| sorteo Bernoulli `C.sorteo` | sale | sin parámetro |
| umbral de resolución de la imagen sumada (profundidad de valle, o `aum·sep` del ojo) | entra | **Rayleigh, valle 0,265** (ADR 0040), el ancla de `θ_sep`. Descartados: Sparrow 1916 (valle 0) y `resolucionDoble` (`aum·sep ≥ 300″`, sin ancla) |
| forma de la PSF del pico | entra | `radioImagenEstelar` (Airy ⊕ seeing), ya anclado |
| escala del fondo local `θ_R/M` | entra | Riccò, la de H2c (ya calibrada) |
| `completitud` en el velo (`gaiaM50`, `gaiaAncho`, `gaiaFwhmAs`, `gaiaCrowdingK`) | entra en el velo | los existentes de `CFG`; su ancla no se revisa aquí |
| G→V con BP−RP | entra (prerrequisito) | Gaia EDR3, doc. CU5, tabla 5.7 (σ = 0,03 mag) |
| `mCutGeneracion = 18` como corte de `V1`/`V2` | entra en el velo | el existente de `CFG` (profundidad de la realización sintética); ancla no revisada aquí |
| `pasadasPuntoFijo = 5` | se queda | ADR 0012 (B), medido en `punto_fijo.md`; con dominio local está sin volver a medir |
| listón de la pregunta 5 (p95 < 0,1 mag) | solo del spike | sin ancla: prerregistrado como umbral de decisión, no entra en el modelo |
| PSF gaussiana FWHM 0,84 θ (micro-casos) | solo del spike | razón FWHM/radio del primer anillo de Airy (1,03/1,22); atajo declarado |

Ninguna cifra de estrellas dibujadas se usa en este ADR a favor ni en contra.

## Límites declarados

- El fixture no trae los pares más cerrados que 0,6″ (FWHM de Gaia). Lo
  fundido sobre el catálogo se queda corto en el núcleo.
- La PSF de los micro-casos es gaussiana (FWHM 0,84 θ). Su valle a 1 θ (26,6 %)
  reproduce Rayleigh. Con Airy ⊕ seeing se moverán las separaciones umbral; la
  conclusión del criterio 2 no depende de la PSF.
- La pregunta 5 usa el `m_res` de producción para clasificar «no resuelta».
  Con el velo `V1` el `m_res` cambia algo.
- Un solo cúmulo y un solo equipo. Generalizar es trabajo de la implementación.
- ~~La parte sintética de la partición no se ha prototipado.~~ Prototipada en
  #577: las sintéticas entran en la suma y `V1`/`V2` llevan solo
  `m_k > mCutGeneracion`. Con `--banda G` las sintéticas siguen en V.
- La decisión de la pregunta 5 («local») descansa en un solo anillo (0,111
  contra 0,1). El anillo 0,25-0,5 r_h no tiene celdas a esa escala.
- La pregunta 6 se cierra por eliminación del polvo, no con una fuente
  positiva.
- El FoF es código nuevo. El bucle de `harness_crowding_k.js:99` pregunta, para
  cada estrella, si tiene vecina, pero no construye grupos transitivos, así que
  no servía para agrupar. Las definiciones de anillo sí se reutilizan.
- Los micro-casos cuentan picos de configuraciones sintéticas, no estrellas
  dibujadas del catálogo. La conclusión de la pregunta 2 no se apoya en ese
  número, sino en la conservación, la forma y la posición.

## Guardianes que la implementación tendrá que reescribir

`grep -lE "aCrowd|sorteo\(|S1campo|S2campo|Fdibujado|dmagCrowd|estrellasCumulo|pasadasPuntoFijo" scripts/*.js`:

- Tests: `test_crowding_psolo`, `test_conservacion_sorteo` (pasa a conservación
  por celda), `test_cumulo_render`, `test_cumulos`, `test_grano_sbf`,
  `test_sbf_momentos`, `test_halo_v7_e1`/`e2`/`e4`, `test_cola_glow_rt`,
  `test_halo_exterior_lineal`, `test_censo_crumey`,
  `test_veredicto_rotura_nucleo`.
- Matrices y arneses: `matriz_m13`, `veredicto_rotura_nucleo`,
  `harness_atenuacion_bernoulli`, `harness_thetasep`, `harness_punto_fijo`,
  `harness_crowding_k`, `harness_doble_conteo_cola`, `harness_halo_v7`,
  `harness_grano_sbf`, `harness_mres_vs_schaefer`,
  `harness_tres_modelos_mres`, `harness_censo_crumey`.
