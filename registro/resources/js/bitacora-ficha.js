/* ===========================================================================
 * BITÁCORA MESSIER · Datos de ficha (astrometría) de una observación
 * ---------------------------------------------------------------------------
 * Segundo formulario de la división: sobre una observación ya creada (que
 * aporta el objeto y sus coordenadas RA/Dec), captura los datos de la sesión
 * que necesita la ficha imprimible —fecha, lugar, y a partir de ellos la
 * altitud/azimut del objeto, del Sol y de la Luna— más SQM/IR/temperatura y el
 * enlace al PDF. Se guarda en la tabla de fichas (endpoint ficha-datos).
 *
 * Se abre con ?ficha=ID en la URL. Va SUBIDO POR FTP a
 * /wp-content/uploads/bitacora/  (como el resto de .js).
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

    // ═══════════════════════════════════════════════════════════════════════
    // ASTRONOMÍA DE POSICIÓN (algoritmos de Meeus, sin dependencias)
    // ═══════════════════════════════════════════════════════════════════════
    var D2R = Math.PI / 180, R2D = 180 / Math.PI;
    function rev(x) { return ((x % 360) + 360) % 360; }
    function julianDay(date) {
      var Y = date.getUTCFullYear(), M = date.getUTCMonth() + 1,
          D = date.getUTCDate() + (date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600) / 24;
      if (M <= 2) { Y -= 1; M += 12; }
      var A = Math.floor(Y / 100), B = 2 - A + Math.floor(A / 4);
      return Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1)) + D + B - 1524.5;
    }
    function sunPos(jd) {
      var T = (jd - 2451545) / 36525;
      var L0 = rev(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
      var M = rev(357.52911 + 35999.05029 * T - 0.0001537 * T * T) * D2R;
      var C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) + (0.019993 - 0.000101 * T) * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
      var tl = (L0 + C) * D2R, eps = (23.439291 - 0.0130042 * T) * D2R;
      return { ra: rev(Math.atan2(Math.cos(eps) * Math.sin(tl), Math.cos(tl)) * R2D),
               dec: Math.asin(Math.sin(eps) * Math.sin(tl)) * R2D };
    }
    function moonPos(jd) {
      var T = (jd - 2451545) / 36525;
      var Lp = rev(218.3164477 + 481267.88123421 * T),
          D = rev(297.8501921 + 445267.1114034 * T) * D2R,
          M = rev(357.5291092 + 35999.0502909 * T) * D2R,
          Mp = rev(134.9633964 + 477198.8675055 * T) * D2R,
          F = rev(93.272095 + 483202.0175233 * T) * D2R;
      var lon = Lp + (6.288774 * Math.sin(Mp) + 1.274027 * Math.sin(2 * D - Mp) + 0.658314 * Math.sin(2 * D)
                + 0.213618 * Math.sin(2 * Mp) - 0.185116 * Math.sin(M) - 0.114332 * Math.sin(2 * F));
      var lat = (5.128122 * Math.sin(F) + 0.280602 * Math.sin(Mp + F) + 0.277693 * Math.sin(Mp - F)
                + 0.173237 * Math.sin(2 * D - F) + 0.055413 * Math.sin(2 * D + F - Mp));
      lon = rev(lon) * D2R; lat = lat * D2R; var eps = (23.439291 - 0.0130042 * T) * D2R;
      return { ra: rev(Math.atan2(Math.sin(lon) * Math.cos(eps) - Math.tan(lat) * Math.sin(eps), Math.cos(lon)) * R2D),
               dec: Math.asin(Math.sin(lat) * Math.cos(eps) + Math.cos(lat) * Math.sin(eps) * Math.sin(lon)) * R2D };
    }
    function gmst(jd) {
      var T = (jd - 2451545) / 36525;
      return rev(280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * T * T - T * T * T / 38710000);
    }
    function altAz(ra, dec, jd, lat, lon) {
      var lst = rev(gmst(jd) + lon), H = rev(lst - ra) * D2R;
      var la = lat * D2R, de = dec * D2R;
      var alt = Math.asin(Math.sin(la) * Math.sin(de) + Math.cos(la) * Math.cos(de) * Math.cos(H));
      var az = Math.atan2(-Math.cos(de) * Math.sin(H), Math.sin(de) * Math.cos(la) - Math.cos(de) * Math.sin(la) * Math.cos(H));
      return { alt: alt * R2D, az: rev(az * R2D) };
    }
    function refract(alt) {
      if (alt < -1) return alt;
      return alt + (1 / 60) * (1.02 / Math.tan((alt + 10.3 / (alt + 5.11)) * D2R));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DOM Y ESTADO
    // ═══════════════════════════════════════════════════════════════════════
    var whenInput = $('when'), latInput = $('lat'), lonInput = $('lon'),
        submitBtn = $('submitBtn'), outNote = $('outNote'), cabecera = $('fichaObjeto');

    var obsId = null;
    (function () { var m = window.location.search.match(/[?&]ficha=(\d+)/); if (m) obsId = parseInt(m[1], 10); })();

    var OBS = null;          // { ra, dec, etiqueta }
    var lastComputed = null;

    function fmtDeg(v) { return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1) + '°'; }
    function fmtAz(v) {
      var dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
      return v.toFixed(1) + '° <small>' + dirs[Math.round(v / 22.5) % 16] + '</small>';
    }
    function valor(id) { var el = $(id); return (el && el.value.trim() !== '') ? parseFloat(el.value) : null; }

    function api(url, opts) {
      opts = opts || {}; opts.credentials = 'same-origin';
      opts.headers = opts.headers || {}; opts.headers['X-WP-Nonce'] = WP.nonce;
      return fetch(url, opts).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, data: d }; });
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MAPA (Leaflet, cargado dinámicamente; si falla, se escribe a mano)
    // ═══════════════════════════════════════════════════════════════════════
    var map = null, marker = null;
    function setLatLon(la, lo, recenter) {
      latInput.value = la.toFixed(4); lonInput.value = lo.toFixed(4);
      if (map) {
        if (marker) marker.setLatLng([la, lo]); else marker = L.marker([la, lo]).addTo(map);
        if (recenter) map.setView([la, lo], Math.max(map.getZoom(), 9));
      }
      recompute();
    }
    function cargarCSS(url) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = url; document.head.appendChild(l); }
    function cargarJS(url, ok, err) { var s = document.createElement('script'); s.src = url; s.async = true; s.onload = ok; s.onerror = err; document.head.appendChild(s); }
    function iniciarMapa() {
      try {
        map = L.map('map', { worldCopyJump: true }).setView([37.371, -6.070], 5);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
          { attribution: '© OpenStreetMap © CARTO', maxZoom: 19 }).addTo(map);
        map.on('click', function (e) { setLatLon(e.latlng.lat, e.latlng.lng, false); });
        setTimeout(function () { map.invalidateSize(); }, 200);
      } catch (err) { mapaNoDisponible(); }
    }
    function mapaNoDisponible() {
      var c = $('map'); if (!c) return;
      c.style.display = 'grid'; c.style.placeItems = 'center'; c.style.padding = '20px'; c.style.textAlign = 'center';
      c.innerHTML = '<div style="color:#8ea0bd;font-size:13.5px;line-height:1.5">No se pudo cargar el mapa.<br>Escribe la latitud y la longitud a mano.</div>';
    }
    if (window.L && window.L.map) {
      iniciarMapa();
    } else {
      cargarCSS('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
      cargarJS('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', iniciarMapa, mapaNoDisponible);
    }
    latInput.addEventListener('input', function () { var la = parseFloat(latInput.value), lo = parseFloat(lonInput.value); if (!isNaN(la) && !isNaN(lo)) setLatLon(la, lo, true); else recompute(); });
    lonInput.addEventListener('input', function () { var la = parseFloat(latInput.value), lo = parseFloat(lonInput.value); if (!isNaN(la) && !isNaN(lo)) setLatLon(la, lo, true); else recompute(); });
    $('geoBtn').addEventListener('click', function () {
      if (!navigator.geolocation) { alert('Tu navegador no permite geolocalización.'); return; }
      navigator.geolocation.getCurrentPosition(function (p) { setLatLon(p.coords.latitude, p.coords.longitude, true); },
        function () { alert('No se pudo obtener la ubicación. Escríbela a mano o pincha en el mapa.'); });
    });
    whenInput.addEventListener('input', recompute);
    ['sqm', 'ir', 'temp', 'pdf'].forEach(function (id) { var el = $(id); if (el) el.addEventListener('input', recompute); });

    // ═══════════════════════════════════════════════════════════════════════
    // CÁLCULO EN TIEMPO REAL
    // ═══════════════════════════════════════════════════════════════════════
    function recompute() {
      lastComputed = null; submitBtn.disabled = true;
      if (!OBS) return;
      var la = parseFloat(latInput.value), lo = parseFloat(lonInput.value), whenVal = whenInput.value;
      var haveWhere = !isNaN(la) && !isNaN(lo), haveWhen = !!whenVal;

      if (!(haveWhen && haveWhere)) {
        $('compTitle').textContent = 'A la espera de datos';
        $('compSub').textContent = 'Indica la fecha/hora y el lugar para calcular la posición.';
        ['objAlt', 'objAz', 'sunAlt', 'moonAlt'].forEach(function (id) { $(id).textContent = '—'; });
        $('visibility').className = 'visibility';
        return;
      }
      var date = new Date(whenVal), jd = julianDay(date);
      var obj = altAz(OBS.ra, OBS.dec, jd, la, lo);
      var s = sunPos(jd), sun = altAz(s.ra, s.dec, jd, la, lo);
      var m = moonPos(jd), moon = altAz(m.ra, m.dec, jd, la, lo);
      var objAltR = refract(obj.alt);

      $('compTitle').textContent = OBS.etiqueta;
      $('compSub').textContent = 'Posición calculada para la fecha, hora y lugar indicados.';
      $('objAlt').innerHTML = fmtDeg(objAltR);
      $('objAz').innerHTML = fmtAz(obj.az);
      $('sunAlt').innerHTML = fmtDeg(sun.alt);
      $('moonAlt').innerHTML = fmtDeg(moon.alt);

      var vis = $('visibility');
      if (objAltR < 0) { vis.className = 'visibility down'; vis.textContent = '⚠ El objeto estaba bajo el horizonte en ese momento.'; }
      else if (sun.alt > 0) { vis.className = 'visibility down'; vis.textContent = '⚠ El Sol estaba sobre el horizonte: era de día.'; }
      else {
        vis.className = 'visibility up';
        var cond = sun.alt < -18 ? 'noche astronómica' : (sun.alt < -12 ? 'crepúsculo astronómico' : (sun.alt < -6 ? 'crepúsculo náutico' : 'crepúsculo civil'));
        vis.textContent = '✓ Objeto a ' + objAltR.toFixed(1) + '° sobre el horizonte · ' + cond + '.';
      }

      lastComputed = {
        ra: OBS.ra, dec: OBS.dec,
        fechaHoraLocal: whenVal, fechaHoraUTC: date.toISOString(),
        lat: la, lon: lo,
        objAlt: +objAltR.toFixed(2), objAz: +obj.az.toFixed(2),
        sunAlt: +sun.alt.toFixed(2), moonAlt: +moon.alt.toFixed(2),
        sqm: valor('sqm'), ir: valor('ir'), temp: valor('temp'),
        pdf: ($('pdf') ? $('pdf').value.trim() : '')
      };
      submitBtn.disabled = false;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CARGA DE LA OBSERVACIÓN Y SU FICHA
    // ═══════════════════════════════════════════════════════════════════════
    function cargar() {
      if (!WP) { outNote.textContent = 'Inicia sesión para editar la ficha.'; return; }
      if (!obsId) { outNote.textContent = 'Falta el identificador de la observación en la URL (?ficha=ID).'; return; }

      api(WP.endpoint + '/' + obsId).then(function (res) {
        if (!res.ok) {
          outNote.innerHTML = '<span style="color:var(--rojo)">✗ No se pudo cargar la observación nº ' + obsId + '.</span>';
          return;
        }
        var o = res.data;
        OBS = { ra: parseFloat(o.ra), dec: parseFloat(o.decl), etiqueta: (o.objeto_etiqueta || o.objeto || '') };
        if (cabecera) cabecera.textContent = OBS.etiqueta + (o.observador ? (' · ' + o.observador) : '');
        return api(WP.endpoint + '/' + obsId + '/ficha-datos').then(function (fres) {
          if (fres.ok && fres.data && fres.data.observacion_id) { precargar(fres.data); }
          recompute();
        });
      }).catch(function () {
        outNote.innerHTML = '<span style="color:var(--rojo)">✗ No se pudo contactar con el servidor.</span>';
      });
    }

    function precargar(f) {
      if (f.fecha_hora_local) whenInput.value = f.fecha_hora_local;
      if (f.sqm !== null && f.sqm !== undefined && f.sqm !== '') $('sqm').value = f.sqm;
      if (f.ir !== null && f.ir !== undefined && f.ir !== '') $('ir').value = f.ir;
      if (f.temp !== null && f.temp !== undefined && f.temp !== '') $('temp').value = f.temp;
      if ($('pdf') && f.pdf) $('pdf').value = f.pdf;
      var la = parseFloat(f.lat), lo = parseFloat(f.lon);
      if (!isNaN(la) && !isNaN(lo)) setLatLon(la, lo, true);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GUARDAR (PUT ficha-datos)
    // ═══════════════════════════════════════════════════════════════════════
    $('fichaForm').addEventListener('submit', function (e) {
      e.preventDefault();
      if (!lastComputed || !obsId || !WP) return;
      submitBtn.disabled = true; outNote.textContent = 'Guardando…';
      api(WP.endpoint + '/' + obsId + '/ficha-datos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lastComputed)
      }).then(function (res) {
        submitBtn.disabled = false;
        if (res.ok && res.data && res.data.ok) {
          outNote.innerHTML = '<span style="color:var(--verde)">✓ Datos de ficha guardados.</span>';
          return;
        }
        var msg = (res.data && res.data.message) ? res.data.message : ('Error ' + res.status);
        if (res.status === 401) msg = 'Debes iniciar sesión.';
        if (res.status === 403) msg = 'Solo puedes editar tus propias observaciones.';
        outNote.innerHTML = '<span style="color:var(--rojo)">✗ ' + msg + '</span>';
      }).catch(function () {
        submitBtn.disabled = false;
        outNote.innerHTML = '<span style="color:var(--rojo)">✗ No se pudo contactar con el servidor.</span>';
      });
    });

    // Fecha/hora por defecto: ahora (hora local).
    (function () { var n = new Date(); n.setMinutes(n.getMinutes() - n.getTimezoneOffset()); whenInput.value = n.toISOString().slice(0, 16); })();

    cargar();

   } catch (err) {
     console.error('[Bitácora ficha] Error al iniciar:', err);
     var a = document.getElementById('outNote');
     if (a) { a.textContent = 'Error al iniciar el formulario de ficha: ' + err.message; }
   }
  }

})();
