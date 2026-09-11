# Prerregistro — de dónde salen el cielo y la σ de un parche (#274)

Fecha: 2026-09-12. Comprometido ANTES de medir ninguna de las cuatro opciones y
antes de mirar el patrón de cielo lejano de ningún objeto. Ningún listón se
retoca tras ver la salida: si ninguna opción pasa, la ley se queda como está y
eso es el resultado (disciplina de los ADR 0012, 0015, 0022 y 0024).

## El hecho que lo motiva

`ps1Cielo` (`resources/js/bitacora-ps1.js:308`) y `ps1SigmaCielo` (`:328`) sacan
la mediana y la MAD·1,4826 del **marco exterior del 6 %** del parche, y dan por
supuesto que ese marco es cielo. Para las clases difusas no lo es: `r_e` =
0,30·semieje (`gen_nebulosas.py`) y el lado del parche es 6·`r_e` =
1,8·semieje = 0,9 ejes mayores, así que el marco cae dentro del objeto.

Lo ya medido (#263, `simulador_ocular/docs/validacion/emision_banda_o_ley.md`):
el suelo efectivo del banco va de 23 a 166 187 DN/arcsec² con el mismo `kRuido`
—9,65 mag de dispersión—; NGC 1788 apaga el 100 % de su propia extensión con σ =
796,9 DN; y en NGC 6888, con un parche de 40′, el cielo lejano está en −13 DN
contra los +18 DN que usa producción (0,27σ de sobresustracción).

Cuanto más brillante y extenso es el objeto, más alto se pone su propio umbral.
Ese es el lazo con el signo equivocado que se viene a medir.

## El patrón contra el que se juzga todo

Ninguna opción se compara con la ley vieja: comparar contra lo que sustituyes
mide parecido, no corrección. El patrón es el **cielo lejano**, medido sobre un
parche grande del mismo campo con el modo `--cielo` que ya existe.

- **Lado del patrón:** `min(40′, max(12′, 4·lado_producción))`. El tope de 40′ es
  el del mosaico de 2×2 skycells del proxy (`PS1_MAX_CELDAS = 4`).
- **Anillo de patrón:** píxeles con `r > 3·r_obj` **y** `r > 1,5·(medio lado de
  producción)`, donde `r_obj` es el borde real de la clase si lo tiene y `r_e` si
  no (la misma extensión que usa el generador para el veredicto de ausencia).
- **Estimadores del patrón:** mediana (cielo) y MAD·1,4826 (σ) de ese anillo,
  con las funciones de producción sobre el recorte, sin redefinir ninguna ley
  (ADR 0008).
- **Objeto sin anillo de patrón** —el que no deja sitio ni a 40′— se declara
  `sin patrón` y **no puntúa a favor ni en contra** de ninguna opción. Que no
  quepa es un resultado y se publica como tal.

Banco del patrón, fijado aquí y antes de mirarlo: los nueve objetos que la línea
base de #263 da con más del 40 % del área apagada —IC 0059, IC 0063, IC 0359A,
NGC 1788, NGC 2064, IC 0444, NGC 5457, NGC 6888, NGC 7293— más cuatro controles
de parche holgado —NGC 5194, NGC 3031, NGC 4594, NGC 4486—. Trece objetos.

## Las cuatro opciones, tal como se van a medir

- **E1 — agrandar el parche.** Subir `ladoFactor`, o cambiar la ley de `r_e`.
- **E2 — cielo y σ fuera de la extensión del objeto, dentro del mismo parche.**
  Mediana y MAD de los píxeles que `ps1FuenteEnEscena` deja fuera de la escena
  difusa (la isofota μ25 que ya delimita lo protegido).
- **E3 — σ ciega a la estructura.** MAD·1,4826 de las diferencias entre píxeles
  vecinos del parche entero, dividida por √2. No ve gradientes suaves y sí ve el
  ruido. E3 solo produce σ: se juzga emparejada con el cielo de E2, y donde E2 no
  tenga sitio, con el cielo actual.
- **E4 — cielo y σ de una petición aparte, más grande, al sidecar.**
  Numéricamente es el patrón; lo que se mide de E4 no es su exactitud sino su
  precio (qué republica).

## Listones (comprometidos)

Sobre el **conjunto afectado**, definido por regla y no por inspección: los
objetos cuyo marco del 6 % cae en la extensión del objeto en **≥ 20 %** de sus
píxeles. Se calcula después; la regla queda fijada aquí.

1. **σ (el metro).** Una opción PASA si, sobre los afectados con patrón,
   `mediana |log₂(σ_opción / σ_patrón)| ≤ 0,32` (o sea, dentro de ×1,25) **y**
   `máx |log₂(σ_opción / σ_patrón)| ≤ 1,0` (dentro de ×2).
2. **Cielo (el cero).** `|cielo_opción − cielo_patrón| ≤ 0,5·σ_patrón` en
   **todos** los afectados con patrón. Medio σ es la mitad de la sobresustracción
   que #263 midió como tolerable en NGC 6888 (0,27σ) y un tercio del propio
   `kRuido`.
3. **No regresión.** En los cuatro controles de parche holgado, el suelo efectivo
   (`kRuido·σ/escala²`) no se mueve más de **0,20 mag** y la fracción apagada de
   la extensión no se mueve más de **5 puntos porcentuales**, en ninguno de los
   dos sentidos.
4. **Control negativo (NGC 6888).** #263 midió que la Creciente no tiene
   estructura en ninguna banda: el % de píxeles > 3σ no decae con el radio (13,
   12, 18, 13, 10 % de 0,5 a 4 `r_e`). Con la σ de la opción, la razón entre el
   máximo de los anillos interiores (0–3 `r_e`) y el anillo exterior (3–4 `r_e`)
   debe quedarse **≤ 2,0**. Por encima de eso, la opción está amplificando ruido
   y queda descartada aunque pase 1 y 2.
5. **Coste, comprobado contra el hash y no por lectura.** Cada opción declara si
   republica el banco recalculando `version()` de `scripts/gen_dso_texturas.js`
   con sus parámetros (ADR 0026). Se publican los dos hashes, el de hoy y el de
   la opción, objeto a objeto.

Si pasan varias, gana la más barata en el criterio 5; a igualdad de coste, la de
menor `mediana |log₂(σ_opción/σ_patrón)|`. Si no pasa ninguna, la ley se queda
como está y se dice por qué.

## Lo que este ticket NO hace

No implementa. Ni `ps1Cielo` ni `ps1SigmaCielo` ni `cfg.ladoFactor` se tocan
aquí: la opción que gane se lleva su propio ticket, con su recaptura de golden y,
si es E1, con la republicación del banco que arrastra. Tampoco se toca `kRuido`,
que es lo que discute #273 y depende de que este metro esté bien.

## Reproducir

```
node scripts/harness_suelo_cielo.js --marco            # criterio: el marco del 6 % en los 68
node scripts/harness_suelo_cielo.js --patron           # el cielo lejano de los trece (red)
node scripts/harness_suelo_cielo.js --opciones         # E1–E4 contra el patrón
node scripts/harness_suelo_cielo.js --hash             # el coste de E1 y E4 contra version()
```
