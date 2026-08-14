# Bitácora Messier — simulador de ocular

Muestra **cómo se vería un objeto del cielo a través de tu equipo concreto**:
eliges telescopio y ocular, ajustas el cielo de tu observatorio y el simulador
reproduce el campo, el brillo y —en la vista de Gaia— hasta el color de las
estrellas, tal como los verías por el ocular.

Funciona en el navegador (móvil u ordenador), **sin instalar nada y sin necesidad
de iniciar sesión** (con sesión se desbloquean dos extras: ver
[*Qué cambia al iniciar sesión*](#qué-cambia-al-iniciar-sesión)). Vive en la web
WordPress del proyecto ([bitacoraestelar.app](https://bitacoraestelar.app)) como
un bloque HTML.

> El **objeto** lo elige el usuario en un selector de pestañas: **cúmulos
> abiertos** (de momento M35, M39 y NGC 7789), **cúmulos globulares** (los 149 del
> catálogo de Harris), **estrellas de carbono** (las ~100 del programa de la
> Astronomical League) o **estrellas dobles** (188, fusión de tres catálogos); con
> sesión iniciada se añade una quinta, **cualquier objeto** (por nombre o
> coordenadas). El equipo y el cielo también los elige el usuario.

---

## Qué hace

- **Elige el objeto**: en el selector de pestañas, un **cúmulo abierto**, un
  **cúmulo globular**, una **estrella de carbono** de la Astronomical League o una
  **estrella doble** (y, con sesión iniciada, **cualquier objeto** por nombre o
  coordenadas). Al elegir un globular, la vista de Gaia pinta su **halo no
  resuelto** (perfil de King) además de las estrellas individuales del catálogo. Al
  elegir una estrella de carbono, la ficha resalta su magnitud, tipo y su característico
  **color rojo-anaranjado** (mejor visible en la vista de Gaia). Al elegir una doble, la
  ficha muestra las magnitudes de las dos componentes, su separación, en qué catálogos
  aparece y un **veredicto de si tu equipo la resuelve** (ver más abajo).
- **Elige tu equipo**: telescopio y ocular de un catálogo de cientos de modelos,
  o **introdúcelos a mano** (apertura, focal y tipo óptico) si no están en la lista.
  Con **sesión iniciada**, los telescopios de **Mi flota** salen los primeros de la
  lista (con su nombre propio delante y sus características detrás). Se pueden
  poner **dos auxiliares** (Barlow, Powermate, reductor, Paracorr): se encadenan
  en orden, el primero es el que va montado más cerca del tubo.
- **Pantalla completa y descarga**: dos botones discretos bajo el círculo del ocular
  (para todos, con o sin sesión) amplían la vista a toda la pantalla o guardan la
  imagen tal y como se ve, con el mismo recorte circular.
- **Ajusta el cielo** del observador (brillo de fondo en mag/arcsec², de rural
  oscuro a urbano) y observa cómo se lava lo tenue.
- **Lecturas al instante**: aumentos, campo real, campo aparente, pupila de salida,
  brillo superficial, fondo de cielo en el ocular y **magnitud límite** del conjunto.
- **Tres vistas del mismo campo**:
  - **PanSTARRS DR1 (HiPS)** — foto real en color, sin dependencias de servidor propio.
  - **DSS (placas fotográficas)** — servidas por un proxy propio con caché LRU en disco
    (anti-estampida, ETag/304). Las sirve **SkyView** (NASA/GSFC), que las reproyecta
    con el **norte arriba**, la misma orientación que el render de Gaia; si SkyView no
    responde se cae al **archivo del ESO** (ver *Orientación del campo*).
  - **Estrellas de Gaia DR3 (Canvas 2D)** — posiciones y colores reales de las
    estrellas, con brillo, tamaño y color según cada estrella, glow de las no
    resueltas y **cruz de difracción** de la araña en los reflectores.

---

## Las piezas

| Archivo | Qué es | Dónde va |
|---|---|---|
| `ocular-wordpress.html` | Fragmento HTML del simulador (sin código) | Editor de WordPress (bloque HTML) |
| `resources/js/bitacora-ocular.js` | La lógica del simulador (óptica, fotometría, UI) | Servidor, por FTP a `…/uploads/bitacora/` |
| `../resources/js/bitacora-gaia-render.js` (compartido) | **Motor de render de estrellas de Gaia** (consulta + dibujo, `window.BitacoraGaiaRender`), extraído para reutilizarlo también desde el formulario de registro | Servidor, por FTP a `…/uploads/bitacora/` |
| ~~`resources/js/bitacora-ocular_main.js`~~ | **Código muerto**: copia antigua y duplicada del render de Gaia (su propio `spriteGaia()`, `magColor` fijo…), previa a la extracción a `bitacora-gaia-render.js`. Verificado (grep) que ningún `.html`/`.php` desplegado lo referencia. No se ha borrado a la espera de confirmación. | No desplegar |
| `resources/js/globulares-datos.js` | Catálogo de cúmulos globulares (`window.BITACORA_GLOBULARES`), generado del catálogo de Harris | Servidor, por FTP a `…/uploads/bitacora/` |
| `resources/js/estrellas-carbono-datos.js` | Catálogo de estrellas de carbono (`window.BITACORA_CARBONO`), generado del CSV | Servidor, por FTP a `…/uploads/bitacora/` |
| `resources/js/estrellas-dobles-datos.js` | Catálogo unificado de estrellas dobles (`window.BITACORA_DOBLES`), generado de los CSV | Servidor, por FTP a `…/uploads/bitacora/` |
| `resources/js/galaxias-datos.js` | Catálogo de galaxias (`window.BITACORA_GALAXIAS`), con r_e, b/a, PA, n y mag V: es el presupuesto de luz al que se ancla el parche de PS1. Generado por `scripts/gen_galaxias.py` desde `mapa/datos/galaxias.csv`; no editar a mano | Servidor, por FTP a `…/uploads/bitacora/` |
| `resources/css/bitacora-ocular.css` | Estilos del módulo | Servidor, por FTP a `…/uploads/bitacora/` |
| `dss-proxy.php` | Proxy de placas del DSS con caché en disco acotada, de dos fuentes (`fuente=eso` y `fuente=skyview`) | Servidor, junto al JS/CSS |
| `ps1-proxy.php` | Proxy de `ps1cutouts` (STScI) con caché en disco: entrega el parche de una galaxia ya cosido de sus skycells (capa de galaxias desde imagen real) | Servidor, junto al JS/CSS |
| `generar_niveles.py`, `ps1_service.py` | Pipeline/servicio **experimental** de placas fotométricas (ver más abajo) | Herramientas offline, no requeridas |

Depende además de dos piezas **compartidas** con el resto de la web:

- `../resources/{js,css}/bitacora-base.*` — buscador de catálogo común y estilos base.
- El plugin `mapa/plugins/bitacora-registro/bitacora-registro.php` — expone el
  **endpoint público del catálogo de equipo** (ver *Acceso público*).

**Por qué el `.js`/`.css` van por FTP y no pegados en el editor.** El editor de
bloques de WordPress escapa el carácter `&` al guardar (convierte `&&` en
`&#038;&#038;`), lo que rompe el JavaScript. Servidos como archivos, llegan intactos.
El fragmento HTML que sí se pega **no contiene ni una línea de código**.

---

## Cómo funciona (el detalle técnico)

### Óptica

A partir del telescopio (focal `F`, apertura `D`) y el ocular (focal `f`, campo
aparente `AFOV`):

```
aumentos      = F / f
campo real    = AFOV / aumentos
pupila salida = D / aumentos
```

Con auxiliares puestos, `F` es la **focal efectiva**: cada uno aplica
`F × factor + extension_mm` sobre la que trae el de antes. Se admiten **dos**,
porque apilar Paracorr y Barlow es corriente, y se encadenan en orden: el
primero es el que va montado más cerca del tubo. La cuenta es una sola función,
`BitacoraEquipo.focalConAuxiliares()`, compartida con el formulario de registro.

### Magnitud límite (método del umbral de Torres Lapasió)

No es la típica regla que solo depende de la apertura. Sigue el *método del umbral*
de **J. R. Torres Lapasió** (`visib.pdf`), que tiene en cuenta el **aumento** (que
oscurece el fondo del cielo), la **transmisión** del tubo y el **brillo del cielo**:

1. Fondo del cielo visto por el ocular, oscurecido por el aumento:

   `SB0T = SQM + 5·log10(7,5·MAG / (D·√t))`, acotado a `[SQM, 27]`

2. Estrella más débil visible sobre ese fondo:

   `TLM = −22,81 + 1,792·SB0T − 0,02949·SB0T² + 2,5·log10(D²·t)`

La transmisión `t` sale del **tipo óptico** del catálogo (columna *Optics*):
refractor 0,9 · reflector 0,7 · catadióptrico 0,65–0,68 · 0,8 por defecto. El valor
se muestra como un **rango típico–óptimo** (`MARGEN_MAGLIM`), porque el método es
optimista y no es un número exacto.

### Simulación fotométrica (vistas de imagen)

El brillo no se ajusta "a ojo": hay una **simulación píxel a píxel**. El fondo de
cielo y el objeto se combinan según su **brillo superficial** real, con:

- **Fusión HDR** de dos placas (DSS1 + DSS2) para recuperar los núcleos quemados.
- **Atenuación por pupila de salida** (a más aumento, fondo más oscuro).
- **Adaptación local del ojo**, siempre activa.

Así, un cielo urbano **lava** los objetos tenues igual que en el ocular real.

### Estrellas de Gaia (Canvas 2D)

> **Módulo compartido.** Toda la consulta y el dibujo de esta vista viven ahora en
> `../resources/js/bitacora-gaia-render.js` (`window.BitacoraGaiaRender`), un módulo
> DOM-agnóstico que recibe `{ra, dec, arcmin, apertura, aumentos, óptica, sqm…}` y un
> `<canvas>`. El simulador es solo un consumidor (le pasa su equipo/cielo); el
> **formulario de registro** lo reutiliza para *Generar con el simulador*. Sus ajustes
> (`GAIA_CFG`) son `BitacoraGaiaRender.config`. El color sigue en `BitacoraGaiaColor`.

- **Consulta** a Gaia DR3 vía VizieR TAP, una vez por objeto, al radio máximo
  (`GAIA_RADIO_MAX ≈ 1,44°`) y hasta `magConsultaGaia(apertura, transmision)` —
  la profundidad depende del EQUIPO, no es una magnitud fija: un 8" y un 20" ya
  no piden ni "ven" el mismo catálogo. `GAIA_MAG_TOPE` (20,0, = `GAIA_MAX_MAG`
  en `gaia_proxy.php`) acota el máximo por seguridad. `TOP 40000` sigue siendo
  el límite de filas; el `ORDER BY Gmag` va **antes** del `TOP` (verificado en
  TAPVizieR): si hay truncamiento, se quedan fuera las **menos brillantes**.
- **Tamaño** = imagen estelar física (disco de Airy + seeing, ver más abajo), en
  cuadratura con un **suelo de visibilidad** en píxeles (`radioSuelo`, con un
  término extra `radioSueloMag · flujoRelativo^radioSueloExp` y `radioSueloMax`
  como tope de seguridad). El término extra depende del **flujo ABSOLUTO** de
  la estrella (`(apertura/aureolaAperturaRef)² · 10^-0,4g`, la misma fórmula que
  `alfaAureola`/`blurEstrella` más abajo), no de lo lejos que esté del límite
  del equipo (`mlim`): probado y descartado un suelo relativo a `mlim` porque
  con un equipo somero casi todo el campo queda a pocas magnitudes de SU propio
  límite y "engorda" en bloque, no solo las pocas estrellas realmente
  brillantes. Con flujo absoluto, una estrella dada mantiene su tamaño pase lo
  que pase con `mlim`, pero SÍ crece con la apertura (más D² = más fotones). Un
  **suelo de alfa** (`alfaMin`) evita que las del borde del límite se apaguen
  del todo por transparencia — ver más abajo la salvedad sobre campos muy ricos.
- **Escala con el aumento**: a más aumento (menos campo) las estrellas se agrandan
  (su tamaño angular en el ocular), `factor = √(escalaMagAfov / campo_arcmin)`
  acotado a `[1, escalaMagMax]`. Así un cúmulo lejano a mucho aumento (NGC 7789 con
  un 18") se ve rico y uno cercano a poco aumento (M35) fino, con la misma regla.
- **Brillo (alpha) relativo al equipo**: `alfaMin` y `rangoBrillo` (mag por debajo
  del límite que satura la opacidad a 1) son deliberadamente **fijos, no escalan
  con la apertura** — y eso es correcto, no un descuido. La detectabilidad de una
  estrella depende de su contraste sobre el fondo (ley de Weber-Fechner), y ese
  contraste ya está expresado en `(mlim − g)`: una estrella "3 mag por debajo del
  límite" tiene el mismo contraste perceptual en un 60 mm que en un 400 mm, porque
  `mlim` en sí YA integra la apertura (Torres Lapasió, más arriba). Lo que SÍ varía
  con la apertura por su cuenta, sin que `rangoBrillo` tenga que hacerlo, es el
  **halo** y el **color** — ver el punto siguiente —, porque esos dependen del
  flujo de fotones absoluto (∝ D²), no de lo cerca que esté la estrella del límite
  de detección de ese equipo concreto.
- **Halo del sprite (blur) por brillo ABSOLUTO**: cada estrella se dibuja con un
  borde más o menos difuso según `blurEstrella(g, apertura)`, que reutiliza la
  misma escala de flujo que la aureola (`alfaAureola`, ver abajo): al límite de
  detección sale con `blurMin` (borde duro, cabeza de alfiler); una estrella muy
  brillante, con `blur` (borde suave). Antes había un único `blur` fijo para toda
  estrella resuelta, así que hasta la más tenue del límite salía con el mismo
  halo que Sirio — se notaba especialmente mal en campos ricos y poco profundos.
- **Color relativo al equipo, no una magnitud fija**: el umbral de color
  (`magColorEfectivo = mlim − margenColorMag`) se mide desde el límite de
  detección de ESE equipo/cielo, no desde una magnitud absoluta fija. Antes, un
  umbral fijo (p. ej. mag 9) hacía que un 24" mostrara color exactamente hasta la
  misma magnitud catalogada que un 4" bajo el mismo cielo — cuando en realidad un
  equipo más profundo debería mostrar color más abajo en la escala, porque llega
  a estrellas objetivamente más brillantes en términos absolutos de lo que su
  propio límite permite ver con nitidez.
- **Color** a partir del índice **BP–RP** de Gaia mediante una tabla interpolada
  cuyos nodos son los **códigos de color físicos** de Harre &amp; Heller (2021),
  *«Digital color codes of stars»* ([arXiv:2101.06254](https://arxiv.org/abs/2101.06254),
  código [spec2col](https://github.com/janvincentharre/spec2col)): espectro real →
  funciones CIE del ojo → XYZ → sRGB. El tramo frío/rojo (BP–RP ≳ 2,7) se ancla a un
  espectro de **estrella de carbono** (cuerpo negro × bandas de absorción C₂ *Swan* +
  CN), que la hacen **más roja que un cuerpo negro** de su temperatura. Así las
  estrellas de carbono se **diferencian** y alcanzan el rojo ember, en vez de
  saturarse todas en el mismo naranja.
- **Saturación relativa al brillo ABSOLUTO de cada estrella, no constante**
  (`colorEstrella(bprp, carbono, g, apertura)`): reusa la misma fracción de
  flujo `f = min(1, alfaAureola(g,apertura)/aureolaAlfaMax)` que ya calibra
  `blurEstrella` — al techo de la aureola (estrella realmente brillante) sale
  con `GAIA_CFG.saturacion` completa; al límite de detección, `f≈0` y el color
  cae a neutro (`saturacion=1`, sin empuje). Modela el **efecto Purkinje**: la
  visión de color depende de los conos de la retina, que necesitan un mínimo de
  señal luminosa para activarse — por debajo de ese umbral el ojo ve en
  monocromo (bastones), así que una estrella tenue casi al límite se percibe
  deslavada hacia blanco/gris aunque su índice BP–RP diga que es azul o roja.
  Antes la saturación era la misma constante para toda estrella visible, así
  que un 18" no mostraba las estrellas de un cúmulo más "de color" que un
  telescopio pequeño, solo más grandes.
- **Corrección gamma sRGB** (`GAIA_CFG.gamma`): los códigos del paper son RGB
  *lineal*; mostrarlos crudos sobre-satura (las estrellas calientes salen demasiado
  azules). Por defecto se aplica gamma **del azul al blanco** (las O·B·A·F·G quedan
  azul-**blanco** natural) dejando **crudo el extremo rojo**, para conservar el rojo
  ember del carbono. Con `gamma.global = true` se corrige toda la tabla (coherente,
  pero los rojos de carbono se suavizan a naranja).
- **Realce de carbono (objeto-objetivo)**: la fotometría BP/RP de Gaia *satura* en las
  estrellas de carbono (muy rojas y brillantes) e infravalora su enrojecimiento. Como
  el catálogo ya sabe que el objeto es de carbono, a la estrella central (la más
  cercana al centro del campo) se le desplaza el índice hacia el rojo profundo
  (`GAIA_CFG.carbono`), devolviéndole el rubí que la hace famosa (p. ej. *La Superba*).
- **Glow de estrellas no resueltas**: las más débiles que la magnitud límite no se
  dibujan como puntos, sino como una mota tenue **aditiva ponderada por su flujo**.
  Donde se agolpan (cúmulos lejanos, núcleos de galaxias) su suma forma una **mancha
  nebulosa** —p. ej. **NGC 2158** junto a M35—, y el resplandor **escala con la
  apertura**, así un tubo mayor luce más.
  > **Techo conocido**: el dibujo usa `globalCompositeOperation = 'lighter'`
  > (aditivo), y `alfaMin` pone un suelo de opacidad por estrella SIN conciencia de
  > densidad de campo. En un campo disperso eso evita que la más débil se apague
  > del todo; pero en un campo MUY rico y profundo (miles de estrellas al límite,
  > como NGC 2158), la suma aditiva de ese suelo × recuento puede superar el
  > brillo de un cúmulo cercano con pocas estrellas brillantes (como M35),
  > invirtiendo su brillo relativo real. Se mitigó bajando `alfaMin` a `0.05`
  > (antes más alto), pero no está resuelto de raíz: la mejora real sería ponderar
  > ese suelo por densidad local de estrellas, o retirarlo del todo y fiar la
  > visibilidad únicamente al tamaño (que ya tiene su propio suelo, `radioSuelo`).
  > No implementado porque añade una complejidad (censo de densidad local) que no
  > se ha pedido todavía — ver el comentario `ponytail:` junto a `CFG.alfaMin` en
  > `bitacora-gaia-render.js`.

### Galaxias desde imagen real (parche de PanSTARRS)

Una galaxia no se pinta con un elipsoide analítico y ya está: se pinta con el
**parche real del stack 3π de PS1** (banda g), que trae los brazos, el polvo y
las regiones HII que ningún perfil de Sérsic sabe inventar. El parche llega por
`ps1-proxy.php` (ver *Caché de los parches de PanSTARRS*) y toda la cadena vive
en `bitacora-gaia-render.js`, en las funciones `ps1*`.

La cadena, en orden:

1. **`ps1AfinParche` / `ps1CieloAPixel`** — la WCS. El recorte **no viene con el
   norte arriba**: llega en la rejilla de su skycell, girada respecto al norte
   (−3,607° en M81). Las estrellas se proyectan con la TAN completa
   (`CRVAL`/`CRPIX`/`CDELT`·`PC`), no con una fórmula lineal: con la lineal, las
   máscaras de M81 caían **12 px** fuera de su estrella.
2. **`ps1QuitarEstrellas`** — quita las estrellas de Gaia del parche. Son
   estrellas de nuestra galaxia delante de la imagen: si se dejan, el simulador
   las pinta dos veces (una del catálogo, otra de la foto). Excepción: la
   fuente **nuclear** (su máscara cubre el centro de la galaxia,
   dist < radio de máscara) no se toca — Gaia trae los núcleos puntuales como
   estrellas, y quitarlos dejaba una «bola dentro de un anillo oscuro» (M104,
   M81). La protección es por fuente; una estrella normal que pise el disco
   nuclear se elimina igual.
3. **`ps1AnclarACatalogo`** — apaga lo que no llega a cielo + `kRuido`·σ y
   reparte el presupuesto de luz que dicta la mag V del catálogo. Tres casos,
   no dos: lo que cae **por debajo de cielo − `kAusencia`·σ** no es cielo, es
   **sobresustracción del stack** (píxeles negativos dentro del cuerpo), y se
   marca NaN = *ausencia de medida* (ver *Las depresiones oscuras* más abajo).
4. **`ps1PsfParche`** — el borrón del telescopio, lo que separa lo que ve un
   80 mm de lo que ve un 400 mm (ver *La resolución del recorte* más abajo).
5. **La mezcla E** — `campo = w·s·imagen + (1-w)·perfil`, con `w`
   (`ps1PesoImagen`) la fracción de píxeles con señal en una caja de
   `mezclaCajaAs`, y `s` (`ps1EscalaMezcla`) el factor que **cierra la
   fotometría exactamente**. Donde la imagen midió, manda la imagen; donde no
   hay información, manda el perfil del catálogo.
6. **`ps1PintarParche`** — el paso al lienzo va por interpolación **bilineal**
   (mezcla por vecino): reconstrucción/remuestreo, no una fuente de resolución
   (`scripts/test_bilineal_parche.js`).

#### El umbral de contraste depende del tamaño aparente (ley H2c)

Al pintar, el parche entra en la cadena fotométrica (`ctxFotometrico`) con el
**tamaño intrínseco** de la galaxia (`ps1ThetaIntArcmin`: la isofota μ=25
circularizada, los mismos ejes que deciden el halo). El umbral de contraste ya
no depende de los aumentos a secas, sino del **tamaño aparente real** del
objeto en el ocular:

    Cmin *= (1 + θR(SBe) / (θeff·aumentos))²
    θeff = √(θint² + seeing²),  log10 θR = 0.094 + 0.081·SBe

con θR(fondo) medido sobre los datos de Blackwell (1946). Un objeto grande está
en el *plateau* (factor ≈ 1: no se le regala nada); uno pequeño paga la
pendiente de Ricco; el seeing pone el suelo de θeff. El nivel absoluto
(K = 2.0 = conservar `C_MIN`) quedó **validado en campo** con 12 observaciones
reales (10/12 acordes, y los márgenes ordenan visto / lateral / no visto):
`scripts/campo_h2c.js` + `docs/ricco/campo/observaciones.csv`.

La ley vive tras `FOT.H2C`, **activa por defecto**; `FOT.H2C = null` recupera
la vía histórica C_MAG bit a bit, que queda solo como regresión
(`scripts/test_h2c_invariancias.js`, invariancias A–F). Las capas difusas que
no traen θint siguen en la vía C_MAG mientras no lo traigan.

#### Dónde se enciende, y qué se dice cuando no hay imagen

La capa va **encendida** y se apaga con la casilla *Galaxias con imagen real*,
junto al selector de origen. La casilla no gobierna una variable del simulador
sino la **opción del módulo compartido** (`BitacoraGaiaRender.galaxiasImagen`),
que es lo que hace que el generador de imagen del formulario de registro pinte
lo mismo sin casilla propia: `ps1CapaGalaxias` es el único sitio donde la capa
se monta, y lo llaman los dos.

Solo se pinta en la vista **Canvas 2D de Gaia**: en las placas del DSS o de
PanSTARRS la galaxia ya viene en la propia imagen, y ahí la casilla se apaga en
gris. Con la capa encendida la consulta de Gaia de esa vista baja hasta el tope
del proxy (`ps1MagConsulta`), porque la máscara necesita todas las estrellas que
PS1 registra; el realce sobre las placas no paga esa profundidad.

Cuando el objeto **apuntado** es una galaxia del RC3 y se queda sin capa, se
avisa **con la causa**, porque cada una deja al observador en un sitio distinto:

| Causa | Qué se dice | Qué puede hacer |
|---|---|---|
| δ < −30° | PanSTARRS no cubre por debajo de −30° de declinación | nada: ahí no hay cartografiado |
| no cabe en su parche (`fracMin`) | la galaxia es mayor que el recorte que sirve PanSTARRS, y el stack pierde su disco exterior al restar el fondo | nada: son M31, IC 342 y M33, y con el parche saldría un bulbo suelto |
| el servicio no responde | el servicio de imágenes no responde | volver a intentarlo |

De las **compañeras** del campo no se dice nada (en Virgo saldrían cinco líneas
sobre galaxias que nadie buscaba), y de un objeto que no está en el RC3 tampoco:
no había nada prometido.

#### La resolución del recorte, y por qué la apertura no se notaba

El parche **no es la galaxia**: es la galaxia ya emborronada dos veces, por el
seeing del stack de PS1 (`PS1.seeingAs` = 1,1″ de FWHM) y por el **propio píxel
del recorte**, que es una caja de `escalaAs` de lado. Lo que falta para que sea
lo que se ve por un ocular es la **diferencia en cuadratura** con el borrón del
telescopio:

```
θ_res(D) = 2 · radioImagenEstelar(D)                    ← Airy ⊕ seeing, ya existía
θ_parche = √(PS1.seeingAs² + (0,6796·escalaAs)²)
θ_add    = √(max(0, θ_res² − θ_parche²))                 ← lo que ps1PsfParche añade
```

Cero constantes físicas nuevas: `airyArcsec`, `seeingArcsec` y `PS1.seeingAs` ya
estaban, y `radioImagenEstelar` ya las combinaba para las estrellas. El 2,3548
(FWHM→σ) y el 0,6796 (caja→gaussiana, `2,3548/√12`) son definición y geometría.
Si el parche ya viene más borroso que el telescopio, `θ_add` sale **0** y no se
toca nada: no se puede desconvolucionar, y fingir que sí es inventar resolución.

**Lo que costó descubrir esto.** `PS1.salida` estuvo mucho tiempo en 512 px, así
que `escalaAs = ladoArcmin·60/512` — 2,35″/px en una galaxia de 20′, nunca la
nativa de 0,25″ de PanSTARRS. A esa escala la PSF de una apertura grande no es
que sea pequeña: **es la identidad en float32**. Con σ = 0,14 px el kernel
gaussiano sale `[8e-12, 1, 8e-12]`, de modo que un 457 y un 914 mm daban la
**misma imagen bit a bit**. Cualquier intento de que la apertura se notara en la
estructura de una galaxia chocaba antes con el muestreo que con la física.

A `salida = 1024` (1,17″/px en 20′) esos dos se separan entre **1,0 y 3,3 σ del
ruido de cielo** en M51/M81/M101/NGC 205, unas **213 veces el suelo de
sensibilidad** del método —medido comparando 914 contra 920 mm, dos aperturas
indistinguibles en la práctica— y con el signo correcto: más apertura, menos
borrón añadido (`θ_add` = 3,76″ a 80 mm, 2,00″ a 203, 1,59″ a 457, 1,50″ a 914).

> **Dónde se aplica importa tanto como cuánto.** Va en los píxeles del **parche**,
> una sola vez por parche y apertura (cacheada en `parche.psfDatos`/`psfD`), y
> **antes** de la mezcla. Consecuencias que hay que preservar si se toca esto:
> el lienzo, el campo aparente y los aumentos **no entran** en el cálculo; la
> borrosidad es angular y fija (″), así que al subir aumentos crece en pantalla
> lo mismo que crece la galaxia —**aumentar no resuelve**, que es lo que hace la
> naturaleza—; y sin la caché cada repintado convolucionaría sobre el resultado
> anterior y el borrón se **acumularía**. `parche.datos` no se muta nunca.

`desenfocar()`, el que ya había, **no sirve aquí** y su propio comentario lo dice:
pasa por un canvas de 8 bits y recorta a 0–255. El parche son flujos, no grises.

#### La máscara de no finitos se restaura después de convolucionar

No es cosmética. Los píxeles no finitos del parche **no están repartidos al azar:
están en el centro de las estrellas saturadas del stack**. En NGC 205 la mediana
del entorno de sus 75 huecos vale 12473, contra −1,06 de mediana de cielo.

La convolución es NaN-aware —salta los no finitos y renormaliza por el peso que
sí usó, o cada hueco se comería un disco de 3σ—, pero eso **los rellena con su
propio entorno saturado**, que es lo más brillante de la imagen: el flujo total
subía un **4,44 % en M81 y un 5,18 % en NGC 205**, y aparecían puntos brillantes
que no están en el cielo. Restaurando la máscara original al final, el Δ de flujo
baja de 0,3 % en los cuatro objetos de prueba.

> **En M51 y M101 el efecto no se ve** (0,01 %), porque sus huecos no caen en
> estrellas. Si solo se prueba con M51, este fallo pasa desapercibido — y no lo
> detecta la métrica obvia (RMS global), solo la suma de flujo.

Es el mismo criterio que ya seguía el bucle de pintado con su `if (!(f > 0))
continue;`: una ausencia de dato no debe convertirse en dato.

#### El radio de máscara de cada estrella

`ps1RadioMascaraAs(g)` crece **geométricamente**, ×10^(0,4/3) ≈ 1,359 por
magnitud, acotado entre el seeing del stack y `mascaraMaxAs`. No es un número
elegido a ojo: apilando **19 031 estrellas de Gaia sobre 33 parches de PS1**, y
restando a cada una un testigo del mismo radio galactocéntrico para que la
galaxia se vaya en la resta, el radio de contaminación medido crece **×1,362 por
magnitud** (α = 2,98 contra el α = 3 que supone la ley: un ala de PSF r^-3).

Lo que sí estuvo mal mucho tiempo fue el **tope**, no la forma. Con
`mascaraMaxAs = 25″` la ley se cortaba en g ≈ 11,6, y de ahí para arriba las
medidas piden 35–37″ (g 10–12) y 48″ para la estrella de g=8,5 del muestreo.
Está en **60″**, que cubre todo el rango medido; más allá ya sería
extrapolación, y por eso se corta.

> **Si tocas este número, mide antes.** La saturación del stack es real y está
> cuantificada (empieza en g ≈ 12,5 y se hunde 1 dex por debajo de g=11), pero
> **no** justifica una ley aparte para las saturadas: sus radios siguen la misma.
> Y subir el tope a 90″ no cambió nada medible ni siquiera en el parche que
> tiene la estrella más brillante de las 33.

#### Cómo se rellena la máscara, y por qué depende del tamaño

Al tapar una estrella queda un agujero que hay que rellenar con algo. Hasta
`rellenoPlanoMaxAs` (40″) se usa la **mediana de la banda de isofota elíptica**
del píxel (b/a y PA del catálogo): el fondo galáctico local a ese radio. El
relleno plano de antes (mediana de un anillo circular, `ps1FondoAlrededor`)
hundía el bulbo al nivel del anillo exterior y queda solo para llamadas sin
geometría de galaxia.

Por encima, **no**: el disco se deja al nivel del cielo, el anclaje lo apaga,
`w` cae a 0 dentro y lo rellena `(1-w)·perfil`.

La razón es que el relleno plano solo vale mientras la galaxia apenas cambie de
brillo entre `r` y `1,6r`. En una máscara ancha el anillo cae ya en la periferia
y trae decenas de veces menos luz de la que había dentro. Y el fallo se
realimenta: esa meseta pasa el umbral de anclaje, así que **`w` la cuenta como
señal**, se queda en 1 dentro del disco y el perfil no puede corregir nada. En
NGC 5055, `campo/perfil` dentro del disco de la estrella de g=9,2 daba **0,025**:
un disco negro en mitad de la galaxia. Con el relleno hueco sube a 1,000.

El umbral tampoco se puede bajar sin más: el hueco tiene su propio precio en el
**borde** (mientras `w` recorre la rampa hay datos a cero, y el anillo queda a
`(1-w)·perfil`). Con el umbral puesto en la caja de la mezcla (25″), los discos
de ~30″ de M81 salían dibujados como dos aros oscuros. 40″ es donde las medidas
sitúan el cruce: el relleno plano da 0,999 de 25 a 40″ y 0,025 a 56″.

> **La regla general, que vale más que los números concretos:** un relleno que
> ha dejado de representar el fondo local **no es imagen válida**, y no debe
> conservarse como si lo fuera. Esa región es *ausencia de información*, y le
> toca a la mezcla E reconstruirla con `(1-w)·perfil`. Es el mismo error, un
> paso más adelante, que creer que una ausencia de señal tras el corte de 1,5σ
> demuestra que allí no hay galaxia: no lo demuestra, solo dice que no se midió.

#### Las depresiones oscuras (M51/M81) y la semántica de ausencia

M51 salía con un **foso negro** alrededor del cuerpo y M81 con la envolvente
apagada. El diagnóstico (dos experimentos con réplica bit a bit del pintado)
exoneró a H2c, a `ps1QuitarEstrellas` y a la máscara de escena: el problema
eran dos, y se corrigen por separado.

- **M51: sobresustracción del stack.** El 27,6 % de los píxeles del anillo
  venía por debajo del suelo del anclaje, muchos **negativos** — el mismo
  mecanismo que deja a M31 sin disco exterior, a escala menor. Anclarlos a 0
  los convertía en una *medida falsa de oscuridad* que `w` contaba como señal
  (w≈1 dentro del cuerpo), así que el perfil no podía rellenar nada. La regla:
  `v < cielo − kAusencia·σ` (k = 2, meseta medida en k = 1–3) pasa a **NaN**, y
  el NaN se trata en el pintado **igual que el vecino de fuera del parche**
  (flujo 0, peso 0, cuenta en cobertura): lo rellena `(1-w)·perfil`. La
  variante «hueco» (saltar y renormalizar) está medida y **no funciona**,
  porque `ps1PesoImagen` no distingue NaN de 0. Es la regla general del relleno
  de máscara aplicada un paso antes: una ausencia de señal no demuestra que
  allí no haya galaxia, solo que no se midió.
- **M81: la rampa de opacidad amplificaba el contraste.** `ps1Opacidad` eleva
  el margen sobre el umbral a `deltaExp`; la amplificación entre dos zonas es
  `(Δ1/Δ2)^deltaExp` — con 1,8, un contraste ×5 de imagen salía **×37 en
  pantalla** (interbrazo real pintado de negro). Con `deltaExp = 1.0` queda en
  ×11,8 (imagen ×5,3 más el realce perceptual). Subir `deltaPlena` en su lugar
  **apaga los brazos**: no es el mando correcto y se queda en 2,5.

Bajar `deltaExp` alivió el síntoma, pero no la causa: **la rampa es la ley de
DETECCIÓN**, y dentro de un objeto que el observador ya ha detectado volvía a
decidir píxel a píxel, esculpiendo estructura interna que no está en los datos
(el anillo negro alrededor del bulbo de M81, el negro entre los brazos de M51,
que se lleva del 60 al 82 % del contraste que la zona tenía sobre el cielo).
La separación es conceptual, no un parámetro más: **dentro de la escena difusa
la opacidad es 1; fuera, la rampa de siempre** (`PS1.opacidadInternaEscena`).
«Dentro» es la misma `ps1EscenaEnParche` que ya decide qué estrellas conserva
el parche —la unión de elipses isofotales μ=25 de *todos* los componentes
catalogados—, así que la compañera está protegida igual que la galaxia
apuntada. Medido en las cuatro galaxias: ningún píxel baja y lo brillante no se
mueve un nivel; M81 recupera los brazos, M51 el puente hacia NGC 5195, M101 el
disco exterior sin perder las regiones HII, y M104 no cambia. Juzgar la
opacidad con el **perfil del catálogo** en vez de con la escena está probado y
**descartado**: el modelo solo representa la galaxia apuntada, así que borraba
todo lo demás (NGC 5195 casi desaparecía). Guardián:
`scripts/test_opacidad_escena.js`.

Con el cambio, la semántica de NaN queda **unificada en toda la cadena**
(antes el anclaje lo convertía en 0 y la rama de «hueco» del pintado era
código muerto): los huecos de estrellas saturadas también reciben ahora el
perfil en la mezcla con halo — la protección que importa (no rellenarlos con
su entorno saturado, sección anterior) sigue intacta, porque el relleno es el
modelo, no el entorno. El guardián de todo esto es
`scripts/test_ps1_nan_ausencia.js`.

#### Lo que sigue sin estar resuelto

- **Estelas de sangrado** de las estrellas saturadas: barras largas que cruzan
  el parche. Una máscara **circular** no las cubre sin tragarse media galaxia;
  haría falta otra *forma* de máscara, no más radio.
- **Discos de máscara muy pequeños (< 3″) en zona brillante**: `campo/perfil`
  baja a 0,774 en M81. Es el peor caso medido y ningún cambio reciente lo toca.
- **Un detector de estrellas residuales queda descartado**: se probó y empeoraba
  el resultado. Lo que fallaba era la WCS, no la falta de un segundo detector.
- **1024 px no llega a la resolución ideal en las galaxias grandes.** A 20′ da
  1,17″/px, con la PSF en σ = 0,54–0,72 px: representable, pero **marginal**
  (bandas de diagnóstico: <0,5 subpíxel · 0,5–1 marginal · ≥1 representable).
  Llegar a 0,67″/px pediría 1794 px, por encima de `PS1_SALIDA_MAX` = 1024 del
  proxy, y cuadruplicaría otra vez el peso. En las galaxias pequeñas (parche de
  1,5–8′) la escala ya es holgada. Subir el tope del proxy es una decisión de
  ancho de banda, no de física.
- **Estelas de sangrado y huecos**: la máscara conservada deja los huecos como
  huecos, que es lo correcto, pero no los *rellena* con nada plausible. Ahí la
  mezcla E pone `(1-w)·perfil`.
- **La PSF renormaliza en los bordes de hueco**: `ps1PsfParche` salta los NaN y
  reparte el kernel entre lo que queda, así que los píxeles pegados al hueco
  suben (~+7 niveles en los brazos de M51) sin información nueva — flujo no
  conservativo localizado. Medir antes de tocar, en un experimento propio.
- **NaN aislados dentro del cuerpo con w≈1 dejan punteado fino**: el vecino
  único ausente deja `(1-w)·perfil ≈ 0` en su píxel de lienzo. Candidatos
  (cierre morfológico de la máscara de ausencia, o dejarlo estar) por medir.

Los tests de todo esto están en `scripts/test_difuso.js` (`node
scripts/test_difuso.js`), incluidos los que fijan la monotonía y la continuidad
de `R(g)`, el máximo absoluto, y los dos regímenes de relleno.

Los de la resolución y la PSF van aparte, porque necesitan parches de verdad:

| Script | Qué fija | Red |
|---|---|---|
| `test_resolucion_ps1.js` | Que `escalaAs` es de **adquisición** y no de render (ni el lienzo ni los aumentos la mueven), que remuestrear conserva el brillo superficial y que el pico deja de subir al llegar a nativo | no: los números medidos están clavados |
| `test_psf_parche.js` | La física de `θ_add` sola, contra la MTF analítica | no |
| `test_psf_produccion.js` | El camino de producción contra el harness ya validado, sobre M51/M81/M101/NGC 205: convolución idéntica **bit a bit**, máscara conservada, flujo, PSF aplicada **una sola vez**, 457 ≠ 914, y el pintado entero de `ps1PintarParche` | sí, la primera vez (deja los parches en `$TMPDIR/bitacora-ps1-harness`) |
| `harness_decision_psf_resolucion.js` | El experimento que decidió el 1024: cuatro configuraciones × cuatro objetos × cuatro aperturas × cinco seeings | sí |
| `test_bilineal_parche.js` | El paso al lienzo por bilineal: conserva flujo, no inventa resolución, no crece frente al vecino | no |
| `test_ps1_nan_ausencia.js` | La semántica de ausencia: sobresustraído y NaN del stack se rellenan con el perfil exacto, el píxel válido ancla bit a bit igual, el peso no cambia, y M51/NGC 205 de verdad (foso fuera, sin halo artificial, sin puntos nuevos) | sí, la primera vez |
| `test_h2c_invariancias.js` | La ley H2c: activa por defecto, invariancias A–F (plateau, mismo θapp mismo factor, pendiente de Ricco, suelo de seeing, sin PSF) y la vía C_MAG intacta con `FOT.H2C = null` | no |
| `campo_h2c.js` | No es test: contrasta el umbral contra observaciones reales (`docs/ricco/campo/observaciones.csv`); con él se validó K = 2.0 | no |

> **Si mides estructura, no normalices por la σ de cada imagen.** Convolucionar
> baja el ruido de fondo, así que el denominador encoge justo cuando la
> estructura cae y la métrica **sube al revés**. Hay que usar una σ de
> referencia fija por objeto. Y un «suelo de ruido» que compare un cálculo
> consigo mismo da cero y no dice nada: el suelo se mide con dos aperturas
> prácticamente iguales (914 contra 920 mm).
>
> **Y la rejilla de medida ha de ser al menos tan fina como el parche más fino
> que se compare.** Medir un parche de 1024 px sobre un lienzo de 512 tira tres
> de cada cuatro píxeles y produce un aliasing que se confunde con física.

### Halo de los cúmulos globulares (perfil de King)

Los 149 cúmulos del catálogo de **Harris** (1996, rev. 2010) pintan, además de sus
estrellas individuales de Gaia, un **halo no resuelto** con el perfil de brillo
superficial de **King (1962)**, anclado a los parámetros medidos del cúmulo (radio
de core `r_c`, concentración `c = log(r_t/r_c)` y brillo superficial central `mu_V0`),
no a un ajuste visual:

- **`perfilKing`/`areaKing`**: forma cerrada del perfil (1 en el centro, 0 en el radio
  de marea `r_t`) y de su integral de área efectiva, sin discretizar en anillos (evita
  artefactos de anillos visibles en renders anteriores basados en esa técnica).
- **Resta de luz ya resuelta (evita contar dos veces)**: el flujo total catalogado
  (`mu_V0`) incluye la luz de las estrellas que Gaia también dibuja como puntos: se
  resta su flujo sumado antes de pintar el halo. Esa resta usa una consulta **aparte**,
  a **profundidad y radio fijos** (`CFG.globular.magResta`), independiente del telescopio
  del visor — si usara la misma consulta que alimenta el dibujo de estrellas (que sí
  varía con la apertura), cambiar de equipo cambiaba cuánta luz se restaba y el halo
  podía **apagarse de golpe** al pasar a un telescopio más grande. Con tope
  `restaMaxFrac` (85 % del flujo total) para que esa resta nunca lo apague del todo.
- **Amortiguación cerca de estrellas resueltas ("gotas de rocío sobre una perla")**:
  el borde (blur) de cada estrella dibujada se afina hacia cabeza de alfiler cuando el
  halo de fondo en su posición es tenue frente a su propio brillo (comparación en
  magnitudes, `mu(r)` del halo vs. magnitud de la estrella), para que las estrellas del
  cúmulo se vean nítidas sobre el resplandor en vez de difuminadas por él.
- Todo verificado sin navegador en `scripts/test_globulares.js` (forma del perfil,
  conservación de flujo, tope de la resta, monotonía radial sin anillos, continuidad de
  la amortiguación). Catálogo regenerable con `python3 scripts/gen_globulares.py`
  (fuente: `mapa/datos/harris_mwgc.dat`; no editar `globulares-datos.js` a mano).

### Diffraction spikes (cruz de difracción de la araña)

Las estrellas **brillantes** lucen el destello en cruz que produce la **araña** del
secundario en los reflectores (Newton, etc.). Solo se dibuja en telescopios **con
araña** (`OPTICA_ARANA`: Newtonian, Cassegrain, RC…); refractores y SC/Mak, que no
tienen brazos, no lo muestran. **Longitud e intensidad ∝ el brillo (magnitud)** de
cada estrella, y todo escala con el aumento.

Cada brazo de la araña es un obstáculo fino: por el **principio de Babinet**
difracta como una **rendija**, de modo que la intensidad **a lo largo del brazo**
sigue el patrón de una sola rendija (perfil sinc²):

$$I(\theta) = I_0 \left( \frac{\sin\!\left(\frac{\pi a \sin\theta}{\lambda}\right)}{\frac{\pi a \sin\theta}{\lambda}} \right)^{2}$$

donde `a` es el grosor del brazo, `λ` la longitud de onda y `θ` el ángulo respecto
al centro. En el render ese perfil (lóbulo central brillante + lóbulos secundarios
decrecientes, la firma de la difracción) va **horneado en el sprite** de un brazo,
con una gaussiana fina en el grosor; el sprite se estampa girado `brazos` veces por
estrella. Se dibuja solo en el Canvas 2D (en las placas DSS/PanSTARRS los spikes ya
vienen en la propia foto).

La cruz se **tiñe con el color de la estrella** (la difracción es de su propia luz),
no en blanco: así, en un reflector, la cruz de una estrella de carbono es **roja** y
**no lava el color del núcleo a blanco** —el problema que se ve al comparar un reflector
(con araña) con un refractor/APO (sin ella)—. Además, el arranque del brazo se atenúa
(no se apila sobre el núcleo coloreado), que la estrella tapa.

### Estrellas dobles

La categoría **dobles** reutiliza toda la maquinaria (selector, ficha, óptica, render de
Gaia). Sus datos salen de un **catálogo unificado** que fusiona tres programas de
observación (ver *Pipeline de dobles* más abajo).

- **Render por Gaia, sin síntesis**: el par se dibuja con las **posiciones y colores
  reales** de las componentes que trae Gaia DR3, así que la **separación y el ángulo de
  posición son verdaderos** (las fuentes traen la separación, pero no el PA). El catálogo
  de la doble solo se usa para la **ficha** y el **veredicto de resolución**, no para
  colocar estrellas. En dobles muy brillantes o muy cerradas (mag 0–3, sep <1″) Gaia puede
  saturar o no traer las dos entradas: es una limitación asumida del enfoque.
- **Ficha**: magnitudes de las componentes A y B, separación (″), tipo (doble/triple/
  múltiple), **insignias** de los catálogos en que aparece y el veredicto de resolución.
- **Veredicto «¿se resuelve con tu equipo?»**: dos condiciones independientes.
  1. **Apertura** — límite de **Dawes** `116 / D(mm)` ″ (resolución por difracción). Si la
     separación es menor, el par es inseparable con esa apertura.
  2. **Aumento** — aunque la apertura resuelva, hace falta ampliación para *percibir* el
     hueco: se usa `aumentos · sep ≳ 480″` (hueco cómodo, ~8′ de campo aparente) y `≳ 300″`
     para empezar a partirlo. El veredicto propone el aumento cómodo (`≈ 480 / sep`).

  Se apoya en las fórmulas de Dawes/Rayleigh documentadas en
  [`notas-resolucion-dobles.md`](notas-resolucion-dobles.md). **Pendiente para v2**: un
  penalti por diferencia de magnitud (pares desiguales tipo Sirio/Antares son más difíciles;
  no hay fórmula limpia aceptada) y un filtro «resoluble con mi equipo ahora» en el buscador.

### Pipeline de dobles

El catálogo unificado se genera con `python3 scripts/gen_dobles.py`, que fusiona tres
CSV fuente (en `mapa/datos/`) en uno solo:

- **Match por alias normalizado**: claves fuertes y únicas (`HD`, `SAO`, `HR`, Flamsteed,
  `STF`/`Struve`) unen la misma doble catalogada bajo designaciones distintas; el **Bayer**
  griego es clave *débil* (solo une si no colisiona: θ¹/θ² Ori comparten «θ Ori» pero son
  estrellas distintas). Los **nombres propios** son solo para buscar/mostrar, nunca clave.
- **Pasada final por coordenadas acotada** (≤ 50″, ΔMag ≤ 0,6) solo para dobles que no
  comparten ningún alias (p. ej. `HR8281` = `STF 2816`). El match por alias sigue mandando.
- **Desempate** campo a campo, primer no-vacío, prioridad `AL > RASC > Cambridge`.
- **Salidas**: `mapa/datos/estrellas_dobles.csv` (unificado), `mapa/datos/catalogos_dobles.csv`
  (código → nombre largo, para el futuro seguimiento de progreso por catálogo) y el módulo
  `estrellas-dobles-datos.js`. Prueba sin framework: `python3 scripts/test_dobles.py`.

Añadir un catálogo futuro = soltar su CSV en `mapa/datos/` y añadir una entrada a la lista
`FUENTES` de `gen_dobles.py` (con el mapeo de sus columnas). No editar el `.js` a mano.

### Orientación del campo

Al comparar la vista de Gaia con la del DSS **el campo parece levemente girado**. Medido:
**el render de Gaia es el correcto** y **la placa del DSS es la que llega girada**.

- **Gaia** proyecta `x = SIZE/2 − Δα·cos(δ₀)·escala`, `y = SIZE/2 − (δ − δ₀)·escala`: norte
  arriba y este a la izquierda **exactos**, sin giro ni cizalla (comprobado a 0,000 px).
  Es la misma convención que sirve hips2fits para PanSTARRS (`projection=TAN`).
- **El DSS del ESO** (`archive.eso.org/dss/dss/image`) no reproyecta: recorta un trozo de
  la **placa Schmidt original** (6,5° de lado) y lo devuelve **en el sistema de esa placa**,
  cuyos ejes se alinearon con el norte en el **centro de la placa**, no en el del recorte.
  Entre esos dos puntos los meridianos convergen, así que el norte del recorte queda girado
  **≈ −Δα·sen(δ)**. El propio FITS lo declara en `CROTA2` (y avisa de que es *inaccurate due
  to considerable skew*):

  | Campo | Placa | `CROTA2` del FITS | `−Δα·sen(δ)` |
  |---|---|---|---|
  | M39 | E589  | +1,373° | +1,024° |
  | M35 | E1278 | +0,228° | +0,408° |
  | M13 | E1069 | +1,910° | +1,711° |
  | M42 | J8979 | −0,161° | −0,169° |

  El modelo acierta siempre el signo y queda a <0,35°; el resto es la inclinación con que se
  expuso cada placa. Prueba: `node scripts/test_orientacion_campo.js`.

El giro **cambia de campo en campo y hasta de signo** (0,2°–1,9° en la muestra), así que no
hay constante que descontar. **Consecuencia práctica**: `superponerGaia()` pinta estrellas
de Gaia (norte arriba) sobre la placa del DSS (girada), así que la superposición **casa en
el centro y deriva hacia los bordes**, unos 20″–60″ según el tamaño del campo y el giro de
esa placa.

#### La salida: SkyView sirve el DSS, el ESO queda de respaldo

El origen **DSS** sirve las **mismas placas**, reproyectadas por
[SkyView](https://skyview.gsfc.nasa.gov) sobre la rejilla que se le pide. Pedidas con los
parámetros que arma `dss_url(..., 'skyview')`, sus cabeceras traen `RA---TAN`/`DEC--TAN`,
`CDELT1` negativo, `CDELT2` positivo y **ninguna** `CROTA` ni matriz `CD`: norte arriba y
este a la izquierda exactos. La tercera parte de `scripts/test_orientacion_campo.js` cruza
esa rejilla con la proyección del render de Gaia y comprueba que colocan la misma estrella
en el mismo punto del campo (a 10⁻⁶ del lado).

SkyView es además **el que compone bien la fusión HDR**. Del ESO, DSS1 y DSS2-red llegan
como dos placas distintas —1059×1059 con `CROTA2` +1,910° una, 1782×1786 con otro giro la
otra—, así que `fusionarPlacas()` regresiona píxeles que no son del mismo trozo de cielo.
Remuestreadas por SkyView las dos caen en la **misma rejilla** y la fusión compara lo mismo.

Por eso el origen **DSS** del simulador es SkyView, y **el ESO se queda solo como respaldo
automático**: si SkyView no responde, `renderDSS()` reintenta una vez con `fuente=eso` y
avisa de que el campo llega girado. No se ofrece a elegir —dos entradas de DSS en el combo
confundían—, pero sigue ahí como segundo proveedor: SkyView es un servicio único y con
paradas de mantenimiento.

Lo que se pierde con el remuestreo: **grano**. SkyView suaviza la textura de la placa
original y aplica su propio estirado a 8 bits, algo más apagado que el del ESO (mismo campo
de M13 en DSS2-red: mediana 40→32, p90 73→60). Como `flujoDePlaca()` lee el nivel de gris
como brillo superficial, la vista sale un punto más oscura que con el ESO.

Descartadas, probadas: leer el `CROTA2` de cada placa y desgirar en el cliente —el archivo
del ESO **no admite peticiones `Range`** (devuelve `200` con los 2,26 MB del FITS entero),
así que costaría bajar el FITS completo por campo solo para un keyword—; y el **HiPS de
DSS2 vía hips2fits**, que agotó el tiempo de espera a los 75 s.


---

## Configuración

Casi todo se afina desde constantes al principio de `bitacora-ocular.js`, sin tocar
la lógica:

| Bloque | Controla |
|---|---|
| `GAIA_CFG` (= `BitacoraGaiaRender.config`) | Render de Gaia: **halo de estrella** (`blur` = tope para estrellas brillantes, `blurMin` = suelo al límite de detección — ver `blurEstrella(g, apertura)`); **halo de cúmulo globular** (`globular.rangoMag` = margen de la amortiguación cerca de estrellas resueltas, `globular.magResta`/`globular.restaMaxFrac` = profundidad fija y tope de la resta de luz ya resuelta — ver *Halo de los cúmulos globulares* más arriba); **color** (`margenColorMag` = margen bajo `mlim` al que aparece el color — ver `magColorEfectivo`; `tinteNucleo`; `carbono` con `bprpOffset`/`bprpMin` del realce rojo del objeto de carbono; `gamma` con `global` on/off y `hasta`/`desvanece`, la banda donde la gamma se desvanece hacia el rojo); **tamaño** (`radioSuelo`/`radioSueloMag`/`radioSueloExp`/`radioSueloMax`, más `margenSuelo`/`radioSueloMin` para el recorte del suelo en dobles — ver `radioEstrella()`); **brillo/alpha, relativo al equipo** (`brillo`, `alfaMin` — ver el techo conocido en *Glow de estrellas no resueltas* —, `rangoBrillo`); **escala con el aumento** (`escalaMagAfov`, `escalaMagMax`); **aureola** (`aureolaRadio`, `aureolaAlfaK`, `aureolaAlfaMax`, `aureolaAperturaRef` — ver `alfaAureola()`); y el **glow** de no resueltas (`glowIntensidad`, `glowRadio`). Todo probado sin navegador en `scripts/test_estrella_fisica.js` y `scripts/test_blur_color_absoluto.js`. |
| `PS1` (= `BitacoraGaiaRender.ps1`) | Capa de galaxias desde imagen: **adquisición** (`salida` = px del recorte que se pide al proxy, hoy 1024 y tope del proxy — leer antes *La resolución del recorte*; `banda`, `seeingAs` = 1,1″ del stack, `ladoFactor`/`ladoMin`/`ladoMax` = campo del parche, `fracMin` = puerta de cobertura); **máscara de estrellas** (`mascaraMaxAs` = 60″, `rellenoPlanoMaxAs` = 40″ — **si tocas estos, mide antes**); **mezcla E** (`mezclaCajaAs`, `mezclaW0`); **halo** (`haloMenorMin`, `haloMuFijo`, `muHalo`, `deltaPlena`, `realceMax`). |
| `GAIA_COLOR` | Tabla `[BP–RP, R, G, B]` que fija el color por índice. Nodos anclados a los códigos físicos de Harre &amp; Heller (spec2col); el extremo rojo, a un espectro de estrella de carbono. |
| `GAIA_CFG.spikes` | Cruz de difracción: `magMax` (umbral de brillo), `brazos` (nº de puntas), `angulo` (`0` = `+`, `45` = `×`), `longMag`/`longMax` (longitud), `grosor`, `lobulos` (lóbulos sinc²), `intensidad`. |
| `OPTICA_ARANA` | Qué tipos ópticos tienen araña (→ muestran spikes). El telescopio manual lo hereda de la opción "Reflector / Newton" (`data-arana` en el HTML). |
| `FOT` | Curvas de la fotometría: brillo del objeto y del fondo de cielo. Incluye `H2C` (ley del umbral por tamaño aparente, activa por defecto; `null` = vía histórica C_MAG, solo regresión) y `H2C_DEFECTO` (`THETA_R_A/B` de Blackwell, `SEEING_AS` = 2″ fijo). |
| `TRANSMISION_TELE` / `TRANSMISION_OPTICA` | Transmisión por defecto y por tipo óptico. |
| `MARGEN_MAGLIM` | Margen entre el límite típico y el óptimo. |
| `GAIA_MAG_MAX` / `TOP` | Profundidad y tope de la consulta a Gaia (afecta al rendimiento). |
| `DSS_CACHE_MAX_BYTES` (en `dss-proxy.php`) | Tope de disco de la caché de placas DSS (150 MB por defecto). Otras constantes `DSS_*` afinan timeouts y limpieza. |

---

## Acceso público (compartir sin login)

El simulador funciona **sin iniciar sesión**. Para ello:

1. El endpoint del catálogo de equipo `bitacora/v1/equipo/catalogo` es **público**
   (`permission_callback => '__return_true'`): devuelve solo el catálogo **global**
   (`usuario_id IS NULL`), sin datos personales.
2. El plugin inyecta `window.BITACORA_PUBLICO` con la URL del catálogo; además, el
   JS **deriva la URL del propio dominio** (`…/wp-json/bitacora/v1/equipo/catalogo`)
   como último recurso, para no depender de la inyección.
3. Con sesión iniciada se usa `window.BITACORA_WP` (con *nonce*); sin ella, un GET
   público basta. El registro de observaciones y "Mi flota" siguen cerrados con login.

La **página** que contiene el bloque debe estar **publicada y pública** (no privada
ni protegida por contraseña). Si un plugin de seguridad bloquea la REST API a
usuarios no autenticados, hay que permitir esa ruta.

### Qué cambia al iniciar sesión

`window.BITACORA_WP` solo lo inyecta el plugin para usuarios logueados
(`bitacora_inyectar_datos`), así que su *nonce* es la señal de sesión de la página
(`haySesion()` en `bitacora-ocular.js`). Con sesión se añaden dos cosas:

| Opción | Sin sesión | Con sesión |
|---|---|---|
| Pestaña **"Cualquier objeto"** (RA/Dec o SIMBAD) | Oculta | Visible (salvo `window.BITACORA_OCULAR_LIBRE = false`) |
| Telescopios de **Mi flota** | No se piden | Los **primeros** del buscador, marcados `Mi flota`, y la lista se despliega al enfocar |

Ninguna de las dos es un control de acceso: el equipo personal (`GET
bitacora/v1/equipo`) ya exige login **en el servidor**, y el modo libre solo
consulta servicios públicos (Sesame/SIMBAD). En el cliente se decide qué se
**ofrece**, no a qué se puede llegar.

El orden "flota primero" lo fija el helper puro compartido
`BitacoraEquipo.flotaPrimero(flota, catalogo)` (`../resources/js/bitacora-equipo.js`),
que copia las piezas propias marcándolas `esFlota:true` sin tocar la respuesta de
la API. Test: `node scripts/test_equipo.js`.

### Ver a pantalla completa y descargar la imagen

Dos botones discretos (solo icono, con su rótulo en el `title`) bajo el círculo,
disponibles **para todos**:

- **Ver a pantalla completa** — la Fullscreen API se pide sobre la *zona*
  (`#sim-zona` = círculo + botones), no sobre el círculo, para no perder los
  botones al entrar. El tamaño lo pone la clase `.es-completa` que el JS
  conmuta en `fullscreenchange`; se hace con una clase y no con `:fullscreen`
  para no duplicar cada regla con el prefijo `-webkit-` de Safari. El
  `!important` del ancho/alto es necesario porque `actualizar()` fija el
  diámetro **en línea** en cada render. Sin API de pantalla completa (iPhone),
  el botón se oculta. Al entrar y al salir se **vuelve a dibujar al tamaño
  nuevo** (ver *Resolución del lienzo*), que si no la imagen saldría ampliada.
- **Descargar la imagen** — exporta el lienzo con el **mismo recorte circular**
  que el CSS aplica a la vista (lo que se descarga es lo que se ve), en PNG y con
  el nombre `ocular-<objeto>-<aumentos>x-<origen>.png`. Si el lienzo quedó
  contaminado por una placa servida sin CORS, `toBlob` lanza `SecurityError` y se
  cae a abrir la placa suelta en otra pestaña.

### Resolución del lienzo

El lienzo se dibujaba siempre a 720 px de lado. A pantalla completa el círculo mide
`min(94vw, 88vh)`, así que en un portátil Retina son 792 px CSS × 2 de densidad =
**1584 px de dispositivo enseñando 720**: el navegador ampliaba x2,2 y la imagen salía
borrosa.

Ahora el lado sale de `BitacoraGaiaRender.tamLienzo(anchoCss, dpr, techo)` (test:
`node scripts/test_tam_lienzo.js`) y `actualizar()` lo recalcula en cada render: **ancho
real del hueco × densidad de pantalla**, con suelo de 720 —el tamaño con el que se ajustó
todo el render, por debajo no se baja— y un techo por origen:

| Origen | Techo | Por qué |
| --- | --- | --- |
| Gaia DR3 (Canvas 2D) | 1440 px | Solo cuesta CPU: el catálogo ya está en `cacheGaia`, así que **redibujar más grande no baja un solo byte**. |
| PanSTARRS (HiPS) | 1200 px | `urlHips` pide `width`/`height` al servidor: los bytes van con el **área**. |
| DSS | 1200 px | `dss_pixels()` sirve ~1,7″/px (1059 px en un campo de 30′, tope 1200): a 720 se tiraba detalle **ya descargado**. |

El coste de dibujar va con el **cuadrado del lado** (720→1080 es 2,25×; 720→1440, 4×), y
se lo llevan los bucles por píxel: los `Float32Array(lado²)`, `adaptacionLocal` →
`desenfocar` (dos lienzos, `putImageData` + `getImageData` por pasada), `repararNucleos` y
el `createImageData` de `pintarFot`. Las estrellas son las mismas: solo crece el área de
sus gradientes.

Que se pueda subir sin retocar nada es porque **el render es invariante de escala**: todo
sale de `ctx.canvas.width` —la escala `escv`, el `pxPorAs`, el radio de desenfoque
`SIZE/60`, el tamaño de cada estrella—, no hay constantes en píxeles absolutos.

### Caché del DSS

`dss-proxy.php` guarda cada placa en `cache-dss/`. Comparte el diseño de caché del
proxy de Gaia (`gaia_proxy.php`):

- **Caché LRU en disco**: las placas del DSS son inmutables, así que no caducan;
  cada acierto renueva su antigüedad (`touch`) y las populares sobreviven. Al superar
  `DSS_CACHE_MAX_BYTES`, borra las **más antiguas** hasta bajar al 80 % del tope.
- **Limpieza incremental**: no se escanea el directorio en cada petición (throttle
  con un *stamp*), y cada pasada borra como mucho `DSS_CLEANUP_MAX_DEL` entradas.
  También barre `.lock`/`.tmp` huérfanos. Sin cron ni tareas externas.
- **Anti-estampida**: la descarga se hace bajo `flock`, con escritura atómica
  (temp + `rename`), así varias peticiones simultáneas de la misma placa no la
  descargan a la vez ni dejan ficheros a medias.
- **Revalidación barata**: envía `ETag` + `Cache-Control` y responde `304` ante
  `If-None-Match`.
- **Timeouts separados** de conexión y de petición al archivo del ESO.

Se omiten a propósito tres piezas del proxy de Gaia que no aplican al DSS: el gzip
en disco (los GIF ya son binarios), la cuantización de parámetros (las coordenadas
son sexagesimales y el resultado es una imagen) y el *failover* de proveedores (el
DSS tiene un único origen).

Las funciones puras del proxy tienen su propio test sin framework:
`php scripts/test_dss_proxy.php` (espejo de `scripts/test_gaia_proxy.php`).

### Caché de los parches de PanSTARRS

`ps1-proxy.php` guarda en `cache-ps1/` el parche de cada galaxia, con la misma
política LRU (el módulo compartido `bitacora-cache-lru.php`) y el mismo
anti-estampida y `ETag` que el DSS. Lo que hace de más:

- **Una petición por galaxia, no ocho.** Resuelve en el servidor qué skycells
  toca el parche (las cuatro esquinas contra `ps1filenames.py`), pide el MISMO
  recorte a cada una y las **cose por los NaN** —fuera de su skycell, `fitscut`
  devuelve NaN—, quedándose con el primer píxel válido. El navegador recibe un
  solo FITS.
- **`wcs=1` siempre**, y el nombre de skycell lo resuelve el servidor: si se
  aceptara del cliente, esto sería un proxy abierto hacia STScI. Sin `wcs=1`,
  `x`/`y` se leen como píxeles y el servicio responde 200 OK con un recorte de
  otro sitio, sin error y sin aviso.
- **La clave no lleva ni ocular ni aumento** (`ra|dec|lado|salida|banda`): el
  parche no depende del equipo, así que se cachea para siempre.

> **Al subir `PS1.salida`, la caché queda fría y el disco pesa cuatro veces
> más.** `salida` forma parte de la clave, así que 1024 no reaprovecha ni un
> parche de los guardados a 512: las primeras visitas de cada galaxia vuelven a
> ir a STScI. Y los bytes van con el **área**: 512→1024 es ×4 por parche. Los
> viejos no estorban —la LRU los va desalojando por antigüedad—, pero conviene
> revisar el tope de disco antes de desplegar.

Test de las funciones puras: `php scripts/test_ps1_proxy.php`.

---

## Despliegue

1. **JS y CSS** → por FTP a `/wp-content/uploads/bitacora/`.
   Al actualizar un archivo, **incrementa su `?v=N`** en el HTML para saltar la caché.
2. **`dss-proxy.php`** y **`ps1-proxy.php`** → a esa misma carpeta, junto a
   `bitacora-cache-lru.php` (crean `cache-dss/` y `cache-ps1/` solos).
3. **`ocular-wordpress.html`** → pégalo en un bloque "HTML personalizado" de la página.
4. **El plugin** (`bitacora-registro.php`) → a `wp-content/plugins/bitacora-registro/`
   (necesario para que el catálogo sea público). No hay que reactivarlo.

**Verificar el acceso público** (en incógnito, sin sesión):
`https://bitacoraestelar.app/wp-json/bitacora/v1/equipo/catalogo`
→ debe devolver JSON con `telescopios`/`oculares`. Si da `401`, el plugin no está
desplegado con el permiso público.

---

## Dependencias y fuentes de datos

- **WordPress** + el plugin `bitacora-registro` (catálogo de equipo).
- **Cúmulos globulares**: W. E. Harris, *«A Catalog of Parameters for Milky Way
  Globular Clusters»* (1996, revisión de diciembre de 2010), McMaster University
  ([physics.mcmaster.ca/~harris/mwgc.dat](https://physics.mcmaster.ca/~harris/mwgc.dat)),
  de libre distribución citando la fuente. Regenerado con `python3 scripts/gen_globulares.py`.
- **Estrellas de carbono**: programa de observación de la **Astronomical League**.
  La fuente de verdad es `mapa/datos/AL_Carbon_Stars.csv`; el módulo
  `estrellas-carbono-datos.js` se **regenera** desde el CSV con
  `python3 scripts/gen_carbono.py` (no editar el `.js` a mano).
- **Estrellas dobles**: fusión de tres programas de observación —
  **Double Star Club** (Astronomical League), **Cambridge Double Star Atlas** y
  **RASC Double Star Program**—. Las fuentes (`mapa/datos/{AL_DoubleStarClub,
  cambridge_double_star_atlas,RASC_Double_Star_Program}.csv`) se fusionan en
  `mapa/datos/estrellas_dobles.csv` con `python3 scripts/gen_dobles.py` (no editar el
  `.js` a mano). Física de resolución: ver [`notas-resolucion-dobles.md`](notas-resolucion-dobles.md).
- **Gaia DR3** vía [VizieR TAP](https://tapvizier.cds.unistra.fr/) (CDS).
- **Colores estelares**: J.-V. Harre &amp; R. Heller (2021), *«Digital color codes of
  stars»*, Astron. Nachr. ([arXiv:2101.06254](https://arxiv.org/abs/2101.06254);
  código [spec2col](https://github.com/janvincentharre/spec2col)).
- **PanSTARRS DR1** vía [hips2fits](https://alasky.cds.unistra.fr/) (CDS/alasky).
- **DSS** (Digitized Sky Survey) desde el [archivo de ESO](https://archive.eso.org/),
  servido por `dss-proxy.php`.
- Todo el render es **HTML5 Canvas** puro; sin frameworks ni librerías externas.

---

## Herramientas auxiliares (experimental)

`generar_niveles.py` y `ps1_service.py` son un **pipeline offline** que genera placas
**fotométricas calibradas** a partir de FITS de Pan-STARRS DR2 (mosaica skycells,
reconstruye núcleos saturados con la PSF y el flujo de Gaia, y exporta una pirámide de
PNG de 16 bits lineales + un JSON de calibración). Es una vía **alternativa y más
avanzada** de generar el fondo, **no requerida** por el despliegue actual (que usa
hips2fits, el DSS y Gaia directamente). Se documentan aquí para no perderlos de vista.

---

## Créditos

Los cálculos de **magnitud límite** y visibilidad se basan en las fórmulas del
profesor **José Ramón Torres Lapasió** ([www.uv.es/jrtorres](https://www.uv.es/jrtorres/index.html)),
de su artículo *«On the Prediction of Visibility for Deep-Sky Objects»*
([visib.pdf](https://www.uv.es/jrtorres/visib.pdf)).
