# Φ′ normaliza N_res por el área del anillo: segunda métrica de veredicto, mismo canal, mismo candado de disciplina

El veredicto del ADR 0016 (`simulador_ocular/docs/adr/0016-rotura-nucleo/veredicto.md`)
falsó la métrica Φ y **exoneró al render**: P2 salió creciente estricto (la
respuesta al aumento vía `m_lim,sky` es correcta), los ordinales pasaron y el
censo coincide con la bitácora (N_res = 4,0 en el núcleo de M30 = «se
resuelven varias estrellas»). El mecanismo dominante de la falsación fue
mecánico: N_res es un conteo absoluto y arrastra el área del anillo
(11 → 27 → 74 → 198 en el ancla), así que Φ crecía monótonamente con el radio
en todas las configuraciones y ningún U único podía sostener P1/P3.

**Decidido:**

1. **Antes de tocar el render, se agota la métrica.** El fallo medido es de
   métrica, no de física: se prueba una segunda métrica sobre el MISMO canal,
   con el MISMO prerregistro de listones, sin cambiar ni un bit de producción.
   Solo si Φ′ también falsea se abre la iteración sobre el render (#113), con
   prerregistro propio que especifique qué variable se toca y por qué.

2. **Forma de Φ′: la de Φ con N_res convertido en densidad superficial:**

   `Φ′(r) = f_res(r) · (N_res(r) / A(r) · A_ref)^(1/4)`

   con `A(r)` = área del anillo en radio propio, `π·(r1² − r0²)` en arcsec², y
   `A_ref` una constante de referencia que se absorbe en U′: se fija
   `A_ref` = área del anillo del ancla (M13, r/r_h [0, 0,25)), de modo que
   Φ′ = Φ en el ancla por construcción. La elección de `A_ref` es inerte para
   todos los listones (multiplica igual a ambos lados de cada comparación);
   solo fija la escala en la que se lee U′. La métrica queda invariante al
   tamaño del anillo.

3. **Todo lo demás queda congelado como en el ADR 0016:** exponente 1/4 fijo
   (Robson & Graham 1981), Δ = 0,75 = `dmagCrowd` invariante, f_res =
   F_dibujado/F_total de producción, N(≥ m+Δ) leído invirtiendo `aCrowd`
   (ADR 0008), las cuatro franjas de r/r_h congeladas, M solo por `m_lim,sky`,
   σ/RMS del campo SBF prohibido, un único parámetro U′ **leído** en el mismo
   ancla (M13, 200 mm, SQM 21, 120×, primer anillo), y la misma precondición
   de validez contra `tres_modelos_mres.md`.

4. **No se mezclan los ADR.** 0016 queda como «la métrica original no
   funcionó», con su candado intacto (`scripts/test_veredicto_rotura_nucleo.js`
   sigue fijando aquel veredicto). 0017 es el siguiente intento, con su propio
   prerregistro, su propio arnés (`scripts/veredicto_rotura_nucleo_densidad.js`)
   y su propio candado.

5. **Salidas.** Si Φ′ pasa: la métrica definitiva queda fijada con candado y el
   ciclo #94→#99 se cierra sin tocar producción. Si Φ′ falsea: el problema está
   en el render (partición de la banda de transición, forma de m_res o
   definición de f_res) y la iteración (b) (#113) se abre con prerregistro
   específico de UNA variable. No se salta (a).

Prerregistro y veredicto: `simulador_ocular/docs/adr/0017-rotura-nucleo-densidad/`.
