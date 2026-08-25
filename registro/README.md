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
| `resources/js/bitacora-gaia-color.js`, `bitacora-gaia-render.js` (compartidos) | Motor de render de estrellas de Gaia, reutilizado del simulador para *Generar con el simulador* | Servidor, por FTP (mismos que usa el simulador) |
| `datos-ficha-wordpress.html` | Fragmento del formulario de datos de ficha (astrometría) | Editor de WordPress |
| `bitacora-ficha.js` | Lógica del formulario de datos de ficha | Servidor, por FTP |
| `listado-observaciones-wordpress.html` | Fragmento del listado | Editor de WordPress |
| `bitacora-listado.js` | Lógica del listado | Servidor, por FTP |
| `bitacora-listado.css` | Estilos del listado | Servidor, por FTP |
| `mi-flota-wordpress.html` | Fragmento de "Mi flota" (equipo del observador) | Editor de WordPress |
| `bitacora-flota.js` | Lógica de "Mi flota" | Servidor, por FTP |
| `mis-viajes-wordpress.html` | Fragmento de "Mis viajes" (sesiones de observación: lugar, crónica, meteo, cielo) | Editor de WordPress |
| `bitacora-viajes.js` | Lógica de "Mis viajes" | Servidor, por FTP |
| `plantilla-oal.html` | La **plantilla** que se dan a los compañeros: un único archivo que anota sus noches y escribe el XML | Servidor, por FTP (se descarga desde la página de importar) |
| `importar-oal-wordpress.html` | Fragmento de "Importar observaciones" | Editor de WordPress |
| `bitacora-importar-oal.js` | Lógica de "Importar observaciones" | Servidor, por FTP |
| `bitacora-oal.php` | Leer el XML e importarlo (mitad pura + mitad WordPress) | Junto al plugin, en el servidor |
| `bitacora-viaje.php` | La identidad de un viaje y la salud de una base (puro, sin WordPress) | Junto al plugin, en el servidor |
| `bitacora-distancia.php` | De qué fuente sale la distancia al Sol y con qué nombre se pregunta (puro, sin WordPress) | Junto al plugin, en el servidor |
| `resources/datos/{telescopios,oculares,auxiliares,filtros}.csv` | Catálogo de equipo (semilla) | Bundled en el plugin (`…/bitacora-registro/datos/`) |
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

- **Fecha de la observación** (**obligatoria**) y **hora local** (opcional). La
  hora no cambia nada del render; se guarda para calcular más adelante la
  **posición del objeto** cuando se añada un lugar de observación.
- **Objeto observado**, con autocompletado y validación en dos niveles:
  - Los **110 objetos Messier** están embebidos en el código con sus
    coordenadas. Al escribir `M30` o `Messier 30` se reconoce al instante y
    ya se conocen su RA y su Dec.
  - Si escribes `M202`, avisa: *el catálogo Messier llega hasta M110*.
  - Cualquier otro objeto (`NGC 6826`, `IC 1396`…) se acepta, pero pide su
    **RA y Dec a mano**, porque sin coordenadas no hay cálculo posible.
    Admite formato sexagesimal (`21h 40m 22s`) o decimal (`325.09`).
- **Viaje estelar** de esa noche (**obligatorio**). En cuanto hay fecha, el
  formulario pregunta al servidor qué salidas tienes esa noche: si hay una, lo
  dice; si hay varias, aparece un selector; si no hay ninguna, ofrece darla de
  alta allí mismo. Sin viaje no se guarda.
- **Base de observación** (opcional), y **solo si el viaje no tiene lugar**: el
  lugar es de la salida, no del objeto. Lo que contestes aquí sube al viaje, así
  que se pregunta una vez por salida y no una vez por objeto.
- Observador y **telescopio**. El telescopio es **siempre de la flota** del
  observador (ver *Mi flota* más abajo): no hay texto libre, para que todo el
  equipo tenga apertura/focal/óptica reales (necesarias para generar la imagen
  del simulador). Si la flota está vacía, el formulario guía a *Mi flota*.
