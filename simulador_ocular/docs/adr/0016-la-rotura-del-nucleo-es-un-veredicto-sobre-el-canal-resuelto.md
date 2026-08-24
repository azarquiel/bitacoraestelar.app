# La rotura del núcleo se mide con Φ sobre las estrellas dibujadas: métrica de veredicto sobre el canal existente, no un modelo nuevo

La transición nebuloso→moteado→resuelto del núcleo de los globulares no vive en
el canal de textura SBF: la ley de umbral de textura (ADR 0015) quedó falsada
con medida en #99 y el post-mortem
(`simulador_ocular/docs/adr/0015-textura/analisis_recuperable.md`) localizó la causa
raíz (d′ ∝ 1/M, cancelación algebraica) y señaló dónde vive de verdad el
fenómeno: en el canal de estrellas resueltas del ADR 0012. La evidencia ya
está medida en producción
(`simulador_ocular/docs/experimentos/tres_modelos_mres.md`): el núcleo de M13 con
200 mm pasa de 1 estrella dibujada a 61× a 36–38 a 250×, y del 0,7 % al 22,5 %
del flujo en puntos — la transición existe en el render; lo que falta es el
instrumento que la declare.

**Decidido:**

1. **La rotura del núcleo es un veredicto por anillo sobre el catálogo de
   estrellas dibujadas**, no una ley nueva de render:

   `Φ(r) = f_res(r) · N_res(r)^(1/4)`

   con el exponente 1/4 **fijo por literatura** (sumación de probabilidad
   espacial, Robson & Graham 1981 — la pieza que el post-mortem del 0015 dejó
   identificada como candidato con el factor que falta ya medido).

2. **Definiciones cerradas, sin parámetros nuevos.**
   - `N_res(r)`: número de estrellas del anillo con `m < m_res(r) + 0,75`
     (banda de transición incluida). El 0,75 es `dmagCrowd` (ADR 0012):
     **invariante del modelo, no parámetro de la métrica**.
   - `f_res(r)`: fracción del flujo total del anillo que va en esas mismas
     estrellas (F_dibujado/F_total).
   - Soporte: los anillos ya usados en el análisis radial del render
     (r/r_h 0,00–0,25 / 0,25–0,50 / 0,50–1,00 / 1,00–2,00), **congelados**.

3. **Un único parámetro libre: el umbral U, leído, no elegido.** U = Φ del
   anillo nuclear (r < 0,25 r_h) de M13, 200 mm, SQM 21, 120× — «primera
   rotura del núcleo», el mismo ancla del ADR 0015. `Φ ≥ U` = roto;
   `Φ < U` = nebuloso.

4. **El aumento entra exclusivamente por `m_lim,sky`**, que ya existe y ya
   depende de M (el punto fijo del velo). `m_crowd` sigue ciego al aumento:
   esta iteración no lo toca. Si la dependencia que `m_lim,sky` aporta no
   basta para pasar los listones, eso es un resultado, no algo que corregir
   aquí.

5. **Prohibido usar σ/RMS del campo SBF en la métrica.** La métrica solo mira
   el catálogo de estrellas dibujadas. Meter la fluctuación del campo sería
   volver por la puerta de atrás al canal que el 0015 falsó.

6. **No hay ley de textura en el render y el veredicto se emite sin tocar el
   render.** Esta iteración es un instrumento de diagnóstico: si los listones
   prerregistrados pasan, producción ya hace la transición y lo que faltaba
   era la métrica que lo demuestra. Si fallan, el informe señala el canal
   culpable y una iteración (b) se abre con su propio prerregistro — aquí no
   se parchea nada.

7. **Calibración prerregistrada** en
   `simulador_ocular/docs/adr/0016-rotura-nucleo/prerregistro.md`, con la misma
   disciplina que el del 0015 (#95): ningún listón se retoca tras ver la
   salida.

Lo que esto NO es: un modelo perceptual nuevo, una perilla de aspecto (ADR
0004), ni una resurrección de la textura. Es un instrumento de medida sobre lo
que el render ya dibuja.
