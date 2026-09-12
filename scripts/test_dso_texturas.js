#!/usr/bin/env node
/* El generador de texturas DSO (scripts/gen_dso_texturas.js) por el lado del
   ESCRITOR: lo que test_fuente_parche.js prueba es el lector.

   Lo que se vigila aquí:

     · el hash de versión depende de TODO lo que determina los píxeles y de nada
       más, porque la URL que lo lleva es inmutable: dos texturas distintas con
       el mismo nombre serían una imagen vieja servida para siempre;
     · el generador encuentra los objetos por los dos formatos de nombre que
       conviven en el catálogo ('NGC 5194' y 'NGC0040'), y su motivo de ausencia
       es el mismo veredicto que el del banco;
     · el manifiesto commiteado es exactamente el que sale de los sidecars
       commiteados: si alguien edita uno de los dos a mano, se ve;
     · y cubre el banco del ADR 0024: los controles de exclusión salen «fila»
       con su motivo y sin red, y un objeto sin textura NO tiene fila, porque
       una fila sin motivo apagaría el respaldo por proxy en silencio. La
       cardinalidad la devuelve lib_banco_dso.js, no este fichero (ADR 0005);
     · la ausencia se juzga DENTRO de la extensión del objeto y no en el parche
       ni en la escena (#229): un objeto entero dentro del agujero sale «fila»
       con motivo `ausencia-excesiva`, y uno con la ausencia repartida por fuera
       y el interior medido sigue siendo `imagen`;
     · el informe (docs/validacion/dso_texturas_informe.md) sale de lo escrito y
       regenerarlo no cambia un byte;
     · y los bits publicados son los que dicen ser: la textura del banco, leída
       con el decodificador del navegador y recodificada con los parámetros de
       su sidecar, vuelve a dar los mismos 16 bits.

   Sin red y sin $PS1_HARNESS_DIR: todo sale de scripts/fixtures/dso/.

   Uso:  node scripts/test_dso_texturas.js */
'use strict';

var fs = require('fs'), path = require('path');
var RAIZ = path.join(__dirname, '..');
global.window = global.window || {};
require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-ps1.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-png16.js'));
var PS1 = window.BitacoraPS1, P16 = window.BitacoraPNG16;
var G = require('./gen_dso_texturas.js');

var fallos = 0, comprobaciones = 0;
function ok(c, t) {
  comprobaciones++;
  console.log('  ' + (c ? 'ok  ' : 'FALLO') + '  ' + t);
  if (!c) fallos++;
}

var M51 = { nombre: 'NGC 5194', ra: 202.47208, dec: 47.19667, ladoArcmin: 18.035 };

console.log('\nEl hash de versión:');
var v0 = G.version(M51, 1024);
ok(/^[0-9a-f]{8}$/.test(v0), 'son 8 hex (' + v0 + ')');
ok(G.version(M51, 1024) === v0, 'mismo objeto y mismos parámetros, mismo hash');
/* Cada campo, por separado: si uno dejara de entrar, dos parches distintos
   compartirían nombre de fichero y el segundo no llegaría nunca al navegador,
   porque la URL se sirve como inmutable. */
[['nombre', 'NGC 5195'], ['ra', 202.5], ['dec', 47.2], ['ladoArcmin', 18.04]].forEach(function (par) {
  var otro = {};
  Object.keys(M51).forEach(function (k) { otro[k] = M51[k]; });
  otro[par[0]] = par[1];
  ok(G.version(otro, 1024) !== v0, 'cambiar ' + par[0] + ' cambia el hash');
});
ok(G.version(M51, 2048) !== v0, 'cambiar la resolución de salida cambia el hash');

console.log('\nEncontrar el objeto en el catálogo:');
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'nebulosas-datos.js'));
var m51 = G.filaDe('NGC 5194');
ok(!!m51 && m51[0] === 'NGC 5194', 'una galaxia, por su nombre literal');
/* Las nebulosas van 'NGC0040' y las galaxias 'NGC 5194': con una comparación
   literal, el generador no vería la mitad del catálogo. */
var pn = G.filaDe('NGC 40');
ok(!!pn, 'una nebulosa escrita «NGC 40», que en su catálogo es «NGC0040»');
ok(G.filaDe('no existe tal cosa') === null, 'y lo que no está devuelve null');

console.log('\nPor qué un objeto no tiene textura:');
ok(G.motivoAusencia(m51) === '', 'M51 sí puede tenerla');
var m31 = G.filaDe('NGC 224'), ngc55 = G.filaDe('NGC 55');
ok(!!m31 && G.motivoAusencia(m31) === 'no-cabe', 'M31 no cabe en el parche');
ok(!!ngc55 && G.motivoAusencia(ngc55) === 'sur', 'NGC 55 está por debajo de −30° (' +
   (ngc55 ? G.motivoAusencia(ngc55) : '—') + ')');