- **Cielo de la sesión**: un **SQM** (mag/arcsec²) con un atajo por la **escala
  Bortle** (elegir «Clase 3 · Cielo rural» fija el SQM). Alimenta la magnitud
  límite al generar la imagen y queda registrado en la observación.

### 2 · Lo que viste, por ocular

Una **entrada por cada aumento**, con: aumento y campo real (obligatorios),
pupila de salida y nombre del ocular (opcionales), descripción con formato,
imágenes principales (varias = pestañas en la ficha) e imágenes de apoyo
(anexos). Las imágenes se suben a la biblioteca de medios de WordPress.

**Generar la imagen con el simulador.** Cada entrada tiene, junto a *+ Añadir
imagen*, un botón **+ Generar con el simulador**: reutiliza el motor de la vista
de estrellas del [simulador de ocular](../simulador_ocular/README.md)
(`BitacoraGaiaRender`) con el **equipo de la flota de esa entrada** (telescopio +
ocular + auxiliar), el **objeto** de la observación y el **cielo** de la sesión,
y produce la imagen de cómo se vería ese campo. Se muestra una
**previsualización** (900×900, campo circular ∝ campo aparente del ocular) y, al
aceptar, se sube como una imagen principal más en **WebP**, marcada
`origen: simulada` y con la insignia *«simulada (Gaia)»* o *«simulada (DSS)»*
para distinguirla de una foto o boceto reales. Disponible solo cuando el objeto
tiene coordenadas y la entrada usa telescopio y ocular de la flota.

En la cabecera del modal se elige la **fuente** de la vista, y cambiarla repinta
el mismo campo para poder compararlas **antes** de decidir:

- **Estrellas de Gaia DR3** — el catálogo dibujado (`BitacoraGaiaRender.render`).
  Manda en cúmulos, dobles y campos estelares.
- **DSS (placas fotográficas)** — la placa real pasada por la misma cadena
  fotométrica del simulador (`BitacoraGaiaRender.renderPlaca`), con las
  brillantes realzadas con Gaia encima. Manda en nebulosidad y, sobre todo, en
  las **nebulosas oscuras** (los Barnard), que un catálogo de puntos no cuenta.
  El DSS no sirve más de **2°**: con un campo mayor la placa se recorta y el
  modal lo avisa.

La base solo distingue `simulada` de `subida`, así que al reabrir una
observación guardada la insignia vuelve a ser *«simulada»* a secas.

### 3 · Exploración (opcional)

Una **síntesis de la observación o los retos** a los que se enfrenta el
observador, **sin datos de ocular**. En la ficha del mapa aparece como
«M30. Exploración».

### Añadir otra (encadenar objetos de la misma noche)

Una noche se pasa saltando de objeto en objeto, así que al guardar aparece el
botón **«Añadir otra»**. Vacía el objeto, sus coordenadas y todo lo que se vio
de él, y **conserva lo que no cambia de un objeto al siguiente**: viaje, fecha,
telescopio, observador, base y cielo. La hora avanza **20 minutos**, de modo
que la siguiente observación cae sola en la misma sesión (el viaje se deduce de
la fecha y la hora). Si el salto cruza la medianoche, la fecha avanza con ella:
23:50 + 20 min es el día siguiente. Prueba:
`node scripts/test_otra_observacion.js`.

En modo edición el botón no aparece: allí se modifica una observación vieja, no
se está observando.

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
- la **distancia** al Sol (ver abajo);
- las posiciones `top` y `edge` sobre las imágenes del mapa (fórmula verificada
  contra el catálogo existente);
- la **clase de Hubble** (elíptica, lenticular, espiral, barrada, irregular),
  que fija el color del marcador en el atlas del Grupo Local.

