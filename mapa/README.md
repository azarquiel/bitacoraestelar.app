# Mapa interactivo de la Vía Láctea

Visor de objetos del catálogo Messier situados sobre la Vía Láctea, con fichas
de observación visual. Se incrusta en una página de WordPress.

Cada objeto observado aparece como un punto de color sobre la galaxia, en su
**posición física real**, calculada a partir de sus coordenadas galácticas.
Al pulsarlo se abre su ficha: las notas de la sesión, aumento por aumento,
con los bocetos de lo que se vio por el ocular.

---

## Qué hace

- **Dos vistas de la galaxia**: cenital (desde el polo norte galáctico) y de
  canto (el disco de perfil). Se alterna entre ellas con una transición 3D en
  la que el disco se abate sobre sí mismo.
- **Zoom y desplazamiento**: rueda del ratón, pellizco táctil, arrastre.
- **Rotación**: se puede girar el mapa para poner el norte donde se quiera.
  Las etiquetas de los objetos permanecen siempre legibles.
- **Buscador** de objetos con autocompletado. Centra, amplía y hace parpadear
  el objeto encontrado durante unos segundos.
- **Leyenda interactiva**: pulsar un tipo de objeto lo oculta o lo muestra.
- **Fichas de observación** en una ventana superpuesta, con pestañas por
  aumento, zoom sobre los bocetos y anexos de detalle.

Actualmente el catálogo contiene **30 objetos**:

| Tipo | Color | Nº |
|---|---|---|
| Cúmulo globular | `#d7a4ff` violeta | 13 |
| Cúmulo abierto | `#8aff9e` verde | 8 |
| Nebulosa planetaria | `#5fe0c8` verde azulado | 5 |
| Nebulosa de emisión | `#ff8a80` rojizo | 3 |
| Resto de supernova | `#7ec8ff` azul | 1 |

---

## Los archivos

| Archivo | Qué es | Dónde va |
|---|---|---|
| `via-lactea.html` | Fragmento HTML para pegar en la página | Editor de WordPress |
| `via-lactea-config.js` | **Ajustes**. El único que se edita a menudo | Servidor, por FTP |
| `via-lactea-datos.js` | Los objetos y sus fichas | Servidor, por FTP |
| `via-lactea-app.js` | Toda la lógica. No hace falta tocarlo | Servidor, por FTP |
| `via-lactea-local.html` | Copia para probar en el ordenador, con rutas relativas | — |

**Por qué los `.js` van por FTP y no pegados en el editor.** El editor de
bloques de WordPress escapa el carácter `&` al guardar: convierte cada `&&`
del código en `&#038;&#038;`, lo que rompe el JavaScript con un `SyntaxError`.
Sirviéndolos como archivos `.js`, el servidor los entrega intactos.

---

## Instalación en un WordPress vacío

### 1. Subir los archivos JavaScript

Por FTP (o el gestor de archivos del hosting), crea la carpeta:

```
/wp-content/uploads/via-lactea/
```

y sube dentro los tres archivos:

```
via-lactea-config.js
via-lactea-datos.js
via-lactea-app.js
```

> WordPress **no permite** subir archivos `.js` desde la biblioteca de medios.
> Hay que hacerlo por FTP.

### 2. Subir las imágenes

Crea también la carpeta de imágenes:

```
/wp-content/uploads/via-lactea/resources/images/
```

Necesitas:

- `MilkyWay_25J14_40KPC_Edge_10K.webp` — la vista de canto de la galaxia.
- Una subcarpeta por cada objeto (`m1/`, `m30/`, `ngc40/`…) con sus bocetos
  en `.webp`. Los nombres siguen el patrón `{objeto}_{aumento}x.webp`
  (por ejemplo `m30_70x.webp`, `m30_216x.webp`) y los anexos añaden un sufijo
  descriptivo (`m30_216x_anillo.webp`).

La **vista cenital** se carga desde una URL externa de la ESA, así que no hay
que subirla. Si prefieres alojarla tú, cambia la ruta en `via-lactea.html`.

### 3. Crear la página

En WordPress: **Páginas → Añadir nueva**. Añade un bloque **HTML personalizado**
y pega dentro todo el contenido de `via-lactea.html`. Publica.

Si tu carpeta de uploads no está en la ruta habitual, ajusta las tres rutas
del final del fragmento:

