#!/usr/bin/env node
/* Test de la MARCA DE BORDE: dónde quedó el objeto al desplazar el campo
   (historia #269 de la épica #265).

   La regla vive en el módulo compartido (`marcaBorde` en
   resources/js/bitacora-gaia-render.js) porque la marca la pintan las dos
   páginas: el simulador y el modal «Imagen del simulador» del registro.

   El objeto sale del campo cuando su separación al centro pasa del RADIO, y el
   radio son 5 pasos (cada paso es el 10 % del campo, el campo es el diámetro).
   La marca apunta en coordenadas de PANTALLA: el Este cae a la izquierda y el
   Norte arriba, así que un campo movido al este deja el objeto a la DERECHA y
   uno movido al norte lo deja ABAJO.

   Sin dependencias:  node scripts/test_marca_borde.js */
'use strict';

var fs = require('fs');
var path = require('path');

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

var RAIZ = path.join(__dirname, '..');
var JS_SIM  = fs.readFileSync(path.join(RAIZ, 'simulador_ocular/resources/js/bitacora-ocular.js'), 'utf8');
var CSS_SIM = fs.readFileSync(path.join(RAIZ, 'simulador_ocular/resources/css/bitacora-ocular.css'), 'utf8');
var HTML_SIM = fs.readFileSync(path.join(RAIZ, 'simulador_ocular/ocular-wordpress.html'), 'utf8');
var JS_REG  = fs.readFileSync(path.join(RAIZ, 'registro/resources/js/bitacora-formulario.js'), 'utf8');
var CSS_REG = fs.readFileSync(path.join(RAIZ, 'registro/resources/css/bitacora-formulario.css'), 'utf8');

var fallos = 0;
function ok(cond, et) {
  if (cond) { console.log('  ok   ' + et); }
  else { fallos++; console.log('  FALLA ' + et); }
}
function casi(a, b, tol, et) {
  if (Math.abs(a - b) <= tol) { console.log('  ok   ' + et + ' = ' + a); }
  else { fallos++; console.log('  FALLA ' + et + '\n         esperado ' + b + ' ±' + tol + '\n         obtenido ' + a); }
}
function marca(x, y, arcmin) { return R.marcaBorde({ pasoX: x, pasoY: y, arcmin: arcmin || 60 }); }

console.log('1) Dentro del campo no hay marca (CA 2 y CA 4):');
ok(marca(0, 0) === null, 'sin desplazamiento, nada cambia');
ok(marca(4, 0) === null, 'cuatro pasos: el objeto sigue dentro');
ok(marca(5, 0) === null, 'cinco pasos: justo en el borde, todavía se ve');
ok(marca(3, 4) === null, 'la diagonal cuenta por la distancia, no por eje (3-4-5)');
ok(R.marcaBorde({ pasoX: -20, pasoY: 0, arcmin: 0 }) === null,
   'sin campo dibujado no hay separación que contar');

console.log('2) Fuera del campo sí (CA 1):');
ok(marca(6, 0) !== null, 'seis pasos: el objeto ya no está en el campo');
ok(marca(4, 4) !== null, 'y la diagonal de cuatro pasos por eje también (5,66)');

console.log('3) La punta apunta al objeto, en pantalla:');
casi(marca(6, 0).angulo, 0, 1e-9, 'campo al Este (izquierda): el objeto queda a la derecha');
casi(marca(-6, 0).angulo, 180, 1e-9, 'campo al Oeste: el objeto queda a la izquierda');
casi(marca(0, 6).angulo, 90, 1e-9, 'campo al Norte: el objeto queda abajo (90° = hacia abajo)');
casi(marca(0, -6).angulo, -90, 1e-9, 'campo al Sur: el objeto queda arriba');
casi(marca(6, 6).angulo, 45, 1e-9, 'nordeste del campo: abajo a la derecha');

console.log('4) La separación al centro (CA 1 y CA 3: hay texto, no solo color):');
// Campo de 1°: un paso son 0,1°, así que 6 pasos son 0,6° = 36′.
casi(marca(6, 0, 60).grados, 0.6, 1e-12, 'seis pasos de un campo de 1° son 0,6°');
ok(marca(6, 0, 60).texto === '36′', 'por debajo del grado se dice en minutos: ' + marca(6, 0, 60).texto);
ok(marca(20, 0, 60).texto === '2,0°', 'y por encima, en grados con coma: ' + marca(20, 0, 60).texto);
ok(R.marcaBorde({ pasoX: 6, pasoY: 0, arcmin: 99.6 }).texto === '1,0°',
   'y 0,996° se redondean a 1,0°, no a los 60′ que nadie escribe');
casi(marca(20, 20, 60).grados, Math.hypot(2, 2), 1e-12, 'la separación es la distancia, no la suma de ejes');

console.log('5) Dónde cabe la marca (`radioMarca`):');
// Círculo de 400 px y una marca de 60x22: la diagonal media son 32, +4 de aire.
var r = R.radioMarca({ ancho: 60, alto: 22, circulo: 400 });
casi(r, 50 - 100 * (Math.sqrt(60 * 60 + 22 * 22) / 2 + 4) / 400, 1e-12,
     'va tan al borde como quepa entera, medida por la diagonal');
ok(r * 4 + Math.sqrt(60 * 60 + 22 * 22) / 2 <= 200, 'y la esquina no se sale del círculo');
ok(R.radioMarca({ ancho: 60, alto: 22, circulo: 60 }) === 0,
   'en un círculo más pequeño que la marca se queda en el centro, no en negativo');
