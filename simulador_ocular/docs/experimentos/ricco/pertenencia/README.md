# Fase 3 — Pertenencia a estructura: variantes E1 y E2 sobre la rampa de opacidad

Instrumentación **no invasiva** en `scripts/harness_soporte_rampa.js` (el mismo
harness de la Fase 2, extendido). Patrón no destructivo:

    op_final(x) = max( op_produccion_25(x), componente_variante(x) )

La misma pasada pinta los **dos** renders (producción y variante), así que todas
las diferencias (interbrazos, puente, cielo, anillos, ROIs de fuente compacta,
RMS) son internas a la corrida; con la variante apagada la réplica es bit a bit
la de `ps1PintarParche` (verificado con `--escala 25` en los cinco objetos).

## Variantes

- **E1 (estadístico de orden):** `componente = ps1Opacidad(percentil P de la
  caja de escala S)`. Percentil por histograma deslizante de 256 niveles en
  magnitud sobre [umbral−8, umbral+4] (bin 0,047 mag; cuantización ±0,024 mag).
  NaN y negativos entran como «sin señal» (bin 0), igual que producción cuenta
  los ceros en la media.
- **E2 (propagación de opacidad):** `componente(x) = max_y op_rampa25(y)·k(d)`,
  con k = exp(−3d/L) o max(0, 1−d/L). Implementada con Dijkstra de cola de
  cubos sobre el grafo chamfer 5×5 con pesos óptimos de Borgefors (error
  métrico ≤ ~1,4 %; suelo de propagación 1e-3), **verificada por corrida**
  contra la definición euclídea directa en una ROI de 40×40 px con tolerancia
  0,02 de op. Los NaN no siembran ni reciben opacidad (la distancia es
  euclídea, sin noción de camino).

## Un comando por corrida (determinista)

```sh
# paridad (obligatoria primero por objeto; congela el baseline interno)
node scripts/harness_soporte_rampa.js --obj M51 --escala 25

# parrilla E1 (a priori): {p75, p90} × {50″, 100″}
node scripts/harness_soporte_rampa.js --obj M51 --variante E1 --percentil 90 --escala 100

# parrilla E2 (a priori): {exp, lin} × {50″, 100″, 150″}
node scripts/harness_soporte_rampa.js --obj M51 --variante E2 --decaimiento lin --alcance 150

# sensibilidad E1 a píxeles calientes (exploratoria, desactiva el assert SHA)
node scripts/harness_soporte_rampa.js --obj M51 --variante E1 --percentil 90 --escala 100 --calientes 8

# exploratorias fuera de parrilla (documentadas como tales)
node scripts/harness_soporte_rampa.js --obj M51 --variante E1 --percentil 95 --escala 150
node scripts/harness_soporte_rampa.js --obj M51 --variante E1 --percentil 99 --escala 150
```

Objetos: M51, M81, M104, M101, NGC205 (10 configs × 5 objetos = 50 corridas).
Configuración de referencia 457,2 mm · 190× · SQM 21,2 · δ = 2. ROIs:
`scripts/rois_M51.json` (las congeladas de la Fase 1 + la fuente RESID nueva) y
`scripts/rois_M101.json` (dos HII, nuevas), colocadas con una única iteración
documentada en el propio JSON.

## Salidas

Por corrida, en `.scratch/soporte/<obj>/` (aquí se copian JSON, tabla y PNGs
clave): `barrido_<obj>_<etiqueta>.json`, `render_E_<etiq>.png`,
`clases_<etiq>.png`, `diff_<etiq>.png` (rojo más brillante / azul más oscuro
que producción) y `comp_<etiq>.png` (la componente de la variante aislada).

Veredicto (ambas descartadas, con las cotas del suelo op=1): `informe_fase3.md`.
