# Contexto de dominio — Bitácora Estelar

Glosario de términos del proyecto (ubicuo). Los módulos y su vocabulario de
arquitectura se nombran con estos términos.

El sitio en producción es **https://bitacoraestelar.app** (WordPress con el
plugin `resources/plugins/bitacora-registro`). Sus datos públicos se pueden
mirar sin sesión, que es la forma más rápida de comprobar qué ve el mapa de
verdad: `/wp-json/bitacora/v1/objetos` (catálogo del mapa),
`/wp-json/bitacora/v1/datos.js` (lo que carga el visor) y
`/wp-json/bitacora/v1/resolver?q=NGC+2022` (lo que resuelve el buscador).

## Modelo de color Gaia

El mapeo canónico **índice BP–RP → color RGB** de una estrella, anclado a los
códigos físicos de Harre & Heller (2021) / spec2col (espectro → CIE → XYZ →
sRGB), con corrección gamma sRGB parcial y el extremo rojo anclado a un espectro
de estrella de carbono (bandas C2 "Swan").

- **Fuente única:** `resources/js/bitacora-gaia-color.js`, global `window.BitacoraGaiaColor`.
- **Interfaz:** `colorPorBpRp(bprp)` → `[r,g,b]`; `claseEspectral(bprp)` → letra
  espectral (O·B·A·F·G·K·M); `bpRpPorTipo(tipo)` → el camino INVERSO, del tipo
  espectral del catálogo (`'K3II'`, `'B9.5'`, `'gM0'`) al índice BP–RP, para las
  estrellas de las que hay tipo pero no fotometría de Gaia; `config` → palanca
  mutable de gamma y saturación compartida por todos los consumidores.
- `bpRpPorTipo` NO es una segunda fuente de color: solo estima el BP–RP con el que
  preguntarle al modelo, así que una K3 del catálogo se pinta igual que una
  estrella de Gaia con ese mismo índice. Es una tabla de anclas interpolada, con
  corrección por clase de luminosidad en las clases frías; aproximación para
  pintar, no fotometría. Un tipo que no se entiende devuelve `null` (blanco), y
  «basura» no cuela como una B5.
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

Toda observación debería tener el suyo: lo asegura `bitacora_asegurar_objeto_mapa()`
al registrar, al editar y al importar un OAL. Como no bloquea el guardado (una
observación sin distancia se guarda igual, solo se avisa), pueden quedar objetos
huérfanos: observación sí, marcador no. Se rescatan con
`bitacora_objetos_backfill()`, el botón «Colocar en el mapa los objetos observados
que falten» del panel de administración. Síntoma del hueco: el buscador del mapa
SÍ encuentra el objeto —resuelve en SIMBAD al vuelo y dibuja un punto de mira—
pero no hay marcador. `scripts/test_oal_objeto_mapa.php` fija las dos vías.

## Distancia al Sol de un objeto

Lo que separa una dirección del cielo de un sitio en el mapa: sin distancia el
objeto no se puede pintar y la observación se queda guardada sin representación.
La **escalera de fuentes**, de la medida más directa a la más indirecta:

1. Las medidas publicadas de SIMBAD (`mesDistance`), por su **mediana**: las
   distancias de un mismo objeto se separan a veces por un factor 2 y una medida
   vieja y disparatada no debe arrastrar al resto.
2. La **paralaje** de SIMBAD (`basic.plx_value`), que viaja gratis en la misma
   consulta y está cuando las medidas no: es la que coloca a NGC 2022.
3. **VizieR** (`B/ocl`, cúmulos abiertos de Dias), por nombre de catálogo. Cubre
   la familia con más huecos en SIMBAD (M11, NGC 869, NGC 457 están allí y en
   `mesDistance` no).
4. El **Open Astronomy Catalog** (`api.astrocats.space`), el catálogo abierto de
   los transitorios: da la distancia de luminosidad en Mpc de supernovas y sus
   restos. Es quien coloca a **M1**, que responde como SN 1054.
