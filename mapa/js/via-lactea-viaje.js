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

   El tramo del vecindario es un SUBCONJUNTO del de la galaxia (así escalasDe
   sabe si además hay travesía galáctica), pero las VISTAS sí son excluyentes:
   la galaxia no dibuja los marcadores de las estrellas que ya enseña el
   vecindario (VLVecindarioCatalogo.enVecindario), igual que el atlas del Grupo
   Local solo se queda con lo extragaláctico. Cada escala enseña la suya.

   Sin DOM: lee VIAJES, OBSERVACIONES, OBJECTS, OBSERVADORES y
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

  // Las escalas por las que pasa el viaje, en orden de acercamiento. Cada objeto
  // cuenta UNA vez: una estrella cercana viaja en la ruta de la galaxia y en la
  // del vecindario (ruta.vecindario es un subconjunto de ruta.galaxia), pero es
  // una sola escala, y el mapa no debe avisar de un cruce que no existe.
  function escalasDe(id) {
    var ruta = rutaDe(id);
    var out = [];
    if (ruta.vecindario.length) out.push('vecindario');
    if (ruta.galaxia.length > ruta.vecindario.length) out.push('galaxia');
    if (ruta.grupoLocal.length) out.push('grupoLocal');
    return out;
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
   *
   * Cada una sale con su FECHA (la de la observación o, si no la trae, la noche
   * de su viaje) y con la NAVE con que se miró (el telescopio de la flota, o el
   * 'instrumento' escrito a mano; quien las rotula es BitacoraEquipo, en la
   * pantalla): en la lista importa cuándo y con qué se exploró, no cómo se
   * llamaba la salida. Van de la más reciente a la más antigua, y las que no
   * tienen fecha al final, en el orden en que estaban.
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
      var v = lista[i].viaje ? viajeDe(lista[i].viaje) : null;
      out.push({
        indice: i,
        clave: clave,
        observadorNombre: nombre,
        fecha: lista[i].fecha || (v && v.noche ? v.noche : ''),
        nave: lista[i].nave || null,
        instrumento: lista[i].instrumento || '',
        // Si lleva tramo de audio (ADR 0005), la lista lo señala con el 🎧.
        audio: !!(lista[i].audio && lista[i].audio.url),
        etiqueta: nombre
      });
    }
    // Las fechas son ISO (YYYY-MM-DD), así que ordenan como texto.
    out.sort(function (a, b) {
      if (!a.fecha || !b.fecha) return (a.fecha ? 0 : 1) - (b.fecha ? 0 : 1);
      if (a.fecha === b.fecha) return 0;
      return a.fecha < b.fecha ? 1 : -1;
    });
    return out;
  }

  /**
   * ¿Hay que ELEGIR observación antes de abrir la ficha? Con más de una, abrir
   * cualquiera de ellas sería elegir por el usuario: primero se enseña la lista
   * de todas y él decide cuál mirar.
   */
  function hayQueElegir(objetoId) {
    var obs = tabla('OBSERVACIONES');
    var lista = (obs && obs[objetoId]) ? obs[objetoId] : null;
    return !!(lista && lista.length > 1);
  }

  // ---------------------------------------------------------------------------
  // TRAZO DORADO (el "hiperespacio")
  // La ruta entera se ve siempre —es la forma del viaje—, pero solo UN tramo
  // está encendido: el que la luz está recorriendo ahora. Los ya recorridos
  // quedan en un dorado apagado y los que faltan, casi invisibles; así una
  // salida de veinte objetos se lee como una secuencia y no como una maraña.
  //
  // Dentro del tramo activo, el punteado se desplaza hacia el destino ('fase',
  // en píxeles) y una luz lo recorre. Con movimiento reducido, fase() devuelve
  // 0 y tramoEncendido() devuelve null: la ruta se dibuja entera y quieta, sin
  // perder ningún tramo.
  // ---------------------------------------------------------------------------
  var ORO = '244, 199, 107';          // #f4c76b, el ámbar del mapa
  var PATRON = [8, 24];               // guion, hueco (px de pantalla)
  var R_LUZ = 2.6;                    // radio de la luz que recorre el tramo (px)
  var PX_POR_SEGUNDO = 26;

  // La consulta se guarda una vez: esto se pregunta en cada fotograma y de los
  // tres bucles (galaxia, atlas y vecindario), y matchMedia() no es gratis.
  var consultaMovimiento = (typeof window !== 'undefined' && window.matchMedia)
    ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function movimientoReducido() {
    return !!(consultaMovimiento && consultaMovimiento.matches);
  }

  // Fase del punteado en píxeles. Negativa para que los guiones avancen del
  // origen al destino (stroke-dashoffset corre al revés).
  function fase(ahoraMs) {
    if (movimientoReducido()) return 0;
    var t = (typeof ahoraMs === 'number') ? ahoraMs : Date.now();
    var ciclo = PATRON[0] + PATRON[1];
    return -((t / 1000) * PX_POR_SEGUNDO) % ciclo;
  }

  // Cuánto dura la travesía de UN tramo y cuánto se espera al final antes de
  // volver a salir del origen. Fija por tramo, no proporcional a su longitud en
  // pantalla: con las distancias de por medio, un tramo duraría tres fotogramas
  // y el siguiente medio minuto.
  var MS_POR_TRAMO = 1200;
  var MS_PAUSA = 800;

  // Origen del reloj del recorrido. Es el ÚNICO estado del módulo, y a propósito:
  // la vista de la galaxia (SVG) y los dos lienzos (Grupo Local, vecindario)
  // tienen que ir por el mismo tramo en el mismo instante, y con un contador por
  // vista acabarían divergiendo. Lo mueve reiniciar() al cambiar de escala.
  var origenReloj = 0;

  function ahora(ms) { return (typeof ms === 'number') ? ms : Date.now(); }

  // Devuelve la luz al origen: al elegir un viaje y al cambiar de escala.
  function reiniciar(ahoraMs) { origenReloj = ahora(ahoraMs); }

  /**
   * Qué tramo está encendido y por dónde va la luz dentro de él, para una ruta
   * de 'nPuntos' vértices (origen incluido): { tramo, u }, con u de 0 a 1.
   *
   * null = no hay recorrido que animar: o no hay ni un tramo, o el visitante
   * pidió movimiento reducido y la ruta va entera y quieta.
   */
  function tramoEncendido(ahoraMs, nPuntos) {
    var nTramos = (nPuntos | 0) - 1;
    if (nTramos < 1 || movimientoReducido()) return null;
    var ciclo = nTramos * MS_POR_TRAMO + MS_PAUSA;
    var recorrido = nTramos * MS_POR_TRAMO;
    var t = (ahora(ahoraMs) - origenReloj) % ciclo;
    if (t < 0) t += ciclo;                       // reloj movido hacia adelante
    if (t >= recorrido) return { tramo: nTramos - 1, u: 1 };  // pausa del final
    var tramo = Math.floor(t / MS_POR_TRAMO);
    return { tramo: tramo, u: (t - tramo * MS_POR_TRAMO) / MS_POR_TRAMO };
  }

  /**
   * Reparte los vértices de la ruta según el tramo encendido:
   *   pasado  — de donde se salió hasta el tramo activo (dorado apagado)
   *   activo  — los dos vértices del tramo que se recorre ahora
   *   futuro  — lo que queda por recorrer (casi invisible)
   *   cabeza  — dónde va la luz dentro del tramo activo
   * Los vértices son {sx, sy}; lo usan el canvas y el SVG de la galaxia.
   */
  function tramosDe(puntos, estado) {
    if (!estado || !puntos || puntos.length < 2) return null;
    var i = Math.min(Math.max(estado.tramo, 0), puntos.length - 2);
    var a = puntos[i], b = puntos[i + 1];
    return {
      pasado: puntos.slice(0, i + 1),
      activo: [a, b],
      futuro: puntos.slice(i + 1),
      cabeza: { sx: a.sx + (b.sx - a.sx) * estado.u, sy: a.sy + (b.sy - a.sy) * estado.u }
    };
  }

  /**
   * Dibuja la ruta sobre un canvas 2D ya escalado a píxeles de pantalla.
   * 'puntos' es [{sx, sy}, ...] en el orden del recorrido (el primero es el
   * origen de la capa: el Sol o la Vía Láctea). Menos de dos puntos no es una
   * ruta y no se dibuja nada.
   *
   * 'estado' es el de tramoEncendido(); si no se pasa, se pregunta por el instante
   * actual, que es lo que hacen los dos lienzos.
   *
   * Lo comparten el atlas del Grupo Local y el Vecindario Solar; la vista de la
   * galaxia usa SVG, que es otro idioma pero el mismo aspecto.
   */
  function trazarCanvas(ctx, puntos, faseActual, alpha, estado) {
    if (!ctx || !puntos || puntos.length < 2) return;
    var a = (typeof alpha === 'number') ? alpha : 1;
    var e = (estado === undefined) ? tramoEncendido(null, puntos.length) : estado;
    var partes = tramosDe(puntos, e);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    function camino(pts) {
      ctx.beginPath();
      ctx.moveTo(pts[0].sx, pts[0].sy);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].sx, pts[i].sy);
    }

    function trazo(pts, ancho, opacidad) {
      if (!pts || pts.length < 2) return;
      camino(pts);
      ctx.lineWidth = ancho;
      ctx.strokeStyle = 'rgba(' + ORO + ',' + (opacidad * a) + ')';
      ctx.stroke();
    }

    ctx.setLineDash([]);
    // Estela: ancha, muy tenue, sobre la ruta entera. Es el "agujero de gusano",
    // y lo que deja leer la forma del viaje aunque solo brille un tramo.
    trazo(puntos, 4, 0.10);

    // Sin tramo encendido (movimiento reducido) la ruta va entera y quieta, con
    // el brillo que tenía antes de que hubiera tramos: quitar el movimiento no
    // es apagar la ruta.
    var lucido = partes ? partes.activo : puntos;
    if (partes) {
      trazo(partes.futuro, 0.8, 0.06);  // lo que falta: se intuye, no compite
      trazo(partes.pasado, 0.8, 0.22);  // por dónde ya se pasó
    }
    trazo(lucido, 0.8, 0.38);           // el tramo encendido

    // Punteado, solo en el tramo encendido: hacia dónde va la luz. Quieto si
    // fase() lo dejó a 0.
    camino(lucido);
    ctx.setLineDash(PATRON);
    ctx.lineDashOffset = faseActual || 0;
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(' + ORO + ',' + (0.9 * a) + ')';
    ctx.shadowColor = 'rgba(' + ORO + ',0.85)';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.setLineDash([]);

    if (!partes) { ctx.restore(); return; }   // sin recorrido no hay luz que mover

    // Y la luz misma, recorriendo el tramo.
    ctx.beginPath();
    ctx.arc(partes.cabeza.sx, partes.cabeza.sy, R_LUZ, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(' + ORO + ',' + (0.95 * a) + ')';
    ctx.fill();

    ctx.restore();
  }

  var API = {
    DIST_MIN_EXTRAGALACTICA: DIST_MIN_EXTRAGALACTICA,
    ORO: ORO,
    PATRON: PATRON,
    R_LUZ: R_LUZ,
    MS_POR_TRAMO: MS_POR_TRAMO,
    MS_PAUSA: MS_PAUSA,
    viajesDe: viajesDe,
    viajeDe: viajeDe,
    etiquetaViaje: etiquetaViaje,
    numObjetos: numObjetos,
    nombreViaje: nombreViaje,
    observadorDe: observadorDe,
    enViaje: enViaje,
    rutaDe: rutaDe,
    escalasDe: escalasDe,
    capaInicial: capaInicial,
    otrasObservaciones: otrasObservaciones,
    hayQueElegir: hayQueElegir,
    movimientoReducido: movimientoReducido,
    fase: fase,
    reiniciar: reiniciar,
    tramoEncendido: tramoEncendido,
    tramosDe: tramosDe,
    trazarCanvas: trazarCanvas
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
  if (typeof window !== 'undefined') { window.VLViaje = API; }
})();
