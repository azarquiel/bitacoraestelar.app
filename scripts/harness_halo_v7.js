#!/usr/bin/env node
/* Arnés de diagnóstico del halo de globulares — iteración v7, etapa E0.

   Convierte tres impresiones visuales en números ANTES de tocar el render:

     D1  halo exterior demasiado extenso y brillante (M13, 146x)
     D2  al subir aumentos el cielo se atenúa y el halo no
     D3  anillos concéntricos en cúmulos concentrados (47 Tuc)

   No toca código de producción: solo lo mide. Dos puntos de medida, porque
   confundirlos invalida cualquier conclusión:

     TAP FÍSICO      el campo tal como sale de la Capa 3, antes de que ninguna
                     ley perceptual lo toque. Aquí se comprueban igualdades
                     numéricas: la atenuación de pupila, la ley del grano.
     TAP PERCEPTUAL  lo que queda tras Cmin, antes del volcado a 8 bits. Aquí
                     solo se comprueba fenomenología: qué desaparece antes.

   Los factores de atenuación se miden POR SEPARADO para el halo y para el
   cielo, y cada uno declara de qué función sale: la pregunta de D2 no es
   cuánto se atenúa cada uno, es si los dos beben de la misma ley.

   node scripts/harness_halo_v7.js            volcado de la matriz de v7
   node scripts/harness_halo_v7.js --json     el mismo volcado, para archivar */
'use strict';

global.window = global.window || {};
global.document = undefined;
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/lf-globulares-datos.js');
require('../simulador_ocular/resources/js/globulares-datos.js');
require('../resources/js/bitacora-cumulos.js');
var R = global.window.BitacoraGaiaRender;
var C = global.window.BitacoraCumulos;
var CATALOGO = global.window.BITACORA_GLOBULARES;

function cumulo(id) {
  var e = CATALOGO.filter(function (f) { return f[0] === id; })[0];
  if (!e) throw new Error('no está en el catálogo: ' + id);
  return { id: e[0], ra: e[2], dec: e[3], rc: e[4], rh: e[5], c: e[6], muV0: e[7],
           Vt: e[8], dkpc: e[9], ebv: e[10], feh: e[11], elip: e[12], pa: null };
}

/* Perfil por anillos de un campo en flujo por arcsec². Devuelve la media del
   anillo (no la del centro), su mu en mag/arcsec² y la dispersión, que es lo
   que pide la ley del grano. Los anillos son del radio PROPIO del cúmulo: en
   uno elíptico, medir en radio circular mezcla isofotas distintas y fabrica
   una dispersión que no existe. */
function anillos(campo, geom, opciones) {
  var n = opciones.n || 40, r0 = opciones.r0As || 0, r1 = opciones.r1As;
  var valido = opciones.valido;                 // opcional: 1 = el píxel cuenta
  var SIZE = geom.size, asPorPx = geom.arcmin * 60 / SIZE, cen = SIZE / 2;
  var suma = new Float64Array(n), suma2 = new Float64Array(n), cuenta = new Int32Array(n);
  var sumaR = new Float64Array(n);
  var paso = (r1 - r0) / n;
  for (var y = 0; y < SIZE; y++) {
    for (var x = 0; x < SIZE; x++) {
      var rAs = geom.radioPropio((x - cen) * asPorPx, (y - cen) * asPorPx);
      var k = Math.floor((rAs - r0) / paso);
      if (k < 0 || k >= n) continue;
      if (valido && !valido[y * SIZE + x]) continue;
      var v = campo[y * SIZE + x];
      suma[k] += v; suma2[k] += v * v; sumaR[k] += rAs; cuenta[k]++;
    }
  }
  var salida = [];
  for (var i = 0; i < n; i++) {
    var m = cuenta[i] ? suma[i] / cuenta[i] : 0;
    var varia = cuenta[i] ? Math.max(0, suma2[i] / cuenta[i] - m * m) : 0;
    salida.push({
      r0As: r0 + i * paso, r1As: r0 + (i + 1) * paso,
      rAs: cuenta[i] ? sumaR[i] / cuenta[i] : r0 + (i + 0.5) * paso,
      n: cuenta[i], I: m, mu: m > 0 ? -2.5 * Math.log10(m) : Infinity,
      sigma: Math.sqrt(varia)
    });
  }
  return salida;
}

