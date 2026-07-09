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
| `bitacora-messier.php` | El plugin: tabla, API y panel | WordPress, como plugin |
| `registrar-observacion-wordpress.html` | Fragmento del formulario | Editor de WordPress |
| `bitacora-formulario.js` | Lógica del formulario | Servidor, por FTP |
| `bitacora-formulario.css` | Estilos del formulario | Servidor, por FTP |
| `listado-observaciones-wordpress.html` | Fragmento del listado | Editor de WordPress |
| `bitacora-listado.js` | Lógica del listado | Servidor, por FTP |
| `bitacora-listado.css` | Estilos del listado | Servidor, por FTP |
| `registrar-observacion.html` | Versión autónoma, para probar en local | — |

**Por qué el `.js` y el `.css` van por FTP y no pegados en el editor.** El
editor de bloques de WordPress escapa el carácter `&` al guardar: convierte
cada `&&` del código en `&#038;&#038;`, lo que rompe el JavaScript con un
`SyntaxError`. Sirviéndolos como archivos, el servidor los entrega intactos.
Los fragmentos HTML que sí se pegan **no contienen ni una línea de código**.

---

## Qué hace el formulario

### 1 · Qué y quién

- **Objeto observado**, con autocompletado y validación en dos niveles:
  - Los **110 objetos Messier** están embebidos en el código con sus
    coordenadas. Al escribir `M30` o `Messier 30` se reconoce al instante y
    ya se conocen su RA y su Dec.
  - Si escribes `M202`, avisa: *el catálogo Messier llega hasta M110*.
  - Cualquier otro objeto (`NGC 6826`, `IC 1396`…) se acepta, pero pide su
    **RA y Dec a mano**, porque sin coordenadas no hay cálculo posible.
    Admite formato sexagesimal (`21h 40m 22s`) o decimal (`325.09`).
- Observador y telescopio.

### 2 · Cuándo y dónde

Fecha y hora locales, y la posición: pinchando en un mapa, con el botón de
geolocalización, o escribiendo latitud y longitud.

### 3 · El cielo de esa noche

Se calcula en tiempo real, en cuanto hay objeto, fecha y lugar:

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

## El listado

Muestra las observaciones como tarjetas, con dos pestañas: **Registradas** y
**Papelera**.

- **Editar** lleva al formulario, precargado con esa observación. Si se cambia
  la fecha o el lugar, el cielo se recalcula solo.
- **Borrar** es un **borrado suave**: la fila se marca con la fecha de borrado,
  pero los datos siguen íntegros en la base de datos. Se puede restaurar desde
  la papelera.
- Cada usuario ve todas las observaciones, pero **solo puede editar o borrar
  las suyas**. Las ajenas aparecen sin botones.

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

---

## La API

Todas las rutas cuelgan de `/wp-json/bitacora/v1/` y requieren sesión.

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/observaciones` | Crea una observación |
| `GET` | `/observaciones` | Lista las activas. `?borradas=1` para la papelera, `?mias=1` para filtrar por autor |
| `GET` | `/observaciones/{id}` | Devuelve una, para precargar el formulario |
| `PUT` | `/observaciones/{id}` | La modifica *(solo el autor)* |
| `DELETE` | `/observaciones/{id}` | Borrado suave *(solo el autor)* |
| `POST` | `/observaciones/{id}/restaurar` | Deshace el borrado *(solo el autor)* |

---

## Instalación en un WordPress vacío

### 1. Instalar el plugin

Crea una carpeta llamada `bitacora-messier` y mete dentro `bitacora-messier.php`:

```
bitacora-messier/
└── bitacora-messier.php
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
```

> WordPress **no permite** subir `.js` desde la biblioteca de medios.

### 3. Crear las dos páginas

**Página del formulario.** *Páginas → Añadir nueva*, título "Registrar
observación". Añade un bloque **HTML personalizado** y pega dentro todo el
contenido de `registrar-observacion-wordpress.html`. Publica.

**Página del listado.** Otra página, título "Mis observaciones", con un bloque
**HTML personalizado** y el contenido de `listado-observaciones-wordpress.html`.

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

Abre `registrar-observacion.html` en el navegador. Es una versión autónoma,
con todo dentro. No guarda nada: al enviar, muestra el bloque de datos que
*habría* enviado al servidor.

---

## Estado y siguientes pasos

Ahora mismo se guarda la **cabecera** de la observación: qué, quién, cuándo,
dónde y la posición del cielo.

Las fichas completas de la web —con sus entradas por aumento, sus textos y sus
bocetos— tienen más estructura: *objeto → observaciones → entradas → imágenes*.
El siguiente paso natural es ampliar el esquema para almacenarlas.
