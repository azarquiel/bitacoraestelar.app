#!/usr/bin/env node
/* ¿De dónde salen el cielo y la σ de un parche? (#274)

   `ps1Cielo` y `ps1SigmaCielo` leen el marco exterior del 6 % del parche y dan
   por supuesto que es cielo. En las clases difusas no lo es: el lado del parche
   es 6·r_e = 1,8·semieje, o sea 0,9 ejes mayores, y el marco cae DENTRO del
   objeto. Entonces el suelo de producción —cielo + 1,5·σ— sube con el propio
   objeto y lo apaga.

   Los listones y el patrón están comprometidos en el ADR 0027 (prerregistro);
   aquí no se decide ninguno y no se define ninguna ley (ADR 0008): cielo, σ,
   extensión, escena y anclaje son las funciones de `resources/js/bitacora-ps1.js`.

   Seis modos, en el orden en que se usan:

     --marco     la medida que falta: qué fracción del marco del 6 % cae dentro
                 de la extensión, para los objetos `imagen` del manifiesto.
                 Geometría pura: lee sidecars, no abre ningún PNG, no toca la red.
     --patron    el cielo «de verdad»: un parche grande del mismo campo y la
                 mediana/MAD de un anillo lejano. TOCA LA RED (con caché en el
                 temporal). Escribe scripts/salida_suelo_patron.json.
     --e1        E1 medida: se baja el parche con el lado que E1 pediría y se le
                 aplica la ley de hoy encima. TOCA LA RED.
     --escala    el confundido que obligó a enmendar el prerregistro: la sigma
                 del parche grande está medida sobre otro tamaño de pixel.
     --e3nativo  POST HOC: E3 medida al paso nativo de PS1 (0,25″/px).
     --opciones  E1–E4 contra ese patrón, sobre los parches publicados, con los
                 cuatro listones del prerregistro.
     --hash      el coste: `version()` de gen_dso_texturas.js con los parámetros
                 de hoy y con los de cada opción (ADR 0026).

   Uso:
     node scripts/harness_suelo_cielo.js --marco [--dir <ruta a dso/>]
     node scripts/harness_suelo_cielo.js --patron [--solo NGC6888]
     node scripts/harness_suelo_cielo.js --e1 [--solo NGC1788]
     node scripts/harness_suelo_cielo.js --escala
     node scripts/harness_suelo_cielo.js --e3nativo
     node scripts/harness_suelo_cielo.js --opciones
     node scripts/harness_suelo_cielo.js --hash

   Veredicto y tablas: simulador_ocular/docs/validacion/suelo_cielo_parche.md */
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

function arg(n, pordefecto) {
  var i = process.argv.indexOf(n);
  return i > 0 && process.argv[i + 1] && process.argv[i + 1].indexOf('--') !== 0
    ? process.argv[i + 1] : pordefecto;
}
function tiene(n) { return process.argv.indexOf(n) > 0; }

var DIR_DSO = arg('--dir', path.join(RAIZ, 'simulador_ocular', 'dso'));
var PUB = require('./lib_parche_publicado.js')(RAIZ, PS1, P16, [DIR_DSO]);
var SALIDA_PATRON = path.join(__dirname, 'salida_suelo_patron.json');
/* ″/px del stack, leída de donde ya está escrita en vez de copiada. */
var ESCALA_NATIVA_AS = require('./lib_bajar_parche.js')(window.BitacoraGaiaRender).ESCALA_NATIVA;

/* El banco del prerregistro (ADR 0027 §El patrón): los nueve que la línea base
   de #263 da con más del 40 % del área apagada, más cuatro controles de parche
   holgado. Los nombres van como los escribe SU catálogo (ADR 0015). */
var AFECTADOS = ['IC0059', 'IC0063', 'IC0359A', 'NGC1788', 'NGC2064', 'IC0444',
                 'NGC 5457', 'NGC6888', 'NGC7293'];
var CONTROLES = ['NGC 5194', 'NGC 3031', 'NGC 4594', 'NGC 4486'];
var BANCO_PATRON = AFECTADOS.concat(CONTROLES);

/* ───────────────────────── piezas compartidas ───────────────────────── */

function galDe(f) {
  return PS1.ps1GalaxiasDelCampo([f], f[2], f[3], PS1.ps1LadoArcmin(f[4]))[0];
}

/* La extensión del OBJETO, la misma que usa el generador para el veredicto de
   ausencia: el borde real si su clase lo tiene, y si no `r_e`. */
/* Los radios del objeto —escena μ25 y tamaño de catálogo— salen de
   `lib_radio_objeto.js`, que es donde viven desde #285: el generador aplica los
   mismos y tenerlos dos veces sería la deriva que prohíbe el ADR 0008. */
var RAD = require('./lib_radio_objeto.js')(PS1);
var radioObjetoAs = RAD.radioObjetoAs, radioCatalogoAs = RAD.radioCatalogoAs;
var radioEscenaAs = RAD.radioEscenaAs;

function extensionDe(gal, afin, radioAs) {
  var paR = (gal.pa || 0) * Math.PI / 180;
  return [{ cx: afin.cx, cy: afin.cy, cos: Math.cos(paR), sin: Math.sin(paR),
            ba: (gal.ba > 0 && gal.ba <= 1) ? gal.ba : 1,
            r25As: radioAs > 0 ? radioAs : radioObjetoAs(gal) }];
}


/* El marco del 6 %: el MISMO recorrido de `ps1Cielo` (bitacora-ps1.js:310) y
   `ps1SigmaCielo` (:330), reescrito aquí a propósito. Es la excepción que el
   ADR 0008 admite —declarada por escrito— porque el marco no es una ley que
   este arnés use, es el OBJETO que mide: hace falta poder preguntar «¿qué
   píxeles mira la ley?», y producción no lo expone. Si el 0,06 de allí cambia,
   este número hay que cambiarlo a mano. */
var GROSOR_MARCO = 0.06;
function enMarco(x, y, ancho, alto) {
  var grosor = Math.max(1, Math.round(Math.min(ancho, alto) * GROSOR_MARCO));
  return (y < grosor || y >= alto - grosor || x < grosor || x >= ancho - grosor);
}
/* Dónde empieza el marco, en fracción del medio lado: 1 − 2·grosor. Sale del
   mismo número de arriba en vez de ir escrito como 0,88 por tercera vez. */
var INICIO_MARCO = 1 - 2 * GROSOR_MARCO;

