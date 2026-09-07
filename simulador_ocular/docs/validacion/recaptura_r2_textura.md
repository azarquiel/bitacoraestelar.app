# Recaptura R2 — la fuente del parche pasa a ser la textura

Fecha: 2026-09-07. Causa, **una sola**: `scripts/test_golden_difusas.js` deja de
pedirle el parche a `lib_bajar_parche.js` y lo lee con `ps1LeerTextura` —la
función del navegador— sobre las texturas versionadas de
`scripts/fixtures/dso/`. Procedimiento:
`simulador_ocular/docs/notas/recaptura-golden-difusas.md`. Prevista en su tabla
como R2.

Máquina: la del desarrollo (Darwin 25.6.0), `node v26.3.1`. La misma que fijó la
línea base de R1, así que los deltas de abajo son comparables.

## Cómo se reproduce

```
node scripts/test_golden_difusas.js        # verde antes y verde después
node scripts/harness_l1_equivalencia.js    # los deltas que el golden no puede dar
```

El golden guarda hashes y agregados, no píxeles: `max|Δ|` y la clasificación de
los NaN salen del comparador de L1.1, que monta los dos caminos en el mismo
proceso (`docs/validacion/dso_texturas_l1_equivalencia.md`).

**Verde antes**: la ejecución previa al cambio reprodujo bit a bit la línea base
que estaba en el árbol, con el camino del FITS. Verde después de capturar.

## Qué gana el golden con esto

Su entrada deja de depender de un servicio ajeno. `lib_bajar_parche.js` cosía
las skycells quedándose con el primer píxel válido en el orden en que
`ps1filenames.py` las devolvía, y el solape discrepa un 15 % en la mediana: los
stacks de PS1 son inmutables, pero **ese orden no lo garantiza nada**. Es el
motivo entero de la decisión 9.1 del ADR 0024, y con R2 queda cobrado: el test
no toca la red ni la caché de FITS.

## Tabla de deltas

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

Las sumas de `parche.datos` no se mueven ni en la sexta cifra: anclar a catálogo
las fija. Las de los `difuso` se mueven como mucho un 0,001 %, cuatro órdenes de
magnitud por debajo de lo que movió R1 (hasta 2,031 %), que es la diferencia
entre cambiar la geometría y cambiar solo la codificación.

## Los invariantes que R2 tenía declarados

El procedimiento le exigía tres cosas a esta recaptura, y las tres están medidas:

- **`thetaIntArcmin` no se mueve** en ninguno de los cuatro (12,92118488928559 ·
  23,17892750096088 · 8,521997910915951 · 20,806562154656127, idénticos antes y
  después). Sale de la fila de catálogo, no del parche.
- **Los NaN heredados del stack: cero píxeles de diferencia.** El comparador de
  L1.1 los cuenta aparte y da 0 en los 69 objetos del banco, los cuatro de aquí
  incluidos. El centinela 0 los transporta exactos.
- **La cuenta total de NaN solo se mueve por la frontera de ausencia, y dentro
  del tope.** El cruce sale exacto: el golden mide +13, +27, −7 y −37, y el
  comparador cuenta 13, 27, 7 y 37 píxeles discrepantes por la regla de
  ausencia en esos mismos objetos. Ni uno más. Como fracción del parche: 1,2e-5,
  2,6e-5, 6,7e-6 y 3,5e-5, todos por debajo del tope de 1e-4.

Y los deltas de L1.1 en los cuatro, con la condición del 2026-09-07:

| Objeto | max\|Δ\|/σ | \|ΣΔ\|/Σ | NaN de ausencia | valor movido | corte movido |
|---|---|---|---|---|---|
| M51 | 2,82e-2 | 1,56e-11 | 13 (1,2e-5) | 0,50 pasos | 0,11 pasos |
| M101 | 2,52e-2 | 1,55e-11 | 27 (2,6e-5) | 0,49 pasos | 0,08 pasos |
| M104 | 1,92e-2 | 9,89e-10 | 7 (6,7e-6) | 0,49 pasos | 0,28 pasos |
| M81 | 9,13e-3 | 1,08e-9 | 37 (3,5e-5) | 0,45 pasos | 0,78 pasos |

Umbrales: 0,05·σ, 1e-4, 1e-4 del parche, 1 paso y 6,93 pasos.

## Los demás guardianes

`test_fuente_parche`, `test_dso_texturas`, `test_psf_produccion`,
`test_nebulosa_planetaria`, `test_nebulosas_emision_reflexion` y
`test_resto_supernova` siguen verdes. Ninguno cambia de fuente: solo el golden
lee la textura, porque solo él tiene sus once fixtures en el repositorio.
