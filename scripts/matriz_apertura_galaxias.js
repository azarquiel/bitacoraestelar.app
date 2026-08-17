#!/usr/bin/env node
/* MATRIZ DE APERTURA de la capa de galaxias (no es un test: es una MEDIDA).

   Responde a una sola pregunta: al pasar de 8″ a 18″, ¿qué cambia y con qué
   signo? Se mide sobre el render de verdad —ps1PintarParche sobre un lienzo,
   con el perfil del catálogo como fuente— en cuatro casos:

     A  8″  a 150x            C  8″  a pupila 2,5 mm  (81x)
     B  18″ a 150x            D  18″ a pupila 2,5 mm (183x)

   A→B aísla la apertura a igual aumento; C→D la aísla a igual pupila de salida,
   donde el brillo superficial que llega al ojo es idéntico por física y lo único
   que puede cambiar es el umbral por tamaño aparente.

   El presupuesto fotométrico (la luz total que el modelo reparte, antes de
   cualquier óptica) se mide aparte: no debe moverse en ningún caso.

   Sin dependencias:  node scripts/matriz_apertura_galaxias.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

var SQM = 21.3, T = 0.82, POJO = 7;
var SIZE = 200;

/* Dos galaxias de brillo superficial bien distinto: una de disco brillante y
   una de brillo bajo, que es donde el umbral decide. Los números son del orden
   de los del catálogo, no la fila exacta: lo que se mide son diferencias entre
   columnas, y esas no dependen de afinar magV. */
var GALAXIAS = [
  { nombre: 'M81  (brillo alto)', magV: 6.94, reArcsec: 200, n: 3, ba: 0.52, pa: 157, bt: 0.35 },
  { nombre: 'M101 (brillo bajo)', magV: 7.86, reArcsec: 330, n: 1, ba: 0.98, pa: 30,  bt: 0.05 }
];

var CASOS = [
  { id: 'A', etiqueta: '8″  150x', D: 203, MAG: 150 },
  { id: 'B', etiqueta: '18″ 150x', D: 457, MAG: 150 },
  { id: 'C', etiqueta: '8″  81x (pup 2,5)',  D: 203, MAG: 203 / 2.5 },
  { id: 'D', etiqueta: '18″ 183x (pup 2,5)', D: 457, MAG: 457 / 2.5 }
];

function cieloDe(caso) {
  return { sqm: SQM, transmision: T, pupilaOjo: POJO, aumentos: caso.MAG,
           pupilaSalida: caso.D / caso.MAG, perceptual: true, realceMax: R.ps1.realceMax };
}

/* Campo real del caso: a más aumentos, menos campo. Así el render de cada
   columna es el que de verdad vería ese equipo, y los píxeles sobre cielo son
   comparables como fracción del lienzo. */
function arcminDe(caso) { return 70 * 60 / caso.MAG; }

/* Parche sintético en las unidades que deja ps1AnclarACatalogo (flujo por
   arcsec²): el propio perfil del catálogo muestreado. No es una imagen de PS1,
   pero entra por la MISMA puerta que ella, que es lo que aquí se mide: sin
   parche, una galaxia que no abre la puerta del halo no pinta un solo píxel y
   la columna se queda vacía. */
var PARCHE_PX = 96;
function parcheSintetico(gal, ladoArcmin) {
  var comps = R.ps1ComponentesSersic(gal);
  var escalaAs = ladoArcmin * 60 / PARCHE_PX;
  var datos = new Float32Array(PARCHE_PX * PARCHE_PX);
  for (var y = 0; y < PARCHE_PX; y++) {
    var norte = ((PARCHE_PX - 1) / 2 - y) * escalaAs;
    for (var x = 0; x < PARCHE_PX; x++) {
      var este = ((PARCHE_PX - 1) / 2 - x) * escalaAs;
      datos[y * PARCHE_PX + x] = R.ps1FlujoModelo(comps, gal.pa, norte, este);
    }
  }
  return datos;
}

/* Un render completo de la galaxia sobre el lienzo, por la cadena real.
   `campoFijo` fuerza el mismo campo real en los cuatro casos: sin él, C y D ven
   campos distintos (81x contra 183x) y el recuento de píxeles mezcla el tamaño
   en pantalla con el umbral. Con él, lo único que puede mover el recuento es el
   umbral, que es lo que se quiere medir. */
function render(gal, caso, campoFijo) {
  var comps = R.ps1ComponentesSersic(gal);
  var medidas = R.ps1MedidasHalo(gal, comps);
  var cielo = cieloDe(caso);
  var arcmin = campoFijo || arcminDe(caso);
  var ladoParche = Math.min(20, gal.reArcsec * 6 / 60);
  var lienzo = new Float32Array(SIZE * SIZE);
  R.ps1PintarParche(lienzo, {
    datos: parcheSintetico(gal, ladoParche), ancho: PARCHE_PX, alto: PARCHE_PX,
    ladoArcmin: ladoParche,
    ra: 10, dec: 41, comps: comps, pa: gal.pa, halo: medidas
  }, { ra0: 10, dec0: 41, arcmin: arcmin, size: SIZE, cielo: cielo });

  var c = R.ctxFotometrico(cielo);
  var sobre = 0, flujo = 0, marcados = 0;
  for (var i = 0; i < lienzo.length; i++) {
    if (lienzo[i] > 0) { sobre++; flujo += lienzo[i]; }
    if (R.difusoMarcado(cielo.difusoMask, i)) marcados++;
  }
  var umbral = R.sbUmbralContraste(c);
  return {
    pupila: caso.D / caso.MAG, Cmin: c.Cmin, Fcielo: c.Fcielo, SBe: c.SBe,
    umbral: umbral,
    d220: umbral - 22.0, d235: umbral - 23.5,
    op220: R.ps1Opacidad(22.0, umbral), op235: R.ps1Opacidad(23.5, umbral),
    sobre: sobre, fracSobre: sobre / lienzo.length, flujo: flujo, marcados: marcados,
    haloActivo: R.ps1HaloActivo(medidas)
  };
}