/* Sobre el DIRECTORIO DE SALIDA, no solo sobre las fixtures (#258): desde que
   los sidecars del banco van en git —solo se ignoran los PNG—, las filas del
   manifiesto vuelven a tener todas su origen en el repositorio, y regenerar
   mirando solo `scripts/fixtures/dso/` declararía de menos. `sidecarsUnicos` ya
   junta los dos directorios, así que esto los cubre a la vez.

   Y se compara la CADENA, sin escribir: el fichero de producción no se toca.
   Sobreescribirlo para releerlo y restaurarlo era inocuo con seis filas; con
   setenta y cuatro, un test interrumpido deja el manifiesto hecho un muñón. */
console.log('\nEl manifiesto commiteado sale de los sidecars commiteados:');
var antes = fs.readFileSync(G.MANIFIESTO, 'utf8');
var m = G.textoManifiesto(G.DSO), n = m.filas;
var despues = m.texto;
ok(antes === despues, 'regenerarlo no cambia un byte (' + n + ' fila(s))');
function sidecarsDe(d) {
  return fs.existsSync(d) ? fs.readdirSync(d).filter(function (f) { return /\.json$/.test(f); }) : [];
}
/* Uno por objeto, no uno por fichero: un objeto que esté en los dos directorios
   —las fixtures y la salida— aporta una sola fila. */
/* Con la MISMA prioridad que el generador (veredicto medido > textura > el resto
   de veredictos): si un objeto tuviera las dos cosas, aquí y allí tiene que
   contar igual, o la cuenta discreparía por un empate mal resuelto. */
function rango(s) { return s.modelo !== 'fila' ? 1 : (s.motivo === 'ausencia-excesiva' ? 2 : 0); }
var mandaPorNombre = {};
[G.FIXTURES, G.DSO].forEach(function (d) {
  sidecarsDe(d).forEach(function (f) {
    var s = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')), v = mandaPorNombre[s.nombre];
    if (!v || rango(s) >= rango(v)) mandaPorNombre[s.nombre] = s;
  });
});
var modeloPorNombre = {};
Object.keys(mandaPorNombre).forEach(function (nom) {
  modeloPorNombre[nom] = mandaPorNombre[nom].modelo !== 'fila' ? 'imagen' : 'fila';
});
var nombresSidecar = Object.keys(modeloPorNombre);
var sidecars = nombresSidecar.filter(function (x) { return modeloPorNombre[x] === 'imagen'; }).length;
ok(n === nombresSidecar.length + G.filasControl().length,
   'una fila por sidecar y una por control, ni más ni menos');

/* El banco lo fija el ADR 0024 y lo devuelve lib_banco_dso.js: ni la lista ni su
   tamaño se escriben aquí (ADR 0005), porque clavar el número hace que el
   guardián falle el día que el catálogo crezca en vez de crecer con él. */
console.log('\nEl manifiesto cubre el banco (ADR 0024):');
var B = require('./lib_banco_dso.js')(window.BitacoraGaiaRender);
var b = B.banco();
b.avisos.forEach(function (a) { console.log('  AVISO · ' + a); });
/* Se lee el manifiesto RECIÉN generado (`despues`), no el commiteado: la
   comprobación de arriba ya dice que son el mismo byte a byte, así que juzgar el
   generado ata estas promesas al código y no solo al fichero de git. */
var MAN = (new Function('window', despues + ';return window.BITACORA_DSO_TEXTURAS;'))({});
function filaMan(nombre) {
  for (var i = 0; i < MAN.length; i++) if (MAN[i][0] === nombre) return MAN[i];
  return null;
}
ok(b.objetos.length > 0 && b.controles.length > 0,
   'el banco trae ' + b.objetos.length + ' objetos y ' + b.controles.length + ' controles');

/* Los controles, uno a uno: son la promesa de que «no tiene textura» viaja como
   dato con su motivo, y no como silencio que el runtime resolvería pidiendo el
   FITS al proxy. La cardinalidad de este bucle la pone el banco. */
b.controles.forEach(function (c) {
  var f = filaMan(c.fila ? c.fila[0] : c.nombre);
  var bien = !!f && f[1] === 'fila' && f[6] === c.esperado && f[2] === '';
  ok(bien, 'el control ' + c.nombre + ' sale «fila» con motivo «' + c.esperado + '»' +
     (bien ? '' : ' — y sale ' + JSON.stringify(f)));
});

/* «Sin pedir red» no es una promesa del runtime aquí: es que el veredicto de los
   controles se calcula del catálogo. Con `fetch` puesto a estallar, sigue. */
var fetchOriginal = global.fetch;
global.fetch = function () { throw new Error('el generador ha pedido red'); };
var control0 = null, exploto = '';
try { control0 = G.filasControl(); } catch (e) { exploto = e.message; }
global.fetch = fetchOriginal;
ok(control0 && control0.length === b.controles.length && !exploto,
   'las filas de los controles salen sin una sola petición' + (exploto ? ' — ' + exploto : ''));

/* Un objeto del banco está en el manifiesto si —y solo si— tiene su textura
   escrita: sin fila, el runtime cae al proxy, que es el régimen mixto de la
   fase 1. Una fila «fila» con motivo vacío apagaría ese respaldo en silencio. */
