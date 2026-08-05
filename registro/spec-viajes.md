# Spec · Viajes interestelares (sesiones de observación)

Investigación de respaldo: [`notas-modelo-sesiones.md`](notas-modelo-sesiones.md).
Vocabulario: el de `CONTEXT.md` (base, ficha, entrada, flota, observador).

---

## Problem Statement

El observador registra objeto a objeto, y el portal no sabe que ocho de esos
registros son la misma salida. Consecuencias que sufre hoy:

- El listado es una lista plana de objetos. Una noche entera bajo el mismo cielo
  aparece desperdigada entre observaciones de otras fechas, sin nada que las una.
- Los datos que son de **la noche** —SQM, IR, clase Bortle— se teclean una vez
  por cada objeto observado. Ocho objetos, ocho veces el mismo número, con ocho
  ocasiones de teclearlo distinto.
- No hay dónde escribir lo que pasó esa noche: con quién saliste, qué tiempo
  hacía, por qué el seeing era malo, la foto del grupo montando el telescopio.
  La bitácora guarda lo que se vio, pero no **la salida**.
- Con decenas de compañeros y centenares de sesiones cada uno, la lista plana
  deja de ser navegable: son decenas de miles de filas sin agrupar.

## Solution

Un **viaje interestelar**: la salida de observación de un observador, una noche,
desde una base. Todas las observaciones de esa noche cuelgan de él.

El viaje es una entidad con vida propia, no un simple agrupador: tiene nombre
("Viaje al Triángulo de Verano"), crónica, condiciones de cielo, tripulación e
imágenes. El portal lo crea solo al registrar —el observador no tiene que
acordarse de abrir la sesión— y luego puede bautizarlo y escribir su crónica.

El observador ve su bitácora como una lista de viajes; al abrir uno, los objetos
que cazó esa noche. Los datos de cielo se piden **una vez por viaje**, no una vez
por objeto.

## User Stories

### Registrar

> Las historias 1, 5 y 7 quedaron revisadas por «El lugar sube al viaje, y la
> sesión pasa a ser obligatoria» (5 de agosto de 2026): el viaje se **elige** al
> registrar en vez de deducirse de la base, y ya no hay observaciones sueltas.

1. Como observador, quiero que al registrar una observación el portal la asigne
   sola al viaje de esa noche y esa base, para no tener que crear ni elegir nada.
2. Como observador, quiero que si ya registré otro objeto esa misma noche desde
   la misma base, el nuevo registro caiga en el **mismo** viaje, para que la
   salida quede entera.
3. Como observador, quiero que una observación de las 02:00 pertenezca a la noche
   que empezó el día anterior, porque para mí fue la misma salida.
4. Como observador, quiero que cambiar de telescopio a media noche **no** parta mi
   salida en dos viajes, porque fue una sola noche.
5. Como observador, quiero que si registro una observación sin indicar base, se
   guarde igual aunque no quede agrupada en ningún viaje, para que nada me
   bloquee el registro.
6. Como observador, quiero que si registro sin hora, la observación caiga en el
   viaje de la fecha que puse, sin inventarse un desplazamiento de noche.
7. Como observador, quiero ver en el formulario a qué viaje va a ir lo que estoy
   registrando, para darme cuenta si me equivoqué de fecha o de base.
8. Como observador, quiero poder mover una observación a otro viaje, para
   corregir un registro mal fechado sin borrarlo.

### Ver y navegar

9. Como observador, quiero ver mi bitácora agrupada por viajes en vez de una
   lista plana de objetos, para reconocer mis salidas de un vistazo.
10. Como observador, quiero ver en cada viaje su noche, su base y cuántos objetos
    cacé, para elegir cuál abrir.
11. Como observador, quiero abrir un viaje y ver todos sus objetos ordenados por
    hora, para revivir la salida en el orden en que ocurrió.
12. Como observador, quiero ver en el viaje qué telescopios y oculares usé esa
    noche, aunque no definan el viaje, para recordar con qué lo vi.
13. Como observador, quiero seguir pudiendo ver la lista plana de observaciones
    cuando busco un objeto concreto, para no perder lo que ya sabía hacer.
14. Como observador, quiero que las observaciones antiguas, anteriores a esta
    funcionalidad, aparezcan ya repartidas en sus viajes, para no tener una
    bitácora partida en dos épocas.
15. Como visitante sin cuenta, quiero ver los viajes públicos del portal, para
    entender qué es esto antes de registrarme.

### El viaje como crónica

