# 04 — Supresión de estrellas y doble conteo con la capa de Gaia

**Type:** grilling
**Status:** open
**Blocked by:** 03, 09

## Question

Con la vía de formato ya elegida (03), el registro entre rejillas resuelto (09)
y las opciones **ya medidas** en la 02, decidir **cómo queda solo el difuso**.

La 02 dejó el método casi elegido: máscara en las posiciones del catálogo +
relleno desde el entorno (1,3 ms, núcleo al 100 %, estrella al 1 %), con la
apertura morfológica 7×7 sobre imagen estirada como alternativa viable (98 % del
flujo, estrella a 0 %). Lo que queda no es *qué* método, es lo demás:

- ¿Se queda la máscara sola, o hace falta la apertura como red de seguridad
  donde el catálogo no llega?
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
