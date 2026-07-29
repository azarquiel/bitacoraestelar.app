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
 *   BitacoraGaiaRender.consultar(ra, dec, arcmin) → Promise<estrellas[]>  (prefetch)
 *   BitacoraGaiaRender.dibujar(ctx, estrellas, opts)   (dibujo puro, sin fondo ni query)
 *   BitacoraGaiaRender.magLimite({ apertura, aumentos, transmision, sqm }) → number|null
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
  // Profundidad de la consulta. 16,5 dejaba corto a un 18", que alcanza 16,5
  // bajo cielo rural: las estrellas que su apertura revela no llegaban a estar en
  // el catálogo. 17 cubre hasta aperturas de ~20"; el tope del proxy es el mismo.
  var GAIA_MAG_MAX        = 17.0;
  // Radio máximo de consulta: 4,32°, o sea 6° de lado, que cubre los oculares de
  // campo ancho y los binoculares. Antes eran 1,44° heredados del tope de 2° del
  // DSS, un límite de PLACA que no aplica a un catálogo. Lo que sí acota de verdad
  // es el TOP de la consulta: en campos ricos la muestra se trunca a magnitudes
  // más brillantes. No es un fallo silencioso — el ORDER BY garantiza que se
  // quedan fuera las más débiles, telonDifuso mide el corte real en vez de
  // suponerlo, y el render avisa si el corte llega antes que la magnitud límite.
  var GAIA_RADIO_MAX      = (360 / 60) * 0.72;
  var GAIA_RADIO_MIN      = 0.12;
  var GAIA_ARCMIN_DEFECTO = 60;
  var GAIA_FETCH_TIMEOUT  = 12000;
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
    C_MAG_REF: 100, C_MAG_EXP: 0.7, C_MAG_MIN: 0.3, C_MAG_MAX: 2.0,
    // Curva del FONDO DE CIELO (independiente del tono del objeto): el fondo se
    // pinta en función de su brillo superficial en el ocular (SBe, mag/arcsec²,
    // atenuado por la pupila de salida). Por encima de SB_CIELO_NEGRO el fondo es
    // negro total; por debajo se aclara linealmente en magnitudes hasta blanco.
    SB_CIELO_NEGRO: 22.5, SB_CIELO_BLANCO: 16.5,
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
      Fcielo: Fcielo, Cmin: Cmin, dim: dim, T: T,
      nivelFondo: nivelCielo(sqm - 2.5 * Math.log10(dim) - 2.5 * Math.log10(T)),
      rango: FOT.SB_NEGRO - FOT.SB_BLANCO
    };
  }

  // Nivel de gris del fondo de cielo (0–255). Mismo cálculo que ctxFotometrico,
  // redondeado, para quien solo necesita rellenar el lienzo.
  function nivelFondo(o) { return Math.round(ctxFotometrico(o).nivelFondo); }

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
  function realzarPerceptual(F, Fcielo, rango) {
    if (FOT.GAMMA_PERCEPTUAL === 1 || !(F > 0)) return F;
    var nivel = valorDeFlujo(F, Fcielo, rango);
    return flujoDeValor(255 * Math.pow(nivel / 255, FOT.GAMMA_PERCEPTUAL), Fcielo, rango);
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
      if (perceptual && difuso > 0) difuso = realzarPerceptual(difuso, c.Fcielo, c.rango);
      for (var ch = 0; ch < canales; ch++) {
        var F = difuso;
        if (estrellas) {
          var v = estrellas[i * 3 + ch];
          if (v > 0) F += flujoDeValor(v, c.Fcielo, c.rango);
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
    blur: 1.1, magColor: 9, tinteNucleo: 0.8,
    carbono: { bprpOffset: 0.9, bprpMin: 3.0 },
    radioMin: 0.42, radioMag: 0.13, radioExp: 1.35, magTamMin: 14, radioMax: 6.5,
    brillo: 1.4, alfaMin: 0.24,
    glowIntensidad: 0.2, glowRadio: 2.0,
    escalaMagCampo: 90, escalaMagMax: 2.0, radioTotalMax: 14,
    spikes: {
      magMax: 10, rango: 5, brazos: 4, angulo: 0,
      longMag: 10, longMax: 180, grosor: 3, lobulos: 2, intensidad: 0.8
    }
  };

  /* ═══════════ TELÓN DIFUSO: LUZ INTEGRADA DE ESTRELLAS NO RESUELTAS ═══════════
     El fondo brillante contra el que se recortan la Gran Grieta, la Pipa o el
     Saco de Carbón NO es emisión de gas: es la luz sumada de las estrellas que ni
     el catálogo trae ni el ojo separa. Sin esta capa, la de polvo no tiene sobre
     qué actuar y el Canvas-2D se queda en gris uniforme.

     No hace falta ningún dataset nuevo: la propia muestra de Gaia del campo lleva
     dentro su función de luminosidad. Como el `ORDER BY Gmag` va ANTES del `TOP`
     en la consulta, la muestra está COMPLETA hasta la magnitud de la última
     estrella que cupo — ese es el límite del que se extrapola, y se mide, no se
     supone.

     Método:
       1. Conteos por magnitud → pendiente b de log10 N(m), medida en una ventana
          alejada del corte para que la truncadura no la sesgue.
       2. Razón R entre el flujo integrado por debajo del corte y el flujo
          observado por encima. Cerrada en forma analítica: el integrando es
          10^((b−0,4)m), porque el número de estrellas sube como 10^(b·m) y el
          flujo de cada una cae como 10^(−0,4·m).
       3. El flujo observado por celda, multiplicado por R, da la luz que falta,
          repartida por donde de verdad hay estrellas.

     El resultado sale en flujo por arcsec², las mismas unidades que Fcielo, y NO
     lleva atenuación de pupila: la aplica ctxFotometrico. */
  var TELON = {
    // Factor de calibración visual. El método fija la FORMA y la razón entre
    // zonas; el nivel absoluto depende de la función de luminosidad real y del
    // enrojecimiento, que no modelamos. Esta es la perilla para cuadrarlo con la
    // Vía Láctea que se ve de verdad.
    k: 1.0,
    // Extremo débil de la integración. Más allá la contribución es despreciable
    // mientras b < 0,4.
    magMax: 28,
    // ponytail: b se acota a este rango. Por encima de 0,4 la integral diverge
    // (más estrellas débiles de las que su flujo decae) y los conteos reales se
    // aplanan a magnitudes débiles por la escala de altura del disco, cosa que una
    // sola recta no captura. Si hiciera falta más fidelidad: función de luminosidad
    // por latitud galáctica en vez de una pendiente única.
    bMin: 0.15, bMax: 0.40,
    bDefecto: 0.30,     // si la muestra es pobre, pendiente típica de campo medio
    minEstrellas: 300,  // por debajo, el ajuste es ruido: mejor no pintar nada
    arcminCelda: 6      // ~13 % de ruido de Poisson; bajarlo lo empeora
  };

  /* Pendiente b de log10 N(m) medida en la muestra, y magnitud de corte (la más
     débil que trae el catálogo, que por el ORDER BY es el límite de completitud). */
  function pendienteConteos(estrellas) {
    var mcat = -Infinity, i;
    for (i = 0; i < estrellas.length; i++) if (estrellas[i][2] > mcat) mcat = estrellas[i][2];
    if (!isFinite(mcat)) return null;
    // Ventana de ajuste: lejos del corte (la última media magnitud sufre la
    // truncadura) y no tan brillante que sean cuatro estrellas.
    var hi = mcat - 0.5, lo = mcat - 4.0, PASO = 0.5;
    var nbins = Math.round((hi - lo) / PASO), bins = new Array(nbins);
    for (i = 0; i < nbins; i++) bins[i] = 0;
    for (i = 0; i < estrellas.length; i++) {
      var g = estrellas[i][2];
      if (g < lo || g >= hi) continue;
      bins[Math.floor((g - lo) / PASO)]++;
    }
    // Regresión de log10(N) contra m sobre los bins poblados.
    var sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0;
    for (i = 0; i < nbins; i++) {
      if (bins[i] < 5) continue;
      var m = lo + (i + 0.5) * PASO, y = Math.log10(bins[i]);
      sx += m; sy += y; sxx += m * m; sxy += m * y; n++;
    }
    var b = (n >= 3 && (n * sxx - sx * sx) !== 0)
      ? (n * sxy - sx * sy) / (n * sxx - sx * sx)
      : TELON.bDefecto;
    return { b: Math.max(TELON.bMin, Math.min(TELON.bMax, b)), mcat: mcat, lo: lo };
  }

  /* Razón entre el flujo de las estrellas que NO están en el catálogo y el de las
     que sí. Integra 10^((b−0,4)m) en ambos tramos. */
  function razonNoResuelta(b, mcat, mlo) {
    var k = b - 0.4;
    if (Math.abs(k) < 1e-6) return (TELON.magMax - mcat) / (mcat - mlo);   // caso límite
    // ∫ₐᵇ 10^(k·m) dm = (10^(k·b) − 10^(k·a)) / (k·ln10). Con k < 0 (el caso
    // normal: el flujo cae más deprisa de lo que suben los conteos) el numerador
    // sale negativo y el denominador también, así que la integral es positiva.
    var kl = k * Math.LN10;
    var integral = function (a, b2) { return (Math.pow(10, k * b2) - Math.pow(10, k * a)) / kl; };
    var arriba = integral(mcat, TELON.magMax);
    var abajo = integral(mlo, mcat);
    return (abajo > 0) ? Math.max(0, arriba / abajo) : 0;
  }

  /* Suavizado de una rejilla pequeña con un núcleo 3×3, para bajar el ruido de
     Poisson sin borrar la estructura de las nubes estelares. */
  function suavizarRejilla(v, N) {
    var out = new Float32Array(v.length);
    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) {
        var s = 0, w = 0;
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            var yy = y + dy, xx = x + dx;
            if (yy < 0 || xx < 0 || yy >= N || xx >= N) continue;
            var p = (dx === 0 && dy === 0) ? 4 : 1;
            s += p * v[yy * N + xx]; w += p;
          }
        }
        out[y * N + x] = s / w;
      }
    }
    return out;
  }

  /* Telón difuso del campo, en flujo por arcsec² (mismas unidades que Fcielo).
     o: { ra, dec, arcmin, size }. Devuelve Float32Array(size²) o null si la
     muestra no da para un ajuste honesto. */
  function telonDifuso(estrellas, o) {
    var SIZE = o.size, arcmin = o.arcmin;
    if (!estrellas || estrellas.length < TELON.minEstrellas) return null;
    var aj = pendienteConteos(estrellas);
    if (!aj) return null;
    var R = razonNoResuelta(aj.b, aj.mcat, aj.lo);
    if (!(R > 0)) return null;

    var N = Math.max(3, Math.min(32, Math.round(arcmin / TELON.arcminCelda)));
    var flujo = new Float32Array(N * N);
    var ra0 = o.ra, dec0 = o.dec;
    var cos0 = Math.cos(dec0 * Math.PI / 180);
    var escc = N / (arcmin / 60);              // celdas por grado
    for (var i = 0; i < estrellas.length; i++) {
      var g = estrellas[i][2];
      if (g < aj.lo) continue;                 // solo el tramo que traza la ventana ajustada
      var dRA = ((estrellas[i][0] - ra0 + 540) % 360) - 180;
      var cx = Math.floor(N / 2 - dRA * cos0 * escc);
      var cy = Math.floor(N / 2 - (estrellas[i][1] - dec0) * escc);
      if (cx < 0 || cy < 0 || cx >= N || cy >= N) continue;
      flujo[cy * N + cx] += Math.pow(10, -0.4 * g);
    }
    flujo = suavizarRejilla(flujo, N);

    // De flujo por celda a flujo por arcsec², ya extrapolado a las no resueltas.
    var ladoCelda = (arcmin * 60) / N;         // arcsec
    var esc = TELON.k * R / (ladoCelda * ladoCelda);
    for (i = 0; i < flujo.length; i++) flujo[i] *= esc;

    // Ampliación bilineal de la rejilla al lienzo.
    var out = new Float32Array(SIZE * SIZE);
    for (var y = 0; y < SIZE; y++) {
      var fy = Math.max(0, Math.min(N - 1.001, (y + 0.5) * N / SIZE - 0.5));
      var y0 = Math.floor(fy), ty = fy - y0, y1 = Math.min(N - 1, y0 + 1);
      for (var x = 0; x < SIZE; x++) {
        var fx = Math.max(0, Math.min(N - 1.001, (x + 0.5) * N / SIZE - 0.5));
        var x0 = Math.floor(fx), tx = fx - x0, x1 = Math.min(N - 1, x0 + 1);
        var a = flujo[y0 * N + x0] * (1 - tx) + flujo[y0 * N + x1] * tx;
        var c = flujo[y1 * N + x0] * (1 - tx) + flujo[y1 * N + x1] * tx;
        out[y * SIZE + x] = a * (1 - ty) + c * ty;
      }
    }
    return out;
  }

  /* ═══════════ HALO NO RESUELTO DE CÚMULOS (PERFIL DE KING) ═══════════════════
     En el núcleo de un cúmulo denso Gaia DR3 está incompleto por AGLOMERACIÓN: no
     separa fuentes tan juntas. Como telonDifuso reparte su luz extrapolada según
     las estrellas observadas, hereda ese agujero justo donde el ojo ve el
     resplandor más fuerte.

     Esta capa NO vuelve a pintar el cúmulo entero — eso sería contar dos veces lo
     que el telón ya puso. Pinta solo el DÉFICIT: la diferencia entre el perfil que
     predice la parte sana del cúmulo y lo que el catálogo trae de verdad.

     Método:
       1. Perfil radial de densidad en anillos.
       2. Radio de aglomeración = donde la densidad deja de crecer hacia dentro.
          En un cúmulo real la densidad sube hasta el centro; si baja, es que el
          catálogo está perdiendo fuentes, no que haya menos estrellas.
       3. Ajuste de King SOLO fuera de ese radio (la zona no sesgada) y
          extrapolación hacia dentro.
       4. Déficit = King − observado, convertido a flujo.

     Si la densidad crece hasta el centro no hay déficit y esta capa no pinta nada:
     el telón ya bastaba. Se autoactiva, sin catálogo de globulares. */
  var KING = {
    k: 1.0,             // calibración visual del halo
    minEstrellas: 400,  // por debajo el perfil radial es ruido
    nAnillos: 18,
    rcMin: 0.02, rcMax: 0.5,   // radio de core, en fracción del radio del campo
    rtMin: 1.0, rtMax: 5.0,    // radio de marea, en múltiplos del radio del campo
    // El campo tiene que estar de verdad concentrado: densidad en el anillo de
    // pico frente al del borde. Evita disparar la capa en campos uniformes, donde
    // el ruido de Poisson basta para que el pico no caiga en el centro.
    concentracionMin: 3,
    // Y la caída hacia el centro tiene que ser apreciable, no un tropiezo del
    // conteo: fracción mínima que baja la densidad del pico al anillo central.
    caidaMin: 0.2,
    // Ante ajustes indistinguibles, quedarse con el MENOS picudo (rc mayor). Desde
    // fuera del core no se puede conocer el core: inventar un pico estrecho
    // sobreilumina el núcleo. Margen de error dentro del cual se consideran empate.
    margenEmpate: 1.10,
    // Cuánto más débiles son, en magnitudes, las estrellas que la aglomeración se
    // lleva respecto a la media de la población. La incompletitud de Gaia en
    // núcleos densos castiga más a las fuentes débiles: sin este término, contar
    // el déficit con el flujo medio del campo sobreestima el halo.
    sesgoDebil: 1.0,
    // Estrellas mínimas por anillo del perfil observado. Con menos, la densidad
    // es ruido de Poisson y aparecen burbujas y anillos al restarla del King.
    minPorAnillo: 12,
    // Y anchura mínima del anillo, como razón r_exterior/r_interior. Sin esto, un
    // anillo que cierra sobre estrellas a radios casi idénticos —normal en un
    // núcleo denso— tiene área casi nula y su densidad se dispara: al restarla
    // abriría un agujero en el centro del cúmulo.
    anchoMinAnillo: 1.05
  };

  /* Flujo medio por estrella de la población que el catálogo pierde, deducido de
     la función de luminosidad MEDIDA en el campo (la misma pendiente b que usa el
     telón), no del flujo medio de lo observado.

       <F> = ∫ 10^(b·m)·10^(−0,4·m) dm / ∫ 10^(b·m) dm      sobre [mlo, mcat]

     y luego desplazado sesgoDebil magnitudes hacia el extremo débil. */
  function flujoMedioNoResuelto(b, mlo, mcat) {
    var k = b - 0.4;
    var num = (Math.abs(k) < 1e-6)
      ? (mcat - mlo)
      : (Math.pow(10, k * mcat) - Math.pow(10, k * mlo)) / k;
    var den = (Math.abs(b) < 1e-6)
      ? (mcat - mlo)
      : (Math.pow(10, b * mcat) - Math.pow(10, b * mlo)) / b;
    if (!(den > 0) || !(num > 0)) return null;
    return (num / den) * Math.pow(10, -0.4 * KING.sesgoDebil);
  }

  /* Perfil de King (1962): densidad superficial de un cúmulo con radio de core rc
     y radio de marea rt. La resta del término de rt es lo que lo hace caer a cero
     en el borde, en vez de extenderse indefinidamente. */
  function formaKing(r, rc, rt) {
    var a = 1 / Math.sqrt(1 + (r / rc) * (r / rc));
    var b = 1 / Math.sqrt(1 + (rt / rc) * (rt / rc));
    var d = a - b;
    return d > 0 ? d * d : 0;
  }

  /* Perfil radial de densidad (estrellas por grado²) alrededor del centro del
     campo, más el flujo medio por estrella, que hace de conversión a luz. */
  function perfilRadial(estrellas, o) {
    var n = KING.nAnillos, rmax = (o.arcmin / 60) / 2;
    var cuenta = new Float64Array(n), flujoAnillo = new Float64Array(n);
    var flujo = 0, dentro = 0;
    var cos0 = Math.cos(o.dec * Math.PI / 180);
    for (var i = 0; i < estrellas.length; i++) {
      var dRA = (((estrellas[i][0] - o.ra + 540) % 360) - 180) * cos0;
      var dDec = estrellas[i][1] - o.dec;
      var r = Math.sqrt(dRA * dRA + dDec * dDec);
      if (r >= rmax) continue;
      var f = Math.pow(10, -0.4 * estrellas[i][2]);
      var iAnillo = Math.floor(r / rmax * n);
      cuenta[iAnillo]++; flujoAnillo[iAnillo] += f;
      flujo += f; dentro++;
    }
    if (dentro < KING.minEstrellas) return null;
    var dens = new Float64Array(n), radio = new Float64Array(n), area = new Float64Array(n);
    var flujoDens = new Float64Array(n);
    for (i = 0; i < n; i++) {
      var r0 = rmax * i / n, r1 = rmax * (i + 1) / n;
      area[i] = Math.PI * (r1 * r1 - r0 * r0);
      dens[i] = cuenta[i] / area[i];
      // Flujo observado por arcsec² en el anillo (área en grados² → arcsec²).
      flujoDens[i] = flujoAnillo[i] / (area[i] * 3600 * 3600);
      radio[i] = (r0 + r1) / 2;
    }
    return {
      dens: dens, radio: radio, area: area, cuenta: cuenta, rmax: rmax,
      flujoDens: flujoDens, flujoMedio: flujo / dentro
    };
  }

  /* Radio a partir del cual el catálogo pierde fuentes: el anillo de densidad
     máxima. Hacia dentro de él la densidad BAJA, que en un cúmulo real no pasa. */
  function radioAglomeracion(dens) {
    var iMax = 0;
    for (var i = 1; i < dens.length; i++) if (dens[i] > dens[iMax]) iMax = i;
    return iMax;
  }

  /* Ajusta King a los anillos NO sesgados (fuera del radio de aglomeración).
     Búsqueda en rejilla de rc y rt; la amplitud k sale lineal por mínimos cuadrados.

     El ajuste va en CUENTAS con χ² de Poisson (peso 1/N), no en densidad absoluta.
     La diferencia no es cosmética: en densidad, el anillo interior es dos órdenes
     de magnitud más denso que el exterior y su residuo domina la suma entera, así
     que ganaba cualquier rc que clavara ese anillo y el perfil se elegía por
     ruido. En cuentas con peso de Poisson todos los anillos pesan lo que deben. */
  function ajustarKing(p, iDesde) {
    var n = p.dens.length, candidatos = [], mejorErr = Infinity;
    for (var a = 0; a < 12; a++) {
      var rc = p.rmax * (KING.rcMin * Math.pow(KING.rcMax / KING.rcMin, a / 11));
      for (var b = 0; b < 6; b++) {
        var rt = p.rmax * (KING.rtMin + (KING.rtMax - KING.rtMin) * b / 5);
        var sm = 0, smm = 0, i, m;
        for (i = iDesde; i < n; i++) {
          m = formaKing(p.radio[i], rc, rt) * p.area[i];        // cuentas del modelo, salvo k
          sm += m; smm += m * m / Math.max(1, p.cuenta[i]);
        }
        if (!(smm > 0)) continue;
        var k = sm / smm;
        if (!(k > 0)) continue;
        var err = 0;
        for (i = iDesde; i < n; i++) {
          m = formaKing(p.radio[i], rc, rt) * p.area[i];
          var d = p.cuenta[i] - k * m;
          err += d * d / Math.max(1, p.cuenta[i]);
        }
        candidatos.push({ rc: rc, rt: rt, k: k, err: err });
        if (err < mejorErr) mejorErr = err;
      }
    }
    if (!candidatos.length) return null;
    /* Desempate conservador: entre los ajustes que los datos no distinguen, el de
       rc MAYOR. Solo se ven los anillos de fuera del core, donde el perfil es casi
       una ley de potencias y rc queda degenerado; quedarse con el rc más pequeño
       daría un pico estrecho inventado y un núcleo sobreiluminado. */
    var mejor = null;
    for (var c = 0; c < candidatos.length; c++) {
      var cand = candidatos[c];
      if (cand.err > mejorErr * KING.margenEmpate) continue;
      if (!mejor || cand.rc > mejor.rc) mejor = cand;
    }
    return mejor;
  }

  /* Globular catalogado (Harris) cuyo centro cae en el campo. El catálogo lo
     inyecta window.BITACORA_GLOBULARES; sin él, todo sigue funcionando por
     conteos. Fila: [id, nombre, RA°, Dec°, r_c('), r_h('), c, mu_V(0)]. */
  function globularEnCampo(o) {
    var cat = window.BITACORA_GLOBULARES;
    if (!cat || !cat.length) return null;
    var medio = (o.arcmin / 60) / 2, cos0 = Math.cos(o.dec * Math.PI / 180);
    for (var i = 0; i < cat.length; i++) {
      var g = cat[i];
      var dRA = (((g[2] - o.ra + 540) % 360) - 180) * cos0, dDec = g[3] - o.dec;
      if (Math.abs(dRA) > medio || Math.abs(dDec) > medio) continue;
      if (!(g[4] > 0) || g[6] == null || g[7] == null) continue;
      return { id: g[0], ra: g[2], dec: g[3], rc: g[4] / 60, c: g[6], muV: g[7] };
    }
    return null;
  }

  /* Halo anclado al BRILLO SUPERFICIAL MEDIDO de un globular catalogado, en vez
     de deducido de conteos sesgados por aglomeración.

     mu_V(0) es la luz TOTAL del centro del cúmulo: incluye las estrellas que Gaia
     sí resuelve y que el render ya dibuja, y las débiles que el telón ya reparte.
     Pintar el perfil entero encima las contaría dos y tres veces. Lo que aporta
     esta capa es solo el RESTO:

       déficit(r) = King_catálogo(r) − flujo observado(r) − telón(r)

     La geometría sale del propio catálogo: r_c y r_t = r_c·10^c. */
  /* Perfil de flujo observado a la escala del CÚMULO, no del campo.

     Con anillos escalados al campo (rmax/n) y un campo ancho, el anillo central
     mide varios arcmin mientras el core mide décimas: el flujo observado del
     centro sale diluido cientos de veces, la resta no quita casi nada y el halo
     se dispara. Por eso los anillos van en escala LOGARÍTMICA desde una fracción
     de r_c: el core queda resuelto se mire con el campo que se mire.

     Devuelve un muestreador continuo (interpolación lineal en log r), no un
     escalón: restar un perfil escalonado de un King continuo deja un salto en
     cada frontera de anillo, y eso se ve como círculos concéntricos. */
  function flujoObservadoCumulo(estrellas, gc, rt, rmaxCampo) {
    var rMax = Math.min(rt, rmaxCampo);
    if (!(rMax > 0)) return null;

    // Radios y flujos de las estrellas del cúmulo, ordenados de dentro afuera.
    var cos0 = Math.cos(gc.dec * Math.PI / 180), muestra = [], i;
    for (i = 0; i < estrellas.length; i++) {
      var dRA = (((estrellas[i][0] - gc.ra + 540) % 360) - 180) * cos0;
      var dDec = estrellas[i][1] - gc.dec;
      var r = Math.sqrt(dRA * dRA + dDec * dDec);
      if (r < rMax) muestra.push([r, Math.pow(10, -0.4 * estrellas[i][2])]);
    }
    if (muestra.length < KING.minPorAnillo) return null;
    muestra.sort(function (a, b) { return a[0] - b[0]; });

    /* Anillos ADAPTATIVOS: se acumulan estrellas hasta juntar minPorAnillo antes
       de cerrar cada anillo. Con anillos de radio fijo, el más interior de un
       cúmulo visto a mucho aumento (o de uno compacto a campo ancho) puede no
       contener NINGUNA estrella: la densidad observada sale 0, no se resta nada,
       el King entra a pelo y aparece una burbuja brillante con un salto en la
       frontera del anillo. Exigiendo un mínimo de estrellas por anillo, cada
       punto del perfil está respaldado por datos y el ruido queda acotado. */
    var radio = [], dens = [], acc = 0, desde = 0, rIni = 0;
    for (i = 0; i < muestra.length; i++) {
      acc += muestra[i][1];
      var ultimo = (i === muestra.length - 1);
      var r1 = ultimo ? rMax : muestra[i][0];
      var bastantes = (i - desde + 1) >= KING.minPorAnillo;
      var bastanteAncho = (rIni <= 0) || (r1 >= rIni * KING.anchoMinAnillo);
      // Cierra el anillo solo con estrellas suficientes Y anchura suficiente. Las
      // dos condiciones hacen falta: la primera acota el ruido de Poisson, la
      // segunda evita el anillo de área casi nula con densidad disparada.
      if (!ultimo && !(bastantes && bastanteAncho)) continue;
      var area = Math.PI * (r1 * r1 - rIni * rIni);
      if (area > 0) {
        radio.push(Math.sqrt((rIni * rIni + r1 * r1) / 2));   // parte el anillo por área
        dens.push(acc / (area * 3600 * 3600));                // flujo por arcsec²
        acc = 0; rIni = r1; desde = i + 1;
      }
    }
    if (radio.length < 2) {
      var plano = dens.length ? dens[0] : 0;
      return function () { return plano; };
    }
    // Suavizado a tres puntos sobre los anillos ya poblados.
    var suave2 = dens.slice();
    for (i = 0; i < dens.length; i++) {
      var a = dens[Math.max(0, i - 1)], c = dens[Math.min(dens.length - 1, i + 1)];
      suave2[i] = (a + 2 * dens[i] + c) / 4;
    }
    /* Muestreador continuo, interpolado en log r: restar un perfil escalonado de
       un King continuo deja un salto por anillo, y eso se ve como círculos. */
    return function (r) {
      if (r <= radio[0]) return suave2[0];
      var ultimo = radio.length - 1;
      if (r >= radio[ultimo]) return suave2[ultimo];
      var lo = 0;
      while (lo < ultimo && radio[lo + 1] < r) lo++;
      var t = (Math.log(r) - Math.log(radio[lo])) / (Math.log(radio[lo + 1]) - Math.log(radio[lo]));
      return suave2[lo] * (1 - t) + suave2[lo + 1] * t;
    };
  }

  function haloCatalogado(gc, estrellas, o, yaPuesto) {
    var rt = gc.rc * Math.pow(10, gc.c);
    var pico = formaKing(0, gc.rc, rt);
    if (!(pico > 0)) return null;
    var observado = flujoObservadoCumulo(estrellas, gc, rt, (o.arcmin / 60) / 2);
    if (!observado) return null;
    var F0 = Math.pow(10, -0.4 * gc.muV);        // flujo por arcsec² en el centro

    /* Perfil radial del déficit, en una rejilla fina y densa hacia el centro
       (r ∝ i²), antes de pintar nada.

       Y se fuerza MONÓTONO no creciente. El halo de un globular no puede brillar
       más lejos del centro; si el déficit crudo sube hacia fuera es un artefacto
       de la resta: el flujo de las estrellas resueltas se descuenta como si fuera
       brillo superficial repartido por el anillo, pero el render las dibuja como
       puntos. En el centro, donde un anillo pequeño puede contener una estrella
       brillante, eso sobre-resta y deja un hoyo rodeado de un anillo claro — la
       burbuja. La cota lo elimina por construcción, no por suavizado. */
    var nR = 256, perfil = new Float64Array(nR), radios = new Float64Array(nR), i;
    for (i = 0; i < nR; i++) {
      var ri = rt * Math.pow(i / (nR - 1), 2);
      radios[i] = ri;
      perfil[i] = Math.max(0, F0 * formaKing(ri, gc.rc, rt) / pico - observado(ri));
    }
    /* Se impone de FUERA HACIA DENTRO (máximo corriente), no al revés. Un mínimo
       corriente desde el centro cumple la misma condición, pero deja que un único
       valor central bajo —precisamente donde la resta se pasa— se propague a todo
       el perfil y aplaste el halo entero: el cúmulo se queda sin nubosidad. Así el
       centro recibe al menos lo que haya justo fuera, y el perfil sigue sin poder
       brillar más lejos del centro. */
    for (i = nR - 2; i >= 0; i--) if (perfil[i] < perfil[i + 1]) perfil[i] = perfil[i + 1];

    /* Y ahora se SUAVIZA, que no es lo mismo que acotar. Un perfil monótono puede
       estar lleno de codos: la cota de arriba crea mesetas, y el flujo observado
       es lineal a trozos entre nodos de anillo. adaptacionLocal es una máscara de
       enfoque y realza precisamente las discontinuidades de PENDIENTE, así que
       cada codo acaba siendo un borde visible — los círculos concéntricos, que se
       ven desnudos con pupila de salida pequeña porque el fondo es negro y el halo
       es lo único en pantalla.
       Tres pasadas de media móvil ≈ una gaussiana. Van sobre la rejilla cuadrática
       (r ∝ i²), así que suavizan más fuerte por fuera, que es donde los anillos
       son anchos, y respetan el pico del núcleo. */
    var ancho = 13, mitad = (ancho - 1) / 2, pasada, tmp = new Float64Array(nR);
    for (pasada = 0; pasada < 4; pasada++) {
      for (i = 0; i < nR; i++) {
        var suma = 0, cuantos = 0;
        for (var d = -mitad; d <= mitad; d++) {
          var jj = i + d;
          if (jj < 0) jj = -jj;                    // espejo en el centro
          if (jj > nR - 1) jj = nR - 1;
          suma += perfil[jj]; cuantos++;
        }
        tmp[i] = suma / cuantos;
      }
      perfil.set(tmp);
    }
    // El suavizado puede introducir subidas mínimas: se vuelve a acotar.
    for (i = nR - 2; i >= 0; i--) if (perfil[i] < perfil[i + 1]) perfil[i] = perfil[i + 1];

    var SIZE = o.size, out = new Float32Array(SIZE * SIZE), hay = false;
    var escPix = (o.arcmin / 60) / SIZE, cos0 = Math.cos(o.dec * Math.PI / 180);
    // Desplazamiento del centro del cúmulo respecto al del campo, en píxeles.
    var offX = (((gc.ra - o.ra + 540) % 360) - 180) * cos0 / escPix;
    var offY = (gc.dec - o.dec) / escPix;
    for (var y = 0; y < SIZE; y++) {
      var dy = (y + 0.5 - SIZE / 2 + offY) * escPix;
      for (var x = 0; x < SIZE; x++) {
        var dx = (x + 0.5 - SIZE / 2 - offX) * escPix;
        var r = Math.sqrt(dx * dx + dy * dy);
        if (r >= rt) continue;
        // Índice en la rejilla cuadrática, con interpolación lineal.
        var f = (nR - 1) * Math.sqrt(r / rt);
        var i0 = Math.max(0, Math.min(nR - 1, Math.floor(f)));
        var i1 = Math.min(nR - 1, i0 + 1), t = f - i0;
        var d = perfil[i0] * (1 - t) + perfil[i1] * t;
        // El telón ya reparte luz aquí: se descuenta también, o se contaría dos
        // veces. Es suave (celdas de ~6'), así que no reintroduce anillos.
        var idx = y * SIZE + x;
        if (yaPuesto) d -= yaPuesto[idx];
        if (d > 0) { out[idx] = KING.k * d; hay = true; }
      }
    }
    return hay ? out : null;
  }

  /* Halo no resuelto del campo, en flujo por arcsec². Devuelve null si no hay
     cúmulo con déficit por aglomeración, que es el caso normal.
     yaPuesto: capas difusas ya calculadas (el telón), para no contarlas dos veces
     en la rama anclada al catálogo. */
  function haloNoResuelto(estrellas, o, yaPuesto) {
    if (!estrellas || estrellas.length < KING.minEstrellas) return null;
    // Con perfil medido en el catálogo no hace falta adivinarlo de los conteos.
    var gc = globularEnCampo(o);
    if (gc) {
      var anclado = haloCatalogado(gc, estrellas, o, yaPuesto);
      if (anclado) return anclado;
    }
    var p = perfilRadial(estrellas, o);
    if (!p) return null;
    var iCrowd = radioAglomeracion(p.dens);
    if (iCrowd < 1) return null;                 // densidad crece hasta el centro: sin déficit
    /* Dos guardas contra el falso positivo. En un campo uniforme el ruido de
       Poisson basta para que el anillo de máxima densidad no sea el central, y sin
       esto la capa se dispararía en cualquier sitio. */
    var pico = p.dens[iCrowd], borde = p.dens[p.dens.length - 1];
    if (!(pico > borde * KING.concentracionMin)) return null;   // el campo no está concentrado
    if (!((pico - p.dens[0]) / pico > KING.caidaMin)) return null;   // la caída al centro es un tropiezo
    var fit = ajustarKing(p, iCrowd);
    if (!fit || !(fit.k > 0)) return null;

    /* Paso de cuentas a luz. La población que falta NO tiene el flujo medio de lo
       observado: la aglomeración se lleva sobre todo fuentes débiles. Se pesa con
       la función de luminosidad medida en el propio campo. Si el ajuste de la
       pendiente no sale (muestra pobre), se cae al flujo medio observado, que es
       peor pero no inventa nada. */
    var lf = pendienteConteos(estrellas);
    var fPorEstrella = lf ? flujoMedioNoResuelto(lf.b, lf.lo, lf.mcat) : null;
    if (!(fPorEstrella > 0)) fPorEstrella = p.flujoMedio;

    // Déficit por anillo interior, en estrellas por grado², y su paso a flujo.
    var deficit = new Float64Array(iCrowd + 1), hay = false;
    for (var i = 0; i <= iCrowd; i++) {
      var d = fit.k * formaKing(p.radio[i], fit.rc, fit.rt) - p.dens[i];
      deficit[i] = d > 0 ? d * fPorEstrella : 0;
      if (deficit[i] > 0) hay = true;
    }
    if (!hay) return null;

    // De densidad por grado² a flujo por arcsec² (mismas unidades que Fcielo).
    var porArcsec2 = 1 / (3600 * 3600);
    var SIZE = o.size, out = new Float32Array(SIZE * SIZE);
    var escPix = (o.arcmin / 60) / SIZE;         // grados por píxel
    var rCorte = p.radio[iCrowd];
    for (var y = 0; y < SIZE; y++) {
      var dy = (y + 0.5 - SIZE / 2) * escPix;
      for (var x = 0; x < SIZE; x++) {
        var dx = (x + 0.5 - SIZE / 2) * escPix;
        var r = Math.sqrt(dx * dx + dy * dy);
        if (r >= rCorte) continue;               // fuera del núcleo: ya lo cubre el telón
        // Interpolación lineal del déficit entre centros de anillo.
        var f = r / p.rmax * p.dens.length - 0.5;
        var i0 = Math.max(0, Math.min(iCrowd, Math.floor(f)));
        var i1 = Math.min(iCrowd, i0 + 1), t = Math.max(0, Math.min(1, f - i0));
        out[y * SIZE + x] = KING.k * (deficit[i0] * (1 - t) + deficit[i1] * t) * porArcsec2;
      }
    }
    return out;
  }

  /* ═══════════ GALAXIAS: PERFIL DE SÉRSIC SINTÉTICO ═══════════════════════════
     Por el ocular una galaxia es un óvalo difuso con el núcleo más brillante:
     brazos y bandas de polvo exigen apertura grande y cielo oscuro. Un perfil
     sintético no es aquí una aproximación barata — es más honesto que una foto
     profunda, y no cuesta ningún asset de imagen.

     Se pinta CUALQUIER galaxia del catálogo que caiga en el campo, no solo la
     apuntada: así M110 acompaña a M31 y NGC 5195 a M51, como en el ocular.

     Cada fila del catálogo (window.BITACORA_GALAXIAS) es
     [nombre, alt, RA°, Dec°, r_e("), b/a, PA°, mag V, n]. */
  var GALAXIA = {
    k: 1.0,          // calibración visual
    muCorte: 30,     // mag/arcsec² por debajo del cual ya no se pinta nada
    // Bulbo: mucho más compacto que su disco, y casi redondo por muy de canto
    // que se vea el disco. Sin él, un Sérsic único con n=1 es un disco
    // exponencial puro y el núcleo no destaca de nada.
    reBulboRel: 0.2, qBulboMin: 0.6,
    /* Núcleo suavizado, como fracción del r_e del bulbo. Un de Vaucouleurs puro
       tiene una punta infinita en r=0 (I(0) = 2100·I_e): sin suavizar, el núcleo
       salía a 14,6 mag/arcsec², más brillante que cualquier galaxia real. El
       suavizado representa que ni el seeing ni el ojo resuelven ese pico. */
    nucleoSuave: 0.08,
    // Banda de polvo de las espirales de canto. El polvo se concentra en el plano
    // medio, mucho más fino que el disco estelar: de ahí una franja estrecha.
    // Absorbe, no emite, así que MULTIPLICA.
    polvoGrosor: 0.25,      // fracción de la altura de escala del disco de canto
    polvoAbsorcion: 0.7,    // fracción de luz del disco que quita en su centro
    /* Al bulbo le quita menos: está centrado en el plano, así que solo la mitad
       de su luz sale por detrás de la capa de polvo. Con 0 el núcleo quedaría
       intacto y la banda no lo cruzaría, cosa que en NGC 891 sí hace. */
    polvoSobreBulbo: 0.5
  };

  function bSersic(n) { return 2 * n - 1 / 3 + 0.009876 / n; }

  // Γ(x) por Lanczos: hace falta para normalizar el perfil a la luz total.
  function gamma(x) {
    var g = [676.5203681218851, -1259.1392167224028, 771.32342877765313,
             -176.61502916214059, 12.507343278686905, -0.13857109526572012,
             9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
    x -= 1;
    var a = 0.99999999999980993, t = x + 7.5;
    for (var i = 0; i < g.length; i++) a += g[i] / (x + i + 1);
    return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
  }

  // L_total = I_e · r_e² · factorLuz(n) · (b/a)
  function factorLuz(n) {
    var b = bSersic(n);
    return 2 * Math.PI * n * Math.exp(b) * gamma(2 * n) / Math.pow(b, 2 * n);
  }

  /* Objetos de perfil elíptico cuyo disco solapa el campo, con su radio de corte
     ya calculado. Se incluyen los de centro FUERA del campo cuyo halo entra: en
     un campo ancho el borde de M31 aparece aunque su núcleo quede fuera.
     Sirve a galaxias y a nebulosas: comparten esquema de fila, y una nebulosa es
     un Sérsic de n = 0,5 (gaussiana) sin bulbo ni banda de polvo. */
  function galaxiasEnCampo(o, cat) {
    cat = cat || window.BITACORA_GALAXIAS;
    if (!cat || !cat.length) return [];
    var medio = (o.arcmin / 60) / 2, cos0 = Math.cos(o.dec * Math.PI / 180);
    var fuera = Math.pow(10, -0.4 * GALAXIA.muCorte), lista = [];
    for (var i = 0; i < cat.length; i++) {
      var g = cat[i], re = g[4], q = g[5], magV = g[7], n = g[8];
      var fracBulbo = (g[9] != null) ? g[9] : 0, polvo = !!g[10];
      if (!(re > 0) || !(q > 0) || !(n > 0)) continue;
      var dRA = (((g[2] - o.ra + 540) % 360) - 180) * cos0, dDec = g[3] - o.dec;
      var fTotal = Math.pow(10, -0.4 * magV);
      // Disco: Sérsic n con el r_e del catálogo. Bulbo: de Vaucouleurs compacto.
      var reB = re * GALAXIA.reBulboRel, qB = Math.max(q, GALAXIA.qBulboMin);
      var iD = (fracBulbo < 1) ? fTotal * (1 - fracBulbo) / (re * re * factorLuz(n) * q) : 0;
      var iB = (fracBulbo > 0) ? fTotal * fracBulbo / (reB * reB * factorLuz(4) * qB) : 0;
      // Radio de corte: el mayor de los dos, invirtiendo cada Sérsic.
      var rMax = 0;
      if (iD > 0) {
        var dD = 1 - Math.log(fuera / iD) / bSersic(n);
        if (dD > 0) rMax = Math.max(rMax, re * Math.pow(dD, n));
      }
      if (iB > 0) {
        var dB = 1 - Math.log(fuera / iB) / bSersic(4);
        if (dB > 0) rMax = Math.max(rMax, reB * Math.pow(dB, 4));
      }
      if (!(rMax > 0)) continue;
      rMax = Math.min(rMax, (o.arcmin / 60) * 3 * 3600);
      var rGrados = rMax / 3600;
      if (Math.abs(dRA) > medio + rGrados || Math.abs(dDec) > medio + rGrados) continue;
      /* Espirales de canto: disco EXPONENCIAL SEPARABLE, no elipse de Sérsic.
         Las isofotas elípticas se afilan hasta un punto en los extremos, así que
         una banda de polvo de grosor constante acaba tapando todo el grosor allí
         y la galaxia sale partida en dos cuñas. Un disco de canto real tiene
         grosor casi constante y cae exponencialmente en las dos direcciones:
             I(u,v) = I0 · exp(−|u|/h_r) · exp(−|v|/h_z)
         con h_r = r_e/1,678 (relación r_e–escala del perfil exponencial) y la
         normalización 4·I0·h_r·h_z, que conserva la luz total del catálogo. */
      var deCanto = polvo, hR = 0, hZ = 0, i0 = 0;
      if (deCanto && iD > 0) {
        hR = re / 1.678; hZ = hR * q;
        i0 = fTotal * (1 - fracBulbo) / (4 * hR * hZ);
      }
      lista.push({
        dRA: dRA, dDec: dDec, re: re, q: q, n: n, iD: iD,
        reB: reB, qB: qB, iB: iB, rMax: rMax, r0B: reB * GALAXIA.nucleoSuave,
        deCanto: deCanto, hR: hR, hZ: hZ, i0: i0,
        polvo: polvo, hPolvo: (deCanto ? hZ : re * q) * GALAXIA.polvoGrosor,
        pa: g[6] * Math.PI / 180, nombre: g[0]
      });
    }
    return lista;
  }

  /* Capa de objetos elípticos del campo, en flujo por arcsec². Sin atenuación de
     pupila: la aplica ctxFotometrico. */
  function capaGalaxias(o, cat) {
    var lista = galaxiasEnCampo(o, cat);
    if (!lista.length) return null;
    var SIZE = o.size, out = new Float32Array(SIZE * SIZE);
    var escArc = (o.arcmin * 60) / SIZE;      // arcsec por píxel
    for (var k = 0; k < lista.length; k++) {
      var G = lista[k], b = bSersic(G.n), invN = 1 / G.n, bB = bSersic(4);
      // Centro de la galaxia en píxeles (norte arriba, este a la izquierda).
      var cx = SIZE / 2 - (G.dRA * 3600) / escArc;
      var cy = SIZE / 2 - (G.dDec * 3600) / escArc;
      var radioPx = G.rMax / escArc;
      var x0 = Math.max(0, Math.floor(cx - radioPx)), x1 = Math.min(SIZE - 1, Math.ceil(cx + radioPx));
      var y0 = Math.max(0, Math.floor(cy - radioPx)), y1 = Math.min(SIZE - 1, Math.ceil(cy + radioPx));
      var senPA = Math.sin(G.pa), cosPA = Math.cos(G.pa);
      for (var y = y0; y <= y1; y++) {
        /* Desplazamiento respecto al centro de LA GALAXIA, no del campo: este
           positivo hacia la izquierda, norte hacia arriba. Medirlo desde el
           centro del campo dibujaba a las compañeras con el perfil descolocado. */
        var dNorte = (cy - (y + 0.5)) * escArc;
        for (var x = x0; x <= x1; x++) {
          var dEste = (cx - (x + 0.5)) * escArc;
          // Proyección sobre los ejes mayor y menor. El PA se mide desde el norte
          // hacia el este, de ahí el reparto de seno y coseno.
          var u = dEste * senPA + dNorte * cosPA;
          var v = dEste * cosPA - dNorte * senPA;
          var flujo = 0;
          if (G.iD > 0) {
            var rD = Math.sqrt(u * u + (v / G.q) * (v / G.q));
            if (rD <= G.rMax) {
              var disco = G.deCanto
                ? G.i0 * Math.exp(-Math.abs(u) / G.hR - Math.abs(v) / G.hZ)
                : G.iD * Math.exp(-b * (Math.pow(Math.max(rD, 1e-6) / G.re, invN) - 1));
              /* Banda de polvo: absorbe, no emite, así que multiplica. Va pegada
                 al plano medio (|v| pequeño) y solo afecta al DISCO; el bulbo
                 sobresale del plano y por eso asoma a ambos lados de la banda. */
              if (G.polvo && G.hPolvo > 0) {
                var t = v / G.hPolvo;
                disco *= 1 - GALAXIA.polvoAbsorcion * Math.exp(-t * t);
              }
              flujo += disco;
            }
          }
          if (G.iB > 0) {
            var rB = Math.sqrt(u * u + (v / G.qB) * (v / G.qB));
            if (rB <= G.rMax) {
              // Radio suavizado: sin esto el de Vaucouleurs tiene una punta
              // infinita en el centro que ningún telescopio resuelve.
              var rS = Math.sqrt(rB * rB + G.r0B * G.r0B);
              var bulbo = G.iB * Math.exp(-bB * (Math.pow(rS / G.reB, 0.25) - 1));
              if (G.polvo && G.hPolvo > 0) {
                var tb = v / G.hPolvo;
                bulbo *= 1 - GALAXIA.polvoAbsorcion * GALAXIA.polvoSobreBulbo * Math.exp(-tb * tb);
              }
              flujo += bulbo;
            }
          }
          if (flujo > 0) out[y * SIZE + x] += GALAXIA.k * flujo;
        }
      }
    }
    return out;
  }

  /* Suma de todas las capas difusas del campo, en flujo por arcsec². Cada capa
     aporta lo suyo sin solaparse: el telón, la luz de las estrellas que el
     catálogo no trae; el halo, solo el déficit que la aglomeración le roba al
     telón en los núcleos densos.
     Ninguna lleva atenuación de pupila: la aplica ctxFotometrico al pintar. */
  function capasDifusas(estrellas, o) {
    // El telón va primero: el halo anclado a catálogo necesita saber qué luz hay
    // puesta ya para aportar solo el resto.
    var telon = (o.conTelon !== false) ? telonDifuso(estrellas, o) : null;
    var halo = (o.conHalo !== false) ? haloNoResuelto(estrellas, o, telon) : null;
    var galaxias = (o.conGalaxias !== false) ? capaGalaxias(o) : null;
    /* El catálogo se comprueba AQUÍ: `galaxiasEnCampo` cae al de galaxias cuando
       no le llega ninguno, así que pasarle un `undefined` —el fichero de
       nebulosas sin desplegar— pintaría las galaxias dos veces en silencio. */
    var nebulosas = (o.conNebulosas !== false && window.BITACORA_NEBULOSAS)
      ? capaGalaxias(o, window.BITACORA_NEBULOSAS) : null;
    var capas = [];
    if (telon) capas.push(telon);
    if (halo) capas.push(halo);
    if (galaxias) capas.push(galaxias);
    if (nebulosas) capas.push(nebulosas);
    if (!capas.length) return null;
    var out = capas[0];
    for (var c = 1; c < capas.length; c++) {
      for (var i = 0; i < out.length; i++) out[i] += capas[c][i];
    }
    return out;
  }

  /* ── Consulta a Gaia DR3 vía proxy (cache por coord+radio) ── */
  var cacheGaia = {};
  function radioConsulta(arcmin) {
    return Math.min(GAIA_RADIO_MAX, Math.max(GAIA_RADIO_MIN, (arcmin / 60) * 0.72));
  }
  function fetchGaia(ra, dec, rad) {
    var ctrl = new AbortController();
    var id = setTimeout(function () { ctrl.abort(); }, GAIA_FETCH_TIMEOUT);
    var url = PROXY_URL + '?ra=' + encodeURIComponent(ra) + '&dec=' + encodeURIComponent(dec) +
              '&rad=' + encodeURIComponent(rad) + '&mag=' + encodeURIComponent(GAIA_MAG_MAX);
    return fetch(url, { signal: ctrl.signal }).then(function (r) {
      clearTimeout(id);
      if (!r.ok) throw new Error();
      return r.json();
    });
  }
  function consultar(ra0, dec0, arcmin) {
    var rad = radioConsulta(arcmin || GAIA_ARCMIN_DEFECTO);
    var clave = ra0.toFixed(3) + ',' + dec0.toFixed(3);
    var ent = cacheGaia[clave];
    if (ent && ent.rad >= rad - 1e-6) return ent.promise;
    var nueva = {
      rad: rad,
      promise: fetchGaia(ra0.toFixed(5), dec0.toFixed(5), rad.toFixed(5)).then(function (jj) {
        return (jj.data || []).filter(function (f) { return f[2] != null; });
      })
    };
    cacheGaia[clave] = nueva;
    nueva.promise.catch(function () { if (cacheGaia[clave] === nueva) delete cacheGaia[clave]; });
    return nueva.promise;
  }

  // Ganancia global del dibujo actual (ver capaEstrellas).
  var ganActual = 1;

  /* ── Sprites (núcleo, glow, brazo de difracción) ── */
  var GAIA_SPRITE = null, GLOW_SPRITE = null, SPIKE_SPRITE = null, SPIKE_TINT = {};
  function spriteGaia() {
    if (GAIA_SPRITE) return GAIA_SPRITE;
    var S = 64, m = S / 2, R = m - 1, dCore = 1 / (1 + CFG.blur);
    var c = document.createElement('canvas'); c.width = c.height = S;
    var g = c.getContext('2d'), gr = g.createRadialGradient(m, m, 0, m, m, R);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(dCore * 0.7, 'rgba(255,255,255,0.9)');
    gr.addColorStop(dCore, 'rgba(255,255,255,0.4)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(m, m, R, 0, 7); g.fill();
    return (GAIA_SPRITE = c);
  }
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
  function dibujarSpikes(ctx, x, y, g, escalaMag, rgb) {
    var cf = CFG.spikes, sobre = cf.magMax - g;
    if (sobre <= 0) return;
    var L = Math.min(cf.longMax, cf.longMag * sobre) * escalaMag;
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

  /* ── Tamaño y color de cada estrella ── */
  function radioNucleo(g) {
    var r = CFG.radioMag * Math.pow(Math.max(0, CFG.magTamMin - g), CFG.radioExp);
    return Math.min(CFG.radioMax, Math.max(CFG.radioMin, r));
  }
  function colorEstrella(bprp, carbono) {
    var v = bprp;
    if (carbono) {
      v = (bprp == null) ? CFG.carbono.bprpMin
                         : Math.max(CFG.carbono.bprpMin, bprp + CFG.carbono.bprpOffset);
    }
    return GColor.colorPorBpRp(v);
  }
  function dibujarEstrellaColor(ctx, x, y, Rtot, rgb) {
    var dCore = 1 / (1 + CFG.blur), tn = CFG.tinteNucleo, col = rgb[0] + ',' + rgb[1] + ',' + rgb[2];
    var centro = Math.round(255 + tn * (rgb[0] - 255)) + ',' + Math.round(255 + tn * (rgb[1] - 255)) + ',' + Math.round(255 + tn * (rgb[2] - 255));
    var gr = ctx.createRadialGradient(x, y, 0, x, y, Rtot);
    gr.addColorStop(0, 'rgba(' + centro + ',1)');
    gr.addColorStop(dCore * 0.55, 'rgba(' + col + ',0.9)');
    gr.addColorStop(dCore, 'rgba(' + col + ',0.6)');
    gr.addColorStop(1, 'rgba(' + col + ',0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, Rtot, 0, 7); ctx.fill();
  }

  /* ── Dibujo de las estrellas (tamaño = ctx.canvas.width, cuadrado) ── */
  function dibujar(ctx, estrellas, o) {
    var SIZE = ctx.canvas.width;
    var ra0 = o.ra, dec0 = o.dec, arcmin = o.arcmin, mlim = o.mlim;
    var conGlow = (o.conGlow !== false), objetoCarbono = !!o.carbono, arana = !!o.arana;
    var escv = SIZE / (arcmin / 60);
    var cos0 = Math.cos(dec0 * Math.PI / 180);
    function deltaRA(ra) { return ((ra - ra0 + 540) % 360) - 180; }
    var base = spriteGaia(), glow = spriteGlow();
    var idxCarbono = -1;
    if (objetoCarbono) {
      var mejorD2 = Infinity;
      for (var c = 0; c < estrellas.length; c++) {
        if (estrellas[c][2] >= CFG.magColor) continue;
        var cx = SIZE / 2 - deltaRA(estrellas[c][0]) * cos0 * escv;
        var cy = SIZE / 2 - (estrellas[c][1] - dec0) * escv;
        var d2 = (cx - SIZE / 2) * (cx - SIZE / 2) + (cy - SIZE / 2) * (cy - SIZE / 2);
        if (d2 < mejorD2) { mejorD2 = d2; idxCarbono = c; }
      }
    }
    // Ganancia global del dibujo: la usa la capa de rango extendido para hacer
    // una segunda pasada atenuada que rescate los núcleos recortados.
    ganActual = (o.ganancia > 0) ? o.ganancia : 1;
    var factorHalo = 1 + CFG.blur, Rg = CFG.glowRadio;
    var escalaMag = Math.min(CFG.escalaMagMax, Math.max(1, Math.sqrt(CFG.escalaMagCampo / arcmin)));
    var spikesOn = conGlow && arana;
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < estrellas.length; i++) {
      var ra = estrellas[i][0], dec = estrellas[i][1], g = estrellas[i][2], bprp = estrellas[i][3];
      if (g > mlim && !conGlow) continue;
      var x = SIZE / 2 - deltaRA(ra) * cos0 * escv;
      var y = SIZE / 2 - (dec - dec0) * escv;
      if (x < -3 || y < -3 || x > SIZE + 3 || y > SIZE + 3) continue;
      if (g > mlim) {
        var aGlow = CFG.glowIntensidad * Math.pow(10, -0.4 * (g - mlim));
        if (aGlow < 0.004) continue;
        ctx.globalAlpha = Math.min(1, aGlow) * ganActual;
        ctx.drawImage(glow, x - Rg, y - Rg, Rg * 2, Rg * 2);
        continue;
      }
      var Rtot = Math.min(CFG.radioTotalMax, radioNucleo(g) * factorHalo * escalaMag);
      ctx.globalAlpha = Math.min(1, Math.max(CFG.alfaMin, CFG.brillo * Math.min(1, (mlim - g) / 6))) * ganActual;
      var esCarbono = (i === idxCarbono), colEstrella = null;
      if ((g < CFG.magColor && bprp != null) || esCarbono) {
        colEstrella = colorEstrella(bprp, esCarbono);
        dibujarEstrellaColor(ctx, x, y, Rtot, colEstrella);
      } else {
        ctx.drawImage(base, x - Rtot, y - Rtot, Rtot * 2, Rtot * 2);
      }
      if (spikesOn && g < CFG.spikes.magMax) dibujarSpikes(ctx, x, y, g, escalaMag, colEstrella);
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
    var baja = lienzoEstrellas(estrellas, o, SIZE, TONO.ganancia);
    var n = SIZE * SIZE, out = new Float32Array(n * 3);
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
    return consultar(o.ra, o.dec, o.arcmin).then(function (estrellas) {
      /* Capas difusas y estrellas se mapean JUNTAS, en una sola curva de tono.
         Antes el fondo pasaba por la curva logarítmica y las estrellas se
         dibujaban encima en 8 bits, saltándosela: por eso los núcleos densos se
         recortaban a blanco y no se distinguía ninguna estrella. */
      var difuso = capasDifusas(estrellas, {
        ra: o.ra, dec: o.dec, arcmin: o.arcmin, size: SIZE,
        conTelon: o.conTelon, conHalo: o.conHalo,
        conGalaxias: o.conGalaxias, conNebulosas: o.conNebulosas
      }) || new Float32Array(SIZE * SIZE);
      var capaEst = capaEstrellas(estrellas, {
        ra: o.ra, dec: o.dec, arcmin: o.arcmin, mlim: mlim,
        conGlow: (o.conGlow !== false), carbono: !!o.carbono, arana: arana
      }, SIZE);
      pintarFot(difuso, ctx, cielo, capaEst);
      return { estrellas: estrellas, mlim: mlim, fondo: fondo, telon: !!telon };
    });
  }

  window.BitacoraGaiaRender = {
    config: CFG,
    fot: FOT,
    consultar: consultar,
    dibujar: dibujar,
    render: render,
    magLimite: magLimite,
    nivelFondo: nivelFondo,
    nivelCielo: nivelCielo,
    tono: TONO,
    capaEstrellas: capaEstrellas,
    valorDeFlujo: valorDeFlujo,
    flujoDeValor: flujoDeValor,
    realzarPerceptual: realzarPerceptual,
    visibilidadDifusa: visibilidadDifusa,
    ctxFotometrico: ctxFotometrico,
    pintarFot: pintarFot,
    telon: TELON,
    telonDifuso: telonDifuso,
    pendienteConteos: pendienteConteos,
    razonNoResuelta: razonNoResuelta,
    king: KING,
    haloNoResuelto: haloNoResuelto,
    haloCatalogado: haloCatalogado,
    flujoObservadoCumulo: flujoObservadoCumulo,
    globularEnCampo: globularEnCampo,
    flujoMedioNoResuelto: flujoMedioNoResuelto,
    perfilRadial: perfilRadial,
    ajustarKing: ajustarKing,
    formaKing: formaKing,
    galaxia: GALAXIA,
    capaGalaxias: capaGalaxias,
    galaxiasEnCampo: galaxiasEnCampo,
    factorLuz: factorLuz,
    bSersic: bSersic,
    capasDifusas: capasDifusas,
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
    set proxyUrl(u) { PROXY_URL = u; },
    get proxyUrl() { return PROXY_URL; }
  };
})();