/* Mediana y σ robusta. El 1,4826 es el mismo de `ps1SigmaCielo`, y aquí se
   reescribe porque hace falta aplicarlo a listas de píxeles que producción no
   sabe recorrer (un anillo, un campo vecino, las diferencias entre vecinos).
   Declarado, como pide el ADR 0008: lo que NO se reimplementa es la ley que se
   juzga —el marco— , que se llama siempre con `ps1Cielo`/`ps1SigmaCielo`. */
/* σ a partir de la diferencia entre píxeles vecinos de la misma fila: la MAD de
   esas diferencias, dividida por √2 porque la diferencia de dos medidas con el
   mismo ruido tiene √2 veces su σ. Un gradiente suave no la mueve —la diferencia
   entre vecinos es el gradiente por píxel, mucho menor que el objeto— y el ruido
   sí. Es E3, y la usan también --e3nativo (sobre el parche agrupado) y nadie
   más. NaN si la mediana sale 0, que es lo que pasa en un parche sobremuestreado
   donde los vecinos son literalmente el mismo píxel repetido. */
function sigmaVecinos(datos, ancho, alto) {
  var dif = [], x, y;
  for (y = 0; y < alto; y++) {
    for (x = 1; x < ancho; x++) {
      var a = datos[y * ancho + x - 1], b = datos[y * ancho + x];
      if (a !== a || b !== b) continue;
      dif.push(Math.abs(b - a));
    }
  }
  if (!dif.length) return NaN;
  var m = 1.4826 * mediana(dif) / Math.SQRT2;
  return m > 0 ? m : NaN;
}

function mediana(v) {
  if (!v.length) return NaN;
  v.sort(function (a, b) { return a - b; });
  return v[v.length >> 1];
}
function madSigma(v, centro) {
  if (!v.length) return NaN;
  var d = v.map(function (x) { return Math.abs(x - centro); });
  return 1.4826 * mediana(d);
}

/* ───────────────────────── --marco ───────────────────────── */

/* Los objetos con textura de imagen, del MANIFIESTO: lo que se mide es lo
   publicado. Cada uno con su sidecar, del que salen ancho, escala y WCS. */
function objetosPublicados() {
  require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'dso-texturas-datos.js'));
  return (window.BITACORA_DSO_TEXTURAS || [])
    .filter(function (t) { return t[1] === 'imagen'; })
    .map(function (t) { return t[0]; });
}

function marco() {
  var filas = [];
  objetosPublicados().forEach(function (nombre) {
    var f = PUB.fila(nombre), s = PUB.sidecar(nombre);
    if (!f || !s) return;
    var gal = galDe(f);
    var fits = { ancho: s.ancho, alto: s.alto, escalaAs: s.escalaAs, wcs: s.wcs || null };
    fits.afin = PS1.ps1AfinParche(fits, gal);
    var rEsc = radioEscenaAs(fits, gal), rCat = radioCatalogoAs(f, gal, rEsc);
    var extEsc = extensionDe(gal, fits.afin, rEsc), extCat = extensionDe(gal, fits.afin, rCat);
    var enEsc = 0, enCat = 0, total = 0;
    for (var y = 0; y < s.alto; y++) {
      for (var x = 0; x < s.ancho; x++) {
        if (!enMarco(x, y, s.ancho, s.alto)) continue;
        total++;
        if (PS1.ps1FuenteEnEscena(extEsc, fits.afin, x, y)) enEsc++;
        if (PS1.ps1FuenteEnEscena(extCat, fits.afin, x, y)) enCat++;
      }
    }
    filas.push({ nombre: f[0], clase: f[12] || 'gal',
                 frac: enCat / (total || 1), fracEsc: enEsc / (total || 1),
                 rEsc: rEsc, rCat: rCat, lado: gal.ladoArcmin, escala: s.escalaAs,
                 alcance: (gal.ladoArcmin * 60 / 2) / rCat });
  });
  filas.sort(function (a, b) { return b.frac - a.frac; });

  if (filas.length < objetosPublicados().length) {
    console.log('AVISO: ' + (objetosPublicados().length - filas.length) + ' de ' +
                objetosPublicados().length + ' objetos del manifiesto no tienen parche a mano' +
                (filas.length ? '' : ' — ¿falta --dir?'));
    if (!filas.length) process.exit(1);
  }
  console.log('El marco del 6 % dentro de la extensión del objeto — ' + filas.length +
              ' texturas de imagen del manifiesto (#274, criterio 1)\n');
  console.log('objeto        clase   lado′   escena″   catálogo″   el parche llega a   marco en escena   marco en catálogo');
  filas.forEach(function (r) {
    console.log((r.nombre + '            ').slice(0, 13) + ' ' +
      (r.clase + '     ').slice(0, 6) + ' ' +
      r.lado.toFixed(1).padStart(6) + ' ' + r.rEsc.toFixed(1).padStart(9) + ' ' +
      r.rCat.toFixed(1).padStart(11) + ' ' +
      (r.alcance.toFixed(2) + ' r_cat').padStart(18) + ' ' +
      ((100 * r.fracEsc).toFixed(1) + ' %').padStart(17) + ' ' +
      ((100 * r.frac).toFixed(1) + ' %').padStart(19));
  });
  var con = filas.filter(function (r) { return r.frac > 0; });
  var afect = filas.filter(function (r) { return r.frac >= 0.2; });
  console.log('\ncon marco contaminado (>0 %): ' + con.length + ' de ' + filas.length +
              ' · AFECTADOS por la regla del prerregistro (≥20 %): ' + afect.length);
  console.log('afectados: ' + afect.map(function (r) { return r.nombre; }).join(', '));
  var porClase = {};
  afect.forEach(function (r) { porClase[r.clase] = (porClase[r.clase] || 0) + 1; });
  console.log('por clase: ' + Object.keys(porClase).map(function (c) {
    return c + ' ' + porClase[c];
  }).join(' · '));
}

/* ───────────────────────── --patron ───────────────────────── */

/* Lado del patrón, del prerregistro: min(40′, max(12′, 4·lado de producción)).
   El tope de 40′ es el del mosaico de 2×2 skycells del proxy. */
function ladoPatron(gal) {
  return Math.min(40, Math.max(12, 4 * gal.ladoArcmin));
}

/* El CAMPO VECINO es la LEY de producción desde #285 (`ps1CampoVecino`, ADR
   0028): el arnés la llama, no la copia (ADR 0008). Aquí solo se le pasa el
   catálogo difuso, que es el que dice a qué distancia queda la difusa más
   cercana. */
function campoVecino(f, gal, rObjMax) {
  return PS1.ps1CampoVecino(gal, rObjMax,
    PS1.ps1CatalogoDifuso(window.BITACORA_GALAXIAS, window.BITACORA_NEBULOSAS));
}

