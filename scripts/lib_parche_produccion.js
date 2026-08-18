/* Montaje del parche EXACTAMENTE como ps1ParcheDeGalaxia (producción), pero
   con el parche ya descargado (lib_bajar_parche) en vez del proxy PHP: los
   harness de Node no tienen XMLHttpRequest. Cada paso ES la función de
   producción exportada; lo único replicado aquí es la composición
   (bitacora-gaia-render.js, ps1ParcheDeGalaxia). Si aquella cambia, este
   fichero debe cambiar con ella — el golden que la consume lo delatará.

   Uso:  var P = require('./lib_parche_produccion.js')(R);
         P.montar(F, gal, estrellas, catalogo)  →  parche               */
'use strict';

module.exports = function (R) {
  var PS1 = R.ps1;

  /* Fila de catálogo → objeto `gal` con el mapeo de ps1GalaxiasDelCampo. */
  function galDeFila(f) {
    var campo = R.ps1GalaxiasDelCampo([f], f[2], f[3], R.ps1LadoArcmin(f[4]));
    if (!campo.length) throw new Error('la fila no se mapea a sí misma: ' + f[0]);
    return campo[0];
  }

  /* Réplica de ps1ParcheDeGalaxia con `F` (de lib_bajar_parche) como
     descarga ya hecha. Misma composición, mismos nombres. */
  function montar(F, gal, estrellas, catalogo) {
    var f = { ancho: F.ancho, alto: F.alto, escalaAs: F.escalaAs,
              wcs: F.wcs || null, datos: F.datos };
    f.afin = R.ps1AfinParche(f, gal);
    var vecinos = catalogo ? R.ps1GalaxiasDelCampo(catalogo, gal.ra, gal.dec, gal.ladoArcmin) : [gal];
    var enPx = R.ps1EstrellasEnPixeles(f, gal, estrellas);
    var escena = R.ps1EscenaEnParche(f, gal, vecinos);
    var limpio = R.ps1QuitarEstrellas(f.datos, f.ancho, f.alto, enPx,
      { afin: f.afin, ba: gal.ba, pa: gal.pa, escena: escena });
    var comps = R.ps1ComponentesSersic(gal);
    var datos = R.ps1AnclarACatalogo(limpio, f.ancho, f.alto, {
      magV: gal.magV, n: gal.n, reArcsec: gal.reArcsec,
      ladoArcmin: gal.ladoArcmin, escalaAs: f.escalaAs
    });
    var peso = R.ps1PesoImagen(datos, f.ancho, f.alto, f.escalaAs);
    var perfil = R.ps1PerfilEnParche(comps, gal.pa, f.ancho, f.alto, f.afin);
    return {
      ra: gal.ra, dec: gal.dec, ladoArcmin: gal.ladoArcmin,
      ancho: f.ancho, alto: f.alto, afin: f.afin,
      comps: comps, pa: gal.pa, halo: R.ps1MedidasHalo(gal, comps),
      thetaIntArcmin: R.ps1ThetaIntArcmin(comps, gal.ba),
      peso: peso, escalaMezcla: R.ps1EscalaMezcla(datos, peso, perfil),
      perfil: PS1.confianzaLocalNaN ? perfil : null,
      enEscena: R.ps1FuentesEnEscena(estrellas || [], enPx, f.afin, escena),
      escena: escena,
      datos: datos
    };
  }

  return { galDeFila: galDeFila, montar: montar };
};
