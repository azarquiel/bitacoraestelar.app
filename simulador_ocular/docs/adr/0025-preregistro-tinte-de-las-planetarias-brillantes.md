# 25. El tinte de las planetarias se prerregistra antes de escribir su ley

Fecha: 2026-09-06. Ticket #211; bloquea a #84 (deuda funcional del color de
las planetarias). Cero cambios en `resources/js/`.

## Contexto

En v1 la nebulosa planetaria se pinta acromática, como el resto de difusas
(cadena luma → flujo, ADR 0013). Al ocular, con apertura suficiente, algunas
muestran un tinte azul-verdoso que viene de la línea [O III] 500,7 nm; otras,
igual de brillantes, salen grises. Modelarlo exige física perceptual nueva
(respuesta de los conos ante una fuente extensa a luminancia mesópica), y la
ley de textura del grano SBF (ADR 0015) enseñó lo que cuesta descubrir al final
que un canal es invisible por ley: todo el desarrollo.

Así que primero se fija qué contaría como acierto y qué como falsación, con
números, y solo después se decide si merece la pena escribir la ley.

## Decisión

1. **No se implementa nada hasta que el prerregistro concluya que hay algo que
   ver.** Los listones viven en `0025-tinte-planetarias/prerregistro.md` y no se
   retocan tras ver ningún render. El ticket de implementación se abre después,
   y solo si el prerregistro no cierra el canal.

2. **La entrada de la ley es fotometría de líneas, no la fila del catálogo.**
   La `mag_v` de la fila `PN` está recortada al suelo `MU_MIN_COMPACTA` = 17,5
   (`gen_nebulosas.py`): NGC 7662 sale de μ_e = 16,4 a 17,5 y NGC 6826 pierde
   1,6 mag. Un tinte calculado sobre esa magnitud heredaría el recorte. La ley
   recibe, por objeto:
   - `log F(Hβ)` — Acker et al. 1992, *Strasbourg-ESO Catalogue of Galactic
     Planetary Nebulae*, VizieR **V/84/hbeta**, columna `log(Fbeta)`.
   - `I5007`, `I6563`, `I4686` — **V/84/intens**, `LineRef = b`, relativas a
     Hβ = 100 y **sin corregir de enrojecimiento**: lo que cuenta es lo que
     llega al ojo, no lo intrínseco. [O III] 4959 se fija a `I5007 / 2,98`.
   - diámetro — OpenNGC `MajAx`, el mismo que usa la fila.
   Las dos tablas ya las consulta `gen_abell_pn.py`; no hay fuente nueva.

3. **Sin razón de líneas no hay color.** Una planetaria sin `I5007` en V/84
   (o sin fila) se pinta acromática, y se escribe así en la fila (`i5007 = null`),
   no se estima a partir de su clase de excitación ni de su magnitud. Medido
   el 2026-09-06: de las 128 `PN` NGC/IC del catálogo, 119 tienen PNG en V/84,
   107 traen `I5007` y **104 traen las tres cosas** (recuento reproducible con
   `scripts/entradas_tinte_np.py --alcance`). Entre las 24 sin dato
   completo están **M57** (sin fila en `intens`) y **NGC 40** (`I5007` en
   blanco): las dos quedan grises por regla, no por ley. Si más adelante se
   quiere M57, la fuente secundaria declarada es la fotometría de líneas de
   Barker (1987, ApJ 322, 922); se incorpora como columna, no como excepción
   en el render.

4. **Alcance.** Entran las `PN` con luminancia fotópica del disco
   L_fot ≥ 3,6·10⁻⁴ cd/m² (μ_fot ≤ 21,2 mag/arcsec² con μ = 12,6 − 2,5·log L,
   Crumey 2014). Es el brillo por debajo del cual ni una pupila de 7 mm alcanza
   el umbral E_c que fija el ancla (§ prerregistro); no es un corte estético.
   Con las tablas de hoy (`entradas_tinte_np.py --alcance`): 81 objetos, de IC 2501 (1,8″, μ_fot 12,6, casi
   estelar) a M27 (21,07); NGC 6572 (15,1), NGC 7662 (16,4) y NGC 6905 (19,9)
   en medio.
   Quedan fuera Helix (23,4), NGC 246, NGC 1514, todos los Abell, y cualquier
   clase que no sea `PN`.

5. **Una formulación y una vía de escape, las dos escritas antes de medir.**
   F1 es una puerta de iluminancia retinal por un factor de tamaño aparente y
   la pureza cromática del espectro de líneas; F2 cambia la puerta al cono M.
   Están en el prerregistro con sus parámetros; ninguna tiene un tercer
   parámetro que ajustar a posteriori.

6. **Criterio de invisibilidad.** Tres cierres, numerados igual en el
   prerregistro (§6): (1) ningún E_c en [0,001, 1] td deja las cinco anclas
   del lado correcto, ni con F1 ni con F2; (2) con la ley anclada, ningún
   objeto del alcance alcanza tinte con apertura ≤ 250 mm bajo SQM 21,0 y
   pupila de salida entre 0,5 y 7 mm; (3) ninguno lo alcanza con apertura
   ≤ 500 mm. Cualquiera de los tres cierra la ley apagada como la de textura,
   con la medida anotada. Las anclas ya dicen que el tinte existe a 457 mm;
   el (2) protege de construir una capa que solo se enciende con un equipo.

## Lo que este ADR no decide

- Nada del render: ni cómo se mezcla el tinte con la luma del parche PS1, ni
  qué hace el fondo de cielo con el color. Eso es del ticket de implementación.
- Nada sobre la estrella central (NGC 6826 tiene una de V ≈ 10,4 dentro del
  disco): la ley la ignora y se declara como límite conocido.
- Nada sobre `Neb`, `HII`, `SNR`: NGC 6888 y NGC 7635 tienen líneas, pero son
  otra clase y otro prerregistro.

## Consecuencias

- El ticket de implementación, si se abre, tiene que ampliar la fila `PN` con
  cuatro columnas (`log_fhb`, `i5007`, `i6563`, `i4686`) desde
  `gen_nebulosas.py`, y el test de la fila comprueba que las 24 sin dato
  llevan `null`, no cero.
- `scripts/entradas_tinte_np.py` tabula las entradas de las anclas y las
  predicciones a partir de los valores de V/84 citados, y comprueba que las
  cinco anclas caen del lado que dice la bitácora. Es la tabla del
  prerregistro, no la ley: no se importa desde el render.
- La bitácora manda. Una observación futura que contradiga una predicción P1–P7
  falsa F1 y dispara F2; si F2 también falla, la capa se cierra.

Documentos de apoyo: `0025-tinte-planetarias/` (README con el orden).
