#!/usr/bin/env node
/* Extrae el motor de registro/plantilla-oal.html a
   registro/resources/js/bitacora-oal-motor.js.

   La plantilla es la fuente y sigue siendo un fichero único que se abre con
   doble clic (ADR 0003); el sitio necesita ese mismo código como fichero
   servible para poder exportar. Copia literal, byte a byte:
   scripts/test_oal_plantilla.js falla si los dos lados dejan de ser idénticos,
   que es lo que ya pasó una vez con la astrometría.

   Sin dependencias:  node scripts/generar_motor_oal.js */
'use strict';

var fs = require('fs');
var path = require('path');
var motor = require('./lib_motor_oal.js');

var fuente = motor.fuenteIncrustada();
motor.cargar(fuente);   // si el bloque no se ejecuta, no se escribe nada
fs.writeFileSync(motor.RUTA_EXTRAIDO, fuente, 'utf8');
console.log('  escrito  ' + path.relative(path.join(__dirname, '..'), motor.RUTA_EXTRAIDO));
console.log('\nok · el motor extraído es copia literal de la plantilla.');
