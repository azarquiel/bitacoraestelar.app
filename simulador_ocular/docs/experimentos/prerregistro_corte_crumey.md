# Prerregistro — el corte de fondo cero de Crumey en `magLimite` (#341)

Fecha: 2026-09-23. Comprometido **antes** de la medida de #342, y el historial
de git lo verifica: ningún commit de #342 puede ser anterior a este. Ningún
listón se retoca tras ver la salida. Si al ver los números un listón parece
mal formulado, se registra como FALLADO igualmente y la decisión se deja
escrita (disciplina de los ADR 0005, 0022 y 0031).

## Qué se decide

#342 quiere que subir aumentos deje de pagar donde en el ocular real ya no
paga. Para eso añade a `magLimite` el corte de fondo cero como ley derivada de
la Ec. 70 de Crumey (2014):

    d0 = p·√(10⁻⁵·F_t / B)

Es la cantidad Q2 del ADR 0030, con valor 25,08 mag/arcsec². Este documento
fija de antemano qué resultado de esa medida es confirmación, cuál es
falsación y cuál no es concluyente. #342 solo toca producción con veredicto
ADELANTE.

La variante que se juzga queda fijada aquí:

- `p` = `pupilaOjo` (7 mm), `F_t` = 1/t, y `B` sale del `sqm` con el velo
  sumado, igual que hoy.
- El corte actúa **solo** en `magLimite`.
- Con `d ≥ d0`, la curva es la actual.
- Con `d < d0`, la curva vale lo que vale en `d0`.
- La guarda `FOT.SB_SUELO_PINTADO` se mueve a mano con el corte (ADR 0030,
  Decisión 3).

La variante P2a, que cambia el literal 27 por 25,08 en la Ec. 5, no es esta
variante. Allí el corte cae en 1,52 mm y no en d0 (`maglimite_vs_crumey.md`),
porque la Ec. 5 usa 7,5 mm de pupila. L1 las distingue.

## Las 12 observaciones de H2c frente al corte (criterio 1)

`node scripts/tabla_corte_h2c.js`, ejecutado el 2026-09-23 sobre
`ricco/campo/observaciones.csv`. Columnas:

- **d**: pupila de salida, D/M.
- **SBe**: cielo en el ojo según `ctxFotometrico` de producción.
- **SB0T**: el fondo que usa `magLimite` hoy, leído de `fondoMagLimite` de
  producción (Ec. 5 con su techo de 27). Es el valor sin el corte.
- **d0**: Ec. 70 de Crumey con el cielo y la transmisión de la fila.
- **¿bajo el corte?**: `d < d0`.
- **margen**: log10(C_obj/Cmin) de H2c, con seis decimales. Es la foto que
  congela L4.

| # | objeto | D (mm) | M | d (mm) | sqm | T | SBe | SB0T | d0 (mm) | ¿bajo el corte? | resultado | margen (dex) |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---:|
| 1 | M101 | 450 | 158 | 2,85 | 21,30 | 0,80 | 23,49 | 23,64 | 1,37 | no | visto | −0,006992 |
| 2 | M101 | 300 | 158 | 1,90 | 21,20 | 0,70 | 24,42 | 24,57 | 1,40 | no | lateral | −0,160566 |
| 3 | M101 | 200 | 158 | 1,27 | 21,40 | 0,70 | 25,50 | 25,65 | 1,54 | **sí** | lateral | −0,237864 |
| 4 | NGC 6946 | 450 | 158 | 2,85 | 21,20 | 0,80 | 23,39 | 23,54 | 1,31 | no | lateral | −0,036315 |
| 5 | NGC 6946 | 200 | 158 | 1,27 | 21,60 | 0,70 | 25,70 | 25,85 | 1,68 | **sí** | lateral | −0,200501 |
| 6 | NGC 6946 | 200 | 158 | 1,27 | 21,20 | 0,70 | 25,30 | 25,45 | 1,40 | **sí** | no_visto | −0,300090 |
| 7 | M33 | 450 | 158 | 2,85 | 21,20 | 0,80 | 23,39 | 23,54 | 1,31 | no | visto | +0,011350 |
| 8 | M33 | 300 | 158 | 1,90 | 21,20 | 0,70 | 24,42 | 24,57 | 1,40 | no | visto | −0,113864 |
| 9 | NGC 891 | 450 | 158 | 2,85 | 21,20 | 0,80 | 23,39 | 23,54 | 1,31 | no | visto | +0,031324 |
| 10 | NGC 891 | 300 | 158 | 1,90 | 21,40 | 0,70 | 24,62 | 24,77 | 1,54 | no | lateral | −0,057711 |
| 11 | NGC 891 | 200 | 158 | 1,27 | 21,00 | 0,70 | 25,10 | 25,25 | 1,28 | **sí** | no_visto | −0,293008 |
| 12 | NGC 891 | 200 | 158 | 1,27 | 21,40 | 0,70 | 25,50 | 25,65 | 1,54 | **sí** | lateral | −0,196206 |

