# Objetivo — Catálogo propio de texturas de cielo profundo (DSO sin servicios externos)

Fecha: 2026-09-04. Estado: **objetivo redactado, sin implementar**. Es un *prompt* para
la sesión que lo implemente, en la forma de `ampliar_cielo_profundo_objetivo.md`:
primero se lee, luego se mide, después se prerregistra y solo entonces se toca código.

Origen: la propuesta externa `simulador_ocular_catalogo_dso.md` («Simulador de ocular
astronómico — Catálogo de objetos de espacio profundo», secciones 1-27), revisada
contra lo que este repo ya tiene medido, decidido y descartado. Donde la propuesta
original y el repo discrepan, manda lo medido; cada discrepancia va nombrada en el
apartado 3.

---

## 1. Qué se quiere y qué significa «no depender de catálogos externos»

El simulador de oculares pinta hoy los objetos difusos (galaxias y nebulosas) desde
un **recorte real de Pan-STARRS 1 descargado en caliente** de STScI a través de
`simulador_ocular/ps1-proxy.php`. Si STScI no responde, si la caché LRU del servidor
(150 MB, unos 37 parches de 1024²) ha expulsado el parche, o si el servicio tarda
(≈2,6 s por skycell, hasta 4 por parche, en serie), el observador ve el campo sin
la galaxia y un aviso. La ley que convierte esa imagen en luz visible (`BitacoraPS1`,
`resources/js/bitacora-ps1.js`) está medida, con guardianes y ADRs, y **no es lo que
se cambia**.

El objetivo es que **la imagen de cada objeto difuso sea un dato propio del
proyecto, generado offline, servido desde `bitacoraestelar.app`**, igual que ya lo
son las filas de `galaxias-datos.js` o las estrellas de
`estrellas-brillantes-datos.js`: un catálogo hermano (ADR 0018 bis), generado por un
script del repo con procedencia declarada, que el render concatena sin arbitrar
precedencias.

**Dentro del alcance:**

- La capa difusa de la vista **Canvas 2D de Gaia** (`vistaGaia` →
  `ps1CapaGalaxias`), en sus dos consumidores: el simulador
  (`simulador_ocular/resources/js/bitacora-ocular.js`) y el generador de imagen del
  formulario de registro (`render()` de `bitacora-gaia-render.js`).
- Las clases que hoy entran en esa capa: galaxias (RC3) y nebulosas de clase
  `PN`, `HII`, `EmN`, `RfN`, `SNR` del OpenNGC (`PS1_CLASES_DIFUSAS`).
- La cadena de adquisición completa: qué se descarga, con qué resolución, cómo se
  codifica, dónde se guarda, cómo se sirve, cómo se versiona y cómo se prueba.

**Fuera del alcance (y por qué):**

- **Las estrellas siguen viniendo de Gaia DR3 en caliente** (`gaia_proxy.php`).
  La propuesta original lo da por hecho y el estudio de caché espacial (ADR 0012
  bis) lo dejó cerrado con veredicto NO PASA. Hay una consecuencia que sí entra:
  la máscara de estrellas del parche pide hoy Gaia hasta G = 20
  (`ps1MagConsulta`), más hondo que lo que el equipo ve; la fase 3 mueve esa
  necesidad al offline.
- **Los orígenes «placa» (`dss` y `hips`)** son placas de campo entero, no
  objetos: DSS vía ESO/SkyView y PanSTARRS DR1 en color vía hips2fits. Siguen
  siendo externos por naturaleza. El respaldo a DSS cuando Gaia no responde
  tampoco cambia. Se apunta en mejoras si conviene retirar el origen `hips`.
- **Los cúmulos** (abiertos y globulares) no son objetos de imagen: su modelo
  intrínseco es una población (ADR 0002, 0012). No entran en el catálogo de
  texturas. La propuesta original los ponía en el mismo árbol; aquí no.

---

## 2. Estado actual, medido (no re-medir; corregir aquí si cambia)

### 2.1 Fuentes externas del simulador en tiempo de ejecución

| Qué | Quién lo pide | Servicio | Cuándo falla |
|---|---|---|---|
| Parche PS1 de cada objeto difuso (FITS float32, banda g) | `ps1DescargarParche` → `ps1-proxy.php` | `ps1images.stsci.edu` (`ps1filenames.py` + `fitscut.cgi`) | frío de caché, δ < −30°, caída de STScI |
| Estrellas del campo (y de la máscara, a G ≤ 20) | `consultar` → `gaia_proxy.php` | VizieR / GAVO TAP | fuera de alcance |
| Placa DSS1 / DSS2-red | `dss-proxy.php` | ESO / SkyView | fuera de alcance |
| Placa PanSTARRS color | navegador directo | alasky hips2fits | fuera de alcance |

### 2.2 El catálogo difuso hoy (cifras de este árbol, `scripts/…` con `ps1CatalogoDifuso`)

> **Desfasadas desde la PR #189** (nebulosas de reflexión), que subió las RfN
> aptas de 12 a 28. Al 2026-09-04: **1510 filas, 1066 aptas** (429 al sur, 15 no
> caben), 927 galaxias, 100 PN, 28 RfN, 10 HII, 1 SNR. Las cifras vivas están en
> el ADR 0024 §«Premisas medidas» y en `docs/validacion/dso_texturas_fase0.md`;
> la tabla de abajo se conserva como estaba escrita el día del objetivo. Ninguna
> de estas cuentas es un listón: se recuentan.

| Cifra | Valor |
|---|---|
| Filas del catálogo difuso (galaxias + nebulosas de clase abierta) | 1485 (1295 galaxias RC3 BT < 13; 190 nebulosas) |
| Excluidas por δ ≤ −30° (`PS1.decMin`) | 422 |
| Excluidas por no caber (`ps1CabeEnParche`: M31, IC 342, M33, el Velo…) | 13 |
| **Aptas para parche** | **1050** (927 galaxias, 100 PN, 12 RfN, 10 HII, 1 SNR) |
| Lado del parche `clamp(6·r_e/60, 1,5′, 20′)` — mín / p25 / p50 / p75 / p90 / máx | 1,5 / 2,8 / 4,6 / 7,8 / 12,2 / 20 ′ |
| Resolución hoy (`PS1.salida = 1024` fijo) | 0,088 – 0,27 (mediana) – 1,17 ″/px |
| Nativa del stack | 0,25 ″/px; seeing del stack 1,1″ FWHM (`PS1.seeingAs`) |
| Objetivo de resolución ya escrito en `test_resolucion_ps1.js` | 0,67 ″/px (a 20′ pide 1794 px; el tope del proxy es 1024) |
| Suelo físico útil (`harness_resolucion_ps1.js`) | ≈ 0,5 ″/px (Nyquist del seeing del stack, σ ≈ 0,47″) |
| Caché del proxy en producción | 150 MB LRU = ~37 parches de 1024² (4 MB cada uno en float32) |

### 2.3 Lo que la cadena PS1 hace con el parche (y que NO se toca)

`ps1ParcheDeGalaxia` (`bitacora-ps1.js:1863`), en orden: `ps1DescargarParche` +
`parseFITS` → `ps1AfinParche` (WCS TAN, giro de skycell) → `ps1EstrellasEnPixeles`
(Gaia a G ≤ 20 → radio de máscara `1,1·10^(0,4·(22−G)/3)` acotado a 60″) →
`ps1EscenaEnParche` (elipses μ = 25 o borde real de las compactas) →
`ps1QuitarEstrellas` (relleno isofotal < 40″, cielo ≥ 40″, mordida ADR 0021) →
`ps1AnclarACatalogo` (cielo = mediana del borde, σ = MAD; **tres casos**: NaN o
`v < cielo − 2σ` → ausencia; `v < cielo + 1,5σ` → 0; resto → `v − suelo`; escala
a `10^(−0,4·magV)·frac`) → `ps1PesoImagen` / `ps1EscalaMezcla` (mezcla E
`w·s·imagen + (1−w)·perfil`) → `ps1PsfParche` (θ_add en cuadratura, por apertura,
cacheado) → `ps1PintarParche` (bilineal, opacidad H2c con θint, máscara difusa).

