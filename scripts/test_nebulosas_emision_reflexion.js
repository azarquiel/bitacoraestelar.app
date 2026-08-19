#!/usr/bin/env node
/* Apertura de las clases HII/EmN/RfN en la capa difusa PS1 (ADR 0013: abrir
   una clase = validarla como se validó la PN, no tocar el render).

   Bancos: M78 (NGC2068, reflexión) y NGC7635 (Burbuja, emisión compacta).
   Estrés sin veredicto duro: NGC7000 (Norteamérica, 2° recortados a 20′) —
   sus métricas se imprimen y el juicio es de las vistas.

   Qué fija:
   - la clase decide qué filas entran (ps1CatalogoDifuso), no qué código corre;
   - emisión/reflexión NO son compactas: sin borde real, su escena y su θint
     siguen la isofota μ25 del modelo, como las galaxias (la cáscara con borde
     es física de planetaria, no de estas);
   - el pipeline de observación es el mismo: anclaje a la mag V con la
     fracción de luz del parche, PSF, rampa, sin NaN al lienzo.

   Necesita fixtures de scripts/fixtures/gaia y la caché de lib_bajar_parche.
   Uso:  node scripts/test_nebulosas_emision_reflexion.js */
'use strict';

var fs = require('fs'), path = require('path');
var RAIZ = path.join(__dirname, '..');
global.window = {};
require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'nebulosas-datos.js'));
var R = global.window.BitacoraGaiaRender, PS1 = R.ps1;
var GAL = global.window.BITACORA_GALAXIAS, NEB = global.window.BITACORA_NEBULOSAS;
var B = require('./lib_bajar_parche.js')(R);
var P = require('./lib_parche_produccion.js')(R);

var fallos = 0;
function ok(c, t) { console.log('  ' + (c ? 'ok  ' : 'FALLO') + '  ' + t); if (!c) fallos++; }
function fila(arr, n) { for (var i = 0; i < arr.length; i++) if (arr[i][0] === n) return arr[i]; return null; }
function leerGaia(f) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', 'gaia', f), 'utf8')
    .trim().split('\n').slice(1)
    .map(function (l) { var t = l.split(','); return [parseFloat(t[0]), parseFloat(t[1]), parseFloat(t[2])]; });
}

console.log('Las clases de emisión y reflexión entran por la puerta del catálogo:');
var cat = R.ps1CatalogoDifuso(GAL, NEB);
var abiertas = ['PN', 'HII', 'EmN', 'RfN', 'SNR'];
var esperadas = GAL.length + NEB.filter(function (f) { return abiertas.indexOf(f[12]) >= 0; }).length;
ok(cat.length === esperadas, 'catálogo difuso = galaxias + clases abiertas (' +
  cat.length + '/' + esperadas + ' filas)');
ok(!!fila(cat, 'NGC2068'), 'M78 (reflexión) entra');
ok(!!fila(cat, 'NGC7635'), 'la Burbuja (HII) entra');
ok(!fila(cat, 'NGC1333') || NEB.filter(function (f) { return f[0] === 'NGC1333'; })[0][12] !== 'Neb',
  'las clases no abiertas (Neb, Cl+N) siguen fuera');
ok(!fila(cat, 'IC1805') === (fila(NEB, 'IC1805')[12] === 'Cl+N'), 'coherencia Cl+N (IC1805)');

console.log('Sin borde real: emisión/reflexión siguen la isofota, como las galaxias:');
var campo78 = R.ps1GalaxiasDelCampo(cat, fila(NEB, 'NGC2068')[2], fila(NEB, 'NGC2068')[3], 20);
var m78 = null;
for (var i = 0; i < campo78.length; i++) if (campo78[i].nombre === 'NGC2068') m78 = campo78[i];
ok(!!m78 && m78.clase === 'RfN', 'la fila mapeada lleva su clase (RfN)');
ok(m78 && R.ps1RadioBordeAs(m78) === 0, 'ps1RadioBordeAs = 0: el borde real es de planetarias');
var comps78 = R.ps1ComponentesSersic(m78);
ok(m78 && R.ps1ThetaIntDeGal(m78, comps78) === R.ps1ThetaIntArcmin(comps78, m78.ba),
  'θint por la vía isofotal de siempre');

