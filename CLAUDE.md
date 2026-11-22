@AGENTS.md

# Solo para Claude Code

Lo común a cualquier agente (comandos, arquitectura, PRs) está en `AGENTS.md`, importado arriba.

## Estilo de sesión

En este proyecto, usar en cada sesión:

- skill `caveman` en modo **full** (`/caveman full`)
- skill `ponytail` en modo **ultra** (`/ponytail ultra`)
- skill `i-have-adhd:i-have-adhd` activa (`/i-have-adhd:i-have-adhd`)

## LSP

Servidores: vtsls (JS), intelephense (PHP, trae stubs de WordPress), pyright (`scripts/`), html/css. Config en `jsconfig.json` y `pyrightconfig.json`.

- Para navegar código usa LSP (definición, referencias, hover) antes que `grep`.
- Antes de renombrar o cambiar parámetros en código compartido: `findReferences`.
- Tras editar `.js`, `.php`, `.html` o `.py`: mira los diagnósticos del fichero editado. Un error nuevo se arregla; los previos no son tuyos.
- JS va con `checkJs: false`: con `true` salen ~5800 errores (sobre todo `window.X` y `require`). Para tipar un fichero, añádele `// @ts-check` y déjalo limpio.
