/* ============================================================================
   via-lactea-zoom-imagen.js — ZOOM de imágenes dentro de la ficha
   Proyecto: mapa interactivo de la Vía Láctea (Gaia)

   Módulo autónomo: envuelve una <img> en un contenedor con zoom por rueda,
   pellizco (pinch) y arrastre, más doble clic para restablecer. Mantiene su
   propio estado (zoom y desplazamiento) por instancia; no toca el estado del
   mapa. Se carga ANTES de via-lactea-app.js y expone window.VLZoomImagen.

   Interfaz:
     VLZoomImagen.crear(imgEl) -> wrapperDiv
       Envuelve imgEl y devuelve el contenedor listo para insertar en el DOM.
       Deja imgEl._resetZoom() para volver a x1 (p. ej. al cambiar de imagen).

   Requiere CONFIG.zoomFicha.maximo (ver via-lactea-config.js).
   ============================================================================ */

(function () {
  'use strict';

  function crear(im) {
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

  window.VLZoomImagen = { crear: crear };
})();
