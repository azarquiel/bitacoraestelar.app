# Spec · Importar observaciones de los compañeros (OAL)

Modelo de datos de respaldo: [`spec-viajes.md`](spec-viajes.md) y
[`notas-modelo-sesiones.md`](notas-modelo-sesiones.md).
Vocabulario: el de `CONTEXT.md` (base, viaje, ficha, entrada, flota, observador).

---

## Problem Statement

Los compañeros observan más de lo que el portal sabe. Sus noches viven en
libretas, notas de voz y ficheros sueltos, y no hay ninguna vía para que entren
en la bitácora:

- Tecleárselas tú es inviable: una temporada son cientos de observaciones.
- Pedirles que se registren y rellenen el formulario objeto a objeto, con
  conexión y sesión abierta, tampoco funciona para recuperar años de atrás.
- Sin sus datos, la salud de una base la mide un solo observador, y las bases
  que se comparten (El Culebrín, el Observatorio Andaluz) tienen una gráfica
  con la mitad de los puntos que deberían.

Hay además un formato del gremio para esto —Open Astronomy Log— y un ejemplo
real en `mapa/datos/2026-08-05 23-25-24-OAL.xml`: 10 sitios, 6 telescopios,
42 sesiones, 286 observaciones. Ese fichero enseña dos cosas: que el formato
sirve, y que un OAL cualquiera llega incompleto (sus observaciones no
referencian a ninguna `<session>`, y sus `<result>` no llevan `xsi:type`).

## Solution

Dos piezas que se hablan por un contrato explícito:

1. **Una plantilla**: un único `.html` autocontenido que el compañero abre con
   doble clic, rellena y descarga como XML OAL. Sin instalar nada, sin cuenta,
   sin conexión obligatoria.
2. **Un importador**: un núcleo en el plugin que lee ese XML, lo casa con lo que
   ya existe (bases, equipo, observadores) y lo mete como observaciones, viajes
   y fichas del compañero.

El importador acepta **solo el XML que produce la plantilla**. No es un
importador OAL genérico; es el otro extremo de un contrato que controlamos
entero. Eso permite exigir lo que el estándar deja opcional (que cada
observación diga a qué noche pertenece) y añadir lo que el estándar no tiene
(SQM, IR, Bortle de la noche).

---

## La plantilla · `registro/plantilla-oal.html`

Un solo fichero: HTML, CSS y JS dentro, sin dependencias ni red obligatoria.
Se descarga desde la propia página de importación del sitio, para que siempre
repartan la última versión.

### Qué se rellena

| Bloque | Campos |
|---|---|
| Observador | nombre, apellidos, correo |
| Lugares | nombre, latitud, longitud, altitud, desfase horario |
| Equipo | telescopios (modelo, apertura, focal), oculares (modelo, focal, campo aparente), barlows/reductores (modelo, factor) |
| Noche | fecha, lugar, comienzo, fin, tripulación, SQM, IR, seeing, Bortle (por defecto de sus observaciones), meteo, crónica |
| Observación | noche a la que pertenece, objeto, hora, telescopio, ocular, barlow, aumentos, SQM, IR, seeing, Bortle, descripción |

Las observaciones **cuelgan siempre de una noche**. Lugar y equipo se heredan de
la noche y se pueden pisar en una observación concreta.

### Obligatorio para poder descargar

Observador · fecha y lugar de la noche · objeto y descripción de cada
observación. Todo lo demás avisa en amarillo pero no bloquea: recuperar una
libreta de 2019 no puede exigir la hora exacta ni el ocular.

### Resolución del objeto

Se escribe el nombre («M31», «NGC 6826», «Barnard 33») y el resolvedor Sesame
del CDS devuelve RA, Dec y tipo, que van al XML como `<position>` y `xsi:type`.
Es el mismo `resolutorNombre` que ya vive en `resources/js/bitacora-astro.js`.

Sin red, o si Sesame falla, el target sale solo con `<name>` y se resuelve al
importar. La plantilla lo dice en pantalla, no lo esconde.

### Horas

