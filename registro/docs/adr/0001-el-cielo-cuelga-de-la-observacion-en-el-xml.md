# 0001 · El cielo cuelga de la observación, no de la noche

Fecha: 2026-08-25
Estado: aceptado

## Contexto

`plantilla-oal.html` escribe SQM, IR, seeing y Bortle como `<bit:sqm>`,
`<bit:ir>`, `<bit:seeing>` y `<bit:bortle>` dentro de `<session>`: un valor por
noche. La spec del importador lo justificó diciendo que «OAL no tiene dónde
guardar SQM, IR ni Bortle de una noche».

Tres hechos, medidos al preparar la exportación, dicen que eso está mal:

1. **OAL sí tiene sitio, y desde hace años.** `oal_Base.xsd` define en
   `observationType` los elementos `<sky-quality>` (tipo
   `surfaceBrightnessType`, unidad `mags-per-squarearcsec`; se llamaba `sqm`
   hasta la v2.0), `<seeing>` (escala Antoniadi 1-5, exactamente la nuestra) y
   `<faintestStar>`. `bit:sqm` y `bit:seeing` reinventan elementos estándar.
   Solo IR y Bortle carecen de hogar en el gremio.
2. **Están en la observación, no en la sesión.** `sessionType` solo admite
   `weather`, `equipment`, `comments` e `image`.
3. **Nuestro propio modelo ya decía lo mismo.** `bitacora_observaciones` tiene
   `cielo_sqm`, `cielo_ir`, `cielo_bortle` y `seeing` por observación;
   `registro/CONTEXT.md` sostiene que «el cielo NO sube al viaje» y
   `bitacora-registro.php:633` lo firma: «Hogar de la calidad de cielo
   (SQM/IR) = la observación». El viaje solo guarda un **resumen**.

El argumento físico es el que zanja: el SQM **es direccional**. Se mide hacia la
zona del cielo donde está el objeto, y en España un objeto bajo suele caer sobre
un horizonte contaminado. Dos objetos de la misma noche tienen legítimamente
SQM distintos. Que las observaciones de una noche discrepen no es una anomalía:
es el caso normal.

## Decisión

**En el XML, el cielo se escribe en cada `<observation>`**, con los elementos
estándar donde existen:

```xml
<sky-quality unit="mags-per-squarearcsec">21.42</sky-quality>
<seeing>3</seeing>
<bit:ir>-18</bit:ir>
<bit:bortle>4</bit:bortle>
```

`bit:` queda reducido a lo que el estándar de verdad no tiene: IR y Bortle.

**En la interfaz de la plantilla, el cielo se sigue preguntando una vez por
noche**, como valor **por defecto**, no como verdad:

- Cada observación tiene su propio campo de cielo, presembrado con el de la
  noche y **visible en su fila**.
- Cambiar el valor de la noche rellena solo las observaciones **sin valor
  propio**. Las tecleadas a mano no se tocan.
- Al descargar, cada observación escribe **el suyo**. En el XML no hay herencia:
  la herencia es un gesto de la interfaz, no una regla del formato.

El lector acepta además `bit:sqm/ir/seeing/bortle` en `<session>` (los XML que
los compañeros ya rellenaron) y los reparte a las observaciones de esa noche.
Lee viejo, escribe nuevo: sin migración y sin avisar a nadie.

## Alternativas descartadas

- **Dejarlo en la noche.** Cero trabajo, pero exportar a AstroPlanner pierde el
  cielo entero y quedan dos verdades sobre dónde vive un dato que el glosario ya
  había zanjado.
- **Enseñar el primer valor y avisar en amarillo si discrepan.** Era la
  recomendación hasta saber que el SQM es direccional: con eso, el aviso salta
  casi todas las noches, y un aviso que sale siempre es un aviso que nadie lee.
- **Preguntar el cielo observación a observación en el formulario.** Coherente y
  hostil: seis veces el mismo número, justo en el caso que justifica la
  plantilla —recuperar libretas viejas—.
- **Que la plantilla conserve por observación lo que no tocó, sin enseñarlo.**
  Crea un estado que la interfaz no puede explicar.
- **Escribirlo en los dos sitios** (estándar en la observación, resumen `bit:`
  en la sesión). Dos fuentes que pueden discrepar y una regla más que inventar
  al reimportar.

## Consecuencias

- **La dirección de la medida sale gratis.** Si el SQM se mide hacia la zona del
  objeto, «hacia dónde apuntaba el fotómetro» es la altura y el azimut de esa
  observación, que la ficha ya calcula con Meeus. No hace falta ningún campo
  nuevo: colgar el SQM de la observación lo ancla a su alt/az sin pedirlo.
- **AstroPlanner no recibirá el cielo igualmente**: su propia exportación no
  emite `sky-quality`, `seeing` ni `faintestStar` en ninguna de las 292
  observaciones de `registro/ejemplos-oal/astroplanner-referencia.xml`. Que
  nosotros lo emitamos en su sitio estándar es lo correcto aunque hoy no haya
  quien lo lea.
- **El resumen del viaje queda arbitrario**: copia el primer valor no nulo, que
  con SQM direccional es el del primer objeto registrado, no el de la noche.
  Queda anotado en `registro/CONTEXT.md`; cambiar el criterio es otra decisión,
  con su propio ADR.
- **La salud de una base mezcla medidas de alturas y azimuts distintos**, así
  que parte de su dispersión es geometría y no cielo. Es deuda anterior a este
  trabajo y pertenece al contexto `mapa/`; queda dicha, no abierta.
