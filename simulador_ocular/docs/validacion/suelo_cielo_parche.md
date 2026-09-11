# ¿De dónde salen el cielo y la σ de un parche? (#274)

2026-09-12. Listones y patrón comprometidos antes de medir en el ADR 0027
(prerregistro), con su enmienda del mismo día. Reproducir con:

```
node scripts/harness_suelo_cielo.js --marco     # el marco del 6 % dentro del objeto
node scripts/harness_suelo_cielo.js --patron    # cielo lejano y campo vecino (red)
node scripts/harness_suelo_cielo.js --escala    # el confundido de escala
node scripts/harness_suelo_cielo.js --opciones  # E1-E4 contra el patrón
node scripts/harness_suelo_cielo.js --hash      # el coste contra version()
```

Los PNG del banco no entran en git: `--dir` apunta a la copia local de
`simulador_ocular/dso/`.

## 1. La medida que faltaba: a cuántos les pasa

`ps1Cielo` y `ps1SigmaCielo` leen el marco exterior del 6 % del parche. La
pregunta del ticket es qué fracción de ese marco cae dentro del objeto, y hay
que contestarla con DOS metros, porque dan números distintos y los dos importan:

- **escena** — lo que producción protege: borde real donde la clase lo tiene, y
  si no la isofota μ25 (`ps1EscenaEnParche`). En una galaxia ese radio *es* el
  semieje de catálogo, porque `gen_galaxias.py` resuelve `r_e` para que la
  isofota de 25 caiga en D25/2.
- **catálogo** — el tamaño que trae el catálogo. En las nebulosas es
  `r_e / 0,30` (`RE_SOBRE_SEMIEJE`), y de ahí sale que un parche de 6·`r_e` mida
  0,9 ejes mayores.

Con `r_e` a secas —la extensión que usa el veredicto de ausencia— el marco no
cae dentro de nadie: el parche llega a 3,00 `r_e` y el marco empieza en 2,64.
Por eso la contaminación no se ve mirando `r_e`, y es lo que hacía falta medir.

**Resultado sobre las 68 texturas de imagen del manifiesto:** 51 tienen el marco
contaminado en algo, y **43 pasan del 20 %** (la regla de afectado del
prerregistro): 25 RfN, 7 PN, 5 galaxias, 5 HII y 1 SNR. En casi todas las
nebulosas la cifra es la misma —62,6 %— porque la geometría es la misma:
lado = 6·`r_e` = 1,8·semieje para todas.

| objeto | clase | lado | escena″ | catálogo″ | marco en escena | marco en catálogo |
|---|---|---|---|---|---|---|
| NGC 7293 | PN | 20,0′ | 489,9 | 979,8 | 0,0 % | **100,0 %** |
| NGC 3310 | gal | 1,6′ | 67,7 | 67,7 | 85,5 % | 85,5 % |
| NGC 5457 | gal | 20,0′ | 719,9 | 719,9 | 71,3 % | 71,3 % |
| NGC 1788 | RfN | 1,8′ | 67,4 | 60,0 | 87,2 % | 62,7 % |
| NGC 6888 | HII | 12,7′ | 451,6 | 424,3 | 76,0 % | 62,6 % |
| NGC 5194 | gal | 18,0′ | 493,5 | 493,5 | 0,2 % | 0,2 % |
| NGC 4486 | gal | 10,6′ | 215,8 | 215,8 | 0,0 % | 0,0 % |

Las cinco galaxias afectadas (NGC 3310, NGC 5457, NGC 1068, NGC 3031, NGC 253)
lo están por el tope de 20′ o por un `r_e` grande, no por la ley de `r_e`.

## 2. El coste, comprobado contra el hash

Recalculando `version()` de `gen_dso_texturas.js` con los parámetros de cada
opción (ADR 0026), objeto a objeto, no por lectura del código:

| opción | ¿mueve el hash? | qué republica |
|---|---|---|
| **E1** agrandar el parche | **sí, en 48 de 68** | el banco entero: nombres nuevos y descarga nueva |
| E2 fuera de la escena | no | nada |
| E3 σ ciega a la estructura | no | nada |
| E4 cielo y σ al sidecar | no | el sidecar de cada objeto, bajo el MISMO nombre |

Y E1 tiene un techo propio que no se arregla pagando: para dejar el marco fuera
del objeto hace falta un lado de `2·r_obj/0,88`, y **5 de los 68 piden más de
`ladoMax` = 20′** (NGC 253 pide 41,4′, NGC 7293 37,1′, NGC 3031 32,6′,
IC 2177 25,5′ y NGC 5457 27,3′). A esos E1 no les arregla el marco ni
republicando el banco entero.

Lo de E4 no es gratis aunque el hash no se mueva: el sidecar lleva la versión en
el nombre y se sirve como inmutable, así que reescribirlo con cielo y σ nuevos
es contenido distinto bajo un nombre declarado inmutable, justo lo que el punto 3
del ADR 0026 no admite. Y exige una tirada del banco con red.

<!-- SECCIONES 3 A 6 PENDIENTES DE LAS MEDIDAS DEL PATRÓN -->
