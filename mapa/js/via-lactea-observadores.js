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
     getEstado() / setEstado(e)   -> eje ESTADO: 'todo' | 'visitados' | 'porvisitar'
     setConjunto(l)               -> eje CONJUNTO: null (todos) o lista de ids
     recuento(ids)                -> cuántos de esos ids deja a la vista la regla
     getFicha(id)                 -> la ficha visible del objeto, o null
     observacionesAjenasActivo()  -> ¿está activo el "descubrir observaciones"?
     fichaDeObservador(id, clave) -> la observación de 'clave' sobre 'id', o null
     observadoresDe(id, excluir)  -> [{clave, nombre}] que observaron 'id'
     estadoObservador(id)         -> 'propia' | 'ajena' | 'ninguna'
     visiblePorObservador(id)     -> ¿se dibuja con el filtro actual? (las 3 vistas)
     atenuadoPorObservador(id)    -> ¿se pinta como "no visitado"? (las 3 vistas)
     grisNoVisitado(r, g, b)      -> [r,g,b] del color apagado de "por visitar"
     OPACIDAD_NO_VISITADO         -> multiplicador de opacidad del rótulo
     MEZCLA_NO_VISITADO           -> proporción de gris (para el filtro CSS)
     ANILLO_NO_VISITADO           -> {escala, grosor} del anillo de "por visitar"
   ============================================================================ */

(function () {
  'use strict';

  // Observador activo del filtro ('' = todas las observaciones).
  var observadorActivo = '';

  function getActivo() { return observadorActivo; }
  function setActivo(clave) { observadorActivo = clave || ''; }

  // Los dos ejes del filtro (#233). CONJUNTO: qué objetos entran (null = todos;
  // una lista de ids = un viaje o, mañana, un catálogo). ESTADO: cómo están
  // respecto al observador activo... y sin observador ("Todas las
  // observaciones"), respecto a CUALQUIERA: explorado = lo ha observado
  // alguien. Así el eje también sirve al visitante anónimo, que no tiene
  // observador propio pero sí catálogo que mirar.
  var ESTADOS = { todo: 1, visitados: 1, porvisitar: 1 };
  var estado = 'visitados';
  var conjunto = null;      // {id: true} o null

  function getEstado() { return estado; }
  function setEstado(e) { estado = ESTADOS[e] ? e : 'visitados'; }
  function setConjunto(ids) {
    if (!ids) { conjunto = null; return; }
    conjunto = {};
    for (var i = 0; i < ids.length; i++) conjunto[ids[i]] = true;
  }

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

  // ---- "Por visitar": regla y aspecto ÚNICOS de las tres vistas -------------
  // Las tres escalas del mapa (extragaláctica, Vía Láctea y vecindario solar)
  // pintan igual lo que el observador activo no ha visitado. La diferencia es
  // de SÍMBOLO, no de brillo: anillo hueco del color del objeto en vez de punto
  // lleno con halo, del tamaño que dice ANILLO. Lo único que se apaga es el
  // rótulo, y poco: si se apagara el símbolo, un destino por visitar parecería
  // un objeto de segunda. Aquí viven la regla y las constantes; cada vista solo
  // las aplica con su técnica (filtro CSS en los marcadores de la galaxia,
  // mezcla de color en los dos lienzos).
  var GRIS = 150;          // gris hacia el que se mezcla el color del rótulo
  var MEZCLA = 0.35;       // cuánto del gris (0 = color intacto, 1 = gris puro)
  var OPACIDAD = 0.8;      // multiplicador de opacidad del rótulo por visitar
  // Anillo hueco: 1,6 veces el radio del punto lleno, para que se distinga de
  // un vistazo. Son los mismos números que .mw-no-visitado en mapa.html.
  var ANILLO = { escala: 1.6, grosor: 1.4 };

  // ¿Se dibuja el objeto con el filtro actual? Primero el conjunto (fuera de
  // la lista no hay nada que ver); luego el estado:
  //   visitados  -> solo con observación propia (sin observador activo, de
  //                 cualquiera: el visitante anónimo ve lo ya explorado).
  //   porvisitar -> todo lo del conjunto SIN observación propia, lo haya
  //                 observado otro o nadie; ignora CONFIG.observacionesAjenas,
  //                 que gobierna "descubrir a otros", no "qué me falta".
  //   todo       -> la regla de siempre: propias y, si el descubrimiento está
  //                 activo, ajenas atenuadas; las de nadie se ocultan.
  function visiblePorObservador(id) {
    if (conjunto && !conjunto[id]) return false;
    // getFicha() ya resuelve las dos lecturas de "explorado": con observador
    // activo, la ficha suya; sin observador, la de cualquiera.
    if (estado === 'visitados') return !!getFicha(id);
    if (estado === 'porvisitar') return !getFicha(id);
    if (!observadorActivo) return true;
    return estadoObservador(id) !== 'ninguna';
  }

  // ¿Se dibuja como "por visitar" (anillo hueco)? En 'visitados' nunca; en
  // 'porvisitar' todo lo visible lo es; en 'todo' solo lo observado por otros.
  function atenuadoPorObservador(id) {
    if (estado === 'visitados') return false;
    if (estado === 'porvisitar') return !getFicha(id);
    if (!observadorActivo) return false;
    return estadoObservador(id) === 'ajena';
  }

  // Cuántos de esos ids deja a la vista la regla (el recuento del control).
  function recuento(ids) {
    var n = 0;
    for (var i = 0; i < ids.length; i++) if (visiblePorObservador(ids[i])) n++;
    return n;
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
    ANILLO_NO_VISITADO: ANILLO,
    getActivo: getActivo,
    setActivo: setActivo,
    getEstado: getEstado,
    setEstado: setEstado,
    setConjunto: setConjunto,
    recuento: recuento,
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
