# La rotura del núcleo se mide con Φ sobre las estrellas dibujadas: métrica de veredicto, no modelo nuevo

La transición nebuloso→moteado→resuelto del núcleo de los globulares no vive en
el canal de textura SBF: la ley de umbral del ADR 0015 quedó falsada con medida
(`simulador_ocular/docs/adr/0015-textura/veredicto.md`) y el análisis post-mortem
(`0015-textura/analisis_recuperable.md`) señaló la vía con respaldo de datos: el
canal de estrellas resueltas, que ya existe en producción (ADR 0012 + punto fijo
del velo). La evidencia de partida es `simulador_ocular/docs/experimentos/tres_modelos_mres.md`:
en el núcleo de M13 con 200 mm, la producción pasa de 1 estrella dibujada a 61×
a 36–38 a 250×, y de 0,7 % a 22,5 % del flujo en puntos. La transición ya está
en el render; lo que falta es la métrica que la lea y la contraste con las
observaciones.

**Decidido:**

1. **La rotura del núcleo se mide con Φ sobre las estrellas dibujadas.** Esto es
   una **métrica de veredicto sobre el canal existente, no un modelo nuevo**: el
   render no cambia ni un bit, y no hay ley de textura en el render.

2. **Forma cerrada, sin grados de libertad de forma:**
   `Φ(r) = f_res(r) · N_res(r)^(1/4)`, con el exponente 1/4 **fijo** por
   literatura (Robson & Graham 1981, sumación espacial de probabilidad).
   `N_res(r)` es el número de estrellas del anillo con `m < m_res(r) + 0,75`
   (banda de transición incluida; Δ = 0,75 es `dmagCrowd`, ADR 0012:
   **invariante, no parámetro**). `f_res(r)` es la fracción del flujo total del
   anillo en esas mismas estrellas (`F_dibujado/F_total`, funciones de
   producción, ADR 0008).

3. **Un único parámetro libre, U, leído — no elegido — en el ancla:** Φ del
   anillo nuclear (r < 0,25 r_h, primer anillo de la tabla) de M13, 200 mm,
   SQM 21, 120× («primera rotura del núcleo», el mismo ancla del ADR 0015).

4. **El aumento entra exclusivamente por `m_lim,sky`** (ya existente; `m_crowd`
   sigue ciego a M). El soporte radial de N_res son los anillos del render
   (#98), congelados.

5. **Prohibido usar σ/RMS del campo SBF en la métrica.** La métrica solo mira el
   catálogo de estrellas dibujadas. Meter el grano por la puerta de atrás sería
   resucitar sin prerregistro lo que el ADR 0015 falsó.

6. **El veredicto se emite sin tocar el render.** Si Φ pasa los listones
   prerregistrados (`0016-rotura-nucleo/prerregistro.md`), producción ya hace la
   transición y lo que faltaba era la métrica: se cierra el ciclo #94→#99. Si
   falla, el informe señala el canal culpable y una iteración (b) se abre con su
   propio prerregistro. No se salta (a).

Prerregistro y veredicto: `simulador_ocular/docs/adr/0016-rotura-nucleo/`.
