# Prerregistro de listones — catálogo propio de texturas de cielo profundo (fases 1-3)

Fecha: 2026-09-04. Comprometido ANTES de generar la primera textura y antes de
tocar `resources/js/bitacora-ps1.js`. Ningún listón se retoca tras ver la salida:
si un listón falla, la fase se cierra o se documenta el fallo, nunca se ajusta el
umbral a posteriori (disciplina de los ADR 0012 bis, 0015 y 0022). Ambas
conclusiones —implementar o descartar— son válidas de antemano.

Fuente: `simulador_ocular/docs/especificaciones/catalogo_dso_texturas_objetivo.md`
(objetivo del 2026-09-04). Este ADR no lo repite: fija lo que no puede moverse.

Dos enmiendas, las dos del 2026-09-04, las dos anteriores a la fase 1 y las dos
firmadas:

1. **La redacción de L1.1**, con lo que midió la fase 0. El apartado «Corrección
   de la redacción de L1.1» dice qué cambió, por qué, y por qué esto no es el
   ajuste a posteriori que el párrafo de arriba prohíbe.
2. **Las cuentas del catálogo y del banco** (apartados «Premisas medidas» y
   «Banco»): eran las del árbol anterior a la PR #189 y el banco pasó de 53 a 69
   objetos sin que nadie decidiera nada, porque la regla dice «todas las aptas».
   No es un listón movido: es un número derivado que se recuenta.

Ningún otro listón se ha tocado.

## Qué se decide

La imagen de cada objeto difuso deja de descargarse en caliente de STScI
(`ps1-proxy.php` → `fitscut`) y pasa a ser un **dato generado offline y servido
desde el dominio**: PNG de 16 bits en gris con codificación `asinh` invertible y
centinela 0 = ausencia, sidecar JSON con WCS y auditoría, y un manifiesto
`window.BITACORA_DSO_TEXTURAS` hermano de `BITACORA_GALAXIAS`/`BITACORA_NEBULOSAS`.
La ley que convierte la imagen en luz visible (`ps1AnclarACatalogo`, mezcla E,
`ps1PsfParche`, H2c, máscara difusa) **no cambia**: la frontera es el objeto
`{ancho, alto, datos, escalaAs, wcs}` que hoy devuelve `parseFITS`.

Tres fases, una capa cada una (ADR 0007). Cada fase tiene sus listones, su vía de
escape única y su tope duro. No se ejecuta una fase sin el PASA completo de la
anterior, y **no se ejecutan los listones de una fase cuyo listón obligatorio ya
cayó**: medir el resto sería pescar un pretexto (informe E4 del ADR 0012 bis).

## Premisas medidas (no se re-miden)

- Catálogo difuso: **1510 filas; 1066 aptas** (δ > −30° y `ps1CabeEnParche`),
  429 al sur, 15 no caben; por clase, 927 galaxias, 100 PN, 28 RfN, 10 HII y
  1 SNR. Lado del parche `clamp(6·r_e/60, 1,5′, 20′)`: p25 2,8′, p50 4,6′,
  p75 7,9′, p90 12,2′.
  (Contadas el 2026-09-04 sobre este árbol. La redacción original decía 1485 y
  1050 con 12 RfN, y era la del árbol de antes de la PR #189; el catálogo cambia
  y estas cifras son **descriptivas, no listones**: se recuentan, no se defienden.
  Lo que no se mueve es la regla que las produce.)
- Hoy `PS1.salida = 1024` fijo: 0,088 – 0,27 – 1,17 ″/px (mín, mediana, máx). A
  20′, σ de la PSF del telescopio en 0,54–0,72 px: «marginal» (README
  §«Lo que sigue sin estar resuelto»). Objetivo escrito en
  `scripts/test_resolucion_ps1.js`: 0,67 ″/px; suelo físico ≈ 0,5 ″/px
  (`harness_resolucion_ps1.js`).
