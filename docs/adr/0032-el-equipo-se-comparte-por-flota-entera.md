# 0032 · El equipo se comparte por flota entera

Fecha: 2026-10-24
Estado: aceptado

## Contexto

Un observador que mira con el telescopio o los oculares de un compañero no
tenía cómo registrarlo: `GET /equipo` solo devuelve su flota y el catálogo
global, así que copiaba la pieza a su flota o escribía texto libre
(`__legacy__`). Las dos cosas le pierden el rastro a la pieza real y meten la
observación en la calibración de un equipo que no es el que se usó. Además, el
servidor guardaba cualquier `telescopioId` sin mirar de quién era.

Ya existía un precedente: la base `seleccionada`, compartida en solo
lectura con usuarios concretos (`bitacora_base_compartida`).

Decidido en el grilling del 2026-10-23, épica #492 (historias #493 a #500).
Las definiciones están en `registro/CONTEXT.md`, secciones «Equipo
compartido» y «Pieza prestada». Aquí solo se guarda la razón.

## Decisión

1. **Se comparte la flota entera por destinatario, no pieza a pieza.** Una
   fila por pareja `propietario_id` + `destinatario_id`, como la base
   compartida. Descartado pieza a pieza en el grilling: pediría una fila por
   pieza y por persona, y una pantalla para elegirlas. Se acepta la
   consecuencia: una pieza nueva del propietario queda compartida sin que lo
   decida por separado.
2. **Se usa la pieza real, no una copia.** Descartado seguir copiando la pieza
   o escribirla en texto libre: duplica el equipo y deja la observación sin
   saber de quién era el tubo, que es justo lo que hace falta para no
   calibrar con él.
3. **El destinatario se localiza por nombre de usuario exacto, no con un
   buscador.** Un buscador o un autocompletado permiten enumerar quién tiene
   cuenta. Por la misma razón «no existe» y «no se puede» dan la misma
   respuesta, y hay límite de ritmo (#494), con el criterio de `GET /resolver`
   en #469.
4. **«Prestada» se deduce al leer, no se guarda en una columna.** El dato ya
   está: el `usuario_id` de la pieza frente al de la observación. Una columna
   repetiría ese hecho y podría contradecirlo. El coste se acepta: si la pieza
   se borra ya no se sabe de quién era, y la observación queda como «Equipo no
   disponible», fuera de la calibración (#499).
5. **Solo lectura, sin confirmación de B.** B no confirma cada observación
   hecha con su equipo, y no hay bandeja de pendientes para que cuenten en su
   equipo. Una observación prestada no cuenta para el dueño ni para el
   observador. Queda fuera de la épica.
6. **El dueño ha de tener cuenta.** No se admite equipo de un observador
   invitado sin cuenta como propietario. Es una segunda fase, si el caso
   aparece.
7. **El destinatario no puede quitarse de la lista de otro.** No hay demanda.
   Se revisa si alguien se queja de una lista saturada en el selector.
8. **No se avisa al destinatario.** No hay demanda: la lista «Comparten
   conmigo» de la pantalla de compartir (#497) basta como aviso.
9. **OAL no cambia.** El observador ya es independiente de `<scope>` y
   `<eyepiece>`, así que una pieza prestada se exporta como cualquier otra, y
   la importación sigue creando piezas del que importa.

## Consecuencias

- El servidor valida la propiedad de cada pieza al guardar (#493), con la
  rama «compartida conmigo» de #495. Lo ya guardado no se revalida, y editar
  una observación antigua sin cambiar las piezas no falla.
- Revocar no reescribe el pasado: las observaciones antiguas conservan el id
  y el texto `telescopio`.
- El emparejamiento del importador (`bitacora_oal_equipo_visible`) sigue
  mirando solo catálogo y equipo propio. Ampliar `GET /equipo` en #495 no
  debe llegar ahí: si el importador casara con una pieza ajena, la
  observación importada nacería prestada.
