# Notas: separación de dobles en el dibujo (Canvas-2D de Gaia) vs. lo que ve el observador

Investigación sobre una queja concreta: las dobles se ven MÁS separadas en un
dibujo/boceto amateur que en el simulador, para el mismo par, telescopio y
ocular. Hipótesis de partida: el «suelo de visibilidad» del tamaño de estrella
—pensado para que una estrella de magnitud 13 de un globular no desaparezca en
un lienzo de ~720 px— se come el hueco de pares bien resueltos porque no
depende del aumento. Misma convención que
[`notas-resolucion-dobles.md`](notas-resolucion-dobles.md): constantes
primero, cada afirmación citada, `fichero:línea` para el código.

**Conclusión corta (desarrollada abajo): es un fallo de diseño real, no una
percepción del usuario ni una convención de los bocetos amateur.** El propio
veredicto del simulador (`resolucionDoble`) ya calcula correctamente a qué
aumento un observador vería a Almaak, Albireo o Castor separadas — pero el
DIBUJO necesita entre 5× y 8× más aumento que ese veredicto para mostrar
siquiera un píxel de hueco, y contradice sus propias cifras en pantalla.

---

## 1. La tubería de código (verificada línea a línea)

Todo el tamaño y la posición de estrella viven en el módulo compartido
`resources/js/bitacora-gaia-render.js` (raíz del repo, NO dentro de
`simulador_ocular/`); lo consume `simulador_ocular/resources/js/bitacora-ocular.js`.

- **Posición** — `dibujar()`, `bitacora-gaia-render.js:1543-1601`. Escala de
  placa `escv = SIZE / (arcmin/60)` (píxeles por GRADO), línea 1547.
- **Tamaño** — `radioEstrella(o)`, `bitacora-gaia-render.js:1515-1522`:
  ```js
  function radioEstrella(o) {
    var suelo = CFG.radioSuelo * (1 + CFG.blur) * escalaEstrellas(o.afov);
    var theta = radioImagenEstelar(o.apertura);
    var arcmin = +o.arcmin, size = +o.size;
    if (theta == null || !(arcmin > 0) || !(size > 0)) return suelo;
    var fisico = theta * size / (arcmin * 60);        // ″ → px de lienzo
    return Math.sqrt(suelo * suelo + fisico * fisico);
  }
  ```
- **Suelo** — `escalaEstrellas(afov) = CFG.escalaMagAfov / afov`
  (`:1374-1377`), con `CFG.radioSuelo=2.0`, `CFG.blur=1.1`,
  `CFG.escalaMagAfov=60` (`:428`, `:419`, `:440`). Con el afov de referencia
  (60°) `escalaEstrellas=1` y `suelo = 2.0·2.1 = 4.2` px de RADIO — constante,
  **no depende del aumento**, solo del campo aparente del ocular.
- **Físico** — `radioAiry(D)=138.4/D` (Rayleigh, `:1485-1489`),
  `radioImagenEstelar(D)=√(radioAiry²+(seeingArcsec/2)²)` con
  `seeingArcsec=2.0` (`:1490-1495`, `:444-448`). Sí crece con el aumento (vía
  `fisico`) y se aprieta con la apertura.
- **`parDoble()`** (completa lo que Gaia no trae, `:1419-1469`) usa la misma
  convención RA/Dec que `dibujar()`: desplaza `sep·sin(PA)/(3600·cos dec)` en
  RA y `sep·cos(PA)/3600` en Dec — coherente con cómo `dibujar()` proyecta
  después (norte arriba, ver `:1548-1549`). Revisado, **sin bug**: la
  orientación en pantalla es una convención (no se modela el montaje, según el
  propio comentario del código), pero la magnitud del desplazamiento es
  correcta.
- **Consistencia dimensional posición↔tamaño** (verificado con álgebra): la
  posición mueve `deltaRA(°)·escv` px, con `escv=SIZE/(arcmin/60)` px/°. El
  tamaño físico mueve `theta(″)·SIZE/(arcmin·60)` px. Convirtiendo
  `theta` a grados: `(theta/3600)·escv = theta·SIZE·60/(3600·arcmin) =
  theta·SIZE/(60·arcmin)` — **idéntico** a la fórmula de `fisico`. No hay
  discrepancia de unidades entre la doble (que se dibuja con la escala de
  posición) y el tamaño de cada componente (que usa su propia fórmula): son
  la misma escala de placa expresada dos veces. Confirma lo que ya decía
  `CONTEXT.md`.
