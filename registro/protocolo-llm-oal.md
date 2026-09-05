# Protocolo · De un correo o un PDF al `estado` de la plantilla

Este documento es dos cosas a la vez:

1. **El prompt** que se pega en un chat junto al correo o el PDF de un compañero.
   Desde «Instrucciones para el asistente» hasta el final, tal cual.
2. **La especificación del `estado`** que valida la caja de pegar de
   `plantilla-oal.html`. Las tablas de campos de aquí y el `ESQUEMA` del motor
   (bloque `<script id="motor">` de `plantilla-oal.html`, del que se extrae
   `bitacora-oal-motor.js`) son la misma lista; `scripts/test_oal_plantilla.js`
   falla si se separan.

El porqué está en el [ADR 0004](docs/adr/0004-el-llm-produce-datos-nunca-formato-ni-prosa.md):
el modelo produce **datos, nunca XML**. Un OAL correcto exige espacio de nombres
literal, secuencia ordenada, `xsi:type` de una enumeración cerrada e IDREFs que
casen, y un modelo generando eso falla donde no se ve y falla distinto cada vez.
El XML lo escribe el motor a partir del `estado`.

## Antes de pegar nada en un chat

**Pegar el correo de un compañero en un chat envía a un tercero su nombre, su
dirección de correo y las coordenadas de su casa** (la mayoría observa desde su
jardín o su azotea). Ese tercero es la empresa que sirve el modelo, con las
condiciones que tenga ese día. Quita del texto lo que no haga falta para la
bitácora antes de pegarlo, o pide permiso. Hoy esta herramienta la usa solo el
administrador del sitio; no se reparte.

## Cómo se usa

1. Copia desde «Instrucciones para el asistente» hasta el final de este fichero.
2. Pégalo en el chat, y debajo el correo, o adjunta el PDF.
3. Copia la respuesta entera (aunque traiga una frase delante, la caja la ignora).
4. En `plantilla-oal.html`, abre **«Pegar lo que ha leído un asistente»** y
   pulsa *Cargar en la plantilla*. Sustituye lo que hubiera en la plantilla;
   si había observaciones, pregunta antes.
5. Revisa los avisos amarillos: son los huecos que el texto no llenaba. Los
   rellena una persona, o se dejan.
6. Descarga el XML e impórtalo como cualquier otro.

## Cómo valida la caja

La caja **valida, no confía**:

- Lee con `JSON.parse`, nunca con `eval`. Recorta desde la primera `{` hasta la
  última `}`: la cortesía que el asistente pegue delante o detrás no estorba.
- Los campos que no están en las tablas se ignoran, y se avisa de cada uno.
- Un valor con el tipo equivocado (un texto donde iba un número, un objeto
  donde iba un valor) se deja en blanco y se avisa. No se lanza nada.
- Una referencia a un `id` que no existe (un ocular que no está en `oculares`)
  se deja en blanco y se avisa. Una observación cuya noche no existe se queda
  huérfana y la plantilla la marca en rojo hasta que alguien la cuelgue.
- Todo se pinta con `textContent`, como el resto de la plantilla.
- Lo que falte lo señala la plantilla en amarillo, igual que si se hubiera
  tecleado a mano.

---

## Instrucciones para el asistente

Vas a leer el relato de una o varias noches de observación astronómica (un
correo, un PDF, unas notas) y a devolver **únicamente un objeto JSON** con la
forma que se describe abajo. Nada de XML, nada de tablas, nada de prosa: el JSON
y ya.

### Reglas que no se negocian

1. **Lo que el texto no dice, se omite.** Deja el campo vacío (`""`). Ni el
   ocular «probable», ni la hora «aproximada», ni el SQM «típico de esa base»,
   ni el apellido que crees recordar. Un hueco lo señala la plantilla y lo
   rellena una persona; un dato inventado entra como verdad y ya no se
   distingue nunca.
2. **No resuelvas, no deduzcas, no calcules.** No pongas coordenadas ni tipo de
   objeto: los pone el servicio Sesame del CDS. No calcules aumentos: los
   calcula el código a partir de la focal del telescopio y la del ocular. No
   deduzcas el desfase horario de la fecha y el lugar: lo pone una persona. No
   conviertas unidades ni escalas. Copia el número tal y como está escrito; si
   el texto dice «unos 150 aumentos», eso lo escribió el observador y sí va en
   `aumentos`. Si no lo dice, `aumentos` se queda vacío.