/* Una medida completa de un cúmulo con un equipo. Pinta DOS veces el mismo
   cúmulo, con la misma semilla: una recogiendo el campo crudo (tap físico) y
   otra el buffer pintado (tap perceptual). Las dos comparten la tabla radial,
   así que el reparto es el mismo y lo único que las separa es la capa
   perceptual — que es justo lo que se quiere aislar. */
function medir(cum, cfg) {
  var SIZE = cfg.size || 720;
  var pob = C.poblacionCacheada(cum, cfg.realization || 0);
  var ARCMIN = cfg.arcmin || Math.ceil(2.4 * pob.rtAs / 60);
  var cielo = {
    pupilaSalida: cfg.D / cfg.MAG, pupilaOjo: cfg.pupilaOjo || 7, sqm: cfg.sqm,
    transmision: cfg.transmision || 0.9, aumentos: cfg.MAG,
    perceptual: cfg.perceptual !== false
  };
  var difuso = new Float32Array(SIZE * SIZE);
  var crudo = new Float32Array(SIZE * SIZE);
  var res = R.pintarCumulo(difuso, cum, {
    ra0: cum.ra, dec0: cum.dec, arcmin: ARCMIN, size: SIZE, cielo: cielo,
    apertura: cfg.D, estrellas: [], campoCrudo: crudo, realization: cfg.realization || 0
  });
  var geom = { size: SIZE, arcmin: ARCMIN, radioPropio: pob.radioPropio };
  var rango = { r0As: 0, r1As: Math.min(pob.rtAs, ARCMIN * 60 / 2), n: cfg.anillos || 40 };
  var fisico = anillos(crudo, geom, rango);
  var perceptual = anillos(difuso, geom, rango);
  /* Tercer perfil: <I>(r) del modelo, sin grano y sin percepción, promediado
     sobre los MISMOS píxeles. Hace falta como referencia exacta porque la media
     muestral del campo crudo no lo es: la lognormal está sesgada y con pocos
     píxeles por anillo su media cae por debajo de <I> (medido: hasta un 4 % en
     los anillos internos). Comparar taps entre sí sin esta referencia hace
     parecer bug lo que es el estimador. */
  var modeloCampo = new Float32Array(SIZE * SIZE);
  var asPorPx = ARCMIN * 60 / SIZE, cen = SIZE / 2;
  for (var py = 0; py < SIZE; py++) {
    for (var px = 0; px < SIZE; px++) {
      var rr = pob.radioPropio((px - cen) * asPorPx, (py - cen) * asPorPx);
      modeloCampo[py * SIZE + px] = enTabla(res.tabla, res.tabla.I, rr);
    }
  }
  var modelo = anillos(modeloCampo, geom, rango);

  /* El factor de cada componente, MEDIDO y con su procedencia. El del cielo se
     lee de la cadena; el del halo se deduce comparando lo pintado con lo que el
     modelo dijo, que es la única forma de cazar un factor que no se aplica.

     El contexto es EL MISMO objeto que usó pintarCumulo (`res.cHalo`), no una
     segunda llamada: si el arnés recalculase la cadena por su cuenta, mediría su
     propia copia de la ley y no la del render —justo la duplicación que E1.3
     prohíbe—. Volver a llamar aquí, además, salía por la rama C_MAG por no
     pasarle theta, y el Cmin del volcado no era el del halo. */
  var ctx = res.cHalo;
  var esperado = 0, pintado = 0;
  for (var i = 0; i < fisico.length; i++) {
    if (!(fisico[i].n > 0)) continue;
    esperado += modelo[i].I * fisico[i].n;
    pintado += fisico[i].I * fisico[i].n;
  }
  return {
    id: cum.id, D: cfg.D, MAG: cfg.MAG, sqm: cfg.sqm, arcmin: ARCMIN, size: SIZE,
    radioImagenAs: res.radioImagenAs, rcAs: pob.rcAs, rhAs: cum.rh * 60, rtAs: pob.rtAs,
    dim: ctx.dim, T: ctx.T, SBe: ctx.SBe, Cmin: ctx.Cmin,
    // Fcielo es el flujo del cielo SIN atenuar: el marco en el que trabaja todo
    // el render (pintarFot pinta el objeto como incremento de contraste sobre
    // él). El halo se mide contra este número, no contra SBe, que ya lleva dim.
    Fcielo: ctx.Fcielo, ctxHalo: ctx, ctxGrano: res.cGrano,
    muCielo: ctx.SBe,
    fisico: fisico, perceptual: perceptual, modelo: modelo, tabla: res.tabla,
    /* Re-medir a otro rango sin volver a pintar. Es una función a propósito:
       JSON.stringify la omite, así que el volcado archivado no engorda con los
       tres buffers y el test de determinismo sigue comparando solo números. */
    /* Sigma(r) del perfil de King, sin fotometría ninguna. Es el patrón de
       suavidad contra el que se juzga <I>(r): King es liso por construcción, así
       que todo codo que aparezca en <I> y no en Sigma lo ha metido la cadena
       fotométrica, no la forma del cúmulo. */
    sigmaEn: pob.sigma,
    // Funciones, no la población entera: JSON.stringify las omite y el volcado
    // archivado sigue siendo solo números.
    S1: pob.S1, S2: pob.S2, mCrowd: pob.mCrowd, radioImagenAs: res.radioImagenAs,
    // Los momentos que usa el render (ADR 0012): llevan radio e imagen estelar.
    S1campo: pob.S1campo, S2campo: pob.S2campo, Fdibujado: pob.Fdibujado,
    /* La celda de ruido con la que el render dividió S2. Se recalcula aquí con
       la misma regla (max(beam, píxel)) para que el test de la ley del grano
       tenga el denominador sin abrir la tabla. */
    areaPx: asPorPx * asPorPx,
    omegaBeam: res.omegaBeam,
    /* La escala a la que el render juzga el grano y la atenuación que le aplica
       (ver pintarCumulo). Se leen del resultado, no se recalculan: el arnés que
       reimplementa la ley mide su propia copia, que es como v7 archivó Cmin de
       otra rama (lección 9). `razonBeam` es la misma razón evaluada como la
       juzgaba v7 —el beam como elemento aislado—, y está aquí para que la mejora
       de la ley se pueda medir en vez de creerse. */
    thBeamAs: res.thBeamAs, thGranoAs: res.thGranoAs, atenGrano: res.atenGrano,
    razonGrano: razonMax(res, res.cGrano, res.atenGrano),
    razonBeam: razonMax(res, R.ctxFotometrico(cielo, res.thBeamAs / 60), 1),
    perfilEn: function (cual, r0As, r1As, n) {
      var campos = { crudo: crudo, difuso: difuso, modelo: modeloCampo };
      return anillos(campos[cual], geom, { r0As: r0As, r1As: r1As, n: n });
    },
    /* sigma del GRANO por anillos: dispersión del residuo píxel a píxel contra
       <I>(r), no del campo. Medir la dispersión del campo a secas mezclaría el
       grano con la pendiente del perfil dentro del anillo, que en el núcleo es
       lo que domina, y la ley sigma² = Sigma·S2/Omega quedaría irreconocible.

       Se mide EN LOGARITMO y se devuelve convertida. El campo es lognormal: en
       lineal tiene cola pesada y la desviación muestral de un anillo se va un
       ±35 % con unos cientos de píxeles —medido—, así que un test por anillo al
       5 % estaría midiendo el estimador, no la ley. En log el campo es normal,
       el error del estimador es 1/sqrt(2n) y la conversión
       sigma = <I>·sqrt(e^{s²}−1) es exacta, no aproximada. */
    granoEn: function (r0As, r1As, n) {
      var lg = new Float32Array(crudo.length), val = new Float32Array(crudo.length);
      var nrm = new Float32Array(crudo.length), valN = new Float32Array(crudo.length);
      var cen2 = SIZE / 2;
      for (var py2 = 0; py2 < SIZE; py2++) {
        for (var px2 = 0; px2 < SIZE; px2++) {
          var k = py2 * SIZE + px2;
          if (!(crudo[k] > 0) || !(modeloCampo[k] > 0)) continue;
          lg[k] = Math.log(crudo[k] / modeloCampo[k]); val[k] = 1;
          /* Además de la anchura cruda, la anchura NORMALIZADA por la que la
             tabla pidió en ESE píxel. Comparar anchuras promediadas por anillo
             mezcla radios con lnS distinto y el residuo que sale es el del
             promediado, no el del grano; dividiendo píxel a píxel el estimador
             vale 1 en todas partes o la máquina de muestreo está mal. */
          var sPix = enTabla(res.tabla, res.tabla.lnS,
            pob.radioPropio((px2 - cen2) * asPorPx, (py2 - cen2) * asPorPx));
          // Se le quita también la mediana de la lognormal (−s²/2): lo que queda
          // es el propio g, que por construcción tiene media 0 y varianza 1.
          if (sPix > 0) { nrm[k] = (lg[k] + sPix * sPix / 2) / sPix; valN[k] = 1; }
        }
      }
      var rango1 = { r0As: r0As, r1As: r1As, n: n };
      var aLog = anillos(lg, geom, { r0As: r0As, r1As: r1As, n: n, valido: val });
      var aNrm = anillos(nrm, geom, { r0As: r0As, r1As: r1As, n: n, valido: valN });
      var aMod = anillos(modeloCampo, geom, rango1);
      return aLog.map(function (a, i) {
        return { rAs: a.rAs, r0As: a.r0As, r1As: a.r1As, n: a.n,
                 sLn: a.sigma, sNorm: aNrm[i].sigma, Imodelo: aMod[i].I,
                 sigma: aMod[i].I * Math.sqrt(Math.max(0, Math.exp(a.sigma * a.sigma) - 1)) };
      });
    },
    factores: {
      cielo: { valor: ctx.dim * ctx.T, mag: -2.5 * Math.log10(ctx.dim * ctx.T),
               origen: 'ctxFotometrico(): dim = (pupilaEfectiva/pupilaOjo)^2, por T' },
      halo: { valor: esperado > 0 ? pintado / esperado : 0,
              mag: esperado > 0 ? -2.5 * Math.log10(pintado / esperado) : Infinity,
              origen: 'pintarCumulo(): flujo del campo tal cual, medido contra <I>(r) del modelo' }
    }
  };
}

