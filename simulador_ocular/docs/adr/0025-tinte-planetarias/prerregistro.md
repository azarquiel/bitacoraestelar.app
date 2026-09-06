# Prerregistro de listones — tinte de las planetarias brillantes (ADR 0025)

Fecha: 2026-09-06. Comprometido ANTES de escribir la ley y antes de tocar el
render. Ningún listón se retoca tras ver una salida: si un listón falla, F1 se
declara falsada en ese punto y se aplica la vía de escape única (§5) o se cierra
el canal con medida (§6). Disciplina de los ADR 0012, 0015, 0022 y 0024.

Fuentes: `simulador_ocular/docs/adr/0025-preregistro-tinte-de-las-planetarias-brillantes.md`,
`resources/plugins/bitacora-registro/datos/observaciones-seed.json` (bitácora
propia) y sus fichas PDF (`theferretofcomets.com/wp-content/uploads/fichas/`),
Acker et al. 1992 (VizieR V/84), OpenNGC. Tabla reproducible:
`scripts/entradas_tinte_np.py`.

## 1. Anclas observacionales

Todas del mismo observador, Stargate 457 mm, orientación dobson. La SQM viene
de la cabecera de cada ficha PDF («Datos de la región del cielo»); el seed no
la trae para estos tres objetos. Las citas son literales.

| Objeto | Aumento | Pupila salida | SQM-L | Lo que dice la bitácora |
|---|---|---|---|---|
| NGC 6905 | 70× | 6,6 mm | 21,40 | «un bello color azul»; «azulado tirando a verdoso» |
| NGC 6905 | 98× | 4,7 mm | 21,40 | «los colores se magnifican con este ocular»; «claramente turquesa o verde-azulado» |
| NGC 6905 | 154× | 3,0 mm | 21,40 | «a costa de perder cualquier referencia de color, pues ahora la veo de un suave color gris, sin ninguna tonalidad azulada» |
| NGC 6905 | 270× | 1,7 mm | 21,40 | «no tiene ningún color, solamente veo grises (a bajos aumentos su color era precioso)» |
| NGC 6826 | 70× | 6,6 mm | 21,30 | «a diferencia de otras nebulosas planetarias, en esta no detecto color alguno»; «un precioso gris plata, pero no aprecio ninguna tonalidad, ni azulada ni verdosa» |
| NGC 40 | 98× | 4,7 mm | 21,15 | «no aprecio color alguno en la nebulosa, es decir que la veo totalmente gris» |

Lo que las anclas obligan a explicar, y que un umbral de brillo no explica:

- **NGC 6826 es 7 veces más brillante en superficie que NGC 6905**
  (9,0·10⁻³ frente a 1,26·10⁻³ cd/m²) y sale gris donde la otra sale turquesa.
- **El mismo objeto pierde el color al subir aumentos** (NGC 6905, entre 98× y
  154×), y lo gana algo entre 70× y 98× aunque la pupila de salida baje.
- **NGC 40 no tiene `I5007` en V/84** (solo Hα = 287): queda gris por la regla
  «sin razón de líneas no hay color» del ADR, no por la ley. Es coherente con
  la bitácora pero **no es un listón**: no prueba nada de F1.

M57 (SQM 21,95) y M27 (SQM 21,45) están en la bitácora con el mismo equipo y
**no mencionan color a ningún aumento**. Silencio no es «gris»: no son anclas.
Se usan solo en las predicciones de §4.

## 2. Entradas por objeto (colorimetría, no ley)

Espectro de líneas → CIE 1931 → luminancia fotópica del disco (L_fot) y
cromaticidad (x, y). Pureza = distancia a D65 en xy. Diámetro OpenNGC; flujos
V/84 `LineRef b`, sin corregir de enrojecimiento.

| Objeto | diám ″ | log F(Hβ) | I5007 | I6563 | I4686 | L_fot cd/m² | μ_fot | pureza Δxy |
|---|---|---|---|---|---|---|---|---|
| NGC 6905 | 40,2 | −10,92 | 958 | 319 | 91 | 1,26·10⁻³ | 19,85 | 0,240 |
| NGC 6826 | 25,2 | −9,98 | 242 | 344 | 4 | 9,00·10⁻³ | 17,71 | 0,121 |
| NGC 7662 | 16,8 | −9,99 | 425 | 282 | 17 | 2,98·10⁻² | 16,42 | 0,201 |
| NGC 3242 | 25,2 | −9,79 | 698 | 352 | 17 | 3,25·10⁻² | 16,32 | 0,231 |
| NGC 6572 | 10,8 | −9,82 | 399 | 297 | — | 1,01·10⁻¹ | 15,09 | 0,198 |
| NGC 2392 | 51,6 | −10,39 | 1406 | 395 | 29 | 3,68·10⁻³ | 18,69 | 0,276 |
| M27 (NGC 6853) | 402 | −9,46 | 1106 | 262 | 70 | 4,09·10⁻⁴ | 21,07 | 0,266 |
| Helix (NGC 7293) | 980 | −9,37 | 592 | 189 | — | 4,68·10⁻⁵ | 23,43 | fuera de alcance |
| NGC 40 | 48 | −10,66 | **en blanco** | 287 | — | — | — | sin dato → gris |
| M57 (NGC 6720) | 76 | −10,08 | **sin fila** | — | — | — | — | sin dato → gris |