3. **Una noche por fecha de anochecer.** Lo visto a las 02:15 pertenece a la
   noche anterior; la `fecha` de la noche es la del anochecer y la `hora` de la
   observación es la del reloj, tal cual (`"02:15"`). No cambies la fecha de la
   noche para «cuadrar» la madrugada.
4. **El mismo objeto a dos aumentos son dos observaciones** de la misma noche
   con el mismo `objeto` y distinto `ocularId`.
5. **El texto del observador se copia literal** en `texto` y `cronica`, con sus
   faltas y sus abreviaturas. No lo resumas, no lo corrijas, no lo traduzcas.
6. **Los `id` los inventas tú**, cortos y únicos dentro del JSON (`lu1`, `te1`,
   `oc1`, `au1`, `no1`, `ob1`…). Solo sirven para que una observación diga de qué
   noche cuelga y con qué equipo se hizo.
7. **Números como números** (`21.42`, no `"21,42"` ni `"21.42 mag"`). Textos
   como textos. Fechas `AAAA-MM-DD`, horas `HH:MM` en 24 horas.

### Forma del `estado`

Un objeto con siete claves. Las listas pueden ir vacías. Cualquier otra clave se
ignora.

```json
{
  "observador":    { "nombre": "", "apellidos": "", "correo": "" },
  "lugares":       [],
  "telescopios":   [],
  "oculares":      [],
  "auxiliares":    [],
  "noches":        [],
  "observaciones": []
}
```

### `observador`

Quien firma el relato. Un solo objeto, no una lista.

| Campo | Tipo | Qué es |
|---|---|---|
| `nombre` | texto | Nombre de pila. |
| `apellidos` | texto | Apellidos, si los escribe. |
| `correo` | texto | Su dirección, si está en el texto (no la del remitente si es otra persona). |

### `lugares`

Desde dónde observó. Uno por sitio distinto.

| Campo | Tipo | Qué es |
|---|---|---|
| `id` | texto | Identificador inventado (`lu1`). |
| `nombre` | texto | Cómo lo llama el observador («El Culebrín», «la azotea»). |
| `lat` | número | Latitud en grados decimales, **solo si el texto la da** en cifras. |
| `lon` | número | Longitud en grados decimales, este positivo, **solo si el texto la da**. |
| `altitud` | número | Metros sobre el mar, solo si lo dice. |
| `tz` | número | Desfase respecto a UTC en **minutos** (120 = España peninsular en verano), **solo si el texto lo dice explícitamente**. No lo deduzcas. |

### `telescopios`

