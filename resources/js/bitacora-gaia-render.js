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
 *   BitacoraGaiaRender.dibujar(ctx, estrellas, opts)   (dibujo puro, sin fondo ni query)
 *   BitacoraGaiaRender.magLimite({ apertura, aumentos, transmision, sqm }) → number|null
 *   BitacoraGaiaRender.magConsultaGaia(apertura, transmision, aumentos) → number (profundidad de consulta)
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
    if (!(a > 0)) return vd;
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

  function pintarFot(Fobj, ctx, o, estrellas) {
    var SIZE = ctx.canvas.width, n = Fobj.length;
    var c = ctxFotometrico(o);
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
    radioSueloMag: 40,      // escala del término extra sobre el flujo relativo, elevado a radioSueloExp
    radioSueloExp: 0.5,
    radioSueloMax: 8.0,    // tope de seguridad; en la práctica solo lo tocan objetos extremos (Venus, la Luna...)
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
    spikes: {
      magMax: 10, rango: 5, brazos: 4, angulo: 0,
      longMag: 10, longMax: 180, grosor: 3, lobulos: 2, intensidad: 0.8
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
  function consultar(ra0, dec0, arcmin, mag) {
    var rad = radioConsulta(arcmin || GAIA_ARCMIN_DEFECTO);
    var prof = (mag > 0) ? mag : GAIA_MAG_DEFECTO;
    var clave = ra0.toFixed(3) + ',' + dec0.toFixed(3);
    var ent = cacheGaia[clave];
    // Reutiliza el caché solo si YA cubre el radio Y la profundidad pedidos:
    // sin el segundo chequeo, cambiar a un equipo más grande sobre el mismo
    // objeto se quedaba con el catálogo más somero que trajo el equipo chico.
    if (ent && ent.rad >= rad - 1e-6 && ent.mag >= prof - 1e-6) return ent.promise;
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
        var t = (y - m) / m, a = along * Math.exp(-(t * t) * 10), idx = (y * W + x) * 4;
        im.data[idx] = im.data[idx + 1] = im.data[idx + 2] = 255;
        im.data[idx + 3] = Math.round(255 * Math.max(0, Math.min(1, a)));
      }
    }
    ctx.putImageData(im, 0, 0);
    return (SPIKE_SPRITE = c);
  }
  function spriteSpikeColor(rgb) {
    if (!rgb) return spriteSpike();
    var r = Math.round(rgb[0]), gc = Math.round(rgb[1]), b = Math.round(rgb[2]), key = r + ',' + gc + ',' + b;
    if (SPIKE_TINT[key]) return SPIKE_TINT[key];
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
    // Como el radio: el tope, sobre la longitud nominal; la escala, después.
    var L = Math.min(cf.longMax, cf.longMag * sobre) * escala;
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
  function granoTablaCelda(semilla, cell) {
    var clave = semilla + '_' + cell;
    var tabla = GRANO_CACHE.get(clave);
    if (tabla) return tabla;
    tabla = new Map();
    GRANO_CACHE.set(clave, tabla);
    return tabla;
  }
  function granoCelda(tabla, semilla, i, j, cell) {
    var claveInterna = (i + 32768) * 65536 + (j + 32768);
    var impulsos = tabla.get(claveInterna);
    if (impulsos) return impulsos;
    var n = granoCeldaN(semilla, i, j);
    impulsos = new Array(n);
    for (var k = 0; k < n; k++) {
      var pos = granoImpPos(semilla, i, j, k);
      impulsos[k] = { x: (i + pos[0]) * cell, y: (j + pos[1]) * cell, w: granoImpPeso(semilla, i, j, k) };
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
        for (var k = 0; k < impulsos.length; k++) {
          var imp = impulsos[k];
          var dx = (xAs - imp.x) / bw, dy = (yAs - imp.y) / bw, d2 = dx * dx + dy * dy;
          if (d2 > GRANO_RADIO * GRANO_RADIO) continue;
          var c = Math.exp(-0.5 * d2);
          suma += imp.w * c;
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
       repetir el cálculo en dos pasadas da el mismo campo, sin guardarlo. */
    var nAnillos = tabla.r.length, factorAnillo = null;
    function kAnillo(rAs) { return Math.min(nAnillos - 1, Math.floor(rAs / tabla.paso)); }
    if (renormGrano) {
      var sumObjetivo = new Float64Array(nAnillos), sumRecorte = new Float64Array(nAnillos);
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
        var crudo = campoLognormal(Math.log(Im) - sLn * sLn / 2, sLn,
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

  /* ═══════════ CAPA DE GALAXIAS DESDE IMAGEN REAL (ps1cutouts, STScI) ═══════════
     Una galaxia del RC3 se pinta con SU PROPIA imagen de PanSTARRS-1 en vez de con
     un perfil sintético: un parche por objeto que entra en el mismo Float32Array
     `difuso` que ya usa el halo de los globulares, y sale por pintarFot debajo de
     las estrellas de Gaia.

     Tres cosas hay que saber para leer lo que sigue (detalle y medidas en
     .scratch/difusas-desde-imagen/, fichas 03 y 10):

      · **El nivel absoluto lo pone el CATÁLOGO, no la imagen.** El `ZPT` de la
        cabecera existe, pero a μ≈24 el residuo de cielo del stack desplaza el
        brillo superficial más que cualquier error de punto cero. Así que se resta
        cielo, se integra y se reescala a la mag V del RC3: la imagen aporta la
        forma y el contraste interno; el catálogo, la luz.
      · **fitscut sirve UNA skycell (~26′), no un mosaico.** Fuera de ella devuelve
        NaN. Un parche que cruza el borde —le pasa a ~40 % de los objetos— se cose
        pidiendo el MISMO recorte a cada skycell que toque y quedándose con el
        píxel válido. Eso lo hace `ps1-proxy.php`, que entrega el parche ya
        cosido en una sola petición; aquí solo se lee. No hay que reproyectar:
        llega sobre la rejilla pedida.
      · **Resolver skycells, armar la URL de fitscut y exigir `wcs=1` es cosa del
        proxy** (test: `scripts/test_ps1_proxy.php`). Sin `wcs=1`, x/y se leen
        como coordenadas de PÍXEL y el servicio responde 200 OK con un recorte de
        otro sitio, sin error y sin aviso. */
  var PS1 = {
    banda: 'g',            // la más cercana al pico escotópico (507 nm) y la más profunda del 3π
    /* px del parche que se pide al proxy (él remuestrea y corrige la WCS). A 512
       la escala salía a lado/512 —2,35″/px en una galaxia de 20′— y a esa escala
       la PSF del telescopio (ps1PsfParche) es literalmente la identidad: con
       σ = 0,14 px el kernel gaussiano en float32 sale [8e-12, 1, 8e-12], así que
       un 457 y un 914 mm daban la MISMA imagen, bit a bit. A 1024 la diferencia
       entre esos dos aparece a 1–3 σ del ruido de cielo, 213× el suelo de
       sensibilidad del método. Es el tope del proxy (PS1_SALIDA_MAX, ps1-proxy.php:46);
       llegar a 0,67″/px en una galaxia de 20′ pediría 1794 px, y son otros 12 MB. */
    salida: 1024,
    ladoFactor: 6,         // lado del parche = 6·r_e → radio 3·r_e ≈ 94 % de la luz de un disco
    ladoMax: 20,           // ′: por encima, el parche se sale de la skycell casi seguro
    ladoMin: 1.5,          // ′: por debajo no queda parche que mirar
    decMin: -30,           // PS1 no cubre más al sur (365 de las 1295 filas del RC3)
    fracMin: 0.4,          // fracción mínima de la luz del catálogo que el parche debe abarcar (ver ps1GalaxiasDelCampo)
    seeingAs: 1.1,         // ″: FWHM típica del stack, suelo del radio de máscara
    mascaraMaxAs: 60,      // ″: tope del radio de máscara de una estrella (una de g≈9 ya lo toca)
    mascaraMagRef: 22,     // mag G a la que el radio de máscara es el seeing (≈ el fondo del stack; ver ps1RadioMascaraAs)
    mascaraProf: 20,       // mag G hasta la que se piden estrellas para la máscara (tope del proxy)
    rellenoPlanoMaxAs: 40, // ″: hasta este radio la máscara se rellena con el fondo local; por encima se deja al cielo (ver ps1QuitarEstrellas)
    muEscena: 25,          // mag/arcsec²: isofota que delimita la escena difusa protegida (ver ps1EscenaEnParche)
    realceMax: 2,          // techo del realce perceptual mientras haya parche de imagen (ver realzarPerceptual)
    kRuido: 1.5,           // σ del borde por debajo de las cuales no hay galaxia (ver ps1AnclarACatalogo)
    /* σ por debajo del CIELO a partir de las cuales el píxel no es ruido sino
       sobresustracción del stack (el fondo restado por skycell se comió señal:
       M51 tenía el 27,6 % del anillo 60–160″ así, con DN negativos, y salía un
       foso negro pegado a los brazos). Ese píxel no vale 0 —un 0 es una medida—
       sino AUSENCIA (NaN), la misma que los huecos de estrellas saturadas, y el
       pintado lo rellena con (1−w)·perfil. k=2 está en la meseta medida k=1–3
       (los observables varían <3 %): por encima de 2σ bajo el cielo ya no hay
       ruido que confundir. Medido en .scratch/diagnostico-oscuros/INFORME2.md. */
    kAusencia: 2,
    /* Halo extrapolado: hasta qué brillo superficial (mag/arcsec²) se sigue el
       perfil del catálogo donde la imagen ya no trae señal. El stack de PS1 se
       acaba cerca de μ≈25, pero la luz del disco sigue ahí: 28,5 es el suelo
       habitual de la fotometría profunda de halos. */
    muHalo: 28.5,
    /* Umbral de contraste (Blackwell/Clark): magnitudes de brillo superficial
       por encima del UMBRAL DE DETECCIÓN (sbUmbralContraste, o sea Fcielo·Cmin)
       a las que la galaxia se pinta entera. Por debajo de deltaMin es
       indetectable y no se pinta.
       El Δ se medía antes contra SBe —el cielo ya atenuado por la pupila—
       mientras el brillo del objeto NO llevaba esa atenuación. Eso metía un
       término 2,5·log10(1/dim) en el contraste que, a igual aumento, restaba
       1,76 mag al pasar de 8″ a 18″: más apertura pintaba MENOS galaxia. La
       física es la contraria: el objeto se apaga igual que el cielo y el Δ real
       no cambia; lo que cambia es el UMBRAL, por luminancia retinal y por
       tamaño aparente, y las dos ya viven en Cmin (FOT.C_EXP y FOT.C_MAG_*).
       deltaPlena era 3,25, heredado de cuando el Δ se medía contra SBe y valía
       ~2 mag más. Medido contra el umbral, 3,25 pide 20× el contraste umbral
       para pintar la galaxia entera y la dejaba translúcida en todo el cuerpo.
       2,5 mag = 10× el contraste umbral, que es donde Blackwell deja de ver el
       objeto «al límite» y lo ve de forma franca. Con eso el disco de M81 a un
       radio efectivo sale a opacidad 0,61 en un 8" y plena en un 18": la
       apertura se nota justo donde tiene que notarse, en el cuerpo débil.
       Medido en scripts/barrido_deltaplena.js.
       deltaExp era 1,8 y ese exponente era el AMPLIFICADOR del contraste: la
       rampa convierte un cociente de contrastes en (Δ1/Δ2)^exp, así que el
       interbrazo real de M81 (μ22,45, Δ=0,55) contra su brazo (μ20,6, Δ=2,40)
       pasaba de ×5 en la imagen a ×14 en pantalla — una envolvente negra que
       la imagen no trae. Con 1,0 queda en ×4,3, pegado al contraste real, y el
       brazo no se toca (op 0,95). La rejilla deltaPlena 2,5/4/6 × deltaExp
       1,0/1,8 está medida en .scratch/diagnostico-oscuros/INFORME2.md: subir
       deltaPlena NO arregla el foso, solo apaga los brazos. */
    deltaMin: 0.0, deltaPlena: 2.5, deltaExp: 1.0,
    /* Condiciones de activación del halo (ver ps1HaloActivo): eje menor mínimo
       de la isofota 25, en ′, y brillo superficial medio a partir del cual la
       galaxia se considera difusa. El 22,25 sale de la separación natural de
       los datos de prueba (M82 22,11 contra M51 22,39); si algún día a25/b25
       dejan de reconstruirse y vienen del D25 del RC3, se reajusta aquí. */
    haloMenorMin: 1.5, haloMuFijo: 22.25,
    /* Mezcla de imagen y perfil (ver ps1PesoImagen). `mezclaCajaAs` es el lado
       de la vecindad donde se mide cuánta información trae la imagen y
       `mezclaW0` la fracción a partir de la cual la imagen manda del todo.
       Medido en M51 (13-ago-2026): la caja mueve poco la fotometría y bastante
       el detalle (contraste azimutal 2,18 con 6″ contra 1,42 con 100″); la
       perilla que manda es w0. Con 0,5 los brazos, el puente y el polvo
       destacan y el borde del parche no se ve; con 0,2 el detalle sube pero
       asoma el CUADRADO del parche, porque el peso satura hasta el mismo
       borde. */
    mezclaCajaAs: 25, mezclaW0: 0.5,
    // Índice de Sérsic: ya NO decide (ver ps1HaloActivo), pero el tope se queda
    // por si vuelve a hacer falta con ps1ConcentracionN.
    haloSersicMax: 2.5,
    /* EXPERIMENTAL, apagada: reposición de flujo en el vecino ausente
       (ver ps1ReponerNaN). Apagada, el render es bit a bit el de siempre. */
    confianzaLocalNaN: false,
    /* APAGADA. Encendida, dentro de la escena difusa ya detectada
       (ps1EscenaEnParche) la rampa de opacidad no volvía a decidir —es la ley
       de DETECCIÓN, y aplicada píxel a píxel dentro del objeto esculpía
       estructura interna que no está en los datos: el anillo negro de M81, el
       negro entre los brazos de M51—, pero al forzar op = 1 en TODA la elipse
       hacía otra cosa que no es protección: resucitaba el fondo sub-umbral de
       dentro y lo pintaba. En M101 a 190× eran 380 160 px del lienzo que
       estaban a nivel de cielo, o sea la elipse entera vista como una gran
       envolvente circular de fondo alrededor de la galaxia
       (scripts/vistas_opacidad_escena.js).
       La escena puede PROTEGER de un oscurecimiento artificial, pero no puede
       APORTAR señal, y una condición geométrica uniforme sobre la elipse no
       sabe distinguir las dos cosas: cualquier suelo de opacidad constante
       dentro de μ=25 vuelve a dibujar la elipse. Se probó la variante que solo
       sube la opacidad PARCIAL y deja en cero lo que la rampa apaga (nada de
       resucitar): quita el 97,7 % de la envolvente de M101, pero aplana el
       cuerpo en mesetas de opacidad 1 con contorno duro —M81 sale posterizada,
       como un mapa de curvas de nivel—. Una protección que no dibuje geometría
       tiene que mirar el entorno del píxel, no la elipse; queda pendiente.
       El sitio donde la escena SÍ manda sigue siendo ps1QuitarEstrellas. */
    opacidadInternaEscena: false,
    /* Apagado a propósito, no diagnóstico: el óvalo del Sérsic más allá de la
       isofota 25 (y el relleno de perfil dentro del parche) se descartó por
       resultado —el usuario prefiere el render sin él—. ps1HaloActivo queda
       siempre false. Las funciones que lo alimentan (ps1PesoImagen,
       ps1EscalaMezcla, ps1FlujoModelo, ps1PerfilEnParche, ps1MedidasHalo...)
       se conservan porque las usan los harness/test de la investigación de
       las fases 1-4; con el flag a false quedan inertes en el render. */
    haloExtrapolado: false
  };

  /* Interruptor de la capa, aquí y no en cada llamador: los dos puntos de uso
     (simulador y formulario de registro) tienen que responder al mismo mando.
     Encendido desde la ficha 12; la casilla del simulador lo apaga, y el
     formulario lo hereda sin casilla propia. */
  var GALAXIAS_IMAGEN = true;

  /* Lado del parche en minutos de arco. `r_e` viene en segundos (columna 4 del
     catálogo). El tope de 20′ lo tocan 200 de las 1295 filas: en esas, parte de la
     luz del catálogo cae fuera del parche y la corrige ps1FraccionLuz. */
  function ps1LadoArcmin(reArcsec) {
    var lado = PS1.ladoFactor * (reArcsec > 0 ? reArcsec : 0) / 60;
    return Math.max(PS1.ladoMin, Math.min(PS1.ladoMax, lado));
  }

  /* URL del parche en el proxy. El parche NO depende del ocular ni del aumento
     (ficha 10), así que la petición solo lleva objeto, lado y banda: por eso el
     proxy puede cachearlo para siempre. */
  var PS1_PROXY_URL = '/wp-content/uploads/bitacora/ps1-proxy.php';

  function ps1UrlParche(gal, salida) {
    return PS1_PROXY_URL +
      '?ra=' + Number(gal.ra).toFixed(5) + '&dec=' + Number(gal.dec).toFixed(5) +
      '&lado=' + Number(gal.ladoArcmin).toFixed(2) +
      '&salida=' + (salida || PS1.salida) + '&banda=' + PS1.banda;
  }

  /* Lector de FITS mínimo: cabecera de tarjetas de 80 caracteres en bloques de
     2880 bytes, datos float32 BIG-ENDIAN (BITPIX=-32). Solo se leen las claves que
     esta capa usa. Lo que ninguna skycell cubre llega como NaN y se conserva como
     NaN: es la marca de "aquí no hay dato" que el proxy no pudo coser. */
  function parseFITS(buffer) {
    var bytes = new Uint8Array(buffer), cab = {}, datos = -1, i, j, linea, clave;
    for (i = 0; i + 80 <= bytes.length; i += 80) {
      linea = '';
      for (j = 0; j < 80; j++) linea += String.fromCharCode(bytes[i + j]);
      clave = linea.slice(0, 8).trim();
      if (clave === 'END') { datos = Math.ceil((i + 80) / 2880) * 2880; break; }
      if (linea.charAt(8) === '=' && !(clave in cab)) cab[clave] = linea.slice(9);
    }
    if (datos < 0) return null;
    function num(k, pordefecto) {
      var v = cab[k] != null ? parseFloat(cab[k]) : NaN;
      return isFinite(v) ? v : pordefecto;
    }
    var ancho = num('NAXIS1', 0), alto = num('NAXIS2', 0);
    if (!(ancho > 0 && alto > 0) || num('BITPIX', 0) !== -32) return null;
    if (datos + ancho * alto * 4 > bytes.length) return null;
    var vista = new DataView(buffer), v = new Float32Array(ancho * alto);
    var bzero = num('BZERO', 0), bscale = num('BSCALE', 1);
    for (i = 0; i < v.length; i++) v[i] = bzero + bscale * vista.getFloat32(datos + i * 4, false);
    /* La WCS entera, no solo la escala. El recorte llega en la rejilla PROPIA de
       la skycell, cuyo punto de tangencia (CRVAL) puede quedar a grados del
       objeto; ahí el norte del cielo sale GIRADO dentro del parche. En M81 el
       giro son 3,6°, que en el borde del parche son 16 px: colocar las estrellas
       de Gaia suponiendo norte arriba dejaba la estrella sin tapar y la máscara
       excavando un agujero al lado (ver .scratch/estrellas-de-mas/rotacion.js).
       Grados por píxel con el PC ya dentro; si la matriz tiene términos cruzados
       —ninguna skycell de PS1 los trae— se devuelve null y todo se cae al
       supuesto de siempre, que es lo que había antes. */
    function ejeGrados(cdelt, pcA, pcB, cd) {
      var c = num(cdelt, NaN);
      return isFinite(c) ? c * num(pcA, num(pcB, 1)) : num(cd, NaN);
    }
    var gx = ejeGrados('CDELT1', 'PC001001', 'PC1_1', 'CD1_1');
    var gy = ejeGrados('CDELT2', 'PC002002', 'PC2_2', 'CD2_2');
    var cruce = num('PC001002', num('PC1_2', 0)) || num('PC002001', num('PC2_1', 0)) ||
                num('CD1_2', 0) || num('CD2_1', 0);
    var ra0 = num('CRVAL1', NaN), dec0 = num('CRVAL2', NaN);
    var rx = num('CRPIX1', NaN), ry = num('CRPIX2', NaN);
    var completa = !cruce && gx && gy && isFinite(gx) && isFinite(gy) &&
      isFinite(ra0) && isFinite(dec0) && isFinite(rx) && isFinite(ry);
    return {
      ancho: ancho, alto: alto, datos: v,
      // CDELT en grados; el que interesa es el módulo, en ″/px.
      escalaAs: Math.abs(num('CDELT2', num('CD2_2', 0))) * 3600,
      // CRPIX es 1-based en el FITS; aquí todo va 0-based.
      wcs: completa ? { ra0: ra0, dec0: dec0, x0: rx - 1, y0: ry - 1, gx: gx, gy: gy } : null,
      zpt: num('ZPT_0000', NaN)
    };
  }

  /* (α, δ) → píxel del parche (0-based) por la gnomónica de su WCS. null si el
     punto cae en el otro lado del cielo, donde la TAN ya no existe. */
  function ps1CieloAPixel(w, ra, dec) {
    var G = Math.PI / 180;
    var a0 = w.ra0 * G, d0 = w.dec0 * G, a = ra * G, d = dec * G;
    var sd = Math.sin(d), cd = Math.cos(d), da = a - a0;
    var cosc = Math.sin(d0) * sd + Math.cos(d0) * cd * Math.cos(da);
    if (!(cosc > 0)) return null;
    var xi = cd * Math.sin(da) / cosc;
    var eta = (Math.cos(d0) * sd - Math.sin(d0) * cd * Math.cos(da)) / cosc;
    return [(xi / G) / w.gx + w.x0, (eta / G) / w.gy + w.y0];
  }

  /* El parche visto como una AFÍN alrededor del objeto: lleva un desplazamiento
     en ″ (este, norte) desde el centro del objeto hasta un píxel del parche, y
     al revés. Es el jacobiano de la TAN ahí mismo, así que recoge el giro y la
     escala de verdad; lo único que deja fuera es la curvatura de la proyección,
     que en un parche de 20′ vale 0,5 px de mediana y 2 px en el peor caso
     (.scratch/estrellas-de-mas/afin.js). Se usa donde se paga por píxel; para
     las estrellas, que son pocas, se evalúa la TAN exacta.
     Sin WCS sale lo de siempre: norte arriba, este a la izquierda. */
  function ps1AfinParche(f, gal) {
    var esc = (f.escalaAs > 0) ? f.escalaAs : gal.ladoArcmin * 60 / f.ancho;
    var a = { cx: (f.ancho - 1) / 2, cy: (f.alto - 1) / 2,
              xe: -1 / esc, xn: 0, ye: 0, yn: 1 / esc };
    var c = f.wcs ? ps1CieloAPixel(f.wcs, gal.ra, gal.dec) : null;
    if (c) {
      var cd = Math.cos(gal.dec * Math.PI / 180), paso = 1 / 3600;
      var pe = ps1CieloAPixel(f.wcs, gal.ra + paso / (cd || 1), gal.dec);
      var pn = ps1CieloAPixel(f.wcs, gal.ra, gal.dec + paso);
      if (pe && pn) {
        a = { cx: c[0], cy: c[1], xe: pe[0] - c[0], ye: pe[1] - c[1],
              xn: pn[0] - c[0], yn: pn[1] - c[1] };
      }
    }
    // La vuelta: de píxel (dx, dy respecto al centro) a (este, norte) en ″.
    var det = a.xe * a.yn - a.xn * a.ye || 1e-12;
    a.ex = a.yn / det; a.ey = -a.xn / det;
    a.nx = -a.ye / det; a.ny = a.xe / det;
    return a;
  }

  /* Cielo del parche: mediana del BORDE. El stack ya viene restado, pero le queda
     un pedestal que a μ≈24 pesa más que el punto cero, y sin quitarlo el difuso
     llega al render con un suelo que no es del objeto. El borde, y no la mediana
     global, porque en un parche de 6·r_e el objeto ocupa el centro entero. */
  function ps1Cielo(datos, ancho, alto) {
    var m = [], x, y;
    var grosor = Math.max(1, Math.round(Math.min(ancho, alto) * 0.06));
    for (y = 0; y < alto; y++) {
      var borde = (y < grosor || y >= alto - grosor);
      for (x = 0; x < ancho; x++) {
        if (!borde && x >= grosor && x < ancho - grosor) continue;
        var v = datos[y * ancho + x];
        if (v === v) m.push(v);
      }
    }
    if (!m.length) return 0;
    m.sort(function (a, b) { return a - b; });
    return m[m.length >> 1];
  }

  /* Ruido del parche: σ robusta (MAD·1,4826) del mismo borde del que sale el
     cielo. Robusta y no desviación típica porque en el borde también hay
     estrellas, y una sola brillante dispararía la σ. En M51 sale 17 DN, contra
     los ~5 DN que le queda de galaxia a 6′ del centro. */
  function ps1SigmaCielo(datos, ancho, alto, cielo) {
    var m = [], x, y;
    var grosor = Math.max(1, Math.round(Math.min(ancho, alto) * 0.06));
    for (y = 0; y < alto; y++) {
      var borde = (y < grosor || y >= alto - grosor);
      for (x = 0; x < ancho; x++) {
        if (!borde && x >= grosor && x < ancho - grosor) continue;
        var v = datos[y * ancho + x];
        if (v === v) m.push(Math.abs(v - cielo));
      }
    }
    if (!m.length) return 0;
    m.sort(function (a, b) { return a - b; });
    return 1.4826 * m[m.length >> 1];
  }

  /* Radio de máscara de una estrella, en ″: crece con lo brillante que SEA, no con
     el equipo, acotado entre el seeing y mascaraMaxAs. Antes se medía contra la
     magnitud límite del equipo, porque solo se enmascaraba lo que el render iba a
     pintar; desde la máscara total (ver ps1EstrellasEnPixeles) el equipo ya no
     entra, y el mismo parche vale para cualquier ocular.

     Crece GEOMÉTRICAMENTE, no lineal: el ala de una PSF va como r^-3, así que el
     radio donde el perfil cruza el mismo umbral se ensancha 10^(0,4/3) ≈ 1,35 por
     magnitud. Con la ley lineal de antes (0,6″/mag) la máscara se quedaba dentro
     del ala de las estrellas medianas y el relleno tomaba su mediana justo del
     ala: quedaba un disco apagado rodeado del anillo brillante que sobraba —el
     «halo con hueco» que se vio en el simulador el 12-ago-2026—.

     La FORMA está medida, no supuesta: apilando 19031 estrellas de 33 parches
     de PS1 y restando un testigo del mismo radio galactocéntrico, el radio de
     contaminación crece ×1,36 por magnitud (α = 2,98 contra el 3 de la ley).
     Lo que estaba mal era el tope: con 25″ la ley se cortaba en g≈11,6, y de
     ahí para arriba las medidas piden 35–37″ (g 10–12) y 48″ para la única de
     g=8,5 del muestreo. 60″ cubre todo lo medido; por encima ya es
     extrapolación y se corta. Subir a 90″ no cambió nada medible ni siquiera
     en el parche que tiene la estrella más brillante
     (.scratch/alas-brillantes/INFORME.md). */
  function ps1RadioMascaraAs(g) {
    var r = PS1.seeingAs * Math.pow(10, 0.4 * (PS1.mascaraMagRef - g) / 3);
    return Math.max(PS1.seeingAs, Math.min(PS1.mascaraMaxAs, r));
  }

  /* Quita TODAS las estrellas de Gaia del campo: marca el disco de cada una y lo
     rellena, entero, con la mediana del anillo que la rodea POR FUERA de su propia
     máscara, saltándose lo enmascarado por las demás y los NaN.

     Un valor por estrella, no un degradado por píxel: el degradado tomaba la
     mediana a pocos píxeles de cada píxel tapado, o sea del ala de la estrella que
     se estaba quitando, y devolvía el borde brillante junto al centro apagado (el
     «halo con hueco»). Un disco plano se nota sobre el gradiente de la galaxia,
     pero mucho menos que ese anillo; si algún día molesta, lo que toca es
     interpolar el fondo, no volver a muestrear el ala.

     Ese disco plano solo vale mientras la galaxia apenas cambie de brillo entre
     r y 1,6r. En una máscara ancha —las de g<11, que llegan a 56″— el anillo cae
     ya en la periferia y la mediana que trae es decenas de veces más floja que
     lo que había dentro: el disco sale como un hoyo, y encima `w` se lo cree
     (la meseta pasa del umbral de anclaje, así que `w`=1 dentro y el perfil no
     puede rellenar). Medido en NGC 5055, campo/perfil dentro del disco de la
     estrella de g=9,2: 0,025. Por eso, pasado rellenoPlanoMaxAs, el disco se
     deja al nivel del cielo: el anclaje lo apaga, `w` cae a 0 dentro y lo
     rellena (1-w)·perfil, que es lo que la arquitectura ya hace con una zona
     sin información. La misma medida sube entonces a 1,000.

     El umbral está donde lo pusieron las medidas: el disco plano sale a 0,999
     de 25 a 40″ y se hunde a 0,025 a 56″. No se baja más porque el hueco tiene
     su propio precio en el borde —mientras `w` recorre la rampa hay datos a
     cero, así que el anillo queda a (1-w)·perfil y se ve—; con el umbral en la
     caja de la mezcla (25″) los discos de ~30″ de M81 salían dibujados como
     dos aros oscuros. Y por debajo de todo eso el disco plano es además el
     mejor dato local: con hueco, las máscaras de pocos píxeles se apagan
     enteras (0,245 contra 0,774 en M81) porque la caja de `w` sigue viendo
     galaxia alrededor.

     `estrellas` en píxeles del parche: [{x, y, rPx, rAs}]. Sin `rAs` (llamadas
     viejas) se usa siempre el disco plano. Devuelve una copia.

     `geo` ({afin, ba, pa, escena}) es la geometría de la galaxia, y con ella:
     — solo se elimina lo que queda FUERA de la escena difusa que se está
       reproduciendo: `escena` es la unión de elipses isofotales (μ=muEscena)
       de los componentes difusos del parche (ver ps1EscenaEnParche), y una
       fuente que cae dentro de cualquiera de ellas se conserva ENTERA. No se
       pregunta si la estrella «pertenece» físicamente al objeto —eso no se
       puede saber desde aquí—, solo si está proyectada dentro de la escena.
       La protección nuclear de antes (dist < rAs) es el caso particular
       trivial: el núcleo está a radio elíptico ~0 de su propia elipse, así que
       queda dentro sin regla aparte; y el núcleo de una COMPAÑERA catalogada
       (NGC 5195 sobre el parche de M51) queda protegido por SU elipse, sin
       condiciones por nombre de objeto. La decisión es por fuente y
       determinista: radio elíptico ≤ r25, en ″ del cielo, a cualquier
       resolución.
     — el relleno estrecho deja de ser plano: mediana por banda de ISOFOTA
       elíptica (b/a y PA del catálogo, bandas de 1 px de radio elíptico), que
       es el fondo galáctico local de verdad; el plano hundía el bulbo al nivel
       del anillo exterior. El disco ancho (rAs > rellenoPlanoMaxAs) se sigue
       dejando al cielo: esa arquitectura está medida aparte (ver arriba).
     Sin `geo` (llamadas viejas y tests sintéticos): sin protección y relleno
     plano, como siempre. Sin `geo.escena` pero con `afin`: relleno por
     isofotas, sin protección (la escena la construye quien conoce el campo). */
  function ps1QuitarEstrellas(datos, ancho, alto, estrellas, geo) {
    if (!estrellas || !estrellas.length) return datos;
    var a = geo && geo.afin, esc = a ? 1 / Math.hypot(a.xn, a.yn) : 0;
    var escena = (geo && geo.escena && geo.escena.length) ? geo.escena : null;
    var mascara = new Uint8Array(datos.length), quitar = [], huecos = [], i, e, x, y, cielo = null;
    for (i = 0; i < estrellas.length; i++) {
      e = estrellas[i];
      if (a && escena && ps1FuenteEnEscena(escena, a, e.x, e.y)) { huecos.push(e); continue; }   // dentro de la escena: se conserva entera
      quitar.push(e);
      var r = Math.max(1, e.rPx), r2 = r * r;
      for (y = Math.max(0, Math.floor(e.y - r)); y <= Math.min(alto - 1, Math.ceil(e.y + r)); y++) {
        for (x = Math.max(0, Math.floor(e.x - r)); x <= Math.min(ancho - 1, Math.ceil(e.x + r)); x++) {
          var dx = x - e.x, dy = y - e.y;
          if (dx * dx + dy * dy > r2) continue;
          mascara[y * ancho + x] = 1;
        }
      }
    }
    /* Isofotas: banda = radio elíptico redondeado a píxeles, mediana de lo no
       enmascarado (mín. 8 muestras, como ps1FondoAlrededor). El radio elíptico
       sale del afín inverso, así que respeta el giro de la skycell. */
    var isofotas = null, banda = null;
    if (a) {
      var ba = (geo.ba > 0 && geo.ba <= 1) ? geo.ba : 1;
      var paR = (geo.pa || 0) * Math.PI / 180, sinPA = Math.sin(paR), cosPA = Math.cos(paR);
      banda = function (px, py) {
        var dx = px - a.cx, dy = py - a.cy;
        var este = a.ex * dx + a.ey * dy, norte = a.nx * dx + a.ny * dy;
        var u = este * sinPA + norte * cosPA, v = -este * cosPA + norte * sinPA;
        return Math.round(Math.hypot(u, v / ba) / esc);
      };
      var muestras = [];
      for (y = 0; y < alto; y++) {
        for (x = 0; x < ancho; x++) {
          i = y * ancho + x;
          if (mascara[i]) continue;
          var vM = datos[i];
          if (vM !== vM) continue;
          var bM = banda(x, y);
          (muestras[bM] || (muestras[bM] = [])).push(vM);
        }
      }
      isofotas = muestras.map(function (m) {
        if (!m || m.length < 8) return null;
        m.sort(function (p, q) { return p - q; });
        return m[m.length >> 1];
      });
    }
    /* Componentes de escena con borde REAL (compacta, ver ps1EscenaEnParche):
       si un disco ANCHO los pisa, la elipse ENTERA del componente pasa a NaN
       —AUSENCIA— al final (ver el pase tras los rellenos). Dos reglas juntas:
       la del anclaje (ps1AnclarACatalogo) —un 0 donde no hay medida es una
       medida falsa que bloquea el relleno: la caja de ps1PesoImagen a caballo
       del borde mantiene w alto y w·0 + (1−w)·perfil deja un anillo oscuro— y
       la de ADR 0013 —la fila de catálogo ES el modelo—: con la mayor parte
       del objeto bajo una máscara de saturación, lo que queda de imagen es un
       remiendo (creciente contaminado por el ala de la estrella + muescas de
       cielo), y coserlo pinta un objeto partido; el perfil entero pinta UNO.
       Solo compactas: el resto del disco ancho sigue al cielo, que es la
       arquitectura medida de las galaxias (M81/NGC 5055). */
    var compactas = null;
    if (a && escena) {
      for (i = 0; i < escena.length; i++) {
        if (escena[i].compacta) (compactas || (compactas = [])).push(escena[i]);
      }
    }
    var out = Float32Array.from ? Float32Array.from(datos) : new Float32Array(datos);
    for (i = 0; i < quitar.length; i++) {
      e = quitar[i];
      var rE = Math.max(1, e.rPx), fondo = null, ancha = e.rAs > PS1.rellenoPlanoMaxAs;
      if (ancha && compactas) {
        // Mismo criterio que ps1MascaraMuerdeEscena: radios elípticos sumados.
        for (var ci = 0; ci < compactas.length; ci++) {
          var cq = compactas[ci], dxq = e.x - cq.cx, dyq = e.y - cq.cy;
          var esteQ = a.ex * dxq + a.ey * dyq, norteQ = a.nx * dxq + a.ny * dyq;
          if (ps1RadioEje(cq.cos, cq.sin, norteQ, esteQ, cq.ba) <= cq.r25As + e.rAs) cq.pisada = true;
        }
      }
      if (ancha) {                                         // disco ancho: ausencia, que la rellene el perfil
        if (cielo == null) cielo = ps1Cielo(datos, ancho, alto);
        fondo = cielo;
      } else if (!isofotas) {
        fondo = ps1FondoAlrededor(datos, mascara, ancho, alto, e.x, e.y, rE);
        if (fondo == null) continue;                       // sin muestras limpias: mejor dejarlo como está
      }
      var rE2 = rE * rE;
      for (y = Math.max(0, Math.floor(e.y - rE)); y <= Math.min(alto - 1, Math.ceil(e.y + rE)); y++) {
        for (x = Math.max(0, Math.floor(e.x - rE)); x <= Math.min(ancho - 1, Math.ceil(e.x + rE)); x++) {
          var ex = x - e.x, ey = y - e.y;
          if (ex * ex + ey * ey > rE2) continue;
          var j = y * ancho + x;
          if (!mascara[j]) continue;
          var v = fondo;
          if (v == null) {                                 // disco estrecho con isofotas
            var b = banda(x, y);
            v = isofotas[b];
            // banda sin muestras (borde, campo cargado): la vecina más próxima
            for (var k = 1; v == null && k < 8; k++) v = isofotas[b + k] != null ? isofotas[b + k] : isofotas[b - k];
            if (v == null) continue;
          }
          out[j] = v;
        }
      }
    }
    if (huecos.length) ps1RellenoHuecosLocal(out, ancho, alto, huecos);
    /* Compacta pisada por un disco ancho: su elipse entera a NaN, DESPUÉS de
       todos los rellenos (incluido el de huecos de fuentes conservadas: aquí
       también su fuente queda dentro del modelo). El pintado la cubre con
       (1−w)·perfil, vecino a vecino con wv=0: el objeto completo, de una
       pieza. Ver el comentario de `compactas` arriba.
       Y si TODA la escena del parche son compactas pisadas, la imagen ENTERA
       pasa a ausencia. No es cosmética: el anclaje reparte la luz del catálogo
       entre lo que queda encendido, y con el objeto en NaN ese presupuesto se
       lo lleva el ala de la estrella más allá del tope de su máscara
       (mascaraMaxAs es extrapolación cortada, no el fin del ala: la ley sin
       tope da 226″ para g=4,7) — motitas brillantes con la luz de la nebulosa.
       La estrella la pinta la capa de estrellas (glow y spikes); aquí no queda
       nada legítimo que conservar. Con componentes no pisados (una galaxia
       vecina) no se toca: solo caen sus elipses pisadas. */
    if (compactas) {
      var pisadas = 0;
      for (i = 0; i < compactas.length; i++) if (compactas[i].pisada) pisadas++;
      if (pisadas && escena && pisadas === escena.length) {
        for (i = 0; i < out.length; i++) out[i] = NaN;
        for (i = 0; i < compactas.length; i++) delete compactas[i].pisada;
        return out;
      }
      for (i = 0; i < compactas.length; i++) {
        var cp = compactas[i];
        if (!cp.pisada) continue;
        delete cp.pisada;
        var rPxE = cp.r25As / esc;
        var yA = Math.max(0, Math.floor(cp.cy - rPxE)), yB = Math.min(alto - 1, Math.ceil(cp.cy + rPxE));
        var xA = Math.max(0, Math.floor(cp.cx - rPxE)), xB = Math.min(ancho - 1, Math.ceil(cp.cx + rPxE));
        for (y = yA; y <= yB; y++) {
          for (x = xA; x <= xB; x++) {
            var dxp = x - cp.cx, dyp = y - cp.cy;
            var esteP = a.ex * dxp + a.ey * dyp, norteP = a.nx * dxp + a.ny * dyp;
            if (ps1RadioEje(cp.cos, cp.sin, norteP, esteP, cp.ba) <= cp.r25As) out[y * ancho + x] = NaN;
          }
        }
      }
    }
    return out;
  }

  /* Una fuente conservada por escena ([[ps1FuenteEnEscena]]) mantiene sus
     píxeles reales, pero si su núcleo estaba saturado en el stack de PS1 esos
     píxeles son NaN (ver huecos-ps1-son-estrellas-saturadas): sin este relleno
     llegan así hasta ps1PintarParche, que los trata como ausencia y los cubre
     con el perfil de la galaxia —casi 0 lejos del centro—, y sale un agujero
     negro con la forma exacta de la máscara de saturación.
     Dilatación local (máximo de los 8 vecinos, expandiendo desde el borde del
     hueco): a diferencia del relleno por isofotas de arriba, aquí NO hay que
     estimar el fondo de la galaxia sino la propia estrella, así que se usa su
     entorno inmediato, no un anillo lejano (ese error ya se midió una vez,
     ver [[huecos-ps1-son-estrellas-saturadas]]). Acotado al recuadro de cada
     fuente: no toca nada fuera de su hueco. */
  function ps1RellenoHuecosLocal(out, ancho, alto, huecos) {
    for (var i = 0; i < huecos.length; i++) {
      var e = huecos[i], r = Math.max(1, e.rPx);
      var x0 = Math.max(0, Math.floor(e.x - r - 1)), x1 = Math.min(ancho - 1, Math.ceil(e.x + r + 1));
      var y0 = Math.max(0, Math.floor(e.y - r - 1)), y1 = Math.min(alto - 1, Math.ceil(e.y + r + 1));
      for (var pasada = 0; pasada < r + 2; pasada++) {
        var cambio = false;
        for (var y = y0; y <= y1; y++) {
          for (var x = x0; x <= x1; x++) {
            var j = y * ancho + x;
            if (out[j] === out[j]) continue;             // ya tiene valor
            var mejor = -Infinity, hay = false;
            for (var dy = -1; dy <= 1; dy++) {
              for (var dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue;
                var yy = y + dy, xx = x + dx;
                if (yy < y0 || yy > y1 || xx < x0 || xx > x1) continue;
                var v = out[yy * ancho + xx];
                if (v === v && v > mejor) { mejor = v; hay = true; }
              }
            }
            if (hay) { out[j] = mejor; cambio = true; }
          }
        }
        if (!cambio) break;
      }
    }
  }

  /* Mediana del anillo [r, 1,6r] alrededor de (x,y), saltándose lo enmascarado y
     los NaN. Se ensancha hasta encontrar muestras (una estrella pegada a otra
     puede tener el primer anillo entero dentro de la máscara vecina) y devuelve
     null si no encuentra ninguna. */
  function ps1FondoAlrededor(datos, mascara, ancho, alto, x, y, r) {
    for (var k = 0; k < 4; k++) {
      var rIn = r * Math.pow(1.6, k), rOut = rIn * 1.6, m = [], dx, dy;
      for (dy = -Math.ceil(rOut); dy <= Math.ceil(rOut); dy++) {
        var yy = Math.round(y + dy); if (yy < 0 || yy >= alto) continue;
        for (dx = -Math.ceil(rOut); dx <= Math.ceil(rOut); dx++) {
          var xx = Math.round(x + dx); if (xx < 0 || xx >= ancho) continue;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < rIn || d > rOut) continue;
          var i = yy * ancho + xx;
          if (mascara[i]) continue;
          var v = datos[i];
          if (v === v) m.push(v);
        }
      }
      if (m.length >= 8) { m.sort(function (a, b) { return a - b; }); return m[m.length >> 1]; }
    }
    return null;
  }

  /* ── Fracción de luz dentro del parche (corrección del anclaje) ──
     Para un perfil de Sérsic, la luz dentro de un radio R es la gamma incompleta
     regularizada P(2n, b_n·(R/r_e)^(1/n)). Con lado = 6·r_e sale ~0,94 para un
     disco exponencial; con el tope de 20′ sobre M31 baja al 40–60 %, y ahí el
     nivel pasa a ser una extrapolación, no una medida (riesgo escrito en la 03).
     ponytail: un solo Sérsic con la `n` del disco. El catálogo trae B/T pero no el
     r_e del bulbo, así que un modelo de dos componentes tendría que inventárselo. */
  function ps1BSersic(n) {
    return 2 * n - 1 / 3 + 4 / (405 * n) + 46 / (25515 * n * n);
  }
  /* ln Γ(x) (Lanczos) y P(a,x) por serie/fracción continua, como el gammp clásico. */
  function lnGamma(x) {
    var c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
             -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    var y = x, tmp = x + 5.5, ser = 1.000000000190015;
    tmp -= (x + 0.5) * Math.log(tmp);
    for (var j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }
  function gammaP(a, x) {
    if (!(x > 0) || !(a > 0)) return 0;
    var i;
    if (x < a + 1) {                                   // serie
      var ap = a, suma = 1 / a, del = suma;
      for (i = 0; i < 300; i++) {
        ap++; del *= x / ap; suma += del;
        if (Math.abs(del) < Math.abs(suma) * 1e-12) break;
      }
      return suma * Math.exp(-x + a * Math.log(x) - lnGamma(a));
    }
    var b = x + 1 - a, c = 1e300, d = 1 / b, h = d;    // fracción continua → Q(a,x)
    for (i = 1; i <= 300; i++) {
      var an = -i * (i - a);
      b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d;
      var delta = d * c; h *= delta;
      if (Math.abs(delta - 1) < 1e-12) break;
    }
    return 1 - Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
  }
  function ps1FraccionLuz(n, radioEnRe) {
    var nn = (n > 0.1) ? n : 1;
    if (!(radioEnRe > 0)) return 0;
    return Math.min(1, gammaP(2 * nn, ps1BSersic(nn) * Math.pow(radioEnRe, 1 / nn)));
  }

  /* ── Halo extrapolado: el perfil del catálogo más allá de la imagen ──────────
     La imagen de PS1 se acaba donde se acaba su señal (μ≈25 en el mejor caso, y
     antes si el parche es chico). El disco NO se acaba ahí: solo cae por debajo
     del ruido del stack. Aquí se sigue el perfil hasta PS1.muHalo.

     El perfil NO se ajusta a los píxeles: ya viene ajustado en el catálogo. Las
     columnas r_e, b/a, PA, n y B/T salen de gen_galaxias.py, que resuelve r_e
     para que la isofota de 25 caiga en el D25 del RC3 y reparte la luz entre
     bulbo (n=4, r_e·0,2) y disco (n del tipo). Reproducir aquí ESE MISMO modelo
     (`perfil_total` del generador) es lo consistente: un ajuste propio a las
     alas ruidosas del parche daría un perfil distinto del que ya ancla el nivel
     en ps1AnclarACatalogo, y las dos capas dejarían de casar. */
  var PS1_RE_BULBO = 0.2, PS1_Q_BULBO_MIN = 0.6;   // = RE_BULBO_REL / Q_BULBO_MIN del generador

  // Integral del perfil: L_total = I_e · r_e² · factor · (b/a). En logaritmos,
  // que e^b y b^-2n se desbordan por separado para n grande.
  function ps1FactorLuz(n) {
    var b = ps1BSersic(n);
    return 2 * Math.PI * n * Math.exp(b + lnGamma(2 * n) - 2 * n * Math.log(b));
  }

  /* Radio (″, sobre el SEMIEJE MAYOR) al que una componente cae a un brillo
     superficial dado. 0 si ni en el centro llega. */
  function ps1RadioIsofota(c, mu) {
    var I = Math.pow(10, -0.4 * mu);
    if (!(c.Ie > I)) return 0;
    return c.re * Math.pow(1 + Math.log(c.Ie / I) / c.b, c.n);
  }

  /* Componentes del modelo de una galaxia: cada una con su I_e (flujo por
     arcsec²), r_e (semieje MAYOR, ″), n, razón de ejes y el radio —también sobre
     el semieje mayor— al que su brillo cae a PS1.muHalo.
     gal: {magV, reArcsec, n, ba, bt}. Devuelve [] si falta el dato mínimo. */
  function ps1ComponentesSersic(gal) {
    var re = gal.reArcsec, q = (gal.ba > 0 && gal.ba <= 1) ? gal.ba : 1;
    if (!(re > 0) || !(gal.magV > 0)) return [];
    var Ftot = Math.pow(10, -0.4 * gal.magV);
    var bt = (gal.bt >= 0 && gal.bt <= 1) ? gal.bt : 0;
    var Ihalo = Math.pow(10, -0.4 * PS1.muHalo), out = [];
    function comp(frac, reC, nC, qC) {
      if (!(frac > 0)) return;
      var Ie = Ftot * frac / (reC * reC * ps1FactorLuz(nC) * qC);
      if (!(Ie > Ihalo)) return;                       // ni en el centro llega al umbral
      var c = { Ie: Ie, re: reC, n: nC, b: ps1BSersic(nC), q: qC };
      c.rMax = ps1RadioIsofota(c, PS1.muHalo);
      out.push(c);
    }
    comp(1 - bt, re, (gal.n > 0.1) ? gal.n : 1, q);
    comp(bt, re * PS1_RE_BULBO, 4, Math.max(q, PS1_Q_BULBO_MIN));
    return out;
  }

  /* Flujo por arcsec² del modelo en un punto, dado en desplazamientos NORTE/ESTE
     (″) respecto al centro de la galaxia. Cada componente se evalúa en SU radio
     sobre el semieje mayor: el punto se lleva al eje mayor (PA, medido del norte
     hacia el este) y el eje menor se estira por 1/q. */
  /* Radio del punto sobre el SEMIEJE MAYOR (″), con el seno y el coseno del PA ya
     calculados por quien recorre el bucle: el eje menor se estira por 1/q. */
  function ps1RadioEje(cs, sn, norte, este, q) {
    var eje = norte * cs + este * sn, tra = -norte * sn + este * cs;
    return Math.sqrt(eje * eje + (tra / q) * (tra / q));
  }

  function ps1FlujoModelo(comps, pa, norte, este) {
    var a = pa * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a), F = 0;
    for (var i = 0; i < comps.length; i++) {
      var c = comps[i], r = ps1RadioEje(cs, sn, norte, este, c.q);
      if (r > c.rMax) continue;
      F += c.Ie * Math.exp(-c.b * (Math.pow(r / c.re, 1 / c.n) - 1));
    }
    return F;
  }

  /* ── Mezcla de imagen y perfil ───────────────────────────────────────────────
     `w` = fracción de píxeles con señal en una caja de PS1.mezclaCajaAs,
     saturada con un smoothstep en PS1.mezclaW0: 0 donde la imagen no trae nada,
     1 donde la vecindad ya está medida, y un tránsito continuo y derivable en
     medio. NO es una relación señal-ruido ni una confianza estadística: es una
     heurística de PRESENCIA DE INFORMACIÓN. Quien quiera convertirla en S/N
     tiene que recalibrarla antes.

     Sustituye a `f = max(imagen, perfil)`, que quedó descartada: medido sobre el
     parche real de M51 (13-ago-2026), el perfil ganaba en el 70-95 % de los
     píxeles desde 0,3 r_e —un perfil liso vale la MEDIA azimutal y en una
     galaxia con brazos la mayoría de los píxeles están por debajo de la media—,
     enterraba la morfología bajo un óvalo liso y metía el 154,6 % de la luz del
     catálogo cuando el anclaje ya la había cerrado en el 96,1 %. El moteado del
     borde que en su día hundió la regla anterior («perfil solo donde la imagen
     es cero») lo arregla el peso continuo, no el máximo. */
  function ps1PesoImagen(datos, ancho, alto, escalaAs) {
    var rad = Math.max(1, Math.round(PS1.mezclaCajaAs / (escalaAs > 0 ? escalaAs : 1) / 2));
    var señal = new Float32Array(datos.length), i;
    for (i = 0; i < datos.length; i++) señal[i] = datos[i] > 0 ? 1 : 0;
    var w = ps1CajaSeparable(señal, ancho, alto, rad), w0 = PS1.mezclaW0;
    for (i = 0; i < w.length; i++) {
      var t = w[i] / w0;
      t = t > 1 ? 1 : (t > 0 ? t : 0);
      w[i] = t * t * (3 - 2 * t);
    }
    return w;
  }

  /* SOPORTE LOCAL de la señal medida: el brillo medio de la imagen en la MISMA
     vecindad con la que ps1PesoImagen decide si la imagen trae información
     (PS1.mezclaCajaAs), pero sobre el flujo en vez de sobre la presencia. No es
     una escala nueva ni un parámetro nuevo: es la vecindad que el pipeline ya
     usa para hablar de «lo que hay alrededor de este píxel».
     Para qué: la rampa de opacidad es la ley de DETECCIÓN, y el ojo no detecta
     píxeles sueltos del lienzo sino estructura con extensión. Alimentarla con el
     flujo puntual hace que dentro de una misma estructura, y en pocos píxeles,
     un brazo salga con op = 1 y el interbrazo de al lado con op ≈ 0.
     La ausencia (NaN) no da soporte: entra como 0, igual que en ps1PesoImagen, y
     el píxel se queda con su rampa de siempre. */
  function ps1SoporteLocal(datos, ancho, alto, escalaAs) {
    var rad = Math.max(1, Math.round(PS1.mezclaCajaAs / (escalaAs > 0 ? escalaAs : 1) / 2));
    var f = new Float32Array(datos.length);
    for (var i = 0; i < datos.length; i++) f[i] = datos[i] > 0 ? datos[i] : 0;
    return ps1CajaSeparable(f, ancho, alto, rad);
  }

  // Media en una caja de (2·rad+1)², separable y por sumas corridas.
  function ps1CajaSeparable(datos, ancho, alto, rad) {
    var tmp = new Float32Array(datos.length), out = new Float32Array(datos.length), x, y, i;
    for (y = 0; y < alto; y++) {
      var acc = 0, n = 0;
      for (x = -rad; x <= rad; x++) { i = Math.min(ancho - 1, Math.max(0, x)); acc += datos[y * ancho + i]; n++; }
      for (x = 0; x < ancho; x++) {
        tmp[y * ancho + x] = acc / n;
        var sale = Math.min(ancho - 1, Math.max(0, x - rad));
        var entra = Math.min(ancho - 1, Math.max(0, x + rad + 1));
        acc += datos[y * ancho + entra] - datos[y * ancho + sale];
      }
    }
    for (x = 0; x < ancho; x++) {
      var acc2 = 0, n2 = 0;
      for (y = -rad; y <= rad; y++) { i = Math.min(alto - 1, Math.max(0, y)); acc2 += tmp[i * ancho + x]; n2++; }
      for (y = 0; y < alto; y++) {
        out[y * ancho + x] = acc2 / n2;
        var sale2 = Math.min(alto - 1, Math.max(0, y - rad));
        var entra2 = Math.min(alto - 1, Math.max(0, y + rad + 1));
        acc2 += tmp[entra2 * ancho + x] - tmp[sale2 * ancho + x];
      }
    }
    return out;
  }

  /* Factor que devuelve el presupuesto de luz a su sitio. La mezcla
     `w·s·imagen + (1−w)·perfil` mete luz de modelo donde la imagen no llega, y
     el anclaje ya había fijado la luz del parche a la magnitud del catálogo, así
     que sin `s` el objeto emitiría de más. `s` se resuelve para que la suma de
     la mezcla sobre el parche sea exactamente la de la imagen anclada: el
     presupuesto lo pone el catálogo y ninguna componente lo amplía por su cuenta.
     Devuelve 1 si no hay perfil o no hay imagen que repartir. */
  function ps1EscalaMezcla(datos, w, perfil) {
    var objetivo = 0, Iw = 0, Ip = 0, i;
    for (i = 0; i < datos.length; i++) {
      var v = datos[i];
      // La ausencia (NaN, ver ps1AnclarACatalogo) queda fuera del presupuesto
      // por completo: ni aporta objetivo ni cuenta su relleno de perfil. Sin
      // este salto un solo NaN dejaba la suma en NaN y s caía al respaldo 1.
      if (v !== v) continue;
      objetivo += v;
      Iw += w[i] * v;
      Ip += (1 - w[i]) * perfil[i];
    }
    if (!(Iw > 0)) return 1;
    var s = (objetivo - Ip) / Iw;
    return s > 0 ? s : 0;
  }

  /* El perfil del catálogo muestreado en la retícula del parche, que es donde se
     mide el presupuesto (ps1EscalaMezcla). La retícula no está al norte: `a` es
     la afín del parche (ps1AfinParche) y es ella quien dice hacia dónde caen el
     norte y el este en cada píxel. */
  function ps1PerfilEnParche(comps, pa, ancho, alto, a) {
    var out = new Float32Array(ancho * alto);
    for (var y = 0; y < alto; y++) {
      var dy = y - a.cy;
      for (var x = 0; x < ancho; x++) {
        var dx = x - a.cx;
        out[y * ancho + x] = ps1FlujoModelo(comps, pa,
          a.nx * dx + a.ny * dy, a.ex * dx + a.ey * dy);
      }
    }
    return out;
  }

  /* Diámetro intrínseco del objeto para la ley H2c: 2·r(μ=25) del modelo del
     catálogo, en MINUTOS DE ARCO y CIRCULARIZADO por √(b/a) —la detección
     integra área, no semieje—. r(μ25) se toma como el mayor de los radios
     isofotales de las componentes: en el cruce de μ=25 domina una sola (el
     disco) y la analítica de ps1RadioIsofota ya lo resuelve exacto; la suma
     solo lo movería un pelo hacia fuera, y ±40 % de θint son ±0,05 dex de
     umbral (medido en scripts/harness_h2c_anclaje_render.js, M104). */
  function ps1ThetaIntArcmin(comps, ba) {
    var e = ps1EjesArcmin(comps || [], ba);   // los MISMOS ejes que decide el halo
    return Math.sqrt(e.a * e.b);              // = 2·r(μ25)/60·√(b/a)
  }

  // Radio (″, semieje mayor) que abarca todo el halo extrapolado.
  function ps1RadioHaloAs(comps) {
    var r = 0;
    for (var i = 0; i < comps.length; i++) if (comps[i].rMax > r) r = comps[i].rMax;
    return r;
  }

  /* ── Índice de Sérsic MEDIDO: el que decide la puerta ───────────────────────
     El `n` de la columna 9 NO es una medida: gen_galaxias.py lo saca del tipo de
     Hubble y solo vale 1 o 4. Vale para el perfil —r_e se resolvió con él— pero
     no para decidir si una galaxia es tendida o concentrada, que es lo que la
     puerta pregunta.
     Primero manda el n AJUSTADO de S4G (columna 12; 617 de las 1295 filas). Donde
     no lo hay, se mide en la propia imagen de PS1 por CONCENTRACIÓN: los radios
     que encierran el 50 % y el 90 % de la luz dentro de la apertura, y el n del
     Sérsic que daría esa misma razón. En ningún caso se recae en el tipo. */

  // x tal que P(a,x) = p, por bisección: P crece con x y aquí p < P(a,xMax).
  function ps1InvGammaP(a, p, xMax) {
    var lo = 0, hi = xMax;
    for (var i = 0; i < 60; i++) {
      var med = 0.5 * (lo + hi);
      if (gammaP(a, med) < p) lo = med; else hi = med;
    }
    return 0.5 * (lo + hi);
  }

  /* Concentración r90/r50 de un Sérsic de índice n, medida DENTRO de la misma
     apertura que la imagen (semieje mayor A, en unidades de r_e). Crece con n
     —un perfil concentrado deja el 50 % de su luz mucho más adentro que el
     90 %—, así que se puede invertir. */
  function ps1ConcentracionTeorica(n, aEnRe) {
    if (!(n > 0) || !(aEnRe > 0)) return 0;
    var b = ps1BSersic(n), xA = b * Math.pow(aEnRe, 1 / n), L = gammaP(2 * n, xA);
    if (!(L > 0)) return 0;
    var x50 = ps1InvGammaP(2 * n, 0.5 * L, xA), x90 = ps1InvGammaP(2 * n, 0.9 * L, xA);
    if (!(x50 > 0)) return 0;
    return Math.pow(x90 / x50, n);
  }

  var PS1_N_MIN = 0.3, PS1_N_MAX = 8;                 // rango en el que se busca

  // n cuyo r90/r50 teórico es el medido. Fuera de rango, el extremo.
  function ps1NDeConcentracion(c, aEnRe) {
    if (!(c > 1) || !(aEnRe > 0)) return 0;
    if (c <= ps1ConcentracionTeorica(PS1_N_MIN, aEnRe)) return PS1_N_MIN;
    if (c >= ps1ConcentracionTeorica(PS1_N_MAX, aEnRe)) return PS1_N_MAX;
    var lo = PS1_N_MIN, hi = PS1_N_MAX;
    for (var i = 0; i < 40; i++) {
      var med = 0.5 * (lo + hi);
      if (ps1ConcentracionTeorica(med, aEnRe) < c) lo = med; else hi = med;
    }
    return 0.5 * (lo + hi);
  }

  /* n medido en la imagen ya anclada (curva de crecimiento en anillos elípticos
     con el PA y el b/a del catálogo).
     La apertura se queda en el menor de: el semieje de la isofota 25 y medio
     lado del parche. Pasarse del parche no añade luz pero sí radio, y eso bajaría
     el r90 y con él la n: la galaxia saldría más tendida de lo que es.
     p: {datos, ancho, alto, escalaAs}; o: {pa, ba, aArcmin (DIÁMETRO de la
     isofota 25, ′), reArcsec, ladoArcmin}. Devuelve 0 si no hay luz que medir. */
  var PS1_ANILLOS = 120;
  function ps1ConcentracionN(p, o) {
    var A = Math.min(o.aArcmin * 60 / 2, o.ladoArcmin * 60 / 2);
    if (!(A > 0) || !(o.reArcsec > 0) || !p || !p.datos) return 0;
    var q = (o.ba > 0 && o.ba <= 1) ? o.ba : 1;
    var a = (o.pa || 0) * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
    var suma = new Float64Array(PS1_ANILLOS), total = 0;
    // Hacia dónde caen el norte y el este lo dice la afín del parche
    // (ps1AfinParche), que viene girada; sin ella, norte arriba y este a la
    // izquierda como siempre.
    var af = p.afin || { cx: (p.ancho - 1) / 2, cy: (p.alto - 1) / 2,
                         ex: -p.escalaAs, ey: 0, nx: 0, ny: p.escalaAs };
    for (var py = 0; py < p.alto; py++) {
      var dy = py - af.cy;
      for (var px = 0; px < p.ancho; px++) {
        var f = p.datos[py * p.ancho + px];
        if (!(f > 0)) continue;
        var dx = px - af.cx;
        var norte = af.nx * dx + af.ny * dy, este = af.ex * dx + af.ey * dy;
        var eje = norte * cs + este * sn, tra = (-norte * sn + este * cs) / q;
        var r = Math.sqrt(eje * eje + tra * tra);
        if (r >= A) continue;
        suma[Math.floor(r / A * PS1_ANILLOS)] += f;
        total += f;
      }
    }
    if (!(total > 0)) return 0;
    function radio(frac) {
      var meta = frac * total, acum = 0;
      for (var i = 0; i < PS1_ANILLOS; i++) {
        if (acum + suma[i] >= meta) {
          var t = suma[i] > 0 ? (meta - acum) / suma[i] : 0;
          return (i + t) * A / PS1_ANILLOS;
        }
        acum += suma[i];
      }
      return A;
    }
    var r50 = radio(0.5);
    if (!(r50 > 0)) return 0;
    return ps1NDeConcentracion(radio(0.9) / r50, A / o.reArcsec);
  }

  /* ── Activación del halo: no toda galaxia lo enseña ─────────────────────────
     Extrapolar el perfil de TODAS pinta halos donde el ojo no ve ninguno. La
     que sí lo enseña es la grande y DIFUSA; una compacta se ve como la trae la
     imagen y punto. Dos condiciones, las dos obligatorias:
       A · eje MENOR de la isofota 25 > PS1.haloMenorMin (′): halo que quepa.
       B · brillo superficial medio > PS1.haloMuFijo: la galaxia es difusa.
     Las dos son propiedades del OBJETO: ni el ocular ni el cielo entran aquí. La
     difusidad de una galaxia no cambia porque el observador se vaya a un sitio
     más oscuro, así que el SQM no pinta nada en el permiso —una versión anterior
     lo metía y cerraba la puerta justo con cielo oscuro, que es cuando el halo
     se ve—. Lo que sí se mueve con el ocular es la rampa de opacidad, que va
     contra el umbral de contraste del ojo (sbUmbralContraste) y se aplica a
     TODAS las galaxias, cumplan o no estas dos condiciones.
     El índice de Sérsic MEDIDO se sigue calculando (columna 12 del catálogo, de
     S4G) y viaja en las medidas, pero NO decide: ninguna de las dos fuentes de n
     separaba los casos que el usuario quiere separados —S4G dejaba fuera a M51 y
     la concentración óptica dejaba dentro a M82—.
     Cuando no se cumplen, el parche se pinta tal cual llegó de PS1 y donde no
     hay dato queda el cielo pelado: exactamente el render de la fase 1, y sin
     recorrer un solo píxel de más. */

  /* Ejes (DIÁMETROS, ′) de la isofota de 25 mag/arcsec² del modelo. El RC3 los
     trae, pero galaxias-datos.js guarda r_e y b/a en su lugar: gen_galaxias.py
     resuelve el uno del otro (resolver_re), así que reconstruirlos aquí del
     mismo modelo devuelve el D25 del catálogo, no una medida nueva. */
  var PS1_MU_ISOFOTA = 25.0;                          // = MU_ISOFOTA del generador
  function ps1EjesArcmin(comps, ba) {
    var r = 0;
    for (var i = 0; i < comps.length; i++) {
      var ri = ps1RadioIsofota(comps[i], PS1_MU_ISOFOTA);
      if (ri > r) r = ri;
    }
    var a = 2 * r / 60, q = (ba > 0 && ba <= 1) ? ba : 1;
    return { a: a, b: a * q };
  }

  /* Brillo superficial MEDIO dentro de esa isofota (mag/arcsec²):
     μ = m + 2,5·log10(π·a·b/4) + 8,89, con a y b los DIÁMETROS en minutos
     (8,89 = 2,5·log10(3600), el paso de arcmin² a arcsec²). */
  function ps1BrilloMedio(magV, aArcmin, bArcmin) {
    if (!(aArcmin > 0 && bArcmin > 0)) return Infinity;
    return magV + 2.5 * Math.log10(Math.PI * aArcmin * bArcmin / 4) + 8.89;
  }

  /* Lo que se mide UNA VEZ por galaxia: los ejes de su isofota 25, su brillo
     medio —que es lo que decide— y el índice de Sérsic medido de S4G, que viaja
     como dato pero no abre ni cierra nada. La n de la imagen (ps1ConcentracionN)
     no se calcula aquí: recorrer el parche entero para un valor que la puerta ya
     no consulta es CPU tirada. */
  function ps1MedidasHalo(gal, comps) {
    var ejes = ps1EjesArcmin(comps || [], gal.ba);
    return {
      aArcmin: ejes.a, bArcmin: ejes.b, n: gal.nMedido > 0 ? gal.nMedido : 0,
      muProm: ps1BrilloMedio(gal.magV, ejes.a, ejes.b)
    };
  }

  /* Las dos condiciones. `gal` = lo que devuelve ps1MedidasHalo, y nada más: no
     entra ningún dato del cielo ni del ocular. Sin medidas o sin ejes, false:
     antes que un halo inventado, ninguno. */
  function ps1HaloActivo(gal) {
    // Una máscara ancha borró parte de la escena: el relleno (1−w)·perfil es
    // OBLIGATORIO o el objeto que se está reproduciendo sale negro (ver
    // ps1MascaraMuerdeEscena). Va por encima del interruptor maestro porque no
    // es el halo voluntario que ese interruptor gobierna —extender el objeto
    // más allá de la imagen—, sino la única regla de fusión permitida: el
    // perfil rellena lo que la imagen no cubre, y aquí la imagen no cubre.
    if (gal && gal.mordida) return true;
    if (!PS1.haloExtrapolado) return false;
    if (!gal || !(gal.bArcmin > PS1.haloMenorMin) || !isFinite(gal.muProm)) return false;
    return gal.muProm > PS1.haloMuFijo;
  }

  /* Brillo superficial (mag/arcsec²) al que un objeto extenso llega al UMBRAL de
     detección del ojo: el flujo Fcielo·Cmin que ya calcula ctxFotometrico. Cmin
     lleva las dos vías por las que la apertura influye en una fuente extensa —la
     luminancia que llega al ojo, vía pupila de salida, y el tamaño aparente, vía
     aumentos— y ninguna de las dos toca el brillo superficial del objeto, que es
     invariante con D. Es el umbral que usa TODA capa difusa (ver
     visibilidadDifusa en pintarFot); aquí se expresa en magnitudes. */
  function sbUmbralContraste(c) { return -2.5 * Math.log10(c.Fcielo * c.Cmin); }

  /* Umbral de detección de Blackwell/Clark aplicado como OPACIDAD: Δ es el
     contraste en magnitudes del píxel sobre el UMBRAL (sbUmbralContraste). Por
     debajo de deltaMin el píxel es indetectable y no se pinta; a partir de
     deltaPlena se pinta entero; en medio, una potencia que desvanece sin borde
     duro. */
  function ps1Opacidad(sbPixel, sbUmbral) {
    var d = sbUmbral - sbPixel;
    if (!(d > PS1.deltaMin)) return 0;
    if (d >= PS1.deltaPlena) return 1;
    return Math.pow((d - PS1.deltaMin) / (PS1.deltaPlena - PS1.deltaMin), PS1.deltaExp);
  }

  /* Mezcla del píxel de la galaxia con el fondo de cielo, hecha sobre el FLUJO.
     La mezcla pedida es de color: nivel = (1−op)·cielo + op·galaxia. Como el
     nivel en pantalla es nivelFondo + valorDeFlujo(F) y las dos conversiones son
     inversas exactas, reescalar el flujo así deja EXACTAMENTE esa mezcla cuando
     pintarFot lo pinte, sin tener que componer RGB aparte ni tocar el resto de
     capas (el halo de un globular se sigue sumando al mismo array). */
  function ps1FlujoConOpacidad(F, op, c) {
    if (op >= 1) return F;
    if (!(op > 0) || !(F > 0)) return 0;
    return flujoDeValor(op * valorDeFlujo(F, c.Fcielo, c.rango), c.Fcielo, c.rango);
  }

  /* Convierte el parche en BRILLO SUPERFICIAL (flujo por arcsec², las mismas
     unidades que Fcielo y que el halo de King) anclando su luz total a la mag V
     del catálogo. Orden obligatorio: cielo restado y estrellas quitadas ANTES de
     integrar; anclar antes metería la luz de las estrellas en el total y apagaría
     la galaxia.
     o: {magV, n, reArcsec, ladoArcmin, escalaAs}. Devuelve Float32Array. */
  function ps1AnclarACatalogo(datos, ancho, alto, o) {
    var cielo = ps1Cielo(datos, ancho, alto);
    /* El corte va en cielo + k·σ, no en el cielo pelado. Recortando en el cielo
       solo sobrevive el ruido POSITIVO, y en un parche grande eso es un pedestal
       falso repartido por todo el campo: en M51, el 21 % del flujo integrado
       venía de donde ya no hay galaxia. Y no es solo fondo sucio —el anclaje
       reparte la luz del catálogo entre ese ruido, así que la galaxia sale más
       floja de lo que dice el catálogo—. Con k=1,5 se apaga el 60 % de los
       píxeles encendidos (casi todos ruido: en M51, del 49 % del parche al
       20 %) por un 3 % de galaxia real, que además el anclaje devuelve al
       reescalar. Por encima de k=2 ya no queda pedestal que quitar y solo se
       come disco externo. */
    var sigma = ps1SigmaCielo(datos, ancho, alto, cielo);
    var suelo = cielo + PS1.kRuido * sigma;
    var corte = cielo - PS1.kAusencia * sigma;
    var neto = new Float32Array(datos.length), suma = 0, i;
    for (i = 0; i < datos.length; i++) {
      var v = datos[i];
      /* Tres casos, no dos. Sin dato (NaN del stack) o SOBRESUSTRAÍDO (más de
         kAusencia·σ por debajo del cielo): AUSENCIA — se conserva NaN para que
         el pintado rellene con el perfil, porque un 0 aquí es una medida falsa
         que además bloquea el relleno (w sigue alto alrededor). Por debajo del
         suelo de ruido pero dentro del ruido: cero, donde la imagen no registró
         nada no se inventa luz, misma regla que flujoDePlaca. El NaN no entra
         en la suma del anclaje, igual que antes no entraba el 0. */
      if (v !== v || v < corte) { neto[i] = NaN; continue; }
      var d = v - suelo;
      neto[i] = d > 0 ? d : 0;
      suma += neto[i];
    }
    if (!(suma > 0) || !(o.magV > 0)) return neto;
    var radioEnRe = (o.reArcsec > 0) ? (o.ladoArcmin * 60 / 2) / o.reArcsec : Infinity;
    var frac = ps1FraccionLuz(o.n, radioEnRe);
    var Ftotal = Math.pow(10, -0.4 * o.magV) * (frac > 0.02 ? frac : 0.02);
    var areaPx = o.escalaAs * o.escalaAs;               // arcsec² por píxel del parche
    var k = Ftotal / (suma * areaPx);                   // DN → flujo por arcsec²
    for (i = 0; i < neto.length; i++) neto[i] *= k;
    return neto;
  }

  /* Suma el parche (flujo por arcsec²) sobre el array `difuso` de pintarFot.
     Muestreo por vecino más próximo y sin giro: con parches de pocos minutos el
     desvío TAN–lineal es de milisegundos de arco, y el giro del marco local queda
     en ~1 px en el peor caso (galaxia a 15′ del centro, δ=70°; ficha 09).

     La FILA del FITS crece hacia el NORTE y en el lienzo el norte está arriba,
     así que la fila se invierte. Sin invertirla la galaxia sale espejada en
     vertical —el brazo de arriba aparece abajo—, y con dos galaxias vecinas
     (M51 y su compañera) el espejo se ve como una copia duplicada: así se
     descubrió. La COLUMNA no se invierte: crece hacia el oeste (PC001001 = −1),
     igual que la x del lienzo.
     Donde la imagen no trae señal —fuera del parche, o dentro pero por debajo
     del suelo de ruido, que ps1AnclarACatalogo deja en cero— se pinta el HALO
     EXTRAPOLADO del perfil del catálogo (ps1ComponentesSersic), hasta
     PS1.muHalo. Solo donde la imagen no llega: donde sí hay medida, manda la
     medida, y así las bandas de polvo y los brazos no los tapa un perfil liso.

     Todo lo que sale de aquí —medido y extrapolado— pasa por el umbral de
     contraste de ps1Opacidad contra el cielo efectivo. Es lo que hace que el
     halo asome al subir aumentos, y también lo que evita un anillo en la unión:
     las dos zonas se desvanecen con la misma ley.

     parche: {datos, ancho, alto, ladoArcmin, ra, dec, comps, pa}.
     o: {ra0, dec0, arcmin, size, cielo} = el campo que se está pintando; `cielo`
     son los mismos parámetros ópticos que recibe pintarFot. */

  /* ── La PSF del telescopio sobre el parche ────────────────────────────────
     El parche de PS1 no es la galaxia: es la galaxia ya convolucionada por el
     stack de PanSTARRS. Lo que falta para que sea lo que ve un ocular es la
     DIFERENCIA entre el borrón del telescopio y el que la imagen ya trae, en
     cuadratura. Cero constantes nuevas: airyArcsec, seeingArcsec y PS1.seeingAs
     ya estaban, y radioImagenEstelar ya las combinaba para las estrellas.

     El borrón que el parche YA trae son DOS cosas: el seeing del stack y el
     propio píxel del recorte, que es una caja de escalaAs de lado. Una caja de
     lado w tiene varianza w²/12, o sea una gaussiana equivalente de FWHM
     w·2,3548/√12. Ignorar el segundo término haría que la resta en cuadratura
     diese de más y el parche saldría con MÁS borrón del que le toca. Ni 2,3548
     (FWHM→σ) ni √12 son constantes físicas: son definición y geometría.

     Si el parche ya viniera más borroso que el telescopio, θ_add sale 0 y no se
     toca nada: no se puede desconvolucionar, y fingir que sí es inventar
     resolución que no existe.

     `desenfocar` NO sirve aquí y su propio comentario lo dice: pasa por un
     canvas de 8 bits y recorta a 0–255. Esto son flujos, no grises. */
  var FWHM_A_SIGMA = 2 * Math.sqrt(2 * Math.LN2);      // 2,3548
  var CAJA_A_FWHM = FWHM_A_SIGMA / Math.sqrt(12);      // 0,6796

  function ps1ThetaAdd(aperturaMm, escalaAs) {
    var tr = 2 * radioImagenEstelar(aperturaMm);       // FWHM del telescopio, ″
    var ps1 = (PS1.seeingAs > 0) ? PS1.seeingAs : 0;
    var caja = (escalaAs > 0 ? escalaAs : 0) * CAJA_A_FWHM;
    var d2 = tr * tr - (ps1 * ps1 + caja * caja);
    return d2 > 0 ? Math.sqrt(d2) : 0;
  }

  /* Gaussiana separable sobre Float32. El borde se replica en vez de rellenarse
     con ceros: con ceros el perímetro del parche se oscurecería, y el borde es
     justo una de las cosas que no debe fabricar estructura.

     Los no finitos se saltan y se renormaliza por el peso que sí se usó. Pero
     además se RESTAURAN al final, y eso no es cosmética: los huecos del stack
     están en el centro de las estrellas saturadas —en NGC 205 la mediana de su
     entorno vale 12473 contra −1,06 del cielo—, así que rellenarlos con su
     propio entorno mete un 4–5 % de flujo que no está en el cielo y pinta
     puntos brillantes inventados. Con la máscara conservada el flujo se queda
     por debajo del 0,3 %. Es el mismo criterio que sigue el bucle de abajo con
     su `if (!(f > 0)) continue;`. */
  function ps1PsfParche(datos, ancho, alto, escalaAs, aperturaMm, sinRestaurar) {
    var fwhm = ps1ThetaAdd(aperturaMm, escalaAs);
    var esc = (escalaAs > 0) ? escalaAs : 1;
    var sigma = fwhm / FWHM_A_SIGMA / esc;             // px del parche
    if (!(sigma > 0.01)) return datos;                 // nada que añadir: el mismo array

    var n = datos.length, i, j, x, y, acc, w, p, val;
    var rad = Math.max(1, Math.ceil(3 * sigma)), m = 2 * rad + 1;
    var k = new Float64Array(m), s = 0;
    for (i = 0; i < m; i++) { k[i] = Math.exp(-((i - rad) * (i - rad)) / (2 * sigma * sigma)); s += k[i]; }
    for (i = 0; i < m; i++) k[i] /= s;

    var tmp = new Float32Array(n), out = new Float32Array(n);
    for (y = 0; y < alto; y++) {                       // horizontal
      for (x = 0; x < ancho; x++) {
        acc = 0; w = 0;
        for (j = 0; j < m; j++) {
          p = x + j - rad;
          if (p < 0) p = 0; else if (p >= ancho) p = ancho - 1;
          val = datos[y * ancho + p];
          if (isFinite(val)) { acc += k[j] * val; w += k[j]; }
        }
        tmp[y * ancho + x] = w > 0 ? acc / w : NaN;
      }
    }
    for (y = 0; y < alto; y++) {                       // vertical
      for (x = 0; x < ancho; x++) {
        acc = 0; w = 0;
        for (j = 0; j < m; j++) {
          p = y + j - rad;
          if (p < 0) p = 0; else if (p >= alto) p = alto - 1;
          val = tmp[p * ancho + x];
          if (isFinite(val)) { acc += k[j] * val; w += k[j]; }
        }
        out[y * ancho + x] = w > 0 ? acc / w : NaN;
      }
    }
    // La máscara original, restaurada exactamente: lo que era hueco vuelve a serlo.
    // `sinRestaurar` (solo ps1ReponerNaN) devuelve lo que la convolución sí sabe
    // del hueco —la media gaussiana de sus vecinos válidos— para poder juzgarla
    // antes de usarla; el camino normal no lo pide y no cambia.
    if (sinRestaurar) return out;
    for (i = 0; i < n; i++) if (!isFinite(datos[i])) out[i] = datos[i];
    return out;
  }

  /* Los datos del parche ya con la PSF de ESTA apertura, cacheados en el propio
     parche. Se calcula una vez por apertura, no por fotograma ni por píxel: sin
     la caché, cada repintado volvería a convolucionar sobre el resultado
     anterior y la borrosidad se acumularía —que es exactamente la doble
     contabilización que hay que evitar—. Por eso también se convoluciona SIEMPRE
     desde `parche.datos`, que no se toca nunca. */
  function ps1DatosConPsf(parche, escalaAs, aperturaMm) {
    var D = (aperturaMm > 0) ? aperturaMm : 0;
    if (!(D > 0)) return parche.datos;
    if (parche.psfD === D && parche.psfDatos) return parche.psfDatos;
    parche.psfDatos = ps1PsfParche(parche.datos, parche.ancho, parche.alto, escalaAs, D);
    parche.psfD = D;
    return parche.psfDatos;
  }

  /* ── Confianza local del vecino ausente (EXPERIMENTAL, PS1.confianzaLocalNaN)
     El punteado claro de M51/M81 nace en la mezcla: un vecino NaN entra con
     peso 0, y su término (1−w)·perfil aporta el perfil ENTERO justo donde los
     otros vecinos del pincel ya traen imagen medida —la estructura acaba
     representada dos veces (INFORME5/INFORME7). Pero NaN sigue siendo ausencia:
     reponer flujo solo es legítimo donde de verdad falta información, no donde
     la vecindad válida ya la trae. Tres puertas, todas sobre lo que el pipeline
     ya calcula:

       w ≥ 0,95            la vecindad está medida            (ps1PesoImagen)
       cobCaja(r5) ≥ 0,8   hueco pequeño, no el borde de uno grande
       κ ≤ 3               lo que la PSF reconstruye no excede lo que la
                           estructura modelada explica

     κ = (rep / mediana del anillo válido 3–8 px) ÷ (perfil / mediana del perfil
     en ese mismo anillo): el exceso local que el modelo NO explica. La razón
     sola no vale —el núcleo de Sérsic sube 5,1 veces sobre su anillo sin nada
     raro—; dividir por la misma razón medida en el perfil cancela la curvatura
     y lo deja en 0,63, mientras el halo de una estrella saturada se queda en
     8,5 o más (M81, 35 px). Devuelve el flujo a reponer en cada ausente, NaN
     donde no procede: allí el pintado sigue siendo el de siempre. */
  var REP_W = 0.95, REP_COB = 0.8, REP_KAPPA = 3, REP_CAJA = 5, REP_R0 = 3, REP_R1 = 8;
  var repAnillo = null;
  function ps1AnilloOffsets() {
    if (repAnillo) return repAnillo;
    repAnillo = [];
    for (var dy = -REP_R1; dy <= REP_R1; dy++) for (var dx = -REP_R1; dx <= REP_R1; dx++) {
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d >= REP_R0 && d <= REP_R1) repAnillo.push(dx, dy);
    }
    return repAnillo;
  }
  function ps1MedianaAnillo(datos, ancho, alto, k) {
    var off = ps1AnilloOffsets(), x = k % ancho, y = (k / ancho) | 0, v = [];
    for (var i = 0; i < off.length; i += 2) {
      var qx = x + off[i], qy = y + off[i + 1];
      if (qx < 0 || qy < 0 || qx >= ancho || qy >= alto) continue;
      var val = datos[qy * ancho + qx];
      if (isFinite(val)) v.push(val);
    }
    if (!v.length) return NaN;
    v.sort(function (a, b) { return a - b; });
    return v[v.length >> 1];
  }
  function ps1ReponerNaN(parche, escalaAs, aperturaMm) {
    var D = (aperturaMm > 0) ? aperturaMm : 0;
    if (!(D > 0) || !parche.peso || !parche.perfil) return null;
    if (parche.repD === D) return parche.repuesto;
    var anc = parche.datos, ancho = parche.ancho, alto = parche.alto, n = anc.length;
    var rep = ps1PsfParche(anc, ancho, alto, escalaAs, D, true);
    // Cobertura de caja con la MISMA caja separable del peso: distingue el
    // hueco suelto rodeado de medida del borde de uno grande, que el kernel de
    // la PSF (±2 px) confunde.
    var ind = new Float32Array(n), i;
    for (i = 0; i < n; i++) ind[i] = isFinite(anc[i]) ? 1 : 0;
    var cob = ps1CajaSeparable(ind, ancho, alto, REP_CAJA);
    var out = new Float32Array(n).fill(NaN);
    for (i = 0; i < n; i++) {
      if (isFinite(anc[i])) continue;
      if (!(parche.peso[i] >= REP_W) || !(cob[i] >= REP_COB) || !isFinite(rep[i])) continue;
      if (!(parche.perfil[i] > 0)) continue;
      var ma = ps1MedianaAnillo(anc, ancho, alto, i);
      var mp = ps1MedianaAnillo(parche.perfil, ancho, alto, i);
      if (!(ma > 0) || !(mp > 0)) continue;
      var kappa = (rep[i] / ma) / (parche.perfil[i] / mp);
      if (kappa <= REP_KAPPA) out[i] = rep[i];
    }
    parche.repuesto = out;
    parche.repD = D;
    return out;
  }

  function ps1PintarParche(difuso, parche, o) {
    var SIZE = o.size, escv = SIZE / (o.arcmin / 60);   // px por grado
    var cos0 = Math.cos(o.dec0 * Math.PI / 180);
    var dra = (((parche.ra - o.ra0 + 540) % 360) - 180) * cos0;
    var cx = SIZE / 2 - dra * escv;                     // misma proyección que dibujar()
    var cy = SIZE / 2 - (parche.dec - o.dec0) * escv;
    var ladoPx = (parche.ladoArcmin / 60) * escv;       // lado del parche en px del render
    if (!(ladoPx > 0.5)) return difuso;
    /* Del lienzo al parche. El lienzo SÍ está al norte (lo fija la proyección de
       cx/cy, igual que dibujar()); el parche no, así que el paso de uno a otro es
       la afín de ps1AfinParche y no un simple cambio de escala. Sin afín se cae
       al supuesto de siempre, que es justo esa escala. */
    var q = parche.ancho / (parche.ladoArcmin * 60);    // px de parche por ″
    var a = parche.afin || { cx: (parche.ancho - 1) / 2, cy: (parche.alto - 1) / 2,
                             xe: -q, xn: 0, ye: 0, yn: q };
    // Sin datos de cielo no hay contraste que medir: se pinta el flujo tal cual
    // (así lo usan los tests de geometría, que no simulan ninguna óptica).
    // El θint del parche entra aquí, en el contexto DE ESTA galaxia: el umbral
    // de la escena (pintarFot) no lo lleva, porque las otras capas difusas no
    // tienen tamaño intrínseco propio. Con FOT.H2C nula el argumento se ignora.
    var c = o.cielo ? ctxFotometrico(o.cielo, parche.thetaIntArcmin) : null;
    var umbral = c ? sbUmbralContraste(c) : 0;   // constante en todo el parche
    var pxPorAs = escv / 3600;
    /* El halo extrapolado y el umbral de contraste son decisiones INDEPENDIENTES.
       `halo` decide si se rellena con el perfil del catálogo lo que la imagen no
       cubre: eso sí depende del tamaño y del brillo medio de la galaxia. La ley
       de visibilidad, en cambio, es la misma para todas —la marca el ojo, no la
       galaxia—, así que el umbral se aplica siempre que haya óptica que simular.
       Antes iban atadas (`if (!halo) c = null`) y el render acababa con DOS leyes
       ópticas conviviendo, con dependencia de apertura de signo contrario. */
    var halo = !!c && ps1HaloActivo(parche.halo);
    var comps = halo ? (parche.comps || []) : [], pa = parche.pa || 0;
    // Peso y reanclaje de la mezcla; sin perfil que mezclar, la imagen va tal cual.
    var peso = halo ? (parche.peso || null) : null;
    var sMezcla = peso ? parche.escalaMezcla : 1;
    var haloPx = ps1RadioHaloAs(comps) * pxPorAs;       // el perfil suele salirse del parche
    var alcance = Math.max(ladoPx / 2, haloPx);
    /* La PSF del telescopio, justo antes de la mezcla imagen/modelo y una sola
       vez por parche. Va en los píxeles del PARCHE, no en los del lienzo, y esa
       es la razón de que no pueda contarse dos veces: el borrón queda fijo en
       segundos de arco, así que al subir aumentos crece en pantalla lo mismo que
       crece la galaxia —aumentar no resuelve, que es lo que hace la naturaleza—
       y ni el campo aparente ni MAG entran en el cálculo.

       La apertura es la misma D que ya usan magLimite y el disco de Airy de las
       estrellas: `render` la pasa tal cual. El respaldo es para un llamador que
       solo traiga el cielo —pupila = D/MAG por definición, así que su producto
       ES D y los aumentos se cancelan: no es una dependencia nueva de MAG, es
       álgebra— y es aproximado, porque el formulario redondea la pupila a 0,1 mm.
       Sin ninguna de las dos no hay óptica que simular y el parche va tal cual. */
    var escParche = (parche.ladoArcmin * 60) / parche.ancho;   // ″/px del recorte
    var D = o.apertura;
    if (!(D > 0) && o.cielo && o.cielo.pupilaSalida > 0 && o.cielo.aumentos > 0) {
      D = o.cielo.pupilaSalida * o.cielo.aumentos;
    }
    var datos = c ? ps1DatosConPsf(parche, escParche, D) : parche.datos;
    /* EXPERIMENTAL (PS1.confianzaLocalNaN): flujo a reponer en los vecinos
       ausentes donde la medida dice que falta información de verdad. Con la
       bandera apagada vale null y el bucle de abajo es el de siempre. */
    var repuesto = (PS1.confianzaLocalNaN && c && peso && comps.length)
      ? ps1ReponerNaN(parche, escParche, D) : null;
    /* Soporte local para la rampa (ver ps1SoporteLocal). Una vez por parche, en
       la rejilla del parche —donde están los datos—, no en la del lienzo. Solo
       alimenta la DECISIÓN de opacidad; el flujo que se pinta sigue siendo el de
       la mezcla, píxel a píxel. */
    var soporte = c ? ps1SoporteLocal(datos, parche.ancho, parche.alto, escParche) : null;
    /* Máscara difusa: pintarFot ya no le aplica visibilidadDifusa —la rampa de
       opacidad es su desvanecido y mide contra el MISMO umbral, así que pasar
       por las dos es contarlo dos veces— y el realce va a gamma completa. No es
       una ley distinta: es la marca de que la ley ya se aplicó. PS1 escribe 0,
       que ES la t de realzarPerceptual (ver difusoMarcado).
       Se marca TODO el parche de la galaxia, imagen incluida, y no solo el trozo
       extrapolado. Partir el objeto en dos leyes por un radio dejaba un ESCALÓN
       en la costura: el anillo de dentro se quedaba a nivel de cielo y el halo de
       fuera saltaba a 10 DN, que en pantalla es un círculo negro rodeado de un
       halo claro (M101 a 146x). Un perfil que decrece hacia fuera tiene que
       pintarse con una sola ley, o la costura se ve.
       Vive en el objeto `cielo` porque es el mismo que luego recibe pintarFot, y
       dura lo que el render: cada galaxia que llega marca sobre la misma. */
    var mascara = c ? difusoMaskDe(o.cielo, difuso.length) : null;
    var x0 = Math.max(0, Math.floor(cx - alcance)), x1 = Math.min(SIZE - 1, Math.ceil(cx + alcance));
    var y0 = Math.max(0, Math.floor(cy - alcance)), y1 = Math.min(SIZE - 1, Math.ceil(cy + alcance));
    for (var y = y0; y <= y1; y++) {
      // El norte es hacia ARRIBA y el este hacia la IZQUIERDA (ver la proyección
      // de cx/cy): los dos desplazamientos van con signo cambiado.
      var norte = -(y - cy) / pxPorAs;
      for (var x = x0; x <= x1; x++) {
        var este = -(x - cx) / pxPorAs;
        /* Remuestreo bilineal sobre la rejilla del PARCHE (medido en
           harness_remuestreo_parche.js: mismo flujo, menos escalonado). Con
           cuatro vecinos ya no hay un `k` único que reutilizar para `peso[k]`:
           cada vecino aporta su mezcla COMPLETA —su flujo y su peso—, y el
           vecino más próximo queda como el caso particular pe = 1. La mezcla
           sigue siendo la de siempre: la imagen manda donde midió, el perfil
           rellena lo que la imagen no cubre, y el tránsito es continuo porque
           el peso lo es (ps1PesoImagen). Fuera del parche el vecino vale flujo
           0 y peso 0 —lo mismo que valía con Math.round—, así que en el borde
           queda el perfil solo, sin costura. El NaN (hueco del stack o
           sobresustracción) recibe el MISMO trato que el de fuera del parche:
           es ausencia, no medida, y el perfil lo rellena (ver el bucle). */
        var fx = a.cx + a.xe * este + a.xn * norte;
        var fy = a.cy + a.ye * este + a.yn * norte;
        var px0 = Math.floor(fx), py0 = Math.floor(fy);
        var tx = fx - px0, ty = fy - py0;
        var fm = comps.length ? ps1FlujoModelo(comps, pa, norte, este) : 0;
        var acc = 0, cubierto = 0;
        for (var vj = 0; vj < 2; vj++) {
          var cvj = vj ? ty : 1 - ty;
          if (!(cvj > 0)) continue;
          var py = py0 + vj;
          for (var vi = 0; vi < 2; vi++) {
            var pe = cvj * (vi ? tx : 1 - tx);
            if (!(pe > 0)) continue;
            var px = px0 + vi, fv = 0, wv = 0;
            if (py >= 0 && py < parche.alto && px >= 0 && px < parche.ancho) {
              var k = py * parche.ancho + px;
              var v = datos[k];
              // El NaN (hueco del stack o sobresustracción, ver
              // ps1AnclarACatalogo) es AUSENCIA: aporta flujo 0 y peso 0, igual
              // que el vecino de fuera del parche, y deja que (1−w)·perfil
              // rellene. Saltarlo y renormalizar NO rellena —el peso no
              // distingue NaN de 0 y dentro del cuerpo w≈1— y era lo que
              // dejaba el foso negro de M51 (INFORME2, experimento A1/A2).
              if (isFinite(v)) { fv = v; wv = peso ? peso[k] : 0; }
              // Ausente con información que reponer (ver ps1ReponerNaN): entra
              // con SU peso, y el perfil solo cubre la parte que ese peso deja.
              else if (repuesto && isFinite(repuesto[k])) { fv = repuesto[k]; wv = peso[k]; }
            }
            acc += pe * (comps.length ? wv * sMezcla * fv + (1 - wv) * fm : fv);
            cubierto += pe;
          }
        }
        if (!(cubierto > 0)) continue;   // punto degenerado (pe=0 en los cuatro)
        var f = acc / cubierto;
        if (!(f > 0)) continue;
        if (c) {
          /* PS1.opacidadInternaEscena (APAGADA, ver PS1): forzar op = 1 dentro
             de la escena convierte la elipse μ=25 en FUENTE de luz — el fondo
             sub-umbral de dentro se resucita entero y se pinta como una
             envolvente alrededor de la galaxia. Medido en M101 a 190×: 380 160
             px del lienzo que estaban a nivel de cielo salían con señal, o sea
             la elipse entera. Con la bandera apagada manda la rampa, dentro y
             fuera, y la galaxia se funde con el fondo por sus estructuras. */
          /* La rampa juzga el brillo del píxel O el de su soporte local, el que
             sea mayor (ps1SoporteLocal). Nunca al revés: el soporte solo puede
             EVITAR que la rampa parta una estructura, nunca oscurecer un píxel
             que ya se veía solo.
             Y no aporta ni un fotón: `f`, lo que se pinta, es el flujo de la
             mezcla sin tocar. Un píxel de fondo sub-umbral rodeado de más fondo
             sub-umbral tiene un soporte igual de bajo que él, así que sigue
             apagándose —por eso esto no resucita la envolvente de μ=25—;
             lo que cambia es el interbrazo pegado al brazo, que deja de cruzar
             la rampa entera en nueve píxeles. */
          var sop = 0;
          if (soporte) {
            var sx = Math.round(fx), sy = Math.round(fy);
            // Solo donde HAY medida: fuera del parche no hay soporte que valga,
            // y arrastrar el del borde metería el brillo del canto en el halo.
            if (sx >= 0 && sx < parche.ancho && sy >= 0 && sy < parche.alto) {
              sop = soporte[sy * parche.ancho + sx];
            }
          }
          var op = (PS1.opacidadInternaEscena && parche.escena &&
                    ps1FuenteEnEscena(parche.escena, a, fx, fy))
            ? 1 : ps1Opacidad(-2.5 * Math.log10(sop > f ? sop : f), umbral);
          f = ps1FlujoConOpacidad(f, op, c);
        }
        if (!(f > 0)) continue;
        difuso[y * SIZE + x] += f;
        if (mascara) mascara[y * SIZE + x] = 0;
      }
    }
    return difuso;
  }

  /* Galaxias del catálogo RC3 que caen en el campo y que PS1 cubre. Cada fila:
     [nombre, alt, RA°, Dec°, r_e″, b/a, PA°, magV, n, B/T, polvo, n medido]. El
     n medido es el de S4G (0 = no hay) y solo lo usa la puerta del halo. El margen de
     medio lado deja entrar a las que asoman por el borde con su centro fuera. */
  /* Galaxias mucho más grandes que el parche: fuera. Con M31 (el parche de 20′
     abarca el 8 % de su luz) se ve por qué: el stack de PanSTARRS resta el fondo
     por skycell y con él el disco extendido —a 8′ del centro la señal ya es
     cielo, cuando el disco exponencial del propio RC3 predice casi el mismo
     brillo que a 1′—, así que el anclaje mete toda esa luz en lo poco que la
     imagen sí trae y sale un bulbo suelto. Juzgado por el usuario, 11-ago-2026.
     Son tres en todo el catálogo al norte de −30°: M31 (8 %), IC 342 (17 %) y
     M33 (23 %); la siguiente ya está en el 66 %. Se quedan sin capa, como
     estaban — y el aviso de la ficha 12 lo dice, así que la ley vive aquí y no
     repetida en los dos sitios. */
  function ps1CabeEnParche(g) {
    /* Toda clase de nebulosa salvo las planetarias exige además lado sin
       recorte: NGC 7000 (semieje ~1,4°) pasaba el corte de fracción (0,41)
       y salía un cuadrado de campo estelar anclado a mag 4,3 sin nebulosa —
       el fenómeno de M31, pero la fracción no lo cazaba porque el ala μ25 del
       modelo n=1 subestima cuánta luz real queda fuera cuando el stack ya
       restó la emisión extendida. Ser compacta no exime: los segmentos del
       Velo (SNR, 6·r_e de 22′ a 330′) llegan igual de recortados. Solo las
       planetarias caben por construcción (su mayor 6·r_e es 11,6′). */
    var clase = g[12] || '';
    if (clase && clase !== 'PN' &&
        PS1.ladoFactor * g[4] / 60 > PS1.ladoMax) return false;
    var lado = ps1LadoArcmin(g[4]);
    return ps1FraccionLuz(g[8], (lado * 60 / 2) / (g[4] > 0 ? g[4] : 1e9)) >= PS1.fracMin;
  }

  /* Catálogo de la capa difusa: galaxias + las nebulosas cuya CLASE ya sabe
     tratar el pipeline. La clase (columna 13 de nebulosas-datos.js, Type del
     OpenNGC) decide qué filas entran, no qué código corre: cada fila de
     nebulosa ES un modelo Sérsic n=1 construido por gen_nebulosas.py con el
     mismo esquema que las galaxias, y de ahí salen escena, anclaje y θint por
     las mismas funciones. Abiertas: 'PN' y 'SNR' (compactas, borde real,
     validadas con M57 y M1), y 'HII'/'EmN'/'RfN' (validadas con M78, NGC 7635
     y NGC 6888: sin borde real, siguen la isofota como las galaxias). Quedan
     fuera 'Neb' y 'Cl+N' —cajón de sastre y mezcla cúmulo+nebulosa—; cada
     apertura exige su validación, no más código. */
  var PS1_CLASES_DIFUSAS = ['PN', 'HII', 'EmN', 'RfN', 'SNR'];

  /* Borde REAL de un objeto compacto (″, semieje mayor), 0 si no lo tiene.
     Una galaxia se acaba donde su perfil cae bajo el ruido —su «borde» es una
     isofota— pero una planetaria o un resto de supernova tienen borde físico:
     la cáscara. Para ellos gen_nebulosas.py resolvió r_e = 0,60·semieje de
     catálogo (espejo: RE_SOBRE_SEMIEJE_COMPACTA), así que el borde se
     recupera exacto. Es lo único que la clase cambia en el montaje: escena y
     θint usan el borde en vez de la isofota μ25 del ala exponencial, que en
     M57 queda 2,8 veces más lejos que la nebulosa y no es el objeto. */
  var PS1_RE_SOBRE_BORDE = 0.60;   // = RE_SOBRE_SEMIEJE_COMPACTA del generador
  var PS1_CLASES_COMPACTAS = ['PN', 'SNR'];   // = COMPACTAS del generador

  function ps1RadioBordeAs(gal) {
    if (!gal || PS1_CLASES_COMPACTAS.indexOf(gal.clase) < 0 || !(gal.reArcsec > 0)) return 0;
    return gal.reArcsec / PS1_RE_SOBRE_BORDE;
  }

  /* θ intrínseco (arcmin, circularizado) del objeto montado: el borde real si
     la clase lo define; si no, la isofota μ25 del modelo, como siempre. */
  function ps1ThetaIntDeGal(gal, comps) {
    var rb = ps1RadioBordeAs(gal);
    if (!(rb > 0)) return ps1ThetaIntArcmin(comps, gal.ba);
    var q = (gal.ba > 0 && gal.ba <= 1) ? gal.ba : 1;
    return (2 * rb / 60) * Math.sqrt(q);
  }

  function ps1CatalogoDifuso(galaxias, nebulosas) {
    var out = (galaxias || []).slice();
    for (var i = 0; i < (nebulosas || []).length; i++) {
      if (PS1_CLASES_DIFUSAS.indexOf(nebulosas[i][12]) >= 0) out.push(nebulosas[i]);
    }
    return out;
  }

  function ps1GalaxiasDelCampo(catalogo, ra0, dec0, arcmin) {
    var out = [], cos0 = Math.cos(dec0 * Math.PI / 180), radio = arcmin / 120;
    for (var i = 0; i < (catalogo || []).length; i++) {
      var g = catalogo[i];
      if (!(g[3] > PS1.decMin)) continue;                       // sin cobertura al sur
      if (!ps1CabeEnParche(g)) continue;
      var lado = ps1LadoArcmin(g[4]);
      var margen = radio + lado / 120;
      var dra = ((((g[2] - ra0) + 540) % 360) - 180) * cos0;
      var ddec = g[3] - dec0;
      if (Math.abs(dra) > margen || Math.abs(ddec) > margen) continue;
      out.push({
        nombre: g[0] || g[1], ra: g[2], dec: g[3], reArcsec: g[4],
        ba: g[5], pa: g[6], magV: g[7], n: g[8], bt: g[9],
        nMedido: g[11] || 0, clase: g[12] || '', ladoArcmin: lado
      });
    }
    return out;
  }

  /* ── Descarga (efectos) ──────────────────────────────────────────────────────
     Una petición por galaxia a ps1-proxy.php, que resuelve las skycells, pide los
     recortes y devuelve el parche ya cosido; de la segunda vez en adelante sale de
     su disco. La caché de aquí es solo de sesión, y la clave es el objeto: el
     parche no depende del ocular ni del aumento. */
  var cachePS1 = {};

  /* Descarga el parche de una galaxia, ya cosido. Resuelve a null si PS1 no lo
     cubre (502 del proxy) o si el servicio no responde: la capa se apaga sola y
     el aviso lo da quien llama. gal: {ra, dec, ladoArcmin, …}. */
  function ps1DescargarParche(gal) {
    var clave = gal.ra.toFixed(5) + ',' + gal.dec.toFixed(5) + ',' + gal.ladoArcmin.toFixed(2);
    if (cachePS1[clave]) return cachePS1[clave];
    var p = fetch(ps1UrlParche(gal)).then(function (r) {
      if (!r.ok) throw new Error('ps1-proxy ' + r.status);
      return r.arrayBuffer();
    }).then(function (buf) {
      var f = parseFITS(buf);
      if (!f) return null;
      f.ra = gal.ra; f.dec = gal.dec; f.ladoArcmin = gal.ladoArcmin;
      if (!(f.escalaAs > 0)) f.escalaAs = gal.ladoArcmin * 60 / f.ancho;
      return f;
    }).catch(function () { return null; });
    cachePS1[clave] = p;
    return p;
  }

  /* Estrellas de Gaia ([ra, dec, g, …][]) en píxeles del parche, con su radio de
     máscara. TODAS las de la muestra, no solo las que el render pinta: mirando el
     resultado (ficha 04, 11-ago-2026) el parche salía granulado de estrellas más
     débiles que el límite del equipo, y eso ensucia más de lo que aporta la luz no
     resuelta que aportaban. Lo que quede por debajo de la profundidad de la
     consulta (magConsultaGaia, tope 20) sí sigue ahí: PS1 llega a g ≈ 23.
     La posición sale de la WCS del propio recorte, evaluando la TAN estrella a
     estrella: son unos cientos y se hace una vez por galaxia, así que aquí no
     hay por qué conformarse con la afín. Con el supuesto anterior —norte arriba
     y centro en el ra/dec pedido— las máscaras de M81 caían 12 px de mediana
     fuera de su estrella (.scratch/estrellas-de-mas/rotacion.js). */
  function ps1EstrellasEnPixeles(f, gal, estrellas) {
    var a = f.afin || ps1AfinParche(f, gal), enPx = [];
    var esc = 1 / Math.hypot(a.xn, a.yn);               // ″ por píxel, giro incluido
    var cos0 = Math.cos(gal.dec * Math.PI / 180);
    for (var i = 0; i < (estrellas || []).length; i++) {
      var e = estrellas[i];
      var p = f.wcs ? ps1CieloAPixel(f.wcs, e[0], e[1]) : null;
      if (!p) {
        var este = ((((e[0] - gal.ra) + 540) % 360) - 180) * cos0 * 3600;
        var norte = (e[1] - gal.dec) * 3600;
        p = [a.cx + a.xe * este + a.xn * norte, a.cy + a.ye * este + a.yn * norte];
      }
      if (p[0] < -8 || p[1] < -8 || p[0] > f.ancho + 8 || p[1] > f.alto + 8) continue;
      // `rAs` además de `rPx`: ps1QuitarEstrellas decide con él cómo rellenar.
      var rAs = ps1RadioMascaraAs(e[2]);
      // `i`: fila de `estrellas` de la que sale esta posición, para que la capa
      // de estrellas pueda excluir exactamente las que el parche conserva.
      enPx.push({ x: p[0], y: p[1], rPx: rAs / esc, rAs: rAs, g: e[2], i: i });
    }
    return enPx;
  }

  /* ¿La fuente (x, y, en píxeles del parche) cae dentro de algún componente de
     la escena? El punto se lleva al cielo con el afín inverso (″ de norte/este,
     giro de la skycell incluido) y se compara su radio elíptico —b/a y PA del
     componente, sobre el semieje mayor, igual que ps1FlujoModelo— con el radio
     isofotal r25As. Comparación de dos números en ″: determinista, sin borde
     rasterizado, el mismo veredicto a cualquier resolución. */
  function ps1FuenteEnEscena(escena, a, x, y) {
    for (var i = 0; i < escena.length; i++) {
      var c = escena[i], dx = x - c.cx, dy = y - c.cy;
      var este = a.ex * dx + a.ey * dy, norte = a.nx * dx + a.ny * dy;
      if (ps1RadioEje(c.cos, c.sin, norte, este, c.ba) <= c.r25As) return true;
    }
    return false;
  }

  /* Filas de `estrellas` que el parche CONSERVA por caer dentro de la escena:
     el mismo veredicto que ps1QuitarEstrellas (misma ps1FuenteEnEscena, mismas
     posiciones enPx), calculado una sola vez. Cada fuente Gaia tiene un único
     propietario visual: si el parche la conserva, la capa de estrellas no debe
     pintarla otra vez encima (ver ps1CapaGalaxias). */
  function ps1FuentesEnEscena(estrellas, enPx, afin, escena) {
    var out = [];
    if (!escena || !escena.length) return out;
    for (var i = 0; i < enPx.length; i++) {
      var e = enPx[i];
      if (ps1FuenteEnEscena(escena, afin, e.x, e.y)) out.push(estrellas[e.i]);
    }
    return out;
  }

  /* ¿Alguna máscara ANCHA (rAs > rellenoPlanoMaxAs) de una fuente que NO se
     conserva muerde la escena difusa? El disco ancho se deja al nivel del cielo
     (ver ps1QuitarEstrellas) confiando en que (1−w)·perfil rellene lo borrado;
     si el disco muerde la escena, ese relleno deja de ser opcional: sin él, el
     objeto que se está reproduciendo sale NEGRO (Abell 12 bajo la máscara de
     μ Orionis: 60″ de disco a 47″ del centro de una cáscara de 19″). El
     veredicto viaja en las medidas del halo y lo consume ps1HaloActivo.
     La comparación suma radios elípticos, así que con b/a < 1 sobreestima el
     contacto: activar el perfil de más es inocuo; no pintarlo, no. */
  function ps1MascaraMuerdeEscena(enPx, a, escena) {
    if (!a || !escena || !escena.length) return false;
    for (var i = 0; i < enPx.length; i++) {
      var e = enPx[i];
      if (!(e.rAs > PS1.rellenoPlanoMaxAs)) continue;
      if (ps1FuenteEnEscena(escena, a, e.x, e.y)) continue;   // conservada: no borra nada
      for (var j = 0; j < escena.length; j++) {
        var c = escena[j];
        // Solo componentes COMPACTOS (borde real: PN, SNR). El borde de una
        // galaxia es una isofota, y sus reglas de fusión imagen/modelo están
        // medidas y cerradas (M81/M104): la mordida no las reabre.
        if (!c.compacta) continue;
        var dx = e.x - c.cx, dy = e.y - c.cy;
        var este = a.ex * dx + a.ey * dy, norte = a.nx * dx + a.ny * dy;
        if (ps1RadioEje(c.cos, c.sin, norte, este, c.ba) <= c.r25As + e.rAs) return true;
      }
    }
    return false;
  }

  /* Compañeras demasiado débiles para el RC3 (BT_MAX de gen_galaxias.py corta
     en 13,0, "no se ve por un ocular") pero SÍ visibles con equipo real —caso
     NGC 7335, B=14,44, junto a NGC 7331— y catalogadas en SIMBAD/NED. Sin
     modelo de Sérsic ni anclaje: solo protegen su núcleo en ps1EscenaEnParche
     con un radio dado, no calculado, para que ps1QuitarEstrellas no lo trate
     como estrella Gaia suelta. Engordar esta lista NO es enmascarar por
     nombre (ver ps1EscenaEnParche/NGC 5195): es dato astrométrico real de una
     fuente que el RC3 no cubre, igual que el propio RC3 es dato real de las
     que sí cubre. Cada fila: [nombre, RA°, Dec°, radio de protección ″ sobre
     el semieje mayor, b/a, PA°]. Fuente: SIMBAD (query 15-ago-2026). */
  var PS1_PROTECCION_SIN_MODELO = [
    ['NGC 7335', 339.33088, 34.44785, 43.3, 0.64, 150]
  ];

  /* Proyección cielo→píxel del parche: WCS del recorte si la hay, afín si no.
     Compartida por los dos orígenes de la escena (catálogo y protección sin
     modelo) para no duplicar la fórmula. */
  function ps1ProyectarEnParche(f, gal, a, cos0, ra, dec) {
    var p = f.wcs ? ps1CieloAPixel(f.wcs, ra, dec) : null;
    if (!p) {
      var este = ((((ra - gal.ra) + 540) % 360) - 180) * cos0 * 3600;
      var norte = (dec - gal.dec) * 3600;
      p = [a.cx + a.xe * este + a.xn * norte, a.cy + a.ye * este + a.yn * norte];
    }
    return p;
  }

  /* Escena difusa del parche: los componentes del catálogo que asoman por él,
     cada uno como elipse isofotal en píxeles del parche. `campo` son las filas
     ya mapeadas de ps1GalaxiasDelCampo (la propia galaxia incluida): así el
     parche de M51 protege también a NGC 5195 sin saber quién es, y una escena
     futura con más componentes difusos (nebulosa + cúmulo asociado) entra por
     la misma puerta. El radio es el de la isofota μ=muEscena del mismo modelo
     de Sérsic que ancla el nivel (r_e del catálogo se resolvió para que esa
     isofota caiga en el D25): la escena es lo que se está REPRODUCIENDO, no
     una opinión sobre a quién pertenece cada estrella.
     El centro sale de la WCS del recorte si la hay, como las estrellas; con el
     afín solo, igual de válido a estas distancias. Componentes cuya elipse no
     toca el parche se descartan: no pueden decidir sobre ninguna fuente.
     Además de `campo`, PS1_PROTECCION_SIN_MODELO aporta compañeras sin
     Sérsic con su propio radio de protección (no calculado, dado). */
  function ps1EscenaEnParche(f, gal, campo) {
    var a = f.afin || ps1AfinParche(f, gal);
    var esc = 1 / Math.hypot(a.xn, a.yn);
    var cos0 = Math.cos(gal.dec * Math.PI / 180);
    var out = [];
    for (var i = 0; i < (campo || []).length; i++) {
      var g = campo[i], r25 = ps1RadioBordeAs(g), borde = r25 > 0;
      if (!borde) {
        var comps = ps1ComponentesSersic(g);
        for (var j = 0; j < comps.length; j++) {
          var r = ps1RadioIsofota(comps[j], PS1.muEscena);
          if (r > r25) r25 = r;
        }
      }
      if (!(r25 > 0)) continue;
      var p = ps1ProyectarEnParche(f, gal, a, cos0, g.ra, g.dec);
      var mPx = r25 / esc;
      if (p[0] < -mPx || p[1] < -mPx || p[0] > f.ancho + mPx || p[1] > f.alto + mPx) continue;
      var paR = (g.pa || 0) * Math.PI / 180;
      out.push({
        cx: p[0], cy: p[1], cos: Math.cos(paR), sin: Math.sin(paR),
        ba: (g.ba > 0 && g.ba <= 1) ? g.ba : 1, r25As: r25,
        // Borde REAL (clases compactas, ver ps1RadioBordeAs): el único caso en
        // que una máscara ancha que muerda la elipse fuerza el perfil
        // (ps1MascaraMuerdeEscena). En una isofota de galaxia no: sus reglas
        // de fusión están medidas aparte y no se cambian desde aquí.
        compacta: borde
      });
    }
    for (var k = 0; k < PS1_PROTECCION_SIN_MODELO.length; k++) {
      var pr = PS1_PROTECCION_SIN_MODELO[k], r25b = pr[3];
      var p2 = ps1ProyectarEnParche(f, gal, a, cos0, pr[1], pr[2]);
      var mPx2 = r25b / esc;
      if (p2[0] < -mPx2 || p2[1] < -mPx2 || p2[0] > f.ancho + mPx2 || p2[1] > f.alto + mPx2) continue;
      var paR2 = (pr[5] || 0) * Math.PI / 180;
      out.push({
        cx: p2[0], cy: p2[1], cos: Math.cos(paR2), sin: Math.sin(paR2),
        ba: (pr[4] > 0 && pr[4] <= 1) ? pr[4] : 1, r25As: r25b
      });
    }
    return out;
  }

  /* Parche listo para pintar: descargado, sin las estrellas ajenas a la escena
     y anclado a la mag V del catálogo. `estrellas` es la muestra de Gaia del
     campo ([ra, dec, g, …][]); `catalogo` (opcional), el catálogo de galaxias:
     de él sale la escena que decide qué fuentes se conservan (las compañeras
     que asoman por el parche incluidas). Sin catálogo, la escena es la propia
     galaxia sola, que ya protege su núcleo. */
  function ps1ParcheDeGalaxia(gal, estrellas, catalogo) {
    return ps1DescargarParche(gal).then(function (f) {
      if (!f) return null;
      // Cómo está puesta la rejilla del recorte respecto al cielo. Una vez por
      // galaxia: no depende del ocular ni del aumento.
      f.afin = ps1AfinParche(f, gal);
      // La escena se busca alrededor de la GALAXIA con el lado de SU parche:
      // entra todo componente catalogado que pueda asomar por él.
      var vecinos = catalogo ? ps1GalaxiasDelCampo(catalogo, gal.ra, gal.dec, gal.ladoArcmin) : [gal];
      var enPx = ps1EstrellasEnPixeles(f, gal, estrellas);
      var escena = ps1EscenaEnParche(f, gal, vecinos);
      var limpio = ps1QuitarEstrellas(f.datos, f.ancho, f.alto, enPx,
        { afin: f.afin, ba: gal.ba, pa: gal.pa, escena: escena });
      var comps = ps1ComponentesSersic(gal);
      var datos = ps1AnclarACatalogo(limpio, f.ancho, f.alto, {
        magV: gal.magV, n: gal.n, reArcsec: gal.reArcsec,
        ladoArcmin: gal.ladoArcmin, escalaAs: f.escalaAs
      });
      /* Peso y reanclaje de la mezcla: una vez por galaxia, no por fotograma ni
         por píxel. Dependen solo del parche y del catálogo, no de la escena. */
      var peso = ps1PesoImagen(datos, f.ancho, f.alto, f.escalaAs);
      var perfil = ps1PerfilEnParche(comps, gal.pa, f.ancho, f.alto, f.afin);
      var halo = ps1MedidasHalo(gal, comps);
      // Máscara ancha sobre la escena: el perfil pasa a ser obligatorio
      // (ps1HaloActivo), o lo borrado al cielo queda negro.
      halo.mordida = ps1MascaraMuerdeEscena(enPx, f.afin, escena);
      return {
        ra: gal.ra, dec: gal.dec, ladoArcmin: gal.ladoArcmin,
        ancho: f.ancho, alto: f.alto, afin: f.afin,
        // Modelo del catálogo para lo de más allá de la imagen (ver
        // ps1PintarParche). Se calcula una vez por galaxia, no por píxel; lo
        // único que falta al pintar es el cielo de la escena.
        comps: comps, pa: gal.pa, halo: halo,
        // Tamaño intrínseco (arcmin) para la ley H2c; inerte con FOT.H2C nula.
        thetaIntArcmin: ps1ThetaIntDeGal(gal, comps),
        peso: peso, escalaMezcla: ps1EscalaMezcla(datos, peso, perfil),
        // El perfil en la rejilla del parche solo lo necesita ps1ReponerNaN, y
        // son 4 MB por galaxia: sin bandera no se guarda.
        perfil: PS1.confianzaLocalNaN ? perfil : null,
        // Fuentes Gaia conservadas dentro de la escena: la capa de estrellas
        // las excluye para no representarlas dos veces (parche + sprite).
        enEscena: ps1FuentesEnEscena(estrellas || [], enPx, f.afin, escena),
        // La misma escena, para PS1.opacidadInternaEscena (unas pocas elipses).
        escena: escena,
        datos: datos
      };
    });
  }

  /* Profundidad de la consulta de Gaia con la capa encendida: la máscara del
     parche necesita TODAS las estrellas que PanSTARRS registra, no solo las que
     este equipo llega a ver. Con un equipo modesto magConsultaGaia se queda en
     15-16 y el parche salía granulado. Pintar no cambia: dibujar() sigue
     cortando en la magnitud límite. El proxy ordena por Gmag, así que si el TOP
     se agota se pierden las débiles, no las brillantes. Lo aplica cada llamador
     a SU consulta, y solo donde la capa se pinta: la vista de placa no la
     necesita. */
  function ps1MagConsulta(mag) {
    return GALAXIAS_IMAGEN ? Math.max(mag, PS1.mascaraProf) : mag;
  }

  /* Fila del RC3 del objeto que se está mirando, si el campo está centrado en
     una galaxia del catálogo. La tolerancia es de 2′ porque el centro del RC3 y
     el del catálogo del simulador no siempre coinciden al segundo. Solo la usa
     el aviso: de las compañeras del campo no se dice nada (en Virgo saldrían
     cinco líneas sobre galaxias que el observador ni buscaba). */
  var APUNTADA_ARCMIN = 2;

  function ps1FilaApuntada(catalogo, ra0, dec0) {
    var cos0 = Math.cos(dec0 * Math.PI / 180), tol = APUNTADA_ARCMIN / 60;
    var mejor = null, dmin = Infinity;
    for (var i = 0; i < (catalogo || []).length; i++) {
      var g = catalogo[i];
      var dra = ((((g[2] - ra0) + 540) % 360) - 180) * cos0;
      var d = Math.hypot(dra, g[3] - dec0);
      if (d <= tol && d < dmin) { dmin = d; mejor = g; }
    }
    return mejor;
  }

  /* Capa de galaxias del campo con su imagen real de PanSTARRS. Vive aquí, y no
     en cada llamador, porque los dos puntos de uso —el simulador y el generador
     de imagen del formulario de registro— tienen que pintar lo mismo; la vez
     anterior se tocó uno y se olvidó el otro.

     El parche tarda segundos, así que el campo de estrellas ya está pintado
     cuando esto arranca y cada galaxia repinta cuando llega la suya; si no
     llega, se queda lo de siempre. La promesa resuelve cuando no queda parche
     pendiente —el formulario la espera para subir la imagen ya completa— y
     nunca rechaza: sin imagen, la vista es la de antes de esta capa.

     `o`: {ra0, dec0, arcmin, size, estrellas, catalogo, vivo}. `vivo` es el
     testigo de que la petición sigue siendo la actual (el observador puede haber
     cambiado de campo mientras el parche viajaba). */
  function ps1CapaGalaxias(difuso, ctx, cielo, capaEst, o) {
    if (!GALAXIAS_IMAGEN) return Promise.resolve({ aviso: '' });
    /* Con imagen real hay luz a TODOS los brillos, y el realce perceptual
       —calibrado contra perfiles sintéticos, que se acaban sobre μ23— la
       inflaba hasta ×13: el brazo externo salía casi tan brillante como el
       disco. De ahí el techo, que solo se aplica cuando hay parche. */
    var cieloParche = {};
    for (var k in cielo) if (Object.prototype.hasOwnProperty.call(cielo, k)) cieloParche[k] = cielo[k];
    cieloParche.realceMax = PS1.realceMax;
    /* Sin catálogo explícito, la capa incluye TAMBIÉN las nebulosas cuya clase
       trata el pipeline: si el defecto fuese solo BITACORA_GALAXIAS, quien no
       lo pasa (el generador de imagen del formulario) nunca vería una
       planetaria como NGC 6905, que sí ve el simulador de oculares. */
    var catalogo = o.catalogo || (typeof window !== 'undefined'
      ? ps1CatalogoDifuso(window.BITACORA_GALAXIAS, window.BITACORA_NEBULOSAS)
      : null);
    var campo = ps1GalaxiasDelCampo(catalogo, o.ra0, o.dec0, o.arcmin);
    var apuntada = ps1FilaApuntada(catalogo, o.ra0, o.dec0);
    var vivo = o.vivo || function () { return true; };
    var apuntadaSinParche = false;
    /* Propietario visual único: las fuentes que un parche conserva dentro de su
       escena salen del dibujo de estrellas antes del repintado, para no verse
       dos veces (en la imagen del parche Y como sprite). Se acumulan entre
       parches —en un campo con varios cada repintado respeta las de todos— y
       la capa se reconstruye de las filas crudas (el raster ya mezclado no se
       puede filtrar). Sin parche no se excluye nada: las estrellas quedan
       pintadas como siempre. */
    var excluidas = [];
    function capaSinExcluidas() {
      if (!excluidas.length || !o.estrellasDibujo || !o.opEstrellas) return capaEst;
      var filtradas = [];
      for (var i = 0; i < o.estrellasDibujo.length; i++) {
        if (excluidas.indexOf(o.estrellasDibujo[i]) === -1) filtradas.push(o.estrellasDibujo[i]);
      }
      return capaEstrellas(filtradas, o.opEstrellas, o.size);
    }
    return Promise.all(campo.map(function (gal) {
      return ps1ParcheDeGalaxia(gal, o.estrellas, catalogo).then(function (parche) {
        var esLaApuntada = !!apuntada && gal.ra === apuntada[2] && gal.dec === apuntada[3];
        if (!parche) { if (esLaApuntada) apuntadaSinParche = true; return; }
        if (!vivo()) return;
        for (var x = 0; x < (parche.enEscena || []).length; x++) {
          if (excluidas.indexOf(parche.enEscena[x]) === -1) excluidas.push(parche.enEscena[x]);
        }
        // `cielo`: el mismo objeto que pinta el fondo. De ahí sale el umbral de
        // contraste de la rampa de opacidad (Fcielo·Cmin); la puerta del halo no
        // mira el cielo, solo el objeto.
        ps1PintarParche(difuso, parche, {
          ra0: o.ra0, dec0: o.dec0, arcmin: o.arcmin, size: o.size, cielo: cieloParche,
          apertura: o.apertura
        });
        pintarFot(difuso, ctx, cieloParche, capaSinExcluidas());
      }).catch(function () { /* una galaxia que falla no tumba el campo entero */ });
    })).then(function () {
      /* Aviso SOLO del objeto apuntado, y con la causa: cambia lo que el
         observador puede hacer. Por el sur no hay nada que esperar; por tamaño
         tampoco, pero el motivo es otro y merece decirse; por caída, sí.
         Fuera del RC3 no se avisa: no había nada prometido. */
      var aviso = '';
      if (apuntada && !(apuntada[3] > PS1.decMin)) {
        aviso = 'sin imagen de cartografiado: PanSTARRS no cubre por debajo de −30° de declinación';
      } else if (apuntada && !ps1CabeEnParche(apuntada)) {
        aviso = 'sin imagen de cartografiado: esta galaxia es mayor que el recorte que sirve PanSTARRS, ' +
          'y el stack pierde su disco exterior al restar el fondo; se muestra el campo sin ella';
      } else if (apuntadaSinParche) {
        aviso = 'el servicio de imágenes no responde; se muestra el campo sin la galaxia';
      }
      return { aviso: aviso };
    });
  }

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

  /* ── Entrada de alto nivel: fondo + consulta + dibujo ── */
  function render(canvas, o) {
    var SIZE = canvas.width;
    var ctx = canvas.getContext('2d');
    var t = (o.transmision > 0) ? o.transmision : (transmisionOptica(o.optica) || TRANSMISION_DEFECTO);
    var arana = (typeof o.arana === 'boolean') ? o.arana : opticaTieneArana(o.optica);
    var fondo = nivelFondo({ pupilaSalida: o.pupilaSalida, pupilaOjo: o.pupilaOjo, sqm: o.sqm, transmision: t });
    var colorFondo = 'rgb(' + fondo + ',' + fondo + ',' + fondo + ')';
    ctx.fillStyle = colorFondo; ctx.fillRect(0, 0, SIZE, SIZE);
    var mlim = magLimite({
      apertura: o.apertura, aumentos: o.aumentos, transmision: t,
      sqm: o.sqm, pupilaOjo: o.pupilaOjo
    });
    var cielo = {
      pupilaSalida: o.pupilaSalida, pupilaOjo: o.pupilaOjo, sqm: o.sqm, transmision: t,
      aumentos: o.aumentos, perceptual: true   // el Canvas-2D produce flujo calibrado, no luma heurística
    };
    return consultar(o.ra, o.dec, o.arcmin, ps1MagConsulta(magConsultaGaia(o.apertura, t, o.aumentos))).then(function (estrellas) {
      /* Campo denso: la banda truncada llega como momentos y entra como velo
         (cielo extra). mlim se recalcula con él: un fondo más brillante
         también quita estrellas del límite. */
      var velo = veloSB(estrellas.fondo);
      if (velo != null) {
        cielo.veloSB = velo;
        mlim = magLimite({
          apertura: o.apertura, aumentos: o.aumentos, transmision: t,
          sqm: o.sqm, pupilaOjo: o.pupilaOjo, veloSB: velo
        });
        fondo = nivelFondo({ pupilaSalida: o.pupilaSalida, pupilaOjo: o.pupilaOjo, sqm: o.sqm, transmision: t, veloSB: velo });
      }
      /* Estrellas y fondo se mapean en una sola curva de tono: el fondo pasa
         por la curva logarítmica y las estrellas se dibujan encima en 8
         bits, saltándosela; por eso el fondo va plano (sin capas difusas). */
      var difuso = new Float32Array(SIZE * SIZE);
      var opEst = {
        ra: o.ra, dec: o.dec, arcmin: o.arcmin, mlim: mlim, afov: o.afov,
        apertura: o.apertura,   // el disco de Airy va como 1/D
        conGlow: (o.conGlow !== false), carbono: !!o.carbono, arana: arana
      };
      var capaEst = capaEstrellas(estrellas, opEst, SIZE);
      pintarFot(difuso, ctx, cielo, capaEst);
      /* La capa de galaxias se espera: la imagen que el formulario sube es la
         que se ve, y si se resolviera antes de que llegue el parche subiría el
         campo sin la galaxia. Si el parche no llega, esto resuelve igual y la
         imagen sale como salía antes de esta capa. */
      return ps1CapaGalaxias(difuso, ctx, cielo, capaEst, {
        ra0: o.ra, dec0: o.dec, arcmin: o.arcmin, size: SIZE, estrellas: estrellas,
        estrellasDibujo: estrellas, opEstrellas: opEst,
        apertura: o.apertura   // la PSF del parche va como 1/D, igual que el disco de Airy
      }).then(function (capa) {
        return { estrellas: estrellas, mlim: mlim, fondo: fondo, aviso: capa.aviso };
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
      if (o.conGaia === false || !(o.apertura > 0)) return r;
      var mlim = 7.7 + 5 * Math.log10(o.apertura / 100);
      return consultar(o.ra, o.dec, arcmin, magConsultaGaia(o.apertura, t, o.aumentos)).then(function (estrellas) {
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
    dibujar: dibujar,
    render: render,
    magLimite: magLimite,
    veloSB: veloSB,
    sumaSB: sumaSB,
    magConsultaGaia: magConsultaGaia,
    nivelFondo: nivelFondo,
    tamLienzo: tamLienzo,
    nivelCielo: nivelCielo,
    tono: TONO,
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
    fraccionFlujo: fraccionFlujo,
    orientacionAsumida: orientacionAsumida,
    valorDeFlujo: valorDeFlujo,
    flujoDeValor: flujoDeValor,
    realzarPerceptual: realzarPerceptual,
    visibilidadDifusa: visibilidadDifusa,
    difusoMarcado: difusoMarcado,
    difusoMaskDe: difusoMaskDe,
    ctxFotometrico: ctxFotometrico,
    thetaRiccoArcmin: thetaRiccoArcmin,
    textura: TEXTURA,
    frecuenciaGranoCdeg: frecuenciaGranoCdeg,
    csfTextura: csfTextura,
    dPrimeTextura: dPrimeTextura,
    pVerTextura: pVerTextura,
    pVerTexturaMinkowski: pVerTexturaMinkowski,
    pintarFot: pintarFot,
    perfilKing: perfilKing,
    areaKing: areaKing,
    pintarCumulo: pintarCumulo,
    granoEn: granoEn,
    visibilidadGrano: visibilidadGrano,
    desenfocar: desenfocar,
    adaptacionLocal: adaptacionLocal,
    fusionarPlacas: fusionarPlacas,
    rellenarNucleo: rellenarNucleo,
    repararNucleos: repararNucleos,
    flujoDePlaca: flujoDePlaca,
    realceDetalle: realceDetalle,
    suave: suave,
    transmisionOptica: transmisionOptica,
    opticaTieneArana: opticaTieneArana,
    urlPlaca: urlPlaca,
    renderPlaca: renderPlaca,
    ps1: PS1,
    ps1LadoArcmin: ps1LadoArcmin,
    ps1UrlParche: ps1UrlParche,
    parseFITS: parseFITS,
    ps1CieloAPixel: ps1CieloAPixel,
    ps1AfinParche: ps1AfinParche,
    ps1Cielo: ps1Cielo,
    ps1SigmaCielo: ps1SigmaCielo,
    ps1RadioMascaraAs: ps1RadioMascaraAs,
    ps1MascaraMuerdeEscena: ps1MascaraMuerdeEscena,
    ps1QuitarEstrellas: ps1QuitarEstrellas,
    ps1FraccionLuz: ps1FraccionLuz,
    ps1ComponentesSersic: ps1ComponentesSersic,
    ps1FlujoModelo: ps1FlujoModelo,
    ps1RadioHaloAs: ps1RadioHaloAs, ps1ThetaIntArcmin: ps1ThetaIntArcmin,
    ps1PesoImagen: ps1PesoImagen,
    ps1PerfilEnParche: ps1PerfilEnParche,
    ps1EscalaMezcla: ps1EscalaMezcla,
    ps1ConcentracionTeorica: ps1ConcentracionTeorica,
    ps1NDeConcentracion: ps1NDeConcentracion,
    ps1ConcentracionN: ps1ConcentracionN,
    ps1EjesArcmin: ps1EjesArcmin,
    ps1BrilloMedio: ps1BrilloMedio,
    ps1MedidasHalo: ps1MedidasHalo,
    ps1HaloActivo: ps1HaloActivo,
    PS1: PS1,
    ps1Opacidad: ps1Opacidad,
    ps1SoporteLocal: ps1SoporteLocal,
    sbUmbralContraste: sbUmbralContraste,
    ps1FlujoConOpacidad: ps1FlujoConOpacidad,
    ps1AnclarACatalogo: ps1AnclarACatalogo,
    ps1PintarParche: ps1PintarParche,
    ps1PsfParche: ps1PsfParche,
    ps1ReponerNaN: ps1ReponerNaN,
    ps1ThetaAdd: ps1ThetaAdd,
    ps1DatosConPsf: ps1DatosConPsf,
    ps1CabeEnParche: ps1CabeEnParche,
    ps1CatalogoDifuso: ps1CatalogoDifuso,
    ps1RadioBordeAs: ps1RadioBordeAs,
    ps1ThetaIntDeGal: ps1ThetaIntDeGal,
    ps1GalaxiasDelCampo: ps1GalaxiasDelCampo,
    ps1EstrellasEnPixeles: ps1EstrellasEnPixeles,
    ps1EscenaEnParche: ps1EscenaEnParche,
    ps1FuenteEnEscena: ps1FuenteEnEscena,
    ps1FuentesEnEscena: ps1FuentesEnEscena,
    ps1DescargarParche: ps1DescargarParche,
    ps1ParcheDeGalaxia: ps1ParcheDeGalaxia,
    ps1MagConsulta: ps1MagConsulta,
    ps1FilaApuntada: ps1FilaApuntada,
    ps1CapaGalaxias: ps1CapaGalaxias,
    dssMaxArcmin: DSS_MAX_ARCMIN,
    set galaxiasImagen(v) { GALAXIAS_IMAGEN = !!v; },
    get galaxiasImagen() { return GALAXIAS_IMAGEN; },
    set proxyUrl(u) { PROXY_URL = u; },
    get proxyUrl() { return PROXY_URL; },
    set dssProxyUrl(u) { DSS_PROXY_URL = u; },
    get dssProxyUrl() { return DSS_PROXY_URL; },
    set ps1ProxyUrl(u) { PS1_PROXY_URL = u; },
    get ps1ProxyUrl() { return PS1_PROXY_URL; }
  };
})();
