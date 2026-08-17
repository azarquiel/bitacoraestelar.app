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

## Arreglo aplicado (1 y 2)

**1 · La detección se juzga con `m`, el dibujo con `m_eff`.** `estrellasCumulo`
entrega la magnitud original en la 5ª casilla y `capaEstrellas` compara *esa* con
`mlim`; `m_eff` sigue gobernando alfa, tamaño y blur, que es lo único que tenía
que hacer. La estrella de la banda se apaga y encoge, pero ya no vuelve a
juzgarse contra el umbral que acaba de pasar.

**2 · Dos Ω.** `omegaRes = π(fwhm/2)²` (telescopio + atmósfera) manda en
`m_crowd` y en `m_res`; `omegaBeam = max(omegaRes, areaPx)` se queda para σ del
grano, donde el promediado del píxel sí es real. `pintarCumulo` devuelve las dos.

Medida después (mismo comando, misma captura):

```
 r/r_h    m_res   sin halo   con halo   pre-arreglo
 <=0.25   14.32        154         74         44
 <=0.50   14.80        282        190         99
 <=1.00   15.52        441        405        230
 <=2.00   16.05        438        438        307
 <=4.00   16.17        280        280        229
 <=8.00   16.18        203        203        162
 total                1798       1590       1071
```

De 985 a **1590 de 1798 (88 %)**, y la pérdida queda donde debe: dentro de r_h,
por aglomeración. `--size 1440` da ahora exactamente las mismas cuentas que
`--size 720` (el lienzo ya no toca la física). Igual con `--D 200` (682/727) y
`--sqm 22` (1861/2284).

El arnés lleva el invariante como guardián y devuelve código de salida: **fuera
de r_h, donde no hay aglomeración, el render con halo tiene que dar exactamente
el conteo de cielo pelado.**

### Dos guardianes que hubo que reescribir (no relajar)

Los dos medían algo que sólo era cierto mientras `m_crowd` leía el píxel:

- `test_halo_v7_e4.js` (E4.2b) comparaba los picos CRUDOS de la cola interpolada
  contra la escalonada y exigía ×4. Con `m_res` 0,5 mag más profunda, el peor
  pico de NGC 104 pasó a ser pendiente honrada (q = 0,62 mag de cola por mag de
  límite, contra el 1,5 que separa escalón de pendiente en E4.2) y el test la
  contaba como escalón. Ahora los dos saltos se normalizan por Δm_res, el mismo
  cociente que usa E4.2: la mejora medida sube a ×29 / ×12 / ×17. Más dientes,
  no menos.
- `matriz_m13.js` (Nivel 3) exigía que duplicar el aumento no moviese ⟨I⟩(r) más
  del 5 % del pico. Con la Ω inflada, `m_crowd` mandaba en casi todo el perfil y
  `m_res` no sabía del aumento; ahora manda `m_lim,sky`, que sí depende de M
  —más aumento oscurece el fondo—, `m_res` se hunde 0,63 mag en r_h y el velo se
  adelgaza un 11,5 % del pico. Es la misma física que deshace el halo en
  estrellas al abrir apertura. El guardián pasa a comprobar lo que sí es
  invariante y no tiene constante que ajustar: ⟨I⟩ = Σ·S1(m_res+δ) y ninguna otra
  vía de entrada (peor desvío medido 2,2e-16).

## Arreglo de la hipótesis 3: el `(1−a)` va al velo

Medido primero, con un test que se pone rojo: `scripts/test_banda_conservacion.js`
rehace el balance sobre el perfil radial real contando lo que de verdad se pinta
—`Fresuelto(m_res−δ)` más `∫banda a(m)·dF`— en vez de la partición ideal. La fuga
iba del **6,6 % al 14,5 %** del flujo del cúmulo en 12 filas (cúmulo × equipo), y
la partición ideal cerraba a 0,00 %: por eso `test_cumulo_render` no veía nada.

El arreglo es de reparto, no de flujo (ADR 0003: nada se ancla ni se resta contra
Gaia). La Capa 1 gana los momentos del campo **con la banda dentro**:

```
S1campo(m_res, δ) = S1(m_res+δ) + ∫banda (1−a(m))·dF
S2campo(m_res, δ) = S2(m_res+δ) + ∫banda (1−a(m))²·dF²
Fdibujado         = Ftotal − S1campo          (complemento exacto)
```

`a(m)` es la del render, no una copia (ADR 0008); cuadratura del punto medio con
40 rebanadas (error ~1e-5, dos órdenes por debajo del ±1 %). `tablaCumulo` usa
`S1campo`/`S2campo` en ⟨I⟩, en σ y en el arranque `I0`. Cero parámetros nuevos.

Medido después: fuga **0,00 % en las 12 filas**, y sobre las estrellas que se
entregan a dibujar en la captura (M13, 467 mm, 173×) el 10,3 % que pierden por
atenuación reaparece en el velo, que engorda ≥ 11,2 % — comprobado radio a radio
contra la cuadratura independiente del test (desvío 0,05 %).

Efecto en el conteo: 1590 → **1575 de 1798**. Un velo con su flujo completo hunde
un poco `m_lim,sky`; esas 15 estrellas no desaparecen, pasan al fondo que antes
no existía.

### Guardianes reescritos

Todos medían el corte duro y pasan a medir la ley que el render usa:
`test_grano_sbf` (G4), `test_halo_v7_e1`, `test_halo_v7_e2`, `test_cumulo_render`
y `matriz_m13` (Nivel 3) cambian `S1`/`S2`/`Fresuelto` por
`S1campo`/`S2campo`/`Fdibujado`. Los dos trazadores de S2 (`harness_grano_sbf`,
`conPoblacionEscalada` en E2) envuelven también `S2campo` o dejarían de trazar
nada.

`test_halo_v7_e3` (E3.3, las alas a r > 4·r_h) exigía que el tap perceptual
pintase **cero exacto**, con listón 1e-6 del cielo. Con su flujo completo el ala
entra en el hombro de la sigmoide de `visibilidadDifusa` —que no tiene corte
duro— y deja una cola de 2,96e-4 del cielo. Sigue siendo invisible y ahora se
mide como tal: por debajo de un nivel de 8 bits (1/255 = 3,9e-3) y con el tap
comiéndose el 99,84 % del flujo del ala, que ya está a 0,38·Cmin. El assert de
contraste (ala < Cmin) no se toca.

## Lo que queda

Hipótesis 4 (`k = 30` en el núcleo): dentro de 0,25 r_h se pasa de 154 a 70
estrellas. Es lo que el modelo quiere hacer y pide decisión de modelo, no arreglo
de código.
