# Capas difusas en el render de Gaia — decisiones de diseño

Registro de las decisiones tomadas antes de implementar las capas de objetos
extensos (nebulosidad Hα, telón de la Vía Láctea, extinción por polvo, galaxias
y componente no resuelta de globulares) en la vista **Canvas-2D de Gaia** del
simulador de ocular.

Fecha: 2026-07-29. Estado: **árbol resuelto, pendiente de confirmar e implementar**.

Punto de partida: una spec externa escrita para un stack Python (astropy,
healpy, reproject, StarNet++) que había que contrastar contra el simulador real
antes de tocar nada. Buena parte resultó ya implementada o superada.

---

## Contexto de partida

- La vista Canvas-2D es **gris uniforme + estrellas de Gaia + glow** de las no
  resueltas (`renderGaia2D`, bitacora-ocular.js; `dibujar`,
  `resources/js/bitacora-gaia-render.js`). **No hay ninguna capa difusa**, y es
  la única vista sin datos de imagen de los que sacarla.
- La atenuación por pupila, la magnitud límite de Torres Lapasió y el umbral de
  contraste `Cmin` **ya existen** y son más ricos que lo que pedía la spec.
- `bitacora-gaia-render.js` es **compartido** con el formulario de registro
  (*Generar con el simulador*), y arrastra réplicas manuales de `nivelFondo` y
  `magLimite`.
- Diagnóstico previo de nebulosas oscuras y pupila de salida:
  [`notas-pupila-salida-fondo-cielo.md`](notas-pupila-salida-fondo-cielo.md).

---

## Decisiones (árbol resuelto)

| #  | Decisión | Elegido |
|----|----------|---------|
| 1  | Stack | Traducir la spec a **JS/PHP**. Python solo offline y desechable, para generar assets |
| 2  | Alcance | Hα + extinción + globulares + galaxias |
| 3  | Papel del mapa Hα | Telón difuso de baja frecuencia **y** corregido a respuesta visual |
| 4  | Calibración Hα | `k` global físico + override por objeto |
| 5  | Entrega de mapas | PNG equirectangular estático, muestreado en JS. Sin proxy |
| 6  | Alcance de la máscara de polvo | Solo capas **detrás** del polvo; el cielo se suma sin atenuar |
| 7  | Fuente de polvo | Bayestar19 colapsado offline + SFD para `dec < −30°`, fusionados en un PNG |
| 8  | Telón brillante | Extrapolar `log N(m)` del propio Gaia. Cero dataset |
| 9  | Rol de la extinción | Realce de estructura fina **y** máscara con doble conteo, ambos conmutables |
| 10 | Forma del toggle | Visible, etiquetado como no físico |
| 11 | UI | Barra «Capas y vista» bajo la imagen; «Origen de imagen» se muda del lateral |
| 12 | Módulo compartido | Capas activas en simulador **y** registro |
| 13 | Peso de assets | 3600×1800 (6′/px), ~1–2 MB cada uno |
| 14 | Globulares | Perfil de King ajustado a los conteos radiales de Gaia |
| 15 | Ámbito | Capas **solo** en Canvas-2D Gaia; deshabilitadas en HiPS/DSS |
| 16 | Comprobación | `scripts/test_difuso.js`, cuatro asserts |
| 17 | Galaxias | **Sérsic sintético** desde catálogo (`r_e`, `b/a`, PA, `μ_e`) |
| 18 | Exposición de galaxias | Solo capa por campo, sin pestaña; se pintan las compañeras |
| 19 | Apuntar | Exponer el modo libre SIMBAD (quitar el flag de pruebas) |
| 20 | Cadena fotométrica | `ctxFotometrico` + `pintarFot` **se mudan al módulo compartido** |
| 21 | Nebulosas (revisión de 5 y 7) | **Catálogo sintético NGC/IC**, no mapas all-sky. Cero assets |

### Justificaciones clave

- **6** — El brillo de cielo (airglow + contaminación lumínica) se genera en la
  atmósfera, **delante** del polvo. La spec multiplicaba toda la imagen compuesta
  incluido el cielo, lo que hace destacar una nebulosa oscura contra cielo vacío
  y negro: lo contrario de la física. El cielo se suma **después** de la máscara.
