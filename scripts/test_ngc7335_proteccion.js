#!/usr/bin/env node
/* Test de PS1_PROTECCION_SIN_MODELO (resources/js/bitacora-gaia-render.js).

   NGC 7335 (B=14,44) queda fuera del RC3 que alimenta ps1GalaxiasDelCampo
   (BT_MAX=13,0 de gen_galaxias.py): sin fila de catálogo, ps1EscenaEnParche
   nunca la veía y su núcleo se borraba como estrella Gaia suelta. La lista
   de protección sin modelo la mete en la escena con radio dado, sin pasar
   por ps1ComponentesSersic ni por el catálogo.

   Sin dependencias:  node scripts/test_ngc7335_proteccion.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/bitacora-ps1.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

// Parche centrado en NGC 7331, 10′ de lado, norte arriba, sin WCS (afín puro).
var gal = { ra: 339.267, dec: 34.4156, ladoArcmin: 10 };
var f = { ancho: 1024, alto: 1024 };
f.escalaAs = gal.ladoArcmin * 60 / f.ancho;
f.afin = window.BitacoraPS1.ps1AfinParche(f, gal);

var escena = window.BitacoraPS1.ps1EscenaEnParche(f, gal, []);   // campo vacío: sin catálogo
ok(escena.length === 1, 'NGC 7335 entra en la escena sin fila de catálogo');

if (escena.length) {
  var c = escena[0];
  ok(c.r25As > 40 && c.r25As < 46, 'radio de protección es el dado (~43″), no calculado: ' + c.r25As);
  // El punto proyectado debe caer fuera del centro del parche (no es la propia NGC 7331).
  var dist = Math.hypot(c.cx - f.ancho / 2, c.cy - f.alto / 2) * f.escalaAs;
  ok(dist > 150 && dist < 250, 'centro proyectado a la distancia real de NGC 7335 (″): ' + dist.toFixed(1));
}

// Fuera de rango: parche lejano no la ve.
var galLejos = { ra: 10, dec: 0, ladoArcmin: 10 };
var fLejos = { ancho: 1024, alto: 1024 };
fLejos.escalaAs = galLejos.ladoArcmin * 60 / fLejos.ancho;
fLejos.afin = window.BitacoraPS1.ps1AfinParche(fLejos, galLejos);
var escenaLejos = window.BitacoraPS1.ps1EscenaEnParche(fLejos, galLejos, []);
ok(escenaLejos.length === 0, 'parche lejano no arrastra la protección');

console.log(fallos ? ('\n' + fallos + ' fallo(s)') : '\nok — todo pasa');
process.exit(fallos ? 1 : 0);