- La adquisición es invariante para la fotometría: media por píxel estable a
  ±2e-3 entre 512 y 1920 px, flujo total idéntico (`test_resolucion_ps1.js`,
  sonda del 13-ago-2026 sobre M51).
- `ps1MagConsulta` fuerza Gaia hasta G = 20 cuando la capa está encendida: la
  máscara necesita todas las estrellas que PS1 registra, no las que el equipo ve.
- El golden `scripts/test_golden_difusas.js` (M51, M101, M104, M81) es SHA-256 bit
  a bit de `parche.datos` y del `difuso`; **se rompe por construcción** con
  cualquier cambio de fuente. Se recaptura con informe, no en silencio.
- Los ADR 0017 y 0021 se apoyan en que «las galaxias no se enteran»; la semántica
  NaN = ausencia ≠ 0 medido está cableada en seis funciones de la cadena.

## Banco (fijado antes de generar nada)

Elegido por modo de fallo y por cuantil de tamaño, no por tipo. Lados medidos con
`ps1GalaxiasDelCampo` sobre el catálogo de este árbol. Un objeto entra con su
motivo o no entra; añadir uno después exige anotarlo aquí con fecha.

| Motivo | Objetos |
|---|---|
| Cuantiles de lado (mín, p25, p50, p75, p90, tope) | NGC 3310 (1,57′), NGC 404 (2,80′), NGC 3377 (4,54′), NGC 4125 (7,89′), NGC 7331 (12,0′), NGC 205 (20′) |
| Golden existente | NGC 5194 (18,0′), NGC 5457 (20′), NGC 4594 (13,3′), NGC 3031 (20′) |
| Núcleo saturado en el stack | NGC 4486 (10,6′), NGC 1068 (5,35′) |
| Banda de polvo / de canto | NGC 4826 (12,5′), NGC 4565 (18,6′), NGC 891 (20′) |
| Vecinas en la escena / campo denso | NGC 5195 (6,55′), NGC 4374 (5,46′), NGC 4406 (12,9′), NGC 3034 (13,8′) |
| Borde de cobertura (δ = −25,3°) | NGC 253 (20′) |
| PN golden | NGC 6720 (2,29′) |
| PN con mordida bajo, sobre y en el tope de `mordidaCobMin` = 0,6 | NGC 7008 (43,6 %), Abell 12 (79,8 %), NGC 7026 (100 %) |
| PN compacta brillante en el lado mínimo | NGC 7662, NGC 6543 (1,5′) |
| PN por cuantil de lado | NGC 3587 (6,4′), NGC 1360 (11,6′), NGC 6853 (12,1′), NGC 7293 (20′) |
| HII, RfN y SNR | **todas las aptas**, incluidas NGC 2068, NGC 7635, NGC 6888, NGC 1952 |

Los 30 nombrados de la tabla más las clases enteras. **Al 2026-09-04, 39 de clase
entera (10 HII, 28 RfN, 1 SNR) = 69 texturas.** Controles de exclusión (deben
salir `modelo = "fila"` con motivo y sin petición de red): NGC 224, NGC 598,
IC 342, NGC 7000 (`no-cabe`) y NGC 55 (`sur`).

**Cardinalidad mínima de todo test sobre el banco: la que devuelva
`lib_banco_dso.js` (ADR 0005), no un número escrito.** La redacción original
decía «53 texturas» y fijaba 53 como cardinalidad; era la cuenta del árbol de
antes de la PR #189, que subió las RfN aptas de 12 a 28. El banco no encogió ni
creció por decisión de nadie: la regla siempre dijo «todas las aptas» de esas tres
clases, así que el número es **derivado**. Clavarlo en un test lo convierte en un
guardián que falla cuando el catálogo crece, que es justo cuando no debe fallar.
`lib_banco_dso.js` avisa cuando la cuenta de una clase entera se aparta de la que
este ADR registró, para que el cambio se vea sin bloquear nada.

Lo que sí queda fijo: los **30 objetos nombrados** de la tabla, cada uno con su
motivo, y los **5 controles**. Añadir o quitar uno de esos exige anotarlo aquí con
fecha.

