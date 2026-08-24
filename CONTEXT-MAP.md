# Context Map — Bitácora Estelar

Repo multi-contexto. Lee solo el CONTEXT.md del contexto que tocas, más este raíz si el término no está allí.

## Contextos

- **Sistema (raíz)** → `CONTEXT.md`
  Términos compartidos por varios contextos: modelo de color Gaia, equipo del observador, resolvedor de objeto por nombre. Decisiones sistema-wide (formato OAL, dominio `bitacoraestelar.app`) en `docs/adr/`, hoy vacío: ninguna decisión cruza todavía los tres contextos.

- **Registro** (`registro/`) → `registro/CONTEXT.md`
  Observación → entrada → imagen, base, viaje interestelar, astrometría de la sesión, cielo (SQM/IR).

- **Mapa** (`mapa/`) → `mapa/CONTEXT.md`
  Objeto del mapa, clasificación (`tipo`+color), distancia al Sol, ruta de un viaje, vecindario solar.

- **Simulador óptico** (`simulador_ocular/`) → `simulador_ocular/CONTEXT.md`
  Cadena fotométrica, modelo de cúmulos (crowding, SBF), cadena de la placa, adquisición y caché de Gaia/PS1/DSS, escala del dibujo, pares dobles. Decisiones propias en `simulador_ocular/docs/adr/`.

- **Backend WordPress** (`resources/plugins/bitacora-registro/`) — sin CONTEXT.md propio: implementa las reglas de Registro y Mapa (tablas `{prefix}bitacora*`, API `/wp-json/bitacora/v1/*`); su vocabulario ya vive en esos dos ficheros.

## Glosario compartido

Un término lo define el CONTEXT.md del contexto que lo POSEE; los demás lo enlazan con `[[nombre]]` sin redefinirlo. Si un término se usa en 2+ contextos sin dueño claro (p. ej. modelo de color Gaia), vive en el `CONTEXT.md` raíz.

## ADRs

`docs/adr/` en raíz es para decisiones de sistema (cruzan contexto). Decisiones de un solo contexto viven en `<contexto>/docs/adr/` — hoy solo `simulador_ocular/docs/adr/`, con las 15 ADRs de fotometría y modelo de cúmulos, todas anteriores a este mapa. Antes de decidir algo en un contexto, revisa sus ADRs; si tu cambio contradice uno, dilo explícito en vez de pisarlo en silencio.
