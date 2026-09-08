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
  // El tramo encendido es una línea FIJA y brillante: lo único que se mueve por
  // ella es la nave. Con movimiento reducido, tramoEncendido() devuelve null: la
  // ruta se dibuja entera y quieta, sin nave y sin perder ningún tramo.
  // ---------------------------------------------------------------------------
  var ORO = '244, 199, 107';          // #f4c76b, el ámbar del mapa

  // La nave, apuntando al destino (+x) y centrada en su posición: la punta
  // delante, la muesca de la popa y las dos alas barridas hacia atrás, DESIGUALES
  // —una larga y otra corta—, que es lo que hace reconocible al delta de la
  // solapa. Es la misma figura en el lienzo y en el SVG, así que vive aquí y no
  // en cada uno.
  var NAVE = [[8.5, 0], [-7, -7], [-2, 0], [-3.5, 4.5]];

  // El tramo encendido se ilumina DESDE la nave: brillante bajo ella y apagándose
  // hacia los dos extremos. Menos que la nave, para que ella siga siendo lo que
  // se mira, y con la caída lo bastante larga como para que no se lea como un
  // foco. La caída va en partes del tramo, no en píxeles: en un tramo corto y en
  // uno largo se ve igual de suave.
  var BRILLO_NAVE = 0.7;              // bajo la nave
  var BRILLO_LEJOS = 0.16;            // en las puntas del tramo
  var CAIDA = 0.35;                   // en qué parte del tramo se apaga

  // La consulta se guarda una vez: esto se pregunta en cada fotograma y de los
  // tres bucles (galaxia, atlas y vecindario), y matchMedia() no es gratis.
  var consultaMovimiento = (typeof window !== 'undefined' && window.matchMedia)
    ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function movimientoReducido() {
    return !!(consultaMovimiento && consultaMovimiento.matches);
  }

  // La nave va a velocidad constante: cada tramo dura EN PROPORCIÓN a lo que
  // mide, no lo mismo que los demás —con duración fija, el salto largo se
  // recorría más deprisa que el corto y la nave parecía acelerar según lo lejos
  // que estuviera el objeto—. Pero la proporción se mide sobre el total de la
  // ruta, no en píxeles sueltos: el zoom alarga todos los tramos por igual, así
  // que los repartos no se mueven y la travesía no da un salto al acercarse.
  // Los topes evitan las dos puntas: el tramo cortísimo que sería un parpadeo y
  // el saltazo que duraría media vuelta del reloj.
  var MS_TRAMO_MEDIO = 3000;
  var MS_MIN_TRAMO = 1200;
  var MS_MAX_TRAMO = 6000;
  var MS_PAUSA = 1000;

  // Origen del reloj del recorrido. Es el ÚNICO estado del módulo, y a propósito:
  // la vista de la galaxia (SVG) y los dos lienzos (Grupo Local, vecindario)
  // tienen que ir por el mismo tramo en el mismo instante, y con un contador por
  // vista acabarían divergiendo. Lo mueve reiniciar() al cambiar de escala.
  var origenReloj = 0;

  function ahora(ms) { return (typeof ms === 'number') ? ms : Date.now(); }

  // Devuelve la luz al origen: al elegir un viaje y al cambiar de escala.
  function reiniciar(ahoraMs) { origenReloj = ahora(ahoraMs); }

  /**
   * Lo que tarda la nave en cada tramo de la ruta, en milisegundos: lo que ese
   * tramo es del recorrido entero, repartido sobre una duración media por tramo
   * y entre los dos topes. Va en PROPORCIÓN y no en píxeles justamente para que
   * el zoom no la cambie.
   */
  function duracionesDe(puntos) {
    var largos = [], total = 0, i;
    for (i = 0; i + 1 < puntos.length; i++) {
      var dx = puntos[i + 1].sx - puntos[i].sx;
      var dy = puntos[i + 1].sy - puntos[i].sy;
      var d = Math.sqrt(dx * dx + dy * dy);
      largos.push(d);
      total += d;
    }
    var ms = [];
    for (i = 0; i < largos.length; i++) {
      // La parte del recorrido que es este tramo, que no cambia con el zoom.
      var parte = total > 0 ? largos[i] / total : 1 / largos.length;
      var t = MS_TRAMO_MEDIO * largos.length * parte;
      ms.push(Math.min(MS_MAX_TRAMO, Math.max(MS_MIN_TRAMO, t)));
    }
    return ms;
  }

  /**
   * Qué tramo está encendido y por dónde va la luz dentro de él, para una ruta
   * de vértices {sx, sy} (el primero es el origen de la capa): { tramo, u }, con
   * u de 0 a 1.
   *
   * null = no hay recorrido que animar: o no hay ni un tramo, o el visitante
   * pidió movimiento reducido y la ruta va entera y quieta.
   */
  function tramoEncendido(ahoraMs, puntos) {
    if (!puntos || puntos.length < 2 || movimientoReducido()) return null;
    var ms = duracionesDe(puntos);
    var recorrido = 0;
    for (var i = 0; i < ms.length; i++) recorrido += ms[i];
    var t = (ahora(ahoraMs) - origenReloj) % (recorrido + MS_PAUSA);
    if (t < 0) t += recorrido + MS_PAUSA;        // reloj movido hacia adelante
    if (t >= recorrido) return { tramo: ms.length - 1, u: 1 };  // pausa del final
    for (var j = 0; j < ms.length; j++) {
      if (t < ms[j]) return { tramo: j, u: t / ms[j] };
      t -= ms[j];
    }
    return { tramo: ms.length - 1, u: 1 };       // por redondeo, nunca por lógica
  }

  /**
   * Reparte los vértices de la ruta según el tramo encendido:
   *   pasado  — de donde se salió hasta el tramo activo (dorado apagado)
   *   activo  — los dos vértices del tramo que se recorre ahora
   *   futuro  — lo que queda por recorrer (casi invisible)
   *   cabeza  — dónde va la nave dentro del tramo activo, y con qué rumbo
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
      cabeza: {
        sx: a.sx + (b.sx - a.sx) * estado.u,
        sy: a.sy + (b.sy - a.sy) * estado.u,
        // Rumbo: hacia dónde apunta la nave. Un tramo de longitud cero no tiene
        // rumbo, y entonces se deja mirando al frente en vez de dar un giro.
        angulo: (b.sx === a.sx && b.sy === a.sy) ? 0 : Math.atan2(b.sy - a.sy, b.sx - a.sx)
      }
    };
  }

  /**
   * Pone en un degradado ya creado (canvas) las paradas del brillo del tramo:
   * la nave en 'u' y la caída hacia los dos extremos. Devuelve el degradado.
   * Las paradas se piden en orden, así que se recortan al tramo.
   */
  function paradasDeBrillo(u) {
    var v = Math.min(1, Math.max(0, u));
    var paradas = [];
    if (v > 0) paradas.push([0, BRILLO_LEJOS]);
    if (v - CAIDA > 0) paradas.push([v - CAIDA, BRILLO_LEJOS]);
    paradas.push([v, BRILLO_NAVE]);
    if (v + CAIDA < 1) paradas.push([v + CAIDA, BRILLO_LEJOS]);
    if (v < 1) paradas.push([1, BRILLO_LEJOS]);
    return paradas;
  }

  function degradadoDelTramo(grad, u, alpha) {
    var paradas = paradasDeBrillo(u);
    for (var i = 0; i < paradas.length; i++) {
      grad.addColorStop(paradas[i][0], 'rgba(' + ORO + ',' + (paradas[i][1] * alpha) + ')');
    }
    return grad;
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
  function trazarCanvas(ctx, puntos, alpha, estado) {
    if (!ctx || !puntos || puntos.length < 2) return;
    var a = (typeof alpha === 'number') ? alpha : 1;
    var e = (estado === undefined) ? tramoEncendido(null, puntos) : estado;
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

    // Sin tramo encendido (movimiento reducido) la ruta va entera y quieta, con
    // el brillo que tenía antes de que hubiera tramos: quitar el movimiento no
    // es apagar la ruta.
    var lucido = partes ? partes.activo : puntos;
    if (partes) {
      trazo(partes.futuro, 0.8, 0.04);  // lo que falta: se intuye, no compite
      trazo(partes.pasado, 0.8, 0.14);  // por dónde ya se pasó
    }

    // Estela: ancha y tenue, solo bajo el tramo encendido. Es el "agujero de
    // gusano", y ponerla en toda la ruta igualaba el brillo de lo apagado con
    // el de lo encendido, que es justo lo que hay que separar.
    trazo(lucido, 4, 0.10);

    // El tramo encendido: línea FIJA y gruesa. Lo único que se mueve por ella es
    // la nave, y con el punteado corriendo por debajo se veían dos movimientos a
    // la vez donde solo hay un viaje.
    ctx.shadowColor = 'rgba(' + ORO + ',0.85)';
    ctx.shadowBlur = 8;
    if (!partes) {                    // sin recorrido no hay nave ni degradado
      trazo(lucido, 1.6, BRILLO_NAVE);
      ctx.restore();
      return;
    }
    camino(partes.activo);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = degradadoDelTramo(
      ctx.createLinearGradient(partes.activo[0].sx, partes.activo[0].sy,
                               partes.activo[1].sx, partes.activo[1].sy),
      e.u, a);
    ctx.stroke();

    // Y la nave, en su sitio del tramo y apuntando al destino.
    ctx.translate(partes.cabeza.sx, partes.cabeza.sy);
    ctx.rotate(partes.cabeza.angulo);
    ctx.beginPath();
    ctx.moveTo(NAVE[0][0], NAVE[0][1]);
    for (var k = 1; k < NAVE.length; k++) ctx.lineTo(NAVE[k][0], NAVE[k][1]);
    ctx.closePath();
    ctx.fillStyle = 'rgba(' + ORO + ',' + (0.98 * a) + ')';
    ctx.fill();

    ctx.restore();
  }

  var API = {
    DIST_MIN_EXTRAGALACTICA: DIST_MIN_EXTRAGALACTICA,
    ORO: ORO,
    NAVE: NAVE,
    BRILLO_NAVE: BRILLO_NAVE,
    BRILLO_LEJOS: BRILLO_LEJOS,
    CAIDA: CAIDA,
    paradasDeBrillo: paradasDeBrillo,
    MS_TRAMO_MEDIO: MS_TRAMO_MEDIO,
    MS_MIN_TRAMO: MS_MIN_TRAMO,
    MS_MAX_TRAMO: MS_MAX_TRAMO,
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
    reiniciar: reiniciar,
    tramoEncendido: tramoEncendido,
    tramosDe: tramosDe,
    trazarCanvas: trazarCanvas
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
  if (typeof window !== 'undefined') { window.VLViaje = API; }
})();
