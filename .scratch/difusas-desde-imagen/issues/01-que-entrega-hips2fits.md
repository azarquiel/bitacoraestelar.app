# 01 — Qué entrega hips2fits, y en qué unidades

**Type:** research
**Status:** open
**Blocked by:** —

## Question

El simulador ya pide recortes a `hips2fits` del CDS
(`bitacora-ocular.js:661`), pero solo en un modo: HiPS de color
`CDS/P/PanSTARRS/DR1/color-z-zg-g`, `format=jpg`. Antes de decidir nada hace
falta saber qué más sabe dar ese servicio.

Averiguar, con fuentes citadas:

1. **`format=fits`** — ¿lo admite? ¿Qué cabecera devuelve (CRVAL/CRPIX/CDELT/
   CTYPE, `BUNIT`, punto cero `MAGZP`)? ¿Los valores son **lineales** o vienen
   ya estirados? ¿Qué tipo de dato (float32, int16)?
2. **HiPS de banda única de PanSTARRS** — ¿existe en el registro del CDS un
   `CDS/P/PanSTARRS/DR1/g` (o equivalente por banda)? ¿Y sus otras bandas?
   ¿Están en cuentas lineales o en la versión estirada para visualización?
3. **Límites del servicio** — tamaño máximo de `width`/`height`, FOV máximo,
   latencia típica de una petición de PROC² píxeles, límites de uso o cuota,
   y si manda cabeceras **CORS** que permitan leerlo desde el navegador (hoy se
   pide directo, sin proxy, así que en `jpg` funciona; confirmar para `fits`).
4. **Cobertura y hueco sur** — PanSTARRS-1 no baja de δ ≈ −30°. Qué HiPS
   difusos hay para el resto del cielo (DSS2, DECaPS/DECaLS, SkyMapper, VPHAS+)
   y en qué se diferencian en profundidad y en unidades.
5. **Nebulosas** — qué banda de PS1 recoge mejor lo que el ojo ve en una
   nebulosa de emisión. La `g` incluye OIII (500,7 nm) y Hβ, que es lo visual;
   la `r`/`i` recogen Hα, a la que el ojo es casi ciego. Confirmar los anchos de
   banda reales de PS1 y qué líneas caen dentro.

## Answer

_(pendiente)_
