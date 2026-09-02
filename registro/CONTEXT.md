# Contexto — Registro

Formularios de registro (`registro/*-wordpress.html`) y su lógica de sesión: observación, viaje, base, cielo, astrometría.

## Observación

**Acto de mirar UN objeto**: qué, quién, cuándo, con qué tubo (`{prefix}bitacora`). Unidad que se registra y se borra; todo lo demás cuelga de ella o la describe.

- **Un objeto, no una noche.** M42 y luego M43 son DOS observaciones. Lo común a la salida (lugar, cielo, crónica) no se repite: vive en el [[viaje interestelar]], apuntado por `viaje_id`.
- **Jerarquía observación → entrada → imagen.** Observación guarda identidad de lo mirado; cada **entrada** es lo visto A UN AUMENTO (ocular, campo real, pupila de salida, título, descripción), y cada entrada lleva sus **imágenes** (una principal, resto anexos). Cambiar de ocular añade entrada, no observación. `default_index` dice qué entrada abre la ficha del mapa.
- **Tres nociones de persona, distintas.** `observador` (texto: quién miró, puede ser invitado sin cuenta), `observador_id` (ficha en catálogo de observadores, la que usa el mapa para rotular) y `usuario_id` (cuenta de WordPress DUEÑA del registro, única que puede editar o borrar). Quien mira y quien escribe no tienen por qué coincidir.
- **«Mismo usuario + misma noche + mismo objeto» es LA MISMA observación.** Clave `oal_id`, que reimportar no duplica. Nace al importar OAL, pero vale para todas: una observación del formulario (sin `oal_id`) que case por noche y objeto se **adopta** —se le pone la clave y se actualiza—, así que el ciclo exportar → corregir → reimportar es un círculo y no un tobogán. El formulario sigue sin impedir teclear M42 dos veces la misma noche: la tabla no tiene más clave única que `id`, y la clave se gana al pasar por un XML, no al nacer.
- **La clave cuelga de la NOCHE, no del viaje.** Un objeto visto en dos salidas de la misma noche —dos bases distintas— la comparte, así que no se puede decidir cuál es cuál: se importa una sola vez, y al adoptar se rechaza por ambigua en vez de elegir. Ver [[viaje interestelar]].
- **Borrar no borra:** `borrada_en` marca la fila (papelera restaurable) y todas las consultas del mapa y del registro la filtran. Observación borrada no desaparece del histórico, deja de contar.
- **De dónde vino:** `origen` distingue `formulario` (normal), `oal` (importada) y `legacy` (migrada). No cambia el significado, solo las garantías.
- **Apunta a otras entradas del glosario:** objeto mirado tiene o debería tener su [[objeto del mapa]]; el sitio, su [[base]] (vía el viaje); alturas y azimuts calculados, su [[astrometría de la sesión]]. Campo `tipo` de aquí es TIPO DE LA OBSERVACIÓN (cómo se identificó el objeto: `messier`, `carbono`, `otro`), homónimo peligroso del tipo del objeto del mapa: ver aviso en [[clasificación de objeto del mapa]].

## Tramo de audio

**El trozo de un reportaje sonoro ajeno en que se habla del objeto de esta observación**: dónde está el audio, dónde empieza y dónde acaba. Cuelga de la [[observación]], no de la entrada: es de lo mirado, no de un ocular.

