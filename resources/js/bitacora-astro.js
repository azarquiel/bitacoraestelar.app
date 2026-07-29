/* ============================================================================
   bitacora-astro.js — ASTROMETRÍA DE LA SESIÓN (algoritmos de Meeus)
   Proyecto: Bitácora Estelar

   Fuente única de la altura y el azimut que se registran de una observación:
   los del objeto, los del Sol y los de la Luna, para una base (lat/lon/huso) y
   un instante de hora local. Sin DOM ni WordPress. Misma forma que
   bitacora-equipo.js y bitacora-gaia-color.js: global de navegador
   (window.BitacoraAstro) + module.exports para el test de node
   (scripts/test_astro.js).

   Antes vivía duplicado —byte a byte— en bitacora-formulario.js y en
   bitacora-ficha.js, y las dos copias YA habían divergido: el formulario
   refractaba el Sol y la Luna y la ficha no, así que el número que sembraba el
   registro no era el que guardaba la ficha al abrirla.

   Interfaz:
     posiciones({ fechaHoraLocal, tz, lat, lon, ra, dec }) -> null | {
       utc:    instante en ISO (el que se guarda como fecha_hora_utc),
       objeto: { alt, az },   alt CON refracción: la altura a la que se vio
       sol:    { alt, az },   alt GEOMÉTRICA (ver más abajo)
       luna:   { alt, az }    alt GEOMÉTRICA
     }
     Devuelve null si falta cualquier dato imprescindible (sin base, sin fecha o
     sin coordenadas del objeto): el llamador no tiene que validar nada más.

   Convención de refracción (decidida el 29-07-2026, era la de la ficha):
   solo el OBJETO lleva refracción, porque su altura describe lo que el
   observador vio de verdad. El Sol y la Luna salen geométricos porque los
   umbrales de crepúsculo (−6°, −12°, −18°) se definen sobre la altura
   geométrica del centro del Sol; refractarla adelantaría la noche astronómica
   ~0,5° cerca del horizonte.

   Argumentos:
     fechaHoraLocal  'YYYY-MM-DDTHH:MM'  hora de PARED en la base
     tz              zona IANA de la base ('Europe/Madrid'); vacía = UTC
     lat, lon        grados, lon positiva al ESTE
     ra, dec         grados (J2000)
   ============================================================================ */

