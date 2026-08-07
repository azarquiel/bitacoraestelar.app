#!/usr/bin/env node
/* Test del SEGUNDO AUXILIAR del formulario de observaciones.

   Encadenar dos ópticas auxiliares (un Paracorr y detrás un Barlow) se hace
   pocas veces, así que su hueco ya no ocupa sitio en la fila de equipo: nace
   oculto y lo descubre un "+" pegado al primer auxiliar. El simulador de
   oculares sí lo enseña siempre —ahí se está probando material, no anotando lo
   que se usó—, y eso también se comprueba aquí.

   Lo que se fija es el contrato entre tres archivos que nadie obliga a viajar
   juntos (el .js que pinta la entrada, la hoja de estilo y el fragmento de
   WordPress con su ?v=), no el aspecto concreto.

   Sin dependencias:  node scripts/test_segundo_auxiliar.js */
'use strict';

var fs = require('fs');
var path = require('path');

var RAIZ = path.join(__dirname, '..');
var JS  = fs.readFileSync(path.join(RAIZ, 'registro/resources/js/bitacora-formulario.js'), 'utf8');
var CSS = fs.readFileSync(path.join(RAIZ, 'registro/resources/css/bitacora-formulario.css'), 'utf8');
var SIM = fs.readFileSync(path.join(RAIZ, 'simulador_ocular/ocular-wordpress.html'), 'utf8');

var fallos = 0;
function ok(cond, et) {
  if (cond) { console.log('  ok   ' + et); }
  else { fallos++; console.log('  FALLA ' + et); }
}

console.log('Formulario de observaciones (el hueco nace oculto):');
ok(/class="field e-aux2-wrap" hidden/.test(JS),
   'el campo del segundo auxiliar se pinta con hidden');
ok(/class="e-aux-mas"/.test(JS),
   'hay un botón "+" junto al primer auxiliar');
ok(/\.e-aux-mas'\)\.addEventListener\('click', mostrarAux2\)/.test(JS),
   'el "+" descubre el hueco');
ok(/\.e-aux2-wrap'\)\.hidden = false/.test(JS) && /\.e-aux-mas'\)\.hidden = true/.test(JS),
   'al descubrirlo, el "+" desaparece (ya no hay un tercero que añadir)');
ok(/if \(datos\.auxiliar2_id\) mostrarAux2\(\)/.test(JS),
   'editando una observación que ya traía dos, el hueco se ve de entrada');
ok(/\.e-auxiliar2'\)/.test(JS) && /_aux2Pre/.test(JS),
   'oculto, no ausente: el select sigue ahí para poblarse y guardarse');

console.log('Estilos:');
ok(/#mw-obs-form \.field\[hidden\] \{display:none;\}/.test(CSS),
   'label.field es display:block y gana al [hidden] del navegador: se anula');
ok(/#mw-obs-form \.aux-fila \{[^}]*display:flex/.test(CSS),
   'el select y el "+" van en la misma línea');
ok(/#mw-obs-form \.entry-equipo div\.field > span\.lab \{/.test(CSS),
   'el campo va en <div> (el clic en el botón no debe abrir el select) y su etiqueta lleva estilo propio');

console.log('Simulador de oculares (ahí sigue a la vista):');
ok(/id="sim-aux2-input"/.test(SIM) && !/id="sim-aux2-input"[^>]*hidden/.test(SIM),
   'la segunda auxiliar del simulador no se ha ocultado');

console.log(fallos ? '\n' + fallos + ' fallo(s).' : '\nTodo verde.');
process.exit(fallos ? 1 : 0);
