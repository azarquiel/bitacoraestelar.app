# Prerregistro — validación held-out de Φ″ (ADR 0022)

Fecha: 2026-08-30. Protocolo acordado en el grilling de #113
(2026-08-25): extracción de citas → clasificación ciega del núcleo por
aumento, SOLO desde el texto de la ficha → congelación como listones →
una única ejecución del arnés. Nadie ha computado Φ″ de estos cúmulos antes
de este commit.

## 1. Fuente

`https://bitacoraestelar.app/wp-json/bitacora/v1/datos.js` (público, sin
sesión — [[mapa-html-estatico-sin-wp-head]]), campo `OBSERVACIONES`, las 17
fichas de cúmulos globulares que el observador confirmó como correctamente
identificados en mapa.html: M2, M3, M4, M5, M9, M10, M12, M13, M14, M15,
M22, M30, M55, M62, M71, NGC 6934, NGC 7006.

**Excluidos** (D=458 mm/18″, ya consumidos por el arnés en BANCO18/ordinales
de los ADR 0016–0018): M22, M30, M55, M62.

**Held-out real** (13 casos, ningún aumento visto antes por el arnés): M2,
M3, M4, M5, M9, M10, M12, M13-18″ (D=458, distinto del ancla que usa D=200),
M14, M15, M71, NGC 6934, NGC 7006.

## 2. Mapeo a NGC (catálogo Harris del render)

| Messier | NGC | D observado | SQM asumido |
|---|---|---|---|
| M2 | NGC 7089 | 458 mm | 21 (convención D18/SQM18, igual que 0016–0018) |
| M3 | NGC 5272 | 200 mm | 21 |
| M4 | NGC 6121 | 458 mm | 21 |
| M5 | NGC 5904 | 458 mm | 21 |
| M9 | NGC 6333 | 458 mm | 21 |
| M10 | NGC 6254 | 458 mm | 21 |
| M12 | NGC 6218 | 458 mm | 21 |
| M13-18″ | NGC 6205 | 458 mm | 21 |
| M14 | NGC 6402 | 458 mm | 21 |
| M15 | NGC 7078 | 458 mm | 21 |
| M71 | NGC 6838 | 458 mm | 21 |
| NGC 6934 | NGC 6934 | 200 mm | 21 |
| NGC 7006 | NGC 7006 | 200 mm | 21 |

SQM 21 no es la del cielo real de cada sesión: es la misma convención de
referencia fija que usan el ancla y BANCO18 en los ADR 0016–0018 (M solo
entra por `m_lim,sky`, nunca por σ/RMS de campo — regla heredada, no
retocada aquí).

## 3. Clasificación ciega del núcleo (congelada, sin calcular Φ″ antes)

Criterio: SOLO lo que la cita dice del núcleo (no del halo). «Estrellas
resueltas EN/DENTRO del núcleo» → resuelto. «Se intuyen, no se resuelven» o
sin mención → nebuloso. Cobertura ambigua o con reserva explícita del
observador → intermedio. Sin frase que decida sobre el núcleo → sin dato
(excluido del listón).

