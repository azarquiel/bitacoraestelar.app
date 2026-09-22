# L2.2 — la apertura en el objeto difuso, medida (#323)

Fecha: 2026-09-22. Listón: L2.2 del ADR 0024 (fase 2), la validación de que la
resolución por objeto **compra algo visible**: 457 mm frente a 914 mm en
M51/M81/M101/NGC 205, con el signo correcto (más apertura conserva más
estructura), y `θ_add` decrece con la apertura en los seis representantes de
cuantil. Máquina: la de desarrollo (Node 26, offline; las texturas se leen de
`scripts/fixtures/dso/` y `simulador_ocular/dso/`).

Arranque: `node scripts/harness_l22_apertura_dso.js`.

**Veredicto: AC2 y AC3 se cumplen. AC1 no llega a 1σ en tres de los cuatro en la
escala nativa de la textura; la causa es la escala del píxel, no la pérdida de
separación. Se documenta y NO se ajusta el umbral (AC4, ADR `0012-dos-ejes-gaia`).**

| Criterio | Umbral | Medido | Veredicto |
|---|---|---|---|
| AC1 · 457 vs 914 en M51/M81/M101/NGC 205 | ≥ 1σ del ruido de cielo | 0,47–1,27 σ (MAD); 0,87–1,01 σ (σ_vecino) | ❌ 3 de 4 por debajo en nativo |
| AC2 · `θ_add` decrece con la apertura, 6 cuantiles | signo correcto en los 6 | 3,83 → 1,65 ″ de 80 a 914 mm | ✅ en los seis |
| AC3 · misma medida fase 1 (1024) vs fase 2 | cifras escritas | 1,12–3,10 σ (f1) · 0,47–1,27 σ (f2) | ✅ escritas (§AC3) |
| AC4 · si < 1σ, nombrar causa y decidir | no ajustar el umbral | causa: escala del píxel (§La causa) | ✅ decisión registrada |

## Qué se mide y cómo

El método es la «prueba clave» del harness de decisión (§4 de
`harness_decision_psf_resolucion.js`), sin reimplementar ninguna ley (ADR 0008):
la textura sale del camino de producción (`ps1FuenteParche`), la PSF de
`ps1PsfParche` (producción) y `θ_add` de `ps1ThetaAdd` (producción). La métrica
es

```
D_PSF(457, 914) = RMS(im457 − im914) / σ_cielo
```

con `imD = ps1PsfParche(textura, D)` y `σ_cielo` la σ robusta (MAD) del parche
sin PSF —la misma cuenta del harness, donde la mediana es cielo y la MAD recoge
el ruido del fondo—. El signo se juzga con la **estructura** (RMS del residuo
tras suavizar a 12″): 914 conserva más que 457. El suelo de sensibilidad es el
mismo método entre 914 y 920 mm (dos aperturas indistinguibles: lo que produce
el método cuando no hay diferencia física que ver).

Se mide en la **escala nativa** de cada textura (2048 px en las cuatro golden,
regla C): es la extensión fiel del harness a la fase 2, donde el lienzo común de
1024 px que usaba para comparar 512↔1024 ya no es la rejilla del dato. El
remuestreo del harness existía para igualar rejillas distintas; aquí no hay dos
rejillas que igualar dentro de una misma fase.

## AC1 — 457 mm frente a 914 mm, en texturas de fase 2

| objeto | escalaAs | σ_px 457 | σ_px 914 | D_PSF(457,914) | D/σ_vecino | suelo (914,920) | D/suelo | signo |
|---|---|---|---|---|---|---|---|---|
| NGC 5194 (M51) | 0,528 ″/px | 1,40 px | 1,33 px | **0,63 σ** | 0,92 σ | 0,0224 | 28× | sí (914 > 457) |
| NGC 3031 (M81) | 0,586 ″/px | 1,26 px | 1,20 px | **0,81 σ** | 1,01 σ | 0,0037 | 222× | sí |
| NGC 5457 (M101) | 0,586 ″/px | 1,26 px | 1,20 px | **0,47 σ** | 0,87 σ | 0,0021 | 222× | sí |
| NGC 205 | 0,586 ″/px | 1,26 px | 1,20 px | **1,27 σ** | — | 0,0058 | 221× | sí |

Tres de las cuatro quedan por debajo de 1σ en la escala nativa (NGC 205 la pasa).
Con `σ_vecino` —el cielo medido **fuera** del objeto (ADR 0028), más limpio que
la MAD— el cuadro no cambia: M81 queda clavada en 1,01 σ y M51 y M101 siguen por
debajo (0,92 y 0,87 σ). NGC 205 no publica `σ_vecino` (`vecina-dentro`). El
signo es correcto en las cuatro, y D/suelo va de 28× a 222×: la separación es
**real y muy por encima del suelo de sensibilidad del método**, solo que no llega
al escalón de 1σ.

## AC2 — `θ_add` decrece con la apertura

| objeto | 80 mm | 203 mm | 457 mm | 914 mm | ¿decrece? |
|---|---|---|---|---|---|
| NGC 3310 (mín, 0,50 ″/px) | 3,827 ″ | 2,129 ″ | 1,744 ″ | 1,663 ″ | sí |
| NGC 404 (p25, 0,50 ″/px) | 3,827 ″ | 2,129 ″ | 1,744 ″ | 1,663 ″ | sí |
| NGC 3377 (p50, 0,50 ″/px) | 3,827 ″ | 2,129 ″ | 1,744 ″ | 1,663 ″ | sí |
| NGC 4125 (p75, 0,50 ″/px) | 3,827 ″ | 2,129 ″ | 1,744 ″ | 1,663 ″ | sí |
| NGC 7331 (p90, 0,50 ″/px) | 3,827 ″ | 2,129 ″ | 1,744 ″ | 1,663 ″ | sí |
| NGC 205 (tope, 0,59 ″/px) | 3,821 ″ | 2,119 ″ | 1,732 ″ | 1,650 ″ | sí |