Entradas pineadas: CSV de Gaia en `scripts/fixtures/gaia/` para los 11 objetos
golden (los 9 actuales más NGC 7008 y Abell 12, generados con
`gen_fixtures_gaia.js` antes de la fase 1). Parches FITS en `$PS1_HARNESS_DIR`
(fuera del repo), descargados una vez con `lib_bajar_parche.js`.

Configuraciones de medida (las del golden): {457,2 mm · 190× · SQM 21,2} y
{203 mm · 100× · SQM 20,5}, `SIZE = 720`, `AFOV = 70`. Aperturas para la PSF:
80, 203, 457 y 914 mm con `CFG.seeingArcsec = 2,0`.

## Fase 1 — Sustituir la fuente, a igual resolución

Textura = el mismo recorte que hoy (`salida = 1024`), codificado `asinh16` con
`a = σ` del cielo del parche. Runtime lee la textura si el manifiesto la declara,
proxy como respaldo (`cfg.proxyRespaldo = true`).

| # | Comprobación | Umbral | Qué falsea |
|---|---|---|---|
| L1.1 | Equivalencia: `parche.datos` tras `ps1AnclarACatalogo` por textura frente a por FITS, en el banco | `max|Δ| ≤ 0,05·σ` píxel a píxel; `|ΣΔ|/Σ ≤ 1e-4`; **NaN heredados del stack idénticos (0 píxeles)**; **NaN nacidos de la regla de ausencia: los que difieran, todos con `|v − corte| ≤ paso de cuantización`, y ≤ 1e-4 de los píxeles del parche**; los 5 controles salen `fila` con su motivo | que la codificación cambie la decisión `cielo − 2σ` (ausencia) o mueva el presupuesto de luz |
| L1.2 | Sin red: manifiesto completo del banco y `proxyRespaldo = false`, render del campo de M51 y del de NGC 7008 | 0 peticiones fuera de `dso/` (fetch de mentira que registra URLs, como `test_capa_difusa_defecto.js`) | que quede una dependencia externa escondida en la capa |
| L1.3 | Coste en el navegador, 4 golden, caché de sesión vacía | tiempo de `ps1LeerTextura` (descarga + decodificación) ≤ tiempo del FITS por proxy **en caliente**; bytes transferidos ≤ 0,5× del FITS | que la decodificación en JS cueste más de lo que ahorra |
| L1.4 | Suite completa tras recapturar el golden | todo verde; informe con la tabla de deltas de la recaptura, todos dentro de L1.1 | que la sustitución toque algo fuera de la frontera declarada |

Predicción (no listón): con `a = σ` el paso de cuantización cerca del cielo es
≈ 2e-4 σ y el error relativo en el núcleo ≈ 2e-4, así que L1.1 debería pasar
con dos órdenes de magnitud de margen. Si no pasa, el fallo no es de finura
sino de la codificación (signo, `uMin`, centinela).

**Vía de escape única**: si L1.1 falla, se prueba **una sola vez** `a = σ/4`; si
sigue fallando, la codificación pasa a float32 crudo con `Content-Encoding: gzip`
y se vuelve a medir el volumen. **Tope duro**: dos codificaciones que no cierran
L1.1 son un no, y la fase se cierra sin código de producción.

### Corrección de la redacción de L1.1 (2026-09-04, antes de la fase 1)

La redacción original pedía «máscara de NaN idéntica (0 píxeles)». Estaba mal
escrita, y la fase 0 lo enseñó antes de que nadie midiera contra ella
(`docs/validacion/dso_texturas_fase0.md`, apartado A): en `parche.datos` conviven
dos NaN de origen distinto y el listón los trataba como uno.

- Los **heredados del stack** (huecos de saturación, fuera de skycell) los
  transporta el centinela 0 sin tocarlos. Son exactos y el listón puede exigir —y
  exige— cero diferencias: en los 118 objetos de la fase 0 no se movió ninguno.