var enManifiesto = 0, alProxy = 0, resueltos = 0, malos = [];
b.objetos.forEach(function (o) {
  var f = filaMan(o.nombre);
  var id = window.BitacoraPS1.ps1IdTextura(o.nombre);
  /* En los dos directorios (#258): el sidecar de un objeto del banco vive en
     `simulador_ocular/dso/` y el de los golden en las fixtures, y los dos están
     en git. Mirar solo las fixtures haría «está en el manifiesto sin sidecar»
     de las 57 filas legítimas de la tirada. */
  var hay = [G.FIXTURES, G.DSO].some(function (d) {
    return sidecarsDe(d).some(function (x) { return x.indexOf(id + '.') === 0; });
  });
  if (hay) resueltos++;
  if (!f) { alProxy++; if (hay) malos.push(o.nombre + ' tiene sidecar y no está en el manifiesto'); return; }
  enManifiesto++;
  if (!hay) malos.push(o.nombre + ' está en el manifiesto sin sidecar');
  if (f[1] === 'fila' && !f[6]) malos.push(o.nombre + ' es «fila» sin motivo');
});
ok(enManifiesto + alProxy === b.objetos.length && !malos.length,
   'los ' + b.objetos.length + ' objetos del banco: ' + enManifiesto + " declarados, " +
   alProxy + ' al proxy' + (malos.length ? ' — ' + malos.join('; ') : ''));

/* Decisión 9.1 del ADR 0024: en el repositorio van las texturas de los 11
   objetos golden «y solo esas». El banco entero son 93 MB y no entra; los
   otros 58 se descargan como hoy. La lista la pone lib_banco_dso.js. */
console.log('\nEstán versionadas las texturas del banco golden, y solo esas:');
var enRepo = {};
fs.readdirSync(G.FIXTURES).forEach(function (f) {
  var m = /^(.+)\.[0-9a-f]{8}\.(png|json)$/.exec(f);
  if (m) enRepo[m[1]] = (enRepo[m[1]] || 0) + 1;
});
B.GOLDEN.forEach(function (n) {
  ok(enRepo[PS1.ps1IdTextura(n)] === 2, n + ' tiene su PNG y su sidecar en scripts/fixtures/dso/');
});
var sobran = Object.keys(enRepo).filter(function (id) {
  return !B.GOLDEN.some(function (n) { return PS1.ps1IdTextura(n) === id; });
});
ok(!sobran.length, 'y no hay ninguna textura de más' + (sobran.length ? ': ' + sobran.join(', ') : ''));

/* La regla de #229: si el objeto no tiene imagen DONDE ESTÁ EL OBJETO, no hay
   imagen. Se prueba sobre parches sintéticos —la regla es geométrica y no
   necesita PS1— y luego sobre el veredicto escrito, que sí sale de píxeles
   reales. Es un criterio y no un umbral: el corte está en «ningún píxel medido
   dentro del objeto», así que no hay ninguna raya que estos casos rocen. */
console.log('\nAusencia excesiva: dónde se mide y qué se exige:');
var galSint = { nombre: 'sintética', ra: 0, dec: 0, ladoArcmin: 1, reArcsec: 10, ba: 1, pa: 0, clase: '' };
var LADO = 64, fitsSint = { ancho: LADO, alto: LADO, escalaAs: 1, wcs: null };
var afinSint = PS1.ps1AfinParche(fitsSint, galSint);
function parche(dentroNaN, fueraNaN) {
  var d = new Float32Array(LADO * LADO);
  for (var y = 0; y < LADO; y++) for (var x = 0; x < LADO; x++) {
    var dx = x - afinSint.cx, dy = y - afinSint.cy;
    var dentro = dx * dx + dy * dy <= 10 * 10;
    d[y * LADO + x] = (dentro ? dentroNaN : fueraNaN) ? NaN : 1;
  }
  return d;
}
var rSint = G.radioObjetoAs(galSint), extSint = G.extensionDelObjeto(galSint, afinSint);
ok(rSint === 10, 'sin borde real, la extensión del objeto es r_e (' + rSint + '″)');
/* Una compacta (PN/SNR) sí tiene borde físico, y es más ancho que su r_e: si la
   regla midiera con r_e en las compactas, juzgaría solo el 60 % del objeto. */
var galPN = { nombre: 'pn', ra: 0, dec: 0, ladoArcmin: 1, reArcsec: 10, ba: 1, pa: 0, clase: 'PN' };
ok(G.radioObjetoAs(galPN) === PS1.ps1RadioBordeAs(galPN) && G.radioObjetoAs(galPN) > 10,
   'y en una compacta es el borde real, no r_e (' + G.radioObjetoAs(galPN).toFixed(1) + '″)');

var todoDentro = G.ausenciaEnObjeto(parche(true, false), LADO, LADO, afinSint, extSint);
ok(todoDentro.n > 0 && todoDentro.frac === 1 && G.ausenciaExcesiva(todoDentro),
   'el objeto entero dentro del agujero: ' + todoDentro.ausentes + '/' + todoDentro.n + ' → fila');
