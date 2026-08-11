# 10 — El parche por objeto desde ps1cutouts (fase 1)

**Type:** implementation
**Status:** open — **la que se construye ahora**
**Blocked by:** 03, 04, 05, 09 (todas cerradas)

## Question

Construir la capa difusa de galaxias entera, pidiendo **directo al servicio**
(sin proxy: llega en la ficha 11), con el interruptor apagado por defecto, y
mirarla en el simulador de verdad. La lista de campos y el juicio, en la
ficha 07.

## El servicio, medido el 11-ago-2026

Dos CGI en `https://ps1images.stsci.edu/cgi-bin/`:

- **`ps1filenames.py?ra=&dec=&filters=g`** — texto plano, una fila por banda,
  con la **skycell** que contiene esa coordenada (`rings.v3.skycell.NNNN.CCC`).
  831 bytes, inmediato.
- **`fitscut.cgi?red=<fichero>&x=&y=&size=&output_size=&format=fits&wcs=1`** —
  el recorte.

Lo medido:

| Cosa | Valor |
|---|---|
| CORS | `Access-Control-Allow-Origin: *` en **ambos**. Se pide desde el navegador |
| `Cache-Control` de `fitscut` | `max-age=3600` — una hora, nada más |
| Punto cero | **en la cabecera**: `ZPT_0000…ZPT_0011` ≈ 24,42–24,49 |
| Proyección | `CTYPE1 = 'RA---TAN'`, WCS completa |
| Escala nativa | 0,25″/px (`size` va en píxeles de 0,25″) |
| `output_size` | **remuestrea y corrige la WCS**: `CDELT` 0,25″→1″/px, `CRPIX` desplazado |
| Peso FITS | 300² float32 → 375 KB · 512² → ~1,1 MB · 1200² → 5,8 MB |
| Peso JPEG | 720² → 21 KB (referencia; no se usa, ver ficha 03) |
| Latencia | 2,6 s por recorte de 720² |
| Fuera de la skycell | píxeles **`NaN`** en FITS (blanco en JPEG) |

### ⚠ `wcs=1` es obligatorio

Sin `wcs=1`, `fitscut.cgi` lee `x`/`y` como **coordenadas de píxel**, no como
RA/Dec, y devuelve **200 OK con un recorte cualquiera de la esquina de la
skycell**. No hay error, no hay aviso: la imagen llega y es de otro sitio. Se
coló durante media sesión de medición hasta que cuatro skycells distintas
devolvieron exactamente el mismo cuadrante.

Cualquier código que arme estas URLs debe llevarlo, y el test debe comprobarlo.

## La spec

### 1. Qué se pide, por cada galaxia del campo

Del catálogo `BITACORA_GALAXIAS` (RC3, 1295 filas), todas las filas que caigan
en el campo — sin tope: filtrar por coordenadas no cuesta una petición, y los
campos con muchas (Virgo, Coma, grupos compactos) son justo los que justifican
la función. Tope solo si la fase sin proxy resulta insufrible.

- **Lado del parche:** `min(6·r_e, 20′)`. Radio cubierto 3·`r_e` ≈ 94 % de la
  luz de un disco exponencial. El tope de 20′ lo tocan 200 de 1295 filas.
- **`output_size`:** 512 px de partida.
- **Banda:** `g`. **Formato:** `fits`. **`wcs=1`**.
- Nada de esto depende del ocular ni del aumento: el parche de una galaxia es
  **siempre el mismo fichero**, y por eso la ficha 11 puede cachearlo entero.

Estadística del catálogo, para dimensionar: `r_e` mediana 48″, p90 122″, máximo
8105″ (M31). Y **365 filas a δ < −30°**, que no llevan parche (ficha 05).

### 2. Borde de skycell: fusión por NaN

Una skycell mide ~26′ y el parche mediano 6,4′, así que ~40 % de los objetos
caen a menos de medio parche de un borde. Un recorte que cruza sale mutilado y
descentrado, sin avisar.

Solución medida sobre M31 (parche de 20′, toca **cuatro** skycells):

1. Preguntar a `ps1filenames.py` por las **cuatro esquinas** del parche.
2. Por cada skycell distinta que salga, pedir a `fitscut.cgi` **el mismo
   recorte** (mismo `x`, `y`, `size`, `output_size`). Cada una devuelve su parte
   y `NaN` en el resto: se midió 61 %, 11 %, 26 % y 27 % de píxeles válidos.
3. Componer quedándose con el **primer píxel no-`NaN`**.

```
huecos tras fusionar: 0 de 4096
píxeles en solape: 904, desviación relativa mediana 15 %
```

No hace falta reproyectar nada: las cuatro llegan ya sobre la rejilla del
recorte pedido. En el solape se toma el primero; promediar queda para si se nota.

### 3. De DN a flujo, y el anclaje

Por el orden de la ficha 03: restar cielo (mediana del borde) → quitar estrellas
(ficha 04: posiciones de Gaia hasta `magLimite`, relleno desde el entorno) →
integrar → reescalar a la **mag V del RC3**, corrigiendo la fracción de luz
fuera del parche con `n` y `B/T` del catálogo.

Anclar antes de quitar estrellas mete su luz en el total y apaga la galaxia.

### 4. Cómo se pinta

Se suma al `Float32Array` `difuso` que ya existe (`bitacora-ocular.js:606`),
igual que hace `pintarHaloGlobular`; `pintarFot` lo pinta debajo de las
estrellas sin tocar nada más. Escala constante desde `CDELT`, centro por la
misma proyección que sitúa las estrellas, **sin giro ni remuestreo** (ficha 09:
~1 px en el peor caso). Gris, y con la gamma perceptual tal cual (ficha 03).

Solo en la vista **Canvas-2D de Gaia**; con origen HiPS o DSS, nada.

### 5. Parser de FITS

Float32 big-endian, cabecera de bloques de 2880 bytes, `END` marca el final.
Hace falta leer `NAXIS1/2`, `CRVAL1/2`, `CRPIX1/2`, `CDELT1/2` y `ZPT_0000`.
Hubo un `parseFITS` para el intento de DESI Legacy que se decidió **no**
rescatar (`d0a3641`); si mirarlo ahorra tiempo, está en `d0a3641^`.

## Comprobación

Asserts nuevos en `scripts/test_difuso.js`, **sin red**, con un parche sintético
en memoria (disco exponencial de magnitud y `r_e` conocidos, un cuadrante en
`NaN`, unas estrellas encima):

1. **Anclaje** — la luz integrada del parche pintado devuelve la V del catálogo
   dentro de tolerancia. Es el que importa: un error aquí no se ve, porque una
   galaxia dos veces más brillante sigue pareciendo una galaxia.
2. **Fusión** — la composición de dos parches con `NaN` complementarios no deja
   huecos.
3. **Máscara** — respeta el corte de magnitud y no toca el núcleo. Y la suma de
   flujo del difuso **no puede crecer** al bajar la magnitud límite del equipo.
4. **Colocación** — el parche cae donde dice el catálogo y a la escala que dice
   `CDELT`.
5. **`wcs=1`** — la URL que arma el código lo lleva siempre.

## Answer

_(pendiente: se responde al terminar la fase 1, junto con la ficha 07)_
