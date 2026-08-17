# 10. El suelo de detección del ojo (27 mag/arcsec²) rige el límite Y el pintado

- Estado: aceptada
- Fecha: 2026-08-17
- Relacionada: [ADR-0009](0009-fondo-cielo-luminancia.md)

## Contexto

Tras arreglar la curva del fondo de cielo (ADR-0009) se probó el simulador con
SQM 30 —un cielo que no existe en la Tierra— y salió una imagen blanca: todas
las estrellas iguales de brillantes y el campo entero saturado. La UI decía a
la vez "fondo en ocular 30,3 mag/arcsec²" y "magnitud límite 16,5–17,2", que es
*menos* de lo que da un cielo peor.

Son dos fallos distintos, y los dos son la misma omisión: **27 mag/arcsec² es el
suelo de detección del ojo humano**, y el render solo lo conocía a medias.

### Fallo A — el tope y el suelo de `magLimite` se contradecían

```js
SB0T = Math.max(sqm, Math.min(27, SB0T));   // antes
```

Con `sqm > 27` el `max()` deshace el `min()` y `SB0T` se va con el `sqm`, fuera
del dominio donde vale el ajuste de Torres Lapasió. La parábola de su Ec. 6
tiene el vértice en `1,792/(2·0,02949) = 30,4`: pasado ahí el límite **empieza a
bajar**. Medido: sqm 21 daba 14,83 y sqm 40 daba 14,53. Un cielo más oscuro
enseñaba menos estrellas.

### Fallo B — el pintado no conocía ese suelo

`valorDeFlujo(F, Fcielo, rango)` divide por `Fcielo`. Con un cielo irreal el
divisor tiende a cero y el contraste de cualquier objeto explota. Medido a 61x:
un objeto de μ=22 pasaba de 30/255 con sqm 21,5 a 170/255 con sqm 30 y a blanco
puro con sqm 35. Eso es lo que enseñaba la captura.

Ninguno de los dos es una regresión de ADR-0009: se reprodujeron idénticos
contra `origin/main`.

## Decisión

Aplicar el mismo suelo en los dos sitios.

**A.** Invertir el orden del clamp para que el tope del ojo gane siempre:

```js
SB0T = Math.min(27, Math.max(sqm, SB0T));
```

**B.** Añadir `FOT.SB_SUELO_PINTADO = 27` y un `FcieloPintado` en
`ctxFotometrico`, que es `Fcielo` salvo cuando `SBe > 27`. Lo consume **solo**
la línea que escribe el píxel en `pintarFot`. No lo tocan `Cmin`,
`visibilidadDifusa`, `sbUmbralContraste`, la ley H2c ni `magLimite`: el umbral
de contraste sigue midiendo contra el cielo de verdad. `null` recupera el
comportamiento histórico para el A/B.

`nivelFondo` se deja sin capar a propósito: la decisión es sobre el divisor del
contraste, y la diferencia en el fondo entre SBe 30 y 35 es 0,01 niveles de 255.

## Lección de diseño

**Un límite físico que el modelo ya conoce en un sitio tiene que valer en todos
los sitios que dependen de él.** `magLimite` sabía que el ojo tiene un suelo de
detección; el pintado no, y por eso los dos números que la UI enseña juntos
—"fondo en ocular" y "magnitud límite"— dejaron de contar la misma historia.

Corolario del mismo tipo: **un clamp con `min` y `max` anidados tiene un orden
correcto y otro que se anula solo.** `max(a, min(b, x))` y `min(b, max(a, x))`
solo coinciden si `a ≤ b`; cuando el rango se invierte, uno de los dos topes
desaparece en silencio.

## Consecuencias

Con **cualquier cielo real** el pintado es bit a bit idéntico: verificado en el
A/B para SBe de 16,3 a 26,3. El suelo solo actúa con SBe > 27, que en la
práctica es o un SQM irreal o una pupila de salida diminuta (457 mm a 900x con
sqm 21,5 da SBe 27,4, y ahí el cambio son ~4 niveles de 255).

Pasado el suelo, el nivel pintado deja de crecer con el cielo en vez de
dispararse: con sqm 35 un objeto de μ=22 pasa de blanco puro (281) a un gris
estable (97), el mismo que daría con sqm 30 o 40.

El cambio es progresivo, no un escalón: la diferencia máxima en la escena crece
7 → 30 → 74 → 182 niveles según SBe pasa de 27,3 a 35,3.

## Verificación

- `scripts/test_difuso.js`, secciones "Techo de 27 mag/arcsec² en la magnitud
  límite" (monotonía de `magLimite` de sqm 16 a 40) y "Suelo de 27 mag/arcsec²
  en el Fcielo del pintado" (identidad exacta por debajo del suelo, estabilidad
  por encima, y que `Fcielo`/`Cmin` no se mueven).
