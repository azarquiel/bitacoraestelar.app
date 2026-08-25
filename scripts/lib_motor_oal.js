/* El motor OAL vive dentro de registro/plantilla-oal.html (la plantilla es un
   fichero único que un compañero abre con doble clic) y se extrae a
   registro/resources/js/bitacora-oal-motor.js para que el sitio pueda servirlo
   (ADR 0003). Quien necesite el motor —los tests, el generador de ejemplos, el
   propio extractor— pasa por aquí: dónde empieza y acaba el bloque se escribe
   una sola vez.

   Sin dependencias. */
'use strict';

var fs = require('fs');
var path = require('path');

var raiz = path.join(__dirname, '..');
var RUTA_PLANTILLA = path.join(raiz, 'registro', 'plantilla-oal.html');
var RUTA_EXTRAIDO = path.join(raiz, 'registro', 'resources', 'js', 'bitacora-oal-motor.js');

/* El bloque, tal cual, sin las etiquetas <script>. Al principio de línea: el
   comentario de cabecera del HTML también nombra el bloque. */
function fuenteIncrustada() {
  var html = fs.readFileSync(RUTA_PLANTILLA, 'utf8');
  var m = /^<script id="motor">([\s\S]*?)^<\/script>/m.exec(html);
  if (!m) {
    console.log('No se encontró el bloque <script id="motor"> en la plantilla.');
    process.exit(1);
  }
  return m[1];
}

function fuenteExtraida() {
  return fs.existsSync(RUTA_EXTRAIDO) ? fs.readFileSync(RUTA_EXTRAIDO, 'utf8') : null;
}

/* El bloque es lógica pura y se cierra sobre `module`, así que se ejecuta tal
   cual y devuelve su API. */
function cargar(fuente) {
  var modulo = { exports: {} };
  new Function('module', fuente == null ? fuenteIncrustada() : fuente)(modulo);
  return modulo.exports;
}

module.exports = { RUTA_PLANTILLA: RUTA_PLANTILLA, RUTA_EXTRAIDO: RUTA_EXTRAIDO,
                   fuenteIncrustada: fuenteIncrustada, fuenteExtraida: fuenteExtraida,
                   cargar: cargar };
