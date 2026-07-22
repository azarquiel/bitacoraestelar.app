/* ===========================================================================
 * BITÁCORA MESSIER · Utilidades comunes de la web (bitacora-base.js)
 * ---------------------------------------------------------------------------
 * Código JS COMPARTIDO por los módulos de la bitácora. De momento expone el
 * buscador de catálogo de equipo (elegir un telescopio o un ocular del catálogo
 * global), reutilizado por "Mi flota" (bitacora-flota.js) y por el simulador de
 * ocular (bitacora-ocular.js).
 *
 * Se carga ANTES que las hojas de cada módulo. Subir por FTP a
 * /wp-content/uploads/bitacora/ e incrementar el ?v=N al actualizar.
 * =========================================================================== */

window.BitacoraBase = (function () {
  'use strict';

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * Buscador de catálogo con desplegable de sugerencias.
   *
   * Monta sobre un <input> el mismo autocompletado de catálogo que usa "Mi
   * flota": al escribir, filtra la fuente y pinta un <div class="suggest"> con
   * los resultados; al pulsar uno, llama a onElegir(item) y cierra el
   * desplegable. También se cierra al hacer clic fuera del contenedor.
   *
   * opts = {
   *   input:      <input> de búsqueda (obligatorio)
   *   suggest:    <div class="suggest"> donde se pintan las sugerencias (obligatorio)
   *   contenedor: elemento que envuelve input+suggest; al clicar fuera se cierra
   *               (por defecto, input.parentNode)
   *   fuente:     function() -> [items]   (se llama en cada búsqueda)
   *   texto:      function(item) -> nombre visible
   *   specs:      function(item) -> texto de specs (columna derecha, opcional)
   *   onElegir:   function(item)
   *   max:        nº máximo de resultados (por defecto 12)
   *   todosSiVacio: si es true, al enfocar sin texto lista los primeros `max`
   *               resultados (para catálogos cortos o para explorar la lista)
   *   sinResultados: texto cuando no hay coincidencias
   * }
   * Devuelve { buscar, cerrar } por si se quiere disparar/cerrar manualmente.
   * ───────────────────────────────────────────────────────────────────────── */
  function montarBuscadorCatalogo(opts) {
    var input = opts.input;
    var sugg = opts.suggest;
    var cont = opts.contenedor || input.parentNode;
    var max = opts.max || 12;
    var sinRes = opts.sinResultados || 'Sin coincidencias en el catálogo';
    var estiloSpecs = 'color:var(--azul);font-family:ui-monospace,Menlo,monospace;font-size:12px';

    function buscar() {
      var q = (input.value || '').trim().toLowerCase();
      // Con todosSiVacio, al enfocar sin texto se listan los primeros resultados
      // (útil para catálogos cortos o para explorar la lista); si no, se oculta.
      if (!q) {
        if (!opts.todosSiVacio) { sugg.style.display = 'none'; return; }
      }
      var res = (opts.fuente() || []).filter(function (it) {
        return !q || opts.texto(it).toLowerCase().indexOf(q) !== -1;
      }).slice(0, max);

      if (!res.length) {
        sugg.innerHTML = '<button type="button" disabled style="opacity:.6;cursor:default">' + esc(sinRes) + '</button>';
        sugg.style.display = 'block';
        return;
      }
      sugg.innerHTML = res.map(function (it) {
        var sp = opts.specs ? opts.specs(it) : '';
        return '<button type="button" data-id="' + esc(it.id) + '">' +
          '<span>' + esc(opts.texto(it)) + '</span>' +
          (sp ? '<span style="' + estiloSpecs + '">' + esc(sp) + '</span>' : '') +
          '</button>';
      }).join('');
      sugg.style.display = 'block';

      sugg.querySelectorAll('button[data-id]').forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-id');
          var it = (opts.fuente() || []).filter(function (x) { return String(x.id) === String(id); })[0];
          sugg.style.display = 'none';
          if (it) opts.onElegir(it);
        });
      });
      activo = -1; // cada nueva lista empieza sin resaltado para el teclado
    }

    // ── Navegación con teclado (flechas ↑/↓, Enter, Esc) ──
    // 'activo' es el índice de la opción resaltada dentro de las sugerencias
    // seleccionables (las que tienen data-id; excluye "sin coincidencias").
    var activo = -1;
    function opciones() { return sugg.querySelectorAll('button[data-id]'); }
    function abierta() { return sugg.style.display !== 'none' && opciones().length > 0; }
    function resaltar(idx) {
      var op = opciones();
      if (!op.length) { activo = -1; return; }
      idx = (idx < 0) ? op.length - 1 : (idx >= op.length ? 0 : idx); // envuelve
      activo = idx;
      for (var i = 0; i < op.length; i++) {
        var on = (i === activo);
        op[i].classList.toggle('is-activa', on);
        op[i].style.background = on ? 'rgba(126,200,255,0.16)' : '';
        if (on && op[i].scrollIntoView) { op[i].scrollIntoView({ block: 'nearest' }); }
      }
    }

    input.addEventListener('input', buscar);
    input.addEventListener('focus', function () { if (input.value.trim() || opts.todosSiVacio) buscar(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!abierta()) { buscar(); }
        resaltar(activo + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!abierta()) { buscar(); }
        resaltar(activo - 1);
      } else if (e.key === 'Enter') {
        if (abierta() && activo >= 0) { e.preventDefault(); opciones()[activo].click(); }
      } else if (e.key === 'Escape') {
        sugg.style.display = 'none';
      }
    });
    document.addEventListener('click', function (e) { if (!cont.contains(e.target)) sugg.style.display = 'none'; });

    return { buscar: buscar, cerrar: function () { sugg.style.display = 'none'; } };
  }

  return {
    esc: esc,
    montarBuscadorCatalogo: montarBuscadorCatalogo
  };
})();
