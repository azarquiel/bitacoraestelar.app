/* ============================================================================
   via-lactea-app.js — LÓGICA de la aplicación
   Proyecto: mapa interactivo de la Vía Láctea (Gaia)
   No necesitas editar este archivo. Requiere que antes se hayan cargado
   via-lactea-config.js y via-lactea-datos.js (en ese orden).
   ============================================================================ */

(function () {
  // ---------------------------------------------------------------------------
  // ADAPTADOR DE DATOS DE OBSERVADORES
  // La resolución de "la ficha" de un objeto y el observador activo del filtro
  // viven en via-lactea-observadores.js (window.VLObservadores), cargado antes
  // que este archivo. Aquí solo se consume esa interfaz a través de VLO.
  // ---------------------------------------------------------------------------
  var VLO = window.VLObservadores;


  var viewer = document.getElementById('mw-viewer');
  var img = document.getElementById('mw-content');
  var hint = document.getElementById('mw-hint');

  var scale = 1;
  // El zoom out puede bajar de 1 para hacer el tránsito al Grupo Local (atlas).
  // El límite inferior lo marca CONFIG.grupoLocal.escalaMinima (ver config).
  var minScale = (window.CONFIG && CONFIG.grupoLocal && CONFIG.grupoLocal.escalaMinima) || 1;
  var maxScale = 25;
  // Tope de zoom ELEVADO cuando el Sol está centrado (para entrar al vecindario
  // solar). effMaxScale() lo aplica solo en ese caso; fuera de ahí rige maxScale.
  var MAXSCALE_VECINDARIO = (window.CONFIG && CONFIG.vecindario && CONFIG.vecindario.zoomMaximo) || 6500;
  var posX = 0;
  var posY = 0;
  var rotation = 0; // grados de giro de la vista cenital (0 = orientación base)
  var edgePlaneRotation = 0; // giro en el plano de pantalla de la vista de canto
                             // (opción experimental: CONFIG.giros.giroPlanoCanto)

  // Giro en plano vigente según la vista activa. La vista de canto solo gira
  // en plano si el interruptor CONFIG.giros.giroPlanoCanto está activado.
  function currentPlaneRotation() {
    if (isEdgeView) {
      return (CONFIG.giros && CONFIG.giros.giroPlanoCanto) ? edgePlaneRotation : 0;
    }
    return rotation;
  }

  // Punto del núcleo (centro de giro) de la vista activa, en % de la imagen.
  function currentNucleo() {
    return isEdgeView ? CONFIG.nucleo.canto : CONFIG.nucleo.cenital;
  }

  // --------------------------------------------------------------------------
  // ROTACIÓN AZIMUTAL DE LA VISTA DE CANTO
  // edgeRotation gira el PUNTO DE VISTA alrededor del eje polar de la galaxia:
  // los marcadores se reproyectan según su posición 3D real, mientras la imagen
  // de fondo se mantiene (aprox. válida: un disco de canto es casi igual desde
  // cualquier azimut). Las coordenadas galácticas (l, b, d) de cada objeto se
  // extraen una única vez de su campo "coords".
  // --------------------------------------------------------------------------
  var edgeRotation = 0; // grados de azimut (0 = punto de vista original)
  var GAL = {};         // id -> { l, b, d } en grados y años luz
  (function buildGalIndex() {
    var re = /l ≈ ([-+\d,.]+)°,\s*b ≈ ([-+\d,.]+)°.*?~([\d.]+)\s*años/;
    for (var i = 0; i < OBJECTS.length; i++) {
      var m = re.exec(OBJECTS[i].coords || '');
      if (m) {
        GAL[OBJECTS[i].id] = {
          l: parseFloat(m[1].replace(',', '.')),
          b: parseFloat(m[2].replace(',', '.')),
          d: parseFloat(m[3].split('.').join(''))
        };
      }
    }
  })();

  // Posición horizontal (en % de la imagen) de un objeto en la vista de canto
  // para un azimut dado. Geometría: u apunta del Sol al núcleo, v es la
  // perpendicular en el plano; el núcleo está fijo en x=50 y todo gira a su
  // alrededor. En phi=0 reproduce exactamente las posiciones del archivo.
  function edgeXAt(g, phiDeg) {
    var S = 100 / CONFIG.fisica.anchoImagenAl;
    var R0 = CONFIG.fisica.distanciaSolNucleoAl;
    var a = phiDeg * Math.PI / 180;
    var lr = g.l * Math.PI / 180;
    var cb = Math.cos(g.b * Math.PI / 180);
    var u = g.d * cb * Math.cos(lr);
    var v = g.d * cb * Math.sin(lr);
    return 50 + S * ((u - R0) * Math.cos(a) + v * Math.sin(a));
  }

  // Posición horizontal del Sol en la vista de canto para un azimut dado
  // (el Sol orbita el núcleo a distancia R0).
  function sunEdgeXAt(phiDeg) {
    var S = 100 / CONFIG.fisica.anchoImagenAl;
    var R0 = CONFIG.fisica.distanciaSolNucleoAl;
    return 50 - S * R0 * Math.cos(phiDeg * Math.PI / 180);
  }

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
    // Sol de canto (su x depende del azimut: orbita el núcleo)
    var sunEdge = document.getElementById('sun-edge-anchor');
    if (sunEdge) {
      var sunEdgeX = (edgeRotation !== 0)
        ? sunEdgeXAt(edgeRotation)
        : CONFIG.sol.canto.x;
      sunEdge.style.left = (r.left + r.width  * (sunEdgeX / 100)) + 'px';
      sunEdge.style.top  = (r.top  + r.height * (CONFIG.sol.canto.y / 100)) + 'px';
    }

    // Todos los demás marcadores
    var anchors = img.querySelectorAll('.mw-object-anchor');
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var xPct;
      // En la vista de canto con azimut girado, la x se reproyecta desde las
      // coordenadas galácticas reales; la altura (y) no cambia con el azimut.
      if (a.getAttribute('data-view') === 'edge' && edgeRotation !== 0) {
        var g = GAL[a.getAttribute('data-id')];
        xPct = g ? edgeXAt(g, edgeRotation) / 100
                 : parseFloat(a.getAttribute('data-x')) / 100;
      } else {
        xPct = parseFloat(a.getAttribute('data-x')) / 100;
      }
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

  // ¿Debe verse el marcador del objeto con el filtro de observador actual?
  // Visible si el activo lo observó ('propia') o si lo observaron otros y la
  // funcionalidad de descubrimiento está activa ('ajena', se pinta atenuado).
  function objetoVisiblePorObservador(slug) {
    return VLO.estadoObservador(slug) !== 'ninguna';
  }

  // Aplica el filtro de observador. Delega en refreshAnchors(), que combina los
  // tres filtros (vista + tipo + observador) sobre los marcadores de la vista
  // activa; así el filtro nunca revela el marcador de la otra vista.
  function aplicarFiltroObservador() {
    refreshAnchors();
    // El atlas del Grupo Local atenúa por su cuenta las galaxias no observadas.
    if (typeof GrupoLocal !== 'undefined' && GrupoLocal.setObservador) {
      GrupoLocal.setObservador(VLO.getActivo(), VLO.observacionesAjenasActivo());
    }
  }

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
    // El giro en plano rota el contenedor alrededor del núcleo galáctico de la
    // vista activa (cenital siempre disponible; canto solo si el interruptor
    // CONFIG.giros.giroPlanoCanto está activo). Fijamos transform-origin en el
    // punto del núcleo y añadimos rotate() al final para que gire imagen +
    // marcadores juntos manteniendo el pan/zoom.
    var rot = currentPlaneRotation();
    if (rot) {
      var activeImg = document.getElementById(isEdgeView ? 'mw-image-edge' : 'mw-image');
      if (activeImg && activeImg.naturalWidth) {
        var r = getImgRect(activeImg);
        var nuc = currentNucleo();
        var nx = r.left + r.width  * (nuc.x / 100);
        var ny = r.top  + r.height * (nuc.y / 100);
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
    // Nota: NO se pone suelo a counter. Como el marcador vive dentro de #mw-content
    // (escalado por scale), su tamaño aparente es counter·scale = scale^0.1; un
    // suelo en counter (p. ej. 0.12) haría crecer el marcador linealmente con el
    // zoom (a scale 25, 3× su tamaño), que es justo lo que hay que evitar.
    var counter = Math.pow(scale, -0.9);
    if (counter > 1) counter = 1;

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

    // Tránsito a la vista del Grupo Local (zoom out) y al Vecindario Solar
    // (zoom máximo sobre el Sol). Se recalculan en cada cambio de zoom.
    updateGrupoLocal();
    updateVecindario();
  }

  // --------------------------------------------------------------------------
  // TRÁNSITO GALAXIA → GRUPO LOCAL
  // Al hacer zoom out por debajo de CONFIG.grupoLocal.umbral, la imagen de la
  // galaxia se funde hacia la capa del atlas (grupo-local.js), que se dibuja
  // detrás del mapa. El fov del atlas se acopla al zoom del visor midiendo los
  // píxeles por año luz de la imagen de la galaxia, de modo que la transición
  // es continua: la galaxia se encoge hasta ser el punto "Vía Láctea" del atlas
  // y, siguiendo el zoom out, aparecen las galaxias observadas del catálogo.
  // --------------------------------------------------------------------------
  function updateGrupoLocal() {
    if (typeof GrupoLocal === 'undefined' || !GrupoLocal.ready) return;
    var cfg = (window.CONFIG && CONFIG.grupoLocal) || {};
    var umbral = cfg.umbral || 0.1;
    var umbralFinal = (cfg.umbralFinal != null) ? cfg.umbralFinal : umbral * 0.4;
    if (umbralFinal >= umbral) umbralFinal = umbral * 0.4;

    // Opacidad de la galaxia: 1 por encima del umbral, 0 por debajo del final,
    // fundido lineal en la banda intermedia.
    var galaxyAlpha;
    if (scale >= umbral) galaxyAlpha = 1;
    else if (scale <= umbralFinal) galaxyAlpha = 0;
    else galaxyAlpha = (scale - umbralFinal) / (umbral - umbralFinal);
    var atlasAlpha = 1 - galaxyAlpha;

    img.style.opacity = galaxyAlpha;
    // Cuando el atlas domina, los marcadores (invisibles) de la galaxia no deben
    // interceptar los clics: así el clic llega a los objetos del atlas.
    img.style.pointerEvents = (atlasAlpha > 0.5) ? 'none' : '';

    // Píxeles por año luz de la imagen de la galaxia al zoom actual, para que el
    // fov del atlas encaje sin salto en el momento del relevo.
    var galImg = document.getElementById('mw-image');
    var pxPerLy = 0;
    if (galImg && galImg.naturalWidth) {
      var r = getImgRect(galImg);
      pxPerLy = (r.width * scale) / CONFIG.fisica.anchoImagenAl;
    }

    GrupoLocal.sync(pxPerLy, atlasAlpha);
  }

  // --------------------------------------------------------------------------
  // TRÁNSITO GALAXIA → VECINDARIO SOLAR (zoom máximo SOBRE EL SOL)
  // Simétrico al Grupo Local pero al ACERCAR: cuando el Sol está centrado y el
  // campo de visión de la galaxia baja de CONFIG.vecindario.fovInicioAl, la
  // imagen se funde en el punto "Sol" y aparece la capa del vecindario
  // (vecindario-solar.js), acoplando su fov a los píxeles/año-luz de la galaxia.
  // --------------------------------------------------------------------------
  // ¿Está el marcador del Sol (vista cenital) cerca del centro del visor?
  function cercaDelSol() {
    if (isEdgeView) return false;
    var el = document.getElementById('mw-sun-anchor');
    if (!el) return false;
    var r = el.getBoundingClientRect();
    if (!r.width && !r.height) return false;
    var vr = viewer.getBoundingClientRect();
    var dx = (r.left + r.width / 2) - (vr.left + vr.width / 2);
    var dy = (r.top + r.height / 2) - (vr.top + vr.height / 2);
    var frac = (window.CONFIG && CONFIG.vecindario && CONFIG.vecindario.proximidad) || 0.28;
    return Math.sqrt(dx * dx + dy * dy) < Math.min(vr.width, vr.height) * frac;
  }

  // Tope de zoom vigente: elevado SOLO al acercarse al Sol en la vista cenital
  // (para entrar al vecindario); en cualquier otro caso, el tope normal (25).
  function effMaxScale() {
    return (!isEdgeView && cercaDelSol()) ? Math.max(maxScale, MAXSCALE_VECINDARIO) : maxScale;
  }

  function updateVecindario() {
    if (typeof VecindarioSolar === 'undefined' || !VecindarioSolar.ready) return;
    var cfg = (window.CONFIG && CONFIG.vecindario) || {};
    var galImg = document.getElementById('mw-image');
    var pxPerLy = 0, fov = Infinity;
    if (galImg && galImg.naturalWidth) {
      var r = getImgRect(galImg);
      pxPerLy = (r.width * scale) / CONFIG.fisica.anchoImagenAl;
      if (pxPerLy > 0) {
        var vr = viewer.getBoundingClientRect();
        fov = (Math.min(vr.width, vr.height) * 0.42) / pxPerLy;   // campo (al) del vecindario
      }
    }
    // Fundido: 0 salvo que el Sol esté centrado (cenital) y el campo baje del
    // umbral. Completo por debajo de fovFinalAl.
    var fovIni = cfg.fovInicioAl || 2500, fovFin = cfg.fovFinalAl || 900;
    var alpha = 0;
    if (!isEdgeView && cercaDelSol() && fov < fovIni) {
      alpha = (fov <= fovFin) ? 1 : (fovIni - fov) / (fovIni - fovFin);
    }
    // Al dominar el vecindario, se oculta la imagen de la galaxia y sus
    // marcadores dejan de capturar clics (para que lleguen a la capa).
    if (alpha > 0) {
      img.style.opacity = 1 - alpha;
      img.style.pointerEvents = (alpha > 0.5) ? 'none' : '';
    }
    VecindarioSolar.sync(pxPerLy, alpha);
  }

  // --------------------------------------------------------------------------
  // ZOOM OUT DINÁMICO SEGÚN EL OBJETO MÁS LEJANO
  // El límite de zoom out (minScale) se ajusta para que el objeto extragaláctico
  // más lejano del catálogo llegue a ser visible en el atlas. Como el fov del
  // atlas es fov = R·ancho / (imgW·scale), para ver un objeto a distancia D
  // (con margen) basta scale ≤ R·ancho / (imgW·D·margen). Se recalcula al cargar
  // la imagen y al redimensionar. Nunca reduce el zoom out por debajo del que ya
  // fija CONFIG.grupoLocal.escalaMinima.
  // --------------------------------------------------------------------------
  var MARGEN_OBJETO_LEJANO = 1.6;
  // Distancia (al) de un objeto buscado fuera del catálogo; permite alejar la
  // vista más allá del objeto registrado más lejano para llegar a verlo.
  var busquedaMaxDist = 0;
  function recalcularMinScale() {
    var base = (window.CONFIG && CONFIG.grupoLocal && CONFIG.grupoLocal.escalaMinima) || 1;
    var reg = (typeof GrupoLocal !== 'undefined' && GrupoLocal.maxDist) ? GrupoLocal.maxDist : 0;
    // El zoom out llega hasta el objeto más lejano registrado (auto-encuadre),
    // recortado por el tope de seguridad del atlas. Una búsqueda explícita
    // (busquedaMaxDist) sí puede ir más allá para localizar un objeto lejano.
    var alcance = (typeof GrupoLocal !== 'undefined' && GrupoLocal.alcanceMax) ? GrupoLocal.alcanceMax : Infinity;
    var D = Math.max(Math.min(reg, alcance), busquedaMaxDist);
    if (!(D > 0)) { minScale = base; return; }
    var vr = viewer.getBoundingClientRect();
    var R = Math.min(vr.width, vr.height) * 0.42;
    var galImg = document.getElementById('mw-image');
    var imgW = (galImg && galImg.naturalWidth) ? getImgRect(galImg).width : Math.min(vr.width, vr.height);
    // Si aún no hay dimensiones válidas (layout no listo), no tocar minScale para
    // no introducir NaN; se recalcula al cargar la imagen y al redimensionar.
    if (!(R > 0) || !(imgW > 0)) { return; }
    var necesaria = (R * CONFIG.fisica.anchoImagenAl) / (imgW * D * MARGEN_OBJETO_LEJANO);
    if (!isFinite(necesaria) || necesaria <= 0) { minScale = base; return; }
    minScale = Math.min(base, necesaria);
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
    var rot = currentPlaneRotation();
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

  // --------------------------------------------------------------------------
  // ROTACIÓN CON RATÓN: Ctrl o Shift + arrastre (convención de mapas web).
  //  - Cenital: gira el mapa alrededor del núcleo (movimiento angular).
  //  - Canto: mueve el azimut con el desplazamiento horizontal; si el giro en
  //    plano está activado (CONFIG.giros.giroPlanoCanto), el gesto angular
  //    controla ese giro en su lugar.
  // --------------------------------------------------------------------------
  var isRotateDragging = false;
  var rotDragStartAngle = 0;   // ángulo cursor-núcleo al iniciar (grados)
  var rotDragStartValue = 0;   // valor de rotación/azimut al iniciar
  var rotDragStartX = 0;       // para el azimut (horizontal)
  var rotDragMode = '';        // 'cenital' | 'plano-canto' | 'azimut'

  function nucleusScreenPoint() {
    // Posición en pantalla del núcleo de la vista activa. Con transform-origin
    // en el núcleo, la rotación no lo mueve; translate sí: pantalla = O + pos.
    var activeImg = document.getElementById(isEdgeView ? 'mw-image-edge' : 'mw-image');
    if (!activeImg || !activeImg.naturalWidth) return null;
    var r = getImgRect(activeImg);
    var nuc = currentNucleo();
    var vr = viewer.getBoundingClientRect();
    return {
      x: vr.left + r.left + r.width  * (nuc.x / 100) + posX,
      y: vr.top  + r.top  + r.height * (nuc.y / 100) + posY
    };
  }

  viewer.addEventListener('mousedown', function (e) {
    if (overlayOpen()) return;
    // No arrastrar el mapa si el clic se originó en un control de la interfaz
    // superpuesta (buscador, botones, leyenda). Sin esto, el preventDefault()
    // de más abajo impediría enfocar el campo de búsqueda.
    if (e.target.closest &&
        e.target.closest('#mw-search, #mw-observador, #mw-nuevo, #mw-toggle-view, #mw-legend, #mw-reset, .mw-ui-control')) {
      return;
    }
    // Con el vecindario solar dominando, su capa gestiona la rotación: no
    // arrastramos ni rotamos la galaxia por debajo (descentraría el Sol).
    if (typeof VecindarioSolar !== 'undefined' && VecindarioSolar.interactivo && VecindarioSolar.interactivo()) return;
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }

    // Ctrl/Shift + arrastre: modo rotación en lugar de desplazamiento.
    if (e.ctrlKey || e.shiftKey) {
      if (!isEdgeView) {
        var np = nucleusScreenPoint();
        if (np) {
          isRotateDragging = true;
          rotDragMode = 'cenital';
          rotDragStartAngle = Math.atan2(e.clientY - np.y, e.clientX - np.x) * 180 / Math.PI;
          rotDragStartValue = rotation;
        }
      } else if (CONFIG.giros && CONFIG.giros.giroPlanoCanto) {
        var np2 = nucleusScreenPoint();
        if (np2) {
          isRotateDragging = true;
          rotDragMode = 'plano-canto';
          rotDragStartAngle = Math.atan2(e.clientY - np2.y, e.clientX - np2.x) * 180 / Math.PI;
          rotDragStartValue = edgePlaneRotation;
        }
      } else if (CONFIG.giros && CONFIG.giros.giroAzimutalCanto) {
        isRotateDragging = true;
        rotDragMode = 'azimut';
        rotDragStartX = e.clientX;
        rotDragStartValue = edgeRotation;
      }
      if (isRotateDragging) {
        viewer.style.cursor = 'alias';
        hideHint();
        e.preventDefault();
        return;
      }
    }

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
    if (isRotateDragging) {
      if (rotDragMode === 'azimut') {
        // 0,4° por píxel horizontal: un barrido de pantalla ≈ media vuelta
        setEdgeRotation(rotDragStartValue + (e.clientX - rotDragStartX) * 0.4);
      } else {
        var np = nucleusScreenPoint();
        if (np) {
          var ang = Math.atan2(e.clientY - np.y, e.clientX - np.x) * 180 / Math.PI;
          var val = rotDragStartValue + (ang - rotDragStartAngle);
          if (rotDragMode === 'cenital') setRotation(val);
          else setEdgePlaneRotation(val);
        }
      }
      return;
    }
    if (!isDragging) return;
    posX = startPosX + (e.clientX - startX);
    posY = startPosY + (e.clientY - startY);
    clampPosition();
    applyTransform();
  });

  window.addEventListener('mouseup', function () {
    isDragging = false;
    isRotateDragging = false;
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
  var pinchPrevAngle = 0;     // ángulo entre los dos dedos en el paso anterior

  function touchAngle(t1, t2) {
    return Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * 180 / Math.PI;
  }

  // Diferencia angular normalizada a (-180, 180] para acumular giros continuos
  // sin saltos al cruzar el límite de atan2.
  function angleDelta(now, prev) {
    var d = now - prev;
    while (d > 180) d -= 360;
    while (d <= -180) d += 360;
    return d;
  }

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
        e.target.closest('#mw-search, #mw-observador, #mw-nuevo, #mw-toggle-view, #mw-legend, #mw-reset, .mw-ui-control')) {
      return;
    }
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }

    if (e.touches.length === 1) {
      // Arrastre con un dedo. Con el vecindario dominando, su capa gestiona la
      // rotación con un dedo; no arrastramos la galaxia (el pinch de dos dedos
      // sí sigue funcionando para seguir acercándose).
      if (typeof VecindarioSolar !== 'undefined' && VecindarioSolar.interactivo && VecindarioSolar.interactivo()) return;
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
      pinchPrevAngle = touchAngle(e.touches[0], e.touches[1]);

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
        var targetScale = Math.min(effMaxScale(), Math.max(minScale,
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

        // Giro de dos dedos (twist): acumulamos el incremento angular entre
        // pasos. En cenital gira el mapa; en canto mueve el azimut (o el giro
        // en plano si esa opción está activada).
        var angNow = touchAngle(e.touches[0], e.touches[1]);
        var dAng = angleDelta(angNow, pinchPrevAngle);
        pinchPrevAngle = angNow;
        if (dAng) {
          if (!isEdgeView) {
            setRotation(rotation + dAng);
          } else if (CONFIG.giros && CONFIG.giros.giroPlanoCanto) {
            setEdgePlaneRotation(edgePlaneRotation + dAng);
          } else if (CONFIG.giros && CONFIG.giros.giroAzimutalCanto) {
            setEdgeRotation(edgeRotation + dAng);
          }
        }
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
    var newScale = Math.min(effMaxScale(), Math.max(minScale, scale * factor));
    zoomAt(e.clientX, e.clientY, newScale);
    hideHint();
  }, { passive: false });

  document.getElementById('mw-zoom-in').addEventListener('click', function () {
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    var rect = viewer.getBoundingClientRect();
    var newScale = Math.min(effMaxScale(), scale * 1.3);
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
    if (fichaId && VLO.getFicha(fichaId)) {
      openFicha(fichaId, dot);
      return;
    }

    // El observador activo no lo ha observado: si otros sí y la funcionalidad
    // está activa, se abre la pantalla "NO VISITADO" para descubrir sus
    // observaciones en vez de ir directamente al PDF.
    if (fichaId && VLO.observacionesAjenasActivo() && VLO.observadoresDe(fichaId, VLO.getActivo()).length) {
      abrirFichaDescubrimiento(fichaId, {
        title:  dot.getAttribute('data-title') || '',
        coords: dot.getAttribute('data-coords') || ''
      });
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
    archivo = archivo || '';
    // Tolerancia a datos corruptos: un esc_url_raw() antiguo antepuso "http://"
    // a nombres relativos ("m57_70x.webp" -> "http://m57_70x.webp"). Si la URL es
    // un esquema + nombre de archivo SIN ruta, se recupera como relativa.
    var corrupta = archivo.match(/^https?:\/\/([^/]+\.(?:webp|jpg|jpeg|png|gif|avif))$/i);
    if (corrupta) archivo = corrupta[1];
    if (/^https?:\/\//i.test(archivo)) return archivo;  // URL absoluta (imagen subida por formulario)
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
  var fichaBackBtn = document.getElementById('ficha-back');
  var fichaCurrent = -1;
  // Contexto de "descubrimiento": si la observación mostrada se alcanzó desde la
  // pantalla NO VISITADO, guarda cómo volver a ella (para el botón ← Descubrir).
  var fichaVolverA = null;

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
  // Columna izquierda de la ficha (boceto + botonera). Se oculta en la pantalla
  // de descubrimiento "NO VISITADO", que solo usa la columna de texto.
  var fichaLeftCol = fichaImgWrap.parentNode;

  // -------------------------------------------------------------------------
  // FUNDIDO (valores derivados de CONFIG — no tocar)
  // -------------------------------------------------------------------------
  var FADE_MS   = CONFIG.fundido.duracionMs;
  var FADE_CSS  = 'opacity ' + (FADE_MS / 1000) + 's ease';
  var FADE_HALF = Math.round(FADE_MS / 2);


  // El zoom de las imágenes de la ficha vive en via-lactea-zoom-imagen.js
  // (VLZoomImagen.crear), cargado antes que este archivo.

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
      panel.appendChild(VLZoomImagen.crear(im));

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
    fichaImgWrap.appendChild(VLZoomImagen.crear(im));

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

  // "2023-10-21" -> "21 oct 2023"; texto libre se muestra escapado.
  function fmtFechaEstelar(v) {
    var t = String(v == null ? '' : v).trim();
    var m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      var meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
      return parseInt(m[3], 10) + ' ' + meses[parseInt(m[2], 10) - 1] + ' ' + m[1];
    }
    return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    var fechaLinea = f.fecha
      ? '<div class="ficha-estelar" style="font-family:ui-monospace,\'SF Mono\',Menlo,monospace;font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:#8fb2cf;margin:0 0 10px;border-bottom:1px solid rgba(143,178,207,.2);padding-bottom:8px;">Bit\u00e1cora Estelar \u00b7 Fecha estelar ' + fmtFechaEstelar(f.fecha) + '</div>'
      : '';
    fichaText.innerHTML = fechaLinea + entry.html;
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

  // Muestra la ficha "normal" (boceto + texto) de una observación concreta.
  //   f    : objeto observación (de OBSERVACIONES) con su _id ya asignado.
  //   info : { title, coords, pdf } para la cabecera.
  //   opts : { volverA, observadorNombre } (opcional). Si volverA está definido,
  //          la observación se alcanzó desde la pantalla de descubrimiento y se
  //          muestra el botón "← Descubrir" para regresar a la lista.
  function renderFichaNormal(f, info, opts) {
    opts = opts || {};
    fichaVolverA = opts.volverA || null;

    // Restaura el modo normal (por si venimos de la pantalla de descubrimiento).
    fichaLeftCol.style.display = '';
    fichaPdfLink.style.display = '';

    var coords = (info && info.coords) || '';
    if (opts.observadorNombre) {
      coords += (coords ? '  ·  ' : '') + 'Observación de ' + opts.observadorNombre;
    }
    fichaTitle.textContent = (info && info.title) || '';
    fichaCoords.textContent = coords;
    fichaPdfLink.href = f.pdf || (info && info.pdf) || '#';
    fichaBackBtn.style.display = fichaVolverA ? '' : 'none';

    buildFichaButtons(f);
    fichaOverlay.style.display = 'flex';
    isDragging = false;
    isPinching = false;
    hideHint();
    selectFichaEntry(f, f.defaultIndex || 0);
  }

  function openFicha(id, dot) {
    var f = VLO.getFicha(id);
    f._id = id;
    renderFichaNormal(f, {
      title:  dot.getAttribute('data-title') || '',
      coords: dot.getAttribute('data-coords') || ''
    });
  }

  // Escapa texto para insertarlo con seguridad en HTML (nombres de observador).
  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Pantalla "NO VISITADO": información básica del objeto + la lista de los
  // observadores que sí lo han observado, para descubrir sus observaciones.
  function abrirFichaDescubrimiento(id, info) {
    fichaVolverA = null;
    fichaBackBtn.style.display = 'none';
    fichaPdfLink.style.display = 'none';
    fichaLeftCol.style.display = 'none';         // solo se usa la columna de texto
    fichaAnexos.style.display = 'none';
    fichaAnexosRight.style.display = 'none';
    fichaImgTitle.style.display = 'none';

    fichaTitle.textContent = (info && info.title) || '';
    fichaCoords.textContent = (info && info.coords) || '';

    var otros = VLO.observadoresDe(id, VLO.getActivo());
    var items = otros.map(function (o) {
      return '<li><button type="button" class="ficha-descubrir-item" data-clave="' +
        escHtml(o.clave) + '" style="' +
        'display:block;width:100%;text-align:left;cursor:pointer;' +
        'background:rgba(126,200,255,0.10);color:#cfe6f7;' +
        'border:1px solid rgba(126,200,255,0.35);border-radius:10px;' +
        'padding:10px 14px;margin:6px 0;font-family:sans-serif;font-size:14px;">' +
        '✦ ' + escHtml(o.nombre) + '</button></li>';
    }).join('');

    fichaText.innerHTML =
      '<div style="font-family:ui-monospace,\'SF Mono\',Menlo,monospace;font-size:12px;' +
        'letter-spacing:.18em;text-transform:uppercase;color:#f4c76b;' +
        'border:1px solid rgba(244,199,107,.35);border-radius:8px;' +
        'padding:8px 12px;text-align:center;margin:0 0 18px;">NO VISITADO</div>' +
      '<div style="font-family:sans-serif;font-size:13px;color:#9fb6c9;margin:0 0 6px;">' +
        'Descubrir observaciones de otros observadores</div>' +
      (otros.length
        ? '<ul style="list-style:none;padding:0;margin:0;">' + items + '</ul>'
        : '<div style="font-family:sans-serif;font-size:13px;color:#7f93a6;">' +
          'Nadie más ha observado este objeto todavía.</div>');
    fichaText.scrollTop = 0;

    // Delegación: un clic en un ítem abre la observación de ese observador.
    var botones = fichaText.querySelectorAll('.ficha-descubrir-item');
    for (var i = 0; i < botones.length; i++) {
      botones[i].addEventListener('click', function () {
        abrirFichaDeObservador(id, this.getAttribute('data-clave'), info);
      });
    }

    fichaOverlay.style.display = 'flex';
    isDragging = false;
    isPinching = false;
    hideHint();
  }

  // Muestra la observación de un observador concreto, con el botón "← Descubrir"
  // para volver a la pantalla de la lista (abrirFichaDescubrimiento).
  function abrirFichaDeObservador(id, clave, info) {
    var f = VLO.fichaDeObservador(id, clave);
    if (!f) return;
    f._id = id;
    var nombre = (typeof OBSERVADORES !== 'undefined' && OBSERVADORES[clave] && OBSERVADORES[clave].nombre)
      ? OBSERVADORES[clave].nombre : clave;
    renderFichaNormal(f, info, { volverA: { id: id, info: info }, observadorNombre: nombre });
  }

  function closeFicha() {
    fichaOverlay.style.display = 'none';
  }

  // Abre la ficha (o, en su defecto, el PDF) de un objeto a partir de sus datos,
  // sin necesitar un marcador DOM. La usa el atlas del Grupo Local al hacer clic
  // en una galaxia, para reutilizar la misma ficha que en la Vía Láctea.
  function abrirFichaObjeto(desc) {
    if (!desc) return;
    var fichaId = desc.ficha;
    var info = { title: desc.title || '', coords: desc.coords || '', pdf: desc.pdf };
    if (fichaId && VLO.getFicha(fichaId)) {
      var f = VLO.getFicha(fichaId);
      f._id = fichaId;
      renderFichaNormal(f, info);
      return;
    }
    // El observador activo no lo ha observado: si otros sí y la funcionalidad
    // está activa, ofrecemos descubrir sus observaciones en vez de ir al PDF.
    if (fichaId && VLO.observacionesAjenasActivo() && VLO.observadoresDe(fichaId, VLO.getActivo()).length) {
      abrirFichaDescubrimiento(fichaId, info);
      return;
    }
    var url = desc.pdf;
    if (!url) return; // sin ficha ni PDF no hay nada que abrir
    pdfTitle.textContent = desc.title || '';
    pdfCoords.textContent = desc.coords || '';
    pdfOpenLink.href = url;
    if (currentPdfUrl !== url) {
      pdfFrame.setAttribute('src', url + '#view=FitH');
      currentPdfUrl = url;
    }
    pdfFallback.style.display = 'flex';
    pdfOverlay.style.display = 'flex';
    isDragging = false;
    isPinching = false;
    hideHint();
  }

  // Clic en una galaxia del atlas del Grupo Local -> abre su ficha.
  if (typeof GrupoLocal !== 'undefined' && GrupoLocal.ready) {
    GrupoLocal.onObjectClick = function (obj) {
      abrirFichaObjeto({
        ficha:  obj.ficha || obj.id,
        pdf:    obj.pdf,
        title:  obj.title || obj.name,
        coords: obj.coords
      });
    };
  }

  // Botón "← Descubrir": vuelve a la pantalla NO VISITADO desde la observación
  // de otro observador.
  fichaBackBtn.addEventListener('click', function () {
    if (fichaVolverA) abrirFichaDescubrimiento(fichaVolverA.id, fichaVolverA.info);
  });

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

  // Carga diferida de la imagen de canto (~6 MB): su URL está en data-src para
  // no competir con la imagen cenital en el arranque. Se pide al pulsar «Vista
  // de canto» y, si no, se precarga en segundo plano cuando el navegador esté
  // ocioso. Al cargar, el listener de más abajo reposiciona los marcadores.
  function ensureEdgeImage() {
    if (!imgEdge || imgEdge.getAttribute('src')) return; // ya cargada o cargando
    var ds = imgEdge.getAttribute('data-src');
    if (ds) imgEdge.src = ds;
  }

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

    // La visibilidad de cada marcador combina TRES filtros: la vista activa
    // (cenital/canto), el tipo (leyenda) y el observador seleccionado. Deben
    // aplicarse juntos: si no, el filtro de observador podría revelar el
    // marcador de la otra vista (a su posición 'edge'), que aparecería como un
    // duplicado en una zona distinta del mapa.
    var objs = img.querySelectorAll('.mw-object-anchor');
    for (var i = 0; i < objs.length; i++) {
      var a = objs[i];
      var inView = a.getAttribute('data-view') === currentView;
      var typeHidden = !!hiddenColors[a.getAttribute('data-color')];
      var estado = VLO.estadoObservador(a.getAttribute('data-id'));
      a.style.display = (inView && !typeHidden && estado !== 'ninguna') ? '' : 'none';
      // Objeto observado solo por otros: se muestra atenuado (gris con algo de
      // su color), como "deshabilitado". El filtro no afecta a los clics, así
      // que sigue pudiéndose pulsar para descubrir las observaciones ajenas.
      a.style.filter = (estado === 'ajena') ? 'grayscale(0.82) opacity(0.55)' : '';
    }
  }

  // Cambia efectivamente de vista (imágenes, marcadores, controles y estado).
  function performViewSwap() {
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

    // Visibilidad de los controles de giro según la vista.
    var rotControl = document.getElementById('mw-rotate-control');
    if (rotControl) rotControl.style.display = isEdgeView ? 'none' : 'flex';
    var rotEdgeControl = document.getElementById('mw-rotate-edge-control');
    if (rotEdgeControl) {
      rotEdgeControl.style.display =
        (isEdgeView && CONFIG.giros && CONFIG.giros.giroAzimutalCanto) ? 'flex' : 'none';
    }
    // El control de giro en plano de canto solo si el interruptor está activo.
    var rotPlaneControl = document.getElementById('mw-rotate-plane-control');
    if (rotPlaneControl) {
      rotPlaneControl.style.display =
        (isEdgeView && CONFIG.giros && CONFIG.giros.giroPlanoCanto) ? 'flex' : 'none';
    }

    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    scale = 1;
    posX = 0;
    posY = 0;
    applyTransform();
    hideHint();
  }

  // Voltereta 3D entre vistas: la vista actual se abate sobre su eje horizontal
  // (como inclinar el disco galáctico) hasta desaparecer de perfil; en ese
  // instante se intercambian las imágenes y la nueva vista se levanta desde el
  // otro lado. Desactivable con CONFIG.giros.transicion3D = false.
  var isFlipping = false;
  var FLIP_MS = 350; // duración de cada mitad de la voltereta

  toggleBtn.addEventListener('click', function () {
    ensureEdgeImage(); // asegura que la imagen de canto esté (o empiece a) cargarse
    if (!(CONFIG.giros && CONFIG.giros.transicion3D)) {
      performViewSwap();
      return;
    }
    if (isFlipping) return;
    isFlipping = true;

    viewer.style.perspective = '1200px';
    img.style.transformOrigin = 'center center';
    img.style.transition = 'transform ' + (FLIP_MS / 1000) + 's ease-in';
    img.style.transform =
      'translate(' + posX + 'px, ' + posY + 'px) scale(' + scale + ') rotateX(90deg)';

    setTimeout(function () {
      // Mitad de la voltereta: cambiamos de vista con el mapa "de perfil".
      performViewSwap(); // deja transform = base (translate 0, scale 1)

      // La nueva vista entra levantándose desde el otro lado. Si la vista de
      // destino tiene un giro en plano activo, lo incluimos en la animación
      // para que no haya un salto al terminar.
      var destRot = currentPlaneRotation();
      var rotSuffix = destRot ? ' rotate(' + destRot + 'deg)' : '';
      img.style.transition = 'none';
      img.style.transform = 'translate(0px, 0px) scale(1) rotateX(-90deg)' + rotSuffix;
      void img.offsetWidth; // forzar reflow para que la transición aplique
      img.style.transition = 'transform ' + (FLIP_MS / 1000) + 's ease-out';
      img.style.transform = 'translate(0px, 0px) scale(1) rotateX(0deg)' + rotSuffix;

      setTimeout(function () {
        img.style.transition = 'none';
        applyTransform(); // transform definitivo sin restos de la animación
        isFlipping = false;
      }, FLIP_MS + 30);
    }, FLIP_MS + 30);
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
  // ── SELECTOR DE OBSERVADOR ──
  var observadorSelect = document.getElementById('mw-observador');
  if (observadorSelect && typeof OBSERVADORES !== 'undefined' && typeof OBSERVACIONES !== 'undefined') {
    var conObs = {};
    for (var _slug in OBSERVACIONES) {
      if (!OBSERVACIONES.hasOwnProperty(_slug)) continue;
      OBSERVACIONES[_slug].forEach(function (o) { if (o.observador) conObs[o.observador] = true; });
    }
    var opts = '<option value="">Todas las observaciones</option>';
    Object.keys(OBSERVADORES).forEach(function (clave) {
      if (!conObs[clave]) return;
      var nom = (OBSERVADORES[clave] && OBSERVADORES[clave].nombre) ? OBSERVADORES[clave].nombre : clave;
      opts += '<option value="' + clave + '">' + String(nom).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</option>';
    });
    observadorSelect.innerHTML = opts;

    // Si el usuario está logado y tiene observaciones registradas, el mapa
    // arranca mostrando LAS SUYAS (el plugin inyecta su clave en BITACORA_WP).
    // Un visitante anónimo (o sin observaciones) arranca con "Todas".
    var claveInicial = (window.BITACORA_WP && BITACORA_WP.observadorClave) ? BITACORA_WP.observadorClave : '';
    if (claveInicial && conObs[claveInicial]) {
      observadorSelect.value = claveInicial;
      VLO.setActivo(claveInicial);
      aplicarFiltroObservador();
    }

    observadorSelect.addEventListener('change', function () {
      VLO.setActivo(observadorSelect.value);
      aplicarFiltroObservador();
      var fO = document.getElementById('ficha-overlay');
      if (fO && fO.style.display === 'flex' && typeof closeFicha === 'function') closeFicha();
    });
  }

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

  // El resolvedor de texto del buscador (normalización, índice y coincidencia
  // exacta/parcial) vive en via-lactea-buscador-indice.js (VLBuscadorIndice),
  // cargado antes que este archivo. Aquí solo se construye el índice sobre
  // OBJECTS; la navegación (mover la cámara) sigue más abajo.
  var indiceBusqueda = VLBuscadorIndice.construir(OBJECTS);

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
    var rot = currentPlaneRotation();
    if (rot) {
      var nuc = currentNucleo();
      var nx = r.left + r.width  * (nuc.x / 100);
      var ny = r.top  + r.height * (nuc.y / 100);
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

  // ¿Es un objeto extragaláctico? (tiene distancia y coordenadas galácticas y
  // está más allá de la Vía Láctea). Determina si se enfoca en el atlas.
  function esObjetoExtragalactico(o) {
    return o && typeof o.dist === 'number' && o.dist >= DIST_MIN_EXTRAGAL &&
      typeof o.l === 'number' && typeof o.b === 'number';
  }

  // Lleva la vista a un objeto REGISTRADO (de OBJECTS): al atlas si es
  // extragaláctico, o al mapa de la galaxia (zoom-in + parpadeo) si es galáctico.
  function irAObjetoRegistrado(obj) {
    if (esObjetoExtragalactico(obj)) {
      var ao = (typeof GrupoLocal !== 'undefined' && GrupoLocal.buscar)
        ? GrupoLocal.buscar(obj.label || obj.id) : null;
      enfocarObjetoAtlas(ao || {
        name: obj.label || obj.id, l: obj.l, b: obj.b, d: obj.dist, tipo: obj.tipo
      });
      return;
    }
    if (typeof GrupoLocal !== 'undefined' && GrupoLocal.clearTarget) GrupoLocal.clearTarget();
    busquedaMaxDist = 0;
    hideHint();

    // Si el tipo de este objeto estaba oculto por el filtro de la leyenda,
    // lo reactivamos (si no, el objeto seguiría invisible) y avisamos.
    var tipoReactivado = revealTypeIfHidden(obj.color);
    if (tipoReactivado) {
      showToast('Se ha reactivado la visualización de: ' + tipoReactivado + '.');
    }

    var pos;
    if (isEdgeView) {
      // Con el punto de vista girado, la x del objeto es la reproyectada.
      var g = GAL[obj.id];
      pos = {
        x: (edgeRotation !== 0 && g) ? edgeXAt(g, edgeRotation) : obj.edge.x,
        y: obj.edge.y
      };
    } else {
      pos = obj.top;
    }
    centerOnAnchor(pos.x, pos.y, CONFIG.busqueda.zoom);
    // El parpadeo se lanza tras un instante para que el centrado ya esté hecho.
    setTimeout(function () { blinkObject(obj.id); }, 60);
  }

  function doSearch() {
    var q = searchInput.value;
    if (!VLBuscadorIndice.normalizar(q)) return;

    // 1) Coincidencia EXACTA en la galaxia (registrado).
    var obj = indiceBusqueda.exacto(q);
    if (obj) { irAObjetoRegistrado(obj); return; }

    // 2) Coincidencia EXACTA en el atlas del Grupo Local (registrado o respaldo).
    var atlasObj = (typeof GrupoLocal !== 'undefined' && GrupoLocal.buscarExacto)
      ? GrupoLocal.buscarExacto(q) : null;
    if (atlasObj) { enfocarObjetoAtlas(atlasObj); return; }

    // 3) Coincidencia PARCIAL por nombre descriptivo (p. ej. "cangrejo" -> M1),
    //    salvo que la consulta sea una designación de catálogo (M1, NGC 6826…),
    //    que solo casa exacta para no confundir "M1" con "M101".
    if (!VLBuscadorIndice.esDesignacionCatalogo(q)) {
      var pobj = indiceBusqueda.parcial(q);
      if (pobj) { irAObjetoRegistrado(pobj); return; }
      var patlas = (typeof GrupoLocal !== 'undefined' && GrupoLocal.buscarParcial)
        ? GrupoLocal.buscarParcial(q) : null;
      if (patlas) { enfocarObjetoAtlas(patlas); return; }
    }

    // 4) No registrado: se resuelve en SIMBAD (galáctico o extragaláctico).
    buscarObjetoExterno(q);
  }

  // Lleva la vista al atlas con el fov que enmarca un objeto a distancia d (al).
  function irAlAtlasConDistancia(d) {
    recalcularMinScale();
    var galImg = document.getElementById('mw-image');
    var vr = viewer.getBoundingClientRect();
    var R = Math.min(vr.width, vr.height) * 0.42;
    var imgW = (galImg && galImg.naturalWidth) ? getImgRect(galImg).width : Math.min(vr.width, vr.height);
    var margen = (CONFIG.busqueda && CONFIG.busqueda.margenExtragalactico) || 1.8;
    var targetFov = d * margen;
    var s = (imgW > 0 && targetFov > 0)
      ? (R * CONFIG.fisica.anchoImagenAl) / (imgW * targetFov)
      : minScale;
    scale = Math.max(minScale, Math.min(maxScale, s));
    posX = 0; posY = 0;
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    clampPosition();
    applyTransform();
  }

  // Enfoca un objeto que ya existe en el atlas (registrado o de respaldo):
  // resalta su marcador (sin duplicarlo) y ajusta el zoom-out para verlo.
  function enfocarObjetoAtlas(o) {
    hideHint();
    busquedaMaxDist = o.d;
    GrupoLocal.focusObject(o);
    irAlAtlasConDistancia(o.d);
    showToast('«' + o.name + '» · localizado en el Grupo Local.');
  }

  // ===========================================================================
  // BÚSQUEDA DE OBJETOS EXTERNOS (no registrados, incluidos los del Grupo Local)
  // Si el objeto no está en el registro, se resuelve en SIMBAD (endpoint del
  // plugin) y se lleva la vista hasta él con el zoom adecuado: zoom-in si está
  // en la Vía Láctea, o zoom-out al atlas del Grupo Local si es extragaláctico.
  // ===========================================================================
  var DIST_MIN_EXTRAGAL = 200000; // al (coincide con grupo-local.js)

  // Punto de mira temporal en el centro del visor, para señalar el objeto
  // localizado que no tiene marcador propio (los del Grupo Local ya se resaltan
  // en el atlas). Se crea una sola vez y se reutiliza.
  var puntoMiraEl = null, puntoMiraTimer = null;
  function mostrarPuntoMira(nombre) {
    if (!puntoMiraEl) {
      puntoMiraEl = document.createElement('div');
      puntoMiraEl.id = 'mw-search-crosshair';
      puntoMiraEl.style.cssText = 'position:absolute;top:50%;left:50%;' +
        'transform:translate(-50%,-50%);width:46px;height:46px;' +
        'border:2px solid rgba(255,255,255,0.9);border-radius:50%;' +
        'box-shadow:0 0 12px 2px rgba(255,255,255,0.45);pointer-events:none;' +
        'z-index:25;display:none;';
      var lbl = document.createElement('div');
      lbl.className = 'mw-search-crosshair-label';
      lbl.style.cssText = 'position:absolute;top:100%;left:50%;' +
        'transform:translateX(-50%);margin-top:6px;color:#fff;' +
        'font-family:sans-serif;font-size:12px;white-space:nowrap;' +
        'text-shadow:0 0 4px rgba(0,0,0,0.9);';
      puntoMiraEl.appendChild(lbl);
      viewer.appendChild(puntoMiraEl);
    }
    puntoMiraEl.querySelector('.mw-search-crosshair-label').textContent = nombre || '';
    puntoMiraEl.style.display = 'block';
    if (puntoMiraTimer) clearTimeout(puntoMiraTimer);
    puntoMiraTimer = setTimeout(function () {
      if (puntoMiraEl) puntoMiraEl.style.display = 'none';
    }, (CONFIG.busqueda.parpadeoSegundos || 3) * 1000 + 1500);
  }

  function buscarObjetoExterno(query) {
    var q = (query || '').trim();
    if (!q) return;
    var url = (CONFIG.busqueda && CONFIG.busqueda.resolver) || '';
    if (!url) {
      showToast('Ese objeto no ha sido observado o no pertenece a la Vía Láctea.');
      return;
    }
    showToast('Buscando «' + q + '»…');
    fetch(url + '?q=' + encodeURIComponent(q), { credentials: 'same-origin' })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.data || typeof res.data.dist !== 'number') {
          var msg = (res.data && res.data.message)
            ? res.data.message
            : 'No se ha encontrado «' + q + '».';
          showToast(msg);
          return;
        }
        irAObjetoExterno(res.data);
      })
      .catch(function () { showToast('No se pudo conectar para buscar «' + q + '».'); });
  }

  function irAObjetoExterno(data) {
    hideHint();
    var nombre = data.q || '';
    if (data.dist < DIST_MIN_EXTRAGAL) {
      // Dentro de la Vía Láctea: centrar en el mapa con zoom-in.
      if (typeof GrupoLocal !== 'undefined' && GrupoLocal.clearTarget) GrupoLocal.clearTarget();
      busquedaMaxDist = 0;
      var pos = isEdgeView ? data.edge : data.top;
      if (!pos) { showToast('No hay posición para «' + nombre + '».'); return; }
      centerOnAnchor(pos.x, pos.y, CONFIG.busqueda.zoom);
      mostrarPuntoMira(nombre);
      showToast('«' + nombre + '» · ' + (data.coords || ''));
    } else {
      enfocarExtragalactico(data);
    }
  }

  function enfocarExtragalactico(data) {
    if (typeof GrupoLocal === 'undefined' || !GrupoLocal.ready || !GrupoLocal.focus) {
      showToast('La vista del Grupo Local no está disponible.');
      return;
    }
    // Rota el atlas para centrar el objeto y lo marca (objeto NO registrado, se
    // dibuja completo). Sube su fov máximo y ajusta el zoom-out para enmarcarlo.
    busquedaMaxDist = data.dist;
    GrupoLocal.focus(data.l, data.b, data.dist, data.q || '', data.tipo || '');
    irAlAtlasConDistancia(data.dist);
    showToast('«' + (data.q || '') + '» · ' + (data.coords || ''));
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

  // ===========================================================================
  // CONTROL DE AZIMUT DE LA VISTA DE CANTO
  // El deslizador gira el punto de vista alrededor del eje polar de la galaxia:
  // los marcadores se reproyectan (el Sol orbita el núcleo, los objetos se
  // deslizan según su posición 3D real); las alturas no cambian.
  // ===========================================================================
  var rotateEdgeInput = document.getElementById('mw-rotate-edge');
  var rotateEdgeValue = document.getElementById('mw-rotate-edge-value');
  var rotateEdgeReset = document.getElementById('mw-rotate-edge-reset');

  function setEdgeRotation(deg) {
    edgeRotation = ((deg % 360) + 360) % 360;
    if (rotateEdgeInput) rotateEdgeInput.value = edgeRotation;
    if (rotateEdgeValue) rotateEdgeValue.textContent = Math.round(edgeRotation) + '°';
    repositionAnchors();
  }

  if (rotateEdgeInput) {
    rotateEdgeInput.addEventListener('input', function () {
      setEdgeRotation(parseFloat(rotateEdgeInput.value) || 0);
    });
  }
  if (rotateEdgeReset) {
    rotateEdgeReset.addEventListener('click', function () { setEdgeRotation(0); });
  }

  // ===========================================================================
  // GIRO EN PLANO DE LA VISTA DE CANTO (opción experimental)
  // Solo activo si CONFIG.giros.giroPlanoCanto es true. Gira la imagen de canto
  // en el plano de la pantalla alrededor del núcleo, con etiquetas legibles.
  // ===========================================================================
  var rotatePlaneInput = document.getElementById('mw-rotate-plane');
  var rotatePlaneValue = document.getElementById('mw-rotate-plane-value');
  var rotatePlaneReset = document.getElementById('mw-rotate-plane-reset');

  function setEdgePlaneRotation(deg) {
    edgePlaneRotation = ((deg % 360) + 360) % 360;
    if (rotatePlaneInput) rotatePlaneInput.value = edgePlaneRotation;
    if (rotatePlaneValue) rotatePlaneValue.textContent = Math.round(edgePlaneRotation) + '°';
    clampPosition();
    applyTransform();
  }

  if (rotatePlaneInput) {
    rotatePlaneInput.addEventListener('input', function () {
      setEdgePlaneRotation(parseFloat(rotatePlaneInput.value) || 0);
    });
  }
  if (rotatePlaneReset) {
    rotatePlaneReset.addEventListener('click', function () { setEdgePlaneRotation(0); });
  }

  // Precarga la imagen de canto en segundo plano cuando el navegador esté
  // ocioso, para que el arranque priorice la imagen cenital pero la vista de
  // canto ya esté lista cuando el usuario la pida.
  if ('requestIdleCallback' in window) {
    requestIdleCallback(ensureEdgeImage, { timeout: 5000 });
  } else {
    setTimeout(ensureEdgeImage, 3000);
  }

  // Ajusta el zoom out máximo al objeto más lejano (al cargar la imagen y al
  // redimensionar, cuando ya se conocen las dimensiones reales).
  recalcularMinScale();
  var _galImg = document.getElementById('mw-image');
  if (_galImg) _galImg.addEventListener('load', recalcularMinScale);
  window.addEventListener('resize', recalcularMinScale);

  applyTransform();
  repositionAnchors();
})();
