/* ===========================================================================
 * BITÁCORA MESSIER · Simulador de visión por ocular
 * ---------------------------------------------------------------------------
 * Reproduce cómo se vería el objeto elegido —un cúmulo abierto o una estrella de
 * carbono de la Astronomical League— a través del telescopio y el ocular
 * elegidos. Telescopio y ocular se eligen del catálogo global de equipo con el
 * buscador común (BitacoraBase, el mismo de Mi flota); el objeto, del selector
 * de dos pestañas (cúmulos / estrellas de carbono).
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
      // Cúmulos abiertos (de momento una selección; a futuro, un catálogo mayor).
      // Cada entrada lleva su marca `carbono:false` para el render de la ficha.
      var CATALOGO_CUMULOS = [
          { id: 'M35',      nombre: 'M35 · Cúmulo abierto (NGC 2168)',   constelacion: 'Gemini',    ra: '06 08 54', dec: '+24 20 00', tipo: 'cúmulo abierto', carbono: false },
          { id: 'M39',      nombre: 'M39 · Cúmulo abierto (NGC 7092)',   constelacion: 'Cygnus',    ra: '21 31 48', dec: '+48 26 55', tipo: 'cúmulo abierto', carbono: false },
          { id: 'NGC 7789', nombre: 'NGC 7789 · Rosa de Carolina',       constelacion: 'Cassiopeia', ra: '23 57 24', dec: '+56 42 56', tipo: 'cúmulo abierto', carbono: false }
      ];
      // Estrellas de carbono: catálogo de la Astronomical League, cargado desde el
      // módulo estrellas-carbono-datos.js (window.BITACORA_CARBONO). Se marca
      // `carbono:true` para que la ficha resalte su color rojo-anaranjado.
      var CATALOGO_CARBONO = (window.BITACORA_CARBONO || []).map(function (e) {
        return {
          id: e.id, nombre: e.nombre, constelacion: e.constelacion, abrev: e.abrev,
          ra: e.ra, dec: e.dec, mag: e.mag, tipo: e.tipo, carbono: true
        };
      });
      // Estrellas dobles: catálogo unificado (AL + Cambridge + RASC), cargado desde
      // estrellas-dobles-datos.js (window.BITACORA_DOBLES). Se marca `doble:true` para
      // que la ficha muestre Mag1/Mag2/Sep, las insignias de catálogo y el veredicto de
      // resolución (Dawes + aumento). El render lo sigue mandando Gaia (posiciones reales).
      var CATALOGO_DOBLES = (window.BITACORA_DOBLES || []).map(function (e) {
        return {
          id: e.id, nombre: e.nombre, constelacion: e.constelacion, abrev: e.abrev,
          ra: e.ra, dec: e.dec, tipo: e.tipo,
          mag1: e.mag1, mag2: e.mag2, sep: e.sep, catalogos: e.catalogos, aliases: e.aliases,
          doble: true
        };
      });
      // Códigos de catálogo -> nombre largo (fuente: mapa/datos/catalogos_dobles.csv).
      var CAT_DOBLES_NOMBRE = {
        AL:   'Double Star Club (Astronomical League)',
        CDSA: 'Cambridge Double Star Atlas',
        RASC: 'Royal Astronomical Society of Canada Double Star Program'
      };

      // Categorías del selector de objeto. La clave coincide con data-cat del HTML.
      var CATALOGOS_OBJ = { cumulos: CATALOGO_CUMULOS, carbono: CATALOGO_CARBONO, dobles: CATALOGO_DOBLES };
      var objetoSel = CATALOGO_CUMULOS[0];   // M35 por defecto

      var TELE_EJEMPLO = [{ id: '_t200', vendor: '', modelo: 'Newton 200/1200 (ejemplo)', optica: 'Newtonian', apertura_mm: 200, focal_mm: 1200 }];
      var OCULARES_EJEMPLO = [
        { id: '_o31', vendor: '', modelo: '31 mm (ejemplo)',   focal_mm: 31,   campo_aparente: 82 },
        { id: '_o18', vendor: '', modelo: '17,5 mm (ejemplo)', focal_mm: 17.5, campo_aparente: 95 },
        { id: '_o9',  vendor: '', modelo: '9 mm (ejemplo)',    focal_mm: 9,    campo_aparente: 100 },
        { id: '_o5',  vendor: '', modelo: '5 mm (ejemplo)',    focal_mm: 5,    campo_aparente: 60 }
      ];

      var DSS_MAX_ARCMIN = 120;
      var AFOV_REF = 110;
      var PROC = 720;

      // Transmisión luminosa del telescopio (fracción de luz aprovechada), usada
      // en la magnitud límite (Método del umbral). Torres Lapasió toma 0,9 para
      // refractores y 0,7 para reflectores; 0,8 es el valor medio POR DEFECTO
      // cuando no se conoce el tipo de tubo.
      var TRANSMISION_TELE = 0.8;

      // Margen (magnitudes) entre el límite ÓPTIMO del método de Torres Lapasió
      // —optimista: observador experto y condiciones ideales— y un límite TÍPICO
      // más realista para un observador medio. La lectura muestra el rango
      // típico–óptimo para dejar claro que es una horquilla, no un valor exacto.
      var MARGEN_MAGLIM = 0.7;

      // Transmisión según el tipo óptico (columna "Optics" del catálogo, en
      // inglés). Refractor 0,9 y reflector (2 espejos, sin corrector) 0,7 siguen
      // a Torres Lapasió; los catadióptricos, con lámina/menisco corrector y
      // obstrucción central, pierden algo más (~0,65-0,68). La clave se compara
      // en minúsculas; los tipos no listados usan el valor por defecto.
      var TRANSMISION_OPTICA = {
        'refractor':          0.9,
        'newtonian':          0.7,
        'cassegrain':         0.7,
        'ritchey-chretien':   0.7,
        'dall-kirkham':       0.7,
        'schmidt-cassegrain': 0.65,
        'mak-cassegrain':     0.65,
        'schmidt-newtonian':  0.68,
        'mak-newtonian':      0.68,
        'schmidt camera':     0.65
      };
      function transmisionPorOptica(optica) {
        if (!optica) return null;
        var t = TRANSMISION_OPTICA[String(optica).trim().toLowerCase()];
        return t != null ? t : null;
      }
      // Tipos ópticos cuyo secundario va sujeto por una ARAÑA de brazos → producen
      // diffraction spikes. Los refractores no tienen obstrucción; los SC/Mak sujetan
      // el secundario en la lámina/menisco (sin brazos) → sin spikes.
      var OPTICA_ARANA = {
        'newtonian': true, 'schmidt-newtonian': true, 'mak-newtonian': true,
        'cassegrain': true, 'ritchey-chretien': true, 'dall-kirkham': true,
        'refractor': false, 'schmidt-cassegrain': false, 'mak-cassegrain': false, 'schmidt camera': false
      };
      function opticaTieneArana(optica) {
        return !!(optica && OPTICA_ARANA[String(optica).trim().toLowerCase()]);
      }
      // ¿El telescopio seleccionado tiene araña? (manual: campo 'arana'; catálogo: por su óptica)
      function teleTieneArana() {
        if (!teleSel) return false;
        if (typeof teleSel.arana === 'boolean') return teleSel.arana;
        return opticaTieneArana(teleSel.optica);
      }

      /* El render de Gaia (ajustes, sprites, consulta y dibujo) vive en el módulo
         compartido BitacoraGaiaRender (bitacora-gaia-render.js), fuente única con el
         formulario de registro. Su config editable es BitacoraGaiaRender.config. */
      var GAIA_CFG = window.BitacoraGaiaRender.config;

      var CFG = window.BITACORA_OCULAR || {};
      var DSS_BASE = CFG.dssProxy || '/wp-content/uploads/bitacora/dss-proxy.php';

      /* ══════════════════ ESTADO ══════════════════ */
      var WP = window.BITACORA_WP || null;
      var catalogo = { telescopios: [], oculares: [], auxiliares: [] };
      var teleSel = null;
      var ocularSel = null;
      var auxSel = null;   // óptica auxiliar activa (Barlow/reductor); null = ninguna

      var corsFallo = false;
      var contadorPeticion = 0;

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
      // Rótulo del telescopio: su nombre propio de Mi flota si lo tiene (helper
      // compartido con la flota), o "vendor modelo" en su defecto.
      function nombreTele(p) { return BitacoraEquipo.nombreTelescopio(p) || '(sin nombre)'; }
      function itemPorId(cat, id) { var arr = catalogo[cat] || []; for (var i = 0; i < arr.length; i++) { if (String(arr[i].id) === String(id)) return arr[i]; } return null; }
      function specsTele(p) { var s = []; if (num(p.apertura_mm) != null) s.push(num(p.apertura_mm) + ' mm'); if (num(p.focal_mm) != null) s.push('f=' + num(p.focal_mm) + ' mm'); return s.join(' · '); }
      function specsOcular(p) { var s = []; if (num(p.focal_mm) != null) s.push(num(p.focal_mm) + ' mm'); if (num(p.campo_aparente) != null) s.push(num(p.campo_aparente) + '°'); return s.join(' · '); }
      // Specs de una óptica auxiliar: el factor (Barlow >1, reductor <1) y, si lo
      // trae, la extensión focal fija en mm.
      function specsAux(p) { var s = []; if (num(p.factor) != null) s.push('×' + num(p.factor)); if (num(p.extension_mm) != null) s.push('+' + num(p.extension_mm) + ' mm'); return s.join(' · '); }
      function pupilaOptica(p) { return { focal: num(p.focal_mm), afov: num(p.campo_aparente) || 60 }; }

      // URL del catálogo GLOBAL de equipo, por orden de preferencia:
      //   1) con sesión: derivada de BITACORA_WP (y se manda el nonce);
      //   2) sin sesión: la URL pública inyectada en BITACORA_PUBLICO;
      //   3) último recurso: se construye desde el propio dominio (wp-json),
      //      para no depender de la inyección del plugin. El endpoint es público,
      //      así que un GET sin nonce basta.
      function urlCatalogo() {
        if (WP && WP.endpoint) return WP.endpoint.replace(/observaciones\/?$/, 'equipo') + '/catalogo';
        var PUB = window.BITACORA_PUBLICO || {};
        if (PUB.catalogoEquipo) return PUB.catalogoEquipo;
        return location.origin + '/wp-json/bitacora/v1/equipo/catalogo';
      }
      function cargarCatalogo() {
        var API = urlCatalogo();
        var headers = (WP && WP.nonce) ? { 'X-WP-Nonce': WP.nonce } : {};
        fetch(API, { credentials: 'same-origin', headers: headers })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) {
            if (!d || (!(d.telescopios || []).length && !(d.oculares || []).length)) { usarEjemplo('No se pudo leer el catálogo de equipo. Se usa un equipo de ejemplo.'); return; }
            catalogo = { telescopios: d.telescopios || [], oculares: d.oculares || [], auxiliares: d.auxiliares || [] };
            var hint = $('sim-eq-hint'); if (hint) hint.textContent = 'Telescopio y ocular elegidos del catálogo de equipo.';
            poblarEquipo();
          })
          .catch(function () { usarEjemplo('No se pudo leer el catálogo de equipo. Se usa un equipo de ejemplo.'); });
      }

      function usarEjemplo(mensaje) {
        catalogo = { telescopios: TELE_EJEMPLO.slice(), oculares: OCULARES_EJEMPLO.slice(), auxiliares: [] };
        var hint = $('sim-eq-hint'); if (hint) hint.textContent = mensaje;
        poblarEquipo();
      }

      // Monta los buscadores de telescopio y ocular (buscador común de la web) y
      // preselecciona la primera pieza útil de cada uno.
      function poblarEquipo() {
        BitacoraBase.montarBuscadorCatalogo({
          input: $('sim-tele-input'), suggest: $('sim-tele-sugg'),
          fuente: function () { return (catalogo.telescopios || []).filter(function (p) { return num(p.focal_mm) > 0; }); },
          texto: nombreTele, specs: specsTele,
          onElegir: function (it) { teleSel = it; $('sim-tele-input').value = nombreTele(it); limpiarTeleManual(); actualizar(); }
        });
        BitacoraBase.montarBuscadorCatalogo({
          input: $('sim-ocular-input'), suggest: $('sim-ocular-sugg'),
          fuente: function () { return (catalogo.oculares || []).filter(function (p) { return num(p.focal_mm) > 0; }); },
          texto: nombrePieza, specs: specsOcular,
          onElegir: function (it) { ocularSel = it; $('sim-ocular-input').value = nombrePieza(it); actualizar(); }
        });

        // ÓPTICA AUXILIAR (opcional): Barlow, reductor, Powermate… Modifica la
        // focal efectiva del telescopio. Si no hay ninguna elegida, la simulación
        // usa la focal del tubo tal cual. El botón "sin auxiliar" la quita.
        var auxInput = $('sim-aux-input');
        if (auxInput) {
          BitacoraBase.montarBuscadorCatalogo({
            input: auxInput, suggest: $('sim-aux-sugg'),
            fuente: function () { return (catalogo.auxiliares || []); },
            texto: nombrePieza, specs: specsAux,
            todosSiVacio: true,   // catálogo corto: al enfocar lista todas las opciones para elegir
            onElegir: function (it) { auxSel = it; auxInput.value = nombrePieza(it); actualizar(); }
          });
          var auxClear = $('sim-aux-clear');
          if (auxClear) auxClear.addEventListener('click', function () { auxSel = null; auxInput.value = ''; actualizar(); });
        }

        var t0 = (catalogo.telescopios || []).find(function (p) { return num(p.focal_mm) && num(p.apertura_mm); });
        if (t0) { teleSel = t0; $('sim-tele-input').value = nombreTele(t0); }
        var o0 = (catalogo.oculares || []).find(function (p) { return num(p.focal_mm); });
        if (o0) { ocularSel = o0; $('sim-ocular-input').value = nombrePieza(o0); }
        actualizar();
      }

      // TELESCOPIO MANUAL: para equipos que no están en el catálogo. El enlace
      // despliega dos campos (apertura y focal); al rellenar ambos se usan como
      // telescopio activo, y el buscador queda vacío para no dar lugar a dudas.
      function limpiarTeleManual() {
        var a = $('sim-tele-manual-apert'), f = $('sim-tele-manual-focal');
        if (a) a.value = ''; if (f) f.value = '';
      }
      function montarTeleManual() {
        var toggle = $('sim-tele-manual-toggle'), caja = $('sim-tele-manual');
        var apert = $('sim-tele-manual-apert'), focal = $('sim-tele-manual-focal'), tipo = $('sim-tele-manual-tipo');
        if (!toggle || !caja || !apert || !focal) return;
        toggle.addEventListener('click', function () {
          var abrir = caja.hidden;
          caja.hidden = !abrir;
          toggle.setAttribute('aria-expanded', abrir ? 'true' : 'false');
          if (abrir) (num(apert.value) ? focal : apert).focus();
        });
        function usarManual() {
          var a = num(apert.value), f = num(focal.value);
          if (!(a > 0) || !(f > 0)) return;
          // El tipo fija la transmisión t (refractor 0,9 · reflector 0,7 ·
          // catadióptrico 0,65, siguiendo a Torres Lapasió); se guarda en el
          // telescopio para que magLimiteTelescopio() la use.
          var t = (tipo && num(tipo.value)) || TRANSMISION_TELE;
          // ¿Tiene araña? La opción marcada con data-arana (Reflector/Newton) sí;
          // refractor y catadióptrico no → sin diffraction spikes.
          var opt = tipo && tipo.options[tipo.selectedIndex];
          var arana = !!(opt && opt.getAttribute('data-arana') === '1');
          teleSel = { id: '_manual', vendor: '', modelo: 'Telescopio manual', apertura_mm: a, focal_mm: f, transmision: t, arana: arana };
          $('sim-tele-input').value = '';
          actualizar();
        }
        apert.addEventListener('input', usarManual);
        focal.addEventListener('input', usarManual);
        if (tipo) tipo.addEventListener('change', usarManual);
      }

      /* ══════════════════ CÁLCULO ÓPTICO ══════════════════ */
      // Focal EFECTIVA del telescopio: la del tubo modificada por la óptica
      // auxiliar activa (factor de Barlow/reductor + extensión fija). Sin auxiliar
      // = la focal del tubo. Es el único punto donde entra el auxiliar: aumentos,
      // pupila de salida, campo y magnitud límite heredan el cambio.
      function teleFocal() {
        if (!teleSel) return 0;
        var f = BitacoraEquipo.focalEfectiva(
          teleSel.focal_mm,
          auxSel ? auxSel.factor : null,
          auxSel ? auxSel.extension_mm : null);
        return f || 0;
      }
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

      /* Magnitud estelar límite del conjunto telescopio + ocular (TLM), según el
         "Método del umbral" de J. R. Torres Lapasió ("On the Prediction of
         Visibility for Deep-Sky Objects", RIGEL/AVA, 1994/2000). A diferencia de
         la vieja regla 7,7 + 5·log(D/100) —que solo depende de la apertura—, aquí
         el límite SUBE con el aumento (que oscurece el fondo del cielo) y BAJA
         cuando el cielo es más brillante, tal como se observa en la práctica.

         Cadena de cálculo (con D = apertura en mm, MAG = aumentos, t = transmisión):
           1) Fondo del cielo visto por el ocular, oscurecido por el aumento (Ec. 5):
                SB0T = SB0 + 5·log10(7,5·MAG / (D·√t))
              donde SB0 = SQM (brillo del cielo a ojo desnudo, mag/arcsec²). Se
              acota entre SB0 (con pupilas de salida grandes el fondo no se
              oscurece por debajo del de ojo desnudo) y 27 mag/arcsec² (umbral de
              detección del ojo: no cabe oscurecer más).
           2) Estrella más débil visible sobre ese fondo oscurecido (Ec. 6):
                TLM = -22,81 + 1,792·SB0T - 0,02949·SB0T² + 2,5·log10(D²·t)
         El máximo posible (SB0T = 27) coincide con la Ec. 7:
                TLM_máx = 4,12 + 2,5·log10(D²·t). */
      function magLimiteTelescopio() {
        var D = teleApertura(), MAG = datosOcular().aumentos;
        // Transmisión del tubo, por orden de preferencia: la fijada a mano
        // (teleSel.transmision, telescopio manual con tipo elegido), luego la
        // deducida del tipo óptico del catálogo (teleSel.optica), y si no, el
        // valor medio por defecto.
        var t = TRANSMISION_TELE;
        if (teleSel) {
          if (num(teleSel.transmision) > 0) { t = num(teleSel.transmision); }
          else { var tOpt = transmisionPorOptica(teleSel.optica); if (tOpt) { t = tOpt; } }
        }
        if (!(D > 0) || !(MAG > 0)) return null;
        var sqm = parseFloat($('sim-sqm').value) || 21;
        var SB0T = sqm + 5 * Math.log10(7.5 * MAG / (D * Math.sqrt(t)));
        SB0T = Math.max(sqm, Math.min(27, SB0T));
        return -22.81 + 1.792 * SB0T - 0.02949 * SB0T * SB0T + 2.5 * Math.log10(D * D * t);
      }

      /* ══════════════════ RENDER CENTRALIZADO ══════════════════ */
      function actualizar() {
        var aviso = $('sim-aviso');
        // El veredicto de resolución de una doble depende del equipo (apertura y
        // aumento): se recalcula en cada actualización, también si falta equipo.
        if (objetoSel && objetoSel.doble) pintarObjeto();
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
        $('sim-v-brillo').innerHTML = (brillo * 100).toFixed(0) + '<em>%</em>';
        $('sim-v-cielo').innerHTML  = (sqm + 5 * Math.log10(pOjo / pEf)).toFixed(1) + '<em>mag/arcsec²</em>';
        // Mag. límite como RANGO típico–óptimo: el óptimo es el valor de Torres
        // Lapasió (optimista); el típico resta un margen para el observador medio.
        var magOpt = magLimiteTelescopio();
        $('sim-v-maglim').innerHTML = (magOpt == null ? '—'
          : (magOpt - MARGEN_MAGLIM).toFixed(1) + '–' + magOpt.toFixed(1) + '<em>m</em>');

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
        var ra = objetoSel.ra, dec = objetoSel.dec;
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
          renderDSS(arcmin, peticion);
        }
      }

      // Carga y compone la placa DSS (fusión HDR: DSS2-red profunda + DSS1 corta).
      // Extraído de actualizar() para poder reutilizarlo como RESPALDO cuando la
      // consulta a Gaia (Canvas 2D) falla —así una caída de VizieR no deja negro—.
      function renderDSS(arcmin, peticion) {
        var cargando = $('sim-cargando');
        var ra = objetoSel.ra, dec = objetoSel.dec;
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

        var ra0 = sexToDeg(objetoSel.ra, true), dec0 = sexToDeg(objetoSel.dec, false);
        // Magnitud límite del telescopio + ocular (Método del umbral): con más
        // aumento el fondo se oscurece y se alcanzan estrellas más débiles; con
        // el cielo más brillante, el límite baja y las débiles DESAPARECEN,
        // igual que en el DSS. dibujarGaia solo pinta estrellas con Gmag <= mlim.
        var mlim = magLimiteTelescopio();
        consultarGaia(ra0, dec0, arcmin).then(function (estrellas) {
          if (peticion !== contadorPeticion) return;
          cargando.style.display = 'none';
          ctx.fillStyle = colorFondo; ctx.fillRect(0, 0, PROC, PROC);
          dibujarGaia(ctx, estrellas, ra0, dec0, arcmin, mlim, true, !!objetoSel.carbono);   // Canvas 2D: con glow de estrellas no resueltas
        }).catch(function () {
          if (peticion !== contadorPeticion) return;
          // Gaia (VizieR) no respondió tras los reintentos: en vez de dejar el
          // canvas en negro, mostramos la placa DSS del mismo campo como respaldo.
          cargando.style.display = 'flex';
          cargando.textContent = 'Gaia DR3 no responde (CDS/GAVO); mostrando placa DSS…';
          renderDSS(arcmin, peticion);
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
        var final = adaptacionLocal(salida);   // adaptación local del ojo: siempre activa
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
            superponerGaia(canvas);
            return;
          }
          corsFallo = true;
          aviso.textContent = 'El navegador bloquea la lectura de píxeles (CORS): sirve las placas con dss-proxy.php desde tu dominio para activar el modo fotométrico.';
        }
        canvas.style.display = 'none'; img.style.display = 'block';
        img.src = urlRespaldo; aplicarPupila(img, pupila);
      }

      /* ══════════════════ ESTRELLAS SINTÉTICAS GAIA DR3 ══════════════════ */
      /* Consulta Gaia con RADIO ADAPTADO al campo del ocular (no un radio fijo
         enorme): un ocular de campo pequeño pide muchas menos estrellas → la
         consulta es más rápida y no revienta el modo sync de los TAP. Se cachea
         por objeto guardando el radio pedido: si una vista posterior necesita un
         radio menor o igual, se reutiliza (dibujarGaia recorta por posición y
         magnitud); solo un ocular de campo MAYOR fuerza una nueva consulta.
         FAILOVER de proveedor: si el primero (CDS/VizieR) no responde, se prueba
         el siguiente (GAVO, Heidelberg, infraestructura independiente) antes de
         rendirse; renderGaia2D, si TODOS fallan, cae a la placa DSS. */
      /* Consulta y dibujo de Gaia: delegados al módulo compartido BitacoraGaiaRender.
         Aquí quedan solo los adaptadores que le pasan el equipo/cielo del simulador. */
      function consultarGaia(ra0, dec0, arcmin) {
        return BitacoraGaiaRender.consultar(ra0, dec0, arcmin);
      }
      function dibujarGaia(ctx, estrellas, ra0, dec0, arcmin, mlim, conGlow, objetoCarbono) {
        BitacoraGaiaRender.dibujar(ctx, estrellas, {
          ra: ra0, dec: dec0, arcmin: arcmin, mlim: mlim,
          conGlow: conGlow, carbono: objetoCarbono, arana: teleTieneArana()
        });
      }

      function superponerGaia(canvas) {
        // En las vistas DSS/PanSTARRS la PLACA fotográfica ya contiene el campo de
        // estrellas hasta muy débil; el overlay de Gaia solo REALZA las estrellas
        // brillantes (núcleo nítido y color, que la placa quema). Por eso aquí el
        // límite es mucho más brillante que la magnitud límite del telescopio
        // —que sí se usa en el modo Canvas 2D, donde no hay placa y las estrellas
        // de Gaia son lo único que se pinta—. Si se usara aquí la mag. límite
        // plena, el DSS se llenaría de las mismas estrellas que el Canvas 2D y
        // ambas vistas quedarían casi idénticas.
        var arcmin = Math.min(datosOcular().campoReal * 60, DSS_MAX_ARCMIN); var ra0 = sexToDeg(objetoSel.ra, true); var dec0 = sexToDeg(objetoSel.dec, false); var mlim = 7.7 + 5 * Math.log10(teleApertura() / 100); var pet = contadorPeticion;
        consultarGaia(ra0, dec0, arcmin).then(function (estrellas) { if (pet !== contadorPeticion) return; dibujarGaia(canvas.getContext('2d'), estrellas, ra0, dec0, arcmin, mlim, false, !!objetoSel.carbono); }).catch(function () { $('sim-aviso').textContent = 'No se pudo consultar Gaia DR3: se muestra solo la imagen.'; });
      }

      function aplicarPupila(img, p) { var pOjo = pupilaOjo(), pEf = Math.min(p, pOjo); var brilloPercibido = Math.pow(Math.pow(pEf / pOjo, 2), 0.5); var umbral = 0.30 * (1 - pEf / pOjo); var pendiente = brilloPercibido / (1 - umbral); var despl = -pendiente * umbral; ['R', 'G', 'B'].forEach(function (c) { var f = document.querySelector('#sim-transfer-pupila feFunc' + c); if (f) { f.setAttribute('slope', pendiente.toFixed(4)); f.setAttribute('intercept', despl.toFixed(4)); } }); img.style.filter = 'grayscale(1) url(#sim-filtro-pupila)'; }

      // Pinta la ficha del objeto activo. Para estrellas de carbono añade una
      // línea de metadatos (magnitud, tipo) y un aviso de su color, y tiñe la
      // tarjeta de ámbar (clase .es-carbono); para cúmulos usa el azul de siempre.
      function num1(v) { return (v == null) ? '' : String(v).replace('.', ','); }

      // Insignias de los catálogos en que aparece la doble ("AL|CDSA|RASC").
      function insigniasDoble(catalogos) {
        return (catalogos || '').split('|').filter(Boolean).map(function (c) {
          return '<span class="obj-cat" title="' + BitacoraBase.esc(CAT_DOBLES_NOMBRE[c] || c) + '">' +
                 BitacoraBase.esc(c) + '</span>';
        }).join('');
      }

      // Veredicto "¿se resuelve con tu equipo?" para una doble. Dos condiciones
      // independientes: la APERTURA (límite de Dawes 116/D mm) y el AUMENTO (para
      // percibir el hueco hace falta que aumentos·sep alcance ~480" de campo aparente
      // cómodo, ~300" para empezar a partirla). Ver notas-resolucion-dobles.md.
      function resolucionDoble(o) {
        if (o.sep == null) return { clase: 'is-desconocida', texto: 'Separación no catalogada: no se puede predecir el desdoble.' };
        if (!teleSel || !ocularSel || !teleApertura() || !num(ocularSel.focal_mm))
          return { clase: 'is-pendiente', texto: 'Elige telescopio y ocular para ver si se resuelve.' };
        var D = teleApertura(), aum = datosOcular().aumentos, sep = o.sep;
        var dawes = 116 / D;                       // límite de resolución por difracción (Dawes)
        var dtxt = '≈ ' + dawes.toFixed(1).replace('.', ',') + '″';
        if (sep < dawes)
          return { clase: 'is-no', texto: 'Par demasiado cerrado para tu apertura (Dawes ' + dtxt + ', separación ' + num1(sep) + '″).' };
        var xComodo = Math.ceil(480 / sep);        // aumento para un hueco cómodo (~8′)
        if (aum * sep >= 480)
          return { clase: 'is-si', texto: 'Se resuelve: apertura de sobra (Dawes ' + dtxt + ') y a ' + aum.toFixed(0) + '× el hueco es cómodo.' };
        if (aum * sep >= 300)
          return { clase: 'is-justo', texto: 'Se resuelve justo: la apertura llega (Dawes ' + dtxt + '), pero para separarlas con holgura sube a ≳ ' + xComodo + '×.' };
        return { clase: 'is-justo', texto: 'Tu apertura la resuelve (Dawes ' + dtxt + '), pero a ' + aum.toFixed(0) + '× el aumento es escaso: sube a ≳ ' + xComodo + '× para ver el hueco.' };
      }

      function pintarObjeto() {
        var box = $('sim-objeto'); if (!box) return;
        var o = objetoSel;
        box.querySelector('.obj-nom').textContent = o.nombre;
        box.querySelector('.obj-coord').textContent = 'AR ' + o.ra + '  ·  Dec ' + o.dec + '  ·  ' + o.constelacion + ' (J2000)';
        box.classList.toggle('es-carbono', !!o.carbono);
        box.classList.toggle('es-doble', !!o.doble);
        var meta = $('sim-obj-meta');
        if (meta) {
          if (o.carbono) {
            var mag = (o.mag != null) ? ('mag ≈ ' + String(o.mag).replace('.', ',')) : '';
            meta.innerHTML =
              '<span class="obj-tags">' + BitacoraBase.esc([mag, o.tipo].filter(Boolean).join('  ·  ')) + '</span>' +
              '<span class="obj-color">Estrella de carbono: busca su intenso tono rojo-anaranjado. Se aprecia mejor en la vista «Estrellas de Gaia DR3» (color real).</span>';
            meta.hidden = false;
          } else if (o.doble) {
            var fot = [];
            if (o.mag1 != null) fot.push('A ' + num1(o.mag1));
            if (o.mag2 != null) fot.push('B ' + num1(o.mag2));
            var datos = [o.tipo, (fot.length ? 'mag ' + fot.join(' / ') : ''), (o.sep != null ? 'sep ' + num1(o.sep) + '″' : '')].filter(Boolean).join('  ·  ');
            var r = resolucionDoble(o);
            meta.innerHTML =
              '<span class="obj-tags">' + BitacoraBase.esc(datos) + '</span>' +
              '<span class="obj-cats">' + insigniasDoble(o.catalogos) + '</span>' +
              '<span class="obj-resol ' + r.clase + '">' + BitacoraBase.esc(r.texto) + '</span>';
            meta.hidden = false;
          } else {
            meta.innerHTML = '';
            meta.hidden = true;
          }
        }
      }

      // Cambia el objeto activo: repinta la ficha, recalcula la simulación y
      // precalienta la consulta de Gaia del nuevo objeto en segundo plano.
      function elegirObjeto(o) {
        if (!o) return;
        objetoSel = o;
        pintarObjeto();
        actualizar();
        consultarGaia(sexToDeg(o.ra, true), sexToDeg(o.dec, false)).catch(function () { /* se reintentará al usarse */ });
      }

      /* ══════════════════ MODO "CUALQUIER OBJETO" ══════════════════
         Herramienta de pruebas: apuntar a RA/Dec arbitrarias o buscar por nombre
         en SIMBAD. Va detrás del flag window.BITACORA_OCULAR_LIBRE (apagado por
         defecto): sin él, la 4ª pestaña ni aparece ni se cablea. El objeto libre
         se pinta con carbono:true y doble:false fijos (la clasificación real
         vendrá en el futuro). */
      function pad2(n) { return (n < 10 ? '0' : '') + n; }
      // Grados -> sexagesimal PLANO ("HH MM SS" / "±DD MM SS"), que es lo que
      // consume sexToDeg() (el formato "21h 40m 22s" de formatRA NO vale aquí).
      function degAHms(deg) {
        var h = ((deg % 360) + 360) % 360 / 15, hh = Math.floor(h), m = (h - hh) * 60, mm = Math.floor(m), ss = Math.round((m - mm) * 60);
        if (ss === 60) { ss = 0; mm++; } if (mm === 60) { mm = 0; hh = (hh + 1) % 24; }
        return pad2(hh) + ' ' + pad2(mm) + ' ' + pad2(ss);
      }
      function degADms(deg) {
        var sign = deg < 0 ? '-' : '+', a = Math.abs(deg), dd = Math.floor(a), m = (a - dd) * 60, mm = Math.floor(m), ss = Math.round((m - mm) * 60);
        if (ss === 60) { ss = 0; mm++; } if (mm === 60) { mm = 0; dd++; }
        return sign + pad2(dd) + ' ' + pad2(mm) + ' ' + pad2(ss);
      }
      function libreEstado(txt, cls) { var e = $('sim-libre-estado'); if (e) { e.textContent = txt || ''; e.className = 'sim-libre-estado' + (cls ? ' ' + cls : ''); } }
      // Construye y activa el objeto libre desde los campos RA/Dec.
      function fijarObjetoLibre(nombre, tipo) {
        var raDeg = BitacoraBase.parseRA($('sim-libre-ra').value);
        var decDeg = BitacoraBase.parseDec($('sim-libre-dec').value);
        if (raDeg == null || decDeg == null) { libreEstado('Introduce una RA y una Dec válidas (o busca un nombre en SIMBAD).'); return; }
        var o = { nombre: (nombre || 'Objeto libre'), constelacion: '', ra: degAHms(raDeg), dec: degADms(decDeg), tipo: tipo || '', carbono: false, doble: false };
        libreEstado('✓ ' + o.nombre + '  ·  AR ' + o.ra + '  ·  Dec ' + o.dec, 'ok');
        elegirObjeto(o);
      }
      // Búsqueda por nombre en SIMBAD (reutiliza /coordenadas, solo con sesión).
      var simbadTimer = null, simbadUltimo = '';
      function programarSimbad() {
        var q = $('sim-libre-nombre').value.trim();
        if (simbadTimer) clearTimeout(simbadTimer);
        if (q.length < 2) return;
        simbadTimer = setTimeout(function () { buscarSimbad(q); }, 700);
      }
      // SIMBAD identifica Messier como "M 3" (con espacio); "M3"/"M03"/"Messier 3"
      // no resuelven. Canonicaliza a "M <n>" antes de consultar.
      function normalizarSimbad(q) {
        var m = q.match(/^(?:M|Messier)\s*0*(\d+)$/i);
        return m ? 'M ' + m[1] : q;
      }
      function buscarSimbad(q) {
        if (!WP) { libreEstado('Inicia sesión para buscar por nombre en SIMBAD. Puedes introducir RA/Dec a mano.'); return; }
        q = normalizarSimbad(q);
        if (q === simbadUltimo) return; simbadUltimo = q;
        libreEstado('Buscando «' + q + '» en SIMBAD…');
        var url = WP.endpoint.replace(/observaciones\/?$/, 'coordenadas') + '?q=' + encodeURIComponent(q);
        fetch(url, { credentials: 'same-origin', headers: { 'X-WP-Nonce': WP.nonce } })
          .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
          .then(function (res) {
            if (res.ok && res.data && typeof res.data.ra === 'number') {
              $('sim-libre-ra').value = BitacoraBase.formatRA(res.data.ra);
              $('sim-libre-dec').value = BitacoraBase.formatDec(res.data.dec);
              fijarObjetoLibre(q, res.data.otype || '');
            } else { libreEstado('«' + q + '» no está en SIMBAD. Introduce su RA y Dec a mano.'); }
          })
          .catch(function () { libreEstado('No se pudo consultar SIMBAD. Introduce RA/Dec a mano.'); });
      }
      function montarObjetoLibre() {
        var nom = $('sim-libre-nombre');
        if (nom) nom.addEventListener('input', programarSimbad);
        if (!WP && nom) nom.placeholder = '— Inicia sesión para buscar en SIMBAD —';
        ['sim-libre-ra', 'sim-libre-dec'].forEach(function (id) {
          var el = $(id); if (el) el.addEventListener('change', function () { fijarObjetoLibre($('sim-libre-nombre').value.trim(), ''); });
        });
      }

      // Selector de objeto: pestañas (cúmulos / carbono / dobles [+ libre]) sobre
      // el buscador de catálogo común. Al cambiar de pestaña se limpia el input y
      // se listan los objetos de esa categoría; al elegir uno, se activa.
      function montarSelectorObjeto() {
        var input = $('sim-obj-input');
        if (!input) return;
        var categoria = 'cumulos';
        BitacoraBase.montarBuscadorCatalogo({
          input: input, suggest: $('sim-obj-sugg'),
          fuente: function () { return CATALOGOS_OBJ[categoria] || []; },
          texto: function (o) { return o.nombre; },
          specs: function (o) {
            if (o.carbono) return (o.mag != null ? 'mag ' + String(o.mag).replace('.', ',') : '') || o.abrev || '';
            if (o.doble) return [o.constelacion, (o.sep != null ? o.sep + '″' : '')].filter(Boolean).join('  ·  ');
            return o.constelacion || '';
          },
          max: 40, todosSiVacio: true,
          sinResultados: 'Sin coincidencias en esta lista',
          onElegir: function (o) { input.value = ''; elegirObjeto(o); }
        });
        // 4ª pestaña "Cualquier objeto": solo si el flag de pruebas está activo.
        var libreOn = !!window.BITACORA_OCULAR_LIBRE;
        var tabLibre = $('sim-tab-libre'), panelLibre = $('sim-libre');
        if (tabLibre) tabLibre.hidden = !libreOn;
        if (panelLibre) panelLibre.hidden = true;
        if (libreOn) montarObjetoLibre();
        var objWrap = input.closest ? input.closest('.obj-wrap') : document.querySelector('.obj-wrap');

        var tabs = document.querySelectorAll('.obj-tab');
        tabs.forEach(function (t) {
          t.addEventListener('click', function () {
            categoria = t.getAttribute('data-cat') || 'cumulos';
            tabs.forEach(function (x) {
              var act = (x === t);
              x.classList.toggle('is-activa', act);
              x.setAttribute('aria-selected', act ? 'true' : 'false');
            });
            var esLibre = (categoria === 'libre');
            if (objWrap) objWrap.hidden = esLibre;   // oculta el buscador normal en modo libre
            if (panelLibre) panelLibre.hidden = !esLibre;
            if (!esLibre) { input.value = ''; input.focus(); } // dispara el listado (todosSiVacio)
          });
        });
      }

      /* ══════════════════ EVENTOS ══════════════════ */
      // Selector Bortle enlazado al SQM (widget compartido): elegir clase fija el SQM
      // y dispara 'change' → actualizar.
      if (window.BitacoraBase && $('sim-bortle') && $('sim-sqm')) BitacoraBase.montarCielo($('sim-bortle'), $('sim-sqm'));
      ['sim-pupila-ojo', 'sim-sqm'].forEach(function (id) { $(id).addEventListener('change', actualizar); });
      $('sim-origen').addEventListener('change', actualizar);
      window.addEventListener('resize', function () { actualizar(); });
      montarTeleManual();
      montarSelectorObjeto();
      pintarObjeto();

      /* ══════════════════ ARRANQUE ══════════════════ */
      cargarCatalogo();
      // Precalienta la consulta de Gaia del objeto en segundo plano: cuando el
      // usuario cambie a Canvas 2D (o el overlay la necesite) ya estará en caché.
      consultarGaia(sexToDeg(objetoSel.ra, true), sexToDeg(objetoSel.dec, false)).catch(function () { /* se reintentará al usarse */ });

    } catch (err) {
      console.error('[Bitácora] Error al iniciar el simulador de ocular:', err);
    }
  }
})();