/* El control: NGC 253 es esto, la ausencia repartida por fuera mientras el
   interior está medido. Sigue siendo `imagen` pase lo que pase con el parche. */
var soloFuera = G.ausenciaEnObjeto(parche(false, true), LADO, LADO, afinSint, extSint);
ok(soloFuera.frac === 0 && !G.ausenciaExcesiva(soloFuera),
   'ausencia repartida fuera del objeto y el interior medido: sigue siendo imagen');
var casiTodo = parche(true, false);
casiTodo[Math.round(afinSint.cy) * LADO + Math.round(afinSint.cx)] = 1;
var unPixel = G.ausenciaEnObjeto(casiTodo, LADO, LADO, afinSint, extSint);
ok(unPixel.frac < 1 && !G.ausenciaExcesiva(unPixel),
   'con un solo píxel medido dentro ya hay imagen: el criterio no es un umbral');
/* Un objeto sin extensión en el catálogo no lo juzga esta regla: no hay nada
   que medir, y `n = 0` no puede significar «todo ausente». */
var galSinR = { nombre: 'sin r_e', ra: 0, dec: 0, ladoArcmin: 1, reArcsec: 0, ba: 1, pa: 0, clase: '' };
var sinR = G.ausenciaEnObjeto(parche(true, true), LADO, LADO, afinSint,
                              G.extensionDelObjeto(galSinR, afinSint));
ok(sinR.n === 0 && !G.ausenciaExcesiva(sinR), 'sin extensión medible, no hay veredicto');
/* La región es la ELIPSE del objeto, no un círculo: la pertenencia la decide
   `ps1FuenteEnEscena`, así que un objeto de canto no arrastra al veredicto el
   cielo que tiene por encima y por debajo. */
var galPlana = { nombre: 'de canto', ra: 0, dec: 0, ladoArcmin: 1, reArcsec: 10, ba: 0.2, pa: 0, clase: '' };
var plana = G.ausenciaEnObjeto(parche(true, false), LADO, LADO, afinSint,
                               G.extensionDelObjeto(galPlana, afinSint));
ok(plana.n > 0 && plana.n < todoDentro.n * 0.5,
   'con b/a = 0,2 la región es la elipse y no el círculo (' + plana.n + ' px de ' +
   todoDentro.n + ')');

/* Y el veredicto escrito, sobre píxeles reales. El nombre no se escribe aquí: se
   lee de los sidecars de las fixtures (ADR 0005), que es quien lo sabe. */
var excesivas = fs.readdirSync(G.FIXTURES).filter(function (f) { return /\.fila\.json$/.test(f); })
  .map(function (f) { return JSON.parse(fs.readFileSync(path.join(G.FIXTURES, f), 'utf8')); })
  .filter(function (s) { return s.motivo === 'ausencia-excesiva'; });
ok(excesivas.length > 0, 'hay ' + excesivas.length + ' objeto(s) con veredicto de ausencia excesiva');
excesivas.forEach(function (s) {
  var f = filaMan(s.nombre);
  ok(!!f && f[1] === 'fila' && f[6] === 'ausencia-excesiva' && f[2] === '',
     s.nombre + ' viaja al runtime como «fila» con motivo «ausencia-excesiva»' +
     (f ? '' : ' — y no está en el manifiesto'));
  /* Reanudable y auditable: el veredicto conserva con qué se midió, para poder
     revisarlo sin volver a bajar el parche. */
  ok(!!s.auditoria && s.auditoria.fracAusenciaObjeto === 1 && s.auditoria.radioObjetoAs > 0 &&
     s.auditoria.pxObjeto > 0,
     'y con su auditoría: ' + (s.auditoria ? s.auditoria.pxObjeto + ' px dentro de ' +
     s.auditoria.radioObjetoAs.toFixed(1) + '″, todos ausentes' : 'NO LA TRAE'));
  var id = PS1.ps1IdTextura(s.nombre);
  var pngs = fs.readdirSync(G.FIXTURES).filter(function (f) {
    return f.indexOf(id + '.') === 0 && /\.png$/.test(f);
  });
  ok(!pngs.length, 'y no deja PNG: lo que había no era una imagen del objeto' +
     (pngs.length ? ' — ' + pngs.join(', ') : ''));
});

/* Y el veredicto no lo resucita un parche viejo en disco: `ausencia-excesiva` se
   dictó MIRANDO esa textura, así que no caduca porque los píxeles sigan ahí
   (a diferencia de `sin-cobertura`, que sí). Un directorio de salida con la
   textura rechazada dentro es exactamente lo que queda en la máquina de quien
   generó el banco antes de esta regla. */
