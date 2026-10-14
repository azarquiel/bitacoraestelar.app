/* ============================================================================
   grupo-local.js — CAPA DEL GRUPO LOCAL (atlas extragaláctico)
   Proyecto: mapa interactivo de la Vía Láctea (Gaia)

   Fusiona el antiguo atlas-observaciones.html dentro del visor principal:
   dibuja, DETRÁS del mapa de la galaxia, una escena 3D del Grupo Local con la
   Vía Láctea en el origen (0,0,0) y las galaxias observadas a su alrededor.

   Esta capa NO tiene controles propios: su nivel de zoom (fov) y su opacidad
   los gobierna el visor principal a través de GrupoLocal.sync(), llamado desde
   updateGrupoLocal() en via-lactea-app.js cuando se hace zoom out. Así el
   tránsito galaxia → grupo local es una única acción de zoom continua.

   Origen (0,0,0) = Vía Láctea. Posiciones en coordenadas galácticas (l, b) +
   distancia. El zoom del atlas es logarítmico, de 10 al a ~30 millones de al.
   Adaptado de atlas.js (atlas-observaciones.html).
   ============================================================================ */

var GrupoLocal = (function () {

  // ---- Colores por clase de Hubble (leyenda del Grupo Local) ----------------
  // Deben coincidir con la leyenda #mw-legend-hubble de mapa.html y con
  // bitacora_color_por_clase() del plugin PHP.
  var HUBBLE_COLORS = {
    E:   '#f4c76b', // elíptica
    S0:  '#c8b6ff', // lenticular
    S:   '#7ec8ff', // espiral
    SB:  '#5fe0c8', // espiral barrada
    Irr: '#ff8a80', // irregular
    // Galaxia sin clase deducible: SIMBAD la da por galaxia (otype extragaláctico)
    // pero no manda morfología legible. Debe coincidir con bitacora_color_por_clase.
    galaxia: '#9fb6c9'
  };

  // A partir de esta distancia al Sol (años luz) un objeto se considera
  // extragaláctico y se representa en el atlas del Grupo Local.
  var DIST_MIN_EXTRAGALACTICA = 200000;

  var DEG = Math.PI / 180;
  function galToXYZ(l, b, d) {
    var lr = l * DEG, br = b * DEG;
    return {
      x: d * Math.cos(br) * Math.cos(lr),
      y: d * Math.cos(br) * Math.sin(lr),
      z: d * Math.sin(br)
    };
  }

  function colorDe(o) {
    if (o.tipo && HUBBLE_COLORS[o.tipo]) return HUBBLE_COLORS[o.tipo];
    return o.color || '#7ec8ff';
  }

  // "#rrggbb" -> "rgba(r,g,b,a)" para halos y etiquetas de cada galaxia.
  function hexToRgba(hex, a) {
    var h = (hex || '#7ec8ff').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  // Componentes RGB de un color hex, opcionalmente mezclados hacia el gris de
  // "no visitado" (VLObservadores.grisNoVisitado: el mismo de las otras dos
  // vistas), conservando algo de su tono original.
  function rgbDe(hex, gris) {
    var h = (hex || '#7ec8ff').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (gris) {
      var c = window.VLObservadores.grisNoVisitado(r, g, b);
      r = c[0]; g = c[1]; b = c[2];
    }
    return { r: r, g: g, b: b };
  }

  // "rgba(...)" de un color, atenuándolo a gris si 'gris' es true.
  function colorRgba(hex, a, gris) {
    var c = rgbDe(hex, gris);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
  }

  // Construye el catálogo del atlas desde los OBJECTS reales de la base de datos:
  // los objetos con coordenadas galácticas (l, b), distancia extragaláctica y,
  // opcionalmente, clase de Hubble (tipo). Si no hay ninguno registrado, el
  // atlas muestra solo la Vía Láctea, sin galaxias.
  function construirCatalogo() {
    var fuente = [];
    if (typeof OBJECTS !== 'undefined' && OBJECTS && OBJECTS.length) {
      for (var i = 0; i < OBJECTS.length; i++) {
        var o = OBJECTS[i];
        if (typeof o.dist !== 'number' || o.dist < DIST_MIN_EXTRAGALACTICA) continue;
        if (typeof o.l !== 'number' || typeof o.b !== 'number') continue;
        fuente.push({ name: o.label || o.id, desc: o.name || '', l: o.l, b: o.b, d: o.dist,
                      tipo: o.tipo || '', color: o.color,
                      // Datos para abrir la ficha al hacer clic (como en la galaxia).
                      id: o.id, ficha: o.ficha || o.id, pdf: o.pdf, coords: o.coords, title: o.name });
      }
    }
    return fuente.map(function (o) {
      var p = galToXYZ(o.l, o.b, o.d);
      return { name: o.name, desc: o.desc, l: o.l, b: o.b, d: o.d, tipo: o.tipo,
               color: colorDe(o), x: p.x, y: p.y, z: p.z,
               id: o.id, ficha: o.ficha, pdf: o.pdf, coords: o.coords, title: o.title };
    });
  }

  var objects = construirCatalogo();
  // Distancia del objeto más lejano: gobierna hasta dónde se puede alejar la
  // vista (fov máximo) para que cualquier objeto registrado llegue a ser visible.
  var maxDist = objects.reduce(function (m, o) { return Math.max(m, o.d); }, 0);

  // Objeto "buscado" temporal: uno que NO está en el registro y que el buscador
  // localiza en SIMBAD para enseñar dónde está (se dibuja resaltado). Ver focus().
  var target = null;

  // ---- Elementos del DOM (se inyectan en mapa.html) ------------------------
  var canvas = document.getElementById('gl-sky');
  var tip = document.getElementById('gl-tip');
  var scaleTag = document.getElementById('gl-scale');
  var stage = document.getElementById('mw-viewer');
  if (!canvas || !stage) {
    // Sin la capa no hay nada que hacer; el visor de la galaxia sigue igual.
    return { ready: false, sync: function () {}, setViaje: function () {} };
  }

  // Cámara, gestos, rejilla, marcadores y bucle: la escena 3D compartida
  // (via-lactea-escena3d.js). Aquí solo van el catálogo, los colores por clase
  // de Hubble, la Vía Láctea en el origen y el objeto buscado.

  // Hasta dónde se puede alejar la vista. La vista se AUTO-ENCUADRA en el objeto
  // más lejano registrado (fov = distancia · 2,2), con un mínimo de 30 Mal si aún
  // no hay objetos. CONFIG.grupoLocal.alcanceMaximoAl es un TOPE de seguridad
  // (5000 Mal por defecto): solo recorta si un objeto estuviera aún más lejos.
  // Así un objeto a 29 Mal se ve bien encuadrado, y se soportan objetos hasta el
  // tope sin regar el zoom out sobre espacio vacío.
  var ALCANCE_MAX = (window.CONFIG && CONFIG.grupoLocal && CONFIG.grupoLocal.alcanceMaximoAl) || 5000000000;

  var escena = VLEscena3D.crear({
    canvas: canvas, stage: stage, tip: tip, scaleTag: scaleTag,
    objetos: objects,
    yaw: 0.6, pitch: -0.45,
    // zoom logarítmico: fov = campo de visión en al (radio visible); arranca
    // "muy lejos" y sync() lo ajusta al zoom real
    fovMin: 10,
    fovMax: Math.min(ALCANCE_MAX, Math.max(30000000, maxDist * 2.2)),
    autoGiro: (window.CONFIG && CONFIG.grupoLocal && CONFIG.grupoLocal.autoGiro != null)
      ? CONFIG.grupoLocal.autoGiro : 0.0004,
    colores: {
      fondo: { y: 0.4, centro: '#061024', medio: '#01030a', borde: '#01030a' },
      estrellas: { n: 260, rgb: '200,220,255' },
      rejilla: { rgb: '30,79,214', alfa: 0.35, eje: 0.18, rotulo: 'rgba(77,140,255,0.6)' },
      nucleo: '#f4faff',
      alfaEtiqueta: 0.95
    },
    // Galaxia observada solo por otros: rótulo y plomada se apagan (spec #102).
    rgba: function (o, a, aten) {
      return colorRgba(o.color || '#7ec8ff', aten ? a * VLObservadores.OPACIDAD_NO_VISITADO : a, aten);
    },
    volver: { escala: 'grupo-local', aria: 'Volver a la Vía Láctea, origen de la escena', texto: 'Volver a la Vía Láctea' },
    oculto: function (o) { return !!(hiddenTipos && hiddenTipos[o.tipo || '']); },
    // La galaxia buscada (anillo sobre su marcador propio) cuenta como realzada,
    // y la centrada sube al final del pintado igual que la del cursor.
    realzadoExtra: function (o) {
      return o === escena.centro() || !!(target && target.soloAnillo && target.name && target.name === o.name);
    },
    rejillaExtra: function () { return target && target.soloAnillo ? target : null; },
    // El giro ambiental se pausa mientras hay un objeto buscado enfocado (para
    // que quede centrado).
    pausaGiro: function () { return !!target; },
    pintarOrigen: pintarViaLactea,
    pintarEncima: pintarBuscado,
    alClic: function (o) { if (API.onObjectClick) API.onObjectClick(o); }
  });
  var cam = escena.cam;

  // Vía Láctea en el origen (el punto en que se convierte la galaxia al encoger)
  function pintarViaLactea() {
    var ctx = escena.ctx;
    var mw = escena.project(VLEscena3D.ORIGEN);
    var g = ctx.createRadialGradient(mw.sx, mw.sy, 0, mw.sx, mw.sy, 26);
    g.addColorStop(0, 'rgba(255,224,138,0.9)');
    g.addColorStop(1, 'rgba(255,224,138,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(mw.sx, mw.sy, 26, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(mw.sx, mw.sy, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    // La etiqueta solo cuando la galaxia ya casi ha desaparecido, para no
    // duplicar el rótulo mientras aún se ve la imagen del mapa.
    if (escena.alfa() > 0.6) {
      ctx.fillStyle = 'rgba(255,224,138,0.95)';
      ctx.font = '600 12px Inter, sans-serif';
      ctx.fillText('Vía Láctea', mw.sx + 12, mw.sy - 8);
    }
  }

  // Objeto buscado (no registrado): se dibuja resaltado con un anillo pulsante
  // y su nombre, para señalar dónde está aunque no forme parte del catálogo.
  function pintarBuscado() {
    if (!target) return;
    var ctx = escena.ctx;
    var tp = escena.project(target);
    escena.anillo(tp);
    // Si el objeto ya está en el catálogo (soloAnillo), el anillo lo resalta y
    // su propio marcador aporta punto y etiqueta: no se dibujan de nuevo.
    if (!target.soloAnillo) {
      var tcol = target.color || '#ffffff';
      var thalo = ctx.createRadialGradient(tp.sx, tp.sy, 0, tp.sx, tp.sy, 12);
      thalo.addColorStop(0, hexToRgba(tcol, 0.8));
      thalo.addColorStop(1, hexToRgba(tcol, 0));
      ctx.fillStyle = thalo;
      ctx.beginPath(); ctx.arc(tp.sx, tp.sy, 12, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(tp.sx, tp.sy, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();
      if (target.name) {
        ctx.fillStyle = 'rgba(255,255,255,0.98)';
        ctx.font = '600 12px Inter, sans-serif';
        ctx.fillText(target.name, tp.sx + 14, tp.sy + 4);
      }
    }
  }

  // Enfoca el atlas en un objeto por sus coordenadas galácticas (l, b) y su
  // distancia (al): rota la vista para centrarlo, lo marca como objeto buscado
  // y sube el fov máximo para que quepa. El fov real y la opacidad los fija el
  // visor principal (via-lactea-app.js) al ajustar la escala de la galaxia.
  // Normaliza para comparar nombres: minúsculas, sin acentos ni signos.
  function normalizar(s) {
    return (s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  // Coincidencia EXACTA por nombre o descripción (normalizados).
  function buscarExacto(query) {
    var q = normalizar(query);
    if (!q) return null;
    for (var i = 0; i < objects.length; i++) {
      if (normalizar(objects[i].name) === q || normalizar(objects[i].desc) === q) return objects[i];
    }
    return null;
  }

  // Coincidencia PARCIAL (la consulta dentro del nombre). No usar con
  // designaciones de catálogo (confundiría "M1" con "M101").
  function buscarParcial(query) {
    var q = normalizar(query);
    if (!q) return null;
    for (var j = 0; j < objects.length; j++) {
      if (normalizar(objects[j].name).indexOf(q) >= 0) return objects[j];
    }
    return null;
  }

  // Conveniencia: exacto y, si no, parcial (para localizar por etiqueta exacta).
  function buscar(query) {
    return buscarExacto(query) || buscarParcial(query);
  }

  // Enfoca un objeto que YA está en el atlas: lo resalta con un anillo sobre su
  // propio marcador (sin dibujar un segundo punto ni etiqueta → sin duplicado).
  function focusObject(o) {
    focus(o.l, o.b, o.d, o.name, o.tipo, true);
  }

  // Encuadra un objeto del atlas SIN señalarlo: mueve la cámara igual que
  // focus(), pero no deja el anillo de "objeto buscado". Lo usa la ruta de un
  // viaje, que se enseña con su línea dorada y no con la marca del buscador.
  function encuadrar(o) { orientarHacia(o.l, o.b, o.d); }

  // Orienta la cámara para que el objeto quede centrado en horizontal pero
  // DESPLAZADO por encima del centro (no sobre la Vía Láctea, que siempre se
  // proyecta en el origen). El desplazamiento en pantalla es (y2/margen)·R;
  // se busca ~0,45·R eligiendo y2 = frac. Cierre analítico: con el yaw que
  // anula la componente horizontal, y2 = cos(pitch + psi), psi = atan2(uz, h).
  function orientarHacia(l, b, d) {
    escena.alOrigen();   // la cuenta de abajo da por hecho el origen en pantalla
    var margen = (window.CONFIG && CONFIG.busqueda && CONFIG.busqueda.margenExtragalactico) || 1.8;
    cam.fovMax = Math.max(cam.fovMax, d * (margen + 0.6));
    var u = galToXYZ(l, b, 1);
    cam.yaw = Math.atan2(u.x, u.y);
    var h = Math.sqrt(u.x * u.x + u.y * u.y);
    var frac = Math.min(0.85, 0.45 * margen);
    var psi = Math.atan2(u.z, h);
    var p = Math.acos(Math.max(-1, Math.min(1, frac))) - psi;
    cam.pitch = VLEscena3D.topePitch(p);
  }

  function focus(l, b, d, name, tipo, soloAnillo) {
    orientarHacia(l, b, d);
    var pos = galToXYZ(l, b, d);
    target = { name: name || '', desc: '', l: l, b: b, d: d, tipo: tipo || '',
               color: colorDe({ tipo: tipo }), x: pos.x, y: pos.y, z: pos.z,
               soloAnillo: !!soloAnillo };
  }
  function clearTarget() { target = null; }

  // Centra la escena en una galaxia del atlas (via-lactea-escena3d.js).
  function centrar(o, silencio) {
    target = null;   // el anillo de una búsqueda anterior pararía el giro
    escena.centrar(o, silencio);
  }

  // Quién enseña su leyenda y quién la esconde lo decide la app con VLCapas
  // (aplicarControlesDeCapa): aquí solo se usa la propia, para escuchar clics.
  var legendHubble = document.getElementById('mw-legend-hubble');

  // Leyenda interactiva del Grupo Local: pulsar una clase de Hubble la oculta o
  // muestra en el atlas (el objeto se filtra en render). La fila se atenúa y se
  // tacha mientras su clase está oculta, igual que la leyenda de la galaxia.
  var hiddenTipos = {};
  if (legendHubble) {
    var glItems = legendHubble.querySelectorAll('.gl-legend-item');
    for (var gi = 0; gi < glItems.length; gi++) {
      glItems[gi].addEventListener('click', function () {
        var tipo = this.getAttribute('data-tipo');
        var nowHidden = !hiddenTipos[tipo];
        hiddenTipos[tipo] = nowHidden;
        this.setAttribute('aria-pressed', nowHidden ? 'true' : 'false');
        this.style.opacity = nowHidden ? '0.4' : '1';
        var textEl = this.querySelector('.gl-legend-text');
        if (textEl) textEl.style.textDecoration = nowHidden ? 'line-through' : 'none';
      });
    }
  }

  // ---- API pública (la llama updateGrupoLocal en via-lactea-app.js) ---------
  // sync(pxPerLy, alpha): fov y opacidad de la capa (via-lactea-escena3d.js).
  // maxDist (años luz del objeto más lejano) lo usa via-lactea-app.js para
  // permitir alejar la vista hasta que ese objeto sea visible.
  // buscar/focusObject: localizar y enfocar un objeto YA presente en el atlas.
  // focus/clearTarget: enfocar/limpiar un objeto buscado no registrado.
  // encuadrar: mover la vista hasta un objeto SIN marcarlo como buscado.
  // centrar/esCentro: centrar la escena en una galaxia del atlas (#421).
  // volver: devolver el centro al origen en vuelo (#423); false si no había.
  // onObjectClick: lo asigna via-lactea-app.js para abrir la ficha al hacer clic.
  // setViaje: el tramo extragaláctico de la salida que se está recorriendo, como
  // ids de objeto EN ORDEN. null (o nada) = se acabó el viaje y vuelve el atlas
  // entero; lista vacía = hay viaje, pero no llega hasta aquí.
  var API = {
    ready: true, sync: escena.sync, maxDist: maxDist, alcanceMax: ALCANCE_MAX,
    buscar: buscar, buscarExacto: buscarExacto, buscarParcial: buscarParcial,
    focusObject: focusObject, focus: focus, clearTarget: clearTarget,
    encuadrar: encuadrar,
    centrar: centrar, esCentro: escena.esCentro, volver: escena.volver, alOrigen: escena.alOrigen,
    centroDesplazado: escena.centroDesplazado,
    setViaje: escena.setViaje,
    onObjectClick: null
  };
  return API;
})();
