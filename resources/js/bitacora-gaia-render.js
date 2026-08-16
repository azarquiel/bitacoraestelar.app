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
 *   BitacoraGaiaRender.magConsultaGaia(apertura, transmision) → number (profundidad de consulta)
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
  // Por encima de GAIA_REQUEST_TIMEOUT del proxy (25s, gaia_proxy.php): si el
  // cliente aborta antes que el propio servidor, una consulta profunda que el
  // servidor SÍ habría terminado se ve como "error de conexión" sin serlo.
  var GAIA_FETCH_TIMEOUT  = 28000;
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
       visto/lateral/no_visto (scripts/campo_h2c.js, docs/ricco/campo/).
       SEEING_AS = 2″ fijo: sin modelo por noche, a propósito.
       H2C = null la apaga y recupera la vía C_MAG histórica, bit a bit:
       solo para regresión. */
    H2C: null, // el literal no puede autorreferirse: se fija a H2C_DEFECTO justo tras el objeto
    H2C_DEFECTO: { THETA_R_A: 0.094, THETA_R_B: 0.081, SEEING_AS: 2.0 },
    // Curva del FONDO DE CIELO (independiente del tono del objeto): el fondo se
    // pinta en función de su brillo superficial en el ocular (SBe, mag/arcsec²,
    // atenuado por la pupila de salida). Por encima de SB_CIELO_NEGRO el fondo es
    // negro total; por debajo se aclara linealmente en magnitudes hasta blanco.
    // SB_CIELO_NEGRO era 22,5, y ese suelo se comía diferencias de cielo que el
    // ojo SÍ ve: en un 18" a 158x la pupila de salida (2,9 mm) y la transmisión
    // ya restan 2,3 mag, así que sqm 21 llega al ojo a SBe 23,3 y sqm 22 a 24,3
    // -los dos por debajo de 22,5, los dos aplastados al mismo negro por el
    // clamp de nivelCielo()-. El observador los distingue de sobra (reporte del
    // usuario: separa 21,2 / 21,4 / 21,6 / 21,8 con ese equipo), porque el ojo
    // adaptado no tiene un suelo absoluto en 22,5: ese número no era el umbral
    // del ojo, era un redondeo.
    // 24,5 abre el rango donde de verdad se observa y deja sqm 22 en ~6 niveles
    // (0,03 % de luminancia en pantalla: negro a efectos prácticos), que casa
    // con el otro extremo del mismo reporte -21,8 vs 22 ya no se separan-. La
    // saturación hacia el negro NO se modela aquí: la aporta la gamma del
    // monitor, que comprime los códigos bajos; la rampa se queda lineal en
    // magnitudes, que es lo que mide el SQM.
    // ponytail: perilla artística, no calibración. Depende de la luz ambiente de
    // quien mire la pantalla. Subirla a 24,8 aclara el extremo oscuro sin llegar
    // al gris franco; 25 ya pinta sqm 22 como gris visible y invierte el orden
    // de discriminación (separa mejor los cielos excelentes que los normales).
    SB_CIELO_NEGRO: 24.5, SB_CIELO_BLANCO: 16.5,
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
    UMBRAL_MARGEN: 0.4, UMBRAL_ANCHURA: 1.4
  };
  FOT.H2C = FOT.H2C_DEFECTO; // H2c activa por defecto (validada en campo)

  function nivelCielo(SBe) {
    var t = (FOT.SB_CIELO_NEGRO - SBe) / (FOT.SB_CIELO_NEGRO - FOT.SB_CIELO_BLANCO);
    return Math.max(0, Math.min(255, 255 * t));
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
  function ctxFotometrico(o, thetaIntArcmin) {
    var pOjo = o.pupilaOjo || 7, pEf = Math.min(o.pupilaSalida, pOjo);
    var sqm = (o.sqm != null) ? o.sqm : 21;
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
      var thR = Math.pow(10, FOT.H2C.THETA_R_A + FOT.H2C.THETA_R_B * SBe);
      var raz = 1 + thR / (thEff * o.aumentos);
      Cmin *= raz * raz;
    } else if (o.aumentos > 0) {
      Cmin *= Math.max(FOT.C_MAG_MIN, Math.min(FOT.C_MAG_MAX,
        Math.pow(FOT.C_MAG_REF / o.aumentos, FOT.C_MAG_EXP)));
    }
    return {
      Fcielo: Fcielo, Fref: Fref, Cmin: Cmin, dim: dim, T: T,
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
      /* Píxel de la capa de galaxias (ps1PintarParche lo marca en o.galaxiaMask):
         su desvanecido YA está aplicado, y es la rampa de ps1Opacidad, que mide
         contra ESTE MISMO umbral (Fcielo·Cmin). Las dos funciones son la misma
         ley con otra forma —las dos dependen solo de log10(F/Fumbral)—, así que
         pasarlo otra vez por visibilidadDifusa es contar dos veces el mismo
         umbral, y entre las dos lo dejaban en 0 DN sobre el cielo en cualquier
         pupila. Aquí la rampa manda sola: sin s y con el realce a gamma completa
         (t=0). Si otra capa difusa cae en el mismo píxel, su luz entra en este
         trato; son unos pocos píxeles y ninguno decide nada. */
      var esGalaxia = !!(o.galaxiaMask && o.galaxiaMask[i]);
      var s = esGalaxia ? 1 : visibilidadDifusa(Fobj[i], c.Fcielo * c.Cmin, perceptual);
      var difuso = Fobj[i] * s;
      /* Realce perceptual del difuso: se expande su nivel en pantalla y se
         devuelve a flujo, para que la suma con las estrellas siga siendo aditiva
         y los núcleos sigan comprimiendo en vez de recortarse. Solo cuando el
         motor declara que su flujo está calibrado (o.perceptual): las placas
         entran por aquí con su heurístico y no deben tocarse. */
      /* El techo se queda puesto también en la galaxia —sigue habiendo imagen
         bajo la misma máscara, y sin él el brazo externo se iguala con el
         disco—; lo que cambia es la gamma, que va completa (t=0) porque el
         desvanecido ya lo hizo la rampa. */
      if (perceptual && difuso > 0) {
        difuso = realzarPerceptual(difuso, c.Fcielo, c.rango, esGalaxia ? 0 : s, o.realceMax);
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
        salida[ch][i] = c.nivelFondo + valorDeFlujo(F, c.Fcielo, c.rango);
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

  /* ── Magnitud límite (método del umbral, Torres Lapasió) ── */
  function magLimite(o) {
    var D = o.apertura, MAG = o.aumentos;
    var t = (o.transmision > 0) ? o.transmision : TRANSMISION_DEFECTO;
    if (!(D > 0) || !(MAG > 0)) return null;
    var sqm = (o.sqm != null) ? o.sqm : 21;
    var SB0T = sqm + 5 * Math.log10(7.5 * MAG / (D * Math.sqrt(t)));
    SB0T = Math.max(sqm, Math.min(27, SB0T));
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
    },
    // Halo de cúmulo globular (perfil de King). rangoMag: magnitudes de margen
    // en la comparación mu(r) vs. magnitud de la estrella (dm) que abarca toda
    // la transición de "sin amortiguar" a "forzada a puntual" (ver dibujar/tPin).
    // magResta: profundidad FIJA (independiente del equipo) para la consulta
    // que alimenta la resta de P4 (ver haloGlobular). restaMaxFrac: tope a la
    // fracción del flujo total que esa resta puede quitar, para que el halo
    // nunca llegue a apagarse del todo.
    globular: {
      rangoMag: 3, magResta: 17, restaMaxFrac: 0.85,
      // gamma(M) = 1 + gammaA·(M/gammaRef)^gammaExp, tope en gammaMax (ver
      // gammaHalo). Valores iniciales: gamma≈1.33 a 100x, ≈1.67 a 200x,
      // ≈2.0 a 300x -ajustar gammaA/gammaRef si el halo aún cierra poco o
      // mucho a los aumentos reales que uses-.
      gammaA: 0.5, gammaRef: 150, gammaExp: 1, gammaMax: 4
    }
  };


  /* Cuánto por debajo de mlim sigue habiendo glow visible (mag), derivado del
     MISMO par de constantes que decide el corte en dibujar(): así la consulta
     y el render siempre están de acuerdo en qué profundidad hace falta. */
  function colaGlowMag() {
    return -2.5 * Math.log10(CFG.glowCorte / CFG.alfaMin);
  }

  /* Profundidad de consulta a Gaia para un equipo dado: el mlim TECHO que ese
     equipo puede alcanzar (cielo más oscuro que admite la UI, aumentos altos
     -Deff y SB0T ya saturan ahí, ver magLimite-) más la cola de glow, más un
     margen de seguridad. Cubre TODO el rango de sqm/aumentos que el usuario
     puede tocar después sin apertura nueva, así no hace falta re-consultar
     cada vez que mueve esos sliders -solo al cambiar de equipo (apertura o
     transmisión, que llegan juntas en teleSel). */
  function magConsultaGaia(apertura, transmision) {
    var techo = magLimite({ apertura: apertura, aumentos: 1e6, transmision: transmision, sqm: GAIA_SQM_MAS_OSCURO });
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
        return (jj.data || []).filter(function (f) { return f[2] != null; });
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

  /* ── Par de una doble: completar lo que Gaia DR3 no trae ─────────────────────
     Gaia satura por arriba. Almaak es el caso que lo destapó: γ And A es una
     gigante K3 muy roja (V 2,3, G ≈ 1,5) y NO está en DR3, así que en un círculo
     de 36″ el catálogo solo devuelve su compañera (G 4,86) y dos estrellas de
     campo. El simulador dibujaba una estrella y el veredicto decía «se resuelve»:
     los dos tenían razón, pero no hablaban del mismo par.

     No es general —Mizar (G 2,28 + 3,91), Achird (3,32 + 6,76) y 65 Psc (6,21 +
     6,24) vienen completas— así que aquí NO se sustituye a Gaia: se completa. Se
     buscan las componentes que el catálogo sí tiene y solo se sintetiza lo que
     falta, para conservar la posición y el COLOR reales de las que están (el
     BP–RP de la compañera de Almaak es −0,04: azul, y ese contraste es media
     gracia del par).

     El ángulo de posición sale del catálogo cuando lo hay (lo trae el WDS, para
     132 de las 289 dobles): la B se coloca a ese ángulo de la A, medido desde el
     Norte hacia el Este. Si el par se completa al revés —la que falta es la
     primaria—, el desplazamiento va a PA+180°. Sin PA se asume uno oblicuo, para
     que el par no salga alineado con los ejes; para el desdoble lo que importa es
     la separación, y la orientación en el ocular depende del montaje, que tampoco
     se modela.

     El COLOR de la componente sintética sale de su tipo espectral con
     BitacoraGaiaColor.bpRpPorTipo, así que el modelo de color sigue siendo la
     única fuente: una K3 del catálogo se pinta igual que una estrella de Gaia con
     ese mismo BP–RP. Sin tipo espectral sale blanca.

     PURA: recibe y devuelve la lista de estrellas, sin tocar la original. */
  var PAR = {
    angulo: 55,        // ° de PA asumido (desde el Norte hacia el Este)
    margenMag: 1.0,    // una componente puede venir hasta 1 mag más débil que mag2
    radioMinBusca: 3   // ″ : suelo del círculo donde se buscan las componentes
  };
  /* null / '' → null, y NO 0: el catálogo deja en null lo que no sabe, y `+null`
     es 0, que como magnitud sería una estrella falsa deslumbrante. */
  function numONulo(v) {
    if (v == null || v === '') return null;
    var n = +v;
    return isFinite(n) ? n : null;
  }
  function parDoble(estrellas, o) {
    var sep = numONulo(o.sep), m1 = numONulo(o.mag1), m2 = numONulo(o.mag2);
    // Sin separación o sin las dos magnitudes no hay par que completar (el
    // catálogo deja ambas en null en muchas múltiples).
    if (sep == null || !(sep > 0) || m1 == null || m2 == null) return estrellas;

    var ra0 = numONulo(o.ra), dec0 = numONulo(o.dec);
    if (ra0 == null || dec0 == null) return estrellas;

    var cos0 = Math.cos(dec0 * Math.PI / 180);
    var radio = Math.max(PAR.radioMinBusca, sep * 1.5) / 3600;   // grados
    var limite = Math.max(m1, m2) + PAR.margenMag;
    var halladas = [];
    for (var i = 0; i < estrellas.length; i++) {
      var e = estrellas[i];
      if (!(e[2] <= limite)) continue;                            // demasiado débil para ser componente
      var dra = (((e[0] - ra0 + 540) % 360) - 180) * cos0, ddec = e[1] - dec0;
      if (dra * dra + ddec * ddec <= radio * radio) halladas.push(e);
    }
    if (halladas.length >= 2) return estrellas;                  // Gaia trae el par: no se toca

    // Desplazamiento de la B respecto de la A: PA del catálogo, o el asumido.
    var paCat = numONulo(o.pa);
    var pa = (paCat != null ? paCat : PAR.angulo) * Math.PI / 180;
    function desplazar(estrella, signo) {
      return [estrella[0] + signo * sep * Math.sin(pa) / (3600 * (cos0 || 1)),
              estrella[1] + signo * sep * Math.cos(pa) / 3600];
    }
    // Color desde el tipo espectral. Guardado por si un caché sirviera una versión
    // vieja del módulo de color: sin color se dibuja blanca, no se cae.
    function bprpDe(tipo) {
      var f = GColor && GColor.bpRpPorTipo;
      return f ? f(tipo) : null;
    }

    var nuevas;
    if (halladas.length === 1) {
      // Falta una: la que peor encaja con la magnitud de la que sí está. Si la que
      // falta es la primaria, va en sentido contrario al PA (que apunta de A a B).
      var hallada = halladas[0], g0 = hallada[2];
      var faltaLaB = Math.abs(g0 - m1) <= Math.abs(g0 - m2);
      var xy = desplazar(hallada, faltaLaB ? 1 : -1);
      nuevas = [[xy[0], xy[1], faltaLaB ? m2 : m1, bprpDe(faltaLaB ? o.spect2 : o.spect1)]];
    } else {
      // No hay ninguna: las dos, con la primaria en las coordenadas del catálogo.
      var a = [ra0, dec0, m1, bprpDe(o.spect1)];
      var xyB = desplazar(a, 1);
      nuevas = [a, [xyB[0], xyB[1], m2, bprpDe(o.spect2)]];
    }
    return estrellas.concat(nuevas);
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
  function dibujarEstrellaColor(ctx, x, y, Rtot, rgb, blur, puntual, esCarbono) {
    var tn = esCarbono ? CFG.tinteNucleoCarbono : CFG.tinteNucleo, col = rgb[0] + ',' + rgb[1] + ',' + rgb[2];
    var centro = Math.round(255 + tn * (rgb[0] - 255)) + ',' + Math.round(255 + tn * (rgb[1] - 255)) + ',' + Math.round(255 + tn * (rgb[2] - 255));
    /* puntual: estrella resuelta dentro del radio de núcleo de un globular
       (ver tPin en dibujar()). Ni con blurMin el degradado normal llega a
       borde 100% duro -dCore=1/(1+blurMin)² sigue dejando ~1/4 del radio con
       una cola de alfa suave-, y el pedido es CERO rastro de halo ahí: disco
       plano de un color, sin gradiente ni caída. */
    if (puntual) {
      ctx.fillStyle = 'rgba(' + centro + ',1)';
      ctx.beginPath(); ctx.arc(x, y, Rtot, 0, 7); ctx.fill();
      return;
    }
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
  /* ═══════════ HALO DE CÚMULO GLOBULAR (perfil de King 1962) ══════════════════
     Σ(r) = I0·[1/√(1+(r/rc)²) − 1/√(1+(rt/rc)²)]², normalizado a 1 en r=0 y a 0
     en r=rt (radio de marea). rc, rt, r en las mismas unidades (aquí, arcsec).
     rt = rc·10^c, con c = concentración de Harris (log10(rt/rc)) — el catálogo
     NO trae rt directo, su columna r_h es el radio de media luz, otra cosa. */
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

  /* Calibra el halo de un cúmulo: brillo superficial central neto (tras restar
     el flujo de las estrellas de Gaia que ya se van a dibujar dentro de r_tidal
     -si no, se cuenta esa luz dos veces, núcleo+estrellas- ver notas de diseño).
     cluster: {rc, rt, muV0} en arcmin/mag·arcsec⁻². estrellas: [ra,dec,g,...][],
     de una consulta a PROFUNDIDAD FIJA (ver CFG.globular.magResta) -NO la del
     equipo del visor-: cuánta luz del cúmulo ya está en estrellas catalogadas
     es una propiedad del cúmulo, no del telescopio con el que se mire esta
     noche. Si dependiera del equipo, cambiar de telescopio cambiaría la
     consulta, y con ella Fresuelto, y el halo podía aparecer o desaparecer de
     golpe sin que el cúmulo hubiera cambiado. Con margen, además, para que la
     resta nunca llegue a apagar el halo del todo (ver restaMaxFrac). */
  function haloGlobular(cluster, estrellas, ra0, dec0, aumentos) {
    var rcAs = cluster.rc * 60, rtAs = cluster.rt * 60;
    var k = rtAs / rcAs;
    var areaAs2 = areaKing(k) * rcAs * rcAs;
    var Ftotal = Math.pow(10, -0.4 * cluster.muV0) * areaAs2;
    var cos0 = Math.cos(dec0 * Math.PI / 180);
    var Fresuelto = 0;
    for (var i = 0; i < estrellas.length; i++) {
      var dra = (((estrellas[i][0] - ra0 + 540) % 360) - 180) * cos0 * 3600;
      var ddec = (estrellas[i][1] - dec0) * 3600;
      if (dra * dra + ddec * ddec <= rtAs * rtAs) Fresuelto += Math.pow(10, -0.4 * estrellas[i][2]);
    }
    Fresuelto = Math.min(Fresuelto, Ftotal * CFG.globular.restaMaxFrac);
    var Fneto = (Ftotal - Fresuelto) / areaAs2;
    // Nótese: Fneto/areaAs2 se calibran con el perfil SIN modificar (gamma no
    // entra aquí), así que subir gamma para la cola externa no descuadra el
    // descuento de estrellas resueltas hecho arriba (ver gammaHalo).
    return { rcAs: rcAs, rtAs: rtAs, Fcentral: Fneto, gamma: gammaHalo(aumentos) };
  }

  /* Potencia extra sobre el perfil normalizado (exp>1 hunde solo la cola
     externa: perfilKing vale 1 en r=0 por construcción, así que ^exp no
     toca el centro -1^exp=1-, y para r>0 los valores <1 caen más rápido
     cuanto mayor exp). Dinámica con los aumentos: a más M, más estrellas del
     halo exterior se resuelven y dejan de aportar luz difusa, así que lo que
     queda debe decaer más rápido con r. gamma(M)=1+A·(M/Mref)^B tiende a 1
     sola cuando M→0 (sin necesidad de umbral duro que rompa continuidad),
     acotada arriba en gammaMax para no vaciar el halo del todo. */
  function gammaHalo(aumentos) {
    var g = CFG.globular;
    if (!(aumentos > 0)) return 1;
    return Math.min(g.gammaMax, 1 + g.gammaA * Math.pow(aumentos / g.gammaRef, g.gammaExp));
  }

  function fobjGlobular(halo, rArcsec) {
    var gamma = (halo.gamma != null) ? halo.gamma : 1;
    return halo.Fcentral * Math.pow(perfilKing(rArcsec, halo.rcAs, halo.rtAs), gamma);
  }

  /* Brillo superficial LOCAL del halo (mag/arcsec²), para comparar directamente
     con la magnitud propia de una estrella (ver amortiguación puntual en
     dibujar): mu(r) YA está "por arcsec²" por definición, así que compararlo
     con la magnitud total de una estrella equivale a preguntarse "¿cuánto pesa
     esta estrella frente a un arcsec² de fondo aquí?" sin ningún factor de
     conversión de área adicional. */
  function muGlobular(halo, rArcsec) {
    var f = fobjGlobular(halo, rArcsec);
    return f > 0 ? -2.5 * Math.log10(f) : Infinity;
  }

  /* Suma el velo del cúmulo (en flujo) sobre el array 'difuso' de pintarFot,
     limitado a su radio de marea en píxeles. o: {ra, dec, arcmin, size} =
     mismo objeto que ya recibe dibujar(); el cúmulo está siempre centrado
     (es el objeto que se está observando). */
  function pintarHaloGlobular(difuso, halo, o) {
    var SIZE = o.size;
    var pxPorAs = (SIZE / (o.arcmin / 60)) / 3600;
    var Rpx = halo.rtAs * pxPorAs;
    if (Rpx < 0.5) return;
    var cx = SIZE / 2, cy = SIZE / 2;
    var x0 = Math.max(0, Math.floor(cx - Rpx)), x1 = Math.min(SIZE - 1, Math.ceil(cx + Rpx));
    var y0 = Math.max(0, Math.floor(cy - Rpx)), y1 = Math.min(SIZE - 1, Math.ceil(cy + Rpx));
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var dx = (x - cx) / pxPorAs, dy = (y - cy) / pxPorAs;
        var rAs = Math.sqrt(dx * dx + dy * dy);
        if (rAs >= halo.rtAs) continue;
        difuso[y * SIZE + x] += fobjGlobular(halo, rAs);
      }
    }
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
    var mascara = new Uint8Array(datos.length), quitar = [], i, e, x, y, cielo = null;
    for (i = 0; i < estrellas.length; i++) {
      e = estrellas[i];
      if (a && escena && ps1FuenteEnEscena(escena, a, e.x, e.y)) continue;   // dentro de la escena: se conserva entera
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
    var out = Float32Array.from ? Float32Array.from(datos) : new Float32Array(datos);
    for (i = 0; i < quitar.length; i++) {
      e = quitar[i];
      var rE = Math.max(1, e.rPx), fondo = null;
      if (e.rAs > PS1.rellenoPlanoMaxAs) {                 // disco ancho: ausencia, que la rellene el perfil
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
    return out;
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
    /* Máscara de los píxeles de la capa de galaxias: pintarFot ya no les aplica
       visibilidadDifusa —la rampa de opacidad es su desvanecido y mide contra el
       MISMO umbral, así que pasar por las dos es contarlo dos veces— y el realce
       va a gamma completa. No es una ley distinta: es la marca de que la ley ya
       se aplicó.
       Se marca TODO el parche de la galaxia, imagen incluida, y no solo el trozo
       extrapolado. Partir el objeto en dos leyes por un radio dejaba un ESCALÓN
       en la costura: el anillo de dentro se quedaba a nivel de cielo y el halo de
       fuera saltaba a 10 DN, que en pantalla es un círculo negro rodeado de un
       halo claro (M101 a 146x). Un perfil que decrece hacia fuera tiene que
       pintarse con una sola ley, o la costura se ve.
       Vive en el objeto `cielo` porque es el mismo que luego recibe pintarFot, y
       dura lo que el render: cada galaxia que llega marca sobre la misma. */
    var mascara = null;
    if (c) {
      if (!(o.cielo.galaxiaMask && o.cielo.galaxiaMask.length === difuso.length)) {
        o.cielo.galaxiaMask = new Uint8Array(difuso.length);
      }
      mascara = o.cielo.galaxiaMask;
    }
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
        if (mascara) mascara[y * SIZE + x] = 1;
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
    var lado = ps1LadoArcmin(g[4]);
    return ps1FraccionLuz(g[8], (lado * 60 / 2) / (g[4] > 0 ? g[4] : 1e9)) >= PS1.fracMin;
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
        nMedido: g[11] || 0, ladoArcmin: lado
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
      var g = campo[i], comps = ps1ComponentesSersic(g), r25 = 0;
      for (var j = 0; j < comps.length; j++) {
        var r = ps1RadioIsofota(comps[j], PS1.muEscena);
        if (r > r25) r25 = r;
      }
      if (!(r25 > 0)) continue;
      var p = ps1ProyectarEnParche(f, gal, a, cos0, g.ra, g.dec);
      var mPx = r25 / esc;
      if (p[0] < -mPx || p[1] < -mPx || p[0] > f.ancho + mPx || p[1] > f.alto + mPx) continue;
      var paR = (g.pa || 0) * Math.PI / 180;
      out.push({
        cx: p[0], cy: p[1], cos: Math.cos(paR), sin: Math.sin(paR),
        ba: (g.ba > 0 && g.ba <= 1) ? g.ba : 1, r25As: r25
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
      return {
        ra: gal.ra, dec: gal.dec, ladoArcmin: gal.ladoArcmin,
        ancho: f.ancho, alto: f.alto, afin: f.afin,
        // Modelo del catálogo para lo de más allá de la imagen (ver
        // ps1PintarParche). Se calcula una vez por galaxia, no por píxel; lo
        // único que falta al pintar es el cielo de la escena.
        comps: comps, pa: gal.pa, halo: ps1MedidasHalo(gal, comps),
        // Tamaño intrínseco (arcmin) para la ley H2c; inerte con FOT.H2C nula.
        thetaIntArcmin: ps1ThetaIntArcmin(comps, gal.ba),
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
    var catalogo = o.catalogo || (typeof window !== 'undefined' ? window.BITACORA_GALAXIAS : null);
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
      if (g > mlim && !conGlow) continue;
      var x = SIZE / 2 - deltaRA(ra) * cos0 * escv;
      var y = SIZE / 2 - (dec - dec0) * escv;
      if (x < -3 || y < -3 || x > SIZE + 3 || y > SIZE + 3) continue;
      if (g > mlim) {
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
      // Dentro de un halo de globular, las estrellas resueltas se ven puntuales
      // pase lo que pase (nunca "difuminadas" por el fondo): amortigua blur y
      // aureola de forma continua según cuánto domina el King local sobre una
      // estrella justo en mlim -sin umbral duro, para no repetir los anillos de
      // implementaciones anteriores (ver perfilKing).
      if (o.globular) {
        var rAsPin = Math.sqrt(Math.pow(deltaRA(ra) * cos0 * 3600, 2) + Math.pow((dec - dec0) * 3600, 2));
        var tPin;
        if (rAsPin <= o.globular.rcAs) {
          // Dentro del radio de núcleo: puntual sin excepción, pase lo que
          // pase con su magnitud -el ojo nunca resuelve halo individual ahí,
          // solo el brillo difuso del cúmulo (ver captura del usuario,
          // 2026-08-01)-.
          tPin = 0;
        } else {
          // Fuera del núcleo: la transición suave de siempre (dm > 0: el
          // fondo es más tenue que la estrella, no amortigua; dm < 0: el
          // fondo pesa más, la empuja a puntual). rangoMag ancha o estrecha
          // la transición -es el "k" a ajustar tras ver M13/M92 en el ocular-.
          var dm = muGlobular(o.globular, rAsPin) - g;
          tPin = suave(0.5 + dm / (2 * CFG.globular.rangoMag));
        }
        blurG = CFG.blurMin + (blurG - CFG.blurMin) * tPin;
      }
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
      if (o.globular) aAur *= tPin;
      if (aAur > 0.004) {
        var Ra = CFG.aureolaRadio * escala;
        dibujarAureola(ctx, x, y, Ra, colEstrella, aAur * ganActual);
      }
      ctx.globalAlpha = Math.min(1, Math.max(CFG.alfaMin, CFG.brillo * Math.min(1, (mlim - g) / CFG.rangoBrillo))) * ganActual * dilucion;
      dibujarEstrellaColor(ctx, x, y, Rtot, colEstrella, blurG, !!(o.globular && tPin === 0), esCarbono);
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
    return consultar(o.ra, o.dec, o.arcmin, ps1MagConsulta(magConsultaGaia(o.apertura, t))).then(function (estrellas) {
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
      return consultar(o.ra, o.dec, arcmin, magConsultaGaia(o.apertura, t)).then(function (estrellas) {
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
    alfaAureola: alfaAureola,
    blurEstrella: blurEstrella,
    colorEstrella: colorEstrella,
    fraccionFlujo: fraccionFlujo,
    parDoble: parDoble,
    par: PAR,
    valorDeFlujo: valorDeFlujo,
    flujoDeValor: flujoDeValor,
    realzarPerceptual: realzarPerceptual,
    visibilidadDifusa: visibilidadDifusa,
    ctxFotometrico: ctxFotometrico,
    pintarFot: pintarFot,
    perfilKing: perfilKing,
    areaKing: areaKing,
    haloGlobular: haloGlobular,
    gammaHalo: gammaHalo,
    fobjGlobular: fobjGlobular,
    muGlobular: muGlobular,
    pintarHaloGlobular: pintarHaloGlobular,
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
