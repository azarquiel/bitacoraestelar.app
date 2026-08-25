# Spec · Exportar observaciones (OAL)

La otra mitad del puente de [`spec-importar-oal.md`](spec-importar-oal.md), que
la dejó fuera de alcance a propósito.
Decisiones: [ADR 0001](docs/adr/0001-el-cielo-cuelga-de-la-observacion-en-el-xml.md),
[0002](docs/adr/0002-la-identidad-se-adopta-al-importar.md),
[0003](docs/adr/0003-el-dialecto-oal-tiene-un-solo-escritor.md),
[0004](docs/adr/0004-el-llm-produce-datos-nunca-formato-ni-prosa.md).
Hechos medidos sobre el programa de destino: [`notas-oal-astroplanner.md`](notas-oal-astroplanner.md).
Vocabulario: el de `CONTEXT.md`.

---

## Problem Statement

La bitácora sabe leer y no sabe contar. Todo lo que entra se queda dentro, y eso
estorba en tres sitios distintos:

- **AstroPlanner.** Es donde se mantiene el registro personal desde 2010: 292
  observaciones, 43 sesiones, quince años. Tiene `File > Import > Open Astronomy
  Log (OAL)`, y lo que la bitácora acumula no puede subir por ahí.
- **Los correos.** Contar la salida del sábado al grupo se hace a mano,
  copiando de la pantalla lo que ya está guardado.
- **Los compañeros.** El gancho para que usen el portal es enseñarles sus
  propias observaciones ya registradas. Sin exportación no hay nada que
  enseñarles que se puedan llevar.

Y hay un cuarto, que no se ve hasta que se intenta: **el ciclo no cierra**. El
importador desduplica por `oal_id`, y una observación nacida en el formulario no
tiene ninguno. Exportar 300 observaciones, corregir una descripción y volver a
subirlas mete **300 duplicados**. Eso lo arregla el ADR 0002.

## Solution

Una pieza nueva y ninguna idea nueva: el servidor entrega el **`estado`** —el
mismo JSON que la plantilla maneja— y el motor que ya escribe OAL lo escribe.

```
   base de datos ──REST──> estado (JSON) ──xmlDe()──> XML OAL ──> descarga
                                        └──textoDe()──> correo HTML
```

El `estado` es la bisagra. Todo lo que sale del proyecto pasa por él, y lo que
lo convierte en formato es siempre el mismo código: el bloque
`<script id="motor">` de `plantilla-oal.html` (ADR 0003).

---

## Qué se exporta

**Dos puntas, ningún filtro:**

| Botón | Dónde | Para qué |
|---|---|---|
| **Exportar esta salida** | ficha del viaje, en *Mis viajes* | el correo del sábado, y el ciclo corregir → reimportar |
| **Exportar todo lo mío** | *Mis viajes* | sembrar AstroPlanner, y el respaldo |

Ni rango de fechas, ni por base, ni por objeto. Es la pantalla que se construye
por si acaso y se usa una vez; si algún día hacen falta «las de El Culebrín de
2024», se añaden entonces, sabiendo ya para qué.

**Solo lo referenciado.** Sitios, telescopios, oculares, auxiliares y
observadores se emiten únicamente si alguna observación exportada los usa. No es
estética: el diálogo de AstroPlanner pinta cada recurso del fichero como una
fila que hay que emparejar a mano, y volcar el catálogo entero lo llena de
ruido.

## El XML que se produce

El dialecto es el del ADR 0001, con las correcciones que el esquema exige y
AstroPlanner no impide:

```xml
<observation id="obs1">
  <observer>ob1</observer>
  <site>s1</site>
  <session>n1</session>
  <target>tg1</target>
  <begin>2026-08-05T23:40:00+02:00</begin>
  <sky-quality unit="mags-per-squarearcsec">21.42</sky-quality>
  <seeing>3</seeing>
  <scope>t1</scope>
  <eyepiece>o1</eyepiece>
  <magnification>67.9</magnification>
  <result xsi:type="oal:findingsDeepSkyType">
    <description>Lo que vio a este aumento…</description>
    <rating>99</rating>
  </result>
  <bit:ir>-18</bit:ir>
  <bit:bortle>4</bit:bortle>
</observation>
```

Reglas que lo gobiernan:

- **Orden de la secuencia del esquema**, no el nuestro ni el de AstroPlanner.
  `xsd:sequence` es ordenado y emitirlo bien no cuesta nada.
