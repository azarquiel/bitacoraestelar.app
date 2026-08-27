# Volumen para la vista de la galaxia — alternativas

Qué opciones hay para que la vista de la Vía Láctea deje de leerse como un
cromo plano, sin tirar a la basura la imagen de fondo, que es el mejor activo
visual del mapa. Se catalogan las alternativas técnicas, se dice qué exige cada
una y qué rompe, y se examina aparte si el «bulbo ficticio» salva la opción de
inclinar la foto con transformaciones 3D del navegador.

Fecha: 2026-08-27. Estado: **investigación, sin decidir**. No se ha medido
nada; al final hay una lista de lo que habría que medir.

Toda afirmación sobre el proyecto va con `fichero:línea` de este repositorio.
Toda afirmación sobre la plataforma va con enlace a la especificación del CSSWG
o a MDN. Lo que no se ha podido verificar se dice con esas palabras.

---

## 1. Punto de partida, comprobado en el código

- La vista es **una imagen fija por punto de vista**: `#mw-image` (cenital) en
  `mapa/mapa.html:466` y `#mw-image-edge` (de canto) en `mapa/mapa.html:480`.
  La de canto no se carga al arranque —pesa unos 6 MB según el comentario de
  `mapa/mapa.html:477`— y su nombre de archivo (`…40KPC_Edge_10K`) anuncia
  10.000 px de ancho.
- Ambas viven dentro de `#mw-content` (`mapa/mapa.html:460`), con
  `transform-origin: center center` y un `transform` 2D de
  `translate(...) scale(...)` que fija el JS en `applyTransform`
  (`mapa/js/via-lactea-app.js:451`), añadiendo `rotate(...)` cuando hay giro en
  plano (`mapa/js/via-lactea-app.js:471`).
- Los marcadores son **DOM absoluto dentro de `#mw-content`**, colocados en
  píxeles a partir de porcentajes de la imagen (`repositionAnchors`,
  `mapa/js/via-lactea-app.js:111` en adelante). Los porcentajes son datos a
  mano por vista: `top: { x, y }` y `edge: { x, y }` en
  `mapa/js/via-lactea-datos.js:44`.
- Cada marcador se **contra-escala** con `scale^-0.9` y se **contra-rota** con
  `rotate(-rot)` para que los nombres se lean horizontales
  (`mapa/js/via-lactea-app.js:481` y `:486`).
- Las coordenadas galácticas reales `l`, `b`, `d` de los 30 objetos ya están
  parseadas en el índice `GAL` (`mapa/js/via-lactea-app.js:59`), y la
  reproyección de la x de canto para cualquier azimut ya existe en
  `VLGeometria.xCantoObjeto`, llamada desde `mapa/js/via-lactea-app.js:81`. Las
  constantes físicas están en `mapa/js/via-lactea-config.js:78`
  (`anchoImagenAl: 130462`) y `:79` (`distanciaSolNucleoAl: 26000`).
- **Ya hay CSS 3D en producción en este mapa**: la voltereta entre vistas pone
  `viewer.style.perspective = '1200px'` y anima
  `… scale(...) rotateX(90deg)` / `rotateX(-90deg)`
  (`mapa/js/via-lactea-app.js:1928`, `:1932`, `:1944`, `:1947`), con
  interruptor `CONFIG.giros.transicion3D` (`mapa/js/via-lactea-config.js:66`).
  Es decir: el paso de la opción 2 no es un salto al vacío, es prolongar en el
  tiempo algo que el mapa ya hace durante 350 ms.
- **Precedente interno de 3D a mano**: `galToXYZ` y `project` en
  `mapa/js/grupo-local.js:37` y `:171` (yaw, pitch, `fov`, y un factor de
  perspectiva falso `1 + z/fov·0.12`), y `project` en
  `mapa/js/vecindario-solar.js:114`. Las dos capas son canvas 2D con proyección
  escrita a mano, sin librerías.
- El fondo del visor es **negro puro**: `background:#000` en
  `mapa/mapa.html:27` (html/body) y `mapa/mapa.html:442` (`#mw-viewer`), que
  además lleva `overflow: hidden`. Este detalle importa para el bulbo ficticio
  (§3.4).
