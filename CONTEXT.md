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

## Astrometría de la sesión

La altura y el azimut que se registran de una observación: los del **objeto**, los
del **Sol** y los de la **Luna**, calculados para una [[base]] (lat/lon/huso) y un
instante de hora local con los algoritmos de Meeus.

- **Fuente única:** `resources/js/bitacora-astro.js`, global `window.BitacoraAstro`
  (+ `module.exports` para node), URL canónica en `/wp-content/uploads/bitacora/`.
- **Interfaz:** `posiciones({fechaHoraLocal, tz, lat, lon, ra, dec})` →
  `{utc, objeto:{alt,az}, sol:{alt,az}, luna:{alt,az}}`, o `null` si falta cualquier
  dato imprescindible (sin base, sin fecha, sin coordenadas): el llamador no valida
  nada más. `fechaHoraLocal` es hora de PARED en la base; el huso IANA la convierte
  a UTC sin librerías.
- **Consumidores:** el formulario de registro (`bitacora-formulario.js`, que siembra
  la ficha al registrar) y el formulario de datos de ficha (`bitacora-ficha.js`, que
  la recalcula al editarla).
- **Convención de refracción:** solo el **objeto** lleva refracción (Bennett), porque
  su altura describe lo que el observador vio. El Sol y la Luna salen **geométricos**,
  porque los umbrales de crepúsculo (−6°, −12°, −18°) se definen sobre la altura
  geométrica del centro del Sol.
- **Invariante:** la altura que guarda el registro y la que recalcula la ficha son el
  mismo número. Garantizado estructuralmente (una sola fuente), no por copiar y pegar:
  antes había dos copias byte a byte que YA habían divergido —el formulario refractaba
  el Sol y la Luna y la ficha no—, así que abrir la ficha cambiaba el dato guardado.
  El test `scripts/test_astro.js` fija el contrato contra invariantes físicos (el polo
  celeste a la altura de la latitud, la declinación solar en solsticio y equinoccio,
  el convenio de azimut y los husos con y sin horario de verano).

## Cadena de la placa (luma → flujo)

Cómo una placa fotográfica (DSS o PanSTARRS) se convierte en el **flujo de objeto
por píxel** que come `pintarFot`. Es el otro motor que produce un `Fobj`, en
paralelo a las capas difusas sintéticas del Canvas-2D.

- **Fuente única:** `resources/js/bitacora-gaia-render.js`, en tres pasos:
  `fusionarPlacas(profunda, corta)` (fusión HDR por mínimos cuadrados de la
  DSS2-red profunda con la DSS1 corta, que conserva los núcleos sin quemar),
  `repararNucleos(v, size)` = `rellenarNucleo(v, desenfocar(v,4,size))` (el agujero
  negro que PanSTARRS deja en el centro de una estrella brillante) y
  `flujoDePlaca(v, esHips)` (luma 0-255 → brillo superficial entre `SB_OBJ_MIN` y
  `SB_OBJ_MAX` → flujo).
- **Consumidor:** el **simulador de oculares**, que conserva solo lo que es suyo:
  `lumas()`, que lee los píxeles de la placa del DOM, y la orquestación.
- **No es fotometría calibrada:** es un mapeo heurístico con parámetros puestos a
  ojo, y están para tocarlos. Lo que el test fija son los **invariantes**: más luma
  nunca es menos flujo, un píxel apagado no inventa luz (flujo 0), la escala es
  logarítmica en magnitudes, la fusión nunca oscurece lo que la placa profunda ya
  registró, y una fusión que no cuadra (pocos píxeles en común o pendiente no
  positiva) devuelve **la placa profunda tal cual** en vez de una recta inventada.
- **La regla se prueba aparte del desenfoque:** `rellenarNucleo` recibe el entorno
  ya calculado, porque lo que se comprueba es el umbral, no el kernel (que es el
  filtro nativo del canvas y necesita DOM). Test: `scripts/test_placa.js`.

## Caché LRU de los proxies

