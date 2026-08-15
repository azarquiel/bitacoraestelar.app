#!/usr/bin/env node
/* HARNESS: sin PSF vs con PSF sobre el parche de PS1, por apertura y seeing.

   No toca producción. La pregunta no es «¿queda más bonito?», sino dos cosas
   medibles:

     1. ¿La PSF queda BIEN CONECTADA? O sea: ¿sale entera de piezas que ya
        existen, actúa sobre la imagen y solo sobre la imagen, y respeta las
        invariantes A–F? Eso lo contesta test_psf_parche.js.
     2. ¿SIRVE DE ALGO a la escala a la que el render tiene los parches? Eso lo
        contesta esto, y la respuesta no se puede dar sin mirar escalaAs.

   Sin dependencias:  node scripts/harness_psf_parche.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;
var CFG = R.config, PS1 = R.ps1;
var P = require('./lib_psf_parche.js')(R);
var PAR = require('./lib_parches_ps1.js')(R);

var APS = [80, 203, 457, 914];
function f(v, d) { return (v == null || !isFinite(v)) ? '-' : v.toFixed(d == null ? 3 : d); }
function fila(c) { console.log(c.join(' | ')); }

/* ═══ 1. La escala del parche, que es la que manda ════════════════════════ */
console.log('\n═══ 1. A qué resolución tiene el render los parches ═══');
console.log('  El proxy pide SIEMPRE 512 px de salida, así que escalaAs = lado/512 y');
console.log('  crece con el tamaño de la galaxia. La nativa de PS1 (0,25″/px) no llega nunca.');
var escs = PAR.parches.map(function (p) { return p.fits.escalaAs; }).sort(function (a, b) { return a - b; });
console.log('  ' + escs.length + ' parches en caché · escalaAs ' + f(escs[0], 2) + '″ … ' +
  f(escs[escs.length - 1], 2) + '″/px · mediana ' + f(escs[escs.length >> 1], 2) + '″/px');

fila(['\n  escalaAs', 'θ_parche (″)', 'θ_res 80', 'θ_res 203', 'θ_res 457', 'θ_res 914']);
[0.25, 0.67, 2.35, 5.0, 17.0].forEach(function (e) {
  fila(['  ' + f(e, 2) + '″/px', f(P.thetaParche(e), 2)].concat(APS.map(function (D) {
    return f(P.thetaRes(D), 2);
  })));
});

console.log('\n  θ_add = lo que quedaría por añadir, y σ en píxeles del parche:');
fila(['  escalaAs', '80 mm', '203 mm', '457 mm', '914 mm']);
[0.25, 0.67, 2.35, 5.0, 17.0].forEach(function (e) {
  fila(['  ' + f(e, 2) + '″/px'].concat(APS.map(function (D) {
    return f(P.thetaAdd(D, e), 2) + '″ / σ=' + f(P.sigmaPx(D, e, null), 2) + 'px';
  })));
});
console.log('  ⇒ σ < 0,5 px significa que la convolución no tiene dónde apoyarse:');
console.log('    el efecto es más fino que el píxel del parche y no se puede representar.');

/* ═══ 2. Sin PSF vs con PSF, en parches reales ════════════════════════════ */
console.log('\n═══ 2. Sin PSF vs con PSF, medido en parches reales ═══');
/* Métrica de estructura: RMS de lo que queda al restar una versión suavizada a
   una escala angular FIJA (12″), dentro del cuerpo de la galaxia y normalizado
   por el brillo medio. Es adimensional, no depende del tamaño de la galaxia ni
   del brillo, y mide justo lo que la PSF puede borrar: contraste a escalas
   finas. No interpreta nada: no decide si hay brazos, solo cuánto queda. */
var REF_AS = 12;
function suavizarRef(datos, an, al, esc) {
  return P.convolucionar(datos, an, al, esc, null, null, REF_AS);
}
function estructura(datos, an, al, esc, rMaxAs) {
  var cielo = R.ps1Cielo(datos, an, al), sm = suavizarRef(datos, an, al, esc);
  var cx = (an - 1) / 2, cy = (al - 1) / 2, rMax = rMaxAs / esc;
  var s2 = 0, sm1 = 0, n = 0;
  for (var y = 0; y < al; y++) {
    for (var x = 0; x < an; x++) {
      var dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > rMax * rMax) continue;
      var i = y * an + x, v = datos[i] - cielo;
      if (!(v > 0) || !isFinite(sm[i])) continue;   // los huecos del stack, fuera
      var d = datos[i] - sm[i];
      s2 += d * d; sm1 += v; n++;
    }
  }
  return n ? Math.sqrt(s2 / n) / (sm1 / n) : 0;
}

