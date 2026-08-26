#!/usr/bin/env node
/* INVARIANTE DE APERTURA del alpha de estrella (resources/js/bitacora-gaia-render.js).

   Guarda contra el error que costó la rama CFG.alfaPorFlujo: una ley de PURO
   CONTRASTE (flujo de la estrella repartido en el disco dibujado, contra el
   cielo) es ciega a la apertura -a igualdad de aumentos el contraste
   estrella/cielo NO depende de D, porque la pupila de salida sube las dos
   cosas a la vez-. La ganancia real del tubo grande es de ILUMINANCIA RETINAL
   absoluta, un efecto de UMBRAL, y en este código el umbral es mlim. Una ley
   que no lo mire pinta el 18" IGUAL o MÁS APAGADO que el 8".

   Medido con el Ethos de 13 mm (100°) sobre NGC 1664, sqm 21,5:
     VISAC 200L (200 mm, 1800 mm, 138x)   mlim 14,96   alfa 0,653
     Stargate 18" (458 mm, 2050 mm, 158x) mlim 16,24   alfa 0,764
   La rama de flujo daba 0,646 y 0,578: el 18" MÁS APAGADO que el 8".

   Se comprueba la ley ACTIVA por defecto. Si algún día el defecto cambia, esto
   tiene que seguir pasando: es el requisito, no la implementación.

   node scripts/test_alfa_apertura.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

// Para reproducir el fallo a mano: BITACORA_ALFA_FLUJO=1 node scripts/test_alfa_apertura.js
if (process.env.BITACORA_ALFA_FLUJO === '1') R.config.alfaPorFlujo = true;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) console.log('  ok    ' + etiqueta);
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

var AFOV = 100, SIZE = 720, POJO = 7, T = 0.85, SQM = 21.5, G = 7.46;

// D en mm, aumentos con el MISMO ocular (13 mm): focal/13.
var EQUIPOS = [
  { nombre: 'VISAC 200L', D: 200, M: Math.round(1800 / 13) },
  { nombre: 'Stargate 18"', D: 458, M: Math.round(2050 / 13) }
];

function medir(eq, sqm) {
  var arcmin = AFOV / eq.M * 60;
  var mlim = R.magLimite({
    apertura: eq.D, aumentos: eq.M, transmision: T, sqm: sqm, pupilaOjo: POJO
  });
  var o = {
    afov: AFOV, apertura: eq.D, arcmin: arcmin, size: SIZE, g: G,
    blur: R.blurEstrella(G, eq.D), mlim: mlim
  };
  var Rtot = R.radioEstrella(o);
  var dil = R.factorDilucion(R.sueloEstrella(o), Rtot);
  var rAs = Rtot * arcmin * 60 / SIZE;
  return {
    mlim: mlim, rAs: rAs,
    alfa: R.alfaEstrella(G, mlim, rAs, dil),
    luz: R.alfaEstrella(G, mlim, rAs, dil) * Math.PI * Rtot * Rtot   // px de lienzo
  };
}

var chico = medir(EQUIPOS[0], SQM), grande = medir(EQUIPOS[1], SQM);
console.log('g=' + G + ', sqm=' + SQM + ', Ethos 13mm:');
EQUIPOS.forEach(function (eq, i) {
  var m = i ? grande : chico;
  console.log('  ' + eq.nombre + ' (' + eq.D + 'mm, ' + eq.M + 'x): mlim=' + m.mlim.toFixed(2)
    + '  R=' + m.rAs.toFixed(2) + '"  alfa=' + m.alfa.toFixed(3) + '  luz=' + m.luz.toFixed(1));
});

/* I1 — la que se rompió: MÁS APERTURA, ESTRELLA MÁS BRILLANTE. El 458 recoge
   5,24x más luz (+1,80 mag) y llega 1,3 mag más hondo; el pico de la estrella
   no puede quedarse igual, y mucho menos bajar. */
ok(grande.alfa > chico.alfa * 1.05,
  'I1: el 18" pinta la estrella mas brillante que el 8" (' + chico.alfa.toFixed(3)
  + ' -> ' + grande.alfa.toFixed(3) + ')');

/* I2 — el segundo canal por el que la apertura entra en este render: el TAMAÑO
   (sueloEstrella lleva (D/Dref)²). Una ley que reparta el flujo sobre ese disco
   cancela el D² que el propio disco ya representa. */
ok(grande.luz > chico.luz,
  'I2: y tambien pinta mas luz total, no solo mas disco');

/* I3 — cielo mejor, estrella no más apagada. Vale que sea plana (una ley
   absoluta no depende del cielo); lo que no vale es que baje. */
var mejorCielo = medir(EQUIPOS[0], 22).alfa, peorCielo = medir(EQUIPOS[0], 19).alfa;
ok(mejorCielo >= peorCielo - 1e-9,
  'I3: con cielo mas oscuro la estrella no se apaga (' + peorCielo.toFixed(3)
  + ' -> ' + mejorCielo.toFixed(3) + ')');

console.log(fallos ? '\n' + fallos + ' FALLOS' : '\nTodo OK');
process.exit(fallos ? 1 : 0);
