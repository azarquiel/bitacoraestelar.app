/* ============================================================================
   via-lactea-buscador-indice.js — RESOLVEDOR de texto del buscador
   Proyecto: mapa interactivo de la Vía Láctea (Gaia)

   Mitad PURA del buscador: dado el texto que escribe el usuario, decide QUÉ
   objeto registrado quiere ver, sin tocar el DOM ni el estado del mapa. La otra
   mitad —la NAVEGACIÓN (mover la cámara, parpadear el marcador, resolver en
   SIMBAD)— vive en via-lactea-app.js, acoplada al motor de transformación.

   Se carga ANTES de via-lactea-app.js y expone window.VLBuscadorIndice.
   También exporta por module.exports para el test de node
   (scripts/test_buscador_indice.js), sin dependencias del navegador.

   Interfaz (window.VLBuscadorIndice):
     normalizar(s)              -> texto comparable (minúsculas, sin acentos ni
                                   signos): "M 13", "m13" y "M13" se igualan.
     esDesignacionCatalogo(q)   -> ¿es una designación tipo M1 / NGC 6826 / IC
                                   1396? Esas solo deben casar de forma EXACTA,
                                   para no confundir "M1" con "M101".
     construir(objetos)         -> índice { exacto(q), parcial(q) } sobre una
                                   lista de objetos (cada uno con id/label/name):
         exacto(q)   -> objeto cuyo id, etiqueta o nombre casa EXACTO, o null.
         parcial(q)  -> objeto cuyo nombre descriptivo CONTIENE la consulta
                        (p. ej. "cangrejo" -> M1), o null.
   ============================================================================ */

(function () {
  'use strict';

  // Normaliza un texto para comparar: minúsculas, sin acentos, sin espacios
  // ni signos, para que "M 13", "m13" y "M13" se consideren iguales.
  function normalizar(s) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
      .replace(/[^a-z0-9]/g, '');                        // quita espacios/signos
  }

  // ¿La consulta es una designación de catálogo (M1, Messier 30, NGC 6826, IC
  // 1396)? Esas solo deben casar de forma EXACTA, para no confundir "M1" con
  // "M101" por coincidencia parcial.
  function esDesignacionCatalogo(query) {
    return /^\s*(m|messier|ngc|ic)\s*\d+\s*$/i.test(query || '');
  }

  // Construye un índice de búsqueda a partir de una lista de objetos (id, label
  // y name). Devuelve los buscadores exacto/parcial cerrados sobre ese índice.
  function construir(objetos) {
    var indice = (objetos || []).map(function (o) {
      return {
        obj: o,
        claves: [normalizar(o.id), normalizar(o.label), normalizar(o.name)]
      };
    });

    // Coincidencia EXACTA por id, etiqueta o nombre completo (normalizados).
    function exacto(query) {
      var nq = normalizar(query);
      if (!nq) return null;
      for (var i = 0; i < indice.length; i++) {
        if (indice[i].claves.indexOf(nq) >= 0) return indice[i].obj;
      }
      return null;
    }

    // Coincidencia PARCIAL: la consulta aparece dentro del nombre descriptivo
    // (p. ej. "cangrejo" -> M1). No se usa con designaciones de catálogo.
    function parcial(query) {
      var nq = normalizar(query);
      if (!nq) return null;
      for (var j = 0; j < indice.length; j++) {
        if (normalizar(indice[j].obj.name).indexOf(nq) >= 0) return indice[j].obj;
      }
      return null;
    }

    return { exacto: exacto, parcial: parcial };
  }

  var API = {
    normalizar: normalizar,
    esDesignacionCatalogo: esDesignacionCatalogo,
    construir: construir
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
  if (typeof window !== 'undefined') { window.VLBuscadorIndice = API; }
})();
