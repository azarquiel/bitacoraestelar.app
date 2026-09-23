# Consecuencia contable del corte de Crumey en M13 (#340)

**Pregunta.** [`maglimite_vs_crumey.md`](maglimite_vs_crumey.md) (#339) mide
dónde se aplana `magLimite`. Con 200 mm y cielo 21,5, el repo se aplana en
316× y Crumey en 141×. Falta saber cuánto importa ese corte. ¿Cuántas
estrellas de M13 entran y salen si el techo de `SB0T` fuera el fondo nulo de
Crumey (25,08, ADR-0030) en vez del 27 de Torres Lapasió? ¿Y cómo se mueven la
frontera resuelta/no-resuelta y el corte de la niebla en la misma escena?

**Variante.** Es la más simple: se cambia solo el literal del techo, de 27 a
25,08. La forma del tramo intermedio y el codo espurio que describe #339
quedan como están. Como dice #339, con esta ecuación el techo 25,08 cae en
131× y no en los 141× de d0, porque la Ec. 5 usa una pupila de 7,5 mm. Es una
simulación de sensibilidad, no la ley que propondría #342.

**Producción no cambia (criterio 5).** El harness carga
`bitacora-gaia-render.js` y `bitacora-cumulos.js` en un contexto `vm` aislado.
En ese contexto sustituye el literal
`SB0T = Math.min(27, Math.max(sqm, SB0T));` y aborta si el literal no aparece
exactamente una vez. Así, `pintarCumulo`, el punto fijo del velo, `nieblaCampo`
y `mlimNiebla` usan la variante sin reimplementar ninguna ley (ADR 0008).

## Cómo se ejecuta

- `node scripts/harness_censo_crumey.js`: el informe.
- `node scripts/test_censo_crumey.js`: las comprobaciones del harness.

El test ancla cada medida a una cifra que publica otro sitio del repo:

| Medida | Ancla | Reproducida |
|---|---|---:|
| Plano de 200 mm a 1000× con techo 27 / 25,08 | Ec. 6 de Torres Lapasió a mano: 15,467 / 14,975 | 15,467 / 14,975 |
| Inicio del plano, 200 mm, cielo 21,5, techo 27 / 25,08 | `SB0T` = techo despejado a mano: 318,5× / 131,5× | 319× / 132× |
| Censo a cielo limpio, 200 mm, 250×, SQM 21 | embudo de `maglimite_vs_schaefer.md`: 891 | 891 |
| Estrellas dibujadas, misma escena | mismo embudo: 548 | 548 |
| f_res(núcleo) y r_50, 400 mm, 200×, 21,5 | `matriz_m13.js`: 26,5 % y 1,17 r_h | 26,5 % y 1,17 r_h |
| Sorteo del ADR 0012, 467 mm, 173×, SQM 21 | `test_conservacion_sorteo.js`: 1097 candidatas, Σa 1083,5, σ 3,6 | 1097, 1083,5, 3,61 |

## 1. Barrido de `magLimite`, de 20× a 600× (cielo 21,5)

Ejecutado el 2026-09-23. Transmisión 0,9, pupila del ojo 7 mm.

| fecha | equipo | techo | ¿máximo? | plano | 50× | 141× | 250× | 350× | 600× |
|---|---|---:|---|---|---:|---:|---:|---:|---:|
| 2026-09-23 | 200 mm | 27 | no, nunca baja | desde 319×, en 15,47 | 14,19 | 15,02 | 15,35 | 15,47 | 15,47 |
| 2026-09-23 | 200 mm | 25,08 | no, nunca baja | desde 132×, en 14,97 | 14,19 | 14,97 | 14,97 | 14,97 | 14,97 |
| 2026-09-23 | 450 mm | 27 | no, nunca baja | no llega en 600× | 14,69 | 16,16 | 16,62 | 16,85 | 17,15 |
| 2026-09-23 | 450 mm | 25,08 | no, nunca baja | desde 296×, en 16,74 | 14,69 | 16,16 | 16,62 | 16,74 | 16,74 |

**Criterio 1.** Con la ley actual, la curva no tiene máximo en ninguna de las
dos aperturas. Sube hasta que `SB0T` topa con el techo y desde ahí es plana.
Con 200 mm el plano empieza en 319×. Con 450 mm no llega al plano antes de
600× (lo haría en 717×). Schaefer pone el máximo en 250×
(`maglimite_vs_schaefer.md`). Ninguna de las dos variantes del techo lo
reproduce: bajar el techo adelanta el plano, pero no crea un máximo.

## 2-4. M13 a 250× y 350×, las dos leyes en la misma escena

Es la escena del embudo de `maglimite_vs_schaefer.md`: fixture Gaia DR3
(`m13_gaia_dr3.csv`, G < 18,5), SQM 21, campo 28′, lienzo 720 px y
realización 0.

- **censo**: estrellas de Gaia con G ≤ mlim a cielo limpio.
- **dibujadas**: las que devuelve `pintarCumulo` y pasan el corte de
  `capaEstrellas`.
- **f_res(núc)** y **r_50**: las definiciones de `matriz_m13.js` para la
  frontera resuelta/no-resuelta.
- **corte niebla**: mlim + cola de glow (`bitacora-gaia-render.js`, `nieblaCampo`).
- **banda**: estrellas del fixture por debajo del corte.
- **mlim H2**: mlim tras el lazo niebla → velo → mlim (`mlimNiebla`).

| fecha | equipo | techo | mlim | censo | dibujadas | σ sorteo | f_res(núc) | r_50/r_h | corte niebla | banda | mlim H2 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2026-09-23 | 200 mm 250× | 27 | 15,23 | 891 | 548 | 2,3 | 21,9 % | ∞ | 17,53 | 7645 | 15,22 |
| 2026-09-23 | 200 mm 250× | 25,08 | 14,97 | 718 | 510 | 2,3 | 21,9 % | ∞ | 17,28 | 8345 | 14,97 |
| 2026-09-23 | 200 mm 350× | 27 | 15,41 | 1068 | 694 | 3,2 | 25,6 % | ∞ | 17,71 | 6831 | 15,40 |
| 2026-09-23 | 200 mm 350× | 25,08 | 14,97 | 718 | 587 | 3,1 | 25,6 % | ∞ | 17,28 | 8345 | 14,97 |
| 2026-09-23 | 450 mm 250× | 27 | 16,44 | 2137 | 1368 | 5,0 | 31,9 % | 0,85 | 18,74 | 0 | 16,44 |
| 2026-09-23 | 450 mm 250× | 25,08 | 16,44 | 2137 | 1368 | 5,0 | 31,9 % | 0,85 | 18,74 | 0 | 16,44 |
| 2026-09-23 | 450 mm 350× | 27 | 16,69 | 2485 | 1690 | 6,5 | 42,7 % | 0,63 | 18,99 | 0 | 16,69 |
| 2026-09-23 | 450 mm 350× | 25,08 | 16,69 | 2485 | 1690 | 6,5 | 42,7 % | 0,63 | 18,99 | 0 | 16,69 |

Diferencias (Crumey − actual):

| fecha | equipo | Δmlim | Δcenso | Δdibujadas | en σ del sorteo | en √N | Δf_res(núc) | r_50 | Δcorte niebla |
|---|---|---:|---:|---:|---:|---:|---:|---|---:|
| 2026-09-23 | 200 mm 250× | −0,26 | −173 | −38 | 16,6 | 1,6 | 0,00 pt | ∞ → ∞ | −0,26 |
| 2026-09-23 | 200 mm 350× | −0,43 | −350 | −107 | 33,9 | 4,1 | 0,00 pt | ∞ → ∞ | −0,43 |
| 2026-09-23 | 450 mm 250× | 0 | 0 | 0 | 0 | 0 | 0,00 pt | 0,85 → 0,85 | 0 |
| 2026-09-23 | 450 mm 350× | 0 | 0 | 0 | 0 | 0 | 0,00 pt | 0,63 → 0,63 | 0 |

**Lectura.**

- **Con 450 mm no cambia nada.** A SQM 21, `SB0T` vale 24,21 a 250× y 24,94 a
  350×. Los dos valores quedan por debajo de 25,08, así que ninguno de los dos
  techos actúa.
- **Con 200 mm el censo a cielo limpio pierde el 19 % a 250× (−173) y el 33 %
  a 350× (−350).** Con la variante, 250× y 350× dan el mismo censo, 718: los
  dos están sobre el plano, que a SQM 21 empieza en 166×.
- **Las dibujadas pierden menos: −38 (−7 %) y −107 (−15 %).** El render ya
  juzga cada estrella contra el fondo local, cielo más velo (`m_res`). Donde
  el velo es brillante, `m_res` queda por debajo de 14,97 y el techo no
  interviene. Por deducción, las estrellas que se pierden están donde el velo
  es tenue. El harness no las cuenta por anillos.
- **La frontera resuelta/no-resuelta no se mueve.** f_res(núcleo) coincide a
  0,01 pt, y r_50 no cambia (∞ con 200 mm, 0,85 y 0,63 r_h con 450 mm). La
  razón es la misma: en el núcleo manda el velo, no el techo.
- **El corte de la niebla baja lo mismo que mlim, −0,26 y −0,43 mag.** La cola
  de glow no depende del techo, así que el corte sigue a mlim uno a uno. La
  banda del fixture gana 700 y 1514 estrellas. Esas cifras son una cota
  inferior: el fixture acaba en G = 18,5. Por esa misma razón el fixture no
  mide la niebla con 450 mm: el corte cae en 18,74 y 18,99, más allá de su
  profundidad, y la banda sale vacía en las dos leyes.
- **La realimentación H2 casi no mueve mlim:** −0,01 mag con el techo actual y
  0 con la variante.

## Ruido de la escena (criterio 4)

El fixture de Gaia es fijo, así que la única parte aleatoria del render es el
sorteo del ADR 0012. Su dispersión es Poisson-binomial, σ = √Σa(1−a), la misma
de `test_conservacion_sorteo.js`. Vale 2,3 estrellas a 250× y 3,2 a 350×. Es
pequeña porque casi todas las candidatas tienen a ≈ 1. Como vara más generosa
se usa también el ruido de conteo √N de las dibujadas (23 y 26). El veredicto
exige que el cambio supere las dos varas.

| fecha | equipo | Δdibujadas | σ sorteo | √N | ¿dentro del ruido? |
|---|---|---:|---:|---:|---|
| 2026-09-23 | 200 mm 250× | −38 | 2,3 | 23,4 | no: 16,6 σ y 1,6 √N |
| 2026-09-23 | 200 mm 350× | −107 | 3,2 | 26,3 | no: 33,9 σ y 4,1 √N |
| 2026-09-23 | 450 mm 250× y 350× | 0 | 5,0 / 6,5 | 37 / 41 | sí: no cambia |

## Veredicto

**El cambio de censo no es inferior al ruido de la escena, así que el
criterio 4 no recomienda cerrar la épica sin tocar producción.** Con 200 mm
bajo SQM 21 el techo de Crumey quita 38 estrellas dibujadas a 250× y 107 a
350×. Las dos cifras superan el sorteo y el conteo √N. Además bajan 0,26 y
0,43 mag el corte de la niebla.

La consecuencia tiene límites claros:

1. Solo afecta a los equipos cuyo `SB0T` pasa de 25,08. Con 450 mm, a 250× y
   350×, el cambio es nulo.
2. La frontera resuelta/no-resuelta no se mueve en ninguna escena: el núcleo
   lo decide el velo, no el techo.
3. Lo que cambia es el halo tenue y la niebla del campo.

La decisión de la constante queda para #342. Esta medida le da el tamaño de lo
que decide: hasta un 15 % de las estrellas dibujadas y un 33 % del censo a
cielo limpio con 200 mm pasados 166×. Ninguno de los dos techos produce el
máximo de Schaefer. Si #342 quiere que subir aumentos deje de pagar, bajar el
techo no basta.
