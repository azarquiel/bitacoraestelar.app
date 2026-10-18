#!/usr/bin/env node
'use strict';
/* Test de «Centrar» en el mapa de la galaxia: la ficha de un marcador arma el
   MISMO botón que las escenas 3D (armarCentrar), y la galaxia lo resuelve con
   el vuelo de «Volver al Sol», sin tocar el zoom.

   Sin dependencias:  node scripts/test_centrar_galaxia.js  */
var fs = require('fs');
var E = require('../mapa/js/via-lactea-escalas.js');
var app = fs.readFileSync(__dirname + '/../mapa/js/via-lactea-app.js', 'utf8');
var fallos = 0;
function ok(c, e) { if (c) console.log('  ok   ' + e); else { fallos++; console.error('  FALLA ' + e); } }

// Pura: un objeto está centrado si cae a menos de un par de px del centro del visor.
ok(E.enCentro(0, 0) && E.enCentro(1, -1), 'en el centro (o a 1 px) cuenta como centrado');
ok(!E.enCentro(3, 0) && !E.enCentro(0, -40), 'unos px fuera ya no');

// La galaxia ofrece centrar/esCentro como las escenas 3D.
var ga = app.slice(app.indexOf('var escenaGalaxia'), app.indexOf('function escenas3D'));
ok(/centrar: function/.test(ga) && /esCentro: function/.test(ga), 'la galaxia ofrece centrar() y esCentro()');
ok(/VLEscalas\.enCentro\(/.test(ga), 'esCentro usa VLEscalas.enCentro');
ok(/querySelector\('\.mw-punto'\)/.test(ga), 'esCentro mide el punto (el hundido deja el ancla en el plano)');
ok(/centrar: function \(obj\) \{\s*if \(VLCapas\.capaActiva\(alphaAtlas, alphaVecindario\) !== 'galaxia'\) return;/.test(ga), 'centrar solo con la galaxia como capa activa');
ok((app.match(/\(r\.left \+ r\.width \/ 2\) - \(vr\.left \+ vr\.width \/ 2\)/g) || []).length === 1, 'una sola cuenta del desfase al centro del visor (desfaseDelVisor)');

// Un solo vuelo para el Sol y para el objeto: sin copiar la curva.
var vuelo = app.slice(app.indexOf('function volarAlCentro'), app.indexOf('centroVolver.addEventListener'));
ok(/function volarAlCentro\(/.test(app) && (vuelo.match(/VLCentro\.vuelo\(/g) || []).length === 1, 'un único vuelo, volarAlCentro');
ok(/function volverAlSol\(\)[\s\S]*?volarAlCentro\(sol\.x, sol\.y/.test(app), 'volverAlSol vuela con volarAlCentro');
ok(/centrar: function \(obj\) \{[\s\S]*?volarAlCentro\(/.test(ga), 'centrar vuela con volarAlCentro');

// Una sola cuenta de la posición en la vista activa, la de la búsqueda.
ok(/function anclaEnVista\(obj\)/.test(app), 'anclaEnVista(obj) existe');
var busq = app.slice(app.indexOf('function irAObjetoRegistrado'), app.indexOf('function doSearch'));
ok(/anclaEnVista\(obj\)/.test(busq) && !/edgeXAt\(/.test(busq), 'la búsqueda usa anclaEnVista, sin cuenta propia');
ok(/anclaEnVista\(obj\)/.test(ga), 'centrar usa anclaEnVista');

// El marcador arma el mismo botón de la ficha, solo si se abrió la ficha.
ok(/armarCentrar\(obj, escenaGalaxia\)/.test(app), 'la ficha de un marcador arma «Centrar» con la galaxia');
var mk = app.slice(app.indexOf('function openObjectPdf'), app.indexOf('function closeObjectPdf'));
ok(/fichaOverlay\.style\.display === 'flex'\) armarCentrar\(obj, escenaGalaxia\)/.test(mk), 'y solo con la ficha abierta (no el PDF)');

if (fallos) { console.error('\n' + fallos + ' fallo(s)'); process.exit(1); }
console.log('\nTodo bien');
