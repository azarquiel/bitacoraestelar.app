# Prerregistro de listones — niebla sub-`mlim` en cúmulos abiertos

Fecha: 2026-09-01. Comprometido ANTES de ejecutar el harness
(`scripts/harness_niebla_abiertos.js`). Ningún listón se retoca tras ver la
salida: si un listón falla, la capa se descarta o se documenta el fallo, nunca
se ajusta el umbral a posteriori (disciplina de los ADR 0012 y 0015).

Fuente: `simulador_ocular/docs/notas/nubosidad-cumulos-abiertos-gaia.md`
(investigación del 2026-09-01).

## Qué se mide

La «nubosidad» visual de un cúmulo abierto como luz estelar catalogada por
Gaia por debajo de la magnitud límite del equipo. Para cada cúmulo, equipo y
anillo:

- **Flujo sub-umbral** de las estrellas con `g > mlim` (Gaia DR3, `G ≈ V`
  frente a la escala del sqm, misma aproximación que el ADR 0014), partido en
  dos bandas según lo que el render hace HOY con ellas:
  - **banda glow** `(mlim, mlim + 2,30]`: hoy se pinta como sprite de glow
    (`alfaMin`/`glowCorte`, cola = −2,5·log₁₀(0,006/0,05) = 2,30 mag);
  - **banda perdida** `(mlim + 2,30, 20,0]`: hoy se descarta entera
    (`aGlow < glowCorte` en `dibujar()`), su flujo no va a ningún sitio.
- **μ** (mag/arcsec²) de cada banda por anillo, y su contraste
  `C = F_banda / Fcielo` contra el **`Cmin` de producción**
  (`ctxFotometrico` con H2c activa, ADR 0008: la ley se importa, no se copia),
  evaluado con `thetaIntArcmin` = diámetro exterior del anillo.

Un anillo es **visible** si `C_total ≥ Cmin` (las dos bandas sumadas: la
pregunta física es si la luz sub-`mlim` se ve, no cómo la trocea el render).

## Banco (fijado antes de medir)

Coordenadas y radios documentales (SIMBAD / literatura de la nota; el radio R
es el del cúmulo visible, no la tidal):

| Cúmulo | RA° | Dec° | R (arcmin) | Papel |
|---|---|---|---|---|
| M11 (NGC 6705) | 282.77083 | −6.27 | 7 | positivo (listón duro) |
| NGC 7789 | 359.334 | +56.726 | 8 | positivo (listón duro) |
| M37 (NGC 2099) | 88.074 | +32.545 | 12 | positivo esperado (informativo) |
| M46 (NGC 2437) | 115.438 | −14.810 | 13 | positivo esperado (informativo) |
| Pléyades (M45) | 56.75 | +24.117 | 55 | control negativo (listón duro) |
| NGC 1664 | 72.763 | +43.676 | 9 | control negativo (listón duro) |
| NGC 2266 | 100.862 | +26.974 | 2.5 | control negativo (listón duro) |

M11 y NGC 7789 son los arquetipos del «fondo nebuloso» visual (turnoff cerca
de `mlim`); las Pléyades son el control del fenómeno equivocado (su
nebulosidad real es reflexión, NGC 1435, y la luz estelar sub-umbral ronda
μ ≈ 24–25); NGC 1664 y NGC 2266 son los abiertos pobres del banco del ADR
0018, sin reportes de nubosidad.

Anillos: `[0, 0,25R]`, `(0,25R, 0,5R]`, `(0,5R, R]`.

Equipos (SQM 21,5, transmisión 0,8, pupila de ojo 7 mm, `mlim` por
`magLimite()` de producción):

- E1: 200 mm, 61×
- E2: 200 mm, 150×
- E3: 457 mm, 61× (comparación de apertura a igual aumento)
- E4: 457 mm, 229×

