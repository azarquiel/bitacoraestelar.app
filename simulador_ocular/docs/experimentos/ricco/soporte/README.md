# Fase 2 — Barrido de escala del soporte de la rampa de opacidad

Instrumentación **no invasiva**: `scripts/harness_soporte_rampa.js` replica el
bucle vigente de `ps1PintarParche` con el soporte recalculado a la escala
pedida. Con `--escala 25` la réplica se verifica **bit a bit** contra
producción (dmax = 0, y el mapa de soporte elemento a elemento contra
`ps1SoporteLocal`) y contra el baseline de la Fase 1; ese comando debe correrse
**primero** en cada objeto porque congela el baseline (JSON + `E_s25.bin`)
contra el que las demás escalas miden RMS, anillos y diferencias.

## Un comando por (objeto, escala)

```sh
# baseline y paridad (obligatorio primero, por objeto)
node scripts/harness_soporte_rampa.js --obj M51 --escala 25

# parrilla fija
node scripts/harness_soporte_rampa.js --obj M51 --escala 50    # y 75, 100, 150

# serie física α·θR/MAG (α=1,2,4 → 33, 66, 132″ a la config de referencia)
node scripts/harness_soporte_rampa.js --obj M51 --escala 33    # y 66, 132

# multiescala (máximo del contraste soportado; exploratoria en esta fase)
node scripts/harness_soporte_rampa.js --obj M51 --multi 25+50+75+100+150

# centinelas y controles
node scripts/harness_soporte_rampa.js --obj M104 --escala 25   # luego --escala 150
node scripts/harness_soporte_rampa.js --obj M81  --escala 25   # luego --escala 150
node scripts/harness_soporte_rampa.js --obj M101 --escala 25
node scripts/harness_soporte_rampa.js --obj NGC205 --escala 25
```

Objetos: M51, M81, M104, M101, NGC205. Configuración de referencia
457,2 mm · 190× · SQM 21,2 · δ = 2 (cambiable con `--D --M --sqm --delta` y
registrada en cada JSON). Determinista; parche PS1 cacheado en el temporal del
sistema tras la primera descarga. Las ROIs son las **congeladas** de la Fase 1
(`scripts/rois_M51.json`); no se recolocaron.

## Salidas

Por corrida, en `.scratch/soporte/<obj>/` (aquí se copian los JSON, la tabla y
los PNG clave): `barrido_<obj>_<etiqueta>.json` (config, paridad, θR,
clasificación a–e, solo-rampa, ROIs con op mediana/p10/p90, cielo del campo
—px con d/d_μ25 > 1,5 dentro del parche—, anillos elípticos 1,0–2,0, huella
SHA-1 de la fotometría pre-opacidad, coste ms, y contra el baseline: RMS de
nivel, Δmag por anillo, Δ del cielo), `render_E_<etiq>.png`,
`clases_<etiq>.png` (colores de la Fase 1), `diff_<etiq>.png` (rojo = más
brillante que s25, azul = más oscuro).

`tabla_resumen.csv`: todas las corridas × métricas de decisión.

Veredicto (H-D descartada, con el techo multiescala y el patrón de fallo):
`informe_fase2.md`.