- **8** — El fondo contra el que se recortan Gran Grieta, Pipa y Saco de Carbón
  no es Hα, es **luz integrada de estrellas no resueltas**. La pendiente de la
  función de luminosidad del campo que ya se descarga la da gratis.
- **3** — El ojo es casi ciego a 656 nm (visión escotópica pica en 507 nm): la
  nebulosa visual la dan **OIII + Hβ**. Un mapa Hα crudo pone brillo donde el ojo
  ve poco. Y a 6′ de resolución no puede dar estructura, solo un degradado.
- **14** — En el núcleo de un globular Gaia DR3 está incompleto por
  **aglomeración**, y el glow se alimenta del catálogo, así que hereda el agujero.
  El ajuste debe hacerse **fuera** del radio afectado y extrapolar hacia dentro,
  o reproduce el mismo sesgo que pretende corregir.
- **17** — Por el ocular una galaxia es un óvalo difuso con núcleo más brillante;
  brazos y bandas de polvo exigen apertura grande. Un Sérsic no es una
  aproximación barata aquí: es **más honesto** visualmente que una foto profunda,
  y no cuesta assets.
- **21** — Revierte las decisiones 5, 7 y 13 (PNG all-sky de Hα y polvo) una vez
  implementado el resto. Tres razones, todas ya escritas en este mismo documento:
  el riesgo 1 dice que a 6′ el mapa da un degradado y no estructura; la decisión 8
  y el riesgo 5 dicen que las siluetas oscuras las da el **telón de conteos de
  Gaia**, ya en producción y con resolución efectiva comparable; y la decisión 3
  dice que el ojo es casi ciego a Hα, así que el mapa aporta poco donde no hay
  nebulosa catalogada. Coste evitado: ~600 MB de Bayestar19, `healpy` y ~2–4 MB
  de asset descargados **siempre**, incluido el formulario de registro (riesgo 3).
  A cambio, las nebulosas salen del NGC/IC con el mismo argumento que las
  galaxias (decisión 17) y por la misma tubería: `capaGalaxias` con un
  exponencial, sin bulbo ni banda de polvo.
- **20** — El Canvas-2D necesita la misma cadena flujo→pantalla que las placas.
  Mudarla mata además las réplicas de `nivelFondo` y `magLimite`, hoy
  sincronizadas a mano.

### Qué se descartó de la spec original

- **§2 y §3** (estrellas de Gaia, fondo de cielo por pupila) — ya implementados,
  y con más física que la spec: umbral de Torres Lapasió, `Cmin`, adaptación local.
- **§5 galaxias vía plantillas StarNet** — sustituido por Sérsic sintético (17).
- **§7 extinción aplicada a las estrellas de Gaia** — **eliminado**: el catálogo ya
  viene con el agujero (Gaia no detecta las estrellas que el polvo extingue), así
  que la máscara contaría el polvo dos veces y vaciaría un campo lleno de
  estrellas de delante.
- **§4 mapa Hα de Finkbeiner y §7 mapa de polvo SFD/Bayestar** — descartados
  enteros, ver justificación de la decisión 21. Las nebulosas de emisión pasan a
  catálogo sintético; las oscuras ya las dibuja el telón.
- **§8 paso 6** — corregido, ver justificación de la decisión 6.
- **Signo de la atenuación** — la spec traía `+2,5·log10(B_rel)` con `B_rel < 1`,
  que **aclara** el objeto. Signo correcto: **menos**. Mismo error que ya se
  corrigió en las notas de Legacy.

---

## Riesgos aceptados

1. **6′ es un degradado, no estructura.** En un campo de 30′ el mapa aporta 5×5
   píxeles. La Cabeza de Caballo (8′×6′) es **un píxel**: irresoluble por el mapa
   que la spec proponía justamente para dibujarla. El detalle sale de los conteos.
2. **King ajustado sobre dato sesgado.** Mitigación obligatoria, ver decisión 14.
3. **~2–4 MB descargados siempre**, también en el formulario de registro, en un
   simulador que presume de funcionar en móvil.
