# Bitácora Messier — registro de observaciones

Sistema para registrar, consultar, editar y borrar observaciones astronómicas
desde una web WordPress.

El observador solo introduce **qué vio, quién es, con qué telescopio, cuándo y
desde dónde**. El resto —la altitud y el azimut del objeto, la altura del Sol y
de la Luna en ese instante— **se calcula solo**, sin necesidad de consultarlo
en ningún planetario.

Los datos se guardan en una **tabla propia de SQL estándar**, no en la
estructura interna de WordPress. Son portables desde el primer día.

---

## Las piezas

| Archivo | Qué es | Dónde va |
|---|---|---|
| `bitacora-registro.php` | El plugin: tabla, API y panel | WordPress, como plugin |
| `registrar-observacion-wordpress.html` | Fragmento del formulario | Editor de WordPress |
| `bitacora-formulario.js` | Lógica del formulario | Servidor, por FTP |
| `bitacora-formulario.css` | Estilos del formulario | Servidor, por FTP |
| `datos-ficha-wordpress.html` | Fragmento del formulario de datos de ficha (astrometría) | Editor de WordPress |
| `bitacora-ficha.js` | Lógica del formulario de datos de ficha | Servidor, por FTP |
| `listado-observaciones-wordpress.html` | Fragmento del listado | Editor de WordPress |
| `bitacora-listado.js` | Lógica del listado | Servidor, por FTP |
| `bitacora-listado.css` | Estilos del listado | Servidor, por FTP |
| `mi-flota-wordpress.html` | Fragmento de "Mi flota" (equipo del observador) | Editor de WordPress |
| `bitacora-flota.js` | Lógica de "Mi flota" | Servidor, por FTP |
| `resources/datos/{telescopios,oculares,auxiliares}.csv` | Catálogo de equipo (semilla) | Bundled en el plugin (`…/bitacora-registro/datos/`) |
| `…/bitacora-registro/ficha/plantilla_ficha.docx` | Plantilla Word de la ficha | Junto al plugin, en el servidor |

**Por qué el `.js` y el `.css` van por FTP y no pegados en el editor.** El
editor de bloques de WordPress escapa el carácter `&` al guardar: convierte
cada `&&` del código en `&#038;&#038;`, lo que rompe el JavaScript con un
`SyntaxError`. Sirviéndolos como archivos, el servidor los entrega intactos.
Los fragmentos HTML que sí se pegan **no contienen ni una línea de código**.

---

## Qué hace el formulario

El formulario de registro (`registrar-observacion-wordpress.html`) tiene tres
secciones:

### 1 · Qué y quién

- **Fecha de la observación**: el primer campo, y **obligatorio**.
- **Objeto observado**, con autocompletado y validación en dos niveles:
  - Los **110 objetos Messier** están embebidos en el código con sus
    coordenadas. Al escribir `M30` o `Messier 30` se reconoce al instante y
    ya se conocen su RA y su Dec.
  - Si escribes `M202`, avisa: *el catálogo Messier llega hasta M110*.
  - Cualquier otro objeto (`NGC 6826`, `IC 1396`…) se acepta, pero pide su
    **RA y Dec a mano**, porque sin coordenadas no hay cálculo posible.
    Admite formato sexagesimal (`21h 40m 22s`) o decimal (`325.09`).
- Observador y **telescopio**. El telescopio puede elegirse de la flota del
  observador (ver *Mi flota* más abajo) o escribirse a mano.

### 2 · Lo que viste, por ocular

Una **entrada por cada aumento**, con: aumento y campo real (obligatorios),
pupila de salida y nombre del ocular (opcionales), descripción con formato,
imágenes principales (varias = pestañas en la ficha) e imágenes de apoyo
(anexos). Las imágenes se suben a la biblioteca de medios de WordPress.

### 3 · Exploración (opcional)

Una **síntesis de la observación o los retos** a los que se enfrenta el
observador, **sin datos de ocular**. En la ficha del mapa aparece como
«M30. Exploración».

### El cielo de esa noche (paso aparte)

La astrometría —fecha/hora exacta, lugar, altitud y azimut del objeto, altura
del Sol y de la Luna— se captura en un **formulario de datos de ficha**
independiente, accesible desde el listado. Se calcula sola en cuanto hay
objeto, fecha y lugar:

- Altitud y azimut del objeto (corregidos por refracción atmosférica).
- Altitud del Sol y de la Luna.
- Un aviso si el objeto estaba bajo el horizonte, o si era de día.

El motor astronómico implementa los algoritmos de **Meeus** (*Astronomical
Algorithms*) y no depende de ningún servicio externo: día juliano, posición
del Sol y de la Luna, tiempo sidéreo y conversión a coordenadas horizontales.

