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

## Medido sin ojos (11-ago-2026, tras el proxy de la ficha 11)

Los parches de M31, NGC 4565, M87 y un campo vacío (RA 200°, Dec +35°) bajados
por `ps1-proxy.php` y pasados por `parseFITS` + `ps1AnclarACatalogo` en node, sin
navegador. Esto **no sustituye la mirada**: contesta la pregunta 2 (¿ruidoso?) y
saca un problema que el ojo habría visto como «la galaxia es pequeña».

| campo | NaN | σ borde | encendido tras el corte | mag integrada (cat) |
|---|---|---|---|---|
| M31 (20′) | 0,00 % | 78,8 DN | 36 % | 6,35 (3,61, y el parche solo abarca el 8 % de la luz) |
| NGC 4565 (18,6′) | 1,83 % | 13,0 DN | 13 % | 9,71 (9,67) |
| M87 (10′) | 0,00 % | 24,1 DN | 26 % | 8,89 (8,63) |
| vacío (10′) | 0,01 % | 22,3 DN | 8 % | — |

- **El anclaje está bien** donde la galaxia cabe en el parche: NGC 4565 y M87
  salen a 0,04 y 0,26 mag de su mag V del RC3.
- **El corte en cielo + 1,5·σ se lleva ~31 puntos porcentuales de píxeles
  encendidos en los tres campos** (M31 67→36 %, NGC 4565 46→13 %, M87 58→26 %),
  igual que en M51. Es consistente, no un ajuste hecho para M51.
- **En campo vacío, el 8 % de los píxeles queda por encima del corte.** Es el
  suelo de ruido que se pintaría bajo cualquier parche; ninguna galaxia lo
  ancla, así que no aparece difuso donde no hay galaxia —el catálogo decide qué
  parches se piden—, pero es lo que se suma en las esquinas de un parche real.

### Lo gordo: PanSTARRS ya no tiene el disco externo

Perfil por la **cuña de ±20° sobre el eje mayor**, mediana menos cielo del borde:

| | 1′ | 2′ | 3′ | 4′ | 6′ | 8′ |
|---|---|---|---|---|---|---|
| **M31** (PA 35°) | 12492 DN | 4314 | 1334 | 650 | 274 (3,5σ) | 73 (**0,9σ**) |
| **NGC 4565** (PA 136°) | 1142 DN | 398 | 119 (9,2σ) | −2 (**−0,1σ**) | −12 | −2 |

El modelo del propio RC3 (disco exponencial, n=1) predice para M31 —r_e = 36′—
una caída de **0,35 mag entre 1′ y 8′**. Medido: **5,6 mag**, y a 8′ la señal ya
es cielo. En NGC 4565 (r_e = 3,1′) el modelo cae 4,1 mag entre 1′ y 8′ y el disco
desaparece del todo pasados los 3,5′, con D25 de ~8′ de semieje.

No es nuestro corte: repitiendo el perfil con **k = 0** (sin restar σ) el
resultado apenas se mueve (M31 a 8′: 24,17 → 23,64 mag/arcsec²). Es el **stack de
PanSTARRS**, que resta el fondo por skycell y con él la emisión extendida de un
objeto comparable a la propia skycell.

Consecuencias, sin decidir nada todavía:

1. **M31 y compañía tienen dos problemas, no uno.** Al tope de 20′ ya se sabía
   que quedaba fuera el 92 % de la luz; ahora se sabe que lo que sí entra
   tampoco trae disco más allá de ~6′. La corrección de Sérsic reparte la luz
   del catálogo sobre una galaxia que la imagen dibuja mucho más pequeña.
2. **El disco saldrá más corto que en el DSS** en cualquier galaxia grande, y
   eso es del cartografiado, no del umbral de contraste ni del ojo. Suma a lo ya
   anotado en la mirada de M51.
3. **Salidas posibles** (para decidir mirando, no aquí): dejarlo así y aceptar
   discos cortos; anclar solo la luz *dentro del radio donde la imagen tiene
   señal* en vez de todo el `magV`; o descartar la imagen y volver al Sérsic
   para las galaxias que topan el parche.

Scripts de la medida: fueron desechables (`$CLAUDE_JOB_DIR/tmp`), no se guardan.
Para rehacerla basta bajar el parche con `ps1_armar_parche()` y pasarlo por
`parseFITS` + `ps1AnclarACatalogo`.

