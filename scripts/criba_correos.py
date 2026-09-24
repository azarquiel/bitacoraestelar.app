#!/usr/bin/env python3
"""Criba y puntúa en local los reportes de observación de un mbox (#379).

Lee un mbox exportado de Google Takeout, se queda con los correos que nombran
algún objeto (M, NGC, IC) y puntúa cada uno según lo que aporta a tres
preguntas de la épica #337:

  p379  validar H2c con galaxias: hacen falta apertura, aumentos y SQM; pesan
        más el «no lo vi» y la visión lateral (escasos, los únicos que pueden
        falsar) y los cielos y aumentos distintos de los de las 12 de campo.
  p342  límite estelar con pupila de salida pequeña (el dato de campo que pide
        el prerregistro de #341 para reabrir el corte de Crumey).
  p113  globulares, para el held-out de Φ″.

La puntuación ordena por COMPLETITUD y ESCASEZ, nunca por el margen predicho
de H2c: calcular márgenes antes del prerregistro de #379 es el amaño que el
prerregistro existe para evitar. Nada sale de esta máquina.

Escribe dos ficheros junto al mbox (nunca dentro del repo):

  reportes_privado.csv  con remitente, asunto y fecha, para buscar el correo
                        y leerlo entero.
  reportes_anonimo.csv  sin ellos. El observador es un seudónimo (obs-01…) y
                        el texto va sin cabeceras, citas, direcciones, URLs,
                        teléfonos ni firma. Los NOMBRES dentro del texto no se
                        quitan: revísalo antes de compartirlo.

Las dos filas de un mismo correo comparten `id`.

  python3 scripts/criba_correos.py ~/bitacora-correos/reportes.mbox --yo TU@CORREO
  python3 scripts/criba_correos.py --autotest
"""
import argparse, csv, email, email.policy, hashlib, html, mailbox, os, re, sys, tempfile
from email.utils import parseaddr, parsedate_to_datetime

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ponytail: pesos a ojo para ORDENAR la lectura, no para juzgar la ley. Se
# pueden retocar tras la primera pasada porque no miran ningún margen.
PESOS = {
    'apertura': 2, 'aumentos': 2, 'sqm': 3, 'completo': 3, 'galaxia_catalogo': 3,
    'no_visto': 4, 'lateral': 3, 'aumento_nuevo': 1, 'cielo_nuevo': 2, 'observador_ajeno': 1,
    'limite_estelar': 3, 'apertura_pequena': 1, 'pupila_pequena': 3,
    'globular': 3,
}
# Messier globulares (catálogo cerrado).
GLOBULARES_M = {2, 3, 4, 5, 9, 10, 12, 13, 14, 15, 19, 22, 28, 30, 53, 54, 55, 56, 62,
                68, 69, 70, 71, 72, 75, 79, 80, 92, 107}


def cargar_catalogos():
    """Nombres de BITACORA_GALAXIAS y tabla Messier→NGC/IC, leídos del repo."""
    with open(os.path.join(RAIZ, 'simulador_ocular/resources/js/galaxias-datos.js'), encoding='utf-8') as f:
        galaxias = set(re.findall(r'^\s*\["([^"]+)"', f.read(), re.M))
    with open(os.path.join(RAIZ, 'resources/js/bitacora-base.js'), encoding='utf-8') as f:
        base = f.read()
    messier = {}
    for cat in ('NGC', 'IC'):
        bloque = re.search(r'var MESSIER_%s = \{(.*?)\};' % cat, base, re.S).group(1)
        for num, m in re.findall(r'(\d+):\s*(\d+)', bloque):
            messier[int(m)] = '%s %d' % (cat, int(num))
    return galaxias, messier


