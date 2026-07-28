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
  var GAIA_MAG_MAX        = 16.5;
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

  /* ── Transmisión y araña por tipo óptico (idéntico al simulador) ── */
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
    // Curva del FONDO DE CIELO (independiente del tono del objeto): el fondo se
    // pinta en función de su brillo superficial en el ocular (SBe, mag/arcsec²,
    // atenuado por la pupila de salida). Por encima de SB_CIELO_NEGRO el fondo es
    // negro total; por debajo se aclara linealmente en magnitudes hasta blanco.
    SB_CIELO_NEGRO: 22.5, SB_CIELO_BLANCO: 16.5,
    // Ganancia del lado OSCURO en la adaptación local (relativa a REALCE, el lado
    // brillante). 1 = simétrico → las siluetas oscuras recortan contra el fondo.
    REALCE_OSCURO: 1.0
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

  // Adaptación local del ojo: realza el detalle respecto al entorno desenfocado.
  function adaptacionLocal(v, SIZE) {
    var borroso = desenfocar(v, Math.round(SIZE / 60), SIZE);
    var out = new Float32Array(v.length); var REALCE = 0.5, UMBRAL_DETALLE = 12;
    for (var j = 0; j < v.length; j++) {
      var dif = v[j] - borroso[j];
      var mag = Math.abs(dif) - UMBRAL_DETALLE;
      var gan = dif >= 0 ? REALCE : REALCE * FOT.REALCE_OSCURO;
      out[j] = v[j] + (mag > 0 ? gan * Math.sign(dif) * mag : 0);
    }
    return out;
  }

  /* Pinta un contexto a partir de un array de FLUJO DE OBJETO por píxel (Fobj, en
     las mismas unidades que Fcielo). Cadena de contraste + adaptación local,
     compartida por todos los motores que sepan producir un Fobj: el de placas del
     simulador y las capas difusas sintéticas del Canvas-2D.
     El lienzo debe venir ya dimensionado (cuadrado). */
  function pintarFot(Fobj, ctx, o) {
    var SIZE = ctx.canvas.width;
    var c = ctxFotometrico(o);
    var salida = new Float32Array(Fobj.length);
    for (var i = 0; i < Fobj.length; i++) {
      var s = suave((Fobj[i] / (c.Fcielo * c.Cmin) - 1) / 1.5);
      salida[i] = c.nivelFondo + 255 * 2.5 * Math.log10(1 + (Fobj[i] * s) / c.Fcielo) / c.rango;
    }
    var final = adaptacionLocal(salida, SIZE);
    var im = ctx.createImageData(SIZE, SIZE);
    for (var k = 0, j = 0; j < final.length; k += 4, j++) {
      var g = Math.max(0, Math.min(255, final[j]));
      im.data[k] = im.data[k + 1] = im.data[k + 2] = g; im.data[k + 3] = 255;
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
    sesgoDebil: 1.0
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
    var n = 24;
    var rMin = Math.max(gc.rc / 8, 1e-5);
    var rMax = Math.min(rt, rmaxCampo);
    if (!(rMax > rMin)) return null;
    var lnMin = Math.log(rMin), paso = (Math.log(rMax) - lnMin) / n;
    var flujo = new Float64Array(n + 1), area = new Float64Array(n + 1), i;
    // Bin 0: el disco central completo; el resto, coronas logarítmicas.
    area[0] = Math.PI * rMin * rMin;
    for (i = 1; i <= n; i++) {
      var r0 = Math.exp(lnMin + (i - 1) * paso), r1 = Math.exp(lnMin + i * paso);
      area[i] = Math.PI * (r1 * r1 - r0 * r0);
    }
    var cos0 = Math.cos(gc.dec * Math.PI / 180);
    for (i = 0; i < estrellas.length; i++) {
      var dRA = (((estrellas[i][0] - gc.ra + 540) % 360) - 180) * cos0;
      var dDec = estrellas[i][1] - gc.dec;
      var r = Math.sqrt(dRA * dRA + dDec * dDec);
      if (r >= rMax) continue;
      var b = (r <= rMin) ? 0 : Math.min(n, 1 + Math.floor((Math.log(r) - lnMin) / paso));
      flujo[b] += Math.pow(10, -0.4 * estrellas[i][2]);
    }
    // Densidad de flujo por arcsec², suavizada a tres puntos: los anillos
    // interiores tienen pocas estrellas y su ruido se vería como anillos.
    var dens = new Float64Array(n + 1);
    for (i = 0; i <= n; i++) dens[i] = flujo[i] / (area[i] * 3600 * 3600);
    var suavizado = new Float64Array(n + 1);
    for (i = 0; i <= n; i++) {
      var a = dens[Math.max(0, i - 1)], c = dens[Math.min(n, i + 1)];
      suavizado[i] = (a + 2 * dens[i] + c) / 4;
    }
    return function (r) {
      if (r <= rMin) return suavizado[0];
      if (r >= rMax) return suavizado[n];
      var f = 1 + (Math.log(r) - lnMin) / paso;
      var i0 = Math.max(0, Math.min(n, Math.floor(f)));
      var i1 = Math.min(n, i0 + 1), t = f - i0;
      return suavizado[i0] * (1 - t) + suavizado[i1] * t;
    };
  }

  function haloCatalogado(gc, estrellas, o, yaPuesto) {
    var rt = gc.rc * Math.pow(10, gc.c);
    var pico = formaKing(0, gc.rc, rt);
    if (!(pico > 0)) return null;
    var observado = flujoObservadoCumulo(estrellas, gc, rt, (o.arcmin / 60) / 2);
    if (!observado) return null;
    var F0 = Math.pow(10, -0.4 * gc.muV);        // flujo por arcsec² en el centro

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
        var idx = y * SIZE + x;
        var king = F0 * formaKing(r, gc.rc, rt) / pico;
        // Flujo ya presente: el observado a ese radio y lo que ponga el telón.
        var puesto = observado(r) + (yaPuesto ? yaPuesto[idx] : 0);
        var d = king - puesto;
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
    if (!telon) return halo;
    if (!halo) return telon;
    for (var i = 0; i < telon.length; i++) telon[i] += halo[i];
    return telon;
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
    ctx.globalAlpha = alpha;
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
        ctx.globalAlpha = Math.min(1, aGlow);
        ctx.drawImage(glow, x - Rg, y - Rg, Rg * 2, Rg * 2);
        continue;
      }
      var Rtot = Math.min(CFG.radioTotalMax, radioNucleo(g) * factorHalo * escalaMag);
      ctx.globalAlpha = Math.min(1, Math.max(CFG.alfaMin, CFG.brillo * Math.min(1, (mlim - g) / 6)));
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
      pupilaSalida: o.pupilaSalida, pupilaOjo: o.pupilaOjo, sqm: o.sqm, transmision: t
    };
    return consultar(o.ra, o.dec, o.arcmin).then(function (estrellas) {
      // Capas difusas primero (incluyen el fondo de cielo); si no hay, gris uniforme.
      var difuso = capasDifusas(estrellas, {
        ra: o.ra, dec: o.dec, arcmin: o.arcmin, size: SIZE,
        conTelon: o.conTelon, conHalo: o.conHalo
      });
      if (difuso) { pintarFot(difuso, ctx, cielo); }
      else { ctx.fillStyle = colorFondo; ctx.fillRect(0, 0, SIZE, SIZE); }
      dibujar(ctx, estrellas, {
        ra: o.ra, dec: o.dec, arcmin: o.arcmin, mlim: mlim,
        conGlow: (o.conGlow !== false), carbono: !!o.carbono, arana: arana
      });
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
    ctxFotometrico: ctxFotometrico,
    pintarFot: pintarFot,
    telon: TELON,
    telonDifuso: telonDifuso,
    pendienteConteos: pendienteConteos,
    razonNoResuelta: razonNoResuelta,
    king: KING,
    haloNoResuelto: haloNoResuelto,
    haloCatalogado: haloCatalogado,
    globularEnCampo: globularEnCampo,
    flujoMedioNoResuelto: flujoMedioNoResuelto,
    perfilRadial: perfilRadial,
    ajustarKing: ajustarKing,
    formaKing: formaKing,
    capasDifusas: capasDifusas,
    desenfocar: desenfocar,
    adaptacionLocal: adaptacionLocal,
    suave: suave,
    transmisionOptica: transmisionOptica,
    opticaTieneArana: opticaTieneArana,
    set proxyUrl(u) { PROXY_URL = u; },
    get proxyUrl() { return PROXY_URL; }
  };
})();