16. Como observador, quiero ponerle nombre a un viaje, para que mi bitácora se
    lea como un cuaderno de a bordo y no como un volcado.
17. Como observador, quiero escribir la crónica de la noche, para guardar lo que
    no cabe en la ficha de ningún objeto.
18. Como observador, quiero anotar el tiempo que hacía y el seeing, para saber
    después por qué aquella noche cundió o no.
19. Como observador, quiero registrar el SQM, el IR y la clase Bortle **una vez
    por viaje**, para no repetir el mismo dato en cada objeto.
20. Como observador, quiero que el SQM del viaje alimente la magnitud límite del
    simulador al generar la imagen de cualquiera de sus objetos, para que la
    simulación case con el cielo real de esa noche.
21. Como observador, quiero adjuntar imágenes al viaje (el grupo, el montaje, el
    horizonte), distintas de las de cada objeto, para ilustrar la salida.
22. Como observador, quiero anotar a qué hora empecé y a qué hora recogí, para
    tener la duración de la salida.

### Tripulación

23. Como observador, quiero apuntar con qué compañeros salí esa noche, para que
    la salida compartida conste.
24. Como observador, quiero que un compañero que también registró sus propias
    observaciones esa noche tenga **su** viaje, enlazado con el mío, para que
    cada uno sea dueño de lo suyo.
25. Como observador, quiero ver desde mi viaje los viajes hermanos de esa misma
    noche y base, para saltar a lo que vieron los demás.
26. Como compañero, quiero aparecer como tripulante aunque yo no registrara nada
    esa noche, para constar en la salida.

### Filtrar y buscar

27. Como observador, quiero filtrar mis viajes por base, para comparar qué tal se
    ve desde cada sitio.
28. Como observador, quiero filtrar mis viajes por rango de fechas, para
    recuperar una temporada concreta.
29. Como observador, quiero ordenar los viajes por número de objetos, para
    encontrar mis noches más productivas.
30. Como observador, quiero buscar un objeto y llegar desde él al viaje en el que
    lo vi, para reconstruir el contexto de esa observación.

### Base y salud del sitio

31. Como observador, quiero que la salud de una base cuente **noches** además de
    mediciones sueltas, para saber cuántas veces he salido de verdad allí.
32. Como observador, quiero ver la evolución del SQM de una base viaje a viaje,
    para detectar si el sitio se está degradando.

### Administración y datos

33. Como administrador, quiero que la migración cree los viajes de todo lo ya
    registrado sin perder ni una observación, para no tener que rehacer nada a
    mano.
34. Como administrador, quiero que la migración sea idempotente, para poder
    relanzarla si se corta a medias.
35. Como administrador, quiero que actualizar el plugin aplique los cambios de
    esquema aunque WordPress no dispare el hook de activación, para que la base
    de datos no se quede a medias.
36. Como administrador, quiero un número de versión de esquema en vez de una
    bandera por migración, para saber en qué estado está la base de datos.
37. Como observador, quiero que borrar (lógicamente) una observación no borre su
    viaje ni descuadre el recuento, para que la papelera siga funcionando.
38. Como observador, quiero que borrar un viaje vacío no arrastre observaciones,
    para que no haya borrados en cascada sorpresa.

## Implementation Decisions

### Identidad del viaje

**Un viaje = (observador, noche, base).** El telescopio queda **fuera** de la
identidad, en contra de la formulación inicial. Razón: en Open Astronomy Log —el
esquema abierto de bitácoras que implementan Observation Manager, Deep-Sky
Planner y KStars— el `sessionType` se define con `begin`/`end`/`site`/
`coObserver`, y el `scope` cuelga de la *observación*, no de la sesión. Meter el
telescopio en la clave parte la noche en dos viajes en cuanto cambias de tubo,
que es justo lo que la palabra "viaje" promete no hacer. El instrumento no se
pierde: ya vive en la observación y en la entrada.

Dos observadores en la misma base la misma noche generan **dos viajes**, uno de
cada uno, enlazados por la tabla de tripulación. Cada uno manda sobre el suyo.

### La noche

`noche = fecha(hora_local − 12h)`, con hora local **de la base**. Es el convenio
de mediodía de la fecha juliana (cuenta desde el mediodía medio de Greenwich), y
mete la madrugada en la noche que la engendró. Sin hora registrada, la noche es
la fecha tal cual, sin desplazar.

Se calcula en **PHP**, no en SQL: la conversión necesita la zona IANA de la base,
que vive en otra tabla, y MySQL prohíbe subconsultas y funciones no deterministas
en la expresión de una columna generada.

