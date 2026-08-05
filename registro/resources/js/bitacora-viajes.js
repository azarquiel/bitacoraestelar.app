/* ===========================================================================
 * BITÁCORA MESSIER · Mis viajes (sesiones de observación)
 * ---------------------------------------------------------------------------
 * Un viaje es la salida de UN observador, UNA noche, desde UN lugar. Aquí se
 * dan de alta y se editan: el LUGAR vive en esta ficha —vale para toda la
 * noche, no objeto a objeto—, y con él la crónica, la meteo, las horas y las
 * condiciones del cielo de esa salida.
 *
 * A qué noche pertenece una fecha lo decide el servidor (regla del mediodía en
 * bitacora-viaje.php), así que el alta se hace pidiéndole el viaje de esa noche
 * y luego rellenando su ficha.
 *
 * Habla con /wp-json/bitacora/v1/viajes*. Va SUBIDO POR FTP a
 * /wp-content/uploads/bitacora/ (como el resto de .js).
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
    var esc = (window.BitacoraBase && BitacoraBase.esc)
      ? BitacoraBase.esc
      : function (t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };

    if (!WP) {
      var n = $('viajeFormNota');
      if (n) n.textContent = 'Inicia sesión para gestionar tus viajes.';
      return;
    }
    var API_VIAJES = WP.endpoint.replace(/observaciones\/?$/, 'viajes');
    var API_NOCHE  = API_VIAJES + '/de-la-noche';
    var API_BASES  = WP.endpoint.replace(/observaciones\/?$/, 'bases');

    function api(url, opts) {
      opts = opts || {}; opts.credentials = 'same-origin';
      opts.headers = opts.headers || {}; opts.headers['X-WP-Nonce'] = WP.nonce;
      if (opts.body) opts.headers['Content-Type'] = 'application/json';
      return fetch(url, opts).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, data: d }; });
      });
    }
    function flash(txt, err) {
      var f = $('flash'); if (!f) return;
      f.textContent = txt; f.className = 'flash show' + (err ? ' err' : '');
      clearTimeout(flash._t); flash._t = setTimeout(function () { f.className = 'flash'; }, 4000);
    }
    function errorDe(res, porDefecto) {
      return (res.data && res.data.message) ? res.data.message : (porDefecto + ' (' + res.status + ')');
    }

    var viajes = [], bases = [], editId = null;

    // Widgets compartidos: la escala Bortle enlazada al SQM y la transparencia
    // enlazada al IR, los mismos que usa el registro para que el dato signifique
    // lo mismo venga de donde venga.
    var cieloCtrl = (window.BitacoraBase && $('vBortle') && $('vSqm'))
      ? BitacoraBase.montarCielo($('vBortle'), $('vSqm')) : null;
    var transpCtrl = (window.BitacoraBase && BitacoraBase.montarTransparencia && $('vTransp') && $('vIr'))
      ? BitacoraBase.montarTransparencia($('vTransp'), $('vIr')) : null;

    // ── Bases (el lugar de la salida) ──────────────────────────────────────
    function poblarBases() {
      var sel = $('vBase'); if (!sel) return;
      var mias = [], comp = [];
      bases.forEach(function (b) { (b.es_mia ? mias : comp).push(b); });
      function opt(b) {
        var extra = [];
        if (b.altitud_m != null && b.altitud_m !== '') extra.push(Math.round(b.altitud_m) + ' m');
        if (!b.es_mia && b.dueno) extra.push(b.dueno);
        return '<option value="' + b.id + '">' + esc(b.nombre) + (extra.length ? ' (' + esc(extra.join(' · ')) + ')' : '') + '</option>';
      }
      var html = '<option value="">— Sin lugar (se preguntará al registrar cada objeto) —</option>';
      if (mias.length) html += '<optgroup label="Mis bases">' + mias.map(opt).join('') + '</optgroup>';
      if (comp.length) html += '<optgroup label="Compartidas / públicas">' + comp.map(opt).join('') + '</optgroup>';
      sel.innerHTML = html;
    }

    // ── Lista de viajes ────────────────────────────────────────────────────
    function pintarViajes() {
      var cont = $('viajesMios'); if (!cont) return;
      if (!viajes.length) {
        cont.innerHTML = '<p class="viajes-empty">Todavía no has registrado ninguna salida. Da de alta la primera aquí abajo.</p>';
        return;
      }
      cont.innerHTML = viajes.map(function (v) {
        var lugar = v.base_nombre ? esc(v.base_nombre) : 'sin lugar registrado';
        var horas = (v.comienzo || v.fin) ? (esc(v.comienzo || '?') + '–' + esc(v.fin || '?')) : '';
        return '<div class="viaje-item" data-id="' + v.id + '">'
          + '<div class="vi-main">'
          + '<div class="vi-nom">' + esc(v.nombre || ('Viaje del ' + v.noche)) + '</div>'
          + '<div class="vi-specs">' + esc(v.noche) + ' · ' + lugar + (horas ? ' · ' + horas : '') + '</div>'
          + '<div class="vi-meta">' + (v.num_objetos ? v.num_objetos + (v.num_objetos === 1 ? ' objeto' : ' objetos') : 'todavía sin objetos')
          + (v.meteo ? ' · ' + esc(v.meteo) : '') + '</div>'
          + '</div>'
          + '<div class="vi-acts">'
          + '<button type="button" class="vi-btn" data-accion="editar">Editar</button>'
          + '<button type="button" class="vi-btn danger" data-accion="borrar"' + (v.num_objetos ? ' disabled title="Tiene observaciones dentro"' : '') + '>Borrar</button>'
          + '</div></div>';
      }).join('');
    }

    function cargar() {
      return Promise.all([
        api(API_VIAJES + '?mios=1'),
        api(API_BASES)
      ]).then(function (r) {
        viajes = Array.isArray(r[0].data) ? r[0].data : [];
        bases  = Array.isArray(r[1].data) ? r[1].data : [];
        poblarBases(); pintarViajes();
      });
    }

    // ── Formulario ─────────────────────────────────────────────────────────
    function valor(id) { var e = $(id); return e ? e.value : ''; }
    function num(id) { var v = valor(id); return v === '' ? null : v; }

    function limpiar() {
      editId = null;
      ['vNombre', 'vComienzo', 'vFin', 'vMeteo', 'vCronica'].forEach(function (id) { if ($(id)) $(id).value = ''; });
      if ($('vNoche')) { $('vNoche').value = ''; $('vNoche').disabled = false; }
      if ($('vBase')) $('vBase').value = '';
      if ($('vSeeing')) $('vSeeing').value = '';
      if ($('viajeFormTitulo')) $('viajeFormTitulo').textContent = 'Registrar una salida';
      if ($('viajeCancelar')) $('viajeCancelar').style.display = 'none';
      if ($('viajeFormNota')) $('viajeFormNota').textContent = '';
    }

    function editar(v) {
      editId = v.id;
      // La noche es la identidad del viaje: se enseña, no se toca. Para cambiarla
      // habría que mover a otra salida todas sus observaciones.
      if ($('vNoche')) { $('vNoche').value = v.noche || ''; $('vNoche').disabled = true; }
      if ($('vNombre')) $('vNombre').value = v.nombre || '';
      if ($('vBase')) $('vBase').value = v.base_id && v.base_id !== '0' ? String(v.base_id) : '';
      if ($('vComienzo')) $('vComienzo').value = v.comienzo || '';
      if ($('vFin')) $('vFin').value = v.fin || '';
      if ($('vMeteo')) $('vMeteo').value = v.meteo || '';
      if ($('vCronica')) $('vCronica').value = v.cronica || '';
      if ($('vSeeing')) $('vSeeing').value = v.seeing == null ? '' : String(v.seeing);
      if ($('vSqm') && v.cielo_sqm != null && v.cielo_sqm !== '') {
        $('vSqm').value = v.cielo_sqm;
        if (cieloCtrl) $('vSqm').dispatchEvent(new Event('input', { bubbles: true }));
      }
      if ($('vIr') && v.cielo_ir != null && v.cielo_ir !== '') {
        $('vIr').value = v.cielo_ir;
        if (transpCtrl) $('vIr').dispatchEvent(new Event('input', { bubbles: true }));
      }
      if ($('viajeFormTitulo')) $('viajeFormTitulo').textContent = 'Editar la salida del ' + (v.noche || '');
      if ($('viajeCancelar')) $('viajeCancelar').style.display = '';
      var f = $('viajeForm'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function ficha() {
      var cielo = cieloCtrl ? cieloCtrl.leer() : { sqm: null, clase: null };
      var transp = transpCtrl ? transpCtrl.leer() : { ir: null };
      return {
        nombre: valor('vNombre'),
        baseId: valor('vBase') ? parseInt(valor('vBase'), 10) : 0,
        comienzo: valor('vComienzo'),
        fin: valor('vFin'),
        meteo: valor('vMeteo'),
        cronica: valor('vCronica'),
        cieloSqm: cielo.sqm, cieloBortle: cielo.clase,
        cieloIr: transp.ir,
        seeing: num('vSeeing')
      };
    }

    var form = $('viajeForm');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var noche = valor('vNoche');
        if (!noche && !editId) { flash('Dime la noche de la salida.', true); return; }
        var btn = $('viajeGuardar'); if (btn) btn.disabled = true;

        // Alta: el servidor decide la noche (regla del mediodía), así que se le
        // pide el viaje de esa fecha a las 22:00 —la salida es de esa noche, no
        // de la anterior— y después se rellena su ficha.
        var conViaje = editId
          ? Promise.resolve(editId)
          : api(API_NOCHE + '?fecha=' + encodeURIComponent(noche) + '&hora=22:00', { method: 'POST' })
              .then(function (r) {
                if (!r.ok || !r.data || !r.data.viaje) { throw errorDe(r, 'No se pudo dar de alta la salida'); }
                return r.data.viaje.id;
              });

        conViaje.then(function (id) {
          return api(API_VIAJES + '/' + id, { method: 'PUT', body: JSON.stringify(ficha()) });
        }).then(function (r) {
          if (!r.ok) { throw errorDe(r, 'No se pudo guardar la salida'); }
          flash(editId ? 'Salida actualizada.' : 'Salida registrada.');
          limpiar();
          return cargar();
        }).catch(function (msg) {
          flash(typeof msg === 'string' ? msg : 'No se pudo guardar la salida.', true);
        }).then(function () {
          if (btn) btn.disabled = false;
        });
      });
    }
    if ($('viajeCancelar')) $('viajeCancelar').addEventListener('click', limpiar);

    // ── Acciones de la lista ───────────────────────────────────────────────
    if ($('viajesMios')) {
      $('viajesMios').addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('button[data-accion]') : null;
        if (!btn) return;
        var caja = btn.closest('.viaje-item');
        var id = caja ? caja.getAttribute('data-id') : null;
        var v = null;
        viajes.forEach(function (x) { if (String(x.id) === String(id)) v = x; });
        if (!v) return;
        if (btn.getAttribute('data-accion') === 'editar') { editar(v); return; }
        if (!window.confirm('¿Borrar la salida del ' + v.noche + '? No se puede deshacer.')) return;
        api(API_VIAJES + '/' + v.id, { method: 'DELETE' }).then(function (r) {
          if (!r.ok) { flash(errorDe(r, 'No se pudo borrar'), true); return; }
          flash('Salida borrada.');
          if (String(editId) === String(v.id)) limpiar();
          return cargar();
        });
      });
    }

    limpiar();
    cargar();
   } catch (e) {
     var nota = document.getElementById('viajeFormNota');
     if (nota) nota.textContent = 'Error al arrancar la página: ' + e.message;
   }
  }
})();