if (excesivas.length) {
  var tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'dso-229-'));
  var viejo = excesivas[0];
  fs.writeFileSync(path.join(tmpDir, PS1.ps1IdTextura(viejo.nombre) + '.deadbeef.json'),
    JSON.stringify({ nombre: viejo.nombre, version: 'deadbeef', ra: viejo.ra, dec: viejo.dec,
                     ancho: 1024, alto: 1024, escalaAs: 0.5,
                     auditoria: { fracAusencia: viejo.auditoria.fracAusencia } }));
  var conVieja = G.textoManifiesto(tmpDir).texto;
  fs.rmSync(tmpDir, { recursive: true, force: true });
  var fv = (new Function('window', conVieja + ';return window.BITACORA_DSO_TEXTURAS;'))({})
    .filter(function (f) { return f[0] === viejo.nombre; })[0];
  ok(!!fv && fv[1] === 'fila' && fv[6] === 'ausencia-excesiva',
     'la textura rechazada que siga en el directorio de salida no resucita a «imagen»' +
     (fv ? '' : ' — y ' + viejo.nombre + ' desaparece del manifiesto'));
}

console.log('\nEl informe sale de lo escrito:');
var infAntes = fs.readFileSync(G.INFORME, 'utf8');
var inf = G.textoInforme(G.DSO);
ok(infAntes === inf.texto, 'regenerarlo no cambia un byte');
/* El volumen sale del peso que declara cada sidecar (#258), no de los PNG, que
   no están en git: si alguno se quedara sin declararlo, el informe lo diría en
   su propia línea en vez de restarlo del total en silencio. */
ok(inf.sinPeso === 0, 'todas las texturas declaran su peso' +
   (inf.sinPeso ? ' — ' + inf.sinPeso + ' sin `auditoria.bytes` y sin PNG a mano' : ''));
ok(inf.imagenes === sidecars && inf.pendientes === b.objetos.length - resueltos,
   'cuenta las ' + inf.imagenes + ' texturas escritas y las ' + inf.pendientes + ' pendientes');
ok(/fracAusenciaEscena/.test(infAntes) && /Volumen/.test(infAntes),
   'trae la lista de revisión y el volumen');
ok(new RegExp('\\| ausencia-excesiva \\| ' + excesivas.length + ' \\|').test(infAntes),
   'y cuenta los ' + excesivas.length + ' de «ausencia-excesiva» por motivo, no en revisión');

console.log('\nLos bits publicados son los que dice el sidecar:');
var sc = JSON.parse(fs.readFileSync(path.join(G.FIXTURES, PS1.ps1IdTextura('NGC 5194') + '.' + v0 + '.json'), 'utf8'));
ok(sc.version === v0, 'el sidecar del banco lleva el hash que este generador calcula hoy');
ok(sc.generador === G.GENERADOR, 'y la versión del generador que lo escribió (' + sc.generador + ')');
ok(Math.abs(sc.escalaAs - sc.ladoArcmin * 60 / sc.ancho) < 1e-3,
   'la escala declarada es el lado entre los píxeles (' + sc.escalaAs.toFixed(4) + '″/px)');
ok(!!sc.wcs && isFinite(sc.wcs.ra0) && isFinite(sc.wcs.gx),
   'trae la WCS del recorte, no el supuesto de norte arriba');

/* ── La firma de una celda perdida (#259) ────────────────────────────────────
   Dos condiciones y las dos hacen falta: un bloque grande QUE ADEMÁS llene su
   caja. La máscara de estrellas es muchas manchas pequeñas, y una ausencia
   grande pero desperdigada no es una celda que falta. */
console.log('\nLa firma de una celda perdida:');
var LB = 64;
function mascara(pinta) {
  var m = new Uint8Array(LB * LB);
  for (var y = 0; y < LB; y++) for (var x = 0; x < LB; x++) if (pinta(x, y)) m[y * LB + x] = 1;
  return m;
}
var rect = G.bloqueDeAusencia(mascara(function (x, y) {
  return x >= 10 && x < 30 && y >= 10 && y < 30;
}), LB, LB);
ok(rect.componentes === 1 && rect.mayorPx === 400 && Math.abs(rect.rellenoCaja - 1) < 1e-12,
   'un bloque rectangular es UNA componente que llena su caja entera (' +
   rect.componentes + ', ' + (100 * rect.rellenoCaja).toFixed(0) + ' %)');
ok(G.bloqueSospechoso(rect), 'y dispara la firma (' + (100 * rect.mayorFrac).toFixed(1) + ' % del parche)');
/* NGC 253: cientos de manchitas repartidas. Ausencia alta, ninguna componente
   grande. */
var motas = G.bloqueDeAusencia(mascara(function (x, y) {
  return x % 4 === 0 && y % 4 === 0;
}), LB, LB);
ok(motas.componentes === 256 && !G.bloqueSospechoso(motas),
   'una máscara de estrellas son muchas componentes diminutas y no la dispara (' +
   motas.componentes + ' componentes, ' + (100 * motas.mayorFrac).toFixed(2) + ' %)');
/* Y la otra mitad de la firma: una banda diagonal es una sola componente que
   pasa del 3 % del parche, pero apenas llena su caja envolvente. */