# ── Texto del correo ─────────────────────────────────────────────────────────
MARCA_REENVIO = re.compile(r'^-{3,}\s*(Forwarded message|Mensaje reenviado)\s*-{3,}\s*$', re.I | re.M)
CORTE_CITA = re.compile(r'^(El|On)\b.{0,250}(escribió|wrote)\s*:\s*$|^-{3,}\s*(Original Message|Mensaje original)', re.I | re.M)
MAX_LINEAS_FIRMA = 8
FIRMA = re.compile(r'^(--\s*$|un saludo|saludos|un abrazo|abrazos|enviado desde|sent from)', re.I | re.M)


def texto_de(msg):
    plano, htm = [], []
    for p in msg.walk():
        if p.is_multipart() or p.get_content_disposition() == 'attachment':
            continue
        try:
            t = p.get_content()
        except (LookupError, UnicodeError, AssertionError):
            t = (p.get_payload(decode=True) or b'').decode('utf-8', 'replace')
        if not isinstance(t, str):
            continue
        if p.get_content_type() == 'text/plain':
            plano.append(t)
        elif p.get_content_type() == 'text/html':
            t = re.sub(r'<(br|/p|/div|/li)\b[^>]*>', '\n', t, flags=re.I)
            htm.append(html.unescape(re.sub(r'<[^>]+>', '', t)))
    return '\n'.join(plano or htm)


def autor_y_cuerpo(msg):
    """Remitente y cuerpo útil. Si es un reenvío, el autor es el del bloque
    reenviado; si es una respuesta, se corta la parte citada."""
    texto = texto_de(msg)
    autor = parseaddr(msg.get('From', ''))[1].lower()
    reenviado = False
    m = MARCA_REENVIO.search(texto)
    if m:
        texto = texto[m.end():]
        de = re.search(r'^(De|From)\s*:\s*(.+)$', texto, re.M)
        if de:
            dir_ = parseaddr(de.group(2))[1] or (re.findall(r'[\w.+-]+@[\w-]+\.[\w.-]+', de.group(2)) or [''])[0]
            if dir_:
                autor, reenviado = dir_.lower(), True
        # quita el bloque de cabeceras del reenvío (hasta la primera línea en blanco)
        texto = re.split(r'\n\s*\n', texto, maxsplit=1)[-1]
    c = CORTE_CITA.search(texto)
    if c:
        texto = texto[:c.start()]
    texto = '\n'.join(l for l in texto.splitlines() if not l.lstrip().startswith('>'))
    return autor, reenviado, texto.strip()


def telefono(m):
    """Solo 9 cifras o más: una fecha (14-08-2021, 2021 08 14) tiene 8."""
    return '[teléfono]' if sum(c.isdigit() for c in m.group(0)) >= 9 else m.group(0)


def anonimizar(texto):
    # La firma es la ÚLTIMA despedida con poco detrás. Cortar en la primera
    # borraba crónicas enteras que empiezan por «Saludos a todos».
    for f in reversed(list(FIRMA.finditer(texto))):
        if len([l for l in texto[f.start():].splitlines() if l.strip()]) <= MAX_LINEAS_FIRMA:
            texto = texto[:f.start()]
            break
    texto = re.sub(r'[\w.+-]+@[\w-]+\.[\w.-]+', '[correo]', texto)
    texto = re.sub(r'https?://\S+|www\.\S+', '[url]', texto)
    texto = re.sub(r'(?<!\d)\+?\d[\d \-]{7,}\d(?!\d)', telefono, texto)
    return re.sub(r'\n{3,}', '\n\n', texto).strip()


# ── Detección ────────────────────────────────────────────────────────────────
def num(s):
    return float(s.replace(',', '.'))


