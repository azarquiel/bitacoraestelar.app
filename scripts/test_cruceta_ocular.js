#!/usr/bin/env node
/* Test de la CRUCETA que desplaza el campo en el simulador de oculares
   (historia #267 de la épica #265).

   Lo que se fija es el contrato entre los tres archivos que nadie obliga a
   viajar juntos —el fragmento de WordPress, la hoja de estilo y el .js— más las
   reglas que se pueden romper sin que nada avise: que las TRES fuentes (Gaia,
   DSS y HiPS) pidan el mismo centro desplazado, que los clics encadenados salgan
   como una sola consulta, y que el desplazamiento no borre el lienzo a negro.

   La trigonometría del centro y el rótulo se prueban aparte, contra el módulo
   compartido (test_centro_desplazado.js y test_rotulo_desplazamiento.js).

   Sin dependencias:  node scripts/test_cruceta_ocular.js */
'use strict';

var fs = require('fs');
var path = require('path');

var RAIZ = path.join(__dirname, '..');
var JS   = fs.readFileSync(path.join(RAIZ, 'simulador_ocular/resources/js/bitacora-ocular.js'), 'utf8');
var CSS  = fs.readFileSync(path.join(RAIZ, 'simulador_ocular/resources/css/bitacora-ocular.css'), 'utf8');
var HTML = fs.readFileSync(path.join(RAIZ, 'simulador_ocular/ocular-wordpress.html'), 'utf8');

var fallos = 0;
function ok(cond, et) {
  if (cond) { console.log('  ok   ' + et); }
  else { fallos++; console.log('  FALLA ' + et); }
}

console.log('La cruceta en la página:');
ok(/id="sim-cruceta"[^>]*role="group"[^>]*aria-label=/.test(HTML),
   'es un grupo con nombre accesible');
['norte', 'sur', 'este', 'oeste'].forEach(function (rumbo) {
  ok(new RegExp('aria-label="desplazar al ' + rumbo + '"').test(HTML),
     'botón de ' + rumbo + ' con su aria-label');
});
ok(/aria-label="recentrar en el objeto"/.test(HTML),
   'el hueco central de la cruz recentra');
ok(/data-x="1" data-y="0" aria-label="desplazar al este"/.test(HTML) &&
   /data-x="-1" data-y="0" aria-label="desplazar al oeste"/.test(HTML),
   'el Este suma RA y el Oeste la resta');
ok(!/<button[^>]*class="paso[^>]*disabled/.test(HTML),
   'ningún botón nace deshabilitado: encadenar clics es el uso real');
ok(/id="sim-desplazado"[^>]*role="status"/.test(HTML),
   'el rótulo del desplazamiento se anuncia solo al cambiar');
ok(/id="sim-lienzo" tabindex="0"/.test(HTML),
   'el lienzo es alcanzable por teclado');

console.log('Estilos (WCAG 2.2: tamaño del objetivo y foco visible):');
ok(/#mw-obs-form \.cruceta \{[^}]*grid-template-columns:repeat\(3, 44px\)/.test(CSS),
   'cada botón mide 44 px (mínimo 24×24, táctil 44)');
ok(/#mw-obs-form \.cruceta \{[^}]*gap:8px/.test(CSS),
   '8 px de separación entre botones');
ok(/#mw-obs-form \.cruceta \.paso:focus-visible \{[\s\S]*?outline:2px solid var\(--ambar\)/.test(CSS) ||
   /#mw-obs-form \.cruceta \.paso:focus-visible \{/.test(CSS.replace(/\n/g, '')),
   'el anillo de foco no se quita');
ok(/#mw-obs-form \.cruceta \.paso-e \{grid-area:2 \/ 1;\}/.test(CSS),
   'el Este va a la IZQUIERDA, como en el cielo');
ok(/#mw-obs-form \.desplazamiento \{[^}]*color:var\(--ambar\)/.test(CSS),
   'rótulo en ámbar, no en blanco puro: se mira de noche');

console.log('Comportamiento (bitacora-ocular.js):');
ok(/var PASO_TOPE = 20;/.test(JS),
   'tope de ±2 campos por eje = 20 pasos');
ok(/Math\.max\(-PASO_TOPE, Math\.min\(PASO_TOPE, pasoX \+ dx\)\)/.test(JS) &&
   /if \(nx === pasoX && ny === pasoY\) return;/.test(JS),
   'en el tope no se mueve ni se lanza consulta');
