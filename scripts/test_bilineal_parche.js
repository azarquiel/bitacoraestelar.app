#!/usr/bin/env node
/* Tests del remuestreo bilineal de ps1PintarParche.

   El cambio que fijan: el paso parche→lienzo lee CUATRO vecinos con pesos de
   rejilla en vez de uno con Math.round, y cada vecino aporta su mezcla completa
   (su flujo Y su peso[k]). Todo lo demás —PSF, mezcla, opacidad, fotometría—
   tiene que seguir exactamente igual, y eso es lo que se comprueba aquí:

   · parche.datos no se toca y sus NaN de origen quedan donde estaban;
   · el lienzo no gana NaN;
   · a ×1 (rejilla del lienzo alineada con la del parche) el resultado es
     BIT-IDÉNTICO al vecino más próximo de antes, con y sin mezcla;
   · a ×2 y ×4 el flujo DEL CASO DE PRUEBA se conserva y el escalonado baja
     (lo del harness; la bilineal es una interpolación, no un remapeo
     conservativo en general: lo que se fija es la medida, no un teorema);
   · la PSF se aplica una vez (repintar no acumula borrosidad);
   · Cmin, nivelFondo y rango no ven el remuestreo;
   · sin óptica que simular, la apertura no cambia nada (el algoritmo de
     remuestreo no sabe qué apertura hay);
   · el borde del parche no estrena costura;
   · los huecos (NaN) no se esparcen.

   El vecino más próximo de referencia está copiado aquí tal cual era el bucle
   de producción antes del cambio: es el patrón contra el que se compara.

   Sin dependencias:  node scripts/test_bilineal_parche.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;
var PS1 = R.ps1;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function casi(actual, esperado, tol, etiqueta) {
  ok(Math.abs(actual - esperado) <= tol, etiqueta + ' (' + actual + ' vs ' + esperado + ' ±' + tol + ')');
}

/* ── Parche sintético ────────────────────────────────────────────────────────
   Disco exponencial con textura, afín explícita SIN giro y con centro entero:
   así, con pxPorAs = 1 px de lienzo por ″, la rejilla del lienzo cae EXACTA
   sobre la del parche (tx = ty = 0) y el ×1 se puede exigir bit a bit. */
var AN = 121, LADO_ARCMIN = 2;                       // 120″ de lado, 121 px
function parcheNuevo(conNaN) {
  var datos = new Float32Array(AN * AN);
  for (var y = 0; y < AN; y++) {
    for (var x = 0; x < AN; x++) {
      var r = Math.hypot(x - 60, y - 60);
      datos[y * AN + x] = 100 * Math.exp(-r / 20) *
        (1 + 0.3 * Math.sin(x * 1.1) * Math.cos(y * 0.7));
    }
  }
  if (conNaN) {                                      // hueco del stack, 3×3
    for (var j = -1; j <= 1; j++) for (var i = -1; i <= 1; i++) {
      datos[(45 + j) * AN + 45 + i] = NaN;
    }
  }
  var comps = [{ Ie: 5, re: 30, n: 1, b: 1.678, q: 0.7, rMax: 200 }];
  var parche = {
    ra: 180, dec: 30, ladoArcmin: LADO_ARCMIN, ancho: AN, alto: AN,
    afin: { cx: 60, cy: 60, xe: -1, xn: 0, ye: 0, yn: 1 },
    comps: comps, pa: 25,
    halo: { aArcmin: PS1.haloMenorMin + 1, bArcmin: PS1.haloMenorMin + 1,
            n: 1, muProm: PS1.haloMuFijo + 1 },     // halo activo a propósito
    peso: R.ps1PesoImagen(datos, AN, AN, 1),
    escalaMezcla: 0.95,
    datos: datos
  };
  return parche;
}
ok(R.ps1HaloActivo(parcheNuevo(false).halo), 'el halo del parche de prueba está activo');

function cieloNuevo() {
  return { pupilaSalida: 350 / 400, aumentos: 400, sqm: 21, pupilaOjo: 7,
           realceMax: PS1.realceMax };
}
/* o con pxPorAs = q·factor: SIZE px de lienzo sobre un campo que hace la escala
   exacta (factor 1 → 1 px/″; 2 → 2 px/″; 4 → 4 px/″). */
function oNuevo(factor, cielo, apertura) {
  var SIZE = 240 * factor;
  return { ra0: 180, dec0: 30, arcmin: 240 / 60, size: SIZE,
           cielo: cielo || null, apertura: apertura || 0 };
}

