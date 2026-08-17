# El `(1−a)` de la banda de transición es campo

La banda `[m_res−δ, m_res+δ]` existe para que la frontera resuelta/no resuelta no dibuje un
anillo: sus estrellas se pintan con peso continuo `a(m)`, de 1 en el borde brillante a 0 en el
débil. Pero el campo estadístico se integraba con corte DURO en `m_res+δ`, así que la banda no
estaba en el velo y solo se dibujaba una fracción de ella. El `(1−a)` no estaba en ningún sitio.

Medido con `scripts/test_banda_conservacion.js` sobre 12 filas (3 cúmulos × 4 equipos): la fuga
iba del **6,6 % al 14,5 %** del flujo total del cúmulo. Invisible para
`test_cumulo_render.js`, que comparaba contra la partición ideal —campo con corte duro y banda
entera dibujada a flujo íntegro—, que cierra siempre por construcción.

**Decidido:** lo que de una estrella de la banda no llega a dibujarse es luz no resuelta y va al
velo. La Capa 1 expone los momentos del campo con la banda dentro, y son los que el render usa:

```
S1campo(m_res, δ) = S1(m_res+δ) + ∫banda (1−a(m))·dF
S2campo(m_res, δ) = S2(m_res+δ) + ∫banda (1−a(m))²·dF²
Fdibujado(m_res, δ) = Ftotal − S1campo        (complemento exacto)
```

El cuadrado lleva `(1−a)²` porque el resto sin resolver de una estrella de flujo `f` vale
`(1−a)f`, y el grano es la varianza de esos restos.

## Por qué esto no contradice ADR 0003

No se modifica el flujo del campo para forzar el cierre: no hay anclaje contra Gaia, ni resta, ni
constante libre. Es la MISMA `a(m)` que ya usaba el render la que decide el reparto, y el flujo
total del modelo no se toca. `S1`/`S2`/`Fresuelto` con corte duro siguen existiendo como la
partición ideal, y los tests que la miden siguen midiéndola.

## Consecuencias medidas

- El velo engorda ≥ 11 % en M13, y `m_lim,sky` baja lo justo para que el conteo de estrellas
  dibujadas pase de 1590 a 1575 de 1798. Esas 15 estrellas no desaparecen: están en el fondo que
  antes faltaba.
- Las alas a r > 4·r_h dejan de pintar cero exacto: con su flujo completo entran en el hombro de
  la sigmoide de `visibilidadDifusa`, que no tiene corte duro. Lo que dejan son 2,96e-4 del
  cielo, por debajo de un nivel de 8 bits. `test_halo_v7_e3` pasa a medir eso y el 99,84 % que
  el tap se come, en vez de exigir un cero que era casualidad de estar más abajo.
- `m_res = ∞` (halo exterior, nada aglomera) no tiene banda: sin ese corte, `(m_res+δ−m)/2δ` da
  ∞−∞ y el velo entero sale NaN.
