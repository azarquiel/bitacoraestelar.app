# 01 — Toggle del truco HDR de rescate de núcleos, off por defecto

**What to build:** una bandera de configuración que activa o desactiva la
segunda pasada de rescate de núcleos saturados que hoy hace siempre
`capaEstrellas()` (dos renders completos del lienzo + dos `getImageData` para
recuperar detalle en núcleos densos que se recortan a blanco). Por defecto la
bandera está OFF: el render normal pasa a hacer una sola pasada. Encendida,
el resultado es idéntico al comportamiento actual.

**Blocked by:** Ninguno — puede empezar ya.

**Status:** done

- [x] Nueva bandera en la configuración del render (`CFG.hdrRescate`), default `false`.
- [x] Con la bandera OFF, `capaEstrellas()` hace una sola pasada (sin segunda
      pasada atenuada ni mezclado por curva de tono).
- [x] Con la bandera ON, el resultado es bit a bit idéntico al comportamiento
      de antes de este toggle (mismo código, solo gateado).
- [x] La suite `scripts/test_*.js` sigue en verde (15/15).
- [x] `scripts/test_hdr_toggle.js` (nuevo): stub mínimo de `document`/canvas
      vía Proxy, cuenta llamadas a `getImageData` — 1 con OFF, 2 con ON.

Implementado en `resources/js/bitacora-gaia-render.js`: `CFG.hdrRescate`
(junto a las constantes de la aureola) y el gate en `capaEstrellas()`.
