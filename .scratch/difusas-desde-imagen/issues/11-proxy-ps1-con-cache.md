# 11 — Proxy de ps1cutouts con caché LRU (fase 2)

**Type:** implementation
**Status:** closed — construido el 11-ago-2026
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

`simulador_ocular/ps1-proxy.php`, calcado del del DSS: misma caché LRU en disco
por `bitacora-cache-lru.php` (150 MB, `*.fits`), mismo `flock` + temp/rename,
mismo `ETag` = clave con `Cache-Control` de un año, mismos timeouts separados y
mismo `return` temprano bajo CLI para poder testear las funciones puras.

**Lo que se decidió al escribirlo:**

- **Se sirve el parche cosido, en FITS float32 tal cual** (~1,05 MB a 512²). Sin
  recomprimir ni cambiar de formato: el cliente ya tiene su lector de FITS
  (`parseFITS`), y el nivel tiene que llegar lineal.
- **La costura se hizo en PHP sin parsear la cabecera entera**: se busca la
  tarjeta `END`, se redondea al bloque de 2880 y se comparan los datos palabra a
  palabra con `unpack('N*')`. Un NaN de float32 big-endian es exponente a unos y
  mantisa no nula, así que la marca de «fuera de la skycell» se detecta sobre el
  entero, sin convertir a float. Los píxeles que hay que traer se parchean por
  bytes en la propia cadena (`$datos[$p] = …`), que evita un `pack('N*', ...)`
  de 262 144 argumentos.
- **La cabecera es la de la primera capa.** Las cuatro se piden con el mismo
  `x/y/size/output_size`, así que comparten rejilla; lo único que el cliente lee
  de la cabecera es `NAXIS*`, `BITPIX`, `CDELT2` y `ZPT`.
- **Peticiones en serie** dentro del PHP (~11-14 s en un fallo de caché de cuatro
  skycells, medido). `curl_multi` queda anotado como techo; una vez por galaxia y
  para siempre, no compensa.
- **Validación de entrada:** ra/dec numéricos y en rango (aquí van en grados
  decimales, no en sexagesimal como el DSS), lado acotado a [1,5′, 20′],
  `output_size` a [64, 1024], banda de la lista blanca `grizy`, y como mucho
  cuatro skycells por parche. El nombre de skycell no se acepta del cliente.

**El cliente adelgaza**: `ps1UrlNombres`, `ps1UrlRecorte`, `ps1Esquinas`,
`ps1ParseNombres` y `ps1Fusionar` se borran de `bitacora-gaia-render.js` —vivían
ahí y ahora viven en el proxy, y tenerlo en los dos sitios es la duda de las 3 de
la mañana sobre cuál corre—. Queda `ps1UrlParche(gal)` y un `fetch` que devuelve
el parche ya listo. La caché de sesión del navegador sigue igual.

**Medido contra el servicio de verdad** (no está en el test, que no toca red):

| campo | skycells | NaN por capa | NaN tras coser | tiempo |
|---|---|---|---|---|
| M51, 8,5′ | 4 | 45 / 66 / 61 / 76 % | **0 %** | 11,4 s |
| M31, 20′  | 4 | 89 / 75 / 74 / 40 % | **0 %** | 13,5 s |
| M100, 12′ | 2 | 7 / 76 %            | **0 %** | — |

Es decir: la costura hace lo que dice, y el 512² sale entero.

**Comprobación:** `php scripts/test_ps1_proxy.php`, 40 asserts sin red (URL con
`wcs=1` y `size` en píxeles nativos, validación de coordenadas, determinismo y
sensibilidad de la clave, esquinas con 1/cos(dec), deduplicación de skycells,
parseo de nombres, y la costura sobre FITS sintéticos: complementarias,
solapadas, capa de otro tamaño, ninguna válida). `scripts/test_difuso.js` pierde
los cuatro asserts que se fueron al proxy y gana los de `ps1UrlParche`.

**Lo que NO se hizo:** gzip en disco (el FITS de un parche comprime bien, pero
son 150 MB de tope y el ahorro no se ha medido), promediar el solape entre
skycells (sigue mandando el primer píxel válido, ficha 10), y `Range`/tiles.

Pendiente de la ficha 12: la casilla, los avisos y encender la capa por defecto.
Y el despliegue: `ps1-proxy.php` sube junto a los otros dos proxies.
