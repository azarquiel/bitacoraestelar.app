#!/usr/bin/env node
/*
  Test: un elemento con el atributo `hidden` tiene que estar escondido de verdad.

  El navegador esconde `[hidden]` con una regla de hoja de usuario-agente que
  cualquier regla de clase gana por especificidad: `#mw-obs-form .actions
  {display:flex}` dejaba la caja de la distancia SIEMPRE a la vista, y al pulsar
  «Situar en el mapa» sin objeto pendiente el servidor respondía «Falta el
  identificador del objeto».

  El test recorre las páginas, mira qué elementos nacen con `hidden`, y falla si
  alguna regla les fija un `display` distinto de `none` sin que otra regla con
  `[hidden]` lo neutralice.

  Uso:  node scripts/test_hidden_css.js
*/
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const CSS_COMPARTIDO = [
  'resources/css/bitacora-base.css',
  'registro/resources/css/bitacora-formulario.css',
];

/** Devuelve las reglas {selector, declaraciones} de un texto CSS. */
function reglas(css) {
  const limpio = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const salida = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(limpio))) {
    const decl = m[2];
    m[1].split(',').forEach(function (sel) {
      sel = sel.trim();
      if (sel && !sel.startsWith('@')) salida.push({ sel: sel, decl: decl });
    });
  }
  return salida;
}

/** ¿El selector apunta a este elemento (por id o por alguna de sus clases)? */
function apunta(sel, el) {
  if (el.id && new RegExp('#' + el.id + '(?![\\w-])').test(sel)) return true;
  return el.clases.some(function (c) {
    return new RegExp('\\.' + c + '(?![\\w-])').test(sel);
  });
}

function displayDe(decl) {
  const m = /(?:^|[;{\s])display\s*:\s*([^;!]+)/i.exec(decl);
  return m ? m[1].trim().toLowerCase() : null;
}

/** Elementos con el atributo `hidden` de una página, con su id y sus clases. */
function elementosOcultos(html) {
  const salida = [];
  const re = /<(\w+)((?:\s+[^<>]*?)?)\shidden(?=[\s/>])([^<>]*)>/g;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[2] + m[3];
    const id = (/\sid\s*=\s*["']([^"']+)["']/.exec(attrs) || [])[1] || '';
    const cls = (/\sclass\s*=\s*["']([^"']+)["']/.exec(attrs) || [])[1] || '';
    salida.push({ etiqueta: m[1], id: id, clases: cls.split(/\s+/).filter(Boolean) });
  }
  return salida;
}

const cssBase = CSS_COMPARTIDO.map(function (f) {
  return fs.readFileSync(path.join(RAIZ, f), 'utf8');
}).join('\n');

const paginas = fs.readdirSync(path.join(RAIZ, 'registro'))
  .filter(function (f) { return f.endsWith('.html'); });

const fallos = [];
paginas.forEach(function (pagina) {
  const html = fs.readFileSync(path.join(RAIZ, 'registro', pagina), 'utf8');
  const propio = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || []).join('\n');
  const todas = reglas(cssBase + '\n' + propio);

  elementosOcultos(html).forEach(function (el) {
    const visibles = todas.filter(function (r) {
      const d = displayDe(r.decl);
      return d && d !== 'none' && !r.sel.includes('[hidden]') && apunta(r.sel, el);
    });
    if (!visibles.length) return;
    const neutraliza = todas.some(function (r) {
      return r.sel.includes('[hidden]') && displayDe(r.decl) === 'none' &&
        (apunta(r.sel, el) || /(^|\s)\*?\[hidden\]$/.test(r.sel));
    });
    if (!neutraliza) {
      fallos.push(pagina + ': <' + el.etiqueta + (el.id ? ' id="' + el.id + '"' : '') +
        '> nace con hidden pero «' + visibles[0].sel + '» le pone display:' +
        displayDe(visibles[0].decl) + ' y nada lo neutraliza');
    }
  });
});

if (fallos.length) {
  console.error('✗ Elementos con hidden que se ven igualmente:');
  fallos.forEach(function (f) { console.error('  - ' + f); });
  process.exit(1);
}
console.log('✓ Todos los elementos con hidden quedan escondidos (' + paginas.length + ' páginas)');
