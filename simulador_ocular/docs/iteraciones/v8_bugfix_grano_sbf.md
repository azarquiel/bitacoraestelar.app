# Bugfix v8 · SBF y percepción del grano

Cierra el punto **(i)** que v7 dejó abierto: `s_grano` valía 0 en las 18 corridas de la matriz
mientras la especificación describía `S2` como «toda la textura del halo».

Arneses: `scripts/harness_grano_sbf.js`. Tests: `scripts/test_grano_sbf.js` (27 asserts, en la
suite). Producción tocada: `resources/js/bitacora-gaia-render.js`, una capa —la perceptual—.

---

## 1. Diagnóstico: `S2` está conectado; lo que estaba mal era la escala

El arnés multiplica `S2` por un factor —un trazador, no una física— envolviendo
`poblacionCacheada` para que el trazador entre por el mismo camino que el modelo real:

| ×S2 | σ_max | anchura log del campo crudo | `s_grano` máx | lienzo |
|---|---|---|---|---|
| 1 | 8,25e-8 | 5,43 | 0,000 | — |
| 10 | 2,61e-7 | 7,69 | 0,000 | sin cambio |
| 100 | 8,25e-7 | 10,00 | 0,007 | −0,03 % |
| 1e3 | — | 12,33 | 0,362 | −3,2 % |
| 1e4 | — | 14,66 | 0,860 | +6,3 % |

`σ` va con `√k` a 1e-6 y la anchura logarítmica del campo **crudo** suma exactamente `ln 10` por
década de `S2` —consecuencia de `s² = ln(1 + σ²/⟨I⟩²)` con `σ ≫ ⟨I⟩`—, así que la Capa 3 está
viva hasta el lienzo. **No hay desconexión: hay una ley dura.** El corte está en el desvanecido,
y solo ahí.

## 2. La escala perceptual del grano no es el beam

v7 juzgaba la textura con `θ_grano = FWHM`, es decir, como si fuese **un elemento aislado de
2,4″**. A ese tamaño H2c pide contrastes de 10²–10³ (`Cmin(beam) = 40,4` a 200 mm/146×) y el
grano se queda 3,9–7,2 mag por debajo.

Pero una textura no es un elemento: es un campo aleatorio que el ojo **integra sobre un parche**.
Promediar `n = (θ/θ_beam)²` celdas independientes divide la amplitud juzgada por `√n` y a la vez
baja el umbral, porque `Cmin` favorece al elemento grande. El compromiso tiene un máximo, y es
analítico: con `Cmin ∝ (1 + θ_R/(θ·M))²` y `σ(θ) = σ_beam·θ_beam/θ`, el óptimo cae en

```
θ* = θ_R(SBe) / M          (la escala en la que el término de Ricco vale 1)
```

La ley implementada es, por tanto, **una línea y cero constantes nuevas** —`θ_R` y los aumentos
ya estaban en H2c—:

```
θ_grano = max(θ_beam, θ_R/M)
aten    = θ_beam / θ_grano
s_grano = visibilidadDifusa( σ·aten, (Fcielo + ⟨I⟩)·Cmin(θ_grano) )
```

`σ` sale **intacta** a la tabla: `aten` solo entra en el desvanecido. Lo pintado sigue siendo
`⟨I⟩·s_halo + δI·s_grano` con la misma física de antes (G4 comprueba que `⟨I⟩ = Σ·S1` y
`σ = √(Σ·S2/Ω)` a 0 de error relativo).

Se prefirió el máximo analítico al barrido que pedía el plan; el barrido sigue en el arnés y
**G3 contrasta el uno contra el otro** (coinciden dentro del paso de 1/4 de octava).

Efectos medidos:

- el grano deja de depender del seeing (mejor seeing sube `σ` y encoge el beam en la misma
  proporción: `θ*` no se mueve). Cierra de paso el punto **(l)** de v7 por otro camino;
- el grano pasa a responder al aumento (`θ*` va de 105,3″ a 50× a 30,6″ a 400×);
- la textura se acerca a su umbral ×3,0 en M13/200 mm 146×, y del 3,1 % al 12,1 % en la matriz.

## 3. El grano sigue sin verse, y ahora con el número medido

**Con `S2` real, `s_grano` sigue siendo 0 en toda configuración plausible.** Barrido de los 143
cúmulos de Harris con `c > 0` contra una rejilla de 40 equipos (D de 100 a 600 mm, M de 50 a
800×, pupila de salida entre 0,4 y 7 mm, SQM 21,5 y 22,0), tomando el máximo sobre radio:

| | razón σ/umbral |
|---|---|
| mejor caso absoluto (NGC 6121, 600 mm 100× SQM 21,5) | **0,154** |
| mediana del catálogo | 0,114 |
| lo que `visibilidadDifusa` necesita para dar > 0 | **0,398** (`10^−UMBRAL_MARGEN`) |

Falta un factor **2,6**, y la razón es notablemente plana entre cúmulos (0,11–0,15): la fija la
ley, no el objeto. La explicación es estructural y se sostiene sola —

`m_res = min(m_crowd, m_lim,sky)` deja en el campo justo lo que el equipo **no** detecta. Medido,
la fluctuación por beam vale `σ·Ω ≈ F(m_lim)/25`, o sea que solo 1 de cada ~600 beams contiene
una estrella no resuelta cerca del límite. Un campo así es liso por construcción: **el grano SBF
es invisible precisamente porque el modelo ya resuelve las estrellas que lo producirían.**

