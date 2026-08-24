# Prerregistro de listones — métrica de rotura del núcleo Φ (ADR 0016)

Fecha: 2026-08-24.

Comprometido ANTES de escribir la métrica. Ningún listón de este documento se
retoca tras leer la salida: si un listón falla, la métrica se declara falsada
en ese punto y el informe señala el canal culpable; la corrección, si la hay,
es una iteración (b) con su propio prerregistro. **No hay vía de escape** en
esta iteración: no se tocan el render, `m_res`, `dmagCrowd` ni los anillos.

Fuente: `simulador_ocular/docs/adr/0016-la-rotura-del-nucleo-es-un-veredicto-sobre-el-canal-resuelto.md`,
`simulador_ocular/docs/adr/0015-textura/analisis_recuperable.md`,
`simulador_ocular/docs/experimentos/tres_modelos_mres.md`,
`simulador_ocular/docs/adr/0015-textura/prerregistro.md` (banco de casos reutilizado tal cual).

## 0. Formulación congelada

`Φ(r) = f_res(r) · N_res(r)^(1/4)`, evaluada por anillo sobre el catálogo de
estrellas dibujadas de la escena (ADR 0012, canal en producción, sin tocar):

- `N_res(r)`: estrellas del anillo con `m < m_res(r) + 0,75`. El 0,75 es
  `dmagCrowd`, invariante del modelo: no se ajusta.
- `f_res(r)`: F_dibujado/F_total del anillo (mismas estrellas del recuento).
- Exponente 1/4 fijo (Robson & Graham 1981, sumación espacial). No se ajusta.
- Anillos congelados: r/r_h 0,00–0,25 / 0,25–0,50 / 0,50–1,00 / 1,00–2,00
  (los del análisis radial ya existente; #98).
- El aumento entra solo por `m_lim,sky`. `m_crowd` sigue ciego a M.
- **Prohibido** que la métrica lea σ/RMS del campo SBF o cualquier magnitud
  del velo que no sea la que `m_res` ya usa.

## 1. Ancla de U

**M13, apertura 200 mm, SQM 21, aumento 120×: primera rotura del núcleo**
(observación propia, la misma del ADR 0015). U = Φ del anillo nuclear
(r/r_h 0,00–0,25) en esa escena. U se **lee** de la salida: no se elige, no se
redondea a un valor bonito, y ningún otro caso de este documento se usa para
moverlo. Todos los demás casos son predicción.

Comprobación de degeneración: si U sale 0 (ninguna estrella dibujada en el
anillo nuclear a 120×) o si Φ del ancla no es finito, el ancla es degenerada y
la métrica queda falsada antes de evaluar ningún listón.

## 2. Predicciones que pasan o falsean (no se retocan después)

Todas sobre M13, 200 mm, SQM 21, anillo nuclear r/r_h 0,00–0,25 salvo donde se
indique.

| # | Comprobación | Umbral |
|---|---|---|
| P1 | 61×, los 4 anillos | `Φ < U` en cada anillo |
| P2 | Progresión del anillo nuclear con el aumento | `Φ@120× < Φ@173× < Φ@250×` estricta |
| P3 | Halo (r/r_h 1,00–2,00) a 250× | `Φ < U` |

P1 falsea si cualquier anillo a 61× alcanza U. P2 falsea si la secuencia no es
estrictamente creciente (los empates falsean). P3 falsea si el halo alcanza U
al aumento más favorable del barrido.

## 3. Banco del 18″ (binario)

Mismos casos y citas que el prerregistro del 0015 (bitácora propia,
`resources/plugins/bitacora-registro/datos/observaciones-seed.json`, instrumento
`Stargate 18”`). Veredicto sobre el **núcleo** (anillo r/r_h 0,00–0,25). La
conversión es **binaria**: `Φ ≥ U` = roto, `Φ < U` = nebuloso; «moteado»
cuenta como roto (la primera rotura es exactamente lo que ancla U).

| Cúmulo | Aumento | Veredicto observado (núcleo) | Listón |
|---|---|---|---|
| M55 | 70× | moteado («se resuelven todas las estrellas, más complicado en el núcleo») | `Φ ≥ U` |
| M55 | 480× | resuelto («veo el núcleo perfectamente... con muchísimo detalle») | `Φ ≥ U` |
| M22 | 98× | resuelto («las estrellas además se resuelven perfectamente») | `Φ ≥ U` |
| M30 | 98× | moteado («se resuelven varias estrellas en su interior») | `Φ ≥ U` |
| **M62** | **70×–270× (todos los aumentos observados)** | **NO rompe: dividido/estructurado, nunca resuelto en estrellas** | **`Φ < U` en TODOS** |

M62 es el caso que la métrica tiene que saber decir que no: si `Φ ≥ U` en el
núcleo de M62 a cualquiera de esos aumentos, el listón falsea la métrica tanto
como si M55/M22/M30 no rompieran.

## 4. Ordinales sin constantes nuevas

Independientes de U (comparan Φ con Φ, no con el umbral):

- `Φ(M55, 480×) > Φ(M55, 70×)` — subir el aumento en el mismo cúmulo sube Φ.
- `Φ(M30, 98×) < Φ(M22, 98×)` — a igual aumento, el moteado queda por debajo
  del resuelto.

Cualquiera de las dos desigualdades invertida o empatada falsea.

## 5. Prohibiciones

- Ajustar Δ = 0,75, el exponente 1/4, los anillos o `m_res` para que un listón
  pase.
- Introducir un segundo parámetro libre o cualquier término nuevo en Φ.
- Usar σ/RMS del campo SBF en cualquier punto de la métrica.
- Tocar el render: el veredicto se emite sobre producción tal cual está.
- Retocar cualquier listón de §2–§4 después de ver la salida.

Si los listones no pasan, el entregable es el informe de fallo con el canal
culpable señalado (¿`m_lim,sky` no trae suficiente dependencia de M?
¿`f_res` satura? ¿N^(1/4) se queda corto?) y la iteración (b) se abre con su
propio prerregistro. Precedente: dos ejes de Gaia (ADR 0012 de listones) y la
propia textura (ADR 0015).

## 6. Alcance

Solo cúmulos globulares, solo diagnóstico: esta iteración no enciende, apaga
ni modifica nada visible. Si todo pasa, la conclusión registrada es que la
transición nebuloso→moteado→resuelto ya está en producción y Φ es el
instrumento que la mide.

## Estado

Ni una línea de código de la métrica escrita antes de este commit. Documento
cerrado: formulación, ancla, predicciones, banco del 18″ (con caso que no
rompe), ordinales y prohibiciones, todos prerregistrados.
