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

var BANDA = [0.80, 1.25];
function termino(q, s) {
  var fuera = q < BANDA[0] || q > BANDA[1];
  return { q: q, sigma: s, falla: fuera && Math.abs(q - 1) > 2 * s };
}

/* R_num = N_HST/num con σ de Poisson; c_emp/c_mod con σ binomial sobre N_HST
   (c_emp recortada a [1/N, 1 − 1/N] para que σ no se anule en los extremos). */
function veredicto(m) {
  var rNum = m.nHst / m.nMod, cEmp = m.nGaia / m.nHst;
  var cb = Math.min(1 - 1 / m.nHst, Math.max(1 / m.nHst, cEmp));
  var num = termino(rNum, rNum / Math.sqrt(m.nHst));
  var k = termino(cEmp / m.cMod, Math.sqrt(cb * (1 - cb) / m.nHst) / m.cMod);
  return { num: num, k: k, cEmp: cEmp, producto: rNum * cEmp / m.cMod, noCuadra: !num.falla && !k.falla };
}

module.exports = { huella: huella, veredicto: veredicto, BANDA: BANDA };