Se teclean en hora local. El XML emite ISO con desfase:
`2026-08-05T23:40:00+02:00`. La noche del viaje es la del **comienzo de la
sesión**, así que una observación de las 02:30 sigue perteneciendo al día 5.

### Guardar el trabajo

- `localStorage` autoguarda mientras escriben.
- Botón **Abrir XML**: recarga en el formulario un fichero ya descargado, para
  seguir otro día, desde otro ordenador, o para corregir tras un rechazo.
  Los identificadores se conservan, que es lo que hace que reimportar actualice
  en vez de duplicar.

### El XML que produce

```xml
<?xml version="1.0" encoding="UTF-8"?>
<oal:observations version="2.1"
    xmlns:oal="https://groups.google.com/group/openastronomylog"
    xmlns:bit="https://bitacoraestelar.es/oal-ext/1"
    xmlns:xsi="https://www.w3.org/2001/XMLSchema-instance"
    bit:plantilla="1.0">
  <sites>
    <site id="s1">
      <name>El Culebrín II</name>
      <longitude unit="deg">-6.20611111</longitude>
      <latitude unit="deg">38.06416667</latitude>
      <elevation>600</elevation>
      <timezone>60</timezone>
    </site>
  </sites>
  <scopes>
    <scope id="t1">
      <model>Skywatcher 12"</model>
      <aperture>305</aperture>
      <focalLength>1494.5</focalLength>
    </scope>
  </scopes>
  <eyepieces>
    <eyepiece id="o1">
      <model>Nagler Type 4 22mm</model>
      <focalLength>22</focalLength>
      <apparentFOV unit="deg">82</apparentFOV>
    </eyepiece>
  </eyepieces>
  <observers>
    <observer id="ob1">
      <firstName>Ángel</firstName>
      <lastName>L. Huelmo</lastName>
      <contact>correo@ejemplo.es</contact>
    </observer>
  </observers>
  <targets>
    <target id="tg1" xsi:type="oal:deepSkyGX">
      <datasource>Sesame/CDS</datasource>
      <name>M31</name>
      <position>
        <ra unit="deg">10.6847</ra>
        <dec unit="deg">41.2687</dec>
      </position>
    </target>
  </targets>
  <sessions>
    <session id="n1">
      <begin>2026-08-05T22:30:00+02:00</begin>
      <end>2026-08-06T03:00:00+02:00</end>
      <site>s1</site>
      <coObserver>ob2</coObserver>
      <weather>Despejado, algo de humedad al final</weather>
      <comments>Crónica de la noche…</comments>
    </session>
  </sessions>
  <observation id="obs1">
    <begin>2026-08-05T23:40:00+02:00</begin>
    <sky-quality unit="mags-per-squarearcsec">21.42</sky-quality>
    <seeing>3</seeing>
    <bit:ir>-18</bit:ir>
    <bit:bortle>4</bit:bortle>
    <session>n1</session>
    <site>s1</site>
    <observer>ob1</observer>
    <target>tg1</target>
    <scope>t1</scope>
    <eyepiece>o1</eyepiece>
    <result><description>Lo que vio a este aumento…</description></result>
    <magnification>67.9</magnification>
  </observation>
</oal:observations>
```

Dos desviaciones deliberadas del estándar, ambas asumidas:

- **`bit:ir` y `bit:bortle` dentro de `<observation>`.** OAL no tiene dónde
  guardar el IR ni el Bortle; el SQM y el seeing sí —`<sky-quality>` y
  `<seeing>`, en `observationType`— y ahí van. Un validador estricto rechazará
  los dos elementos `bit:` porque la secuencia del esquema está cerrada. Se
  acepta: parsear dos elementos es infinitamente más sólido que parsear una
  cadena de meteo.
- **`<session>` obligatoria en cada observación.** El estándar la deja en 0..1.
  Aquí es 1, porque la noche es la unidad del modelo.

El cielo cuelga de la **observación**, no de la noche: el SQM es direccional y
dos objetos de la misma noche tienen legítimamente cielos distintos
(`registro/docs/adr/0001-el-cielo-cuelga-de-la-observacion-en-el-xml.md`). El
importador **sigue leyendo la forma vieja** —`bit:sqm/ir/seeing/bortle` en
`<session>`, que es lo que traen los ficheros ya rellenados— y la reparte a las
observaciones de esa noche. Lee viejo, escribe nuevo: sin migración.

