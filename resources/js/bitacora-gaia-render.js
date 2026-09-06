/* ===========================================================================
 * BITÁCORA ESTELAR · Render de estrellas de Gaia DR3 (Canvas 2D) · COMPARTIDO
 * ---------------------------------------------------------------------------
 * Motor de dibujo de la vista "Estrellas de Gaia" del simulador de ocular,
 * extraído a un módulo DOM-agnóstico para poder reutilizarlo desde otros
 * formularios (p. ej. generar la imagen de una observación con el equipo de la
 * flota del observador). Fuente única para el simulador y para el formulario de
 * registro; el color vive en el módulo hermano BitacoraGaiaColor.
 *
 * No depende de ningún DOM concreto: recibe un <canvas> (o su contexto) y los
 * parámetros físicos (coordenadas, campo, apertura, aumento, cielo…). El TAMAÑO
 * de render es el del propio canvas (cuadrado); así sirve igual para el lienzo
 * del simulador (720 px) que para una imagen de 900 px.
 *
 * API:
 *   BitacoraGaiaRender.render(canvas, opts) → Promise
 *       Pinta el fondo de cielo + las estrellas. opts:
 *         { ra, dec,            // grados (J2000)
 *           arcmin,             // lado del campo real
 *           apertura,           // D (mm)
 *           aumentos,           // magnificación
 *           transmision,        // t (0..1); si falta, se deduce de 'optica'
 *           optica,             // tipo óptico (para transmisión y araña)
 *           arana,              // bool: dibuja spikes (si falta, se deduce de 'optica')
 *           sqm,                // brillo de cielo (mag/arcsec²)
 *           pupilaSalida, pupilaOjo,  // para el gris de fondo
 *           carbono,            // bool: realce rojo de la estrella central
 *           conGlow }           // bool (def. true): glow de estrellas no resueltas
 *   BitacoraGaiaRender.renderPlaca(canvas, opts) → Promise<{fuente}>
 *       La MISMA vista, pero con la placa fotográfica del DSS (vía dss-proxy.php)
 *       en vez del catálogo: mismas opts, más { dssProxy, fuente, conGaia }.
 *   BitacoraGaiaRender.urlPlaca({ base, survey, ra, dec, arcmin, fuente }) → URL del proxy
 *   BitacoraGaiaRender.consultar(ra, dec, arcmin, mag) → Promise<estrellas[]>  (prefetch)
 *   BitacoraGaiaRender.precalentar(opts) → void   (la consulta de render(), disparada antes)
 *   BitacoraGaiaRender.dibujar(ctx, estrellas, opts)   (dibujo puro, sin fondo ni query)
 *   BitacoraGaiaRender.magLimite({ apertura, aumentos, transmision, sqm }) → number|null
 *   BitacoraGaiaRender.magConsultaGaia(apertura, transmision, aumentos) → number (profundidad de consulta)
 *   BitacoraGaiaRender.profundidadConsulta(apertura, transmision, aumentos, paraCapa) → number
 *   BitacoraGaiaRender.nivelFondo({ pupilaSalida, pupilaOjo, sqm }) → 0..255
 *   BitacoraGaiaRender.transmisionOptica(optica) → number|null
 *   BitacoraGaiaRender.opticaTieneArana(optica) → bool
 *   BitacoraGaiaRender.config      → ajustes del render (mutable; = GAIA_CFG del simulador)
 *
 * Va SUBIDO POR FTP a /wp-content/uploads/bitacora/. Incrementa ?v=N al actualizar.
 * =========================================================================== */
