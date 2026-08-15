# Informe Fase 1 — Depresiones negras interbrazos en M51

**Fecha:** 15-ago-2026 · **Rama:** `fase1-diagnostico-interbrazos`
**Configuración:** 457,2 mm · 190× · SQM 21,2 · lienzo 720 px · AFOV 70° ·
δ = 2 niveles. Contexto medido: nivelFondo 23,56 DN, umbral de detección
μ = 22,97, cielo del parche −0,6 DN, σ = 27,6 DN.
**Estado de banderas (producción, sin tocar):** `opacidadInternaEscena=false`,
`confianzaLocalNaN=false`, `deltaMin=0`, `deltaPlena=2,5`, `deltaExp=1,0`, H2c activa.
**Paridad:** la réplica instrumentada coincide **bit a bit** con
`ps1PintarParche` en las tres galaxias (dmax = 0).

## Hallazgo previo obligado: la premisa del protocolo no está vigente

El protocolo asume la excepción «dentro de la escena μ25 → op = 1» y trata la
clase (b) (op < 1 dentro de escena) como bug. **Esa excepción no existe en
producción**: `PS1.opacidadInternaEscena` está apagada (revertida: forzar op=1
resucitaba el fondo sub-umbral y dibujaba la envolvente de la elipse en M101),
y la rampa juzga cada píxel por su brillo o su soporte local (c99b72c). Con la
bandera apagada, el 96,6 % de los píxeles con flujo dentro de la escena de M51
tiene op < 1: no es un invariante roto, es el comportamiento vigente. La clase
(b) se mide y reporta igualmente — y resulta ser la causa dominante.

## Atribución del negro (rectángulo envolvente de la elipse μ25; 149 549 px)

| clase | causa | px | % |
|---|---|---|---|
| c | anclaje: v válido < cielo | 62 063 | 41,5 |
| d | mezcla: w < 0,5 y fm oscuro | 38 403 | 25,7 |
| a | op < 1 fuera de escena | 839 | 0,6 |
| b | op < 1 dentro de escena | 48 205 | 32,2 |
| e | mapeo (residual) | 39 | 0,03 |

La tabla engaña si se lee sola: las clases se asignan por orden de etapa y el
rectángulo incluye mucho cielo entre las dos elipses. El **solape** deshace la
ambigüedad: de los 149 549 negros, **149 525 (99,98 %) tienen op < 1**; solo 24
píxeles son negros sin que la rampa los apague (cSolo=24, dSolo=0). Los (c) del
rectángulo son en su mayoría ruido de cielo (mitad bajo la mediana por
definición) que *además* la rampa apaga. En las **ROIs interbrazo** —donde el
negro es el fenómeno visible— la atribución es: **clase b 74–88 %**, resto (c)
con op también <1. La rampa de opacidad es la puerta común de todo el negro.

En los píxeles negros interbrazo: w mediana = 1,00 (manda la imagen, no el
modelo), mezcla mediana 0,55 mag **por debajo** del umbral de detección, op
mediana = 0,000 (p90 = 0,19).

## Veredictos

### H-A (geometría de escena): DESCARTADA
Fuera de la escena μ25 cae el **27,7 %** de los negros (< 30 %); la banda
1,0–1,5 de d/d_μ25 acumula el 26,6 %. El negro vive mayoritariamente dentro de
la elipse. Las cuatro ROIs interbrazo están al 100 % dentro de escena.

### H-B (sobresustracción residual): DESCARTADA
Mediana cruda de las ROIs interbrazo: **+2,06σ sobre el cielo** (cielo puro:
−0,19σ; Mann-Whitney z = +28,4, interbrazo *más brillante*). Es exactamente la
firma «cielo + señal débil positiva» del criterio de descarte. La banda de
sobresustracción (−2σ, 0) solo contiene el 15,6 % de los píxeles interbrazo
(cielo puro: 61 % por definición de mediana), profundidad media 0,7σ. La
sobresustracción real de M51 existe pero está en los huecos NaN
(`parche_clasificacion.png`, violeta): el anclaje ya la convierte en ausencia,
el perfil la rellena y **no sale negra**. Nota de propagación: los pocos
píxeles interbrazo bajo el cielo llegan a la mezcla con w = 0,54 y salen con
op media 0,046 — el déficit no sobrevive como flujo, lo ejecuta la rampa.

### H-C (curva de tono): DESCARTADA
Solo el **12,1 %** de los negros llega al mapeo con flujo lineal > 0 y colapsa
a ≤ fondo+δ (< 20 %). El 87,9 % llega con flujo exactamente 0: la rampa ya lo
vació antes (`ps1FlujoConOpacidad` con op = 0). El render asinh **pre-opacidad**
enseña estructura interbrazo continua y abundante; el **post-opacidad** ya no la
tiene: la señal no la aplasta la curva de tono, la elimina la opacidad.

## Controles cruzados (mismo δ y configuración)

| | negros | b (op dentro) | negro solo-rampa (sin c/d) |
|---|---|---|---|
| M51 | 149 549 | 32,2 % | 49 044 |
| **M104 (especificidad)** | 62 754 | **0 %** | **0** |
| M81 (2.º positivo) | 338 413 | 36,1 % | 123 551 |

M104 no tiene ni un píxel negro por rampa pura: su negro es ruido de cielo
dentro del rectángulo (c/d) — cambio mínimo, como exige el control. M81
reproduce la firma de M51 amplificada (su anillo oscuro histórico).

## Conclusión y recomendación única para Fase 2

La causa dominante no es ninguna de las tres hipótesis del protocolo: es la
**ley de detección (rampa de opacidad) aplicada píxel a píxel dentro del cuerpo
de la galaxia**, apagando señal débil pero real (+2σ cruda, w=1) que queda
~0,5 mag bajo el umbral de Blackwell a esta configuración. Es el caso ya
enunciado en «detección ≠ estructura»: el soporte local de c99b72c amortigua el
borde brazo/interbrazo pero no alcanza a los interbrazos anchos, cuyo soporte
de 25″ es tan débil como ellos.

De los tres candidatos listados (borde de escena suave / anclaje local por
anillos / ajuste de mapeo), **ninguno ataca esta causa**: el primero corrige
H-A (descartada), el segundo H-B (descartada), el tercero H-C (descartada).
La recomendación única es que Fase 2 aborde la **protección de estructura
dentro de la escena sin geometría** (la línea que el comentario de
`PS1.opacidadInternaEscena` deja pendiente: mirar el entorno del píxel, no la
elipse — p. ej. ensanchar la escala del soporte o hacerla adaptativa), con el
puente de marea como centinela: ya hoy pierde el 19,6 % de sus píxeles con
señal real de +15σ. No se implementa nada en esta fase.

## Reproducción

Ver `README.md`. Batería de regresión verde al cierre (los seis tests de la
Fase 0, sin cambios en producción). Sin aleatoriedad: no hay semilla que fijar.
