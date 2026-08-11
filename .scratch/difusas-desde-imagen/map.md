# Mapa — Capas difusas desde imagen real en el Canvas-2D de Gaia

**Label:** `wayfinder:map`

## Destination

Una spec confirmada de cómo la vista **Canvas-2D de Gaia** obtiene su componente
difusa de **imágenes reales de cartografiado**, entrando por la cadena
fotométrica que ya existe (`ctxFotometrico` → `Fobj` → `pintarFot`).

**Árbol cerrado el 11-ago-2026** (sesión de `/grilling`, 20 decisiones). Alcance
final: **galaxias**, por **parche por objeto** desde **ps1cutouts de STScI**, en
banda `g`, FITS lineal, con el nivel anclado a la mag V del RC3. Nebulosas y
globulares quedan fuera. Queda implementar, en las tres fases de más abajo.

## Estado al cerrar el 11-ago-2026 (rama `difusas-desde-imagen`)

**Fase 1 construida y funcionando.** Tres commits: `eb0b0a5` (la capa entera),
`425ccb4` (la galaxia salía espejada de arriba abajo), `5f4ba80` (lo tenue salía
exagerado: corte en cielo + 1,5·σ y techo ×2 al realce). `scripts/test_difuso.js`
tiene ~35 asserts nuevos, sin red. `test_salud_globo` y `test_segundo_auxiliar`
fallan también en `main`: no son de aquí.

Para verlo: recargar el simulador y en consola
`BitacoraGaiaRender.galaxiasImagen = true`.

**Fase 2 construida** (ficha 11, 11-ago-2026): `simulador_ocular/ps1-proxy.php`
sirve el parche **ya cosido** con caché LRU en disco. El navegador hace una
petición por galaxia en vez de ocho, y de la segunda vez en adelante sale del
disco del servidor. No cambia un píxel. Requiere subir el PHP junto a los otros
dos proxies; sin él, la capa no pinta (el `fetch` da null y se apaga sola).

**Por dónde seguir, en orden:**

1. **Ficha 07** — solo se ha mirado **M51**. Faltan M31 (parche a 20′), NGC 4565,
   Virgo, campo vacío, NGC 253 (aviso del sur) y los dos aumentos. Su Answer ya
   recoge lo medido en M51.
2. **Decisiones abiertas de esa mirada**, las tres escritas en la Answer de la 07:
   estrellas de más (ficha 04), doble contabilidad en el solape M51/NGC 5195, y
   las aureolas de Gaia, que compiten con el disco.
3. **Ficha 12** — casilla, avisos y encendido por defecto. (La 11, el proxy con
   caché, está cerrada.)

## Notes

- **Dominio:** simulador de ocular astronómico. JS de navegador + proxies PHP.
  Sin build, sin framework de test (`scripts/test_*.js` con asserts a pelo).
- **Skills a consultar en cada sesión:** `/grilling`, `/domain-modeling`,
  `/prototype` para las fichas de tipo prototipo.
- **Idioma:** todo el repo escribe en español, comentarios incluidos.
- **Medidas.** `bench/` guarda los tres bancos que cerraron la ficha 02, todos
  ejecutables con `node bench/<fichero>` sin dependencias: `bench_estrellas.js`
  (coste por método), `bench_calidad.js` y `bench_calidad2.js` (cuánto se lleva
  del objeto), `bench_proyeccion.js` (desvío lineal vs TAN, origen de la 09).

### Punto de partida (no volver a investigar)

- **Ya se intentó y se borró.** Commits `b744d65`…`afd4474` construyeron galaxias
  por Sérsic sintético (bulbo, banda de polvo, disco de canto), nebulosas NGC/IC
  por la misma tubería, telón de conteos y halo de King. `d0a3641` (31-jul-2026)
  borró `capasDifusas` entera: *"el resultado no convenció"*.
  **Por qué no convenció** (dicho por el usuario, 07-ago-2026): el Sérsic parecía
  falso, había errores de bulto —galaxias con formas erróneas— y el resultado era
  una mancha uniforme. Decisión suya: **reconstruir de cero**, no revertir.
  Código viejo recuperable en `d0a3641^` si alguna vez hace falta mirarlo.
- **El árbol de decisiones viejo** vive en
  `simulador_ocular/notas-render-difuso-gaia.md`. Sus decisiones 3, 5, 7, 13, 17,
  21 caen con este cambio de rumbo; sus justificaciones de 6 (el cielo se suma
  **detrás** del polvo, no delante) y del **signo de la atenuación**
  (`−2,5·log10(B_rel)`, la spec traía `+`) siguen en pie.
- **La infraestructura de imagen ya está en producción.** `bitacora-ocular.js:661`
  pide recortes a `hips2fits` del CDS (`CDS/P/PanSTARRS/DR1/color-z-zg-g`,
  proyección TAN, `format=jpg`, `width=height=PROC`), sin proxy propio.
  `flujoDePlaca(v, esHips)` ya convierte luma de placa a `Fobj` con una rama de
  gamma para PanSTARRS, y `repararNucleos` ya arregla el núcleo hundido de sus
  mosaicos. **La §5 de la spec (biblioteca de plantillas FITS + StarNet++) no
  hace falta: el campo entero llega en una petición.**
  **Superado el 11-ago-2026:** eso sigue describiendo la vista HiPS que está en
  producción, pero la **capa difusa** ya no sale de ahí. Va por ps1cutouts, con
  parche por objeto y FITS lineal (fichas 03 y 10). `hips2fits` se queda donde
  está, sirviendo su JPG de color a la vista HiPS, y nada más.
