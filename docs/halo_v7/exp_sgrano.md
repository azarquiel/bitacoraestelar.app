# Experimento sGrano: ¿se parece la granularidad a un cúmulo resolviéndose?

**Qué se hizo.** `exp_sgrano.html` (servir el repo y abrirlo). Producción **no se
toca**: el render ya pinta `I = Im·sHalo + dI·sGrano` con `sGrano = 0`, así que la
variante se construye volviendo a sumar `s·dI` con `dI = crudo − I_medio(r)`,
tomando `crudo` de `o.campoCrudo`, que ya era salida de medida. Ni una línea del
render cambia.

- **A** — producción, sGrano = 0
- **B** — sGrano = 0,25
- **C** — sGrano = 0,50

M13, 200 mm, SQM 21, 61× / 120× / 173× / 250×. **Campo fijo** en todas: si
cambiara con el aumento no se podría comparar nada, y el aumento ya entra por
donde debe (pupila de salida, Cmin, m_res).

Imágenes en `exp_sgrano/`: `contacto_abc.png` (la matriz 4×3 más el diagnóstico
por canales), `nucleo_pixel_fino.png` (núcleo a 0,375″/px, que es donde el grano
se muestrea de verdad) y `zoom_x6_textura.png`.

## Los dos canales quedan separados en el modelo

Estrellas dibujadas: **137 / 306 / 414 / 548**, idénticas en A, B y C. El grano no
añade ni una estrella catalogada. La separación que pedía el experimento se
cumple en el modelo.

En el **percepto** no se cumple: el grano vive a la escala de la PSF, así que sus
máximos son manchas del tamaño de una estrella y se leen como estrellas débiles.
No hay forma de que una textura a escala de PSF parezca «otra cosa».

## Qué se ve

**B a 61× funciona.** El núcleo deja de ser una mancha lisa y se rompe en un
moteado con nudos brillantes. Es, visualmente, «la pelusa empieza a romperse en
puntos». C tiene más contraste y a muestreo grueso ya empieza a leerse como ruido.

Pero hay tres cosas que no funcionan, y ninguna se arregla bajando s.

**1. La textura no cambia con el aumento.** La malla del grano tiene paso fijo
—`pasoGrano = radioImagenAs`, clavada al cielo— y su contraste apenas se mueve
(RMS/fondo 143 % a 61×, 88 % a 250×). B a 61× y B a 250× se parecen entre sí mucho
más de lo que se parecen A a 61× y A a 250×. **El experimento no reproduce la
transición observacional**: la dependencia del aumento sigue viniendo de las
estrellas cruzando m_res, no del grano.

**2. El grano es relativamente MÁS fuerte donde hay menos luz.** RMS/fondo sube
hacia fuera: 143 % en el núcleo y 340 % a 1-2 r_h. El resultado es que el moteado
llena el cuadro entero con la misma fuerza en vez de concentrarse en el cúmulo, y
eso es exactamente lo que hace que se lea como ruido del sensor. Es físicamente
correcto (N_ef cae a 0,07 en el halo) y visualmente equivocado.

**3. El recorte a cero rompe la conservación del flujo.** Como el RMS supera a la
media, la mayoría de los píxeles se irían a negativo y el render los recorta:

| aum | s = 0,25 | s = 0,50 |
|---:|---|---|
| 61 | 50,5 % recortados, +2,0 % de luz | 60,7 % recortados, +5,0 % |
| 120 | 58,0 %, +2,5 % | 65,7 %, +6,2 % |
| 173 | 62,3 %, +2,8 % | 68,3 %, +6,7 % |
| 250 | 65,6 %, +3,1 % | 70,1 %, +7,3 % |

Entre la mitad y el 70 % del campo se va a negro exacto y el cúmulo gana un 2-7 %
de luz que no tiene. A muestreo grueso eso es lo que convierte el moteado en
«puntitos sobre negro».

**4. Artefacto: cadenas y anillos.** A ×6 (`zoom_x6_textura.png`) se ven cadenas
curvas y anillos de nudos brillantes. Los produce el interpolado de `granoEn`
sobre su malla; con `sGrano = 0` nunca se habían visto. Cualquier tratamiento que
encienda el grano tiene que resolver esto antes.

## Veredicto contra los cuatro resultados previstos

Ninguno limpio: es **1 y 2 para el núcleo a 61×, y 4 para lo que importaba**.

B mejora mucho el aspecto del núcleo a bajo aumento, así que **sí existe una señal
granular físicamente presente que el detector actual suprime entera** — eso queda
confirmado, y es el Resultado 1. Pero encenderla **no reproduce el comportamiento
observacional de M13**, porque la textura es invariante con el aumento y
relativamente más fuerte fuera que dentro. Eso es el Resultado 4: el
comportamiento que buscamos no está en este canal.

Así que `sGrano` no es una perilla que calibrar. Lo que este experimento aporta es
el pliego de condiciones de lo que sí haría falta, si se decide seguir:

- amplitud que **decaiga** hacia fuera en términos relativos, no que crezca;
- respuesta al aumento, que hoy no tiene;
- conservación del flujo sin recorte masivo a cero;
- una textura sin cadenas ni anillos;
- y un umbral propio de textura, no `Cmin`, que es de mancha uniforme
  (`escala_grano.md` ya descartó que baste con mover la escala).

Cinco condiciones es un tratamiento de SBF, no un parámetro. No se propone aquí.