---

## El importador

Un núcleo, dos puertas:

```
bitacora_oal_importar( $xml, $usuario_id, $confirmar = false )
    -> array( 'resumen' => …, 'problemas' => …, 'aplicado' => bool )
```

- **REST del frontend**, junto a «Mis viajes»: cada compañero sube el suyo y va
  a su usuario (`usuario_id` = usuario actual). `permission_callback` de usuario
  identificado.
- **Panel del escritorio**, como el de las históricas: subes el fichero y eliges
  a qué usuario va. Con nonce.

Ambas llaman a la misma función. La lógica no se escribe dos veces.

### Dos pasos: previa y confirmación

La primera llamada no escribe nada. Devuelve:

- Recuentos: noches, observaciones, entradas.
- Qué se crearía: bases nuevas, telescopios y oculares nuevos, observadores
  nuevos.
- Qué se reaprovecha: bases y equipo que casan con lo existente.
- Qué ya está importado y se actualizaría.
- Filas con problema, con su línea y su motivo.

Se confirma y entra lo bueno. Una fila mala no aborta el fichero: un acento raro
no puede tumbar una temporada.

### Correspondencias

| XML | Bitácora | Regla |
|---|---|---|
| `<site>` | `bitacora_bases` | Entre las bases que ese usuario ve (suyas + compartidas): nombre normalizado (sin acentos ni mayúsculas); si no, coordenadas a ≤150 m; si no, base privada nueva suya. |
| `<scope>`, `<eyepiece>`, `<lens>` | telescopios / oculares / auxiliares | Modelo normalizado contra el catálogo global (`usuario_id NULL`) y su equipo personal; si no casa, equipo personal nuevo con las specs del XML. |
| `<observer>` | usuario WP (el que importa) | El bloque `<observer>` describe a quién firma; el dueño de los datos es `usuario_id`. |
| `<coObserver>` | `bitacora_viaje_tripulacion` | Casa con el catálogo de observadores por nombre normalizado; si no, lo crea. |
| `<session>` | `bitacora_viajes` | Clave `usuario_id + noche + base_id`. La noche es la del `begin`. |
| `<sky-quality>`, `<seeing>`, `bit:ir`, `bit:bortle` de la observación | `cielo_sqm`, `cielo_ir`, `seeing`, `cielo_bortle` de la **observación** | Lo que no traiga lo hereda de su noche (forma vieja). |
| — | los mismos campos del **viaje** | Resumen: el primer valor no nulo de la noche. Con un SQM direccional, el resumen es arbitrario por naturaleza. |
| `<observation>` | `bitacora_observaciones` | Las hermanas de la misma noche y mismo `<target>` se **fusionan en una**. |
| cada `<observation>` fusionada | `bitacora_entradas` | Una entrada por cada una, ordenadas por hora, con su aumento, ocular y descripción. |
| `<target>` | `objeto`, `objeto_etiqueta`, `tipo`, `num`, `ra`, `decl` | `M31` → `tipo='messier'`, `num=31`. Lo demás, `tipo='otro'`. |
| — | `bitacora_fichas` | Datos crudos: ra, dec, fecha local y UTC, lat, lon, SQM, IR, lugar. |

La fusión por noche+objeto es el corazón: en OAL una observación es un objeto
con **un** telescopio y **un** ocular; aquí una observación tiene varias
entradas. M13 a 78× y a 210× la misma noche es una ficha, no dos.

Altura, azimut, altura del Sol y de la Luna **no** se calculan al importar. Los
sigue calculando la página de la ficha con el Meeus de `bitacora-astro.js`: no
se porta astronomía a PHP ni se mantienen dos implementaciones.

### Reimportar

Columna nueva `oal_id varchar(64)` en `bitacora_observaciones`, añadida con
`bitacora_asegurar_columna` (el patrón que ya usa el plugin), única por usuario.
`origen = 'oal'`.

