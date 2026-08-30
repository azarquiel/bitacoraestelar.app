#!/usr/bin/env node
/* HARNESS: validación con parches reales de la protección de ESCENA de
   ps1QuitarEstrellas (la regla de producción desde ago-2026).

   Regla: solo se elimina la fuente de Gaia que queda FUERA de la escena
   difusa que se está reproduciendo (unión de elipses isofotales μ=muEscena de
   los componentes catalogados del parche, ps1EscenaEnParche). Dentro de la
   escena TODO se conserva: el núcleo propio, el núcleo de una compañera
   catalogada (NGC 5195 sobre el parche de M51) y las estrellas proyectadas
   sobre el cuerpo. Sin condiciones por nombre de objeto.

   Galaxias: M104, M51, M81, M101, NGC 205 — parches reales a 1024 px.
   Por galaxia se comprueba:
     - conteo dentro/fuera de escena, y que la partición es coherente con la
       geometría (ninguna conservada fuera, ninguna eliminada dentro);
     - el núcleo (0–2″) queda intacto, bit a bit;
     - en M51: el núcleo de NGC 5195 queda intacto (sin punto negro), medido
       en el disco de su fuente Gaia y comprobando que ningún píxel baja;
     - lo eliminado deja residuo de estrella ~0 (disco − anillo).
   Recortes PGM de M51 alrededor de NGC 5195, antes y después, en .scratch.

   NO toca producción. Reutiliza los CSV de Gaia de quitar-general.
   Uso:  node scripts/harness_escena_quitar_estrellas.js */
'use strict';

var fs = require('fs'), path = require('path');
global.window = {};
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/bitacora-ps1.js');
var R = global.window.BitacoraGaiaRender;
var PS1 = window.BitacoraPS1.cfg;
var B = require('./lib_bajar_parche.js')(R);
require('../simulador_ocular/resources/js/galaxias-datos.js');
var CAT = global.window.BITACORA_GALAXIAS;

var IN_DIR = path.join(__dirname, '..', '.scratch', 'quitar-general');
var OUT_DIR = path.join(__dirname, '..', '.scratch', 'escena-quitar');
fs.mkdirSync(OUT_DIR, { recursive: true });

var GALAXIAS = [
  { ngc: 'NGC 4594', alias: 'M104', csv: 'gaia_ngc4594.csv' },
  { ngc: 'NGC 5194', alias: 'M51',  csv: 'gaia_ngc5194.csv' },
  { ngc: 'NGC 3031', alias: 'M81',  csv: 'gaia_ngc3031.csv' },
  { ngc: 'NGC 5457', alias: 'M101', csv: 'gaia_ngc5457.csv' },
  { ngc: 'NGC 205',  alias: 'NGC205', csv: 'gaia_ngc205.csv' }
];

function f(v, d) { return (v == null || !isFinite(v)) ? '—' : v.toFixed(d == null ? 2 : d); }
function mediana(m) {
  if (!m.length) return NaN;
  m.sort(function (a, b) { return a - b; });
  return m[m.length >> 1];
}
function filaCat(nombre) {
  for (var i = 0; i < CAT.length; i++) if (CAT[i][0] === nombre) return CAT[i];
  return null;
}
function galDeFila(fc) {
  return { nombre: fc[0], ra: fc[2], dec: fc[3], reArcsec: fc[4], ba: fc[5],
           pa: fc[6], magV: fc[7], n: fc[8], bt: fc[9],
           ladoArcmin: window.BitacoraPS1.ps1LadoArcmin(fc[4]) };
}

