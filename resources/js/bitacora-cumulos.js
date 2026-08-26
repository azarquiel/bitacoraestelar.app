/* ===========================================================================
 * BITÁCORA ESTELAR · Población estelar de cúmulos globulares (Capa 1)
 * ---------------------------------------------------------------------------
 * ¿Qué estrellas existen en este cúmulo y dónde están? Nada más. Aquí no hay
 * ojo, ni telescopio, ni canvas: solo el cúmulo tal y como es.
 *
 * De un cúmulo del catálogo de Harris (V_t, d, E(B-V), [Fe/H], geometría de
 * King) y de una función de luminosidad de isócrona salen:
 *
 *   - N_tot        número total de estrellas, DERIVADO del flujo integrado
 *   - S1(m_lim)    flujo de las estrellas más débiles que m_lim
 *   - S2(m_lim)    suma de sus flujos AL CUADRADO: la varianza del grano (SBF)
 *   - Sigma(r)     perfil de King normalizado a 1 sobre el cielo (1/arcsec²)
 *   - m_crowd(r)   hasta dónde llega la resolución por aglomeración
 *   - sintéticas   las estrellas brillantes que Gaia no trae (núcleo aglomerado)
 *
 * S1 y S2 son toda la textura del halo: no existe ningún parámetro de
 * "contraste de grano" que tocar. Si el grano sale mal, la sospechosa es la LF.
 *
 * FRONTERA (ADR 0002). Este módulo NO conoce Cmin, ni canvas, ni
 * ctxFotometrico, ni visibilidadDifusa, ni realzarPerceptual, ni ningún
 * parámetro de display. La magnitud límite del cielo y la composición
 * m_res = min(m_crowd, m_lim,sky) viven en el render, que es donde la física
 * se encuentra con la percepción. Si algo de eso aparece aquí, está en el
 * módulo equivocado.
 *
 * Depende de: lf-globulares-datos.js (window.BITACORA_LF_GLOBULARES) y, en
 * tiempo de llamada, de BitacoraGaiaRender.perfilKing/areaKing — el perfil de
 * King es una sola ley y vive en un solo sitio.
 * =========================================================================== */
