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

  // Fundido de la capa con HISTÉRESIS: entrar cuesta más que quedarse. Sin ella,
  // el Sol se descentra al hacer zoom con la rueda, "cerca" cae y la escena se
  // desvanece de golpe con la galaxia ya gigante detrás (las dos imágenes
  // mezcladas), además de devolver el tope de zoom y dar un salto.
  //   fov    : campo de visión actual (al).
  //   cerca  : ¿el Sol está centrado? Solo hace falta para ENTRAR.
  //   dentro : ¿veníamos ya dentro del vecindario?
  // Devuelve { alpha, dentro }: alpha 1 = solo vecindario; dentro es el estado
  // para el siguiente fotograma.
  function fundidoVecindario(fov, cerca, dentro, cfg) {
    var ini = cfg.fovInicioAl, fin = cfg.fovFinalAl;
    var salida = (cfg.fovSalidaAl != null) ? cfg.fovSalidaAl : fin;
    if (salida < fin) salida = fin;      // salida por debajo del fundido = sin histéresis
    if (salida > ini) salida = ini;
    var alpha;
    if (dentro) {
      // Ya dentro: opaco hasta fovSalidaAl y se apaga entre ahí y fovInicioAl.
      alpha = (fov <= salida) ? 1 : (fov >= ini ? 0 : (ini - fov) / (ini - salida));
    } else if (!cerca || fov >= ini) {
      alpha = 0;
    } else {
      alpha = (fov <= fin) ? 1 : (ini - fov) / (ini - fin);
    }
    return { alpha: alpha, dentro: dentro ? alpha > 0 : alpha >= 1 };
  }

  var API = {
    galToXYZ: galToXYZ,
    estrellasVecindario: estrellasVecindario,
    fundidoVecindario: fundidoVecindario
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
  if (typeof window !== 'undefined') { window.VLVecindarioCatalogo = API; }
})();
