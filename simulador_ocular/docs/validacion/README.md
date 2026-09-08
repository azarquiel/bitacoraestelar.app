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