- **Ruta Canvas-2D concreta** — `renderGaia2D()`,
  `simulador_ocular/resources/js/bitacora-ocular.js:482-551`. El `arcmin` que
  llega a `capaEstrellas`/`dibujar` es `d.campoReal * 60` (`:415`), acotado
  solo por `GAIA_MAX_ARCMIN=360′` (`:91`) — muy por encima de cualquier campo
  real de una doble (unas decenas de arcmin como mucho), así que **ese clamp
  no interviene** en este caso. `AFOV_REF=110` (`:92`) solo escala el
  **tamaño CSS de la ventana** (`diam = ventanaBase()·min(1, afov/AFOV_REF)`,
  `:389`), uniformemente sobre TODO el lienzo ya renderizado — no cambia nada
  en píxeles internos de `PROC=720` (`:93`), así que tampoco es la causa.
  **No se encontró ningún bug de unidades o de clamp** adicional: el efecto
  es enteramente el término `suelo` de `radioEstrella`.

---

## 2. Recálculo aritmético (Node, reimplementando las fórmulas de arriba tal cual)

`SIZE=720` (=`PROC`), `radioSuelo=2.0`, `blur=1.1`, `escalaMagAfov=60`,
`airyArcsec=138.4`, `seeingArcsec=2.0`, `dawes=116/D`.

| Doble | D (mm) | afov ocular | aum | sep (″) | Dawes (″) | suelo (r, px) | físico (r, px) | R_tot (px) | sep en px | hueco (px) |
|---|---|---|---|---|---|---|---|---|---|---|
| **Almaak** (mag 2,3/5,1) | 200 | 60° | 50× | 9,6 | 0,58 | 4,20 | 0,20 | 4,20 | 1,60 | **−6,81** |
| Almaak | 200 | 60° | 75× *(mag. real que la separa, ver §3)* | 9,6 | 0,58 | 4,20 | 0,30 | 4,21 | 2,40 | **−6,02** |
| Almaak | 200 | 60° | 200× | 9,6 | 0,58 | 4,20 | 0,81 | 4,28 | 6,40 | **−2,16** |
| Almaak | 200 | 60° | 300× | 9,6 | 0,58 | 4,20 | 1,22 | 4,37 | 9,60 | +0,85 (recién positivo) |
| Almaak | 200 | 60° | 400× *(cerca del máx. útil, 2×/mm)* | 9,6 | 0,58 | 4,20 | 1,62 | 4,50 | 12,80 | +3,80 |
| **Albireo** (mag 3,1/5,1) | 150 | 68° | 30× | 34,7 | 0,77 | 3,71 | 0,12 | 3,71 | 3,06 | **−4,35** |
| Albireo | 150 | 68° | 75× | 34,7 | 0,77 | 3,71 | 0,30 | 3,72 | 7,65 | +0,22 (recién positivo) |
| Albireo | 150 | 68° | 150× | 34,7 | 0,77 | 3,71 | 0,60 | 3,75 | 15,31 | +7,80 |
| **Castor** (mag 2,9/3,8) | 100 | 50° | 150× | 2,0 | 1,16 | 5,04 | 1,02 | 5,14 | 1,20 | **−9,09** |
| Castor | 100 | 50° | 250× *(> máx. útil práctico)* | 2,0 | 1,16 | 5,04 | 1,71 | 5,32 | 2,00 | **−8,64** |
| Castor | 200 | 50° | 300× *(≈ máx. útil, 2×/mm)* | 2,0 | 0,58 | 5,04 | 1,46 | 5,25 | 2,40 | **−8,09** |
| **Mizar** (dato de catálogo, 715,5″) | 114 | 52° | 30× | 715,5 | 1,02 | 4,85 | 0,18 | 4,85 | 82,56 | +72,86 |
| **Mizar AB real** (~14,4″, WDS) | 114 | 52° | 150× | 14,4 | 1,02 | 4,85 | 0,91 | 4,93 | 8,31 | **−1,55** |

