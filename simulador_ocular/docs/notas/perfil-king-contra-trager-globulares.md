# El perfil King 1962 de Harris contra Trager 1995 en los globulares del seed

Fecha: 2026-11-13. Spike #537. Estado: medida terminada, sin cambios en producción. La decisión propuesta está en el ADR 0035.

Nota de partida: `brillo-halo-globulares-justificacion.md` §3 (solo M13 y M15).

Arnés: `node scripts/spike_537_perfil_globulares.js`. Tarda unos 30 s y usa los mismos `require` que `scripts/matriz_m13.js`.

Datos:
- `simulador_ocular/docs/validacion/trager1995_seed.tsv`: perfiles de Trager, King & Djorgovski 1995 (VizieR J/AJ/109/218, espejo CfA, 2026-11-13). Las filas de M13 son idénticas a las de `trager1995.tsv`.
- `simulador_ocular/docs/validacion/mclaughlin2005_modelos_seed.tsv`: ajustes de McLaughlin & van der Marel 2005 (J/ApJS/161/304/models).

Globulares del seed (13): M2, M4, M5, M9, M10, M12, M13, M14, M15, M22, M30, M55 y M62. Son los que tienen ficha en `observaciones-seed.json`.

---

## 0. Respuestas

1. **¿Pasa en todos o solo en los concentrados?** Pasa en 7 de 13, y no depende de la concentración.
   - Hay exceso de forma (≤ −0,3 mag entre 2 y 8 r_h) en M55 (c = 0,93), M9 (1,25), M12 (1,34), M13 (1,53), M4 (1,65), M5 (1,73) y M15 (2,29).
   - No lo hay en M14 (0,99), M10 (1,38), M22 (1,38), M2 (1,59), M62 (1,71) ni M30 (2,50).
   - M13 es el caso extremo: −0,47 mag a 2–4 r_h y −0,97 a 4–8 r_h.
2. **¿Qué sustituto tiene respaldo?** Wilson con los ajustes de McLaughlin & van der Marel 2005.
   - Error de forma en el halo exterior (mediana entre 11 globulares de |modelo − Trager|): Wilson 0,11 / 0,12 mag a 2–4 / 4–8 r_h; King 1966 0,11 / 0,13; producción 0,16 / 0,31.
   - Más allá de 8 r_h, King 1966 se trunca antes de tiempo (+0,9 a +2,4 mag en M2, M5, M10 y M13). Wilson queda en ±0,22.
   - M15 y M30 no tienen ajuste en MvdM05 (núcleo colapsado). Para ellos solo queda la curva medida de Trager.