(function () {
  'use strict';
  var GColor = window.BitacoraGaiaColor;

  /* ── Consulta a Gaia ── */
  // Profundidad de la consulta. Historial: 16,5 se quedaba corto para un 18" bajo
  // cielo rural, se subió a 17 fijo... y un 20" ya lo volvía a agotar. El fallo de
  // raíz era usar una profundidad IGUAL para cualquier equipo: un 8" nunca necesita
  // llegar tan lejos como un 20", y un 20" siempre se queda corto con un tope
  // pensado para uno más pequeño. magConsultaGaia() la calcula por APERTURA (más
  // el margen de la cola de glow, ver CFG.glowCorte), así cada equipo trae lo que
  // de verdad puede usar, ni más (tráfico) ni menos (estrellas que faltan).
  var GAIA_MAG_MIN        = 12.0;   // suelo: ni el equipo más modesto pide menos
  var GAIA_MAG_TOPE       = 20.0;   // techo de seguridad (mismo valor que GAIA_MAX_MAG en gaia_proxy.php)
  var GAIA_MAG_DEFECTO    = 17.0;   // sin apertura conocida (p. ej. sin equipo elegido aún)
  var GAIA_SQM_MAS_OSCURO = 22.0;   // el máximo del <input id="sim-sqm"> del simulador
  // Radio máximo de consulta: 4,32°, o sea 6° de lado, que cubre los oculares de
  // campo ancho y los binoculares. Antes eran 1,44° heredados del tope de 2° del
  // DSS, un límite de PLACA que no aplica a un catálogo. Lo que sí acota de verdad
  // es el TOP de la consulta: en campos ricos la muestra se trunca a magnitudes
  // más brillantes. No es un fallo silencioso — el ORDER BY garantiza que se
  // quedan fuera las más débiles, no las más brillantes.
  var GAIA_RADIO_MAX      = (360 / 60) * 0.72;
  var GAIA_RADIO_MIN      = 0.12;
  var GAIA_ARCMIN_DEFECTO = 60;
  // Por encima de GAIA_REQUEST_TIMEOUT del proxy (55s, gaia_proxy.php): si el
  // cliente aborta antes que el propio servidor, una consulta profunda que el
  // servidor SÍ habría terminado se ve como "error de conexión" sin serlo.
  // Sube con él: hacia el bulbo (M6, M7) una consulta legítima tarda ~23 s y
  // con 28 s se abortaba a un pelo del final. Aun si el cliente se cansa, el
  // proxy termina y cachea (ignore_user_abort), así que el reintento acierta.
  var GAIA_FETCH_TIMEOUT  = 60000;
  var PROXY_URL           = '/wp-content/uploads/bitacora/gaia_proxy.php';

  /* ── Transmisión y araña por tipo óptico (fuente única) ──
     Refractor 0,9 y reflector (2 espejos, sin corrector) 0,7 siguen a Torres
     Lapasió; los catadióptricos, con lámina/menisco corrector y obstrucción
     central, pierden algo más (~0,65-0,68). Los tipos no listados devuelven null
     y el llamador decide su valor por defecto.
     La araña de brazos del secundario es la que produce los diffraction spikes:
     los refractores no tienen obstrucción y los SC/Mak sujetan el secundario en
     la lámina/menisco, sin brazos. El simulador de oculares consume las dos
     desde aquí; antes tenía su propia copia de ambas tablas. */
  var TRANSMISION_DEFECTO = 0.8;
  var TRANSMISION_OPTICA = {
    'refractor': 0.9, 'newtonian': 0.7, 'cassegrain': 0.7, 'ritchey-chretien': 0.7,
    'dall-kirkham': 0.7, 'schmidt-cassegrain': 0.65, 'mak-cassegrain': 0.65,
    'schmidt-newtonian': 0.68, 'mak-newtonian': 0.68, 'schmidt camera': 0.65
  };
  var OPTICA_ARANA = {
    'newtonian': true, 'schmidt-newtonian': true, 'mak-newtonian': true,
    'cassegrain': true, 'ritchey-chretien': true, 'dall-kirkham': true,
    'refractor': false, 'schmidt-cassegrain': false, 'mak-cassegrain': false, 'schmidt camera': false
  };
  function transmisionOptica(optica) {
    if (!optica) return null;
    var t = TRANSMISION_OPTICA[String(optica).trim().toLowerCase()];
    return t != null ? t : null;
  }
  function opticaTieneArana(optica) {
    return !!(optica && OPTICA_ARANA[String(optica).trim().toLowerCase()]);
  }

  /* ── Curvas de la fotometría (fuente única; = FOT del simulador) ──
     Antes vivían duplicadas aquí y en bitacora-ocular.js, y había que
     sincronizarlas a mano. Ahora el simulador hace `var FOT = …render.fot`. */
  var FOT = {
    SB_OBJ_MAX: 14.0, SB_OBJ_MIN: 24.0, SB_NEGRO: 25.5, SB_BLANCO: 14.0,
    C_MIN: 0.08, C_EXP: 0.35, GAMMA_HIPS: 2.0,
    /* LEY HISTÓRICA C_MAG — hoy VÍA MUERTA: solo corre si H2C se apaga a mano
       (H2C = null), y se conserva únicamente como regresión histórica. En
       producción manda H2c (ver H2C más abajo). El razonamiento original:

       Dependencia del umbral de contraste con el TAMAÑO APARENTE del objeto.
       Sin esto, el umbral solo dependía del brillo del fondo, y entonces cambiar
       de un 12" a un 18" no mejoraba nada en objetos extensos: a igual pupila de
       salida el brillo superficial es idéntico —eso es física—, así que la imagen
       quedaba igual salvo por las estrellas.

       Lo que sí cambia es el tamaño en la retina. Más apertura permite más
       aumentos a igual pupila, y un objeto mayor se detecta con MUCHO menos
       contraste (datos de Blackwell, en los que Clark basa su método). Para un
       objeto fijo del cielo el tamaño aparente crece con los aumentos, así que
       se usan los aumentos como medida.

       C_MAG_MIN/MAX acotan el factor: el beneficio satura cuando el objeto ya
       llena el campo, y por abajo no tiene sentido penalizar sin límite.

       C_MAG_EXP era 0,5, y con eso la ley salía con el SIGNO CAMBIADO. A
       apertura fija, subir aumentos encoge la pupila de salida, así que el
       término de luminancia empeora el umbral como MAG^(2·C_EXP); el término de
       tamaño lo mejora como MAG^(−C_MAG_EXP). El neto es MAG^(2·C_EXP−C_MAG_EXP),
       o sea que hace falta C_MAG_EXP > 2·C_EXP = 0,70 solo para empatar. Con 0,5
       el neto era MAG^0,20: subir aumentos APAGABA el objeto. Antes no se notaba
       porque ps1Opacidad medía contra SBe y ahí la pupila entraba otra vez, con
       el signo contrario; al unificar la ley en Cmin el fallo quedó al aire.

       1,0 es la pendiente log-log del umbral con el tamaño en los datos de
       Blackwell, y deja el neto en 0,75 mag/dex. El clamp C_MAG_MIN corta el
       término de tamaño en MAG = C_MAG_REF·C_MAG_MIN^(−1/C_MAG_EXP) = 222x, y
       desde ahí solo queda la pupila: la curva tiene un máximo ahí, que en un
       18" cae en pupila 2,06 mm. Que exista ese óptimo es lo que impide que más
       aumentos mejoren para siempre. Medido en scripts/barrido_cmagexp.js.

       ponytail: el término de tamaño usa los AUMENTOS como medida, no el tamaño
       aparente real (diámetro del objeto × aumentos). Por eso el óptimo sale en
       el mismo aumento para una galaxia de 30' y una de 2', que es falso. El
       dato existe (reArcsec del catálogo); meterlo es la mejora de verdad. */
    C_MAG_REF: 100, C_MAG_EXP: 1.0, C_MAG_MIN: 0.45, C_MAG_MAX: 2.0,
    /* Ley H2c del umbral por tamaño — LEY DE PRODUCCIÓN (Blackwell 1946,
       ajuste conjunto medido en scripts/harness_ricco_seeing.js):
         Cmin *= (1 + θR(SBe) / θapp)²,  θapp = θeff·aumentos (arcmin),
         θeff = √(θint² + θseeing²),     log10 θR = THETA_R_A + THETA_R_B·SBe.
       Corrige el defecto documentado arriba (ponytail): usa el tamaño aparente
       real del objeto (θint·aumentos), no los aumentos solos. Sustituye al
       bloque C_MAG completo cuando está activa Y el objeto trae θint; los
       clamps C_MAG_MIN/MAX sobran porque el plateau (factor→1 en objetos
       grandes) y la ley de flujo (pendiente −2 en pequeños) acotan solos.
       El nivel absoluto (K≈2 = conservar C_MIN) quedó validado en campo:
       12 observaciones reales, 10/12 acordes, y los márgenes ordenan
       visto/lateral/no_visto (scripts/campo_h2c.js, simulador_ocular/docs/experimentos/ricco/campo/).
       SEEING_AS = 2″ fijo: sin modelo por noche, a propósito.
       H2C = null la apaga y recupera la vía C_MAG histórica, bit a bit:
       solo para regresión. */
    H2C: null, // el literal no puede autorreferirse: se fija a H2C_DEFECTO justo tras el objeto
    H2C_DEFECTO: { THETA_R_A: 0.094, THETA_R_B: 0.081, SEEING_AS: 2.0 },
    /* Curva del FONDO DE CIELO (independiente del tono del objeto): el fondo se
       pinta en función de su brillo superficial en el ocular (SBe, mag/arcsec²,
       atenuado por la pupila de salida y la transmisión). Un cielo de
       SB_CIELO_BLANCO llega a blanco puro; a partir de ahí la LUMINANCIA de
       pantalla baja con el flujo del cielo, y esa luminancia se codifica en
       sRGB (ver nivelCielo). Único parámetro: el anclaje.

       Antes había también SB_CIELO_NEGRO (24,5) y la rampa era lineal en
       magnitudes sobre los CÓDIGOS 0-255. Ese era el bug: un código sRGB no es
       luminancia (vale ~L^(1/2,2)), así que repartir magnitudes sobre códigos
       deja el extremo oscuro muy por encima de su luminancia. Con sqm 22 y
       pupila de salida 7,5 mm (18" a 61x, dim=1) el fondo salía en el código 70
       —6,4 % de la luminancia del blanco: un gris franco— cuando 22 mag/arcsec²
       es de los mejores cielos de la Tierra. El desfase NO era un punto cero
       mal puesto: las dos curvas coinciden exactamente en SB_CIELO_BLANCO y se
       separan más cuanto más oscuro es el cielo (SBe 18: 207 vs 135; SBe 20:
       143 vs 60; SBe 22,3: 70 vs 15). Ver simulador_ocular/docs/adr/0009-fondo-cielo-luminancia.md.

       ponytail: SB_CIELO_BLANCO sigue siendo la perilla artística —depende de
       la luz ambiente de quien mire la pantalla—, pero ahora es un anclaje, no
       una forma: subirlo o bajarlo desplaza toda la curva sin deformarla. */
    SB_CIELO_BLANCO: 16.5,
    /* Suelo de detección del ojo (mag/arcsec²) aplicado SOLO al Fcielo con el
       que se pinta. valorDeFlujo divide por Fcielo, así que con un cielo
       irreal (SQM 30) el divisor tiende a cero y el contraste de cualquier
       objeto explota: la escena sale blanca. magLimite ya usa este mismo 27
       como suelo; el pintado no lo conocía. null = comportamiento histórico
       (para el A/B). No toca Cmin, ni H2c, ni magLimite. */
    SB_SUELO_PINTADO: 27,
    // Ganancia del lado OSCURO en la adaptación local (relativa a REALCE, el lado
    // brillante). 1 = simétrico → las siluetas oscuras recortan contra el fondo.
    REALCE_OSCURO: 1.0,
    /* Gamma PERCEPTUAL de las capas difusas calibradas. La curva reparte 11,5
       magnitudes linealmente sobre 0–255, así que un objeto 0,4 mag por encima
       del cielo recibe 9 niveles: 3,5 % de gris sobre negro, invisible en un
       monitor. Pero un ojo adaptado a la oscuridad detecta contrastes del 1–5 %,
       y ese 45 % de diferencia lo ve con claridad. O sea: el reparto lineal pinta
       el contraste FÍSICO, no el PERCIBIDO.

       Se aplica SOLO donde el flujo está calibrado de verdad (las capas
       sintéticas del Canvas-2D). Las placas del DSS y PanSTARRS no la llevan: su
       heurístico luma→brillo mapea un píxel brillante a μ=14, más brillante que
       cualquier objeto real, así que ya van sobradas de brillo y la gamma solo
       las empeoraría. Con 1 se recupera el reparto lineal exacto. */
    GAMMA_PERCEPTUAL: 0.45,
    /* Anchura y margen (en dex de flujo) del desvanecido por umbral de contraste
       en las capas calibradas. El desvanecido original, suave((F/Fumbral−1)/1,5),
       barre de 0 a 1 en un factor 2,5 de flujo: sobre un objeto extenso eso no
       atenúa, RECORTA. Donde la banda de polvo de una espiral de canto baja el
       flujo bajo el umbral, la zona se iba a negro puro y la banda salía como una
       cuña negra en vez de una línea. Aquí barre ~5 magnitudes y no deja borde.
       Las placas conservan el desvanecido original. */
    UMBRAL_MARGEN: 0.4, UMBRAL_ANCHURA: 1.4,
    /* PARCHE ESTÉTICO, y se llama así a propósito. Multiplica el flujo que la
       niebla sub-mlim de los cúmulos abiertos deposita en el campo difuso
       (nieblaCampo, ADR 0022) ANTES de que la cadena lo juzgue.

       Contradice de frente el ADR 0004 («no se introduce ningún parámetro cuyo
       único criterio de ajuste sea el aspecto de la imagen»). Se introduce a
       sabiendas: la niebla vive justo en la zona de umbral, sale a unos +24 DN
       sobre el fondo en el caso nominal (M11 nuclear, 200 mm/61×, sqm 21,5) y
       eso se percibe flojo. No hay medida detrás de 1,5: es un mando de gusto.

       OJO, no es solo brillo: el factor entra antes de visibilidadDifusa, así
       que también BAJA el umbral efectivo de detección. Sube el riesgo de que
       pinte niebla en cúmulos pobres donde nadie la reporta (el listón P3 del
       ADR 0022 ya sale marginal a sqm 22). No es un realce neutro.

       Ajustable en caliente desde la consola del navegador, sin recompilar:
         BitacoraGaiaRender.fot.NIEBLA_GANANCIA_ESTETICA = 2.0;   // más niebla
         BitacoraGaiaRender.fot.NIEBLA_GANANCIA_ESTETICA = 1.0;   // fotometría limpia
       y volver a renderizar. Con 1 la cadena es exactamente la de antes del
       parche y la conservación del ADR 0003 vuelve a ser exacta. */
    NIEBLA_GANANCIA_ESTETICA: 1.5,
    /* El recorte a cero de `pintarCumulo` (el campo no puede quitar luz) manda a
       negro el 50-70 % del campo cuando el grano se enciende y regala al cúmulo
       un 2-7 % de flujo que crece con el aumento (issue #98, medido en
       exp_sgrano con s_grano constante 0,25/0,50 a 61-250×). Se descuenta por
       ANILLO radial —la misma malla de `tablaCumulo`— reescalando lo pintado en
       cada anillo para que su flujo vuelva a ser el de sin grano (Im·sHalo).
       true en producción: hoy es inerte porque S2 real deja sGrano en 0 (ver
       test_grano_sbf.js G2), y solo actúa cuando algo enciende el grano. */
    RENORM_ANILLO_GRANO: true,
    /* Hook de arnés (issue #98): sustituye la P(ver) del grano sin tocar
       `sHalo`, que sigue leyendo `visibilidadDifusa` directo. null = ley real.
       La ley de umbral del grano no está decidida (ADR 0015); la conservación
       de flujo se comprueba forzando P(ver) = 1 con este hook, que entra por
       el mismo punto que producción, no por una copia (ADR 0008). */
    GRANO_FORZAR: null
  };
  FOT.H2C = FOT.H2C_DEFECTO; // H2c activa por defecto (validada en campo)

  /* Codificación sRGB (IEC 61966-2-1) de una luminancia relativa 0-1 al código
     0-255 que hay que escribir en el canvas. Se usa el tramo lineal de la norma
     y no el 1/2,2 a secas justo porque el problema vive en el extremo oscuro,
     que es donde las dos expresiones se separan. */
  function codigoSRGB(L) {
    if (!(L > 0)) return 0;
    if (L >= 1) return 255;
    return 255 * (L <= 0.0031308 ? 12.92 * L : 1.055 * Math.pow(L, 1 / 2.4) - 0.055);
  }

  /* Nivel de gris (0-255) del fondo de cielo. La luminancia de pantalla es
     proporcional al FLUJO del cielo —que es lo que mide una mag/arcsec²—, con
     SB_CIELO_BLANCO anclado al blanco, y se codifica en sRGB para escribirla en
     el canvas. Monótona y sin suelo duro: dos cielos distintos nunca colapsan
     en el mismo negro, solo se acercan. */
  function nivelCielo(SBe) {
    return codigoSRGB(Math.pow(10, -0.4 * (SBe - FOT.SB_CIELO_BLANCO)));
  }

  // Escalón suave (smoothstep) usado como desvanecido de visibilidad.
  function suave(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }

  /* ── Cadena fotométrica, compartida por TODOS los motores ──────────────────
     ctxFotometrico() concentra el cielo y la óptica: flujo del cielo, umbral de
     contraste Cmin y nivel de gris del fondo, atenuados por la pupila de salida
     (dim) y la transmisión del tubo (T).

     El fondo se pinta con la curva empinada nivelCielo() (puede ir a negro bajo
     cielos oscuros); el objeto se suma encima como INCREMENTO de contraste
     (Δmag = 2,5·log10(1 + Fobj·s / Fcielo)), que se conserva intacto. Como el
     objeto se pinta como nivelFondo + incremento, la atenuación oscurece fondo y
     objeto por igual: conserva el contraste y baja el suelo.

     AQUÍ vive el término de pupila (−2,5·log10(dim·T)). Ningún motor que produzca
     un Fobj debe volver a aplicarlo, o lo contaría dos veces. */
  /* `thetaIntArcmin` (opcional): diámetro intrínseco del objeto en MINUTOS DE
     ARCO —la isofota μ=25 circularizada, ver ps1ThetaIntArcmin—. Solo lo usa la
     ley H2c y solo con FOT.H2C activa; sin ella se ignora y la cadena es la de
     siempre. */
  /* θ_R de la ley H2c, en minutos de arco de CIELO: la escala en la que el
     término de Ricco de Cmin vale 1 y, por tanto, la escala de integración del
     sistema visual una vez dividida por los aumentos. Vive aparte de
     ctxFotometrico porque hay quien necesita la escala sin necesitar un Cmin —el
     grano del cúmulo, que la usa para decidir SOBRE QUÉ parche se juzga—, y
     duplicarla habría dejado dos copias de la misma constante. Sin FOT.H2C no
     hay ley de tamaño: devuelve 0 y quien la use cae en su propio suelo. */
  function thetaRiccoArcmin(SBe) {
    return FOT.H2C ? Math.pow(10, FOT.H2C.THETA_R_A + FOT.H2C.THETA_R_B * SBe) : 0;
  }

  function ctxFotometrico(o, thetaIntArcmin) {
    var pOjo = o.pupilaOjo || 7, pEf = Math.min(o.pupilaSalida, pOjo);
    // veloSB (fondo agregado de un campo denso) entra aquí y TODO lo derivado
    // (SBe, Cmin, nivel de fondo, suelo de pintado) lo hereda sin ley nueva.
    var sqm = sumaSB((o.sqm != null) ? o.sqm : 21, o.veloSB);
    var T = (o.transmision > 0) ? o.transmision : TRANSMISION_DEFECTO;
    var dim = Math.pow(pEf / pOjo, 2);
    var Fcielo = Math.pow(10, -0.4 * sqm);
    var Fref = Math.pow(10, -0.4 * 21);
    var Cmin = FOT.C_MIN * Math.pow(Fref / (Fcielo * dim), FOT.C_EXP);
    // SBe = brillo superficial del cielo TAL COMO LLEGA AL OJO (mag/arcsec²),
    // ya atenuado por la pupila de salida y por la transmisión del tubo. Es el
    // "negro perceptual" de la escena: lo que pinta el fondo y contra lo que se
    // mide el contraste del halo extrapolado (ver ps1Opacidad). Se expone para
    // no recalcularlo en ningún otro sitio.
    var SBe = sqm - 2.5 * Math.log10(dim) - 2.5 * Math.log10(T);
    // Un objeto mayor en la retina se detecta con menos contraste: los aumentos
    // fijan su tamaño aparente. Aquí es donde la apertura extra se nota en los
    // objetos extensos, ya que el brillo superficial no puede subir.
    if (FOT.H2C && thetaIntArcmin > 0 && o.aumentos > 0) {
      /* Ley H2c (ver FOT.H2C). El seeing entra en cuadratura —mismo patrón que
         radioImagenEstelar (Airy+seeing)— y pone el suelo de θeff: un objeto
         bajo el seeing no gana resolución, gana la del seeing. Sin PSF aquí:
         la detección no depende de ella (invariancia F). */
      var thEff = Math.sqrt(thetaIntArcmin * thetaIntArcmin
        + Math.pow(FOT.H2C.SEEING_AS / 60, 2));
      var thR = thetaRiccoArcmin(SBe);
      var raz = 1 + thR / (thEff * o.aumentos);
      Cmin *= raz * raz;
    } else if (o.aumentos > 0) {
      Cmin *= Math.max(FOT.C_MAG_MIN, Math.min(FOT.C_MAG_MAX,
        Math.pow(FOT.C_MAG_REF / o.aumentos, FOT.C_MAG_EXP)));
    }
    /* Fcielo del PINTADO: el mismo cielo, pero sin dejar que baje del suelo de
       detección del ojo (FOT.SB_SUELO_PINTADO). Fcielo va en unidades "antes de
       la pupila", así que el tope se pone sobre SBe y se devuelve a esas
       unidades dividiendo por dim*T. Con cielos reales SBe < 27 y esto es
       exactamente Fcielo. Solo lo consume la línea que escribe el píxel; el
       umbral (Cmin, visibilidadDifusa, sbUmbralContraste) sigue con Fcielo. */
    var FcieloPintado = Fcielo;
    if (FOT.SB_SUELO_PINTADO != null && SBe > FOT.SB_SUELO_PINTADO) {
      FcieloPintado = Math.pow(10, -0.4 * FOT.SB_SUELO_PINTADO) / (dim * T);
    }
    return {
      Fcielo: Fcielo, FcieloPintado: FcieloPintado, Fref: Fref, Cmin: Cmin, dim: dim, T: T,
      SBe: SBe, nivelFondo: nivelCielo(SBe),
      rango: FOT.SB_NEGRO - FOT.SB_BLANCO
    };
  }

  // Nivel de gris del fondo de cielo (0–255). Mismo cálculo que ctxFotometrico,
  // redondeado, para quien solo necesita rellenar el lienzo.
  function nivelFondo(o) { return Math.round(ctxFotometrico(o).nivelFondo); }

  /* Píxeles a los que dibujar un lienzo que se enseña a `anchoCss` píxeles CSS
     en una pantalla de densidad `dpr`: los que de verdad tiene el hueco. Con
     720 fijos, una pantalla Retina a pantalla completa ampliaba x2 y la imagen
     salía borrosa. Todo el render sale de ctx.canvas.width (la escala, el radio
     de desenfoque, el tamaño de las estrellas), así que subirlo no descoloca
     nada; lo que sube es el coste, con el CUADRADO del lado, y por eso el techo
     lo pone quien llama: el de Gaia es solo CPU (el catálogo ya está bajado) y
     el de las placas son bytes de un servidor ajeno. El suelo de 720 es el
     tamaño con el que se ajustó el render: por debajo no se baja. */
  var TAM_LIENZO_MIN = 720;
  function tamLienzo(anchoCss, dpr, tope) {
    var px = Math.round((anchoCss || 0) * (dpr > 0 ? dpr : 1));
    return Math.max(TAM_LIENZO_MIN, Math.min(tope || TAM_LIENZO_MIN, px));
  }

  /* Desenfoque gaussiano de un array de GRISES (0–255) usando el filtro nativo
     del canvas. Ojo: recorta a 0–255, así que no sirve para arrays de flujo. */
  function desenfocar(v, radio, SIZE) {
    var c = document.createElement('canvas'); c.width = c.height = SIZE;
    var ctx = c.getContext('2d'); var im = ctx.createImageData(SIZE, SIZE); var i, j;
    for (i = 0, j = 0; j < v.length; i += 4, j++) {
      var o = Math.max(0, Math.min(255, v[j]));
      im.data[i] = im.data[i + 1] = im.data[i + 2] = o; im.data[i + 3] = 255;
    }
    ctx.putImageData(im, 0, 0);
    var c2 = document.createElement('canvas'); c2.width = c2.height = SIZE;
    var ctx2 = c2.getContext('2d', { willReadFrequently: true });
    ctx2.filter = 'blur(' + radio + 'px)'; ctx2.drawImage(c, 0, 0);
    var dd = ctx2.getImageData(0, 0, SIZE, SIZE).data;
    var out = new Float32Array(v.length);
    for (i = 0, j = 0; j < v.length; i += 4, j++) out[j] = dd[i];
    return out;
  }

  /* Realce de un detalle respecto a su entorno, con RODILLA SUAVE.

     El umbral existe para no amplificar ruido de fondo. Aplicado como corte duro
     (`|dif| > umbral ? ganancia·(|dif|−umbral) : 0`) la función es continua pero
     su PENDIENTE salta de golpe en el umbral. Sobre un degradado suave —el halo
     de un cúmulo— |dif| cruza el umbral a varios radios, y cada cruce deja un
     borde: círculos concéntricos, muy visibles con pupila de salida pequeña,
     cuando el fondo es negro y el halo es lo único en pantalla.

     Con el factor suave() la transición es C1 y, en cuanto |dif| pasa del doble
     del umbral, coincide EXACTAMENTE con la fórmula anterior: solo cambia la
     banda de detalle débil, no el realce de lo que ya destacaba. */
  var REALCE = 0.5, UMBRAL_DETALLE = 12;
  function realceDetalle(dif, ganancia) {
    var abs = Math.abs(dif), sobre = abs - UMBRAL_DETALLE;
    if (sobre <= 0) return 0;
    return ganancia * Math.sign(dif) * sobre * suave(sobre / UMBRAL_DETALLE);
  }

  // Adaptación local del ojo: realza el detalle respecto al entorno desenfocado.
  function adaptacionLocal(v, SIZE) {
    var borroso = desenfocar(v, Math.round(SIZE / 60), SIZE);
    var out = new Float32Array(v.length);
    for (var j = 0; j < v.length; j++) {
      var dif = v[j] - borroso[j];
      out[j] = v[j] + realceDetalle(dif, dif >= 0 ? REALCE : REALCE * FOT.REALCE_OSCURO);
    }
    return out;
  }

  /* ══════════════════ CADENA DE LA PLACA (luma 8-bit → flujo) ══════════════════
     El otro motor que produce un Fobj para pintarFot: en vez de sintetizarlo de
     un catálogo, lo estima de la LUMA de una placa fotográfica (DSS o PanSTARRS).
     Vivía dentro de la clausura del simulador, sin test, aunque son tres reglas
     numéricas con parámetros a ojo que deciden lo que se ve.
     Nada de esto es fotometría calibrada: es un mapeo heurístico luma → brillo
     superficial. Lo que los tests fijan son sus INVARIANTES (monotonía, no
     inventar luz donde no hay), no los valores. */

  /* Fusión HDR de dos placas del mismo campo: una PROFUNDA (DSS2-red, que llega a
     objetos débiles pero quema los núcleos) y una CORTA (DSS1, que conserva los
     núcleos sin saturar). Ajusta por mínimos cuadrados la recta corta → profunda
     usando solo los píxeles de la zona lineal común (luma 120-215 en la profunda,
     con señal en la corta) y, donde la profunda empieza a saturar, cede el paso a
     la corta reescalada.
     Si no hay bastantes píxeles en común (n < 500) o el ajuste sale con pendiente
     no positiva, devuelve la profunda TAL CUAL: mejor una placa buena que una
     fusión con una recta inventada. */
  function fusionarPlacas(vd, vs) {
    var sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0, i;
    for (i = 0; i < vd.length; i++) {
      if (vd[i] >= 120 && vd[i] <= 215 && vs[i] > 8) {
        sx += vs[i]; sy += vd[i]; sxx += vs[i] * vs[i]; sxy += vs[i] * vd[i]; n++;
      }
    }
    if (n < 500) return vd;
    var a = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    var b = (sy - a * sx) / n;
    /* isFinite además de > 0: si los 500 píxeles comunes tienen la MISMA luma en
       la corta (una placa plana, o un error del servidor servido como imagen),
       el denominador es 0 y la pendiente sale ±Infinity, que pasa el `> 0`. Con
       ella b sale −Infinity y la fusión pinta NaN en toda la placa. Sin recta
       fiable se devuelve la profunda tal cual, que es lo que dice el rótulo. */
    if (!(a > 0) || !isFinite(a) || !isFinite(b)) return vd;
    var out = new Float32Array(vd.length);
    for (i = 0; i < vd.length; i++) {
      var t = suave((vd[i] - 210) / 40);
      out[i] = (1 - t) * vd[i] + t * Math.max(vd[i], a * vs[i] + b);
    }
    return out;
  }

  /* Regla del núcleo hundido: en los mosaicos de PanSTARRS el centro de una
     estrella brillante llega a veces vacío (el pixel saturado se marca como sin
     dato), y queda un agujero negro rodeado de halo. Si el ENTORNO está claro y el
     píxel está muy por debajo de él, se rellena con algo más que el entorno —era
     el punto más brillante, no el más oscuro—.
     PURA y probada aparte del desenfoque: la regla es el umbral, no el kernel.
     MODIFICA v y lo devuelve (el array es de PROC² floats; copiarlo no aporta). */
  function rellenarNucleo(v, entorno) {
    for (var i = 0; i < v.length; i++) {
      if (entorno[i] > 140 && v[i] < 0.5 * entorno[i]) {
        v[i] = Math.min(300, entorno[i] * 1.25);
      }
    }
    return v;
  }
  function repararNucleos(v, SIZE) { return rellenarNucleo(v, desenfocar(v, 4, SIZE)); }

  /* Flujo de objeto a partir de la luma de la placa. La luma 0-255 se lee como un
     brillo superficial entre SB_OBJ_MIN (píxel apagado) y SB_OBJ_MAX (píxel
     saturado), y de ahí a flujo con la definición de magnitud.
     Un píxel a 0 se queda a flujo 0: donde la placa no registró nada no se
     inventa luz, que es lo que separa el fondo de cielo del objeto.
     Las placas de PanSTARRS (HiPS) llegan con más rango y otra respuesta, así que
     antes pasan por una gamma y se recortan a 512. */
  function flujoDePlaca(v, esHips) {
    var Fobj = new Float32Array(v.length);
    for (var i = 0; i < v.length; i++) {
      var vi = v[i];
      if (vi > 0) {
        if (esHips) { vi = 255 * Math.pow(Math.min(vi, 512) / 255, FOT.GAMMA_HIPS); }
        var sb = FOT.SB_OBJ_MIN - (vi / 255) * (FOT.SB_OBJ_MIN - FOT.SB_OBJ_MAX);
        Fobj[i] = Math.pow(10, -0.4 * sb);
      }
    }
    return Fobj;
  }

  /* Pinta un contexto a partir de un array de FLUJO DE OBJETO por píxel (Fobj, en
     las mismas unidades que Fcielo). Cadena de contraste + adaptación local,
     compartida por todos los motores que sepan producir un Fobj: el de placas del
     simulador y las capas difusas sintéticas del Canvas-2D.
     El lienzo debe venir ya dimensionado (cuadrado). */
  /* Curva de tono y su inversa. El incremento sobre el fondo de cielo en niveles
     de pantalla es Δ = 255·2,5·log10(1 + F/Fcielo)/rango; flujoDeValor la
     invierte. Que sean inversas exactas es lo que permite meter las estrellas en
     la cadena sin mover de sitio nada que no estuviera ya saturado. */
  function valorDeFlujo(F, Fcielo, rango) {
    return 255 * 2.5 * Math.log10(1 + F / Fcielo) / rango;
  }
  function flujoDeValor(v, Fcielo, rango) {
    return Fcielo * (Math.pow(10, v * rango / (255 * 2.5)) - 1);
  }

  /* Desvanecido de un objeto extenso al acercarse al umbral de contraste del ojo.
     En las capas calibradas barre suavemente en escala logarítmica; en las placas
     conserva el desvanecido original, más abrupto, para no moverlas. */
  function visibilidadDifusa(F, Fumbral, perceptual) {
    if (!perceptual) return suave((F / Fumbral - 1) / 1.5);
    if (!(F > 0)) return 0;
    return suave((Math.log10(F / Fumbral) + FOT.UMBRAL_MARGEN) / FOT.UMBRAL_ANCHURA);
  }

  /* Mismo cálculo que `visibilidadDifusa`, salvo que un arnés puede forzar su
     salida vía `FOT.GRANO_FORZAR` (ver comentario junto al hook) sin tocar
     `sHalo`, que sigue llamando a la función de base directamente. */
  function visibilidadGrano(sgAten, Fumbral, perceptual) {
    if (typeof FOT.GRANO_FORZAR === 'function') return FOT.GRANO_FORZAR(sgAten, Fumbral, perceptual);
    return visibilidadDifusa(sgAten, Fumbral, perceptual);
  }

  /* Brillo superficial (mag/arcsec²) al que un objeto extenso llega al UMBRAL de
     detección del ojo: el flujo Fcielo·Cmin que ya calcula ctxFotometrico. Cmin
     lleva las dos vías por las que la apertura influye en una fuente extensa —la
     luminancia que llega al ojo, vía pupila de salida, y el tamaño aparente, vía
     aumentos— y ninguna de las dos toca el brillo superficial del objeto, que es
     invariante con D. Es el umbral que usa TODA capa difusa (ver
     visibilidadDifusa en pintarFot); aquí se expresa en magnitudes. */
  function sbUmbralContraste(c) { return -2.5 * Math.log10(c.Fcielo * c.Cmin); }

  /* Máscara difusa (`cielo.difusoMask`, Float32Array, centinela -1):

       mask[i] <  0  → flujo no evaluado por ningún modelo difuso propio
       mask[i] >= 0  → ya evaluado; el valor ES la t de realzarPerceptual

     Un solo array para todas las capas difusas con desvanecido propio, y el
     valor lleva información en vez de un simple sí/no: PS1 escribe 0 (gamma
     completa, exactamente lo que hacía con el flag) y el cúmulo escribe su
     s_halo. La convención vive aquí y no copiada a mano en cada harness. */
  function difusoMarcado(mask, i) {
    return !!(mask && mask[i] >= 0);
  }

  /* La máscara vive en el objeto `cielo` porque es el mismo que luego recibe
     pintarFot, y dura lo que el render: cada capa que llega marca sobre la
     misma. Se rellena con el centinela solo al crearla; reutilizarla sin
     limpiar es lo que se hacía y lo que se sigue haciendo. */
  function difusoMaskDe(cielo, n) {
    if (!(cielo.difusoMask && cielo.difusoMask.length === n)) {
      cielo.difusoMask = new Float32Array(n).fill(-1);
    }
    return cielo.difusoMask;
  }

  /* Realce perceptual de un flujo difuso: expande su nivel en pantalla con
     FOT.GAMMA_PERCEPTUAL y lo devuelve a flujo, para que la suma con la capa de
     estrellas siga siendo aditiva y los núcleos sigan comprimiendo. Devuelve el
     flujo tal cual si la gamma es 1. Ver FOT.GAMMA_PERCEPTUAL para el porqué.

     `techo` (opcional, factor máximo) lo usan las capas que traen IMAGEN REAL.
     El realce se calibró contra perfiles sintéticos, que apenas tienen luz por
     debajo de μ23; una imagen de PanSTARRS la tiene en todas partes y ahí el
     boost llega a ×13, con lo que el brazo externo sale casi tan brillante como
     el disco interior. Sin `techo`, la cadena es la de siempre: las placas, los
     globulares y el caso de NGC 891 no se mueven. */
  function realzarPerceptual(F, Fcielo, rango, s, techo) {
    if (FOT.GAMMA_PERCEPTUAL === 1 || !(F > 0)) return F;
    // s = visibilidadDifusa ya calculada en pintarFot (0 = justo en el umbral,
    // 1 = ya totalmente visible). Sin ella (llamadas antiguas), boost completo
    // como siempre. Con ella, el boost decae hacia gamma=1 (sin boost) según
    // crece s: rescata lo que roza el umbral, no infla lo que ya se ve bien
    // -un núcleo de cúmulo globular resuelto no debe quemarse a blanco-.
    var t = (s == null) ? 0 : Math.max(0, Math.min(1, s));
    var gammaEfectiva = 1 + (FOT.GAMMA_PERCEPTUAL - 1) * (1 - t);
    var nivel = valorDeFlujo(F, Fcielo, rango);
    var realzado = flujoDeValor(255 * Math.pow(nivel / 255, gammaEfectiva), Fcielo, rango);
    return (techo > 0 && realzado > F * techo) ? F * techo : realzado;
  }

  /* `thetaDifusaArcmin` (opcional): escala de la capa difusa SIN máscara propia
     que haya en Fobj —hoy solo la niebla del ADR 0022—, para que su umbral se
     juzgue con la ley H2c y no con la C_MAG heredada (ADR 0023). Sin ella,
     ctxFotometrico no ve tamaño y H2c no puede entrar: ese era el bug H1, y por
     eso el argumento es explícito y no un campo de `o` que se pueda quedar
     rancio entre renders. Las capas que SÍ marcan difusoMask (cúmulo, PS1) no
     pasan por aquí: traen su desvanecido hecho con su propia θ. */
  function pintarFot(Fobj, ctx, o, estrellas, thetaDifusaArcmin) {
    var SIZE = ctx.canvas.width, n = Fobj.length;
    var c = ctxFotometrico(o, thetaDifusaArcmin);
    var canales = estrellas ? 3 : 1;
    var perceptual = !!o.perceptual && FOT.GAMMA_PERCEPTUAL !== 1;
    var salida = [new Float32Array(n), null, null];
    if (canales === 3) { salida[1] = new Float32Array(n); salida[2] = new Float32Array(n); }
    for (var i = 0; i < n; i++) {
      // El desvanecido por umbral de contraste es para objetos EXTENSOS. A una
      // fuente puntual no se le aplica: su visibilidad la fija la magnitud
      // límite, que dibujar() ya ha aplicado.
      /* Píxel que ya trae su desvanecido hecho por un modelo difuso propio
         (o.difusoMask, ver difusoMarcado). En la galaxia de PS1 ese desvanecido
         es la rampa de ps1Opacidad, que mide contra ESTE MISMO umbral
         (Fcielo·Cmin). Las dos funciones son la misma ley con otra forma —las
         dos dependen solo de log10(F/Fumbral)—, así que pasarlo otra vez por
         visibilidadDifusa es contar dos veces el mismo umbral, y entre las dos
         lo dejaban en 0 DN sobre el cielo en cualquier pupila. Aquí manda el
         modelo: sin s, y con el realce a la t que ese modelo haya escrito (0 en
         PS1 = gamma completa; s_halo en el cúmulo, para que el realce decaiga
         donde el velo ya se ve bien). Si otra capa difusa cae en el mismo
         píxel, su luz entra en este trato; son unos pocos píxeles y ninguno
         decide nada. */
      var t = o.difusoMask ? o.difusoMask[i] : -1;
      var marcado = (t >= 0);
      var s = marcado ? 1 : visibilidadDifusa(Fobj[i], c.Fcielo * c.Cmin, perceptual);
      var difuso = Fobj[i] * s;
      /* Realce perceptual del difuso: se expande su nivel en pantalla y se
         devuelve a flujo, para que la suma con las estrellas siga siendo aditiva
         y los núcleos sigan comprimiendo en vez de recortarse. Solo cuando el
         motor declara que su flujo está calibrado (o.perceptual): las placas
         entran por aquí con su heurístico y no deben tocarse. */
      /* El techo se queda puesto también en la galaxia —sigue habiendo imagen
         bajo la misma máscara, y sin él el brazo externo se iguala con el
         disco—; lo que cambia es la gamma, que la fija la t del modelo. */
      if (perceptual && difuso > 0) {
        difuso = realzarPerceptual(difuso, c.Fcielo, c.rango, marcado ? t : s, o.realceMax);
      }
      for (var ch = 0; ch < canales; ch++) {
        var F = difuso;
        if (estrellas) {
          var v = estrellas[i * 3 + ch];
          /* BUG (contaminación lumínica): v ya es un valor de pantalla (el
             alpha-ramp de dibujar(), calibrado contra mlim, no contra el
             cielo de ESTA escena). Si aquí se invierte con c.Fcielo -el de la
             escena actual- y dos líneas más abajo se vuelve a pasar por
             valorDeFlujo con ese MISMO c.Fcielo, las dos conversiones son
             funciones exactamente inversas y se cancelan: v llega intacto
             pase lo que pase con la contaminación, así que su contraste
             sobre nivelFondo nunca decrece y una estrella se ve IGUAL de
             marcada da igual lo mal que esté el cielo -y como nivelFondo sí
             sube con la contaminación, ese contraste fijo se vuelve más
             visible sobre un fondo claro que sobre uno negro: parece que
             "aparecen" estrellas nuevas al empeorar el cielo.
             Arreglo: invertir v contra un cielo de REFERENCIA fijo (Fref,
             sqm=21, el mismo que ya usa Cmin más arriba) en vez del de la
             escena. Así v dejar de ser un número de pantalla y pasa a ser un
             flujo real comparable a Fcielo; el valorDeFlujo de más abajo, con
             el Fcielo de la escena, SÍ comprime el contraste cuando el cielo
             actual es más brillante que la referencia -y lo expande cuando es
             más oscuro-, en vez de cancelarse siempre. */
          if (v > 0) F += flujoDeValor(v, c.Fref, c.rango);
        }
        salida[ch][i] = c.nivelFondo + valorDeFlujo(F, c.FcieloPintado, c.rango);
      }
    }
    var im = ctx.createImageData(SIZE, SIZE), k, j;
    if (canales === 1) {
      var final = adaptacionLocal(salida[0], SIZE);
      for (k = 0, j = 0; j < n; k += 4, j++) {
        var g = Math.max(0, Math.min(255, final[j]));
        im.data[k] = im.data[k + 1] = im.data[k + 2] = g; im.data[k + 3] = 255;
      }
    } else {
      /* La adaptación local se calcula sobre la LUMINANCIA y su corrección se
         aplica igual a los tres canales: así realza el detalle sin desviar el
         color de las estrellas, y con un solo desenfoque en vez de tres. */
      var lum = new Float32Array(n);
      for (j = 0; j < n; j++) lum[j] = (salida[0][j] + salida[1][j] + salida[2][j]) / 3;
      var adaptada = adaptacionLocal(lum, SIZE);
      for (k = 0, j = 0; j < n; k += 4, j++) {
        var delta = adaptada[j] - lum[j];
        im.data[k] = Math.max(0, Math.min(255, salida[0][j] + delta));
        im.data[k + 1] = Math.max(0, Math.min(255, salida[1][j] + delta));
        im.data[k + 2] = Math.max(0, Math.min(255, salida[2][j] + delta));
        im.data[k + 3] = 255;
      }
    }
    ctx.putImageData(im, 0, 0); return true;
  }

  /* ── Fondo agregado de campos densos (ADR 0014 fase 2) ──
     En un campo denso el proxy trunca a las 40 000 más brillantes y manda en la
     clave `fondo` los momentos de la banda truncada, agregados por el TAP
     ({corte, n, flujo, m2, rad}; flujo en unidades de una estrella G=0, rad =
     radio del círculo agregado en grados). Esa luz es físicamente relevante
     (en M7, SB ~21 mag/arcsec², más brillante que un cielo oscuro) y NO debe
     desaparecer por el límite computacional: entra como VELO uniforme, es
     decir, como cielo extra (`veloSB` en el objeto cielo). Aproximaciones
     asumidas: uniforme sobre el campo (velo estadístico, sin estructura) y
     G ≈ V frente a la escala del sqm. */

  // SB media del velo (mag/arcsec²) a partir del fondo del proxy, o null.
  function veloSB(fondo) {
    if (!fondo || !(fondo.flujo > 0) || !(fondo.rad > 0)) return null;
    return -2.5 * Math.log10(fondo.flujo / (Math.PI * Math.pow(fondo.rad * 3600, 2)));
  }

  // Suma fotométrica de dos brillos superficiales: los FLUJOS se suman.
  function sumaSB(sb, velo) {
    if (velo == null) return sb;
    return -2.5 * Math.log10(Math.pow(10, -0.4 * sb) + Math.pow(10, -0.4 * velo));
  }

  /* ── Magnitud límite (método del umbral, Torres Lapasió) ── */
  function magLimite(o) {
    var D = o.apertura, MAG = o.aumentos;
    var t = (o.transmision > 0) ? o.transmision : TRANSMISION_DEFECTO;
    if (!(D > 0) || !(MAG > 0)) return null;
    // El velo de un campo denso es cielo extra: empeora el límite igual que
    // cualquier fondo más brillante (ver Fondo agregado más arriba).
    var sqm = sumaSB((o.sqm != null) ? o.sqm : 21, o.veloSB);
    var SB0T = sqm + 5 * Math.log10(7.5 * MAG / (D * Math.sqrt(t)));
    /* Suelo = SB0 (el ocular no oscurece el fondo por debajo del de ojo
       desnudo) y techo = 27 (suelo de detección del ojo). Con sqm > 27 los dos
       se contradicen y gana el TECHO: un cielo que el ojo ya no distingue del
       negro no puede seguir mejorando nada. El orden importa —`max(sqm, min(27,
       …))` deja que el max deshaga el min— y con él SB0T se salía del dominio
       del ajuste de Torres Lapasió: la parábola de la Ec. 6 tiene el vértice en
       30,4, así que con sqm 40 el límite caía a 14,5, por debajo del de un
       cielo de sqm 21. Ver test_difuso.js §9b. */
    SB0T = Math.min(27, Math.max(sqm, SB0T));
    // Apertura efectiva: si la pupila de salida (d_ep = D/MAG) supera la del ojo,
    // el ojo recorta el haz y se desperdicia apertura → D_eff = D·min(1, d_eye/d_ep).
    // Solo en la captación de luz (D²); el término de cielo SB0T conserva su propio
    // clamp (min(1,dim)) en el render, sin doble recorte.
    var dEye = o.pupilaOjo || 7;
    var Deff = D * Math.min(1, dEye / (D / MAG));
    return -22.81 + 1.792 * SB0T - 0.02949 * SB0T * SB0T + 2.5 * Math.log10(Deff * Deff * t);
  }

  /* ── Ajustes del render (idénticos a GAIA_CFG del simulador) ── */
  var CFG = {
    /* Halo del sprite: dCore = 1/(1+blur) fija cuánto del radio es núcleo duro
       frente a borde difuso. Antes era un valor único para toda estrella, así
       que hasta la más tenue del límite salía con el mismo borde suave que
       Sirio. Ahora depende del brillo ABSOLUTO (reusa alfaAureola, que ya está
       calibrada por flujo + apertura, no por mlim: el halo es un fenómeno físico
       del fotón, no de lo que ese equipo concreto es capaz de detectar).
       blur = el tope (estrellas brillantes); blurMin = el suelo (al límite). */
    blur: 1.1, blurMin: 0.15,
    // Ver fraccionFlujo(): potencia que levanta la fracción de flujo compartida
    // por blur y saturación de color para brillos medios (cúmulos típicos),
    // sin tocar los extremos ni la calibración de aureolaAlfaMax/AlfaK.
    fraccionGamma: 0.35,
    // Margen (mag) por debajo del límite de detección al que aparece el color.
    // Ver color: antes era CFG.magColor fijo, así que un 24" no mostraba color
    // más allá de lo que mostraba un 4" con el mismo cielo. El umbral de color SÍ
    // depende del equipo -como la propia detección-, así que ahora se mide desde
    // `mlim` (que ya integra apertura, aumentos, transmisión y cielo) en vez de
    // ser una magnitud absoluta.
    margenColorMag: 4.5, tinteNucleo: 0.8,
    // Núcleo de estrella de carbono: tinteNucleo normal (0.8) mezcla 80% color +
    // 20% blanco, y a magnificaciones altas Rtot es tan chico que ese núcleo
    // ocupa casi todo el disco -"corazón blanco" reportado (2026-08-01, V Aql,
    // 475x)-. Para estas SÍ importa que el color domine el centro: casi sin
    // blanqueo.
    tinteNucleoCarbono: 0.95,
    carbono: { bprpOffset: 0.9, bprpMin: 3.0 },
    /* Suelo de visibilidad del tamaño de estrella, en píxeles de lienzo (antes de
       la escala del campo aparente y del halo del blur). Las más brillantes
       crecen por encima de este mínimo -convención de atlas, así se ve la
       imagen a través del ocular-, pero el crecimiento NO reabre el bug de los
       pares apretados: ese recorte lo sigue haciendo el `sep` más abajo, que
       gana siempre que hay doble de por medio, se dibuje del tamaño base que
       se dibuje. Ver simulador_ocular/notas-separacion-dobles-dibujo.md.
       El crecimiento es proporcional al FLUJO ABSOLUTO de la estrella
       (factorApertura·10^-0,4g, misma fórmula que alfaAureola/blurEstrella),
       no a lo lejos que está de mlim: probado con "delta relativo a mlim" y
       descartado -con un mlim bajo (equipo de poco aumento) casi TODO el campo
       queda a pocas magnitudes de su propio límite y "engorda" en bloque, no
       solo las pocas estrellas realmente brillantes de un cúmulo. Con flujo
       absoluto, una mag 12 se queda puntual da igual el mlim del equipo -solo
       crecen las que de verdad son brillantes-, y un aperture mayor SÍ muestra
       más gorda la MISMA estrella (más fotones recogidos), que es lo que se
       quería conservar. */
    radioSuelo: 2.0,
    /* Cuánto engorda una estrella por su brillo. Es convención de atlas, no
       física: el disco real (Airy+seeing) es el mismo para todas las del campo,
       y el tope lo alcanza cualquier estrella a simple vista, así que de ahí
       hacia arriba TODAS se dibujan iguales. 40/8,0 dejaba a las brillantes en
       3,8× el radio de una del límite —bolas, no estrellas—; con 24/6,0 el
       extremo brillante adelgaza un 25 % y la escala baja a 2,9×, mientras las
       débiles (que viven en radioSuelo) se quedan donde estaban. El techo lo
       fija la sección 11 de scripts/test_estrella_fisica.js. */
    radioSueloMag: 24,      // escala del término extra sobre el flujo relativo, elevado a radioSueloExp
    radioSueloExp: 0.5,
    radioSueloMax: 6.0,    // tope de seguridad; en la práctica solo lo tocan objetos extremos (Venus, la Luna...)
    brillo: 1.0,
    /* ponytail: suelo de opacidad por estrella, SIN conciencia de densidad. En
       un campo disperso evita que la más débil se apague del todo; en un campo
       MUY rico (miles de estrellas al límite, tipo NGC 2158) el 'lighter'
       aditivo las suma y el suelo × recuento puede superar a un cúmulo cercano
       con pocas estrellas brillantes. Mantenlo bajo (probado hasta 0.02–0.05);
       si un campo extremo lo sigue rompiendo, la mejora real es ponderar este
       suelo por densidad local (o quitarlo y fiar la visibilidad solo al
       tamaño, que ya tiene su propio suelo en radioSuelo). */
    alfaMin: 0.05,
    /* A/B del alpha del disco (ver alfaEstrella): false = rampa histórica
       anclada a mlim; true = flujo absoluto por la cadena fotométrica común. */
    alfaPorFlujo: false,
    // Rango de magnitudes (por debajo del límite) que recorre el alpha de 0 a 1.
    // FIJO, no escala con apertura: la detectabilidad es contraste relativo a mlim
    // (Weber-Fechner), y mlim ya integra la apertura. Probado y confirmado: 12 da
    // aspecto más realista que valores más bajos (ver feedback_verify... memoria:
    // ensanchar esto para saturar antes a las estrellas brillantes de un campo
    // concreto "engorda" TODO el campo -la mayoría de estrellas tenues también
    // se acercan más rápido a alfaMin/saturación-, no es la corrección correcta.
    //
    // DERIVADO, no un número suelto: era 12 a ojo, y `flujoDeValor()` lee ese
    // mismo intervalo 0-1 como FOT.SB_NEGRO-SB_BLANCO = 11,5 mag. Con 12 la
    // rampa mete 12 magnitudes donde la conversión de vuelta espera 11,5, así
    // que cada magnitud real se pintaba como 0,958: el salto de brillo entre
    // dos estrellas salía comprimido un 4 % por magnitud (mag 8 vs mag 10 daba
    // 5,84x en vez de 6,31x). La aureola, que usa 10^(-0,4g) directo sin rampa,
    // sí daba 6,31x -disco y aureola de la MISMA estrella en escalas distintas.
    // Igualadas, el render es lineal en flujo por construcción y el salto entre
    // dos magnitudes no depende del equipo (el mlim se cancela al restar).
    // Son la misma cantidad física: cuántas magnitudes caben en los 0-255 de la
    // pantalla. Si se toca SB_NEGRO/SB_BLANCO, esto acompaña solo.
    rangoBrillo: FOT.SB_NEGRO - FOT.SB_BLANCO,
    /* Rama C (ADR 0019). Cuántas magnitudes por debajo de mlim pintan BLANCO en
       el disco de una estrella. Nace valiendo `rangoBrillo` -producción no se
       mueve ni un bit-, pero es un número DISTINTO y por eso tiene nombre
       propio: `rangoBrillo` es el rango de la CADENA (lo que `flujoDeValor`
       espera al releer la capa en pintarFot), y esto es la PENDIENTE DEL
       PINTADO.
       Separarlos es lo único que mueve el nivel en pantalla de una estrella.
       Con la lectura emparejada a la pendiente las dos conversiones son
       inversas exactas y la pendiente se cancela: el nivel final no cambia
       (medido, test_alfa_magblanco.js T2). Como pintarFot lee con `c.rango`
       FIJO, el flujo codificado queda Fref·(10^(0,4·Δmag·rango/magBlanco) − 1)
       y el nivel sobre el fondo va ~como 255·Δmag/magBlanco: bajar esto aclara
       TODO el campo de estrellas.
       El precio, medido: (a) el disco deja de estar en la misma escala de flujo
       que la aureola (que usa 10^(-0,4g) directo), y (b) por debajo del margen
       (mlim − g) de la estrella más brillante, esa estrella satura a 1 y deja
       de responder a la apertura -ahí falla el guardián test_alfa_apertura.js-.
       El valor es una calibración contra notas de observación, no una
       constante física: `node scripts/harness_alfa_estrellas.js <objeto> ... --blanco`
       imprime el barrido. 9,5 es el elegido tras ese A/B contra las notas de
       NGC 1245 / NGC 1664 / NGC 2266; queda justo por encima del margen
       (mlim − g) de la más brillante con el 18", que es donde empieza a quemar
       el pico y a perderse el orden de brillos del cúmulo. */
    magBlanco: 9.5,
    /* El glow de las estrellas por debajo de la magnitud límite es lo que da
       textura al halo de un globular, así que va calibrado en las mismas unidades
       aparentes: ~1,4 px de radio en pantalla. Su intensidad en g=mlim ANCLA a
       alfaMin (ver dibujar()): no lleva constante propia porque si las dos
       ramas (resuelta/no resuelta) no coinciden exactamente en el cruce, una
       estrella salta de alfaMin a un valor mayor justo al cruzar mlim -viendo
       más contaminación, más estrellas cruzan ese límite hacia abajo y se ven
       "aparecer" más brillantes en vez de apagarse. */
    glowRadio: 5.0,
    /* Corte de invisibilidad del glow: por debajo de este alpha no se dibuja.
       0,004 daba ~2,74 mag de cola y se comía casi todo el catálogo Gaia de
       ENTONCES (tope fijo 17,0 para cualquier apertura): un 8" y un 20"
       acababan viendo el mismo número de estrellas. 0,02 la recortó a ~1 mag.
       Desde entonces el tope de catálogo subió a 20,0 y magConsultaGaia() ya
       escala con la apertura real (18" pide 18,3; 6" pide 15,9) -hay margen de
       sobra bajo el tope incluso con cola más larga-, así que el recorte a 1
       mag ya no hace falta para separar aperturas: solo dejaba pobre el
       granulado de campos densos (cúmulos globulares), con muy pocas
       estrellas por debajo de mlim visibles como textura. 0,006 amplía la cola
       a ~2,3 mag (18" queda en 19,6, sigue bajo el tope de 20 con margen).
       ponytail: valor artístico, ajustar si un campo real sigue viéndose
       pobre o si una apertura extrema roza el tope de 20. Ver
       magConsultaGaia(), misma constante decide cuánto pedir a Gaia. */
    glowCorte: 0.006,
    /* Campo aparente (grados) al que corresponde radioSuelo tal cual: con un ocular
       de este campo el suelo sale a su tamaño nominal, y con uno más estrecho sale
       proporcionalmente mayor en el lienzo. Ver escalaEstrellas() para el por qué.
       Es la perilla del tamaño de estrella a aumentos normales, donde manda el
       suelo; con 60 las estrellas de un globular salen a ~1,8 px de radio en
       pantalla. Subirla las engorda a todas por igual. */
    escalaMagAfov: 60,
    /* Radio del primer anillo oscuro del disco de Airy: 1,22·λ/D en segundos de
       arco, con λ = 550 nm (el verde al que el ojo adaptado es más sensible), ya
       convertido para recibir la apertura en mm. */
    airyArcsec: 138.4,
    /* Seeing en segundos de arco (FWHM). Perilla del sitio y de la noche: 2″ es un
       cielo decente, 1″ excepcional, 4-5″ una noche mala. Con apertura grande es
       esto —y no la óptica— lo que fija el tamaño de la estrella. */
    seeingArcsec: 2.0,
    /* Tope del suelo SOLO para las dos componentes de una doble catalogada (ver
       radioEstrella): a poco aumento el suelo manda igual que en cualquier otro
       campo, pero según sube el aumento y el hueco en pantalla crece, el suelo se
       recorta a esta fracción de ese hueco para no comérselo entero. Es la parte
       de radioSuelo que SÍ decrece con el aumento -el resto (cúmulos, campo
       suelto) se queda exactamente igual que antes, porque no traen `sep`-. Ver
       simulador_ocular/notas-separacion-dobles-dibujo.md. */
    margenSuelo: 0.33,
    radioSueloMin: 0.5,   // px: ni recortado por margenSuelo desaparece del todo
    /* Aureola de dispersión (glare) alrededor de estrellas resueltas muy
       brillantes: dispersión óptica + difusión intraocular, no el anillo de
       difracción (ese queda fuera, ver notas-separacion-dobles-dibujo.md).
       Proporcional al flujo absoluto de la estrella (no al límite del
       equipo, a diferencia del glow de las no resueltas): mismo aspecto en
       cualquier telescopio para la misma estrella. Sin corte duro de
       magnitud -se apaga sola, 10^(-0,4·mag)-, con un techo de intensidad
       para que nunca parezca un disco sólido. aureolaAlfaK/Max son perillas
       nuevas sin más anclaje que "Sirio/Vega asoman aureola visible pero
       translúcida, Albireo A ya casi no". */
    aureolaRadio: 14.0,
    aureolaAlfaK: 2.0,
    aureolaAlfaMax: 0.35,
    // Apertura (mm) a la que está calibrado aureolaAlfaK: la aureola representa luz
    // dispersada, proporcional a lo que recoge el objetivo (∝ D²), así que se escala
    // por (apertura/aureolaAperturaRef)². Sin dato de apertura, factor 1 (sin cambio).
    aureolaAperturaRef: 200,
    /* Truco HDR de capaEstrellas: segunda pasada del lienzo entero para
       rescatar núcleos saturados (ver TONO más abajo). Cuesta un render
       completo + getImageData extra, así que por defecto va OFF -una sola
       pasada-; actívalo solo si hace falta rescatar núcleos recortados. */
    hdrRescate: false,
    /* longRef son los px de brazo de una estrella justo en magMax, y la ley que
       lo estira es L ∝ √flujo = 10^(0,2·(magMax − g)) -ver dibujarSpikes-, no
       la rampa lineal en magnitud de antes (longMag, retirada): la envolvente
       del sinc² del brazo cae como 1/u², así que la espiga llega hasta donde esa
       cola supera el umbral y multiplicar el flujo por 10 la alarga √10, no 10.
       6 es la perilla del conjunto: toda la curva a la vez, conservando la ley
       (8,5 clavaba una mag 5 en los 85 px de la rampa anterior, pero en pantalla
       salían demasiado largas). De ahí arriba la potencia hace lo que la rampa
       no hacía: separar de verdad a las dos o tres brillantes del campo. longMax
       320 solo muerde por debajo de mag 1,5 -Vega, Sirio, Arturo-, que es donde
       el brazo ya cruzaría el lienzo.
       Lo fijan las secciones 3 y 4 de scripts/test_dobles_spikes.js. */
    spikes: {
      magMax: 10, rango: 5, brazos: 4, angulo: 0,
      longRef: 6, longMax: 320, grosor: 3, lobulos: 2, intensidad: 0.8
    }
  };


  /* Cuánto por debajo de mlim sigue habiendo glow visible (mag), derivado del
     MISMO par de constantes que decide el corte en dibujar(): así la consulta
     y el render siempre están de acuerdo en qué profundidad hace falta. */
  function colaGlowMag() {
    return -2.5 * Math.log10(CFG.glowCorte / CFG.alfaMin);
  }

  /* Profundidad de consulta a Gaia para un equipo dado: el mlim que ese equipo
     alcanza bajo el cielo más oscuro que admite la UI, más la cola de glow, más
     un margen de seguridad. El sqm sigue fijado al extremo oscuro para cubrir
     todo el rango del slider sin re-consultar.

     El AUMENTO, en cambio, entra de verdad. Antes se pasaba `1e6` (el techo del
     tubo, donde Deff y SB0T ya saturan) con la idea de no re-consultar al mover
     el slider; el precio era pedir la profundidad de 400x cuando se está a 66x.
     Y como campo ancho implica pocos aumentos, esa profundidad de más caía
     justo sobre el radio más grande: en M7 (rad 0,89°, hacia el bulbo) la
     consulta pedía Gmag<=19,6 -2,76 millones de estrellas que el TAP tiene que
     ORDENAR- para devolver, tras el TOP, exactamente las mismas 40000 filas
     hasta G=15,18 que devuelve pidiendo Gmag<=15,5. 28 s contra 4,7 s por el
     mismo dato, y con los DOS proveedores agotando su timeout ("Query timed
     out" en GAVO) el proxy devolvía 502.

     Re-consultar al cambiar de ocular no cuesta: más aumento es campo más
     pequeño, o sea radio menor, o sea consulta más barata aunque sea más
     profunda. `aumentos` ausente conserva el comportamiento del techo. */
  function magConsultaGaia(apertura, transmision, aumentos) {
    var mag = (aumentos > 0) ? aumentos : 1e6;
    var techo = magLimite({ apertura: apertura, aumentos: mag, transmision: transmision, sqm: GAIA_SQM_MAS_OSCURO });
    if (techo == null) return GAIA_MAG_DEFECTO;
    return Math.max(GAIA_MAG_MIN, Math.min(GAIA_MAG_TOPE, techo + colaGlowMag() + 0.3));
  }

  /* ── Niebla sub-mlim de un campo ordinario (ADR 0022) ──
     Tercer caso del invariante de conservación: en un globular la población
     sub-m_res entra como <I>(r)=Σ·S1campo (ADR 0012) y en un campo denso la
     banda truncada entra como veloSB (ADR 0014), pero en el campo ordinario
     las estrellas catalogadas con g > mlim + colaGlow se descartaban enteras
     (dibujar(): aGlow < glowCorte) y su flujo no iba a ningún sitio. Aquí esa
     banda perdida se acumula en el campo difuso repartiendo cada estrella con un
     núcleo tienda a la escala de Ricco en cielo (θ_R/aumentos, la escala de
     integración del ojo: por debajo de ella el ojo no resuelve estructura, así
     que suavizar ahí no borra nada real), y pintarFot la juzga con el Cmin de
     siempre. Nada de rejilla de celdas: una rejilla pinta cuadrados de borde
     duro y fase arbitraria, y ese escalón SÍ es estructura visible. Cortes
     disjuntos por construcción: (mlim, mlim+cola] es del glow, (magConsulta,∞)
     del veloSB. Los cúmulos globulares NO pasan por aquí (su sub-umbral ya lo
     conserva S1campo; sumar el catálogo encima sería doble conteo).
     Prerregistro y medida: harness_niebla_abiertos.js — la mancha es real en
     M11/NGC 7789 (exceso local sobre el campo) y nula en Pléyades/NGC 1664.
     Devuelve el flujo total enrutado SIN el parche estético (unidades de
     estrella G=0): el contador sigue siendo fotometría real, y lo que se
     desvía de ella es solo lo pintado. Ver FOT.NIEBLA_GANANCIA_ESTETICA. */
  /* Escala a la que la niebla se suaviza Y se juzga: θ_R(SBe) proyectada al
     cielo (ADR 0023). Es la misma regla que ya usa el grano SBF en
     pintarCumulo —el término de Riccò vale 1 justo ahí—, y aquí además es la
     escala del propio núcleo tienda: por debajo de ella la capa no tiene
     estructura que juzgar. Vive aparte para que la use quien suaviza
     (nieblaCampo) y quien decide el umbral (pintarFot) sin dos copias, y para
     que el harness la importe en vez de reimplementarla (ADR 0008). */
  function thetaNieblaArcmin(cielo) {
    if (!(cielo && cielo.aumentos > 0)) return 0;
    return thetaRiccoArcmin(ctxFotometrico(cielo).SBe) / cielo.aumentos;
  }

  /* Ganancia del parche estético de la niebla (FOT.NIEBLA_GANANCIA_ESTETICA).
     Se lee en cada render, no se cachea, para que valga cambiarla por consola. */
  function gananciaNiebla() {
    var k = FOT.NIEBLA_GANANCIA_ESTETICA;
    return (k > 0) ? k : 1;
  }

  function nieblaCampo(difuso, estrellas, o) {
    if (!FOT.H2C) return 0;                 // la vía C_MAG no tiene ley de tamaño
    var thSkyArcmin = thetaNieblaArcmin(o.cielo);
    if (!(thSkyArcmin > 0)) return 0;
    var SIZE = o.size;
    var escv = SIZE / (o.arcmin / 60);      // px por grado
    var hPx = Math.max(1, (thSkyArcmin / 60) * escv);   // semiancho del núcleo
    var corte = o.mlim + colaGlowMag();     // por debajo ya lo pinta el glow
    var cos0 = Math.cos(o.dec0 * Math.PI / 180);
    var asPorPx = (o.arcmin * 60) / SIZE;
    var areaPxAs2 = asPorPx * asPorPx;
    var wx = new Float64Array(2 * Math.ceil(hPx) + 1), wy = new Float64Array(wx.length);
    var total = 0;
    /* Momento de segundo orden de la niebla, para su ESCALA DE JUICIO (R50,
       ADR 0023 v2). Se acumula en la misma pasada: Σf, Σfx, Σfy y Σf(x²+y²),
       que dan ⟨r²⟩ sin necesitar el centroide de antemano ni una segunda
       vuelta. Es la escala a la que se juzga, NO a la que se suaviza: el
       núcleo tienda sigue siendo θ_R/M (por debajo de ahí no hay estructura),
       y esto solo decide con qué Cmin se mira lo ya suavizado. */
    var mx = 0, my = 0, mr2 = 0;
    for (var i = 0; i < estrellas.length; i++) {
      var g = estrellas[i][2];
      if (!(g > corte)) continue;
      var x = SIZE / 2 - (((estrellas[i][0] - o.ra0 + 540) % 360) - 180) * cos0 * escv;
      var y = SIZE / 2 - (estrellas[i][1] - o.dec0) * escv;
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) continue;
      var f = Math.pow(10, -0.4 * g);
      total += f;                           // el total devuelto es el flujo REAL
      mx += f * x; my += f * y; mr2 += f * (x * x + y * y);
      f *= gananciaNiebla();                // ...y lo pintado lleva el parche
      /* Reparto en tienda separable de semiancho hPx: los pesos se normalizan
         a 1 en cada eje, así que el flujo se conserva EXACTO incluso cuando el
         núcleo se sale del lienzo (lo que sobresale se reparte hacia dentro en
         vez de perderse). */
      var x0 = Math.max(0, Math.ceil(x - hPx)), x1 = Math.min(SIZE - 1, Math.floor(x + hPx));
      var y0 = Math.max(0, Math.ceil(y - hPx)), y1 = Math.min(SIZE - 1, Math.floor(y + hPx));
      var sx = 0, sy = 0, px, py;
      for (px = x0; px <= x1; px++) { var w = 1 - Math.abs(px + 0.5 - x) / hPx; if (w < 0) w = 0; wx[px - x0] = w; sx += w; }
      for (py = y0; py <= y1; py++) { var v = 1 - Math.abs(py + 0.5 - y) / hPx; if (v < 0) v = 0; wy[py - y0] = v; sy += v; }
      if (!(sx > 0) || !(sy > 0)) { difuso[Math.floor(y) * SIZE + Math.floor(x)] += f / areaPxAs2; continue; }
      var k = f / (sx * sy * areaPxAs2);
      for (py = y0; py <= y1; py++) {
        var fila = py * SIZE, ky = wy[py - y0] * k;
        if (ky <= 0) continue;
        for (px = x0; px <= x1; px++) difuso[fila + px] += wx[px - x0] * ky;
      }
    }
    o.thetaJuicioArcmin = thetaJuicioNiebla(thSkyArcmin, total, mx, my, mr2, asPorPx);
    return total;
  }

  /* Escala a la que se JUZGA la niebla (ADR 0023 v2): max(θ_R/M, R50), con R50
     estimado del momento de segundo orden del flujo, no de un percentil
     ordenado —mismo resultado en O(n) y sin guardar la lista—. El 0,832 es
     exacto para una gaussiana 2D (R50 = σ√(2·ln2), ⟨r²⟩ = 2σ²) y es una
     HIPÓTESIS DE FORMA declarada: un perfil más picudo tiene un R50 real menor
     que este estimado. El max mantiene el suelo del v1: nunca se juzga a una
     escala menor que aquella a la que se suavizó. */
  function thetaJuicioNiebla(thSkyArcmin, total, mx, my, mr2, asPorPx) {
    if (!(total > 0)) return thSkyArcmin;
    var cx = mx / total, cy = my / total;
    var r2 = mr2 / total - (cx * cx + cy * cy);   // px²
    if (!(r2 > 0)) return thSkyArcmin;
    var r50 = 0.832 * Math.sqrt(r2) * asPorPx / 60;   // px → arcsec → arcmin
    return Math.max(thSkyArcmin, r50);
  }

  /* ── Consulta a Gaia DR3 vía proxy (cache por coord+radio+profundidad) ── */
  var cacheGaia = {};
  function radioConsulta(arcmin) {
    return Math.min(GAIA_RADIO_MAX, Math.max(GAIA_RADIO_MIN, (arcmin / 60) * 0.72));
  }
  function fetchGaiaUnaVez(ra, dec, rad, mag) {
    var ctrl = new AbortController();
    var id = setTimeout(function () { ctrl.abort(); }, GAIA_FETCH_TIMEOUT);
    var url = PROXY_URL + '?ra=' + encodeURIComponent(ra) + '&dec=' + encodeURIComponent(dec) +
              '&rad=' + encodeURIComponent(rad) + '&mag=' + encodeURIComponent(mag);
    return fetch(url, { signal: ctrl.signal }).then(function (r) {
      clearTimeout(id);
      if (!r.ok) throw new Error();
      return r.json();
    }, function (err) { clearTimeout(id); throw err; });
  }
  // Un reintento: el proxy hace failover entre proveedores TAP (ver
  // gaia_proxy.php), así un fallo puntual del primero suele resolverse solo
  // en el segundo intento, sin que el usuario tenga que volver a pedirlo.
  function fetchGaia(ra, dec, rad, mag) {
    return fetchGaiaUnaVez(ra, dec, rad, mag).catch(function () {
      return fetchGaiaUnaVez(ra, dec, rad, mag);
    });
  }
  /* Profundidad a la que se consulta Gaia para UNA vista. Estaba copiada en
     cuatro sitios (vistaGaia, renderPlaca, el precalentado del simulador y el
     del formulario) y la copia es justo lo que no puede divergir: un
     precalentado solo acierta en el caché si pide EXACTAMENTE lo que pedirá la
     vista, y pedir de más encarece el ORDER BY del TAP para esas coordenadas el
     resto de la sesión (scripts/test_precalentado_gaia.js).

     `paraCapa`: solo la vista de Gaia pinta la capa de galaxias, y su máscara
     quiere todas las estrellas que PanSTARRS registra. El realce sobre una
     placa no pinta capa y no paga esa profundidad. */
  function profundidadConsulta(apertura, transmision, aumentos, paraCapa) {
    var mag = magConsultaGaia(apertura, transmision, aumentos);
    if (!paraCapa) return mag;
    var P = window.BitacoraPS1;
    if (!P) throw new Error('profundidadConsulta(paraCapa) necesita BitacoraPS1; carga bitacora-ps1.js');
    return P.ps1MagConsulta(mag);
  }

  /* Precalentado: dispara la MISMA consulta que hará render(), antes de que se
     pida el render (al apuntar al botón de generar). La consulta a Gaia es lo
     más lento de la cadena —una vuelta al TAP, segundos en frío— y no depende
     de nada que el observador decida después en el modal: la profundidad sale
     de la apertura y los aumentos, que ya están elegidos.

     No cuesta nada de más: consultar() cachea por coordenada, radio y
     profundidad (superconjunto monotónico), así que si luego se genera la
     imagen se reutiliza la promesa ya en vuelo, y si no se genera se queda una
     entrada en la caché. Un fallo aquí borra su entrada y lo reintenta render().

     UNA salvedad, y no es gratis: se precalienta a la profundidad de la vista
     de Gaia, que es la fuente por defecto del modal, porque al apuntar al botón
     la fuente todavía no está elegida. Si el observador cambia a DSS, el realce
     de esa vista solo necesitaba la profundidad sin capa, y lo pedido de más se
     queda fundido en el caché encareciendo el ORDER BY del TAP para esas
     coordenadas el resto de la sesión. Se acepta a sabiendas: adivinar la
     fuente no se puede, y la de por defecto es la que casi siempre se genera. */
  function precalentar(o) {
    if (!window.BitacoraPS1 || !o || o.ra == null || o.dec == null || !(o.apertura > 0)) return;
    var t = (o.transmision > 0) ? o.transmision : (transmisionOptica(o.optica) || TRANSMISION_DEFECTO);
    consultar(o.ra, o.dec, o.arcmin, profundidadConsulta(o.apertura, t, o.aumentos, true))
      .catch(function () {});
  }

  function consultar(ra0, dec0, arcmin, mag) {
    var rad = radioConsulta(arcmin || GAIA_ARCMIN_DEFECTO);
    var prof = (mag > 0) ? mag : GAIA_MAG_DEFECTO;
    var clave = ra0.toFixed(3) + ',' + dec0.toFixed(3);
    var ent = cacheGaia[clave];
    // Reutiliza el caché solo si YA cubre el radio Y la profundidad pedidos:
    // sin el segundo chequeo, cambiar a un equipo más grande sobre el mismo
    // objeto se quedaba con el catálogo más somero que trajo el equipo chico.
    if (ent && ent.rad >= rad - 1e-6 && ent.mag >= prof - 1e-6) return ent.promise;
    // Superconjunto monotónico (ADR 0014): funde con lo ya cacheado ANTES de
    // fetchear, para que una escritura tardía (precalentado somero llegando
    // después de la vista honda) nunca pise profundidad ya conseguida.
    if (ent) {
      rad = Math.max(rad, ent.rad);
      prof = Math.max(prof, ent.mag);
    }
    var nueva = {
      rad: rad,
      mag: prof,
      promise: fetchGaia(ra0.toFixed(5), dec0.toFixed(5), rad.toFixed(5), prof.toFixed(2)).then(function (jj) {
        var arr = (jj.data || []).filter(function (f) { return f[2] != null; });
        // Campo denso: el proxy manda los momentos de la banda truncada
        // (ADR 0014). Cuelgan del array para que viajen con las estrellas
        // sin cambiar la firma de nadie.
        arr.fondo = jj.fondo || null;
        return arr;
      })
    };
    cacheGaia[clave] = nueva;
    nueva.promise.catch(function () { if (cacheGaia[clave] === nueva) delete cacheGaia[clave]; });
    return nueva.promise;
  }

  /* ── Placas del DSS: URL del proxy ──────────────────────────────────────────
     Fuente única de la petición a dss-proxy.php, compartida por el simulador y
     por el formulario de registro. El proxy valida las coordenadas con
     /^[0-9+\-.: ]{1,24}$/, así que aquí NO caben ni "h" ni "°": los grados se
     escriben en sexagesimal llano. Una coordenada que ya viene en texto (el
     catálogo del simulador) pasa tal cual. */
  var DSS_PROXY_URL   = '/wp-content/uploads/bitacora/dss-proxy.php';
  var DSS_MAX_ARCMIN  = 120;   // el servidor del DSS no sirve más de 2°
  var DSS_MIN_ARCMIN  = 1;

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function gradosAHms(deg) {
    var h = (((deg % 360) + 360) % 360) / 15, hh = Math.floor(h), m = (h - hh) * 60, mm = Math.floor(m), ss = Math.round((m - mm) * 60);
    if (ss === 60) { ss = 0; mm++; } if (mm === 60) { mm = 0; hh = (hh + 1) % 24; }
    return pad2(hh) + ' ' + pad2(mm) + ' ' + pad2(ss);
  }
  function gradosADms(deg) {
    var sign = deg < 0 ? '-' : '+', a = Math.abs(deg), dd = Math.floor(a), m = (a - dd) * 60, mm = Math.floor(m), ss = Math.round((m - mm) * 60);
    if (ss === 60) { ss = 0; mm++; } if (mm === 60) { mm = 0; dd++; }
    return sign + pad2(dd) + ' ' + pad2(mm) + ' ' + pad2(ss);
  }
  function acotarPlaca(arcmin) {
    return Math.min(DSS_MAX_ARCMIN, Math.max(DSS_MIN_ARCMIN, arcmin || DSS_MIN_ARCMIN));
  }
  function urlPlaca(o) {
    var ra  = (typeof o.ra === 'number')  ? gradosAHms(o.ra)  : String(o.ra);
    var dec = (typeof o.dec === 'number') ? gradosADms(o.dec) : String(o.dec);
    var lado = acotarPlaca(o.arcmin).toFixed(1);
    return (o.base || DSS_PROXY_URL) +
      '?ra=' + encodeURIComponent(ra) + '&dec=' + encodeURIComponent(dec) +
      '&equinox=J2000&name=' +
      '&x=' + lado + '&y=' + lado +
      '&Sky-Survey=' + encodeURIComponent(o.survey || 'DSS2-red') +
      '&fuente=' + encodeURIComponent(o.fuente || 'skyview') +
      '&mime-type=download-gif';
  }

  /* Carga una placa; resuelve a null si el servidor no responde (para poder
     decidir el respaldo en vez de dejar el lienzo negro). */
  function cargarPlaca(url) {
    return new Promise(function (res) {
      var im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = function () { res(im); };
      im.onerror = function () { res(null); };
      im.src = url;
    });
  }
  // Luma (0-255) por píxel de una placa ya cargada; null si el navegador
  // bloquea la lectura (CORS).
  function lumasDePlaca(imagen, SIZE) {
    var c = document.createElement('canvas'); c.width = c.height = SIZE;
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(imagen, 0, 0, SIZE, SIZE);
    var dd;
    try { dd = ctx.getImageData(0, 0, SIZE, SIZE).data; } catch (e) { return null; }
    var v = new Float32Array(SIZE * SIZE);
    for (var i = 0, j = 0; j < v.length; i += 4, j++) v[j] = (dd[i] + dd[i + 1] + dd[i + 2]) / 3;
    return v;
  }

  // Ganancia global del dibujo actual (ver capaEstrellas).
  var ganActual = 1;

  /* ── Sprites (glow, brazo de difracción) ──
     El núcleo de la estrella YA NO usa un sprite cacheado: el halo (blur)
     depende del brillo de cada estrella (ver blurEstrella), así que se dibuja
     con un gradiente propio por estrella en dibujarEstrellaColor (blanca o de
     color, mismo camino). */
  var GLOW_SPRITE = null, SPIKE_SPRITE = null, SPIKE_TINT = {};
  function spriteGlow() {
    if (GLOW_SPRITE) return GLOW_SPRITE;
    var S = 32, m = S / 2;
    var c = document.createElement('canvas'); c.width = c.height = S;
    var g = c.getContext('2d'), gr = g.createRadialGradient(m, m, 0, m, m, m);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.3)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    return (GLOW_SPRITE = c);
  }
  function spriteSpike() {
    if (SPIKE_SPRITE) return SPIKE_SPRITE;
    var W = 256, H = 32, m = H / 2;
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var ctx = c.getContext('2d'), im = ctx.createImageData(W, H);
    var kL = Math.max(1, CFG.spikes.lobulos) * Math.PI;
    for (var x = 0; x < W; x++) {
      var u = x / (W - 1), arg = kL * u;
      var s = arg < 1e-6 ? 1 : Math.sin(arg) / arg;
      var along = s * s * (1 - u);
      var g0 = Math.min(1, u / 0.12); along *= g0 * g0 * (3 - 2 * g0);
      for (var y = 0; y < H; y++) {
        /* y+0,5 es el CENTRO de la fila: sin ese medio píxel el eje del brazo
           cae en la frontera entre filas y no en mitad del sprite, así que el
           perfil transversal queda descentrado (centro de masa en 16,5 de 32) y
           los cuatro brazos salen desviados en el mismo sentido de giro: la
           cruz en molinete. Lo mide scripts/test_simetria_estrella.js. */
        var t = (y + 0.5 - m) / m, a = along * Math.exp(-(t * t) * 10), idx = (y * W + x) * 4;
        im.data[idx] = im.data[idx + 1] = im.data[idx + 2] = 255;
        im.data[idx + 3] = Math.round(255 * Math.max(0, Math.min(1, a)));
      }
    }
    ctx.putImageData(im, 0, 0);
    return (SPIKE_SPRITE = c);
  }
  /* Un sprite por color redondeado a entero, y el color de una estrella es
     continuo: una sesión larga (zoom, pan, cambios de equipo) va dejando un
     lienzo de 256x32 por tono nuevo y no suelta ninguno. Se topa como la caché
     del grano —vaciar entera al llegar al tope, que es O(1); el patrón real
     (pocas estrellas con spikes por campo) reconstruye enseguida lo que hace
     falta—. */
  var SPIKE_TINT_TOPE = 512;
  function spriteSpikeColor(rgb) {
    if (!rgb) return spriteSpike();
    var r = Math.round(rgb[0]), gc = Math.round(rgb[1]), b = Math.round(rgb[2]), key = r + ',' + gc + ',' + b;
    if (SPIKE_TINT[key]) return SPIKE_TINT[key];
    if (Object.keys(SPIKE_TINT).length >= SPIKE_TINT_TOPE) { SPIKE_TINT = {}; }
    var base = spriteSpike();
    var c = document.createElement('canvas'); c.width = base.width; c.height = base.height;
    var g = c.getContext('2d');
    g.drawImage(base, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = 'rgb(' + r + ',' + gc + ',' + b + ')';
    g.fillRect(0, 0, c.width, c.height);
    return (SPIKE_TINT[key] = c);
  }
  function dibujarSpikes(ctx, x, y, g, escala, rgb) {
    var cf = CFG.spikes, sobre = cf.magMax - g;
    if (sobre <= 0) return;
    /* L ∝ √flujo. El brazo difracta como una rendija (Babinet) y la envolvente
       del sinc² cae como 1/u², así que la espiga se ve hasta donde esa cola
       supera el umbral: ×10 de flujo alarga ×√10, no ×10. 10^(0,2·sobre) es
       justo √(10^(0,4·sobre)) = la raíz del flujo relativo a magMax.
       Como el radio: el tope, sobre la longitud nominal; la escala, después. */
    var L = Math.min(cf.longMax, cf.longRef * Math.pow(10, 0.2 * sobre)) * escala;
    if (L < 3) return;
    var alpha = Math.min(1, cf.intensidad * (sobre / cf.rango));
    var sp = spriteSpikeColor(rgb), H = cf.grosor, paso = 2 * Math.PI / cf.brazos;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(cf.angulo * Math.PI / 180);
    ctx.globalAlpha = alpha * ganActual;
    for (var k = 0; k < cf.brazos; k++) { ctx.drawImage(sp, 0, -H / 2, L, H); ctx.rotate(paso); }
    ctx.restore();
  }

  /* ── Tamaño y color de cada estrella ──

     El tamaño con que se dibuja una estrella es un tamaño APARENTE: lo que el ojo
     ve en el ocular. Y el tamaño aparente NO depende de cuánto cielo entra en el
     campo, solo del aumento y del brillo de la estrella. Dos oculares de la misma
     focal (mismo aumento) tienen que dibujarla igual: el de campo más ancho
     enseña MÁS CIELO alrededor, no estrellas más gordas.

     Quien consume esto (el simulador y el generador del registro) dibuja el
     lienzo y luego lo muestra a un diámetro proporcional al campo aparente del
     ocular —un ocular de 100° ocupa más ventana que uno de 50°—. Por eso, para
     que el tamaño en PANTALLA no dependa del campo aparente, el radio en píxeles
     del lienzo tiene que ir con 1/afov: lo que la ventana estira, la escala lo
     encoge, y queda solo el aumento.

     Antes esta escala se calculaba con el campo REAL en arcmin
     (`sqrt(90/arcmin)`, acotada a 2×), que es justo la variable equivocada: con
     el mismo aumento, un Ethos de 100° y un AstroPhysics de ~46° dan campos
     reales distintos, así que la misma estrella salía casi el doble de grande en
     pantalla con el Ethos. Y como el par de una doble sí caía a la separación
     correcta, el par se fundía en una mancha con un ocular y se separaba con el
     otro: la separación parecía depender del campo aparente.

     Ojo: la ventana del simulador deja de crecer a partir de AFOV_REF (110°), así
     que por encima de ese campo aparente la compensación ya no es exacta. Es un
     límite de la página, no de esta ley. */
  /* El segundo factor es la RESOLUCIÓN del lienzo: los tamaños "artísticos"
     (suelo de visibilidad, glow, aureola, spikes) están en píxeles calibrados
     al lienzo de TAM_LIENZO_MIN, pero el lienzo se enseña siempre al mismo
     diámetro en pantalla, así que a pantalla completa (1200/1440 px) esos
     píxeles valen menos ángulo. Sin este factor las estrellas salían más
     pequeñas Y más apagadas —el término físico de radioEstrella sí va en
     píxeles de lienzo, así que factorDilucion hundía el alfa de pico—.

     Solo AMPLÍA: tamLienzo nunca baja de TAM_LIENZO_MIN, así que por debajo de
     esa cifra no hay caso real que compensar —y encogerlo cambiaría el dibujo
     de los lienzos pequeños que usan los tests y los sprites—. */
  function escalaLienzo(size) { return (size > 0) ? Math.max(1, size / TAM_LIENZO_MIN) : 1; }
  function escalaEstrellas(afov, size) {
    var a = (afov > 0) ? afov : CFG.escalaMagAfov;
    return CFG.escalaMagAfov / a * escalaLienzo(size);
  }

  /* null / '' → null, y NO 0: el catálogo deja en null lo que no sabe, y `+null`
     es 0, que como magnitud sería una estrella falsa deslumbrante. */
  function numONulo(v) {
    if (v == null || v === '') return null;
    var n = +v;
    return isFinite(n) ? n : null;
  }
  /* ── ¿La orientación de esta doble es una suposición? (issue #133) ───────────
     El catálogo de estrellas que Gaia DR3 no trae declara en cada fila su
     `origen`: 'medida' (astrometría propia de Hipparcos), 'derivada'
     (compañera colocada a un ángulo medido, WDS o Hipparcos) o 'asumida'
     (compañera colocada al ángulo por defecto de 55°, porque nadie publica
     el suyo). Sólo ese último escalón se le confiesa al observador: si el
     aviso saliera también con un ángulo medido, dejaría de significar algo.

     El vínculo entre la fila y la doble es POSICIONAL, con el mismo ancla de
     40″ del generador (gen_hipparcos.py, RADIO_ANCLA_ARCSEC): cubre el
     desajuste de época entre el catálogo de dobles —J2000, con AR redondeada
     a segundos enteros de tiempo— y estas filas, ya propagadas a 2016.0.

     Pero la fila 'asumida' es la COMPAÑERA, no la primaria, así que cae a la
     separación del par de la posición del catálogo, y el ángulo al que cae es
     justo lo que no se sabe. La zona buscada es por eso un ANILLO de radio
     `sep` y no un disco de radio `sep`: con el disco, un par de 3705″ —los
     hay— barría un grado entero de cielo y cualquier fila asumida ajena caía
     dentro. El centro se acepta también, por si el catálogo diera la posición
     de la compañera en vez de la de la primaria. */
  var RADIO_ASUMIDA = 40;   // ″ el mismo ancla que usa el generador
  function orientacionAsumida(o) {
    var filas = (typeof window !== 'undefined') && window.BITACORA_ESTRELLAS_BRILLANTES;
    if (!o || !filas || !filas.length) return false;
    var ra0 = numONulo(o.ra), dec0 = numONulo(o.dec);
    if (ra0 == null || dec0 == null) return false;
    var sep = numONulo(o.sep) || 0;
    var cos0 = Math.cos(dec0 * Math.PI / 180);
    for (var i = 0; i < filas.length; i++) {
      var f = filas[i];
      if (f[5] !== 'asumida') continue;
      var dra = (((f[0] - ra0 + 540) % 360) - 180) * cos0, ddec = f[1] - dec0;
      var d = Math.sqrt(dra * dra + ddec * ddec) * 3600;         // ″
      if (d <= RADIO_ASUMIDA || Math.abs(d - sep) <= RADIO_ASUMIDA) return true;
    }
    return false;
  }

  /* ── La imagen estelar de VERDAD: disco de Airy + seeing ─────────────────────
     Una estrella es una fuente puntual: lo que se ve en el ocular es su patrón de
     difracción. El radio del primer anillo oscuro (criterio de Rayleigh) es
     1,22·λ/D, que a 550 nm son 138″/D(mm) — para un 114 mm, 1,21″; su límite de
     Dawes (116/D = 1,02″) es un 19 % más apretado, como debe ser.

     De ahí salen las dos cosas que el modelo anterior no tenía:
       · va como 1/D  → más apertura, estrellas más apretadas al mismo aumento;
       · es un ángulo de CIELO fijo → el aumento lo agranda, así que las estrellas
         ENGORDAN con el aumento. Es la sensación del ocular, y es real.

     El seeing entra en cuadratura porque son dos borrones independientes. Con
     apertura grande es el que manda: es lo que impide que un 400 mm dé estrellas
     cuatro veces más finas que un 100 mm. */
  function radioAiry(aperturaMm) {
    var D = (aperturaMm > 0) ? aperturaMm : 0;
    if (!D) return null;
    return CFG.airyArcsec / D;
  }
  function radioImagenEstelar(aperturaMm) {
    var rAiry = radioAiry(aperturaMm);
    if (rAiry == null) return null;
    var rSeeing = (CFG.seeingArcsec > 0 ? CFG.seeingArcsec : 0) / 2;   // FWHM → radio
    return Math.sqrt(rAiry * rAiry + rSeeing * rSeeing);
  }

  /* Radio con el que se DIBUJA una estrella, en píxeles del lienzo.

     Dos términos, sumados en cuadratura porque cada uno manda en un régimen:

       · el FÍSICO, la imagen estelar de arriba llevada a píxeles con la escala de
         placa del campo. Es el que crece con el aumento y se aprieta con la
         apertura;
       · el SUELO DE VISIBILIDAD, el tamaño aparente por magnitud de siempre. Existe
         porque la ventana tiene ~500 px para 72-100° de campo aparente: a aumentos
         normales la imagen estelar real cae MUY por debajo del píxel (una mag 13 de
         M13 a 133× son 0,23 px) y sin suelo el globular desaparece.

     Por eso a poco aumento el dibujo lo gobierna el suelo —y no cambia nada de lo
     ya calibrado— y a mucho aumento lo gobierna la física, que es justo donde el
     observador nota que las estrellas engordan y que enfocar cuesta más.

     La cuadratura, y no un max(), para que el paso de un régimen a otro sea suave:
     un salto en el tamaño al cambiar de ocular se vería como un parpadeo. */
  function sueloEstrella(o) {
    var blur = (o.blur != null) ? o.blur : CFG.blur;
    var D = (o.apertura > 0) ? o.apertura : CFG.aureolaAperturaRef;
    var factorApertura = Math.pow(D / CFG.aureolaAperturaRef, 2);
    var flujoRel = (o.g != null) ? factorApertura * Math.pow(10, -0.4 * o.g) : 0;
    var sueloBase = Math.min(CFG.radioSueloMax, CFG.radioSuelo + CFG.radioSueloMag * Math.pow(flujoRel, CFG.radioSueloExp));
    var suelo = sueloBase * (1 + blur) * escalaEstrellas(o.afov, o.size);
    var sep = +o.sep, arcmin = +o.arcmin, size = +o.size;
    if (sep > 0 && arcmin > 0 && size > 0) {
      var sepPx = sep * size / (arcmin * 60);                           // ″ → px de lienzo
      suelo = Math.min(suelo, Math.max(CFG.radioSueloMin * escalaLienzo(size), sepPx * CFG.margenSuelo));
    }
    return suelo;
  }
  function radioEstrella(o) {
    var suelo = sueloEstrella(o);
    var arcmin = +o.arcmin, size = +o.size;
    var theta = radioImagenEstelar(o.apertura);
    if (theta == null || !(arcmin > 0) || !(size > 0)) return suelo;   // sin equipo, como antes
    var fisico = theta * size / (arcmin * 60);                        // ″ → px de lienzo
    return Math.sqrt(suelo * suelo + fisico * fisico);
  }
  /* Sobre-aumentar más allá de lo que el disco de Airy+seeing justifica no
     trae más luz real: la misma cantidad de fotones se reparte en un disco
     mayor. Diluimos el alpha de pico por (suelo/Rtot)² -conserva el flujo
     total exacto para este perfil de gradiente autosimilar- en cuanto el
     término físico supera al suelo artístico (Rtot > suelo·√2 equivale a
     fisico > suelo, por la cuadratura suelo²+fisico²=Rtot²). */
  function factorDilucion(suelo, Rtot) {
    return (Rtot > suelo * Math.SQRT2) ? (suelo * suelo) / (Rtot * Rtot) : 1;
  }
  /* Alpha del DISCO de una estrella resuelta. radioArcsec es el radio DIBUJADO
     (Rtot) en segundos de arco; dilucion, el factor de reparto de radioEstrella.

     Rama A (por defecto): rampa lineal en el margen de detección (mlim - g).
     Es un margen, no un brillo: la misma estrella cambia de alpha cuando cambia
     el cielo, y el blanco puro cae en g = mlim - 11,5, una magnitud que no
     existe en un cúmulo abierto. De ahí el campo "apagado" que solo se anima
     falseando el SQM (que en realidad añade estrellas, no brillo).

     Rama B (CFG.alfaPorFlujo): INCORRECTA, banco de comparación, no candidata
     -ver ADR 0018 y scripts/test_alfa_apertura.js-. Es puro contraste, y el
     contraste estrella/cielo no depende de la apertura a igualdad de aumentos:
     pinta un 18" más apagado que un 8". Además reparte el flujo sobre el disco
     DIBUJADO, cuyo tamaño ya lleva (D/Dref)² por sueloEstrella, así que cancela
     el D² una segunda vez. La ganancia del tubo grande es de umbral (mlim), que
     es justo lo que esta rama deja de mirar.

     La misma cadena que todo lo demás. El flujo de
     la estrella repartido en el disco que se dibuja, medido contra el cielo de
     REFERENCIA (Fref, sqm 21) -el mismo con el que pintarFot vuelve a leer esta
     capa: flujoDeValor(v, c.Fref, c.rango)-. Lo que se pinta y lo que se lee
     pasan a ser la misma magnitud, y el alpha deja de depender del cielo de la
     escena. La dilución NO se aplica aparte: el área del disco ya la lleva.

     ponytail: el sprite tiene perfil radial, no es un disco plano, así que esto
     es el techo de brillo, no el flujo integrado exacto; si hiciera falta
     conservar flujo al píxel, el factor perfil/plano entra aquí. */
  function alfaEstrella(g, mlim, radioArcsec, dilucion) {
    var d = (dilucion > 0) ? dilucion : 1;
    if (!CFG.alfaPorFlujo) {
      return Math.min(1, Math.max(CFG.alfaMin, CFG.brillo * Math.min(1, (mlim - g) / CFG.magBlanco))) * d;
    }
    var area = Math.PI * radioArcsec * radioArcsec;
    if (!(area > 0)) return CFG.alfaMin;
    var Fref = Math.pow(10, -0.4 * 21);
    var a = CFG.brillo * valorDeFlujo(Math.pow(10, -0.4 * g) / area, Fref, CFG.rangoBrillo) / 255;
    return Math.min(1, Math.max(CFG.alfaMin, a));
  }
  /* Opacidad de la aureola de dispersión (glare) de una estrella RESUELTA,
     proporcional a su flujo absoluto (mag Gaia g), no al margen sobre el
     límite del equipo -a diferencia del glow de las no resueltas-. Sin
     corte duro: se apaga sola con la magnitud, con techo en aureolaAlfaMax.
     Ver CFG.aureolaRadio/AlfaK/AlfaMax y notas-separacion-dobles-dibujo.md. */
  function alfaAureola(g, apertura) {
    var D = (apertura > 0) ? apertura : CFG.aureolaAperturaRef;
    var factorApertura = Math.pow(D / CFG.aureolaAperturaRef, 2);
    return Math.min(CFG.aureolaAlfaMax, CFG.aureolaAlfaK * factorApertura * Math.pow(10, -0.4 * g));
  }
  /* Fracción de flujo (0-1) que comparten blurEstrella y colorEstrella, con una
     curva de potencia (CFG.fraccionGamma < 1) que levanta los valores bajos:
     alfaAureola/aureolaAlfaMax está calibrada para saturar al techo con
     brillo tipo Sirio/Vega (mag 0-3), así que la más brillante de un cúmulo
     típico (mag 6-8) apenas rozaba el 5-7% de la escala -halo casi pinpoint y
     color casi sin saturar aun siendo la estrella más notable del campo-. La
     potencia sube esa cola sin tocar los extremos (0→0, 1→1) ni recalibrar
     aureolaAlfaMax/AlfaK (ya validados con Albireo). */
  function fraccionFlujo(g, apertura) {
    return Math.pow(Math.min(1, alfaAureola(g, apertura) / CFG.aureolaAlfaMax), CFG.fraccionGamma);
  }
  /* Halo del sprite (dCore, ver CFG.blur/blurMin) según el brillo ABSOLUTO de
     la estrella, reusando la misma escala de flujo que la aureola: al límite
     de detección (aAur≈0) sale con blurMin (borde duro, pinpoint); una
     brillante que ya toca el techo de la aureola (aAur=aureolaAlfaMax) sale
     con blur (borde suave). No depende de mlim: el halo es del fotón, no del
     equipo. */
  function blurEstrella(g, apertura) {
    return CFG.blurMin + (CFG.blur - CFG.blurMin) * fraccionFlujo(g, apertura);
  }
  /* La saturación del color escala con el flujo ABSOLUTO de la estrella -misma
     fracción f que blurEstrella/alfaAureola-, no es constante: una estrella
     brillante se ve claramente azul/naranja, una tenue casi al límite se ve
     deslavada hacia blanco (efecto tipo Purkinje: los conos necesitan señal
     para dar color, ver README). f=1 (techo de la aureola) → saturacion
     completa; f=0 (al límite de detección) → neutro (1, sin empuje). */
  function colorEstrella(bprp, carbono, g, apertura) {
    var v = bprp;
    if (carbono) {
      v = (bprp == null) ? CFG.carbono.bprpMin
                         : Math.max(CFG.carbono.bprpMin, bprp + CFG.carbono.bprpOffset);
    }
    var f = (g != null) ? fraccionFlujo(g, apertura) : 1;
    var sat = 1 + (GColor.config.saturacion - 1) * f;
    return GColor.colorPorBpRp(v, sat);
  }
  function dibujarEstrellaColor(ctx, x, y, Rtot, rgb, blur, esCarbono) {
    var tn = esCarbono ? CFG.tinteNucleoCarbono : CFG.tinteNucleo, col = rgb[0] + ',' + rgb[1] + ',' + rgb[2];
    var centro = Math.round(255 + tn * (rgb[0] - 255)) + ',' + Math.round(255 + tn * (rgb[1] - 255)) + ',' + Math.round(255 + tn * (rgb[2] - 255));
    /* Aquí había una rama `puntual` (disco plano sin gradiente) que solo usaba
       la amortiguación del halo de globular, eliminada en la Fase 0. */
    /* dCore al cuadrado, no lineal: con 1/(1+blur) el disco denso (alfa
       0,6-0,9) llegaba a ocupar HALF el radio en una estrella brillante
       (dCore≈0,5) -se veía como un disco "quemado" tipo foto de larga
       exposición, no como el punto minúsculo + halo amplio que ve el ojo por
       el ocular-. Elevar al cuadrado empuja el núcleo denso muy por debajo
       solo cuando blur es alto (brillantes), y apenas toca a las tenues -su
       Rtot ya es tan pequeño que la diferencia no se nota-. */
    var dCore = 1 / Math.pow(1 + (blur != null ? blur : CFG.blur), 2);
    var gr = ctx.createRadialGradient(x, y, 0, x, y, Rtot);
    gr.addColorStop(0, 'rgba(' + centro + ',1)');
    gr.addColorStop(dCore * 0.55, 'rgba(' + col + ',0.9)');
    gr.addColorStop(dCore, 'rgba(' + col + ',0.6)');
    /* Sin este stop intermedio, dCore→1 es UN solo tramo lineal: con blur alto
       (18"+brillante) dCore ronda 0,5, así que medio radio -3/4 del área del
       disco- queda ≥0,6 de alfa y el resto cae en línea recta, muy por encima
       de la caída real de un glare (≈1/r²). Se ve disco sólido con anillo, no
       halo. Este stop dobla la curva: cae deprisa nada más pasar dCore y deja
       una cola larga y tenue hasta Rtot. */
    gr.addColorStop(dCore + (1 - dCore) * 0.35, 'rgba(' + col + ',0.18)');
    gr.addColorStop(1, 'rgba(' + col + ',0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, Rtot, 0, 7); ctx.fill();
  }
  /* Aureola (glare) teñida del color de la estrella -mismos stops que el
     sprite blanco de spriteGlow(), pero con el rgb real-. Solo la dibujan las
     pocas estrellas con aAur apreciable (ver dibujar()), así que un gradiente
     por estrella (en vez de reusar un sprite bitmap) no cuesta nada extra. */
  /* ═══════════ PERFIL DE KING 1962 (geometría del cúmulo) ═════════════════════
     Σ(r) = I0·[1/√(1+(r/rc)²) − 1/√(1+(rt/rc)²)]², normalizado a 1 en r=0 y a 0
     en r=rt (radio de marea). rc, rt, r en las mismas unidades (aquí, arcsec).
     rt = rc·10^c, con c = concentración de Harris (log10(rt/rc)) — el catálogo
     NO trae rt directo, su columna r_h es el radio de media luz, otra cosa.

     ATENCIÓN: esto es la FORMA del cúmulo (su PDF radial y su área), NO un mapa
     de iluminación. El halo continuo que pintaba este perfil con alpha-blending
     -haloGlobular, pintarHaloGlobular, gammaHalo y la amortiguación puntual de
     las estrellas de dentro- se eliminó en la Fase 0 del modelo de observación
     de cúmulos: producía un disco difuso con borde visible que no se parece a
     la vista al ocular. Lo sustituye un campo estadístico derivado de la función
     de luminosidad (ver especificacion_modelo_observacion_cumulos.md y
     simulador_ocular/docs/adr/0002). No volver a sumar este perfil a `difuso`. */
  function perfilKing(r, rc, rt) {
    if (!(rc > 0) || !(rt > rc) || r >= rt) return 0;
    var a = 1 / Math.sqrt(1 + (r / rc) * (r / rc));
    var b = 1 / Math.sqrt(1 + (rt / rc) * (rt / rc));
    var v0 = 1 - b;
    return Math.pow((a - b) / v0, 2);
  }

  /* Área efectiva del perfil normalizado: ∫0^rt perfilKing(r)·2πr dr = rc²·areaKing(k),
     k=rt/rc. Cerrada por integración directa; cruzada con integración numérica
     en scripts/test_globulares.js (un signo mal aquí ya coló un error una vez
     en este hilo de trabajo, ver f(k) del historial de la conversación). */
  function areaKing(k) {
    var b = 1 / Math.sqrt(1 + k * k);
    var f = Math.log(1 + k * k) - 4 + 4 / Math.sqrt(1 + k * k) + (k * k) / (1 + k * k);
    return Math.PI * f / ((1 - b) * (1 - b));
  }

  /* ═══════════════ CÚMULOS GLOBULARES · CAPAS 2-4 (pintarCumulo) ═══════════════
     La población la da bitacora-cumulos.js (Capa 1: qué estrellas hay y dónde).
     Aquí se decide qué se resuelve con ESTE instrumento y ESTE cielo, se pinta la
     parte no resuelta como campo estadístico y se le aplica la ley visual. La
     frontera es la de ADR 0002: el módulo no sabe de Cmin ni de canvas, y el
     render no reimplementa nada de la población.

     Cadena, sin ningún parámetro de "contraste de grano" que tocar:

       a(m,r)      ← población (P_solo: geometría pura, sin cielo dentro)
       <I>(r)      = Sigma(r) · S1campo(m_res, r)    flujo por arcsec²
       sigma(r)²   = Sigma(r) · S2campo(m_res, r) / Ω_beam
       m_lim,sky(r) ← magLimite contra el fondo LOCAL (cielo + velo del cúmulo)
       m_res(r)    = m_lim,sky, iterado hasta el punto fijo

     Ya NO hay listón de crowding ni banda de transición (ADR 0012). Cada estrella
     de la LF se dibuja con probabilidad a(m,r) y se va al velo con 1−a, y la que
     sobrevive a la mezcla todavía tiene que llegar al cielo. Ese segundo término
     es el que acopla el velo con m_res y obliga al punto fijo.

     Todo lo que se ve emerge de ahí: más apertura hunde m_res, S1 y S2 caen, y el
     halo se deshace en estrellas; el núcleo aglomera, m_res sube y queda lechoso. */

  /* Ruido del grano. Anclado al CIELO (offsets en ″ desde el centro del cúmulo),
     no al lienzo: hacer zoom agranda el grano, nunca lo redibuja. Cada impulso
     sale de un hash de (cúmulo, realización, celda, índice), así que no hay
     array que guardar y el campo es el mismo en cualquier orden de pintado.

     Convolución dispersa (ruido de Gabor), no la malla cuadrada bilineal de
     antes: esa interpolaba ALTURAS en los nodos de una rejilla cuadrada y a ×6
     se veían las cadenas curvas y los anillos de nudos brillantes de la propia
     rejilla (issue #96, medido en exp_sgrano — bloqueante de ADR 0015). Aquí los
     impulsos caen en posiciones CON JITTER dentro de cada celda de una rejilla
     de búsqueda —la rejilla es solo para encontrar vecinos rápido, no una malla
     de valores— y se combinan con un núcleo gaussiano suave: sin nodos fijos no
     hay eje que seguir con el ojo. */
  var GRANO_TABLA = null;
  function granoTabla() {
    if (GRANO_TABLA) return GRANO_TABLA;
    // Tabla grande a propósito: cada punto suma ~150 impulsos, y con una tabla
    // de pocos miles el índice de dos impulsos distintos coincide a menudo (el
    // cumpleaños), lo que les da el MISMO peso y rompe la independencia que
    // hace exacta la suma. Con 2^18 la colisión es despreciable.
    var n = 1 << 18, v = new Float64Array(n), suma = 0, suma2 = 0, k;
    for (k = 0; k < n; k++) {
      var u1 = (k + 0.5) / n, u2 = ((Math.imul(k, 2654435761) >>> 0) % n + 0.5) / n;
      v[k] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);   // Box-Muller
      suma += v[k];
    }
    var media = suma / n;
    for (k = 0; k < n; k++) { v[k] -= media; suma2 += v[k] * v[k]; }
    var esc = 1 / Math.sqrt(suma2 / n);
    for (k = 0; k < n; k++) v[k] *= esc;
    GRANO_TABLA = v;
    return v;
  }

  var GRANO_LAMBDA = 3, GRANO_RADIO = 2;   // impulsos/celda ESPERADOS, radio de búsqueda en celdas

  function granoHash(semilla, i, j, k, sal) {
    var h = semilla ^ Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263)
      ^ Math.imul(k | 0, 2246822519) ^ sal;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }

  /* Número de impulsos de la celda (i,j): Poisson(λ), no un conteo fijo. Con un
     conteo fijo por celda la DENSIDAD de impulsos queda modulada a la frecuencia
     de la propia rejilla de búsqueda —una regularidad tan visible como la malla
     que este ticket quita—; con conteo Poisson no hay periodo que detectar.
     Algoritmo de Knuth: multiplicar uniformes hasta bajar de e^-λ. */
  function granoCeldaN(semilla, i, j) {
    var s = granoHash(semilla, i, j, 0, 0x27D4EB2F);
    var limite = Math.exp(-GRANO_LAMBDA), p = 1, n = 0;
    do {
      n++;
      s = Math.imul(s ^ (s >>> 15), 2246822519);
      s = (s ^ (s >>> 13)) >>> 0;
      p *= ((s >>> 8) + 0.5) / 16777216;   // uniforme (0,1) de 24 bits
    } while (p > limite && n < 24);
    return n - 1;
  }

  // Posición del impulso k dentro de la celda (i,j): jitter uniforme en [0,1)².
  function granoImpPos(semilla, i, j, k) {
    var h = granoHash(semilla, i, j, k, 0x9E3779B9);
    return [(h & 0xFFFF) / 0x10000, ((h >>> 16) & 0xFFFF) / 0x10000];
  }

  function granoImpPeso(semilla, i, j, k) {
    var tabla = granoTabla();
    return tabla[granoHash(semilla, i, j, k, 0x85EBCA6B) % tabla.length];
  }

  /* Caché de impulsos por celda: `pintarCumulo` llama a granoEn una vez por
     píxel, y cada celda de búsqueda cae en el vecindario de ~(2·GRANO_RADIO+1)²
     píxeles distintos — sin caché se rehacía el sorteo de Poisson y el hash de
     cada impulso esa misma cantidad de veces por celda. FIFO con tope: una
     sesión que hace zoom/pan sobre muchos cúmulos no debe crecer sin límite. */
  // Dos niveles: la clave exterior (semilla+paso) se arma una vez por llamada a
  // granoEn, no una vez por celda vecina; la interior es un entero (i,j
  // empaquetados), sin concatenar strings en el camino caliente. Tope sobre el
  // número total de celdas cacheadas: un barrido de coordenadas disperso (p.
  // ej. la autocorrelación de test_grano_malla.js) casi no repite celda, así
  // que llenaría la caché sin límite si solo se topara la tabla exterior. Se
  // vacía TODA la caché al llegar al tope en vez de desalojar la más vieja: un
  // FIFO con .shift() es O(n) por desalojo, y con un tope alto y muchos fallos
  // de caché (ese mismo barrido disperso) eso es O(n²) — se midió: colgaba el
  // proceso. Vaciar entero es O(1) amortizado y aquí el patrón real de uso
  // (píxeles contiguos de un cúmulo) reconstruye rápido lo que hace falta.
  var GRANO_CACHE = new Map(), GRANO_CACHE_N = 0, GRANO_CACHE_TOPE = 20000;
  /* La clave exterior se arma "una vez por llamada a granoEn"... que es una vez
     por PIXEL: en un cumulo que ocupa medio lienzo son cientos de miles de
     concatenaciones (semilla es un entero, cell un flotante: las dos se pasan a
     cadena) y otras tantas busquedas en el Map. Se recuerda la ultima tabla: el
     patron real -pixeles contiguos del mismo cumulo, misma semilla y mismo
     paso- la acierta siempre menos la primera vez. */
  var GRANO_ULT_SEMILLA = null, GRANO_ULT_CELL = null, GRANO_ULT_TABLA = null;
  function granoTablaCelda(semilla, cell) {
    if (GRANO_ULT_TABLA && semilla === GRANO_ULT_SEMILLA && cell === GRANO_ULT_CELL) {
      return GRANO_ULT_TABLA;
    }
    var clave = semilla + '_' + cell;
    var tabla = GRANO_CACHE.get(clave);
    if (!tabla) { tabla = new Map(); GRANO_CACHE.set(clave, tabla); }
    GRANO_ULT_SEMILLA = semilla; GRANO_ULT_CELL = cell; GRANO_ULT_TABLA = tabla;
    return tabla;
  }
  /* Los impulsos van en un Float64Array PLANO de tripletes (x, y, w), no en un
     array de objetos: granoEn recorre los de ~(2*GRANO_RADIO+1)^2 celdas por
     pixel y en cada uno leia tres propiedades de un objeto distinto. Mismos
     valores y mismo orden de suma -un Float64 es exactamente un number de JS-,
     pero contiguos en memoria. */
  function granoCelda(tabla, semilla, i, j, cell) {
    var claveInterna = (i + 32768) * 65536 + (j + 32768);
    var impulsos = tabla.get(claveInterna);
    if (impulsos) return impulsos;
    var n = granoCeldaN(semilla, i, j);
    impulsos = new Float64Array(n * 3);
    for (var k = 0; k < n; k++) {
      var pos = granoImpPos(semilla, i, j, k);
      impulsos[k * 3]     = (i + pos[0]) * cell;
      impulsos[k * 3 + 1] = (j + pos[1]) * cell;
      impulsos[k * 3 + 2] = granoImpPeso(semilla, i, j, k);
    }
    if (GRANO_CACHE_N >= GRANO_CACHE_TOPE) { GRANO_CACHE.clear(); GRANO_CACHE_N = 0; tabla.clear(); GRANO_CACHE.set(semilla + '_' + cell, tabla); }
    tabla.set(claveInterna, impulsos);
    GRANO_CACHE_N++;
    return impulsos;
  }

  /* `campoLognormal` (más abajo) da por hecho que g es N(0,1) EXACTA: mu =
     ln(<I>) − s²/2 solo deja la media pintada exacta si E[e^{s·g}] = e^{s²/2},
     la identidad de la MGF normal. El campo es una combinación LINEAL de pesos
     gaussianos independientes (`granoImpPeso`) con coeficientes fijos por punto
     (el núcleo `c`, que solo depende de la distancia): eso lo hace exactamente
     N(0,1) en cada punto, igual que la malla bilineal de antes, sin heredar su
     rejilla de valores. */
  function campoLognormal(mu, s, g) {
    return Math.exp(mu + s * g);
  }

  /* Cada punto suma los impulsos de las celdas vecinas pesados por un núcleo
     gaussiano de ancho `bw`, y se normaliza por la norma EXACTA de esos pesos
     en ESE punto (raíz de Σc²) — la misma idea que la malla bilineal de antes
     (normalizar con el peso real, no una constante), pero con vecinos en
     posiciones libres en vez de las 4 esquinas de una celda. */
  function granoEn(semilla, xAs, yAs, pasoAs) {
    var bw = pasoAs / 2, cell = bw;
    var i0 = Math.floor(xAs / cell), j0 = Math.floor(yAs / cell);
    var suma = 0, sumaC2 = 0;
    var tabla = granoTablaCelda(semilla, cell);
    for (var di = -GRANO_RADIO; di <= GRANO_RADIO; di++) {
      var i = i0 + di;
      for (var dj = -GRANO_RADIO; dj <= GRANO_RADIO; dj++) {
        var j = j0 + dj;
        var impulsos = granoCelda(tabla, semilla, i, j, cell);
        for (var k = 0; k < impulsos.length; k += 3) {
          var dx = (xAs - impulsos[k]) / bw, dy = (yAs - impulsos[k + 1]) / bw, d2 = dx * dx + dy * dy;
          if (d2 > GRANO_RADIO * GRANO_RADIO) continue;
          var c = Math.exp(-0.5 * d2);
          suma += impulsos[k + 2] * c;
          sumaC2 += c * c;
        }
      }
    }
    return sumaC2 > 0 ? suma / Math.sqrt(sumaC2) : 0;
  }

  function hashCadena(texto) {
    var h = 2166136261;
    for (var i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /* ═══════ LEY DE UMBRAL DE TEXTURA (ADR 0015, simulador_ocular/docs/adr/0015-textura/prerregistro.md) ═══════
     El grano SBF de un globular no es una mancha uniforme (eso lo juzga Cmin,
     ver H2c): es RUIDO ESPACIAL, y la literatura dice que ahí el detector no es
     un umbral de contraste sino la CSF evaluada a la frecuencia retiniana del
     grano, en régimen de filtro adaptado (Rovamo/Van Nes & Bouman, bibliografía
     completa en el documento citado). d′ = amplitud de la señal (RMS relativo
     del grano en el anillo) por la ganancia del observador a esa frecuencia y
     esa iluminancia; P(ver) es la salida psicométrica de Quick 1974.

     TEXTURA.ACTIVO en false dejar sGrano tal como salía antes (visibilidadDifusa
     · Cmin, ver tablaCumulo): con el canal a cero el render es bit a bit el de
     hoy. La calibración de K contra el ancla de M13 —y el interruptor de
     producción— es el ticket #99; aquí K es SOLO provisional. */
  var TEXTURA = {
    ACTIVO: false,     // producción apagada (#99 decide el veredicto)
    K: 1,              // provisional, sin calibrar
    BETA: 3.5,         // Quick 1974, fijo (prohibido tocarlo, ver §5 del prerregistro)
    // 'energia' (default, listones §2/§3) o 'minkowski' (vía de escape única,
    // §5): cuál d′ usa tablaCumulo. Nunca los dos "activos" en producción.
    ESTADISTICO: 'energia',
    // CSF paso-bajo: ganancia y frecuencia de corte crecen con √iluminancia
    // (De Vries–Rose / Van Nes & Bouman 1967); a iluminancia de referencia I0
    // el corte cae en FC0 c/deg — "corte escotópico a pocos c/deg" (bibliografía
    // §2). Todas provisionales: el nivel absoluto es K, no estas dos.
    // I0 ancla la escala al mismo cielo de referencia que usa Cmin (Fref, sqm
    // 21) con pupila de salida 7 mm: sin esto, FC0/S0/K viven en unidades
    // arbitrarias y ni el orden de magnitud de K (#99) tendría sentido.
    FC0: 3, I0: Math.pow(10, -0.4 * 21) * 49, S0: 1
  };

  /* Frecuencia retiniana única del grano: medio ciclo por elemento de grano
     (θ_grano) proyectado a M aumentos. f = 1 / (2 · θ_grano_deg · M); con
     θ_grano = 1″ da f = 1800/M, el número de la bibliografía §1.3 (61× → 30
     c/deg, 250× → 7 c/deg). */
  function frecuenciaGranoCdeg(thetaGranoAs, aumentos) {
    return (thetaGranoAs > 0 && aumentos > 0) ? 1800 / (thetaGranoAs * aumentos) : 0;
  }

  /* CSF escotópica/mesópica a una frecuencia y una iluminancia retiniana
     (proxy relativo, no trolands calibrados: K absorbe la escala real). */
  function csfTextura(fCdeg, iluminancia) {
    if (!(iluminancia > 0)) return 0;
    var raiz = Math.sqrt(iluminancia / TEXTURA.I0);
    var fc = Math.max(TEXTURA.FC0 * raiz, 1e-6);
    return TEXTURA.S0 * raiz * Math.exp(-fCdeg / fc);
  }

  /* d′ de energía filtrada (Rovamo 1993: SNR constante en régimen limitado por
     ruido externo, no contraste por píxel): la amplitud RMS relativa del grano
     multiplicada por la ganancia del observador a su frecuencia retiniana.

       rmsRelativo     sigma(r)/<I>(r) del anillo (adimensional)
       thetaGranoAs    escala angular del grano en el CIELO, en ″ (thGranoAs)
       aumentos        los del cielo
       fondoLocalFlujo fondo local tal como llega al ojo, ANTES de pupila —
                        mismas unidades que Fcielo (cGrano.Fcielo + <I>(r))
       pupilaSalidaMm  pupila de salida del equipo, en mm

     La iluminancia retiniana es proxy: fondo × pupila², la misma dependencia
     de área que un troland real sin calibrar la constante (la calibra K). */
  function dPrimeTextura(rmsRelativo, thetaGranoAs, aumentos, fondoLocalFlujo, pupilaSalidaMm) {
    if (!(rmsRelativo > 0)) return 0;
    var f = frecuenciaGranoCdeg(thetaGranoAs, aumentos);
    var iluminancia = Math.max(0, fondoLocalFlujo) * pupilaSalidaMm * pupilaSalidaMm;
    return rmsRelativo * csfTextura(f, iluminancia);
  }

  /* Salida psicométrica de Quick 1974: P(ver) = 1 − exp(−(d′/K)^β). */
  function pVerTextura(rmsRelativo, thetaGranoAs, aumentos, fondoLocalFlujo, pupilaSalidaMm) {
    var d = dPrimeTextura(rmsRelativo, thetaGranoAs, aumentos, fondoLocalFlujo, pupilaSalidaMm);
    return 1 - Math.exp(-Math.pow(d / TEXTURA.K, TEXTURA.BETA));
  }

  /* Vía de escape única del prerregistro (§5, simulador_ocular/docs/prerregistro_umbral_
     textura.md): d′ de SUMA MINKOWSKI sobre la distribución de δI en vez de la
     energía filtrada (RMS de anillo). Quick 1974 ES un modelo de suma de
     probabilidad con exponente β: P = 1 − exp(−Σ(d_i/K)^β); tratar el anillo
     como UN d′ (energía) colapsa esa suma a un solo término. Aquí se integra
     sobre la distribución real del grano —lognormal, sigma sLn ya tabulada— con
     cuadratura de Gauss-Hermite (determinista, sin muestreo), y se pondera por
     N_ef = área del anillo / Ω_beam elementos independientes. Ni K ni β
     cambian de papel: K sigue siendo el ancla, β sigue fijo en 3,5. */
  var GH_X = [-3.889724897869782, -3.020637625111485, -2.279507080501060,
    -1.597682635152605, -0.9477883912401637, -0.3142403762543591,
    0.3142403762543591, 0.9477883912401637, 1.597682635152605,
    2.279507080501060, 3.020637625111485, 3.889724897869782];
  var GH_W = [2.658551684356232e-7, 8.573687043587876e-5, 0.003905390584629068,
    0.05160798561588414, 0.2604923102641612, 0.5701352362624796,
    0.5701352362624796, 0.2604923102641612, 0.05160798561588414,
    0.003905390584629068, 8.573687043587876e-5, 2.658551684356232e-7];

  function pVerTexturaMinkowski(sLn, nEf, atenGrano, thetaGranoAs, aumentos, fondoLocalFlujo, pupilaSalidaMm) {
    if (!(sLn > 0) || !(nEf > 0)) return 0;
    var suma = 0;
    for (var i = 0; i < GH_X.length; i++) {
      var g = -sLn * sLn / 2 + Math.SQRT2 * sLn * GH_X[i];
      // Misma atenuación de patch de integración que la rama de energía (ver
      // tablaCumulo): el elemento que se juzga es el parche, no el píxel crudo.
      var contraste = atenGrano * Math.abs(Math.exp(g) - 1);
      var d = dPrimeTextura(contraste, thetaGranoAs, aumentos, fondoLocalFlujo, pupilaSalidaMm);
      suma += GH_W[i] * Math.pow(d / TEXTURA.K, TEXTURA.BETA);
    }
    suma /= Math.sqrt(Math.PI);   // normalización de la cuadratura Gauss-Hermite
    return 1 - Math.exp(-nEf * suma);
  }

  /* Tabla radial del cúmulo: m_res, <I>, sigma y los dos desvanecidos, tabulados
     en el radio PROPIO y interpolados por píxel. Por anillos y no por píxel por
     dos razones que van juntas: cuesta 512 evaluaciones en vez de 500.000, y el
     desvanecido del grano tiene que juzgar la textura (amplitud sigma), no la
     excursión de cada píxel —si no, las fluctuaciones grandes sobreviven
     proporcionalmente más y deforman el mismísimo S2/S1² que sale de la LF—. */
  var TRAMOS_R = 512;

  /* `radioImagenAs` es el tamaño de la imagen estelar (Airy ⊕ seeing) y manda en
     a(m,r); `omegaBeam` puede ser mayor —el píxel del lienzo— y solo entra en σ
     del grano. Ver pintarCumulo. */
  function tablaCumulo(pob, o, cHalo, cGrano, perceptual, omegaBeam, atenGrano, radioImagenAs, thGranoAs) {
    var C = window.BitacoraCumulos;
    var pasadas = C.config.pasadasPuntoFijo;
    var n = TRAMOS_R + 1, paso = pob.rtAs / TRAMOS_R;
    var r = new Float64Array(n), mRes = new Float64Array(n), Im = new Float64Array(n);
    var sg = new Float64Array(n), sHalo = new Float64Array(n), sGrano = new Float64Array(n);
    var lnS = new Float64Array(n);
    var granoActivo = false;   // ver uso más abajo: evita la pasada de renormalización si es inútil
    for (var i = 0; i < n; i++) {
      var rAs = i * paso;
      var s = pob.sigma(rAs);
      r[i] = rAs;
      if (!(s > 0)) { mRes[i] = -Infinity; continue; }
      /* Circularidad velo ↔ m_lim,sky: punto fijo con N FIJO de pasadas. Se
         arranca en m_res = +∞ —todo resuelto salvo lo que la mezcla se lleva, la
         única cota que no depende del cielo— y se itera. MEDIDO: contrae, el
         punto fijo es único (2e-13 mag entre arranques opuestos a 30 pasadas) y
         una sola pasada deja 0,281 mag, 28 veces el listón de 0,01. N y no
         tolerancia: el criterio de parada no puede vivir dentro de la imagen.
         simulador_ocular/docs/adr/0012-crowding/punto_fijo.md */
      var m = Infinity;
      for (var it = 0; it < pasadas; it++) {
        var mSky = magLimite({
          apertura: o.apertura, aumentos: o.cielo.aumentos, transmision: o.cielo.transmision,
          sqm: -2.5 * Math.log10(cHalo.Fcielo + s * pob.S1campo(m, rAs, radioImagenAs)),
          pupilaOjo: o.cielo.pupilaOjo
        });
        m = (mSky == null) ? -Infinity : mSky;
      }
      mRes[i] = m;
      Im[i] = s * pob.S1campo(m, rAs, radioImagenAs);
      sg[i] = Math.sqrt(s * pob.S2campo(m, rAs, radioImagenAs) / omegaBeam);
      sHalo[i] = visibilidadDifusa(Im[i], cHalo.Fcielo * cHalo.Cmin, perceptual);
      /* El grano compite contra el fondo LOCAL, que incluye el propio velo del
         cúmulo: en el núcleo se aplana solo y queda lechoso, sin ninguna perilla.
         Y se juzga con la AMPLITUD PROMEDIADA sobre el parche de integración
         (`atenGrano`, ver pintarCumulo), no con la del beam. σ(r) sale intacta a
         la tabla: lo que se pinta es la física, y la atenuación solo entra en el
         desvanecido. */
      /* Anchura de la lognormal (ver campoLognormal). Se tabula ella y no mu,
         porque mu = ln(<I>) - s²/2 se va a -inf donde el perfil se acaba y ahí la
         interpolación daría NaN a un paso del borde; con <I> ya interpolado sale
         el mismo número y el borde queda limpio. Se calcula ANTES de sGrano
         porque la vía de escape Minkowski (ver abajo) la necesita. */
      var s2 = (Im[i] > 0 && sg[i] > 0) ? Math.log(1 + (sg[i] * sg[i]) / (Im[i] * Im[i])) : 0;
      lnS[i] = Math.sqrt(s2);
      /* TEXTURA.ACTIVO en false (producción, hasta que #99 calibre K): sGrano
         sigue saliendo de visibilidadGrano (== visibilidadDifusa·Cmin salvo
         que un arnés fuerce FOT.GRANO_FORZAR) —render bit a bit idéntico. En
         true (ley de umbral, #97), ESTADISTICO decide la forma: 'energia'
         (§2/§3 del prerregistro) usa un solo d′ de RMS de anillo; 'minkowski'
         (vía de escape única, §5) integra sobre la distribución real del
         grano. Ambas comparten la MISMA amplitud (sg·atenGrano) y el MISMO
         fondo local: la señal física no se toca. */
      sGrano[i] = TEXTURA.ACTIVO
        ? (TEXTURA.ESTADISTICO === 'minkowski'
            ? pVerTexturaMinkowski(lnS[i], (2 * Math.PI * rAs * paso) / omegaBeam, atenGrano,
                thGranoAs, o.cielo.aumentos, cGrano.Fcielo + Im[i], o.cielo.pupilaSalida)
            : pVerTextura(Im[i] > 0 ? (sg[i] * atenGrano) / Im[i] : 0, thGranoAs,
                o.cielo.aumentos, cGrano.Fcielo + Im[i], o.cielo.pupilaSalida))
        : visibilidadGrano(sg[i] * atenGrano,
            (cGrano.Fcielo + Im[i]) * cGrano.Cmin, perceptual);
      if (sGrano[i] > 0) granoActivo = true;
    }
    return { paso: paso, r: r, mRes: mRes, I: Im, sigma: sg, sHalo: sHalo, sGrano: sGrano,
             lnS: lnS, granoActivo: granoActivo };
  }

  function interpTabla(tabla, v, rAs) {
    if (!(rAs >= 0) || rAs >= tabla.r[tabla.r.length - 1]) return 0;
    var u = rAs / tabla.paso, i = Math.floor(u), t = u - i;
    return v[i] * (1 - t) + v[i + 1] * t;
  }

  /* m_res(r) por interpolación aparte: es una MAGNITUD, no un flujo, y fuera de
     r_t no vale 0 sino "no hay aglomeración" (todo se resuelve). */
  function mResEn(tabla, rAs) {
    var ult = tabla.r.length - 1;
    if (!(rAs >= 0) || rAs >= tabla.r[ult]) return Infinity;
    var u = rAs / tabla.paso, i = Math.floor(u), t = u - i;
    var a = tabla.mRes[i], b = tabla.mRes[i + 1];
    if (!isFinite(a)) return b;
    if (!isFinite(b)) return a;
    return a * (1 - t) + b * t;
  }

  /* Pinta el campo no resuelto del cúmulo sobre `difuso` (flujo por arcsec², las
     mismas unidades que la capa de galaxias) y devuelve la lista de estrellas a
     dibujar: las de Gaia que ESTE equipo resuelve, con la banda de transición
     atenuada vía m_eff, más las sintéticas que Gaia no trae.

       o = { ra0, dec0, arcmin, size, cielo, apertura, estrellas, realization }

     `o.campoCrudo` (opcional, Float32Array del tamaño del lienzo) recibe el campo
     ANTES de la ley visual. Es una salida de medida —el Nivel 2 compara su media
     y su varianza con Sigma·S1 y Sigma·S2/Ω_beam—, no una variante de dibujo: lo
     que se pinta no depende de que se pase o no.

     `cumulo` es la ficha de Harris que espera bitacora-cumulos.js, más ra/dec.
     Devuelve null si falta el módulo de población: es una protección de
     integración, no un camino alternativo que dibuje un cúmulo distinto. */
  function pintarCumulo(difuso, cumulo, o) {
    var C = window.BitacoraCumulos;
    if (!C || !o.cielo) return null;
    var pob = C.poblacionCacheada(cumulo, o.realization);
    if (!pob) return null;
    /* La escala del beam es el RADIO de la imagen estelar, Airy ⊕ seeing, el
       mismo `radioImagenEstelar` con el que se dibujan las estrellas. Hasta aquí
       se llamaba `fwhmAs` y valía el doble, pero no era una FWHM: `radioAiry` es
       el radio del primer anillo oscuro (Rayleigh), así que el doble era el
       DIÁMETRO de ese anillo. Todos los usos de abajo lo dividían por 2 o lo
       elevaban al cuadrado entre 4 para deshacerlo. Ver
       simulador_ocular/docs/adr/0012-crowding/ancla_thetasep.md. */
    var radioImagenAs = radioImagenEstelar(o.apertura);
    if (!(radioImagenAs > 0)) return null;

    var SIZE = o.size, escv = SIZE / (o.arcmin / 60);   // px por grado
    var pxPorAs = escv / 3600, asPorPx = 1 / pxPorAs;
    var areaPx = asPorPx * asPorPx;                     // arcsec² por píxel
    var cos0 = Math.cos(o.dec0 * Math.PI / 180);
    var cx = SIZE / 2 - (((cumulo.ra - o.ra0 + 540) % 360) - 180) * cos0 * escv;
    var cy = SIZE / 2 - (cumulo.dec - o.dec0) * escv;

    var perceptual = !!o.cielo.perceptual && FOT.GAMMA_PERCEPTUAL !== 1;
    /* Dos escalas angulares, una sola ley (H2c). La mancha se juzga con el tamaño
       del cúmulo; el grano, con su escala de INTEGRACIÓN (más abajo), y como Cmin
       penaliza al elemento pequeño el grano tiene siempre el listón más alto de
       los dos.

       Lo que no se sigue de ahí —y v7 daba por hecho— es que el grano muera antes
       que la mancha al empeorar el cielo. Medido en v8: no. El umbral no es lo
       único que se mueve; con el cielo sucio `m_lim,sky` se hunde, las estrellas
       del halo dejan de resolverse y caen al campo, así que S2 sube más deprisa
       que el umbral y el grano se ACERCA al suyo mientras la mancha se aleja del
       suyo. Está medido en test_grano_sbf.js (G5), con la ley de v7 dando el
       mismo signo: no lo trae este cambio. */
    var elip = cumulo.elip || 0;
    var thetaCumulo = 2 * cumulo.rh * Math.sqrt(1 - elip);     // arcmin, circularizado
    var cHalo = ctxFotometrico(o.cielo, thetaCumulo);

    /* La celda del grano es el beam... salvo cuando el píxel del lienzo es más
       grande que él. Un píxel integra todo lo que cae dentro, así que muestrear
       ahí un campo más fino no dibuja grano: dibuja aliasing, con la varianza del
       beam en un píxel que ya la ha promediado. Con Ω = max(beam, píxel) el grano
       se ve más suave al alejar el zoom, que es lo que hace la naturaleza.

       Pero SOLO para el grano. La aglomeración (m_crowd, y con ella qué
       estrellas se resuelven) es física del telescopio y de la atmósfera: si
       lee el píxel del lienzo, el tamaño de la ventana decide cuántas estrellas
       tiene el cúmulo —medido en M13 a 173×, el píxel de 2,35″ ganaba a la Ω
       óptica y hundía m_res 0,54 mag en el núcleo, 86 estrellas de 1071
       (harness_halo_estrellas.js). De ahí las dos Ω. */
    var omegaRes = Math.PI * radioImagenAs * radioImagenAs;
    var omegaBeam = Math.max(omegaRes, areaPx);
    var thBeamAs = 2 * Math.sqrt(omegaBeam / Math.PI);   // diámetro equivalente

    /* ESCALA A LA QUE SE JUZGA EL GRANO. Hasta v7 era el beam, y ahí `s_grano`
       salía 0 en todas las corridas: la textura se juzgaba como si fuese UN
       elemento aislado de 2,4″, y a ese tamaño H2c pide contrastes de 10²-10³.
       Pero una textura no es un elemento: es un campo aleatorio que el ojo
       integra sobre un parche. Promediar n = (θ/θ_beam)² celdas independientes
       divide la amplitud por √n —de ahí `atenGrano`— y a la vez baja el umbral,
       porque Cmin favorece al elemento grande. El compromiso tiene un máximo, y
       está donde el término de Ricco vale 1: θ* = θ_R/M. Ni barrido de escalas ni
       parámetro de parche: θ_R y los aumentos ya estaban en la ley.

       Dos consecuencias que se comprueban en test_grano_sbf.js: el grano deja de
       depender del seeing (mejor seeing sube σ y encoge el beam en la misma
       proporción, y θ* no se mueve) y empieza a responder al aumento. Lo que NO
       cambia es que siga sin verse: con S2 real la textura se queda en el 15 %
       de su umbral en el mejor cúmulo del catálogo con el mejor equipo. */
    var thGranoAs = Math.max(thBeamAs,
      (o.cielo.aumentos > 0) ? 60 * thetaRiccoArcmin(cHalo.SBe) / o.cielo.aumentos : 0);
    var cGrano = ctxFotometrico(o.cielo, thGranoAs / 60);
    var atenGrano = thBeamAs / thGranoAs;

    var tabla = tablaCumulo(pob, o, cHalo, cGrano, perceptual, omegaBeam, atenGrano, radioImagenAs, thGranoAs);

    var mascara = difusoMaskDe(o.cielo, difuso.length);
    var semilla = hashCadena([cumulo.id, C.versionLF(), o.realization || 0, 'grano'].join('|'));
    /* El PASO de la malla no depende del zoom: es la escala de la PSF, y con eso
       el patrón queda clavado al cielo. Lo que sí cambia con el zoom es la
       AMPLITUD, porque un píxel grande promedia el grano y lo aplana; de eso se
       encarga la Ω de tablaCumulo. Mover el paso también rompería el anclaje. */
    var pasoGrano = radioImagenAs;
    var alcance = pob.rtAs * pxPorAs;
    var x0 = Math.max(0, Math.floor(cx - alcance)), x1 = Math.min(SIZE - 1, Math.ceil(cx + alcance));
    var y0 = Math.max(0, Math.floor(cy - alcance)), y1 = Math.min(SIZE - 1, Math.ceil(cy + alcance));
    var Fmedio = 0, Fpintado = 0, Fsingrano = 0, FpintadoGrano = 0;
    var renormGrano = FOT.RENORM_ANILLO_GRANO && tabla.granoActivo;
    /* Renormalización por anillo (issue #98). El recorte `if (!(I > 0)) I = 0`
       de más abajo descarta SOLO la cola negativa del campo; como el campo es
       simétrico en dI, eso regala flujo. Se descuenta con un factor POR
       ANILLO (la misma malla radial de `tablaCumulo`, `tabla.paso`) que no
       depende del píxel: escalar todo el anillo por igual no toca la FORMA de
       la textura ahí dentro (ADR 0006), solo su amplitud media. Primera pasada
       para medir el objetivo (Im·sHalo, sin grano) y lo realmente pintado
       (recortado) por anillo; la segunda pinta con el factor ya calculado.
       `campoLognormal`/`granoEn` son deterministas en (semilla, r), así que
       repetir el cálculo en dos pasadas daría el mismo campo. Se guarda igual:
       `granoEn` es ~75 exponenciales por píxel y es lo más caro del render de
       un cúmulo, así que recalcularlo costaba el doble de todo. La caja son
       Float64 (no Float32: el valor tiene que ser el MISMO bit a bit que el de
       la primera pasada) y solo se reserva cuando la renormalización está
       activa. */
    var nAnillos = tabla.r.length, factorAnillo = null;
    function kAnillo(rAs) { return Math.min(nAnillos - 1, Math.floor(rAs / tabla.paso)); }
    var anchoCaja = x1 - x0 + 1, crudoCaja = null;
    if (renormGrano) {
      var sumObjetivo = new Float64Array(nAnillos), sumRecorte = new Float64Array(nAnillos);
      crudoCaja = new Float64Array(anchoCaja * (y1 - y0 + 1));
      for (var y1p = y0; y1p <= y1; y1p++) {
        var norte1p = -(y1p - cy) * asPorPx;
        for (var x1p = x0; x1p <= x1; x1p++) {
          var este1p = -(x1p - cx) * asPorPx;
          var rAs1p = pob.radioPropio(este1p, norte1p);
          if (rAs1p >= pob.rtAs) continue;
          var Im1p = interpTabla(tabla, tabla.I, rAs1p);
          if (!(Im1p > 0)) continue;
          var sH1p = interpTabla(tabla, tabla.sHalo, rAs1p);
          var sG1p = interpTabla(tabla, tabla.sGrano, rAs1p);
          var sLn1p = interpTabla(tabla, tabla.lnS, rAs1p);
          var crudo1p = campoLognormal(Math.log(Im1p) - sLn1p * sLn1p / 2, sLn1p,
            granoEn(semilla, este1p, norte1p, pasoGrano));
          crudoCaja[(y1p - y0) * anchoCaja + (x1p - x0)] = crudo1p;
          var I1p = Im1p * sH1p + (crudo1p - Im1p) * sG1p;
          var k1p = kAnillo(rAs1p);
          sumObjetivo[k1p] += Im1p * sH1p * areaPx;
          sumRecorte[k1p] += (I1p > 0 ? I1p : 0) * areaPx;
        }
      }
      factorAnillo = new Float64Array(nAnillos);
      for (var k2 = 0; k2 < nAnillos; k2++) {
        factorAnillo[k2] = sumRecorte[k2] > 0 ? sumObjetivo[k2] / sumRecorte[k2] : 1;
      }
    }
    for (var y = y0; y <= y1; y++) {
      var norte = -(y - cy) * asPorPx;
      for (var x = x0; x <= x1; x++) {
        var este = -(x - cx) * asPorPx;
        var rAs = pob.radioPropio(este, norte);
        if (rAs >= pob.rtAs) continue;
        var Im = interpTabla(tabla, tabla.I, rAs);
        if (!(Im > 0)) continue;
        var sig = interpTabla(tabla, tabla.sigma, rAs);
        var sH = interpTabla(tabla, tabla.sHalo, rAs);
        var sG = interpTabla(tabla, tabla.sGrano, rAs);
        var sLn = interpTabla(tabla, tabla.lnS, rAs);
        // Lo que ya calculó la pasada de medida: descarta los mismos píxeles
        // que esta (mismas condiciones sobre los mismos valores), así que
        // cuando hay caja, el valor guardado existe.
        var crudo = crudoCaja
          ? crudoCaja[(y - y0) * anchoCaja + (x - x0)]
          : campoLognormal(Math.log(Im) - sLn * sLn / 2, sLn,
              granoEn(semilla, este, norte, pasoGrano));
        var dI = crudo - Im;
        var I = Im * sH + dI * sG;
        if (!(I > 0)) I = 0;                      // el campo no puede quitar luz
        if (renormGrano) I *= factorAnillo[kAnillo(rAs)];
        Fmedio += Im * areaPx;
        Fpintado += crudo * areaPx;
        Fsingrano += Im * sH * areaPx;
        FpintadoGrano += I * areaPx;
        var idx = y * SIZE + x;
        if (o.campoCrudo) o.campoCrudo[idx] = crudo;
        if (o.campoGranoI) o.campoGranoI[idx] = I;
        difuso[idx] += I;
        // La t del realce es s_halo: donde el velo ya se ve bien, el realce se
        // retira y el núcleo no se quema a blanco (ver difusoMarcado).
        if (sH > mascara[idx]) mascara[idx] = sH;
      }
    }

    return {
      tabla: tabla, poblacion: pob, radioImagenAs: radioImagenAs, cHalo: cHalo, cGrano: cGrano,
      omegaBeam: omegaBeam, omegaRes: omegaRes, thBeamAs: thBeamAs, thGranoAs: thGranoAs, atenGrano: atenGrano,
      Fmedio: Fmedio, Fpintado: Fpintado, Fsingrano: Fsingrano, FpintadoGrano: FpintadoGrano,
      estrellas: estrellasCumulo(pob, cumulo, tabla, o, C, radioImagenAs)
    };
  }

  /* Las estrellas del cúmulo que este equipo dibuja. Se juzga por estrella y CON
     SU RADIO: la misma m=16 puede resolverse a 8′ del centro y fundirse a 0,5′.

     Dos filtros distintos, y conviene no confundirlos (ADR 0012):

       la mezcla   se dibuja con probabilidad a(m,r) = P_solo   ← SORTEO
       el cielo    hace falta m <= m_res(r)                     ← umbral

     El sorteo es Bernoulli, no una atenuación. Atenuar restaba 2,5·log10(a) mag
     y la estrella cruzaba la magnitud límite, así que un efecto de VECINDAD se
     convertía en un corte por MAGNITUD: MEDIDO, se llevaba el 100 % del cuartil
     débil contra el 50 % de la verdad geométrica
     (simulador_ocular/docs/adr/0012-crowding/atenuacion_vs_bernoulli.md). Y como ya no hay magnitud
     efectiva, tampoco hace falta la 5ª casilla que la llevaba: la estrella entra
     entera y capaEstrellas cobra mlim una sola vez.

     `C.sorteo` es determinista en las coordenadas: la misma estrella sale o no
     sale siempre igual. Cambiar de ocular NO la hace parpadear —a(m,r) no lleva
     aumentos dentro, MEDIDO a 61/120/173/250×: 0 parpadeos de 1971—. */
  function estrellasCumulo(pob, cumulo, tabla, o, C, radioImagenAs) {
    var cos0 = Math.cos(o.dec0 * Math.PI / 180);
    var lista = (o.estrellas || []).concat(pob.sinteticas({
      ra: cumulo.ra, dec: cumulo.dec, realization: o.realization
    }));
    var fuera = [];
    for (var i = 0; i < lista.length; i++) {
      var e = lista[i], m = e[2];
      var dxAs = (((e[0] - cumulo.ra + 540) % 360) - 180) * cos0 * 3600;
      var dyAs = (e[1] - cumulo.dec) * 3600;
      var rAs = pob.radioPropio(dxAs, dyAs);
      var mRes = mResEn(tabla, rAs);
      if (!isFinite(mRes)) { fuera.push(e); continue; }    // fuera del cúmulo: ni velo ni mezcla
      if (m > mRes) continue;                              // el cielo local no la levanta
      if (!(C.sorteo(e[0], e[1], o.realization) < pob.aCrowd(m, rAs, radioImagenAs))) continue;
      fuera.push(e);                                       // entera: sin m_eff, sin banda
    }
    return fuera;
  }

  /* La capa de galaxias desde imagen real (la ley PS1) vive en su propio
     módulo: resources/js/bitacora-ps1.js (window.BitacoraPS1, ADR 0020). */

  function dibujarAureola(ctx, x, y, radio, rgb, alpha) {
    var col = rgb[0] + ',' + rgb[1] + ',' + rgb[2];
    var gr = ctx.createRadialGradient(x, y, 0, x, y, radio);
    /* Antes 3 stops (0→0,9, 0,5→0,3, 1→0): lineal en TODO el radio, así que a
       r=0,8·radio todavía quedaba alfa≈0,12 (visible a simple vista) — por
       eso las estrellas muy brillantes se veían como un círculo grande casi
       sólido y sin apenas difuminado, en vez de un glare que se apaga rápido
       cerca del núcleo (ver captura del usuario, 2026-08-01). Se adelanta el
       pico y se acelera la caída: mismo brillo central, cola larga y tenue. */
    gr.addColorStop(0, 'rgba(' + col + ',0.9)');
    gr.addColorStop(0.15, 'rgba(' + col + ',0.4)');
    gr.addColorStop(0.35, 'rgba(' + col + ',0.1)');
    gr.addColorStop(1, 'rgba(' + col + ',0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, radio, 0, 7); ctx.fill();
  }

  /* ── Dibujo de las estrellas (tamaño = ctx.canvas.width, cuadrado) ── */
  function dibujar(ctx, estrellas, o) {
    // Estrellas que Gaia DR3 no trae (satura por arriba: Vega, Arturo, Rigel...)
    // se concatenan aquí, no en consultar() -esa alimenta también la capa
    // difusa, y meterle otro catálogo rompería su función de luminosidad-.
    // Sin solapamiento que arbitrar: el fichero solo trae lo que Gaia no trae.
    // Issue #130 (azarquiel/bitacoraestelar.app).
    estrellas = estrellas.concat(window.BITACORA_ESTRELLAS_BRILLANTES || []);
    var SIZE = ctx.canvas.width;
    var ra0 = o.ra, dec0 = o.dec, arcmin = o.arcmin, mlim = o.mlim;
    var conGlow = (o.conGlow !== false), objetoCarbono = !!o.carbono, arana = !!o.arana;
    var escv = SIZE / (arcmin / 60);
    var cos0 = Math.cos(dec0 * Math.PI / 180);
    function deltaRA(ra) { return ((ra - ra0 + 540) % 360) - 180; }
    var glow = spriteGlow();
    // Umbral de color relativo al límite de ESTE equipo/cielo, no una magnitud
    // absoluta: ver CFG.margenColorMag.
    var magColorEfectivo = mlim - CFG.margenColorMag;
    var idxCarbono = -1;
    if (objetoCarbono) {
      /* Bug (2026-08-01, SZ Sgr con "corazón blanco"): el catálogo de
         estrellas de carbono (Astronomical League) da RA/Dec redondeado al
         arcsec, así que en un campo con más de una estrella candidata dos
         pueden quedar a una distancia en píxeles casi idéntica por puro
         redondeo -aquí ganaba por 0,3" una vecina bastante más tenue-, y la
         real quedaba sin `esCarbono`, mostrando su color natural (más pálido)
         en vez del rojo intenso forzado. Con `o.carbonoMag` (magnitud del
         catálogo) disponible, dentro de una tolerancia de posición generosa
         se desempata por CERCANÍA DE MAGNITUD, mucho más discriminante entre
         candidatas próximas que un redondeo de coordenadas. Sin `carbonoMag`
         (llamadas antiguas), cae al criterio de siempre: la más cercana. */
      var TOL_ARCSEC = 30;
      var tolPx2 = Math.pow(TOL_ARCSEC * escv / 3600, 2);
      var mejorD2 = Infinity, mejorDMag = Infinity;
      for (var c = 0; c < estrellas.length; c++) {
        if (estrellas[c][2] >= magColorEfectivo) continue;
        var cx = SIZE / 2 - deltaRA(estrellas[c][0]) * cos0 * escv;
        var cy = SIZE / 2 - (estrellas[c][1] - dec0) * escv;
        var d2 = (cx - SIZE / 2) * (cx - SIZE / 2) + (cy - SIZE / 2) * (cy - SIZE / 2);
        if (o.carbonoMag != null) {
          if (d2 > tolPx2) continue;
          var dMag = Math.abs(estrellas[c][2] - o.carbonoMag);
          if (dMag < mejorDMag) { mejorDMag = dMag; idxCarbono = c; }
        } else if (d2 < mejorD2) { mejorD2 = d2; idxCarbono = c; }
      }
    }
    // Ganancia global del dibujo: la usa la capa de rango extendido para hacer
    // una segunda pasada atenuada que rescate los núcleos recortados.
    ganActual = (o.ganancia > 0) ? o.ganancia : 1;
    // Tamaños APARENTES: van con el campo aparente del ocular, no con el real.
    var escala = escalaEstrellas(o.afov, SIZE);
    // El glow de las que no llegan a la magnitud límite se queda en el suelo
    // aparente: representa estrellas que NO se resuelven, así que darles el tamaño
    // físico de una resuelta sería contarlas dos veces.
    var Rg = CFG.glowRadio * escala;
    var spikesOn = conGlow && arana;
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < estrellas.length; i++) {
      var ra = estrellas[i][0], dec = estrellas[i][1], g = estrellas[i][2], bprp = estrellas[i][3];
      /* Magnitud con la que se DECIDE si la estrella se ve, separada de la que
         se DIBUJA. Solo difieren en la banda de transición de un globular, que
         entrega su m original en la 5ª casilla (ver estrellasCumulo): esa
         estrella ya pasó el umbral del cielo una vez y no puede volver a
         juzgarse con la magnitud atenuada que la propia atenuación produce. */
      var gDet = (estrellas[i][4] != null) ? estrellas[i][4] : g;
      if (gDet > mlim && !conGlow) continue;
      var x = SIZE / 2 - deltaRA(ra) * cos0 * escv;
      var y = SIZE / 2 - (dec - dec0) * escv;
      if (x < -3 || y < -3 || x > SIZE + 3 || y > SIZE + 3) continue;
      if (gDet > mlim) {
        // Ancla en alfaMin (el suelo de la rama resuelta) para que el cruce en
        // g=mlim sea continuo: nada de "aparecer" más brillante al cruzar.
        var aGlow = CFG.alfaMin * Math.pow(10, -0.4 * (g - mlim));
        if (aGlow < CFG.glowCorte) continue;
        ctx.globalAlpha = Math.min(1, aGlow) * ganActual;
        ctx.drawImage(glow, x - Rg, y - Rg, Rg * 2, Rg * 2);
        continue;
      }
      // Halo (blur) según el brillo ABSOLUTO -ver blurEstrella()-, no relativo
      // al límite: una estrella tenue sale pinpoint da igual lo profundo que
      // llegue el equipo.
      var blurG = blurEstrella(g, o.apertura);
      /* Aquí vivía la amortiguación puntual de las estrellas de dentro de un
         globular (comparaba mu(r) del halo de King con la magnitud de la
         estrella y forzaba blur y aureola a cero en el núcleo). Se eliminó con
         el halo continuo en la Fase 0: sin halo no hay fondo contra el que
         comparar. Su papel lo hace la banda de transición del nuevo modelo,
         que atenúa por magnitud efectiva (simulador_ocular/docs/adr/0002). */
      // Tamaño = imagen estelar física (Airy + seeing, que crece con el aumento y
      // se aprieta con la apertura) en cuadratura con el suelo de visibilidad.
      var oRadio = { afov: o.afov, apertura: o.apertura, arcmin: arcmin, size: SIZE, sep: o.sep, g: g, blur: blurG, mlim: mlim };
      var Rtot = radioEstrella(oRadio);
      var dilucion = factorDilucion(sueloEstrella(oRadio), Rtot);
      var esCarbono = (i === idxCarbono);
      var colEstrella = ((g < magColorEfectivo && bprp != null) || esCarbono)
        ? colorEstrella(bprp, esCarbono, g, o.apertura) : [255, 255, 255];
      // Aureola de dispersión (glare): debajo del disco, se apaga sola en las
      // tenues -ver alfaAureola()-. Teñida con el color de la propia estrella
      // -antes un sprite blanco fijo-: en las pocas realmente brillantes (las
      // únicas con aureola apreciable) esa aureola blanca se sumaba ADITIVA
      // ('lighter') al disco de color y lo lavaba hacia blanco -justo las
      // estrellas donde más se nota el color real (p. ej. las B/A de M39)-.
      var aAur = alfaAureola(g, o.apertura);
      if (aAur > 0.004) {
        var Ra = CFG.aureolaRadio * escala;
        dibujarAureola(ctx, x, y, Ra, colEstrella, aAur * ganActual);
      }
      ctx.globalAlpha = alfaEstrella(g, mlim, Rtot * arcmin * 60 / SIZE, dilucion) * ganActual;
      dibujarEstrellaColor(ctx, x, y, Rtot, colEstrella, blurG, esCarbono);
      if (spikesOn && g < CFG.spikes.magMax) dibujarSpikes(ctx, x, y, g, escala, colEstrella);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ═══════════ CAPA DE ESTRELLAS EN RANGO EXTENDIDO ═══════════════════════════
     Las estrellas se dibujan sumando sprites con 'lighter' sobre un lienzo de 8
     bits. En el núcleo de un cúmulo se solapan cientos y la suma se RECORTA a
     255: ahí se pierde la información, y ningún posprocesado la recupera porque
     el recorte ya ocurrió al dibujar. Por eso un globular a pocos aumentos salía
     como una mancha blanca sin estrellas distinguibles.

     Dos pasadas sobre el mismo dibujo:
       · ganancia 1 conserva lo tenue (el glow de las no resueltas baja a α≈0,004);
       · ganancia reducida rescata solo donde la primera satura.
     El empalme se hace con una transición suave, para que no se vea la costura.

     Devuelve valores de pantalla (0..255·1/ganancia) por canal RGB, que pintarFot
     convierte a flujo y mapea junto con las capas difusas. */
  var TONO = {
    ganancia: 1 / 16,   // 4 pasos de margen sobre el recorte
    desde: 230, hasta: 252   // banda donde se cruza de la pasada alta a la baja
  };

  function lienzoEstrellas(estrellas, o, SIZE, ganancia) {
    var c = document.createElement('canvas'); c.width = c.height = SIZE;
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SIZE, SIZE);
    var op = { ganancia: ganancia };
    for (var kk in o) if (Object.prototype.hasOwnProperty.call(o, kk)) op[kk] = o[kk];
    op.ganancia = ganancia;
    dibujar(ctx, estrellas, op);
    return ctx.getImageData(0, 0, SIZE, SIZE).data;
  }

  function capaEstrellas(estrellas, o, SIZE) {
    var alta = lienzoEstrellas(estrellas, o, SIZE, 1);
    var n = SIZE * SIZE, out = new Float32Array(n * 3);
    if (!CFG.hdrRescate) {
      // Sin el truco HDR: una sola pasada, se copia tal cual (sin blend).
      for (var j0 = 0; j0 < n; j0++) {
        var p0 = j0 * 4;
        out[j0 * 3] = alta[p0]; out[j0 * 3 + 1] = alta[p0 + 1]; out[j0 * 3 + 2] = alta[p0 + 2];
      }
      return out;
    }
    var baja = lienzoEstrellas(estrellas, o, SIZE, TONO.ganancia);
    var inv = 1 / TONO.ganancia;
    for (var j = 0; j < n; j++) {
      // El cruce se decide por el canal más alto: si uno satura, el píxel está
      // recortado aunque los otros no, y hay que rescatar los tres a la vez para
      // no torcer el color.
      var p = j * 4;
      var pico = Math.max(alta[p], Math.max(alta[p + 1], alta[p + 2]));
      var t = suave((pico - TONO.desde) / (TONO.hasta - TONO.desde));
      for (var ch = 0; ch < 3; ch++) {
        out[j * 3 + ch] = alta[p + ch] * (1 - t) + baja[p + ch] * inv * t;
      }
    }
    return out;
  }

  /* ── La vista de Gaia: el pipeline completo del Canvas-2D ──
     Módulo hondo dueño del ORDEN de la cadena: fondo → consulta → velo →
     magnitud límite → cúmulo → capa de estrellas → pintado fotométrico → capa
     de galaxias. Los dos llamadores (render() del formulario y el simulador de
     oculares) no conocen la secuencia: pasan DATOS y reciben resultado.

     Interfaz (campos planos, el idioma de magLimite/nivelFondo):
       ctx  contexto 2D ya dimensionado (size × size)
       o    { ra, dec, arcmin, size, apertura, aumentos, transmision|optica,
              arana, sqm, pupilaSalida, pupilaOjo, afov, conGlow,
              carbono, carbonoMag, cumulo, catalogo, vivo }
     Devuelve una promesa de:
       { estrellas, estrellasDibujo, mlim, fondo, avisoCampo, galaxias }
     `galaxias` es LA PROMESA de la capa PS1 ({aviso}): el formulario la espera
     (la imagen que sube debe llevar la galaxia) y el simulador pinta estrellas
     ya y engancha el aviso cuando llegue. Nunca rechaza.
     Con `vivo()` falso resuelve { cancelada: true } sin volver a tocar el ctx:
     cancelar NO es un error — el rechazo de esta promesa significa «Gaia no
     responde» y en el simulador dispara el respaldo DSS.
     El cúmulo entra como DATO ya preparado (la ficha física del catálogo):
     aquí no se lee nada de bitacora-cumulos.js (ADR 0002 del simulador).
     Dependencias implícitas, documentadas: los catálogos de datos cargados por
     <script defer> — BITACORA_ESTRELLAS_BRILLANTES (lo concatena dibujar()) y
     BITACORA_GALAXIAS/BITACORA_NEBULOSAS (catálogo difuso por defecto de
     ps1CapaGalaxias). Las dos páginas los cargan igual. */
  function vistaGaia(ctx, o) {
    var SIZE = o.size || ctx.canvas.width;
    var vivo = o.vivo || function () { return true; };
    var t = (o.transmision > 0) ? o.transmision : (transmisionOptica(o.optica) || TRANSMISION_DEFECTO);
    var arana = (typeof o.arana === 'boolean') ? o.arana : opticaTieneArana(o.optica);
    function limite(veloSB) {
      return magLimite({
        apertura: o.apertura, aumentos: o.aumentos, transmision: t,
        sqm: o.sqm, pupilaOjo: o.pupilaOjo, veloSB: veloSB
      });
    }
    var cielo = {
      pupilaSalida: o.pupilaSalida, pupilaOjo: o.pupilaOjo, sqm: o.sqm, transmision: t,
      aumentos: o.aumentos, perceptual: true   // el Canvas-2D produce flujo calibrado, no luma heurística
    };
    var fondo = nivelFondo(cielo);
    ctx.fillStyle = 'rgb(' + fondo + ',' + fondo + ',' + fondo + ')';
    ctx.fillRect(0, 0, SIZE, SIZE);
    var mlim = limite();
    var P = window.BitacoraPS1;
    if (!P) throw new Error('BitacoraGaiaRender necesita BitacoraPS1 (capa de galaxias desde imagen); carga bitacora-ps1.js');
    return consultar(o.ra, o.dec, o.arcmin, profundidadConsulta(o.apertura, t, o.aumentos, true)).then(function (estrellas) {
      if (!vivo()) return { cancelada: true };
      /* Campo denso: la banda truncada llega como momentos y entra como velo
         (cielo extra) en toda la cadena, incluida la magnitud límite (ADR
         0014): un fondo más brillante también quita estrellas del límite. */
      var velo = veloSB(estrellas.fondo);
      if (velo != null) {
        cielo.veloSB = velo;
        mlim = limite(velo);
        fondo = nivelFondo(cielo);
      }
      /* Aviso del catálogo agotado: si el TOP de la consulta se quedó antes de
         la magnitud límite del equipo, faltan estrellas que SÍ se verían.
         Texto redactado aquí (fuente única con el formulario); cada pantalla
         decide dónde pintarlo y con qué prioridad. */
      var avisoCampo = '';
      var mcorte = -Infinity;
      for (var e = 0; e < estrellas.length; e++) if (estrellas[e][2] > mcorte) mcorte = estrellas[e][2];
      if (mlim != null && isFinite(mcorte) && mcorte < mlim - 0.1) {
        avisoCampo = velo != null
          ? 'Campo muy rico: por debajo de magnitud ' + mcorte.toFixed(1) + ' las estrellas no se dibujan una a una; su luz entra como resplandor de fondo.'
          : 'Campo muy rico: el catálogo se agotó en magnitud ' + mcorte.toFixed(1) +
            ', por debajo de la límite de tu equipo (' + mlim.toFixed(1) + '). Faltan las más débiles; reduce el campo para verlas.';
      }
      /* Componente difusa del campo: la llenan las capas que la tengan (el
         campo no resuelto de un cúmulo, la imagen de una galaxia). Sin ninguna
         queda a cero y las estrellas van sobre el nivel de cielo tal cual. */
      var difuso = new Float32Array(SIZE * SIZE);
      var estrellasDibujo = estrellas;
      /* Cúmulo globular: lo que el equipo NO resuelve se pinta como campo
         estadístico (media + grano de la función de luminosidad) y lo que sí,
         como estrellas — las de Gaia más las sintéticas que el catálogo no
         trae en el núcleo aglomerado. */
      var cum = o.cumulo
        ? pintarCumulo(difuso, o.cumulo, {
            ra0: o.ra, dec0: o.dec, arcmin: o.arcmin, size: SIZE,
            cielo: cielo, apertura: o.apertura, estrellas: estrellasDibujo
          })
        : null;
      if (cum) estrellasDibujo = cum.estrellas;
      /* Campo ordinario: la banda que ni el glow ni el veloSB representan se
         conserva como niebla (ADR 0022). Con cúmulo no: S1campo ya la lleva. */
      var thNiebla = 0;
      if (!cum) {
        var opNiebla = {
          ra0: o.ra, dec0: o.dec, arcmin: o.arcmin, size: SIZE, mlim: mlim, cielo: cielo
        };
        nieblaCampo(difuso, estrellas, opNiebla);
        /* La niebla es la única capa difusa sin máscara propia, así que su
           escala tiene que viajar hasta pintarFot o su umbral cae en C_MAG
           (bug H1, ADR 0023). La escribe nieblaCampo en la misma pasada que
           deposita el flujo. Con cúmulo se queda en 0: el halo trae su
           desvanecido hecho y marca difusoMask. */
        thNiebla = opNiebla.thetaJuicioArcmin || 0;
      }
      var opEst = {
        ra: o.ra, dec: o.dec, arcmin: o.arcmin, mlim: mlim, afov: o.afov,
        apertura: o.apertura,   // el disco de Airy va como 1/D
        conGlow: (o.conGlow !== false), carbono: !!o.carbono,
        carbonoMag: (o.carbono && o.carbonoMag != null) ? o.carbonoMag : null,
        arana: arana
      };
      var capaEst = capaEstrellas(estrellasDibujo, opEst, SIZE);
      pintarFot(difuso, ctx, cielo, capaEst, thNiebla);
      var galaxias = P.ps1CapaGalaxias(difuso, ctx, cielo, capaEst, {
        ra0: o.ra, dec0: o.dec, arcmin: o.arcmin, size: SIZE,
        estrellas: estrellas, estrellasDibujo: estrellasDibujo, opEstrellas: opEst,
        catalogo: o.catalogo || null,
        apertura: o.apertura,   // la PSF del parche va como 1/D, igual que el disco de Airy
        mlim: mlim,             // profundidad del grano del parche dentro de la escena (#210)
        vivo: vivo
      });
      return { estrellas: estrellas, estrellasDibujo: estrellasDibujo, mlim: mlim,
               fondo: fondo, avisoCampo: avisoCampo, galaxias: galaxias };
    });
  }

  /* ── Entrada de alto nivel del formulario: envoltorio de vistaGaia que
     ESPERA la capa de galaxias — la imagen que el formulario sube es la que se
     ve, y si resolviera antes de llegar el parche subiría el campo sin la
     galaxia. Si el parche no llega, resuelve igual (la capa nunca rechaza). ── */
  function render(canvas, o) {
    return vistaGaia(canvas.getContext('2d'), {
      ra: o.ra, dec: o.dec, arcmin: o.arcmin, size: canvas.width,
      apertura: o.apertura, aumentos: o.aumentos, transmision: o.transmision,
      optica: o.optica, arana: o.arana, sqm: o.sqm,
      pupilaSalida: o.pupilaSalida, pupilaOjo: o.pupilaOjo, afov: o.afov,
      conGlow: o.conGlow, carbono: o.carbono, carbonoMag: o.carbonoMag
    }).then(function (r) {
      if (r.cancelada) return r;
      return r.galaxias.then(function (capa) {
        return { estrellas: r.estrellas, mlim: r.mlim, fondo: r.fondo,
                 aviso: capa.aviso, avisoCampo: r.avisoCampo };
      });
    });
  }

  /* ── Entrada de alto nivel: la MISMA vista, pero con la placa del DSS ──
     El gemelo fotográfico de render(): en vez de dibujar las estrellas de Gaia
     sobre el fondo de cielo, pinta la placa del DSS pasada por la cadena
     fotométrica (fusión HDR de la profunda con la corta → flujo → pintarFot) y
     realza encima las estrellas brillantes de Gaia, igual que la vista DSS del
     simulador. Las nebulosas oscuras (los Barnard) y la nebulosidad tenue salen
     mucho mejor así: es una foto de verdad, no un catálogo de puntos.

     Devuelve Promise<{fuente}>: 'skyview' (norte arriba) o 'eso' (la misma
     placa, algo girada) si SkyView no respondió. Rechaza si no hay placa o si
     el navegador bloquea la lectura de píxeles. */
  function renderPlaca(canvas, o) {
    var SIZE = canvas.width;
    var ctx = canvas.getContext('2d');
    var t = (o.transmision > 0) ? o.transmision : (transmisionOptica(o.optica) || TRANSMISION_DEFECTO);
    var arana = (typeof o.arana === 'boolean') ? o.arana : opticaTieneArana(o.optica);
    var arcmin = acotarPlaca(o.arcmin);
    var cielo = {
      pupilaSalida: o.pupilaSalida, pupilaOjo: o.pupilaOjo, sqm: o.sqm,
      transmision: t, aumentos: o.aumentos
    };
    function pedir(fuente) {
      function url(survey) {
        return urlPlaca({ base: o.dssProxy, survey: survey, ra: o.ra, dec: o.dec, arcmin: arcmin, fuente: fuente });
      }
      return Promise.all([cargarPlaca(url('DSS2-red')), cargarPlaca(url('DSS1'))]).then(function (res) {
        var profunda = res[0], corta = res[1];
        if (!profunda && !corta) {
          // SkyView caído: se reintenta UNA vez con el archivo del ESO, que es la
          // misma placa girada respecto al norte. Antes eso que un círculo negro.
          if (fuente === 'skyview') return pedir('eso');
          throw new Error('sin placa');
        }
        var v = lumasDePlaca(profunda || corta, SIZE);
        if (!v) throw new Error('cors');
        if (profunda && corta) {
          var vs = lumasDePlaca(corta, SIZE);
          if (vs) v = fusionarPlacas(v, vs);
        }
        pintarFot(flujoDePlaca(v, false), ctx, cielo);
        return { fuente: fuente };
      });
    }
    return pedir(o.fuente || 'skyview').then(function (r) {
      // Realce de las brillantes con Gaia: la placa las quema y pierde su color.
      // El límite es mucho más brillante que la magnitud límite del equipo (que
      // sí manda en la vista de Gaia): aquí el campo débil ya lo trae la placa.
      /* urlPlaca acepta ra/dec en sexagesimal (texto); consultar() hace
         ra0.toFixed(3) y con texto lanza un TypeError DENTRO del .then, donde
         el respaldo de abajo ya no lo atrapa: la placa quedaba pintada y aun
         así renderPlaca rechazaba. Sin coordenadas numéricas no hay realce,
         que es justo lo que el respaldo haría con la consulta caída. */
      if (o.conGaia === false || !(o.apertura > 0)) return r;
      if (typeof o.ra !== 'number' || typeof o.dec !== 'number') return r;
      var mlim = 7.7 + 5 * Math.log10(o.apertura / 100);
      return consultar(o.ra, o.dec, arcmin, profundidadConsulta(o.apertura, t, o.aumentos, false)).then(function (estrellas) {
        dibujar(ctx, estrellas, {
          ra: o.ra, dec: o.dec, arcmin: arcmin, mlim: mlim, afov: o.afov,
          apertura: o.apertura, conGlow: false,
          carbono: !!o.carbono, carbonoMag: o.carbonoMag, arana: arana
        });
        return r;
      }, function () { return r; });   // sin Gaia se queda la placa, que ya vale
    });
  }

  window.BitacoraGaiaRender = {
    config: CFG,
    fot: FOT,
    consultar: consultar,
    precalentar: precalentar,
    profundidadConsulta: profundidadConsulta,
    cacheGaia: cacheGaia,
    dibujar: dibujar,
    vistaGaia: vistaGaia,
    render: render,
    magLimite: magLimite,
    veloSB: veloSB,
    nieblaCampo: nieblaCampo,
    sumaSB: sumaSB,
    magConsultaGaia: magConsultaGaia,
    nivelFondo: nivelFondo,
    tamLienzo: tamLienzo,
    capaEstrellas: capaEstrellas,
    escalaEstrellas: escalaEstrellas,
    radioAiry: radioAiry,
    radioImagenEstelar: radioImagenEstelar,
    radioEstrella: radioEstrella,
    sueloEstrella: sueloEstrella,
    factorDilucion: factorDilucion,
    alfaEstrella: alfaEstrella,
    alfaAureola: alfaAureola,
    blurEstrella: blurEstrella,
    colorEstrella: colorEstrella,
    orientacionAsumida: orientacionAsumida,
    valorDeFlujo: valorDeFlujo,
    flujoDeValor: flujoDeValor,
    realzarPerceptual: realzarPerceptual,
    visibilidadDifusa: visibilidadDifusa,
    difusoMarcado: difusoMarcado,
    difusoMaskDe: difusoMaskDe,
    ctxFotometrico: ctxFotometrico,
    thetaRiccoArcmin: thetaRiccoArcmin, thetaNieblaArcmin: thetaNieblaArcmin,
    textura: TEXTURA,
    frecuenciaGranoCdeg: frecuenciaGranoCdeg,
    csfTextura: csfTextura,
    dPrimeTextura: dPrimeTextura,
    pVerTextura: pVerTextura,
    pintarFot: pintarFot,
    perfilKing: perfilKing,
    areaKing: areaKing,
    pintarCumulo: pintarCumulo,
    granoEn: granoEn,
    desenfocar: desenfocar,
    fusionarPlacas: fusionarPlacas,
    rellenarNucleo: rellenarNucleo,
    repararNucleos: repararNucleos,
    flujoDePlaca: flujoDePlaca,
    realceDetalle: realceDetalle,
    transmisionOptica: transmisionOptica,
    opticaTieneArana: opticaTieneArana,
    urlPlaca: urlPlaca,
    cargarPlaca: cargarPlaca,
    renderPlaca: renderPlaca,
    sbUmbralContraste: sbUmbralContraste,
    dssMaxArcmin: DSS_MAX_ARCMIN,
    set dssProxyUrl(u) { DSS_PROXY_URL = u; },
    get dssProxyUrl() { return DSS_PROXY_URL; }
  };
})();