> **Validación.** Contrastado con una observación real de M30 anotada a mano:
> el cálculo da altitud 26,2° frente a los 25,5° de la ficha, y azimut 202,0°
> frente a 201,6°. La diferencia se debe a que la fecha exacta era estimada.

---

## Colocación automática en el mapa (SIMBAD)

Los objetos del mapa —los puntos de la Vía Láctea y las galaxias del Grupo
Local— viven en una tabla propia (`wp_bitacora_objetos`). Al registrar un
objeto **sin posición**, el plugin lo resuelve en **SIMBAD** (servicio TAP) y
calcula automáticamente todo lo necesario:

- coordenadas galácticas `l`, `b` (a partir de RA/Dec);
- la **distancia** al Sol (mediana de las medidas de SIMBAD; si SIMBAD no la
  tiene, se indica a mano);
- las posiciones `top` y `edge` sobre las imágenes del mapa (fórmula verificada
  contra el catálogo existente);
- la **clase de Hubble** (elíptica, lenticular, espiral, barrada, irregular),
  que fija el color del marcador en el atlas del Grupo Local.

Ya no hace falta calcular la posición a mano. Las consultas a SIMBAD se cachean
para no repetirlas. Si el objeto es extragaláctico, se dibuja en el atlas; si
está dentro de la galaxia, en el mapa cenital/de canto.

---

## El listado

Muestra las observaciones como tarjetas, con dos pestañas: **Registradas** y
**Papelera**.

- «Mis observaciones» lista **solo las del usuario en sesión** (`?mias=1`); la
  papelera muestra, igualmente, solo las suyas ya borradas. Las observaciones de
  otros observadores no aparecen aquí (sí en el mapa, que es público).
- **Editar** lleva al formulario, precargado con esa observación. Si se cambia
  la fecha o el lugar, el cielo se recalcula solo.
- **Borrar** es un **borrado suave**: la fila se marca con la fecha de borrado,
  pero los datos siguen íntegros en la base de datos. Se puede restaurar desde
  la papelera.

---

## Mi flota (equipo del observador)

`mi-flota-wordpress.html` es una página aparte donde cada observador arma su
**equipo personal**: telescopios, oculares y auxiliares (Barlow, Powermates,
reductores). Sirve para que, al registrar, no haya que teclear la óptica a mano.

- **Catálogo global**: un catálogo común (~870 telescopios, ~660 oculares y
  ~35 auxiliares) importado de 3 CSV incluidos en el plugin
  (`…/bitacora-registro/datos/`). El observador **busca** en él y añade modelos
  a su flota (se copian sus specs), o crea uno **a medida**. Cada pieza es suya
  (`usuario_id`); el catálogo global son filas con `usuario_id` a NULL.
- **Cálculo óptico automático**: en el formulario de registro, al elegir un
  telescopio y, por ocular, uno de sus oculares (y opcionalmente un auxiliar), se
  autocalculan **aumento**, **pupila de salida** y **campo real** —todos
  editables— con:
  - `aumentos = focal_tele × factor_auxiliar / focal_ocular`
  - `pupila = apertura / aumentos`
  - `campo_real = campo_aparente / aumentos`

  El factor del auxiliar multiplica (Barlow) o reduce (reductor) la focal
  efectiva. Los valores calculados son los que ya guardaba la observación, así
  que **el mapa y la ficha no cambian**: el equipo solo los rellena.
- La observación guarda además el `telescopio_id`, y cada entrada su `ocular_id`
  y `auxiliar_id`, para poder reeditar y recalcular.

El catálogo se importa solo al activar/actualizar el plugin (idempotente) y
puede reimportarse desde el panel de administración de Bitácora.

---

## La ficha en Word (.docx)

Cada tarjeta del listado tiene un botón **Ficha** que descarga la observación
como documento de Word. El archivo se llama como el objeto, en minúscula y sin
espacios, seguido de `_inv`: `m30_inv.docx`, `ngc6826_inv.docx`, `ic1396_inv.docx`.

**El documento se genera en el servidor, en PHP puro.** El botón pide la ficha a
la API (con el mismo *nonce* que el resto de acciones); el plugin **no
reconstruye** el documento: abre la plantilla original `ficha/plantilla_ficha.docx`
como ZIP con la clase `ZipArchive` de PHP, sustituye las marcas `[entre corchetes]`
(`[Nombre_objeto]`, `[altitud_objeto]`…) por los datos de la observación —incluso
si Word ha partido un texto en varios fragmentos— y vuelve a comprimirla,
conservando **exactamente** el diseño (tipografías, colores, brújula, márgenes).
La ficha se puede generar de cualquier observación; editar y borrar siguen siendo
solo para las propias.

