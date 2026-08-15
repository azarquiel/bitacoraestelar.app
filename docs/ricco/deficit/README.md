# Fase 4 — Auditoría del déficit de señal débil extensa

Harness: `scripts/harness_deficit_mezcla.js`. Réplica instrumentada de `ps1PintarParche`
(`resources/js/bitacora-gaia-render.js`), sin tocar producción. Paridad bit a bit con el
render real y SHA-1 de fotometría idéntico al baseline de Fase 3 verificados en cada corrida.
Configuración fija: 457,2 mm · 190× · SQM 21,2 · δ=2 · SIZE 720. Caché de parches en
`/tmp/bitacora-ps1-harness` (offline, determinista).

## Comandos (uno por experimento)

Auditoría por etapas (crudo → anclado → PSF → bilineal → mezcla → opacidad), balance
por ROI, medianas incondicionales de flujo, firma por regresión, H-F4 por distancia a NaN:

```
node scripts/harness_deficit_mezcla.js --obj M51
node scripts/harness_deficit_mezcla.js --obj M81
node scripts/harness_deficit_mezcla.js --obj M104
node scripts/harness_deficit_mezcla.js --obj M101
node scripts/harness_deficit_mezcla.js --obj NGC205
```

Test de ceros sintético (H-F3): parche 64² generado con LCG + Box-Muller, cielo 100 DN,
σ 8 DN, 3″/px (θ_add=0); compara el pipeline contra dos modelos independientes E1/E2:

```
node scripts/harness_deficit_mezcla.js --ceros
```

Contrafactuales (solo en el harness; producción intacta). Cada uno re-renderiza con un
único cambio, verifica por SHA que las demás etapas no se contaminan, y mide fotometría
de primera línea (flujo 0–20″, campo, Cmin, nivelFondo, rango, negros por ROI, RMS):

```
node scripts/harness_deficit_mezcla.js --obj M51 --cf s1      # s := 1 (sin escala de mezcla)
node scripts/harness_deficit_mezcla.js --obj M51 --cf sdebil  # s solo sobre señal fuerte
node scripts/harness_deficit_mezcla.js --obj M51 --cf cielo   # cielo por anillos 2–3×d25
node scripts/harness_deficit_mezcla.js --obj M51 --cf suelo   # v≥suelo → v−cielo (sin pedestal)
node scripts/harness_deficit_mezcla.js --obj M51 --cf psf     # sin convolución PSF
node scripts/harness_deficit_mezcla.js --obj M81 --cf s1
node scripts/harness_deficit_mezcla.js --obj M81 --cf suelo
```

ROIs congeladas a priori: `scripts/rois_M51.json`, `scripts/rois_M101.json`,
`scripts/rois_M81.json` (esta última creada para Fase 4 antes de medir).

## Contenido

- `datos/auditoria_*.json` — auditoría completa por objeto (5 objetos).
- `datos/test_ceros.json` — test sintético H-F3.
- `datos/*_cf_*.json` — contrafactuales (7 corridas).
- `tabla_resumen.csv` — s, cielo/σ/suelo, atribución por etapa, medianas interbrazo, firma, SHA.
- `tabla_contrafactuales.csv` — recuperación, coste fotométrico, invariantes, veredicto.
- `*.png` — render base, estado del parche, diferencias de contrafactuales.
- `informe_fase4.md` — informe con veredictos e implicaciones para H2.
