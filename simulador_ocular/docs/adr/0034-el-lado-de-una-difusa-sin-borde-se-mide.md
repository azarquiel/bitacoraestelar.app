# El lado del parche de una difusa sin borde real se mide, no se deduce de r_e

Decidido el 2026-11-08, con las medidas del diagnóstico de M78 delante y el
test `scripts/test_costura_parches.js` en rojo antes de tocar nada.

## El problema, en una línea

Junto a M78 el simulador pintaba un **canto recto** y, al otro lado, luz más
brillante que la propia M78. No era Gaia ni una tesela mal colocada: eran los
recortes PS1 de NGC 2064, NGC 2067 y M78, cada uno pintado dentro de su
cuadrado y cortando nebulosa en el borde.

## Lo que se midió

- **Los cuadrados casi no se solapan.** Solo 2067∩M78 comparten una esquina
  de 0,7′×1,1′, y 2064 queda a 0,33′ de M78. Los escalones (61 px y 54
  niveles a 190×; 31 px y 57 niveles con un 203 mm a 100×) son **cantos
  libres**: no hay luz contada dos veces, así que repartir los píxeles entre
  vecinos no los toca.
- **Las ganancias difieren ×11 y ×17.** Las tres filas acaban en el mismo μ
  medio (~21,4, suelo `MU_MIN` de `gen_nebulosas.py`), así que la misma luz del
  complejo sale anclada a tres niveles distintos.
- **El lado de catálogo no contiene el objeto.** M78 tiene 4,5′ en el OpenNGC
  (unos 8′×6′ reales). El lado de su recorte (4,05′) acaba con el marco a 6,5σ
  sobre el cielo vecino. En el banco hay **12 difusas** (11 RfN y 1 HII) con
  el marco entero por encima del suelo de ruido, y alguna más por tramos.
- **La mediana del lado no basta.** El canto este de NGC 2064 corta 2′ de un
  lado de 9′, y la mediana de ese lado queda bajo el suelo. Hay que juzgarlo
  por tramos.

## Decisión

1. **El lado de una difusa sin borde real (HII, EmN, RfN) se mide.** El
   generador prueba una escalera determinista de lados (`ps1EscaleraLados`:
   el de catálogo, ×1,5 por peldaño, y el tope de 20′ siempre como último) y se
   queda con el primero cuyo marco **llega al cielo** (`ps1MarcoLlegaAlCielo`):
   - el marco es el mismo del 6 % de `ps1Cielo`, troceado en cuadrados de su
     propio grosor;
   - cada cuadrado debe quedar con su mediana bajo el suelo del anclaje,
     `cielo + kRuido·σ`.

   Las compactas (PN, SNR) y las galaxias no cambian: tienen borde real o
   isofota.
2. **El cielo es el del campo vecino del lado de catálogo** (ADR 0028), no el
   de un vecino del lado agrandado, que en un complejo grande (Orión B) cae en
   otra nebulosa. Lo que el ADR 0028 exige es la misma ″/px, porque σ es por
   píxel. Si un peldaño cambia de escala (el de 20′ va a 0,586″/px), se vuelve a
   pedir **ese mismo recorte vecino** a la escala del peldaño. Es una
   desviación consciente de «mismo lado» del ADR 0028.
3. **Si ningún peldaño llega, se publica el tope** con `marco.llega = false` en
   el sidecar, junto con la escalera entera y el peor cuadrado de cada peldaño.
   Hoy solo consta ahí: el informe del banco (`textoInforme`) todavía no lo
   lista. Sin cielo vecino con que medir, se queda el lado de catálogo y el
   sidecar dice por qué.
4. **Un parche medido cubre a las difusas sin borde real cuyo centro contiene.**
   La cubierta sale `fila` con motivo `cubierta` y no pinta: su luz va dentro
   de la imagen del dueño.
   - La cobertura se resuelve **sobre el banco entero**, al escribir el
     manifiesto (`cubiertas()`), porque un `--solo` no sabe el lado final de
     sus vecinas.
   - Orden de dueños, puro de datos: primero el que llega al cielo, luego el
     lado mayor y luego el nombre.
   - Un objeto cubierto no cubre a nadie.
   - Una cubierta **avisa**: se pinta dentro de la imagen de la vecina que la
     contiene, con el brillo de esa, y su nebulosidad propia puede no verse. No
     menciona servicios ni falta de imagen, porque la imagen está.
5. **El runtime pinta con el lado de la textura.** El manifiesto lleva el lado
   exacto en la columna 7 (`ps1LadoDeFila`). `ancho·escalaAs/60` no vale:
   difiere en la 4.ª cifra y movería bits de todo el banco. Sin columna, el
   lado sale del catálogo como antes, así que el banco viejo y el regenerado
   conviven.
6. **El dueño se ancla a su propia magnitud.** Sumar el flujo de las cubiertas
   metería el 7,54 de NGC 2064, que en una RfN del OpenNGC suele ser la estrella
   que la ilumina.

