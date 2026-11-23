---
name: burn
description: Implementa un ticket de GitHub de punta a punta y cierra con un informe ejecutivo (valor de negocio, ficheros a producción, qué probar en producción, siguientes pasos). Usar cuando el usuario escribe /burn <número> o pide "quemar" un ticket.
argument-hint: <número de ticket>
---

# burn

Argumento: número de ticket (`$ARGUMENTS`). Sin número: pídelo y para.

## 1. Implementar

Sigue la skill `mattpocock-skills:implement` sobre el ticket (`gh issue view $ARGUMENTS`). Esa skill tiene `disable-model-invocation: true` y el Skill tool la rechaza, así que aplica aquí su contenido:

- Usa `mattpocock-skills:tdd` donde se pueda, en las costuras acordadas.
- Pasa a menudo el typecheck y los tests sueltos (`node scripts/test_<nombre>.js`); la batería completa una vez al final (comandos en AGENTS.md).
- Haz commit en la rama actual.

No sigas al paso 2 hasta que esté implementado y los tests en verde.

## 2. Revisar

Invoca `mattpocock-skills:code-review` sin dejar que pregunte nada:

- Punto fijo: `main`.
- Spec: el ticket, `gh issue view $ARGUMENTS`.
- Pide al eje Spec que, además de su informe, marque cada acceptance criterion del ticket como cumplido / parcial / no cumplido, con la prueba (test o `fichero:línea`). Esa lista es la sección 3 del informe.

Qué hacer con los hallazgos:

- Fallo del eje Spec (criterio no cumplido, o implementado mal): arréglalo, vuelve a pasar los tests y haz commit antes del paso 3.
- Smell del eje Standards (siempre juicio, no violación): no lo arregles; va a «Siguientes pasos».
- Violación de un estándar documentado: arréglala.

## 3. Informe final

Texto plano, claro, sin jerga. Estas secciones, en este orden:

**Informe ejecutivo — ticket #N: <título>**

**TL;DR:** 🟢/🟡/🔴 + una frase con lo que cambia para el usuario. El color sale de hechos, no de opinión:

- 🟢 todos los criterios cumplidos y la batería en verde (salvo `ESPERADOS`).
- 🟡 algún criterio parcial, o deuda `shortcut:` nueva.
- 🔴 algún criterio no cumplido, o un rojo nuevo en la batería.

1. **Valor de negocio.** 2-4 frases: qué problema del usuario resuelve y por qué importa.
2. **Qué se ha implementado.** Lista corta de cambios, en lenguaje de producto.
3. **Acceptance criteria.** Cada criterio: cumplido / parcial / no cumplido + motivo breve.
4. **Ficheros a subir a producción.** Ruta exacta de cada fichero desplegable que cambió (`git diff --name-only <base>...HEAD`), excluyendo tests, scripts, docs y ADR. Si toca el plugin de WordPress, recuerda subir TODOS sus ficheros y comprobar que `Version:` de `bitacora-registro.php` subió (ver AGENTS.md).
5. **Riesgo.** Dos líneas:
   - **Puerta:** de doble sentido (se revierte subiendo los ficheros anteriores) o de un solo sentido (migración de esquema, datos borrados o reescritos, URL o formato OAL que ya usan otros). Si es de un solo sentido, di qué no se puede deshacer.
   - **Alcance:** qué parte deja de funcionar si sale mal (p. ej. «solo el simulador de dobles», «todo el plugin»).
6. **Qué probar en producción.** Solo si hay algo visible o una ganancia para el usuario final; si no, una línea: «Sin impacto visible para el usuario final». Si lo hay, paso a paso y detallado: URL en `bitacoraestelar.app`, qué hacer, qué debe verse, y qué indicaría fallo.
7. **Siguientes pasos.** 3-5 pasos concretos de desarrollo, ordenados por prioridad (criterios parciales, tickets de seguimiento a abrir).
8. **Deuda técnica.** Cada atajo que queda: qué limita, cuándo pagarlo, y dónde está (`fichero:línea` del comentario `shortcut:`). Busca los nuevos con `git diff main...HEAD | grep '^+.*shortcut:'`. Si no hay, «Sin deuda nueva».
9. **Notas de retro.** Sobre el proceso, no sobre el código; una línea cada una, «nada» si no hubo:
   - **Sorpresa:** lo que el ticket o el plan no preveían.
   - **Fricción:** dónde se fue el tiempo (buscar, una herramienta, un test lento, una trampa de `gh`), con la cifra si la hay.
   - **Se escapó:** un fallo que llegó a la revisión o a producción, y qué check lo habría cazado antes.
   - **Lección fijada:** ruta del test o de la línea de AGENTS.md que la evita.
   - **Sesión:** `$CLAUDE_CODE_SESSION_ID`, para que `/retro` lea el log.

Cierra el informe con esta línea, tal cual: «Estado: verificado, pendiente de aceptación por el dueño del ticket». La verificación la hace el eje Spec; aceptar es decisión del dueño tras probar en producción. No cierres el ticket ni lo des por aceptado.

## 4. Publicar

Publica el informe completo como comentario en el ticket, con `## Informe de /burn` como primer título: escríbelo a fichero y usa `GH_REPO=azarquiel/bitacoraestelar.app gh api repos/azarquiel/bitacoraestelar.app/issues/$ARGUMENTS/comments -F body=@<fichero>`. `/done-done` lo lee de ahí, y es lo que queda para la retrospectiva.
