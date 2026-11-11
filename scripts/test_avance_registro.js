#!/usr/bin/env node
/* Test del cableado de la VISTA PROVISIONAL del Avance de Gaia en el modal
   «Imagen del simulador» del registro (#529, ADR 0033 punto 5).

   El contrato del módulo (render() reenvía alAvance, la provisional llega antes
   que el proxy y la imagen final es idéntica píxel a píxel) lo fija el caso 14
   de scripts/test_vista_gaia.js. Aquí se fija lo que solo vive en el
   formulario y se puede romper sin que nada avise: que «Usar» no se active con
   la provisional, que una petición superada no la pinte, que el aviso del
   campo denso mande y que la hoja de estilo y la versión viajen con el .js.
   Mismo patrón que test_cruceta_modal_registro.js.

   Sin dependencias: node scripts/test_avance_registro.js */
'use strict';

var fs = require('fs');
var path = require('path');

var RAIZ = path.join(__dirname, '..');
var JS   = fs.readFileSync(path.join(RAIZ, 'registro/resources/js/bitacora-formulario.js'), 'utf8');
var CSS  = fs.readFileSync(path.join(RAIZ, 'registro/resources/css/bitacora-formulario.css'), 'utf8');
var HTML = fs.readFileSync(path.join(RAIZ, 'registro/registrar-observacion-wordpress.html'), 'utf8');
var CTX  = fs.readFileSync(path.join(RAIZ, 'simulador_ocular/CONTEXT.md'), 'utf8');

var fallos = 0;
function ok(cond, texto) {
  if (cond) { console.log('  ok   ' + texto); }
  else { fallos++; console.log('  FALLA ' + texto); }
}

// El cuerpo de pintarSim y, dentro, el del callback alAvance.
var pintar = (JS.match(/function pintarSim\(conservar\)\{[\s\S]*?\n  \}\n/) || [''])[0];
var alAvance = (pintar.match(/alAvance:function\(\)\{[\s\S]*?\n      \}/) || [''])[0];

console.log('El modal pinta la provisional (CA 1):');
ok(pintar.length > 0 && alAvance.length > 0, 'pintarSim pasa un alAvance en las opciones del render');
ok(/volcar\(\);/.test(alAvance), 'la provisional se vuelca al círculo del modal');
ok(/spin\.classList\.add\('provisional'\)/.test(alAvance) && /spin\.classList\.remove\('suave'\)/.test(alAvance),
   'el aviso pasa a .provisional (centrado y tenue), no a la franja de .suave');
ok(/'cargando estrellas…'/.test(alAvance), 'con el texto «cargando estrellas…»');

console.log('«Usar» solo con la completa (CA 2):');
ok(!/usar\.disabled\s*=\s*false/.test(alAvance) && !/_simUsar\s*=/.test(alAvance),
   'la provisional no activa «Usar» ni prepara la subida');
ok(/volcar\(\);[\s\S]{0,120}usar\.disabled=false;[\s\S]{0,120}_simUsar=function/.test(pintar),
   '«Usar» se activa solo al resolver la completa');

console.log('Campo denso (CA 4):');
ok(/alPendiente:function\(info\)\{[\s\S]{0,120}pendiente=true;/.test(pintar),
   'alPendiente apunta que el campo denso ya avisó');
ok(/if\(!pendiente\) spin\.textContent='cargando estrellas…'/.test(alAvance),
   'y alAvance no pisa su texto');

console.log('Petición superada (CA 5):');
ok(/^alAvance:function\(\)\{\s*if\(pet!==_simPeticion\) return;/.test(alAvance),
   'alAvance de una petición superada no pinta nada');
ok(/spin\.classList\.remove\('provisional'\);[\s\S]{0,80}if\(!conservar\)/.test(pintar),
   'una petición nueva arranca sin el aviso de provisional');
ok(/\.catch\(function\(\)\{\s*if\(pet!==_simPeticion\) return;[\s\S]{0,200}spin\.classList\.remove\('provisional'\)/.test(pintar),
   'un error vuelve a tapar el campo con el aviso');

console.log('DSS sin provisional (CA 6):');
ok(/BitacoraGaiaRender\.renderPlaca\(off, opciones\)/.test(pintar) && !/alAvance/.test(
     fs.readFileSync(path.join(RAIZ, 'resources/js/bitacora-gaia-render.js'), 'utf8')
       .match(/function renderPlaca\(canvas, o\) \{[\s\S]*?\n  \}\n/)[0]),
   'renderPlaca no conoce alAvance: la placa no tiene provisional');

console.log('Estilo, versión y documentación (CA 8):');
ok(/\.sim-gen-spin\.provisional \{[^}]*background:transparent;[^}]*opacity:\.7/.test(CSS),
   '.sim-gen-spin.provisional: fondo transparente y texto más tenue');
ok(!/\.sim-gen-spin\.provisional \{[^}]*align-items:flex-end/.test(CSS), 'y sigue centrado');
// ?v=AAAAMMDD_HHMM como número; #519 dejó el render en 20261111_1200.
var v = function (f) { var m = HTML.match(new RegExp(f + '\\?v=(\\d+)_(\\d+)')); return m ? +(m[1] + m[2]) : 0; };
ok(v('bitacora-formulario\\.js') > 202611081200 && v('bitacora-formulario\\.css') > 202610031200 &&
   v('bitacora-gaia-render\\.js') > 202611111200,
   '?v= subido en el formulario (js y css) y en el render');
ok(/#529[^\n]*render\(\)[^\n]*alAvance|#529[^\n]*alAvance[^\n]*render\(\)/.test(CTX.split('## Vista de Gaia')[1].split('\n## ')[0]),
   'CONTEXT.md (Vista de Gaia) recoge que render() acepta alAvance (#529)');

console.log(fallos === 0 ? '\nTodo verde.' : '\n' + fallos + ' fallo(s).');
process.exit(fallos === 0 ? 0 : 1);
