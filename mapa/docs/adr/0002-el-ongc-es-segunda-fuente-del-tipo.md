# 0002 · El OpenNGC es segunda fuente del tipo, por catálogo y no por nombre

Fecha: 2026-09-27
Estado: aceptado

## Contexto

La clasificación de objeto del mapa ([[clasificación de objeto del mapa]])
decide `tipo`+`color` a partir del `otype` de SIMBAD, la morfología y el tipo
declarado en la observación. SIMBAD es la autoridad para estrellas y para
«¿es una galaxia?», pero para los números NGC/IC a veces resuelve mal:

- **NGC 6888** (Crescent Nebula) → SIMBAD enlaza el número a HD 192163, la
  estrella Wolf-Rayet central, con `otype = WR*`. El clasificador la pintaba
  `estrella` cuando es una nebulosa de emisión (`HII`).
- **NGC 6960 / NGC 6992** (Velo oeste/este, Bucle de Cygnus) → SIMBAD las
  tipa `ISM` y `sh`, códigos genéricos que caían en `desconocido`. Son restos
  de supernova (`SNR`).
- **IC 5146** (Cocoon Nebula) → SIMBAD la tipa `OpC` (el cúmulo embebido),
  salía `abierto`. Es cúmulo+nebulosa (`Cl+N`), y al ocular domina la
  nebulosa.

El dato correcto ya vivía en el repo: `mapa/datos/ongc_nebulosas.csv`, la
fracción nebular del **OpenNGC** (Mattia Verga), el mismo catálogo del que
beben `gen_nebulosas.py` y `gen_abell_pn.py`. Pero el clasificador del mapa
no lo usaba: solo SIMBAD.

La primera propuesta fue un parche por nombre (una lista de «NGC 6888 →
emisión», «NGC 6960 → snr», …). Se descartó en la revisión: contradice la
línea del CONTEXT que expulsó el regex de prefijos, y no arregla «cualquier
otro problema similar en el futuro» — arregla cuatro objetos y se acaba.

## Decisión

**El tipo de un objeto con designación NGC/IC se resuelve, antes que el
`otype` de SIMBAD, contra el OpenNGC completo (`Type` por número de catálogo),
y solo los tipos DSO específicos pisan a SIMBAD.**

Cadena:

```
database_files/NGC.csv (OpenNGC)  →  scripts/gen_ongc_tipo.py  →  datos/ongc-tipo.json
                                                                   { "NGC6888": "HII", ... }
bitacora_ongc_tipo("NGC 6888")  →  "HII"  →  bitacora_clasificar_objeto(..., $ongc)
```

Reglas que acompañan a la decisión:

- **Por catálogo, no por nombre.** La clave es la designación canónica
  NGC/IC (`NGC6888`), normalizada con ceros a la izquierda; no una lista de
  nombres famosos. Cualquier NGC/IC que SIMBAD resuelva mal —presente o
  futuro— cae en la misma regla sin tocarla.
- **Solo pisan los tipos DSO específicos.** `G`→galaxia, `OCl`→abierto,
  `GCl`→globular, `PN`→planetaria, `HII`/`EmN`→emision, `RfN`→reflexion,
  `SNR`→snr, `Cl+N`→emision. El resto del vocabulario OpenNGC (`Neb`, `Dup`,
  `NonEx`, `Other`, `*`, `**`, `*Ass`, `GPair`, `GTrpl`, `GGroup`, `Nova`) y
  la ausencia de fila **caen a SIMBAD**: un código genérico no debe tapar el
  dato bueno del otro catálogo.
- **`G` deriva a la rama de galaxia**, no a una categoría fija: «¿de qué
  clase?» la sigue contestando la morfología ([[clasificación de objeto del
  mapa]]), igual que hoy con el otype extragaláctico.
- **`Cl+N` → `emision`.** El mapa no tiene categoría «cúmulo+nebulosa», y
  fundir o crear una tocaría leyenda + taxonomía + tests. La nebulosidad es lo
  que domina al ocular; M42 ya era `emision` por su otype `HII`, así que la
  regla no lo mueve y sí rescata a IC 5146.
- **Prioridad intacta por arriba y por abajo.** El `tipo` del registro sigue
  ganando (override manual), y la tabla MW por otype, la rama estelar y el
  `desconocido` siguen donde estaban. El OpenNGC se inserta entre el registro
  y el otype de SIMBAD.
- **El dato es un fichero generado, no una consulta en caliente.** El mapa
  `{nombre → Type}` se genera offline (`gen_ongc_tipo.py`) y viaja como
  `datos/ongc-tipo.json`; el plugin lo carga una vez por petición (static).

## Alternativas descartadas

- **Parche por nombre (lista de NGC 6888/6960/6992/5146).** Arregla los cuatro
  de hoy y se acaba; resucita el regex de prefijos de catálogo que el modelo
  expulsó. Descartada en revisión, que es el motivo de este ADR.
- **Wikipedia u otra fuente en prosa.** Acierta, pero no es machine-readable
  ni citable como dato de código; el OpenNGC es la misma información en CSV
  curado, ya usado por el repo.
- **Ampliar la tabla de otypes de SIMBAD** (`sh`→snr, `ISM`→…). No basta:
  `ISM` es ambiguo (Mérope debe quedar `desconocido` a propósito) y `WR*` es
  una estrella legítima; tres de los cuatro quedan sin arreglo.
- **Consultar el OpenNGC en caliente** (GitHub/VizieR por cada objeto). Red y
  fallo en el camino de registro; el fichero estático ya funciona para las
  dobles y las campañas.
- **Categoría nueva «cúmulo+nebulosa».** Honesta, pero es cambio de taxonomía
  (leyenda, tests, columnas) para un caso que el ojo ya resuelve a favor de la
  nebulosa.

## Consecuencias

- **Los cuatro del bug se arreglan por la regla general**: NGC 6888 → `emision`,
  NGC 6960/6992 → `snr`, IC 5146 → `emision`; y cualquier NGC/IC con el mismo
  hueco de SIMBAD, también.
- **Las filas ya guardadas se rescatan con el botón existente** «Reclasificar
  los objetos sin clasificar», cuyo WHERE ahora incluye `abierto` además de
  `otro`/`''`/`desconocido`/`estrella`. Es la misma pasada idempotente de
  siempre, ampliada para que IC 5146 (`abierto`) tenga botón que la rescate.
- **NGC 7023 (Iris) y NGC 1435 (Mérope) siguen como estaban**: el OpenNGC las
  tipa genéricas (`Neb`), que no pisa, así que caen a SIMBAD (`OpC`/`ISM`) y
  salen `abierto`/`desconocido`. La decisión de no forzarlas por nombre se
  mantiene.
- **Hay que regenerar `datos/ongc-tipo.json`** cuando se actualice el OpenNGC
  (`python3 scripts/gen_ongc_tipo.py`). El test
  `scripts/test_clasificacion_objeto.py` fija los cuatro anclas para que un
  cambio de tipo aguas arriba falle en voz alta.
- **El mapa `tipo` sigue siendo una sola categoría.** Los objetos dobles
  (cúmulo+nebulosa, galaxia+…) se resuelven a la dominante; un modelo
  multi-etiqueta queda fuera de alcance.