/* Presupuesto fotométrico: la luz que ps1AnclarACatalogo reparte por el parche.
   Es lo ÚNICO que fija cuánta luz tiene la galaxia, va antes de toda óptica y no
   lo toca ninguna apertura. Se compara el flujo integrado del parche anclado con
   el que manda el catálogo. Si esto se mueve, el cambio ha tocado la fotometría
   y no solo la visibilidad. */
function presupuesto(gal) {
  var lado = Math.min(20, gal.reArcsec * 6 / 60);
  var escalaAs = lado * 60 / PARCHE_PX;
  // Cuentas crudas (DN): el parche tal como llega, sin anclar. Se le suma un
  // pedestal de cielo para que ps1AnclarACatalogo tenga algo que restar.
  var comps = R.ps1ComponentesSersic(gal);
  var crudo = new Float32Array(PARCHE_PX * PARCHE_PX), i;
  var base = parcheSintetico(gal, lado);
  for (i = 0; i < crudo.length; i++) crudo[i] = 1000 + base[i] * 1e9;
  var neto = R.ps1AnclarACatalogo(crudo, PARCHE_PX, PARCHE_PX, {
    magV: gal.magV, n: gal.n, reArcsec: gal.reArcsec, ladoArcmin: lado, escalaAs: escalaAs
  });
  var suma = 0;
  for (i = 0; i < neto.length; i++) suma += neto[i];
  var radioEnRe = (lado * 60 / 2) / gal.reArcsec;
  return {
    integrado: suma * escalaAs * escalaAs,
    esperado: Math.pow(10, -0.4 * gal.magV) * Math.max(R.ps1FraccionLuz(gal.n, radioEnRe), 0.02)
  };
}

function fmt(v) {
  if (v == null) return '-';
  if (typeof v === 'boolean') return v ? 'sí' : 'no';
  if (typeof v !== 'number') return String(v);
  if (v !== 0 && Math.abs(v) < 1e-3) return v.toExponential(3);
  return v.toFixed(4);
}

var FILAS = [
  ['pupila salida (mm)', 'pupila'],
  ['Cmin', 'Cmin'],
  ['Fcielo', 'Fcielo'],
  ['SBe (cielo al ojo)', 'SBe'],
  ['μ umbral de detección', 'umbral'],
  ['Δ para μ=22,0', 'd220'],
  ['opacidad μ=22,0', 'op220'],
  ['Δ para μ=23,5', 'd235'],
  ['opacidad μ=23,5', 'op235'],
  ['píxeles sobre cielo (campo real)', 'sobre'],
  ['fracción del lienzo', 'fracSobre'],
  ['flujo total pintado', 'flujo'],
  ['píxeles sobre cielo (campo FIJO 30′)', 'sobreFijo'],
  ['flujo pintado (campo FIJO 30′)', 'flujoFijo'],
  ['píxeles marcados', 'marcados'],
  ['puerta de halo', 'haloActivo']
];
var CAMPO_FIJO = 30;

GALAXIAS.forEach(function (gal) {
  var res = CASOS.map(function (caso) {
    var r = render(gal, caso), f = render(gal, caso, CAMPO_FIJO);
    r.sobreFijo = f.sobre; r.flujoFijo = f.flujo;
    return r;
  });
  console.log('\n═══ ' + gal.nombre + ' ═══');
  console.log(['magnitud'].concat(CASOS.map(function (c) { return c.id + ' ' + c.etiqueta; }))
    .concat(['B/A', 'D/C']).join(' | '));
  FILAS.forEach(function (f) {
    var v = res.map(function (r) { return r[f[1]]; });
    function ratio(x, y) {
      return (typeof x === 'number' && typeof y === 'number' && y !== 0) ? (x / y).toFixed(3) : '-';
    }
    console.log([f[0]].concat(v.map(fmt)).concat([ratio(v[1], v[0]), ratio(v[3], v[2])]).join(' | '));
  });
  var p = presupuesto(gal);
  console.log('presupuesto fotométrico: integrado ' + p.integrado.toExponential(6) +
    ' · catálogo ' + p.esperado.toExponential(6) +
    ' · desvío ' + ((p.integrado / p.esperado - 1) * 100).toFixed(4) + ' %' +
    '   (no depende del caso: ninguna apertura entra aquí)');
});

/* Cuánto se mueve el Δ al cambiar de ley, que es lo que decide si deltaPlena
   necesita recalibrarse (segunda iteración, no esta). */
console.log('\n═══ Cuánto cambia Δ al pasar de la ley vieja (SBe) a la nueva (umbral) ═══');
console.log('caso | Δ viejo (SBe−μ) | Δ nuevo (umbral−μ) | diferencia   [μ = 22,0]');
CASOS.forEach(function (caso) {
  var c = R.ctxFotometrico(cieloDe(caso));
  var viejo = c.SBe - 22.0, nuevo = R.sbUmbralContraste(c) - 22.0;
  console.log([caso.id + ' ' + caso.etiqueta, viejo.toFixed(3), nuevo.toFixed(3),
    (nuevo - viejo).toFixed(3)].join(' | '));
});