La política con la que los dos proxies del simulador (`gaia_proxy.php` y
`dss-proxy.php`) acotan su caché en disco. Las respuestas que guardan son
**inmutables** —Gaia DR3 es un catálogo fijo y el DSS un archivo fijo—, así que no
caducan: lo único que acota el disco es la **expulsión por tamaño**, y la limpieza
es **incremental** (como mucho una pasada cada 5 min y un número máximo de
borrados por pasada, para no escanear el directorio en cada petición).

- **Fuente única:** `simulador_ocular/bitacora-cache-lru.php`.
  `cache_lru_seleccionar_evict(lista, total, max_bytes, lowwater, max_del)` decide
  qué cae (pura, no toca disco) y `cache_lru_limpieza({dir, patron, max_bytes,
  lowwater, max_del, cada, huerfano_ttl})` la ejecuta, más el barrido de `.lock` y
  `.tmp` huérfanos ya envejecidos.
- **Consumidores:** los dos proxies, cada uno con sus cifras (Gaia 500 MB y
  lowwater 0,90 sobre `*.json.gz`; DSS 150 MB y 0,80 sobre `*.gif`).
- **Lo que NO es compartido:** la clave de caché, la ruta y el servido. Cada proxy
  sirve otra cosa (JSON con negociación gzip / GIF) y con sus propios cuerpos de
  error; unificarlo pediría más perillas de las que ahorra.
- **Test:** `scripts/test_cache_lru.php`, sobre un directorio temporal de verdad.
  La limpieza —el patrón que acota qué se borra, el stamp que evita escanear en
  cada petición, el barrido de huérfanos— no la cubría ningún test antes; los de
  cada proxy solo comprobaban su copia de la selección.

## Resolvedor de objeto por nombre

El ciclo «el observador escribe un nombre → salen su RA y su Dec»: espera a que
deje de teclear, no repite la misma consulta, no pisa las coordenadas escritas a
mano y avisa del estado.

- **Fuente única:** `resources/js/bitacora-base.js`,
  `BitacoraBase.resolutorNombre({onResuelto, onEstado, puedeEscribir, espera})`
  → `{programar(nombre)}`. Sin DOM: cada pantalla cablea su input y escribe sus
  textos; el módulo solo emite `'buscando' | 'nada' | 'error'`.
- **Consumidores:** el **simulador de oculares** (modo «Cualquier objeto») y el
  **formulario de registro** (autocompletado de RA/Dec de objetos no-Messier).
- **Transporte único:** el resolvedor Sesame del CDS, directo desde el navegador
  (sirve `Access-Control-Allow-Origin: *`). No hay proxy ni sesión de por medio, y
  Sesame resuelve los alias por su cuenta («M3», «Messier 3», «NGC 6826»,
  «Barnard 33»). El endpoint `/coordenadas` del plugin, que era el camino del
  formulario y exigía login, se ha eliminado por no tener consumidores.
- **No confundir con `/resolver`** (`bitacora_resolver_objeto`, público): eso es
  «nombre → [[objeto del mapa]]» con distancia, tipo y color, y lo usa el buscador
  del mapa. Otro concepto, otro módulo.
- **Tests:** `scripts/test_sesame.js` fija el parseo de la respuesta;
  `scripts/test_resolutor.js`, el ciclo (espera, deduplicado y guarda), con un
  `fetch` de mentira y sin red.

## Transmisión y araña por tipo óptico

Dos tablas indexadas por la columna `Optics` del catálogo de equipo: la **transmisión**
luminosa del tubo (refractor 0,9 · reflector 0,7 · catadióptrico 0,65–0,68, según
Torres Lapasió) y si su secundario va sujeto por una **araña** de brazos, que es lo
que produce los *diffraction spikes*.

- **Fuente única:** `resources/js/bitacora-gaia-render.js`, expuestas como
  `transmisionOptica(optica)` → transmisión o `null`, y `opticaTieneArana(optica)` → bool.
- **Consumidores:** el propio render (spikes y magnitud límite) y el **simulador de
  oculares**, que antes tenía su propia copia de ambas tablas.
- Un tipo no listado devuelve `null`: el valor por defecto (0,8) lo pone el llamador,
  que es quien sabe si además hay una transmisión fijada a mano en el telescopio.

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