3. **¿Hace falta cambiar el perfil con el halo ya en lineal?** Sí, al menos para M13, M2 y M9.
   - Con el pipeline real (`pintarCumulo` tras #535), el exceso queda por encima del umbral y se pinta en M2, M9 y M13 en los cuatro equipos, y en M55 en dos de ellos.
   - En M13 el halo pintado (≥ 1 DN) llega 0,9–1,3′ más lejos que con el perfil de Trager: 6,24′ frente a 5,33′ con 200/100×, y 7,51′ frente a 6,24′ con 406/50×.
   - En los demás, el exceso cae fuera del radio pintado y no se ve.

---

## 1. Método

### 1.1 Candidatos

Todos se normalizan al mismo flujo total, V_t de Harris, igual que producción (`bitacora-cumulos.js:282-290`). Así las diferencias son solo de forma.

| clave | perfil | parámetros |
|---|---|---|
| K62 | King 1962 empírico, el de producción (`perfilKing`, `bitacora-gaia-render.js:2258`) | r_c y c de Harris 2010 |
| K66 | King 1966, modelo dinámico | W0 y r0 de MvdM05, fila `K` |
| Wil | Wilson 1975 | W0 y r0 de MvdM05, fila `W` |
| TrgN | curva suavizada `muVf` de Trager, interpolada en log r | — |

K66 y Wilson se integran en el arnés con la ecuación de Poisson adimensional, en RK4. Después se proyectan sobre el cielo.
- **Comprobación**: el integrador reproduce la columna `Conc` de MvdM05 con |Δc| ≤ 0,03 en las 22 filas K y W. El arnés aborta si no.
- Con W pequeño, la densidad se evalúa por serie, porque la resta cancela y el error de `erf` dominaría.

### 1.2 Residuos

- Puntos de Trager con peso > 0 y r < r_t de Harris. Se da la mediana de (modelo − Trager) por tramos de r/r_h: 0–1, 1–2, 2–4, 4–8 y > 8.
- El signo negativo indica que el modelo es más brillante que lo medido.
- **Solo forma**: modelo − TrgN, tramo a tramo. Los dos van normalizados a V_t, así que el punto cero se cancela.

### 1.3 Pipeline (P3)

- `pintarCumulo` dos veces por caso: una con producción y otra con la forma de Trager.
- La forma de Trager entra sustituyendo `R.perfilKing` y `R.areaKing` en memoria. Así la usan también el velo, el crowding y el punto fijo de m_res. Se restaura al acabar cada corrida.
- El nivel en pantalla sale con t = 1, que es el halo lineal de #535: `valorDeFlujo(realzarPerceptual(I·s_halo, …, 1))`.
- Equipos, con SQM 21,5: 200 mm a 100×, 406 mm a 50×, 457 mm a 70× y 457 mm a 154×. Los dos de 457 mm son el 18″ del seed.

**Criterio fijado en el arnés antes de la primera corrida.** El exceso «se ve» si el radio pintado de producción (≥ 1 DN) pasa de `r_exceso`. `r_exceso` es el primer radio ≥ 2 r_h donde K62 − TrgN < −0,3 mag.

**Corrección.** La primera versión buscaba `r_exceso` desde r_t hacia dentro y se paraba en el truncamiento del King (μ = ∞), así que daba «no hay» en todos. Se corrigió a la búsqueda desde 2 r_h hacia fuera, sin tocar el umbral de −0,3 mag.

---

## 2. P1 y P2: residuos por globular (MEDIDO)

### 2.1 Solo forma: modelo − TrgN (mag/arcsec²)

Tramos en r/r_h: 0–1 | 1–2 | 2–4 | 4–8 | > 8. Entre paréntesis, el número de puntos de Trager en los tramos 2–4 y 4–8. «—»: sin puntos.

| GC | c | K62 | K66 | Wil | n (2–4, 4–8) |
|---|---|---|---|---|---|
| M2 | 1,59 | 0,03 0,05 −0,15 −0,14 +1,31 | 0,04 0,02 −0,21 0,00 +2,41 | 0,01 0,08 0,04 −0,12 −0,09 | 30, 10 |
| M4 | 1,65 | −0,07 0,24 0,07 **−0,31** — | 0,00 0,21 −0,04 −0,37 — | 0,10 0,39 0,20 −0,38 — | 9, 3 |
| M5 | 1,73 | −0,08 0,18 0,02 **−0,39** 0,00 | −0,04 0,11 −0,11 −0,24 +1,05 | 0,01 0,09 0,22 0,06 −0,11 | 21, 36 |
| M9 | 1,25 | 0,08 −0,04 **−0,36** −0,20 — | 0,03 −0,08 −0,27 0,03 — | 0,04 −0,05 −0,17 −0,03 — | 11, 5 |
| M10 | 1,38 | 0,04 0,03 −0,20 −0,25 +1,69 | 0,02 0,00 −0,16 0,02 +2,16 | −0,01 0,03 0,04 −0,02 0,11 | 15, 14 |
| M12 | 1,34 | 0,07 0,14 −0,19 **−0,80** — | 0,00 0,09 −0,08 −0,09 — | 0,03 0,06 0,14 −0,06 — | 17, 13 |
| M13 | 1,53 | 0,06 0,19 **−0,47 −0,97** −0,56 | −0,10 0,18 −0,39 −0,48 +1,21 | −0,02 0,05 −0,04 −0,14 0,22 | 19, 35 |
| M14 | 0,99 | −0,01 −0,03 −0,16 (+0,68) — | 0,00 −0,05 −0,09 (+0,94) — | 0,01 −0,01 0,00 (0,20) — | 14, 1 |
| M15 | 2,29 | −0,09 0,30 0,18 **−0,33 −0,85** | sin ajuste | sin ajuste | 49, 31 |
| M22 | 1,38 | −0,02 0,00 −0,15 (−0,12) — | −0,02 −0,03 −0,09 (0,05) — | 0,02 0,09 −0,04 (−0,10) — | 6, 1 |
| M30 | 2,50 | −0,92 0,58 0,39 −0,11 −0,61 | sin ajuste | sin ajuste | 11, 4 |
| M55 | 0,93 | −0,07 0,04 **−0,35** (+0,59) — | 0,00 0,01 −0,23 (0,53) — | 0,03 −0,03 −0,11 (0,14) — | 24, 4 |
| M62 | 1,71 | −0,11 0,17 0,12 −0,07 — | −0,01 0,11 −0,05 −0,13 — | 0,07 0,30 0,19 −0,28 — | 20, 9 |

En negrita, los excesos de K62 ≤ −0,3 con al menos 3 puntos. Entre paréntesis, los tramos con 1 a 4 puntos, que no cuentan para el veredicto.

Lectura:
- **El exceso no sigue a c.** Aparece desde c = 0,93 (M55) hasta c = 2,29 (M15), y falta en c = 1,38 y 1,59.
- **Más allá de 8 r_h, K62 cambia de signo** en M2 y M10 (+1,3 y +1,7). Ahí el King de Harris se trunca en un r_t más corto que la luz que mide Trager.
- **M30 en el núcleo (−0,92)** es la cúspide de un núcleo colapsado. El c = 2,5 de Harris es un marcador de colapso, no un ajuste, así que este residuo no habla del halo.

### 2.2 Punto cero: V integrando `muVf` contra V_t de Harris

| GC | M2 | M4 | M5 | M9 | M10 | M12 | M13 | M14 | M15 | M22 | M30 | M55 | M62 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ΔV (Trager − Harris) | −0,05 | +0,16 | +0,21 | +0,07 | +0,04 | +0,47 | +0,09 | +0,16 | +0,21 | +0,13 | +0,42 | +0,49 | +0,09 |
| último punto de Trager (r_h) | 15,9 | 5,4 | 13,0 | 6,4 | 8,4 | 7,0 | 12,6 | 4,8 | 15,1 | 4,5 | 9,8 | 4,9 | 6,2 |

- La integral llega solo hasta el último punto de Trager. Un ΔV positivo puede ser luz exterior que Trager no cubre.
- En M12, M30 y M55 la diferencia ronda 0,4–0,5 mag. Producción, normalizada a V_t, sale ~0,45 mag más brillante que lo medido **en todos los radios**: la fila TrgN de esos globulares va a −0,4/−0,5 de núcleo a halo.
- Eso es normalización, no forma, y queda fuera de este spike. Con la cobertura de Trager no se puede decidir si sobra luz en V_t o falta en Trager.

### 2.3 Resumen de P2

Mediana entre los 11 globulares con ajuste de MvdM05 de |modelo − TrgN|:

| modelo | 2–4 r_h | 4–8 r_h |
|---|---|---|
| K62 (producción) | 0,16 | 0,31 |
| K66 (MvdM05) | 0,11 | 0,13 |
| Wilson (MvdM05) | 0,11 | 0,12 |

- **Falla la fórmula y también la familia.** Pasar de K62 a K66 con parámetros de ajuste dinámico ya reduce el error a la mitad. Pero en M13, K66 sigue en −0,39 / −0,48 y solo Wilson baja a −0,04 / −0,14.
- **Más allá de 8 r_h solo Wilson aguanta.** Ese tramo es el que decide en M13.
- **Entre 2 y 8 r_h, K66 y Wilson empatan.** Globular a globular el reparto es mixto: Wilson queda peor en M5 y M12 a 2–4 r_h (+0,22 y +0,14 frente a −0,11 y −0,08) y en M62 a 4–8 r_h (−0,28 frente a −0,13). Lo que los separa es el tramo > 8 r_h.
- El χ² global de MvdM05 también está repartido: Wilson gana en M2, M5, M9, M10, M13 y M55, y King 1966 en M4, M12, M14, M22 y M62. Ese χ² lo dominan los puntos del núcleo y no sirve para elegir el halo.
- Cobertura: Trager tiene 125 globulares; MvdM05 ajusta 85 de la Vía Láctea; el catálogo del repo tiene 143.

---

## 3. P3: el pipeline con el halo lineal (MEDIDO)

`r_1DN`: último radio con ≥ 1 DN, producción → Trager. `ΔDN ext`: mayor exceso de producción sobre Trager en r ≥ 2 r_h. `pinta`: r_1DN de producción > r_exceso.

| GC | r_exceso | 200/100× | 406/50× | 457/70× | 457/154× |
|---|---|---|---|---|---|
| M2 | 4,07′ | 4,13→3,77′, 2,6 DN, **sí** | 4,89→4,45′, 2,9, **sí** | 4,89→4,45′, 2,7, **sí** | 4,23→3,87′, 2,4, **sí** |
| M4 | 18,91′ | 7,39→8,20′, 0,0, no | 9,41→10,02′, 0,0, no | 9,11→9,82′, 0,0, no | 7,79→8,50′, 0,0, no |
| M5 | 8,59′ | 6,51→6,28′, 0,4, no | 7,85→7,34′, 0,7, no | 7,29→6,92′, 0,5, no | 6,46→6,28′, 0,3, no |
| M9 | 1,95′ | 2,72→2,42′, 4,2, **sí** | 3,22→2,89′, 4,7, **sí** | 3,24→2,91′, 4,3, **sí** | 2,83→2,52′, 4,3, **sí** |
| M10 | no hay | 4,73→4,51′, 0,6 | 5,84→5,48′, 0,9 | 5,52→5,19′, 0,7 | 4,87→4,65′, 0,5 |
| M12 | 5,72′ | 4,49→4,39′, 0,3, no | 5,54→5,16′, 0,7, no | 5,30→5,00′, 0,5, no | 4,69→4,52′, 0,3, no |
| M13 | 4,58′ | 6,24→5,33′, 3,3, **sí** | 7,51→6,24′, 4,0, **sí** | 6,98→5,87′, 3,0, **sí** | 6,28→5,38′, 2,5, **sí** |
| M14 | no hay | 3,44→3,27′, 1,6 | 3,95→3,78′, 1,7 | 3,97→3,80′, 1,7 | 3,65→3,47′, 1,5 |
| M15 | 5,67′ | 4,37→4,21′, 0,4, no | 5,44→5,01′, 0,8, no | 5,44→5,01′, 0,7, no | 4,37→4,27′, 0,3, no |
| M22 | no hay | 8,91→8,60′, 0,6 | 10,78→10,34′, 0,7 | 10,59→10,16′, 0,6 | 9,35→8,97′, 0,5 |
| M30 | 7,18′ | 2,56→3,04′, 0,0, no | 3,22→3,63′, 0,0, no | 2,93→3,37′, 0,0, no | 2,59→3,08′, 0,0, no |
| M55 | 6,76′ | 5,83→5,54′, 0,6, no | 6,91→6,40′, 1,1, **sí** | 6,79→6,31′, 0,9, **sí** | 6,07→5,75′, 0,6, no |
| M62 | no hay | 3,90→3,90′, 0,1 | 4,61→4,54′, 0,2 | 4,63→4,56′, 0,2 | 4,21→4,16′, 0,1 |

Lectura:
- **M13, M2 y M9**: el exceso se pinta con todos los equipos, con 2,4–4,7 DN de más en el halo exterior. M13 es el único donde el radio pintado se mueve más de 0,5′.
- **M55**: el exceso roza el radio pintado (6,91′ frente a 6,76′), con ~1 DN. Es marginal.
- **M4, M5, M12 y M15** tienen exceso de forma (§2.1), pero cae fuera de lo pintado: con el halo lineal ya no se ve.
- **M4 y M30** salen con el halo de Trager **más grande** que el de producción. En M4, Trager solo cubre 5,4 r_h de un r_t de 12 r_h, y la curva se extrapola (ver §4). En M30, el King con c = 2,5 concentra la luz en el núcleo.
- **Efecto dentro de 2 r_h**: cambiar de perfil mueve también el interior. Con Trager, M13 sale 6–9 DN más brillante a 1,3′ (0,8 r_h), donde K62 se queda por debajo de lo medido (+0,19 mag en el tramo 1–2 r_h). En M30, el centro baja 34 DN, por la cúspide.

---

## 4. Límites de esta medida

- Mide la capa difusa por la tabla radial de `pintarCumulo`. No incluye sprites de estrellas, `adaptacionLocal`, el canvas real ni el monitor.
- Más allá del último nodo de Trager, `muVf` se extrapola con la pendiente de los dos últimos nodos, hasta el r_t de Harris. Pesa en M4 (cubre 23,5′ de 51,8′), M22 (15,2′ de 31,9′) y M55 (14,0′ de 15,3′).
- El perfil TrgN se normaliza dentro del r_t de Harris, como producción. En M2, Trager mide luz hasta 16,8′ con un r_t de 12,4′, y esa luz no entra.
- El umbral de −0,3 mag de `r_exceso` es una elección del arnés, no sale de una fuente. Con −0,2 mag M10 también tendría exceso (−0,20 / −0,25).
- K66 y Wilson usan W0 y r0 de MvdM05, que ajustaron perfiles en V corregidos de extinción. Aquí solo se usa la forma, normalizada a V_t de Harris, así que la extinción no entra.
- Las tablas de la §2.1 y la §3 son la salida del arnés en `main` 001908b, copiada a mano.

---

## Fuentes

- Harris, W. E. (1996, rev. 2010). *AJ* 112, 1487. arXiv:1012.3224.
- King, I. (1962). *AJ* 67, 471.
- King, I. R. (1966). *AJ* 71, 64.
- McLaughlin, D. E., van der Marel, R. P. (2005). *ApJS* 161, 304. VizieR J/ApJS/161/304.
- Trager, S. C., King, I. R., Djorgovski, S. (1995). *AJ* 109, 218. VizieR J/AJ/109/218.
- Wilson, C. P. (1975). *AJ* 80, 175. **[referencia de memoria, sin verificar]**
- Las fórmulas de densidad de King 1966 y Wilson salen de Binney & Tremaine (2008), §4.3, y de MvdM05 §2. **[de memoria; el integrador se valida contra la columna `Conc` de MvdM05, no contra el texto]**
