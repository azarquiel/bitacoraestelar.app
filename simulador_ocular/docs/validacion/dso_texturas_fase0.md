# Fase 0 del catálogo de texturas DSO — medidas

Fecha: 2026-09-04. Fuente: `simulador_ocular/docs/especificaciones/catalogo_dso_texturas_objetivo.md`
§5 «Fase 0 — Medir» y `simulador_ocular/docs/adr/0024-preregistro-catalogo-de-texturas-dso.md`.

Esta fase **solo mide**: no hay listones que pasar ni código de producción tocado.
Sustituye por cifras las cuatro estimaciones que el objetivo dejó abiertas y da a
las decisiones del apartado 9 el dato que les faltaba. Todo lo que sigue es
reejecutable sin más que la red y la caché de parches.

## Cómo se reproduce

```
node scripts/harness_dso_fase0.js                    # el banco (69 objetos)
node scripts/harness_dso_fase0.js --muestra 50       # muestra aleatoria, semilla 20260904
node scripts/harness_dso_fase0.js --muestra 30 --reglac 1   # la misma a 0,5″/px
node scripts/harness_dso_fase0.js --volumen 1        # volumen del catálogo con los bytes/px medidos
node scripts/harness_dso_fase0_codificacion.js       # filtros del PNG y barrido de `a`
node scripts/harness_dso_fase0_flips.js "NGC 7331"   # dónde caen los flips de ausencia
```

Los parches se cachean en `$PS1_HARNESS_DIR` (por defecto el temporal del
sistema) y las medidas en `fase0_resultados*.json` del mismo directorio, así que
una ejecución interrumpida continúa donde estaba. Ninguna cifra de este informe
sale de un parche que no esté en esa caché.

Universo medido: **118 objetos** (banco de 69 + muestra aleatoria de 49 con
medida válida) a `salida = 1024`, más **29** de la muestra a la resolución de la
regla C. Ni una sola descarga falló.

## A · La codificación `asinh16`

`u = asinh(v/a)` con `a = σ` del cielo del parche, `q ∈ [1, 65535]`, `0 =`
ausencia. Ida y vuelta píxel a píxel contra el `Float32Array` original.

| Medida | mín | mediana | máx |
|---|---|---|---|
| `errCuantMaxSigma` (píxeles con \|v\| < 5σ) | 2,97e-4 | 4,70e-4 | **6,15e-4** |
| error relativo (el resto) | 6,0e-5 | 9,5e-5 | **1,23e-4** |
| paso de cuantización cerca del cielo, en σ | 1,18e-4 | 1,87e-4 | 2,42e-4 |
| píxeles con NaN distinto tras la ida y vuelta | 0 | 0 | **0** |

L1.1 pide `max|Δ| ≤ 0,05·σ`. El peor objeto de 118 se queda **ochenta veces por
debajo**, y la predicción del ADR 0024 («≈ 2e-4 σ, dos órdenes de margen») se
confirma. La máscara de NaN sobrevive intacta en los 118.

### El barrido de `a`, para que la elección deje de ser una elección

Con `a = σ` el paso cerca del cielo es 2e-4 σ: se guardan cuatro dígitos por
debajo del ruido, y el ruido no comprime. Subir `a` engorda el paso sin dejar de
ser invertible, así que la pregunta era si el volumen lo agradecía. Sobre ocho
objetos, con el filtro Sub:

| `a` | paso cerca del cielo (σ) | err. máx (σ) | flips | B/px | × crudo |
|---|---|---|---|---|---|
| σ/4 | 6,98e-5 | 6,93e-4 | 31 | 1,598 | ×0,799 |
| **σ** | 2,37e-4 | 6,00e-4 | 58 | 1,566 | ×0,783 |
| 4σ | 7,78e-4 | 6,19e-4 | 72 | 1,488 | ×0,744 |
| 16σ | 2,44e-3 | 1,28e-3 | 196 | 1,382 | ×0,691 |
| 64σ | 7,25e-3 | 3,63e-3 | 566 | 1,274 | ×0,637 |
| 256σ | 2,13e-2 | 1,07e-2 | 926 | 1,170 | ×0,585 |

