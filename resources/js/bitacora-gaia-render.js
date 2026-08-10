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
    /* Dependencia del umbral de contraste con el TAMAÑO APARENTE del objeto.
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
       llena el campo, y por abajo no tiene sentido penalizar sin límite. */
    C_MAG_REF: 100, C_MAG_EXP: 0.5, C_MAG_MIN: 0.45, C_MAG_MAX: 2.0,
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
  function ctxFotometrico(o) {
    var pOjo = o.pupilaOjo || 7, pEf = Math.min(o.pupilaSalida, pOjo);
    var sqm = (o.sqm != null) ? o.sqm : 21;
    var T = (o.transmision > 0) ? o.transmision : TRANSMISION_DEFECTO;
    var dim = Math.pow(pEf / pOjo, 2);
    var Fcielo = Math.pow(10, -0.4 * sqm);
    var Fref = Math.pow(10, -0.4 * 21);
    var Cmin = FOT.C_MIN * Math.pow(Fref / (Fcielo * dim), FOT.C_EXP);
    // Un objeto mayor en la retina se detecta con menos contraste: los aumentos
    // fijan su tamaño aparente. Aquí es donde la apertura extra se nota en los
    // objetos extensos, ya que el brillo superficial no puede subir.
    if (o.aumentos > 0) {
      Cmin *= Math.max(FOT.C_MAG_MIN, Math.min(FOT.C_MAG_MAX,
        Math.pow(FOT.C_MAG_REF / o.aumentos, FOT.C_MAG_EXP)));
    }
    return {
      Fcielo: Fcielo, Fref: Fref, Cmin: Cmin, dim: dim, T: T,
      nivelFondo: nivelCielo(sqm - 2.5 * Math.log10(dim) - 2.5 * Math.log10(T)),
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
     flujo tal cual si la gamma es 1. Ver FOT.GAMMA_PERCEPTUAL para el porqué. */
  function realzarPerceptual(F, Fcielo, rango, s) {
    if (FOT.GAMMA_PERCEPTUAL === 1 || !(F > 0)) return F;
    // s = visibilidadDifusa ya calculada en pintarFot (0 = justo en el umbral,
    // 1 = ya totalmente visible). Sin ella (llamadas antiguas), boost completo
    // como siempre. Con ella, el boost decae hacia gamma=1 (sin boost) según
    // crece s: rescata lo que roza el umbral, no infla lo que ya se ve bien
    // -un núcleo de cúmulo globular resuelto no debe quemarse a blanco-.
    var t = (s == null) ? 0 : Math.max(0, Math.min(1, s));
    var gammaEfectiva = 1 + (FOT.GAMMA_PERCEPTUAL - 1) * (1 - t);
    var nivel = valorDeFlujo(F, Fcielo, rango);
    return flujoDeValor(255 * Math.pow(nivel / 255, gammaEfectiva), Fcielo, rango);
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
      var s = visibilidadDifusa(Fobj[i], c.Fcielo * c.Cmin, perceptual);
      var difuso = Fobj[i] * s;
      /* Realce perceptual del difuso: se expande su nivel en pantalla y se
         devuelve a flujo, para que la suma con las estrellas siga siendo aditiva
         y los núcleos sigan comprimiendo en vez de recortarse. Solo cuando el
         motor declara que su flujo está calibrado (o.perceptual): las placas
         entran por aquí con su heurístico y no deben tocarse. */
      if (perceptual && difuso > 0) difuso = realzarPerceptual(difuso, c.Fcielo, c.rango, s);
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
  function escalaEstrellas(afov) {
    var a = (afov > 0) ? afov : CFG.escalaMagAfov;
    return CFG.escalaMagAfov / a;
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
    var suelo = sueloBase * (1 + blur) * escalaEstrellas(o.afov);
    var sep = +o.sep, arcmin = +o.arcmin, size = +o.size;
    if (sep > 0 && arcmin > 0 && size > 0) {
      var sepPx = sep * size / (arcmin * 60);                           // ″ → px de lienzo
      suelo = Math.min(suelo, Math.max(CFG.radioSueloMin, sepPx * CFG.margenSuelo));
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
    var escala = escalaEstrellas(o.afov);
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
    return consultar(o.ra, o.dec, o.arcmin, magConsultaGaia(o.apertura, t)).then(function (estrellas) {
      /* Estrellas y fondo se mapean en una sola curva de tono: el fondo pasa
         por la curva logarítmica y las estrellas se dibujan encima en 8
         bits, saltándosela; por eso el fondo va plano (sin capas difusas). */
      var difuso = new Float32Array(SIZE * SIZE);
      var capaEst = capaEstrellas(estrellas, {
        ra: o.ra, dec: o.dec, arcmin: o.arcmin, mlim: mlim, afov: o.afov,
        apertura: o.apertura,   // el disco de Airy va como 1/D
        conGlow: (o.conGlow !== false), carbono: !!o.carbono, arana: arana
      }, SIZE);
      pintarFot(difuso, ctx, cielo, capaEst);
      return { estrellas: estrellas, mlim: mlim, fondo: fondo };
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
    dssMaxArcmin: DSS_MAX_ARCMIN,
    set proxyUrl(u) { PROXY_URL = u; },
    get proxyUrl() { return PROXY_URL; },
    set dssProxyUrl(u) { DSS_PROXY_URL = u; },
    get dssProxyUrl() { return DSS_PROXY_URL; }
  };
})();
