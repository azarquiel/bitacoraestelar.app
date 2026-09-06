# Texturas DSO — informe de generación

GENERADO por `node scripts/gen_dso_texturas.js --banco`, no editar a mano.
Sale de los sidecars y de los PNG escritos, así que una tirada a medias se
ve como lo que es. El banco lo fija el ADR 0024 y lo devuelve
`scripts/lib_banco_dso.js`.

## Cuenta por motivo

| modelo / motivo | objetos |
|---|---|
| imagen | 1 |
| no-cabe | 4 |
| sur | 1 |
| pendientes del banco | 68 |
| **banco (ADR 0024)** | **69 + 5 controles** |

## Volumen

| medida | valor |
|---|---|
| texturas escritas | 1 |
| total en disco | 1.9 MB |
| bytes/px (mediana) | 1.92 |

## Histograma de `escalaAs`

| ″/px | texturas |
|---|---|
| < 0,15 | 0 |
| 0,15 – 0,25 | 0 |
| 0,25 – 0,5 | 0 |
| ≥ 0,5 | 1 |

## Lista de revisión

Objetos con `fracAusenciaEscena` > 20 %: la ausencia cae dentro de la escena y hay que mirarlos a ojo antes
de darlos por buenos (objetivo §5, fase 0).

Ninguno.

## Pendientes

Objetos del banco sin textura ni veredicto: caen al proxy mientras
`BitacoraPS1.cfg.proxyRespaldo` siga encendido (régimen mixto).

NGC 3310, NGC 404, NGC 3377, NGC 4125, NGC 7331, NGC 205, NGC 5457, NGC 4594, NGC 3031, NGC 4486, NGC 1068, NGC 4826, NGC 4565, NGC 891, NGC 5195, NGC 4374, NGC 4406, NGC 3034, NGC 253, NGC6720, NGC7008, Abell 12, NGC7026, NGC7662, NGC6543, NGC3587, NGC1360, NGC6853, NGC7293, IC0063, IC0131, IC0143, NGC1982, NGC2282, IC0466, NGC6857, NGC6888, IC1470, NGC7635, IC0059, IC0359A, NGC1555, NGC1788, NGC1999, NGC1985, IC0431, IC0432, NGC2023, IC0435, NGC2064, NGC2067, NGC2068, NGC2149, NGC2170, NGC2163, NGC2182, IC0444, NGC2245, NGC2247, NGC2261, NGC2327, IC2177, IC4684, NGC6590, IC1287, NGC6914, IC5076, NGC1952.
