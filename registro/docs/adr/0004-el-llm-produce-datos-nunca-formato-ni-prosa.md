# 0004 · El LLM produce datos, nunca formato ni prosa

Fecha: 2026-08-25
Estado: aceptado

## Contexto

Los compañeros mandan sus noches por correo y en PDF. Digerir eso a mano no
escala, y un modelo de lenguaje lee un correo desordenado mucho mejor que
cualquier parser.

La tentación es pedirle el XML directamente. Un OAL correcto exige espacio de
nombres literal, `xsd:sequence` **ordenado**, `xsi:type` con el valor exacto de
una enumeración (`oal:deepSkyGX`, `oal:deepSkyDN`…), IDREFs que casen entre
bloques, instantes ISO con desfase y `<name>` con designación de catálogo. Un
modelo generando eso falla donde no se ve —un `xsi:type` inventado, un IDREF
huérfano, un `<end>` anterior al `<begin>`— y falla distinto cada vez.

Y el ADR 0003 ya decidió que el dialecto tiene **un solo escritor**. Un modelo
escribiendo XML sería el segundo.

## Decisión

**Entrada:** el modelo produce el **`estado`** —el JSON plano que la plantilla
ya maneja: observador, lugares, equipo, noches, observaciones— y se pega en una
caja de la plantilla (`<details>` plegado, para no estorbar a quien solo va a
rellenar el formulario). `xmlDe()` escribe el XML.

**Salida:** el correo lo escribe `textoDe(estado)`, determinista, en el mismo
motor. **Ninguna prosa generada.** Lo que sale con la firma del observador lo
redacta el observador.

Reglas del protocolo (`registro/protocolo-llm-oal.md`, que es a la vez el prompt
que se pega en el chat y la especificación que valida la caja de pegar):

- **Lo que el texto no dice, se omite.** Ni el ocular «probable», ni la hora
  «aproximada», ni el SQM «típico de esa base». Un hueco lo canta la plantilla en
  amarillo y lo rellena un humano; un dato inventado entra como verdad y ya no
  se distingue nunca.
- **El modelo no resuelve, no deduce y no calcula.** Las coordenadas y el tipo
  los pone Sesame; los aumentos, `aumentos()`; la noche, `nocheDe()`. Las tres
  son código probado, y las tres son sitios donde un modelo acierta *casi*
  siempre —que en una bitácora de quince años es peor que fallar siempre—.
- **La caja de pegar valida, no confía.** `JSON.parse`, nunca `eval`; campos
  desconocidos ignorados; tipos que no cuadran son avisos, no excepciones. El
  JSON llegará a veces con una frase de cortesía pegada delante.

Por ahora la herramienta es del administrador del sitio, no se reparte. El
documento avisa de que pegar el correo de un compañero en un chat envía a un
tercero su nombre, su dirección y las coordenadas de su casa.

## Alternativas descartadas

- **Que el LLM escriba el XML.** Cero piezas nuevas y un segundo escritor del
  dialecto, en el peor sitio posible: uno que no recuerda las reglas de ayer.
- **Una tabla intermedia (CSV, Markdown).** Una representación más que mantener,
  sin ninguna ventaja sobre el JSON que el formulario ya usa.
- **Llamar a la API desde el plugin.** Automático, y obliga a resolver el
  problema difícil —PDF a texto, en PHP, con una dependencia nueva— para luego
  pedirle al modelo el fácil. Los chats ya leen PDFs maquetados mejor que
  cualquier extractor que metamos en el servidor.
- **Que el LLM redacte la crónica del correo.** Un modelo reescribiendo una cifra
  que ya era correcta solo puede empeorarla. Y no es lo que el grupo quiere leer.

## Consecuencias

- **El dialecto sale correcto por construcción**: el modelo no puede equivocarse
  en algo que no escribe.
- **Las dos revisiones que ya existen siguen siendo las dos revisiones**: los
  avisos amarillos de la plantilla y la previa del importador. El protocolo
  alimenta la primera puerta en vez de abrir una tercera.
- **Corregir es editar un formulario, no editar XML.** Se ve lo que el modelo
  entendió del correo, en campos, antes de que nada entre en la bitácora.
- **El día que se reparta a los compañeros no hay que construir nada**, solo
  decirlo: la caja está, plegada.
