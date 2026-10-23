/* ============================================================================
   via-lactea-escena3d.js — ESCENA 3D COMPARTIDA (vecindario solar y Grupo Local)
   Proyecto: mapa interactivo de la Vía Láctea (Gaia)

   Cámara, proyección, rejilla, marcadores, gestos (ratón, rueda, táctil),
   centro de la escena y bucle de dibujo de las dos escenas 3D del mapa. Un
   arreglo en cómo se mueve una escena llega aquí a las dos a la vez (#443).
   Usa VLEscalas.radioCampo (via-lactea-escalas.js, se carga antes).

   Cada escena (vecindario-solar.js, grupo-local.js) aporta solo su catálogo,
   sus colores y su función de pintar el origen y lo suyo propio:

     VLEscena3D.crear({
       canvas, stage, tip, scaleTag,  // DOM de la capa
       objetos,                       // catálogo con x, y, z (origen en 0,0,0)
       yaw, pitch, fovMin, fovMax, autoGiro,
       decimales,                     // fmtDist con decimales bajo 100 al
       colores: { fondo: {y, centro, medio, borde}, estrellas: {n, rgb},
                  rejilla: {rgb, alfa, eje, rotulo}, nucleo, alfaEtiqueta },
       rgba(o, a, aten),              // color de un objeto ('rgba(...)')
       volver: {escala, aria, texto}, // rótulos de la pastilla de centro
       oculto(o), realzadoExtra(o), rejillaExtra(), pausaGiro(), sufijoTip(o),
       pintarOrigen(), pintarEncima(), alClic(o)
     })

   Se carga después de via-lactea-centro.js y antes de las dos escenas, y expone
   window.VLEscena3D. También por module.exports para el test de node
   (scripts/test_escena3d.js), que le pasa lienzo, ventana y documento falsos.
   ============================================================================ */

