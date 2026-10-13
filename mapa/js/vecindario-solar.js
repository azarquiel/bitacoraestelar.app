/* ============================================================================
   vecindario-solar.js — CAPA DEL VECINDARIO SOLAR
   Proyecto: mapa interactivo de la Vía Láctea (Gaia)

   Simétrica a grupo-local.js pero al ACERCAR: cuando se hace zoom máximo SOBRE
   EL SOL, la imagen de la galaxia se funde en el punto "Sol" del centro y
   aparece una escena 3D de las estrellas cercanas registradas, con el Sol en el
   origen (0,0,0). Tono DORADO (brazos de la Vía Láctea) para una inmersión suave.

   Esta capa NO tiene controles de zoom propios: su nivel de zoom (fov) y su
   opacidad los gobierna el visor principal a través de VecindarioSolar.sync(),
   llamado desde updateVecindario() en via-lactea-app.js. Así el tránsito
   galaxia → vecindario es una única acción de zoom continua.

   Origen (0,0,0) = Sol. Posiciones en coordenadas galácticas (l, b) + distancia
   (años luz). El plano z=0 es el plano galáctico que pasa por el Sol: las
   estrellas por DEBAJO (z<0) llevan plomada DISCONTINUA; las de ENCIMA (z>0),
   CONTINUA. La plomada solo se dibuja en la estrella realzada (hover o centro).

   El COLOR de las estrellas es EXACTAMENTE el del render de Gaia del simulador
   de ocular porque AMBOS usan el mismo módulo: BitacoraGaiaColor (fuente única,
   resources/js/bitacora-gaia-color.js). Ya no hay tabla que sincronizar a mano.
   ============================================================================ */

