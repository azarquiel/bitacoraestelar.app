# Medida — el corte de fondo cero de Crumey en `magLimite` (#342)

Ejecución única del prerregistro `prerregistro_corte_crumey.md` (#341).

- Fecha: 2026-09-26 hora local. La cabecera del script imprime la fecha en
  UTC, que sale 2026-09-25.
- Commit medido: `ed19ff7` (variante con `FOT.SB_FONDO_NULO = 25.08` y
  `FOT.SB_SUELO_PINTADO = 25.08`).
- Comando: `node scripts/medida_corte_crumey.js`.
- Ejecuciones vacuas: ninguna. Es la primera ejecución y dio las cifras de
  los cinco listones.

## Listones

| listón | cifra | veredicto |
|---|---|---|
| L1 | d_plano = 1,4159 mm, d0 = 1,4190 mm (141×): \|d_plano − d0\| = 0,0031 mm (≤ 0,05) | PASA |
| L2 | variación de `magLimite` entre d0 y 0,2 mm: 0 mag en 87 puntos (≤ 0,01) | PASA |
| L3 | 3486 puntos, 1281 con d ≥ d0 y 2205 con d < d0; 0 puntos fuera; \|Δ\| máximo con d ≥ d0 = 0 | PASA |
| L4 | `tabla_corte_h2c.js --corte` reproduce los 12 márgenes a seis decimales | PASA |
| L5 | la guarda está a 0,0000 de 25,08; `FcieloPintado` cambia en las filas {3, 5, 6, 11, 12} y en ninguna otra | PASA |

**Veredicto: ADELANTE.**

Tramos de `magLimite` con la variante (200 mm, cielo 21,5, t 0,9, ojo 7 mm):

    pendiente 5      (medida 5.000)  d 20.0000 → 7.9621 mm  m 11.1973 → 13.1973
    pendiente otra   (medida 7.106)  d 7.9621 → 6.9347 mm  m 13.1973 → 13.6237
    pendiente 2,131  (medida 2.086)  d 6.9347 → 1.7023 mm  m 13.6237 → 14.8962
    pendiente otra   (medida 1.559)  d 1.7023 → 1.4159 mm  m 14.8962 → 15.0209
    pendiente 0      (medida 0.000)  d 1.4159 → 0.2000 mm  m 15.0209 → 15.0209

## Criterio 4 de #342: las 12 observaciones de H2c

`node scripts/campo_h2c.js` con la variante activa da 12 casos, 10 acordes y
2 en desacuerdo. Los desacuerdos son las filas 1 (M101, 450 mm) y 8 (M33,
300 mm), que son los mismos que antes del cambio. Ninguna fila cambia de
veredicto. L4 lo garantiza por construcción, porque los márgenes coinciden a
seis decimales.

## Censo de M13, estrella a estrella (informativo, criterio 6 de #342)

Condiciones: SQM 21, campo 28′, lienzo de 720 px, realización 0. Con cielo
21 y t 0,9, d0 vale 1,13 mm. «Ganadas» y «perdidas» comparan la lista de
estrellas dibujadas con la ley actual (techo 27) y con el corte, estrella a
estrella (ra, dec, m).

| equipo | d (mm) | mlim actual | mlim corte | dibujadas actual | corte | ganadas | perdidas |
|---|---:|---:|---:|---:|---:|---:|---:|
| 200 mm 250× | 0,80 | 15,23 | 15,02 | 548 | 523 | 0 | 25 |
| 200 mm 350× | 0,57 | 15,41 | 15,02 | 694 | 606 | 0 | 88 |
| 450 mm 250× | 1,80 | 16,44 | 16,44 | 1368 | 1368 | 0 | 0 |
| 450 mm 350× | 1,29 | 16,69 | 16,69 | 1690 | 1690 | 0 | 0 |

- El corte solo quita estrellas y no añade ninguna.
- Con 450 mm, a esos aumentos la pupila de salida sigue por encima de d0, así
  que la escena no cambia.
- Con 200 mm, 250× y 350× dan ahora el mismo límite, 15,02, que es el plano.
  Es lo que pedía #342: pasado d0, subir aumentos deja de prometer estrellas.

## Desviación de la variante prerregistrada

El prerregistro fija que «con `d < d0`, la curva vale lo que vale en `d0`».
La implementación congela solo el **fondo** (`SB0T`), no la apertura
efectiva de `magLimite`.

- Con `d0 < p`, que es todo el dominio de L1–L5 (sqm ≤ 22), la apertura
  efectiva es `D` a los dos lados de d0 y las dos formulaciones coinciden.
- Con `d0 > p` difieren. Eso pasa con cielos más oscuros que ~24,97 a t 0,9.
  Congelar también la apertura haría que un cielo más oscuro enseñase menos
  estrellas, y `test_corte_fondo_nulo.js` lo prohíbe.
- Consecuencia: el veredicto ADELANTE no cubre ese régimen. L1–L5 no lo miden.

## Batería antes y después

- **Línea base**, en `553f568` (main, antes del diff), 110 tests: 3 rojos.
  - `test_halo_v7_e5`: esperado, #294.
  - `test_consumidores_dso`: `spawn php ENOENT`, no hay php en la máquina.
  - `test_dso_texturas`.
- **Después**, en `ed19ff7`, 111 tests: los mismos 3, con secciones de fallo
  idénticas, más `test_halo_v7_e4` (E4.2 a 514× en los tres cúmulos).
- **Causa de E4.2.** En el plano del corte `magLimite` ya no depende del velo.
  Donde el cielo limita `m_res`, esta sale exactamente constante. El cociente
  q = salto/Δm_res dividía saltos de 1,1–1,5·10⁻³ mag de `S1campo` (la
  mezcla) por Δm_res = 0.
- **Arreglo, en `2abacba`.** E4.2 no juzga los nodos con Δm_res < 10⁻⁹, los
  cuenta y exige al menos un nodo juzgado. A 514× salta de 2 a 6 nodos de 501.
  El peor q queda entre 0,65 y 0,90, bajo el listón de 1,5.
