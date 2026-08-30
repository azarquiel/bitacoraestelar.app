/* Las SIETE galaxias sintéticas de los experimentos de la ley de detección.

   Mismo perfil de brillo superficial —mismo n, mismo b/a, μ(r_e) fijo, μ(r/r_e)
   idéntico punto por punto— y distinto tamaño angular. Escalar r_e no cambia
   μ(r/r_e): eso es justo lo que se quiere, y cada experimento lo comprueba en
   vez de darlo por hecho.

   Vive aquí y no dentro de un experimento para que todos usen LOS MISMOS
   objetos: si cada script se construyera los suyos, comparar sus tablas sería
   comparar cosas distintas.

   Uso:  var G = require('./lib_galaxias_sinteticas.js')(R);  // R = el módulo */
'use strict';

var MU_E = 22.5, N_SERSIC = 3, BA = 1;
var TAMANOS = [0.5, 1, 2, 5, 10, 20, 30];   // DIÁMETRO de la isofota 25, en ′

module.exports = function (R) {
  function mu(comps, r) { return -2.5 * Math.log10(window.BitacoraPS1.ps1FlujoModelo(comps, 0, 0, r)); }
  function compsDe(re, magV) {
    return window.BitacoraPS1.ps1ComponentesSersic({ magV: magV, reArcsec: re, n: N_SERSIC, ba: BA, bt: 0 });
  }
  /* Sumar Δ a magV apaga el objeto Δ magnitudes, así que μ sube Δ: para llevar
     μ(r_e) de donde está a MU_E hace falta Δ = MU_E − μ actual. Un solo paso,
     exacto, porque el flujo escala como 10^(−0,4·magV). */
  function magVpara(re) { return 10 + (MU_E - mu(compsDe(re, 10), re)); }

  /* Radio (″) de la isofota μ, por bisección sobre el perfil (monótono). */
  function radioIsofota(comps, muObj) {
    var lo = 1e-4, hi = 1e6;
    if (mu(comps, lo) > muObj) return 0;
    for (var i = 0; i < 60; i++) {
      var m = Math.sqrt(lo * hi);
      if (mu(comps, m) <= muObj) lo = m; else hi = m;
    }
    return lo;
  }

  function objeto(d25Arcmin) {
    // r25/r_e es invariante para n y μ_e dados: se mide con un r_e patrón y se
    // reescala, en vez de buscar el r_e a ciegas.
    var rePatron = 100, cP = compsDe(rePatron, magVpara(rePatron));
    var razon = radioIsofota(cP, 25) / rePatron;
    var re = (d25Arcmin * 60 / 2) / razon;
    var magV = magVpara(re), comps = compsDe(re, magV);
    return { d25: d25Arcmin, re: re, magV: magV, comps: comps,
             dHalo: 2 * radioIsofota(comps, window.BitacoraPS1.cfg.muHalo) / 60 };
  }

  return {
    MU_E: MU_E, N_SERSIC: N_SERSIC, BA: BA, TAMANOS: TAMANOS,
    mu: mu, compsDe: compsDe, radioIsofota: radioIsofota, objeto: objeto,
    objetos: TAMANOS.map(objeto)
  };
};
