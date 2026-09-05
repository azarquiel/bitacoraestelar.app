# Recaptura R1 — la WCS del recorte en el camino de Node

Fecha: 2026-09-06. Causa: `scripts/lib_bajar_parche.js` devuelve la WCS del
recorte por defecto, así que `ps1AfinParche` monta el afín con el giro de la
skycell, igual que el navegador. Procedimiento:
`simulador_ocular/docs/notas/recaptura-golden-difusas.md`. Origen de la causa:
`dso_texturas_fase0.md` §«Discrepancias», punto 6.

Máquina: la del desarrollo (Darwin 25.6.0, arm64), `node v26.3.1`. Los hashes
valen contra la línea base anterior **de esta misma máquina**, que es la que
estaba en `scripts/fixtures/golden_difusas.json`.

## Cómo se reproduce

```
node scripts/test_golden_difusas.js    # verde antes y verde después de la captura
node scripts/harness_r1_wcs.js         # el mismo objeto con la WCS apagada y encendida
```

El golden guarda hashes y agregados, no píxeles: `max|Δ|` y σ salen del
comparador, que monta los dos caminos en el mismo proceso.

El «verde antes» del paso 1 es comprobable a posteriori: la ejecución previa al
cambio reprodujo bit a bit la línea base que estaba en `main`
(`git show main:scripts/fixtures/golden_difusas.json`), así que basta con volver
a esa revisión y correr el golden para repetirlo.

## Qué respalda que Node y el navegador monten el mismo afín

El comparador enfrenta Node-sin-WCS contra Node-con-WCS: el navegador **no**
entra en esa medida, y no puede, porque el arnés no tiene `XMLHttpRequest`. Lo
que sostiene la equivalencia es estructural, y conviene decirlo en vez de darlo
por hecho:

- El afín lo construye **la misma función** en los dos caminos,
  `window.BitacoraPS1.ps1AfinParche`, sobre el mismo campo `wcs`.
- Ese campo lo produce **el mismo lector**, `parseFITS`, sobre el FITS que sirve
  `fitscut` con `&wcs=1` —`lib_bajar_parche.js` replica la URL de
  `ps1-proxy.php:105` (`ps1_url_recorte`)—.
- La costura se queda con el primer píxel válido y conserva la cabecera de la
  primera capa en los dos sitios (`coser` ≡ `ps1_fusionar`, `ps1-proxy.php:179`).

Queda una diferencia real que esto no cierra: la caché del proxy sirve parches
de **512 px** y el golden monta a **1024**, así que los coeficientes del afín no
son el mismo número, solo la misma geometría (mismo giro, misma escala por
píxel salvo el factor de muestreo). Medir el afín del navegador de verdad pide
un arnés de navegador, que no existe todavía.

## El giro que entra

El afín deja de estar alineado al norte y pasa a llevar el de la skycell:

| Objeto | Giro de la skycell | cx, cy (sin → con) |
|---|---|---|
| M51 | −0,020° | 511,500 → 511,676 · 511,500 → 511,524 |
| M101 | +1,095° | 511,500 → 511,564 · 511,500 → 511,634 |
| M104 | +0,023° | 511,500 → 511,597 · 511,500 → 511,787 |
| M81 | −3,584° | 511,500 → 511,641 · 511,500 → 511,513 |

M51 es casi ciega al fallo (0,02°) y M81 es la que más lo acusa (3,6°): eso
explica por qué la divergencia pudo vivir tanto tiempo sin que un ojo la viera.

## Tabla de deltas

> Recaptura R1 · WCS del recorte · 2026-09-06 · `node v26.3.1` · máquina de desarrollo

