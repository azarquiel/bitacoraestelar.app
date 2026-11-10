# Comandos del Proyecto

## Tests (Scripts Propios)
- Tests Backend (PHP): `php scripts/test_backend.php` (reemplazar por archivo específico si varía)
- Tests Frontend (Node): `node scripts/test_frontend.js` (reemplazar por archivo específico si varía)

## Scripts de Datos (Python)
- Generar Catálogos: `python scripts/gen_catalogs.py` (ejecutar scripts individuales `gen_*.py`)

# Guía de Arquitectura y Estilo

## Backend (WordPress & PHP)
- Ubicación: Todo el código personalizado vive en `resources/plugins/bitacora-registro`.
- Base de Datos: Tablas personalizadas `{prefix}bitacora` y `{prefix}bitacora_objetos`. Usa `$wpdb`. Prefijo de tablas en producción: `dgrh_` (`dgrh_bitacora_observaciones`, `dgrh_bitacora_entradas`...). Base de datos: `mdgboybv_yfbj1`.
- API: Endpoints REST bajo el namespace `/wp-json/bitacora/v1/*`.
- Producción: El dominio base es `bitacoraestelar.app`.
- **Versión del plugin**: al modificar el plugin, sube el número en la cabecera `Version:` de `bitacora-registro.php`. Es el único sitio: la constante `BITACORA_VERSION` se lee de ahí (`get_file_data`) y es la que dispara la migración automática de esquema (`bitacora_comprobar_version()` en `plugins_loaded`). Sin subirla, las columnas/tablas nuevas no se crean en producción y las peticiones que las usan fallan con 500.
- **Ficheros del plugin**: `bitacora-registro.php` (esquema, rutas REST y manejadores) carga el resto con `require_once`: `bitacora-catalogos.php` (SIMBAD, Gaia, VizieR, OAC, NED), `bitacora-ficha-docx.php`, `bitacora-admin.php` (escritorio y semillas), `bitacora-oal.php`, `bitacora-viaje.php`, `bitacora-distancia.php`, `bitacora-slug.php`, `bitacora-equipo-prestado.php`. Al desplegar se suben TODOS: si falta uno, el plugin entero cae con un fatal.

## Frontend (Vanilla Web)
- Sin Bundlers: No uses `npm`, `webpack`, `vite` ni dependencias externas. Es JS/HTML nativo.
- Estado Global: Módulos expuestos en el objeto `window` (ej: `window.BitacoraGaiaColor`).
- Enrutamiento/Páginas:
  - `mapa/` -> Lógica del mapa celeste.
  - `simulador_ocular/` -> Simulador de óptica.
  - `registro/*-wordpress.html` -> Formularios de registro integrados.

## Integraciones y Datos Externos
- Formato de entrada/salida para observaciones: Open Astronomy Log (OAL) en XML.
- APIs Astronómicas consultadas: SIMBAD, VizieR, Gaia, NED, Open Astronomy Catalog y Pan-STARRS (PS1 para imágenes).

# Headroom & Performance Constraints
- **Zero-Boilerplate:** Sin explicaciones ni saludos. Solo código directo.
- **Output Limit:** Genera solo funciones atómicas o bloques diff. No reescribas archivos enteros.
- **DOM & Events:** Cachea selectores. Usa delegación de eventos en `registro/`.
- **Render Loop:** Usa `requestAnimationFrame` en `mapa/` y `simulador_ocular/`. Prohibido `setInterval`.
- **Network:** Implementa caché en variables de `window` para respuestas de APIs astronómicas.
- **Headroom Shaper Policy:** Operar estrictamente bajo HEADROOM_OUTPUT_SHAPER=1 en nivel L3 (conclusiones directas, omitir ratios y justificaciones excepto si se solicitan).

## Estilo de sesión

En este proyecto, usar en cada sesión:

- skill `caveman` en modo **full** (`/caveman full`)
- skill `ponytail` en modo **ultra** (`/ponytail ultra`)
- skill `i-have-adhd:i-have-adhd` activa (`/i-have-adhd:i-have-adhd`)

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`azarquiel/bitacoraestelar.app`), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Multi-context: `CONTEXT-MAP.md` at the repo root points to one `CONTEXT.md` per context (`registro/`, `mapa/`, `simulador_ocular/`); root `docs/adr/` for system-wide decisions, `<context>/docs/adr/` for context-scoped ones. See `docs/agents/domain.md`.