| Campo | Tipo | Qué es |
|---|---|---|
| `id` | texto | Identificador inventado (`te1`). |
| `modelo` | texto | Como lo nombre el observador («Dobson 12"», «SW 80ED»). |
| `apertura` | número | Milímetros, solo si el texto los da en cifras. «12"» no son milímetros: déjalo vacío. |
| `focal` | número | Milímetros, solo si lo dice. |

### `oculares`

| Campo | Tipo | Qué es |
|---|---|---|
| `id` | texto | Identificador inventado (`oc1`). |
| `modelo` | texto | Como lo nombre («Nagler 22», «el de 7 mm»). |
| `focal` | número | Milímetros, solo si el texto los da. |
| `campo` | número | Campo aparente en grados, solo si lo dice. |

### `auxiliares`

Barlows y reductores.

| Campo | Tipo | Qué es |
|---|---|---|
| `id` | texto | Identificador inventado (`au1`). |
| `modelo` | texto | Como lo nombre («Barlow 2x»). |
| `factor` | número | Factor de multiplicación (2, 0.63), solo si lo dice. |

### `noches`

Una por fecha de anochecer y lugar.

| Campo | Tipo | Qué es |
|---|---|---|
| `id` | texto | Identificador inventado (`no1`). |
| `fecha` | texto | `AAAA-MM-DD` del **anochecer**. |
| `lugarId` | texto | `id` de un lugar de la lista `lugares`. |
| `comienzo` | texto | `HH:MM` local a la que empezó, si lo dice. |
| `fin` | texto | `HH:MM` local a la que acabó, si lo dice. |
| `tz` | número | Desfase en minutos de esa noche, **solo si el texto lo dice**. Normalmente vacío: manda el del lugar. |
| `tripulacion` | texto | Con quién observó, nombres separados por comas, tal como los escriba. |
| `sqm` | número | Lectura SQM en mag/arcsec², si dio una sola para toda la noche. |
| `ir` | número | Temperatura en °C, si la dice. |
| `seeing` | número | Seeing en escala 1-5 (Antoniadi), **solo si usa esa escala**. Si dice «seeing bueno», vacío. |
| `bortle` | número | Clase Bortle 1-9, solo si la dice. |
| `meteo` | texto | El tiempo, con sus palabras. |
| `cronica` | texto | Lo que cuente de la noche en general, literal. |

### `observaciones`

Una por objeto y aumento.

| Campo | Tipo | Qué es |
|---|---|---|
| `id` | texto | Identificador inventado (`ob1`). |
| `nocheId` | texto | `id` de la noche de la lista `noches`. |
| `objeto` | texto | Designación tal como la escribe (`M13`, `NGC 7000`, `Albireo`). No la normalices. |
| `observador` | texto | Solo si esa observación la firma otra persona que el observador principal. Normalmente vacío. |
| `ra` | número | **Déjalo vacío.** Lo pone Sesame. |
| `dec` | número | **Déjalo vacío.** Lo pone Sesame. |
| `otype` | texto | **Déjalo vacío.** Lo pone Sesame. |
| `hora` | texto | `HH:MM` del reloj, aunque sea de madrugada. |
| `telescopioId` | texto | `id` de `telescopios`, si el texto dice con cuál. |
| `ocularId` | texto | `id` de `oculares`, si el texto dice con cuál. |
| `auxiliarId` | texto | `id` de `auxiliares`, si dice que usó Barlow o reductor. |
| `aumentos` | número | **Solo si el observador escribe la cifra.** No la calcules. |
| `sqm` | número | SQM medido hacia ese objeto, si lo dice. Si solo dio uno para la noche, va en la noche, no aquí. |
| `ir` | número | Temperatura en esa observación, si la dice. |
| `seeing` | número | Seeing 1-5 en esa observación, solo si usa esa escala. |
| `bortle` | número | Bortle en esa observación, solo si lo dice. |
| `texto` | texto | Lo que vio, **literal**. |

### Ejemplo

Correo: «El sábado 5 de agosto estuvimos Víctor y yo en El Culebrín con el
Dobson de 12". Despejado, 21.42 en el SQM. M13 con el Nagler 22 a las 23:40:
un puño de estrellas. A las dos y cuarto lo volví a mirar con el 7 mm y se
resuelve entera. Ángel».

```json
{
  "observador": { "nombre": "Ángel", "apellidos": "", "correo": "" },
  "lugares": [{ "id": "lu1", "nombre": "El Culebrín", "lat": "", "lon": "", "altitud": "", "tz": "" }],
  "telescopios": [{ "id": "te1", "modelo": "Dobson de 12\"", "apertura": "", "focal": "" }],
  "oculares": [
    { "id": "oc1", "modelo": "Nagler 22", "focal": 22, "campo": "" },
    { "id": "oc2", "modelo": "7 mm", "focal": 7, "campo": "" }
  ],
  "auxiliares": [],
  "noches": [{ "id": "no1", "fecha": "2026-08-05", "lugarId": "lu1", "comienzo": "", "fin": "", "tz": "",
               "tripulacion": "Víctor", "sqm": 21.42, "ir": "", "seeing": "", "bortle": "",
               "meteo": "Despejado", "cronica": "" }],
  "observaciones": [
    { "id": "ob1", "nocheId": "no1", "objeto": "M13", "observador": "", "ra": "", "dec": "", "otype": "",
      "hora": "23:40", "telescopioId": "te1", "ocularId": "oc1", "auxiliarId": "", "aumentos": "",
      "sqm": "", "ir": "", "seeing": "", "bortle": "", "texto": "un puño de estrellas" },
    { "id": "ob2", "nocheId": "no1", "objeto": "M13", "observador": "", "ra": "", "dec": "", "otype": "",
      "hora": "02:15", "telescopioId": "te1", "ocularId": "oc2", "auxiliarId": "", "aumentos": "",
      "sqm": "", "ir": "", "seeing": "", "bortle": "", "texto": "se resuelve entera" }
  ]
}
```

Fíjate en lo que **no** está: ni la apertura en milímetros (el texto dice 12",
no 305), ni las coordenadas de El Culebrín, ni el desfase horario, ni los
aumentos, ni el apellido de Ángel. Y la observación de las 02:15 cuelga de la
noche del día 5 con su hora tal cual.

Devuelve solo el JSON.
