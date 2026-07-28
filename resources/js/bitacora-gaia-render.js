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
    var mlim = magLimite({ apertura: o.apertura, aumentos: o.aumentos, transmision: t, sqm: o.sqm });
    return consultar(o.ra, o.dec, o.arcmin).then(function (estrellas) {
      ctx.fillStyle = colorFondo; ctx.fillRect(0, 0, SIZE, SIZE);
      dibujar(ctx, estrellas, {
        ra: o.ra, dec: o.dec, arcmin: o.arcmin, mlim: mlim,
        conGlow: (o.conGlow !== false), carbono: !!o.carbono, arana: arana
      });
      return { estrellas: estrellas, mlim: mlim, fondo: fondo };
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
    desenfocar: desenfocar,
    adaptacionLocal: adaptacionLocal,
    suave: suave,
    transmisionOptica: transmisionOptica,
    opticaTieneArana: opticaTieneArana,
    set proxyUrl(u) { PROXY_URL = u; },
    get proxyUrl() { return PROXY_URL; }
  };
})();
