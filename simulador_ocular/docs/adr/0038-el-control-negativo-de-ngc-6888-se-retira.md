# El control negativo de NGC 6888 (listón 4 de #274) se retira

Fecha: 2026-11-15
Estado: **propuesto**, post hoc. Ticket: #567.
Enmienda a: ADR 0027 (listón 4 del prerregistro).

Medidas: `simulador_ocular/docs/validacion/control_negativo_6888_567.md`.
Arnés: `node scripts/harness_suelo_cielo.js --opciones --solo NGC6888
[--dir <banco>] [--recorte <′>] [--quitar-todas]`.

## El problema, en una línea

El listón 4 pedía que NGC 6888 diera una razón interior/exterior de píxeles >3σ
≤ 1,80, sin el anillo 0–0,5 `r_e`, como prueba de que ninguna σ «saca»
estructura que los datos no tienen. Con el banco publicado da 2,36 (L0) y 2,72
(SC, la ley que se sirve), sin que haya cambiado nada en el cielo.

## Lo medido

Sobre los cuatro PNG que ha tenido el objeto, y sobre el v3 recortado:

- **1,85 → 2,10** (PNG de #274 → v2, mismo lado): sube la σ por píxel del PNG
  (L0: 98 → 127 DN). Con un par (cielo, σ) fijo no se mueve (1,39 → 1,34).
- **2,10 → 2,36** (v2 → v3): el PNG de v3 tiene menos ruido y la baja
  (recortado a 12,73′ da 1,76, −0,34). El lado la sube (+0,60): a 12,73′ el
  anillo 3–4 `r_e` son solo las esquinas del parche, y desde 17′ cabe entero.
- **La razón sube con el umbral**: kσ con k = 2…5 da 1,68 → 2,70 sobre el mismo
  PNG. Una σ estricta la sube y una que amplifique ruido la baja.
- **Mide la máscara de estrellas**: la escena de NGC 6888 (3,54 `r_e`) conserva
  todas las estrellas de Gaia de los anillos interiores. Quitándolas todas, el
  anillo 0–0,5 baja del 59 % al 0,6 % (no era la Wolf-Rayet) y los interiores a
  un tercio.
- **El anillo exterior está dentro del objeto**: el semieje del catálogo es
  3,33 `r_e`.

## Decisión propuesta

1. **El listón 4 se retira como veredicto.** La razón depende de la máscara, del
   umbral por píxel de cada descarga y del trozo de anillo que cabe en el
   parche. Con el mismo PNG va de 1,10 a 2,72. Ningún número fijo sobrevive a
   una tirada, y uno que la referencia ya no pasa no discrimina (ADR 0005).
2. **El arnés sigue imprimiendo la medida**, sin «ok/FUERA». El 1,80 aparece
   solo como referencia histórica, para poder repetir la de #567.
3. **El veredicto de #263 sobre NGC 6888 no cambia**: «la estructura no está en
   los datos» descansa en que r (con Hα) da lo mismo que g, no en esta razón.
4. **Si hace falta un control negativo, se prerregistra de nuevo** antes de
   medirlo, con al menos:
   - todas las estrellas quitadas;
   - un anillo exterior fuera del semieje del catálogo y de la escena, completo
     dentro del parche;
   - un umbral en brillo superficial, no en σ por píxel.

   Nada de eso se mide aquí: decidirlo después de ver los números sería el
   ajuste a posteriori que el ADR 0027 quería evitar.

## Alternativas descartadas

- **Juzgar en el recorte del lado de catálogo** (`marco.ladoCatalogo`, 12,73′):
  pasa (1,76 L0, 1,44 SC), pero solo porque el «exterior» vuelve a ser las
  esquinas, que tienen la misma señal que el interior. Sería elegir la geometría
  que aprueba.
- **Bajar a ≤ razón de L0 en el mismo parche**: SC (2,72) suspende frente a L0
  (2,36) solo por ser más estricta, que es lo contrario de amplificar ruido.
- **Regenerar NGC 6888 con otro lado**: el lado sale del ADR 0034 y el control
  negativo no es motivo para tocarlo.

## Consecuencias

- `--opciones` deja de dar veredicto en el listón 4. Los listones 1–3 no cambian.
- El criterio 3 del cierre de #284 (`cierre_284_cielo_publicado.md`, «pasa:
  1,41») se juzgó con esta razón: queda como medida, no como prueba.
- `lib_parche_publicado.js` lee el `manifiesto.js` del directorio de `--dir`.
  Sin eso, medir un banco viejo medía en silencio el del árbol.