function patronDe(nombre) {
  var f = PUB.fila(nombre);
  if (!f) return Promise.resolve({ nombre: nombre, motivo: 'no está en el catálogo' });
  var gal = galDe(f), lado = ladoPatron(gal), rObj = radioObjetoAs(gal);
  var bajar = require('./lib_bajar_parche.js')(window.BitacoraGaiaRender).bajar;
  return bajar(gal.ra, gal.dec, lado, PS1.cfg.salida, PS1.cfg.banda).then(function (p) {
    var cx = p.ancho / 2, cy = p.alto / 2, esc = p.escalaAs;
    /* Anillo del prerregistro: r > 3·r_obj Y r > 1,5·(medio lado de producción).
       El segundo corte es el que garantiza que el patrón no vuelve a mirar el
       trozo de cielo del que ya salió el cielo de producción. */
    var rMin = Math.max(3 * rObj, 1.5 * gal.ladoArcmin * 60 / 2);
    var anillo = [], perfil = [0.5, 1, 1.5, 2, 3, 4, 6].map(function (l) {
      return { lim: l, v: [] };
    });
    for (var y = 0; y < p.alto; y++) {
      for (var x = 0; x < p.ancho; x++) {
        var v = p.datos[y * p.ancho + x];
        if (v !== v) continue;
        var r = Math.hypot(x - cx, y - cy) * esc;
        if (r > rMin) anillo.push(v);
        var k = 0;
        while (k < perfil.length && r / rObj > perfil[k].lim) k++;
        if (k < perfil.length) perfil[k].v.push(v);
      }
    }
    var out = { nombre: f[0], clase: f[12] || 'gal', ladoPatron: lado,
                ladoProd: gal.ladoArcmin, escalaPatron: esc, rObj: rObj,
                rMinAs: rMin, nAnillo: anillo.length };
    if (anillo.length < 1000) {
      out.motivo = 'sin patrón: el anillo lejano no cabe ni a ' + lado + '′ (' +
                   anillo.length + ' px)';
    } else {
      out.cielo = mediana(anillo);
      out.sigma = madSigma(anillo, out.cielo);
    }
    out.perfil = perfil.filter(function (c) { return c.v.length > 200; }).map(function (c) {
      var m = mediana(c.v);
      return { lim: c.lim, n: c.v.length, mediana: m, sigma: madSigma(c.v, m) };
    });

    /* El campo vecino, a la MISMA escala que producción: de aquí sale la σ del
       patrón (la del anillo de arriba vale para el cielo, que no depende del
       tamaño del píxel, pero no para σ). */
    var s = PUB.sidecar(f[0]);
    var rObjMax = rObj;
    if (s) {
      var fits = { ancho: s.ancho, alto: s.alto, escalaAs: s.escalaAs, wcs: s.wcs || null };
      fits.afin = PS1.ps1AfinParche(fits, gal);
      var rEsc = radioEscenaAs(fits, gal);
      rObjMax = Math.max(rEsc, radioCatalogoAs(f, gal, rEsc));
    }
    out.rObjMax = rObjMax;
    var v = campoVecino(f, gal, rObjMax);
    if (!v) { out.vecinoMotivo = 'sin campo vecino: ninguna dirección cae en cobertura'; return out; }
    out.vecino = { ra: v.ra, dec: v.dec, dir: v.dir, vecinaMasCercaArcmin: v.cerca,
                   offsetArcmin: v.offsetArcmin, ladoArcmin: gal.ladoArcmin };
    return bajar(v.ra, v.dec, gal.ladoArcmin, PS1.cfg.salida, PS1.cfg.banda).then(function (q) {
      var todos = [];
      for (var i = 0; i < q.datos.length; i++) { if (q.datos[i] === q.datos[i]) todos.push(q.datos[i]); }
      out.vecino.escalaAs = q.escalaAs;
      out.vecino.n = todos.length;
      if (todos.length < 1000) { out.vecinoMotivo = 'el campo vecino llegó casi vacío'; return out; }
      out.vecino.cielo = mediana(todos);
      out.vecino.sigma = madSigma(todos, out.vecino.cielo);
      return out;
    }).catch(function (e) {
      out.vecinoMotivo = 'el campo vecino no se pudo bajar (' + (e && e.message || e) + ')';
      return out;
    });
  }).catch(function (e) {
    return { nombre: f[0], motivo: 'sin patrón: la descarga falló (' + (e && e.message || e) + ')' };
  });
}

/* ───────────────────────── --e1 ───────────────────────── */

/* E1 medida, no argumentada: se BAJA el parche con el lado que E1 pediría y se
   le aplica la ley de hoy —el marco del 6 %, `ps1Cielo`— para ver si con ese
   lado el marco ya es cielo.

   Solo se juzga el CIELO, y a propósito: la mediana no depende del tamaño del
   píxel (ver la enmienda del ADR 0027), mientras que la σ de un parche más
   grande está medida sobre otro píxel y no se puede comparar con la del campo
   vecino sin bajar un vecino más por objeto. El cielo basta para decidir E1,
   porque el fallo que rompe el banco es un pedestal de 5,2 σ, no la σ.

   Se acompaña de la geometría: qué fracción del marco del parche agrandado
   sigue cayendo dentro del objeto. Eso no cuesta red y dice si E1 resuelve el
   problema que dice resolver. */