Datos: Gaia DR3 (VizieR `I/355/gaiadr3`) hasta G = 20,0 (`GAIA_MAG_TOPE`),
pineados en `scripts/fixtures/gaia/niebla_*.csv` (misma disciplina que
`gen_fixtures_gaia.js`: el harness exige entrada estable).

## Listones

| # | Comprobación | Umbral |
|---|---|---|
| P1 | M11, E1: algún anillo visible | `C_total ≥ Cmin` en ≥ 1 anillo |
| P2 | NGC 7789, E1: algún anillo visible | `C_total ≥ Cmin` en ≥ 1 anillo |
| P3 | Controles (M45, NGC 1664, NGC 2266): ningún anillo visible en ningún equipo | `C_total < Cmin` en todos |
| P4 | Monotonía con la apertura, a igual aumento: la niebla de M11 con 457 mm (E3) es menor que con 200 mm (E1) | `C_total(E3) < C_total(E1)` en el anillo nuclear |

P1/P2 falsean si el arquetipo no saca la mancha del lado visible con el
equipo clásico de la observación (200 mm a bajo aumento). P3 falsea si la
capa pintaría niebla donde nadie la reporta (o donde lo que se ve es
reflexión). P4 falsea si la capa no hereda de `mlim` la dependencia con la
apertura (más apertura → el corte baja → menos luz queda en la niebla).

M37 y M46 se imprimen como predicción informativa (positivo esperado débil),
sin listón: su turnoff está más lejos de `mlim` y el prerregistro no quiere
fingir una precisión que la estimación de la nota no tiene.

Diagnóstico adicional (sin listón, orienta la implementación): el reparto
`banda glow` / `banda perdida` por anillo. Si la visibilidad de M11 viene
sobre todo de la banda que el glow ya pinta, la implementación es calibrar el
canal existente; si viene de la banda perdida, es el enrutado al campo
difuso (`pintarFot`) descrito en la nota, §8.

## Vía de escape única

Si P1 o P2 fallan: la niebla no se ve ni donde la observación dice que se ve;
se documenta con las medidas y se cierra sin código (mismo cierre que los dos
ejes de Gaia y la textura). Si P3 falla: la capa sobre-pinta y no entra en
producción tal cual; se documenta el exceso y no se implementa sin un nuevo
prerregistro. Si P4 falla: hay un error de cadena (el `mlim` de producción ya
depende de la apertura); se investiga como bug antes de decidir nada.

---

## Resultado de v1 (2026-09-01) — P3 FALLA

Ejecutado tal como está prerregistrado arriba. Medido:

- P1 PASA: M11/E1, los tres anillos visibles (nuclear μ = 20,38,
  C = 2,79 contra Cmin = 0,34).
- P2 PASA: NGC 7789/E1, los tres anillos visibles (nuclear C = 0,68 contra
  0,31).
- P4 PASA: C(M11 nuclear) E3 = 1,59 < E1 = 2,79.
- **P3 FALLA**: NGC 1664 sale visible con E3 (C = 0,157/0,131/0,132 contra
  Cmin = 0,149/0,120/0,107) y NGC 2266 con E1 (anillo exterior, 0,415 contra
  0,278) y E3.

Diagnóstico, con los números de la propia corrida: lo que cruza el umbral en
los controles no es el cúmulo, es el **campo galáctico** — su μ sub-`mlim`
(23–24 en el plano) es casi plano en radio (NGC 1664/E1: 23,17/23,14/23,33
del centro al borde; compárese con el gradiente real de M11:
20,38/20,70/21,19). La medida de v1 suma toda la luz sub-umbral contra el
cielo del SQM, así que con un Cmin bajo (457 mm a pupila llena) cualquier
campo del plano «se ve». Y esa componente uniforme ya tiene canal en el
modelo: es el velo del ADR 0014 (`veloSB`, cielo extra), no la niebla del
cúmulo. Conclusión de v1: la capa tal como la medía v1 sobre-pinta; no se
implementa con esta medida.

## Prerregistro v2 (comprometido antes de medir el exceso)

