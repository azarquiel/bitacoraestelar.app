# Contexto de dominio — Bitácora Estelar

Glosario de términos del proyecto (ubicuo). Los módulos y su vocabulario de
arquitectura se nombran con estos términos.

## Modelo de color Gaia

El mapeo canónico **índice BP–RP → color RGB** de una estrella, anclado a los
códigos físicos de Harre & Heller (2021) / spec2col (espectro → CIE → XYZ →
sRGB), con corrección gamma sRGB parcial y el extremo rojo anclado a un espectro
de estrella de carbono (bandas C2 "Swan").

- **Fuente única:** `resources/js/bitacora-gaia-color.js`, global `window.BitacoraGaiaColor`.
- **Interfaz:** `colorPorBpRp(bprp)` → `[r,g,b]`; `claseEspectral(bprp)` → letra
  espectral (O·B·A·F·G·K·M); `config` → palanca mutable de gamma y saturación
  compartida por todos los consumidores.
- **Consumidores:** el **simulador de oculares** (`bitacora-ocular.js`) y el
  **vecindario solar** del mapa (`vecindario-solar.js`), ambos desde la misma URL
  canónica `/wp-content/uploads/bitacora/bitacora-gaia-color.js`.
- **Invariante:** el color de una estrella debe ser EXACTAMENTE el mismo en el
  simulador y en el mapa. Garantizado estructuralmente (una sola fuente), no por
  copiar y pegar. El test dorado `scripts/test_gaia_color.js` fija el contrato.
- El realce de **estrella de carbono** NO pertenece al modelo: es una capa del
  simulador que ajusta el BP–RP efectivo antes de pedir el color canónico.

## Objeto del mapa

Una entrada en la tabla `{prefix}bitacora_objetos` que se pinta en el mapa de la
Vía Láctea (slug, etiqueta, color, tipo, morfología, coordenadas galácticas,
distancia). Los objetos cercanos aparecen en el mapa MW; los lejanos, en la vista
extragaláctica (grupo local).

## Clasificación de objeto del mapa

El seam que decide **`tipo` + `color`** de un objeto a partir de su `otype` de
SIMBAD, su morfología y el tipo declarado en la observación. Función única
`bitacora_clasificar_objeto($otype, $morph, $tipo_obs)` en `bitacora-registro.php`
(antes estaba repartida entre `clase_hubble` + `color_por_clase` + un `if` de
carbono incrustado, y el hueco entre «decidir tipo» y «decidir color» era el bug:
cúmulos y estrellas de carbono caían en el default `#7ec8ff`, que en la leyenda es
«Resto de supernova»).

Prioridad: tipo del registro → tabla de categorías MW por código otype (`C*`
carbono, `GlC` globular, `OpC`/`Cl*` abierto, `PN` planetaria, `HII`/`EmO` emisión,
`SNR` resto de supernova) → galaxia por clase de Hubble (para grupo local) →
`otro` neutro `#dfe7f5`.

- **Invariante:** los colores del clasificador coinciden con la leyenda `#mw-legend`
  (`data-color`) de `mapa/index.html`; los de galaxia, con `HUBBLE_COLORS` de
  `grupo-local.js` y la leyenda `#mw-legend-hubble`. El test
  `scripts/test_clasificacion_objeto.py` verifica mapeos y sincronía.
- **Default neutro:** un otype desconocido NO reutiliza un color de la leyenda, para
  no disfrazarse de otra categoría (era la raíz del bug).

## Equipo del observador (helpers puros)

Cálculos y rótulos puros del equipo, compartidos por el **simulador de oculares**
y por **Mi flota**, sin DOM ni WordPress.

- **Fuente única:** `resources/js/bitacora-equipo.js`, global `window.BitacoraEquipo`
  (+ `module.exports` para node), URL canónica en `/wp-content/uploads/bitacora/`.
- **`focalEfectiva(focal, factor, extension)`** → focal del telescopio tras la
  **óptica auxiliar**: el `factor` multiplica (Barlow > 1 alarga, reductor < 1
  acorta, vacío = 1 neutro) y la `extension_mm` suma milímetros fijos. Es el único
  punto por el que el auxiliar entra en el simulador; aumentos, pupila de salida,
  campo y magnitud límite heredan el cambio.
- **`nombreTelescopio(item)`** → rótulo del telescopio: el **nombre** propio que el
  observador le puso en Mi flota, o `vendor + modelo` en su defecto. Mismo rótulo
  en la lista de Mi flota y en el selector del simulador.
- **Test:** `scripts/test_equipo.js` fija el contrato de ambos.

## Nombre del observador (mapa)

Resolución **clave → nombre legible** de un observador, sobre el catálogo
`OBSERVADORES`. Vive en `VLObservadores` (`mapa/js/via-lactea-observadores.js`)
como `nombreObservador(clave)` (clave desconocida → la propia clave; vacía → `''`
para no pintar etiqueta). La ficha del mapa la usa para mostrar «Observación de
{nombre}» de forma discreta, igual en el flujo normal y en el de descubrimiento.
Test: `scripts/test_observadores.js`.

## Vecindario solar (estrellas cercanas)

Escena 3D de las estrellas a ≤ `CONFIG.vecindario.distMaxAl` (500 al) del Sol,
que aparece al hacer zoom máximo sobre el Sol en la vista cenital. Se puebla
desde los **objetos del mapa** que tengan coordenadas galácticas y esa distancia.

- **Selección pura:** `mapa/js/via-lactea-vecindario-catalogo.js`
  (`VLVecindarioCatalogo.estrellasVecindario(objects, distMaxAl)`): filtra por
  distancia y coordenadas, resuelve el `bp_rp` (color) y proyecta a XYZ con el
  Sol en el origen (`galToXYZ`). La capa `vecindario-solar.js` solo dibuja.
  Test: `scripts/test_vecindario_catalogo.js`.
- **Color:** cada estrella usa su índice **BP–RP** con el [[modelo de color Gaia]]
  compartido; por eso su color coincide con el del simulador de oculares. El
  objeto del mapa guarda `bp_rp` (columna nueva); lo resuelve el plugin al
  registrar (Gaia por ra/dec, mismo failover CDS→GAVO que el proxy) y lo emite
  `datos.js`. Sin `bp_rp`, la estrella sale con color neutro.
- **Requisito de datos:** sin objetos a ≤ 500 al, la escena avisa "aún no hay
  estrellas cercanas registradas" en vez de quedar muda con solo el Sol. Un
  botón del admin completa el `bp_rp` de los objetos cercanos ya registrados.
