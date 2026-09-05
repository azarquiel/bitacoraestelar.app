/* El banco del catálogo de texturas DSO, resuelto contra los catálogos de este
   árbol. La lista la fija el ADR 0024 (prerregistro), no este fichero: aquí solo
   se traducen sus nombres a filas y se comprueba que siguen siendo aptas.

   Dos formatos de nombre conviven —las galaxias van 'NGC 5194' y las nebulosas
   'NGC0040'— así que la búsqueda normaliza el catálogo NGC/IC a número y deja el
   resto (Abell 12) al nombre literal o al alterno.

   Las clases enteras (HII, RfN, SNR) NO se enumeran: se toman todas las aptas del
   momento, que es lo que dice el ADR. Si su número cambió respecto al que el ADR
   escribió, `banco()` lo dice en `avisos` en vez de callarlo.

   Uso:  var B = require('./lib_banco_dso.js')(R);
         B.banco()  →  { objetos: [{nombre, fila, motivo, gal}], controles, avisos } */
'use strict';

/* Del ADR 0024 §Banco. Un objeto entra con su motivo o no entra. */
var NOMBRADOS = [
  ['NGC 3310', 'cuantil de lado (mín)'], ['NGC 404', 'cuantil de lado (p25)'],
  ['NGC 3377', 'cuantil de lado (p50)'], ['NGC 4125', 'cuantil de lado (p75)'],
  ['NGC 7331', 'cuantil de lado (p90)'], ['NGC 205', 'cuantil de lado (tope)'],
  ['NGC 5194', 'golden'], ['NGC 5457', 'golden'], ['NGC 4594', 'golden'], ['NGC 3031', 'golden'],
  ['NGC 4486', 'núcleo saturado'], ['NGC 1068', 'núcleo saturado'],
  ['NGC 4826', 'banda de polvo'], ['NGC 4565', 'de canto'], ['NGC 891', 'de canto'],
  ['NGC 5195', 'vecina en la escena'], ['NGC 4374', 'campo denso (Virgo)'],
  ['NGC 4406', 'campo denso (Virgo)'], ['NGC 3034', 'vecina en la escena'],
  ['NGC 253', 'borde de cobertura'],
  ['NGC 6720', 'golden (PN)'],
  ['NGC 7008', 'mordida 43,6 %'], ['Abell 12', 'mordida 79,8 %'], ['NGC 7026', 'mordida 100 %'],
  ['NGC 7662', 'PN compacta brillante'], ['NGC 6543', 'PN compacta brillante'],
  ['NGC 3587', 'cuantil de lado entre PN'], ['NGC 1360', 'cuantil de lado entre PN'],
  ['NGC 6853', 'cuantil de lado entre PN'], ['NGC 7293', 'cuantil de lado entre PN (tope)']
];

/* Clases que entran enteras, con la cuenta que el ADR 0024 tiene registrada
   (enmienda del 2026-09-04). No es un listón: si el catálogo crece, el banco
   crece con él y `avisos` lo dice para que se anote allí. */
var CLASES_ENTERAS = [['HII', 10], ['RfN', 28], ['SNR', 1]];

/* Deben salir modelo = "fila", con su motivo y sin petición de red. */
var CONTROLES = [
  ['NGC 224', 'no-cabe'], ['NGC 598', 'no-cabe'], ['IC 342', 'no-cabe'],
  ['NGC 7000', 'no-cabe'], ['NGC 55', 'sur']
];

function clave(n) {
  var m = /^(NGC|IC)\s*0*(\d+)([A-Za-z]?)$/.exec(String(n || '').trim());
  return m ? m[1].toUpperCase() + m[2] + m[3].toUpperCase()
           : String(n || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

module.exports = function (R) {
  require('../simulador_ocular/resources/js/galaxias-datos.js');
  require('../simulador_ocular/resources/js/nebulosas-datos.js');
  var PS1 = window.BitacoraPS1;
  var TODAS = PS1.ps1CatalogoDifuso(window.BITACORA_GALAXIAS, window.BITACORA_NEBULOSAS);

  var indice = {};
  TODAS.forEach(function (f) {
    [f[0], f[1]].forEach(function (n) { if (n && !indice[clave(n)]) indice[clave(n)] = f; });
  });

  function apta(f) {
    return f[3] > PS1.cfg.decMin && PS1.ps1CabeEnParche(f);
  }

  function gal(f) {
    var c = PS1.ps1GalaxiasDelCampo([f], f[2], f[3], PS1.ps1LadoArcmin(f[4]));
    return c.length ? c[0] : null;
  }

  function banco() {
    var objetos = [], avisos = [], vistos = {};

    NOMBRADOS.forEach(function (par) {
      var f = indice[clave(par[0])];
      if (!f) { avisos.push('NO ESTÁ en el catálogo: ' + par[0]); return; }
      if (!apta(f)) { avisos.push('ya no es apta (' + par[1] + '): ' + par[0]); return; }
      vistos[clave(f[0])] = 1;
      objetos.push({ nombre: f[0], fila: f, motivo: par[1], gal: gal(f) });
    });

    CLASES_ENTERAS.forEach(function (par) {
      var clase = par[0], esperadas = par[1];
      var suyas = TODAS.filter(function (f) { return (f[12] || '') === clase && apta(f); });
      if (suyas.length !== esperadas) {
        avisos.push('la clase ' + clase + ' tiene ' + suyas.length + ' aptas y el ADR 0024 ' +
                    'escribió ' + esperadas + ': el banco crece con el catálogo');
      }
      suyas.forEach(function (f) {
        if (vistos[clave(f[0])]) return;
        vistos[clave(f[0])] = 1;
        objetos.push({ nombre: f[0], fila: f, motivo: 'clase entera ' + clase, gal: gal(f) });
      });
    });

    var controles = CONTROLES.map(function (par) {
      var f = indice[clave(par[0])];
      var esperado = par[1], real = !f ? 'ausente'
        : (!(f[3] > PS1.cfg.decMin) ? 'sur' : (!PS1.ps1CabeEnParche(f) ? 'no-cabe' : 'APTA'));
      if (real !== esperado) {
        avisos.push('el control ' + par[0] + ' debía salir ' + esperado + ' y sale ' + real);
      }
      return { nombre: par[0], fila: f || null, esperado: esperado, real: real };
    });

    return { objetos: objetos, controles: controles, avisos: avisos, catalogo: TODAS };
  }

  return { banco: banco, apta: apta, gal: gal, clave: clave,
           NOMBRADOS: NOMBRADOS, CLASES_ENTERAS: CLASES_ENTERAS, CONTROLES: CONTROLES };
};
