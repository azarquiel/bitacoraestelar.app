# 07 — Prototipo: un campo real por la cadena entera

**Type:** prototype
**Status:** open — **es la fase 1 de la ficha 10**, no un prototipo aparte
**Blocked by:** 03, 04, 05 (cerradas) · se ejecuta dentro de 10

## Question

**Esta es la puerta.** El intento anterior murió aquí: se construyó entero, se
miró, y no convenció —Sérsic falso, formas erróneas, mancha uniforme—. Esta vez
la mirada va **antes** de construir nada definitivo.

Hacer un prototipo desechable, lo más barato posible, que pinte un campo real
por la cadena completa: recorte de cartografiado → supresión de estrellas →
`Fobj` → `ctxFotometrico`/`pintarFot` → estrellas de Gaia encima. Y mirarlo.

Campos que hay que ver, porque cada uno rompe una cosa distinta:

- **M51** — galaxia de cara con brazos. Es el caso que motivó el encargo: si los
  brazos no se ven, la vía de imagen no aporta nada sobre el Sérsic.
- **M31** — enorme, más grande que el campo, y con núcleo muy brillante. Prueba
  el recorte y el rango dinámico.
- **NGC 4565** — de canto, con banda de polvo. La banda era sintética antes.
- **M42** — nebulosa con estrellas brillantes dentro (el Trapecio). Prueba la
  supresión de estrellas en el peor caso.
- **Un campo vacío a alta latitud galáctica** — no puede aparecer difuso donde
  no lo hay.

Y con dos aumentos muy distintos en cada uno, para ver que la pupila de salida
atenúa el difuso como debe (`(p1/p2)²` entre dos aumentos) y no dos veces.

Juicio explícito del usuario antes de seguir: ¿esto convence o no? Si no
convence, la respuesta de esta ficha dice **qué** falla, con nombre y apellidos.
Ese fue el dato que faltó la vez anterior.

## Actualización (11-ago-2026): no es desechable, es la fase 1

Decidido en la sesión de `/grilling`: la mirada se hace **en el render de
verdad**, no en un prototipo aparte. Un prototipo desechable juzgaría una imagen
que no ha pasado por `ctxFotometrico`, `visibilidadDifusa` ni la adaptación
local, y son esas tres las que deciden qué se ve: juzgar fuera de la cadena es
juzgar otra cosa.

Así que la capa se escribe en el simulador, pidiendo a `fitscut.cgi` **directo
desde el navegador** (CORS abierto, no hace falta servidor), con el interruptor
apagado por defecto. El proxy con caché (ficha 11) llega después: es caché pura,
no cambia un píxel, y hacerlo antes solo retrasa el juicio.

Coste asumido de esta fase: hasta 8 peticiones a STScI por galaxia, 2,6 s cada
una. Lento e incómodo, a propósito y temporalmente.

### Campos, revisados con el alcance final

El alcance quedó en **galaxias**, así que M42 sale de la lista como caso propio
y su papel —supresión de estrellas en el peor caso— lo cubre M31 con su campo
sembrado, más algún par de galaxias con estrella brillante encima.

- **M51** — de cara, con brazos. El caso que motivó el encargo: si los brazos no
  se ven, la vía de imagen no aporta nada sobre el Sérsic.
- **M31** — enorme: topa el parche a 20′, y ahí la corrección de luz fuera del
  parche llega al 40–60 %. Es el peor caso del anclaje de la ficha 03.
- **NGC 4565** — de canto, con banda de polvo. La banda era sintética antes.
- **Una galaxia a caballo de dos skycells** — prueba la fusión por NaN
  (ficha 10). M31 ya lo es: su parche toca **cuatro**.
- **El cúmulo de Virgo** — varias galaxias en un campo: prueba el coste de la
  fase sin proxy y decide si hace falta tope (ficha 10).
- **Un campo vacío a alta latitud galáctica** — no puede aparecer difuso donde
  no lo hay.
- **Una galaxia a δ < −30°** (NGC 253) — no hay imagen: comprueba el aviso de la
  ficha 05, no el difuso.