ok(/var ANTIRREBOTE = 250;/.test(JS) &&
   /clearTimeout\(pendienteDespl\);[\s\S]{0,80}setTimeout\(actualizar, ANTIRREBOTE\)/.test(JS),
   'los clics encadenados salen como UNA consulta (antirrebote de 250 ms)');
ok(/pasoX = nx; pasoY = ny;/.test(JS),
   'los pasos se acumulan (tres clics = 30 %)');
ok(!/transitionend/.test(JS),
   'el estado se fija al pulsar, nunca dentro de un transitionend');
ok(/function recentrar\(\) \{[\s\S]*?pasoX = pasoY = 0;/.test(JS),
   'recentrar vuelve al centro del objeto');
ok(/objetoSel = o;[\s\S]{0,120}pasoX = pasoY = 0;/.test(JS),
   'cambiar de objeto deshace el desplazamiento del anterior');

console.log('Las tres fuentes consultan el centro nuevo:');
ok(/var centro = centroVista\(arcmin\);/.test(JS),
   'actualizar() calcula UN centro para el render');
ok(/renderGaia2D\(arcmin, peticion, centro, conservar\)/.test(JS),
   'Canvas-2D (Gaia) recibe el centro');
ok(/urlHips\(centro\.ra, centro\.dec, arcmin\)/.test(JS),
   'HiPS recibe el centro');
ok(/renderDSS\(arcmin, peticion, centro\)/.test(JS),
   'DSS recibe el centro');
ok(/var ra0 = centro\.ra, dec0 = centro\.dec;/.test(JS),
   'la vista de Gaia ya no parte de las coordenadas del objeto');
ok(/var centro = centroVista\(arcmin\); var ra0 = centro\.ra;/.test(JS),
   'la superposición de Gaia sobre las placas sigue al mismo centro');
ok(/'&ra=' \+ ra\.toFixed\(5\)/.test(JS),
   'urlHips toma grados: el centro desplazado no es sexagesimal');
ok(!/function renderDSS\(arcmin, peticion, fuente\)/.test(JS) &&
   /function renderDSS\(arcmin, peticion, centro, fuente\)/.test(JS),
   'renderDSS ya no lee objetoSel para el centro');

console.log('Repintado sin negro y estado de carga:');
ok(/ctx\.globalCompositeOperation = 'copy';[\s\S]{0,80}ctx\.drawImage\(canvas, px, py\)/.test(JS),
   'el lienzo se desplaza con su propio contenido (drawImage de sí mismo)');
ok(/0\.10 \* canvas\.width \* dx/.test(JS),
   'el deslizamiento es del 10 % del lado por paso');
ok(/if \(!conservar \|\| canvas\.width !== PROC\) canvas\.width = canvas\.height = PROC;/.test(JS),
   'no se refija canvas.width al desplazar: eso borraría el campo');
ok(/if \(!conservar\) \{ ctx\.fillStyle = colorFondo; ctx\.fillRect/.test(JS),
   'ni se repinta el fondo encima de lo deslizado');
ok(/cargando\.classList\.toggle\('suave', conservar\)/.test(JS) &&
   /#mw-obs-form \.vista \.cargando\.suave \{/.test(CSS),
   'el aviso de carga no tapa el círculo mientras se desplaza');
ok(/\$\('sim-vista'\)\.setAttribute\('aria-busy', 'true'\)/.test(JS) &&
   /\$\('sim-vista'\)\.setAttribute\('aria-busy', 'false'\)/.test(JS),
   'aria-busy en el contenedor del lienzo mientras hay consulta en vuelo');

console.log('Teclado:');
ok(/ArrowUp: \[0, 1\], ArrowDown: \[0, -1\], ArrowLeft: \[1, 0\], ArrowRight: \[-1, 0\]/.test(JS),
   'las flechas desplazan, y la izquierda va al Este como el botón');
ok(/if \(ev\.key === 'Home'\) \{ ev\.preventDefault\(\); recentrar\(\); return; \}/.test(JS),
   'Home recentra');

console.log('Despliegue (CLAUDE.md: subir el ?v= de lo que cambia):');
['bitacora-ocular.js', 'bitacora-ocular.css', 'bitacora-gaia-render.js'].forEach(function (f) {
  var m = HTML.match(new RegExp(f.replace('.', '\\.') + '\\?v=(\\d{8})'));
  ok(!!m && m[1] >= '20260912', f + ' con ?v= al día');
});

if (fallos) { console.log('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nTodo verde.');
