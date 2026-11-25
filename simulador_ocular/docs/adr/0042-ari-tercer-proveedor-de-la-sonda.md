Fecha: 2026-11-25
Estado: aceptado
Enmienda a: 0014 (tras el 500 de plazo de GAVO, la sonda ya no se corta en seco)

# ARI, tercer proveedor de la sonda

Issue #629 (sale del spike #628). Hoy la sonda prueba GAVO y después CDS. Si GAVO da el 500 de su límite síncrono, se corta y se pasa a la segura y a la cadena (ADR 0014). CDS se cuelga de forma errática (#429), y el 2026-11-25 no respondió en ninguno de los 6 campos probados. El Gaia Archive de la ESA está fuera de servicio hasta DR4.

## Medida (2026-11-25)

Script: `scripts/sonda_respaldo_gaia_628.py`. La consulta es la de la sonda (TOP 200 000, sin `ORDER BY`), con 10 campos lanzados a GAVO y a ARI (`gaia.ari.uni-heidelberg.de`, `gaiadr3.gaia_source`) en la misma tirada:

| | GAVO | ARI |
|---|---|---|
| Dispersos (polo, Virgo, M13, Cas, Cygnus) | 5/5 · mediana 4,5 s · p90 12,8 s | 5/5 · mediana 3,9 s · p90 25,6 s |
| Densos (Carina, M11, M6, M7 a 0,36°, M7 a 0,89°) | 1/5 (3 dan 500 de plazo, 1 corta la conexión) | 3/5 · mediana 20,7 s · p90 32,6 s (M6 y M7 a 0,89° no terminan en 60 s) |

En polo, M13 y Cygnus, ARI devuelve las mismas estrellas que GAVO, con posición y G idénticas (diferencia 0).

## Decisión

1. **La sonda va GAVO → ARI → CDS.** GAVO sigue primero porque es más rápido en los dispersos (p90 de 12,8 s frente a 25,6 s). ARI va antes que CDS porque CDS no respondió en ningún campo.
2. **Tras el 500 de plazo de GAVO, solo se prueba ARI** (`gaia_tras_plazo`). CDS sigue sin probarse en ese caso, como hasta ahora (#505). ARI terminó 3 de los 4 densos en los que GAVO dio plazo o cortó.
3. **ARI tiene su propio plazo de 40 s** (`GAIA_ARI_TIMEOUT`). ARI no devuelve un 500 de plazo: se cuelga. El denso más lento que terminó tardó 32,6 s.
4. **Solo en la sonda.** La segura lleva `ORDER BY`, y eso no se ha medido en ARI. El fondo, el espacial y la cadena siguen en GAVO.
5. **ARI devuelve las filas como objetos**, y el proxy las convierte a posicionales antes de cachearlas (`gaia_filas_posicionales`). Una respuesta 200 que no es TAP cuenta como fallo.

## Consecuencias

- Un campo denso donde GAVO da plazo y ARI termina se sirve desde la sonda, sin pasar por la cadena asíncrona (Carina: 20,7 s + 9 s, en vez de 202 y minutos de cadena).
- Un campo donde nadie termina (M6, M7 a 0,89°) recibe el 202 hasta 40 s más tarde: ~20 s de sonda en GAVO, 40 s de ARI y ~20 s de segura, unos 80 s en lugar de ~41 s. La pista de densidad (#517, ADR 0033) manda los más densos directos a la cadena, así que este coste lo pagan solo los campos por debajo de su umbral.
- Si GAVO cae sin el 500 de plazo (conexión cortada o colgado), la sonda prueba ARI y después CDS: en el peor caso, 55 + 40 + 55 s antes de la segura. Antes eran 55 + 55 s.
- La traza del log anota `ari` como proveedor. Con dos semanas de log se puede revisar el plazo de 40 s y el orden GAVO/ARI.
- Una tirada, un día. Si el log muestra que ARI se cuelga más de lo medido, se baja el plazo o se quita, y basta con volver a subir el proxy anterior.
