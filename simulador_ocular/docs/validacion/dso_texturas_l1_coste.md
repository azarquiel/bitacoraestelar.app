# L1.3 — el coste en el navegador, medido sobre los 4 golden

Fecha: 2026-09-08. Listón: L1.3 del ADR 0024 (fase 1), más los dos topes de
memoria que pide la US-3 (#195). Máquina: la del desarrollo (Darwin 25.6.0),
Chrome 152, servidor `php -S` con `PHP_CLI_SERVER_WORKERS=4`.

**Veredicto: L1.3 PASA en bytes y en memoria, y en tiempo depende del enlace.**

| Condición | Umbral | Medido | Veredicto |
|---|---|---|---|
| Bytes transferidos | ≤ 0,5× los del FITS | 0,473–0,478× en los 4 | ✅ |
| Memoria por parche decodificado | ≤ 16 MB | 4,00 MB (1024² float32) | ✅ |
| Campo de Virgo | ≤ 150 MB | 10 parches · 40,0 MB | ✅ |
| Tiempo de `ps1LeerTextura` | ≤ el del FITS por proxy en caliente | 0,51–0,52× por 4G rápida; 2,1–4,1× por bucle local | ⚠️ ver abajo |

La condición de tiempo **no se cumple contra un servidor en la misma máquina** y
se cumple con margen en cuanto hay un enlace de por medio. No es un empate de
ruido: los dos regímenes están medidos, la causa está separada en red y CPU, y
el punto donde se cruzan sale de esos números. Lo que sigue lo cuenta, y al
final está la decisión, que es la que el criterio 4 de la #207 pedía tomar.

## Cómo se reproduce

```
php -S localhost:8080 scripts/dev_servidor_ocular.php      # PHP_CLI_SERVER_WORKERS=4
abrir http://localhost:8080/scripts/harness_l1_coste.html  # bucle local
abrir http://localhost:8080/scripts/harness_l1_coste.html?reps=3   # con la red frenada
```

La pasada frenada se hizo con la red emulada de Chrome en **4G rápida** (perfil
de DevTools) desde el propio navegador; el harness no sabe nada de eso, mide
igual en los dos casos.

El harness es una página, no un script de Node, porque el listón dice «en el
navegador»: `performance.now()`, `PerformanceResourceTiming` y el decodificador
de PNG del propio Chrome son parte de lo que se está midiendo. Lo que hace:

- Los 4 golden (M51, M101, M104, M81), 9 repeticiones por objeto y camino
  (3 en la pasada frenada, que cuesta segundos por repetición), mediana.
- Camino textura: `ps1LeerTextura`, la función de producción, sobre los PNG-16
  y sus sidecar servidos por el servidor de desarrollo.
- Camino FITS: `ps1UrlParche` + `parseFITS`, también de producción, contra
  `ps1-proxy.php` **en caliente**: antes de medir cada objeto hay una petición
  de precalentado que no se cronometra, así que `cache-ps1/` ya tiene el FITS y
  el proxy no paga la ida a STScI. Es la lectura favorable al FITS, que es la
  que el listón exige.
- Las dos rutas llevan un `cb` distinto en cada repetición: ninguna se sirve de
  la caché HTTP del navegador. El `cb` no entra en la clave del proxy
  (`ra, dec, lado, salida, banda`), así que el FITS sigue saliendo de su caché.
- También hay un precalentado de la textura sin medir. Sin él, el primer objeto
  de la lista pagaba la compilación del códec y salía 4× más lento que los
  otros tres; con él, M51 sigue siendo el más ruidoso pero ya no por eso.
- Bytes: `transferSize` de las entradas de `PerformanceResourceTiming`
  (cabeceras y cuerpo ya comprimidos), que es lo que de verdad viaja.
- Red y CPU: el intervalo que cubre las peticiones sale de las mismas entradas;
  lo que quede del tiempo total es CPU (inflar el PNG y aplicar el `sinh`, o dar
  la vuelta al orden de bytes del FITS).

Ninguna ley se reimplementa (ADR 0008): las dos lecturas son las del navegador.

## Lo medido

**Bucle local** (servidor en la misma máquina, 9 repeticiones, mediana):

| Objeto | Textura | red + CPU | FITS | red + CPU | ×bytes | ×tiempo |
|---|---|---|---|---|---|---|
| M51 | 155,4 ms · 1965 kB | 10,8 + 144,9 | 38,0 ms · 4118 kB | 19,1 + 17,4 | 0,477 | 4,09 |
| M101 | 68,1 ms · 1963 kB | 11,6 + 57,6 | 29,7 ms · 4115 kB | 20,6 + 10,5 | 0,477 | 2,29 |
| M104 | 65,9 ms · 1948 kB | 10,2 + 53,6 | 32,0 ms · 4121 kB | 18,6 + 13,5 | 0,473 | 2,06 |
| M81 | 72,1 ms · 1967 kB | 11,1 + 62,8 | 28,5 ms · 4115 kB | 18,0 + 10,2 | 0,478 | 2,53 |

**4G rápida** (misma máquina, red emulada, 3 repeticiones, mediana):

| Objeto | Textura | red + CPU | FITS | red + CPU | ×bytes | ×tiempo |
|---|---|---|---|---|---|---|
| M51 | 2323,8 ms | 2187,0 + 136,4 | 4477,1 ms | 4376,4 + 77,3 | 0,477 | 0,52 |
| M101 | 2268,0 ms | 2167,9 + 89,6 | 4404,5 ms | 4374,9 + 46,6 | 0,477 | 0,51 |
| M104 | 2296,3 ms | 2145,3 + 151,0 | 4389,3 ms | 4364,8 + 28,0 | 0,473 | 0,52 |
| M81 | 2299,3 ms | 2169,4 + 120,9 | 4454,9 ms | 4410,5 + 46,3 | 0,478 | 0,52 |

Las repeticiones de la pasada frenada caen dentro del 4 % unas de otras; las del
bucle local se mueven mucho más (M51, entre 66 y 203 ms), porque ahí el tiempo
es CPU de una máquina de trabajo y no transporte.

## Por qué el bucle local da la vuelta al resultado

La textura y el FITS reparten el coste al revés:

- **Bytes**: 1,95 MB de textura contra 4,12 MB de FITS, 0,47–0,48×. Es un dato
  del formato, no de la máquina: el FITS son 1024² float32 sin comprimir
  (4,00 MB) más cabecera, y el PNG-16 va comprimido.
- **CPU**: decodificar la textura cuesta 54–65 ms (M51, el más ruidoso, 145) y
  leer el FITS cuesta 10–17 ms. La diferencia, 40–55 ms, es lo que cuesta
  inflar el IDAT y aplicar el `sinh` píxel a píxel; el FITS solo da la vuelta a
  los bytes.

Ese reparto tiene un punto de empate, y el harness lo calcula por objeto:

```
empate = (bytes_FITS − bytes_textura) · 8 / (cpu_textura − cpu_FITS)
```

Sale **138–444 Mbps** (334, 374 y 444 Mbps en los tres objetos estables; los 138
de M51 vienen de su CPU ruidosa). Por debajo de eso la textura llega antes, por
encima gana el FITS. Un servidor en la misma máquina está muy por encima: la red
le cuesta 10 ms para 2 MB, que son ~1,6 Gbps. Por 4G rápida (≈ 9 Mbps de
bajada) la textura llega en la mitad de tiempo, que es justo lo que predice el
cálculo.

Dicho de otra forma: contra `localhost` el listón mide **solo** la
decodificación, porque el transporte que la textura ahorra no cuesta nada. La
pregunta que L1.3 quería contestar —«¿cuesta la decodificación en JS más de lo
que ahorra?»— tiene respuesta numérica: cuesta 40–55 ms y ahorra 2,17 MB, así
que **ahorra más que cuesta en cualquier enlace por debajo de ~350 Mbps**, y
las texturas se sirven por internet, no por bucle local.

## Decisión

Se documenta y se decide, como el criterio 4 de la #207 y la nota de la #195
dejaban previsto: **la sustitución de la fuente sigue adelante**. El listón se da
por cumplido en su lectura de producción (enlace real) y por incumplido en la
lectura de bucle local, que no modela a ningún observador. No se toca el
listón prerregistrado: se anota aquí que su redacción no fijaba el enlace, y con
qué enlace pasa y con cuál no.

## Lo que esto deja apuntado para la fase 2

La CPU de la decodificación va con el número de píxeles. La fase 2 sube el lado
a 2048 px en los objetos que lo pidan, y eso multiplica por 4 el parche: ~220 ms
de decodificación por parche y 16,0 MB de memoria, justo en el tope de L2.4. El
campo de Virgo medido aquí son 10 parches; a 2048 px serían 160 MB, **por encima
del tope de 150 MB**. No es un problema de la fase 1 —donde el campo entero son
40 MB—, pero es el número que L2.4 tendrá que mirar de frente, y la vía de
escape del tope de 1794 px que el ADR ya tiene escrita existe para esto.
