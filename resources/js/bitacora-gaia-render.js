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
  var GAIA_RADIO_MAX      = (120 / 60) * 0.72;   // 1,44° (tope: 2° de lado del DSS)
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
      // Capa difusa primero (incluye el fondo de cielo); si no hay, gris uniforme.
      var telon = (o.conTelon !== false)
        ? telonDifuso(estrellas, { ra: o.ra, dec: o.dec, arcmin: o.arcmin, size: SIZE })
        : null;
      if (telon) { pintarFot(telon, ctx, cielo); }
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
    desenfocar: desenfocar,
    adaptacionLocal: adaptacionLocal,
    suave: suave,
    transmisionOptica: transmisionOptica,
    opticaTieneArana: opticaTieneArana,
    set proxyUrl(u) { PROXY_URL = u; },
    get proxyUrl() { return PROXY_URL; }
  };
})();
