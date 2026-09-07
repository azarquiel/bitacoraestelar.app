# ADR 0025 · tinte de las planetarias — documentos de apoyo

Orden cronológico de ejecución:

1. `prerregistro.md` (2026-09-06) — anclas, formulación F1, vía de escape F2,
   listones numéricos y criterio de invisibilidad. Comprometido antes de
   escribir una línea de render.
2. (pendiente) `veredicto.md` — se escribe cuando el ticket de implementación
   ejecute los listones. Si no llega a abrirse, aquí se anota por qué.

Tabla de entradas reproducible: `scripts/entradas_tinte_np.py`.

## Hallazgo posterior (#220, 2026-09-07)

El prerregistro se deja intacto: esto se anota aquí, fuera de él, porque
enmendar las entradas después de ver una salida es lo que el propio documento
prohíbe.

Al publicar la fotometría de líneas en la fila de catálogo se descubrió que
V/84 marca con `n_I5007 = '*'` las observaciones en las que «the measurement
refers to 495.9nm because 500.7nm line is saturated». Cuatro de los ocho
objetos de la tabla §2 —**NGC 6826 (242), NGC 7662 (425), NGC 3242 (698) y
NGC 6572 (399)**— están marcados, y ninguno tiene otra observación con
`LineRef = b`: esos números son [O III] 4959, no 5007. La tabla los usa como
5007 y además deriva de ellos un 4959 = I5007/2,98, así que sus L_fot, sus
purezas y las predicciones §4 que dependen de ellos van sesgadas.

Ninguna de las **anclas** (§1) está afectada salvo NGC 6826, que es un ancla de
«gris»: el sesgo la hace más apagada de lo que es, o sea que corregirlo la
empuja hacia el lado donde la ley tendría que seguir diciendo gris. El ancla de
color, NGC 6905, no está marcada.

Qué hacer con ello —reconstruir el 5007 multiplicando por 2,98, o declarar esos
cuatro objetos fuera del alcance— se decide en #84 y se anota en el veredicto.
La marca por objeto ya viaja en la columna `i5007_es_4959` de
`mapa/datos/nebulosas.csv`.
