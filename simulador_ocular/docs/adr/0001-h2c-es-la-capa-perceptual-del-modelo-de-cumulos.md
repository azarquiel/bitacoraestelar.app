# H2c es la capa perceptual del modelo de observación de cúmulos

El modelo físico de observación de cúmulos globulares (cinco capas: población → resolución →
imagen óptica → sistema visual → display) llegó especificado con una Capa 4 propia: una tabla 2D
de Blackwell (1946) con la extensión de Crumey (2014), interpolada en log L × log θ. El repo ya
tenía esa capa resuelta de otra forma: `ctxFotometrico()` (pupila de salida, transmisión, `SBe`,
umbral `Cmin`) más la **ley H2c** (Ricco: tamaño aparente × aumentos, seeing en cuadratura),
calibrada contra **12 observaciones visuales reales** y activa en producción.

**Decidido: la Capa 4 es H2c.** No se implementa la tabla Crumey, **ni siquiera como modo apagado
por defecto.** El display (Capa 5) es el vigente, `nivelCielo(SBe)` + incremento de contraste en
magnitudes; la propuesta de `asinh` queda retirada.

## Por qué

Una ley calibrada en campo con el instrumento de medida real —observadores en oculares— domina a
una ley trasplantada de la literatura. Blackwell 1946 son observadores entrenados, exposiciones
largas y campos artificiales de laboratorio. Y el contenido físico es el mismo: Ricco + ley de
potencia sobre luminancia de fondo es exactamente lo que la tabla codifica, ya destilado y medido
aquí. La especificación se escribió sin conocer el repo: su Capa 4 era un marcador de posición
para «aquí debe haber un modelo perceptual serio», y ya lo hay. La aportación real de la
especificación son las Capas 1–3, donde el repo no tenía nada.

Tampoco se conserva la tabla como alternativa dormida: serían dos leyes de detección conviviendo
—aunque una duerma, alguien la despierta en una calibración futura— y código muerto que hay que
mantener coherente con cada cambio de interfaz. Si algún día la validación de Nivel 4 muestra
discrepancias **atribuibles específicamente a la ley de detección**, se abre un experimento
comparativo como rama efímera. Ese es el criterio de escape; no es lo mismo que mantener viva la
alternativa.

## Consecuencias

- **Una sola ley de detección, también en la clasificación.** `m_lim,sky` de la Capa 2 se calcula
  con el mismo `Cmin` de `ctxFotometrico()`. Si la Capa 2 clasificara una estrella como resuelta
  con una ley y la Capa 4 la atenuara con otra, habría estrellas clasificadas visibles que el
  render apaga (o al revés).
- **H2c queda congelada.** Sus constantes las fijaron las 12 observaciones. Si la matriz de
  validación M13 falla, el sospechoso son las Capas 1–3, nunca la ley perceptual. Ninguna
  iteración futura debe «ajustar» H2c para cuadrar un cúmulo.
- **El campo granular entra por la misma ley con otra escala angular.** El campo se parte en media
  y fluctuación: `⟨I⟩(r)` se atenúa con `Cmin(θ_cúmulo)` y `σ(r)` con `Cmin(θ_grano)`, siendo
  `θ_cúmulo = 2·r_h` circularizado y `θ_grano = FWHM_total`. Cero constantes nuevas.
- **Deuda anotada, no arreglada:** hay dos constantes de seeing en el repo, `CFG.seeingArcsec` (la
  que ensancha las estrellas) y `FOT.H2C.SEEING_AS` (la de la ley de detección). Si divergen, una
  estrella se dibuja con un seeing y se detecta con otro. No se toca en este trabajo: mover
  `FOT.H2C.SEEING_AS` movería la calibración de campo.
- **La desaturación escotópica (§4.3 de la especificación) queda fuera** de este trabajo, por el
  mismo criterio: afecta a todas las estrellas del simulador y no hay medida que la fije. Además,
  H2c se calibró con observadores que veían el color que ven de verdad, así que cambiar la
  saturación global es tocar el entorno de esa calibración.
