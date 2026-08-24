# El color de una estrella se resuelve por identidad de Gaia, no por posición

`bitacora_gaia_bprp()` pedía el BP–RP de la estrella más brillante en un radio
de ~10″ alrededor de las coordenadas de SIMBAD. Funcionaba para estrellas
sueltas, pero fallaba en silencio con sistemas múltiples: al resolver «Gamma
Andromedae» (K3 muy brillante, saturada y fuera de Gaia, con una compañera B
más débil a corta distancia), la búsqueda por radio enganchaba a la compañera
— y el vecindario solar pintaba de azul una gigante roja/naranja, sin ningún
error ni aviso.

**Comprobado en vivo (SIMBAD TAP + VizieR):** una estrella bien resuelta
(Proxima Centauri, 61 Cyg A) tiene su propio identificador `Gaia DR3 <id>` en
la tabla `ident` de SIMBAD. Gamma Andromedae y Sirius, resueltas como el
sistema completo, no lo tienen — SIMBAD ya sabe que no hay un vínculo 1:1
limpio con una fuente de Gaia.

**Decidido:**

1. **Identidad manda sobre posición.** `bitacora_simbad()` consulta también
   si SIMBAD vinculó el objeto a un `Gaia DR3 <source_id>`
   (`bitacora_simbad_gaia_dr3_id()`). `bitacora_gaia_bprp()` solo acepta ese
   id exacto — nunca vuelve a hacer `CONTAINS(...CIRCLE...)`.
2. **Sin id vinculado, no se adivina por radio.** Si SIMBAD, que ya hace su
   propio crossmatch, no encontró una fuente de Gaia inequívoca para el
   objeto, una búsqueda posicional del plugin tampoco va a acertar mejor —
   solo tiene más superficie para enganchar al vecino. `bp_rp` se queda en
   `NULL`.
3. **El respaldo es el tipo espectral, no una segunda búsqueda por Gaia.**
   Con `bp_rp = NULL`, el frontend (`bpRpDe()` en
   `via-lactea-vecindario-catalogo.js`) usa `sp_type` de SIMBAD vía
   `BitacoraGaiaColor.bpRpPorTipo()`, ya existente para las componentes de
   dobles del catálogo sin fotometría de Gaia (ver [[Modelo de color Gaia]]
   en `CONTEXT.md`).

**Consecuencia aceptada:** cobertura de `bp_rp` real más estrecha que antes
(antes "false positive" con cualquier estrella dentro del radio; ahora nada si
SIMBAD no vinculó). El respaldo por `sp_type` es una aproximación para pintar,
no fotometría — mismo trato que ya reciben las estrellas del catálogo sin
Gaia.
