#!/usr/bin/env node
/* Test de la ORIENTACIÓN del campo: por qué la vista de Gaia y la placa del DSS
   no salen giradas igual (queja del observador: "el campo aparece levemente
   rotado en el render de Gaia respecto al render de DSS", 2026-08-03).

   1. El render de Gaia (resources/js/bitacora-gaia-render.js) proyecta
      EXACTAMENTE con el norte arriba y el este a la izquierda, sin giro: una
      estrella al norte del centro cae justo encima del centro (misma x), y una
      de RA mayor cae justo a su izquierda (misma y). Es la convención estándar
      y la misma que sirve hips2fits (PanSTARRS, projection=TAN).

   2. La placa del DSS SÍ viene girada, y no por un fallo nuestro: el servicio
      del ESO recorta un trozo de la placa Schmidt ORIGINAL y lo devuelve en el
      sistema de la placa, cuyos ejes se alinearon con el norte en el CENTRO DE
      LA PLACA (6,5° de lado), no en el del recorte. Entre los dos puntos los
      meridianos convergen, así que el norte del recorte queda girado
      ≈ -Δα·sen(δ) respecto al eje y de la placa. Se comprueba contra el
      CROTA2 que el propio FITS del ESO declara en cuatro campos reales.

   El giro del DSS depende del campo (0,2° a 1,9° en la muestra), así que NO se
   puede corregir con una constante; haría falta leer el CROTA2 de cada placa.
   Ver simulador_ocular/README.md, "Orientación del campo".

   Sin dependencias:  node scripts/test_orientacion_campo.js */
'use strict';

var gradientes;
function fakeCtx(el) {
  return new Proxy({}, {
    get: function (t, prop) {
      if (prop === 'canvas') return el;
      if (prop === 'createRadialGradient') return function (x0, y0, r0, x1, y1, r1) {
        var g = { x: x1, y: y1, stops: [] };
        g.addColorStop = function (pos, color) { g.stops.push([pos, color]); };
        gradientes.push(g);
        return g;
      };
      if (prop === 'createImageData') return function (w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; };
      if (prop === 'getImageData') return function (x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; };
      if (prop in t) return t[prop];
      return function () {};
    },
    set: function (t, prop, val) { t[prop] = val; return true; }
  });
}
global.window = {};
global.document = {
  createElement: function () {
    var el = { width: 720, height: 720 };
    el.getContext = function () { return fakeCtx(el); };
    return el;
  }
};
require('../resources/js/bitacora-gaia-color.js');
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function cerca(a, b, tol, etiqueta) {
  ok(Math.abs(a - b) <= tol, etiqueta + ' (' + a.toFixed(3) + ' vs ' + b.toFixed(3) + ', tol ' + tol + ')');
}

var SIZE = 720;
var TAM = 30;            // lado del campo, en minutos de arco
/* Núcleos de estrella que pinta dibujar(): el gradiente de 5 paradas de
   dibujarEstrellaColor (la aureola tiene 4; el glow no crea gradiente). */
function nucleos(estrellas, ra0, dec0) {
  gradientes = [];
  var el = { width: SIZE, height: SIZE };
  var ctx = fakeCtx(el);
  R.dibujar(ctx, estrellas, {
    ra: ra0, dec: dec0, arcmin: TAM, mlim: 12, afov: 82,
    apertura: 200, conGlow: false, carbono: false, arana: false
  });
  return gradientes.filter(function (g) { return g.stops.length === 5; });
}

console.log('1. El render de Gaia proyecta con el norte arriba y sin giro');
(function () {
  var ra0 = 322.95, dec0 = 48.448;              // M39, un campo bien al norte
  var d = 0.1;                                  // 6' de separación al centro
  // Una estrella justo al NORTE y otra justo al ESTE (RA mayor) del centro.
  var norte = [ra0, dec0 + d, 8, 0.5];
  var este  = [ra0 + d / Math.cos(dec0 * Math.PI / 180), dec0, 8, 0.5];
  var n = nucleos([norte], ra0, dec0);
  ok(n.length === 1, 'una estrella -> un núcleo (' + n.length + ')');
  // Sin giro, la estrella del norte conserva EXACTAMENTE la x del centro. Un
  // giro de 1° la desplazaría 6'·tan(1°) = 2,1 px con esta escala (24 px/'),
  // así que 0,01 px de tolerancia distingue de sobra "sin giro" de "1° de giro".
  cerca(n[0].x, SIZE / 2, 0.01, 'la estrella del norte no se desvía en x');
  ok(n[0].y < SIZE / 2 - 100, 'la estrella del norte queda ARRIBA (y=' + n[0].y.toFixed(1) + ')');

  var e = nucleos([este], ra0, dec0);
  cerca(e[0].y, SIZE / 2, 0.01, 'la estrella del este no se desvía en y');
  ok(e[0].x < SIZE / 2 - 100, 'la estrella del este queda a la IZQUIERDA (x=' + e[0].x.toFixed(1) + ')');

  // Y la escala es la misma en los dos ejes: el campo no sale estirado.
  var dxEste = SIZE / 2 - e[0].x, dyNorte = SIZE / 2 - n[0].y;
  cerca(dxEste, dyNorte, 0.01, 'misma escala en los dos ejes (sin cizalla)');
})();

console.log('2. El giro de la placa del DSS = convergencia de meridianos en la placa');
/* Medido de las cabeceras FITS reales del archivo del ESO
   (archive.eso.org/dss/dss/image, DSS1, 30'), 2026-08-03. Para cada campo:
   centro de la PLACA (PLTRAH/M/S + PLTDEC*), centro del RECORTE (CRVAL1/2) y
   el giro que el propio FITS declara (CROTA2). */
