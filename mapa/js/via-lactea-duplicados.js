/* ============================================================================
   via-lactea-duplicados.js — UNA ESTRELLA, UN MARCADOR
   Proyecto: mapa interactivo de la Vía Láctea (Gaia)

   Una misma estrella puede estar registrada con varios nombres (Sheliak y
   HR 7106; HR 7139 y SAO 67559): cada observador escribió el suyo y cada uno
   creó su fila en OBJECTS, con la misma posición exacta. Los marcadores se
   solapan y no se pueden separar. Este módulo se ejecuta UNA vez, justo
   después de datos.js, y deja una sola fila por estrella:

     - Agrupa las estrellas (tipo estrella o carbono) con la misma l, b y
       distancia. Solo estrellas: IC 1396 y Tr 37 comparten posición y son
       objetos distintos.
     - Elige la canónica por la prioridad del nombre (rangoNombre): nombre
       propio > Bayer/Flamsteed > HR > HD > SAO > el resto. Empata el que
       tiene más observaciones y, después, el id.
     - Las observaciones de las demás se añaden AL FINAL de las de la canónica
       (los índices que ya tenía no cambian), los viajes que pasaban por un
       alias pasan por la canónica y los nombres descartados quedan en
       canonica.alias para que el buscador los siga encontrando.

   No toca la base de datos: la fusión es de lectura. El arreglo de raíz (que el
   registro reutilice la fila existente) es otro ticket. Ver mapa/README.md.

   Pura: se testea en Node (scripts/test_duplicados.js). En el navegador se
   ejecuta sola sobre OBJECTS, OBSERVACIONES y VIAJES si existen.
   ============================================================================ */
(function (root) {
  'use strict';

  var GRIEGAS = 'alf|alpha|alfa|bet|beta|gam|gamma|del|delta|eps|epsilon|zet|zeta|eta|tet|theta|iot|iota|' +
    'kap|kappa|lam|lambda|mu|nu|ksi|xi|omi|omicron|pi|rho|sig|sigma|tau|ups|upsilon|phi|chi|psi|ome|omega';
  var BAYER = new RegExp('^(?:\\d+|(?:' + GRIEGAS + ')\\d*)\\s+[a-z][a-z ]{2,}$', 'i');
  var CATALOGO = /^([a-z]{1,5})\s*[-+]?\d/i;
  var RANGO_CATALOGO = { hr: 2, hd: 3, sao: 4 };

  // Menor = mejor. 0 nombre propio, 1 Bayer/Flamsteed, 2 HR, 3 HD, 4 SAO, 5 el
  // resto de catálogos (HIP, BD, TYC…).
  function rangoNombre(nombre) {
    var n = (nombre || '').trim();
    if (BAYER.test(n)) return 1;
    var c = CATALOGO.exec(n);
    if (c) return RANGO_CATALOGO[c[1].toLowerCase()] || 5;
    return 0;
  }

  function esEstrella(o) { return o.tipo === 'estrella' || o.tipo === 'carbono'; }

  function clavePosicion(o) {
    if (typeof o.l !== 'number' || typeof o.b !== 'number' || typeof o.dist !== 'number') return null;
    return o.l.toFixed(3) + '|' + o.b.toFixed(3) + '|' + Math.round(o.dist);
  }

  // Muta objects, observaciones y viajes. Devuelve { alias_id: id_canónico }.
  function unificar(objects, observaciones, viajes) {
    var grupos = {}, fusionados = {}, i;
    for (i = 0; i < objects.length; i++) {
      var k = esEstrella(objects[i]) ? clavePosicion(objects[i]) : null;
      if (k) (grupos[k] = grupos[k] || []).push(objects[i]);
    }
    var nObs = function (o) { return ((observaciones || {})[o.id] || []).length; };
    Object.keys(grupos).forEach(function (k) {
      var g = grupos[k];
      if (g.length < 2) return;
      g.sort(function (a, b) {
        return (rangoNombre(a.label || a.id) - rangoNombre(b.label || b.id)) ||
               (nObs(b) - nObs(a)) || (a.id < b.id ? -1 : 1);
      });
      var canon = g[0];
      canon.alias = canon.alias || [];
      g.slice(1).forEach(function (d) {
        fusionados[d.id] = canon.id;
        canon.alias.push(d.label || d.id);
        if (observaciones && observaciones[d.id]) {
          observaciones[canon.id] = (observaciones[canon.id] || []).concat(observaciones[d.id]);
          delete observaciones[d.id];
        }
        objects.splice(objects.indexOf(d), 1);
      });
    });
    if (viajes) {
      Object.keys(viajes).forEach(function (v) {
        var lista = viajes[v] && viajes[v].objetos;
        if (!lista) return;
        viajes[v].objetos = lista.map(function (id) { return fusionados[id] || id; })
          .filter(function (id, j, a) { return a.indexOf(id) === j; });
      });
    }
    return fusionados;
  }

  var api = { unificar: unificar, rangoNombre: rangoNombre };
  root.VLDuplicados = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  // Navegador: los datos ya están cargados (datos.js va antes que este script).
  if (typeof OBJECTS !== 'undefined' && Array.isArray(OBJECTS)) {
    api.fusionados = unificar(OBJECTS,
      typeof OBSERVACIONES !== 'undefined' ? OBSERVACIONES : null,
      typeof VIAJES !== 'undefined' ? VIAJES : null);
  }
})(typeof window !== 'undefined' ? window : globalThis);