- Los **nacidos de la regla de ausencia** (`v < cielo − kσ`, que
  `ps1AnclarACatalogo` convierte en NaN) dependen de una comparación de dos
  números reales contra un umbral. Cualquier codificación que pierda el último bit
  mueve de lado a los píxeles que están pegados al umbral, y solo a esos. Medido:
  603 píxeles de 123 731 968 (0,0005 %), en 57 de 118 objetos, **todos dentro de
  un paso de cuantización del corte**, y al afinar el paso (`a = σ/4`) se reducen
  en la misma proporción.

Exigir cero en este segundo grupo no es exigir fidelidad: es exigir aritmética
exacta, que solo cumple guardar float32 sin codificar. El listón corregido cambia
un recuento imposible por la condición que de verdad separa el ruido de
cuantización de un fallo de codificación: **dónde** están los píxeles que
difieren. Si el códec tuviera el signo, el `uMin` o el centinela mal, los píxeles
discrepantes aparecerían lejos del corte y el listón lo cazaría igual que antes;
el tope de 1e-4 del parche (2,5× el peor objeto de la fase 0) impide además que
una patología se cuele por acumulación.

Hay que decirlo sin adornos: **esto es tocar un listón prerregistrado después de
ver una medida**, que es justo lo que la cabecera de este ADR prohíbe. Se hace
con tres condiciones y queda escrito para que se pueda juzgar. Primera: lo medido
en la fase 0 es la codificación aislada, no el experimento de L1.1 —la fase 1 no
ha corrido y no hay resultado que salvar—. Segunda: el listón corregido es más
exigente en especie, porque añade una condición de posición que la redacción
original no pedía, y solo más laxo en el recuento del grupo que era imposible.
Tercera: la parte alcanzable se queda en cero, sin margen. Si en la fase 1 hiciera
falta mover algo más, no se mueve: se cierra.

## Fase 2 — Resolución por objeto

`salida(lado) = clamp(ceil(lado·60 / 0,5), 128, 2048)`; `escalaAs = lado·60/salida`.
42 objetos del catálogo quedan en el tope (lado ≥ 17,07′).

| # | Comprobación | Umbral | Qué falsea |
|---|---|---|---|
| L2.1 | σ de la PSF del telescopio en píxeles del parche (`ps1ThetaAdd`), D ∈ {80, 203, 457, 914}, en todo el banco | ≥ 1 px para lado < 17′; ≥ 0,85 px en el tope de 2048 | que quede algún objeto «subpíxel» (la apertura no se nota) |
| L2.2 | 457 frente a 914 mm en NGC 5194, 3031, 5457, 205 (`harness_decision_psf_resolucion.js`) | separación ≥ 1σ del ruido de cielo, con el signo correcto; en los 6 representantes de cuantil, `θ_add` decrece con D | que subir la resolución no haga visible la apertura, que es su único motivo |
| L2.3 | Flujo total por objeto, textura de fase 2 frente a textura de fase 1 | `|ΔF|/F ≤ 2e-3` en todo el banco | que el remuestreo de `fitscut` deje de conservar brillo superficial |
| L2.4 | Volumen y memoria | PNG del banco + muestra aleatoria de 50 (semilla fija) extrapolados a las filas aptas ≤ 1,5 GB; ≤ 16 MB por parche decodificado; campo de Virgo (NGC 4374/4406 y vecinas) ≤ 150 MB en el navegador | que el coste supere lo que el hosting y el navegador aguantan |

**Vía de escape única**: si L2.4 falla, tope 1794 px (el número del README para
0,67 ″/px) en vez de 2048. **Tope duro**: si con 1794 sigue fallando, la fase 2 se
cierra y el catálogo queda a `salida = 1024` (fase 1), que ya es lo que hay hoy
sin la dependencia externa.

## Fase 3 — Máscara y fuentes conservadas offline

