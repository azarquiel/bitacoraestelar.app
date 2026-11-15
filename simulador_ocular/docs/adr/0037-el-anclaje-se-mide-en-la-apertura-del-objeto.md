# El anclaje a catálogo se mide en la apertura del objeto, no en el parche

**Propuesto** el 2026-11-15, tras la republicación revertida de #320. Ticket: #560.
Falta medirlo y que lo acepte el usuario.

## El problema, en una línea

`ps1AnclarACatalogo` reparte la luz del catálogo entre todo el parche, y desde
el ADR 0034 el parche de una difusa crece hasta que su marco llega al cielo:
cuanto más grande, más se diluye el núcleo. La tirada de `gen_dso_texturas 3`
apagó 13 de las 17 difusas que crecieron (+0,5 a +3,3 mag/″² en los 30″
centrales; NGC 1788 dejó de verse) y hubo que revertirla en producción.

## Lo que se midió (#320)

- Con la textura vieja de NGC 1788 (4,05′) y el cielo nuevo del ADR 0036, el
  núcleo apenas cambia: 22,66 → 22,51 mag/″². Con la nueva (20′): 23,97. **Lo
  que apaga es el área, no el cielo.**
- 15 de los 17 que crecieron nunca habían subido la escalera del ADR 0034: el
  efecto es de esa ley y llevaba latente desde que se aprobó.
- Tabla completa en #560.

## Decisión propuesta

1. **La constante de anclaje `k` se calcula dentro de la apertura del objeto:**
   la suma de `neto` solo sobre los píxeles a menos de `ladoCatalogo/2` del
   centro, y `frac` = `ps1FraccionLuz(n, (ladoCatalogo·60/2)/r_e)`. Esa `k` se
   aplica al parche entero.
2. El sidecar ya publica `marco.ladoCatalogo`; el runtime lo usa si existe, y
   si no (galaxias y compactas), la apertura es el propio parche: **ellas no
   cambian**.
3. El suelo sigue siendo el del campo vecino (ADR 0028 y 0036).
4. Antes de aceptarlo se mide con el banco de `gen_dso_texturas 3` (en disco,
   sin red) contra el v2: criterios en #560.

## Alternativas a medir

- **Apertura circular de radio `r_obj`** (la escena μ25) en vez del cuadrado
  del lado de catálogo: más física, pero depende de un radio que en las
  difusas sin borde es justo lo que no se conoce.
- **No reanclar por encima del lado de catálogo:** pintar con la `k` del
  peldaño 0. Equivalente si el suelo no cambia, pero exige bajar ese peldaño
  también en el runtime.

## Lo que cuesta

- Toca el runtime (`bitacora-ps1.js`): sube `?v` en las dos páginas.
- Se republica el banco una vez, junto con el ADR 0036, en una sola tirada.
