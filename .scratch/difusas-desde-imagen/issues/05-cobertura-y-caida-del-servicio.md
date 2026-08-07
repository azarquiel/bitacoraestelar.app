# 05 — Cobertura del cielo y qué pasa cuando no hay imagen

**Type:** grilling
**Status:** open
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

_(pendiente)_
