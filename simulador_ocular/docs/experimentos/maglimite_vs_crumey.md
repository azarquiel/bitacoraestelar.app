# `magLimite` medida contra Crumey 2014 (#339)

**Pregunta.** [`maglimite_vs_schaefer.md`](maglimite_vs_schaefer.md) mide la
magnitud límite del repo contra Schaefer (1990), pero Crumey (2014) demuestra
que la fórmula de Hecht en que se apoya Schaefer tiene la curvatura del signo
equivocado entre 16,3 y 22,6 mag/arcsec². Sobre los datos de Bowen (1947),
Schaefer tiene 0,37 mag de r.m.s. y Crumey 0,09. ¿Cuánto se desvía
`magLimite` de un patrón primario cuya curvatura no está refutada?

**Banco de comparación.** Crumey, A. 2014, *Human Contrast Threshold and
Astronomical Visibility*, MNRAS 442, 2600 (arXiv:1405.4209). Las ecuaciones
están transcritas del preprint en `scripts/harness_crumey.js`. Solo se comparan
magnitudes **libres del factor de campo F**, así que el banco no depende de
nuestro `K = 2,005` ni del F nocional de Crumey:

- `sup = µ∞ − m0` y `pen = m22 − m0`, de la Tabla 1.
- Las pendientes de `m0` frente a `−log d` (§3.2): 5 si d ≥ p, 2,131 si
  p ≥ d ≥ d0, y 0 si d ≤ d0.

Ninguna línea de producción cambia: el harness importa
`bitacora-gaia-render.js` tal cual.

## Cómo se ejecuta

`node scripts/harness_crumey.js`

Sin red ni dependencias. Antes de medir nada, el harness comprueba que
reproduce las cifras que el propio paper publica, y aborta con código 1 si
alguna se desvía más que la precisión con que el paper la da:

| Cifra del paper | Dónde | Reproducida | Tolerancia |
|---|---|---:|---:|
| m0 = 6,93 (F = 1, B = 2×10⁻⁴ cd m⁻²) | §2.3, Ec. 53 | 6,934 | 0,005 |
| m0 = 6,18 (F = 2) | §2.3 | 6,181 | 0,005 |
| µ∞ = 24,94 (µsky 21,83) | §2.3, Ec. 56 | 24,937 | 0,005 |
| Tabla 1, `sup` = 18,06 (µsky 22) y 17,90 (µsky 21,5) | Tabla 1 | 18,056 / 17,901 | 0,005 |
| Tabla 1, resto de columnas de `sup` y `pen` | Tabla 1 | residuo máx. 0,008 | 0,01 |
| Constante 8,45 del corte | Ec. 73 | 8,450 | 0,005 |
| Corte a D = 100 mm: 12,7 mag | Fig. 13 | 12,70 | 0,05 |
| Rectas del 6 pulgadas de Bowen a 8, 2,5 y 0,5 mm | Ec. 74 | −0,007 / −0,016 / +0,031 | 0,1 |
| d0 de Bowen = 1,0 mm | §3.2, Ec. 70 | 1,001 | 0,05 |
| Tres tramos de Bowen 5 / 2,131 / 0 con codos en p y d0 | §3.2 | 5,00 / 2,18 / 0,00; codos en 5,26 y 1,00 mm | ver harness |

Las dos columnas de `sup` que el ticket cita van a la precisión publicada,
0,005. El resto de la Tabla 1 lleva una unidad del último decimal, no media:
el residuo de las ecuaciones exactas cambia de signo sin tendencia, que es el
redondeo del autor. Las aproximaciones lineales (Ecs. 54 y 57) derivan hasta
0,075 mag con tendencia, así que la tabla sale de las ecuaciones exactas. Las
rectas de Bowen llevan 0,1 mag porque son un ajuste a datos, y el paper da
0,09 de r.m.s. a su modelo sobre ellos.

## 1. Invariantes de la Tabla 1

Repo evaluado a ojo desnudo: `m0 = magLimite` con D = pupila = 7 mm, M = 1 y
t = 1. `µ∞` es la meseta de `ctxFotometrico` sin aumentos, que es la asíntota
de objeto infinito de H2c.