La ficha rellena el objeto, el observador, el telescopio, el catálogo, la
altitud y el azimut, las condiciones del cielo (SQM-L, IR y temperatura, que
captura el formulario) y la línea de constelación con sus coordenadas. La
constelación no se guarda en la tabla: se deduce del número Messier. En objetos
NGC/IC (coordenadas manuales) esa línea muestra solo la coordenada.

### Dónde va la plantilla en el servidor

La recomendación es dejar el generador y la plantilla **dentro de la carpeta del
plugin**, en una subcarpeta `ficha/`:

```
wp-content/plugins/bitacora-registro/
├── bitacora-registro.php
└── ficha/
    └── plantilla_ficha.docx      ← aquí subes tu plantilla
```

Así el plugin la encuentra sola (por su propia ruta), viaja con él cuando lo
empaquetas en `.zip` y queda versionada junto al código. Para cambiar el diseño
más adelante, basta con reemplazar ese `plantilla_ficha.docx` por FTP; como las
marcas `[entre corchetes]` van dentro, puedes editarlo en Word con total libertad.

Si prefieres tenerla en otro sitio (por ejemplo, junto al `.css` y el `.js` en
`/wp-content/uploads/bitacora/`), indícale la ruta en `wp-config.php`:

```php
define( 'BITACORA_PLANTILLA', '/ruta/absoluta/a/plantilla_ficha.docx' );
```

### Requisitos del servidor

Solo la extensión **`ZipArchive`** de PHP, activa por defecto en la práctica
totalidad de los WordPress. **No** hace falta Node.js, ni `unzip`/`zip`, ni
`proc_open`, ni `npm install`.

Puedes comprobar que todo está listo en el escritorio: menú **Bitácora** →
panel *«Generador de fichas (.docx)»*, que verifica `ZipArchive` y que la
plantilla esté subida. Si algo falta, el botón muestra además un aviso claro en
lugar de fallar en silencio.

---

## Seguridad

Los botones de la pantalla son una comodidad, no una protección. La regla vive
en el servidor, en tres capas:

**Sesión.** Las seis rutas de la API exigen `is_user_logged_in()` antes de
ejecutar nada. Sin sesión, la petición muere con un `401`, aunque se llame al
endpoint directamente saltándose el formulario.

**Propiedad.** Antes de editar, borrar o restaurar, el plugin comprueba que el
`usuario_id` de esa observación coincide con quien pide el cambio. Si no,
responde `403` y no toca nada.

**Nonce (protección CSRF).** Si un usuario logueado visitara una página
maliciosa, esa página podría lanzar peticiones a la API y el navegador
adjuntaría su cookie de sesión sin preguntar. El *nonce* lo impide: es un
código que solo existe en la página legítima, y el servidor lo exige.

Además: todos los números se validan contra su rango físico (declinación entre
−90 y 90, azimut entre 0 y 360, número Messier entre 1 y 110), las consultas
son preparadas —sin inyección SQL posible— y todo el texto que sale de la base
de datos se escapa antes de pintarlo.

---

## La base de datos

Una sola tabla, `wp_bitacora_observaciones` (el prefijo puede variar).

**No** se usa un *Custom Post Type* ni `wp_postmeta`. Ese enfoque repartiría
cada observación en decenas de filas de pares clave-valor, mezcladas con los
metadatos del resto de la web, y migrarla exigiría un script de reconstrucción.
Aquí cada observación es **una fila con columnas explícitas**: exportarla a
Supabase, PostgreSQL o cualquier otro sistema es un `export` y un `import`.

WordPress se usa solo para lo que hace bien: autenticar al usuario.

| Columna | Tipo | Origen |
|---|---|---|
| `id` | `bigint` | autoincremental |
| `objeto` | `varchar(64)` | identificador limpio: `M30` |
| `objeto_etiqueta` | `varchar(255)` | texto completo: `M30 · Capricornus` |
| `tipo` | `varchar(16)` | `messier` u `otro` |
| `num` | `smallint` | número Messier, o `NULL` |
| `ra`, `decl` | `double` | coordenadas ecuatoriales, en grados |
| `observador` | `varchar(160)` | del formulario |
| `telescopio` | `varchar(160)` | del formulario |
| `fecha_hora_local` | `varchar(32)` | tal como la escribió el observador |
| `fecha_hora_utc` | `datetime` | normalizada |
| `lat`, `lon` | `double` | lugar de observación |
| `obj_alt`, `obj_az` | `double` | **calculados** |
| `sun_alt`, `moon_alt` | `double` | **calculados** |
| `usuario_id` | `bigint` | lo fija el servidor, según la sesión |
| `creado_en` | `datetime` | lo fija el servidor |
| `actualizado_en` | `datetime` | al editar |
| `borrada_en` | `datetime` | borrado suave; `NULL` si está activa |

