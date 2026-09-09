# Texturas DSO — informe de generación

GENERADO por `node scripts/gen_dso_texturas.js --banco`, no editar a mano.
Sale de los sidecars y de los PNG escritos, así que una tirada a medias se
ve como lo que es. El banco lo fija el ADR 0024 y lo devuelve
`scripts/lib_banco_dso.js`.

## Cuenta por motivo

| modelo / motivo | objetos |
|---|---|
| ausencia-excesiva | 1 |
| imagen | 11 |
| no-cabe | 4 |
| sur | 1 |
| pendientes del banco | 57 |
| **banco (ADR 0024)** | **69 + 5 controles** |

## Volumen

| medida | valor |
|---|---|
| texturas escritas | 11 |
| total en disco | 17.5 MB |
| bytes/px (mediana) | 1.91 |

## Histograma de `escalaAs`

| ″/px | texturas |
|---|---|
| < 0,15 | 2 |
| 0,15 – 0,25 | 2 |
| 0,25 – 0,5 | 0 |
| ≥ 0,5 | 7 |

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

## Pendientes

Objetos del banco sin textura ni veredicto: caen al proxy mientras
`BitacoraPS1.cfg.proxyRespaldo` siga encendido (régimen mixto).

NGC 3310, NGC 404, NGC 3377, NGC 4125, NGC 7331, NGC 205, NGC 4486, NGC 1068, NGC 4826, NGC 4565, NGC 891, NGC 5195, NGC 4374, NGC 4406, NGC 3034, NGC 253, NGC7026, NGC7662, NGC6543, NGC3587, NGC1360, NGC6853, NGC7293, IC0063, IC0131, IC0143, NGC2282, IC0466, NGC6857, IC1470, IC0059, IC0359A, NGC1555, NGC1788, NGC1999, NGC1985, IC0431, IC0432, NGC2023, IC0435, NGC2064, NGC2067, NGC2149, NGC2170, NGC2163, NGC2182, IC0444, NGC2245, NGC2247, NGC2261, NGC2327, IC2177, IC4684, NGC6590, IC1287, NGC6914, IC5076.