- El abanico de solapados (`fanOutClusters`,
  `mapa/js/via-lactea-app.js:425`) fija un desplazamiento `RADIUS_PX = 15`
  declarado explícitamente como «px de pantalla», y el JS lo convierte a
  coordenadas locales dividiendo por `counter * scale`
  (`mapa/js/via-lactea-app.js:525`). Esa división supone que la relación
  local→pantalla es **una escala uniforme**. Bajo `rotateX` deja de serlo: el
  factor vertical pasa a depender de `cos θ` y de la perspectiva, y el
  horizontal no. Confirmado el diagnóstico del planteamiento.

---

## 2. El catálogo de alternativas

### A1 · Render procedimental en canvas (ya sobre la mesa)

Se pierde la imagen. Nada nuevo que investigar; queda como línea base contra la
que comparar. Vale la pena registrar un matiz: la fuente `grupo-local.js` ya
demuestra que la casa sabe escribir una proyección 3D en canvas sin librerías,
así que el coste de A1 no es técnico, es **visual**.

### A2 · Inclinar la foto con `rotateX` (ya sobre la mesa)

También conocida: `perspective` en el visor, `rotateX(θ)` en `#mw-content`,
`translateZ` por altura sobre el plano, etiquetas contragiradas. Se analiza en
detalle en §3 y §4, porque es la que admite mejoras.

Un punto a su favor que conviene no perder de vista: los `top: {x, y}` de
`via-lactea-datos.js` son la proyección cenital de un disco, así que
inclinarlos con `rotateX` es **exactamente** la proyección correcta para un
objeto en el plano galáctico (`b ≈ 0`). Los datos existentes no se falsean; solo
hay que añadirles la altura. Ninguna otra alternativa conserva ese trabajo
manual tal cual.

### A3 · CSS 3D multicapa: parallax de planos apilados

Varias copias de la imagen (o recortes: brazos, polvo, halo) a distinto
`translateZ` dentro de un contenedor con `transform-style: preserve-3d`, de modo
que al inclinar o girar se despeguen unas de otras.

