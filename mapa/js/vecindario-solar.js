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
   estrellas por DEBAJO (z<0) llevan línea de caída DISCONTINUA; las de ENCIMA
   (z>0), CONTINUA.

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

  var DEG = Math.PI / 180;

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
  var ctx = canvas.getContext('2d');

  var W, H, cx, cy;
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = W / 2; cy = H / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  // rotación de la escena (yaw/pitch) alrededor del Sol
  var yaw = 0.6, pitch = -0.42;

  // zoom logarítmico: fov = campo de visión en al (radio visible)
  var FOV_MIN = (window.CONFIG && CONFIG.vecindario && CONFIG.vecindario.fovMinAl) || 8;
  var FOV_MAX = (window.CONFIG && CONFIG.vecindario && CONFIG.vecindario.fovInicioAl) * 1.4 || 3500;
  var fov = FOV_MAX;

  var layerAlpha = 0;       // 0 = invisible (solo galaxia), 1 = solo vecindario
  var interactive = false;

  function fmtDist(ly) {
    if (ly >= 1e6) return (ly / 1e6).toFixed(ly < 1e7 ? 1 : 0) + ' millones de';
    if (ly >= 1e3) return (ly / 1e3).toFixed(ly < 1e4 ? 1 : 0) + ' mil';
    if (ly >= 100) return Math.round(ly).toString();
    if (ly >= 10)  return ly.toFixed(1);
    return ly.toFixed(2);
  }

  // ---- Proyección 3D --------------------------------------------------------
  function project(o) {
    var x = o.x, y = o.y, z = o.z;
    var cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
    var x1 = x * cyaw - y * syaw;
    var y1 = x * syaw + y * cyaw;
    var z1 = z;
    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    var y2 = y1 * cp - z1 * sp;
    var z2 = y1 * sp + z1 * cp;
    var R = Math.min(W, H) * 0.42;
    var scale = R / fov;
    var depth = 1 + (z2 / fov) * 0.12;
    return { sx: cx + x1 * scale, sy: cy - y2 * scale, depth: z2, persp: depth };
  }

  // ---- Rejilla de planos concéntricos (dorada) ------------------------------
  function drawGrid() {
    var rings = [];
    var base = Math.pow(10, Math.floor(Math.log10(fov)));
    for (var k = 0.5; k <= 30; k *= 2) rings.push(base * k);

    ctx.lineWidth = 1;
    var cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
    var cp = Math.cos(pitch);
    var R = Math.min(W, H) * 0.42;
    var scale = R / fov;

    for (var ri = 0; ri < rings.length; ri++) {
      var radius = rings[ri];
      var px = radius * scale;
      if (px < 8 || px > Math.max(W, H) * 3) continue;
      var alpha = Math.max(0.05, 0.32 - px / (Math.max(W, H) * 2));
      ctx.beginPath();
      var N = 96;
      for (var i = 0; i <= N; i++) {
        var a = (i / N) * Math.PI * 2;
        var x = radius * Math.cos(a), y = radius * Math.sin(a);
        var x1 = x * cyaw - y * syaw;
        var y1 = x * syaw + y * cyaw;
        var y2 = y1 * cp;
        var sx = cx + x1 * scale;
        var sy = cy - y2 * scale;
        i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      }
      ctx.strokeStyle = 'rgba(214,164,74,' + alpha + ')';   // dorado
      ctx.stroke();
    }

    var axisDeg = [0, 90, 180, 270];
    var outer = base * 20;
    ctx.font = '10px Inter, sans-serif';
    for (var d = 0; d < axisDeg.length; d++) {
      var deg = axisDeg[d];
      var aa = deg * DEG;
      var ax = outer * Math.cos(aa), ay = outer * Math.sin(aa);
      var ax1 = ax * cyaw - ay * syaw;
      var ay1 = ax * syaw + ay * cyaw;
      var ay2 = ay1 * cp;
      var asx = cx + ax1 * scale;
      var asy = cy - ay2 * scale;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(asx, asy);
      ctx.strokeStyle = 'rgba(214,164,74,0.16)';
      ctx.stroke();
      if (Math.abs(asx - cx) < W && Math.abs(asy - cy) < H) {
        ctx.fillStyle = 'rgba(255,208,120,0.6)';
        ctx.fillText(deg + '°', asx + 4, asy - 4);
      }
    }
  }

  // campo de estrellas de fondo (fijo, decorativo, cálido)
  var stars = [];
  for (var s = 0; s < 240; s++) {
    stars.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.1 + 0.2, a: Math.random() * 0.5 + 0.1 });
  }
  function drawStars() {
    for (var i = 0; i < stars.length; i++) {
      var st = stars[i];
      ctx.beginPath();
      ctx.arc(st.x * W, st.y * H, st.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,240,214,' + st.a + ')';
      ctx.fill();
    }
  }

  // ---- Ruta del viaje interestelar ------------------------------------------
  // El tramo del VECINDARIO de una salida: la nave sale del Sol —el origen de
  // esta escena— y va de una estrella cercana a otra en el orden en que se
  // observaron. Los ids los fija el visor principal con setViaje(): null = no
  // hay viaje (se ven todas las estrellas); [] = viaje que no pasa por aquí.
  var rutaIds = null;

  function drawRutaViaje() {
    if (!rutaIds || !rutaIds.length || typeof VLViaje === 'undefined') return;
    var puntos = [project({ x: 0, y: 0, z: 0 })];   // el Sol, el puerto de origen
    for (var i = 0; i < rutaIds.length; i++) {
      for (var j = 0; j < objects.length; j++) {
        if (objects[j].id !== rutaIds[i]) continue;
        if (hiddenClases && hiddenClases[objects[j].clase || '']) break;  // apagada en la leyenda
        puntos.push(project(objects[j]));
        break;
      }
    }
    VLViaje.trazarCanvas(ctx, puntos, VLViaje.fase(), layerAlpha);
  }

  // ---- Dibujo principal -----------------------------------------------------
  var hovered = null;

  // Rectángulos de las etiquetas dibujadas y visibles este fotograma, para que
  // hitTest() las trate como área pulsable igual que en la vista de la galaxia
  // (allí lo resuelve el DOM: la etiqueta comparte el listener del punto).
  var labelHitRects = [];
  function render() {
    labelHitRects = [];
    ctx.clearRect(0, 0, W, H);

    // Fondo: degradado oscuro con un tinte cálido, para tapar el negro del visor.
    var bg = ctx.createRadialGradient(W * 0.5, H * 0.46, 0, W * 0.5, H * 0.46, Math.max(W, H));
    bg.addColorStop(0, '#120c04');
    bg.addColorStop(0.7, '#05030a');
    bg.addColorStop(1, '#03020a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    drawStars();
    drawGrid();
    drawRutaViaje();

    var projected = objects
      .filter(function (o) { return !(hiddenClases && hiddenClases[o.clase || '']); })
      // Recorriendo un viaje, solo se ven las estrellas de esa salida.
      .filter(function (o) { return !rutaIds || rutaIds.indexOf(o.id) >= 0; })
      .filter(function (o) { return window.VLObservadores.visiblePorObservador(o.id); })
      .map(function (o) { return { o: o, p: project(o) }; })
      .sort(function (a, b) { return a.p.depth - b.p.depth; });

    // Sol en el origen (el punto en que se convierte la galaxia al acercar)
    var sun = project({ x: 0, y: 0, z: 0 });
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

    // Realce de marcadores (spec #102): el hovered del fotograma anterior
    // marca el realzado de este; se mueve al final del pintado para quedar por
    // encima de las demás estrellas.
    var hovPrev = hovered && hovered.o;
    if (hovPrev) {
      for (var ri = 0; ri < projected.length; ri++) {
        if (projected[ri].o === hovPrev) { projected.push(projected.splice(ri, 1)[0]); break; }
      }
    }
    hovered = null;

    // Etiquetas: por debajo de este zoom (fracción de FOV_MAX) se amontonan, así
    // que solo se leen solas al pasar el cursor o recorriendo un viaje — igual
    // que en la vista de la galaxia (etiquetaZoomMin) y el Grupo Local.
    var fraccEtiqueta = (window.CONFIG && CONFIG.marcadores && CONFIG.marcadores.etiquetaFovFraccion != null)
      ? CONFIG.marcadores.etiquetaFovFraccion : 0.15;
    var etiquetaZoomOk = fov <= FOV_MAX * fraccEtiqueta;

    for (var j = 0; j < projected.length; j++) {
      var o = projected[j].o, p = projected[j].p;
      var onView = p.sx > -60 && p.sx < W + 60 && p.sy > -60 && p.sy < H + 60;
      var realzado = o === hovPrev;
      var r = Math.max(2.4, 4 * p.persp);

      // Estrella observada solo por otros: es un destino POR VISITAR,
      // igual que en la Vía Láctea y el Grupo Local, y sigue siendo pulsable. La
      // estrella en sí va SIEMPRE a color intenso (spec #102 ya no la atenúa).
      var aten = window.VLObservadores.atenuadoPorObservador(o.id);
      var col = rgbaDe(o.bprp, 1, aten);   // COLOR EXACTO de Gaia (por BP–RP)

      // Línea de caída al plano galáctico (z=0). DISCONTINUA si la estrella está
      // por DEBAJO del Sol (z<0); CONTINUA si está por ENCIMA (z>0).
      var foot = project({ x: o.x, y: o.y, z: 0 });
      if (o.z < 0) ctx.setLineDash([2, 3]);
      else ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(foot.sx, foot.sy);
      ctx.lineTo(p.sx, p.sy);
      ctx.strokeStyle = rgbaDe(o.bprp, 0.30, aten);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);

      if (!aten) {
        var halo = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, r * 3.5);
        halo.addColorStop(0, rgbaDe(o.bprp, 0.55, false));
        halo.addColorStop(1, rgbaDe(o.bprp, 0, false));
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(p.sx, p.sy, r * 3.5, 0, Math.PI * 2); ctx.fill();
      }

      // Visitado o por visitar: la diferencia es de SÍMBOLO, no de brillo. El
      // objeto que el observador activo aún no ha observado se dibuja como
      // anillo hueco de su propio color (sin halo); el visitado, como punto
      // lleno con halo. Misma ley en las tres vistas del mapa.
      var anillo = window.VLObservadores.ANILLO_NO_VISITADO;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, aten ? r * anillo.escala : r, 0, Math.PI * 2);
      if (aten) {
        ctx.strokeStyle = rgbaDe(o.bprp, 0.95, false);
        ctx.lineWidth = anillo.grosor;
        ctx.stroke();
      } else {
        ctx.fillStyle = '#fff9ef'; ctx.fill();
      }

      var labelRect = null;
      if (onView && (etiquetaZoomOk || realzado || !!rutaIds)) {
        ctx.fillStyle = col;
        ctx.font = '500 12px Inter, sans-serif';
        var lx = p.sx + r + 6, ly = p.sy + 4;
        ctx.fillText(o.name, lx, ly);
        // Área pulsable de la etiqueta (clic abre la ficha, igual que el punto).
        var lw = ctx.measureText(o.name).width;
        labelRect = { o: o, x0: lx - 2, y0: ly - 11, x1: lx + lw + 2, y1: ly + 4 };
        labelHitRects.push(labelRect);
      }

      // El radio de detección no se atenúa: el área pulsable no cambia. La
      // etiqueta pulsable también cuenta como hover, igual que en la galaxia.
      if (interactive && mouse.x != null) {
        var dx = mouse.x - p.sx, dy = mouse.y - p.sy;
        var enEtiqueta = labelRect && mouse.x >= labelRect.x0 && mouse.x <= labelRect.x1 &&
          mouse.y >= labelRect.y0 && mouse.y <= labelRect.y1;
        if (dx * dx + dy * dy < 160 || enEtiqueta) hovered = { o: o, p: p };
      }
    }

    if (tip) {
      if (hovered) {
        tip.style.opacity = 1;
        tip.style.left = hovered.p.sx + 'px';
        tip.style.top = hovered.p.sy + 'px';
        var claseTxt = hovered.o.clase ? (' · tipo ' + hovered.o.clase) : '';
        tip.innerHTML = '<b>' + hovered.o.name + '</b> — ' + fmtDist(hovered.o.d) + ' al' + claseTxt +
          '<br><span class="sub">' + hovered.o.desc + ' · l ' + hovered.o.l + '° b ' + hovered.o.b + '°</span>';
      } else {
        tip.style.opacity = 0;
      }
    }

    if (interactive) stage.style.cursor = hovered ? 'pointer' : 'grab';

    if (scaleTag) {
      scaleTag.innerHTML = 'Campo de visión · <b>' + fmtDist(fov) + ' años luz</b>';
    }
  }

  // ---- Interacción (solo activa cuando el vecindario domina la vista) --------
  var dragging = false, last = { x: 0, y: 0 };
  var mouse = { x: null, y: null };
  var autoGiro = (window.CONFIG && CONFIG.vecindario && CONFIG.vecindario.autoGiro != null)
    ? CONFIG.vecindario.autoGiro : 0.0006;

  function hitTest(clientX, clientY) {
    if (layerAlpha <= 0.5) return null;
    // La etiqueta es pulsable igual que el punto (spec: paridad con la galaxia).
    // Se mira primero: es más grande y, si se solapa con otro punto, gana el
    // objeto al que pertenece el texto que se está pulsando.
    for (var li = labelHitRects.length - 1; li >= 0; li--) {
      var lr = labelHitRects[li];
      if (clientX >= lr.x0 && clientX <= lr.x1 && clientY >= lr.y0 && clientY <= lr.y1) return lr.o;
    }
    var best = null, bestD = Infinity;
    for (var i = 0; i < objects.length; i++) {
      var p = project(objects[i]);
      var dx = clientX - p.sx, dy = clientY - p.sy, d2 = dx * dx + dy * dy;
      if (d2 < 220 && d2 < bestD) { bestD = d2; best = objects[i]; }
    }
    return best;
  }

  var downX = 0, downY = 0, downMoved = false;
  function pointerDown(e) {
    if (!interactive) return;
    dragging = true;
    var p = e.touches ? e.touches[0] : e;
    last = { x: p.clientX, y: p.clientY };
    downX = p.clientX; downY = p.clientY; downMoved = false;
  }
  function pointerMove(e) {
    var p = e.touches ? e.touches[0] : e;
    mouse.x = p.clientX; mouse.y = p.clientY;
    if (dragging && interactive) {
      if (Math.abs(p.clientX - downX) + Math.abs(p.clientY - downY) > 5) downMoved = true;
      yaw += (p.clientX - last.x) * 0.006;
      pitch += (p.clientY - last.y) * 0.006;
      pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
      last = { x: p.clientX, y: p.clientY };
    }
  }
  function pointerUp(e) {
    var fueClick = interactive && !downMoved;
    dragging = false;
    if (fueClick && API.onObjectClick) {
      var p = (e && e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : (e || {});
      var x = (p.clientX != null) ? p.clientX : downX;
      var y = (p.clientY != null) ? p.clientY : downY;
      var obj = hitTest(x, y);
      if (obj) API.onObjectClick(obj);
    }
  }

  stage.addEventListener('mousedown', pointerDown);
  window.addEventListener('mousemove', pointerMove);
  window.addEventListener('mouseup', pointerUp);
  stage.addEventListener('touchstart', pointerDown, { passive: true });
  stage.addEventListener('touchmove', pointerMove, { passive: true });
  stage.addEventListener('touchend', pointerUp);

  // ---- Bucle de animación ---------------------------------------------------
  function loop() {
    if (layerAlpha > 0.001) {
      if (!dragging && !hovered) yaw += autoGiro;
      render();
    }
    requestAnimationFrame(loop);
  }
  loop();

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
  //   pxPerLy : píxeles por año luz de la imagen de la galaxia al zoom actual.
  //   alpha   : opacidad de la capa (0 = solo galaxia, 1 = solo vecindario).
  function sync(pxPerLy, alpha) {
    layerAlpha = alpha;
    canvas.style.opacity = alpha;
    canvas.style.display = alpha > 0.001 ? 'block' : 'none';
    interactive = alpha > 0.5;
    if (tip && !interactive) tip.style.opacity = 0;
    if (scaleTag) scaleTag.style.opacity = alpha > 0.5 ? 1 : 0;
    if (pxPerLy > 0) {
      var R = Math.min(W, H) * 0.42;
      var f = R / pxPerLy;
      fov = Math.max(FOV_MIN, Math.min(FOV_MAX, f));
    }
  }

  // setViaje: el tramo del vecindario de la salida que se está recorriendo, como
  // ids de objeto EN ORDEN. null (o nada) = se acabó el viaje y vuelven todas
  // las estrellas; lista vacía = hay viaje, pero no llega hasta aquí.
  function setViaje(ids) {
    rutaIds = ids || null;
  }

  var API = {
    ready: true,
    sync: sync,
    setViaje: setViaje,
    interactivo: function () { return interactive; },
    onObjectClick: null
  };
  return API;
})();
