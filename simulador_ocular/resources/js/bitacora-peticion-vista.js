/* ===========================================================================
 * BITÁCORA · Petición de vista (simulador de oculares)
 * ---------------------------------------------------------------------------
 * Dueño ÚNICO de la frescura de una vista: qué petición es la actual, cuándo
 * una queda superada, qué se aborta entonces, cuánto espera una placa y en qué
 * orden salen las peticiones. bitacora-ocular.js solo pinta lo que devuelve.
 *
 *   var vista = BitacoraPeticionVista.crear();
 *   var p = vista.nueva();            // la anterior queda superada
 *   p.vivo()                          // ¿sigo siendo la vista actual?
 *   p.lanzar({ gaia: fn(p), placas: [url, …] })
 *                                     // Gaia SALE A LA VEZ que las placas
 *   p.gaia(ra, dec, arcmin, mag)      // consulta de Gaia ligada a p
 *   p.placa(url)                      // placa con timeout; null si falla
 *   p.signal                          // para lo que se pasa a vistaGaia
 *   BitacoraPeticionVista.clasificar(err) → 'cancelada' | 'red' | 'codigo'
 *
 * Una petición superada NO aborta sus descargas en el acto: se aplaza un turno
 * del bucle de eventos. La vista nueva suele pedir lo mismo (cambiar de pupila
 * o de SQM no cambia la consulta de Gaia) y, si la vieja abortara primero, esa
 * descarga se tiraría para volver a hacerse; así la nueva se une a la que ya
 * vuela (cuenta de usuarios en BitacoraGaiaRender.unirse) y solo se aborta lo
 * que ya no espera nadie.
 *
 * Va SUBIDO POR FTP a /wp-content/uploads/bitacora/. Incrementa ?v=N al actualizar.
 * =========================================================================== */
(function () {
  'use strict';

  /* Una placa sin respuesta no puede dejar el indicador de carga para siempre.
     Medido en #383: SkyView tarda ~13 s a 3° y el ESO ~25 s a 2°; 60 s, igual
     que el timeout de Gaia (GAIA_FETCH_TIMEOUT), deja margen de sobra. */
  var PLACA_TIMEOUT_MS = 60000;

  function R() {
    var m = window.BitacoraGaiaRender;
    if (!m) throw new Error('BitacoraPeticionVista necesita BitacoraGaiaRender; carga bitacora-gaia-render.js');
    return m;
  }

  /* Qué pasó con un error de una petición. Tres respuestas distintas para el
     que pinta: cancelada (la vista ya no importa: callar), red (caída del
     servicio: avisar y, si hay, usar el respaldo) y código (un bug: consola). */
  function clasificar(err) {
    if (R().esCancelada(err)) return 'cancelada';
    if (R().esFalloRed(err)) return 'red';
    return 'codigo';
  }

  function crear() {
    var actual = null;

    function nueva() {
      var previa = actual;
      var ctrl = new AbortController();
      var p = {
        signal: ctrl.signal,
        vivo: function () { return actual === p; },
        abortar: function () { ctrl.abort(); },
        gaia: function (ra, dec, arcmin, mag) {
          return R().consultar(ra, dec, arcmin, mag, { signal: ctrl.signal });
        },
        placa: function (url) {
          return R().cargarPlaca(url, { signal: ctrl.signal, timeout: PLACA_TIMEOUT_MS });
        },
        /* Gaia primero y las placas a continuación, en el mismo turno: la
           consulta ya no espera a que llegue la placa (13 s en SkyView). La
           promesa de Gaia sale con un `catch` mudo por si la placa tarda más
           que su fallo; quien la consuma recibe igualmente el rechazo. */
        lanzar: function (o) {
          var gaia = o.gaia ? o.gaia(p) : null;
          if (gaia) gaia.catch(function () {});
          return { gaia: gaia, placas: Promise.all((o.placas || []).map(p.placa)) };
        }
      };
      actual = p;
      // ponytail: un turno de espera; si una vista nueva tardase más en unirse
      // a lo que ya vuela, se re-descargaría (el caché la rescata si llegó).
      if (previa) setTimeout(previa.abortar, 0);
      return p;
    }

    return { nueva: nueva };
  }

  window.BitacoraPeticionVista = { crear: crear, clasificar: clasificar, PLACA_TIMEOUT_MS: PLACA_TIMEOUT_MS };
})();
