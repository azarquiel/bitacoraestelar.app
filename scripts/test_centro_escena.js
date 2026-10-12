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

// Vecindario solar (#422): coordenadas en años luz con el Sol en el origen.
console.log('Vecindario: coordenadas en años luz');
var sirio = { x: -3.1, y: 7.6, z: -2.4 };           // ~8,6 al del Sol
var camV = camara(0.6, -0.42, 20, 1280, 800);       // campo de 20 al
var pS = C.proyectar(sirio, sirio, camV);
ok(casi(pS.sx, 640, 1e-9) && casi(pS.sy, 400, 1e-9), 'Sirio centrada proyecta en (640, 400)');
var solV = C.proyectar(origen, sirio, camV);
var solVViejo = projectViejo({ x: -sirio.x, y: -sirio.y, z: -sirio.z }, 0.6, -0.42, 20, 1280, 800);
ok(casi(solV.sx, solVViejo.sx, 1e-12) && casi(solV.sy, solVViejo.sy, 1e-12),
   'el Sol se ve donde caería el vector origen − centro (sigue dibujado)');
var vecino = { x: 4.2, y: -1.0, z: 0.9 };
var pc = C.proyectar(vecino, origen, camV), pv = projectViejo(vecino, 0.6, -0.42, 20, 1280, 800);
ok(casi(pc.sx, pv.sx, 1e-12) && casi(pc.sy, pv.sy, 1e-12), 'con el Sol de centro, una estrella proyecta como siempre');
var vV = C.vuelo(origen, sirio, 1);
ok(vV.x === sirio.x && vV.y === sirio.y && vV.z === sirio.z, 'el vuelo hasta la estrella llega exacto');

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

// Centrar en el vecindario (#422): mismo cableado, sobre el fuente.
console.log('Vecindario: cableado');
var vs = leer('mapa/js/vecindario-solar.js');
ok(/centrar:\s*centrar[\s\S]{0,40}esCentro:\s*esCentro[\s\S]{0,40}volver:\s*volver/.test(vs),
   'VecindarioSolar expone centrar, esCentro y volver');
ok(/VLCentro\.proyectar/.test(vs) && !/var cyaw/.test(vs), 'el vecindario proyecta por VLCentro (sin copia de la cuenta)');
ok(/if \(centro\) anillo\(project\(centro\)\)/.test(vs), 'la estrella centrada lleva el anillo');
ok(/realzado = o === hovPrev \|\| o === centro/.test(vs), 'y su nombre siempre visible');
ok(/if \(!interactive\) volverAlOrigen\(\)/.test(vs), 'salir del vecindario devuelve el centro al Sol');
ok(/Volver al Sol, origen de la escena/.test(vs), 'el rótulo del botón es «Volver al Sol» con «origen de la escena»');
ok(/closest\('\.mw-ui-control'\)/.test(vs), 'el arrastre del vecindario no empieza sobre un control');
ok(/armarCentrar\(obj, VecindarioSolar\)/.test(app), 'la ficha de una estrella del vecindario arma «Centrar»');
ok(/VecindarioSolar\.volver\(\)/.test(app), 'Inicio también vuelve al Sol');
ok(!/vecindario-solar\.js\?v=20261004_1200/.test(html), 'versión de caché nueva del vecindario');

// Realce de los anillos de distancia con la plomada: el más próximo al pie x1,8,
// los interiores bajan linealmente a x1 en el más interno, los exteriores x1.
(function () {
  var C = require('../mapa/js/via-lactea-centro.js');
  var f = C.realceAnillos([1, 2, 3, 4, 5], 3.2, 0);
  ok(Math.abs(f[2] - 1.8) < 1e-9 && f[0] === 1 && Math.abs(f[1] - 1.4) < 1e-9, 'cercano 1,8 e interiores en rampa');
  ok(f[3] === 1 && f[4] === 1, 'exteriores en 1');
  ok(C.realceAnillos([1, 2, 3], 1.1, 0)[0] === 1.8, 'un solo anillo hasta el cercano: entero');
  ok(C.realceAnillos([1, 2, 3], 1.1, 1)[1] === 1.8, 'los no dibujados no cuentan');
})();