function e1() {
  if (!fs.existsSync(SALIDA_PATRON)) {
    console.error('falta ' + path.basename(SALIDA_PATRON) + ': pasa antes --patron');
    process.exit(2);
  }
  var pat = JSON.parse(fs.readFileSync(SALIDA_PATRON, 'utf8'));
  var solo = arg('--solo', '');
  var lista = solo ? [solo] : AFECTADOS;
  var bajar = require('./lib_bajar_parche.js')(window.BitacoraGaiaRender).bajar;
  console.log('E1 medida: el parche con el lado que E1 pediría, con la ley de hoy encima\n');
  console.log('objeto        lado hoy → E1   marco dentro   cielo E1   cielo patrón   Δ/σ_patrón');
  return lista.reduce(function (cad, n) {
    return cad.then(function () {
      var p = patronUtil(pat[PUB.clave(n)]);
      var f = PUB.fila(n), s = PUB.sidecar(n);
      if (!p || !f || !s) return;
      var gal = galDe(f);
      var fits0 = { ancho: s.ancho, alto: s.alto, escalaAs: s.escalaAs, wcs: s.wcs || null };
      fits0.afin = PS1.ps1AfinParche(fits0, gal);
      var rEsc = radioEscenaAs(fits0, gal);
      var rObj = Math.max(rEsc, radioCatalogoAs(f, gal, rEsc));
      var lado = Math.min(PS1.cfg.ladoMax, Math.max(gal.ladoArcmin, 2 * rObj / INICIO_MARCO / 60));
      return bajar(gal.ra, gal.dec, lado, PS1.cfg.salida, PS1.cfg.banda).then(function (q) {
        var fits = { ancho: q.ancho, alto: q.alto, escalaAs: q.escalaAs, wcs: q.wcs || null };
        fits.afin = PS1.ps1AfinParche(fits, gal);
        var ext = extensionDe(gal, fits.afin, rObj), dentro = 0, total = 0;
        for (var y = 0; y < q.alto; y++) {
          for (var x = 0; x < q.ancho; x++) {
            if (!enMarco(x, y, q.ancho, q.alto)) continue;
            total++;
            if (PS1.ps1FuenteEnEscena(ext, fits.afin, x, y)) dentro++;
          }
        }
        var c = PS1.ps1Cielo(q.datos, q.ancho, q.alto);
        console.log((f[0] + '            ').slice(0, 13) + ' ' +
          (gal.ladoArcmin.toFixed(1) + '′→' + lado.toFixed(1) + '′').padStart(13) + ' ' +
          ((100 * dentro / (total || 1)).toFixed(1) + ' %').padStart(14) + ' ' +
          c.toFixed(1).padStart(10) + ' ' + p.cielo.toFixed(1).padStart(14) + ' ' +
          ((c - p.cielo) / p.sigma).toFixed(2).padStart(12) +
          (Math.abs((c - p.cielo) / p.sigma) <= 0.5 ? '  ok' : '  FUERA'));
      }).catch(function (e) {
        console.log((f[0] + '            ').slice(0, 13) + ' la descarga falló: ' + (e && e.message || e));
      });
    });
  }, Promise.resolve());
}

function patron() {
  var solo = arg('--solo', '');
  var lista = solo ? BANCO_PATRON.filter(function (n) { return PUB.clave(n) === PUB.clave(solo); })
                   : BANCO_PATRON;
  if (!lista.length) lista = solo ? [solo] : [];
  var previo = fs.existsSync(SALIDA_PATRON) ? JSON.parse(fs.readFileSync(SALIDA_PATRON, 'utf8')) : {};
  console.log('El cielo lejano de los ' + lista.length + ' del prerregistro (ADR 0027). Con red.\n');
  return lista.reduce(function (cad, n) {
    return cad.then(function () {
      return patronDe(n).then(function (r) {
        previo[PUB.clave(r.nombre || n)] = r;
        fs.writeFileSync(SALIDA_PATRON, JSON.stringify(previo, null, 1));
        if (r.motivo) return console.log((r.nombre + '            ').slice(0, 13) + ' ' + r.motivo);
        console.log((r.nombre + '            ').slice(0, 13) +
          ' parche ' + r.ladoPatron.toFixed(0).padStart(3) + '′ (prod ' + r.ladoProd.toFixed(1) +
          '′) · anillo r>' + r.rMinAs.toFixed(0) + '″ con ' + r.nAnillo + ' px' +
          ' → cielo ' + r.cielo.toFixed(2).padStart(9) + ' DN · σ ' + r.sigma.toFixed(2).padStart(8) + ' DN');
        console.log('              perfil (r/r_obj → mediana DN · σ DN): ' +
          r.perfil.map(function (c) {
            return c.lim + ' ' + c.mediana.toFixed(1) + '/' + c.sigma.toFixed(1);
          }).join('  '));
        console.log('              campo vecino: ' + (r.vecino && r.vecino.sigma > 0
          ? ('a ' + r.vecino.offsetArcmin.toFixed(1) + '′ hacia ' + r.vecino.dir +
             ', lado ' + r.vecino.ladoArcmin.toFixed(1) + '′' +
             ' (difusa más cerca: ' + r.vecino.vecinaMasCercaArcmin.toFixed(1) + '′) · ' +
             r.vecino.escalaAs.toFixed(3) + '″/px · cielo ' + r.vecino.cielo.toFixed(2) +
             ' DN · σ ' + r.vecino.sigma.toFixed(2) + ' DN')
          : (r.vecinoMotivo || '—')));
      });
    });
  }, Promise.resolve());
}

/* ───────────────────────── --escala ───────────────────────── */

/* El confundido que obligó a enmendar el prerregistro: σ es por PÍXEL, y el
   parche del patrón tiene el píxel más grande que el de producción (mismos 1024
   px sobre un campo 2–4 veces mayor). Un píxel más grande promedia más ruido,
   así que la σ del patrón sale más baja SIN QUE NADA esté mal medido.

   Esto lo cuantifica sin suponer ningún modelo de ruido: agrupa el parche
   publicado k×k hasta el paso del patrón y vuelve a medir con las funciones de
   producción. Si la σ agrupada se parece a la del patrón, la diferencia era la
   escala y no la ley. */
function agrupar(datos, ancho, alto, k) {
  var aw = Math.floor(ancho / k), ah = Math.floor(alto / k), chico = new Float32Array(aw * ah);
  for (var by = 0; by < ah; by++) {
    for (var bx = 0; bx < aw; bx++) {
      var s = 0, c = 0;
      for (var dy = 0; dy < k; dy++) {
        for (var dx = 0; dx < k; dx++) {
          var v = datos[(by * k + dy) * ancho + bx * k + dx];
          if (v === v) { s += v; c++; }
        }
      }
      chico[by * aw + bx] = c ? s / c : NaN;
    }
  }
  return { datos: chico, ancho: aw, alto: ah };
}

function escala() {
  if (!fs.existsSync(SALIDA_PATRON)) {
    console.error('falta ' + path.basename(SALIDA_PATRON) + ': pasa antes --patron');
    process.exit(2);
  }
  var pat = JSON.parse(fs.readFileSync(SALIDA_PATRON, 'utf8'));
  console.log('¿Es la escala? σ del parche publicado agrupada hasta el paso del patrón\n');
  console.log('objeto        ″/px prod  ″/px patrón   k   σ L0 cruda   σ L0 agrupada   σ patrón');
  return BANCO_PATRON.reduce(function (cad, n) {
    return cad.then(function () {
      var p = pat[PUB.clave(n)];
      if (!p || !(p.sigma > 0)) return;
      var f = PUB.fila(n);
      return PUB.fuente(f).then(function (F) {
        if (!F) return;
        var k = Math.max(1, Math.round(p.escalaPatron / F.escalaAs));
        var c0 = PS1.ps1Cielo(F.datos, F.ancho, F.alto);
        var s0 = PS1.ps1SigmaCielo(F.datos, F.ancho, F.alto, c0);
        var g = agrupar(F.datos, F.ancho, F.alto, k);
        var c1 = PS1.ps1Cielo(g.datos, g.ancho, g.alto);
        var s1 = PS1.ps1SigmaCielo(g.datos, g.ancho, g.alto, c1);
        console.log((f[0] + '            ').slice(0, 13) + ' ' +
          F.escalaAs.toFixed(3).padStart(9) + ' ' + p.escalaPatron.toFixed(3).padStart(12) + ' ' +
          String(k).padStart(3) + ' ' + s0.toFixed(1).padStart(11) + ' ' +
          s1.toFixed(1).padStart(15) + ' ' + p.sigma.toFixed(1).padStart(10));
      });
    });
  }, Promise.resolve());
}

