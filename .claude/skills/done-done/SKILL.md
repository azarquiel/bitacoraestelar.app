---
name: done-done
description: Cierra un ticket ya quemado con /burn y aceptado por su dueño — documentación al día, PR, merge con CI en verde, ticket cerrado, épica y relacionados avisados.
argument-hint: <número de ticket>
disable-model-invocation: true
---

# done-done

Argumento: número de ticket (`$ARGUMENTS`). Sin número: pídelo y para.

Lanzar `/done-done` es el acto de **aceptación** del dueño: `/burn` dejó el ticket «verificado, pendiente de aceptación», y quien escribe este comando ya lo probó en producción. Done-done = todo lo de abajo hecho; un paso a medias deja el ticket abierto.

Las trampas de `gh` en esta máquina están al final (`## Trampas`). Léelas antes del paso 3.

Orden del proyecto: los ficheros se suben a producción y se prueban desde la rama, **antes** del merge. Por eso aquí no se despliega nada.

## 1. Puerta de entrada

- Rama del ticket, todo commiteado, sin nada en `git status`.
- Lee el último comentario del ticket que empiece por `## Informe de /burn`: de él salen la tabla de criterios, el riesgo, la deuda y las notas de retro. Si no existe, pasa el eje Spec de `mattpocock-skills:code-review` contra `main` y pide al usuario las notas de retro.
- Cada acceptance criterion del ticket está **cumplido**.

Si algún criterio está parcial o no cumplido, para y ofrece dos salidas: volver a `/burn`, o abrir un ticket de seguimiento con lo que falta (enlazado a este) y cerrar este con el alcance reducido. Decide el usuario.

Hecho cuando: rama limpia y cada criterio cumplido o movido a un ticket de seguimiento con número.

## 2. Documentación

Lanza un subagente **documentalista ágil** (Agile Modeling: documentación *just barely good enough*, docs-as-code, se actualiza en el mismo PR que el código). Pásale `git diff main...HEAD` y este encargo:

- Para cada fichero cambiado, sube por sus carpetas y lista el `README.md` y el `CONTEXT.md` más cercanos; añade `AGENTS.md` si cambió un comando, una convención o un fichero del plugin.
- Para cada documento de la lista: ¿miente ahora (comando, ruta, comportamiento, cifra que ya no vale) o le falta algo que un lector necesita para usar lo nuevo? Si sí, propón el cambio mínimo; si no, «al día».
- Un término de dominio nuevo o cambiado va a `CONTEXT.md` con `mattpocock-skills:domain-modeling`. Una decisión difícil de revertir va a un ADR (lo pide la casilla ADR de la plantilla de PR).
- No documentar lo que el código o `git log` ya dicen.

Aplica sus cambios y haz commit. Hecho cuando: cada documento de la lista está marcado «al día» o tiene su cambio commiteado.

## 3. Deuda técnica

Toda deuda que se queda tiene ticket; ninguna vive solo en un comentario. Parte de la sección «Deuda técnica» del informe de `/burn` y vuelve a pasar `git diff main...HEAD | grep '^+.*shortcut:'` por si hay más.

Para cada atajo:

- Abre una issue con la etiqueta `deuda-tecnica` (créala si no existe): qué limita, cuándo pagarla (el disparador del `shortcut:`), `fichero:línea`, y `Nace de #$ARGUMENTS`. Si el ticket tiene épica, hazla sub-issue de la misma épica.
- Añade `(#N)` al final de su comentario `shortcut:` en el código, para que quien lo lea llegue a la issue.

Commitea. Hecho cuando: cada `shortcut:` nuevo del diff lleva `(#N)` y su issue existe.

## 4. PR

Busca una PR abierta de la rama (`gh api repos/{owner}/{repo}/pulls?head=azarquiel:<rama>`). Si existe, actualiza su cuerpo; si no, créala. El cuerpo:

- Es **`.github/pull_request_template.md`**: lo exige el job «Plantilla de PR».
- Primera línea, en inglés: `Closes #$ARGUMENTS.` (`Cierra` no autocierra).
- «Qué cambia» se escribe con `mattpocock-skills:pr`: su Summary, Evidence y Merge Danger van como subapartados de «Qué cambia». Reutiliza la sección «Riesgo» del informe de `/burn` para Merge Danger.
- «Conocimiento»: las dos casillas `[x]` con ruta o «no aplica: motivo» (ver AGENTS.md).