/* El bucle de ANTES (vecino más próximo), copiado de producción tal cual era:
   el patrón de comparación. Reusa las mismas funciones exportadas. */
function pintarVecino(difuso, parche, o) {
  var SIZE = o.size, escv = SIZE / (o.arcmin / 60);
  var cos0 = Math.cos(o.dec0 * Math.PI / 180);
  var dra = (((parche.ra - o.ra0 + 540) % 360) - 180) * cos0;
  var cx = SIZE / 2 - dra * escv;
  var cy = SIZE / 2 - (parche.dec - o.dec0) * escv;
  var ladoPx = (parche.ladoArcmin / 60) * escv;
  if (!(ladoPx > 0.5)) return difuso;
  var a = parche.afin;
  var c = o.cielo ? R.ctxFotometrico(o.cielo) : null;
  var umbral = c ? R.sbUmbralContraste(c) : 0;
  var pxPorAs = escv / 3600;
  var halo = !!c && R.ps1HaloActivo(parche.halo);
  var comps = halo ? (parche.comps || []) : [], pa = parche.pa || 0;
  var peso = halo ? (parche.peso || null) : null;
  var sMezcla = peso ? parche.escalaMezcla : 1;
  var alcance = Math.max(ladoPx / 2, R.ps1RadioHaloAs(comps) * pxPorAs);
  var datos = c ? (parche.psfDatos || parche.datos) : parche.datos;
  var x0 = Math.max(0, Math.floor(cx - alcance)), x1 = Math.min(SIZE - 1, Math.ceil(cx + alcance));
  var y0 = Math.max(0, Math.floor(cy - alcance)), y1 = Math.min(SIZE - 1, Math.ceil(cy + alcance));
  for (var y = y0; y <= y1; y++) {
    var norte = -(y - cy) / pxPorAs;
    for (var x = x0; x <= x1; x++) {
      var este = -(x - cx) / pxPorAs;
      var px = Math.round(a.cx + a.xe * este + a.xn * norte);
      var py = Math.round(a.cy + a.ye * este + a.yn * norte);
      var f = 0, k = -1;
      if (py >= 0 && py < parche.alto && px >= 0 && px < parche.ancho) {
        k = py * parche.ancho + px;
        f = datos[k];
      }
      // El NaN es AUSENCIA y recibe el trato del vecino de fuera del parche
      // (flujo 0, peso 0 → queda el perfil), la misma regla que producción
      // desde el cambio de semántica del INFORME2/3. Antes envenenaba la
      // mezcla y el píxel quedaba sin pintar.
      if (!isFinite(f)) { f = 0; k = -1; }
      if (comps.length) {
        var fm = R.ps1FlujoModelo(comps, pa, norte, este);
        var w = (peso && k >= 0) ? peso[k] : 0;
        f = w * sMezcla * f + (1 - w) * fm;
      }
      if (!(f > 0)) continue;
      if (c) f = R.ps1FlujoConOpacidad(f, R.ps1Opacidad(-2.5 * Math.log10(f), umbral), c);
      if (!(f > 0)) continue;
      difuso[y * SIZE + x] += f;
    }
  }
  return difuso;
}

function iguales(a, b) {
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i] && !(isNaN(a[i]) && isNaN(b[i]))) return false;
  }
  return true;
}
function sumaFinita(a) {
  var s = 0; for (var i = 0; i < a.length; i++) if (isFinite(a[i])) s += a[i];
  return s;
}
function hayNoFinito(a) {
  for (var i = 0; i < a.length; i++) if (!isFinite(a[i])) return true;
  return false;
}
function escalonado(d, SIZE) {
  var s2 = 0, n = 0;
  for (var y = 1; y < SIZE - 1; y++) for (var x = 1; x < SIZE - 1; x++) {
    var i = y * SIZE + x;
    if (!(d[i] > 0) || !(d[i - 1] > 0) || !(d[i + 1] > 0)) continue;
    var d2 = d[i - 1] - 2 * d[i] + d[i + 1];
    s2 += d2 * d2; n++;
  }
  return n ? Math.sqrt(s2 / n) : 0;
}

console.log('\n— 1. parche.datos es inmutable y sus NaN quedan donde estaban —');
(function () {
  var p = parcheNuevo(true);
  var copia = new Float32Array(p.datos);
  var cielo = cieloNuevo();
  R.ps1PintarParche(new Float32Array(240 * 240), p, oNuevo(1, cielo, 350));
  R.ps1PintarParche(new Float32Array(480 * 480), p, oNuevo(2, cielo, 350));
  ok(iguales(p.datos, copia), 'parche.datos idéntico tras pintar (NaN incluidos)');
  var nanAntes = 0, nanDespues = 0;
  for (var i = 0; i < copia.length; i++) {
    if (isNaN(copia[i])) nanAntes++;
    if (isNaN(p.datos[i])) nanDespues++;
  }
  ok(nanAntes === 9 && nanDespues === 9, 'los 9 NaN de origen siguen siendo 9');
})();

