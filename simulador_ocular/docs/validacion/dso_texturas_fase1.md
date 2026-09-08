# Fase 1 del catálogo de texturas DSO — informe de cierre

Fecha: 2026-09-08. Prerregistro: ADR 0024 («Preregistro: catálogo de texturas
DSO»). Objetivo y listones: `docs/especificaciones/catalogo_dso_texturas_objetivo.md`,
§«Fase 1 — Sustituir la fuente, a igual resolución».

Qué hizo la fase, dicho entero: **cambiar de dónde salen los píxeles del parche
difuso**, sin tocar nada más. Antes venían de un FITS que un proxy propio pedía
a STScI en el momento; ahora vienen de un PNG de 16 bits con codificación
`asinh16` y su sidecar, generados offline y servidos desde el propio dominio.
El recorte es el mismo (`salida = 1024`), la ley de render es la misma y la
frontera declarada es una sola función: lo que devuelve `ps1LeerTextura` es
indistinguible en forma de lo que devuelve `parseFITS`. Nada aguas abajo
—anclaje al catálogo, mezcla, PSF, H2c, máscara difusa— sabe de dónde vino el
parche.

**Veredicto de la fase: L1.1 y L1.2 cierran limpios; L1.3 y L1.4 no.** En L1.3,
el listón no fijaba el enlace: la textura gana por un enlace real y pierde contra
un servidor en la misma máquina, y su aprobado en bytes depende de que producción
sirva el FITS crudo. En L1.4, la suite no está entera verde: quedan 4 rojos, los
cuatro de capas que esta fase no toca. Ninguna de las dos salvedades la causa la
sustitución de la fuente, y ninguna de las dos se da por buena aquí: se escriben,
con lo que cuesta cada una y con lo que dejan pendiente.

## Veredicto por listón

| Listón | Qué exigía | Medido | Veredicto | Dónde |
|---|---|---|---|---|
| **L1.1 Equivalencia** | `max\|Δ\| ≤ 0,05·σ` y `\|ΣΔ\|/Σ ≤ 1e-4` sobre `parche.datos`; NaN heredados idénticos; los de ausencia, ≤ 1e-4 del parche con el valor movido ≤ 1 paso y el corte movido ≤ 6,93 pasos; los 5 controles salen `fila` | los 69 objetos del banco dentro de umbral; en los 4 golden, `max\|Δ\|/σ` de 9,13e-3 a 2,82e-2 | ✅ PASA | `dso_texturas_l1_equivalencia.md` |
| **L1.2 Sin red** | manifiesto completo y `proxyRespaldo = false`: 0 peticiones fuera de `dso/` en el campo de M51 y en el de NGC 7008 | 0 peticiones fuera de `dso/` | ✅ PASA | `scripts/test_sin_red_dso.js` (guardián) |
| **L1.3 Coste** | tiempo de `ps1LeerTextura` ≤ el del FITS por proxy **en caliente**; bytes ≤ 0,5× | bytes 0,473–0,478× (margen del 4,6 %, y solo porque producción sirve el FITS crudo: comprimido serían 0,513×); memoria 4,00 MB/parche y 57,5 MB el campo de Virgo; tiempo 0,55–0,64× por 4G rápida y 1,4–3,8× contra un servidor en la misma máquina | ✅ PASA en bytes y memoria; ⚠️ en tiempo **depende del enlace** | `dso_texturas_l1_coste.md` |
| **L1.4 Guardianes** | la suite entera verde tras recapturar el golden, con el informe de deltas (todos ≤ L1.1) | 99 tests, 95 verdes y 4 rojos; **verdes los once que montan parche**, golden incluido; los deltas de las dos recapturas dentro de L1.1 (R2) o con su invariante propio medido (R1) | ⚠️ **NO PASA en su letra** —la suite no está entera verde— y **PASA en todo lo que la fase toca** | este informe, §«Las dos recapturas» y §«Los cuatro rojos» |

