# El anclaje a catálogo se mide en la apertura del objeto, no en el parche

**Aceptado** el 2026-11-15, tras la republicación revertida de #320. Ticket: #560.
Medido sobre el banco entero (§«Lo medido»). Al aceptarlo, el criterio 2 de #560
se enmienda: la no regresión se mide **v2 → v3 con la ley nueva en los dos
lados**, no contra producción. Que los 9 que ya crecieron en v2 se iluminen
contra producción es esta misma ley arreglando una dilución ya publicada, no una
regresión.

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

## Lo medido (#560, 2026-11-15)

`node scripts/harness_nucleo_republicacion.js --antes <v2> --despues <v3>`, banco
entero en disco (66 texturas de imagen: 17 crecen, 49 no; el «51» del ticket
estaba mal contado). Núcleo = 30″ centrales tras `ps1AnclarACatalogo`.

| comparación | fuera de listón |
|---|---|
| v2 ley vieja → v3 ley vieja (lo que se publicó y se revirtió) | 14 de 17 que crecen, +0,50 a +3,30 |
| v2 ley nueva → v3 ley nueva | 2: NGC 1788 −0,33, NGC 6590 −0,07 |
| v2 ley vieja (producción hoy) → v3 ley nueva | 9 |

- **Los 17 que crecen** quedan a ≤0,17 de su v2, salvo NGC 1788 (−0,33, más
  brillante). Con el cielo del sidecar v2 puesto en el parche v3, NGC 1788 y
  NGC 6590 dan Δ = 0,00: los dos residuos son el cielo del ADR 0036, no el anclaje.
- **Las golden** (M51, M81, M101, M104): +0,00. Sin `marco`, sin apertura.
- **Los 9 que ya habían crecido en v2** (su sidecar v2 ya trae `marco` con lado
  de catálogo menor) **se iluminan contra producción**: NGC 2327 −2,86 (17,09′,
  apertura 1,50′), IC 0466 −1,85, NGC 2261 −1,20, NGC 2245 −0,79, NGC 1788 −0,57,
  NGC 2068 −0,33, NGC 2170 −0,29, NGC 6590 −0,18, NGC 2182 −0,09.
  Es el punto 1 aplicado a una dilución que ya estaba publicada: su lado de
  catálogo está en el `marco` desde v2. Choca con el criterio «los que no
  cambian de lado, ±0,05» de #560 si se lee contra producción; **lo decide el
  usuario al aceptar el ADR**.
- **NGC 6888** (control negativo, razón sin el anillo 0–0,5 r_e de
  `harness_suelo_cielo.js --opciones`): 2,10 en v2 y 2,36 en v3; las dos por
  encima del 1,80 publicado en #274. No depende de `k` (cuenta píxeles en σ):
  sale del lado y el cielo de la tirada, fuera del alcance de este ADR.

## Lo que cuesta

- Toca el runtime (`bitacora-ps1.js`): sube `?v` en las dos páginas.
- Se republica el banco una vez, junto con el ADR 0036, en una sola tirada.