Mandan el XML corregido y ampliado: lo que ya existe **se actualiza**, lo nuevo
entra, nada se duplica. El XML manda.

**Consecuencia asumida:** una reimportación pisa lo que se hubiera editado en el
sitio después de importar. La previa lo dice antes de confirmar, con el número
de observaciones que se van a sobreescribir.

### Seguridad

No es negociable ni simplificable:

- El XML de fuera es entrada hostil. Se parsea con la carga de entidades
  externas desactivada (**XXE**) y sin red (`LIBXML_NONET`).
- Límite de tamaño del fichero, comprobado antes de parsear.
- REST: `permission_callback` de usuario identificado, nunca `__return_true`.
  Panel: nonce y capacidad de administrador.
- El usuario destino solo lo puede elegir el administrador. Desde el frontend,
  el destino es siempre el usuario de la sesión.
- Todo campo de texto pasa por `sanitize_text_field` / `wp_kses_post` según su
  destino, como el resto del plugin.

---

## Verificación

Dos comprobaciones ejecutables, del mismo estilo que las que ya hay en
`scripts/`:

- **`scripts/test_oal_plantilla.js`** — dado un estado del formulario, el XML
  generado tiene las noches, las observaciones y los desfases horarios
  esperados; una observación de madrugada queda en su noche; el ciclo
  descargar → abrir → descargar conserva los identificadores.
- **`scripts/test_oal_import.php`** — las correspondencias (base por nombre,
  base por coordenadas, base nueva, equipo casado, equipo nuevo), la fusión por
  noche+objeto, y que **importar el mismo XML dos veces no duplica nada**.

Fixtures: ficheros generados con la propia plantilla, no escritos a mano. Una
noche simple, una noche con el mismo objeto a dos aumentos, una con erratas.

## Plan de trabajo

1. **Plantilla** (`registro/plantilla-oal.html`) + `test_oal_plantilla.js` +
   los tres ficheros de ejemplo. Se puede repartir y probar con ellos de
   inmediato, mientras se escribe el importador.
2. **Importador**: núcleo + `oal_id` + previa, `test_oal_import.php`, panel del
   escritorio y REST del frontend con su página de subida y el enlace de
   descarga de la plantilla.

## Out of Scope

- **Imágenes.** Bocetos y fotos se suben después desde el sitio, que ya tiene la
  biblioteca de medios. Ni base64 en el XML ni carpeta aparte con nombres que
  casar.
- **XML de otras aplicaciones** (Observation Manager, KStars, DeepSkyLog,
  SkySafari). El parser se escribe legible, pero no se prueba contra ellas.
- **Exportar a OAL** desde la bitácora. Es la otra mitad del puente y merece su
  propio paso.
- Filtros OAL, y targets que no sean cielo profundo o estrella variable.
- Cuentas: se da por hecho que cada compañero ya tiene la suya en el sitio.
- Validar contra `oal21.xsd`. La extensión `bit:` lo impide por diseño.

## Further Notes

**Riesgo 1 · Sesame desde `file://`.** El resolvedor sirve
`Access-Control-Allow-Origin: *`, pero el origen de un fichero local es `null` y
algunos navegadores lo tratan aparte. Es lo primero que se prueba al empezar la
plantilla. Si falla, degrada a nombre suelto y la resolución se hace al importar
—que es de todas formas la red de seguridad para quien rellene sin conexión.

**Riesgo 2 · La regla de la noche.** Igual que en los viajes, es la única lógica
que, mal implementada, corrompe en silencio: las observaciones de madrugada
acabarían en el viaje del día siguiente y nadie lo notaría hasta tener cientos.
Por eso se prueba en los dos lados, en la plantilla y en el importador.

**Riesgo 3 · Bases duplicadas.** Si el emparejamiento de sitios falla, la salud
de una base compartida se parte en dos gráficas con la mitad de los puntos cada
una —justo el problema que este trabajo venía a resolver. De ahí que el
emparejamiento tenga dos criterios (nombre y cercanía) y que la previa enseñe
siempre qué bases se van a crear antes de confirmar.
