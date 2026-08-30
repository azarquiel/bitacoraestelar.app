/* CANDIDATA: la PSF del telescopio aplicada al parche de PS1.

   Vive aquí y no en producción. Es la pieza que habría que mover el día que se
   decida, y está escrita para que ese movimiento sea copiar y pegar.

   La idea, en una línea: el parche de PS1 NO es la galaxia, es la galaxia ya
   convolucionada por el stack de PanSTARRS (PS1.seeingAs = 1,1″ de FWHM). Lo que
   falta para que sea lo que ve un ocular es la DIFERENCIA entre la PSF del
   telescopio y la que la imagen ya trae, en cuadratura:

       θ_res(D) = 2 · radioImagenEstelar(D)        ← ya existe, ya exportada
       θ_add    = √(θ_res² − PS1.seeingAs²)        ← lo que falta por poner

   Cero constantes nuevas: airyArcsec, seeingArcsec y PS1.seeingAs ya están en
   producción, y radioImagenEstelar ya las combina —hoy solo para estrellas—.

   DÓNDE se aplica importa tanto como cuánto. Se aplica sobre parche.datos, en
   los píxeles del PROPIO parche y una sola vez por parche, ANTES de la mezcla
   con el perfil. No sobre el lienzo. Consecuencias:

     · el lienzo, el campo aparente y los aumentos no entran en el cálculo, así
       que no pueden colarse en el umbral: la geometría sigue siendo geometría;
     · la borrosidad es angular y fija (″), así que al subir aumentos crece en
       pantalla lo mismo que crece la galaxia — que es exactamente lo que hace la
       naturaleza: aumentar no resuelve;
     · como es una convolución, conserva el flujo total, y el presupuesto
       fotométrico de ps1FlujoModelo no se entera.

   `desenfocar` (el que ya hay en producción) NO sirve aquí, y su propio
   comentario lo dice: pasa por un canvas de 8 bits y recorta a 0–255. El parche
   son flujos, no grises. De ahí esta convolución aparte.

   Uso:  var P = require('./lib_psf_parche.js')(R);
         P.thetaAdd(457)                     → ″ de FWHM que falta añadir
         P.convolucionar(datos, an, al, esc, 457)  → Float32Array nueva */
'use strict';

var FWHM_A_SIGMA = 2 * Math.sqrt(2 * Math.LN2);   // 2,3548: definición, no ajuste