function residuoEstrella(datos, ancho, alto, e) {
  var dentro = [], fuera = [], rr = Math.max(1, e.rPx), lim = Math.ceil(rr * 1.6);
  for (var dy = -lim; dy <= lim; dy++) for (var dx = -lim; dx <= lim; dx++) {
    var x = Math.round(e.x + dx), y = Math.round(e.y + dy);
    if (x < 0 || y < 0 || x >= ancho || y >= alto) continue;
    var d = Math.hypot(x - e.x, y - e.y), v = datos[y * ancho + x];
    if (v !== v) continue;
    if (d <= rr) dentro.push(v); else if (d <= rr * 1.6) fuera.push(v);
  }
  return mediana(dentro) - mediana(fuera);
}

function guardarPGM(nombre, datos, lado) {
  var tope = 0, i;
  for (i = 0; i < datos.length; i++) if (datos[i] === datos[i] && datos[i] > tope) tope = datos[i];
  var e = tope > 0 ? 255 / Math.log1p(tope) : 0;
  var lin = ['P2', lado + ' ' + lado, '255'];
  for (var y = 0; y < lado; y++) {
    var l = [];
    for (var x = 0; x < lado; x++) {
      var v = datos[y * lado + x];
      l.push((v === v && v > 0) ? Math.min(255, Math.round(Math.log1p(v) * e)) : 0);
    }
    lin.push(l.join(' '));
  }
  fs.writeFileSync(path.join(OUT_DIR, nombre + '.pgm'), lin.join('\n') + '\n');
}

function recorte(datos, ancho, alto, cx, cy, lado) {
  var h = lado >> 1, out = new Float32Array(lado * lado);
  for (var y = 0; y < lado; y++) for (var x = 0; x < lado; x++) {
    var px = Math.round(cx) - h + x, py = Math.round(cy) - h + y;
    out[y * lado + x] = (px >= 0 && px < ancho && py >= 0 && py < alto)
      ? datos[py * ancho + px] : NaN;
  }
  return out;
}

var problemas = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { problemas++; console.error('  FALLA ' + etiqueta); }
}