Cuadruplicar `a` cuatro veces ahorra un 25 % de bytes y multiplica los flips por
dieciséis. **`a = σ` se queda**, ahora por medida y no por elección.

### Los flips de ausencia: el único hallazgo que estorba

La codificación no mueve ningún NaN, pero sí mueve de lado a unos pocos píxeles
en la decisión `v < cielo − kσ` que `ps1AnclarACatalogo` toma después. En los 118
objetos: **603 píxeles de 123 731 968** (0,0005 %), repartidos por 57 objetos,
máximo 41 en uno.

Dónde están, medido en NGC 7331 (16 flips):

| `a` | flips | distancia al corte, mediana | máx | paso de cuantización |
|---|---|---|---|---|
| σ | 16 | 8,89e-5 σ | 1,59e-4 σ | 2,15e-4 σ |
| σ/4 | 7 | 4,36e-5 σ | 8,28e-5 σ | 6,44e-5 σ |

**Todos caen dentro de un paso de cuantización del corte**, y al afinar el paso
se reducen en la misma proporción. Es frontera, no defecto: ninguna codificación
con paso finito los lleva a cero.

Consecuencia para la fase 1: la redacción original de L1.1 exigía «máscara de NaN
idéntica (0 píxeles)» sin distinguir los NaN que el stack ya traía —que el
centinela transporta exactos— de los que nacen de la regla de ausencia, que
dependen de una comparación contra un umbral. Tal como estaba escrito, el listón
solo lo cumplía una codificación exacta, y la vía de escape del ADR 0024
(`a = σ/4` una vez, y después float32 con gzip) terminaba en float32 por un
efecto de frontera y no por un fallo de fidelidad.

**El ADR 0024 corrigió esa redacción el 2026-09-04**, antes de que nadie midiera
contra ella, con estas cifras delante: los NaN del stack siguen exigiéndose a cero
diferencias, y los de la regla de ausencia deben caer todos a `|v − corte| ≤` paso
de cuantización y no pasar de 1e-4 del parche. El razonamiento completo, y por qué
tocar un listón prerregistrado es aquí defendible, está en su apartado
«Corrección de la redacción de L1.1».

Una salvedad de método: aquí el corte se calcula con el cielo y la σ del parche
original para las dos versiones. En producción, `ps1AnclarACatalogo` los recalcula
sobre los datos decodificados, así que el corte se desplaza un poco y el recuento
exacto de la fase 1 no tiene por qué ser este. El orden de magnitud sí.

## B · El volumen, que era la cifra más equivocada

La tabla 4.2 del objetivo estima el PNG en **×0,6** del crudo de 16 bits. Medido:

| escala del parche | n | bytes/px (mediana) | × crudo |
|---|---|---|---|
| < 0,15 ″/px | 31 | 0,44 | ×0,22 |
| 0,15 – 0,25 ″/px | 21 | 1,52 | ×0,76 |
| 0,25 – 0,5 ″/px | 27 | 1,92 | ×0,96 |
| ≥ 0,5 ″/px | 39 | 1,91 | ×0,95 |

El ×0,6 solo se cumple donde el parche está sobremuestreado respecto a la escala
nativa del stack (0,25 ″/px). En cuanto el píxel contiene información real, el
contenido es ruido y **el PNG-16 deja de comprimir**: ×0,95. Los 29 objetos
medidos directamente a la resolución de la regla C lo confirman sin extrapolar:
1,89 – **1,92** – 1,97 B/px.

Los cinco filtros que define el formato, sobre ocho objetos (bytes/px totales):

| None | Sub | Up | Average | Paeth |
|---|---|---|---|---|
| 1,617 | **1,566** | 1,590 | 1,716 | 1,567 |

Sub gana, y gana un 2 % donde importa: el desplazamiento de 2 bytes separa el
byte alto del bajo, pero el byte bajo del ruido es incompresible con cualquier
predictor. **Se recomienda escribir con filtro Sub** en vez del 0 que dice el
objetivo (§4.3 paso 5); es un byte por fila de diferencia en el escritor.

