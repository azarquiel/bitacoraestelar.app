# Contexto de dominio — Bitácora Estelar

Glosario de términos del proyecto (ubicuo). Módulos y vocabulario de arquitectura usan estos términos.

Producción: **https://bitacoraestelar.app** (WordPress con plugin `resources/plugins/bitacora-registro`). Datos públicos sin sesión — forma más rápida de ver qué ve el mapa de verdad: `/wp-json/bitacora/v1/objetos` (catálogo del mapa), `/wp-json/bitacora/v1/datos.js` (lo que carga el visor) y `/wp-json/bitacora/v1/resolver?q=NGC+2022` (lo que resuelve el buscador).

## Observación

**Acto de mirar UN objeto**: qué, quién, cuándo, con qué tubo (`{prefix}bitacora`). Unidad que se registra y se borra; todo lo demás cuelga de ella o la describe.

- **Un objeto, no una noche.** M42 y luego M43 son DOS observaciones. Lo común a la salida (lugar, cielo, crónica) no se repite: vive en el [[viaje interestelar]], apuntado por `viaje_id`.
- **Jerarquía observación → entrada → imagen.** Observación guarda identidad de lo mirado; cada **entrada** es lo visto A UN AUMENTO (ocular, campo real, pupila de salida, título, descripción), y cada entrada lleva sus **imágenes** (una principal, resto anexos). Cambiar de ocular añade entrada, no observación. `default_index` dice qué entrada abre la ficha del mapa.
- **Tres nociones de persona, distintas.** `observador` (texto: quién miró, puede ser invitado sin cuenta), `observador_id` (ficha en catálogo de observadores, la que usa el mapa para rotular) y `usuario_id` (cuenta de WordPress DUEÑA del registro, única que puede editar o borrar). Quien mira y quien escribe no tienen por qué coincidir.
- **Identidad asimétrica según por dónde entre — deuda, no diseño.** Al importar OAL, «mismo usuario + misma noche + mismo objeto» es LA MISMA observación: clave `oal_id` lo impone, reimportar no duplica. Por formulario no hay regla: tabla no tiene más clave única que `id`, así que registrar M42 dos veces la misma noche crea dos filas. Molestia del lado OAL: clave cuelga de la NOCHE, no del viaje, así que objeto visto en dos salidas de una misma noche se importa una sola vez.
- **Borrar no borra:** `borrada_en` marca la fila (papelera restaurable) y todas las consultas del mapa y del registro la filtran. Observación borrada no desaparece del histórico, deja de contar.
- **De dónde vino:** `origen` distingue `formulario` (normal), `oal` (importada) y `legacy` (migrada). No cambia el significado, solo las garantías.
- **Apunta a otras entradas del glosario:** objeto mirado tiene o debería tener su [[objeto del mapa]]; el sitio, su [[base]] (vía el viaje); alturas y azimuts calculados, su [[astrometría de la sesión]]. Campo `tipo` de aquí es TIPO DE LA OBSERVACIÓN (cómo se identificó el objeto: `messier`, `carbono`, `otro`), homónimo peligroso del tipo del objeto del mapa: ver aviso en [[clasificación de objeto del mapa]].

## Modelo de color Gaia

Mapeo canónico **índice BP–RP → color RGB** de una estrella, anclado a códigos físicos de Harre & Heller (2021) / spec2col (espectro → CIE → XYZ → sRGB), con corrección gamma sRGB parcial y extremo rojo anclado a espectro de estrella de carbono (bandas C2 "Swan").

- **Fuente única:** `resources/js/bitacora-gaia-color.js`, global `window.BitacoraGaiaColor`.
- **Interfaz:** `colorPorBpRp(bprp)` → `[r,g,b]`; `claseEspectral(bprp)` → letra espectral (O·B·A·F·G·K·M); `bpRpPorTipo(tipo)` → camino INVERSO, del tipo espectral del catálogo (`'K3II'`, `'B9.5'`, `'gM0'`) al índice BP–RP, para estrellas con tipo pero sin fotometría de Gaia; `config` → palanca mutable de gamma y saturación compartida por todos los consumidores.
- `bpRpPorTipo` NO es segunda fuente de color: solo estima el BP–RP con que preguntar al modelo, así que K3 del catálogo se pinta igual que estrella de Gaia con ese índice. Tabla de anclas interpolada, con corrección por clase de luminosidad en clases frías; aproximación para pintar, no fotometría. Tipo no entendido devuelve `null` (blanco), y «basura» no cuela como B5.
- **Consumidores:** **simulador de oculares** (`bitacora-ocular.js`) y **vecindario solar** del mapa (`vecindario-solar.js`), ambos desde la misma URL canónica `/wp-content/uploads/bitacora/bitacora-gaia-color.js`.
- **Invariante:** color de una estrella EXACTAMENTE igual en simulador y mapa. Garantizado estructuralmente (fuente única), no por copiar y pegar. Test dorado `scripts/test_gaia_color.js` fija el contrato.
- Realce de **estrella de carbono** NO pertenece al modelo: capa del simulador que ajusta el BP–RP efectivo antes de pedir el color canónico.

## Objeto del mapa

Entrada en tabla `{prefix}bitacora_objetos` que se pinta en el mapa de la Vía Láctea (slug, etiqueta, color, tipo, morfología, coordenadas galácticas, distancia). Objetos cercanos van al mapa MW; lejanos, a vista extragaláctica (grupo local).

Toda observación debería tener el suyo: lo asegura `bitacora_asegurar_objeto_mapa()` al registrar, editar e importar OAL. Como no bloquea el guardado (observación sin distancia se guarda igual, solo avisa), quedan objetos huérfanos: observación sí, marcador no. Se rescatan con `bitacora_objetos_backfill()`, botón «Colocar en el mapa los objetos observados que falten» del panel de administración. Síntoma del hueco: buscador del mapa SÍ encuentra el objeto —resuelve en SIMBAD al vuelo y dibuja punto de mira— pero no hay marcador. `scripts/test_oal_objeto_mapa.php` fija las dos vías.

## Distancia al Sol de un objeto

Lo que separa una dirección del cielo de un sitio en el mapa: sin distancia no se pinta y la observación queda guardada sin representación. **Escalera de fuentes**, de más directa a más indirecta:

