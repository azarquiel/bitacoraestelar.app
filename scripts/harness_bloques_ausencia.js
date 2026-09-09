#!/usr/bin/env node
/* Barrido de bloques de ausencia sobre las texturas DSO YA ESCRITAS (#259).

   Por qué existe: una skycell que falla al descargarse se descartaba en silencio
   y el parche salía adelante con las que sobrevivieron. El agujero que deja no
   se parece a la máscara de estrellas —es un bloque rectangular, una sola
   componente conexa grande que llena casi entera su caja envolvente—, y así es
   como se destapó NGC 4486. El generador ya mide esto al escribir cada textura
   (`auditoria.bloqueMayorFrac`), pero las texturas anteriores a #259 no lo
   traen en su sidecar: esto lo mide de los PNG, sin volver a la red.

   No dicta veredictos: Abell 12 dispara la señal con la máscara de μ Ori, que es
   ausencia legítima. Es la lista de lo que hay que mirar.

   Los píxeles se leen con el decodificador del NAVEGADOR (BitacoraPNG16) y el
   centinela de ausencia lo dice el sidecar, no este fichero (ADR 0008).

   Uso:  node scripts/harness_bloques_ausencia.js
         node scripts/harness_bloques_ausencia.js --dir simulador_ocular/dso */
'use strict';

var fs = require('fs'), path = require('path');
var RAIZ = path.join(__dirname, '..');
var G = require('./gen_dso_texturas.js');
var PS1 = window.BitacoraPS1, P16 = window.BitacoraPNG16;

function arg(n, pordefecto) {
  var i = process.argv.indexOf(n);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : pordefecto;
}

var dirs = [G.FIXTURES, path.resolve(RAIZ, arg('--dir', path.join('simulador_ocular', 'dso')))]
  .filter(function (d, i, t) { return fs.existsSync(d) && t.indexOf(d) === i; });

/* Cada textura escrita: sidecar con su PNG al lado. Los `.fila.json` no tienen
   píxeles que mirar.

   Un objeto que esté en los dos directorios se mide una vez: mismo nombre y
   misma versión son los mismos píxeles. */
var texturas = [], vistas = {};
dirs.forEach(function (d) {
  fs.readdirSync(d).filter(function (n) { return /\.json$/.test(n) && !/\.fila\.json$/.test(n); })
    .forEach(function (n) {
      var s = JSON.parse(fs.readFileSync(path.join(d, n), 'utf8'));
      var id = PS1.ps1IdTextura(s.nombre) + '.' + s.version;
      var png = path.join(d, id + '.png');
      if (!fs.existsSync(png) || vistas[id]) return;
      vistas[id] = 1;
      texturas.push({ sidecar: s, png: png, dir: d });
    });
});

console.log('Barrido de bloques de ausencia · ' + texturas.length + ' textura(s) en ' +
  dirs.map(function (d) { return path.relative(RAIZ, d); }).join(', '));
console.log('Firma: mayor componente > ' + (100 * G.BLOQUE_FRAC).toFixed(0) + ' % del parche con ' +
  'relleno de caja > ' + (100 * G.BLOQUE_RELLENO).toFixed(0) + ' %\n');

texturas.reduce(function (cadena, t) {
  return cadena.then(function () {
    return P16.leer(fs.readFileSync(t.png)).then(function (img) {
      if (!img) { console.log('ILEGIBLE  ' + path.basename(t.png)); return; }
      var centinela = (t.sidecar.codificacion || {}).centinela;
      if (centinela === undefined) centinela = 0;
      var ausente = new Uint8Array(img.u16.length);
      for (var i = 0; i < img.u16.length; i++) ausente[i] = img.u16[i] === centinela ? 1 : 0;
      var b = G.bloqueDeAusencia(ausente, img.ancho, img.alto);
      var aus = 0;
      for (i = 0; i < ausente.length; i++) aus += ausente[i];
      t.medida = { ausencia: aus / ausente.length, bloque: b };
    });
  });
}, Promise.resolve()).then(function () {
  var medidas = texturas.filter(function (t) { return t.medida; });
  var sospechosas = medidas.filter(function (t) { return G.bloqueSospechoso(t.medida.bloque); })
    .sort(function (a, c) { return c.medida.bloque.mayorFrac - a.medida.bloque.mayorFrac; });

  console.log('| objeto | ausencia | mayor bloque | relleno de su caja | componentes |');
  console.log('|---|---|---|---|---|');
  sospechosas.forEach(function (t) {
    var m = t.medida;
    console.log('| ' + t.sidecar.nombre + ' | ' + (100 * m.ausencia).toFixed(2) + ' % | ' +
      (100 * m.bloque.mayorFrac).toFixed(2) + ' % | ' + (100 * m.bloque.rellenoCaja).toFixed(0) +
      ' % | ' + m.bloque.componentes + ' |');
  });
  if (!sospechosas.length) console.log('| — | ninguna dispara la firma | | | |');

  /* El peor de los que NO disparan, para ver por dónde va el margen: si un día
     la firma deja pasar una celda perdida, se verá aquí primero. */
  var resto = medidas.filter(function (t) { return !G.bloqueSospechoso(t.medida.bloque); })
    .sort(function (a, c) { return c.medida.bloque.mayorFrac - a.medida.bloque.mayorFrac; })[0];
  if (resto) {
    console.log('\nEl mayor de los que no la disparan: ' + resto.sidecar.nombre + ' · bloque ' +
      (100 * resto.medida.bloque.mayorFrac).toFixed(2) + ' %, caja ' +
      (100 * resto.medida.bloque.rellenoCaja).toFixed(0) + ' %, ' +
      resto.medida.bloque.componentes + ' componentes');
  }
  console.log('\n' + sospechosas.length + ' de ' + medidas.length + ' a mirar.');
}).catch(function (e) { console.error(e.stack || e.message); process.exit(1); });
