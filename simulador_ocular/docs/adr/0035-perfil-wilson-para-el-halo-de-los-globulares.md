# El halo de los globulares usa el perfil de Wilson de McLaughlin & van der Marel 2005

**Propuesto** el 2026-11-13 al cerrar el spike #537. Falta que el usuario lo acepte. Hasta entonces producción sigue con King 1962 y los parámetros de Harris.

Medidas: `simulador_ocular/docs/notas/perfil-king-contra-trager-globulares.md`. Arnés: `scripts/spike_537_perfil_globulares.js`.

## El problema, en una línea

La forma radial del cúmulo (`perfilKing`, `bitacora-gaia-render.js:2258`, con r_c y c de Harris 2010) pinta el halo exterior más brillante de lo que mide Trager 1995. Con el halo ya en lineal (#535), ese exceso todavía se ve en M13, M2 y M9.

## Lo que se midió

En los 13 globulares del seed, contra los perfiles de Trager 1995 y con todos los modelos normalizados a V_t:

- **El exceso no depende de la concentración.** King 1962 va ≤ −0,3 mag por encima de Trager entre 2 y 8 r_h en 7 de 13, desde c = 0,93 hasta c = 2,29. M13 llega a −0,97 mag a 4–8 r_h.
- **Se pinta en 3 de 13, y en un cuarto de forma marginal.** Con el pipeline real, el halo de M13 llega 0,9–1,3′ más lejos que con la forma de Trager. M2 y M9 llevan 2,4–4,7 DN de más en el halo exterior, y M55 ~1 DN en dos de los cuatro equipos.
- **Wilson es el que mejor sigue la forma.** Mediana de |modelo − Trager| a 2–4 / 4–8 r_h: Wilson 0,11 / 0,12 mag, King 1966 0,11 / 0,13 y King 1962 (producción) 0,16 / 0,31.
- **Más allá de 8 r_h, King 1966 se trunca antes de tiempo** (+0,9 a +2,4 mag en M2, M5, M10 y M13). Wilson se queda en ±0,22.

## Decisión propuesta

1. **La forma radial pasa a ser Wilson con W0 y r0 de MvdM05**, para los globulares que tienen ajuste en esa tabla (85 de la Vía Láctea).
2. **Los que no tienen ajuste se quedan con King 1962 de Harris.** Eso incluye M15 y M30, con núcleo colapsado.
   - Para esos dos, la curva medida de Trager (`muVf`) es la alternativa. Se decide aparte, porque cambia el núcleo (M30 baja 34 DN en el centro).
3. **La normalización no cambia.** El perfil sigue siendo una PDF radial normalizada a V_t de Harris. La conservación (velo + estrellas = F_tot) se mantiene.
4. **Se precalcula fuera del navegador.** `gen_globulares.py` integra Poisson y guarda una tabla de Σ(r)/Σ(0) en log r por globular. En el navegador solo se interpola. Así se evita un integrador de EDO en el bucle de pintado.

## Qué queda fuera

- **La diferencia de punto cero** entre V_t de Harris y la luz integrada de Trager (~0,45 mag en M12, M30 y M55). Es normalización, no forma, y con la cobertura de Trager no se puede decidir.
- **La gamma y la rampa del umbral** de la nota `brillo-halo-globulares-justificacion.md`. #535 ya resolvió la gamma para los cúmulos.

## Consecuencias

- **El test E3.2** (`scripts/test_halo_v7_e3.js`) valida hoy solo entre 0,5 y 3 r_c. Hay que ampliarlo al halo, de 2 r_h a r_t, con los 13 globulares del seed y el umbral de 0,3 mag.
- **El interior también se mueve.** Con la forma medida, M13 sale 6–9 DN más brillante a 1,3′. Hay que revisar los golden de cúmulos que dependan de la forma.
- **`globulares-datos.js` cambia de formato.** Gana W0 y r0 de MvdM05, o la tabla del perfil, y hay que regenerarlo con `python3 scripts/gen_globulares.py`.
- **M4 y M22 no quedan validados en el halo.** Trager no pasa de 5,4 y 4,5 r_h ahí, así que el cambio no se puede comprobar contra datos en esa zona.