Todo lo aguas abajo de `parseFITS` consume **un solo objeto**:
`{ancho, alto, datos: Float32Array con NaN, escalaAs, wcs{crval,crpix,cdelt,pc}, zpt}`.
Ese objeto es la frontera natural del cambio.

### 2.4 Precedentes que ya existen en el árbol

- `scripts/lib_bajar_parche.js`: réplica en Node de `ps1-proxy.php` (skycells por
  esquinas, `fitscut` a escala nativa, costura por NaN) con caché en
  `$PS1_HARNESS_DIR`. Es el descargador offline que el generador debe reutilizar,
  no reescribir.
- `scripts/lib_parche_produccion.js`: monta un parche con las funciones de
  producción en Node (ADR 0008: el arnés no reimplementa la ley).
- `scripts/lib_png.js`: escritor PNG sin dependencias (RGB 8 bits). Se amplía a
  gris de 16 bits.
- `scripts/fixtures/gaia/*.csv`: consultas Gaia pineadas por objeto
  (`gen_fixtures_gaia.js`), el patrón de «dato de entrada congelado».
- `scripts/test_golden_difusas.js`: SHA-256 bit a bit de `parche.datos` y del
  `difuso` final para M51, M101, M104, M81. **Se rompe por construcción con
  cualquier cambio de fuente**; se recaptura con informe, no en silencio.
- README §«Herramientas auxiliares»: cita `generar_niveles.py` y `ps1_service.py`
  (pirámide de PNG de 16 bits lineales + JSON de calibración, núcleos saturados
  reconstruidos con PSF y flujo de Gaia). **No existen en ninguna rama del repo.**
  Es el antecesor conceptual de este objetivo y hay que retirar la mención o
  sustituirla por este documento.

---

## 3. Qué cambia respecto a la propuesta original, punto por punto

| § original | Proponía | Aquí | Por qué |
|---|---|---|---|
| 4 | OpenNGC como catálogo maestro; SQLite en runtime | OpenNGC sigue siendo la fuente de las **nebulosas** y de la identidad NGC/IC; las **galaxias** siguen en RC3 (r_e, T, B/T, D25) porque la fila Sérsic anclada a la mag V es lo que cierra la fotometría. No hay SQLite: el runtime es un navegador sin bundler; los catálogos son `window.BITACORA_*` generados | ADR 0013 (el modelo intrínseco es la fila), convención de generadores |
| 5 | Cúmulos abiertos = Gaia; globulares = Gaia + modelo | Ya es así y no entra aquí | ADR 0002, 0012 |
| 5, 21 | `render_mode` por objeto (STAR_FIELD / TEXTURE / PROCEDURAL / HYBRID / POINT) | Una sola columna de **procedencia del modelo**, en el manifiesto, con dos valores: `imagen` (textura + fila) y `fila` (solo Sérsic), más el motivo de la ausencia. **No** hay ramas por tipo en el render: observación y display siguen sin conocer la clase | ADR 0013 punto 2; la alternativa (4) de `docs/notas/ngc7008-render-planetarias.md` («plantillas por objeto») está descartada por nombre y hay que distinguirse de ella: esto es un **generador determinista con procedencia**, no assets curados |
| 6, 17, 18 | WebP/AVIF de 8 bits; 128–2048 px según tamaño | **PNG de 16 bits en gris, lineal en flujo tras una compansión `asinh` declarada e invertida exactamente en el decodificador**, centinela 0 = ausencia. Tamaño por objeto según regla del apartado 4.2 | 8 bits no puede expresar `cielo − 2σ` (ausencia, ADR 0017/0021) ni el rango de 5 mag de un núcleo sin bandas en la rampa de opacidad; el antecesor del README ya eligió 16 bits lineales; ADR 0009 y 0019 exigen que cualquier codificación sea declarada y se deshaga antes de entrar en la cadena |
| 9-13, 15 | Detección de saturación, warps, SDSS/Legacy para rellenar agujeros, imagen maestra | Se conserva como **fase 4**, después de que las fases 1-3 hayan sustituido la fuente sin cambiar nada más. Hoy los núcleos saturados llegan como NaN y los rellena el perfil de la fila: eso ya funciona y está medido. La fase 4 solo se abre con la fracción de escena saturada medida en la fase 0 | ADR 0007 (una capa por investigación), ADR 0004 (nada estético: la reconstrucción tiene que ser fotométrica y auditable) |
| 14 | Sérsic solo auxiliar | Ya es así: mezcla E `w·s·imagen + (1−w)·perfil`; con imagen manda la imagen y la fila fija el presupuesto de luz (ADR 0021) | — |
| 16 | Imagen maestra sin telescopio concreto; degradación posterior | Ya es así: `ps1PsfParche` añade `θ_add = √(θ_res(D)² − θ_parche²)` por apertura. **La textura se guarda sin convolucionar** y con su `escalaAs` real, o el borrón se contaría dos veces | README §«La resolución del recorte» |
| 19 | Pipeline con «compresión de rango dinámico» (log/asinh) antes de la textura final | La compansión `asinh` existe solo como **codificación** de 16 bits (se decodifica a lineal antes de `ps1Cielo`). Ninguna curva de tono, estirado, gamma ni realce entra en el fichero | ADR 0001, 0004, 0009, 0019 |
| 20 | Metadatos por objeto | Sidecar JSON por textura + manifiesto; los campos de la fila no cambian de sitio | apartado 4.1 |
| 22, 23 | Mapa de procedencia y `quality` | Sí: el mapa de procedencia vive en el árbol de construcción; la calidad (`fracAusencia`, `fracAusenciaEscena`, `fracSaturada`) va al sidecar y alimenta la lista de revisión | — |
| 24 | Pan-STARRS como fuente principal | Sí en fases 1-3 (es lo que ya calibra la cadena: `seeingAs`, ley de máscara medida sobre 19 031 estrellas, `kAusencia`). Un segundo sondeo obliga a renombrar `bitacora-ps1.js` (ADR 0020 lo presupuesta) y solo entra en la fase 4 | ADR 0020 |
| 26 | Prototipo con M31, M51, M64, M81, M82, M87, M104 | **Banco estratificado de 53 objetos** (apartado 5.0), elegido por modo de fallo y por cuantil de tamaño, no por tipo: incluye los 11 con fixtures y golden (M51, M101, M104, M81, M57, M78, NGC 7635, NGC 6888, M1, NGC 7008, Abell 12), M64, M82, M87 y M104 de la lista original, y **todas** las HII, RfN y SNR aptas (23). M31 no cabe en el parche por construcción (`fracMin`) y entra solo como control de exclusión. Las fases 0-2 se ejecutan sobre el banco; las 1050 filas se generan tras el PASA de la fase 2 | fixtures existentes, ADR 0005/0012 bis/0013/0017/0021 |
| 27 | «Objetivo de almacenamiento 1-3 GB para NGC completo» | Para las **1050 filas aptas de hoy**: 0,7–1,3 GB en PNG-16 según regla de resolución (tabla 4.2). Ampliar a OpenNGC completo es la mejora M6, no este objetivo | medido en este árbol |

---

## 4. Diseño

### 4.1 Artefactos

**Directorio servido**: `/wp-content/uploads/bitacora/dso/`. Ficheros planos, uno
por objeto y versión:

```
dso/NGC5194.<v>.png      textura (PNG, tipo de color 0, 16 bits, un canal)
dso/NGC5194.<v>.json     sidecar
dso-texturas-datos.js    manifiesto (window.BITACORA_DSO_TEXTURAS)
```