var VecindarioSolar = (function () {

  // ==========================================================================
  // COLOR DE ESTRELLA POR ÍNDICE BP–RP  (copiado 1:1 del simulador de ocular)
  // ==========================================================================
  // azul (caliente) → blanco → amarillo → naranja → rojo profundo (fría). Nodos
  // anclados a los códigos físicos de Harre & Heller (2021) / spec2col; el
  // extremo rojo, a un espectro de estrella de carbono (bandas C2 Swan).
  // El color de estrella por BP–RP (tabla + gamma + saturación) y la clase espectral
  // vienen del MÓDULO COMPARTIDO BitacoraGaiaColor (bitacora-gaia-color.js), fuente
  // única con el simulador de oculares. Aquí solo quedan helpers de FORMATO locales
  // que delegan en él, y el BP–RP representativo de cada clase para la leyenda.
  function hexDe(bprp) {
    var c = BitacoraGaiaColor.colorPorBpRp(bprp);
    return '#' + [c[0], c[1], c[2]].map(function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }
  // 'aten' = estrella POR VISITAR para el observador activo: solo se usa en el
  // rótulo y en la línea guía, que pierden algo de color y de opacidad según
  // las constantes comunes a las tres vistas (VLObservadores). El símbolo de la
  // estrella no se apaga: cambia de forma (anillo hueco), más abajo.
  function rgbaDe(bprp, a, aten) {
    var c = BitacoraGaiaColor.colorPorBpRp(bprp);
    if (aten) {
      c = window.VLObservadores.grisNoVisitado(c[0], c[1], c[2]);
      a = a * window.VLObservadores.OPACIDAD_NO_VISITADO;
    }
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }
  // BP–RP representativo de cada clase espectral, para pintar los puntos de la
  // leyenda cicleable O·B·A·F·G·K·M con la MISMA función de color de Gaia.
  var CLASE_BPRP = { O: -0.35, B: -0.10, A: 0.15, F: 0.50, G: 0.80, K: 1.30, M: 2.60 };

  // ==========================================================================
  // CATÁLOGO
  // ==========================================================================
  var DIST_MAX = (window.CONFIG && CONFIG.vecindario && CONFIG.vecindario.distMaxAl) || 1500;

  // Estrellas del vecindario: la selección (filtro por distancia y coordenadas)
  // y su colocación 3D con el Sol en el origen viven en el módulo puro
  // via-lactea-vecindario-catalogo.js (cargado antes que este archivo). Sin
  // ninguna estrella cercana registrada, la lista queda vacía y la escena
  // muestra solo el Sol con un aviso.
  var objects = VLVecindarioCatalogo.estrellasVecindario(
    (typeof OBJECTS !== 'undefined' && OBJECTS) ? OBJECTS : [], DIST_MAX);

  // ==========================================================================
  // DOM
  // ==========================================================================
  var canvas = document.getElementById('vs-sky');
  var tip = document.getElementById('vs-tip');
  var scaleTag = document.getElementById('vs-scale');
  var stage = document.getElementById('mw-viewer');
  if (!canvas || !stage) {
    return { ready: false, sync: function () {}, setViaje: function () {}, interactivo: function () { return false; } };
  }

  // Cámara, gestos, rejilla, marcadores y bucle: la escena 3D compartida
  // (via-lactea-escena3d.js). Aquí solo van el catálogo, los colores dorados y
  // el Sol en el origen.
  var escena = VLEscena3D.crear({
    canvas: canvas, stage: stage, tip: tip, scaleTag: scaleTag,
    objetos: objects,
    yaw: 0.6, pitch: -0.42,
    // zoom logarítmico: fov = campo de visión en al (radio visible)
    fovMin: (window.CONFIG && CONFIG.vecindario && CONFIG.vecindario.fovMinAl) || 8,
    fovMax: (window.CONFIG && CONFIG.vecindario && CONFIG.vecindario.fovInicioAl) * 1.4 || 3500,
    autoGiro: (window.CONFIG && CONFIG.vecindario && CONFIG.vecindario.autoGiro != null)
      ? CONFIG.vecindario.autoGiro : 0.0006,
    decimales: true,
    colores: {
      // Fondo: degradado oscuro con un tinte cálido; rejilla dorada.
      fondo: { y: 0.46, c0: '#120c04', c07: '#05030a', c1: '#03020a' },
      estrellas: { n: 240, rgb: '255,240,214' },
      rejilla: { rgb: '214,164,74', alfa: 0.32, eje: 0.16, rotulo: 'rgba(255,208,120,0.6)' },
      nucleo: '#fff9ef',
      alfaEtiqueta: 1
    },
    // COLOR EXACTO de Gaia (por BP–RP)
    rgba: function (o, a, aten) { return rgbaDe(o.bprp, a, aten); },
    volver: { escala: 'vecindario', aria: 'Volver al Sol, origen de la escena', texto: 'Volver al Sol' },
    oculto: function (o) { return !!(hiddenClases && hiddenClases[o.clase || '']); },
    sufijoTip: function (o) { return o.clase ? (' · tipo ' + o.clase) : ''; },
    pintarOrigen: pintarSol,
    alClic: function (o) { if (API.onObjectClick) API.onObjectClick(o); }
  });

  // Sol en el origen (el punto en que se convierte la galaxia al acercar)
  function pintarSol() {
    var ctx = escena.ctx, layerAlpha = escena.alfa();
    var sun = escena.project(VLEscena3D.ORIGEN);
    var g = ctx.createRadialGradient(sun.sx, sun.sy, 0, sun.sx, sun.sy, 30);
    g.addColorStop(0, 'rgba(255,224,138,0.95)');
    g.addColorStop(0.5, 'rgba(255,196,90,0.35)');
    g.addColorStop(1, 'rgba(255,196,90,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(sun.sx, sun.sy, 30, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sun.sx, sun.sy, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    if (layerAlpha > 0.6) {
      ctx.fillStyle = 'rgba(255,224,138,0.97)';
      ctx.font = '600 12px Inter, sans-serif';
      ctx.fillText('Sol', sun.sx + 13, sun.sy - 9);
    }

    // Estado vacío: sin estrellas cercanas registradas se avisa, en vez de dejar
    // una escena muda con solo el Sol.
    if (!objects.length && layerAlpha > 0.4) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(214,196,150,' + (0.9 * layerAlpha).toFixed(3) + ')';
      ctx.font = '500 13px Inter, sans-serif';
      ctx.fillText('Aún no hay estrellas cercanas registradas', sun.sx, sun.sy + 50);
      ctx.fillStyle = 'rgba(183,154,95,' + (0.85 * layerAlpha).toFixed(3) + ')';
      ctx.font = '400 11px Inter, sans-serif';
      ctx.fillText('Registra estrellas a menos de ' + DIST_MAX + ' al para poblar el vecindario', sun.sx, sun.sy + 68);
      ctx.textAlign = 'left';
    }
  }

  // ---- Leyenda espectral (cicleable) ----------------------------------------
  // Enseñarla o esconderla (y esconder las de las otras escalas) es cosa de la
  // app con VLCapas; aquí solo se pinta y se escuchan sus clics.
  var legendEspectral = document.getElementById('mw-legend-espectral');

  // Pinta los puntos de color de la leyenda con la MISMA función de color de
  // Gaia (garantiza que O·B·A·F·G·K·M usan exactamente esos colores).
  if (legendEspectral) {
    var swatches = legendEspectral.querySelectorAll('.vs-legend-item');
    for (var sw = 0; sw < swatches.length; sw++) {
      var clase = swatches[sw].getAttribute('data-clase');
      var dot = swatches[sw].querySelector('.vs-legend-dot');
      if (dot && CLASE_BPRP[clase] != null) {
        var hx = hexDe(CLASE_BPRP[clase]);
        dot.style.background = hx;
        dot.style.boxShadow = '0 0 4px 1px ' + rgbaDe(CLASE_BPRP[clase], 0.9);
      }
    }
  }

  var hiddenClases = {};
  if (legendEspectral) {
    var vsItems = legendEspectral.querySelectorAll('.vs-legend-item');
    for (var vi = 0; vi < vsItems.length; vi++) {
      vsItems[vi].addEventListener('click', function () {
        var clase = this.getAttribute('data-clase');
        var nowHidden = !hiddenClases[clase];
        hiddenClases[clase] = nowHidden;
        this.style.opacity = nowHidden ? '0.4' : '1';
        var textEl = this.querySelector('.vs-legend-text');
        if (textEl) textEl.style.textDecoration = nowHidden ? 'line-through' : 'none';
      });
    }
  }

  // ---- API pública (la llama updateVecindario en via-lactea-app.js) ---------
  //   sync(pxPerLy, alpha): fov y opacidad de la capa (via-lactea-escena3d.js).
  var API = {
    ready: true,
    sync: escena.sync,
    setViaje: escena.setViaje,
    centrar: escena.centrar, esCentro: escena.esCentro, volver: escena.volver, alOrigen: escena.alOrigen,
    // La estrella de la escena por id de objeto registrado (la de OBJECTS no lleva x, y, z).
    porId: function (id) {
      for (var i = 0; i < objects.length; i++) if (objects[i].id === id) return objects[i];
      return null;
    },
    centroDesplazado: escena.centroDesplazado,
    interactivo: escena.interactivo,
    onObjectClick: null
  };
  return API;
})();
