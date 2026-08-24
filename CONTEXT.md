# Contexto de dominio — Bitácora Estelar

Términos que cruzan varios contextos (ver `CONTEXT-MAP.md`). Un término definido aquí NO se redefine en el CONTEXT.md de cada contexto: se enlaza con `[[nombre]]`.

Producción: **https://bitacoraestelar.app** (WordPress con plugin `resources/plugins/bitacora-registro`). Datos públicos sin sesión — forma más rápida de ver qué ve el mapa de verdad: `/wp-json/bitacora/v1/objetos` (catálogo del mapa), `/wp-json/bitacora/v1/datos.js` (lo que carga el visor) y `/wp-json/bitacora/v1/resolver?q=NGC+2022` (lo que resuelve el buscador).

## Modelo de color Gaia

Mapeo canónico **índice BP–RP → color RGB** de una estrella, anclado a códigos físicos de Harre & Heller (2021) / spec2col (espectro → CIE → XYZ → sRGB), con corrección gamma sRGB parcial y extremo rojo anclado a espectro de estrella de carbono (bandas C2 "Swan").

- **Fuente única:** `resources/js/bitacora-gaia-color.js`, global `window.BitacoraGaiaColor`.
- **Interfaz:** `colorPorBpRp(bprp)` → `[r,g,b]`; `claseEspectral(bprp)` → letra espectral (O·B·A·F·G·K·M); `bpRpPorTipo(tipo)` → camino INVERSO, del tipo espectral del catálogo (`'K3II'`, `'B9.5'`, `'gM0'`) al índice BP–RP, para estrellas con tipo pero sin fotometría de Gaia; `config` → palanca mutable de gamma y saturación compartida por todos los consumidores.
- `bpRpPorTipo` NO es segunda fuente de color: solo estima el BP–RP con que preguntar al modelo, así que K3 del catálogo se pinta igual que estrella de Gaia con ese índice. Tabla de anclas interpolada, con corrección por clase de luminosidad en clases frías; aproximación para pintar, no fotometría. Tipo no entendido devuelve `null` (blanco), y «basura» no cuela como B5.
- **Consumidores:** **simulador de oculares** (`bitacora-ocular.js`, ver `simulador_ocular/CONTEXT.md`) y **vecindario solar** del mapa (`vecindario-solar.js`, ver `mapa/CONTEXT.md`), ambos desde la misma URL canónica `/wp-content/uploads/bitacora/bitacora-gaia-color.js`.
- **Invariante:** color de una estrella EXACTAMENTE igual en simulador y mapa. Garantizado estructuralmente (fuente única), no por copiar y pegar. Test dorado `scripts/test_gaia_color.js` fija el contrato.
- Realce de **estrella de carbono** NO pertenece al modelo: capa del simulador que ajusta el BP–RP efectivo antes de pedir el color canónico.
- **`bpRpPorTipo` entra en el vecindario solar cuando no hay `bp_rp`**, con el `sp_type` de SIMBAD guardado en el [[objeto del mapa]] (columna `sp_type`, resuelto en `bpRpDe()` de `via-lactea-vecindario-catalogo.js`). Caso real: primarias muy brillantes y saturadas fuera de Gaia (Sirius, la K de Gamma Andromedae) — sin este respaldo se quedan sin color (blancas) o, peor, heredan el `bp_rp` de una estrella vecina (ver ADR 0015).

## Equipo del observador (helpers puros)

Cálculos y rótulos puros del equipo, compartidos por **simulador de oculares** y **Mi flota** (registro), sin DOM ni WordPress.

- **Fuente única:** `resources/js/bitacora-equipo.js`, global `window.BitacoraEquipo` (+ `module.exports` para node), URL canónica en `/wp-content/uploads/bitacora/`.
- **`focalEfectiva(focal, factor, extension)`** → focal del telescopio tras la **óptica auxiliar**: `factor` multiplica (Barlow > 1 alarga, reductor < 1 acorta, vacío = 1 neutro) y `extension_mm` suma milímetros fijos. Único punto por el que el auxiliar entra en el simulador; aumentos, pupila de salida, campo y magnitud límite heredan el cambio.
- **`nombreTelescopio(item)`** → rótulo del telescopio: **nombre** propio puesto en Mi flota, o `vendor + modelo` en su defecto. Mismo rótulo en lista de Mi flota y en selector del simulador.
- **`flotaPrimero(flota, catalogo)`** → una sola lista para el selector de **telescopios** del simulador: delante los **de Mi flota** (copiados con `esFlota:true`, sin tocar la respuesta de la API), detrás el **catálogo global**. Solo hay flota con sesión iniciada, de ahí la diferencia entre lo que ve un visitante y un observador logueado. Oculares y auxiliares no pasan por aquí: salen del catálogo global tal cual.
- **`rotuloNave(item)`** → cómo se presenta el telescopio en la **bitácora**: **medidas siempre** (`18" f/4.5`, apertura en pulgadas y relación focal, que es como se reconoce un tubo en el campo) y **delante su nombre propio si lo tiene** (`Excalibur · 18" f/4.5`). Relación focal sale de `f_ratio` y, si no viene, de `focal/apertura`. Sin medidas queda el nombre o `nombreTelescopio()`. Lo usa la ficha del mapa (ver `mapa/README.md`), que recibe las medidas del tubo en `OBSERVACIONES[].nave`.
- **Test:** `scripts/test_equipo.js` fija el contrato de los cuatro.

## Resolvedor de objeto por nombre

Ciclo «el observador escribe un nombre → salen su RA y su Dec»: espera a que deje de teclear, no repite la misma consulta, no pisa las coordenadas escritas a mano y avisa del estado.

- **Fuente única:** `resources/js/bitacora-base.js`, `BitacoraBase.resolutorNombre({onResuelto, onEstado, puedeEscribir, espera})` → `{programar(nombre)}`. Sin DOM: cada pantalla cablea su input y escribe sus textos; el módulo solo emite `'buscando' | 'nada' | 'error'`.
- **Consumidores:** **simulador de oculares** (modo «Cualquier objeto») y **formulario de registro** (autocompletado de RA/Dec de objetos no-Messier).
- **Transporte único:** el resolvedor Sesame del CDS, directo desde el navegador (sirve `Access-Control-Allow-Origin: *`). No hay proxy ni sesión de por medio, y Sesame resuelve los alias por su cuenta («M3», «Messier 3», «NGC 6826», «Barnard 33»). El endpoint `/coordenadas` del plugin, que era el camino del formulario y exigía login, se ha eliminado por no tener consumidores.
- **No confundir con `/resolver`** (`bitacora_resolver_objeto`, público): eso es «nombre → [[objeto del mapa]]» con distancia, tipo y color, y lo usa el buscador del mapa. Otro concepto, otro módulo.
- **Tests:** `scripts/test_sesame.js` fija el parseo de la respuesta; `scripts/test_resolutor.js`, el ciclo (espera, deduplicado y guarda), con `fetch` de mentira y sin red.
