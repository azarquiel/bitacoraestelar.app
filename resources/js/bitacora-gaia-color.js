/* ════════════════════════════════════════════════════════════════════════
   MODELO DE COLOR GAIA — fuente única del color de estrella por índice BP–RP.
   ────────────────────────────────────────────────────────────────────────
   Antes esta tabla y sus funciones vivían COPIADAS a mano en el simulador de
   oculares (bitacora-ocular.js) y en el vecindario solar (vecindario-solar.js).
   El requisito «el color de las estrellas debe ser EXACTAMENTE el mismo que la
   representación de Gaia» se sostenía por diff. Ahora es una sola fuente: ambos
   consumidores importan este módulo desde una URL canónica, así que no pueden
   divergir ni en el código ni en el despliegue.

   Interfaz (mínima, esconde tabla + gamma + saturación):
     BitacoraGaiaColor.colorPorBpRp(bprp)  → [r,g,b] color Gaia canónico
     BitacoraGaiaColor.claseEspectral(bprp)→ 'O'|'B'|'A'|'F'|'G'|'K'|'M'|''
     BitacoraGaiaColor.config              → palanca gamma/saturación (mutable)

   El realce de estrella de CARBONO NO vive aquí: es una capa del simulador que
   ajusta el BP–RP efectivo antes de llamar a colorPorBpRp (ver colorEstrella en
   bitacora-ocular.js). Este módulo es agnóstico a carbono.

   Nodos de GAIA_COLOR anclados a los códigos físicos de Harre & Heller (2021) /
   spec2col; el extremo rojo, a un espectro de estrella de carbono (bandas C2
   "Swan" + CN). [bp_rp, R, G, B]
   ════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  // Palanca compartida por simulador y mapa (Q3). Cambiar aquí afecta a ambas
  // vistas a la vez —que es justo el invariante—. gammaGlobal:false = gamma solo
  // del azul al blanco (deja crudo el rojo del carbono); true = gamma en toda la
  // tabla (físicamente coherente, rojos más suaves). hasta/desvanece: banda BP–RP
  // donde la gamma se desvanece hacia el rojo. saturacion:1 = sin empuje (la tabla
  // ya lleva el color físico; saturar(rgb,1) es la identidad, se conserva por él).
  var config = { gammaGlobal: false, gammaHasta: 0.9, gammaDesvanece: 1.6, saturacion: 1.0 };

  var GAIA_COLOR = [
    [-0.40, 125, 153, 255], [0.00, 125, 153, 255], [0.33, 181, 194, 255],
    [ 0.60, 233, 238, 255], [0.82, 255, 237, 231], [1.00, 255, 222, 192],
    [ 1.30, 255, 189, 136], [1.60, 255, 174, 113], [2.00, 255, 162,  90],
    [ 2.40, 255, 162,  81], [2.70, 255, 163,  75], [3.00, 255, 146,  55],
    [ 3.30, 255, 126,  36], [3.70, 255,  97,   9], [4.20, 255,  93,   8],
    [ 5.00, 255,  89,   6]
  ];

  // Empuja un color RGB lejos de su gris (aumenta la saturación). s=1 lo deja igual.
  function saturar(rgb, s) {
    var gris = 0.30 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2];
    var f = function (c) { return Math.max(0, Math.min(255, Math.round(gris + s * (c - gris)))); };
    return [f(rgb[0]), f(rgb[1]), f(rgb[2])];
  }

  // Codificación gamma sRGB de un canal lineal (0–255 → 0–255).
  function sRGBenc(c) {
    c = Math.max(0, Math.min(1, c / 255));
    return (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255;
  }

  // Aplica la gamma según config: total si gammaGlobal, o solo del azul al blanco
  // (mezcla suave en la banda [gammaHasta, gammaDesvanece]) dejando crudo el rojo.
  // 'v' es el índice BP–RP efectivo (el mismo con el que se buscó el color).
  function aplicarGamma(rgb, v) {
    var amt = config.gammaGlobal ? 1
            : (v <= config.gammaHasta) ? 1
            : (v >= config.gammaDesvanece) ? 0
            : (config.gammaDesvanece - v) / (config.gammaDesvanece - config.gammaHasta);
    if (amt <= 0) return rgb;
    return [rgb[0] + (sRGBenc(rgb[0]) - rgb[0]) * amt,
            rgb[1] + (sRGBenc(rgb[1]) - rgb[1]) * amt,
            rgb[2] + (sRGBenc(rgb[2]) - rgb[2]) * amt];
  }

  // Color Gaia canónico de una estrella por su índice BP–RP. bprp==null (débil sin
  // fotometría BP/RP) → ~amarillo neutro (1.4), como Gaia. Interpolación por tramos.
  function colorPorBpRp(bprp) {
    var v = (bprp == null) ? 1.4 : bprp;
    var A = GAIA_COLOR, rgb = [A[A.length - 1][1], A[A.length - 1][2], A[A.length - 1][3]];
    if (v <= A[0][0]) { rgb = [A[0][1], A[0][2], A[0][3]]; }
    else {
      for (var i = 1; i < A.length; i++) {
        if (v <= A[i][0]) {
          var t = (v - A[i - 1][0]) / (A[i][0] - A[i - 1][0]);
          rgb = [A[i - 1][1] + t * (A[i][1] - A[i - 1][1]),
                 A[i - 1][2] + t * (A[i][2] - A[i - 1][2]),
                 A[i - 1][3] + t * (A[i][3] - A[i - 1][3])];
          break;
        }
      }
    }
    return saturar(aplicarGamma(rgb, v), config.saturacion);
  }

  // Clasificación espectral aproximada a partir del índice BP–RP (para leyendas
  // O·B·A·F·G·K·M). Los umbrales son los que la leyenda pinta con la MISMA función
  // de color de Gaia.
  function claseEspectral(bprp) {
    if (bprp == null) return '';
    if (bprp < -0.25) return 'O';
    if (bprp <  0.00) return 'B';
    if (bprp <  0.30) return 'A';
    if (bprp <  0.65) return 'F';
    if (bprp <  1.00) return 'G';
    if (bprp <  1.75) return 'K';
    return 'M';
  }

  /* ── Tipo espectral → índice BP–RP (el camino inverso, aproximado) ───────────
     Para las estrellas de las que hay TIPO pero no fotometría de Gaia: las
     componentes de las dobles del catálogo (el WDS trae "K3II+B9.5") cuando Gaia
     no las tiene, que es justo lo que le pasa a las primarias muy brillantes.

     No sustituye al modelo de color: solo estima el BP–RP con el que preguntarle,
     así que el color sigue saliendo de una sola fuente y una estrella de tipo K3
     se pinta igual que una estrella de Gaia con ese mismo BP–RP.

     Es una tabla de anclas interpoladas linealmente sobre la secuencia
     O·B·A·F·G·K·M (índice = clase×10 + subclase), con los valores habituales de
     BP–RP de secuencia principal. Las gigantes y supergigantes de la misma
     subclase son algo más rojas, y eso se corrige con un desplazamiento pequeño
     en las clases frías, donde el efecto se nota. Es una aproximación para
     PINTAR, no fotometría: el error típico es de unas centésimas, y más en las
     estrellas peculiares (Be, shell, carbono).

     Acepta lo que trae el catálogo: "A0", "B9.5V", "K2Vvar", "G8II-III",
     "F5Iab", "gM0" (prefijo g = gigante), "dF0" (d = enana), "A1VpSrSi". */
  var CLASES = 'OBAFGKM';
  var ANCLAS_BPRP = [
    [ 5, -0.32], [10, -0.29], [15, -0.16], [18, -0.07],   // O5 · B0 · B5 · B8
    [20,  0.00], [25,  0.19],                             // A0 · A5
    [30,  0.38], [35,  0.55],                             // F0 · F5
    [40,  0.75], [42,  0.82], [45,  0.87],                // G0 · G2 (el Sol) · G5
    [50,  1.00], [52,  1.10], [55,  1.45], [57,  1.75],   // K0 · K2 · K5 · K7
    [60,  1.87], [62,  2.15], [65,  3.00], [68,  4.30]    // M0 · M2 · M5 · M8
  ];
  // Enrojecimiento por clase de luminosidad, solo de G en adelante (índice ≥ 40).
  var ROJEZ_LUMINOSIDAD = { I: 0.30, II: 0.30, III: 0.15, IV: 0.05, V: 0, VI: 0 };

  function bpRpPorTipo(tipo) {
    var t = String(tipo == null ? '' : tipo).trim();
    if (t === '') return null;

    // Prefijos en minúscula del catálogo: g = gigante, d = enana, sd = subenana.
    var lum = null;
    var pre = t.match(/^(sd|d|g)([OBAFGKM])/);
    if (pre) {
      lum = (pre[1] === 'g') ? 'III' : 'V';
      t = t.slice(pre[1].length);
    }

    /* La clase tiene que ir seguida de su subclase numérica, o ser la letra sola
       ("A" está en el catálogo). Sin esa exigencia, cualquier palabra que empiece
       por una de las siete letras colaría como tipo espectral: "basura" saldría
       como una B5. */
    var m = t.toUpperCase().match(/^([OBAFGKM])(?:\s*([0-9]+(?:[.,][0-9]+)?)|$)/);
    if (!m) return null;
    var indice = CLASES.indexOf(m[1]) * 10 + (m[2] ? parseFloat(m[2].replace(',', '.')) : 5);

    // Clase de luminosidad del resto del tipo, si no la dijo ya el prefijo. El
    // orden de la alternancia importa: IV antes que I y V, III antes que II.
    if (lum == null) {
      var romano = t.toUpperCase().slice(m[0].length).match(/(VI|IV|III|II|V|I)/);
      lum = romano ? romano[1] : 'V';
    }

    // Interpolación entre anclas.
    var bprp;
    if (indice <= ANCLAS_BPRP[0][0]) { bprp = ANCLAS_BPRP[0][1]; }
    else if (indice >= ANCLAS_BPRP[ANCLAS_BPRP.length - 1][0]) { bprp = ANCLAS_BPRP[ANCLAS_BPRP.length - 1][1]; }
    else {
      for (var i = 1; i < ANCLAS_BPRP.length; i++) {
        if (indice <= ANCLAS_BPRP[i][0]) {
          var x0 = ANCLAS_BPRP[i - 1][0], y0 = ANCLAS_BPRP[i - 1][1];
          var x1 = ANCLAS_BPRP[i][0], y1 = ANCLAS_BPRP[i][1];
          bprp = y0 + (y1 - y0) * (indice - x0) / (x1 - x0);
          break;
        }
      }
    }
    if (indice >= 40) { bprp += (ROJEZ_LUMINOSIDAD[lum] || 0); }
    return bprp;
  }

  var api = { config: config, colorPorBpRp: colorPorBpRp, claseEspectral: claseEspectral,
              bpRpPorTipo: bpRpPorTipo };
  root.BitacoraGaiaColor = api;                                   // navegador (WordPress carga global)
  if (typeof module !== 'undefined' && module.exports) module.exports = api;   // Node (test dorado)
})(typeof window !== 'undefined' ? window : globalThis);
