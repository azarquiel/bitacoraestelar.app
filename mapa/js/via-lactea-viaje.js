/* ============================================================================
   via-lactea-viaje.js — LA RUTA DE UN VIAJE INTERESTELAR EN EL MAPA
   Proyecto: mapa interactivo de la Vía Láctea (Gaia)

   Un viaje es la salida de UN observador, UNA noche, desde UN lugar. Este
   módulo responde a "qué objetos se visitaron, en qué orden y en qué escala",
   que es lo único que el mapa necesita para dibujar la ruta dorada.

   El ORDEN no se decide aquí: viene ya resuelto del servidor en VIAJES[id]
   .objetos (por hora de observación y, las que no la registraron, al final por
   id). Es el mismo orden que se lee en la ficha del viaje y en "Mis viajes":
   una sola fuente, para que la línea del mapa y la lista no puedan divergir.

   La ruta se parte en TRES TRAMOS porque el visor tiene tres escalas con
   proyecciones distintas, y cada una dibuja la suya con su propio origen:

     vecindario  (≤ CONFIG.vecindario.distMaxAl)  Sol -> estrella -> estrella
     galaxia     (el resto de la Vía Láctea)      Sol -> M13 -> M92
     grupoLocal  (≥ 200.000 al, extragaláctico)   Vía Láctea -> M31 -> M51

   Los tramos NO son excluyentes: una estrella del vecindario también tiene su
   marcador en la vista de la galaxia, y ahí se dibuja igual. Lo que cambia es
   la capa que la pinta.

   Sin DOM y sin estado: lee VIAJES, OBSERVACIONES, OBJECTS, OBSERVADORES y
   CONFIG como globales EN TIEMPO DE LLAMADA, igual que via-lactea-observadores.js.
   Se carga ANTES de via-lactea-app.js, grupo-local.js y vecindario-solar.js.
   Expone window.VLViaje (+ module.exports para scripts/test_viaje_mapa.js).
   ============================================================================ */