- **`xsi:type` y `<rating>99</rating>` en cada `<result>`.** `resultType` es
  abstracto y `rating` es obligatorio en `findingsDeepSkyType`; 99 es
  «desconocido», que es la verdad. AstroPlanner no los emite y los ignora.
- **`<session>` en cada observación, siempre.** El estándar la deja opcional y
  AstroPlanner no la escribe nunca —aunque su importador sí la lee—. La noche es
  la unidad del modelo: perderla es perder el concepto central de la bitácora.
- **`<name>` del target es la designación de catálogo** (`objeto`: `M31`,
  `NGC 6826`), nunca la etiqueta amable (`objeto_etiqueta`). AstroPlanner busca
  el objeto en sus catálogos instalados por esa cadena.
- **Instantes con desfase local** (`+02:00`), no en `Z`. La hora de pared de la
  base es la que decide la noche, y el desfase la conserva a la vista.
- **Espacios de nombres**: pendiente del experimento (ver *Riesgo 1*).

**Quién firma cada observación:** `observador_id` del catálogo si lo hay, si no
el texto `observador`, si no el dueño (`usuario_id`). Cada persona distinta se
declara una vez en `<observers>`; la tripulación del viaje va como
`<coObserver>` de la `<session>`, que es donde el estándar la pone.

**El `<contact>` se emite solo del usuario que exporta.** De los demás sale el
nombre y nada más. El fichero se manda por correo y se sube a un programa
ajeno: tener el correo de un compañero en el catálogo no es permiso para
repartirlo. Al reimportar no se pierde nadie, porque el emparejamiento de
observadores es por nombre normalizado.

**Una observación con varias entradas exporta varias `<observation>`** —en OAL
una observación es un objeto con un tubo y un ocular—, todas de la misma noche y
el mismo objeto. Al volver, el importador las funde otra vez en una. El atributo
`id` de cada elemento tiene que ser único dentro del fichero.

## Cerrar el ciclo

Lo del ADR 0002, en una línea: si el `oal_id` del XML no casa con nada, el
importador busca una observación **sin `oal_id`** del mismo usuario, misma noche
y mismo objeto, y la **adopta** en vez de crear otra. Si hay más de una
candidata —el objeto se vio en dos salidas de la misma noche— no se adopta
ninguna: sale como fila con problema en la previa.

Adoptar es sobrescribir. La previa las cuenta **aparte**: «N observaciones tuyas
del formulario van a quedar adoptadas y sobrescritas» no es el mismo aviso que
«N se actualizan».

**AstroPlanner no participa del ciclo.** Su ayuda es explícita: «You can only do
this once, since sessions and observations must be unique». Es una siembra de
una sola dirección y una sola vez, no el otro extremo de nada.

## El correo

`textoDe(estado)`, hermano de `xmlDe(estado)` en el mismo motor. HTML: cabecera
con fecha, base, cielo y tripulación, y una tabla de objetos con su hora, su
aumento y su descripción.

Determinista y sin prosa generada (ADR 0004). Sale del **mismo `estado`** que el
XML y desde el mismo sitio: el correo y el fichero que lo acompaña tienen que
contar lo mismo, y dos consultas distintas acaban dando dos números distintos.

## El protocolo del LLM

`registro/protocolo-llm-oal.md`, que es a la vez el prompt que se pega en un chat
junto al correo o el PDF, y la especificación del `estado` que valida la caja de
pegar. El modelo produce **datos, no formato**; las reglas y el porqué están en
el ADR 0004.

La caja de pegar vive en `plantilla-oal.html`, dentro de un `<details>` cerrado:
no estorba a quien solo va a rellenar el formulario, y está lista el día que se
reparta. Hoy la usa solo el administrador.

## Piezas

| Pieza | Dónde |
|---|---|
| Endpoint del `estado` | `GET /wp-json/bitacora/v1/estado-oal` (`?viaje=<id>` o todo) |
| Motor extraído | `registro/resources/js/bitacora-oal-motor.js`, extraído de la plantilla por script |
| `textoDe(estado)` | dentro del motor, junto a `xmlDe` |
| Botones | `mis-viajes-wordpress.html` + `bitacora-viajes.js` |
| Panel del escritorio | junto al de importar, con nonce y capacidad de administrador |
| Adopción | `bitacora_oal_importar`, donde hoy busca por `oal_id` |
| Caja de pegar | `plantilla-oal.html` |
| Protocolo | `registro/protocolo-llm-oal.md` |

### Seguridad

