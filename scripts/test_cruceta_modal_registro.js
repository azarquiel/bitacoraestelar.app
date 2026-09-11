#!/usr/bin/env node
/* Test de la CRUCETA del modal «Imagen del simulador» del registro (historia
   #268 de la épica #265).

   Lo que se fija aquí es el contrato entre los tres archivos que nadie obliga a
   viajar juntos —el .js del formulario, su hoja de estilo y el fragmento de
   WordPress— más las reglas que se pueden romper sin que nada avise: que el
   render pida el CENTRO DESPLAZADO (y no las coordenadas del objeto), que el
   desplazamiento se cuente contra el campo DIBUJADO (el recortado si es el
   DSS), que el lienzo no se borre a negro al desplazar y que las flechas del
   teclado no se las roben al <select> de la fuente ni al SQM.

   La trigonometría del centro y la redacción del rótulo se prueban aparte,
   contra el módulo compartido (test_centro_desplazado.js y
   test_rotulo_desplazamiento.js).

   Sin dependencias: node scripts/test_cruceta_modal_registro.js */
'use strict';

var fs = require('fs');
var path = require('path');

var RAIZ = path.join(__dirname, '..');
var JS   = fs.readFileSync(path.join(RAIZ, 'registro/resources/js/bitacora-formulario.js'), 'utf8');
var CSS  = fs.readFileSync(path.join(RAIZ, 'registro/resources/css/bitacora-formulario.css'), 'utf8');
var HTML = fs.readFileSync(path.join(RAIZ, 'registro/registrar-observacion-wordpress.html'), 'utf8');

var fallos = 0;
function ok(cond, texto) {
  if (cond) { console.log('  ok   ' + texto); }
  else { fallos++; console.log('  FALLA ' + texto); }
}

console.log('La cruceta existe en el modal, y es alcanzable:');
ok(/class="sim-gen-cruceta"[^>]*role="group"[^>]*aria-label="Desplazar el campo"/.test(JS),
   'la cruceta es un grupo con nombre');
['norte', 'sur', 'este', 'oeste'].forEach(function (rumbo) {
  ok(new RegExp('aria-label="desplazar al ' + rumbo + '"').test(JS),
     'botón de ' + rumbo + ' con su aria-label');
});
ok(/aria-label="recentrar en el objeto"/.test(JS), 'el hueco central de la cruz recentra');
ok(/data-x="1"[^>]*aria-label="desplazar al este"/.test(JS) &&
   /data-x="-1"[^>]*aria-label="desplazar al oeste"/.test(JS),
   'el Este suma RA y el Oeste la resta');
ok(!/class="paso[^"]*"[^>]*disabled/.test(JS),
   'ningún botón nace deshabilitado: encadenar clics es el uso real');
ok(/<canvas class="sim-gen-canvas"[^>]*tabindex="0"/.test(JS),
   'el lienzo es alcanzable por teclado');

console.log('Estilos (WCAG 2.2: tamaño del objetivo y foco visible):');
ok(/\.sim-gen-cruceta \{[^}]*grid-template-columns:repeat\(3, 44px\)/.test(CSS),
   'cada botón mide 44 px (mínimo 24×24, táctil 44)');
ok(/\.sim-gen-cruceta \{[^}]*gap:8px/.test(CSS), '8 px de separación entre botones');
ok(/\.sim-gen-cruceta \.paso:focus-visible \{[^}]*outline:2px solid/.test(CSS),
   'el anillo de foco no se quita');
ok(/\.sim-gen-cruceta \.paso-e \{grid-area:2 \/ 1;\}/.test(CSS),
   'el Este va a la IZQUIERDA, como en el cielo');