1. Medidas publicadas de SIMBAD (`mesDistance`), por su **mediana**: distancias de un mismo objeto se separan a veces por factor 2 y una medida vieja y disparatada no debe arrastrar al resto.
2. **Paralaje** de SIMBAD (`basic.plx_value`), viaja gratis en la misma consulta y está cuando las medidas no: coloca a NGC 2022.
3. **VizieR** (`B/ocl`, cúmulos abiertos de Dias), por nombre de catálogo. Cubre la familia con más huecos en SIMBAD (M11, NGC 869, NGC 457 están allí y en `mesDistance` no).
4. **Open Astronomy Catalog** (`api.astrocats.space`), catálogo abierto de transitorios: distancia de luminosidad en Mpc de supernovas y sus restos. Coloca a **M1**, que responde como SN 1054.
5. **NED**, por **corrimiento al rojo**: ESTIMACIÓN por ley de Hubble, no medida, y solo válida lejos (ver invariante).
6. La que escriba **a mano** el observador, único recurso para lo que ninguna base de datos sabe: nebulosas difusas galácticas (NGC 2024 no tiene ni medida, ni paralaje, ni entrada en `B/ocl`, ni z).

- **Fuente única de la regla:** `bitacora-distancia.php`, puro y sin WordPress; consultas de red viven en `bitacora-registro.php`, una por fuente y todas con caché de 30 días. Test `scripts/test_distancia_objeto.php`, que fija el parseo con respuestas reales de cada servicio.
- **Paralaje ≤ 0 no es distancia:** ruido de medida daría valor negativo, que colocaría el objeto al lado contrario del mapa.
- **Ley de Hubble no vale de cerca** (`BITACORA_Z_MIN_HUBBLE`, z = 0,01): velocidad propia de una galaxia dentro de su grupo es del orden de la de expansión y se come la señal. M104 tiene z = 0,00363, que por Hubble da ~51 millones de años luz cuando está a ~29. Por debajo del corte, NED se calla.
- **De NED sale el z, no su distancia:** sus distancias independientes del corrimiento al rojo (NED-D) no las publica ninguna API —solo la web—, y su TAP (`NEDTAP.objdir`) expone cuántas hay (`n_dist`) pero no cuáles. Raspar HTML dentro del plugin no compensa.
- **El aviso tiene que llevar a algún sitio:** cuando no se puede situar, la observación se guarda igual y el formulario **pide la distancia** (contra `POST /objetos`, que resuelve solo coordenadas, tipo y color). Antes el aviso decía «indícala a mano» y no había dónde escribirla.

## Clasificación de objeto del mapa

Seam que decide **`tipo` + `color`** de un objeto a partir de su `otype` de SIMBAD, su morfología y el tipo declarado en la observación. Función única `bitacora_clasificar_objeto($otype, $morph, $tipo_obs)` en `bitacora-registro.php` (antes repartida entre `clase_hubble` + `color_por_clase` + un `if` de carbono incrustado, y el hueco entre «decidir tipo» y «decidir color» era el bug: cúmulos y estrellas de carbono caían en el default `#7ec8ff`, que en la leyenda es «Resto de supernova»).

Prioridad: tipo del registro → tabla de categorías MW por código otype (`C*` carbono, `GlC` globular, `OpC`/`Cl*` abierto, `PN` planetaria, `HII`/`EmO` emisión, `DNe`/`glb`/`CGb` oscura, `SNR` resto de supernova) → galaxia por clase de Hubble (para grupo local) → **`estrella`** si el otype es estelar → **`desconocido`** si no se pudo clasificar.

- **Nebulosa oscura no emite: TAPA.** Silueta de polvo sobre fondo rico en estrellas (Barnard 33, los Barnard, las LDN), por eso lleva el pardo del polvo y no uno de los brillantes del resto de la leyenda. Misma familia que en el simulador solo sabe contar la placa fotográfica y no el catálogo de puntos (ver [[cadena de la placa (luma → flujo)]]). Fuera a propósito `MoC` (nube molecular) y `Cld` (nube a secas): categorías de radio, no lo que se ve recortado en el ocular, y `Cld` es tan ancho que se tragaría objetos que no son esto. Un `MoC` cae en `desconocido`, que es la verdad.

- **«Es una estrella» y «no sé qué es» son hechos DISTINTOS.** Antes compartían cajón `otro` y color `#dfe7f5`, rotulado en leyenda «Estrella / otro»: término borroso impreso hasta el usuario. Sirio y Barnard 33 eran los dos `otro`, y los separaba un regex de prefijos de catálogo (`M`, `NGC`, `Abell`…) en la capa del vecindario, a 300 km del clasificador. Catálogo fuera de esa lista (`Gum`, `RCW`, `Ced`, `PGC`) colaba una nebulosa como estrella. `desconocido` NO es tipo de objeto: es ausencia de clasificación.
- **Estelar = el otype lleva `*`:** códigos estelares de SIMBAD lo llevan (`*`, `**`, `V*`, `PM*`, `WD*`, `RG*`, `EB*`, `Be*`, `WR*`…) y los de espacio profundo no (`PN`, `HII`, `SNR`, `GlC`, `G`, `DNe`, `GNe`, `Cld`). `C*` y `Cl*` ya los capturó la tabla antes de llegar aquí; única excepción a descontar es `As*` (asterismo), varias estrellas y no una. Una regla en vez de tabla de treinta códigos que siempre se queda corta.
- **Sin otype no se adivina:** objeto que SIMBAD no resolvió cae en `desconocido`, no en `estrella`. Abell 12 es el caso real —es planetaria y estaba en `otro` porque la consulta no devolvió `PN`, no por tener nada de estelar.
- **CUIDADO: `tipo` es homónimo, y aquí se cruzan dos sentidos.** La palabra nombra cosas distintas según la tabla: **tipo del objeto del mapa** (esta categoría: `globular`, `oscura`, `estrella`, `desconocido`, clases de Hubble), **tipo de la observación** (`bitacora.tipo`: cómo se identificó el objeto — `messier`, `carbono`, `otro`), **tipo de la imagen** de una entrada y **tipo de una doble** (`doble`/`triple`/`múltiple`). El `$tipo_obs` que recibe el clasificador es el de la OBSERVACIÓN, y se compara contra los nombres de las categorías del MAPA: funciona solo porque `carbono` es la única palabra que existe en ambos vocabularios. Acoplamiento por coincidencia de nombres, no por diseño: dar de alta un tipo de observación llamado como una categoría activaría un override silencioso. Antes de tocar un `tipo`, mira de qué tabla es.
- **Invariante:** colores del clasificador coinciden con la leyenda `#mw-legend` (`data-color`) de `mapa/mapa.html`; los de galaxia, con `HUBBLE_COLORS` de `grupo-local.js` y la leyenda `#mw-legend-hubble`. `estrella` y `desconocido` tienen **entrada propia y color propio** en la leyenda: si comparten color, el cajón sigue existiendo a ojos del observador aunque el modelo esté partido. Test `scripts/test_clasificacion_objeto.py` verifica mapeos y sincronía.
- **Default neutro:** otype desconocido NO reutiliza color de la leyenda, para no disfrazarse de otra categoría (raíz del bug).

