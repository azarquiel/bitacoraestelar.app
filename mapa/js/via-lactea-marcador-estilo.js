/* ============================================================================
   via-lactea-marcador-estilo.js — LEY DE ATENUACIÓN DE MARCADORES (spec #102)
   Única fuente de la ley  estado → { escala, opacidad }  de los marcadores
   (punto + etiqueta) del mapa. La consumen las tres vistas:
     - galáctica (via-lactea-app.js): fija las variables CSS --mw-aten-*
     - Grupo Local (grupo-local.js): escala/alpha en su bucle de canvas
     - vecindario solar (vecindario-solar.js): ídem
   Estados:
     realzado    : hover o resultado de búsqueda → estilo completo.
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

  var api = { de: de };
  root.VLMarcadorEstilo = api;                                  // navegador
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // Node (test)
})(typeof window !== 'undefined' ? window : globalThis);
