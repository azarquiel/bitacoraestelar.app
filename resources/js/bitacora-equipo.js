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

     nombreTelescopio(item) -> string
       Rótulo a mostrar de un telescopio: su nombre propio (si el observador se lo
       puso en Mi flota) o, en su defecto, "vendor modelo".

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

  function nombreTelescopio(item) {
    if (!item) return '';
    var nombre = (item.nombre == null ? '' : String(item.nombre)).trim();
    if (nombre) return nombre;
    var vendor = (item.vendor == null ? '' : String(item.vendor)).trim();
    var modelo = (item.modelo == null ? '' : String(item.modelo)).trim();
    return (vendor + ' ' + modelo).trim();
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
    nombreTelescopio: nombreTelescopio,
    flotaPrimero: flotaPrimero
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
  if (typeof window !== 'undefined') { window.BitacoraEquipo = API; }
})();