ok(R.radioMarca({ ancho: 60, alto: 22, circulo: 0 }) === 0, 'sin círculo no hay radio');
// El modal posiciona sobre el lienzo entero, con el campo dibujado dentro.
casi(R.radioMarca({ ancho: 60, alto: 22, circulo: 200, caja: 400 }),
     25 - 100 * (Math.sqrt(60 * 60 + 22 * 22) / 2 + 4) / 400, 1e-12,
     'con caja mayor que el círculo, el % se cuenta contra la caja');

console.log('6) La marca en el simulador:');
ok(/id="sim-marca"/.test(HTML_SIM), 'el simulador tiene su nodo de marca');
ok(/id="sim-marca"[^>]*\shidden/.test(HTML_SIM), 'y nace oculta: sin desplazamiento nada cambia (CA 4)');
ok(/<div class="vista" id="sim-vista">[\s\S]*?id="sim-marca"[\s\S]*?<\/div>\s*<\/div>/.test(HTML_SIM),
   'va DENTRO del círculo, que es quien tiene el borde');
ok(/function pintarRotuloDespl[\s\S]{0,1400}marcaBorde\(/.test(JS_SIM),
   'se repinta donde ya se repinta el rótulo: un solo sitio que sepa del encuadre');
ok(/#mw-obs-form \.marca-fuera \{[^}]*position:absolute/.test(CSS_SIM), 'se posiciona sobre el círculo');
ok(/#mw-obs-form \.marca-fuera\[hidden\][^{]*\{display:none;\}/.test(CSS_SIM),
   'el [hidden] gana al display de la clase');
ok(/#mw-obs-form \.marca-fuera \{[^}]*pointer-events:none/.test(CSS_SIM),
   'no se come los clics del lienzo');

console.log('7) La misma marca en el modal del registro:');
ok(/class="sim-gen-marca"/.test(JS_REG), 'el modal tiene su nodo de marca');
ok(/sim-gen-vista[\s\S]{0,400}sim-gen-marca/.test(JS_REG), 'dentro de la vista, no fuera');
ok(/function pintarInfoSim[\s\S]{0,1500}pintarMarcaSim\(/.test(JS_REG) &&
   /function pintarMarcaSim[\s\S]{0,400}marcaBorde\(/.test(JS_REG),
   'se repinta con la línea de información, en el acto (no tras el antirrebote)');
ok(/\.sim-gen-marca \{[^}]*position:absolute/.test(CSS_REG), 'posicionada sobre la vista');
ok(/\.sim-gen-marca\[hidden\][^{]*\{display:none;\}/.test(CSS_REG), 'y oculta mientras el objeto se vea');

console.log('8) La marca no se sube con la imagen:');
var usar = JS_REG.slice(JS_REG.indexOf('function usarImagenGenerada'), JS_REG.indexOf('// ── Una fila de imagen'));
ok(!/marca/i.test(usar), 'la marca es DOM, no píxel: lo que se sube es el cielo, no el indicador');

console.log('9) Contraste y forma (CA 3: no se apoya solo en el color):');
ok(/#mw-obs-form \.marca-fuera \{[^}]*color:var\(--ambar/.test(CSS_SIM) &&
   /#mw-obs-form \.marca-fuera \{[^}]*background:rgba\(0,0,0/.test(CSS_SIM),
   'ámbar sobre negro, el color del ojo adaptado, con fondo propio para el contraste');
ok(/class="punta"/.test(HTML_SIM) && /class="sep"/.test(HTML_SIM),
   'lleva forma (la punta que apunta) Y texto (la separación)');
ok(/punta[\s\S]{0,200}aria-hidden="true"/.test(HTML_SIM), 'la punta es decorativa para quien escucha');
ok(/id="sim-marca"[^>]*role="img"[^>]*aria-label=/.test(HTML_SIM) &&
   /class="sim-gen-marca" role="img" aria-label=/.test(JS_REG),
   'y la marca entera se anuncia con su frase: un div a secas no la diría');
ok(/setAttribute\('aria-label', 'El objeto quedó fuera del campo/.test(JS_SIM) &&
   /setAttribute\('aria-label', 'El objeto quedó fuera del campo/.test(JS_REG),
   'la frase se actualiza con la separación');
ok(!/marca\.title\s*=/.test(JS_SIM) && !/marca\.title=/.test(JS_REG),
   'nada de title: con pointer-events:none no hay quien lo vea');

console.log('10) Despliegue (CLAUDE.md: subir el ?v= de lo que cambia):');
var HTML_REG = fs.readFileSync(path.join(RAIZ, 'registro/registrar-observacion-wordpress.html'), 'utf8');
[[HTML_SIM, 'bitacora-ocular.js'], [HTML_SIM, 'bitacora-ocular.css'], [HTML_SIM, 'bitacora-gaia-render.js'],
 [HTML_REG, 'bitacora-formulario.js'], [HTML_REG, 'bitacora-formulario.css'], [HTML_REG, 'bitacora-gaia-render.js']
].forEach(function (par) {
  var m = par[0].match(new RegExp(par[1].replace('.', '\\.') + '\\?v=(\\d{8})'));
  ok(!!m && m[1] >= '20260912', par[1] + ' con ?v= al día');
});

if (fallos) { console.log('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nTodo verde.');
