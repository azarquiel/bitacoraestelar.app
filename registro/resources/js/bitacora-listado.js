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

  // ── Funciones puras (las prueba scripts/test_listado_unificado.js) ──

  // Sin acentos y en minúsculas, para que "andromeda" encuentre "Andrómeda".
  function normaliza(txt) {
    return String(txt === null || txt === undefined ? '' : txt)
      .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  // Filtra por NOMBRE DEL OBJETO, por subcadena. Búsqueda vacía = todo.
  function filtrarPorNombre(filas, texto) {
    var q = normaliza(texto).trim();
    if (!q) return filas.slice();
    return filas.filter(function (obs) {
      return normaliza(obs.objeto).indexOf(q) !== -1;
    });
  }

  // Reparte las observaciones por viaje conservando su orden. Lo que no
  // tiene viaje (registrado sin base) va a `sin`, para que no desaparezca
  // de la vista en ninguna agrupación.
  function repartirPorViaje(filas) {
    var porViaje = {}, sin = [];
    filas.forEach(function (obs) {
      if (!obs.viaje_id) { sin.push(obs); return; }
      var k = String(obs.viaje_id);
      (porViaje[k] = porViaje[k] || []).push(obs);
    });
    return { porViaje: porViaje, sin: sin };
  }

  // Las funciones puras se publican ANTES de tocar el DOM: así las puede cargar
  // un test de Node (scripts/test_listado_unificado.js) con un `window` de
  // mentira y sin navegador. arrancar() le añade luego el resto del módulo.
  window.BitacoraListado = {
    filtrarPorNombre: filtrarPorNombre,
    repartirPorViaje: repartirPorViaje
  };

  if (typeof document === 'undefined') { return; }   // corriendo bajo Node

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
      var buscador = $('buscador');
      var buscadorCaja = $('buscadorCaja');

      // URL de la página del formulario, para los enlaces de "Editar".
      // Se toma del atributo data-form del contenedor; si falta, se asume esta ruta.
      var contenedor = $('mw-obs-list');
      var URL_FORM = (contenedor && contenedor.getAttribute('data-form')) || '/observaciones-visuales/';
      var URL_FICHA = (contenedor && contenedor.getAttribute('data-ficha')) || '/datos-de-ficha/';

      var viendoPapelera = false;
      // Lo último pintado en la pestaña plana, para poder refiltrarlo al
      // teclear en el buscador sin volver a pedirlo al servidor.
      var ultimasFilas = [];
      // La caché de "mis observaciones": una sola petición por sesión, que
      // comparten la pestaña plana y las tarjetas que cuelgan de cada viaje
      // (agrupar por viaje es una FORMA DE VER lo mismo, no otra consulta).
      // Se invalida al borrar o restaurar, único momento en que miente.
      var cacheObs = null;
      // Cuántas veces ha caducado. bitacora-viajes.js lo mira al volver a su
      // pestaña: si no ha cambiado nada, no repinta (y no cierra los desplegables).
      var cambios = 0;

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

      function pintar(filas) {
        ultimasFilas = filas;
        var q = buscador ? buscador.value : '';
        var vistas = filtrarPorNombre(filas, q);

        if (!vistas.length) {
          if (q.trim()) {
            mostrarMensaje('Ningún objeto coincide con «' + q.trim() + '».');
          } else {
            mostrarMensaje(viendoPapelera
              ? 'La papelera está vacía.'
              : 'Todavía no hay observaciones registradas.');
          }
          return;
        }

        cards.innerHTML = '';
        vistas.forEach(function (obs) {
          cards.appendChild(crearTarjeta(obs));
        });
      }

      // Cabecera de un grupo sin viaje propio ("Sin viaje", "Sin viaje
      // reconocible"). La usa la pestaña de viajes como <summary> de su grupo.
      function cabeceraSueltas(cuantas, titulo, detalle) {
        var h = document.createElement('div');
        h.className = 'viaje-head suelto';
        h.innerHTML =
          '<div class="viaje-t">' + esc(titulo || 'Sin viaje') + '</div>' +
          '<div class="viaje-d">' + esc(detalle || 'Registradas sin base, así que no se pueden agrupar por noche') + '</div>' +
          '<div class="viaje-n">' + cuantas + (cuantas === 1 ? ' objeto' : ' objetos') + '</div>';
        return h;
      }

      /* El telescopio de una tarjeta. Si la observación se hizo con un tubo de la
         flota, manda su NOMBRE PROPIO —es como el observador identifica su
         equipo— y el "vendor modelo" queda detrás, más discreto. Sin nombre
         propio (o sin tubo de flota: las observaciones antiguas, escritas a
         mano) se pinta el texto guardado en la observación, como siempre. */
      function telescopioDe(obs) {
        var r = (window.BitacoraEquipo && obs.tel_nombre)
          ? BitacoraEquipo.rotuloFlota({ nombre: obs.tel_nombre, vendor: obs.tel_vendor, modelo: obs.tel_modelo })
          : { principal: obs.telescopio || '', detalle: '' };
        if (!r.principal) return '';
        return ' <span style="color:var(--tinta-tenue)">· ' + esc(r.principal) + '</span>' +
          (r.detalle ? ' <span style="color:var(--tinta-tenue);opacity:0.65;font-size:0.92em">' + esc(r.detalle) + '</span>' : '');
      }

      // `borrada` va explícito porque las tarjetas de la pestaña de viajes las
      // pide otro script: no puede depender de en qué pestaña crea estar este.
      function crearTarjeta(obs, borrada) {
        var enPapelera = (borrada === undefined) ? viendoPapelera : !!borrada;
        var card = document.createElement('div');
        card.className = 'card' + (enPapelera ? ' deleted' : '');
        card.setAttribute('data-id', obs.id);

        var acciones = accionesDe(obs, enPapelera);

        card.innerHTML =
          '<div class="obj">' + esc(obs.objeto) +
            (obs.audio_url ? ' <span title="Tiene tramo de audio">🎧</span>' : '') +
            '<span class="num">nº ' + esc(obs.id) + '</span></div>' +
          '<div class="meta">' +
            '<div class="who">' + esc(obs.observador) + telescopioDe(obs) + '</div>' +
            '<div class="when">' + fmtFecha(obs.fecha_observacion) + '</div>' +
          '</div>' +
          '<div class="acts">' + acciones + '</div>';

        conectarAcciones(card, obs);
        return card;
      }

      function accionesDe(obs, enPapelera) {
        if (enPapelera) {
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
              invalidar(obs.id);   // la lista guardada ya no dice la verdad
              card.style.transition = 'opacity .3s';
              card.style.opacity = '0';
              setTimeout(function () {
                var enListaPlana = cards.contains(card);
                card.remove();
                if (enListaPlana && !cards.children.length) {
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
              invalidar(obs.id);   // vuelve a estar viva: la lista guardada miente
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

      // La lista guardada deja de valer. `id` es la observación que acaba de
      // moverse: se saca también de lo ya pintado, porque el buscador repinta
      // desde ahí y si no resucitaría la tarjeta recién borrada.
      function invalidar(id) {
        cacheObs = null;
        cambios++;
        if (id === undefined) return;
        ultimasFilas = ultimasFilas.filter(function (o) { return String(o.id) !== String(id); });
      }

      // "Mis observaciones": solo las del usuario en sesión (mias=1), vivas.
      // Es la lista que comparten la pestaña plana y los desplegables de cada
      // viaje, así que se pide UNA vez y se guarda la promesa.
      function observaciones() {
        if (!cacheObs) {
          cacheObs = api(WP.endpoint + '?mias=1').then(function (res) {
            if (!res.ok) { cacheObs = null; throw mensajeError(res, 'No se pudieron cargar las observaciones'); }
            return Array.isArray(res.data) ? res.data : [];
          });
        }
        return cacheObs;
      }

      function cargar() {
        mostrarMensaje('Cargando observaciones…');
        // La papelera es otra consulta (solo las borradas) y no se cachea: se
        // visita poco y su contenido cambia justo cuando se restaura algo.
        var filas = viendoPapelera
          ? api(WP.endpoint + '?mias=1&borradas=1').then(function (res) {
              if (!res.ok) { throw mensajeError(res, 'No se pudieron cargar las observaciones'); }
              return Array.isArray(res.data) ? res.data : [];
            })
          : observaciones();

        filas.then(pintar).catch(function (msg) {
          mostrarMensaje(typeof msg === 'string' ? msg : 'No se pudo contactar con el servidor.', true);
        });
      }

      // Las pestañas las comparten los dos scripts de la página: este manda en
      // la lista de tarjetas y en el buscador; bitacora-viajes.js, en el panel
      // de salidas. Cada uno escucha los mismos botones y hace su mitad.
      function cambiarPestana(cual) {
        viendoPapelera = (cual === 'papelera');
        tabActivas.classList.toggle('active', cual === 'activas');
        tabPapelera.classList.toggle('active', cual === 'papelera');
        if (tabViajes) tabViajes.classList.toggle('active', cual === 'viajes');
        // El buscador solo existe en la lista plana. Se limpia al salir: una
        // caja invisible que sigue filtrando es una trampa.
        if (buscadorCaja) buscadorCaja.hidden = (cual !== 'activas');
        if (buscador && cual !== 'activas') buscador.value = '';

        cards.hidden = (cual === 'viajes');
        if (cual === 'viajes') return;
        cargar();
      }

      tabActivas.addEventListener('click', function () { cambiarPestana('activas'); });
      tabPapelera.addEventListener('click', function () { cambiarPestana('papelera'); });
      if (tabViajes) {
        tabViajes.addEventListener('click', function () { cambiarPestana('viajes'); });
      }

      // Filtrar es repintar lo ya traído: ni petición ni retardo, son unos
      // cientos de filas que ya están en memoria.
      if (buscador) {
        buscador.addEventListener('input', function () { pintar(ultimasFilas); });
      }

      // Lo que este módulo presta a bitacora-viajes.js para poder colgar las
      // tarjetas de cada salida de su desplegable.
      Object.assign(window.BitacoraListado, {
        observaciones: observaciones,
        invalidar: invalidar,
        cambios: function () { return cambios; },
        filtrarPorNombre: filtrarPorNombre,
        repartirPorViaje: repartirPorViaje,
        tarjetasDe: function (filas) {
          return (filas || []).map(function (obs) { return crearTarjeta(obs, false); });
        },
        cabeceraSueltas: cabeceraSueltas
      });

      // La página abre por la pestaña de viajes, así que aquí no se carga nada
      // todavía: la lista plana se pide la primera vez que se entra en ella.
      cards.hidden = !!tabViajes;
      if (!tabViajes) cargar();

    } catch (err) {
      console.error('[Bitácora] Error al iniciar el listado:', err);
      var c = document.getElementById('cards');
      if (c) {
        c.innerHTML = '<div class="msg error">Error al iniciar el listado: ' + err.message + '</div>';
      }
    }
  } // fin de arrancar()

})();
