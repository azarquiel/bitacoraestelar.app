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
    // INCLINACIÓN DE LA VISTA CENITAL
    // El disco deja de verse desde arriba en plano: se abate con rotateX y se
    // proyecta con perspectiva, así que la galaxia se ve "desde la nave" y no
    // como una lámina. Los objetos se despegan del plano según su altura real
    // sobre el plano galáctico (b y d de sus coordenadas), y sus puntos y
    // etiquetas se contragiran para que no salgan aplastados.
    //   activa        : true/false. En false, la vista cenital vuelve a ser plana.
    //   grados        : abatimiento del disco (0 = de frente, 90 = de canto).
    //   perspectiva   : distancia del observador en px (CSS perspective). Cuanto
    //                   menor, más se agranda el borde cercano.
    //   bulboRadio    : radio del bulbo ficticio, en fracción del ancho de la
    //                   imagen. El bulbo es un recorte de la propia foto puesto
    //                   de cara a la cámara: al abatir el disco, el núcleo se
    //                   aplastaría hasta desaparecer, y este recorte le devuelve
    //                   el volumen sin inventar ni color ni forma.
    //   bulboAlto     : altura del recorte sobre el plano, misma fracción.
    //   alturaObjetos : exageración de la altura de los marcadores (1 = real).
    //   giroEnPlano   : true/false. Control de giro de la vista cenital. Con la
    //                   inclinación activa está desactivado: giro y abatimiento
    //                   juntos desorientan y no hay un horizonte al que volver.
    // -------------------------------------------------------------------------
    inclinacion: {
      activa: true,
      grados: 75,
      perspectiva: 1400,
      bulboRadio: 0.020,
      bulboAlto: 0,
      alturaObjetos: 1.5,
      tallos: true,
      giroEnPlano: true
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
    //   atenuacionEscala / atenuacionOpacidad : estado base ATENUADO de los
    //     marcadores en las tres vistas (más pequeños y translúcidos para que
    //     las zonas densas no se saturen). El hover, la búsqueda o un viaje
    //     interestelar activo devuelven el marcador al estilo completo. La ley
    //     vive en via-lactea-marcador-estilo.js (VLMarcadorEstilo).
    // -------------------------------------------------------------------------
    marcadores: {
      puntoDiametro: 5,        // px — prueba valores entre 4 y 10
      textoTamano:   '11px',   // CSS — p.ej. '10px', '12px', '0.8rem'
      atenuacionEscala: 0.82,  // factor de tamaño del estado base (1 = sin atenuar)
      atenuacionOpacidad: 0.55, // opacidad del estado base (1 = opaco)
      etiquetaZoomMin: 3,      // scale mínimo (vista de la galaxia) para que las
                                // etiquetas se lean solas (por debajo, se
                                // amontonan: solo aparecen al pasar el cursor o
                                // durante un viaje). minScale=1, maxScale=25.
      etiquetaFovFraccion: 0.15 // misma idea para el Grupo Local y el vecindario
                                // solar, que hacen zoom por FOV (campo de visión
                                // en años luz) en vez de por escala: la etiqueta
                                // se lee sola cuando fov <= FOV_MAX · esta fracción.
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
    //   resolver         : endpoint que localiza en SIMBAD un objeto que NO está
    //                      en el registro (para buscar también objetos fuera de
    //                      la Vía Láctea). '' desactiva la búsqueda externa.
    //   margenExtragalactico : cuánto "aire" dejar alrededor del objeto al
    //                      enfocarlo en el atlas (1.8 = el objeto a ~0,55 del
    //                      radio visible). Mayor = objeto más pequeño y centrado.
    // -------------------------------------------------------------------------
    busqueda: {
      parpadeoSegundos: 3,
      avisoSegundos: 3,
      zoom: 15,
      resolver: '/wp-json/bitacora/v1/resolver',
      margenExtragalactico: 1.8
    },

    // -------------------------------------------------------------------------
    // TRÁNSITO A LA VISTA DEL GRUPO LOCAL (zoom out más allá de la galaxia)
    //   Al hacer zoom OUT, cuando la imagen de la galaxia se reduce hasta
    //   "umbral" de su tamaño original, la vista funde hacia el atlas del Grupo
    //   Local (galaxias observadas fuera de la Vía Láctea). La galaxia, al
    //   encogerse, pasa a ser el punto "Vía Láctea" del centro del atlas.
    //
    //   umbral       : fracción del tamaño original en la que EMPIEZA el fundido.
    //                  0.1 = una décima parte (lo pedido). Súbelo/bájalo a gusto.
    //   umbralFinal  : fracción en la que el fundido está COMPLETO (solo atlas).
    //                  Debe ser menor que "umbral" (define el ancho del fundido).
    //   escalaMinima : zoom out máximo. Cuanto menor, más lejos se llega en el
    //                  atlas (fov mayor). 0.0015 permite alcanzar las galaxias
    //                  más lejanas del catálogo (~30 millones de años luz).
    //   autoGiro     : giro ambiental lento del atlas (radianes por fotograma).
    //   alcanceMaximoAl : hasta dónde (años luz) se puede alejar la vista en el
    //                  atlas. El zoom out llega SIEMPRE al menos hasta aquí, y
    //                  más allá si hay un objeto registrado más lejano. 5000
    //                  millones de años luz (5e9) da margen de sobra.
    // -------------------------------------------------------------------------
    grupoLocal: {
      umbral: 0.1,
      umbralFinal: 0.04,
      escalaMinima: 0.0015,
      autoGiro: 0.0004,
      alcanceMaximoAl: 5000000000
    },

    // -------------------------------------------------------------------------
    // DESCUBRIR OBSERVACIONES DE OTROS OBSERVADORES
    //   Cuando hay un observador seleccionado en el filtro, los objetos que ESE
    //   observador NO ha observado (pero SÍ otros) no se ocultan: se muestran
    //   atenuados (en gris con algo de su color, como "deshabilitados"). Al
    //   pulsarlos, la ficha muestra la información básica con el rótulo
    //   "NO VISITADO" y una lista de los observadores que sí lo han observado;
    //   al elegir uno se ve su observación (con un botón para volver a la lista).
    //   Lo mismo aplica a las galaxias del atlas del Grupo Local.
    //
    //   activo : true  = funcionalidad activada (los no observados se atenúan y
    //                    permiten descubrir las observaciones de otros).
    //            false = comportamiento clásico: los objetos no observados por el
    //                    observador seleccionado simplemente se ocultan.
    // -------------------------------------------------------------------------
    observacionesAjenas: {
      activo: true
    },

    // -------------------------------------------------------------------------
    // TRÁNSITO AL VECINDARIO SOLAR (zoom máximo SOBRE EL SOL)
    //   Simétrico al Grupo Local pero al ACERCAR: al hacer zoom sobre el Sol,
    //   la imagen de la galaxia se funde en el punto "Sol" y aparece una escena
    //   3D de las estrellas cercanas registradas (vecindario-solar.js), en tono
    //   dorado (brazos de la Vía Láctea) para una inmersión suave.
    //
    //   La imagen mide 40 kpc (130.462 al) a zoom 0; a ×25 (zoom normal) se ve un
    //   parche de ~5.200 al. Para llegar al vecindario (~16 al) hace falta ~×6.500,
    //   pero SOLO se permite superar ×25 cuando el Sol está centrado (ver más
    //   abajo): fuera de ahí el zoom sigue topado en ×25, sin afectar a la
    //   navegación normal.
    //
    //   zoomMaximo  : tope de zoom cuando el Sol está centrado (si no, 25).
    //   proximidad  : el Sol debe estar a < esta fracción del lado menor respecto
    //                 al centro para elevar el tope y activar la capa.
    //   fovInicioAl : campo de visión (al) en que EMPIEZA el fundido al vecindario.
    //   fovFinalAl  : campo (al) en que el fundido está COMPLETO (solo vecindario).
    //   fovSalidaAl : histéresis. Una vez DENTRO del vecindario, la escena sigue
    //                 opaca hasta este campo (mayor que fovFinalAl) y solo
    //                 entonces empieza a devolver la galaxia. Entrar cuesta más
    //                 que quedarse: sin esto, descentrar el Sol al hacer zoom
    //                 apagaba la capa de golpe y las dos imágenes se mezclaban.
    //   fovMinAl    : campo mínimo (radio, al) al que se puede acercar (~8 al ≈ 16 al de diámetro).
    //   distMaxAl   : distancia máxima (al) para considerar una estrella "del vecindario".
    //                 fovFinalAl debe ser ≳ 0,84 × distMaxAl: si no, la escena se
    //                 vuelve opaca con las estrellas más lejanas ya fuera de cuadro.
    //   autoGiro    : giro ambiental lento de la escena (radianes por fotograma).
    // -------------------------------------------------------------------------
    vecindario: {
      zoomMaximo: 6500,
      proximidad: 0.28,
      fovInicioAl: 4000,
      fovFinalAl: 1500,
      fovSalidaAl: 2500,
      fovMinAl: 8,
      distMaxAl: 1500,
      autoGiro: 0.0006
    }

  };
  // ===========================================================================
  //  FIN DE CONFIGURACIÓN — no modifiques nada por debajo de esta línea
  //  salvo que sepas lo que haces.
  // ===========================================================================