5. **NED**, por **corrimiento al rojo**: una ESTIMACIÓN por la ley de Hubble, no
   una medida, y solo válida lejos (ver invariante).
6. La que escriba **a mano** el observador, único recurso para lo que ninguna
   base de datos sabe: las nebulosas difusas galácticas (NGC 2024 no tiene ni
   medida, ni paralaje, ni entrada en `B/ocl`, ni z).

- **Fuente única de la regla:** `bitacora-distancia.php`, puro y sin WordPress;
  las consultas de red viven en `bitacora-registro.php`, una por fuente y todas
  con caché de 30 días. Test `scripts/test_distancia_objeto.php`, que fija el
  parseo con las respuestas reales de cada servicio.
- **Una paralaje ≤ 0 no es una distancia:** el ruido de medida daría un valor
  negativo, que colocaría el objeto en el lado contrario del mapa.
- **La ley de Hubble no vale de cerca** (`BITACORA_Z_MIN_HUBBLE`, z = 0,01): la
  velocidad propia de una galaxia dentro de su grupo es del orden de la de
  expansión y se come la señal. M104 tiene z = 0,00363, que por Hubble da ~51
  millones de años luz cuando está a ~29. Por debajo del corte, NED se calla.
- **De NED sale el z, no su distancia:** sus distancias independientes del
  corrimiento al rojo (NED-D) no las publica ninguna API —solo la página web—, y
  su TAP (`NEDTAP.objdir`) expone cuántas hay (`n_dist`) pero no cuáles. Raspar
  HTML dentro del plugin no compensa.
- **El aviso tiene que llevar a algún sitio:** cuando no se puede situar, la
  observación se guarda igual y el formulario **pide la distancia** (contra
  `POST /objetos`, que resuelve solo coordenadas, tipo y color). Antes el aviso
  decía «indícala a mano» y no había ningún sitio donde escribirla.

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
  (`data-color`) de `mapa/mapa.html`; los de galaxia, con `HUBBLE_COLORS` de
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
- **`flotaPrimero(flota, catalogo)`** → una sola lista para el selector de
  **telescopios** del simulador: delante los **de Mi flota** (copiados con
  `esFlota:true`, sin tocar la respuesta de la API), detrás el **catálogo global**.
  Solo hay flota con sesión iniciada, que es de donde sale la diferencia entre lo
  que ve un visitante y un observador logueado. Oculares y auxiliares no pasan por
  aquí: salen del catálogo global tal cual.
- **Test:** `scripts/test_equipo.js` fija el contrato de los tres.

## Viaje interestelar

La **sesión de observación**: la salida de UN observador, UNA noche, desde UNA
[[base]]. Todo objeto observado bajo esa terna cuelga del mismo viaje, y ahí
viven los datos que son de la salida y no del objeto (lugar, crónica, meteo,
cielo, comienzo y fin, tripulación). Se gestionan en **Mis viajes**
(`registro/mis-viajes-wordpress.html` + `bitacora-viajes.js`).

- **Fuente única de la identidad:** `bitacora-viaje.php` (puro, sin WordPress),
  `bitacora_viaje_noche(fecha, hora)` y `bitacora_viaje_clave(usuario, base, fecha, hora)`.
- **Convenio de mediodía:** la noche de una observación es la del día anterior si
  la hora es menor que las 12:00, igual que la fecha juliana cuenta desde el
  mediodía. Así el objeto de las 22:40 y el de las 02:15 caen en la misma salida.
  La cuenta va sobre el reloj de PARED de la base, así que el horario de verano
  no la mueve.
- **El telescopio NO entra en la identidad:** cambiar de tubo a media noche no
  parte la salida en dos. Es la convención de Open Astronomy Log, donde `scope`
  cuelga de la observación y la `session` se define por tiempo y sitio.
