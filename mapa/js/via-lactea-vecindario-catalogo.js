/* ============================================================================
   via-lactea-vecindario-catalogo.js — SELECCIÓN de estrellas del vecindario
   Proyecto: mapa interactivo de la Vía Láctea (Gaia)

   Mitad PURA de la capa del vecindario solar: dado el catálogo de objetos del
   mapa y el radio del vecindario, decide QUÉ estrellas entran en la escena y
   DÓNDE se colocan (Sol en el origen). No toca el DOM ni dibuja nada; eso se
   queda en vecindario-solar.js.

   Una estrella entra si tiene coordenadas galácticas (l, b) numéricas y una
   distancia en (0, distMaxAl]. Su color es el del modelo de color Gaia
   (BitacoraGaiaColor) a partir de su índice BP–RP (campo bp_rp, o bprp como
   reserva); sin BP–RP, la clase queda nula y el render usa un color neutro.

   Se carga ANTES de vecindario-solar.js y DESPUÉS de bitacora-gaia-color.js
   (necesita claseEspectral). Expone window.VLVecindarioCatalogo; también
   module.exports para el test de node (scripts/test_vecindario_catalogo.js).
   ============================================================================ */

(function () {
  'use strict';

  var DEG = Math.PI / 180;

  // Coordenadas galácticas (l, b en grados, d en años luz) a XYZ con el Sol en
  // el origen (0,0,0). x apunta al centro galáctico (l=0), y a l=90°, z al polo
  // galáctico norte (b=90°).
  function galToXYZ(l, b, d) {
    var lr = l * DEG, br = b * DEG;
    return {
      x: d * Math.cos(br) * Math.cos(lr),
      y: d * Math.cos(br) * Math.sin(lr),
      z: d * Math.sin(br)
    };
  }

  // Índice BP–RP de un objeto: bp_rp, o bprp como reserva, o null.
  function bpRpDe(o) {
    if (typeof o.bp_rp === 'number') return o.bp_rp;
    if (typeof o.bprp === 'number') return o.bprp;
    return null;
  }

  // Estrellas del vecindario a partir de los objetos del mapa: filtra por
  // distancia y coordenadas, resuelve color/clase y proyecta a XYZ.
  function estrellasVecindario(objects, distMaxAl) {
    var out = [];
    var lista = objects || [];
    var max = (typeof distMaxAl === 'number' && distMaxAl > 0) ? distMaxAl : 0;
    for (var i = 0; i < lista.length; i++) {
      var o = lista[i];
      if (typeof o.dist !== 'number' || o.dist <= 0 || o.dist > max) continue;
      if (typeof o.l !== 'number' || typeof o.b !== 'number') continue;
      var bprp = bpRpDe(o);
      var p = galToXYZ(o.l, o.b, o.dist);
      out.push({
        name: o.label || o.id, desc: o.name || '', l: o.l, b: o.b, d: o.dist,
        bprp: bprp,
        clase: (bprp != null && typeof BitacoraGaiaColor !== 'undefined')
          ? BitacoraGaiaColor.claseEspectral(bprp) : null,
        x: p.x, y: p.y, z: p.z,
        id: o.id, ficha: o.ficha || o.id, pdf: o.pdf, coords: o.coords, title: o.name
      });
    }
    return out;
  }

  var API = {
    galToXYZ: galToXYZ,
    estrellasVecindario: estrellasVecindario
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
  if (typeof window !== 'undefined') { window.VLVecindarioCatalogo = API; }
})();
