#!/usr/bin/env node
/* ¿La estructura de una nebulosa de emisión está en los píxeles que tenemos, o
   está y se pierde al pintarla? (#263)

   Mide los parches YA PUBLICADOS —el PNG de 16 bits del banco más su sidecar—
   sin tocar la red y sin tocar el render. Dos preguntas separadas a propósito,
   porque sus arreglos son opuestos:

    · **¿Está en los datos?** Cuenta, dentro de la extensión del objeto, cuántos
      píxeles se levantan del cielo y cuánto. Todo en unidades de σ del propio
      parche, que es lo único que no depende de ninguna ley nuestra. Si aquí no
      hay nada, ningún cambio del render lo va a sacar: la banda `g` no vio el
      Hα y la respuesta es republicar en otra banda (ADR 0026).

    · **¿Sobrevive al pintarlo?** El suelo de `ps1AnclarACatalogo` está en
      cielo + 1,5·σ y lo que cae por debajo se va a cero, y un cero no se pinta
      negro: lo rellena el perfil Sérsic del catálogo (ps1PintarParche). Así que
      un objeto puede tener estructura medida y aun así salir liso, sustituido
      por su propio modelo. La fracción de la extensión que el suelo apaga es
      exactamente ese riesgo, y el brillo superficial se da con la ley de
      producción —anclada a la magnitud del catálogo, no al ZPT de la cabecera,
      que a μ≈24 lo desplaza el residuo de cielo del stack—.

   Ninguna ley se define aquí: cielo, σ, extensión, pertenencia y anclaje son
   las funciones de `resources/js/bitacora-ps1.js` (ADR 0008).

   Y una tercera que salió de las dos primeras: **¿de dónde sale el cielo?**
   `--cielo` baja el mismo campo mucho más grande y da mediana y ruido por
   anillos, porque el borde del que producción saca el cielo cae dentro del
   objeto en toda clase difusa.

   Uso:  node scripts/harness_emision_banda.js                  # publicado, sin red
         node scripts/harness_emision_banda.js --dir <carpeta con los PNG>
         node scripts/harness_emision_banda.js --solo "NGC6888"
         node scripts/harness_emision_banda.js --solo NGC6888 --bandas g,r,i
         node scripts/harness_emision_banda.js --solo NGC6888 --cielo 40

   Veredicto y tablas: simulador_ocular/docs/validacion/emision_banda_o_ley.md */
'use strict';

var fs = require('fs'), path = require('path');
var RAIZ = path.join(__dirname, '..');

global.window = global.window || {};
require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-ps1.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-png16.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'nebulosas-datos.js'));

var PS1 = window.BitacoraPS1, P16 = window.BitacoraPNG16;
var BANCO = require('./lib_banco_dso.js')(window.BitacoraGaiaRender);

/* Los dos del ticket y sus controles. Los controles no son decorado: sin algo
   que sí se vea bien, «pocos píxeles sobre el cielo» no tiene contra qué leerse.
   NGC 6720 y NGC 7008 son PN como la Hélice; NGC 7635 es HII como la Creciente;
   NGC 1952 y NGC 5194 son las dos clases que el pipeline ya pinta bien. */
var OBJETOS = [
  ['NGC6888', 'caso    HII, Creciente'],
  ['NGC7293', 'caso    PN, Hélice'],
  ['NGC6720', 'control PN, Anillo'],
  ['NGC7008', 'control PN'],
  ['NGC7635', 'control HII, Burbuja'],
  ['NGC1952', 'control SNR, Cangrejo'],
  ['NGC 5194', 'control galaxia, M51']
];

function arg(n, pordefecto) {
  var i = process.argv.indexOf(n);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : pordefecto;
}

/* De dónde salen los PNG. Por defecto el banco publicado; los PNG no entran en
   git (2 MB cada uno) así que en un árbol recién clonado no están, y entonces
   valen los de `scripts/fixtures/dso/`, que son los mismos bytes para los siete
   objetos que llevan fixture. */
var DIRS = [arg('--dir', path.join(RAIZ, 'simulador_ocular', 'dso')),
            path.join(RAIZ, 'scripts', 'fixtures', 'dso')];

function filaDe(nombre) {
  var todas = PS1.ps1CatalogoDifuso(window.BITACORA_GALAXIAS, window.BITACORA_NEBULOSAS);
  var k = BANCO.clave(nombre);
  for (var i = 0; i < todas.length; i++) {
    if (BANCO.clave(todas[i][0]) === k || (todas[i][1] && BANCO.clave(todas[i][1]) === k)) return todas[i];
  }
  return null;
}

