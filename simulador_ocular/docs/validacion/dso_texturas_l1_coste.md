# L1.3 — el coste en el navegador, medido sobre los 4 golden

Fecha: 2026-09-08. Listón: L1.3 del ADR 0024 (fase 1), más los dos topes de
memoria que pide la US-3 (#195). Máquina: la del desarrollo (Darwin 25.6.0),
Chrome 152, servidor `php -S` con `PHP_CLI_SERVER_WORKERS=4`.

**Veredicto: L1.3 PASA en bytes y en memoria, y en tiempo depende del enlace.**

| Condición | Umbral | Medido | Veredicto |
|---|---|---|---|
| Bytes transferidos | ≤ 0,5× los del FITS | 0,473–0,478× en los 4 | ✅ |
| Memoria por parche decodificado | ≤ 16 MB | 4,00 MB (1024² float32) | ✅ |
| Campo de Virgo | ≤ 150 MB | 14 parches · 57,5 MB en el montón | ✅ |
| Tiempo de `ps1LeerTextura` | ≤ el del FITS por proxy en caliente | 0,55–0,64× por 4G rápida; 1,4–3,8× por bucle local | ⚠️ ver abajo |

La condición de tiempo **no se cumple contra un servidor en la misma máquina** y
se cumple con margen en cuanto hay un enlace de por medio. No es un empate de
ruido: los dos regímenes están medidos, la causa está separada en red y resto, y
el punto donde se cruzan sale de esos números. Lo que sigue lo cuenta, y al
final está la decisión, que es la que el criterio 4 de la #207 pedía tomar.

## Cómo se reproduce

```
php -S localhost:8080 scripts/dev_servidor_ocular.php      # PHP_CLI_SERVER_WORKERS=4
abrir http://localhost:8080/scripts/harness_l1_coste.html  # bucle local
abrir http://localhost:8080/scripts/harness_l1_coste.html  # y otra vez con la red frenada
```

La pasada frenada se hizo con la red emulada de Chrome en **4G rápida** (perfil
de DevTools) desde el propio navegador; el harness no sabe nada de eso, mide
igual en los dos casos.

El harness es una página, no un script de Node, porque el listón dice «en el
navegador»: `performance.now()`, `PerformanceResourceTiming` y el decodificador
de PNG del propio Chrome son parte de lo que se está midiendo. Lo que hace:

- Los 4 golden (M51, M101, M104, M81), 9 repeticiones por objeto y camino en
  las dos pasadas, mediana (`?reps=N` las baja, pero aquí no se usó).
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
- Red y **resto**: el intervalo que cubre las peticiones sale de las mismas
  entradas, y lo que sobra del total se llama «resto», no «CPU». Ahí dentro
  está el trabajo de verdad (inflar el PNG y aplicar el `sinh`, o dar la vuelta
  al orden de bytes del FITS) pero también lo que ocurre antes del primer
  `startTime`: encolado, resolución, la promesa esperando. La textura pide dos
  ficheros y el FITS uno, así que ese sobrante le cae algo más caro a la
  textura: el resto es una **cota superior** de lo que cuesta decodificar, no
  una medida limpia de CPU.
- Memoria del campo de Virgo: **medida**, no multiplicada. Se decodifican tantos
  parches como objetos tiene el campo, se conservan vivos y se mira lo que crece
  `performance.memory.usedJSHeapSize`. Multiplicar 4 MB por el número de objetos
  habría sido una identidad que no puede fallar y que además ignora lo que la
  decodificación pide de más. Los parches se leen de las texturas de los golden,
  porque en la fase 1 no todas las galaxias del campo están publicadas y todos
  los parches miden lo mismo (`cfg.salida`): uno vale por otro para pesar.

Ninguna ley se reimplementa (ADR 0008): las dos lecturas son las del navegador.

**El campo de Virgo es el que nombra la spec**: «NGC 4374/4406 y vecinas»
(ADR 0024, L2.4), centrado en el punto medio de esas dos y con lado 120′. Salen
**14 parches** —NGC 4374, 4388, 4402, 4406, 4413, 4425, 4435, 4438, 4440, 4458,
4459, 4461, 4473 y 4477— y quién cae dentro lo decide `ps1GalaxiasDelCampo`, la
función de la capa. Centrarlo en M87 daría 10 y dejaría fuera justo a las dos
que dan nombre al listón; el recuento es sensible al centro, así que se usa el
que la spec escribió y no el que sale mejor.

## Lo medido

Las dos pasadas llevan 9 repeticiones por objeto y camino, y las dos dan la
misma memoria: 4,00 MB por parche y 14 parches en el campo de Virgo, 57,5 MB
medidos en el montón en la pasada local y 60,1 MB en la frenada.

**Bucle local** (servidor en la misma máquina, medianas):

| Objeto | Textura | red + resto | FITS | red + resto | ×bytes | ×tiempo |
|---|---|---|---|---|---|---|
| M51 | 305,9 ms · 1965 kB | 18,1 + 283,9 | 155,9 ms · 4118 kB | 32,5 + 123,4 | 0,477 | 1,96 |
| M101 | 112,1 ms · 1963 kB | 8,6 + 100,1 | 81,7 ms · 4115 kB | 19,4 + 53,5 | 0,477 | 1,37 |
| M104 | 214,3 ms · 1948 kB | 9,9 + 194,6 | 56,9 ms · 4121 kB | 17,3 + 35,6 | 0,473 | 3,77 |
| M81 | 203,1 ms · 1967 kB | 11,1 + 195,3 | 65,5 ms · 4115 kB | 21,9 + 38,5 | 0,478 | 3,10 |

**4G rápida** (misma máquina, red emulada de DevTools, medianas):

| Objeto | Textura | red + resto | FITS | red + resto | ×bytes | ×tiempo |
|---|---|---|---|---|---|---|
| M51 | 2904,9 ms | 2175,1 + 732,5 | 4523,7 ms | 4384,2 + 127,8 | 0,477 | 0,64 |
| M101 | 2450,9 ms | 2171,2 + 276,1 | 4485,5 ms | 4375,0 + 78,2 | 0,477 | 0,55 |
| M104 | 2638,6 ms | 2143,4 + 490,6 | 4417,3 ms | 4373,5 + 70,5 | 0,473 | 0,60 |
| M81 | 2828,0 ms | 2180,7 + 626,1 | 4413,9 ms | 4356,8 + 52,7 | 0,478 | 0,64 |

Los totales de la pasada frenada caen dentro del 10 % unos de otros; los del
bucle local se mueven mucho más, porque ahí el tiempo es trabajo de una máquina
de trabajo y no transporte. El «resto» de la textura crece en la pasada frenada
(276–732 ms frente a 100–195 ms) sin que la decodificación haya cambiado: es la
prueba de que ese sobrante lleva encolado dentro y de que hay que leerlo como
cota superior.

## Por qué el bucle local da la vuelta al resultado

La textura y el FITS reparten el coste al revés:

- **Bytes**: 1,95 MB de textura contra 4,12 MB de FITS, 0,47–0,48×. Es un dato
  del formato, no de la máquina: el FITS son 1024² float32 sin comprimir
  (4,00 MB) más cabecera, y el PNG-16 va comprimido.
- **Resto (decodificación y encolado)**: la textura gasta 100–284 ms y el FITS
  36–123 ms. La diferencia, 47–160 ms, es sobre todo inflar el IDAT y aplicar el
  `sinh` píxel a píxel; el FITS solo da la vuelta a los bytes.

El margen de bytes es de un 4,6 %, así que conviene decir de qué depende: el
PNG compite comprimido contra un FITS crudo, y si el servidor comprimiera el
FITS el veredicto podría darse la vuelta. Medido: `gzip -6` sobre el FITS de
M51 lo deja en 3 925 534 B (0,931×) —float32 de astronomía comprime poco—, y
con eso la razón subiría a **0,513×**, por encima del tope. Comprobado contra
producción el 2026-09-08: `ps1-proxy.php` responde `application/fits`,
4 216 320 B y **sin `Content-Encoding`**, mientras que el mismo servidor sí
comprime el JS. El criterio pasa, y pasa porque el FITS viaja crudo; si algún
día se activa la compresión para `application/fits`, hay que volver a medir
esto.

Ese reparto tiene un punto de empate, y el harness lo calcula por objeto:

```
empate = (bytes_FITS − bytes_textura) · 8 / (resto_textura − resto_FITS)
```

El número que sale depende de la pasada, porque el «resto» depende de la carga
de la máquina y del encolado: **110–378 Mbps** en la pasada local de la tabla,
138–444 en otra más descansada, y 29–89 en la frenada, donde el sobrante de la
textura está inflado por la espera. No se descarta ningún golden para redondear
el número. La lectura prudente es la de abajo del todo, **≈ 30 Mbps**: aun
tomando la estimación más desfavorable a la textura, el cruce queda por encima
de lo que tiene un observador en casa, y por debajo del cruce la textura llega
antes.

Los dos extremos están medidos, no estimados: por 4G rápida (≈ 9 Mbps) la
textura tarda 0,55–0,64× lo que el FITS, y contra un servidor en la misma
máquina —donde la red le cuesta 10 ms para 2 MB, que son ~1,6 Gbps— tarda
1,4–3,8×.

Dicho de otra forma: contra `localhost` el listón mide **solo** la
decodificación, porque el transporte que la textura ahorra no cuesta nada. La
pregunta que L1.3 quería contestar —«¿cuesta la decodificación en JS más de lo
que ahorra?»— tiene respuesta numérica: cuesta 47–160 ms y ahorra 2,17 MB, así
que **ahorra más que cuesta en cualquier enlace de andar por casa**: el cruce
más desfavorable que sale de las medidas está en ~30 Mbps y el más favorable en
~450, y las texturas se sirven por internet, no por bucle local.

## Decisión

Se documenta y se decide, como el criterio 4 de la #207 y la nota de la #195
dejaban previsto: **la sustitución de la fuente sigue adelante**. El listón se da
por cumplido en su lectura de producción (enlace real) y por incumplido en la
lectura de bucle local, que no modela a ningún observador. No se toca el
listón prerregistrado: se anota aquí que su redacción no fijaba el enlace, y con
qué enlace pasa y con cuál no.

## Lo que esto deja apuntado para la fase 2

El coste de decodificar va con el número de píxeles. La fase 2 sube el lado a
2048 px en los objetos que lo pidan, y eso multiplica por 4 el parche: varios
cientos de ms por parche y 16,0 MB de memoria, justo en el tope de L2.4. El
campo de Virgo medido aquí son 14 parches y 57,5 MB; a 2048 px, escalando por el
mismo factor, serían **~224 MB**, muy por encima del tope de 150 MB. No es un problema de la
fase 1 —donde el campo entero cabe con holgura—, pero es el número que L2.4
tendrá que mirar de frente, y la vía de escape del tope de 1794 px que el ADR ya
tiene escrita existe para esto. El aviso vale como orden de magnitud: quien
mida L2.4 tiene que volver a pesar el montón, no escalar esta cifra.