def detectar(texto, galaxias, messier):
    d = {}
    objs = []
    for m in re.finditer(r'\b(?:M|Messier)\s?(\d{1,3})\b', texto):
        if 1 <= int(m.group(1)) <= 110:
            objs.append('M%d' % int(m.group(1)))
    for cat, n in re.findall(r'\b(NGC|IC)\s?0*(\d{1,4})\b', texto, re.I):
        objs.append('%s %d' % (cat.upper(), int(n)))
    d['objetos'] = list(dict.fromkeys(objs))
    canon = [messier.get(int(o[1:]), o) if o.startswith('M') else o for o in d['objetos']]
    d['galaxias'] = sorted({c for c in canon if c in galaxias})
    d['globular'] = any(o.startswith('M') and int(o[1:]) in GLOBULARES_M for o in d['objetos']) \
        or bool(re.search(r'globular', texto, re.I))

    ap = [int(x) for x in re.findall(r'\b(\d{2,4})\s?mm\b', texto) if 60 <= int(x) <= 1000]
    ap += [round(num(x) * 25.4) for x in re.findall(
        r'\b(\d{1,2}(?:[.,]\d)?)\s?(?:"|”|″|\'\'|pulgadas|pulg\b|inch(?:es)?\b)', texto, re.I)
        if 3 <= num(x) <= 30]
    d['aperturas_mm'] = sorted(set(ap))
    d['aumentos'] = sorted({int(x) for x in re.findall(
        r'\b(\d{2,3})\s?(?:x|×|aumentos|aum\.?)(?![a-z])', texto, re.I) if 10 <= int(x) <= 800})
    sqm = set()
    for m in re.finditer(r'sqm|mag\s*/\s*arcsec|mag/arcs|magnitudes por segundo', texto, re.I):
        ventana = texto[max(0, m.start() - 40): m.end() + 40]
        sqm.update(num(x) for x in re.findall(r'(?<![\d.,])((?:1[6-9]|2[0-2])[.,]\d{1,2})(?![\d])', ventana))
    d['sqm'] = sorted(sqm)
    d['no_visto'] = bool(re.search(
        r'no (lo |la )?(vi|veo|he visto|pude ver|logr[eé]|consegu[ií])|ni rastro|sin [ée]xito|invisible|no se ve[ií]?a?\b|not seen|no detect', texto, re.I))
    d['lateral'] = bool(re.search(
        r'visi[oó]n (lateral|desviada|perif[eé]rica|indirecta)|lateralmente|de reojo|averted', texto, re.I))
    d['limite_estelar'] = bool(re.search(
        r'magnitud l[ií]mite|mag\.? ?l[ií]m|estrellas? de (la )?(magnitud|mag\.?) ?1[0-7]|llegu[eé] (a|hasta) (la )?(magnitud |mag\.? ?)?1[0-7]|limiting mag', texto, re.I))
    d['pupila_mm'] = round(d['aperturas_mm'][0] / d['aumentos'][0], 2) \
        if len(d['aperturas_mm']) == 1 and len(d['aumentos']) == 1 else ''
    return d


def puntuar(d, ajeno):
    P, des = PESOS, []

    def suma(clave, cond):
        if cond:
            des.append(clave)
            return P[clave]
        return 0
    completo = bool(d['aperturas_mm'] and d['aumentos'] and d['sqm'])
    p379 = (suma('apertura', d['aperturas_mm']) + suma('aumentos', d['aumentos']) + suma('sqm', d['sqm'])
            + suma('completo', completo) + suma('galaxia_catalogo', d['galaxias'])
            + suma('no_visto', d['no_visto']) + suma('lateral', d['lateral'])
            + suma('aumento_nuevo', any(not 150 <= a <= 165 for a in d['aumentos']))
            + suma('cielo_nuevo', any(not 21.0 <= s <= 21.6 for s in d['sqm']))
            + suma('observador_ajeno', ajeno))
    p342 = (suma('limite_estelar', d['limite_estelar'])
            + suma('apertura_pequena', any(a <= 250 for a in d['aperturas_mm']))
            + suma('pupila_pequena', d['pupila_mm'] != '' and d['pupila_mm'] < 1.5))
    p113 = suma('globular', d['globular'])
    return p379, p342, p113, ' '.join(dict.fromkeys(des))


