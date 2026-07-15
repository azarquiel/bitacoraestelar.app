# Mapa interactivo de la Vía Láctea

Visor de objetos del catálogo Messier situados sobre la Vía Láctea, con fichas
de observación visual. Se incrusta en una página de WordPress.

Cada objeto observado aparece como un punto de color sobre la galaxia, en su
**posición física real**, calculada a partir de sus coordenadas galácticas.
Al pulsarlo se abre su ficha: las notas de la sesión, aumento por aumento,
con los bocetos de lo que se vio por el ocular.

Al **alejar el zoom** más allá de la galaxia, la vista se funde con un **atlas
del Grupo Local**: la Vía Láctea se encoge hasta ser un punto y aparecen las
galaxias observadas fuera de ella.

---

## Qué hace

- **Dos vistas de la galaxia**: cenital (desde el polo norte galáctico) y de
  canto (el disco de perfil). Se alterna entre ellas con una transición 3D en
  la que el disco se abate sobre sí mismo.
- **Zoom y desplazamiento**: rueda del ratón, pellizco táctil, arrastre.
- **Rotación**: se puede girar el mapa para poner el norte donde se quiera.
  Las etiquetas de los objetos permanecen siempre legibles.
- **Tránsito al Grupo Local**: al hacer *zoom out* por debajo de un umbral
  (una décima parte del tamaño original, configurable), la imagen de la galaxia
  funde hacia una capa de atlas dibujada detrás. El relevo es continuo: la
  galaxia, al encogerse, pasa a ser el punto «Vía Láctea» del centro del atlas,
  y siguiendo el zoom out aparecen las galaxias observadas.
- **Buscador** de objetos con autocompletado. Además de los objetos del
  registro, localiza **cualquier objeto** (también fuera de la Vía Láctea)
  resolviéndolo en SIMBAD; centra, amplía o aleja según convenga y lo resalta.
- **Leyenda dependiente de la vista**, interactiva (pulsar un tipo lo oculta o
  lo muestra):
  - En la galaxia, por **tipo de objeto** (cúmulos, nebulosas, resto de
    supernova…).
  - En el Grupo Local, por **clase de Hubble** de cada galaxia (elíptica,
    lenticular, espiral, espiral barrada, irregular).
- **Fichas de observación** en una ventana superpuesta, con pestañas por
  aumento, zoom sobre los bocetos y anexos de detalle.

El catálogo de la Vía Láctea contiene, de partida, **30 objetos**:

| Tipo | Color | Nº |
|---|---|---|
| Cúmulo globular | `#d7a4ff` violeta | 13 |
| Cúmulo abierto | `#8aff9e` verde | 8 |
| Nebulosa planetaria | `#5fe0c8` verde azulado | 5 |
| Nebulosa de emisión | `#ff8a80` rojizo | 3 |
| Resto de supernova | `#7ec8ff` azul | 1 |

Los objetos ya no están escritos a mano en un `.js`: los sirve el **plugin
Bitácora Registro** desde la base de datos (ver la carpeta `registro/`).

---

## Los archivos

| Archivo | Qué es | Dónde va |
|---|---|---|
| `index.html` | Fragmento HTML para pegar en la página | Editor de WordPress |
| `js/via-lactea-config.js` | **Ajustes**. El único que se edita a menudo | Servidor (`/bitacora-mapa/js/`) |
| `js/via-lactea-app.js` | La lógica del visor de la galaxia | Servidor (`/bitacora-mapa/js/`) |
| `js/grupo-local.js` | La capa del atlas del Grupo Local | Servidor (`/bitacora-mapa/js/`) |
| `images/` | Imágenes del mapa (cenital, de canto y bocetos) | Servidor (`/bitacora-mapa/images/`) |

Los **datos** (objetos y fichas) no son un archivo: los emite el plugin en
`/wp-json/bitacora/v1/datos.js`, en el mismo formato `OBSERVADORES` /
`OBJECTS` / `OBSERVACIONES` que usaba el antiguo `via-lactea-datos.js` (que
sigue funcionando como respaldo si se descomenta en `index.html`).

**Por qué los `.js` van por FTP y no pegados en el editor.** El editor de
bloques de WordPress escapa el carácter `&` al guardar: convierte cada `&&`
del código en `&#038;&#038;`, lo que rompe el JavaScript con un `SyntaxError`.
Sirviéndolos como archivos `.js`, el servidor los entrega intactos. El
fragmento `index.html` que sí se pega **no contiene lógica**.

---

## Instalación en WordPress

### 1. Subir los archivos JavaScript

Por FTP (o el gestor de archivos del hosting), sube a la carpeta que sirva la
ruta `/bitacora-mapa/js/`:

```
via-lactea-config.js
via-lactea-app.js
grupo-local.js
```

> WordPress **no permite** subir archivos `.js` desde la biblioteca de medios.
> Hay que hacerlo por FTP.

### 2. Subir las imágenes

En `/bitacora-mapa/images/`:

- `The_best_Milky_Way_map_by_Gaia.webp` — la **vista cenital** de la galaxia.
  Se sirve localmente (no desde un servidor externo) para que cargue rápido.