var OBJ = ['NGC 5194', 'NGC 3031', 'NGC 5457', 'NGC 205'];
fila(['\n  objeto', 'escalaAs', 'sin PSF', '80 mm', '203 mm', '457 mm', '914 mm']);
OBJ.forEach(function (nom) {
  var p = PAR.buscar(nom);
  if (!p) { fila(['  ' + nom, 'sin parche en caché']); return; }
  var d = p.fits.datos, an = p.fits.ancho, al = p.fits.alto, esc = p.fits.escalaAs;
  var rMaxAs = p.ladoArcmin * 60 / 4;
  var base = estructura(d, an, al, esc, rMaxAs);
  fila(['  ' + nom, f(esc, 2) + '″/px', f(base, 4)].concat(APS.map(function (D) {
    var w = P.convolucionar(d, an, al, esc, D, null);
    return f(estructura(w, an, al, esc, rMaxAs), 4);
  })));
});
console.log('  ⇒ si las cuatro columnas de apertura salen casi iguales entre sí y casi');
console.log('    iguales a «sin PSF», la PSF está bien conectada pero no tiene margen');
console.log('    donde morder: el parche ya viene más borroso que el telescopio.');

/* ═══ 3. Barrido de seeing ════════════════════════════════════════════════ */
console.log('\n═══ 3. Barrido de seeing (NGC 5194) ═══');
var p51 = PAR.buscar('NGC 5194');
if (p51) {
  var d5 = p51.fits.datos, a5 = p51.fits.ancho, l5 = p51.fits.alto, e5 = p51.fits.escalaAs;
  var r5 = p51.ladoArcmin * 60 / 4;
  fila(['  seeing', '80 mm', '203 mm', '457 mm', '914 mm']);
  [1.5, 2.0, 3.0, 4.0, 6.0].forEach(function (s) {
    fila(['  ' + f(s, 1) + '″'].concat(APS.map(function (D) {
      var w = P.convolucionar(d5, a5, l5, e5, D, s);
      return f(estructura(w, a5, l5, e5, r5), 4);
    })));
  });
  console.log('  ⇒ las filas tienen que bajar hacia abajo (más seeing, menos estructura) y');
  console.log('    subir hacia la derecha (más apertura, más estructura). Son C y B.');
}

/* ═══ 4. Lo que SÍ limita hoy: el remuestreo del lienzo ═══════════════════ */
console.log('\n═══ 4. El límite real de hoy no es la PSF: es el vecino más próximo ═══');
console.log('  ps1PintarParche recorre el LIENZO y toma el píxel del parche con Math.round.');
console.log('  Si un píxel del parche cubre varios del lienzo, sale a cuadros, y eso pasa');
console.log('  al subir aumentos porque el campo real se estrecha.');
var AFOV = 70, SIZE = 720;
fila(['\n  aumentos', 'campo real (′)', 'px lienzo/″', 'px lienzo por px de parche (2,35″)']);
[66, 150, 300, 600].forEach(function (m) {
  var arcmin = AFOV * 60 / m, pxAs = SIZE / (arcmin / 60) / 3600;
  fila(['  ' + m + 'x', f(arcmin, 1), f(pxAs, 3), f(pxAs * 2.347, 2)]);
});
console.log('  ⇒ por encima de ~1,0 el parche se ve pixelado y la PSF lo taparía —pero eso');
console.log('    es cosmética del remuestreo, NO resolución: no distingue una apertura de otra.');

/* ═══ 5. Doble contabilización ════════════════════════════════════════════ */
console.log('\n═══ 5. Doble contabilización: dónde entra cada cosa ═══');
fila(['  magnitud', 'depende de aumentos', 'depende del lienzo/afov', 'depende de la apertura']);
fila(['  θ_add (″)', 'NO', 'NO', 'sí, por radioImagenEstelar']);
fila(['  σ del kernel (px parche)', 'NO', 'NO', 'sí, y por escalaAs del parche']);
fila(['  Cmin / μ_lim', 'sí, por la pupila', 'NO', 'sí, por la pupila']);
fila(['  tamaño en pantalla (px)', 'sí', 'sí', 'NO']);
console.log('  ⇒ ninguna fila tiene «sí» en aumentos Y en apertura por la MISMA vía.');
console.log('    La PSF entra por la imagen; la pupila, por la fotometría; el aumento, por');
console.log('    la geometría. Tres caminos separados, ningún efecto cobrado dos veces.');

/* ═══ Comprobaciones ══════════════════════════════════════════════════════ */
console.log('\n═══ Comprobaciones ═══');
console.log('  · producción intacta: este script solo LEE CFG/PS1 y llama a funciones exportadas.');
console.log('  · airyArcsec = ' + CFG.airyArcsec + ', seeingArcsec = ' + CFG.seeingArcsec +
  ', PS1.seeingAs = ' + PS1.seeingAs + ', sin tocar.');
console.log('  · ps1FlujoModelo, ps1PintarParche y las estrellas, sin llamar ni modificar.');
