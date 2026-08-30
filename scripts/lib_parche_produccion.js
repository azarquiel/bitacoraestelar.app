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
  var PS1 = window.BitacoraPS1.cfg;

  /* Fila de catálogo → objeto `gal` con el mapeo de ps1GalaxiasDelCampo. */
  function galDeFila(f) {
    var campo = window.BitacoraPS1.ps1GalaxiasDelCampo([f], f[2], f[3], window.BitacoraPS1.ps1LadoArcmin(f[4]));
    if (!campo.length) throw new Error('la fila no se mapea a sí misma: ' + f[0]);
    return campo[0];
  }

  /* Réplica de ps1ParcheDeGalaxia con `F` (de lib_bajar_parche) como
     descarga ya hecha. Misma composición, mismos nombres. */
  function montar(F, gal, estrellas, catalogo) {
    var f = { ancho: F.ancho, alto: F.alto, escalaAs: F.escalaAs,
              wcs: F.wcs || null, datos: F.datos };
    f.afin = window.BitacoraPS1.ps1AfinParche(f, gal);
    var vecinos = catalogo ? window.BitacoraPS1.ps1GalaxiasDelCampo(catalogo, gal.ra, gal.dec, gal.ladoArcmin) : [gal];
    var enPx = window.BitacoraPS1.ps1EstrellasEnPixeles(f, gal, estrellas);
    var escena = window.BitacoraPS1.ps1EscenaEnParche(f, gal, vecinos);
    var limpio = window.BitacoraPS1.ps1QuitarEstrellas(f.datos, f.ancho, f.alto, enPx,
      { afin: f.afin, ba: gal.ba, pa: gal.pa, escena: escena });
    var comps = window.BitacoraPS1.ps1ComponentesSersic(gal);
    var datos = window.BitacoraPS1.ps1AnclarACatalogo(limpio, f.ancho, f.alto, {
      magV: gal.magV, n: gal.n, reArcsec: gal.reArcsec,
      ladoArcmin: gal.ladoArcmin, escalaAs: f.escalaAs
    });
    var peso = window.BitacoraPS1.ps1PesoImagen(datos, f.ancho, f.alto, f.escalaAs);
    var perfil = window.BitacoraPS1.ps1PerfilEnParche(comps, gal.pa, f.ancho, f.alto, f.afin);
    var halo = window.BitacoraPS1.ps1MedidasHalo(gal, comps);
    halo.mordida = window.BitacoraPS1.ps1MascaraMuerdeEscena(enPx, f.afin, escena);
    return {
      ra: gal.ra, dec: gal.dec, ladoArcmin: gal.ladoArcmin,
      ancho: f.ancho, alto: f.alto, afin: f.afin,
      comps: comps, pa: gal.pa, halo: halo,
      thetaIntArcmin: window.BitacoraPS1.ps1ThetaIntDeGal(gal, comps),
      peso: peso, escalaMezcla: window.BitacoraPS1.ps1EscalaMezcla(datos, peso, perfil),
      perfil: PS1.confianzaLocalNaN ? perfil : null,
      enEscena: window.BitacoraPS1.ps1FuentesEnEscena(estrellas || [], enPx, f.afin, escena),
      escena: escena,
      datos: datos
    };
  }

  return { galDeFila: galDeFila, montar: montar };
};
