#!/usr/bin/env node
/* Test del CENTRO DE LA ESCENA de las escenas 3D del mapa
   (mapa/js/via-lactea-centro.js, historia #421).

   Centrar solo mueve la cámara: la proyección resta el centro antes de girar,
   así que el objeto centrado cae en el centro de pantalla y, con el centro en
   el origen, la proyección es la de siempre. Aquí se fija contra una copia
   LITERAL de la project() que tenía grupo-local.js antes de la historia.

   El vuelo lleva el centro de un punto a otro con ease-out cubic: arranca en
   el punto de salida, llega exacto al destino y no se pasa de él.

   Sin dependencias:  node scripts/test_centro_escena.js  */
'use strict';

var C = require('../mapa/js/via-lactea-centro.js');

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function casi(a, b, tol) { return Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)); }

// Copia literal de la project() de grupo-local.js previa a #421.
function projectViejo(o, yaw, pitch, fov, W, H) {
  var cx = W / 2, cy = H / 2;
  var x = o.x, y = o.y, z = o.z;
  var cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
  var x1 = x * cyaw - y * syaw;
  var y1 = x * syaw + y * cyaw;
  var z1 = z;
  var cp = Math.cos(pitch), sp = Math.sin(pitch);
  var y2 = y1 * cp - z1 * sp;
  var z2 = y1 * sp + z1 * cp;
  var R = Math.min(W, H) * 0.42;
  var scale = R / fov;
  var depth = 1 + (z2 / fov) * 0.12;
  return { sx: cx + x1 * scale, sy: cy - y2 * scale, depth: z2, persp: depth };
}

function camara(yaw, pitch, fov, W, H) {
  return { yaw: yaw, pitch: pitch, fov: fov, R: Math.min(W, H) * 0.42, cx: W / 2, cy: H / 2 };
}

// Generador determinista: el test no puede depender de Math.random().
var semilla = 421;
function azar() { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; }

console.log('Centro en el origen = proyección de siempre');
var origen = { x: 0, y: 0, z: 0 };
var iguales = true;
for (var i = 0; i < 500; i++) {
  var yaw = (azar() - 0.5) * 8, pitch = (azar() - 0.5) * 3;
  var fov = Math.pow(10, 1 + azar() * 8), W = 300 + azar() * 1700, H = 300 + azar() * 1000;
  var d = fov * 3 * azar();
  var o = { x: (azar() - 0.5) * d, y: (azar() - 0.5) * d, z: (azar() - 0.5) * d };
  var a = projectViejo(o, yaw, pitch, fov, W, H);
  var b = C.proyectar(o, origen, camara(yaw, pitch, fov, W, H));
  if (!(casi(b.sx, a.sx, 1e-12) && casi(b.sy, a.sy, 1e-12) &&
        casi(b.depth, a.depth, 1e-12) && casi(b.persp, a.persp, 1e-12))) { iguales = false; break; }
}
ok(iguales, '500 puntos al azar proyectan igual que antes (sx, sy, depth, persp)');

console.log('Centro desplazado: el objeto centrado cae en (cx, cy)');
var m31 = { x: -1.2e6, y: 2.1e6, z: -0.8e6 };
var cam = camara(0.6, -0.45, 3e6, 1280, 800);
var p = C.proyectar(m31, m31, cam);
ok(casi(p.sx, 640, 1e-9) && casi(p.sy, 400, 1e-9), 'M31 centrada proyecta en (640, 400)');
ok(casi(p.persp, 1, 1e-12), 'el objeto centrado tiene la perspectiva del centro (persp = 1)');
var otraCam = camara(2.3, 1.1, 8e5, 1280, 800);
var q = C.proyectar(m31, m31, otraCam);
ok(casi(q.sx, 640, 1e-9) && casi(q.sy, 400, 1e-9), 'girar con otro yaw/pitch/fov no lo mueve del centro');
var mw = C.proyectar(origen, m31, cam);
var mwViejo = projectViejo({ x: -m31.x, y: -m31.y, z: -m31.z }, 0.6, -0.45, 3e6, 1280, 800);
ok(casi(mw.sx, mwViejo.sx, 1e-12) && casi(mw.sy, mwViejo.sy, 1e-12),
   'la Vía Láctea se ve donde caería el vector origen − centro');