/* ───────────────────────── --e3nativo ───────────────────────── */

/* POST HOC, y fuera del prerregistro: E3 medida al paso NATIVO del stack.

   E3 se quedó sin σ en NGC 1788 porque su parche se publica a 0,105″/px cuando
   PS1 es de 0,25″: el 58 % de los píxeles vecinos son idénticos y la MAD de sus
   diferencias vale 0. Agrupando hasta 0,25″ antes de mirar vecinos hay ruido que
   medir otra vez. La σ se devuelve a la escala del parche multiplicando por k
   (agrupar k×k baja el ruido como k si es independiente).

   Esto NO es un veredicto: es material para el ticket de implementación, y si
   se quiere usar como ley necesita su propio prerregistro. */
function e3nativo() {
  if (!fs.existsSync(SALIDA_PATRON)) {
    console.error('falta ' + path.basename(SALIDA_PATRON) + ': pasa antes --patron');
    process.exit(2);
  }
  var pat = JSON.parse(fs.readFileSync(SALIDA_PATRON, 'utf8'));
  console.log('POST HOC (fuera del prerregistro): E3 al paso nativo de PS1 (0,25″/px)\n');
  console.log('objeto        ″/px    vecinos iguales   k   σ E3 nativo   σ patrón   log₂');
  var ds = [];
  return BANCO_PATRON.reduce(function (cad, n) {
    return cad.then(function () {
      var p = patronUtil(pat[PUB.clave(n)]);
      if (!p) return;
      return PUB.fuente(PUB.fila(n)).then(function (F) {
        if (!F) return;
        var d = F.datos, W = F.ancho, H = F.alto, x, y, iguales = 0, tot = 0;
        for (y = 0; y < H; y++) {
          for (x = 1; x < W; x++) {
            var a = d[y * W + x - 1], b = d[y * W + x];
            if (a !== a || b !== b) continue;
            tot++; if (a === b) iguales++;
          }
        }
        var k = Math.max(1, Math.round(ESCALA_NATIVA_AS / F.escalaAs));
        var g = agrupar(d, W, H, k);
        var s = sigmaVecinos(g.datos, g.ancho, g.alto) * k;
        var l = log2(s / p.sigma);
        ds.push(Math.abs(l));
        console.log((n + '            ').slice(0, 13) + ' ' + F.escalaAs.toFixed(3).padStart(6) +
          ' ' + (100 * iguales / (tot || 1)).toFixed(0).padStart(14) + ' % ' +
          String(k).padStart(3) + ' ' + s.toFixed(1).padStart(12) + ' ' +
          p.sigma.toFixed(1).padStart(10) + ' ' + (l >= 0 ? '+' : '') + l.toFixed(2).padStart(6));
      });
    });
  }, Promise.resolve()).then(function () {
    if (!ds.length) return;
    console.log('\nmediana |log₂| ' + mediana(ds.slice()).toFixed(2) +
                ' · máx ' + Math.max.apply(null, ds).toFixed(2) +
                '  (los listones del prerregistro eran 0,32 y 1,00, pero esta medida es post hoc)');
  });
}

/* ───────────────────────── --opciones ───────────────────────── */

/* Las tres estimaciones que se pueden hacer SOBRE EL PARCHE PUBLICADO. E4 no
   está aquí porque numéricamente es el patrón: lo suyo se mide en --hash. */
function estimaciones(datos, ancho, alto, afin, escena, ext) {
  var out = {};

  // L0 — la ley de hoy: mediana y MAD del marco del 6 %.
  out.L0 = { cielo: PS1.ps1Cielo(datos, ancho, alto) };
  out.L0.sigma = PS1.ps1SigmaCielo(datos, ancho, alto, out.L0.cielo);

  // E2 — fuera de la escena difusa (isofota μ25) y fuera de la extensión, dentro
  // del mismo parche. Donde quede sitio; si no queda, eso es el resultado.
  var fuera = [], x, y, v;
  for (y = 0; y < alto; y++) {
    for (x = 0; x < ancho; x++) {
      v = datos[y * ancho + x];
      if (v !== v) continue;
      if (PS1.ps1FuenteEnEscena(escena, afin, x, y)) continue;
      if (PS1.ps1FuenteEnEscena(ext, afin, x, y)) continue;
      fuera.push(v);
    }
  }
  out.E2 = { n: fuera.length };
  if (fuera.length >= 1000) {
    out.E2.cielo = mediana(fuera);
    out.E2.sigma = madSigma(fuera, out.E2.cielo);
  }

  /* E3 — σ ciega a la estructura: MAD de la diferencia entre píxeles vecinos en
     la misma fila, dividida por √2. Un gradiente suave no la mueve (la
     diferencia entre vecinos es el gradiente por píxel, mucho menor que el
     objeto) y el ruido sí. No produce cielo: se empareja con el de E2, y donde
     E2 no tenga sitio, con el de L0 (prerregistro). */
  var dif = [];
  for (y = 0; y < alto; y++) {
    for (x = 1; x < ancho; x++) {
      var a = datos[y * ancho + x - 1], b = datos[y * ancho + x];
      if (a !== a || b !== b) continue;
      dif.push(Math.abs(b - a));
    }
  }
  out.E3 = { sigma: dif.length ? 1.4826 * mediana(dif) / Math.SQRT2 : NaN,
             cielo: (out.E2.cielo != null) ? out.E2.cielo : out.L0.cielo,
             cieloDe: (out.E2.cielo != null) ? 'E2' : 'L0' };
  return out;
}

/* Lo que el suelo apaga dentro de la extensión, con un (cielo, σ) dados. El
   anclaje de producción manda a cero lo que no llega a cielo + kRuido·σ
   (ps1AnclarACatalogo): aquí se cuenta esa misma condición para poder
   evaluarla con σ que no son la de producción. El contraste contra
   `ps1AnclarACatalogo` con la ley de hoy se imprime al lado, y si no coinciden
   es que esta cuenta dejó de valer. */
