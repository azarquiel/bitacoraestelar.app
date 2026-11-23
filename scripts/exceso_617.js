/* #617 · Huella del campo ACS y regla del prerregistro (ADR 0039, «El exceso de
   filas en 0,5-1 r_h: `num` o `c`»). Solo lo usa el spike. */
'use strict';

/* Celdas de `lado`″ con ≥ `min` estrellas HST cuyas 8 vecinas también cumplen:
   el borde del campo (y las celdas sueltas) quedan fuera. */
function huella(hst, lado, min) {
  var n = new Map();
  hst.forEach(function (s) {
    var k = Math.floor(s.x / lado) + ',' + Math.floor(s.y / lado);
    n.set(k, (n.get(k) || 0) + 1);
  });
  function llena(i, j) { return (n.get(i + ',' + j) || 0) >= min; }
  var celdas = [], dentroSet = new Set();
  n.forEach(function (c, k) {
    var p = k.split(','), i = +p[0], j = +p[1];
    for (var a = -1; a <= 1; a++) for (var b = -1; b <= 1; b++) if (!llena(i + a, j + b)) return;
    celdas.push({ x: (i + 0.5) * lado, y: (j + 0.5) * lado });
    dentroSet.add(k);
  });
  return {
    celdas: celdas, area: lado * lado,
    dentro: function (p) { return dentroSet.has(Math.floor(p.x / lado) + ',' + Math.floor(p.y / lado)); }
  };
}

var BANDA = [0.80, 1.25], EXCESO = 2.79;   // cat/num·c de 17,07-18,07 en ≤1 (#595)
function termino(q, s) {
  var fuera = q < BANDA[0] || q > BANDA[1];
  return { q: q, sigma: s, falla: fuera && Math.abs(q - 1) > 2 * s };
}

/* R_num = N_HST/num con σ de Poisson. c_emp/c_mod con σ de Poisson de las dos
   cuentas: no binomial, porque en otra banda c_emp puede pasar de 1 (#617). */
function veredicto(m) {
  var rNum = m.nHst / m.nMod, cEmp = m.nGaia / m.nHst;
  var num = termino(rNum, rNum / Math.sqrt(m.nHst));
  var k = termino(cEmp / m.cMod, cEmp / m.cMod * Math.sqrt(1 / Math.max(m.nGaia, 1) + 1 / m.nHst));
  var producto = rNum * cEmp / m.cMod;
  return { num: num, k: k, cEmp: cEmp, producto: producto,
           // «del orden de 2,8» del prerregistro, leído con la misma banda.
           cuadra: producto / EXCESO >= BANDA[0] && producto / EXCESO <= BANDA[1],
           noCuadra: !num.falla && !k.falla };
}

// Control del método: completitud de Fabricius (Tabla A.1, M13, 0,5-2,2′, G 16-18) ± 10 puntos.
var FABRICIUS = 47, TOL = 10;
function control(nGaia, nHst) { return Math.abs(100 * nGaia / nHst - FABRICIUS) <= TOL; }

/* #619 · Criterio de recuento: astrometría 5/6p (ruwe no nulo, esquema de DR3) y
   BP−RP. f = { ruwe: número o null, color: bool }. */
function recuperada(f) { return f.ruwe != null && f.color; }

/* #619 · Veredicto con el criterio (vCrit) y con todas las filas (vTodas), tabla
   del prerregistro. `num` no depende del criterio: se lee de vCrit. */
function lectura619(vCrit, vTodas) {
  if (vCrit.num.falla) return vCrit.k.falla ? 'num y k' : 'num';
  if (vCrit.k.falla) return 'k';
  return vTodas.k.falla ? 'c-cuenta' : 'ninguno';
}

module.exports = { huella: huella, veredicto: veredicto, control: control, BANDA: BANDA,
  recuperada: recuperada, lectura619: lectura619 };