| Objeto | Capa | sha256 antes → después | Δsuma / suma | NaN antes → después | max\|Δ\| / σ | Umbral | Veredicto |
|---|---|---|---|---|---|---|---|
| M51 | `parche.datos` | `9177b3a63295…` → `465b42a1e8c9…` | +0,000 % | 105328 → 105335 | 0,30 σ | — (geometría) | ✅ |
| M51 | difuso 457,2 mm · 190× | `82685972968b…` → `b294b7db74af…` | −0,132 % | 0 → 0 | 35,4 σ | — | ✅ |
| M51 | difuso 203 mm · 100× | `599f7fe01d7d…` → `a4881a22215d…` | +0,276 % | 0 → 0 | 38,8 σ | — | ✅ |
| M101 | `parche.datos` | `1bb920c2a62a…` → `8b301deb2be1…` | −0,000 % | 91025 → 91216 | 23,6 σ | — | ✅ |
| M101 | difuso 457,2 mm · 190× | `6168dc84efb9…` → `53f96ad83010…` | −1,157 % | 0 → 0 | 277,3 σ | — | ✅ |
| M101 | difuso 203 mm · 100× | `1aef3c5959a0…` → `f3d0cc18d566…` | +2,031 % | 0 → 0 | 326,2 σ | — | ✅ |
| M104 | `parche.datos` | `042f7ab50130…` → `f848d48b180c…` | −0,000 % | 42481 → 42530 | 0,12 σ | — | ✅ |
| M104 | difuso 457,2 mm · 190× | `43b271616732…` → `9f63268bd85f…` | −0,161 % | 0 → 0 | 28,6 σ | — | ✅ |
| M104 | difuso 203 mm · 100× | `e7ed84f47086…` → `32e1aa1b2bbe…` | +0,050 % | 0 → 0 | 37,5 σ | — | ✅ |
| M81 | `parche.datos` | `232064e76c1c…` → `706a635b5a50…` | −0,000 % | 77362 → 81072 | 223,7 σ | — | ✅ |
| M81 | difuso 457,2 mm · 190× | `0023411241fe…` → `aea7c18da33b…` | +0,166 % | 0 → 0 | 242,3 σ | — | ✅ |
| M81 | difuso 203 mm · 100× | `0d64b3175471…` → `b8c7936419f0…` | −0,837 % | 0 → 0 | 464,7 σ | — | ✅ |

El ✅ de la columna «veredicto» no dice «pasa un listón» —no hay listón que
pasar, ver el apartado siguiente—: dice que la capa cambió como tenía que
cambiar y que el invariante declarado de R1 aguanta. Es un veredicto
cualitativo, y conviene leerlo como tal.

`max|Δ|` se mide solo donde los dos caminos tienen píxel finito; σ es la de la
capa «antes». Las columnas de suma del `parche.datos` salen a −0,000 %: la
suma sobrevive porque anclar a catálogo la fija; lo que se mueve es dónde cae
cada píxel.

## Por qué la columna «umbral» va vacía

El 0,05·σ de la plantilla es el listón de **equivalencia**: vale cuando dos
caminos deben pintar lo mismo (R2, la codificación de la textura). R1 no es una
equivalencia, es un **cambio de geometría deliberado**: girar el parche 3,6° en
M81 mueve los píxeles, y tiene que moverlos. Presentar aquí un 0,05·σ sería
inventarse un aprobado. Lo que R1 sí tiene que respetar es lo que declaró el
ticket, y eso está medido:

- **`thetaIntArcmin` no se mueve** en ninguno de los cuatro objetos
  (12,92118488928559 · 23,17892750096088 · 8,521997910915951 ·
  20,806562154656127, idénticos antes y después). Sale de la fila de catálogo,
  no del parche.
- **Los NaN suben** (+7, +191, +49, +3710): el giro recoloca la costura entre
  skycells y la máscara de estrellas, que es exactamente lo que el procedimiento
  anticipaba para R1. M81, la del giro grande, es la que más NaN gana. El neto
  esconde que también hay NaN que desaparecen: los píxeles que **cambian de
  estado** (finito↔NaN) son 41, 191, 63 y 4024, frente a netos de +7, +191, +49
  y +3710. Solo en M101 coinciden; en M51 y M104 el giro devuelve píxeles al
  mismo tiempo que se lleva otros.
- **Los demás guardianes que montan parche siguen verdes**
  (`test_psf_produccion`, `test_nebulosa_planetaria`,
  `test_nebulosas_emision_reflexion`, `test_resto_supernova`).

`test_ps1_nan_ausencia.js` estaba **ya rojo antes del cambio**, en `main` y en
esta misma máquina, y por otra causa (su fichero de línea base no trae el bloque
sintético: `base.sint` es `undefined`). No se ha tocado ni recapturado: su modo
`actual` fija una línea base irrecuperable.

## Qué queda pendiente

La caché de parches de Node (`bitacora-ps1-harness`) no distingue en su clave si
la entrada se pidió con WCS o sin ella; lo que distingue es la presencia de la
clave `wcs` dentro del fichero. Una entrada vieja sin esa clave se vuelve a
descargar la primera vez que alguien la pide con WCS —es decir, ahora, siempre—.
Las entradas de los cuatro objetos del golden ya la traían, así que esta
recaptura no ha necesitado red.

Los arneses de medida antiguos que montan parche (`harness_interbrazos`,
`harness_m104_*`, `harness_escena_quitar_estrellas`, `harness_deficit_mezcla`…)
pasan también a la geometría nueva: sus informes publicados quedan atados a la
geometría vieja y no se reproducen tal cual. Ninguno es guardián —los `test_*`
que montan parche están comprobados uno a uno más arriba—, así que no se
recapturan: se releen con esta fecha delante.
