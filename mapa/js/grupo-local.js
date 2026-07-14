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

  // ---- Catálogo de objetos observados fuera de la Vía Láctea ----------------
  // l = longitud galáctica (º), b = latitud galáctica (º), d = distancia (al)
  var CATALOG = [
    { name: "M63",  desc: "Galaxia del Girasol",       l: 105.5, b: 68.6, d: 29300000 },
    { name: "M101", desc: "Galaxia del Molinete",      l: 102.0, b: 59.8, d: 20900000 },
    { name: "M65",  desc: "Grupo Leo Triplet",         l: 241.5, b: 64.4, d: 35000000 },
    { name: "M99",  desc: "Galaxia de Coma Pinwheel",  l: 271.0, b: 76.9, d: 49000000 }
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

  var objects = CATALOG.map(function (o) {
    var p = galToXYZ(o.l, o.b, o.d);
    return { name: o.name, desc: o.desc, l: o.l, b: o.b, d: o.d, x: p.x, y: p.y, z: p.z };
  });

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
  var FOV_MAX = 30000000;
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

    var projected = objects.map(function (o) { return { o: o, p: project(o) }; })
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
      ctx.strokeStyle = 'rgba(77,214,255,0.28)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);

      var halo = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, r * 3.5);
      halo.addColorStop(0, 'rgba(77,214,255,0.55)');
      halo.addColorStop(1, 'rgba(77,214,255,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(p.sx, p.sy, r * 3.5, 0, Math.PI * 2); ctx.fill();

      ctx.beginPath(); ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#dffaff'; ctx.fill();

      if (onView) {
        ctx.fillStyle = 'rgba(77,214,255,0.95)';
        ctx.font = '500 12px Inter, sans-serif';
        ctx.fillText(o.name, p.sx + r + 6, p.sy + 4);
      }

      if (atlasInteractive && mouse.x != null) {
        var dx = mouse.x - p.sx, dy = mouse.y - p.sy;
        if (dx * dx + dy * dy < 160) hovered = { o: o, p: p };
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
      if (!dragging) yaw += autoGiro;
      render();
    }
    requestAnimationFrame(loop);
  }
  loop();

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
    if (pxPerLy > 0) {
      var R = Math.min(W, H) * 0.42;
      var f = R / pxPerLy;
      fov = Math.max(FOV_MIN, Math.min(FOV_MAX, f));
    }
  }

  return { ready: true, sync: sync };
})();
