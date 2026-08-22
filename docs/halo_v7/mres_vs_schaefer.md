# m_res actual contra el límite visual de Schaefer

**Pregunta.** El umbral del simulador es más generoso que el banco empírico en
cielo limpio (`maglimite_vs_schaefer.md`). ¿Sobrevive esa ventaja cuando el
umbral entra dentro del punto fijo, contra el fondo local del cúmulo? Y con el
banco empírico de umbral, ¿cuántas estrellas tendría el núcleo?

**Cómo se mide.** `node scripts/harness_mres_vs_schaefer.js`. M13, D = 200 mm,
SQM 21, seeing 2″, newtoniano, realización 0, fixture
`docs/halo_v7/m13_gaia_dr3.csv` más las sintéticas. Schaefer no se reimplementa:
se exporta de `harness_maglimite_schaefer.js` (ADR 0008). `N` y `flujo núcleo`
llevan siempre la regla completa de producción, umbral **y** sorteo Bernoulli de
a(m,r); lo único que se sustituye es la ley del umbral dentro del punto fijo.

## Resultado

| aum | ley | limpio | m_res(0) 5p | m_res(0) final | m_res ⟨r_c⟩ | N núcleo | N total | flujo núcleo |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 61 | simulador | 14,16 | 11,56 | 11,56 | 11,76 | 1 | 137 | 0,7 % |
| 61 | Schaefer | 13,95 | 11,29 | 11,29 | 11,52 | 1 | 121 | 0,1 % |
| 120 | simulador | 14,74 | 12,59 | 12,59 | 12,78 | 15 | 306 | 11,5 % |
| 120 | Schaefer | 14,42 | 12,46 | 12,46 | 12,67 | 14 | 238 | 10,2 % |
| 173 | simulador | 15,00 | 13,10 | 13,10 | 13,28 | 23 | 414 | 17,5 % |
| 173 | Schaefer | 14,59 | 13,03 | 13,03 | 13,21 | 23 | 325 | 16,7 % |
| 250 | simulador | 15,23 | 13,57 | 13,57 | 13,73 | 36 | 548 | 22,5 % |
| 250 | Schaefer | 14,66 | 13,46 | 13,45 | 13,60 | 32 | 373 | 21,0 % |

`limpio` = el umbral contra el cielo pelado, sin velo. `5p` = las 5 pasadas de
producción; `final` = el mismo punto fijo convergido a 30 pasadas. `⟨r_c⟩` = el
promedio de m_res sobre el núcleo, que es el que decide las estrellas; m_res(0)
es solo el centro, el punto más hostil.

## Lo que dice

**1. El velo se come entre 1,7 y 2,6 mag, y es quien manda.** Del cielo limpio al
fondo local:

| aum | simulador | Schaefer |
|---:|---:|---:|
| 61 | −2,60 | −2,66 |
| 120 | −2,15 | −1,96 |
| 173 | −1,90 | −1,56 |
| 250 | −1,66 | −1,20 |

Comparado con eso, la diferencia entre las dos leyes de umbral es ruido.

**2. La ventaja del simulador se derrite dentro del punto fijo.** En cielo limpio
va +0,21 a +0,57 mag por delante de Schaefer; en el fondo local se queda en
+0,27 / +0,13 / +0,07 / +0,11. El motivo es que el punto fijo es contractivo: un
umbral más generoso resuelve más estrellas, y las que resuelve dejan de velar,
pero también las que no resuelve suben el fondo y le devuelven el golpe. La
circularidad amortigua la diferencia entre leyes.

**3. Con el banco empírico de umbral, el núcleo casi no se mueve.** 32 estrellas
contra 36 a 250×; 23 contra 23 a 173×; 1 contra 1 a 61×. El flujo del núcleo en
puntos, 21,0 % contra 22,5 %. **Sustituir nuestra ley por la ajustada a 314
observaciones reales no cambia el cuadro del núcleo.** Ese es el diagnóstico: el
umbral no es quien decide cuántas estrellas hay ahí dentro.

**4. Donde sí se nota es fuera.** N total va 548 contra 373 a 250×, un 32 % menos
con Schaefer. Tiene sentido: en el halo el velo es fino, así que ahí el umbral
trabaja casi en cielo limpio y la diferencia entre leyes sobrevive entera. El
núcleo lo gobierna el velo; el halo, el umbral.

**5. Cinco pasadas bastan.** `5p` y `final` coinciden en todas las filas, con un
único 0,01 mag en Schaefer a 250×. Confirma `punto_fijo_adr0012.md` con una ley
de umbral distinta de la que se usó para calibrarlo, que es una comprobación más
fuerte que repetirlo con la misma.

## Consecuencia

Tres leyes examinadas y ninguna explica el número de estrellas del núcleo: no es
el crowding (`tres_modelos_mres.md`: P_solo ≈ m_lim,sky), no es el umbral (esta
medida), y no es el nivel del velo (μ_velo(0) = 16,49 contra μ_V(0) = 16,59 de
Harris). Lo que queda es que M13 a 61× con 200 mm tiene el núcleo sin resolver
porque **así se ve**, y los reportes de observadores lo dicen igual.