Además, la observación completa —con sus entradas por ocular y sus imágenes—
se guarda en tablas hijas, y hay catálogos independientes:

| Tabla | Qué guarda |
|---|---|
| `wp_bitacora_entradas` | Las entradas por aumento de cada observación (incluida la de *Exploración*) |
| `wp_bitacora_imagenes` | Las imágenes de cada entrada (principales y anexos) |
| `wp_bitacora_fichas` | La astrometría de la ficha (RA/Dec, lugar, altitud/azimut, Sol/Luna, condiciones) |
| `wp_bitacora_objetos` | El catálogo de objetos del mapa: color, `top`/`edge`, `l`/`b`, distancia, clase de Hubble |
| `wp_bitacora_observadores` | Quién observa (para filtrar el mapa por autor) |
| `wp_bitacora_telescopios` | Telescopios: catálogo global (`usuario_id` NULL) + flotas personales |
| `wp_bitacora_oculares` | Oculares: catálogo global + flotas personales |
| `wp_bitacora_auxiliares` | Auxiliares (Barlow/reductores): catálogo global + flotas personales |

La observación referencia el `telescopio_id`, y cada entrada su `ocular_id` y
`auxiliar_id` (el equipo usado en ese aumento).

Todo sigue siendo SQL estándar con columnas explícitas: portable con un
`export`/`import`.

---

## La API

Todas las rutas cuelgan de `/wp-json/bitacora/v1/`.

| Método | Ruta | Sesión | Qué hace |
|---|---|---|---|
| `POST` | `/observaciones` | Sí | Crea una observación |
| `GET` | `/observaciones` | Sí | Lista las activas. `?borradas=1` para la papelera, `?mias=1` para filtrar por autor |
| `GET` | `/observaciones/{id}` | Sí | Devuelve una, para precargar el formulario |
| `PUT` | `/observaciones/{id}` | Sí | La modifica *(solo el autor)* |
| `DELETE` | `/observaciones/{id}` | Sí | Borrado suave *(solo el autor)* |
| `POST` | `/observaciones/{id}/restaurar` | Sí | Deshace el borrado *(solo el autor)* |
| `GET` | `/observaciones/{id}/ficha` | Sí | Genera y **descarga** la ficha `.docx` |
| `GET`/`PUT` | `/observaciones/{id}/ficha-datos` | Sí | Lee/guarda la astrometría de la ficha |
| `GET` | `/objetos` | No | Lista los objetos del mapa |
| `POST` | `/objetos` | Sí | Registra un objeto por identificador (lo resuelve en SIMBAD y calcula su posición) |
| `GET` | `/resolver?q=M104` | No | Localiza un objeto en SIMBAD **sin guardarlo** (para el buscador del mapa) |
| `GET` | `/observadores` | No | Lista los observadores |
| `GET` | `/datos.js` | No | Emite `OBSERVADORES`/`OBJECTS`/`OBSERVACIONES` como JavaScript para el visor |
| `GET` | `/equipo/catalogo` | Sí | Catálogo global de telescopios/oculares/auxiliares |
| `GET` | `/equipo` | Sí | Equipo personal del usuario |
| `POST` | `/equipo/{telescopio\|ocular\|auxiliar}` | Sí | Añade una pieza a su flota (del catálogo o a medida) |
| `PUT`/`DELETE` | `/equipo/{tipo}/{id}` | Sí | Edita/borra una pieza *(solo el dueño)* |

Las rutas de lectura pública (`/objetos` GET, `/resolver`, `/observadores`,
`/datos.js`) sirven datos que ya son públicos en el mapa. Las de escritura y las
de observaciones exigen sesión.

---

## Instalación en un WordPress vacío

### 1. Instalar el plugin

Crea una carpeta llamada `bitacora-registro` y mete dentro `bitacora-registro.php`
y la carpeta `datos/` con los CSV del catálogo de equipo:

```
bitacora-registro/
├── bitacora-registro.php
└── datos/
    ├── telescopios.csv
    ├── oculares.csv
    └── auxiliares.csv
```

Comprime **la carpeta** (no el archivo suelto, o WordPress dirá que no
encuentra ningún plugin válido). En WordPress: **Plugins → Añadir nuevo →
Subir plugin**, elige el `.zip`, instala y **activa**.

