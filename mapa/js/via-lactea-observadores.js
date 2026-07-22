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
      var nombre = (typeof OBSERVADORES !== 'undefined' && OBSERVADORES[clave] && OBSERVADORES[clave].nombre)
        ? OBSERVADORES[clave].nombre : clave;
      out.push({ clave: clave, nombre: nombre });
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

  window.VLObservadores = {
    getActivo: getActivo,
    setActivo: setActivo,
    getFicha: getFicha,
    observacionesAjenasActivo: observacionesAjenasActivo,
    fichaDeObservador: fichaDeObservador,
    observadoresDe: observadoresDe,
    estadoObservador: estadoObservador
  };
})();
