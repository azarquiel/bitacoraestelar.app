/* ============================================================================
   via-lactea-geometria.js — GEOMETRÍA pura del motor de transformación
   Proyecto: mapa interactivo de la Vía Láctea (Gaia)

   Mitad PURA del motor: la matemática frágil y bug-prone del encuadre (letterbox
   de object-fit:contain, caja envolvente de un rectángulo rotado, anclaje del
   zoom a un punto de pantalla y reproyección azimutal de la vista de canto). No
   toca el DOM ni el estado del mapa: entra en números, sale en números. La otra
   mitad —el estado (scale/posX/posY/rotación) y los gestos (mouse/touch/wheel)—
   se queda en via-lactea-app.js, que inyecta el DOM y CONFIG en estas funciones.

   Se carga ANTES de via-lactea-app.js y expone window.VLGeometria. También
   exporta por module.exports para el test de node (scripts/test_geometria.js),
   sin dependencias del navegador.
   ============================================================================ */

(function () {
  'use strict';

  var RAD = Math.PI / 180;

  // Rect de la imagen dentro de su contenedor con object-fit:contain: la imagen
  // renderizada puede no llenar el contenedor (bandas negras a los lados o
  // arriba/abajo según la relación de aspecto). Devuelve {left, top, width,
  // height} del área ocupada por la imagen real, centrada en el contenedor.
  function rectContain(contW, contH, natW, natH) {
    var nW = natW || contW;
    var nH = natH || contH;
    var ratio = nW / nH;
    var rW, rH;
    if (contW / contH > ratio) {
      // el contenedor es más ancho que la imagen: bandas a los lados
      rH = contH;
      rW = contH * ratio;
    } else {
      // el contenedor es más alto que la imagen: bandas arriba/abajo
      rW = contW;
      rH = contW / ratio;
    }
    return {
      left:   (contW - rW) / 2,
      top:    (contH - rH) / 2,
      width:  rW,
      height: rH
    };
  }

  // Caja envolvente (huella) de un rectángulo w×h girado 'rotDeg' grados. Con la
  // vista rotada, el contenido ocupa más que su rectángulo original; esta huella
  // evita que el clamp impida ver zonas que sí caen dentro del encuadre.
  function huellaRotada(w, h, rotDeg) {
    var a = rotDeg * RAD;
    var c = Math.abs(Math.cos(a));
    var s = Math.abs(Math.sin(a));
    return { w: w * c + h * s, h: w * s + h * c };
  }

  // Limita el desplazamiento (posX, posY) para que un contenido de tamaño
  // contentW×contentH (ya escalado) no se despegue del visor viewW×viewH. Si el
  // contenido es más pequeño que el visor en un eje, ese eje se centra (0).
  function clampDesplazamiento(posX, posY, contentW, contentH, viewW, viewH) {
    var limitX = (contentW - viewW) / 2;
    var limitY = (contentH - viewH) / 2;
    return {
      x: limitX > 0 ? Math.min(limitX, Math.max(-limitX, posX)) : 0,
      y: limitY > 0 ? Math.min(limitY, Math.max(-limitY, posY)) : 0
    };
  }

  // Nuevo desplazamiento al pasar de escalaAntes a escalaDespues manteniendo fijo
  // en pantalla el punto (cx, cy) —relativo al centro del visor— bajo el cursor
  // o el punto medio del pellizco.
  function zoomAlrededor(posX, posY, cx, cy, escalaAntes, escalaDespues) {
    var ratio = escalaDespues / escalaAntes;
    return {
      x: cx - (cx - posX) * ratio,
      y: cy - (cy - posY) * ratio
    };
  }

  // Posición horizontal (en % de la imagen) de un objeto en la vista de canto
  // para un azimut 'phiDeg'. Geometría: u apunta del Sol al núcleo, v es la
  // perpendicular en el plano; el núcleo está fijo en x=50 y todo gira a su
  // alrededor. En phi=0 reproduce exactamente las posiciones del archivo.
  //   anchoImagenAl        = CONFIG.fisica.anchoImagenAl
  //   distanciaSolNucleoAl = CONFIG.fisica.distanciaSolNucleoAl
  function xCantoObjeto(g, phiDeg, anchoImagenAl, distanciaSolNucleoAl) {
    var S = 100 / anchoImagenAl;
    var R0 = distanciaSolNucleoAl;
    var a = phiDeg * RAD;
    var lr = g.l * RAD;
    var cb = Math.cos(g.b * RAD);
    var u = g.d * cb * Math.cos(lr);
    var v = g.d * cb * Math.sin(lr);
    return 50 + S * ((u - R0) * Math.cos(a) + v * Math.sin(a));
  }

  // Posición horizontal del Sol en la vista de canto para un azimut 'phiDeg'
  // (el Sol orbita el núcleo a distancia R0).
  function xCantoSol(phiDeg, anchoImagenAl, distanciaSolNucleoAl) {
    var S = 100 / anchoImagenAl;
    var R0 = distanciaSolNucleoAl;
    return 50 - S * R0 * Math.cos(phiDeg * RAD);
  }

  var API = {
    rectContain: rectContain,
    huellaRotada: huellaRotada,
    clampDesplazamiento: clampDesplazamiento,
    zoomAlrededor: zoomAlrededor,
    xCantoObjeto: xCantoObjeto,
    xCantoSol: xCantoSol
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
  if (typeof window !== 'undefined') { window.VLGeometria = API; }
})();
