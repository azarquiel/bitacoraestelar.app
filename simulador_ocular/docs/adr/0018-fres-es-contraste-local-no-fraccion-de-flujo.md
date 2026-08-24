# Φ″ juzga las estrellas dibujadas por contraste local, no por fracción de flujo: tercera métrica, mismo canal, render intacto

Los veredictos de los ADR 0016 y 0017 falsaron Φ y Φ′ en los mismos tres
puntos (P1 exterior, P3, M30 98×) y dejaron medido el residuo: no es el área
del anillo (la densidad del 0017 lo corrigió y no bastó), es **f_res**. Su
gradiente radial (0,0996 → 0,2743 en el ancla) mantiene el halo por encima
del núcleo, y su nivel absoluto hunde M30 (f_res = 0,0282 con censo correcto,
N_res = 4,0 = cita de la bitácora). El análisis aritmético posterior al 0017
descartó además un exponente f_res^γ: M30 exige γ ≈ 0 y M62 exige γ ≳ 0,38 —
contradicción, ningún γ único pasa el banco.

El diagnóstico común: «fracción del flujo total del anillo» no es la magnitud
que el ojo compara. Un núcleo se percibe moteado cuando sus estrellas
destacan **contra el fondo local** (velo del propio cúmulo + cielo), no
cuando se llevan una fracción dada del flujo. M30 tiene poca fracción de
flujo en puntos, pero su velo local es débil: el contraste puede ser alto.

**Decidido:**

1. **Tercera y última métrica antes de tocar el render:** f_res se redefine
   como contraste local **solo en el arnés**:

   `f_res_contraste(r) = F_dibujado(r) / (F_velo_local(r) + F_cielo)`

   con `F_velo_local` = flujo no resuelto del anillo (`S1campo`, la función
   de producción del ADR 0012 — el complemento exacto de `F_dibujado`) y
   `F_cielo` = fondo de cielo del render (`Fcielo`, el marco fotométrico en
   el que trabaja toda la cadena). Por anillo, con los tres términos
   integrados sobre la misma franja.

2. **El resto de Φ″ es el de Φ′, congelado:**
   `Φ″(r) = f_res_contraste(r) · (ρ(r) · A_ref)^(1/4)`, con
   ρ = N_res/área del anillo y A_ref = área del anillo del ancla (ADR 0017).
   Exponente 1/4 fijo, Δ = 0,75 intacto, N(≥ m+Δ) leído invirtiendo `aCrowd`
   (ADR 0008), franjas congeladas, M solo por `m_lim,sky`, σ/RMS del campo
   SBF prohibido.

3. **Mismo anclaje, mismos listones.** U″ se **lee** (no se elige) en M13,
   200 mm, SQM 21, 120×, anillo r/r_h [0, 0,25). Los listones son los del
   0017, idénticos, sin mover.

4. **Prohibido:** tocar Δ, la forma de a(m,r) o cualquier parámetro del
   render. Solo cambia la definición de f_res en el arnés, para esta prueba.

5. **Salidas.** Si Φ″ pasa: la métrica correcta es contraste local; candado
   que fija U″, la definición, Δ y la rejilla; el render no se toca. Si Φ″
   falsea: el problema está en la partición de la banda de transición (Δ) o
   en la forma de m_res, y SOLO entonces se abre la iteración (b) sobre el
   render (#113), con prerregistro de una sola variable.

Prerregistro y veredicto: `simulador_ocular/docs/adr/0018-rotura-nucleo-contraste/`.