(function () {
  'use strict';

  var D2R = Math.PI / 180, R2D = 180 / Math.PI;
  function rev(x) { return ((x % 360) + 360) % 360; }

  function num(v) {
    if (v == null || v === '') return null;
    var n = (typeof v === 'string') ? parseFloat(v.replace(',', '.')) : Number(v);
    return isFinite(n) ? n : null;
  }

  function julianDay(date) { // date = objeto Date (en UTC)
    var Y = date.getUTCFullYear(), M = date.getUTCMonth() + 1,
        D = date.getUTCDate() + (date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600) / 24;
    if (M <= 2) { Y -= 1; M += 12; }
    var A = Math.floor(Y / 100), B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1)) + D + B - 1524.5;
  }

  function sunPos(jd) {
    var T = (jd - 2451545) / 36525;
    var L0 = rev(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
    var M = rev(357.52911 + 35999.05029 * T - 0.0001537 * T * T) * D2R;
    var C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) + (0.019993 - 0.000101 * T) * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
    var tl = (L0 + C) * D2R, eps = (23.439291 - 0.0130042 * T) * D2R;
    return { ra: rev(Math.atan2(Math.cos(eps) * Math.sin(tl), Math.cos(tl)) * R2D),
             dec: Math.asin(Math.sin(eps) * Math.sin(tl)) * R2D };
  }

  function moonPos(jd) {
    var T = (jd - 2451545) / 36525;
    var Lp = rev(218.3164477 + 481267.88123421 * T),
        D = rev(297.8501921 + 445267.1114034 * T) * D2R,
        M = rev(357.5291092 + 35999.0502909 * T) * D2R,
        Mp = rev(134.9633964 + 477198.8675055 * T) * D2R,
        F = rev(93.272095 + 483202.0175233 * T) * D2R;
    var lon = Lp + (6.288774 * Math.sin(Mp) + 1.274027 * Math.sin(2 * D - Mp) + 0.658314 * Math.sin(2 * D)
              + 0.213618 * Math.sin(2 * Mp) - 0.185116 * Math.sin(M) - 0.114332 * Math.sin(2 * F));
    var lat = (5.128122 * Math.sin(F) + 0.280602 * Math.sin(Mp + F) + 0.277693 * Math.sin(Mp - F)
              + 0.173237 * Math.sin(2 * D - F) + 0.055413 * Math.sin(2 * D + F - Mp));
    lon = rev(lon) * D2R; lat = lat * D2R; var eps = (23.439291 - 0.0130042 * T) * D2R;
    return { ra: rev(Math.atan2(Math.sin(lon) * Math.cos(eps) - Math.tan(lat) * Math.sin(eps), Math.cos(lon)) * R2D),
             dec: Math.asin(Math.sin(lat) * Math.cos(eps) + Math.cos(lat) * Math.sin(eps) * Math.sin(lon)) * R2D };
  }

  function gmst(jd) {
    var T = (jd - 2451545) / 36525;
    return rev(280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * T * T - T * T * T / 38710000);
  }

  // Devuelve {alt, az} en grados. az medido desde el Norte hacia el Este.
  function altAz(ra, dec, jd, lat, lon) {
    var lst = rev(gmst(jd) + lon), H = rev(lst - ra) * D2R;
    var la = lat * D2R, de = dec * D2R;
    var alt = Math.asin(Math.sin(la) * Math.sin(de) + Math.cos(la) * Math.cos(de) * Math.cos(H));
    var az = Math.atan2(-Math.cos(de) * Math.sin(H), Math.sin(de) * Math.cos(la) - Math.cos(de) * Math.sin(la) * Math.cos(H));
    return { alt: alt * R2D, az: rev(az * R2D) };
  }

  // Refracción atmosférica aproximada (Bennett) para altitudes ≳ -1°
  function refract(alt) {
    if (alt < -1) return alt;
    return alt + (1 / 60) * (1.02 / Math.tan((alt + 10.3 / (alt + 5.11)) * D2R));
  }

  /* ── Zona horaria: hora local de la base → instante UTC ──
     Sin librería: se formatea un instante UTC en la TZ IANA de la base y se mide
     el desfase. Una pasada basta (el error en el borde de horario de verano es de
     segundos, irrelevante para alt/az). tz vacía = se interpreta como UTC. */
  function offsetMsTz(tz, utcMs) {
    try {
      var dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      var p = dtf.formatToParts(new Date(utcMs)).reduce(function (a, x) { a[x.type] = x.value; return a; }, {});
      var comoUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
      return comoUtc - utcMs;
    } catch (_e) { return 0; }
  }

  // 'YYYY-MM-DDTHH:MM' (hora de pared en tz) -> Date, o null si no se entiende.
  function localAUtc(fechaHoraLocal, tz) {
    var m = String(fechaHoraLocal || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return null;
    var guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    if (!tz) return new Date(guess);
    return new Date(guess - offsetMsTz(tz, guess));
  }

  function posiciones(o) {
    o = o || {};
    var lat = num(o.lat), lon = num(o.lon), ra = num(o.ra), dec = num(o.dec);
    if (lat == null || lon == null || ra == null || dec == null) return null;
    var fecha = localAUtc(o.fechaHoraLocal, o.tz || '');
    if (!fecha || isNaN(fecha.getTime())) return null;

    var jd = julianDay(fecha);
    var obj = altAz(ra, dec, jd, lat, lon);
    var s = sunPos(jd), sol = altAz(s.ra, s.dec, jd, lat, lon);
    var m = moonPos(jd), luna = altAz(m.ra, m.dec, jd, lat, lon);

    return {
      utc: fecha.toISOString(),
      objeto: { alt: refract(obj.alt), az: obj.az },
      sol: sol,
      luna: luna
    };
  }

  var API = { posiciones: posiciones };

  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
  if (typeof window !== 'undefined') { window.BitacoraAstro = API; }
})();
