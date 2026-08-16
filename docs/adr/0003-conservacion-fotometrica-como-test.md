# La conservación fotométrica es un test, no una imposición

El flujo total del cúmulo sale del modelo (Harris `V_t` + LF + `N_tot`), pero las estrellas
resueltas que se dibujan son **estrellas Gaia reales**, con sus flujos medidos, que no tienen por
qué sumar lo que el modelo predice para `m < m_res(r)`.

**Decidido:** el campo estadístico sale de `S1(m_lim(r))` puro, las estrellas Gaia se dibujan tal
cual, y `∫I dΩ == F(V_t)` es un **test que puede fallar**. Si falla, hay un bug en `f_compl` o en
la LF: se corrige la causa en el modelo. **Nunca se modifica el flujo del campo para forzar el
cierre.**

## Por qué no se ancla

La alternativa —`F_campo = F_total − Σ F_Gaia`— garantiza la conservación por construcción, pero
cuando la resta se pasa el halo se apaga. De ahí salió `restaMaxFrac`, y después
`remanenteMinFrac`: prótesis numéricas que este repo ya sufrió una vez. **`remanenteMinFrac` y
`restaMaxFrac` no vuelven, ni con otro nombre.** El descuento de la luz ya contada se hace por
construcción, con la misma `m_res(r)` para la clasificación de estrellas y para el corte del
campo; el test es el guardián, nunca un descuento manual paralelo.

## Tolerancia escalonada

| | Criterio |
|---|---|
| Fase 1 | ±10 % como puerta diagnóstica, **residuo registrado por cúmulo** en el informe del test |
| Fase 2 | ±1 % obligatorio, ya con `m_res(r)` real |
| Render | Nunca corrige el residuo |
| Percepción | Nunca participa en el test de conservación (se verifica ANTES de la Capa 4) |

El ±10 % existe porque `f_compl(m, r)` arranca como sigmoide de dos constantes sin calibración
fina (§1.5), y puede que no baste para el ±1 % desde el principio. Es una puerta diagnóstica con
fecha de caducidad, no un suelo que se pinta: el residuo es un número que se mira y se persigue.
La regla que impide que degenere: **un fallo de conservación nunca se corrige modificando el flujo
del campo; el residuo se conserva como evidencia diagnóstica y se corrige la causa del modelo.**