Escribe el cuerpo a fichero y valida con `node scripts/plantilla_pr.js <fichero>`. La PR no va en borrador. Hecho cuando: PR abierta, no borrador, plantilla en verde.

## 5. Merge

Espera a que terminen todos los checks de la PR. Si alguno sale rojo: si está en `ESPERADOS` de `scripts/bateria.js`, sigue; si no, para e informa. Jamás `--admin`, jamás push a `main`.

Con todo en verde: merge por API (`PUT repos/{owner}/{repo}/pulls/<n>/merge`, `merge_method=merge`), comprueba `state: closed` y `merged: true`, y borra la rama remota. Hecho cuando: PR mergeada y rama remota borrada.

## 6. Ticket

- Reescribe el cuerpo del ticket marcando cada criterio como `- [x] N.` (los AC son listas numeradas).
- Comentario de cierre: qué se entregó (en lenguaje de producto), PR y commit de merge, ficheros subidos a producción, riesgo, issues de deuda y tickets de seguimiento. Termina con `## Notas de retro`: las del informe de `/burn` y, en las mismas cinco líneas (Sorpresa, Fricción, Se escapó, Lección fijada, Sesión), lo que haya pasado en este cierre, con `$CLAUDE_CODE_SESSION_ID` de esta sesión.
- Si sigue abierto, ciérralo (`state=closed`, `state_reason=completed`).
- Tablero: muévelo a **Done** (IDs en la memoria «IDs del tablero de proyecto»; si no la tienes, búscalos con GraphQL `projectsV2`).

Hecho cuando: ticket cerrado, AC marcados, comentario publicado, tablero en Done.

## 7. Épica y relacionados

- **Padre**: la sub-issue de GitHub (`GET repos/{owner}/{repo}/issues/$ARGUMENTS/parent`) o la épica que cite el cuerpo. En ella: marca el hijo en su lista de tareas, si la tiene, y comenta en 2-3 líneas qué desbloquea este cierre para la épica. Si ya no le quedan hijos abiertos, propón cerrarla; no la cierres tú.
- **Relacionados**: cada issue citada en el cuerpo o en los comentarios del ticket que siga abierta. Comenta solo lo que le afecta (una decisión tomada, un dato medido, un bloqueo que cae), con enlace a la PR. Si no le afecta nada, no comentes.

Hecho cuando: cada padre y cada relacionado tiene comentario o está anotado como «sin nada que decirle».

## 8. Informe

Texto plano, corto: PR y merge, ticket cerrado, documentos tocados, issues de deuda abiertas, issues comentadas, tickets de seguimiento propuestos (de «Siguientes pasos» del informe de `/burn`), y si la casilla «Lección» de la PR apunta a algo que haya que vigilar. Cierra con `Estado: done-done` o, si algo quedó sin hacer, con lo que falta.

## Para la retrospectiva

Las notas de retro viven en los comentarios de cierre de los tickets. Para una retrospectiva de un periodo, lanza `/retro` y pásale como fuentes los tickets que salen de:

`GH_REPO=azarquiel/bitacoraestelar.app gh api -X GET search/issues -f q='repo:azarquiel/bitacoraestelar.app is:issue is:closed closed:>=AAAA-MM-DD "Notas de retro" in:comments' --jq '.items[].number'`

y los logs de sus sesiones (`~/.claude/projects/*/<sesión>.jsonl`). La deuda pendiente: issues abiertas con la etiqueta `deuda-tecnica`.

## Trampas

- `gh` es x86_64 y el `git` del sistema pasa por xcrun: exporta `GH_REPO=azarquiel/bitacoraestelar.app` y usa `gh api`, no `gh pr create`/`gh pr merge`/`gh issue view`.
- Desde un worktree, el guardián rechaza texto largo en línea: cuerpos a fichero con `-F body=@<ruta>`, GraphQL en un script de Python en `$CLAUDE_JOB_DIR/tmp`, y nada de `&&` entre `git` y `gh`.
- `gh pr merge` desde un worktree falla al volver a `main` aunque el merge ya esté hecho: comprueba el estado antes de reintentar.
- Mergear un borrador da `405`. Quitar el borrador solo por GraphQL (`markPullRequestReadyForReview`).
- IDs de opción del tablero con `-f`, nunca `-F` (el de Done son solo dígitos).
- El merge borra el worktree de la rama: todo commiteado antes del paso 5, y lo que siga (pasos 6-8) son llamadas a la API, sin tocar ficheros.
- Si el clasificador de permisos bloquea cerrar o mover el tablero, deja el script listo y pide al usuario que lo lance con `!`.
