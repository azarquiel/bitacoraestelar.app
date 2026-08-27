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

  // ---------------------------------------------------------------------------
  // VISTA CENITAL INCLINADA (rotateX + perspective)
  // El plano del mapa es z=0 en las coordenadas de #mw-content; rotateX lo abate
  // y la perspective del envoltorio lo proyecta. Como el desplazamiento (pan)
  // vive FUERA de la perspectiva, aquí no entra: estas funciones trabajan en
  // coordenadas del visor SIN desplazar, y quien llama suma o resta el pan.
  //
  // Cadena real de CSS: transform: scale(esc) rotateX(grados), con
  // transform-origin y perspective-origin en el centro de la caja. Se aplica de
  // derecha a izquierda, así que primero se abate y luego se escala; y scale()
  // es 2D, o sea que NO escala z: la deformación de perspectiva es un efecto de
  // pantalla, del mismo tamaño a cualquier zoom (y nunca se acerca al punto de
  // fuga, así que no hay singularidad).
  //
  //   vista: { ancho, alto, escala, grados, perspectiva }
  //   z:     altura del punto sobre el plano galáctico, en px del contenido.
  // ---------------------------------------------------------------------------
  function proyectarInclinado(x, y, z, vista) {
    var a = (vista.grados || 0) * RAD;
    var cos = Math.cos(a), sen = Math.sin(a);
    var dx = x - vista.ancho / 2;
    var dy = y - vista.alto / 2;
    var ey = dy * cos - (z || 0) * sen;   // altura en pantalla tras abatir
    var ez = dy * sen + (z || 0) * cos;   // profundidad hacia el observador
    var k = 1 - ez / (vista.perspectiva || Infinity);   // división de perspectiva
    if (!(k > 0)) k = 1e-6;               // detrás del observador: no se proyecta
    return {
      x: vista.ancho / 2 + vista.escala * dx / k,
      y: vista.alto / 2 + vista.escala * ey / k
    };
  }

  // Inversa de proyectarInclinado sobre el propio plano (z=0): qué punto del
  // mapa hay bajo un punto de pantalla. Es la que ancla el zoom y el pellizco.
  //   ey·esc/k = v  y  k = 1 - dy·sen/p  =>  dy = v / (esc·cos + v·sen/p)
  function planoDesdePantalla(sx, sy, vista) {
    var a = (vista.grados || 0) * RAD;
    var cos = Math.cos(a), sen = Math.sin(a);
    var p = vista.perspectiva || Infinity;
    var u = sx - vista.ancho / 2;
    var v = sy - vista.alto / 2;
    var den = vista.escala * cos + v * sen / p;
    var dy = den ? v / den : 0;
    var k = 1 - dy * sen / p;
    return {
      x: vista.ancho / 2 + u * k / vista.escala,
      y: vista.alto / 2 + dy
    };
  }

  // Caja envolvente en pantalla del rectángulo de la imagen ya inclinado, para
  // que el clamp del desplazamiento no impida ver zonas que sí están dentro.
  function huellaInclinada(rect, vista) {
    var xs = [rect.left, rect.left + rect.width];
    var ys = [rect.top, rect.top + rect.height];
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (var i = 0; i < 2; i++) {
      for (var j = 0; j < 2; j++) {
        var p = proyectarInclinado(xs[i], ys[j], 0, vista);
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }
    return { w: maxX - minX, h: maxY - minY };
  }

  var API = {
    rectContain: rectContain,
    huellaRotada: huellaRotada,
    clampDesplazamiento: clampDesplazamiento,
    zoomAlrededor: zoomAlrededor,
    proyectarInclinado: proyectarInclinado,
    planoDesdePantalla: planoDesdePantalla,
    huellaInclinada: huellaInclinada,
    xCantoObjeto: xCantoObjeto,
    xCantoSol: xCantoSol
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
  if (typeof window !== 'undefined') { window.VLGeometria = API; }
})();
