# Diagnóstico: con halo se dibujan la mitad de las estrellas de M13

Síntoma del observador: la imagen real de M13 se parece, **en número de
estrellas**, al render SIN halo, no al render CON halo.

## Bucle de medida

`node scripts/harness_halo_estrellas.js [--sqm N] [--D mm] [--mag N] [--size px]`

Reproduce las lecturas de la captura (173×, pupila de salida 2,7 mm → D = 467 mm,
campo 0,47°, lienzo 720 px = PROC del simulador) y cuenta **estrellas dibujadas
por anillo radial**, con el catálogo Gaia DR3 real cacheado en
`docs/halo_v7/m13_gaia_dr3.csv` (cono 0,24°, G < 18,5, TAP de ESA).

Tres columnas:

- `sin halo` — Gaia con G ≤ mag límite puntual del equipo: lo que pinta el render
  en cualquier campo que no sea un globular del catálogo.
- `con halo` — lo que devuelve `pintarCumulo` y además sobrevive al corte `mlim`
  de `capaEstrellas` (el camino real del simulador).
- `con halo (sin corte mlim)` — solo la clasificación por `m_res`.

Medida (D = 467 mm, 173×, SQM 21, 720 px):

```
 r/r_h    m_res   sin halo   con halo   con halo(sin corte mlim)
 <=0.25   13.78        154         31         55
 <=0.50   14.50        282         76        134
 <=1.00   15.20        441        190        357
 <=2.00   16.03        438        297        438
 <=4.00   16.17        280        229        280
 <=8.00   16.18        203        162        203
 total                1798        985       1467
```

**45 % de las estrellas desaparecen.** Y se reparte en dos causas separables:
la clasificación se lleva 1798 → 1467 (18 %, casi todo dentro de r_h), y el
corte `mlim` posterior se lleva otro 1467 → 985 (27 % más), **a todos los
radios, incluso a 8 r_h donde el velo es despreciable**.

## Hipótesis, ordenadas

### 1. La banda de transición se cobra dos veces el límite del cielo (causa principal)

`m_res = min(m_crowd, m_lim,sky)`. Lejos del núcleo no hay aglomeración, así que
manda `m_lim,sky`, y donde el velo es despreciable `m_lim,sky ≈ mlim` (16,17 vs
16,18 a 4 r_h en la tabla). Entonces la banda `[m_res−Δ, m_res+Δ]` con Δ = 1 mag
**se monta justo encima de `mlim`**, y en una muestra limitada en magnitud ahí
vive la mayoría de las estrellas.

Cada una de ellas sale de `estrellasCumulo` con
`m_eff = m + 2.5·log10(1/a)` (`bitacora-gaia-render.js:1639`). Una estrella en
`m = m_res` tiene `a = 0.5` → `m_eff = m + 0.75`. Y `capaEstrellas` compara
**esa m_eff** con `mlim` (`:3448`, `:3452`): la degrada a la rama de *glow*
(alfa `alfaMin·10^(−0,4·Δm)`, sin tamaño físico) o la tira por `glowCorte`.

Es decir: el mismo umbral fotométrico se aplica dos veces —una suave, como
banda; otra dura, como `mlim`— y sobre una magnitud que el propio código declara
que no debe volver a la física («`m_eff` no vuelve nunca a S1/S2, ni a m_res, ni
a la conservación: es un número de dibujo», `:1620`). `capaEstrellas` rompe ese
invariante.

- Predicción: juzgar `mlim` con `m` y usar `m_eff` solo para alfa/tamaño
  devuelve la columna 3 (1467 de 1798, −18 %) y deja la pérdida solo donde hay
  aglomeración real.
- Invariante que hoy se viola: **donde el velo del cúmulo es despreciable, el
  render tiene que reducirse al de cielo pelado.** A 8 r_h da 162 contra 203.

### 2. El tamaño del píxel del lienzo entra en la física de la resolución

`omegaBeam = max(π·(fwhm/2)², areaPx)` (`:1542`) y ese Ω se pasa a
`pob.mCrowd(...)`, o sea a la clasificación. En la captura Ω_píxel = 5,52 as² >
Ω_óptica = 3,42 as²: **manda el lienzo, no el telescopio ni la atmósfera.**

Medido con `--size 1440`: `m_res` en el núcleo baja de 13,78 a 14,32 y el total
sube de 985 a 1071. El `max()` es correcto para el grano (un píxel promedia la
fluctuación: aliasing), pero contamina una capa que por diseño no debe leer
parámetros de las posteriores. Arreglo: dos Ω, la óptica para `m_crowd`/`m_res`
y la de píxel solo para σ del grano.

### 3. La banda pierde flujo (no explica el conteo, sí el balance)

El campo se integra con corte duro en `m_res+Δ` (`S1(m+delta)`,
`tablaCumulo`), así que **ninguna** estrella de la banda está en el velo; pero
cada una se dibuja con peso `a < 1`. El `(1−a)` no está en ningún sitio: la mitad
del flujo de la banda se pierde. Contra ADR 0003 (conservación como test).

### 4. `m_crowd` con k = 30 en el núcleo (probablemente no es el bug)

Incluso sin el corte `mlim`, dentro de 0,25 r_h se pasa de 154 a 55 estrellas.
Es lo que el modelo quiere hacer (el núcleo aglomera), y CONTEXT.md ya dice que
el régimen es de seeing y no de difracción. Se mide, no se toca, hasta que 1 y 2
estén arreglados: con esos dos fuera el conteo global sube a ~1590/1798 (88 %),
que es lo que el observador describe.

## Siguiente paso

Arreglar 1 (diff mínimo: `capaEstrellas` decide detección con `m`, dibujo con
`m_eff`) y 2 (separar las dos Ω), volver a correr el arnés y comparar contra la
imagen real. 3 pide una decisión de modelo aparte.
