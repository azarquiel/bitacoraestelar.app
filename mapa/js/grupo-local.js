/* ============================================================================
   grupo-local.js — CAPA DEL GRUPO LOCAL (atlas extragaláctico)
   Proyecto: mapa interactivo de la Vía Láctea (Gaia)

   Fusiona el antiguo atlas-observaciones.html dentro del visor principal:
   dibuja, DETRÁS del mapa de la galaxia, una escena 3D del Grupo Local con la
   Vía Láctea en el origen (0,0,0) y las galaxias observadas a su alrededor.

   Esta capa NO tiene controles propios: su nivel de zoom (fov) y su opacidad
   los gobierna el visor principal a través de GrupoLocal.sync(), llamado desde
   updateGrupoLocal() en via-lactea-app.js cuando se hace zoom out. Así el
   tránsito galaxia → grupo local es una única acción de zoom continua.

   Origen (0,0,0) = Vía Láctea. Posiciones en coordenadas galácticas (l, b) +
   distancia. El zoom del atlas es logarítmico, de 10 al a ~30 millones de al.
   Adaptado de atlas.js (atlas-observaciones.html).
   ============================================================================ */

var GrupoLocal = (function () {

  // ---- Colores por clase de Hubble (leyenda del Grupo Local) ----------------
  // Deben coincidir con la leyenda #mw-legend-hubble de index.html y con
  // bitacora_color_por_clase() del plugin PHP.
  var HUBBLE_COLORS = {
    E:   '#f4c76b', // elíptica
    S0:  '#c8b6ff', // lenticular
    S:   '#7ec8ff', // espiral
    SB:  '#5fe0c8', // espiral barrada
    Irr: '#ff8a80'  // irregular
  };

  // A partir de esta distancia al Sol (años luz) un objeto se considera
  // extragaláctico y se representa en el atlas del Grupo Local.
  var DIST_MIN_EXTRAGALACTICA = 200000;

  // Catálogo de respaldo: solo se usa si en la base de datos aún no hay objetos
  // extragalácticos (con l/b/dist). En cuanto se registren, se usan los reales.
  var CATALOG_FALLBACK = [
    { name: "M63",  desc: "Galaxia del Girasol",       l: 105.5, b: 68.6, d: 29300000, tipo: 'S'  },
    { name: "M101", desc: "Galaxia del Molinete",      l: 102.0, b: 59.8, d: 20900000, tipo: 'S'  },
    { name: "M65",  desc: "Grupo Leo Triplet",         l: 241.5, b: 64.4, d: 35000000, tipo: 'S'  },
    { name: "M99",  desc: "Galaxia de Coma Pinwheel",  l: 271.0, b: 76.9, d: 49000000, tipo: 'S'  }
  ];

  var DEG = Math.PI / 180;
  function galToXYZ(l, b, d) {
    var lr = l * DEG, br = b * DEG;
    return {
      x: d * Math.cos(br) * Math.cos(lr),
      y: d * Math.cos(br) * Math.sin(lr),
      z: d * Math.sin(br)
    };
  }

  function colorDe(o) {
    if (o.tipo && HUBBLE_COLORS[o.tipo]) return HUBBLE_COLORS[o.tipo];
    return o.color || '#7ec8ff';
  }

  // "#rrggbb" -> "rgba(r,g,b,a)" para halos y etiquetas de cada galaxia.
  function hexToRgba(hex, a) {
    var h = (hex || '#7ec8ff').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  // Construye el catálogo del atlas desde los OBJECTS reales (los que tienen
  // coordenadas galácticas y distancia extragaláctica). Si no hay ninguno,
  // recurre al catálogo de respaldo para no dejar la vista vacía.
  function construirCatalogo() {
    var fuente = [];
    if (typeof OBJECTS !== 'undefined' && OBJECTS && OBJECTS.length) {
      for (var i = 0; i < OBJECTS.length; i++) {
        var o = OBJECTS[i];
        if (typeof o.dist !== 'number' || o.dist < DIST_MIN_EXTRAGALACTICA) continue;
        if (typeof o.l !== 'number' || typeof o.b !== 'number') continue;
        fuente.push({ name: o.label || o.id, desc: o.name || '', l: o.l, b: o.b, d: o.dist,
                      tipo: o.tipo || '', color: o.color });
      }
    }
    if (!fuente.length) fuente = CATALOG_FALLBACK;
    return fuente.map(function (o) {
      var p = galToXYZ(o.l, o.b, o.d);
      return { name: o.name, desc: o.desc, l: o.l, b: o.b, d: o.d, tipo: o.tipo,
               color: colorDe(o), x: p.x, y: p.y, z: p.z };
    });
  }

  var objects = construirCatalogo();
  // Distancia del objeto más lejano: gobierna hasta dónde se puede alejar la
  // vista (fov máximo) para que cualquier objeto registrado llegue a ser visible.
  var maxDist = objects.reduce(function (m, o) { return Math.max(m, o.d); }, 0);

  // Objeto "buscado" temporal: uno que NO está en el registro y que el buscador
  // localiza en SIMBAD para enseñar dónde está (se dibuja resaltado). Ver focus().
  var target = null;

  // ---- Elementos del DOM (se inyectan en index.html) ------------------------
  var canvas = document.getElementById('gl-sky');
  var tip = document.getElementById('gl-tip');
  var scaleTag = document.getElementById('gl-scale');
  var stage = document.getElementById('mw-viewer');
  if (!canvas || !stage) {
    // Sin la capa no hay nada que hacer; el visor de la galaxia sigue igual.
    return { ready: false, sync: function () {} };
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

  // rotación de la escena (yaw/pitch), alrededor de la Vía Láctea
  var yaw = 0.6, pitch = -0.45;

  // zoom logarítmico: fov = campo de visión en al (radio visible)
  var FOV_MIN = 10;
  // El fov máximo abarca con margen al objeto más lejano registrado (o 30 Mal si
  // aún no hay objetos), de modo que siempre se pueda alejar hasta verlo.
  var FOV_MAX = Math.max(30000000, maxDist * 2.2);
  var fov = FOV_MAX; // arranca "muy lejos"; sync() lo ajusta al zoom real

  // estado gobernado por el visor principal
  var layerAlpha = 0;       // 0 = invisible (solo galaxia), 1 = solo atlas
  var atlasInteractive = false;

  function fmtDist(ly) {
    if (ly >= 1e6) return (ly / 1e6).toFixed(ly < 1e7 ? 1 : 0) + ' millones de';
    if (ly >= 1e3) return (ly / 1e3).toFixed(ly < 1e4 ? 1 : 0) + ' mil';
    return Math.round(ly).toString();
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

  // ---- Rejilla de planos concéntricos --------------------------------------
  function drawGrid() {
    var rings = [];
    var base = Math.pow(10, Math.floor(Math.log10(fov)));
    for (var k = 0.5; k <= 30; k *= 2) rings.push(base * k);

    ctx.lineWidth = 1;
    var cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    var R = Math.min(W, H) * 0.42;
    var scale = R / fov;

    for (var ri = 0; ri < rings.length; ri++) {
      var radius = rings[ri];
      var px = radius * scale;
      if (px < 8 || px > Math.max(W, H) * 3) continue;
      var alpha = Math.max(0.05, 0.35 - px / (Math.max(W, H) * 2));
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
      ctx.strokeStyle = 'rgba(30,79,214,' + alpha + ')';
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
      ctx.strokeStyle = 'rgba(30,79,214,0.18)';
      ctx.stroke();
      if (Math.abs(asx - cx) < W && Math.abs(asy - cy) < H) {
        ctx.fillStyle = 'rgba(77,140,255,0.6)';
        ctx.fillText(deg + '°', asx + 4, asy - 4);
      }
    }
  }

  // campo de estrellas de fondo (fijo, decorativo)
  var stars = [];
  for (var s = 0; s < 260; s++) {
    stars.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.1 + 0.2, a: Math.random() * 0.5 + 0.1 });
  }
  function drawStars() {
    for (var i = 0; i < stars.length; i++) {
      var st = stars[i];
      ctx.beginPath();
      ctx.arc(st.x * W, st.y * H, st.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(200,220,255,' + st.a + ')';
      ctx.fill();
    }
  }

  // ---- Dibujo principal -----------------------------------------------------
  var hovered = null;
  function render() {
    ctx.clearRect(0, 0, W, H);

    // Fondo del atlas: degradado oscuro para tapar el negro del visor. Solo se
    // ve según la opacidad de la capa (canvas.style.opacity).
    var bg = ctx.createRadialGradient(W * 0.5, H * 0.4, 0, W * 0.5, H * 0.4, Math.max(W, H));
    bg.addColorStop(0, '#061024');
    bg.addColorStop(0.7, '#01030a');
    bg.addColorStop(1, '#01030a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    drawStars();
    drawGrid();

    // Se omiten los tipos de Hubble ocultados desde la leyenda.
    var projected = objects
      .filter(function (o) { return !(hiddenTipos && hiddenTipos[o.tipo || '']); })
      .map(function (o) { return { o: o, p: project(o) }; })
      .sort(function (a, b) { return a.p.depth - b.p.depth; });

    // Vía Láctea en el origen (el punto en que se convierte la galaxia al encoger)
    var mw = project({ x: 0, y: 0, z: 0 });
    var g = ctx.createRadialGradient(mw.sx, mw.sy, 0, mw.sx, mw.sy, 26);
    g.addColorStop(0, 'rgba(255,224,138,0.9)');
    g.addColorStop(1, 'rgba(255,224,138,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(mw.sx, mw.sy, 26, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(mw.sx, mw.sy, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    // La etiqueta solo cuando la galaxia ya casi ha desaparecido, para no
    // duplicar el rótulo mientras aún se ve la imagen del mapa.
    if (layerAlpha > 0.6) {
      ctx.fillStyle = 'rgba(255,224,138,0.95)';
      ctx.font = '600 12px Inter, sans-serif';
      ctx.fillText('Vía Láctea', mw.sx + 12, mw.sy - 8);
    }

    hovered = null;
    for (var j = 0; j < projected.length; j++) {
      var o = projected[j].o, p = projected[j].p;
      var onView = p.sx > -60 && p.sx < W + 60 && p.sy > -60 && p.sy < H + 60;
      var r = Math.max(2.4, 4 * p.persp);

      // línea guía hasta el plano galáctico
      var foot = project({ x: o.x, y: o.y, z: 0 });
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(foot.sx, foot.sy);
      ctx.lineTo(p.sx, p.sy);
      ctx.strokeStyle = hexToRgba(o.color || '#7ec8ff', 0.28);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);

      var col = o.color || '#7ec8ff';
      var halo = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, r * 3.5);
      halo.addColorStop(0, hexToRgba(col, 0.55));
      halo.addColorStop(1, hexToRgba(col, 0));
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(p.sx, p.sy, r * 3.5, 0, Math.PI * 2); ctx.fill();

      ctx.beginPath(); ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#f4faff'; ctx.fill();

      if (onView) {
        ctx.fillStyle = hexToRgba(col, 0.95);
        ctx.font = '500 12px Inter, sans-serif';
        ctx.fillText(o.name, p.sx + r + 6, p.sy + 4);
      }

      if (atlasInteractive && mouse.x != null) {
        var dx = mouse.x - p.sx, dy = mouse.y - p.sy;
        if (dx * dx + dy * dy < 160) hovered = { o: o, p: p };
      }
    }

    // Objeto buscado (no registrado): se dibuja resaltado con un anillo pulsante
    // y su nombre, para señalar dónde está aunque no forme parte del catálogo.
    if (target) {
      var tp = project(target);
      var pulso = 6 + 3 * Math.sin(Date.now() / 300);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(tp.sx, tp.sy, 7 + pulso, 0, Math.PI * 2); ctx.stroke();
      // Si el objeto ya está en el catálogo (soloAnillo), el anillo lo resalta y
      // su propio marcador aporta punto y etiqueta: no se dibujan de nuevo.
      if (!target.soloAnillo) {
        var tcol = target.color || '#ffffff';
        var thalo = ctx.createRadialGradient(tp.sx, tp.sy, 0, tp.sx, tp.sy, 12);
        thalo.addColorStop(0, hexToRgba(tcol, 0.8));
        thalo.addColorStop(1, hexToRgba(tcol, 0));
        ctx.fillStyle = thalo;
        ctx.beginPath(); ctx.arc(tp.sx, tp.sy, 12, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(tp.sx, tp.sy, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill();
        if (target.name) {
          ctx.fillStyle = 'rgba(255,255,255,0.98)';
          ctx.font = '600 12px Inter, sans-serif';
          ctx.fillText(target.name, tp.sx + 14, tp.sy + 4);
        }
      }
    }

    if (tip) {
      if (hovered) {
        tip.style.opacity = 1;
        tip.style.left = hovered.p.sx + 'px';
        tip.style.top = hovered.p.sy + 'px';
        tip.innerHTML = '<b>' + hovered.o.name + '</b> — ' + fmtDist(hovered.o.d) + ' al' +
          '<br><span class="sub">' + hovered.o.desc + ' · l ' + hovered.o.l + '° b ' + hovered.o.b + '°</span>';
      } else {
        tip.style.opacity = 0;
      }
    }

    if (scaleTag) {
      scaleTag.innerHTML = 'Campo de visión · <b>' + fmtDist(fov) + ' años luz</b>';
    }
  }

  // ---- Interacción (solo activa cuando el atlas domina la vista) ------------
  var dragging = false, last = { x: 0, y: 0 };
  var mouse = { x: null, y: null };
  var autoGiro = (window.CONFIG && CONFIG.grupoLocal && CONFIG.grupoLocal.autoGiro != null)
    ? CONFIG.grupoLocal.autoGiro : 0.0004;

  function pointerDown(e) {
    if (!atlasInteractive) return;
    dragging = true;
    var p = e.touches ? e.touches[0] : e;
    last = { x: p.clientX, y: p.clientY };
  }
  function pointerMove(e) {
    var p = e.touches ? e.touches[0] : e;
    mouse.x = p.clientX; mouse.y = p.clientY;
    if (dragging && atlasInteractive) {
      yaw += (p.clientX - last.x) * 0.006;
      pitch += (p.clientY - last.y) * 0.006;
      pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
      last = { x: p.clientX, y: p.clientY };
    }
  }
  function pointerUp() { dragging = false; }

  stage.addEventListener('mousedown', pointerDown);
  window.addEventListener('mousemove', pointerMove);
  window.addEventListener('mouseup', pointerUp);
  stage.addEventListener('touchstart', pointerDown, { passive: true });
  stage.addEventListener('touchmove', pointerMove, { passive: true });
  stage.addEventListener('touchend', pointerUp);

  // ---- Bucle de animación ---------------------------------------------------
  function loop() {
    if (layerAlpha > 0.001) {
      // El giro ambiental se pausa mientras hay un objeto buscado enfocado, para
      // que quede centrado.
      if (!dragging && !target) yaw += autoGiro;
      render();
    }
    requestAnimationFrame(loop);
  }
  loop();

  // Enfoca el atlas en un objeto por sus coordenadas galácticas (l, b) y su
  // distancia (al): rota la vista para centrarlo, lo marca como objeto buscado
  // y sube el fov máximo para que quepa. El fov real y la opacidad los fija el
  // visor principal (via-lactea-app.js) al ajustar la escala de la galaxia.
  // Normaliza para comparar nombres: minúsculas, sin acentos ni signos.
  function normalizar(s) {
    return (s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  // Busca un objeto del atlas por nombre/descripción (exacto y luego parcial).
  // Devuelve el objeto del catálogo (con sus l/b/d reales) o null.
  function buscar(query) {
    var q = normalizar(query);
    if (!q) return null;
    for (var i = 0; i < objects.length; i++) {
      if (normalizar(objects[i].name) === q || normalizar(objects[i].desc) === q) return objects[i];
    }
    for (var j = 0; j < objects.length; j++) {
      if (normalizar(objects[j].name).indexOf(q) >= 0) return objects[j];
    }
    return null;
  }

  // Enfoca un objeto que YA está en el atlas: lo resalta con un anillo sobre su
  // propio marcador (sin dibujar un segundo punto ni etiqueta → sin duplicado).
  function focusObject(o) {
    focus(o.l, o.b, o.d, o.name, o.tipo, true);
  }

  function focus(l, b, d, name, tipo, soloAnillo) {
    var margen = (window.CONFIG && CONFIG.busqueda && CONFIG.busqueda.margenExtragalactico) || 1.8;
    FOV_MAX = Math.max(FOV_MAX, d * (margen + 0.6));
    // Se orienta la vista para que el objeto quede centrado en horizontal pero
    // DESPLAZADO por encima del centro (no sobre la Vía Láctea, que siempre se
    // proyecta en el origen). El desplazamiento en pantalla es (y2/margen)·R;
    // se busca ~0,45·R eligiendo y2 = frac. Cierre analítico: con el yaw que
    // anula la componente horizontal, y2 = cos(pitch + psi), psi = atan2(uz, h).
    var u = galToXYZ(l, b, 1);
    yaw = Math.atan2(u.x, u.y);
    var h = Math.sqrt(u.x * u.x + u.y * u.y);
    var frac = Math.min(0.85, 0.45 * margen);
    var psi = Math.atan2(u.z, h);
    var p = Math.acos(Math.max(-1, Math.min(1, frac))) - psi;
    pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, p));
    var pos = galToXYZ(l, b, d);
    target = { name: name || '', desc: '', l: l, b: b, d: d, tipo: tipo || '',
               color: colorDe({ tipo: tipo }), x: pos.x, y: pos.y, z: pos.z,
               soloAnillo: !!soloAnillo };
  }
  function clearTarget() { target = null; }

  // Leyendas dependientes de la vista: la de tipos de objeto (galaxia) y la de
  // clases de Hubble (Grupo Local). Se alternan según domine una vista u otra.
  var legendObjetos = document.getElementById('mw-legend');
  var legendHubble = document.getElementById('mw-legend-hubble');
  function toggleLeyenda(esAtlas) {
    if (legendObjetos) legendObjetos.style.display = esAtlas ? 'none' : '';
    if (legendHubble) legendHubble.style.display = esAtlas ? '' : 'none';
  }
  toggleLeyenda(false);

  // Leyenda interactiva del Grupo Local: pulsar una clase de Hubble la oculta o
  // muestra en el atlas (el objeto se filtra en render). La fila se atenúa y se
  // tacha mientras su clase está oculta, igual que la leyenda de la galaxia.
  var hiddenTipos = {};
  if (legendHubble) {
    var glItems = legendHubble.querySelectorAll('.gl-legend-item');
    for (var gi = 0; gi < glItems.length; gi++) {
      glItems[gi].addEventListener('click', function () {
        var tipo = this.getAttribute('data-tipo');
        var nowHidden = !hiddenTipos[tipo];
        hiddenTipos[tipo] = nowHidden;
        this.style.opacity = nowHidden ? '0.4' : '1';
        var textEl = this.querySelector('.gl-legend-text');
        if (textEl) textEl.style.textDecoration = nowHidden ? 'line-through' : 'none';
      });
    }
  }

  // ---- API pública (la llama updateGrupoLocal en via-lactea-app.js) ---------
  //   pxPerLy : píxeles por año luz de la imagen de la galaxia al zoom actual.
  //             Se traduce a fov del atlas para que el relevo sea continuo.
  //   alpha   : opacidad de la capa (0 = solo galaxia, 1 = solo atlas).
  function sync(pxPerLy, alpha) {
    layerAlpha = alpha;
    canvas.style.opacity = alpha;
    canvas.style.display = alpha > 0.001 ? 'block' : 'none';
    atlasInteractive = alpha > 0.5;
    if (tip && !atlasInteractive) tip.style.opacity = 0;
    if (scaleTag) scaleTag.style.opacity = alpha > 0.5 ? 1 : 0;
    toggleLeyenda(alpha > 0.5);
    if (pxPerLy > 0) {
      var R = Math.min(W, H) * 0.42;
      var f = R / pxPerLy;
      fov = Math.max(FOV_MIN, Math.min(FOV_MAX, f));
    }
  }

  // maxDist (años luz del objeto más lejano) lo usa via-lactea-app.js para
  // permitir alejar la vista hasta que ese objeto sea visible.
  // buscar/focusObject: localizar y enfocar un objeto YA presente en el atlas.
  // focus/clearTarget: enfocar/limpiar un objeto buscado no registrado.
  return {
    ready: true, sync: sync, maxDist: maxDist,
    buscar: buscar, focusObject: focusObject,
    focus: focus, clearTarget: clearTarget
  };
})();
