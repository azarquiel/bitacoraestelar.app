# Bitácora Messier — simulador de ocular

Muestra **cómo se vería un objeto del cielo a través de tu equipo concreto**:
eliges telescopio y ocular, ajustas el cielo de tu observatorio y el simulador
reproduce el campo, el brillo y —en la vista de Gaia— hasta el color de las
estrellas, tal como los verías por el ocular.

Funciona en el navegador (móvil u ordenador), **sin instalar nada y sin necesidad
de iniciar sesión**. Vive en la web WordPress del proyecto
([bitacoraestelar.app](https://bitacoraestelar.app)) como un bloque HTML.

> El **objeto** lo elige el usuario en un selector de dos pestañas: **cúmulos
> abiertos** (de momento M35, M39 y NGC 7789) o **estrellas de carbono** (las ~100
> del programa de la Astronomical League). El equipo y el cielo también los elige
> el usuario.

---

## Qué hace

- **Elige el objeto**: en un selector de dos pestañas, un **cúmulo abierto** o una
  **estrella de carbono** de la Astronomical League. Al elegir una estrella de
  carbono, la ficha resalta su magnitud, tipo y su característico **color
  rojo-anaranjado** (mejor visible en la vista de Gaia).
- **Elige tu equipo**: telescopio y ocular de un catálogo de cientos de modelos,
  o **introdúcelos a mano** (apertura, focal y tipo óptico) si no están en la lista.
- **Ajusta el cielo** del observador (brillo de fondo en mag/arcsec², de rural
  oscuro a urbano) y observa cómo se lava lo tenue.
- **Lecturas al instante**: aumentos, campo real, campo aparente, pupila de salida,
  brillo superficial, fondo de cielo en el ocular y **magnitud límite** del conjunto.
- **Tres vistas del mismo campo**:
  - **PanSTARRS DR1 (HiPS)** — foto real en color, sin dependencias de servidor propio.
  - **DSS (placas fotográficas)** — servidas por un proxy propio con caché en disco.
  - **Estrellas de Gaia DR3 (Canvas 2D)** — posiciones y colores reales de las
    estrellas, con brillo, tamaño y color según cada estrella, glow de las no
    resueltas y **cruz de difracción** de la araña en los reflectores.

---

## Las piezas

| Archivo | Qué es | Dónde va |
|---|---|---|
| `ocular-wordpress.html` | Fragmento HTML del simulador (sin código) | Editor de WordPress (bloque HTML) |
| `resources/js/bitacora-ocular.js` | Toda la lógica (óptica, fotometría, Gaia) | Servidor, por FTP a `…/uploads/bitacora/` |
| `resources/js/estrellas-carbono-datos.js` | Catálogo de estrellas de carbono (`window.BITACORA_CARBONO`), generado del CSV | Servidor, por FTP a `…/uploads/bitacora/` |
| `resources/css/bitacora-ocular.css` | Estilos del módulo | Servidor, por FTP a `…/uploads/bitacora/` |
| `dss-proxy.php` | Proxy de placas del DSS con caché en disco acotada | Servidor, junto al JS/CSS |
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

- **Consulta** a Gaia DR3 vía VizieR TAP, una vez por objeto, al radio máximo
  (`GAIA_RADIO_MAX ≈ 1,44°`) y hasta `GAIA_MAG_MAX` (16,5), con `TOP 40000`. El
  `ORDER BY Gmag` va **antes** del `TOP` (verificado en TAPVizieR): si hay
  truncamiento, se quedan fuera las **menos brillantes**.
- **Tamaño** del núcleo según la magnitud, con un exponente (`radioExp`) para que
  las brillantes destaquen más (imita el *blooming* fotográfico). Un **suelo**
  (`radioMin`, aplicado con `max()`, no sumando) garantiza que las débiles no bajen
  del mínimo visible (~1 px) sin inflar las brillantes; y un **suelo de alfa**
  (`alfaMin`) evita que las del borde del límite se apaguen del todo.
- **Escala con el aumento**: a más aumento (menos campo) las estrellas se agrandan
  (su tamaño angular en el ocular), `factor = √(escalaMagCampo / campo_arcmin)`
  acotado a `[1, escalaMagMax]`. Así un cúmulo lejano a mucho aumento (NGC 7789 con
  un 18") se ve rico y uno cercano a poco aumento (M35) fino, con la misma regla.
- **Color** real a partir del índice **BP–RP**, con un factor de **saturación**
  ajustable y tinte del núcleo.
- **Glow de estrellas no resueltas**: las más débiles que la magnitud límite no se
  dibujan como puntos, sino como una mota tenue **aditiva ponderada por su flujo**.
  Donde se agolpan (cúmulos lejanos, núcleos de galaxias) su suma forma una **mancha
  nebulosa** —p. ej. **NGC 2158** junto a M35—, y el resplandor **escala con la
  apertura**, así un tubo mayor luce más.

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

---

## Configuración

Casi todo se afina desde constantes al principio de `bitacora-ocular.js`, sin tocar
la lógica:

| Bloque | Controla |
|---|---|
| `GAIA_CFG` | Render de Gaia: `blur`, `magColor`, `saturacion`, `tinteNucleo`; tamaño (`radioMin` = suelo, `radioMag`, `radioExp`, `magTamMin`, `radioMax`, `radioTotalMax`); brillo (`brillo`, `alfaMin`); escala con el aumento (`escalaMagCampo`, `escalaMagMax`); y el glow (`glowIntensidad`, `glowRadio`). |
| `GAIA_CFG.spikes` | Cruz de difracción: `magMax` (umbral de brillo), `brazos` (nº de puntas), `angulo` (`0` = `+`, `45` = `×`), `longMag`/`longMax` (longitud), `grosor`, `lobulos` (lóbulos sinc²), `intensidad`. |
| `OPTICA_ARANA` | Qué tipos ópticos tienen araña (→ muestran spikes). El telescopio manual lo hereda de la opción "Reflector / Newton" (`data-arana` en el HTML). |
| `FOT` | Curvas de la fotometría: brillo del objeto y del fondo de cielo. |
| `TRANSMISION_TELE` / `TRANSMISION_OPTICA` | Transmisión por defecto y por tipo óptico. |
| `MARGEN_MAGLIM` | Margen entre el límite típico y el óptimo. |
| `GAIA_MAG_MAX` / `TOP` | Profundidad y tope de la consulta a Gaia (afecta al rendimiento). |
| `$CACHE_MAX_BYTES` (en `dss-proxy.php`) | Tope de disco de la caché de placas DSS (150 MB por defecto). |

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

### Caché del DSS

`dss-proxy.php` guarda cada placa en `cache-dss/`. Para que el disco no crezca sin
límite con tráfico público, **se autolimpia**: al descargar una placa nueva, si el
directorio supera `$CACHE_MAX_BYTES`, borra las **más antiguas** (política tipo LRU,
por fecha de uso) hasta bajar al 80 % del tope. Sin cron ni tareas externas.

---

## Despliegue

1. **JS y CSS** → por FTP a `/wp-content/uploads/bitacora/`.
   Al actualizar un archivo, **incrementa su `?v=N`** en el HTML para saltar la caché.
2. **`dss-proxy.php`** → a esa misma carpeta (crea `cache-dss/` solo).
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
- **Estrellas de carbono**: programa de observación de la **Astronomical League**.
  La fuente de verdad es `mapa/datos/AL_Carbon_Stars.csv`; el módulo
  `estrellas-carbono-datos.js` se **regenera** desde el CSV con
  `python3 scripts/gen_carbono.py` (no editar el `.js` a mano).
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