### Esquema

Tablas nuevas: `viajes` y `viaje_tripulacion`. Columna nueva `viaje_id` en la
observación, **nullable** (una observación sin base no tiene viaje; OAL también
declara su `session` opcional en la observación).

El viaje lleva: observador propietario, base, noche, nombre, comienzo y fin,
crónica, meteo, seeing y las condiciones de cielo (`cielo_sqm`, `cielo_ir`,
`cielo_bortle`). Clave única sobre (observador, noche, base) — con la salvedad de
que MySQL permite varios NULL en un índice único, así que una base sin registrar
no desduplica.

Índices que entran a la vez, porque arreglan consultas que **ya existen**: uno
compuesto de `(borrada_en, creado_en)` para el listado (hoy ordena por
`creado_en` con un índice de una sola columna que no lo cubre), uno de
`(base_id, borrada_en)` para la salud de la base, y `viaje_id`.

### Las condiciones de cielo se quedan en la observación

**Decisión del observador (5 de agosto de 2026), en contra de lo que proponía la
investigación:** `cielo_sqm`/`cielo_ir`/`cielo_bortle` **no** se retiran de la
observación. No son un dato redundante de la noche: las condiciones cambian
mientras se observa —entra bruma, sube la Luna, se despeja— y el registro puede
rellenarse antes de salir. Dos objetos de la misma noche pueden tener, con toda
razón, cielos distintos.

El viaje tiene sus propias columnas de cielo, pero como **resumen** de la salida,
no como hogar único del dato: se heredan del primer valor no nulo de sus
observaciones y el observador puede corregirlas. Nadie las borra de la
observación, y no hay fase 2.

### El lugar sube al viaje, y la sesión pasa a ser obligatoria

**Decisión del observador (5 de agosto de 2026), posterior al resto de la spec:**
el lugar es de la salida, no del objeto —se sale una noche desde un sitio, no se
cambia de sitio objeto a objeto—, así que el selector de base **sale del
formulario de registro** y pasa a la ficha del viaje, donde vale para toda la
noche. A cambio, elegir viaje al registrar es **obligatorio**: sin sesión no se
guarda una observación.

Consecuencias sobre lo escrito arriba:

- Un viaje **sin lugar** es legítimo (antes: «sin base no hay viaje»). Se
  identifica con `base_id = 0`, no con `NULL`, porque la clave única de MySQL
  admite varios NULL y cada guardado abriría un viaje nuevo para la misma noche.
  La columna pasa a `NOT NULL DEFAULT 0`, y el backfill deja de saltarse las
  observaciones sin base.
- La altura y el azimut se siguen calculando **al registrar cada observación**,
  así que cuando el viaje no tiene lugar el formulario vuelve a preguntar la
  base: sigue siendo opcional, y sin ella solo se pierden alt/az. Pero la
  respuesta **sube al viaje** (`bitacora_viaje_base_efectiva`): se pregunta una
  vez por salida, no una vez por objeto. Y no vuelve a bajar —en cuanto el viaje
  tiene lugar manda él, y cambiarlo se hace en su ficha—, porque si no el último
  objeto de la noche mudaría de sitio la salida entera. Si al subirlo choca con
  otra salida de esa noche desde ese mismo sitio, el viaje se queda sin lugar
  (el objeto conserva el suyo) y el observador lo resuelve en la ficha.
- `/viajes/de-la-noche` responde una **lista**: una misma noche puede tener dos
  salidas desde sitios distintos, y elegir entre ellas es del observador.
- El `PUT` del viaje acepta el lugar. Mudarlo muda con él las observaciones de
  esa salida (así la salud de la base sigue cuadrando) y responde `409` si esa
  noche ya tenía otro viaje desde ese sitio.

### Versionado de esquema

Un número de versión en una opción, sustituyendo a las banderas sueltas por
migración. Comprobado en `plugins_loaded`, no solo en la activación: desde
WordPress 3.1 el hook de activación **no se dispara al actualizar** un plugin.

`dbDelta` es **solo aditivo** —nunca genera un `DROP`, y renombrar crea una
columna nueva dejando la vieja—, así que las columnas nuevas siguen pasando por
el ayudante idempotente que ya existe, y las retiradas se hacen a mano. Sin
claves ajenas: `dbDelta` no las admite, la integridad la sostiene el PHP.

### Backfill

Los tres campos de identidad ya están en la observación, así que los viajes
históricos se derivan agrupando por (observador, noche, base) con la noche
calculada en PHP fila a fila. El SQM del viaje se hereda del primero no nulo de
sus observaciones. Idempotente y relanzable, sin borrar nada.

