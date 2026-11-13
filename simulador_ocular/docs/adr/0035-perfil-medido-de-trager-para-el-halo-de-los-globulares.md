# La forma radial de los globulares sale del perfil medido de Trager 1995

**Aceptado** el 2026-11-13 por el usuario, al cerrar el spike #537 (PR #554). Propuesto ese mismo día. Producción sigue con King 1962 hasta que se implemente.

Medidas: `simulador_ocular/docs/notas/perfil-king-contra-trager-globulares.md`. Arnés: `scripts/spike_537_perfil_globulares.js`.

## El problema, en una línea

La forma radial del cúmulo (`perfilKing`, `bitacora-gaia-render.js:2258`, con r_c y c de Harris 2010) pinta el halo exterior más brillante de lo que mide Trager 1995. Con el halo ya en lineal (#535), ese exceso todavía se ve en M13 y M9.

## Lo que se midió

En los 13 globulares del seed, contra los perfiles de Trager 1995 y con todos los modelos normalizados a V_t:

- **El exceso no depende de la concentración.** King 1962 va ≤ −0,3 mag por encima de Trager más allá de 2 r_h en 8 de 13, desde c = 0,93 hasta c = 2,29. M13 llega a −1,03 mag a 4–8 r_h.
- **Se pinta en 2 de 13, y en otros 2 de forma marginal.** Con el pipeline real, M13 y M9 pintan 2,5–4,4 DN de más desde el radio del exceso, y el halo de M13 llega 0,9–1,3′ más lejos. M2 y M55 se quedan en 0,6–1,8 DN.
- **Ningún modelo analítico mejora a producción en todos.** En el pipeline, Wilson (MvdM05) acerca la imagen a Trager en 6 de 11, pero la aleja en M5 (13,1 DN frente a 3,9), M12 y M4. King 1966 gana en los otros 5.
- **Elegir por el χ² de MvdM05 acierta en 9 de 11**, pero en M5 elige el peor de los tres.

## Decisión propuesta

1. **La forma radial pasa a ser la curva `muVf` de Trager** (VizieR J/AJ/109/218) para los globulares que la tienen: 125, entre ellos los 13 del seed.
   - Más allá del último radio medido, la curva se empalma con la caída del King 1962 de Harris, hasta su r_t. No se extrapola una pendiente propia.
2. **Los demás globulares se quedan con King 1962 de Harris.** Son los del catálogo (143) que Trager no cubre.
3. **M15 y M30 entran como los demás**, pero hay que comprobar su núcleo antes de publicar el cambio. Con la curva medida, M30 baja 34–36 DN en el centro, porque el c = 2,5 de Harris es un marcador de colapso y no un ajuste.
4. **La normalización no cambia.** El perfil sigue siendo una PDF radial normalizada a V_t de Harris. La conservación (velo + estrellas = F_tot) se mantiene.
5. **Se precalcula fuera del navegador.** `gen_globulares.py` guarda la tabla de `muVf` en log r por globular. En el navegador solo se interpola, como hace el arnés.

## Alternativas descartadas, con medida

- **Wilson para todos los que tienen ajuste en MvdM05.** Era la primera propuesta de este ADR. Es el mejor en los residuos de P2, pero en el pipeline empeora M5 ×3,4, M12 y M4.
- **K66 o Wilson según el χ² de MvdM05.** Falla en M5.
- **King 1966 para todos.** Se trunca antes de tiempo más allá de 8 r_h (+0,90 a +2,41 mag en M2, M5 y M13), y en M13 es peor que producción en el pipeline (10,2 frente a 8,9 DN).

## Qué queda fuera

- **La diferencia de punto cero** entre V_t de Harris y la luz integrada de Trager (~0,45 mag en M12, M30 y M55). Es normalización, no forma, y con la cobertura de Trager no se puede decidir.
- **La gamma y la rampa del umbral** de la nota `brillo-halo-globulares-justificacion.md`. #535 ya resolvió la gamma para los cúmulos.

## Consecuencias

- **El test E3.2** (`scripts/test_halo_v7_e3.js`) valida hoy solo entre 0,5 y 3 r_c. Hay que ampliarlo al halo, de 2 r_h a r_t, con los 13 globulares del seed y el umbral de 0,3 mag.
- **El interior también se mueve.** Con la forma medida, M13 sale 6–9 DN más brillante a 1,3′. Hay que revisar los golden de cúmulos que dependan de la forma.
- **`globulares-datos.js` cambia de formato.** Gana la tabla del perfil de Trager, y hay que regenerarlo con `python3 scripts/gen_globulares.py`.
- **Las zonas sin datos de Trager siguen siendo King 1962.** En M4, M10, M12, M15, M22, M30 y M55 la curva acaba antes del r_t de Harris. En los cuatro equipos medidos, el radio pintado queda dentro de lo medido, pero un equipo con más alcance pintaría el empalme.