`hueco = sep_px − 2·R_tot`. Negativo = los dos discos SE SOLAPAN en pantalla
(no hay ningún píxel oscuro entre ellos); positivo = empieza a haber hueco,
pero un valor pequeño (0,2–1 px) todavía se ve como una mancha alargada, no
como un «split» limpio.

### Fórmula cerrada del aumento de cruce

Cerca del cruce `fisico ≪ suelo` en casi todo el rango práctico (aperturas
25–300 mm, aumentos normales), así que se puede despejar el aumento al que
`sep_px = 2·suelo` ignorando el término físico:

```
suelo = radioSuelo·(1+blur)·(escalaMagAfov/afov) = 4,2·(60/afov)  → suelo·afov = 252  (constante)
sep_px = sep(″)·SIZE·aum / (afov·3600) = 2·suelo
⇒ aum_cruce ≈ 2·252·3600 / (sep(″)·720) = 2520 / sep(″)
```

**El aumento de cruce NO depende de la apertura D ni del campo aparente del
ocular** (mientras `fisico≪suelo`): solo de la separación en arcosegundos.
Verificado contra la tabla: Almaak 2520/9,6=262,5× (↔ cruce real entre 200× y
300×, ✓); Albireo 2520/34,7=72,6× (↔ cruce real entre 30× y 75×, ✓); Castor
2520/2,0=1260× (↔ tabla: sigue solapado incluso a 300×, coherente con un
cruce muy por encima de cualquier aumento útil, ✓).

---

## 3. Contraste con la realidad observada y con el propio veredicto del simulador

`notas-resolucion-dobles.md` §5 ya documenta, con fuentes primarias
(milwaukeeastro.org, Cloudy Nights), que un observador percibe el hueco de una
doble cuando `aumento·separación(″) ≳ 300″` (empieza a resolver) o `≳ 480″`
(cómodo). El propio simulador implementa exactamente esa regla en
`resolucionDoble()`, `bitacora-ocular.js:664-679`:
```js
var xComodo = Math.ceil(480 / sep);        // aumento para un hueco cómodo (~8′)
if (aum * sep >= 480) → "Se resuelve: ... el hueco es cómodo"
if (aum * sep >= 300) → "Se resuelve justo: ..."
```
Es decir: **el propio texto que el simulador muestra junto a la imagen** dice
que a `300/sep` a `480/sep` aumentos el par ya se separa cómodamente. Pero el
DIBUJO, por la aritmética de arriba, no muestra ni un solo píxel de hueco
hasta `≈2520/sep` — un factor **5,25× a 8,4× mayor**. El simulador se
contradice a sí mismo: el texto y la imagen, al lado uno de otro, cuentan
historias distintas para el mismo par.

**Comprobación contra la observación real** (fuentes primarias/secundarias de
observadores, no de teoría):