/* Lo más cerca que el grano llega del umbral en TODO el perfil: max_r de
   σ(r)·aten / ((Fcielo + ⟨I⟩(r))·Cmin). Es la magnitud no vacua que sustituye a
   `s_grano` mientras `s_grano` valga 0 — un criterio comprobado sobre el conjunto
   vacío no verifica nada (lección 6 de v7). */
function razonMax(res, ctx, aten) {
  var t = res.tabla, peor = 0;
  for (var i = 0; i < t.r.length; i++) {
    var fondo = (ctx.Fcielo + t.I[i]) * ctx.Cmin;
    if (fondo > 0) peor = Math.max(peor, t.sigma[i] * aten / fondo);
  }
  return peor;
}

function enTabla(tabla, v, rAs) {
  if (!(rAs >= 0) || rAs >= tabla.r[tabla.r.length - 1]) return 0;
  var u = rAs / tabla.paso, i = Math.floor(u), t = u - i;
  return v[i] * (1 - t) + v[i + 1] * t;
}

/* Segunda diferencia de mu(r), normalizada por el paso: el detector de
   escalones que separa las dos causas candidatas de D3. Un perfil suave la
   tiene pequeña en todas partes; un escalón la dispara justo donde salta. */
function escalones(perfil) {
  var peor = 0, peorEn = 0, lista = [];
  for (var i = 1; i < perfil.length - 1; i++) {
    var a = perfil[i - 1].mu, b = perfil[i].mu, c = perfil[i + 1].mu;
    if (!isFinite(a) || !isFinite(b) || !isFinite(c)) continue;
    var d2 = Math.abs(a - 2 * b + c);
    lista.push({ rAs: perfil[i].rAs, d2: d2 });
    if (d2 > peor) { peor = d2; peorEn = perfil[i].rAs; }
  }
  return { peor: peor, rAs: peorEn, lista: lista };
}