var banda = G.bloqueDeAusencia(mascara(function (x, y) {
  return Math.abs(x - y) < 2;
}), LB, LB);
ok(banda.componentes === 1 && banda.mayorFrac > G.BLOQUE_FRAC && !G.bloqueSospechoso(banda),
   'una componente grande que NO llena su caja tampoco la dispara (' +
   (100 * banda.mayorFrac).toFixed(1) + ' % del parche, ' +
   (100 * banda.rellenoCaja).toFixed(0) + ' % de caja)');
var sinNada = G.bloqueDeAusencia(new Uint8Array(LB * LB), LB, LB);
ok(sinNada.componentes === 0 && sinNada.mayorFrac === 0 && !G.bloqueSospechoso(sinNada),
   'y un parche sin un solo hueco no tiene bloque ninguno');

/* `celda-perdida` NO cierra el objeto: es una avería de red, no una propiedad
   del cielo, así que la corrida siguiente lo vuelve a pedir. Los demás motivos
   sí lo cierran —si no, se le volvería a pedir a STScI lo que ya se sabe. */
/* ── El campo vecino (#285, ADR 0028) ─────────────────────────────────────
   El cielo y la σ de un parche salen de un recorte apuntado FUERA del objeto.
   Aquí se comprueba la geometría —dirección, desplazamiento y distancia a la
   difusa más cercana— y la ley del cielo, las dos sin red: la geometría sale
   del catálogo y la ley, de un campo sintético.

   La σ de verdad de IC 0059 (≈79 DN) no se comprueba aquí porque exige bajar el
   recorte; lo que se fija es lo que decide DÓNDE se baja. */
console.log('\nEl campo vecino:');
var catDif = PS1.ps1CatalogoDifuso(window.BITACORA_GALAXIAS, window.BITACORA_NEBULOSAS);
var RADT = require('./lib_radio_objeto.js')(PS1);

function campoVecinoDe(nombre) {
  var f = G.filaDe(nombre);
  var gal = PS1.ps1GalaxiasDelCampo([f], f[2], f[3], PS1.ps1LadoArcmin(f[4]))[0];
  /* El parche, con su geometría y sin sus píxeles: el radio de escena sale del
     modelo —la isofota μ25—, no de la imagen, así que no hace falta el PNG. */
  var fits = { ancho: 1024, alto: 1024, escalaAs: gal.ladoArcmin * 60 / 1024, wcs: null };
  fits.afin = PS1.ps1AfinParche(fits, gal);
  return { gal: gal, rObj: RADT.rObjMaxAs(fits, f, gal),
           v: PS1.ps1CampoVecino(gal, RADT.rObjMaxAs(fits, f, gal), catDif) };
}

/* IC 0059, que es el que midió #274: 9,5′ hacia el oeste con la difusa más
   cercana a 27,8′. */
var ic59 = campoVecinoDe('IC0059');
ok(ic59.v.dir === 'O', 'IC 0059 manda su campo vecino al oeste (' + ic59.v.dir + ')');
ok(Math.abs(ic59.v.offsetArcmin - 9.5) < 0.1,
   'a 9,5′ del objeto (' + ic59.v.offsetArcmin.toFixed(2) + '′)');
ok(Math.abs(ic59.v.cerca - 27.8) < 0.1,
   'y con la difusa más cercana a 27,8′ (' + ic59.v.cerca.toFixed(1) + '′)');
ok(Math.abs(ic59.v.ladoArcmin - ic59.gal.ladoArcmin) < 1e-12,
   'con el MISMO lado que el parche de producción, que es lo que hace comparable la σ');

/* El desplazamiento es `max(1,5·lado, 2·r_obj)`, y las dos ramas mandan en
   objetos distintos: en IC 0059 el parche ya es holgado y manda el lado; en
   NGC 253 la escena μ25 se sale del parche y manda el objeto. Si una de las dos
   ramas desapareciera, uno de los dos campos vecinos caería sobre su objeto. */
ok(Math.abs(ic59.v.offsetArcmin - 1.5 * ic59.gal.ladoArcmin) < 1e-9,
   'en IC 0059 el desplazamiento lo pone el lado del parche (1,5·lado = ' +
   (1.5 * ic59.gal.ladoArcmin).toFixed(2) + '′, 2·r_obj = ' + (2 * ic59.rObj / 60).toFixed(2) + '′)');
var n253 = campoVecinoDe('NGC 253');
ok(Math.abs(n253.v.offsetArcmin - 2 * n253.rObj / 60) < 1e-9 &&
   2 * n253.rObj / 60 > 1.5 * n253.gal.ladoArcmin,
   'y en NGC 253 lo pone el objeto, que se sale del parche (2·r_obj = ' +
   (2 * n253.rObj / 60).toFixed(2) + '′ > 1,5·lado = ' + (1.5 * n253.gal.ladoArcmin).toFixed(2) + '′)');

/* La ley del cielo del campo vecino NO es la del marco: el recorte entero es
   cielo, así que mira todos los píxeles medidos. Campo sintético: cielo 100 con
   un cuadrado brillante en el centro que ocupa menos de la mitad. */
