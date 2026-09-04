# El modelo intrínseco de un objeto difuso vive en la fila de catálogo

Al incorporar el primer objeto difuso no galáctico (M57, nebulosa planetaria,
rama `worktree-nebulosa-planetaria-ps1`) la pregunta era dónde cortar entre «qué
es el objeto» y «cómo lo observa el telescopio». La alternativa evaluada fue un
descriptor por clase con responsabilidades intercambiables (escena, relleno,
fracción de luz, θ intrínseco), al estilo de una jerarquía de tipos.

La medición sobre el pipeline dijo otra cosa: la capa PS1 ya estaba separada.
Todo lo que parecía «específico de galaxias» —la elipse de protección μ=25, el
relleno por isofotas, el anclaje a la mag V con fracción de luz, el θ de H2c—
es en realidad específico del **modelo Sérsic que la fila de catálogo declara**
(`r_e, b/a, PA, magV, n, B/T`), y `gen_nebulosas.py` ya construía cada nebulosa
como ese mismo modelo («mismo esquema que las galaxias: las pinta la misma
capa») aunque nadie la hubiera enchufado nunca al render. El resto del pipeline
—parche PS1, quitar-estrellas, PSF, mezcla bilineal, rampa de opacidad, H2c,
display— no contiene ni una hipótesis galáctica.

**Decidido:**

1. **El modelo intrínseco es DATO, no código.** Un objeto difuso entra en la
   capa PS1 aportando una fila con el esquema común; el generador de su
   catálogo es responsable de que esa fila sea un modelo fotométrico honesto
   (así, r_e de una compacta se resuelve con otra escala y otro suelo de μ que
   el de una HII: eso vive en `gen_nebulosas.py`, no en el render).

2. **La clase explícita del objeto decide QUÉ filas entran, no qué código
   corre.** `ps1CatalogoDifuso` filtra por la columna de clase (Type del
   OpenNGC); v1 admite solo `PN`. Abrir otra clase exige validarla antes, no
   tocar el pipeline. Observación y display no conocen la clase.

3. **La clase solo diverge donde la física lo exige, y cada divergencia se
   demuestra.** Única hoy (medida en M57): el borde de una planetaria es real
   —cáscara, semieje de catálogo— y no la isofota μ=25 del ala exponencial,
   que cae 2,8 veces más lejos; escena de protección y θ de H2c usan ese borde
   (`ps1RadioBordeAs`, `ps1ThetaIntDeGal`). Las galaxias siguen por la
   isofota: su borde ES una isofota.

Guardianes: `scripts/test_golden_difusas.js` (las galaxias, bit a bit, con
fixtures Gaia pineados) y `scripts/test_nebulosa_planetaria.js` (la PN recorre
el mismo pipeline: estrella central conservada por escena, luz integrada = mag
V, θ del borde real, sin NaN al lienzo).

**Ampliación (19-ago-2026, rama `worktree-nebulosas-emision-reflexion`):**
HII/EmN/RfN abiertas por la misma puerta, validadas con M78 (reflexión),
NGC 7635 (emisión compacta) y NGC 6888 (filamentosa): sin borde real —su
extensión sí es isofotal, como las galaxias—, mismo pipeline, fotometría
anclada con su fracción de luz. La validación añadió una regla al punto 3:
**las clases extensas exigen lado de parche sin recorte** (`ps1CabeEnParche`).
NGC 7000 pasaba el corte de fracción (0,41) y salía un cuadrado de campo
estelar anclado a mag 4,3 sin nebulosa: el fenómeno que ya excluyó a M31,
pero que el corte de fracción no caza cuando el stack de PS1 ya restó la
emisión extendida. Guardián: `scripts/test_nebulosas_emision_reflexion.js`.

`SNR` abierta en la misma rama, validada con M1 (el Cangrejo): compacta como
la planetaria —borde real, escena y θint del semieje de catálogo—, pero ser
compacta **no exime de la puerta de tamaño**: los segmentos del Velo
(NGC 6960/6992/6995, 6·r_e de 22′ a 330′) llegan recortados y anclarían su
mag 6,7 a un recorte que no los contiene. La exención queda solo para las
planetarias, cuyo mayor 6·r_e es 11,6′. Guardián:
`scripts/test_resto_supernova.js`.

Lo que esto NO es: una puerta para «un sistema de nebulosas». `Neb` y `Cl+N`
(cajón de sastre y mezcla cúmulo+nebulosa) siguen cerradas; si alguna
clase necesita algo que una fila Sérsic no puede decir (filamentos, cáscara
incompleta), la conversación es sobre el esquema del catálogo, no sobre añadir
ramas al render. Los cúmulos siguen su propia vía (ADR 0002): su modelo
intrínseco es una población, no una fila fotométrica.

**Ampliación (2026-09-04, ADR 0024):** la fila puede tener dos fuentes declaradas
por fila en un manifiesto hermano —la fila Sérsic sola, o la fila más una textura
generada offline de un sondeo público con procedencia—. Con textura manda la
imagen y la fila fija el presupuesto de luz (ADR 0021); sin textura, la fila es el
modelo. La clase sigue sin decidir código. Listones, banco y vías de escape en
`0024-preregistro-catalogo-de-texturas-dso.md`.
