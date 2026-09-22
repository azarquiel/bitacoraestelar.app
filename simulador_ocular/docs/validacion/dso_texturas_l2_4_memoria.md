# L2.4 — la memoria en el navegador, medida (#324)

Fecha: 2026-09-22. Listón: L2.4 del ADR 0024 (fase 2), las dos condiciones de
**memoria** (el volumen en disco es harness_dso_volumen.js, aparte — ver
`[[harness-volumen-extrapola-sesgado]]` en memoria del agente: 1,40 GB
fila a fila, PASA, sin necesitar la vía de escape). Máquina: la de desarrollo
(Darwin 27.0.0), Chrome 153, servidor estático de un solo uso (este entorno no
tiene `php`; el mapeo de rutas que usa `dev_servidor_ocular.php` está
replicado, sin proxys, en un script fuera del repo).

**Veredicto: las dos condiciones de memoria PASAN.**

| Condición | Umbral | Medido | Veredicto |
|---|---|---|---|
| Parche del tope (2048², real, M51) decodificado | ≤ 16 MB | 16,00 MB (`Float32Array.byteLength`) | ✅ (en el borde, por construcción: 2048²·4 B = 16 MB exactos) |
| Campo de Virgo (14 parches, regla C por objeto) | ≤ 150 MB en el montón | 50,5–102,0 MB medidos (3 pasadas), mediana 60,8 MB | ✅ con margen |

## Por qué esto ya no es L1.3 repetido

L1.3 (fase 1) pesaba el campo de Virgo decodificando el mismo golden 14 veces,
porque a `PS1.salida` fijo **cualquier** parche pesa igual: «uno vale por otro
para pesar». En fase 2 la resolución es por objeto (regla C,
`ps1SalidaParche(gal.ladoArcmin)`), así que esa sustitución ya no es válida —
los 14 objetos del campo de Virgo van de 329 a 1854 px, no los 1024 fijos de
antes.

Ningún objeto del campo tiene textura publicada todavía: el banco de fase 2 no
se genera hasta que L2.4 cierra (es la nota del propio #324, «conviene medirlo
sobre una muestra antes de generar el banco entero»). La memoria de decodificar
un PNG-16 depende del **ancho y alto**, no del contenido, así que
`scripts/gen_fixtures_l24_virgo.js` genera, con el códec de producción
(`BitacoraPNG16.codificar` + `lib_png.escribirGris16`, ninguna ley
reimplementada, ADR 0008), un parche de ruido gaussiano al tamaño REAL que
`ps1SalidaParche` le daría a cada uno de los 14 objetos. Sirve solo para este
listón: no para L1.1 ni para nada de fotometría.

El parche del tope, en cambio, **es real**: la textura golden de M51, que ya
está a 2048 px tras la recaptura R3 (`recaptura_r3_resolucion.md`).

## El listón del parche mide el array, no el montón

Primera pasada: medí el parche del tope con crecimiento de
`performance.memory.usedJSHeapSize` (como el campo), y salió 48,08 MB — tres
veces el tope. No es que la fase 2 rompa nada: ese número incluye los
temporales del decodificador (el buffer inflado, el `Uint16Array` intermedio,
la lista de trozos del `DecompressionStream`) que el recolector todavía no
había recogido, y `harness_l1_coste.html` nunca midió eso para esta condición
— su `medida()` usaba `F.datos.byteLength`, el tamaño del `Float32Array` ya
decodificado, que es lo que la redacción del listón pide literalmente
(«ocupa ≤ 16 MB **en float32**»). Corregido a `byteLength`: 2048²·4 bytes =
16 777 216 B = 16,00 MB exactos, justo el borde que explica por qué 2048 es el
tope de la regla C y no un número redondo cualquiera.

El montón (con esos temporales vivos) es otra magnitud, y esa sí es la que el
listón pide medir para el campo — por eso el método no se retoca ahí.

## Cómo se reproduce

```
node scripts/gen_fixtures_l24_virgo.js        # 14 fixtures sintéticas en simulador_ocular/dso/
cp scripts/fixtures/dso/NGC_5194.69218f92.{png,json} simulador_ocular/dso/
php -S localhost:8080 scripts/dev_servidor_ocular.php
abrir http://localhost:8080/scripts/harness_l24_memoria.html
node scripts/limpiar_fixtures_l24_virgo.js    # al terminar
rm simulador_ocular/dso/NGC_5194.69218f92.{png,json}   # si no estaba ya
```

## Lo medido

Campo de Virgo, mismo centro que L1.3 (punto medio NGC 4374/NGC 4406, lado
120′), decidido por `ps1GalaxiasDelCampo`: 14 objetos, igual que en fase 1.

| Objeto | Lado | Salida (regla C) |
|---|---|---|
| NGC 4374 | 5,46′ | 656 px |
| NGC 4388 | 8,56′ | 1028 px |
| NGC 4402 | 3,35′ | 403 px |
| NGC 4406 | 12,95′ | 1554 px |
| NGC 4413 | 4,06′ | 487 px |
| NGC 4425 | 3,91′ | 469 px |
| NGC 4435 | 6,68′ | 802 px |
| NGC 4438 | 15,44′ | 1854 px |
| NGC 4440 | 3,24′ | 389 px |
| NGC 4458 | 2,74′ | 329 px |
| NGC 4459 | 11,08′ | 1330 px |
| NGC 4461 | 5,34′ | 641 px |
| NGC 4473 | 3,48′ | 419 px |
| NGC 4477 | 10,83′ | 1300 px |

Tres pasadas independientes (páginas nuevas, sin caché de sesión compartida):
**50,48 · 60,79 · 102,03 MB**, mediana 60,79. El ruido entre pasadas es el
mismo tipo de ruido que L1.3 documentó para el montón (encolado, recolección
no forzada entre parches): ningún objeto va cerca del tope de 2048 px —el
mayor, NGC 4438, se queda en 1854—, así que la suma identidad
(Σ salida²·4 B) da 49,24 MB, dentro del rango medido. La peor de las tres
pasadas (102,03 MB) sigue dejando 48 MB de margen bajo el tope de 150.

Esto contradice la advertencia de la enmienda de fase 2 del ADR («escalando
por el mismo factor, serían ~224 MB»): esa cuenta asumía los 14 parches al
tope de 2048 px, que es lo que pasaba en fase 1 con `cfg.salida` fijo. La
regla C no sube todo a 2048: sube cada objeto a **su** resolución, y en el
campo de Virgo ninguno de los 14 la alcanza. El aviso valía como orden de
magnitud, como el propio ADR decía, y la medida real —no la extrapolación— es
la que cuenta para L2.4.

## Decisión

Las dos condiciones de memoria de L2.4 pasan sin vía de escape. Queda
pendiente, aparte, la condición de volumen en disco (**L2.4 completo** no
cierra en este informe): `harness_dso_volumen.js` tiene dos defectos que hay
que arreglar antes de usarlo para juzgarla (baja el float32 a `CFG.salida`
fijo en vez de la regla C por objeto, y extrapola por regla de tres sobre una
muestra sesgada hacia objetos grandes) — documentado en la memoria del agente
como pendiente de este mismo issue. La cifra de referencia ya calculada a
mano (1,40 GB fila a fila con los bytes/px medidos del banco de 68) también
pasa el tope de 1,5 GB, así que no hay indicio de que la vía de escape
(1794 px) vaya a hacer falta, pero eso lo cierra el harness arreglado, no este
informe.