// Brillo base del punto: la galaxia lo publica por CSS y lo restituye al realzar.
ok(/--mw-aten-op'?, VLMarcadorEstilo\.canvas/.test(app), 'la app publica --mw-aten-op desde VLMarcadorEstilo.canvas');
ok(/\.mw-punto \{\s*opacity: var\(--mw-aten-op, 1\)/.test(html), 'el punto usa --mw-aten-op');
ok(/mw-realzado \.mw-punto,\s*#mw-content\.mw-viaje \.mw-object-anchor \.mw-punto \{ opacity: 1; scale: 1; \}/.test(html), 'hover, realzado y viaje: opacidad y tamaño enteros');

// Punto fijo del zoom: con el centro de la escena a la vista (centro desplazado o
// dentro del vecindario, cuya escena se pinta siempre en el centro del visor) el
// zoom NO sigue al cursor. Si lo siguiera, la galaxia se movería bajo una escena
// que no se mueve, y al volver el Sol quedaría descentrado.
(function () {
  var vr = { left: 10, top: 20, width: 800, height: 600 };
  var p = C.puntoFijoZoom(500, 400, vr, false);
  ok(p.x === 500 && p.y === 400, 'zoom normal: el punto del gesto');
  p = C.puntoFijoZoom(500, 400, vr, true);
  ok(p.x === 410 && p.y === 320, 'zoom con centro de escena: el centro del visor');
})();
ok(/VLCentro\.puntoFijoZoom\(x, y, [\s\S]*?centroDesplazado\(\) \|\| dentroVecindario\)/.test(app), 'la app ancla al centro dentro del vecindario');

// Sin abanico de solapados (M8/M20): ningún marcador se desplaza ni lleva línea-guía de grupo.
ok(!/FAN_GROUPS|fanOutClusters|data-ox|data-oy/.test(app), 'ya no hay abanico de objetos solapados');
ok(/mw-hundido \.mw-connector/.test(html) && /var screenPx = hundidoX/.test(app), 'el conector sigue siendo la plomada del hundido');

// Etiquetas solo realzadas y tamaño base común a las tres vistas.
var vecin = leer('mapa/js/vecindario-solar.js');
var grupo = leer('mapa/js/grupo-local.js');
ok(/VLMarcadorEstilo\.etiquetaVisible\(/.test(vecin) && /VLMarcadorEstilo\.etiquetaVisible\(/.test(grupo), 'los dos lienzos deciden la etiqueta con la ley común');
ok(!/etiquetaZoomOk|etiquetaFovFraccion/.test(vecin + grupo), 'ya no hay etiqueta por zoom en los lienzos');
ok(!/etiquetas-visibles|etiquetaZoomMin/.test(app + html), 'ni en la galaxia');
ok(/scale: var\(--mw-aten-esc, 1\)/.test(html), 'el punto de la galaxia usa el tamaño base común');

// Galaxia inclinada: etiquetas y plomadas solo con cursor o búsqueda; el cristal se queda.
ok(!/mw-bajo-plano \.mw-label \{ opacity/.test(html), 'el objeto bajo el plano no fuerza su etiqueta');
ok(/\.mw-tallo \{[^}]*opacity: 0;/.test(html), 'el tallo (plomada) nace oculto');
ok(/mw-realzado \.mw-tallo \{ opacity: 1; \}/.test(html), 'el tallo sale con cursor o búsqueda');
ok(/mw-hundido \.mw-connector \{[^}]*opacity: 0;/.test(html), 'la plomada del hundido nace oculta');
ok(/mw-hundido\.mw-realzado \.mw-connector \{ opacity: 1; \}/.test(html), 'la plomada del hundido sale con cursor o búsqueda');
ok(/mw-bajo-plano \.mw-punto::before \{/.test(html), 'el cristal del objeto bajo el plano se conserva');

// El radio del punto en los lienzos sale de la misma medida que la galaxia.
ok(/VLMarcadorEstilo\.radioPunto\(/.test(vecin) && /VLMarcadorEstilo\.radioPunto\(/.test(grupo), 'los lienzos usan radioPunto (puntoDiametro / 2)');
ok(!/Math\.max\(2\.4, 4 \* p\.persp\)/.test(vecin + grupo), 'ya no hay radio fijo de 4 px en los lienzos');

// «Volver al Sol» del mapa de la galaxia (#425).
console.log('Volver al Sol (galaxia)');
ok(C.solDescentrado(0, 0, 800, 600, 0.28) === false, 'el Sol en el centro no pide botón');
ok(C.solDescentrado(100, 100, 800, 600, 0.28) === false, 'dentro de la zona (141 < 168) no pide botón');
ok(C.solDescentrado(200, 150, 800, 600, 0.28) === true, 'fuera de la zona (250 > 168) sí');
ok(C.duracionVuelo(1000, 1000) === 500, 'recorrido largo: 500 ms');
ok(C.duracionVuelo(0, 1000) === 250, 'Sol ya en el centro: mínimo de 250 ms');
ok(C.duracionVuelo(50, 1000) > 250 && C.duracionVuelo(50, 1000) < 500, 'recorrido corto: entre 250 y 500 ms');
ok(/setAttribute\('data-escala', 'galaxia'\)/.test(app), 'la app pone la pastilla en escala «galaxia»');
ok(/'Volver al Sol, origen de la escena'/.test(app), 'rótulo accesible «Volver al Sol, origen de la escena»');
ok(/reducido \|\| dist < 1/.test(app), 'movimiento reducido: el Sol se centra al instante');
ok(/holguraSol/.test(app) && /sinClamp/.test(app), 'a escala 1 el clamp no impide centrar el Sol (holgura)');
ok(/function terminarVueloSol/.test(app) && /'wheel', 'touchstart'/.test(app), 'un gesto durante el vuelo lo termina en el destino');
ok(/centerOnAnchor\(sol\.x, sol\.y, scale\)/.test(app), 'el vuelo conserva la escala');
ok(/if \(!isDragging\) ?|isDragging\) return;\s*var propia/.test(app), 'durante el arrastre no se reevalúa');
ok(/data-escala="galaxia"\] > \.mw-icono/.test(html), 'en la galaxia la pastilla enseña solo el botón');
ok(/centroPastilla\.getAttribute\('data-escala'\) === 'galaxia' && volverAlSol/.test(app), 'Inicio también vuelve al Sol en la galaxia');

// ---- #427: los viajes se ven siempre desde el origen ----
var sv = C.estadoCentrar(false, true), sn = C.estadoCentrar(false, false), sc = C.estadoCentrar(true, false);
ok(sv.desactivado && sv.aviso && sv.texto === 'Centrar', 'viaje activo: «Centrar» desactivado con aviso');
ok(!sn.desactivado && !sn.aviso, 'sin viaje: «Centrar» funciona');
ok(sc.desactivado && !sc.aviso && sc.texto === 'Centrado', 'ya centrado: «Centrado» sin aviso de viaje');
ok(/viajeActivo \|\| escena\.esCentro/.test(app), 'el clic no centra con viaje activo');
ok(/GrupoLocal\.alOrigen\(\)/.test(app) && /VecindarioSolar\.alOrigen\(\)/.test(app), 'arrancar un viaje devuelve las dos escenas al origen');
ok(app.indexOf('GrupoLocal.alOrigen()') < app.indexOf('encuadrarViaje(viajeActivo);'), 'el origen vuelve antes del encuadre');
ok(/!viajeActivo && VLCentro\.solDescentrado/.test(app), 'con viaje no se enseña «Volver al Sol»');
ok(/id="ficha-centrar-aviso"[^>]*>Termina el viaje para centrar/.test(html) && /aria-describedby="ficha-centrar-aviso"/.test(html), 'aviso visible y enlazado al botón');
ok(/alOrigen: volverAlOrigen/.test(require('fs').readFileSync(__dirname + '/../mapa/js/grupo-local.js', 'utf8')) &&
   /alOrigen: volverAlOrigen/.test(require('fs').readFileSync(__dirname + '/../mapa/js/vecindario-solar.js', 'utf8')), 'las dos escenas exponen alOrigen');

if (fallos) { console.error('\n' + fallos + ' fallo(s)'); process.exit(1); }
console.log('\nTodo bien');
