#!/usr/bin/env node
/* Test del GLOBO DE DATOS de la gráfica de salud
   (registro/resources/js/bitacora-bases.js + registro/mis-bases-wordpress.html).

   La gráfica no tiene números en el eje vertical —cada serie va con su propia
   escala—, así que el valor de cada noche solo se puede leer pasando el ratón
   por su punto. Antes eso era un <title> de SVG: el globo del navegador, que
   tarda un segundo en salir. Ahora es un globo propio, inmediato.

   Son dos archivos que nadie obliga a viajar juntos: el .js va por FTP y el
   fragmento se pega en el editor de WordPress. Sin el CSS, el globo se pinta
   en la esquina de la página en vez de sobre el punto; sin los data-*, el JS
   no encuentra qué decir. Así que se cruzan los dos.

   Sin dependencias:  node scripts/test_salud_globo.js */
'use strict';

var fs = require('fs');
var path = require('path');

var RAIZ = path.join(__dirname, '..');
var js = fs.readFileSync(path.join(RAIZ, 'registro/resources/js/bitacora-bases.js'), 'utf8');
var html = fs.readFileSync(path.join(RAIZ, 'registro/mis-bases-wordpress.html'), 'utf8');

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function seccion(t) { console.log('\n' + t); }

seccion('Cada punto lleva encima lo que va a decir');
['data-cuando', 'data-medida', 'data-valor', 'data-quien'].forEach(function (attr) {
  ok(js.indexOf("' " + attr + '="') >= 0, 'el círculo lleva ' + attr);
});
ok(/stroke-width="12"/.test(js), 'aro transparente: la diana es mayor que el punto');

seccion('Nada del globo se interpreta como HTML');
// (El <title> de la medalla delta sigue donde estaba: ahí es la etiqueta del
// icono, no un globo de datos.)
ok(js.indexOf('</title></circle>') < 0, 'los puntos ya no llevan <title>: el globo nativo no compite con el propio');
ok(/d\.textContent = texto/.test(js), 'el texto entra por textContent, no por innerHTML');

seccion('El globo se monta al pintar la gráfica');
ok(/function montarGlobo\(\)/.test(js), 'existe montarGlobo()');
ok(/montarInterruptores\(\);\s*\n\s*montarGlobo\(\);/.test(js), 'se llama después de pintar');
ok(/addEventListener\('mouseover'/.test(js) && /addEventListener\('mouseout'/.test(js),
   'entra y sale con el ratón');
ok(/closest\('circle\[data-cuando\]'\)/.test(js), 'delegado: un solo par de escuchas para todos los puntos');

seccion('El fragmento trae el estilo que lo coloca');
ok(/\.salud-graf \{[^}]*position:relative/.test(html.replace(/\n\s*/g, '')),
   '.salud-graf es el marco de referencia del globo');
ok(/\.salud-tip \{[^}]*position:absolute/.test(html.replace(/\n\s*/g, '')), '.salud-tip va posicionado');
ok(/\.salud-tip \{[^}]*pointer-events:none/.test(html.replace(/\n\s*/g, '')),
   'el globo no se come el ratón (si no, parpadearía al taparse)');
ok(/\.salud-tip\[hidden\] \{display:none/.test(html.replace(/\n\s*/g, '')),
   'oculto de verdad: [hidden] no basta con position:absolute');
['salud-tip-cuando', 'salud-tip-valor'].forEach(function (c) {
  ok(html.indexOf('.' + c + ' {') >= 0 && js.indexOf("'" + c + "'") >= 0,
     c + ' existe en el fragmento y lo usa el .js');
});

console.log('');
if (fallos) { console.error(fallos + ' comprobación(es) fallan.'); process.exit(1); }
console.log('Todo correcto.');
