# 30. El 27 de ADR-0010 eran dos cantidades distintas

- Estado: aceptada
- Fecha: 2026-09-22
- Enmienda a: [ADR-0010](0010-suelo-27-deteccion-ojo.md)
- Relacionada: `simulador_ocular/docs/referencias/crumey-2014-umbral-de-contraste.md` §3.2b, P2
- Épica: #337 (US #338)

## Contexto

ADR-0010 decidió aplicar **el mismo suelo, 27 mag/arcsec²**, en dos sitios de
`resources/js/bitacora-gaia-render.js` y lo llamó con un solo nombre: «el suelo
de detección del ojo humano». Crumey (2014, MNRAS 442, 2600) obliga a mirar
otra vez: da **25,08 mag/arcsec²** (Ecs. 70–73) para el punto en que oscurecer
más el cielo deja de mejorar el umbral de detección — una afirmación física
distinta de «el ojo ya no distingue ese fondo del negro» (Blackwell 1946,
§2.1, Fig. 3, B ≲ 10⁻⁵ cd/m²).

Este US no decide si 27 debe bajar a 25,08 (eso es #342). Decide **qué nombre
lleva cada sitio del código** y si de verdad hablan de lo mismo.

### Búsqueda exhaustiva de consumidores del valor 27

| Sitio | Qué hace | Clasificación |
|---|---|---|
| `bitacora-gaia-render.js:757` — `SB0T = Math.min(27, Math.max(sqm, SB0T))` | Techo del fondo efectivo que entra en `magLimite` (Ec. 6 de Torres Lapasió) | **Cantidad A** — corte de fondo cero |
| `bitacora-gaia-render.js:205` — `SB_SUELO_PINTADO: 27` (consumido en `:352-357` para construir `FcieloPintado`) | Guarda del divisor de `valorDeFlujo` en `pintarFot`, evita que el contraste explote cuando `Fcielo → 0` | **Cantidad B** — guarda de saturación del pintado, anclada a A por diseño |
| `simulador_ocular/resources/js/bitacora-ocular.js:420-440` | Comentario que documenta la Ec. 5/6/7 de `magLimite` | Describe **A**; no es un consumidor independiente |
| `scripts/test_difuso.js` §9b/9c, `scripts/harness_ricco_seeing.js`, `scripts/test_alfa_magblanco.js`, `scripts/harness_alfa_estrellas.js` | Tests/harnesses de producción | Ejercitan **A** y **B**; no son un tercer sitio |
| `simulador_ocular/docs/experimentos/ricco/harness_ricco.js:58` — `Math.min(27, mag)` | Recorta `mag` al dominio de la tabla `LTC` (datos tabulados de Torres Lapasió) | **Cantidad C** — límite del dominio de una tabla de datos, no una constante física del render. Vive en un experimento aparte (`docs/experimentos/ricco/`), no en producción. Fuera de alcance de este US. |

No hay más apariciones de `27` en `resources/js`, `simulador_ocular/resources/js`
ni `mapa/js` ligadas a fondo de cielo o umbral del ojo (búsqueda por
`SB_SUELO_PINTADO`, `FcieloPintado` y por `27` en contexto de `SB`/`suelo`/
`techo`/`Fcielo`/`cielo`/`clamp`).

## Decisión

**Cantidad A — «corte de fondo cero» (`SB0T` en `magLimite`, `:757`).**
Es la cantidad que describe Crumey en las Ecs. 70–73: el punto en que un cielo
más oscuro deja de subir la magnitud límite, porque el ajuste de Torres
Lapasió (parábola con vértice en SBe = 30,4) ya no es el mecanismo que manda.
El repo la fija en 27; Crumey da 25,08 con fuente primaria (Blackwell,
corroborado por Crawford 1937) para el mismo mecanismo. Son la misma
*cantidad física*, con dos valores candidatos — decidir cuál usar es #342.

**Cantidad B — «guarda de saturación del pintado» (`SB_SUELO_PINTADO`,
`FcieloPintado`, `:205`).** NO es una cantidad física con fuente primaria
propia. `valorDeFlujo(F, Fcielo, rango)` divide por `Fcielo`; con un cielo
irreal ese divisor tiende a cero y el píxel pintado se dispara a blanco. El
guarda existe para que la UI no muestre un blanco absurdo, no porque el ojo
tenga un segundo techo distinto para lo que ve en pantalla.

**Por qué B sigue el mismo valor que A, por diseño y no por coincidencia.**
El motivo original de ADR-0010 (Fallo B) fue que la UI enseña juntos "fondo en
ocular" (que usa A) y "magnitud límite" (que usa A): si el pintado usara un
techo distinto, el color del cielo y el número de `magLimite` volverían a
contar historias distintas para el mismo `SBe`. B se define como **igual a
A por anclaje**, no como una segunda medida del suelo de detección del ojo.
Si #342 mueve A a 25,08, B se mueve con él automáticamente — es la misma
constante leída dos veces, no dos constantes coincidentes.

**Cantidad C — el clamp de `harness_ricco.js:58`** no es ni A ni B: acota el
índice de una tabla de datos (`LTC`) al rango que Torres Lapasió tabuló. Se
deja fuera de este ADR.

## Consecuencias

- Los comentarios de `:199-205` y `:749-757` pasan a nombrar cada uno su
  propia cantidad (A o B) en vez de decir «este mismo 27» el uno del otro.
- `bitacora-ocular.js:420-440` se corrige para no llamar a A «umbral de
  detección del ojo» sin más: es el corte de fondo cero de Torres Lapasió, que
  Crumey corrobora con un mecanismo equivalente y un valor primario distinto.
- Este US no cambia ningún valor numérico ni ninguna línea ejecutable — el
  diff es documentación y comentarios, tal como pide el AC 6.
- #342 decide, con prerregistro, si A (y por tanto B) bajan de 27 a 25,08.

## Verificación

Lectura cruzada: ningún comentario en `:199-205` ni `:749-757` describe el
otro sitio como «este mismo 27» tras este cambio (AC 5). Tabla de
consumidores de arriba cubre toda aparición de `27` ligada a fondo de cielo
en el repo (AC 3).