var PLACAS = [
  { nombre: 'M39 (placa E589)',  raPlaca: 324.3196, decPlaca: 48.6503, ra: 322.9506, dec: 48.4482, crota2: 1.373 },
  { nombre: 'M35 (placa E1278)', raPlaca: 93.2157,  decPlaca: 23.9703, ra: 92.2250,  dec: 24.3331, crota2: 0.228 },
  { nombre: 'M13 (placa E1069)', raPlaca: 253.2996, decPlaca: 35.7593, ra: 250.4208, dec: 36.4601, crota2: 1.910 },
  { nombre: 'M42 (placa J8979)', raPlaca: 85.6164,  decPlaca: -4.9772, ra: 83.8209,  dec: -5.3912, crota2: -0.161 }
];
// Giro del norte entre dos puntos de la misma proyección tangente: los
// meridianos convergen hacia el polo, así que un recorte desplazado Δα del
// centro de la placa ve el norte girado ≈ -Δα·sen(δ).
function giroPorConvergencia(p) {
  var dra = (((p.ra - p.raPlaca + 540) % 360) - 180);
  return -dra * Math.sin(p.dec * Math.PI / 180);
}
PLACAS.forEach(function (p) {
  // 0,4° de tolerancia: la convergencia explica el grueso del giro (y siempre su
  // signo), y el resto —hasta 0,35° en la muestra— es la inclinación propia con
  // que se expuso cada placa, que ni se predice ni hace falta para el
  // diagnóstico.
  cerca(giroPorConvergencia(p), p.crota2, 0.4, p.nombre + ': el modelo explica su CROTA2');
  ok(giroPorConvergencia(p) * p.crota2 > 0, p.nombre + ': mismo signo de giro que el FITS');
});
// El giro NO es una constante que se pueda descontar de una vez: cambia de
// campo en campo (y de signo), porque depende de dónde cayó el objeto dentro
// de su placa y de la declinación.
var giros = PLACAS.map(function (p) { return p.crota2; });
ok(Math.max.apply(null, giros) - Math.min.apply(null, giros) > 1.5,
  'el giro del DSS varía > 1,5° entre campos: no es una constante corregible');

console.log('3. La rejilla de SkyView cae donde la pone la proyección de Gaia');
/* SkyView (skyview.gsfc.nasa.gov) sirve LAS MISMAS placas del DSS, pero
   remuestreadas sobre una rejilla que se le pide (projection=Tan). Cabeceras
   reales de dos campos, pedidas con los mismos parámetros que arma
   dss_url(..., 'skyview'), 2026-08-03: ni CROTA ni matriz CD, solo CDELT, y el
   centro exacto en el píxel central. Eso es norte arriba y este a la izquierda,
   sin giro; el CROTA2 del mismo campo en el ESO era +1,910° (M13). */
var SKYVIEW = {
  ctype: ['RA---TAN', 'DEC--TAN'],
  cdelt1: -0.0008333333333333333,   // negativo = RA crece hacia la IZQUIERDA
  cdelt2: 0.0008333333333333333,
  crpix: 300.5, lado: 600           // 600 px de 3" = 0,5°, el mismo campo que TAM
};
(function () {
  var s = SKYVIEW;
  ok(s.ctype[0] === 'RA---TAN' && s.ctype[1] === 'DEC--TAN', 'proyección tangente, como la de Gaia');
  ok(s.cdelt1 < 0, 'CDELT1 negativo: el este cae a la izquierda');
  ok(s.cdelt2 > 0, 'CDELT2 positivo: el norte cae arriba');
  cerca(Math.abs(s.cdelt1), s.cdelt2, 1e-12, 'misma escala en los dos ejes');

  /* La prueba de verdad: la MISMA estrella, colocada por los dos caminos
     independientes —la rejilla que pide el proxy y la proyección que dibuja el
     render de Gaia—, tiene que caer en el mismo sitio del campo. Se compara la
     distancia al centro en fracción del lado, que es lo único que comparten
     (600 px de SkyView contra 720 del lienzo). */
  var ra0 = 322.95, dec0 = 48.448, d = 0.1;
  function fraccionSkyview(dra, ddec) {       // dra ya en grados de arco (este +)
    return {
      x: ((s.crpix + dra / s.cdelt1) - s.crpix) / s.lado,
      y: ((s.crpix + ddec / s.cdelt2) - s.crpix) / s.lado
    };
  }
  var n = nucleos([[ra0, dec0 + d, 8, 0.5]], ra0, dec0);
  var e = nucleos([[ra0 + d / Math.cos(dec0 * Math.PI / 180), dec0, 8, 0.5]], ra0, dec0);
  var fN = fraccionSkyview(0, d), fE = fraccionSkyview(d, 0);
  // En el lienzo la y crece hacia abajo; en la rejilla FITS, hacia arriba.
  cerca((SIZE / 2 - n[0].y) / SIZE, fN.y, 1e-6, 'la estrella del norte, a la misma altura en las dos rejillas');
  cerca((e[0].x - SIZE / 2) / SIZE, fE.x, 1e-6, 'la estrella del este, en la misma columna en las dos rejillas');
  ok(fE.x < 0 && fN.y > 0, 'este a la izquierda y norte arriba en SkyView');
})();

if (fallos) { console.log('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nTodo verde.');
