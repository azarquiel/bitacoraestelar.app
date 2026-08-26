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
      var tabViajes = $('tabViajes');

      // URL de la página del formulario, para los enlaces de "Editar".
      // Se toma del atributo data-form del contenedor; si falta, se asume esta ruta.
      var contenedor = $('mw-obs-list');
      var URL_FORM = (contenedor && contenedor.getAttribute('data-form')) || '/observaciones-visuales/';
      var URL_FICHA = (contenedor && contenedor.getAttribute('data-ficha')) || '/datos-de-ficha/';

      var viendoPapelera = false;
      // Agrupar por viaje es una FORMA DE VER lo mismo, no otra consulta: las
      // observaciones son las mismas y solo cambia cómo se reparten en la
      // página. La lista plana sigue disponible para buscar un objeto suelto.
      var porViajes = false;

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

      // Llamada al servidor: fuente única en bitacora-base.js (había cinco
      // copias de api() y ya habían divergido). El 403 del listado conserva su
      // mensaje propio por parámetro.
      var api = window.BitacoraBase.api;
      function mensajeError(res, porDefecto) {
        return window.BitacoraBase.errorDe(res, porDefecto, { m403: 'Solo puedes modificar tus propias observaciones.' });
      }

      // ═══════════════════════════════════════════════════════════════════
      // PINTAR EL LISTADO
      // ═══════════════════════════════════════════════════════════════════

      function pintar(filas, viajes) {
        if (!filas.length) {
          mostrarMensaje(viendoPapelera
            ? 'La papelera está vacía.'
            : 'Todavía no hay observaciones registradas.');
          return;
        }

        cards.innerHTML = '';
        if (porViajes) {
          pintarPorViajes(filas, viajes || []);
          return;
        }
        filas.forEach(function (obs) {
          cards.appendChild(crearTarjeta(obs));
        });
      }

      // Una cabecera por viaje y debajo sus objetos. El servidor manda los
      // viajes de la noche más reciente a la más antigua, y ese es el orden en
      // que se pintan; lo que no tiene viaje (registrado sin base) cae al final,
      // bajo su propio epígrafe, para que no desaparezca de la vista.
      function pintarPorViajes(filas, viajes) {
        var porId = {};
        filas.forEach(function (obs) {
          var k = obs.viaje_id ? String(obs.viaje_id) : 'sin';
          (porId[k] = porId[k] || []).push(obs);
        });

        var pintados = 0;
        viajes.forEach(function (v) {
          var suyas = porId[String(v.id)];
          if (!suyas || !suyas.length) return;   // viaje vacío: nada que enseñar aquí
          cards.appendChild(cabeceraViaje(v, suyas.length));
          suyas.forEach(function (obs) { cards.appendChild(crearTarjeta(obs)); });
          pintados += suyas.length;
        });

        if (porId.sin && porId.sin.length) {
          cards.appendChild(cabeceraSueltas(porId.sin.length));
          porId.sin.forEach(function (obs) { cards.appendChild(crearTarjeta(obs)); });
          pintados += porId.sin.length;
        }

        // Cinturón de seguridad: si alguna observación apunta a un viaje que no
        // vino en la lista, se pinta igual antes que perderla de vista.
        if (pintados < filas.length) {
          var huerfanas = filas.filter(function (obs) {
            return obs.viaje_id && !viajes.some(function (v) { return String(v.id) === String(obs.viaje_id); });
          });
          if (huerfanas.length) {
            cards.appendChild(cabeceraSueltas(huerfanas.length, 'Sin viaje reconocible'));
            huerfanas.forEach(function (obs) { cards.appendChild(crearTarjeta(obs)); });
          }
        }
      }

      function cabeceraViaje(v, cuantas) {
        var h = document.createElement('div');
        h.className = 'viaje-head';
        var titulo = v.nombre || ('Viaje del ' + fmtFecha(v.noche));
        var detalle = [];
        if (v.nombre) detalle.push(fmtFecha(v.noche));
        if (v.base_nombre) detalle.push(v.base_nombre);
        if (v.cielo_sqm) detalle.push('SQM ' + v.cielo_sqm);
        if (v.cielo_bortle) detalle.push('Bortle ' + v.cielo_bortle);
        h.innerHTML =
          '<div class="viaje-t">' + esc(titulo) + '</div>' +
          '<div class="viaje-d">' + esc(detalle.join(' · ')) + '</div>' +
          '<div class="viaje-n">' + cuantas + (cuantas === 1 ? ' objeto' : ' objetos') + '</div>';
        return h;
      }

      function cabeceraSueltas(cuantas, titulo) {
        var h = document.createElement('div');
        h.className = 'viaje-head suelto';
        h.innerHTML =
          '<div class="viaje-t">' + esc(titulo || 'Sin viaje') + '</div>' +
          '<div class="viaje-d">Registradas sin base, así que no se pueden agrupar por noche</div>' +
          '<div class="viaje-n">' + cuantas + (cuantas === 1 ? ' objeto' : ' objetos') + '</div>';
        return h;
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
        // "Mis observaciones": solo las del usuario en sesión (mias=1). La
        // papelera muestra, igualmente, solo las suyas ya borradas.
        var url = WP.endpoint + '?mias=1' + (viendoPapelera ? '&borradas=1' : '');
        // Agrupado: hacen falta los viajes para sus cabeceras (nombre, base,
        // cielo). Si esa petición falla, el listado se pinta plano en vez de no
        // pintarse: ver las observaciones importa más que agruparlas.
        var viajes = porViajes
          // BITACORA_WP solo expone el endpoint de observaciones; el de viajes
          // es hermano suyo en la misma raíz de la API (BitacoraBase.ruta).
          ? api(window.BitacoraBase.ruta('viajes') + '?mios=1').then(function (r) {
              return (r.ok && Array.isArray(r.data)) ? r.data : [];
            }).catch(function () { return []; })
          : Promise.resolve([]);

        Promise.all([api(url), viajes])
          .then(function (r) {
            var res = r[0];
            if (!res.ok) {
              mostrarMensaje(mensajeError(res, 'No se pudieron cargar las observaciones'), true);
              return;
            }
            pintar(Array.isArray(res.data) ? res.data : [], r[1]);
          })
          .catch(function () {
            mostrarMensaje('No se pudo contactar con el servidor.', true);
          });
      }

      function cambiarPestana(papelera, agrupado) {
        viendoPapelera = papelera;
        // La papelera nunca se agrupa: son restos sueltos, no una salida.
        porViajes = papelera ? false : !!agrupado;
        tabActivas.classList.toggle('active', !papelera && !porViajes);
        tabPapelera.classList.toggle('active', papelera);
        if (tabViajes) tabViajes.classList.toggle('active', porViajes);
        cargar();
      }

      tabActivas.addEventListener('click', function () { cambiarPestana(false, false); });
      tabPapelera.addEventListener('click', function () { cambiarPestana(true, false); });
      if (tabViajes) {
        tabViajes.addEventListener('click', function () { cambiarPestana(false, true); });
      }

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
