# Recaptura R3 — resolución por objeto (regla C, fase 2)

Fecha: 2026-09-22. Causa, **una sola**: la textura que lee
`scripts/test_golden_difusas.js` deja de estar clavada a 1024 px fijos y pasa a
la resolución de la regla C del ADR 0024 (`salida(lado) = clamp(ceil(lado·60 /
0,5), 128, 2048)`), decidida por el tamaño de cada objeto. Procedimiento:
`simulador_ocular/docs/notas/recaptura-golden-difusas.md`. Prevista en su tabla
como R3.

**Deuda ya contraída, no solo planificada.** El commit `dd02bfa` regeneró las
11 texturas golden a la resolución nueva dentro del PR #352 (mezclado en
`main`), pero `test_golden_difusas.js` seguía comparando contra `PS1.salida`
—un único valor fijo de fase 1— y `scripts/fixtures/golden_difusas.json` nunca
se recapturó. El guardián llegó a `main` roto (`ERROR: NGC 5194: la textura
mide 2048 px y PS1.salida es 1024`), no rojo por otra causa ajena: era la misma
causa de R3, a medio implantar. Esta recaptura completa lo que `dd02bfa` dejó
a medias.

## Cambio de código

`scripts/test_golden_difusas.js`, función `texturaDe()`: el chequeo de
resolución dejó de comparar contra `PS1.salida` (fijo) y pasa a comparar contra
`API.ps1SalidaParche(gal.ladoArcmin)` (regla C, por objeto). Es parte de la
misma causa — sin este cambio el guardián ni siquiera llega a medir, revienta
con una excepción antes de comparar nada.

## Máquina — con aviso

`node v26.9.0`, máquina de desarrollo. La línea base que sustituye esta
recaptura (`golden_difusas.json` de R5, 2026-09-13) se capturó con
`node v26.3.1`. **La comparación no es limpia entre versiones de Node**: parte
del delta de abajo puede venir del cambio de `libm` (`Math.exp`, `Math.pow`),
no solo de la resolución. Se declara aquí en vez de presentarse como delta
puro, según el procedimiento (paso 0).

## Cómo se reproduce

```
node scripts/test_golden_difusas.js              # verde antes y verde después
node scripts/harness_l23_flujo_resolucion.js      # L2.3 / AC3, 69 objetos del banco
```

**Verde antes**: no lo estaba. El golden llegó a `main` con la excepción de
arriba — no es el "verde antes" limpio que pide el paso 1 del procedimiento.
Se documenta como parte del hallazgo, no se finge un verde previo que no hubo.
**Verde después de capturar**: sí, `GOLDEN: todo bit a bit.`

## Tabla de deltas

> Recaptura R3 · resolución por objeto (regla C) · 2026-09-22 · `node v26.9.0` ·
> máquina de desarrollo · **Node distinto de la línea base sustituida** (ver
> arriba)

| Objeto | Capa | resolución antes→después | sha256 antes → después | NaN antes → después | Veredicto |
|---|---|---|---|---|---|
| M51 | `parche.datos` | 1024→2048 px | `42d9733ad0a1…` → `7bac823ed25f…` | 130679 → 383316 (+252637) | ✅ geometría cambiada a propósito |
| M51 | difuso 457,2 mm · 190× | (lienzo fijo 720²) | `cd298c455480…` → `837b21d25d06…` | — | Δsuma −0,006 % |
| M51 | difuso 203 mm · 100× | (lienzo fijo 720²) | `cfd28faaf66b…` → `8e24216228e7…` | — | Δsuma +1,11 % |
| M101 | `parche.datos` | 1024→2048 px | `3435b16d8377…` → `994060d4963a…` | 197819 → 560048 (+362229) | ✅ geometría cambiada a propósito |
| M101 | difuso 457,2 mm · 190× | (lienzo fijo 720²) | `68fe7a3fa141…` → `a1e50ee3dfb8…` | — | Δsuma −1,22 % |
| M101 | difuso 203 mm · 100× | (lienzo fijo 720²) | `defc35ed4cb5…` → `5e6bddc0b721…` | — | Δsuma −0,26 % |
| M104 | `parche.datos` | 1024→1590 px | `765489cc7d3e…` → `7311f8f80e08…` | 47300 → 89681 (+42381) | ✅ geometría cambiada a propósito |
| M104 | difuso 457,2 mm · 190× | (lienzo fijo 720²) | `a20b526bc1bb…` → `59812c6f1bb5…` | — | Δsuma +0,61 % |
| M104 | difuso 203 mm · 100× | (lienzo fijo 720²) | `31b3f7d12f6c…` → `4aaab1d2cfc4…` | — | Δsuma +0,24 % |
| M81 | `parche.datos` | 1024→2048 px | `667f5bab4cec…` → `e84525f51b93…` | 80145 → 156929 (+76784) | ✅ geometría cambiada a propósito |
| M81 | difuso 457,2 mm · 190× | (lienzo fijo 720²) | `677c0c2d0878…` → `f96b3c1d7b1a…` | — | Δsuma +1,40 % |
| M81 | difuso 203 mm · 100× | (lienzo fijo 720²) | `63a11f6a5a9f…` → `b3ffd2d33a6c…` | — | Δsuma +2,61 % |