module.exports = { cumulo: cumulo, anillos: anillos, medir: medir, escalones: escalones };

/* ── Volcado de la matriz de v7 ──────────────────────────────────────────── */
if (require.main === module) {
  var CASOS = [
    { id: 'NGC 6205', nombre: 'M13' },
    { id: 'NGC 104', nombre: '47 Tuc' }
  ];
  var EQUIPOS = [
    { D: 200, MAG: 146, sqm: 21.5 },
    { D: 200, MAG: 514, sqm: 21.5 }
  ];
  var volcado = [];
  CASOS.forEach(function (caso) {
    var cum = cumulo(caso.id);
    var medidas = EQUIPOS.map(function (eq) {
      return medir(cum, { D: eq.D, MAG: eq.MAG, sqm: eq.sqm, realization: 0 });
    });
    volcado.push({ caso: caso, medidas: medidas });

    console.log('\n══ ' + caso.nombre + ' (' + caso.id + ') ' +
      'r_c = ' + medidas[0].rcAs.toFixed(1) + '"  r_h = ' + medidas[0].rhAs.toFixed(1) +
      '"  r_t = ' + medidas[0].rtAs.toFixed(0) + '"');

    medidas.forEach(function (m) {
      console.log('  ' + m.D + ' mm ' + m.MAG + 'x  pupila ' + (m.D / m.MAG).toFixed(2) +
        ' mm  dim ' + m.dim.toFixed(4) + '  SBe ' + m.SBe.toFixed(2) + ' mag/arcsec²' +
        '  Cmin ' + m.Cmin.toExponential(2));
    });

    // D2: lo mismo preguntado dos veces, una por componente.
    var dCielo = medidas[1].SBe - medidas[0].SBe;
    var iRef = indiceEn(medidas[0].fisico, medidas[0].rhAs);
    var dHaloFis = medidas[1].fisico[iRef].mu - medidas[0].fisico[iRef].mu;
    var dHaloPer = medidas[1].perceptual[iRef].mu - medidas[0].perceptual[iRef].mu;
    console.log('  D2 · de ' + EQUIPOS[0].MAG + 'x a ' + EQUIPOS[1].MAG + 'x, en r_h:');
    console.log('       Δμ cielo          ' + dCielo.toFixed(3) + ' mag   [' +
      medidas[0].factores.cielo.origen + ']');
    console.log('       Δμ halo (físico)  ' + dHaloFis.toFixed(3) + ' mag   [' +
      medidas[0].factores.halo.origen + ']');
    console.log('       Δμ halo (percep.) ' + (isFinite(dHaloPer) ? dHaloPer.toFixed(3) : '∞') + ' mag');
    console.log('       factor medido sobre el halo: ' +
      medidas[0].factores.halo.valor.toFixed(6) + ' (el del cielo es ' +
      medidas[0].factores.cielo.valor.toFixed(6) + ')');

    // D1: hasta dónde llega el halo y con qué brillo.
    medidas.forEach(function (m) {
      var ultimo = null;
      m.perceptual.forEach(function (a) { if (a.I > 0) ultimo = a; });
      console.log('  D1 · ' + m.MAG + 'x: el difuso pintado llega a ' +
        (ultimo ? (ultimo.rAs / m.rhAs).toFixed(2) + ' r_h con μ = ' + ultimo.mu.toFixed(2) : '—') +
        ', cielo a μ = ' + m.SBe.toFixed(2));
    });

    /* D3: escalones en el Float32, antes de cualquier cuantización. Se mide
       sobre el perfil del MODELO y no sobre el campo pintado: el grano es ruido
       multiplicativo y su segunda diferencia domina en el borde, donde el flujo
       es ínfimo, tapando cualquier escalón del interior —que es donde se ven
       los anillos—. */
    medidas.forEach(function (m) {
      var e = escalones(m.perfilEn('modelo', 0, 6 * m.rcAs, 60));
      var eGrano = escalones(m.perfilEn('crudo', 0, 6 * m.rcAs, 60));
      /* La misma cuenta sobre Sigma(r) y sobre <I>(r) = Sigma·S1, muestreadas en
         la MISMA malla: si la de <I> es mucho mayor, el codo lo pone S1. */
      var n60 = 60, paso = 6 * m.rcAs / n60, sig = [], mod = [];
      for (var k = 1; k <= n60; k++) {
        var rk = k * paso, s = m.sigmaEn(rk), Im = enTabla(m.tabla, m.tabla.I, rk);
        if (!(s > 0) || !(Im > 0)) continue;
        sig.push({ rAs: rk, mu: -2.5 * Math.log10(s) });
        mod.push({ rAs: rk, mu: -2.5 * Math.log10(Im) });
      }
      var eSigma = escalones(sig), eModelo = escalones(mod);
      console.log('  D3 · ' + m.MAG + 'x, dentro de 6 r_c: segunda diferencia de μ(r) máxima ' +
        e.peor.toFixed(4) + ' mag (modelo) / ' + eGrano.peor.toFixed(4) + ' mag (con grano)' +
        ', en r = ' + e.rAs.toFixed(0) + '" (' + (e.rAs / m.rcAs).toFixed(2) + ' r_c)');
      console.log('       forma pura King ' + eSigma.peor.toFixed(4) + ' mag  vs  <I> = Σ·S1 ' +
        eModelo.peor.toFixed(4) + ' mag en r = ' + eModelo.rAs.toFixed(0) + '"  →  ' +
        (eModelo.peor > 3 * eSigma.peor ? 'el codo lo mete S1(m_res), no el perfil'
                                        : 'sin codo atribuible a la fotometría'));
    });
  });

  if (process.argv.indexOf('--json') >= 0) {
    console.log('\n' + JSON.stringify(volcado.map(function (v) {
      return { caso: v.caso, medidas: v.medidas.map(function (m) {
        return { D: m.D, MAG: m.MAG, sqm: m.sqm, dim: m.dim, SBe: m.SBe, Cmin: m.Cmin,
                 factores: m.factores,
                 fisico: m.fisico.map(compacto), perceptual: m.perceptual.map(compacto) };
      }) };
    }), null, 1));
  }
}

function compacto(a) {
  return { rAs: +a.rAs.toFixed(3), n: a.n, I: a.I, mu: +a.mu.toFixed(4),
           sigma: a.sigma };
}

function indiceEn(perfil, rAs) {
  for (var i = 0; i < perfil.length; i++) if (perfil[i].r1As > rAs) return i;
  return perfil.length - 1;
}
