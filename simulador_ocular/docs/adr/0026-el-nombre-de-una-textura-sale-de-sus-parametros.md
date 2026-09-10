# El nombre de una textura DSO sale de sus parámetros, no de sus píxeles

La URL de una textura lleva su versión dentro (`NGC_4486.d6572d0d.png`) y se
sirve como inmutable: es lo que permite la cabecera de caché larga de #209. Esa
versión la calcula `version()` en `scripts/gen_dso_texturas.js`, y es el sha256
de **los parámetros que determinan los píxeles** —generador, sondeo, banda,
nombre, RA, dec, lado, resolución de salida y codificación—, recortado a 8 hex.
No entra ni un píxel.

#259 sacó la consecuencia a la luz: si el contenido cambia sin que cambie ningún
parámetro, dos imágenes distintas comparten nombre de fichero, y con la URL
declarada inmutable el navegador que se guardó la primera no ve nunca la
segunda. Este ADR fija por qué el hash se queda como está y qué se exige a
cambio.

## Lo que se midió

NGC 4486 (M87), tres descargas del mismo objeto con la caché borrada entre una y
otra, y las tres escritas con el mismo nombre `NGC_4486.d6572d0d`:

| corrida | ausencia en el parche | forma del hueco |
|---|---|---|
| banco del 2026-09-09 | 33,84 % | bloque rectangular arriba |
| 1.ª regeneración | 28,49 % | bloque rectangular abajo |
| 2.ª regeneración | 0,0036 % | ninguno |

La causa no es el hash: es que una skycell que fallaba se descartaba en silencio
(#259). Pero el hash es lo que hacía **irreparable** el resultado: la textura
corregida no puede llegar al navegador que cacheó la mutilada.

La alternativa —hash del contenido— se descartó por lo que cuesta, no por lo que
promete. `yaResuelto()` decide si un objeto está hecho **antes** de pedir nada, y
esa es toda la reanudación de la tirada del banco: con el nombre derivado de los
píxeles, saber si un objeto ya está escrito exige descargar su parche entero, así
que una tirada interrumpida no podría continuar donde la dejaron y cada objeto ya
resuelto costaría su descarga igual.

## Decidido

1. **El nombre sigue saliendo de los parámetros.** La reanudabilidad de la
   tirada del banco es la razón, y se documenta en el propio `version()`.
2. **Lo que protege no es el nombre, es la puerta.** Un parche al que le falta
   una celda no se publica: sale con motivo `celda-perdida` (#259). El contenido
   bajo un nombre fijo no puede cambiar por una descarga a medias, que es el
   único modo conocido en que cambiaba.
3. **Republicar una textura corregida exige cambiarle el nombre a mano.** Subir
   `GENERADOR` es la vía normal: renombra el banco entero, que es lo correcto
   cuando la corrección es del generador. Sobrescribir el fichero conservando el
   nombre **no vale** y no es una operación que este repositorio admita.
4. **Mientras `dso/` no esté desplegado, el nombre repetido no muerde**, y por
   eso NGC 4486 se regeneró sobre su propio nombre al cerrar #259. Desde que
   #209 sirva la cabecera inmutable, deja de valer: a partir de ahí manda el
   punto 3.

## Consecuencias

- La cabecera inmutable de #209 puede ir adelante: el riesgo que la amenazaba
  —contenido distinto bajo el mismo nombre— lo cierra la puerta de
  `celda-perdida`, no una promesa sobre el hash.
- Un fallo futuro que cambie los píxeles sin cambiar los parámetros vuelve a
  quedar fuera del alcance del nombre. La red que queda es el barrido de bloques
  (`scripts/harness_bloques_ausencia.js`) y las cifras de auditoría del sidecar
  (`celdas.pedidas` / `celdas.cosidas`), no la versión del fichero.
- Corregir **un solo objeto** es caro a propósito: exige subir `GENERADOR` y, con
  ello, republicar el banco entero. Si algún día ese coste no se puede pagar, la
  salida no es sobrescribir: es añadir al hash el parámetro que de verdad haya
  cambiado, y eso es otro ADR.
