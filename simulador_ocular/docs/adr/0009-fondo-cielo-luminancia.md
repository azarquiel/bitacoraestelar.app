# 9. El fondo de cielo se pinta como luminancia codificada en sRGB

- Estado: aceptado
- Fecha: 2026-08-17
- Ámbito: `resources/js/bitacora-gaia-render.js` (`nivelCielo`, `FOT.SB_CIELO_*`)

## Contexto

El simulador de campo ocular calcula el brillo superficial del cielo tal como
llega al ojo (`SBe`, mag/arcsec², ya atenuado por la pupila de salida y por la
transmisión del tubo) y lo pinta como gris de fondo del canvas.

La conversión era una rampa lineal en magnitudes sobre los **códigos** 0–255:

```js
var t = (SB_CIELO_NEGRO - SBe) / (SB_CIELO_NEGRO - SB_CIELO_BLANCO); // 24,5 → 16,5
return clamp(255 * t, 0, 255);
```

Con SQM 22 (18", Nagler T5 31 mm, 61x, pupila de salida 7,5 mm, T = 0,75) el
fondo salía en el código **70**. Un código sRGB de 70 emite el **6,4 % de la
luminancia del blanco**: un gris franco, para un cielo de 22 mag/arcsec² que en
la Tierra es de los mejores que existen. Visualmente el simulador parecía un
cielo suburbano de SQM 19–20, y había que subir a SQM 24 —valor inalcanzable—
para obtener el aspecto que corresponde a 22.

## Decisión

La luminancia de pantalla del fondo es **proporcional al flujo del cielo**, y
esa luminancia se codifica en sRGB antes de escribirla en el canvas:

```js
function nivelCielo(SBe) {
  return codigoSRGB(Math.pow(10, -0.4 * (SBe - FOT.SB_CIELO_BLANCO)));
}
```

`SB_CIELO_BLANCO = 16,5` queda como único parámetro: el cielo que llega a blanco
puro. `SB_CIELO_NEGRO` desaparece — la curva tiende a 0 asintóticamente y no
necesita un suelo artificial.

## Por qué NO era un punto cero mal calibrado

La primera hipótesis natural (y la que traía el reporte) es un `REF` desplazado
2 magnitudes en una conversión del tipo `10^(-0,4·(SBe − REF))`. No lo era: el
error no es un desplazamiento, es una **forma de curva equivocada**. Las dos
curvas coinciden exactamente en el anclaje y se separan más cuanto más oscuro es
el cielo:

| SBe (mag/arcsec²) | código antiguo | código nuevo |
|---|---|---|
| 16,5 | 255 | 255 |
| 18,0 | 207 | 135 |
| 20,0 | 143 | 60 |
| 22,3 | 70 | 15 |
| 24,3 | 6 | 2 |

Ningún `REF` arregla eso, porque ninguna traslación convierte una recta en una
exponencial. El "desfase de ~2 magnitudes" que se percibía era la lectura local
de esa divergencia en la zona donde se estaba mirando.

## Lección de diseño

**Un código de canvas no es luminancia.** Cualquier magnitud astronómica que se
reparta "linealmente sobre 0–255" está repartiendo sobre una escala ya
gamma-codificada (código ≈ L^(1/2,2)), y el resultado sube el extremo oscuro muy
por encima de lo que representa. El comentario que justificaba la rampa decía
que "la saturación hacia el negro la aporta la gamma del monitor": es al revés,
la gamma del monitor es justamente lo que hay que aplicar a propósito, y no
aplicarla es lo que dejaba el negro en gris.

Se usa la codificación sRGB de la norma (con su tramo lineal) y no un `1/2,2` a
secas precisamente porque el problema vive en el extremo oscuro, que es donde
ambas expresiones se separan.

## Consecuencias

- Con SQM 22 y pupila de salida grande el fondo cae al 0,47 % de luminancia:
  casi negro, como pedía el criterio de aceptación.
- La curva es monótona y sin suelo duro: dos cielos distintos ya no colapsan en
  el mismo negro, solo se acercan. La discriminación entre cielos excelentes
  (21,2 / 21,4 / 21,6 / 21,8 a 158x) se conserva, aunque comprimida a ~1 nivel
  por cada 0,2 mag, frente a los ~6 de antes. Esa compresión es real, no un
  efecto lateral: es lo que hace una pantalla con luminancias tan bajas.
- El **objeto** sigue pintándose como `nivelFondo + valorDeFlujo(...)`, y
  `valorDeFlujo` sí es lineal en magnitudes sobre códigos (`FOT.SB_NEGRO −
  SB_BLANCO = 11,5 mag`). Es decir: las dos escalas ya no son la misma.
  Bajar el pedestal de 70 a 15 conservando el incremento en códigos hace que el
  contraste del objeto sobre el cielo salga **sobreestimado ~2x**, donde antes
  salía **subestimado ~2x** (para un objeto 1 mag sobre el cielo: contraste real
  1,51; antes 0,79; ahora 2,9). Se acepta a sabiendas: el error cambia de signo,
  no de tamaño.

## Alternativa descartada: unificar también la escala del objeto

Lo coherente sería pintar el píxel completo como
`codigoSRGB(k · (Fcielo + Fobj))`, con una sola ley para fondo y objeto. Se
descarta por ahora porque toda la cadena calibrada del render vive en la escala
"códigos lineales en magnitudes": `CFG.rangoBrillo` (rampa de alfa de los
sprites de estrella), `FOT.GAMMA_PERCEPTUAL` y `realzarPerceptual`,
`UMBRAL_DETALLE = 12` de `adaptacionLocal`, y el anclaje de la ley H2c validado
en campo. Cambiar la función de transferencia de salida los invalida a todos a
la vez. Es una refactorización de la fotometría entera, no un bugfix; el reporte
que motiva este ADR es sobre el fondo.

## Verificación

`scripts/test_difuso.js`, sección "El fondo de cielo pinta luminancia, no
códigos": comprueba que una magnitud de cielo es exactamente un factor 10^(−0,4)
de luminancia de pantalla, que SQM 22 a 61x queda por debajo del 1 % de
luminancia, y que la curva es monótona de SQM 24,5 a 14. La sección 1 del mismo
fichero invierte la curva para verificar la física de la pupila de salida y se
actualizó con la inversa nueva.
