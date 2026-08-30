/* Los parches de PS1 que hay en la caché del proxy, identificados.

   El proxy los guarda con la clave md5(ra|dec|lado|salida|banda), así que el
   nombre del fichero no dice de quién es. Se identifican al revés y con código
   de producción: para cada galaxia del catálogo se proyecta su (α, δ) sobre la
   WCS del parche con `ps1CieloAPixel`, y se queda la que cae más cerca del
   centro. Si ninguna cae dentro, el parche no es de ninguna galaxia conocida.

   Uso:  var P = require('./lib_parches_ps1.js')(R);   // R = el módulo
         P.parches   → [{ nombre, gal, fits, dCentroPx }, …]
         P.buscar('NGC 5194') */
'use strict';

var fs = require('fs'), path = require('path');
var DIR = path.join(__dirname, '..', 'simulador_ocular', 'cache-ps1');

module.exports = function (R) {
  require('../simulador_ocular/resources/js/galaxias-datos.js');
  var CAT = global.window.BITACORA_GALAXIAS;

  var parches = [];
  (fs.existsSync(DIR) ? fs.readdirSync(DIR) : []).forEach(function (nombre) {
    if (!/\.fits$/.test(nombre)) return;
    var buf = fs.readFileSync(path.join(DIR, nombre));
    var ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    var f = window.BitacoraPS1.parseFITS(ab);
    if (!f || !f.wcs) return;
    var cx = (f.ancho - 1) / 2, cy = (f.alto - 1) / 2, mejor = null, dMejor = Infinity;
    for (var i = 0; i < CAT.length; i++) {
      var p = window.BitacoraPS1.ps1CieloAPixel(f.wcs, CAT[i][2], CAT[i][3]);   // devuelve [x, y]
      if (!p) continue;
      var d = Math.hypot(p[0] - cx, p[1] - cy);
      if (d < dMejor) { dMejor = d; mejor = CAT[i]; }
    }
    // Tolerancia generosa (1/8 del parche): el recorte se pide centrado, así que
    // la de verdad cae a pocos píxeles y cualquier otra queda lejísimos.
    if (!mejor || dMejor > f.ancho / 8) return;
    parches.push({ fichero: nombre, nombre: mejor[0], gal: mejor, fits: f,
                   dCentroPx: dMejor, ladoArcmin: f.ancho * f.escalaAs / 60 });
  });
  parches.sort(function (a, b) { return a.nombre < b.nombre ? -1 : 1; });

  function buscar(nombre) {
    // El mayor de los suyos: el mismo objeto puede estar cacheado a varios lados.
    var los = parches.filter(function (p) { return p.nombre === nombre; });
    los.sort(function (a, b) { return b.ladoArcmin - a.ladoArcmin; });
    return los[0] || null;
  }
  return { parches: parches, buscar: buscar, dir: DIR };
};