Ya no hace falta calcular la posición a mano. Las consultas a SIMBAD se cachean
para no repetirlas. Si el objeto es extragaláctico, se dibuja en el atlas; si
está dentro de la galaxia, en el mapa cenital/de canto.

### De dónde sale la distancia

Es el dato que más falta: SIMBAD no publica ninguna medida de distancia de buena
parte de las nebulosas y cúmulos galácticos. Se prueba, por este orden:

1. la **mediana de las medidas** de SIMBAD (`mesDistance`);
2. la **paralaje** de SIMBAD, que muchas veces está cuando las medidas no (así
   se coloca NGC 2022, por la paralaje Gaia de su estrella central);
3. **VizieR**: el catálogo de cúmulos abiertos de Dias (`B/ocl`), que cubre la
   familia con más huecos en SIMBAD;
4. el **Open Astronomy Catalog**, el catálogo abierto de los transitorios, que
   sabe la distancia de las supernovas y sus restos (M1, la Cangrejo, se coloca
   por ahí: responde como SN 1054);
5. **NED**, por **corrimiento al rojo** y solo para lo lejano (a partir de
   z = 0,01): es una estimación por la ley de Hubble, no una medida, y de cerca
   la velocidad propia de la galaxia la estropea;
6. la que **escriba el observador**, para lo que no sabe ninguna base de datos.

Cuando no hay ninguna, la observación se guarda igual y el formulario avisa y
pide la distancia en años luz ahí mismo: al escribirla, el objeto se da de alta
y aparece en el mapa (es el caso de las nebulosas difusas, como NGC 2024).

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
**equipo personal**: telescopios, oculares, auxiliares (Barlow, Powermates,
reductores) y filtros. Sirve para que, al registrar, no haya que teclear la
óptica a mano.

- **Catálogo global**: un catálogo común (~870 telescopios, ~660 oculares,
  ~35 auxiliares y ~130 filtros) importado de 4 CSV incluidos en el plugin
  (`…/bitacora-registro/datos/`). El observador **busca** en él y añade modelos
  a su flota (se copian sus specs), o crea uno **a medida**. Cada pieza es suya
  (`usuario_id`); el catálogo global son filas con `usuario_id` a NULL.
- **Cálculo óptico automático**: en el formulario de registro, al elegir un
  telescopio y, por ocular, uno de sus oculares (y opcionalmente **hasta dos
  auxiliares**), se autocalculan **aumento**, **pupila de salida** y **campo
  real** —todos editables— con:
  - `focal_efectiva = focal_tele × factor + extension_mm`, aplicada una vez por
    auxiliar puesto
  - `aumentos = focal_efectiva / focal_ocular`
  - `pupila = apertura / aumentos`
  - `campo_real = campo_aparente / aumentos`

  El factor del auxiliar multiplica (Barlow) o reduce (reductor) la focal
  efectiva. Con dos auxiliares (el caso típico: Paracorr y luego Barlow) se
  encadenan **en orden**, el primer hueco antes que el segundo: el primero es el
  que va montado más cerca del tubo. La cuenta vive en una sola función,
  `BitacoraEquipo.focalConAuxiliares()`, que comparten el formulario y el
  simulador de oculares. Los valores calculados son los que ya guardaba la
  observación, así que **el mapa y la ficha no cambian**: el equipo solo los
  rellena.
- **Filtros**: cada entrada puede anotar con qué filtro se miró (UHC, O-III,
  lunar…). Es un dato de bitácora: **no toca la óptica**, no cambia aumento,
  pupila ni campo. Uno por entrada, sin apilar.
- La observación guarda además el `telescopio_id`, y cada entrada su `ocular_id`,
  `auxiliar_id`, `auxiliar2_id` y `filtro_id`, para poder reeditar y recalcular.

El catálogo se importa solo al activar/actualizar el plugin (idempotente) y
puede reimportarse desde el panel de administración de Bitácora.

---