- **Almach (Almaak, sep ≈ 9,4-10″).** freestarcharts.com y EOTS
  (eyesonthesky.com) recomiendan 50–75× para separarla, y afirman que **un
  refractor de 80 mm a 75× ya la parte limpiamente en dos** con buen contraste
  de color. BBC Sky at Night Magazine da la misma horquilla, 50–75×.
  Fuentes: [freestarcharts.com/almach](https://freestarcharts.com/almach),
  [eyesonthesky.com — How to find and observe Almach](https://eyesonthesky.com/tutorials/telescope-guides/how-to-find-and-observe-almach-tots6/),
  [BBC Sky at Night — Almach](https://www.skyatnightmagazine.com/advice/almach).
  → El propio `resolucionDoble()` del simulador coincide casi exacto:
  `480/9,6 ≈ 50×` cómodo. **Pero el dibujo, a 75× (el aumento real con el que
  un observador la separa), tiene el par solapado por −6 px** (fila de la
  tabla): en el simulador, a esa potencia, Almaak seguiría viéndose como una
  sola mancha.
- **Algieba (γ Leo, sep ≈ 4″, mag 2,2/3,5).** Una nota de NBC News
  (recogiendo la práctica habitual) dice que un refractor de 80 mm la separa,
  pero necesita «bastante aumento, al menos 100×». Fuente:
  [NBC News — How to see twin stars](https://www.nbcnews.com/news/amp/wbna36829280).
  Con la fórmula de cruce: `2520/4 = 630×` — de nuevo 6× por encima de lo que
  de verdad hace falta en el cielo real.
- **Formula de aumento cómodo, ya citada y con fuente propia** (Mizar 14″ a
  43× ≈ 10′ aparente cómodo, `notas-resolucion-dobles.md:161`): con la
  fórmula de cruce del dibujo, `2520/14 = 180×` — 4× el aumento real.

El patrón se repite en todos los pares comprobados (anchos y fáciles como
Almaak/Albireo, medios como Algieba, y estrechos como Castor): **el suelo del
dibujo exige sistemáticamente entre 4× y 8× más aumento que el que un
observador real necesita**, y muy por encima, en pares como Castor, del
aumento útil máximo de cualquier apertura razonable (`~2×/mm`,
`notas-resolucion-dobles.md:166-167`) — es decir, para pares con separación
por debajo de unos `~6-8″` el dibujo **nunca** llega a mostrar hueco dentro
del rango de aumentos utilizable, sea cual sea la apertura.

---

## 4. Dato de catálogo sospechoso (aparte, no es el bug principal)

`estrellas-dobles-datos.js:180`: Mizar figura con `sep: 715.5`. El par
telescópico «Mizar AB» que motiva el ejemplo clásico de
`notas-resolucion-dobles.md` (14″, 43×, cómodo) es mucho más estrecho; 715,5″
(≈ 11,9′) corresponde a la separación **Mizar–Alcor**, el par visible a ojo
desnudo, no al Mizar AB del WDS. Con `mag1=2.3, mag2=4.0` (magnitudes propias
de Mizar y Alcor) la fila parece describir el par ancho, mal etiquetado solo
como «Mizar». No se ha tocado (fuera del alcance: esto es investigación, no
arreglo), pero conviene que quien edite el catálogo lo revise contra el WDS.

---

## 5. Veredicto: ¿bug, tradeoff o no-problema?

**(b) Es un tradeoff de diseño que hoy es incorrecto para su segundo caso de
uso, no un bug de unidades ni una percepción del usuario.**

- El suelo (`radioSuelo·(1+blur)·escalaEstrellas(afov)`) está bien motivado
  para su propósito original, documentado en `CONTEXT.md` («Escala aparente
  del dibujo»): mantener visible una estrella de magnitud 13 de un globular
  en un lienzo de ~720 px con hasta 110° de campo aparente. Ese caso de uso
  sigue siendo válido.
- Pero el mismo suelo se aplica, sin condición, al dibujo de **cualquier**
  estrella, incluidas las dos componentes de una doble bien resuelta. Como el
  suelo NO depende del aumento (solo del afov del ocular) mientras que la
  separación en píxeles SÍ crece con el aumento, hay una ventana —del orden
  de 5× a 8× el aumento real necesario, y a veces (Castor) todo el rango
  práctico— en la que el dibujo muestra un blob fusionado para un par que el
  propio veredicto del simulador (y la observación real, con fuentes citadas
  arriba) dice que ya se ve separado con holgura.
- No es una convención de los bocetos amateur ni una diferencia
  ojo-vs-cámara: **es medible dentro del propio código**, comparando el texto
  del veredicto con la aritmética del dibujo para el mismo par, mismo equipo,
  mismo instante.
- Tampoco hay un segundo bug de unidades, proyección o clamp: la tubería de
  posición y la de tamaño usan la misma escala de placa (verificado
  algebraicamente en §1), `parDoble()` desplaza con el signo y la magnitud
  correctos, y ni `GAIA_MAX_ARCMIN` ni `AFOV_REF` intervienen en el campo
  real de una doble.

## 6. Candidatas de arreglo (alto nivel)

1. **Acotar el suelo por la separación cuando el objeto es una doble
   catalogada.** `dibujar()`/`radioEstrella()` ya reciben `apertura` y
   `arcmin`; añadir un `sepPx` opcional (calculado en `renderGaia2D` a partir
   de `objetoSel.sep` con la misma `escv`) y recortar
   `suelo ≤ sepPx/2 · margen` solo para las DOS estrellas de la doble. No
   afecta a globulares (no llevan `sep`). **→ Implementada, ver §7.**
2. **Separar «suelo de visibilidad de un punto aislado» de «separación mínima
   entre dos discos vecinos».** El primero (razón de ser del suelo) no
   necesita que cada estrella mida 4 px de RADIO; podría ser más pequeño y
   compensarse con más opacidad/glow (que ya cuentan el brillo, según
   `CONTEXT.md`). Bajar `radioSuelo` directamente movería el cruce (que hoy
   es 5-8× peor que el real) hacia el rango correcto, pero también
   encogería estrellas sueltas de campo ancho — comprobar contra
   `scripts/test_escala.js` y el caso M13 mag 13 a 133× (0,23 px) que
   motivó el suelo. No implementada.
3. **Suelo dependiente del aumento, no solo del afov, aplicado a TODA
   estrella (no solo dobles).** La motivación original (campo aparente
   ancho, pocos aumentos) es precisamente el régimen de aumento BAJO; a
   partir de cierto aumento ya no haría falta el mismo suelo. **Probada y
   descartada** — ver §7: choca con `scripts/test_estrella_fisica.js`
   sección 2 (una estrella tiene que ENGORDAR de forma estrictamente
   monótona al subir el aumento, 222×→333×→667× con Barlow sobre un 114 mm/
   72°). Como en ese tramo el suelo domina la cuadratura sobre el término
   físico, cualquier recorte del suelo por aumento hace que el radio total
   baje momentáneamente antes de volver a subir — una estrella que
   «encoge» al subir el aumento, que es peor que el bug original. Para que
   el recorte no tocara ese rango probado (hasta 667×) haría falta un
   umbral tan alto que no llegaría a aplicarse dentro del rango práctico de
   aumento de un telescopio de aficionado (~2×/mm de apertura) — es decir,
   la versión global de esta idea o rompe una invariante ya probada, o es un
   no-op en la práctica. La opción 1 consigue el mismo resultado («el suelo
   baja con el aumento») sin esta colisión, porque solo toca los dos
   componentes de una doble conocida, nunca una estrella suelta ni un
   cúmulo.
4. **Revisar el dato de Mizar en el catálogo** (§4), aparte de lo anterior.
   No implementada — es un dato de catálogo, no del pipeline de dibujo.

---

## 7. Implementado: opción 1, suelo acotado por el hueco real de la doble

Cambios (sin tocar el veredicto `resolucionDoble()`, que ya estaba bien):

- `resources/js/bitacora-gaia-render.js` — `CFG.margenSuelo: 0.33` y
  `CFG.radioSueloMin: 0.5` (nuevas constantes, junto a `radioSuelo`).
  `radioEstrella(o)` acepta un `o.sep` (″) opcional: si viene y hay
  `arcmin`/`size`, el suelo se recorta a
  `min(suelo, max(radioSueloMin, sepPx·margenSuelo))`, con
  `sepPx = sep·size/(arcmin·60)` (la misma conversión ″→px que ya usa
  `fisico`). Sin `sep` (cualquier campo o cúmulo, que no lo traen) la
  función es bit a bit la de antes.
- `dibujar()` pasa `sep: o.sep` a `radioEstrella` en su única llamada.
- `simulador_ocular/resources/js/bitacora-ocular.js`, `renderGaia2D()` —
  la llamada a `capaEstrellas` ahora incluye
  `sep: objetoSel.doble ? objetoSel.sep : null`; para cualquier objeto que
  no sea una doble catalogada esto es `null` y no cambia nada.

Por qué es seguro (verificado, no solo argumentado): `o.sep` es un
parámetro nuevo y opcional en toda la cadena; ningún test existente lo
pasa, así que los cinco escenarios que ya calibraban el suelo y el término
físico (`scripts/test_escala.js`, `scripts/test_estrella_fisica.js`
secciones 1-5, `scripts/test_par_doble.js`) se ejecutaron sin tocar y
siguen en verde. Se añadió una sección 6 a `test_estrella_fisica.js` que
ejercita el `sep` nuevo: Albireo (34,7″) a 75×/150 mm pasa de ~0,2 px de
hueco (el número de §2-3 de esta nota) a >1,2 px; a 20× (mucho antes del
aumento real de split) el hueco es menor, no se inventa separación; Castor
(2″) a 300×/200 mm sigue fundido, porque el recorte solo quita el suelo
ARTIFICIAL — el término físico (Airy+seeing, que a 2″ de separación con
2″ de seeing es genuinamente marginal) sigue mandando y no se toca.

Efecto sobre la tabla de §2 (recalculado): con `margenSuelo=0.33`, el
cruce para Almaak baja de ≈262× a rangos de doble dígito de aumento en la
zona donde `fisico` aún no domina (el hueco pasa a ser positivo mucho
antes, gobernado por `sepPx·0,33` en vez de por el suelo fijo de 4,2 px);
Albireo, ya el caso más fácil, muestra hueco visible desde aumentos bajos,
acorde con que es splittable a simple vista/binoculares. Sigue habiendo un
límite físico real (Castor, pares por debajo del Dawes/seeing del equipo):
ESO es correcto, no un bug — es la propia física la que decide, no un
suelo de relleno.

Riesgo aceptado, documentado en el propio código: el recorte se aplica a
**todas** las estrellas del campo mientras se dibuja una doble (no solo a
sus dos componentes), porque `capaEstrellas`/`dibujar` reciben un único
`sep` por llamada, no una marca por estrella. En la práctica el campo de
una doble trae pocas estrellas de fondo además del par, así que esas
pocas también salen algo más pequeñas — inocuo (no son el objeto de
interés), pero si algún día se quisiera acotar exactamente a las dos
componentes, haría falta etiquetar qué entradas de `estrellas` vienen de
`parDoble()` y pasar el `sep` por estrella en vez de por llamada.

`margenSuelo=0.33` es una perilla nueva sin más anclaje que "deja un
tercio de hueco visible cuando el suelo manda"; no viene de una fuente
externa como sí lo hacen `radioAiry`/`seeingArcsec`. Si con uso real
resulta corto o largo, es el número a mover primero.

## 8. Implementado: aureola de dispersión (glare) en estrellas resueltas brillantes

Motivado por una queja aparte (globulares saturados a bajo aumento, estrellas
muy brillantes vistas como "agujas de alfiler" sin el halo que se ve a
simple vista) y un documento del usuario sobre el PSF real de una estrella
(punto + anillo de difracción + aureola de dispersión). Se acordó por
`/grill-me`: solo la aureola (el anillo de difracción queda fuera, YAGNI por
ahora), proporcional al flujo absoluto de la estrella, sin corte duro de
magnitud.

- `resources/js/bitacora-gaia-render.js` — `CFG.aureolaRadio: 14.0`,
  `CFG.aureolaAlfaK: 0.15`, `CFG.aureolaAlfaMax: 0.35` (nuevas perillas, sin
  más anclaje que "Sirio/Vega asoman aureola visible pero translúcida,
  Albireo A ya casi no"). Nueva función `alfaAureola(g)` (junto a
  `radioEstrella`): `min(aureolaAlfaMax, aureolaAlfaK·10^(-0,4·g))` —
  a diferencia del glow de las no resueltas (relativo al límite del equipo,
  `mlim-g`), esta es relativa a la magnitud ABSOLUTA: mismo aspecto en
  cualquier telescopio para la misma estrella, como pide el documento.
  Exportada como `BitacoraGaiaRender.alfaAureola`.
- `dibujar()`, rama de estrellas resueltas: si `alfaAureola(g) > 0.004` se
  dibuja `spriteGlow()` (reutilizado, sin sprite nuevo) a radio
  `CFG.aureolaRadio·escalaEstrellas(afov)` -misma convención que `radioSuelo`
  y `glowRadio`-, ANTES del disco y con el mismo `globalCompositeOperation:
  'lighter'` que ya rige todo el bucle.
- Interacción con el recorte `sep` de la fase B (§7): comprobada, no
  necesita caso especial. Con estos números, Almaak A (mag 2,3) da
  `alfaAureola≈0,024` y Albireo A (mag 3,1) `≈0,0086` — ya casi
  imperceptible; solo estrellas mag ≲1 (Sirio, Vega, Rigel) tienen aureola
  con peso real, y ninguna doble catalogada aquí tiene una primaria tan
  brillante. Riesgo teórico vigilado, no arreglado activamente: si algún día
  se cataloga una doble con primaria mag <1, revisar si la aureola rellena
  visualmente el hueco.
- Verificado (no solo argumentado): sección 7 nueva en
  `scripts/test_estrella_fisica.js` — techo en `aureolaAlfaMax` (nunca
  alfa=1, para no parecer un disco sólido), apagado por debajo del umbral de
  dibujo a partir de mag ~10, monotonía estricta con la magnitud. Las 15
  suites de `scripts/test_*.js` siguen en verde.

---

## 9. Implementado: toggle HDR y eliminación de `capasDifusas`

Tickets: [`.scratch/hdr-y-difusas/issues/`](../.scratch/hdr-y-difusas/issues/) — ambos **done**.

- **Truco HDR de `capaEstrellas` activable/desactivable** vía
  `CFG.hdrRescate` (por defecto `false`). Solo cuando está activo se hace la
  segunda pasada (`lienzoEstrellas` con `ganancia: TONO.ganancia`);
  desactivado, una sola pasada/`getImageData` basta. Test:
  `scripts/test_hdr_toggle.js`.
- **`capasDifusas` eliminada por completo** del módulo compartido de
  render, junto con todo lo que componía: telón difuso, halo de King no
  resuelto, y también galaxias y nebulosas (reutilizaban `capaGalaxias`) —
  el usuario, al ver que borrar solo telón/halo dejaba huérfanas galaxias y
  nebulosas, eligió borrar la función entera. Afecta a los DOS
  consumidores: `renderGaia2D` en `bitacora-ocular.js` y la función
  `render()` del propio módulo (usada por el generador de imagen del
  formulario de registro). El fondo cae al relleno plano de nivel de cielo
  en ambos. Se quitó también la barra de casillas "Capas difusas" de
  `ocular-wordpress.html` (quedaban muertas) y las secciones de
  `test_difuso.js` que probaban las capas borradas, conservando las de la
  cadena fotométrica compartida. Se rehará desde cero más adelante.

---

## Fuentes

**Código (repo):**
- `resources/js/bitacora-gaia-render.js` — `CFG` (418-453), `escalaEstrellas`
  (1374-1377), `radioAiry`/`radioImagenEstelar` (1485-1495), `radioEstrella`
  (1515-1522), `parDoble` (1419-1469), `dibujar` (1543-1601).
- `simulador_ocular/resources/js/bitacora-ocular.js` — `PROC`/`GAIA_MAX_ARCMIN`/
  `AFOV_REF` (91-93), `datosOcular` (278-285), `renderGaia2D` (482-551),
  `resolucionDoble` (664-679).
- `simulador_ocular/resources/js/estrellas-dobles-datos.js` — catálogo de
  dobles (Almaak `:51`, Mizar `:180`, Albireo `:267`).
- `CONTEXT.md` — «Escala aparente del dibujo» (~línea 108), «Par de una
  doble» (~línea 156).
- [`notas-resolucion-dobles.md`](notas-resolucion-dobles.md) — Dawes,
  Rayleigh y la regla de aumento perceptual (`480/sep` cómodo, `300/sep`
  marginal), ya sourced y reusada aquí sin cambios.

**Observación real (primarias/secundarias de observadores):**
- freestarcharts.com — [Almach](https://freestarcharts.com/almach): 80 mm a
  75× la separa con buen contraste de color.
- eyesonthesky.com — [How to find and observe Almach](https://eyesonthesky.com/tutorials/telescope-guides/how-to-find-and-observe-almach-tots6/):
  50-75× para empezar.
- BBC Sky at Night Magazine — [Almach](https://www.skyatnightmagazine.com/advice/almach):
  misma horquilla 50-75×.
- NBC News — [How to see twin stars in the spring night sky](https://www.nbcnews.com/news/amp/wbna36829280):
  Algieba (4″) necesita ≥100× con 80 mm; Izar, <3″, difícil incluso a más
  aumento.
