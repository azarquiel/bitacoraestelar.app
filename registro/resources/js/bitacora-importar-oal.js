/* ===========================================================================
 * BITÁCORA MESSIER · Importar observaciones (Open Astronomy Log)
 * ---------------------------------------------------------------------------
 * El compañero anota su noche en registro/plantilla-oal.html, se descarga el
 * XML y lo sube aquí. Dos pasos y ninguna sorpresa: primero se ve QUÉ entraría
 * (cuántas noches, cuántas observaciones, qué bases y qué equipo se crearían y
 * qué filas están mal), y solo el segundo botón escribe.
 *
 * Habla con POST /wp-json/bitacora/v1/importar-oal, que importa SIEMPRE a la
 * cuenta de la sesión. Toda la lógica de verdad —leer el XML, casar las bases,
 * fusionar los aumentos de un mismo objeto— vive en el servidor
 * (resources/plugins/bitacora-registro/bitacora-oal.php); aquí solo se enseña.
 *
 * Va SUBIDO POR FTP a /wp-content/uploads/bitacora/ (como el resto de .js).
 * =========================================================================== */

(function () {
  'use strict';

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancar);
  } else {
    arrancar();
  }

  function arrancar() {
    var $ = function (id) { return document.getElementById(id); };
    var WP = window.BITACORA_WP || null;
    var esc = (window.BitacoraBase && BitacoraBase.esc)
      ? BitacoraBase.esc
      : function (t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };

    var suelta = $('impSuelta');
    if (!suelta) { return; }
    if (!WP) {
      suelta.textContent = 'Inicia sesión para importar tus observaciones.';
      return;
    }
    var API = WP.endpoint.replace(/observaciones\/?$/, 'importar-oal');
    var xml = '';   // el fichero leído, entre la previa y la confirmación

    function flash(txt, err) {
      var f = $('flash'); if (!f) { return; }
      f.textContent = txt; f.className = 'flash show' + (err ? ' err' : '');
      clearTimeout(flash._t); flash._t = setTimeout(function () { f.className = 'flash'; }, 4000);
    }

    function enviar(confirmar) {
      return fetch(API, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': WP.nonce },
        body: JSON.stringify({ xml: xml, confirmar: !!confirmar })
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) { throw new Error(d && d.message ? d.message : 'No se pudo leer el fichero.'); }
          return d;
        });
      });
    }

    /* Una cifra del resumen: el número grande y debajo qué cuenta. */
    function cifra(n, que) {
      return '<div class="imp-cifra"><b>' + n + '</b>' + esc(que) + '</div>';
    }

    function pintar(r) {
      $('impTitulo').textContent = r.aplicado ? 'Ya está en tu bitácora' : 'Esto es lo que entraría';
      $('impCifras').innerHTML = r.aplicado
        ? cifra(r.creadas, 'nuevas') + cifra(r.actualizadas, 'actualizadas')
        : cifra(r.noches, r.noches === 1 ? 'noche' : 'noches') +
          cifra(r.observaciones, 'objetos') +
          cifra(r.entradas, 'aumentos') +
          cifra(r.nuevas, 'nuevas') +
          cifra(r.actualizadas, 'se actualizan');

      var cambios = '';
      if (!r.aplicado && r.observador) {
        cambios += '<p>Firmadas por <strong>' + esc(r.observador) + '</strong>.</p>';
      }
      if (r.bases_nuevas && r.bases_nuevas.length) {
        cambios += '<p>Se creará(n) esta(s) base(s): <strong>' + esc(r.bases_nuevas.join(', ')) + '</strong></p>';
      }
      if (r.equipo_nuevo && r.equipo_nuevo.length) {
        cambios += '<p>Se añadirá a tu flota: <strong>' + esc(r.equipo_nuevo.join(', ')) + '</strong></p>';
      }
      // Lo reconocido tranquiliza tanto como lo nuevo: nada de esto se duplica.
      var reusado = (r.bases_reusadas || []).concat(r.equipo_reusado || []);
      if (reusado.length) {
        cambios += '<p>Se reutiliza lo que ya tienes: ' + esc(reusado.join(', ')) + '</p>';
      }
      if (r.aplicado) {
        cambios += '<p class="imp-hecho">Ya puedes verlas en tu listado y en tus viajes.</p>';
      }
      $('impCambios').innerHTML = cambios;

      var avisos = r.problemas || [];
      $('impAvisos').hidden = !avisos.length;
      $('impAvisosLista').innerHTML = avisos.map(function (p) {
        return '<li><strong>' + esc(p.donde) + '</strong>: ' + esc(p.que) + '</li>';
      }).join('');

      // Nada que importar, o ya importado: el botón no tiene qué hacer.
      $('impConfirmar').disabled = !!r.aplicado || !r.observaciones;
      $('impPrevia').hidden = false;
    }

    function leer(fichero) {
      if (!fichero) { return; }
      var lector = new FileReader();
      lector.onload = function () {
        xml = String(lector.result || '');
        $('impNota').textContent = 'Leyendo ' + fichero.name + '…';
        enviar(false).then(function (r) {
          $('impNota').textContent = '';
          pintar(r);
        }).catch(function (e) {
          $('impPrevia').hidden = true;
          $('impNota').textContent = '';
          flash(e.message, true);
        });
      };
      lector.onerror = function () { flash('No se pudo leer el fichero.', true); };
      lector.readAsText(fichero);
    }

    $('impFichero').addEventListener('change', function (e) { leer(e.target.files[0]); });

    // Soltar el fichero encima es lo natural cuando viene de la carpeta de
    // descargas; el navegador abriría el XML si no se le quita el gesto.
    ['dragenter', 'dragover'].forEach(function (ev) {
      suelta.addEventListener(ev, function (e) { e.preventDefault(); suelta.classList.add('encima'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      suelta.addEventListener(ev, function (e) { e.preventDefault(); suelta.classList.remove('encima'); });
    });
    suelta.addEventListener('drop', function (e) {
      leer(e.dataTransfer && e.dataTransfer.files ? e.dataTransfer.files[0] : null);
    });

    $('impConfirmar').addEventListener('click', function () {
      var boton = $('impConfirmar');
      boton.disabled = true;
      $('impNota').textContent = 'Importando…';
      enviar(true).then(function (r) {
        $('impNota').textContent = '';
        pintar(r);
        flash('Importadas ' + r.creadas + ' observación(es), actualizadas ' + r.actualizadas + '.');
      }).catch(function (e) {
        boton.disabled = false;
        $('impNota').textContent = '';
        flash(e.message, true);
      });
    });
  }
})();
