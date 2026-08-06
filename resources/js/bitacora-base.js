/* ===========================================================================
 * BITÁCORA MESSIER · Utilidades comunes de la web (bitacora-base.js)
 * ---------------------------------------------------------------------------
 * Código JS COMPARTIDO por los módulos de la bitácora. De momento expone el
 * buscador de catálogo de equipo (elegir un telescopio o un ocular del catálogo
 * global), reutilizado por "Mi flota" (bitacora-flota.js) y por el simulador de
 * ocular (bitacora-ocular.js).
 *
 * Se carga ANTES que las hojas de cada módulo. Subir por FTP a
 * /wp-content/uploads/bitacora/ e incrementar el ?v=N al actualizar.
 * =========================================================================== */

window.BitacoraBase = (function () {
  'use strict';

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * Buscador de catálogo con desplegable de sugerencias.
   *
   * Monta sobre un <input> el mismo autocompletado de catálogo que usa "Mi
   * flota": al escribir, filtra la fuente y pinta un <div class="suggest"> con
   * los resultados; al pulsar uno, llama a onElegir(item) y cierra el
   * desplegable. También se cierra al hacer clic fuera del contenedor.
   *
   * opts = {
   *   input:      <input> de búsqueda (obligatorio)
   *   suggest:    <div class="suggest"> donde se pintan las sugerencias (obligatorio)
   *   contenedor: elemento que envuelve input+suggest; al clicar fuera se cierra
   *               (por defecto, input.parentNode)
   *   fuente:     function() -> [items]   (se llama en cada búsqueda)
   *   texto:      function(item) -> nombre visible
   *   specs:      function(item) -> texto de specs (columna derecha, opcional)
   *   onElegir:   function(item)
   *   max:        nº máximo de resultados (por defecto 12)
   *   todosSiVacio: si es true, al enfocar sin texto lista los primeros `max`
   *               resultados (para catálogos cortos o para explorar la lista)
   *   sinResultados: texto cuando no hay coincidencias
   * }
   * Devuelve { buscar, cerrar } por si se quiere disparar/cerrar manualmente.
   * ───────────────────────────────────────────────────────────────────────── */
  function montarBuscadorCatalogo(opts) {
    var input = opts.input;
    var sugg = opts.suggest;
    var cont = opts.contenedor || input.parentNode;
    var max = opts.max || 12;
    var sinRes = opts.sinResultados || 'Sin coincidencias en el catálogo';
    var estiloSpecs = 'color:var(--azul);font-family:ui-monospace,Menlo,monospace;font-size:12px';

    function buscar() {
      var q = (input.value || '').trim().toLowerCase();
      // Con todosSiVacio, al enfocar sin texto se listan los primeros resultados
      // (útil para catálogos cortos o para explorar la lista); si no, se oculta.
      if (!q) {
        if (!opts.todosSiVacio) { sugg.style.display = 'none'; return; }
      }
      var res = (opts.fuente() || []).filter(function (it) {
        return !q || opts.texto(it).toLowerCase().indexOf(q) !== -1;
      }).slice(0, max);

      if (!res.length) {
        sugg.innerHTML = '<button type="button" disabled style="opacity:.6;cursor:default">' + esc(sinRes) + '</button>';
        sugg.style.display = 'block';
        return;
      }
      sugg.innerHTML = res.map(function (it) {
        var sp = opts.specs ? opts.specs(it) : '';
        return '<button type="button" data-id="' + esc(it.id) + '">' +
          '<span>' + esc(opts.texto(it)) + '</span>' +
          (sp ? '<span style="' + estiloSpecs + '">' + esc(sp) + '</span>' : '') +
          '</button>';
      }).join('');
      sugg.style.display = 'block';

      sugg.querySelectorAll('button[data-id]').forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-id');
          var it = (opts.fuente() || []).filter(function (x) { return String(x.id) === String(id); })[0];
          sugg.style.display = 'none';
          if (it) opts.onElegir(it);
        });
      });
      activo = -1; // cada nueva lista empieza sin resaltado para el teclado
    }

    // ── Navegación con teclado (flechas ↑/↓, Enter, Esc) ──
    // 'activo' es el índice de la opción resaltada dentro de las sugerencias
    // seleccionables (las que tienen data-id; excluye "sin coincidencias").
    var activo = -1;
    function opciones() { return sugg.querySelectorAll('button[data-id]'); }
    function abierta() { return sugg.style.display !== 'none' && opciones().length > 0; }
    function resaltar(idx) {
      var op = opciones();
      if (!op.length) { activo = -1; return; }
      idx = (idx < 0) ? op.length - 1 : (idx >= op.length ? 0 : idx); // envuelve
      activo = idx;
      for (var i = 0; i < op.length; i++) {
        var on = (i === activo);
        op[i].classList.toggle('is-activa', on);
        op[i].style.background = on ? 'rgba(126,200,255,0.16)' : '';
        if (on && op[i].scrollIntoView) { op[i].scrollIntoView({ block: 'nearest' }); }
      }
    }

    input.addEventListener('input', buscar);
    input.addEventListener('focus', function () { if (input.value.trim() || opts.todosSiVacio) buscar(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!abierta()) { buscar(); }
        resaltar(activo + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!abierta()) { buscar(); }
        resaltar(activo - 1);
      } else if (e.key === 'Enter') {
        if (abierta() && activo >= 0) { e.preventDefault(); opciones()[activo].click(); }
      } else if (e.key === 'Escape') {
        sugg.style.display = 'none';
      }
    });
    document.addEventListener('click', function (e) { if (!cont.contains(e.target)) sugg.style.display = 'none'; });

    return { buscar: buscar, cerrar: function () { sugg.style.display = 'none'; } };
  }

  /* ── Cielo: escala Bortle ↔ SQM ──────────────────────────────────────────
     Enlaza un <select> de clase Bortle con un input numérico de SQM. Elegir una
     clase fija el SQM; teclear un SQM que no cuadre con ninguna clase deja el
     selector en "personalizado". El selector muestra solo clase + etiqueta (el
     valor SQM va en el value de la opción, no visible). */
  var BORTLE = [
    { clase: 1, etiqueta: 'Cielo excelente',                    sqm: 21.9 },
    { clase: 2, etiqueta: 'Cielo oscuro típico',                sqm: 21.6 },
    { clase: 3, etiqueta: 'Cielo rural',                        sqm: 21.4 },
    { clase: 4, etiqueta: 'Transición rural/suburbano',         sqm: 20.85 },
    { clase: 5, etiqueta: 'Cielo suburbano',                    sqm: 19.75 },
    { clase: 6, etiqueta: 'Cielo suburbano brillante',          sqm: 18.55 },
    { clase: 7, etiqueta: 'Transición suburbano/urbano',        sqm: 17.40 },
    { clase: 8, etiqueta: 'Cielo urbano',                       sqm: 16.15 },
    { clase: 9, etiqueta: 'Cielo centro urbano',                sqm: 14.25 }
  ];
  // El sqm de cada clase es el mínimo del rango; la lista va de más a menos oscuro.
  // Clase 1: sqm >= 21.9; Clase 2: [21.6, 21.9); … Clase 9: todo lo inferior.
  function claseBortlePorSqm(sqm) {
    if (isNaN(sqm)) return null;
    for (var i = 0; i < BORTLE.length; i++) if (sqm >= BORTLE[i].sqm) return BORTLE[i];
    return BORTLE[BORTLE.length - 1];
  }
  function montarCielo(select, input) {
    if (select && !select._pob) {
      var html = '<option value="">— personalizado —</option>';
      BORTLE.forEach(function (b) {
        html += '<option value="' + b.sqm + '">Clase ' + b.clase + ' · ' + b.etiqueta + '</option>';
      });
      select.innerHTML = html;
      select._pob = true;
    }
    function sincronizarSelect() {
      var b = claseBortlePorSqm(parseFloat(input.value));
      if (select) select.value = b ? String(b.sqm) : '';
    }
    if (select) select.addEventListener('change', function () {
      if (select.value !== '') { input.value = select.value; input.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    input.addEventListener('input', sincronizarSelect);
    sincronizarSelect();
    return {
      leer: function () {
        var v = parseFloat(input.value);
        var b = claseBortlePorSqm(v);
        return { sqm: isNaN(v) ? null : v, clase: b ? b.clase : null, etiqueta: b ? b.etiqueta : null };
      }
    };
  }

  // ── Transparencia del cielo (IR, ºC): más negativo = más transparente ──
  // Escala del observador: IR −30 extremadamente … IR > −5 pobre. A diferencia
  // del SQM/Bortle, el IR se teclea con cualquier valor, así que la etiqueta se
  // decide por umbrales (bandas), no por coincidencia exacta.
  var TRANSPARENCIA = [
    { ir: -30, etiqueta: 'Extremadamente transparente' },
    { ir: -20, etiqueta: 'Transparente' },
    { ir: -15, etiqueta: 'Mayoritariamente transparente' },
    { ir: -5,  etiqueta: 'Algo transparente' },
    { ir: 0,   etiqueta: 'Pobre' }
  ];
  /* El IR del cielo es NEGATIVO y baja cuanto más transparente está: un −30 es
     mejor cielo que un −3. El `ir` de cada banda es su extremo MENOS negativo (su
     máximo), y la banda se lleva ese valor exacto —el que ofrece su opción del
     desplegable, que tiene que volver a caer en ella—:
       ir ≤ −30           Extremadamente transparente
       −30 < ir ≤ −20     Transparente
       −20 < ir ≤ −15     Mayoritariamente transparente
       −15 < ir ≤ −5      Algo transparente
       ir > −5            Pobre
     Antes la comparación iba al revés (`ir >= banda.ir` recorriendo la lista de
     atrás hacia delante), así que un cielo de −3 salía como «Algo transparente»
     cuando es Pobre: con valores negativos, «mayor o igual» premia al peor cielo. */
  function transparenciaPorIr(ir) {
    if (isNaN(ir)) return null;
    for (var i = 0; i < TRANSPARENCIA.length; i++) if (ir <= TRANSPARENCIA[i].ir) return TRANSPARENCIA[i];
    return TRANSPARENCIA[TRANSPARENCIA.length - 1];   // por encima de −5: Pobre
  }
  function montarTransparencia(select, input) {
    if (select && !select._pob) {
      var html = '<option value="">— personalizado —</option>';
      TRANSPARENCIA.forEach(function (t) {
        html += '<option value="' + t.ir + '">' + t.etiqueta + ' · IR ' + t.ir + '</option>';
      });
      select.innerHTML = html;
      select._pob = true;
    }
    function sincronizarSelect() {
      var t = transparenciaPorIr(parseFloat(input.value));
      if (select) select.value = (input.value === '' || !t) ? '' : String(t.ir);
    }
    if (select) select.addEventListener('change', function () {
      if (select.value !== '') { input.value = select.value; input.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    input.addEventListener('input', sincronizarSelect);
    sincronizarSelect();
    return {
      leer: function () {
        var v = parseFloat(input.value);
        var t = transparenciaPorIr(v);
        return { ir: isNaN(v) ? null : v, etiqueta: t ? t.etiqueta : null };
      }
    };
  }

  /* ── Salud de una base: las tres medidas en un solo papel ─────────────────
     El sitio se juzga por el SQM (mag/arcsec², mayor = más oscuro), el IR (ºC,
     más negativo = más transparente) y el seeing (Antoniadi 1–5, menor = más
     quieto). Tres unidades y dos direcciones: en un eje común, el 21.4 del SQM
     y el −20 del IR caerían en extremos opuestos, y una noche buena bajaría en
     una línea mientras sube en otra.

     Así que cada serie se escala a SU propio rango y se orienta igual: arriba
     es siempre mejor cielo. Lo que se compara entre líneas es la FORMA —qué
     noches fueron mejores para cada cosa—, no la altura absoluta; por eso cada
     serie viaja con su mínimo y su máximo de verdad para etiquetar su eje. */
  var MEDIDAS_SALUD = [
    { clave: 'sqm',    titulo: 'Brillo del cielo · SQM', unidad: 'mag/arcsec²', pista: 'mayor = más oscuro',       color: 'var(--verde)', mayorEsMejor: true },
    { clave: 'ir',     titulo: 'Transparencia · IR',     unidad: 'ºC',          pista: 'menor = más transparente', color: 'var(--azul)',  mayorEsMejor: false },
    { clave: 'seeing', titulo: 'Seeing · Antoniadi',     unidad: '1–5',         pista: 'menor = más quieto',       color: 'var(--ambar)', mayorEsMejor: false }
  ];
  function numeroONulo(v) {
    if (v == null || v === '') return null;
    var n = parseFloat(v);
    return isNaN(n) ? null : n;
  }
  function seriesSalud(mediciones) {
    var fechados = [];
    (mediciones || []).forEach(function (m) {
      var fecha = m.fecha || m.noche || '';
      var t = fecha ? new Date(fecha + 'T' + (m.hora || '00:00')).getTime() : NaN;
      if (isNaN(t)) return;   // sin fecha utilizable no hay dónde ponerlo en el eje
      fechados.push({ t: t, m: m });
    });
    fechados.sort(function (a, b) { return a.t - b.t; });
    var series = [];
    MEDIDAS_SALUD.forEach(function (def) {
      var puntos = [];
      fechados.forEach(function (x) {
        var v = numeroONulo(x.m[def.clave]);
        if (v === null) return;
        puntos.push({ t: x.t, valor: v, y: 0.5, fecha: x.m.fecha || x.m.noche || '',
                      hora: x.m.hora || '', observador: x.m.observador || '' });
      });
      // Una medida que nadie anotó no es una línea: ni leyenda ni interruptor.
      if (!puntos.length) return;
      var valores = puntos.map(function (p) { return p.valor; });
      var min = Math.min.apply(null, valores), max = Math.max.apply(null, valores);
      puntos.forEach(function (p) {
        // Sin rango (una sola medición, o todas iguales) no hay altura que
        // repartir: al centro, que además evita el 0/0.
        var alto = (max === min) ? 0.5 : (p.valor - min) / (max - min);
        p.y = def.mayorEsMejor ? alto : 1 - alto;
      });
      series.push({ clave: def.clave, titulo: def.titulo, unidad: def.unidad, pista: def.pista,
                    color: def.color, min: min, max: max,
                    arriba: def.mayorEsMejor ? max : min,
                    abajo:  def.mayorEsMejor ? min : max,
                    puntos: puntos });
    });
    return {
      tMin: fechados.length ? fechados[0].t : 0,
      tMax: fechados.length ? fechados[fechados.length - 1].t : 0,
      series: series
    };
  }

  /* ── Selector de viaje del formulario de registro ──────────────────────────
     Toda observación pertenece a una sesión —el viaje interestelar—, y la
     sesión es obligatoria: es ella la que dice desde dónde se observaba, y la
     que da casa a la crónica, la meteo y la tripulación de esa noche.

     A qué NOCHE pertenece una hora lo decide el SERVIDOR: la regla del mediodía
     (antes de las 12:00 la noche es la del día anterior) vive en un solo sitio,
     bitacora-viaje.php, y copiarla aquí sería tener dos.

     De una noche pueden colgar VARIOS viajes (dos salidas desde sitios
     distintos), así que la respuesta es siempre una lista y elegir es cosa de
     quien la pinta.

     Sin DOM ni red: cada pantalla cablea sus textos y sus llamadas.

     Interfaz:
       avisoViaje({ consultar, alta, onEstado })
         -> { actualizar(fecha, hora), registrar() }

       consultar({fecha, hora}) -> Promise<viaje[]>
       alta({fecha, hora})      -> Promise<viaje>
       onEstado(estado, viajes) 'sin-datos'   falta la fecha: nada que preguntar
                                'consultando' respuesta en vuelo
                                'sin-viaje'   la noche no tiene ninguno: ofrécelo
                                'con-viaje'   los que tiene (segundo argumento)
                                'error'       no se pudo saber */
  function avisoViaje(opts) {
    opts = opts || {};
    var consultarSrv = opts.consultar || function () { return Promise.resolve([]); };
    var altaSrv = opts.alta || function () { return Promise.reject(); };
    var onEstado = opts.onEstado || function () {};
    var datos = null, turno = 0, ultima = '', lista = [];

    function emitir(estado, viajes) { onEstado(estado, viajes || []); }

    // El deduplicado es por fecha + hora exactas, no por noche: saber si dos
    // horas caen en la misma noche exige la regla del mediodía, que vive en el
    // servidor. Una consulta de más sale más barata que una copia de la regla.
    function firma(d) { return d ? d.fecha + '|' + d.hora : ''; }

    function consultar() {
      var mio = ++turno;                 // el turno descarta las respuestas rezagadas
      emitir('consultando');
      consultarSrv(datos).then(function (viajes) {
        if (mio !== turno) return;       // llegó tarde: ya se pregunta por otra noche
        lista = viajes || [];
        emitir(lista.length ? 'con-viaje' : 'sin-viaje', lista);
      }).catch(function () {
        if (mio === turno) { ultima = ''; emitir('error'); }
      });
    }

    return {
      actualizar: function (fecha, hora) {
        if (!fecha) {
          datos = null; ultima = ''; lista = []; turno++;   // lo que vuele deja de valer
          emitir('sin-datos');
          return;
        }
        var nuevos = { fecha: fecha, hora: hora || '' };
        if (firma(nuevos) === ultima) return;
        datos = nuevos; ultima = firma(nuevos);
        consultar();
      },
      registrar: function () {
        if (!datos) return Promise.resolve(null);
        var mio = ++turno;               // el alta manda sobre cualquier consulta en vuelo
        return altaSrv(datos).then(function (viaje) {
          if (mio === turno && viaje) {
            lista = lista.concat([viaje]);   // se suma: la noche puede tener varias salidas
            emitir('con-viaje', lista);
          }
          return viaje;
        });
      }
    };
  }

  /* ── Lo que el formulario enseña de la salida ───────────────────────────────
     El viaje se resuelve solo con la fecha y la hora, así que se anuncia igual
     que el objeto que SIMBAD resuelve: una línea `status` con su clase y un ✓
     delante. Es la misma idea —«esto te lo hemos rellenado nosotros»— y merece
     el mismo lenguaje visual.

     Nunca se elige: si la hora cae dentro de DOS salidas eso no es una opción
     legítima sino un error de sus fichas (nadie observa desde dos sitios a la
     vez), así que va en rojo y se arregla en la ficha del viaje, no aquí.

     Devuelve TEXTO PLANO: quien lo pinta lo mete con textContent, y así el
     nombre de una salida no puede inyectar nada.

       mensajeViaje(estado, etiquetas) -> { oculto, clase, texto, alta } */
  function mensajeViaje(estado, etiquetas) {
    etiquetas = etiquetas || [];
    var m = { oculto: false, clase: 'info', texto: '', alta: false };
    if (estado === 'sin-datos') {
      m.oculto = true;
    } else if (estado === 'consultando') {
      m.texto = 'Buscando la sesión de observación de esa fecha y hora…';
    } else if (estado === 'sin-viaje') {
      m.clase = 'err';
      m.alta = true;
      m.texto = '✗ Esa noche todavía no tiene sesión de observación (viaje estelar). '
        + 'Regístrala para poder guardar la observación.';
    } else if (estado === 'con-viaje' && etiquetas.length === 1) {
      m.clase = 'ok';
      m.texto = '✓ Esta observación se suma a la sesión “' + etiquetas[0] + '”.';
    } else if (estado === 'con-viaje') {
      m.clase = 'err';
      m.texto = '✗ Esa hora cae dentro de ' + etiquetas.length + ' sesiones a la vez, y no pudiste '
        + 'estar en todas: corrige sus horas de comienzo y fin en Mis viajes.';
    } else {
      m.clase = 'err';
      m.texto = 'No se pudo comprobar la sesión de esa noche. Cambia la fecha o recarga '
        + 'para volver a intentarlo.';
    }
    return m;
  }

  /* ── El lugar de una observación ───────────────────────────────────────────
     El lugar es del VIAJE: se sale una noche desde un sitio, no se cambia de
     sitio objeto a objeto. Pero la altura y el azimut del objeto, del Sol y de
     la Luna se calculan al registrar cada observación, y sin lugar no hay cómo.

     De ahí la regla: manda la base del viaje y, solo si el viaje no registró
     ninguna, el formulario vuelve a preguntarla. Seguir sin lugar cuesta la
     altura y el azimut, no la observación: el lugar es opcional, la sesión no.

       lugarDeObservacion(viaje, baseFormulario)
         -> { base, pedirBase, faltaViaje } */
  function lugarDeObservacion(viaje, baseFormulario) {
    if (!viaje) {
      return { base: null, pedirBase: false, faltaViaje: true };
    }
    if (viaje.base) {
      return { base: viaje.base, pedirBase: false, faltaViaje: false };
    }
    return { base: baseFormulario || null, pedirBase: true, faltaViaje: false };
  }

  /* Suma minutos a una fecha+hora locales y devuelve las dos otra vez.
     Se usa al encadenar observaciones de la misma noche: el siguiente objeto se
     apunta unos minutos después del anterior. La fecha viaja con la hora porque
     una noche cruza la medianoche: 23:50 + 20 min es el día siguiente, y dejar
     la fecha quieta guardaría la observación con la del día anterior.
       sumarMinutos('2026-08-05', '23:50', 20) -> { fecha:'2026-08-06', hora:'00:10' } */
  function sumarMinutos(fecha, hora, minutos) {
    if (!fecha) return { fecha: fecha || '', hora: hora || '' };
    if (!hora) return { fecha: fecha, hora: '' };
    var d = new Date(fecha + 'T' + hora);
    if (isNaN(d.getTime())) return { fecha: fecha, hora: hora };
    d.setMinutes(d.getMinutes() + minutos);
    function dd(n) { return (n < 10 ? '0' : '') + n; }
    return {
      fecha: d.getFullYear() + '-' + dd(d.getMonth() + 1) + '-' + dd(d.getDate()),
      hora: dd(d.getHours()) + ':' + dd(d.getMinutes())
    };
  }

  // ── Parsers/formatos de coordenadas ecuatoriales (RA/Dec) ──
  // Fuente única, compartida por el registro y el simulador de ocular. RA en
  // grados internamente. Aceptan sexagesimal ("21h 40m 22s" / "21 40 22" /
  // "21:40:22") o decimal en grados ("325.09"); Dec con signo.
  function revGrados(x) { return ((x % 360) + 360) % 360; }
  function parseRA(txt) {
    txt = String(txt == null ? '' : txt).trim(); if (txt === '') return null;
    var hms = txt.match(/(-?\d+(?:\.\d+)?)\s*[h: ]\s*(\d+(?:\.\d+)?)\s*[m: ]?\s*(\d+(?:\.\d+)?)?/i);
    if (hms && /[h:]/i.test(txt)) {
      var h = parseFloat(hms[1]), mi = parseFloat(hms[2] || 0), s = parseFloat(hms[3] || 0);
      return revGrados((h + mi / 60 + s / 3600) * 15);
    }
    var d = parseFloat(txt); return isNaN(d) ? null : revGrados(d);
  }
  function parseDec(txt) {
    txt = String(txt == null ? '' : txt).trim(); if (txt === '') return null;
    var dms = txt.match(/(-?\+?\d+(?:\.\d+)?)\s*[°d: ]\s*(\d+(?:\.\d+)?)?\s*['′m: ]?\s*(\d+(?:\.\d+)?)?/i);
    if (dms && /[°d'′"]/i.test(txt)) {
      var sign = /^\s*-/.test(txt) ? -1 : 1, dg = Math.abs(parseFloat(dms[1])), mi = parseFloat(dms[2] || 0), s = parseFloat(dms[3] || 0);
      var v = sign * (dg + mi / 60 + s / 3600); return (v < -90 || v > 90) ? null : v;
    }
    var d = parseFloat(txt); return (isNaN(d) || d < -90 || d > 90) ? null : d;
  }
  function formatRA(deg) {
    if (deg == null || deg === '' || isNaN(deg)) return '';
    var h = revGrados(parseFloat(deg)) / 15, hh = Math.floor(h), mDec = (h - hh) * 60, mm = Math.floor(mDec), ss = Math.round((mDec - mm) * 60);
    if (ss === 60) { ss = 0; mm++; } if (mm === 60) { mm = 0; hh = (hh + 1) % 24; }
    return hh + 'h ' + mm + 'm ' + ss + 's';
  }
  function formatDec(deg) {
    if (deg == null || deg === '' || isNaN(deg)) return '';
    var v = parseFloat(deg), sign = v < 0 ? '-' : '+', a = Math.abs(v), dd = Math.floor(a), mDec = (a - dd) * 60, mm = Math.floor(mDec), ss = Math.round((mDec - mm) * 60);
    if (ss === 60) { ss = 0; mm++; } if (mm === 60) { mm = 0; dd++; }
    return sign + dd + '° ' + mm + '′ ' + ss + '″';
  }

  /* Respuesta del resolvedor Sesame del CDS, en texto plano:
       %C.0 HII
       %J 83.82010000 -5.38760000 = 05 35 16.8    -05 23 15
     La línea %J trae los grados decimales y %C.0 el tipo de objeto. Sin
     resultado no hay línea %J, solo una que empieza por «#!». */
  function leerSesame(txt) {
    var j = String(txt || '').match(/^%J\s+(-?[\d.]+)\s+([-+]?[\d.]+)/m);
    if (!j) return null;
    var ra = parseFloat(j[1]), dec = parseFloat(j[2]);
    if (!isFinite(ra) || !isFinite(dec)) return null;
    var t = String(txt).match(/^%C\.0\s+(\S+)/m);
    return { ra: ra, dec: dec, otype: t ? t[1] : '' };
  }

  /* ── Resolvedor de objeto por nombre ────────────────────────────────────────
     El ciclo completo de «el observador escribe un nombre → salen su RA y su
     Dec»: espera a que deje de teclear, no repite la misma consulta, no pisa lo
     que haya escrito a mano y avisa del estado. Sin DOM: cada pantalla cablea su
     propio input y escribe sus propios textos.

     Va DIRECTO al resolvedor Sesame del CDS, que sirve
     `Access-Control-Allow-Origin: *`. No hace falta proxy ni sesión —el
     simulador vive en una página pública— y Sesame resuelve los alias por su
     cuenta: «M3», «Messier 3», «NGC 6826» o «Barnard 33» caen donde deben sin
     canonicalizar nada.

     Interfaz:
       resolutorNombre({ onResuelto, onEstado, puedeEscribir, espera })
         -> { programar(nombre) }

       onResuelto({ra, dec, otype, q})  ra/dec en grados
       onEstado(estado, q)              'buscando' | 'nada' | 'error'
       puedeEscribir()                  opcional; si devuelve false no se
                                        consulta (y si pasa a false mientras se
                                        consulta, el resultado se descarta)
       espera                           ms de espera tras la última tecla (700) */
  var SESAME_URL = 'https://cds.unistra.fr/cgi-bin/nph-sesame/-oI/S?';

  function resolutorNombre(opts) {
    opts = opts || {};
    var espera = (opts.espera != null) ? opts.espera : 700;
    var puedeEscribir = opts.puedeEscribir || function () { return true; };
    var onEstado = opts.onEstado || function () {};
    var onResuelto = opts.onResuelto || function () {};
    var temporizador = null, ultima = '';

    function consultar(q) {
      if (q === ultima || !puedeEscribir()) return;
      ultima = q;
      onEstado('buscando', q);
      fetch(SESAME_URL + encodeURIComponent(q))
        .then(function (r) { return r.text(); })
        .then(function (txt) {
          if (!puedeEscribir()) return;    // el observador escribió mientras tanto
          var d = leerSesame(txt);
          if (d) { onResuelto({ ra: d.ra, dec: d.dec, otype: d.otype, q: q }); }
          else { onEstado('nada', q); }
        })
        .catch(function () { onEstado('error', q); });
    }

    return {
      programar: function (nombre) {
        var q = String(nombre == null ? '' : nombre).trim();
        if (temporizador) clearTimeout(temporizador);
        // Menos de dos letras no es un nombre: ni se consulta ni se avisa.
        if (q.length < 2 || !puedeEscribir()) return;
        temporizador = setTimeout(function () { consultar(q); }, espera);
      }
    };
  }

  return {
    esc: esc,
    leerSesame: leerSesame,
    resolutorNombre: resolutorNombre,
    montarBuscadorCatalogo: montarBuscadorCatalogo,
    BORTLE: BORTLE,
    claseBortlePorSqm: claseBortlePorSqm,
    montarCielo: montarCielo,
    TRANSPARENCIA: TRANSPARENCIA,
    transparenciaPorIr: transparenciaPorIr,
    montarTransparencia: montarTransparencia,
    seriesSalud: seriesSalud,
    avisoViaje: avisoViaje,
    mensajeViaje: mensajeViaje,
    lugarDeObservacion: lugarDeObservacion,
    sumarMinutos: sumarMinutos,
    parseRA: parseRA,
    parseDec: parseDec,
    formatRA: formatRA,
    formatDec: formatDec
  };
})();