- `MilkyWay_25J14_40KPC_Edge_10K.webp` — la **vista de canto**.
- Una subcarpeta por cada objeto (`m1/`, `m30/`, `ngc40/`…) con sus bocetos
  en `.webp`. Los nombres siguen el patrón `{objeto}_{aumento}x.webp`
  (por ejemplo `m30_70x.webp`, `m30_216x.webp`) y los anexos añaden un sufijo
  descriptivo (`m30_216x_anillo.webp`).

### 3. Crear la página

En WordPress: **Páginas → Añadir nueva**. Añade un bloque **HTML personalizado**
y pega dentro todo el contenido de `index.html`. Publica.

Si tus rutas no coinciden, ajusta las del final del fragmento:

```html
<script src="/bitacora-mapa/js/via-lactea-config.js?v=1"></script>
<script src="/wp-json/bitacora/v1/datos.js?v=1"></script>
<script src="/bitacora-mapa/js/grupo-local.js?v=1"></script>
<script src="/bitacora-mapa/js/via-lactea-app.js?v=1"></script>
```

### 4. La caché: el paso que todos olvidan

El `?v=1` del final de cada ruta es un **número de versión**. Los navegadores
y WordPress guardan copia de los `.js`, y mientras ese número no cambie
seguirán usando la copia antigua.

**Cada vez que subas una versión nueva de un archivo, incrementa su `?v=`**
(de `?v=1` a `?v=2`, etc.). Si usas un plugin de caché, vacíala también. Un
truco cómodo: usar la fecha, `?v=20260715`.

---

## Rendimiento de carga

El mapa prioriza aparecer cuanto antes:

- La **imagen cenital** (la crítica) se sirve **localmente en WebP**, con
  `fetchpriority="high"` y `decoding="async"`.
- La **imagen de canto** pesa ~6 MB y solo hace falta en la vista de perfil.
  No se carga en el arranque: su URL está en `data-src` y `via-lactea-app.js`
  la carga **en segundo plano** cuando el navegador está ocioso (o al pulsar
  «Vista de canto»). Así deja de competir con el primer pintado.

Si quieres afinar más, una versión de la cenital a menor resolución reduciría
aún más el tiempo de carga sin pérdida visible al zoom inicial.

---

## Ajustes (`via-lactea-config.js`)

Es el único archivo pensado para editarse. Todo está comentado dentro.

```javascript
sol: {
  cenital: { x: 50.00, y: 69.93 },  // posición del Sol, en % de la imagen
  canto:   { x: 30.07, y: 49.98 }
},
nucleo: {
  cenital: { x: 50.00, y: 50.00 },  // centro de giro del mapa
  canto:   { x: 50.00, y: 50.00 }
},
fisica: {
  anchoImagenAl: 130462,            // ancho de la imagen en años luz (40 kpc)
  distanciaSolNucleoAl: 26000
},
giros: {
  giroAzimutalCanto: false,  // 🛰️ girar el punto de vista alrededor de la galaxia
  giroPlanoCanto: true,      // 🌀 girar la imagen de canto "como una foto"
  transicion3D: true         // voltereta al cambiar de vista
},
busqueda: {
  parpadeoSegundos: 3,       // cuánto parpadea el objeto encontrado
  avisoSegundos: 3,          // duración del aviso "no encontrado"
  zoom: 15,                  // aumento al centrar en un objeto de la galaxia
  resolver: '/wp-json/bitacora/v1/resolver',  // endpoint para buscar objetos NO registrados
  margenExtragalactico: 1.8  // "aire" alrededor del objeto al enfocarlo en el atlas
},
grupoLocal: {
  umbral: 0.1,        // fracción del tamaño original en la que EMPIEZA el fundido al atlas
  umbralFinal: 0.04,  // fracción en la que el fundido está COMPLETO (solo atlas)
  escalaMinima: 0.0015, // zoom out máximo (menor = se llega más lejos en el atlas)
  autoGiro: 0.0004    // giro ambiental lento del atlas
},
zoomFicha: { maximo: 5 },    // zoom sobre los bocetos de las fichas
fundido:   { duracionMs: 600 },
marcadores:{ puntoDiametro: 5, textoTamano: '11px' }
```

Los tres interruptores de `giros` activan o desactivan funcionalidades
completas cambiando una sola palabra.

> El **zoom out máximo** se amplía además de forma automática si hace falta:
> si el objeto más lejano del catálogo (o uno buscado) queda fuera del alcance
> de `escalaMinima`, el visor permite alejar más hasta que sea visible.

---

## Cómo se colocan los objetos

Los objetos **no se sitúan a ojo**, y ya **no hay que calcular su posición a
mano**. Al registrar un objeto, el plugin lo resuelve en **SIMBAD** (obtiene
sus coordenadas, su distancia y su tipo morfológico) y calcula automáticamente
dónde pintarlo. El procedimiento —el mismo, lo haga el plugin o se compruebe a
mano— es:

1. Se parte de las coordenadas ecuatoriales reales del objeto (RA, Dec) y su
   distancia al Sol.