## Equipo del observador (helpers puros)

Cálculos y rótulos puros del equipo, compartidos por **simulador de oculares** y **Mi flota**, sin DOM ni WordPress.

- **Fuente única:** `resources/js/bitacora-equipo.js`, global `window.BitacoraEquipo` (+ `module.exports` para node), URL canónica en `/wp-content/uploads/bitacora/`.
- **`focalEfectiva(focal, factor, extension)`** → focal del telescopio tras la **óptica auxiliar**: `factor` multiplica (Barlow > 1 alarga, reductor < 1 acorta, vacío = 1 neutro) y `extension_mm` suma milímetros fijos. Único punto por el que el auxiliar entra en el simulador; aumentos, pupila de salida, campo y magnitud límite heredan el cambio.
- **`nombreTelescopio(item)`** → rótulo del telescopio: **nombre** propio puesto en Mi flota, o `vendor + modelo` en su defecto. Mismo rótulo en lista de Mi flota y en selector del simulador.
- **`flotaPrimero(flota, catalogo)`** → una sola lista para el selector de **telescopios** del simulador: delante los **de Mi flota** (copiados con `esFlota:true`, sin tocar la respuesta de la API), detrás el **catálogo global**. Solo hay flota con sesión iniciada, de ahí la diferencia entre lo que ve un visitante y un observador logueado. Oculares y auxiliares no pasan por aquí: salen del catálogo global tal cual.
- **`rotuloNave(item)`** → cómo se presenta el telescopio en la **bitácora**: **medidas siempre** (`18" f/4.5`, apertura en pulgadas y relación focal, que es como se reconoce un tubo en el campo) y **delante su nombre propio si lo tiene** (`Excalibur · 18" f/4.5`). Relación focal sale de `f_ratio` y, si no viene, de `focal/apertura`. Sin medidas queda el nombre o `nombreTelescopio()`. Lo usa la ficha del mapa (ver `mapa/README.md`), que recibe las medidas del tubo en `OBSERVACIONES[].nave`.
- **Test:** `scripts/test_equipo.js` fija el contrato de los cuatro.

## Base

**Sitio desde el que se observa**: nombre, latitud, longitud, altitud y huso horario IANA (`{prefix}bitacora_bases`). Convierte una dirección del cielo en algo visto a una altura y hora concretas, así que sin base no hay [[astrometría de la sesión]] —ni altura, ni azimut, ni crepúsculo—.

- **Es del observador, no del sistema:** cada usuario da de alta las suyas. `visibilidad` decide quién más la ve: `privada`, `seleccionada` (compartida con usuarios concretos, y compartir es SOLO LECTURA: elegirla y ver su salud) o `publica`.
- **Base es del [[viaje interestelar]], no de la observación:** se indica una vez por salida. Viaje sin base es legítimo y usa el sentinela `base_id = 0`, no `NULL`, porque con `NULL` la clave única de MySQL admitiría duplicados.
- **No confundir con el lugar de la crónica:** base es geometría (dónde está el observador en la Tierra); lo que se cuenta de la noche vive en el viaje.

## Viaje interestelar

**Sesión de observación**: salida de UN observador, UNA noche, desde UNA [[base]]. Todo objeto observado bajo esa terna cuelga del mismo viaje, y ahí viven los datos de la salida y no del objeto (lugar, crónica, meteo, cielo, comienzo y fin, tripulación). Se gestionan en **Mis viajes** (`registro/mis-viajes-wordpress.html` + `bitacora-viajes.js`).

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

### La ruta en el mapa

Un viaje se puede **recorrer** en el mapa interestelar: quedan solo sus objetos, unidos por línea dorada que va de uno a otro en el orden en que se observaron. Módulo puro `mapa/js/via-lactea-viaje.js` (`window.VLViaje`), test `scripts/test_viaje_mapa.js`.