**Lectura.**

- Todas las filas de 200 mm quedan bajo el corte; ninguna de 300 ni de
  450 mm. Son las filas 3, 5, 6, 11 y 12.
- d0 no depende de la apertura, solo del cielo y de la transmisión: va de
  1,28 a 1,68 mm. Cortar en pupila y no en aumento es lo que hace que la misma
  M = 158 caiga a un lado u otro según el tubo.
- **Las dos filas `no_visto` (6 y 11) están bajo el corte.** Todo el lado
  negativo del anclaje de K = 2,0 vive en la banda que toca este cambio.
- **La fila 11 está en el filo:** d = 1,27 frente a d0 = 1,28 mm, es decir
  SBe 25,101 frente a 25,08. Un corte de 25,11 o más la saca de la banda.
- La tabla comprueba una identidad: con `p` = 7 mm y `F_t` = 1/T, `d < d0`
  equivale a `SBe > 25,08`. `ctxFotometrico` calcula SBe con la misma
  transformación de pupila que la Ec. 66 de Crumey, así que las dos
  condiciones son la misma. El script sale con código 1 si alguna fila lo
  contradice. Se probó rompiéndolo a propósito (p = 5 mm en vez de 7): sale
  con código 1 y señala las cinco filas (ADR 0005).

**Qué significa «bajo el corte» para H2c.** El margen de H2c no lee `SB0T` ni
la guarda del pintado. Solo lee `Cmin`, que se calcula en `ctxFotometrico` a
partir de SBe. El corte en `magLimite` no puede mover ningún margen. Para
moverlo habría que aplicar el suelo de 25,08 también al SBe de `Cmin`, y en
esas cinco filas SBe pasa de 25,08. Crumey lo haría así: su suelo vale
también para los extensos (Ecs. 50–52). Aquí queda prohibido (ver
«Conflicto con el ADR 0001»).

## Listones

Los tres barridos usan el detector de tramos de `harness_crumey.js` tal cual:
tolerancia de pendiente 0,5 y 200 pupilas log-espaciadas de 20 a 0,2 mm. Ni
el detector, ni el muestreo, ni el equipo se cambian después de ver la
salida.

1. **L1 — el plano empieza en d0 (física).** El tramo de pendiente 0 de
   `magLimite` con la variante empieza en la pupila `d_plano`. Se mide con
   200 mm, cielo 21,5, t 0,9 y ojo 7 mm; ahí d0 = 1,42 mm, es decir 141×. Un
   segundo equipo no añade nada: `SB0T` depende solo de d = D/M, y la apertura
   solo desplaza la curva en vertical.
   - PASA si |d_plano − d0| ≤ 0,05 mm. Es la tolerancia con que el autotest de
     `harness_crumey.js` reproduce el d0 de Bowen.
   - FALLA si |d_plano − d0| > 0,07 mm. La variante P2a cae a 0,10 mm de d0,
     pero en esta rejilla (paso de 0,03 mm hacia 1,4 mm) el detector la ve a
     0,098. 0,07 deja P2a del lado de FALLA con un paso de rejilla de margen:
     una implementación que caiga ahí ha puesto el corte en la Ec. 5 y no en
     la Ec. 70.
   - NO CONCLUYENTE entre 0,05 y 0,07 mm.

2. **L2 — el plano es plano.** Con la variante y el equipo de L1,
   `magLimite` varía como mucho 0,01 mag entre d0 y 0,2 mm. Es la variación del
   plano actual en `maglimite_vs_crumey.md` (15,46 → 15,47).
   - PASA si varía ≤ 0,01 mag.
   - FALLA en otro caso.

3. **L3 — fuera de su dominio, el cambio es nulo.** Barrido con D ∈ {200, 450}
   mm, M de 20× a 600× en pasos de 1×, sqm ∈ {21,0; 21,5; 22,0} y t 0,9.
   - Donde d ≥ d0, `magLimite` con la variante es igual a la actual a 10⁻⁹.
   - Donde d < d0, nunca es mayor que la actual.
   - PASA si se cumplen las dos cosas en todos los puntos.
   - FALLA con un solo punto que no las cumpla.

   La segunda condición se sigue de la definición de la variante; solo la
   primera puede fallar con una implementación que cumpla L1. Este listón no
   juzga la corrección de la ley nueva contra la vieja. Vigila
   que #342 no toque la curva fuera del régimen de Crumey: ni la Ec. 5, ni la
   pupila de 7,5 mm, ni el codo de 25×–29×. Contra la ley que se sustituye
   solo se vigila el alcance, no los valores.