El signo es el correcto en los seis: más apertura, menos borrón por añadir. No
es una comprobación trivial —`θ_add` es lo que **falta** por ponerle al parche
para que su borrón sea el del telescopio, y baja porque el disco de Airy baja con
la apertura—, pero es la mitad del listón que garantiza que el efecto va en la
dirección física.

## AC3 — la misma medida, fase 1 frente a fase 2

| objeto | fase 1 (1024 fijo) | fase 2 (regla C) | fase 2 remuestreada a 1024 |
|---|---|---|---|
| NGC 5194 (M51) | 1,377 σ | 0,630 σ | 1,279 σ |
| NGC 3031 (M81) | 1,728 σ | 0,810 σ | 1,918 σ |
| NGC 5457 (M101) | 1,117 σ | 0,473 σ | 1,077 σ |
| NGC 205 | 3,098 σ | 1,272 σ | 3,060 σ |

La fase 1 (1024 fijo, 1,06–1,17 ″/px) **sí** separaba 457 y 914 por 1,1–3,1 σ —
es la cifra que ya daba el harness de decisión («1–3 σ», condición 4). La fase 2
(2048 px en las golden, 0,53–0,59 ″/px) deja la misma medida en 0,47–1,27 σ. La
tercera columna es el diagnóstico: la **misma textura de fase 2**, remuestreada
a la escala de 1024 px (2×2), vuelve a dar 1,08–3,06 σ, indistinguible de la fase
1. La separación que la fase 1 compró **no se ha perdido**: se diluye solo cuando
se la mide en la rejilla más fina.

## La causa (AC4)

D_PSF baja de la fase 1 a la fase 2 por **dos** términos, y el dominante no es la
señal:

| objeto | σ_cielo f1 → f2 | cruda f1 → f2 |
|---|---|---|
| NGC 5194 (M51) | 39,8 → 67,7 (×1,70) | 54,8 → 42,6 (×0,78) |
| NGC 3031 (M81) | 39,3 → 61,5 (×1,56) | 67,9 → 49,8 (×0,73) |
| NGC 5457 (M101) | 45,9 → 72,8 (×1,59) | 51,3 → 34,5 (×0,67) |
| NGC 205 | 26,7 → 41,5 (×1,55) | 82,7 → 52,7 (×0,64) |

1. **La σ por píxel sube ×1,55–1,70.** La MAD es la desviación robusta del fondo
   **por píxel**, y no es invariante de escala: a 0,53–0,59 ″/px cada píxel
   promedia menos del ruido nativo del stack (0,25″) y recoge más de las alas
   tenues de la galaxia —de hecho la MAD de las golden excede a `σ_vecino`
   (cielo medido fuera) en ×1,2–1,8, prueba de que no es solo ruido de cielo—.
   El listón «≥ 1σ» se escribió con la σ de la fase 1 (1,17 ″/px) en la mano; a
   la escala de la fase 2 ese mismo denominador es más grande.
2. **La diferencia cruda baja ×0,64–0,78.** Las dos PSF difieren en 0,08″ de
   FWHM (1,74″ contra 1,66″), una modulación suave y de poca amplitud; su RMS por
   píxel se reparte distinto al remuestrear, y en la rejilla fina sale algo menor.

El producto de los dos términos (≈ ×0,4–0,5) es exactamente la caída de D_PSF. No
hay una tercera causa que buscar: ni el suelo de sensibilidad (28–222× por debajo)
ni el signo (correcto en todas las filas) se han movido.

## Decisión

**No se ajusta el umbral.** El listón «≥ 1σ del ruido de cielo» no es invariante
de escala: su denominador es una σ **por píxel**, y la fase 2 cambia la escala del
píxel por diseño (ese es su punto). Leerlo en la rejilla nativa de la textura
infravalora una separación que físicamente sigue ahí —la tercera columna de AC3 lo
demuestra: la misma textura de fase 2, a 1024 px, da 1,08–3,06 σ, igual que la
fase 1—. Bajar el umbral a 0,5 σ para que cuadre, o subirlo, sería ajustar un
listón después de ver la medida, justo lo que prohíbe el preregistro
`0012-dos-ejes-gaia-preregistro-de-listones.md`. Lo que se
hace es dejar la cifra escrita y el umbral como está.

La lectura correcta para la épica: la fase 2 **no pierde** la separación de
apertura que la fase 1 compró (signo correcto en todo el banco, separación intacta
a escala común). Lo que no se puede afirmar es que la fase 2 la **aumente** en
unidades de σ por píxel, porque esa unidad cambia con la resolución. El motivo de
la fase 2 —que la apertura se note— queda cumplido en su forma conservada; la
forma «más σ que antes» no la mide este listón y no se renegocia aquí.

## Cómo se reproduce

```
node scripts/harness_l22_apertura_dso.js
```

Offline si las texturas de fase 2 están en `simulador_ocular/dso/` (o las golden
en `scripts/fixtures/dso/`) y la caché de `lib_bajar_parche.js` conserva el
parche de 1024 px de las cuatro golden (la deja `harness_decision_psf_resolucion.js`
la primera vez). La textura de fase 1 a 1024 px ya no está en disco —la recaptura
R3 la reemplazó—; su equivalente medido es ese parche de 1024 px, que L1.1
verificó indistinguible de la textura publicada.