## Mis viajes (las sesiones de observación)

`mis-viajes-wordpress.html` lista tus salidas y edita su ficha: **nombre**,
**lugar**, hora de **comienzo** y **fin**, **meteorología**, **cielo** (SQM o
Bortle, transparencia, seeing) y la **crónica** de la noche. Todo eso es de la
salida, no del objeto, y por eso vive aquí y no en el formulario de registro.

La **noche** no se edita: es la identidad del viaje junto al observador y el
lugar. Un viaje solo se puede borrar cuando ya no le cuelga ninguna observación.

Un viaje se puede crear desde aquí, o desde el propio formulario de registro
cuando esa noche todavía no tiene ninguno.

Cada salida enseña además su **ruta**: los objetos que se visitaron, en el orden
en que se observaron (hora ascendente y, sin hora, al final por antigüedad de
registro). El orden lo decide el servidor, así que la lista y la línea que dibuja
el mapa cuentan siempre el mismo recorrido. El botón **«Ver en el mapa»** abre
`mapa.html?viaje=<id>`, que deja en el mapa solo esos objetos unidos por la línea
dorada del viaje. Una salida sin objetos no tiene ruta que enseñar ni botón.

---

## Traer las observaciones de un compañero (Open Astronomy Log)

No todo el mundo observa con esta web delante. Un compañero anota su noche en
papel y luego querría que estuviera aquí, con su nombre y en su cuenta. El
puente son **dos piezas y un formato estándar**:

**La plantilla** (`plantilla-oal.html`) es un **único archivo** que se descarga
desde la página de importar y se abre en el navegador: no hay que instalar
nada, ni tener cuenta, ni estar conectado. Se anota la noche (lugar, equipo,
compañeros, cielo) y luego cada objeto, con una entrada por aumento. Guarda
sola lo escrito en el propio navegador, así que se puede cerrar y seguir otro
día, y el botón *Abrir XML* recupera un fichero ya empezado. Al nombrar un
objeto lo resuelve en **Sesame/CDS** para traerse sus coordenadas y su tipo; si
no hay red, se escriben a mano o se dejan en blanco.