Y con dos aumentos muy distintos en cada uno, para ver que la pupila atenúa el
difuso como debe (`(p1/p2)²`) y no dos veces.

### Qué se juzga, con nombre y apellidos

Tres preguntas al usuario, y las tres tienen consecuencia escrita:

1. **¿Se ven estrellas de más en el parche?** → se pasa a máscara total
   (ficha 04).
2. **¿Sale ruidoso el difuso?** → la gamma perceptual sobre imagen real sobra o
   cambia de valor, o hay que suavizar el parche antes de sumarlo (ficha 03).
3. **¿Convence?** Si no, esta ficha dice **qué** falla. Ese fue el dato que
   faltó la vez anterior.


## Answer — parcial (11-ago-2026, primera mirada del usuario: M51)

**Convence como punto de partida.** Los brazos SÍ se ven: la vía de imagen aporta
sobre el Sérsic, que era la pregunta que abría esta ficha.

Campos vistos: **solo M51**. Faltan M31, NGC 4565, Virgo, campo vacío, NGC 253 y
la prueba de dos aumentos.

### Lo que se arregló mirando M51

1. **Galaxia espejada de arriba abajo** (`425ccb4`). La fila del FITS crece hacia
   el NORTE y `ps1PintarParche` la leía al revés. Con M51 y NGC 5195 —que salen
   en los dos parches— el espejo parecía una copia duplicada. La fusión de
   skycells no tenía nada que ver: las cuatro llegan con la misma WCS.
2. **Lo tenue, muy exagerado** (`5f4ba80`), que es la pregunta 2 de esta ficha
   («¿sale ruidoso el difuso?»). Respuesta: **sí, y por dos causas medidas**:
   - Recortar en el cielo pelado deja solo el ruido POSITIVO del stack: pedestal
     falso por todo el parche (21 % del flujo en el equivalente sintético) que
     además apagaba la galaxia, porque el anclaje reparte el catálogo entre ese
     ruido. Corte nuevo en **cielo + 1,5·σ** (MAD del borde): píxeles encendidos
     del 49 % del parche al 20 %, por un 3 % de galaxia real que el reescalado
     devuelve.
   - El realce perceptual, calibrado contra perfiles sintéticos que se acaban
     sobre μ23, inflaba ×13 lo que una imagen real sí tiene ahí: 0,8 mag de
     regalo. **Techo ×2, por capa**, solo cuando hay parche.

Medido en M51, μ real → μ pintada: 2,5′ 21,88→21,74 (antes 21,36) · 4,5′
22,36→22,70 (antes 21,63) · 3,0′ 23,05→24,66 (antes 22,52).

### Lo que NO era

- **Resta de cielo:** la mediana del borde sale −0,3 DN. El stack ya viene
  restado; no le quitábamos galaxia.
- **Huecos de skycell:** 0,03 % de NaN tras fusionar.
- **Nivel absoluto:** el perfil da μ 21,5–21,9 entre 1′ y 2,5′, contra el 21,6 de
  brillo medio que sale de V=8,21 dentro de D25. El anclaje está bien.
- **`ZPT` de la cabecera:** da 5,7 mag para M51 contra 8,5 esperado. Su convención
  no es la que se supuso — razón de más para que el nivel lo ponga el catálogo.

### Abierto

- **Pregunta 1 (estrellas de más)**: sin respuesta todavía; la ficha 04 sigue
  provisional.
- **Doble contabilidad en el solape**: M51 y NGC 5195 son dos filas del RC3, cada
  parche contiene a las dos y cada uno se ancla a su propia mag V. En la zona
  común la luz se suma dos veces. Salidas: anclar por grupo, o recortar cada
  parche a su galaxia.
- **Las aureolas de las estrellas de Gaia** son mucho más gordas que las del DSS y
  compiten con el disco justo donde está al borde del umbral.
- El **umbral de contraste** apaga el 83 % de los píxeles con luz (20 % del
  flujo): es el modelo del ojo, no un fallo, pero explica por qué el DSS enseña
  disco continuo y nosotros no. Si el DSS es la referencia a igualar, eso es
  decisión de modelo.