```html
<script src="/wp-content/uploads/via-lactea/via-lactea-config.js?v=1"></script>
<script src="/wp-content/uploads/via-lactea/via-lactea-datos.js?v=1"></script>
<script src="/wp-content/uploads/via-lactea/via-lactea-app.js?v=1"></script>
```

### 4. La caché: el paso que todos olvidan

El `?v=1` del final de cada ruta es un **número de versión**. Los navegadores
y WordPress guardan copia de los `.js` para que la web cargue rápido, y
mientras ese número no cambie seguirán usando la copia antigua.

**Cada vez que subas una versión nueva de un archivo, incrementa su `?v=`**
(de `?v=1` a `?v=2`, etc.). Si usas un plugin de caché, vacíala también.

Un truco cómodo: usar la fecha, `?v=20260704`.

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
  parpadeoSegundos: 10,      // cuánto parpadea el objeto encontrado
  avisoSegundos: 4,          // duración del aviso "no encontrado"
  zoom: 25                   // aumento al centrar en un objeto
},
zoomFicha: { maximo: 5 },    // zoom sobre los bocetos de las fichas
fundido:   { duracionMs: 600 },
marcadores:{ puntoDiametro: 5, textoTamano: '11px' }
```

Los tres interruptores de `giros` activan o desactivan funcionalidades
completas cambiando una sola palabra.

---

## Cómo se colocan los objetos

Los objetos **no se sitúan a ojo**. El procedimiento es:

1. Se parte de las coordenadas ecuatoriales reales del objeto (RA, Dec) y su
   distancia al Sol.
2. Se convierten a **coordenadas galácticas** (longitud `l`, latitud `b`) con
   la fórmula estándar (polo norte galáctico en RA 192,85948°, Dec 27,12825°).
3. Se proyectan sobre cada imagen con la escala física real: la imagen abarca
   40 kpc (130 462 años luz), y el núcleo galáctico está anclado en el centro,
   `(50, 50)`.

El campo `coords` de cada objeto es la **fuente de verdad** de la que el
código extrae `l`, `b` y la distancia:

```javascript
coords: 'l ≈ 9,9°, b ≈ -7,6° · ~10.400 años luz del Sol'
```

Si añades objetos, **respeta ese formato exacto**, o la rotación azimutal no
sabrá reproyectarlos.

---

## Estructura de los datos (`via-lactea-datos.js`)

Tres bloques: `OBSERVADORES`, `OBJECTS` y `OBSERVACIONES`.

### Un objeto

```javascript
{
  id: 'm30', name: 'M30 · Cúmulo globular de Capricornio', label: 'M30',
  color: '#d7a4ff', ficha: 'm30',
  coords: 'l ≈ 27,2°, b ≈ -46,8° · ~27.100 años luz del Sol',
  pdf: 'https://…/m30_inv.pdf',
  top:  { x: 43.5, y: 57.3 },   // posición en la vista cenital (%)
  edge: { x: 42.7, y: 58.9 }    // posición en la vista de canto (%)
}
```

### Su ficha

`OBSERVACIONES` es un mapa `id → lista de observaciones`. Cada observación
tiene sus metadatos y una lista de **entradas**, una por aumento:

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
o distintos observadores), aunque hoy solo se muestra la primera.

Una entrada puede tener varias vistas de la misma imagen, en pestañas
(por ejemplo, con filtro y sin él):

```javascript
img: [
  { archivo: 'm27_98x.webp',          etiqueta: 'Sin filtro' },
  { archivo: 'm27_98x_optolong.webp', etiqueta: 'Con filtro Optolong L-Enhance' }
],
imgMode: 'tabs',
```

---

## Controles

| Acción | Ratón | Táctil |
|---|---|---|
| Desplazar | Arrastrar | Arrastrar |
| Zoom | Rueda | Pellizco |
| Rotar | `Ctrl` o `Mayús` + arrastrar | Girar dos dedos |
| Abrir ficha | Clic en el punto | Toque |

Y en pantalla: buscador, leyenda, botones de zoom, cambio de vista, y los
deslizadores de rotación.

---

## Probar en local

Abre `via-lactea-local.html` en el navegador. Usa rutas relativas, así que
necesita tener al lado los tres `.js` y la carpeta `resources/`.

---

## Créditos

Observaciones y bocetos: **Israel Pérez de Tudela Vázquez**, telescopio
Stargate 18”. Las fichas completas están en
[theferretofcomets.com](https://theferretofcomets.com).

Imagen cenital de la galaxia: ESA/Gaia. Vista de canto: renderizado de 40 kpc.