La pureza sola tampoco separa las anclas: NGC 6826 tiene la mitad que
NGC 6905, pero la mitad de 0,24 sigue siendo color. Hace falta un tercer
término, y el que la bitácora señala es el **tamaño aparente**: NGC 6826 a
70× mide 0,49° y NGC 6905 a 98× mide 1,09°.

## 3. Formulación F1 (declarada antes de medir)

Por objeto y equipo:

- **E_ret** = (L_fot + L_cielo) · π·(min(pupila salida, pupila ojo)/2)² — en
  trolands, con L_cielo = 10^(−0,4·(SQM − 12,6)) cd/m². Misma dependencia
  fondo × pupila² que ya usa `dPrimeTextura` en el render.
- **θ_ap** = anchura de la estructura brillante × aumentos, en grados. Para
  un disco lleno, el diámetro. Para un anillo, la anchura del anillo medida
  en el parche PS1 a mitad del pico; hoy ningún objeto del alcance con dato
  es anular (M57 está sin dato), así que la cláusula solo se activa si M57
  entra con su fuente secundaria. Queda declarada porque es la única
  ambigüedad de la entrada.
- **p_ef** = pureza · L_fot / (L_fot + L_cielo): el velo del cielo diluye el
  color en proporción a su luminancia.
- **Señal cromática**: `d′_c = p_ef · min(1, (θ_ap/θ_c)²) · [E_ret ≥ E_c]`.

Parámetros:

- **θ_c = 1,0°**, fijado por literatura (sumación espacial cromática hasta
  ~1° de campo; Abramov, Gordon & Chan 1991) y **no se ajusta**.
- **E_c** es el único parámetro libre y se **lee**, no se elige: entre E_ret
  de NGC 6905 a 154× (0,0110 td, gris) y a 98× (0,0271 td, turquesa). Media
  geométrica: **E_c = 0,017 td**. Ningún otro caso toca E_c.

Veredicto: **tinte** si d′_c ≥ 0,10; **acromático** si d′_c ≤ 0,05; entre
ambos, **zona gris**, que no cuenta ni como acierto ni como fallo. A lo sumo
una fila de §4 puede caer en zona gris; dos o más falsan la formulación
(ADR 0005: un veredicto vacío no es evidencia).

Comprobación de anclaje (no es predicción; detecta un ajuste degenerado):

| Ancla | E_ret td | θ_ap | p_ef | d′_c | veredicto | bitácora |
|---|---|---|---|---|---|---|
| NGC 6905 70× | 0,0535 | 0,78° | 0,194 | 0,118 | tinte | turquesa |
| NGC 6905 98× | 0,0271 | 1,09° | 0,194 | 0,194 | tinte | turquesa |
| NGC 6905 154× | 0,0110 | 1,72° | 0,194 | 0 | gris | gris |
| NGC 6905 270× | 0,0035 | 3,02° | 0,194 | 0 | gris | gris |
| NGC 6826 70× | 0,3191 | 0,49° | 0,117 | 0,028 | gris | gris plata |

Que las cinco cuadren **no valida nada**: F1 se escribió con ellas a la vista.
Lo que se prerregistra es §4.

Lo que F1 no modela, y se declara: la estrella central (NGC 6826, V ≈ 10,4,
blanca, dentro del disco), la intrusión de bastones (E_esc ≈ 7·E_fot para
todos estos espectros, así que no discrimina entre objetos), y la edad de la
pupila del observador (se toma 7 mm; con 6 mm el ancla de 70× baja a
0,0442 td y no cambia de lado).

## 4. Predicciones (pasan o falsan; no se retocan)

Objetos y equipos que **no intervinieron** en fijar E_c ni θ_c. 200 mm f/6
con SQM 21,0 (el equipo por defecto del simulador); 457 mm con la SQM de la
ficha. Se falsan con el render, cuando exista, o con una observación de la
bitácora que diga lo contrario.

