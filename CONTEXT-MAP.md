# Context Map — Bitácora Estelar

Repo multi-contexto. Lee solo el CONTEXT.md del contexto que tocas, más este raíz si el término no está allí.

## Contextos

- **Sistema (raíz)** → `CONTEXT.md`
  Términos compartidos por varios contextos: modelo de color Gaia, equipo del observador, resolvedor de objeto por nombre. Decisiones sistema-wide (formato OAL, dominio `bitacoraestelar.app`) en `docs/adr/`.

- **Registro** (`registro/`) → `registro/CONTEXT.md`
  Observación → entrada → imagen, base, viaje interestelar, astrometría de la sesión, cielo (SQM/IR).

- **Mapa** (`mapa/`) → `mapa/CONTEXT.md`
  Objeto del mapa, clasificación (`tipo`+color), distancia al Sol, ruta de un viaje, vecindario solar.

- **Simulador óptico** (`simulador_ocular/`) → `simulador_ocular/CONTEXT.md`
  Cadena fotométrica, modelo de cúmulos (crowding, SBF), cadena de la placa, adquisición y caché de Gaia/PS1/DSS, escala del dibujo, pares dobles.

- **Backend WordPress** (`resources/plugins/bitacora-registro/`) — sin CONTEXT.md propio: implementa las reglas de Registro y Mapa (tablas `{prefix}bitacora*`, API `/wp-json/bitacora/v1/*`); su vocabulario ya vive en esos dos ficheros.

## Glosario compartido

Un término lo define el CONTEXT.md del contexto que lo POSEE; los demás lo enlazan con `[[nombre]]` sin redefinirlo. Si un término se usa en 2+ contextos sin dueño claro (p. ej. modelo de color Gaia), vive en el `CONTEXT.md` raíz.

## ADRs

`docs/adr/` en raíz cubre todo el repo (no hay `docs/adr/` por contexto todavía). Antes de decidir algo en un contexto, revisa los ADRs que lo tocan; si tu cambio contradice uno, dilo explícito en vez de pisarlo en silencio.