`<v>` es un hash corto (8 hex) de **lo que determina los píxeles**: versión del
generador, sondeo y banda, `lado`, `salida`, parámetros de codificación y, desde la
fase 3, la versión de `BitacoraPS1.cfg` que gobernó la máscara. Un nombre distinto
por versión hace inmutable la URL: `Cache-Control: public, max-age=31536000,
immutable` por `.htaccess` sobre `dso/`, sin `?v=` que mantener a mano. El nombre
de fichero es el `nombre` de la fila (`g[0]`) sin espacios ni barras
(`NGC 5194` → `NGC5194`, `PN A66 12` → `PN_A66_12`), y la clave del manifiesto es
el `nombre` **literal** de la fila: la identidad es la del catálogo generado, no un
cruce por posición (ADR 0015).

**Manifiesto** (`simulador_ocular/resources/js/dso-texturas-datos.js`, generado):

```js
/* Texturas DSO — GENERADO, no editar a mano. Regenerar: node scripts/gen_dso_texturas.js
   Campos: [nombre, modelo, version, ancho, escalaAs, fracAusencia, motivo] */
window.BITACORA_DSO_TEXTURAS = [
  ["NGC 5194", "imagen", "3f9a1c2e", 2048, 0.469, 0.012, ""],
  ["NGC 224",  "fila",   "",         0,    0,     0,     "no-cabe"],
  ["NGC 55",   "fila",   "",         0,    0,     0,     "sur"],
  …
];
```

`modelo ∈ {imagen, fila}`; `motivo ∈ {"", sur, no-cabe, sin-cobertura, pisada,
ausencia-excesiva}`. Una fila por cada entrada del catálogo difuso (1485), para que
«no tiene textura» sea un dato y no un silencio, y para que el aviso al observador
salga de aquí y no de una consulta fallida.

**Sidecar** (`dso/<id>.<v>.json`):

```json
{
  "nombre": "NGC 5194", "version": "3f9a1c2e", "generador": "gen_dso_texturas 1",
  "fuente": {"sondeo": "PS1 DR2 3π stack", "banda": "g", "skycells": ["rings.v3.skycell.2154.052.stk.g.unconv.fits"], "descargado": "2026-09-10"},
  "ancho": 2048, "alto": 2048, "ladoArcmin": 16.0, "escalaAs": 0.46875,
  "wcs": {"crval": [202.4696, 47.1952], "crpix": [1024.5, 1024.5], "cdelt": [-1.302e-4, 1.302e-4], "pc": [[0.998, -0.063], [0.063, 0.998]]},
  "codificacion": {"tipo": "asinh16", "a": 17.2, "uMin": -2.31, "uMax": 11.44, "centinela": 0},
  "auditoria": {"cielo": 1.3, "sigma": 17.2, "fracAusencia": 0.012, "fracAusenciaEscena": 0.004, "fracSaturada": 0.001, "errCuantMaxSigma": 0.03},
  "fuentesConservadas": [],
  "procedencia": {"0": "ausencia", "1": "PS1 stack"}
}
```

`auditoria.cielo` y `auditoria.sigma` son **solo para auditar**: el runtime los
recalcula con `ps1Cielo`/`ps1SigmaCielo` sobre los datos decodificados, para que la
ley viva en un solo sitio (ADR 0008). `fuentesConservadas` y `procedencia` se
rellenan en las fases 3 y 4.

