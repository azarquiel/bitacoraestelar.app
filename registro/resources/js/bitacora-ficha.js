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
    // ASTRONOMÍA DE POSICIÓN
    // ═══════════════════════════════════════════════════════════════════════
    // Los algoritmos de Meeus y la conversión de hora local de la base a UTC
    // viven en BitacoraAstro (bitacora-astro.js), fuente única con el formulario
    // de registro: la altura que se guarda al registrar y la que se recalcula
    // aquí salen del mismo código. Test: scripts/test_astro.js.

    // ═══════════════════════════════════════════════════════════════════════
    // DOM Y ESTADO
    // ═══════════════════════════════════════════════════════════════════════
    var whenInput = $('when'), baseSelect = $('baseSelect'),
        submitBtn = $('submitBtn'), outNote = $('outNote'), cabecera = $('fichaObjeto');

    var obsId = null;
    (function () { var m = window.location.search.match(/[?&]ficha=(\d+)/); if (m) obsId = parseInt(m[1], 10); })();

    var OBS = null;          // { ra, dec, etiqueta }
    var lastComputed = null;

    // La ubicación es la BASE elegida (fuente única): sus lat/lon/tz. Sin base no
    // se calcula ni se guarda la ficha.
    var listaBases = [], baseSel = null, basePendiente = null;

    function escOpt(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function basePorId(id) { for (var i = 0; i < listaBases.length; i++) { if (String(listaBases[i].id) === String(id)) return listaBases[i]; } return null; }

    function fmtDeg(v) { return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1) + '°'; }
    function fmtAz(v) {
      var dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
      return v.toFixed(1) + '° <small>' + dirs[Math.round(v / 22.5) % 16] + '</small>';
    }
    function valor(id) { var el = $(id); return (el && el.value.trim() !== '') ? parseFloat(el.value) : null; }

    // Acceso a la API: fuente única en bitacora-base.js (había cinco copias
    // de api() y ya habían divergido).
    var api = BitacoraBase.api;

    // ═══════════════════════════════════════════════════════════════════════
    // BASES (la ubicación es la base elegida; su mapa vive en "Mis bases")
    // ═══════════════════════════════════════════════════════════════════════
    function poblarBases() {
      if (!baseSelect) return;
      var mias = [], comp = [];
      listaBases.forEach(function (b) { (b.es_mia ? mias : comp).push(b); });
      function opt(b) {
        var extra = [];
        if (b.altitud_m != null && b.altitud_m !== '') extra.push(Math.round(b.altitud_m) + ' m');
        if (!b.es_mia && b.dueno) extra.push(b.dueno);
        return '<option value="' + b.id + '">' + escOpt(b.nombre) + (extra.length ? ' (' + escOpt(extra.join(' · ')) + ')' : '') + '</option>';
      }
      var html = '<option value="">— Elige una base —</option>';
      if (mias.length) html += '<optgroup label="Mis bases">' + mias.map(opt).join('') + '</optgroup>';
      if (comp.length) html += '<optgroup label="Compartidas / públicas">' + comp.map(opt).join('') + '</optgroup>';
      baseSelect.innerHTML = html;
      if (baseSel) baseSelect.value = String(baseSel.id);
    }
    function cargarBases() {
      var API = BitacoraBase.ruta('bases');
      return api(API).then(function (res) {
        if (res.ok && Array.isArray(res.data)) {
          listaBases = res.data;
          if (basePendiente != null) { baseSel = basePorId(basePendiente); basePendiente = null; }
          poblarBases();
        }
      });
    }
    if (baseSelect) baseSelect.addEventListener('change', function () {
      baseSel = baseSelect.value ? basePorId(baseSelect.value) : null;
      recompute();
    });
    whenInput.addEventListener('input', recompute);
    ['temp', 'pdf'].forEach(function (id) { var el = $(id); if (el) el.addEventListener('input', recompute); });

    // ═══════════════════════════════════════════════════════════════════════
    // CÁLCULO EN TIEMPO REAL
    // ═══════════════════════════════════════════════════════════════════════
    function recompute() {
      lastComputed = null; submitBtn.disabled = true;
      if (!OBS) return;
      var whenVal = whenInput.value;
      var haveBase = !!(baseSel && baseSel.lat != null && baseSel.lon != null), haveWhen = !!whenVal;

      if (!(haveWhen && haveBase)) {
        $('compTitle').textContent = 'A la espera de datos';
        $('compSub').textContent = haveWhen ? 'Elige una base: la ficha no se genera sin lugar.' : 'Indica la fecha/hora y elige una base para calcular la posición.';
        ['objAlt', 'objAz', 'sunAlt', 'moonAlt'].forEach(function (id) { $(id).textContent = '—'; });
        $('visibility').className = 'visibility';
        return;
      }
      var la = parseFloat(baseSel.lat), lo = parseFloat(baseSel.lon);
      var p = BitacoraAstro.posiciones({
        fechaHoraLocal: whenVal, tz: baseSel.tz || '',
        lat: la, lon: lo, ra: OBS.ra, dec: OBS.dec
      });
      if (!p) return;
      var obj = p.objeto, sun = p.sol, moon = p.luna;
      var objAltR = obj.alt;   // ya viene refractada; el Sol y la Luna, geométricos

      $('compTitle').textContent = OBS.etiqueta;
      $('compSub').textContent = 'Posición calculada para ' + escOpt(baseSel.nombre) + ' (' + escOpt(baseSel.tz || 'TZ del navegador') + ').';
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
        baseId: baseSel.id,
        ra: OBS.ra, dec: OBS.dec,
        fechaHoraLocal: whenVal, fechaHoraUTC: p.utc,
        lat: la, lon: lo,
        objAlt: +objAltR.toFixed(2), objAz: +obj.az.toFixed(2),
        sunAlt: +sun.alt.toFixed(2), moonAlt: +moon.alt.toFixed(2),
        temp: valor('temp'),
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
        if (o.base_id) basePendiente = o.base_id;   // base ya elegida en el registro
        return cargarBases().then(function () {
          return api(WP.endpoint + '/' + obsId + '/ficha-datos').then(function (fres) {
            if (fres.ok && fres.data && fres.data.observacion_id) { precargar(fres.data); }
            recompute();
          });
        });
      }).catch(function () {
        outNote.innerHTML = '<span style="color:var(--rojo)">✗ No se pudo contactar con el servidor.</span>';
      });
    }

    function precargar(f) {
      if (f.fecha_hora_local) whenInput.value = f.fecha_hora_local;
      if (f.temp !== null && f.temp !== undefined && f.temp !== '') $('temp').value = f.temp;
      if ($('pdf') && f.pdf) $('pdf').value = f.pdf;
      // La ubicación ya no se guarda a mano: viene de la base (preseleccionada por base_id).
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
