#!/usr/bin/env node
/* La nebulosa planetaria entra en la capa difusa PS1 por la puerta del
   catálogo (prueba arquitectónica de la rama, banco: M57 / NGC 6720).

   La frontera medida en esta rama: el modelo intrínseco vive en la FILA de
   catálogo —gen_nebulosas.py construye cada nebulosa como modelo Sérsic n=1
   con r_e calibrado, «mismo esquema que las galaxias: las pinta la misma
   capa»— y la clase explícita del objeto decide QUÉ filas entran, no qué
   código corre: el pipeline de observación (quitar-estrellas, anclaje, PSF,
   rampa, H2c) es el mismo bit a bit. Lo específico de galaxia se apaga por
   dato (B/T=0 sin bulbo, polvo=0, sin n_S4G) y no por rama.

   Necesita los fixtures de scripts/fixtures/gaia y la caché de parches de
   lib_bajar_parche (primera corrida descarga de STScI).

   Uso:  node scripts/test_nebulosa_planetaria.js */
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

console.log('El catálogo de nebulosas declara la clase de cada objeto (columna 13):');
var m57 = fila(NEB, 'NGC6720');
ok(!!m57, 'NGC 6720 está en el catálogo');
ok(m57 && m57[12] === 'PN', 'NGC 6720 es de clase PN (m57[12] = ' + (m57 && m57[12]) + ')');
ok(m57 && !(m57[11] > 0), 'sin n de S4G: la columna 12 no es un índice medido');
var conClase = NEB.filter(function (f) { return typeof f[12] === 'string' && f[12]; });
ok(conClase.length === NEB.length, 'todas las filas llevan clase (' + conClase.length + '/' + NEB.length + ')');

console.log('ps1CatalogoDifuso: la clase decide qué filas entran, no qué código corre:');
ok(typeof R.ps1CatalogoDifuso === 'function', 'existe R.ps1CatalogoDifuso');
var cat = R.ps1CatalogoDifuso ? R.ps1CatalogoDifuso(GAL, NEB) : [];
// Clases abiertas hoy: PN (esta prueba), HII/EmN/RfN (validadas en
// test_nebulosas_emision_reflexion.js) y SNR (test_resto_supernova.js).
// Neb y Cl+N siguen cerradas.
var abiertas = ['PN', 'HII', 'EmN', 'RfN', 'SNR'];
ok(cat.length === GAL.length + NEB.filter(function (f) { return abiertas.indexOf(f[12]) >= 0; }).length,
  'catálogo difuso = galaxias + clases abiertas (' + cat.length + ' filas)');
ok(!!fila(cat, 'NGC6720'), 'M57 entra');
ok(!fila(cat, 'NGC1333'), 'una clase cerrada (Cl+N, NGC 1333) NO entra');
ok(!!fila(cat, 'NGC 5194'), 'M51 sigue entrando');
ok(R.ps1CatalogoDifuso && R.ps1CatalogoDifuso(GAL, null).length === GAL.length,
  'sin catálogo de nebulosas cargado, solo galaxias (robustez)');

console.log('El campo de M57 la encuentra con la criba de siempre:');
var campo = R.ps1GalaxiasDelCampo(cat, m57[2], m57[3], 20);
var gal = null;
for (var i = 0; i < campo.length; i++) if (campo[i].nombre === 'NGC6720') gal = campo[i];
ok(!!gal, 'ps1GalaxiasDelCampo devuelve NGC 6720');
ok(gal && gal.bt === 0 && gal.n === 1, 'modelo intrínseco de la fila: exponencial puro, sin bulbo');
ok(gal && !(gal.nMedido > 0), 'nMedido = 0: nada de S4G contamina la nebulosa');

if (!gal) { console.log('\nsin fila no hay parche: ' + fallos + ' fallos'); process.exit(1); }

console.log('M57 recorre el MISMO pipeline de observación (parche real):');
var estrellas = fs.readFileSync(path.join(__dirname, 'fixtures', 'gaia', 'gaia_ngc6720.csv'), 'utf8')
  .trim().split('\n').slice(1)
  .map(function (l) { var t = l.split(','); return [parseFloat(t[0]), parseFloat(t[1]), parseFloat(t[2])]; });

