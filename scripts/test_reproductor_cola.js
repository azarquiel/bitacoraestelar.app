/* Comprueba que pulsar una fila de la lista suene la pista de esa fila
   aunque la cola del reproductor aún no haya cambiado de álbum:
   loadPlaylist() es asíncrono y getPlaylist() sigue devolviendo la cola
   anterior un rato, así que un playVideoAt(i) a pelo suena la pista que
   ocupa esa posición en el álbum de antes.
   Uso: node scripts/test_reproductor_cola.js */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(
  path.join(__dirname, '..', 'resources', 'reproductor.html'), 'utf8');

function saca(nombre) {
  const m = html.match(new RegExp(`\\nfunction ${nombre}\\([\\s\\S]*?\\n}\\n`));
  assert.ok(m, `no se encuentra ${nombre}() en reproductor.html`);
  return m[0];
}

const TODOS = '*';
const LISTA = 'PLXj65nwjQ0QE';
const ENTERA = ['a1', 'b1', 'b2', 'b3', 'c1'];   // cola de "Toda la lista"
const SUELTAS = ['a1', 'c1'];                    // las de un álbum de una sola pista

/* Reproductor de mentira: la cola nueva no entra hasta llamar a asienta(),
   que es lo que hace el de verdad cuando termina de pedirla a YouTube. */
function Falso(cola) {
  this.cola = cola.slice();
  this.sonando = null;
  this.historial = [];
  this.pendiente = null;
}
Falso.prototype.suena = function (id) { this.sonando = id; this.historial.push(id); };
Falso.prototype.getPlaylist = function () { return this.cola; };
Falso.prototype.playVideoAt = function (i) { this.suena(this.cola[i]); };
Falso.prototype.loadPlaylist = function (a, i) {
  const cola = Array.isArray(a) ? a.slice() : ENTERA.slice();
  const desde = Array.isArray(a) ? (i || 0) : (a.index || 0);
  this.pendiente = () => { this.cola = cola; this.suena(cola[desde]); };
};
Falso.prototype.asienta = function () {
  if (this.pendiente) { this.pendiente(); this.pendiente = null; }
};

const reproductor = new Falso(ENTERA);
let enCola = ENTERA.slice();
const selAlbum = {value: TODOS};
const idsDelAlbum = () => SUELTAS.slice();

// eslint-disable-next-line no-eval
eval(saca('cargarCola') + saca('reproducirEnCola'));

// Se cambia a "Sueltas": la lista ya enseña las sueltas, la cola aún no.
selAlbum.value = 'Sueltas';
cargarCola(0);
enCola = SUELTAS.slice();
assert.deepStrictEqual(reproductor.getPlaylist(), ENTERA,
  'el repro no vale: la cola no debería haber cambiado todavía');

// Clic en la segunda fila de "Sueltas" antes de que la cola asiente.
reproducirEnCola(1);
assert.ok(reproductor.historial.indexOf(ENTERA[1]) === -1,
  'suena la pista de esa posición en "Toda la lista", no la pulsada');
reproductor.asienta();
assert.strictEqual(reproductor.sonando, SUELTAS[1], 'no acaba sonando la fila pulsada');

// Con la cola ya asentada, el índice vale y no hace falta recargar nada.
const antes = reproductor.getPlaylist();
reproducirEnCola(0);
assert.strictEqual(reproductor.sonando, SUELTAS[0], 'no suena la fila pulsada');
assert.strictEqual(reproductor.pendiente, null,
  'con la cola buena no debería recargarse la lista');
assert.deepStrictEqual(reproductor.getPlaylist(), antes, 'la cola no debía tocarse');

console.log('ok · la fila pulsada suena aunque la cola aún no haya cambiado');
