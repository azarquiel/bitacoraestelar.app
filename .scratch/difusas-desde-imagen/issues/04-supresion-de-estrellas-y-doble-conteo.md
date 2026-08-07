# 04 — Supresión de estrellas y doble conteo con la capa de Gaia

**Type:** grilling
**Status:** open
**Blocked by:** 02, 03

## Question

Con la vía de formato ya elegida (03) y las opciones sobre la mesa (02),
decidir **cómo queda solo el difuso**.

Lo que hay que cerrar:

- ¿Qué método? Resta informada por el catálogo de Gaia —que para este campo ya
  está descargado, con posición y flujo exactos—, filtro morfológico, o mezcla.
- ¿Hasta qué magnitud se restan estrellas? Gaia trae muchas más de las que el
  ocular llega a ver; la imagen del cartografiado es más profunda que el ocular
  simulado. Las estrellas de la placa **por debajo** de la magnitud límite del
  instrumento no son doble conteo: son luz integrada legítima del fondo, y
  quitarlas empobrecería el campo.
- ¿Qué se hace donde Gaia está incompleto por aglomeración (núcleos de
  globulares)? Ahí la resta por catálogo deja las estrellas que el catálogo no
  trae, y el filtro morfológico se come el cúmulo entero.
- ¿Se hace en vivo por fotograma, o una vez por campo y se cachea?
- Comprobación que guarda esto: la suma de flujo de la capa difusa no puede
  crecer al bajar la magnitud límite del instrumento.

## Answer

_(pendiente)_