`parche.datos` cambia de tamaño a propósito (R3 lo cambia todo, ancho y alto
incluidos, según su fila en la tabla de recapturas): comparar sumas o `max|Δ|`
entre dos mallas de tamaño distinto no es la equivalencia bit a bit de R2, así
que esa columna se deja vacía a propósito, igual que R1 la dejó vacía por girar
el parche — el invariante propio de R3 va abajo. Los `difuso` sí viven en un
lienzo fijo (720×720, la vista final del ocular) y ahí `Δsuma/suma` es
comparable entre antes y después; se mueve entre 0,006 % y 2,61 %, mayor que
los 0,001 % de R2 porque aquí el remuestreo de origen cambia de verdad, y
menor que los puntos porcentuales de R1.

## Los invariantes que R3 tiene declarados

- **`thetaIntArcmin` no se mueve.** Confirmado en los cuatro, idéntico bit a
  bit antes y después: 12,92118488928559 · 23,17892750096088 ·
  8,521997910915951 · 20,806562154656127. Sale de la fila de catálogo, no del
  parche — la regla C no lo toca.
- **El flujo total por objeto, L2.3: no aplica entre resoluciones distintas
  — decidido en #366.** El control nulo (1024 vs 1000 px, mismo lado de
  fase, 2,4 % de diferencia) ya rompe el listón de ±2e-3 en 3 de 6 objetos;
  leído en σ del cielo por píxel, el nulo y la comparación real salen
  indistinguibles (mediana 0,05 vs 4,94e-2 σ/px; peor 0,36 vs 3,56e-1 σ/px).
  L2.3 no separa "rompe por fase 2" de "rompe por cualquier remuestreo de
  `fitscut`", así que medir contra él no falsea nada de esta recaptura:

  ```
  node scripts/harness_l23_flujo_resolucion.js
  L2.3 / AC3 sobre 69 objetos, listón ±0,002
    |Δflujo|      mediana 9,74e-3 · peor 1,26e-1 (63× el listón)
    en σ/px       mediana 4,94e-2 · peor 3,56e-1
    fuera del listón: 60 de 69
  ```

  Detalle de la decisión y de por qué las otras dos opciones (medir en σ/px
  con un listón nuevo, o medir con una apertura) no tienen ancla: ADR 0024,
  «Corrección de la redacción de L2.3». R3 queda sin invariante de flujo que
  comprobar entre fases; el invariante que sí sigue vigente,
  `test_resolucion_ps1.js` dentro de una misma resolución, sigue en verde.

## Qué gana el golden con esto

Antes de esta recaptura el guardián no arrancaba: cualquier objeto cuya
resolución nueva no coincidiera con el `PS1.salida` fijo tiraba una excepción,
no un fallo comparable. Ahora vuelve a significar algo — compara lo que la
regla C produce hoy contra una línea base propia de fase 2, en vez de
comparar contra un supuesto de fase 1 que ya no es cierto para ningún objeto
del banco.

## Los demás guardianes

```
node scripts/test_resolucion_ps1.js   # verde
node scripts/test_dso_texturas.js     # 2 fallo(s), rojo previo — no lo mueve este commit
```

`test_resolucion_ps1.js` sigue verde. `test_dso_texturas.js` da **2 fallos** en
este árbol: `El manifiesto commiteado sale de los sidecars commiteados` y
`El informe sale de lo escrito`, ambos "regenerarlo no cambia un byte". No los
causa este diff — `git status` antes de tocar nada solo trae
`scripts/test_golden_difusas.js`, `scripts/fixtures/golden_difusas.json` y este
documento. El sospechoso es `sidecarsUnicos()` (`gen_dso_texturas.js`), cuyo
desempate final usa `_mtime` de fichero cuando el rango y el directorio
empatan: en un checkout fresco (este worktree, `git worktree add` desde
`origin/main`) el orden de mtimes entre sidecars duplicados del mismo objeto
no coincide con el de un checkout viejo, y el manifiesto regenerado puede
elegir una versión distinta a la comprometida. Confirmado estable dentro de
este checkout (dos corridas seguidas, mismo resultado) — no es intermitencia,
es dependencia del checkout. Queda fuera del alcance de #325; se declara aquí
para que AC4 no le atribuya el rojo a esta recaptura.

## Qué queda pendiente

- El aviso de versión de Node (R5 en `v26.3.1`, esta recaptura en `v26.9.0`)
  significa que la próxima comparación limpia contra esta línea base necesita
  la misma máquina y versión, o repetir el aviso.