| µsky | sup Crumey | sup repo | Δsup | pen Crumey | pen repo | Δpen |
|---:|---:|---:|---:|---:|---:|---:|
| 22,00 | 18,06 | 17,75 | −0,31 | 0,00 | 0,00 | +0,00 |
| 21,75 | 17,98 | 17,71 | −0,27 | 0,10 | 0,12 | +0,02 |
| 21,50 | 17,90 | 17,68 | −0,22 | 0,20 | 0,25 | +0,05 |
| 21,25 | 17,82 | 17,65 | −0,17 | 0,30 | 0,38 | +0,08 |
| 21,00 | 17,74 | 17,62 | −0,12 | 0,40 | 0,52 | +0,12 |
| 20,75 | 17,66 | 17,59 | −0,07 | 0,49 | 0,65 | +0,16 |
| 20,50 | 17,58 | 17,57 | −0,01 | 0,59 | 0,79 | +0,20 |
| 20,25 | 17,49 | 17,56 | +0,07 | 0,68 | 0,94 | +0,26 |
| 20,00 | 17,40 | 17,54 | +0,14 | 0,77 | 1,09 | +0,32 |
| 19,75 | 17,32 | 17,53 | +0,21 | 0,85 | 1,24 | +0,39 |
| 19,50 | 17,22 | 17,53 | +0,31 | 0,93 | 1,40 | +0,47 |
| 19,25 | 17,13 | 17,52 | +0,39 | 1,01 | 1,56 | +0,55 |

**Lectura.**
- El nivel concuerda: `sup` cruza cero cerca de µsky 20,5.
- La pendiente no concuerda. Entre µsky 22 y 20, `sup` baja 0,66 mag en Crumey
  y solo 0,21 en el repo.
- La penalización por contaminación lumínica del repo crece 1,4 veces más
  deprisa que la de Crumey: +0,55 mag de exceso a µsky 19,25.

Esto reproduce la medida previa de la nota de referencia (§3.4:
−0,31 ≤ Δsup ≤ +0,14 entre µsky 22 y 20), y la amplía a toda la Tabla 1: por
debajo de 20 el desacuerdo sigue creciendo, hasta +0,39.

Es la misma discrepancia de pendiente que la nota atribuye a `C_EXP = 0,35`
(§3.2a). `pen` mide además la extrapolación de `magLimite` fuera de su dominio
telescópico, así que `sup` es la medida más limpia.

## 2. `m0` frente a pupila de salida: los tres tramos

Mismo equipo en las dos leyes: D = 200 mm, cielo 21,5, t = 0,9, pupila del
ojo 7 mm. En Crumey, Ft = 1/t, FT = √2, FM = 1 y F = 2. F solo desplaza la
curva en vertical, así que el veredicto sale de las pendientes y de dónde caen
los codos, no del nivel. Los dos lados pasan por el mismo detector de tramos
que el autotest valida sobre Bowen.

**Crumey** (Ecs. 66–71):

| pendiente | medida | pupila de salida | aumentos | m0 |
|---|---:|---|---|---|
| 5 | 5,00 | 20,00 → 7,10 mm | 10× → 28× | 10,60 → 12,85 |
| 2,131 | 2,18 | 6,93 → 1,42 mm | 29× → 141× | 12,89 → 14,40 |
| 0 | 0,00 | 1,42 → 0,20 mm | 141× → 1000× | 14,40 |

**`magLimite`:**

| pendiente | medida | pupila de salida | aumentos | m0 |
|---|---:|---|---|---|
| 5 | 5,00 | 20,00 → 7,96 mm | 10× → 25× | 11,20 → 13,20 |
| otra | 7,11 | 7,96 → 6,93 mm | 25× → 29× | 13,20 → 13,62 |
| 2,131 | 2,09 | 6,93 → 1,70 mm | 29× → 117× | 13,62 → 14,90 |
| otra | 1,32 | 1,70 → 0,63 mm | 117× → 316× | 14,90 → 15,46 |
| 0 | 0,01 | 0,63 → 0,20 mm | 316× → 1000× | 15,46 → 15,47 |

**Qué depende de la tolerancia del detector.** El detector asigna cada
pendiente local a la de Crumey más cercana si está a menos de 0,5, y si no la
llama «otra». Ese 0,5 es una elección del harness, no sale del paper. Se
repitió la medida con tolerancias de 0,2 a 0,7:

| tolerancia | Bowen | tramo «2,131» del repo | inicio del plano del repo |
|---:|---|---|---|
| 0,2 | 5 → 2,131 → 0 | 5,02 → 2,70 mm | 0,62 mm |
| 0,3 | 5 → 2,131 → 0 | 5,90 → 2,30 mm | 0,62 mm |
| 0,4 | 5 → 2,131 → 0 | 6,93 → 1,95 mm | 0,63 mm |
| 0,5 | 5 → 2,131 → 0 | 6,93 → 1,70 mm | 0,63 mm |
| 0,7 | 5 → 2,131 → 0 | 6,93 → 1,23 mm | 0,63 mm |

El veredicto no cambia en ese rango: Bowen siempre da sus tres tramos, el
repo siempre tiene los tres, y su plano siempre empieza en 0,62–0,63 mm. Lo
que sí cambia es dónde acaba el tramo intermedio del repo, de 2,70 a
1,23 mm. Esa cifra no es una medida, es un efecto del umbral: el tramo es
curvo y su pendiente baja poco a poco. Por eso en la tabla de arriba su
extensión solo vale como ilustración.

## Veredicto

**Los tres tramos existen en `magLimite`, pero el tercero empieza 2,24 veces
más tarde en aumento que en Crumey.** Crumey aplana la curva en d0 = 1,42 mm
(141×). El repo la aplana en 0,63 mm (316×), que es donde `SB0T` topa con el
corte de fondo cero de 27 mag/arcsec² (ADR-0030). Cambiar solo la constante a
25,08 no lo llevaría exactamente a d0: con la Ec. 5 del repo, `SB0T` = 25,08
cae en 1,52 mm (131×), porque esa ecuación usa una pupila de 7,5 mm y Crumey
usa la del ojo, 7 mm. Esto confirma con el harness la cifra que la
nota de referencia calculó a mano (M ≈ 141 frente a M ≈ 318).

Además aparecen dos discrepancias de forma que Schaefer no enseñaba:

1. **El tramo intermedio no es recto.**
   - Qué se ve: la pendiente del repo va de 2,09 a 1,32 antes del plano. Entre
     1,70 y 0,63 mm (117× a 316×) la curva sigue subiendo 0,56 mag con una
     pendiente que ninguna rama de Crumey tiene.
   - Por qué: es la parábola de la Ec. 6 de Torres Lapasió, que se curva
     conforme `SB0T` se acerca a su vértice.
   - En Crumey ese tramo es recto (Ec. 69, pendiente 2,131) y termina de golpe
     en d0.
2. **Un codo espurio de pendiente 7,1 entre 7,96 y 6,93 mm (25× a 29×).**
   - Por qué: `magLimite` usa dos pupilas distintas. La Ec. 5 de Torres Lapasió
     usa 7,5 mm, y `SB0T` deja de valer `sqm` en d = 7,5/√t = 7,91 mm. El
     recorte de apertura efectiva usa `pupilaOjo` = 7 mm.
   - Efecto: entre las dos, la apertura efectiva sigue sumando su pendiente 5
     y la parábola de `SB0T` suma la suya (≈ 2,6).
   - En Crumey los dos efectos cambian en el mismo punto, d = p, porque usa una
     sola pupila.
   - Tamaño: 0,4 mag en una franja de 4 aumentos, así que es menor.

El nivel absoluto del plano (15,47 frente a 14,40 con F = 2) depende de F y
no se juzga aquí. Para que coincidan haría falta F ≈ 0,75, por debajo del
rango de 1,4 a 2,4 que Crumey propone para observación real: un observador
mejor que el de laboratorio. Eso es coherente con lo que ya decía el banco de
Schaefer: `magLimite` es generosa.

## Qué hace falta para #340 y #342

- El plano en el sitio de Crumey es justo lo que #342 plantea. La medida dice
  **dónde** debería empezar (d0, Ec. 70) y **cuánto** se mueve con este
  equipo: si la curva actual se aplanara en d0, el plano bajaría de 15,47 a
  15,02, es decir 0,45 mag, a partir de 141×.
- El censo de estrellas de esos aumentos es #340. Este banco no lo calcula.
- El codo de 25× a 29× y la curvatura del tramo intermedio no entran en el
  alcance de la épica. Quedan anotados aquí, sin ticket.

Dos bancos que discrepan en la curvatura son más informativos que uno. Contra
Schaefer, el repo es más generoso y le falta el máximo. Contra Crumey, tiene
la forma de tres tramos pero con el plano en el sitio equivocado y un tramo
intermedio curvo.