- **El lugar es del viaje, no de la observación:** se indica una vez para toda
  la noche, en la ficha del viaje. Un viaje SIN lugar es legítimo (`base_id = 0`,
  el sentinela: con `NULL` la clave única de MySQL admitiría duplicados), y
  entonces el registro pregunta la base, que es lo único que permite seguir
  calculando alt/az. Regla en `BitacoraBase.lugarDeObservacion`, test
  `scripts/test_lugar_observacion.js`.
- **El lugar SUBE al viaje, y no vuelve a bajar:** la base que se conteste al
  registrar un objeto se escribe en el viaje, así que se pregunta una vez por
  salida y no una vez por objeto. En cuanto el viaje tiene lugar manda él:
  cambiarlo se hace en su ficha, no registrando un objeto —si no, el último
  objeto de la noche mudaría de sitio la salida entera—. Regla en
  `bitacora_viaje_base_efectiva` (`bitacora-viaje.php`), test
  `scripts/test_viaje_noche.php`.
- **La sesión es obligatoria, el lugar no:** sin viaje no se guarda una
  observación; sin lugar sí, a cambio de quedarse sin altura ni azimut.
- **El cielo NO sube al viaje:** `cielo_sqm`/`cielo_ir`/`cielo_bortle` siguen
  siendo de cada observación, porque las condiciones cambian mientras se observa
  y el registro puede rellenarse antes de salir. El viaje las copia como
  **resumen** de la noche (el primer valor no nulo), no como hogar único.
- **Selector de viaje al registrar:** el formulario le pregunta al servidor qué
  viajes tiene esa noche (`avisoViaje` en `bitacora-base.js` +
  `/viajes/de-la-noche`, que responde una LISTA: una noche puede tener dos
  salidas desde sitios distintos). Si no tiene ninguno, ofrece darlo de alta sin
  lugar. Test: `scripts/test_aviso_viaje.js`.
- **La salida no se elige, se deduce:** manda la **ventana** de la salida (el
  `comienzo`–`fin` de su ficha). Si la fecha y la hora de la observación caen
  dentro, es esa y **solo** esa —`bitacora_viajes_candidatos`, test
  `scripts/test_viaje_noche.php`—: nadie observa desde dos sitios a la vez, así
  que ofrecer además las otras de la noche sería preguntar algo que ya se sabe.
  La noche sola no llega: dice a qué salida pertenece un objeto, no cuál de las
  dos de esa noche estaba abierta a esa hora, y una salida que se alarga pasado
  el mediodía cae ya en la noche siguiente (por eso la consulta trae también las
  noches vecinas). Una salida ajena que no contenga el instante NO se ofrece.
- **La ventana cruza el día, que es lo normal:** se lee con el convenio de
  mediodía invertido (`comienzo` < 12:00 = madrugada del día siguiente) y el fin
  va detrás del comienzo, así que un `fin` que no sea mayor significa que se
  pasó la medianoche: 22:00–03:00 son **dos días**. Una ficha sin las dos horas
  no tiene ventana y vale solo por su noche, como siempre.
- **Dos ventanas que se pisan son un ERROR, no una elección:** el observador no
  pudo estar en las dos, así que salen las dos y el formulario lo canta en rojo
  pidiendo que se corrijan sus horas en *Mis viajes*. La observación se queda sin
  viaje hasta entonces: colgarla de una sería inventarse cuál.
- **NUNCA hay selector:** el formulario no ofrece elegir la salida en ningún
  caso. Por eso el aviso va pegado a la fecha y la hora, que son lo único que la
  decide. En modo edición manda el `viaje_id` guardado, que es un hecho, no una
  deducción.
- **Se anuncia como lo que resuelve SIMBAD:** misma línea `.status` con su ✓ y
  su clase (`ok`/`info`/`err`), porque es la misma idea —«esto te lo hemos
  rellenado nosotros»—. El texto lo decide `BitacoraBase.mensajeViaje(estado,
  etiquetas)`, en texto plano (se pinta con `textContent`, así que el nombre de
  una salida no inyecta nada). Test: `scripts/test_aviso_viaje.js`.
