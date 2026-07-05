/* ============================================================================
   via-lactea-app.js — LÓGICA de la aplicación
   Proyecto: mapa interactivo de la Vía Láctea (Gaia)
   No necesitas editar este archivo. Requiere que antes se hayan cargado
   via-lactea-config.js y via-lactea-datos.js (en ese orden).
   ============================================================================ */

(function () {
  // ---------------------------------------------------------------------------
  // ADAPTADOR DE DATOS
  // La lógica pide "la ficha" de un objeto; este adaptador la resuelve sobre
  // OBSERVACIONES, donde cada objeto tiene una LISTA de observaciones (hoy una;
  // en el futuro, varias de distintos observadores). Cuando quieras un selector
  // de observador, este es el único punto que habrá que ampliar.
  // ---------------------------------------------------------------------------
  function getFicha(id) {
    var lista = (typeof OBSERVACIONES !== 'undefined') ? OBSERVACIONES[id] : null;
    return (lista && lista.length) ? lista[0] : null;
  }


  var viewer = document.getElementById('mw-viewer');
  var img = document.getElementById('mw-content');
  var hint = document.getElementById('mw-hint');

  var scale = 1;
  var minScale = 1;
  var maxScale = 25;
  var posX = 0;
  var posY = 0;
  var rotation = 0; // grados de giro de la vista cenital (0 = orientación base)

  var isDragging = false;
  var startX, startY;
  var startPosX, startPosY;
  var animFrame = null;

  // --------------------------------------------------------------------------
  // CONVERSIÓN PORCENTAJE → PÍXEL ABSOLUTO
  // Con object-fit:contain la imagen renderizada puede no llenar todo el
  // contenedor: hay bandas negras a los lados o arriba/abajo según la
  // relación de aspecto. getImgRect() devuelve el rect de la imagen real
  // dentro del contenedor, y repositionAnchors() convierte los porcentajes
  // data-x/data-y (que son % de la imagen, no del contenedor) a px absolutos
  // dentro del contenedor. Así las posiciones son idénticas en cualquier
  // pantalla o resolución.
  // --------------------------------------------------------------------------
  function getImgRect(imgEl) {
    var cW = img.clientWidth;
    var cH = img.clientHeight;
    var nW = imgEl.naturalWidth  || cW;
    var nH = imgEl.naturalHeight || cH;
    var ratio = nW / nH;
    var rW, rH;
    if (cW / cH > ratio) {
      // el contenedor es más ancho que la imagen: bandas a los lados
      rH = cH;
      rW = cH * ratio;
    } else {
      // el contenedor es más alto que la imagen: bandas arriba/abajo
      rW = cW;
      rH = cW / ratio;
    }
    return {
      left:   (cW - rW) / 2,
      top:    (cH - rH) / 2,
      width:  rW,
      height: rH
    };
  }

  function repositionAnchors() {
    var activeImg = isEdgeView
      ? document.getElementById('mw-image-edge')
      : document.getElementById('mw-image');
    if (!activeImg || !activeImg.naturalWidth) return;

    var r = getImgRect(activeImg);

    // Sol cenital
    var sunTop = document.getElementById('mw-sun-anchor');
    if (sunTop) {
      sunTop.style.left = (r.left + r.width  * (CONFIG.sol.cenital.x / 100)) + 'px';
      sunTop.style.top  = (r.top  + r.height * (CONFIG.sol.cenital.y / 100)) + 'px';
    }
    // Sol de canto
    var sunEdge = document.getElementById('sun-edge-anchor');
    if (sunEdge) {
      sunEdge.style.left = (r.left + r.width  * (CONFIG.sol.canto.x / 100)) + 'px';
      sunEdge.style.top  = (r.top  + r.height * (CONFIG.sol.canto.y / 100)) + 'px';
    }

    // Todos los demás marcadores
    var anchors = img.querySelectorAll('.mw-object-anchor');
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var xPct = parseFloat(a.getAttribute('data-x')) / 100;
      var yPct = parseFloat(a.getAttribute('data-y')) / 100;
      a.style.left = (r.left + r.width  * xPct) + 'px';
      a.style.top  = (r.top  + r.height * yPct) + 'px';
    }
  }

  // --------------------------------------------------------------------------
  // GENERACIÓN AUTOMÁTICA DE MARCADORES (ambas vistas) desde OBJECTS
  // --------------------------------------------------------------------------
  var topAnchors = [document.getElementById('mw-sun-anchor')];
  var edgeAnchors = [document.getElementById('sun-edge-anchor')];

  function hexToRgba(hex, alpha) {
    var r = parseInt(hex.substr(1, 2), 16);
    var g = parseInt(hex.substr(3, 2), 16);
    var b = parseInt(hex.substr(5, 2), 16);
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
  }

  function createMarker(obj, view) {
    var pos = (view === 'edge') ? obj.edge : obj.top;
    var anchor = document.createElement('div');
    anchor.id = obj.id + (view === 'edge' ? '-edge' : '') + '-anchor';
    // Posición inicial en % del contenedor; repositionAnchors() la corrige a px.
    anchor.style.cssText = 'position:absolute;width:0;height:0;' +
      'top:' + pos.y + '%;left:' + pos.x + '%;' +
      (view === 'edge' ? 'display:none;' : '');
    anchor.className = 'mw-object-anchor';
    anchor.setAttribute('data-color', obj.color);
    anchor.setAttribute('data-view', view);
    anchor.setAttribute('data-id', obj.id);
    anchor.setAttribute('data-x', pos.x);
    anchor.setAttribute('data-y', pos.y);

    var scaleEl = document.createElement('div');
    scaleEl.className = 'mw-counter-scale';
    scaleEl.style.cssText = 'position:absolute;top:0;left:0;transform:scale(1);transform-origin:0 0;';

    // Conector (línea-guía) desde el punto real al marcador abanicado.
    // Por defecto sin longitud; sólo se activa si el objeto pertenece a un
    // grupo solapado (ver fanOutClusters más abajo).
    var connector = document.createElement('div');
    connector.className = 'mw-connector';
    connector.style.cssText = 'position:absolute;top:0;left:0;height:1px;width:0;' +
      'background:' + hexToRgba(obj.color, 0.55) + ';transform-origin:0 0;' +
      'pointer-events:none;display:none;';

    // Contenedor del punto+etiqueta, que es lo que se desplaza en abanico.
    var content = document.createElement('div');
    content.className = 'mw-marker-content';
    content.style.cssText = 'position:absolute;top:0;left:0;';

    var dot = document.createElement('div');
    dot.className = 'mw-pdf-dot';
    dot.title = 'Ver ficha de ' + obj.label + ' (PDF)';
    dot.setAttribute('data-pdf', obj.pdf);
    dot.setAttribute('data-title', obj.name);
    dot.setAttribute('data-coords', obj.coords);
    if (obj.ficha) dot.setAttribute('data-ficha', obj.ficha);
    var pd = CONFIG.marcadores.puntoDiametro;
    var ph = (pd / 2).toFixed(1);
    dot.style.cssText = 'position:absolute;width:' + pd + 'px;height:' + pd + 'px;margin:-' + ph + 'px 0 0 -' + ph + 'px;' +
      'border-radius:50%;background:' + obj.color + ';' +
      'box-shadow:0 0 5px 1.5px ' + hexToRgba(obj.color, 0.9) + ';' +
      'pointer-events:auto;cursor:pointer;';

    var label = document.createElement('div');
    label.textContent = obj.label;
    label.style.cssText = 'position:absolute;transform:translate(6px,-6px);' +
      'color:' + obj.color + ';font-family:sans-serif;font-size:' + CONFIG.marcadores.textoTamano + ';font-weight:500;' +
      'text-shadow:0 0 4px rgba(0,0,0,0.9);pointer-events:auto;cursor:pointer;white-space:nowrap;';

    // La etiqueta comparte los mismos atributos que el punto para que al
    // pulsarla dispare exactamente el mismo manejador (openObjectPdf).
    label.setAttribute('data-pdf',    obj.pdf);
    label.setAttribute('data-title',  obj.name);
    label.setAttribute('data-coords', obj.coords);
    if (obj.ficha) label.setAttribute('data-ficha', obj.ficha);
    label.className = 'mw-pdf-dot'; // reutiliza la clase para el listener global

    content.appendChild(dot);
    content.appendChild(label);
    scaleEl.appendChild(connector);
    scaleEl.appendChild(content);
    anchor.appendChild(scaleEl);
    img.appendChild(anchor);
    return anchor;
  }

  OBJECTS.forEach(function (obj) {
    topAnchors.push(createMarker(obj, 'top'));
    edgeAnchors.push(createMarker(obj, 'edge'));
  });

  // --------------------------------------------------------------------------
  // ABANICO DE OBJETOS SOLAPADOS
  // Algunos objetos están casi en el mismo punto real (p. ej. M8 y M20, a la
  // misma distancia y a ~1° de separación: en el mapa caen EXACTAMENTE encima).
  // Para que ambos sean visibles y pulsables sin falsear su posición, esos
  // grupos se "abren en abanico": el punto + etiqueta se desplazan un poco y se
  // dibuja una fina línea-guía desde el punto real (que no se mueve) hasta el
  // marcador desplazado. Así queda claro que comparten ubicación física.
  //
  // En vez de detectar los grupos por un umbral automático (que también
  // agruparía pares simplemente "cercanos" pero distinguibles, como M11/M17 en
  // la vista de canto), se listan AQUÍ los grupos concretos que deben
  // abanicarse. Para añadir otro grupo en el futuro, basta con incluir un array
  // con los id de los objetos que se solapan.
  var FAN_GROUPS = [
    ['m8', 'm20']
  ];

  function fanOutClusters(anchors, view) {
    var RADIUS_PX = 15;     // desplazamiento del marcador en px de pantalla
    FAN_GROUPS.forEach(function (ids) {
      // marcadores de este grupo presentes en la vista actual
      var members = anchors.filter(function (a) {
        return a.getAttribute('data-view') === view &&
               ids.indexOf(a.getAttribute('data-id')) >= 0;
      });
      if (members.length < 2) return;
      members.forEach(function (a, idx) {
        var ang = (-90 + (360 / members.length) * idx) * Math.PI / 180;
        var ox = Math.cos(ang) * RADIUS_PX;
        var oy = Math.sin(ang) * RADIUS_PX;
        a.setAttribute('data-ox', ox);
        a.setAttribute('data-oy', oy);
      });
    });
  }

  fanOutClusters(topAnchors, 'top');
  fanOutClusters(edgeAnchors, 'edge');


  // --------------------------------------------------------------------------
  // NAVEGACIÓN: arrastre, zoom y reseteo
  // --------------------------------------------------------------------------
  function applyTransform() {
    // El giro (solo en vista cenital) rota el contenedor alrededor del núcleo
    // galáctico. Fijamos transform-origin en el punto del núcleo (en px del
    // contenedor) y añadimos rotate() al final para que gire imagen + marcadores
    // juntos manteniendo el pan/zoom.
    var rot = (!isEdgeView) ? rotation : 0;
    if (rot) {
      var activeImg = document.getElementById('mw-image');
      if (activeImg && activeImg.naturalWidth) {
        var r = getImgRect(activeImg);
        var nx = r.left + r.width  * (CONFIG.nucleo.cenital.x / 100);
        var ny = r.top  + r.height * (CONFIG.nucleo.cenital.y / 100);
        img.style.transformOrigin = nx + 'px ' + ny + 'px';
      }
    } else {
      img.style.transformOrigin = 'center center';
    }

    img.style.transform =
      'translate(' + posX + 'px, ' + posY + 'px) scale(' + scale + ')' +
      (rot ? ' rotate(' + rot + 'deg)' : '');

    // Contraescala de los marcadores: al ampliar se encogen un poco en pantalla
    // (no del todo) para no tapar el mapa, manteniéndose legibles y pulsables.
    var counter = Math.pow(scale, -0.9);
    if (counter > 1) counter = 1;
    if (counter < 0.12) counter = 0.12;

    // Contra-rotación: cada marcador (punto + etiqueta) se gira en sentido
    // opuesto al mapa para que los nombres y el Sol se lean siempre horizontales.
    var counterRot = rot ? (' rotate(' + (-rot) + 'deg)') : '';

    var scales = img.querySelectorAll('.mw-counter-scale');
    for (var i = 0; i < scales.length; i++) {
      scales[i].style.transform = 'scale(' + counter + ')' + counterRot;
    }

    // Posiciona el contenido abanicado y su línea-guía en cada marcador.
    var anchors = img.querySelectorAll('.mw-object-anchor');
    for (var k = 0; k < anchors.length; k++) {
      var a = anchors[k];
      var content = a.querySelector('.mw-marker-content');
      var connector = a.querySelector('.mw-connector');
      if (!content) continue;

      var oxPct = parseFloat(a.getAttribute('data-ox'));
      var oyPct = parseFloat(a.getAttribute('data-oy'));
      if (!oxPct && !oyPct) {
        // Sin abanico: contenido en el punto, sin línea.
        content.style.transform = 'translate(0px, 0px)';
        if (connector) connector.style.display = 'none';
        continue;
      }

      // Offset deseado en PÍXELES DE PANTALLA (constante, no depende del zoom).
      // El contenido vive dentro de scaleEl (scale=counter) que a su vez está
      // dentro de img (scale=scale del mapa). Para que en pantalla el marcador
      // se desplace 'screenPx' px, el translate local debe ser
      //   screenPx / (counter * scale).
      var screenPx = oxPct;  // en data-ox guardamos ya el desplazamiento en px
      var screenPy = oyPct;
      var oxPx = screenPx / (counter * scale);
      var oyPx = screenPy / (counter * scale);
      content.style.transform = 'translate(' + oxPx + 'px, ' + oyPx + 'px)';

      if (connector) {
        var len = Math.sqrt(oxPx * oxPx + oyPx * oyPx);
        var angDeg = Math.atan2(oyPx, oxPx) * 180 / Math.PI;
        connector.style.display = 'block';
        connector.style.width = len + 'px';
        connector.style.transform = 'rotate(' + angDeg + 'deg)';
      }
    }
  }

  function clampPosition() {
    var viewerRect = viewer.getBoundingClientRect();
    var activeImg = isEdgeView
      ? document.getElementById('mw-image-edge')
      : document.getElementById('mw-image');
    var r = (activeImg && activeImg.naturalWidth)
      ? getImgRect(activeImg)
      : { width: viewerRect.width, height: viewerRect.height };

    var effW = r.width, effH = r.height;
    // Con la vista girada, la "huella" del contenido rotado es mayor que el
    // rectángulo original. Usamos la caja envolvente del rectángulo rotado
    // para que el clamp no impida ver zonas que sí están dentro del encuadre.
    var rot = (!isEdgeView) ? rotation : 0;
    if (rot) {
      var a = rot * Math.PI / 180;
      var c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
      effW = r.width * c + r.height * s;
      effH = r.width * s + r.height * c;
    }
    var limitX = (effW * scale - viewerRect.width)  / 2;
    var limitY = (effH * scale - viewerRect.height) / 2;
    posX = limitX > 0 ? Math.min(limitX, Math.max(-limitX, posX)) : 0;
    posY = limitY > 0 ? Math.min(limitY, Math.max(-limitY, posY)) : 0;
  }

  function hideHint() {
    if (hint) hint.style.opacity = '0';
  }

  function zoomAt(clientX, clientY, newScale) {
    var rect = viewer.getBoundingClientRect();
    var cx = clientX - rect.left - rect.width / 2;
    var cy = clientY - rect.top - rect.height / 2;

    var ratio = newScale / scale;
    posX = cx - (cx - posX) * ratio;
    posY = cy - (cy - posY) * ratio;
    scale = newScale;

    clampPosition();
    applyTransform();
  }

  viewer.addEventListener('mousedown', function (e) {
    if (overlayOpen()) return;
    // No arrastrar el mapa si el clic se originó en un control de la interfaz
    // superpuesta (buscador, botones, leyenda). Sin esto, el preventDefault()
    // de más abajo impediría enfocar el campo de búsqueda.
    if (e.target.closest &&
        e.target.closest('#mw-search, #mw-toggle-view, #mw-legend, #mw-reset, .mw-ui-control')) {
      return;
    }
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    isDragging = true;
    viewer.style.cursor = 'grabbing';
    startX = e.clientX;
    startY = e.clientY;
    startPosX = posX;
    startPosY = posY;
    hideHint();
    e.preventDefault();
  });

  window.addEventListener('mousemove', function (e) {
    if (!isDragging) return;
    posX = startPosX + (e.clientX - startX);
    posY = startPosY + (e.clientY - startY);
    clampPosition();
    applyTransform();
  });

  window.addEventListener('mouseup', function () {
    isDragging = false;
    viewer.style.cursor = 'grab';
  });

  // --------------------------------------------------------------------------
  // GESTOS TÁCTILES (tablet/móvil)
  //  - 1 dedo: arrastrar para desplazar el mapa.
  //  - 2 dedos: "pellizcar" (pinch) para hacer zoom, centrado entre los dedos,
  //    y arrastrar simultáneamente para desplazar.
  // Los listeners son passive:false para poder llamar a preventDefault() y
  // evitar que el navegador interprete el gesto como scroll de la página.
  // --------------------------------------------------------------------------

  // Devuelve true si CUALQUIER ventana modal (ficha en PDF o ficha interactiva)
  // está abierta. Cuando lo está, el visor ignora todos los gestos para que el
  // dedo controle la ventana (scroll del texto, etc.) y no el mapa de fondo.
  function overlayOpen() {
    var pdfO = document.getElementById('m1-pdf-overlay');
    var fichaO = document.getElementById('ficha-overlay');
    return (pdfO && pdfO.style.display === 'flex') ||
           (fichaO && fichaO.style.display === 'flex');
  }

  var pinchStartDist = 0;     // distancia entre los dos dedos al iniciar el pinch
  var pinchStartScale = 1;    // escala del mapa al iniciar el pinch
  var pinchStartPosX = 0;     // posX del mapa al iniciar el pinch
  var pinchStartPosY = 0;     // posY del mapa al iniciar el pinch
  var pinchAnchorX = 0;       // punto del mapa (sin escala) bajo el punto medio
  var pinchAnchorY = 0;
  var isPinching = false;

  function touchDistance(t1, t2) {
    var dx = t2.clientX - t1.clientX;
    var dy = t2.clientY - t1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function touchMidpoint(t1, t2) {
    return {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2
    };
  }

  viewer.addEventListener('touchstart', function (e) {
    if (overlayOpen()) return;
    // No capturar el gesto si el toque empezó en un control de la interfaz
    // (buscador, botones, leyenda), para que el campo pueda recibir el foco.
    if (e.target.closest &&
        e.target.closest('#mw-search, #mw-toggle-view, #mw-legend, #mw-reset, .mw-ui-control')) {
      return;
    }
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }

    if (e.touches.length === 1) {
      // Arrastre con un dedo
      isPinching = false;
      isDragging = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startPosX = posX;
      startPosY = posY;
      hideHint();
    } else if (e.touches.length === 2) {
      // Inicio de pinch-zoom con dos dedos.
      // Guardamos el estado inicial completo del gesto para calcular en cada
      // movimiento una transformación coherente (sin acumular errores):
      //   - pinchStartDist / pinchStartScale: para la relación de zoom.
      //   - pinchStartPosX/Y: desplazamiento del mapa al empezar.
      //   - pinchAnchorX/Y: punto del MAPA (en coords del contenido, relativas
      //     al centro del visor y SIN escala) que está bajo el punto medio de
      //     los dedos. Ese punto debe permanecer bajo los dedos todo el gesto.
      isPinching = true;
      isDragging = false;
      pinchStartDist = touchDistance(e.touches[0], e.touches[1]);
      pinchStartScale = scale;
      pinchStartPosX = posX;
      pinchStartPosY = posY;

      var rect = viewer.getBoundingClientRect();
      var mid = touchMidpoint(e.touches[0], e.touches[1]);
      // Posición del punto medio respecto al centro del visor (en píxeles).
      var midCX = mid.x - rect.left - rect.width / 2;
      var midCY = mid.y - rect.top - rect.height / 2;
      // Punto del mapa (sin escala) que cae bajo el punto medio.
      pinchAnchorX = (midCX - posX) / scale;
      pinchAnchorY = (midCY - posY) / scale;

      hideHint();
      e.preventDefault();
    }
  }, { passive: false });

  viewer.addEventListener('touchmove', function (e) {
    if (overlayOpen()) return;

    if (isPinching && e.touches.length === 2) {
      e.preventDefault();
      var dist = touchDistance(e.touches[0], e.touches[1]);
      if (pinchStartDist > 0) {
        var targetScale = Math.min(maxScale, Math.max(minScale,
          pinchStartScale * (dist / pinchStartDist)));

        var rect = viewer.getBoundingClientRect();
        var mid = touchMidpoint(e.touches[0], e.touches[1]);
        // Punto medio actual respecto al centro del visor.
        var midCX = mid.x - rect.left - rect.width / 2;
        var midCY = mid.y - rect.top - rect.height / 2;

        // Imponemos que el punto de mapa anclado (pinchAnchor) quede justo bajo
        // el punto medio actual de los dedos, a la nueva escala. De ahí se
        // despeja posX/posY directamente (un solo paso, sin acumular):
        //   midC = pos + anchor * scale  =>  pos = midC - anchor * scale
        scale = targetScale;
        posX = midCX - pinchAnchorX * targetScale;
        posY = midCY - pinchAnchorY * targetScale;

        clampPosition();
        applyTransform();
      }
    } else if (isDragging && e.touches.length === 1) {
      e.preventDefault();
      posX = startPosX + (e.touches[0].clientX - startX);
      posY = startPosY + (e.touches[0].clientY - startY);
      clampPosition();
      applyTransform();
    }
  }, { passive: false });

  viewer.addEventListener('touchend', function (e) {
    if (e.touches.length === 0) {
      // Se han levantado todos los dedos
      isDragging = false;
      isPinching = false;
    } else if (e.touches.length === 1) {
      // Queda un dedo: pasamos de pinch a arrastre con ese dedo
      isPinching = false;
      isDragging = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startPosX = posX;
      startPosY = posY;
    }
  });

  viewer.addEventListener('wheel', function (e) {
    if (overlayOpen()) return;
    e.preventDefault();
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    var factor = e.deltaY > 0 ? 0.85 : 1.18;
    var newScale = Math.min(maxScale, Math.max(minScale, scale * factor));
    zoomAt(e.clientX, e.clientY, newScale);
    hideHint();
  }, { passive: false });

  document.getElementById('mw-zoom-in').addEventListener('click', function () {
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    var rect = viewer.getBoundingClientRect();
    var newScale = Math.min(maxScale, scale * 1.3);
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, newScale);
    hideHint();
  });

  document.getElementById('mw-zoom-out').addEventListener('click', function () {
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    var rect = viewer.getBoundingClientRect();
    var newScale = Math.max(minScale, scale / 1.3);
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, newScale);
  });

  document.getElementById('mw-reset').addEventListener('click', function () {
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    scale = 1;
    posX = 0;
    posY = 0;
    applyTransform();
  });

  setTimeout(hideHint, 6000);

  // --------------------------------------------------------------------------
  // COORDENADAS DEL SOL (clic para mostrar/ocultar)
  // --------------------------------------------------------------------------
  var sunDot = document.getElementById('mw-sun');
  var sunCoords = document.getElementById('mw-sun-coords');
  sunDot.addEventListener('click', function (e) {
    e.stopPropagation();
    sunCoords.style.display = (sunCoords.style.display === 'none') ? 'block' : 'none';
  });

  var sunEdgeDot = document.getElementById('sun-edge-dot');
  var sunEdgeCoords = document.getElementById('sun-edge-coords');
  sunEdgeDot.addEventListener('click', function (e) {
    e.stopPropagation();
    sunEdgeCoords.style.display = (sunEdgeCoords.style.display === 'none') ? 'block' : 'none';
  });

  // --------------------------------------------------------------------------
  // VENTANA MODAL CON LA FICHA PDF DE CADA OBJETO
  // --------------------------------------------------------------------------
  var pdfOverlay = document.getElementById('m1-pdf-overlay');
  var pdfFrame = document.getElementById('m1-pdf-frame');
  var pdfFallback = document.getElementById('m1-pdf-fallback');
  var pdfOpenLink = document.getElementById('m1-pdf-open');
  var pdfCloseBtn = document.getElementById('m1-pdf-close');
  var pdfTitle = document.getElementById('pdf-modal-title');
  var pdfCoords = document.getElementById('pdf-modal-coords');
  var currentPdfUrl = '';

  function openObjectPdf(e) {
    if (e) e.stopPropagation();
    var dot = e.currentTarget;
    var url = dot.getAttribute('data-pdf');
    if (!url) return;

    // Si el objeto tiene ficha interactiva, se abre esta en lugar del PDF
    var fichaId = dot.getAttribute('data-ficha');
    if (fichaId && getFicha(fichaId)) {
      openFicha(fichaId, dot);
      return;
    }

    pdfTitle.textContent = dot.getAttribute('data-title') || '';
    pdfCoords.textContent = dot.getAttribute('data-coords') || '';
    pdfOpenLink.href = url;

    // Solo recarga el iframe si el PDF solicitado es distinto al actual
    if (currentPdfUrl !== url) {
      pdfFrame.setAttribute('src', url + '#view=FitH');
      currentPdfUrl = url;
    }

    // El aviso de respaldo queda DETRÁS del iframe y no bloquea eventos
    pdfFallback.style.display = 'flex';
    pdfOverlay.style.display = 'flex';
    isDragging = false;
    isPinching = false;
    hideHint();
  }

  function closeObjectPdf() {
    pdfOverlay.style.display = 'none';
  }

  // Los marcadores se generaron arriba; registramos sus clics ahora
  var pdfDots = document.querySelectorAll('.mw-pdf-dot');
  for (var i = 0; i < pdfDots.length; i++) {
    pdfDots[i].addEventListener('click', openObjectPdf);
    pdfDots[i].addEventListener('touchend', function (e) {
      e.preventDefault();
      openObjectPdf(e);
    });
  }

  pdfCloseBtn.addEventListener('click', closeObjectPdf);

  pdfOverlay.addEventListener('mousedown', function (e) {
    if (e.target === pdfOverlay) closeObjectPdf();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (pdfOverlay.style.display === 'flex') closeObjectPdf();
      if (fichaOverlay.style.display === 'flex') closeFicha();
    }
  });

  // --------------------------------------------------------------------------
  // FICHA INTERACTIVA: boceto de cada aumento + texto explicativo en HTML.
  //
  // Las imágenes se leen de:  resources/images/<objeto>/<archivo>
  // donde <objeto> es el id de la ficha (p. ej. "m1"). Así, para añadir
  // fichas en el futuro basta con crear resources/images/m2/, m4/, etc.
  // La ruta base de las imágenes se configura en CONFIG.rutas.imagenes
  // (archivo via-lactea-config.js).
  // --------------------------------------------------------------------------
  function imgPath(objeto, archivo) {
    return CONFIG.rutas.imagenes + objeto + '/' + archivo;
  }

  var fichaOverlay = document.getElementById('ficha-overlay');
  var fichaTitle = document.getElementById('ficha-title');
  var fichaCoords = document.getElementById('ficha-coords');
  var fichaPdfLink = document.getElementById('ficha-pdf-link');
  var fichaCloseBtn = document.getElementById('ficha-close');
  var fichaImgTitle = document.getElementById('ficha-img-title');
  var fichaButtons = document.getElementById('ficha-buttons');
  var fichaText = document.getElementById('ficha-text');
  var fichaAnexos = document.getElementById('ficha-anexos');
  var fichaAnexosRight = document.getElementById('ficha-anexos-right');
  var fichaCurrent = -1;

  // El boceto se lee de resources/images/<objeto>/<archivo>. Si la entrada
  // no tiene imagen (img: null, p. ej. "Exploración"), se oculta el área.
  //
  // VARIAS IMÁGENES POR AUMENTO: "img" admite tres formas:
  //   - null                                    -> sin boceto (p. ej. "Exploración")
  //   - 'archivo.webp'                           -> un solo boceto a ancho completo
  //   - [ { archivo, etiqueta }, { ... }, ... ] -> varias imágenes, útil cuando
  //     el objeto no cabe en un solo campo del ocular y se han dibujado varias
  //     regiones a ese aumento. Por defecto se muestran en MOSAICO (paneles
  //     iguales lado a lado, cada uno con su etiqueta debajo).
  //
  // Si además la entrada tiene "imgMode: 'tabs'", en vez de mosaico se muestra
  // una sola imagen grande con un selector de puntos debajo para alternar
  // entre las distintas regiones (útil cuando hay más de 2 imágenes o cuando
  // se prefiere verlas grandes de una en una).
  var fichaImgWrap = document.getElementById('ficha-img-wrap');

  // -------------------------------------------------------------------------
  // FUNDIDO (valores derivados de CONFIG — no tocar)
  // -------------------------------------------------------------------------
  var FADE_MS   = CONFIG.fundido.duracionMs;
  var FADE_CSS  = 'opacity ' + (FADE_MS / 1000) + 's ease';
  var FADE_HALF = Math.round(FADE_MS / 2);

  // ---------------------------------------------------------------------------
  // ZOOM SOBRE LAS IMÁGENES DE LA FICHA (hasta CONFIG.zoomFicha.maximo)
  //  - Rueda del ratón o pellizco con dos dedos: acercar/alejar (centrado en
  //    el cursor o en el punto medio de los dedos).
  //  - Con zoom aplicado, arrastrar con el ratón o con un dedo desplaza la
  //    imagen. Doble clic / doble toque: vuelve al tamaño original.
  //  - A tamaño normal (x1), un dedo sigue desplazando la ficha con normalidad;
  //    solo el pellizco activa el zoom (touch-action: pan-y).
  //  Usa Pointer Events, que unifican ratón y táctil en una sola API.
  // ---------------------------------------------------------------------------
  function makeZoomable(im) {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative; overflow:hidden; touch-action:pan-y; ' +
      'border-radius:6px; max-width:100%; display:flex; align-items:center; ' +
      'justify-content:center; cursor:zoom-in; user-select:none; -webkit-user-select:none;';
    wrap.appendChild(im);

    // CRÍTICO: desactivar el arrastre nativo de imágenes del navegador.
    // Sin esto, al arrastrar con el ratón el navegador inicia su propio
    // "drag & drop" de la imagen y nuestro desplazamiento nunca recibe
    // los eventos.
    im.draggable = false;
    im.style.webkitUserDrag = 'none';
    wrap.addEventListener('dragstart', function (e) { e.preventDefault(); });

    // Indicador discreto de que la imagen admite zoom. Se muestra en la
    // esquina y desaparece la primera vez que el usuario hace zoom.
    var isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    var zoomHint = document.createElement('div');
    zoomHint.textContent = '🔍 ' + (isTouch ? 'Pellizca para ampliar' : 'Rueda para ampliar');
    zoomHint.style.cssText = 'position:absolute; right:8px; bottom:8px; ' +
      'background:rgba(0,0,0,0.55); color:#cfe6ff; font-family:sans-serif; ' +
      'font-size:11px; padding:4px 10px; border-radius:12px; ' +
      'pointer-events:none; opacity:0.85; transition:opacity 0.5s ease; z-index:2;';
    wrap.appendChild(zoomHint);
    var hintHidden = false;
    function hideZoomHint() {
      if (hintHidden) return;
      hintHidden = true;
      zoomHint.style.opacity = '0';
    }

    var MAXZ = CONFIG.zoomFicha.maximo;
    var z = 1, tx = 0, ty = 0;

    function apply() {
      im.style.transform = 'translate(' + tx + 'px, ' + ty + 'px) scale(' + z + ')';
      wrap.style.cursor = z > 1 ? 'grab' : 'zoom-in';
      // A x1 dejamos que un dedo desplace la ficha; ampliada, todos los
      // gestos son nuestros.
      wrap.style.touchAction = z > 1 ? 'none' : 'pan-y';
      if (z > 1) hideZoomHint();
    }

    function clampPan() {
      var r = wrap.getBoundingClientRect();
      var limX = r.width  * (z - 1) / 2;
      var limY = r.height * (z - 1) / 2;
      tx = Math.max(-limX, Math.min(limX, tx));
      ty = Math.max(-limY, Math.min(limY, ty));
    }

    function zoomAtPoint(clientX, clientY, newZ) {
      newZ = Math.max(1, Math.min(MAXZ, newZ));
      var r = wrap.getBoundingClientRect();
      var cx = clientX - r.left - r.width / 2;
      var cy = clientY - r.top  - r.height / 2;
      // Punto de la imagen (sin escala) bajo el cursor: debe permanecer ahí.
      var px = (cx - tx) / z;
      var py = (cy - ty) / z;
      z = newZ;
      tx = cx - px * z;
      ty = cy - py * z;
      clampPan();
      apply();
    }

    function reset() { z = 1; tx = 0; ty = 0; apply(); }
    im._resetZoom = reset;

    // Rueda del ratón: zoom centrado en el cursor
    wrap.addEventListener('wheel', function (e) {
      e.preventDefault();
      var factor = e.deltaY > 0 ? 0.85 : 1.18;
      zoomAtPoint(e.clientX, e.clientY, z * factor);
    }, { passive: false });

    // Doble clic / doble toque: restablecer
    wrap.addEventListener('dblclick', function (e) {
      e.preventDefault();
      reset();
    });

    // Pointer Events: ratón y táctil unificados
    var pointers = new Map();
    var pinchStart = 0, pinchZ = 1;
    var panStartX = 0, panStartY = 0, panTx = 0, panTy = 0;

    wrap.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') e.preventDefault(); // evita selección/drag nativo
      wrap.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        panStartX = e.clientX; panStartY = e.clientY;
        panTx = tx; panTy = ty;
        if (z > 1) wrap.style.cursor = 'grabbing';
      } else if (pointers.size === 2) {
        var pts = Array.from(pointers.values());
        pinchStart = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        pinchZ = z;
      }
    });

    wrap.addEventListener('pointermove', function (e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      var pts = Array.from(pointers.values());

      if (pointers.size === 2 && pinchStart > 0) {
        // Pellizco: zoom centrado en el punto medio de los dedos
        e.preventDefault();
        var dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        var midX = (pts[0].x + pts[1].x) / 2;
        var midY = (pts[0].y + pts[1].y) / 2;
        zoomAtPoint(midX, midY, pinchZ * (dist / pinchStart));
      } else if (pointers.size === 1 && z > 1) {
        // Arrastre con la imagen ampliada
        e.preventDefault();
        tx = panTx + (e.clientX - panStartX);
        ty = panTy + (e.clientY - panStartY);
        clampPan();
        apply();
      }
    });

    function releasePointer(e) {
      pointers.delete(e.pointerId);
      if (pointers.size === 1) {
        // De pellizco a arrastre con el puntero restante
        var rest = Array.from(pointers.values())[0];
        panStartX = rest.x; panStartY = rest.y;
        panTx = tx; panTy = ty;
        pinchStart = 0;
      } else if (pointers.size === 0) {
        pinchStart = 0;
        if (z > 1) wrap.style.cursor = 'grab';
      }
    }
    wrap.addEventListener('pointerup', releasePointer);
    wrap.addEventListener('pointercancel', releasePointer);

    return wrap;
  }

  function renderImgMosaic(f, entry, imgs) {
    fichaImgWrap.style.flexDirection = 'row';
    imgs.forEach(function (item) {
      var panel = document.createElement('div');
      panel.style.cssText = 'flex:1; min-width:0; display:flex; flex-direction:column; align-items:center; gap:6px;';

      var im = document.createElement('img');
      im.src = imgPath(f._id, item.archivo);
      im.alt = 'Boceto de ' + f._id.toUpperCase() + ' — ' + entry.titulo + (item.etiqueta ? ' (' + item.etiqueta + ')' : '');
      im.style.cssText = 'display:block; max-width:100%; max-height:56vh; border-radius:6px; box-shadow:0 2px 14px rgba(0,0,0,0.6); background:transparent;';
      im.style.transition = FADE_CSS;
      panel.appendChild(makeZoomable(im));

      if (item.etiqueta) {
        var cap = document.createElement('div');
        cap.textContent = item.etiqueta;
        cap.style.cssText = 'color:#9fb6c9; font-size:12px; text-align:center; font-family:sans-serif;';
        panel.appendChild(cap);
      }

      fichaImgWrap.appendChild(panel);
    });
  }

  function renderImgTabs(f, entry, imgs) {
    fichaImgWrap.style.flexDirection = 'column';

    var im = document.createElement('img');
    im.style.cssText = 'display:block; max-width:100%; max-height:52vh; border-radius:6px; box-shadow:0 2px 14px rgba(0,0,0,0.6); background:transparent;';
    im.style.transition = FADE_CSS;
    fichaImgWrap.appendChild(makeZoomable(im));

    var cap = document.createElement('div');
    cap.style.cssText = 'color:#9fb6c9; font-size:12px; text-align:center; font-family:sans-serif; min-height:1.2em;';
    fichaImgWrap.appendChild(cap);

    var dots = document.createElement('div');
    dots.style.cssText = 'display:flex; gap:10px; justify-content:center; padding-top:2px;';
    fichaImgWrap.appendChild(dots);

    var dotEls = [];
    var loadToken = 0; // evita que una carga lenta antigua pise a una más reciente

    function show(active) {
      var item = imgs[active];
      var nextSrc = imgPath(f._id, item.archivo);
      var nextAlt = 'Boceto de ' + f._id.toUpperCase() + ' — ' + entry.titulo + (item.etiqueta ? ' (' + item.etiqueta + ')' : '');

      // Actualizamos punto activo y leyenda de inmediato.
      cap.textContent = item.etiqueta || '';
      for (var i = 0; i < dotEls.length; i++) {
        var on = (i === active);
        dotEls[i].style.background = on ? '#7ec8ff' : 'rgba(255,255,255,0.25)';
        dotEls[i].style.boxShadow = on ? '0 0 4px 1px rgba(126,200,255,0.9)' : 'none';
      }

      // Primera carga: sin fundido, mostramos directamente.
      if (!im.src) {
        im.src = nextSrc;
        im.alt = nextAlt;
        return;
      }
      if (im.src === nextSrc) return; // ya es la imagen mostrada

      // Precargamos la nueva imagen; solo cuando está lista la intercambiamos
      // con un breve fundido, de modo que nunca se vea un hueco vacío.
      var myToken = ++loadToken;
      var pre = new Image();
      pre.onload = function () {
        if (myToken !== loadToken) return; // hubo un clic posterior; ignoramos
        im.style.opacity = '0';
        setTimeout(function () {
          if (myToken !== loadToken) return;
          if (im._resetZoom) im._resetZoom(); // la nueva imagen entra sin zoom
          im.src = nextSrc;
          im.alt = nextAlt;
          im.style.opacity = '1';
        }, FADE_HALF);
      };
      pre.src = nextSrc;
    }

    imgs.forEach(function (item, i) {
      var dot = document.createElement('div');
      dot.title = item.etiqueta || ('Imagen ' + (i + 1) + ' de ' + imgs.length);
      dot.style.cssText = 'width:11px; height:11px; border-radius:50%; cursor:pointer; background:rgba(255,255,255,0.25); transition: background 0.15s, box-shadow 0.15s;';
      dot.addEventListener('click', function () { show(i); });
      dots.appendChild(dot);
      dotEls.push(dot);
    });

    show(0);
  }

  // Asegura una transición de opacidad en el contenedor de imágenes para que
  // el cambio de aumento se vea como un fundido y no como un parpadeo.
  fichaImgWrap.style.transition = FADE_CSS;

  function buildFichaImgs(f, entry, imgs) {
    if (entry.imgMode === 'tabs' && imgs.length > 1) {
      renderImgTabs(f, entry, imgs);
    } else {
      renderImgMosaic(f, entry, imgs);
    }
  }

  function renderFichaEntry(f, idx) {
    var entry = f.entries[idx];

    var imgs = [];
    if (Array.isArray(entry.img)) {
      imgs = entry.img;
    } else if (entry.img) {
      imgs = [{ archivo: entry.img }];
    }

    if (!imgs.length) {
      fichaImgWrap.innerHTML = '';
      fichaImgWrap.style.display = 'none';
      return;
    }
    fichaImgWrap.style.display = 'flex';

    // Precargamos TODAS las imágenes del nuevo aumento y solo sustituimos el
    // contenido cuando ya están listas, con un breve fundido. Así la imagen
    // anterior permanece visible hasta el último momento (sin hueco vacío).
    var token = (fichaImgWrap._renderToken || 0) + 1;
    fichaImgWrap._renderToken = token;

    var sources = imgs.map(function (it) { return imgPath(f._id, it.archivo); });
    var pending = sources.length;
    var done = false;

    function swap() {
      if (done) return;
      done = true;
      if (fichaImgWrap._renderToken !== token) return; // llegó otro clic
      fichaImgWrap.style.opacity = '0';
      setTimeout(function () {
        if (fichaImgWrap._renderToken !== token) return;
        fichaImgWrap.innerHTML = '';
        buildFichaImgs(f, entry, imgs);
        fichaImgWrap.style.opacity = '1';
      }, FADE_HALF);
    }

    // Si la primera vez no hay imagen previa, pintamos directamente.
    if (!fichaImgWrap.firstChild) {
      buildFichaImgs(f, entry, imgs);
      return;
    }

    // Salvaguarda: si alguna imagen tarda demasiado, hacemos el cambio igualmente.
    var safety = setTimeout(swap, FADE_MS + 600);

    sources.forEach(function (src) {
      var pre = new Image();
      pre.onload = pre.onerror = function () {
        pending--;
        if (pending <= 0) { clearTimeout(safety); swap(); }
      };
      pre.src = src;
    });
  }

  function selectFichaEntry(f, idx) {
    fichaCurrent = idx;
    var entry = f.entries[idx];
    if (entry.img) {
      fichaImgTitle.textContent = entry.titulo + ' (' + entry.boton + ')';
      fichaImgTitle.style.display = '';
    } else {
      fichaImgTitle.style.display = 'none';
    }
    fichaText.innerHTML = entry.html;
    fichaText.scrollTop = 0;

    // estilo activo/inactivo de la botonera
    var btns = fichaButtons.children;
    for (var i = 0; i < btns.length; i++) {
      var on = (i === idx);
      btns[i].style.background = on ? 'rgba(126,200,255,0.85)' : 'rgba(126,200,255,0.12)';
      btns[i].style.color = on ? '#0b0e14' : '#cfe6f7';
      btns[i].style.fontWeight = on ? '700' : '400';
    }
    renderFichaEntry(f, idx);
    renderAnexos(f, idx);
  }

  // ANEXOS: cada entrada de OBSERVACIONES puede incluir un array "anexos" con
  // imágenes adicionales (capturas, recortes anotados, etc.) que se
  // muestran junto al boceto/texto. Cada anexo es:
  //   { img: 'archivo.webp', titulo: 'Texto descriptivo (opcional)', pos: 'right'|'bottom' }
  // - pos: 'right'  -> se coloca en una columna extra a la derecha del texto.
  // - pos: 'bottom' (o sin indicar) -> se coloca debajo, a todo lo ancho.
  // Las imágenes se leen de resources/images/<objeto>/<archivo>, igual
  // que el boceto principal. Pulsando sobre un anexo se abre a tamaño
  // completo en una pestaña nueva.
  function buildAnexoEl(f, anexo) {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;max-width:100%;';

    var im = document.createElement('img');
    im.src = imgPath(f._id, anexo.img);
    im.alt = anexo.titulo || (f._id.toUpperCase() + ' - anexo');
    im.style.cssText = 'display:block;max-width:100%;max-height:38vh;border-radius:6px;' +
      'box-shadow:0 2px 14px rgba(0,0,0,0.6);cursor:zoom-in;';
    im.addEventListener('click', function () { window.open(im.src, '_blank'); });
    wrap.appendChild(im);

    if (anexo.titulo) {
      var cap = document.createElement('div');
      cap.textContent = anexo.titulo;
      cap.style.cssText = 'color:#9fb6c9;font-size:12px;text-align:center;';
      wrap.appendChild(cap);
    }
    return wrap;
  }

  function renderAnexos(f, idx) {
    var entry = f.entries[idx];
    fichaAnexos.innerHTML = '';
    fichaAnexosRight.innerHTML = '';

    var bottomAnexos = [];
    var rightAnexos = [];
    (entry.anexos || []).forEach(function (anexo) {
      if (anexo.pos === 'right') {
        rightAnexos.push(anexo);
      } else {
        bottomAnexos.push(anexo);
      }
    });

    bottomAnexos.forEach(function (anexo) {
      fichaAnexos.appendChild(buildAnexoEl(f, anexo));
    });
    fichaAnexos.style.display = bottomAnexos.length ? 'flex' : 'none';

    rightAnexos.forEach(function (anexo) {
      fichaAnexosRight.appendChild(buildAnexoEl(f, anexo));
    });
    fichaAnexosRight.style.display = rightAnexos.length ? 'flex' : 'none';
  }

  function buildFichaButtons(f) {
    fichaButtons.innerHTML = '';
    f.entries.forEach(function (entry, idx) {
      var b = document.createElement('button');
      b.textContent = entry.boton;
      b.style.cssText = 'border:1px solid rgba(126,200,255,0.4);border-radius:14px;' +
        'padding:5px 11px;font-size:12px;font-family:sans-serif;cursor:pointer;' +
        'background:rgba(126,200,255,0.12);color:#cfe6f7;';
      b.addEventListener('click', function () { selectFichaEntry(f, idx); });
      fichaButtons.appendChild(b);
    });
  }

  function openFicha(id, dot) {
    var f = getFicha(id);
    f._id = id;
    fichaTitle.textContent = dot.getAttribute('data-title') || '';
    fichaCoords.textContent = dot.getAttribute('data-coords') || '';
    fichaPdfLink.href = f.pdf;
    buildFichaButtons(f);
    fichaOverlay.style.display = 'flex';
    isDragging = false;
    isPinching = false;
    hideHint();
    selectFichaEntry(f, f.defaultIndex || 0);
  }

  function closeFicha() {
    fichaOverlay.style.display = 'none';
  }

  fichaCloseBtn.addEventListener('click', closeFicha);
  fichaOverlay.addEventListener('mousedown', function (e) {
    if (e.target === fichaOverlay) closeFicha();
  });

  // --------------------------------------------------------------------------
  // CAMBIO ENTRE VISTA CENITAL Y VISTA DE CANTO + FILTRO POR TIPO (leyenda)
  // --------------------------------------------------------------------------
  var imgTop = document.getElementById('mw-image');
  var imgEdge = document.getElementById('mw-image-edge');
  var toggleBtn = document.getElementById('mw-toggle-view');
  var isEdgeView = false;

  // Colores (tipos de objeto) actualmente ocultados desde la leyenda
  var hiddenColors = {};

  // Decide la visibilidad de cada ancla según la vista activa y el filtro.
  // El Sol (sin data-color) sólo depende de la vista.
  function refreshAnchors() {
    var currentView = isEdgeView ? 'edge' : 'top';
    // El Sol (sin data-color) sólo depende de la vista
    var sunTop = document.getElementById('mw-sun-anchor');
    var sunEdge = document.getElementById('sun-edge-anchor');
    if (sunTop) sunTop.style.display = isEdgeView ? 'none' : '';
    if (sunEdge) sunEdge.style.display = isEdgeView ? '' : 'none';

    var objs = img.querySelectorAll('.mw-object-anchor');
    for (var i = 0; i < objs.length; i++) {
      var a = objs[i];
      var inView = a.getAttribute('data-view') === currentView;
      var typeHidden = !!hiddenColors[a.getAttribute('data-color')];
      a.style.display = (inView && !typeHidden) ? '' : 'none';
    }
  }

  toggleBtn.addEventListener('click', function () {
    isEdgeView = !isEdgeView;
    if (isEdgeView) {
      imgTop.style.display = 'none';
      imgEdge.style.display = 'block';
      imgEdge.style.position = 'absolute';
      toggleBtn.textContent = '🔄 Vista cenital';
    } else {
      imgTop.style.display = 'block';
      imgTop.style.position = 'absolute';
      imgEdge.style.display = 'none';
      toggleBtn.textContent = '🔄 Vista de canto';
    }
    refreshAnchors();
    repositionAnchors();

    // El giro solo tiene sentido en la vista cenital: ocultamos el control
    // en la de canto (el valor de rotación se conserva para cuando se vuelva).
    var rotControl = document.getElementById('mw-rotate-control');
    if (rotControl) rotControl.style.display = isEdgeView ? 'none' : 'flex';

    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    scale = 1;
    posX = 0;
    posY = 0;
    applyTransform();
    hideHint();
  });

  // Reposicionar cuando carga cada imagen (la cenital es remota y puede tardar)
  [imgTop, imgEdge].forEach(function (el) {
    if (!el) return;
    if (el.complete && el.naturalWidth) {
      repositionAnchors();
    } else {
      el.addEventListener('load', function () { repositionAnchors(); });
    }
  });

  // Reposicionar al redimensionar la ventana (cambia el tamaño del visor)
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      repositionAnchors();
      clampPosition();
      applyTransform();
    }, 80);
  });

  // Leyenda interactiva: pulsar un tipo lo oculta/muestra en el mapa.
  // El tipo oculto se muestra atenuado y tachado en la leyenda.
  var legendItems = document.querySelectorAll('.mw-legend-item');
  for (var li = 0; li < legendItems.length; li++) {
    legendItems[li].addEventListener('click', function () {
      var color = this.getAttribute('data-color');
      var nowHidden = !hiddenColors[color];
      hiddenColors[color] = nowHidden;

      // Estilo de la fila en la leyenda
      var textEl = this.querySelector('.mw-legend-text');
      this.style.opacity = nowHidden ? '0.4' : '1';
      if (textEl) textEl.style.textDecoration = nowHidden ? 'line-through' : 'none';

      refreshAnchors();
    });
  }

  // ===========================================================================
  // BUSCADOR DE OBJETOS
  //   - Centra el mapa en el objeto y aplica el zoom configurado.
  //   - Hace parpadear su punto y su etiqueta durante unos segundos.
  //   - Si no existe, muestra un aviso temporal (pop-up) que se autocierra.
  // ===========================================================================
  var searchInput = document.getElementById('mw-search');
  var searchToast = document.getElementById('mw-search-toast');
  var toastTimer = null;
  var blinkTimer = null;

  // Índice color → fila de la leyenda, para poder reactivar un tipo desde la
  // búsqueda (restaurar su estilo y leer su nombre legible).
  var legendByColor = {};
  for (var lk = 0; lk < legendItems.length; lk++) {
    legendByColor[legendItems[lk].getAttribute('data-color')] = legendItems[lk];
  }

  // Si el tipo (color) del objeto está oculto, lo vuelve a mostrar: actualiza
  // el filtro, restaura la fila de la leyenda y refresca el mapa. Devuelve el
  // nombre legible del tipo si hubo que reactivarlo, o null si ya era visible.
  function revealTypeIfHidden(color) {
    if (!hiddenColors[color]) return null;
    hiddenColors[color] = false;

    var fila = legendByColor[color];
    var nombreTipo = 'este tipo de objeto';
    if (fila) {
      fila.style.opacity = '1';
      var textEl = fila.querySelector('.mw-legend-text');
      if (textEl) {
        textEl.style.textDecoration = 'none';
        nombreTipo = textEl.textContent.trim();
      }
    }
    refreshAnchors();
    return nombreTipo;
  }

  // Normaliza un texto para comparar: minúsculas, sin acentos, sin espacios
  // ni signos, para que "M 13", "m13" y "M13" se consideren iguales.
  function normalize(s) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
      .replace(/[^a-z0-9]/g, '');                        // quita espacios/signos
  }

  // Construye un índice de búsqueda a partir de OBJECTS (id, label y nombre).
  var searchIndex = OBJECTS.map(function (o) {
    return {
      obj: o,
      claves: [normalize(o.id), normalize(o.label), normalize(o.name)]
    };
  });

  function findObject(query) {
    var q = normalize(query);
    if (!q) return null;
    // 1) coincidencia exacta por id o label
    for (var i = 0; i < searchIndex.length; i++) {
      if (searchIndex[i].claves.indexOf(q) >= 0) return searchIndex[i].obj;
    }
    // 2) coincidencia por comienzo del nombre completo (p. ej. "cangrejo")
    for (var j = 0; j < searchIndex.length; j++) {
      var nombre = normalize(searchIndex[j].obj.name);
      if (nombre.indexOf(q) >= 0) return searchIndex[j].obj;
    }
    return null;
  }

  function showToast(mensaje) {
    if (!searchToast) return;
    searchToast.textContent = mensaje;
    searchToast.style.opacity = '1';
    searchToast.style.transform = 'translate(-50%, 0)';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      searchToast.style.opacity = '0';
      searchToast.style.transform = 'translate(-50%, -14px)';
    }, CONFIG.busqueda.avisoSegundos * 1000);
  }

  // Centra el mapa en un ancla concreta (posición en % de la imagen) y aplica
  // el zoom pedido. Reutiliza la misma geometría que repositionAnchors().
  function centerOnAnchor(xPct, yPct, targetScale) {
    var activeImg = isEdgeView
      ? document.getElementById('mw-image-edge')
      : document.getElementById('mw-image');
    if (!activeImg || !activeImg.naturalWidth) return;

    var r = getImgRect(activeImg);
    var W = img.clientWidth, H = img.clientHeight;
    // Posición del objeto en px dentro del contenedor.
    var ax = r.left + r.width  * (xPct / 100);
    var ay = r.top  + r.height * (yPct / 100);

    // Si la vista está girada, el objeto aparece rotado alrededor del núcleo:
    // aplicamos la misma rotación al punto antes de calcular el desplazamiento.
    var rot = (!isEdgeView) ? rotation : 0;
    if (rot) {
      var nx = r.left + r.width  * (CONFIG.nucleo.cenital.x / 100);
      var ny = r.top  + r.height * (CONFIG.nucleo.cenital.y / 100);
      var a = rot * Math.PI / 180;
      var dx = ax - nx, dy = ay - ny;
      ax = nx + dx * Math.cos(a) - dy * Math.sin(a);
      ay = ny + dx * Math.sin(a) + dy * Math.cos(a);
    }

    scale = Math.min(maxScale, Math.max(minScale, targetScale));
    // Para que (ax,ay) quede en el centro del visor:
    //   posición_en_pantalla = (ax - W/2) * scale + posX = 0  →  posX = -(ax-W/2)*scale
    posX = -(ax - W / 2) * scale;
    posY = -(ay - H / 2) * scale;

    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    clampPosition();
    applyTransform();
  }

  // Aplica un parpadeo temporal al punto y la etiqueta de un objeto.
  function blinkObject(objId) {
    // Localiza el ancla de la vista activa (los de canto llevan sufijo -edge).
    var anchorId = objId + (isEdgeView ? '-edge' : '') + '-anchor';
    var anchor = document.getElementById(anchorId);
    if (!anchor) return;
    var dot = anchor.querySelector('.mw-pdf-dot');           // el punto
    var content = anchor.querySelector('.mw-marker-content'); // punto+etiqueta

    // Cancela un parpadeo anterior si lo hubiera.
    if (blinkTimer) { clearInterval(blinkTimer.iv); clearTimeout(blinkTimer.to);
      if (blinkTimer.content) blinkTimer.content.style.visibility = 'visible'; }

    var visible = true;
    var iv = setInterval(function () {
      visible = !visible;
      if (content) content.style.visibility = visible ? 'visible' : 'hidden';
    }, 450);
    var to = setTimeout(function () {
      clearInterval(iv);
      if (content) content.style.visibility = 'visible';
      blinkTimer = null;
    }, CONFIG.busqueda.parpadeoSegundos * 1000);

    blinkTimer = { iv: iv, to: to, content: content };
  }

  function doSearch() {
    var obj = findObject(searchInput.value);
    if (!obj) {
      showToast('Ese objeto no ha sido observado o no pertenece a la Vía Láctea.');
      return;
    }
    hideHint();

    // Si el tipo de este objeto estaba oculto por el filtro de la leyenda,
    // lo reactivamos (si no, el objeto seguiría invisible) y avisamos.
    var tipoReactivado = revealTypeIfHidden(obj.color);
    if (tipoReactivado) {
      showToast('Se ha reactivado la visualización de: ' + tipoReactivado + '.');
    }

    var pos = isEdgeView ? obj.edge : obj.top;
    centerOnAnchor(pos.x, pos.y, CONFIG.busqueda.zoom);
    // El parpadeo se lanza tras un instante para que el centrado ya esté hecho.
    setTimeout(function () { blinkObject(obj.id); }, 60);
  }

  if (searchInput) {
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
    });
    // Evita que al interactuar con el campo se disparen los gestos del visor,
    // y garantiza el foco al tocar/pulsar en ratón y en pantallas táctiles.
    ['mousedown', 'touchstart', 'pointerdown', 'click'].forEach(function (ev) {
      searchInput.addEventListener(ev, function (e) {
        e.stopPropagation();
        searchInput.focus();
      });
    });
  }

  // ===========================================================================
  // CONTROL DE GIRO DE LA VISTA CENITAL
  // El deslizador fija el ángulo (0-360°); el mapa rota alrededor del núcleo
  // galáctico y las etiquetas se mantienen horizontales (ver applyTransform).
  // ===========================================================================
  var rotateInput = document.getElementById('mw-rotate');
  var rotateValue = document.getElementById('mw-rotate-value');
  var rotateReset = document.getElementById('mw-rotate-reset');

  function setRotation(deg) {
    rotation = ((deg % 360) + 360) % 360; // normaliza a 0-360
    if (rotateInput) rotateInput.value = rotation;
    if (rotateValue) rotateValue.textContent = Math.round(rotation) + '°';
    applyTransform();
  }

  if (rotateInput) {
    rotateInput.addEventListener('input', function () {
      setRotation(parseFloat(rotateInput.value) || 0);
    });
  }
  if (rotateReset) {
    rotateReset.addEventListener('click', function () { setRotation(0); });
  }

  applyTransform();
  repositionAnchors();
})();