`ps1EstrellasEnPixeles` + `ps1EscenaEnParche` + `ps1QuitarEstrellas` corren en
Node con Gaia pineada por objeto (G ≤ 20). La textura guarda el parche ya sin
estrellas, `fuentesConservadas` y `procedencia`; el runtime salta
`ps1QuitarEstrellas` y `ps1MagConsulta` deja de forzar G = 20.

| # | Comprobación | Umbral | Qué falsea |
|---|---|---|---|
| L3.1 | `parche.datos` de fase 3 frente a fase 2 con la misma Gaia pineada, y `excluidas` de la capa de estrellas | bit a bit idéntico; `excluidas` idénticas fila a fila en todo el banco | que mover la ley de sitio la cambie (ADR 0008) |
| L3.2 | Filas de Gaia transferidas para el campo de NGC 5194 a 133× con 200 mm | bajan ≥ 40 % respecto a hoy | que quitar la consulta profunda no compense la congelación de la máscara |
| L3.3 | Versión `<v>` de la textura | cambia al mutar cualquiera de `mascaraMaxAs`, `mascaraMagRef`, `rellenoPlanoMaxAs`, `mordidaCobMin` (test que muta la cfg y espera hash nuevo) | que una máscara vieja sobreviva a un cambio de ley sin que nadie se entere |

Riesgo aceptado y escrito: la máscara queda congelada con Gaia DR3 y la cfg del
momento; cambiarla obliga a regenerar el catálogo entero (1066 texturas hoy). La caché local de FITS
(`$PS1_HARNESS_DIR`, ≈ 4–8 GB) se guarda con copia fuera del repo.

**Vía de escape única**: si L3.2 no llega al 40 %, la fase 3 se cierra: la
máscara sigue en runtime y la textura se queda como en la fase 2. **Tope duro**:
no hay v2 de la fase 3; una máscara congelada que no ahorra red no compensa.

## Alcance de lo prohibido

- Ninguna transformación en el generador sin procedencia física: recorte, costura
  por NaN, codificación invertible. Nada de estirado, gamma, ecualización, realce
  ni «se ve mejor» (ADR 0004). Los nombres nuevos pasan por `test_disciplina_v7.js` §3.
- Ninguna ley copiada a otro lenguaje: el generador es Node y llama a
  `BitacoraPS1.*` (ADR 0008). `lib_bajar_parche.js` sigue siendo réplica declarada
  del proxy PHP y se protege con un test cruzado de URLs.
- Ninguna rama por clase en el render: el manifiesto declara la **procedencia**
  del modelo intrínseco (`imagen` | `fila` + motivo); observación y display no
  conocen la clase (ADR 0013). Un `if (clase === …)` nuevo en `bitacora-ps1.js`
  es un fallo de este prerregistro.
- Ningún 8 bits ni compresión con pérdida: la ausencia (`cielo − 2σ`) y el rango
  del núcleo no caben, y una pérdida no invertible es una ley de display dentro
  del fichero (ADR 0019).
- Ninguna recaptura del golden sin su tabla de deltas en el informe, y ninguna
  con dos causas en el mismo commit. El procedimiento, con las cuatro recapturas
  previstas y el invariante que cada una debe respetar, está en
  `docs/notas/recaptura-golden-difusas.md`.
- Los cúmulos no entran (ADR 0002, 0012).

## Lo que este ADR no decide

- La fase 4 (warps, segundo sondeo, imagen maestra, mapa de procedencia por
  píxel) y el renombrado de `bitacora-ps1.js` que el ADR 0020 presupuesta para
  cuando entre un segundo sondeo. Se abre solo con la fracción de escena
  saturada medida en la fase 0 y con su propio prerregistro.
- Tope 2048 frente a 1794 y cuándo `proxyRespaldo = false` pasa a ser el defecto.
  Son las decisiones 9.2 y 9.3 del objetivo. La 9.2 se toma al entrar en la
  fase 2, con las cifras de volumen ya medidas (regla C = 1,51 GB, por encima del
  listón de L2.4; tope 1794 = 1,42 GB).

## Decisión 9.1 — Las fixtures del banco golden van en git (2026-09-04)