B.bajar(gal.ra, gal.dec, gal.ladoArcmin, PS1.salida).then(function (F) {
  var parche = P.montar(F, gal, estrellas, cat);
  ok(parche.escena.length >= 1, 'la escena difusa existe: ' + parche.escena.length + ' componente(s)');
  /* El borde de una planetaria es REAL, no isofotal: r_e = 0,60·semieje de
     catálogo (gen_nebulosas.py, compactas), así que el borde es r_e/0,60. La
     isofota μ=25 del ala exponencial (107″ en M57) NO es el objeto: una escena
     de 107″ conservaría todo el campo estelar dentro del parche. */
  var bordeAs = m57[4] / 0.60;
  ok(parche.escena.length === 1 && Math.abs(parche.escena[0].r25As - bordeAs) < 0.5,
    'la escena de una PN es su borde de catálogo (' + parche.escena[0].r25As.toFixed(1) +
    '″ ≈ ' + bordeAs.toFixed(1) + '″), no la isofota μ25 del ala (107″)');
  // Estrella central (V≈15,7, en Gaia): cae dentro de la escena y se CONSERVA
  // —es parte de la imagen de la nebulosa—, no se enmascara como estrella de campo.
  var central = null;
  for (var j = 0; j < estrellas.length; j++) {
    var d = Math.hypot((estrellas[j][0] - gal.ra) * Math.cos(gal.dec * Math.PI / 180),
                       estrellas[j][1] - gal.dec) * 3600;
    if (d < 3) central = estrellas[j];
  }
  ok(!!central, 'la estrella central está en la muestra de Gaia');
  ok(central && parche.enEscena.indexOf(central) >= 0,
    'la estrella central se conserva por escena (precedente: anillo oscuro de M104)');

  var st = { suma: 0, nan: 0, max: 0 };
  for (var k = 0; k < parche.datos.length; k++) {
    var v = parche.datos[k];
    if (v !== v) { st.nan++; continue; }
    st.suma += v; if (v > st.max) st.max = v;
  }
  ok(st.suma > 0, 'anclada a su mag V de catálogo: flujo integrado > 0');
  // Luz total ≈ 10^(-0,4·magV)·frac (frac ≈ 0,96 con n=1 y parche de 6·r_e):
  var areaPx = (gal.ladoArcmin * 60 / parche.ancho); areaPx *= areaPx;
  var magInt = -2.5 * Math.log10(st.suma * areaPx);
  ok(Math.abs(magInt - gal.magV) < 0.3, 'la luz integrada devuelve la mag V (' +
    magInt.toFixed(2) + ' vs ' + gal.magV + ')');
  ok(Math.abs(parche.thetaIntArcmin - 2 * bordeAs / 60) < 0.02,
    'θ intrínseco para H2c = diámetro del borde real, ' + parche.thetaIntArcmin.toFixed(2) +
    '′ (≈1,27′ de M57), no los 3,57′ de la isofota del ala');
  ok(R.ps1HaloActivo(parche.halo) === false, 'el halo extrapolado (ley de galaxias) queda cerrado');

  console.log('Y produce imagen por el mismo pintado (457 mm, 190x, SQM 21,2):');
  var cielo = { pupilaSalida: 457.2 / 190, pupilaOjo: 7, sqm: 21.2,
                aumentos: 190, realceMax: PS1.realceMax, perceptual: true };
  var o = { ra0: gal.ra, dec0: gal.dec, arcmin: 70 / 190 * 60, size: 720, cielo: cielo, apertura: 457.2 };
  var difuso = new Float32Array(720 * 720);
  R.ps1PintarParche(difuso, parche, o);
  var enc = 0, nanD = 0;
  for (var p = 0; p < difuso.length; p++) { if (difuso[p] > 0) enc++; if (difuso[p] !== difuso[p]) nanD++; }
  ok(enc > 500, 'hay nebulosa en el lienzo (' + enc + ' px con flujo)');
  ok(nanD === 0, 'ningún NaN llega al lienzo (' + nanD + ')');

  console.log('\n' + (fallos ? 'FALLOS: ' + fallos : 'todo en orden.'));
  process.exit(fallos ? 1 : 0);
}).catch(function (e) { console.error('ERROR: ' + (e && e.stack || e)); process.exit(2); });
