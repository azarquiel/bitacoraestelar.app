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

Listón: **R2v ≤ 1 + 2σ**. **Sustituido por §0 quater (#599)** antes de medir con las correcciones de #590. `j` recorre catálogo y sintéticas (las sintéticas
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
`node scripts/harness_fusion_blending.js --atribucion [--corte-g 18.5]`.
Cuando se escribió, sin flags la salida era idéntica a
`fusion_blending_577.txt`. Desde #594 el arnés aplica por defecto el corte
del fixture; `--corte-g 99` lo quita. Salida completa en
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
   con un prerregistro nuevo. Hecho en §0 ter (#597).

## Corte de la consulta en la completitud (#594, 2026-11-23)
Primera corrección de la atribución. `pob.completitud(m, r, G_c)` vale
`c(m, r)·[G(m) ≤ G_c]`, interpolado dentro del bin con G − V del color
sintético del tramo de la LF (el que llevan las sintéticas). En la gigante
G − V = −0,366: con la mediana 0,109 del contrafactual el bin caería fuera
entero (`scripts/test_completitud_corte.js`).

**Por bin y no por fila (desviación de AC1 de #594).** El ticket pedía el
V − G de cada estrella del catálogo. `completitud` se evalúa sobre los bins
de la LF del modelo, que no tienen fila de catálogo detrás: el velo es
`Σ num·f·(1 − c)` por bin. El color que corresponde es el del tramo de la LF,
el mismo con que nacen las sintéticas. Las filas del catálogo no pasan por `c`:
o llegaron (G ≤ magQ) o no.

**Ancla.** `G_c = magQ`, lo que se pidió: `magConsultaGaia` cuantizada 0,5
hacia arriba, la misma que llega al banco y al proxy. `consultar` la deja en
`estrellas.corte` por los tres caminos (proxy, Avance, banco). Con banco
por encima del techo **no** es `fondo.corte`: la banda
`(fondo.corte, magQ]` entra por `veloSB`, y `G_c = fondo.corte` la metería
otra vez en `(1 − c)` (×54 en la banda; test con su caso malo). En el arnés,
el corte declarado del fixture (`--corte-g`, 18,5 por defecto; `--corte-g 99`
reproduce el arnés de #590).

**Decisión: el corte entra solo en el velo, no en la realización.** Las
sintéticas siguen con `c` sin corte y la clave de `poblacionCacheada` no
lleva el equipo («cambiar de telescopio reclasifica, no regenera»). Coste:
con `magQ < mCutGeneracion` las estrellas con G entre `magQ` y 18 no se
generan ni las trae Gaia. Medido que ese hueco queda bajo `m_res` en todo
radio, con el cielo más oscuro de la UI: 80 mm 40× (`magQ` 16,0, `m_res`
máx 12,95 contra V ≥ 16,37), 80/20×, 120/60×, 150/75×. El margen es la
cola del glow + 0,3 de `magConsultaGaia`; el test lo vigila. Revertir esta
decisión es meter el corte en la clave de la caché y regenerar por equipo.

**Producción hoy.** `S1campo`/`S2campo` siguen sin `c` (ADR 0012): el corte
no cambia ningún píxel hasta que el velo `V1`/`V2` entre en el render.

**Arnés con el corte del fixture** (`fusion_blending_594.txt`, sobre el de
#590):

| anillo | conservación (antes) | R2v (antes) | 2σ de R2v |
|---|---|---|---|
| ≤2 | 0,929 (0,836) | 0,941 (0,634) | 0,022 |
| ≤4 | 0,903 (0,758) | 0,994 (0,564) | 0,030 |

Con los listones sin mover, ≤2 y ≤4 quedan en 0,9-1,1 y `R2v ≤ 1 + 2σ`,
que es lo que pedía AC2. Margen justo: la conservación de ≤4 está 0,003 por
encima del suelo (y sin potencia en §0 ter), y con el listón de dos colas de
§0 quater ≤2 sigue sin pasar (0,941, 5σ por debajo). Las cuatro cifras
salen algo peores que con el contrafactual de la mediana (0,932 / 0,906 /
0,954 / 1,007): con el color del bin (|G − V| ≥ 0,132 contra 0,109) el
corte cae algo más débil en V, el modelo da más estrellas por catalogadas y
el velo lleva algo menos.
El veredicto sigue en NO SE PUEDE TODAVÍA (criterio 3 en ≤0,5/≤1/≤8 y la
pregunta 5): son las correcciones 2 y 3, fuera de #594.

## Completitud del núcleo con medida externa (#595, 2026-11-23)
Segunda corrección de la atribución. `gaiaCrowdingK` pasa de 30 a **75**;
`gaiaFwhmAs` se queda en 0,6″ y la forma de `c` no cambia.

**Medida.** Fabricius et al. 2021 (A&A 649, A5), Tabla A.1: completitud de
Gaia EDR3 contra HST/ACS (Sarajedini et al. 2007) en 26 globulares, por bins
de G de 2 mag, en el núcleo (r < 0,5′) y fuera (0,5′-2,2′). Copia en
`simulador_ocular/docs/validacion/fabricius2021_tabla_a1.csv`. El modelo se
promedia como mide la tabla: campo ACS de 202″ centrado, pesos `Σ(r)·num(m)`,
G del color sintético del bin.

**Ajuste sin M13.** `c` solo depende de `k·FWHM²` (`mCrowd` usa
`1/(k·Σ·Ω)`), así que basta un parámetro. Sobre los 24 cúmulos que no son
M13 (Lynga 7 no está en el catálogo), 327 celdas:

| k | sesgo (puntos %) | rms |
|---|---|---|
| 30 (antes) | +10,2 | 23,5 |
| 50 | +4,4 | 19,3 |
| 75 | −0,4 | 17,7 |
| 100 | −4,0 | 18,0 |

El sesgo se anula en k ≈ 72 y el rms es plano entre 70 y 90: k = 75. El
listón de sesgo del test es dentro de muestra (guarda k, no lo valida). M13
queda fuera del ajuste y es la prueba: rms 7,6 puntos con k = 75 y 19,8
con k = 30. Los cúmulos poco densos (NGC 5053, NGC 5466, Pal 1, Pal 2)
prefieren k → 0: ahí no manda el crowding sino el codo de campo abierto
(`gaiaM50`, `gaiaAncho`), que no se toca aquí.
`scripts/test_completitud_fabricius.js` fija sesgo |·| ≤ 3 y rms de M13
≤ 10, con k = 30 como caso malo (lo rechazan los dos).

**La hipótesis del ticket era la contraria.** La medida externa dice que con
k = 30 la `c` del núcleo era **optimista**, no pesimista: Gaia pierde más
estrellas de las que el modelo creía. Con k = 75 el cociente catálogo /
`∫Σ·num·c` en 17-19 se aleja de 1 (`fusion_blending_595.txt`):

| anillo | 17,07-18,07 k=30 → 75 | 18,07-19,07 k=30 → 75 | R2v k=30 → 75 |
|---|---|---|---|
| ≤0,25 | 3,2 → 68 000 (c 0,16 → 0,000) | 4,2 → 2·10⁵ | 1,011 → 1,013 |
| ≤0,5 | 1,7 → 285 (c 0,46 → 0,003) | 2,1 → 2 400 | 1,028 → 1,051 |
| ≤1 | 1,15 → 2,8 (c 0,88 → 0,36) | 1,28 → 13,7 | 1,071 → 1,267 |

AC2 no se cumple dentro de ±2σ y **se declara el residuo**: no es `c`. El
catálogo trae en el núcleo filas que no son una estrella recuperada con su
magnitud. Indicios:
- Filas miembro con G 16,5-18,5 sin BP−RP (`fusion_blending_595.txt`,
  «Filas sin BP−RP»): 205/260 (79 %) en ≤0,25, 597/804 (74 %) en ≤0,5,
  1 486/2 683 (55 %) en ≤1, 702/3 230 (22 %) en ≤2, 9/707 (1 %) en ≤8. Es la firma de fuentes mezcladas:
  Fabricius et al. 2021 dan 20-30 % sin BP/RP en globulares y fotometría del
  núcleo desplazada en color y magnitud.
- Esas filas quedan en G (sin color no hay G→V) y su flujo incluye el de
  vecinas más débiles, que el velo `(1 − c)` también cuenta.

El doble conteo es de **flujo de las mezclas**, no de `c`: la `c` de
Fabricius es la de una estrella recuperada con su magnitud (lo que el velo
necesita), y la cuenta del catálogo mezcla esas con mezclas. Arreglarlo es
quitar al velo el flujo que las filas mezcladas ya traen: #611, fuera de
#595.

**Conservación (§0 ter).** Mejora el total (0,966 → 1,015) y ≤1
(0,958 → 1,024, pasa). **Empeora** ≤0,25 (1,110 → 1,232, sin potencia) y
≤0,5 (0,987 → 1,062, sin potencia): es el mismo doble conteo de mezclas.

**R2v (AC3, listones sin mover).** Coste declarado:

| anillo | k = 30 | k = 75 |
|---|---|---|
| ≤0,25 | 1,011, sin potencia | 1,013, sin potencia |
| ≤0,5 | 1,028, **NO PASA** | 1,051, sin potencia |
| ≤1 | 1,071, NO PASA | **1,267**, NO PASA |

≤0,5 no pasa a aprobar: sale del juicio, porque con `c ≈ 0` no quedan
catalogadas en el dominio del velo y 2σ ≈ 0. ≤1 empeora por el doble conteo
de las mezclas. El veredicto sigue en NO SE PUEDE TODAVÍA.

**En producción.** `c` decide qué sintéticas nacen: con k = 75 nacen más en el
núcleo (M13 dentro de 8 r_h: 845 → 2 204). El velo `V1`/`V2` sigue fuera del
render (ADR 0012), así que la `c` nueva cambia las sintéticas que se dibujan,
no el difuso.

## Filas mezcladas del núcleo (#611, 2026-11-23)
Tercera corrección de la atribución: el doble conteo de flujo que dejó #595.

**Criterio (AC1).** Fila mezclada = la que no pasa el filtro de fuente única
de Fabricius et al. 2021, §3.3: `ruwe < 1,4` y `ipd_frac_multi_peak ≤ 2` y
`ipd_gof_harmonic_amplitude < 0,1`. Sin `ruwe` (solución 2p) también es
mezcla: más de la mitad de las 2p a G < 19 se deben a una vecina (mismo
artículo, §2.6). Es la fuente que ancla `gaiaCrowdingK`, y ningún umbral se
ha tocado. Descartados por definición, no por su resultado en M13:
`ipd_frac_multi_peak > 2` solo (Tokovinin 2023: criterio de pares resueltos
de binarias, no un filtro de fuente única publicado para cúmulos) y el exceso corregido C*
(Riello et al. 2021), que necesita BP−RP: justo lo que les falta a las
mezclas. Columnas en `m13_gaia_dr3_mezcla.csv` (`scripts/gen_m13_mezcla.py`,
Gaia DR3, cruce 1:1 con el fixture).

**Qué hace con ellas.** Una fila mezclada pesa `c(m, r)` de su propia
magnitud en la contabilidad de luz del arnés (conservación, R2v, pregunta 5 y
atribución). `c` es la fracción que Fabricius cuenta como estrella recuperada;
la parte `(1 − c)` ya la ponen las sintéticas y el velo. Sin parámetro nuevo.
Donde `c ≈ 1` (fuera del núcleo, brillantes) la fila queda entera. El
criterio 2 (dibujo) no cambia: la mezcla se dibuja igual.
`--mezcla 0` reproduce `fusion_blending_595.txt` byte a byte; `--mezcla 2`
pesa todas las filas por `c` (contrafactual sin criterio).

**Marcadas** (G 16,5-18,5, miembros y campo): 260/260 en ≤0,25, 804/804 en
≤0,5, 2 629/2 683 en ≤1, 2 296/3 230 en ≤2, 437/1 891 en ≤4, 41/847 en ≤8.
Dentro de 1 r_h el filtro marca casi todo, porque ahí toda fila tiene vecina.

**AC2, atribución en 17-19** (`fusion_blending_611.txt`), cat/`num·c` ± 1σ:

| anillo | 17,07-18,07 (#595 → #611) | 18,07-19,07 (#595 → #611) |
|---|---|---|
| ≤0,25 | 68 000 → 0 filas contra 0,07 (sin potencia) | 2·10⁵ → 0,08 ± 131 (sin potencia) |
| ≤0,5 | 285 → 0,95 ± 0,70 | 2 357 → 0,30 ± 4,7 (sin potencia) |
| ≤1 | 2,79 → **1,06 ± 0,046** | 13,7 → **1,05 ± 0,11** |

Dentro de ±2σ en los tres. Potencia real solo en ≤1: en ≤0,25 y ≤0,5 el
modelo espera 0,07 y 2 estrellas. **El criterio aporta fuera del núcleo**: con
todas las filas pesadas por `c` (`--mezcla 2`, contrafactual sin marcar), ≤1
18-19 cae a 0,84 y ≤2 18-19 a 0,85 (−5,8σ); con el criterio, 1,05 y 0,91.
El 0,91 de ≤2 sigue a −3,5σ: no pasa, y ≤2 está fuera de AC2.

**Límite: dentro de 1 r_h la prueba es débil.** El filtro marca casi todas las
filas (2 629 de 2 683 en ≤1), así que el catálogo pesado vale ≈ N_filas·c̄ y
`c` se cancela en cat/`num·c`: el cociente pasa a medir N_filas / `num`
(≤1 17-18: 2,79 × 0,363 = 1,01). Que pase dice que hay tantas filas como
estrellas del modelo, no que sean mezclas. Las dos lecturas siguen abiertas:
(a) mezclas, con la `c` de Fabricius buena (79 % sin BP−RP, filtro de fuente
única fallado), o (b) la `c` del núcleo demasiado baja para M13, que es
`gaiaCrowdingK` (#595, fuera de alcance). En ≤0,25 y ≤0,5, `c ≈ 0` borra el
catálogo del dominio del velo, y por eso R2v sale 1,000. Las separaría una
medida que no pase por `c`: el G de las filas mezcladas contra la suma de
sus vecinas en HST (Sarajedini et al. 2007). Tampoco se ha comprobado si la
Tabla A.1 de Fabricius cuenta como recuperadas las fuentes que no pasan el
filtro de §3.3; si las cuenta, pesar las marcadas con `c` descuenta de más.

**AC3, arnés de #577 con los listones de §0 bis/ter/quater sin mover:**

| anillo | conservación #595 → #611 (2σ) | R2v #595 → #611 (2σ) |
|---|---|---|
| ≤0,25 | 1,232 → 1,052 (0,155, sin potencia) | 1,013 → 1,000 (sin potencia) |
| ≤0,5 | 1,062 → 0,941 (0,108, sin potencia) | 1,051 → 1,000 (sin potencia) |
| ≤1 | 1,024 → 0,939 (0,082, **PASA**) | 1,267 → **1,002** (0,005, **PASA**) |

Fuera de 1 r_h (informativo): R2v de ≤2 pasa de 1,084 a 0,977 (sigue NO
PASA, ahora por debajo: −2,6σ), ≤4 0,994 → 0,989 (PASA), ≤8 1,114 → 1,111.

**Coste declarado: la conservación total pasa de 1,015 (PASA) a 0,950
(NO PASA, 2σ = 0,044).** No es la corrección la que falta: el total de #595
pasaba porque el doble conteo del núcleo (≤0,25 a 1,232) tapaba el déficit
que ya tenían ≤2 y ≤4 (0,955 y 0,903, punto 4 de la atribución: muestreo de
las gigantes). Con el doble conteo fuera, ese déficit se ve. Contra el
contrafactual «todas por `c`» el total no cambia (0,949): no lo produce el
criterio sino quitar el doble conteo.

**Veredicto.** Sigue NO SE PUEDE TODAVÍA. Falla el criterio 3 en ≤2 y ≤8
(≤1 ya pasa) y la conservación total. El p95 de la pregunta 5 pasa (≤1:
0,121 → 0,097). Queda #596 (≤8) y el déficit de ≤2/≤4.

**Producción, sin cambios.** La consulta a Gaia no pide `ruwe` ni las `ipd_*`
y el velo `V1`/`V2` sigue fuera del render (ADR 0012). Llevarlo a
producción es pedir esas tres columnas (proxy, banco, Avance) y pesar las
mezclas al entrar el velo en el render. Ningún guardián del ADR cambia de
valor: el arnés no lo vigila ningún test salvo `test_filas_mezcladas.js`
(nuevo), que fija R2v ≤1 dentro de 2σ y rechaza `--mezcla 0` (1,267).

## Mezclas o completitud baja (#614, spike, 2026-11-23)
Spike sobre el «Límite» de #611: dentro de 1 r_h el cociente cat/`num·c`
mide N_filas / `num` y no separa (a) mezclas con la `c` de Fabricius buena de
(b) `c` del núcleo demasiado baja. Ni `gaiaCrowdingK` ni el peso de #611
cambian aquí.

### Cómo cuenta Fabricius una fuente recuperada (AC3)
Fabricius et al. 2021, §2.4: «The procedure and the sample are the same as
described in Arenou et al. (2018)», contra Sarajedini et al. (2007); la Tabla
A.1 da «the combined completeness of the astrometry and the photometry».
Arenou et al. 2018, §3.2: «we compared the number of sources in various
magnitude slices» en r < 0,5′ y 0,5-2,2′, con G de F606W/F814W ajustada por
cúmulo con sus estrellas. Arenou et al. 2017, §4.3.2 (el método de origen):
«in each bin we counted the number of stars present in the HST photometry
and in the Gaia DR1, by slice in magnitude».

1. **No hay cruce fuente a fuente.** La completitud es un cociente de cuentas
   por tramo de G. No hay radio de cruce ni definición de «recuperada» más
   allá de «está en el catálogo con G en ese tramo».
2. **No hay filtro de calidad.** Ninguno de los tres artículos filtra las
   fuentes de Gaia de la comparación con HST. Una fuente que no pasa el
   filtro de §3.3 **cuenta como recuperada**, en el tramo de su G mezclada.
3. **El filtro de §3.3 no es de cúmulos.** Fabricius lo aplica a la muestra de
   QSO del mapa de paralajes («filtered … from potential non-single objects
   using: ruwe < 1.4 and ipd_frac_multi_peak ≤ 2 and
   ipd_gof_harmonic_amplitude < 0.1»). El predicado de #611 sigue siendo
   publicado, pero no es el que ancla `gaiaCrowdingK`: la frase «la misma
   fuente que ancla `gaiaCrowdingK`» de #611 vale para el artículo, no para la
   Tabla A.1.

**Consecuencia para #611.** La `c` de la Tabla A.1 no es «la fracción que
Fabricius cuenta como estrella recuperada con su magnitud»: es N_Gaia(G) /
N_HST(G) con las mezclas dentro, cada una en el tramo de su G mezclada. Pesar
las marcadas con `c` aplica dos veces la pérdida de las fuentes mezcladas: una
en la cuenta de Fabricius (que ya las incluye como recuperadas) y otra en el
peso. Es lo que el ticket temía («si las cuenta, pesar las marcadas con `c`
descuenta de más»), y queda **confirmado por lectura**. Cuánto descuenta de
más depende de cuánta luz de vecinas lleva cada fila: eso lo mide el cruce de
abajo, no la lectura.

### Prerregistro del cruce (AC2, escrito ANTES de medir)
**Datos.** Catálogo HST/ACS de M13 de Sarajedini et al. 2007 (MAST,
`hlsp_acsggct_hst_acs-wfc_ngc6205_r.rdviq.cal.adj.zpt`) y el fixture
`m13_gaia_dr3.csv` con `m13_gaia_dr3_mezcla.csv`.

**Filas juzgadas.** Las marcadas por #611 con G 16,5-18,5 dentro de 1 r_h
(el dominio del «Límite»: 2 629 filas). Control: las no marcadas del campo ACS
con G 16,5-18,5 a cualquier radio.

**Pasos** (`scripts/flujo_hst.js`, fijado por `scripts/test_flujo_hst.js`):
1. Alineado: traslación HST → Gaia por mediana sobre parejas únicas a ≤ 1″ y
   luego a ≤ 0,1″, con las filas de control.
2. G de HST: G − V = a + b(V−I) + c(V−I)², ajustada sobre las filas de control
   con su estrella HST más cercana a ≤ 0,1″ (Arenou et al. 2018, §3.2: ajuste
   por cúmulo). Las marcadas no entran en el ajuste.
3. Por fila marcada, con **R = 0,4″** (Fabricius et al. 2021, §2.3: por debajo
   de 0,4″ «as many as 74% of the pairs are composed of 2p solutions», Gaia no
   los separa): **Q1** = flujo G de Gaia / flujo de la estrella HST más
   brillante a ≤ R; **Qs** = flujo G de Gaia / suma del flujo HST a ≤ R. Sin
   estrella HST a ≤ R, la fila no cuenta y se declara cuántas son.

**Regla y listón** (mediana de Q1 de las marcadas, intervalo bootstrap del
95 %, 1 000 remuestreos):

| intervalo de la mediana de Q1 | lectura | qué sigue (AC4) |
|---|---|---|
| todo > **1,10** | **(a) mezclas** | #611 validada en su criterio; el peso `c` se revisa por el punto 2 de AC3 |
| todo < 1,10 | **(b) `c` baja** | ticket para revisar `gaiaCrowdingK`; peso de #611 «en revisión» |
| contiene 1,10 | inconcluso | se declara; ni (a) ni (b) |

**Por qué 1,10.** (b) pura da Q1 = 1 en mediana (una estrella por fila, G
bien transformada). La (a) que explicaría el doble conteo de #595 en ≤1
(R2v 1,267) necesita filas que lleven del orden de un 27 % más de flujo que su
estrella principal: Q1 ≈ 1,27. El listón queda entre los dos. Comprobado en
sintético (`test_flujo_hst.js`, D): Q1 = 1,00 ± 15 % con 2 600 filas sale (b),
intervalo 0,995-1,004; Q1 = 1,27 sale (a); Q1 = 1,10 con 300 filas sale
inconcluso. El listón rechaza el caso malo de cada lectura.

**Informativo, sin voto.** Mediana de Qs (con (a) y R bien elegido, ≈ 1) y
mediana de Q1 del control (≈ 1 por construcción del paso 2; si no, el ajuste
falla y el cruce no vale). La sensibilidad a R se da con 0,6″ (`gaiaFwhmAs`,
ya en el modelo) como segunda columna; el veredicto es el de 0,4″.

**Prohibido** (ticket): cifras de estrellas dibujadas; mover R o el listón tras
ver Q1.

### Resultado del cruce (AC1)
`scripts/spike_614_cruce.js` sobre el `.zpt` de MAST (152 392 estrellas, no
está en el repo: 26 MB; tampoco en VizieR). Salida:
`simulador_ocular/docs/validacion/cruce_hst_614.txt`. Se descartó el Hubble
Source Catalog como sustituto: su fotometría de apertura pierde las vecinas
débiles del núcleo y empujaría Q1 hacia (a).

**Dominio.** «Dentro de 1 r_h» es el anillo «≤1» del arnés, 0,5-1 r_h:
2 629 filas marcadas, las que da el «Límite» de #611. Las 260 de ≤0,25 y las
804 de ≤0,5 van aparte, como información.

**Dos detalles que el prerregistro no fijaba.** Se declaran, no se ajustaron a
Q1:
- En el alineado, las HST se limitan a V < 20: con todas, ninguna pareja a
  ≤ 1″ es única (≈ 3,7 estrellas HST por segundo de arco cuadrado).
- El control dentro del campo ACS son ≈ 300 filas (el resto del fixture cae
  fuera del campo); 168 tienen HST a ≤ 0,1″ y entran en el ajuste.

Alineado: −0,193″, −0,143″. G − V = 0,0034 + 0,0726(V−I) − 0,0955(V−I)²
(V, I = F606W, F814W VEGA). Control: Q1 = 1,000. El ajuste vale.

| R | filas con HST a ≤ R | mediana Q1 [95 %] | mediana Qs | lectura |
|---|---|---|---|---|
| **0,4″** (veredicto) | 2 628 de 2 629 | **1,028 [1,026-1,030]** | 0,972 | **(b)** |
| 0,6″ (sin voto) | 2 629 | 1,028 [1,026-1,029] | 0,856 | (b) |

Anillos interiores, sin voto (R = 0,4″): ≤0,25 Q1 = 1,088, Qs = 0,848;
≤0,5 Q1 = 1,057, Qs = 0,892. Los dos quedan por debajo del listón.

**Veredicto (AC4): (b).** Cada fila marcada lleva el flujo de su estrella HST
principal más un ≈ 3 %, y menos que la suma de sus vecinas a 0,4″ (Qs < 1):
Gaia ajusta una estrella, no la mezcla. El filtro de §3.3 marca en el núcleo
filas que tienen vecina, no filas mezcladas. Con el punto 2 de AC3, que dice
que Fabricius ya las cuenta como recuperadas, pesar las marcadas por `c`
descuenta de más.

**Qué no dice.** La regla llama a (b) «`c` baja», pero el cruce no mide `c`.
En #595, k = 75 reproduce la fila de M13 de la Tabla A.1 fuera de muestra
(rms 7,6). Si las filas son estrellas y la `c` cuadra con Fabricius, el
exceso de cat/`num·c` (2,79 en 17-18) puede estar en `num` o en el promedio
radial de `c`, no en k. Lo separa **#617**.

**Peso de #611: en revisión (#617).** El código no cambia (el spike decide,
no corrige). Hasta #617, los números de «Filas mezcladas del núcleo» que
dependen del peso `c` (atribución en 17-19, R2v y conservación de ≤1) quedan
condicionados a ese peso. Decidido en «El exceso de filas en 0,5-1 r_h» (AC4): se mantiene como compensación declarada; se retira en #621.

## El exceso de filas en 0,5-1 r_h: `num` o `c` (#617, 2026-11-23)

Sale de #614: las filas de ≤1 son estrellas sueltas, y el cociente cat/`num·c`
de 17,07-18,07 (2,79, `fusion_blending_595.txt`) sigue sin dueño. Aquí no se
toca `gaiaCrowdingK` ni el código del arnés: se mide y se decide.

### Prerregistro (escrito ANTES de contar)

**Identidad que se usa.** Con N_HST las estrellas reales del tramo,
cat/`num·c` = (N_cat / N_HST) / c_mod × N_HST / `num`. El primer factor es
c_emp / c_mod (¿falla `c`, es decir k?); el segundo es R_num = N_HST / `num`
(¿falla el modelo de densidad?). El producto tiene que dar del orden de 2,8;
si no, el método no cuadra y no hay veredicto.

**Dominio.** Anillo 0,5-1 r_h (50,7-101,4″ del centro de Harris, radio
circular como el del arnés) **dentro del campo ACS**. El campo se fija con
las estrellas HST, sin mirar Gaia: celdas de 4″ con ≥ 3 estrellas HST
(cualquier magnitud) cuyas 8 vecinas también cumplen (borde erosionado). Se
declara la fracción del anillo que cubre.

**Medidas** (`scripts/spike_617_exceso.js`, mismo `.zpt` de MAST que #614 y
el mismo alineado):

- **Tramo V 17,07-18,07**, los bordes de bin del arnés. Para HST, la V de
  tierra del propio catálogo (`Vground`, la que dan los autores); para
  Gaia, `magVGaia`, la de producción y el arnés.
- N_HST: estrellas HST del tramo en el dominio. N_Gaia: filas del fixture
  (miembros y campo, como HST) del tramo en el dominio.
- `num` del dominio: Σ celdas Σ(r)·A_celda·Σ `num`_k de los bins del tramo;
  c_mod: la media de `pob.completitud` (k = 75, corte G 18,5 como el arnés)
  con el mismo peso.
- R_num = N_HST / `num`; c_emp = N_Gaia / N_HST.

**Regla** (σ de Poisson; para c_emp, binomial sobre N_HST):

| término | falla si | entonces |
|---|---|---|
| `num` | R_num fuera de [0,80, 1,25] **y** a más de 2σ de 1 | ticket sobre el modelo de densidad (AC3) |
| k | c_emp / c_mod fuera de [0,80, 1,25] **y** a más de 2σ de 1 | cambio de k con listón propio, antes de medirlo (AC3) |

Pueden fallar los dos. Si no falla ninguno, el producto no explica el 2,79 y
se declara que el método no cuadra.

**Por qué [0,80, 1,25].** Simétrico en log y lejos del caso malo: si todo el
exceso fuera de un término, ese término valdría 2,79 y el otro 1; el listón
rechaza 2,79 en el que falla y deja pasar el que no. Cabe el sistemático de
banda (V de tierra contra `magVGaia`, ≈ 0,1 mag en un tramo de 1 mag, que en
la LF de la subgigante mueve la cuenta ≲ 15 %).

**Control del método** (sin él no hay veredicto). La misma cuenta, en G
(G de HST con el ajuste de #614) y en la región de la Tabla A.1 (0,5-2,2′ ∩
campo ACS), en el tramo G 16-18, tiene que dar la completitud de Fabricius
para M13, **47 %**, a ±10 puntos. G 17-19 no sirve: el fixture se pidió hasta
G 18,5.

**Prohibido** (ticket): cifras de estrellas dibujadas; ajustar k a este
fixture (M13 es la prueba fuera de muestra de #595); mover listón o dominio
tras contar.

### Resultado (`simulador_ocular/docs/validacion/exceso_617.txt`)

| medida | valor | regla |
|---|---|---|
| control, 0,5-2,2′ ∩ ACS (cobertura 75,5 %), G 16-18 | N_Gaia / N_HST = 2 527 / 2 643 = **95,6 %** (Fabricius 47 %) | **NO VALE** |
| anillo 0,5-1 r_h ∩ ACS (cobertura 99,8 %), V 17,07-18,07 | N_HST 1 187, N_Gaia 1 296, `num` 1 281,0, c_mod 0,362 | — |
| AC1, R_num = N_HST / `num` | **0,927 ± 0,027** | dentro de [0,80, 1,25] (sin voto) |
| AC2, c_emp / c_mod | 1,092 / 0,362 = **3,02 ± 0,12** | fuera (sin voto) |
| producto | 2,795 (arnés 2,79) | cuadra |

Informativo: en G 17-18, mismo dominio, N_Gaia / N_HST = 1 205 / 1 214 = 0,993.

**Veredicto formal: sin veredicto.** El control no vale. La regla dice que,
sin control, ningún término falla ni pasa. Lo que sigue es lectura de las
cifras, no veredicto.

**Tres cosas que el prerregistro no fijaba** (se declaran; ninguna cambia
qué término sale de la banda):
- El código del spike se escribió después del prerregistro, sin mover
  dominio, tramo ni listón.
- La σ de c_emp / c_mod era binomial y daba ±0,002. La binomial supone que
  las filas de Gaia son un subconjunto de las estrellas HST, y c_emp = 1,092
  dice que no lo son: el fixture lleva campo y la V de las dos bandas no es la
  misma. Se pasa a Poisson de las dos cuentas: ±0,12.
- «Del orden de 2,8» se lee con la misma banda: producto / 2,79 dentro de
  [0,80, 1,25].

**Qué no se puede leer.** c_emp = 1,092 en V y 0,993 en G, en el mismo
dominio: el sistemático de banda es de ≈ 9 %. Cabe en el ≲ 15 % que admite la
banda, pero tampoco es pequeño. Ninguna de las dos cifras dice que `c`
sea 1. Dicen que Gaia trae aquí tantas filas como estrellas tiene HST.

**Lectura (sin voto).** `num` sale a −7 %, dentro de la banda; el término
que se aleja es c_emp / c_mod, a 3. Si el control valiera, el 2,79 sería de
`c` y no de `num`.

**Hipótesis del control fallido (post hoc, sin voto, sin comprobar).**
Fabricius describe la Tabla A.1 como «the combined completeness of the
astrometry and the photometry». Con solo las filas con BP−RP, la cuenta baja
a 57,0 % en 0,5-2,2′ (Fabricius 47 %, justo en el borde de ±10) y a 17,1 %
en r < 0,5′ (Fabricius 7 %). No cuadra del todo. Faltaría exigir además
astrometría de 5 o 6 parámetros, pero el fixture no trae
`astrometric_params_solved`. Si se confirma, la `c` de la tabla mide «fuente
con astrometría completa y BP−RP», no «fila en el catálogo». El arnés y
producción cuentan todas las filas, y `gaiaCrowdingK = 75` estaría ajustado a
otra cantidad. Eso explicaría el 3.

**AC3.** No se abre ticket de `num`: sale dentro de la banda, aunque sin voto.
Tampoco se propone un k nuevo: sin control, no hay base para mover k, y si la
hipótesis vale, reajustar k a la Tabla A.1 no arregla nada. Siguiente paso,
en **#619**: confirmar la hipótesis con una cuenta que se compare con
la Tabla A.1. Se pide `astrometric_params_solved` para el fixture y se repite
el control con «5/6 parámetros + BP−RP». Si el control vale, se repite este
reparto con su veredicto. Si además falla `c`, en ese ticket se escribe el
prerregistro de una `c` de filas (N_filas / N_HST).

**AC4, peso `c` de las marcadas por #611: decisión, se mantiene.** Motivo:
con la `c` de hoy, cat·c ≈ `num`·c en ≤1 (#611, 1,06 ± 0,046). Quitar el peso
sin cambiar `c` devuelve el 2,79 de #595. Se retirará en el mismo cambio que
toque `c`, y no antes. El texto de #614 que lo justificaba («cada fila marcada
es una mezcla») ya no vale: el peso queda como compensación declarada, no
como ley.

## Qué cuenta como recuperada la Tabla A.1 (#619, 2026-11-23)

Sale de #617: su control falló (todas las filas, 95,6 % contra 47 %), así que
no dio veredicto. Aquí no se toca `gaiaCrowdingK`, `completitud` ni el peso de
#611.

### Lo que dicen los textos (AC1)
Fabricius et al. 2021 (arXiv:2012.06242), §2.4: Table A.1 «shows the
combined completeness of the astrometry and the photometry». A continuación:
«the Gaia photometry is only published for sources with an astrometric
solution», y la completitud fotométrica «can, however, be lower, in
particular in high density regions for the GBP and GRP photometry». También:
«in globular clusters, a percentage of about 20%-30% of stars having five or
six parameter solutions … do not have GBP and GRP magnitudes». El pie de la
tabla solo da las regiones: «Core: r<0.5 arcmin. Out: 0.5<r<2.2 arcmin».
Arenou et al. 2018, §3.2 y Tabla B.1: «we compared the number of sources in
various magnitude slices», sin más condición.

**El texto no dice qué fuente cuenta como recuperada.** No define si
«astrometry» es cualquier solución (2p incluida) o solo 5p/6p, ni si
«photometry» es G o G + BP + RP. Se declara y se pasa a la hipótesis (AC2).

### Prerregistro (AC2, escrito ANTES de contar con el criterio)
**Criterio.** Cuenta como recuperada la fila con astrometría de 5 o 6
parámetros **y** BP−RP. Es la lectura literal de «combined completeness of
the astrometry and the photometry», con la astrometría y la fotometría
completas.
- **5/6 parámetros = `ruwe` no nulo.** Esquema de `gaia_source` de DR3:
  `ruwe` «is set to null for sources with only a two-parameter solution», y
  «all the sources in DR3 have only values of 3, 31 or 95 for the
  astrometric_params_solved». El sidecar `m13_gaia_dr3_mezcla.csv` ya trae
  `ruwe` para las 11 972 filas del fixture (comprobado: ninguna sin cruce).
  No se pide el fixture de nuevo.
- BP−RP: la columna `bp_rp` del fixture, no vacía.

**Lo que ya se había visto** (ADR 0005, se declara): con todas las filas,
95,6 % en 0,5-2,2′ y 59,7 % en r < 0,5′. Con solo BP−RP, 57,0 % y 17,1 %
(diagnóstico post hoc de #617). La cuenta con `ruwe` no se ha hecho.

**Control** (el de #617, sin mover nada): región 0,5-2,2′ ∩ campo ACS, G
16-18, N_crit / N_HST contra el 47 % de Fabricius, **±10 puntos**. Rechaza el
caso malo «todas las filas» (95,6 %, a 48,6 puntos). Informativo, sin voto:
r < 0,5′ contra el 7 %.

**Si el control vale** (AC4), se repite el reparto de #617 con su regla y su
banda [0,80, 1,25]: dominio 0,5-1 r_h ∩ ACS, V 17,07-18,07, la misma `num` y
la misma c_mod. Como N_HST y `num` no dependen del criterio, R_num no cambia
(0,927). Lo nuevo es c_crit / c_mod, con c_crit = N_crit / N_HST. Veredicto:

| resultado | veredicto | qué sigue (AC5) |
|---|---|---|
| R_num falla | `num` | ticket sobre el modelo de densidad |
| c_crit / c_mod falla | **k** | historia que cambia k, con prerregistro |
| ninguno falla, y todas las filas sí (c_emp / c_mod = 3,02 en #617) | **lo que cuenta `c`** | historia que hace que `c` y el catálogo cuenten lo mismo; decide k y retira el peso de #611 |
| ninguno falla, y todas las filas tampoco | ninguno | se declara |

**Si el control no vale**, se declara y se cierra sin tocar `c` (AC5).

**Prohibido** (ticket): elegir el criterio por lo cerca que deja el 47 %;
mover listón, región o tramo tras contar; cifras de estrellas dibujadas.

### Resultado (`simulador_ocular/docs/validacion/exceso_619.txt`)
`node scripts/spike_617_exceso.js <.zpt> --619`. Sin `--619`, la salida de
#617 sale byte a byte igual. Cumplen el criterio 8 071 de las 11 972 filas del
fixture.

| medida | valor | regla |
|---|---|---|
| control, 0,5-2,2′ ∩ ACS, G 16-18 | N_crit / N_HST = 1 186 / 2 643 = **44,9 %** (Fabricius 47 %) | **VALE** |
| informativo, r < 0,5′ ∩ ACS | 58 / 685 = 8,5 % (Fabricius 7 %) | sin voto |
| R_num (0,5-1 r_h, V 17,07-18,07) | 0,927 ± 0,027 | `num` vale |
| c_crit / c_mod | 0,418 / 0,362 = **1,154 ± 0,062** | k vale |
| todas las filas: c_emp / c_mod | 3,016 ± 0,121 | fuera |

**Veredicto (AC4): `c`, por lo que cuenta.** Es la salida «`c`» del AC4 del
ticket, en la fila «lo que cuenta `c`» de la tabla del prerregistro. Con el
criterio, `num` y k quedan dentro de la banda. Con todas las filas, `c` sale a
3. Si el criterio es el de Fabricius (hipótesis, ver «Qué no dice»), el
modelo de densidad y `gaiaCrowdingK = 75` están bien, y lo que no casa es la
cantidad: el arnés y producción cuentan todas las filas, incluidas las 2p y
las que no tienen color. En 0,5-1 r_h, V 17-18, son 1 296 filas, y solo 496
cumplen el criterio. `(1 − c)` repone las otras 800 como sintéticas o velo,
y el catálogo ya las trae. Ese sería el 2,79 de #595.

**La comprobación «cuadra» de #617 no se aplica aquí.** Con el criterio, el
producto R_num · c_crit / c_mod vale ≈ 1,07, no 2,8. Es lo esperado: el 2,79
es de todas las filas, y la regla de #619 lo lee en la fila «todas las filas»
de su tabla, no en el producto.

**AC1-3 de #617.** Con el control de #619 tienen veredicto: `num` vale (AC1),
k vale (AC2), y falla lo que cuenta `c`, que no es ninguna de las dos salidas
del AC3 de #617. Su sustituto es la historia del AC5 de aquí.

**AC5: #621.** Historia que hace que `c` y el catálogo cuenten lo mismo. Hay dos
caminos, y la historia elige con prerregistro:
1. una `c` de filas (N_filas / N_HST), con ancla externa nueva, porque la
   Tabla A.1 no la da;
2. que el arnés y producción cuenten como «catálogo» solo las filas con el
   criterio, y que las demás entren por `(1 − c)`. Producción tendría que
   pedir `ruwe` o `astrometric_params_solved`.

En la misma historia se retira el peso de #611 (AC4 de #617).

**Qué no dice.** El criterio es una hipótesis fijada antes de contar, no una
frase del artículo (AC1). Pasa el control en 0,5-2,2′ y queda a 1,5 puntos
en r < 0,5′, pero un solo cúmulo no prueba que Fabricius contara así. La
historia del AC5 lo repite en otro globular de la Tabla A.1 con HST (#621,
AC4).
- **El control no prueba la parte 5/6p.** «Solo BP−RP» daba 57,0 %
  (diagnóstico post hoc de #617), y `control(57, 100)` pasa: |57 − 47| = 10.
  El listón rechaza el caso malo que nombra el ticket (todas las filas,
  95,6 %), pero no separa el criterio de esa variante. El criterio sale del
  texto del ticket y de la lectura literal de §2.4, no de este control.
- **El orden lo prueba solo git.** El prerregistro (`511b19c`) y el resultado
  (`dcff65d`) se commitearon con minutos de diferencia. No hay otra prueba de
  que se contó después.
- **Uno de los dos datos ya se conocía.** El 3,02 de «todas las filas» es de
  #617. El veredicto dependía solo de si c_crit / c_mod caía en
  [0,80, 1,25].
- Si fallan `num` y k a la vez, la regla devuelve los dos (`lectura619`). No
  ha pasado.

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
gigantes no deja hacerlo mejor con un solo cúmulo. `σ` trata todo el flujo
como sorteo de Poisson, aunque `∫V1` es una esperanza: queda algo ancho (el
listón, algo blando), poco, porque las débiles del velo apenas pesan en S2.
El contrafactual `V1` sin
`(1 − c)` sigue siendo informativo.

**Arnés.** `node scripts/harness_fusion_blending.js` imprime `q`, `2σ` y
PASA / NO PASA / «sin pot.» por anillo y para el total, y aplica la regla en
el veredicto. Nadie lo decide a mano. Ningún listón se mueve después de medir.
Desde aquí, la salida sin flags difiere de `fusion_blending_577.txt` solo en
el bloque de conservación y en la etiqueta del veredicto (ampliado por §0
quater, #599).

## 0 quater. Cuarto prerregistro: criterio 3 de dos colas (#599, 2026-11-22, escrito ANTES de medir con las correcciones)

Sustituye **solo** el listón y la potencia del criterio 3 de §0 bis. La
definición de `R2v`, el dominio `m > borde`, el criterio 2, la conservación
de §0 ter, el fondo local y la regla del veredicto no cambian. Se fija antes
de correr el arnés con #594, #595, #596 y #591 (ninguna está en el código
al escribir esto). Commit: el que introduce esta sección en la rama de #599,
sobre `main` en `2bedfc4` o posterior y anterior a cualquier merge de #594.

**Lo que ya se había visto al escribir esto** (ADR 0005, se declara):

- Toda la salida de §0 bis, §0 ter y la atribución de #590. En concreto,
  con el arnés de #577 (una cola, σ de la realización):

  ```
                ≤0,25   ≤0,5    ≤1     ≤2     ≤4     ≤8
  R2v           1,010  1,028  1,048  0,634  0,564  0,684
  σ realización 0,004  0,005  0,009  0,010  0,015  0,031
  R2cf          1,013  1,051  1,289  1,421  1,483  1,603
  ```

- Las dos tablas de potencia de abajo y, con ellas, la medida del arnés sin
  correcciones con la regla nueva: ≤0,5, ≤1, ≤2, ≤4 y ≤8 NO PASA; ≤0,25 sin
  potencia. No cambia el veredicto (ya era «no se puede todavía»).
- La variante de σ con `S4` sin `c` (la que pedía #599 al abrirse; límites,
  abajo), corrida con el mismo arnés: juzgaba solo ≤1 a ≤8, con el mismo
  veredicto. El dueño del spike eligió `S4·c` viendo las dos tablas, para
  ganar potencia en ≤0,5 y ≤1.

**Por qué cambia.** Con una cola, ≤2, ≤4 y ≤8 «pasan» con déficits del
32-44 %: es el truncado de la consulta a Gaia (#594, atribución de #590,
punto 1). Un déficit tan grande es un fallo del modelo de la partición y el
criterio tiene que verlo. Y el doble conteo en sí es álgebra (`c + (1 − c) =
1`): con los datos no se distingue de un desajuste del modelo de unos pocos
por ciento, así que se fija con un test (abajo) y el criterio 3 pasa a medir
lo que de verdad puede medir: que el segundo momento cuadra con el modelo.

**Listón.** Por anillo:

```
R2v = ( ∫V2 dΩ + Σ_{j∈anillo, m_j>borde} F_j² ) / D,   D = ∫ Σ·S2(m>borde) dΩ   (igual que §0 bis)
σ   = sqrt( ∫ Σ·S4·c(m>borde) dΩ ) / D                                     (del modelo, Capa 1: pob.S4 − pob.velo)
pasa si |R2v − 1| ≤ 2σ
```

`σ` es el ruido de Poisson del único término sorteado, la suma del catálogo
(`∫V2` es una esperanza): `Var(Σ F_j²) = ∫Σ·S4·c`, con `S4·c = S4 − velo₄`.
Sale del modelo (perfil, LF y completitud de producción), no de la realización del
catálogo: no se ajusta a lo que se mide, y si #596 cambia el perfil se
recalcula solo. **No** se usa `sqrt(δ² + (kσ)²)`: con `δ` igual a la deriva
buscada, no puede rechazarla (§0 ter).

**Potencia: contrafactuales corridos.** Cada contrafactual pasa por la misma
partición (`pob.velo`, la ley de la Capa 1) con el catálogo en su media del
modelo, `∫Σ·S2·c = D − ∫V2`. Su valor esperado:

- **doble conteo completo**, `V2` sin `(1 − c)`: `(D + Cat) / D`;
- **deriva del modelo del 10 %**, `num × x` en `m > borde` (entra en `V2` y
  en `D`), con `c` y el perfil sin tocar: `(x·V2 + Cat) / (x·D)`, con
  `x = 1,1` y `x = 0,9`. Cuenta la dirección más débil (la de menor
  `P(rechaza)`; con el mismo σ en las dos, la de menor `|E − 1|`). Lectura:
  deriva el **modelo** y el cielo no (el catálogo sigue en `Cat`), que es lo
  que la fase 1 del ADR 0003 busca. La otra lectura (deriva el cielo, modelo
  fijo) da `1 ± 0,1·Cat/D`, casi igual. σ no se reescala con `x` (sería
  `σ/√x`, efecto de ~5 %).

Un anillo tiene potencia contra un contrafactual si su valor esperado cae
fuera de `±2σ`. `P(rechaza)` es la probabilidad gaussiana (anchura σ) de caer
fuera de `±2σ`, como en §0 ter. **Se juzga un anillo si tiene potencia contra
al menos uno de los dos**; sin potencia contra ninguno, no cuenta ni a favor
ni en contra. **Si ningún anillo tiene potencia contra la deriva, el criterio
3 cuenta como no pasado.**

Tabla de potencia (corrida antes de medir con las correcciones; arnés sin
flags):

```
anillo     2σ   doble conteo  pot.  P(rech.)   deriva ×1,1  ×0,9  pot.  P(rech.)   juzgado
≤0,25    0,003      1,003      NO     0,38        1,000    1,000   NO     0,05       NO
≤0,5     0,006      1,024      sí     1,00        0,998    1,003   NO     0,09       sí
≤1       0,015      1,240      sí     1,00        0,978    1,027   sí     0,82       sí
≤2       0,023      1,787      sí     1,00        0,928    1,087   sí     1,00       sí
≤4       0,033      1,919      sí     1,00        0,916    1,102   sí     1,00       sí
≤8       0,061      1,919      sí     1,00        0,916    1,102   sí     0,77       sí
```

La deriva del 10 % mueve `R2v` en `0,1 × Cat/D` (≈ 0,091 o 0,111 veces la
fracción catalogada del segundo momento): en el núcleo Gaia es incompleta,
`Cat/D` es pequeña y la deriva no se ve. Los que sostienen el criterio contra
la deriva son ≤1, ≤2, ≤4 y ≤8. ≤0,5 entra por el doble conteo.

**Falsa alarma.** Con un modelo perfecto, cada anillo juzgado falla un 4,6 %
de las veces (dos colas a 2σ). Con `n` juzgados, `1 − 0,954^n`: 21 % con los
cinco de la tabla, ~24 % si fueran seis. Va en la dirección conservadora: un
falso «no pasa» no aprueba nada, solo retrasa el «sí».

**El doble conteo, en el código.** `scripts/test_velo_uno_menos_c.js` (batería
rápida) comprueba que el velo de producción aplica `(1 − c)`: para una LF y
una `c(m, r)` de juguete, `V1 + Σ·S1·c = Σ·S1` y `V2 + Σ·S2·c = Σ·S2` en
`m > mCutGeneracion`, a `< 1e-6`. Lee la ley de la Capa 1 (`pob.velo`, ADR
0008), que es la que usa el arnés. Control positivo: con `c ≡ 0` (velo sin
`(1 − c)`) el test falla. `pob.velo` es nuevo (#599): antes la ley solo vivía
en el arnés. El render todavía no la usa (su `S1campo` no lleva `c`); el test
guarda la ley que la implementación del ADR tendrá que llamar.

**Límites declarados.** `σ` usa la completitud del modelo: si `c` está mal
(lo que corrige #594), σ y la fracción catalogada `Cat` también, y con ellas
la potencia contra la deriva. La variante `sqrt(∫Σ·S4)/D` (sin `c`, la que
pedía #599 al abrirse) trata el velo como sorteo y deja el listón mucho más
ancho en el núcleo: 2σ = 0,044 / 0,031 / 0,024 en ≤0,25 / ≤0,5 / ≤1, contra
0,003 / 0,006 / 0,015 con `S4·c`. Con ella ≤0,5 perdía la potencia contra el
doble conteo y ≤1 contra la deriva. El listón estrecho tiene un coste: en el
núcleo, un desajuste de `c` de unos pocos por ciento ya basta para el «no
pasa». Va en la dirección conservadora.

**Arnés.** `node scripts/harness_fusion_blending.js` imprime las dos tablas
(potencia y medida), aplica la regla y la etiqueta del veredicto nombra
«criterio 3 de §0 quater». Nadie lo decide a mano. Ningún listón se mueve
después de medir. Desde aquí, la salida sin flags difiere de
`fusion_blending_577.txt` en el bloque de conservación (§0 ter), en los dos
bloques del criterio 3 y en la etiqueta del veredicto.

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
| `completitud` en el velo (`gaiaM50`, `gaiaAncho`) | entra en el velo | los existentes de `CFG`; su ancla no se revisa aquí |
| `gaiaCrowdingK = 75` con `gaiaFwhmAs = 0,6″` en `completitud` (#595) | entra en el velo y en las sintéticas | Fabricius et al. 2021, Tabla A.1 (Gaia EDR3 contra HST en 24 globulares sin M13): sesgo −0,4 puntos. Ver «Completitud del núcleo con medida externa» |
| criterio de fila mezclada (#611): no cumple `ruwe < 1,4` y `ipd_frac_multi_peak ≤ 2` y `ipd_gof_harmonic_amplitude < 0,1`; sin `ruwe`, también | entra en la contabilidad de luz del arnés (peso `c(m, r)`, **compensación declarada** por #617: se retira con el cambio de `c`, #621), **no** en producción | Fabricius et al. 2021, §3.3 (filtro de la muestra de QSO; el artículo es el de `gaiaCrowdingK`, la Tabla A.1 no lo aplica). Ver «Filas mezcladas del núcleo» y «Mezclas o completitud baja (#614)» |
| corte de la consulta `G_c` en `completitud(m, r, G_c)` (#594) | entra en el velo, **no** en las sintéticas | lo pedido: `magQ` en producción (`estrellas.corte`), G ≤ 18,50 en el fixture; G − V del color sintético del bin (Riello et al. 2021). Ver «Corte de la consulta» |
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