Tomada con las cifras de la fase 0 delante: los 11 objetos golden a
`salida = 1024` pesan **18,33 MB** en PNG-16, pesados uno a uno.

El motivo no es el tamaño. Es que hoy el guardián bit a bit
(`test_golden_difusas.js`) depende de un servicio externo cuyo orden de respuesta
nadie controla: `lib_bajar_parche.js` cose las skycells quedándose con el primer
píxel válido, en el orden en que las devuelve `ps1filenames.py`, y el solape
discrepa un 15 % en la mediana. Los stacks de PS1 son inmutables; **ese orden no
lo garantiza nada**. Un golden cuya entrada puede cambiar sin que nadie toque
código no es un golden. Pinchar la entrada es lo que pide, y es la misma razón por
la que los CSV de Gaia ya están en `scripts/fixtures/gaia/`.

El coste encaja: el repo ya lleva 58 MB de imágenes de experimentos versionadas,
así que 18 MB son un +6 % del histórico. La alternativa de descargarlas de
producción se descarta por dos motivos, no por tamaño: durante la fase 1 no hay
nada desplegado en `dso/` que leer, y después el guardián fallaría por un
despliegue desincronizado en vez de por un cambio de código.

**Dos condiciones, escritas para que no se decidan solas:**

1. **Solo los 11 objetos golden.** El banco entero a 1024 son 97,4 MB y no entra
   en git en ningún caso; los otros 58 se descargan como hoy.
2. **La fase 2 decide, aparte y por escrito, si las fixtures siguen a
   producción.** El golden hashea el parche que producción pide, así que al pasar
   `PS1.salida` a `salida(lado)` o las fixtures van con él —**39,9 MB** con tope
   2048, 34,3 con 1794— o el golden deja de guardar el camino real y se convierte
   en una regresión de la ley a resolución fija, que es otra cosa y hay que
   llamarla por su nombre. Sin esta decisión explícita, la recaptura de la fase 2
   la toma por omisión.

Cada regeneración reescribe los once enteros (un PNG no delta-comprime): con las
tres previstas —fase 1, fase 2 por resolución y fase 3 por máscara— el histórico
crece entre 55 y 75 MB. Se acepta. Si alguna vez deja de aceptarse, la salida es
Git LFS, no descargar de producción.

## Ampliación del ADR 0013

El modelo intrínseco sigue viviendo en la fila de catálogo. Lo que este ADR añade
es que la fila puede tener **dos fuentes**, declaradas por fila en el manifiesto:
la fila Sérsic sola, o la fila más una textura generada de un sondeo público con
procedencia. Con textura manda la imagen y la fila fija el presupuesto de luz
(ADR 0021); sin textura, la fila es el modelo. No es la alternativa (4) que
`docs/notas/ngc7008-render-planetarias.md` descartó («plantillas o máscaras por
objeto»): no hay curaduría manual ni recurso por objeto, hay un generador
determinista, igual que `estrellas-brillantes-datos.js` no es un parche del
dibujo sino un catálogo hermano (ADR 0018 bis).

## Relación con el ADR 0012 bis

No lo contradice: el teselado de Gaia cayó por el frío absoluto contra un
servicio serializado por IP, y el informe E4 dejó abierta la puerta al
«precalentado nocturno donde el frío no importa». Esto es esa puerta, para la
imagen y no para las estrellas: el coste de adquisición se paga una vez, offline,
y la clave de caché sigue sin llevar ni ocular ni aumento.

## Por qué ADR

Es un trade-off real (dependencia externa y resolución frente a un catálogo de
≈ 1 GB que hay que generar, versionar y desplegar a mano), sorprendería sin
contexto (¿por qué PNG-16 con `asinh` y no WebP? ¿por qué el generador es Node y
no Python? ¿por qué el golden se rompe a propósito?) y es caro de revertir: las
texturas se sirven inmutables y cada cambio de ley obliga a regenerarlas. Los
listones son el contrato; moverlos después convierte las medidas en retórica.
