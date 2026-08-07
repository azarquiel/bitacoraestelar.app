# 06 — Coste en el generador de imagen del formulario de registro

**Type:** grilling
**Status:** open
**Blocked by:** 03

## Question

`resources/js/bitacora-gaia-render.js` es **compartido**: su `render(canvas, o)`
lo usa el generador de imagen del formulario de registro
(`registro/resources/js/bitacora-formulario.js:934`, *«Generar con el
simulador»*). Cuando se borraron las capas difusas hubo que corregir **dos**
puntos de llamada, no uno, y el segundo no estaba en la ficha original.

El riesgo 3 de las notas viejas ya avisaba de esto para los mapas all-sky: peso
descargado siempre, también en el formulario, en un simulador que presume de
funcionar en móvil. Con recortes en vivo el peso es menor pero la **latencia**
es nueva: una petición de red por cada imagen generada al registrar una
observación.

Cerrar:

- ¿La capa difusa entra también en el formulario, o solo en el simulador?
- Si entra: ¿bloquea la generación de la imagen hasta que llegue el recorte, o
  se genera sin difuso y ya está?
- Si no entra: ¿por qué bandera se distingue, y cómo se evita que la próxima
  sesión vuelva a olvidar el segundo punto de llamada?

## Answer

_(pendiente)_
