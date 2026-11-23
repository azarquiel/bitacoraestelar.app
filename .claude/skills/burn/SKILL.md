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
- Al terminar, revisa con `mattpocock-skills:code-review`.
- Haz commit en la rama actual.

No sigas al paso 2 hasta que esté implementado y los tests en verde.

## 2. Revisar acceptance criteria

Invoca la skill `agile-product-owner:agile-product-owner` pidiéndole que:

- lea el ticket (`gh issue view $ARGUMENTS`) y sus acceptance criteria;
- compare cada criterio con lo implementado (`git diff` contra la rama base);
- marque cada criterio como cumplido / parcial / no cumplido, con la prueba (test, fichero:línea).

## 3. Informe final

Texto plano, claro, sin jerga. Estas secciones, en este orden:

**Informe ejecutivo — ticket #N: <título>**

1. **Valor de negocio.** 2-4 frases: qué problema del usuario resuelve y por qué importa.
2. **Qué se ha implementado.** Lista corta de cambios, en lenguaje de producto.
3. **Acceptance criteria.** Cada criterio: cumplido / parcial / no cumplido + motivo breve.
4. **Ficheros a subir a producción.** Ruta exacta de cada fichero desplegable que cambió (`git diff --name-only <base>...HEAD`), excluyendo tests, scripts, docs y ADR. Si toca el plugin de WordPress, recuerda subir TODOS sus ficheros y comprobar que `Version:` de `bitacora-registro.php` subió (ver AGENTS.md).
5. **Qué probar en producción.** Solo si hay algo visible o una ganancia para el usuario final; si no, una línea: «Sin impacto visible para el usuario final». Si lo hay, paso a paso y detallado: URL en `bitacoraestelar.app`, qué hacer, qué debe verse, y qué indicaría fallo.
6. **Siguientes pasos.** 3-5 pasos concretos de desarrollo, ordenados por prioridad (criterios parciales, deuda `shortcut:`, tickets de seguimiento a abrir).