Al activarlo se crea la tabla. Aparecerá un menú nuevo, **Bitácora**, con las
observaciones registradas.

### 2. Subir los archivos por FTP

Crea la carpeta:

```
/wp-content/uploads/bitacora/
```

y sube dentro:

```
bitacora-formulario.js
bitacora-formulario.css
bitacora-listado.js
bitacora-listado.css
bitacora-flota.js
```

> WordPress **no permite** subir `.js` desde la biblioteca de medios.

### 3. Crear las páginas

**Página del formulario.** *Páginas → Añadir nueva*, título "Registrar
observación". Añade un bloque **HTML personalizado** y pega dentro todo el
contenido de `registrar-observacion-wordpress.html`. Publica.

**Página del listado.** Otra página, título "Mis observaciones", con un bloque
**HTML personalizado** y el contenido de `listado-observaciones-wordpress.html`.

**Página de "Mi flota".** Otra página, título "Mi flota", con un bloque **HTML
personalizado** y el contenido de `mi-flota-wordpress.html`. Si su ruta no es
`/mi-flota/`, ajusta el enlace del formulario de registro.

En el fragmento del listado, ajusta la ruta de la página del formulario si no
coincide con la tuya. Aparece en dos sitios:

```html
<div id="mw-obs-list" data-form="/observaciones-visuales/">
<a class="new-btn" href="/observaciones-visuales/">+ Nueva observación</a>
```

### 4. Proteger las páginas con login

Las páginas deben verse solo con sesión iniciada. Con el plugin **Content
Control** (gratuito):

1. *Content Control → Restrictions → Add Restriction*.
2. En **General**: *¿Quién puede ver este contenido?* → **Usuarios conectados**,
   rol **Any**.
3. En **Contenido**: selecciona las dos páginas.
4. En **Protección**: redirigir al login, o mostrar un mensaje.
5. Guardar.

> El campo de arriba del editor de restricciones es solo el **nombre de la
> regla**, no selecciona la página. La selección está en la pestaña
> **Contenido**.

Ocultar la página es cosmético: la protección real es la del servidor, que ya
lleva el plugin.

### 5. La caché

El `?v=1` del final de cada ruta es un **número de versión**. Mientras no
cambie, los navegadores seguirán usando la copia guardada del archivo.

**Cada vez que subas una versión nueva de un `.js` o un `.css`, incrementa su
`?v=`** en el fragmento correspondiente. Si usas un plugin de caché, vacíala.

---

## Comprobar que funciona

En este orden:

1. **Logueado**, entra en el formulario, registra una observación. Debe decir
   *"✓ Observación guardada (registro nº 1)"*.
2. Ve al menú **Bitácora** del panel: ahí está.
3. Entra en el listado, pulsa **Editar**: el formulario se precarga.
4. Cambia algo, guarda, vuelve al listado y comprueba el cambio.
5. **Borra** esa observación. Míralas en la **Papelera** y **restáurala**.
6. **Sin sesión**, en una ventana de incógnito, visita
   `tu-web.com/wp-json/bitacora/v1/observaciones`. Debe responder `401`.
   Eso demuestra que los datos están protegidos en el servidor, no solo
   escondidos en la interfaz.

---

## Dependencias

Ninguna, salvo **Leaflet 1.9.4** (cargado desde su CDN) para el mapa de
selección del lugar. Si no cargara, el formulario sigue funcionando: basta
escribir la latitud y la longitud a mano. El mapa es una comodidad, no un
requisito.

El motor astronómico y el catálogo Messier están escritos desde cero en el
propio archivo, sin librerías.

---

## Probar en local

El formulario funciona en **modo local** si no encuentra la sesión de WordPress
(`window.BITACORA_WP`): en vez de guardar, muestra el bloque de datos que
*habría* enviado al servidor. Basta servir los fragmentos con su `.css` y su
`.js` al lado (rutas relativas) para probar la interfaz sin WordPress.

---

## Estado y siguientes pasos

El esquema ya guarda la observación **completa**: la cabecera (qué, quién,
cuándo, dónde y la posición del cielo), las **entradas por aumento** con sus
textos y sus **imágenes**, la sección de **Exploración**, y el catálogo de
**objetos del mapa** con su posición calculada automáticamente. El plugin
alimenta el visor directamente por `/wp-json/bitacora/v1/datos.js`.

Pendiente menor: el atlas del Grupo Local usa los objetos extragalácticos de la
base de datos, pero conserva un pequeño catálogo de respaldo en `grupo-local.js`
por si aún no hay ninguno registrado; se puede retirar cuando se carguen los
reales.
