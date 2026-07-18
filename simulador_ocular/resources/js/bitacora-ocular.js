/* ===========================================================================
 * BITÁCORA MESSIER · Simulador de visión por ocular
 * ---------------------------------------------------------------------------
 * Reproduce cómo se vería el objeto del proyecto (de momento M39) a través del
 * telescopio y el ocular elegidos. Telescopio y ocular se seleccionan del
 * catálogo global de equipo (el mismo que usa "Mi flota" para elegir un ocular,
 * vía /wp-json/bitacora/v1/equipo/catalogo).
 *
 * El motor fotométrico (pupila de salida, umbral de Blackwell, adaptación
 * retiniana y estrellas sintéticas de Gaia DR3) es el del simulador original.
 *
 * Va SUBIDO POR FTP a /wp-content/uploads/bitacora/  (no se pega en el editor:
 * escaparía los "&" y rompería el JavaScript). Incrementa ?v=N al actualizar.
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
    if (!$('sim-vista')) return;   // el bloque del simulador no está en la página

    /* ══════════════════ CONFIGURACIÓN ══════════════════ */

    // Objeto del proyecto — de momento solo M39 (cúmulo abierto, NGC 7092).
    // Estructura de catálogo para poder añadir más objetos en el futuro.
    var CATALOGO_OBJ = [
      { id: 'M39', nombre: 'M39 · Cúmulo abierto (NGC 7092)', constelacion: 'Cygnus',
        ra: '21 31 48', dec: '+48 26 55' }
    ];
    var OBJETO = CATALOGO_OBJ[0];

    // Equipo por defecto cuando no hay catálogo (sin sesión o preview).
    var TELE_EJEMPLO = [
      { id: '_t200', vendor: '', modelo: 'Newton 200/1200 (ejemplo)', apertura_mm: 200, focal_mm: 1200 }
    ];
    var OCULARES_EJEMPLO = [
      { id: '_o31', vendor: '', modelo: '31 mm (ejemplo)',   focal_mm: 31,   campo_aparente: 82 },
      { id: '_o18', vendor: '', modelo: '17,5 mm (ejemplo)', focal_mm: 17.5, campo_aparente: 95 },
      { id: '_o9',  vendor: '', modelo: '9 mm (ejemplo)',    focal_mm: 9,    campo_aparente: 100 },
      { id: '_o5',  vendor: '', modelo: '5 mm (ejemplo)',    focal_mm: 5,    campo_aparente: 60 }
    ];

    var DSS_MAX_ARCMIN = 120;   // límite del servidor de ESO por lado
    var AFOV_REF = 110;         // campo aparente que ocupa el diámetro máximo en pantalla
    var PROC = 720;             // resolución de trabajo del procesado

    var CFG = window.BITACORA_OCULAR || {};
    var DSS_BASE = CFG.dssProxy || '/wp-content/uploads/bitacora/dss-proxy.php';

    /* ══════════════════ ESTADO ══════════════════ */

    var WP = window.BITACORA_WP || null;
    var catalogo = { telescopios: [], oculares: [] };
    var teleSel = null;         // telescopio elegido (item del catálogo)
    var ocularSel = null;       // ocular elegido (item del catálogo)

    var corsFallo = false;
    var contadorPeticion = 0;
    var cacheGaia = {};

    var FOT = {
      SB_OBJ_MAX: 14.0, SB_OBJ_MIN: 24.0, SB_NEGRO: 25.5, SB_BLANCO: 14.0,
      C_MIN: 0.08, C_EXP: 0.35, GAMMA_HIPS: 2.0
    };

    /* ══════════════════ CATÁLOGO DE EQUIPO ══════════════════ */

    function num(v) { if (v == null || v === '') return null; var n = parseFloat(v); return isNaN(n) ? null : n; }
    function nombrePieza(p) { return ((p.vendor ? p.vendor + ' ' : '') + (p.modelo || p.nombre || '')).trim() || '(sin nombre)'; }
    function esc(t) {
      return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function itemPorId(cat, id) {
      var arr = catalogo[cat] || [];
      for (var i = 0; i < arr.length; i++) { if (String(arr[i].id) === String(id)) return arr[i]; }
      return null;
    }
    function specsTele(p) {
      var s = [];
      if (num(p.apertura_mm) != null) s.push(num(p.apertura_mm) + ' mm');
      if (num(p.focal_mm) != null) s.push('f=' + num(p.focal_mm) + ' mm');
      return s.join(' · ');
    }
    function specsOcular(p) {
      var s = [];
      if (num(p.focal_mm) != null) s.push(num(p.focal_mm) + ' mm');
      if (num(p.campo_aparente) != null) s.push(num(p.campo_aparente) + '°');
      return s.join(' · ');
    }
    // Datos ópticos normalizados del ocular elegido.
    function pupilaOptica(p) { return { focal: num(p.focal_mm), afov: num(p.campo_aparente) || 60 }; }

    function cargarCatalogo() {
      if (!WP) { usarEjemplo('Inicia sesión para elegir del catálogo completo de equipo. Mientras tanto se muestra un equipo de ejemplo.'); return; }
      var API = WP.endpoint.replace(/observaciones\/?$/, 'equipo') + '/catalogo';
      fetch(API, { credentials: 'same-origin', headers: { 'X-WP-Nonce': WP.nonce } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d || (!(d.telescopios || []).length && !(d.oculares || []).length)) {
            usarEjemplo('No se pudo leer el catálogo de equipo. Se usa un equipo de ejemplo.');
            return;
          }
          catalogo = { telescopios: d.telescopios || [], oculares: d.oculares || [] };
          var hint = $('sim-eq-hint');
          if (hint) hint.textContent = 'Telescopio y ocular elegidos del catálogo de equipo.';
          poblarEquipo();
        })
        .catch(function () { usarEjemplo('No se pudo leer el catálogo de equipo. Se usa un equipo de ejemplo.'); });
    }

    function usarEjemplo(mensaje) {
      catalogo = { telescopios: TELE_EJEMPLO.slice(), oculares: OCULARES_EJEMPLO.slice() };
      var hint = $('sim-eq-hint');
      if (hint) hint.textContent = mensaje;
      poblarEquipo();
    }

    // Rellena un <select> con una categoría del catálogo, agrupada por fabricante.
    function llenarSelect(sel, cat, placeholder, specs) {
      var items = (catalogo[cat] || []).filter(function (p) { return num(p.focal_mm) > 0; });
      var html = '<option value="">' + esc(placeholder) + '</option>';
      var grupoActual = null, abierto = false;
      items.forEach(function (p) {
        var vendor = (p.vendor || '').trim() || 'Sin fabricante';
        if (vendor !== grupoActual) {
          if (abierto) html += '</optgroup>';
          html += '<optgroup label="' + esc(vendor) + '">';
          grupoActual = vendor; abierto = true;
        }
        var modelo = (p.modelo || p.nombre || '').trim() || '(sin nombre)';
        var sp = specs(p);
        html += '<option value="' + esc(p.id) + '">' + esc(modelo) + (sp ? '  ·  ' + esc(sp) : '') + '</option>';
      });
      if (abierto) html += '</optgroup>';
      sel.innerHTML = html;
    }

    function poblarEquipo() {
      var selT = $('sim-tele'), selO = $('sim-ocular');
      llenarSelect(selT, 'telescopios', '— Elige un telescopio —', specsTele);
      llenarSelect(selO, 'oculares', '— Elige un ocular —', specsOcular);

      // Preselección: primer telescopio útil (focal + apertura) y primer ocular útil.
      var t0 = (catalogo.telescopios || []).find(function (p) { return num(p.focal_mm) && num(p.apertura_mm); });
      if (t0) { selT.value = String(t0.id); teleSel = t0; }
      var o0 = (catalogo.oculares || []).find(function (p) { return num(p.focal_mm); });
      if (o0) { selO.value = String(o0.id); ocularSel = o0; }

      actualizar();
    }

    /* ══════════════════ CÁLCULO ÓPTICO ══════════════════ */

    function teleFocal()    { return teleSel ? (num(teleSel.focal_mm) || 0) : 0; }
    function teleApertura() { return teleSel ? (num(teleSel.apertura_mm) || 0) : 0; }
    function pupilaOjo()    { return parseFloat($('sim-pupila-ojo').value) || 7; }

    function datosOcular() {
      var oc = pupilaOptica(ocularSel);
      var F = teleFocal(), D = teleApertura();
      var aumentos  = F / oc.focal;
      var campoReal = oc.afov / aumentos;   // grados
      var pupila    = D / aumentos;         // mm
      return { aumentos: aumentos, campoReal: campoReal, pupila: pupila, afov: oc.afov };
    }

    function ventanaBase() {
      return Math.min(560, window.innerWidth - 80, window.innerHeight - 240);
    }

    /* ══════════════════ RENDER ══════════════════ */

    function actualizar() {
      var aviso = $('sim-aviso');
      var lecturas = ['sim-v-aum', 'sim-v-real', 'sim-v-apar', 'sim-v-pupila', 'sim-v-brillo', 'sim-v-cielo', 'sim-v-maglim'];
      var cargando = $('sim-cargando');

      if (!teleSel || !teleFocal() || !teleApertura()) {
        lecturas.forEach(function (id) { $(id).innerHTML = '—'; });
        cargando.style.display = 'flex';
        cargando.textContent = 'Elige un telescopio con focal y apertura.';
        return;
      }
      if (!ocularSel || !num(ocularSel.focal_mm)) {
        lecturas.forEach(function (id) { $(id).innerHTML = '—'; });
        cargando.style.display = 'flex';
        cargando.textContent = 'Elige un ocular.';
        return;
      }

      var d = datosOcular();

      $('sim-v-aum').innerHTML    = d.aumentos.toFixed(0) + '<em>x</em>';
      $('sim-v-real').innerHTML   = d.campoReal.toFixed(2) + '<em>°</em>';
      $('sim-v-apar').innerHTML   = d.afov + '<em>°</em>';
      $('sim-v-pupila').innerHTML = d.pupila.toFixed(1) + '<em>mm</em>';

      // tamaño del círculo ∝ campo aparente
      var diam = ventanaBase() * Math.min(1, d.afov / AFOV_REF);
      var vista = $('sim-vista');
      vista.style.width = diam + 'px';
      vista.style.height = diam + 'px';

      // petición: lado = campo real en arcmin
      var arcmin = d.campoReal * 60;
      if (arcmin > DSS_MAX_ARCMIN) {
        aviso.textContent = 'El campo real (' + (arcmin / 60).toFixed(2) + '°) supera el máximo (2°): la imagen se recorta a 2°.';
        arcmin = DSS_MAX_ARCMIN;
      } else {
        aviso.textContent = '';
      }

      var ra = OBJETO.ra, dec = OBJETO.dec;
      var origen = $('sim-origen').value;
      var hdr = $('sim-hdr').checked;

      cargando.style.display = 'flex';
      cargando.textContent = 'solicitando imagen…';
      var peticion = ++contadorPeticion;

      if (origen === 'hips') {
        var u = urlHips(ra, dec, arcmin);
        cargarPlaca(u).then(function (im) {
          if (peticion !== contadorPeticion) return;
          if (!im) { cargando.textContent = 'hips2fits no respondió: prueba el origen DSS.'; return; }
          cargando.style.display = 'none';
          renderizar(im, null, u);
        });
      } else {
        var urlProfunda = urlPlaca('DSS2-red', ra, dec, arcmin);
        var urlCorta    = urlPlaca('DSS1', ra, dec, arcmin);
        Promise.all([cargarPlaca(urlProfunda), hdr ? cargarPlaca(urlCorta) : Promise.resolve(null)])
          .then(function (res) {
            var profunda = res[0], corta = res[1];
            if (peticion !== contadorPeticion) return;
            if (!profunda && !corta) { cargando.textContent = 'No se pudo cargar la placa del DSS. ¿Está dss-proxy.php accesible?'; return; }
            cargando.style.display = 'none';
            renderizar(profunda || corta, profunda ? corta : null, urlProfunda);
          });
      }

      // lecturas fotométricas
      var pOjo = pupilaOjo();
      var pEf = Math.min(d.pupila, pOjo);
      var brillo = Math.pow(pEf / pOjo, 2);
      var sqm = parseFloat($('sim-sqm').value) || 21;
      var D = teleApertura();
      $('sim-v-brillo').innerHTML = (brillo * 100).toFixed(0) + '<em>%</em>';
      $('sim-v-cielo').innerHTML  = (sqm + 5 * Math.log10(pOjo / pEf)).toFixed(1) + '<em>m/☐″</em>';
      $('sim-v-maglim').innerHTML = (7.7 + 5 * Math.log10(D / 100)).toFixed(1) + '<em>m</em>';

      if (d.pupila > pOjo && !aviso.textContent) {
        aviso.textContent = 'Pupila de salida (' + d.pupila.toFixed(1) + ' mm) mayor que la del ojo (' + pOjo + ' mm): parte de la luz se desperdicia.';
      }
    }

    /* ══════════════════ URLS DE PLACAS ══════════════════ */

    function urlPlaca(survey, ra, dec, arcmin) {
      return DSS_BASE
        + '?ra=' + encodeURIComponent(ra)
        + '&dec=' + encodeURIComponent(dec)
        + '&equinox=J2000&name='
        + '&x=' + arcmin.toFixed(1) + '&y=' + arcmin.toFixed(1)
        + '&Sky-Survey=' + survey + '&mime-type=download-gif';
    }

    // "05 35 17" o "05:35:17.3" → grados decimales
    function sexToDeg(s, esRA) {
      var sig = /^\s*-/.test(s) ? -1 : 1;
      var p = s.trim().replace(/[+\-]/g, '').replace(/:/g, ' ').split(/\s+/).map(Number);
      var abs = (p[0] || 0) + (p[1] || 0) / 60 + (p[2] || 0) / 3600;
      return sig * abs * (esRA ? 15 : 1);
    }

    function urlHips(ra, dec, arcmin) {
      return 'https://alasky.cds.unistra.fr/hips-image-services/hips2fits'
        + '?hips=' + encodeURIComponent('CDS/P/PanSTARRS/DR1/color-z-zg-g')
        + '&ra=' + sexToDeg(ra, true).toFixed(5)
        + '&dec=' + sexToDeg(dec, false).toFixed(5)
        + '&fov=' + (arcmin / 60).toFixed(4)
        + '&width=' + PROC + '&height=' + PROC
        + '&projection=TAN&format=jpg';
    }

    function cargarPlaca(url) {
      return new Promise(function (res) {
        var im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = function () { res(im); };
        im.onerror = function () { res(null); };
        im.src = url;
      });
    }

    /* ══════════════════ MOTOR FOTOMÉTRICO ══════════════════ */

    function lumas(imagen) {
      var c = document.createElement('canvas');
      c.width = c.height = PROC;
      var ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(imagen, 0, 0, PROC, PROC);
      var dd;
      try { dd = ctx.getImageData(0, 0, PROC, PROC).data; } catch (e) { return null; }
      var v = new Float32Array(PROC * PROC);
      for (var i = 0, j = 0; j < v.length; i += 4, j++) v[j] = (dd[i] + dd[i + 1] + dd[i + 2]) / 3;
      return v;
    }

    var suave = function (x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

    function fusionar(vd, vs) {
      var sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0, i;
      for (i = 0; i < vd.length; i++) {
        if (vd[i] >= 120 && vd[i] <= 215 && vs[i] > 8) {
          sx += vs[i]; sy += vd[i]; sxx += vs[i] * vs[i]; sxy += vs[i] * vd[i]; n++;
        }
      }
      if (n < 500) return vd;
      var a = (n * sxy - sx * sy) / (n * sxx - sx * sx);
      var b = (sy - a * sx) / n;
      if (!(a > 0)) return vd;
      var out = new Float32Array(vd.length);
      for (i = 0; i < vd.length; i++) {
        var t = suave((vd[i] - 210) / 40);
        out[i] = (1 - t) * vd[i] + t * Math.max(vd[i], a * vs[i] + b);
      }
      return out;
    }

    function desenfocar(v, radio) {
      var c = document.createElement('canvas');
      c.width = c.height = PROC;
      var ctx = c.getContext('2d');
      var im = ctx.createImageData(PROC, PROC);
      var i, j;
      for (i = 0, j = 0; j < v.length; i += 4, j++) {
        var o = Math.max(0, Math.min(255, v[j]));
        im.data[i] = im.data[i + 1] = im.data[i + 2] = o;
        im.data[i + 3] = 255;
      }
      ctx.putImageData(im, 0, 0);
      var c2 = document.createElement('canvas');
      c2.width = c2.height = PROC;
      var ctx2 = c2.getContext('2d', { willReadFrequently: true });
      ctx2.filter = 'blur(' + radio + 'px)';
      ctx2.drawImage(c, 0, 0);
      var dd = ctx2.getImageData(0, 0, PROC, PROC).data;
      var out = new Float32Array(v.length);
      for (i = 0, j = 0; j < v.length; i += 4, j++) out[j] = dd[i];
      return out;
    }

    function repararNucleos(v) {
      var entorno = desenfocar(v, 4);
      for (var i = 0; i < v.length; i++) {
        if (entorno[i] > 140 && v[i] < 0.5 * entorno[i]) v[i] = Math.min(300, entorno[i] * 1.25);
      }
      return v;
    }

    function adaptacionLocal(v) {
      var borroso = desenfocar(v, Math.round(PROC / 60));
      var out = new Float32Array(v.length);
      var REALCE = 0.5, UMBRAL_DETALLE = 12;
      for (var j = 0; j < v.length; j++) {
        var dif = v[j] - borroso[j];
        var mag = Math.abs(dif) - UMBRAL_DETALLE;
        var gan = dif >= 0 ? REALCE : REALCE * 0.25;
        out[j] = v[j] + (mag > 0 ? gan * Math.sign(dif) * mag : 0);
      }
      return out;
    }

    function procesarFotometrico(profunda, corta, canvas, p) {
      var vd = lumas(profunda);
      if (!vd) return false;
      var v = vd;
      if (corta) { var vs = lumas(corta); if (vs) v = fusionar(vd, vs); }

      var esHips = $('sim-origen').value === 'hips';
      if (esHips) v = repararNucleos(v);

      var pOjo = pupilaOjo(), pEf = Math.min(p, pOjo);
      var sqm = parseFloat($('sim-sqm').value) || 21;
      var dim = Math.pow(pEf / pOjo, 2);
      var Fcielo = Math.pow(10, -0.4 * sqm);
      var rango = FOT.SB_NEGRO - FOT.SB_BLANCO;

      var Fref = Math.pow(10, -0.4 * 21);
      var Cmin = FOT.C_MIN * Math.pow(Fref / (Fcielo * dim), FOT.C_EXP);

      var salida = new Float32Array(v.length);
      for (var i = 0; i < v.length; i++) {
        var Fobj = 0, vi = v[i];
        if (vi > 0) {
          if (esHips) vi = 255 * Math.pow(Math.min(vi, 512) / 255, FOT.GAMMA_HIPS);
          var sb = FOT.SB_OBJ_MIN - (vi / 255) * (FOT.SB_OBJ_MIN - FOT.SB_OBJ_MAX);
          Fobj = Math.pow(10, -0.4 * sb);
        }
        var s = suave((Fobj / (Fcielo * Cmin) - 1) / 1.5);
        var Ftot = (Fobj * s + Fcielo) * dim;
        salida[i] = 255 * (FOT.SB_NEGRO + 2.5 * Math.log10(Ftot)) / rango;
      }

      var final = $('sim-adaptacion').checked ? adaptacionLocal(salida) : salida;

      canvas.width = canvas.height = PROC;
      var ctx = canvas.getContext('2d');
      var im = ctx.createImageData(PROC, PROC);
      for (var k = 0, j = 0; j < final.length; k += 4, j++) {
        var o = Math.max(0, Math.min(255, final[j]));
        im.data[k] = im.data[k + 1] = im.data[k + 2] = o;
        im.data[k + 3] = 255;
      }
      ctx.putImageData(im, 0, 0);
      return true;
    }

    function renderizar(profunda, corta, urlRespaldo) {
      if (!ocularSel) return;
      var pupila = datosOcular().pupila;
      var img = $('sim-img');
      var canvas = $('sim-lienzo');
      var aviso = $('sim-aviso');

      if ($('sim-fotometrica').checked && !corsFallo) {
        if (procesarFotometrico(profunda, corta, canvas, pupila)) {
          canvas.style.display = 'block';
          img.style.display = 'none';
          if ($('sim-gaia').checked) superponerGaia(canvas);
          return;
        }
        corsFallo = true;
        aviso.textContent = 'El navegador bloquea la lectura de píxeles (CORS): sirve las placas con dss-proxy.php desde tu dominio para activar el modo fotométrico.';
      }
      canvas.style.display = 'none';
      img.style.display = 'block';
      img.src = urlRespaldo;
      aplicarPupila(img, pupila);
    }

    /* ══════════════════ ESTRELLAS SINTÉTICAS GAIA DR3 ══════════════════ */

    function consultarGaia(ra0, dec0, radioDeg) {
      var clave = ra0.toFixed(3) + ',' + dec0.toFixed(3) + ',' + radioDeg.toFixed(3);
      if (cacheGaia[clave]) return Promise.resolve(cacheGaia[clave]);
      var adql =
        'SELECT TOP 15000 RA_ICRS, DE_ICRS, Gmag FROM "I/355/gaiadr3" ' +
        "WHERE 1=CONTAINS(POINT('ICRS',RA_ICRS,DE_ICRS), " +
        "CIRCLE('ICRS'," + ra0.toFixed(5) + ',' + dec0.toFixed(5) + ',' + radioDeg.toFixed(5) + ')) ' +
        'ORDER BY Gmag';
      var url = 'https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync' +
        '?request=doQuery&lang=adql&format=json&query=' + encodeURIComponent(adql);
      return fetch(url).then(function (r) { return r.json(); })
        .then(function (jj) { return (cacheGaia[clave] = (jj.data || []).filter(function (f) { return f[2] != null; })); });
    }

    function dibujarGaia(ctx, estrellas, ra0, dec0, arcmin, mlim) {
      var escv = PROC / (arcmin / 60);
      var cos0 = Math.cos(dec0 * Math.PI / 180);
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < estrellas.length; i++) {
        var ra = estrellas[i][0], dec = estrellas[i][1], g = estrellas[i][2];
        if (g > mlim) continue;
        var x = PROC / 2 - (ra - ra0) * cos0 * escv;
        var y = PROC / 2 - (dec - dec0) * escv;
        if (x < -3 || y < -3 || x > PROC + 3 || y > PROC + 3) continue;
        var f = Math.min(1, (mlim - g) / 6);
        var r = 0.7 + 2.3 * f * f;
        var gr = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
        gr.addColorStop(0, 'rgba(255,255,255,' + (0.35 + 0.65 * f).toFixed(3) + ')');
        gr.addColorStop(0.45, 'rgba(255,255,255,' + (0.25 * f).toFixed(3) + ')');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.2, 0, 7);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    function superponerGaia(canvas) {
      var arcmin = Math.min(datosOcular().campoReal * 60, DSS_MAX_ARCMIN);
      var ra0 = sexToDeg(OBJETO.ra, true);
      var dec0 = sexToDeg(OBJETO.dec, false);
      var D = teleApertura();
      var mlim = 7.7 + 5 * Math.log10(D / 100);
      var pet = contadorPeticion;
      consultarGaia(ra0, dec0, (arcmin / 60) * 0.72)
        .then(function (estrellas) {
          if (pet !== contadorPeticion) return;
          dibujarGaia(canvas.getContext('2d'), estrellas, ra0, dec0, arcmin, mlim);
        })
        .catch(function () {
          $('sim-aviso').textContent = 'No se pudo consultar Gaia DR3 (VizieR): se muestra solo la imagen.';
        });
    }

    /* ══════════════════ RESERVA: FILTRO SVG (sin canvas) ══════════════════ */

    function aplicarPupila(img, p) {
      var pOjo = pupilaOjo();
      var pEf = Math.min(p, pOjo);
      var brilloPercibido = Math.pow(Math.pow(pEf / pOjo, 2), 0.5);
      var umbral = 0.30 * (1 - pEf / pOjo);
      var pendiente = brilloPercibido / (1 - umbral);
      var despl = -pendiente * umbral;
      ['R', 'G', 'B'].forEach(function (c) {
        var f = document.querySelector('#sim-transfer-pupila feFunc' + c);
        if (!f) return;
        f.setAttribute('slope', pendiente.toFixed(4));
        f.setAttribute('intercept', despl.toFixed(4));
      });
      img.style.filter = 'grayscale(1) url(#sim-filtro-pupila)';
    }

    /* ══════════════════ OBJETO (M39) ══════════════════ */

    (function pintarObjeto() {
      var box = $('sim-objeto');
      if (!box) return;
      box.querySelector('.obj-nom').textContent = OBJETO.nombre;
      box.querySelector('.obj-coord').textContent =
        'AR ' + OBJETO.ra + '  ·  Dec ' + OBJETO.dec + '  ·  ' + OBJETO.constelacion + ' (J2000)';
    })();

    /* ══════════════════ EVENTOS ══════════════════ */

    $('sim-tele').addEventListener('change', function () {
      teleSel = this.value ? itemPorId('telescopios', this.value) : null;
      actualizar();
    });
    $('sim-ocular').addEventListener('change', function () {
      ocularSel = this.value ? itemPorId('oculares', this.value) : null;
      actualizar();
    });
    ['sim-pupila-ojo', 'sim-sqm'].forEach(function (id) { $(id).addEventListener('change', actualizar); });
    ['sim-fotometrica', 'sim-hdr', 'sim-adaptacion', 'sim-gaia', 'sim-origen'].forEach(function (id) {
      $(id).addEventListener('change', actualizar);
    });
    window.addEventListener('resize', function () { actualizar(); });

    /* ══════════════════ ARRANQUE ══════════════════ */
    cargarCatalogo();

  } catch (err) {
    console.error('[Bitácora] Error al iniciar el simulador de ocular:', err);
  }
  }
})();