module.exports = function (R) {
  var PS1 = window.BitacoraPS1.cfg, CFG = R.config;

  /* FWHM del telescopio, en ″. Es 2× el radio que ya usan las estrellas: la
     misma cuadratura Airy ⊕ seeing, sin tocar nada. */
  function thetaRes(D) { return 2 * R.radioImagenEstelar(D); }

  /* El borrón que el parche YA trae. Son DOS cosas, no una:

       · el seeing del stack, PS1.seeingAs = 1,1″ de FWHM;
       · el propio píxel del recorte, que es una caja de escalaAs de lado.

     Lo segundo no es un detalle. El proxy pide siempre 512 px de salida, así que
     escalaAs no es la nativa de PS1 (0,25″) sino lado/512: va de 0,67″ a 17″ en
     la caché de hoy, mediana 2,35″. Una caja de lado w tiene varianza w²/12, o
     sea una gaussiana equivalente de FWHM = w·2,3548/√12 = 0,68·w. Ignorarlo
     hace que la resta en cuadratura dé de más, y el parche saldría con MÁS
     borrón del que le toca.

     0,68 no es una constante física nueva: es la conversión caja→gaussiana, pura
     geometría, del mismo rango que el 2,3548 de FWHM→σ. */
  var CAJA_A_FWHM = FWHM_A_SIGMA / Math.sqrt(12);      // 0,6796

  function thetaParche(escalaAs) {
    var ps1 = (PS1.seeingAs > 0) ? PS1.seeingAs : 0;
    var caja = (escalaAs > 0 ? escalaAs : 0) * CAJA_A_FWHM;
    return Math.sqrt(ps1 * ps1 + caja * caja);
  }

  /* Lo que hay que AÑADIR a la imagen para que su borrón sea el del telescopio.
     Si el parche ya viniera más borroso que el telescopio, sale 0: no se puede
     desconvolucionar, y fingir que sí es inventar resolución que no existe. */
  function thetaAdd(D, escalaAs) {
    var tr = thetaRes(D), tp = thetaParche(escalaAs);
    var d2 = tr * tr - tp * tp;
    return d2 > 0 ? Math.sqrt(d2) : 0;
  }

  /* Gaussiana separable sobre Float32. El borde se replica en vez de rellenarse
     con ceros: con ceros el perímetro del parche se oscurecería, y el borde del
     parche es justo una de las cosas que no debe fabricar estructura.

     `fwhmAs` fuerza un borrón concreto y se salta la cuenta de la apertura: lo
     usa el harness para suavizar a una escala de referencia, no producción. */
  function convolucionar(datos, ancho, alto, escalaAs, D, seeingAs, fwhmAs) {
    var fwhm = (fwhmAs != null) ? fwhmAs
             : (seeingAs == null) ? thetaAdd(D, escalaAs) : thetaAddCon(D, seeingAs, escalaAs);
    var esc = (escalaAs > 0) ? escalaAs : 1;
    var sigma = fwhm / FWHM_A_SIGMA / esc;                  // px del parche
    var salida = new Float32Array(datos.length);
    if (!(sigma > 0.01)) { salida.set(datos); return salida; }   // nada que hacer

    var rad = Math.max(1, Math.ceil(3 * sigma)), n = 2 * rad + 1, k = new Float64Array(n), s = 0, i, j;
    for (i = 0; i < n; i++) { k[i] = Math.exp(-((i - rad) * (i - rad)) / (2 * sigma * sigma)); s += k[i]; }
    for (i = 0; i < n; i++) k[i] /= s;

    /* Los parches TRAEN píxeles no finitos: 76 en el de M51, 96 en el de M101,
       que son los huecos del stack. Una convolución ciega esparce cada NaN por
       todo el kernel y se lleva por delante un disco de 3σ. Se saltan y se
       renormaliza por el peso que sí se usó: no se inventa dato, se pesa solo
       con lo que hay. Un píxel sin ningún vecino válido sale no finito, como
       entró, para que el hueco siga siendo un hueco. */
    var tmp = new Float32Array(datos.length), x, y, acc, w, p, val;
    for (y = 0; y < alto; y++) {                             // horizontal
      for (x = 0; x < ancho; x++) {
        acc = 0; w = 0;
        for (j = 0; j < n; j++) {
          p = x + j - rad;
          if (p < 0) p = 0; else if (p >= ancho) p = ancho - 1;
          val = datos[y * ancho + p];
          if (isFinite(val)) { acc += k[j] * val; w += k[j]; }
        }
        tmp[y * ancho + x] = w > 0 ? acc / w : NaN;
      }
    }
    for (y = 0; y < alto; y++) {                             // vertical
      for (x = 0; x < ancho; x++) {
        acc = 0; w = 0;
        for (j = 0; j < n; j++) {
          p = y + j - rad;
          if (p < 0) p = 0; else if (p >= alto) p = alto - 1;
          val = tmp[p * ancho + x];
          if (isFinite(val)) { acc += k[j] * val; w += k[j]; }
        }
        salida[y * ancho + x] = w > 0 ? acc / w : NaN;
      }
    }
    return salida;
  }

  /* Las mismas cuentas con un seeing que no es el de CFG. Solo para barrer en el
     harness: producción usaría CFG.seeingArcsec y punto, sin perilla nueva. */
  function thetaResCon(D, seeingAs) {
    var airy = CFG.airyArcsec / D;
    return 2 * Math.sqrt(airy * airy + (seeingAs / 2) * (seeingAs / 2));
  }
  function thetaAddCon(D, seeingAs, escalaAs) {
    var tr = thetaResCon(D, seeingAs), tp = thetaParche(escalaAs);
    var d2 = tr * tr - tp * tp;
    return d2 > 0 ? Math.sqrt(d2) : 0;
  }

  /* Amplitud que una gaussiana deja pasar en una sinusoide de periodo P (″).
     Es la MTF, analítica: sirve de predicción contra la que contrastar la
     convolución numérica, no de sustituta suya. */
  function mtf(fwhmAs, periodoAs) {
    var sigma = fwhmAs / FWHM_A_SIGMA;
    return Math.exp(-2 * Math.PI * Math.PI * sigma * sigma / (periodoAs * periodoAs));
  }

  /* σ en píxeles del parche: si sale por debajo de ~0,5 px, la convolución no
     tiene dónde apoyarse y el efecto no es representable a esa escala. */
  function sigmaPx(D, escalaAs, seeingAs) {
    var fwhm = (seeingAs == null) ? thetaAdd(D, escalaAs) : thetaAddCon(D, seeingAs, escalaAs);
    return fwhm / FWHM_A_SIGMA / (escalaAs > 0 ? escalaAs : 1);
  }

  return { thetaRes: thetaRes, thetaAdd: thetaAdd, thetaParche: thetaParche,
           thetaResCon: thetaResCon, thetaAddCon: thetaAddCon, sigmaPx: sigmaPx,
           convolucionar: convolucionar, mtf: mtf,
           FWHM_A_SIGMA: FWHM_A_SIGMA, CAJA_A_FWHM: CAJA_A_FWHM };
};
