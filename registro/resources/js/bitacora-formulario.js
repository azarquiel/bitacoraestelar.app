/* ===========================================================================
 * BITÁCORA MESSIER · Formulario de registro de observaciones
 * ---------------------------------------------------------------------------
 * Este archivo va SUBIDO POR FTP a /wp-content/uploads/bitacora/
 * y NO se pega en el editor de WordPress.
 *
 * Motivo: el editor de bloques escapa los caracteres "&" del código
 * (convierte && en &#038;&#038;), lo que rompe el JavaScript. Sirviéndolo
 * como archivo .js, el servidor lo entrega intacto.
 *
 * Al actualizar este archivo, incrementa el ?v=N en el fragmento HTML
 * para que los navegadores no usen la copia cacheada.
 * =========================================================================== */

(function(){
  'use strict';

  // Espera a que el HTML del formulario exista antes de tocarlo. Sin esto, si
  // el script corre demasiado pronto, getElementById devuelve null y todo falla.
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', arrancar);
  } else {
    arrancar();
  }

  function arrancar(){
   try{

  // ═══════════════════════════════════════════════════════════════════════
  // CATÁLOGO MESSIER (M1–M110) · coordenadas J2000, RA/Dec en grados
  // ═══════════════════════════════════════════════════════════════════════
  var MESSIER = {
    1:{n:'Nebulosa del Cangrejo',ra:83.6287,de:22.0147,c:'Tau'},
    2:{n:'',ra:323.3626,de:-0.8233,c:'Aqr'},
    3:{n:'',ra:205.5484,de:28.3773,c:'CVn'},
    4:{n:'',ra:245.8967,de:-26.5256,c:'Sco'},
    5:{n:'',ra:229.6384,de:2.0810,c:'Ser'},
    6:{n:'Cúmulo de la Mariposa',ra:265.0833,de:-32.2533,c:'Sco'},
    7:{n:'Cúmulo de Ptolomeo',ra:268.4633,de:-34.7928,c:'Sco'},
    8:{n:'Nebulosa de la Laguna',ra:270.9042,de:-24.3867,c:'Sgr'},
    9:{n:'',ra:259.7992,de:-18.5164,c:'Oph'},
    10:{n:'',ra:254.2877,de:-4.1003,c:'Oph'},
    11:{n:'Cúmulo del Pato Salvaje',ra:282.7700,de:-6.2711,c:'Sct'},
    12:{n:'',ra:251.8092,de:-1.9483,c:'Oph'},
    13:{n:'Gran Cúmulo de Hércules',ra:250.4235,de:36.4613,c:'Her'},
    14:{n:'',ra:264.4008,de:-3.2458,c:'Oph'},
    15:{n:'',ra:322.4930,de:12.1670,c:'Peg'},
    16:{n:'Nebulosa del Águila',ra:274.7000,de:-13.8067,c:'Ser'},
    17:{n:'Nebulosa Omega',ra:275.1963,de:-16.1772,c:'Sgr'},
    18:{n:'',ra:274.9983,de:-17.1017,c:'Sgr'},
    19:{n:'',ra:255.6571,de:-26.2678,c:'Oph'},
    20:{n:'Nebulosa Trífida',ra:270.6742,de:-23.0300,c:'Sgr'},
    21:{n:'',ra:275.9225,de:-22.5000,c:'Sgr'},
    22:{n:'',ra:279.0997,de:-23.9047,c:'Sgr'},
    23:{n:'',ra:269.2667,de:-19.0167,c:'Sgr'},
    24:{n:'Nube Estelar de Sagitario',ra:274.2083,de:-18.5500,c:'Sgr'},
    25:{n:'',ra:277.9375,de:-19.1153,c:'Sgr'},
    26:{n:'',ra:281.3208,de:-9.3861,c:'Sct'},
    27:{n:'Nebulosa Dumbbell',ra:299.9015,de:22.7212,c:'Vul'},
    28:{n:'',ra:276.1370,de:-24.8697,c:'Sgr'},
    29:{n:'',ra:305.9917,de:38.5228,c:'Cyg'},
    30:{n:'',ra:325.0922,de:-23.1799,c:'Cap'},
    31:{n:'Galaxia de Andrómeda',ra:10.6847,de:41.2687,c:'And'},
    32:{n:'',ra:10.6743,de:40.8652,c:'And'},
    33:{n:'Galaxia del Triángulo',ra:23.4621,de:30.6600,c:'Tri'},
    34:{n:'',ra:40.5313,de:42.7614,c:'Per'},
    35:{n:'',ra:92.2708,de:24.3358,c:'Gem'},
    36:{n:'',ra:84.0846,de:34.1353,c:'Aur'},
    37:{n:'',ra:88.0742,de:32.5453,c:'Aur'},
    38:{n:'',ra:81.9250,de:35.8342,c:'Aur'},
    39:{n:'',ra:322.9375,de:48.4344,c:'Cyg'},
    40:{n:'Winnecke 4',ra:185.5521,de:58.0828,c:'UMa'},
    41:{n:'',ra:101.5042,de:-20.7167,c:'CMa'},
    42:{n:'Nebulosa de Orión',ra:83.8221,de:-5.3911,c:'Ori'},
    43:{n:'',ra:83.8804,de:-5.2700,c:'Ori'},
    44:{n:'El Pesebre',ra:130.0958,de:19.6722,c:'Cnc'},
    45:{n:'Las Pléyades',ra:56.7500,de:24.1167,c:'Tau'},
    46:{n:'',ra:115.4375,de:-14.8167,c:'Pup'},
    47:{n:'',ra:114.1479,de:-14.4989,c:'Pup'},
    48:{n:'',ra:123.4292,de:-5.7500,c:'Hya'},
    49:{n:'',ra:187.4447,de:8.0004,c:'Vir'},
    50:{n:'',ra:105.6708,de:-8.3378,c:'Mon'},
    51:{n:'Galaxia del Remolino',ra:202.4696,de:47.1952,c:'CVn'},
    52:{n:'',ra:351.2000,de:61.5931,c:'Cas'},
    53:{n:'',ra:198.2304,de:18.1681,c:'Com'},
    54:{n:'',ra:283.7638,de:-30.4797,c:'Sgr'},
    55:{n:'',ra:294.9988,de:-30.9647,c:'Sgr'},
    56:{n:'',ra:289.1483,de:30.1834,c:'Lyr'},
    57:{n:'Nebulosa del Anillo',ra:283.3963,de:33.0293,c:'Lyr'},
    58:{n:'',ra:189.4315,de:11.8181,c:'Vir'},
    59:{n:'',ra:190.5097,de:11.6469,c:'Vir'},
    60:{n:'',ra:190.9166,de:11.5526,c:'Vir'},
    61:{n:'',ra:185.4788,de:4.4736,c:'Vir'},
    62:{n:'',ra:255.3033,de:-30.1122,c:'Oph'},
    63:{n:'Galaxia del Girasol',ra:198.9556,de:42.0292,c:'CVn'},
    64:{n:'Galaxia del Ojo Negro',ra:194.1821,de:21.6828,c:'Com'},
    65:{n:'',ra:169.7331,de:13.0923,c:'Leo'},
    66:{n:'',ra:170.0625,de:12.9916,c:'Leo'},
    67:{n:'',ra:132.8250,de:11.8139,c:'Cnc'},
    68:{n:'',ra:189.8666,de:-26.7442,c:'Hya'},
    69:{n:'',ra:277.8463,de:-32.3481,c:'Sgr'},
    70:{n:'',ra:280.8030,de:-32.2921,c:'Sgr'},
    71:{n:'',ra:298.4438,de:18.7792,c:'Sge'},
    72:{n:'',ra:313.3654,de:-12.5372,c:'Aqr'},
    73:{n:'',ra:314.7500,de:-12.6333,c:'Aqr'},
    74:{n:'',ra:24.1741,de:15.7836,c:'Psc'},
    75:{n:'',ra:301.5202,de:-21.9223,c:'Sgr'},
    76:{n:'Nebulosa Little Dumbbell',ra:25.5821,de:51.5753,c:'Per'},
    77:{n:'',ra:40.6696,de:-0.0133,c:'Cet'},
    78:{n:'',ra:86.6908,de:0.0792,c:'Ori'},
    79:{n:'',ra:81.0442,de:-24.5242,c:'Lep'},
    80:{n:'',ra:244.2600,de:-22.9761,c:'Sco'},
    81:{n:'Galaxia de Bode',ra:148.8882,de:69.0653,c:'UMa'},
    82:{n:'Galaxia del Cigarro',ra:148.9684,de:69.6797,c:'UMa'},
    83:{n:'',ra:204.2538,de:-29.8656,c:'Hya'},
    84:{n:'',ra:186.2656,de:12.8870,c:'Vir'},
    85:{n:'',ra:186.3503,de:18.1912,c:'Com'},
    86:{n:'',ra:186.5492,de:12.9463,c:'Vir'},
    87:{n:'',ra:187.7059,de:12.3911,c:'Vir'},
    88:{n:'',ra:187.9967,de:14.4204,c:'Com'},
    89:{n:'',ra:188.9160,de:12.5563,c:'Vir'},
    90:{n:'',ra:189.2076,de:13.1629,c:'Vir'},
    91:{n:'',ra:188.8600,de:14.4964,c:'Com'},
    92:{n:'',ra:259.2808,de:43.1361,c:'Her'},
    93:{n:'',ra:116.1167,de:-23.8567,c:'Pup'},
    94:{n:'',ra:192.7213,de:41.1203,c:'CVn'},
    95:{n:'',ra:160.9902,de:11.7037,c:'Leo'},
    96:{n:'',ra:161.6906,de:11.8199,c:'Leo'},
    97:{n:'Nebulosa del Búho',ra:168.6987,de:55.0190,c:'UMa'},
    98:{n:'',ra:183.4514,de:14.9003,c:'Com'},
    99:{n:'',ra:184.7067,de:14.4164,c:'Com'},
    100:{n:'',ra:185.7286,de:15.8225,c:'Com'},
    101:{n:'Galaxia del Molinete',ra:210.8025,de:54.3488,c:'UMa'},
    102:{n:'Galaxia del Huso',ra:226.6231,de:55.7633,c:'Dra'},
    103:{n:'',ra:23.3417,de:60.6583,c:'Cas'},
    104:{n:'Galaxia del Sombrero',ra:189.9976,de:-11.6231,c:'Vir'},
    105:{n:'',ra:161.9569,de:12.5817,c:'Leo'},
    106:{n:'',ra:184.7397,de:47.3040,c:'CVn'},
    107:{n:'',ra:248.1329,de:-13.0537,c:'Oph'},
    108:{n:'',ra:167.8792,de:55.6742,c:'UMa'},
    109:{n:'',ra:179.4001,de:53.3747,c:'UMa'},
    110:{n:'',ra:10.0919,de:41.6853,c:'And'}
  };
  // ═══════════════════════════════════════════════════════════════════════
  // ASTRONOMÍA DE POSICIÓN (algoritmos de Meeus, sin dependencias externas)
  // ═══════════════════════════════════════════════════════════════════════
  var D2R=Math.PI/180, R2D=180/Math.PI;
  function rev(x){ return ((x%360)+360)%360; }

  function julianDay(date){ // date = objeto Date (en UTC)
    var Y=date.getUTCFullYear(), M=date.getUTCMonth()+1,
        D=date.getUTCDate()+(date.getUTCHours()+date.getUTCMinutes()/60+date.getUTCSeconds()/3600)/24;
    if(M<=2){Y-=1;M+=12;}
    var A=Math.floor(Y/100), B=2-A+Math.floor(A/4);
    return Math.floor(365.25*(Y+4716))+Math.floor(30.6001*(M+1))+D+B-1524.5;
  }
  function sunPos(jd){
    var T=(jd-2451545)/36525;
    var L0=rev(280.46646+36000.76983*T+0.0003032*T*T);
    var M=rev(357.52911+35999.05029*T-0.0001537*T*T)*D2R;
    var C=(1.914602-0.004817*T-0.000014*T*T)*Math.sin(M)+(0.019993-0.000101*T)*Math.sin(2*M)+0.000289*Math.sin(3*M);
    var tl=(L0+C)*D2R, eps=(23.439291-0.0130042*T)*D2R;
    return { ra:rev(Math.atan2(Math.cos(eps)*Math.sin(tl),Math.cos(tl))*R2D),
             dec:Math.asin(Math.sin(eps)*Math.sin(tl))*R2D };
  }
  function moonPos(jd){
    var T=(jd-2451545)/36525;
    var Lp=rev(218.3164477+481267.88123421*T),
        D=rev(297.8501921+445267.1114034*T)*D2R,
        M=rev(357.5291092+35999.0502909*T)*D2R,
        Mp=rev(134.9633964+477198.8675055*T)*D2R,
        F=rev(93.272095+483202.0175233*T)*D2R;
    var lon=Lp+(6.288774*Math.sin(Mp)+1.274027*Math.sin(2*D-Mp)+0.658314*Math.sin(2*D)
              +0.213618*Math.sin(2*Mp)-0.185116*Math.sin(M)-0.114332*Math.sin(2*F));
    var lat=(5.128122*Math.sin(F)+0.280602*Math.sin(Mp+F)+0.277693*Math.sin(Mp-F)
            +0.173237*Math.sin(2*D-F)+0.055413*Math.sin(2*D+F-Mp));
    lon=rev(lon)*D2R; lat=lat*D2R; var eps=(23.439291-0.0130042*T)*D2R;
    return { ra:rev(Math.atan2(Math.sin(lon)*Math.cos(eps)-Math.tan(lat)*Math.sin(eps),Math.cos(lon))*R2D),
             dec:Math.asin(Math.sin(lat)*Math.cos(eps)+Math.cos(lat)*Math.sin(eps)*Math.sin(lon))*R2D };
  }
  function gmst(jd){
    var T=(jd-2451545)/36525;
    return rev(280.46061837+360.98564736629*(jd-2451545)+0.000387933*T*T-T*T*T/38710000);
  }
  // Devuelve {alt, az} en grados. az medido desde el Norte hacia el Este.
  function altAz(ra,dec,jd,lat,lon){
    var lst=rev(gmst(jd)+lon), H=rev(lst-ra)*D2R;
    var la=lat*D2R, de=dec*D2R;
    var alt=Math.asin(Math.sin(la)*Math.sin(de)+Math.cos(la)*Math.cos(de)*Math.cos(H));
    var az=Math.atan2(-Math.cos(de)*Math.sin(H), Math.sin(de)*Math.cos(la)-Math.cos(de)*Math.sin(la)*Math.cos(H));
    return { alt:alt*R2D, az:rev(az*R2D) };
  }
  // Refracción atmosférica aproximada (Bennett) para altitudes ≳ -1°
  function refract(alt){
    if(alt<-1) return alt;
    return alt + (1/60)*(1.02/Math.tan((alt+10.3/(alt+5.11))*D2R));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PARSERS DE COORDENADAS Y NOMBRE DE OBJETO
  // ═══════════════════════════════════════════════════════════════════════
  // "M30", "Messier 30", "m 30" -> 30 ; si no es Messier -> null
  function messierNumber(txt){
    var m=txt.trim().toLowerCase().replace(/\s+/g,'').match(/^(?:m|messier)(\d{1,3})$/);
    return m ? parseInt(m[1],10) : null;
  }
  // RA aceptando "21h40m22s", "21 40 22", "21:40:22" ó decimal en grados "325.09"
  function parseRA(txt){
    txt=txt.trim(); if(txt==='') return null;
    var hms=txt.match(/(-?\d+(?:\.\d+)?)\s*[h: ]\s*(\d+(?:\.\d+)?)\s*[m: ]?\s*(\d+(?:\.\d+)?)?/i);
    if(hms && /[h:]/i.test(txt)){
      var h=parseFloat(hms[1]),mi=parseFloat(hms[2]||0),s=parseFloat(hms[3]||0);
      return rev((h+mi/60+s/3600)*15);
    }
    var d=parseFloat(txt); return isNaN(d)?null:rev(d);
  }
  // Dec aceptando "-23°10'47\"", "-23 10 47", ó decimal "-23.18"
  function parseDec(txt){
    txt=txt.trim(); if(txt==='') return null;
    var dms=txt.match(/(-?\+?\d+(?:\.\d+)?)\s*[°d: ]\s*(\d+(?:\.\d+)?)?\s*['′m: ]?\s*(\d+(?:\.\d+)?)?/i);
    if(dms && /[°d'′"]/i.test(txt)){
      var sign=/^\s*-/.test(txt)?-1:1, dg=Math.abs(parseFloat(dms[1])),mi=parseFloat(dms[2]||0),s=parseFloat(dms[3]||0);
      var v=sign*(dg+mi/60+s/3600); return (v<-90||v>90)?null:v;
    }
    var d=parseFloat(txt); return (isNaN(d)||d<-90||d>90)?null:d;
  }

  // Grados decimales -> formato habitual. RA en horas: "21h 40m 22s".
  // Se usa al precargar la edición para no mostrar el valor decimal crudo.
  function formatRA(deg){
    if(deg==null||deg===''||isNaN(deg)) return '';
    var h=rev(parseFloat(deg))/15, hh=Math.floor(h), mDec=(h-hh)*60, mm=Math.floor(mDec), ss=Math.round((mDec-mm)*60);
    if(ss===60){ ss=0; mm++; } if(mm===60){ mm=0; hh=(hh+1)%24; }
    return hh+'h '+mm+'m '+ss+'s';
  }
  // Grados decimales -> Dec sexagesimal con signo: "-23° 10′ 47″".
  function formatDec(deg){
    if(deg==null||deg===''||isNaN(deg)) return '';
    var v=parseFloat(deg), sign=v<0?'-':'+', a=Math.abs(v), dd=Math.floor(a), mDec=(a-dd)*60, mm=Math.floor(mDec), ss=Math.round((mDec-mm)*60);
    if(ss===60){ ss=0; mm++; } if(mm===60){ mm=0; dd++; }
    return sign+dd+'° '+mm+'′ '+ss+'″';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CATÁLOGO DE ESTRELLAS DE CARBONO (Astronomical League)
  // ═══════════════════════════════════════════════════════════════════════
  // Se carga desde estrellas-carbono-datos.js (window.BITACORA_CARBONO). Sus
  // coordenadas vienen en sexagesimal ("HH MM SS" / "±DD MM SS"); aquí se pasan
  // a GRADOS, que es como el formulario maneja RA/Dec internamente. Así una
  // estrella de carbono se resuelve con NUESTRAS coordenadas, sin depender de
  // SIMBAD ni de tener sesión iniciada (funciona en la página pública).
  function sxRAaGrados(s){ var p=String(s).trim().split(/\s+/).map(parseFloat); return rev(((p[0]||0)+(p[1]||0)/60+(p[2]||0)/3600)*15); }
  function sxDecaGrados(s){ var t=String(s).trim(), sg=/^-/.test(t)?-1:1, p=t.replace(/^[+-]/,'').split(/\s+/).map(parseFloat); return sg*((p[0]||0)+(p[1]||0)/60+(p[2]||0)/3600); }
  var CARBONO = (window.BITACORA_CARBONO||[]).map(function(e){
    return { nombre:e.nombre, id:e.id, cons:e.constelacion, ra:sxRAaGrados(e.ra), dec:sxDecaGrados(e.dec), mag:e.mag, subtipo:e.tipo };
  });
  // Busca una estrella de carbono por su nombre o identificador exacto.
  function carbonoPorNombre(txt){
    var q=(txt||'').trim().toLowerCase(); if(!q) return null;
    for(var i=0;i<CARBONO.length;i++){
      if(CARBONO[i].nombre.toLowerCase()===q || String(CARBONO[i].id).toLowerCase()===q) return CARBONO[i];
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ESTADO Y REFERENCIAS AL DOM
  // ═══════════════════════════════════════════════════════════════════════
  var $=function(id){return document.getElementById(id);};
  var objInput=$('obj'), suggestBox=$('suggest'), objStatus=$('objStatus'),
      radecBox=$('radecBox'), raManual=$('raManual'), decManual=$('decManual'),
      submitBtn=$('submitBtn'), jsonOut=$('jsonOut'), jsonArea=$('jsonArea');

  var resolved=null; // {tipo:'messier'|'carbono'|'otro', num, nombre, ra, dec, cons, etiqueta}

  // ═══════════════════════════════════════════════════════════════════════
  // RESOLUCIÓN + VALIDACIÓN DEL OBJETO
  // ═══════════════════════════════════════════════════════════════════════
  function setStatus(el,cls,txt){ el.className='status '+cls; el.textContent=txt; }

  function resolveObject(){
    var txt=objInput.value.trim();
    resolved=null; radecBox.classList.remove('show');
    if(txt===''){ setStatus(objStatus,'info','Escribe un objeto Messier (M1–M110), una estrella de carbono o un NGC/IC.'); recompute(); return; }

    var mn=messierNumber(txt);
    if(mn!==null){
      if(mn>=1 && mn<=110 && MESSIER[mn]){
        var o=MESSIER[mn];
        var et='M'+mn+(o.n?' · '+o.n:'')+' ('+o.c+')';
        resolved={tipo:'messier',num:mn,nombre:o.n,ra:o.ra,dec:o.de,cons:o.c,etiqueta:et};
        setStatus(objStatus,'ok','✓ '+et);
      } else {
        setStatus(objStatus,'err','✗ M'+mn+' no existe: el catálogo Messier llega hasta M110.');
      }
      recompute(); return;
    }
    // ¿Es una estrella de carbono del catálogo? Si el nombre coincide, se
    // resuelve con NUESTRAS coordenadas (sin SIMBAD ni login) y se deja la caja
    // de RA/Dec oculta, igual que con un Messier.
    var carb=carbonoPorNombre(txt);
    if(carb){
      var etc='estrella de carbono'+(carb.cons?' · '+carb.cons:'');
      resolved={tipo:'carbono',num:null,nombre:carb.nombre,ra:carb.ra,dec:carb.dec,cons:carb.cons,etiqueta:carb.nombre};
      setStatus(objStatus,'ok','✓ '+carb.nombre+' — '+etc+(carb.mag!=null?' · mag ≈ '+String(carb.mag).replace('.',','):'')+'.');
      recompute(); return;
    }
    // No es Messier ni estrella de carbono: aceptamos como NGC/IC/otro y pedimos RA/Dec
    radecBox.classList.add('show');
    var ra=parseRA(raManual.value), dec=parseDec(decManual.value);
    if(ra!==null && dec!==null){
      resolved={tipo:'otro',num:null,nombre:txt,ra:ra,dec:dec,cons:null,etiqueta:txt+' (coordenadas manuales)'};
      setStatus(objStatus,'ok','✓ '+txt+' — usando las coordenadas introducidas.');
    } else {
      setStatus(objStatus,'info','“'+txt+'” no es Messier. Introduce su RA y Dec para poder calcular su posición.');
      // Autocompletado: si las cajetillas están vacías, se buscan sus RA/Dec en
      // SIMBAD (con una pequeña espera para no consultar en cada tecla).
      programarBusquedaCoords(txt);
    }
    recompute();
  }

  // ── Autocompletado de RA/Dec desde SIMBAD (para objetos no-Messier) ──
  // Se apoya en el endpoint /coordenadas del plugin (el navegador no puede
  // consultar SIMBAD directamente por CORS). No pisa lo que escriba el usuario.
  var coordTimer=null, coordUltimo='', coordsAuto=false;
  function coordenadasURL(q){
    // Deriva la URL a partir de WP.endpoint (.../bitacora/v1/observaciones).
    return WP.endpoint.replace(/observaciones\/?$/, 'coordenadas') + '?q=' + encodeURIComponent(q);
  }
  // ¿Podemos rellenar las cajetillas? Sí si están vacías o si las rellenamos
  // nosotros (coordsAuto); NO si el usuario ha escrito coordenadas a mano.
  function cajetillasLibres(){
    return coordsAuto || (raManual.value.trim()==='' && decManual.value.trim()==='');
  }
  function programarBusquedaCoords(nombre){
    if(!WP) return;                                   // sin sesión no hay endpoint
    var q=(nombre||'').trim();
    if(q.length<2 || !cajetillasLibres()) return;
    if(coordTimer) clearTimeout(coordTimer);
    coordTimer=setTimeout(function(){ buscarCoords(q); }, 700);
  }
  function buscarCoords(q){
    if(q===coordUltimo || !cajetillasLibres()) return;
    coordUltimo=q;
    setStatus(objStatus,'info','Buscando las coordenadas de “'+q+'” en SIMBAD…');
    fetch(coordenadasURL(q), { credentials:'same-origin', headers:{ 'X-WP-Nonce':WP.nonce } })
      .then(function(r){ return r.json().then(function(d){ return {ok:r.ok, data:d}; }); })
      .then(function(res){
        if(!cajetillasLibres()) return;               // el usuario escribió mientras tanto
        if(res.ok && res.data && typeof res.data.ra==='number'){
          raManual.value  = formatRA(res.data.ra);
          decManual.value = formatDec(res.data.dec);
          coordsAuto=true;   // marcadas como auto: se pueden sustituir si cambia el nombre
          resolveObject();   // re-resuelve ya con las coordenadas puestas
          setStatus(objStatus,'ok','✓ Coordenadas de “'+q+'” traídas de SIMBAD (puedes ajustarlas).');
        } else {
          setStatus(objStatus,'info','“'+q+'” no está en SIMBAD. Introduce su RA y Dec a mano.');
        }
      })
      .catch(function(){ /* silencioso: se mantiene el modo manual */ });
  }

  // ── Autocompletado ──
  var activeIdx=-1, currentMatches=[];
  function buildSuggestions(){
    var txt=objInput.value.trim().toLowerCase();
    suggestBox.style.display='none'; currentMatches=[]; activeIdx=-1;
    if(txt.length<1) return;
    var num=txt.replace(/[^0-9]/g,'');
    var matches=[];
    // Objetos Messier (por número o nombre), hasta 7.
    for(var k=1;k<=110;k++){
      var o=MESSIER[k], label='M'+k, hay=(o.n||'').toLowerCase();
      if((num && String(k).indexOf(num)===0) ||
         (hay && hay.indexOf(txt)>=0) ||
         label.toLowerCase().indexOf(txt.replace(/\s/g,''))===0){
        matches.push({valor:'M'+k, label:'M'+k+(o.n?' · '+o.n:''), cons:o.c});
        if(matches.length>=7) break;
      }
    }
    // Estrellas de carbono (por nombre o constelación), hasta completar 12.
    var qc=txt.replace(/\s+/g,' ');
    for(var i=0;i<CARBONO.length && matches.length<12;i++){
      var c=CARBONO[i];
      if(c.nombre.toLowerCase().indexOf(qc)>=0 || (c.cons||'').toLowerCase().indexOf(qc)>=0){
        matches.push({valor:c.nombre, label:c.nombre+' · estrella de carbono', cons:c.cons||''});
      }
    }
    if(!matches.length) return;
    currentMatches=matches;
    suggestBox.innerHTML='';
    matches.forEach(function(m,i){
      var b=document.createElement('button'); b.type='button';
      b.innerHTML='<span>'+m.label+'</span><span class="cons">'+(m.cons||'')+'</span>';
      b.addEventListener('mousedown',function(e){ e.preventDefault(); objInput.value=m.valor;
        suggestBox.style.display='none'; resolveObject(); });
      suggestBox.appendChild(b);
    });
    suggestBox.style.display='block';
  }
  objInput.addEventListener('input',function(){ buildSuggestions(); resolveObject(); });
  objInput.addEventListener('keydown',function(e){
    if(suggestBox.style.display!=='block') return;
    var btns=suggestBox.querySelectorAll('button');
    if(e.key==='ArrowDown'){e.preventDefault();activeIdx=Math.min(activeIdx+1,btns.length-1);}
    else if(e.key==='ArrowUp'){e.preventDefault();activeIdx=Math.max(activeIdx-1,0);}
    else if(e.key==='Enter'&&activeIdx>=0){e.preventDefault();btns[activeIdx].dispatchEvent(new MouseEvent('mousedown'));return;}
    else if(e.key==='Escape'){suggestBox.style.display='none';return;}
    btns.forEach(function(b,i){b.classList.toggle('active',i===activeIdx);});
  });
  objInput.addEventListener('blur',function(){ setTimeout(function(){suggestBox.style.display='none';},150); });
  // Al escribir RA/Dec a mano se desactiva el autocompletado (no las pisamos).
  raManual.addEventListener('input',function(){ coordsAuto=false; resolveObject(); });
  decManual.addEventListener('input',function(){ coordsAuto=false; resolveObject(); });

  // (El mapa, la fecha y el cálculo del cielo se han movido al formulario de
  // datos de ficha. Aquí solo se registra el CONTENIDO de la observación.)

  // ═══════════════════════════════════════════════════════════════════════
  // CÁLCULO EN TIEMPO REAL
  // ═══════════════════════════════════════════════════════════════════════
  function fmtDeg(v){ return (v>=0?'+':'−')+Math.abs(v).toFixed(1)+'°'; }
  function fmtAz(v){
    var dirs=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
    return v.toFixed(1)+'° <small>'+dirs[Math.round(v/22.5)%16]+'</small>';
  }
  var lastComputed=null;
  // En este formulario (solo contenido) la observación está lista cuando hay
  // objeto resuelto y observador. La astrometría (fecha, lugar, altitud/azimut)
  // se captura aparte, en el formulario de datos de ficha.
  function recompute(){
    if(typeof actualizarExplNombre==='function') actualizarExplNombre();
    lastComputed=null; submitBtn.disabled=true; jsonOut.classList.remove('show');
    var haveObj=resolved!==null, haveObs=$('observer').value.trim()!=='';
    var haveFecha=(!!$('fechaObs') && $('fechaObs').value!=='');
    if(!(haveObj&&haveObs&&haveFecha)){ return; }
    lastComputed={
      objeto:resolved.etiqueta, tipo:resolved.tipo, num:resolved.num,
      cons:resolved.cons||'', nombre:resolved.nombre||'',
      ra:resolved.ra, dec:resolved.dec,
      observador:$('observer').value.trim(), telescopio:$('scope').value.trim(),
      telescopioId: telescopioIdSel,
      fechaObservacion:($('fechaObs')?$('fechaObs').value:'')
    };
    submitBtn.disabled=false;
  }
  $('observer').addEventListener('input',recompute);
  $('scope').addEventListener('input',recompute);
  if($('fechaObs')) $('fechaObs').addEventListener('change',recompute);

  // Selector de telescopio de la flota: al elegir uno, rellena el texto del
  // telescopio, guarda su id y recalcula la óptica de todas las entradas.
  // Editar el texto a mano (o "— Elige… —") desvincula el telescopio.
  var scopeSelect = $('scopeSelect');
  if (scopeSelect) {
    scopeSelect.addEventListener('change', function () {
      if (scopeSelect.value) {
        telescopioSel = piezaPorId('telescopios', scopeSelect.value);
        telescopioIdSel = telescopioSel ? telescopioSel.id : null;
        if (telescopioSel) $('scope').value = nombrePieza(telescopioSel);
      } else {
        telescopioSel = null; telescopioIdSel = null;
      }
      recompute();
      if (entradasBox) {
        Array.prototype.forEach.call(entradasBox.querySelectorAll('.entry'), function (el) { recalcEntrada(el, false); });
      }
    });
  }
  // Escribir el telescopio a mano lo desvincula de la flota (id a null).
  $('scope').addEventListener('input', function () {
    telescopioSel = null; telescopioIdSel = null;
    if (scopeSelect) scopeSelect.value = '';
  });

  // ═══════════════════════════════════════════════════════════════════════
  // ENVÍO: por ahora, genera el bloque de datos de la observación
  // ═══════════════════════════════════════════════════════════════════════
  // Datos que WordPress inyecta en la página (ver el plugin). Si no existen,
  // el formulario funciona en modo local: solo muestra el JSON, sin guardar.
  var WP = window.BITACORA_WP || null;

  // ═══════════════════════════════════════════════════════════════════════
  // EQUIPO DEL OBSERVADOR ("Mi flota"): telescopio + oculares + auxiliares.
  // Al elegir telescopio y, por entrada, ocular (y opcionalmente auxiliar), se
  // autocalculan aumento, pupila de salida y campo real (todos editables).
  //   aumentos = focal_tele × factor_aux / focal_ocular
  //   pupila   = apertura / aumentos     campo_real = campo_aparente / aumentos
  // ═══════════════════════════════════════════════════════════════════════
  var flota = { telescopios: [], oculares: [], auxiliares: [] };
  var flotaCargada = false;
  var telescopioSel = null;             // telescopio elegido (objeto) o null
  var telescopioIdSel = null;           // su id (para guardar en la observación)
  var telescopioIdPendiente = null;     // id a preseleccionar (modo edición)

  function piezaPorId(cat, id) {
    var arr = flota[cat] || [];
    for (var i = 0; i < arr.length; i++) { if (String(arr[i].id) === String(id)) return arr[i]; }
    return null;
  }
  function nombrePieza(p) {
    if (!p) return '';
    return ((p.vendor ? p.vendor + ' ' : '') + (p.modelo || p.nombre || '')).trim();
  }
  function specsPieza(cat, p) {
    var n = function (v) { var x = parseFloat(v); return isNaN(x) ? null : x; };
    var s = [];
    if (cat === 'telescopios') {
      if (n(p.apertura_mm) != null) s.push(n(p.apertura_mm) + 'mm');
      if (n(p.focal_mm) != null) s.push('f=' + n(p.focal_mm));
    } else if (cat === 'oculares') {
      if (n(p.focal_mm) != null) s.push(n(p.focal_mm) + 'mm');
      if (n(p.campo_aparente) != null) s.push(n(p.campo_aparente) + '°');
    } else {
      if (n(p.factor) != null) s.push('×' + n(p.factor));
    }
    return s.length ? ' (' + s.join(' ') + ')' : '';
  }

  // Rellena un <select> con una categoría de la flota (value = id).
  function llenarSelect(sel, cat, placeholder) {
    if (!sel) return;
    var html = '<option value="">' + placeholder + '</option>';
    (flota[cat] || []).forEach(function (p) {
      html += '<option value="' + p.id + '">' + textoOpcion(nombrePieza(p) + specsPieza(cat, p)) + '</option>';
    });
    sel.innerHTML = html;
  }
  function textoOpcion(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Cálculo óptico. Devuelve { aumento, pupila, campoReal(grados) } o null.
  function calcularOptica(tele, ocular, aux) {
    if (!tele || !ocular) return null;
    var Ftel = parseFloat(tele.focal_mm), fo = parseFloat(ocular.focal_mm);
    if (!(Ftel > 0) || !(fo > 0)) return null;
    var D = parseFloat(tele.apertura_mm), afov = parseFloat(ocular.campo_aparente);
    var factor = (aux && parseFloat(aux.factor) > 0) ? parseFloat(aux.factor) : 1;
    var aumento = (Ftel * factor) / fo;
    return {
      aumento: Math.round(aumento),
      pupila: (D > 0) ? Math.round((D / aumento) * 10) / 10 : null,
      campoReal: (afov > 0) ? Math.round((afov / aumento) * 100) / 100 : null
    };
  }

  // Recalcula (y rellena) los campos ópticos de una entrada a partir de su
  // ocular/auxiliar y del telescopio elegido. Con 'ponerTitulo', también fija el
  // nombre del ocular. Solo actúa cuando hay telescopio y ocular seleccionados.
  function recalcEntrada(el, ponerTitulo) {
    var so = el.querySelector('.e-ocular'), sa = el.querySelector('.e-auxiliar');
    var ocular = (so && so.value) ? piezaPorId('oculares', so.value) : null;
    var aux = (sa && sa.value) ? piezaPorId('auxiliares', sa.value) : null;
    if (ponerTitulo && ocular) {
      var tit = el.querySelector('.e-titulo');
      if (tit) tit.value = nombrePieza(ocular);
    }
    if (!telescopioSel || !ocular) return;
    var r = calcularOptica(telescopioSel, ocular, aux);
    if (!r) return;
    el.querySelector('.e-aumento').value = (r.aumento != null) ? r.aumento : '';
    if (r.campoReal != null) el.querySelector('.e-campo').value = fmtCampo(r.campoReal);
    if (r.pupila != null) el.querySelector('.e-pupila').value = r.pupila;
    if (typeof recompute === 'function') recompute();
  }

  // Rellena (una sola vez) los selects de equipo de una entrada y aplica la
  // preselección guardada (modo edición: en._ocuPre / en._auxPre).
  function poblarEntrada(el) {
    if (!flotaCargada) return;
    var so = el.querySelector('.e-ocular'), sa = el.querySelector('.e-auxiliar');
    if (so && !so._pob) { llenarSelect(so, 'oculares', '— Elige un ocular —'); so._pob = true; if (el._ocuPre) so.value = String(el._ocuPre); }
    if (sa && !sa._pob) { llenarSelect(sa, 'auxiliares', '— Sin auxiliar —'); sa._pob = true; if (el._auxPre) sa.value = String(el._auxPre); }
  }

  // Rellena el select de telescopios y aplica la preselección pendiente.
  function poblarTelescopios() {
    var sel = $('scopeSelect');
    if (!sel) return;
    if (!sel._pob) { llenarSelect(sel, 'telescopios', '— Elige de tu flota (o escribe abajo) —'); sel._pob = true; }
    if (telescopioIdPendiente) {
      sel.value = String(telescopioIdPendiente);
      if (sel.value) { telescopioSel = piezaPorId('telescopios', telescopioIdPendiente); telescopioIdSel = telescopioSel ? telescopioSel.id : null; }
      telescopioIdPendiente = null;
    }
  }

  // Vuelca la flota en la interfaz cuando ya está cargada (y hay DOM listo).
  function sincronizarFlota() {
    if (!flotaCargada) return;
    poblarTelescopios();
    if (entradasBox) {
      Array.prototype.forEach.call(entradasBox.querySelectorAll('.entry'), poblarEntrada);
    }
  }

  function cargarFlota() {
    if (!WP) return;
    var API = WP.endpoint.replace(/observaciones\/?$/, 'equipo');
    fetch(API, { credentials: 'same-origin', headers: { 'X-WP-Nonce': WP.nonce } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        flota = { telescopios: d.telescopios || [], oculares: d.oculares || [], auxiliares: d.auxiliares || [] };
        flotaCargada = true;
        sincronizarFlota();
      })
      .catch(function () { /* sin flota: los campos ópticos se rellenan a mano */ });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MODO EDICIÓN
  // Si la URL trae ?editar=12, cargamos esa observación y el formulario
  // pasa a modificarla (PUT) en lugar de crear una nueva (POST).
  // ═══════════════════════════════════════════════════════════════════════
  var editandoId = null;
  (function detectarEdicion(){
    var m = window.location.search.match(/[?&]editar=(\d+)/);
    if(m) editandoId = parseInt(m[1],10);
  })();

  function aplicarModoEdicion(){
    if(!editandoId) return;
    submitBtn.textContent = 'Guardar cambios';
    var titulo = document.querySelector('#mw-obs-form h1');
    if(titulo){
      var sub = titulo.querySelector('.sub');
      titulo.childNodes[0].nodeValue = 'Editar observación nº ' + editandoId + ' ';
      if(sub) sub.textContent = 'Modifica lo que necesites. El cielo se recalcula solo.';
    }
  }

  // Vuelca una observación del servidor en los campos del formulario.
  //
  // OJO con el campo del objeto: hay que escribir el IDENTIFICADOR limpio
  // ("M30"), no la etiqueta ("M30 · Cúmulo de la medusa (Cap)"). El validador
  // solo reconoce identificadores; con la etiqueta lo daría por no-Messier,
  // pediría RA/Dec y el botón nunca se activaría.
  function precargar(obs){
    objInput.value      = obs.objeto || '';
    $('observer').value = obs.observador || '';
    $('scope').value    = obs.telescopio || '';
    // Telescopio de la flota (se preselecciona cuando la flota esté cargada).
    telescopioIdPendiente = obs.telescopio_id ? obs.telescopio_id : null;
    if($('fechaObs') && obs.fecha_observacion) $('fechaObs').value = obs.fecha_observacion;

    // MySQL devuelve todo como texto; los campos de RA/Dec aceptan decimales.
    // Para los no-Messier hay que rellenarlos ANTES de resolver, porque
    // resolveObject() los lee para poder validar el objeto.
    if(obs.tipo !== 'messier'){
      // Se muestran con el formato habitual (sexagesimal), no el decimal crudo.
      raManual.value  = formatRA(obs.ra);
      decManual.value = formatDec(obs.decl);
    }
    resolveObject();

    // Entradas por ocular (crearEntrada/entradasBox se definen más abajo, pero
    // precargar se ejecuta al resolver el fetch, cuando ya están listos).
    if(entradasBox){
      entradasBox.innerHTML='';
      var explEl = document.getElementById('explDesc');
      if(explEl) explEl.innerHTML='';
      if(Array.isArray(obs.entradas)){
        obs.entradas.forEach(function(en){
          // La entrada de "Exploración" (botón fijo o sin datos de ocular) va a su
          // editor propio; el resto, a la lista de oculares.
          var esExpl = (en.boton==='Exploración') ||
                       (en.aumento==null && en.campo_real==null);
          if(esExpl && explEl){ explEl.innerHTML = en.descripcion||''; }
          else { crearEntrada(en); }
        });
      }
    }

    recompute();
    // Si la flota ya está cargada, preselecciona telescopio/oculares/auxiliares.
    sincronizarFlota();
  }

  function cargarParaEditar(){
    if(!editandoId || !WP) return;
    $('outNote').textContent = 'Cargando la observación nº ' + editandoId + '…';
    fetch(WP.endpoint + '/' + editandoId, {
      credentials:'same-origin',
      headers:{ 'X-WP-Nonce': WP.nonce }
    })
    .then(function(r){ return r.json().then(function(d){ return {ok:r.ok, status:r.status, data:d}; }); })
    .then(function(res){
      if(!res.ok){
        $('outNote').innerHTML = '<span style="color:var(--rojo)">✗ No se pudo cargar la observación nº ' + editandoId + '.</span>';
        editandoId = null;
        return;
      }
      precargar(res.data);
      $('outNote').textContent = 'Observación cargada. Modifica lo que necesites.';
    })
    .catch(function(){
      $('outNote').innerHTML = '<span style="color:var(--rojo)">✗ No se pudo contactar con el servidor.</span>';
      editandoId = null;
    });
  }

  aplicarModoEdicion();
  cargarParaEditar();
  cargarFlota();   // carga el equipo del observador y puebla los selectores

  // Precarga el observador con el nombre del usuario de WordPress (editable).
  // Solo al crear (en edición, precargar() pone el de la observación).
  if (WP && WP.observador && !editandoId) {
    var obsEl = $('observer');
    if (obsEl && obsEl.value.trim() === '') { obsEl.value = WP.observador; recompute(); }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ENTRADAS POR OCULAR (una por aumento)
  //
  // Cada entrada: aumento y campo real (obligatorios), pupila de salida y
  // nombre del ocular (opcionales), descripción con formato (obligatoria),
  // varias imágenes principales (con etiqueta para pestañas) e imágenes de
  // apoyo (anexos, con título y posición). Las imágenes se suben a la
  // biblioteca de medios de WordPress; se guarda su id/URL.
  // ═══════════════════════════════════════════════════════════════════════
  var entradasBox = $('entradas'), addEntryBtn = $('addEntry');

  // "1º 10′", "1 10", "70′", "1.17" -> grados decimales
  function parseCampo(txt){
    txt = String(txt==null?'':txt).trim(); if(txt==='') return null;
    var dm = txt.match(/^(-?\d+(?:[.,]\d+)?)\s*[°ºd]\s*(\d+(?:[.,]\d+)?)?\s*['′]?$/i);
    if(dm){ return parseFloat(dm[1].replace(',','.')) + parseFloat((dm[2]||'0').replace(',','.'))/60; }
    var mm = txt.match(/^(\d+(?:[.,]\d+)?)\s*['′]$/);
    if(mm){ return parseFloat(mm[1].replace(',','.'))/60; }
    var d = parseFloat(txt.replace(',','.')); return isNaN(d)?null:d;
  }
  function fmtCampo(deg){
    if(deg===null||isNaN(deg)) return '';
    var d=Math.floor(deg), m=Math.round((deg-d)*60);
    if(m===60){ d+=1; m=0; }
    return d+'º '+m+'′';
  }
  function textoPlano(html){ var d=document.createElement('div'); d.innerHTML=html||''; return (d.textContent||'').trim(); }

  function renumerarEntradas(){
    var i=0;
    entradasBox.querySelectorAll('.entry').forEach(function(el){
      i++; var t=el.querySelector('.entry-title'); if(t) t.textContent='Ocular '+i;
    });
  }

  // ── Subida de un archivo a la biblioteca de medios ──
  function subirImagen(file, rowEl, statusEl){
    if(!WP || !WP.media){ statusEl.textContent='(sin sesión de WordPress no se puede subir)'; return; }
    statusEl.textContent='Subiendo…';
    fetch(WP.media, {
      method:'POST', credentials:'same-origin',
      headers:{
        'X-WP-Nonce':WP.nonce,
        'Content-Disposition':'attachment; filename="'+encodeURIComponent(file.name)+'"',
        'Content-Type': file.type||'application/octet-stream'
      },
      body:file
    })
    .then(function(r){ return r.json().then(function(d){ return {ok:r.ok,status:r.status,data:d}; }); })
    .then(function(res){
      if(res.ok && res.data && res.data.id){
        rowEl.setAttribute('data-img-id', res.data.id);
        rowEl.setAttribute('data-img-url', res.data.source_url||'');
        statusEl.innerHTML='<span style="color:var(--verde)">✓ subida</span>';
      } else {
        var msg=(res.data&&res.data.message)?res.data.message:('error '+res.status);
        statusEl.innerHTML='<span style="color:var(--rojo)">'+msg+'</span>';
      }
    })
    .catch(function(){ statusEl.innerHTML='<span style="color:var(--rojo)">sin conexión</span>'; });
  }

  // ── Una fila de imagen (principal o anexo) ──
  function crearImagen(listEl, tipo, datos){
    datos = datos || {};
    var row = document.createElement('div');
    row.className='img-row'; row.setAttribute('data-tipo', tipo);
    if(datos.imagen_id) row.setAttribute('data-img-id', datos.imagen_id);
    if(datos.imagen_url) row.setAttribute('data-img-url', datos.imagen_url);

    var posSel = (tipo==='anexo')
      ? '<select class="img-pos"><option value="right">Derecha</option><option value="left">Izquierda</option></select>'
      : '';
    var placeholder = (tipo==='anexo') ? 'Título del anexo' : 'Etiqueta (p. ej. Sin filtro)';
    row.innerHTML =
      '<input type="file" class="img-file" accept="image/*">'+
      '<input type="text" class="img-etiqueta" placeholder="'+placeholder+'">'+
      posSel+
      '<button type="button" class="img-del" title="Quitar">×</button>'+
      '<div class="img-status"></div>';

    row.querySelector('.img-etiqueta').value = datos.etiqueta || '';
    if(tipo==='anexo' && datos.pos){ row.querySelector('.img-pos').value = datos.pos; }
    if(datos.imagen_url){
      row.querySelector('.img-status').innerHTML='<a href="'+datos.imagen_url+'" target="_blank" rel="noopener">imagen actual</a>';
    }

    row.querySelector('.img-del').addEventListener('click',function(){ row.remove(); });
    row.querySelector('.img-file').addEventListener('change',function(ev){
      var f=ev.target.files&&ev.target.files[0]; if(f) subirImagen(f, row, row.querySelector('.img-status'));
    });
    listEl.appendChild(row);
    return row;
  }

  // ── Una entrada (ocular) completa ──
  function crearEntrada(datos){
    datos = datos || {};
    var el = document.createElement('div');
    el.className='entry';
    el.innerHTML =
      '<div class="entry-head"><span class="entry-title">Ocular</span>'+
        '<button type="button" class="entry-del">Quitar</button></div>'+
      '<div class="row entry-equipo">'+
        '<label class="field"><span class="lab">Ocular (de tu flota)</span>'+
          '<select class="e-ocular"><option value="">— Elige un ocular —</option></select></label>'+
        '<label class="field"><span class="lab">Auxiliar (opcional)</span>'+
          '<select class="e-auxiliar"><option value="">— Sin auxiliar —</option></select></label>'+
      '</div>'+
      '<div class="row">'+
        '<label class="field"><span class="lab">Aumento (✕) *</span>'+
          '<input type="number" class="e-aumento" step="1" min="1" placeholder="70"></label>'+
        '<label class="field"><span class="lab">Campo real *</span>'+
          '<input type="text" class="e-campo" placeholder="1º 10′ · ó 1.17 · ó 70′"></label>'+
        '<label class="field"><span class="lab">Pupila de salida (mm)</span>'+
          '<input type="number" class="e-pupila" step="0.1" min="0" placeholder="6.6"></label>'+
      '</div>'+
      '<label class="field"><span class="lab">Nombre del ocular</span>'+
        '<input type="text" class="e-titulo" placeholder="Nagler 31mm"></label>'+
      '<div class="field"><span class="lab">Descripción *</span>'+
        '<div class="rt-toolbar">'+
          '<button type="button" data-cmd="bold" title="Negrita"><b>B</b></button>'+
          '<button type="button" data-cmd="italic" title="Cursiva"><i>i</i></button>'+
          '<button type="button" data-cmd="insertUnorderedList" title="Lista">• lista</button>'+
          '<button type="button" data-cmd="formatBlock" data-arg="p" title="Párrafo">¶</button>'+
        '</div>'+
        '<div class="e-desc rt-editor" contenteditable="true"></div></div>'+
      '<div class="imgs-block">'+
        '<div class="imgs-head">Imágenes principales <span>(el boceto/foto a este aumento; varias = pestañas)</span></div>'+
        '<div class="lista-principales"></div>'+
        '<button type="button" class="add-img" data-tipo="principal">+ Añadir imagen</button>'+
      '</div>'+
      '<div class="imgs-block">'+
        '<div class="imgs-head">Imágenes de apoyo (anexos) <span>(refuerzan lo que describes)</span></div>'+
        '<div class="lista-anexos"></div>'+
        '<button type="button" class="add-img" data-tipo="anexo">+ Añadir anexo</button>'+
      '</div>';

    // Valores iniciales (modo edición)
    el.querySelector('.e-aumento').value = (datos.aumento!==undefined&&datos.aumento!==null)?datos.aumento:'';
    el.querySelector('.e-campo').value   = (datos.campo_real!==undefined&&datos.campo_real!==null&&datos.campo_real!=='')?fmtCampo(parseFloat(datos.campo_real)):'';
    el.querySelector('.e-pupila').value  = (datos.pupila_salida!==undefined&&datos.pupila_salida!==null&&datos.pupila_salida!=='')?datos.pupila_salida:'';
    el.querySelector('.e-titulo').value  = datos.titulo||'';
    el.querySelector('.e-desc').innerHTML = datos.descripcion||'';

    // Equipo de la entrada: preselección guardada (modo edición) + poblado de los
    // selects (cuando la flota esté cargada) + recálculo al cambiar de pieza.
    if (datos.ocular_id) el._ocuPre = datos.ocular_id;
    if (datos.auxiliar_id) el._auxPre = datos.auxiliar_id;
    poblarEntrada(el);
    el.querySelector('.e-ocular').addEventListener('change', function(){ recalcEntrada(el, true); });
    el.querySelector('.e-auxiliar').addEventListener('change', function(){ recalcEntrada(el, false); });

    // Editor con formato: Enter crea párrafos <p>.
    try{ document.execCommand('defaultParagraphSeparator', false, 'p'); }catch(_e){}
    el.querySelectorAll('.rt-toolbar button').forEach(function(btn){
      btn.addEventListener('mousedown', function(ev){
        ev.preventDefault();  // no perder el foco del editor
        var cmd=btn.getAttribute('data-cmd'), arg=btn.getAttribute('data-arg')||null;
        el.querySelector('.e-desc').focus();
        try{ document.execCommand(cmd, false, arg); }catch(_e){}
      });
    });

    // Botones de añadir imágenes
    var listaP=el.querySelector('.lista-principales'), listaA=el.querySelector('.lista-anexos');
    el.querySelectorAll('.add-img').forEach(function(btn){
      btn.addEventListener('click',function(){
        var tipo=btn.getAttribute('data-tipo');
        crearImagen(tipo==='anexo'?listaA:listaP, tipo);
      });
    });

    // Imágenes existentes (modo edición)
    if(Array.isArray(datos.imagenes)){
      datos.imagenes.forEach(function(img){
        crearImagen(img.tipo==='anexo'?listaA:listaP, img.tipo==='anexo'?'anexo':'principal', img);
      });
    }

    el.querySelector('.entry-del').addEventListener('click',function(){ el.remove(); renumerarEntradas(); });

    entradasBox.appendChild(el);
    renumerarEntradas();
    return el;
  }

  // ── Recogida y validación ──
  function recogerImagenes(el){
    var out=[];
    el.querySelectorAll('.img-row').forEach(function(row){
      var id=row.getAttribute('data-img-id'), url=row.getAttribute('data-img-url');
      if(!id && !url) return;
      var tipo=row.getAttribute('data-tipo')||'principal';
      var posSel=row.querySelector('.img-pos');
      out.push({
        tipo:tipo,
        imagenId: id?parseInt(id,10):null,
        imagenUrl: url||'',
        etiqueta: (row.querySelector('.img-etiqueta').value||'').trim(),
        pos: (tipo==='anexo' && posSel)?posSel.value:''
      });
    });
    return out;
  }

  function recogerEntradas(){
    var out=[];
    entradasBox.querySelectorAll('.entry').forEach(function(el){
      var aum=el.querySelector('.e-aumento').value.trim();
      var campo=el.querySelector('.e-campo').value.trim();
      var pup=el.querySelector('.e-pupila').value.trim();
      var titulo=el.querySelector('.e-titulo').value.trim();
      var descHtml=el.querySelector('.e-desc').innerHTML.trim();
      var imagenes=recogerImagenes(el);
      var ocuSel=el.querySelector('.e-ocular'), auxSel=el.querySelector('.e-auxiliar');
      var ocuId=(ocuSel&&ocuSel.value)?parseInt(ocuSel.value,10):null;
      var auxId=(auxSel&&auxSel.value)?parseInt(auxSel.value,10):null;
      if(aum==='' && campo==='' && pup==='' && titulo==='' && textoPlano(descHtml)==='' && !imagenes.length) return;
      out.push({
        aumento: aum==='' ? null : parseFloat(aum),
        campoReal: parseCampo(campo),
        pupilaSalida: pup==='' ? null : parseFloat(pup),
        titulo: titulo,
        descripcion: descHtml,
        ocularId: ocuId,
        auxiliarId: auxId,
        imagenes: imagenes
      });
    });
    return out;
  }

  function validarEntradas(lista){
    for(var i=0;i<lista.length;i++){
      var e=lista[i], n=i+1;
      if(!(e.aumento>0)) return {ok:false, error:'Ocular '+n+': falta el aumento (un número mayor que 0).'};
      if(!(e.campoReal>0)) return {ok:false, error:'Ocular '+n+': el campo real no es válido (p. ej. 1º 10′, 1.17 ó 70′).'};
      if(textoPlano(e.descripcion)==='') return {ok:false, error:'Ocular '+n+': falta la descripción.'};
    }
    return {ok:true};
  }

  // ── SECCIÓN "EXPLORACIÓN" (síntesis/retos, sin datos de ocular) ──
  // Es una entrada especial: se envía como { esExploracion:true, titulo:
  // "<objeto>. Exploración", descripcion }, sin aumento/campo/pupila ni imágenes.
  var explDesc = $('explDesc'), explToolbar = $('explToolbar'), explNombre = $('explNombre');
  if(explToolbar && explDesc){
    try{ document.execCommand('defaultParagraphSeparator', false, 'p'); }catch(_e){}
    explToolbar.querySelectorAll('button').forEach(function(btn){
      btn.addEventListener('mousedown', function(ev){
        ev.preventDefault();
        var cmd=btn.getAttribute('data-cmd'), arg=btn.getAttribute('data-arg')||null;
        explDesc.focus();
        try{ document.execCommand(cmd,false,arg); }catch(_e){}
      });
    });
  }
  // Identificador corto del objeto para el título ("M1", "NGC 253"…).
  function objetoCorto(){
    if(resolved && resolved.tipo==='messier') return 'M'+resolved.num;
    return objInput.value.trim();
  }
  function actualizarExplNombre(){ if(explNombre) explNombre.textContent = objetoCorto() || 'objeto'; }
  function recogerExploracion(){
    if(!explDesc) return null;
    var html = explDesc.innerHTML.trim();
    if(textoPlano(html)==='') return null;
    return { esExploracion:true, titulo:(objetoCorto()||'')+'. Exploración', descripcion:html, imagenes:[] };
  }

  if(addEntryBtn){ addEntryBtn.addEventListener('click',function(){ crearEntrada(); }); }
  // En modo creación arrancamos con una entrada vacía lista para rellenar.
  if(!editandoId && entradasBox){ crearEntrada(); }

  // ═══════════════════════════════════════════════════════════════════════
  // ENVÍO: crea (POST) o modifica (PUT) según el modo
  // ═══════════════════════════════════════════════════════════════════════
  $('obsForm').addEventListener('submit',function(e){
    e.preventDefault();
    if(!lastComputed) return;

    // Reúne y valida las entradas por ocular antes de enviar.
    var entradas = recogerEntradas();
    var ve = validarEntradas(entradas);
    if(!ve.ok){
      $('outNote').innerHTML='<span style="color:var(--rojo)">✗ '+ve.error+'</span>';
      return;
    }
    // La Exploración (si tiene contenido) se antepone como primera entrada.
    var expl = recogerExploracion();
    var todas = expl ? [expl].concat(entradas) : entradas;
    var payload = Object.assign({}, lastComputed, { entradas: todas });

    // Siempre mostramos el bloque de datos: sirve de comprobante.
    jsonArea.value=JSON.stringify(payload,null,2);
    jsonOut.classList.add('show');

    if(!WP){
      $('outNote').textContent='Modo local: no hay conexión con WordPress, la observación no se ha guardado.';
      jsonOut.scrollIntoView({behavior:'smooth',block:'nearest'});
      return;
    }

    var editando = !!editandoId;
    var url      = editando ? (WP.endpoint + '/' + editandoId) : WP.endpoint;
    var metodo   = editando ? 'PUT' : 'POST';

    submitBtn.disabled=true;
    $('outNote').textContent = editando ? 'Guardando cambios…' : 'Guardando…';

    fetch(url,{
      method:metodo,
      credentials:'same-origin',          // envía la cookie de sesión
      headers:{
        'Content-Type':'application/json',
        'X-WP-Nonce':WP.nonce             // demuestra que la petición sale de esta página
      },
      body:JSON.stringify(payload)
    })
    .then(function(r){
      return r.json().then(function(data){ return {ok:r.ok, status:r.status, data:data}; });
    })
    .then(function(res){
      submitBtn.disabled=false;
      if(res.ok && res.data && res.data.ok){
        var txt = editando
          ? '✓ Cambios guardados en la observación nº ' + res.data.id + '.'
          : '✓ Observación guardada (registro nº ' + res.data.id + ').';
        // Si el objeto no se pudo colocar en el mapa (p. ej. SIMBAD no tiene su
        // distancia), se guarda igual pero se avisa para poder añadirlo a mano.
        if(res.data.aviso){
          txt += ' <span style="color:var(--ambar,#c88)">El objeto no se ha podido situar en el mapa automáticamente: ' + res.data.aviso + '</span>';
        }
        $('outNote').innerHTML='<span style="color:var(--verde)">'+txt+'</span>';
        return;
      }
      var msg=(res.data && res.data.message) ? res.data.message : 'Error '+res.status;
      if(res.status===401) msg='Debes iniciar sesión para registrar observaciones.';
      if(res.status===403) msg='Solo puedes modificar tus propias observaciones.';
      $('outNote').innerHTML='<span style="color:var(--rojo)">✗ '+msg+'</span>';
    })
    .catch(function(){
      submitBtn.disabled=false;
      $('outNote').innerHTML='<span style="color:var(--rojo)">✗ No se pudo contactar con el servidor.</span>';
    });

    jsonOut.scrollIntoView({behavior:'smooth',block:'nearest'});
  });

   }catch(err){
     // Si algo falla, lo decimos en la página en vez de morir en silencio.
     console.error('[Bitácora] Error al iniciar el formulario:', err);
     var aviso=document.getElementById('outNote');
     if(aviso){ aviso.textContent='Error al iniciar el formulario: '+err.message; }
   }
  } // fin de arrancar()

})();