/* El par (sidecar, PNG) del objeto, mirando los directorios en orden. El nombre
   de fichero lleva la versión, y la versión sale del manifiesto: si el PNG de
   disco no es el que el manifiesto declara, esto no lo encuentra, que es lo que
   queremos —medir lo publicado, no lo que haya por ahí—. */
function parcheDe(nombre) {
  var id = PS1.ps1IdTextura(nombre);
  for (var i = 0; i < DIRS.length; i++) {
    var js = path.join(DIRS[i], id + '.json');
    /* El sidecar trae la versión en el nombre, así que hay que buscarlo por
       prefijo: `NGC6888.1aa86769.json`. */
    var dir = DIRS[i];
    if (!fs.existsSync(dir)) continue;
    var cand = fs.readdirSync(dir).filter(function (f) {
      return f.indexOf(id + '.') === 0 && /\.json$/.test(f) && f.indexOf('.fila.') < 0;
    });
    for (var j = 0; j < cand.length; j++) {
      var png = path.join(dir, cand[j].replace(/\.json$/, '.png'));
      if (fs.existsSync(png)) return { json: path.join(dir, cand[j]), png: png, dir: dir };
    }
    void js;
  }
  return null;
}

/* Las estrellas de Gaia del campo, de los fixtures que ya existen: en Cygnus,
   NGC 6888 tiene tantas que «píxeles por encima del cielo» sin quitarlas mide
   sobre todo el campo estelar, no la nebulosa. Sin fixture no se inventa: se
   dice que la cuenta va con estrellas dentro. */
var FIXTURES = {
  NGC6888: 'gaia_ngc6888.csv', NGC6720: 'gaia_ngc6720.csv', NGC7008: 'gaia_ngc7008.csv',
  NGC7635: 'gaia_ngc7635.csv', NGC1952: 'gaia_ngc1952.csv', 'NGC 5194': 'gaia_ngc5194.csv'
};
function estrellasDe(nombre) {
  var csv = FIXTURES[nombre];
  if (!csv) return null;
  var ruta = path.join(RAIZ, 'scripts', 'fixtures', 'gaia', csv);
  if (!fs.existsSync(ruta)) return null;
  return fs.readFileSync(ruta, 'utf8').trim().split('\n').slice(1).map(function (l) {
    var t = l.split(',');
    return [parseFloat(t[0]), parseFloat(t[1]), parseFloat(t[2])];
  });
}

function percentil(v, p) {
  if (!v.length) return NaN;
  var i = Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))));
  return v[i];
}

function mag(f) { return f > 0 ? -2.5 * Math.log10(f) : Infinity; }

/* El parche publicado: PNG del banco + su sidecar, decodificado a DN. */
function fuentePublicada(f) {
  var p = parcheDe(f[0]);
  if (!p) return Promise.resolve(null);
  var side = JSON.parse(fs.readFileSync(p.json, 'utf8'));
  return P16.leer(fs.readFileSync(p.png)).then(function (img) {
    if (!img) throw new Error(f[0] + ': el PNG no se deja leer');
    return { datos: P16.decodificar(img.u16, side.codificacion),
             ancho: img.ancho, alto: img.alto, escalaAs: side.escalaAs,
             wcs: side.wcs || null, side: side,
             etiqueta: 'banda ' + side.fuente.banda + ' · ' + path.basename(p.png) };
  });
}

/* El MISMO campo en otra banda. Es la única forma de responder «¿está el Hα en
   los píxeles?»: g no lo lleva (656 nm cae fuera) y r sí. Misma geometría,
   mismo tamaño y mismo pipeline, para que la única diferencia sea el filtro.
   Esto SÍ toca la red —no hay banco publicado en r—, con la caché de
   lib_bajar_parche detrás. */
function fuenteBanda(f, banda) {
  var gal = PS1.ps1GalaxiasDelCampo([f], f[2], f[3], PS1.ps1LadoArcmin(f[4]))[0];
  var bajar = require('./lib_bajar_parche.js')(window.BitacoraGaiaRender).bajar;
  return bajar(gal.ra, gal.dec, gal.ladoArcmin, PS1.cfg.salida, banda).then(function (p) {
    return { datos: p.datos, ancho: p.ancho, alto: p.alto, escalaAs: p.escalaAs,
             wcs: p.wcs || null, side: null, etiqueta: 'banda ' + banda + ' · descargada' };
  });
}