# ── Proceso ──────────────────────────────────────────────────────────────────
COMUNES = ['id', 'p379', 'p342', 'p113', 'desglose', 'objetos', 'galaxias_catalogo',
           'aperturas_mm', 'aumentos', 'sqm', 'pupila_mm', 'no_visto', 'lateral',
           'limite_estelar', 'globular', 'copias']
# Un reenvío con una línea añadida o un párrafo retocado es la misma crónica.
UMBRAL_COPIA = 0.6


def tejas(texto):
    p = re.findall(r'\w+', texto.lower())
    return {tuple(p[i:i + 5]) for i in range(max(1, len(p) - 4))}


def parecido(a, b):
    return len(a & b) / len(a | b) if a and b else 0.0


def criba(ruta_mbox, yo, dir_salida):
    dir_salida = os.path.realpath(dir_salida)
    if dir_salida == RAIZ or dir_salida.startswith(RAIZ + os.sep):
        sys.exit('La salida no puede ir dentro del repo: lleva datos personales.')
    galaxias, messier = cargar_catalogos()
    caja = mailbox.mbox(ruta_mbox, factory=lambda f: email.message_from_binary_file(f, policy=email.policy.default),
                        create=False)
    filas, vistos, seudonimo = [], set(), {}
    total = sin_objeto = duplicados = casi = 0
    for msg in caja:
        total += 1
        autor, reenviado, cuerpo = autor_y_cuerpo(msg)
        huella = hashlib.sha1(re.sub(r'\s+', ' ', cuerpo.lower()).encode()).hexdigest()[:10]
        if huella in vistos:
            duplicados += 1
            continue
        d = detectar(cuerpo, galaxias, messier)
        if not d['objetos']:
            sin_objeto += 1
            continue
        vistos.add(huella)
        p379, p342, p113, des = puntuar(d, bool(yo) and autor != yo)
        try:
            fecha = parsedate_to_datetime(msg.get('Date')).strftime('%Y-%m-%d %H:%M')
        except (TypeError, ValueError):
            fecha = ''
        seudonimo.setdefault(autor, 'obs-%02d' % (len(seudonimo) + 1))
        lista = lambda v: ' '.join(str(x) for x in v)
        comun = {'id': huella, 'p379': p379, 'p342': p342, 'p113': p113, 'desglose': des,
                 'objetos': lista(d['objetos']), 'galaxias_catalogo': lista(d['galaxias']),
                 'aperturas_mm': lista(d['aperturas_mm']), 'aumentos': lista(d['aumentos']),
                 'sqm': lista(d['sqm']), 'pupila_mm': d['pupila_mm'],
                 'no_visto': int(d['no_visto']), 'lateral': int(d['lateral']),
                 'limite_estelar': int(d['limite_estelar']), 'globular': int(d['globular'])}
        filas.append((comun,
                      {'remitente': autor, 'reenviado': int(reenviado), 'asunto': str(msg.get('Subject', '')),
                       'fecha': fecha},
                      {'observador': seudonimo[autor], 'texto': anonimizar(cuerpo)},
                      tejas(cuerpo)))
    # La copia que más puntúa primero: es la que se queda al fundir las casi iguales.
    filas.sort(key=lambda f: (-f[0]['p379'], -f[0]['p342'], -f[0]['p113'], -len(f[2]['texto'])))
    unicas = []
    for f in filas:
        orig = next((u for u in unicas if parecido(u[3], f[3]) >= UMBRAL_COPIA), None)
        if orig:
            orig[0]['copias'] += 1
            casi += 1
        else:
            f[0]['copias'] = 0
            unicas.append(f)
    filas = unicas

    privado = os.path.join(dir_salida, 'reportes_privado.csv')
    anonimo = os.path.join(dir_salida, 'reportes_anonimo.csv')
    for ruta, extra, campos in ((privado, 1, COMUNES + ['remitente', 'reenviado', 'asunto', 'fecha']),
                                (anonimo, 2, COMUNES + ['observador', 'texto'])):
        # «;» y BOM: Excel en español lo abre en columnas sin asistente.
        with open(ruta, 'w', newline='', encoding='utf-8-sig') as f:
            w = csv.DictWriter(f, fieldnames=campos, delimiter=';')
            w.writeheader()
            for fila in filas:
                w.writerow({**fila[0], **fila[extra]})
    completos = sum(1 for f in filas if 'completo' in f[0]['desglose'])
    print('%d correos · %d duplicados · %d casi duplicados · %d sin objeto · %d reportes '
          '(%d con apertura+aumentos+SQM) · %d observadores'
          % (total, duplicados, casi, sin_objeto, len(filas), completos, len({f[1]['remitente'] for f in filas})))
    print(privado)
    print(anonimo)
    return filas


