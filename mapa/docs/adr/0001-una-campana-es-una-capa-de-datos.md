# 0001 · Una campaña es una capa de datos, no filas de `bitacora_objetos`

Fecha: 2026-09-07
Estado: aceptado

## Contexto

La web representa a exploradores que usan su flota para visitar objetos y
registrarlos. En ese vocabulario, un catálogo astronómico o una lista de
observación curada es una **campaña**: Campaña Messier, Campaña Caldwell,
Campaña RASC Finest. El explorador quiere elegir una y ver sobre el mapa
qué objetos lleva visitados y cuáles le faltan (épica #236).

La interfaz ya está: #233 separó el filtro del mapa en dos ejes —conjunto
(qué objetos entran) y estado (todo / explorados / por explorar)—
precisamente para que una campaña fuese *un valor más del eje conjunto*,
un `<optgroup>` y nada más. La regla vive en `VLObservadores`
(`setConjunto(ids|null)`, `setEstado`, `recuento`) y las tres vistas la
aplican sin lógica propia.

El problema es de datos. `OBJECTS` (`bitacora-registro.php:2591`) es la
tabla de objetos **registrados en la bitácora**, no un catálogo. El
Messier tiene 110 objetos; si la tripulación ha registrado 40, los otros
70 no existen como fila: no tienen `top`/`edge`, ni color, ni coordenadas
galácticas. El mapa no puede dibujar lo que no tiene posición, así que sin
sembrar esos datos «qué me falta del Messier» solo enseñaría lo que ya
está registrado, que es justo lo contrario de lo que se pide.

Había que decidir **dónde viven los objetos sembrados**.

## Decisión

**Una campaña es una capa de datos propia —un fichero generado que el mapa
fusiona con `OBJECTS` en el navegador— y no filas sin observación en
`{prefix}bitacora_objetos`.**

Cadena completa, calcada de la que ya usan las dobles y los demás
catálogos del repositorio (`scripts/gen_*.py` → CSV/JS en `mapa/datos/` →
JS estático que consume la vista):

```
mapa/datos/campanas/<id>.csv   →   scripts/gen_campanas.py   →   mapa/js/via-lactea-campanas.js   →   window.VL_CAMPANAS
```

Reglas que acompañan a la decisión:

- **Un solo concepto: campaña.** Messier es un catálogo histórico, RASC
  Finest una lista curada, Caldwell una lista disfrazada de catálogo; para
  el mapa las tres se comportan idéntico. Un campo `grupo` decide bajo qué
  `<optgroup>` sale la campaña y no gobierna nada más. Dos conceptos
  separados serían dos veces el mismo código para una diferencia que solo
  existe en la etiqueta.
- **Identidad: manda el slug de `OBJECTS`.** «M31» de la campaña y
  `ngc224` ya registrado son el mismo objeto y aparecen una sola vez. La
  campaña aporta pertenencia y rótulo; `OBJECTS` aporta la posición.
- **El emparejamiento se precalcula en el generador.** El slug de
  `OBJECTS` es determinista (`strtolower` sobre el nombre sin caracteres
  no alfanuméricos, `bitacora-registro.php:2637`), así que la
  correspondencia es función del nombre y no de la sesión: resolverla 110
  veces en cada carga del mapa daría siempre el mismo resultado y ataría
  `BitacoraBase.aliasMessier` a una vista que no lo necesita. Un objeto
  registrado *después* de generar la campaña sigue casando con el slug ya
  escrito, sin regenerar nada.
- **La posición la manda `OBJECTS`.** Un objeto registrado puede tener
  posición afinada con las coordenadas de la propia observación
  (`bitacora_completar_objeto` prefiere las dadas sobre las de SIMBAD); la
  campaña solo tiene lo genérico. Que un marcador saltara de sitio al
  cambiar de conjunto sería un fallo visible. El generador **avisa** de la
  discrepancia cuando pasa de 1° en (l, b) o del 20 % en distancia,
  indicando el valor que da SIMBAD, y no falla: un grado ya no es
  redondeo, es otro objeto o un alias mal resuelto, mientras que paralaje,
  redshift y medida manual difieren legítimamente en distancia.
- **El rótulo lo manda el conjunto activo, no la pertenencia.** Con la
  Campaña Messier activa el objeto se rotula «M31»; al salir vuelve a su
  nombre de `OBJECTS`. Con RASC Finest activa el mismo objeto se rotula
  por su designación NGC, que es como esa campaña lo nombra. Así un objeto
  no cambia de nombre para todo el mundo porque alguien añada un CSV.

## Alternativas descartadas

- **Sembrar filas en `{prefix}bitacora_objetos` sin observación
  asociada.** Es la opción barata en código: el emisor `datos.js`, la
  ficha, el buscador, la leyenda y las tres vistas ya funcionan sobre esas
  filas, y `bitacora_completar_objeto()` sabe rellenarlas. Se descarta
  porque rompe la vista por defecto: `estadoObservador` devuelve
  `'propia'` cuando no hay observador activo
  (`mapa/js/via-lactea-observadores.js`), de modo que los 110 objetos
  sembrados se pintarían a todo color para cualquier visitante que no haya
  elegido observador. Además borra una distinción que importa —«lo que
  alguien registró» frente a «lo que solo está en una lista»— y
  recuperarla obligaría a marcar el origen de cada fila y a filtrar por él
  en sitios que hoy no filtran nada. Y es cara de revertir: una vez
  sembradas, quitar esas filas toca la misma tabla donde viven los objetos
  de observaciones reales.
- **Servir las campañas desde el REST, junto a `datos.js`.** Las campañas
  no dependen de la sesión; meterlas ahí engorda cada carga del mapa
  aunque nadie seleccione una campaña.
- **Un fichero JS por campaña, cada uno con su `<script>` en
  `mapa.html`.** Añadir una campaña dejaría de ser un cambio de datos:
  tocaría el HTML y su cache-buster.
- **Leer los CSV en caliente desde el navegador.** El mapa consume JS
  estático desde `/bitacora-mapa/js/`; los CSV de `mapa/datos/` son fuente
  de generadores, no formato de entrega (así funciona ya `gen_dobles.py`,
  cuya salida consume `simulador_ocular/resources/js/bitacora-ocular.js`).

## Consecuencias

- **Añadir una campaña es dejar un CSV y ejecutar el generador**: ni un
  `<script>` nuevo, ni una línea de las vistas. El criterio de aceptación
  «añadir un catálogo es un cambio de datos» se cumple por construcción, y
  la Campaña RASC Finest NGC existe en la épica sobre todo para
  demostrarlo.
- **Sin campaña activa, el mapa es exactamente el de hoy.** Los objetos de
  campaña no entran en el conjunto general.
- **Aparece un caso visual nuevo**: un objeto que **nadie** ha visitado
  nunca, distinto del anillo hueco actual, que significa «lo visitaron
  otros, tú no». Necesita símbolo propio en las tres vistas.
- **La ficha de un objeto sin ninguna observación** se construye con lo
  que la campaña trae para dibujarlo. Qué campos de catálogo adicionales
  (magnitud, tamaño, constelación) merecen entrar queda sin decidir.
- **El volumen de marcadores sube.** El listón se mide contra el fotograma
  actual, sin regresión: si `refreshAnchors` se vuelve el cuello de
  botella con varias campañas, la salida conocida es llevar los marcadores
  de la galaxia a lienzo, como ya hacen el vecindario solar y el Grupo
  Local.
- Queda **reservado el término «misión»** para los retos puntuales del
  tipo «desdoblar Sirio». No se modela aquí; solo se aparta el nombre para
  que «campaña» no se lo trague.