## Segunda mirada del usuario (11-ago-2026): NGC 4565, M31, NGC 55

1. **NGC 4565 enseña la banda de polvo.** La vía de imagen aporta también en las
   de canto, que era la razón de tener este campo en la lista. La banda ya no es
   sintética.
2. **M31 «parece un bulbo suelto».** Confirma lo medido: el parche abarca el 8 %
   de su luz *y* el stack no trae el disco, así que el anclaje aprieta toda la
   luz del catálogo en lo poco que la imagen sí registra.
   **Decidido:** las galaxias cuyo parche abarque menos del **40 %** de la luz
   (`PS1.fracMin`) **se quedan sin capa**, como estaban. Son tres en todo el
   catálogo al norte de −30°: **M31 (8 %), IC 342 (17 %) y M33 (23 %)**; la
   siguiente ya está en el 66 %, así que el corte no está pegado a nadie.
   Se descartaron las otras dos salidas: anclar solo la luz dentro del radio con
   señal deja un disco truncado igual de falso, y volver al Sérsic para tres
   objetos resucita justo lo que se borró en `d0a3641`.
3. **NGC 55 no muestra ningún mensaje.** Es lo esperado hoy: la ficha 05 decidió
   «sin capa, con aviso», y el aviso es de la **ficha 12**, que aún no está. Lo
   que sí se comprueba es que no rompe nada: la fila se descarta por `decMin` y
   el campo se pinta como siempre.

## Tercera mirada del usuario (11-ago-2026): Virgo y el corte de `fracMin` en vivo

1. **Virgo (M86) sale bien**, con varias galaxias a la vez en el mismo campo. El
   coste con la caché caliente no molestó y los parches no se estorban entre sí.
   Es el campo que más se parece a lo que verá un usuario real.
2. **M31 y M33 ya no se pintan**, y no es que tarden: es exactamente el corte
   `PS1.fracMin = 0.4` recién puesto. Con `?v=20260811_2330` cargado, esas dos
   filas ni siquiera piden parche.
3. **Efecto secundario visible:** en el campo de M31 sí aparecen **M32 y M110**
   (parche pequeño, luz completa), así que se ven las dos compañeras flotando
   donde debería estar la galaxia grande. Feo, pero menos falso que el bulbo
   suelto: el resto de la vista de M31 sigue siendo la de siempre (Gaia + fondo),
   no un hueco. **No se toca**; si molesta, la salida es de la ficha 12 (aviso
   «esta galaxia no tiene capa de imagen»), no del render.

4. **Pregunta 1 contestada: sí se ven estrellas de más.** «Ensucia la imagen».
   Con eso la ficha **04** pasa de máscara hasta `mlim` a **máscara total** sobre
   la muestra de Gaia del campo, con radio por brillo absoluto y sin `mlim` en
   ninguna parte de la cadena. Detalle y lo que queda fuera (PS1 llega más
   profundo que Gaia), en la Answer de la 04.

Sigue faltando: **campo vacío** en el render de verdad y los **dos aumentos**.
Y la pregunta 3 (¿convence del todo?) sin cerrar.

## Guion de la mirada que falta (necesita ojos)

Requisito: subir `ps1-proxy.php` (y `bitacora-cache-lru.php`) a
`/wp-content/uploads/bitacora/`, más el JS nuevo. En consola:
`BitacoraGaiaRender.galaxiasImagen = true`, y redibujar.

| campo | qué mira | qué contestar |
|---|---|---|
| **M51** (ya visto) | brazos | convence como punto de partida |
| ~~**NGC 4565**~~ | banda de polvo de canto | **visto: la banda se ve** |
| ~~**M31**~~ | el peor caso del anclaje | **visto: bulbo suelto → sin capa (`PS1.fracMin`)** |
| ~~**Virgo** (M87, M84/M86)~~ | varias galaxias a la vez | **visto: bien, varias en el campo, coste tolerable** |
| **campo vacío** a alta latitud | que no aparezca difuso | no debería pintarse nada |
| ~~**NGC 55** (δ −39°)~~ | el aviso del sur | **visto: sin parche y sin aviso; el aviso es de la ficha 12** |
| cualquiera, **dos aumentos** | pupila de salida | el difuso baja `(p1/p2)²`, no el doble |

De las tres preguntas con consecuencia queda una: ~~estrellas de más (ficha 04:
contestada, máscara total)~~, ruido del difuso (ficha 03), y si convence.
