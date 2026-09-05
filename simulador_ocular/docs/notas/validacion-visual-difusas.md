# Validación visual de la capa difusa

Entregable 10.4 del objetivo del catálogo de texturas DSO. Hermana de
`recaptura-golden-difusas.md`: aquella dice cómo se mueven los bits con
atribución, esta dice cómo se mira lo que los bits no cuentan —morfología, tamaño
angular, respuesta de la rampa al fondo, artefactos— sin que la comparación
dependa de la memoria de nadie.

**No hay sistema nuevo.** Se usa `scripts/harness_vistas_np.js`, que ya pinta el
buffer difuso de producción (`lib_parche_produccion` + `ps1PintarParche`) con el
mapeo de nivel de `pintarFot`, sin capa de estrellas ni realce local.

## Las tres cosas que había que decidir

El objetivo pedía «las vistas del banco estratificado, antes/después». Tal cual,
no era ejecutable: el banco son 69 objetos, cada vista necesita Gaia y solo había
10 CSV, y el harness escribía siempre al mismo directorio, así que la segunda
pasada borraba la primera. Decidido el 2026-09-05:

### 1 · Qué se mira: 18 objetos, 26 vistas — no los 69

Setenta y ocho PNG que nadie abre no son validación. El banco de 69 existe para
que los **listones** se midan sobre modos de fallo y cuantiles; el ojo humano se
gasta donde puede ver algo que un número no dice. Las vistas son las 14 que el
harness ya tenía —las cuatro galaxias golden, M57 en cinco configuraciones, M78,
NGC 7635, NGC 6888, M1— más doce que cubren modos de fallo sin representar:

| Objeto | Por qué se mira |
|---|---|
| NGC 7008, Abell 12 | mordida de máscara al 43,6 % y al 79,8 %: donde la textura puede perder el objeto entero |
| NGC 4486 (M87) | núcleo saturado en el stack |
| NGC 4826 (M64) | banda de polvo: estructura fina que una codificación torpe aplana |
| NGC 253 | borde de cobertura (δ = −25,3°) |
| NGC 1982 (M43) | **77,8 % de ausencia en la escena**, el peor caso medido en la fase 0 |
| NGC 3310, NGC 205 | los extremos de lado, 1,57′ y 20′: donde la fase 2 más cambia la resolución |

Cuatro de ellos (NGC 7008, M87, M43, NGC 205) se miran además en
{203 mm · 100× · SQM 20,5}, para que la segunda configuración no sea solo de las
vistas viejas.

En la **fase 2** se añaden, como pide el objetivo, los seis representantes de
cuantil a 80 y 914 mm: allí lo que se juzga es si la apertura se nota, y eso solo
se ve comparando aperturas extremas.

Un objeto entra en esta lista con su motivo escrito, igual que en el banco. Si
aparece un modo de fallo sin representar, se añade aquí y se dice por qué.

### 2 · De dónde sale Gaia: pineada solo la del golden

Una vista **no exige entrada estable**: eso lo exige el golden por ser bit a bit.
Pinear los doce objetos nuevos costaría ~12 MB en git por una propiedad que no se
usa. Así que:

- Los **11 del banco golden** van a `scripts/fixtures/gaia/`, versionados
  (decisión 9.1). A NGC 7008 y Abell 12 les faltaba su CSV y ya están en la lista
  de `gen_fixtures_gaia.js`.
- Los **solo-mirar** van a `$BITACORA_GAIA_DIR` o al temporal del sistema, como
  los FITS: `node scripts/gen_fixtures_gaia.js --vistas`.

El harness busca primero en las fixtures y luego en la caché. Si no encuentra
ninguna, **salta la vista con su nombre** en vez de pintar un objeto sin máscara
de estrellas, que sería una vista distinta de la de producción disfrazada de
igual.

### 3 · Cómo se guarda el «antes»: con etiqueta

```
node scripts/harness_vistas_np.js --etiqueta antes     # ANTES de tocar nada
… el cambio …
node scripts/harness_vistas_np.js --etiqueta despues
```

Cada etiqueta escribe a `.scratch/vistas-np-<etiqueta>/`. Sin etiqueta se usa el
directorio de siempre. El «antes» hay que sacarlo **antes**: no se puede
reconstruir después, porque el código que lo pintaba ya no está.

## El procedimiento

1. **Antes de tocar nada**, `--etiqueta antes`. Si faltan vistas por Gaia, se
   generan primero: una comparación a la que le falten objetos en un lado no es
   una comparación.
2. Se aplica el cambio.
3. `--etiqueta despues`.
4. Se comparan **los dos directorios, imagen a imagen**, y también la línea de
   resumen que el harness imprime por vista: `θint`, campo, nivel de fondo,
   píxeles con objeto y nivel máximo. Esa línea es la que convierte «se ve
   parecido» en algo revisable, y la que caza un cambio que el ojo no pilla.
5. Se escribe el veredicto en el informe de la fase, en `docs/validacion/`, con
   la tabla de abajo. Las imágenes que muestren algo se copian al informe; las
   demás no, `.scratch/` no se versiona.

## Qué se busca, dicho antes de mirar

Mirar sin lista es encontrar lo que uno espera. Lo que descalifica una vista:

- **Halos** alrededor del objeto que antes no estaban.
- **Zonas negras** dentro del objeto: son el síntoma de la ausencia mal decidida
  (`ps1Opacidad` sobre píxeles NaN), y hay precedentes en M51 y M81.
- **Sobrecontraste**: núcleo saturado a nivel 255 donde antes había estructura.
- **Bordes rectos o cuadrados**, que delatan el parche o su máscara.
- **Punteado o malla**, que delata la mezcla o el remuestreo.
- **El objeto que desaparece** o que ocupa un tamaño angular distinto con el
  mismo aumento.

Y el criterio que **no** vale: «se ve mejor». El ADR 0004 lo prohíbe y aquí
también. Una vista distinta que no case con una causa física declarada es un
fallo hasta que se explique, aunque sea más bonita.

## Tabla del veredicto

> Validación visual · fase _ · fecha · etiquetas `antes` / `despues`
>
> | Vista | θint | px con objeto (antes → después) | nivel máx | Artefactos | Veredicto |
> |---|---|---|---|---|---|
> | NGC5194_D457_M190_sqm21.2 | | | | ninguno / … | igual / cambia por … |
>
> Una fila por PNG. «Cambia» exige nombrar la causa; si no se sabe cuál es, el
> veredicto es «sin explicar» y eso bloquea la fase.

## Lo que esta validación no es

- **No es un test.** No devuelve un código de salida ni entra en la suite: los
  bits los vigila `test_golden_difusas.js` y los umbrales, los listones del
  ADR 0024. Esto mira lo que ninguno de los dos puede ver.
- **No sustituye al golden.** Dos vistas idénticas al ojo pueden diferir en
  millones de bits, y al revés: un cambio dentro de L1.1 puede ser invisible.
  Se corren los dos.
