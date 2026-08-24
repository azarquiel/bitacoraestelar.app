# Fase 1 — Diagnóstico de depresiones negras interbrazos (M51)

Instrumentación **no invasiva**: el harness replica el bucle vigente de
`ps1PintarParche` (bilineal + soporte local, c99b72c) y comprueba **paridad bit
a bit** contra producción en cada ejecución. No hay ningún cambio en
`resources/js`, así que no hace falta bandera de depuración: producción queda
intacta por construcción.

## Un comando por experimento

```sh
# Tarea 0 + 1 + 2 + 3 (M51 con ROIs; determinista, parche cacheado en disco)
node scripts/harness_interbrazos.js --obj M51

# Controles cruzados (mapa de clasificación, sin ROIs)
node scripts/harness_interbrazos.js --obj M104
node scripts/harness_interbrazos.js --obj M81
```

Configuración de referencia (parametrizada y registrada en el baseline):
457,2 mm · 190× · SQM 21,2 · δ = 2 niveles. Cambiables con
`--D --M --sqm --delta`. No hay aleatoriedad en ninguna etapa: misma entrada →
mismo volcado (el parche PS1 se cachea en el temporal del sistema tras la
primera descarga).

## Salidas (`.scratch/interbrazos/<obj>/`)

- `baseline_interbrazos_<obj>.json` — configuración exacta, contexto
  fotométrico, clasificación (a–e), solapes de condiciones, métricas H-A/H-B/H-C
  con veredicto, resumen por ROI.
- `rois_pixeles.csv` — volcado por píxel y por etapa (v_crudo, v_anclado, NaN,
  v_psf, w, fm, f_mezcla, soporte, op, dentroEscena, d/d_μ25, f_post, nivel E,
  nivel F, magnitudes, clase, máscara de condiciones).
- `mapa_clasificacion.png` — negro coloreado por causa dominante sobre el render:
  magenta (c anclaje), naranja (d mezcla), azul (a op fuera de escena), rojo
  (b op dentro de escena), cian (e mapeo); contornos μ25 ×1/1,1/1,25/1,5 en verde.
- `parche_clasificacion.png` — lo mismo proyectado a la rejilla del parche
  (violeta = NaN de ausencia), con las ROIs en verde.
- `render_E.png` / `render_F_adaptada.png` — nivel de pantalla de producción.
- `render_asinh_pre.png` / `render_asinh_post.png` — mapeo alternativo (asinh)
  del buffer lineal antes y después de la opacidad (solo visualización).
- `falso_color_mag.png` — magnitud sobre el umbral en falso color.

## ROIs (`scripts/rois_M51.json`)

Coordenadas de **parche** (1024², y crece al norte). Las cuatro interbrazo son
cajas sin NaN con mediana cruda 2–3σ sobre el cielo en cuatro acimuts; brazo =
caja no nuclear de mediana máxima (53σ); cielo = esquina sin galaxias; puente =
señal intermedia real (15σ) hacia NGC 5195. La colocación se afinó en una pasada
(dos primeras propuestas caían sobre brazo/zona sobresustraída) **antes** de
congelar el baseline; después no se han movido.

Veredictos y atribución: `informe_fase1.md`.
