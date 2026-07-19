/* ===========================================================================
 * BITÁCORA MESSIER · Simulador de visión por ocular
 * ---------------------------------------------------------------------------
 * Reproduce cómo se vería el objeto del proyecto (de momento M39) a través del
 * telescopio y el ocular elegidos. Telescopio y ocular se eligen del catálogo
 * global de equipo con el buscador común (BitacoraBase, el mismo de Mi flota).
 *
 * Orígenes de imagen:
 *   · hips      → PanSTARRS DR1 (HiPS), sin dependencias.
 *   · dss       → placas del DSS vía dss-proxy.php.
 *   · canvas-2d → SOLO las estrellas reales de Gaia DR3 sobre fondo negro, con
 *                 la misma proyección que la superposición de Gaia sobre las
 *                 otras vistas (misma posición de estrellas).
 *
 * Va SUBIDO POR FTP a /wp-content/uploads/bitacora/. Incrementa ?v=N al actualizar.
 * =========================================================================== */

(function () {
  'use strict';

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancar);
  } else {
    arrancar();
  }

  function arrancar() {
    try {
      var $ = function (id) { return document.getElementById(id); };
      if (!$('sim-vista')) return;   // el bloque del simulador no está en la página

      /* ══════════════════ CONFIGURACIÓN ══════════════════ */
      var CATALOGO_OBJ = [
        { id: 'M39', nombre: 'M39 · Cúmulo abierto (NGC 7092)', constelacion: 'Cygnus', ra: '21 31 48', dec: '+48 26 55' }
      ];
      var OBJETO = CATALOGO_OBJ[0];

      var TELE_EJEMPLO = [{ id: '_t200', vendor: '', modelo: 'Newton 200/1200 (ejemplo)', apertura_mm: 200, focal_mm: 1200 }];
      var OCULARES_EJEMPLO = [
        { id: '_o31', vendor: '', modelo: '31 mm (ejemplo)',   focal_mm: 31,   campo_aparente: 82 },
        { id: '_o18', vendor: '', modelo: '17,5 mm (ejemplo)', focal_mm: 17.5, campo_aparente: 95 },
        { id: '_o9',  vendor: '', modelo: '9 mm (ejemplo)',    focal_mm: 9,    campo_aparente: 100 },
        { id: '_o5',  vendor: '', modelo: '5 mm (ejemplo)',    focal_mm: 5,    campo_aparente: 60 }
      ];

      var DSS_MAX_ARCMIN = 120;
      var AFOV_REF = 110;
      var PROC = 720;

      /* Ajustes fáciles del render de estrellas de Gaia (Canvas 2D y overlay).
         Todo aquí para poder afinarlo sin tocar el resto del código. */
      var GAIA_CFG = {
        blur: 1.3,          // grosor del halo alrededor de cada estrella (menor = más "punta de alfiler"; útil ~0.8–2.2)
        magColor: 10,       // solo las estrellas más brillantes que esta magnitud llevan color; el resto quedan blancas
        sbRefCielo: 21.8,   // brillo de cielo en el ocular (mag/arcsec²) de referencia: por encima se ve la mag. límite plena
        mermaCielo: 1.0     // magnitudes de límite que se pierden por cada magnitud que el cielo se aclara bajo la referencia
      };

      var CFG = window.BITACORA_OCULAR || {};
      var DSS_BASE = CFG.dssProxy || '/wp-content/uploads/bitacora/dss-proxy.php';

      /* ══════════════════ ESTADO ══════════════════ */
      var WP = window.BITACORA_WP || null;
      var catalogo = { telescopios: [], oculares: [] };
      var teleSel = null;
      var ocularSel = null;

      var corsFallo = false;
      var contadorPeticion = 0;
      var cacheGaia = {};

      var FOT = {
        SB_OBJ_MAX: 14.0, SB_OBJ_MIN: 24.0, SB_NEGRO: 25.5, SB_BLANCO: 14.0,
        C_MIN: 0.08, C_EXP: 0.35, GAMMA_HIPS: 2.0,
        // Curva del FONDO DE CIELO (independiente del tono del objeto): el fondo
        // se pinta en función de su brillo superficial en el ocular (SBe, en
        // mag/arcsec², atenuado por la pupila de salida). Por encima de
        // SB_CIELO_NEGRO el fondo es negro total (contraste máximo, como bajo un
        // cielo excepcional); por debajo se aclara linealmente en magnitudes
        // (= logarítmicamente en flujo) hasta blanco en SB_CIELO_BLANCO.
        SB_CIELO_NEGRO: 22.5, SB_CIELO_BLANCO: 16.5
      };

      // Nivel de gris del fondo (0–255) para un brillo de cielo en el ocular SBe.
      function nivelCielo(SBe) {
        var t = (FOT.SB_CIELO_NEGRO - SBe) / (FOT.SB_CIELO_NEGRO - FOT.SB_CIELO_BLANCO);
        return Math.max(0, Math.min(255, 255 * t));
      }

      /* ══════════════════ CATÁLOGO DE EQUIPO ══════════════════ */
      function num(v) { if (v == null || v === '') return null; var n = parseFloat(v); return isNaN(n) ? null : n; }
      function nombrePieza(p) { return ((p.vendor ? p.vendor + ' ' : '') + (p.modelo || p.nombre || '')).trim() || '(sin nombre)'; }
      function itemPorId(cat, id) { var arr = catalogo[cat] || []; for (var i = 0; i < arr.length; i++) { if (String(arr[i].id) === String(id)) return arr[i]; } return null; }
      function specsTele(p) { var s = []; if (num(p.apertura_mm) != null) s.push(num(p.apertura_mm) + ' mm'); if (num(p.focal_mm) != null) s.push('f=' + num(p.focal_mm) + ' mm'); return s.join(' · '); }
      function specsOcular(p) { var s = []; if (num(p.focal_mm) != null) s.push(num(p.focal_mm) + ' mm'); if (num(p.campo_aparente) != null) s.push(num(p.campo_aparente) + '°'); return s.join(' · '); }
      function pupilaOptica(p) { return { focal: num(p.focal_mm), afov: num(p.campo_aparente) || 60 }; }

      function cargarCatalogo() {
        if (!WP) { usarEjemplo('Inicia sesión para elegir del catálogo completo de equipo. Mientras tanto se muestra un equipo de ejemplo.'); return; }
        var API = WP.endpoint.replace(/observaciones\/?$/, 'equipo') + '/catalogo';
        fetch(API, { credentials: 'same-origin', headers: { 'X-WP-Nonce': WP.nonce } })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) {
            if (!d || (!(d.telescopios || []).length && !(d.oculares || []).length)) { usarEjemplo('No se pudo leer el catálogo de equipo. Se usa un equipo de ejemplo.'); return; }
            catalogo = { telescopios: d.telescopios || [], oculares: d.oculares || [] };
            var hint = $('sim-eq-hint'); if (hint) hint.textContent = 'Telescopio y ocular elegidos del catálogo de equipo.';
            poblarEquipo();
          })
          .catch(function () { usarEjemplo('No se pudo leer el catálogo de equipo. Se usa un equipo de ejemplo.'); });
      }

      function usarEjemplo(mensaje) {
        catalogo = { telescopios: TELE_EJEMPLO.slice(), oculares: OCULARES_EJEMPLO.slice() };
        var hint = $('sim-eq-hint'); if (hint) hint.textContent = mensaje;
        poblarEquipo();
      }

      // Monta los buscadores de telescopio y ocular (buscador común de la web) y
      // preselecciona la primera pieza útil de cada uno.
      function poblarEquipo() {
        BitacoraBase.montarBuscadorCatalogo({
          input: $('sim-tele-input'), suggest: $('sim-tele-sugg'),
          fuente: function () { return (catalogo.telescopios || []).filter(function (p) { return num(p.focal_mm) > 0; }); },
          texto: nombrePieza, specs: specsTele,
          onElegir: function (it) { teleSel = it; $('sim-tele-input').value = nombrePieza(it); actualizar(); }
        });
        BitacoraBase.montarBuscadorCatalogo({
          input: $('sim-ocular-input'), suggest: $('sim-ocular-sugg'),
          fuente: function () { return (catalogo.oculares || []).filter(function (p) { return num(p.focal_mm) > 0; }); },
          texto: nombrePieza, specs: specsOcular,
          onElegir: function (it) { ocularSel = it; $('sim-ocular-input').value = nombrePieza(it); actualizar(); }
        });

        var t0 = (catalogo.telescopios || []).find(function (p) { return num(p.focal_mm) && num(p.apertura_mm); });
        if (t0) { teleSel = t0; $('sim-tele-input').value = nombrePieza(t0); }
        var o0 = (catalogo.oculares || []).find(function (p) { return num(p.focal_mm); });
        if (o0) { ocularSel = o0; $('sim-ocular-input').value = nombrePieza(o0); }
        actualizar();
      }

      /* ══════════════════ CÁLCULO ÓPTICO ══════════════════ */
      function teleFocal()    { return teleSel ? (num(teleSel.focal_mm) || 0) : 0; }
      function teleApertura() { return teleSel ? (num(teleSel.apertura_mm) || 0) : 0; }
      function pupilaOjo()    { return parseFloat($('sim-pupila-ojo').value) || 7; }

      function datosOcular() {
        var oc = pupilaOptica(ocularSel);
        var F = teleFocal(), D = teleApertura();
        var aumentos  = F / oc.focal;
        var campoReal = oc.afov / aumentos;
        var pupila    = D / aumentos;
        return { aumentos: aumentos, campoReal: campoReal, pupila: pupila, afov: oc.afov };
      }

      function ventanaBase() { return Math.min(560, window.innerWidth - 80, window.innerHeight - 240); }

      /* ══════════════════ RENDER CENTRALIZADO ══════════════════ */
      function actualizar() {
        var aviso = $('sim-aviso');
        var lecturas = ['sim-v-aum', 'sim-v-real', 'sim-v-apar', 'sim-v-pupila', 'sim-v-brillo', 'sim-v-cielo', 'sim-v-maglim'];
        var cargando = $('sim-cargando');
        var img = $('sim-img');
        var canvas = $('sim-lienzo');

        if (!teleSel || !teleFocal() || !teleApertura()) {
          lecturas.forEach(function (id) { $(id).innerHTML = '—'; });
          cargando.style.display = 'flex'; cargando.textContent = 'Elige un telescopio con focal y apertura.';
          return;
        }
        if (!ocularSel || !num(ocularSel.focal_mm)) {
          lecturas.forEach(function (id) { $(id).innerHTML = '—'; });
          cargando.style.display = 'flex'; cargando.textContent = 'Elige un ocular.';
          return;
        }

        var d = datosOcular();
        $('sim-v-aum').innerHTML    = d.aumentos.toFixed(0) + '<em>x</em>';
        $('sim-v-real').innerHTML   = d.campoReal.toFixed(2) + '<em>°</em>';
        $('sim-v-apar').innerHTML   = d.afov + '<em>°</em>';
        $('sim-v-pupila').innerHTML = d.pupila.toFixed(1) + '<em>mm</em>';

        var diam = ventanaBase() * Math.min(1, d.afov / AFOV_REF);
        var vista = $('sim-vista');
        vista.style.width = diam + 'px';
        vista.style.height = diam + 'px';

        // Lecturas fotométricas (dependen solo de la óptica y el cielo).
        var pOjo = pupilaOjo();
        var pEf = Math.min(d.pupila, pOjo);
        var brillo = Math.pow(pEf / pOjo, 2);
        var sqm = parseFloat($('sim-sqm').value) || 21;
        var D = teleApertura();
        $('sim-v-brillo').innerHTML = (brillo * 100).toFixed(0) + '<em>%</em>';
        $('sim-v-cielo').innerHTML  = (sqm + 5 * Math.log10(pOjo / pEf)).toFixed(1) + '<em>mag/arcsec²</em>';
        $('sim-v-maglim').innerHTML = (7.7 + 5 * Math.log10(D / 100)).toFixed(1) + '<em>m</em>';

        // Recorte del cielo: lado = campo real, limitado por el servidor.
        var arcmin = d.campoReal * 60;
        if (arcmin > DSS_MAX_ARCMIN) {
          aviso.textContent = 'El campo real (' + (arcmin / 60).toFixed(2) + '°) supera el máximo (2°): la imagen se recorta a 2°.';
          arcmin = DSS_MAX_ARCMIN;
        } else {
          aviso.textContent = '';
        }
        if (d.pupila > pOjo && !aviso.textContent) {
          aviso.textContent = 'Pupila de salida (' + d.pupila.toFixed(1) + ' mm) mayor que la del ojo (' + pOjo + ' mm): parte de la luz se desperdicia.';
        }

        var origen = $('sim-origen').value;
        var ra = OBJETO.ra, dec = OBJETO.dec;
        cargando.style.display = 'flex';
        cargando.textContent = 'solicitando imagen…';
        var peticion = ++contadorPeticion;

        if (origen === 'canvas-2d') {
          renderGaia2D(arcmin, peticion);
          return;
        }

        if (origen === 'hips') {
          var u = urlHips(ra, dec, arcmin);
          cargarPlaca(u).then(function (im) {
            if (peticion !== contadorPeticion) return;
            if (!im) { cargando.textContent = 'hips2fits no respondió: prueba el origen DSS.'; return; }
            cargando.style.display = 'none';
            renderizar(im, null, u);
          });
        } else {
          // Fusión HDR siempre activa: la placa profunda (DSS2-red) para la
          // nebulosidad tenue y la corta (DSS1) para recuperar los núcleos quemados.
          var urlProfunda = urlPlaca('DSS2-red', ra, dec, arcmin);
          var urlCorta    = urlPlaca('DSS1', ra, dec, arcmin);
          Promise.all([cargarPlaca(urlProfunda), cargarPlaca(urlCorta)])
            .then(function (res) {
              var profunda = res[0], corta = res[1];
              if (peticion !== contadorPeticion) return;
              if (!profunda && !corta) { cargando.textContent = 'No se pudo cargar la placa del DSS. ¿Está dss-proxy.php accesible?'; return; }
              cargando.style.display = 'none';
              renderizar(profunda || corta, profunda ? corta : null, urlProfunda);
            });
        }
      }

      /* Nivel de gris del fondo de cielo (0–255) según el fondo del observador,
         con EXACTAMENTE la misma cadena que el motor fotométrico: el flujo del
         cielo atenuado por la pupila de salida se mapea linealmente en
         magnitudes entre SB_NEGRO (negro) y SB_BLANCO (blanco). Así el fondo del
         Canvas 2D coincide con el de las vistas DSS/PanSTARRS. */
      function nivelFondoCielo(pupila) {
        var pOjo = pupilaOjo(), pEf = Math.min(pupila, pOjo);
        var sqm = parseFloat($('sim-sqm').value) || 21;
        var dim = Math.pow(pEf / pOjo, 2);
        // SBe = brillo del cielo en el ocular (más alto = más oscuro): el SQM
        // atenuado por la pupila de salida (por eso a más aumentos, más oscuro).
        return Math.round(nivelCielo(sqm - 2.5 * Math.log10(dim)));
      }

      /* ══════════════════ MODO ESTRELLAS DE GAIA (CANVAS 2D) ══════════════════
         Dibuja las estrellas reales de Gaia DR3 sobre un fondo de cielo aclarado
         según el "Fondo de cielo" del observador (mismo gris que el motor
         fotométrico), con la misma consulta y proyección (dibujarGaia) que la
         superposición de Gaia sobre DSS/PanSTARRS, así el fondo y las posiciones
         se parecen lo máximo posible a esas vistas. */
      function renderGaia2D(arcmin, peticion) {
        var img = $('sim-img'), canvas = $('sim-lienzo'), cargando = $('sim-cargando');
        img.style.display = 'none';
        canvas.style.display = 'block';
        canvas.width = canvas.height = PROC;
        var ctx = canvas.getContext('2d');
        var fondo = nivelFondoCielo(datosOcular().pupila);
        var colorFondo = 'rgb(' + fondo + ',' + fondo + ',' + fondo + ')';
        ctx.fillStyle = colorFondo; ctx.fillRect(0, 0, PROC, PROC);
        cargando.style.display = 'flex'; cargando.textContent = 'consultando estrellas de Gaia DR3…';

        var ra0 = sexToDeg(OBJETO.ra, true), dec0 = sexToDeg(OBJETO.dec, false);
        // Magnitud límite. Bajo cielo oscuro poblamos el campo hasta ~mag 13,5
        // (densidad como el survey); a medida que el cielo se aclara respecto a
        // GAIA_CFG.sbRefCielo, el límite baja y las estrellas más débiles
        // DESAPARECEN, igual que en el DSS. SBe = brillo del cielo en el ocular.
        var pOjo = pupilaOjo(), pEf = Math.min(datosOcular().pupila, pOjo);
        var sqm = parseFloat($('sim-sqm').value) || 21;
        var SBe = sqm - 2.5 * Math.log10(Math.pow(pEf / pOjo, 2));
        var mlimOscuro = Math.max(7.7 + 5 * Math.log10(teleApertura() / 100), 13.5);
        var mlim = mlimOscuro - GAIA_CFG.mermaCielo * Math.max(0, GAIA_CFG.sbRefCielo - SBe);
        consultarGaia(ra0, dec0).then(function (estrellas) {
          if (peticion !== contadorPeticion) return;
          cargando.style.display = 'none';
          ctx.fillStyle = colorFondo; ctx.fillRect(0, 0, PROC, PROC);
          dibujarGaia(ctx, estrellas, ra0, dec0, arcmin, mlim);
        }).catch(function () {
          if (peticion !== contadorPeticion) return;
          cargando.textContent = 'No se pudo consultar Gaia DR3 (VizieR).';
        });
      }

      /* ══════════════════ URLS Y PROCESADO FOTOMÉTRICO ══════════════════ */
      function urlPlaca(survey, ra, dec, arcmin) { return DSS_BASE + '?ra=' + encodeURIComponent(ra) + '&dec=' + encodeURIComponent(dec) + '&equinox=J2000&name=&x=' + arcmin.toFixed(1) + '&y=' + arcmin.toFixed(1) + '&Sky-Survey=' + survey + '&mime-type=download-gif'; }
      function sexToDeg(s, esRA) { var sig = /^\s*-/.test(s) ? -1 : 1; var p = s.trim().replace(/[+\-]/g, '').replace(/:/g, ' ').split(/\s+/).map(Number); var abs = (p[0] || 0) + (p[1] || 0) / 60 + (p[2] || 0) / 3600; return sig * abs * (esRA ? 15 : 1); }
      function urlHips(ra, dec, arcmin) { return 'https://alasky.cds.unistra.fr/hips-image-services/hips2fits?hips=' + encodeURIComponent('CDS/P/PanSTARRS/DR1/color-z-zg-g') + '&ra=' + sexToDeg(ra, true).toFixed(5) + '&dec=' + sexToDeg(dec, false).toFixed(5) + '&fov=' + (arcmin / 60).toFixed(4) + '&width=' + PROC + '&height=' + PROC + '&projection=TAN&format=jpg'; }
      function cargarPlaca(url) { return new Promise(function (res) { var im = new Image(); im.crossOrigin = 'anonymous'; im.onload = function () { res(im); }; im.onerror = function () { res(null); }; im.src = url; }); }

      function lumas(imagen) {
        var c = document.createElement('canvas'); c.width = c.height = PROC; var ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(imagen, 0, 0, PROC, PROC); var dd;
        try { dd = ctx.getImageData(0, 0, PROC, PROC).data; } catch (e) { return null; }
        var v = new Float32Array(PROC * PROC); for (var i = 0, j = 0; j < v.length; i += 4, j++) v[j] = (dd[i] + dd[i + 1] + dd[i + 2]) / 3; return v;
      }

      var suave = function (x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
      function fusionar(vd, vs) { var sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0, i; for (i = 0; i < vd.length; i++) { if (vd[i] >= 120 && vd[i] <= 215 && vs[i] > 8) { sx += vs[i]; sy += vd[i]; sxx += vs[i] * vs[i]; sxy += vs[i] * vd[i]; n++; } } if (n < 500) return vd; var a = (n * sxy - sx * sy) / (n * sxx - sx * sx); var b = (sy - a * sx) / n; if (!(a > 0)) return vd; var out = new Float32Array(vd.length); for (i = 0; i < vd.length; i++) { var t = suave((vd[i] - 210) / 40); out[i] = (1 - t) * vd[i] + t * Math.max(vd[i], a * vs[i] + b); } return out; }
      function desenfocar(v, radio) { var c = document.createElement('canvas'); c.width = c.height = PROC; var ctx = c.getContext('2d'); var im = ctx.createImageData(PROC, PROC); var i, j; for (i = 0, j = 0; j < v.length; i += 4, j++) { var o = Math.max(0, Math.min(255, v[j])); im.data[i] = im.data[i + 1] = im.data[i + 2] = o; im.data[i + 3] = 255; } ctx.putImageData(im, 0, 0); var c2 = document.createElement('canvas'); c2.width = c2.height = PROC; var ctx2 = c2.getContext('2d', { willReadFrequently: true }); ctx2.filter = 'blur(' + radio + 'px)'; ctx2.drawImage(c, 0, 0); var dd = ctx2.getImageData(0, 0, PROC, PROC).data; var out = new Float32Array(v.length); for (i = 0, j = 0; j < v.length; i += 4, j++) out[j] = dd[i]; return out; }
      function repararNucleos(v) { var entorno = desenfocar(v, 4); for (var i = 0; i < v.length; i++) { if (entorno[i] > 140 && v[i] < 0.5 * entorno[i]) v[i] = Math.min(300, entorno[i] * 1.25); } return v; }
      function adaptacionLocal(v) { var borroso = desenfocar(v, Math.round(PROC / 60)); var out = new Float32Array(v.length); var REALCE = 0.5, UMBRAL_DETALLE = 12; for (var j = 0; j < v.length; j++) { var dif = v[j] - borroso[j]; var mag = Math.abs(dif) - UMBRAL_DETALLE; var gan = dif >= 0 ? REALCE : REALCE * 0.25; out[j] = v[j] + (mag > 0 ? gan * Math.sign(dif) * mag : 0); } return out; }

      function procesarFotometrico(profunda, corta, canvas, p) {
        var vd = lumas(profunda); if (!vd) return false; var v = vd; if (corta) { var vs = lumas(corta); if (vs) v = fusionar(vd, vs); }
        var esHips = $('sim-origen').value === 'hips'; if (esHips) v = repararNucleos(v);
        var pOjo = pupilaOjo(), pEf = Math.min(p, pOjo); var sqm = parseFloat($('sim-sqm').value) || 21; var dim = Math.pow(pEf / pOjo, 2); var Fcielo = Math.pow(10, -0.4 * sqm); var rango = FOT.SB_NEGRO - FOT.SB_BLANCO;
        var Fref = Math.pow(10, -0.4 * 21); var Cmin = FOT.C_MIN * Math.pow(Fref / (Fcielo * dim), FOT.C_EXP);
        // El fondo de cielo se pinta con la curva empinada nivelCielo() (puede ir
        // a negro bajo cielos oscuros); el objeto se suma encima como INCREMENTO
        // de contraste sobre el cielo (Δmag = 2,5·log10(1 + Fobj·s / Fcielo)), que
        // se conserva intacto. Así, cielo oscuro → fondo negro y objeto pleno
        // (contraste brutal); cielo claro → fondo gris y menos incremento (lavado).
        var nivelFondo = nivelCielo(sqm - 2.5 * Math.log10(dim));
        var salida = new Float32Array(v.length);
        for (var i = 0; i < v.length; i++) {
          var Fobj = 0, vi = v[i];
          if (vi > 0) { if (esHips) vi = 255 * Math.pow(Math.min(vi, 512) / 255, FOT.GAMMA_HIPS); var sb = FOT.SB_OBJ_MIN - (vi / 255) * (FOT.SB_OBJ_MIN - FOT.SB_OBJ_MAX); Fobj = Math.pow(10, -0.4 * sb); }
          var s = suave((Fobj / (Fcielo * Cmin) - 1) / 1.5);
          salida[i] = nivelFondo + 255 * 2.5 * Math.log10(1 + (Fobj * s) / Fcielo) / rango;
        }
        var final = $('sim-adaptacion').checked ? adaptacionLocal(salida) : salida;
        canvas.width = canvas.height = PROC; var ctx = canvas.getContext('2d'); var im = ctx.createImageData(PROC, PROC);
        for (var k = 0, j = 0; j < final.length; k += 4, j++) { var o = Math.max(0, Math.min(255, final[j])); im.data[k] = im.data[k + 1] = im.data[k + 2] = o; im.data[k + 3] = 255; }
        ctx.putImageData(im, 0, 0); return true;
      }

      function renderizar(profunda, corta, urlRespaldo) {
        if (!ocularSel) return;
        var pupila = datosOcular().pupila;
        var img = $('sim-img');
        var canvas = $('sim-lienzo');
        var aviso = $('sim-aviso');

        // Simulación fotométrica píxel a píxel: siempre activa.
        if (!corsFallo) {
          if (procesarFotometrico(profunda, corta, canvas, pupila)) {
            canvas.style.display = 'block'; img.style.display = 'none';
            if ($('sim-gaia').checked) superponerGaia(canvas);
            return;
          }
          corsFallo = true;
          aviso.textContent = 'El navegador bloquea la lectura de píxeles (CORS): sirve las placas con dss-proxy.php desde tu dominio para activar el modo fotométrico.';
        }
        canvas.style.display = 'none'; img.style.display = 'block';
        img.src = urlRespaldo; aplicarPupila(img, pupila);
      }

      /* ══════════════════ ESTRELLAS SINTÉTICAS GAIA DR3 ══════════════════ */
      /* Consulta Gaia UNA sola vez por objeto, al radio máximo posible (el tope
         del DSS, 2° de lado → 1,44° de radio): los campos menores se recortan en
         cliente (dibujarGaia ya filtra por posición y magnitud), así cambiar de
         ocular u origen no vuelve a preguntar a VizieR. El filtro Gmag<=14 poda
         en el servidor ANTES de ordenar (sin él, en campos de Vía Láctea como
         Cygnus el ORDER BY sobre cientos de miles de filas tarda varios
         segundos) y cubre de sobra la mag. límite del canvas (13,5) y de
         cualquier equipo del catálogo. */
      var GAIA_RADIO_MAX = (DSS_MAX_ARCMIN / 60) * 0.72;   // 1,44°
      var GAIA_MAG_MAX = 14;
      // Devuelve estrellas [RA, Dec, Gmag, BP-RP]. El color BP-RP (bp_rp) puede
      // venir null en estrellas débiles sin fotometría BP/RP: se pintan blancas.
      function consultarGaia(ra0, dec0) { var clave = ra0.toFixed(3) + ',' + dec0.toFixed(3); if (cacheGaia[clave]) return cacheGaia[clave]; var adql = 'SELECT TOP 15000 RA_ICRS, DE_ICRS, Gmag, "BP-RP" FROM "I/355/gaiadr3" WHERE Gmag<=' + GAIA_MAG_MAX + ' AND 1=CONTAINS(POINT(\'ICRS\',RA_ICRS,DE_ICRS), CIRCLE(\'ICRS\',' + ra0.toFixed(5) + ',' + dec0.toFixed(5) + ',' + GAIA_RADIO_MAX.toFixed(5) + ')) ORDER BY Gmag'; var url = 'https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync?request=doQuery&lang=adql&format=json&query=' + encodeURIComponent(adql); return (cacheGaia[clave] = fetch(url).then(function (r) { return r.ok ? r.json() : null; }).then(function (jj) { return ((jj ? jj.data : null) || []).filter(function (f) { return f[2] != null; }); }).catch(function (e) { delete cacheGaia[clave]; throw e; })); }
      /* Crear un gradiente radial POR estrella es lo que dominaba el coste del
         Canvas 2D (~1 s con miles de estrellas): en su lugar se pre-renderiza un
         sprite por nivel de brillo (mismo gradiente exacto, 24 niveles) y cada
         estrella se estampa con drawImage, que es muchísimo más rápido. */
      var GAIA_NIVELES = 24;
      var spritesGaia = [];
      // Radio del disco de la estrella (halo incluido). El grosor del halo lo fija
      // GAIA_CFG.blur; con seeing perfecto las queremos como puntas de alfiler.
      function radioEstrella(f) { return (0.7 + 2.3 * f * f) * GAIA_CFG.blur; }

      function spriteGaia(nivel) {
        if (spritesGaia[nivel]) return spritesGaia[nivel];
        var f = (nivel + 0.5) / GAIA_NIVELES;
        var R = radioEstrella(f);
        var S = Math.ceil(R * 2) + 2, m = S / 2;
        var c = document.createElement('canvas'); c.width = c.height = S;
        var g = c.getContext('2d');
        var gr = g.createRadialGradient(m, m, 0, m, m, R);
        gr.addColorStop(0, 'rgba(255,255,255,' + (0.35 + 0.65 * f).toFixed(3) + ')');
        gr.addColorStop(0.45, 'rgba(255,255,255,' + (0.25 * f).toFixed(3) + ')');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(m, m, R, 0, 7); g.fill();
        return (spritesGaia[nivel] = c);
      }

      // Color de una estrella a partir de su índice BP-RP de Gaia: azul (caliente)
      // → blanco → amarillo → naranja → rojo (fría). Interpolación por tramos.
      var GAIA_COLOR = [[-0.3, 160, 190, 255], [0.3, 205, 220, 255], [0.8, 255, 250, 245], [1.3, 255, 228, 190], [1.8, 255, 205, 160], [3.0, 255, 175, 140]];
      function colorPorBpRp(bprp) {
        var A = GAIA_COLOR;
        if (bprp <= A[0][0]) return [A[0][1], A[0][2], A[0][3]];
        for (var i = 1; i < A.length; i++) {
          if (bprp <= A[i][0]) {
            var t = (bprp - A[i - 1][0]) / (A[i][0] - A[i - 1][0]);
            return [Math.round(A[i - 1][1] + t * (A[i][1] - A[i - 1][1])),
                    Math.round(A[i - 1][2] + t * (A[i][2] - A[i - 1][2])),
                    Math.round(A[i - 1][3] + t * (A[i][3] - A[i - 1][3]))];
          }
        }
        return [A[A.length - 1][1], A[A.length - 1][2], A[A.length - 1][3]];
      }
      // Estrella con tinte: núcleo blanco (saturado) y halo del color de la estrella.
      function dibujarEstrellaColor(ctx, x, y, f, rgb) {
        var R = radioEstrella(f);
        var gr = ctx.createRadialGradient(x, y, 0, x, y, R);
        gr.addColorStop(0, 'rgba(255,255,255,' + (0.35 + 0.65 * f).toFixed(3) + ')');
        gr.addColorStop(0.45, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + (0.28 * f).toFixed(3) + ')');
        gr.addColorStop(1, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill();
      }

      function dibujarGaia(ctx, estrellas, ra0, dec0, arcmin, mlim) {
        var escv = PROC / (arcmin / 60);
        var cos0 = Math.cos(dec0 * Math.PI / 180);
        ctx.globalCompositeOperation = 'lighter';
        for (var i = 0; i < estrellas.length; i++) {
          var ra = estrellas[i][0], dec = estrellas[i][1], g = estrellas[i][2], bprp = estrellas[i][3];
          if (g > mlim) continue;
          var x = PROC / 2 - (ra - ra0) * cos0 * escv;
          var y = PROC / 2 - (dec - dec0) * escv;
          if (x < -3 || y < -3 || x > PROC + 3 || y > PROC + 3) continue;
          var f = Math.min(1, (mlim - g) / 6);
          if (g < GAIA_CFG.magColor && bprp != null) {
            dibujarEstrellaColor(ctx, x, y, f, colorPorBpRp(bprp));   // solo las más brillantes llevan color
          } else {
            var sp = spriteGaia(Math.min(GAIA_NIVELES - 1, Math.floor(f * GAIA_NIVELES)));
            ctx.drawImage(sp, x - sp.width / 2, y - sp.height / 2);
          }
        }
        ctx.globalCompositeOperation = 'source-over';
      }

      function superponerGaia(canvas) {
        var arcmin = Math.min(datosOcular().campoReal * 60, DSS_MAX_ARCMIN); var ra0 = sexToDeg(OBJETO.ra, true); var dec0 = sexToDeg(OBJETO.dec, false); var D = teleApertura(); var mlim = 7.7 + 5 * Math.log10(D / 100); var pet = contadorPeticion;
        consultarGaia(ra0, dec0).then(function (estrellas) { if (pet !== contadorPeticion) return; dibujarGaia(canvas.getContext('2d'), estrellas, ra0, dec0, arcmin, mlim); }).catch(function () { $('sim-aviso').textContent = 'No se pudo consultar Gaia DR3 (VizieR): se muestra solo la imagen.'; });
      }

      function aplicarPupila(img, p) { var pOjo = pupilaOjo(), pEf = Math.min(p, pOjo); var brilloPercibido = Math.pow(Math.pow(pEf / pOjo, 2), 0.5); var umbral = 0.30 * (1 - pEf / pOjo); var pendiente = brilloPercibido / (1 - umbral); var despl = -pendiente * umbral; ['R', 'G', 'B'].forEach(function (c) { var f = document.querySelector('#sim-transfer-pupila feFunc' + c); if (f) { f.setAttribute('slope', pendiente.toFixed(4)); f.setAttribute('intercept', despl.toFixed(4)); } }); img.style.filter = 'grayscale(1) url(#sim-filtro-pupila)'; }

      (function pintarObjeto() {
        var box = $('sim-objeto'); if (!box) return;
        box.querySelector('.obj-nom').textContent = OBJETO.nombre;
        box.querySelector('.obj-coord').textContent = 'AR ' + OBJETO.ra + '  ·  Dec ' + OBJETO.dec + '  ·  ' + OBJETO.constelacion + ' (J2000)';
      })();

      /* ══════════════════ EVENTOS ══════════════════ */
      ['sim-pupila-ojo', 'sim-sqm'].forEach(function (id) { $(id).addEventListener('change', actualizar); });
      ['sim-adaptacion', 'sim-gaia', 'sim-origen'].forEach(function (id) { $(id).addEventListener('change', actualizar); });
      window.addEventListener('resize', function () { actualizar(); });

      /* ══════════════════ ARRANQUE ══════════════════ */
      cargarCatalogo();
      // Precalienta la consulta de Gaia del objeto en segundo plano: cuando el
      // usuario cambie a Canvas 2D (o el overlay la necesite) ya estará en caché.
      consultarGaia(sexToDeg(OBJETO.ra, true), sexToDeg(OBJETO.dec, false)).catch(function () { /* se reintentará al usarse */ });

    } catch (err) {
      console.error('[Bitácora] Error al iniciar el simulador de ocular:', err);
    }
  }
})();