- **Invariante:** la misma observación da siempre la misma clave, que es lo que
  hace relanzable el reparto histórico (backfill) sin duplicar viajes.
  Test: `scripts/test_viaje_noche.php`.

### La ruta en el mapa

Un viaje se puede **recorrer** en el mapa interestelar: quedan solo sus objetos,
unidos por una línea dorada que va de uno a otro en el orden en que se
observaron. Módulo puro `mapa/js/via-lactea-viaje.js` (`window.VLViaje`), test
`scripts/test_viaje_mapa.js`.

- **El orden lo decide el SERVIDOR:** hora ascendente y, sin hora, al final por
  `id` —el mismo criterio con el que se listan las observaciones de una salida—.
  Así la ruta dibuja siempre la misma forma, y *Mis viajes* y el mapa cuentan el
  mismo recorrido. Nunca es aleatorio.
- **Los viajes viajan con los datos:** `bitacora_datos_js` emite `var VIAJES` con
  `{nombre, noche, observador, objetos}` y un `viaje` en cada observación. Es un
  payload **público**: la crónica, la meteo, el cielo y la base se quedan fuera.
- **Un viaje es de alguien:** el combo de viajes del mapa solo tiene contenido
  con un observador seleccionado; sin él dice «Seleccione un observador para ver
  sus viajes». Cambiar de observador termina el viaje en curso.
- **Tres tramos, uno por escala:** vecindario solar (`Sol → estrella…`), Vía
  Láctea (`Sol → M13 →…`) y Grupo Local (`Vía Láctea → M31 →…`). Cada capa
  dibuja el suyo con su proyección y su origen, porque el salto entre escalas ya
  lo hace el fundido del zoom; no hay una proyección común que inventar. Un viaje
  que cruza escalas se avisa, no se fuerza, y cada objeto cuenta en **una sola**
  escala: la estrella cercana está en el tramo de la galaxia y en el del
  vecindario, pero no cruza nada (`VLViaje.escalasDe`).
- **Una capa sin tramo se queda vacía, no llena:** «no hay viaje» y «hay viaje y
  no pasa por aquí» son cosas distintas (`null` frente a lista vacía). Si no se
  distinguen, el atlas del Grupo Local sigue enseñando todas las galaxias
  mientras el mapa solo enseña la ruta.
- **El viaje encuadra, no señala:** al arrancar, el mapa lleva la vista a la
  primera escala, pero sin el anillo ni el parpadeo del buscador. En un viaje
  ninguna escala está más marcada que las demás: lo que lo cuenta es la ruta.
- **El Sol siempre se ve:** de él parte la travesía. Los objetos de la ruta van
  siempre a todo color, aunque sean de otro observador: son escalas del viaje, no
  observaciones ajenas.
- **El objeto sin marcador no se dibuja ni se cuenta:** lo visitado que no está
  en `OBJECTS` desaparece en silencio de la ruta y del recuento del combo, o el
  rótulo prometería un objeto que el mapa no enseña. El viaje sigue siendo
  seleccionable.
- **El buscador se apaga durante el viaje:** navegar a otro objeto rompería el
  recorrido.
- **Enlace compartible:** `mapa.html?viaje=<id>` selecciona al dueño y recorre la
  ruta, por delante del arranque con las observaciones propias. El combo
  reescribe la URL (`replaceState`); un viaje que ya no existe avisa y arranca
  normal.
- **Una observación se identifica por su ÍNDICE en `OBSERVACIONES[objeto]`**, no
  por su observador: el mismo observador puede haber visitado el objeto en dos
  salidas y las dos tienen que poder abrirse. Es lo que lista «← Descubrir»,
  botón único que desde cualquier ficha lleva a las demás observaciones del
  objeto y solo aparece si las hay.

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