/* ¿De dónde sale el cielo? `ps1Cielo` toma la mediana del BORDE del parche, y
   el parche de una clase difusa mide 6·r_e = 1,8·semieje de catálogo, o sea
   0,9·eje mayor: su borde cae DENTRO del objeto. Entonces el «cielo» lleva
   nebulosa dentro, se resta, y la σ del mismo borde sube con ella, con lo que
   el suelo de cielo+1,5σ sube dos veces.

   Se mide bajando el MISMO campo mucho más grande y leyendo mediana y MAD en
   anillos: si el nivel baja al alejarse, el borde del parche de producción
   estaba midiendo objeto. Compara contra un radio donde ya no puede haber nada.
   `--cielo <lado′>` y nada más: es un diagnóstico, no una ley. */
function cieloPorRadio(nombre, ladoArcmin, banda) {
  var f = filaDe(nombre);
  var gal = PS1.ps1GalaxiasDelCampo([f], f[2], f[3], PS1.ps1LadoArcmin(f[4]))[0];
  var bajar = require('./lib_bajar_parche.js')(window.BitacoraGaiaRender).bajar;
  banda = banda || PS1.cfg.banda;
  return bajar(gal.ra, gal.dec, ladoArcmin, PS1.cfg.salida, banda).then(function (p) {
    var rb = PS1.ps1RadioBordeAs(gal), rObj = rb > 0 ? rb : gal.reArcsec;
    var cx = p.ancho / 2, cy = p.alto / 2, esc = p.escalaAs;
    var LIM = [0.5, 1, 1.5, 2, 3, 4, 6];
    var cubos = LIM.map(function () { return []; });
    for (var y = 0; y < p.alto; y++) {
      for (var x = 0; x < p.ancho; x++) {
        var v = p.datos[y * p.ancho + x];
        if (v !== v) continue;
        var r = Math.hypot(x - cx, y - cy) * esc / rObj, k = 0;
        while (k < LIM.length && r > LIM[k]) k++;
        if (k < LIM.length) cubos[k].push(v);
      }
    }
    console.log('\n── ' + f[0] + ': ¿a qué distancia empieza el cielo? (banda ' + banda +
                ', parche de ' + ladoArcmin + '′, ' + esc.toFixed(2) + '″/px)');
    console.log('   r_obj = ' + rObj.toFixed(1) + '″ · el parche de producción llega a r/r_obj = ' +
                ((gal.ladoArcmin * 60 / 2) / rObj).toFixed(2) +
                ' y su borde (6 %) empieza en ' + (0.88 * (gal.ladoArcmin * 60 / 2) / rObj).toFixed(2));
    LIM.forEach(function (lim, i) {
      var m = cubos[i];
      if (!m.length) return;
      m.sort(function (a, b) { return a - b; });
      var med = m[m.length >> 1];
      var des = m.map(function (v) { return Math.abs(v - med); });
      des.sort(function (a, b) { return a - b; });
      console.log('   r/r_obj ' + (i ? LIM[i - 1] : 0) + '–' + lim +
                  ': mediana ' + med.toFixed(2) + ' DN · MAD·1,4826 ' +
                  (1.4826 * des[des.length >> 1]).toFixed(2) + ' DN · ' + m.length + ' px');
    });
  });
}