- **La cadena fotométrica sobrevivió al borrado**: `ctxFotometrico`, `pintarFot`,
  `valorDeFlujo`/`flujoDeValor`, `visibilidadDifusa`, `realzarPerceptual`,
  `adaptacionLocal` siguen en `resources/js/bitacora-gaia-render.js`. La pupila y
  la transmisión se aplican **una sola vez**, ahí.
- **El módulo de render es compartido** con el generador de imagen del formulario
  de registro (`registro/resources/js/bitacora-formulario.js:934`). Todo lo que se
  añada al render se lo come también el formulario.

## Decisions so far

<!-- una línea por ficha cerrada; el detalle vive en la ficha -->

- **01 — hips2fits sirve FITS, pero sin fotometría.** `format=fits` da float32
  (`BITPIX=-32`) con WCS TAN completa y CORS abierto (`allow-origin: *`, se pide
  desde el navegador sin proxy). Pero **sin `BUNIT` ni `MAGZP`**: el punto cero
  no existe en la cabecera, habría que derivarlo por campo contra el catálogo
  PS1. `CDS/P/PanSTARRS/DR1/g` existe. Peso: 2,0 MB por recorte de 720².
  Y el servicio **se cayó entero durante la sesión**, los tres nombres a la vez,
  arrastrando el JPG de color que ya está en producción.
- **02 — la máscara por catálogo gana; y el estirado es un activo, no un
  defecto.** Máscara en las posiciones de Gaia + relleno desde el entorno: 1,3 ms
  en 720², núcleo al 100 %, estrella al 1 %. Mejor en coste **y** en calidad que
  todo lo demás, y `desenfocar()`/`rellenarNucleo` ya están en el módulo. Sobre
  imagen lineal, cualquier filtro morfológico que mate la estrella se lleva medio
  objeto (esa es la «mancha uniforme» del intento anterior); sobre imagen
  **estirada** la apertura 7×7 deja el 98 % del flujo. La resta de PSF solo gana
  con centrado casi perfecto (0,5 px de error → 28 % de residuo).
- **Consecuencia sobre la 03:** la vía B (FITS lineal) ha engordado —parser +
  2 MB + segunda petición a MAST + fotometría en JS— y la vía A (JPG estirado) ha
  ganado un argumento nuevo. La carga de la prueba se ha invertido.
- **Ficha nueva 09:** `dibujar()` proyecta lineal, `hips2fits` entrega TAN. A
  δ=70° y 30′ de campo son 4,8 px de desvío. Hay que decidir antes de la 04.
- **Cambio de fuente (11-ago-2026): ps1cutouts de STScI en lugar de hips2fits.**
  Decisión del usuario, por el aspecto de las imágenes, contrastada contra el
  servicio real en la misma sesión. `ps1filenames.py` + `fitscut.cgi`, CORS
  abierto, y **punto cero en la cabecera** (`ZPT_0000…` ≈ 24,46), que es justo lo
  que le faltaba a hips2fits y lo que había engordado la vía B de la 03. A
  cambio, sirve **una skycell** (~26′), no un mosaico: un recorte que cruza el
  borde sale recortado y sin avisar. Detalle y medidas en la ficha 10.
- **03 — FITS lineal en banda `g`, con el nivel anclado al catálogo.** El `ZPT`
  fija la escala, pero el residuo de cielo del stack manda a μ ≈ 24, así que el
  nivel absoluto lo pone la **mag V del RC3**: restar cielo del borde, integrar,
  reescalar. La imagen aporta forma y contraste interno; el catálogo, la luz.
- **Alcance: solo galaxias, y por parche, no por campo.** Un recorte por objeto
  del catálogo RC3, lado `min(6·r_e, 20′)`, `output_size` fijo. Independiente de
  ocular y aumento, luego cacheable para siempre. Nebulosas y globulares, fuera.
- **04 — máscara solo hasta la magnitud que el render pinta.** El método ganador
  de la 02, con el corte de `magLimite`: lo más débil que PS1 ve y el ocular no
  resuelve se queda, porque es luz difusa legítima, no doble conteo.
  **Revisable:** si se ven estrellas de más, se pasa a máscara total.
- **05 — δ < −30° sin capa**, con aviso que dice la causa. El respaldo austral
  (DSS2, SkyMapper) es esfuerzo aparte, no de este.
- **06 — la capa entra en el simulador y en el formulario**, con interruptor en
  el simulador y encendida por defecto.
- **09 — cerrada sin tocar la proyección.** Con parche por objeto el desvío
  TAN–lineal interno es de milisegundos de arco; lo que queda es el giro del
  marco local (≈ Δα·sin δ), ~1 px en el peor caso. Se pega directo.
