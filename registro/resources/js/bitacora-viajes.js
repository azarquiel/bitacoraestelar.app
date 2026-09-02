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
    var API_VIAJES = BitacoraBase.ruta('viajes');
    var API_NOCHE  = API_VIAJES + '/de-la-noche';
    var API_BASES  = BitacoraBase.ruta('bases');
    // El estado de una salida, lo que el motor OAL convierte en XML y en correo.
    var API_ESTADO = BitacoraBase.ruta('estado-oal');
    // El mapa interestelar, donde se ve la ruta de un viaje (?viaje=<id>).
    var MAPA_URL   = 'https://bitacoraestelar.app/mapa.html';

    // Acceso a la API, aviso efímero y mensajes de error: fuente única en
    // bitacora-base.js (había cinco copias de api() y ya habían divergido).
    var api = BitacoraBase.api, flash = BitacoraBase.flash, errorDe = BitacoraBase.errorDe;

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
        // La ruta: los objetos visitados en el orden en que se observaron (lo
        // decide el servidor, ver objetos_ruta). Solo texto, sin enlaces: el
        // recorrido entero se ve en el mapa con el botón de al lado.
        var ruta = (v.objetos && v.objetos.length)
          ? '<div class="vi-ruta">' + v.objetos.map(function (o) {
              return '<span class="vi-obj">' + esc(o.replace(' (coordenadas manuales)', '')) + '</span>';
            }).join('<span class="vi-flecha">→</span>') + '</div>'
          : '';
        return '<div class="viaje-item" data-id="' + v.id + '">'
          + '<div class="vi-main">'
          + '<div class="vi-nom">' + esc(v.nombre || ('Viaje del ' + v.noche)) + '</div>'
          + '<div class="vi-specs">' + esc(v.noche) + ' · ' + lugar + (horas ? ' · ' + horas : '') + '</div>'
          + '<div class="vi-meta">' + (v.num_objetos ? v.num_objetos + (v.num_objetos === 1 ? ' objeto' : ' objetos') : 'todavía sin objetos')
          + (v.meteo ? ' · ' + esc(v.meteo) : '') + '</div>'
          + ruta
          + '</div>'
          + '<div class="vi-acts">'
          + (v.num_objetos
              ? '<a class="vi-btn mapa" target="_blank" rel="noopener"'
                + ' href="' + MAPA_URL + '?viaje=' + v.id + '">Ver en el mapa</a>'
              : '')
          + (v.num_objetos
              ? '<button type="button" class="vi-btn" data-accion="exportar"'
                + ' title="Bajar esta salida en XML (OAL)">Exportar</button>'
                + '<button type="button" class="vi-btn" data-accion="correo"'
                + ' title="Abrir el correo de esta salida, ya compuesto">Correo</button>'
              : '')
          + '<button type="button" class="vi-btn" data-accion="editar">Editar</button>'
          + '<button type="button" class="vi-btn danger" data-accion="borrar"' + (v.num_objetos ? ' disabled title="Tiene observaciones dentro"' : '') + '>Borrar</button>'
          + '</div>'
          // Los objetos de la salida, plegados. La ficha de arriba no cambia:
          // el <details> va debajo, así que ninguno de sus botones queda dentro
          // de un <summary> (donde el clic los pisaría).
          + (v.num_objetos
              ? '<details class="vi-objetos" data-viaje="' + v.id + '">'
                + '<summary>Objetos de la salida</summary>'
                + '<div class="cards"></div></details>'
              : '')
          + '</div>';
      }).join('');
    }

    // ── Los objetos de cada salida ─────────────────────────────────────────
    // Las tarjetas las fabrica bitacora-listado.js, que es su dueño: aquí solo
    // se colocan. La lista de observaciones es la MISMA que ve la pestaña
    // plana, así que se pide a su caché en vez de volver a bajarla.

    // Las tarjetas de una salida se fabrican la PRIMERA vez que se despliega.
    // Construirlas todas al cargar son cientos de nodos y dos listeners por
    // tarjeta que casi nadie llega a mirar: los desplegables nacen cerrados.
    function llenarAlAbrir(det, caja, L, filas) {
      var hecho = false;
      function llenar() {
        if (hecho) return;
        hecho = true;
        var frag = document.createDocumentFragment();
        L.tarjetasDe(filas).forEach(function (n) { frag.appendChild(n); });
        caja.innerHTML = '';
        caja.appendChild(frag);
      }
      if (det.open) { llenar(); return; }   // ya abierto: nada que aplazar
      det.addEventListener('toggle', llenar);
    }

    function grupoSuelto(L, obs, titulo, detalle) {
      var d = document.createElement('details');
      d.className = 'grupo-suelto';
      var s = document.createElement('summary');
      s.appendChild(L.cabeceraSueltas(obs.length, titulo, detalle));
      d.appendChild(s);
      var caja = document.createElement('div');
      caja.className = 'cards';
      d.appendChild(caja);
      llenarAlAbrir(d, caja, L, obs);
      return d;
    }

    // `filas` son las observaciones ya traídas por cargar(). Se reciben como
    // argumento (y no se piden aquí) para que la petición salga a la vez que
    // las de viajes y bases: no depende de ninguna de las dos.
    function pintarObjetos(filas) {
      var L = window.BitacoraListado;
      if (!L || !filas) return;   // sin objetos colgados: las fichas ya se ven
      var grupos = L.repartirPorViaje(filas);
      var conocidos = {};
      viajes.forEach(function (v) { conocidos[String(v.id)] = true; });

      var huerfanas = [];
      Object.keys(grupos.porViaje).forEach(function (id) {
        var suyas = grupos.porViaje[id];
        if (!conocidos[id]) { huerfanas = huerfanas.concat(suyas); return; }
        var det = document.querySelector('#viajesMios details[data-viaje="' + id + '"]');
        if (!det) return;   // viaje que el servidor da por vacío: nada que colgar
        llenarAlAbrir(det, det.querySelector('.cards'), L, suyas);
      });

      // Lo que no cuelga de ninguna salida conocida NO se pierde de vista:
      // va al final, con su propio epígrafe plegable.
      var cont = $('viajesSueltos');
      if (!cont) return;
      cont.innerHTML = '';
      if (grupos.sin.length) {
        cont.appendChild(grupoSuelto(L, grupos.sin, 'Sin viaje', null));
      }
      if (huerfanas.length) {
        cont.appendChild(grupoSuelto(L, huerfanas, 'Sin viaje reconocible',
          'Apuntan a una salida que no está en tu lista'));
      }
    }

    // Las tres peticiones salen a la vez: los objetos no dependen ni de los
    // viajes ni de las bases, y pedirlos después costaba una vuelta entera al
    // servidor con la página ya pintada a medias.
    function cargar() {
      var L = window.BitacoraListado;
      return Promise.all([
        api(API_VIAJES + '?mios=1'),
        api(API_BASES),
        (L && L.observaciones)
          ? L.observaciones().catch(function () { return null; })
          : Promise.resolve(null)
      ]).then(function (r) {
        viajes = Array.isArray(r[0].data) ? r[0].data : [];
        bases  = Array.isArray(r[1].data) ? r[1].data : [];
        poblarBases(); pintarViajes();
        pintarObjetos(Array.isArray(r[2]) ? r[2] : null);
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

    // ── Exportar (OAL) ─────────────────────────────────────────────────────
    // El servidor devuelve el ESTADO de la salida y el motor de la plantilla lo
    // convierte, aquí mismo: el dialecto OAL tiene un solo escritor (ADR 0003),
    // y el correo y el fichero salen del mismo estado para que no puedan contar
    // cosas distintas.

    /* Un fallo que no sea el aviso ya enseñado ('sin motor') tiene que verse:
       callarlo deja el botón como si no hiciera nada. El detalle, a la consola. */
    function fallo(msg) {
      if (msg === 'sin motor') { return; }
      if (typeof msg === 'string') { flash(msg, true); return; }
      console.error('[bitacora] exportar OAL', msg);
      flash('No se pudo exportar la salida.', true);
    }

    function estadoDe(v) {
      var OAL = window.PlantillaOAL;
      if (!OAL) {
        flash('Falta el motor OAL (bitacora-oal-motor.js).', true);
        return Promise.reject('sin motor');
      }
      return api(API_ESTADO + '?viaje=' + encodeURIComponent(v.id)).then(function (r) {
        if (!r.ok) { throw errorDe(r, 'No se pudo preparar la exportación'); }
        return r.data;
      });
    }

    function bajar(nombre, contenido, tipo) {
      var url = URL.createObjectURL(new Blob([contenido], { type: tipo + ';charset=utf-8' }));
      var a = document.createElement('a');
      a.href = url; a.download = nombre;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    function exportar(v) {
      estadoDe(v).then(function (estado) {
        bajar('bitacora-' + (v.noche || 'salida') + '.xml',
              window.PlantillaOAL.xmlDe(estado), 'application/xml');
        flash('Salida exportada. Ábrela en la plantilla para corregirla y vuelve a subirla.');
      }).catch(fallo);
    }

    // El correo se abre en una pestaña ya compuesto: se selecciona todo y se
    // pega en el mensaje, con su formato. Nada de lo que sale de aquí lo ha
    // redactado una máquina (ADR 0004).
    function correo(v) {
      estadoDe(v).then(function (estado) {
        var cuerpo = window.PlantillaOAL.textoDe(estado);
        var doc = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">'
          + '<title>Correo de la salida del ' + esc(v.noche || '') + '</title></head>'
          + '<body style="font:15px/1.5 system-ui,sans-serif;max-width:800px;margin:24px auto;padding:0 16px">'
          + cuerpo + '</body></html>';
        var w = window.open(URL.createObjectURL(new Blob([doc], { type: 'text/html;charset=utf-8' })), '_blank');
        if (!w) { flash('El navegador ha bloqueado la ventana del correo.', true); }
      }).catch(fallo);
    }

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
        var accion = btn.getAttribute('data-accion');
        if (accion === 'editar') { editar(v); return; }
        if (accion === 'exportar') { exportar(v); return; }
        if (accion === 'correo') { correo(v); return; }
        if (!window.confirm('¿Borrar la salida del ' + v.noche + '? No se puede deshacer.')) return;
        api(API_VIAJES + '/' + v.id, { method: 'DELETE' }).then(function (r) {
          if (!r.ok) { flash(errorDe(r, 'No se pudo borrar'), true); return; }
          flash('Salida borrada.');
          if (String(editId) === String(v.id)) limpiar();
          return cargar();
        });
      });
    }

    // ── Pestañas ───────────────────────────────────────────────────────────
    // Las tres pestañas de la barra las comparten los dos scripts: este manda
    // en el panel de salidas; bitacora-listado.js, en la lista de tarjetas y
    // en el buscador. Cada uno escucha los mismos botones y hace su mitad.
    var panel = $('panelViajes');
    var vistos = 0;   // cuántos cambios de la lista de observaciones llevamos vistos

    function verPanel(si) {
      if (panel) panel.hidden = !si;
      if (!si) return;
      // Solo se repinta si algo se ha borrado o restaurado desde la última vez:
      // si no, se conservan los desplegables que el observador dejó abiertos.
      var L = window.BitacoraListado;
      var ahora = L && L.cambios ? L.cambios() : 0;
      if (ahora !== vistos) { vistos = ahora; cargar(); }
    }

    ['tabActivas', 'tabPapelera'].forEach(function (id) {
      if ($(id)) $(id).addEventListener('click', function () { verPanel(false); });
    });
    if ($('tabViajes')) $('tabViajes').addEventListener('click', function () { verPanel(true); });

    limpiar();
    cargar();
   } catch (e) {
     var nota = document.getElementById('viajeFormNota');
     if (nota) nota.textContent = 'Error al arrancar la página: ' + e.message;
   }
  }
})();