(function () {
  'use strict';

  /* ── Constantes con unidades e interpretación observacional ─────────────── */

  var CFG = {
    // ADR 0012: el crowding es una probabilidad POR ESTRELLA. Lo que había aquí
    // antes —el criterio duro `crowdingCriterion` k=30 y la banda `delta`— ya no
    // existe: ningún k global reproduce la forma radial medida
    // (simulador_ocular/docs/experimentos/diagnostico_estrellas_perdidas.md).
    //
    // Separación mínima resoluble, en RADIOS de imagen estelar
    // (`radioImagenEstelar` = Airy ⊕ seeing, bitacora-gaia-render.js). El 1,0 es
    // el criterio de Rayleigh literal —el centro de una estrella cae en el
    // primer anillo oscuro de la otra— aplicado a la imagen que el render dibuja
    // de verdad, y es el mismo eje óptico con el que `resolucionDoble` juzga una
    // doble. No es un ajuste: ver simulador_ocular/docs/adr/0012-crowding/ancla_thetasep.md.
    // Antes esto era `thetaSepFwhm: 1.0` medido en un "FWHM" que valía el doble
    // de este radio, así que equivalía a 2× Rayleigh.
    thetaSepRadios: 1.0,
    // Salto de magnitud a partir del cual una vecina deja de fundir a la débil.
    // SIN ANCLA PROPIA: el barrido del paso 2 no lo distingue y la literatura de
    // dobles solo ofrece penalizaciones heurísticas por Δm. Declarado, no medido.
    dmagCrowd: 0.75,
    // Pasadas del punto fijo velo <-> m_res. El velo depende de m_res (la
    // estrella que sobrevive a la mezcla pero sigue siendo demasiado débil para
    // el cielo) y m_res depende del velo. MEDIDO sobre 512 tramos radiales, M13
    // a 173x: contrae con factor 4e-4 a 0,34, y hacen falta 5 pasadas desde
    // m_res = +inf para bajar de 0,01 mag (una sola deja 0,281 mag). N FIJO y no
    // tolerancia: el criterio de parada no puede vivir dentro de la imagen.
    // simulador_ocular/docs/adr/0012-crowding/punto_fijo.md
    pasadasPuntoFijo: 5,
    // Completitud de Gaia: sigmoide de dos constantes. El codo está donde el
    // catálogo empieza a perder estrellas en campo abierto; en el núcleo lo
    // adelanta la propia aglomeración (m_crowd con el beam de Gaia), así que el
    // "endurecimiento con la densidad local" no trae constante nueva.
    //
    // El k = 30 de aquí abajo es de GAIA, no del render: es el criterio con el
    // que el CATÁLOGO deja de separar fuentes en su beam de 0,6". Sobrevive al
    // ADR 0012 porque describe otro instrumento, no la vista por el ocular.
    gaiaCrowdingK: 30,
    gaiaM50: 20.0,
    gaiaAncho: 0.4,
    gaiaFwhmAs: 0.6,
    // Profundidad de generación de estrellas sintéticas. La realización se
    // genera UNA vez, con el instrumento más profundo que el simulador admite
    // (D = 500 mm, seeing 1", cielo oscuro: límite puntual ~17 mag) más la
    // banda de transición. Cambiar de telescopio reclasifica, no regenera.
    mCutGeneracion: 18.0,
    // Extinción: A_V = R_V · E(B-V), con el R_V estándar del medio difuso.
    rv: 3.1,
    // Color sintético por tramo de la LF (B_P - R_P aproximado). El núcleo se
    // quedaba monocromo justo donde Gaia deja de aportar.
    bprpGigante: 1.35,     // M_V < 0: rama gigante alta
    bprpSubgigante: 1.00,  // 0 <= M_V < 3.5: gigantes bajas y subgigantes
    bprpSecuencia: 0.75    // M_V >= 3.5: secuencia principal
  };

  /* ── Utilidades ─────────────────────────────────────────────────────────── */

  function render() {
    var R = window.BitacoraGaiaRender;
    if (!R || !R.perfilKing) throw new Error('BitacoraCumulos necesita BitacoraGaiaRender (perfil de King)');
    return R;
  }

  /* Generador determinista: la misma semilla da la misma realización en
     cualquier máquina y en cualquier orden de llamada (mulberry32). */
  function aleatorio(semilla) {
    var s = semilla >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash32(texto) {
    var h = 2166136261;
    for (var i = 0; i < texto.length; i++) {
      h ^= texto.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /* ── Función de luminosidad ─────────────────────────────────────────────── */

  function datosLF() {
    var d = window.BITACORA_LF_GLOBULARES;
    if (!d || !d.tablas || d.tablas.length < 2) throw new Error('Falta lf-globulares-datos.js');
    return d;
  }

  function versionLF() { return datosLF().version; }

  /* Las tres tablas comparten rejilla (mismo paso y mismo origen de bins), pero
     no empiezan en el mismo bin: la isócrona pobre llega más arriba en la rama
     gigante. Se llevan a una rejilla común rellenando con ceros, que es lo que
     físicamente dicen (ahí no hay estrellas). */
  function rejillaComun() {
    var tablas = datosLF().tablas, paso = tablas[0].paso;
    var m0 = Infinity, m1 = -Infinity;
    tablas.forEach(function (t) {
      m0 = Math.min(m0, t.m0);
      m1 = Math.max(m1, t.m0 + (t.phi.length - 1) * t.paso);
    });
    var n = Math.round((m1 - m0) / paso) + 1;
    var m = new Float64Array(n);
    for (var i = 0; i < n; i++) m[i] = m0 + i * paso;
    var phis = tablas.map(function (t) {
      var v = new Float64Array(n), desde = Math.round((t.m0 - m0) / paso);
      for (var j = 0; j < t.phi.length; j++) v[desde + j] = t.phi[j];
      return v;
    });
    return { m: m, paso: paso, feh: tablas.map(function (t) { return t.feh; }), phi: phis };
  }

  var rejilla = null;

  /* LF interpolada linealmente en [Fe/H], recortada a los extremos del catálogo
     de tablas (no se extrapola: fuera de rango manda la tabla del extremo). */
  function lfInterpolada(feh) {
    if (!rejilla) rejilla = rejillaComun();
    var fs = rejilla.feh, n = fs.length;
    var k = 0;
    while (k < n - 2 && feh > fs[k + 1]) k++;
    var t = (feh - fs[k]) / (fs[k + 1] - fs[k]);
    t = Math.max(0, Math.min(1, t));
    var a = rejilla.phi[k], b = rejilla.phi[k + 1];
    var phi = new Float64Array(a.length);
    for (var i = 0; i < a.length; i++) phi[i] = a[i] * (1 - t) + b[i] * t;
    return { m: rejilla.m, phi: phi, paso: rejilla.paso };
  }

  /* ── Geometría del cúmulo ───────────────────────────────────────────────── */

  /* Radio en el sistema propio del cúmulo. Con elipticidad e = 1 - b/a y ángulo
     de posición pa (grados, N->E), el radio elíptico equivalente; sin pa —que es
     el caso de todo el catálogo de Harris— circular, sin inventarse una
     orientación que no está medida. */
  function radioPropio(dxAs, dyAs, elip, pa) {
    if (!elip || pa === null || pa === undefined) return Math.sqrt(dxAs * dxAs + dyAs * dyAs);
    var a = pa * Math.PI / 180;
    var u = dxAs * Math.sin(a) + dyAs * Math.cos(a);       // eje mayor
    var v = -dxAs * Math.cos(a) + dyAs * Math.sin(a);      // eje menor
    return Math.sqrt(u * u + (v / (1 - elip)) * (v / (1 - elip)));
  }

  /* ── Población ──────────────────────────────────────────────────────────── */

  /* cumulo: { id, rc, rh, c, muV0, Vt, dkpc, ebv, feh, elip, pa }
     rc/rh en arcmin (como el catálogo), c = log10(r_t/r_c). */
  function poblacion(cumulo) {
    if (cumulo.Vt === null || cumulo.Vt === undefined || cumulo.dkpc == null) {
      return null;   // sin flujo total no hay población que repartir
    }
    var R = render();
    var lf = lfInterpolada(cumulo.feh == null ? -1.5 : cumulo.feh);

    // Módulo de distancia APARENTE: distancia + extinción. Es lo que convierte
    // la LF (magnitudes absolutas) en magnitudes observadas.
    var dm = 5 * Math.log10(cumulo.dkpc * 100) + CFG.rv * (cumulo.ebv || 0);
    var Ftotal = Math.pow(10, -0.4 * cumulo.Vt);

    var n = lf.m.length;
    var mAp = new Float64Array(n), f = new Float64Array(n);
    var flujoPorEstrella = 0;
    for (var i = 0; i < n; i++) {
      mAp[i] = lf.m[i] + dm;
      f[i] = Math.pow(10, -0.4 * mAp[i]);
      flujoPorEstrella += lf.phi[i] * f[i];
    }
    // N_tot es derivado, no un parámetro libre: sale de exigir que la LF sume
    // exactamente el flujo integrado que mide Harris.
    var Ntot = Ftotal / flujoPorEstrella;

    var num = new Float64Array(n);        // estrellas por bin
    for (i = 0; i < n; i++) num[i] = Ntot * lf.phi[i];

    // Sumas de cola (de la más débil hacia arriba) para S1/S2, y acumulada por
    // el otro lado para los conteos de aglomeración.
    var cola1 = new Float64Array(n + 1), cola2 = new Float64Array(n + 1);
    for (i = n - 1; i >= 0; i--) {
      cola1[i] = cola1[i + 1] + num[i] * f[i];
      cola2[i] = cola2[i + 1] + num[i] * f[i] * f[i];
    }
    var acum = new Float64Array(n + 1);   // acum[i] = estrellas más brillantes que el bin i
    for (i = 0; i < n; i++) acum[i + 1] = acum[i] + num[i];

    /* Cola de la LF por debajo de mlim, INTERPOLANDO el bin que mlim parte.
       Devolver el bin entero hace de S1 y S2 funciones escalón de mlim, y como
       m_res(r) sí es continua en el radio (m_crowd interpola justo por esto,
       invariante 7), cada borde de bin que m_res cruza mete en <I>(r) un salto
       de 0,25 mag: son los anillos concéntricos de 47 Tuc (D3). Dentro del bin
       se reparte linealmente, que es tratar phi como densidad constante en el
       bin —la misma hipótesis con la que la LF está tabulada—.

       Los bins son una rejilla uniforme de paso lf.paso y mAp[i] es el CENTRO
       del bin i, así que x = (mlim − mAp[0])/paso + 1/2 es la posición de mlim
       medida en bins desde el borde brillante del primero. */
    function cola(tabla, mlim) {
      var x = (mlim - mAp[0]) / lf.paso + 0.5;
      if (!(x > 0)) return tabla[0];        // más brillante que todo: la cola es todo
      var j = Math.floor(x);
      if (j >= n) return 0;                 // más débil que todo: no queda cola
      // Del bin j solo entra la fracción que queda por debajo de mlim.
      return tabla[j + 1] + (1 - (x - j)) * (tabla[j] - tabla[j + 1]);
    }

    /* Momentos del campo bajo la ley del ADR 0012. No hay corte ni banda: cada
       estrella de la LF se dibuja con probabilidad a(m,r) = P_solo y va al velo
       con 1−a, y encima se le exige llegar al cielo (m <= m_res). Las dos
       condiciones son independientes, así que la fracción de un bin que acaba
       en el velo es

         q_i = 1 − w_i(m_res) · a(m_i, r)          w_i = fracción del bin más
                                                          brillante que m_res

         S1campo = Σ num_i · f_i  · q_i
         S2campo = Σ num_i · f_i² · q_i

       El segundo momento va LINEAL en q, no al cuadrado. Bajo el ADR 0012 (A)
       cada estrella entra entera o no entra: es un adelgazamiento de Poisson, y
       la varianza de un Poisson adelgazado es Σ num·q·f². El (1−a)² de antes era
       correcto para una ATENUACIÓN —cada estrella dejaba un resto (1−a)f, y el
       cuadrado es el del resto—, y (A) descartó atenuar.

       w_i se interpola dentro del bin igual que `cola`: un escalón en r dibuja
       anillos (invariante 7). Y como `a` depende del radio y de la imagen
       estelar, estos momentos ya no son función solo de m_res: el velo depende
       del instrumento. */
    function pesoResuelto(i, mRes) {
      if (!(mRes > -Infinity)) return 0;          // nada resuelto (o NaN)
      if (mRes === Infinity) return 1;            // halo exterior: solo manda a()
      var x = (mRes - mAp[0]) / lf.paso + 0.5 - i;
      return x <= 0 ? 0 : (x >= 1 ? 1 : x);
    }
    function momentosCampo(mRes, rAs, radioImagenAs, exp) {
      if (!(radioImagenAs > 0)) throw new Error('momentosCampo: falta radioImagenAs (ADR 0012)');
      var suma = 0;
      for (var k = 0; k < n; k++) {
        var w = pesoResuelto(k, mRes);
        var q = w > 0 ? 1 - w * aCrowd(mAp[k], rAs, radioImagenAs) : 1;
        if (q <= 0) continue;
        suma += num[k] * (exp === 2 ? f[k] * f[k] : f[k]) * q;
      }
      return suma;
    }

    var rcAs = cumulo.rc * 60, rtAs = rcAs * Math.pow(10, cumulo.c);
    var kKing = rtAs / rcAs;
    // Normalización del perfil: perfilKing integra areaKing(k)·r_c² sobre el
    // cielo, así que Sigma(r) sale en fracción de estrellas por arcsec².
    var normPerfil = R.areaKing(kKing) * rcAs * rcAs;

    function sigma(rAs) {
      return R.perfilKing(rAs, rcAs, rtAs) / normPerfil;
    }

    /* Aglomeración con umbral duro: hasta qué magnitud se distinguen puntos
       individuales a un radio dado, si la condición es que haya menos de 1/k
       estrellas más brillantes dentro del beam. Se interpola dentro del bin para
       que m_crowd sea continua en r: un escalón en r dibuja anillos (inv. 7).

       EL RENDER YA NO LA USA (ADR 0012): la sustituye `aCrowd`. Sobrevive para
       la completitud de GAIA —el catálogo sí tiene un beam y un criterio propios—
       y para los arneses que miden el modelo viejo contra el nuevo. */
    function mCrowd(rAs, omegaBeamAs2, k) {
      var s = sigma(rAs);
      if (!(s > 0) || !(omegaBeamAs2 > 0)) return Infinity;
      var objetivo = 1 / ((k || CFG.gaiaCrowdingK) * s * omegaBeamAs2);   // estrellas más brillantes
      if (acum[n] < objetivo) return Infinity;      // ni todo el cúmulo aglomera este beam
      var lo = 0, hi = n;
      while (lo < hi) {                              // primer bin con acum > objetivo
        var mid = (lo + hi) >> 1;
        if (acum[mid + 1] > objetivo) hi = mid; else lo = mid + 1;
      }
      if (lo >= n) return mAp[n - 1];
      var dentro = acum[lo + 1] - acum[lo];
      var t = dentro > 0 ? (objetivo - acum[lo]) / dentro : 0;
      return mAp[lo] + (t - 0.5) * lf.paso;          // mAp es el centro del bin
    }

    /* ADR 0012: el crowding como probabilidad POR ESTRELLA, no como umbral.
       Una estrella de magnitud m a radio r se resuelve si no hay ninguna vecina
       capaz de fundirla dentro de su disco de separación. Las vecinas son un
       proceso de Poisson de densidad n(≥ m+Δmag, r) = Sigma(r)·N(≥ m+Δmag), así
       que la probabilidad de estar sola es

         a(m, r) = exp( − Sigma(r) · N(≥ m+Δmag) · π·θ_sep² )

       Continua en m y en r por construcción, y sin listón: es lo que le falta a
       m_crowd, que no puede dar la forma radial (ningún k global la reproduce,
       ver simulador_ocular/docs/experimentos/diagnostico_estrellas_perdidas.md).

       El conteo se interpola dentro del bin con la MISMA `cola` que S1 y S2: un
       escalón en r dibuja anillos (invariante 7). N(≥m) = Ntot − cola(colaN, m). */
    var colaN = new Float64Array(n + 1);
    for (i = n - 1; i >= 0; i--) colaN[i] = colaN[i + 1] + num[i];
    function aCrowd(m, rAs, radioImagenAs) {
      var s = sigma(rAs);
      if (!(s > 0) || !(radioImagenAs > 0)) return 1;
      var thSep = CFG.thetaSepRadios * radioImagenAs;
      var masBrillantes = colaN[0] - cola(colaN, m + CFG.dmagCrowd);
      return Math.exp(-s * masBrillantes * Math.PI * thSep * thSep);
    }

    /* Completitud de Gaia. El codo es el del catálogo en campo abierto, salvo
       que la aglomeración lo adelante: en el núcleo Gaia pierde estrellas mucho
       antes que en el halo, y eso ya lo dice m_crowd con el beam de Gaia. */
    var omegaGaia = Math.PI * (CFG.gaiaFwhmAs / 2) * (CFG.gaiaFwhmAs / 2);
    function completitud(m, rAs) {
      var m50 = Math.min(CFG.gaiaM50, mCrowd(rAs, omegaGaia, CFG.gaiaCrowdingK));
      return 1 / (1 + Math.pow(10, (m - m50) / CFG.gaiaAncho));
    }

    /* Muestreo radial: CDF numérica de 2·pi·r·perfil(r) sobre 1024 tramos. */
    var PASOS_CDF = 1024;
    var cdf = null;
    function construirCDF() {
      cdf = new Float64Array(PASOS_CDF + 1);
      var h = rtAs / PASOS_CDF, acu = 0;
      for (var j = 0; j < PASOS_CDF; j++) {
        var r0 = j * h, r1 = r0 + h;
        acu += (R.perfilKing(r0, rcAs, rtAs) * r0 + R.perfilKing(r1, rcAs, rtAs) * r1) / 2 * h;
        cdf[j + 1] = acu;
      }
      for (j = 0; j <= PASOS_CDF; j++) cdf[j] /= acu;
    }
    function radioMuestreado(u) {
      if (!cdf) construirCDF();
      var lo = 0, hi = PASOS_CDF;
      while (lo < hi) {
        var mid = (lo + hi) >> 1;
        if (cdf[mid] < u) lo = mid + 1; else hi = mid;
      }
      var j = Math.max(1, lo);
      var d = cdf[j] - cdf[j - 1];
      var t = d > 0 ? (u - cdf[j - 1]) / d : 0;
      return (j - 1 + t) * (rtAs / PASOS_CDF);
    }

    function bprp(mAbs) {
      if (mAbs < 0) return CFG.bprpGigante;
      if (mAbs < 3.5) return CFG.bprpSubgigante;
      return CFG.bprpSecuencia;
    }

    /* Estrellas brillantes que el modelo dice que existen y Gaia no trae. Se
       generan en offsets de cielo (arcsec desde el centro), NO en píxeles: el
       zoom cambia la escala del grano, nunca el grano.
       Devuelve [ra, dec, mag, bprp] para inyectar en el array de dibujo, como
       las filas del catálogo de estrellas que Gaia DR3 no trae. */
    function sinteticas(opciones) {
      var o = opciones || {};
      var mCut = o.mCut == null ? CFG.mCutGeneracion : o.mCut;
      var ra0 = o.ra, dec0 = o.dec;
      var azar = aleatorio(hash32([cumulo.id, versionLF(), o.realization || 0].join('|')));
      var cosDec = Math.cos(dec0 * Math.PI / 180);
      var fuera = [];
      for (var i2 = 0; i2 < n && mAp[i2] <= mCut; i2++) {
        // Número esperado de estrellas de este bin: entero + parte fraccionaria
        // sorteada, para no perder los bins con menos de una estrella.
        var esperadas = num[i2];
        var cuantas = Math.floor(esperadas) + (azar() < (esperadas - Math.floor(esperadas)) ? 1 : 0);
        for (var j2 = 0; j2 < cuantas; j2++) {
          var rAs = radioMuestreado(azar());
          if (azar() < completitud(mAp[i2], rAs)) continue;   // esa ya la trae Gaia
          var ang = azar() * 2 * Math.PI;
          var dx = rAs * Math.cos(ang);
          var dy = rAs * Math.sin(ang);
          if (cumulo.elip && cumulo.pa != null) dy *= (1 - cumulo.elip);
          fuera.push([ra0 + dx / 3600 / (cosDec || 1), dec0 + dy / 3600, mAp[i2], bprp(lf.m[i2])]);
        }
      }
      return fuera;
    }

    return {
      versionLF: versionLF(),
      dm: dm,
      Ftotal: Ftotal,
      Ntot: Ntot,
      rcAs: rcAs,
      rtAs: rtAs,
      magnitudes: mAp,          // magnitud aparente del centro de cada bin
      estrellasPorBin: num,
      // Flujo de las estrellas MÁS DÉBILES que m_lim: lo que se va al campo.
      S1: function (mlim) { return cola(cola1, mlim); },
      // Suma de flujos al cuadrado: la varianza del grano por unidad de perfil.
      S2: function (mlim) { return cola(cola2, mlim); },
      // Flujo de las estrellas más brillantes que m_lim (las que se dibujan). Es
      // el complemento exacto de S1: lo que no va al campo se dibuja, sin que se
      // pierda ni se duplique el bin que m_lim parte.
      Fresuelto: function (mlim) { return cola1[0] - cola(cola1, mlim); },
      // Los momentos del velo bajo el ADR 0012: son los que usa el render.
      // S1/S2/Fresuelto siguen siendo la partición por corte duro, referencia
      // para los tests que la miden. Llevan el radio y la imagen estelar porque
      // el velo depende de dónde y con qué telescopio se mira.
      S1campo: function (mRes, rAs, radioImagenAs) { return momentosCampo(mRes, rAs, radioImagenAs, 1); },
      S2campo: function (mRes, rAs, radioImagenAs) { return momentosCampo(mRes, rAs, radioImagenAs, 2); },
      // Complemento exacto de S1campo: el flujo que el render dibuja, en media.
      // EN MEDIA y no por realización: las catalogadas se sortean (ADR 0012 A).
      Fdibujado: function (mRes, rAs, radioImagenAs) {
        return cola1[0] - momentosCampo(mRes, rAs, radioImagenAs, 1);
      },
      sigma: sigma,
      mCrowd: mCrowd,
      aCrowd: aCrowd,
      completitud: completitud,
      sinteticas: sinteticas,
      radioPropio: function (dxAs, dyAs) { return radioPropio(dxAs, dyAs, cumulo.elip, cumulo.pa); }
    };
  }

  /* Caché de realización. La clave NO lleva nada del instrumento ni del cielo:
     cambiar de telescopio, de ocular o de noche reclasifica estrellas, no
     regenera el cúmulo. Solo cambian la realización el cúmulo y la versión de
     la LF. */
  var cache = {};
  function poblacionCacheada(cumulo, realization) {
    var clave = [cumulo.id, versionLF(), realization || 0].join('|');
    if (!cache[clave]) cache[clave] = poblacion(cumulo);
    return cache[clave];
  }

  /* ── Sorteo de Bernoulli por estrella (ADR 0012 A) ──────────────────────── */

  /* Una estrella catalogada se dibuja ENTERA con probabilidad a(m,r), o no se
     dibuja. No se atenúa: atenuar resta 2,5·log10(a) mag y la estrella cruza la
     magnitud límite, así que convierte un efecto de vecindad en un corte por
     magnitud (MEDIDO: se lleva el 100 % del cuartil débil contra el 50 % de la
     verdad geométrica, simulador_ocular/docs/adr/0012-crowding/atenuacion_vs_bernoulli.md).

     El sorteo tiene que ser ESTABLE: la misma estrella sale o no sale siempre
     igual, aunque se cambie de ocular o se repinte el cuadro. Así que no hay
     azar de verdad, hay una función de las coordenadas —mezclador entero de 32
     bits, estilo splitmix— y de la realización del cúmulo. */
  function sorteo(ra, dec, realization) {
    var h = ((Math.round(ra * 3.6e6) | 0) ^ Math.imul(Math.round(dec * 3.6e6) | 0, 0x9e3779b9) ^
             Math.imul(realization | 0, 0x85ebca6b)) | 0;
    h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
    h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
    h = (h ^ (h >>> 15)) >>> 0;
    return h / 4294967296;
  }

  window.BitacoraCumulos = {
    config: CFG,
    versionLF: versionLF,
    lfInterpolada: lfInterpolada,
    radioPropio: radioPropio,
    poblacion: poblacion,
    poblacionCacheada: poblacionCacheada,
    sorteo: sorteo
  };
})();
