#!/usr/bin/env node
/* Genera los ficheros de ejemplo de registro/ejemplos-oal/ CON LA PROPIA
   plantilla (registro/plantilla-oal.html).

   Escribirlos a mano sería mentirse: el test del importador
   (scripts/test_oal_import.php) los usa para comprobar que entiende lo que un
   compañero le va a subir, y eso solo vale si lo que lee es de verdad lo que la
   plantilla escribe. Al cambiar la plantilla se relanza esto y el test dirá si
   los dos lados siguen entendiéndose.

   La excepción es con-erratas.xml: la plantilla se niega a descargar un estado
   con esas faltas (para eso están los avisos), así que ese fichero se escribe a
   mano a propósito. Modela lo que llega cuando alguien edita el XML por su
   cuenta, o cuando otro programa lo escribe peor.

   Sin dependencias:  node scripts/generar_ejemplos_oal.js */
'use strict';

var fs = require('fs');
var path = require('path');
var motor = require('./lib_motor_oal.js');

var raiz = path.join(__dirname, '..');
var OAL = motor.cargar();

/* El equipo y el sitio son los mismos en los dos ejemplos: es el material real
   con el que observa el grupo, y así el test puede casarlos contra bases y
   catálogo con nombres que existen. */
function comun() {
  return {
    observador: { nombre: 'Ángel', apellidos: 'L. Huelmo', correo: 'angel@ejemplo.es' },
    lugares: [{ id: 'lu1', nombre: 'El Culebrín II', lat: 38.06416667, lon: -6.20611111, altitud: 600, tz: 120 }],
    telescopios: [{ id: 'te1', modelo: 'Skywatcher 12"', apertura: 305, focal: 1494.5 }],
    oculares: [{ id: 'oc1', modelo: 'Nagler Type 4 22mm', focal: 22, campo: 82 },
               { id: 'oc2', modelo: 'Nagler Type 6 7mm', focal: 7, campo: 82 }],
    auxiliares: []
  };
}

/* Una noche corriente: tres objetos, uno de ellos ya de madrugada. */
function nocheSimple() {
  var e = comun();
  e.noches = [{
    id: 'no1', fecha: '2026-08-05', lugarId: 'lu1', comienzo: '22:30', fin: '02:00',
    sqm: 21.42, ir: -18, seeing: 3, bortle: 4, tripulacion: 'Israel Pérez de Tudela',
    meteo: 'Despejado, algo de humedad al final',
    cronica: 'Primera salida del verano al Culebrín. El cielo aguantó toda la noche.'
  }];
  e.observaciones = [
    { id: 'ob1', nocheId: 'no1', objeto: 'M13', ra: 250.4235, dec: 36.4613, otype: 'GlC',
      hora: '23:10', telescopioId: 'te1', ocularId: 'oc1', auxiliarId: '', aumentos: '',
      texto: 'Enorme y granulado ya a pocos aumentos.' },
    { id: 'ob2', nocheId: 'no1', objeto: 'M57', ra: 283.396, dec: 33.0292, otype: 'PN',
      hora: '23:45', telescopioId: 'te1', ocularId: 'oc2', auxiliarId: '', aumentos: '',
      texto: 'El anillo, con el centro claramente más oscuro.' },
    { id: 'ob3', nocheId: 'no1', objeto: 'NGC 7000', ra: 314.75, dec: 44.53, otype: 'GNe',
      hora: '01:20', telescopioId: 'te1', ocularId: 'oc1', auxiliarId: '', aumentos: '',
      texto: 'De madrugada, con el filtro puesto, el Muro se recorta solo.' }
  ];
  return e;
}

/* Dos salidas seguidas, dos sitios. La primera trae el mismo objeto a dos
   aumentos —dos observaciones en OAL, UNA en la bitácora— y la segunda mirada
   cae ya pasada la medianoche, que es donde se rompe la fusión si alguien
   ordena las entradas solo por hora. La segunda noche es de otro sitio, para
   que el importador tenga que casar (o crear) dos bases distintas. */
function dosOculares() {
  var e = comun();
  e.lugares.push({ id: 'lu2', nombre: 'Observatorio Andaluz de Astronomía',
                   lat: 37.415, lon: -3.95333333, altitud: 500, tz: 120 });
  e.auxiliares = [{ id: 'au1', modelo: 'Barlow TeleVue 2x', factor: 2 }];
  e.noches = [
    { id: 'no1', fecha: '2026-07-11', lugarId: 'lu1', comienzo: '23:00', fin: '03:30',
      sqm: 21.3, ir: -15, seeing: 2, bortle: 4, tripulacion: 'Isra, Víctor',
      meteo: '', cronica: 'Noche de dobles.' },
    { id: 'no2', fecha: '2026-07-12', lugarId: 'lu2', comienzo: '22:45', fin: '',
      sqm: '', ir: '', seeing: 4, bortle: '', tripulacion: '',
      meteo: 'Viento del norte', cronica: '' }
  ];
  e.observaciones = [
    { id: 'ob1', nocheId: 'no1', objeto: 'Almaak', ra: 30.9748, dec: 42.3297, otype: '**',
      hora: '23:30', telescopioId: 'te1', ocularId: 'oc1', auxiliarId: '', aumentos: '',
      texto: 'A 68x ya se intuye la compañera azul.' },
    { id: 'ob2', nocheId: 'no1', objeto: 'Almaak', ra: 30.9748, dec: 42.3297, otype: '**',
      hora: '00:20', telescopioId: 'te1', ocularId: 'oc2', auxiliarId: 'au1', aumentos: '',
      texto: 'A 427x el contraste de color es descarado: naranja y azul.' },
    { id: 'ob3', nocheId: 'no2', objeto: 'M27', ra: 299.9016, dec: 22.7211, otype: 'PN',
      hora: '01:05', telescopioId: 'te1', ocularId: 'oc1', auxiliarId: '', aumentos: '',
      texto: 'La manzana mordida, de madrugada y ya alta.' }
  ];
  return e;
}

[['noche-simple', nocheSimple()], ['dos-oculares', dosOculares()]].forEach(function (par) {
  var faltas = OAL.problemas(par[1]).filter(function (p) { return p.nivel === 'falta'; });
  if (faltas.length) {
    console.log('El ejemplo ' + par[0] + ' no lo descargaría ni la plantilla: ' +
                faltas.map(function (p) { return p.que; }).join('; '));
    process.exit(1);
  }
  var destino = path.join(raiz, 'registro', 'ejemplos-oal', par[0] + '.xml');
  fs.writeFileSync(destino, OAL.xmlDe(par[1]), 'utf8');
  console.log('  escrito  registro/ejemplos-oal/' + par[0] + '.xml');
});
console.log('\nok · los ejemplos los ha escrito la plantilla. Relanza php scripts/test_oal_import.php');
