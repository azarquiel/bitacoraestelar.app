#!/usr/bin/env node
/* Fixtures SINTÉTICAS para L2.4 (#324): el campo de Virgo (ADR 0024 §Fase 2)
   a la resolución por objeto de la regla C, para pesar el montón del
   navegador con `scripts/harness_l24_memoria.html`.

   Por qué sintéticas y no las texturas reales: en fase 2 el tamaño del
   parche depende del objeto (`ps1SalidaParche(gal.ladoArcmin)`), así que
   "un parche vale por otro para pesar" —la premisa de L1.3, donde todos
   medían `cfg.salida` fijo— ya no es cierto. Hace falta un parche del
   tamaño REAL de cada uno de los 14 objetos del campo, y ninguno tiene
   textura publicada todavía (el banco de fase 2 no se genera hasta que
   L2.4 cierra). La memoria de decodificar un PNG-16 depende del ANCHO y
   ALTO, no del contenido: por eso un parche sintético del tamaño correcto,
   codificado con el códec de producción (`BitacoraPNG16.codificar` +
   `lib_png.escribirGris16`, ninguna ley reimplementada, ADR 0008), pesa
   igual que el real para este listón. No sirve para L1.1 ni para nada de
   fotometría: solo para el tamaño en bytes de `Float32Array`/`Uint16Array`.

   Centro y lado: los mismos que `scripts/harness_l1_coste.html` usa para
   L2.4 — punto medio de NGC 4374 y NGC 4406, lado 120′. Quién cae dentro lo
   decide `ps1GalaxiasDelCampo`, no una lista escrita aquí.

   Escribe en `simulador_ocular/dso/` (ignorado en git, `*.png`) con el
   prefijo `L24SINT_` para que no se pueda confundir con una textura real:
   `scripts/limpiar_fixtures_l24_virgo.js` los borra al terminar.

   Uso:  node scripts/gen_fixtures_l24_virgo.js */
'use strict';

var fs = require('fs'), path = require('path');
var RAIZ = path.join(__dirname, '..');
global.window = {};
require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-ps1.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-png16.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js'));

var PS1 = window.BitacoraPS1, PNG16 = window.BitacoraPNG16;
var LIBPNG = require('./lib_png.js');
var DIR = path.join(RAIZ, 'simulador_ocular', 'dso');
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

function campoVirgo() {
  var cat = window.BITACORA_GALAXIAS, a = null, b = null, i;
  for (i = 0; i < cat.length; i++) {
    if (cat[i][0] === 'NGC 4374') a = cat[i];
    if (cat[i][0] === 'NGC 4406') b = cat[i];
  }
  if (!a || !b) throw new Error('el catálogo no trae NGC 4374 y NGC 4406');
  return PS1.ps1GalaxiasDelCampo(cat, (a[2] + b[2]) / 2, (a[3] + b[3]) / 2, 120);
}

/* Ruido gaussiano (Box-Muller) alrededor de un cielo ficticio: basta con que
   `codificar` reciba valores finitos y una `a` (=σ) positiva, el códec no
   pide más. */
function parcheSintetico(n) {
  var out = new Float32Array(n), cielo = 100, sigma = 8, i;
  for (i = 0; i < n; i++) {
    var u1 = Math.random() || 1e-9, u2 = Math.random();
    out[i] = cielo + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  return out;
}

var campo = campoVirgo();
var filas = [];
campo.forEach(function (gal) {
  var salida = PS1.ps1SalidaParche(gal.ladoArcmin);
  var datos = parcheSintetico(salida * salida);
  var cod = PNG16.codificar(datos, { a: 8 });
  var id = 'L24SINT_' + gal.nombre.replace(/[^A-Za-z0-9]/g, '_');
  var base = path.join(DIR, id + '.sint');
  LIBPNG.escribirGris16(base + '.png', cod.u16, salida, salida);
  fs.writeFileSync(base + '.json', JSON.stringify({
    nombre: gal.nombre, sintetico: true, fixture: 'gen_fixtures_l24_virgo.js',
    ancho: salida, alto: salida, ladoArcmin: gal.ladoArcmin,
    escalaAs: gal.ladoArcmin * 60 / salida,
    codificacion: { tipo: 'asinh16', a: 8, uMin: cod.uMin, uMax: cod.uMax, centinela: 0 }
  }));
  filas.push({ nombre: gal.nombre, ladoArcmin: gal.ladoArcmin, salida: salida, id: id });
  console.log(gal.nombre + '\tlado ' + gal.ladoArcmin.toFixed(2) + '\'\tsalida ' + salida + ' px\t' + id);
});

fs.writeFileSync(path.join(DIR, 'L24SINT_manifiesto.json'), JSON.stringify(filas, null, 2));
console.log('\n' + filas.length + ' fixtures sintéticas en ' + DIR + ' (prefijo L24SINT_).');
console.log('Limpiar con: node scripts/limpiar_fixtures_l24_virgo.js');
