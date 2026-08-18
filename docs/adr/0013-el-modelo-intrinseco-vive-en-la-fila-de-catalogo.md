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

Lo que esto NO es: una puerta para «un sistema de nebulosas». Emisión,
reflexión y restos de supernova tienen filas generadas pero clase cerrada; si
alguna necesita algo que una fila Sérsic no puede decir (filamentos, cáscara
incompleta), la conversación es sobre el esquema del catálogo, no sobre añadir
ramas al render. Los cúmulos siguen su propia vía (ADR 0002): su modelo
intrínseco es una población, no una fila fotométrica.
