# 0002 · La identidad se adopta al importar, no se sella al exportar

Fecha: 2026-08-25
Estado: aceptado

## Contexto

El importador desduplica con `oal_id` = `noche#objeto_normalizado`
(la clave la construye `bitacora_oal_id()`, llamada desde
`bitacora_oal_agrupar()`) y lo busca por `usuario_id + oal_id`
(`bitacora_oal_importar()`). Se citan funciones y no líneas: los números
de línea de la primera versión de este ADR ya habían envejecido.
Una observación nacida en el formulario tiene
`oal_id` **NULL**, así que no casa con nada.

Consecuencia, en cuanto exista exportación: exportas tus observaciones, corriges
una descripción en la plantilla, vuelves a subir el fichero, y entran **todas
otra vez** como filas nuevas. El ciclo exportar → importar no es un círculo: es
un tobogán.

`registro/CONTEXT.md` ya lo tenía fichado como «identidad asimétrica según por
dónde entre — deuda, no diseño». Exportar es lo que convierte esa deuda en
factura, y además le pega justo al objetivo que la motiva: enganchar a un
compañero enseñándole sus observaciones ya registradas se estropea si su segundo
viaje de ida y vuelta le duplica la bitácora.

## Decisión

**El importador adopta.** Cuando un `oal_id` del XML no casa con ninguna fila, el
importador busca entre las observaciones de ese usuario **sin `oal_id`** una de
la **misma noche y mismo objeto normalizado**. Si la encuentra, le pone el
`oal_id` y la actualiza, en vez de crear otra.

Exportar queda en **solo lectura**.

**Si hay más de una candidata, no se adopta.** Pasa cuando un objeto se observó
en dos salidas de la misma noche (dos bases distintas): `oal_id` cuelga de la
noche, no del viaje, así que la clave no las distingue. Elegir una sería
inventarse cuál, y fusionarlas sería peor. Sale como fila con problema en la
previa, con su motivo, y el resto del fichero entra igual.

## Alternativas descartadas

- **Sellar al exportar** (el exportador escribe `oal_id` en las filas que no lo
  tienen). Cierra el ciclo exacto, pero convierte una descarga en una escritura:
  un `GET` que muta estado, imposible de ofrecer sin miedo desde un enlace o un
  correo.
- **Que el XML lleve el `id` de la base de datos.** Directo, y se rompe en cuanto
  el fichero cruza a otro usuario o a otra instalación — que es exactamente lo
  que queremos que pase.
- **Asumir los duplicados.** Es el estado de hoy.

## Consecuencias

- **Arregla el duplicado venga de donde venga el XML**, no solo del exportador
  que abre este trabajo: también el de la plantilla de un compañero, o el de dos
  compañeros que suben la misma noche compartida.
- **No inventa regla nueva.** «Mismo usuario + misma noche + mismo objeto = la
  misma observación» es literalmente lo que `oal_id` ya impone; adoptar solo la
  aplica también hacia atrás.
- **Adoptar es sobrescribir.** Manda el XML, así que reimportar pisa lo que se
  hubiera editado en el sitio después. La previa tiene que contarlas **aparte**
  de las que ya venían de un XML: «N observaciones tuyas del formulario van a
  quedar adoptadas y sobrescritas» no es el mismo aviso que «N se actualizan».
- **Una observación con varias entradas exporta varios `<observation>`** —en OAL
  una observación es un objeto con un tubo y un ocular— y todas comparten noche y
  objeto. Al volver, el importador las funde otra vez en una. El `oal_id` es el
  mismo para todas por construcción; lo que tiene que ser único dentro del
  fichero es el atributo `id` de cada elemento.
