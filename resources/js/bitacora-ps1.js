/* ===========================================================================
 * BITÁCORA ESTELAR · Capa difusa desde imagen real (la ley PS1) · COMPARTIDO
 * ---------------------------------------------------------------------------
 * «PS1» nombra la ley, no el sondeo: parche, PSF, quitar estrellas, perfil,
 * fusión imagen/modelo, anclaje al catálogo, opacidad. Que su único proveedor
 * de imagen hoy sea Pan-STARRS 1 es un detalle de adquisición (ADR 0020).
 *
 * Frontera con la cadena fotométrica (dueño: BitacoraGaiaRender): el ciclo es
 * de llamada, no de carga. Este módulo lee window.BitacoraGaiaRender por R()
 * cuando lo necesita, y vistaGaia lee window.BitacoraPS1 con su guardián. El
 * muro medido son 8 símbolos: ctxFotometrico, sbUmbralContraste, valorDeFlujo,
 * flujoDeValor, radioImagenEstelar, difusoMaskDe, capaEstrellas y pintarFot.
 *
 * Calibración en BitacoraPS1.cfg (antes BitacoraGaiaRender.ps1).
 * =========================================================================== */
(function () {
  'use strict';

  function R() {
    var m = window.BitacoraGaiaRender;
    if (!m) throw new Error('BitacoraPS1 necesita BitacoraGaiaRender (cadena fotométrica)');
    return m;
  }
  /* ═══════════ CAPA DE GALAXIAS DESDE IMAGEN REAL (ps1cutouts, STScI) ═══════════
     Una galaxia del RC3 se pinta con SU PROPIA imagen de PanSTARRS-1 en vez de con
     un perfil sintético: un parche por objeto que entra en el mismo Float32Array
     `difuso` que ya usa el halo de los globulares, y sale por pintarFot debajo de
     las estrellas de Gaia.

     Tres cosas hay que saber para leer lo que sigue (detalle y medidas en
     .scratch/difusas-desde-imagen/, fichas 03 y 10):

      · **El nivel absoluto lo pone el CATÁLOGO, no la imagen.** El `ZPT` de la
        cabecera existe, pero a μ≈24 el residuo de cielo del stack desplaza el
        brillo superficial más que cualquier error de punto cero. Así que se resta
        cielo, se integra y se reescala a la mag V del RC3: la imagen aporta la
        forma y el contraste interno; el catálogo, la luz.
      · **fitscut sirve UNA skycell (~26′), no un mosaico.** Fuera de ella devuelve
        NaN. Un parche que cruza el borde —le pasa a ~40 % de los objetos— se cose
        pidiendo el MISMO recorte a cada skycell que toque y quedándose con el
        píxel válido. Eso lo hace `ps1-proxy.php`, que entrega el parche ya
        cosido en una sola petición; aquí solo se lee. No hay que reproyectar:
        llega sobre la rejilla pedida.
      · **Resolver skycells, armar la URL de fitscut y exigir `wcs=1` es cosa del
        proxy** (test: `scripts/test_ps1_proxy.php`). Sin `wcs=1`, x/y se leen
        como coordenadas de PÍXEL y el servicio responde 200 OK con un recorte de
        otro sitio, sin error y sin aviso. */
  var PS1 = {
    banda: 'g',            // la más cercana al pico escotópico (507 nm) y la más profunda del 3π
    /* px del parche que se pide al proxy (él remuestrea y corrige la WCS). A 512
       la escala salía a lado/512 —2,35″/px en una galaxia de 20′— y a esa escala
       la PSF del telescopio (ps1PsfParche) es literalmente la identidad: con
       σ = 0,14 px el kernel gaussiano en float32 sale [8e-12, 1, 8e-12], así que
       un 457 y un 914 mm daban la MISMA imagen, bit a bit. A 1024 la diferencia
       entre esos dos aparece a 1–3 σ del ruido de cielo, 213× el suelo de
       sensibilidad del método. Es el tope del proxy (PS1_SALIDA_MAX, ps1-proxy.php:46);
       llegar a 0,67″/px en una galaxia de 20′ pediría 1794 px, y son otros 12 MB. */
    salida: 1024,
    ladoFactor: 6,         // lado del parche = 6·r_e → radio 3·r_e ≈ 94 % de la luz de un disco
    ladoMax: 20,           // ′: por encima, el parche se sale de la skycell casi seguro
    ladoMin: 1.5,          // ′: por debajo no queda parche que mirar
    decMin: -30,           // PS1 no cubre más al sur (365 de las 1295 filas del RC3)
    /* Objeto que el manifiesto de texturas no menciona: se pide a STScI como
       hasta ahora. Es el régimen mixto mientras el manifiesto no cubra el
       catálogo entero; con `false`, un objeto sin textura se pinta por su fila
       y no sale una sola petición fuera de dso/. */
    proxyRespaldo: true,
    fracMin: 0.4,          // fracción mínima de la luz del catálogo que el parche debe abarcar (ver ps1GalaxiasDelCampo)
    seeingAs: 1.1,         // ″: FWHM típica del stack, suelo del radio de máscara
    mascaraMaxAs: 60,      // ″: tope del radio de máscara de una estrella (una de g≈9 ya lo toca)
    mascaraMagRef: 22,     // mag G a la que el radio de máscara es el seeing (≈ el fondo del stack; ver ps1RadioMascaraAs)
    mascaraProf: 20,       // mag G hasta la que se piden estrellas para la máscara (tope del proxy)
    rellenoPlanoMaxAs: 40, // ″: hasta este radio la máscara se rellena con el fondo local; por encima se deja al cielo (ver ps1QuitarEstrellas)
    mordidaCobMin: 0.6,    // fracción de la elipse de una compacta tapada por discos anchos a partir de la cual la mordida manda (ver ps1CoberturaMordida)
    muEscena: 25,          // mag/arcsec²: isofota que delimita la escena difusa protegida (ver ps1EscenaEnParche)
    realceMax: 2,          // techo del realce perceptual mientras haya parche de imagen (ver realzarPerceptual)
    kRuido: 1.5,           // σ del borde por debajo de las cuales no hay galaxia (ver ps1AnclarACatalogo)
    /* σ por debajo del CIELO a partir de las cuales el píxel no es ruido sino
       sobresustracción del stack (el fondo restado por skycell se comió señal:
       M51 tenía el 27,6 % del anillo 60–160″ así, con DN negativos, y salía un
       foso negro pegado a los brazos). Ese píxel no vale 0 —un 0 es una medida—
       sino AUSENCIA (NaN), la misma que los huecos de estrellas saturadas, y el
       pintado lo rellena con (1−w)·perfil. k=2 está en la meseta medida k=1–3
       (los observables varían <3 %): por encima de 2σ bajo el cielo ya no hay
       ruido que confundir. Medido en .scratch/diagnostico-oscuros/INFORME2.md. */
    kAusencia: 2,
    /* Halo extrapolado: hasta qué brillo superficial (mag/arcsec²) se sigue el
       perfil del catálogo donde la imagen ya no trae señal. El stack de PS1 se
       acaba cerca de μ≈25, pero la luz del disco sigue ahí: 28,5 es el suelo
       habitual de la fotometría profunda de halos. */
    muHalo: 28.5,
    /* Umbral de contraste (Blackwell/Clark): magnitudes de brillo superficial
       por encima del UMBRAL DE DETECCIÓN (sbUmbralContraste, o sea Fcielo·Cmin)
       a las que la galaxia se pinta entera. Por debajo de deltaMin es
       indetectable y no se pinta.
       El Δ se medía antes contra SBe —el cielo ya atenuado por la pupila—
       mientras el brillo del objeto NO llevaba esa atenuación. Eso metía un
       término 2,5·log10(1/dim) en el contraste que, a igual aumento, restaba
       1,76 mag al pasar de 8″ a 18″: más apertura pintaba MENOS galaxia. La
       física es la contraria: el objeto se apaga igual que el cielo y el Δ real
       no cambia; lo que cambia es el UMBRAL, por luminancia retinal y por
       tamaño aparente, y las dos ya viven en Cmin (FOT.C_EXP y FOT.C_MAG_*).
       deltaPlena era 3,25, heredado de cuando el Δ se medía contra SBe y valía
       ~2 mag más. Medido contra el umbral, 3,25 pide 20× el contraste umbral
       para pintar la galaxia entera y la dejaba translúcida en todo el cuerpo.
       2,5 mag = 10× el contraste umbral, que es donde Blackwell deja de ver el
       objeto «al límite» y lo ve de forma franca. Con eso el disco de M81 a un
       radio efectivo sale a opacidad 0,61 en un 8" y plena en un 18": la
       apertura se nota justo donde tiene que notarse, en el cuerpo débil.
       Medido en scripts/barrido_deltaplena.js.
       deltaExp era 1,8 y ese exponente era el AMPLIFICADOR del contraste: la
       rampa convierte un cociente de contrastes en (Δ1/Δ2)^exp, así que el
       interbrazo real de M81 (μ22,45, Δ=0,55) contra su brazo (μ20,6, Δ=2,40)
       pasaba de ×5 en la imagen a ×14 en pantalla — una envolvente negra que
       la imagen no trae. Con 1,0 queda en ×4,3, pegado al contraste real, y el
       brazo no se toca (op 0,95). La rejilla deltaPlena 2,5/4/6 × deltaExp
       1,0/1,8 está medida en .scratch/diagnostico-oscuros/INFORME2.md: subir
       deltaPlena NO arregla el foso, solo apaga los brazos. */
    deltaMin: 0.0, deltaPlena: 2.5, deltaExp: 1.0,
    /* Condiciones de activación del halo (ver ps1HaloActivo): eje menor mínimo
       de la isofota 25, en ′, y brillo superficial medio a partir del cual la
       galaxia se considera difusa. El 22,25 sale de la separación natural de
       los datos de prueba (M82 22,11 contra M51 22,39); si algún día a25/b25
       dejan de reconstruirse y vienen del D25 del RC3, se reajusta aquí. */
    haloMenorMin: 1.5, haloMuFijo: 22.25,
    /* Mezcla de imagen y perfil (ver ps1PesoImagen). `mezclaCajaAs` es el lado
       de la vecindad donde se mide cuánta información trae la imagen y
       `mezclaW0` la fracción a partir de la cual la imagen manda del todo.
       Medido en M51 (13-ago-2026): la caja mueve poco la fotometría y bastante
       el detalle (contraste azimutal 2,18 con 6″ contra 1,42 con 100″); la
       perilla que manda es w0. Con 0,5 los brazos, el puente y el polvo
       destacan y el borde del parche no se ve; con 0,2 el detalle sube pero
       asoma el CUADRADO del parche, porque el peso satura hasta el mismo
       borde. */
    mezclaCajaAs: 25, mezclaW0: 0.5,
    // Índice de Sérsic: ya NO decide (ver ps1HaloActivo), pero el tope se queda
    // por si vuelve a hacer falta con ps1ConcentracionN.
    haloSersicMax: 2.5,
    /* EXPERIMENTAL, apagada: reposición de flujo en el vecino ausente
       (ver ps1ReponerNaN). Apagada, el render es bit a bit el de siempre. */
    confianzaLocalNaN: false,
    /* APAGADA. Encendida, dentro de la escena difusa ya detectada
       (ps1EscenaEnParche) la rampa de opacidad no volvía a decidir —es la ley
       de DETECCIÓN, y aplicada píxel a píxel dentro del objeto esculpía
       estructura interna que no está en los datos: el anillo negro de M81, el
       negro entre los brazos de M51—, pero al forzar op = 1 en TODA la elipse
       hacía otra cosa que no es protección: resucitaba el fondo sub-umbral de
       dentro y lo pintaba. En M101 a 190× eran 380 160 px del lienzo que
       estaban a nivel de cielo, o sea la elipse entera vista como una gran
       envolvente circular de fondo alrededor de la galaxia
       (scripts/vistas_opacidad_escena.js).
       La escena puede PROTEGER de un oscurecimiento artificial, pero no puede
       APORTAR señal, y una condición geométrica uniforme sobre la elipse no
       sabe distinguir las dos cosas: cualquier suelo de opacidad constante
       dentro de μ=25 vuelve a dibujar la elipse. Se probó la variante que solo
       sube la opacidad PARCIAL y deja en cero lo que la rampa apaga (nada de
       resucitar): quita el 97,7 % de la envolvente de M101, pero aplana el
       cuerpo en mesetas de opacidad 1 con contorno duro —M81 sale posterizada,
       como un mapa de curvas de nivel—. Una protección que no dibuje geometría
       tiene que mirar el entorno del píxel, no la elipse; queda pendiente.
       El sitio donde la escena SÍ manda sigue siendo ps1QuitarEstrellas. */
    opacidadInternaEscena: false,
    /* Apagado a propósito, no diagnóstico: el óvalo del Sérsic más allá de la
       isofota 25 (y el relleno de perfil dentro del parche) se descartó por
       resultado —el usuario prefiere el render sin él—. ps1HaloActivo queda
       siempre false. Las funciones que lo alimentan (ps1PesoImagen,
       ps1EscalaMezcla, ps1FlujoModelo, ps1PerfilEnParche, ps1MedidasHalo...)
       se conservan porque las usan los harness/test de la investigación de
       las fases 1-4; con el flag a false quedan inertes en el render. */
    haloExtrapolado: false
  };

  /* Interruptor de la capa, aquí y no en cada llamador: los dos puntos de uso
     (simulador y formulario de registro) tienen que responder al mismo mando.
     Encendido desde la ficha 12; la casilla del simulador lo apaga, y el
     formulario lo hereda sin casilla propia. */
  var GALAXIAS_IMAGEN = true;

  /* Lado del parche en minutos de arco. `r_e` viene en segundos (columna 4 del
     catálogo). El tope de 20′ lo tocan 200 de las 1295 filas: en esas, parte de la
     luz del catálogo cae fuera del parche y la corrige ps1FraccionLuz. */
  function ps1LadoArcmin(reArcsec) {
    var lado = PS1.ladoFactor * (reArcsec > 0 ? reArcsec : 0) / 60;
    return Math.max(PS1.ladoMin, Math.min(PS1.ladoMax, lado));
  }

  /* URL del parche en el proxy. El parche NO depende del ocular ni del aumento
     (ficha 10), así que la petición solo lleva objeto, lado y banda: por eso el
     proxy puede cachearlo para siempre.

     Las dos URL son configurables (`cfg` no: son direcciones, no calibración;
     van con getter/setter en el objeto exportado, como
     BitacoraGaiaRender.dssProxyUrl). Hasta ahora eran constantes sin setter y
     ningún test podía redirigirlas a una fixture. */
  var PS1_PROXY_URL = '/wp-content/uploads/bitacora/ps1-proxy.php';
  /* Directorio de texturas propias, servido por el mismo dominio: ahí viven el
     PNG de 16 bits y el sidecar de cada objeto (ver ps1LeerTextura). */
  var TEXTURAS_URL = '/wp-content/uploads/bitacora/dso/';

  function ps1UrlParche(gal, salida) {
    return PS1_PROXY_URL +
      '?ra=' + Number(gal.ra).toFixed(5) + '&dec=' + Number(gal.dec).toFixed(5) +
      '&lado=' + Number(gal.ladoArcmin).toFixed(2) +
      '&salida=' + (salida || PS1.salida) + '&banda=' + PS1.banda;
  }

  /* Lector de FITS mínimo: cabecera de tarjetas de 80 caracteres en bloques de
     2880 bytes, datos float32 BIG-ENDIAN (BITPIX=-32). Solo se leen las claves que
     esta capa usa. Lo que ninguna skycell cubre llega como NaN y se conserva como
     NaN: es la marca de "aquí no hay dato" que el proxy no pudo coser. */
  function parseFITS(buffer) {
    var bytes = new Uint8Array(buffer), cab = {}, datos = -1, i, j, linea, clave;
    for (i = 0; i + 80 <= bytes.length; i += 80) {
      linea = '';
      for (j = 0; j < 80; j++) linea += String.fromCharCode(bytes[i + j]);
      clave = linea.slice(0, 8).trim();
      if (clave === 'END') { datos = Math.ceil((i + 80) / 2880) * 2880; break; }
      if (linea.charAt(8) === '=' && !(clave in cab)) cab[clave] = linea.slice(9);
    }
    if (datos < 0) return null;
    function num(k, pordefecto) {
      var v = cab[k] != null ? parseFloat(cab[k]) : NaN;
      return isFinite(v) ? v : pordefecto;
    }
    var ancho = num('NAXIS1', 0), alto = num('NAXIS2', 0);
    if (!(ancho > 0 && alto > 0) || num('BITPIX', 0) !== -32) return null;
    if (datos + ancho * alto * 4 > bytes.length) return null;
    var vista = new DataView(buffer), v = new Float32Array(ancho * alto);
    var bzero = num('BZERO', 0), bscale = num('BSCALE', 1);
    for (i = 0; i < v.length; i++) v[i] = bzero + bscale * vista.getFloat32(datos + i * 4, false);
    /* La WCS entera, no solo la escala. El recorte llega en la rejilla PROPIA de
       la skycell, cuyo punto de tangencia (CRVAL) puede quedar a grados del
       objeto; ahí el norte del cielo sale GIRADO dentro del parche. En M81 el
       giro son 3,6°, que en el borde del parche son 16 px: colocar las estrellas
       de Gaia suponiendo norte arriba dejaba la estrella sin tapar y la máscara
       excavando un agujero al lado (ver .scratch/estrellas-de-mas/rotacion.js).
       Grados por píxel con el PC ya dentro; si la matriz tiene términos cruzados
       —ninguna skycell de PS1 los trae— se devuelve null y todo se cae al
       supuesto de siempre, que es lo que había antes. */
    function ejeGrados(cdelt, pcA, pcB, cd) {
      var c = num(cdelt, NaN);
      return isFinite(c) ? c * num(pcA, num(pcB, 1)) : num(cd, NaN);
    }
    var gx = ejeGrados('CDELT1', 'PC001001', 'PC1_1', 'CD1_1');
    var gy = ejeGrados('CDELT2', 'PC002002', 'PC2_2', 'CD2_2');
    var cruce = num('PC001002', num('PC1_2', 0)) || num('PC002001', num('PC2_1', 0)) ||
                num('CD1_2', 0) || num('CD2_1', 0);
    var ra0 = num('CRVAL1', NaN), dec0 = num('CRVAL2', NaN);
    var rx = num('CRPIX1', NaN), ry = num('CRPIX2', NaN);
    var completa = !cruce && gx && gy && isFinite(gx) && isFinite(gy) &&
      isFinite(ra0) && isFinite(dec0) && isFinite(rx) && isFinite(ry);
    return {
      ancho: ancho, alto: alto, datos: v,
      // CDELT en grados; el que interesa es el módulo, en ″/px.
      escalaAs: Math.abs(num('CDELT2', num('CD2_2', 0))) * 3600,
      // CRPIX es 1-based en el FITS; aquí todo va 0-based.
      wcs: completa ? { ra0: ra0, dec0: dec0, x0: rx - 1, y0: ry - 1, gx: gx, gy: gy } : null,
      zpt: num('ZPT_0000', NaN)
    };
  }

  /* (α, δ) → píxel del parche (0-based) por la gnomónica de su WCS. null si el
     punto cae en el otro lado del cielo, donde la TAN ya no existe. */
  function ps1CieloAPixel(w, ra, dec) {
    var G = Math.PI / 180;
    var a0 = w.ra0 * G, d0 = w.dec0 * G, a = ra * G, d = dec * G;
    var sd = Math.sin(d), cd = Math.cos(d), da = a - a0;
    var cosc = Math.sin(d0) * sd + Math.cos(d0) * cd * Math.cos(da);
    if (!(cosc > 0)) return null;
    var xi = cd * Math.sin(da) / cosc;
    var eta = (Math.cos(d0) * sd - Math.sin(d0) * cd * Math.cos(da)) / cosc;
    return [(xi / G) / w.gx + w.x0, (eta / G) / w.gy + w.y0];
  }

  /* El parche visto como una AFÍN alrededor del objeto: lleva un desplazamiento
     en ″ (este, norte) desde el centro del objeto hasta un píxel del parche, y
     al revés. Es el jacobiano de la TAN ahí mismo, así que recoge el giro y la
     escala de verdad; lo único que deja fuera es la curvatura de la proyección,
     que en un parche de 20′ vale 0,5 px de mediana y 2 px en el peor caso
     (.scratch/estrellas-de-mas/afin.js). Se usa donde se paga por píxel; para
     las estrellas, que son pocas, se evalúa la TAN exacta.
     Sin WCS sale lo de siempre: norte arriba, este a la izquierda. */
  function ps1AfinParche(f, gal) {
    var esc = (f.escalaAs > 0) ? f.escalaAs : gal.ladoArcmin * 60 / f.ancho;
    var a = { cx: (f.ancho - 1) / 2, cy: (f.alto - 1) / 2,
              xe: -1 / esc, xn: 0, ye: 0, yn: 1 / esc };
    var c = f.wcs ? ps1CieloAPixel(f.wcs, gal.ra, gal.dec) : null;
    if (c) {
      var cd = Math.cos(gal.dec * Math.PI / 180), paso = 1 / 3600;
      var pe = ps1CieloAPixel(f.wcs, gal.ra + paso / (cd || 1), gal.dec);
      var pn = ps1CieloAPixel(f.wcs, gal.ra, gal.dec + paso);
      if (pe && pn) {
        a = { cx: c[0], cy: c[1], xe: pe[0] - c[0], ye: pe[1] - c[1],
              xn: pn[0] - c[0], yn: pn[1] - c[1] };
      }
    }
    // La vuelta: de píxel (dx, dy respecto al centro) a (este, norte) en ″.
    var det = a.xe * a.yn - a.xn * a.ye || 1e-12;
    a.ex = a.yn / det; a.ey = -a.xn / det;
    a.nx = -a.ye / det; a.ny = a.xe / det;
    return a;
  }

  /* Cielo del parche: mediana del BORDE. El stack ya viene restado, pero le queda
     un pedestal que a μ≈24 pesa más que el punto cero, y sin quitarlo el difuso
     llega al render con un suelo que no es del objeto. El borde, y no la mediana
     global, porque en un parche de 6·r_e el objeto ocupa el centro entero. */
  function ps1Cielo(datos, ancho, alto) {
    var m = [], x, y;
    var grosor = Math.max(1, Math.round(Math.min(ancho, alto) * 0.06));
    for (y = 0; y < alto; y++) {
      var borde = (y < grosor || y >= alto - grosor);
      for (x = 0; x < ancho; x++) {
        if (!borde && x >= grosor && x < ancho - grosor) continue;
        var v = datos[y * ancho + x];
        if (v === v) m.push(v);
      }
    }
    if (!m.length) return 0;
    m.sort(function (a, b) { return a - b; });
    return m[m.length >> 1];
  }

  /* Ruido del parche: σ robusta (MAD·1,4826) del mismo borde del que sale el
     cielo. Robusta y no desviación típica porque en el borde también hay
     estrellas, y una sola brillante dispararía la σ. En M51 sale 17 DN, contra
     los ~5 DN que le queda de galaxia a 6′ del centro. */
  function ps1SigmaCielo(datos, ancho, alto, cielo) {
    var m = [], x, y;
    var grosor = Math.max(1, Math.round(Math.min(ancho, alto) * 0.06));
    for (y = 0; y < alto; y++) {
      var borde = (y < grosor || y >= alto - grosor);
      for (x = 0; x < ancho; x++) {
        if (!borde && x >= grosor && x < ancho - grosor) continue;
        var v = datos[y * ancho + x];
        if (v === v) m.push(Math.abs(v - cielo));
      }
    }
    if (!m.length) return 0;
    m.sort(function (a, b) { return a - b; });
    return 1.4826 * m[m.length >> 1];
  }

  /* Radio de máscara de una estrella, en ″: crece con lo brillante que SEA, no con
     el equipo, acotado entre el seeing y mascaraMaxAs. Antes se medía contra la
     magnitud límite del equipo, porque solo se enmascaraba lo que el render iba a
     pintar; desde la máscara total (ver ps1EstrellasEnPixeles) el equipo ya no
     entra, y el mismo parche vale para cualquier ocular.

     Crece GEOMÉTRICAMENTE, no lineal: el ala de una PSF va como r^-3, así que el
     radio donde el perfil cruza el mismo umbral se ensancha 10^(0,4/3) ≈ 1,35 por
     magnitud. Con la ley lineal de antes (0,6″/mag) la máscara se quedaba dentro
     del ala de las estrellas medianas y el relleno tomaba su mediana justo del
     ala: quedaba un disco apagado rodeado del anillo brillante que sobraba —el
     «halo con hueco» que se vio en el simulador el 12-ago-2026—.

     La FORMA está medida, no supuesta: apilando 19031 estrellas de 33 parches
     de PS1 y restando un testigo del mismo radio galactocéntrico, el radio de
     contaminación crece ×1,36 por magnitud (α = 2,98 contra el 3 de la ley).
     Lo que estaba mal era el tope: con 25″ la ley se cortaba en g≈11,6, y de
     ahí para arriba las medidas piden 35–37″ (g 10–12) y 48″ para la única de
     g=8,5 del muestreo. 60″ cubre todo lo medido; por encima ya es
     extrapolación y se corta. Subir a 90″ no cambió nada medible ni siquiera
     en el parche que tiene la estrella más brillante
     (.scratch/alas-brillantes/INFORME.md). */
  function ps1RadioMascaraAs(g) {
    var r = PS1.seeingAs * Math.pow(10, 0.4 * (PS1.mascaraMagRef - g) / 3);
    return Math.max(PS1.seeingAs, Math.min(PS1.mascaraMaxAs, r));
  }

  /* Quita TODAS las estrellas de Gaia del campo: marca el disco de cada una y lo
     rellena, entero, con la mediana del anillo que la rodea POR FUERA de su propia
     máscara, saltándose lo enmascarado por las demás y los NaN.

     Un valor por estrella, no un degradado por píxel: el degradado tomaba la
     mediana a pocos píxeles de cada píxel tapado, o sea del ala de la estrella que
     se estaba quitando, y devolvía el borde brillante junto al centro apagado (el
     «halo con hueco»). Un disco plano se nota sobre el gradiente de la galaxia,
     pero mucho menos que ese anillo; si algún día molesta, lo que toca es
     interpolar el fondo, no volver a muestrear el ala.

     Ese disco plano solo vale mientras la galaxia apenas cambie de brillo entre
     r y 1,6r. En una máscara ancha —las de g<11, que llegan a 56″— el anillo cae
     ya en la periferia y la mediana que trae es decenas de veces más floja que
     lo que había dentro: el disco sale como un hoyo, y encima `w` se lo cree
     (la meseta pasa del umbral de anclaje, así que `w`=1 dentro y el perfil no
     puede rellenar). Medido en NGC 5055, campo/perfil dentro del disco de la
     estrella de g=9,2: 0,025. Por eso, pasado rellenoPlanoMaxAs, el disco se
     deja al nivel del cielo: el anclaje lo apaga, `w` cae a 0 dentro y lo
     rellena (1-w)·perfil, que es lo que la arquitectura ya hace con una zona
     sin información. La misma medida sube entonces a 1,000.

     El umbral está donde lo pusieron las medidas: el disco plano sale a 0,999
     de 25 a 40″ y se hunde a 0,025 a 56″. No se baja más porque el hueco tiene
     su propio precio en el borde —mientras `w` recorre la rampa hay datos a
     cero, así que el anillo queda a (1-w)·perfil y se ve—; con el umbral en la
     caja de la mezcla (25″) los discos de ~30″ de M81 salían dibujados como
     dos aros oscuros. Y por debajo de todo eso el disco plano es además el
     mejor dato local: con hueco, las máscaras de pocos píxeles se apagan
     enteras (0,245 contra 0,774 en M81) porque la caja de `w` sigue viendo
     galaxia alrededor.

     `estrellas` en píxeles del parche: [{x, y, rPx, rAs}]. Sin `rAs` (llamadas
     viejas) se usa siempre el disco plano. Devuelve una copia.

     `geo` ({afin, ba, pa, escena}) es la geometría de la galaxia, y con ella:
     — solo se elimina lo que queda FUERA de la escena difusa que se está
       reproduciendo: `escena` es la unión de elipses isofotales (μ=muEscena)
       de los componentes difusos del parche (ver ps1EscenaEnParche), y una
       fuente que cae dentro de cualquiera de ellas se conserva ENTERA. No se
       pregunta si la estrella «pertenece» físicamente al objeto —eso no se
       puede saber desde aquí—, solo si está proyectada dentro de la escena.
       La protección nuclear de antes (dist < rAs) es el caso particular
       trivial: el núcleo está a radio elíptico ~0 de su propia elipse, así que
       queda dentro sin regla aparte; y el núcleo de una COMPAÑERA catalogada
       (NGC 5195 sobre el parche de M51) queda protegido por SU elipse, sin
       condiciones por nombre de objeto. La decisión es por fuente y
       determinista: radio elíptico ≤ r25, en ″ del cielo, a cualquier
       resolución.
     — el relleno estrecho deja de ser plano: mediana por banda de ISOFOTA
       elíptica (b/a y PA del catálogo, bandas de 1 px de radio elíptico), que
       es el fondo galáctico local de verdad; el plano hundía el bulbo al nivel
       del anillo exterior. El disco ancho (rAs > rellenoPlanoMaxAs) se sigue
       dejando al cielo: esa arquitectura está medida aparte (ver arriba).
     Sin `geo` (llamadas viejas y tests sintéticos): sin protección y relleno
     plano, como siempre. Sin `geo.escena` pero con `afin`: relleno por
     isofotas, sin protección (la escena la construye quien conoce el campo). */
  function ps1QuitarEstrellas(datos, ancho, alto, estrellas, geo) {
    if (!estrellas || !estrellas.length) return datos;
    var a = geo && geo.afin, esc = a ? 1 / Math.hypot(a.xn, a.yn) : 0;
    var escena = (geo && geo.escena && geo.escena.length) ? geo.escena : null;
    var mascara = new Uint8Array(datos.length), quitar = [], huecos = [], i, e, x, y, cielo = null;
    /* Veredicto de mordida, ANTES de marcar: cuánto tapan los discos anchos a
       cada componente de borde real (ps1CoberturaMordida). Por encima del umbral
       el componente queda `pisada` y su elipse entera pasa a NaN al final; por
       debajo queda PROTEGIDO y el disco ancho se recorta en su borde. Una máscara
       que nace FUERA de la escena no borra píxeles que están DENTRO de ella: es
       el mismo principio que conserva entera a la fuente de dentro (abajo), y ahí
       la imagen manda porque el objeto es mucho más brillante que el ala de la
       estrella a esa distancia (el radio de máscara está anclado al fondo del
       stack, no al brillo local). Las máscaras ESTRECHAS sí siguen entrando: su
       relleno por isofotas no borra el objeto, lo cose. */
    var compactas = null, protegidas = null;
    if (a && escena) {
      var cob = ps1CoberturaMordida(estrellas, a, escena);
      for (i = 0; i < escena.length; i++) {
        if (!escena[i].compacta) continue;
        (compactas || (compactas = [])).push(escena[i]);
        if (cob[i] >= PS1.mordidaCobMin) escena[i].pisada = true;
        else if (cob[i] > 0) (protegidas || (protegidas = [])).push(escena[i]);
      }
    }
    for (i = 0; i < estrellas.length; i++) {
      e = estrellas[i];
      if (a && escena && ps1FuenteEnEscena(escena, a, e.x, e.y)) { huecos.push(e); continue; }   // dentro de la escena: se conserva entera
      quitar.push(e);
      var r = Math.max(1, e.rPx), r2 = r * r;
      var recorta = protegidas && e.rAs > PS1.rellenoPlanoMaxAs;
      for (y = Math.max(0, Math.floor(e.y - r)); y <= Math.min(alto - 1, Math.ceil(e.y + r)); y++) {
        for (x = Math.max(0, Math.floor(e.x - r)); x <= Math.min(ancho - 1, Math.ceil(e.x + r)); x++) {
          var dx = x - e.x, dy = y - e.y;
          if (dx * dx + dy * dy > r2) continue;
          if (recorta && ps1PuntoEnCompacta(protegidas, a, x, y)) continue;
          mascara[y * ancho + x] = 1;
        }
      }
    }
    /* Isofotas: banda = radio elíptico redondeado a píxeles, mediana de lo no
       enmascarado (mín. 8 muestras, como ps1FondoAlrededor). El radio elíptico
       sale del afín inverso, así que respeta el giro de la skycell. */
    var isofotas = null, banda = null;
    if (a) {
      var ba = (geo.ba > 0 && geo.ba <= 1) ? geo.ba : 1;
      var paR = (geo.pa || 0) * Math.PI / 180, sinPA = Math.sin(paR), cosPA = Math.cos(paR);
      banda = function (px, py) {
        var dx = px - a.cx, dy = py - a.cy;
        var este = a.ex * dx + a.ey * dy, norte = a.nx * dx + a.ny * dy;
        var u = este * sinPA + norte * cosPA, v = -este * cosPA + norte * sinPA;
        return Math.round(Math.hypot(u, v / ba) / esc);
      };
      var muestras = [];
      for (y = 0; y < alto; y++) {
        for (x = 0; x < ancho; x++) {
          i = y * ancho + x;
          if (mascara[i]) continue;
          var vM = datos[i];
          if (vM !== vM) continue;
          var bM = banda(x, y);
          (muestras[bM] || (muestras[bM] = [])).push(vM);
        }
      }
      isofotas = muestras.map(function (m) {
        if (!m || m.length < 8) return null;
        m.sort(function (p, q) { return p - q; });
        return m[m.length >> 1];
      });
    }
    var out = Float32Array.from ? Float32Array.from(datos) : new Float32Array(datos);
    for (i = 0; i < quitar.length; i++) {
      e = quitar[i];
      var rE = Math.max(1, e.rPx), fondo = null, ancha = e.rAs > PS1.rellenoPlanoMaxAs;
      if (ancha) {                                         // disco ancho: ausencia, que la rellene el perfil
        if (cielo == null) cielo = ps1Cielo(datos, ancho, alto);
        fondo = cielo;
      } else if (!isofotas) {
        fondo = ps1FondoAlrededor(datos, mascara, ancho, alto, e.x, e.y, rE);
        if (fondo == null) continue;                       // sin muestras limpias: mejor dejarlo como está
      }
      var rE2 = rE * rE;
      for (y = Math.max(0, Math.floor(e.y - rE)); y <= Math.min(alto - 1, Math.ceil(e.y + rE)); y++) {
        for (x = Math.max(0, Math.floor(e.x - rE)); x <= Math.min(ancho - 1, Math.ceil(e.x + rE)); x++) {
          var ex = x - e.x, ey = y - e.y;
          if (ex * ex + ey * ey > rE2) continue;
          var j = y * ancho + x;
          if (!mascara[j]) continue;
          var v = fondo;
          if (v == null) {                                 // disco estrecho con isofotas
            var b = banda(x, y);
            v = isofotas[b];
            // banda sin muestras (borde, campo cargado): la vecina más próxima
            for (var k = 1; v == null && k < 8; k++) v = isofotas[b + k] != null ? isofotas[b + k] : isofotas[b - k];
            if (v == null) continue;
          }
          out[j] = v;
        }
      }
    }
    if (huecos.length) ps1RellenoHuecosLocal(out, ancho, alto, huecos);
    /* Compacta pisada por un disco ancho: su elipse entera a NaN, DESPUÉS de
       todos los rellenos (incluido el de huecos de fuentes conservadas: aquí
       también su fuente queda dentro del modelo). El pintado la cubre con
       (1−w)·perfil, vecino a vecino con wv=0: el objeto completo, de una
       pieza. Dos reglas juntas: la del anclaje (ps1AnclarACatalogo) —un 0 donde
       no hay medida es una medida falsa que bloquea el relleno: la caja de
       ps1PesoImagen a caballo del borde mantiene w alto y w·0 + (1−w)·perfil
       deja un anillo oscuro— y la de ADR 0013 —la fila de catálogo ES el
       modelo—: con la mayor parte del objeto bajo una máscara de saturación, lo
       que queda de imagen es un remiendo (creciente contaminado por el ala de la
       estrella + muescas de cielo), y coserlo pinta un objeto partido; el perfil
       entero pinta UNO. Eso vale cuando la máscara tapa DE VERDAD el objeto: por
       debajo de mordidaCobMin el remiendo no existe porque la máscara ni siquiera
       entra (se recorta en el borde, ver el marcado arriba). Solo compactas: el
       resto del disco ancho sigue al cielo, que es la arquitectura medida de las
       galaxias (M81/NGC 5055).
       Y si TODA la escena del parche son compactas pisadas, la imagen ENTERA
       pasa a ausencia. No es cosmética: el anclaje reparte la luz del catálogo
       entre lo que queda encendido, y con el objeto en NaN ese presupuesto se
       lo lleva el ala de la estrella más allá del tope de su máscara
       (mascaraMaxAs es extrapolación cortada, no el fin del ala: la ley sin
       tope da 226″ para g=4,7) — motitas brillantes con la luz de la nebulosa.
       La estrella la pinta la capa de estrellas (glow y spikes); aquí no queda
       nada legítimo que conservar. Con componentes no pisados (una galaxia
       vecina) no se toca: solo caen sus elipses pisadas. */
    if (compactas) {
      var pisadas = 0;
      for (i = 0; i < compactas.length; i++) if (compactas[i].pisada) pisadas++;
      if (pisadas && escena && pisadas === escena.length) {
        for (i = 0; i < out.length; i++) out[i] = NaN;
        for (i = 0; i < compactas.length; i++) delete compactas[i].pisada;
        return out;
      }
      for (i = 0; i < compactas.length; i++) {
        var cp = compactas[i];
        if (!cp.pisada) continue;
        delete cp.pisada;
        var rPxE = cp.r25As / esc;
        var yA = Math.max(0, Math.floor(cp.cy - rPxE)), yB = Math.min(alto - 1, Math.ceil(cp.cy + rPxE));
        var xA = Math.max(0, Math.floor(cp.cx - rPxE)), xB = Math.min(ancho - 1, Math.ceil(cp.cx + rPxE));
        for (y = yA; y <= yB; y++) {
          for (x = xA; x <= xB; x++) {
            var dxp = x - cp.cx, dyp = y - cp.cy;
            var esteP = a.ex * dxp + a.ey * dyp, norteP = a.nx * dxp + a.ny * dyp;
            if (ps1RadioEje(cp.cos, cp.sin, norteP, esteP, cp.ba) <= cp.r25As) out[y * ancho + x] = NaN;
          }
        }
      }
    }
    return out;
  }

  /* Una fuente conservada por escena ([[ps1FuenteEnEscena]]) mantiene sus
     píxeles reales, pero si su núcleo estaba saturado en el stack de PS1 esos
     píxeles son NaN (ver huecos-ps1-son-estrellas-saturadas): sin este relleno
     llegan así hasta ps1PintarParche, que los trata como ausencia y los cubre
     con el perfil de la galaxia —casi 0 lejos del centro—, y sale un agujero
     negro con la forma exacta de la máscara de saturación.
     Dilatación local (máximo de los 8 vecinos, expandiendo desde el borde del
     hueco): a diferencia del relleno por isofotas de arriba, aquí NO hay que
     estimar el fondo de la galaxia sino la propia estrella, así que se usa su
     entorno inmediato, no un anillo lejano (ese error ya se midió una vez,
     ver [[huecos-ps1-son-estrellas-saturadas]]). Acotado al recuadro de cada
     fuente: no toca nada fuera de su hueco. */
  function ps1RellenoHuecosLocal(out, ancho, alto, huecos) {
    for (var i = 0; i < huecos.length; i++) {
      var e = huecos[i], r = Math.max(1, e.rPx);
      var x0 = Math.max(0, Math.floor(e.x - r - 1)), x1 = Math.min(ancho - 1, Math.ceil(e.x + r + 1));
      var y0 = Math.max(0, Math.floor(e.y - r - 1)), y1 = Math.min(alto - 1, Math.ceil(e.y + r + 1));
      for (var pasada = 0; pasada < r + 2; pasada++) {
        var cambio = false;
        for (var y = y0; y <= y1; y++) {
          for (var x = x0; x <= x1; x++) {
            var j = y * ancho + x;
            if (out[j] === out[j]) continue;             // ya tiene valor
            var mejor = -Infinity, hay = false;
            for (var dy = -1; dy <= 1; dy++) {
              for (var dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue;
                var yy = y + dy, xx = x + dx;
                if (yy < y0 || yy > y1 || xx < x0 || xx > x1) continue;
                var v = out[yy * ancho + xx];
                if (v === v && v > mejor) { mejor = v; hay = true; }
              }
            }
            if (hay) { out[j] = mejor; cambio = true; }
          }
        }
        if (!cambio) break;
      }
    }
  }

  /* Mediana del anillo [r, 1,6r] alrededor de (x,y), saltándose lo enmascarado y
     los NaN. Se ensancha hasta encontrar muestras (una estrella pegada a otra
     puede tener el primer anillo entero dentro de la máscara vecina) y devuelve
     null si no encuentra ninguna. */
  function ps1FondoAlrededor(datos, mascara, ancho, alto, x, y, r) {
    for (var k = 0; k < 4; k++) {
      var rIn = r * Math.pow(1.6, k), rOut = rIn * 1.6, m = [], dx, dy;
      for (dy = -Math.ceil(rOut); dy <= Math.ceil(rOut); dy++) {
        var yy = Math.round(y + dy); if (yy < 0 || yy >= alto) continue;
        for (dx = -Math.ceil(rOut); dx <= Math.ceil(rOut); dx++) {
          var xx = Math.round(x + dx); if (xx < 0 || xx >= ancho) continue;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < rIn || d > rOut) continue;
          var i = yy * ancho + xx;
          if (mascara[i]) continue;
          var v = datos[i];
          if (v === v) m.push(v);
        }
      }
      if (m.length >= 8) { m.sort(function (a, b) { return a - b; }); return m[m.length >> 1]; }
    }
    return null;
  }

  /* ── Fracción de luz dentro del parche (corrección del anclaje) ──
     Para un perfil de Sérsic, la luz dentro de un radio R es la gamma incompleta
     regularizada P(2n, b_n·(R/r_e)^(1/n)). Con lado = 6·r_e sale ~0,94 para un
     disco exponencial; con el tope de 20′ sobre M31 baja al 40–60 %, y ahí el
     nivel pasa a ser una extrapolación, no una medida (riesgo escrito en la 03).
     ponytail: un solo Sérsic con la `n` del disco. El catálogo trae B/T pero no el
     r_e del bulbo, así que un modelo de dos componentes tendría que inventárselo. */
  function ps1BSersic(n) {
    return 2 * n - 1 / 3 + 4 / (405 * n) + 46 / (25515 * n * n);
  }
  /* ln Γ(x) (Lanczos) y P(a,x) por serie/fracción continua, como el gammp clásico. */
  function lnGamma(x) {
    var c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
             -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    var y = x, tmp = x + 5.5, ser = 1.000000000190015;
    tmp -= (x + 0.5) * Math.log(tmp);
    for (var j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }
  function gammaP(a, x) {
    if (!(x > 0) || !(a > 0)) return 0;
    var i;
    if (x < a + 1) {                                   // serie
      var ap = a, suma = 1 / a, del = suma;
      for (i = 0; i < 300; i++) {
        ap++; del *= x / ap; suma += del;
        if (Math.abs(del) < Math.abs(suma) * 1e-12) break;
      }
      return suma * Math.exp(-x + a * Math.log(x) - lnGamma(a));
    }
    var b = x + 1 - a, c = 1e300, d = 1 / b, h = d;    // fracción continua → Q(a,x)
    for (i = 1; i <= 300; i++) {
      var an = -i * (i - a);
      b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d;
      var delta = d * c; h *= delta;
      if (Math.abs(delta - 1) < 1e-12) break;
    }
    return 1 - Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
  }
  function ps1FraccionLuz(n, radioEnRe) {
    var nn = (n > 0.1) ? n : 1;
    if (!(radioEnRe > 0)) return 0;
    return Math.min(1, gammaP(2 * nn, ps1BSersic(nn) * Math.pow(radioEnRe, 1 / nn)));
  }

  /* ── Halo extrapolado: el perfil del catálogo más allá de la imagen ──────────
     La imagen de PS1 se acaba donde se acaba su señal (μ≈25 en el mejor caso, y
     antes si el parche es chico). El disco NO se acaba ahí: solo cae por debajo
     del ruido del stack. Aquí se sigue el perfil hasta PS1.muHalo.

     El perfil NO se ajusta a los píxeles: ya viene ajustado en el catálogo. Las
     columnas r_e, b/a, PA, n y B/T salen de gen_galaxias.py, que resuelve r_e
     para que la isofota de 25 caiga en el D25 del RC3 y reparte la luz entre
     bulbo (n=4, r_e·0,2) y disco (n del tipo). Reproducir aquí ESE MISMO modelo
     (`perfil_total` del generador) es lo consistente: un ajuste propio a las
     alas ruidosas del parche daría un perfil distinto del que ya ancla el nivel
     en ps1AnclarACatalogo, y las dos capas dejarían de casar. */
  var PS1_RE_BULBO = 0.2, PS1_Q_BULBO_MIN = 0.6;   // = RE_BULBO_REL / Q_BULBO_MIN del generador

  // Integral del perfil: L_total = I_e · r_e² · factor · (b/a). En logaritmos,
  // que e^b y b^-2n se desbordan por separado para n grande.
  function ps1FactorLuz(n) {
    var b = ps1BSersic(n);
    return 2 * Math.PI * n * Math.exp(b + lnGamma(2 * n) - 2 * n * Math.log(b));
  }

  /* Radio (″, sobre el SEMIEJE MAYOR) al que una componente cae a un brillo
     superficial dado. 0 si ni en el centro llega. */
  function ps1RadioIsofota(c, mu) {
    var I = Math.pow(10, -0.4 * mu);
    if (!(c.Ie > I)) return 0;
    return c.re * Math.pow(1 + Math.log(c.Ie / I) / c.b, c.n);
  }

  /* Componentes del modelo de una galaxia: cada una con su I_e (flujo por
     arcsec²), r_e (semieje MAYOR, ″), n, razón de ejes y el radio —también sobre
     el semieje mayor— al que su brillo cae a PS1.muHalo.
     gal: {magV, reArcsec, n, ba, bt}. Devuelve [] si falta el dato mínimo. */
  function ps1ComponentesSersic(gal) {
    var re = gal.reArcsec, q = (gal.ba > 0 && gal.ba <= 1) ? gal.ba : 1;
    if (!(re > 0) || !(gal.magV > 0)) return [];
    var Ftot = Math.pow(10, -0.4 * gal.magV);
    var bt = (gal.bt >= 0 && gal.bt <= 1) ? gal.bt : 0;
    var Ihalo = Math.pow(10, -0.4 * PS1.muHalo), out = [];
    function comp(frac, reC, nC, qC) {
      if (!(frac > 0)) return;
      var Ie = Ftot * frac / (reC * reC * ps1FactorLuz(nC) * qC);
      if (!(Ie > Ihalo)) return;                       // ni en el centro llega al umbral
      var c = { Ie: Ie, re: reC, n: nC, b: ps1BSersic(nC), q: qC };
      c.rMax = ps1RadioIsofota(c, PS1.muHalo);
      out.push(c);
    }
    comp(1 - bt, re, (gal.n > 0.1) ? gal.n : 1, q);
    comp(bt, re * PS1_RE_BULBO, 4, Math.max(q, PS1_Q_BULBO_MIN));
    return out;
  }

  /* Flujo por arcsec² del modelo en un punto, dado en desplazamientos NORTE/ESTE
     (″) respecto al centro de la galaxia. Cada componente se evalúa en SU radio
     sobre el semieje mayor: el punto se lleva al eje mayor (PA, medido del norte
     hacia el este) y el eje menor se estira por 1/q. */
  /* Radio del punto sobre el SEMIEJE MAYOR (″), con el seno y el coseno del PA ya
     calculados por quien recorre el bucle: el eje menor se estira por 1/q. */
  function ps1RadioEje(cs, sn, norte, este, q) {
    var eje = norte * cs + este * sn, tra = -norte * sn + este * cs;
    return Math.sqrt(eje * eje + (tra / q) * (tra / q));
  }

  function ps1FlujoModelo(comps, pa, norte, este) {
    var a = pa * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a), F = 0;
    for (var i = 0; i < comps.length; i++) {
      var c = comps[i], r = ps1RadioEje(cs, sn, norte, este, c.q);
      if (r > c.rMax) continue;
      F += c.Ie * Math.exp(-c.b * (Math.pow(r / c.re, 1 / c.n) - 1));
    }
    return F;
  }

  /* ── Mezcla de imagen y perfil ───────────────────────────────────────────────
     `w` = fracción de píxeles con señal en una caja de PS1.mezclaCajaAs,
     saturada con un smoothstep en PS1.mezclaW0: 0 donde la imagen no trae nada,
     1 donde la vecindad ya está medida, y un tránsito continuo y derivable en
     medio. NO es una relación señal-ruido ni una confianza estadística: es una
     heurística de PRESENCIA DE INFORMACIÓN. Quien quiera convertirla en S/N
     tiene que recalibrarla antes.

     Sustituye a `f = max(imagen, perfil)`, que quedó descartada: medido sobre el
     parche real de M51 (13-ago-2026), el perfil ganaba en el 70-95 % de los
     píxeles desde 0,3 r_e —un perfil liso vale la MEDIA azimutal y en una
     galaxia con brazos la mayoría de los píxeles están por debajo de la media—,
     enterraba la morfología bajo un óvalo liso y metía el 154,6 % de la luz del
     catálogo cuando el anclaje ya la había cerrado en el 96,1 %. El moteado del
     borde que en su día hundió la regla anterior («perfil solo donde la imagen
     es cero») lo arregla el peso continuo, no el máximo. */
  function ps1PesoImagen(datos, ancho, alto, escalaAs) {
    var rad = Math.max(1, Math.round(PS1.mezclaCajaAs / (escalaAs > 0 ? escalaAs : 1) / 2));
    var señal = new Float32Array(datos.length), i;
    for (i = 0; i < datos.length; i++) señal[i] = datos[i] > 0 ? 1 : 0;
    var w = ps1CajaSeparable(señal, ancho, alto, rad), w0 = PS1.mezclaW0;
    for (i = 0; i < w.length; i++) {
      var t = w[i] / w0;
      t = t > 1 ? 1 : (t > 0 ? t : 0);
      w[i] = t * t * (3 - 2 * t);
    }
    return w;
  }

  /* SOPORTE LOCAL de la señal medida: el brillo medio de la imagen en la MISMA
     vecindad con la que ps1PesoImagen decide si la imagen trae información
     (PS1.mezclaCajaAs), pero sobre el flujo en vez de sobre la presencia. No es
     una escala nueva ni un parámetro nuevo: es la vecindad que el pipeline ya
     usa para hablar de «lo que hay alrededor de este píxel».
     Para qué: la rampa de opacidad es la ley de DETECCIÓN, y el ojo no detecta
     píxeles sueltos del lienzo sino estructura con extensión. Alimentarla con el
     flujo puntual hace que dentro de una misma estructura, y en pocos píxeles,
     un brazo salga con op = 1 y el interbrazo de al lado con op ≈ 0.
     La ausencia (NaN) no da soporte: entra como 0, igual que en ps1PesoImagen, y
     el píxel se queda con su rampa de siempre. */
  function ps1SoporteLocal(datos, ancho, alto, escalaAs) {
    var rad = Math.max(1, Math.round(PS1.mezclaCajaAs / (escalaAs > 0 ? escalaAs : 1) / 2));
    var f = new Float32Array(datos.length);
    for (var i = 0; i < datos.length; i++) f[i] = datos[i] > 0 ? datos[i] : 0;
    return ps1CajaSeparable(f, ancho, alto, rad);
  }

  // Media en una caja de (2·rad+1)², separable y por sumas corridas.
  function ps1CajaSeparable(datos, ancho, alto, rad) {
    var tmp = new Float32Array(datos.length), out = new Float32Array(datos.length), x, y, i;
    for (y = 0; y < alto; y++) {
      var acc = 0, n = 0;
      for (x = -rad; x <= rad; x++) { i = Math.min(ancho - 1, Math.max(0, x)); acc += datos[y * ancho + i]; n++; }
      for (x = 0; x < ancho; x++) {
        tmp[y * ancho + x] = acc / n;
        var sale = Math.min(ancho - 1, Math.max(0, x - rad));
        var entra = Math.min(ancho - 1, Math.max(0, x + rad + 1));
        acc += datos[y * ancho + entra] - datos[y * ancho + sale];
      }
    }
    for (x = 0; x < ancho; x++) {
      var acc2 = 0, n2 = 0;
      for (y = -rad; y <= rad; y++) { i = Math.min(alto - 1, Math.max(0, y)); acc2 += tmp[i * ancho + x]; n2++; }
      for (y = 0; y < alto; y++) {
        out[y * ancho + x] = acc2 / n2;
        var sale2 = Math.min(alto - 1, Math.max(0, y - rad));
        var entra2 = Math.min(alto - 1, Math.max(0, y + rad + 1));
        acc2 += tmp[entra2 * ancho + x] - tmp[sale2 * ancho + x];
      }
    }
    return out;
  }

  /* Factor que devuelve el presupuesto de luz a su sitio. La mezcla
     `w·s·imagen + (1−w)·perfil` mete luz de modelo donde la imagen no llega, y
     el anclaje ya había fijado la luz del parche a la magnitud del catálogo, así
     que sin `s` el objeto emitiría de más. `s` se resuelve para que la suma de
     la mezcla sobre el parche sea exactamente la de la imagen anclada: el
     presupuesto lo pone el catálogo y ninguna componente lo amplía por su cuenta.
     Devuelve 1 si no hay perfil o no hay imagen que repartir. */
  function ps1EscalaMezcla(datos, w, perfil) {
    var objetivo = 0, Iw = 0, Ip = 0, i;
    for (i = 0; i < datos.length; i++) {
      var v = datos[i];
      // La ausencia (NaN, ver ps1AnclarACatalogo) queda fuera del presupuesto
      // por completo: ni aporta objetivo ni cuenta su relleno de perfil. Sin
      // este salto un solo NaN dejaba la suma en NaN y s caía al respaldo 1.
      if (v !== v) continue;
      objetivo += v;
      Iw += w[i] * v;
      Ip += (1 - w[i]) * perfil[i];
    }
    if (!(Iw > 0)) return 1;
    var s = (objetivo - Ip) / Iw;
    return s > 0 ? s : 0;
  }

  /* El perfil del catálogo muestreado en la retícula del parche, que es donde se
     mide el presupuesto (ps1EscalaMezcla). La retícula no está al norte: `a` es
     la afín del parche (ps1AfinParche) y es ella quien dice hacia dónde caen el
     norte y el este en cada píxel. */
  function ps1PerfilEnParche(comps, pa, ancho, alto, a) {
    var out = new Float32Array(ancho * alto);
    for (var y = 0; y < alto; y++) {
      var dy = y - a.cy;
      for (var x = 0; x < ancho; x++) {
        var dx = x - a.cx;
        out[y * ancho + x] = ps1FlujoModelo(comps, pa,
          a.nx * dx + a.ny * dy, a.ex * dx + a.ey * dy);
      }
    }
    return out;
  }

  /* Diámetro intrínseco del objeto para la ley H2c: 2·r(μ=25) del modelo del
     catálogo, en MINUTOS DE ARCO y CIRCULARIZADO por √(b/a) —la detección
     integra área, no semieje—. r(μ25) se toma como el mayor de los radios
     isofotales de las componentes: en el cruce de μ=25 domina una sola (el
     disco) y la analítica de ps1RadioIsofota ya lo resuelve exacto; la suma
     solo lo movería un pelo hacia fuera, y ±40 % de θint son ±0,05 dex de
     umbral (medido en scripts/harness_h2c_anclaje_render.js, M104). */
  function ps1ThetaIntArcmin(comps, ba) {
    var e = ps1EjesArcmin(comps || [], ba);   // los MISMOS ejes que decide el halo
    return Math.sqrt(e.a * e.b);              // = 2·r(μ25)/60·√(b/a)
  }

  // Radio (″, semieje mayor) que abarca todo el halo extrapolado.
  function ps1RadioHaloAs(comps) {
    var r = 0;
    for (var i = 0; i < comps.length; i++) if (comps[i].rMax > r) r = comps[i].rMax;
    return r;
  }

  /* ── Índice de Sérsic MEDIDO: el que decide la puerta ───────────────────────
     El `n` de la columna 9 NO es una medida: gen_galaxias.py lo saca del tipo de
     Hubble y solo vale 1 o 4. Vale para el perfil —r_e se resolvió con él— pero
     no para decidir si una galaxia es tendida o concentrada, que es lo que la
     puerta pregunta.
     Primero manda el n AJUSTADO de S4G (columna 12; 617 de las 1295 filas). Donde
     no lo hay, se mide en la propia imagen de PS1 por CONCENTRACIÓN: los radios
     que encierran el 50 % y el 90 % de la luz dentro de la apertura, y el n del
     Sérsic que daría esa misma razón. En ningún caso se recae en el tipo. */

  // x tal que P(a,x) = p, por bisección: P crece con x y aquí p < P(a,xMax).
  function ps1InvGammaP(a, p, xMax) {
    var lo = 0, hi = xMax;
    for (var i = 0; i < 60; i++) {
      var med = 0.5 * (lo + hi);
      if (gammaP(a, med) < p) lo = med; else hi = med;
    }
    return 0.5 * (lo + hi);
  }

  /* Concentración r90/r50 de un Sérsic de índice n, medida DENTRO de la misma
     apertura que la imagen (semieje mayor A, en unidades de r_e). Crece con n
     —un perfil concentrado deja el 50 % de su luz mucho más adentro que el
     90 %—, así que se puede invertir. */
  function ps1ConcentracionTeorica(n, aEnRe) {
    if (!(n > 0) || !(aEnRe > 0)) return 0;
    var b = ps1BSersic(n), xA = b * Math.pow(aEnRe, 1 / n), L = gammaP(2 * n, xA);
    if (!(L > 0)) return 0;
    var x50 = ps1InvGammaP(2 * n, 0.5 * L, xA), x90 = ps1InvGammaP(2 * n, 0.9 * L, xA);
    if (!(x50 > 0)) return 0;
    return Math.pow(x90 / x50, n);
  }

  var PS1_N_MIN = 0.3, PS1_N_MAX = 8;                 // rango en el que se busca

  // n cuyo r90/r50 teórico es el medido. Fuera de rango, el extremo.
  function ps1NDeConcentracion(c, aEnRe) {
    if (!(c > 1) || !(aEnRe > 0)) return 0;
    if (c <= ps1ConcentracionTeorica(PS1_N_MIN, aEnRe)) return PS1_N_MIN;
    if (c >= ps1ConcentracionTeorica(PS1_N_MAX, aEnRe)) return PS1_N_MAX;
    var lo = PS1_N_MIN, hi = PS1_N_MAX;
    for (var i = 0; i < 40; i++) {
      var med = 0.5 * (lo + hi);
      if (ps1ConcentracionTeorica(med, aEnRe) < c) lo = med; else hi = med;
    }
    return 0.5 * (lo + hi);
  }

  /* n medido en la imagen ya anclada (curva de crecimiento en anillos elípticos
     con el PA y el b/a del catálogo).
     La apertura se queda en el menor de: el semieje de la isofota 25 y medio
     lado del parche. Pasarse del parche no añade luz pero sí radio, y eso bajaría
     el r90 y con él la n: la galaxia saldría más tendida de lo que es.
     p: {datos, ancho, alto, escalaAs}; o: {pa, ba, aArcmin (DIÁMETRO de la
     isofota 25, ′), reArcsec, ladoArcmin}. Devuelve 0 si no hay luz que medir. */
  var PS1_ANILLOS = 120;
  function ps1ConcentracionN(p, o) {
    var A = Math.min(o.aArcmin * 60 / 2, o.ladoArcmin * 60 / 2);
    if (!(A > 0) || !(o.reArcsec > 0) || !p || !p.datos) return 0;
    var q = (o.ba > 0 && o.ba <= 1) ? o.ba : 1;
    var a = (o.pa || 0) * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
    var suma = new Float64Array(PS1_ANILLOS), total = 0;
    // Hacia dónde caen el norte y el este lo dice la afín del parche
    // (ps1AfinParche), que viene girada; sin ella, norte arriba y este a la
    // izquierda como siempre.
    var af = p.afin || { cx: (p.ancho - 1) / 2, cy: (p.alto - 1) / 2,
                         ex: -p.escalaAs, ey: 0, nx: 0, ny: p.escalaAs };
    for (var py = 0; py < p.alto; py++) {
      var dy = py - af.cy;
      for (var px = 0; px < p.ancho; px++) {
        var f = p.datos[py * p.ancho + px];
        if (!(f > 0)) continue;
        var dx = px - af.cx;
        var norte = af.nx * dx + af.ny * dy, este = af.ex * dx + af.ey * dy;
        var eje = norte * cs + este * sn, tra = (-norte * sn + este * cs) / q;
        var r = Math.sqrt(eje * eje + tra * tra);
        if (r >= A) continue;
        suma[Math.floor(r / A * PS1_ANILLOS)] += f;
        total += f;
      }
    }
    if (!(total > 0)) return 0;
    function radio(frac) {
      var meta = frac * total, acum = 0;
      for (var i = 0; i < PS1_ANILLOS; i++) {
        if (acum + suma[i] >= meta) {
          var t = suma[i] > 0 ? (meta - acum) / suma[i] : 0;
          return (i + t) * A / PS1_ANILLOS;
        }
        acum += suma[i];
      }
      return A;
    }
    var r50 = radio(0.5);
    if (!(r50 > 0)) return 0;
    return ps1NDeConcentracion(radio(0.9) / r50, A / o.reArcsec);
  }

  /* ── Activación del halo: no toda galaxia lo enseña ─────────────────────────
     Extrapolar el perfil de TODAS pinta halos donde el ojo no ve ninguno. La
     que sí lo enseña es la grande y DIFUSA; una compacta se ve como la trae la
     imagen y punto. Dos condiciones, las dos obligatorias:
       A · eje MENOR de la isofota 25 > PS1.haloMenorMin (′): halo que quepa.
       B · brillo superficial medio > PS1.haloMuFijo: la galaxia es difusa.
     Las dos son propiedades del OBJETO: ni el ocular ni el cielo entran aquí. La
     difusidad de una galaxia no cambia porque el observador se vaya a un sitio
     más oscuro, así que el SQM no pinta nada en el permiso —una versión anterior
     lo metía y cerraba la puerta justo con cielo oscuro, que es cuando el halo
     se ve—. Lo que sí se mueve con el ocular es la rampa de opacidad, que va
     contra el umbral de contraste del ojo (sbUmbralContraste) y se aplica a
     TODAS las galaxias, cumplan o no estas dos condiciones.
     El índice de Sérsic MEDIDO se sigue calculando (columna 12 del catálogo, de
     S4G) y viaja en las medidas, pero NO decide: ninguna de las dos fuentes de n
     separaba los casos que el usuario quiere separados —S4G dejaba fuera a M51 y
     la concentración óptica dejaba dentro a M82—.
     Cuando no se cumplen, el parche se pinta tal cual llegó de PS1 y donde no
     hay dato queda el cielo pelado: exactamente el render de la fase 1, y sin
     recorrer un solo píxel de más. */

  /* Ejes (DIÁMETROS, ′) de la isofota de 25 mag/arcsec² del modelo. El RC3 los
     trae, pero galaxias-datos.js guarda r_e y b/a en su lugar: gen_galaxias.py
     resuelve el uno del otro (resolver_re), así que reconstruirlos aquí del
     mismo modelo devuelve el D25 del catálogo, no una medida nueva. */
  var PS1_MU_ISOFOTA = 25.0;                          // = MU_ISOFOTA del generador
  function ps1EjesArcmin(comps, ba) {
    var r = 0;
    for (var i = 0; i < comps.length; i++) {
      var ri = ps1RadioIsofota(comps[i], PS1_MU_ISOFOTA);
      if (ri > r) r = ri;
    }
    var a = 2 * r / 60, q = (ba > 0 && ba <= 1) ? ba : 1;
    return { a: a, b: a * q };
  }

  /* Brillo superficial MEDIO dentro de esa isofota (mag/arcsec²):
     μ = m + 2,5·log10(π·a·b/4) + 8,89, con a y b los DIÁMETROS en minutos
     (8,89 = 2,5·log10(3600), el paso de arcmin² a arcsec²). */
  function ps1BrilloMedio(magV, aArcmin, bArcmin) {
    if (!(aArcmin > 0 && bArcmin > 0)) return Infinity;
    return magV + 2.5 * Math.log10(Math.PI * aArcmin * bArcmin / 4) + 8.89;
  }

  /* Lo que se mide UNA VEZ por galaxia: los ejes de su isofota 25, su brillo
     medio —que es lo que decide— y el índice de Sérsic medido de S4G, que viaja
     como dato pero no abre ni cierra nada. La n de la imagen (ps1ConcentracionN)
     no se calcula aquí: recorrer el parche entero para un valor que la puerta ya
     no consulta es CPU tirada. */
  function ps1MedidasHalo(gal, comps) {
    var ejes = ps1EjesArcmin(comps || [], gal.ba);
    return {
      aArcmin: ejes.a, bArcmin: ejes.b, n: gal.nMedido > 0 ? gal.nMedido : 0,
      muProm: ps1BrilloMedio(gal.magV, ejes.a, ejes.b)
    };
  }

  /* Las dos condiciones. `gal` = lo que devuelve ps1MedidasHalo, y nada más: no
     entra ningún dato del cielo ni del ocular. Sin medidas o sin ejes, false:
     antes que un halo inventado, ninguno. */
  function ps1HaloActivo(gal) {
    // Una máscara ancha borró parte de la escena: el relleno (1−w)·perfil es
    // OBLIGATORIO o el objeto que se está reproduciendo sale negro (ver
    // ps1MascaraMuerdeEscena). Va por encima del interruptor maestro porque no
    // es el halo voluntario que ese interruptor gobierna —extender el objeto
    // más allá de la imagen—, sino la única regla de fusión permitida: el
    // perfil rellena lo que la imagen no cubre, y aquí la imagen no cubre.
    if (gal && gal.mordida) return true;
    if (!PS1.haloExtrapolado) return false;
    if (!gal || !(gal.bArcmin > PS1.haloMenorMin) || !isFinite(gal.muProm)) return false;
    return gal.muProm > PS1.haloMuFijo;
  }

  /* Umbral de detección de Blackwell/Clark aplicado como OPACIDAD: Δ es el
     contraste en magnitudes del píxel sobre el UMBRAL (sbUmbralContraste). Por
     debajo de deltaMin el píxel es indetectable y no se pinta; a partir de
     deltaPlena se pinta entero; en medio, una potencia que desvanece sin borde
     duro. */
  function ps1Opacidad(sbPixel, sbUmbral) {
    var d = sbUmbral - sbPixel;
    if (!(d > PS1.deltaMin)) return 0;
    if (d >= PS1.deltaPlena) return 1;
    return Math.pow((d - PS1.deltaMin) / (PS1.deltaPlena - PS1.deltaMin), PS1.deltaExp);
  }

  /* Mezcla del píxel de la galaxia con el fondo de cielo, hecha sobre el FLUJO.
     La mezcla pedida es de color: nivel = (1−op)·cielo + op·galaxia. Como el
     nivel en pantalla es nivelFondo + valorDeFlujo(F) y las dos conversiones son
     inversas exactas, reescalar el flujo así deja EXACTAMENTE esa mezcla cuando
     pintarFot lo pinte, sin tener que componer RGB aparte ni tocar el resto de
     capas (el halo de un globular se sigue sumando al mismo array). */
  function ps1FlujoConOpacidad(F, op, c) {
    if (op >= 1) return F;
    if (!(op > 0) || !(F > 0)) return 0;
    return R().flujoDeValor(op * R().valorDeFlujo(F, c.Fcielo, c.rango), c.Fcielo, c.rango);
  }

  /* Convierte el parche en BRILLO SUPERFICIAL (flujo por arcsec², las mismas
     unidades que Fcielo y que el halo de King) anclando su luz total a la mag V
     del catálogo. Orden obligatorio: cielo restado y estrellas quitadas ANTES de
     integrar; anclar antes metería la luz de las estrellas en el total y apagaría
     la galaxia.
     o: {magV, n, reArcsec, ladoArcmin, escalaAs}. Devuelve Float32Array. */
  function ps1AnclarACatalogo(datos, ancho, alto, o) {
    var cielo = ps1Cielo(datos, ancho, alto);
    /* El corte va en cielo + k·σ, no en el cielo pelado. Recortando en el cielo
       solo sobrevive el ruido POSITIVO, y en un parche grande eso es un pedestal
       falso repartido por todo el campo: en M51, el 21 % del flujo integrado
       venía de donde ya no hay galaxia. Y no es solo fondo sucio —el anclaje
       reparte la luz del catálogo entre ese ruido, así que la galaxia sale más
       floja de lo que dice el catálogo—. Con k=1,5 se apaga el 60 % de los
       píxeles encendidos (casi todos ruido: en M51, del 49 % del parche al
       20 %) por un 3 % de galaxia real, que además el anclaje devuelve al
       reescalar. Por encima de k=2 ya no queda pedestal que quitar y solo se
       come disco externo. */
    var sigma = ps1SigmaCielo(datos, ancho, alto, cielo);
    var suelo = cielo + PS1.kRuido * sigma;
    var corte = cielo - PS1.kAusencia * sigma;
    var neto = new Float32Array(datos.length), suma = 0, i;
    for (i = 0; i < datos.length; i++) {
      var v = datos[i];
      /* Tres casos, no dos. Sin dato (NaN del stack) o SOBRESUSTRAÍDO (más de
         kAusencia·σ por debajo del cielo): AUSENCIA — se conserva NaN para que
         el pintado rellene con el perfil, porque un 0 aquí es una medida falsa
         que además bloquea el relleno (w sigue alto alrededor). Por debajo del
         suelo de ruido pero dentro del ruido: cero, donde la imagen no registró
         nada no se inventa luz, misma regla que flujoDePlaca. El NaN no entra
         en la suma del anclaje, igual que antes no entraba el 0. */
      if (v !== v || v < corte) { neto[i] = NaN; continue; }
      var d = v - suelo;
      neto[i] = d > 0 ? d : 0;
      suma += neto[i];
    }
    if (!(suma > 0) || !(o.magV > 0)) return neto;
    var radioEnRe = (o.reArcsec > 0) ? (o.ladoArcmin * 60 / 2) / o.reArcsec : Infinity;
    var frac = ps1FraccionLuz(o.n, radioEnRe);
    var Ftotal = Math.pow(10, -0.4 * o.magV) * (frac > 0.02 ? frac : 0.02);
    var areaPx = o.escalaAs * o.escalaAs;               // arcsec² por píxel del parche
    var k = Ftotal / (suma * areaPx);                   // DN → flujo por arcsec²
    for (i = 0; i < neto.length; i++) neto[i] *= k;
    return neto;
  }

  /* Suma el parche (flujo por arcsec²) sobre el array `difuso` de pintarFot.
     Muestreo por vecino más próximo y sin giro: con parches de pocos minutos el
     desvío TAN–lineal es de milisegundos de arco, y el giro del marco local queda
     en ~1 px en el peor caso (galaxia a 15′ del centro, δ=70°; ficha 09).

     La FILA del FITS crece hacia el NORTE y en el lienzo el norte está arriba,
     así que la fila se invierte. Sin invertirla la galaxia sale espejada en
     vertical —el brazo de arriba aparece abajo—, y con dos galaxias vecinas
     (M51 y su compañera) el espejo se ve como una copia duplicada: así se
     descubrió. La COLUMNA no se invierte: crece hacia el oeste (PC001001 = −1),
     igual que la x del lienzo.
     Donde la imagen no trae señal —fuera del parche, o dentro pero por debajo
     del suelo de ruido, que ps1AnclarACatalogo deja en cero— se pinta el HALO
     EXTRAPOLADO del perfil del catálogo (ps1ComponentesSersic), hasta
     PS1.muHalo. Solo donde la imagen no llega: donde sí hay medida, manda la
     medida, y así las bandas de polvo y los brazos no los tapa un perfil liso.

     Todo lo que sale de aquí —medido y extrapolado— pasa por el umbral de
     contraste de ps1Opacidad contra el cielo efectivo. Es lo que hace que el
     halo asome al subir aumentos, y también lo que evita un anillo en la unión:
     las dos zonas se desvanecen con la misma ley.

     parche: {datos, ancho, alto, ladoArcmin, ra, dec, comps, pa}.
     o: {ra0, dec0, arcmin, size, cielo} = el campo que se está pintando; `cielo`
     son los mismos parámetros ópticos que recibe pintarFot. */

  /* ── La PSF del telescopio sobre el parche ────────────────────────────────
     El parche de PS1 no es la galaxia: es la galaxia ya convolucionada por el
     stack de PanSTARRS. Lo que falta para que sea lo que ve un ocular es la
     DIFERENCIA entre el borrón del telescopio y el que la imagen ya trae, en
     cuadratura. Cero constantes nuevas: airyArcsec, seeingArcsec y PS1.seeingAs
     ya estaban, y radioImagenEstelar ya las combinaba para las estrellas.

     El borrón que el parche YA trae son DOS cosas: el seeing del stack y el
     propio píxel del recorte, que es una caja de escalaAs de lado. Una caja de
     lado w tiene varianza w²/12, o sea una gaussiana equivalente de FWHM
     w·2,3548/√12. Ignorar el segundo término haría que la resta en cuadratura
     diese de más y el parche saldría con MÁS borrón del que le toca. Ni 2,3548
     (FWHM→σ) ni √12 son constantes físicas: son definición y geometría.

     Si el parche ya viniera más borroso que el telescopio, θ_add sale 0 y no se
     toca nada: no se puede desconvolucionar, y fingir que sí es inventar
     resolución que no existe.

     `desenfocar` NO sirve aquí y su propio comentario lo dice: pasa por un
     canvas de 8 bits y recorta a 0–255. Esto son flujos, no grises. */
  var FWHM_A_SIGMA = 2 * Math.sqrt(2 * Math.LN2);      // 2,3548
  var CAJA_A_FWHM = FWHM_A_SIGMA / Math.sqrt(12);      // 0,6796

  function ps1ThetaAdd(aperturaMm, escalaAs) {
    var tr = 2 * R().radioImagenEstelar(aperturaMm);       // FWHM del telescopio, ″
    var ps1 = (PS1.seeingAs > 0) ? PS1.seeingAs : 0;
    var caja = (escalaAs > 0 ? escalaAs : 0) * CAJA_A_FWHM;
    var d2 = tr * tr - (ps1 * ps1 + caja * caja);
    return d2 > 0 ? Math.sqrt(d2) : 0;
  }

  /* Gaussiana separable sobre Float32. El borde se replica en vez de rellenarse
     con ceros: con ceros el perímetro del parche se oscurecería, y el borde es
     justo una de las cosas que no debe fabricar estructura.

     Los no finitos se saltan y se renormaliza por el peso que sí se usó. Pero
     además se RESTAURAN al final, y eso no es cosmética: los huecos del stack
     están en el centro de las estrellas saturadas —en NGC 205 la mediana de su
     entorno vale 12473 contra −1,06 del cielo—, así que rellenarlos con su
     propio entorno mete un 4–5 % de flujo que no está en el cielo y pinta
     puntos brillantes inventados. Con la máscara conservada el flujo se queda
     por debajo del 0,3 %. Es el mismo criterio que sigue el bucle de abajo con
     su `if (!(f > 0)) continue;`. */
  function ps1PsfParche(datos, ancho, alto, escalaAs, aperturaMm, sinRestaurar) {
    var fwhm = ps1ThetaAdd(aperturaMm, escalaAs);
    var esc = (escalaAs > 0) ? escalaAs : 1;
    var sigma = fwhm / FWHM_A_SIGMA / esc;             // px del parche
    if (!(sigma > 0.01)) return datos;                 // nada que añadir: el mismo array

    var n = datos.length, i, j, x, y, acc, w, p, val;
    var rad = Math.max(1, Math.ceil(3 * sigma)), m = 2 * rad + 1;
    var k = new Float64Array(m), s = 0;
    for (i = 0; i < m; i++) { k[i] = Math.exp(-((i - rad) * (i - rad)) / (2 * sigma * sigma)); s += k[i]; }
    for (i = 0; i < m; i++) k[i] /= s;

    var tmp = new Float32Array(n), out = new Float32Array(n);
    for (y = 0; y < alto; y++) {                       // horizontal
      for (x = 0; x < ancho; x++) {
        acc = 0; w = 0;
        for (j = 0; j < m; j++) {
          p = x + j - rad;
          if (p < 0) p = 0; else if (p >= ancho) p = ancho - 1;
          val = datos[y * ancho + p];
          if (isFinite(val)) { acc += k[j] * val; w += k[j]; }
        }
        tmp[y * ancho + x] = w > 0 ? acc / w : NaN;
      }
    }
    for (y = 0; y < alto; y++) {                       // vertical
      for (x = 0; x < ancho; x++) {
        acc = 0; w = 0;
        for (j = 0; j < m; j++) {
          p = y + j - rad;
          if (p < 0) p = 0; else if (p >= alto) p = alto - 1;
          val = tmp[p * ancho + x];
          if (isFinite(val)) { acc += k[j] * val; w += k[j]; }
        }
        out[y * ancho + x] = w > 0 ? acc / w : NaN;
      }
    }
    // La máscara original, restaurada exactamente: lo que era hueco vuelve a serlo.
    // `sinRestaurar` (solo ps1ReponerNaN) devuelve lo que la convolución sí sabe
    // del hueco —la media gaussiana de sus vecinos válidos— para poder juzgarla
    // antes de usarla; el camino normal no lo pide y no cambia.
    if (sinRestaurar) return out;
    for (i = 0; i < n; i++) if (!isFinite(datos[i])) out[i] = datos[i];
    return out;
  }

  /* Los datos del parche ya con la PSF de ESTA apertura, cacheados en el propio
     parche. Se calcula una vez por apertura, no por fotograma ni por píxel: sin
     la caché, cada repintado volvería a convolucionar sobre el resultado
     anterior y la borrosidad se acumularía —que es exactamente la doble
     contabilización que hay que evitar—. Por eso también se convoluciona SIEMPRE
     desde `parche.datos`, que no se toca nunca. */
  function ps1DatosConPsf(parche, escalaAs, aperturaMm) {
    var D = (aperturaMm > 0) ? aperturaMm : 0;
    if (!(D > 0)) return parche.datos;
    if (parche.psfD === D && parche.psfDatos) return parche.psfDatos;
    parche.psfDatos = ps1PsfParche(parche.datos, parche.ancho, parche.alto, escalaAs, D);
    parche.psfD = D;
    return parche.psfDatos;
  }

  /* ── Confianza local del vecino ausente (EXPERIMENTAL, PS1.confianzaLocalNaN)
     El punteado claro de M51/M81 nace en la mezcla: un vecino NaN entra con
     peso 0, y su término (1−w)·perfil aporta el perfil ENTERO justo donde los
     otros vecinos del pincel ya traen imagen medida —la estructura acaba
     representada dos veces (INFORME5/INFORME7). Pero NaN sigue siendo ausencia:
     reponer flujo solo es legítimo donde de verdad falta información, no donde
     la vecindad válida ya la trae. Tres puertas, todas sobre lo que el pipeline
     ya calcula:

       w ≥ 0,95            la vecindad está medida            (ps1PesoImagen)
       cobCaja(r5) ≥ 0,8   hueco pequeño, no el borde de uno grande
       κ ≤ 3               lo que la PSF reconstruye no excede lo que la
                           estructura modelada explica

     κ = (rep / mediana del anillo válido 3–8 px) ÷ (perfil / mediana del perfil
     en ese mismo anillo): el exceso local que el modelo NO explica. La razón
     sola no vale —el núcleo de Sérsic sube 5,1 veces sobre su anillo sin nada
     raro—; dividir por la misma razón medida en el perfil cancela la curvatura
     y lo deja en 0,63, mientras el halo de una estrella saturada se queda en
     8,5 o más (M81, 35 px). Devuelve el flujo a reponer en cada ausente, NaN
     donde no procede: allí el pintado sigue siendo el de siempre. */
  var REP_W = 0.95, REP_COB = 0.8, REP_KAPPA = 3, REP_CAJA = 5, REP_R0 = 3, REP_R1 = 8;
  var repAnillo = null;
  function ps1AnilloOffsets() {
    if (repAnillo) return repAnillo;
    repAnillo = [];
    for (var dy = -REP_R1; dy <= REP_R1; dy++) for (var dx = -REP_R1; dx <= REP_R1; dx++) {
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d >= REP_R0 && d <= REP_R1) repAnillo.push(dx, dy);
    }
    return repAnillo;
  }
  function ps1MedianaAnillo(datos, ancho, alto, k) {
    var off = ps1AnilloOffsets(), x = k % ancho, y = (k / ancho) | 0, v = [];
    for (var i = 0; i < off.length; i += 2) {
      var qx = x + off[i], qy = y + off[i + 1];
      if (qx < 0 || qy < 0 || qx >= ancho || qy >= alto) continue;
      var val = datos[qy * ancho + qx];
      if (isFinite(val)) v.push(val);
    }
    if (!v.length) return NaN;
    v.sort(function (a, b) { return a - b; });
    return v[v.length >> 1];
  }
  function ps1ReponerNaN(parche, escalaAs, aperturaMm) {
    var D = (aperturaMm > 0) ? aperturaMm : 0;
    if (!(D > 0) || !parche.peso || !parche.perfil) return null;
    if (parche.repD === D) return parche.repuesto;
    var anc = parche.datos, ancho = parche.ancho, alto = parche.alto, n = anc.length;
    var rep = ps1PsfParche(anc, ancho, alto, escalaAs, D, true);
    // Cobertura de caja con la MISMA caja separable del peso: distingue el
    // hueco suelto rodeado de medida del borde de uno grande, que el kernel de
    // la PSF (±2 px) confunde.
    var ind = new Float32Array(n), i;
    for (i = 0; i < n; i++) ind[i] = isFinite(anc[i]) ? 1 : 0;
    var cob = ps1CajaSeparable(ind, ancho, alto, REP_CAJA);
    var out = new Float32Array(n).fill(NaN);
    for (i = 0; i < n; i++) {
      if (isFinite(anc[i])) continue;
      if (!(parche.peso[i] >= REP_W) || !(cob[i] >= REP_COB) || !isFinite(rep[i])) continue;
      if (!(parche.perfil[i] > 0)) continue;
      var ma = ps1MedianaAnillo(anc, ancho, alto, i);
      var mp = ps1MedianaAnillo(parche.perfil, ancho, alto, i);
      if (!(ma > 0) || !(mp > 0)) continue;
      var kappa = (rep[i] / ma) / (parche.perfil[i] / mp);
      if (kappa <= REP_KAPPA) out[i] = rep[i];
    }
    parche.repuesto = out;
    parche.repD = D;
    return out;
  }

  function ps1PintarParche(difuso, parche, o) {
    var SIZE = o.size, escv = SIZE / (o.arcmin / 60);   // px por grado
    var cos0 = Math.cos(o.dec0 * Math.PI / 180);
    var dra = (((parche.ra - o.ra0 + 540) % 360) - 180) * cos0;
    var cx = SIZE / 2 - dra * escv;                     // misma proyección que dibujar()
    var cy = SIZE / 2 - (parche.dec - o.dec0) * escv;
    var ladoPx = (parche.ladoArcmin / 60) * escv;       // lado del parche en px del render
    if (!(ladoPx > 0.5)) return difuso;
    /* Del lienzo al parche. El lienzo SÍ está al norte (lo fija la proyección de
       cx/cy, igual que dibujar()); el parche no, así que el paso de uno a otro es
       la afín de ps1AfinParche y no un simple cambio de escala. Sin afín se cae
       al supuesto de siempre, que es justo esa escala. */
    var q = parche.ancho / (parche.ladoArcmin * 60);    // px de parche por ″
    var a = parche.afin || { cx: (parche.ancho - 1) / 2, cy: (parche.alto - 1) / 2,
                             xe: -q, xn: 0, ye: 0, yn: q };
    // Sin datos de cielo no hay contraste que medir: se pinta el flujo tal cual
    // (así lo usan los tests de geometría, que no simulan ninguna óptica).
    // El θint del parche entra aquí, en el contexto DE ESTA galaxia: el umbral
    // de la escena (pintarFot) no lo lleva, porque las otras capas difusas no
    // tienen tamaño intrínseco propio. Con FOT.H2C nula el argumento se ignora.
    var c = o.cielo ? R().ctxFotometrico(o.cielo, parche.thetaIntArcmin) : null;
    var umbral = c ? R().sbUmbralContraste(c) : 0;   // constante en todo el parche
    var pxPorAs = escv / 3600;
    /* El halo extrapolado y el umbral de contraste son decisiones INDEPENDIENTES.
       `halo` decide si se rellena con el perfil del catálogo lo que la imagen no
       cubre: eso sí depende del tamaño y del brillo medio de la galaxia. La ley
       de visibilidad, en cambio, es la misma para todas —la marca el ojo, no la
       galaxia—, así que el umbral se aplica siempre que haya óptica que simular.
       Antes iban atadas (`if (!halo) c = null`) y el render acababa con DOS leyes
       ópticas conviviendo, con dependencia de apertura de signo contrario. */
    var halo = !!c && ps1HaloActivo(parche.halo);
    var comps = halo ? (parche.comps || []) : [], pa = parche.pa || 0;
    // Peso y reanclaje de la mezcla; sin perfil que mezclar, la imagen va tal cual.
    var peso = halo ? (parche.peso || null) : null;
    var sMezcla = peso ? parche.escalaMezcla : 1;
    var haloPx = ps1RadioHaloAs(comps) * pxPorAs;       // el perfil suele salirse del parche
    var alcance = Math.max(ladoPx / 2, haloPx);
    /* La PSF del telescopio, justo antes de la mezcla imagen/modelo y una sola
       vez por parche. Va en los píxeles del PARCHE, no en los del lienzo, y esa
       es la razón de que no pueda contarse dos veces: el borrón queda fijo en
       segundos de arco, así que al subir aumentos crece en pantalla lo mismo que
       crece la galaxia —aumentar no resuelve, que es lo que hace la naturaleza—
       y ni el campo aparente ni MAG entran en el cálculo.

       La apertura es la misma D que ya usan magLimite y el disco de Airy de las
       estrellas: `render` la pasa tal cual. El respaldo es para un llamador que
       solo traiga el cielo —pupila = D/MAG por definición, así que su producto
       ES D y los aumentos se cancelan: no es una dependencia nueva de MAG, es
       álgebra— y es aproximado, porque el formulario redondea la pupila a 0,1 mm.
       Sin ninguna de las dos no hay óptica que simular y el parche va tal cual. */
    var escParche = (parche.ladoArcmin * 60) / parche.ancho;   // ″/px del recorte
    var D = o.apertura;
    if (!(D > 0) && o.cielo && o.cielo.pupilaSalida > 0 && o.cielo.aumentos > 0) {
      D = o.cielo.pupilaSalida * o.cielo.aumentos;
    }
    var datos = c ? ps1DatosConPsf(parche, escParche, D) : parche.datos;
    /* EXPERIMENTAL (PS1.confianzaLocalNaN): flujo a reponer en los vecinos
       ausentes donde la medida dice que falta información de verdad. Con la
       bandera apagada vale null y el bucle de abajo es el de siempre. */
    var repuesto = (PS1.confianzaLocalNaN && c && peso && comps.length)
      ? ps1ReponerNaN(parche, escParche, D) : null;
    /* Soporte local para la rampa (ver ps1SoporteLocal). Una vez por parche, en
       la rejilla del parche —donde están los datos—, no en la del lienzo. Solo
       alimenta la DECISIÓN de opacidad; el flujo que se pinta sigue siendo el de
       la mezcla, píxel a píxel. */
    var soporte = c ? ps1SoporteLocal(datos, parche.ancho, parche.alto, escParche) : null;
    /* Máscara difusa: pintarFot ya no le aplica visibilidadDifusa —la rampa de
       opacidad es su desvanecido y mide contra el MISMO umbral, así que pasar
       por las dos es contarlo dos veces— y el realce va a gamma completa. No es
       una ley distinta: es la marca de que la ley ya se aplicó. PS1 escribe 0,
       que ES la t de realzarPerceptual (ver difusoMarcado).
       Se marca TODO el parche de la galaxia, imagen incluida, y no solo el trozo
       extrapolado. Partir el objeto en dos leyes por un radio dejaba un ESCALÓN
       en la costura: el anillo de dentro se quedaba a nivel de cielo y el halo de
       fuera saltaba a 10 DN, que en pantalla es un círculo negro rodeado de un
       halo claro (M101 a 146x). Un perfil que decrece hacia fuera tiene que
       pintarse con una sola ley, o la costura se ve.
       Vive en el objeto `cielo` porque es el mismo que luego recibe pintarFot, y
       dura lo que el render: cada galaxia que llega marca sobre la misma. */
    var mascara = c ? R().difusoMaskDe(o.cielo, difuso.length) : null;
    var x0 = Math.max(0, Math.floor(cx - alcance)), x1 = Math.min(SIZE - 1, Math.ceil(cx + alcance));
    var y0 = Math.max(0, Math.floor(cy - alcance)), y1 = Math.min(SIZE - 1, Math.ceil(cy + alcance));
    for (var y = y0; y <= y1; y++) {
      // El norte es hacia ARRIBA y el este hacia la IZQUIERDA (ver la proyección
      // de cx/cy): los dos desplazamientos van con signo cambiado.
      var norte = -(y - cy) / pxPorAs;
      for (var x = x0; x <= x1; x++) {
        var este = -(x - cx) / pxPorAs;
        /* Remuestreo bilineal sobre la rejilla del PARCHE (medido en
           harness_remuestreo_parche.js: mismo flujo, menos escalonado). Con
           cuatro vecinos ya no hay un `k` único que reutilizar para `peso[k]`:
           cada vecino aporta su mezcla COMPLETA —su flujo y su peso—, y el
           vecino más próximo queda como el caso particular pe = 1. La mezcla
           sigue siendo la de siempre: la imagen manda donde midió, el perfil
           rellena lo que la imagen no cubre, y el tránsito es continuo porque
           el peso lo es (ps1PesoImagen). Fuera del parche el vecino vale flujo
           0 y peso 0 —lo mismo que valía con Math.round—, así que en el borde
           queda el perfil solo, sin costura. El NaN (hueco del stack o
           sobresustracción) recibe el MISMO trato que el de fuera del parche:
           es ausencia, no medida, y el perfil lo rellena (ver el bucle). */
        var fx = a.cx + a.xe * este + a.xn * norte;
        var fy = a.cy + a.ye * este + a.yn * norte;
        var px0 = Math.floor(fx), py0 = Math.floor(fy);
        var tx = fx - px0, ty = fy - py0;
        var fm = comps.length ? ps1FlujoModelo(comps, pa, norte, este) : 0;
        var acc = 0, cubierto = 0;
        for (var vj = 0; vj < 2; vj++) {
          var cvj = vj ? ty : 1 - ty;
          if (!(cvj > 0)) continue;
          var py = py0 + vj;
          for (var vi = 0; vi < 2; vi++) {
            var pe = cvj * (vi ? tx : 1 - tx);
            if (!(pe > 0)) continue;
            var px = px0 + vi, fv = 0, wv = 0;
            if (py >= 0 && py < parche.alto && px >= 0 && px < parche.ancho) {
              var k = py * parche.ancho + px;
              var v = datos[k];
              // El NaN (hueco del stack o sobresustracción, ver
              // ps1AnclarACatalogo) es AUSENCIA: aporta flujo 0 y peso 0, igual
              // que el vecino de fuera del parche, y deja que (1−w)·perfil
              // rellene. Saltarlo y renormalizar NO rellena —el peso no
              // distingue NaN de 0 y dentro del cuerpo w≈1— y era lo que
              // dejaba el foso negro de M51 (INFORME2, experimento A1/A2).
              if (isFinite(v)) { fv = v; wv = peso ? peso[k] : 0; }
              // Ausente con información que reponer (ver ps1ReponerNaN): entra
              // con SU peso, y el perfil solo cubre la parte que ese peso deja.
              else if (repuesto && isFinite(repuesto[k])) { fv = repuesto[k]; wv = peso[k]; }
            }
            acc += pe * (comps.length ? wv * sMezcla * fv + (1 - wv) * fm : fv);
            cubierto += pe;
          }
        }
        if (!(cubierto > 0)) continue;   // punto degenerado (pe=0 en los cuatro)
        var f = acc / cubierto;
        if (!(f > 0)) continue;
        if (c) {
          /* PS1.opacidadInternaEscena (APAGADA, ver PS1): forzar op = 1 dentro
             de la escena convierte la elipse μ=25 en FUENTE de luz — el fondo
             sub-umbral de dentro se resucita entero y se pinta como una
             envolvente alrededor de la galaxia. Medido en M101 a 190×: 380 160
             px del lienzo que estaban a nivel de cielo salían con señal, o sea
             la elipse entera. Con la bandera apagada manda la rampa, dentro y
             fuera, y la galaxia se funde con el fondo por sus estructuras. */
          /* La rampa juzga el brillo del píxel O el de su soporte local, el que
             sea mayor (ps1SoporteLocal). Nunca al revés: el soporte solo puede
             EVITAR que la rampa parta una estructura, nunca oscurecer un píxel
             que ya se veía solo.
             Y no aporta ni un fotón: `f`, lo que se pinta, es el flujo de la
             mezcla sin tocar. Un píxel de fondo sub-umbral rodeado de más fondo
             sub-umbral tiene un soporte igual de bajo que él, así que sigue
             apagándose —por eso esto no resucita la envolvente de μ=25—;
             lo que cambia es el interbrazo pegado al brazo, que deja de cruzar
             la rampa entera en nueve píxeles. */
          var sop = 0;
          if (soporte) {
            var sx = Math.round(fx), sy = Math.round(fy);
            // Solo donde HAY medida: fuera del parche no hay soporte que valga,
            // y arrastrar el del borde metería el brillo del canto en el halo.
            if (sx >= 0 && sx < parche.ancho && sy >= 0 && sy < parche.alto) {
              sop = soporte[sy * parche.ancho + sx];
            }
          }
          var op = (PS1.opacidadInternaEscena && parche.escena &&
                    ps1FuenteEnEscena(parche.escena, a, fx, fy))
            ? 1 : ps1Opacidad(-2.5 * Math.log10(sop > f ? sop : f), umbral);
          f = ps1FlujoConOpacidad(f, op, c);
        }
        if (!(f > 0)) continue;
        difuso[y * SIZE + x] += f;
        if (mascara) mascara[y * SIZE + x] = 0;
      }
    }
    return difuso;
  }

  /* Galaxias del catálogo RC3 que caen en el campo y que PS1 cubre. Cada fila:
     [nombre, alt, RA°, Dec°, r_e″, b/a, PA°, magV, n, B/T, polvo, n medido]. El
     n medido es el de S4G (0 = no hay) y solo lo usa la puerta del halo. El margen de
     medio lado deja entrar a las que asoman por el borde con su centro fuera. */
  /* Galaxias mucho más grandes que el parche: fuera. Con M31 (el parche de 20′
     abarca el 8 % de su luz) se ve por qué: el stack de PanSTARRS resta el fondo
     por skycell y con él el disco extendido —a 8′ del centro la señal ya es
     cielo, cuando el disco exponencial del propio RC3 predice casi el mismo
     brillo que a 1′—, así que el anclaje mete toda esa luz en lo poco que la
     imagen sí trae y sale un bulbo suelto. Juzgado por el usuario, 11-ago-2026.
     Son tres en todo el catálogo al norte de −30°: M31 (8 %), IC 342 (17 %) y
     M33 (23 %); la siguiente ya está en el 66 %. Se quedan sin capa, como
     estaban — y el aviso de la ficha 12 lo dice, así que la ley vive aquí y no
     repetida en los dos sitios. */
  function ps1CabeEnParche(g) {
    /* Toda clase de nebulosa salvo las planetarias exige además lado sin
       recorte: NGC 7000 (semieje ~1,4°) pasaba el corte de fracción (0,41)
       y salía un cuadrado de campo estelar anclado a mag 4,3 sin nebulosa —
       el fenómeno de M31, pero la fracción no lo cazaba porque el ala μ25 del
       modelo n=1 subestima cuánta luz real queda fuera cuando el stack ya
       restó la emisión extendida. Ser compacta no exime: los segmentos del
       Velo (SNR, 6·r_e de 22′ a 330′) llegan igual de recortados. Solo las
       planetarias caben por construcción (su mayor 6·r_e es 11,6′). */
    var clase = g[12] || '';
    if (clase && clase !== 'PN' &&
        PS1.ladoFactor * g[4] / 60 > PS1.ladoMax) return false;
    var lado = ps1LadoArcmin(g[4]);
    return ps1FraccionLuz(g[8], (lado * 60 / 2) / (g[4] > 0 ? g[4] : 1e9)) >= PS1.fracMin;
  }

  /* Catálogo de la capa difusa: galaxias + las nebulosas cuya CLASE ya sabe
     tratar el pipeline. La clase (columna 13 de nebulosas-datos.js, Type del
     OpenNGC) decide qué filas entran, no qué código corre: cada fila de
     nebulosa ES un modelo Sérsic n=1 construido por gen_nebulosas.py con el
     mismo esquema que las galaxias, y de ahí salen escena, anclaje y θint por
     las mismas funciones. Abiertas: 'PN' y 'SNR' (compactas, borde real,
     validadas con M57 y M1), y 'HII'/'EmN'/'RfN' (validadas con M78, NGC 7635
     y NGC 6888: sin borde real, siguen la isofota como las galaxias). Quedan
     fuera 'Neb' y 'Cl+N' —cajón de sastre y mezcla cúmulo+nebulosa—; cada
     apertura exige su validación, no más código. */
  var PS1_CLASES_DIFUSAS = ['PN', 'HII', 'EmN', 'RfN', 'SNR'];

  /* Borde REAL de un objeto compacto (″, semieje mayor), 0 si no lo tiene.
     Una galaxia se acaba donde su perfil cae bajo el ruido —su «borde» es una
     isofota— pero una planetaria o un resto de supernova tienen borde físico:
     la cáscara. Para ellos gen_nebulosas.py resolvió r_e = 0,60·semieje de
     catálogo (espejo: RE_SOBRE_SEMIEJE_COMPACTA), así que el borde se
     recupera exacto. Es lo único que la clase cambia en el montaje: escena y
     θint usan el borde en vez de la isofota μ25 del ala exponencial, que en
     M57 queda 2,8 veces más lejos que la nebulosa y no es el objeto. */
  var PS1_RE_SOBRE_BORDE = 0.60;   // = RE_SOBRE_SEMIEJE_COMPACTA del generador
  var PS1_CLASES_COMPACTAS = ['PN', 'SNR'];   // = COMPACTAS del generador

  function ps1RadioBordeAs(gal) {
    if (!gal || PS1_CLASES_COMPACTAS.indexOf(gal.clase) < 0 || !(gal.reArcsec > 0)) return 0;
    return gal.reArcsec / PS1_RE_SOBRE_BORDE;
  }

  /* θ intrínseco (arcmin, circularizado) del objeto montado: el borde real si
     la clase lo define; si no, la isofota μ25 del modelo, como siempre. */
  function ps1ThetaIntDeGal(gal, comps) {
    var rb = ps1RadioBordeAs(gal);
    if (!(rb > 0)) return ps1ThetaIntArcmin(comps, gal.ba);
    var q = (gal.ba > 0 && gal.ba <= 1) ? gal.ba : 1;
    return (2 * rb / 60) * Math.sqrt(q);
  }

  function ps1CatalogoDifuso(galaxias, nebulosas) {
    var out = (galaxias || []).slice();
    for (var i = 0; i < (nebulosas || []).length; i++) {
      if (PS1_CLASES_DIFUSAS.indexOf(nebulosas[i][12]) >= 0) out.push(nebulosas[i]);
    }
    return out;
  }

  function ps1GalaxiasDelCampo(catalogo, ra0, dec0, arcmin) {
    var out = [], cos0 = Math.cos(dec0 * Math.PI / 180), radio = arcmin / 120;
    for (var i = 0; i < (catalogo || []).length; i++) {
      var g = catalogo[i];
      if (!(g[3] > PS1.decMin)) continue;                       // sin cobertura al sur
      if (!ps1CabeEnParche(g)) continue;
      var lado = ps1LadoArcmin(g[4]);
      var margen = radio + lado / 120;
      var dra = ((((g[2] - ra0) + 540) % 360) - 180) * cos0;
      var ddec = g[3] - dec0;
      if (Math.abs(dra) > margen || Math.abs(ddec) > margen) continue;
      out.push({
        nombre: g[0] || g[1], ra: g[2], dec: g[3], reArcsec: g[4],
        ba: g[5], pa: g[6], magV: g[7], n: g[8], bt: g[9],
        nMedido: g[11] || 0, clase: g[12] || '', ladoArcmin: lado
      });
    }
    return out;
  }

  /* ── Origen del parche (efectos) ─────────────────────────────────────────────
     Dos orígenes posibles y un solo resultado: el objeto que devuelve parseFITS.
     El de casa es la TEXTURA (dso/), un dato del proyecto generado offline por
     scripts/gen_dso_texturas.js; el de fuera es ps1-proxy.php, que resuelve las
     skycells contra STScI y cose el recorte en caliente. La caché de aquí es
     solo de sesión y la clave es el objeto: el parche no depende del ocular ni
     del aumento, así que la textura se decodifica una vez. */
  var cachePS1 = {};

  /* Módulo del códec asinh16 y del PNG de 16 bits. Se lee al usarlo, no al
     cargar: el ciclo es de llamada (ADR 0020), igual que R(). */
  function P16() {
    var m = typeof window !== 'undefined' ? window.BitacoraPNG16 : null;
    if (!m) throw new Error('BitacoraPS1 necesita BitacoraPNG16 (códec asinh16)');
    return m;
  }

  /* Nombre de fichero de la textura: el `nombre` de la fila con los espacios y
     las barras convertidos en guion bajo ('NGC 5194' → 'NGC_5194',
     'PN A66 12' → 'PN_A66_12'). Se separan en vez de pegarse porque el nombre
     de fichero se lee a ojo al desplegar y al mirar la carpeta, y 'PNA6612' no
     se lee. Decidido por el usuario el 2026-09-06; el §4.1 del objetivo daba dos
     ejemplos incompatibles y esta es la regla del segundo.

     No se puede cambiar a la ligera: el id va en URL que se sirven como
     inmutables, así que renombrar obliga a republicar el catálogo entero.

     La CLAVE del manifiesto sigue siendo el nombre LITERAL: la identidad es la
     del catálogo, no un cruce por posición (ADR 0015). */
  function ps1IdTextura(nombre) {
    return String(nombre == null ? '' : nombre).trim().replace(/[\s\\/]+/g, '_');
  }

  /* Fila del manifiesto (window.BITACORA_DSO_TEXTURAS, generado):
     [nombre, modelo, version, ancho, escalaAs, fracAusencia, motivo].
     Que un objeto no tenga textura es un DATO (modelo = "fila" con su motivo) y
     no un silencio; sin manifiesto cargado, null y todo sigue como antes. */
  function ps1FilaTextura(nombre) {
    var t = (typeof window !== 'undefined' && window.BITACORA_DSO_TEXTURAS) || null;
    if (!t) return null;
    for (var i = 0; i < t.length; i++) if (t[i][0] === nombre) return t[i];
    return null;
  }

  /* Lee la textura y su sidecar y devuelve el MISMO objeto que parseFITS:
     mismas claves, mismas unidades, la escala en ″/px y la WCS ya en la forma
     que usa ps1CieloAPixel. Nada aguas abajo puede saber de dónde vino.

     El sidecar guarda la WCS tal cual la deja parseFITS (ra0, dec0, x0, y0, gx,
     gy) y no en tarjetas FITS: traducir CRPIX/CDELT/PC es una ley, y esa ley ya
     vive en parseFITS. Escribirla otra vez aquí sería la deriva del ADR 0008.

     Cualquier tropiezo —red, sidecar incoherente, códec, navegador sin
     DecompressionStream— da null con el motivo en `notas`, nunca una imagen a
     medias: quien llama pinta la fila del catálogo, el mismo respaldo que
     cuando el proxy no responde. */
  function ps1LeerTextura(urlPng, urlJson, notas) {
    /* El guardián va FUERA de la promesa: que falte el módulo del códec es un
       error de carga de la página, no una textura rota, y tiene que sonar en
       vez de disfrazarse de fallo de red (ADR 0020). */
    var png = P16();
    notas = notas || {};
    return Promise.all([
      fetch(urlPng).then(function (r) {
        if (!r.ok) throw new Error('textura ' + r.status);
        return r.arrayBuffer();
      }),
      fetch(urlJson).then(function (r) {
        if (!r.ok) throw new Error('sidecar ' + r.status);
        return r.json();
      })
    ]).then(function (par) {
      var sc = par[1] || {};
      return png.leer(new Uint8Array(par[0]), notas).then(function (img) {
        if (!img) return null;
        var cod = sc.codificacion;
        if (img.ancho !== sc.ancho || img.alto !== sc.alto ||
            !cod || !(cod.a > 0) || !(cod.uMax > cod.uMin) || !(sc.escalaAs > 0)) {
          notas.motivo = 'sidecar';
          return null;
        }
        return {
          ancho: img.ancho, alto: img.alto,
          datos: png.decodificar(img.u16, cod),
          escalaAs: sc.escalaAs, wcs: sc.wcs || null,
          // parseFITS lo lee de ZPT_0000 y no lo usa nadie: el nivel absoluto lo
          // pone el catálogo (ps1AnclarACatalogo). Mismo valor que allí sin la
          // tarjeta, para que la forma del objeto sea la misma.
          zpt: NaN
        };
      });
    }).catch(function () {
      if (!notas.motivo) notas.motivo = 'red';
      return null;
    });
  }

  /* De dónde sale el parche de este objeto, en este orden:
       manifiesto con `imagen` → la textura de dso/, sin salir del dominio;
       manifiesto con `fila`   → null con su motivo y SIN una sola petición;
       sin fila en el manifiesto (catálogo más nuevo que él) → el proxy, y solo
       si cfg.proxyRespaldo sigue encendido.
     Resuelve a null también cuando PS1 no cubre el campo (502 del proxy) o el
     servicio no responde: la capa se apaga sola y el aviso lo da quien llama.
     gal: {nombre, ra, dec, ladoArcmin, …}. */
  function ps1FuenteParche(gal, notas) {
    notas = notas || {};
    var clave = gal.ra.toFixed(5) + ',' + gal.dec.toFixed(5) + ',' + gal.ladoArcmin.toFixed(2);
    if (cachePS1[clave]) return cachePS1[clave];
    var fila = ps1FilaTextura(gal.nombre), p;
    if (fila && fila[1] === 'imagen') {
      var base = TEXTURAS_URL + ps1IdTextura(gal.nombre) + '.' + fila[2];
      p = ps1LeerTextura(base + '.png', base + '.json', notas);
    } else if (fila) {
      notas.motivo = fila[6] || 'fila';
      return Promise.resolve(null);
    } else if (!PS1.proxyRespaldo) {
      notas.motivo = 'sin-textura';
      return Promise.resolve(null);
    } else {
      p = ps1DescargarParche(gal);
    }
    p = p.then(function (f) {
      if (!f) return null;
      f.ra = gal.ra; f.dec = gal.dec; f.ladoArcmin = gal.ladoArcmin;
      if (!(f.escalaAs > 0)) f.escalaAs = gal.ladoArcmin * 60 / f.ancho;
      return f;
    });
    cachePS1[clave] = p;
    return p;
  }

  /* Camino de respaldo: el parche cosido por ps1-proxy.php, en caliente. */
  function ps1DescargarParche(gal) {
    return fetch(ps1UrlParche(gal)).then(function (r) {
      if (!r.ok) throw new Error('ps1-proxy ' + r.status);
      return r.arrayBuffer();
    }).then(function (buf) {
      return parseFITS(buf);
    }).catch(function () { return null; });
  }

  /* Estrellas de Gaia ([ra, dec, g, …][]) en píxeles del parche, con su radio de
     máscara. TODAS las de la muestra, no solo las que el render pinta: mirando el
     resultado (ficha 04, 11-ago-2026) el parche salía granulado de estrellas más
     débiles que el límite del equipo, y eso ensucia más de lo que aporta la luz no
     resuelta que aportaban. Lo que quede por debajo de la profundidad de la
     consulta (magConsultaGaia, tope 20) sí sigue ahí: PS1 llega a g ≈ 23.
     La posición sale de la WCS del propio recorte, evaluando la TAN estrella a
     estrella: son unos cientos y se hace una vez por galaxia, así que aquí no
     hay por qué conformarse con la afín. Con el supuesto anterior —norte arriba
     y centro en el ra/dec pedido— las máscaras de M81 caían 12 px de mediana
     fuera de su estrella (.scratch/estrellas-de-mas/rotacion.js). */
  function ps1EstrellasEnPixeles(f, gal, estrellas) {
    var a = f.afin || ps1AfinParche(f, gal), enPx = [];
    var esc = 1 / Math.hypot(a.xn, a.yn);               // ″ por píxel, giro incluido
    var cos0 = Math.cos(gal.dec * Math.PI / 180);
    for (var i = 0; i < (estrellas || []).length; i++) {
      var e = estrellas[i];
      var p = f.wcs ? ps1CieloAPixel(f.wcs, e[0], e[1]) : null;
      if (!p) {
        var este = ((((e[0] - gal.ra) + 540) % 360) - 180) * cos0 * 3600;
        var norte = (e[1] - gal.dec) * 3600;
        p = [a.cx + a.xe * este + a.xn * norte, a.cy + a.ye * este + a.yn * norte];
      }
      if (p[0] < -8 || p[1] < -8 || p[0] > f.ancho + 8 || p[1] > f.alto + 8) continue;
      // `rAs` además de `rPx`: ps1QuitarEstrellas decide con él cómo rellenar.
      var rAs = ps1RadioMascaraAs(e[2]);
      // `i`: fila de `estrellas` de la que sale esta posición, para que la capa
      // de estrellas pueda excluir exactamente las que el parche conserva.
      enPx.push({ x: p[0], y: p[1], rPx: rAs / esc, rAs: rAs, g: e[2], i: i });
    }
    return enPx;
  }

  /* ¿La fuente (x, y, en píxeles del parche) cae dentro de algún componente de
     la escena? El punto se lleva al cielo con el afín inverso (″ de norte/este,
     giro de la skycell incluido) y se compara su radio elíptico —b/a y PA del
     componente, sobre el semieje mayor, igual que ps1FlujoModelo— con el radio
     isofotal r25As. Comparación de dos números en ″: determinista, sin borde
     rasterizado, el mismo veredicto a cualquier resolución. */
  function ps1FuenteEnEscena(escena, a, x, y) {
    for (var i = 0; i < escena.length; i++) {
      var c = escena[i], dx = x - c.cx, dy = y - c.cy;
      var este = a.ex * dx + a.ey * dy, norte = a.nx * dx + a.ny * dy;
      if (ps1RadioEje(c.cos, c.sin, norte, este, c.ba) <= c.r25As) return true;
    }
    return false;
  }

  /* Filas de `estrellas` que el parche CONSERVA por caer dentro de la escena:
     el mismo veredicto que ps1QuitarEstrellas (misma ps1FuenteEnEscena, mismas
     posiciones enPx), calculado una sola vez. Cada fuente Gaia tiene un único
     propietario visual: si el parche la conserva, la capa de estrellas no debe
     pintarla otra vez encima (ver ps1CapaGalaxias). */
  function ps1FuentesEnEscena(estrellas, enPx, afin, escena) {
    var out = [];
    if (!escena || !escena.length) return out;
    for (var i = 0; i < enPx.length; i++) {
      var e = enPx[i];
      if (ps1FuenteEnEscena(escena, afin, e.x, e.y)) out.push(estrellas[e.i]);
    }
    return out;
  }

  /* ¿Está el punto (px, py) dentro de la elipse de alguno de estos componentes?
     Misma cuenta que ps1FuenteEnEscena, sobre una lista ya filtrada. */
  function ps1PuntoEnCompacta(lista, a, px, py) {
    for (var i = 0; i < lista.length; i++) {
      var c = lista[i], dx = px - c.cx, dy = py - c.cy;
      var este = a.ex * dx + a.ey * dy, norte = a.nx * dx + a.ny * dy;
      if (ps1RadioEje(c.cos, c.sin, norte, este, c.ba) <= c.r25As) return true;
    }
    return false;
  }

  var MORDIDA_MUESTRAS = 64;   // lado de la rejilla con que se mide la elipse

  /* CUÁNTO muerde cada componente COMPACTO de la escena (borde real: PN, SNR):
     array paralelo a `escena` con la fracción de su elipse tapada por los discos
     ANCHOS (rAs > rellenoPlanoMaxAs) de las fuentes que NO se conservan. 0 para
     los no compactos —el borde de una galaxia es una isofota, y sus reglas de
     fusión imagen/modelo están medidas y cerradas (M81/M104): la mordida no las
     reabre—.

     Antes esto era un test binario de CONTACTO (radios elípticos sumados), y por
     eso disparaba de más: el radio de máscara está anclado al fondo del stack
     (mascaraMagRef = 22), no al brillo del objeto, así que sobre una nebulosa
     brillante el ala deja de mandar mucho antes del borde del disco. Medido
     sobre el catálogo, el contacto marcaba OCHO planetarias y la cobertura las
     separa: NGC 7026 y IC 5117 al 100 %, Abell 12 al 79,8 % —el caso que motivó
     la regla, con μ Orionis saturando de verdad la cáscara— contra NGC 7008 al
     43,6 %, NGC 7048 al 33,9 % y NGC 6578, Abell 33 y Abell 72 por debajo del
     9 %, que la perdían por un roce. Ver docs/notas/ngc7008-render-planetarias.md.

     Se muestrea en rejilla en vez de resolver la lente circular-elipse porque el
     veredicto se compara contra un umbral lejos de los extremos y hay varios
     discos que pueden solaparse entre sí: 64×64 da el 1 % de resolución, de
     sobra, y cuesta una vez por parche. */
  function ps1CoberturaMordida(enPx, a, escena) {
    var cob = [], i, j;
    for (i = 0; i < (escena || []).length; i++) cob.push(0);
    if (!a || !escena || !escena.length || !enPx || !enPx.length) return cob;
    var anchas = [];
    for (i = 0; i < enPx.length; i++) {
      var e = enPx[i];
      if (!(e.rAs > PS1.rellenoPlanoMaxAs)) continue;
      if (ps1FuenteEnEscena(escena, a, e.x, e.y)) continue;   // conservada: no borra nada
      anchas.push(e);
    }
    if (!anchas.length) return cob;
    var esc = 1 / Math.hypot(a.xn, a.yn);
    for (j = 0; j < escena.length; j++) {
      var c = escena[j];
      if (!c.compacta) continue;
      var rPx = c.r25As / esc, paso = 2 * rPx / MORDIDA_MUESTRAS, dentro = 0, tapados = 0;
      for (var sy = 0; sy < MORDIDA_MUESTRAS; sy++) {
        for (var sx = 0; sx < MORDIDA_MUESTRAS; sx++) {
          var px = c.cx - rPx + (sx + 0.5) * paso, py = c.cy - rPx + (sy + 0.5) * paso;
          if (!ps1PuntoEnCompacta([c], a, px, py)) continue;
          dentro++;
          for (i = 0; i < anchas.length; i++) {
            var ea = anchas[i], ex = px - ea.x, ey = py - ea.y, rM = Math.max(1, ea.rPx);
            if (ex * ex + ey * ey <= rM * rM) { tapados++; break; }
          }
        }
      }
      if (dentro) cob[j] = tapados / dentro;
    }
    return cob;
  }

  /* ¿Alguna máscara ANCHA muerde la escena difusa lo bastante como para que el
     perfil tenga que tomar el relevo? El disco ancho se deja al nivel del cielo
     (ver ps1QuitarEstrellas) confiando en que (1−w)·perfil rellene lo borrado;
     con la mayor parte del objeto tapada, ese relleno deja de ser opcional: sin
     él sale NEGRO (Abell 12 bajo la máscara de μ Orionis: 60″ de disco a 47″ del
     centro de una cáscara de 19″). El veredicto viaja en las medidas del halo y
     lo consume ps1HaloActivo.
     Por debajo del umbral la respuesta ya no es el perfil sino conservar la
     imagen: la máscara se recorta en el borde del objeto (ver ps1QuitarEstrellas),
     así que aquí tampoco hay ausencia que rellenar. */
  function ps1MascaraMuerdeEscena(enPx, a, escena) {
    if (!a || !escena || !escena.length) return false;
    var cob = ps1CoberturaMordida(enPx, a, escena);
    for (var i = 0; i < cob.length; i++) if (cob[i] >= PS1.mordidaCobMin) return true;
    return false;
  }

  /* Compañeras demasiado débiles para el RC3 (BT_MAX de gen_galaxias.py corta
     en 13,0, "no se ve por un ocular") pero SÍ visibles con equipo real —caso
     NGC 7335, B=14,44, junto a NGC 7331— y catalogadas en SIMBAD/NED. Sin
     modelo de Sérsic ni anclaje: solo protegen su núcleo en ps1EscenaEnParche
     con un radio dado, no calculado, para que ps1QuitarEstrellas no lo trate
     como estrella Gaia suelta. Engordar esta lista NO es enmascarar por
     nombre (ver ps1EscenaEnParche/NGC 5195): es dato astrométrico real de una
     fuente que el RC3 no cubre, igual que el propio RC3 es dato real de las
     que sí cubre. Cada fila: [nombre, RA°, Dec°, radio de protección ″ sobre
     el semieje mayor, b/a, PA°]. Fuente: SIMBAD (query 15-ago-2026). */
  var PS1_PROTECCION_SIN_MODELO = [
    ['NGC 7335', 339.33088, 34.44785, 43.3, 0.64, 150]
  ];

  /* Proyección cielo→píxel del parche: WCS del recorte si la hay, afín si no.
     Compartida por los dos orígenes de la escena (catálogo y protección sin
     modelo) para no duplicar la fórmula. */
  function ps1ProyectarEnParche(f, gal, a, cos0, ra, dec) {
    var p = f.wcs ? ps1CieloAPixel(f.wcs, ra, dec) : null;
    if (!p) {
      var este = ((((ra - gal.ra) + 540) % 360) - 180) * cos0 * 3600;
      var norte = (dec - gal.dec) * 3600;
      p = [a.cx + a.xe * este + a.xn * norte, a.cy + a.ye * este + a.yn * norte];
    }
    return p;
  }

  /* Escena difusa del parche: los componentes del catálogo que asoman por él,
     cada uno como elipse isofotal en píxeles del parche. `campo` son las filas
     ya mapeadas de ps1GalaxiasDelCampo (la propia galaxia incluida): así el
     parche de M51 protege también a NGC 5195 sin saber quién es, y una escena
     futura con más componentes difusos (nebulosa + cúmulo asociado) entra por
     la misma puerta. El radio es el de la isofota μ=muEscena del mismo modelo
     de Sérsic que ancla el nivel (r_e del catálogo se resolvió para que esa
     isofota caiga en el D25): la escena es lo que se está REPRODUCIENDO, no
     una opinión sobre a quién pertenece cada estrella.
     El centro sale de la WCS del recorte si la hay, como las estrellas; con el
     afín solo, igual de válido a estas distancias. Componentes cuya elipse no
     toca el parche se descartan: no pueden decidir sobre ninguna fuente.
     Además de `campo`, PS1_PROTECCION_SIN_MODELO aporta compañeras sin
     Sérsic con su propio radio de protección (no calculado, dado). */
  function ps1EscenaEnParche(f, gal, campo) {
    var a = f.afin || ps1AfinParche(f, gal);
    var esc = 1 / Math.hypot(a.xn, a.yn);
    var cos0 = Math.cos(gal.dec * Math.PI / 180);
    var out = [];
    for (var i = 0; i < (campo || []).length; i++) {
      var g = campo[i], r25 = ps1RadioBordeAs(g), borde = r25 > 0;
      if (!borde) {
        var comps = ps1ComponentesSersic(g);
        for (var j = 0; j < comps.length; j++) {
          var r = ps1RadioIsofota(comps[j], PS1.muEscena);
          if (r > r25) r25 = r;
        }
      }
      if (!(r25 > 0)) continue;
      var p = ps1ProyectarEnParche(f, gal, a, cos0, g.ra, g.dec);
      var mPx = r25 / esc;
      if (p[0] < -mPx || p[1] < -mPx || p[0] > f.ancho + mPx || p[1] > f.alto + mPx) continue;
      var paR = (g.pa || 0) * Math.PI / 180;
      out.push({
        cx: p[0], cy: p[1], cos: Math.cos(paR), sin: Math.sin(paR),
        ba: (g.ba > 0 && g.ba <= 1) ? g.ba : 1, r25As: r25,
        // Borde REAL (clases compactas, ver ps1RadioBordeAs): el único caso en
        // que una máscara ancha que muerda la elipse fuerza el perfil
        // (ps1MascaraMuerdeEscena). En una isofota de galaxia no: sus reglas
        // de fusión están medidas aparte y no se cambian desde aquí.
        compacta: borde
      });
    }
    for (var k = 0; k < PS1_PROTECCION_SIN_MODELO.length; k++) {
      var pr = PS1_PROTECCION_SIN_MODELO[k], r25b = pr[3];
      var p2 = ps1ProyectarEnParche(f, gal, a, cos0, pr[1], pr[2]);
      var mPx2 = r25b / esc;
      if (p2[0] < -mPx2 || p2[1] < -mPx2 || p2[0] > f.ancho + mPx2 || p2[1] > f.alto + mPx2) continue;
      var paR2 = (pr[5] || 0) * Math.PI / 180;
      out.push({
        cx: p2[0], cy: p2[1], cos: Math.cos(paR2), sin: Math.sin(paR2),
        ba: (pr[4] > 0 && pr[4] <= 1) ? pr[4] : 1, r25As: r25b
      });
    }
    return out;
  }

  /* Parche listo para pintar: descargado, sin las estrellas ajenas a la escena
     y anclado a la mag V del catálogo. `estrellas` es la muestra de Gaia del
     campo ([ra, dec, g, …][]); `catalogo` (opcional), el catálogo de galaxias:
     de él sale la escena que decide qué fuentes se conservan (las compañeras
     que asoman por el parche incluidas). Sin catálogo, la escena es la propia
     galaxia sola, que ya protege su núcleo. */
  function ps1ParcheDeGalaxia(gal, estrellas, catalogo) {
    return ps1FuenteParche(gal).then(function (f) {
      if (!f) return null;
      // Cómo está puesta la rejilla del recorte respecto al cielo. Una vez por
      // galaxia: no depende del ocular ni del aumento.
      f.afin = ps1AfinParche(f, gal);
      // La escena se busca alrededor de la GALAXIA con el lado de SU parche:
      // entra todo componente catalogado que pueda asomar por él.
      var vecinos = catalogo ? ps1GalaxiasDelCampo(catalogo, gal.ra, gal.dec, gal.ladoArcmin) : [gal];
      var enPx = ps1EstrellasEnPixeles(f, gal, estrellas);
      var escena = ps1EscenaEnParche(f, gal, vecinos);
      var limpio = ps1QuitarEstrellas(f.datos, f.ancho, f.alto, enPx,
        { afin: f.afin, ba: gal.ba, pa: gal.pa, escena: escena });
      var comps = ps1ComponentesSersic(gal);
      var datos = ps1AnclarACatalogo(limpio, f.ancho, f.alto, {
        magV: gal.magV, n: gal.n, reArcsec: gal.reArcsec,
        ladoArcmin: gal.ladoArcmin, escalaAs: f.escalaAs
      });
      /* Peso y reanclaje de la mezcla: una vez por galaxia, no por fotograma ni
         por píxel. Dependen solo del parche y del catálogo, no de la escena. */
      var peso = ps1PesoImagen(datos, f.ancho, f.alto, f.escalaAs);
      var perfil = ps1PerfilEnParche(comps, gal.pa, f.ancho, f.alto, f.afin);
      var halo = ps1MedidasHalo(gal, comps);
      // Máscara ancha sobre la escena: el perfil pasa a ser obligatorio
      // (ps1HaloActivo), o lo borrado al cielo queda negro.
      halo.mordida = ps1MascaraMuerdeEscena(enPx, f.afin, escena);
      return {
        ra: gal.ra, dec: gal.dec, ladoArcmin: gal.ladoArcmin,
        ancho: f.ancho, alto: f.alto, afin: f.afin,
        // Modelo del catálogo para lo de más allá de la imagen (ver
        // ps1PintarParche). Se calcula una vez por galaxia, no por píxel; lo
        // único que falta al pintar es el cielo de la escena.
        comps: comps, pa: gal.pa, halo: halo,
        // Tamaño intrínseco (arcmin) para la ley H2c; inerte con FOT.H2C nula.
        thetaIntArcmin: ps1ThetaIntDeGal(gal, comps),
        peso: peso, escalaMezcla: ps1EscalaMezcla(datos, peso, perfil),
        // El perfil en la rejilla del parche solo lo necesita ps1ReponerNaN, y
        // son 4 MB por galaxia: sin bandera no se guarda.
        perfil: PS1.confianzaLocalNaN ? perfil : null,
        // Fuentes Gaia conservadas dentro de la escena: la capa de estrellas
        // las excluye para no representarlas dos veces (parche + sprite).
        enEscena: ps1FuentesEnEscena(estrellas || [], enPx, f.afin, escena),
        // La misma escena, para PS1.opacidadInternaEscena (unas pocas elipses).
        escena: escena,
        datos: datos
      };
    });
  }

  /* Profundidad de la consulta de Gaia con la capa encendida: la máscara del
     parche necesita TODAS las estrellas que PanSTARRS registra, no solo las que
     este equipo llega a ver. Con un equipo modesto magConsultaGaia se queda en
     15-16 y el parche salía granulado. Pintar no cambia: dibujar() sigue
     cortando en la magnitud límite. El proxy ordena por Gmag, así que si el TOP
     se agota se pierden las débiles, no las brillantes. Lo aplica cada llamador
     a SU consulta, y solo donde la capa se pinta: la vista de placa no la
     necesita. */
  function ps1MagConsulta(mag) {
    return GALAXIAS_IMAGEN ? Math.max(mag, PS1.mascaraProf) : mag;
  }

  /* Fila del RC3 del objeto que se está mirando, si el campo está centrado en
     una galaxia del catálogo. La tolerancia es de 2′ porque el centro del RC3 y
     el del catálogo del simulador no siempre coinciden al segundo. Solo la usa
     el aviso: de las compañeras del campo no se dice nada (en Virgo saldrían
     cinco líneas sobre galaxias que el observador ni buscaba). */
  var APUNTADA_ARCMIN = 2;

  function ps1FilaApuntada(catalogo, ra0, dec0) {
    var cos0 = Math.cos(dec0 * Math.PI / 180), tol = APUNTADA_ARCMIN / 60;
    var mejor = null, dmin = Infinity;
    for (var i = 0; i < (catalogo || []).length; i++) {
      var g = catalogo[i];
      var dra = ((((g[2] - ra0) + 540) % 360) - 180) * cos0;
      var d = Math.hypot(dra, g[3] - dec0);
      if (d <= tol && d < dmin) { dmin = d; mejor = g; }
    }
    return mejor;
  }

  /* Capa de galaxias del campo con su imagen real de PanSTARRS. Vive aquí, y no
     en cada llamador, porque los dos puntos de uso —el simulador y el generador
     de imagen del formulario de registro— tienen que pintar lo mismo; la vez
     anterior se tocó uno y se olvidó el otro.

     El parche tarda segundos, así que el campo de estrellas ya está pintado
     cuando esto arranca y cada galaxia repinta cuando llega la suya; si no
     llega, se queda lo de siempre. La promesa resuelve cuando no queda parche
     pendiente —el formulario la espera para subir la imagen ya completa— y
     nunca rechaza: sin imagen, la vista es la de antes de esta capa.

     `o`: {ra0, dec0, arcmin, size, estrellas, catalogo, vivo}. `vivo` es el
     testigo de que la petición sigue siendo la actual (el observador puede haber
     cambiado de campo mientras el parche viajaba). */
  function ps1CapaGalaxias(difuso, ctx, cielo, capaEst, o) {
    if (!GALAXIAS_IMAGEN) return Promise.resolve({ aviso: '' });
    /* Con imagen real hay luz a TODOS los brillos, y el realce perceptual
       —calibrado contra perfiles sintéticos, que se acaban sobre μ23— la
       inflaba hasta ×13: el brazo externo salía casi tan brillante como el
       disco. De ahí el techo, que solo se aplica cuando hay parche. */
    var cieloParche = {};
    for (var k in cielo) if (Object.prototype.hasOwnProperty.call(cielo, k)) cieloParche[k] = cielo[k];
    cieloParche.realceMax = PS1.realceMax;
    /* Sin catálogo explícito, la capa incluye TAMBIÉN las nebulosas cuya clase
       trata el pipeline: si el defecto fuese solo BITACORA_GALAXIAS, quien no
       lo pasa (el generador de imagen del formulario) nunca vería una
       planetaria como NGC 6905, que sí ve el simulador de oculares. */
    var catalogo = o.catalogo || (typeof window !== 'undefined'
      ? ps1CatalogoDifuso(window.BITACORA_GALAXIAS, window.BITACORA_NEBULOSAS)
      : null);
    var campo = ps1GalaxiasDelCampo(catalogo, o.ra0, o.dec0, o.arcmin);
    var apuntada = ps1FilaApuntada(catalogo, o.ra0, o.dec0);
    var vivo = o.vivo || function () { return true; };
    var apuntadaSinParche = false;
    /* Propietario visual único: las fuentes que un parche conserva dentro de su
       escena salen del dibujo de estrellas antes del repintado, para no verse
       dos veces (en la imagen del parche Y como sprite). Se acumulan entre
       parches —en un campo con varios cada repintado respeta las de todos— y
       la capa se reconstruye de las filas crudas (el raster ya mezclado no se
       puede filtrar). Sin parche no se excluye nada: las estrellas quedan
       pintadas como siempre. */
    var excluidas = [];
    function capaSinExcluidas() {
      if (!excluidas.length || !o.estrellasDibujo || !o.opEstrellas) return capaEst;
      var filtradas = [];
      for (var i = 0; i < o.estrellasDibujo.length; i++) {
        if (excluidas.indexOf(o.estrellasDibujo[i]) === -1) filtradas.push(o.estrellasDibujo[i]);
      }
      return R().capaEstrellas(filtradas, o.opEstrellas, o.size);
    }
    return Promise.all(campo.map(function (gal) {
      return ps1ParcheDeGalaxia(gal, o.estrellas, catalogo).then(function (parche) {
        var esLaApuntada = !!apuntada && gal.ra === apuntada[2] && gal.dec === apuntada[3];
        if (!parche) { if (esLaApuntada) apuntadaSinParche = true; return; }
        if (!vivo()) return;
        for (var x = 0; x < (parche.enEscena || []).length; x++) {
          if (excluidas.indexOf(parche.enEscena[x]) === -1) excluidas.push(parche.enEscena[x]);
        }
        // `cielo`: el mismo objeto que pinta el fondo. De ahí sale el umbral de
        // contraste de la rampa de opacidad (Fcielo·Cmin); la puerta del halo no
        // mira el cielo, solo el objeto.
        ps1PintarParche(difuso, parche, {
          ra0: o.ra0, dec0: o.dec0, arcmin: o.arcmin, size: o.size, cielo: cieloParche,
          apertura: o.apertura
        });
        R().pintarFot(difuso, ctx, cieloParche, capaSinExcluidas());
      }).catch(function () { /* una galaxia que falla no tumba el campo entero */ });
    })).then(function () {
      /* Aviso SOLO del objeto apuntado, y con la causa: cambia lo que el
         observador puede hacer. Por el sur no hay nada que esperar; por tamaño
         tampoco, pero el motivo es otro y merece decirse; por caída, sí.
         Fuera del RC3 no se avisa: no había nada prometido. */
      var aviso = '';
      if (apuntada && !(apuntada[3] > PS1.decMin)) {
        aviso = 'sin imagen de cartografiado: PanSTARRS no cubre por debajo de −30° de declinación';
      } else if (apuntada && !ps1CabeEnParche(apuntada)) {
        aviso = 'sin imagen de cartografiado: esta galaxia es mayor que el recorte que sirve PanSTARRS, ' +
          'y el stack pierde su disco exterior al restar el fondo; se muestra el campo sin ella';
      } else if (apuntadaSinParche) {
        aviso = 'el servicio de imágenes no responde; se muestra el campo sin la galaxia';
      }
      return { aviso: aviso };
    });
  }

  window.BitacoraPS1 = {
    cfg: PS1,
    ps1LadoArcmin: ps1LadoArcmin,
    ps1UrlParche: ps1UrlParche,
    ps1IdTextura: ps1IdTextura,
    ps1FilaTextura: ps1FilaTextura,
    ps1LeerTextura: ps1LeerTextura,
    ps1FuenteParche: ps1FuenteParche,
    parseFITS: parseFITS,
    ps1CieloAPixel: ps1CieloAPixel,
    ps1AfinParche: ps1AfinParche,
    ps1Cielo: ps1Cielo,
    ps1SigmaCielo: ps1SigmaCielo,
    ps1RadioMascaraAs: ps1RadioMascaraAs,
    ps1MascaraMuerdeEscena: ps1MascaraMuerdeEscena,
    ps1CoberturaMordida: ps1CoberturaMordida,
    ps1QuitarEstrellas: ps1QuitarEstrellas,
    ps1FraccionLuz: ps1FraccionLuz,
    ps1ComponentesSersic: ps1ComponentesSersic,
    ps1FlujoModelo: ps1FlujoModelo,
    ps1RadioHaloAs: ps1RadioHaloAs, ps1ThetaIntArcmin: ps1ThetaIntArcmin,
    ps1PesoImagen: ps1PesoImagen,
    ps1PerfilEnParche: ps1PerfilEnParche,
    ps1EscalaMezcla: ps1EscalaMezcla,
    ps1ConcentracionTeorica: ps1ConcentracionTeorica,
    ps1NDeConcentracion: ps1NDeConcentracion,
    ps1ConcentracionN: ps1ConcentracionN,
    ps1EjesArcmin: ps1EjesArcmin,
    ps1BrilloMedio: ps1BrilloMedio,
    ps1MedidasHalo: ps1MedidasHalo,
    ps1HaloActivo: ps1HaloActivo,
    ps1Opacidad: ps1Opacidad,
    ps1SoporteLocal: ps1SoporteLocal,
    ps1FlujoConOpacidad: ps1FlujoConOpacidad,
    ps1AnclarACatalogo: ps1AnclarACatalogo,
    ps1PintarParche: ps1PintarParche,
    ps1PsfParche: ps1PsfParche,
    ps1ThetaAdd: ps1ThetaAdd,
    ps1DatosConPsf: ps1DatosConPsf,
    ps1CabeEnParche: ps1CabeEnParche,
    ps1CatalogoDifuso: ps1CatalogoDifuso,
    ps1RadioBordeAs: ps1RadioBordeAs,
    ps1ThetaIntDeGal: ps1ThetaIntDeGal,
    ps1GalaxiasDelCampo: ps1GalaxiasDelCampo,
    ps1EstrellasEnPixeles: ps1EstrellasEnPixeles,
    ps1EscenaEnParche: ps1EscenaEnParche,
    ps1FuenteEnEscena: ps1FuenteEnEscena,
    ps1FuentesEnEscena: ps1FuentesEnEscena,
    ps1MagConsulta: ps1MagConsulta,
    ps1CapaGalaxias: ps1CapaGalaxias,
    set galaxiasImagen(v) { GALAXIAS_IMAGEN = !!v; },
    get galaxiasImagen() { return GALAXIAS_IMAGEN; },
    set proxyUrl(u) { PS1_PROXY_URL = u; },
    get proxyUrl() { return PS1_PROXY_URL; },
    set texturasUrl(u) { TEXTURAS_URL = u; },
    get texturasUrl() { return TEXTURAS_URL; }
  };
})();