function apagados(datos, ancho, alto, afin, ext, cielo, sigma) {
  var suelo = cielo + PS1.cfg.kRuido * sigma, n = 0, ap = 0;
  for (var y = 0; y < alto; y++) {
    for (var x = 0; x < ancho; x++) {
      if (!PS1.ps1FuenteEnEscena(ext, afin, x, y)) continue;
      var v = datos[y * ancho + x];
      if (v !== v) continue;
      n++;
      if (v <= suelo) ap++;
    }
  }
  return n ? ap / n : NaN;
}

/* El control negativo del prerregistro: con la σ de la opción, la razón entre el
   máximo de los anillos interiores (0–3 r_obj) y el exterior (3–4) de píxeles
   por encima de 3σ. #263 midió que en NGC 6888 no decae —o sea, que no hay
   estructura—; una σ que la «saque» está amplificando ruido. */
function anillos3sigma(datos, ancho, alto, afin, escala, rObj, cielo, sigma) {
  var LIM = [0.5, 1, 1.5, 2, 3, 4], cubos = LIM.map(function () { return { n: 0, s3: 0 }; });
  for (var y = 0; y < alto; y++) {
    for (var x = 0; x < ancho; x++) {
      var v = datos[y * ancho + x];
      if (v !== v) continue;
      var r = Math.hypot(x - afin.cx, y - afin.cy) * escala / rObj, k = 0;
      while (k < LIM.length && r > LIM[k]) k++;
      if (k >= LIM.length) continue;
      cubos[k].n++;
      if ((v - cielo) / sigma > 3) cubos[k].s3++;
    }
  }
  return cubos.map(function (c, i) {
    return { lim: LIM[i], pct: c.n ? 100 * c.s3 / c.n : NaN, n: c.n };
  });
}

function medirOpciones(nombre, patronDelObjeto) {
  var f = PUB.fila(nombre);
  return PUB.fuente(f).then(function (F) {
    if (!F) return { nombre: nombre, motivo: 'sin PNG publicado a mano (¿--dir?)' };
    var datos = F.datos, ancho = F.ancho, alto = F.alto;
    var gal = galDe(f);
    var fits = { ancho: ancho, alto: alto, datos: datos, escalaAs: F.escalaAs, wcs: F.wcs };
    fits.afin = PS1.ps1AfinParche(fits, gal);
    var ext = extensionDe(gal, fits.afin);
    var escena = PS1.ps1EscenaEnParche(fits, gal, PS1.ps1GalaxiasDelCampo(
      PS1.ps1CatalogoDifuso(window.BITACORA_GALAXIAS, window.BITACORA_NEBULOSAS),
      gal.ra, gal.dec, gal.ladoArcmin));

    /* Las estrellas se quitan donde hay fixture, con la función de producción,
       igual que en #263. Donde no lo hay, siguen dentro y empujan σ hacia
       ARRIBA en las tres estimaciones a la vez. */
    var estrellas = PUB.estrellas(f[0]);
    if (estrellas) {
      datos = PS1.ps1QuitarEstrellas(datos, ancho, alto,
        PS1.ps1EstrellasEnPixeles(fits, gal, estrellas),
        { afin: fits.afin, ba: gal.ba, pa: gal.pa, escena: escena });
      fits.datos = datos;
    }

    var est = estimaciones(datos, ancho, alto, fits.afin, escena, ext);
    var rObj = radioObjetoAs(gal);
    var res = { nombre: f[0], clase: f[12] || 'gal', escala: F.escalaAs, rObj: rObj,
                conFixture: !!estrellas, est: est, patron: patronDelObjeto || null,
                opciones: {} };

    /* El contraste de la cuenta de apagados contra el anclaje de producción: la
       misma condición, calculada por la función de producción, con la ley de hoy. */
    var anclado = PS1.ps1AnclarACatalogo(datos, ancho, alto, {
      magV: gal.magV, n: gal.n, reArcsec: gal.reArcsec,
      ladoArcmin: gal.ladoArcmin, escalaAs: F.escalaAs
    });
    var nProd = 0, apProd = 0;
    for (var y = 0; y < alto; y++) {
      for (var x = 0; x < ancho; x++) {
        if (!PS1.ps1FuenteEnEscena(ext, fits.afin, x, y)) continue;
        var i = y * ancho + x, a = anclado[i];
        if (a !== a) continue;
        nProd++;
        if (a === 0) apProd++;
      }
    }
    res.apagadosProduccion = nProd ? apProd / nProd : NaN;

    ['L0', 'E2', 'E3'].forEach(function (op) {
      var e = est[op];
      if (!(e.sigma > 0) || e.cielo == null) { res.opciones[op] = { motivo: 'sin sitio' }; return; }
      res.opciones[op] = {
        cielo: e.cielo, sigma: e.sigma,
        sueloSb: PS1.cfg.kRuido * e.sigma / (F.escalaAs * F.escalaAs),
        apagados: apagados(datos, ancho, alto, fits.afin, ext, e.cielo, e.sigma),
        anillos: anillos3sigma(datos, ancho, alto, fits.afin, F.escalaAs, rObj, e.cielo, e.sigma)
      };
    });
    /* E4 son el cielo y la σ del patrón aplicados a este parche: misma cuenta,
       otro origen de los dos números. */
    if (patronDelObjeto && patronDelObjeto.sigma > 0) {
      res.opciones.E4 = {
        cielo: patronDelObjeto.cielo, sigma: patronDelObjeto.sigma,
        sueloSb: PS1.cfg.kRuido * patronDelObjeto.sigma / (F.escalaAs * F.escalaAs),
        apagados: apagados(datos, ancho, alto, fits.afin, ext,
                           patronDelObjeto.cielo, patronDelObjeto.sigma),
        anillos: anillos3sigma(datos, ancho, alto, fits.afin, F.escalaAs, rObj,
                               patronDelObjeto.cielo, patronDelObjeto.sigma)
      };
    }
    return res;
  });
}

function log2(x) { return Math.log(x) / Math.LN2; }

/* El patrón con el que se juzga, ya juntas sus dos piezas (ADR 0027 + enmienda):
   el CIELO sale del anillo lejano del parche grande —la mediana no depende del
   tamaño del píxel— y la σ del campo vecino, que va a la misma escala que
   producción. Si falta cualquiera de las dos, no hay patrón. */
function patronUtil(p) {
  if (!p || !(p.cielo === p.cielo) || !p.vecino || !(p.vecino.sigma > 0)) return null;
  return { cielo: p.cielo, sigma: p.vecino.sigma,
           cieloVecino: p.vecino.cielo, sigmaAnillo: p.sigma,
           dir: p.vecino.dir, cerca: p.vecino.vecinaMasCercaArcmin };
}