> **Enmienda (2026-09-06, al implementar T3 / #200).** Tres cosas de este boceto
> no sobrevivieron al código, y se anotan aquí porque el boceto es anterior:
>
> 1. **La WCS del sidecar va en la forma que devuelve `parseFITS`**
>    (`{ra0, dec0, x0, y0, gx, gy}`), no en tarjetas FITS (`crval`/`crpix`/
>    `cdelt`/`pc`). Pasar de una a otra es una ley —CRPIX es 1-based, el PC se
>    multiplica— y esa ley ya vive en `parseFITS`; escribirla otra vez en el
>    generador y en el lector es justo la deriva del ADR 0008. Así
>    `ps1LeerTextura` entrega la WCS sin tocarla y el criterio «indistinguible de
>    `parseFITS`» se cumple por construcción y no por coincidencia.
> 2. **`zpt` es `NaN`, no `null`** (§4.4 punto 2): es lo que devuelve `parseFITS`
>    cuando no hay tarjeta `ZPT_0000`, y la promesa es que las dos fuentes den el
>    mismo objeto. No lo lee nadie: el nivel absoluto lo pone el catálogo.
> 3. **`fuentesConservadas` y `procedencia` no se escriben todavía.** Vacíos no
>    dicen nada y el hash de versión no los cubre; nacen en las fases 3 y 4, con
>    la versión de generador que los llene.
> 4. **`auditoria.fracSaturada` y `fuente.skycells` quedan para #201**, y no por
>    olvido: `lib_bajar_parche.js` no devuelve ni la cabecera del FITS (de donde
>    sale el umbral de saturación, §4.3 paso 4) ni los nombres de las skycells
>    que cosió, y su caché en disco tampoco los guarda. Añadirlos obliga a tocar
>    esa biblioteca —compartida con los arneses— y a volver a bajar lo cacheado.
>
> Queda **sin decidir** el nombre de fichero de los objetos con varias palabras:
> los dos ejemplos de arriba se contradicen (`NGC 5194` → `NGC5194` quita los
> espacios; `PN A66 12` → `PN_A66_12` los sustituye). El código de T3 quita los
> espacios (`PN A66 12` → `PNA6612`) porque es la regla del primer ejemplo, que es
> la del único objeto publicado. **Hay que firmarlo antes de generar el banco**
> (#201): el id entra en URL que se sirven como inmutables, y renombrar después
> cuesta republicar el catálogo entero.

**Codificación `asinh16`** (declarada, invertible, sin ley de display):

```
u   = asinh(v / a)                       a = σ del cielo del parche (MAD·1,4826 del borde)
q   = 1 + round((u − uMin) / (uMax − uMin) · 65534)     ∈ [1, 65535];  0 = ausencia (NaN)
v'  = a · sinh(uMin + (q − 1) · (uMax − uMin) / 65534)
```

Con `a = σ`, el paso de cuantización vale ≈ `a·(uMax−uMin)/65534` cerca del cielo
(0,0036 DN para M51: 0,0002 σ) y ≈ 0,02 % relativo en el núcleo. Es una
**codificación**, no una curva de tono: se deshace en el decodificador antes de que
ningún píxel entre en `ps1Cielo`. Los valores por debajo de `cielo − 2σ` se
conservan como números (no como centinela): la decisión de «ausencia» la sigue
tomando `ps1AnclarACatalogo` en runtime con su `kAusencia`, y el centinela 0 solo
transporta los NaN que ya traía el stack (huecos de saturación, fuera de skycell).

**Rejilla**: la textura conserva la rejilla de la skycell tal como la sirve
`fitscut` (giro incluido) y su WCS TAN en el sidecar. No se reproyecta al norte:
reproyectar es un remuestreo que cuesta grano (README §DSS: mediana 40 → 32 en
SkyView) y `ps1AfinParche` ya sabe leer el giro. La reproyección solo aparece en la
fase 4 para coser un segundo sondeo sobre la rejilla de PS1.

### 4.2 Regla de resolución por objeto

`escalaAs` objetivo 0,5 ″/px (suelo físico del stack), nunca más fina que la nativa
(0,25) ni más gruesa de lo que impone el tope de 2048 px:

```
salida(lado′) = clamp(ceil(lado·60 / 0,5), 128, 2048)
escalaAs      = lado·60 / salida
```

| Regla | Mpx totales (1050 objetos) | 16 bits sin comprimir | PNG-16 estimado (×0,6) |
|---|---|---|---|
| A · hoy, 1024 fijo | 1101 | 2,2 GB | 1,3 GB |
| B · nativa 0,25″, tope 2048 | 1921 | 3,8 GB | 2,3 GB |
| **C · 0,5″/px, tope 2048** | **781** | **1,6 GB** | **≈ 1,0 GB** |
| D · 0,67″/px, tope 2048 | 465 | 0,9 GB | 0,6 GB |
| E · 0,5″/px, tope 1024 | 480 | 1,0 GB | 0,6 GB |

Se propone **C**: 42 objetos (lado ≥ 17,07′) quedan en el tope de 2048 px a
0,50–0,59 ″/px, «representable» en las bandas de diagnóstico del README
(σ_PSF ≥ 1 px para 80–914 mm); los pequeños dejan de pedir 1024 px para 1,5′
(0,088″/px, tres veces por debajo de la nativa, bytes tirados). El factor 0,6 de
compresión es una estimación: **se mide en la fase 0 sobre el banco** y se
sustituye aquí.

### 4.3 Generador: `scripts/gen_dso_texturas.js` (Node, sin dependencias)

Por qué Node y no Python: las leyes que un generador de texturas necesita
(`parseFITS`, `ps1LadoArcmin`, `ps1CabeEnParche`, `ps1GalaxiasDelCampo`, y desde la
fase 3 `ps1EstrellasEnPixeles`/`ps1EscenaEnParche`/`ps1QuitarEstrellas`) **ya están
en `bitacora-ps1.js` y se cargan en Node** como hace `d25_catalogo.js`. Copiarlas a
Python es la deriva que el ADR 0008 prohíbe y que `gen_nebulosas.py` tuvo que
blindar con una autocomprobación de `factor_luz`. Python queda para lo que ya hace
(catálogos tabulares).

Pasos, por fila del catálogo difuso:

1. `ps1GalaxiasDelCampo([fila], ra, dec, 1)` → `gal` con `ladoArcmin`; si no pasa
   (`sur`, `no-cabe`) → fila de manifiesto `fila` con motivo y siguiente.
2. Descarga con `lib_bajar_parche.js` a `salida(lado)` (no a 1024), caché en
   `$PS1_HARNESS_DIR` (fuera del repo, como hoy). Sin cobertura (502) → `sin-cobertura`.
3. `parseFITS` → `datos`, `escalaAs`, `wcs`; **comprobar `escalaAs` contra
   `lado·60/salida` (±1e-3)** como hace `test_resolucion_ps1.js`.
4. Auditoría: `ps1Cielo`, `ps1SigmaCielo`, fracción de NaN total y dentro de la
   elipse de escena (`ps1EscenaEnParche` con `campo = [gal]`), fracción con
   `v > umbralSaturacion` (leído de la cabecera FITS si `fitscut` lo trae; si no,
   NaN cuenta como saturado).
5. Codificar `asinh16`, escribir PNG-16 (ampliación de `lib_png.js`: tipo de color
   0, profundidad 16, filtro 0 por fila, `zlib.deflateSync` nivel 9) y sidecar.
6. `errCuantMaxSigma`: decodificar lo escrito y medir `max|v' − v|/σ` sobre los
   píxeles con `|v| < 5σ` y `max|v'/v − 1|` en el resto. Va al sidecar y es listón.
7. Manifiesto al final, ordenado por RA como el resto de catálogos, con cabecera
   «GENERADO, no editar a mano» y comando de regeneración.

Determinista: mismo stack, mismos parámetros, mismo hash. Reejecutable por objeto
(`--solo "NGC 5194"`), reanudable (salta lo que ya tiene su `<v>`), con un informe
final (`docs/validacion/dso_texturas_informe.md`): cuenta por `motivo`, volumen,
histograma de `escalaAs`, lista de revisión (objetos con `fracAusenciaEscena > 0,2`).

Test: `scripts/test_dso_texturas.js`, sin red, sobre parches sintéticos y sobre el
banco pineado: ida y vuelta de la codificación, centinela ↔ NaN, WCS del sidecar =
WCS del FITS, `escalaAs`, cardinalidad (`objetos codificados ≥ N`, ADR 0005) y una
mutación documentada (romper `uMin` y ver que el test lo caza).

### 4.4 Runtime: sustituir la fuente sin mover la ley

Cambios en `resources/js/bitacora-ps1.js`:

1. **`ps1DescargarParche` deja de ser el único origen.** Nueva función
   `ps1FuenteParche(gal)`: si `BITACORA_DSO_TEXTURAS` tiene la fila con
   `modelo = "imagen"` → `ps1LeerTextura(url png, url json)`; si `modelo = "fila"`
   → `null` con `motivo` (sin petición de red); si no hay fila (catálogo más nuevo
   que el manifiesto) → comportamiento de hoy, proxy, **solo si `cfg.proxyRespaldo`
   es `true`** (por defecto `true` en la fase 1, `false` cuando el manifiesto cubra
   el catálogo entero).
2. **`ps1LeerTextura`** produce el **mismo objeto** que `parseFITS`:
   `{ancho, alto, datos: Float32Array (NaN donde q = 0), escalaAs, wcs, zpt: null}`.
   El PNG de 16 bits **no puede leerse por `<img>` + canvas** (el canvas entrega 8
   bits): se decodifica en JS puro —firma, `IHDR`, concatenación de `IDAT`,
   `DecompressionStream('deflate')`, filtros PNG 0-4, muestras de 16 bits
   big-endian—. Son ~120 líneas sin dependencias, en `resources/js/bitacora-png16.js`
   (`window.BitacoraPNG16`), con test en Node contra `zlib` (`scripts/test_png16.js`).
   Sin `DecompressionStream` (navegadores anteriores a 2023) → `null` y aviso: el
   objeto se pinta por su fila, que es el mismo respaldo que hoy cuando el proxy
   no responde.
3. **`PS1_PROXY_URL` y la URL de texturas pasan a configurables** (`cfg.proxyUrl`,
   `cfg.texturasUrl`, con el mismo getter/setter que `BitacoraGaiaRender.dssProxyUrl`):
   hoy la constante no tiene setter y los tests no pueden redirigirla.
4. **Avisos** (`ps1CapaGalaxias`): el motivo sale del manifiesto. Tabla de causas:
   `sur` («sin imagen de cartografiado: PanSTARRS no cubre por debajo de −30°»),
   `no-cabe` (texto actual), `sin-cobertura` («el cartografiado no cubre este
   campo»), `pisada`/`ausencia-excesiva` («la imagen está tapada por una estrella
   brillante; se muestra el modelo del catálogo»), y «el servicio de imágenes no
   responde» queda solo para el respaldo al proxy.
5. **`cachePS1`** se conserva (clave `ra,dec,lado`), la textura se decodifica una
   vez por sesión.

Fuera de `bitacora-ps1.js`:

- `simulador_ocular/ocular-wordpress.html` y
  `registro/registrar-observacion-wordpress.html`: una etiqueta
  `<script defer src="/wp-content/uploads/bitacora/dso-texturas-datos.js?v=…">`
  antes de `bitacora-ps1.js`, y `bitacora-png16.js` antes de `bitacora-ps1.js`.
  El orden importa (ADR 0020: el ciclo es de llamada, el guardián avisa).
- `scripts/dev_servidor_ocular.php`: que la regex sirva `dso/` y `.png/.json`.
- `README.md` del simulador: nueva sección «Texturas de cielo profundo» (qué son,
  cómo se regeneran, dónde se despliegan) y retirar el párrafo de
  `generar_niveles.py`/`ps1_service.py`.
- `simulador_ocular/CONTEXT.md`: entrada «Textura DSO» (fuente única, consumidores,
  invariantes, _evitar_: «asset», «sprite», «imagen maestra» sin calificar).

Lo que **no cambia**: `ps1ComponentesSersic`, `ps1AnclarACatalogo`, `ps1PesoImagen`,
`ps1EscalaMezcla`, `ps1PsfParche`, `ps1PintarParche`, `pintarFot`, H2c, la máscara
difusa, `ps1CabeEnParche`, `PS1_CLASES_DIFUSAS`.

### 4.5 Despliegue

- Primera subida: ≈ 1 GB por FTP a `uploads/bitacora/dso/`. Es una vez; después,
  solo los objetos cuyo `<v>` cambie (el generador emite la lista de ficheros
  nuevos y la de huérfanos a borrar).
- `.htaccess` en `dso/`: `Cache-Control: public, max-age=31536000, immutable`;
  `AddType image/png .png`, `application/json .json`. Sin CORS: mismo origen.
- El manifiesto sigue el `?v=` manual de los demás `*-datos.js`.
- Comprobar en el hosting: cuota de disco (hoy `cache-ps1/` ocupa 150 MB) y que el
  servidor no reescriba PNG (algunos plugins de WordPress «optimizan» imágenes en
  `uploads/`: hay que excluir `dso/`, o un PNG-16 pasaría a 8 bits en silencio).
- Local: el generador deja las texturas en `simulador_ocular/dso/` (gitignorado,
  junto a `cache-ps1/`). En git solo van el manifiesto y las fixtures del banco.

### 4.6 Guardianes y tests

| Test | Qué fija | Estado |
|---|---|---|
| `test_dso_texturas.js` (nuevo) | codificación ida y vuelta, centinela, WCS, escala, cardinalidad, mutación | fase 1 |
| `test_png16.js` (nuevo) | decodificador contra `zlib` de Node: filtros 0-4, 16 bits, `IDAT` partido | fase 1 |
| `test_fuente_parche.js` (nuevo) | `ps1FuenteParche`: manifiesto `imagen` → sin petición al proxy; `fila` → `null` con motivo y sin red; sin fila → proxy solo con `proxyRespaldo`; fallo de decodificación → `null` | fase 1 |
| `test_golden_difusas.js` | **se recaptura** en la fase 1 con `--capturar` sobre las texturas del banco a `salida = 1024` (equivalencia) y otra vez en la fase 2 (resolución); cada recaptura con su delta en el informe | fases 1 y 2 |
| `test_resolucion_ps1.js` | `PS1.salida` deja de ser constante única: pasa a `salida(lado)` y el test fija la regla C (escala en 1,5′, 4,6′, 20′) y que `OBJETIVO = 0,67` se alcanza salvo en el tope | fase 2 |
| `test_capa_difusa_defecto.js` | igual, pero comprobando que la petición es a `dso/` y no al proxy | fase 1 |
| `test_ps1_nan_ausencia.js`, `test_mascara_muerde_escena.js`, `test_psf_produccion.js` | sin cambios de contenido; sus parches pasan a venir de las fixtures `dso/` | fase 1 |
| `test_estrellas_capa_escena.js` | fase 3: las `fuentesConservadas` del sidecar excluyen exactamente las mismas filas que hoy `parche.enEscena` | fase 3 |

Fixtures: `scripts/fixtures/dso/` con las texturas del **banco golden** (los 11
objetos con Gaia pineada: 4 galaxias + 5 nebulosas + NGC 7008 + Abell 12) **a
`salida = 1024`** para la equivalencia. Pesan **18,33 MB** en PNG-16 y **van en
git** (decisión 9.1, ADR 0024). Los otros objetos del banco se descargan en la
primera ejecución (hoy de STScI; tras la fase 1, de `dso/` en producción).
NGC 7008 y Abell 12 no tienen todavía CSV de Gaia en
`scripts/fixtures/gaia/`: se generan con `gen_fixtures_gaia.js` antes de la fase 1.

---

## 5. Fases, listones y vías de escape

Una capa por fase (ADR 0007). Los listones se escriben en un ADR de prerregistro
**antes** de generar la primera textura, con ambas conclusiones válidas de antemano
(ADR 0012 bis) y un tope duro por fase. Si un listón falla, no se ajusta el umbral:
se documenta y se decide.

### 5.0 Banco estratificado: sobre qué se ejecutan las fases 0-2

Las fases 0-2 no necesitan las 1050 filas: lo que juzgan (equivalencia,
codificación, resolución, coste) se decide igual sobre un banco, y el runtime ya
admite el régimen mixto (fila en el manifiesto → textura; fila ausente → proxy como
hoy). La generación completa se hace **después** del PASA de la fase 2.

Reglas del banco, fijadas aquí y copiadas al ADR de prerregistro:

- **Se elige por modo de fallo y por cuantil de tamaño, no por tipo.** «Diez por
  tipo» no es un reparto posible: de las 1050 aptas, 927 son galaxias, 100 PN, 12
  RfN, 10 HII y 1 SNR. HII, RfN y SNR entran **enteras** (23 objetos).
  (Con las RfN de la PR #189 son 39 de clase entera y **69 objetos** en total. El
  reparto de arriba es el del día del objetivo; la regla no cambia.)
- **Se elige antes de generar nada.** Un banco escogido después de ver resultados
  invalida los listones (ADR 0012 bis) y convierte el test de cardinalidad en
  decoración (ADR 0005).
- **Cada objeto lleva el motivo por el que está.** Un objeto sin motivo no entra;
  uno que cubra un modo de fallo sin representar se añade con su motivo, y el ADR
  registra el cambio.

Lados y cifras medidos con `ps1GalaxiasDelCampo` sobre el catálogo de este árbol.

**Galaxias (20):**

| Motivo | Objetos (lado del parche) |
|---|---|
| Cuantiles de lado (mín, p25, p50, p75, p90, tope) | NGC 3310 (1,57′), NGC 404 (2,80′), NGC 3377 (4,54′), NGC 4125 (7,89′), NGC 7331 (12,0′), NGC 205 (20′) |
| Golden existente (bit a bit hoy) | M51 = NGC 5194 (18,0′), M101 = NGC 5457 (20′), M104 = NGC 4594 (13,3′), M81 = NGC 3031 (20′) |
| Núcleo saturado en el stack | M87 = NGC 4486 (10,6′), M77 = NGC 1068 (5,35′) |
| Banda de polvo / de canto | M64 = NGC 4826 (12,5′), NGC 4565 (18,6′), NGC 891 (20′) |
| Vecinas en la escena / campo denso | NGC 5195 (6,55′, con M51), M84 = NGC 4374 (5,46′) y M86 = NGC 4406 (12,9′) en Virgo, M82 = NGC 3034 (13,8′, con M81) |
| Borde de cobertura (δ = −25,3°) | NGC 253 (20′) |

**Nebulosas planetarias (10):**

| Motivo | Objetos |
|---|---|
| Golden existente | M57 = NGC 6720 (2,29′) |
| Mordida (ADR 0021) por debajo, sobre y en el tope del umbral 0,6 | NGC 7008 (43,6 %), Abell 12 (79,8 %), NGC 7026 (100 %) |
| Compacta brillante en el lado mínimo (1,5′) | NGC 7662, NGC 6543 |
| Cuantiles de lado entre las PN | M97 = NGC 3587 (6,4′), NGC 1360 (11,6′), M27 = NGC 6853 (12,1′), NGC 7293 (20′, tope) |

**HII (10), RfN (12), SNR (1): todas las aptas**, incluidas las golden M78 =
NGC 2068, NGC 7635, NGC 6888 y M1 = NGC 1952.

**Controles de exclusión** (deben salir `modelo = "fila"` con su motivo, sin
petición de red): M31 = NGC 224, M33 = NGC 598, IC 342 y NGC 7000 (`no-cabe`);
una galaxia de δ < −30° a elegir en el ADR (`sur`).

Total: **53 texturas + 5 controles**. Cardinalidad mínima de los tests del banco:
53 (ADR 0005).

Corregido el 2026-09-04: son **69 texturas** (30 nombrados + 39 de clase entera:
10 HII, 28 RfN, 1 SNR) y los mismos 5 controles. La cardinalidad de los tests
**no se escribe**: la devuelve `lib_banco_dso.js`, porque el número es derivado y
clavarlo hace que el guardián falle cuando el catálogo crece. Ver el ADR 0024
§«Banco».

Lo que el banco **no** responde y queda para la generación completa: compresión y
volumen reales (muestra aleatoria de la fase 0), límite de tasa de STScI a 1050
peticiones, fricción del FTP de ≈ 1 GB y la lista de revisión por
`fracAusenciaEscena`.

### Fase 0 — Medir (sin código de producción)

Sobre el banco estratificado (53 objetos) y sobre una muestra aleatoria de 50
filas aptas (semilla fija, escrita en el informe) para las cifras de volumen:

- Compresión real PNG-16 (`bytes/px`) → sustituir el ×0,6 de la tabla 4.2.
- `errCuantMaxSigma` de `asinh16` con `a = σ`.
- Fracción de NaN en la escena por objeto (pregunta 1 de la propuesta original:
  «¿cuántos objetos presentan saturación relevante?»). Umbral de la lista de
  revisión: `fracAusenciaEscena > 0,2` (a confirmar con la distribución).
- Tiempo de descarga por objeto y comportamiento de STScI ante 1050 peticiones
  seguidas (límite de tasa; el generador necesita pausa y reintentos).
- Existencia de `DecompressionStream` en los navegadores del proyecto.

Entregable: `docs/validacion/dso_texturas_fase0.md` con las cifras. Sin listones:
esta fase solo mide.

### Fase 1 — Sustituir la fuente, a igual resolución

Textura = el mismo recorte que hoy (`salida = 1024`), codificado `asinh16`. Runtime
lee textura, proxy como respaldo.

Listones:

- **L1.1 Equivalencia**: para los objetos del banco, `parche.datos` tras
  `ps1AnclarACatalogo` difiere del camino FITS en `max|Δ| ≤ 0,05·σ` píxel a píxel
  y `|ΣΔ|/Σ ≤ 1e-4`; los NaN heredados del stack son idénticos (0 píxeles de
  diferencia) y los que nacen de la regla de ausencia solo difieren en píxeles a
  `|v − corte| ≤ paso de cuantización`, y en no más de 1e-4 del parche. Los
  5 controles de exclusión salen `fila` con su motivo.
  (Redacción corregida el 2026-09-04 con lo medido en la fase 0; el porqué está
  en el ADR 0024, «Corrección de la redacción de L1.1».)
- **L1.2 Sin red**: con el manifiesto completo y `proxyRespaldo = false`, un render
  del campo de M51 no emite ninguna petición fuera de `dso/` (fetch de mentira que
  registra URLs, como `test_capa_difusa_defecto.js`).
- **L1.3 Coste**: tiempo de `ps1LeerTextura` (descarga + decodificación) ≤ tiempo
  del FITS por proxy en caliente, medido en el navegador con `performance.now()`
  sobre los 4 golden; y peso transferido ≤ 0,5× del FITS.
- **L1.4 Guardianes**: la suite entera verde tras recapturar el golden, con el
  informe de deltas (todos ≤ L1.1).

Vía de escape: si L1.1 falla por la cuantización, subir a `a = σ/4` (más finura
cerca del cielo) **una vez**; si sigue fallando, la codificación pasa a float32
crudo con `Content-Encoding: gzip` y se mide otra vez el volumen. Tope duro: dos
codificaciones que no cierran L1.1 son un no, y se cierra sin código.

### Fase 2 — Resolución por objeto (regla C)

Listones:

- **L2.1** σ_PSF ≥ 1 px para D ∈ {80, 203, 457, 914} mm en todos los objetos con
  lado < 17′ y ≥ 0,85 px en el tope de 2048 (ninguno «subpíxel»).
- **L2.2** 457 mm y 914 mm se separan en M51/M81/M101/NGC 205 por ≥ 1σ del ruido de
  cielo (el listón del README), medido con `harness_decision_psf_resolucion.js`;
  y en los seis representantes de cuantil de lado el signo es el correcto (más
  apertura, menos `θ_add`).
- **L2.3** Flujo total por objeto invariante con la resolución (±2e-3), como fija
  `test_resolucion_ps1.js`.
- **L2.4** Volumen total ≤ 1,5 GB en PNG; memoria por parche decodificado ≤ 16 MB
  (2048² float32) y el campo de Virgo (≥ 6 parches) no supera 150 MB en el navegador.

Vía de escape: tope 1794 px (el número del README) en vez de 2048 si L2.4 falla.

### Fase 3 — Máscara y fuentes conservadas offline

Ejecutar `ps1EstrellasEnPixeles` + `ps1EscenaEnParche` + `ps1QuitarEstrellas` en
Node con una consulta Gaia pineada por objeto (patrón `gen_fixtures_gaia.js`,
G ≤ 20). La textura guarda el parche **ya sin estrellas** (con sus NaN de mordida),
`fuentesConservadas` (ra, dec, G de cada fuente que la escena conservó) y
`procedencia`. En runtime se salta `ps1QuitarEstrellas`, `ps1MagConsulta` deja de
forzar G = 20 y la exclusión de la capa de estrellas usa `fuentesConservadas`
(identidad por posición con tolerancia 1″ **porque el proxy de Gaia no devuelve
`source_id`**; añadirlo a `gaia_proxy.php` es la forma limpia y se anota en mejoras).

Listones:

- **L3.1** Para el banco, `parche.datos` = bit a bit el de la fase 2 (misma ley, misma
  Gaia pineada), y `excluidas` de la capa de estrellas idénticas fila a fila.
- **L3.2** Filas Gaia transferidas por campo bajan ≥ 40 % en M51 a 133× con 200 mm
  (la máscara ya no pide G = 20).
- **L3.3** La versión `<v>` cambia si cambia `cfg.mascaraMaxAs`, `mascaraMagRef`,
  `rellenoPlanoMaxAs` o `mordidaCobMin` (test que muta la cfg y espera hash nuevo).

Riesgo específico: la máscara queda **congelada** con Gaia DR3 y la cfg del momento;
un cambio de ley obliga a regenerar 1050 texturas (≈ horas de descarga si la caché
local se perdió). Se acepta a cambio de quitar la consulta profunda del camino
caliente. Vía de escape: si L3.2 no compensa el coste de regeneración, la fase 3
se cierra y la máscara sigue en runtime.

### Fase 4 — Saturación, segundo sondeo, imagen maestra (solo con la fase 0 en la mano)

Se abre únicamente si la fase 0 muestra una fracción de escena saturada relevante
en una parte medible del catálogo (listón de apertura a fijar con la distribución;
orientativo: ≥ 5 % de los objetos con `fracAusenciaEscena > 0,05`). Contenido:

- Warps individuales de PS1 (`ps1filenames.py?type=warp`, a comprobar) para los
  núcleos saturados del stack; combinación por máscara de saturación, en la rejilla
  del stack, con conservación de flujo comprobada frente al stack donde ambos son
  válidos.
- Segundo sondeo (SDSS / Legacy Surveys) reproyectado a la rejilla de PS1, solo
  para rellenar píxeles marcados ausentes (principio «rellenar solo los agujeros»
  de la propuesta original, que coincide con la semántica de ausencia del ADR 0017).
- Mapa de procedencia por píxel en el árbol de construcción; en el sidecar solo la
  leyenda y las fracciones.
- **Renombrado** de `bitacora-ps1.js` → `bitacora-difusa-imagen.js`
  (`window.BitacoraDifusaImagen`), con los ~52 scripts migrados en el mismo commit
  y sin puente (ADR 0020). Los prefijos `ps1*` se conservan hasta que un segundo
  sondeo entre de verdad en los píxeles.

Listones a prerregistrar entonces: conservación de flujo entre stack y warp en la
zona válida (±1 %), continuidad en la costura (sin escalón > 1σ en un anillo de 3
px), y **ningún píxel del segundo sondeo fuera de la máscara de ausencia**. El ADR
0004 manda: nada de «se ve mejor» como criterio.

### Fase 5 — Cobertura (mejoras M6 y M7, no este objetivo)

---

## 6. Cambios concretos por fichero

| Fichero | Cambio | Fase |
|---|---|---|
| `scripts/gen_dso_texturas.js` | nuevo: generador (4.3) | 1 |
| `scripts/lib_png.js` | añadir `escribirGris16(ruta, u16, W, H)`; conservar `escribir` | 1 |
| `scripts/lib_bajar_parche.js` | parámetro `salida` por objeto; reintentos con pausa; sin cambios de costura | 1 |
| `resources/js/bitacora-png16.js` | nuevo: decodificador PNG-16 gris (4.4.2) | 1 |
| `resources/js/bitacora-ps1.js` | `ps1FuenteParche`, `ps1LeerTextura`, `cfg.proxyUrl`, `cfg.texturasUrl`, `cfg.proxyRespaldo`, avisos por motivo; `ps1DescargarParche` queda como camino de respaldo | 1 |
| `simulador_ocular/resources/js/dso-texturas-datos.js` | nuevo, generado | 1 |
| `simulador_ocular/ocular-wordpress.html`, `registro/registrar-observacion-wordpress.html` | dos `<script defer>` nuevos antes de `bitacora-ps1.js` | 1 |
| `scripts/dev_servidor_ocular.php` | servir `dso/` y `.png/.json` | 1 |
| `.gitignore` | `simulador_ocular/dso/` | 1 |
| `scripts/test_dso_texturas.js`, `scripts/test_png16.js`, `scripts/test_fuente_parche.js` | nuevos | 1 |
| `scripts/fixtures/dso/` | banco a 1024 (decisión 9.1) | 1 |
| `scripts/fixtures/golden_difusas.json` | recaptura con informe | 1, 2 |
| `scripts/test_resolucion_ps1.js`, `scripts/test_capa_difusa_defecto.js` | adaptar (4.6) | 1, 2 |
| `simulador_ocular/README.md` | sección nueva; retirar `generar_niveles.py`/`ps1_service.py`; tabla de causas de aviso; despliegue | 1 |
| `simulador_ocular/CONTEXT.md`, `CONTEXT-MAP.md` | término «Textura DSO»; «PS1» sigue nombrando la ley | 1 |
| `simulador_ocular/docs/adr/0024-preregistro-catalogo-de-texturas-dso.md` | prerregistro de listones de las fases 1-3, banco, vías de escape y topes; ampliación del ADR 0013 | redactado (2026-09-04) |
| `simulador_ocular/docs/adr/0013-…` | **ampliado** desde el ADR 0024 (párrafo de remisión al final): la textura es una segunda fuente del modelo intrínseco, declarada por fila en el manifiesto; la clase sigue sin decidir código | redactado |
| `simulador_ocular/docs/especificaciones/README.md` | añadir este documento al orden cronológico | ya |
| `simulador_ocular/gaia_proxy.php` | (mejora M4) devolver `source_id` | 3 |
| `simulador_ocular/ps1-proxy.php` | sin cambios; se retira del despliegue cuando `proxyRespaldo = false` sea el defecto | tras 1 |

---

## 7. Riesgos a paliar o resolver

1. **El navegador no lee PNG de 16 bits por `<img>`**: canvas entrega 8 bits.
   Mitigación: decodificador propio con `DecompressionStream` (4.4.2), test en Node
   contra `zlib`, y respaldo declarado (sin `DecompressionStream` → modelo de fila
   + aviso). Comprobar en fase 0 qué navegadores usa el proyecto.
2. **Cuantización frente a la semántica de ausencia** (ADR 0017/0021,
   `test_ps1_nan_ausencia.js`): la decisión `v < cielo − 2σ` debe salir igual antes
   y después de codificar. L1.1 lo mide píxel a píxel; la vía de escape es float32
   gzip. No se acepta 8 bits ni WebP con pérdida: un artefacto de compresión con
   estructura periódica es bloqueante por el precedente del ADR 0015 (textura SBF:
   «el artefacto de malla se resuelve en el generador»), y una pérdida no
   invertible es una ley de display en el fichero (ADR 0019).
3. **El golden bit a bit se rompe por construcción.** Declararlo en el ADR de
   prerregistro, recapturar en el mismo commit que cambia la fuente, con la tabla de
   deltas. Nunca en silencio. El golden sigue siendo «misma máquina, mismo Node».
4. **Contradicción aparente con el ADR 0013 y con la alternativa (4) descartada
   en la nota de NGC 7008.** Respuesta que hay que dejar escrita en la ampliación
   del 0013: la textura no es un recurso curado por objeto sino un dato generado por
   un script determinista desde un sondeo público, con procedencia por fila, igual
   que `estrellas-brillantes-datos.js`; la fila Sérsic sigue siendo el modelo cuando
   no hay imagen y el presupuesto de luz cuando la hay; ninguna clase decide código.
   Los cuatro costes que la nota enumera (datos versionados, licencias, escala,
   WCS) están presupuestados en 4.1 y 4.5.
5. **ADR 0004 en el generador.** Cada transformación offline tiene procedencia
   física: recorte, costura por NaN, codificación invertible. Nada más en las
   fases 1-3. En la fase 4, cada paso (warps, reproyección) con su listón de
   conservación. Vigilar los nombres: `test_disciplina_v7.js` §3 rechaza
   `boost*`, `realce*`, `gamma*` en la capa fotométrica.
6. **ADR 0008: leyes copiadas al generador.** Resuelto por construcción usando las
   funciones de producción desde Node. Riesgo residual: `lib_bajar_parche.js` es
   una réplica declarada del proxy PHP; si el proxy cambia, la réplica no se
   entera. Mientras el proxy sea respaldo, `scripts/test_ps1_proxy.php` y un test
   cruzado de URLs (`ps1_url_recorte` PHP = `urlRecorte` Node sobre 3 casos)
   protegen la equivalencia.
7. **Gaia sigue en el camino caliente de la máscara hasta la fase 3**, y en la fase
   3 la máscara queda congelada con DR3 y la cfg del momento. Coste de regeneración
   completa: 1050 descargas (con la caché local, minutos; sin ella, horas y
   dependiente de STScI). Guardar la caché local de FITS (`$PS1_HARNESS_DIR`,
   ≈ 4–8 GB) fuera del repo y hacer copia.
8. **Casos que la textura no arregla porque el dato no está**: NGC 7000 (el stack
   restó la emisión extendida), M31/IC 342/M33 (no caben), el Velo. Siguen en
   `fila` con motivo; no se maquilla. Un segundo sondeo (fase 4 / M6) es la única
   salida, y hay que medir antes si lo trae.
9. **Costura del borde del parche** (issue #89) y **estelas de sangrado** (README
   «sin resolver»): no cambian con la fuente. Lo que sí cambia es que en offline se
   puede usar la **máscara de PS1** (`stk.g.unconv.mask.fits`, a comprobar en
   `ps1filenames.py`) para marcar las estelas como ausencia en vez de adivinarlas
   con un disco. Es fase 4, con listón de «ausencia solo donde la máscara lo dice».
10. **Doble conteo del velo** (ADR 0014): la textura de un sondeo ya contiene el
    fondo no resuelto de su campo. Hoy el parche PS1 recibe el mismo tratamiento y
    no se ha medido si `veloSB` se suma de más sobre él. No cambia con este
    objetivo, pero conviene dejarlo apuntado (H2 de la niebla, issue #186, es un
    pariente).
11. **Despliegue manual de ≈ 1 GB por FTP**, sin script de despliegue ni CI. La
    primera subida es larga; las siguientes son incrementales por `<v>`. El
    generador emite la lista de ficheros a subir y a borrar. Riesgo del hosting:
    cuota de disco y plugins que reescriben imágenes en `uploads/` (excluir `dso/`).
12. **Memoria en el navegador**: 2048² float32 = 16 MB por parche; Virgo puede
    tener 6-10 parches en el campo. L2.4 lo acota; si falla, tope 1794 o
    decodificación perezosa por parche visible.
13. **Licencias**: PS1 DR2 es público con cita (STScI/PS1 Science Consortium); SDSS
    y Legacy Surveys tienen sus propios términos y créditos. Redistribuir recortes
    desde `bitacoraestelar.app` exige la nota de atribución en el README
    §Dependencias y en la ficha del objeto si el proyecto muestra créditos.
14. **Tests vacuos** (ADR 0005): un test «todas las texturas pasan» sobre un
    manifiesto vacío o un filtro que no casa da verde sin medir nada. Cardinalidad
    mínima y mutación documentada en cada test nuevo.
15. **Ambigüedad de numeración de ADRs**: `docs/adr/0016` y `docs/adr/0017` son
    duplicados desfasados de `simulador_ocular/docs/adr/0012` y `0015`. El nuevo ADR
    cita siempre `simulador_ocular/docs/adr/`; borrar los duplicados es la mejora M9.
16. **Doctrinas contradictorias en los generadores**: `gen_galaxias.py` y
    `gen_nebulosas.py` afirman que «un perfil sintético es más honesto que una foto
    profunda» y «se dibuja sin descargar un solo megabyte»; la capa PS1 ya las
    superó. Actualizar los docstrings en la fase 1, o el árbol queda con dos
    doctrinas.
17. **Skycells solapadas discrepan ≈ 15 % (mediana)** en la costura por «primer
    píxel válido» (`ps1_fusionar`). No cambia con este objetivo; se hereda tal
    cual en fases 1-3 para conservar la equivalencia. Promediar con pesos es fase 4.
18. **Rate limiting de STScI** durante la generación masiva: pausa entre objetos,
    reintentos con espera creciente, reanudable. Medir en fase 0.

---

## 8. Mejoras identificadas (aparte, no obligan)

- **M1 · b/a y PA medidos en la imagen** para las filas donde OpenNGC no trae
  `MinAx`/`PosAng` (NGC 7008: fila `b/a = 1, PA = 0`, imagen `b/a ≈ 0,63, PA ≈ 17°`).
  El generador de texturas puede emitir `mapa/datos/dso_medidas.csv` (momentos de
  segundo orden dentro del borde real) y `gen_nebulosas.py` leerlo como **fuente
  de respaldo declarada** (OpenNGC > medida > redondo). Corrige el generado por su
  fuente, como exige el ADR 0021, y mejora el modelo de fila donde no hay textura.
- **M2 · Retirar el proxy PS1 del camino caliente** cuando el manifiesto cubra el
  catálogo: menos superficie (un proxy hacia STScI menos), sin caché LRU que
  vigilar. Mantener `ps1-proxy.php` solo para el generador local si conviene.
- **M3 · Consulta de Gaia más ligera** en la vista Canvas 2D (fase 3): quitar el
  `max(mag, 20)` de `ps1MagConsulta` baja filas y tiempo en campos densos, que es
  el modo de fallo que el estudio de caché (ADR 0012 bis) no pudo resolver.
- **M4 · `source_id` en `gaia_proxy.php`**: hoy la respuesta es
  `[ra, dec, G, BP−RP]`. Con `source_id` la exclusión de fuentes conservadas y
  cualquier cruce futuro se hacen por identidad (ADR 0015) y no por radio.
- **M5 · Lista de revisión por calidad**: el sidecar ya trae `fracAusenciaEscena`;
  un informe ordenado por ella da la lista de objetos que merecen fase 4 o mirada
  humana (las «preguntas 1-3» de la propuesta original respondidas con datos).
- **M6 · Cobertura al sur de −30°** (422 filas, el 28 % del catálogo difuso):
  Legacy Surveys DR10 / DES / SkyMapper como sondeo del hemisferio sur. Exige el
  renombrado del ADR 0020, calibración propia de `seeingAs`, ley de máscara y
  `kAusencia` medidas sobre ese sondeo (hoy están medidas sobre PS1: 19 031
  estrellas apiladas, α = 2,98) y el prerregistro de sus listones. No es «cambiar
  una URL».
- **M7 · Ampliar el catálogo de galaxias a OpenNGC V < 14** manteniendo la fila
  Sérsic (T de Hubble de OpenNGC → n, B/T; MajAx/MinAx → r_e por bisección como
  hoy). Con textura, la fila solo fija el presupuesto de luz, así que el error de
  la fila pesa menos que hoy. Coste: volumen ×3–4 y cadencia de FTP.
- **M8 · Retirar el origen `hips`** (PanSTARRS DR1 color por hips2fits, jpg con
  estirado del proveedor): con las texturas, la vista Canvas 2D ya lleva la
  imagen real de cada objeto; el origen `hips` queda como la única llamada
  externa desde el navegador sin proxy. Decisión de producto, no técnica.
- **M9 · Higiene documental**: borrar `docs/adr/0016` y `0017` (duplicados),
  `docs/ricco/seeing/` (duplicado sin informe), y la mención a
  `generar_niveles.py`/`ps1_service.py` en el README.
- **M10 · Máscaras de PS1 para las estelas de sangrado** (riesgo 9): en offline
  hay acceso a `*.mask.fits`; una estela marcada como ausencia deja de comerse
  media galaxia con un disco.
- **M11 · Color de las planetarias brillantes** (issue #84): las texturas van en
  banda g. Guardar también r o i dobla el volumen y no resuelve la física
  perceptual que el issue pide. Se anota para que la decisión de banda única quede
  consciente; no se hace aquí.
- **M12 · Precalentado de la fase 3 como Routine nocturna**: si el hosting lo
  permite, la regeneración incremental por `<v>` puede correr en el servidor con
  la caché local, quitando el FTP de 1 GB del camino. Depende del hosting.

---

## 9. Decisiones que no toma este documento

1. ~~**Fixtures del banco golden en git** (los 11 con Gaia pineada, ≈ 15–25 MB de
   PNG-16) o descargadas de producción en la primera ejecución.~~
   **DECIDIDO el 2026-09-04: van en git**, 18,33 MB medidos, porque el golden no
   puede depender del orden en que STScI devuelve las skycells. Las dos
   condiciones —solo los 11, y que la fase 2 decida por escrito si siguen a
   producción— están en el ADR 0024 §«Decisión 9.1». Los demás objetos del banco
   no van a git en ningún caso (97,4 MB).
2. **Tope de 2048 px** (regla C, 1,0 GB) frente a **1794 px** (el objetivo de
   0,67″/px del README, ≈ 0,8 GB). Se decide con la compresión real de la fase 0.
3. **Cuándo poner `proxyRespaldo = false`** por defecto: al cubrir el 100 % del
   catálogo, o mantener el proxy para las filas nuevas que entren en el catálogo
   antes de regenerar texturas.
4. **Dónde vive la caché local de FITS** del generador (`$PS1_HARNESS_DIR`) y su
   copia de seguridad: es lo que convierte una regeneración de horas en minutos.

---

## 10. Entregables antes de tocar código (mismo contrato que `ampliar_cielo_profundo_objetivo.md`)

1. Informe de la fase 0 con las cifras que este documento deja como estimación
   (compresión, `errCuantMaxSigma`, fracción de ausencia en escena, tiempos).
2. ADR 0024 de prerregistro con los listones L1–L3, vías de escape y topes duros,
   y la ampliación del ADR 0013.
3. Lista de tests nuevos y de golden a recapturar, con el procedimiento de
   recaptura.
4. Estrategia de validación visual: `harness_vistas_np.js` y las vistas del banco
   estratificado (5.0), antes/después, en {457 mm · 190× · SQM 21,2} y
   {203 mm · 100× · SQM 20,5}; en la fase 2, además, los seis representantes de
   cuantil a 80 y 914 mm. Ningún sistema nuevo de validación.
   **Escrita el 2026-09-05** en `docs/notas/validacion-visual-difusas.md`, con
   tres correcciones sobre este párrafo: se miran **18 objetos y 26 vistas**, no
   los 69 del banco (setenta y ocho PNG que nadie abre no son validación); la
   Gaia de los que no son golden **no se pinea** (~12 MB por una propiedad que
   una vista no usa); y el «antes» se guarda con `--etiqueta`, porque el harness
   escribía siempre al mismo sitio y la segunda pasada borraba la primera.

   Los entregables 3 y 4 están en `docs/notas/recaptura-golden-difusas.md` y
   `docs/notas/validacion-visual-difusas.md`.

Después de la aprobación: fase 1 completa (generador, decodificador, fuente,
tests, golden, README, CONTEXT, HTML de los dos consumidores), suite verde,
vistas comparadas, informe de deltas. Solo entonces fase 2.

## Regla final

**La textura es un dato del proyecto, no una imagen bonita: se genera con las leyes
de producción, se codifica de forma invertible, se sirve inmutable y se juzga con
los mismos guardianes que hoy juzgan el parche. Todo lo que no pase por ahí es
una plantilla curada, y eso ya está descartado.**
