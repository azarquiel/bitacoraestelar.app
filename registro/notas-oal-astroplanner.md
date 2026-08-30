# Notas · Qué hace AstroPlanner con un OAL

Hechos medidos sobre `ejemplos-oal/astroplanner-referencia.xml` (export real:
610 KB, 292 observaciones, 43 sesiones, 256 targets, 11 sitios, 2010-2026) y
sobre el texto de ayuda del propio diálogo de importación. No son opiniones:
son las restricciones con las que tiene que vivir el exportador.

## Lo que su fichero enseña (lo que ESCRIBE)

| Hecho | Medida |
|---|---|
| Espacios de nombres | `https://groups.google.com/group/openastronomylog` y `https://www.w3.org/2001/XMLSchema-instance`. El esquema dice `http://` en los dos. |
| `<session>` dentro de `<observation>` | **0 de 292**, con 43 sesiones definidas. Su export rompe el vínculo. |
| `xsi:type` en `<result>` | **0 de 292**. `resultType` es abstracto: sin él no valida. Sí emite `xsi:type` en los 256 `<target>`. |
| `<rating>` en `<result>` | ausente. Es obligatorio en `findingsDeepSkyType` (99 = desconocido). |
| Instantes | **335 de 335 en `Z`**, UTC real (comienzos de sesión entre 19 y 02 UTC = 21-04 local). El `<timezone>` del sitio es lo único que devuelve la hora de pared. |
| Cielo | ni un `<sky-quality>`, `<seeing>` ni `<faintestStar>`. Tira ese dato entero. |
| Orden de elementos | `begin, end, site, observer, target, …`; el esquema manda `observer, site, session, target, begin, …`. `xsd:sequence` es ordenado: inválido. |

## Lo que su ayuda dice (lo que LEE)

- **Sí lee sesiones.** Hay pestaña *Sessions* con «las sesiones asociadas a las
  observaciones». Asociar exige la referencia `<session>` que su propio export
  no escribe: **su importador lee más de lo que su exportador escribe**. Emitir
  `<session>` en cada observación es estrictamente mejor, aunque él no lo haga.
- **Los recursos se emparejan a mano.** Telescopios, oculares, sitios y
  observadores salen en la pestaña *Resources* en verde (emparejado), naranja
  (no lo usa nadie, se ignora) o **rojo (usado y sin emparejar: bloquea la
  importación hasta resolverlo)**. Consecuencia: emitir el catálogo de equipo
  entero llena su diálogo de filas naranjas. **Se emiten solo los recursos que
  alguna observación referencia.**
- **Los objetos se buscan en sus catálogos por lo que diga `<name>`**: «esto a
  veces es tan poco como un identificador de objeto, así que el proceso de
  importación busca estos objetos en los catálogos instalados». Consecuencia:
  `<name>` lleva la **designación de catálogo** (`M31`, `NGC 6826`), nunca la
  etiqueta amable. En nuestro modelo eso es `objeto`, no `objeto_etiqueta`.
- **Importar observaciones es de una sola vez**: «You can only do this once,
  since sessions and observations must be unique». Los objetos sí se pueden
  importar cuantas veces se quiera, pero las observaciones no.

## Lo que se sigue de esto

**AstroPlanner es un destino de una sola dirección y una sola vez.** No es el
otro extremo de un ciclo: es una siembra. El ciclo de ida y vuelta —exportar,
corregir, reimportar— se cierra con la plantilla y con la bitácora, que sí
saben adoptar y actualizar (ver ADR 0002).