## Escala aparente del dibujo

Lo que el ojo ve en el ocular tiene dos escalas distintas, y confundirlas es un
fallo que se ve pero no se explica:

- **El cielo** (posiciones, separación de una doble, tamaño de una galaxia) va con
  el **campo real**: el lienzo cubre `campoReal = afov / aumentos` y las posiciones
  se proyectan con `SIZE / campoReal`.
- **El tamaño de una estrella** tiene dos términos, sumados en cuadratura por
  `BitacoraGaiaRender.radioEstrella({afov, apertura, arcmin, size})`:
  1. **El físico**, la imagen estelar de verdad: disco de Airy (`airyArcsec`/D =
     138″/D(mm), el criterio de Rayleigh) ⊕ seeing (`seeingArcsec`, FWHM, perilla del
     sitio), llevado a píxeles con la escala de placa del campo. Al ser ángulos de
     CIELO, el aumento los agranda —las estrellas engordan— y el Airy va como 1/D
     —más apertura, estrellas más apretadas—.
  2. **El suelo de visibilidad**, `radioSuelo · escalaEstrellas(afov)`, que existe
     porque la ventana tiene ~500 px para 72-100° de campo aparente: a aumentos
     normales la imagen estelar real cae muy por debajo del píxel (una mag 13 de M13
     a 133× son 0,23 px) y sin suelo el globular desaparece.

  A poco aumento manda el suelo; a mucho, la física. La cuadratura (y no un `max`)
  hace suave el paso de un régimen al otro.
- **El tamaño NO depende de la magnitud.** El disco lo fijan apertura, aumento y
  seeing: es el mismo para todas las estrellas del campo. El brillo lo cuentan la
  opacidad, el glow, los spikes y la curva de tono, que además ensancha los núcleos
  saturados. Que las brillantes se dibujen más gordas es convención de atlas, y era
  lo que se comía el hueco de los pares apretados: con el rango de tamaños por
  magnitud, Almaak sumaba 5,5 px de discos contra 4,5 px de hueco.
- El **glow** de las que no llegan a la magnitud límite se queda solo en el suelo
  aparente: representa estrellas que NO se resuelven, así que darles el tamaño físico
  de una resuelta sería contarlas dos veces.
- **Por qué 1/afov:** el lienzo se muestra a un diámetro ∝ `afov` (un ocular de 100°
  ocupa más ventana que uno de 50°: eso es tener más campo aparente). Lo que la
  ventana estira, la escala lo encoge, y en pantalla queda solo el aumento.
- **Invariante:** con el mismo aumento, cambiar de ocular no cambia ni el tamaño de
  las estrellas ni la separación de un par en pantalla; solo cuánto cielo se ve
  alrededor. Antes la escala usaba el campo real (`sqrt(90/arcmin)`, acotada a 2×):
  un Ethos de 6 mm y un AstroPhysics de 6 mm dibujaban la misma estrella 1,9×
  distinta, y el par se fundía con uno y se separaba con el otro.
  Test: `scripts/test_escala.js`.
- **Límite conocido:** la ventana deja de crecer en `AFOV_REF` (110°), así que por
  encima de ese campo aparente la compensación ya no es exacta. Es de la página, no
  de la ley.
- El **veredicto de desdoble** de una doble (`resolucionDoble`) no depende de nada de
  esto: es apertura (Dawes) y `aumentos · separación`. Un par de pocos segundos de
  arco cae por debajo del píxel en pantalla, así que en los pares justos el que dice
  si se resuelve es el veredicto, no la imagen.

## Par de una doble (completar lo que Gaia no trae)

Gaia DR3 **satura por arriba**: las primarias muy brillantes no están en el catálogo.
La de Almaak (γ And A, V 2,3 pero G ≈ 1,5 por ser una gigante K3 muy roja) no
aparece, así que el Canvas-2D dibujaba una sola estrella —la compañera, G 4,86—
mientras el veredicto decía «se resuelve». Los dos tenían razón: no hablaban del
mismo par.

