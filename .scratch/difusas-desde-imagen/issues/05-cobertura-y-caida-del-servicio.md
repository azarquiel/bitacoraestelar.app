# 05 — Cobertura del cielo y qué pasa cuando no hay imagen

**Type:** grilling
**Status:** closed (11-ago-2026)
**Blocked by:** 01

## Question

La vista Canvas-2D de Gaia es hoy la **única que funciona sin servidor de
imagen**: catálogo + estrellas dibujadas + fondo plano. Colgar su componente
difusa de un servicio externo le quita esa propiedad.

Cerrar:

- **Hueco sur.** PanSTARRS-1 no baja de δ ≈ −30°. ¿Se cae a otro HiPS ahí
  (DECaPS, SkyMapper, DSS2), se deja el campo sin difuso, o se limita el difuso
  al cielo que PS1 cubre? Un cambio de cartografiado cambia profundidad, banda y
  calibración: ¿se acepta que el sur se vea distinto del norte?
- **Servicio caído o lento.** ¿Fondo plano de siempre, y ya está? ¿Con aviso, o
  en silencio? Hoy el origen HiPS avisa con *"hips2fits no respondió: prueba el
  origen DSS"*, pero eso es una vista alternativa, no una capa.
  **Esto dejó de ser hipotético:** el 07-ago-2026, mientras se medía la ficha 01,
  `hips2fits` se cayó entero durante la sesión —`alasky.cds.unistra.fr`,
  `alaskybis` y `alasky.u-strasbg.fr`, los tres a `http=000`, mientras
  `cdsweb.u-strasbg.fr` respondía `200`—. No hay espejo de recambio, y arrastró
  también al JPG de color que ya está en producción. Detalle en la ficha 01, §4.
- **Redundancia con los orígenes que ya hay.** El usuario ya puede mirar el
  mismo campo en DSS o en PanSTARRS con un desplegable. ¿Qué aporta el difuso
  dentro del Canvas-2D que no dé cambiar de origen? (Respuesta esperada: la
  fotometría —magnitud límite, pupila, umbral de contraste— y estrellas de
  catálogo en vez de estrellas de placa. Conviene decirlo explícito, porque es
  lo que justifica el esfuerzo entero.)

## Answer

**Sin imagen, no hay capa; y se dice por qué.** Las tres causas se tratan igual
por dentro y distinto de cara al usuario.

### Hueco sur: nada, y ficha aparte si duele

δ < −30° se queda **sin capa**. Son **365 de las 1295 filas** del RC3, con NGC
55, NGC 253 y NGC 134 entre ellas: mucho, y aun así el respaldo se descarta de
este esfuerzo.

Motivo: cada fuente trae su tratamiento de cielo, su escala y su estirado, y la
ficha 03 decidió que el gris crudo no vale como flujo. Un segundo camino con
DSS2 duplica la parte delicada de la tubería —restar cielo, integrar, anclar—
antes de que la primera esté probada contra un campo real. Y una placa Schmidt
junto a un stack de PS1 no se parecen: el sur se vería peor, sin decir por qué.

Lo que **sí** abarata el respaldo, si algún día se hace: el anclaje al catálogo
(ficha 03) hace usable una fuente sin fotometría, porque el nivel lo pone el RC3
y la placa solo aporta forma. `dss-proxy.php` ya está en producción, con caché.

### Servicio caído: fondo de siempre, y aviso con la causa

La capa no se pinta y el render vuelve a lo de hoy —estrellas de Gaia sobre
fondo plano—, que es exactamente el comportamiento actual y no se rompe nada.
El interruptor de la ficha 06 hace explícito lo que si no sería invisible.

Aviso solo cuando **el objeto apuntado** es una galaxia sin parche, por
`$('sim-aviso')`, que ya avisa de campos donde el catálogo Gaia se agotó:

- *«sin imagen de cartografiado: PanSTARRS no cubre por debajo de −30° de
  declinación»*
- *«el servicio de imágenes no responde; se muestra el campo sin la galaxia»*

Las compañeras del campo que falten, en silencio: en Virgo, avisar de todas
escupiría cinco líneas sobre galaxias que el usuario ni buscaba. La causa
importa porque cambia lo que puede hacer: por el sur no hay nada que esperar,
por caída sí.

### Redundancia con los orígenes que ya hay

Se responde lo que la ficha esperaba, y conviene tenerlo escrito porque es lo
que justifica el esfuerzo entero: lo que aporta el difuso dentro del Canvas-2D y
no da cambiar de origen es la **fotometría** —magnitud límite del equipo, pupila
de salida, umbral de contraste, adaptación local— y estrellas de **catálogo** en
vez de estrellas de placa. Mirar la placa enseña lo que hay; esta vista enseña
lo que se vería.

Corolario de alcance: la capa vive **solo en la vista Canvas-2D de Gaia**. Con
origen HiPS o DSS no se pinta, porque allí la imagen ya es la placa.