- **Episodio y tramo son cosas distintas.** El **episodio** es la obra entera de otro autor —su crónica, su podcast—: vive fuera, en sus canales, y el sitio ni la rehospeda ni la transcribe. El **tramo** es el recorte que corresponde a esta observación, y es lo único que se guarda aquí: el episodio se enlaza, el tramo se apunta.
- **Se guardan URLs, no identificadores de nadie.** La URL del MP3 y la URL de la página del episodio. Un identificador de un proveedor concreto metería ese proveedor dentro del modelo, y el segundo autor sonoro puede no tener ninguno; derivarlo del catálogo del autor al registrar es cosa de la captura, no del dato guardado.
- **Como mucho un tramo por observación**, así que vive en columnas de `{prefix}bitacora` y no en tabla hija. Lo rompería un objeto del que hablan dos episodios, pero solo si además es la misma noche y el mismo observador —si no, ya son dos observaciones con un tramo cada una—.
- **Inicio y fin en segundos enteros** desde el comienzo del MP3, que es lo que quiere el media fragment nativo (`#t=inicio,fin`). **Fin ausente = hasta el final del episodio**, que el estándar ya escribe `#t=inicio` sin más. **Fin menor o igual que el inicio es dato inválido** y se rechaza al guardar, en vez de guardarse y sonar al revés. Inicio 0 es legítimo: hay episodios que abren con el objeto.
- **Sin URL del MP3 no hay tramo**, aunque queden números sueltos en las otras columnas.
- **El borrado y la adopción salen gratis:** al ser columnas de la fila, `borrada_en` se las lleva y restaurar las devuelve; y la importación OAL solo escribe las columnas que construye del XML, así que reimportar una observación con tramo no lo pierde.
- **El tramo NO viaja en el XML.** Open Astronomy Log no tiene campo para esto e inventarlo sería ampliar el dialecto: es dato del sitio, no de la observación portable. Ver ADR 0003.
- **Función genérica, no un hueco para un invitado.** Cualquier observación puede llevar tramo; nada del modelo nombra a un autor concreto. Quién miró sigue siendo `observador`/`observador_id` de la [[observación]], y el mapa filtra por ahí.

## Base

**Sitio desde el que se observa**: nombre, latitud, longitud, altitud y huso horario IANA (`{prefix}bitacora_bases`). Convierte una dirección del cielo en algo visto a una altura y hora concretas, así que sin base no hay [[astrometría de la sesión]] —ni altura, ni azimut, ni crepúsculo—.

- **Es del observador, no del sistema:** cada usuario da de alta las suyas. `visibilidad` decide quién más la ve: `privada`, `seleccionada` (compartida con usuarios concretos, y compartir es SOLO LECTURA: elegirla y ver su salud) o `publica`.
- **Base es del [[viaje interestelar]], no de la observación:** se indica una vez por salida. Viaje sin base es legítimo y usa el sentinela `base_id = 0`, no `NULL`, porque con `NULL` la clave única de MySQL admitiría duplicados.
- **No confundir con el lugar de la crónica:** base es geometría (dónde está el observador en la Tierra); lo que se cuenta de la noche vive en el viaje.

## Viaje interestelar

**Sesión de observación**: salida de UN observador, UNA noche, desde UNA [[base]]. Todo objeto observado bajo esa terna cuelga del mismo viaje, y ahí viven los datos de la salida y no del objeto (lugar, crónica, meteo, cielo, comienzo y fin, tripulación). Se gestionan en **Mi bitácora** (`registro/mis-viajes-wordpress.html` + `bitacora-viajes.js` + `bitacora-listado.js`).

