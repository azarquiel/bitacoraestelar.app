# Informe E4 — barrido de niveles y veredicto del eje 2 (ADR 0012)

**Veredicto del eje 2: NO PASA — el teselado queda descartado por el preregistro.**

Medido el 2026-08-18/19 contra `tapvizier.cds.unistra.fr`. Adquisición celda a celda por
rango de `source_id`, sin `ORDER BY`, a la profundidad que cada campo necesita (corte de
E1 + 0,5). Enumeración de celdas: círculo de 0,89° ampliado 0,9′ (borde borroso de E2),
muestreo fino (lado/32 — con lado/8 se perdía una celda tangente y 2/3871 estrellas).
Arnés: `scripts/harness_gaia_e4_barrido.js`. Crudos: `scripts/salida_gaia_e4_*.json`.

## Resultados (nivel 6, una repetición por celda)

| Campo | Celdas n6 (n7) | Frío | ×control | MB | Caliente (node) | Equivalencia |
|---|---|---|---|---|---|---|
| M7 (G≤16) | 9 (21) | 37,4 s | 2,39× | 18,2 | 203 ms | 0/40000 |
| M6 (G≤18) | 8 (20) | 16,8 s | 4,07× | 20,4 | 162 ms | 0/40000 |
| Cygnus (G≤19,5) | 9 (23) | 5,3 s | 2,24× | 11,9 | 194 ms | 0/40000 |
| M13 (G≤20) | 9 (21) | 4,5 s | 2,12× | 4,6 | 148 ms | 0/40000 |
| Virgo (G≤20) | 8 (22) | 3,1 s | 2,31× | 0,9 | 17 ms | 0/4435 |
| Polo N (G≤20) | 7 (19) | 2,3 s | 1,86× | 0,7 | 23 ms | 0/3871 |

Escalera de profundidad (celda n6 que contiene M7): G≤16 = 2,2 s / 2,2 MB;
G≤18 = 2,9 s / 11,6 MB; G≤20 = 5,3 s / **500 000 filas con TOP recortado / 35 MB**.

## Contra los listones preregistrados

- **Equivalencia 100 %: PASA.** Reconstrucción (unión → recorte por RA/Dec → TOP 40000)
  idéntica a producción, estrella a estrella, en los 6 campos. La mecánica entera
  (rango de source_id, margen del borde borroso, recorte local) es correcta.
- **Celdas por campo: PASA en nivel 6** (7-9 ≤ 9). Nivel 7 muere (19-23 > 16) y nivel 5
  murió por aritmética (celda de bulbo ~3,7 M filas). Nivel 6 era el único candidato.
- **Tamaño por celda: PASA como diagnóstico** a las profundidades de trabajo (máx.
  5,9 MB), pero la celda de bulbo a G≤20 (35 MB, TOP recortado) demuestra que la
  profundidad monotónica por celda no es opcional: es obligatoria.
- **Reconstrucción caliente: NO PASA de momento** (148-203 ms en los campos de 40 000
  contra listón de ≤100 ms mediana), medida en node sin optimizar; no llega a juzgarse
  en el navegador porque el eje cae antes por el frío.
- **Frío absoluto: NO PASA, y en los 6 campos.** Mediana 2,27× el control (listón ≤1,5×),
  peor caso 4,07× (listón ≤2×). Adquirir 7-9 celdas secuenciales — VizieR serializa por
  IP — cuesta sistemáticamente el doble o más que la consulta única de producción, aun
  sin ORDER BY y con menos profundidad.

El ADR 0012 exige las seis condiciones **simultáneas**. El frío incumple en los 6 de 6
campos; el listón existía justo para esto y moverlo ahora invalidaría el estudio. No se
ejecutan E5 (cargas sintéticas) ni E6 (reconstrucción en navegador): con una condición
obligatoria caída, medir las demás sería pescar un pretexto.

## Conclusión del estudio (criterio de éxito del preregistro)

> **La estrategia de caché espacial no merece la pena y debemos mantener el diseño
> actual.** El eje 1 (COUNT previo) tampoco pasó. Ambos veredictos son con medidas, no
> con opiniones, y el diseño actual queda revalidado: consulta única por campo con
> `ORDER BY + TOP` y caché por campo cuantizado en el proxy.

Lo que el estudio deja de valor, medido y reutilizable:

1. **El rango de `source_id` está indexado y las consultas sin `ORDER BY` son baratas
   por fila** (199 k filas en 2 s). Si algún día VizieR deja de serializar por IP, o si
   la adquisición se hace en un precalentado nocturno donde el frío no importa, el
   teselado vuelve a ser candidato — con E5 como primera medida pendiente.
2. **La partición por source_id es exacta pero su borde geométrico difunde ~1 %**
   (época de asignación): cualquier uso futuro necesita el margen de 0,9′ + recorte
   por coordenadas. Verificado con equivalencia 0 faltantes en 6 campos.
3. **La escalera de profundidad** confirma que la profundidad es la palanca dominante
   del coste (2,2 → 35 MB entre G16 y G20 en el bulbo), coherente con E1 y con la
   memoria del ORDER BY.
4. La palanca de producto que sigue viva e intacta es el **recorte de la cola de glow**
   (PR #78): no era parte de este estudio y no ha sido tocada.