function medir(nombre, etiqueta, banda) {
  var f = filaDe(nombre);
  if (!f) return Promise.resolve(console.log(nombre + ': no está en el catálogo difuso'));

  return (banda ? fuenteBanda(f, banda) : fuentePublicada(f)).then(function (F) {
    if (!F) return console.log(nombre + ': sin PNG publicado a mano (¿--dir?)');
    var side = F.side, datos = F.datos, ancho = F.ancho, alto = F.alto;

    var campo = PS1.ps1GalaxiasDelCampo([f], f[2], f[3], PS1.ps1LadoArcmin(f[4]));
    var gal = campo[0];
    var fits = { ancho: ancho, alto: alto, datos: datos, escalaAs: F.escalaAs, wcs: F.wcs };
    fits.afin = PS1.ps1AfinParche(fits, gal);

    /* La extensión del OBJETO, no la escena ni el parche: la misma que usa el
       generador para el veredicto de ausencia (#229). El borde real si su clase
       lo tiene, y si no r_e. */
    var rb = PS1.ps1RadioBordeAs(gal), rObj = rb > 0 ? rb : gal.reArcsec;
    var paR = (gal.pa || 0) * Math.PI / 180;
    var ext = [{ cx: fits.afin.cx, cy: fits.afin.cy, cos: Math.cos(paR), sin: Math.sin(paR),
                 ba: (gal.ba > 0 && gal.ba <= 1) ? gal.ba : 1, r25As: rObj }];

    /* Quitar las estrellas ANTES de contar, con la función de producción y la
       escena de producción: lo que queda es la nebulosa. La máscara deja NaN, y
       un NaN no entra en ninguna cuenta —ni como señal ni como cielo—, así que
       el porcentaje que sale es sobre píxeles que siguen siendo medida. */
    var estrellas = estrellasDe(f[0]);
    var escena = PS1.ps1EscenaEnParche(fits, gal, PS1.ps1GalaxiasDelCampo(
      PS1.ps1CatalogoDifuso(window.BITACORA_GALAXIAS, window.BITACORA_NEBULOSAS),
      gal.ra, gal.dec, gal.ladoArcmin));
    if (estrellas) {
      datos = PS1.ps1QuitarEstrellas(datos, ancho, alto,
        PS1.ps1EstrellasEnPixeles(fits, gal, estrellas),
        { afin: fits.afin, ba: gal.ba, pa: gal.pa, escena: escena });
      fits.datos = datos;
    }

    var cielo = PS1.ps1Cielo(datos, ancho, alto);
    var sigma = PS1.ps1SigmaCielo(datos, ancho, alto, cielo);

    /* Lo que el render hace con este mismo parche, ley a ley. Sin quitar
       estrellas: eso pide Gaia y esto no toca la red, así que las estrellas
       siguen dentro y el anclaje reparte algo de luz del catálogo entre ellas.
       Sesga el brillo de la nebulosa hacia ABAJO —hay más flujo en el
       denominador del que le toca—, o sea en contra de la hipótesis «se ve poco
       porque el render lo recorta»: si aun así la nebulosa sale brillante, la
       conclusión aguanta. */
    var comps = PS1.ps1ComponentesSersic(gal);
    var anclado = PS1.ps1AnclarACatalogo(datos, ancho, alto, {
      magV: gal.magV, n: gal.n, reArcsec: gal.reArcsec,
      ladoArcmin: gal.ladoArcmin, escalaAs: F.escalaAs
    });

    var snr = [], mus = [], n = 0, aus = 0, apagados = 0, x, y, i;
    var sobre = { s15: 0, s3: 0, s5: 0, s10: 0 };
    for (y = 0; y < alto; y++) {
      for (x = 0; x < ancho; x++) {
        if (!PS1.ps1FuenteEnEscena(ext, fits.afin, x, y)) continue;
        i = y * ancho + x;
        n++;
        var v = datos[i];
        if (v !== v) { aus++; continue; }
        var s = (v - cielo) / sigma;
        snr.push(s);
        if (s > 1.5) sobre.s15++;
        if (s > 3) sobre.s3++;
        if (s > 5) sobre.s5++;
        if (s > 10) sobre.s10++;
        var a = anclado[i];
        /* Cero = el suelo lo apagó: ese píxel ya no lo pinta la imagen, lo
           rellena el perfil. NaN aquí es ausencia, que es otra cosa y ya la
           cuenta `aus`. */
        if (a === 0) apagados++;
        else if (a === a && a > 0) mus.push(mag(a));
      }
    }
    snr.sort(function (a, b) { return a - b; });
    mus.sort(function (a, b) { return a - b; });

    /* La extensión del catálogo no es la nebulosa. En una cáscara —la Creciente,
       la Hélice— r_e cae en el HUECO, así que medir solo dentro de ella cuenta
       el interior vacío y no el borde brillante. Por eso el mismo recuento se
       repite por anillos hasta donde llega el parche: si la estructura está
       fuera de r_e, aquí se ve, y si no está en ningún anillo, no está. */
    var RADIOS = [0.5, 1, 1.5, 2, 3, 4];
    var anillos = RADIOS.map(function () { return { n: 0, s3: 0, mus: [] }; });
    var esc = F.escalaAs;
    for (y = 0; y < alto; y++) {
      for (x = 0; x < ancho; x++) {
        i = y * ancho + x;
        var v2 = datos[i];
        if (v2 !== v2) continue;
        var r = Math.hypot(x - fits.afin.cx, y - fits.afin.cy) * esc / rObj;
        var k = 0;
        while (k < RADIOS.length && r > RADIOS[k]) k++;
        if (k >= RADIOS.length) continue;
        anillos[k].n++;
        if ((v2 - cielo) / sigma > 3) anillos[k].s3++;
        var a2 = anclado[i];
        if (a2 > 0) anillos[k].mus.push(mag(a2));
      }
    }

    var medidos = n - aus;
    var pct = function (k) { return (100 * k / (medidos || 1)).toFixed(1) + ' %'; };
    console.log('\n── ' + f[0] + (f[1] ? ' (' + f[1] + ')' : '') + ' · ' + etiqueta);
    console.log('   clase ' + (f[12] || '?') + ' · mag catálogo ' + gal.magV +
                ' · r_objeto ' + rObj.toFixed(1) + '″ · escala ' + F.escalaAs.toFixed(3) + '″/px' +
                ' · ' + F.etiqueta);
    console.log('   cielo ' + cielo.toFixed(2) + ' DN · σ ' + sigma.toFixed(2) + ' DN' +
                (side ? ' (sidecar: ' + side.auditoria.cielo.toFixed(2) + ' / ' +
                        side.auditoria.sigma.toFixed(2) + ', antes de quitar estrellas)' : ''));
    console.log('   píxeles en el objeto: ' + n + ' · sin medida ' + pct(aus) +
                (estrellas ? ' (ausencia del stack + máscara de ' + estrellas.length + ' estrellas de Gaia)'
                           : ' (ausencia del stack; SIN fixture de Gaia: las estrellas siguen dentro)'));
    console.log('   SOBRE EL CIELO: >1,5σ ' + pct(sobre.s15) + ' · >3σ ' + pct(sobre.s3) +
                ' · >5σ ' + pct(sobre.s5) + ' · >10σ ' + pct(sobre.s10));
    console.log('   (v−cielo)/σ: p50 ' + percentil(snr, 0.5).toFixed(2) +
                ' · p90 ' + percentil(snr, 0.9).toFixed(2) +
                ' · p99 ' + percentil(snr, 0.99).toFixed(2) +
                ' · máx ' + percentil(snr, 1).toFixed(1));
    console.log('   TRAS EL SUELO (cielo+1,5σ): apagados ' + pct(apagados) +
                ' → los pinta el perfil (n=' + gal.n + ', r_e ' + gal.reArcsec.toFixed(1) + '″)');
    if (mus.length) {
      console.log('   μ de lo que sobrevive: p10 ' + percentil(mus, 0.1).toFixed(2) +
                  ' · p50 ' + percentil(mus, 0.5).toFixed(2) +
                  ' · p90 ' + percentil(mus, 0.9).toFixed(2) + ' mag/arcsec²');
    }
    /* El suelo de producción se aplica PÍXEL A PÍXEL, y el píxel del parche mide
       0,15–1,2″ según el objeto. Una emisión difusa puede estar muy por debajo
       de 1,5σ en un píxel y ser señal segura en el arcosegundo: agrupando k×k el
       ruido baja como k y la señal no. Esto no es un truco de contraste, es la
       pregunta física «¿a qué escala está la señal?», y la respuesta separa «no
       está en los datos» de «está por debajo del umbral con el que la miramos».
       Cielo y σ se vuelven a medir sobre el agrupado con las funciones de
       producción, no se dividen por √k²: así el número no depende de suponer
       ruido independiente entre píxeles vecinos (el stack está correlacionado). */
    var BINS = [1, 2, 4, 8];
    var binLinea = '   agrupando k×k (% >1,5σ en r_obj/cuerpo · escala): ';
    BINS.forEach(function (k) {
      var aw = Math.floor(ancho / k), ah = Math.floor(alto / k);
      var chico = new Float32Array(aw * ah);
      for (var by = 0; by < ah; by++) {
        for (var bx = 0; bx < aw; bx++) {
          var s = 0, c = 0;
          for (var dy = 0; dy < k; dy++) {
            for (var dx = 0; dx < k; dx++) {
              var vv = datos[(by * k + dy) * ancho + bx * k + dx];
              if (vv === vv) { s += vv; c++; }
            }
          }
          chico[by * aw + bx] = c ? s / c : NaN;
        }
      }
      var c0 = PS1.ps1Cielo(chico, aw, ah), s0 = PS1.ps1SigmaCielo(chico, aw, ah, c0);
      var dentro = 0, sobre15 = 0, dentroMedio = 0, sobreMedio = 0;
      /* Círculo de radio r_obj: exacto para las nebulosas (b/a = 1 en todas las
         filas de este banco) y aproximado en una galaxia inclinada, que aquí
         solo es control. */
      for (var yy = 0; yy < ah; yy++) {
        for (var xx = 0; xx < aw; xx++) {
          var rr = Math.hypot(xx - fits.afin.cx / k, yy - fits.afin.cy / k) * esc * k;
          if (rr > rObj) continue;
          var w = chico[yy * aw + xx];
          if (w !== w) continue;
          dentro++;
          var alto15 = (w - c0) / s0 > 1.5;
          if (alto15) sobre15++;
          /* El mismo recuento en el CUERPO (r < r_obj/2). La extensión de
             catálogo de una cáscara mete mucho hueco, y ahí el agrupamiento no
             tiene nada que rescatar: diluye la respuesta a «¿la señal está por
             debajo del umbral con el que la miramos?». */
          if (rr <= rObj / 2) { dentroMedio++; if (alto15) sobreMedio++; }
        }
      }
      binLinea += k + '× ' + (100 * sobre15 / (dentro || 1)).toFixed(0) + '/' +
        (100 * sobreMedio / (dentroMedio || 1)).toFixed(0) + '% (' +
        (esc * k).toFixed(2) + '″)  ';
    });
    console.log(binLinea);

    var linea = '   por anillos (r/r_obj → % >3σ · μ p50): ';
    for (i = 0; i < RADIOS.length; i++) {
      var an = anillos[i];
      if (!an.n) continue;
      an.mus.sort(function (a, b) { return a - b; });
      linea += (i ? RADIOS[i - 1] : 0) + '–' + RADIOS[i] + ' ' +
        (100 * an.s3 / an.n).toFixed(0) + '% ' +
        (an.mus.length ? percentil(an.mus, 0.5).toFixed(1) : '—') + '  ';
    }
    console.log(linea);
    /* Hasta dónde llega el parche, en radios del objeto: si el objeto se sale,
       lo que falta no lo perdió el render ni la banda, no se pidió. */
    console.log('   el parche llega a r/r_obj = ' +
      ((gal.ladoArcmin * 60 / 2) / rObj).toFixed(2) + ' (lado ' + gal.ladoArcmin.toFixed(1) + '′)');
    /* El perfil con el que compite la imagen, en el mismo sitio: su μ a r_e. Si
       el perfil es más brillante que lo que la imagen deja pasar, lo que se ve
       es el modelo, no la medida. */
    if (comps.length) {
      var muRe = mag(PS1.ps1FlujoModelo(comps, gal.pa || 0, 0, gal.reArcsec));
      console.log('   μ del perfil a r_e: ' + muRe.toFixed(2) + ' mag/arcsec²');
    }
  });
}