console.log('\n— 2. El lienzo no gana NaN ni infinitos —');
(function () {
  [1, 2, 4].forEach(function (fac) {
    var d = R.ps1PintarParche(new Float32Array(240 * fac * 240 * fac),
      parcheNuevo(true), oNuevo(fac, cieloNuevo(), 350));
    ok(!hayNoFinito(d), 'lienzo ×' + fac + ' todo finito (con hueco NaN en el parche)');
  });
})();

console.log('\n— 3. A ×1 el bilineal ES el vecino de antes, bit a bit —');
(function () {
  // Sin cielo: flujo tal cual, sin PSF ni mezcla (como los tests de geometría).
  var p = parcheNuevo(true), o = oNuevo(1, null, 0);
  var dB = R.ps1PintarParche(new Float32Array(240 * 240), p, o);
  var dV = pintarVecino(new Float32Array(240 * 240), p, o);
  ok(iguales(dB, dV), 'sin cielo: idéntico al vecino');
  // Con cielo + halo + PSF: la mezcla completa por el mismo camino.
  var p2 = parcheNuevo(true), cielo = cieloNuevo(), o2 = oNuevo(1, cielo, 350);
  var dB2 = R.ps1PintarParche(new Float32Array(240 * 240), p2, o2);
  // El vecino de referencia lee la MISMA caché de PSF que dejó producción.
  var dV2 = pintarVecino(new Float32Array(240 * 240), p2, o2);
  ok(iguales(dB2, dV2), 'con cielo, halo y PSF: idéntico al vecino');
})();

console.log('\n— 4. A ×2 y ×4 el flujo del caso de prueba se conserva y el escalonado baja —');
(function () {
  [2, 4].forEach(function (fac) {
    var SIZE = 240 * fac, p = parcheNuevo(false), o = oNuevo(fac, null, 0);
    var dB = R.ps1PintarParche(new Float32Array(SIZE * SIZE), p, o);
    var dV = pintarVecino(new Float32Array(SIZE * SIZE), p, o);
    var sB = sumaFinita(dB), sV = sumaFinita(dV);
    casi(sB / sV, 1, 1e-3, '×' + fac + ': flujo bilineal / vecino');
    var eB = escalonado(dB, SIZE), eV = escalonado(dV, SIZE);
    ok(eB < eV, '×' + fac + ': escalonado baja (' + eB.toFixed(4) + ' < ' + eV.toFixed(4) +
      ', reducción ×' + (eV / eB).toFixed(2) + ')');
  });
})();

console.log('\n— 5. La PSF se aplica UNA vez: repintar no acumula ni cambia —');
(function () {
  var p = parcheNuevo(false), cielo = cieloNuevo(), o = oNuevo(1, cielo, 350);
  var d1 = R.ps1PintarParche(new Float32Array(240 * 240), p, o);
  var psf1 = p.psfDatos;
  var d2 = R.ps1PintarParche(new Float32Array(240 * 240), p, o);
  ok(p.psfDatos === psf1, 'la caché de PSF no se reconvoluciona');
  ok(iguales(d1, d2), 'repetir el pintado da el mismo lienzo');
})();

console.log('\n— 6. Cmin, nivelFondo y rango no ven el remuestreo —');
(function () {
  var cielo = cieloNuevo();
  var antes = R.ctxFotometrico(cielo);
  R.ps1PintarParche(new Float32Array(240 * 240), parcheNuevo(false), oNuevo(1, cielo, 350));
  var despues = R.ctxFotometrico(cielo);
  ok(antes.Cmin === despues.Cmin, 'Cmin idéntico');
  ok(antes.nivelFondo === despues.nivelFondo, 'nivelFondo idéntico');
  ok(antes.rango === despues.rango, 'rango idéntico');
})();