Sobre L1.3: la condición de tiempo no se cumple contra `php -S` en la misma
máquina, donde el transporte que la textura ahorra vale cero y solo se paga la
decodificación en JS; se cumple con margen en cuanto hay un enlace de por medio,
que es el caso del observador. El prerregistro ya decía que este listón podía
fallar «por lento sin ser incorrecto» y que entonces se documenta y se decide,
sin bloquear la sustitución de la fuente (nota de la US-3, #195; criterio 4 de
la T10, #207). Se decidió: la sustitución sigue adelante y el listón
prerregistrado no se toca. La nota está en el ADR 0024, «L1.3 medida: el listón
no fijaba el enlace».

Y una condición que el aprobado en bytes lleva pegada: el margen es del 4,6 % y
el PNG compite **comprimido contra un FITS crudo**. Comprobado contra producción
el 2026-09-08, `ps1-proxy.php` responde `application/fits` sin
`Content-Encoding`; con `gzip -6` el FITS de M51 se queda en 0,931× y la razón
sube a 0,513×, por encima del tope. Si algún día se comprime `application/fits`,
L1.3 hay que volver a medirlo.

Fuera de los cuatro listones, la fase llevó su **validación visual**: 26 vistas
por el camino viejo y 24 por el nuevo, con la resta imagen a imagen —63 píxeles
distintos en total, `\|Δ\|` máximo de 1 nivel, ningún píxel negro nuevo— y ni un
halo, borde, sobrecontraste o punteado estrenados. Las 2 vistas que no tienen
pareja son las de NGC 1982, que el generador dictaminó `ausencia-excesiva`
(#229) —y por eso el criterio de #206, que pedía las 26 en las dos etiquetas, no
se cumple en su letra: darlo por bueno con 24 exige reabrir el veredicto de #229
o aceptar que un objeto sin imagen no tiene vista, y eso no lo decide este
informe—. La validación visual no sustituye al golden ni a L1.1: se corrieron
los tres. `dso_texturas_vistas_fase1.md`.

## Las dos recapturas del golden

La fase movió la línea base del golden difuso dos veces, y ninguna de las dos
por el mismo motivo. Las tablas van copiadas aquí enteras; el porqué de cada
número, con su procedimiento y sus invariantes, está en el informe de cada
recaptura.

### R1 — la WCS del recorte en el camino de Node

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

R1 **no es una equivalencia**: es un cambio de geometría deliberado. Node montaba
el afín del parche sin el giro de la skycell y el navegador sí lo llevaba, así
que el guardián vigilaba un camino que no era el de producción (US-5, #197).
Girar el parche hasta 3,6° (M81) mueve los píxeles y tiene que moverlos, por eso
la columna «umbral» va vacía y el ✅ es cualitativo. Lo que R1 sí tenía que
respetar está medido: `thetaIntArcmin` **no se mueve** en ninguno de los cuatro
objetos, y los NaN suben donde el giro saca borde. Detalle completo:
`recaptura_r1_wcs.md`.

### R2 — la fuente del parche pasa a ser la textura

> Recaptura R2 · la fuente pasa a ser la textura · 2026-09-07 · `node v26.3.1` ·
> máquina de desarrollo

| Objeto | Capa | sha256 antes → después | Δsuma / suma | NaN antes → después | max\|Δ\| / σ | Umbral | Veredicto |
|---|---|---|---|---|---|---|---|
| M51 | `parche.datos` | `465b42a1e8c9…` → `45d2f1c7f520…` | +0,000 % | 105335 → 105348 (+13) | 2,82e-2 σ | 0,05 σ | ✅ |
| M51 | difuso 457,2 mm · 190× | `b294b7db74af…` → `ca761c8640cb…` | +0,000 % | 0 → 0 | — | 0,05 σ | ✅ |
| M51 | difuso 203 mm · 100× | `a4881a22215d…` → `2b3685facd28…` | +0,000 % | 0 → 0 | — | 0,05 σ | ✅ |
| M101 | `parche.datos` | `8b301deb2be1…` → `278bedf031fe…` | +0,000 % | 91216 → 91243 (+27) | 2,52e-2 σ | 0,05 σ | ✅ |
| M101 | difuso 457,2 mm · 190× | `53f96ad83010…` → `d85b3706d2fe…` | +0,001 % | 0 → 0 | — | 0,05 σ | ✅ |
| M101 | difuso 203 mm · 100× | `f3d0cc18d566…` → `a04930bf66b3…` | +0,001 % | 0 → 0 | — | 0,05 σ | ✅ |
| M104 | `parche.datos` | `f848d48b180c…` → `032678baff92…` | +0,000 % | 42530 → 42523 (−7) | 1,92e-2 σ | 0,05 σ | ✅ |
| M104 | difuso 457,2 mm · 190× | `9f63268bd85f…` → `848fcb1a380e…` | −0,000 % | 0 → 0 | — | 0,05 σ | ✅ |
| M104 | difuso 203 mm · 100× | `32e1aa1b2bbe…` → `5bdc6f53950f…` | −0,000 % | 0 → 0 | — | 0,05 σ | ✅ |
| M81 | `parche.datos` | `706a635b5a50…` → `4ffe9e3c20a5…` | +0,000 % | 81072 → 81035 (−37) | 9,13e-3 σ | 0,05 σ | ✅ |
| M81 | difuso 457,2 mm · 190× | `aea7c18da33b…` → `969aff5296d3…` | +0,000 % | 0 → 0 | — | 0,05 σ | ✅ |
| M81 | difuso 203 mm · 100× | `b8c7936419f0…` → `476bb4f03991…` | +0,000 % | 0 → 0 | — | 0,05 σ | ✅ |

R2 sí es una equivalencia, y su umbral es el de L1.1: los cuatro objetos entran
con `max|Δ|/σ` entre 9,13e-3 y 2,82e-2 contra un listón de 0,05·σ. Las sumas del
`parche.datos` no se mueven ni en la sexta cifra —anclar al catálogo las fija— y
las de los `difuso` se mueven como mucho un 0,001 %, cuatro órdenes de magnitud
por debajo de lo que movió R1 (hasta 2,031 %): esa es exactamente la diferencia
entre cambiar la geometría y cambiar solo la codificación. Los NaN heredados del
stack son idénticos (0 píxeles de diferencia) y los que se mueven son los de la
regla de ausencia, entre 7 y 37 por objeto, todos por debajo del tope de 1e-4
del parche. Detalle completo: `recaptura_r2_textura.md`.

Y lo que el golden gana, que no es un delta: su entrada deja de depender de un
servicio ajeno. El camino viejo cosía las skycells quedándose con el primer
píxel válido en el orden en que `ps1filenames.py` las devolvía, y ese orden no
lo garantiza nada aunque los stacks sean inmutables —el solape discrepa un 15 %
en la mediana—. Durante la validación visual, de hecho, una descarga degradada
se quedó cacheada y cambió el «antes» de NGC 6888. Es el motivo entero de la
decisión 9.1 del ADR 0024, y con R2 queda cobrado.

## Lo que la fase deja abierto

- **La sustitución no está desplegada.** El manifiesto declara filas, las
  texturas del banco viven en el repositorio para los tests y `proxyRespaldo`
  sigue encendido: en producción el objeto sin textura publicada cae al proxy
  como siempre. Subirlas por FTP es el T12 (#209).
- **57 objetos del banco siguen pendientes** de generación (informe del
  generador, `dso_texturas_informe.md`); el régimen mixto es el estado normal
  mientras tanto, y es lo que L1.2 comprueba que no esconde red por debajo.
- **NGC 1982 no tiene imagen donde está el objeto** y por eso no tiene vista por
  textura (#229, `ausencia-excesiva`). El veredicto es del generador, no de la
  fase.
- **Los arneses de medida antiguos que montan parche** quedaron atados a la
  geometría anterior a R1: sus informes publicados no se reproducen tal cual y
  se releen con la fecha de R1 delante. Ninguno es guardián.
- **`test_ps1_nan_ausencia` vuelve a estar verde** (batería del 2026-09-08,
  puesto 77 de 99). Estaba rojo cuando se hizo R1, por su propia causa —el
  fichero de línea base sin el bloque sintético— y no se recapturó entonces
  porque su modo `actual` fija una línea base irrecuperable. Quien lea el
  informe de R1 con esa nota, que la lea con esta fecha delante.

## Los cuatro rojos de la batería

La batería del 2026-09-08 (`node scripts/bateria.js -j 1`, 99 tests en 24 min
55 s; en serie porque con dos a la vez la máquina se queda sin memoria y el
sistema mata el proceso) deja 4 rojos:

| Test | Lo que falla | Qué tiene que ver con la fase |
|---|---|---|
| `test_bilineal_parche.js` | «el halo del parche de prueba está activo» | nada: es una condición de montaje del propio arnés, sobre el parche sintético que él fabrica |
| `test_halo_v7_e5.js` | E5.4, «el peor cociente de salto de S1 por magnitud de `m_res` es 161,219 (M13 514× SQM 21,5)» | nada: halo de globulares, otra capa (v7/E4) |
| `test_salud_globo.js` | «`salud-tip-valor` existe en el fragmento y lo usa el `.js`» | nada: el globo de la gráfica de salud, del registro |
| `test_segundo_auxiliar.js` | «`label.field` es `display:block` y gana al `[hidden]` del navegador» | nada: CSS del formulario de observaciones |

Ninguno lee textura y ninguno cambia con esta fase —`test_bilineal_parche` sí
monta parche, pero uno sintético que fabrica él mismo, y lo que le falla es una
condición de ese montaje—. La evidencia de que son ajenos es doble: lo que falla
cada uno, en la tabla de arriba, y que el cambio que trae este informe es solo
documentación: la batería que los pone en rojo mide un árbol cuyo código es el
de `main`. **Los once guardianes que sí montan parche
desde una fuente de la fase están verdes** —`test_golden_difusas`
(5 s, ya sobre la textura), `test_fuente_parche`, `test_dso_texturas`,
`test_png16`, `test_sin_red_dso`, `test_consumidores_dso`, `test_psf_produccion`,
`test_nebulosa_planetaria`, `test_nebulosas_emision_reflexion`,
`test_resto_supernova` y `test_ps1_nan_ausencia`—. Que sean ajenos no los
convierte en verdes: L1.4 pedía la suite entera y la suite no lo está. Lo que
esta fase puede afirmar es lo de la tabla de arriba, y lo que queda es deuda de
otras capas, con su fecha y su línea puesta aquí para que nadie la estrene otra
vez.

Esto tiene consecuencia, y conviene escribirla: el ADR 0024 no ejecuta una fase
sin el PASA completo de la anterior, así que **la fase 2 no arranca con estos
cuatro en rojo**. Ponerlos verdes —o darles su veredicto propio, que dos de
ellos huelen a hallazgo y no a regresión— es trabajo previo a la fase 2, no de
esta.

## Cómo se reproduce el veredicto entero

```
node scripts/harness_l1_equivalencia.js --md    # L1.1, el banco
node scripts/test_sin_red_dso.js               # L1.2
# L1.3: php -S localhost:8080 scripts/dev_servidor_ocular.php
#       + scripts/harness_l1_coste.html en el navegador (ver su informe)
node scripts/bateria.js -j 1                   # L1.4, la suite entera (en serie: 8 GB)
node scripts/test_golden_difusas.js            # el guardián recapturado
node scripts/comparar_vistas.js antes despues  # la validación visual
```
