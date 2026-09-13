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

## Coste de la tirada

Cada objeto cuesta **2 parches**: el suyo y su campo vecino, que es de
donde salen el cielo y la σ (ADR 0028). La caché del proxy sirve los dos igual,
así que un objeto ya bajado no vuelve a la red.

| medida | valor |
|---|---|
| parches por objeto | 2 |
| objetos pendientes | 0 |
| parches que costaría acabar | 0 |

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

| objeto | mayor bloque | relleno de su caja | componentes |
|---|---|---|---|
| Abell 12 | 3.58 % | 60 % | 6 |

## Texturas sin cielo medido

Texturas buenas cuyo campo vecino no valió como cielo: se pintan con la ley
del marco —lo único que queda— y el runtime las marca (#287, ADR 0028). Los
motivos: `sin-cobertura` (PS1 no llega ahí fuera), `vecina-dentro` (otra difusa
catalogada cae en el campo), `otra-escala` (su ″/px no es el del parche, así que
su σ no es comparable) y `descarga-fallida` o `celda-perdida`, que se reintentan
solos en la corrida siguiente. `sin-medir` es el comodín de un sidecar que trae
`vecino` sin motivo y sin los dos números: no debería salir nunca, y si sale es
que el generador escribió medio par.

| objeto | motivo | dirección | difusa más cercana |
|---|---|---|---|
| NGC 205 | `vecina-dentro` | O | NGC 224 (dentro) |
| IC0131 | `vecina-dentro` | O | NGC 598 (dentro) |
| IC0143 | `vecina-dentro` | N | NGC 598 (dentro) |
| NGC2023 | `vecina-dentro` | N | IC0434 (dentro) |