console.log('\n— 7. La apertura cambia la PSF, no el remuestreo —');
(function () {
  // Sin cielo no hay óptica: la apertura no puede cambiar NADA.
  var p = parcheNuevo(false);
  var dA = R.ps1PintarParche(new Float32Array(240 * 240), p, oNuevo(1, null, 200));
  var dB = R.ps1PintarParche(new Float32Array(240 * 240), p, oNuevo(1, null, 450));
  ok(iguales(dA, dB), 'sin cielo, 200 y 450 mm pintan lo mismo');
  // Con cielo sí: y lo que cambia es la PSF cacheada, no otra cosa.
  var p2 = parcheNuevo(false), cielo = cieloNuevo();
  var d200 = R.ps1PintarParche(new Float32Array(240 * 240), p2, oNuevo(1, cielo, 200));
  ok(p2.psfD === 200, 'psfD = 200 tras pintar con 200 mm');
  var d450 = R.ps1PintarParche(new Float32Array(240 * 240), p2, oNuevo(1, cielo, 450));
  ok(p2.psfD === 450, 'psfD = 450 tras pintar con 450 mm');
  ok(!iguales(d200, d450), 'con cielo, 200 y 450 mm difieren (por la PSF)');
})();

console.log('\n— 8. El borde del parche no estrena costura —');
(function () {
  /* A ×2 el borde del parche cae dentro del lienzo y el remuestreo pisa
     píxeles a caballo. Se mide el mayor salto (1ª diferencia) en una banda de
     ±3 px de lienzo alrededor del borde: el bilineal no puede saltar más que
     el vecino, que es el listón de hoy. Con halo activo el perfil sigue fuera
     y el tránsito lo hace la mezcla. */
  var fac = 2, SIZE = 240 * fac;
  var p = parcheNuevo(false), cielo = cieloNuevo(), o = oNuevo(fac, cielo, 350);
  var dB = R.ps1PintarParche(new Float32Array(SIZE * SIZE), p, o);
  var dV = pintarVecino(new Float32Array(SIZE * SIZE), p, o);
  // Borde del parche en px de lienzo: centro SIZE/2, medio lado 60″ × 2 px/″.
  var bordes = [SIZE / 2 - 120, SIZE / 2 + 120];
  function saltoMax(d) {
    var m = 0;
    bordes.forEach(function (bx) {
      for (var y = SIZE / 2 - 60; y <= SIZE / 2 + 60; y++) {
        for (var x = bx - 3; x <= bx + 2; x++) {
          var v0 = d[y * SIZE + x], v1 = d[y * SIZE + x + 1];
          if (!(v0 >= 0) || !(v1 >= 0)) continue;
          var s = Math.abs(v1 - v0);
          if (s > m) m = s;
        }
      }
    });
    return m;
  }
  var sB = saltoMax(dB), sV = saltoMax(dV);
  ok(sB <= sV * (1 + 1e-9), 'salto máximo en el borde: bilineal ' + sB.toFixed(5) +
    ' ≤ vecino ' + sV.toFixed(5));
})();

console.log('\n— 9. Los huecos (NaN) no se esparcen —');
(function () {
  /* Sin cielo y sin halo el hueco queda sin pintar (a 0). El bilineal salta el
     NaN y renormaliza, así que su huella no puede ser MAYOR que la del vecino. */
  var fac = 2, SIZE = 240 * fac;
  var p = parcheNuevo(true), o = oNuevo(fac, null, 0);
  var dB = R.ps1PintarParche(new Float32Array(SIZE * SIZE), p, o);
  var dV = pintarVecino(new Float32Array(SIZE * SIZE), p, o);
  function cerosEnHueco(d) {
    /* El hueco del parche está en (45,45)±1. Con la afín sin giro, fx = 60 +
       (x−SIZE/2)/fac y fy = 60 − (y−SIZE/2)/fac (el norte va hacia arriba):
       fx = fy = 45 cae en (x−SIZE/2)/fac = −15 y (y−SIZE/2)/fac = +15. */
    var n = 0;
    for (var y = 0; y < SIZE; y++) for (var x = 0; x < SIZE; x++) {
      var dxAs = Math.abs((x - SIZE / 2) / fac - (-15));
      var dyAs = Math.abs((y - SIZE / 2) / fac - 15);
      if (dxAs <= 3 && dyAs <= 3 && d[y * SIZE + x] === 0) n++;
    }
    return n;
  }
  var cB = cerosEnHueco(dB), cV = cerosEnHueco(dV);
  ok(cB > 0, 'el hueco sigue existiendo en el lienzo (' + cB + ' px sin pintar)');
  ok(cB <= cV, 'y no crece: bilineal ' + cB + ' px ≤ vecino ' + cV + ' px');
})();

console.log('\n' + (fallos ? '✗ ' + fallos + ' fallo(s)' : '✓ todos los tests pasan'));
process.exit(fallos ? 1 : 0);