- **Fuente única de la identidad:** `bitacora-viaje.php` (puro, sin WordPress), `bitacora_viaje_noche(fecha, hora)` y `bitacora_viaje_clave(usuario, base, fecha, hora)`.
- **Convenio de mediodía:** la noche de una observación es la del día anterior si la hora es menor que las 12:00, igual que la fecha juliana cuenta desde el mediodía. Así el objeto de las 22:40 y el de las 02:15 caen en la misma salida. Cuenta va sobre el reloj de PARED de la base, así que el horario de verano no la mueve.
- **Telescopio NO entra en la identidad:** cambiar de tubo a media noche no parte la salida en dos. Convención de Open Astronomy Log, donde `scope` cuelga de la observación y la `session` se define por tiempo y sitio.
- **Lugar es del viaje, no de la observación:** se indica una vez para toda la noche, en la ficha del viaje. Viaje SIN lugar es legítimo (`base_id = 0`, el sentinela: con `NULL` la clave única de MySQL admitiría duplicados), y entonces el registro pregunta la base, único modo de seguir calculando alt/az. Regla en `BitacoraBase.lugarDeObservacion`, test `scripts/test_lugar_observacion.js`.
- **Lugar SUBE al viaje, y no vuelve a bajar:** la base contestada al registrar un objeto se escribe en el viaje, así que se pregunta una vez por salida y no una vez por objeto. En cuanto el viaje tiene lugar manda él: cambiarlo se hace en su ficha, no registrando un objeto —si no, el último objeto de la noche mudaría de sitio la salida entera—. Regla en `bitacora_viaje_base_efectiva` (`bitacora-viaje.php`), test `scripts/test_viaje_noche.php`.
- **Sesión obligatoria, lugar no:** sin viaje no se guarda observación; sin lugar sí, a cambio de quedarse sin altura ni azimut.
- **Cielo NO sube al viaje:** `cielo_sqm`/`cielo_ir`/`cielo_bortle` siguen siendo de cada observación, porque las condiciones cambian mientras se observa y el registro puede rellenarse antes de salir. El viaje las copia como **resumen** de la noche (primer valor no nulo), no como hogar único.
- **Selector de viaje al registrar:** el formulario pregunta al servidor qué viajes tiene esa noche (`avisoViaje` en `bitacora-base.js` + `/viajes/de-la-noche`, que responde una LISTA: una noche puede tener dos salidas desde sitios distintos). Si no tiene ninguno, ofrece darlo de alta sin lugar. Test: `scripts/test_aviso_viaje.js`.
- **La salida no se elige, se deduce:** manda la **ventana** de la salida (`comienzo`–`fin` de su ficha). Si fecha y hora de la observación caen dentro, es esa y **solo** esa —`bitacora_viajes_candidatos`, test `scripts/test_viaje_noche.php`—: nadie observa desde dos sitios a la vez, así que ofrecer además las otras de la noche sería preguntar algo ya sabido. La noche sola no llega: dice a qué salida pertenece un objeto, no cuál de las dos de esa noche estaba abierta a esa hora, y una salida que se alarga pasado el mediodía cae ya en la noche siguiente (por eso la consulta trae también las noches vecinas). Salida ajena que no contenga el instante NO se ofrece.
- **La ventana cruza el día, que es lo normal:** se lee con el convenio de mediodía invertido (`comienzo` < 12:00 = madrugada del día siguiente) y el fin va detrás del comienzo, así que un `fin` que no sea mayor significa que se pasó la medianoche: 22:00–03:00 son **dos días**. Ficha sin las dos horas no tiene ventana y vale solo por su noche, como siempre.
- **Dos ventanas que se pisan son ERROR, no elección:** el observador no pudo estar en las dos, así que salen las dos y el formulario lo canta en rojo pidiendo corregir sus horas en *Mis viajes*. La observación se queda sin viaje hasta entonces: colgarla de una sería inventarse cuál.
- **NUNCA hay selector:** el formulario no ofrece elegir la salida en ningún caso. Por eso el aviso va pegado a la fecha y la hora, lo único que la decide. En modo edición manda el `viaje_id` guardado, que es un hecho, no una deducción.
- **Se anuncia como lo que resuelve SIMBAD:** misma línea `.status` con su ✓ y su clase (`ok`/`info`/`err`), porque es la misma idea —«esto te lo hemos rellenado nosotros»—. El texto lo decide `BitacoraBase.mensajeViaje(estado,
  etiquetas)`, en texto plano (se pinta con `textContent`, así que el nombre de una salida no inyecta nada). Test: `scripts/test_aviso_viaje.js`.
- **Invariante:** la misma observación da siempre la misma clave, lo que hace relanzable el reparto histórico (backfill) sin duplicar viajes. Test: `scripts/test_viaje_noche.php`.
- **Viaje y observación son dos vistas de la MISMA página, no dos páginas.** «Mi bitácora» tiene tres pestañas —Viajes, Todas, Papelera— sobre una sola lista de observaciones, pedida una vez y repartida en el navegador: agrupar por salida es una FORMA DE VER lo mismo, no otra consulta. Fue al revés durante un tiempo (una página de viajes y otra de observaciones con una pestaña «Por viajes» que duplicaba a la primera), y volver a partirlas devuelve esa duplicación. Los objetos de una salida cuelgan plegados de su ficha; el buscador por nombre de objeto solo existe en la lista plana, y filtra en el navegador. Reparto y filtro son puros: `BitacoraListado.repartirPorViaje` / `.filtrarPorNombre`, test `scripts/test_listado_unificado.js`.
- **El desplegable de objetos va DEBAJO de la ficha del viaje, nunca envolviéndola.** La ficha lleva cinco botones (Ver en el mapa, Exportar, Correo, Editar, Borrar) y todo clic dentro de un `<summary>` pliega el `<details>`: envolver la ficha se los comería, y arreglarlo con `stopPropagation` rompe el teclado en cuanto alguien tabula. Así que el `<details>` es un hermano posterior de la ficha, que se queda exactamente como estaba.
- **La ruta en el mapa** (recorrido visual de un viaje) es concepto de `mapa/`: ver [[la ruta en el mapa]].