- **Desde el frontend, cada uno exporta lo suyo y solo lo suyo.** El usuario sale
  de la sesión, **nunca** de un parámetro: un endpoint de exportación que acepte
  un `usuario_id` cualquiera es una fuga de datos con forma de descarga.
  `permission_callback` de usuario identificado, jamás `__return_true`.
- **El panel del escritorio sí puede exportar el de otro**, con nonce y capacidad
  de administrador. Mismo reparto que ya tiene el importador.
- Las observaciones borradas (`borrada_en`) no se exportan.
- El `estado` se pinta con `textContent`, como todo lo demás: la crónica de una
  noche no inyecta nada.

## Verificación

- **`scripts/test_oal_exportar.js`** — el ciclo completo sin WordPress: un
  `estado` → `xmlDe` → `leer` → `estado`, idéntico. Que el cielo sale por
  observación y no por noche. Que solo se emiten los recursos referenciados. Que
  una observación de tres entradas produce tres `<observation>` con `id`
  distintos. Que el `<contact>` solo aparece una vez.
- **`scripts/test_oal_plantilla.js`** (ya existe) — añadir: el motor extraído y el
  incrustado son idénticos; la caja de pegar rechaza JSON con basura delante sin
  romperse.
- **`scripts/test_oal_import.php`** (ya existe) — añadir: adoptar una observación
  del formulario no duplica; dos candidatas no se adoptan y salen como problema;
  el cielo se lee tanto de `<sky-quality>` como del viejo `bit:sqm` de la sesión.
- **Prueba de campo**: el fichero de `Exportar todo lo mío` entra en AstroPlanner
  con todos los recursos emparejables y sin filas rojas irresolubles.

## Plan de trabajo

1. **Cielo a la observación** (ADR 0001): motor, plantilla y lector. Es lo que
   cambia el dialecto, así que va antes de que nada más lo escriba.
2. **Adopción** (ADR 0002) y su previa. Cierra el ciclo antes de que exista el
   camino que lo abre; hasta aquí no se ha exportado nada y ya no puede duplicar.
3. **Extracción del motor** y endpoint del `estado`.
4. **Exportar**: los dos botones, `textoDe`, el panel del escritorio.
5. **Protocolo del LLM** y caja de pegar.

## Out of Scope

- **Imágenes.** El importador ya las dejó fuera; exportarlas abre el problema que
  aquella decisión evitó.
- **Filtros de exportación** (fechas, base, objeto) y **targets que no sean cielo
  profundo o variables**. Un target sin clasificar sale con `<name>` y posición,
  sin `xsi:type` inventado.
- **Validar contra `oal21.xsd`.** La extensión `bit:` lo impide por diseño, igual
  que en el importador.
- **Prosa generada**, en el correo o donde sea (ADR 0004).
- **Exportar desde PHP puro** —cron, WP-CLI—: el escritor vive en el navegador
  (ADR 0003).
- **Cambiar el criterio del resumen de cielo del viaje**, que con SQM direccional
  es arbitrario. Anotado en `CONTEXT.md`, decisión aparte.
- **La salud de una base mezclando SQM de alturas distintas.** Deuda anterior, y
  del contexto `mapa/`.

## Further Notes

**Riesgo 1 · El espacio de nombres.** El esquema declara
`targetNamespace="http://groups.google.com/group/openastronomylog"`; la plantilla
y AstroPlanner emiten los dos `https://…`, y también `https://www.w3.org/2001/
XMLSchema-instance`, que no es el XSI de nadie. Un URI de espacio de nombres se
compara literal, así que es el **único** punto donde acercarse al esquema puede
romper al consumidor. Experimento pendiente: cambiar las dos `https://` de
`ejemplos-oal/noche-simple.xml` por `http://` e importarlo en AstroPlanner. Si lo
traga, se emite `http://` y el fichero vale además para Observation Manager o
DeepSkyLog. Si lo rechaza, se emite `https://` y queda escrito por qué emitimos
algo que el esquema no bendice.

**Riesgo 2 · La adopción pisa trabajo.** Es la regla «el XML manda» aplicada a
filas que nunca pasaron por un XML. Mal contada en la previa, un compañero
pierde ediciones sin enterarse. Por eso las adoptadas se cuentan aparte y con
otras palabras.

**Riesgo 3 · El motor duplicado.** El ADR 0003 pone la fuente única, pero la
extracción crea un segundo fichero en el repositorio. Si nadie comprueba que
coinciden, vuelve el fallo de la astrometría con otro disfraz. De ahí que la
igualdad se afirme en el test, no en la costumbre.