var LV = 64, campo = new Float32Array(LV * LV);
for (var yv = 0; yv < LV; yv++) {
  for (var xv = 0; xv < LV; xv++) {
    var borde = (xv % 2 ? 1 : -1);                    // ±1 DN de ruido
    campo[yv * LV + xv] = (xv > 20 && xv < 44 && yv > 20 && yv < 44) ? 900 : 100 + borde;
  }
}
campo[0] = NaN;
var cc = PS1.ps1CieloCampo(campo);
ok(cc.n === LV * LV - 1, 'el NaN no entra en la muestra (' + cc.n + ' de ' + (LV * LV) + ')');
ok(Math.abs(cc.cielo - 100) <= 1, 'el cielo es la mediana de TODO el campo (' + cc.cielo + ')');
ok(Math.abs(cc.sigma - 1.4826 * 2) < 1e-3,
   'y la σ, la MAD robusta (×1,4826) de esa misma muestra (' + cc.sigma.toFixed(4) + ')');
/* Y no es la ley del marco, que es justo lo que decidió el ADR 0028: en un
   campo cuyo BORDE es objeto —los 35 del banco— `ps1Cielo` devuelve el objeto y
   `ps1CieloCampo`, el cielo. */
var borde = new Float32Array(LV * LV);
for (var yb = 0; yb < LV; yb++) {
  for (var xb = 0; xb < LV; xb++) {
    var fuera = (xb < 8 || xb >= LV - 8 || yb < 8 || yb >= LV - 8);
    borde[yb * LV + xb] = fuera ? 900 : 100;
  }
}
ok(PS1.ps1Cielo(borde, LV, LV) === 900 && PS1.ps1CieloCampo(borde).cielo === 100,
   'con el objeto en el marco, la ley vieja devuelve el objeto (' +
   PS1.ps1Cielo(borde, LV, LV) + ') y esta, el cielo (' + PS1.ps1CieloCampo(borde).cielo + ')');

/* La puerta de la celda perdida es la MISMA para el parche y para su campo
   vecino (ADR 0026, punto 2): un mosaico mutilado no es cielo. */
ok(G.celdaPerdida({ celdasPedidas: 4, celdasCosidas: 3 }), 'un mosaico al que le falta una celda se detecta');
ok(!G.celdaPerdida({ celdasPedidas: 4, celdasCosidas: 4 }), 'uno completo, no');
ok(!G.celdaPerdida({}), 'y un parche de una caché anterior a #259 no se sabe, que no es lo mismo que faltar');

console.log('\nEl veredicto de celda perdida caduca solo:');
var tmpCP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'dso-259-'));
G.escribirFila(tmpCP, 'NGC 9999', 'celda-perdida', 0, 0, { celdasPedidas: 4, celdasCosidas: 3 });
ok(!G.yaResuelto(tmpCP, PS1.ps1IdTextura('NGC 9999'), v0),
   'un objeto con fila `celda-perdida` sigue pendiente');
G.escribirFila(tmpCP, 'NGC 9999', 'sin-cobertura', 0, 0);
var resSC = G.yaResuelto(tmpCP, PS1.ps1IdTextura('NGC 9999'), v0);
ok(!!resSC && resSC.estado === 'fila', 'y con `sin-cobertura` está resuelto');
fs.rmSync(tmpCP, { recursive: true, force: true });

/* La misma puerta, del lado del campo vecino (#285): una textura buena cuyo
   cielo se quedó sin medir por una avería de red se vuelve a pedir, porque el
   nombre de fichero no cambia y esa es la única corrida que puede completar el
   sidecar. Lo que el CIELO decide —sin cobertura, otra escala— no se reintenta:
   saldría igual. */
console.log('\nUn campo vecino caído por red tampoco cierra el objeto:');
var tmpCV = fs.mkdtempSync(path.join(require('os').tmpdir(), 'dso-285-'));
var idCV = PS1.ps1IdTextura('NGC 9998');
function textuaConVecino(motivo) {
  fs.writeFileSync(path.join(tmpCV, idCV + '.' + v0 + '.png'), 'no es un PNG, y da igual');
  fs.writeFileSync(path.join(tmpCV, idCV + '.' + v0 + '.json'),
    JSON.stringify({ nombre: 'NGC 9998', version: v0, vecino: motivo ? { motivo: motivo } : { cielo: 0, sigma: 1 } }));
  return G.yaResuelto(tmpCV, idCV, v0);
}
ok(!textuaConVecino('descarga-fallida'), 'con el vecino caído (`descarga-fallida`) sigue pendiente');
ok(!textuaConVecino('celda-perdida'), 'y con una celda perdida en el vecino, también');
ok(!!textuaConVecino('sin-cobertura'), 'pero sin cobertura de PS1 ahí fuera está resuelto: saldría igual');
ok(!!textuaConVecino(''), 'y con su cielo medido, resuelto');
fs.rmSync(tmpCV, { recursive: true, force: true });

/* La AR se envuelve: un objeto a 0h manda su campo vecino al oeste y el centro
   saldría negativo, que es una AR que no se puede pedir. Tres difusas de
   mentira tapan el norte, el sur y el este para que gane el oeste. */
