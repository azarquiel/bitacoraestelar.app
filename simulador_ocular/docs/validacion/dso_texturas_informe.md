# Texturas DSO — informe de generación

GENERADO por `node scripts/gen_dso_texturas.js --banco`, no editar a mano.
Sale de los sidecars y de los PNG escritos, así que una tirada a medias se
ve como lo que es. El banco lo fija el ADR 0024 y lo devuelve
`scripts/lib_banco_dso.js`.

## Cuenta por motivo

| modelo / motivo | objetos |
|---|---|
| ausencia-excesiva | 1 |
| imagen | 68 |
| no-cabe | 4 |
| sur | 1 |
| pendientes del banco | 0 |
| **banco (ADR 0024)** | **69 + 5 controles** |

## Volumen

| medida | valor |
|---|---|
| texturas escritas | 68 |
| total de los PNG | 92.0 MB |
| bytes/px (mediana) | 1.90 |

## Histograma de `escalaAs`

| ″/px | texturas |
|---|---|
| < 0,15 | 24 |
| 0,15 – 0,25 | 7 |
| 0,25 – 0,5 | 13 |
| ≥ 0,5 | 24 |

## Lista de revisión

Objetos con `fracAusenciaEscena` > 20 %: la ausencia cae dentro de la escena y hay que mirarlos a ojo antes
de darlos por buenos (objetivo §5, fase 0). Lo que ya tiene veredicto
—`ausencia-excesiva`— no se lista aquí: está en la cuenta por motivo.

Ninguno.

## Bloques de ausencia

Texturas cuya mayor componente conexa de ausencia pasa de 3 % del parche
llenando más del 35 % de su caja envolvente: la firma de una skycell que no llegó
(#259). No es un veredicto —una estrella muy brillante deja una máscara que también
la dispara—, es la lista de lo que hay que mirar. Las texturas anteriores a #259
no traen la medida en su sidecar y no salen aquí: para esas está
`node scripts/harness_bloques_ausencia.js`, que la mide del PNG.

Ninguna.
