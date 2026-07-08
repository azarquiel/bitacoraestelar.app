/* ============================================================================
   via-lactea-datos.js — DATOS (objetos y observaciones)
   Proyecto: mapa interactivo de la Vía Láctea (Gaia)
   Contenido puro, sin lógica. Estructura pensada para crecer:
     OBSERVADORES  : quién observa (añade aquí nuevos observadores).
     OBJECTS       : los objetos del mapa (datos físicos y posiciones).
     OBSERVACIONES : LISTA de observaciones por objeto. Hoy hay una por
                     objeto; para añadir otra de un observador distinto,
                     añade un segundo elemento { ... } a la lista del
                     objeto, con su campo "observador".
   Editar este archivo NUNCA puede romper la lógica del mapa.
   ============================================================================ */

  // ---------------------------------------------------------------------------
  // OBSERVADORES: catálogo de quienes aportan observaciones.
  // La clave (p. ej. 'autor') es la que se referencia desde cada observación.
  // ---------------------------------------------------------------------------
  var OBSERVADORES = {
    autor: {
      nombre: 'The Ferret of Comets',   // ← pon aquí tu nombre o alias
      equipo: null                       // p. ej. 'Dobson 305 mm f/5'
    }
  };

  // ===========================================================================
  // TABLA DE OBJETOS: añade aquí nuevos objetos Messier.
  //   id     : identificador único, sin espacios
  //   name   : título que aparece en la ventana del PDF
  //   label  : etiqueta corta junto al punto en el mapa
  //   color  : color del marcador (mismo color = mismo tipo de objeto)
  //            #7ec8ff resto de supernova · #d7a4ff cúmulo globular
  //            #ff8a80 nebulosa de emisión · #8aff9e cúmulo abierto
  //   coords : texto de coordenadas mostrado en la ventana
  //   pdf    : URL de la ficha en PDF
  //   top    : posición {x,y} en % sobre la vista cenital
  //   edge   : posición {x,y} en % sobre la vista de canto
  // ===========================================================================
  var OBJECTS = [
    {
      id: 'm1', name: 'M1 · Nebulosa del Cangrejo (Tauro)', label: 'M1',
      color: '#7ec8ff', ficha: 'm1',
      coords: 'l ≈ 184,6°, b ≈ -5,8° · ~6.500 años luz del Sol',
      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m1_inv.pdf',
      top:  { x: 50.4, y: 74.9 },
      edge: { x: 25.1, y: 50.3 }
    },
    {
      id: 'm2', name: 'M2 · Cúmulo globular (Acuario)', label: 'M2',
		color: '#d7a4ff', ficha: 'm2',
      coords: 'l ≈ 53,4°, b ≈ -35,8° · ~37.500 años luz del Sol',
      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m2_inv.pdf',
      top:  { x: 31.3, y: 56.0 },
      edge: { x: 44.0, y: 59.9 }
    },
    {
      id: 'm4', name: 'M4 · Cúmulo globular (Escorpio)', label: 'M4',
      color: '#d7a4ff', ficha: 'm4',
      coords: 'l ≈ 351,0°, b ≈ +16,0° · ~6.200 años luz del Sol',
      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m4_inv.pdf',
      top:  { x: 50.7, y: 65.4 },
      edge: { x: 34.6, y: 49.2 }
    },
    {
      id: 'm5', name: 'M5 · Cúmulo globular (Serpens)', label: 'M5',
      color: '#d7a4ff', ficha: 'm5',
      coords: 'l ≈ 3,9°, b ≈ +46,8° · ~24.500 años luz del Sol',
      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m5_inv.pdf',
      top:  { x: 49.1, y: 57.1 },
      edge: { x: 42.9, y: 41.9 }
    },
    {
      id: 'm8', name: 'M8 · Nebulosa de la Laguna (Sagitario)', label: 'M8',
      color: '#ff8a80', ficha: 'm8',
      coords: 'l ≈ 6,0°, b ≈ -1,2° · ~4.100 años luz del Sol',
      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m8_inv.pdf',
      top:  { x: 49.7, y: 66.8 },
      edge: { x: 33.2, y: 50.0 }
    },
    {
      id: 'm9', name: 'M9 · Cúmulo globular (Ofiuco)', label: 'M9',
      color: '#d7a4ff', ficha: 'm9',
      coords: 'l ≈ 5,5°, b ≈ +10,3° · ~25.800 años luz del Sol',
      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m9_inv.pdf',
      top:  { x: 48.1, y: 50.6 },
      edge: { x: 49.4, y: 47.9 }
    },
    {
      id: 'm10', name: 'M10 · Cúmulo globular (Ofiuco)', label: 'M10',
      color: '#d7a4ff', ficha: 'm10',
      coords: 'l ≈ 15,1°, b ≈ +23,1° · ~14.400 años luz del Sol',
      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m10_inv.pdf',
      top:  { x: 47.4, y: 60.1 },
      edge: { x: 39.9, y: 47.4 }
    },
    {
      id: 'm11', name: 'M11 · Cúmulo del Pato Salvaje (Scutum)', label: 'M11',
      color: '#8aff9e', ficha: 'm11',
      coords: 'l ≈ 27,3°, b ≈ -2,8° · ~6.200 años luz del Sol',
      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m11_inv.pdf',
      top:  { x: 47.8, y: 65.7 },
      edge: { x: 34.3, y: 50.1 }
    },
    // NOTA: las posiciones top/edge de M12-M15 son una primera estimación
    // (a partir de l, b y distancia aproximadas) pendiente de ajuste visual
    // sobre el mapa, igual que se hizo a ojo con el resto de objetos.
    {
      id: 'm12', name: 'M12 · Cúmulo globular (Ofiuco)', label: 'M12',
      color: '#d7a4ff', ficha: 'm12',
      coords: 'l ≈ 15,7°, b ≈ +26,3° · ~16.000 años luz del Sol',
      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m12_inv.pdf',
      top:  { x: 47.0, y: 59.3 },
      edge: { x: 40.7, y: 46.8 }
    },
    {
      id: 'm13', name: 'M13 · Gran cúmulo de Hércules', label: 'M13',
      color: '#d7a4ff', ficha: 'm13',
      coords: 'l ≈ 59,0°, b ≈ +40,9° · ~22.200 años luz del Sol',
      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m13_inv.pdf',
      top:  { x: 39.0, y: 63.3 },
      edge: { x: 36.7, y: 43.4 }
    },
    {
      id: 'm14', name: 'M14 · Cúmulo globular (Ofiuco)', label: 'M14',
      color: '#d7a4ff', ficha: 'm14',
      coords: 'l ≈ 21,3°, b ≈ +14,8° · ~30.300 años luz del Sol',
      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m14_inv.pdf',
      top:  { x: 41.8, y: 49.0 },
      edge: { x: 51.0, y: 46.5 }
    },
    {
      id: 'm15', name: 'M15 · Gran cúmulo globular de Pegaso', label: 'M15',
      color: '#d7a4ff', ficha: 'm15',
      coords: 'l ≈ 65,0°, b ≈ -27,3° · ~33.600 años luz del Sol',
      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m15_inv.pdf',
      top:  { x: 29.3, y: 60.3 },
      edge: { x: 39.7, y: 56.9 }
    },
    {
      id: 'ngc40', name: 'NGC 40 · Nebulosa de la Pajarita (Cefeo)', label: 'NGC 40',
      color: '#5fe0c8', ficha: 'ngc40',
      coords: 'l ≈ 120,0°, b ≈ +9,8° · ~5.300 años luz del Sol',
      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/ngc40_inv.pdf',
      top:  { x: 46.5, y: 71.9 },
      edge: { x: 28.1, y: 49.6 }
    },
    {
      id: 'ngc6826', name: 'NGC 6826 · Nebulosa Parpadeante (Cisne)', label: 'NGC 6826',
      color: '#5fe0c8', ficha: 'ngc6826',
      coords: 'l ≈ 83,5°, b ≈ +12,7° · ~2.200 años luz del Sol',
      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/ngc6826_inv.pdf',
      top:  { x: 48.4, y: 69.7 },
      edge: { x: 30.3, y: 49.8 }
    },
    {
      id: 'ngc6905', name: 'NGC 6905 · Nebulosa del Fogonazo Azul (Delfín)', label: 'NGC 6905',
      color: '#5fe0c8', ficha: 'ngc6905',
      coords: 'l ≈ 61,5°, b ≈ -9,6° · ~7.500 años luz del Sol',
      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/ngc6905_inv.pdf',
      top:  { x: 45.0, y: 67.2 },
      edge: { x: 32.8, y: 50.5 }
    },
    {
      id: 'm17', name: 'M17 · Nebulosa Omega (Sagitario)', label: 'M17',
      color: '#ff8a80', ficha: 'm17',
      coords: 'l ≈ 15,1°, b ≈ -0,7° · ~5.500 años luz del Sol',
      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m17_inv.pdf',
      top:  { x: 48.9, y: 65.9 },
      edge: { x: 34.1, y: 50.0 }
    },
    {
      id: 'm20', name: 'M20 · Nebulosa Trífida (Sagitario)', label: 'M20',
      color: '#ff8a80', ficha: 'm20',
      coords: 'l ≈ 7,0°, b ≈ -0,3° · ~4.100 años luz del Sol',
      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m20_inv.pdf',
      top:  { x: 49.6, y: 66.8 },
      edge: { x: 33.2, y: 50.0 }
    },
    {
      id: 'm22', name: 'M22 · Gran cúmulo de Sagitario', label: 'M22',
      color: '#d7a4ff', ficha: 'm22',
      coords: 'l ≈ 9,9°, b ≈ -7,6° · ~10.400 años luz del Sol',
      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m22_inv.pdf',
      top:  { x: 48.6, y: 62.1 },
      edge: { x: 37.9, y: 50.6 }
    },
    {
      id: 'm27', name: 'M27 · Nebulosa Dumbbell (Zorra)', label: 'M27',
      color: '#5fe0c8', ficha: 'm27',
      coords: 'l ≈ 60,8°, b ≈ -3,7° · ~1.360 años luz del Sol',
      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m27_inv.pdf',
      top:  { x: 49.1, y: 69.4 },
      edge: { x: 30.6, y: 50.0 }
    },
    {
      id: 'm30', name: 'M30 · Cúmulo globular de Capricornio', label: 'M30',
      color: '#d7a4ff', ficha: 'm30',
      coords: 'l ≈ 27,2°, b ≈ -46,8° · ~27.100 años luz del Sol',
      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m30_inv.pdf',
      top:  { x: 43.5, y: 57.3 },
      edge: { x: 42.7, y: 58.9 }
    },
    {
      id: 'm29', name: 'M29 · Cúmulo de la Torre de Enfriamiento (Cisne)', label: 'M29',
      color: '#8aff9e', ficha: 'm29',
      coords: 'l ≈ 76,9°, b ≈ 0,6° · ~5.240 años luz del Sol',
      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m29_inv.pdf',
      top:  { x: 46.1, y: 69.0 },
      edge: { x: 31.0, y: 50.0 }
    },
    {
      id: 'm35', name: 'M35 · Cúmulo de Géminis', label: 'M35',
      color: '#8aff9e', ficha: 'm35',
      coords: 'l ≈ 186,6°, b ≈ 2,2° · ~3.870 años luz del Sol',
      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m35_inv.pdf',
      top:  { x: 50.3, y: 72.9 },
      edge: { x: 27.1, y: 49.9 }
    },
    {
      id: 'm36', name: 'M36 · Cúmulo Pinwheel (Auriga)', label: 'M36',
      color: '#8aff9e', ficha: 'm36',
      coords: 'l ≈ 174,5°, b ≈ 1,1° · ~4.340 años luz del Sol',
      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m36_inv.pdf',
      top:  { x: 49.7, y: 73.2 },
      edge: { x: 26.8, y: 49.9 }
    },
    {
      id: 'm37', name: 'M37 · Cúmulo de Auriga', label: 'M37',
      color: '#8aff9e', ficha: 'm37',
      coords: 'l ≈ 177,6°, b ≈ 3,1° · ~4.511 años luz del Sol',
      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m37_inv.pdf',
      top:  { x: 49.9, y: 73.4 },
      edge: { x: 26.6, y: 49.9 }
    },
    {
      id: 'm38', name: 'M38 · Cúmulo Starfish (Auriga)', label: 'M38',
      color: '#8aff9e', ficha: 'm38',
      coords: 'l ≈ 172,3°, b ≈ 0,7° · ~3.480 años luz del Sol',
      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m38_inv.pdf',
      top:  { x: 49.6, y: 72.6 },
      edge: { x: 27.4, y: 50.0 }
    },
    {
      id: 'm39', name: 'M39 · Cúmulo de Cygnus', label: 'M39',
      color: '#8aff9e', ficha: 'm39',
      coords: 'l ≈ 92,2°, b ≈ -2,4° · ~1.010 años luz del Sol',
      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m39_inv.pdf',
      top:  { x: 49.2, y: 70.0 },
      edge: { x: 30.0, y: 50.0 }
    },
    {
      id: 'm52', name: 'M52 · Cúmulo de Cassiopeia', label: 'M52',
      color: '#8aff9e', ficha: 'm52',
      coords: 'l ≈ 112,7°, b ≈ 0,4° · ~5.000 años luz del Sol',
      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m52_inv.pdf',
      top:  { x: 46.5, y: 71.4 },
      edge: { x: 28.6, y: 50.0 }
    },
    {
      id: 'm55', name: 'M55 · Cúmulo globular de Sagitario', label: 'M55',
      color: '#d7a4ff', ficha: 'm55',
      coords: 'l ≈ 8,8°, b ≈ -23,3° · ~17.600 años luz del Sol',
      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m55_inv.pdf',
      top:  { x: 48.1, y: 57.7 },
      edge: { x: 42.3, y: 53.1 }
    },
    {
      id: 'm57', name: 'M57 · Nebulosa del Anillo (Lira)', label: 'M57',
      color: '#5fe0c8', ficha: 'm57',
      coords: 'l ≈ 63,2°, b ≈ 14,0° · ~2.567 años luz del Sol',
      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m57_inv.pdf',
      top:  { x: 48.3, y: 69.1 },
      edge: { x: 30.9, y: 49.7 }
    }
  ];

  var OBSERVACIONES = {
    m1: [{
      // ── Observación 1 (metadatos de ESTA observación) ──
      observador: 'autor',
      fecha: null,        // p. ej. '2025-11-14'
      lugar: null,        // p. ej. 'Sierra de Grazalema'
      instrumento: null,  // p. ej. 'Dobson 305 mm'

      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m1_inv.pdf',
      defaultIndex: 1,
      entries: [
        {
          boton: 'Exploración', titulo: 'M1. Exploración',
          img: null,
          html: '<p>Síntesis de la observación. Sobre la nebulosa se identifican los rasgos descritos a lo largo de la sesión:</p><ul style="margin:8px 0;padding-left:20px;"><li>Forma romboidal</li><li>Niveles de brillo (2)</li><li>Proporción de la nebulosa</li><li>Filamentos exteriores</li><li>Arco brillante y pináculo</li><li>Bahía oscura</li><li>Río negro divisorio</li></ul><p style="font-size:13px;color:#9fb6c9;">Orientación dobson (invertida): N a las 6, O a las 9, S a las 12 y E a las 3.</p>'
        },
        {
          boton: '70x - 1º 10’ - 6.6mm', titulo: 'Nagler 31mm',
          img: 'm1_70x.webp',
          html: '<p>Empiezo describiendo el campo estelar en el que aparece la nebulosa, que es bastante rico en estrellas, con algunas de ellas llegando hasta el mismo borde del objeto; M1 se extiende en un precioso campo estrellado.</p><p>El tamaño de la nebulosa es muy pequeño con estos aumentos, no llegando a ocupar más de una décima parte del campo del ocular.</p><p>Su forma llama la atención, pues parece un romboide o un paralelogramo, es decir, está claramente inclinada hacia un extremo pero con forma más o menos cuadrada.</p><p>De su brillo, distingo la zona central como levemente más brillante que el resto pero sin mucho más detalle. En estos aumentos no se destaca ningún detalle particular.</p>'
        },
        {
          boton: '98x - 50’ - 4.7mm', titulo: 'Nagler 22mm',
          img: 'm1_98x.webp',
          html: '<p>El salto al 22mm no me ha permitido obtener muchos más detalles. La nebulosa ha aumentado de tamaño hasta ocupar una sexta parte del ocular. La forma sigue siendo la misma.</p><p>Es en su magnitud donde encuentro más diferencias. La parte central es, sin duda, más brillante que el halo que la rodea, y este halo parece fantasmagórico por la falta de brillo. Se aprecian fácilmente dos niveles de brillo: uno más brillante en su interior y otro más tenue en su exterior. La zona tenue externa es más ancha en la región entre las 1 y las 2 que en su opuesta entre las 7 y 8: se estrecha en la parte 1-2 y se ensancha en la 7-8.</p><p>Como detalle de especial atención, me parece ver con dificultad y con visión lateral que la parte más externa tiene forma filamentosa. El interior es bastante uniforme, mientras que el externo no: tengo la sensación de unos “pelitos” rodeando la parte más brillante, algo que se acentúa más en la zona de las 7-8 que en la de las 1-2.</p>'
        },
        {
          boton: '154x - 28’ - 3mm', titulo: 'Delos 14mm',
          img: 'm1_154x.webp',
          html: '<p>Ufff, cómo me gusta el salto a este ocular. Veo multitud de estrellas rodeando a la nebulosa. En concreto hay un triángulo de ellas que me sirve muy bien para delimitar su tamaño a sus 6, y muchas más, un poco más tenues, rodeando la nebulosa como a las 12. Ese detalle le da aún más belleza al objeto.</p><p>El objeto ha aumentado mucho de tamaño y se ha reducido el campo alrededor; diría que ocupa un cuarto del ocular.</p><p>La zona brillante del interior deja de verse uniforme: hay una sección aún más brillante con forma de “arco”. De este arco, o más bien semicírculo, sobresale hacia atrás una especie de pináculo que me recuerda a las rayas marinas, con el cuerpo curvo por delante y una cola larga por detrás. También me recuerda al símbolo de la resistencia de Star Wars, pero girado noventa grados.</p>'
        },
        {
          boton: '216x - 27’ - 2.1mm', titulo: 'Ethos 10mm',
          img: 'm1_216x.webp',
          html: '<p>Este ocular me sirve para confirmar cosas ya descritas y añadir nuevos detalles. Varias estrellas rodean la nebulosa a las 12 y a las 6: destaca a las 6 un grupito de tres en triángulo y a las 12 una hilera; ambas formaciones encuadran la nebulosa.</p><p>Tiene forma de paralelogramo o rectángulo tumbado (eje largo en dirección 7-8 / 1-2). Se aprecian dos regiones: una interna, brillante, casi el 80% de la nebulosa, y otra externa menos brillante con pelillos saliendo hacia afuera. La zona interna tiene forma de arco con un pináculo. Y aparece el nuevo detalle: una bahía oscura que delimita una de las zonas de la parte de atrás (a las 3) del pináculo.</p><p>Es la primera vez que observo algo así en M1. Antes del 18” era para mí un objeto insulso; ahora le descubro una riqueza que me encanta.</p>'
        },
        {
          boton: '270x - 22’ - 1.7mm', titulo: 'Ethos 8mm',
          img: 'm1_270x.webp',
          html: '<p>El siguiente salto de aumento no aporta mucho más, lamentablemente. Solamente confirmo lo ya observado: sobre todo esa forma de arco, ese pináculo y esa bahía como tres regiones distintivas, más difíciles de observar en la nebulosa.</p>'
        },
        {
          boton: '480x - 9’ - 1mm', titulo: 'Delos 4.5mm',
          img: 'm1_480x.webp',
          html: '<p>UAUUUUUU. No sé qué me pasa con estos aumentos y este ocular, pero ya me ha sorprendido más de una vez. Ahora la nebulosa ocupa prácticamente todo el campo y, como no necesito moverlo, la observo con tranquilidad.</p><p>Las partes más tenues se han atenuado, pero la bahía se ve mucho mejor. Y hay más: descubro que el arco brillante está en realidad dividido en dos por una especie de río que lo parte por la mitad. Para verlo hay que partir del pináculo más brillante, justo por debajo de la bahía; al final del pináculo hay una zona menos brillante que, seguida con visión lateral, separa la nebulosa en dos partes. Me ha sorprendido muchísimo.</p>',
          anexos: [
            { img: 'm1_480x_detalles.webp', titulo: 'Zonas comentadas a 480x: río negro, bahía y zonas 13-14 / 19-20' }
          ]
        }
      ]
    }],
    m2: [{
      // ── Observación 1 (metadatos de ESTA observación) ──
      observador: 'autor',
      fecha: null,        // p. ej. '2025-11-14'
      lugar: null,        // p. ej. 'Sierra de Grazalema'
      instrumento: null,  // p. ej. 'Dobson 305 mm'

      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m2_inv.pdf',
      defaultIndex: 1,
      entries: [
        {
          boton: 'Exploración', titulo: 'M2. Exploración',
          img: null,
          html: '<p>Síntesis de la observación. Sobre el cúmulo se identifican los rasgos descritos a lo largo de la sesión:</p><ul style="margin:8px 0;padding-left:20px;"><li>Tamaño</li><li>Forma esférica</li><li>Niveles de brillo (3)</li><li>Tamaño niveles de brillo (1/3 cada uno)</li><li>Protuberancias en el halo exterior</li><li>Contar 100 estrellas exteriores</li><li>Resolver el núcleo como estrellas individuales</li><li>Color rojizo en estrellas interiores</li></ul><p style="font-size:13px;color:#9fb6c9;">Orientación dobson (invertida): N a las 12, O a las 3, S a las 6 y E a las 9.</p>'
        },
        {
          boton: '70x - 1º 10’ - 6.6mm', titulo: 'Nagler 31mm',
          img: 'm2_70x.webp',
          html: '<p>El objeto es bastante impresionante, tiene un tamaño pequeño en este ocular ocupando solamente una décima parte del campo o quizás incluso menos. El objeto está enmarcado entre varias estrellas llamando la atención una de ellas más lejana y brillante de un color rojizo. Su forma es esférica a estos aumentos, con tres niveles de brillo que son uniformes en tamaño, o dicho de otro modo, que todos poseen más o menos el mismo "radio".</p><p>Por describirlo de fuera hacia adentro: hay un halo externo más tenue, luego la parte central más brillante con 2 zonas de brillo, una de mayor intensidad más en el centro. No puedo evitar recordar el cúmulo M72 y lo que me costó ver estrellas en su interior, tanto que con estos aumentos era imposible. En M2 son evidentes incluso a estos bajos aumentos.</p>'
        },
        {
          boton: '98x - 50’ - 4.7mm', titulo: 'Nagler 22mm',
          img: 'm2_98x.webp',
          html: '<p>Siempre es maravilloso pasar del 31mm al 22mm. El objeto se ve más grande pero no pierdo casi nada de definición y belleza de campo. Lo que más me llama la atención con esta visión es la cantidad de estrellas que puedo resolver incluso en las partes más internas del núcleo del objeto. Además me atrae mucho su color. Parecen como granitos de rubí brillando sobre una nube de algodón MUY, MUY brillante.</p><p>Porque veo las estrellas con una tonalidad rojiza, muy diferente al brillo de fondo del propio cúmulo. Y esta imagen se aprecia incluso en las partes más cercanas al núcleo. El halo exterior más tenue es 1/3 del tamaño del objeto, los otros dos tercios lo componen la zona brillante, que en el ocular anterior era capaz de dividir en 2 niveles y ahora me cuesta mucho más distinguirlos.</p><p>Así pues, el núcleo del objeto, o su zona más brillante tiene un diámetro de 2/3 quedando el tercio final con este halo más tenue de estrellas que no soy capaz de resolver. Lo fantástico de la imagen es que, en ese núcleo de 2/3 soy capaz de ver decenas de estrellas rojizas muy definidas, finas como puntas de alfiler pero de un color rojizo.</p><p>Simplemente es PRECIOSO. Luego, en el halo más externo me da la sensación de ver unos mini-bracitos (porque no son muy largos), cuento hasta 6, de estrellas que sobresalen un poco del cúmulo. Pero no lo suficiente para que pierda su forma redonda. Es un objeto muy "uniforme" en su redondez, pero con una zona central brillante bastante grande.</p>',
           anexos: [
              { img: 'm2_98x_detalles.webp', titulo: 'Zonas comentadas a 98x: Niveles de brillo 1, 2 y 3', pos: 'right' }
            ]
        },
        {
          boton: '154x - 28’ - 3mm', titulo: 'Delos 14mm',
          img: 'm2_154x.webp',
          html: '<p>Con este ocular el objeto es mucho más grande pero, como además he perdido campo aparente, me da la sensación de un mayor "acercamiento". Para mi sorpresa la imagen con este ocular me parece más pobre que la anterior. Ahora no soy capaz de resolver las estrellas del núcleo con tanta facilidad. En el ocular anterior la imagen era mucho más fina porque apreciaba unos detalles minúsculos que ahora se han vuelto mayores y, en algunos casos, no veo con tanta finura.</p><p>Por ejemplo, las estrellas rojizas del interior del núcleo del cúmulo. Ahora no brillan con tanta intensidad y se pierden un poco en el brillo del conjunto del núcleo y para resolverlas tengo que esforzarme más, usando la visión lateral con más intensidad.</p>'
        },
        {
          boton: '216x - 27’ - 2.1mm', titulo: 'Ethos 10mm',
          img: 'm2_216x.webp',
          html: '<p>Vuelvo a tener la misma impresión que el ocular anterior, no consigo la imagen tan bella que conseguía con el ocular de 22mm, a pesar de que el objeto no hace más que ganar tamaño. Está claro que es mucho más sencillo resolver las estrellas que están en su parte más externa (a diferencia de los oculares anteriores) pero las de la parte interna casi no soy capaz de resolverlas, veo solamente zonas más brillantes que pienso serán las estrellas que antes identificaba tan directamente (con el 22mm).</p><p>El objeto es bello pero bastante "soso" porque no muestra muchos detalles, al menos a mí no me lo parece. El halo más exterior está salpicado de estrellas que sobresalen en esa especie de mini-bracitos (sigo contando al menos 6) pero que en realidad son tan pequeños que bien podría ser descrito como la zona exterior del cúmulo de forma redonda sin más detalle. Quizás ese es el mayor problema de este objeto, que a pesar de ganar en aumentos no ganas en detalles y es una lástima porque la primera impresión es realmente sugerente.</p>'
        },
        {
          boton: '270x - 22’ - 1.7mm', titulo: 'Ethos 8mm',
          img: 'm2_270x.webp',
          html: '<p>La imagen ha ganado en contraste con este ocular. El objeto ya tiene un tamaño muy considerable y la visión lateral muestra una miríada de estrellas alrededor del cúmulo en su halo más externo, dónde se llegan a apreciar algo de irregularidades, con entrantes y salientes de estrellas. Lo que más me gusta es poder resolver todas las estrellas llegando casi hasta el mismo núcleo, aunque dentro de él no soy capaz de resolver ninguna, lo que es un problema porque el núcleo es muy grande.</p><p>Aunque me quedo con las decenas y decenas de estrellas que se ven en su halo más exterior. Es bonito aunque algo sosillo. Sigo pensando que el ocular de 22mm es el que me ha dado mejor imagen del objeto en general aunque era un objeto pequeño con ese ocular.</p>'
        },
        {
          boton: '480x - 9’ - 1mm', titulo: 'Delos 4.5mm',
          img: 'm2_480x.webp',
          html: '<p>Una sorpresa para el final, este es el mejor ocular tras el 22mm. El objeto casi ocupa todo el campo del ocular aunque con espacio suficiente para contemplar el fondo de estrellas colocando el objeto en el centro.</p><p>El núcleo vuelve a mostrar las estrellas del núcleo aunque no de forma tan contrastada con el 22mm y sin ese color rojizo, ahora lo que me llama la atención es la parte externa. Ese tercio de tamaño del ocular que supone su límite exterior es simplemente hermoso. Multitud de estrellas distribuidas más o menos uniformemente aunque con algunos salientes, se llegan a ver tan bien que me tienta poner a contarlas aunque es una locura porque debe haber casi un centenar o más.</p><p>A mi mente le cuesta trabajo hacerse idea de tal número de estrellas en un simple vistazo, resolviéndolas individualmente. Sin lugar a duda lo mejor del objeto es, a bajos aumentos las estrellas rojizas de su interior por encima del núcleo blanco brillantísimo, y a grandes aumentos el halo exterior con centenares de estrellas individuales.</p>'
        }
      ]
    }],
    m4: [{
      // ── Observación 1 (metadatos de ESTA observación) ──
      observador: 'autor',
      fecha: null,        // p. ej. '2025-11-14'
      lugar: null,        // p. ej. 'Sierra de Grazalema'
      instrumento: null,  // p. ej. 'Dobson 305 mm'

      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m4_inv.pdf',
      defaultIndex: 1,
      entries: [
        {
          boton: 'Exploración', titulo: 'M4. Exploración',
          img: null,
          html: '<p>Síntesis de la observación. Sobre el cúmulo se identifican los rasgos descritos a lo largo de la sesión:</p><ul style="margin:8px 0;padding-left:20px;"><li>Tamaño</li><li>Diferencia de brillo (equilibrado)</li><li>Forma esférica</li><li>Resolución de estrellas en su núcleo</li><li>Hilera de estrellas centrales</li><li>‘Y’ cerca del núcleo</li><li>Arcos externos</li><li>Dos estrellas rojizas</li><li>Arcos concéntricos</li><li>División en la hilera central</li></ul><p style="font-size:13px;color:#9fb6c9;">Orientación dobson (invertida): N a las 6, O a las 9, S a las 12 y E a las 3.</p>'
        },
        {
          boton: '70x - 1º 10’ - 6.6mm', titulo: 'Nagler 31mm',
          img: 'm4_70x.webp',
          html: '<p>¡Qué hermoso se ve M4 con grandes aperturas! Cuando he visto este objeto con otras aperturas (menores a 10”) siempre me ha parecido interesante pero sin poder sacarle mucho detalle. Como un cúmulo muy tenue del que se intuía una belleza sutil pero con la impresión de que podía obtener más del mismo si tuviera más apertura.</p><p>Este es el caso. El objeto cambia mucho con este telescopio. Incluso con el 31mm ocupa gran parte del campo del ocular, creo que más de un quinto de todo el campo. Tiene una forma muy bella porque es muy equilibrado y, a pesar de tener estrellas de diversas magnitudes, no hay tanta variación entre ellas y además hay centenares de ellas por lo que los detalles se multiplican en todo el objeto.</p><p>Me llama la atención fijándome primero en el centro del objeto la especie de línea recta de estrellas con mayor brillo que recorre el núcleo del objeto de norte a sur. A la derecha de esta línea en mi ocular hay una especie de agrupación de estrellas formando una Y, y por encima de ella y de la línea de estrellas del centro hay un par de estrellas brillantes de color más rojizo en el núcleo que también capta mi atención.</p><p>Paso a observar la parte más externa del objeto me atrae la especie de “arcos” de estrellas que veo tanto a las 7 como a las 5. La mayoría de las estrellas presentan una tonalidad fría, blancos o azules excepto contadas excepciones de color un poco más rojizo.</p>',
          anexos: [
               { img: 'm4_70x_detalles.webp', titulo: 'Zonas comentadas a 70x: Estructuras curiosas', pos: 'right' }
             ]	
        },
        {
          boton: '98x - 50’ - 4.7mm', titulo: 'Nagler 22mm',
          img: 'm4_98x.webp',
          html: '<p>¡Qué maravilla! El objeto incrementa su belleza y la diferencia entre magnitud de las estrellas se ve incrementado. El centro del objeto sigue llamándome mucho la atención con esta hilera de estrellas recorriéndolo en toda su longitud. Las dos estrellas de un rojo pálido a la 1 de esta hilera son muy bellas, sumergidas entre tantas estrellas blancas/azuladas.</p><p>También llama muchísimo la atención la gran cantidad de estrellas que se pueden resolver porque el cúmulo no tiene esa apariencia de nube indefinida de color gris que a veces acompaña a los cúmulos. Todo lo contrario, se pueden definir multitud de estrellas por todos lados como puntos muy poco brillantes pero independientes que le dan al conjunto un aspecto precioso y encantador. Dicen que la belleza está en la proporción simétrica, probablemente eso me esté ocurriendo con este objeto, la cantidad de estrellas, su distribución y su equilibrio en las distintas magnitudes hace que el objeto sea bello, simple y llanamente bello.</p><p>Es un placer pasar los minutos contemplando cada estrella de forma individual, viendo a su vez como forma parte de este conjunto. Es complicado explicar el placer que produce esta sensación de belleza de estar contemplando un objeto tan fácilmente resoluble a la vez que muestra una clara estructura de conjunto.</p><p>Una imagen preciosa con el 22mm.</p>'
        },
        {
          boton: '154x - 28’ - 3mm', titulo: 'Delos 14mm',
          img: 'm4_154x.webp',
          html: '<p>¡Uauuuu qué belleza! Pierdo un poco de color en las estrellas, todas palidecen por igual y parecen más homogéneas en color, pero a su vez más y más estrellas individuales de menor magnitud se resuelven.</p><p>Además este ocular tiene 72º de campo aparente y eso encierra al objeto haciendo que el impacto en tu mente sea mayor aún pues toda tu atención se centra solamente en el objeto en sí.</p><p>Es el centro del objeto lo que más capta tu atención pero merece la pena observar las estrellas más exteriores y los arcos que forman. En particular en la región de las 8-9 veo un par de arcos de estrellas concéntricos muy bellos, también un ramal de estrellas que sale desde la parte más interna del cúmulo, como a las 7, haciendo una especie de gancho. Y en la zona de las 5 también hay otro arco de estrellas claramente separado de la región más central del cúmulo.</p><p>Es un placer disfrutar de este espectáculo.</p>',
          anexos: [
               { img: 'm4_154x_detalles.webp', titulo: 'Zonas comentadas a 154x: Arcos', pos: 'right' }
             ]	
        },
        {
          boton: '216x - 27’ - 2.1mm', titulo: 'Ethos 10mm',
          img: 'm4_216x.webp',
          html: '<p>Aunque con el 10mm la imagen es aún más grande y los detalles los veo con más facilidad la realidad es que no obtengo mucho más de lo que ya había disfrutado con el 14mm. Es mucho más placentero observar con 100º de campo aparente y creo que las estrellas se ven un poco más brillantes y puntuales aunque quizás es sugestión. En cualquier caso creo que M4 va a pasar a ser uno de mis cúmulos favorito y la imagen que ofrecen TODOS los oculares es de una belleza cautivadora.</p>'
        },
        {
          boton: '270x - 22’ - 1.7mm', titulo: 'Ethos 8mm',
          img: 'm4_270x.webp',
          html: '<p>Este ocular si que me trae nuevas impresiones. Primero que la línea central aparece ahora “rota”, desconectada entre la parte más al norte en el que se ven varias estrellas de la misma magnitud, y la parte más al sur. En el centro de la línea se ven estrellas de magnitud parecida al resto y por ello parece que la línea se quiebra.</p><p>La famosa Y de la región de las 3 de la parte central gana protagonismo y ahora me recuerda más a una V tumbada. El contraste que voy ganando en el objeto me impresiona pues me da la sensación de ver las estrellas más brillantes que antes, como si estuviera ganando luz en vez de perdiéndola (lo que es absurdo). Pero así me engaña mi cerebro al ganar contraste.</p><p>El espacio entre las estrellas también se incrementa. Como en multitud de ocasiones tengo la sensación que el objeto ha cambiado respecto a lo que vi a bajos aumentos. Obviamente sigue siendo M4, y sigue siendo un cúmulo pero ahora estoy tan enfocado al centro del mismo que me es complicado prestar atención a las partes más externas. Una maravilla.</p>'
        },
        {
          boton: '480x - 9’ - 1mm', titulo: 'Delos 4.5mm',
          img: 'm4_480x.webp',
          html: '<p>Creo que aquí ya me estoy pasando de aumentos. Aunque este ocular me permite disfrutar sosegadamente de las partes más internas de M4, no me cautiva como con los primeros oculares (o hasta el 10mm).</p><p>Sigo disfrutando de esa hilera de estrellas ahora totalmente rota en su parte central, y lo que más me atrapa es la famosa Y transformada en V que ahora me parece un reflejo en pequeño de la constelación de Taurus. Lo resaltaré con un dibujo.</p><p>El enfoque de las estrellas se hace también muy complejo con este ocular y hace que el objeto pierda parte de su belleza al no ser capaz de ver estrellas puntuales. También es cierto que el objeto hace tiempo que pasó su meridiano y por tanto ya va acercándose al horizonte añadiendo capas de atmósfera entre su luz y mi telescopio.</p><p>Con todo merecía la pena subir hasta estos aumentos para tener otra visión del mismo.</p><p>Un cúmulo precioso M4.</p>',
          anexos: [
               { img: 'm4_480x_detalles.webp', titulo: 'Zonas comentadas a 480x: La pequeña constelación de Tauro - V', pos: 'right' }
             ]	
        }
      ]
    }],
    m5: [{
      // ── Observación 1 (metadatos de ESTA observación) ──
      observador: 'autor',
      fecha: null,        // p. ej. '2025-11-14'
      lugar: null,        // p. ej. 'Sierra de Grazalema'
      instrumento: null,  // p. ej. 'Dobson 305 mm'

      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m5_inv.pdf',
      defaultIndex: 1,
      entries: [
        {
          boton: 'Exploración', titulo: 'M5. Exploración',
          img: null,
          html: '<p>Síntesis de la observación. Sobre el cúmulo se identifican los rasgos descritos a lo largo de la sesión:</p><ul style="margin:8px 0;padding-left:20px;"><li>Tamaño</li><li>Forma esférica</li><li>HD 136202</li><li>Niveles de brillo (2)</li><li>Tamaño relativo niveles brillo (2/3 - 1/3)</li><li>Zonas menos densas en halo exterior</li><li>Arcos concéntricos exteriores</li><li>Desaparición del halo exterior</li><li>Nuevo núcleo más concentrado</li><li>Corona de estrellas</li><li>“Joya” interna (asterismo de 4 estrellas)</li></ul><p style="font-size:13px;color:#9fb6c9;">Orientación dobson (invertida): N a las 6, O a las 9, S a las 12 y E a las 3.</p>'
        },
        {
          boton: '70x - 1º 10’ - 6.6mm', titulo: 'Nagler 31mm',
          img: 'm5_70x.webp',
          html: '<p>¡M5 es toda una belleza con grandes aperturas! Los detalles que consigo apreciar son magníficos la verdad.</p><p>Empiezo, como es habitual, fijándome en el campo del objeto. En mis notas de voz lo describo como un campo pobre excepto por una estrella muy brillante situado a la 1 del cúmulo. Se trata de la estrella 5 Serpentis ó HD 136202, de magnitud 5,1 situada a 81 años luz de nuestro sistema solar, por lo que no extraña su brillo. Es una bella compañera al cúmulo, que destaca sobrecogedoramente en este campo tan pobre.</p><p>El cúmulo es grande, pues ocupa más de una quinto del ocular y aparece muy extenso, con un núcleo condenso.</p><p>La forma es circular, típica de los cúmulos globulares pero su brillo y forma está distribuido de forma muy llamativa. No es el típico cúmulo globular abigarrado como una inmensa esfera de estrellas tan cercanas que cuesta trabajo resolverlas. No. Aquí el núcleo es muy brillante y pequeño, mientras que el halo exterior es muy grande y tenue (en mis notas de voz me digo que el núcleo puede ser menor a una cuarta parte del tamaño completo del objeto). Además en el halo exterior se aprecian decenas y decenas de estrellas brillantes, claramente separadas unas de otras. De hecho, dentro del halo exterior, se aprecian zonas de más y menos brillo, dando la apariencia de que el cúmulo posee “brazos”. Éstos parecen rotar en sentido contrario a las agujas del reloj. Además parece que la zona del halo exterior de las 12 y 6 posee estrellas más brillantes que la de las 9 y 3, mostrando uno de las primeras particularidades del cúmulo.</p><p>De los “brazos” cabe destacar que parecen surgir de la región de las 9 y 3 para bajar hacia las 6 o subir hacia las 12 y desde ahí extenderse en horizontal. Es precioso fijarse en esos detalles con tan pocos aumentos.</p><p>Tengo la fortuna de disponer de un seeing espléndido mientras observo el cúmulo y ello me permite conseguir un nivel de enfoque finísimo (además de la buena colimación que he podido realizar). Por este motivo la imagen es sobrecogedora. En el núcleo brillante aparecen claramente distinguibles estrellas rojizas hermosísimas, como rubís brillando encima de una bola blanca de algodón inmaculado. Cuento casi una quincena de ellas. Debo enfocar muy bien la vista para lograr esta imagen tan espléndida y eso hace que desaparezca parte del brillo tenue del halo exterior. Así que termino disfrutando durante minutos y minutos del juego de usar visión lateral y directa para contemplar cada detalle. Me siento eufórico con una imagen tan magnífica a pesar de los bajos aumentos. PRECIOSO.</p>',
          anexos: [
               { img: 'm5_70x_detalles.webp', titulo: 'Zonas comentadas a 70x: Niveles de brillo', pos: 'right' }
             ]	
        },
        {
          boton: '98x - 50’ - 4.7mm', titulo: 'Nagler 22mm',
          img: 'm5_98x.webp',
          html: '<p>¡Sorprendente! Aunque debo decir que este ocular no me da un contraste cromático tan bello como el anterior, algo que ya he percibido en otras ocasiones. Es decir, las estrellas ahora aparecen de un rojo más pálido, como más grisáceas que el ocular anterior, a pesar de distinguirlas mejor porque el objeto ha ganado en tamaño.</p><p>La imagen sigue siendo una belleza, además se acentúa la sensación de estar viendo una galaxia en la que se resuelven las estrellas.</p><p>Fijándome con más atención el efecto de brazos se da principalmente en la región de las 6 dónde de forma reiterada se repite un patrón. Una serie de estrellas brillantes definen un camino que va desde la posición de las 9, bajando hasta las 6 y continuando en horizontal casi hasta el borde del objeto. Esto se repite hasta en tres ocasiones. Es un efecto precioso.</p><p>En mis notas de voz también recojo que no distingo detalle nuevo y no obstante me quedo minutos y minutos delante del ocular pues, el simple hecho de ver el objeto más grande me cautiva y me deja embobado con la visión.</p>'
        },
        {
          boton: '154x - 28’ - 3mm', titulo: 'Delos 14mm',
          img: 'm5_154x.webp',
          html: '<p>Como siempre el uso del 14mm muestra un cambio radical en la imagen, especialmente porque el objeto se “expande” hasta ocupar casi todo el ocular. La vista es fabulosa. El seeing de esta noche se muestra realmente bueno y en cúmulo globulares se nota y muchísimo.</p><p>Uno de los detalles que en este nuevo ocular destaca es una serie de brazos paralelos en la zona de las 6. En el esquema de la derecha intento reflejar estos tres brazos que consigo distinguir. Obviamente no son brazos reales sino un juego que realiza mi mente con la distribución aleatoria que presenta el cúmulo. A pesar de ser consciente de esta ilusión la imagen no dejaba de cautivarme. Además tu atención era capturada por la cantidad de estrellas que se apreciaban en el halo exterior. Era todo un reto dejar de contarlas para centrarse en otros detalles.</p><p>Con esfuerzo dirigí mi atención a otra de las zonas que se destaca a estos aumentos, el núcleo del cúmulo. Me fijé especialmente en un asterismo que para mí fue la joya que se escondía dentro de M5. Cuatro estrellas situadas a las 9 del núcleo del cúmulo que me recordaban a la constelación de Tauro.</p><p>Me sorprendía descubrir un detalle tan fino, tan delicado en una zona tan interna del cúmulo. Además las estrellas seguían mostrando un color amarillo pálido, más débiles que como se mostraban en el 31mm pero aún con una diferencia de tonalidad respecto al resto de estrellas. En conjunto era un espectáculo maravilloso para la vista. Se me pasaban los minutos casi sin darme cuenta disfrutando de la imagen.</p>',
          anexos: [
               { img: 'm5_154x_detalles.webp', titulo: 'Zonas comentadas a 154x: Brazos y asterismo'}
             ]	
        },
        {
          boton: '216x - 27’ - 2.1mm', titulo: 'Ethos 10mm',
          img: 'm5_216x.webp',
          html: '<p>Con el 10mm noto que la visión es incluso mucho mejor que el ocular anterior. Veo el objeto mucho más grande, sin llegar a apreciar ninguna pérdida de brillo y con una definición y puntualidad en las estrellas impresionante. Sin embargo parece que el color de las estrellas es ahora incluso un poco más pálido.</p><p>Las estrellas del núcleo son más fáciles de distinguir pero con un contraste menor, a pesar de tener el mismo brillo aparente es como si hubiera menos diferencia de brillo entre todas las partes del objeto.</p><p>Otro aspecto a destacar es que me da la sensación que el núcleo ha reducido su tamaño. Me doy cuenta al tratar de situar el asterismo del que hablaba en el anterior ocular. Antes (en el ocular de 14mm pero creo que también en el de 22mm e incluso con el 31mm) lo veía en el borde del núcleo del cúmulo, en su zona de las 9. Sin embargo ahora lo veo más centrado dentro del núcleo.</p><p>He tenido que dedicar varios minutos para entender lo que estaba pasando. Creo que, aunque al principio no me haya dado cuenta, efectivamente el objeto ha perdido contraste en general y con ello brillo. Por tanto la región más brillante ya no es el núcleo sino una región dentro del núcleo menor que lo que veía anteriormente.</p><p>Este efecto creo que viene reforzado por la región de las 5 que muestra una zona de menor brillo, dando la impresión que el núcleo es la parte más interna.</p><p>Me encanta descubrir que distintos oculares te muestran distintas imágenes de un mismo objeto.</p>',
          anexos: [
               { img: 'm5_216x_detalles.webp', titulo: 'Zonas comentadas a 216x: Cambio de tamaño del núcleo', pos: 'right'}
             ]	
        },
        {
          boton: '270x - 22’ - 1.7mm', titulo: 'Ethos 8mm',
          img: 'm5_270x.webp',
          html: '<p>A mayor aumentos más detalles se revelan en el objeto.</p><p>En esta ocasión me fijo en la zona externa del núcleo del objeto que está más próxima a lo que ahora considero como la nueva parte central. Esta región es preciosa y hay multitud de estrellas que rodean la parte central, creando una especie de “corona solar”. Sinceramente es una preciosidad poder dedicar minutos y minutos contemplando las diminutas estrellas brillando contra el fondo luminoso, blanco del cúmulo.</p><p>Igualmente me deja embobado la extensión y la forma de los brazos de M5. Son caminos de estrellas de magnitud similar pero todas ellas totalmente resolubles con lo que puedes ir contándolas mientras contemplas cómo “debajo” de ellas aparecen otras estrellas de mucha menor magnitud pero en mayor número que dan esa apariencia de nubosidad.</p><p>Por último vuelvo a lo que he definido como la joya dentro de M5, ese asterismo formado por cuatro estrellas que en mis notas de voz describo como el tesoro oculto que se esconde en el interior de la caja brillante que es el núcleo de M5. Lamentablemente ya no veo colores alguno en las estrellas pero no importa pues su diferencia en magnitudes le da una belleza peculiar. Eso y la puntualidad de cada una de ellas que parecen cabezas de alfiler brillantes.</p>'
        },
        {
          boton: '480x - 9’ - 1mm', titulo: 'Delos 4.5mm',
          img: 'm5_480x.webp',
          html: '<p>Voy llegando al límite de lo que puedo llegar a enfocar y la vista se vuelve un poco menos nítida. Aún así disfruto de una imagen única. Ahora no soy capaz de ver el objeto entero en el ocular, sino que debo desplazarme poco a poco por el cúmulo para llegar a contemplar las partes más externas.</p><p>No obstante lo que me llama más la atención a tan altos aumentos es la zona central que, al perder también un poco más de brillo, te permite observar con más facilidad las estrellas más interiores. Ya que éstas siguen destacando respecto al fondo del núcleo del cúmulo. He perdido la puntualidad de las estrellas lamentablemente, con lo que la belleza de la imagen se ha visto reducida por ese efecto, pero a cambio estás totalmente inmerso en el objeto. Mires dónde mires ves estrellas del mismo y es, sencillamente, ESPECTACULAR.</p><p>No sé qué más características explicar del objeto, quizás es importante destacar las partes que se deberían observar que, según mi criterio, serían:</p><ol style="margin:8px 0;padding-left:20px;"><li>Los brazos, caminos uniformes de estrellas de brillo similar que surgen de las zonas de las 9 y 3 respectivamente para rodear el objeto hacia las 6 y 12.</li><li>La diferencia en cantidad de estrellas entre la zona N-S y la zona E-O.</li><li>La corona de estrellas que rodea al núcleo más brillante.</li><li>Las partes más tenues dentro de las áreas más brillantes que se muestran como zonas oscuras del núcleo brillante.</li><li>Las estrellas que se resuelven en el interior del propio núcleo, como joya escondida el asterismo de cuatro estrellas.</li></ol><p style="font-size:13px;color:#9fb6c9;"><em>Por último dejo esta magnífica imagen del interior del cúmulo por si a alguien le pudiera servir de referencia para intentar descubrir algún detalle más. Esta imagen corresponde con la misma región que se mostraba con el Delos de 14mm. Obviamente no conseguí ver esta imagen, con tanta nitidez ni tantas estrellas, pero si algunos detalles. Un objeto magnífico para noches con un seeing espectacular.</em></p>',
          anexos: [
               { img: 'm5_480x_detalles.webp', titulo: 'Zonas comentadas a 480x: Estrellas individuales', pos: 'right'}
             ]	
        }
      ]
    }],
    m8: [{
      // ── Observación 1 (metadatos de ESTA observación) ──
      observador: 'autor',
      fecha: null,        // p. ej. '2025-11-14'
      lugar: null,        // p. ej. 'Sierra de Grazalema'
      instrumento: null,  // p. ej. 'Dobson 305 mm'

      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m8_inv.pdf',
      defaultIndex: 1,
      entries: [
        {
          boton: 'Exploración', titulo: 'M8. Exploración',
          img: null,
          html: '<p>Síntesis de la observación. Sobre la nebulosa se identifican los rasgos descritos a lo largo de la sesión:</p><ul style="margin:8px 0;padding-left:20px;"><li>Tamaño</li><li>Zonas 1, 2 y 3</li><li>Bahía en forma de U</li><li>Volumen en la nebulosa</li><li>Río oscuro</li><li>Ondas en la orilla (zona 1)</li><li>Capas en la orilla (zona 2)</li><li>Piedras brillantes (estrellas) en el río oscuro</li><li>Nebulosa del reloj de arena</li><li>Curva en el río oscuro</li><li>Estrechamiento del río en su origen</li><li>Ensanchamiento en la desembocadura del río</li><li>“Puerto” natural o ensenada en la orilla zona 1</li></ul><p style="font-size:13px;color:#9fb6c9;">Orientación dobson (invertida): N a las 6, O a las 9, S a las 12 y E a las 3.</p>'
        },
        {
          boton: '70x - 1º 10’ - 6.6mm', titulo: 'Nagler 31mm',
          img: 'm8_70x.webp',
          html: '<p>Empiezo la observación a las 0:10 de la noche tras colimar decentemente el telescopio aunque el espejo aún no se ha aclimatado o bien hay más turbulencia de la deseada en estos primeros minutos de la noche ya que las estrellas no termino de verlas realmente puntuales. Lo primero que me llama la atención en M8 es el tamaño de la nebulosa, la recordaba más pequeña pero claro es que estoy viendo “más” nebulosa, el pasar de un 12” a un 18” se nota increíblemente pero lo más llamativo es la cantidad de detalles nuevos que aprecias en objetos que creías archiconocidos. Uso los adjetivos de INMENSA y ENORME al lado del cúmulo abierto, y me digo a mí mismo que no estoy acostumbrado a verla de ese tamaño. Voy por orden y empiezo fijándome primero en el cúmulo abierto. Lo describo como extenso, con pocas estrellas pero muy brillantes y “esparcidas”, con forma de “mariquita” pues hay un par de estrellas brillantes que están un poco más lejos del cúmulo, el cuál me parece que tiene una forma un tanto redonda y como si estas 2 estrellas fueran las “antenas” del bichito visto desde arriba. Me refiero a NGC 6530. Cuento unas 12 estrellas brillantes por otras tantas de una magnitud un poco menor y otras tantas más tenues, más o menos esa es su dimensión.</p><p>Respecto a la nebulosa destaco 3 niveles de brillo, la zona más brillante y si consideramos la laguna como la zona oscura central, sería su “orilla” oeste, en la que destaca un par de estrellas muy brillantes dentro de la nebulosa. La referencia que uso para ellas es, de sur a norte, estrella brillante con 2 estrellas más tenues a sus 8 bastante cercanas. A las 11 de esta estrella brillante se encuentra otro par de estrellas, algo más luminosas que el par anterior y más separadas. Siguiendo ese camino, o la linea que define estas 2 últimas estrellas hay otra estrella un poco menos brillante que la primera descrita (la que estaba más al sur) que va a ser la “sorpresa” de la noche. Esta sería la primera zona más brillante de la nebulosa. A continuación aparece la laguna como un “borde” o “río” oscuro que divide ambas nubosidades brillantes, que además, en su interior, contiene más estrellas de distintas magnitudes, pocas pero muy bonitas.</p><p>Tras la laguna, aparece la segunda zona de brillo, menos intenso que la primera pero claramente visible, sería la orilla “este” de la nebulosa, aquí las estrellas están más esparcidas y son de menor magnitud, tiene una forma alargada delimitando la laguna.</p><p>El tercer nivel de brillo lo descubro como algo que jamás había visto, alejado de la nebulosa y del cúmulo, al sur de la “orilla” oeste de la nebulosa hay una estrella brillante de color rojizo, a los pies de la misma hay una nubosidad extensa, de tamaño parecido a la orilla “este” (la menos brillante) pero más estrecha. Me recuerda levemente a la nebulosa del velo aunque un poco más ancha, pero es esa misma imagen de “nebulosa a los pies de una estrella brillante” la que representa a esta tenue nubosidad. Por último menciono también la “bahía” de la zona oeste de la nebulosa, un entrante en forma de U que nunca había observado.</p>'
        },
        {
          boton: '98x - 50’ - 4.7mm', titulo: 'Nagler 22mm',
          img: 'm8_98x.webp',
          html: '<p>Al crecer en aumentos por el cambio de ocular incremento, obviamente, el tamaño de la nebulosa que ya ocupa medio campo del ocular, además el cúmulo se puede separar mejor viendo con más detalle cada componente del mismo que no es muy rico. Confirmo que la zona más brillante es la “orilla” oeste como decía anteriormente. Describo lo siguiente en mis notas: “Zona de brillo tenue, laguna (que es una zona oscura, con algunas estrellas en su interior), zona de brillo muy intensa, con estrellas muy grandes, muy brillantes, de las 2 estrellas más brillantes, la que está más al sur es dónde se observa la zona más brillante, sin ninguna duda, de la nebulosa. Es justamente en esa zona desde la que parte la bahía que describía en los aumentos anteriores, en forma de U”.</p><p>Confirmo con mucho más detalle la nebulosa que hay bajo la estrella brillante de color rojizo. La estrella está como a la distancia de la mitad del campo del ocular. Esa zona de la nebulosa que, hasta este momento jamás había visto en mi vida, es más tenue que la “orilla” este de la laguna, pero, no obstante, aproximadamente del mismo tamaño. Uso el adjetivo GOZADA para describir el contraste de brillos que veo en toda la nebulosa.</p><p>Estoy disfrutando de lo lindo.</p>'
        },
        {
          boton: '154x - 28’ - 3mm', titulo: 'Delos 14mm',
          img: 'm8_154x.webp',
          html: '<p>La primera palabra que uso es FLIPANTE, la segunda: PRECIOSO. Alucino con el tamaño de la nebulosa a estos aumentos y la cantidad de detalles que consigo diferenciar. Me fijo con atención en la estrella que comentaba desde el principio, esa que se encuentra en la orilla oeste en la zona sur de la nebulosa, donde hay la mayor concentración de brillo. Digo textualmente: “Es impresionante, la nebulosa la rodea y, en cambio, alrededor de la propia estrella hay como un halo más oscuro. Es algo precioso, espectacular”. A estos aumentos, lo que más consigo de esa zona de especial interés es, contemplar que la estrella no está “rodeada” de forma uniforme por la nebulosa oscura, sino más bien que la zona oscura está en la región oeste y, sin embargo en su parte más al este es donde está la zona de mayor brillo.</p><p>Paso a continuación a fijarme en la Laguna y describo que siempre me había parecido bastante uniforme, es decir simplemente un “río” con orillas más o menos rectas que pasa entre dos nebulosas. Ahora la visión es totalmente distinta. Primero la sensación de volumen. No parece que esté viendo algo plano, sino más bien algo en tres dimensiones sobre lo que me asomo como el que se asoma al borde de un precipicio, es muy bonita esa sensación de volumen. Además veo estructura, los bordes, sobretodo en la zona de la orilla este son irregulares, con “ondas” o S, con la laguna entrando y saliendo de la “costa”. Además la costa oeste me parece como “difuminada”, como si tuviera distintas “capas” cada cual más tenue. Añado que de momento este es el ocular en el que la visión es más bella, por la complejidad que muestra.</p><p>Por último vuelvo mi vista sobre la famosa bahía al oeste de la nebulosa, la cual me sigue llamando mi atención por comparación a la laguna.</p>'
        },
        {
          boton: '216x - 27’ - 2.1mm', titulo: 'Ethos 10mm',
          img: 'm8_216x.webp',
          html: '<p>Al cambiar de ocular sigo poniendo adjetivos, en este caso la palabra ESPECTACULAR. No dejo de sorprenderme con la estrella que os describo (costa oeste de la nebulosa en su zona sur) donde se concentra mucho el brillo de la nebulosa. A estos aumentos indico que también me parece ver ríos oscuros en el halo que rodea la estrella. El ejemplo que se me viene a la mente es el símbolo de la resistencia de las películas de Starwars, ya que me parece ver como una especie de pináculo que se acerca hacia la estrella y luego los brazos de más brillo que ya rodean a la estrella. O, también digo que puede ser uniforme en todo su alrededor excepto por estos “ríos” oscuros que se alejan de la estrella hacia la nebulosa y que da esta forma tan particular. Con los 10mm aún veo la “bahía” y aún veo más estructuras complejas en las costas de la nebula. Es realmente complejo, y me sorprende mucho el poco brillo que he perdido en la nebulosa, a pesar de los aumentos que sigo añadiendo.</p>'
        },
        {
          boton: '270x - 22’ - 1.7mm', titulo: 'Ethos 8mm',
          img: 'm8_270x.webp',
          html: '<p>Es alucinante, por mucho que aumente la magnitud, no por ello la nebulosa pierde brillo ni “poderío” sino todo lo contrario, cada vez aparece mas compleja y con más detalle que observar. Si que indico en mis notas de voz que ahora la nebulosa me parece un poco más plana, y no tengo esa visión de volumen que apreciaba con el 14mm, en el que veía como si los bordes de la nebulosa, las orillas de la laguna, estuvieran creadas por “riscos” que sobresalen en vertical de la laguna, pero si me ha parecido más voluptuoso, aunque es difícil de describir. Vuelvo a mi estrella preferida y añado más detalles. Ahora digo que me parece el famoso “reloj de arena”, es decir veo, al lado de la estrella, 2 lóbulos brillantes y justo en el sitio dónde está la estrella hay como una zona negra que entra en estos 2 lóbulos creando la conocida imagen de un reloj de arena que se estrecha en su centro. Es magnífico.</p><p>Con estos aumentos sigo viendo la bahía en forma de U y la nebulosa a los pies de la estrella rojiza, aunque ya con bastante dificultad.</p>'
        },
        {
          boton: '480x - 9’ - 1mm', titulo: 'Delos 4.5mm',
          img: [
            { archivo: 'm8_480x_oeste.webp', etiqueta: 'Región oeste — estrella y reloj de arena' },
            { archivo: 'm8_480x_este.webp', etiqueta: 'Región este — la laguna' }
          ],
          imgMode: 'tabs',
          html: '<p>Cuando llego al delos de 4,5mm ya es cuando casi me da un patatús de tanta belleza. Son las 0:52, llevo más de 40min con el mismo objeto y aún me quedan otros 10min más de observación. 1h para un solo objeto, no está mal. Digo que si antes era espectacular ahora ya es: “la leche”. El problema con el 4.5mm es que aparece enorme la nebulosa, el enfoque es complicado, y vibra muchísimo. La estrella que os anunciaba iba a ser la protagonista (fijaros ahora en los 2 pares de estrellas a las 8 y a las 11 de la estrella que queda en el centro a la derecha de la imagen). Y lo es por la estructura que tiene en su zona este. Es realmente un reloj de arena, son dos lóbulos que se estrechan en el centro e incluso me parece que los mismos están separados por una línea negra que los separa, abriéndose en abanico desde esa zona central estrecha separada por un fino hilo negro. Es MAGNÍFICA esa parte.</p><p>Luego me centro en la laguna en si misma y menciono que no es recta ni mucho menos sino curva, girando hacia el oeste entrando por el norte y saliendo por el sur, parece que la entrada es más ancha que la salida, en donde hay una estrella que ayuda aún más a esa imagen de “estrechamiento” de la entrada de la nebulosa. La zona este con los detalles que se ven en la orilla es increíble, esos “puertos naturales” de la laguna en la costa son magníficos, con una forma como una ensenada. Además me parece ver distintos niveles de brillo como por capas en las orillas con un brillo muy muy tenue que “estrecha” la laguna (eso en la zona oeste principalmente), y por eso ahora parece más un río ancho que una laguna en sí.</p><p>A estos aumentos ya no consigo ver ni la “bahía”, ni la nebulosa a los pies de la estrella rojiza. Es una sensación espectacular poder ponerle tantos aumentos al objeto, porque voy, literalmente, navegando con el motor por toda la nebulosa, aunque la vibración me robe algunos segundos de observación. Merece muchísimo la pena realizar este juego de subir y bajar de aumentos porque la imagen que me llevo de M8 es espectacular como jamás lo había podido disfrutar.</p>'
        }
      ]
    }],
    m9: [{
      // ── Observación 1 (metadatos de ESTA observación) ──
      observador: 'autor',
      fecha: null,        // p. ej. '2025-11-14'
      lugar: null,        // p. ej. 'Sierra de Grazalema'
      instrumento: null,  // p. ej. 'Dobson 305 mm'

      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m9_inv.pdf',
      defaultIndex: 1,
      entries: [
        {
          boton: 'Exploración', titulo: 'M9. Exploración',
          img: null,
          html: '<p>Síntesis de la observación. Sobre el cúmulo se identifican los rasgos descritos a lo largo de la sesión:</p><ul style="margin:8px 0;padding-left:20px;"><li>Tamaño</li><li>Halo central con estrellas exteriores</li><li>Barnard 64</li><li>2 estrellas doradas</li><li>Hilera de estrellas que rompe la forma esférica</li><li>Barra central en forma de f</li><li>Línea oscura central</li><li>Mantis religiosa</li><li>Contar estrellas en el núcleo</li></ul><p style="font-size:13px;color:#9fb6c9;">Orientación dobson (invertida): N a las 6, O a las 9, S a las 12 y E a las 3.</p>'
        },
        {
          boton: '70x - 1º 10’ - 6.6mm', titulo: 'Nagler 31mm',
          img: 'm9_70x.webp',
          html: '<p>M9 está a los pies de una nebulosa oscura o Barnard 64 que se llega a apreciar en el ocular de 31mm. El campo es muy rico en estrellas pero hay una región partiendo desde las 11 que se extiende hacia las 9 en la que las estrellas desaparecen. La calidad del cielo no es suficiente para ver esta zona más oscura que el propio fondo de cielo, con lo que no destaca como en otras ocasiones que he visto un objeto Barnard en mejores cielos. Sin embargo, es evidente la falta de estrellas que delimita esta región de polvo estelar. Y es curioso ver ambos objetos en el mismo campo del ocular.</p><p>Respecto al tamaño, el cúmulo globular es bastante pequeño, no me extraña pues está a 26.000 años luz de nosotros. En el ocular no llega a ocupar ni 1/10 del campo del mismo.</p><p>Su forma es la típica de los cúmulos globulares, una esfera compacta de estrellas, moteada. Es decir se pueden llegar a intuir qué hay estrellas en su interior sin llegar a resolverlas completamente.</p><p>Y respecto a su magnitud es un objeto tenue aunque resalta claramente en el ocular sobre todo por la concentración de estrellas. No hay niveles de brillo diferentes sino que muestra un aspecto bastante uniforme. O mejor dicho, se resuelven algunas estrellas del halo exterior, pero casi todo el brillo proviene de la zona central del cúmulo en la que se intuyen estrellas individuales que no consigo resolver con estos aumentos.</p>'
        },
        {
          boton: '98x - 50’ - 4.7mm', titulo: 'Nagler 22mm',
          img: 'm9_98x.webp',
          html: '<p>El cúmulo ha incrementado considerablemente su tamaño siendo bastante más agradable su observación y permitiendo describirlo bastante mejor.</p><p>Su forma sigue siendo totalmente esférica, ningún cambio en este aspecto.</p><p>Pero su brillo y las estrellas que se resuelven ha cambiado bastante. Ahora soy capaz de ver estrellas por todo el objeto, no solamente en su borde más externo. Es cierto que el viento se ha calmado y ayuda a ver con más detalle el núcleo del cúmulo. En concreto veo en su región de las 12 un par de estrellas que se resuelven muy bien y también hay una hilera de estrellas que se acercan a ellas. Es magnífico poder diferenciar tan bien las estrellas que componen el cúmulo pues su puntualidad y color levemente más dorado las hace resaltar cómo gemas en una nube de algodón. Utilizando la visión lateral puedo hacer aparecer y desaparecer las zonas más tenues del cúmulo dejando siempre fija las estrellas. Con este juego me parece observar también una curiosa hilera de estrellas a las 7 que modifica ligeramente la forma del cúmulo rompiendo su forma redonda.</p><p>A pesar de su poco tamaño resulta interesante por la cantidad de estrellas que puedo resolver sin mucho esfuerzo.</p>',
          anexos: [
               { img: 'm9_98x_detalles.webp', titulo: 'Zonas comentadas a 98x: Estructura de estrellas individuales', pos: 'right'}
             ]	
        },
        {
          boton: '154x - 28’ - 3mm', titulo: 'Delos 14mm',
          img: 'm9_154x.webp',
          html: '<p>Es magnífico poder encajar el objeto con este ocular pues empieza a tomar un tamaño significativo.</p><p>Para poder delimitar la parte más interior del cúmulo utilizo un par de asterismos que me llaman la atención. El primero es sobre la 1 son una serie de tres estrellas en línea. El segundo es sobre las 10 un par de estrellas muy juntas. Y a las 7 la hilera de estrellas ya mencionadas.</p><p>Además de esas estrellas también soy capaz de resolver otras en el centro, y con ellas soy capaz de percibir formas curiosas. Estas formas son debidas a una acumulación de brillo por estrellas un poco más brillante en el propio centro del núcleo. El que más me llama la atención es la forma de f alargada o del símbolo de la integral matemática que atraviesa el núcleo del objeto de norte a sur. Al jugar con la visión lateral el objeto empieza a perder su uniformidad y aparece como multitud de estrellas individuales agrupadas hacia su centro. La visión lateral también me permite percibir los distintos niveles de brillos en las estrellas que están en el propio interior del cúmulo globular.</p><p>Y quizás esa sea una de las cosas que más me llama la atención de los cúmulos globulares de este tipo, es decir que son fácilmente resolubles. Su falta de uniformidad en el núcleo. Es muy complicado de describir pero al final es ser consciente que esa nube de brillo en realidad son miles, decenas de miles de estrellas individuales ocupando un espacio mínimo. Alucinante. Soy capaz de contar hasta veinte estrellas individuales en su interior.</p>',
          anexos: [
               { img: 'm9_154x_detalles.webp', titulo: 'Zonas comentadas a 154x: Estructura de estrellas', pos: 'right'}
             ]	
        },
        {
          boton: '216x - 27’ - 2.1mm', titulo: 'Ethos 10mm',
          img: 'm9_216x.webp',
          html: '<p>Ojo, que no quiero llevar a confusión el cúmulo sigue siendo pequeño en los distintos oculares, incluso en este ocular no llega a ocupar un cuarto del mismo, pero permite resolver tan bien las estrellas que realmente llama la atención y te parece mayor de lo que es.</p><p>Con este ocular simplemente confirmo todo lo que ya he descrito con el 14mm sin llegar a aportar más detalles. Simplemente la observación es mucho más cómoda pues el objeto es más grande y el campo que dispongo más amplio, pero los detalles son los mismos, sin nada más qué destacar.</p>'
        },
        {
          boton: '270x - 22’ - 1.7mm', titulo: 'Ethos 8mm',
          img: 'm9_270x.webp',
          html: '<p>Sin duda M9 requiere de grandes aumentos para mostrar su belleza interior ya que al pasar a los 270x descubro nuevos detalles.</p><p>Me doy cuenta que la forma esférica uniforme del cúmulo que presentaba con el 31mm empieza a desaparecer, para ser sustituida por una agrupación inconexa de estrellas de diversas magnitud que dibujan formas brillantes y huecos más tenues.</p><p>Por intentar describir mejor el objeto: se trata de un cúmulo globular con un halo exterior extenso del mismo tamaño de su núcleo central, en el que se resuelven estrellas hasta la parte más interior del mismo. Las estrellas están agrupadas formando hileras o curvas como brazos que sobresalen de la región más brillante. Se resuelven tantas de ellas que se pueden contar decenas de distintas magnitudes.</p><p>Se aprecia su forma esférica pero está muy lejos de ser un cúmulo con un alto grado de uniformidad.</p>'
        },
        {
          boton: '480x - 9’ - 1mm', titulo: 'Delos 4.5mm',
          img: 'm9_480x.webp',
          html: '<p>Maravilloso cómo ha cambiado el objeto con estos aumentos. Es uno de los cúmulos globulares que más agradece el llegar hasta altos aumentos porque permite identificar más claramente las estrellas.</p><p>Ahora veo una formación peculiar de estrellas que me hace recordar a la cabeza de una mantis religiosa, justo en el norte del cúmulo globular, con tres estrellas muy juntas. Esa parte sería la zona final norte del símbolo de la integral que veía antes. En la parte sur el antiguo símbolo integral lo veo mucho más curvo y separándose claramente del centro del núcleo. Por último, en la parte más interior del cúmulo veo como las estrellas se separan unas de otras por una línea oscura.</p><p>También cuento decenas y decenas de estrellas alrededor de estas áreas más brillantes. Es increíble poder resolver estrellas con tanta facilidad en tantas partes del cúmulo. Creo que el seeing de esta noche debe ser bastante bueno pues realmente se siguen viendo las estrellas muy puntuales incluso a 480x.</p><p>Es magnífico cómo he podido entrar tan profundo en el cúmulo y obtener información del mismo. Maravilloso, sinceramente.</p>',
          anexos: [
               { img: 'm9_480x_detalles.webp', titulo: 'Zonas comentadas a 480x: Mantis religiosa', pos: 'right'}
             ]	
        }
      ]
    }],
    m10: [{
      // ── Observación 1 (metadatos de ESTA observación) ──
      observador: 'autor',
      fecha: null,        // p. ej. '2025-11-14'
      lugar: null,        // p. ej. 'Sierra de Grazalema'
      instrumento: null,  // p. ej. 'Dobson 305 mm'

      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m10_inv.pdf',
      defaultIndex: 1,
      entries: [
        {
          boton: 'Exploración', titulo: 'M10. Exploración',
          img: null,
          html: '<p>Síntesis de la observación. Sobre el cúmulo se identifican los rasgos descritos a lo largo de la sesión:</p><ul style="margin:8px 0;padding-left:20px;"><li>Tamaño</li><li>Forma esférica</li><li>Color amarillo pálido de las estrellas exteriores</li><li>Niveles de brillo (2)</li><li>Proporción de los niveles brillo (3/4 - 1/4)</li><li>Granos de cuarzo en un fondo arenoso</li><li>Hileras paralelas de estrellas que parten del núcleo</li><li>Dos estrellas centrales en el núcleo</li></ul><p style="font-size:13px;color:#9fb6c9;">Orientación dobson (invertida): N a las 9, O a las 12, S a las 3 y E a las 6.</p>'
        },
        {
          boton: '70x - 1º 10’ - 6.6mm', titulo: 'Nagler 31mm',
          img: 'm10_70x.webp',
          html: '<p>El campo de M10 es muy pobre en estrellas, distingo menos de una decena de ellas.</p><p>Sin embargo ello es compensado con el tamaño del objeto ya que el cúmulo es bastante grande. Diría que ocupa una cuarta parte del ocular, es decir alrededor de 20 minutos de arco. Su forma es totalmente esférica, típica de los cúmulos globulares.</p><p>Es muy brillante y se distingue fácilmente dos niveles de brillo con una zona central muy brillante mientras que el halo exterior tampoco es tenue, sino que destaca claramente.</p><p>Quizás lo que más llama la atención es la facilidad a la hora de resolver estrellas, se ven decenas de ellas en el halo más externo. Además su color no es azulado sino más bien amarillento, pero bastante pálido. Así que hacen un bello contraste con la nube blanca de halo que las rodea.</p><p>Impresiona que incluso a estos bajos aumentos se vea tan bien el cúmulo. Por ello lo describo como uno de los cúmulos globulares más significativos y típicos. Y a pesar de ello no termina de impresionar.</p><p>En mis notas de voz recojo que no me emociona tanto porque no parece un reto. Es decir no es un objeto pequeño como M80 que te anima a añadir aumentos, ni un objeto tenue como M107 que te reta a observarlo con detalle, es simplemente un cúmulo globular típico.</p><p>Pero no por ello es un objeto aburrido. Simplemente que parece que no presenta ningún reto.</p>'
        },
        {
          boton: '98x - 50’ - 4.7mm', titulo: 'Nagler 22mm',
          img: 'm10_98x.webp',
          html: '<p>Con el 22mm tengo la misma impresión que con el 31mm. La imagen parece un poco más pálida pero sin aportar más detalles.</p><p>Es agradable de contemplar debido a su tamaño y a las estrellas que se resuelven de una tonalidad cálida, como de un amarillo pálido, pero poco más.</p><p>Quizás, por destacar algo, me parece que el centro del cúmulo ahora se ve un poco más concentrado, distinguiendo los dos niveles de brillo más claramente y pareciera que el halo exterior es más grande que lo que observé anteriormente con el 31mm.</p>'
        },
        {
          boton: '154x - 28’ - 3mm', titulo: 'Delos 14mm',
          img: 'm10_154x.webp',
          html: '<p>Con el 14mm el objeto ha cambiado bastante. Ahora el objeto rellena hasta la mitad del campo del ocular y eso transfiere una presencia mayor que te sobrecoge. Las estrellas se resuelven muy bien, con esa tonalidad cálida tan bella en contraste con el blanco brillante del núcleo. Incluso en el halo exterior, que se distingue como un fantasmagórico tenue y grisáceo brillo, se destaca el color de estas estrellas por contraste.</p><p>Por intentar poner un símil es parecido a cuando observando granos de arena en una playa blanca ves brillar los trocitos de cuarzo con un color un poco más amarillo. Supongo que no es un buen símil pero es lo que me ha venido a la mente.</p><p>La forma también parece que ha variado algo. Se empiezan a ver ríos de estrellas que se extienden casi hasta el borde mismo del objeto sin presentar ninguna curva, sino más bien líneas rectas que parten desde el mismo centro del núcleo.</p>'
        },
        {
          boton: '216x - 27’ - 2.1mm', titulo: 'Ethos 10mm',
          img: 'm10_216x.webp',
          html: '<p>A pesar de que no noto una diferencia significativa en detalles (no he sentido lo mismo que al pasar del 22mm al 14mm) lo cierto es que la imagen es más placentera.</p><p>Los 100º de campo aparente ayudan mucho a imaginar la grandiosidad del objeto, pues su tamaño es muy importante en un campo muy grande.</p><p>Consigo resolver mejor las estrellas, gracias al salto en aumentos, pero, lamentablemente, he perdido la sensación de tonalidad en las estrellas. Me parecen más planas en color, todas ellas blancas pero con distinta intensidad (más o menos brillantes).</p>'
        },
        {
          boton: '270x - 22’ - 1.7mm', titulo: 'Ethos 8mm',
          img: 'm10_270x.webp',
          html: '<p>Con el 8mm impresiona más. Me llama muchísimo la atención las hileras de estrellas de magnitud similar partiendo desde el centro del núcleo. Es muy interesante seguirlas con la mirada hasta que desaparecen abruptamente al borde del cúmulo.</p><p>También el núcleo parece ahora más bello, mostrando una especie de corona que rodea a una parte más brillante en el centro en dónde parece que hay un par de estrellas más brillantes que el resto.</p><p>Curioso.</p>'
        },
        {
          boton: '480x - 9’ - 1mm', titulo: 'Delos 4.5mm',
          img: 'm10_480x.webp',
          html: '<p>A diferencia de otros objetos esta vez con el 4.5mm no consigo una visión mejor que con el 8mm. Sigo viendo fácilmente las hileras de estrellas emergiendo de la zona central, así como esa serie de estrellas más brillantes que luego desaparecen haciendo bajar el brillo del núcleo del cúmulo para volverlo a aumentar en su zona más central debido a las dos estrellas (ahora claramente distinguibles) del centro.</p><p>Pero es una imagen muy similar a la que veía con el 8mm solo que menos nítida pues no consigo un enfoque tan perfecto. Es posible que el seeing de la noche haya empeorado un poco durante mi sesión de observación.</p><p>Interesante cúmulo pero sin llegar a ser muy llamativo, quizás un buen ejemplo como glóbulo cumular pero la verdad es que poco más puedo añadir.</p>'
        }
      ]
    }],
    m11: [{
      // ── Observación 1 (metadatos de ESTA observación) ──
      observador: 'autor',
      fecha: null,        // p. ej. '2025-11-14'
      lugar: null,        // p. ej. 'Sierra de Grazalema'
      instrumento: null,  // p. ej. 'Dobson 305 mm'

      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m11_inv.pdf',
      defaultIndex: 1,
      entries: [
        {
          boton: 'Exploración', titulo: 'M11. Exploración',
          img: null,
          html: '<p>Síntesis de la observación. Sobre el cúmulo se identifican los rasgos descritos a lo largo de la sesión:</p><ul style="margin:8px 0;padding-left:20px;"><li>Tamaño</li><li>Estrella central dorada</li><li>Decenas de estrellas de igual magnitud</li><li>C invertida</li><li>Asterismo: Tipo con tupé</li><li>Asterismo: ET</li><li>Asterismo: Mano</li><li>Asterismo: Talón (romboide)</li></ul><p style="font-size:13px;color:#9fb6c9;">Orientación dobson (invertida): N a las 9, O a las 12, S a las 3 y E a las 6.</p>'
        },
        {
          boton: '70x - 1º 10’ - 6.6mm', titulo: 'Nagler 31mm',
          img: 'm11_70x.webp',
          html: '<p>El campo estelar es espectacular, al estar en plena Vía Láctea está rodeado por cantidad de estrellas y sin embargo el cúmulo destaca claramente sobre todas ellas.</p><p>Ocupa más o menos una décima parte del ocular, es bastante brillante y no soy capaz de establecer ninguna forma definida. Es curioso porque con menores aumentos siempre he visto este cúmulo abierto bastante compacto, y ahora veo claramente zonas dónde no hay estrellas y hace que su forma sea muy compleja de describir.</p><p>Hay una estrella que destaca siempre en el interior del cúmulo abierto que además posee un color distinto al resto, un poco más dorado, mientras que la mayoría de las estrellas en el cúmulo tienen un color más frío, azul o blanco. Sin embargo no es muy evidente, al menos en este telescopio. Es cierto que percibes esa estrella de un color más cálido pero me es complicado identificar exactamente el tono de color. Me baso en esa estrella para describir el objeto. La zona a las 12 de esa estrella es mucho más rica que su zona a las 6. Veo un par de “pilares” de estrellas, uno de ellos con forma de yunque (a la derecha) y el otro como un personaje con tupé.</p><p>Lo asombroso con este ocular es la belleza del conjunto. El cúmulo puede ser comparado con la gran cantidad de estrellas que hay a su alrededor y te lleva a percibir lo insignificante que somos en el cosmos, pues ese magnífico cúmulo no es más que una pequeña parte en un campo repleto de estrellas. Y lo cierto es que es algo que con mayores aumentos nunca siento. A mayores aumentos nos introducimos en el objeto y tu atención se centra en el objeto en sí mismo perdiendo esa visión general de verlo como un pequeño tesoro del espacio. Tener esa impresión de estar contemplando el universo, no un objeto en él, sino el conjunto completo, es algo que solamente logro a bajo aumentos.</p><p>Por otro lado también me encanta ser capaz de diferenciar claramente tantas estrellas individuales en el cúmulo, aunque su tamaño sea pequeño en el ocular.</p><p>Es un magnífico punto de partida para poder continuar con su exploración.</p>'
        },
        {
          boton: '98x - 50’ - 4.7mm', titulo: 'Nagler 22mm',
          img: 'm11_98x.webp',
          html: '<p>Qué preciosidad de cúmulo la verdad sea dicha. Pero no es por su forma o por la diferencia en brillo o colores de sus estrellas. Es más bien por lo contrario, por lo uniforme de la mayoría de decenas y decenas de estrellas que se observan de forma individual, con colores y brillos similares. Y todo ello formando un conjunto único en un campo rodeado de estrellas muy bello.</p><p>Con este nuevo ocular el objeto gana de tamaño y me facilita observar, sigo insistiendo en mis notas de voz en la forma que se ha dibujado en mi cabeza para describir el cúmulo. Lejos de tener una forma geométrica o esférica, es bastante amorfo y son estos dos pilares tan distintos los que me llaman la atención porque entre ellos existe un espacio casi sin estrellas. Además, la estrella principal está acompañada por varias de una magnitud menor que forma una especie de C invertida muy bonita de observar.</p><p>Lo mejor de estos bajos aumentos es lo poco que se ve afectado por el seeing y las estrellas se ven totalmente puntuales, como granitos de diamantes. Resolubles e individuales de un tamaño ínfimo, casi como un punto de luz.</p><p>Fijo mi vista en la estrella de mayor brillo y describo en mis notas de voz la estrella que tiene a sus 3 y las dos pequeñas que tiene a sus 5, junto con otra estrella a las 6, y una más a las 7 que hace la C invertida que comentaba antes.</p><p>Veo otras estrellas de una magnitud menor así que describo que el objeto en general está formado por una estrella brillante, varias decenas con un brillo similar y, en un orden de magnitud similar (es decir otras varias decenas) de estrellas mucho más tenues pero también resolubles. Para hacerme una idea de su tamaño, cojo al azar cualquier agrupación de estrellas, las cuento (alrededor de 10) y veo cuántas del mismo tipo hay, y con esto estimo que las estrellas de la misma magnitud estarán alrededor del centenar.</p>',
          anexos: [
               { img: 'm11_98x_detalles.webp', titulo: 'Zonas comentadas a 98x: Estructura de estrellas individuales', pos: 'right'}
             ]	
        },
        {
          boton: '154x - 28’ - 3mm', titulo: 'Delos 14mm',
          img: 'm11_154x.webp',
          html: '<p>El 14mm nunca me defrauda. Como comentaba anteriormente, ahora el objeto gana en presencia y me centro en él. He perdido la impresión de estar contemplando el universo, ahora solamente veo M11, pero es que es un objeto precioso.</p><p>La forma es muy extraña, al menos en la posición en la que lo estoy viendo. Ahora los dos pilares me recuerdan a un extraterrestre cabeza de yunque y a un humano cabezón dándose la mano. Además hay una agrupación de varias estrellas que forman el talón izquierdo del humano bastante curioso. En fin, la imaginación de cada uno tiene estas cosas. Además de juegos imaginativos, el objeto la verdad es que es precioso por la cantidad de estrellas que se ven. Da gusto relajarse simplemente contemplando las estrellas, intentando ver hasta dónde alcanza la vista. Creo que la estrella de menor magnitud que observo es una cercana a las dos estrellas que están a las 3 de la estrella más brillante del cúmulo. Estas dos estrellas tienen una compañera como a sus 5 bastante tenue. No estoy seguro pero diría que es una de las de menor magnitud que puedo resolver sin mucha complicación.</p><p>Paso al siguiente ocular para poder observar el objeto con mayor tamaño pero no esperando descubrir nada nuevo.</p>'
        },
        {
          boton: '216x - 27’ - 2.1mm', titulo: 'Ethos 10mm',
          img: 'm11_216x.webp',
          html: '<p>No me parece que pueda aportar más información de la ya dada con el resto de oculares. Con el 10mm sigue siendo una preciosidad contemplar el objeto pero voy perdiendo brillo y me parece que algunas de las estrellas más tenues las he perdido.</p><p>Sin embargo las estrellas que permanecen me son mucho más sencillas de diferenciar y contemplar el objeto en su conjunto.</p>'
        },
        {
          boton: '270x - 22’ - 1.7mm', titulo: 'Ethos 8mm',
          img: 'm11_270x.webp',
          html: '<p>En este ocular lo que más me llama la atención es el respeto al color de las estrellas que me otorga. Veo ahora más claramente que en el ocular anterior como la estrella más brillante es de una tonalidad cálida, amarillenta, mientras que el resto de estrellas son frías, de una tonalidad azulada.</p><p>El objeto ahora ocupa casi la mitad del ocular con lo que distingo muchísimo más claramente las agrupaciones de estrellas. Por ejemplo lo que he llamado el talón de la figura de la izquierda en el ocular cuento perfectamente cinco estrellas (cuatro de la misma magnitud formando una especie de romboide y una quinta más tenue a las 11 de este romboide).</p><p>Es este hecho el que me impresiona de añadir aumentos. Lo comentaba al principio de esta ficha. Ahora el objeto en sí mismo, el cúmulo abierto, es el protagonista de la visión y tu atención se centra en disfrutarlo en cada uno de sus detalles. Sin embargo, con bajos aumentos, la atención se dividía entre el objeto y el campo que lo rodeaba. Transmitiéndote sensaciones más generales y no tan específicas del objeto en sí, sino del conjunto. A pesar de no obtener más información, sí que consigo distintos sentimientos y solamente por ello también me entretengo en este ocular y en el siguiente para poder disfrutar de experiencias distintas.</p>'
        },
        {
          boton: '480x - 9’ - 1mm', titulo: 'Delos 4.5mm',
          img: 'm11_480x.webp',
          html: '<p>Es un poco más de lo mismo pero ocupando ahora un 80% del ocular. Aunque el enfoque ahora es mucho más complejo y la calidad del seeing en la noche hace un efecto mucho mayor. Esto provoca que las estrellas hayan dejado de ser puntos de luz mínimos y pasan a ser una pequeña bolita difusa que ensucia la imagen. Sin embargo, poder contemplar TOTALMENTE el objeto a este tamaño es maravilloso pues no tienes que esforzarte para obtener toda la información que te proporciona. Creo sinceramente que merece la pena saltar a estos aumentos para disfrutar de esta vista, por el mero hecho de “vivir” el objeto de otra forma.</p><p>Como colofón recalco lo indicado en mi primera impresión M11 es un cúmulo abierto muy bello por la gran cantidad de estrellas de una magnitud y colores similares. Es un buen ejemplo de conjunto.</p>'
        }
      ]
    }],
    m12: [{
      // ── Observación 1 (metadatos de ESTA observación) ──
      observador: 'autor',
      fecha: null,        // p. ej. '2025-11-14'
      lugar: null,        // p. ej. 'Sierra de Grazalema'
      instrumento: null,  // p. ej. 'Dobson 305 mm'

      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m12_inv.pdf',
      defaultIndex: 1,
      entries: [
        {
          boton: 'Exploración', titulo: 'M12. Exploración',
          img: null,
          html: '<p>Síntesis de la observación. Sobre el cúmulo se identifican los rasgos descritos a lo largo de la sesión:</p><ul style="margin:8px 0;padding-left:20px;"><li>Tamaño</li><li>Niveles de brillo (1)</li><li>Brazos en forma de estrella de mar</li><li>Estrellas halo exterior</li><li>Estrellas en el borde del núcleo</li><li>Forma de estrella de nieve</li><li>Río oscuro curvo</li><li>Resolver estrellas en el núcleo más interno del cúmulo</li></ul><p style="font-size:13px;color:#9fb6c9;">Orientación dobson (invertida): N a las 6, O a las 9, S a las 12 y E a las 3.</p>'
        },
        {
          boton: '70x - 1º 10’ - 6.6mm', titulo: 'Nagler 31mm',
          img: 'm12_70x.webp',
          html: '<p>El campo es muy pobre lo que permite centrar la atención en el cúmulo aunque también es verdad que desdibuja un poco la visión del objeto.</p><p>Respecto al tamaño relativo del cúmulo diría que ocupa una quinta parte del campo del ocular.</p><p>Su forma es esférica como todos los cúmulos globulares, con un brillo bastante uniforme. Es cierto que se resuelven estrellas incluso a estos bajos aumentos, sobre todo en su halo exterior, pero ello no va acompañado con una diferencia significativa entre el núcleo y el halo exterior.</p><p>Eso me lleva a clasificarlo como un cúmulo poco vistoso. Es decir, soy capaz de distinguir varias estrellas del cúmulo, pero por la uniformidad de brillo no me llama especialmente la atención.</p><p>Dedicándole algunos minutos más distingo unos pequeños “salientes” desde la zona más concentrada del cúmulo, lo que sugiere una especie de pequeños brazos que me recuerdan a una estrella de mar de brazos cortos. Soy capaz de contar hasta siete salientes, que no sobresalen mucho comparado con el tamaño de toda la región central del cúmulo globular. Cada uno de estos salientes parece tener una estrella un poco más brillante al final de los mismos, especialmente aquellos que corresponden con los salientes de la 1, las 5, 6 y 7.</p><p>Lo más bello del cúmulo sin duda es ser capaz de resolver estrellas tan cerca del núcleo, llegando algunas incluso al borde del mismo.</p>'
        },
        {
          boton: '98x - 50’ - 4.7mm', titulo: 'Nagler 22mm',
          img: 'm12_98x.webp',
          html: '<p>El objeto gana muchísimo con el nagler de 22mm, es una delicia. El adjetivo que más repito en mis notas de voz es un cúmulo armonioso y equilibrado. Es como si todo estuviera repartido caóticamente pero creando una sensación de uniformidad en ese caos. Además han aumentado el número de estrellas que se resuelven fácilmente y ello siempre provoca que tu atención se fije más en lo que estás contemplando.</p><p>Realmente parece que el cúmulo ha ganado con un poco más de aumento, además no parece que sea a costa del brillo del mismo pues me pareciera que ha perdido poca luminosidad.</p>'
        },
        {
          boton: '154x - 28’ - 3mm', titulo: 'Delos 14mm',
          img: 'm12_154x.webp',
          html: '<p>¡¡¡UAUUU!!! ¡Qué cambio ha dado el cúmulo! Ahora me recuerda más a la típica imagen de los copos de nieve que poseen una parte central muy grande y una especie de salientes en forma de estrella pero que no son mucho más grandes que el núcleo. Muy sugerente la visión.</p><p>Porque además parece que el cúmulo va ganando en contraste. Si con el 31mm me pareció que era muy uniforme cada vez que salto de aumento voy perdiendo esa primera impresión. Contrariamente ahora distingo un nivel de brillo más intenso en el interior más profundo del cúmulo, frente a la suave nubecilla gris que se extiende en todas las direcciones uniformemente con muchísimas estrellas resolubles.</p><p>Además con este ocular me parece ver una débil tonalidad rojiza a algunas de las estrellas más brillantes que se resuelven fácilmente, sobre todo aquellas que están más cerca de la zona central del núcleo.</p><p>Por último me llama la atención una especie de “río negro” que aprecio en la base del cúmulo. Obviamente este efecto no es real, es simplemente que la concentración de estrellas en una zona muy cercana al núcleo es levemente menor y por ello parece que fuera “oscuro” frente al área brillante (sobretodo aplicando la visión lateral) pero en realidad todo ello tiene un brillo superior al halo exterior que empieza a desdibujarse por la cantidad de estrellas que lo componen.</p><p>Este río partiría de las 6 para ir girando hacia las 9 pero en la base misma del cúmulo, no introduciéndose en su interior.</p>',
          anexos: [
               { img: 'm12_154x_detalles.webp', titulo: 'Zonas comentadas a 154x: Río negro', pos: 'right'}
             ]	
        },
        {
          boton: '216x - 27’ - 2.1mm', titulo: 'Ethos 10mm',
          img: 'm12_216x.webp',
          html: '<p>Ufff es difícil qué visión me gusta más. Si la que he obtenido anteriormente o la que me proporciona ahora el 10mm.</p><p>La imagen es mayor ahora y los detalles se aprecian más fácilmente, concretamente la cantidad de estrellas que se resuelven y el famoso río oscuro que se aprecia en la parte inferior del cúmulo.</p><p>Es toda una belleza contemplar el cúmulo a 216x, parece realmente otro. Creo que esa es una de las mejores experiencias de estas fichas y estos ejercicios que voy realizando con cada objeto de la lista Messier, que no todos presentan el mismo aspecto con distintos aumentos.</p><p>Un cúmulo que a bajo aumentos parecía más bien monótono y sin mucho detalle, a altos aumentos muestra una estructura tan bella y unos detalles tan finos que merece muchísimo la pena jugar con ambas vistas para comprenderlo mejor.</p>'
        },
        {
          boton: '270x - 22’ - 1.7mm', titulo: 'Ethos 8mm',
          img: 'm12_270x.webp',
          html: '<p>¡Alucinante! Con cada salto de ocular la imagen mejora. Ahora el cúmulo casi ocupa todo el campo del ocular. El contraste ha aumentado bastante pero también he perdido parte de la nubosidad más tenue del halo exterior. Esta situación no es mala para la observación, al contrario, permite ver el objeto con “otros ojos”, pues ahora la cantidad de estrellas que se resuelven es incontable. Llego incluso a ver estrellas en el mismo centro del cúmulo.</p><p>Afortunadamente disfruto de un seeing muy bueno esta noche y ello me permite contemplar las estrellas con un grado de puntualidad supremo. Lo cierto es que es una preciosidad contemplar el cúmulo a estos aumentos. Creo que también puedo estar influido por el proceso que estoy siguiendo. Es decir, a bajos aumentos el objeto parecía bello pero sin mucho detalle, solamente destacando el hecho de que resolvía estrellas pero parecía un cúmulo globular más. Ha sido al ir navegando a través de los diversos aumentos con lo que he ido disfrutando cada vez más de la vista del objeto. No sé qué impresión tendría si directamente lo hubiera visto con el 8mm.</p><p>Probablemente me hubiera sorprendido pero creo que no tanto como el placer que ahora siento de descubrir un objeto tan sorprendente que solamente revela su belleza cuando vas añadiendo aumentos.</p>'
        },
        {
          boton: '480x - 9’ - 1mm', titulo: 'Delos 4.5mm',
          img: 'm12_480x.webp',
          html: '<p>El 4.5mm llega a destrozar el objeto. Quiero decir que entro tanto en el objeto que ya no tengo la sensación de contemplar un objeto aislado sino como si estuviera totalmente rodeado del objeto allá donde pose mi vista.</p><p>Y el centro del cúmulo ahora es espectacular. Las estrellas se resuelven perfectamente, casi podría decir que puedo contarlas todas aunque son decenas y decenas, junto con todas aquellas que rodean al núcleo. La imagen es sobrecogedora.</p><p>El contraste además ha aumentado muchísimo. Sin duda he perdido brillo pues hay un salto muy profundo desde el objeto al fondo de estrellas que ahora me aparece de un negro azabache muy intenso.</p><p>No veo casi gradientes de grises, todo es o una estrella definida y puntual o una zona negra. Eso quiere decir que estoy perdiendo información, hay detalles tenues que, sin duda, no puedo contemplar pero a cambio recibo unos detalles fácilmente observables.</p><p>Es un placer resolver tan fácilmente las estrellas, de forma tan individual y contemplarlas de forma aislada.</p><p>Realmente sorprendente. Sin llegar a ser una maravilla absoluta lo cierto es que es un cúmulo que bien merece su observación.</p>'
        }
      ]
    }],
    m13: [{
      // ── Observación 1 (metadatos de ESTA observación) ──
      observador: 'autor',
      fecha: null,        // p. ej. '2025-11-14'
      lugar: null,        // p. ej. 'Sierra de Grazalema'
      instrumento: null,  // p. ej. 'Dobson 305 mm'

      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m13_inv.pdf',
      defaultIndex: 1,
      entries: [
        {
          boton: 'Exploración', titulo: 'M13. Exploración',
          img: null,
          html: '<p>Síntesis de la observación. Sobre el cúmulo se identifican los rasgos descritos a lo largo de la sesión:</p><ul style="margin:8px 0;padding-left:20px;"><li>Tamaño</li><li>HIP81848</li><li>NGC 6207</li><li>Forma y brazos</li><li>Niveles de brillo (2)</li><li>Sensación de tridimensionalidad</li><li>Color rojizo de las estrellas</li><li>Estrellas halo exterior</li><li>Recorrer brazos contando sus estrellas</li><li>Contar estrellas del núcleo interior</li><li>Rendirse ante la inmensidad de estrellas que se resuelven</li><li>Equilibrio en la belleza</li><li>Contrastar brillo de estrellas rojizas con el fondo negro del firmamento</li><li>Río oscuro con forma de Y</li><li>Grupos destacables de 4, 6, 9, 12 estrellas en el interior del cúmulo</li></ul><p style="font-size:13px;color:#9fb6c9;">Orientación dobson (invertida): N a las 9, O a las 12, S a las 3 y E a las 6.</p>'
        },
        {
          boton: '70x - 1º 10’ - 6.6mm', titulo: 'Nagler 31mm',
          img: 'm13_70x.webp',
          html: '<p>Este objeto jamás puede defraudar en ningún telescopio siempre que uno lo observe desde cielo oscuro. Es una preciosidad, todo un regalo de la naturaleza para nuestro disfrute.</p><p>El campo es muy bonito con pocas estrellas, algunas de ellas de una magnitud importante destacando junto con el objeto en el campo del ocular, como por ejemplo HIP81848 a las 6 con una magnitud de 6.68. Se agradece la falta de estrellas porque el cúmulo globular destaca aún más en este campo. Aunque hay que indicar que en el propio campo se observa fácilmente NGC 6207 como una manchita alargada, la galaxia que acompaña siempre a este magnífico cúmulo globular.</p><p>El tamaño del objeto es impresionante, a pesar de estos bajos aumentos ya ocupa perfectamente más de 1/10 del ocular. Y su forma siempre es esférica con multitud de brazos que se extienden fuera del cúmulo no de forma recta sino haciendo curvas. La sensación de tridimensionalidad es mayúscula pues uno es capaz de resolver estrellas incluso en la parte más interna del núcleo.</p><p>Es muy brillante, no se necesita visión lateral, es totalmente evidente. Se aprecia también muy claramente dos niveles de brillo, uno más intenso en su interior y otro levemente menos brillante en la parte más externa. Las estrellas de los brazos son de una magnitud similar a las estrellas que forman el cúmulo y por ello la sensación de conjunto es magnífica.</p><p>Como detalle, destacaría el color de las estrellas que se resuelven en el propio interior del cúmulo. La tonalidad de muchas de ellas es rojiza y parecen como pequeños rubíes brillando en una bola de algodón blanca. Es una preciosidad, porque además su tamaño en este ocular permite contemplarlo como una parte de la galaxia, un objeto que flota en la inmensidad del cosmos. Alucinante.</p>'
        },
        {
          boton: '98x - 50’ - 4.7mm', titulo: 'Nagler 22mm',
          img: 'm13_98x.webp',
          html: '<p>Qué preciosidad y qué gozada poder ampliar la visión anterior. El cúmulo ha crecido muchísimo y la infinitud de estrellas que se resuelven en el mismo hace que tu cabeza explote. Las estrellas se resuelven por todo el objeto con esa tonalidad rojiza tan bella y con una puntualidad increíble que no crees que puedas estar viendo una fuente de luz tan puntual.</p><p>Es en ese momento, cuando estás enfocando tu mirada en la puntualidad de las estrellas que percibes los diferentes gradientes del cúmulo en sí. Su parte interna es mucho más brillante y las más externas perdiendo brillo paulatinamente, teniendo niveles de brillo claramente distinguibles. Además los brazos son una maravilla. Puedes recorrerlos fácilmente, empezando desde el mismo punto en el que nacen y seguirlos, extendiéndose más allá del cúmulo globular. Y además los recorres con la vista mientras vas contando cada una de las estrellas individuales, de similar magnitud, que forman ese brazo que has decidido observar. Es como si el cúmulo se expandiera en el espacio intentando abarcar mucho más allá de su concentrado núcleo. Como si las estrellas quisieran escapar de la atracción gravitatoria de esa bola inmensa de estrellas. Y son cientos de estrellas las que están en esos brazos separados de su halo exterior.</p><p>Y cuando uno vuelve a enfocar la vista sobre el núcleo del objeto para resolver cada estrella de su interior, entonces más estrellas aún aparecen como puntos individuales. Haciendo el conjunto más magnífico aún, más grandioso, casi sin dejarte respirar de la cantidad de estrellas que puedes llegar a contar o intuir.</p><p>Además se le suma los contrastes y colores que ves, comparando los granates de las estrellas del interior, esos pequeños granos rojizos con el blanco resplandor del cúmulo en sí mismo y con el contraste tan brutal de un cielo oscuro, negro a su alrededor. Realmente es una imagen apabullante.</p><p>Es puro placer disfrutar de esta imagen. Con el 31mm fue un impacto la visión del ocular pues no esperaba ver M13 con tanto brillo y a la misma vez con tanto detalle, en un tamaño no muy grande. Pero ahora con el 22mm es puro placer como ya he dicho pues el cúmulo es mucho mayor pero igualmente delicado, con miríadas de estrellas individuales.</p><p>Estoy tan atónito ante la imagen que no dejo de preguntarme por qué me parece tan bella y creo que debo sumar algo más a la descripción. El EQUILIBRIO. Y es que el objeto, a pesar de su multitud de detalles, está muy compensado. Sí, las estrellas que resuelves en su interior son más brillantes que el brillo de fondo del cúmulo, pero lo son en un grado tan leve que no rompen el conjunto sino que destacan como pequeños tesoros que no deslumbran el todo. La palabra que me llega a la mente es justamente esa, un delicioso equilibrio en su belleza.</p><p>Maravilloso.</p>'
        },
        {
          boton: '154x - 28’ - 3mm', titulo: 'Delos 14mm',
          img: 'm13_154x.webp',
          html: '<p>Uauuuuuuu. Qué imagen más sobrecogedora. El objeto ha crecido (bueno y el campo del ocular también se ha reducido al pasar de los 82º a 72º) hasta ocupar prácticamente un cuarto del ocular. Ahora es imposible observar otra cosa que no sea el cúmulo en sí mismo.</p><p>Lo que más me llama la atención en estos aumentos es que empiezo a ver una especie de ríos negros dentro del propio cúmulo. Es claramente visible usando la visión lateral y fijándose en la zona a las 5 del cúmulo.</p><p>Me cuesta algunos minutos verlo correctamente. La primera zona con poco brillo que observo y que lo imagino como un río oscuro es la que forma una especie de 7 pero con el palo largo del número no vertical sino inclinado hacia las 5. A los pocos minutos de observación me doy cuenta de que existe otra zona igualmente más oscura que parte desde el mismo vértice de ese 7 pero hacia la 1 si uno se imagina un reloj. Y es entonces, cuando viendo el conjunto de estos tres ríos, cuando uno puede imaginar la famosa forma del símbolo del vehículo Mercedes en el cúmulo.</p><p>Es bastante evidente la verdad, y contrasta claramente en visión lateral esta zona más tenue dentro del propio cúmulo. Además se ve perfectamente que no está en el centro del cúmulo sino en un lateral del mismo.</p><p>Impresiona mucho porque uno no espera ver algo “oscuro” dentro de un objeto tan brillante. Es tu mente la que genera un contraste que es espectacular. Está claro que no estoy viendo algo negro sino que es menos brillante que el resto que lo rodea, pero mi cerebro lo transforma en ríos negros que serpentean por el cúmulo.</p><p>Increíble. Estoy alucinando con la visión tan diferente que obtengo del objeto al añadir más aumentos.</p>',
          anexos: [
               { img: 'm13_154x_detalles.webp', titulo: 'Zonas comentadas a 154x: Símbolo de la paz o Mercedes', pos: 'right'}
             ]	
        },
        {
          boton: '216x - 27’ - 2.1mm', titulo: 'Ethos 10mm',
          img: 'm13_216x.webp',
          html: '<p>¡¡Qué gozada!! Mi cerebro se está acostumbrando a la visión de esos ríos oscuros y me permite que, incluso sin usar la visión lateral y centrando la visión en resolver las estrellas del interior del cúmulo, siga viendo los ríos oscuros.</p><p>Describo en mis notas de voz que además los ríos no tienen el mismo grado de oscuridad, el más tenue, el menos oscuro, es aquél que va hacia el interior del núcleo hacia las 9. La que va hacia la 1 y hacia la 5 son más oscuras, tienen menor brillo y destacan más en el conjunto del cúmulo.</p><p>Con este ocular además veo aún mucho campo y el contraste con el negro del cielo de fondo es maravilloso. Un objeto complejo y muy brillante con estructuras oscuras en su interior desafiándote para que lo observes lo mejor posible. Todo un reto y un placer.</p>'
        },
        {
          boton: '270x - 22’ - 1.7mm', titulo: 'Ethos 8mm',
          img: 'm13_270x.webp',
          html: '<p>No dejo de asombrarme con cada cambio de ocular. Un nuevo río aparece en escena y la famosa forma de Y que podría recordar al símbolo de Mercedes-Benz se transforma en el símbolo de la paz que representa una huella de paloma.</p><p>El nuevo río aparece entre los dos ríos que anteriormente se dirigían hacia las 9 y hacia las 5. Es más tenue que cualquiera de los tres anteriores pero también se puede llegar a ver. Pero aún hay más, en la zona de las 9 del ocular hay otra línea oscura que se adentra en el cúmulo. Es fantástico poder ver M13 a 270x pues sigo resolviendo el cúmulo y las estrellas que posee pero es tan grande que puedo observarlo por zonas. Zonas diversas, con acumulación de estrellas aquí y allí y falta de las mismas en otras regiones. Es alucinante. Estoy deseando saltar al siguiente ocular para ver qué nuevo secreto me revela.</p>'
        },
        {
          boton: '480x - 9’ - 1mm', titulo: 'Delos 4.5mm',
          img: 'm13_480x.webp',
          html: '<p>INDESCRIPTIBLE. De verdad, es que no sé cómo poder describir la maravilla que estoy viendo. Simplemente no tengo palabras. Es así de sencillo. Lo intento una y otra vez pero me quedo corto en la descripción que hago en mis notas de voz.</p><p>Pero voy a intentarlo. Lo primero es que los ríos oscuros se han multiplicado. Bueno, para ser preciso no es que se hayan multiplicado, es que ahora veo claramente agrupaciones de estrellas entre distintas partes del cúmulo. Agrupaciones de estrellas quizás con media magnitud menos que las del fondo lo que las hace más brillantes y provoca que el fondo parezca tenue, aunque no lo es. Es una bola brillante que emana luz por todos lados. Aunque en conjunto ha perdido brillo respecto al ocular anterior, el objeto es tan brillante que hasta lo agradezco.</p><p>Hay algo que hace que la imagen no sea tan bella y es la complejidad del enfoque con estos aumentos. Me es muy difícil conseguir que las estrellas se vean totalmente puntuales, pero consigo bastante buen enfoque.</p><p>Cuando consigo ese enfoque con el que estoy satisfecho es cuando me percato de la cantidad de agrupaciones de estrellas individuales con 5 ó 10 de ellas a lo máximo que están rodeadas por zonas de menos brillo. El objeto se ha convertido en una estructura complejísima muy difícil de describir adecuadamente.</p><p>Y jamás lo había visto de esta forma. Es alucinante revisar los archiconocidos objetos Messier con un 18” porque realmente cambian totalmente. Creo que compenso mi falta de palabras para describir lo que veo con la imagen que he conseguido generar y que acompaña a esta descripción. Me parece que se ve muy bien esas estrellas levemente más brillantes, individuales que destacan por encima del cúmulo en sí mismo. Y cómo están agrupadas de forma caótica en conjuntos de quizás 4, 6, 9, 12 estrellas. Y por otro lado las miles de estrellas de fondo que dan ese brillo general más tenue que las estrellas resolubles y que crean en tu mente la imagen de que el cúmulo está surcado por varios ríos oscuros.</p><p>Sobrecogedor la verdad.</p>'
        }
      ]
    }],
    m14: [{
      // ── Observación 1 (metadatos de ESTA observación) ──
      observador: 'autor',
      fecha: null,        // p. ej. '2025-11-14'
      lugar: null,        // p. ej. 'Sierra de Grazalema'
      instrumento: null,  // p. ej. 'Dobson 305 mm'

      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m14_inv.pdf',
      defaultIndex: 1,
      entries: [
        {
          boton: 'Exploración', titulo: 'M14. Exploración',
          img: null,
          html: '<p>Síntesis de la observación. Sobre el cúmulo se identifican los rasgos descritos a lo largo de la sesión:</p><ul style="margin:8px 0;padding-left:20px;"><li>Tamaño</li><li>Niveles de brillo (2)</li><li>Forma</li><li>Halo exterior no uniforme</li><li>Diferencia de brillo entre interior y exterior no significativa</li><li>Resolver estrellas en la parte más interna del cúmulo</li><li>Red de ríos oscuros o islas brillantes en el interior del cúmulo</li></ul><p style="font-size:13px;color:#9fb6c9;">Orientación dobson (invertida): N a las 9, O a las 12, S a las 3 y E a las 6.</p>'
        },
        {
          boton: '70x - 1º 10’ - 6.6mm', titulo: 'Nagler 31mm',
          img: 'm14_70x.webp',
          html: '<p>En el campo estelar destacan varias de ellas con distintas magnitudes con lo que podemos clasificarlo como un campo rico en detalles dónde el cúmulo destaca debido principalmente a su tamaño.</p><p>Incluso a estos bajos aumentos el cúmulo se aprecia como un objeto grande, llegando a ocupar fácilmente un cuarto del tamaño del campo del ocular.</p><p>Su forma es la común en todos los cúmulos globulares, es decir esférica o redondeada, sin embargo el halo exterior no parece tan abundante como en otros cúmulos globulares sino más abierto, con regiones más ricas y más pobres de estrellas lo que muestra una imagen no uniforme en su zona más externa.</p><p>No es muy brillante y sus estrellas parecen que tienen todas la misma magnitud excepto algunas de ellas en el halo exterior que parecen un poco más brillantes. Algo curioso es que el núcleo no parece mucho más brillante que el halo exterior, sino que ambas regiones parecen tener un brillo similar solamente que el número de estrellas se concentra en el interior del cúmulo mientras que en el exterior son fácilmente resolubles.</p><p>O quizás dicho de mejor forma, la diferencia de brillo entre el halo exterior y el núcleo interior del cúmulo globular no es significativa. Esta situación muestra una apacible y homogénea vista general del cúmulo que imagino desaparecerá a mayores aumentos. Una imagen bonita.</p>'
        },
        {
          boton: '98x - 50’ - 4.7mm', titulo: 'Nagler 22mm',
          img: 'm14_98x.webp',
          html: '<p>Qué felicidad añadir aumentos a los cúmulos globulares. La imagen ha mejorado mucho respecto a la anterior ofrecida por el 31mm siendo ahora mucho más fácil resolver las estrellas que están más cerca del núcleo. Llego a contar fácilmente una decena de ellas, me llama la atención un grupo de tres estrellas en la zona de las 5 del halo exterior formando un pequeño arco. También otras tres más separadas a las 11 formando una especie de línea.</p><p>Sin lugar a duda es una imagen muy bonita por la puntualidad de todas las estrellas aunque añoro ver algún color en las estrellas y tener algunas de una magnitud superior que destaquen claramente sobre todo el cúmulo. Es una visión muy homogénea la que obtengo.</p><p>Quizás, tras dedicarle algunos minutos extra, consigo ver una especie de zona más tenue entre el halo exterior y el núcleo más interno, como una especie de aro tenue que rodea al núcleo, haciendo que el mismo destaque un poco más y ganando en algo de belleza. No obstante es muy tenue.</p>'
        },
        {
          boton: '154x - 28’ - 3mm', titulo: 'Delos 14mm',
          img: 'm14_154x.webp',
          html: '<p>¡Qué vista tan hermosa del cúmulo con el 14mm! Las estrellas se ven muy puntuales aún con esta pupila de salida (3mm) e incluso parece que tuviera alguna tonalidad.</p><p>Se pueden resolver perfectamente decenas de estrellas individuales, concentradas en diversas regiones formando sugerentes estructuras.</p><p>Mi mente vuela un poco imaginando lo que debe ser vivir en un planeta alrededor de cualquiera de esas estrellas, viendo un cielo con innumerables fuentes de luz, cientos, miles de estrellas que aparecen al ocultarse su astro principal.</p><p>Hasta ahora es la visión más bella que he conseguido del cúmulo. Ocupa casi la mitad del ocular y el núcleo se distingue de una forma más clara, es decir, anteriormente la diferencia en brillo del halo exterior y el núcleo no era muy significativa. Esa situación ha desaparecido totalmente en el 14mm. Ahora sí que existe claramente una zona más brillante en el interior del cúmulo globular y un halo más tenue en el exterior con decenas y decenas de estrellas individuales flotando en ambas regiones.</p><p>Precioso.</p>'
        },
        {
          boton: '216x - 27’ - 2.1mm', titulo: 'Ethos 10mm',
          img: 'm14_216x.webp',
          html: '<p>¡¡Qué de detalles se ven con este ocular!! Me centro mucho en la región de las 5 en el interior del cúmulo, porque existen una serie de estrellas que, partiendo desde el mismo centro del cúmulo, se separan de él en un bello brazo. Además entre ese brazo y el núcleo del cúmulo existe una región más tenue, como un pequeño río oscuro que rodea de alguna forma el núcleo en esta región.</p><p>El número de estrellas que se resuelven ha crecido muchísimo. No hay ninguna distribución coherente sino más bien un caos de estrellas dispersas aquí y allí, pero es muy bonito de observar pues precisamente en ese caos se observa una homogeneidad.</p><p>Aunque no revela nuevos detalles, o aunque no sea capaz de describir partes específicas, tengo la sensación de ir obteniendo mejores vistas del cúmulo con cada salto de ocular.</p><p>Principalmente por la posibilidad de contemplar tantas estrellas individuales. Todas ellas de magnitud alta, o de poco brillo, pero totalmente resolubles como pequeños puntos de luz.</p><p>Muy bonito.</p>'
        },
        {
          boton: '270x - 22’ - 1.7mm', titulo: 'Ethos 8mm',
          img: 'm14_270x.webp',
          html: '<p>Al llegar a los 1.7mm de pupila de salida compruebo que el contraste del objeto se ha reducido levemente.</p><p>Sin embargo creo que soy capaz de resolver estrellas incluso en el mismísimo centro del cúmulo. En particular soy capaz de perder varios minutos disfrutando de la belleza de identificar un par de estrellas muy cerca de lo que sería la parte más interna del cúmulo. Me encanta llegar a contemplar tanto detalle como para resolver estrellas tan internas. Es un placer indescriptible dejar pasar los minutos mientras disfrutas con el simple hecho de ver estrellas. Decenas de ellas a un golpe de vista, con distintas magnitudes, todas formando parte de un mismo objeto. Realmente estoy disfrutando este cúmulo.</p>'
        },
        {
          boton: '480x - 9’ - 1mm', titulo: 'Delos 4.5mm',
          img: 'm14_480x.webp',
          html: '<p>Estoy disfrutando de una noche con un seeing magnífico y puedo llegar a tener una vista preciosa del cúmulo incluso con 1mm de pupila de salida. Es simplemente maravillosa la imagen que estoy contemplando.</p><p>Como en otras ocasiones he perdido el halo exterior, o más bien, he perdido el brillo de fondo del halo exterior y las estrellas que se resuelven parecen flotar en el fondo de cielo. Así que ahora toda nubosidad está asociada solamente a la parte más brillante e interna del cúmulo globular. Pero el tamaño es tan grande que me permite resolver varias estrellas más en el interior sin perder la visión del resto de las que ya resolvía con oculares previos.</p><p>A bajos aumentos o incluso hasta el ocular de 14mm (3mm de pupila de salida) el objeto siempre me había parecido uniforme, con brillos similares en toda su estructura. Ahora no. Ahora veo zonas mucho más brillantes, con incluso ríos oscuros en el interior del cúmulo que hacen resaltar las agrupaciones de estrellas que lo rodean, como elevándose por encima de ellos.</p><p>También indico en mis notas de voz que la imagen que contemplo ahora no tiene NADA que ver con la que había observado con el 8mm. Es cierto que pierdo brillo, pero estoy tan dentro del propio objeto que puedo resolver detalles que antes me era imposible de ver.</p><p>No sé los minutos que habré empleado en observar el cúmulo pero bien merece la pena cada uno de ellos. Y tener la fortuna de llegar hasta los máximos aumentos de mis oculares con una imagen tan detallada es realmente sorprendente. Estoy muy contento con el rendimiento que estoy obteniendo de un ocular que me da hasta 1mm de pupila de salida.</p><p>Finalmente, M14 ha resultado un objeto muy entretenido.</p>'
        }
      ]
    }],
    m15: [{
      // ── Observación 1 (metadatos de ESTA observación) ──
      observador: 'autor',
      fecha: null,        // p. ej. '2025-11-14'
      lugar: null,        // p. ej. 'Sierra de Grazalema'
      instrumento: null,  // p. ej. 'Dobson 305 mm'

      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m15_inv.pdf',
      defaultIndex: 1,
      entries: [
        {
          boton: 'Exploración', titulo: 'M15. Exploración',
          img: null,
          html: '<p>Síntesis de la observación. Sobre el cúmulo se identifican los rasgos descritos a lo largo de la sesión:</p><ul style="margin:8px 0;padding-left:20px;"><li>Tamaño</li><li>Diferencias halo externo - núcleo interno</li><li>Proporción: 9/10 - 1/10. Brillo. Resolución estrellas. Color: plata vs dorado</li><li>Comparar con M2</li><li>Niveles de brillo (2)</li><li>Agrupación de estrellas en forma de C en el núcleo</li><li>Agrupación de estrellas en forma de Y en el halo exterior</li><li>La C del núcleo está “rota”</li><li>Pease 1</li></ul><p style="font-size:13px;color:#9fb6c9;">Orientación dobson (invertida): N a las 6, O a las 9, S a las 12 y E a las 3.</p>'
        },
        {
          boton: '70x - 1º 10’ - 6.6mm', titulo: 'Nagler 31mm',
          img: 'm15_70x.webp',
          html: '<p>Qué preciosidad de objeto comparándolo por ejemplo con M2. La primera impresión es simplemente de belleza. Es un objeto muy extenso, bastante grande, pero el núcleo es muy pequeño, prácticamente parece casi puntual comparado con todo el tamaño del objeto y ello es porque el núcleo está totalmente concentrado. La imagen es tan bella gracias a la multitud de estrellas que se resuelven en su exterior. Es un objeto simplemente hermoso. Se observan cientos de estrellas en el halo exterior, totalmente individuales, resolubles y en el centro del objeto un núcleo muy brillante y de un tamaño minúsculo, como una décima parte del objeto en sí.</p><p>Insisto una vez más, lo que más impresiona con este ocular es la diferencia del núcleo y el resto del objeto. El núcleo es pequeño, el halo enorme, el núcleo es muy brillante, el halo tenue, en el núcleo es complicado resolver estrellas, todo el halo exterior es un conjunto de estrellas magnífico que se puede resolver fácilmente. Una visión espectacular la verdad. Un buen ejercicio es compararlo con el cercano M2 para sentirse más impactado aún. Merece la pena deleitarse con la imagen tan sugerente que se ofrece a bajos aumentos antes de prepararse para la aventura de introducirse en su interior.</p>'
        },
        {
          boton: '98x - 50’ - 4.7mm', titulo: 'Nagler 22mm',
          img: 'm15_98x.webp',
          html: '<p>La imagen del cúmulo sigue sorprendiéndome incluso a tan bajos aumentos. Se empieza a identificar algunas formas curiosas en el núcleo a la misma vez que se comienzan a resolver algunas estrellas. Intentando describirlo mejor, hago uso de la visión lateral centrándome en la estrella brillante cercana al cúmulo globular. Teniendo esta como referencia y colocándola a las 6:00 del cúmulo se puede observar que en el núcleo hay una agrupación de estrellas que forma una especie de C tumbada o de “cuna”. Por encima de esa C tumbada hay también una agrupación curiosa de estrellas que me recuerda al asterismo de Acuario, la Y famosa. Para conseguir esa visión debo forzar mucho la vista porque es muy brillante.</p><p>Cuando relajo la vista y lo contemplo tranquilamente y con visión lateral el efecto es sobrecogedor, porque el objeto gana en tamaño (o eso me parece) con cientos de estrellas formando esa bola de estrellas tan magnífica. Creo que es uno de los mejores cúmulos globulares que existen, de momento de los que he visto con el 18” gana por goleada.</p>',
          anexos: [
            { img: 'm15_98x_zoom.webp', titulo: 'Fotografía de mayor resolución con zoom a la región central, para apreciar mejor lo descrito a este aumento' }
          ]
        },
        {
          boton: '154x - 28’ - 3mm', titulo: 'Delos 14mm',
          img: 'm15_154x.webp',
          html: '<p>La imagen sigue siendo espectacular, además ahora se reduce el campo al saltar del 22 al 14 (y cambiar de tipo de ocular con diferente campo aparente). Quizás la imagen no es tan sobrecogedora como con el 22mm o con el 31mm, que te dejaba embobado delante del ocular por la finura del objeto. Ahora es mucho mayor, más fácil de identificar cada una de las estrellas, sin embargo me ocurre algo curioso que también me pasaba con M2: las estrellas que están en el centro del mismísimo núcleo me cuesta más trabajo verlas claramente. El telescopio está muy bien colimado y no aprecio que el brillo crezca para un lado o para otro cuando desenfoco cualquier estrella, sino que es bastante uniforme (no voy a decir perfecto porque creo que eso no lo he visto en mi vida, pero está muy bien). Esto es fundamental para poderlo observar bien y el cielo además acompaña con un seeing muy bueno la verdad. Así las estrellas externas se ven muy bien, muy puntuales, sin embargo con el 22mm podía resolver muy claramente las estrellas del núcleo y aquí, simplemente, me cuesta más, a pesar de haber ganado en tamaño del objeto. De todas formas sigo viendo esa forma de C tumbada en el núcleo y el halo es espectacular, lleno de estrellas y con un fondo tenue de las miles de estrellas que lo debe componer pero que no soy capaz de resolver.</p><p>Se me pasaba indicar que además de la forma curiosa de las estrellas de su núcleo sorprende su color, de una tonalidad dorada frente al brillo intenso totalmente blanco del núcleo sobre el que flotan estas estrellas. Una imagen preciosa la verdad, no me canso de repetirlo.</p>'
        },
        {
          boton: '216x - 27’ - 2.1mm', titulo: 'Ethos 10mm',
          img: 'm15_216x.webp',
          html: '<p>Me llama mucho la atención que pueda ver tantos detalles en la zona más central del núcleo del objeto y por eso sigo mirándolo con detalle. Ahora me parece observar que esta C, ó cuna del núcleo, está en realidad “rota”. Es decir, este asterismo es algo así como una serie de estrellas que hacen una pequeña curva al interior del cúmulo, luego siguen otras estrellas que forman una línea plana, para después continuar otra serie de estrellas en una curva contraria a la anterior, creando esta especie de cuna o C tumbada. Además, en el giro de la C hacia la parte plana primera que he descrito, en esa zona, el asterismo tiene un hueco, como si un pequeño río oscuro lo atravesara.</p><p>Saltando de esta zona del objeto hacia el exterior me maravilla el contraste de brillo tan grande que existe. Justo a continuación de esta parte más central, el brillo cae bruscamente aunque es aún intenso y sobre él aparecen también decenas de estrellas, pero siguiendo más hacia afuera, dejo de ver brillo de fondo alguno y ahora lo que veo son decenas y decenas de estrellas individuales, todas alrededor del cúmulo, formando parte del mismo. Es una gozada la verdad.</p><p>También es verdad que el objeto ahora puede ocupar como 1/3 del ocular, sin embargo creo que este hecho le quita un poco de encanto. Es decir, con bajos aumentos el impacto de la imagen era magnífico, porque se veía un objeto muy grande con un núcleo muy pequeño. A estos aumentos ha desaparecido esa impresión. Ahora me parece más uniforme, el núcleo sigue siendo pequeño comparado con el objeto en sí mismo, pero no me parece “tan pequeño”, o más bien, no me parece que el halo exterior de estrellas resolubles sea tan extenso. En fin, es mi impresión.</p>'
        },
        {
          boton: '270x - 22’ - 1.7mm', titulo: 'Ethos 8mm',
          img: 'm15_270x.webp',
          html: '<p>En este salto no he visto más detalle de los ya descritos. La imagen sigue siendo bella pero no tan impactante como a bajos aumentos. La parte central me sigue hipnotizando con los detalles que le observo, aunque no puedo aportar nada que no haya descrito anteriormente. También me impacta cómo puedo llegar a resolver esas estrellas tan cerca del núcleo. Pero no puedo decir que haya ganado mucho más que con el ocular anterior.</p>'
        },
        {
          boton: '480x - 9’ - 1mm', titulo: 'Delos 4.5mm',
          img: 'm15_480x.webp',
          html: '<p>Con este ocular y con los cúmulos globulares siempre me ocurre lo mismo, que tengo la impresión de “destrozar” el objeto. Estoy a tantos aumentos y con un campo tan reducido que entro dentro del cúmulo, perdiendo la referencia de su zona más exterior. También es cierto que las estrellas más externas las veo mucho más separadas y ya casi no me llaman la atención. Las partes del núcleo son ahora muy evidentes pero me cuesta bastante enfocar correctamente para conseguir estrellas puntuales.</p><p>A pesar de ver tanto detalle y contar tantas estrellas me quedo sin lugar a dudas con la imagen a bajos aumentos, quizás con el 31mm por el impacto de la primera imagen que observé, viendo el objeto tan brillante, con las estrellas tan separadas y resueltas y ese brillo tan concentrado. Ahora, a estos aumentos y con este campo, el núcleo ocupa prácticamente todo el ocular y en los bordes del ocular veo el halo exterior y las estrellas que lo componen, con lo que pierdo la visión de conjunto y tengo que moverme con los motores para recorrerlo entero dejando el núcleo en un borde del ocular.</p><p>Es curiosa también esta imagen porque te haces una idea de la cantidad de estrellas que posee el objeto, pero pierde el impacto de sensación de masa abigarrada de estrellas, ya que ves un núcleo muy brillante con estrellas que se resuelven con dificultad (el enfoque aquí es crucial), y luego multitud de estrellas bien separadas del halo exterior. En fin, curioso y bonito pero mejor a bajos aumentos (al menos según mi criterio).</p>'
        },
        {
          boton: 'Pease 1 (reto extra)', titulo: 'Pease 1 · Reto extra dentro de M15',
          img: [
            { archivo: 'm15_pease1_98x.webp', etiqueta: 'Localización aproximada a 98x' },
            { archivo: 'm15_pease1_270x.webp', etiqueta: 'Localización aproximada a 270x' },
            { archivo: 'm15_pease1_540x_c.webp', etiqueta: 'La “C” del núcleo a 540x (Ethos 8mm + Powermate 2x)' },
            { archivo: 'm15_pease1_540x_arco.webp', etiqueta: 'Las 3 estrellas en arco y Pease 1, a 540x' }
          ],
          imgMode: 'tabs',
          html: '<p>Como reto adicional a la observación de M15 podemos plantearnos buscar una de las pocas nebulosas planetarias que se conocen en un cúmulo globular, se trata de la famosa Pease 1, famosa también por su complejidad para ser observada visualmente.</p><p>He de confesar que para mí ha sido una auténtica pesadilla dar con la nebulosa planetaria. Y solamente la he conseguido ver en un momento muy puntual y con muy buen seeing en particular. Es decir que una vez en el lugar dónde debería estar empleé varios minutos en que la imagen fuera lo más nítida posible para observarla. Hecha esta advertencia, animo a cualquiera a intentar este difícil reto pues no son muchos los que en todo el planeta Tierra la han visto (de hecho los reportes en Internet son escasísimos).</p><p>Existe una buena web que te ayuda a localizar Pease 1: <a href="https://web.archive.org/web/20060620170127/http://www.blackskies.org/peasefc.htm" target="_blank" rel="noopener" style="color:#7ec8ff;">blackskies.org (archivo)</a>.</p><p>Primero creo que es interesante hacerse una idea de dónde está la nebulosa aproximadamente, para ello señalo su posición con un par de aumentos, a 98x y a 270x. Simplemente con estas imágenes ya uno puede hacerse una idea del complejo reto, pues el objeto está MUY, MUY cerca del núcleo del cúmulo globular. Teniendo esto en consideración y sabiendo que necesitamos una noche con un seeing muy bueno, nos lanzamos al reto (si tienes un filtro de nebulosa planetaria ayuda pero no es necesario).</p><p>Es también fundamental que el telescopio haga un buen seguimiento y que los motores te permitan moverte suavemente. Yo recomendaría colocar al menos 500x en el telescopio y enfocar lo máximo posible. Yo conseguí verlo con mi Ethos de 8mm más la Powermate 2x, lo que me da unos 540x. Con esos aumentos, hay que identificar en el núcleo de M15 la “C” ya descrita anteriormente, pues ella nos servirá de guía; es muy sencillo porque está en la zona más brillante del núcleo, en su parte más central. Y si, previamente, hemos puesto la estrella más brillante cercana al cúmulo a las 6:00, la C te quedará bocabajo como se muestra en las siguientes imágenes.</p><p>Localizada la famosa C, hemos de fijarnos en su “base”, que “apuntaría” a la famosa estrella brillante fuera del cúmulo señalada a 270x casi a las 6:00 del ocular. Una vez situados y mirando desde ella, saliéndonos del núcleo del cúmulo globular encontraremos 3 estrellas con forma de arco. A mí me aparecían fuera ya del núcleo, puesto que a grandes aumentos la luz más tenue del objeto desaparece, y sin prácticamente brillo de fondo se veían muy bien. En las imágenes que adjunto engaña un poco porque parece que se ven muchas más estrellas, pero no es así: a grandes aumentos el campo se oscurece mucho.</p><p>Haciendo el recorrido inverso, es decir desde esas 3 estrellas que tienen una magnitud muy similar, hasta el núcleo propio del cúmulo, pasas por una zona de concentración de brillo que parece tener varias estrellas pero que es difícil de resolver. Ahí está la nebulosa. Con paciencia y una buena noche se ve como una especie de “bultito” que le sale al núcleo del cúmulo hacia esas 3 estrellas que comentaba, formando el arco.</p>'
        }
      ]
    }],
    ngc40: [{
      // ── Observación 1 (metadatos de ESTA observación) ──
      observador: 'autor',
      fecha: null,        // p. ej. '2025-11-14'
      lugar: null,        // p. ej. 'Sierra de Grazalema'
      instrumento: null,  // p. ej. 'Dobson 305 mm'

      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/ngc40_inv.pdf',
      defaultIndex: 1,
      entries: [
        {
          boton: 'Exploración', titulo: 'NGC 40. Exploración',
          img: null,
          html: '<p>Síntesis de la observación. Sobre la nebulosa planetaria se identifican los rasgos descritos a lo largo de la sesión:</p><ul style="margin:8px 0;padding-left:20px;"><li>Campo estelar y estrellas de referencia (las dos doradas en ángulo obtuso)</li><li>Tamaño (grande para ser una planetaria)</li><li>Halo exterior y estrella central</li><li>Zona de menos brillo entre la estrella central y el borde</li><li>Forma esférica / ligeramente ovalada (eje 3-9)</li><li>Salientes o protuberancias a las 9 y a las 3</li><li>Estructura granular interior</li><li>Red de hilos caóticos hacia la estrella central</li><li>Borde en forma de anillo con dos niveles de brillo (más brillante a las 6)</li><li>Estrella dentro de la protuberancia de las 9</li><li>Parches oscuros interiores (río a las 3 de la estrella central)</li><li>Posible ruptura en el anillo brillante a las 6</li><li>Arco tenue que sobresale a la 1</li></ul><p style="font-size:13px;color:#9fb6c9;">RASC Finest NGC · Cefeo · 00h 13m, +72º 32’. Orientación dobson (invertida): norte abajo, este a la derecha.</p>'
        },
        {
          boton: '70x - 1º 10’ - 6.6mm', titulo: 'Nagler 31mm',
          img: 'ngc40_70x.webp',
          html: '<p>Muy fácil de localizar, con un campo estelar muy bonito. Hay varias estrellas, pero algunas de ellas destacan por su brillo, que además están muy cerca de la nebulosa planetaria. En concreto, las dos estrellas de color dorado, anaranjado que forman un ángulo obtuso con la nebulosa planetaria. Ambas estrellas están a una distancia similar de la nebulosa: la que es un poco más luminosa (mag 9.07) está situada a la 1 de la nebulosa, mientras que la compañera (9.63) se encuentra a las 9. También llama la atención otra estrella muy cerca de la nebulosa, a sus 7, de mag 12.95.</p><p>La nebulosa es bastante grande para tratarse de una nebulosa planetaria, puesto que incluso con estos aumentos soy capaz de percibir el halo exterior claramente con visión directa y la estrella central que ha formado la nebulosa. Como muchas veces me ocurre, parece que entre la nebulosa y la estrella central la rodea una zona de menos brillo.</p><p>Su forma es esférica aunque a veces me parece que su forma es más bien ovalada con el eje mayor siendo el de 3 a 9. Pero de serlo, al menos con estos aumentos, sería con una relación muy cercana, quizás 1:1.1, es decir, con un eje solamente un 10% más largo. Además esta “deformación” de la esfericidad de la nebulosa se muestra como unos salientes de la misma, de menor brillo que el borde de la nebulosa.</p><p>NGC 40 es muy brillante, y como ya he comentado, no requiere de visión lateral para poder observarla. Se ve claramente con visión directa.</p><p>Incluso con este ocular empiezo a ver algunos detalles en la nebulosa. Por ejemplo, el borde es muy definido, y el interior de la nebulosa muestra una estructura granular, es decir, no se ve un brillo uniforme sino que parece que hay multitud de partes con diferentes niveles de brillo pero sin definir claramente.</p>'
        },
        {
          boton: '98x - 50’ - 4.7mm', titulo: 'Nagler 22mm',
          img: 'ngc40_98x.webp',
          html: '<p>El ocular de 22mm con este telescopio siempre da unos resultados magníficos. Ahora la nebulosa aparece mucho más grande manteniendo todo su brillo. He olvidado mencionar que no aprecio color alguno en la nebulosa, es decir que la veo totalmente gris, muy bella, pero sin tonalidad.</p><p>Es muy sorprendente la estructura interna de la nebulosa, con una especie de red de hilos que van desde el borde de la nebulosa hasta la estrella central, y se ven con visión directa. Sin embargo, esta estructura tan compleja no presenta ningún patrón, sino que es simplemente una red de hilos, caóticos, sin poder hacer referencia a nada más.</p><p>El borde de la nebulosa, aunque definido, no me parece que tenga ningún grosor, sino que simplemente determina el final de la nebulosa.</p><p>Una imagen muy bella pues aún la nebulosa, aunque grande para ser una nebulosa planetaria, es pequeña en un campo tan amplio.</p>'
        },
        {
          boton: '154x - 28’ - 3mm', titulo: 'Delos 14mm',
          img: 'ngc40_154x.webp',
          html: '<p>¡Cómo ha cambiado la imagen con el 14mm! Empiezo a percibir claramente cuáles son las estructuras más significativas de la nebulosa.</p><p>Primero el borde exterior. Está claro que en las regiones de las 9 y de las 3 de este borde se desdibuja por efecto de esas protuberancias que mencionaba anteriormente y hacen que la nebulosa no sea totalmente esférica sino ovalada. Además, estos salientes emergen de forma simétrica en las dos regiones, más o menos a las 10 y a las 8 (y en la región simétrica a las 2 y a las 4); el borde de la nebulosa deja de ser tan definido y empieza la protuberancia. Es decir, cada saliente ocuparía unos 60º de los 360º de la circunferencia. El tamaño de los dos salientes es igualmente similar y no aprecio diferencia, siendo, más o menos, del mismo tamaño del eje menor. Por tanto, la nebulosa tendría una proporción 1:2 por estos salientes. También es importante remarcar que estos salientes decrecen rápidamente en anchura, diría que su pendiente es mayor de 45º, con lo que finaliza de forma bastante aguda.</p><p>Siguiendo la descripción del borde exterior, está claro que muestra dos niveles de brillo diferentes, en la zona de las 12 y en la zona de las 6. Siendo, sin lugar a dudas, más brillante en la región de las 6, al lado de una estrella que está situada a las 7, que en la región de las 12. Pero incluso sin tener en consideración ese aumento de brillo, el borde exterior muestra una forma de anillo (excepto en los extremos como ya se ha explicado) alrededor de la nebulosa; es, por tanto, más brillante el borde que el interior de la nebulosa.</p>'
        },
        {
          boton: '216x - 27’ - 2.1mm', titulo: 'Ethos 10mm',
          img: 'ngc40_216x.webp',
          html: '<p>Sin duda la mejor imagen que he obtenido hasta ahora de la nebulosa.</p><p>Sigo apreciando nuevos detalles en la nebulosa. Por ejemplo, las protuberancias no son iguales, o al menos ahora no me lo parecen. La de las 3 me parece menos definida que la de las 9, mostrando una diferencia de brillo entre ambas, sutil, pero que ahí está. Usando la visión lateral veo una concentración de brillo en la protuberancia de las 9, en su zona inferior. Sin embargo, tras varios minutos compruebo que en realidad se trata de una estrella que está dentro del arco, o protuberancia de la nebulosa.</p><p>En el interior de la nebulosa veo parches oscuros, me es muy complicado de explicar porque no siguen ninguna estructura; quizás el más llamativo es el que se encuentra a las 3 de la estrella central, que parece un río que une la estrella con el borde exterior.</p>',
          anexos: [
            { img: 'ngc40_216x_detalle.webp', titulo: 'Detalles en el interior de la nebulosa planetaria', pos: 'right' }
          ]
        },
        {
          boton: '270x - 22’ - 1.7mm', titulo: 'Ethos 8mm',
          img: 'ngc40_270x.webp',
          html: '<p>Lamentablemente con este ocular no consigo nuevos detalles. Solamente confirmar todo lo que ya había visto anteriormente. El cielo se ha vuelto más contrastado, eso sí, y las protuberancias de la nebulosa a las 9 y a las 3 me cuesta mucho trabajo verlas, solamente las revelo con visión lateral y tras muchos minutos insistiendo.</p><p>No obstante la imagen es preciosa pues es prácticamente la misma que anteriormente con un mayor tamaño y contraste.</p>'
        },
        {
          boton: '480x - 9’ - 1mm', titulo: 'Delos 4.5mm',
          img: 'ngc40_480x.webp',
          html: '<p>Uff, ¡qué complicada de observar la nebulosa con el 4.5mm! Pero cuando consigo enfocar adecuadamente consigo una imagen impresionante. Confirmo sin lugar a dudas que la zona brillante que veía en la protuberancia de las 9 es una estrella, ya que ahora es visible el 100% de las veces como un punto.</p><p>Pero lo que más me impresiona es el borde de la nebulosa en su zona más luminosa, es decir a las 6. Es increíble pero me parece ver una especie de estructura. Está claro que no es uniforme, pero me es complicado encontrar algún detalle, quizás que existe alguna especie de ruptura, que parte la uniformidad del anillo.</p><p>Es espectacular que pueda sacar tal detalle a una zona tan pequeña de la nebulosa.</p><p>El otro rasgo que me deja enganchado en el ocular es el arco que veo saliendo desde la nebulosa en su parte de la 1. Un precioso arco tenue que sobresale de la nebulosa como expandiéndose en el universo. Qué maravilla.</p><p>Increíble lo que puede dar de sí los aumentos en una nebulosa planetaria.</p>',
          anexos: [
            { img: 'ngc40_480x_detalle.webp', titulo: 'Diferencias de brillo', pos: 'right' }
          ]
        }
      ]
    }],
    ngc6826: [{
      // ── Observación 1 (metadatos de ESTA observación) ──
      observador: 'autor',
      fecha: null,        // p. ej. '2025-11-14'
      lugar: null,        // p. ej. 'Sierra de Grazalema'
      instrumento: null,  // p. ej. 'Dobson 305 mm'

      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/ngc6826_inv.pdf',
      defaultIndex: 1,
      entries: [
        {
          boton: 'Exploración', titulo: 'NGC 6826. Exploración',
          img: null,
          html: '<p>Síntesis de la observación. La «Nebulosa Parpadeante» va revelando su estructura conforme se sube de aumentos:</p><ul style="margin:8px 0;padding-left:20px;"><li>Campo estelar rico de Cygnus; par de estrellas brillantes de referencia a las 3 (visibles en buscador 7x50)</li><li>Estrella imposible de enfocar con un pequeño anillo brillante alrededor</li><li>El efecto de «parpadeo» se pierde con 18” por el gran brillo</li><li>Sin color: gris plata, sin tonalidad azulada ni verdosa</li><li>Borde más brillante que el interior; vuelve a crecer el brillo en la estrella central</li><li>Dos zonas de brillo simétricas a la 1 y a las 7 (arcos / FLIERS)</li><li>Interior moteado, no uniforme</li><li>Halo exterior muy tenue (con filtro)</li><li>Forma de reloj de arena en dirección 12-6</li><li>«Hendidura» o hueco de menor brillo entre la 1 y las 2</li><li>Anillo concéntrico fino rodeando a la estrella central</li><li>Ríos oscuros interiores (hasta cuatro) y dos pináculos hacia la 1 y las 7</li></ul><p style="font-size:13px;color:#9fb6c9;">RASC Finest NGC · Cisne · 19h 44m, +50º 31’. Orientación dobson (invertida): norte abajo, este a la derecha.</p>'
        },
        {
          boton: '70x - 1º 10’ - 6.6mm', titulo: 'Nagler 31mm',
          img: 'ngc6826_70x.webp',
          html: '<p>Muy fácil de localizar. El campo estelar es el propio de Cygnus, lleno de estrellas, muy rico, y a sus tres hay un par de estrellas brillantes muy bonitas que merece la pena dejarlas en el mismo campo que la nebulosa planetaria. Excepto por esas dos estrellas (que pueden servir como referencia para encontrar la nebulosa, pues son visibles en un buscador 7x50), el resto es de una magnitud mucho mayor y por tanto más tenues.</p><p>Pero, entre todas ellas, con un brillo similar, llama la atención que una de ellas no seas capaz de enfocarla y tenga un pequeño anillo muy brillante a su alrededor. Obviamente la nebulosa es muy, muy pequeña con tanto campo y tan pocos aumentos, pero es fácilmente visible. Su forma es totalmente esférica y su brillo similar al resto de estrellas, no necesita visión lateral, y es totalmente visible con visión directa.</p><p>Y esa es una de las curiosidades de esta nebulosa con un telescopio de 18”: que deja de parpadear. Es decir, ahora se hace mucho más complicado realizar el juego de mirar directamente a la nebulosa y verla desaparecer, porque, en este telescopio, su brillo es muy importante. Quizás al principio de observarla, cuando aún mi pupila no se había abierto del todo, pude hacer el juego divertido de mirarla directamente o con visión lateral y apreciar cómo parpadeaba, o cómo aparecía y desaparecía la nubosidad.</p><p>Sin embargo, con una apertura superior a los 400mm, llega incluso a mostrar alguna estructura interna. Incluso a bajos aumentos se ve claramente que el borde de la nebulosa es más brillante que su parte interior, y vuelve a crecer en brillo al mostrar la estrella central.</p><p>Respecto al color, a diferencia de otras nebulosas planetarias, en esta no detecto color alguno. Tiene un precioso gris plata, pero no aprecio ninguna tonalidad, ni azulada ni verdosa.</p><p>Es una imagen bella, con un cielo oscuro y la nebulosa destacando claramente del fondo.</p>'
        },
        {
          boton: '98x - 50’ - 4.7mm', titulo: 'Nagler 22mm',
          img: 'ngc6826_98x.webp',
          html: '<p>¡¡Cómo gana la nebulosa con el 22mm!! Antes era demasiado pequeña para ser observada pero ahora se distingue perfectamente como una hermosa bolita plateada cuyo brillo se concentra en el interior gracias a la estrella que la ha formado.</p><p>Muestra una estructura que no soy capaz de identificar incluso con este salto en aumentos. Forzando la vista me da la sensación de que en los extremos de la nebulosa se concentra el brillo. Es decir, el borde exterior de la nebulosa no es uniforme, sino que presenta, simétricamente, dos zonas que parecen un poco más brillantes que el resto. No obstante no puedo confirmarlo al 100% y por ello salto al siguiente ocular deseando encontrar nuevos detalles.</p>'
        },
        {
          boton: '154x - 28’ - 3mm', titulo: 'Delos 14mm',
          img: 'ngc6826_154x.webp',
          html: '<p>Por fin consigo una imagen clara de la nebulosa. Ahora, gracias a estos aumentos, confirmo definitivamente el aumento de brillo en las regiones de la 1 y las 7. Son como dos especies de halos más brillantes, o dos arcos en los bordes de la nebulosa. Hay nebulosas planetarias que tienen un borde muy definido y más brillante que el resto del objeto. No es el caso de NGC 6826, la cual muestra un borde definido, pero no mucho más brillante que el resto. Excepto en esas dos regiones, donde claramente hay un aumento de brillo que yo imagino en forma de arco.</p><p>Por otro lado, el interior no parece uniforme ni mucho menos, sino que está lleno de zonas de diferente brillo que generan una imagen moteada por toda la nebulosa.</p><p>La visión con filtro mejora bastante, haciendo que la nebulosa esté mucho más contrastada y que sus zonas más brillantes sean más fáciles de observar. Sin embargo pierdo algunos detalles porque la imagen se me aplana bastante. No obstante me parece apreciar una especie de halo mucho más tenue, exterior a la nebulosa, no muy extenso, prácticamente pegado a la propia nebulosa. Como si se extendiera un poco más de tamaño, no más de 1/5 de su tamaño original.</p>'
        },
        {
          boton: '216x - 27’ - 2.1mm', titulo: 'Ethos 10mm',
          img: 'ngc6826_216x.webp',
          html: '<p>Con el 10mm la imagen ha mejorado muchísimo y, sin lugar a dudas, prefiero la visión sin el filtro que con el filtro, pues aprecio muchos más detalles. Primero, que el brillo de la nebulosa no es uniforme y me ha recordado sutilmente a la nebulosa de la Hélice, me explico. La nebulosa es muy brillante en su interior, donde está la estrella que la formó. Luego, a su 1 y 7 hay una zona de concentración de brillo que ya no me parece un arco, sino simplemente una región más brillante y bastante pequeña. Pero ahora lo que más me ha llamado la atención es que el brillo de la nebulosa parece crecer en dirección 12-6, como una especie de reloj de arena. Es decir, desde la estrella central, el brillo que la rodea es más intenso en dirección de las 6 y en dirección de las 12, y cuánto más se aleja de la estrella central, más grande se hace esta zona brillante, pareciendo dos conos invertidos que formarían este reloj de arena.</p><p>Por último, en el área entre la 1 y las 2, cercana a esta región más brillante, hay como una especie de «hendidura» o zona sin brillo. Como si la nebulosa tuviera una especie de bocado en esa región, siendo mucho más tenue que el resto.</p><p>La verdad es que no me imaginaba una estructura tan compleja en esta nebulosa.</p><p>Cuando he vuelto a este ocular tras pasar por el 8mm y 4.5mm he podido confirmar un anillo interior que rodea a la estrella central.</p>'
        },
        {
          boton: '270x - 22’ - 1.7mm', titulo: 'Ethos 8mm',
          img: 'ngc6826_270x.webp',
          html: '<p>Impresionante lo bien que se ve la nebulosa con el 8mm. Es una verdadera delicia, y gracias a que el cielo se estabiliza unos minutos soy capaz de descubrir un detalle que no veía en oculares anteriores (aunque posteriormente he vuelto al ocular de 10mm y, efectivamente, a esos aumentos también se observa). Rodeando a la estrella central hay un anillo PRECIOSO y muy fino.</p><p>Es toda una belleza observar este anillo concéntrico alrededor de la estrella central. Me deja embobado por minutos contemplando lo delicado de la estructura. Resumiendo lo que veo: la nebulosa es muy brillante y presenta un claro borde exterior, aunque no más brillante que el resto de la misma, pero es muy fácil distinguir dónde termina la nebulosa, al menos con estos aumentos en donde ha desaparecido esa especie de pequeño halo que la rodeaba. Dentro de este borde la nebulosa no presenta un brillo uniforme sino que se dibujan una serie de zonas separadas por unas líneas más oscuras. Llego a contar hasta cuatro de estos ríos más oscuros. Son estos ríos los que daban la forma de reloj de arena que veía en el ocular anterior. Esta zona de parches brillantes y oscuros finaliza en un anillo concéntrico, tenue pero visible con visión lateral, que rodea a la estrella central, la cual queda sumergida en una zona más oscura aún, con lo que el anillo interior parece ser un anillo concéntrico del más exterior.</p><p>De este anillo interior emergen dos pináculos que finalizan en una región más brillante. Son los puntos de la región de las 7 y la 1 que antes veía como arcos y después más puntuales como regiones concretas.</p><p>Además, encima de la zona brillante de la 1 hay una zona claramente de menor brillo, como una especie de hueco que rompe el anillo exterior.</p><p>ESPECTACULAR.</p>'
        },
        {
          boton: '480x - 9’ - 1mm', titulo: 'Delos 4.5mm',
          img: 'ngc6826_480x.webp',
          html: '<p>Qué preciosidad de imagen con el 4.5mm. Aunque la mayor frustración es no ser capaz de definir mejor lo que estoy viendo por falta de enfoque. Porque la misma destaca muchísimo y es claramente visible en el ocular, pero la veo un tanto borrosa y por ello me cuesta identificar algunas partes.</p><p>Sin embargo, gracias a pasar a este ocular es cuando confirmo la existencia del anillo concéntrico que rodea a la estrella central. En el 4.5mm, a pesar de ser más evidente, es también más tenue que en el 10mm o en el 8mm, donde es claramente visible.</p><p>Una imagen magnífica para finalizar la observación de la nebulosa. Muy bella.</p>'
        }
      ]
    }],
    ngc6905: [{
      // ── Observación 1 (metadatos de ESTA observación) ──
      observador: 'autor',
      fecha: null,        // p. ej. '2025-11-14'
      lugar: null,        // p. ej. 'Sierra de Grazalema'
      instrumento: null,  // p. ej. 'Dobson 305 mm'

      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/ngc6905_inv.pdf',
      defaultIndex: 1,
      entries: [
        {
          boton: 'Exploración', titulo: 'NGC 6905. Exploración',
          img: null,
          html: '<p>Síntesis de la observación. La «Nebulosa del Fogonazo Azul» (Blue Flash) va revelando su estructura conforme se sube de aumentos:</p><ul style="margin:8px 0;padding-left:20px;"><li>Campo rico; dos estrellas muy cercanas que parecen formar conjunto con la planetaria</li><li>Color azul-verdoso (turquesa) a bajos aumentos; gris a altos aumentos</li><li>Forma esférica que se rompe en una especie de reloj de arena achatado (arcos a las 6 y 12)</li><li>Zona de las 6 más brillante que la de las 12</li><li>Salientes / «lazo» hacia las dos estrellas compañeras (conos a las 9 y 3)</li><li>Estrella central</li><li>Interior moteado, red de grumos / filamentos</li><li>Anillo oscuro aparente alrededor de la estrella central (efecto de visión lateral)</li></ul><p style="font-size:13px;color:#9fb6c9;">Herschel 615 · Delfín · 20h 22m, +20º 06’. Orientación dobson (invertida): norte abajo, este a la derecha.</p>'
        },
        {
          boton: '70x - 1º 10’ - 6.6mm', titulo: 'Nagler 31mm',
          img: 'ngc6905_70x.webp',
          html: '<p>Fácil nebulosa planetaria para un 18”, con un bello color azul. El nombre le viene perfecto a este objeto pues realmente parece un flash azul en mitad de la noche, dado su color que diría que es azulado tirando a verdoso.</p><p>Lo primero, el campo: hay multitud de estrellas pero llama especialmente la atención dos estrellas muy cercanas a la planetaria y que dan la sensación de que es un conjunto único, dada su distribución.</p><p>El tamaño a estos aumentos es realmente pequeño aunque fácilmente distinguible porque posee un volumen totalmente distinto al puntual que muestran las estrellas. Su forma es totalmente esférica sin identificar ningún detalle que rompa esa forma tan perfecta.</p><p>Respecto a su brillo, no hace falta decir que es muy brillante, se puede observar perfectamente sin necesidad de visión lateral pues destaca claramente sobre el resto de estrellas. A estos aumentos no puedo destacar muchos más detalles, quizás que el brillo no parece uniforme: la región de las 6 parece un poco más brillante que la zona de las 12. Pero es una diferencia muy tenue. Sin duda tengo que añadir más aumentos, vamos allá.</p>'
        },
        {
          boton: '98x - 50’ - 4.7mm', titulo: 'Nagler 22mm',
          img: 'ngc6905_98x.webp',
          html: '<p>Una imagen bastante similar con el 22mm, sin embargo tengo la impresión de que los colores se magnifican con este ocular. Desde siempre, el Nagler T4 de 22mm me ha parecido un ocular excelente, pero es ahora con el 18” cuando más estoy disfrutándolo.</p><p>La nebulosa sigue sin mostrar más detalle que las dos regiones ya identificadas y su color claramente turquesa o verde-azulado. La zona de las 12 es un poco más tenue que la de las 6, pero en realidad es el arco de las 6 y el arco de las 12, es decir el borde más exterior de la nebulosa, lo que parece más brillante. No toda la región.</p><p>Utilizo en este ocular el filtro L-Enhance de Optolong y la diferencia es abismal. La nebulosa gana muchísimo brillo y se hace más evidente la diferencia de ambas zonas, sin embargo también tengo la sensación de que pierdo un poco de detalle. Me parece que la nebulosa antes era un poco más compleja y ahora parece un poco más «plana». Sigo añadiendo aumentos para descubrir todo lo que ofrece.</p>'
        },
        {
          boton: '154x - 28’ - 3mm', titulo: 'Delos 14mm',
          img: 'ngc6905_154x.webp',
          html: '<p>Qué maravilla poder identificar nuevos detalles en las nebulosas planetarias cuando se añaden más aumentos en el telescopio.</p><p>Nueva información se muestra en la nebulosa a costa de perder cualquier referencia de color, pues ahora la veo de un suave color gris, sin ninguna tonalidad azulada. Pero merece la pena. Lo primero que descubro son una especie de salientes desde la nebulosa hacia las dos estrellas compañeras. Es muy tenue, pero gracias a la visión lateral se puede observar sin problemas. Diría que es como una especie de lazo que quiere atrapar las dos estrellas compañeras y de hecho lo consigue. Esta nueva sección de la nebulosa hace que la misma haya perdido su forma esférica para parecer una esfera con dos conos a sus 9 y 3.</p><p>El siguiente detalle que empiezo a percibir es la diferencia tan clara de brillo que hay en la nebulosa. Independientemente de que la sección de las 6 sea más brillante que la de las 12, en realidad la nebulosa es bastante simétrica. Las zonas de las 6 y 12 muestran ambas un arco brillante exterior que se va «estrechando» y perdiendo brillo cuando cae hacia el centro de la nebulosa. Me parece como una especie de reloj de arena muy achatado, y con una base y un techo curvo en vez de plano.</p>'
        },
        {
          boton: '216x - 27’ - 2.1mm', titulo: 'Ethos 10mm',
          img: 'ngc6905_216x.webp',
          html: '<p>Un nuevo detalle se descubre con este ocular: la estrella central.</p><p>Al principio, me pareció que la imagen era bastante similar al ocular anterior pero simplemente un poco más grande y con muchísimo más campo para poder observar cómodamente. Pero a base de insistir en la observación me percaté de algo que parecía que había cambiado. El brillo de la nebulosa no era, como anteriormente, más brillante en el exterior y disminuyendo su brillo hacia el centro hasta volver a crecer por el extremo contrario. Con este ocular empezaba a ver que el brillo volvía a aumentar en el centro de la nebulosa. Así que, usando la visión lateral y dedicándole algunos minutos más, pude concluir que ese aumento de brillo parecía que no tenía volumen sino que era puntual. Estaba viendo la estrella que había originado este magnífico espectáculo de la naturaleza.</p><p>Casi sin poder contenerme pasé al siguiente ocular para intentar identificar nuevas peculiaridades.</p>'
        },
        {
          boton: '270x - 22’ - 1.7mm', titulo: 'Ethos 8mm',
          img: 'ngc6905_270x.webp',
          html: '<p>Cómo varía la nebulosa planetaria en este ocular. Parece una tontería pero es una impresión que estoy acumulando objeto tras objeto: las imágenes de un mismo objeto a bajos aumentos y a altos aumentos NO tienen que ser ni remotamente similares.</p><p>Ahora, a 270x y 1.7mm de pupila de salida, la nebulosa ha cambiado sustancialmente. Lo primero es que los arcos que salían desde la nebulosa hasta las estrellas han desaparecido, o al menos yo no soy capaz de detectarlos. Lo segundo es que el interior de la nebulosa ha dejado de ser uniforme. Antes apreciaba diferencia de brillo en distintas zonas pero siempre con un fondo uniforme; ahora, sin embargo, me parece ver una especie de red o grumos que se extiende por toda la nebulosa. La zona de las 6 sigue siendo la más brillante sin lugar a dudas, pero incluso en las zonas más tenues de las 9 y de las 3 observo una especie de red compleja, de moteado uniforme que aparece sobre todo al usar la visión lateral.</p><p>Además la estrella central es mucho más evidente y, alrededor de la misma, parece dibujarse un anillo más oscuro, como si la estrella quisiera mostrar todo su protagonismo sin la molestia de la nebulosa. Sin duda es un efecto óptico provocado cuando uso la visión lateral por la diferencia de brillo concentrada en un punto y el brillo superficial del resto de la nebulosa.</p><p>Pero todo ello muestra la imagen más hermosa que he logrado de la nebulosa hasta ahora. Y a pesar de que no tiene ningún color, solamente veo grises (a bajos aumentos su color era precioso), lo intrincado y complejo de su interior me tiene embobado durante minutos y minutos en el ocular.</p><p>Siempre que descubro algo así no puedo evitar emocionarme, que el corazón se me acelere y en mi interior me imagino como un niño pequeño dando saltitos de alegría. Qué belleza.</p>'
        },
        {
          boton: '480x - 9’ - 1mm', titulo: 'Delos 4.5mm',
          img: 'ngc6905_480x.webp',
          html: '<p>Lamentablemente no conseguí una imagen mejor con estos altos aumentos pero me sirvió para confirmar todo lo anterior. Una preciosidad la complejidad de su interior, los sutiles detalles que se intuyen (porque no puedo decir que lo vea claramente) en esa grumosa superficie que parece bullir. O una fina red de filamentos intrincados tendidos para atrapar peces imaginarios.</p><p>La estrella central destaca claramente en estos aumentos y el efecto visual provocado por la diferencia de contraste se acentúa y pareciera que la estrella está rodeada por un anillo de oscuridad. La zona de las 6 sigue siendo la más brillante y parece como la sección de un toro o cilindro, como si sobresaliera ligeramente de la nebulosa, con volumen frente a lo plano del resto de la imagen.</p><p>Fantástica.</p>'
        }
      ]
    }],
    m17: [{
      // ── Observación 1 (metadatos de ESTA observación) ──
      observador: 'autor',
      fecha: null,        // p. ej. '2025-11-14'
      lugar: null,        // p. ej. 'Sierra de Grazalema'
      instrumento: null,  // p. ej. 'Dobson 305 mm'

      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m17_inv.pdf',
      defaultIndex: 1,
      entries: [
        {
          boton: 'Exploración', titulo: 'M17. Exploración',
          img: null,
          html: '<p>Síntesis de la observación. Sobre la Nebulosa Omega se identifican los rasgos descritos a lo largo de la sesión:</p><ul style="margin:8px 0;padding-left:20px;"><li>Tamaño</li><li>Forma</li><li>Hocico de caballito de mar</li><li>Cresta</li><li>Alas</li><li>Cola</li><li>Parche brillante</li><li>Ríos negros en forma de huella</li><li>Bahía oscura debajo del ala</li><li>Cuello y cuerpo separados por un río negro</li><li>Estrella al borde de un río negro</li><li>Salientes y entrantes en la base de la nebulosa</li><li>Voluptuosidades de regiones brillantes</li><li>Negro profundo de la curva Omega</li><li>Salientes y variaciones de brillo en los ríos negros en forma de huella</li></ul><p style="font-size:13px;color:#9fb6c9;">Catálogo Messier · Sagitario · 18h 20m, -16º 10’. Orientación: N a las 6, O a las 9, S a las 12 y E a las 3.</p>'
        },
        {
          boton: '70x - 1º 10’ - 6.6mm', titulo: 'Nagler 31mm',
          img: 'm17_70x.webp',
          html: '<p>El campo de M17 es precioso por la cantidad de estrellas que hay en el mismo. También llama la atención que son de diversas magnitudes, con muchas de ellas de un brillo importante, en particular en su zona sur.</p><p>La nebulosa es de tamaño medio, ocupando una quinta parte del ocular. Su forma es bien conocida, a mí siempre me recuerda a un pato con el cuello muy curvado. Su brillo es alto y por tanto es muy evidente en el ocular, con el cuerpo del pato brillando más que el resto del objeto. Sin embargo, gracias a la apertura extra de mi telescopio descubro nuevas estructuras de brillo muy inferior.</p><p>Entrando ya en los detalles de la nebulosa, lo primero que describo es la zona más brillante. Es preciosa en el ocular, con unos ríos negros que la dividen en distintas secciones; estas nubes de polvo de la propia nebulosa se pueden observar con menores aperturas pues recuerdo ya haberlas visto anteriormente. El cuello del pato también es precioso, muy brillante, pero aquí ya llega la primera diferencia con telescopios menores. El final de la cabeza del pato me recuerda más a la cabeza de un caballito de mar, es decir, se extiende de forma recta hacia el final y termina también con una línea recta perpendicular. Además termina en dos estrellas brillantes azuladas, que se ven totalmente puntuales otorgando una belleza adicional a la imagen.</p><p>Me gusta tanto lo que estoy viendo que decido describirlo recorriendo la forma de la nebulosa. Comienzo por ese «hocico» plano del pato que no recuerdo haber visto; pero aún hay más, subo por el hocico y llego hasta lo que sería la cabeza del pato, donde la nebulosa hace un giro de 180º precioso, la famosa OMEGA. Encima de la cabeza hay una estrella rojiza, estrella alrededor de la cual observo más nubosidad, lo que sería la «cresta» del pato (vaya animal más mitológico me está quedando). El cuello sigue bajando hacia las 6 para, antes de llegar al cuerpo del pato, verse cortado por una nube de polvo que lo atraviesa de un extremo al otro. Entonces comienza el cuerpo, el cual no es uniforme sino que tiene al menos otros dos ríos en su interior que rompen su uniformidad. Todos ellos muy marcados.</p><p>De nuevo observo algo que nunca antes había visto: encima del cuerpo, entre el cuello y la parte final de la nebulosa brillante del cuerpo, hay más nubosidad aunque mucho más tenue. En mis notas de voz le pongo el nombre de las «alas» del pato. Pero aún hay más, es la primera vez que observo que la nebulosa es mucho más grande de lo que yo siempre había imaginado. La última parte de la nebulosa es una especie de «cola» del pato, pero una cola muy especial: tiene forma de arco. Un precioso arco que no parece conectado con el cuerpo ni con las alas, pero que sin lugar a dudas está ahí, justo a mitad de camino de llegar a una estrella dorada que hay a las 2.</p>',
			anexos: [
            { img: 'm17_70x_detalles.webp', titulo: 'Zonas de la nebulosa' }
          ]
        },
        {
          boton: '98x - 50’ - 4.7mm', titulo: 'Nagler 22mm',
          img: 'm17_98x.webp',
          html: '<p>El 22mm me permite confirmar todo lo que he descrito anteriormente y me deja varios minutos pegado al ocular. Qué preciosidad de imagen.</p><p>La nebulosa gana en tamaño y contraste sin perder ninguna de sus características, por lo que su belleza se ve acrecentada. La cola del pato es la nubosidad más tenue que veo de todo el conjunto pero me sigue llamando la atención por la sutileza de la misma. Sin embargo es el cuerpo donde empleo más minutos disfrutando de la visión sosegada. En concreto hay una zona que me llama especialmente la atención porque es un parche muy brillante. Creo que resalta tanto porque está delimitada por el norte por el río de polvo oscuro que separa cuerpo y cuello, y por el este por otro río negro no tan intenso como el anterior pero igualmente evidente.</p>',
			anexos: [
            { img: 'm17_98x_detalles.webp', titulo: 'Ubicación del parche brillante' }
          ]
        },
        {
          boton: '154x - 28’ - 3mm', titulo: 'Delos 14mm',
          img: 'm17_154x.webp',
          html: '<p>¡¡UAAAUUUUU!! Me quedo tan maravillado cuando coloco el ocular de 14mm que por un segundo creo que estoy viendo otro objeto distinto que se ha colocado ahí como por arte de magia.</p><p>Lo primero es que la nebulosa encaja perfectamente en el ocular, incluso la cola, pero no mucho más. Ocupa casi la mitad del mismo. Este aumento de tamaño permite observar con una comodidad que se agradece.</p><p>Empiezo, igual que en el ocular de 31mm, por el hocico del caballo de mar. Me parece precioso por lo alargado y fino que es, pero además es tremendamente complejo, con muchas estrellas dentro del mismo y con algunos entrantes en la orilla de la nebulosa que mira hacia el cuello. Porque además, el cuello es especialmente bello en esa zona, ya que su orilla interior termina abruptamente en una región muy negra. Es una delicia seguir los bordes de la nebulosa de una forma tan contrastada contra el fondo de estrellas. La nebulosa de la cresta ahora es mucho más evidente y grande, separada claramente de la cabeza. Parece además como una especie de V, más estrecha en la parte que se acerca a la cabeza y más ancha hacia fuera. Quizás sea una ilusión que provoca la estrella en donde está esta nebulosa.</p><p>Sigo recorriendo el cuello por su parte interior (la contraria a la cresta) que es de un negro hermosísimo, y llego a dos estrellas justo antes del río que impide que cuerpo y cuello se unan. Pero es a los pies de ese río donde descubro un nuevo detalle que me sorprende. En esa área del cuerpo hay un tridente, o como hablamos de un animal, una pata con tres pezuñas. Como la huella de un león pero con tres dedos en vez de cuatro. Estas zonas se delimitan por dos canales oscuros. Detrás de ellos (hacia las 3) está el parche de brillo que me sorprendió tanto en el 22mm y un nuevo río tenue que genera una nueva zona brillante a las 6 de la anteriormente descrita. El cuerpo de la nebulosa continúa sin más variaciones, pero esta parte de la «huella» es tremendamente compleja, con la nebulosa retrocediendo ante entrantes oscuros. Es toda una belleza forzar la visión lateral para sacar los detalles que en esa zona se esconden.</p><p>Me quedo embobado algunos minutos más con la región tenue de la cola, sin poderle sacar más detalle que ese bello arco que expande el tamaño de la nebulosa.</p><p>No quiero terminar la descripción con este ocular sin resaltar la cantidad de variaciones de brillo que observo en la nebulosa. Ya no es solamente que existan regiones de polvo que aparecen como ríos negros que dividen partes de la nebulosa, es que además la misma brilla con distinta intensidad en distintas zonas. Todo ello lo hace muy complicado de describir pero a la vista es sorprendente. Una maravilla.</p>',
			anexos: [
            { img: 'm17_154x_detalles.webp', titulo: 'Canales oscuros que forman la huella del león' }
          ]
        },
        {
          boton: '216x - 27’ - 2.1mm', titulo: 'Ethos 10mm',
          img: 'm17_216x.webp',
          html: '<p>Me sorprende cómo la nebulosa sigue permitiendo crecer aumentos sin llegar a perder nada de su belleza. Hasta 216x soy capaz de observar todos los detalles que ya he descrito pero a un mayor tamaño y con mejor contraste.</p><p>Es alucinante la verdad. Qué espléndida visión de una nebulosa de emisión creadora de estrellas.</p><p>En este ocular además distingo algunos detalles en las alas. En concreto en su parte final, que la delimito con una estrella brillante bajo la cual veo una especie de bahía oscura que retrae el ala.</p><p>La zona de la huella y la unión del cuello son espectaculares con este ocular. Hay dos estrellas muy brillantes en el propio borde del cuello, luego viene el río negro tan marcado con este ocular que se ve claramente cómo cuello y cuerpo están separados. Justo, atravesando este río negro, en la otra orilla, hay una tercera estrella, también preciosa, en el nacimiento de la nubosidad de la huella. Y un poco más hacia abajo, al final de un nuevo río negro perpendicular al anterior, hay otra estrella débil, pero claramente destacable entre la nubosidad tenue y compleja de la huella.</p>',
			anexos: [
            { img: 'm17_216x_detalles.webp', titulo: 'Estrellas y canales negros' }
          ]
        },
        {
          boton: '270x - 22’ - 1.7mm', titulo: 'Ethos 8mm',
          img: 'm17_270x.webp',
          html: '<p>No gano tanto con este salto de ocular. La nebulosa se ve un poco más grande pero también es cierto que he perdido un poco de contraste.</p><p>Vuelvo a confirmar las descripciones previas pero no consigo descubrir nada nuevo. Pero a pesar de todo empleo varios minutos en disfrutar de esta imagen tan preciosa de M17 y su muy compleja estructura.</p>'
        },
        {
          boton: '480x - 9’ - 1mm', titulo: 'Delos 4.5mm',
          img: 'm17_480x.webp',
          html: '<p>Nunca podía imaginar la sorpresa de la que iba a disfrutar al ver objetos de espacio profundo con tantos aumentos. Siempre había pensado que llegar a tales aumentos era perder el tiempo, pues el objeto se desdibujaría y no vería nada. No podía estar más equivocado.</p><p>Es cierto que voy pasado de aumentos, pero no me importa. Los bordes de la nebulosa son espectaculares. El hocico y la cresta casi los he perdido, pero la cantidad de detalles que se observan en el cuerpo es asombrosa. Centrándome primero en la imagen de los bordes, se observa cómo no hay zonas rectas, algo que engaña con bajos aumentos. La zona más a las 6 de la base de la nebulosa se difumina en el espacio con algunos entrantes y salientes como ondas leves. También hay una región central de la nebulosa más brillante en forma de V, y es en la parte superior de esta V donde más voluptuosidades se observan. Sorprendente.</p><p>Pero es en la zona de la huella donde ya no sé qué adjetivos utilizar. Primero, que la huella me recuerda más a la nebulosa de la Llama (NGC 2024), con esas tres regiones divididas por unas bandas de polvo oscuro. Quizás también por lo tenue que aparece en comparación con otras regiones. Después, por los brillos en la región a las 3 de la huella, llena de gradientes, con subidas y bajadas de brillos en distintas partes, además de entrantes oscuros y salientes tenues. Es una región asombrosa por la cantidad de detalles que se aprecian en el propio interior de la nebulosa, ya no solamente en sus bordes, sino dentro de la misma nebulosa, con brillos distintos. Me es muy complicado ponerle palabras a lo que estoy viendo porque es tan complejo que casi no puedo describirlo, pero simplemente me gustaría indicar que merece muchísimo la pena llegar hasta estos aumentos y sumergirse en esa región.</p><p>Por último, hacer una especial mención a la parte de la omega que gira sobre sí misma. La parte interior de la omega es BRUTAL. El negro en el que termina es tan profundo que pareciera que la nebulosa ha sido borrada o cortada abruptamente. Este contraste es precioso y merece mucho la pena dejarse hipnotizar por esta región brillante y negra, tan diferenciada. Todo un regalo.</p>',
			anexos: [
            { img: 'm17_480x_detalles.webp', titulo: 'El negro profundo de la Omega' }
          ]
        }
      ]
    }],
    m20: [{
      // ── Observación 1 (metadatos de ESTA observación) ──
      observador: 'autor',
      fecha: null,        // p. ej. '2025-11-14'
      lugar: null,        // p. ej. 'Sierra de Grazalema'
      instrumento: null,  // p. ej. 'Dobson 305 mm'

      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m20_inv.pdf',
      defaultIndex: 1,
      entries: [
        {
          boton: 'Exploración', titulo: 'M20. Exploración',
          img: null,
          html: '<p>Síntesis de la observación. Sobre la Nebulosa Trífida se identifican los rasgos descritos a lo largo de la sesión:</p><ul style="margin:8px 0;padding-left:20px;"><li>Tamaño</li><li>Ríos negros</li><li>Cuatro lóbulos</li><li>Cuatro estrellas en el centro (HN 40)</li><li>Nebulosa tenue alrededor de estrella rojiza (nebulosa azul en astrofotografía)</li><li>Meandros del río negro</li><li>Intensidad de oscuridad del río (pirograbado)</li><li>Estrella dentro del río negro</li><li>Rama oscura que parte la zona central de la nebulosa</li><li>Zona brillante emergiendo como acantilados asomados a un abismo negro</li><li>Diferencia de intensidad del río negro, región Este y Oeste</li><li>Embudo que divide la zona central, ancho por un extremo (E) y estrecho en el contrario (O)</li><li>Golfos y cabos en el recorrido del río negro</li><li>Bordes diferentes en las «orillas» del río negro en la zona de HN 40</li><li>División de la zona central que desaparece fundiéndose en el río negro con dos arcos concéntricos</li><li>Lóbulos muy diferentes de la nebulosa (región E-O) en brillo y bordes externos</li><li>Nebulosa tenue en copa invertida al Este de HD 164514</li><li>Nebulosa con parche negro propio que da la forma de copa que se estrecha en su centro</li></ul><p style="font-size:13px;color:#9fb6c9;">Catálogo Messier · Sagitario · 18h 02m, -22º 58’. Orientación: N a las 6, O a las 9, S a las 12 y E a las 3.</p>'
        },
        {
          boton: '70x - 1º 10’ - 6.6mm', titulo: 'Nagler 31mm',
          img: 'm20_70x.webp',
          html: '<p>El campo de M20 es rico en estrellas, pero la nebulosa llama tanto la atención que uno casi no se fija en lo que tiene alrededor.</p><p>Es tan grande que ocupa más de 1/5 del ocular, y su forma es redonda con bordes no uniformes.</p><p>En el telescopio es tan brillante que resalta claramente, y basta con tener algo de experiencia observando para que al segundo se aprecien los ríos negros que dividen los lóbulos tan famosos de la nebulosa. Como detalle a destacar, hay tres estrellas que se definen claramente en el centro de la nebulosa, justo en el borde de uno de los lóbulos. Estas estrellas pueden ser utilizadas para observar el río con mucha más claridad. También llama la atención la estrella rojiza (HD 164514, mag 7.42) que hay a las 6 de la nebulosa pues, sin duda, existe una nubosidad más tenue que la rodea. Es una nubosidad que no recuerdo haber observado jamás en visual y me llama la atención por su sutileza. No puedo evitar recordar las imágenes tan bellas de esta nebulosa en astrofotografía con esos dos colores tan diferentes (rojo y azul). Yo no aprecio color alguno aunque sí distingo claramente las nebulosas como dos regiones de diverso brillo.</p><p>Para establecer las referencias estándar, actualmente estoy mostrando la nebulosa con la orientación: N se encontraría a las 6, O a las 9, S a las 12 y E a las 3.</p>',
          anexos: [
			  { img: 'm20_70x_detalles.webp', titulo: 'Zoom a la agrupación de estrellas HN 40', pos: 'right' }
          ]
        },
        {
          boton: '98x - 50’ - 4.7mm', titulo: 'Nagler 22mm',
          img: 'm20_98x.webp',
          html: '<p>Con el 22mm es una maravilla. Es espectacular observar los ríos negros que tiene en su interior. Las cuatro zonas de la nebulosa se distinguen perfectamente; bueno, en realidad hay tres de ellas (las que corresponden a la región norte, este y sur de mi ocular) que se aprecian muy bien, y la cuarta es un poco más tenue debido a que el río que la divide es más pequeño. Es la que corresponde con la posición de las 7 en mi ocular. No obstante se pueden observar todas ellas con comodidad con este ocular.</p><p>Como detalle extra, distingo no tres sino cuatro estrellas en la región central de la nebulosa. Es una zona especialmente bella porque es muy brillante. Por diferencia de magnitud primero observo dos estrellas claramente, muy brillantes ambas. Luego, a las 5 de estas estrellas, hay otra estrella mucho más tenue pero que también se observa con facilidad. La más complicada de observar es la estrella que se sitúa a las 12 de las primeras dos estrellas. Cuesta mucho trabajo detectarla y he de usar tanto la visión lateral como el viejo truco de darle un pequeño golpecito al ocular para que, al vibrar brevemente, mi ojo detecte aquellas zonas con variación de brillo. Gracias a estas técnicas puedo verificar la cuarta estrella.</p><p>Estas estrellas (HN 40) fueron descritas por S.W. Burnham en su Celestial Handbook volumen 3 como: «Una hermosa estrella triple está situada precisamente en el borde de una de estas masas nebulosas, justo donde la vacante inferior se bifurca en dos canales...». Utilizando el gran refractor de 36 pulgadas del Observatorio Lick, S.W. Burnham encontró un total de 6 estrellas en este sistema.</p><p>Revisando la información de Burnham, creo que vi las estrellas C-D como si se tratara de una estrella única (no llegué a resolverlas) y, junto con la estrella A, lo describí como si fuera un sistema doble. También vi fácilmente la estrella B, y la que más me costó descubrir fue la estrella E, pero que también es visible en un 18”.</p>',
          anexos: [
			  { img: 'm20_98x_hn40_foto.webp', titulo: 'Fotografía de la agrupación de estrellas central HN 40', pos: 'right'},
			  { img: 'm20_98x_hn40.webp', titulo: 'Agrupación de estrellas central HN 40 (referencia para las estrellas A–E de Burnham)'}
          ]
        },
        {
          boton: '154x - 28’ - 3mm', titulo: 'Delos 14mm',
          img: 'm20_154x.webp',
          html: '<p>Nunca deja de sorprenderme este ocular: el campo se ha reducido totalmente y la nebulosa ahora ocupa prácticamente todo el campo del ocular, es espléndida. Vuelvo a confirmar las cuatro estrellas que vi anteriormente en la parte más central de la nebulosa. Pero en lo que más centro mi atención con este ocular es en la forma del río negro que divide las diversas áreas de la nebulosa. Me impresiona mucho el negro tan profundo que muestra; en contraste con la nebulosa es una preciosidad, especialmente en algunas partes concretas.</p><p>Describo en mis notas de voz: el río negro empieza en la región sur adentrándose hasta el interior de la nebulosa, llegando a la zona de HN 40 ya descrita. Se ve perfectamente cómo estas estrellas están en la nubosidad y el río gira hacia la 1 rodeando estas estrellas, en una curva o «meandro» precioso, muy marcado. Al poco vuelve a girar, esta vez hacia la izquierda, con un contraste también asombroso; creo que es de lo más bello que se puede ver en la nebulosa. Y el río continúa luego separándose en dos ramales, uno hacia las 10 y otro hacia las 7.</p><p>No deja de asombrarme la tonalidad tan oscura del río, de un negro azabache, más negro que el fondo de estrellas que observo alrededor de la nebulosa. Para rematar la impresión, dentro del propio río, cerca de las estrellas brillantes donde hace el primer giro, hay una estrella pálida pero claramente visible, en el propio río. Alucinante. Especialmente la primera parte del río, esa que está en la zona más a la derecha de mi ocular, tiene un contraste negro maravilloso. Un río de tinta negra.</p><p>Sobre la nebulosidad más tenue del sur, sigue apreciándose con este ocular y quizás tiene una forma de cuna. No aprecio mucho más detalle pero sigue estando ahí.</p>'
        },
        {
          boton: '216x - 27’ - 2.1mm', titulo: 'Ethos 10mm',
          img: 'm20_216x.webp',
          html: '<p>¡Qué maravilla de imagen! El contraste de la nebulosa ha aumentado muchísimo desde que la observé con el 31mm. En aquel primer ocular la nebulosa era evidente pero pálida; con el 10mm es increíblemente contrastada, con el río que delimita cada región como su rasgo principal. Adicionalmente a todo lo que ya he expresado y que en este ocular no hace más que confirmarse con mayor detalle, facilidad y belleza, descubro un nuevo rasgo. En la región central de la nebulosa hay un par de estrellas que se ven claramente. La segunda de ellas, la que está más colocada hacia el norte de mi ocular, me sirve de referencia para una nueva rama oscura que parece separar la nebulosa central en dos partes. No puedo confirmar si esta línea oscura realmente divide a la nebulosa, pues es claramente visible en la región más cercana a HN 40 que ya describí, como un saliente que entrara en la nebulosa para partirla por la mitad. Al recorrerlo con la vista aprecio que se va estrechando y no puedo llegar a confirmar si se conecta con el otro lado del río o no, provocando realmente la división de la nebulosa en una isla central. A veces me da la sensación de que sí se llega a romper y otras veces no. Así que no puedo confirmarlo al 100%.</p><p>Más detalles sorprendentes de este ocular: el contraste tan bello entre el río negro y los bordes de la nebulosa. No se me ocurre un mejor ejemplo para expresarme que el pirograbado. Para aquellos que lo hayan practicado, se habrán sorprendido del negro tan profundo que se logra con una presión suficiente en la madera, que además hace retroceder la madera dejando la capa original elevada por encima de aquella que se ha pirograbado. Ese mismo sentimiento tenía yo al ver los ríos de la nebulosa Trífida. El negro es tal que parece que sea un abismo que se precipita a las profundidades de la nebulosa, haciendo que la zona brillante emerja como los bordes de un acantilado.</p><p>Vuelvo a remarcar en mis notas de voz la diferencia de intensidad del río en la región de las 3 y de las 9. En la región de las 3, donde están las cuatro estrellas, el grado de oscuridad del río es extremo, mientras que en la región de las 9 es negro pero claramente más pálido y no contrasta tanto contra los bordes de la nebulosa.</p><p>Por último me fijo en la nebulosa tenue alrededor de la estrella HD 164514. Me llama la atención la forma de la nebulosa a las 5 de la estrella brillante. Tengo la sensación de ver una especie de copa triangular invertida. Es decir, la nebulosa envuelve a la estrella brillante, pero mirando a las 5 de la estrella veo una zona sin nubosidad para volverme a encontrar otra nubosidad más tenue, de forma triangular, ya alejada de la estrella. Lo remarco con una imagen extra en la ficha.</p>',
          anexos: [
            { img: 'm20_216x_copa.webp', titulo: 'Nebulosa tenue en «copa invertida» a las 5 de HD 164514', pos: 'right' }
          ]
        },
        {
          boton: '270x - 22’ - 1.7mm', titulo: 'Ethos 8mm',
          img: 'm20_270x.webp',
          html: '<p>Creo que la visión era mejor con el ocular anterior. Al pasar al 8mm, aunque he ganado en tamaño también he perdido un porcentaje de luz que hace que la imagen, en general, palidezca.</p><p>También se ve reducido su tamaño, pues las zonas más tenues del exterior de la nebulosa han desaparecido.</p><p>De todas formas este ocular me sirve para verificar todo lo ya observado; incluso en la nubosidad tenue que rodea a la estrella brillante de las 6 confirmo la zona de las 5 con un brillo pálido y una nueva región de polvo estelar que divide la nebulosa.</p>'
        },
        {
          boton: '480x - 9’ - 1mm', titulo: 'Delos 4.5mm',
          img: 'm20_480x.webp',
          html: '<p>Merece la pena llegar hasta estos aumentos aunque pueda parecer excesivo.</p><p>El aumento es tal, y el campo aparente tan pequeño, que la nebulosa no se ve completa en el ocular y he de utilizar los motores para recorrerla completamente.</p><p>El brillo de la nebulosa se ha reducido significativamente, así como su contraste, dejando solamente visibles las zonas más brillantes. Pero esto es suficiente para obtener una imagen distinta de la nebulosa, o siendo más preciso, una imagen más detallada. Por ejemplo, la zona central de la nebulosa ahora sí que la veo separada del resto del lóbulo sur por un pequeño canal que en la zona de las 3 es ancho pero que se va estrechando a medida que profundiza en la nebulosa para terminar uniéndose al río oscuro en el tramo opuesto.</p><p>Los bordes de la nebulosa son ahora impresionantes, están llenos de entrantes y salientes, como ensenadas o cabos que hacen que las orillas del río sean muy irregulares. En concreto me fijo en el área de las cuatro estrellas brillantes, con la quinta estrella ya fuera de la nebulosa en el propio río negro. Es muy hermosa esta zona por el contraste tan fuerte entre nebulosa y nube de polvo estelar, con además un ensanche de la nube de polvo que se divide subiendo hacia las 12 y girando hacia las 9. Es maravillosa esa zona y me deja varios minutos clavado en el ocular con la estrella tenue brillando solitaria en medio de la oscura nube de polvo.</p><p>Con estos aumentos soy también capaz de diferenciar las dos orillas de la nebulosa: la orilla que forma parte del lóbulo de abajo es más suave, deshaciéndose ante el río de polvo estelar, mientras que su orilla opuesta, la del lóbulo de la derecha, son acantilados que caen en picado desde una zona de brillo a un área totalmente negra. Además veo más estrellas individuales en la orilla suave de abajo, algunas de ellas de nuevo dentro del río de polvo estelar. Es una preciosidad, y me cuesta trabajo imaginar la nebulosa como un todo pues me centro en regiones específicas.</p><p>No me puedo creer que esté viendo el mismo objeto que observé con el 31mm; es como si me estuviera sumergiendo en la nebulosa y eso la hace cambiar totalmente. Antes era una nebulosa importante pero tenue, ahora es un mundo de nubosidades diferentes con multitud de detalles difíciles de describir pero que se diferencian aquí y allá. Dos mundos distintos sin lugar a duda: observar el mismo objeto a bajos y altos aumentos.</p><p>Cuando observo la región de la izquierda, la nebulosa desaparece en el borde del ocular sin apreciar realmente dónde termina. Esta región, junto con la isla central, es totalmente distinta al área de la derecha. Aquí el río de polvo estelar es más estrecho, con un negro menos profundo y algunos parches de nubosidad aquí y allá que confundo con estrellas pero que identifico como nubosidad al no ver ninguna puntualidad. La isla central de la nebulosa tiene dos zonas también muy diferenciadas: la parte sur tiene un brillo similar al del lóbulo desde el que se «desprende» pero cortada con un estrecho canal negro de polvo estelar. Sin embargo la región norte de la isla parece diluirse en brillo, extendiéndose dentro del río de polvo que aparece claramente al contrastarlo con la orilla sur del lóbulo norte. Pareciera incluso que la isla se extiende con un par de arcos concéntricos, como ondas que se adentran en el río de polvo.</p><p>Por último vuelvo la vista a la nebulosa alrededor de la estrella en el sur de mi ocular. Distingo claramente cómo la zona de mayor brillo está a las 9 y a las 3 de la estrella, no apreciando nubosidad entre la estrella y la nebulosa Trífida. Sin embargo, la región de las 3 sube hasta llegar a unirse con la nebulosa. También observo la separación de la zona triangular de las 5 por un hilo negro que asocio a otra banda de polvo estelar en esa nebulosa.</p>'
        }
      ]
    }],
    m22: [{
      // ── Observación 1 (M22) ──
      observador: 'autor',
      fecha: null,
      lugar: 'SQM-L 21.60 · IR -22.0º · 16º amb.',
      instrumento: 'Stargate 18”',

      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m22_inv.pdf',
      defaultIndex: 1,
      entries: [
        {
          boton: 'Exploración', titulo: 'M22. Exploración',
          img: null,
          html: '<p>Síntesis de la observación. Sobre el gran cúmulo de Sagitario se identifican los rasgos descritos a lo largo de la sesión:</p><ul style="margin:8px 0;padding-left:20px;"><li>Tamaño</li><li>Brillo en su conjunto frente al cielo oscuro</li><li>Forma esférica</li><li>Niveles de brillo (2)</li><li>Proporción entre halo exterior e interior</li><li>Brazos en la región oeste - sur - este</li><li>Contemplar los detalles de estrellas individuales (decenas brillantes vs centenares tenues) observando a la vez el conjunto</li><li>Agrupación de estrellas en forma de V (región N)</li><li>Canal oscuro al O de las estrellas en V</li><li>Identificar que las estrellas de mayor brillo se encuentran en el borde exterior del núcleo, región O-S</li><li>A grandes aumentos: el halo exterior desaparece, el cúmulo se “comprime”, y las estrellas brillantes flotan en el exterior sin brillo de fondo</li></ul><p style="font-size:13px;color:#9fb6c9;">Catálogo Messier · Sagittarius · 18h 36m, -23º 54’. Orientación: N a las 9, O a las 12, S a las 3 y E a las 6.</p>'
        },
        {
          boton: '70x - 1º 10’ - 6.6mm', titulo: 'Nagler 31mm',
          img: 'm22_70x.webp',
          html: '<p>¡¡Qué maravilla M22 a bajos aumentos!!</p><p>El campo estelar en el que se encuadra M22 es muy rico en estrellas, muchas de ellas de alta magnitud y por tanto muy tenues. Pero ello no roba protagonismo al cúmulo pues su brillo y presencia opaca al resto.</p><p>Es un objeto muy grande, ya que incluso en estos bajos aumentos ocupa un quinto del campo del ocular y por ello se pueden incluso apreciar algunos detalles distintivos. Su forma es totalmente esférica, no cabe ninguna duda de que se trata del típico cúmulo globular que se observa como un enjambre de estrellas formando una esfera preciosa. Es muy brillante y contrasta tremendamente con el cielo oscuro de fondo.</p><p>Respecto a los detalles específicos de este cúmulo, primeramente muestra dos niveles de brillo. Un halo exterior, siempre más tenue, y un núcleo más brillante. La proporción de ambos es bastante equilibrada, es decir ambos poseen más o menos el mismo radio, quizás siendo el núcleo brillante un poco mayor que el halo exterior. Además, con estos aumentos se aprecian hasta 15 estrellas de una magnitud inferior al resto, sobresaliendo en el halo exterior del cúmulo, y quizás por ellas, se puede apreciar una gran cantidad de “brazos” que emergen desde el núcleo del cúmulo. Llego a contar hasta 6 brazos, todos en la región entre las 12 y las 6 siguiendo las agujas del reloj.</p><p>Por último se resuelven estrellas muy, muy cerca de su núcleo por lo que la imagen es sobrecogedora.</p>',
          anexos: [
            { img: 'm22_70x_brazos.webp', titulo: 'Brazos que emergen del núcleo (hasta 6, entre las 12 y las 6)', pos: 'right' }
          ]
        },
        {
          boton: '98x - 50’ - 4.7mm', titulo: 'Nagler 22mm',
          img: 'm22_98x.webp',
          html: '<p>Añadir más aumentos en este objeto es una delicia. El cúmulo ha ganado muchísimo en tamaño y ahora ocupa más de un cuarto del ocular.</p><p>Otro factor que lo hace realmente bello es el equilibrio de brillo que muestra entre el halo exterior y el núcleo interior. Gracias a que el núcleo interior no es tan brillante como en otros cúmulos globulares más concentrados la sensación de estar contemplando un único objeto inmenso es sobrecogedora. Las estrellas además se resuelven perfectamente, como diminutos puntos llenos de luz blanca que captan tu atención en cada zona del cúmulo que observes. Estas estrellas tan luminosas contrastan con el brillo de fondo tan suave que muestra el objeto.</p><p>Merece la pena dedicarle algunos minutos extras con esta pupila de salida, pues gracias a ello, empiezas a resolver estrellas muy tenues en el interior del propio cúmulo, usando la visión lateral. Es realmente difícil de explicar la belleza que muestra el objeto al permitirte disfrutar del brillo del conjunto del objeto, junto con la puntualidad y los detalles de las estrellas más brillantes (unas pocas decenas) y las decenas y decenas que se observan mucho más tenues. Es como si el cúmulo quisiera mostrarse en todo su esplendor sin ocultar nada. Permitiéndote observar cada detalle a la misma vez que puedes disfrutar del conjunto. PRECIOSO el equilibrio tan delicado en brillo que muestra M22. Y es magnífico poderlo disfrutar con estrellas tan finas como puntas de alfiler brillando a tan dispar magnitud.</p>'
        },
        {
          boton: '154x - 28’ - 3mm', titulo: 'Delos 14mm',
          img: 'm22_154x.webp',
          html: '<p>¡¡Uauuuu!! Espectacular la vista que ofrece el cúmulo con mayores aumentos. Ahora el cúmulo ocupa más del 50% del campo del ocular, y con ello revela toda su belleza. No dejo de maravillarme con la suavidad y el equilibrio que muestra el cúmulo globular. Si no fuera por un par de decenas de estrellas brillantes todo el cúmulo sería una miríada magnífica de estrellas tenues. Pero es justamente este contraste entre esas estrellas brillantes las decenas y decenas de estrellas tenues lo que más impresiona. Poder contemplar ambos tipos de estrellas es sobrecogedor. Pero además, el hecho de que las estrellas más tenues sean las más numerosas y con mayor presencia en el núcleo del cúmulo hace que el brillo sea asombrosamente equilibrado entre el halo exterior e interior.</p><p>Una maravilla.</p>'
        },
        {
          boton: '216x - 27’ - 2.1mm', titulo: 'Ethos 10mm',
          img: 'm22_216x.webp',
          html: '<p>No sé si voy a poder aportar más información sobre el cúmulo pero sin lugar a dudas es la mejor visión que estoy teniendo del mismo.</p><p>Es cierto que a bajos aumentos, con el 22mm especialmente, la sensación de conjunto con el universo que lo rodea era preciosa. Pero a estos aumentos, solamente el cúmulo existe. Uno no puede apartar la mirada de su interior o perderse en sus múltiples brazos que no hacen más que aumentar. Ya no sé ni los brazos que cuento.</p><p>Las estrellas más luminosas ahora también parecen ser bastantes más, y en la región de las 7 del cúmulo hay una agrupación en forma de V preciosa. Por encima de esa V se abre un canal que parece romper de alguna forma el cúmulo, desplazando la región central del núcleo hacia las 1.</p><p>Magnífico.</p>',
          anexos: [
            { img: 'm22_216x_v.webp', titulo: 'Agrupación en forma de V y canal oscuro (Dark lane)', pos: 'right' }
          ]
        },
        {
          boton: '270x - 22’ - 1.7mm', titulo: 'Ethos 8mm',
          img: 'm22_270x.webp',
          html: '<p>Con este ocular empiezo a apreciar que voy perdiendo algunos detalles del halo exterior. Lo compruebo porque la V de las 7 aparece ahora en el borde del cúmulo cuando antes parecía formar parte del núcleo.</p><p>Las estrellas más brillantes del halo exterior parecen ahora flotar fuera del cúmulo, y pareciera que el cúmulo se hubiera expandido cuando es justamente al revés. Al perder el brillo más tenue del halo exterior el cúmulo se ha comprimido solamente a su parte más brillante pero mi cerebro parece no entenderlo y debo volver a oculares anteriores para darme cuenta de ello.</p><p>Con todo la imagen es maravillosa. Las estrellas siguen resolviéndose totalmente, en todo el cúmulo, incluso en su parte más central. Ahora se ven algunas estrellas de brillo intermedio entre aquellas que son más brillantes “fuera” del cúmulo y las tenues que forman el núcleo. Estas estrellas intermedias se ven muy bien cerca del núcleo en la región de la 1, y quizás por eso antes también me pareció que el núcleo estaba desplazado.</p><p>Qué placer poder contar tantas y tantas estrellas y tan diferentes en un único objeto. Alucinante.</p>',
          anexos: [
            { img: 'm22_270x_intermedias.webp', titulo: 'Estrellas de brillo intermedio (Middle bright stars) cerca del núcleo', pos: 'right' }
          ]
        }
      ]
    }],
    m27: [{
      // ── Observación 1 (M27) ──
      observador: 'autor',
      fecha: null,
      lugar: 'SQM-L 21.45 · IR -6º · 18º amb.',
      instrumento: 'Stargate 18”',

      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m27_inv.pdf',
      defaultIndex: 1,
      entries: [
        {
          boton: 'Exploración', titulo: 'M27. Exploración',
          img: null,
          html: '<p>Síntesis de la observación. Sobre la nebulosa Dumbbell se identifican los rasgos descritos a lo largo de la sesión:</p><ul style="margin:8px 0;padding-left:20px;"><li>Tamaño</li><li>Niveles de brillo (2)</li><li>Diferencias en las zonas tenues de brillo (regiones E-O)</li><li>Estrella en la nebulosa (TYC 2141-1400-1, mag 12.91)</li><li>Bahía cerca de TYC 2141-1400-1 (borde sur de la nebulosa)</li><li>Aumento de brillo en los bordes N-S</li><li>Diferencias entre los bordes N-S: longitud, forma, contraste</li><li>Gradiente en la región E · capas de menor brillo · arco que delimita su fin</li><li>Región con mayor brillo dentro de la nebulosa con forma de Y</li><li>Diferencia de brillo entre el núcleo y sus regiones N-S</li><li>Volumen en el arco del borde N · arcos finos (sin volumen) en región E</li><li>Dos arcos concéntricos en el borde de la región O</li><li>Región N: arco cóncavo dentro de la nebulosa</li><li>Estrellas de referencia 1 a 8</li><li>Voluptuosidades / gránulos en región N entre el arco y el núcleo</li></ul><p style="font-size:13px;color:#9fb6c9;">Catálogo Messier · Vulpecula · 19h 59m, +22º 43’. Orientación: N a las 9, O a las 12, S a las 3 y E a las 6.</p>'
        },
        {
          boton: '70x - 1º 10’ - 6.6mm', titulo: 'Nagler 31mm',
          img: 'm27_70x.webp',
          html: '<p>Magnífica la nebulosa Dumbbell en el 18”.</p><p>El campo es precioso, hay multitud de estrellas que llaman la atención y la nebulosa destaca intensamente sobre el fondo oscuro.</p><p>La nebulosa es muy grande, a pesar de los bajos aumentos, ya que ocupa perfectamente un quinto del ocular.</p><p>Es brillante, muy brillante, con dos zonas de brillo claramente distinguibles pero ninguna de ellas tenue. La parte de mayor brillo siempre me recuerda a las pesas que se utilizan en los gimnasios para coger con una única mano, unas mancuernas. Mientras que la zona más tenue de la nebulosa se muestra como dos lóbulos que completan la forma ovalada de la nebulosa en dirección norte-sur tal y como yo lo veo en mi ocular. Por destacar algún detalle me parece ver en la zona de menos brillo algún tipo de estructura compleja, como nubes de diversa densidad pero aún el objeto es demasiado pequeño.</p><p>También se observa que la zona de las 6 de la nebulosa es más débil que su compañera a las 12 que es más brillante, aunque es cuestión de matices porque ambas zonas son evidentes con este ocular.</p>'
        },
        {
          boton: '98x - 50’ - 4.7mm', titulo: 'Nagler 22mm',
          img: [
            { archivo: 'm27_98x.webp', etiqueta: 'Sin filtro' },
            { archivo: 'm27_98x_optolong.webp', etiqueta: 'Con filtro Optolong L-Enhance' }
          ],
          imgMode: 'tabs',
          html: '<p>Cuando paso al 22mm opto por añadir el filtro Optolong L-Enhance que he adquirido recientemente, pero primero paso a describir el objeto sin el filtro.</p><p>La nebulosa gana muchísima presencia con este ocular pasando a ocupar ya casi una cuarta parte, con lo que se pueden observar mayores detalles. Lo primero que me llama la atención son las estrellas que la rodean y enmarcan, especialmente una situada a la 1 que se encuentra muy cerca del borde (se trata de TYC 2141-1400-1 de mag 12.91). Tanto es así que la tomo como una referencia magnífica para saber dónde acaba la nebulosa. Además, gracias a esta estrella, observo el primer detalle de la nebulosa. Debajo de esta estrella hay una especie de bahía, es decir, dentro de la zona de mayor brillo se observa como una zona un poco menos brillante que se adentra en el arco brillante de las 3.</p><p>Otra estrella que destaco en mis notas está situada a las 5 y es tan cercana a la Dumbbell que me ayuda a delimitarla. Respecto a diferencia en los brillos aprecio que las zonas de las 9 y de las 3 (más en la de las 9 que en la de las 3, quizás porque en este último está esa especie de bahía un poco más tenue) terminan abruptamente con una subida repentina de brillo, lo que provoca una sensación de que la nebulosa está encerrada entre paréntesis por su zona derecha e izquierda.</p><p>Para finalizar con este ocular sin filtro creo descubrir una especie de arcos tenues tanto a las 6 como a las 12, levemente, muy levemente más brillantes que las regiones del este y oeste de la nebulosa que son mucho más tenues.</p><p>Cuando pongo el filtro Optolong parece que he cambiado de objeto. El fondo se ha oscurecido algo pero sobre todo la nebulosa ha ganado una intensidad y brillo sorprendente. Todo se ve tremendamente más brillante, tanto las zonas tenues como las brillantes en sí. Es una gozada, casi ciega a la vista tanto brillo proveniente de la nebulosa. Es impresionante lo que logra sacar el filtro. Sin embargo debo ponerle un pero que a mí me parece bastante importante. A pesar de que la nebulosa, su tamaño y su forma la delimito mucho mejor y la veo mucho mejor, también la veo más pobre. No sé muy bien por qué pero sin duda he perdido detalles en la nebulosa. Es como si se hubiera homogeneizado y sus detalles más sutiles se perdieran en un fondo de luz más intenso. Mi recomendación es observar la nebulosa con y sin filtro.</p>'
        },
        {
          boton: '154x - 28’ - 3mm', titulo: 'Delos 14mm',
          img: [
            { archivo: 'm27_154x.webp', etiqueta: 'Sin filtro' },
            { archivo: 'm27_154x_optolong.webp', etiqueta: 'Con filtro Optolong L-Enhance' }
          ],
          imgMode: 'tabs',
          html: '<p>Qué maravilla añadir aumentos. Ahora M27 ocupa casi la mitad del ocular. El campo estelar me parece precioso porque se destacan multitud de estrellas y muchas muy cerca del borde de la nebulosa, rodeándola. Estrellas puntuales y de poco brillo la encuadran perfectamente creando una imagen realmente bella.</p><p>Respecto al brillo vuelve a llamarme la atención la diferencia entre las regiones de las 9 y de las 3. El arco externo de la región de las 9 es maravilloso. Más largo y mejor definido que su “hermano” de las 3, que es más corto y no tan claramente contrastado. Es una preciosidad observarlo. Pero aún es más interesante la zona este de la nebulosa. Se ve claramente cómo hay un gradiente muy bello entre la zona brillante y la zona tenue. A la vista aparecen una especie de gránulos o capas de brillo más tenue que va deshaciéndose hasta quedar de un fondo gris claro más homogéneo que vuelve a terminar con un nuevo “arco” en la parte más externa. Se me pasan los minutos viendo la estructura compleja que empieza a mostrar la nebulosa planetaria.</p><p>Volviendo a TYC 2141-1400-1, lo peculiar de esta estrella es que desde la zona brillante de las 3 parece salir un ramal de brillo que intenta “capturarla” llegando casi al mismo borde de la estrella. Esa zona, junto con la bahía explicada con el ocular anterior, es digna de observar detalladamente pues, tras confirmarlo con otros compañeros, veo que hay un filamento que sale desde la nebulosa hacia la estrella TYC 2141-1400-1, muy tenue pero interesante.</p><p>Con el filtro vuelvo a tener la misma sensación que en el ocular anterior. La nebulosa es tremendamente brillante con él. Zonas que me costaba observar ahora son evidentes y la delimito mucho mejor, pero también vuelvo a perder algunos detalles o verlos me resulta más complejo. Además no hay tanta diferencia entre la zona brillante y la zona tenue, ambas son tan brillantes que creo que hasta me satura la vista. Otra diferencia es que el arco de las 9 es menos evidente porque todo es más uniforme. Diría que con este ocular el filtro no me ha aportado mucho.</p>'
        },
        {
          boton: '216x - 27’ - 2.1mm', titulo: 'Ethos 10mm',
          img: [
            { archivo: 'm27_216x.webp', etiqueta: 'Sin filtro' },
            { archivo: 'm27_216x_optolong.webp', etiqueta: 'Con filtro Optolong L-Enhance' }
          ],
          imgMode: 'tabs',
          html: '<p>Qué gozada de nebulosa. Muestra tal serie de detalles que se me hace hasta complicado describirla. Esta vez empiezo con el filtro puesto para ver si noto tantas diferencias de detalles al quitárselo. Lo primero que observo con este nuevo ocular es que identifico claramente la zona de mayor brillo de toda la nebulosa; ésta está localizada entre la estrella dentro de la nebulosa a la 1 y la bahía de la que hablaba anteriormente. Tiene como forma de Y. Además descubro que dentro de la zona brillante, la parte central, donde la nebulosa se estrecha, es más tenue que el resto de esa zona tan brillante de la mancuerna. Hay una especie de hueco que sin embargo sigue siendo más brillante que las zonas de las 6 y de las 12 pero que claramente es más tenue que la zona de las 9 y las 3.</p><p>La zona de las 9, en el arco, se aprecia también algún tipo de estructura, o al menos una clara diferenciación con su parte más interna. Es como si fuera un arco de un toroide, con volumen. Respecto a las zonas tenues de las 6 y las 12, tienen una estructura similar, con su zona más externa más brillante que la zona que está adyacente al área brillante de la nebulosa. Además, esta zona levemente más brillante y externa de la nebulosa también presenta forma de arcos pero, a diferencia de la de las 9, no parece que tuviera volumen sino que son arcos simples, más finos. Es curioso que el mismo esquema se repita en ambos lóbulos a las 12 y a las 6.</p><p>Cuando quito el filtro parece que la nebulosa se apaga. Pero realmente gano en detalles finos. Los gradientes de la zona de las 6 son maravillosos. Es cierto que la parte más tenue de la nebulosa (lóbulos a las 12 y a las 6) son más complejos de observar, y los arcos que antes veía claramente ahora me cuesta verlos, pero los matices que surgen entre los distintos brillos son mucho más ricos que anteriormente. En resumen, aunque parezca una sombra de lo que veía con el filtro, sus detalles son mayores.</p>',
          anexos: [
            { img: 'm27_216x_y.webp', titulo: 'Zona de mayor brillo en forma de Y, arco con volumen (las 9), gradientes y estrella en la nebulosa', pos: 'right' }
          ]
        },
        {
          boton: '270x - 22’ - 1.7mm', titulo: 'Ethos 8mm',
          img: [
            { archivo: 'm27_270x.webp', etiqueta: 'Sin filtro' },
            { archivo: 'm27_270x_optolong.webp', etiqueta: 'Con filtro Optolong L-Enhance' }
          ],
          imgMode: 'tabs',
          html: '<p>Vuelvo a repetir primero con el filtro. El objeto va perdiendo poco a poco luz pero aún así es muy brillante dados los aumentos que posee, y que provoca que ya ocupa más de la mitad del ocular. Empiezo esta vez mirando las zonas más tenues de la nebulosa (regiones 12 y 6), destacando de la región de las 12 que el arco que cierra esta región parece estar formado por dos arcos concéntricos y su cierre no parece tan evidente como el que se ve en la región de las 6.</p><p>Mirando el arco de las 9 veo claramente una estrella que está justamente en el borde del mismo, en el centro de ese arco. Me encanta esa estrella porque me sirve perfectamente para ver el final del arco y además pareciera que en esa zona el arco se muestra plano y no curvo. Pero lo que más me llama la atención es la diferencia entre el arco, la zona interna del mismo y la zona de estrechamiento de la nebulosa antes de llegar a la zona central con ese hueco en el brillo. De nuevo en esa zona entre el arco de las 9 y el estrechamiento se produce una zona de brillo más tenue con algunas estructuras. Me parece una especie de arco inverso (cóncavo en vez de convexo) en el interior mismo de la nebulosa. Una gozada.</p><p>Cuando quito el filtro vuelvo a tener la impresión de haber “apagado” la nebulosa, pero la región que he bautizado como la de mayor brillo ahora es una maravilla que destaca por encima de todo lo demás.</p>',
          anexos: [
            { img: 'm27_270x_arco.webp', titulo: 'Arco cóncavo (arco inverso) y estrella en el borde del arco de las 9', pos: 'right' }
          ]
        },
        {
          boton: '480x - 9’ - 1mm', titulo: 'Delos 4.5mm',
          img: [
            { archivo: 'm27_480x.webp', etiqueta: 'Sin filtro' },
            { archivo: 'm27_480x_optolong.webp', etiqueta: 'Con filtro Optolong L-Enhance' }
          ],
          imgMode: 'tabs',
          html: '<p>Para terminar empiezo de nuevo sin filtro.</p><p>Es una brutalidad poner este ocular porque solamente se ve nebulosa, casi no tengo otra visión del campo estelar que la rodea. Lamentablemente el brillo ha disminuido muchísimo con la combinación del 4.5mm sin el filtro. Sin embargo me he dado cuenta de que estaba perdiéndome varios detalles de la nebulosa, en concreto las estrellas de su interior. Son muy bonitas la hilera de tres estrellas que van desde el arco de las 9 hasta el centro de la nebulosa. En el propio centro de la nebulosa hay también una estrella tenue. También a las 7 hay una estrella pero que está ya en el borde exterior de la nebulosa, sobre la que ahora distingo claramente un hueco (en el ocular anterior creo que no lo nombré pero me parecía que estaba totalmente pegada a la nebulosa, ahora hasta aprecio una separación). Cerca de esa estrella a las 7, pero ya dentro de la nebulosa, hay otra estrella en la zona tenue.</p><p>Cuando pongo el filtro la nebulosa se ilumina y vuelvo a ver los detalles más tenues. En concreto veo el doble arco de la región de las 12 (muy bonito) y mucho más claramente los gradientes que hay en la región de las 6. No puedo aportar mucha más información porque creo que ya se ha dicho todo. Quizás que entre el arco de las 9 con volumen y la zona central, donde está la hilera de estrellas, con el filtro Optolong se aprecian una serie de voluptuosidades, como gránulos de distinto brillo más tenues que el arco y la zona que viene a continuación.</p>'
        },
        {
          boton: 'Estrellas de referencia', titulo: 'M27. Estrellas de referencia',
          img: 'm27_referencia.webp',
          html: '<p>Estrellas de referencia empleadas para delimitar y describir la nebulosa (numeración de la ficha):</p><ol style="margin:8px 0;padding-left:22px;line-height:1.7;"><li>Gaia DR2 1827257419091689856 — mag 14.17</li><li>Gaia DR2 1827257316012466560 — mag 14.44</li><li>Gaia DR2 1827257212933244288 — mag 12.51</li><li>Gaia DR2 1827256830651730560 — mag 13.43</li><li>Gaia DR2 1827256624493300096 — mag 14.03</li><li>TYC 2141-1400-1 — mag 12.91</li><li>Gaia DR2 1827244602908427776 — mag 13.67</li><li>Gaia DR2 1827257075494248320 — mag 13.52</li></ol>'
        }
      ]
    }],
    m30: [{
      // ── Observación 1 (M30) ──
      observador: 'autor',
      fecha: null,
      lugar: 'SQM-L 21.40 · IR -1.3º · 18º amb.',
      instrumento: 'Stargate 18”',

      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m30_inv.pdf',
      defaultIndex: 1,
      entries: [
        {
          boton: 'Exploración', titulo: 'M30. Exploración',
          img: null,
          html: '<p>Síntesis de la observación. Sobre el cúmulo de la medusa se identifican los rasgos descritos a lo largo de la sesión:</p><ul style="margin:8px 0;padding-left:20px;"><li>Tamaño</li><li>Diferencia de brillo entre el núcleo y el resto</li><li>Tamaño del núcleo (casi puntual)</li><li>Tentáculos de la medusa</li><li>Halo tenue y caótico</li><li>4 estrellas doradas en el centro del núcleo del cúmulo</li><li>Anillo de estrellas brillantes que rodean el núcleo</li></ul><p style="font-size:13px;color:#9fb6c9;">Catálogo Messier · Capricornus · 21h 40m, -23º 10’. Orientación: N a las 7, O a las 10, S a la 1 y E a las 4.</p>'
        },
        {
          boton: '70x - 1º 10’ - 6.6mm', titulo: 'Nagler 31mm',
          img: 'm30_70x.webp',
          html: '<p>Precioso e irregular cúmulo globular a pesar de lo bajo que se ve en el horizonte.</p><p>El campo estelar de M30 es pobre en estrellas, solamente destaca una bastante brillante a sus cuatro y otra un poco rojiza a sus diez, muy cerca del cúmulo. El resto son estrellas de poco brillo y escasas.</p><p>El cúmulo es bastante pequeño, creo que ocupa una décima parte del ocular con una forma muy peculiar.</p><p>Creo que su sobrenombre está perfectamente elegido pues, además de la zona más brillante en su núcleo se observan una serie de estrellas que salen desde el centro del cúmulo con un brillo similar y que parecen los tentáculos de una medusa.</p><p>Es muy llamativo que el brillo del cúmulo esté tan extrañamente repartido. El núcleo es muy brillante y casi puntual, pero las estrellas que surgen de él tienen un brillo similar y por ello no parece que formen parte del halo exterior. Tanto es así que hasta me ha parecido que estas estrellas no formaran parte del cúmulo sino que fueran estrellas que se encuentran por delante del cúmulo, pero no, es que es así de irregular. Quizás eso es lo que más me ha llamado la atención, que sea tan diferente al resto de los cúmulos globulares. Nada de una esfera con diversos niveles de brillo. NO. Es un núcleo muy brillante y muy puntual, con estrellas de magnitud similar externas al mismo formando unas especie de patas y luego un halo más tenue y caótico que se extiende más allá de estas “patas”.</p><p>Además las estrellas están tan cerca unas de otras que parecen realmente que crean una única estructura.</p><p>Se me ha olvidado comentarlo pero obviamente se resuelven estrellas en su halo exterior (las más brillantes) y en su núcleo interior. Muy sorprendente.</p>'
        },
        {
          boton: '98x - 50’ - 4.7mm', titulo: 'Nagler 22mm',
          img: 'm30_98x.webp',
          html: '<p>Uauuu, ¡¡¡qué delicia de cúmulo!!! Un detalle a no perderse es la de colocar la estrella más brillante más cerca del centro del ocular, aunque nos dará una imagen peor del cúmulo el conjunto es muy agradecido.</p><p>Lo que más me gusta es que el núcleo del cúmulo se ve perfectamente y se resuelven varias estrellas en su interior. Su brillo es muy intenso y llama muchísimo la atención, pero destacan al mismo nivel de belleza las estrellas de los brazos del cúmulo, pues su brillo es similar y con estos bajos aumentos aparecen muy muy definidas, como pequeños diamantes.</p><p>Así lo más bello es ver el cúmulo con el núcleo tan definido, el cual es minúsculo y luego la ristra de estrellas que forman los tentáculos de la medusa. Para completar la visión el halo exterior se aprecia cómo una nubosidad débil distribuida alrededor de todo el conjunto.</p><p>Una agradable sorpresa este cúmulo. Además merece la pena perder varios minutos contemplando su núcleo más interno. Creo ser capaz de contar hasta cuatro estrellas muy, muy cercanas. Están tan cerca una de las otras que a veces las confundo. Todas ellas tienen una agradable tonalidad dorada.</p><p>La verdad es que me ha sorprendido para bien el cúmulo pues no esperaba encontrarme algo tan distinto.</p>',
          anexos: [
            { img: 'm30_98x_patas.webp', titulo: 'Tentáculos de la medusa (Jellyfish legs)', pos: 'right' }
          ]
        },
        {
          boton: '154x - 28’ - 3mm', titulo: 'Delos 14mm',
          img: 'm30_154x.webp',
          html: '<p>Lamentablemente esta vez el salto a más aumentos no me ha impresionado tanto como cuando he pasado a la pupila de salida de 4.7mm. El objeto ha ganado presencia, es más grande en el ocular, llegando ya a ocupar un 25% del campo que ofrece el 14mm. Pero no puedo añadir más detalles.</p><p>Sigue llamando la atención lo concentrado de su núcleo y el brillo similar de esas estrellas que emanan del interior del cúmulo para terminar colgando como las extremidades de medusa.</p><p>Pero no puedo añadir nada más.</p>'
        },
        {
          boton: '216x - 27’ - 2.1mm', titulo: 'Ethos 10mm',
          img: 'm30_216x.webp',
          html: '<p>Con el 10mm consigo nuevos detalles, sobre todo en la parte más interna del cúmulo globular. En este caso, consigo apreciar que el brillo del núcleo no es uniforme sino que existe un anillo de estrellas brillantes que disminuye cuando diriges tu mirada hacia el interior del núcleo del cúmulo. Disminución de brillo que, a continuación y para terminar, vuelve a crecer gracias a tres o cuatro estrellas muy brillantes en lo más profundo del interior del cúmulo. Esta diferencia de brillo genera una imagen de anillo concéntrico en el núcleo, rodeando a la región más interna que, a su vez, es la más brillante de todo el conjunto.</p><p>Es realmente una imagen muy evocadora, porque además las estrellas que forman los tentáculos de la medusa tienen una magnitud similar a las tres o cuatro estrellas del núcleo, pero estas estrellas externas, son mucho más fáciles de resolver y de observar que aquellas que están en lo más interior.</p><p>Así pues, compiten en la atención de la observación del objeto y tu vista se va inevitablemente desde este interior tan brillante a los extremos del halo externo porque allí encuentra un brillo similar por estrellas individuales.</p><p>Muy interesante.</p><p>Intenté bajar hasta el ocular de 8mm pero no me mostró nuevos detalles. Pero sin ningún lugar a dudas, M30, es un cúmulo que merece ser observado por la bella particularidad en la distribución de sus estrellas.</p>',
          anexos: [
            { img: 'm30_216x_anillo.webp', titulo: 'Anillo de estrellas (Ring of stars) y núcleo más brillante (Brightest core)', pos: 'right' }
          ]
        }
      ]
    }],
    m29: [{
      // ── Observación 1 (M29) ──
      observador: 'autor',
      fecha: null,
      lugar: 'SQM-L 21.95 · IR -11º · 9º amb.',
      instrumento: 'Stargate 18”',

      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m29_inv.pdf',
      defaultIndex: 1,
      entries: [
        {
          boton: 'Exploración', titulo: 'M29. Exploración',
          img: null,
          html: '<p>Síntesis de la observación. Sobre este cúmulo abierto del Cisne se identifican los rasgos descritos a lo largo de la sesión:</p><ul style="margin:8px 0;padding-left:20px;"><li>Contar las estrellas principales del cúmulo</li><li>Establecer una forma</li><li>Identificar diferencia de tonalidad entre estrellas</li></ul><p style="font-size:13px;color:#9fb6c9;">Catálogo Messier · Cygnus · 20h 24m, +38º 29’. Orientación invertida de dobson (N abajo, E a la derecha).</p>'
        },
        {
          boton: '70x - 1º 10’ - 6.6mm', titulo: 'Nagler 31mm',
          img: 'm29_70x.webp',
          html: '<p>Un cúmulo abierto sin mucho valor ni interés, son 8 estrellas sin que me recuerde a ninguna forma concreta, quizás lo que llame la atención es que dos de ellas parecen de un color distinto al resto. Forma una especie de caja o rectángulo con dos estrellas sobresaliendo del mismo por un lateral, como una especie de "asa". Una de las dos estrellas que está más alejada de la "caja" es la que es de un color distinto, y también parece como un poco más pálida, así como otra de las componentes de la "caja", pero no tiene más valor la verdad.</p>'
        },
        {
          boton: '98x - 50’ - 4.7mm', titulo: 'Nagler 22mm',
          img: 'm29_98x.webp',
          html: '<p>Una imagen muy parecida a la anterior, quizás un poco más grande pero sin mucho más detalle que aportar.</p>'
        },
        {
          boton: '154x - 28’ - 3mm', titulo: 'Delos 14mm',
          img: 'm29_154x.webp',
          html: '<p>A pesar de que no consigo mucho más detalle me gusta más la imagen del cúmulo con este ocular. Se ha reducido mucho el campo y por ello tiene más presencia. Las estrellas se ven muy puntuales pero solamente eso. Tampoco es que vea ni siquiera estrellas de magnitud muy débil que a veces da esa sensación de nubosidad en los cúmulos abiertos. No. Es simplemente 8 estrellitas, de magnitud muy similar, dos de ellas de distinto color y poco más.</p>'
        },
        {
          boton: '216x - 27’ - 2.1mm', titulo: 'Ethos 10mm',
          img: 'm29_216x.webp',
          html: '<p>Creo que no le voy a dedicar ni más aumentos ni más tiempo a este objeto, quitando a M73 creo que es el objeto Messier más soso de los que he visto. Bueno al menos puedo dejar constancia de que lo he visto con el 18". Si con M57 me llevé casi 1h de observación aquí llevo 5min y ya me parecen muchos.</p>'
        }
      ]
    }],
    m35: [{
      // ── Observación 1 (M35) ──
      observador: 'autor',
      fecha: null,
      lugar: 'SQM-L 21.20 · IR -16 · 1º amb.',
      instrumento: 'Stargate 18”',

      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m35_inv.pdf',
      defaultIndex: 1,
      entries: [
        {
          boton: 'Exploración', titulo: 'M35. Exploración',
          img: null,
          html: '<p>Síntesis de la observación. Sobre este cúmulo abierto de Géminis se identifican los rasgos descritos a lo largo de la sesión:</p><ul style="margin:8px 0;padding-left:20px;"><li>Tamaño</li><li>Brillo general</li><li>NGC 2158</li><li>5 Gem K0III mag 5.83</li><li>Forma alargada en el eje NO-SE</li><li>Contar decenas de estrellas</li><li>Cayado que termina en HD 41996 (G0 mag 7.42)</li><li>HD 252260 (K5 mag 8.57)</li></ul><p style="font-size:13px;color:#9fb6c9;">Catálogo Messier · Gemini · 6h 08m, +24º 20’. Orientación: N a las 6, O a las 9, S a las 12 y E a las 3.</p>'
        },
        {
          boton: '70x - 1º 10’ - 6.6mm', titulo: 'Nagler 31mm',
          img: 'm35_70x.webp',
          html: '<p>M35 siempre sorprende por lo brillante que es, sin embargo en este telescopio creo que desluce bastante. Me explicaré en su momento.</p><p>Primero empiezo como siempre describiendo el campo en el que se encuentra el objeto, rico de estrellas en el que llama la atención NGC 2158, otro cúmulo abierto mucho más pequeño y tenue que se coloca al suroeste del cúmulo principal M35. Se aprecia claramente la separación de ambos, pero quizás por ello también M35 parece menos compacto. Sin embargo la imagen es bastante bella colocando a M35 en el centro del ocular y a NGC 2158 en un extremo del mismo sin llegar al borde con decenas de estrellas en el campo que contiene a ambos. Destaca 5 Gem, brillante (mag 5.83) justo al este, es de tipo K0III, una gigante naranja.</p><p>El tamaño de M35 es enorme. Normalmente estoy acostumbrado a ver los objetos de un tamaño pequeño con este ocular puesto que me proporciona un grado de campo, sin embargo M35 ocupa más de un tercio del mismo, lo que es prueba de su gran tamaño (más de 20’ de arco diría).</p><p>La forma es compleja de definir, no puedo decir que sea esférica puesto que parece más alargado en su eje N-O / S-E.</p><p>Es muy brillante pues todas sus estrellas son de una magnitud importante pudiendo contarse decenas de ellas fácilmente.</p><p>Por identificar algunos detalles, destaca en su interior una forma peculiar de “cayado” que termina en una estrella rojiza más brillante (HD 41996 G0 mag 7.42). Muy abierto y con estrellas muy brillantes de color blanco, azuladas. Sin embargo en este telescopio desluce porque uno pierde la sensación de conjunto. No parece que esté observando un objeto único sino una acumulación de estrellas.</p>'
        },
        {
          boton: '98x - 50’ - 4.7mm', titulo: 'Nagler 22mm',
          img: 'm35_98x.webp',
          html: '<p>Me gusta mucho más cuando paso al 22mm. El contraste de colores se ve de una forma más llamativa. Es como si hubieran ganado en intensidad. Probablemente lo que esté pasando sea lo contrario. El fondo de estrellas se haya oscurecido un poco más lo que me ha llevado a que, por contraste, las estrellas se vean más llamativas, y lo que es más hermoso, sus tonos distintos.</p><p>Por ejemplo, me llama la atención una estrella dorada en la zona al sureste del cúmulo (lo que se correspondería con la 1:00 en mi ocular), HD 252260 K5 mag 8.57. También la estrella que determina el final del cayado, que tiene un color rojizo precioso, comparado con el resto de las estrellas del cúmulo.</p><p>Como en el mismo campo entra también NGC 2158 no puedo evitar mirarlo con detalle y describirlo. Lo primero que me llama la atención es su forma, me recuerda a la constelación de Capricornio, ese triángulo que parece una gran sonrisa. Sin embargo, en lo que debería ser el lado horizontal del triángulo (que corresponde con mis 12 en el ocular, tal y como lo observo) aparece un hueco que se hunde en el cúmulo abierto. Otro aspecto a destacar es la uniformidad de brillo en las estrellas de NGC 2158. Son todas de una magnitud muy similar excepto unas 3 ó 4 más brillantes. Se pueden resolver perfectamente, pero son muchísimo más tenues que las estrellas de M35.</p>'
        },
        {
          boton: '154x - 28’ - 3mm', titulo: 'Delos 14mm',
          img: 'm35_154x.webp',
          html: '<p>Con este ocular llego a sumergirme totalmente en el cúmulo abierto lo que por un lado hace que pueda disfrutar del objeto en más detalle pero también disminuye la sensación de un objeto compacto al que comparar con el fondo de cielo.</p><p>El primer detalle respecto al ocular anterior es la diferencia en los colores de las estrellas. Se siguen apreciando las distintas tonalidades, la gran mayoría blancas azuladas brillando en oposición a las pocas doradas rojizas, sin embargo el contraste ahora es menor. Como si la magnitud de todas ellas se hubiera visto disminuido y hubieran palidecido ligeramente.</p><p>A continuación aprecias que la separación entre estrellas es mucho mayor, creándose incluso espacios en los que no ves ninguna estrella e identificando por tanto regiones desiertas de estrellas. Sobre todo en su parte central que sirve como contraposición a la serie de estrellas que se suceden en una curva que da forma al mango del cayado.</p>'
        },
        {
          boton: '216x - 27’ - 2.1mm', titulo: 'Ethos 10mm',
          img: 'm35_216x.webp',
          html: '<p>¡Qué agradable sorpresa! Dudaba si pasar al Ethos de 10mm puesto que el objeto no parecía dar más de sí, ya que no había ninguna región que me llamara la atención, ni ningún detalle que quisiera observar. No obstante he optado por poner el siguiente ocular en mi telescopio simplemente para compararlos y el resultado ha sido más que aceptable.</p><p>A pesar de que ahora tenga mayores aumentos, como he ganado también en campo aparente, mantengo el mismo campo real y eso hace que pueda observarlo con mayor comodidad y menor sensación de “claustrofobia”. Es una gozada poder pasear la vista de un extremo a otro y ser consciente que el objeto ocupa todo ese tamaño. No me es fácil de explicar pero es como pasar de estar mirando algo por el hueco de una cerradura a, de pronto, no tener límites en los que mirar y tener que mover la pupila de un extremo al otro de tu ojo para poder abarcar el conjunto al completo.</p><p>La sensación de inmersión es mucho mayor en este caso y además el contraste parece acentuarse mucho más con lo que las estrellas destacan más aún. Creo que un buen símil puede ser que con el 14mm parecía que entraba en el objeto a través de un estrecho pasillo cuando ahora con el 10mm es como si me rodeara a derecha e izquierda, arriba y a abajo. Como si realmente te estuvieras dentro del cúmulo y no observándolo desde el exterior.</p><p>No ha estado mal el ejercicio aunque no sigo subiendo de aumentos pues imagino que no voy a conseguir nada más.</p>'
        }
      ]
    }],
    m36: [{
      // ── Observación 1 (M36) ──
      observador: 'autor',
      fecha: null,
      lugar: 'SQM-L 21.5 · IR -38 · 2º amb.',
      instrumento: 'Stargate 18”',

      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m36_inv.pdf',
      defaultIndex: 1,
      entries: [
        {
          boton: 'Exploración', titulo: 'M36. Exploración',
          img: null,
          html: '<p>Síntesis de la observación. Sobre este cúmulo abierto de Auriga se identifican los rasgos descritos a lo largo de la sesión:</p><ul style="margin:8px 0;padding-left:20px;"><li>Número de estrellas</li><li>Forma irregular · largos brazos</li><li>Diferencia de magnitud de estrellas en su parte más central</li><li>Colores uniformes</li><li>Comparar la impresión a bajos y a altos aumentos</li></ul><p style="font-size:13px;color:#9fb6c9;">Catálogo Messier · Auriga · 5h 36m, +34º 08’. Orientación: N a las 6, O a las 9, S a las 12 y E a las 3.</p>'
        },
        {
          boton: '70x - 1º 10’ - 6.6mm', titulo: 'Nagler 31mm',
          img: 'm36_70x.webp',
          html: '<p>Tras pasar por M38, M36 no te llamará mucho la atención, al menos no a bajos aumentos, o eso es lo que yo he sentido. El número de estrellas que componen el objeto es muy bajo, cuento entre 15 - 20 estrellas de una magnitud similar. Si acaso llama la atención que todas mantengan una magnitud muy similar, sin embargo no llama mucho la atención. Respecto a su forma es irregular, no puedo definirla más allá que una agrupación de estrellas con algunas de ellas separándose de la parte central formando brazos en paralelo, bastante largos ambos.</p>'
        },
        {
          boton: '98x - 50’ - 4.7mm', titulo: 'Nagler 22mm',
          img: 'm36_98x.webp',
          html: '<p>Con el 22mm (98x) el objeto gana mucho, primero se ha expandido hasta ocupar casi la mitad del ocular. Segundo aparecen varias estrellas de menor magnitud agrupándose en el cúmulo, con lo que parece un objeto más completo y no tan simple como la visión anterior. Especialmente en la parte central donde hay un par de estrellas de una magnitud similar que anteriormente me llamó la atención y a la que se le suman algunas estrellas más de menor magnitud.</p><p>Sin lugar a duda merece la pena emplear un poco más de tiempo y seguir creciendo en aumentos para contemplar el mismo objeto. Una vez más descubro el valor de no quedarte con la primera impresión.</p>'
        },
        {
          boton: '154x - 28’ - 3mm', titulo: 'Delos 14mm',
          img: 'm36_154x.webp',
          html: '<p>Este ocular siempre me reduce muchísimo el campo al pasar de 82º de campo aparente a los 72º del Delos pero no me desagrada. El objeto ha ganado bastante en tamaño pero lo que más me llama la atención es como siguen apareciendo nuevas estrellas más tenues que ahora se descubren fácilmente.</p><p>Hay que tener en cuenta que los cúmulos abiertos pueden ser muy generosos con los aumentos pues no van a perder prácticamente brillo y sin embargo su campo alrededor sí que se va a oscurecer destacándose aún más del cielo.</p><p>El único problema que encuentro en estas situaciones es que el objeto deja de tener un sentido como conjunto. Empieza a ser tan grande que casi ocupa todo el ocular con lo que pierdo la referencia del resto del campo. Sin embargo aún no he llegado a ese momento con los 28 minutos de arco que me da mi ocular. Sigo pudiendo comparar el objeto con el cielo que lo rodea, con lo que lo contemplo en su plenitud. Además siguen apareciendo más estrellas tenues. Creo que este objeto es uno que puede empezar por desilusionar y volverse más interesante cuantos más aumentos añades. Porque realmente tengo una sensación más placentera observando este objeto a mayores aumentos que con el 31mm. Es más rico en detalles, con muchas más estrellas tenues completándolo, a la misma vez que las estrellas visibles en aumentos anteriores no pierden belleza ni presencia.</p>'
        },
        {
          boton: '216x - 27’ - 2.1mm', titulo: 'Ethos 10mm',
          img: 'm36_216x.webp',
          html: '<p>Con el Ethos de 10mm no consigo una mejor imagen la verdad, es cierto que ahora es mucho más cómodo de observar y que el tamaño del objeto se ha visto incrementado pero la sensación que he tenido en el salto anterior del ocular de 22mm al de 14mm, lamentablemente, esta vez no la he tenido. Es verdad que aparecían algunas estrellas más tenues pero era un poco más de lo mismo con lo que no me he entretenido mucho y he pasado al último ocular con el que observaré este objeto.</p>'
        },
        {
          boton: '270x - 22’ - 1.7mm', titulo: 'Ethos 8mm',
          img: 'm36_270x.webp',
          html: '<p>El último cambio de ocular para este objeto y me reafirmo en que M36 es un objeto que mejora con mayores aumentos. La cantidad de estrellas tenues que se perciben en el interior del cúmulo abierto, no como una nube difusa, sino como estrellas individuales, te hace mirarlo con ojos totalmente distintos. Porque ahora juegas al contraste entre magnitudes de estrellas. Las principales que dan forma al cúmulo y las secundarias y menos brillantes que lo completan. Es un bonito y curioso objeto.</p><p>Lamentablemente con este ocular ocurría lo ya comentado que te adentras tanto en el objeto que dejas de tener una referencia del mismo. Quitando esa sensación la imagen es muy sugerente con tantas estrellas de diversas magnitud.</p>'
        }
      ]
    }],
    m37: [{
      // ── Observación 1 (M37) ──
      observador: 'autor',
      fecha: null,
      lugar: 'SQM-L 21.5 · IR -38 · 2º amb.',
      instrumento: 'Stargate 18”',

      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m37_inv.pdf',
      defaultIndex: 1,
      entries: [
        {
          boton: 'Exploración', titulo: 'M37. Exploración',
          img: null,
          html: '<p>Síntesis de la observación. Sobre este cúmulo abierto de Auriga se identifican los rasgos descritos a lo largo de la sesión:</p><ul style="margin:8px 0;padding-left:20px;"><li>Tamaño</li><li>Número de estrellas que lo componen</li><li>Color de la estrella central (rojiza)</li><li>Magnitud de la estrella central</li><li>Forma triangular</li><li>Hueco de estrellas S-N</li><li>Contraste con un fondo negro terciopelo</li></ul><p style="font-size:13px;color:#9fb6c9;">Catálogo Messier · Auriga · 5h 52m, +32º 33’. Orientación: N a las 6, O a las 9, S a las 12 y E a las 3.</p>'
        },
        {
          boton: '70x - 1º 10’ - 6.6mm', titulo: 'Nagler 31mm',
          img: 'm37_70x.webp',
          html: '<p>Observo este cúmulo tras pasar por M36 y eso conlleva que su belleza se vea incrementada pues la diferencia con este otro cúmulo abierto es notable.</p><p>Lo primero que llama la atención es la cantidad de estrellas que lo componen, a diferencia de M36 hay multitud de ellas en vez de un par de decenas, además con una estrella central de una tonalidad distinta al resto. Si a esto le sumas el hecho de que todas ellas aparecen puntuales como cabezas de alfiler, el resultado es una imagen sorprendente. Diría además que la estrella central es más rojiza y además de una magnitud menor lo que conlleva que destaque aún más en el cúmulo, pues a su distinto color le suma un mayor brillo.</p>'
        },
        {
          boton: '98x - 50’ - 4.7mm', titulo: 'Nagler 22mm',
          img: 'm37_98x.webp',
          html: '<p>Con este nuevo ocular el objeto gana en belleza pues sigue manteniendo su forma destacando del fondo de cielo pero creciendo en tamaño y brillo de las estrellas. Ahora la estrella central me parece que destaca incluso más y su color me captura dejándome algunos segundos embelesado con ella.</p><p>Las estrellas se ven más separadas unas de otras a pesar de contarse por decenas. La forma es lo que más me cuesta definir, claramente no tiene forma redonda sino más bien triangular, con una especie de hueco o entrante originado por falta de estrellas de la misma magnitud en su parte superior y llegando hasta la zona central donde está la estrella rojiza.</p><p>De los tres cúmulos abiertos de Auriga este es el que más disfruto y el que más captura mi mirada, por la sutileza del mismo, la cantidad de estrellas y la variación de brillo y colores entre ellas. Un precioso cúmulo abierto.</p>'
        },
        {
          boton: '154x - 28’ - 3mm', titulo: 'Delos 14mm',
          img: 'm37_154x.webp',
          html: '<p>De nuevo el 14mm con sus 72º de campo aparente me arroja a esa visión de estar encerrando el objeto. No consigo muchos más detalles que el ocular anterior, quizás indicar que merece la pena ver el objeto a mayores aumentos. No vas a perder definición ni brillo y vas a poder contemplarlo con más comodidad, disfrutando de los detalles que lo hacen único. Es decir, la gran cantidad de estrellas de brillo uniforme distribuidas de forma triangular por todo el cúmulo y la estrella central rojiza. Quizás con este ocular los colores empiezan a ser más uniformes, atenuándose la diferencia entre ellos pero aún viéndose claramente como estrellas de distinta tonalidad.</p><p>Le dedico algunos segundos más imaginando los mundos que pueden existir en tal cantidad de estrellas y la vista que se debe tener desde ellos en una noche oscura. Debe ser un cielo precioso pues se verían decenas de “Vegas” en su firmamento repartidas aleatoriamente. Debe ser espectacular.</p>'
        },
        {
          boton: '216x - 27’ - 2.1mm', titulo: 'Ethos 10mm',
          img: 'm37_216x.webp',
          html: '<p>Un detalle que me llama la atención es que los colores han vuelto a destacar con este ocular. Creo que entre los Delos y Ethos existe una clara diferencia en el tratamiento de los colores, respetándolos mucho más los últimos que los primeros.</p><p>Excepto por ese detalle la imagen no difiere mucho a lo ya observado solamente que con mucho más campo, con un aumento mayor y con una mayor comodidad de observación. Ha merecido la pena poner también este ocular sobre todo por compararlo con el anterior y descubrir las diferencias entre ellos. El objeto sigue siendo una preciosidad, aunque con cada aumento te mantiene más entretenido mirando cada detalle del mismo.</p>'
        },
        {
          boton: '270x - 22’ - 1.7mm', titulo: 'Ethos 8mm',
          img: 'm37_270x.webp',
          html: '<p>El mejor ocular para observar este objeto en mi telescopio sin lugar a dudas es el Ethos de 8mm. Es IMPRESIONANTE cómo el objeto ocupa casi la totalidad del ocular y encima con una sensación de campo amplio que otorgan los 100º de campo aparente. Es una maravilla. Primero el fondo del cielo se ha oscurecido más aún al incrementar los aumentos y reducir la pupila de salida, segundo es posible observar las estrellas individual y absolutamente puntuales. Como diamantes brillando en la oscuridad de un tapiz de terciopelo negro profundo. Tercero y último, el contraste de colores entre la estrella central de menor magnitud y el resto de sus compañeras se acentúa hasta niveles que no imaginabas a bajos aumentos.</p><p>Todo un disfrute para la vista relajarse contemplando este cúmulo a tales aumentos, con un seeing bueno y un telescopio bien colimado.</p>'
        }
      ]
    }],
    m38: [{
      // ── Observación 1 (M38) ──
      observador: 'autor',
      fecha: null,
      lugar: 'SQM-L 21.5 · IR -38 · 1º amb.',
      instrumento: 'Stargate 18”',

      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m38_inv.pdf',
      defaultIndex: 1,
      entries: [
        {
          boton: 'Exploración', titulo: 'M38. Exploración',
          img: null,
          html: '<p>Síntesis de la observación. Sobre este cúmulo abierto de Auriga se identifican los rasgos descritos a lo largo de la sesión:</p><ul style="margin:8px 0;padding-left:20px;"><li>Tamaño</li><li>Densidad de estrellas</li><li>NGC 1907</li><li>Puntualidad de las estrellas</li><li>Color de HD 35878 (mag 8.41, G5) frente al resto de estrellas</li><li>Cayado que se extiende sur-norte</li><li>Ríos de oscuridad</li><li>Bajar al máximo la pupila de salida sin dejar de observar el cúmulo como un conjunto (sin bajar de 25’ de campo real), consiguiendo el máximo contraste</li></ul><p style="font-size:13px;color:#9fb6c9;">Catálogo Messier · Auriga · 5h 28m, +35º 51’. Orientación: N a las 6, O a las 9, S a las 12 y E a las 3.</p>'
        },
        {
          boton: '70x - 1º 10’ - 6.6mm', titulo: 'Nagler 31mm',
          img: 'm38_70x.webp',
          html: '<p>Es el primer cúmulo abierto de los tres cúmulos abiertos de Auriga que observo esta noche. La noche es muy buena con una Vía Láctea muy contrastada.</p><p>M38 es un cúmulo abierto muy extenso y muy brillante pero como los aumentos son bajos y el campo es de más de 1º puedo observar también NGC 1907 en el borde del campo, lo que da una imagen muy sugerente. M38 es uniforme con estrellas muy puntuales y de una magnitud similar, ocupando más de un 20% del campo del ocular, mientras que NGC 1907 es un objeto pequeño, más compacto pero que permite también la observación individual de sus estrellas pues son fácilmente resolubles. Sin embargo su brillo es bastante menor.</p>'
        },
        {
          boton: '98x - 50’ - 4.7mm', titulo: 'Nagler 22mm',
          img: 'm38_98x.webp',
          html: '<p>La puntualidad de las estrellas me llama muchísimo la atención, es lo que hace que el objeto sea tan bello. Recomiendo encarecidamente una colimación correcta para conseguir a bajos aumentos esta visión. No es complicado pues no he llegado a pasar de los 100x. También hay una estrella rojiza, con un brillo un poco superior al resto de sus compañeras, en el borde del cúmulo a las 4:00 si seguimos la famosa orientación que nos da un reloj. Se trata de HD 35878 mag 8.41 G5.</p><p>De la forma de M38 destaco aquellas estrellas que están en el centro haciendo una especie de semicírculo, veo que debajo de las mismas sigue una línea más o menos recta. A esto lo llamo yo “el cayado” de M38, pues me recuerda a ese tipo de bastón tan utilizado por los pastores en las zonas rurales tanto para andar como para defenderse.</p>'
        },
        {
          boton: '154x - 28’ - 3mm', titulo: 'Delos 14mm',
          img: 'm38_154x.webp',
          html: '<p>Sigue siendo un placer observar el cúmulo al que además empiezo a descubrir algunos detalles curiosos.</p><p>El primero de ellos es que, acompañando a estas estrellas brillantes, individuales de una magnitud similar hay claramente otras mucho menos brillantes que provoca una sensación de nubosidad de fondo. Sin embargo, estas estrellas más tenues, no están repartidas de forma uniforme en el cúmulo, sino que, curiosamente, sigue la misma distribución de las estrellas más brillantes, lo que origina “huecos” negros en el propio cúmulo. Lo describo como ríos de oscuridad recorriendo el cúmulo. Es un ejercicio muy gratificante el hecho de buscar contrastes de oscuridad dentro del propio cúmulo.</p><p>Pero, sin lugar a duda lo que más llama la atención es el brillo tan uniforme y puntual de sus estrellas principales y la gran cantidad de las mismas. De un color blanco-azulado parecen gotas de rocío o granos de cuarzo brillando en el tapiz negro del firmamento.</p>'
        },
        {
          boton: '216x - 27’ - 2.1mm', titulo: 'Ethos 10mm',
          img: 'm38_216x.webp',
          html: '<p>Qué preciosidad observar tanto campo con el objeto tan grande. A pesar de los aumentos, como estoy observando cerca de 28 minutos de arco de campo real, M38 sigue conservando su coherencia y se puede observar como un todo frente al firmamento que lo rodea.</p><p>Ya lo he indicado en anteriores oculares pero lo que más llama la atención sin duda es la puntualidad de las estrellas, su brillo similar y el gran número de las mismas esparcidas por el cúmulo.</p><p>Una imagen que se te queda grabada en el cerebro. Es, simplemente, un objeto bello. Lo suficiente compacto para identificarlo como un objeto en sí mismo, pero también lo suficientemente abierto para deleitarse con cada estrella del mismo.</p>'
        },
        {
          boton: '270x - 22’ - 1.7mm', titulo: 'Ethos 8mm',
          img: 'm38_270x.webp',
          html: '<p>Me ha sorprendido tanto la visión con este ocular que por un momento he vuelto al 31mm para confrontar la imagen que da un ocular y el otro. Y sin lugar a dudas, al menos para mi criterio de belleza, gana por goleada los grandes aumentos, a bajos aumentos es una visión más pobre. A bajos aumentos el objeto es bonito, pero el brillo del firmamento es tal que le roba algo de belleza (me imagino lo que debe ser observar desde cielos realmente negros y me estremezco) al no contrastarlo tanto. También el tamaño del objeto a bajos aumentos es, a pesar de ser un cúmulo abierto grande, ridículo si lo comparamos con el Ethos de 8mm. Simplemente, a grandes aumentos, las estrellas están esparcidas por todo el ocular y te imaginas acercándose a ese cúmulo desde el espacio y simplemente sueñas con los ojos abiertos. El cielo de fondo además es mucho más negro pues tu pupila de salida se ha visto muy reducida, y el contraste que logra percibir tu cerebro es sobrecogedor.</p><p>Puro gozo en estado real. Maravilloso.</p>'
        }
      ]
    }],
    m39: [{
      // ── Observación 1 (M39) ──
      observador: 'autor',
      fecha: null,
      lugar: 'SQM-L 21.25 · IR -7.2 · 16º amb.',
      instrumento: 'Stargate 18”',

      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m39_inv.pdf',
      defaultIndex: 1,
      entries: [
        {
          boton: 'Exploración', titulo: 'M39. Exploración',
          img: null,
          html: '<p>Síntesis de la observación. Sobre este cúmulo abierto de Cygnus se identifican los rasgos descritos a lo largo de la sesión:</p><ul style="margin:8px 0;padding-left:20px;"><li>Tamaño</li><li>Forma “de copa”</li><li>Contar 20 estrellas</li><li>Color de las estrellas</li><li>Arcos de estrellas de baja magnitud cerca de HD 205116 y HD 205210</li></ul><p style="font-size:13px;color:#9fb6c9;">Catálogo Messier · Cygnus · 21h 31m, +48º 25’. Orientación: N a la 1, O a las 4, S a las 7 y E a las 10.</p>'
        },
        {
          boton: '70x - 1º 10’ - 6.6mm', titulo: 'Nagler 31mm',
          img: 'm39_70x.webp',
          html: '<p>Enorme cúmulo abierto. Este cúmulo abierto está situado en un campo rico de estrellas tenues. Su tamaño es tan grande que ya incluso en el ocular de 31mm con 1º y 10min de campo real el objeto ocupa casi la mitad del campo.</p><p>Respecto a su forma no soy muy capaz de establecer ningún patrón, quizás una especie de triángulo o copa extraña.</p><p>El cúmulo es muy brillante y se distingue perfectamente incluso en el buscador. En el ocular de 31mm con 6.6mm de pupila de salida y 70x es un bonito espectáculo. Todas sus estrellas tienen un color blanco-azulado y cuento fácilmente entre 15 y 20 de ellas. Las principales son tres que están situado en la parte superior del cúmulo tal y como lo veo en mi ocular, el resto tienen una magnitud un poco mayor (es decir son un poco menos brillantes).</p><p>Es curioso de observar pero creo que dará una mejor imagen con un telescopio de menor diámetro.</p>'
        },
        {
          boton: '98x - 50’ - 4.7mm', titulo: 'Nagler 22mm',
          img: 'm39_98x.webp',
          html: '<p>Con el 22mm consigo una imagen mejor, llega a ocupar casi todo el campo del ocular, y el brillo de ellas te llama mucho la atención. Paso a describirlo ya que es la mejor imagen que he obtenido, y no creo que merezca la pena dedicar más esfuerzo a un objeto que, debido a su tamaño, no podré observar completamente a mayores aumentos.</p><p>Las tres estrellas principales del cúmulo forman una especie de línea en la parte superior del mismo. Aunque la tercera estrella, la que se encuentra en lado derecho del ocular, en realidad está un poco desviada de la línea que forma las otras dos estrellas. Estaría como a las dos y media de la estrella central. Si fijamos nuestra vista en la estrella central de estas tres estrellas principales podemos apreciar que a las 4 hay una pareja de estrellas de la cual la más alejada es levemente más brillante. Encima de estas dos estrellas, y a las dos de la estrella central hay otra estrella de magnitud similar a las anteriores que te lleva hasta otra cuarta estrella situada a las 12 de la estrella más alejada del trío de estrellas principales. Esta cuarta estrella te lleva hasta una quinta que ya está mucho más alejada de las estrellas principales. Con esto recorremos la región entre las 12 y las 3 del cúmulo.</p><p>Volviendo a partir de la estrella central pero ahora mirando hacia la zona de las 7, nos encontramos con una serie de tres estrellas que forman un arco que lleva hacia una cuarta estrella más separada. Desde esta cuarta estrella podemos explorar la región de las 6 del cúmulo dónde se aprecian tres estrellas de una magnitud similar y que forman una especie de triángulo rectángulo.</p><p>Por último destacar algún grupo curioso de estrellas de mayor magnitud y de brillo mucho más tenue formando una especie de arcos. Un arco estaría situado a las 3 de la estrella central, y el otro a las 6 de la estrella situada más a la derecha.</p>',
          anexos: [
            { img: 'm39_98x_principales.webp', titulo: 'Estrellas principales (Main stars) y recorrido región 12-3', pos: 'right' },
            { img: 'm39_98x_arcos.webp', titulo: 'Arcos de estrellas de baja magnitud (regiones 3 y 6)', pos: 'right' }
          ]
        }
      ]
    }],
    m52: [{
      // ── Observación 1 (M52) ──
      observador: 'autor',
      fecha: null,
      lugar: 'SQM-L 21.5 · IR -25 · 7º amb.',
      instrumento: 'Stargate 18”',

      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m52_inv.pdf',
      defaultIndex: 1,
      entries: [
        {
          boton: 'Exploración', titulo: 'M52. Exploración',
          img: null,
          html: '<p>Síntesis de la observación. Sobre este cúmulo abierto de Cassiopeia se identifican los rasgos descritos a lo largo de la sesión:</p><ul style="margin:8px 0;padding-left:20px;"><li>Tamaño</li><li>Identificar las estrellas HD 220770, BD+60 2537, BD+60 2534 y BD+60 2531</li><li>Contraste de color y brillo de BD+60 2532</li><li>Contar las estrellas que lo componen (alrededor de 60)</li><li>Forma de polilla</li></ul><p style="font-size:13px;color:#9fb6c9;">Catálogo Messier · Cassiopeia · 23h 24m, +61º 35’. Orientación: N a las 12, O a las 3, S a las 6 y E a las 9.</p>'
        },
        {
          boton: '70x - 1º 10’ - 6.6mm', titulo: 'Nagler 31mm',
          img: 'm52_70x.webp',
          html: '<p>Es un cúmulo abierto bastante bonito, grande, ocupa cerca de un cuarto del campo del ocular con una estrella rojiza destacable en uno de los extremos. También tiene una serie de estrellas brillantes que no forman parte del mismo, un poco alejadas, pero que crean una línea imaginaria en la que se apoya el cúmulo. Son las estrellas HD 220770 (magnitud 8.56), BD+60 2537 (magnitud 10.92), BD+60 2534 (magnitud 11.07) y BD+60 2531 (magnitud 9.62).</p><p>Las estrellas del cúmulo son todas de una magnitud similar (destacando esta rojiza como levemente más brillante, es la estrella BD+60 2532 de magnitud rondando la 9, mientras el resto ronda la magnitud 11). De su forma no puedo destacar mucho, es bastante irregular aunque diría que lo caracterizaría de redondo.</p>'
        },
        {
          boton: '98x - 50’ - 4.7mm', titulo: 'Nagler 22mm',
          img: 'm52_98x.webp',
          html: '<p>Con este ocular mejora la visión, el cúmulo se ve mucho más abierto y grande, la estrella rojiza (BD+60 2532) destaca mucho más sobre el resto. En un conteo rápido estimo unas 40 ó 50 estrellas de magnitud similar. No hay mucho más que le pueda sacar, es bastante abierto y poco más. Si acaso, a base de insistir, me imagino que tiene forma de polilla, con un par de antenas que llegan a una parte central donde hay una acumulación mayor de estrellas y sería lo que formaría la parte del cuerpo de la polilla. De las alas la que veo a mi izquierda es la que mejor se define y la estrella rojiza formaría la punta del ala de la derecha, y me parece que el mismo patrón de estrellas se repite al otro extremo del "cuerpo" de la polilla con lo que quedaría dibujadas las dos alas de la misma.</p>'
        },
        {
          boton: '154x - 28’ - 3mm', titulo: 'Delos 14mm',
          img: 'm52_154x.webp',
          html: '<p>Me reitero por enésima vez en la buena sensación que me da el pasar a este ocular con objetos que encajan enteros en su campo. El salto es tan grande desde los 22mm que parece como si me sumergiera en el objeto.</p><p>Sugestionado con la imagen anterior ahora veo con más claridad la polilla aunque para ello debo obviar algunas estrellas del cúmulo. Lo describo de la siguiente forma en mis notas de voz: partiendo desde la gigante roja BD+60 2532 parten dos hileras de estrellas, una hacia abajo, otra hacia la izquierda. Estas son las que dan forma a esta "ala" tan bien definida. Encima de la línea de estrellas que parten hacia la izquierda hay otra agrupación de estrellas que debes ignorar. Esta línea se une a otra línea de estrellas más compactas que son las que forman el cuerpo del animal y que puedes continuar bajando hasta llegar a lo que sería el final del cuerpo. Es fácil reproducir el mismo patrón en la zona izquierda del cuerpo de la polilla. Para darle más fuerza a esta imagen, encima justo de esta zona de concentración de estrellas que formaría la cabecita de la polilla parten dos hileras de estrellas en arco que serían las antenas de la misma. En fin... es lo que mi imaginación dibuja y así lo reflejo en mis notas de voz. Y lo mejor de este ocular es que prácticamente todo el objeto entra en el mismo.</p>'
        },
        {
          boton: '216x - 27’ - 2.1mm', titulo: 'Ethos 10mm',
          img: 'm52_216x.webp',
          html: '<p>El salto al 10mm es una gozada al subir de aumento sin disminuir el campo ya que el Ethos tiene 100º de campo aparente. Además con estos aumentos empiezo a ver estrellas más tenues formando parte también del cúmulo abierto, aunque es imposible quitarme la forma de la polilla que se me ha dibujado en la mente.</p>'
        },
        {
          boton: '270x - 22’ - 1.7mm', titulo: 'Ethos 8mm',
          img: 'm52_270x.webp',
          html: '<p>Con este ocular ya me paso un poco, el objeto entra perfecto en el ocular pero no contemplo ningún campo más alrededor con lo que pierdo la imagen de conjunto. No veo mucho más detalle de lo ya explicado. No pasé de estos aumentos porque tampoco vi nada que me llamara la atención para ser observado con detalle.</p>'
        }
      ]
    }],
    m55: [{
      // ── Observación 1 (M55) ──
      observador: 'autor',
      fecha: null,
      lugar: 'SQM-L 21.8 · IR -10 · 14º amb.',
      instrumento: 'Stargate 18”',

      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m55_inv.pdf',
      defaultIndex: 1,
      entries: [
        {
          boton: 'Exploración', titulo: 'M55. Exploración',
          img: null,
          html: '<p>Síntesis de la observación. Sobre este cúmulo globular de Sagittarius se identifican los rasgos descritos a lo largo de la sesión:</p><ul style="margin:8px 0;padding-left:20px;"><li>Tamaño</li><li>Resolver estrellas hasta el núcleo</li><li>Brillo uniforme en todo el objeto (sin diferencia de brillo entre el núcleo y el halo exterior)</li><li>Tonalidad rojiza de las estrellas más brillantes</li><li>“Ganchos” saliendo del cúmulo en su halo exterior</li><li>Identificar en su interior ríos oscuros e islas brillantes</li><li>Arco brillante en el centro en su región E</li><li>Formas curiosas en su interior, como una “mariposa”</li><li>Asombrarse con la falta de núcleo abigarrado y más brillante</li><li>A grandes aumentos (> 450x): ríos oscuros que desembocan en una laguna central; islas brillantes; montañas brillantes que rodean a la laguna oscura central; sensación de volumen o tridimensionalidad en el centro del cúmulo</li></ul><p style="font-size:13px;color:#9fb6c9;">Catálogo Messier · Sagittarius · 19h 40m, -30º 57’. Orientación: N a las 12, O a las 3, S a las 6 y E a las 9.</p>'
        },
        {
          boton: '70x - 1º 10’ - 6.6mm', titulo: 'Nagler 31mm',
          img: 'm55_70x.webp',
          html: '<p>Cúmulo globular bastante grande donde se resuelven todas las estrellas, más complicado en el núcleo. Respecto a su brillo es bastante uniforme, no destaca una zona central mucho más brillante que el halo exterior de otros cúmulos (como por ejemplo en M75), sino que todo el objeto tiene una agradable uniformidad de brillo el cual no es muy intenso. Es de los cúmulos globulares que he observado menos “compacto” que recuerdo, casi parece estar viendo un cúmulo abierto por lo fácilmente que se resuelven sus estrellas si no fuera por la evidente forma de acumulación de las mismas en una bola. Las estrellas más brillantes parecen tener una tonalidad rojiza que contrasta con el resto de las estrellas más pálidas y grisáceas. Como las estrellas del exterior también se resuelven uno puede imaginar formas con las mismas, a mí me da la sensación de estar viendo brazos curvos de estrellas, es decir sería una especie de pequeños ganchos que salen del cúmulo. Esta primera impresión ha sido muy buena con un objeto GRANDE, compensado (mejor que uniforme porque sí que hay variación de brillo pero muy poco, es como un gradiente muy natural) y fácil de resolver y observar.</p>'
        },
        {
          boton: '98x - 50’ - 4.7mm', titulo: 'Nagler 22mm',
          img: 'm55_98x.webp',
          html: '<p>El cúmulo gana mucho en tamaño, llega a ocupar más de una quinta parte del ocular. Se va complicando su descripción porque empiezan a intuirse estructuras en la zona central. Describiendo el objeto desde el exterior hacia el interior del cúmulo, primero destacan estas estrellas sueltas que definen caminos curvados que se acercan a la zona más central del cúmulo, luego tenemos el centro del cúmulo en sí mismo, grande y con un brillo muy similar y no intenso. Pero en la parte central se distinguen algunas regiones más pobres en estrellas que aparecen a la vista como ríos oscuros que separan islas o zonas de estrellas más brillantes en la zona central. Esta estructura compleja es un reto para la observación. La forma que aprecio es parecida a una flecha con la punta muy abierta, o más bien como una onda con un pináculo por detrás, sería algo parecido a una D pero eliminando el palo izquierdo que une la curva de la D; además esta curva no tiene un grosor uniforme, es decir, son dos lóbulos más oscuros que se estrechan en el centro. Ojo que todo esto ocurre en la parte central del cúmulo donde se supone que el brillo es más uniforme pero claramente no lo es, con estas regiones más ricas y pobres en estrellas más o menos luminosas. En concreto en la zona este del núcleo del cúmulo.</p>'
        },
        {
          boton: '154x - 28’ - 3mm', titulo: 'Delos 14mm',
          img: 'm55_154x.webp',
          html: '<p>Es una maravilla ponerle aumentos a este tipo de objetos porque tu visión va cambiando con cada salto en el ocular, ganando en detalles, resolviendo más estrellas y sin embargo sin parecer que pierdas brillo.</p><p>Ahora el cúmulo casi entra en todo el ocular y no veo nada más allá del propio cúmulo cuando lo coloco en el centro del ocular. Me vuelvo a fijar más en la parte central del cúmulo y estas regiones de diferencia de brillo. Me parece ver incluso otra zona más con un poco de menos brillo, pegado a este arco de la D, en la zona más central del mismo. De nuevo me llama la atención la uniformidad del cúmulo, pero no en tanto a anodino, es decir que sea aburrido, sino todo lo contrario, la cantidad de estrellas individuales que se observan están repartidas por igual en todo el cúmulo, no veo ninguna zona de concentración especial, tampoco existe un halo claramente definido sino que existen estrellas más brillantes que destacan en la parte más externa del cúmulo pero todo él tiene un brillo bastante similar. Es un objeto complejo, porque se le ven estructuras distintas pero a su misma vez muy caótico y, en ese caos, existe cierta uniformidad. La palabra que más me viene a la mente es compensado, sin regiones que destaquen sobre las demás.</p>'
        },
        {
          boton: '216x - 27’ - 2.1mm', titulo: 'Ethos 10mm',
          img: 'm55_216x.webp',
          html: '<p>Ya lo he comentado muchas veces pero me encanta el juego de oculares Delos 14mm y Ethos 10mm, porque el campo se mantiene prácticamente igual pero los aumentos crecen. Ahora al ver con más detalle esta zona central me parece ver cuatro zonas más oscuras respecto al resto de la zona central un poco más brillante. Como estas cuatro zonas parece que se juntan en el centro que a su vez se estrecha, la imagen que me viene a la mente es la de una mariposa pero una mariposa sencilla, esa que dibujamos para los más peques con cuatro lóbulos, dos más anchos en la parte de abajo y otros dos más estrechos en la parte de arriba, pues algo así. Es complicado de observar porque estoy viendo zonas de distintos brillos en el núcleo mismo del cúmulo globular pero es realmente sugerente y llama la atención. Es imposible no intentar describirlo y sacarle más detalle. Sigo añadiendo aumentos para poder describir mejor esta zona central.</p>'
        },
        {
          boton: '270x - 22’ - 1.7mm', titulo: 'Ethos 8mm',
          img: 'm55_270x.webp',
          html: '<p>A estos aumentos entro dentro del cúmulo, y debo moverme con los motores levemente para observarlo desde el exterior hasta el interior. También me ha ocurrido algo curioso y es que dejo de ver los colores tan definidos en las estrellas, ahora son todas de un color más uniforme.</p><p>Partiendo desde el área externa del cúmulo, me doy cuenta que he perdido algunas estrellas y ya solamente quedan las más brillantes por lo que me da la sensación de que el cúmulo se ha contraído un poco o no es tan rico en su parte externa, y la zona central me parece más esférica que con los otros aumentos. Pero lo que me llama poderosamente la atención es la región central del núcleo. Ojo que todo lo que comento a continuación debéis imaginarlo no como una región central super-brillante como el resto de los cúmulos globulares, sino más bien como la continuación natural de una agrupación de estrellas bastante uniforme. Lo he repetido muchas veces pero es que una de las cosas que más me ha llamado la atención es la falta de "núcleo abigarrado y super-brillante" típico de los cúmulos globulares, así que todo es más sutil y difícil de observar.</p><p>Con estos aumentos ya no imagino una mariposa sino que me parece ver ríos que se unen en el centro del objeto, me digo a mí mismo que merece muchísimo la pena los detalles que estoy intentando ver y describir pero a la misma vez me siento incapaz de explicar la complejidad del núcleo del cúmulo, con estas regiones, así que salto al 4.5 para intentar verlo con más detalle y poder dar una descripción más acertada.</p>'
        },
        {
          boton: '480x - 9’ - 1mm', titulo: 'Delos 4.5mm',
          img: 'm55_480x.webp',
          html: '<p>BUAAAAAAAHHHHH, BRUTAL la imagen con el 4.5. Lo que me digo a mí mismo es que he destrozado el objeto. Con estos aumentos el cúmulo aparece un cúmulo abierto en vez de un cúmulo globular, es simplemente ESPECTACULAR e INCREÍBLE.</p><p>Veo el núcleo perfectamente pero a un tamaño increíble con muchísimo detalle. Describo lo que veo. En principio ya he desechado la idea de mariposa y me pongo a ver estas regiones de ríos oscuros que confluyen en el interior del cúmulo. Es muy sugerente porque pareciera como si todos ellos fueran a desembocar a una laguna central donde en un lateral de la misma hay una isla de estrellas más brillantes. Para poder entenderlo un poco mejor no es que vea zonas realmente oscuras, es que claramente veo regiones con estrellas individuales brillantes (levemente más brillantes que el resto) que además se agrupan formando hileras, y a los bordes de estas hileras es donde se quedan estas regiones, como zonas de menor brillo o ríos oscuros, pero no es negro ni nada parecido, sigue siendo gris pero un gris más tenue.</p><p>Así que fijándome en estas estrellas que resuelvo incluso en el mismo centro del cúmulo, me pongo a hacer el ejercicio contrario, es decir, en vez de fijarme en estos "ríos más oscuros" fijarme en las zonas brillantes que los delimitan y entonces la imagen que se forma en mi mente es maravillosa. Ahora en vez de ver ríos oscuros lo que veo son montañas, cordilleras o islas de estrellas. Las zonas más brillantes del núcleo, en su contraste con estas menos brillantes, parecen elevarse por encima del resto con lo que en tu mente se dibuja una ilusión de tridimensionalidad preciosa.</p><p>Es un placer pasar los minutos mirando tranquilamente la misma parte del objeto fijándote unas veces en un aspecto y luego en el otro, forzando la vista hasta el límite. Sugiero enormemente que se haga ese ejercicio. No te quedes simplemente con la visión general de lo que ves, sino toma un punto e intenta describirlo para ti mismo. Preguntad a vuestro cerebro: ¿pero qué estás viendo? ¿dónde está la diferencia que veo? ¿cómo le pongo palabras? Y la imagen se transforma casi por arte de magia. Empiezan a verse detalles que te dejan enganchado al objeto. En concreto, esa parte central del cúmulo, con esas zonas oscuras o brillantes depende dónde mires, es una gozada. Eso sí, necesitas llegar al menos a los 400x para disfrutar bien de esta imagen, porque con esos aumentos está todo perfectamente separado y es fácil de observar. Entonces aparecen claramente estas regiones, que antes se intuían, esa maravillosa complejidad que le da un aspecto tan bello en su interior. De verdad que es un ejercicio muy interesante de realizar y de disfrutar. Eso sí, creo que en total le he dedicado 1h de observación al objeto, pero merece la pena.</p>'
        }
      ]
    }],
    m57: [{
      // ── Observación 1 (M57) ──
      observador: 'autor',
      fecha: null,
      lugar: 'SQM-L 21.95 · IR -14 · 12º amb.',
      instrumento: 'Stargate 18”',

      pdf: 'https://theferretofcomets.com/wp-content/uploads/fichas/m57_inv.pdf',
      defaultIndex: 1,
      entries: [
        {
          boton: 'Exploración', titulo: 'M57. Exploración',
          img: null,
          html: '<p>Síntesis de la observación. Sobre la Nebulosa del Anillo (Lyra) se identifican los rasgos descritos a lo largo de la sesión:</p><ul style="margin:8px 0;padding-left:20px;"><li>Forma</li><li>Descubrir la diferencia entre el arco noreste y suroeste (el arco noreste se extiende más “lejos” que el sureste)</li><li>Establecer la diferencia de grosor del anillo en su eje corto y eje largo</li><li>Velo tenue alrededor del anillo (a bajos aumentos)</li><li>Pelos en la parte externa del anillo</li><li>Diferenciar el grosor del anillo en sus cuatro regiones</li><li>Sensación de volumen o tridimensionalidad en el toro que define al anillo</li><li>Degradado del interior del anillo formando acantilados de brillo que se precipitan al interior de la nebulosa</li></ul><p style="font-size:13px;color:#9fb6c9;">Catálogo Messier · Lyra · 18h 53m, +33º 02’. Orientación: N a las 6, O a las 9, S a las 12 y E a las 3.</p>'
        },
        {
          boton: '70x - 1º 10’ - 6.6mm', titulo: 'Nagler 31mm',
          img: 'm57_70x.webp',
          html: '<p>Lo primero que me sorprende a estos bajos aumentos es la forma de la nebulosa. Es archiconocida su forma de anillo con la parte central brillante además del anillo exterior, pero esta vez, además de verla más luminosa, lo que me llama la atención es su forma en los bordes más estrechos de la nebulosa. Como bien es sabido tiene forma ovalada, y si nos fijamos en el eje mayor del óvalo, en su cierre o giro hay una estrella muy brillante; en el extremo contrario me parece ver que la nebulosa no es uniforme en esa parte, sino que pierde un poco de brillo al hacer el giro y además se extiende hacia afuera. Es como la imagen que provoca la nebulosa de Saturno, que tiene una especie de salientes por ambos lados del círculo que es la nebulosa. Pues algo así pero solamente en uno de sus extremos, como un pequeño halo más tenue que sobresale de la nebulosa en su extremo. En la zona cercana a la estrella la visión es similar sin embargo aquí la estrella brillante dificulta ver con atención este halo más tenue.</p><p>Además ambos extremos aparecen como si el anillo no llegara a cerrarse, es decir, la forma de la nebulosa es claramente este anillo, sin embargo el anillo tiene un brillo y grosor muy definido en el eje corto pero en el eje largo del óvalo el anillo parece perder brillo y aunque se ve perfectamente transmite la sensación que no termina de cerrarse con el mismo brillo, como si en esa zona la nebulosa fuera más tenue. Además tenemos estas "extensiones" en los bordes exteriores del anillo en su eje mayor que aún le da una estructura más compleja.</p><p>También me llama mucho la atención el brillo del interior del anillo, siempre lo había visto como significativamente menor y jugando con la visión lateral y la visión directa, en mi antiguo Visac 200L incluso lo hacía desaparecer viendo solamente el anillo. Ahora es imposible, es tremendamente brillante toda la parte interior del anillo aunque no se ven más detalles.</p>'
        },
        {
          boton: '98x - 50’ - 4.7mm', titulo: 'Nagler 22mm',
          img: 'm57_98x.webp',
          html: '<p>La imagen no varía mucho de la anterior, el objeto ha ganado en tamaño, obviamente, pero la imagen sigue siendo muy parecida. Quizás ahora los bordes de la nebulosa los veo un poco más complejos, me da la sensación que tuviera un suave pañuelo de seda semitransparente por encima de la parte más brillante del borde del anillo, de forma que cuando este "velo" sobresale de la zona brillante se ve como una especie de onda muy tenue que se extiende un poco más allá de la nebulosa, muy poco, casi la mitad o incluso una cuarta parte que el ancho de la zona brillante de la nebulosa que le da su forma de anillo. Es más significativo en la zona más alejada de la estrella brillante cercana a la nebulosa.</p><p>También me llama la atención el contorno de la nebulosa porque aparece rodeada por unas estrellas que creo antes jamás había visto o no con tanta atención. Intento describirlo. Primero veo la estrella brillante que en la posición en la que está el objeto y como lo estoy viendo queda en mi parte más baja de la nebulosa a la derecha, luego en la parte de "arriba" de la nebulosa y en la zona izquierda veo como un primer punto borroso que al centrar un poco mejor la vista descubro son 2 estrellas cercanas a la nebulosa. Pero es que en la misma zona a la izquierda pero más hacia abajo, acercándose a la estrella brillante veo otra estrella más que encuadra la nebulosa. Es solamente la zona más "arriba" de la nebulosa donde no veo estrella alguna cercana a la nebulosa.</p>'
        },
        {
          boton: '154x - 28’ - 3mm', titulo: 'Delos 14mm',
          img: 'm57_154x.webp',
          html: '<p>Increíble cómo gana la imagen al añadir aumento. Primero me llama la atención los "alrededores" de la nebulosa. Las dos estrellas que me costó trabajo identificar en el ocular anterior aquí son evidentes. Para intentar describirlo mejor, en mis notas de voz uso la distribución del reloj, y anoto: si colocamos la estrella más brillante a las 6 de la nebulosa las dos estrellas cercanas estarían a sus 10 y 11, aparece otra nueva estrella a las 3, y otra más, un poco más separada del anillo a las 8. Además me parece ver una estrella más en la zona que indicaba que el anillo estaba como "desdibujado", como a su 1 o cerca de las 12, pero esta estrella es mucho más débil y está muy pegada a la nebulosa.</p><p>Respecto al anillo en sí, además de confirmar su forma ovalada, y que en los extremos se muestra desdibujado, es decir, sin continuar con la misma intensidad de brillo, la parte externa del anillo me parece realmente compleja. En particular en la zona que sería las 9 del anillo tomando como referencia la estrella brillante a las 6, y la zona de las 3. La zona de las 9 lo que veo (o creo ver) es esa especie de onda que comentaba anteriormente como un velo de seda muy suave que sobresale un poco más del anillo dándole una forma aún más ovalada. Pero en la zona de las 3 lo que me da la sensación es ver un doble anillo, mucho más tenue el segundo, de un grosor mínimo, diría que la quinta parte del grosor del anillo principal, sobresaliendo del anillo principal.</p><p>Respecto al interior del anillo, con estos aumentos el brillo ya no es tan intenso y me parece que el mismo no es uniforme, con lo que aparecen una especie de gránulos en su interior, es decir, soy incapaz de ver una superficie "plana" y "homogénea" de brillo en el interior de la nebulosa, sino que más bien es un borrón de distintos brillos pero sin poderlo definir correctamente.</p>'
        },
        {
          boton: '216x - 27’ - 2.1mm', titulo: 'Ethos 10mm',
          img: 'm57_216x.webp',
          html: '<p>Con cada salto de ocular gano más detalles. Además un ejercicio que me encanta al ir pasando de un ocular a otro es que te fuerzas a querer ver las diferencias y, por ello mismo, vas descubriendo nuevos detalles que antes no veías o que te saltabas. Cada vez el objeto es más grande y con este ocular, sin perder campo, he ganado en tamaño. Sigo viendo más o menos las mismas estrellas alrededor de la nebulosa pero no aprecio ningún detalle extra a los ya descritos.</p>'
        },
        {
          boton: '270x - 22’ - 1.7mm', titulo: 'Ethos 8mm',
          img: 'm57_270x.webp',
          html: '<p>Es precioso el hecho de poner más y más aumento al objeto. Ahora las estrellas que veía alrededor del anillo han quedado realmente separadas del objeto porque he ganado bastante en aumento, y confirmo totalmente la estrella que estaba a la 1 o a las 12, que es realmente tenue pero se confirma muy pegada al anillo. También aparece una nueva estrella que está más o menos a las 2 pero más separada del anillo. Ahora me parece que soy capaz de ver la estrella central de la nebulosa como un puntito que aparece de mayor brillo. Tengo que usar la visión lateral para confirmarlo pero efectivamente ahí está.</p><p>Lo que me llama la atención con tantos aumentos es que las zonas externas del anillo tienen como una especie de "pelos", es decir el borde exterior del anillo no me parece que sea uniforme y totalmente recto, sino que posee una serie de imperfecciones que hace que sea difícil indicar dónde termina EXACTAMENTE el anillo en su parte exterior.</p><p>También observo claramente cómo el tamaño del anillo brillante es mucho más estrecho en sus 9 y sus 3 que a sus 6 ó 12 (tomando como referencia esta estrella brillante), es decir, el anillo es claramente ovalado pero es que además, el grosor del anillo brillante externo varía según la zona que veamos. La más estrecha de todas es la región de las 9, luego sería la región de las 3, luego es significativamente más ancho a las 12 (aunque desdibujado) y por último a las 6 es donde muestra su mayor anchura aunque de nuevo desdibujado y sobresaliendo un poco hacia la estrella más brillante.</p>'
        },
        {
          boton: '480x - 9’ - 1mm', titulo: 'Delos 4.5mm',
          img: 'm57_480x.webp',
          html: '<p>Aunque pudiera parecerme que me estoy pasando de aumentos es impresionante ver el anillo con estos aumentos y con este tamaño. Me cuesta mucho más trabajo enfocar las pocas estrellas que ya veo pero la imagen merece muchísimo la pena.</p><p>Por un lado me llama la atención la estrella tenue que está a las 12 - 1 de la nebulosa porque me parece que la misma intentara atraparla, es decir me parece ver como una especie de "chorro" que saliera desde la nebulosa para intentar alcanzar esta estrella. Aunque dudo de esta imagen porque el hecho de tener una estrella tan cerca de la nebulosa a veces te distorsiona la imagen que ves. Pero diría que existe esa "extensión" de la nebulosa hacia la estrella.</p><p>Otro detalle que me llama la atención con este ocular es la sensación de volumen que me da la nebulosa. Como describí con el ocular anterior el grosor del anillo no es el mismo en todo su recorrido, sumado a esto ahora veo la nebulosa más grande y un poco más desdibujada en general (el enfoque es más complejo y el seeing afectará más supongo) con lo que la impresión general es más de volumen que no de una imagen plana, es decir que parece más en 3D y eso le da un aspecto precioso. Confirmo todo lo anteriormente descrito, y me deleito con esta imagen en 3D tan sugerente.</p>'
        },
        {
          boton: '960x - 4.5’ - 0.5mm', titulo: 'Delos 4.5mm + Powermate 2x',
          img: 'm57_960x.webp',
          html: '<p>VAYA LOCURA. Se me ha ido totalmente la pinza y he puesto la Powermate con el 4.5, por simple curiosidad, y me he quedado de PIEDRA. Es INCREÍBLE cómo se ve el anillo a estos aumentos tan extremos. Recomiendo encarecidamente que hagáis este esfuerzo y esta locura. Lástima que no me está haciendo bien el seguimiento el telescopio.</p><p>A estos aumentos he perdido mucho del brillo de la nebulosa, en particular en su parte más central, pero cuando me refiero a la parte central, no es que sea simplemente la zona de "dentro" del anillo brillante, sino la parte central de la zona de dentro del anillo. Porque en la parte que está cerca del anillo brillante hay zonas con brillo, y con un gradiente tal que parece que estuviera viendo "acantilados". ES IMPRESIONANTE. El anillo es muy brillante, y el interior del anillo su zona central es totalmente oscura (quitando la acumulación de brillo por la estrella central) y por ello es muy fácil delimitar si realmente hay un salto brusco de brillo de un negro a una zona prácticamente blanca. Y eso no ocurre ni de lejos, sino que hay un gradiente, un gradiente casi del mismo grosor que el propio anillo o quizás un poco más pequeño pero significativamente grande. Ese gradiente gris, que anticipa la zona negra, y viniendo desde la región brillante es una GOZADA, porque te transmite esa sensación de estar hundiéndote en la profundidad de la nebulosa. Como si estuvieras navegando hacia su interior y es una imagen simplemente ESPECTACULAR.</p><p>El tamaño del objeto es BRUTAL también a estos aumentos. La estructura exterior no he conseguido definirla mejor, pero es que la imagen en su conjunto de la zona central es increíble. Y lo más impresionante es que JAMÁS, JAMÁS, JAMÁS había visto así la Nebulosa del Anillo. Ahora me da la sensación que antes solamente "rascaba" su imagen, ahora realmente la contemplo en su real complejidad y belleza. De verdad que es alucinante. Estoy muy contento de haber repasado los objetos Messier. Qué sensación de volumen tengo en el objeto y qué sensación de profundidad. Es algo alucinante.</p><p>También indicar que obviamente las 18" del telescopio ayudan muchísimo a tener esta imagen por la cantidad de luz que recoge, pero por favor, si tienes la oportunidad de usar un telescopio de tamaño considerable con M57, ponerle todos los aumentos que tengáis. Creo que es algo que os marcará. Yo me he quedado alucinado viendo M57 como jamás la había visto en mi vida. Antes tenía la sensación de estar viendo algo "de alguna forma" irreal, porque parecía demasiado plano en el ocular. Con estos aumentos es como si estuviera sobrevolando la nebulosa y todo se volviera mucho más real. Sin lugar a dudas es por esa sensación de tridimensionalidad de los distintos niveles de brillo. Entre el brillo intensísimo del anillo que parece un donut, o toro para ser más precisos, ya que sin duda tiene volumen, y la zona de "acantilados" o "pendientes" que además no son uniformes sino que son de un gris tenue que es recorrido por líneas más oscuras que te llevan hasta una zona central totalmente negra, en la que en el centro hay una concentración de brillo que jugando con la visión directa y periférica se puede reducir hasta verse como un puntito. Es ese conjunto, ocupando TODO tu campo de visión, el que hace que alucines y veas la nebulosa como jamás la habías visto antes. Qué maravilla.</p>'
        }
      ]
    }]
  };

