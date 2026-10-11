/* ============================================================================
   via-lactea-centro.js — CENTRO DE LA ESCENA de las escenas 3D (pura)
   Proyecto: mapa interactivo de la Vía Láctea (Gaia)

   Glosario: mapa/CONTEXT.md, «Origen y centro de la escena». El origen (la Vía
   Láctea en el Grupo Local) nunca se mueve: las coordenadas y las distancias
   son siempre suyas. El centro es el punto alrededor del que gira la cámara, y
   centrar solo mueve la cámara: la proyección resta el centro antes de girar,
   así que el objeto centrado cae en el centro de pantalla. Con el centro en el
   origen la proyección es exactamente la de siempre.

   Se carga ANTES de grupo-local.js y vecindario-solar.js y expone window.VLCentro. También exporta
   por module.exports para el test de node (scripts/test_centro_escena.js).
   ============================================================================ */

(function () {
  'use strict';

  // Proyección ortográfica de un punto 3D relativa al centro de la escena.
  //   o, centro: {x, y, z} en las coordenadas de la escena (las del origen).
  //   cam: {yaw, pitch, fov, R, cx, cy}; R son los píxeles que mide fov.
  function proyectar(o, centro, cam) {
    var x = o.x - centro.x, y = o.y - centro.y, z = o.z - centro.z;
    var cyaw = Math.cos(cam.yaw), syaw = Math.sin(cam.yaw);
    var x1 = x * cyaw - y * syaw;
    var y1 = x * syaw + y * cyaw;
    var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    var y2 = y1 * cp - z * sp;
    var z2 = y1 * sp + z * cp;
    var scale = cam.R / cam.fov;
    return { sx: cam.cx + x1 * scale, sy: cam.cy - y2 * scale, depth: z2,
             persp: 1 + (z2 / cam.fov) * 0.12 };
  }

  // Punto del vuelo del centro en el instante t (0 = salida, 1 = llegada),
  // con ease-out cubic: arranca rápido y desacelera al llegar. Fuera de [0, 1]
  // se queda en el extremo: el vuelo nunca se pasa ni se queda a medias.
  function vuelo(desde, hasta, t) {
    if (t <= 0) return { x: desde.x, y: desde.y, z: desde.z };
    if (t >= 1) return { x: hasta.x, y: hasta.y, z: hasta.z };
    var e = 1 - Math.pow(1 - t, 3);
    return { x: desde.x + (hasta.x - desde.x) * e,
             y: desde.y + (hasta.y - desde.y) * e,
             z: desde.z + (hasta.z - desde.z) * e };
  }

  // Anillo de señalar (objeto buscado o centrado), el mismo en las dos escenas.
  // Late; con movimiento reducido se queda fijo en su radio medio.
  function anillo(ctx, p, reducido) {
    var pulso = reducido ? 6 : 6 + 3 * Math.sin(Date.now() / 300);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.sx, p.sy, 7 + pulso, 0, Math.PI * 2); ctx.stroke();
  }

  // Los anillos de distancia suben de opacidad (x REALCE_REJILLA) a la vez que
  // la plomada, mientras haya un objeto realzado: la plomada se lee contra ellos.

  // Plomada: vertical del objeto a su pie sobre el plano z=0, la misma en las
  // dos escenas. Continua si el objeto está sobre el plano, discontinua si
  // está bajo él; el pie lleva un círculo pequeño para ver dónde cae.
  //   pie, p: puntos proyectados ({sx, sy}) · bajo: z < 0 · color: 'rgba(...)'
  function plomada(ctx, pie, p, bajo, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash(bajo ? [2, 3] : []);
    ctx.beginPath(); ctx.moveTo(pie.sx, pie.sy); ctx.lineTo(p.sx, p.sy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(pie.sx, pie.sy, 2, 0, Math.PI * 2); ctx.stroke();
  }

  var API = { proyectar: proyectar, vuelo: vuelo, anillo: anillo, plomada: plomada,
               REALCE_REJILLA: 1.8 };

  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
  if (typeof window !== 'undefined') { window.VLCentro = API; }
})();
