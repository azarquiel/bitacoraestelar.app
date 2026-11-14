# El campo vecino de una difusa de lado medido se aleja según ese lado

**Propuesto** el 2026-11-14 al cerrar la medida de #320. Falta que lo acepte el
usuario. La implementación y la republicación van en un ticket aparte.

Medidas: `simulador_ocular/docs/validacion/campo_vecino_320.md`. Arnés:
`node scripts/harness_suelo_cielo.js --vecino`.

## El problema, en una línea

El ADR 0034 hizo crecer el lado de 12 difusas, pero dejó su campo vecino
colocado con el lado de catálogo (`max(1,5·lado, 2·r_obj)`). En 10 de ellas el
vecino cae dentro de la extensión que el propio generador midió, y en NGC 1788
lleva un pedestal de 4,3–4,8σ.

## Lo que se midió

- **10 de 66 vecinos caen dentro de la extensión real del objeto,** y los 10
  son de lado medido. Ninguno con lado de catálogo.
- **Solo NGC 1788 lleva pedestal por encima del listón** (0,5σ, ADR 0027):
  - con su vecino de hoy, 4,31σ contra el patrón de cielo lejano;
  - con el vecino alejado según el lado medido, −0,496σ: pasa el listón,
    pero justo;
  - con factor 3 para todos, −0,332σ.
- **Preferir la dirección limpia no arregla nada:** en los 4 `vecina-dentro`
  del banco, la intrusa pisa las cuatro direcciones.
- **NGC 7293 no era un problema de la ley.** El arnés leía un sidecar viejo; con
  el sidecar del manifiesto, σ publicada = σ patrón (log₂ 0,00).

## Decisión propuesta

1. **`ps1CampoVecino` recibe el lado PUBLICADO** de la textura, no el de
   catálogo. El de catálogo es el primer peldaño: en una difusa sin escalera,
   el lado publicado es ese mismo, y el vecino no se mueve.
   - Solo se mueven las 12 de lado medido.
   - Los otros 54 objetos quedan con el mismo par (cielo, σ), bit a bit.
2. **El recorte sigue siendo del lado de catálogo y a la escala del parche**
   (ADR 0028 y ADR 0034, punto 2). Lo que cambia es dónde se coloca, no qué se
   baja.
3. **La escalera del ADR 0034 se vuelve a juzgar con el cielo nuevo,** hasta
   punto fijo. Si el lado crece, el vecino se vuelve a alejar. Como solo se
   aleja, converge. Con las medidas de hoy, crecen NGC 1788 y NGC 2247.
4. **Se sube `GENERADOR`** y se republica el banco (ADR 0026, como #288).

## Descartadas

- **Factor 3 para todos (V2).** También arregla NGC 1788, y con más margen
  contra el patrón (−0,33σ frente a −0,50σ), pero
  mueve el vecino de los 66, NGC 6888 incluido, y cambia 4 escaleras en vez de
  2. Paga control de regresión por objetos que no lo necesitaban. Si al
  implementar V1 NGC 1788 se pasa del listón, V2 restringido a las de lado
  medido es el siguiente candidato.
- **Preferir la dirección limpia.** No arregla ni uno de los 4 en que aplicaría.

## Lo que cuesta

- **Una tirada del banco con red** y el renombrado de todas las texturas por
  `GENERADOR`, aunque 54 no cambien de píxeles.
- **NGC 1788 y NGC 2247 crecerán de lado:** texturas más pesadas, y posibles
  cubiertas nuevas (ADR 0034, punto 4).
