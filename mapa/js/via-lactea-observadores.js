/* ============================================================================
   via-lactea-observadores.js — ADAPTADOR de datos de observadores
   Proyecto: mapa interactivo de la Vía Láctea (Gaia)

   La lógica del mapa pide "la ficha" de un objeto; este adaptador la resuelve
   sobre OBSERVACIONES, donde cada objeto tiene una LISTA de observaciones (hoy
   una; en el futuro, varias de distintos observadores). Es el ÚNICO punto que
   conoce esa estructura y el observador activo del filtro; cuando quieras
   ampliar el selector de observador, se amplía aquí.

   Se carga ANTES de via-lactea-app.js y expone window.VLObservadores.
   Requiere OBSERVACIONES y OBSERVADORES (via-lactea-datos.js) y, para la
   funcionalidad de "descubrir observaciones ajenas", CONFIG.observacionesAjenas
   (via-lactea-config.js). Todos se leen en tiempo de llamada, no de carga.

   Interfaz (window.VLObservadores):
     getActivo()                  -> clave del observador activo ('' = todas)
     setActivo(clave)             -> fija el observador activo del filtro
     getFicha(id)                 -> la ficha visible del objeto, o null
     observacionesAjenasActivo()  -> ¿está activo el "descubrir observaciones"?
     fichaDeObservador(id, clave) -> la observación de 'clave' sobre 'id', o null
     observadoresDe(id, excluir)  -> [{clave, nombre}] que observaron 'id'
     estadoObservador(id)         -> 'propia' | 'ajena' | 'ninguna'
     visiblePorObservador(id)     -> ¿se dibuja con el filtro actual? (las 3 vistas)
     atenuadoPorObservador(id)    -> ¿se pinta como "no visitado"? (las 3 vistas)
     grisNoVisitado(r, g, b)      -> [r,g,b] del gris clarito de "no visitado"
     OPACIDAD_NO_VISITADO         -> multiplicador de opacidad de lo no visitado
     MEZCLA_NO_VISITADO           -> proporción de gris (para el filtro CSS)
   ============================================================================ */