Volumen de las **1066 filas aptas de este árbol**, con los bytes/px medidos:

| Regla | Mpx | GB medidos | GB con el ×0,6 del objetivo |
|---|---|---|---|
| A · 1024 fijo (**lo que sube la fase 1**) | 1118 | **1,70** | 1,34 |
| C · 0,5 ″/px, tope 2048 | 792 | **1,51** | 0,95 |
| D · 0,67 ″/px, tope 2048 | 471 | 0,90 | 0,57 |
| E · 0,5 ″/px, tope 1024 | 488 | 0,92 | 0,59 |
| F · 0,5 ″/px, tope 1794 (vía de escape) | 741 | **1,42** | 0,89 |

Dos consecuencias:

1. **L2.4 pide ≤ 1,5 GB y la regla C sale a 1,51 GB.** Justo encima, con el
   catálogo de hoy y creciendo cada vez que entra una fila. La vía de escape que
   el ADR ya tiene escrita —tope 1794— da 1,42 GB y cabe.
2. **La fase 1 pesa más que la fase 2**: 1,70 GB a `salida = 1024` fijo, porque a
   las 42 filas grandes les sobra tope y a las pequeñas les sobran píxeles. La
   fase 1 no tiene listón de volumen, así que esto no la bloquea, pero la primera
   subida por FTP es de 1,7 GB, no del ≈ 1 GB que dice el objetivo (§4.5).

## C · Ausencia y saturación: la fase 4 no se abre

`fracAusenciaEscena` = fracción de píxeles NaN dentro de la escena (elipse μ25 o
borde real del objeto y sus vecinas, con `ps1EscenaEnParche` de producción).

| Medida | mediana | máx |
|---|---|---|
| `fracAusenciaEscena`, 118 objetos | 0,002 % | 77,8 % |

Objetos por encima del 5 %: **tres** — NGC 1982 (M43, HII, 77,8 %), NGC 253
(14,5 %) y NGC 3242 (6,6 %). Por encima del 1 %: cuatro.

El criterio orientativo de apertura de la fase 4 era «≥ 5 % de los objetos con
`fracAusenciaEscena > 0,05`». Sale **2,5 %** (3 de 118). **La fase 4 sigue
cerrada**, y con ella los warps, el segundo sondeo y el renombrado del ADR 0020.
Los tres objetos van a la lista de revisión de la mejora M5, no a una fase nueva.

Advertencia sobre esta cifra: `fitscut` no devuelve el umbral de saturación en la
cabecera que `parseFITS` lee, así que «saturado» aquí es «NaN en el stack», que
es lo que el objetivo prescribe como respaldo (§4.3 paso 4). Mezcla saturación
con hueco de cobertura y con el borde de la costura; NGC 1982 y NGC 253 habría
que mirarlos a ojo antes de llamarlos saturados.

## D · La adquisición

| Medida | mediana | máx |
|---|---|---|
| segundos por objeto a 1024 px (118) | 8,4 | 38,6 |
| segundos por objeto a la regla C (29) | 4,2 | 107,9 |

147 descargas seguidas contra STScI, en serie, **sin un solo fallo, 502 ni
estrangulamiento**. Extrapolado a las 1050–1066 filas: **≈ 2,5 h** a 1024 px, más
si la regla C manda pedir 2048 (el máximo de 107,9 s es un parche de 20′ a
2048 px). El generador necesita ser reanudable —lo es— pero no hay evidencia de
que necesite pausas ni reintentos con espera creciente; el riesgo 18 del objetivo
queda sin confirmar y basta con un reintento simple.

## E · `DecompressionStream` en el navegador

Datos de MDN browser-compat-data (`api/DecompressionStream`), no de una prueba
propia:

| Chrome | Firefox | Safari | Edge / Android / Samsung |
|---|---|---|---|
| 80 | 113 | 16.4 | espejo de Chrome |

