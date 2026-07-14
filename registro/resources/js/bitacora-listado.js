/* ===========================================================================
 * BITÁCORA MESSIER · Listado de observaciones
 * ---------------------------------------------------------------------------
 * Este archivo va SUBIDO POR FTP a /wp-content/uploads/bitacora/
 * y NO se pega en el editor de WordPress: el editor escapa los "&" del código
 * (convierte && en &#038;&#038;) y rompería el JavaScript.
 *
 * Al actualizarlo, incrementa el ?v=N en el fragmento HTML.
 * =========================================================================== */

(function () {
  'use strict';

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancar);
  } else {
    arrancar();
  }

  function arrancar() {
    try {

      var $ = function (id) { return document.getElementById(id); };

      var WP = window.BITACORA_WP || null;
      var cards = $('cards');
      var flash = $('flash');
      var tabActivas = $('tabActivas');
      var tabPapelera = $('tabPapelera');

      // URL de la página del formulario, para los enlaces de "Editar".
      // Se toma del atributo data-form del contenedor; si falta, se asume esta ruta.
      var contenedor = $('mw-obs-list');
      var URL_FORM = (contenedor && contenedor.getAttribute('data-form')) || '/observaciones-visuales/';
      var URL_FICHA = (contenedor && contenedor.getAttribute('data-ficha')) || '/datos-de-ficha/';

      var viendoPapelera = false;

      if (!WP) {
        mostrarMensaje('Inicia sesión para ver tus observaciones.', true);
        return;
      }

      // ═══════════════════════════════════════════════════════════════════
      // UTILIDADES
      // ═══════════════════════════════════════════════════════════════════

      // Escapa el texto que viene de la base de datos antes de insertarlo en
      // la página. Sin esto, un nombre con "<" podría inyectar HTML.
      // Escapamos también las comillas porque usamos esc() DENTRO de atributos
      // (href="…", data-id="…"): una comilla suelta rompería el atributo.
      function esc(txt) {
        if (txt === null || txt === undefined) return '';
        return String(txt)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function fmtGrados(v) {
        var n = parseFloat(v);
        if (isNaN(n)) return '—';
        return (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(1) + '°';
      }

      function fmtAz(v) {
        var n = parseFloat(v);
        if (isNaN(n)) return '—';
        return n.toFixed(1) + '°';
      }

      // "2023-10-21 21:30:00" -> "21 oct 2023, 21:30 UTC"
      function fmtFecha(v) {
        if (!v) return '';
        var meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
                     'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
        var m = String(v).match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
        if (!m) return esc(v);
        var out = parseInt(m[3], 10) + ' ' + meses[parseInt(m[2], 10) - 1] + ' ' + m[1];
        if (m[4]) out += ', ' + m[4] + ':' + m[5] + ' UTC';
        return out;
      }

      function mostrarFlash(texto, esError) {
        flash.textContent = texto;
        flash.className = 'flash show ' + (esError ? 'err' : 'ok');
        clearTimeout(mostrarFlash._t);
        mostrarFlash._t = setTimeout(function () {
          flash.className = 'flash';
        }, 5000);
      }

      function mostrarMensaje(texto, esError) {
        cards.innerHTML = '<div class="msg' + (esError ? ' error' : '') + '">' + esc(texto) + '</div>';
      }

      // Llamada al servidor con la cookie de sesión y el nonce.
      function api(url, opciones) {
        opciones = opciones || {};
        opciones.credentials = 'same-origin';
        opciones.headers = opciones.headers || {};
        opciones.headers['X-WP-Nonce'] = WP.nonce;
        return fetch(url, opciones).then(function (r) {
          return r.json()
            .catch(function () { return {}; })
            .then(function (data) {
              return { ok: r.ok, status: r.status, data: data };
            });
        });
      }

      function mensajeError(res, porDefecto) {
        if (res.status === 401) return 'Debes iniciar sesión.';
        if (res.status === 403) return 'Solo puedes modificar tus propias observaciones.';
        if (res.data && res.data.message) return res.data.message;
        return porDefecto + ' (error ' + res.status + ')';
      }

      // ═══════════════════════════════════════════════════════════════════
      // PINTAR EL LISTADO
      // ═══════════════════════════════════════════════════════════════════

      function pintar(filas) {
        if (!filas.length) {
          mostrarMensaje(viendoPapelera
            ? 'La papelera está vacía.'
            : 'Todavía no hay observaciones registradas.');
          return;
        }

        cards.innerHTML = '';
        filas.forEach(function (obs) {
          cards.appendChild(crearTarjeta(obs));
        });
      }

      function crearTarjeta(obs) {
        var card = document.createElement('div');
        card.className = 'card' + (viendoPapelera ? ' deleted' : '');
        card.setAttribute('data-id', obs.id);

        var acciones = accionesDe(obs);

        card.innerHTML =
          '<div class="obj">' + esc(obs.objeto) +
            '<span class="num">nº ' + esc(obs.id) + '</span></div>' +
          '<div class="meta">' +
            '<div class="who">' + esc(obs.observador) +
              (obs.telescopio ? ' <span style="color:var(--tinta-tenue)">· ' + esc(obs.telescopio) + '</span>' : '') +
            '</div>' +
            '<div class="when">' + fmtFecha(obs.fecha_observacion) + '</div>' +
          '</div>' +
          '<div class="pos">' +
            '<div class="p"><div class="k">Alt.</div><div class="v">' + fmtGrados(obs.obj_alt) + '</div></div>' +
            '<div class="p"><div class="k">Az.</div><div class="v">' + fmtAz(obs.obj_az) + '</div></div>' +
          '</div>' +
          '<div class="acts">' + acciones + '</div>';

        conectarAcciones(card, obs);
        return card;
      }

      function accionesDe(obs) {
        if (viendoPapelera) {
          return obs.mia
            ? '<button type="button" class="act restore" data-accion="restaurar">Restaurar</button>'
            : '<span class="not-mine">de otro observador</span>';
        }
        // Tarjetas activas. Los botones "Datos ficha" y "Ficha" están OCULTOS de
        // momento. Para reactivarlos, vuelve a añadir aquí:
        //   '<a class="act" href="' + esc(URL_FICHA) + '?ficha=' + esc(obs.id) + '">Datos ficha</a>'
        //   '<button type="button" class="act ficha" data-accion="ficha">Ficha</button>'
        if (obs.mia) {
          return '<a class="act" href="' + esc(URL_FORM) + '?editar=' + esc(obs.id) + '">Editar</a>' +
                 '<button type="button" class="act danger" data-accion="borrar">Borrar</button>';
        }
        return '<span class="not-mine">de otro observador</span>';
      }

      function conectarAcciones(card, obs) {
        var botones = card.querySelectorAll('[data-accion]');
        Array.prototype.forEach.call(botones, function (btn) {
          var accion = btn.getAttribute('data-accion');
          if (accion === 'restaurar') {
            btn.addEventListener('click', function () { restaurar(obs, card, btn); });
          } else if (accion === 'borrar') {
            btn.addEventListener('click', function () { pedirConfirmacion(obs, card); });
          } else if (accion === 'ficha') {
            btn.addEventListener('click', function () { generarFicha(obs, btn); });
          }
        });
      }

      // ═══════════════════════════════════════════════════════════════════
      // BORRAR (con confirmación dentro de la tarjeta) Y RESTAURAR
      // ═══════════════════════════════════════════════════════════════════

      function pedirConfirmacion(obs, card) {
        if (card.querySelector('.confirm')) return; // ya está pidiendo

        var conf = document.createElement('div');
        conf.className = 'confirm';
        conf.innerHTML =
          '<div class="txt">¿Borrar la observación de ' + esc(obs.objeto) +
          '? Podrás recuperarla desde la papelera.</div>' +
          '<button type="button" class="act" data-c="no">Cancelar</button>' +
          '<button type="button" class="act danger" data-c="si">Sí, borrar</button>';
        card.appendChild(conf);

        conf.querySelector('[data-c="no"]').addEventListener('click', function () {
          conf.remove();
        });
        conf.querySelector('[data-c="si"]').addEventListener('click', function () {
          var botones = conf.querySelectorAll('button');
          botones[0].disabled = botones[1].disabled = true;
          borrar(obs, card);
        });
      }

      function borrar(obs, card) {
        api(WP.endpoint + '/' + obs.id, { method: 'DELETE' })
          .then(function (res) {
            if (res.ok && res.data && res.data.ok) {
              card.style.transition = 'opacity .3s';
              card.style.opacity = '0';
              setTimeout(function () {
                card.remove();
                if (!cards.children.length) {
                  mostrarMensaje('Todavía no hay observaciones registradas.');
                }
              }, 300);
              mostrarFlash('Observación de ' + obs.objeto + ' borrada. Está en la papelera.', false);
              return;
            }
            mostrarFlash(mensajeError(res, 'No se pudo borrar'), true);
            var c = card.querySelector('.confirm');
            if (c) c.remove();
          })
          .catch(function () {
            mostrarFlash('No se pudo contactar con el servidor.', true);
            var c = card.querySelector('.confirm');
            if (c) c.remove();
          });
      }

      function restaurar(obs, card, btn) {
        btn.disabled = true;
        api(WP.endpoint + '/' + obs.id + '/restaurar', { method: 'POST' })
          .then(function (res) {
            if (res.ok && res.data && res.data.ok) {
              card.style.transition = 'opacity .3s';
              card.style.opacity = '0';
              setTimeout(function () {
                card.remove();
                if (!cards.children.length) mostrarMensaje('La papelera está vacía.');
              }, 300);
              mostrarFlash('Observación de ' + obs.objeto + ' restaurada.', false);
              return;
            }
            btn.disabled = false;
            mostrarFlash(mensajeError(res, 'No se pudo restaurar'), true);
          })
          .catch(function () {
            btn.disabled = false;
            mostrarFlash('No se pudo contactar con el servidor.', true);
          });
      }

      // ═══════════════════════════════════════════════════════════════════
      // GENERAR Y DESCARGAR LA FICHA .docx
      //
      // Se pide al servidor con el nonce (como el resto de la API). El plugin
      // ejecuta el generador Node, devuelve el .docx como binario y aquí lo
      // descargamos con el nombre que envía: m30_inv.docx, ngc6826_inv.docx…
      // ═══════════════════════════════════════════════════════════════════

      function generarFicha(obs, btn) {
        var original = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Generando…';

        fetch(WP.endpoint + '/' + obs.id + '/ficha', {
          credentials: 'same-origin',
          headers: { 'X-WP-Nonce': WP.nonce }
        })
          .then(function (r) {
            if (!r.ok) {
              return r.json().catch(function () { return {}; }).then(function (d) {
                throw new Error(d && d.message ? d.message : ('error ' + r.status));
              });
            }
            var nombre = nombreDescarga(r, obs);
            return r.blob().then(function (blob) { descargarBlob(blob, nombre); });
          })
          .then(function () {
            btn.disabled = false;
            btn.textContent = original;
            mostrarFlash('Ficha de ' + obs.objeto + ' descargada.', false);
          })
          .catch(function (err) {
            btn.disabled = false;
            btn.textContent = original;
            mostrarFlash('No se pudo generar la ficha: ' + err.message, true);
          });
      }

      // Nombre del archivo: el que manda el servidor en Content-Disposition; si
      // no llegara, lo reconstruimos igual que el servidor (objeto + _inv.docx).
      function nombreDescarga(respuesta, obs) {
        var cd = respuesta.headers.get('Content-Disposition') || '';
        var m = cd.match(/filename="?([^";]+)"?/);
        if (m) return m[1];
        var slug = String(obs.objeto || 'ficha').toLowerCase().replace(/[^a-z0-9]/g, '');
        return (slug || 'ficha') + '_inv.docx';
      }

      function descargarBlob(blob, nombre) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = nombre;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      }

      // ═══════════════════════════════════════════════════════════════════
      // CARGA Y PESTAÑAS
      // ═══════════════════════════════════════════════════════════════════

      function cargar() {
        mostrarMensaje('Cargando observaciones…');
        var url = WP.endpoint + (viendoPapelera ? '?borradas=1' : '');
        api(url)
          .then(function (res) {
            if (!res.ok) {
              mostrarMensaje(mensajeError(res, 'No se pudieron cargar las observaciones'), true);
              return;
            }
            pintar(Array.isArray(res.data) ? res.data : []);
          })
          .catch(function () {
            mostrarMensaje('No se pudo contactar con el servidor.', true);
          });
      }

      function cambiarPestana(papelera) {
        viendoPapelera = papelera;
        tabActivas.classList.toggle('active', !papelera);
        tabPapelera.classList.toggle('active', papelera);
        cargar();
      }

      tabActivas.addEventListener('click', function () { cambiarPestana(false); });
      tabPapelera.addEventListener('click', function () { cambiarPestana(true); });

      cargar();

    } catch (err) {
      console.error('[Bitácora] Error al iniciar el listado:', err);
      var c = document.getElementById('cards');
      if (c) {
        c.innerHTML = '<div class="msg error">Error al iniciar el listado: ' + err.message + '</div>';
      }
    }
  } // fin de arrancar()

})();