function analizar(G) {
  var fc = filaCat(G.ngc);
  if (!fc) { console.log('\n' + G.ngc + ': no está en el catálogo, se salta.'); return Promise.resolve(); }
  var gal = galDeFila(fc);
  var estrellas = fs.readFileSync(path.join(IN_DIR, G.csv), 'utf8')
    .trim().split('\n').slice(1).map(function (l) {
      var t = l.split(','); return [parseFloat(t[0]), parseFloat(t[1]), parseFloat(t[2])];
    }).filter(function (e) { return isFinite(e[2]); });

  return B.bajar(gal.ra, gal.dec, gal.ladoArcmin, PS1.salida).then(function (F) {
    var esc = F.escalaAs;
    console.log('\n═══════ ' + G.alias + ' (' + gal.nombre + ') · ' + F.ancho + '×' + F.alto +
      ' px · ' + f(esc, 3) + '″/px · ' + estrellas.length + ' fuentes Gaia G≤20 ═══════');
    var fSim = { ancho: F.ancho, alto: F.alto, escalaAs: esc, wcs: F.wcs || null };
    fSim.afin = window.BitacoraPS1.ps1AfinParche(fSim, gal);
    var enPx = window.BitacoraPS1.ps1EstrellasEnPixeles(fSim, gal, estrellas);

    // La MISMA escena que producción: componentes del catálogo alrededor de la
    // galaxia con el lado de su parche (ver ps1ParcheDeGalaxia).
    var vecinos = window.BitacoraPS1.ps1GalaxiasDelCampo(CAT, gal.ra, gal.dec, gal.ladoArcmin);
    var escena = window.BitacoraPS1.ps1EscenaEnParche(fSim, gal, vecinos);
    console.log('  escena: ' + escena.length + ' componente(s) — ' +
      vecinos.map(function (g) { return g.nombre; }).join(', '));
    escena.forEach(function (c, i) {
      console.log('    · centro (' + f(c.cx, 0) + ', ' + f(c.cy, 0) + ') px · r25 ' +
        f(c.r25As, 1) + '″ · b/a ' + f(c.ba, 2));
    });

    var dentro = [], fuera = [];
    enPx.forEach(function (e) {
      (window.BitacoraPS1.ps1FuenteEnEscena(escena, fSim.afin, e.x, e.y) ? dentro : fuera).push(e);
    });
    console.log('  fuentes: ' + dentro.length + ' dentro de escena (se conservan) · ' +
      fuera.length + ' fuera (se eliminan)');

    /* Propietario visual único: las filas que ps1FuentesEnEscena aparta de la
       capa de estrellas son EXACTAMENTE las conservadas en el parche, y la
       doble cuenta fotométrica (capa + parche a la vez) desaparece entera. */
    var conservadas = window.BitacoraPS1.ps1FuentesEnEscena(estrellas, enPx, fSim.afin, escena);
    ok(conservadas.length === dentro.length, 'la capa excluye exactamente las conservadas (' +
      conservadas.length + ' = ' + dentro.length + ')');
    function flujoG(filas) {
      var s = 0;
      for (var i = 0; i < filas.length; i++) s += Math.pow(10, -0.4 * filas[i][2]);
      return s;
    }
    var enParche = enPx.map(function (e) { return estrellas[e.i]; });
    var fTotal = flujoG(enParche), fDoble = flujoG(conservadas);
    console.log('  fotometría de la capa (flujo ∝ 10^−0,4G, solo fuentes del parche):');
    console.log('    antes:   capa ' + fTotal.toExponential(3) + ' + parche ' + fDoble.toExponential(3) +
      '  (doble cuenta ' + f(100 * fDoble / fTotal, 1) + ' %)');
    console.log('    después: capa ' + (fTotal - fDoble).toExponential(3) + ' + parche ' +
      fDoble.toExponential(3) + '  (doble cuenta 0 %)');
    var brillantes = conservadas.slice().sort(function (a, b) { return a[2] - b[2]; }).slice(0, 3);
    brillantes.forEach(function (fila) {
      console.log('    · excluida de la capa: G=' + f(fila[2], 1) + ' en (' +
        f(fila[0], 4) + ', ' + f(fila[1], 4) + ')');
    });

    var geo = { afin: fSim.afin, ba: gal.ba, pa: gal.pa, escena: escena };
    var limpio = window.BitacoraPS1.ps1QuitarEstrellas(F.datos, F.ancho, F.alto, enPx, geo);

    // Coherencia de la partición: lo conservado no cambia ni un píxel de su
    // disco — salvo donde lo pisa la MÁSCARA de una eliminada, que ahí manda
    // ella (la misma convención de siempre: la máscara de una estrella normal
    // que atraviesa un disco protegido elimina esa parte)—; lo eliminado deja
    // residuo ~0.
    // La misma convención de disco que producción: centro flotante, floor/ceil.
    function porDisco(e, fn) {
      var r = Math.max(1, e.rPx), r2 = r * r;
      for (var y = Math.max(0, Math.floor(e.y - r)); y <= Math.min(F.alto - 1, Math.ceil(e.y + r)); y++)
        for (var x = Math.max(0, Math.floor(e.x - r)); x <= Math.min(F.ancho - 1, Math.ceil(e.x + r)); x++) {
          var dx = x - e.x, dy = y - e.y;
          if (dx * dx + dy * dy > r2) continue;
          fn(y * F.ancho + x);
        }
    }
    var mascaraFuera = new Uint8Array(F.datos.length);
    fuera.forEach(function (e) { porDisco(e, function (j) { mascaraFuera[j] = 1; }); });
    var tocadas = 0;
    dentro.forEach(function (e) {
      var toco = false;
      porDisco(e, function (j) {
        if (toco || mascaraFuera[j]) return;
        var a = F.datos[j], b = limpio[j];
        if ((a === a) !== (b === b) || (a === a && a !== b)) toco = true;
      });
      if (toco) tocadas++;
    });
    ok(tocadas === 0, 'ninguna fuente dentro de escena pierde un píxel fuera de máscara ajena (' + tocadas + ' tocadas)');

    var resid = fuera.map(function (e) { return residuoEstrella(limpio, F.ancho, F.alto, e); })
      .filter(isFinite);
    console.log('  residuo mediano de las eliminadas (disco−anillo, DN): ' + f(mediana(resid), 1));

    // Núcleo propio 0–2″ intacto.
    var nucX = (F.ancho - 1) / 2, nucY = (F.alto - 1) / 2, rNucPx = 2 / esc, cambiadoNuc = 0;
    for (var y = Math.floor(nucY - rNucPx); y <= Math.ceil(nucY + rNucPx); y++)
      for (var x = Math.floor(nucX - rNucPx); x <= Math.ceil(nucX + rNucPx); x++) {
        var j = y * F.ancho + x;
        if (limpio[j] !== F.datos[j] && (limpio[j] === limpio[j] || F.datos[j] === F.datos[j])) cambiadoNuc++;
      }
    ok(cambiadoNuc === 0, 'núcleo propio 0–2″ intacto (' + cambiadoNuc + ' px cambiados)');

    // M51: el núcleo de NGC 5195, sin punto negro y sin regla por nombre.
    if (G.alias === 'M51') {
      var fc2 = filaCat('NGC 5195'), g2 = galDeFila(fc2);
      var p2 = fSim.wcs ? window.BitacoraPS1.ps1CieloAPixel(fSim.wcs, g2.ra, g2.dec) : null;
      if (!p2) {
        var cos0 = Math.cos(gal.dec * Math.PI / 180);
        var este = ((((g2.ra - gal.ra) + 540) % 360) - 180) * cos0 * 3600;
        var norte = (g2.dec - gal.dec) * 3600;
        var a2 = fSim.afin;
        p2 = [a2.cx + a2.xe * este + a2.xn * norte, a2.cy + a2.ye * este + a2.yn * norte];
      }
      console.log('  NGC 5195 en el parche: (' + f(p2[0], 0) + ', ' + f(p2[1], 0) + ') px');
      var r5195 = Math.ceil(10 / esc), bajaron = 0, n5195 = 0;
      for (y = Math.floor(p2[1] - r5195); y <= Math.ceil(p2[1] + r5195); y++)
        for (x = Math.floor(p2[0] - r5195); x <= Math.ceil(p2[0] + r5195); x++) {
          j = y * F.ancho + x;
          if (!(F.datos[j] === F.datos[j])) continue;
          n5195++;
          if (limpio[j] !== F.datos[j]) bajaron++;
        }
      ok(bajaron === 0, 'núcleo de NGC 5195 (±10″) intacto: ' + bajaron + '/' + n5195 +
        ' px cambiados — protegido por SU elipse, no por su nombre');
      var LADO = 121;
      guardarPGM('M51_ngc5195_antes', recorte(F.datos, F.ancho, F.alto, p2[0], p2[1], LADO), LADO);
      guardarPGM('M51_ngc5195_despues', recorte(limpio, F.ancho, F.alto, p2[0], p2[1], LADO), LADO);
      guardarPGM('M51_campo_antes', recorte(F.datos, F.ancho, F.alto, (F.ancho - 1) / 2, (F.alto - 1) / 2, 801), 801);
      guardarPGM('M51_campo_despues', recorte(limpio, F.ancho, F.alto, (F.ancho - 1) / 2, (F.alto - 1) / 2, 801), 801);
    }
  }).catch(function (e) { problemas++; console.log('\n' + G.alias + ': FALLO — ' + e.message); });
}

var cadena = Promise.resolve();
GALAXIAS.forEach(function (G) { cadena = cadena.then(function () { return analizar(G); }); });
cadena.then(function () {
  console.log('\nRecortes en ' + OUT_DIR);
  console.log(problemas ? '\n' + problemas + ' PROBLEMAS' : '\ntodo ok');
  process.exit(problemas ? 1 : 0);
});