- **Fuente única:** `BitacoraGaiaRender.parDoble(estrellas, {ra, dec, sep, mag1, mag2})`,
  pura, devuelve la lista con las componentes que faltaban (sin tocar la original).
- **Completa, no sustituye:** busca en un círculo de `1,5 · sep` las estrellas
  brillantes que el catálogo sí trae y sintetiza solo lo que falta, para conservar la
  posición y el **color** reales de las presentes. No es un problema general: Mizar
  (G 2,28 + 3,91), Achird (3,32 + 6,76) y 65 Psc (6,21 + 6,24) vienen completas y a
  esas no se les añade nada.
- **Solo el dibujo de estrellas.** Las capas difusas siguen recibiendo la muestra de
  Gaia tal cual, que es de donde sale su función de luminosidad.
- **Ángulo de posición:** del catálogo cuando lo hay (lo trae el WDS, 132 de 289),
  medido desde el Norte hacia el Este y de la A a la B; si el par se completa al
  revés —falta la primaria— el desplazamiento va a PA+180°. Sin PA se asume uno
  oblicuo (55°) para que el par no salga pegado a un eje: para el desdoble lo que
  importa es la separación, y la orientación en el ocular depende del montaje, que
  tampoco se modela.
- **Color:** del tipo espectral de cada componente con
  [[modelo de color Gaia]]`.bpRpPorTipo`, así que Albireo sale dorada + azul y no
  como dos puntos blancos. Sin tipo espectral (140 de 289), blanca.
- Las magnitudes del catálogo son **visuales** y se usan como si fueran G: el error es
  de unas décimas, más en las estrellas muy rojas.
- **Trampa:** `+null` es `0`, y como magnitud sería una estrella falsa deslumbrante;
  por eso los datos del catálogo entran por `numONulo`. Test:
  `scripts/test_par_doble.js`.

## Cielo de la sesión (SQM e IR)

Las dos medidas del cielo de una observación, con **escalas opuestas**, cada una con
su tabla de bandas en `resources/js/bitacora-base.js`:

- **SQM** (mag/arcsec²): positivo y **sube** con la oscuridad. `claseBortlePorSqm`;
  el `sqm` de cada clase Bortle es el **mínimo** de su rango.
- **IR** (ºC): negativo y **baja** cuanto más transparente está el cielo.
  `transparenciaPorIr`; el `ir` de cada banda es su extremo **menos negativo**:
  `ir > −5` Pobre · `−15 < ir ≤ −5` Algo transparente · `−20 < ir ≤ −15`
  Mayoritariamente transparente · `−30 < ir ≤ −20` Transparente · `ir ≤ −30`
  Extremadamente transparente.
- **Invariante:** el valor que ofrece cada opción del desplegable tiene que volver a
  caer en su propia banda, o el `<select>` y el `<input>` se desincronizan solos.
- La comparación es distinta en las dos (`>=` en el SQM, `<=` en el IR) **a
  propósito**: usar la del SQM en el IR fue el fallo —un cielo de −3 salía «Algo
  transparente» cuando es Pobre—. Test: `scripts/test_cielo.js`.

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
- **Consumidores:** el **simulador de oculares**, que conserva su orquestación
  (avisos, respaldo a `<img>` si el navegador bloquea los píxeles, superposición
  de Gaia), y el **formulario de registro**, que entra por `renderPlaca(canvas,
  opts)`: el gemelo fotográfico de `render()` —misma vista, misma fotometría—
  que pide las dos placas, las fusiona, las pinta y realza encima las estrellas
  brillantes de Gaia. La URL del proxy la arma `urlPlaca()`, fuente única de los
  dos (test: `scripts/test_url_placa.js`): las coordenadas van en sexagesimal
  llano porque el validador de `dss-proxy.php` no admite ni «h» ni «°», y el
  campo se acota a los 2° que el DSS sirve.
