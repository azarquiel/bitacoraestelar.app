
/* ============================================================================
   MOTOR · lógica pura de la plantilla: el estado a XML, el XML al estado y qué
   falta por rellenar. Sin DOM, para que scripts/test_oal_plantilla.js lo cargue
   tal cual.

   Este bloque es la fuente; scripts/generar_motor_oal.js lo extrae, literal, a
   registro/resources/js/bitacora-oal-motor.js, que es lo que sirve el sitio.
   Esa copia está GENERADA: se toca aquí, nunca allí, o el siguiente extraído se
   lleva el arreglo por delante.
   ========================================================================== */
(function (raiz) {
  'use strict';

  var VERSION_PLANTILLA = '1.1';
  var NS_BIT = 'https://bitacoraestelar.es/oal-ext/1';

  /* ── Texto ─────────────────────────────────────────────────────────────── */

  function escapar(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');   // XML 1.0 no admite estos
  }

  function desescapar(s) {
    return String(s == null ? '' : s)
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (_, n) {
        return String.fromCharCode(parseInt(n, 10));
      }).replace(/&amp;/g, '&');   // el último, o desharía los anteriores
  }

  /* ── Tiempo ────────────────────────────────────────────────────────────────
     La NOCHE es la del anochecer. Antes de las 12:00 el reloj de pared ya va
     por el día siguiente, así que la fecha del instante se adelanta un día.
     Es la misma regla que bitacora_viaje_noche() en PHP, en espejo.          */

  function diaSiguiente(dia) {
    var d = new Date(dia + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  /** Fecha de reloj de una hora dentro de una noche: 'Y-m-d'. */
  /* La hora se lee ESTRICTA (HH:mm de dos dígitos), el mismo criterio que
     bitacora_viaje_noche en el servidor: una hora ilegible («9:30», «ayer»,
     «25:00») no desplaza la fecha. Son dos relojes del MISMO convenio de
     mediodía y no pueden divergir: la paridad con la tabla de casos de
     scripts/test_viaje_noche.php la fija scripts/test_noche_paridad.js. */
  function fechaDeReloj(noche, hora) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(noche || ''))) { return null; }
    var h = /^([01]\d|2[0-3]):([0-5]\d)/.exec(String(hora || ''));
    if (!h) { return noche; }
    return (parseInt(h[1], 10) < 12) ? diaSiguiente(noche) : noche;
  }

  /** La noche a la que pertenece una fecha+hora de reloj (inversa de la anterior). */
  function nocheDe(fecha, hora) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ''))) { return null; }
    var h = /^([01]\d|2[0-3]):([0-5]\d)/.exec(String(hora || ''));
    if (!h || parseInt(h[1], 10) >= 12) { return fecha; }
    var d = new Date(fecha + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  function desfase(tzMin) {
    var m = parseInt(tzMin, 10);
    if (!isFinite(m)) { m = 0; }
    var signo = m < 0 ? '-' : '+';
    m = Math.abs(m);
    return signo + dos(Math.floor(m / 60)) + ':' + dos(m % 60);
  }

  function dos(n) { return (n < 10 ? '0' : '') + n; }

  /**
   * Instante ISO con desfase, a partir de la noche y una hora local.
   *   instante('2026-08-05', '23:40', 120) -> '2026-08-05T23:40:00+02:00'
   *   instante('2026-08-05', '02:15', 120) -> '2026-08-06T02:15:00+02:00'
   */
  function instante(noche, hora, tzMin) {
    var fecha = fechaDeReloj(noche, hora);
    if (!fecha) { return ''; }
    var h = /^(\d{1,2}):(\d{2})/.exec(String(hora || ''));
    if (!h) { return ''; }
    return fecha + 'T' + dos(parseInt(h[1], 10)) + ':' + h[2] + ':00' + desfase(tzMin);
  }

  /* ── XML: lectura ──────────────────────────────────────────────────────────
     Un árbol mínimo. No es un parser de XML general: lee lo que esta misma
     plantilla escribe (sin CDATA, sin entidades propias, sin mezclar texto y
     elementos). Cualquier otra cosa se ignora en silencio, que es lo que
     queremos: el importador del portal es quien valida de verdad.            */

  function arbol(xml) {
    var limpio = String(xml || '').replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
    var re = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;
    var raizNodo = { nombre: '#raiz', attrs: {}, texto: '', hijos: [] };
    var pila = [raizNodo], m, pos = 0;
    while ((m = re.exec(limpio))) {
      var actual = pila[pila.length - 1];
      var texto = limpio.slice(pos, m.index);
      if (texto && !/^\s*$/.test(texto)) { actual.texto += desescapar(texto); }
      pos = re.lastIndex;
      if (m[1]) {                                   // cierre
        if (pila.length > 1) { pila.pop(); }
        continue;
      }
      var nodo = { nombre: m[2], attrs: atributos(m[3]), texto: '', hijos: [] };
      actual.hijos.push(nodo);
      if (!m[4]) { pila.push(nodo); }               // no autocerrado
    }
    return raizNodo.hijos[0] || raizNodo;
  }

  function atributos(s) {
    var out = {}, re = /([\w:.-]+)\s*=\s*"([^"]*)"/g, m;
    while ((m = re.exec(s || ''))) { out[m[1]] = desescapar(m[2]); }
    return out;
  }

  function hijos(nodo, nombre) {
    if (!nodo) { return []; }
    return nodo.hijos.filter(function (h) { return h.nombre === nombre; });
  }

  function hijo(nodo, nombre) { return hijos(nodo, nombre)[0] || null; }

  /**
   * El <sky-quality> de una observación, siempre en mag/arcsec². OAL admite
   * también mag/arcmin², y hay 8,89 mag de diferencia (2,5·log10 3600).
   */
  function sqmDe(nodo) {
    var e = hijo(nodo, 'sky-quality');
    var v = numero(nodo, 'sky-quality');
    if (!e || v === '') { return ''; }
    return e.attrs.unit === 'mags-per-squarearcmin' ? v + 8.89 : v;
  }

  function texto(nodo, nombre) {
    var h = hijo(nodo, nombre);
    return h ? h.texto.trim() : '';
  }

  function numero(nodo, nombre) {
    var t = texto(nodo, nombre);
    if (t === '') { return ''; }
    var n = parseFloat(t.replace(',', '.'));
    return isFinite(n) ? n : '';
  }

  /* ── Tipos de objeto ───────────────────────────────────────────────────────
     Del código de tipo de Sesame (CDS) al xsi:type de OAL. Lo que no esté en la
     tabla entra como deepSkyNA («zona del cielo»), que no miente sobre lo que
     no sabemos.                                                              */

  var TIPOS = {
    G: 'deepSkyGX', GiG: 'deepSkyGX', IG: 'deepSkyGX', GiC: 'deepSkyGX',
    LSB: 'deepSkyGX', AGN: 'deepSkyGX', Sy1: 'deepSkyGX', Sy2: 'deepSkyGX',
    ClG: 'deepSkyCG', GrG: 'deepSkyCG',
    GlC: 'deepSkyGC',
    OpC: 'deepSkyOC', 'Cl*': 'deepSkyOC',
    PN: 'deepSkyPN',
    DNe: 'deepSkyDN',
    RNe: 'deepSkyGN', HII: 'deepSkyGN', GNe: 'deepSkyGN', EmO: 'deepSkyGN',
    SNR: 'deepSkyGN', MoC: 'deepSkyGN', ISM: 'deepSkyGN',
    'As*': 'deepSkyAS',
    '**': 'deepSkyDS', 'Do*': 'deepSkyDS',
    'Mu*': 'deepSkyMS',
    QSO: 'deepSkyQS',
    'V*': 'variableStarTargetType', 'LP*': 'variableStarTargetType',
    'Mi*': 'variableStarTargetType', 'C*': 'variableStarTargetType'
  };

  function tipoOal(otype) {
    return TIPOS[String(otype || '').trim()] || 'deepSkyNA';
  }

  /* ── Aumentos ──────────────────────────────────────────────────────────── */

  function aumentos(tel, ocu, aux) {
    var ft = tel ? parseFloat(tel.focal) : NaN;
    var fo = ocu ? parseFloat(ocu.focal) : NaN;
    var factor = aux && parseFloat(aux.factor) ? parseFloat(aux.factor) : 1;
    if (!isFinite(ft) || !isFinite(fo) || fo <= 0) { return ''; }
    return Math.round(ft * factor / fo * 10) / 10;
  }

  /* ── El cielo ──────────────────────────────────────────────────────────────
     El cielo cuelga de la OBSERVACIÓN, no de la noche (ADR 0001): el SQM se mide
     hacia donde está el objeto, y en España uno bajo cae sobre un horizonte
     contaminado. Que dos objetos de la misma noche discrepen es lo normal.

     Preguntarlo seis veces sería hostil, así que la noche guarda un valor por
     DEFECTO y siembra a sus observaciones. Sembrar nunca pisa: lo tecleado a
     mano en una observación manda sobre lo que diga su noche.                */

  var CIELO = ['sqm', 'ir', 'seeing', 'bortle'];

  function vacio(v) { return v === '' || v == null; }

  /**
   * Vuelca el cielo de una noche en las observaciones suyas que lo heredan.
   *
   * Hereda la que no tiene valor propio y, si se pasa 'previo' —el cielo que
   * la noche tenía antes del cambio—, también la que sigue mostrando ese
   * valor: esa casilla venía de la noche y no de la mano de nadie. Lo tecleado
   * a mano difiere del anterior y no se toca (ADR 0001).
   */
  function sembrarCielo(e, nocheId, previo) {
    var n = indice((e || {}).noches)[nocheId];
    if (!n) { return e; }
    ((e || {}).observaciones || []).forEach(function (o) {
      if (o.nocheId !== nocheId) { return; }
      CIELO.forEach(function (c) {
        var heredada = vacio(o[c]) ||
          (previo && !vacio(previo[c]) && String(o[c]) === String(previo[c]));
        if (heredada && !vacio(n[c])) { o[c] = n[c]; }
      });
    });
    return e;
  }

  /** El seeing del estándar es la escala Antoniadi: entero de 1 a 5. */
  function antoniadi(v) {
    return vacio(v) ? '' : Math.min(5, Math.max(1, Math.round(v)));
  }

  /**
   * Reparte el cielo al abrir un XML, y en este orden:
   *   1. de la noche a sus observaciones sin valor propio. Como va ANTES del
   *      paso 2, solo baja lo que la noche traía escrito, o sea la forma vieja
   *      (bit:sqm en <session>). En un fichero nuevo la noche llega vacía y no
   *      baja nada: el SQM es direccional y el de una observación no vale como
   *      medida de la de al lado (ADR 0001);
   *   2. y de vuelta a la noche, el primero de sus observaciones, para que la
   *      casilla del valor por defecto no salga en blanco.
   */
  function repartirCielo(e) {
    (((e || {}).noches) || []).forEach(function (n) {
      sembrarCielo(e, n.id);
      var mias = ((e || {}).observaciones || []).filter(function (o) { return o.nocheId === n.id; });
      CIELO.forEach(function (c) {
        if (!vacio(n[c])) { return; }
        for (var i = 0; i < mias.length; i++) {
          if (!vacio(mias[i][c])) { n[c] = mias[i][c]; break; }
        }
      });
    });
    return e;
  }

  /* ── Qué falta ─────────────────────────────────────────────────────────────
     'falta' impide descargar; 'flojo' solo avisa. Recuperar una libreta de hace
     años no puede exigir la hora exacta ni el ocular.                        */

  function problemas(e) {
    var out = [];
    if (!(e.observador && String(e.observador.nombre || '').trim())) {
      out.push({ nivel: 'falta', que: 'Tu nombre.' });
    }
    var lugares = indice(e.lugares);
    (e.noches || []).forEach(function (n, i) {
      var et = 'Noche ' + (i + 1) + (n.fecha ? ' (' + n.fecha + ')' : '');
      if (!n.fecha) { out.push({ nivel: 'falta', que: et + ': sin fecha.' }); }
      if (!lugares[n.lugarId]) { out.push({ nivel: 'falta', que: et + ': sin lugar.' }); }
      if (!n.comienzo) { out.push({ nivel: 'flojo', que: et + ': sin hora de comienzo.' }); }
      var conCielo = [n].concat((e.observaciones || []).filter(function (o) { return o.nocheId === n.id; }));
      if (!conCielo.some(function (x) { return CIELO.some(function (c) { return !vacio(x[c]); }); })) {
        out.push({ nivel: 'flojo', que: et + ': sin ninguna medida de cielo.' });
      }
    });
    var noches = indice(e.noches);
    (e.observaciones || []).forEach(function (o, i) {
      var et = 'Observación ' + (i + 1) + (o.objeto ? ' (' + o.objeto + ')' : '');
      if (!String(o.objeto || '').trim()) { out.push({ nivel: 'falta', que: et + ': sin objeto.' }); }
      if (!String(o.texto || '').trim()) { out.push({ nivel: 'falta', que: et + ': sin descripción.' }); }
      if (!noches[o.nocheId]) { out.push({ nivel: 'falta', que: et + ': no cuelga de ninguna noche.' }); }
      if (!o.telescopioId) { out.push({ nivel: 'flojo', que: et + ': sin telescopio.' }); }
      if (!o.hora) { out.push({ nivel: 'flojo', que: et + ': sin hora.' }); }
      if (o.ra === '' || o.ra == null) { out.push({ nivel: 'flojo', que: et + ': sin coordenadas (se resolverán al importar).' }); }
    });
    if (!(e.observaciones || []).length) {
      out.push({ nivel: 'falta', que: 'No hay ninguna observación.' });
    }
    return out;
  }

  function indice(lista) {
    var out = {};
    (lista || []).forEach(function (x) { out[x.id] = x; });
    return out;
  }

  /* ── XML: escritura ────────────────────────────────────────────────────── */

  function etiqueta(nombre, valor, attrs) {
    if (valor === '' || valor == null) { return ''; }
    var a = '';
    for (var k in (attrs || {})) { a += ' ' + k + '="' + escapar(attrs[k]) + '"'; }
    return '<' + nombre + a + '>' + escapar(valor) + '</' + nombre + '>';
  }

  /* Nombre normalizado: sin acentos, sin mayúsculas, sin puntuación ni espacios
     de más. Misma receta que bitacora_oal_clave() en el importador, para que
     «M 13», «M-13» y «m13» sean el mismo objeto a los dos lados. */
  function clave(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Quién firma el fichero, sin repetir y con un id estable.
   *
   * El que exporta es siempre 'ob1'. Detrás van los compañeros de todas las
   * noches y quien firme alguna observación sin ser el que exporta: el mismo
   * nombre normalizado es la misma persona, aparezca donde aparezca.
   */
  function observadores(e) {
    var yo = e.observador || {};
    var mio = (String(yo.nombre || '') + ' ' + String(yo.apellidos || '')).trim();
    var vistos = {}, out = [];
    if (mio) { vistos[clave(mio)] = 'ob1'; }
    function alta(raw) {
      var nombre = String(raw == null ? '' : raw).trim();
      if (!nombre || vistos[clave(nombre)]) { return; }
      var id = 'co' + (out.length + 1);
      vistos[clave(nombre)] = id;
      out.push({ id: id, nombre: nombre });
    }
    (e.noches || []).forEach(function (n) {
      String(n.tripulacion || '').split(',').forEach(alta);
    });
    (e.observaciones || []).forEach(function (o) { alta(o.observador); });
    return { lista: out, porNombre: vistos };
  }

  /**
   * Los recursos que alguna fila del fichero referencia de verdad.
   *
   * No es estética: el diálogo de importación de AstroPlanner pinta cada sitio,
   * telescopio, ocular y lente del fichero como una fila que hay que emparejar
   * a mano, y volcar el catálogo entero lo llena de ruido. El lugar cuenta si
   * lo usa una NOCHE, porque las sesiones se emiten todas.
   */
  function usados(e) {
    var u = { lugares: {}, telescopios: {}, oculares: {}, auxiliares: {} };
    (e.noches || []).forEach(function (n) { if (n.lugarId) { u.lugares[n.lugarId] = 1; } });
    (e.observaciones || []).forEach(function (o) {
      if (o.telescopioId) { u.telescopios[o.telescopioId] = 1; }
      if (o.ocularId) { u.oculares[o.ocularId] = 1; }
      if (o.auxiliarId) { u.auxiliares[o.auxiliarId] = 1; }
    });
    return u;
  }

  function referenciados(lista, marcados) {
    return (lista || []).filter(function (x) { return marcados[x.id]; });
  }

  /* Una referencia solo vale si el recurso está EN el fichero: un id que no
     tiene <site>/<scope>/<eyepiece>/<lens> arriba es un IDREF colgando, y eso
     no valida —y el que lo lea no sabe a qué apunta—. Mejor sin el dato. */
  function ref(mapa, id) {
    return (id && mapa[id]) ? id : '';
  }

  /* El huso con el que se fecha la noche: el del lugar, y si la salida no
     tiene lugar, el que traiga la propia noche (el del sitio, que lo pone el
     servidor). Sin esto todo salía en +00:00, o sea con la hora mal. */
  function husoDe(noche, lugar) {
    return (lugar && lugar.tz != null && lugar.tz !== '') ? lugar.tz : noche.tz;
  }

  /** Un target por objeto distinto (OAL los cataloga aparte de la observación). */
  function targets(e) {
    var vistos = {}, out = [];
    (e.observaciones || []).forEach(function (o) {
      var k = clave(o.objeto);
      if (!k || vistos[k]) { return; }
      vistos[k] = 'tg' + (out.length + 1);
      out.push({ id: vistos[k], nombre: String(o.objeto).trim(), ra: o.ra, dec: o.dec, otype: o.otype });
    });
    return { lista: out, porNombre: vistos };
  }

  function xmlDe(estado) {
    var e = estado || {};
    var L = '\n', s = [];
    var lugares = indice(e.lugares), noches = indice(e.noches);
    var tel = indice(e.telescopios), ocu = indice(e.oculares), aux = indice(e.auxiliares);
    var ob = observadores(e), tg = targets(e), usa = usados(e);

    s.push('<?xml version="1.0" encoding="UTF-8"?>');
    s.push('<oal:observations version="2.1"' +
      // Los dos con http:// y no https://. No es un descuido: un URI de espacio
      // de nombres se compara LITERAL, nunca se resuelve, y el targetNamespace
      // de oal21.xsd es http://. Con https:// el fichero es de otro dialecto
      // para cualquier lector que no sea el nuestro —que compara por localName
      // y es ciego a esto—. AstroPlanner emite https:// pero lee http://,
      // comprobado importando este mismo fichero.
      ' xmlns:oal="http://groups.google.com/group/openastronomylog"' +
      ' xmlns:bit="' + NS_BIT + '"' +
      ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' +
      ' bit:plantilla="' + VERSION_PLANTILLA + '">');

    s.push('  <sites>');
    referenciados(e.lugares, usa.lugares).forEach(function (l) {
      s.push('    <site id="' + escapar(l.id) + '">');
      s.push('      ' + etiqueta('name', l.nombre));
      s.push('      ' + etiqueta('longitude', l.lon, { unit: 'deg' }));
      s.push('      ' + etiqueta('latitude', l.lat, { unit: 'deg' }));
      s.push('      ' + etiqueta('elevation', l.altitud));
      s.push('      ' + etiqueta('timezone', l.tz));
      s.push('    </site>');
    });
    s.push('  </sites>');

    s.push('  <scopes>');
    referenciados(e.telescopios, usa.telescopios).forEach(function (t) {
      s.push('    <scope id="' + escapar(t.id) + '">');
      s.push('      ' + etiqueta('model', t.modelo));
      s.push('      ' + etiqueta('aperture', t.apertura));
      s.push('      ' + etiqueta('focalLength', t.focal));
      s.push('    </scope>');
    });
    s.push('  </scopes>');

    s.push('  <eyepieces>');
    referenciados(e.oculares, usa.oculares).forEach(function (o) {
      s.push('    <eyepiece id="' + escapar(o.id) + '">');
      s.push('      ' + etiqueta('model', o.modelo));
      s.push('      ' + etiqueta('focalLength', o.focal));
      s.push('      ' + etiqueta('apparentFOV', o.campo, { unit: 'deg' }));
      s.push('    </eyepiece>');
    });
    s.push('  </eyepieces>');

    s.push('  <lenses>');
    referenciados(e.auxiliares, usa.auxiliares).forEach(function (a) {
      s.push('    <lens id="' + escapar(a.id) + '">');
      s.push('      ' + etiqueta('model', a.modelo));
      s.push('      ' + etiqueta('factor', a.factor));
      s.push('    </lens>');
    });
    s.push('  </lenses>');

    s.push('  <observers>');
    var yo = e.observador || {};
    s.push('    <observer id="ob1">');
    s.push('      ' + etiqueta('firstName', yo.nombre));
    s.push('      ' + etiqueta('lastName', yo.apellidos));
    s.push('      ' + etiqueta('contact', yo.correo));
    s.push('    </observer>');
    ob.lista.forEach(function (c) {
      s.push('    <observer id="' + escapar(c.id) + '">');
      s.push('      ' + etiqueta('firstName', c.nombre));
      s.push('    </observer>');
    });
    s.push('  </observers>');

    s.push('  <targets>');
    tg.lista.forEach(function (t) {
      s.push('    <target id="' + escapar(t.id) + '" xsi:type="oal:' + tipoOal(t.otype) + '">');
      s.push('      <datasource>' + (t.ra === '' || t.ra == null ? 'Observador' : 'Sesame/CDS') + '</datasource>');
      s.push('      ' + etiqueta('name', t.nombre));
      if (t.ra !== '' && t.ra != null && t.dec !== '' && t.dec != null) {
        s.push('      <position>');
        s.push('        ' + etiqueta('ra', t.ra, { unit: 'deg' }));
        s.push('        ' + etiqueta('dec', t.dec, { unit: 'deg' }));
        s.push('      </position>');
      }
      s.push('    </target>');
    });
    s.push('  </targets>');

    s.push('  <sessions>');
    (e.noches || []).forEach(function (n) {
      var l = lugares[n.lugarId] || {};
      var tzn = husoDe(n, l);
      s.push('    <session id="' + escapar(n.id) + '">');
      s.push('      ' + etiqueta('begin', instante(n.fecha, n.comienzo || '21:00', tzn)));
      if (n.fin) { s.push('      ' + etiqueta('end', instante(n.fecha, n.fin, tzn))); }
      s.push('      ' + etiqueta('site', ref(lugares, n.lugarId)));
      String(n.tripulacion || '').split(',').forEach(function (raw) {
        var id = ob.porNombre[clave(raw)];
        if (id) { s.push('      ' + etiqueta('coObserver', id)); }
      });
      s.push('      ' + etiqueta('weather', n.meteo));
      s.push('      ' + etiqueta('comments', n.cronica));
      s.push('    </session>');
    });
    s.push('  </sessions>');

    (e.observaciones || []).forEach(function (o, i) {
      var n = noches[o.nocheId] || {};
      var l = lugares[n.lugarId] || {};
      var aum = o.aumentos !== '' && o.aumentos != null
        ? o.aumentos
        : aumentos(tel[o.telescopioId], ocu[o.ocularId], aux[o.auxiliarId]);
      // El ORDEN es el de la xsd:sequence de observationType, que es ordenada;
      // emitirlo bien no cuesta nada y es lo único que separa este fichero de
      // uno válido. Lo de bit: va al final: es lo que el esquema no conoce.
      s.push('  <observation id="' + escapar(o.id || ('obs' + (i + 1))) + '">');
      s.push('    ' + etiqueta('observer', ob.porNombre[clave(o.observador)] || 'ob1'));
      s.push('    ' + etiqueta('site', ref(lugares, n.lugarId)));
      s.push('    ' + etiqueta('session', ref(noches, o.nocheId)));
      s.push('    ' + etiqueta('target', tg.porNombre[clave(o.objeto)]));
      s.push('    ' + etiqueta('begin', instante(n.fecha, o.hora || n.comienzo || '21:00', husoDe(n, l))));
      // El cielo, en la observación y con los elementos estándar donde existen.
      // Solo IR y Bortle siguen en bit:, que es lo que OAL no tiene dónde poner.
      s.push('    ' + etiqueta('sky-quality', o.sqm, { unit: 'mags-per-squarearcsec' }));
      s.push('    ' + etiqueta('seeing', antoniadi(o.seeing)));
      s.push('    ' + etiqueta('scope', ref(tel, o.telescopioId)));
      s.push('    ' + etiqueta('eyepiece', ref(ocu, o.ocularId)));
      s.push('    ' + etiqueta('lens', ref(aux, o.auxiliarId)));
      s.push('    ' + etiqueta('magnification', aum));
      // resultType es ABSTRACTO: sin xsi:type el elemento no se puede instanciar.
      // Se emite siempre el de cielo profundo —también para una variable, que es
      // el único otro target que sale de aquí— porque es el que lleva <rating>, y
      // 99 es «desconocido», que es la verdad: aquí nadie puntúa lo que ve.
      // AstroPlanner no emite ninguno de los dos y los ignora al leer.
      s.push('    <result xsi:type="oal:findingsDeepSkyType">' +
             etiqueta('description', o.texto) + '<rating>99</rating></result>');
      s.push('    ' + etiqueta('bit:ir', o.ir));
      s.push('    ' + etiqueta('bit:bortle', o.bortle));
      s.push('  </observation>');
    });

    s.push('</oal:observations>');
    return s.filter(function (linea) { return linea.trim() !== ''; }).join(L) + L;
  }

  /* ── El correo ─────────────────────────────────────────────────────────────
     Hermano de xmlDe(): el MISMO estado contado en HTML para pegarlo en un
     correo. Sale de aquí y no de otra consulta, porque el correo y el fichero
     que lo acompaña tienen que contar lo mismo, y dos consultas distintas acaban
     dando dos números distintos.

     Determinista y sin prosa generada (ADR 0004): no se redacta ni una frase que
     no haya escrito el observador; solo se ordena lo que ya está.             */

  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
               'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function fechaLarga(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) { return String(iso || ''); }
    return parseInt(m[3], 10) + ' de ' + MESES[parseInt(m[2], 10) - 1] + ' de ' + m[1];
  }

  /** El primer valor no vacío de una lista de filas, o ''. */
  function primero(filas, campo) {
    for (var i = 0; i < filas.length; i++) {
      if (!vacio(filas[i][campo])) { return filas[i][campo]; }
    }
    return '';
  }

  function textoDe(estado) {
    var e = estado || {};
    var lugares = indice(e.lugares);
    var tel = indice(e.telescopios), ocu = indice(e.oculares), aux = indice(e.auxiliares);
    var s = [];

    (e.noches || []).forEach(function (n) {
      var mias = (e.observaciones || []).filter(function (o) { return o.nocheId === n.id; });
      var l = lugares[n.lugarId] || {};
      // El cielo cuelga de la observación (ADR 0001), así que la cabecera enseña
      // el primero que haya de la noche: es un resumen, no una medida.
      var conCielo = [n].concat(mias);
      var sitio = [];
      if (l.nombre) { sitio.push(l.nombre); }
      if (n.comienzo || n.fin) { sitio.push((n.comienzo || '?') + '–' + (n.fin || '?')); }
      var cielo = [];
      if (!vacio(primero(conCielo, 'sqm'))) { cielo.push('SQM ' + primero(conCielo, 'sqm') + ' mag/arcsec²'); }
      if (!vacio(primero(conCielo, 'bortle'))) { cielo.push('Bortle ' + primero(conCielo, 'bortle')); }
      if (!vacio(primero(conCielo, 'seeing'))) { cielo.push('seeing ' + antoniadi(primero(conCielo, 'seeing'))); }
      if (!vacio(primero(conCielo, 'ir'))) { cielo.push('IR ' + primero(conCielo, 'ir')); }
      if (n.meteo) { cielo.push(n.meteo); }

      s.push('<h2>Salida del ' + escapar(fechaLarga(n.fecha)) + '</h2>');
      if (sitio.length) { s.push('<p>' + escapar(sitio.join(' · ')) + '</p>'); }
      if (cielo.length) { s.push('<p>' + escapar(cielo.join(' · ')) + '</p>'); }
      if (n.tripulacion) { s.push('<p>Tripulación: ' + escapar(n.tripulacion) + '</p>'); }
      if (n.cronica) { s.push('<p>' + escapar(n.cronica) + '</p>'); }

      s.push('<table border="1" cellpadding="6" cellspacing="0">');
      s.push('<tr><th>Hora</th><th>Objeto</th><th>Aumento</th><th>Lo que se vio</th></tr>');
      mias.forEach(function (o) {
        var a = !vacio(o.aumentos) ? o.aumentos
          : aumentos(tel[o.telescopioId], ocu[o.ocularId], aux[o.auxiliarId]);
        s.push('<tr><td>' + escapar(o.hora) + '</td><td>' + escapar(o.objeto) + '</td>' +
               '<td>' + (vacio(a) ? '' : escapar(a) + '×') + '</td>' +
               '<td>' + escapar(o.texto) + '</td></tr>');
      });
      s.push('</table>');
    });
    return s.join('\n') + '\n';
  }

  /* ── XML: de vuelta al estado ────────────────────────────────────────────
     Para seguir otro día o corregir tras un rechazo. Conserva los identifica-
     dores, que es lo que hace que reimportar actualice en vez de duplicar.   */

  function leer(xml) {
    var raizNodo = arbol(xml);
    var e = estadoVacio();

    hijos(hijo(raizNodo, 'sites'), 'site').forEach(function (n) {
      e.lugares.push({ id: n.attrs.id, nombre: texto(n, 'name'), lat: numero(n, 'latitude'),
                       lon: numero(n, 'longitude'), altitud: numero(n, 'elevation'), tz: numero(n, 'timezone') });
    });
    hijos(hijo(raizNodo, 'scopes'), 'scope').forEach(function (n) {
      e.telescopios.push({ id: n.attrs.id, modelo: texto(n, 'model'),
                           apertura: numero(n, 'aperture'), focal: numero(n, 'focalLength') });
    });
    hijos(hijo(raizNodo, 'eyepieces'), 'eyepiece').forEach(function (n) {
      e.oculares.push({ id: n.attrs.id, modelo: texto(n, 'model'),
                        focal: numero(n, 'focalLength'), campo: numero(n, 'apparentFOV') });
    });
    hijos(hijo(raizNodo, 'lenses'), 'lens').forEach(function (n) {
      e.auxiliares.push({ id: n.attrs.id, modelo: texto(n, 'model'), factor: numero(n, 'factor') });
    });

    var obs = hijos(hijo(raizNodo, 'observers'), 'observer');
    var porId = {};
    obs.forEach(function (n, i) {
      porId[n.attrs.id] = texto(n, 'firstName') + (texto(n, 'lastName') ? ' ' + texto(n, 'lastName') : '');
      if (i === 0) {
        e.observador = { nombre: texto(n, 'firstName'), apellidos: texto(n, 'lastName'), correo: texto(n, 'contact') };
      }
    });

    var objetos = {};
    hijos(hijo(raizNodo, 'targets'), 'target').forEach(function (n) {
      var pos = hijo(n, 'position');
      objetos[n.attrs.id] = { nombre: texto(n, 'name'),
                              ra: pos ? numero(pos, 'ra') : '', dec: pos ? numero(pos, 'dec') : '',
                              otype: otypeDe(n.attrs['xsi:type']) };
    });

    hijos(hijo(raizNodo, 'sessions'), 'session').forEach(function (n) {
      var b = partirInstante(texto(n, 'begin'));
      var f = partirInstante(texto(n, 'end'));
      e.noches.push({
        id: n.attrs.id,
        fecha: b.fecha && b.hora ? nocheDe(b.fecha, b.hora) : b.fecha,
        lugarId: texto(n, 'site'), comienzo: b.hora, fin: f.hora,
        // El huso con el que venía fechada, por si la noche no trae lugar: sin
        // esto, volver a escribirla la mandaría a UTC y le movería la hora.
        tz: b.tz,
        tripulacion: hijos(n, 'coObserver').map(function (c) { return porId[c.texto.trim()] || ''; })
                       .filter(Boolean).join(', '),
        // Forma vieja: el cielo de la noche entera. Ya no se escribe, pero los
        // XML que los compañeros rellenaron lo traen, y de aquí se reparte.
        sqm: numero(n, 'bit:sqm'), ir: numero(n, 'bit:ir'),
        seeing: numero(n, 'bit:seeing'), bortle: numero(n, 'bit:bortle'),
        meteo: texto(n, 'weather'), cronica: texto(n, 'comments')
      });
    });

    hijos(raizNodo, 'observation').forEach(function (n) {
      var t = objetos[texto(n, 'target')] || {};
      var b = partirInstante(texto(n, 'begin'));
      e.observaciones.push({
        id: n.attrs.id, nocheId: texto(n, 'session'), objeto: t.nombre || '',
        // Quién la firmó, por su NOMBRE: los ids de observador son del fichero
        // y no significan nada fuera de él. El importador empareja por nombre.
        observador: porId[texto(n, 'observer')] || '',
        ra: t.ra === undefined ? '' : t.ra, dec: t.dec === undefined ? '' : t.dec, otype: t.otype || '',
        hora: b.hora, telescopioId: texto(n, 'scope'), ocularId: texto(n, 'eyepiece'),
        auxiliarId: texto(n, 'lens'), aumentos: numero(n, 'magnification'),
        sqm: sqmDe(n), ir: numero(n, 'bit:ir'),
        seeing: numero(n, 'seeing'), bortle: numero(n, 'bit:bortle'),
        texto: texto(hijo(n, 'result'), 'description')
      });
    });
    return repartirCielo(e);
  }

  /** Del xsi:type de OAL a un código de Sesame cualquiera que vuelva a él. */
  function otypeDe(xsitype) {
    var t = String(xsitype || '').replace(/^oal:/, '');
    for (var k in TIPOS) { if (TIPOS[k] === t) { return k; } }
    return '';
  }

  function partirInstante(iso) {
    var m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?(Z|[+-]\d{2}:\d{2})?/.exec(String(iso || ''));
    return m ? { fecha: m[1], hora: m[2], tz: minutosDeDesfase(m[3]) } : { fecha: '', hora: '', tz: '' };
  }

  /** '+02:00' -> 120. Inversa de desfase(). Sin desfase escrito, ''. */
  function minutosDeDesfase(txt) {
    if (!txt) { return ''; }
    if (txt === 'Z') { return 0; }
    var m = /^([+-])(\d{2}):(\d{2})$/.exec(txt);
    if (!m) { return ''; }
    return (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
  }

  function estadoVacio() {
    return { observador: { nombre: '', apellidos: '', correo: '' },
             lugares: [], telescopios: [], oculares: [], auxiliares: [],
             noches: [], observaciones: [] };
  }

  var API = { VERSION_PLANTILLA: VERSION_PLANTILLA, escapar: escapar, desescapar: desescapar,
              nocheDe: nocheDe, fechaDeReloj: fechaDeReloj, instante: instante, desfase: desfase,
              tipoOal: tipoOal, aumentos: aumentos, problemas: problemas, clave: clave,
              CIELO: CIELO, sembrarCielo: sembrarCielo, repartirCielo: repartirCielo,
              antoniadi: antoniadi,
              xmlDe: xmlDe, textoDe: textoDe, fechaLarga: fechaLarga,
              leer: leer, arbol: arbol, estadoVacio: estadoVacio };

  raiz.PlantillaOAL = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
}(typeof window !== 'undefined' ? window : this));