| # | Objeto | Equipo | E_ret td | θ_ap | d′_c | Predicción |
|---|---|---|---|---|---|---|
| P1 | NGC 7662 | 200 mm, 100× (2,0 mm) | 0,095 | 0,47° | 0,043 | **acromática** |
| P2 | NGC 7662 | 200 mm, 200× (1,0 mm) | 0,024 | 0,93° | 0,172 | **tinte** |
| P3 | NGC 7662 | 200 mm, 300× (0,67 mm) | 0,011 | 1,40° | 0 | **acromática** (bajo E_c) |
| P4 | NGC 3242 | 200 mm, 100× / 200× / 300× | 0,103 / 0,026 / 0,012 | 0,70° / 1,40° / 2,10° | 0,111 / 0,228 / 0 | tinte / tinte / acromática |
| P5 | NGC 6572 | 200 mm, 300× (0,67 mm) | 0,036 | 0,90° | 0,160 | **tinte** (la fila de 200×, 0,071, es informativa: no es listón y no consume la zona gris) |
| P6 | NGC 2392 | 457 mm, 98× / 270× | 0,069 / 0,009 | 1,40° / 3,87° | 0,255 / 0 | tinte / acromática; a 200 mm 100×: acromática |
| P7 | M27 | 457 mm, 70× / 154× (SQM 21,45) | 0,024 / 0,005 | 7,8° / 17° | 0,156 / 0 | **tinte débil a 70×**, acromática a 154× |

La forma de las predicciones es lo que falsa: **una ventana de aumentos**.
Por debajo el objeto es demasiado pequeño para los conos (θ), por encima
demasiado oscuro (E_c). P1–P3 la dibujan entera para el equipo por defecto:
NGC 7662 a 200 mm solo tiene color entre ~150× y ~250×.

P7 es la que más se expone: M27 está en la bitácora a 70× con el 457 mm y no
dice nada de color. Si el observador la reporta gris a 70× con SQM ≥ 21,4, P7
falla y F1 va a §5.

Tolerancia: un listón «tinte» pasa con d′_c ≥ 0,10 y uno «acromática» con
d′_c ≤ 0,05 **calculados con los valores de V/84 y OpenNGC citados en §2**;
cambiar de fuente para un objeto obliga a reescribir su fila aquí antes de
medir, no después.

## 5. Vía de escape única: F2

Si falla alguna predicción de §4 (o dos caen en zona gris), NO se toca θ_c ni
se busca un E_c nuevo. Se prueba **F2** y solo F2:

- Misma estructura que F1, pero la puerta no es la iluminancia fotópica
  (V(λ)) sino la **iluminancia del cono M** (fundamental de Stockman &
  Sharpe 2000, pico 534 nm): E_M = Σ M(λ)·F_línea · área de pupila.
  Hα pesa mucho menos y He II 4686 casi nada; [O III] y Hβ mandan.
- E_c se vuelve a leer en el mismo par de anclas (NGC 6905 98×/154×), con la
  misma media geométrica. θ_c sigue en 1,0°.
- Las predicciones P1–P7 se recalculan con F2 **antes** de mirar ningún
  render, se anotan en `veredicto.md` y se juzgan con los mismos umbrales.

Si F2 también falla, no hay F3: se aplica §6.

## 6. Criterio de invisibilidad y cierre

El canal se cierra apagado, como la ley de textura (ADR 0015), si ocurre
cualquiera de estas cosas, y se anota con el número medido:

1. **No hay E_c**: ningún valor en [0,001, 1] td deja las cinco anclas de §3
   del lado correcto, ni con F1 ni con F2.
2. **Solo se enciende con un equipo**: con F1 (o F2) anclada, ningún objeto
   del alcance (81 `PN` con μ_fot ≤ 21,2) alcanza d′_c ≥ 0,10 con apertura
   ≤ 250 mm y pupila de salida entre 0,5 y 7 mm bajo SQM 21,0. P2, P4 y P5 ya
   dicen que sí debería; si el render lo desmiente, gana el render.
3. **Nunca se ve**: ningún objeto del alcance alcanza d′_c ≥ 0,10 con
   apertura ≤ 500 mm. Las anclas lo contradicen de antemano; si pasara,
   el error está en la conversión de flujo a luminancia y se mide antes de
   cerrar.

Cerrar no borra nada: quedan las cuatro columnas de la fila `PN` y esta
carpeta, para que el siguiente no vuelva a empezar de cero.

## 7. Estado

Ni una línea de render escrita antes de este commit. `scripts/entradas_tinte_np.py`
tabula las entradas y comprueba las anclas; no se importa desde
`resources/js/`. El siguiente documento de la carpeta es `veredicto.md`, y lo
escribe el ticket de implementación, si se abre.

## 8. Lo que hay que decir aunque todo pase

- Que el tinte dependa del **tamaño aparente** significa que **el aumento
  útil para ver color no es el mayor ni el menor**, sino una ventana; ninguna
  regla de «pupila de salida grande = más color» lo captura, y así lo dice la
  bitácora de NGC 6905.
- Que la magnitud del catálogo **no sirve** para esto vale también para el
  brillo de las compactas en general: el suelo 17,5 borra 1,6 mag en
  NGC 6826. Es una propiedad de la clase que hasta hoy no estaba escrita.
