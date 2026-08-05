# Notas · el "viaje interestelar" como sesión de observación

Investigación sobre si el esquema de `bitacora-registro.php` está bien modelado
para lo que hace hoy el portal, y qué hace falta para añadir el **viaje
interestelar**: la sesión de observación que agrupa todo lo visto una misma
noche, desde un mismo sitio.

Las referencias a líneas son de `resources/plugins/bitacora-registro/bitacora-registro.php`.

---

## 1 · El esquema tal como está

```
observaciones ─┬─< entradas ─< imagenes
               ├── fichas (1:1)
               ├──> objetos      (por texto: 'objeto' → slug)
               ├──> observadores (observador_id)
               ├──> telescopios  (telescopio_id)
               └──> bases        (base_id)

entradas ──> oculares (ocular_id), auxiliares (auxiliar_id)
bases ──< base_compartida >── usuarios
```

La observación es hoy **la unidad de todo**: un objeto, una noche, un sitio, un
telescopio, y de ella cuelgan las entradas (una por ocular/aumento) y de estas
las imágenes. Es una jerarquía sana y el reparto entrada/imagen está bien
pensado. Lo que falta es el nivel de **arriba**: no hay nada que diga que dos
observaciones son de la misma salida.

### Crítica campo a campo

| Dónde | Qué | Problema |
|---|---|---|
| L145 | `fecha_observacion varchar(32)` | Una fecha guardada como texto. No se puede ordenar ni comparar con fiabilidad, ni indexar por rango, ni agrupar por mes. La consulta de salud (L3214) ya ordena por `fecha_observacion ASC, hora_observacion ASC`, que solo funciona porque el formato es ISO por convención, no por tipo. Debería ser `date`, con `hora_observacion` (L387) fundida en un `datetime` local o dejada aparte pero tipada. |
| L146-147 | `observador varchar(160)` + `telescopio varchar(160)` junto a `observador_id` (L152) y `telescopio_id` (L381) | Dos hogares para el mismo dato. El comentario de L380 dice explícitamente «El texto de telescopio/ocular se conserva», pero nada garantiza que sigan de acuerdo cuando el observador renombra su telescopio en Mi flota. Es exactamente el patrón que `CONTEXT.md` describe como raíz del bug de la astrometría: dos copias que ya habían divergido. |
| L252-274 (`fichas`) | `lat`, `lon`, `lugar` | La base ya es el hogar de la ubicación (L336-350) y la observación ya enlaza a ella por `base_id` (L394). La ficha guarda otra vez las coordenadas y el nombre del sitio. Congelar la ubicación tiene sentido si se quiere que la ficha impresa no cambie al editar la base — pero eso hay que decidirlo y escribirlo, no heredarlo del historial. |
| `fichas.fecha`, `fichas.fecha_hora_local` | Tercera copia de la fecha, en varchar | Igual que arriba. |
| L388-393 | `cielo_sqm`, `cielo_bortle`, `cielo_ir` en la observación | **Estos son datos de la NOCHE, no del objeto.** Si una noche se observan ocho objetos, el SQM se teclea y se guarda ocho veces. Parecía el candidato más claro a subir al viaje, pero **no**: el cielo cambia durante la noche y el registro puede rellenarse antes de observar, así que el dato es de cada observación. El viaje solo lo resume. |
| L159-163 | Índices | `KEY objeto`, `usuario_id`, `observador_id`, `borrada_en` — todos de una sola columna. La consulta real del listado (L3849) es `WHERE borrada_en IS NULL ORDER BY creado_en DESC LIMIT 200`: ese índice de una columna sobre `borrada_en` no sirve para el `ORDER BY`. |
| Todas | Sin claves ajenas | `dbDelta` no admite `FOREIGN KEY` ([ticket 19207](https://core.trac.wordpress.org/ticket/19207)), así que la integridad referencial es responsabilidad del PHP. Es una restricción de la plataforma, no un descuido; conviene tenerlo consciente. |
| L1287, L1341, L378-394 | Migraciones como `get_option('bitacora_fichas_migradas')` | Funciona, pero son banderas sueltas, una por cambio. Un solo número de versión de esquema es lo que recomienda WordPress (§4). |

Nada de esto rompe hoy. Es deuda que se paga cuando entren decenas de
observadores.

---

## 2 · Cómo lo resuelve el estándar del gremio (OAL)

**Open Astronomy Log** es el esquema XML abierto para bitácoras de observación
visual, mantenido por la Fachgruppe Computerastronomie de la VdS. Lo implementan
Observation Manager, Deep-Sky Planner, KStars, DeepSkyLog y SkySafari. Versión
vigente 2.1 (2011); el repositorio sigue publicado bajo Apache 2.0.

Su `sessionType` (en `src/openastronomylog21/oal_Base.xsd`) es literalmente lo
que pides:

| Elemento | Tipo | Cardinalidad |
|---|---|---|
| `begin` | `xsd:dateTime` | 1 |
| `end` | `xsd:dateTime` | 1 |
| `site` | `xsd:IDREF` | 1 |
| `coObserver` | `xsd:IDREF` | 0..n |
| `weather` | `xsd:string` | 0..1 |
| `equipment` | `xsd:string` | 0..1 |
| `comments` | `xsd:string` | 0..1 |
| `image` | `xsd:string` | 0..n (nuevo en 2.1) |

Y su `observationType`:

| Elemento | Tipo | Cardinalidad |
|---|---|---|
| `observer` | `IDREF` | 1 |
| `site` | `IDREF` | 0..1 |
| `session` | `IDREF` | **0..1** |
| `target` | `IDREF` | 1 |
| `begin` / `end` | `dateTime` | 1 / 0..1 |
| `faintestStar` | `double` | 0..1 |
| `sky-quality` | `surfaceBrightnessType` | 0..1 |
| `seeing` | `seeingType` | 0..1 |
| `scope`, `eyepiece`, `lens`, `filter`, `imager` | `IDREF` | 0..1 cada uno |
| `magnification` | `double` (≥1) | 0..1 |
| `result` | `findingsType` | **1..n** |
| `image` | `string` | 0..n |

Tres lecturas que importan para el diseño:

**a) La sesión la definen el TIEMPO y el SITIO, no el telescopio.** En OAL el
`scope` cuelga de la *observación*, no de la sesión; la sesión solo lleva un
`equipment` de texto libre y descriptivo. Tu enunciado dice «mismo lugar y mismo
telescopio». Yo dejaría el telescopio **fuera de la identidad del viaje**: si esa
noche montas el refractor y luego sacas los prismáticos, sigue siendo un solo
viaje, y partirlo en dos rompe la narrativa que el nombre "viaje" promete. La
información no se pierde: `observaciones.telescopio_id` ya existe (L381) y
`entradas.ocular_id`/`auxiliar_id` también (L382-383), así que un viaje puede
listar los instrumentos que se usaron sin que definan sus fronteras.

**b) El vínculo observación→sesión es opcional (`minOccurs=0`).** El esquema
admite observaciones huérfanas de sesión. Es la decisión correcta para migrar sin
dolor: `viaje_id` nulo es un estado legítimo, no un error. El propio proyecto OAL
avisa del reverso: DeepSkyLog exporta sin sesiones y Deep-Sky Planner, que las
exige, no puede importar esos ficheros. Traducido a tu portal: acepta la
observación sin viaje, pero crea el viaje siempre que puedas al guardar.

