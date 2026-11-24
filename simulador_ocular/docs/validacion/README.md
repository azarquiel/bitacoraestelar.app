# Validación

Datos de validación (matrices, líneas base, catálogos de referencia).

Orden cronológico de ejecución:

1. `e0_referencia.txt` (2026-08-17)
2. `trager1995.tsv` (2026-08-17)
3. `matriz_v7.json` (2026-08-17)
4. `m13_gaia_dr3.csv` (2026-08-17)
5. `dso_texturas_fase0.md` (2026-09-04) — medidas de la fase 0 del catálogo de texturas DSO
6. `recaptura_r1_wcs.md` (2026-09-06) — deltas de la recaptura R1 del golden difuso (WCS del recorte)
7. `dso_texturas_informe.md` (2026-09-06) — informe del generador de texturas DSO; lo reescribe `node scripts/gen_dso_texturas.js --banco`
8. `dso_texturas_l1_equivalencia.md` (2026-09-07) — L1.1: la textura y el FITS, restados píxel a píxel sobre el banco
9. `recaptura_r2_textura.md` (2026-09-07) — deltas de la recaptura R2 del golden difuso (la fuente pasa a ser la textura)
10. `dso_texturas_vistas_fase1.md` (2026-09-08) — validación visual antes/después de la fase 1 (FITS → textura)
11. `dso_texturas_l1_coste.md` (2026-09-08) — L1.3: tiempo, bytes y memoria en el navegador, sobre los 4 golden
12. `dso_texturas_fase1.md` (2026-09-08) — informe de cierre de la fase 1: veredicto de L1.1 a L1.4 y las tablas de deltas de R1 y R2
13. `emision_banda_o_ley.md` (2026-09-12) — #263: por qué NGC 6888 y NGC 7293 salen recortadas; g, r e i medidas, y la causa es distinta en cada una
14. `suelo_cielo_parche.md` (2026-09-12) — #274: de dónde salen el cielo y la σ de un parche; E1–E4 medidas contra un patrón de cielo lejano y campo vecino
16. `cierre_284_cielo_publicado.md` (2026-09-13) — #308: los cinco criterios de éxito de la épica #284, medidos contra el cielo que publica el sidecar (columna SC) y no contra el patrón
15. `recaptura_r5_cielo_vecino.md` (2026-09-13) — deltas de la recaptura R5 del golden difuso (el cielo del parche sale del campo vecino), con la línea base de la batería y el arnés de #274 re-corrido como testigo
17. `dso_texturas_l2_2_apertura.md` (2026-09-22) — #323 (US-7): L2.2, la apertura en el objeto difuso; 457 vs 914 mm en las cuatro golden sobre texturas de fase 2, el signo de `θ_add` en los seis cuantiles y la causa de que el listón no se cumpla en nativo
18. `trager1995_seed.tsv` (2026-11-13) — #537: perfiles de Trager, King & Djorgovski 1995 de los 13 globulares del seed (VizieR J/AJ/109/218, espejo CfA); mismo formato que `trager1995.tsv`
19. `mclaughlin2005_modelos_seed.tsv` (2026-11-13) — #537: ajustes King 1966, Wilson y ley de potencias de McLaughlin & van der Marel 2005 (VizieR J/ApJS/161/304/models) para los mismos globulares; M15 y M30 no tienen ajuste
20. `campo_vecino_320.md` (2026-11-14) — #320: el campo vecino cae dentro de la extensión de 10 difusas de lado medido; solo NGC 1788 lleva pedestal; V0/V1/V2 medidas y la σ «baja» de NGC 7293 era un sidecar viejo leído por el arnés
21. `control_negativo_6888_567.md` (2026-11-15) — #567: por qué la razón del control negativo de NGC 6888 pasó de 1,85 a 2,36 (σ por píxel del PNG v2, y el lado de v3) y por qué el listón 4 se retira (ADR 0038)
22. `atribucion_590.txt` (2026-11-20) — #590 (spike): catálogo de M13 contra el modelo por anillo × rango de V; el truncado de la consulta (G ≤ 18,5) explica ≤2/≤4, la completitud del núcleo explica R2v dentro de 1 r_h (ADR 0039)
23. `banco_globular_601.tsv` y `banco_globular_601_c.tsv` (2026-11-21) — #601 (spike): filas y bytes de (A) cono y (B) anillo en 30 globulares (+ M13 y M22) a 30/60/90′, y peso en disco de (C) banco ampliado a R_MAX = 1,08° en los 143; la regla da (A), el dueño elige (C) con 1,25 GB (ADR 0041)
24. `exceso_617.txt` (2026-11-23) — #617 (spike): ¿el cat/`num·c` = 2,79 de M13 en 0,5-1 r_h es de `num` o de `c`? R_num 0,93 (dentro), c_emp/c_mod 3,0 (fuera), pero el control contra la Tabla A.1 de Fabricius da 95,6 % frente a 47 %: sin veredicto; bloqueado por #619 (ADR 0039)
25. `exceso_619.txt` (2026-11-23) — #619 (spike): el mismo reparto contando solo filas con astrometría 5/6p y BP−RP; el control vale (44,9 % frente a 47 %), `num` y k valen, falla lo que cuenta `c`: sigue en #621 (ADR 0039)
26. `fusion_blending_621.txt` (2026-11-24) — #621: arnés de #577 con `--atribucion` contando como catálogo solo las filas 5/6p + BP−RP y sin el peso de #611; ≤1 V 17-18 a 1,069 ± 0,046 (listón de AC2, pasa) (ADR 0039)
27. `control_621.txt`, `ngc6752_gaia_dr3_621.csv` y `ngc7099_gaia_dr3_621.csv` (2026-11-24) — #621: el control de #619 en NGC 6752 (38,5 % contra 48 %) y M30 (80,2 % contra 77 %); el criterio vale fuera de M13. Gaia de `scripts/gen_gaia_a1_621.py`; el `.zpt` de MAST no está en el repo (ADR 0039)