## Resultado en M78

| Objeto | Peldaños | Publicado |
|---|---|---|
| NGC2068 (M78) | 4,05 · 6,07 · 9,11 · 13,67 no llegan; **20′ llega** | `3f6f8c5d`, 2048 px, 0,586″/px |
| NGC2067 | ninguno llega | `43dea8ab` a 20′, `llega: false` → **cubierta** por M78 |
| NGC2064 | ninguno llega | `43adab87` a 20′, `llega: false` → **cubierta** por M78 |

Con el manifiesto nuevo, `test_costura_parches.js` sale verde:
- **Cantos:** el más largo baja a 5–6 px, contra 61 y 31 antes.
- **Visibilidad de M78:** 96 % y 76 % de r<1′ sobre el fondo.
- **Controles:** M57 y M1 siguen en verde.

## Lo que cuesta

- **La luz de NGC 2064 y NGC 2067 deja de verse.** El parche de M78 reparte la
  magnitud de M78 por 20′, y la nebulosidad de las cubiertas queda bajo el
  umbral: centrado en cualquiera de las dos, 0 % de r<1′ sobre el fondo con
  457 mm a 190× y con 203 mm a 100×, sin canto en ninguno, y el aviso de
  `cubierta` lo dice. Es coherente (una sola ganancia, sin cantos) pero más
  pobre que el cielo. Si importa, la conversación es sobre las magnitudes de
  esas filas (ADR 0031, μ asumida), no sobre el pintado.
- **Las texturas de lado medido pesan más.** Una de 20′ son unos 7,8 MB frente
  a 0,4 MB.
- **El resto del banco no está regenerado.** Las otras difusas que este ADR
  alcanzaría (las 12 con el marco fuera, más las que fallen solo por tramos)
  siguen con su textura de la ley anterior hasta una tirada
  `node scripts/gen_dso_texturas.js --banco`. Una textura de la ley vieja no
  reanuda una clase que se mide (`yaResuelto(…, exigeMarco)`), así que la
  tirada las rehará.
- **Las estrellas brillantes en el marco cuentan como luz.** Solo cuesta lado
  (llevan a NGC 2064 y NGC 2067 al tope), nunca un canto.

## Enmienda (2026-11-08): las 11 que crecían seguro

El `--seco` corregido (PR #522) separó lo que esta ley cambia de lo que solo es
un PNG que falta en disco. Se regeneraron las 11 cuyo marco publicado ya estaba
sobre el suelo:

| Objeto | Lado antes → medido | Escala |
|---|---|---|
| NGC1788, NGC1999, NGC2247 | 1,80′ → 4,05′ | 0,500 |
| NGC2170 | 1,80′ → 6,075′ | 0,500 |
| NGC2245 | 1,80′ → 9,113′ | 0,500 |
| IC0435 | 3,12′ → 4,68′ | 0,500 |
| NGC6590 | 3,118′ → 4,677′ | 0,499 |
| NGC2182 | 2,205′ → 4,961′ | 0,500 |
| IC0466 | 1,50′ → 7,594′ | 0,500 |
| NGC2261 | 1,50′ → 11,391′ | 0,500 |
| NGC2327 | 1,50′ → 17,086′ | 0,501 |

Las 11 llegan al cielo, ninguna toca el tope, ninguna cubre a otra y ninguna
se solapa con otro parche del banco. El único solape que queda es M51 con
NGC 5195, galaxias, anterior a esta ley.

**Fallo encontrado en la primera tirada.**
- **Qué pasó:** cinco nebulosas (NGC 1788, 1999, 2170, 2245 y 2247) se
  quedaron en 2,70′ sin llegar al cielo.
- **Causa:** 1,80·1,5² = 4,050000000000001, y el `ceil` de `ps1SalidaParche`
  daba 487 px en vez de 486. La escala salía a 0,499 contra un vecino a
  0,500, la tolerancia absoluta de 1e-3 dejaba el peldaño sin juzgar y la
  escalera se paraba en el anterior.
- **Arreglo:**
  - los peldaños derivados se redondean a la milésima de minuto; el primero
    no, porque es el nombre de la textura vieja;
  - «misma escala» es ahora relativa, al 1 %;
  - `test_dso_texturas` vigila que ningún peldaño bajo el tope de píxeles se
    aparte más de un 0,2 % de 0,5″/px.

## Tests

- `scripts/test_costura_parches.js`: el síntoma, sobre la pantalla de
  `ps1CapaGalaxias`. Rojo en `c60b2a8`, verde con este ADR.
- `scripts/test_dso_texturas.js`, sección «El lado medido»: escalera, marco
  por cuadrados, cobertura y reanudación.
- `scripts/test_costura_parches.js` también centrado en NGC 2064 y NGC 2067:
  sin canto, y con el aviso de `cubierta`.
- `scripts/test_fuente_parche.js`: `cubierta` dice dónde se pinta, no habla de
  servicios ni de falta de imagen, y no pide nada.