console.log('Vuelo');
var desde = { x: 10, y: -20, z: 30 }, hasta = { x: -1e6, y: 4e5, z: 2e5 };
var v0 = C.vuelo(desde, hasta, 0), v1 = C.vuelo(desde, hasta, 1);
ok(v0.x === desde.x && v0.y === desde.y && v0.z === desde.z, 't = 0 está en el punto de salida');
ok(v1.x === hasta.x && v1.y === hasta.y && v1.z === hasta.z, 't = 1 está exacto en el destino');
var vMas = C.vuelo(desde, hasta, 1.7), vMenos = C.vuelo(desde, hasta, -0.3);
ok(vMas.x === hasta.x && vMas.y === hasta.y && vMas.z === hasta.z, 't > 1 se queda en el destino');
ok(vMenos.x === desde.x && vMenos.y === desde.y && vMenos.z === desde.z, 't < 0 se queda en la salida');
var vMedio = C.vuelo(desde, hasta, 0.5);
var frac = (vMedio.x - desde.x) / (hasta.x - desde.x);
ok(casi(frac, 0.875, 1e-12), 'ease-out cubic: a mitad de tiempo lleva 7/8 del camino (' + frac + ')');
ok(v1 !== hasta, 'devuelve un punto nuevo, no el destino (no lo deja a merced del llamador)');

// Volver al origen (#423): el botón vive en el DOM y su estado en el cierre de
// grupo-local.js, sin seam puro; aquí se fija el cableado sobre el fuente.
console.log('Volver al origen: cableado');
var fs = require('fs'), path = require('path');
function leer(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var html = leer('mapa/mapa.html');
var gl = leer('mapa/js/grupo-local.js');
var app = leer('mapa/js/via-lactea-app.js');
var pastilla = (html.match(/<div id="mw-centro"[^>]*>([\s\S]*?)\n  <\/div>/) || [])[1] || '';
var boton = (pastilla.match(/<button[^>]*id="mw-centro-volver"[^>]*>/) || [])[0] || '';
var estado = (pastilla.match(/<span id="mw-centro-estado"[^>]*>[\s\S]*?<\/span>/) || [])[0] || '';
ok(!!boton, 'el botón está dentro de la pastilla #mw-centro');
ok(estado && estado.indexOf('mw-centro-volver') < 0, 'y fuera de la región role="status" (no se anuncia su rótulo)');
ok(/aria-keyshortcuts="Home"/.test(boton), 'declara el atajo con aria-keyshortcuts="Home"');
ok(/\bmw-ui-control\b/.test(boton), 'es .mw-ui-control: pulsarlo no arrastra el visor');
ok(/id="mw-centro-ico-sol"/.test(pastilla) && /id="mw-centro-ico-espiral"/.test(pastilla),
   'lleva los dos iconos: el Sol (vecindario) y la espiral (Grupo Local)');
ok(/<div id="mw-viewer" tabindex="-1"/.test(html), '#mw-viewer admite el foco al desaparecer el botón');
ok(/aria-label="Volver a la Vía Láctea, origen de la escena"/.test(boton), 'aria-label del Grupo Local con «origen de la escena»');
ok(/volver:\s*volver/.test(gl), 'GrupoLocal expone volver()');
ok(/closest\('\.mw-ui-control'\)/.test(gl), 'el arrastre del Grupo Local no empieza sobre un control');
ok(/e\.key === 'Home'[\s\S]{0,400}GrupoLocal\.volver\(\)/.test(app), 'Inicio llama a GrupoLocal.volver()');
ok(!/grupo-local\.js\?v=20261011_1200|via-lactea-app\.js\?v=20261011_1200/.test(html),
   'las versiones de caché no repiten las de #421 (producción serviría los viejos)');

if (fallos) { console.error('\n' + fallos + ' fallo(s)'); process.exit(1); }
console.log('\nTodo bien');
