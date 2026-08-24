# Qué produce cada ley de m_res: m_crowd, P_solo y m_lim,sky

**Pregunta.** Si `m_res` estuviera limitada exclusivamente por `magLimite`, ¿cuántas
estrellas daría el núcleo? ¿Y si lo estuviera solo por `m_crowd`? ¿Y cuántas da la
ley que hay en producción? La tabla no sirve para elegir una: sirve para ver cuál
de los dos filtros manda.

**Cómo se mide.** `node scripts/harness_tres_modelos_mres.js`. Misma escena de M13
(D = 200 mm, SQM 21, seeing por defecto, realización 0, fixture
`simulador_ocular/docs/validacion/m13_gaia_dr3.csv` más las sintéticas), y lo único que cambia entre
filas es la regla de `m_res`. Ninguna ley se reimplementa (ADR 0008): `mCrowd`,
`aCrowd`, `S1`, `Fresuelto` y `Fdibujado` salen de `pob`, y `magLimite` del render.

Cada modelo lleva **su** velo, porque el velo es el complemento exacto de lo que
dibuja: por eso el flujo total sale idéntico en todas las filas y hace de control.

- «estrellas núcleo» = las de la lista que el modelo dibuja con r < r_c (37,2″).
- «flujo núcleo en puntos» = fracción del flujo del cúmulo dentro de r_c que va en
  estrellas dibujadas, pesada por Σ(r)·r. Es la media del modelo, no un recuento.

## 200 mm, SQM 21, 61×

| modelo | m_res(0) | estrellas núcleo | estrellas total | μ_velo(0) | flujo núcleo en puntos | flujo cúmulo en puntos | flujo total |
|---|---:|---:|---:|---:|---:|---:|---:|
| m_crowd | 13,58 | 43 | 4116 | 16,74 | 24,7 % | 52,9 % | fijo |
| **P_solo** | 11,56 | 1 | 137 | 16,49 | 0,7 % | 15,1 % | fijo |
| m_lim,sky | 11,56 | 1 | 137 | 16,49 | 0,7 % | 15,1 % | fijo |
| *min(ambos)* | *11,73* | *2* | *162* | *16,49* | *2,1 %* | *17,1 %* | *fijo* |

## 200 mm, SQM 21, 250×

| modelo | m_res(0) | estrellas núcleo | estrellas total | μ_velo(0) | flujo núcleo en puntos | flujo cúmulo en puntos | flujo total |
|---|---:|---:|---:|---:|---:|---:|---:|
| m_crowd | 13,58 | 43 | 4116 | 16,74 | 24,7 % | 52,9 % | fijo |
| **P_solo** | 13,57 | 36 | 548 | 16,73 | 22,5 % | 36,0 % | fijo |
| m_lim,sky | 13,58 | 38 | 554 | 16,74 | 23,2 % | 36,3 % | fijo |
| *min(ambos)* | *13,58* | *38* | *578* | *16,74* | *23,3 %* | *37,3 %* | *fijo* |

Control: flujo total del cúmulo 4,875285e−3 en las ocho filas, hasta el último
dígito impreso. Nadie crea ni pierde luz; solo la reparte entre puntos y velo.

`min(ambos)` es lo que había en producción antes del ADR 0012 (cota de crowding y
**una sola** pasada del cielo local sembrada en ella). Va en cursiva porque es
referencia histórica, no candidata. Su m_res(0) sale 0,17 mag por encima de la del
punto fijo a 61×: es la pasada única que falta, ya medida en
`punto_fijo_adr0012.md`.

## Lo que dice la tabla

**1. `m_crowd` es ciego al aumento.** La fila es idéntica a 61× y a 250×: 4116
estrellas, 24,7 % del núcleo en puntos, las dos veces. No es un empate curioso, es
la definición: `mCrowd(r, Ω_óptica, k)` no lleva dentro ni oculares ni cielo. Un
simulador cuyo cúmulo no cambia al cambiar de ocular no sirve, y ese es el motivo
de fondo por el que el ADR 0012 lo jubiló para el render (sigue vivo para la
completitud de Gaia, que sí es un instrumento de beam fijo).

Y «exclusivamente m_crowd» significa además **sin magnitud límite**: fuera del
núcleo `mCrowd` devuelve +∞, así que se dibujan todas las estrellas de la lista sin
importar lo débiles que sean. De ahí las 4116 contra 137.

**2. `P_solo` ≈ `m_lim,sky`.** A 61× coinciden exactamente (137 y 137; el sorteo no
mata ninguna). A 250× van 548 contra 554: el sorteo se lleva 6, un 1,1 %. Con
θ_sep = 1,22″ el disco de exclusión es diminuto y a(m,r) vale casi 1 en casi todas
partes; el crowding probabilístico está **prácticamente inerte** en M13 con este
equipo.

**Consecuencia:** quien limita el núcleo de M13 no es la aglomeración, es el cielo
local — el velo del propio cúmulo, μ_velo(0) = 16,49 a 61×. El ADR 0012 no quitó
estrellas del cuadro; las quitó el punto fijo del velo, que es una ley
independiente. Ver `maglimite_vs_schaefer.md`: el umbral, medido contra Schaefer
1990, tampoco es estricto.

**3. El aumento entra por el velo, no por el crowding.** De 61× a 250× el núcleo
pasa de 0,7 % a 22,5 % del flujo en puntos con P_solo, con el mismo a(m,r): lo
único que se ha movido es `magLimite` contra un fondo que incluye el velo. Es
exactamente la dependencia del aumento que se buscaba, y no la trae el ADR 0012:
la trae el punto fijo.