**El formato es [Open Astronomy Log](https://github.com/openastronomylog/openastronomylog) 2.1**,
el estándar de los cuadernos de observación: el mismo XML lo leen otros
programas de bitácora, así que el trabajo del compañero no queda preso aquí.
El cielo va en **cada observación**, que es de donde cuelga: el **SQM** y el
**seeing** en sus elementos estándar (`<sky-quality>`, `<seeing>`), y solo la
transparencia **IR** y la clase **Bortle** en un espacio de nombres propio
(`bit:`), que un lector estándar simplemente ignora. El compañero lo teclea una
vez por noche y de ahí baja a sus observaciones, donde puede corregirlo objeto a
objeto: el SQM se mide **hacia donde está el objeto**, y uno bajo cae sobre un
horizonte contaminado.

**La importación** (`POST /importar-oal`, y el panel del escritorio) va en dos
pasos: primero se ve **qué entraría** —cuántas noches y objetos, qué bases y
qué equipo se crearían, **qué se reutiliza de lo que ya tienes** y qué filas
están mal— y solo el segundo botón escribe. Las reglas que deciden todo eso:

- **Una noche es un viaje.** La noche la calcula el mismo convenio de mediodía
  de siempre, así que la madrugada no se separa de su tarde. El cielo (SQM, IR,
  seeing, Bortle) es de cada observación, que es de donde lo lee la ficha; al
  viaje sube un **resumen**: el primer valor no nulo de la noche. Los ficheros
  viejos, con el cielo en la sesión, se siguen leyendo y se reparten.
- **Las coordenadas que falten las resuelve SIMBAD** al importar, igual que el
  formulario; la vista previa no toca la red.
- **Un objeto por noche es una observación**, y cada ocular del XML es una
  **entrada** suya. En OAL una observación es objeto + ocular, así que M13 a
  68× y a 210× llegan como dos y entran como una ficha con dos aumentos.
- **El lugar se casa por nombre y, si no, por cercanía** (150 m). Importa
  acertar: dos bases para el mismo cerro parten en dos la gráfica de salud del
  sitio. El equipo se casa solo por modelo; lo que no exista se crea como
  personal del observador.
- **Reimportar no duplica.** Cada observación importada guarda su `oal_id`
  (**fecha** de la noche + objeto, no el id de sesión del XML, que la plantilla
  sortea), así que corregir una errata en la plantilla y volver a subir el
  fichero **actualiza** lo que ya entró.
- **Lo que está mal se avisa, no aborta.** Un objeto sin nombre o una noche sin
  fecha se listan para repasarlos en la plantilla; el resto entra igual.

Desde la página del frontend las observaciones entran **siempre en la cuenta de
quien sube el fichero**. Elegir destinatario es cosa del panel del escritorio,
donde hace falta ser administrador.

El XML llega de fuera y se trata como entrada hostil: se parsea sin cargar
entidades externas (XXE) ni tocar la red (`LIBXML_NONET`), con un tope de
tamaño comprobado antes de parsear, y todo el texto pasa por
`sanitize_text_field` o `wp_kses_post` según dónde vaya.

Las reglas viven en la mitad **pura** de `bitacora-oal.php`, sin WordPress ni
base de datos, y se prueban con los ficheros de `ejemplos-oal/`. Dos de ellos
los escribe **la propia plantilla** (`node scripts/generar_ejemplos_oal.js`),
así que si plantilla e importador dejan de entenderse el test se entera; el
tercero, `con-erratas.xml`, está a mano a propósito, porque es justo lo que la
plantilla se niega a descargar. Pruebas: `php scripts/test_oal_import.php` (el
importador) y `node scripts/test_oal_plantilla.js` (el motor de la plantilla).

---

## La salud de una base

Cada lugar acumula su histórico de cielo: **SQM** (mag/arcsec², mayor = más
oscuro), **IR** de transparencia (ºC, más negativo = mejor) y **seeing**
(Antoniadi 1–5, menor = mejor). Se ve en «Mis bases» → *Salud*
(`?salud=ID`, `GET /bases/{id}/salud`).

Las tres se miden en dos sitios: en la **observación** —el seeing se anota ahí
porque se mide con el ocular puesto y cambia durante la noche— y en la **ficha
del viaje**, para quien prefiera apuntarlo una vez por salida. Como el viaje
hereda de su primera observación lo que él no tuviera, juntar las dos tablas sin
más contaría la misma medición dos veces: `bitacora_salud_mediciones()`
(`bitacora-viaje.php`) las fusiona con la regla inversa a la de heredar —manda
la observación, y el viaje solo aporta lo que ninguna observación **suya** dijo,
medida a medida—. La salida es de un observador, así que dos compañeros que
salgan la misma noche al mismo sitio no se tapan el uno al otro.

La gráfica es **una sola** con las tres líneas, y cada una se puede apagar. Como
son tres unidades y dos direcciones, cada serie se escala a su propio rango y se
orienta igual —**arriba es siempre mejor cielo**—, así que lo que se compara
entre líneas es la forma, no la altura; los números de verdad están en la
leyenda. Eso lo decide `BitacoraBase.seriesSalud()` (`bitacora-base.js`), y la
página solo pinta lo que devuelve.

Al **pasar el ratón por un punto** sale un globo con la noche, la medida y su
valor real (y quién lo anotó): es la única forma de leer el número exacto de una
noche, porque el eje vertical no tiene escala. El globo es propio, no el
`<title>` del navegador —que tarda un segundo en salir y no se puede vestir—, y
cada punto lleva un aro transparente para que la diana sea mayor que el punto.
Quien no use ratón tiene debajo la tabla con las mismas mediciones. Prueba:
`node scripts/test_salud_globo.js`.

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
| `telescopio` | `varchar(160)` | del formulario (siempre de la flota) |
| `hora_observacion` | `varchar(8)` | hora local `HH:MM` (opcional), para la posición futura |
| `cielo_sqm` | `double` | brillo de cielo de la sesión, o `NULL` |
| `cielo_bortle` | `tinyint` | clase Bortle 1–9 (etiqueta del SQM), o `NULL` |
| `fecha_hora_local` | `varchar(32)` | tal como la escribió el observador |
| `fecha_hora_utc` | `datetime` | normalizada |
| `lat`, `lon` | `double` | lugar de observación |
| `obj_alt`, `obj_az` | `double` | **calculados** |
| `sun_alt`, `moon_alt` | `double` | **calculados** |
| `origen` | `varchar(16)` | `formulario` u `oal` (importada de un XML) |
| `oal_id` | `varchar(64)` | identidad que traía del XML (noche + objeto): permite reimportar sin duplicar. Vacío en lo registrado a mano |
| `usuario_id` | `bigint` | lo fija el servidor, según la sesión |
| `creado_en` | `datetime` | lo fija el servidor |
| `actualizado_en` | `datetime` | al editar |
| `borrada_en` | `datetime` | borrado suave; `NULL` si está activa |

Además, la observación completa —con sus entradas por ocular y sus imágenes—
se guarda en tablas hijas, y hay catálogos independientes:

| Tabla | Qué guarda |
|---|---|
| `wp_bitacora_entradas` | Las entradas por aumento de cada observación (incluida la de *Exploración*) |
| `wp_bitacora_imagenes` | Las imágenes de cada entrada (principales y anexos). La columna `origen` distingue `subida` (foto/boceto) de `simulada` (generada con el simulador de Gaia) |
| `wp_bitacora_fichas` | La astrometría de la ficha (RA/Dec, lugar, altitud/azimut, Sol/Luna, condiciones) |
| `wp_bitacora_objetos` | El catálogo de objetos del mapa: color, `top`/`edge`, `l`/`b`, distancia, clase de Hubble |
| `wp_bitacora_observadores` | Quién observa (para filtrar el mapa por autor) |
| `wp_bitacora_telescopios` | Telescopios: catálogo global (`usuario_id` NULL) + flotas personales |
| `wp_bitacora_oculares` | Oculares: catálogo global + flotas personales |
| `wp_bitacora_auxiliares` | Auxiliares (Barlow/reductores): catálogo global + flotas personales |
| `wp_bitacora_filtros` | Filtros (UHC, O-III, lunares…): catálogo global + flotas personales. `bandpass` es texto tal cual del catálogo |
| `wp_bitacora_bases` | Las bases de observación del usuario (nombre, lat/lon, altitud, huso) |
| `wp_bitacora_viajes` | Los **viajes interestelares**: una salida = un observador, una noche, una base. Guarda lo que es de la salida y no del objeto (lugar, crónica, meteo, cielo, comienzo y fin). `base_id = 0` = salida sin lugar registrado |
| `wp_bitacora_viaje_tripulacion` | Quién más iba en ese viaje |

La observación referencia el `telescopio_id`, y cada entrada su `ocular_id`,
`auxiliar_id`, `auxiliar2_id` y `filtro_id` (el equipo usado en ese aumento).
Los dos huecos de auxiliar son fijos y ordenados: el primero es el que va
montado más cerca del tubo.

La observación referencia también su `viaje_id` y su `base_id`. El **viaje es
obligatorio**: se elige al registrar, entre los que tenga esa noche (o se da de
alta allí mismo). La **noche** la calcula el servidor con el convenio de mediodía
(antes de las 12:00 la noche es la del día anterior, así la madrugada no se
separa de su tarde), y la terna observador + noche + base es la identidad del
viaje, con `UNIQUE` en la tabla. El telescopio **no** entra: cambiar de tubo no
parte la salida en dos.

El **lugar es del viaje**, no de la observación: se indica una vez en su ficha
(*Mis viajes*) y vale para toda la noche. Un viaje sin lugar es legítimo y lleva
`base_id = 0` —no `NULL`, que la clave única de MySQL admitiría por duplicado—;
en ese caso el registro pregunta la base, que es lo único que permite seguir
calculando altura y azimut, y esa respuesta **sube al viaje**: se pregunta una
vez por salida, no una vez por objeto. Ya con lugar, manda el del viaje y
cambiarlo es cosa de su ficha; al mudarlo se mudan con él las observaciones de
esa salida.

El único caso en que el lugar **no** sube es cuando esa noche ya tienes otra
salida desde ese mismo sitio: subirlo chocaría con el `UNIQUE`. Entonces el
viaje se queda sin lugar, la observación conserva el suyo, y se resuelve a mano
en *Mis viajes*. Poner `baseId = 0` en la ficha vacía el lugar a propósito, y el
registro vuelve a preguntarlo.

Todo sigue siendo SQL estándar con columnas explícitas: portable con un
`export`/`import`.

---

## La API

Todas las rutas cuelgan de `/wp-json/bitacora/v1/`.

| Método | Ruta | Sesión | Qué hace |
|---|---|---|---|
| `POST` | `/observaciones` | Sí | Crea una observación. `viajeId` es **obligatorio**; `baseId` solo si ese viaje aún no tiene lugar, y entonces sube a él |
| `GET` | `/observaciones` | Sí | Lista las activas. `?borradas=1` para la papelera, `?mias=1` para filtrar por autor |
| `GET` | `/observaciones/{id}` | Sí | Devuelve una, para precargar el formulario |
| `PUT` | `/observaciones/{id}` | Sí | La modifica *(solo el autor)* |
| `DELETE` | `/observaciones/{id}` | Sí | Borrado suave *(solo el autor)* |
| `POST` | `/observaciones/{id}/restaurar` | Sí | Deshace el borrado *(solo el autor)* |
| `GET` | `/observaciones/{id}/ficha` | Sí | Genera y **descarga** la ficha `.docx` |
| `GET`/`PUT` | `/observaciones/{id}/ficha-datos` | Sí | Lee/guarda la astrometría de la ficha |
| `GET` | `/viajes` | No | Lista viajes. `?mios=1`, `?base=`, `?observador=`, `?desde=`/`?hasta=` (`YYYY-MM-DD`), `?orden=objetos`. Cada uno trae `objetos[]`: su **ruta**, los objetos visitados en el orden en que se observaron |
| `GET` | `/viajes/de-la-noche?fecha=&hora=` | Sí | `{noche, viajes[]}`: los viajes que tengo esa noche (lista vacía si aún no hay ninguno). La **noche** la calcula el servidor |
| `POST` | `/viajes/de-la-noche` | Sí | Da de alta un viaje de esa noche **sin lugar**; el lugar se pone luego en su ficha |
| `GET` | `/viajes/{id}` | No | Un viaje con sus objetos, telescopios, oculares y tripulación |
| `PUT` | `/viajes/{id}` | Sí | Edita nombre, **lugar** (`baseId`, 0 = sin lugar), crónica, meteo, cielo, comienzo y fin *(solo el autor)*. La noche no se toca. Mudar el lugar muda con él sus observaciones, y devuelve `409` si esa noche ya tiene otro viaje desde ese sitio |
| `DELETE` | `/viajes/{id}` | Sí | Lo borra *(solo el autor, y solo si ya no le cuelga ninguna observación)* |
| `PUT` | `/viajes/{id}/tripulacion` | Sí | Sustituye la lista de acompañantes *(solo el autor)* |
| `POST` | `/importar-oal` | Sí | Importa un XML de Open Astronomy Log. `{xml, confirmar}`: sin `confirmar` devuelve la **vista previa** y no escribe nada. Entra siempre en la cuenta de la sesión |
| `GET` | `/objetos` | No | Lista los objetos del mapa |
| `POST` | `/objetos` | Sí | Registra un objeto por identificador (lo resuelve en SIMBAD y calcula su posición) |
| `GET` | `/resolver?q=M104` | No | Localiza un objeto en SIMBAD **sin guardarlo** (para el buscador del mapa) |
| `GET` | `/observadores` | No | Lista los observadores |
| `GET` | `/datos.js` | No | Emite `OBSERVADORES`/`OBJECTS`/`OBSERVACIONES`/`VIAJES` como JavaScript para el visor |
| `GET` | `/equipo/catalogo` | Sí | Catálogo global de telescopios/oculares/auxiliares/filtros |
| `GET` | `/equipo` | Sí | Equipo personal del usuario |
| `POST` | `/equipo/{telescopio\|ocular\|auxiliar\|filtro}` | Sí | Añade una pieza a su flota (del catálogo o a medida) |
| `PUT`/`DELETE` | `/equipo/{tipo}/{id}` | Sí | Edita/borra una pieza *(solo el dueño)* |

Las rutas de lectura pública (`/objetos` GET, `/resolver`, `/observadores`,
`/datos.js`) sirven datos que ya son públicos en el mapa. Las de escritura y las
de observaciones exigen sesión.

---

## Instalación en un WordPress vacío

### 1. Instalar el plugin

Crea una carpeta llamada `bitacora-registro` y mete dentro `bitacora-registro.php`,
los tres archivos que requiere (`bitacora-viaje.php`, `bitacora-oal.php` y
`bitacora-distancia.php`, sin los cuales el plugin no arranca) y la carpeta
`datos/` con los CSV del catálogo de equipo:

```
bitacora-registro/
├── bitacora-registro.php
├── bitacora-viaje.php
├── bitacora-oal.php
├── bitacora-distancia.php
└── datos/
    ├── telescopios.csv
    ├── oculares.csv
    ├── auxiliares.csv
    └── filtros.csv
```

> `filtros.csv` va separado por **tabuladores**, no por `;` como los otros tres:
> el texto de sus descripciones ya contiene `;`. El lector del plugin recibe el
> separador como parámetro, así que no hay que convertirlo.

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
bitacora-base.js
bitacora-base.css
bitacora-bases.js
bitacora-viajes.js
bitacora-astro.js
bitacora-equipo.js
bitacora-ficha.js
bitacora-importar-oal.js
plantilla-oal.html
```

> `plantilla-oal.html` no es código de la web: es el archivo que se descargan
> los compañeros desde la página de importar. Va aquí porque es lo que ya se
> sirve por FTP y así el enlace de descarga no depende de nada más.

Y, para el botón *Generar con el simulador*, los del simulador de ocular:
`bitacora-gaia-render.js`, `bitacora-gaia-color.js` y sus catálogos
(`galaxias-datos.js`, `globulares-datos.js`, `nebulosas-datos.js`,
`estrellas-carbono-datos.js`).

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

**Página de "Mis bases".** Igual, con `mis-bases-wordpress.html`: los lugares
desde los que observas (nombre, lat/lon, altitud, huso).

**Página de "Mis viajes".** Igual, con `mis-viajes-wordpress.html`: las sesiones
de observación. Si su ruta no es `/mis-viajes/`, ajusta el enlace que el
formulario de registro muestra cuando un viaje no tiene lugar.

**Página de "Importar observaciones".** Igual, con
`importar-oal-wordpress.html`: subir el XML que un compañero haya rellenado con
la plantilla. Requiere haber subido también `plantilla-oal.html` por FTP, que
es lo que descarga el botón de esa página.

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
3. En **Contenido**: selecciona todas esas páginas.
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