var solo = arg('--solo', '');
var bandas = arg('--bandas', '');           // p.ej. --bandas g,r,i (descarga; '' = solo lo publicado)
var lista = solo ? OBJETOS.filter(function (o) { return BANCO.clave(o[0]) === BANCO.clave(solo); }) : OBJETOS;

/* Un par (objeto, fuente) por medida. Sin `--bandas` la fuente es el PNG
   publicado y no se toca la red, que es el criterio 1 del ticket. */
var ladoCielo = arg('--cielo', '');
if (ladoCielo) {
  lista.reduce(function (cad, o) {
    return cad.then(function () { return cieloPorRadio(o[0], parseFloat(ladoCielo), bandas || ''); });
  }, Promise.resolve()).catch(function (e) {
    console.error('FALLO: ' + (e && e.message || e));
    process.exit(1);
  });
  return;
}

var tareas = [];
lista.forEach(function (o) {
  if (!bandas) return tareas.push([o[0], o[1], null]);
  bandas.split(',').forEach(function (b) { tareas.push([o[0], o[1], b.trim()]); });
});

console.log(bandas ? 'Mismo campo, banda a banda (' + bandas + '). #263'
                   : 'Parches publicados, píxeles crudos, sin red. #263');
tareas.reduce(function (cad, t) {
  return cad.then(function () { return medir(t[0], t[1], t[2]); });
}, Promise.resolve()).catch(function (e) {
  console.error('FALLO: ' + (e && e.message || e));
  process.exit(1);
});