Baseline «widely available» desde **mayo de 2023**. El formato que necesita un
`IDAT` es `deflate` con envoltura zlib, que es el soporte base de la API; la
salvedad conocida de MDN afecta a `deflate-raw`, que no se usa. El respaldo
declarado del objetivo (sin `DecompressionStream` → modelo de fila y aviso) sigue
siendo necesario, pero cubre navegadores anteriores a 2023, no un hueco vivo.

## Discrepancias con lo escrito, para corregir en origen

1. **El banco ya no son 53 objetos, son 69.** El ADR 0024 fija «todas las HII,
   RfN y SNR aptas» y escribe 12 RfN; este árbol tiene **28** desde que entró
   `feat: nebulosas de reflexión` (PR #189, commit b208618). El banco crece solo,
   que es lo que la regla pedía. Los cinco controles de exclusión salen exactos
   (`no-cabe` ×4, `sur`). **Enmendado en el ADR 0024 el 2026-09-04**: la
   cardinalidad de los tests deja de ser un número escrito y pasa a ser la que
   devuelve `lib_banco_dso.js`, que avisa cuando una clase entera se aparta de la
   cuenta registrada.
2. **El catálogo difuso ya no son 1485 filas ni 1050 aptas**, sino **1510 y
   1066**, por lo mismo. Las premisas del ADR 0024 §«Premisas medidas» hay que
   releerlas con estos números.
3. **El ×0,6 de compresión es ×0,95** en todo lo que no esté sobremuestreado.
4. **La regla C no cabe en L2.4** (1,51 GB contra 1,5), y la fase 1 sube 1,7 GB.
5. **L1.1 con máscara de NaN a cero píxeles** no lo cumplía ninguna codificación de
   paso finito (apartado A). Corregido en el ADR 0024 el mismo día, separando los
   NaN heredados del stack —que siguen a cero— de los que nacen de la regla de
   ausencia, que se juzgan por su distancia al corte.
6. **`lib_bajar_parche.js` no devolvía la WCS del recorte**, así que todo lo que
   monta un parche en Node —el golden incluido— lo hace con un afín sin el giro
   de la skycell, aunque `fitscut` la sirve (`&wcs=1`) y `parseFITS` la lee. Se
   descubrió al medir la escena de la fase 0: al devolverla, `parche.datos` cambia
   y el golden falla en los cuatro objetos. Aquí queda **opcional** (`conWcs`,
   apagada por defecto) para no mover nada; los arneses de la fase 0 la piden y el
   generador de texturas tendrá que pedirla, porque el sidecar lleva la WCS. Es un
   motivo más —y no previsto— para la recaptura de golden que la fase 1 ya tiene
   presupuestada, y conviene comprobar de paso si la ruta del navegador (que sí
   lee la WCS del FITS del proxy) y la de Node estaban divergiendo en silencio.

## Qué decide esta fase, de las preguntas abiertas del apartado 9

- **9.2, tope de 2048 frente a 1794**: la medida empuja a **1794**. Con 2048 el
  catálogo de hoy ya excede el listón de volumen que el propio ADR se puso, y el
  objetivo de 0,67 ″/px del README es el número que 1794 persigue. Decisión del
  usuario, con la tabla delante.
- **9.1, fixtures en git**: los 11 objetos golden a 1024 px, pesados uno a uno,
  suman **18,4 MB** en PNG-16. Cae dentro de la estimación del objetivo (15–25 MB),
  así que la decisión sigue siendo de política de repositorio y no de tamaño.
- **9.3 y 9.4** no dependen de nada medido aquí y siguen abiertas.

## Lo que esta fase no responde

- El coste **en el navegador** de decodificar el PNG-16 (L1.3): exige el
  decodificador de la fase 1 y no existe todavía.
- La **equivalencia extremo a extremo** (L1.1 de verdad): exige `ps1LeerTextura`
  y el montaje completo con Gaia pineada. Lo medido aquí es la codificación
  aislada, que es su cota inferior.
- El comportamiento de STScI ante **1050 peticiones**, no 147.
- La fricción real del **FTP de 1,7 GB** y si el hosting reescribe PNG en
  `uploads/`.
- Cuánto de la ausencia de NGC 1982 y NGC 253 es **saturación** y cuánto es
  cobertura o costura.