**c) `result` es 1..n dentro de una observación.** Es tu tabla `entradas`, con
otro nombre. Lo que ya tienes coincide con el estándar sin haberlo copiado; buena
señal.

**d) `session.coObserver` es 0..n.** Ya que hablas de incorporar compañeros: la
salida compartida es un caso de primera clase en el estándar. Merece su tabla de
unión desde el principio (§3).

Lo que **no** tomaría de OAL: `site.timezone` como entero de minutos. Tus `bases`
guardan zona IANA (`tz varchar(64)`, L346), que es estrictamente mejor porque
resuelve el horario de verano; `bitacora-astro.js` ya depende de ello.

---

## 3 · Propuesta

### Identidad del viaje

> **Un viaje = (observador, noche, base).**

`usuario_id` desempata (dos observadores en el mismo sitio la misma noche hacen
dos viajes, enlazados entre sí como coobservadores). El telescopio queda fuera,
por (a) del apartado anterior.

### Qué es "la noche" de una observación

Una observación de las 02:00 pertenece a la noche que empezó el día anterior. La
regla sin ambigüedad, y la que usa la astronomía desde siempre, es **fechar por
el mediodía**: la fecha juliana es «a continuous count of days from 1 January
4713 BC (= -4712 January 1), **Greenwich mean noon** (= 12h UT1)», de modo que el
contador entero cambia a mediodía y no a medianoche, y una noche entera de
observación cae bajo un único número.