function opciones() {
  if (!fs.existsSync(SALIDA_PATRON)) {
    console.error('falta ' + path.basename(SALIDA_PATRON) + ': pasa antes --patron');
    process.exit(2);
  }
  var pat = JSON.parse(fs.readFileSync(SALIDA_PATRON, 'utf8'));
  var solo = arg('--solo', '');
  var lista = solo ? [solo] : BANCO_PATRON;
  var todos = [];
  return lista.reduce(function (cad, n) {
    return cad.then(function () {
      return medirOpciones(n, patronUtil(pat[PUB.clave(n)])).then(function (r) { todos.push(r); });
    });
  }, Promise.resolve()).then(function () { informeOpciones(todos); });
}

function informeOpciones(todos) {
  var OPS = ['L0', 'E2', 'E3', 'E4'];
  console.log('E1–E4 contra el patrón de cielo lejano (#274, ADR 0027)\n');

  console.log('── cielo y σ, objeto a objeto (DN). «patrón» es el anillo lejano del parche grande.');
  console.log('objeto        cl    patrón cielo/σ       L0 cielo/σ          E2 cielo/σ          E3 σ');
  todos.forEach(function (r) {
    if (r.motivo) return console.log((r.nombre + '            ').slice(0, 13) + ' ' + r.motivo);
    var p = r.patron;
    var cel = function (o) {
      return o && o.sigma > 0 ? (o.cielo.toFixed(1) + '/' + o.sigma.toFixed(1)) : '—';
    };
    console.log((r.nombre + '            ').slice(0, 13) + ' ' +
      (r.clase + '    ').slice(0, 5) + ' ' +
      (p ? cel(p) : 'sin patrón').padStart(18) + '  ' +
      cel(r.opciones.L0).padStart(18) + '  ' +
      cel(r.opciones.E2).padStart(18) + '  ' +
      (r.opciones.E3 && r.opciones.E3.sigma > 0 ? r.opciones.E3.sigma.toFixed(1) : '—').padStart(8));
  });

  console.log('\n── el metro: log₂(σ_opción / σ_patrón). 0 = clavado; 1 = el doble.');
  console.log('objeto        cl        L0      E2      E3   · cielo: (c_opción − c_patrón)/σ_patrón');
  todos.forEach(function (r) {
    if (r.motivo || !r.patron) return;
    var l = (r.nombre + '            ').slice(0, 13) + ' ' + (r.clase + '    ').slice(0, 5) + ' ';
    var c = '';
    ['L0', 'E2', 'E3'].forEach(function (op) {
      var o = r.opciones[op];
      if (!o || !(o.sigma > 0)) { l += '     —  '; c += ' —'; return; }
      var d = log2(o.sigma / r.patron.sigma), dc = (o.cielo - r.patron.cielo) / r.patron.sigma;
      l += (d >= 0 ? '+' : '') + d.toFixed(2).padStart(6) + '  ';
      c += ' ' + op + ' ' + (dc >= 0 ? '+' : '') + dc.toFixed(2);
    });
    console.log(l + ' ·' + c);
  });

  /* Listones 1 y 2 del prerregistro, sobre los AFECTADOS con patrón. */
  console.log('\n── listones 1 y 2 (afectados con patrón; ADR 0027)');
  var afect = todos.filter(function (r) {
    return !r.motivo && r.patron && AFECTADOS.some(function (n) {
      return PUB.clave(n) === PUB.clave(r.nombre);
    });
  });
  ['L0', 'E2', 'E3', 'E4'].forEach(function (op) {
    var ds = [], dcs = [], falta = 0;
    afect.forEach(function (r) {
      var o = r.opciones[op];
      if (!o || !(o.sigma > 0)) { falta++; return; }
      ds.push(Math.abs(log2(o.sigma / r.patron.sigma)));
      dcs.push(Math.abs((o.cielo - r.patron.cielo) / r.patron.sigma));
    });
    if (!ds.length) return console.log('  ' + op + ': sin sitio en ninguno');
    var med = mediana(ds.slice()), max = Math.max.apply(null, ds), maxC = Math.max.apply(null, dcs);
    console.log('  ' + op + ': mediana |log₂| ' + med.toFixed(2) + ' (listón ≤0,32) · máx ' +
      max.toFixed(2) + ' (≤1,00) · máx |Δcielo|/σ ' + maxC.toFixed(2) + ' (≤0,50) · ' +
      (falta ? 'sin sitio en ' + falta + ' · ' : '') +
      ((med <= 0.32 && max <= 1.0 && maxC <= 0.5 && !falta)
        ? ('PASA' + (op === 'E4' ? ' — pero por construcción: E4 ES el patrón' : ''))
        : 'NO PASA'));
  });

  /* Listón 3: no regresión en los parches holgados. */
  console.log('\n── listón 3: no regresión en los controles de parche holgado');
  console.log('  (Δ suelo efectivo en mag ≤0,20 · Δ apagados ≤5 puntos, contra L0)');
  todos.forEach(function (r) {
    if (r.motivo || !CONTROLES.some(function (n) { return PUB.clave(n) === PUB.clave(r.nombre); })) return;
    var base = r.opciones.L0;
    var l = '  ' + (r.nombre + '          ').slice(0, 11) + ' L0 suelo ' +
            base.sueloSb.toFixed(0).padStart(6) + ' DN/as² apagados ' +
            (100 * base.apagados).toFixed(1) + ' % · ';
    ['E2', 'E3', 'E4'].forEach(function (op) {
      var o = r.opciones[op];
      if (!o || !(o.sigma > 0)) { l += op + ' — · '; return; }
      var dmag = Math.abs(2.5 * Math.log10(o.sueloSb / base.sueloSb));
      var dap = Math.abs(100 * (o.apagados - base.apagados));
      l += op + ' Δ' + dmag.toFixed(2) + ' mag/' + dap.toFixed(1) + ' pt ' +
           ((dmag <= 0.2 && dap <= 5) ? 'ok' : 'FUERA') + ' · ';
    });
    console.log(l);
  });

  /* Listón 4: el control negativo. */
  console.log('\n── listón 4: control negativo NGC 6888 (razón interior/exterior de %>3σ ≤2,0)');
  todos.forEach(function (r) {
    if (r.motivo || PUB.clave(r.nombre) !== PUB.clave('NGC6888')) return;
    OPS.forEach(function (op) {
      var o = r.opciones[op];
      if (!o || !o.anillos) return;
      var ext = o.anillos[o.anillos.length - 1].pct;
      var dentro = o.anillos.slice(0, -1).map(function (a) { return a.pct; });
      var max = Math.max.apply(null, dentro.filter(function (v) { return v === v; }));
      console.log('  ' + op + ': anillos ' + o.anillos.map(function (a) {
        return a.pct.toFixed(0);
      }).join('/') + ' % · razón ' + (max / (ext || 1e-9)).toFixed(2) +
        ' · ' + ((max / (ext || 1e-9)) <= 2.0 ? 'ok' : 'FUERA'));
    });
  });

  /* Lo que cada opción le hace al objeto: cuánto de su extensión deja de apagar. */
  console.log('\n── qué deja de apagar cada opción (fracción de la extensión apagada)');
  console.log('objeto        producción      L0      E2      E3      E4');
  todos.forEach(function (r) {
    if (r.motivo) return;
    var l = (r.nombre + '            ').slice(0, 13) + ' ' +
            (100 * r.apagadosProduccion).toFixed(1).padStart(9) + ' %';
    OPS.forEach(function (op) {
      var o = r.opciones[op];
      l += (o && o.apagados === o.apagados ? (100 * o.apagados).toFixed(1) + ' %' : '—').padStart(8);
    });
    console.log(l + (r.conFixture ? '' : '   (sin fixture de Gaia: estrellas dentro)'));
  });
}

