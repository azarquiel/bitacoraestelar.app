/* ===========================================================================
 * BITÁCORA MESSIER · Mis bases (lugares de observación del observador)
 * ---------------------------------------------------------------------------
 * Listar / añadir / editar / borrar bases (nombre, coords, altitud, zona
 * horaria IANA) y compartirlas (privada / pública / seleccionada). Cada base
 * acumula la "salud" del sitio: histórico de SQM, IR y seeing de todo lo medido
 * allí —en cada observación y en la ficha de cada viaje—, en una gráfica SVG
 * de tres series que se encienden y apagan (vista aparte ?salud=ID).
 * Habla con /wp-json/bitacora/v1/bases*. Reutiliza el mapa (tiles CLAROS).
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
   try {
    var $ = function (id) { return document.getElementById(id); };
    var WP = window.BITACORA_WP || null;
    var esc = (window.BitacoraBase && BitacoraBase.esc)
      ? BitacoraBase.esc
      : function (t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };

    if (!WP) {
      var n = $('baseFormNota');
      if (n) n.textContent = 'Inicia sesión para gestionar tus bases.';
      return;
    }
    var API_BASES = WP.endpoint.replace(/observaciones\/?$/, 'bases');
    var API_OBS   = WP.endpoint.replace(/observaciones\/?$/, 'observadores');

    function api(url, opts) {
      opts = opts || {}; opts.credentials = 'same-origin';
      opts.headers = opts.headers || {}; opts.headers['X-WP-Nonce'] = WP.nonce;
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

    var bases = [], observadores = [], editId = null, map = null, marker = null;

    // ── Zona horaria: selector IANA nativo (sin dataset), TZ del navegador por defecto ──
    (function poblarTz() {
      var sel = $('bTz'); if (!sel) return;
      var actual = 'UTC';
      try { actual = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (_e) {}
      var zonas = [];
      try { if (Intl.supportedValuesOf) zonas = Intl.supportedValuesOf('timeZone'); } catch (_e2) {}
      if (!zonas.length) zonas = [actual, 'UTC'];
      if (zonas.indexOf(actual) < 0) zonas.unshift(actual);
      sel.innerHTML = zonas.map(function (z) { return '<option value="' + esc(z) + '">' + esc(z) + '</option>'; }).join('');
      sel.value = actual;
    })();

    // ── Mapa Leaflet (tiles CLAROS para ver bien el relieve) ──
    function setLatLon(la, lo, recenter) {
      $('bLat').value = la.toFixed(4); $('bLon').value = lo.toFixed(4);
      if (map) {
        if (marker) marker.setLatLng([la, lo]); else marker = L.marker([la, lo]).addTo(map);
        if (recenter) map.setView([la, lo], Math.max(map.getZoom(), 9));
      }
    }
    function cargarCSS(url) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = url; document.head.appendChild(l); }
    function cargarJS(url, ok, err) { var s = document.createElement('script'); s.src = url; s.async = true; s.onload = ok; s.onerror = err; document.head.appendChild(s); }
    function iniciarMapa() {
      try {
        map = L.map('map', { worldCopyJump: true }).setView([37.371, -6.070], 5);
        // OpenTopoMap: fondo claro CON relieve (sombreado + curvas de nivel) y
        // etiquetas de OpenStreetMap en el idioma local (castellano en España).
        L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
          { attribution: '© OpenStreetMap, SRTM · © OpenTopoMap (CC-BY-SA)', maxZoom: 17 }).addTo(map);
        map.on('click', function (e) { setLatLon(e.latlng.lat, e.latlng.lng, false); });
        setTimeout(function () { map.invalidateSize(); }, 200);
      } catch (err) { mapaNo(); }
    }
    function mapaNo() { var c = $('map'); if (c) c.innerHTML = '<div style="padding:20px;color:#556;font-size:13.5px">No se pudo cargar el mapa. Escribe la latitud y la longitud a mano.</div>'; }
    if (window.L && window.L.map) { iniciarMapa(); }
    else { cargarCSS('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'); cargarJS('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', iniciarMapa, mapaNo); }
    var geo = $('geoBtn');
    if (geo) geo.addEventListener('click', function () {
      if (!navigator.geolocation) { alert('Tu navegador no permite geolocalización.'); return; }
      navigator.geolocation.getCurrentPosition(
        function (p) { setLatLon(p.coords.latitude, p.coords.longitude, true); },
        function () { alert('No se pudo obtener la ubicación. Escríbela a mano o pincha en el mapa.'); });
    });

    // ── Visibilidad ↔ caja de compartir ──
    function actualizarCompartir() { $('compartirBox').classList.toggle('hidden', $('bVisibilidad').value !== 'seleccionada'); }
    $('bVisibilidad').addEventListener('change', actualizarCompartir);

    function cargarObservadores() {
      api(API_OBS).then(function (res) {
        if (res.ok && Array.isArray(res.data)) {
          observadores = res.data.filter(function (o) { return o.usuario_id && String(o.usuario_id) !== String(WP.usuarioId); });
          pintarCompartidos([]);
        }
      });
    }
    function pintarCompartidos(seleccionados) {
      var cont = $('compList'); if (!cont) return;
      if (!observadores.length) { cont.innerHTML = '<span class="bases-empty">No hay otros observadores con cuenta.</span>'; return; }
      cont.innerHTML = observadores.map(function (o) {
        var marc = seleccionados.indexOf(parseInt(o.usuario_id, 10)) >= 0 ? 'checked' : '';
        return '<label><input type="checkbox" value="' + o.usuario_id + '" ' + marc + '> ' + esc(o.nombre || o.clave) + '</label>';
      }).join('');
    }
    function leerCompartidos() {
      return Array.prototype.map.call($('compList').querySelectorAll('input:checked'), function (c) { return parseInt(c.value, 10); });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // LISTADOS DE BASES
    // ═══════════════════════════════════════════════════════════════════════
    function etiquetaVis(v) {
      return v === 'publica' ? 'Pública' : (v === 'seleccionada' ? 'Compartida' : 'Privada');
    }
    function cargarBases() {
      api(API_BASES).then(function (res) {
        if (res.ok && Array.isArray(res.data)) { bases = res.data; pintarListas(); }
        else { flash(errorDe(res, 'No se pudieron cargar las bases'), true); }
      });
    }
    function pintarListas() {
      var mias = [], comp = [];
      bases.forEach(function (b) { (b.es_mia ? mias : comp).push(b); });
      pintarEn($('basesMias'), mias, true, 'Aún no tienes bases. Añade una abajo.');
      pintarEn($('basesCompartidas'), comp, false, 'Nadie ha compartido bases contigo (ni hay públicas).');
    }
    function pintarEn(cont, lista, propias, vacio) {
      if (!cont) return;
      cont.innerHTML = '';
      if (!lista.length) { cont.innerHTML = '<div class="bases-empty">' + vacio + '</div>'; return; }
      var top = podio(lista);
      lista.forEach(function (b) { cont.appendChild(crearItem(b, propias, top.indexOf(b.id))); });
    }

    // ── Podio de uso: la base con más observaciones lleva delta dorada; la
    //    segunda, plateada. Las que no tienen observaciones no puntúan; en un
    //    empate manda el orden en que vino la lista (sort estable).
    var DELTA = 'M12 1 C 15.6 7 18.6 15 21 22.6 C 15.5 13.5 8.5 13.5 3 22.6 C 5.4 15 8.4 7 12 1 Z';
    function podio(lista) {
      return lista.filter(function (b) { return Number(b.n_observaciones) > 0; })
        .sort(function (a, b) { return Number(b.n_observaciones) - Number(a.n_observaciones); })
        .slice(0, 2)
        .map(function (b) { return b.id; });
    }
    function medalla(puesto, n) {
      if (puesto < 0) return '';
      var tit = (puesto === 0 ? 'Base con más observaciones' : 'Segunda base con más observaciones') +
                ' · ' + n + ' observación(es)';
      return '<svg class="base-medalla ' + (puesto === 0 ? 'oro' : 'plata') + '" viewBox="0 0 24 24" role="img">' +
             '<title>' + esc(tit) + '</title><path d="' + DELTA + '"/></svg>';
    }

    function crearItem(b, propia, puesto) {
      var el = document.createElement('div');
      el.className = 'base-item';
      var specs = [];
      if (b.lat != null && b.lon != null) specs.push(Number(b.lat).toFixed(4) + ', ' + Number(b.lon).toFixed(4));
      if (b.altitud_m != null && b.altitud_m !== '') specs.push(Math.round(b.altitud_m) + ' m');
      if (b.tz) specs.push(b.tz);
      var meta = etiquetaVis(b.visibilidad) + ' · ' + b.n_observaciones + ' observación(es)';
      if (!propia && b.dueno) meta += ' · de ' + esc(b.dueno);
      el.innerHTML =
        '<div class="bi-main">' +
          '<div class="bi-nom">' + esc(b.nombre) + medalla(puesto, b.n_observaciones) +
            '<span class="base-pill">' + etiquetaVis(b.visibilidad) + '</span></div>' +
          '<div class="bi-specs">' + esc(specs.join(' · ')) + '</div>' +
          '<div class="bi-meta">' + meta + '</div>' +
        '</div>' +
        '<div class="bi-acts"></div>';
      var acts = el.querySelector('.bi-acts');
      var bSalud = boton('Salud', false); bSalud.addEventListener('click', function () { irASalud(b.id); }); acts.appendChild(bSalud);
      if (propia) {
        var bEd = boton('Editar', false); bEd.addEventListener('click', function () { editar(b); }); acts.appendChild(bEd);
        var bDel = boton('Borrar', true);
        if (b.n_observaciones > 0) { bDel.disabled = true; bDel.title = 'Tiene observaciones asociadas: no se puede borrar.'; }
        else { bDel.addEventListener('click', function () { borrar(b); }); }
        acts.appendChild(bDel);
      }
      return el;
    }
    function boton(txt, danger) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'bi-btn' + (danger ? ' danger' : ''); b.textContent = txt;
      return b;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CREAR / EDITAR / BORRAR
    // ═══════════════════════════════════════════════════════════════════════
    function leerFormulario() {
      var lat = parseFloat($('bLat').value), lon = parseFloat($('bLon').value);
      return {
        nombre: $('bNombre').value.trim(),
        lat: isNaN(lat) ? null : lat,
        lon: isNaN(lon) ? null : lon,
        altitud_m: $('bAltitud').value.trim() === '' ? null : parseFloat($('bAltitud').value),
        tz: $('bTz').value,
        visibilidad: $('bVisibilidad').value,
        usuarios: leerCompartidos()
      };
    }
    function resetForm() {
      editId = null;
      $('bNombre').value = ''; $('bLat').value = ''; $('bLon').value = ''; $('bAltitud').value = '';
      $('bVisibilidad').value = 'privada'; actualizarCompartir(); pintarCompartidos([]);
      if (marker && map) { map.removeLayer(marker); marker = null; }
      $('baseFormTitulo').textContent = 'Añadir una base';
      $('baseGuardar').textContent = 'Guardar base';
      $('baseCancelar').style.display = 'none';
      $('baseFormNota').textContent = '';
    }
    function editar(b) {
      editId = b.id;
      $('bNombre').value = b.nombre || '';
      $('bAltitud').value = (b.altitud_m != null && b.altitud_m !== '') ? b.altitud_m : '';
      if (b.tz) $('bTz').value = b.tz;
      $('bVisibilidad').value = b.visibilidad || 'privada'; actualizarCompartir();
      pintarCompartidos(Array.isArray(b.compartidos) ? b.compartidos.map(Number) : []);
      if (b.lat != null && b.lon != null) setLatLon(parseFloat(b.lat), parseFloat(b.lon), true);
      $('baseFormTitulo').textContent = 'Editar la base';
      $('baseGuardar').textContent = 'Guardar cambios';
      $('baseCancelar').style.display = '';
      $('baseFormNota').textContent = '';
      $('baseForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    $('baseCancelar').addEventListener('click', resetForm);
    $('baseForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var datos = leerFormulario();
      if (datos.nombre === '') { $('baseFormNota').innerHTML = '<span style="color:var(--rojo)">Ponle un nombre a la base.</span>'; return; }
      if (datos.lat == null || datos.lon == null) { $('baseFormNota').innerHTML = '<span style="color:var(--rojo)">Fija el lugar en el mapa o escribe lat/lon.</span>'; return; }
      var url = editId ? (API_BASES + '/' + editId) : API_BASES;
      var metodo = editId ? 'PUT' : 'POST';
      $('baseGuardar').disabled = true; $('baseFormNota').textContent = 'Guardando…';
      api(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })
        .then(function (res) {
          $('baseGuardar').disabled = false;
          if (res.ok && res.data && res.data.ok) { flash(editId ? 'Base actualizada.' : 'Base creada.'); resetForm(); cargarBases(); }
          else { $('baseFormNota').innerHTML = '<span style="color:var(--rojo)">✗ ' + esc(errorDe(res, 'No se pudo guardar')) + '</span>'; }
        })
        .catch(function () { $('baseGuardar').disabled = false; $('baseFormNota').innerHTML = '<span style="color:var(--rojo)">✗ Sin conexión.</span>'; });
    });
    function borrar(b) {
      if (!window.confirm('¿Borrar la base «' + b.nombre + '»? No se puede deshacer.')) return;
      api(API_BASES + '/' + b.id, { method: 'DELETE' }).then(function (res) {
        if (res.ok && res.data && res.data.ok) { flash('Base borrada.'); cargarBases(); }
        else { flash(errorDe(res, 'No se pudo borrar'), true); }
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SALUD DE LA BASE (vista aparte ?salud=ID): una gráfica, tres series
    // ═══════════════════════════════════════════════════════════════════════
    function irASalud(id) {
      var u = new URL(window.location.href); u.searchParams.set('salud', id);
      window.history.pushState({}, '', u.toString());
      mostrarSalud(id);
    }
    function volverLista() {
      var u = new URL(window.location.href); u.searchParams.delete('salud');
      window.history.pushState({}, '', u.toString());
      $('vistaSalud').style.display = 'none'; $('vistaLista').style.display = '';
    }
    $('saludVolver').addEventListener('click', volverLista);
    window.addEventListener('popstate', enrutar);

    function mostrarSalud(id) {
      $('vistaLista').style.display = 'none'; $('vistaSalud').style.display = '';
      $('saludGraficas').innerHTML = '<p class="sub">Cargando…</p>'; $('saludTablaCont').innerHTML = '';
      api(API_BASES + '/' + id + '/salud').then(function (res) {
        if (!res.ok || !res.data) { $('saludGraficas').innerHTML = '<p class="sub" style="color:var(--rojo)">✗ ' + esc(errorDe(res, 'No se pudo cargar la salud')) + '</p>'; return; }
        var base = res.data.base || {}, med = res.data.mediciones || [];
        $('saludTitulo').textContent = 'Salud de ' + (base.nombre || 'la base');
        // Escalar y orientar las tres medidas es de BitacoraBase.seriesSalud;
        // aquí solo se pinta lo que devuelve.
        var salud = BitacoraBase.seriesSalud(med);
        if (!salud.series.length) { $('saludGraficas').innerHTML = '<p class="sub">Todavía no hay mediciones de SQM, IR ni seeing desde esta base.</p>'; return; }
        $('saludGraficas').innerHTML = grafica(salud);
        montarInterruptores();
        montarGlobo();
        $('saludTablaCont').innerHTML = tabla(med);
      });
    }

    /* Gráfica única con las tres series. Cada una lleva su propia escala y va
       orientada "arriba = mejor cielo", así que el eje vertical no tiene
       números: los de verdad están en la leyenda, cada uno en su color. */
    function grafica(salud) {
      var W = 680, H = 230, ml = 12, mr = 12, mt = 14, mb = 26;
      var tMin = salud.tMin, tMax = salud.tMax;
      var px = function (t) { return tMax === tMin ? W / 2 : ml + (t - tMin) / (tMax - tMin) * (W - ml - mr); };
      var py = function (y) { return mt + (1 - y) * (H - mt - mb); };
      var redondo = function (v) { return Math.round(v * 100) / 100; };
      var fechaTxt = function (t) { return new Date(t).toISOString().slice(0, 10); };

      var capas = salud.series.map(function (s) {
        var pts = s.puntos.map(function (p) { return px(p.t).toFixed(1) + ',' + py(p.y).toFixed(1); }).join(' ');
        var circ = s.puntos.map(function (p) {
          // Lo que dirá el punto al pasar el ratón viaja con él, en crudo: el
          // globo lo arma el JS con textContent, así que nada de aquí se
          // interpreta como HTML. No va en <title> porque el globo del
          // navegador tarda un segundo en salir y no se puede vestir; quien no
          // use ratón tiene la tabla de abajo, con las mismas mediciones.
          // El aro transparente solo agranda la diana: un punto de 3,2 px de
          // radio es difícil de cazar con el ratón.
          return '<circle cx="' + px(p.t).toFixed(1) + '" cy="' + py(p.y).toFixed(1) + '" r="3.2" fill="' + s.color + '"' +
            ' stroke="transparent" stroke-width="12"' +
            ' data-cuando="' + esc(p.fecha + (p.hora ? ' ' + p.hora : '')) + '"' +
            ' data-medida="' + esc(s.titulo) + '"' +
            ' data-valor="' + esc(String(p.valor) + ' ' + s.unidad) + '"' +
            ' data-quien="' + esc(p.observador || '') + '"/>';
        }).join('');
        return '<g data-serie="' + s.clave + '">' +
          (s.puntos.length > 1 ? '<polyline points="' + pts + '" fill="none" stroke="' + s.color + '" stroke-width="1.6"/>' : '') +
          circ + '</g>';
      }).join('');

      var svg =
        '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" id="saludSvg">' +
          '<line x1="' + ml + '" y1="' + (H - mb) + '" x2="' + (W - mr) + '" y2="' + (H - mb) + '" stroke="var(--linea)"/>' +
          '<text x="' + ml + '" y="' + (H - 8) + '" font-size="10" fill="var(--tinta-tenue)">' + fechaTxt(tMin) + '</text>' +
          '<text x="' + (W - mr) + '" y="' + (H - 8) + '" text-anchor="end" font-size="10" fill="var(--tinta-tenue)">' + fechaTxt(tMax) + '</text>' +
          capas +
        '</svg>';

      // Cada casilla enciende o apaga su línea, con el rango real de la medida:
      // es lo que sustituye a los números del eje vertical.
      var leyenda = salud.series.map(function (s) {
        return '<label class="salud-serie"><input type="checkbox" data-serie="' + s.clave + '" checked />' +
          '<span class="salud-punto" style="background:' + s.color + '"></span>' +
          '<span>' + esc(s.titulo) + ' · ' + redondo(s.abajo) + ' – ' + redondo(s.arriba) + ' ' + esc(s.unidad) +
          ' <span class="sub">(' + esc(s.pista) + ')</span></span></label>';
      }).join('');

      return '<div class="salud-graf"><h3>Cómo estaba el cielo (arriba = mejor)</h3>' + svg +
        '<div class="salud-leyenda">' + leyenda + '</div></div>';
    }
    /* El globo de datos: al pasar el ratón por un punto dice de qué noche es,
       qué medida y cuánto marcó. Se coloca sobre el punto (no sobre el cursor)
       y se pega a los bordes de la caja para no salirse por los extremos, que
       es donde caen la primera y la última noche. */
    function montarGlobo() {
      var graf = $('saludGraficas').querySelector('.salud-graf');
      var svg = $('saludSvg');
      if (!graf || !svg) return;
      var globo = document.createElement('div');
      globo.className = 'salud-tip';
      globo.hidden = true;
      graf.appendChild(globo);

      function punto(destino) { return destino && destino.closest ? destino.closest('circle[data-cuando]') : null; }
      function linea(texto, clase) {
        if (!texto) return;
        var d = document.createElement('div');
        if (clase) d.className = clase;
        d.textContent = texto;      // crudo: nada de lo que traiga se interpreta
        globo.appendChild(d);
      }
      svg.addEventListener('mouseover', function (e) {
        var c = punto(e.target);
        if (!c) return;
        globo.innerHTML = '';
        linea(c.getAttribute('data-cuando'), 'salud-tip-cuando');
        linea(c.getAttribute('data-medida'));
        linea(c.getAttribute('data-valor'), 'salud-tip-valor');
        linea(c.getAttribute('data-quien'), 'sub');
        globo.style.borderColor = c.getAttribute('fill');
        globo.hidden = false;
        // El SVG se estira con la caja, así que las coordenadas de dibujo no
        // valen: las de pantalla sí.
        var r = c.getBoundingClientRect(), g = graf.getBoundingClientRect();
        var x = r.left + r.width / 2 - g.left, ancho = globo.offsetWidth;
        x = Math.max(ancho / 2 + 4, Math.min(g.width - ancho / 2 - 4, x));
        globo.style.left = x + 'px';
        globo.style.top = (r.top - g.top - 8) + 'px';
      });
      svg.addEventListener('mouseout', function (e) {
        if (punto(e.target)) globo.hidden = true;
      });
    }
    function montarInterruptores() {
      var casillas = $('saludGraficas').querySelectorAll('input[data-serie]');
      Array.prototype.forEach.call(casillas, function (c) {
        c.addEventListener('change', function () {
          var g = $('saludSvg').querySelector('g[data-serie="' + c.getAttribute('data-serie') + '"]');
          if (g) g.style.display = c.checked ? '' : 'none';
        });
      });
    }
    function tabla(mediciones) {
      var celda = function (v) { return v == null || v === '' ? '—' : esc(v); };
      var filas = mediciones.slice().reverse().map(function (m) {
        return '<tr><td>' + esc(m.fecha || m.noche || '') + (m.hora ? ' ' + esc(m.hora) : '') + '</td>' +
          '<td>' + celda(m.sqm) + '</td><td>' + celda(m.ir) + '</td><td>' + celda(m.seeing) + '</td>' +
          '<td>' + esc(m.observador || '') + '</td></tr>';
      }).join('');
      return '<table class="salud-tabla"><thead><tr><th>Fecha</th><th>SQM</th><th>IR</th><th>Seeing</th><th>Observador</th></tr></thead><tbody>' + filas + '</tbody></table>';
    }

    // ── Enrutado por ?salud=ID ──
    function enrutar() {
      var m = window.location.search.match(/[?&]salud=(\d+)/);
      if (m) { mostrarSalud(parseInt(m[1], 10)); }
      else { $('vistaSalud').style.display = 'none'; $('vistaLista').style.display = ''; }
    }

    // Arranque
    resetForm();
    cargarObservadores();
    cargarBases();
    enrutar();

   } catch (err) {
     console.error('[Bitácora bases] Error al iniciar:', err);
     var a = document.getElementById('baseFormNota');
     if (a) { a.textContent = 'Error al iniciar Mis bases: ' + err.message; }
   }
  }

})();
