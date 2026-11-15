# Bitácora Estelar — instrucciones para cualquier agente

Este fichero lo lee cualquier agente (Claude Code lo importa desde `CLAUDE.md`).
Lo específico de Claude va en `CLAUDE.md`.

## Comandos

- Tests Frontend (Node): `node scripts/bateria.js --rapida` (lo que corre CI); `node scripts/bateria.js` incluye los lentos; un test suelto: `node scripts/test_<nombre>.js`.
- Tests Backend (PHP): `for f in scripts/test_*.php; do php "$f" || echo "FALLA $f"; done`; sintaxis con `php -l`.
- Datos (Python): un generador por catálogo, `python3 scripts/gen_<catálogo>.py`. No hay generador global.
- Rojos conocidos: `ESPERADOS` en `scripts/bateria.js`, cada uno con su issue. `main` tiene que estar en verde salvo esos. Un rojo nuevo se arregla o se registra ahí con ticket; nunca se ignora.

## Arquitectura y estilo

### Backend (WordPress & PHP)
- Ubicación: Todo el código personalizado vive en `resources/plugins/bitacora-registro`.
- Base de Datos: Tablas personalizadas `{prefix}bitacora` y `{prefix}bitacora_objetos`. Usa `$wpdb`. Prefijo de tablas en producción: `dgrh_` (`dgrh_bitacora_observaciones`, `dgrh_bitacora_entradas`...). Base de datos: `mdgboybv_yfbj1`.
- API: Endpoints REST bajo el namespace `/wp-json/bitacora/v1/*`.
- Producción: El dominio base es `bitacoraestelar.app`.
- **Versión del plugin**: al modificar el plugin, sube el número en la cabecera `Version:` de `bitacora-registro.php`. Es el único sitio: la constante `BITACORA_VERSION` se lee de ahí (`get_file_data`) y es la que dispara la migración automática de esquema (`bitacora_comprobar_version()` en `plugins_loaded`). Sin subirla, las columnas/tablas nuevas no se crean en producción y las peticiones que las usan fallan con 500.
- **Ficheros del plugin**: `bitacora-registro.php` (esquema, rutas REST y manejadores) carga el resto con `require_once`: `bitacora-catalogos.php` (SIMBAD, Gaia, VizieR, OAC, NED), `bitacora-ficha-docx.php`, `bitacora-admin.php` (escritorio y semillas), `bitacora-oal.php`, `bitacora-viaje.php`, `bitacora-distancia.php`, `bitacora-slug.php`, `bitacora-equipo-prestado.php`. Al desplegar se suben TODOS: si falta uno, el plugin entero cae con un fatal.

### Frontend (Vanilla Web)
- Sin Bundlers: No uses `npm`, `webpack`, `vite` ni dependencias externas. Es JS/HTML nativo.
- Estado Global: Módulos expuestos en el objeto `window` (ej: `window.BitacoraGaiaColor`).
- Enrutamiento/Páginas:
  - `mapa/` -> Lógica del mapa celeste.
  - `simulador_ocular/` -> Simulador de óptica.
  - `registro/*-wordpress.html` -> Formularios de registro integrados.

### Integraciones y Datos Externos
- Formato de entrada/salida para observaciones: Open Astronomy Log (OAL) en XML.
- APIs Astronómicas consultadas: SIMBAD, VizieR, Gaia, NED, Open Astronomy Catalog y Pan-STARRS (PS1 para imágenes).

### Headroom & Performance Constraints
- **Zero-Boilerplate:** Sin explicaciones ni saludos. Solo código directo.
- **Output Limit:** Genera solo funciones atómicas o bloques diff. No reescribas archivos enteros.
- **DOM & Events:** Cachea selectores. Usa delegación de eventos en `registro/`.
- **Render Loop:** Usa `requestAnimationFrame` en `mapa/` y `simulador_ocular/`. Prohibido `setInterval`.
- **Network:** Implementa caché en variables de `window` para respuestas de APIs astronómicas.
- **Headroom Shaper Policy:** Operar estrictamente bajo HEADROOM_OUTPUT_SHAPER=1 en nivel L3 (conclusiones directas, omitir ratios y justificaciones excepto si se solicitan).

## Pull requests

Toda PR lleva el cuerpo de `.github/pull_request_template.md` completado por quien la abre, sin esperar a que lo rellene una persona:

1. Copia la plantilla y escribe «Qué cambia».
2. En «Conocimiento», marca `[x]` las dos casillas y contesta cada una:
   - **ADR:** si el cambio toma una decisión difícil de revertir, escribe el ADR (ver «Documentación del dominio») y pon su ruta; si no, «no aplica: motivo».
   - **Lección:** si hubo un error que se puede repetir, fíjalo con un test (mejor) o con una línea en este fichero, y pon su ruta; si no, «no aplica: motivo».
3. Comprueba en local: `node scripts/plantilla_pr.js cuerpo.md`.
4. Crea la PR con `gh pr create --body-file cuerpo.md`. Nunca con `--fill`: se salta la plantilla y el job «Plantilla de PR» sale rojo.

## Issues

Issues live in GitHub Issues (`azarquiel/bitacoraestelar.app`), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

## Documentación del dominio

Multi-context: `CONTEXT-MAP.md` at the repo root points to one `CONTEXT.md` per context (`registro/`, `mapa/`, `simulador_ocular/`); root `docs/adr/` for system-wide decisions, `<context>/docs/adr/` for context-scoped ones. See `docs/agents/domain.md`. Índice de los ADR del simulador: `simulador_ocular/docs/adr/README.md`.

## Estilo de respuesta

Respond terse like smart caveman. All technical substance stay. Only fluff die.

Rules:
- Drop: articles (a/an/the), filler (just/really/basically), pleasantries, hedging
- Fragments OK. Short synonyms. Technical terms exact. Code unchanged.
- Pattern: [thing] [action] [reason]. [next step].
- Not: "Sure! I'd be happy to help you with that."
- Yes: "Bug in auth middleware. Fix:"

Switch level: /caveman lite|full|ultra|wenyan
Stop: "stop caveman" or "normal mode"

Auto-Clarity: drop caveman for security warnings, irreversible actions, user confused. Resume after.

Boundaries: code/commits/PRs written normal.