| Cúmulo | Aumento | Núcleo | Cita (fragmento) |
|---|---|---|---|
| M3 | 58x | nebuloso | «solamente lo observo como una esfera con dos niveles de brillo» |
| M3 | 225x | intermedio | «en el núcleo se aprecian diversos "niveles de estrellas"… flotar por encima del núcleo» |
| M4 | 70x–486x (6) | resuelto | «en el núcleo del objeto la línea recta de estrellas»; se mantiene resuelto en los 6 aumentos |
| M10 | 70x | nebuloso | resolución atribuida solo al «halo más externo» |
| M10 | 99x | nebuloso | «dos niveles de brillo más claramente», sin estrellas en núcleo |
| M10 | 156x | intermedio | «ríos de estrellas… parten desde el mismo centro del núcleo» |
| M10 | 219x | sin dato | frase genérica, no específica del núcleo |
| M10 | 273x | resuelto | «un par de estrellas más brillantes que el resto» en el centro |
| M10 | 486x | resuelto | «las dos estrellas (ahora claramente distinguibles) del centro» |
| M12 | 70x | intermedio | «resolver estrellas… llegando algunas incluso al borde del [núcleo]» |
| M12 | 99x | sin dato | genérica |
| M12 | 156x | intermedio | estrellas resueltas «más cerca de la zona central del núcleo» |
| M12 | 219x | sin dato | genérica |
| M12 | 273x | resuelto | «ver estrellas en el mismo centro del cúmulo» |
| M12 | 486x | resuelto | «las estrellas se resuelven perfectamente… en el centro» |
| M5 | 70x–480x (6) | resuelto | «en el núcleo brillante… quincena» de estrellas ya a 70x; se mantiene en los 6 |
| M9 | 70x | nebuloso | «se intuyen estrellas individuales que no consigo resolver» en el centro |
| M9 | 99x–486x (5) | resuelto | «ver con más detalle el núcleo… un par de estrellas que se resuelven muy bien» en adelante |
| M14 | 70x | nebuloso | núcleo/halo sin diferencia significativa, sin estrellas resueltas |
| M14 | 98x | nebuloso | aro tenue descrito, sin resolución en núcleo |
| M14 | 154x | intermedio | «zona más brillante» distinguida, sin estrellas individuales explícitas |
| M14 | 216x–480x | resuelto | «estrellas… partiendo desde el mismo centro del cúmulo» en adelante |
| M71 | 70x | nebuloso | «no en el mismo núcleo… sí en su zona más externa» |
| M71 | 99x | intermedio | «llegando casi hasta el mismo núcleo» |
| M71 | 156x–486x | resuelto | «hasta en el mismísimo núcleo las estrellas pueden ser contadas individualmente» |
| M15 | 70x | nebuloso | «en el núcleo es complicado resolver estrellas» |
| M15 | 98x | resuelto | «en el núcleo hay una agrupación de estrellas» (la «C») |
| M15 | 154x | intermedio | «las estrellas… en el centro del mismísimo núcleo me cuesta más trabajo verlas» |
| M15 | 216x/270x | resuelto | la C «rota» en estrellas individuales |
| M15 | 480x | intermedio | núcleo evidente pero «cuesta… conseguir estrellas puntuales» |
| M2 | 70x/99x | resuelto | «en ese núcleo de 2/3… decenas de estrellas rojizas muy definidas» |
| M2 | 156x | intermedio | «no soy capaz de resolver las estrellas del núcleo con tanta facilidad» |
| M2 | 219x/273x | nebuloso | «dentro de él no soy capaz de resolver ninguna» |
| M2 | 486x | intermedio | núcleo visible «aunque no de forma tan contrastada» |
| NGC 6934 | 58x | sin dato | sin mención del núcleo |
| NGC 6934 | 225x | intermedio | «parece que se resuelve alguna [estrella]… es realmente complicado» |
| NGC 7006 | 180x | nebuloso | «no resuelvo estrella alguna… brillo… homogéneo» |

M2 y M15 son no monotónicos (el propio observador atribuye la pérdida a
foco/seeing, no a un cambio real del objeto). Se congelan tal cual — el
protocolo no permite suavizarlos.

## 4. Listones (congelados; no se retocan tras ver Φ″)

- `resuelto` → `Φ″(caso) ≥ U″`
- `nebuloso` → `Φ″(caso) < U″`
- `intermedio` → sin umbral binario; solo entra en comprobaciones
  ordinales entre pares de la misma tabla
- `sin dato` → excluido

**Listón principal**: de los 13 held-out, el arnés debe acertar el signo
(`≥`/`<` U″) en TODOS los casos `resuelto`/`nebuloso` sin excepción. Un solo
fallo falsea Φ″ y reabre la iteración (b) sobre el render (#113 §4 del
prerregistro 0018), con la variable ya acotada: partición de Δ o forma de
`m_res`.

## 5. Estado

Ni una ejecución del arnés contra estos 13 cúmulos antes de este commit.
Siguiente paso: `scripts/veredicto_heldout_phi2.js` (lee esta tabla,
ejecuta `medirPhiSegunda` una sola vez por caso, compara) y
`0022-rotura-nucleo-heldout/veredicto.md`.