(function () {
  'use strict';

  // Frontera extragaláctica: la misma que usa el atlas del Grupo Local para
  // decidir qué galaxias entran en su catálogo (grupo-local.js).
  var DIST_MIN_EXTRAGALACTICA = 200000;

  // Radio del vecindario solar por defecto, si CONFIG no está cargado.
  var DIST_VECINDARIO_POR_DEFECTO = 500;

  function tabla(nombre) {
    return (typeof window !== 'undefined' && window[nombre])
      ? window[nombre]
      : (typeof global !== 'undefined' && global[nombre]) ? global[nombre] : null;
  }

  function radioVecindario() {
    var c = tabla('CONFIG');
    return (c && c.vecindario && typeof c.vecindario.distMaxAl === 'number')
      ? c.vecindario.distMaxAl : DIST_VECINDARIO_POR_DEFECTO;
  }

  // Índice slug -> objeto del mapa, reconstruido en cada llamada (OBJECTS se
  // sirve una vez por carga; rehacerlo cuesta menos que invalidar una caché).
  function porId() {
    var objs = tabla('OBJECTS') || [];
    var idx = {};
    for (var i = 0; i < objs.length; i++) idx[objs[i].id] = objs[i];
    return idx;
  }

  function viajeDe(id) {
    var v = tabla('VIAJES');
    return (v && v[String(id)]) ? v[String(id)] : null;
  }

  // Cuántos objetos del viaje puede DIBUJAR el mapa. No es lo mismo que los que
  // se visitaron: uno registrado sin marcador no se cuenta, o el combo
  // prometería un objeto que la ruta no enseña.
  function numObjetos(id) {
    var v = viajeDe(id);
    if (!v || !v.objetos) return 0;
    var idx = porId(), n = 0;
    for (var i = 0; i < v.objetos.length; i++) if (idx[v.objetos[i]]) n++;
    return n;
  }

  // Rótulo de un viaje: la noche delante, para que la lista se lea cronológica.
  //   '2026-08-05 · Perseidas desde la sierra · 7 objetos'
  function etiquetaViaje(id) {
    var v = viajeDe(id);
    if (!v) return '';
    var n = numObjetos(id);
    return v.noche
      + (v.nombre ? ' · ' + v.nombre : '')
      + (n ? ' · ' + n + (n === 1 ? ' objeto' : ' objetos') : '');
  }

  // De quién es el viaje. Lo necesita el enlace ?viaje=<id>: para enseñar una
  // ruta hay que seleccionar antes a su dueño.
  function observadorDe(id) {
    var v = viajeDe(id);
    return (v && v.observador) ? v.observador : '';
  }

  // Nombre corto del viaje para acompañar al observador en "← Descubrir":
  // el que le puso el observador o, en su defecto, 'Viaje del <noche>'.
  function nombreViaje(id) {
    var v = viajeDe(id);
    if (!v) return '';
    return v.nombre ? v.nombre : ('Viaje del ' + v.noche);
  }

  // Los viajes de un observador, del más reciente al más antiguo. Sin clave no
  // hay viajes que ofrecer: un viaje es de alguien, no del catálogo.
  function viajesDe(clave) {
    var todos = tabla('VIAJES');
    if (!clave || !todos) return [];
    var out = [];
    for (var id in todos) {
      if (!Object.prototype.hasOwnProperty.call(todos, id)) continue;
      if (todos[id].observador !== clave) continue;
      out.push({
        id: id,
        nombre: todos[id].nombre,
        noche: todos[id].noche,
        etiqueta: etiquetaViaje(id),
        numObjetos: numObjetos(id)
      });
    }
    out.sort(function (a, b) {
      if (a.noche !== b.noche) return a.noche < b.noche ? 1 : -1;
      return Number(b.id) - Number(a.id);
    });
    return out;
  }

  // ¿Pertenece este objeto al viaje? Es el filtro del mapa: lo que no está en
  // la ruta no se pinta.
  function enViaje(id, objetoId) {
    var v = viajeDe(id);
    if (!v || !v.objetos) return false;
    return v.objetos.indexOf(objetoId) >= 0;
  }

  /**
   * La ruta del viaje, en orden y repartida por capa. Los objetos que el viaje
   * visitó pero que NO tienen marcador en el mapa (registrados sin posición) se
   * descartan en silencio: no hay dónde dibujarlos.
   *
   * Devuelve { vecindario: [obj], galaxia: [obj], grupoLocal: [obj] }, con los
   * objetos tal cual vienen de OBJECTS.
   */
  function rutaDe(id) {
    var v = viajeDe(id);
    var ruta = { vecindario: [], galaxia: [], grupoLocal: [] };
    if (!v || !v.objetos) return ruta;

    var idx = porId();
    var rVec = radioVecindario();
    for (var i = 0; i < v.objetos.length; i++) {
      var o = idx[v.objetos[i]];
      if (!o) continue;                        // visitado pero sin marcador
      var d = (typeof o.dist === 'number') ? o.dist : null;
      if (d !== null && d >= DIST_MIN_EXTRAGALACTICA) {
        ruta.grupoLocal.push(o);
        continue;                              // fuera de la galaxia: solo el atlas
      }
      ruta.galaxia.push(o);
      if (d !== null && d > 0 && d <= rVec) ruta.vecindario.push(o);
    }
    return ruta;
  }

  // La capa en la que empieza el viaje, que es donde aterriza el mapa al
  // seleccionarlo: la del PRIMER objeto de la ruta.
  function capaInicial(id) {
    var v = viajeDe(id);
    if (!v || !v.objetos || !v.objetos.length) return null;
    var idx = porId(), rVec = radioVecindario();
    for (var i = 0; i < v.objetos.length; i++) {
      var o = idx[v.objetos[i]];
      if (!o) continue;
      var d = (typeof o.dist === 'number') ? o.dist : null;
      if (d !== null && d >= DIST_MIN_EXTRAGALACTICA) return { capa: 'grupoLocal', objeto: o };
      if (d !== null && d > 0 && d <= rVec) return { capa: 'vecindario', objeto: o };
      return { capa: 'galaxia', objeto: o };
    }
    return null;
  }

  /**
   * Las demás observaciones de un objeto, para la pantalla "← Descubrir".
   * Se identifican por ÍNDICE dentro de OBSERVACIONES[objetoId] y no por clave
   * de observador, porque un mismo observador puede haber visitado el objeto
   * en dos salidas distintas y las dos tienen que poder abrirse.
   *
   * 'excluir' es el índice de la que se está viendo (o null desde el mapa).
   */
  function otrasObservaciones(objetoId, excluir) {
    var obs = tabla('OBSERVACIONES');
    var lista = (obs && obs[objetoId]) ? obs[objetoId] : null;
    var out = [];
    if (!lista) return out;
    var observadores = tabla('OBSERVADORES') || {};
    for (var i = 0; i < lista.length; i++) {
      if (excluir != null && i === excluir) continue;
      var clave = lista[i].observador;
      var nombre = (observadores[clave] && observadores[clave].nombre) ? observadores[clave].nombre : (clave || '');
      out.push({
        indice: i,
        clave: clave,
        observadorNombre: nombre,
        viajeNombre: lista[i].viaje ? nombreViaje(lista[i].viaje) : '',
        etiqueta: nombre + (lista[i].viaje ? ' · ' + nombreViaje(lista[i].viaje) : '')
      });
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // TRAZO DORADO (el "hiperespacio")
  // Dos capas sobre los mismos puntos: una línea tenue continua que dice por
  // dónde pasó la nave, y encima un punteado brillante desplazándose hacia el
  // destino, que es lo que da la sensación de movimiento. El desplazamiento lo
  // marca 'fase' (en píxeles); con movimiento reducido, fase() devuelve 0 y la
  // ruta se queda quieta sin perder ninguna información.
  // ---------------------------------------------------------------------------
  var ORO = '244, 199, 107';          // #f4c76b, el ámbar del mapa
  var PATRON = [14, 10];              // guion, hueco (px de pantalla)
  var PX_POR_SEGUNDO = 26;

  function movimientoReducido() {
    return !!(typeof window !== 'undefined' && window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // Fase del punteado en píxeles. Negativa para que los guiones avancen del
  // origen al destino (stroke-dashoffset corre al revés).
  function fase(ahoraMs) {
    if (movimientoReducido()) return 0;
    var t = (typeof ahoraMs === 'number') ? ahoraMs : Date.now();
    var ciclo = PATRON[0] + PATRON[1];
    return -((t / 1000) * PX_POR_SEGUNDO) % ciclo;
  }

  /**
   * Dibuja la ruta sobre un canvas 2D ya escalado a píxeles de pantalla.
   * 'puntos' es [{sx, sy}, ...] en el orden del recorrido (el primero es el
   * origen de la capa: el Sol o la Vía Láctea). Menos de dos puntos no es una
   * ruta y no se dibuja nada.
   *
   * Lo comparten el atlas del Grupo Local y el Vecindario Solar; la vista de la
   * galaxia usa SVG, que es otro idioma pero el mismo aspecto.
   */
  function trazarCanvas(ctx, puntos, faseActual, alpha) {
    if (!ctx || !puntos || puntos.length < 2) return;
    var a = (typeof alpha === 'number') ? alpha : 1;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    function camino() {
      ctx.beginPath();
      ctx.moveTo(puntos[0].sx, puntos[0].sy);
      for (var i = 1; i < puntos.length; i++) ctx.lineTo(puntos[i].sx, puntos[i].sy);
    }

    // 1. Estela: ancha, muy tenue. Es el "agujero de gusano".
    camino();
    ctx.setLineDash([]);
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(' + ORO + ',' + (0.10 * a) + ')';
    ctx.stroke();

    // 2. Línea base continua: por dónde se pasó.
    camino();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(' + ORO + ',' + (0.38 * a) + ')';
    ctx.stroke();

    // 3. Punteado en movimiento: hacia dónde se iba.
    camino();
    ctx.setLineDash(PATRON);
    ctx.lineDashOffset = faseActual || 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(' + ORO + ',' + (0.9 * a) + ')';
    ctx.shadowColor = 'rgba(' + ORO + ',0.85)';
    ctx.shadowBlur = 8;
    ctx.stroke();

    ctx.restore();
  }

  var API = {
    DIST_MIN_EXTRAGALACTICA: DIST_MIN_EXTRAGALACTICA,
    ORO: ORO,
    PATRON: PATRON,
    viajesDe: viajesDe,
    viajeDe: viajeDe,
    etiquetaViaje: etiquetaViaje,
    numObjetos: numObjetos,
    nombreViaje: nombreViaje,
    observadorDe: observadorDe,
    enViaje: enViaje,
    rutaDe: rutaDe,
    capaInicial: capaInicial,
    otrasObservaciones: otrasObservaciones,
    movimientoReducido: movimientoReducido,
    fase: fase,
    trazarCanvas: trazarCanvas
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
  if (typeof window !== 'undefined') { window.VLViaje = API; }
})();