4. **El modo máscara es físicamente falso por diseño.** Solo lo sostiene la
   etiqueta de la UI.
5. **La magnitud de catálogo de una nebulosa a veces es la de su estrella.**
   NGC 1980 figura con V = 2,5, que es ι Orionis: sin tope salía a μ_e = 14,5,
   más brillante que el núcleo de M42, y encima duplicando luz que Gaia ya pinta.
   Mitigado con un suelo de brillo superficial (`MU_MIN`), que es un tope global,
   no un arreglo por objeto: 123 de 239 filas quedan recortadas.
6. **Una nebulosa es más que un óvalo suave.** M42 concentra su luz en ~4′ de los
   90′ que da el catálogo, y de un solo tamaño y una sola magnitud no sale esa
   concentración. Sale la mancha con núcleo, no la estructura.
7. **Sin ángulo de posición en 193 de 239 filas.** Se pintan redondas, con el
   radio medio geométrico: conserva tamaño y luz, pierde la forma.
8. **Ruido de Poisson en el telón.** Con `TOP 40000` en 1,44° salen ~1500
   estrellas en un campo de 30′: a celdas de 6′ son ~60 estrellas, 13 % de ruido.
   Resolución efectiva ~3–6′, comparable a Bayestar, no mejor.

---

## Estado del código en esta rama

Rescatado de la rama aparcada `feat/legacy-isofota-mu` (el origen DESI Legacy no
convenció y se retiró):

- **`ctxFotometrico(p)`** — flujo de cielo, `Cmin` y nivel de fondo, con la pupila
  y la transmisión aplicadas **una sola vez**.
- **`pintarFot(Fobj, canvas, p)`** — recibe un array de flujo por píxel y lo pinta
  con contraste + adaptación local.

Esa es la firma que necesitan las capas difusas: telón, Hα, Sérsic y polvo
producen un `Fobj` **sintético** en vez de uno sacado de una placa, y entran por
la misma tubería. Pendiente: mudarlas al módulo compartido (decisión 20).

No se rescató nada más de Legacy: ni `parseFITS`, ni `legacy-proxy.php`, ni el
respaldo de Astro Data Lab, ni `procesarFotometricoMu`.

---

## Comprobación prevista

`scripts/test_difuso.js`, sin framework, espejo de `scripts/test_gaia_color.js`.
26 secciones, 90 asserts. Los cuatro que motivaron el fichero:

1. **Pupila aplicada una sola vez** — la razón entre dos aumentos es `(p1/p2)²`.
   Es el fallo más probable y el más difícil de ver a ojo.
2. ~~**Rayleigh → μ** con un ancla conocida.~~ Cae con los mapas (decisión 21).
3. **Ajuste de King** recupera un King sintético con el núcleo vaciado a propósito.
4. **Polo galáctico ≈ sin telón, plano ≈ brillante.**

Y los que salieron de fallos reales, cada uno guardando lo que se rompió:
el fondo que no puede cambiar con los aumentos a igual pupila de salida; el
perfil del halo suave y no solo monótono (monótono ≠ suave: las derivadas
discontinuas salían como círculos concéntricos); la rodilla del realce de
detalle sin salto de pendiente; la luz integrada de galaxias y nebulosas contra
la magnitud de catálogo; y los interruptores de capa, que tienen que apagar de
verdad.

---

## Fuentes

- Verga, «OpenNGC» — NGC/IC revisado, con tamaños, magnitudes y tipos:
  https://github.com/mattiaverga/OpenNGC
- Descartadas por la decisión 21: Finkbeiner (2003) mapa Hα compuesto,
  Schlegel, Finkbeiner & Davis (1998) `E(B−V)`, y Green et al. (2019) Bayestar19.
- Roger N. Clark, *Visual Astronomy of the Deep Sky* — invariancia del contraste
  con el aumento, contraste umbral de Blackwell, siluetas oscuras:
  https://clarkvision.com/visastro/omva1/
- Diagnóstico propio previo: [`notas-pupila-salida-fondo-cielo.md`](notas-pupila-salida-fondo-cielo.md)