/* ───────────────────────── --hash ───────────────────────── */

/* El coste de cada opción, comprobado contra el hash y no por lectura del
   código (criterio 3 del ticket, ADR 0026): se recalcula `version()` con los
   parámetros de hoy y con los de la opción, y se comparan las cadenas. */
function hash() {
  var GEN = require('./gen_dso_texturas.js');
  var objetos = objetosPublicados();
  var cambia = 0, medidos = 0, noCabe = 0, lineas = [];
  objetos.forEach(function (nombre) {
    var f = PUB.fila(nombre), s = PUB.sidecar(nombre);
    if (!f || !s) return;
    var gal = galDe(f);
    var fits = { ancho: s.ancho, alto: s.alto, escalaAs: s.escalaAs, wcs: s.wcs || null };
    fits.afin = PS1.ps1AfinParche(fits, gal);
    /* El radio que hay que dejar fuera es el MAYOR de los dos metros: la escena
       que producción protege y el tamaño de catálogo. Medir E1 contra `r_e`
       daría lados MENORES que los de hoy, que es justo el error que este ticket
       viene a corregir. */
    var rEsc = radioEscenaAs(fits, gal);
    var rObj = Math.max(rEsc, radioCatalogoAs(f, gal, rEsc));
    medidos++;
    /* E1 con el lado que haría falta para que el marco del 6 % quede FUERA del
       objeto: el marco empieza en 0,88 del medio lado, así que
       lado ≥ 2·r_obj/0,88, y el tope `ladoMax` sigue mandando. */
    var ladoE1 = Math.max(PS1.cfg.ladoMin, 2 * rObj / INICIO_MARCO / 60);
    /* E1 solo AGRANDA: donde el parche de hoy ya deja el marco fuera, no se
       toca. Y `ladoMax` sigue mandando, así que un objeto que pida más de 20′
       se queda con el marco contaminado aunque se republique el banco. */
    var recortado = Math.max(gal.ladoArcmin, ladoE1) > PS1.cfg.ladoMax;
    var ladoReal = Math.min(PS1.cfg.ladoMax, Math.max(gal.ladoArcmin, ladoE1));
    var hoy = GEN.version(gal, PS1.cfg.salida);
    var conE1 = GEN.version({ nombre: gal.nombre, ra: gal.ra, dec: gal.dec,
                              ladoArcmin: ladoReal }, PS1.cfg.salida);
    /* E2, E3 y E4 no tocan ninguno de los parámetros de la semilla: se recalcula
       con los mismos y se comprueba que sale la MISMA cadena. */
    var conE4 = GEN.version(gal, PS1.cfg.salida);
    if (hoy !== conE1) cambia++;
    if (recortado) noCabe++;
    lineas.push({ nombre: f[0], lado: gal.ladoArcmin, ladoE1: ladoE1, recortado: recortado,
                  factor: ladoE1 / (gal.ladoArcmin || 1), hoy: hoy, e1: conE1, e4: conE4 });
  });
  lineas.sort(function (a, b) { return b.factor - a.factor; });
  console.log('El coste de cada opción contra version() (ADR 0026) — ' + medidos + ' texturas\n');
  console.log('objeto        lado hoy   lado E1   ×      hash hoy   hash E1    hash E2/E3/E4');
  lineas.forEach(function (r) {
    console.log((r.nombre + '            ').slice(0, 13) + ' ' +
      r.lado.toFixed(1).padStart(8) + '′ ' + r.ladoE1.toFixed(1).padStart(8) + '′' +
      (r.recortado ? '*' : ' ') + ' ' + r.factor.toFixed(2).padStart(5) + '  ' +
      r.hoy + '   ' + r.e1 + '   ' + r.e4 + (r.hoy === r.e4 ? ' (igual)' : ' ¡DISTINTO!'));
  });
  console.log('\nE1 cambia el hash en ' + cambia + ' de ' + medidos +
              ' objetos → republica el banco entero y hay que volver a descargarlo.');
  console.log('* ' + noCabe + ' objetos piden un lado por encima de ladoMax = ' + PS1.cfg.ladoMax +
              '′: a esos E1 NO les arregla el marco ni republicando.');
  console.log('E2/E3 no tocan ningún parámetro de la semilla: el hash no se mueve, no republican nada.');
  console.log('E4 tampoco mueve el hash, pero reescribe el SIDECAR de cada objeto (cielo y σ nuevos)');
  console.log('  bajo el mismo nombre de fichero, que es una tirada del banco con red y, por el');
  console.log('  punto 3 del ADR 0026, contenido nuevo bajo un nombre declarado inmutable.');
}

/* ───────────────────────── despacho ───────────────────────── */

var modo = tiene('--marco') ? marco : tiene('--patron') ? patron
         : tiene('--escala') ? escala : tiene('--e3nativo') ? e3nativo
         : tiene('--e1') ? e1
         : tiene('--opciones') ? opciones : tiene('--hash') ? hash : null;
if (!modo) {
  console.error('uso: node scripts/harness_suelo_cielo.js --marco | --patron | --e1 | --escala | --e3nativo | --opciones | --hash');
  process.exit(2);
}
Promise.resolve().then(modo).catch(function (e) {
  console.error('FALLO: ' + (e && e.stack || e));
  process.exit(1);
});
