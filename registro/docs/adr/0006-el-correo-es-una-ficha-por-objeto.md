# 0006 · El correo es una ficha por objeto

Fecha: 2026-09-27
Estado: aceptado

## Contexto

Las salidas se comparten en listas de correo (p. ej. la campaña Herschel 400
de `astronomia_sevilla@googlegroups.com`). Los observadores escriben ahí una
ficha por objeto, a mano. El botón **Correo** de *Mi bitácora* sacaba en cambio
una tabla Hora / Objeto / Aumento / Lo que se vio: perdía los párrafos de la
descripción, no decía el ocular y daba la hora de pared.

Estructura de la plantilla de referencia, un correo real de julio de 2012
(`[Campaña_Herschel_400] Julio`), sin datos personales:

```
Observador: <nombre apellidos>
Fecha: 11 de Julio de 2012
Lugar: <sitio>
Seeing: 3/5 (…)
Transparencia 5/5
Telescopio: <modelo>

NGC 6633
Ocular: Nagler 31mm Aumentos: 58x
Hora: 21:30 UT
<línea corta de impresión/localización>
<párrafo de descripción>
```

Decidido en el issue #386.

## Decisión

`textoDe()` escribe esa ficha. Sigue siendo el único escritor del correo, y
las ADR 0003 y 0004 no cambian.

1. **Sustituye a la tabla.** No hay un tercer formato.
2. **El cielo lleva su escala a la vista**, nunca «x/5» (allí 5 = mejor; en
   Antoniadi 1 = excelente): `Seeing: 3 (Antoniadi, regular)`,
   `Transparencia: Transparente (IR -20)`, `Cielo: SQM … mag/arcsec² · Bortle …`.
   Cada línea sale solo si hay dato, con el primer valor no nulo de la noche
   (ADR 0001).
3. **Horas en UT**, las de las fichas y la de la ventana, con el mismo
   `instante()`/`husoDe()` que el `<begin>` del XML. **Sin huso no se escribe
   «UT»**: sale la hora de pared, porque el correo no puede afirmar un UT que no
   conoce.
4. **Telescopio en la cabecera si la salida usa uno solo**; si no, cada ficha
   lleva el suyo. El rótulo es `telescopios[].modelo`.
5. **Una ficha por objeto, un subbloque por entrada** (`Ocular · Aumentos` +
   descripción). La hora va en el primero; en otro solo si le falta la línea
   de equipo.
6. **Se agrupa por `nocheId` + `clave(objeto)`**, la identidad del importador
   (ADR 0002). No se toca el `ESQUEMA`: vale igual para el estado del
   servidor, un XML reimportado o la caja de pegar.
7. **La descripción conserva sus párrafos:** línea en blanco = `<p>`, salto
   simple = `<br>`, escapando antes. El título-ocular de la entrada no se
   pinta.
8. **Observador** en la cabecera; una ficha firmada por otro lleva su línea.
9. **La crónica va primero**, con sus párrafos. No se genera saludo,
   despedida ni firma (ADR 0004).
10. **HTML mínimo y semántico:** `h2`, `h3`, `p`. Sin `<table>`, sin estilos
    en línea. La pestaña que lo envuelve no declara tipografía, para que lo
    copiado llegue a Gmail con la letra del mensaje.
11. **Orden cronológico real** con el convenio de mediodía; sin hora, al
    final; orden estable.
12. **Las campañas quedan fuera:** son capa de datos del mapa
    (`mapa/docs/adr/0001`) que el estado no conoce.

Las etiquetas de seeing y las bandas de transparencia son copia de las de la
app (el motor no puede cargar `BitacoraBase`); `scripts/test_oal_exportar.js`
ata las dos copias.

## Consecuencias

- Quien pegaba la tabla cambia de costumbre. Se acepta: la tabla era un
  subconjunto peor de la ficha.
- El correo y el XML cuentan la misma hora, porque salen de la misma función.