4. **L4 — H2c intacta.** #342 añade a `scripts/tabla_corte_h2c.js` la forma
   de activar su bandera. Con la bandera activa, el script debe reproducir la columna **margen** de la
   tabla de arriba a seis decimales, en las 12 filas.
   - PASA si reproduce las 12.
   - FALLA con una sola diferencia. Además es conflicto de ADR 0001: se aplica
     la sección de abajo, no se revierte a mano y se repite.

   Así los 12 veredictos de campo (10/12 acordes) quedan fijos por
   construcción, que es más estricto que el criterio 4 de #342.

5. **L5 — la guarda del pintado se mueve con el corte.** `FOT.SB_SUELO_PINTADO`
   vale 25,08 a 0,005, la precisión con que Crumey da el fondo nulo. Además,
   `FcieloPintado` de `ctxFotometrico` cambia en las filas 3, 5, 6, 11 y 12, y
   es idéntico al actual en las otras siete.
   - PASA si se cumplen las dos cosas.
   - FALLA en otro caso. El conjunto de filas solo no basta: cualquier guarda
     entre 24,62 y 25,10 da ese mismo conjunto.

L2, L3 (su primera mitad), L4 y L5 vigilan la implementación, no la física:
fallan si #342 hace algo distinto de la variante fijada. El único listón que
contrasta con Crumey es L1.

**Informativo, sin listón:** el censo de M13 por objeto observado (criterio 6
de #342) en las escenas de `censo_corte_crumey.md`. #340 ya midió que el
efecto supera al ruido de la escena, así que el tamaño no decide nada. Se
informa para saber qué se gana y qué se pierde, no como condición.

**Tampoco se juzga:**

- **El nivel absoluto del plano.** Depende del factor de campo F, y el banco
  de Crumey es libre de F (`maglimite_vs_crumey.md`).
- **Que la curva tenga máximo.** El corte de fondo cero produce un plano, no un
  máximo (Crumey §3.2, tres tramos con el último de pendiente 0). El máximo de
  Schaefer necesitaría el segundo mecanismo de Crumey, el disco de seeing no
  puntual (Ec. 88), que queda fuera de la épica. No tener máximo no es
  FALLA.

## Veredicto

| veredicto | condición | qué hace #342 |
|---|---|---|
| **ADELANTE** | L1, L2, L3, L4 y L5 PASAN | implementa en producción tras la bandera, con los criterios 2–7 de #342 |
| **NO ADELANTE** | cualquier listón FALLA | se cierra sin tocar producción y registra qué listón falló y con qué cifra |
| **NO CONCLUYENTE** | L1 NO CONCLUYENTE y ningún listón FALLA | igual que NO ADELANTE (criterio 1 de #342) |

## Criterio de parada

- **Una sola ejecución cuenta:** la primera que produce las cifras de los
  cinco listones. Se registra en `simulador_ocular/docs/experimentos/` con
  fecha y commit, dé lo que dé.
- **Una ejecución vacua no cuenta.** Es la que aborta antes de dar las cifras:
  el autotest del harness no pasa, el literal no aparece o el script lanza una
  excepción (ADR 0005). Se arregla la causa, se anota en el informe qué abortó
  y por qué, y se ejecuta de nuevo.
- Con veredicto **NO CONCLUYENTE** no se repite la medida con otra tolerancia,
  otro muestreo, otro cielo ni otro equipo. #342 se cierra como NO ADELANTE y
  no hay versión reducida de consolación.
- **Reabrir exige un dato nuevo e independiente del harness,** con su propio
  prerregistro. Por ejemplo, magnitudes límite estelares tomadas en campo con
  pupila de salida por debajo de d0: 200 mm pasados unos 141× en cielo 21,5.
  Repetir el mismo banco no reabre nada.

## Conflicto con el ADR 0001

El ADR 0001 (línea 37) congela H2c. Estos parámetros quedan fuera del alcance
de #342:

- `FOT.C_MIN` (el nivel K = 2,0).
- `FOT.C_EXP`.
- `FOT.H2C.THETA_R_A`, `FOT.H2C.THETA_R_B` y `FOT.H2C.SEEING_AS`.
- El cálculo de `SBe` y de `Cmin` en `ctxFotometrico`, lo que incluye aplicar
  el suelo de 25,08 al SBe del umbral.

Si la implementación de #342 necesita tocar cualquiera de ellos, o L4 falla,
se hace esto:

1. Se detiene.
2. Se declara el conflicto en #342 y en la épica #337, con el parámetro
   afectado.
3. Se cierra con veredicto NO ADELANTE.

No se pisa el ADR ni se busca una variante que lo esquive. La vía para
cambiar H2c es la que da el propio ADR 0001: un experimento comparativo en
rama efímera, con su propio prerregistro.

**Consecuencia aceptada de antemano.** Si #342 sale ADELANTE, las estrellas
dejan de mejorar por debajo de 25,08 en el ojo y los extensos no. Crumey
aplicaría el mismo suelo a los dos. Esa asimetría entre `magLimite` y `Cmin`
es el precio de no tocar H2c. Se deja escrita aquí para que nadie la
«descubra» después como un fallo del cambio.
