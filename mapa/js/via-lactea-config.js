/* ============================================================================
   via-lactea-config.js — CONFIGURACIÓN
   Proyecto: mapa interactivo de la Vía Láctea (Gaia)
   Este es el ÚNICO archivo que necesitas tocar para los ajustes habituales:
   posición del Sol, tamaños de marcadores, velocidad del fundido, zoom
   máximo de las fichas y ruta de las imágenes.
   ============================================================================ */

  // ===========================================================================
  // ██████████████████████████████████████████████████████████████████████████
  //  CONFIGURACIÓN GLOBAL — todos los parámetros que puedes querer ajustar
  //  están aquí. No necesitas tocar nada más en el resto del código.
  // ██████████████████████████████████████████████████████████████████████████
  // ===========================================================================

  var CONFIG = {

    // -------------------------------------------------------------------------
    // POSICIÓN DEL SOL EN CADA VISTA
    //   Valores en % (0-100) sobre la imagen real de la galaxia.
    //   x = eje horizontal (0 = borde izquierdo, 100 = borde derecho)
    //   y = eje vertical   (0 = borde superior,  100 = borde inferior)
    // -------------------------------------------------------------------------
    // -------------------------------------------------------------------------
    // RUTAS DE RECURSOS
    //   imagenes : carpeta base donde viven las imágenes de las fichas.
    //   Las imágenes se leen de:  <imagenes><objeto>/<archivo>
    //   (p. ej. resources/images/m1/m1_70x.webp)
    // -------------------------------------------------------------------------
    rutas: {
      imagenes: '/bitacora-mapa/images/'
    },

    sol: {
      // Posiciones derivadas anclando el NÚCLEO GALÁCTICO en (50, 50) en ambas
      // vistas, con escala física de 40 kpc de ancho de imagen y distancia
      // Sol-núcleo de 26.000 años luz (l=0º0'5'', b=-0º5'46'').
      cenital: { x: 50.00, y: 69.93 }, // vista desde el polo norte galáctico
      canto:   { x: 30.07, y: 49.98 }  // vista lateral del disco
    },

    // -------------------------------------------------------------------------
    // NÚCLEO GALÁCTICO (en % de la imagen). Es el centro alrededor del cual
    // gira la vista cenital cuando el usuario usa el control de rotación.
    // -------------------------------------------------------------------------
    nucleo: {
      cenital: { x: 50.00, y: 50.00 },
      canto:   { x: 50.00, y: 50.00 }
    },

    // -------------------------------------------------------------------------
    // GIROS Y TRANSICIONES (interruptores de funcionalidades)
    //   giroAzimutalCanto : true/false. Control 🛰️ de la vista de canto que gira
    //                       el punto de vista alrededor del eje polar de la
    //                       galaxia (los objetos se reproyectan en 3D real).
    //                       Desactivado; ponlo a true para reactivarlo.
    //   giroPlanoCanto    : true/false. Control 🌀 de la vista de canto para
    //                       girar la imagen en el plano de la pantalla (giro
    //                       "de foto", alrededor del núcleo).
    //   transicion3D      : true/false. Voltereta 3D al cambiar entre la vista
    //                       cenital y la de canto (el disco se abate sobre sí).
    // -------------------------------------------------------------------------
    giros: {
      giroAzimutalCanto: false,
      giroPlanoCanto: true,
      transicion3D: true
    },

    // -------------------------------------------------------------------------
    // CONSTANTES FÍSICAS DEL MAPA
    //   anchoImagenAl        : ancho físico de las imágenes en años luz
    //                          (40 kpc = 130.462 al).
    //   distanciaSolNucleoAl : distancia Sol - núcleo galáctico en años luz.
    //   Se usan para la rotación azimutal de la vista de canto (girar el punto
    //   de vista alrededor del eje polar de la galaxia).
    // -------------------------------------------------------------------------
    fisica: {
      anchoImagenAl: 130462,
      distanciaSolNucleoAl: 26000
    },

    // -------------------------------------------------------------------------
    // TAMAÑO DE LOS MARCADORES DE OBJETOS EN EL MAPA
    //   puntoDiametro : diámetro del punto de color en píxeles
    //   textoTamano   : tamaño de la etiqueta junto al punto (CSS font-size)
    // -------------------------------------------------------------------------
    marcadores: {
      puntoDiametro: 5,        // px — prueba valores entre 4 y 10
      textoTamano:   '11px'    // CSS — p.ej. '10px', '12px', '0.8rem'
    },

    // -------------------------------------------------------------------------
    // VELOCIDAD DEL FUNDIDO AL CAMBIAR DE IMAGEN EN LAS FICHAS
    //   Tiempo en milisegundos. 800 = lento y elegante; 200 = casi instantáneo.
    //   Todo lo demás (transiciones CSS, pausas internas) se calcula solo.
    // -------------------------------------------------------------------------
    fundido: {
      duracionMs: 600
    },

    // -------------------------------------------------------------------------
    // ZOOM SOBRE LAS IMÁGENES DE LA FICHA
    //   maximo : aumento máximo permitido (5 = hasta x5).
    //   Se activa con la rueda del ratón o pellizcando con dos dedos.
    //   Con la imagen ampliada, arrastrar (ratón o un dedo) la desplaza,
    //   y un doble clic / doble toque la devuelve a su tamaño original.
    // -------------------------------------------------------------------------
    zoomFicha: {
      maximo: 5
    },

    // -------------------------------------------------------------------------
    // BUSCADOR DE OBJETOS
    //   parpadeoSegundos : cuánto tiempo parpadea el objeto encontrado (seg).
    //   avisoSegundos    : cuánto se muestra el pop-up de "no encontrado" (seg).
    //   zoom             : nivel de aumento del mapa al centrar en el objeto
    //                      (se recorta al máximo permitido por el mapa).
    // -------------------------------------------------------------------------
    busqueda: {
      parpadeoSegundos: 3,
      avisoSegundos: 3,
      zoom: 15
    }

  };
  // ===========================================================================
  //  FIN DE CONFIGURACIÓN — no modifiques nada por debajo de esta línea
  //  salvo que sepas lo que haces.
  // ===========================================================================
