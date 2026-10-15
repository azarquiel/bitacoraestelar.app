/* ============================================================================
   via-lactea-escalas.js — RELACIÓN píxeles↔campo y TOPES DE ZOOM entre escalas
   Proyecto: mapa interactivo de la Vía Láctea (Gaia)

   Dos reglas que antes vivían sueltas en via-lactea-app.js y en la escena 3D:

   - El campo del visor: el radio de la escena (vecindario, Grupo Local) ocupa
     el 42 % del lado corto. Un solo nombre, RADIO_CAMPO, para las 8 cuentas.
   - Los topes de la rueda y el pellizco con el centro desplazado (#424): el
     zoom no cruza a la escala de al lado. Sin dato para el tope (imagen de la
     galaxia sin cargar) no se aleja: peor un zoom parado que cruzar de escala
     o caer a 0 (96e979f).

   - El fundido del Grupo Local (umbral / umbralFinal) y la cercanía del Sol
     (proximidad) se calculan aquí una sola vez (#447); la app solo los aplica.

   Puro: sin DOM. Quien mide el visor y la imagen es via-lactea-app.js.

   Se carga ANTES de via-lactea-escena3d.js y via-lactea-app.js y expone
   window.VLEscalas (+ module.exports para scripts/test_escalas.js).

   Interfaz (window.VLEscalas):
     RADIO_CAMPO                       -> 0.42
     radioCampo(ancho, alto)           -> px del radio de la escena
     umbrales(cfgGrupoLocal)           -> { umbral, umbralFinal }
     fundidoGrupoLocal(escala, cfgG)   -> opacidad de la galaxia (1 = sola, 0 = solo el atlas)
     proximidadSol(cfg)                -> fracción del lado corto (CONFIG.vecindario.proximidad)
     solCerca(dx, dy, ancho, alto, cfg)-> ¿el Sol está a menos de la proximidad del centro?
     zoomAlCentro(desplazado, dentro)  -> ¿el zoom ancla al centro del visor y no al cursor?
     topes(p)                          -> { vecindarioMin, grupoLocalMax }
     limitar(p)                        -> escala que deja el zoom
       p = { capa, desplazado, escala, pedida, ancho, alto,
             anchoImagen (px de la imagen a escala 1; 0 = sin cargar),
             cfg (CONFIG) }
   ============================================================================ */

(function () {
  'use strict';

  var RADIO_CAMPO = 0.42;

  function radioCampo(ancho, alto) { return Math.min(ancho, alto) * RADIO_CAMPO; }

  // Escala a partir de la cual la galaxia está entera (umbral) y por debajo de
  // la cual solo se ve el atlas (umbralFinal; si falta o no es menor, 40 %).
  function umbrales(cfgG) {
    cfgG = cfgG || {};
    var umbral = cfgG.umbral || 0.1;
    var umbralFinal = (cfgG.umbralFinal != null) ? cfgG.umbralFinal : umbral * 0.4;
    if (umbralFinal >= umbral) umbralFinal = umbral * 0.4;
    return { umbral: umbral, umbralFinal: umbralFinal };
  }

  // Opacidad de la galaxia: 1 por encima del umbral, 0 por debajo del final,
  // fundido lineal en la banda intermedia.
  function fundidoGrupoLocal(escala, cfgG) {
    var u = umbrales(cfgG);
    if (escala >= u.umbral) return 1;
    if (escala <= u.umbralFinal) return 0;
    return (escala - u.umbralFinal) / (u.umbral - u.umbralFinal);
  }

  function proximidadSol(cfg) {
    return ((cfg && cfg.vecindario && cfg.vecindario.proximidad) || 0.28);
  }

  // dx, dy: del centro del visor al Sol, en px.
  function solCerca(dx, dy, ancho, alto, cfg) {
    return Math.sqrt(dx * dx + dy * dy) < Math.min(ancho, alto) * proximidadSol(cfg);
  }

  // Con el centro de la escena a la vista (centro desplazado, o dentro del
  // vecindario, que se pinta siempre en el centro del visor) el zoom no sigue al cursor.
  function zoomAlCentro(desplazado, dentroVecindario) { return !!(desplazado || dentroVecindario); }

  // Escalas de la galaxia donde EMPIEZA el fundido de salida de cada vecina.
  function topes(p) {
    var cfg = p.cfg || {};
    var cfgV = cfg.vecindario || {};
    var cfgG = cfg.grupoLocal || {};
    var salida = (cfgV.fovSalidaAl != null) ? cfgV.fovSalidaAl : cfgV.fovFinalAl;
    salida = Math.min(cfgV.fovInicioAl, Math.max(cfgV.fovFinalAl, salida));   // como fundidoVecindario
    var min = p.anchoImagen
      ? (radioCampo(p.ancho, p.alto) * (cfg.fisica || {}).anchoImagenAl) / (p.anchoImagen * salida)
      : NaN;
    return {
      grupoLocalMax: umbrales(cfgG).umbralFinal,
      // Sin dato (o tope 0), no se aleja.
      vecindarioMin: (isFinite(min) && min > 0) ? min : Infinity
    };
  }

  // La escala que deja el zoom: la pedida, o el tope si cruzarlo cambiaría de
  // escala. Un tope ya rebasado no empuja la vista atrás: solo impide seguir en
  // esa dirección. Del mapa de la galaxia no hay centro: pasa libre.
  function limitar(p) {
    // Mismo predicado que VLCapas.puedeCambiarDeEscala (capas.js se carga después).
    if (!p.desplazado || p.capa === 'galaxia') return p.pedida;
    var t = topes(p);
    var r = p.capa === 'vecindario'
      ? Math.max(p.pedida, Math.min(p.escala, t.vecindarioMin))
      : Math.min(p.pedida, Math.max(p.escala, t.grupoLocalMax));
    return isFinite(r) ? r : p.escala;
  }

  var API = { RADIO_CAMPO: RADIO_CAMPO, radioCampo: radioCampo, umbrales: umbrales, fundidoGrupoLocal: fundidoGrupoLocal,
              proximidadSol: proximidadSol, solCerca: solCerca, zoomAlCentro: zoomAlCentro, topes: topes, limitar: limitar };

  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
  if (typeof window !== 'undefined') { window.VLEscalas = API; }
})();