(function () {
  'use strict';

  // Observador activo del filtro ('' = todas las observaciones).
  var observadorActivo = '';

  function getActivo() { return observadorActivo; }
  function setActivo(clave) { observadorActivo = clave || ''; }

  function getFicha(id) {
    var lista = (typeof OBSERVACIONES !== 'undefined') ? OBSERVACIONES[id] : null;
    if (!lista || !lista.length) return null;
    if (observadorActivo) {
      for (var i = 0; i < lista.length; i++) {
        if (lista[i].observador === observadorActivo) return lista[i];
      }
      return null; // ese observador no tiene ficha de este objeto
    }
    return lista[0];
  }

  // ¿Está activada la funcionalidad de "descubrir observaciones de otros"?
  // (CONFIG.observacionesAjenas.activo, ver via-lactea-config.js).
  function observacionesAjenasActivo() {
    return !!(window.CONFIG && CONFIG.observacionesAjenas && CONFIG.observacionesAjenas.activo);
  }

  // Nombre legible de un observador a partir de su clave, resuelto sobre
  // OBSERVADORES; si no está catalogado se usa la propia clave. Clave vacía o
  // nula -> '' (para que la ficha no muestre una etiqueta de observador vacía).
  function nombreObservador(clave) {
    if (!clave) return '';
    return (typeof OBSERVADORES !== 'undefined' && OBSERVADORES[clave] && OBSERVADORES[clave].nombre)
      ? OBSERVADORES[clave].nombre : clave;
  }

  // Devuelve la observación concreta que 'clave' hizo del objeto 'id', o null.
  function fichaDeObservador(id, clave) {
    var lista = (typeof OBSERVACIONES !== 'undefined') ? OBSERVACIONES[id] : null;
    if (!lista || !lista.length) return null;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].observador === clave) return lista[i];
    }
    return null;
  }

  // Lista de observadores que han observado el objeto 'id', como
  // [{ clave, nombre }], excluyendo (opcionalmente) uno. El nombre se resuelve
  // desde OBSERVADORES; si falta, se usa la propia clave.
  function observadoresDe(id, excluir) {
    var lista = (typeof OBSERVACIONES !== 'undefined') ? OBSERVACIONES[id] : null;
    var out = [];
    if (!lista || !lista.length) return out;
    var vistos = {};
    for (var i = 0; i < lista.length; i++) {
      var clave = lista[i].observador;
      if (!clave || clave === excluir || vistos[clave]) continue;
      vistos[clave] = true;
      out.push({ clave: clave, nombre: nombreObservador(clave) });
    }
    return out;
  }

  // Estado de un objeto respecto al observador activo:
  //   'propia'  -> mostrar la ficha con normalidad (modo "todas", o el activo lo observó).
  //   'ajena'   -> nadie del activo lo observó, pero SÍ otros: atenuado + descubrimiento.
  //   'ninguna' -> nadie relevante lo observó: se oculta.
  function estadoObservador(id) {
    if (!observadorActivo) return 'propia';       // modo "todas": todo a color
    if (getFicha(id)) return 'propia';            // el observador activo lo observó
    if (observacionesAjenasActivo() && observadoresDe(id, observadorActivo).length) return 'ajena';
    return 'ninguna';
  }

  // ---- "No visitado": regla y aspecto ÚNICOS de las tres vistas -------------
  // Las tres escalas del mapa (extragaláctica, Vía Láctea y vecindario solar)
  // pintan igual lo que el observador activo no ha visitado: en gris clarito y
  // con menos opacidad, pero visible y pulsable. Aquí viven la regla y las
  // constantes; cada vista solo las aplica con su técnica (filtro CSS en los
  // marcadores, mezcla de color en los dos lienzos).
  var GRIS = 150;          // gris hacia el que se mezcla el color del objeto
  var MEZCLA = 0.82;       // cuánto del gris (0 = color intacto, 1 = gris puro)
  var OPACIDAD = 0.55;     // multiplicador de opacidad del objeto atenuado

  // ¿Se dibuja el objeto con el filtro de observador actual? Sí si el activo lo
  // observó ('propia') o si lo observaron otros y el descubrimiento está activo
  // ('ajena', atenuado); no si no queda nadie relevante ('ninguna').
  function visiblePorObservador(id) {
    return estadoObservador(id) !== 'ninguna';
  }

  // ¿Se dibuja atenuado ("no visitado") para el observador activo? Solo cuando
  // lo observaron OTROS: sin observaciones (o con el descubrimiento apagado) el
  // objeto se oculta, no se atenúa.
  function atenuadoPorObservador(id) {
    return estadoObservador(id) === 'ajena';
  }

  // Color de un objeto no visitado: su RGB mezclado con el gris clarito.
  function grisNoVisitado(r, g, b) {
    return [
      Math.round(r * (1 - MEZCLA) + GRIS * MEZCLA),
      Math.round(g * (1 - MEZCLA) + GRIS * MEZCLA),
      Math.round(b * (1 - MEZCLA) + GRIS * MEZCLA)
    ];
  }

  var API = {
    visiblePorObservador: visiblePorObservador,
    atenuadoPorObservador: atenuadoPorObservador,
    grisNoVisitado: grisNoVisitado,
    OPACIDAD_NO_VISITADO: OPACIDAD,
    MEZCLA_NO_VISITADO: MEZCLA,
    getActivo: getActivo,
    setActivo: setActivo,
    getFicha: getFicha,
    observacionesAjenasActivo: observacionesAjenasActivo,
    nombreObservador: nombreObservador,
    fichaDeObservador: fichaDeObservador,
    observadoresDe: observadoresDe,
    estadoObservador: estadoObservador
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
  if (typeof window !== 'undefined') { window.VLObservadores = API; }
})();
