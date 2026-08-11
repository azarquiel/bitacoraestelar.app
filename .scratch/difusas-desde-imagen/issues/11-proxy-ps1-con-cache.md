# 11 — Proxy de ps1cutouts con caché LRU (fase 2)

**Type:** implementation
**Status:** open — **no empezar antes de que la fase 1 convenza**
**Blocked by:** 10

## Question

Un tercer proxy PHP junto a `dss-proxy.php` y `gaia_proxy.php` que reciba una
galaxia y devuelva **un parche ya listo**: resuelve skycells, pide los trozos,
fusiona los `NaN` y lo sirve de disco a partir de la segunda vez.

Motivo: sin él son hasta 8 peticiones por galaxia a 2,6 s, y `fitscut.cgi`
anuncia `Cache-Control: max-age=3600` —una hora—, así que el navegador vuelve a
pedirlo al día siguiente. Con él, una petición por galaxia y acierto de disco
después.

**No cambia un solo píxel.** Es latencia, nada más: por eso va después de que la
imagen convenza, y no antes (ficha 07).

## Spec

Copia de la política de `dss-proxy.php`, que ya está probada en producción:

- **Caché LRU en disco** por `bitacora-cache-lru.php`, el módulo compartido:
  150 MB de tope, limpieza incremental cada 5 min, `flock` contra estampidas,
  escritura atómica (temp + rename), `ETag` y `Cache-Control` largo al
  navegador. El parche es inmutable —PS1 DR2 es un archivo fijo y la petición es
  determinista—, así que el `ETag` puede ser la clave, como en el DSS.
- **Clave de caché:** `md5(ra|dec|lado|output_size|banda)`, todo normalizado
  antes. El parche **no** depende del ocular ni del aumento (ficha 10), así que
  la clave no los lleva.
- **Lista blanca y validación de parámetros**, como `dss_validar_coord`: este
  script no puede convertirse en un proxy abierto hacia STScI. El nombre de
  skycell lo resuelve **el servidor**, no se acepta del cliente.
- **`wcs=1` siempre.** Ver el aviso de la ficha 10: sin él, `fitscut` devuelve
  200 OK con un recorte de otro sitio.
- **Qué se sirve:** el parche fusionado. Formato de salida por decidir al
  escribirlo —FITS float32 tal cual (~1,1 MB a 512²) o algo más compacto—; lo
  que no se hace es servir cada trozo por separado y fusionar en el navegador,
  que es justo el trabajo que este proxy viene a quitar.
- **Timeouts separados** de conexión y de petición, como el del DSS, y 502 con
  mensaje si STScI no responde: la capa se apaga y el aviso lo da la ficha 12.

## Comprobación

`scripts/test_ps1_proxy.php`, espejo de `test_dss_proxy.php`, sobre las
funciones puras (el fichero no ejecuta el flujo web bajo CLI):

- Armado de URL: `wcs=1` presente, `size` en píxeles de 0,25″, banda de la lista
  blanca, `output_size` acotado.
- Validación de coordenadas: rechaza lo que no sea coordenada.
- Clave de caché determinista y estable ante reordenación de parámetros.
- Elección de skycells: cuatro esquinas, deduplicadas.

## Answer

_(pendiente)_
