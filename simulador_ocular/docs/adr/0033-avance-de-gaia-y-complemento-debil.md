# 0033 — Avance de Gaia y complemento débil

Fecha: 2026-11-08 · Estado: aceptada · Deroga en parte: ADR 0014

## Contexto

Al cerrar #429, el log del 24-10 al 07-11 enseña que la cola de las sondas (13-30 s) ya no
viene de proveedores colgados. Son respuestas 200 de GAVO que tardan en calcular, en campos
**no densos** y de 0,4 a 4,6 MB. El coste lo pone el cono, no las filas, así que ninguna
reordenación de consultas lo baja. En los campos densos, antes del primer 202 se pierden
~41 s (y hasta 150 s si CDS se cuelga) en una sonda y una segura síncronas que, según el
log, fallan 33 de cada 34 veces.

Medido en GAVO (`gaia.dr3lite`, 2026-11-08), Gaia DR3 hasta G < 15 son 36,9 M de filas,
~445 MB a 12 B por fila. Hay 4,5 GB libres en el servidor.

## Decisión

1. **Avance de Gaia.** Un subconjunto local de Gaia DR3 con G < 15, generado *offline* y
   guardado en ficheros estáticos, uno por celda HEALPix nested de nivel 6, fuera de la
   caché LRU. Cada fichero lleva en la cabecera el histograma de profundidad de su celda
   (recuentos por tramos de 0,5 mag hasta G 21) y después las filas.
2. **Pista de densidad.** El proxy suma los histogramas de las celdas que tocan el cono.
   Si las filas previstas del complemento pasan de 130 000 (el techo de 200 000 entre 1,5,
   porque las celdas cubren más área que el cono), va directo a la cadena asíncrona. Una
   pista equivocada solo cuesta tiempo: si dice «no denso» y la sonda toca techo, el flujo
   del ADR 0014 sigue igual.
3. **Complemento débil.** Con `desde=15`, el proxy solo pide 15 ≤ G ≤ `mag`. El cliente une
   el Avance con el complemento y obtiene el **conjunto completo**, que es lo único que
   entra en `consultar()` y en la física. Sin `desde` vale el contrato de hoy, que sirve
   de respaldo cuando el Avance no carga.
4. **Campos densos.** El `TOP 40000` de la segura y de la cadena asíncrona se aplica al
   complemento: las estrellas individuales son el Avance más esas 40 000. El corte del velo
   lo sigue poniendo el `TOP` y nunca la frontera G = 15, que es un límite computacional.
5. **Pintado progresivo dentro de `vistaGaia`.** Hay un callback opcional
   `alAvance(r)`. La vista provisional es solo de estrellas, sin capa difusa, sin velo y
   sin `magLimite`, y lleva aviso. Es parcial y lo dice (ADR 0004). La promesa sigue
   significando «vista completa».

## Qué cambia del ADR 0014

Sigue en pie el régimen por volumen real: la sonda, el techo y la segura deciden. Lo que
cambia: (a) la posición del campo ya no se ignora, porque funciona como **pista**, nunca
como regla; (b) el proxy deja de traer el conjunto completo cuando el cliente tiene el
Avance.

## Opciones descartadas

- **Latitud galáctica como estimador.** Con la misma *b*, el polvo hace variar la densidad
  un orden de magnitud.
- **Avance que solo se sustituye** (el proxy sigue trayendo G < 15). Es más simple, pero
  el usuario eligió ahorrar tráfico: un 45 % de las filas en consultas a `mag` 16, un 9 %
  a `mag` 18 y un 2 % a `mag` 20.
- **Unir en el proxy.** El navegador seguiría bajando dos veces las estrellas brillantes.
- **Solo velo en los densos (sin `ORDER BY`).** Pondría el corte en G 15, un límite
  computacional usado como físico: en M6 con `mag` 17 convertiría en niebla estrellas que
  se ven resueltas.
- **Avance hasta G < 16 (~935 MB).** Duplica disco, subida y tamaño de celda, y en el
  plano galáctico obligaría a bajar a nivel 7 u 8.
- **Base local completa hasta `mag` 20.** Son más de mil millones de filas: no cabe.

## Consecuencias

- La clave de la caché incluye `desde`. Mientras convivan entradas viejas y nuevas, la
  caché (hoy al 99,4 %) se llenará más rápido.
- El render depende de dos fuentes. La frontera G = 15 tiene que ser la misma con
  `dr3lite` (GAVO) y con `I/355/gaiadr3` (CDS), sin duplicar ni perder estrellas.
- El estudio de celdas del ADR 0012 (NO PASA) no se contradice: falló la adquisición
  **en frío y en tiempo de petición**. El Avance no adquiere nada en tiempo de petición,
  y el mismo informe E4 midió las celdas ya en caché en 17-203 ms.