ok(/\.sim-gen-cruceta \.paso \{[^}]*color:var\(--ambar/.test(CSS),
   'botones en ámbar, no en blanco puro: se mira de noche');

console.log('Comportamiento (bitacora-formulario.js):');
ok(/var SIM_PASO_TOPE = 20;/.test(JS), 'tope de ±2 campos por eje = 20 pasos');
ok(/Math\.max\(-SIM_PASO_TOPE, Math\.min\(SIM_PASO_TOPE, _simPasoX\+dx\)\)/.test(JS) &&
   /if\(nx===_simPasoX && ny===_simPasoY\) return;/.test(JS),
   'en el tope no se mueve ni se lanza consulta');
ok(/_simPasoX=nx; _simPasoY=ny;/.test(JS), 'los pasos se acumulan (tres clics = 30 %)');
ok(/function recentrarSim\(\)\{[\s\S]{0,200}_simPasoX=_simPasoY=0;/.test(JS),
   'recentrar vuelve al centro del objeto');
ok(/_simEntrada=\{ el:el, d:d \};[\s\S]{0,200}_simPasoX=_simPasoY=0;/.test(JS),
   'abrir el modal deshace el desplazamiento de la imagen anterior');
ok(!/transitionend/.test(JS),
   'el estado se fija al pulsar, nunca dentro de un transitionend');

console.log('El render pide el centro desplazado, contra el campo dibujado:');
ok(/BitacoraGaiaRender\.centroDesplazado\(\{[\s\S]{0,160}pasoX:_simPasoX, pasoY:_simPasoY/.test(JS),
   'el centro sale del módulo compartido, no de una copia de la trigonometría');
ok(/var centro=BitacoraGaiaRender\.centroDesplazado\(\{[\s\S]{0,80}arcmin:arcmin,/.test(JS),
   'el paso es el 10 % del campo DIBUJADO (arcmin, recortado si es el DSS), no el del ocular');
ok(/ra:centro\.ra, dec:centro\.dec, arcmin:arcmin,/.test(JS),
   'el render (Gaia o placa) recibe el centro desplazado');
ok(!/ra:d\.ra, dec:d\.dec, arcmin:arcmin, apertura/.test(JS),
   'ya no se pinta desde las coordenadas del objeto');
ok(/var pet=\+\+_simPeticion;/.test(JS) && /if\(pet!==_simPeticion\) return;/.test(JS),
   'repinta por el mismo camino que la fuente y el SQM: _simPeticion descarta lo viejo');
ok(/usar\.disabled=true;/.test(JS),
   '«Usar esta imagen» queda deshabilitado hasta que termina el repintado');

console.log('El desplazamiento se dice en la línea de información:');
ok(/BitacoraGaiaRender\.rotuloDesplazamiento\(\{[\s\S]{0,120}arcmin:arcmin[\s\S]{0,20}\}\)/.test(JS),
   'el rótulo lo redacta el módulo compartido, con el campo dibujado');
ok(/\(rotDespl \? ' · '\+rotDespl : ''\)/.test(JS),
   'va junto a aumentos, campo y SQM, y sin desplazamiento no deja hueco');

console.log('Repintado sin negro:');
ok(/ctx\.globalCompositeOperation='copy';[\s\S]{0,120}ctx\.drawImage\(canvas, Math\.round\(0\.10\*D\*dx\)/.test(JS),
   'el lienzo se desplaza con su propio contenido (drawImage de sí mismo)');
ok(/if\(!conservar\)\{ ctx\.fillStyle='#000'; ctx\.fillRect\(0,0,900,900\); \}/.test(JS),
   'al desplazar NO se repinta el fondo negro encima de lo deslizado');
ok(/pintarSim\(true\);/.test(JS), 'el repintado del desplazamiento conserva la vista');
ok(/spin\.classList\.toggle\('suave', !!conservar\)/.test(JS) &&
   /\.sim-gen-spin\.suave \{/.test(CSS),
   'el aviso de carga no tapa el campo mientras se desplaza');

console.log('Teclado sin choques:');
ok(/ArrowUp:\[0,1\], ArrowDown:\[0,-1\], ArrowLeft:\[1,0\], ArrowRight:\[-1,0\]/.test(JS),
   'las flechas desplazan, y la izquierda va al Este como el botón');
ok(/if\(ev\.key==='Home'\)\{ ev\.preventDefault\(\); recentrarSim\(\); return; \}/.test(JS),
   'Home recentra');
ok(/ov\.querySelector\('\.sim-gen-canvas'\)\.addEventListener\('keydown', teclado\)/.test(JS) &&
   /cruceta\.addEventListener\('keydown', teclado\)/.test(JS) &&
   !/ov\.addEventListener\('keydown'/.test(JS),
   'escucha en el lienzo y en la cruceta, no en todo el modal (ahí están el ' +
   '<select> de la fuente y el <input number> del SQM, que ya usan las flechas)');

console.log('La imagen que se sube es la que se ve (sin esquema nuevo):');
ok(/canvas\.toBlob\(function\(b\)\{/.test(JS) &&
   !/pasoX|pasoY|desplaz/i.test(JS.slice(JS.indexOf('function usarImagenGenerada'),
                                          JS.indexOf('function usarImagenGenerada') + 800)),
   'el desplazamiento va horneado en el píxel: no viaja como dato aparte');

console.log('Despliegue (CLAUDE.md: subir el ?v= de lo que cambia):');
['bitacora-formulario.js', 'bitacora-formulario.css', 'bitacora-gaia-render.js'].forEach(function (f) {
  var m = HTML.match(new RegExp(f.replace(/\./g, '\\.') + '\\?v=(\\d{8})'));
  ok(!!m && m[1] >= '20260912', f + ' con ?v= al día');
});

if (fallos) { console.log('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nTodo verde.');
