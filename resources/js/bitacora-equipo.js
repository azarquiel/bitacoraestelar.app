/* ============================================================================
   bitacora-equipo.js — HELPERS puros del equipo del observador
   Proyecto: Bitácora Estelar

   Funciones puras compartidas por el simulador de oculares y por Mi flota, sin
   DOM ni WordPress. Misma forma que bitacora-gaia-color.js: global de navegador
   (window.BitacoraEquipo) + module.exports para el test de node
   (scripts/test_equipo.js).

   Interfaz:
     focalEfectiva(focalMm, factor, extensionMm) -> mm
       Focal del telescopio tras aplicar una óptica auxiliar: el factor MULTIPLICA
       (Barlow > 1 alarga, reductor < 1 acorta, vacío = 1 = neutro) y la extensión
       SUMA milímetros fijos (tuning rings raros). Sin auxiliar -> focal sin cambio.

     focalConAuxiliares(focalMm, auxiliares) -> mm
       Lo mismo con VARIAS ópticas auxiliares encadenadas (es corriente montar un
       Paracorr y detrás una Barlow). Se aplican EN ORDEN de la lista: la primera
       es la que va montada más cerca del telescopio. El orden solo cambia el
       resultado cuando alguna trae extensión fija, pero se fija aquí —en un único
       sitio— para que los tres puntos de cálculo no puedan divergir.

     nombreTelescopio(item) -> string
       Rótulo a mostrar de un telescopio: su nombre propio (si el observador se lo
       puso en Mi flota) o, en su defecto, "vendor modelo".

     rotuloNave(item) -> string
       Cómo se presenta el telescopio en la bitácora: sus medidas SIEMPRE
       ('18" f/4.5') y delante su nombre propio si lo tiene ('Excalibur · 18"
       f/4.5'). Sin medidas, el nombre o nombreTelescopio().

     flotaPrimero(flota, catalogo) -> [items]
       Lista para elegir equipo: primero las piezas de "Mi flota" (marcadas con
       esFlota:true), luego las del catálogo global. Sin mutar la entrada.
   ============================================================================ */

(function () {
  'use strict';

  // Convierte a número finito o null (acepta coma decimal, como el resto de datos
  // del proyecto que vienen de CSV europeos).
  function num(v) {
    if (v == null || v === '') return null;
    var n = (typeof v === 'string') ? parseFloat(v.replace(',', '.')) : Number(v);
    return isFinite(n) ? n : null;
  }

  function focalEfectiva(focalMm, factor, extensionMm) {
    var f = num(focalMm);
    if (f == null) return null;
    var fac = num(factor);
    var ext = num(extensionMm);
    return f * (fac != null ? fac : 1) + (ext != null ? ext : 0);
  }

  /* Encadena varias auxiliares sobre la focal del tubo. Los huecos vacíos (null)
     se saltan, así que "solo la primera puesta" y "solo la segunda" dan lo mismo
     y no hay que ordenarlos en el formulario. */
  function focalConAuxiliares(focalMm, auxiliares) {
    var f = num(focalMm);
    if (f == null) return null;
    (auxiliares || []).forEach(function (a) {
      if (a) f = focalEfectiva(f, a.factor, a.extension_mm);
    });
    return f;
  }

  function nombreTelescopio(item) {
    if (!item) return '';
    var nombre = (item.nombre == null ? '' : String(item.nombre)).trim();
    if (nombre) return nombre;
    var vendor = (item.vendor == null ? '' : String(item.vendor)).trim();
    var modelo = (item.modelo == null ? '' : String(item.modelo)).trim();
    return (vendor + ' ' + modelo).trim();
  }

  /* Rótulo de la NAVE del viaje: cómo se presenta el telescopio con el que se
     observó. Las MEDIDAS van siempre —18" f/4.5, apertura en pulgadas y relación
     focal, que es como se reconoce un telescopio en el campo— y delante su nombre
     propio SOLO si el observador se lo puso ('Excalibur · 18" f/4.5'). Sin
     medidas queda el nombre, o el rótulo de siempre (vendor modelo). La razón
     focal sale de f_ratio si viene calculada y, si no, de focal/apertura. */
  function rotuloNave(item) {
    if (!item) return '';
    var nombre = (item.nombre == null ? '' : String(item.nombre)).trim();
    var d = num(item.apertura_mm);
    var razon = num(item.f_ratio);
    var focal = num(item.focal_mm);
    if (razon == null && focal != null && d) razon = focal / d;
    var medidas = (d && razon) ? decimal(d / 25.4) + '" f/' + decimal(razon) : '';
    if (!medidas) return nombre || nombreTelescopio(item);
    return nombre ? nombre + ' · ' + medidas : medidas;
  }

  // Un decimal, y sin el ",0" cuando es redondo: 457mm -> 18", no 18,0".
  function decimal(n) {
    return String(Math.round(n * 10) / 10);
  }

  /* Lista de telescopios a ofrecer al observador: SU flota delante, el catálogo
     global detrás. Las piezas propias se copian marcadas con `esFlota:true` (la
     entrada no se toca: es la respuesta de la API, que otros ya están leyendo).
     No hace falta descartar repetidos: flota y catálogo salen de la misma tabla
     —solo cambia el usuario_id—, así que el id no puede estar en las dos. */
  function flotaPrimero(flota, catalogo) {
    return (flota || [])
      .map(function (p) { return Object.assign({}, p, { esFlota: true }); })
      .concat(catalogo || []);
  }

  var API = {
    focalEfectiva: focalEfectiva,
    focalConAuxiliares: focalConAuxiliares,
    nombreTelescopio: nombreTelescopio,
    rotuloNave: rotuloNave,
    flotaPrimero: flotaPrimero
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
  if (typeof window !== 'undefined') { window.BitacoraEquipo = API; }
})();
