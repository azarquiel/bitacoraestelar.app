# ADR 0012 · paso 3 (B): el esquema del punto fijo

Arnés: `scripts/harness_punto_fijo.js`. M13, D=467 mm, 173×, SQM 21,
`θ_sep = 1 r_img`, 512 tramos radiales. La ley es `pob.aCrowd` de producción
(ADR 0008); lo único que el arnés construye es el velo nuevo, porque es
justamente lo que (B) tiene que decidir y todavía no existe en ningún sitio.

**Resultado en una línea:** el punto fijo existe, es único y contrae, pero
**una pasada no basta**: hacen falta **5** para bajar de 0,01 mag. Cuestan 4,6 ms
en la tabla radial completa, así que el criterio del ADR se cumple sin discusión
de coste. Y el destino apenas se mueve: `m_res` cambia entre −0,064 y +0,030 mag
respecto a producción.

---

## 1. Medio problema se evapora, el otro medio no

Conviene separar dos dependencias que es fácil confundir:

- **`a(m, r)` NO depende del cielo.** `aCrowd(m, rAs, radioImagenAs)` se alimenta
  de `sigma(r)` y de la LF —población TOTAL del cúmulo vía `Ntot`— y de la imagen
  estelar, que es apertura y seeing. Medido en (A): 0 cambios entre 61× y 250×.
- **Pero el velo no es solo el crowding.** Una estrella que sobrevive a la mezcla
  puede seguir siendo demasiado débil para el cielo, y entonces también va al
  velo. Ese término sí depende de `m_res`.

La partición por estrella, sin banda ni listón, con el complemento exacto del
ADR 0011:

```
fracción (1−a)              -> velo    (se mezcla)
fracción a  y  m <= m_res   -> se dibuja
fracción a  y  m >  m_res   -> velo    (la mezcla la salva, el cielo no)

dibujado(m_res, r) = Σ_bins w(m_res)·num·f·a(m, r)
velo(m_res, r)     = Ftotal − dibujado(m_res, r)
m_res(r)           = m_lim,sky( F_cielo + sigma(r)·velo )
```

Eso es un punto fijo de verdad: velo ← m_res ← velo. El ADR tenía razón en que
la semilla de hoy desaparece; se equivocaba solo en el motivo (no es `a` quien
depende del cielo, es el segundo término del velo).

La reconstrucción de la LF por bins se comprueba contra producción: `Σ num·f`
contra `pob.S1(−99)`, error relativo **3,6e-16**.

## 2. Converge, contrae y el punto fijo es único

Tres semillas opuestas —todo resuelto (`m_res = +∞`, la que el ADR propone),
nada resuelto (`−∞`), y la de hoy (`m_crowd`)— para ver si el arranque decide
algo. MEDIDO:

```
r/r_h    m_res converge a   |Δ| it.2   it.3     it.4   contracción   dif. entre semillas
 0,05           13,9013     0,2757   0,0224   0,0022      8,1e-2              4,4e-12
 0,10           13,9447     0,2777   0,0208   0,0021      7,5e-2              4,5e-12
 0,25           14,1864     0,2800   0,0253   0,0015      9,0e-2              2,1e-14
 0,50           14,6942     0,2115   0,0725   0,0139      3,4e-1               7,2e-9
 1,00           15,4317     0,2420   0,0111   0,0005      4,6e-2              3,6e-15
 2,00           15,9197     0,1838   0,0041   0,0001      2,2e-2              0
 4,00           16,1279     0,0487   0,0003   0,0000      5,3e-3              0
 8,00           16,1761     0,0037   0,0000   0,0000      4,1e-4              0
```

Factor de contracción entre 4e-4 y 0,34 (el peor, a 0,5 r_h). Convergencia
geométrica, sin oscilación.

**El punto fijo es único.** La diferencia entre arranques opuestos no es
dependencia de la semilla: es lo que falta por converger, y encoge al iterar.
MEDIDO sobre los 512 tramos: **7,4e-6 mag a 12 pasadas, 3,1e-9 a 20, 2,0e-13 a
30**. El arnés lo comprueba con un `throw`.

## 3. El criterio del ADR: N = 5, no 1

El ADR pedía «el mínimo N que estabilice por debajo de 0,01 mag». MEDIDO sobre
los 512 tramos, desde la semilla del ADR:

```
peor |Δ| de la pasada 2                        0,281 mag
peor |Δ| de la pasada 3                        0,075 mag
N mínimo para |Δ| < 0,01 mag                   5 pasadas  (peor radio: r/r_h = 0,44)
```

**Una pasada no basta**, y no por poco: deja 0,28 mag, veintiocho veces el
listón. El truco de hoy —arrancar en `m_crowd` y cerrar en una— no se puede
trasplantar, tal como el ADR anticipaba.

