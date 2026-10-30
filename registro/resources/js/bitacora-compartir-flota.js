/* ===========================================================================
 * BITÁCORA MESSIER · Compartir mi flota (#497)
 * ---------------------------------------------------------------------------
 * Sección «Compartir mi flota» de «Mi flota»: a quién comparto, quién comparte
 * conmigo, alta por nombre de usuario exacto y revocación con confirmación en la
 * propia fila. Habla con /wp-json/bitacora/v1/equipo/compartir (#494).
 *
 * Tres capas, para poder probar el comportamiento sin navegador:
 *   crear(deps)  estado + acciones (api inyectada), devuelve promesas
 *   pintar(est)  estado -> HTML de las dos listas (puro)
 *   montar(...)  pegamento DOM: eventos delegados, foco y anuncios
 *
 * Va SUBIDO POR FTP a /wp-content/uploads/bitacora/ junto a bitacora-base.js.
 * =========================================================================== */
(function (root) {
  'use strict';

  var MSG_NO_ENCONTRADO = 'No encontramos a nadie con ese nombre de usuario o no se puede compartir con esa persona. ' +
    'Comprueba que está escrito igual que en su perfil.';
  var MSG_RED = 'No hemos podido conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.';

  function esc(t) { return root.BitacoraBase.esc(t); }

  /* Texto para el observador de una respuesta que no fue ok. `res` es null si la
     petición rechazó (fallo de red). Nunca devuelve vacío: un error en silencio
     es lo que el criterio 4 prohíbe. */
  function mensajeError(res, porDefecto) {
    if (!res) return MSG_RED;
    var d = res.data || {};
    if (res.status === 429 || d.codigo === 'limite-de-ritmo') {
      var s = Math.max(1, Math.ceil(Number(d.espera) || 1));
      return 'Has hecho demasiados intentos seguidos. Espera ' + s + (s === 1 ? ' segundo' : ' segundos') + ' y vuelve a intentarlo.';
    }
    if (d.codigo === 'no-encontrado-o-no-permitido') return MSG_NO_ENCONTRADO;
    return root.BitacoraBase.errorDe(res, porDefecto || 'No se pudo completar la acción');
  }

  /* ── Estado y acciones ──
     estado.comparto / conmigo: null = sin cargar; [] = vacío; [nombre…].
     estado.confirmando: nombre cuya fila pide confirmar la revocación.
     Cada acción resuelve { error, foco, vaciar } y deja el texto en
     estado.mensaje ({texto, tipo:'ok'|'error'}); la capa DOM solo lo muestra. */
  function crear(deps) {
    var url = deps.url;
    var st = { comparto: null, conmigo: null, confirmando: null, ocupado: false, mensaje: null };

    function fallo(res, porDefecto) {
      st.mensaje = { texto: mensajeError(res, porDefecto), tipo: 'error' };
      return { error: true };
    }
    function llamar(url2, opts) {
      return deps.api(url2, opts).then(function (res) { return { res: res }; },
                                       function () { return { res: null }; });
    }

    function cargar() {
      return llamar(url).then(function (r) {
        if (!r.res || !r.res.ok) return fallo(r.res, 'No se pudo cargar la lista');
        st.comparto = r.res.data.comparto || [];
        st.conmigo = r.res.data.conmigo || [];
        return {};
      });
    }

    function anadir(texto) {
      var nombre = String(texto == null ? '' : texto).trim();
      if (!nombre) {
        st.mensaje = { texto: 'Escribe el nombre de usuario de la persona.', tipo: 'error' };
        return Promise.resolve({ error: true });
      }
      st.ocupado = true;
      return llamar(url, { method: 'POST', body: { usuario: nombre } }).then(function (r) {
        st.ocupado = false;
        if (!r.res || !r.res.ok) return fallo(r.res, 'No se pudo compartir la flota');
        var n = r.res.data.nombre || nombre;
        var ya = r.res.data.codigo === 'ya-compartido';
        var aviso = { texto: ya ? 'Ya compartes con ' + n + '.' : 'Ahora compartes tu flota con ' + n + '.', tipo: 'ok' };
        // Lista sin cargar (falló la carga inicial): se recarga para que aparezca.
        if (!st.comparto) return cargar().then(function () { st.mensaje = aviso; return { vaciar: true }; });
        if (st.comparto.indexOf(n) < 0) st.comparto = st.comparto.concat(n).sort();
        st.mensaje = aviso;
        return { vaciar: true };
      });
    }

    function pedirRevocar(nombre) { st.confirmando = nombre; st.mensaje = null; }
    function cancelar() { var n = st.confirmando; st.confirmando = null; return n; }

    function revocar(nombre) {
      st.ocupado = true;
      return llamar(url + '?usuario=' + encodeURIComponent(nombre), { method: 'DELETE' }).then(function (r) {
        st.ocupado = false;
        st.confirmando = null;
        if (!r.res || !r.res.ok) {
          var e = fallo(r.res, 'No se pudo dejar de compartir');
          // 404: ya no estaba compartido. La lista que se ve está vieja: se recarga.
          if (r.res && r.res.status === 404) return cargar().then(function () { return e; });
          return e;
        }
        var i = st.comparto ? st.comparto.indexOf(nombre) : -1;
        if (i >= 0) st.comparto.splice(i, 1);
        st.mensaje = { texto: 'Has dejado de compartir con ' + nombre + '.', tipo: 'ok' };
        // Foco: la fila que ocupa ahora su sitio; si era la última, el encabezado.
        return { foco: i >= 0 && i < st.comparto.length ? st.comparto[i] : null };
      });
    }

    return { estado: st, cargar: cargar, anadir: anadir, pedirRevocar: pedirRevocar, cancelar: cancelar, revocar: revocar };
  }

  /* ── Pintado (puro) ── */
  function filaComparto(n, confirmando) {
    var q = esc(n);
    if (confirmando) {
      return '<li class="cf-fila cf-confirma" data-n="' + q + '"><span class="cf-nom">' + q + '</span>' +
        '<div class="cf-conf" role="group" aria-label="Confirmar: dejar de compartir con ' + q + '">' +
        '<p>' + q + ' dejará de poder elegir tu equipo. Sus observaciones ya guardadas no cambian.</p>' +
        '<button type="button" class="cf-btn danger" data-a="confirmar" data-n="' + q + '" aria-label="Confirmar: dejar de compartir con ' + q + '">Confirmar</button>' +
        '<button type="button" class="cf-btn" data-a="cancelar" data-n="' + q + '">Cancelar</button></div></li>';
    }
    return '<li class="cf-fila" data-n="' + q + '"><span class="cf-nom">' + q + '</span>' +
      '<button type="button" class="cf-btn danger" data-a="revocar" data-n="' + q + '" aria-label="Dejar de compartir con ' + q + '">Dejar de compartir</button></li>';
  }

  function pintar(est) {
    function lista(items, vacio, fila) {
      if (items === null) return '<li class="cf-vacio">No se pudo cargar la lista.</li>';
      return items.length ? items.map(fila).join('') : '<li class="cf-vacio">' + vacio + '</li>';
    }
    return {
      comparto: lista(est.comparto, 'Aún no compartes tu flota con nadie.', function (n) { return filaComparto(n, est.confirmando === n); }),
      conmigo: lista(est.conmigo, 'Nadie comparte su flota contigo todavía.', function (n) { return '<li class="cf-fila"><span class="cf-nom">' + esc(n) + '</span></li>'; })
    };
  }

  /* ── Pegamento DOM ── */
  function montar(ids, deps) {
    var $ = function (id) { return document.getElementById(id); };
    var c = crear(deps), st = c.estado;
    var form = $(ids.form), campo = $(ids.campo), boton = $(ids.boton);
    var ulC = $(ids.comparto), ulM = $(ids.conmigo), err = $(ids.error), msg = $(ids.estado);

    function enfocarFila(nombre, accion) {
      var el = Array.prototype.filter.call(ulC.querySelectorAll('[data-a="' + accion + '"]'), function (b) { return b.getAttribute('data-n') === nombre; })[0];
      (el || $(ids.encabezado)).focus();
    }
    function dibujar() {
      var h = pintar(st);
      ulC.innerHTML = h.comparto;
      ulM.innerHTML = h.conmigo;
      var e = st.mensaje && st.mensaje.tipo === 'error';
      err.textContent = e ? st.mensaje.texto : '';
      msg.textContent = st.mensaje && !e ? st.mensaje.texto : '';
      campo.setAttribute('aria-invalid', e ? 'true' : 'false');
      boton.disabled = st.ocupado;
      boton.textContent = st.ocupado ? 'Compartiendo…' : 'Compartir';
    }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (st.ocupado) return;
      st.mensaje = null;
      var p = c.anadir(campo.value);
      dibujar();
      p.then(function (r) {
        if (r.vaciar) campo.value = '';
        dibujar();
        campo.focus();
      });
    });

    ulC.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('button[data-a]');
      if (!b || st.ocupado) return;
      var n = b.getAttribute('data-n'), a = b.getAttribute('data-a');
      if (a === 'revocar') { c.pedirRevocar(n); dibujar(); enfocarFila(n, 'cancelar'); }
      else if (a === 'cancelar') { c.cancelar(); dibujar(); enfocarFila(n, 'revocar'); }
      else if (a === 'confirmar') {
        var p = c.revocar(n);
        dibujar();
        p.then(function (r) {
          dibujar();
          if (r.foco) enfocarFila(r.foco, 'revocar'); else $(ids.encabezado).focus();
        });
      }
    });
    ulC.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && st.confirmando) {
        var n = c.cancelar(); dibujar(); enfocarFila(n, 'revocar');
      }
    });

    dibujar();
    c.cargar().then(dibujar);
    return c;
  }

  root.BitacoraCompartirFlota = { crear: crear, pintar: pintar, mensajeError: mensajeError, montar: montar };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.BitacoraCompartirFlota;
})(typeof window !== 'undefined' ? window : globalThis);