function pipeline(nombre, csv, etiqueta) {
  var f = fila(NEB, nombre);
  var campo = R.ps1GalaxiasDelCampo(cat, f[2], f[3], 20);
  var gal = null;
  for (var i = 0; i < campo.length; i++) if (campo[i].nombre === nombre) gal = campo[i];
  if (!gal) { ok(false, nombre + ' no aparece en su propio campo'); return Promise.resolve(); }
  return B.bajar(gal.ra, gal.dec, gal.ladoArcmin, PS1.salida).then(function (F) {
    var parche = P.montar(F, gal, leerGaia(csv), cat);
    var suma = 0, nan = 0;
    for (var k = 0; k < parche.datos.length; k++) {
      var v = parche.datos[k];
      if (v !== v) nan++; else suma += v;
    }
    var areaPx = (gal.ladoArcmin * 60 / parche.ancho); areaPx *= areaPx;
    var frac = Math.max(R.ps1FraccionLuz(gal.n, (gal.ladoArcmin * 60 / 2) / gal.reArcsec), 0.02);
    var magEsperada = gal.magV - 2.5 * Math.log10(frac);
    var magInt = -2.5 * Math.log10(suma * areaPx);
    var cielo = { pupilaSalida: 457.2 / 190, pupilaOjo: 7, sqm: 21.2,
                  aumentos: 190, realceMax: PS1.realceMax, perceptual: true };
    var o = { ra0: gal.ra, dec0: gal.dec, arcmin: 70 / 190 * 60, size: 720, cielo: cielo, apertura: 457.2 };
    var difuso = new Float32Array(720 * 720);
    R.ps1PintarParche(difuso, parche, o);
    var enc = 0, nanD = 0;
    for (var p = 0; p < difuso.length; p++) { if (difuso[p] > 0) enc++; if (difuso[p] !== difuso[p]) nanD++; }
    console.log(etiqueta + ' (' + nombre + ', parche real):');
    if (etiqueta.indexOf('estrés') < 0) {
      ok(suma > 0, 'flujo integrado > 0');
      ok(Math.abs(magInt - magEsperada) < 0.3, 'la luz integrada devuelve la mag V con su fracción (' +
        magInt.toFixed(2) + ' vs ' + magEsperada.toFixed(2) + ')');
      ok(parche.escena.length >= 1, 'escena isofotal presente (' + parche.escena.length + ' componente(s))');
      ok(enc > 200, 'hay nebulosa en el lienzo (' + enc + ' px)');
      ok(nanD === 0, 'ningún NaN llega al lienzo');
    } else {
      ok(nanD === 0, 'ni el caso extremo mete NaN en el lienzo');
      console.log('  info  mag integrada ' + magInt.toFixed(2) + ' (esperada ' + magEsperada.toFixed(2) +
        ') · NaN del parche ' + (100 * nan / parche.datos.length).toFixed(1) + '% · px encendidos ' + enc);
    }
  });
}

console.log('Puerta de tamaño: si el recorte máximo no contiene el objeto, no se finge:');
/* Medido con NGC 7000 (Norteamérica, semieje ~1,4°): pasaba el corte de
   fracción de luz (0,41) y salía un cuadrado de campo estelar anclado a
   mag 4,3 sin nebulosa — el mismo fenómeno que dejó fuera a M31/IC342/M33,
   pero el corte de fracción no lo cazaba. Las clases extensas exigen además
   lado SIN recorte. Las compactas (PN) no: su borde es real y cabe. */
ok(R.ps1CabeEnParche(fila(NEB, 'NGC7000')) === false, 'NGC 7000 (lado recortado) queda fuera');
ok(R.ps1CabeEnParche(fila(NEB, 'NGC1499')) === false, 'la California también');
ok(R.ps1CabeEnParche(fila(NEB, 'NGC6888')) === true, 'NGC 6888 (12,7′ sin recorte) se queda');
ok(R.ps1CabeEnParche(fila(NEB, 'NGC2068')) === true, 'M78 se queda');
ok(R.ps1CabeEnParche(fila(NEB, 'NGC6720')) === true, 'la puerta no toca a las planetarias');
var campo7000 = R.ps1GalaxiasDelCampo(cat, fila(NEB, 'NGC7000')[2], fila(NEB, 'NGC7000')[3], 20);
var esta7000 = false;
for (var c7 = 0; c7 < campo7000.length; c7++) if (campo7000[c7].nombre === 'NGC7000') esta7000 = true;
ok(!esta7000, 'y su campo no la monta (el aviso de «mayor que el recorte» la explica)');

pipeline('NGC2068', 'gaia_ngc2068.csv', 'Reflexión')
  .then(function () { return pipeline('NGC7635', 'gaia_ngc7635.csv', 'Emisión'); })
  .then(function () { return pipeline('NGC6888', 'gaia_ngc6888.csv', 'Emisión filamentosa'); })
  .then(function () {
    console.log('\n' + (fallos ? 'FALLOS: ' + fallos : 'todo en orden.'));
    process.exit(fallos ? 1 : 0);
  })
  .catch(function (e) { console.error('ERROR: ' + (e && e.stack || e)); process.exit(2); });