- **Exige**: un contenedor cuyo valor *usado* de `transform-style` sea
  `preserve-3d` para que los hijos tengan plano propio; la especificación dice
  que solo entonces se establece o extiende el contexto de render 3D
  ([css-transforms-2 §4.1.2 y §7](https://www.w3.org/TR/css-transforms-2/)).
  Exige además **assets nuevos**: separar la foto en capas con transparencia,
  que hoy no existen.
- **Rompe**: cualquier capa con `opacity < 1`, `filter`, `mix-blend-mode`
  distinto de `normal`, `mask-image`, `clip-path`, `overflow` distinto de
  `visible`/`clip` o `contain: paint` fuerza el valor usado a `flat` y aplana su
  subárbol (lista completa en
  [css-transforms-2 §7.1, «grouping property values»](https://www.w3.org/TR/css-transforms-2/)
  y en [MDN, `transform-style`](https://developer.mozilla.org/en-US/docs/Web/CSS/transform-style)).
  Es decir: el fundido entre capas —lo primero que se quiere hacer con un
  parallax— es justo lo que mata el 3D si se aplica en el nodo equivocado. Hay
  que aplicarlo en las hojas, nunca en el contenedor.
- **Coste de memoria**: multiplica por N el número de texturas de una imagen
  grande. En un portátil de 8 GB es el riesgo principal (véase §5).
- **Encaje vanilla**: total, es CSS. Pero el trabajo real es de imagen, no de
  código, y el mapa no tiene hoy quien produzca esas capas.

### A4 · WebGL (o WebGPU) sin librería

Un `<canvas>` con un quad texturizado con la foto y una matriz de proyección de
verdad; los marcadores seguirían siendo DOM, proyectados a mano como ya se hace
en `grupo-local.js:171`.

- **Exige**: unas 100–150 líneas de fontanería (shaders, buffers, texturas,
  gestión de `webglcontextlost`), más el código de proyección para colocar el
  DOM encima. No añade dependencias: WebGL es plataforma, no librería, así que
  no viola la regla de `CLAUDE.md`.
- **Da gratis** lo que a CSS le cuesta: perspectiva correcta, orden por
  profundidad de verdad, y —si algún día se quiere— desplazamiento por mapa de
  profundidad (A7) en el shader, sin coste adicional de arquitectura.
- **Rompe**: sale del modelo de composición del navegador. Los anillos
  (`#mw-anillos`), la ruta del viaje (`#mw-ruta`, `mapa/mapa.html:330`) y los
  marcadores viven en DOM/SVG y tendrían que sincronizarse a mano con la cámara
  del canvas cada fotograma; hoy viajan gratis dentro del mismo `transform` del
  contenedor. Es el mayor cambio estructural de toda la lista.
- **WebGPU** no aporta nada aquí (una textura y un quad) y su soporte sigue
  incompleto: según el resumen de Google, disponible en Chrome, Edge, Safari 26
  y Firefox en Windows, pendiente Firefox en Linux/Android/Mac Intel
  ([web.dev, blog de Google — fuente de fabricante, no especificación](https://web.dev/blog/webgpu-supported-major-browsers)).
  Descartable sin más discusión.

### A5 · Canvas 2D con warp de la imagen por trozos

Dibujar la foto troceada en triángulos o tiras, cada uno con su `setTransform`,
para simular la inclinación.

- **Verificado y decisivo**: el contexto 2D solo admite transformaciones
  **afines**. Su matriz es
  `[[a, c, e], [b, d, f], [0, 0, 1]]`, con la última fila fija, y el mapeo es
  `(x,y) → (ax+cy+e, bx+dy+f)`
  ([MDN, `CanvasRenderingContext2D.transform`](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/transform)).
  Lo que hace falta para inclinar un plano es una **homografía**, que no es
  afín. Solo se puede aproximar subdividiendo, y a más subdivisión, más coste y
  más costuras: cada trozo se recorta con `clip()` y los bordes antialiaseados
  dejan hilos de fondo entre triángulos.
- **Veredicto**: es reimplementar a mano, peor y en CPU, lo que `rotateX` hace
  exacto y en GPU. No hay razón para preferirlo salvo que se quisiera un warp
  que **no** sea una proyección plana. Descartado como vía principal.

### A6 · SVG con `feDisplacementMap` u otros filtros

- `feDisplacementMap` desplaza píxeles según los canales de otra imagen:
  `P'(x,y) ← P(x + scale·(XC(x,y) − 0.5), y + scale·(YC(x,y) − 0.5))`
  ([MDN, `feDisplacementMap`](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feDisplacementMap)).
  Es un remapeo 2D por píxel: **no hay término de profundidad, ni cámara, ni
  proyección**. Sirve para abombar, no para inclinar un disco de manera
  coherente con las posiciones de 30 marcadores DOM que van por otro camino.
- Además cualquier `filter` distinto de `none` es un valor de agrupación y
  **fuerza `flat`** en ese subárbol
  ([css-transforms-2 §7.1](https://www.w3.org/TR/css-transforms-2/)): filtro y
  3D no se combinan libremente en el mismo nodo.
- **Veredicto**: útil, como mucho, para un efecto local decorativo (un abombado
  del bulbo). Inservible como mecanismo de la vista. No verificado su coste en
  esta máquina; los filtros SVG grandes se rasterizan y son de los efectos más
  caros, pero MDN no documenta rendimiento en esa página.

### A7 · Imagen + mapa de profundidad (2.5D, parallax occlusion)

Un asset de profundidad por píxel (el disco casi plano, el bulbo abombado) y un
desplazamiento por píxel al mover la cámara.

- **Exige** dos cosas que hoy no existen: el mapa de profundidad —habría que
  pintarlo a mano, la imagen no lo trae— y un shader, es decir A4 por debajo.
  Sin WebGL solo queda aproximarlo con N capas, que es A3.
- **Rompe**: nada estructural más allá de lo que ya rompe A4, pero duplica el
  trabajo de assets.
- **Veredicto**: es la opción más vistosa de la lista y la más cara. Si algún
  día se hace A4, esto es su continuación natural; por sí sola no compite.

### A8 · Sprites de billboard

No es una alternativa a la vista, es una **pieza** de las demás: elementos que
siempre miran a la cámara. En CSS se consigue contra-rotando el hijo con
`rotateX(-θ)` dentro de un contexto `preserve-3d`. Es la respuesta a las
etiquetas y, en §3, al bulbo. Se trata en detalle allí.

### A9 · Imágenes pregeneradas por ángulo (bullet-time / sprite sheet)

N imágenes de la galaxia a N inclinaciones, y se cambia la que se muestra.

- **El obstáculo no es técnico, es que no existen esas imágenes**. La Vía Láctea
  no se puede fotografiar desde fuera: la vista cenital ya es una
  reconstrucción, no una foto. Generar la misma reconstrucción a 20
  inclinaciones distintas exige **un modelo 3D de la galaxia**, es decir, exige
  A1 primero y luego usarlo offline. Que las imágenes sean pregeneradas no
  ahorra el modelo: lo presupone.
- **Coste**: 20 fotogramas de una imagen del tamaño de la actual es peso de
  descarga serio, en un mapa que ya aplaza los 6 MB de la de canto
  (`mapa/mapa.html:477`). Y solo da los ángulos pregenerados: el zoom sí, pero
  la inclinación queda a saltos.
- **Veredicto**: es A1 con caché. Interesante *solo* si A1 se llegara a hacer y
  resultara demasiado cara en tiempo real, que no es el caso: `grupo-local.js`
  ya pinta escenas 3D a 60 fps.

### Resumen comparado

| Opción | Assets nuevos | Código nuevo | Conserva la foto | Encaje vanilla |
|---|---|---|---|---|
| A1 procedimental | modelo de la galaxia | alto | **no** | sí |
| A2 `rotateX` sobre la foto | ninguno | bajo | sí | sí |
| A3 capas apiladas | recortes por capa | bajo | sí (troceada) | sí |
| A4 WebGL sin librería | ninguno | alto | sí | sí, sin dependencias |
| A5 warp en canvas 2D | ninguno | medio-alto | sí, con costuras | sí |
| A6 filtros SVG | mapa de desplazamiento | bajo | sí, deformada | sí |
| A7 mapa de profundidad | mapa de profundidad | alto (necesita A4) | sí | sí |
| A9 sprites por ángulo | N renders (⇒ A1) | bajo | no (son renders) | sí |

---

## 3. El bulbo ficticio: ¿salva la opción A2?

El problema declarado: al inclinar una foto plana, el bulbo —que es una
esfera— se aplasta a una elipse, y el ojo lo lee como lo que es, un cromo
tumbado. La pregunta es si un elemento adicional puede restituir ese volumen.

### 3.1 Un elemento que no reciba (o reciba a medias) la inclinación

**Viable, y es la pieza clave.** Dentro de un contenedor cuyo valor usado de
`transform-style` sea `preserve-3d`, un hijo con transformación 3D propia
«se renderiza en su propio plano»
([css-transforms-2 §4.1.2](https://www.w3.org/TR/css-transforms-2/)); basta
darle `rotateX(-θ)` para que quede vertical frente a la cámara mientras el disco
se tumba. Su contenido puede ser un `div` con `radial-gradient` o un
`<canvas>`; da igual, la técnica es la misma.

Dos matices que sí hay que verificar en la especificación antes de escribir
código:

1. El contenedor tiene que tener **valor usado** `preserve-3d`, no solo
   computado. El valor computado establece contexto de apilamiento y bloque
   contenedor; solo el valor usado establece o extiende el contexto de render 3D
   ([§7](https://www.w3.org/TR/css-transforms-2/)). Cualquier propiedad de
   agrupación en ese nodo lo tumba a `flat` (§7.1).
2. Existe una **cuestión abierta** en la especificación sobre si los elementos
   con transformación **2D** deberían tener plano propio; hoy la redacción da
   plano propio a los transformados en 3D
   ([§4.1.2, nota de issue abierta](https://www.w3.org/TR/css-transforms-2/)).
   Consecuencia práctica para este mapa: la contra-escala actual de los
   marcadores es 2D (`scale^-0.9`, `mapa/js/via-lactea-app.js:481`), así que
   **no** los sacaría del plano del disco. Para que un marcador se comporte como
   billboard hay que darle una transformación 3D explícita.

El «reciba a medias» —inclinar el bulbo `rotateX(-θ/2)` en lugar de `-θ`— es
legítimo y probablemente lo correcto: una esfera vista desde arriba sigue siendo
un disco, y un billboard estrictamente vertical sobre un disco tumbado tiene
tanta pinta de cartón como el bulbo aplastado. Es un parámetro a calibrar a
ojo, no un teorema.

### 3.2 Billboard con `rotateX(-θ)`

Igual que 3.1, aplicado a las etiquetas. **Viable y necesario**: sin él, los
nombres se leen tumbados en perspectiva. Un aviso: un billboard vertical anclado
al plano **cruza** el plano del disco (mitad delante, mitad detrás), y ahí
entra el problema de intersección de §3.5. Se evita con truco barato: darle
`translateZ` positivo suficiente para que flote por delante y no interseque
nada. La contrapartida es que flotar en Z desplaza el marcador en pantalla por
la perspectiva, y hay que compensarlo o aceptarlo.

### 3.3 Capas apiladas para grosor de disco y halo

**Viable** y es A3 en pequeño: tres o cuatro copias del bulbo con `translateZ`
escalonado y opacidad decreciente dan grosor sin ningún asset nuevo. Con la
misma condición que en A3: la opacidad va en las hojas, no en el contenedor,
porque `opacity < 1` es valor de agrupación y aplana
([§7.1](https://www.w3.org/TR/css-transforms-2/); el caso concreto de `opacity`
se añadió tarde a la especificación y rompió escenas existentes al llegar a
Chrome 53, ver [csswg-drafts#496](https://github.com/w3c/csswg-drafts/issues/496)).

### 3.4 Fundir el bulbo con la foto: `mix-blend-mode` **no**

Éste es el hallazgo más útil de la sección. `mix-blend-mode` distinto de
`normal` **es un valor de agrupación**: fuerza el valor usado de
`transform-style` a `flat`
([css-transforms-2 §7.1](https://www.w3.org/TR/css-transforms-2/),
[MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/transform-style)). Poner
`mix-blend-mode: screen` en el bulbo dentro del contenedor 3D lo aplanaría
contra el plano del disco: exactamente el efecto que se estaba intentando
evitar. Firefox históricamente no lo aplicaba —lo señala CSS-Tricks, blog, no
fuente normativa— pero eso es una divergencia, no una licencia.

La salida es que **no hace falta blend**: el fondo del visor es negro puro
(`mapa/mapa.html:27` y `:442`), y sobre negro, un sprite con alfa que se
desvanece a transparente es visualmente indistinguible de `screen`, porque
`screen` sobre 0 es la identidad. Un `radial-gradient` de blanco a
`transparent` con `background-blend-mode` **dentro** del propio sprite (no
`mix-blend-mode` hacia fuera) tampoco aplana nada: la lista de §7.1 nombra
`mix-blend-mode`, no `background-blend-mode`. Esto último **no está
verificado** en implementaciones reales; la lectura de la especificación es
literal.

### 3.5 Orden de pintado e intersección de planos

La especificación es explícita: los planos participantes se someten a
«intersection … according to Newell's algorithm», y los coplanares se pintan en
orden de pintado
([css-transforms-2 §4.1.2](https://www.w3.org/TR/css-transforms-2/)). Es decir,
en teoría el navegador **sí** interseca un plano con otro, no solo los ordena.

En la práctica hay que desconfiar:

- El hilo de la lista `public-fx` de 2011 en el que se discutió esto deja
  constancia de que el comportamiento de `preserve-3d` «no estaba bien definido
  y las implementaciones diferían considerablemente», y de que Robert
  O'Callahan pidió expresamente una nota admitiendo que los navegadores no
  darían el render ideal en todos los casos
  ([archivo de la lista, W3C](https://lists.w3.org/Archives/Public/public-fx/2011OctDec/0025.html)).
  Es material de 2011: viejo, pero es la fuente primaria del diseño.
- El **hit-testing** con transformaciones 3D **no está especificado**. La
  cuestión sigue abierta:
  [csswg-drafts#3997, «Define hit testing behavior for 3D transformed
  elements»](https://github.com/w3c/csswg-drafts/issues/3997) documenta que,
  con un hijo que cruza el plano de su padre `preserve-3d`, Chrome y Safari
  hacen pulsables las dos regiones y Firefox solo una. Para un mapa donde
  **todo se pulsa**, esto no es un detalle estético.

Regla de trabajo que se deduce: **no hacer que nada interseque nada**. Un
bulbo o una etiqueta que floten por delante del plano en Z, sin cruzarlo, no
dependen del algoritmo de Newell ni del hit-testing indefinido, solo del orden
por profundidad, que es la parte que todos implementan.

### Veredicto sobre el bulbo ficticio

**Viable**, y con menos código del que parece: un elemento con
`rotateX(-θ·k)` y `translateZ` positivo dentro de un `#mw-content` con
`preserve-3d`, pintado con `radial-gradient` sobre fondo negro, sin
`mix-blend-mode`, sin intersecar el plano. Lo que **no** es viable es
(a) fundirlo con `mix-blend-mode`, (b) contar con que la intersección de planos
se resuelva igual en los tres motores, y (c) esperar que los marcadores se
enderecen solos: su contra-transformación actual es 2D y los deja tumbados.

Lo que queda sin respuesta técnica y es puro juicio visual: si un degradado
radial sobre una foto de un bulbo real se ve como volumen o como una pegatina.
Eso no lo decide ninguna especificación.

---

## 4. Lo que rompe A2, con nombre y apellidos

1. **El abanico de solapados.** `fanOutClusters`
   (`mapa/js/via-lactea-app.js:425`) fija 15 «px de pantalla» y `applyTransform`
   los convierte dividiendo por `counter * scale`
   (`mapa/js/via-lactea-app.js:525`), asumiendo escala uniforme. Bajo `rotateX`
   la relación local→pantalla ya no es uniforme. Arreglo posible sin
   matemáticas nuevas: leer la posición real en pantalla con
   `getBoundingClientRect()`, que devuelve el rectángulo ya transformado
   ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect);
   la página no habla de transformaciones, lo hace cssom-view, que define el
   resultado sobre los rects de cliente ya transformados). El mapa ya usa esa
   técnica en `cercaDelSol` (`mapa/js/via-lactea-app.js:633`, con la llamada en
   `:640`), sobre un ancla de
   0×0 px, que es justo el caso.
2. **Las etiquetas.** Deben leerse horizontales; con el disco inclinado hay que
   contra-rotarlas en 3D, no en 2D (§3.1, punto 2). Nótese que
   `.mw-no-visitado .mw-label` lleva `filter: grayscale(...)`
   (`mapa/mapa.html:394`): `filter` es valor de agrupación, así que aplana su
   **subárbol**; como la etiqueta es una hoja, no debería estorbar, pero
   conviene comprobarlo antes de darlo por bueno.
3. **La altura sobre el plano no es un detalle.** Con
   `anchoImagenAl = 130462` (`mapa/js/via-lactea-config.js:78`), M2
   (`b ≈ −35,8°`, `d ≈ 37.500 al`, `mapa/js/via-lactea-datos.js:50`) está a
   `37.500·sen 35,8° ≈ 21.900 al` del plano, o sea **0,168 anchos de imagen**.
   Sobre una imagen de 1.600 px son casi 270 px de `translateZ`: el marcador
   flotaría muy alto y muy lejos de donde el usuario lo ha visto siempre. Es
   físicamente correcto y visualmente violento. Hay que decidir si se aplica un
   factor de exageración menor que 1.
4. **La perspectiva cambia con el zoom.** El `scale` de `applyTransform`
   multiplica también las coordenadas Z de los hijos, mientras `perspective`
   está fijada en el visor a `1200px`
   (`mapa/js/via-lactea-app.js:1928`). A `scale = 25` la deformación no será la
   misma que a `scale = 1`. O se hace la perspectiva función del zoom, o se
   acepta el efecto.
5. **Anillos y ruta.** `#mw-anillos` (`mapa/mapa.html:399`) y `#mw-ruta`
   (`mapa/mapa.html:330`) son SVG dentro de `#mw-content`: al inclinar, los
   anillos de distancia pasan a verse como elipses, que es **correcto** y sale
   gratis. Sus rótulos, en cambio, llevan contra-transformación 2D
   (`mapa/js/via-lactea-app.js:332`) y quedarían tumbados igual que las
   etiquetas. Aviso adicional: `clipPath`, `mask` y `pattern` de SVG fuerzan
   aplanamiento y anulan `preserve-3d`
   ([css-transforms-2 §11](https://www.w3.org/TR/css-transforms-2/)).
6. **Accesibilidad.** Si la inclinación se anima, hay que respetar
   `prefers-reduced-motion: reduce`, que indica que el usuario ha pedido
   minimizar el movimiento no esencial
   ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)).
   Un mapa que se inclina al arrastrar es movimiento vestibular de manual. El
   proyecto **sí respeta hoy `prefers-reduced-motion`** en cuatro sitios
   (`mapa/mapa.html:211` y `:430`, `mapa/js/via-lactea-viaje.js:267`,
   `mapa/js/via-lactea-app.js:1091`), así que A2 tendría que sumarse a esa lista,
   no estrenarla: con la preferencia activa, la inclinación debería quedarse fija
   o no aplicarse. (Corrección de 2026-08-27: la primera versión de esta nota
   afirmaba que no había ninguna consulta; era falso.)
7. **Clics.** Ver §3.5: el hit-testing en 3D no está especificado y diverge
   entre motores (csswg-drafts#3997; también
   [Bugzilla 1686390](https://bugzilla.mozilla.org/show_bug.cgi?id=1686390),
   «hit testing on css transform behaves differently than Chrome»). Mitigable
   evitando intersecciones.
8. **Memoria en una máquina de 8 GB.** Inclinar de forma **permanente** una
   imagen grande la mantiene como textura compuesta en GPU, y a `scale` alto el
   navegador rasteriza a resolución de composición. La imagen de canto declara
   10.000 px de ancho (`mapa/mapa.html:480`). Que hoy la voltereta funcione no
   prueba nada: dura 350 ms. **No verificado**: ni el consumo real, ni si algún
   motor cae a rasterización por CPU con `preserve-3d` permanente.
9. **Móvil.** El visor usa `touch-action: none` y gestos de pellizco
   (`mapa/js/via-lactea-app.js:979` en adelante), que calculan un ancla en
   coordenadas de contenido a partir de coordenadas de pantalla
   (`mapa/js/via-lactea-app.js:990`). Ese cálculo sufre el mismo problema que el
   abanico: supone escala uniforme.

---

## 5. Recomendación

Seguir con **A2 más el bulbo ficticio de §3**, y no por entusiasmo con la
técnica, sino por descarte razonado:

- A5 y A6 son peores versiones de lo que `rotateX` hace exacto y por hardware:
  el canvas 2D no puede hacer una homografía (afín, matriz con última fila
  fija) y `feDisplacementMap` no tiene término de profundidad.
- A9 no ahorra el modelo 3D, lo presupone, y añade megabytes.
- A1 y A7 pierden o rehacen el activo visual del mapa.
- A4 es la única técnicamente superior, y su precio es sacar del `transform`
  compartido a los marcadores, los anillos y la ruta del viaje, que hoy viajan
  gratis. Es una reescritura de la vista, no una mejora estética. Merece
  quedar anotada como el camino si algún día se quiere A7.
- A3 es el plan B natural si el bulbo con degradado no convence: mismas reglas
  de CSS 3D, pero pagando el troceado de la imagen en capas.

El orden sensato de trabajo, por si sirve: primero comprobar que las etiquetas
se enderezan y que los clics siguen cayendo donde deben (los dos riesgos
estructurales), y solo después pelear el aspecto del bulbo. Si el hit-testing da
guerra, ninguna cantidad de degradado radial salva la opción.

Y una cautela: el mapa ya tiene un interruptor para el 3D
(`CONFIG.giros.transicion3D`, `mapa/js/via-lactea-config.js:66`). Sea lo que
sea lo que se haga, debería nacer con el suyo y apagado por defecto hasta que
se mida.

---

## 6. Qué habría que medir antes de decidir

1. **Memoria y fps con la inclinación permanente**, en la máquina de 8 GB, a
   `scale = 1` y a `scale = 25`, en las dos vistas (la de canto tiene 10.000 px
   de ancho). Comparar contra la vista actual sin inclinar.
2. **Hit-testing real** en Chrome, Firefox y Safari con un marcador billboard
   sobre el disco inclinado: en qué píxeles se puede pulsar y si coincide con lo
   que se ve. Con y sin `translateZ` que evite la intersección.
3. **El error del abanico**: cuántos píxeles se desvía el marcador de M8/M20
   respecto de su punto real bajo `rotateX`, antes y después de recalcular el
   desplazamiento con `getBoundingClientRect()`.
4. **El factor de exageración de la altura**: a qué fracción de la altura
   verdadera (§4.3) deja de parecer que los globulares se han soltado del mapa.
   Es una medida de juicio, con capturas, no un número.
5. **El ángulo de inclinación del bulbo** (`k` de `rotateX(-θ·k)`, §3.1): a qué
   valor deja de verse aplastado sin verse como una pegatina de pie.
6. **Si `background-blend-mode` dentro del sprite mantiene el
   `preserve-3d`** (§3.4, lectura literal de la especificación, no verificada
   en ningún motor).
7. **Coste de la rasterización a zoom alto** con `preserve-3d` permanente:
   comprobar si algún motor deja de componer en GPU. No verificado en ninguna
   fuente consultada.

---

## 7. Fuentes

Normativas y documentación oficial:

- [CSS Transforms Module Level 2, W3C/CSSWG](https://www.w3.org/TR/css-transforms-2/)
  — §4.1.2 (contextos de render 3D, planos propios, Newell), §4.1.3
  (aplanamiento por defecto), §4.1.5 y §10 (`backface-visibility`), §7
  (valor computado vs. usado de `preserve-3d`), §7.1 (valores de agrupación que
  fuerzan `flat`), §8 y §9 (`perspective`, `perspective-origin`), §11 (SVG
  `clipPath`/`mask`/`pattern` anulan `preserve-3d`).
- [MDN, `transform-style`](https://developer.mozilla.org/en-US/docs/Web/CSS/transform-style)
- [MDN, `CanvasRenderingContext2D.transform`](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/transform)
- [MDN, `feDisplacementMap`](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feDisplacementMap)
- [MDN, `Element.getBoundingClientRect()`](https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect)
- [MDN, `prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)

Discusión del grupo de trabajo y errores de implementación (primarias, pero no
normativas):

- [csswg-drafts#3997 — hit testing con transformaciones 3D, abierto desde 2019](https://github.com/w3c/csswg-drafts/issues/3997)
- [csswg-drafts#496 — `opacity` y `filter` aplanando escenas 3D](https://github.com/w3c/csswg-drafts/issues/496)
- [public-fx, octubre 2011 — `preserve-3d`, intersección e implementaciones divergentes](https://lists.w3.org/Archives/Public/public-fx/2011OctDec/0025.html)
- [Bugzilla 1686390 — el hit-testing con `transform` difiere de Chrome](https://bugzilla.mozilla.org/show_bug.cgi?id=1686390)

Secundarias, marcadas como tales y usadas solo como pista, nunca como respaldo:

- CSS-Tricks, «Things to Watch Out for When Working with CSS 3D» — **blog**;
  lo que dice sobre `mix-blend-mode` y `opacity` está respaldado por
  css-transforms-2 §7.1, que es lo que se cita arriba.
- web.dev, «WebGPU is now supported in major browsers» — **blog de
  fabricante**; usado solo para situar el soporte de WebGPU, que en cualquier
  caso queda descartado.