2. Se convierten a **coordenadas galácticas** (longitud `l`, latitud `b`) con
   la fórmula estándar (polo norte galáctico en RA 192,85948°, Dec 27,12825°).
3. Se proyectan sobre cada imagen con la escala física real: la imagen abarca
   40 kpc (130 462 años luz), y el núcleo galáctico está anclado en el centro,
   `(50, 50)`. La vista de canto comprime el eje vertical con un factor
   calibrado (`S_edge ≈ S · 0,5882`).

> Detalle: las constantes de esta proyección están **duplicadas** en el visor
> (`via-lactea-config.js`) y en el plugin PHP. Si cambias la imagen del mapa o
> la posición del Sol, actualiza ambos.

El campo `coords` de cada objeto conserva ese dato de forma legible:

```javascript
coords: 'l ≈ 9,9°, b ≈ -7,6° · ~10.400 años luz del Sol'
```

Los objetos **extragalácticos** llevan además `l`, `b`, `dist` (años luz) y
`tipo` (clase de Hubble), que alimentan el atlas del Grupo Local y su leyenda.

---

## El buscador

1. Si el objeto está en el **atlas del Grupo Local** (registrado o de respaldo),
   se enfoca allí resaltando su marcador (sin duplicarlo).
2. Si es un objeto **registrado de la Vía Láctea**, se centra en el mapa con
   zoom-in y parpadea unos segundos.
3. Si **no está en el registro**, se resuelve en SIMBAD (endpoint `/resolver`)
   y se lleva la vista hasta él:
   - **galáctico** → zoom-in en el mapa, con un punto de mira temporal;
   - **extragaláctico** → zoom-out al atlas, enmarcándolo y resaltándolo.

---

## Estructura de los datos

Tres bloques que emite el plugin: `OBSERVADORES`, `OBJECTS` y `OBSERVACIONES`
(mismo formato que el antiguo `via-lactea-datos.js`).

### Un objeto

```javascript
{
  id: 'm30', name: 'M30 · Cúmulo globular de Capricornio', label: 'M30',
  color: '#d7a4ff', ficha: 'm30',
  coords: 'l ≈ 27,2°, b ≈ -46,8° · ~27.100 años luz del Sol',
  pdf: 'https://…/m30_inv.pdf',
  top:  { x: 43.5, y: 57.3 },   // posición en la vista cenital (%)
  edge: { x: 42.7, y: 58.9 }    // posición en la vista de canto (%)
  // y, en objetos extragalácticos: l, b, dist, tipo (clase de Hubble)
}
```

### Su ficha

`OBSERVACIONES` es un mapa `id → lista de observaciones`. Cada observación
tiene sus metadatos y una lista de **entradas**, una por aumento, más una
opcional de **Exploración** (síntesis o retos, sin datos de ocular):

```javascript
m30: [{
  observador: 'autor',
  fecha: null,
  lugar: 'SQM-L 21.40 · IR -1.3º · 18º amb.',
  instrumento: 'Stargate 18”',
  pdf: 'https://…/m30_inv.pdf',
  defaultIndex: 1,          // qué pestaña se abre primero
  entries: [
    { boton: 'Exploración', titulo: 'M30. Exploración',
      img: null, html: '<p>…</p>' },
    { boton: '70x - 1º 10’ - 6.6mm', titulo: 'Nagler 31mm',
      img: 'm30_70x.webp', html: '<p>…</p>',
      anexos: [ { img: 'm30_98x_patas.webp', titulo: '…', pos: 'right' } ] }
  ]
}]
```

La lista permite **varias observaciones del mismo objeto** (distintas noches
o distintos observadores), y se puede filtrar por observador.

Una entrada puede tener varias vistas de la misma imagen, en pestañas
(por ejemplo, con filtro y sin él):

```javascript
img: [
  { archivo: 'm27_98x.webp',          etiqueta: 'Sin filtro' },
  { archivo: 'm27_98x_optolong.webp', etiqueta: 'Con filtro Optolong L-Enhance' }
],
imgMode: 'tabs',
```

Las imágenes con nombre relativo (`m27_98x.webp`) se resuelven contra
`/bitacora-mapa/images/<objeto>/`; las que son una URL absoluta (subidas desde
el formulario) se usan tal cual.

---

## Controles

| Acción | Ratón | Táctil |
|---|---|---|
| Desplazar | Arrastrar | Arrastrar |
| Zoom | Rueda | Pellizco |
| Rotar | `Ctrl` o `Mayús` + arrastrar | Girar dos dedos |
| Abrir ficha | Clic en el punto | Toque |

Y en pantalla: registrar observación, buscador, cambio de vista, deslizador de
rotación, botones de zoom y leyenda.

---

## Créditos

Observaciones y bocetos: **Israel Pérez de Tudela Vázquez**, telescopio
Stargate 18”. Las fichas completas están en
[theferretofcomets.com](https://theferretofcomets.com).

Imagen cenital de la galaxia: ESA/Gaia. Vista de canto: renderizado de 40 kpc.
