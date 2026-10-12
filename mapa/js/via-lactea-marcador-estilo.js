/* ============================================================================
   via-lactea-marcador-estilo.js — LEY DE ATENUACIÓN DE MARCADORES (spec #102)
   Única fuente de la ley  estado → { escala, opacidad }  de los marcadores
   (punto + etiqueta) del mapa. La consumen las tres vistas:
     - galáctica (via-lactea-app.js): fija las variables CSS --mw-aten-*
     - Grupo Local (grupo-local.js): escala/alpha en su bucle de canvas
     - vecindario solar (vecindario-solar.js): ídem
   Estados:
     realzado    : hover, resultado de búsqueda u objeto centrado → estilo completo.
     viajeActivo : recorriendo un viaje interestelar → sin atenuación (son
                   pocos objetos y la ruta manda).
     (resto)     : estado base atenuado, según CONFIG.marcadores.
   Pura, sin DOM: se testea en Node (scripts/test_marcador_estilo.js).
   ============================================================================ */
(function (root) {
  'use strict';

  // Respaldo si no llega CONFIG.marcadores (mismos valores que via-lactea-config.js).
  var ATEN = { escala: 0.82, opacidad: 0.55 };

  // estado: { realzado, viajeActivo } · cfg: CONFIG.marcadores
  function de(estado, cfg) {
    estado = estado || {};
    if (estado.viajeActivo || estado.realzado) return { escala: 1, opacidad: 1 };
    cfg = cfg || {};
    return {
      escala:   (cfg.atenuacionEscala   != null) ? cfg.atenuacionEscala   : ATEN.escala,
      opacidad: (cfg.atenuacionOpacidad != null) ? cfg.atenuacionOpacidad : ATEN.opacidad
    };
  }

  // Opacidad base del PUNTO de los marcadores en las tres vistas (galaxia por
  // CSS --mw-aten-op; vecindario solar y Grupo Local por canvas): tenue en
  // reposo, entera si está realzado (hover, seleccionado o centrado) o hay
  // viaje. Es independiente de de(), que atenúa la ETIQUETA de la galaxia.
  var ATEN_CANVAS = 0.72;
  function canvas(estado, cfg) {
    estado = estado || {};
    if (estado.viajeActivo || estado.realzado) return 1;
    return (cfg && cfg.atenuacionCanvas != null) ? cfg.atenuacionCanvas : ATEN_CANVAS;
  }

  // ¿Se dibuja la etiqueta? Regla única de las tres vistas: nunca sola; solo con
  // el cursor encima, un objeto realzado (buscado o centrado) o un viaje activo.
  function etiquetaVisible(estado) {
    estado = estado || {};
    return !!(estado.realzado || estado.viajeActivo);
  }

  var api = { de: de, canvas: canvas, etiquetaVisible: etiquetaVisible };
  root.VLMarcadorEstilo = api;                                  // navegador
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // Node (test)
})(typeof window !== 'undefined' ? window : globalThis);
