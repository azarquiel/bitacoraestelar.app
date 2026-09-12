/* El tamaño del objeto, en ″, con los DOS metros que hacen falta para saber
   dónde empieza el cielo (ADR 0028): la escena μ25 que producción protege y el
   tamaño que trae el catálogo. De aquí sale `r_obj` —el mayor de los dos— con
   el que se coloca el campo vecino.

   Vive en un solo sitio porque lo usan el arnés que lo midió
   (`harness_suelo_cielo.js`, #274) y el generador que lo aplica
   (`gen_dso_texturas.js`, #285): tenerlo dos veces es la deriva del ADR 0008.

   No está en `resources/js/bitacora-ps1.js` por una razón concreta: la
   constante `RE_SOBRE_SEMIEJE` no la conoce el runtime —al catálogo le llega ya
   aplicada— y hay que leerla de `gen_nebulosas.py`, que es disco.

   Uso:  var R = require('./lib_radio_objeto.js')(PS1); */
'use strict';

var fs = require('fs'), path = require('path');

/* Las clases DIFUSAS (HII, RfN, Cl+N) traen `r_e = 0,30·semieje`, y ese 0,30 no
   llega al runtime. Es la única constante que esto copia de otro fichero, y se
   copia con guardián: si `gen_nebulosas.py` deja de escribir ese número, esto se
   para en vez de medir con el viejo (ADR 0008). */
var RE_SOBRE_SEMIEJE = 0.30;

module.exports = function (PS1) {
  (function comprobar() {
    var py = path.join(__dirname, 'gen_nebulosas.py');
    if (!fs.existsSync(py)) return;
    var m = /^RE_SOBRE_SEMIEJE\s*=\s*([0-9.]+)/m.exec(fs.readFileSync(py, 'utf8'));
    if (!m || parseFloat(m[1]) !== RE_SOBRE_SEMIEJE) {
      throw new Error('gen_nebulosas.py ya no dice RE_SOBRE_SEMIEJE = ' + RE_SOBRE_SEMIEJE +
                      ': esto mide con una constante que caducó (ADR 0008)');
    }
  })();

  /* La extensión del OBJETO: el borde real si su clase lo tiene, y si no `r_e`.
     Es la que usa el veredicto de ausencia de #229. */
  function radioObjetoAs(gal) {
    var rb = PS1.ps1RadioBordeAs(gal);
    return rb > 0 ? rb : gal.reArcsec;
  }

  /* El tamaño de CATÁLOGO. En las compactas (PN, SNR) lo sabe producción
     —`ps1RadioBordeAs` ya es `r_e / 0,60`— y coincide con la isofota. En las
     difusas no coincide: de ahí sale que un parche de 6·r_e mida 0,9 ejes
     mayores. Para las galaxias los dos metros son el mismo número. */
  function radioCatalogoAs(f, gal, rEscena) {
    var rb = PS1.ps1RadioBordeAs(gal);
    if (rb > 0) return rb;
    return (f[12] ? gal.reArcsec / RE_SOBRE_SEMIEJE : rEscena);
  }

  /* El radio con el que la ESCENA protege a este objeto: el componente centrado
     en él (los demás son compañeras del campo). */
  function radioEscenaAs(fits, gal) {
    var escena = PS1.ps1EscenaEnParche(fits, gal, PS1.ps1GalaxiasDelCampo(
      PS1.ps1CatalogoDifuso(window.BITACORA_GALAXIAS, window.BITACORA_NEBULOSAS),
      gal.ra, gal.dec, gal.ladoArcmin));
    var mejor = 0;
    escena.forEach(function (c) {
      if (Math.hypot(c.cx - fits.afin.cx, c.cy - fits.afin.cy) * fits.escalaAs < 5 && c.r25As > mejor) {
        mejor = c.r25As;
      }
    });
    return mejor || radioObjetoAs(gal);
  }

  /* `r_obj` del ADR 0028: el mayor de los dos metros. */
  function rObjMaxAs(fits, f, gal) {
    var rEsc = radioEscenaAs(fits, gal);
    return Math.max(rEsc, radioCatalogoAs(f, gal, rEsc));
  }

  return { RE_SOBRE_SEMIEJE: RE_SOBRE_SEMIEJE, radioObjetoAs: radioObjetoAs,
           radioCatalogoAs: radioCatalogoAs, radioEscenaAs: radioEscenaAs,
           rObjMaxAs: rObjMaxAs };
};