- **11 — el parche se cose en el SERVIDOR y se sirve en FITS tal cual.**
  `ps1-proxy.php`, con la caché LRU compartida. Resolver skycells, `wcs=1` y la
  costura por NaN salen del JS y pasan al PHP: una sola implementación.

## Plan de trabajo (11-ago-2026)

Tres fases, en este orden, y la primera acaba con un juicio del usuario:

1. **Ficha 10 — la capa, contra el servicio directo.** Parche por objeto desde
   `fitscut.cgi` sin proxy, interruptor apagado por defecto, pintado en el
   Canvas-2D de verdad para poder juzgarlo dentro de la cadena fotométrica.
   Lenta a propósito (hasta 8 peticiones por galaxia, 2,6 s cada una).
   Con ella, los asserts nuevos de `scripts/test_difuso.js`.
2. ~~**Ficha 11 — proxy con caché.**~~ **Hecha.** `ps1-proxy.php` resuelve
   skycells, cose los NaN y devuelve el parche listo, con
   `scripts/test_ps1_proxy.php`. Las funciones de red que vivían en el JS se
   borraron de ahí: ahora viven solo en el proxy.
3. **Ficha 12 — interruptor, avisos y encendido por defecto**, en simulador y
   formulario.

Lo que quedó atado a *ver el resultado* en la fase 1, y por tanto no está
decidido del todo: el corte de magnitud de la máscara (ficha 04, se puede pasar
a máscara total) y la gamma perceptual sobre imagen real (`GAMMA_PERCEPTUAL`
0,45, calibrada contra difuso sintético; sobre PS1 también realza el ruido).

## Not yet specified

- **Cuánto ruido del stack pasa el realce perceptual.** Si sobra, el arreglo
  puede no ser la gamma sino suavizar el parche antes de sumarlo: código nuevo.
- **Galaxias mayores del tope de 20′** (M31, M33). La corrección de Sérsic por
  la luz que queda fuera del parche sube al 40–60 %: es el punto más frágil del
  diseño, y solo se sabrá mirándolo.
- **`output_size` definitivo.** 512 px de partida, a revisar contra un campo real.
- **Solape entre skycells.** Dos skycells discrepan un 15 % (mediana) en los
  píxeles compartidos. De momento, el primer píxel válido; promediar si se nota.
- **`nebulosas-datos.js`.** El catálogo de galaxias se queda y ahora se usa
  (ficha 08); el de nebulosas sigue cargándose sin que nadie lo lea.
- **Interacción con el realce perceptual.** `GAMMA_PERCEPTUAL`,
  `visibilidadDifusa` y `realzarPerceptual` se calibraron contra difuso
  *sintético*. Con difuso de imagen real puede sobrar o cambiar de valor.

## Out of scope

- **Nebulosas** (decidido el 11-ago-2026) — su luz está en líneas, y la banda
  ancha que las capta bien (`r`, con Hα dentro) no es la que representa lo que ve
  el ojo. Arrastran su propia decisión de banda: ficha aparte, si se quieren.
- **Cielo austral, δ < −30°** — PS1 no llega. Son 365 de las 1295 galaxias del
  RC3, NGC 55 y NGC 253 entre ellas. Se queda sin capa, con aviso (ficha 05). El
  respaldo con DSS2 o SkyMapper sería otro esfuerzo, con su propio tratamiento de
  cielo, escala y estirado.
- **Galaxias fuera del RC3** — el catálogo es de galaxias brillantes, no un
  censo. Sin fila, no hay parche: el nivel se ancla a su mag V (ficha 03).
- **Telón difuso de conteos de Gaia y halo de King de globulares** — borrados en
  `d0a3641` junto a lo demás, pero no son imágenes de cartografiado y el encargo
  nombra galaxias y nebulosas. Vuelven, si vuelven, como otro esfuerzo.
- **Reconstrucción de núcleos saturados por perfil de Sérsic (§3 entera de la
  spec)** — es justo la vía que se descarta. `repararNucleos` ya trata el núcleo
  hundido de los mosaicos de PanSTARRS. Solo volvería si la ficha 03 eligiera
  FITS lineal *y* la saturación apareciera de verdad; entonces sería esfuerzo
  nuevo, no una reanudación.
- **Mapas all-sky de Hα (Finkbeiner) y de polvo (SFD / Bayestar19)** — descartados
  el 29-jul-2026 y las razones siguen en pie: a 6′/px dan un degradado y no
  estructura, el ojo es casi ciego a 656 nm, y son ~2–4 MB descargados siempre,
  también en el formulario de registro.
- **Biblioteca de plantillas FITS por objeto + StarNet++ (§4.2 y §5 de la spec)**
  — el campo entero llega en una petición a `hips2fits`; una plantilla por objeto
  añade preproceso, assets y un catálogo que hay que mantener, a cambio de nada.
- **Extinción aplicada a las estrellas de Gaia (§7 de la spec)** — el catálogo ya
  viene con el agujero: Gaia no detecta lo que el polvo extingue, así que la
  máscara contaría el polvo dos veces.