Comprobación cruzada de que esto no es H2c extrapolada fuera de su calibración: se comparó, para
un punto exactamente en `magLimite`, su flujo repartido en el beam contra `Cmin(θ_beam)·Fcielo`.
Las dos leyes de detección del modelo —una de puntos, otra de superficies, calibradas por
separado— coinciden dentro de un factor **0,7–3,3** en 12 equipos. `Cmin(beam) = 40` no es un
disparate del ajuste: es Ricco bien aplicada.

**Conclusión:** el «halo granular» que reportan los observadores son las estrellas resueltas
(`f_res` sube del 3 % en el centro al 28 % en el borde ya con 100 mm), como ya concluía v7. Hacer
que `s_grano > 0` con equipos reales exigiría una constante nueva, y eso es ADR-0004.

Candidato identificado y **no implementado**: la sumación de probabilidad espacial (el umbral de
un patrón repetido baja como `N_ind^(1/4)` sobre el de un elemento aislado) daría de sobra el
factor 2,6 que falta. Trae un exponente nuevo, sin validación de campo en este proyecto, y
tocaría la misma capa que este bugfix: es una iteración aparte, con su medida delante.

## 4. Deuda encontrada por el camino, no corregida

`Ω_beam = π·(FWHM/2)² = 0,785·FWHM²`, mientras el área equivalente de una PSF gaussiana es
`4π·σ_g² = 2,266·FWHM²`. La Ω del modelo es **2,9× menor** de lo que le tocaría, lo que hace `σ`
un factor 1,7 **mayor**. Es decir, el resultado de §3 es ya generoso con el grano; corregir Ω lo
alejaría más del umbral. Es fotometría y queda fuera de este bugfix (§6 del plan).

## 5. Prioridad 2 — seeing en `magLimite`: no procede

El plan pedía implementarlo «solo si los datos confirman la necesidad». El dato que decide es
interno: `FOT.H2C.SEEING_AS` es una **constante** (2″, «sin modelo por noche, a propósito»), y
`radioImagenEstelar` la usa así. Un término de seeing en `magLimite` sería por tanto un
desplazamiento constante de una calibración ya ajustada, no un comportamiento nuevo: no hay
ningún eje por el que se pudiera observar. El seeing Antoniadi que sí se registra
(`bitacora-base.js`) es un campo de bitácora, no una entrada del render.

Además, `magLimite` ya lleva el régimen limitado por seeing donde importa: su término
`2,5·log10(D_ef²·t)` es exactamente el `SNR ∝ D²` de una imagen estelar de tamaño fijo.

Queda **registrado, no implementado**, con guardián en G7: si alguien mete el seeing en
`magLimite`, el test se pone rojo y obliga a revisar la calibración entera, no solo a sumar un
término.

## 6. Prioridad 3 — los 12 rojos de `test_difuso.js`: deuda de PS1, aislada

Verificado contra `main`: **el mismo conjunto de 12, con las mismas etiquetas**, byte a byte. Son
de la capa de galaxias desde imagen (halos, umbral contado dos veces, mezcla imagen/perfil); nada
que ver con cúmulos, y arreglarlos aquí mezclaría dos capas físicas (ADR-0007).

Aislados con una lista `DEUDA_PS1` de prefijos, que sale como `DEUDA` y no como `FALLA`. Dos
condiciones la mantienen honesta, las dos comprobadas a mano:

- un fallo **nuevo** que no esté en la lista pone la batería roja (antes se escondía dentro del
  mismo «12 fallo(s)»);
- una deuda que **deja de fallar** también, con el mensaje de que hay que borrarla de la lista.

`test_difuso.js` vuelve a terminar en 0, y ahora un 0 significa algo.

## 7. Hallazgo que contradice a la especificación

`s_halo` y `s_grano` no se comportan igual al ensuciar el cielo, y no como se había escrito. La
especificación afirmaba que «el grano muere antes que la mancha» apoyándose en
`Cmin(θ_grano) > Cmin(θ_cúmulo)`. Lo primero es cierto y sigue asertado; lo segundo **no se sigue
de ello**: el umbral no es lo único que se mueve. Con el cielo sucio `m_lim,sky` se hunde, las
estrellas del halo dejan de resolverse y **caen al campo**, de modo que `S2` sube más deprisa que
el umbral.

Medido en M13/200 mm 146×, de SQM 21,5 a 18,5: la mancha se aleja de su umbral (162 → 32,9) y el
grano **se acerca** al suyo (0,047 → 0,125). Con la ley del beam de v7 el signo es el mismo
(0,016 → 0,065), así que no lo trae v8: lo que v7 no podía ver es que su criterio se cumplía
sobre el conjunto vacío. Corregido en la especificación y en `CONTEXT.md`, y asertado en G5.

## 8. Estado de los criterios del plan

| Criterio | Estado |
|---|---|
| `S2` conectado a la imagen | **sí**, medido (§1) |
| `s_grano` no vacuo | **sí**: G2 encuentra el `k` que lo enciende y comprueba que el lienzo cambia |
| escala perceptual revisada, sin constantes nuevas | **sí** (§2) |
| fotometría intacta | **sí**: `⟨I⟩` y `σ` exactos a 0 de error relativo (G4) |
| comportamiento al empeorar el cielo | **medido y corregido**: era falso lo escrito (§7) |
| grano visible en configuración plausible | **NO**, y con el número: 0,154 contra 0,398 (§3) |

El último no se ha forzado. Conseguirlo hoy pasaba por una constante puesta a ojo, que es
exactamente lo que ADR-0004 prohíbe y lo que el plan pedía no hacer.