Cambia solo la MEDIDA; banco, anillos, equipos y los cuatro listones quedan
idénticos. La niebla del cúmulo es el **exceso local sobre el campo**:

- Línea base del campo: densidad de flujo sub-`mlim` (misma banda
  `(mlim, 20]`) en el anillo exterior del fixture `(R, 1,1R]` — fuera del
  radio documentado del cúmulo. En los positivos ese anillo aún contiene
  periferia del cúmulo, así que la base va sobrestimada y el exceso es COTA
  INFERIOR: conservador justo en los listones que tienen que pasar.
- `C = (F_anillo − F_base) / Fcielo`, con exceso negativo tratado como 0.
- La componente uniforme (la base) NO se descarta: es el canal `veloSB`
  existente; aquí simplemente no se le imputa al cúmulo. `Cmin` y `mlim` se
  quedan como en v1 (el velo del campo ordinario, μ ≥ 23, mueve el sqm 21,5
  menos de 0,2 mag; si la capa llega a producción, entrará por `sumaSB` como
  ya hace el ADR 0014).

Si con v2 P3 sigue fallando, se cierra sin código y sin tercer prerregistro:
dos medidas razonables que sobre-pintan son un no.

## Resultado de v2 (2026-09-01) — PASA 4/4

Ejecutado con la medida de exceso local, sin tocar banco, anillos, equipos ni
listones. Medido (`node scripts/harness_niebla_abiertos.js`):

- **P1 PASA**: M11/E1, anillos nuclear y medio visibles
  (nuclear μ = 20,38, μ_exceso = 20,97, C_exc = 1,629 contra Cmin = 0,339).
- **P2 PASA**: NGC 7789/E1, anillos nuclear y medio visibles
  (nuclear C_exc = 0,362 contra Cmin = 0,313).
- **P3 PASA**: ningún anillo visible en M45, NGC 1664 ni NGC 2266, en ninguno
  de los cuatro equipos. Lo que en v1 los cruzaba era la componente plana del
  campo galáctico, que la línea base absorbe: NGC 1664/E3 baja de C = 0,157 a
  C_exc = 0,033 contra Cmin = 0,149.
- **P4 PASA**: C_exc(M11 nuclear) E3 = 0,640 < E1 = 1,629.

Informativos (sin listón): M37/E1 sale visible, M46/E1 no.

Decisión: se implementa. El enrutado vive en `nieblaCampo()`
(`resources/js/bitacora-gaia-render.js`), solo para campo ordinario —con
cúmulo, la población sub-`m_res` ya la conserva `S1campo` (ADR 0012) y sumar
el catálogo encima sería doble conteo—. El reparto espacial va con un núcleo
tienda separable a la escala de Ricco, no con una rejilla de celdas: una
rejilla pinta cuadrados de borde duro y fase arbitraria, y ese escalón es
estructura visible que el modelo no predice. La conservación y la suavidad se
comprueban en `scripts/test_niebla_abiertos.js` (ADR 0003).

---

## Parche estético: `FOT.NIEBLA_GANANCIA_ESTETICA` (2026-09-01)

Decisión posterior al prerregistro, tomada **a sabiendas de que contradice el
ADR 0004** (*nada de parámetros estéticos para tapar fotometría*). Se escribe
aquí en vez de pisarlo en silencio.

### Qué se hace

`nieblaCampo()` multiplica por `FOT.NIEBLA_GANANCIA_ESTETICA` (1,5 por defecto)
el flujo que deposita en el campo difuso, antes de que la cadena lo juzgue. El
total que devuelve la función **no** lleva el factor: sigue siendo el flujo real
del catálogo, para que la desviación quede acotada a lo pintado y siga siendo
medible.

### Por qué se acepta la trampa