# ── Autotest ─────────────────────────────────────────────────────────────────
def autotest():
    fallos = []

    def ok(cond, que):
        print('  ' + ('ok   ' if cond else 'FALLO') + ' ' + que)
        if not cond:
            fallos.append(que)

    def correo(de, asunto, cuerpo, fecha='Sat, 14 Aug 2021 23:40:00 +0200'):
        m = email.message.EmailMessage()
        m['From'], m['To'], m['Subject'], m['Date'] = de, 'yo@ejemplo.es', asunto, fecha
        m.set_content(cuerpo)
        return m

    completo = ('Noche en Soria. Dobson de 300 mm a 180x, SQM 21,85.\n'
                'M101 no lo vi, NGC 5474 solo con visión lateral.\n\nUn saludo,\nPepe 600 123 456\n')
    with tempfile.TemporaryDirectory() as tmp:
        caja = mailbox.mbox(os.path.join(tmp, 'p.mbox'))
        caja.add(correo('Pepe <pepe@ejemplo.es>', 'Crónica sábado', completo))
        caja.add(correo('Pepe <pepe@ejemplo.es>', 'Re: Crónica sábado', completo))       # duplicado
        caja.add(correo('Yo <yo@ejemplo.es>', 'Fwd: M13 con el 8"',
                        'Mira esto\n\n---------- Forwarded message ---------\n'
                        'De: Ana <ana@ejemplo.es>\nDate: 1 sept 2021\nSubject: M13\n\n'
                        'Con el 8" a 250 aumentos M13 se resuelve; magnitud límite 14,5.\n'
                        '> texto citado con NGC 1 que no debe contar\n'))
        caja.add(correo('Tienda <ofertas@tienda.es>', 'Rebajas', 'Oculares a mitad de precio.'))
        caja.add(correo('Luis <luis@ejemplo.es>', 'Re: M33',
                        'M33 se veía bien con 450 mm.\n\nEl lun, 2 ago 2021, Pepe <pepe@ejemplo.es> escribió:\n'
                        'M101 no lo vi\n'))
        cronica_eva = ('Saludos a todos\n\nNoche del 14-08-2021 con el refractor de 130 mm.\n'
                       'NGC 2683 a 215x con visión lateral, SQM 21,2. Después NGC 2903 a 150x.\n'
                       'Seeing regular, algo de viento hacia la una.\n\nUn abrazo\nEva\n')
        caja.add(correo('Eva <eva@ejemplo.es>', 'Crónica NGC 2683', cronica_eva))
        caja.add(correo('Eva <eva@ejemplo.es>', 'Crónica NGC 2683 (corregida)',
                        cronica_eva.replace('Seeing regular', 'Seeing regular, 3/5')))    # casi duplicado
        caja.close()
        filas = criba(os.path.join(tmp, 'p.mbox'), 'yo@ejemplo.es', tmp)
        por_rem = {f[1]['remitente']: f for f in filas}
        ok(len(filas) == 4, 'deduplica, funde la casi copia y descarta el correo sin objeto (4 reportes)')
        ok(filas[0][1]['remitente'] == 'pepe@ejemplo.es', 'el reporte completo con «no lo vi» va primero')
        p = por_rem['pepe@ejemplo.es'][0]
        ok(p['aperturas_mm'] == '300' and p['aumentos'] == '180' and p['sqm'] == '21.85',
           'apertura, aumentos y SQM (coma decimal)')
        ok(p['no_visto'] == 1 and p['lateral'] == 1, 'no visto y lateral')
        ok(p['galaxias_catalogo'] == 'NGC 5457 NGC 5474', 'M101 pasa a NGC 5457 por la tabla Messier del repo')
        ok('completo' in p['desglose'] and 'cielo_nuevo' in p['desglose'] and 'aumento_nuevo' in p['desglose'],
           'desglose con completo, cielo nuevo y aumento nuevo')
        a = por_rem.get('ana@ejemplo.es')
        ok(a is not None and a[1]['reenviado'] == 1, 'el reenvío se atribuye a la autora del bloque reenviado')
        ok(a and a[0]['aperturas_mm'] == '203' and a[0]['limite_estelar'] == 1 and a[0]['globular'] == 1
           and a[0]['p342'] > 0 and a[0]['p113'] > 0, '8" = 203 mm, límite estelar y globular')
        ok(a and 'NGC 1' not in a[0]['objetos'], 'las líneas citadas con > no cuentan')
        ok(por_rem['luis@ejemplo.es'][0]['no_visto'] == 0, 'la cita de una respuesta («escribió:») se corta')
        with open(os.path.join(tmp, 'reportes_anonimo.csv'), encoding='utf-8') as f:
            anon = f.read()
        ok('@' not in anon and 'Crónica' not in anon and '600 123 456' not in anon and 'Pepe' not in anon,
           'el anónimo no lleva correos, asuntos, teléfonos ni firma')
        ok('obs-01' in anon, 'seudónimo de observador')
        e = por_rem.get('eva@ejemplo.es')
        ok(e is not None and e[0]['copias'] == 1, 'la versión corregida se funde con la original (copias = 1)')
        ok(e and 'NGC 2683 a 215x' in e[2]['texto'] and 'Eva' not in e[2]['texto'],
           'una crónica que empieza por «Saludos» no se pierde; la firma final sí se corta')
        ok(e and '14-08-2021' in e[2]['texto'], 'una fecha no se toma por teléfono')
        ok(anon.splitlines()[0].count(';') > 5, 'separador «;» para Excel en español')
        with open(os.path.join(tmp, 'reportes_privado.csv'), encoding='utf-8') as f:
            priv = f.read()
        ok('pepe@ejemplo.es' in priv and 'Crónica sábado' in priv and '2021-08-14 23:40' in priv,
           'el privado lleva remitente, asunto y fecha')
    try:
        criba(os.devnull, None, RAIZ)
        ok(False, 'rechaza escribir dentro del repo')
    except SystemExit:
        ok(True, 'rechaza escribir dentro del repo')
    print('\n' + ('Todo correcto' if not fallos else '%d fallo(s)' % len(fallos)))
    return 1 if fallos else 0


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('mbox', nargs='?')
    ap.add_argument('--yo', help='tu dirección: tus propios reportes no suman «observador ajeno»')
    ap.add_argument('--salida', help='carpeta de salida (por defecto, la del mbox)')
    ap.add_argument('--autotest', action='store_true')
    a = ap.parse_args()
    if a.autotest:
        sys.exit(autotest())
    if not a.mbox:
        ap.error('falta la ruta del mbox')
    ruta = os.path.expanduser(a.mbox)
    criba(ruta, (a.yo or '').lower() or None, os.path.expanduser(a.salida) if a.salida else os.path.dirname(os.path.abspath(ruta)))