## Astrometría de la sesión

Altura y azimut que se registran de una observación: los del **objeto**, los del **Sol** y los de la **Luna**, calculados para una [[base]] (lat/lon/huso) y un instante de hora local con los algoritmos de Meeus.

- **Fuente única:** `resources/js/bitacora-astro.js`, global `window.BitacoraAstro` (+ `module.exports` para node), URL canónica en `/wp-content/uploads/bitacora/`.
- **Interfaz:** `posiciones({fechaHoraLocal, tz, lat, lon, ra, dec})` → `{utc, objeto:{alt,az}, sol:{alt,az}, luna:{alt,az}}`, o `null` si falta cualquier dato imprescindible (sin base, sin fecha, sin coordenadas): el llamador no valida nada más. `fechaHoraLocal` es hora de PARED en la base; el huso IANA la convierte a UTC sin librerías.
- **Consumidores:** formulario de registro (`bitacora-formulario.js`, que siembra la ficha al registrar) y formulario de datos de ficha (`bitacora-ficha.js`, que la recalcula al editarla).
- **Convención de refracción:** solo el **objeto** lleva refracción (Bennett), porque su altura describe lo que el observador vio. Sol y Luna salen **geométricos**, porque los umbrales de crepúsculo (−6°, −12°, −18°) se definen sobre la altura geométrica del centro del Sol.
- **Invariante:** la altura que guarda el registro y la que recalcula la ficha son el mismo número. Garantizado estructuralmente (fuente única), no por copiar y pegar: antes había dos copias byte a byte que YA habían divergido —el formulario refractaba Sol y Luna y la ficha no—, así que abrir la ficha cambiaba el dato guardado. Test `scripts/test_astro.js` fija el contrato contra invariantes físicos (polo celeste a la altura de la latitud, declinación solar en solsticio y equinoccio, convenio de azimut y husos con y sin horario de verano).

## Cielo de la sesión (SQM e IR)

Las dos medidas del cielo de una observación, con **escalas opuestas**, cada una con su tabla de bandas en `resources/js/bitacora-base.js`:

- **SQM** (mag/arcsec²): positivo y **sube** con la oscuridad. `claseBortlePorSqm`; el `sqm` de cada clase Bortle es el **mínimo** de su rango.
- **IR** (ºC): negativo y **baja** cuanto más transparente está el cielo. `transparenciaPorIr`; el `ir` de cada banda es su extremo **menos negativo**: `ir > −5` Pobre · `−15 < ir ≤ −5` Algo transparente · `−20 < ir ≤ −15` Mayoritariamente transparente · `−30 < ir ≤ −20` Transparente · `ir ≤ −30` Extremadamente transparente.
- **El SQM es DIRECCIONAL, no una propiedad de la noche:** se mide hacia la zona del cielo donde está el objeto, y un objeto bajo cae sobre un horizonte contaminado. Dos objetos de la misma noche tienen legítimamente SQM distintos: la discrepancia dentro de una salida es lo NORMAL, no una errata. Por eso el cielo es de la observación y no del [[viaje interestelar]] —y por eso «hacia dónde apuntaba el fotómetro» no necesita campo propio: es la altura y el azimut de esa observación, que ya calcula la [[astrometría de la sesión]]—.
- **El resumen del viaje es el PRIMER valor, no una media:** con SQM direccional eso es el del primer objeto que se registró, que no representa la noche. Vale como titular, no como dato. Cambiar el criterio es decisión aparte, aún sin tomar.
- **Invariante:** el valor que ofrece cada opción del desplegable tiene que volver a caer en su propia banda, o el `<select>` y el `<input>` se desincronizan solos.
- La comparación es distinta en las dos (`>=` en el SQM, `<=` en el IR) **a propósito**: usar la del SQM en el IR fue el fallo —un cielo de −3 salía «Algo transparente» cuando es Pobre—. Test: `scripts/test_cielo.js`.