- **Por qué dos fuentes en el registro:** el catálogo dibujado gana en cúmulos y
  dobles; la placa gana en nebulosidad y, sobre todo, en las **nebulosas
  oscuras** (los Barnard), que son ausencia de estrellas sobre un fondo rico y
  un catálogo de puntos no puede contar. El observador elige en el modal y
  compara antes de decidir.
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

Escena 3D de las estrellas a ≤ `CONFIG.vecindario.distMaxAl` (1500 al) del Sol,
que aparece al hacer zoom máximo sobre el Sol en la vista cenital. Se puebla
desde los **objetos del mapa** que tengan coordenadas galácticas y esa distancia.

- **Selección pura:** `mapa/js/via-lactea-vecindario-catalogo.js`
  (`VLVecindarioCatalogo.estrellasVecindario(objects, distMaxAl)`): filtra por
  distancia, coordenadas y **que sea una estrella**, resuelve el `bp_rp` (color)
  y proyecta a XYZ con el Sol en el origen (`galToXYZ`). La capa
  `vecindario-solar.js` solo dibuja. Test: `scripts/test_vecindario_catalogo.js`.
- **Reparto de escalas:** una vista no repite lo que enseña la de al lado.
  `enVecindario(o, distMaxAl)` = `esEstrella(o)` + dentro del radio, y es la
  MISMA función que usa la vista de la galaxia para NO marcar esas estrellas
  (`EN_VECINDARIO` en `via-lactea-app.js`, que además desvía la búsqueda al
  vecindario). Por arriba, el atlas del Grupo Local ya se queda solo con lo
  extragaláctico. Así el espacio profundo cercano (Barnard 33, a 1.500 al) no se
  cuela entre las estrellas y la leyenda de clases espectrales dice la verdad.
- **`esEstrella(o)`:** el tipo del clasificador decide cuando es de espacio
  profundo (`globular`, `abierto`, `planetaria`, `emision`, `snr`, clases de
  Hubble) o estelar (`carbono`). El cajón `otro` mezcla estrella con «otype que
  SIMBAD no encajó» (Sirio y Barnard 33 son los dos `otro`), así que ahí decide el
  CATÁLOGO del nombre (`M`, `NGC`, `IC`, `B`, `Abell`… = espacio profundo). Cuando
  `bitacora_clasificar_objeto()` aprenda a devolver `estrella`, esa lista sobra.
- **Color:** cada estrella usa su índice **BP–RP** con el [[modelo de color Gaia]]
  compartido; por eso su color coincide con el del simulador de oculares. El
  objeto del mapa guarda `bp_rp` (columna nueva); lo resuelve el plugin al
  registrar (Gaia por ra/dec, mismo failover CDS→GAVO que el proxy) y lo emite
  `datos.js`. Sin `bp_rp`, la estrella sale con color neutro.
- **Tránsito con histéresis:** `fundidoVecindario(fov, cerca, dentro, cfg)` (mismo
  módulo puro) decide la opacidad de la capa. Para ENTRAR hacen falta el Sol
  centrado y un campo bajo `fovFinalAl`; una vez dentro, la escena se mantiene
  opaca hasta `fovSalidaAl` aunque el Sol se descentre, y el tope de zoom sigue
  elevado. Sin esa memoria, hacer zoom descentraba el Sol, la capa se apagaba de
  golpe y la galaxia (ya gigante) se mezclaba con la escena.
- **El campo manda sobre la distancia:** `fovFinalAl` debe ser ≳ 0,84 × `distMaxAl`,
  o la escena se vuelve opaca con las estrellas más lejanas ya fuera de cuadro.
- **Requisito de datos:** sin objetos a ≤ 1500 al, la escena avisa "aún no hay
  estrellas cercanas registradas" en vez de quedar muda con solo el Sol. Un
  botón del admin completa el `bp_rp` de los objetos cercanos ya registrados.
