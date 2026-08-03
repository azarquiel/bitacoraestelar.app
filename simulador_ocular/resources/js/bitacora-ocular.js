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
      // Cúmulos abiertos: 3 destacados con nombre propio, más el catálogo general
      // cargado desde cumulos-abiertos-datos.js (window.BITACORA_CUMULOS_ABIERTOS).
      // Cada entrada lleva su marca `carbono:false` para el render de la ficha.
      var CATALOGO_CUMULOS = [
          { id: 'M35',      nombre: 'M35 · Cúmulo abierto (NGC 2168)',   constelacion: 'Gemini',    ra: '06 08 54', dec: '+24 20 00', tipo: 'cúmulo abierto', carbono: false },
          { id: 'M39',      nombre: 'M39 · Cúmulo abierto (NGC 7092)',   constelacion: 'Cygnus',    ra: '21 31 48', dec: '+48 26 55', tipo: 'cúmulo abierto', carbono: false },
          { id: 'NGC 7789', nombre: 'NGC 7789 · Rosa de Carolina',       constelacion: 'Cassiopeia', ra: '23 57 24', dec: '+56 42 56', tipo: 'cúmulo abierto', carbono: false }
      ].concat((window.BITACORA_CUMULOS_ABIERTOS || []).map(function (e) {
        return {
          id: e[0], nombre: e[0] + ' · Cúmulo abierto', constelacion: e[1],
          ra: degAHms(e[2]), dec: degADms(e[3]), mag: e[4],
          tipo: 'cúmulo abierto', carbono: false
        };
      }));
      // Estrellas de carbono: catálogo de la Astronomical League, cargado desde el
      // módulo estrellas-carbono-datos.js (window.BITACORA_CARBONO). Se marca
      // `carbono:true` para que la ficha resalte su color rojo-anaranjado.
      var CATALOGO_CARBONO = (window.BITACORA_CARBONO || []).map(function (e) {
        return {
          id: e.id, nombre: e.nombre, constelacion: e.constelacion, abrev: e.abrev,
          ra: e.ra, dec: e.dec, mag: e.mag, tipo: e.tipo, carbono: true
        };
      });
      // Estrellas dobles: catálogo unificado (AL + Cambridge + RASC + WDS), cargado
      // desde estrellas-dobles-datos.js (window.BITACORA_DOBLES). Se marca `doble:true`
      // para que la ficha muestre Mag1/Mag2/Sep, las insignias de catálogo y el veredicto
      // de resolución (Dawes + aumento). Las posiciones las sigue mandando Gaia; el
      // ángulo de posición y los tipos espectrales solo se usan para completar las
      // componentes que Gaia no trae (ver BitacoraGaiaRender.parDoble).
      var CATALOGO_DOBLES = (window.BITACORA_DOBLES || []).map(function (e) {
        return {
          id: e.id, nombre: e.nombre, constelacion: e.constelacion, abrev: e.abrev,
          ra: e.ra, dec: e.dec, tipo: e.tipo,
          mag1: e.mag1, mag2: e.mag2, sep: e.sep, pa: e.pa,
          spect1: e.spect1, spect2: e.spect2,
          catalogos: e.catalogos, aliases: e.aliases,
          doble: true
        };
      });
      // Cúmulos globulares: catálogo de Harris (1996, rev. 2010), cargado desde
      // globulares-datos.js (window.BITACORA_GLOBULARES). r_h del catálogo es
      // radio de MEDIA LUZ, no de marea: r_tidal sale de r_c·10^c (ver
      // BitacoraGaiaRender.haloGlobular).
      var CATALOGO_GLOBULARES = (window.BITACORA_GLOBULARES || []).map(function (e) {
        var rc = e[4], c = e[6];
        return {
          id: e[0],
          nombre: e[1] ? (e[1] + ' · Cúmulo globular (' + e[0] + ')') : (e[0] + ' · Cúmulo globular'),
          constelacion: '', ra: degAHms(e[2]), dec: degADms(e[3]),
          tipo: 'cúmulo globular', carbono: false, doble: false, globular: true,
          rCore: rc, rTidal: rc * Math.pow(10, c), muV0: e[7]
        };
      });
      // Códigos de catálogo -> nombre largo (fuente: mapa/datos/catalogos_dobles.csv).
      var CAT_DOBLES_NOMBRE = {
        AL:   'Double Star Club (Astronomical League)',
        CDSA: 'Cambridge Double Star Atlas',
        RASC: 'Royal Astronomical Society of Canada Double Star Program',
        WDS:  'Washington Double Star Catalog (WDS 2024.08)'
      };

      // Categorías del selector de objeto. La clave coincide con data-cat del HTML.
      var CATALOGOS_OBJ = { cumulos: CATALOGO_CUMULOS, carbono: CATALOGO_CARBONO, dobles: CATALOGO_DOBLES, globulares: CATALOGO_GLOBULARES };
      var objetoSel = CATALOGO_CUMULOS[0];   // M35 por defecto

      var TELE_EJEMPLO = [{ id: '_t200', vendor: '', modelo: 'Newton 200/1200 (ejemplo)', optica: 'Newtonian', apertura_mm: 200, focal_mm: 1200 }];
      var OCULARES_EJEMPLO = [
        { id: '_o31', vendor: '', modelo: '31 mm (ejemplo)',   focal_mm: 31,   campo_aparente: 82 },
        { id: '_o18', vendor: '', modelo: '17,5 mm (ejemplo)', focal_mm: 17.5, campo_aparente: 95 },
        { id: '_o9',  vendor: '', modelo: '9 mm (ejemplo)',    focal_mm: 9,    campo_aparente: 100 },
        { id: '_o5',  vendor: '', modelo: '5 mm (ejemplo)',    focal_mm: 5,    campo_aparente: 60 }
      ];

      var DSS_MAX_ARCMIN = 120;
      // Tope del Canvas-2D de Gaia: 6° de lado. No lo fija ningún servidor de
      // placas, sino el radio de consulta del módulo compartido; cubre oculares de
      // campo ancho y binoculares.
      var GAIA_MAX_ARCMIN = 360;
      var AFOV_REF = 110;
      /* Lado del lienzo en píxeles, RECALCULADO en cada render (ver tamRender):
         el hueco donde se enseña mide una cosa en la página y otra a pantalla
         completa. Techos distintos porque el coste no es el mismo: el Canvas-2D
         de Gaia solo gasta CPU —el catálogo ya está en cacheGaia, la red no
         entra—, mientras que PanSTARRS pide al servidor width×height píxeles y
         el DSS no da para más (dss-proxy.php sirve 1200 px como mucho). */
      var PROC = 720;
      var PROC_MAX_GAIA = 1440;
      var PROC_MAX_PLACA = 1200;
      function tamRender(origen) {
        var vista = $('sim-vista');
        return BitacoraGaiaRender.tamLienzo(vista ? vista.clientWidth : 0, window.devicePixelRatio,
          origen === 'canvas-2d' ? PROC_MAX_GAIA : PROC_MAX_PLACA);
      }

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

      // Transmisión y araña por tipo óptico (columna "Optics" del catálogo): las
      // dos tablas viven en el módulo compartido BitacoraGaiaRender, que ya las
      // necesita para pintar los spikes. Antes estaban copiadas aquí y había que
      // sincronizarlas a mano al añadir un tipo de tubo.
      // ¿El telescopio seleccionado tiene araña? (manual: campo 'arana'; catálogo: por su óptica)
      function teleTieneArana() {
        if (!teleSel) return false;
        if (typeof teleSel.arana === 'boolean') return teleSel.arana;
        return window.BitacoraGaiaRender.opticaTieneArana(teleSel.optica);
      }

      /* El render de Gaia (ajustes, sprites, consulta y dibujo) vive en el módulo
         compartido BitacoraGaiaRender (bitacora-gaia-render.js), fuente única con el
         formulario de registro. Su config editable es BitacoraGaiaRender.config. */
      var GAIA_CFG = window.BitacoraGaiaRender.config;

      var CFG = window.BITACORA_OCULAR || {};
      var DSS_BASE = CFG.dssProxy || '/wp-content/uploads/bitacora/dss-proxy.php';

      /* ══════════════════ ESTADO ══════════════════ */
      var WP = window.BITACORA_WP || null;
      /* ¿Hay sesión iniciada? El plugin solo inyecta BITACORA_WP (con su nonce)
         para usuarios logueados, así que es la señal de sesión de la página. De
         ella dependen las dos opciones reservadas del simulador: apuntar a
         "Cualquier objeto" y elegir el telescopio de "Mi flota". Ninguna de las
         dos es un control de acceso —el endpoint de equipo personal ya exige
         login en el servidor—: aquí solo se decide qué se ofrece. */
      function haySesion() { return !!(WP && WP.nonce); }
      var catalogo = { telescopios: [], oculares: [], auxiliares: [] };
      var hayFlota = false;   // el observador tiene telescopios propios en Mi flota
      var teleSel = null;
      var ocularSel = null;
      var auxSel = null;   // óptica auxiliar activa (Barlow/reductor); null = ninguna

      var corsFallo = false;
      var contadorPeticion = 0;

      /* Las curvas de la fotometría (BitacoraGaiaRender.fot) ya no se leen desde
         aquí: la última regla que las usaba —luma de la placa → flujo— se fue con
         la cadena al módulo compartido. */

      /* ══════════════════ CATÁLOGO DE EQUIPO ══════════════════ */
      function num(v) { if (v == null || v === '') return null; var n = parseFloat(v); return isNaN(n) ? null : n; }
      function nombrePieza(p) { return ((p.vendor ? p.vendor + ' ' : '') + (p.modelo || p.nombre || '')).trim() || '(sin nombre)'; }
      // Rótulo del telescopio: su nombre propio de Mi flota si lo tiene (helper
      // compartido con la flota), o "vendor modelo" en su defecto.
      function nombreTele(p) { return BitacoraEquipo.nombreTelescopio(p) || '(sin nombre)'; }
      function itemPorId(cat, id) { var arr = catalogo[cat] || []; for (var i = 0; i < arr.length; i++) { if (String(arr[i].id) === String(id)) return arr[i]; } return null; }
      // Características del telescopio: apertura y focal. Las piezas de Mi flota
      // se etiquetan como tales, que si no un nombre propio ("El de viaje") no
      // dice de dónde sale.
      function specsTele(p) { var s = []; if (p.esFlota) s.push('Mi flota'); if (num(p.apertura_mm) != null) s.push(num(p.apertura_mm) + ' mm'); if (num(p.focal_mm) != null) s.push('f=' + num(p.focal_mm) + ' mm'); return s.join(' · '); }
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
      /* Equipo PERSONAL del observador ("Mi flota"), SOLO con sesión: el endpoint
         /equipo exige login (y el nonce), así que sin sesión no se pide siquiera.
         Un fallo aquí no es grave —se sigue con el catálogo global—, por eso
         devuelve null en vez de propagar el error. */
      function cargarFlota() {
        if (!haySesion() || !WP.endpoint) return Promise.resolve(null);
        var API = WP.endpoint.replace(/observaciones\/?$/, 'equipo');
        return fetch(API, { credentials: 'same-origin', headers: { 'X-WP-Nonce': WP.nonce } })
          .then(function (r) { return r.ok ? r.json() : null; })
          .catch(function () { return null; });
      }

      function cargarCatalogo() {
        var API = urlCatalogo();
        var headers = (WP && WP.nonce) ? { 'X-WP-Nonce': WP.nonce } : {};
        Promise.all([
          fetch(API, { credentials: 'same-origin', headers: headers })
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; }),
          cargarFlota()
        ])
          .then(function (res) {
            var d = res[0], flota = res[1];
            if (!d || (!(d.telescopios || []).length && !(d.oculares || []).length)) { usarEjemplo('No se pudo leer el catálogo de equipo. Se usa un equipo de ejemplo.'); return; }
            // Telescopios: los de Mi flota delante del catálogo global (helper
            // compartido con la flota). Oculares y auxiliares siguen saliendo del
            // catálogo global tal cual.
            var mios = (flota && flota.telescopios) || [];
            hayFlota = mios.length > 0;
            catalogo = {
              telescopios: BitacoraEquipo.flotaPrimero(mios, d.telescopios || []),
              oculares: d.oculares || [], auxiliares: d.auxiliares || []
            };
            var hint = $('sim-eq-hint');
            if (hint) {
              hint.textContent = hayFlota
                ? 'Tus telescopios de Mi flota salen los primeros de la lista; detrás, el catálogo de equipo.'
                : 'Telescopio y ocular elegidos del catálogo de equipo.';
            }
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
          // Con flota propia, al enfocar se listan ya sus telescopios (van los
          // primeros): un nombre propio como "El de viaje" no se encuentra
          // tecleando la marca, así que hay que poder verlos sin buscar. Sin
          // flota no se lista nada: el catálogo global es enorme y las 12
          // primeras entradas no le sirven a nadie.
          todosSiVacio: hayFlota,
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
      // Transmisión del tubo, por orden de preferencia: la fijada a mano
      // (teleSel.transmision, telescopio manual con tipo elegido), luego la
      // deducida del tipo óptico del catálogo (teleSel.optica), y si no, el valor
      // medio por defecto. Fuente única: la usan la magnitud límite y el fondo.
      function transmisionEfectiva() {
        var t = TRANSMISION_TELE;
        if (teleSel) {
          if (num(teleSel.transmision) > 0) { t = num(teleSel.transmision); }
          else { var tOpt = window.BitacoraGaiaRender.transmisionOptica(teleSel.optica); if (tOpt) { t = tOpt; } }
        }
        return t;
      }


      /* Estado de cielo + óptica que espera el módulo compartido. Único punto de
         este fichero que lee el DOM para la fotometría; de aquí para dentro todo
         es parámetro. */
      function cieloOptica(pupila) {
        return {
          pupilaSalida: pupila, pupilaOjo: pupilaOjo(),
          sqm: parseFloat($('sim-sqm').value) || 21, transmision: transmisionEfectiva(),
          aumentos: datosOcular().aumentos
        };
      }
      // Delegada en el módulo compartido (incluye el recorte de apertura efectiva).
      function magLimiteTelescopio() {
        return BitacoraGaiaRender.magLimite({
          apertura: teleApertura(), aumentos: datosOcular().aumentos,
          transmision: transmisionEfectiva(), sqm: parseFloat($('sim-sqm').value) || 21,
          pupilaOjo: pupilaOjo()
        });
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

        var origen = $('sim-origen').value;
        PROC = tamRender(origen);

        /* Recorte del cielo: lado = campo real, limitado por el origen. El tope de
           2° es de las PLACAS (el servidor del DSS no sirve más); el Canvas-2D de
           Gaia es un catálogo y llega mucho más lejos, así que no tiene por qué
           heredarlo. */
        var maxArcmin = (origen === 'canvas-2d') ? GAIA_MAX_ARCMIN : DSS_MAX_ARCMIN;
        var arcmin = d.campoReal * 60;
        if (arcmin > maxArcmin) {
          aviso.textContent = 'El campo real (' + (arcmin / 60).toFixed(2) + '°) supera el máximo de este origen (' +
            (maxArcmin / 60).toFixed(0) + '°): la imagen se recorta.';
          arcmin = maxArcmin;
        } else {
          aviso.textContent = '';
        }
        if (d.pupila > pOjo && !aviso.textContent) {
          aviso.textContent = 'Pupila de salida (' + d.pupila.toFixed(1) + ' mm) mayor que la del ojo (' + pOjo + ' mm): parte de la luz se desperdicia.';
        }
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
      /* `fuente` por defecto SkyView, que sirve las placas con el norte arriba.
         Si SkyView no responde se reintenta UNA vez con el archivo del ESO: es
         la misma placa, girada respecto al norte (ver README, "Orientación del
         campo"), pero antes eso que un círculo negro. Se avisa, porque el campo
         girado no casa con la superposición de Gaia. */
      function renderDSS(arcmin, peticion, fuente) {
        fuente = fuente || 'skyview';
        // Techo de placa aunque se llegue aquí de respaldo desde Gaia, que tiene
        // el suyo más alto: ampliar una placa de 1059 px cuesta CPU y no añade
        // detalle.
        PROC = tamRender('dss');
        var cargando = $('sim-cargando');
        var ra = objetoSel.ra, dec = objetoSel.dec;
        var urlProfunda = urlPlaca('DSS2-red', ra, dec, arcmin, fuente);
        var urlCorta    = urlPlaca('DSS1', ra, dec, arcmin, fuente);
        Promise.all([cargarPlaca(urlProfunda), cargarPlaca(urlCorta)])
          .then(function (res) {
            var profunda = res[0], corta = res[1];
            if (peticion !== contadorPeticion) return;
            if (!profunda && !corta) {
              if (fuente === 'skyview') {
                cargando.textContent = 'SkyView no responde: probando con el archivo del ESO…';
                $('sim-aviso').textContent = 'SkyView no responde: se muestra la placa del archivo del ESO, que llega ligeramente girada respecto al norte.';
                renderDSS(arcmin, peticion, 'eso');
                return;
              }
              cargando.textContent = 'No se pudo cargar la placa del DSS. ¿Está dss-proxy.php accesible?';
              return;
            }
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
        return BitacoraGaiaRender.nivelFondo(cieloOptica(pupila));
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
        // Consulta aparte, a profundidad y radio FIJOS (el del cúmulo, no el
        // campo actual), para la resta de P4: cuánta luz ya está en estrellas
        // catalogadas es del cúmulo, no de con qué telescopio se mira esta
        // noche -si dependiera de la consulta principal (que sí varía con el
        // equipo), cambiar de telescopio podía apagar el halo de golpe-. Si
        // falla, sigue sin halo en vez de tirar todo el render a DSS.
        var haloQuery = objetoSel.globular
          ? BitacoraGaiaRender.consultar(ra0, dec0, Math.max(objetoSel.rTidal * 2.2, 10),
              BitacoraGaiaRender.config.globular.magResta).catch(function () { return []; })
          : Promise.resolve([]);
        Promise.all([consultarGaia(ra0, dec0, arcmin), haloQuery]).then(function (res) {
          var estrellas = res[0], estrellasHalo = res[1];
          if (peticion !== contadorPeticion) return;
          cargando.style.display = 'none';
          /* Si el TOP de la consulta se agotó antes de llegar a la magnitud límite
             del equipo, faltan estrellas que SÍ se verían. Pasa en campos ricos y
             muy anchos. Se avisa en vez de mostrar un campo pobre sin explicación. */
          var mcorte = -Infinity;
          for (var e = 0; e < estrellas.length; e++) if (estrellas[e][2] > mcorte) mcorte = estrellas[e][2];
          if (mlim != null && isFinite(mcorte) && mcorte < mlim - 0.1) {
            $('sim-aviso').textContent = 'Campo muy rico: el catálogo se agotó en magnitud ' + mcorte.toFixed(1) +
              ', por debajo de la límite de tu equipo (' + mlim.toFixed(1) + '). Faltan las más débiles; reduce el campo para verlas.';
          }
          // Fondo plano de cielo: sin capas difusas, las estrellas se dibujan
          // sobre el nivel de cielo tal cual (sin componente difusa que sumar).
          var difuso = new Float32Array(PROC * PROC);
          /* Si el objeto es una doble, se completan del catálogo las componentes
             que Gaia no trae (satura con las primarias muy brillantes: la de
             Almaak no está en DR3). Solo para el dibujo de estrellas: las capas
             difusas siguen con la muestra tal cual, que es de donde sale su
             función de luminosidad. */
          var estrellasDibujo = objetoSel.doble
            ? BitacoraGaiaRender.parDoble(estrellas, {
                ra: ra0, dec: dec0, sep: objetoSel.sep,
                mag1: objetoSel.mag1, mag2: objetoSel.mag2,
                pa: objetoSel.pa, spect1: objetoSel.spect1, spect2: objetoSel.spect2
              })
            : estrellas;
          // Halo no resuelto del cúmulo globular (perfil de King): se suma al
          // fondo difuso y amortigua la aureola/blur de las estrellas que caen
          // dentro (ver perfilKing/haloGlobular en bitacora-gaia-render.js).
          // Solo en canvas-2d: la superposición de Gaia sobre DSS no lo lleva.
          var halo = objetoSel.globular
            ? BitacoraGaiaRender.haloGlobular(
                { rc: objetoSel.rCore, rt: objetoSel.rTidal, muV0: objetoSel.muV0 },
                estrellasHalo, ra0, dec0, datosOcular().aumentos)
            : null;
          if (halo) BitacoraGaiaRender.pintarHaloGlobular(difuso, halo, { ra0: ra0, dec0: dec0, arcmin: arcmin, size: PROC });
          var capaEst = BitacoraGaiaRender.capaEstrellas(estrellasDibujo, {
            ra: ra0, dec: dec0, arcmin: arcmin, mlim: mlim, afov: datosOcular().afov,
            apertura: teleApertura(),   // fija el disco de Airy (va como 1/D)
            // Solo si el objeto es una doble: el suelo de visibilidad de SUS dos
            // componentes se recorta con el aumento para no comerse el hueco ya
            // resuelto (ver radioEstrella en bitacora-gaia-render.js). Sin esto,
            // sep queda undefined y el suelo se comporta igual que en cualquier
            // otro campo.
            sep: objetoSel.doble ? objetoSel.sep : null,
            conGlow: true, carbono: !!objetoSel.carbono,
            carbonoMag: objetoSel.carbono ? objetoSel.mag : null, arana: teleTieneArana(),
            globular: halo
          }, PROC);
          var cieloGaia = cieloOptica(datosOcular().pupila);
          cieloGaia.perceptual = true;   // flujo calibrado, no la luma de una placa
          BitacoraGaiaRender.pintarFot(difuso, ctx, cieloGaia, capaEst);
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
      // `fuente` elige de dónde saca el proxy la MISMA placa: 'eso' (tal cual) o
      // 'skyview' (remuestreada con el norte arriba). El proxy la valida.
      // La URL la arma el módulo compartido (fuente única con el formulario de
      // registro, que también pide placas); aquí solo se le pasa la base del proxy.
      function urlPlaca(survey, ra, dec, arcmin, fuente) {
        return BitacoraGaiaRender.urlPlaca({ base: DSS_BASE, survey: survey, ra: ra, dec: dec, arcmin: arcmin, fuente: fuente || 'eso' });
      }
      function sexToDeg(s, esRA) { var sig = /^\s*-/.test(s) ? -1 : 1; var p = s.trim().replace(/[+\-]/g, '').replace(/:/g, ' ').split(/\s+/).map(Number); var abs = (p[0] || 0) + (p[1] || 0) / 60 + (p[2] || 0) / 3600; return sig * abs * (esRA ? 15 : 1); }
      function urlHips(ra, dec, arcmin) { return 'https://alasky.cds.unistra.fr/hips-image-services/hips2fits?hips=' + encodeURIComponent('CDS/P/PanSTARRS/DR1/color-z-zg-g') + '&ra=' + sexToDeg(ra, true).toFixed(5) + '&dec=' + sexToDeg(dec, false).toFixed(5) + '&fov=' + (arcmin / 60).toFixed(4) + '&width=' + PROC + '&height=' + PROC + '&projection=TAN&format=jpg'; }
      function cargarPlaca(url) { return new Promise(function (res) { var im = new Image(); im.crossOrigin = 'anonymous'; im.onload = function () { res(im); }; im.onerror = function () { res(null); }; im.src = url; }); }

      function lumas(imagen) {
        var c = document.createElement('canvas'); c.width = c.height = PROC; var ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(imagen, 0, 0, PROC, PROC); var dd;
        try { dd = ctx.getImageData(0, 0, PROC, PROC).data; } catch (e) { return null; }
        var v = new Float32Array(PROC * PROC); for (var i = 0, j = 0; j < v.length; i += 4, j++) v[j] = (dd[i] + dd[i + 1] + dd[i + 2]) / 3; return v;
      }

      /* La cadena de la placa (fusión HDR, reparación de núcleos y luma → flujo)
         vive en el módulo compartido y tiene su test en scripts/test_placa.js.
         Aquí queda lo que de verdad es del simulador: leer los píxeles del DOM. */

      /* Pinta el lienzo a partir de un array de FLUJO DE OBJETO por píxel. La
         cadena (contraste sobre el cielo + adaptación local) vive en el módulo
         compartido; aquí solo se dimensiona el lienzo y se lee el DOM.
         El término de pupila lo aplica ctxFotometrico allí dentro: este Fobj NO
         debe traerlo ya aplicado o se contaría dos veces. */
      function pintarFot(Fobj, canvas, p) {
        canvas.width = canvas.height = PROC;
        return BitacoraGaiaRender.pintarFot(Fobj, canvas.getContext('2d'), cieloOptica(p));
      }

      function procesarFotometrico(profunda, corta, canvas, p) {
        var vd = lumas(profunda); if (!vd) return false;
        var v = vd;
        if (corta) { var vs = lumas(corta); if (vs) v = BitacoraGaiaRender.fusionarPlacas(vd, vs); }
        var esHips = $('sim-origen').value === 'hips';
        if (esHips) v = BitacoraGaiaRender.repararNucleos(v, PROC);
        return pintarFot(BitacoraGaiaRender.flujoDePlaca(v, esHips), canvas, p);
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
        var mag = BitacoraGaiaRender.magConsultaGaia(teleApertura(), transmisionEfectiva());
        return BitacoraGaiaRender.consultar(ra0, dec0, arcmin, mag);
      }
      function dibujarGaia(ctx, estrellas, ra0, dec0, arcmin, mlim, conGlow, objetoCarbono) {
        BitacoraGaiaRender.dibujar(ctx, estrellas, {
          ra: ra0, dec: dec0, arcmin: arcmin, mlim: mlim, afov: datosOcular().afov,
          apertura: teleApertura(),
          conGlow: conGlow, carbono: objetoCarbono,
          carbonoMag: objetoCarbono ? objetoSel.mag : null, arana: teleTieneArana()
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

      /* ══════════════════ ACCIONES SOBRE LA IMAGEN DEL OCULAR ══════════════════
         Ver a pantalla completa y descargar lo que se está viendo. Para TODOS,
         con o sin sesión: no tocan datos del observador, solo la imagen que la
         página ya ha pintado. */

      // Nombre del archivo descargado: objeto, aumentos y origen, sin acentos ni
      // caracteres que incomoden al sistema de ficheros.
      function nombreArchivo() {
        var nombre = (objetoSel && objetoSel.nombre ? objetoSel.nombre : 'objeto').split('·')[0];
        var partes = ['ocular', nombre];
        if (teleSel && ocularSel && teleFocal() && num(ocularSel.focal_mm)) {
          partes.push(datosOcular().aumentos.toFixed(0) + 'x');
        }
        partes.push($('sim-origen').value);
        return partes.join('-')
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
      }

      /* Copia del lienzo con el MISMO recorte circular que el CSS aplica a la
         vista: lo que se descarga es lo que se ve por el ocular, no el cuadrado
         completo con sus esquinas (que en la página no se ven). */
      function recorteCircular(fuente) {
        var lado = fuente.width;
        var c = document.createElement('canvas');
        c.width = c.height = lado;
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, lado, lado);
        ctx.save();
        ctx.beginPath();
        ctx.arc(lado / 2, lado / 2, lado / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(fuente, 0, 0);
        ctx.restore();
        return c;
      }

      function descargarVista() {
        var canvas = $('sim-lienzo'), img = $('sim-img');
        // 'block' EXPLÍCITO, no "distinto de none": el lienzo nace oculto desde el
        // CSS con el style en línea vacío, así que antes del primer render bajaría
        // un PNG negro de 300 px.
        if (canvas.style.display === 'block') {
          try {
            // toBlob revienta (SecurityError) si el lienzo quedó contaminado por
            // una placa servida sin CORS: en ese caso se cae a la imagen suelta.
            recorteCircular(canvas).toBlob(function (blob) {
              if (!blob) return;
              var url = URL.createObjectURL(blob);
              var a = document.createElement('a');
              a.href = url; a.download = nombreArchivo() + '.png';
              document.body.appendChild(a);
              a.click();
              a.remove();
              setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
            });
            return;
          } catch (e) {
            $('sim-aviso').textContent = 'El navegador no deja exportar el lienzo (CORS): se abre la placa en una pestaña nueva.';
          }
        }
        // Modo de reserva (sin lienzo): la placa tal cual, en otra pestaña. El
        // atributo download no sirve con una imagen de otro dominio.
        if (img.src) window.open(img.src, '_blank', 'noopener');
      }

      /* Pantalla completa sobre la ZONA (círculo + botones), no solo sobre el
         círculo: así los dos botones siguen a mano dentro de la pantalla
         completa. El tamaño lo pone el CSS con la clase .es-completa —no un
         :fullscreen a pelo— para no tener que duplicar cada regla con el
         prefijo -webkit- de Safari. */
      function montarAccionesVista() {
        var zona = $('sim-zona'), btnFull = $('sim-pantalla-completa'), btnDesc = $('sim-descargar');
        if (btnDesc) btnDesc.addEventListener('click', descargarVista);
        if (!zona || !btnFull) return;
        var pedir = zona.requestFullscreen || zona.webkitRequestFullscreen;
        if (!pedir) { btnFull.hidden = true; return; }   // iPhone: sin API de pantalla completa
        btnFull.addEventListener('click', function () {
          var actual = document.fullscreenElement || document.webkitFullscreenElement;
          if (actual) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
          else {
            // Devuelve promesa (salvo en el webkit viejo); si el navegador la
            // deniega no hay nada que hacer, pero sí que tragarse el rechazo.
            var p = pedir.call(zona);
            if (p && p.catch) p.catch(function () {});
          }
        });
        ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (ev) {
          document.addEventListener(ev, function () {
            var dentro = (document.fullscreenElement || document.webkitFullscreenElement) === zona;
            zona.classList.toggle('es-completa', dentro);
            var txt = dentro ? 'Salir de pantalla completa' : 'Ver a pantalla completa';
            btnFull.title = txt;
            btnFull.setAttribute('aria-label', txt);
            /* El círculo cambia de tamaño, así que el lienzo de 720 se vería
               ampliado: se vuelve a dibujar al tamaño nuevo. Solo si de verdad
               cambia —si ya estaba en su techo, ampliar la ventana no obliga a
               repetir el render, que no es gratis—. La clase ya está puesta
               arriba, así que clientWidth mide el hueco DEFINITIVO. */
            if (tamRender($('sim-origen').value) !== $('sim-lienzo').width) actualizar();
          });
        });
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
        box.querySelector('.obj-coord').textContent = 'AR ' + o.ra + '  ·  Dec ' + o.dec + (o.constelacion ? '  ·  ' + o.constelacion : '') + ' (J2000)';
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
         Apuntar a RA/Dec arbitrarias o buscar por nombre en SIMBAD. Reservado a
         usuarios CON SESIÓN (ver haySesion): es la única forma de apuntar a una
         galaxia o a una nebulosa, que se pintan como capa por campo y no tienen
         pestaña propia en el selector. Sin sesión, la página pública se queda con
         los cuatro catálogos cerrados. Para ocultarlo también a quien tiene
         sesión, window.BITACORA_OCULAR_LIBRE = false.
         El objeto libre se pinta con carbono:true y doble:false fijos (la
         clasificación real vendrá en el futuro). */
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
      /* Búsqueda por nombre: el ciclo (espera, deduplicado y consulta a Sesame)
         vive en BitacoraBase.resolutorNombre, compartido con el formulario de
         registro. Aquí solo quedan los textos y dónde se escribe el resultado.
         Buscar un nombre SÍ pisa lo que hubiera en las cajas de RA/Dec: es lo que
         se está pidiendo al escribirlo. */
      var resolutor = BitacoraBase.resolutorNombre({
        onResuelto: function (d) {
          $('sim-libre-ra').value = BitacoraBase.formatRA(d.ra);
          $('sim-libre-dec').value = BitacoraBase.formatDec(d.dec);
          fijarObjetoLibre(d.q, d.otype);
        },
        onEstado: function (estado, q) {
          if (estado === 'buscando') { libreEstado('Buscando «' + q + '» en SIMBAD…'); }
          else if (estado === 'nada') { libreEstado('«' + q + '» no está en SIMBAD. Introduce su RA y Dec a mano.'); }
          else { libreEstado('No se pudo consultar SIMBAD. Introduce RA/Dec a mano.'); }
        }
      });
      function montarObjetoLibre() {
        var nom = $('sim-libre-nombre');
        if (nom) nom.addEventListener('input', function () { resolutor.programar(nom.value); });
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
            if (o.globular) return 'μV₀ ' + o.muV0.toFixed(1) + '  ·  r_t ' + o.rTidal.toFixed(0) + '′';
            return [o.constelacion, (o.mag != null ? 'mag ' + String(o.mag).replace('.', ',') : '')].filter(Boolean).join('  ·  ');
          },
          max: 40, todosSiVacio: true,
          sinResultados: 'Sin coincidencias en esta lista',
          onElegir: function (o) { input.value = ''; elegirObjeto(o); }
        });
        // Pestaña "Cualquier objeto": SOLO con sesión iniciada. Sigue pudiendo
        // apagarse a mano (window.BITACORA_OCULAR_LIBRE = false) también para
        // quien la tiene.
        var libreOn = (window.BITACORA_OCULAR_LIBRE !== false) && haySesion();
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
      montarAccionesVista();
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