(function () {
  'use strict';

  var DEG = Math.PI / 180;
  var ORIGEN = { x: 0, y: 0, z: 0 };
  var VUELO_MS = 500;

  // Tope del cabeceo: la cámara nunca llega a mirar justo desde un polo.
  function topePitch(p) { return Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, p)); }

  // Estado del botón «Centrar» de la ficha (#427): con un viaje activo el viaje
  // se ve desde el origen, así que no centra y la ficha dice por qué.
  function estadoCentrar(esCentro, viajeActivo) {
    return {
      texto: esCentro ? 'Centrado' : 'Centrar',
      desactivado: !!(esCentro || viajeActivo),
      aviso: !!viajeActivo && !esCentro
    };
  }

  function fmtDist(ly, decimales) {
    if (ly >= 1e6) return (ly / 1e6).toFixed(ly < 1e7 ? 1 : 0) + ' millones de';
    if (ly >= 1e3) return (ly / 1e3).toFixed(ly < 1e4 ? 1 : 0) + ' mil';
    if (!decimales || ly >= 100) return Math.round(ly).toString();
    if (ly >= 10)  return ly.toFixed(1);
    return ly.toFixed(2);
  }

  function crear(op) {
    var win = op.ventana || window, doc = op.documento || document;
    var canvas = op.canvas, stage = op.stage, tip = op.tip, scaleTag = op.scaleTag;
    var objects = op.objetos, col = op.colores;
    var ctx = canvas.getContext('2d');
    var nada = function () { return null; };
    var oculto = op.oculto || nada, realzadoExtra = op.realzadoExtra || nada;
    var rejillaExtra = op.rejillaExtra || nada, pausaGiro = op.pausaGiro || nada;

    var W, H, cx, cy;
    function resize() {
      var dpr = Math.min(win.devicePixelRatio || 1, 2);
      W = win.innerWidth; H = win.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = W / 2; cy = H / 2;
    }
    win.addEventListener('resize', resize);
    resize();

    // Cámara: giro (yaw/pitch) alrededor del centro y zoom logarítmico, con fov
    // el campo de visión en al (radio visible). La escena puede mover yaw,
    // pitch y fovMax (el Grupo Local los usa para encuadrar una búsqueda).
    var cam = { yaw: op.yaw, pitch: op.pitch, fov: op.fovMax, fovMin: op.fovMin, fovMax: op.fovMax };

    var layerAlpha = 0;       // 0 = invisible (solo galaxia), 1 = solo la escena
    var interactive = false;

    // ---- Centro de la escena (#421, #422) -------------------------------------
    // La cámara gira alrededor del CENTRO, no del origen (glosario: mapa/
    // CONTEXT.md). centro es el objeto centrado (null = el origen) y puntoCentro
    // el punto en que está ahora la cámara, que durante el vuelo va de uno a
    // otro. Las distancias siguen siendo al origen: solo cambia project.
    var centro = null, puntoCentro = ORIGEN, vuelo = null;

    // ---- Proyección 3D --------------------------------------------------------
    function project(o) {
      return VLCentro.proyectar(o, puntoCentro,
        { yaw: cam.yaw, pitch: cam.pitch, fov: cam.fov, R: VLEscalas.radioCampo(W, H), cx: cx, cy: cy });
    }

    // ---- Rejilla de planos concéntricos ---------------------------------------
    // Los planos son del origen: con el centro desplazado se van con él, por eso
    // todo pasa por project().
    function drawGrid(oRealzado) {
      var rings = [];
      var base = Math.pow(10, Math.floor(Math.log10(cam.fov)));
      for (var k = 0.5; k <= 30; k *= 2) rings.push(base * k);

      ctx.lineWidth = 1;
      var scale = VLEscalas.radioCampo(W, H) / cam.fov;
      var o0 = project(ORIGEN);

      // Realce con la plomada: ver VLCentro.realceAnillos.
      var desde = 0;
      while (desde < rings.length && rings[desde] * scale < 8) desde++;
      var kr = oRealzado ? VLCentro.realceAnillos(rings, Math.hypot(oRealzado.x, oRealzado.y), desde)
                         : rings.map(function () { return 1; });
      var kEje = oRealzado ? 1 + (VLCentro.REALCE_REJILLA - 1) / 2 : 1;

      for (var ri = 0; ri < rings.length; ri++) {
        var radius = rings[ri];
        var px = radius * scale;
        if (px < 8 || px > Math.max(W, H) * 3) continue;
        var alpha = Math.min(0.7, Math.max(0.05, col.rejilla.alfa - px / (Math.max(W, H) * 2)) * kr[ri]);
        ctx.beginPath();
        var N = 96;
        for (var i = 0; i <= N; i++) {
          var a = (i / N) * Math.PI * 2;
          var pr = project({ x: radius * Math.cos(a), y: radius * Math.sin(a), z: 0 });
          i === 0 ? ctx.moveTo(pr.sx, pr.sy) : ctx.lineTo(pr.sx, pr.sy);
        }
        ctx.strokeStyle = 'rgba(' + col.rejilla.rgb + ',' + alpha + ')';
        ctx.stroke();
      }

      var axisDeg = [0, 90, 180, 270];
      var outer = base * 20;
      ctx.font = '10px Inter, sans-serif';
      for (var d = 0; d < axisDeg.length; d++) {
        var deg = axisDeg[d];
        var aa = deg * DEG;
        var pa = project({ x: outer * Math.cos(aa), y: outer * Math.sin(aa), z: 0 });
        ctx.beginPath();
        ctx.moveTo(o0.sx, o0.sy);
        ctx.lineTo(pa.sx, pa.sy);
        ctx.strokeStyle = 'rgba(' + col.rejilla.rgb + ',' + col.rejilla.eje * kEje + ')';
        ctx.stroke();
        if (Math.abs(pa.sx - cx) < W && Math.abs(pa.sy - cy) < H) {
          ctx.fillStyle = col.rejilla.rotulo;
          ctx.fillText(deg + '°', pa.sx + 4, pa.sy - 4);
        }
      }
    }

    // campo de estrellas de fondo (fijo, decorativo)
    var stars = [];
    for (var s = 0; s < col.estrellas.n; s++) {
      stars.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.1 + 0.2, a: Math.random() * 0.5 + 0.1 });
    }
    function drawStars() {
      for (var i = 0; i < stars.length; i++) {
        var st = stars[i];
        ctx.beginPath();
        ctx.arc(st.x * W, st.y * H, st.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + col.estrellas.rgb + ',' + st.a + ')';
        ctx.fill();
      }
    }

    // ---- Ruta del viaje -------------------------------------------------------
    // El tramo de una salida que cae en esta escena: la nave sale del origen y va
    // de un objeto a otro en el orden en que se observaron. Los ids los fija el
    // visor principal con setViaje(): null = no hay viaje (se ve todo); [] =
    // viaje que no pasa por aquí.
    var rutaIds = null;

    function drawRutaViaje() {
      if (!rutaIds || !rutaIds.length || typeof VLViaje === 'undefined') return;
      var puntos = [project(ORIGEN)];   // el origen, el puerto de salida
      for (var i = 0; i < rutaIds.length; i++) {
        for (var j = 0; j < objects.length; j++) {
          if (objects[j].id !== rutaIds[i]) continue;
          if (oculto(objects[j])) break;  // apagado en la leyenda
          puntos.push(project(objects[j]));
          break;
        }
      }
      VLViaje.trazarCanvas(ctx, puntos, layerAlpha);
    }

    // ---- Dibujo principal -----------------------------------------------------
    var hovered = null;

    // Anillo de señalar (objeto centrado o buscado): el de via-lactea-centro.js.
    function anillo(p) { VLCentro.anillo(ctx, p, VLViaje.movimientoReducido()); }

    // Rectángulos de las etiquetas dibujadas y visibles este fotograma, para que
    // hitTest() las trate como área pulsable igual que en la vista de la galaxia
    // (allí lo resuelve el DOM: la etiqueta comparte el listener del punto).
    var labelHitRects = [];
    function render() {
      labelHitRects = [];
      ctx.clearRect(0, 0, W, H);

      // Fondo: degradado oscuro para tapar el negro del visor. Solo se ve según
      // la opacidad de la capa (canvas.style.opacity).
      var f = col.fondo;
      var bg = ctx.createRadialGradient(W * 0.5, H * f.y, 0, W * 0.5, H * f.y, Math.max(W, H));
      bg.addColorStop(0, f.centro);
      bg.addColorStop(0.7, f.medio);
      bg.addColorStop(1, f.borde);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      drawStars();
      drawGrid((hovered && hovered.o) || centro || rejillaExtra());
      drawRutaViaje();

      // Se omiten los objetos ocultados desde la leyenda; conjunto (viaje) y
      // estado (visitados / por visitar) los decide la regla única de
      // via-lactea-observadores.js, aquí solo se aplica.
      var projected = objects
        .filter(function (o) { return !oculto(o); })
        .filter(function (o) { return VLObservadores.visiblePorObservador(o.id); })
        .map(function (o) { return { o: o, p: project(o) }; })
        .sort(function (a, b) { return a.p.depth - b.p.depth; });

      // El origen (el punto en que se convierte la galaxia) lo pinta la escena.
      op.pintarOrigen();

      // Realce de marcadores (spec #102): el hovered del fotograma anterior
      // (y lo que la escena añada con realzadoExtra) marca el realzado de este
      // fotograma; se mueve al final del pintado para quedar por encima.
      var hovPrev = hovered && hovered.o;
      for (var ri = 0; ri < projected.length; ri++) {
        var oi = projected[ri].o;
        if (oi === hovPrev || realzadoExtra(oi)) { projected.push(projected.splice(ri, 1)[0]); break; }
      }
      hovered = null;

      for (var j = 0; j < projected.length; j++) {
        var o = projected[j].o, p = projected[j].p;
        var onView = p.sx > -60 && p.sx < W + 60 && p.sy > -60 && p.sy < H + 60;
        var realzado = !!(o === hovPrev || o === centro || realzadoExtra(o));
        // Brillo y tamaño base tenues; enteros si realzado o en viaje (la misma
        // ley de las tres vistas: VLMarcadorEstilo). El origen no pasa por aquí.
        var estiloM = { realzado: realzado, viajeActivo: !!rutaIds };
        var cfgM = win.CONFIG && win.CONFIG.marcadores;
        var escM = VLMarcadorEstilo.de(estiloM, cfgM).escala;
        var r = VLMarcadorEstilo.radioPunto(p.persp, cfgM) * escM;

        // Objeto observado solo por otros: es un destino POR VISITAR, igual que
        // en la Vía Láctea, y sigue siendo pulsable. El símbolo va SIEMPRE a
        // color intenso (spec #102); solo se apagan rótulo y plomada.
        var aten = VLObservadores.atenuadoPorObservador(o.id);

        // Plomada al plano galáctico (z=0), solo del realzado (hover, centro).
        if (realzado) {
          VLCentro.plomada(ctx, project({ x: o.x, y: o.y, z: 0 }), p, o.z < 0, op.rgba(o, 0.6, aten));
        }

        // Brillo base tenue; entero si realzado o en viaje (VLMarcadorEstilo.canvas).
        ctx.globalAlpha = VLMarcadorEstilo.canvas(estiloM, cfgM);

        var simbolo = VLObservadores.simboloDe(o.id);
        if (simbolo === 'punto') {
          var halo = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, r * 3.5);
          halo.addColorStop(0, op.rgba(o, 0.55, false));
          halo.addColorStop(1, op.rgba(o, 0, false));
          ctx.fillStyle = halo;
          ctx.beginPath(); ctx.arc(p.sx, p.sy, r * 3.5, 0, Math.PI * 2); ctx.fill();
        }

        // Visitado o por visitar: la diferencia es de SÍMBOLO, no de brillo. El
        // objeto que el observador activo aún no ha observado se dibuja como
        // anillo hueco de su propio color (sin halo); el visitado, como punto
        // lleno con halo. Misma ley en las tres vistas del mapa.
        // El explorado y no confirmado es un triángulo hueco (simboloDe).
        // Trazo de los huecos: el de la ley, reducido como el punto (igual que la galaxia).
        var grosorM = VLObservadores.ANILLO_NO_VISITADO.grosor * escM;
        VLObservadores.trazarSimbolo(ctx, p.sx, p.sy, r, simbolo, simbolo === 'punto' ? 0 : grosorM);
        if (simbolo !== 'punto') {
          ctx.strokeStyle = op.rgba(o, 0.95, false);
          ctx.lineWidth = grosorM;
          ctx.lineJoin = 'round';
          ctx.stroke();
        } else {
          ctx.fillStyle = typeof col.nucleo === 'function' ? col.nucleo(o) : col.nucleo; ctx.fill();
        }

        var labelRect = null;
        if (onView && VLMarcadorEstilo.etiquetaVisible({ realzado: realzado, viajeActivo: !!rutaIds })) {
          ctx.fillStyle = op.rgba(o, col.alfaEtiqueta, aten);
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
      ctx.globalAlpha = 1;

      // El objeto centrado lleva el anillo mientras sea el centro; su nombre lo
      // pone su marcador (realzado).
      if (centro) anillo(project(centro));
      if (op.pintarEncima) op.pintarEncima();

      if (tip) {
        if (hovered) {
          tip.style.opacity = 1;
          tip.style.left = hovered.p.sx + 'px';
          tip.style.top = hovered.p.sy + 'px';
          var sufijo = op.sufijoTip ? op.sufijoTip(hovered.o) : '';
          tip.innerHTML = '<b>' + hovered.o.name + '</b> — ' + fmtDist(hovered.o.d, op.decimales) + ' al' + sufijo +
            '<br><span class="sub">' + hovered.o.desc + ' · l ' + hovered.o.l + '° b ' + hovered.o.b + '°</span>';
          var resumen = VLObservadores.resumenDe(hovered.o.id);
          if (resumen) tip.innerHTML += '<br><span class="sub">' + resumen + '</span>';
        } else {
          tip.style.opacity = 0;
        }
      }

      // Cursor de "mano" al pasar por encima de un objeto pulsable.
      if (interactive) stage.style.cursor = hovered ? 'pointer' : 'grab';

      if (scaleTag) {
        scaleTag.innerHTML = 'Campo de visión · <b>' + fmtDist(cam.fov, op.decimales) + ' años luz</b>';
      }
    }

    // ---- Interacción (solo activa cuando la escena domina la vista) -----------
    var dragging = false, last = { x: 0, y: 0 };
    var mouse = { x: null, y: null };

    // Objeto bajo un punto de pantalla (o null). Se usa para el clic (abrir ficha).
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
        if (d2 < 220 && d2 < bestD) { bestD = d2; best = objects[i]; } // ~15 px de radio
      }
      return best;
    }

    var downX = 0, downY = 0, downMoved = false;
    function pointerDown(e) {
      if (!interactive) return;
      // Los controles dentro del visor (el «Volver» de la pastilla) no arrastran
      // ni abren el objeto que tengan debajo.
      if (e.target.closest && e.target.closest('.mw-ui-control')) return;
      terminarVuelo();
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
        cam.yaw += (p.clientX - last.x) * 0.006;
        cam.pitch += (p.clientY - last.y) * 0.006;
        cam.pitch = topePitch(cam.pitch);
        last = { x: p.clientX, y: p.clientY };
      }
    }
    function pointerUp(e) {
      // Un clic (sin apenas arrastre) sobre un objeto abre su ficha, como en la
      // galaxia. Solo si el gesto empezó en el visor: el mouseup se oye en
      // window, y el de un botón de la ficha («Centrar») abriría el objeto que
      // hubiera debajo.
      var fueClick = dragging && interactive && !downMoved;
      dragging = false;
      if (fueClick) {
        var p = (e && e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : (e || {});
        var x = (p.clientX != null) ? p.clientX : downX;
        var y = (p.clientY != null) ? p.clientY : downY;
        var obj = hitTest(x, y);
        if (obj) op.alClic(obj);
      }
    }

    stage.addEventListener('mousedown', pointerDown);
    win.addEventListener('mousemove', pointerMove);
    win.addEventListener('mouseup', pointerUp);
    stage.addEventListener('touchstart', pointerDown, { passive: true });
    stage.addEventListener('touchmove', pointerMove, { passive: true });
    stage.addEventListener('touchend', pointerUp);
    // La rueda la gobierna el visor principal; aquí solo acaba el vuelo.
    stage.addEventListener('wheel', function () { if (interactive) terminarVuelo(); }, { passive: true });

    // ---- Bucle de animación ---------------------------------------------------
    function loop() {
      if (layerAlpha > 0.001) {
        // El giro ambiental se pausa durante el vuelo del centro, mientras el
        // cursor está sobre un objeto pulsable (para poder hacer clic sin que se
        // escape) y cuando la escena lo pide (pausaGiro).
        if (vuelo) {
          var t = (performance.now() - vuelo.t0) / VUELO_MS;
          puntoCentro = VLCentro.vuelo(vuelo.desde, vuelo.hasta, t);
          if (t >= 1) vuelo = null;
        } else if (!dragging && !pausaGiro() && !hovered) cam.yaw += op.autoGiro;
        render();
      }
      win.requestAnimationFrame(loop);
    }
    loop();

    // ---- sync (lo llama via-lactea-app.js) -------------------------------------
    //   pxPerLy : píxeles por año luz de la imagen de la galaxia al zoom actual.
    //             Se traduce a fov de la escena para que el relevo sea continuo.
    //   alpha   : opacidad de la capa (0 = solo galaxia, 1 = solo la escena).
    function sync(pxPerLy, alpha) {
      layerAlpha = alpha;
      canvas.style.opacity = alpha;
      canvas.style.display = alpha > 0.001 ? 'block' : 'none';
      interactive = alpha > 0.5;
      if (!interactive) volverAlOrigen();
      if (tip && !interactive) tip.style.opacity = 0;
      if (scaleTag) scaleTag.style.opacity = alpha > 0.5 ? 1 : 0;
      if (pxPerLy > 0) {
        var R = VLEscalas.radioCampo(W, H);
        var f = R / pxPerLy;
        cam.fov = Math.max(cam.fovMin, Math.min(cam.fovMax, f));
      }
    }

    // Centra la escena en un objeto: la cámara vuela ~0,5 s hasta él (salta, con
    // movimiento reducido) y desde ahí gira a su alrededor.
    function centrar(o, silencio) {
      centro = o;
      volarA({ x: o.x, y: o.y, z: o.z });
      rotularVolver();
      pintarIndicador(silencio);
    }
    // El centro vuela hasta un punto (salta, con movimiento reducido).
    function volarA(hasta) {
      vuelo = VLViaje.movimientoReducido() ? null
        : { desde: puntoCentro, hasta: hasta, t0: performance.now() };
      if (!vuelo) puntoCentro = hasta;
    }
    // Un gesto durante el vuelo lo acaba EN EL DESTINO: nunca a medio camino.
    function terminarVuelo() {
      if (!vuelo) return;
      puntoCentro = vuelo.hasta;
      vuelo = null;
    }
    // El centro es volátil: lo devuelven al origen salir de la escena y
    // cualquier encuadre que cuente con el origen en pantalla (búsqueda, viajes).
    function volverAlOrigen() {
      if (!centro && !vuelo) return;
      centro = null; vuelo = null; puntoCentro = ORIGEN;
      pintarIndicador();
    }
    function esCentro(o) { return !!o && o === centro; }
    // «Volver» de la pastilla y la tecla Inicio (#423): el centro vuela de vuelta
    // al origen con la misma curva y el mismo vuelo, que pausa el giro
    // automático, así que giro y zoom quedan como estaban. Sin centro (tampoco a
    // medio volver) no hace nada y devuelve false.
    function volver() {
      if (!centro) return false;
      centro = null;
      volarA(ORIGEN);
      pintarIndicador();
      return true;
    }

    // Indicador de centro de la épica #420: pastilla arriba a la izquierda con
    // «Centro: …» en una región role="status" que existe desde la carga (un nodo
    // nuevo no se anuncia de fiar). Al volver se vacía: no anuncia nada. La
    // pastilla es de las dos escenas 3D: la que centra pone su rótulo e icono.
    var indicador = doc.getElementById('mw-centro');
    var indicadorEstado = doc.getElementById('mw-centro-estado');
    var indicadorVolver = doc.getElementById('mw-centro-volver');
    if (indicadorVolver) indicadorVolver.addEventListener('click', volver);
    function rotularVolver() {
      if (!indicador || !indicadorVolver) return;
      VLCentro.rotularPastilla(doc, op.volver);
    }
    function pintarIndicador(silencio) {
      if (!indicador || !indicadorEstado) return;
      // silencio (#426): la búsqueda ya anuncia con su aviso; dos regiones vivas
      // seguidas se pisan, así que el cambio se pinta sin anunciarlo.
      if (silencio) {
        indicadorEstado.setAttribute('aria-live', 'off');
        setTimeout(function () { indicadorEstado.removeAttribute('aria-live'); }, 500);
      }
      indicadorEstado.textContent = centro ? 'Centro: ' + centro.name : '';
      indicadorEstado.title = indicadorEstado.textContent;
      // El botón desaparece con el centro: su foco pasa al visor, no al body.
      if (!centro && doc.activeElement === indicadorVolver) stage.focus({ preventScroll: true });
      VLCentro.mostrarPastilla(doc, centro);
    }

    // setViaje: el tramo de la salida que se está recorriendo, como ids de
    // objeto EN ORDEN. null (o nada) = se acabó el viaje y vuelve todo; lista
    // vacía = hay viaje, pero no llega hasta aquí.
    function setViaje(ids) {
      rutaIds = ids || null;
    }

    return {
      cam: cam, ctx: ctx, project: project, anillo: anillo,
      alfa: function () { return layerAlpha; },
      sync: sync, setViaje: setViaje,
      centrar: centrar, esCentro: esCentro, volver: volver, alOrigen: volverAlOrigen,
      centro: function () { return centro; },
      centroDesplazado: function () { return !!centro; },
      interactivo: function () { return interactive; }
    };
  }

  var API = { crear: crear, topePitch: topePitch, estadoCentrar: estadoCentrar, ORIGEN: ORIGEN };

  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
  if (typeof window !== 'undefined') { window.VLEscena3D = API; }
})();
