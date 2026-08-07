# frontend — Consolidador Previred

React + Vite. Aplicación 100 % cliente: no hay backend, no se sube ningún archivo y no se
guarda nada. Ver el [README de la raíz](../README.md) para el uso y las limitaciones conocidas.

## Comandos

```bash
npm ci
npm run dev              # servidor de desarrollo
npm run build            # genera dist/
npm run lint             # oxlint
npm run verify           # arnés de datos, en Node, sobre INSUMO/
npm run verify:browser   # arnés en Chrome real sobre dist/ (correr build antes)
```

## Cómo está armado

```
ZIP ─fflate─► PDFs ─pdf.js─► celdas con coordenadas visuales
                                 │
                            tableExtract  columnas deducidas del encabezado
                                 │
                            perfiles      rótulo del PDF → campo canónico
                                 │
                            consolidate   merge por RUT → fila de 108 columnas
                                 │
                            buildWorkbook ExcelJS → .xlsx
```

Todo corre dentro de `src/worker/pipeline.worker.js` para no congelar la interfaz. El worker de
pdf.js se crea **explícitamente** (`GlobalWorkerOptions.workerPort`): si se le deja crearlo a
pdf.js y falla, cae en su *fake worker*, que corre dentro de nuestro worker y filtra sus
`postMessage` a la ventana principal mezclados con los nuestros.

| Archivo | Responsabilidad |
| --- | --- |
| `lib/unzip.js` | Descomprime en memoria; ignora `__MACOSX/`, `._*` y `.DS_Store`. |
| `lib/pdfPages.js` | pdf.js → celdas `{x0, x1, xc, y, texto}` en coordenadas **visuales**. |
| `lib/tableExtract.js` | Encuentra la tabla y deduce las columnas del encabezado del PDF. |
| `lib/portada.js` | Empleador, folio, período y **totales de control** de la primera página. |
| `lib/perfiles.js` | Reconoce la institución y traduce sus rótulos a campos canónicos. |
| `lib/campos.js` | Vocabulario intermedio: cada campo con su regla de agregación y su columna. |
| `lib/previredLayout.js` | Las 108 columnas, en orden, con tipo y valor por defecto. |
| `lib/consolidate.js` | Merge por RUT y armado de la fila final. |
| `lib/pipeline.js` | Orquesta, detecta duplicados y compara contra los totales de control. |
| `lib/buildWorkbook.js` | Las tres hojas del `.xlsx`. |

### Detalles que no son obvios

- **Las páginas vienen rotadas 90°.** En coordenadas del PDF cada trabajador es una *columna*.
  Hay que aplicar `viewport.transform` (que ya incorpora `page.rotate`) antes de agrupar filas.
- **Todas las celdas están centradas** respecto de su columna, incluidos el RUT y el nombre. Por
  eso alcanza con asignar cada celda a la columna cuyo centro esté más cerca; no hay coordenadas
  fijas en el código.
- **Los encabezados de grupo van centrados sobre sus columnas** y no siempre se solapan con las
  de los extremos: "Movimiento de Personal" no cubre horizontalmente a "Cod.". Por eso cada
  encabezado recibe un *dominio* que llega hasta el punto medio con su vecino.
- **El pie legal contiene `Ord. N° 3673/0181`**, que calza con un `\d{2}/\d{4}` suelto. El
  período se busca por rótulo, nunca por patrón libre.
- **El cuadro "Antecedentes Generales" cae en las mismas filas visuales** que el resumen de
  montos, así que el monto es el *primer* número de la fila, no el último.
- **Un comprobante repetido se procesa una sola vez** (se identifica por folio): si no, los
  montos se sumarían dos o tres veces sin que nadie lo note.

## Agregar o corregir un perfil

En `lib/perfiles.js`, el `mapa` de cada sección va de **rótulo normalizado** (`norm()`: sin
tildes, minúsculas, sin puntuación) a campo canónico de `lib/campos.js`. Se prueban tres claves,
de la más específica a la más general:

1. todos los encabezados de agrupación + la hoja,
2. el último encabezado de agrupación + la hoja,
3. la hoja sola.

Así `"Cod."` bajo `"Movimiento de Personal"` calza con `'movimiento de personal cod'`, y
`"Nombre Afiliado"` calza con `'nombre afiliado'` aunque arriba tenga otros rótulos.

Si un campo canónico nuevo debe escribirse en el Excel, agregarlo a `CAMPOS` en `lib/campos.js`
con su `agg` (`suma`, `max`, `primero`, `minFecha`, `maxFecha`, `nombreLargo`) y la columna
destino del layout.

## Verificación

`npm run verify` no comprueba que el código compile: comprueba el **resultado**. Lee el ZIP real
y exige que la suma de lo extraído sea idéntica a **cada total que el propio comprobante
declara** en su portada, y que los RUT únicos coincidan con el "N° de Afiliados Informados".
Después genera el `.xlsx`, lo vuelve a abrir y verifica lo que quedó adentro.

`npm run verify:browser` hace lo mismo en Chrome de verdad, sobre `dist/` servido bajo el mismo
subpath de GitHub Pages: carga la página, sube el ZIP, espera el resultado, descarga el Excel, lo
revisa, comprueba que no haya errores ni recursos 404 y deja `captura-light.png` y
`captura-dark.png` para mirarlas.

Ambos salen con código 0 avisando si no existe `INSUMO/` (está en `.gitignore`) o si no hay
Chrome instalado.