La cadena limpia deja la niebla en +24 DN sobre el fondo (de 255) en el caso
nominal (M11 nuclear, 200 mm/61×, sqm 21,5), y eso se percibe flojo. El
diagnóstico honesto es que no está claro que el defecto sea de la niebla: el
eslabón sospechoso es la gamma perceptual (`GAMMA_PERCEPTUAL = 0,45`), calibrada
contra perfiles sintéticos, que en cielo urbano llega a amplificar ×42 y en
cielo oscuro no amplifica nada (×1,0). La niebla es la capa más expuesta a ese
eslabón porque vive justo en la zona de umbral. Corregir la gamma sería la vía
del ADR 0004; el parche es la vía barata, y se elige la barata a propósito.

### Lo que el parche cuesta, explícito

- **No es un realce neutro.** El factor entra antes de `visibilidadDifusa`, así
  que baja también el umbral efectivo de detección. Sube el riesgo de pintar
  niebla en cúmulos pobres: P3 ya salía marginal a sqm 22 sin el parche
  (NGC 2266/E3, C = 0,184 contra Cmin = 0,175).
- **Los listones de arriba dejan de estar verificados con la ganancia puesta.**
  El harness mide el catálogo, no lo pintado, así que su PASA 4/4 describe la
  capa con ganancia 1. Con 1,5 nadie ha vuelto a pasar P3.
- **Rompe la conservación del ADR 0003** en lo pintado, por diseño.
- Es un mando cuyo único criterio de ajuste es el aspecto de la imagen, que es
  exactamente la forma que el ADR 0004 prohíbe. `test_disciplina_v7.js` §3 no lo
  atrapa porque solo escanea `bitacora-cumulos.js`, no el render.

### Cómo salir de aquí

`NIEBLA_GANANCIA_ESTETICA = 1` restaura la cadena limpia y la conservación
exacta (T1b de `scripts/test_niebla_abiertos.js`). El mando es ajustable en
caliente desde la consola del navegador
(`BitacoraGaiaRender.fot.NIEBLA_GANANCIA_ESTETICA = 2.0`) justo para poder
decidir el valor mirando, y para poder apagarlo sin desplegar.

Si el parche se queda, la deuda pendiente es medir la gamma perceptual en el
régimen de umbral y, si la causa está ahí, corregir la ley y retirar el mando.

### P3 con la ganancia puesta (2026-09-01)

Medido después de fijar `NIEBLA_GANANCIA_ESTETICA = 1,5`, juzgando el listón
como lo ve el render (`C_exc × 1,5 ≥ Cmin`), sqm 21,5:

| Control | Equipo | Anillo | C_exc × 1,5 | Cmin |
|---|---|---|---|---|
| NGC 2266 | E1 200 mm 61× | 1,3–2,5′ | 0,289 | 0,278 |
| NGC 2266 | E3 457 mm 61× | 0,6–1,3′ | 0,231 | 0,203 |
| NGC 2266 | E3 457 mm 61× | 1,3–2,5′ | 0,180 | 0,143 |

M45 y NGC 1664 quedan por debajo del umbral en los cuatro equipos. **P3 FALLA
solo por NGC 2266**, por márgenes del 4 %, 14 % y 26 %.

Es el fallo que el propio parche anunciaba: la ganancia entra antes de
`visibilidadDifusa`, baja el umbral efectivo y el primero en cruzarlo es el
cúmulo pobre. Atenuante, no excusa: NGC 2266 tiene R = 2,5′, su anillo base
`(R, 1,1R]` es una corona de 0,25′ con pocas estrellas, y esa línea base ruidosa
infla el exceso. No se distingue con esta medida si el sobre-pintado es real o
artefacto de la base.

Queda así, con el fallo escrito y la capa en producción a 1,5: es una decisión
de gusto tomada a sabiendas (ver arriba), no un listón que se haya reinterpretado
para que pase. Para cerrarlo haría falta o bien una base de campo más ancha en
los cúmulos pequeños —y volver a medir—, o bien mirar NGC 2266 en el simulador y
juzgar si la niebla que pinta es defendible.
