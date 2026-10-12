#!/usr/bin/env node
/* Test de la BÚSQUEDA que centra la escena (mapa/js/via-lactea-app.js, #426).
   La app es una IIFE con DOM: se fija por el código fuente que la búsqueda de
   una galaxia del atlas o una estrella del vecindario llama a centrar() DESPUÉS
   de poner la escala, y que la estrella se resuelve a la de la escena.

   Sin dependencias:  node scripts/test_busqueda_centra_escena.js  */
'use strict';
var fs = require('fs');
var app = fs.readFileSync(__dirname + '/../mapa/js/via-lactea-app.js', 'utf8');
var vs = fs.readFileSync(__dirname + '/../mapa/js/vecindario-solar.js', 'utf8');
var fallos = 0;
function ok(c, e) { if (c) console.log('  ok   ' + e); else { fallos++; console.error('  FALLA ' + e); } }

var atlas = app.slice(app.indexOf('function enfocarObjetoAtlas'));
atlas = atlas.slice(0, atlas.indexOf('\n  }\n'));
ok(atlas.indexOf('irAlAtlasConDistancia(o.d)') < atlas.indexOf('GrupoLocal.centrar(o, true)') &&
   atlas.indexOf('GrupoLocal.centrar(o, true)') > 0, 'atlas: centrar tras fijar la escala (AC1/AC3)');
ok(/typeof o\.x === 'number'/.test(atlas), 'atlas: sin posición 3D no centra');

var reg = app.slice(app.indexOf('function irAObjetoRegistrado'));
reg = reg.slice(0, reg.indexOf('\n  }\n'));
ok(reg.indexOf('irAlVecindario(obj)') < reg.indexOf('VecindarioSolar.centrar(est, true)'), 'vecindario: centrar tras entrar (AC2)');
ok(/VecindarioSolar\.porId && VecindarioSolar\.porId\(obj\.id\)/.test(reg), 'vecindario: centra la estrella de la escena, no la de OBJECTS');
ok(/porId: function \(id\)/.test(vs), 'VecindarioSolar expone porId');
var viaje = app.slice(app.indexOf('function encuadrarViaje'), app.indexOf('function encuadrarViaje') + 900);
ok(!/centrar\(/.test(viaje), 'el viaje no centra (solo la búsqueda)');
var gl = fs.readFileSync(__dirname + '/../mapa/js/grupo-local.js', 'utf8');
ok(/function centrar\(o, silencio\)[\s\S]*?pintarIndicador\(silencio\)/.test(gl) &&
   /function centrar\(o, silencio\)[\s\S]*?pintarIndicador\(silencio\)/.test(vs) &&
   /aria-live', 'off'/.test(gl) && /aria-live', 'off'/.test(vs), 'AC6: la búsqueda centra sin anunciar «Centro: …»');
process.exit(fallos ? 1 : 0);