Aplicado aquí, con hora **local de la base**:

```
noche = fecha( hora_local − 12h )
```

- 22:40 del 4 de agosto → noche del **4 de agosto**.
- 02:15 del 5 de agosto → noche del **4 de agosto**.
- 11:00 del 5 de agosto (Sol, planeta a plena luz) → noche del **4**; es el precio
  de una regla sin excepciones, y para el uso nocturno del portal no molesta.

Se calcula en PHP, no en SQL. Una columna generada (`GENERATED ALWAYS AS`) no
vale: la conversión necesita la zona horaria de la *base*, que está en otra tabla,
y MySQL prohíbe expresamente que la expresión de una columna generada contenga
subconsultas y funciones no deterministas — «Subqueries are not permitted»,
«Examples of functions that are nondeterministic and fail this definition:
`CONNECTION_ID()`, `CURRENT_USER()`, `NOW()`». El código ya sabe hacer esta cuenta:
`BitacoraAstro.posiciones()` convierte hora de pared + huso IANA a UTC sin
librerías (ver `CONTEXT.md`, *Astrometría de la sesión*).

### ¿Derivada o materializada?

**Materializada**: tabla `viajes` con `viaje_id` en la observación. Aunque la
agrupación se pueda calcular al vuelo con un `GROUP BY`, el viaje tiene **datos
propios que no salen de ninguna observación**: su nombre ("Viaje al Triángulo de
Verano"), la crónica de la noche, el meteo, el seeing, los coobservadores, la
foto del grupo montando el telescopio. En cuanto una entidad tiene atributos
propios, deja de ser una vista y pasa a ser una tabla. Materializar además da un
sitio donde resumir el cielo de la noche (`cielo_sqm`/`cielo_ir`/`cielo_bortle`)
sin quitárselo a la observación, que lo necesita para sí: ver más abajo.

### DDL

En el estilo del plugin (minúsculas, un campo por línea, dos espacios tras
`PRIMARY KEY`, nombres en español):

```sql
CREATE TABLE {prefix}bitacora_viajes (
    id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
    usuario_id bigint(20) unsigned NOT NULL,
    observador_id bigint(20) unsigned DEFAULT NULL,
    base_id bigint(20) unsigned DEFAULT NULL,
    noche date NOT NULL,
    nombre varchar(160) NOT NULL DEFAULT '',
    comienzo_utc datetime DEFAULT NULL,
    fin_utc datetime DEFAULT NULL,
    cielo_sqm double DEFAULT NULL,
    cielo_ir double DEFAULT NULL,
    cielo_bortle tinyint DEFAULT NULL,
    seeing tinyint DEFAULT NULL,
    meteo varchar(255) NOT NULL DEFAULT '',
    cronica longtext NOT NULL,
    creado_en datetime NOT NULL,
    actualizado_en datetime DEFAULT NULL,
    PRIMARY KEY  (id),
    UNIQUE KEY viaje (usuario_id, noche, base_id),
    KEY noche (noche),
    KEY base_id (base_id)
) $collate;
```

```sql
CREATE TABLE {prefix}bitacora_viaje_tripulacion (
    id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
    viaje_id bigint(20) unsigned NOT NULL,
    observador_id bigint(20) unsigned NOT NULL,
    creado_en datetime NOT NULL,
    PRIMARY KEY  (id),
    UNIQUE KEY viaje_observador (viaje_id, observador_id)
) $collate;
```

Y en la observación, con `bitacora_asegurar_columna()` como el resto (L381-394):

```php
bitacora_asegurar_columna( $tabla, 'viaje_id', "bigint(20) unsigned DEFAULT NULL" );
```

Sobre `UNIQUE KEY viaje (usuario_id, noche, base_id)`: cuidado, «A `UNIQUE` index
permits multiple `NULL` values for columns that can contain `NULL`». Con
`base_id` nulo (observación sin base) la clave **no** impide duplicados. Es
aceptable —sin base no hay viaje agrupable, y `viaje_id` se queda nulo, que OAL
admite— pero si prefieres que agrupe igual, usa `base_id NOT NULL DEFAULT 0` con
0 = "sitio sin registrar".

> **Se eligió la segunda opción (5 de agosto de 2026).** Al pasar el lugar de la
> observación al viaje, una salida sin lugar dejó de ser un caso degenerado para
> ser normal, y con `NULL` cada guardado habría abierto un viaje nuevo para la
> misma noche. La columna es `base_id bigint(20) unsigned NOT NULL DEFAULT 0`, y
> la migración pone a 0 los nulos **antes** del `dbDelta` (en modo estricto,
> `ALTER … NOT NULL` sobre nulos existentes falla).

### Lo que se mueve de sitio

- `cielo_sqm`, `cielo_ir`, `cielo_bortle`: **descartado tras revisarlo contigo
  (5 de agosto de 2026).** Se copian al viaje como resumen, pero se quedan
  también en la observación: no son un dato redundante de la noche, porque las
  condiciones cambian mientras se observa (entra bruma, sube la Luna) y el
  registro puede rellenarse antes de salir. Dos objetos de la misma noche pueden
  tener cielos distintos con toda razón.
- `entradas.ocular_id`/`auxiliar_id` y `observaciones.telescopio_id`: se quedan
  donde están. Coinciden con OAL.

---

## 4 · Migración y versionado

**Rellenar los viajes de lo ya registrado** es directo porque los tres campos de
identidad ya existen en la observación:

```sql
INSERT INTO {prefix}bitacora_viajes (usuario_id, base_id, noche, creado_en)
SELECT usuario_id, base_id, <noche calculada>, UTC_TIMESTAMP()
FROM {prefix}bitacora_observaciones
WHERE borrada_en IS NULL
GROUP BY usuario_id, base_id, <noche calculada>;
```

Con `<noche calculada>` resuelto en PHP fila a fila (por la zona horaria de la
base), no en SQL. A la escala de este portal, un bucle PHP con un `upsert` por
observación tarda segundos y se lee sin esfuerzo dentro de un año.

El SQM del viaje se hereda con la mediana (o el primero no nulo) de sus
observaciones. Nada se pierde: las columnas de la observación siguen ahí hasta la
fase 2.

**Versionado del esquema.** Sustituir las banderas sueltas por un número:

```php
$bitacora_db_version = '3';
// en la rutina de instalación
if ( get_option( 'bitacora_db_version' ) !== $bitacora_db_version ) { ... }
```

Dos advertencias documentadas por WordPress que afectan a esto:

- «Since 3.1 the activation function registered with `register_activation_hook()`
  is not called when a plugin is updated.» Hay que comprobar la versión también
  en `plugins_loaded` — el plugin ya llama a la creación desde ahí en la práctica,
  pero conviene que sea explícito.
- `dbDelta` es **solo aditivo**. La referencia oficial no menciona borrado en
  ningún sitio, y el código fuente nunca construye un `DROP`: las columnas
  obsoletas se quedan. Renombrar un campo crea uno nuevo vacío y deja el viejo.
  Por eso `bitacora_asegurar_columna()` (L118-127) existe y por eso las retiradas
  de columnas se hacen a mano con `ALTER TABLE`.

---

## 5 · Escala: los números de verdad

Con lo que planteas —**50 observadores × 300 sesiones × ~6 objetos**— salen
**~90.000 observaciones**, ~250.000 entradas y unos 15.000 viajes. Para InnoDB
eso es una tabla pequeña: cabe entera en el *buffer pool* de cualquier hosting
compartido. **No hay ningún caso para particionar, ni para desnormalizar, ni para
una caché.** Un escaneo completo de 90.000 filas se mide en decenas de
milisegundos.

Lo que sí conviene, porque es gratis y arregla consultas que ya existen hoy:

```sql
KEY activas (borrada_en, creado_en),     -- L3849: WHERE borrada_en IS NULL ORDER BY creado_en DESC
KEY base_fecha (base_id, borrada_en),    -- L3214: salud de la base
KEY viaje_id (viaje_id)                  -- listar los objetos de un viaje
```

El índice de una sola columna sobre `borrada_en` (L163) puede retirarse cuando
entre `activas`: es su prefijo por la izquierda.

El cuello de botella real de este portal, a esa escala, **no es la base de
datos**: son las imágenes (`imagenes.imagen_url`) y las llamadas a SIMBAD/Gaia.

---

## 6 · Lo que NO haría

- **Tabla `noches` global compartida entre observadores.** Suena elegante y
  obliga a resolver a qué noche pertenece cada uno cuando están en husos
  distintos. El viaje por observador con enlace de tripulación resuelve lo mismo
  sin entidad nueva.
- **Claves ajenas.** `dbDelta` no las soporta; forzarlas con `ALTER TABLE` a mano
  crea un esquema que el propio instalador no sabe reproducir.
- **`viajes` como vista o `GROUP BY` al vuelo.** Ya argumentado: el viaje tiene
  datos propios.
- **Herencia de tipos de observación** al estilo `ext_DeepSky` / `ext_VariableStars`
  de OAL. Tú registras cielo profundo; una tabla por tipo de objeto es
  especulación pura hoy.
- **Mover el telescopio al viaje**, aunque el enunciado lo pedía. Ver §2(a). Si
  aun así lo quieres en la identidad, basta añadir `telescopio_id` a la
  `UNIQUE KEY` — pero acepta que cambiar de tubo a media noche parta el viaje en
  dos.
- **Tipar `fecha_observacion` a `date` en la misma tanda que el viaje.** Es un
  cambio de tipo sobre datos vivos y merece su propio paso, después y con el
  respaldo hecho.

---

## Orden sugerido

1. Tabla `viajes` + `viaje_id` en la observación (nulo permitido). Backfill.
2. La interfaz agrupa el listado por viaje; el formulario propone el viaje de esa
   noche/base si ya existe.
3. ~~`cielo_*` sube al viaje~~ — descartado: se quedan en la observación (arriba).
4. Tripulación (coobservadores).
5. Aparte, sin prisa: `fecha_observacion` a `date`, retirar `observador`/
   `telescopio` de texto.

---

## Fuentes

| Fuente | Qué aporta |
|---|---|
| [openastronomylog/openastronomylog](https://github.com/openastronomylog/openastronomylog) (Apache 2.0, v2.1, `src/oal21.xsd`) | El esquema abierto de bitácoras; `oal21.xsd` solo declara el espacio de nombres e incluye `oal_Base.xsd` y las extensiones. |
| [`src/openastronomylog21/oal_Base.xsd`](https://raw.githubusercontent.com/openastronomylog/openastronomylog/master/src/openastronomylog21/oal_Base.xsd) | Definición de `sessionType` (begin/end/site/coObserver/weather/equipment/comments/image), `observationType` (session 0..1, scope/eyepiece/lens/filter en la observación, result 1..n), `siteType` y `observerType`. Base de todo el §2. |
| [Wiki de OAL](https://github.com/openastronomylog/openastronomylog/wiki) | Guía de conformidad y lista de aplicaciones compatibles (Observation Manager, Deep-Sky Planner, KStars, DeepSkyLog, SkySafari). |
| [Creating Tables with Plugins — WordPress](https://developer.wordpress.org/plugins/creating-tables-with-plugins/) | Reglas de formato de `dbDelta`, patrón de versión de esquema en una opción, y que `register_activation_hook()` no se dispara al actualizar el plugin. |
| [Referencia de `dbDelta()`](https://developer.wordpress.org/reference/functions/dbdelta/) | `dbDelta` es solo aditivo: nunca construye `DROP`; renombrar crea columna nueva y deja la vieja. |
| [Trac #19207](https://core.trac.wordpress.org/ticket/19207) | `FOREIGN KEY` con `dbDelta`. Citado de segunda mano desde la referencia anterior; no verificado directamente. |
| [MySQL 8.4 · Generated Columns](https://dev.mysql.com/doc/refman/8.4/en/create-table-generated-columns.html) | VIRTUAL vs STORED, se pueden indexar, y las prohibiciones: sin subconsultas, sin funciones no deterministas. Razón para calcular `noche` en PHP. |
| [MySQL 8.4 · CREATE INDEX](https://dev.mysql.com/doc/refman/8.4/en/create-index.html) | «A `UNIQUE` index permits multiple `NULL` values for columns that can contain `NULL`». Afecta a la clave del viaje con `base_id` nulo. |
| [USNO · Julian Date](https://aa.usno.navy.mil/faq/JD_formula) | La fecha juliana cuenta desde el **mediodía** medio de Greenwich (12h UT1). Base de la regla `noche = fecha(hora_local − 12h)`. La página da el convenio, **no** la justificación de por qué se eligió el mediodía; esa lectura es mía. |

**No verificado:** no he podido abrir `openastronomylog.org` (el dominio no
resuelve); todo lo de OAL sale del repositorio en GitHub, que es la fuente
canónica del esquema. La regla del prefijo por la izquierda de los índices
compuestos (§5) está documentada en *How MySQL Uses Indexes*, página que no
llegué a abrir.