El peor radio es 0,44 r_h, no el núcleo. Tiene sentido: en el centro `a` es tan
pequeña que el velo casi no depende de `m_res` (casi todo se mezcla igual), y
fuera de r_h pasa lo contrario. La zona de máxima realimentación es la de en
medio, donde `a` está a mitad de camino.

**Criterio de parada:** N fijo, no tolerancia. El propio ADR lo exige —«el
criterio de parada no puede vivir dentro de la imagen»— y con la contracción
medida, N=5 vale para todos los radios sin mirar el resultado. Con margen: a
N=5 el peor radio ya está en 0,0139 y a N=6 baja de 0,005.

## 4. Coste: no es un problema, y la optimización obvia no compra nada

Construir la tabla radial entera (512 tramos, 5 pasadas), MEDIDO con el JIT
caliente:

```
aCrowd dentro del bucle    4,6 ms
aCrowd precalculado        4,3 ms   (1,1x)
```

`a(m_i, r)` no depende de `m_res`, así que parecía que precalcularlo por radio y
dejar que las pasadas solo re-pesen la tabla sería mucho más barato. **Empatan.**
El bucle ingenuo ya se salta los bins más débiles que `m_res`, y el precalculado
los paga todos. (Sin calentar el JIT la medida se invierte y el precalculado sale
un 40 % más lento: es ruido de arranque, no una diferencia.)

Los dos dan el mismo resultado al bit, comprobado con un `throw`. **Se deja
constancia para que el paso 4 no meta una optimización que no compra nada**; a
4-5 ms por tabla radial completa, ninguna de las dos formas molesta al render.

## 5. Adónde va a parar `m_res`

Lo que el paso 4 cambia de verdad, contra producción (`m_crowd` + banda δ, k=30):

```
r/r_h    producción    punto fijo        Δ
 0,05        13,871        13,901    +0,030
 0,10        13,918        13,945    +0,027
 0,25        14,205        14,186    −0,018
 0,50        14,756        14,694    −0,062
 1,00        15,477        15,432    −0,045
 2,00        15,984        15,920    −0,064
 4,00        16,163        16,128    −0,035
 8,00        16,180        16,176    −0,004
```

Entre −0,064 y +0,030 mag. **`m_res` casi no se mueve**, pese a que la ley que lo
produce cambia entera. No es contradictorio: el velo lo domina el mismo flujo
débil de la LF por los dos caminos, y `m_res` entra en él por un logaritmo. Lo
que cambia con el ADR 0012 no es dónde está el listón del cielo, es que deja de
haber listón de crowding.

Cambia de signo alrededor de 0,2 r_h: en el núcleo el velo nuevo es algo menor
(se resuelve un pelo más) y fuera es algo mayor. Coherente con la dirección ya
medida —el cúmulo gana estrellas, 1575 → 1713— y con que el modelo mezcle de más
dentro de r_h.

## 6. Veredicto

| pregunta de (B) | respuesta medida |
|---|---|
| ¿existe el punto fijo? | sí, y contrae (factor 4e-4 a 0,34) |
| ¿es único? | sí: 2,0e-13 mag entre arranques opuestos a 30 pasadas |
| ¿basta una pasada, como hoy? | **no**: deja 0,281 mag |
| N mínimo para <0,01 mag | **5**, peor radio 0,44 r_h |
| criterio de parada | N fijo = 5; nada que mirar dentro de la imagen |
| coste | 4,6 ms la tabla radial completa; precalcular no compra nada |
| cuánto se mueve m_res | −0,064 a +0,030 mag |

**Decidido: iterar N = 5 desde la semilla del ADR** (`m_res = +∞`, o sea todo
resuelto salvo lo que la mezcla se lleva; es la que no depende del cielo).

## 7. Lo que (B) NO resuelve, y el paso 4 hereda

**La partición exacta del ADR 0011 contra Bernoulli.** El velo de arriba usa la
esperanza `(1−a)` sobre la LF, que es un continuo, y `Fdibujado = Ftotal − velo`
es exacto. Pero (A) eligió Bernoulli para las estrellas CATALOGADAS que se
dibujan encima, y ahí el flujo dibujado es aleatorio: en una realización
concreta ya no es el complemento exacto del velo, solo lo es en media. El
guardián `test_banda_conservacion` mide la partición exacta.

No es un fallo de (A) ni de (B): las dos capas usan la misma `a` y conservan el
flujo, pero una lo hace por realización y la otra en media. **El paso 4 tiene que
decidir con qué tolerancia se mide la conservación cuando la mitad catalogada es
un sorteo**, y ese número sale de la sd medida en (A) —0,012 % de sesgo sobre 200
semillas, con sd por anillo de 0,3 a 5,2 estrellas—. Se anota aquí para que no
aparezca de sorpresa como un guardián en rojo.