### API

Rutas nuevas para listar, leer, editar y borrar viajes, y para la tripulación,
bajo el mismo espacio de nombres REST que el resto. El listado de observaciones
gana un filtro por viaje. La respuesta del viaje incluye el recuento de objetos y
los instrumentos usados, calculados en la consulta, no guardados.

### Interfaz

El listado de observaciones agrupa por viaje, con la lista plana disponible como
alternativa. Ficha de viaje nueva para nombre, crónica, cielo y tripulación. El
formulario de registro muestra a qué viaje irá lo que se está registrando.

## Testing Decisions

**Qué es un buen test aquí.** El repositorio prueba sin framework: scripts sueltos
de `node` o `php` con aserciones, que fijan el *contrato* de una función pura y
fallan si el contrato cambia. Nada de mocks de WordPress ni de base de datos: si
algo necesita `$wpdb` para probarse, es que la lógica está en el sitio
equivocado. Prior art: `scripts/test_cache_lru.php` (política de caché extraída a
un archivo requerible sin WordPress), `scripts/test_astro.js` (invariantes
físicos), `scripts/test_reproductor_albumes.js` (función pura extraída del HTML).

**Una sola costura nueva.** La lógica que puede romperse de verdad es *a qué
viaje pertenece una observación*, y es la misma en las dos rutas que la usan
—guardar una observación nueva y el backfill de las históricas—. Se extrae a una
función pura, en un archivo requerible **sin WordPress**, que dada la fecha y
hora locales, la zona IANA de la base, el observador y la base devuelve la clave
del viaje. Es la costura más alta posible: por encima está el SQL, y por debajo
no hay nada que merezca prueba propia.

Casos que el test debe fijar:

- 22:40 y 02:15 de la madrugada siguiente caen en **la misma** noche.
- El corte está en el mediodía local, no en la medianoche.
- Sin hora, la noche es la fecha tal cual, sin desplazar.
- El cambio de horario de verano no desplaza la noche (mismo tipo de invariante
  que ya fija `test_astro.js` para los husos).
- Zonas al este y al oeste de Greenwich, y una con offset no entero.
- Sin base, no hay clave de viaje.
- La clave es estable: la misma entrada da siempre la misma salida (es lo que
  hace que el backfill sea idempotente).
- Dos observadores distintos, misma noche y base, dan claves distintas.

**Lo que no lleva test propio:** el DDL, las rutas REST y la interfaz. Se
verifican ejecutando la migración sobre una copia de la base de datos y
comprobando que el número de observaciones con viaje asignado más las que no
tienen base suman el total.

## Out of Scope

- Cambiar `fecha_observacion` de `varchar` a `date`. Es un cambio de tipo sobre
  datos vivos y merece su propio paso, con respaldo previo.
- Retirar las columnas de texto `observador` y `telescopio` que duplican sus
  `_id`. Deuda reconocida, ajena a esta funcionalidad.
- Claves ajenas.
- Exportar e importar en formato Open Astronomy Log. El modelo queda compatible
  con el estándar, pero el intercambio de ficheros no entra aquí.
- Una tabla `noches` global compartida entre observadores.
- Herencia de tipos de observación al estilo de las extensiones de OAL
  (cielo profundo, sistema solar, variables).
- Particionado, desnormalización o caché: a la escala prevista (~90.000
  observaciones) la base de datos no es el cuello de botella.
- Planificación de sesiones futuras. El viaje registra lo que pasó, no lo que se
  piensa hacer.

## Further Notes

**Escala.** 50 observadores × 300 sesiones × ~6 objetos ≈ 90.000 observaciones y
~15.000 viajes. Para InnoDB es una tabla pequeña. Los índices propuestos son
higiene, no rescate.

**Riesgo principal.** El desplazamiento de la noche es la única regla que, mal
implementada, corrompe datos de forma silenciosa: las observaciones de madrugada
acabarían en el viaje del día siguiente y nadie lo notaría hasta tener cientos.
De ahí que sea justo la lógica que se extrae y se prueba.

**Riesgo secundario.** El backfill toca todas las filas existentes. Debe ser
idempotente y no destructivo, y conviene ejecutarlo con la base de datos
respaldada.

**Decisión que conviene confirmar antes de implementar:** que el telescopio quede
fuera de la identidad del viaje. Contradice la formulación inicial, y aunque el
estándar respalda la elección, es reversible solo con coste (añadirlo después a
la clave única obliga a repartir viajes ya creados).