- **El orden lo decide el SERVIDOR:** hora ascendente y, sin hora, al final por `id` —mismo criterio con que se listan las observaciones de una salida—. Así la ruta dibuja siempre la misma forma, y *Mis viajes* y el mapa cuentan el mismo recorrido. Nunca aleatorio.
- **Los viajes viajan con los datos:** `bitacora_datos_js` emite `var VIAJES` con `{nombre, noche, observador, objetos}` y un `viaje` en cada observación. Payload **público**: crónica, meteo, cielo y base se quedan fuera.
- **Un viaje es de alguien:** el combo de viajes del mapa solo tiene contenido con observador seleccionado; sin él dice «Seleccione un observador para ver sus viajes». Cambiar de observador termina el viaje en curso.
- **Tres tramos, uno por escala:** vecindario solar (`Sol → estrella…`), Vía Láctea (`Sol → M13 →…`) y Grupo Local (`Vía Láctea → M31 →…`). Cada capa dibuja el suyo con su proyección y su origen, porque el salto entre escalas ya lo hace el fundido del zoom; no hay proyección común que inventar. Viaje que cruza escalas se avisa, no se fuerza, y cada objeto cuenta en **una sola** escala: la estrella cercana está en el tramo de la galaxia y en el del vecindario, pero no cruza nada (`VLViaje.escalasDe`).
- **Capa sin tramo se queda vacía, no llena:** «no hay viaje» y «hay viaje y no pasa por aquí» son cosas distintas (`null` frente a lista vacía). Si no se distinguen, el atlas del Grupo Local sigue enseñando todas las galaxias mientras el mapa solo enseña la ruta.
- **El viaje encuadra, no señala:** al arrancar, el mapa lleva la vista a la primera escala, pero sin anillo ni parpadeo del buscador. En un viaje ninguna escala está más marcada que las demás: lo que lo cuenta es la ruta.
- **El Sol siempre se ve:** de él parte la travesía. Los objetos de la ruta van siempre a todo color, aunque sean de otro observador: son escalas del viaje, no observaciones ajenas.
- **Objeto sin marcador no se dibuja ni se cuenta:** lo visitado que no está en `OBJECTS` desaparece en silencio de la ruta y del recuento del combo, o el rótulo prometería un objeto que el mapa no enseña. El viaje sigue siendo seleccionable.
- **El buscador se apaga durante el viaje:** navegar a otro objeto rompería el recorrido.
- **Enlace compartible:** `mapa.html?viaje=<id>` selecciona al dueño y recorre la ruta, por delante del arranque con las observaciones propias. El combo reescribe la URL (`replaceState`); un viaje que ya no existe avisa y arranca normal.
- **Una observación se identifica por su ÍNDICE en `OBSERVACIONES[objeto]`**, no por su observador: el mismo observador puede haber visitado el objeto en dos salidas y las dos tienen que poder abrirse. Es lo que lista «← Descubrir», botón único que desde cualquier ficha lleva a las demás observaciones del objeto y solo aparece si las hay. Esa lista va por **fecha**, de más reciente a más antigua («12 ago 2026 · Nave Excalibur · 18" f/4.5»: cuándo y con qué, no el nombre del viaje). Objeto con **más de una** observación no abre ninguna al pulsarlo: enseña esa lista para que el usuario elija (`VLViaje.hayQueElegir`).

## Astrometría de la sesión

Altura y azimut que se registran de una observación: los del **objeto**, los del **Sol** y los de la **Luna**, calculados para una [[base]] (lat/lon/huso) y un instante de hora local con los algoritmos de Meeus.

- **Fuente única:** `resources/js/bitacora-astro.js`, global `window.BitacoraAstro` (+ `module.exports` para node), URL canónica en `/wp-content/uploads/bitacora/`.
- **Interfaz:** `posiciones({fechaHoraLocal, tz, lat, lon, ra, dec})` → `{utc, objeto:{alt,az}, sol:{alt,az}, luna:{alt,az}}`, o `null` si falta cualquier dato imprescindible (sin base, sin fecha, sin coordenadas): el llamador no valida nada más. `fechaHoraLocal` es hora de PARED en la base; el huso IANA la convierte a UTC sin librerías.
- **Consumidores:** formulario de registro (`bitacora-formulario.js`, que siembra la ficha al registrar) y formulario de datos de ficha (`bitacora-ficha.js`, que la recalcula al editarla).
- **Convención de refracción:** solo el **objeto** lleva refracción (Bennett), porque su altura describe lo que el observador vio. Sol y Luna salen **geométricos**, porque los umbrales de crepúsculo (−6°, −12°, −18°) se definen sobre la altura geométrica del centro del Sol.
- **Invariante:** la altura que guarda el registro y la que recalcula la ficha son el mismo número. Garantizado estructuralmente (fuente única), no por copiar y pegar: antes había dos copias byte a byte que YA habían divergido —el formulario refractaba Sol y Luna y la ficha no—, así que abrir la ficha cambiaba el dato guardado. Test `scripts/test_astro.js` fija el contrato contra invariantes físicos (polo celeste a la altura de la latitud, declinación solar en solsticio y equinoccio, convenio de azimut y husos con y sin horario de verano).

## Escala aparente del dibujo

Lo que el ojo ve en el ocular tiene dos escalas distintas, y confundirlas es un fallo que se ve pero no se explica:

- **El cielo** (posiciones, separación de una doble, tamaño de una galaxia) va con el **campo real**: el lienzo cubre `campoReal = afov / aumentos` y las posiciones se proyectan con `SIZE / campoReal`.
- **El tamaño de una estrella** tiene dos términos, sumados en cuadratura por `BitacoraGaiaRender.radioEstrella({afov, apertura, arcmin, size})`:
  1. **El físico**, la imagen estelar de verdad: disco de Airy (`airyArcsec`/D = 138″/D(mm), criterio de Rayleigh) ⊕ seeing (`seeingArcsec`, FWHM, perilla del sitio), llevado a píxeles con la escala de placa del campo. Al ser ángulos de CIELO, el aumento los agranda —las estrellas engordan— y el Airy va como 1/D —más apertura, estrellas más apretadas—.
  2. **El suelo de visibilidad**, `radioSuelo · escalaEstrellas(afov)`, que existe porque la ventana tiene ~500 px para 72-100° de campo aparente: a aumentos normales la imagen estelar real cae muy por debajo del píxel (una mag 13 de M13 a 133× son 0,23 px) y sin suelo el globular desaparece.

  A poco aumento manda el suelo; a mucho, la física. La cuadratura (y no un `max`) hace suave el paso de un régimen al otro.
- **El tamaño NO depende de la magnitud.** El disco lo fijan apertura, aumento y seeing: mismo para todas las estrellas del campo. El brillo lo cuentan opacidad, glow, spikes y curva de tono, que además ensancha los núcleos saturados. Que las brillantes se dibujen más gordas es convención de atlas, y era lo que se comía el hueco de los pares apretados: con el rango de tamaños por magnitud, Almaak sumaba 5,5 px de discos contra 4,5 px de hueco.
- El **glow** de las que no llegan a la magnitud límite se queda solo en el suelo aparente: representa estrellas que NO se resuelven, así que darles el tamaño físico de una resuelta sería contarlas dos veces.
- **Por qué 1/afov:** el lienzo se muestra a un diámetro ∝ `afov` (un ocular de 100° ocupa más ventana que uno de 50°: eso es tener más campo aparente). Lo que la ventana estira, la escala lo encoge, y en pantalla queda solo el aumento.
- **Invariante:** con el mismo aumento, cambiar de ocular no cambia ni el tamaño de las estrellas ni la separación de un par en pantalla; solo cuánto cielo se ve alrededor. Antes la escala usaba el campo real (`sqrt(90/arcmin)`, acotada a 2×): un Ethos de 6 mm y un AstroPhysics de 6 mm dibujaban la misma estrella 1,9× distinta, y el par se fundía con uno y se separaba con el otro. Test: `scripts/test_escala.js`.
- **Límite conocido:** la ventana deja de crecer en `AFOV_REF` (110°), así que por encima de ese campo aparente la compensación ya no es exacta. Es de la página, no de la ley.
- El **veredicto de desdoble** de una doble (`resolucionDoble`, que vive en el simulador —`bitacora-ocular.js`—, no en el render) no depende de nada de esto: es apertura (Dawes) y `aumentos · separación`. Un par de pocos segundos de arco cae por debajo del píxel en pantalla, así que en los pares justos el que dice si se resuelve es el veredicto, no la imagen.

## Par de una doble (completar lo que Gaia no trae)

Gaia DR3 **satura por arriba**: las primarias muy brillantes no están en el catálogo. La de Almaak (γ And A, V 2,3 pero G ≈ 1,5 por ser gigante K3 muy roja) no aparece, así que el Canvas-2D dibujaba una sola estrella —la compañera, G 4,86— mientras el veredicto decía «se resuelve». Los dos tenían razón: no hablaban del mismo par.

- **Fuente única:** `BitacoraGaiaRender.parDoble(estrellas, {ra, dec, sep, mag1, mag2})`, pura, devuelve la lista con las componentes que faltaban (sin tocar la original).
- **Completa, no sustituye:** busca en círculo de `1,5 · sep` las estrellas brillantes que el catálogo sí trae y sintetiza solo lo que falta, para conservar la posición y el **color** reales de las presentes. No es problema general: Mizar (G 2,28 + 3,91), Achird (3,32 + 6,76) y 65 Psc (6,21 + 6,24) vienen completas y no se les añade nada.
- **Solo el dibujo de estrellas.** Las capas difusas siguen recibiendo la muestra de Gaia tal cual, de donde sale su función de luminosidad.
- **Ángulo de posición:** del catálogo cuando lo hay (lo trae el WDS, 132 de 289), medido desde el Norte hacia el Este y de la A a la B; si el par se completa al revés —falta la primaria— el desplazamiento va a PA+180°. Sin PA se asume uno oblicuo (55°) para que el par no salga pegado a un eje: para el desdoble lo que importa es la separación, y la orientación en el ocular depende del montaje, que tampoco se modela.
- **Color:** del tipo espectral de cada componente con [[modelo de color Gaia]]`.bpRpPorTipo`, así que Albireo sale dorada + azul y no como dos puntos blancos. Sin tipo espectral (140 de 289), blanca.
- Las magnitudes del catálogo son **visuales** y se usan como si fueran G: el error es de unas décimas, más en las estrellas muy rojas.
- **Trampa:** `+null` es `0`, y como magnitud sería una estrella falsa deslumbrante; por eso los datos del catálogo entran por `numONulo`. Test: `scripts/test_par_doble.js`.

## Cielo de la sesión (SQM e IR)

Las dos medidas del cielo de una observación, con **escalas opuestas**, cada una con su tabla de bandas en `resources/js/bitacora-base.js`:

- **SQM** (mag/arcsec²): positivo y **sube** con la oscuridad. `claseBortlePorSqm`; el `sqm` de cada clase Bortle es el **mínimo** de su rango.
- **IR** (ºC): negativo y **baja** cuanto más transparente está el cielo. `transparenciaPorIr`; el `ir` de cada banda es su extremo **menos negativo**: `ir > −5` Pobre · `−15 < ir ≤ −5` Algo transparente · `−20 < ir ≤ −15` Mayoritariamente transparente · `−30 < ir ≤ −20` Transparente · `ir ≤ −30` Extremadamente transparente.
- **Invariante:** el valor que ofrece cada opción del desplegable tiene que volver a caer en su propia banda, o el `<select>` y el `<input>` se desincronizan solos.
- La comparación es distinta en las dos (`>=` en el SQM, `<=` en el IR) **a propósito**: usar la del SQM en el IR fue el fallo —un cielo de −3 salía «Algo transparente» cuando es Pobre—. Test: `scripts/test_cielo.js`.

## Cadena de la placa (luma → flujo)

Cómo una placa fotográfica (DSS o PanSTARRS) se convierte en el **flujo de objeto por píxel** que come `pintarFot`. Es el otro motor que produce un `Fobj`, en paralelo a las capas difusas sintéticas del Canvas-2D.

- **Fuente única:** `resources/js/bitacora-gaia-render.js`, en tres pasos: `fusionarPlacas(profunda, corta)` (fusión HDR por mínimos cuadrados de la DSS2-red profunda con la DSS1 corta, que conserva los núcleos sin quemar), `repararNucleos(v, size)` = `rellenarNucleo(v, desenfocar(v,4,size))` (el agujero negro que PanSTARRS deja en el centro de una estrella brillante) y `flujoDePlaca(v, esHips)` (luma 0-255 → brillo superficial entre `SB_OBJ_MIN` y `SB_OBJ_MAX` → flujo).
- **Consumidores:** el **simulador de oculares**, que conserva su orquestación (avisos, respaldo a `<img>` si el navegador bloquea los píxeles, superposición de Gaia), y el **formulario de registro**, que entra por `renderPlaca(canvas,
  opts)`: el gemelo fotográfico de `render()` —misma vista, misma fotometría— que pide las dos placas, las fusiona, las pinta y realza encima las estrellas brillantes de Gaia. La URL del proxy la arma `urlPlaca()`, fuente única de los dos (test: `scripts/test_url_placa.js`): las coordenadas van en sexagesimal llano porque el validador de `dss-proxy.php` no admite ni «h» ni «°», y el campo se acota a los 2° que el DSS sirve.
- **Por qué dos fuentes en el registro:** el catálogo dibujado gana en cúmulos y dobles; la placa gana en nebulosidad y, sobre todo, en las **nebulosas oscuras** (los Barnard), que son ausencia de estrellas sobre fondo rico y un catálogo de puntos no puede contar. El observador elige en el modal y compara antes de decidir.
- **No es fotometría calibrada:** mapeo heurístico con parámetros puestos a ojo, y están para tocarlos. Lo que el test fija son los **invariantes**: más luma nunca es menos flujo, un píxel apagado no inventa luz (flujo 0), la escala es logarítmica en magnitudes, la fusión nunca oscurece lo que la placa profunda ya registró, y una fusión que no cuadra (pocos píxeles en común o pendiente no positiva) devuelve **la placa profunda tal cual** en vez de una recta inventada.
- **La regla se prueba aparte del desenfoque:** `rellenarNucleo` recibe el entorno ya calculado, porque lo que se comprueba es el umbral, no el kernel (filtro nativo del canvas, necesita DOM). Test: `scripts/test_placa.js`.

## Adquisición de Gaia por celdas

Vocabulario del estudio de la capa de adquisición y caché de Gaia DR3 para campo arbitrario (ver `especificacion_optimizacion_gaia.md` y ADR 0012). Nada de esto está implementado aún.

- **Celda:** unidad de caché espacial del cielo, independiente del telescopio, ocular, aumento y objeto observado. Identificada por `(catálogo, nivel, ipix)` HEALPix nested. La semántica «las N más brillantes» pertenece al **campo**, no a la celda: la celda solo contiene «todas las estrellas hasta su Gmax». _Evitar_: tesela, tile, región.
- **Profundidad monotónica:** el Gmax de una celda es **estado**, no parte de la clave: registra la profundidad más honda jamás pedida y solo crece (una re-consulta más honda reemplaza la entrada por su superconjunto). Evita la explosión `celda × magnitud`.
- **Histograma de profundidad:** cuenta acumulada de estrellas por escalón de magnitud (0,5 mag) de una región, obtenida sin ordenar. Sirve para elegir el Gmax mínimo que garantiza superconjunto de las 40 000 más brillantes: la corrección es estructural, no estadística.
- **Los tres regímenes de acceso:** **frío absoluto** (ninguna celda del campo en caché), **parcialmente caliente** (algunas) y **completamente caliente** (todas: coste ≈ reconstrucción local, sin red). Un coste de adquisición se juzga siempre diciendo en cuál de los tres se midió.
- **Reutilización:** fracción de filas de un campo servidas desde caché. No es propiedad del teselado: es propiedad del teselado **dado un patrón de acceso**, así que solo tiene sentido citada junto a su carga (observador de objetos, explorador libre o multiusuario).

## Caché LRU de los proxies

Política con la que los tres proxies del simulador (`gaia_proxy.php`, `dss-proxy.php` y `ps1-proxy.php`) acotan su caché en disco. Las respuestas que guardan son **inmutables** —Gaia DR3 es catálogo fijo y el DSS archivo fijo—, así que no caducan: lo único que acota el disco es la **expulsión por tamaño**, y la limpieza es **incremental** (como mucho una pasada cada 5 min y un número máximo de borrados por pasada, para no escanear el directorio en cada petición).

- **Fuente única:** `simulador_ocular/bitacora-cache-lru.php`. `cache_lru_seleccionar_evict(lista, total, max_bytes, lowwater, max_del)` decide qué cae (pura, no toca disco) y `cache_lru_limpieza({dir, patron, max_bytes,
  lowwater, max_del, cada, huerfano_ttl})` la ejecuta, más el barrido de `.lock` y `.tmp` huérfanos ya envejecidos.
- **Consumidores:** los tres proxies, cada uno con sus cifras (Gaia 500 MB y lowwater 0,90 sobre `*.json.gz`; DSS 150 MB y 0,80 sobre `*.gif`; PS1 150 MB y 0,80 sobre `*.fits`).
- **`ps1-proxy.php`** (capa de galaxias desde imagen real): entrega el parche de una galaxia **ya cosido** de sus skycells —resuelve los nombres, pide el mismo recorte a cada una y se queda con el primer píxel no NaN—, así que el navegador hace **una** petición por galaxia en vez de ocho. Clave `ra|dec|lado|salida|banda`: sin ocular ni aumento, porque el parche no depende del equipo. `wcs=1` obligatorio, y el nombre de skycell lo resuelve el servidor. Test: `scripts/test_ps1_proxy.php`.
- **Lo que NO es compartido:** la clave de caché, la ruta y el servido. Cada proxy sirve otra cosa (JSON con negociación gzip / GIF) y con sus propios cuerpos de error; unificarlo pediría más perillas de las que ahorra.
- **Test:** `scripts/test_cache_lru.php`, sobre directorio temporal de verdad. La limpieza —el patrón que acota qué se borra, el stamp que evita escanear en cada petición, el barrido de huérfanos— no la cubría ningún test antes; los de cada proxy solo comprobaban su copia de la selección.

## Resolvedor de objeto por nombre

Ciclo «el observador escribe un nombre → salen su RA y su Dec»: espera a que deje de teclear, no repite la misma consulta, no pisa las coordenadas escritas a mano y avisa del estado.

- **Fuente única:** `resources/js/bitacora-base.js`, `BitacoraBase.resolutorNombre({onResuelto, onEstado, puedeEscribir, espera})` → `{programar(nombre)}`. Sin DOM: cada pantalla cablea su input y escribe sus textos; el módulo solo emite `'buscando' | 'nada' | 'error'`.
- **Consumidores:** **simulador de oculares** (modo «Cualquier objeto») y **formulario de registro** (autocompletado de RA/Dec de objetos no-Messier).
- **Transporte único:** el resolvedor Sesame del CDS, directo desde el navegador (sirve `Access-Control-Allow-Origin: *`). No hay proxy ni sesión de por medio, y Sesame resuelve los alias por su cuenta («M3», «Messier 3», «NGC 6826», «Barnard 33»). El endpoint `/coordenadas` del plugin, que era el camino del formulario y exigía login, se ha eliminado por no tener consumidores.
- **No confundir con `/resolver`** (`bitacora_resolver_objeto`, público): eso es «nombre → [[objeto del mapa]]» con distancia, tipo y color, y lo usa el buscador del mapa. Otro concepto, otro módulo.
- **Tests:** `scripts/test_sesame.js` fija el parseo de la respuesta; `scripts/test_resolutor.js`, el ciclo (espera, deduplicado y guarda), con `fetch` de mentira y sin red.

## Transmisión y araña por tipo óptico

Dos tablas indexadas por la columna `Optics` del catálogo de equipo: la **transmisión** luminosa del tubo (refractor 0,9 · reflector 0,7 · catadióptrico 0,65–0,68, según Torres Lapasió) y si su secundario va sujeto por **araña** de brazos, que es lo que produce los *diffraction spikes*.

- **Fuente única:** `resources/js/bitacora-gaia-render.js`, expuestas como `transmisionOptica(optica)` → transmisión o `null`, y `opticaTieneArana(optica)` → bool.
- **Consumidores:** el propio render (spikes y magnitud límite) y el **simulador de oculares**, que antes tenía su propia copia de ambas tablas.
- Tipo no listado devuelve `null`: el valor por defecto (0,8) lo pone el llamador, que es quien sabe si además hay transmisión fijada a mano en el telescopio.

## Nombre del observador (mapa)

Resolución **clave → nombre legible** de un observador, sobre el catálogo `OBSERVADORES`. Vive en `VLObservadores` (`mapa/js/via-lactea-observadores.js`) como `nombreObservador(clave)` (clave desconocida → la propia clave; vacía → `''` para no pintar etiqueta). La ficha del mapa la usa para mostrar «Observación de {nombre}» de forma discreta, igual en el flujo normal y en el de descubrimiento. Test: `scripts/test_observadores.js`.

## Vecindario solar (estrellas cercanas)

Escena 3D de las estrellas a ≤ `CONFIG.vecindario.distMaxAl` (1500 al) del Sol, que aparece al hacer zoom máximo sobre el Sol en la vista cenital. Se puebla desde los **objetos del mapa** que tengan coordenadas galácticas y esa distancia.

- **Selección pura:** `mapa/js/via-lactea-vecindario-catalogo.js` (`VLVecindarioCatalogo.estrellasVecindario(objects, distMaxAl)`): filtra por distancia, coordenadas y **que sea una estrella**, resuelve el `bp_rp` (color) y proyecta a XYZ con el Sol en el origen (`galToXYZ`). La capa `vecindario-solar.js` solo dibuja. Test: `scripts/test_vecindario_catalogo.js`.
- **Reparto de escalas:** una vista no repite lo que enseña la de al lado. `enVecindario(o, distMaxAl)` = `esEstrella(o)` + dentro del radio, y es la MISMA función que usa la vista de la galaxia para NO marcar esas estrellas (`EN_VECINDARIO` en `via-lactea-app.js`, que además desvía la búsqueda al vecindario). Por arriba, el atlas del Grupo Local ya se queda solo con lo extragaláctico. Así el espacio profundo cercano (Barnard 33, a 1.500 al) no se cuela entre las estrellas y la leyenda de clases espectrales dice la verdad.
- **`esEstrella(o)` = `estrella` o `carbono`, y nada más.** Lo decide entero el [[clasificación de objeto del mapa]]: la capa del vecindario ya no adivina por el nombre. Un `desconocido` NO entra en la escena, aunque esté a tiro: pintarlo sería dar clase espectral y color de estrella a algo que nadie ha clasificado, justo lo que colaba nebulosas de catálogos raros entre las estrellas. Se queda en la vista de la galaxia, con su color propio, hasta que se sepa qué es.
- **Objeto viejo no se reclasifica solo:** los guardados como `otro` siguen fuera del vecindario hasta pasar por el backfill del panel de administración, que vuelve a preguntar el otype y reescribe `tipo` y `color`.
- **Color:** cada estrella usa su índice **BP–RP** con el [[modelo de color Gaia]] compartido; por eso su color coincide con el del simulador de oculares. El objeto del mapa guarda `bp_rp` (columna nueva); lo resuelve el plugin al registrar (Gaia por ra/dec, mismo failover CDS→GAVO que el proxy) y lo emite `datos.js`. Sin `bp_rp`, la estrella sale con color neutro.
- **Son DOS radios, y a propósito:** el vecindario enseña hasta `distMaxAl` (1500 al, cliente), pero el plugin resuelve el `bp_rp` hasta `BITACORA_BPRP_DIST_MAX_AL` (2000 al, servidor). La holgura evita que subir el radio de la escena deje sin color a las estrellas del borde, que ya lo tendrían guardado.
- **Tránsito con histéresis:** `fundidoVecindario(fov, cerca, dentro, cfg)` (mismo módulo puro) decide la opacidad de la capa. Para ENTRAR hacen falta Sol centrado y campo bajo `fovFinalAl`; una vez dentro, la escena se mantiene opaca hasta `fovSalidaAl` aunque el Sol se descentre, y el tope de zoom sigue elevado. Sin esa memoria, hacer zoom descentraba el Sol, la capa se apagaba de golpe y la galaxia (ya gigante) se mezclaba con la escena.
- **El campo manda sobre la distancia:** `fovFinalAl` debe ser ≳ 0,84 × `distMaxAl`, o la escena se vuelve opaca con las estrellas más lejanas ya fuera de cuadro.
- **Requisito de datos:** sin objetos a ≤ 1500 al, la escena avisa "aún no hay estrellas cercanas registradas" en vez de quedar muda con solo el Sol. Un botón del admin completa el `bp_rp` de los objetos cercanos ya registrados.

## Cadena fotométrica

Ley única con la que TODOS los motores del render deciden qué se ve: convierte el cielo de la sesión y la óptica en flujo de fondo, umbral de contraste y nivel de gris, y nada aguas abajo vuelve a aplicar la pupila de salida.

- **Umbral de contraste:** el contraste mínimo que un objeto extenso necesita para ser detectado. Depende de la luminancia que llega al ojo (vía pupila de salida y transmisión) y del **tamaño aparente** del objeto, que es por donde entran los aumentos.
- **H2c** es la ley vigente de ese umbral: área de Ricco con el seeing en cuadratura, **calibrada contra 12 observaciones visuales reales**. Es la capa de visión humana del proyecto entero, y está congelada: si un objeto no cuadra, el sospechoso es su modelo, no la ley. La ley histórica `C_MAG` sobrevive solo como regresión.
- **Es de detección, no de estructura.** Dice qué partes superan el umbral; no dice qué detalle se separa. Esa es otra ley y no deben mezclarse.

## Modelo de observación de cúmulos

Cadena que responde «¿qué distribución de estrellas produciría esta imagen tras pasar por este telescopio, esta atmósfera y este ojo?» para un cúmulo globular. Cinco capas —población estelar, resolución, imagen óptica, sistema visual, display—, cada una sin leer parámetros de las posteriores. Sustituye al **halo de King continuo**, que pintaba el perfil como mapa de iluminación y producía un disco difuso con borde.

- **Población estelar:** qué estrellas existen. Gaia es una **observación parcial** del cúmulo, no el cúmulo: la LF tabulada, la distancia y el enrojecimiento dicen qué hay además, y la **completitud** `f_compl(m, r)` cose las dos sin escalón. El perfil de King es la **PDF radial** por defecto, no un mapa de brillo.
- **Campo estadístico (SBF):** la luz de las estrellas que el sistema NO separa, tratada como media más fluctuación en vez de como estrellas dibujadas. Su brillo sale de `S1(m_lim)` (primer momento de la LF en flujo) y su granulado de `S2(m_lim)` (segundo momento). El corte no es duro: las estrellas de la **banda de transición** se dibujan con peso `a(m) < 1`, y el `(1−a)` que no se dibuja es campo, así que los momentos que usa el render son `S1campo = S1(m_res+δ) + ∫banda (1−a)dF` y `S2campo = S2(m_res+δ) + ∫banda (1−a)²dF²` (ADR 0011). El contraste del grano es consecuencia de la LF, nunca un parámetro. `S1` y `S2` son **continuas** en `m_lim`: la LF está tabulada en bins de 0,25 mag, pero el bin que el límite parte entra en la cola por la fracción que le toca. Devolver el bin entero las hacía funciones escalón mientras `m_res(r)` era continua, y eso son los anillos concéntricos de 47 Tuc (v7 E4). Se pinta como **lognormal** de esa media y esa varianza, no como gaussiana: donde hay menos de una estrella no resuelta por beam σ supera a ⟨I⟩ y una gaussiana recortada a I ≥ 0 se inventa el flujo que le falta. _Evitar_: paquete, halo, textura.
- **Frontera de resolución `m_res(r)`:** magnitud a la que una estrella deja de distinguirse como punto, **función del radio**: la misma estrella de m=16 puede ser resuelta a 8′ del centro y no resuelta a 0,5′. Es el mínimo entre el límite por confusión (`m_crowd`, geometría y conteos) y el límite por detección sobre el fondo local (`m_lim,sky`, que incluye el propio velo del cúmulo). _Evitar_: `magMin`, magnitud límite del cúmulo.
- **Banda de transición:** franja `m_res(r) ± Δ` donde la detección es probabilística. Esas estrellas se dibujan individualmente pero atenuadas, con la misma sigmoide de la [[cadena fotométrica]]; expresa «estrella parcialmente confundida» sin código especial.
- **Realización:** una muestra concreta de la población sintética, fijada por `seed = hash(cúmulo, versión de LF, realización)`. Cambiar telescopio, ocular, cielo o campo **no** cambia la realización: las mismas estrellas se ven mejor o peor. Dos realizaciones del mismo cúmulo son estadísticamente equivalentes y visualmente distintas.
- **Función de luminosidad:** tres tablas `Φ(M_V)` de isócronas PARSEC de 12 Gyr —metalicidad pobre, intermedia y rica—, interpoladas por el `[Fe/H]` del cúmulo (`resources/js/lf-globulares-datos.js`, regenerable). Fija a la vez el brillo del velo y el contraste del grano, así que **no hay ninguna perilla de textura**: si el grano sale mal, la sospechosa es la LF. `N_tot` es **derivado** de exigir que la LF integrada dé el `V_t` medido, nunca un parámetro ajustado.
- **Dos escalas angulares, una sola ley:** el umbral de contraste se pide **dos veces** al mismo H2c, con dos tamaños distintos —la mancha entera (`2·r_h·√(1−elip)`) para el velo, y para el grano su **escala de integración** `θ* = max(θ_beam, θ_R/M)`, la escala en la que el término de Ricco de `Cmin` vale 1—. Una textura no es un elemento aislado del tamaño del beam: es un campo aleatorio que el ojo integra sobre un parche, y promediar `n = (θ/θ_beam)²` celdas divide la amplitud juzgada por `√n` a la vez que baja el umbral. `θ*` es el máximo exacto de ese compromiso, sin barrido ni constante nueva (v8; antes se juzgaba en el beam). Solo afecta a la **detectabilidad**: `σ(r)` sale intacta a la tabla y lo pintado sigue siendo la física. Aun así el velo puede verse y su textura no: la textura se queda en el 12 % de su umbral con los equipos habituales y en el 15 % en el mejor caso de los 143 cúmulos del catálogo. No hay dos leyes ni una constante de granulado.
- **Iteración única:** `m_lim,sky` depende del fondo local, que incluye el velo, que depende de `m_lim,sky`. Se arranca por la cota superior (`m_crowd`, que no depende del cielo) y se cierra **una sola vez** con el fondo que ese arranque produce. Un punto fijo metería su criterio de parada dentro de la imagen.
- **El régimen es de aglomeración y seeing, no de difracción:** medido en M13 (`scripts/matriz_m13.js`), abrir la apertura mueve la **frontera** de resolución hacia el centro (1,86 → 0,99 r_h de 200 a 400 mm) pero **no vacía el núcleo**: dentro manda `m_crowd`, que solo mejora por la FWHM, y la FWHM la fija el seeing. Corolario: la textura SBF no llega nunca al umbral (0,5-3 % de lo que pide H2c), así que el «halo granular» que reporta el observador son las estrellas resueltas, no la fluctuación del campo.
- **Máscara difusa:** marca por píxel que dice «esta luz ya pasó su propio umbral de contraste, no se lo apliques otra vez», y de paso lleva el parámetro con que se realza. La escribe cada capa difusa que trae su propia ley (la de galaxias PS1 y la de cúmulos). Sin ella, dos umbrales sobre el mismo píxel lo dejan a nivel de cielo. _Evitar_: `galaxiaMask` (nombre antiguo, solo cubría una de las capas).
## Clase de un objeto difuso

Etiqueta explícita de catálogo (Type del OpenNGC: `PN`, `HII`, `SNR`, `RfN`…) que dice **qué filas entran** en la capa difusa de imagen real, no qué código corre. El modelo intrínseco del objeto no es código: **es la fila de catálogo** (r_e, b/a, PA, mag V, n, B/T), y el generador de cada catálogo responde de que esa fila sea fotometría honesta. Una galaxia y una nebulosa planetaria recorren el mismo pipeline de observación; abrir una clase nueva exige validarla, no ramificar el render (ADR 0013).

- **Borde real vs isofotal:** una galaxia se acaba donde su perfil cae bajo el ruido —su borde ES una isofota—, pero una planetaria tiene borde físico: la cáscara que trae el catálogo. La escena de protección y el tamaño intrínseco de la [[cadena fotométrica]] usan el borde real en las clases compactas y la isofota en el resto. Única divergencia por clase demostrada (M57: la isofota del ala exponencial cae 2,8 veces más lejos que la nebulosa).
- **v1 solo admite `PN`.** Las demás clases tienen fila generada pero puerta cerrada; si una clase necesita lo que una fila Sérsic no puede decir (filamentos, cáscara incompleta), la conversación es sobre el esquema del catálogo.
- _Evitar_: «tipo» a secas (colisiona con el tipo de la [[observación]] y con la [[clasificación de objeto del mapa]]); «sistema de nebulosas».