function fal(nombre, ra, dec) { return [nombre, '', ra, dec, 60, 1, 0, 10, 1, 10, 0, 0, 'HII']; }
var a0h = { nombre: 'X', ra: 0.1, dec: 0, ladoArcmin: 10 };
var v0h = PS1.ps1CampoVecino(a0h, 60, [fal('N', 0.1, 0.25), fal('S', 0.1, -0.25), fal('E', 0.35, 0)]);
ok(v0h.dir === 'O', 'con el norte, el sur y el este ocupados, el campo vecino se va al oeste');
ok(v0h.ra >= 0 && v0h.ra < 360, 'y su AR sale en [0, 360) aunque el objeto esté a 0h (' +
   v0h.ra.toFixed(3) + '°)');

var png = fs.readFileSync(path.join(G.FIXTURES, PS1.ps1IdTextura('NGC 5194') + '.' + v0 + '.png'));
P16.leer(png).then(function (img) {
  ok(!!img && img.ancho === sc.ancho && img.alto === sc.alto,
     'el PNG se lee y mide lo que declara el sidecar');
  if (!img) return;
  var datos = P16.decodificar(img.u16, sc.codificacion);
  var ceros = 0, nan = 0, i;
  for (i = 0; i < img.u16.length; i++) {
    if (img.u16[i] === 0) ceros++;
    if (datos[i] !== datos[i]) nan++;
  }
  ok(ceros === nan && ceros > 0,
     'el centinela 0 y el NaN son el mismo píxel, todos (' + ceros + ')');
  ok(Math.abs(nan / datos.length - sc.auditoria.fracAusencia) < 1e-12,
     'y son la ausencia que auditó el generador');

  /* Ida y vuelta sobre lo PUBLICADO, con los extremos del sidecar: es la rama
     de `codificar` que usará cualquier regeneración, y la que decide si los
     bits que viajan son reproducibles. */
  var otra = P16.codificar(datos, sc.codificacion), iguales = 0;
  for (i = 0; i < otra.u16.length; i++) if (otra.u16[i] === img.u16[i]) iguales++;
  ok(iguales === otra.u16.length,
     'recodificar lo decodificado devuelve los mismos 16 bits (' +
     (otra.u16.length - iguales) + ' píxeles distintos)');

  var cielo = PS1.ps1Cielo(datos, img.ancho, img.alto);
  ok(Math.abs(cielo - sc.auditoria.cielo) < 0.05 * sc.auditoria.sigma,
     'el cielo que mide la ley de producción sobre lo publicado es el auditado (' +
     cielo.toFixed(4) + ' vs ' + sc.auditoria.cielo.toFixed(4) + ')');

  /* ADR 0005: cardinalidad mínima; sin ella, una promesa perdida deja el
     proceso en verde con la mitad sin correr. El sumando de los controles NO se
     escribe: lo pone el banco, que es quien sabe cuántos son; las 23 restantes
     son comprobaciones fijas de este fichero, no objetos.

     Mutaciones documentadas, las dos comprobadas:

       · quitar `gal.ladoArcmin.toFixed(3)` de la semilla de `version()` deja 1
         rojo, «cambiar ladoArcmin cambia el hash». Solo uno: el del sidecar del
         banco compara contra el hash que este mismo código calcula, así que se
         mueve con la mutación y no la caza. Por eso los cinco campos se prueban
         uno a uno y no por el resultado final;
       · quitar `.concat(filasControl())` de `escribirManifiesto()` deja 7 rojos:
         los 5 controles, la cuenta de filas y el manifiesto commiteado, que
         deja de salir byte a byte de lo que hay en disco;
       · medir la ausencia en el PARCHE y no dentro del objeto —anular el
         `continue` de `ps1FuenteEnEscena` en `ausenciaEnObjeto()`— deja 3
         rojos: el objeto entero en el agujero deja de salir «fila», la ausencia
         de fuera empieza a contar y la región deja de ser la elipse. Es la
         mutación de #229: dónde se mide ES la regla;
       · relajar el criterio a `a.ausentes > 0` en `ausenciaExcesiva()` deja 1
         rojo, el del píxel medido dentro: la regla es «ningún píxel medido
         dentro», no «alguno ausente». Solo uno porque el control de la ausencia
         repartida por fuera no tiene ni un píxel ausente dentro del objeto, que
         es justo lo que lo hace control. */
  /* Tres comprobaciones por objeto con veredicto y una sola —la de la textura
     rechazada que no resucita— para todos, que por eso no multiplica. */
  var MINIMO = 59 + (excesivas.length ? 1 : 0) + b.controles.length + 3 * excesivas.length;
  console.log('');
  ok(comprobaciones >= MINIMO,
     'se ejecutaron todas las comprobaciones (' + comprobaciones + ' ≥ ' + MINIMO + ')');
  console.log(fallos ? '\n' + fallos + ' fallo(s).' : '\ntodo en orden.');
  process.exit(fallos ? 1 : 0);
}).catch(function (e) {
  console.error('EXCEPCIÓN: ' + e.stack);
  process.exit(1);
});
