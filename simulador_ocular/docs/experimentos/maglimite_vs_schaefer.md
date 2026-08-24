# ¿Es estricta nuestra magnitud límite? Medida contra Schaefer 1990

**Pregunta.** M13 con 200 mm sale con 137 estrellas a 61× y 548 a 250×, y parecen
pocas. Medido en `scripts/` (ver más abajo), quien las quita es el umbral de
magnitud del equipo, no la ley de crowding del ADR 0012. Así que la pregunta se
reduce a una: ¿`magLimite` pide demasiado?

**Banco de comparación.** Schaefer, B. E. 1990, *Telescopic Limiting Magnitudes*,
PASP 102, 212 (DOI 10.1086/132629). Es el único banco publicado que está ajustado
a magnitudes límite **observadas**: 314 observaciones visuales recogidas por
cuestionario en *Sky & Telescope*. El algoritmo está transcrito literal en
`scripts/harness_maglimite_schaefer.js` desde el BASIC del propio Schaefer
(*Sky & Telescope*, nov. 1989, p. 522), en el porte de Larry Bogan. Ninguna de sus
constantes se toca: es el patrón, no un modelo a calibrar.

El SQM entra como NELM del cénit con la relación del propio Schaefer,
`NELM = 7,93 − 5·log10(10^(4,316 − SQM/5) + 1)`; SQM 21,0 da NELM 6,12.

## Resultado

`node scripts/harness_maglimite_schaefer.js`

D = 200 mm, transmisión 0,9, pupila del ojo 7 mm, seeing 2″, cénit:

| SQM | aum | Schaefer (newt) | Schaefer (refr) | `magLimite` | dif |
|----:|----:|----:|----:|----:|----:|
| 21,0 |  61 | 13,95 | 14,10 | 14,16 | +0,21 |
| 21,0 | 120 | 14,42 | 14,61 | 14,74 | +0,32 |
| 21,0 | 173 | 14,59 | 14,81 | 15,00 | +0,41 |
| 21,0 | 250 | 14,66 | 14,89 | 15,23 | +0,57 |

Sobre las cuatro SQM medidas (20,0 a 22,0) la mayor discrepancia es **+0,70 mag**,
y a pupila de salida fija de 1 mm crece con la apertura: +0,45 en 100-200 mm,
+0,76 en 400 mm.

**Nuestra ley es MÁS GENEROSA que el banco empírico en todo el rango medido.** El
déficit de estrellas de M13 no viene de un umbral estricto: viene de que un
200 mm bajo SQM 21 tiene el límite donde lo tiene.

## Lo que sí aparece: no hay máximo de aumento útil

| aum | Schaefer | `magLimite` | pupila de salida |
|----:|----:|----:|----:|
|  61 | 13,95 | 14,16 | 3,28 mm |
| 250 | **14,66** | 15,23 | 0,80 mm |
| 350 | 14,57 | 15,41 | 0,57 mm |
| 500 | 14,44 | 15,47 | 0,40 mm |
| 1000 | 14,15 | 15,47 | 0,20 mm |

Schaefer tiene un **máximo en 250×** y a partir de ahí baja. Lo hace su término
`FR`: por encima de 900″ de disco de seeing aparente la estrella deja de ser un
punto y el umbral empeora. `magLimite` no baja nunca; se aplana en 15,47 cuando
`SB0T` topa con el suelo de 27 (ADR 0010).

Para el simulador esto significa que **subir aumentos siempre paga**, y en el
ocular real no: pasado el aumento útil el cuadro pierde estrellas. Es una
carencia acotada del modelo, no un ajuste pendiente, y queda anotada aquí. Hasta
250× —el rango de todo lo que se ha calibrado— no cambia nada.

## Cómo se llegó hasta aquí (M13, 200 mm, SQM 21, campo 28′)

Embudo medido sobre la fixture `simulador_ocular/docs/validacion/m13_gaia_dr3.csv` (11 970 estrellas
en el campo, G < 18,5):

| filtro | 61× | 250× |
|---|---:|---:|
| pasan el `mlim` del cielo limpio | 332 | 891 |
| las dibuja el render (velo local) | 137 | 548 |
| las mata el sorteo del ADR 0012 | 0 | 6 |

Y las dos comprobaciones que descartan las otras hipótesis:

- **El velo no está inflado.** μ_velo(0) = 16,49 mag/arcsec² contra μ_V(0) = 16,59
  del catálogo de Harris.
- **No falta suministro.** Dentro de r_h con m ≤ 15 la función de luminosidad
  predice 316 estrellas y Gaia trae 359. Las sintéticas aportan 0 en este régimen.

## Contra lo que dicen los observadores

- «a 250× con un 8" bueno, resuelto de lado a lado con **cientos** de estrellas»
  → el modelo dibuja 548.
- «a ~50× granular, la pelusa empieza a romperse en puntos con visión desviada,
  sin resolver el centro» → el modelo dibuja 137 y resuelve el 0 % del flujo del
  núcleo, porque a 61× m_res(0) = 11,56 queda por delante de la estrella más
  brillante que la LF tiene (11,69 aparente).
- La estrella más brillante real de M13 es V11, V ≈ 11,95; la LF del modelo pone
  su techo en 11,69 aparente, 0,26 mag por delante.

Los tres puntos de control salen en el sitio. El cuadro de M13 no tiene pocas
estrellas por un error del umbral.
