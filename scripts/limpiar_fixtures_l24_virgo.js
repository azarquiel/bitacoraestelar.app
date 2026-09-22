#!/usr/bin/env node
/* Borra las fixtures sintéticas de scripts/gen_fixtures_l24_virgo.js
   (prefijo L24SINT_) de simulador_ocular/dso/. No toca nada más: el filtro
   es el prefijo, no la extensión, así que una textura real nunca cae aquí.

   Uso:  node scripts/limpiar_fixtures_l24_virgo.js */
'use strict';
var fs = require('fs'), path = require('path');
var DIR = path.join(__dirname, '..', 'simulador_ocular', 'dso');
var n = 0;
(fs.existsSync(DIR) ? fs.readdirSync(DIR) : []).forEach(function (f) {
  if (f.indexOf('L24SINT_') !== 0) return;
  fs.unlinkSync(path.join(DIR, f));
  n++;
});
console.log(n + ' fixture(s) L24SINT_ borradas de ' + DIR);
