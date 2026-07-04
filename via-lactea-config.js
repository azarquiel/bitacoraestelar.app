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
      imagenes: 'resources/images/'
    },

    sol: {
      cenital: { x: 52.35, y: 71.15 }, // vista desde el polo norte galáctico
      canto:   { x: 26.75, y: 49.00 }  // vista lateral del disco
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
    }

  };
  // ===========================================================================
  //  FIN DE CONFIGURACIÓN — no modifiques nada por debajo de esta línea
  //  salvo que sepas lo que haces.
  // ===========================================================================
