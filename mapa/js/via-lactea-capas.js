/* ============================================================================
   via-lactea-capas.js — QUÉ ESCALA MANDA y qué controles son suyos
   Proyecto: mapa interactivo de la Vía Láctea (Gaia)

   El visor tiene tres escalas encadenadas por fundidos: el atlas del Grupo
   Local (al alejar), la Vía Láctea y el vecindario solar (al acercar sobre el
   Sol). Cada una enseña lo suyo y no repite a la vecina; este módulo pone esa
   idea en los CONTROLES: el cambio cenital/canto y los mandos de giro son de la
   vista de la Vía Láctea (giran SU imagen), así que en las otras dos escalas no
   pintan nada y se esconden.

   Puro: entra el estado del fundido, sale la decisión. No toca el DOM; quien
   aplica el display es via-lactea-app.js.

   Se carga ANTES de via-lactea-app.js y expone window.VLCapas (+ module.exports
   para scripts/test_capas_controles.js).

   Interfaz (window.VLCapas):
     capaActiva(alphaAtlas, alphaVecindario) -> 'galaxia' | 'grupoLocal' | 'vecindario'
     controlesVisibles(capa, canto, giros)   -> { abatimiento, giroCanto,
                                                  giroPlano, leyendaObjetos,
                                                  leyendaHubble, leyendaEspectral }
   ============================================================================ */

(function () {
  'use strict';

  // Una capa "manda" cuando su fundido pasa de la mitad: es el mismo umbral con
  // el que la app le pasa los clics y apaga los marcadores de la galaxia.
  var DOMINA = 0.5;

  function capaActiva(alphaAtlas, alphaVecindario) {
    if (alphaVecindario > DOMINA) return 'vecindario';
    if (alphaAtlas > DOMINA) return 'grupoLocal';
    return 'galaxia';
  }

  // Controles de la vista de la Vía Láctea. El abatimiento manda en las dos
  // vistas (0° cenital, 90° de canto), así que no hay botón de cambio de vista
  // ni giro en plano que lo imite: los dos giros de canto siguen bajo su
  // interruptor de CONFIG.giros. Fuera de la galaxia, ninguno.
  // Y la leyenda: cada escala enseña la suya y esconde las otras dos.
  function controlesVisibles(capa, canto, giros) {
    var g = giros || {};
    var c = capa || 'galaxia';
    var enGalaxia = c === 'galaxia';
    return {
      abatimiento: enGalaxia,
      giroCanto:   enGalaxia && !!canto && !!g.giroAzimutalCanto,
      giroPlano:   enGalaxia && !!canto && !!g.giroPlanoCanto,
      leyendaObjetos:   enGalaxia,
      leyendaHubble:    c === 'grupoLocal',
      leyendaEspectral: c === 'vecindario'
    };
  }

  var API = {
    capaActiva: capaActiva,
    controlesVisibles: controlesVisibles
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
  if (typeof window !== 'undefined') { window.VLCapas = API; }
})();
