# Comandos del Proyecto

## Tests (Scripts Propios)
- Tests Backend (PHP): `php scripts/test_backend.php` (reemplazar por archivo específico si varía)
- Tests Frontend (Node): `node scripts/test_frontend.js` (reemplazar por archivo específico si varía)

## Scripts de Datos (Python)
- Generar Catálogos: `python scripts/gen_catalogs.py` (ejecutar scripts individuales `gen_*.py`)

# Guía de Arquitectura y Estilo

## Backend (WordPress & PHP)
- Ubicación: Todo el código personalizado vive en `resources/plugins/bitacora-registro`.
- Base de Datos: Tablas personalizadas `{prefix}bitacora` y `{prefix}bitacora_objetos`. Usa `$wpdb`.
- API: Endpoints REST bajo el namespace `/wp-json/bitacora/v1/*`.
- Producción: El dominio base es `bitacoraestelar.app`.
- **Versión del plugin**: al modificar `bitacora-registro.php`, sube el número en DOS sitios: el comentario `Version:` de cabecera Y la constante `define('BITACORA_VERSION', ...)`. Solo la constante dispara la migración automática de esquema (`bitacora_comprobar_version()` en `plugins_loaded`); si se te olvida y solo subes la cabecera, las columnas/tablas nuevas no se crean en producción y las peticiones que las usan fallan con 500.

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

- skill `caveman` en modo **ultra** (`/caveman ultra`)
- skill `ponytail` en modo **ultra** (`/ponytail ultra`)

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`azarquiel/bitacoraestelar.app`), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Multi-context: `CONTEXT-MAP.md` at the repo root points to one `CONTEXT.md` per context (`registro/`, `mapa/`, `simulador_ocular/`); root `docs/adr/` for system-wide decisions, `<context>/docs/adr/` for context-scoped ones. See `docs/agents/domain.md`.
